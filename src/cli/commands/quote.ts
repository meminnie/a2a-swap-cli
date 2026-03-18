import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { resolveTokenAddress } from "../../tokens"
import { submitQuote } from "../../api"

interface QuoteOptions {
  readonly offer: string
  readonly chain: string
  readonly wallet?: string
}

export function registerQuoteCommand(program: Command): void {
  program
    .command("quote <rfq-id>")
    .description("Submit a quote for an RFQ")
    .requiredOption("--offer <amount_token>", "Your offer (e.g. '0.5 ETH')")
    .option("--chain <chain>", "Target chain", "base-sepolia")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (rfqId: string, options: QuoteOptions) => {
      try {
        const [offerAmount, offerToken] = options.offer.split(" ")

        if (!offerAmount || !offerToken) {
          throw new Error("Invalid format. Use: --offer '0.5 ETH'")
        }

        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const quoterAddress = await signer.getAddress()

        const sellTokenAddress = resolveTokenAddress(offerToken, options.chain)
        const sellAmountWei = ethers.parseUnits(offerAmount, 18)

        console.info("Submitting quote...")
        const result = await submitQuote(Number(rfqId), {
          quoter: quoterAddress,
          sellToken: sellTokenAddress,
          sellAmount: sellAmountWei.toString(),
          buyToken: sellTokenAddress, // will be filled from RFQ context
          buyAmount: sellAmountWei.toString(),
        })

        console.info(`Quote submitted:`)
        console.info(`  Quote ID: ${result.quoteId}`)
        console.info(`  RFQ ID:   ${rfqId}`)
        console.info(`  Offer:    ${offerAmount} ${offerToken}`)
        console.info(`  Waiting to be picked...`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to submit quote: ${message}`)
        process.exit(1)
      }
    })
}
