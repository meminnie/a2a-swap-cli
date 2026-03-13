import { Command } from "commander"
import { ethers } from "ethers"
import type { ActionType } from "../../types/offer"
import { loadConfig } from "../../config"
import { getEscrowContract, getErc20Contract, getSigner } from "../../contract"
import { getSupabaseClient, insertOffer } from "../../supabase"
import { resolveTokenAddress } from "../../tokens"
import { ACTION_TYPES } from "../../types/offer"

interface ProposeOptions {
  readonly action: ActionType
  readonly sell: string
  readonly buy: string
  readonly chain: string
  readonly duration: string
  readonly wallet?: string
}

export function registerProposeCommand(program: Command): void {
  program
    .command("propose")
    .description("Create a new OTC swap offer")
    .requiredOption("--sell <amount_token>", "Amount and token to sell (e.g. '1000 USDC')")
    .requiredOption("--buy <amount_token>", "Amount and token to buy (e.g. '0.5 ETH')")
    .option("--action <type>", "Action type (swap, rfq, lend, hedge, bridge)", "swap")
    .option("--chain <chain>", "Target chain", "base-sepolia")
    .option("--duration <seconds>", "Offer duration in seconds", "3600")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (options: ProposeOptions) => {
      try {
        const [sellAmount, sellToken] = options.sell.split(" ")
        const [buyAmount, buyToken] = options.buy.split(" ")

        if (!sellAmount || !sellToken || !buyAmount || !buyToken) {
          throw new Error("Invalid format. Use: --sell '1000 USDC' --buy '0.5 ETH'")
        }

        const sellNum = Number(sellAmount)
        const buyNum = Number(buyAmount)
        if (Number.isNaN(sellNum) || sellNum <= 0) {
          throw new Error(`Invalid sell amount: ${sellAmount}. Must be a positive number.`)
        }
        if (Number.isNaN(buyNum) || buyNum <= 0) {
          throw new Error(`Invalid buy amount: ${buyAmount}. Must be a positive number.`)
        }

        const duration = Number(options.duration)
        if (Number.isNaN(duration) || duration <= 0) {
          throw new Error(`Invalid duration: ${options.duration}. Must be a positive number of seconds.`)
        }
        if (duration > 30 * 24 * 60 * 60) {
          throw new Error("Duration cannot exceed 30 days.")
        }

        if (!ACTION_TYPES.includes(options.action)) {
          throw new Error(`Invalid action: ${options.action}. Supported: ${ACTION_TYPES.join(", ")}`)
        }

        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const escrow = getEscrowContract(config, signer)
        const supabase = getSupabaseClient(config)

        const sellTokenAddress = resolveTokenAddress(sellToken, options.chain)
        const buyTokenAddress = resolveTokenAddress(buyToken, options.chain)

        const sellAmountWei = ethers.parseUnits(sellAmount, 18)
        const buyAmountWei = ethers.parseUnits(buyAmount, 18)

        let nonce = await signer.getNonce()

        console.info("Creating on-chain offer...")
        const tx = await escrow.createOffer(
          sellTokenAddress,
          sellAmountWei,
          buyTokenAddress,
          buyAmountWei,
          duration,
          { nonce: nonce++ }
        )

        console.info(`Transaction sent: ${tx.hash}`)
        const receipt = await tx.wait()

        const offerCreatedEvent = receipt.logs
          .map((log: ethers.Log) => {
            try {
              return escrow.interface.parseLog({ topics: [...log.topics], data: log.data })
            } catch {
              return null
            }
          })
          .find((parsed: ethers.LogDescription | null) => parsed?.name === "OfferCreated")

        if (!offerCreatedEvent) {
          throw new Error("OfferCreated event not found in transaction receipt")
        }

        const offerId = Number(offerCreatedEvent.args.offerId)

        const sellTokenContract = getErc20Contract(sellTokenAddress, config, signer)

        console.info("Approving token transfer...")
        const approveTx = await sellTokenContract.approve(
          config.escrowAddress,
          sellAmountWei,
          { nonce: nonce++, gasLimit: 100_000 }
        )
        await approveTx.wait()

        console.info("Depositing tokens into escrow...")
        const depositTx = await escrow.deposit(offerId, { nonce: nonce++, gasLimit: 300_000 })
        console.info(`Deposit tx sent: ${depositTx.hash}`)
        await depositTx.wait()

        await insertOffer(supabase, {
          id: offerId,
          action_type: options.action,
          proposer: await signer.getAddress(),
          sell_token: sellTokenAddress,
          sell_amount: sellAmount,
          buy_token: buyTokenAddress,
          buy_amount: buyAmount,
          chain: options.chain,
          deadline: Math.floor(Date.now() / 1000) + duration,
          tx_hash: tx.hash,
        })

        console.info(`Offer created successfully:`)
        console.info(`  Offer ID: ${offerId}`)
        console.info(`  Action:   ${options.action}`)
        console.info(`  Sell:     ${sellAmount} ${sellToken}`)
        console.info(`  Buy:      ${buyAmount} ${buyToken}`)
        console.info(`  Chain:    ${options.chain}`)
        console.info(`  Duration: ${options.duration}s`)
        console.info(`  Tx:       ${tx.hash}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to create offer: ${message}`)
        process.exit(1)
      }
    })
}
