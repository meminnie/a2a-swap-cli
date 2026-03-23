import { Command } from "commander"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { pickQuote, getOffer } from "../../api"
import { parsePositiveInt } from "../validation"
import {
  type TransactionSender,
  createEoaSender,
  createGaslessSender,
} from "../../transaction-sender"
import { loadGaslessConfig, requireGasless } from "../../gasless"

interface PickOptions {
  readonly wallet?: string
  readonly gasless?: boolean
}

export function registerPickCommand(program: Command): void {
  program
    .command("pick <rfq-id> <quote-id>")
    .description("Pick a quote for your RFQ")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .option("--gasless", "Use ZeroDev Smart Account for gasless transactions")
    .action(async (rfqId: string, quoteId: string, options: PickOptions) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const parsedRfqId = parsePositiveInt(rfqId, "rfq-id")
        const parsedQuoteId = parsePositiveInt(quoteId, "quote-id")

        // 1. Fetch RFQ first (need chain for gasless SA)
        const rfq = await getOffer(parsedRfqId)
        const chain = rfq.chain ?? "base-sepolia"

        // 2. Create sender with correct chain
        let sender: TransactionSender

        if (options.gasless) {
          await requireGasless()
          const gaslessConfig = loadGaslessConfig()
          sender = await createGaslessSender(config.privateKey, gaslessConfig, chain)
          console.info(`Smart Account: ${sender.address}`)
        } else {
          sender = createEoaSender(signer)
        }

        // 3. Pick quote via API → deploys escrow
        console.info(`Picking quote #${quoteId} for RFQ #${rfqId}...`)
        const wallet = await signer.getAddress()
        const result = await pickQuote(parsedRfqId, parsedQuoteId, wallet, signer)

        console.info(`Escrow deployed: ${result.escrowAddress}`)

        // 4. Transfer tokens to escrow
        console.info("Transferring tokens to escrow...")
        const transferResult = await sender.sendErc20Transfer(
          rfq.sellToken,
          result.escrowAddress,
          BigInt(rfq.sellAmount)
        )

        console.info(`Quote picked successfully:`)
        console.info(`  RFQ ID:   ${rfqId}`)
        console.info(`  Quote ID: ${quoteId}`)
        console.info(`  Escrow:   ${result.escrowAddress}`)
        console.info(`  Tx:       ${transferResult.hash}`)
        console.info(`  Settlement will happen automatically.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to pick quote: ${message}`)
        process.exit(1)
      }
    })
}
