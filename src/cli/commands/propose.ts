import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { resolveTokenAddress, isNativeToken, getWethAddress } from "../../tokens"
import { createOffer } from "../../api"
import { wrapETH } from "../../weth"
import { pollAndUnwrap } from "../../poll"
import {
  type TransactionSender,
  createEoaSender,
  createGaslessSender,
} from "../../transaction-sender"
import { loadGaslessConfig, requireGasless } from "../../gasless"
import { fundAndWrapETH } from "../../gasless/wrap-helper"
import { createSmartAccount } from "../../gasless/account"

interface ProposeOptions {
  readonly sell: string
  readonly buy: string
  readonly chain: string
  readonly duration: string
  readonly minScore: string
  readonly wallet?: string
  readonly gasless?: boolean
}

export function registerProposeCommand(program: Command): void {
  program
    .command("propose")
    .description("Create a new OTC swap offer")
    .requiredOption("--sell <amount_token>", "Amount and token to sell (e.g. '1000 USDC')")
    .requiredOption("--buy <amount_token>", "Amount and token to buy (e.g. '0.5 ETH')")
    .option("--chain <chain>", "Target chain", "base-sepolia")
    .option("--duration <seconds>", "Offer duration in seconds", "3600")
    .option("--min-score <score>", "Minimum buyer reputation score", "0")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .option("--gasless", "Use ZeroDev Smart Account for gasless transactions")
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
          throw new Error(`Invalid sell amount: ${sellAmount}`)
        }
        if (Number.isNaN(buyNum) || buyNum <= 0) {
          throw new Error(`Invalid buy amount: ${buyAmount}`)
        }

        const duration = Number(options.duration)
        if (Number.isNaN(duration) || duration <= 0 || duration > 30 * 24 * 60 * 60) {
          throw new Error("Duration must be 1s ~ 30 days")
        }

        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const sellerAddress = await signer.getAddress()

        let sender: TransactionSender
        let onChainAddress: string | undefined

        if (options.gasless) {
          await requireGasless()
          const gaslessConfig = loadGaslessConfig()
          sender = await createGaslessSender(config.privateKey, gaslessConfig, options.chain)
          onChainAddress = sender.address
          console.info(`Smart Account: ${onChainAddress}`)
        } else {
          sender = createEoaSender(signer)
        }

        const sellTokenAddress = resolveTokenAddress(sellToken, options.chain)
        const buyTokenAddress = resolveTokenAddress(buyToken, options.chain)
        const sellAmountWei = ethers.parseUnits(sellAmount, 18)
        const buyAmountWei = ethers.parseUnits(buyAmount, 18)

        // 1. Create offer via API → get escrow address
        console.info("Creating offer...")
        const result = await createOffer({
          seller: sellerAddress,
          onChainAddress,
          sellToken: sellTokenAddress,
          sellAmount: sellAmountWei.toString(),
          buyToken: buyTokenAddress,
          buyAmount: buyAmountWei.toString(),
          minScore: Number(options.minScore),
          deadlineSeconds: duration,
        }, signer)

        console.info(`Offer #${result.offerId} created`)
        console.info(`  Escrow address: ${result.escrowAddress}`)
        console.info(`  Deadline: ${result.deadline}`)

        // 2. Wrap ETH if native token, then transfer to escrow
        if (isNativeToken(sellToken)) {
          if (options.gasless) {
            const gaslessConfig = loadGaslessConfig()
            const { kernelClient } = await createSmartAccount(config.privateKey, gaslessConfig, options.chain)
            await fundAndWrapETH(signer, sender.address, kernelClient, getWethAddress(options.chain), sellAmountWei)
          } else {
            console.info("Wrapping ETH → WETH...")
            await wrapETH(signer, getWethAddress(options.chain), sellAmountWei)
          }
        }

        console.info("Transferring tokens to escrow address...")
        const transferResult = await sender.sendErc20Transfer(
          sellTokenAddress,
          result.escrowAddress,
          sellAmountWei
        )

        console.info(`Offer created successfully:`)
        console.info(`  Offer ID: ${result.offerId}`)
        console.info(`  Sell:     ${sellAmount} ${sellToken}`)
        console.info(`  Buy:      ${buyAmount} ${buyToken}`)
        console.info(`  Min Score: ${options.minScore}`)
        console.info(`  Escrow:   ${result.escrowAddress}`)
        console.info(`  Tx:       ${transferResult.hash}`)

        // 3. If seller expects to receive ETH, poll for settlement and auto-unwrap
        if (isNativeToken(buyToken)) {
          console.info("  Waiting for settlement to auto-unwrap WETH → ETH...")
          console.info("  (Press Ctrl+C to skip — you can unwrap manually later)")
          await pollAndUnwrap(result.offerId, signer, getWethAddress(options.chain), buyAmountWei)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to create offer: ${message}`)
        process.exit(1)
      }
    })
}
