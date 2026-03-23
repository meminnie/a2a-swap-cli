import { Command } from "commander"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { acceptOffer, getOffer } from "../../api"
import { getWethAddress } from "../../tokens"
import { wrapETH } from "../../weth"
import { pollAndUnwrap } from "../../poll"
import { parsePositiveInt } from "../validation"
import {
  type TransactionSender,
  createEoaSender,
  createGaslessSender,
} from "../../transaction-sender"
import { loadGaslessConfig, requireGasless } from "../../gasless"
import { fundAndWrapETH } from "../../gasless/wrap-helper"

interface AcceptOptions {
  readonly wallet?: string
  readonly gasless?: boolean
}

export function registerAcceptCommand(program: Command): void {
  program
    .command("accept <offer-id>")
    .description("Accept an open offer")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .option("--gasless", "Use ZeroDev Smart Account for gasless transactions")
    .action(async (offerId: string, options: AcceptOptions) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const buyerAddress = await signer.getAddress()

        // 1. Get offer details first (need chain for gasless SA)
        console.info(`Fetching offer #${offerId}...`)
        const id = parsePositiveInt(offerId, "offer-id")
        const offer = await getOffer(id)
        const chain = offer.chain ?? "base-sepolia"

        // 2. Create sender with correct chain
        let sender: TransactionSender
        let onChainAddress: string | undefined

        if (options.gasless) {
          await requireGasless()
          const gaslessConfig = loadGaslessConfig()
          sender = await createGaslessSender(config.privateKey, gaslessConfig, chain)
          onChainAddress = sender.address
          console.info(`Smart Account: ${onChainAddress}`)
        } else {
          sender = createEoaSender(signer)
        }

        // 3. Accept via API → triggers contract deployment
        console.info("Accepting offer (deploying escrow)...")
        const result = await acceptOffer(id, buyerAddress, signer, onChainAddress)

        console.info(`Escrow deployed: ${result.escrowAddress}`)
        console.info(`Deposit deadline: ${result.depositDeadline}`)

        // 4. Wrap ETH if buyer is paying with native token
        const buyAmount = BigInt(offer.buyAmount)
        const wethAddress = getWethAddress(chain)
        const isBuyNative = offer.buyToken.toLowerCase() === wethAddress.toLowerCase()

        if (isBuyNative) {
          if (options.gasless && sender.kernelClient) {
            await fundAndWrapETH(signer, sender.address, sender.kernelClient, wethAddress, buyAmount)
          } else {
            console.info("Wrapping ETH → WETH...")
            await wrapETH(signer, wethAddress, buyAmount)
          }
        }

        // 5. Transfer buy tokens to deployed escrow
        console.info("Transferring tokens to escrow...")
        const transferResult = await sender.sendErc20Transfer(
          offer.buyToken,
          result.escrowAddress,
          buyAmount
        )

        console.info(`Offer accepted successfully:`)
        console.info(`  Offer ID: ${offerId}`)
        console.info(`  Escrow:   ${result.escrowAddress}`)
        console.info(`  Tx:       ${transferResult.hash}`)

        // 6. Poll for settlement, then auto-unwrap if receiving WETH
        const sellToken = offer.sellToken.toLowerCase()
        const willReceiveWeth = sellToken === wethAddress.toLowerCase()
        const sellAmount = BigInt(offer.sellAmount)

        if (willReceiveWeth || isBuyNative) {
          const unwrapAmount = willReceiveWeth ? sellAmount : buyAmount
          console.info("  Waiting for settlement to auto-unwrap WETH → ETH...")
          console.info("  (Press Ctrl+C to skip — you can unwrap manually later)")
          await pollAndUnwrap(id, signer, wethAddress, unwrapAmount)
        } else {
          console.info("  Settlement will happen automatically.")
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to accept offer: ${message}`)
        process.exit(1)
      }
    })
}
