import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { pickQuote, getOffer } from "../../api"

interface PickOptions {
  readonly wallet?: string
}

export function registerPickCommand(program: Command): void {
  program
    .command("pick <rfq-id> <quote-id>")
    .description("Pick a quote for your RFQ")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (rfqId: string, quoteId: string, options: PickOptions) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)

        // 1. Pick quote via API → deploys escrow
        console.info(`Picking quote #${quoteId} for RFQ #${rfqId}...`)
        const result = await pickQuote(Number(rfqId), Number(quoteId))

        console.info(`Escrow deployed: ${result.escrowAddress}`)

        // 2. Get RFQ details to transfer tokens
        const rfq = await getOffer(Number(rfqId))
        const sellToken = rfq.sellToken as string
        const sellAmount = rfq.sellAmount as string

        const sellTokenContract = new ethers.Contract(
          sellToken,
          ["function transfer(address to, uint256 amount) returns (bool)"],
          signer
        )

        console.info("Transferring tokens to escrow...")
        const tx = await sellTokenContract.transfer(
          result.escrowAddress,
          BigInt(sellAmount)
        )
        await tx.wait()

        console.info(`Quote picked successfully:`)
        console.info(`  RFQ ID:   ${rfqId}`)
        console.info(`  Quote ID: ${quoteId}`)
        console.info(`  Escrow:   ${result.escrowAddress}`)
        console.info(`  Tx:       ${tx.hash}`)
        console.info(`  Settlement will happen automatically.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to pick quote: ${message}`)
        process.exit(1)
      }
    })
}
