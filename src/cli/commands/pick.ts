import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getEscrowContract, getErc20Contract, getSigner } from "../../contract"
import {
  getSupabaseClient,
  fetchQuotesForRfq,
  updateQuoteStatus,
  updateOfferStatus,
} from "../../supabase"
import { getTokenSymbol } from "../../tokens"

interface PickOptions {
  readonly wallet?: string
}

export function registerPickCommand(program: Command): void {
  program
    .command("pick <rfq-id> <quote-id>")
    .description("Pick a quote from an RFQ and create on-chain escrow swap")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (rfqId: string, quoteId: string, options: PickOptions) => {
      try {
        const rfqIdNum = Number(rfqId)
        const quoteIdNum = Number(quoteId)
        if (Number.isNaN(rfqIdNum) || Number.isNaN(quoteIdNum)) {
          throw new Error("Invalid RFQ ID or Quote ID.")
        }

        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const escrow = getEscrowContract(config, signer)
        const supabase = getSupabaseClient(config)
        const signerAddress = await signer.getAddress()

        // Fetch RFQ
        const { data: rfq, error: rfqError } = await supabase
          .from("offers")
          .select("*")
          .eq("id", rfqIdNum)
          .eq("action_type", "rfq")
          .single()

        if (rfqError || !rfq) {
          throw new Error(`RFQ #${rfqIdNum} not found.`)
        }

        if (rfq.proposer.toLowerCase() !== signerAddress.toLowerCase()) {
          throw new Error("Only the RFQ creator can pick a quote.")
        }

        if (rfq.status !== "open") {
          throw new Error(`RFQ #${rfqIdNum} is no longer open.`)
        }

        // Fetch the specific quote
        const quotes = await fetchQuotesForRfq(supabase, rfqIdNum)
        const quote = quotes.find((q) => q.id === quoteIdNum)

        if (!quote) {
          throw new Error(`Quote #${quoteIdNum} not found or not pending.`)
        }

        const chain = rfq.chain as string
        const sellSymbol = getTokenSymbol(quote.buy_token, chain) ?? quote.buy_token.slice(0, 10)
        const buySymbol = getTokenSymbol(quote.sell_token, chain) ?? quote.sell_token.slice(0, 10)

        console.info(`Picking quote #${quoteIdNum}:`)
        console.info(`  You sell: ${quote.buy_amount} ${sellSymbol}`)
        console.info(`  You get:  ${quote.sell_amount} ${buySymbol}`)

        // Create on-chain escrow offer
        // RFQ requester is the proposer: sells budget token, buys needed token
        const sellAmountWei = ethers.parseUnits(quote.buy_amount, 18)
        const buyAmountWei = ethers.parseUnits(quote.sell_amount, 18)
        const duration = 1800 // 30 min to complete the swap

        let nonce = await signer.getNonce()

        console.info("\nCreating on-chain offer...")
        const tx = await escrow.createOffer(
          quote.buy_token,
          sellAmountWei,
          quote.sell_token,
          buyAmountWei,
          duration,
          { nonce: nonce++ }
        )
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
          throw new Error("OfferCreated event not found")
        }

        const offerId = Number(offerCreatedEvent.args.offerId)

        // Approve + deposit proposer tokens
        const sellToken = getErc20Contract(quote.buy_token, config, signer)

        console.info("Approving token transfer...")
        const approveTx = await sellToken.approve(
          config.escrowAddress,
          sellAmountWei,
          { nonce: nonce++, gasLimit: 100_000 }
        )
        await approveTx.wait()

        console.info("Depositing tokens into escrow...")
        const depositTx = await escrow.deposit(offerId, { nonce: nonce++, gasLimit: 300_000 })
        await depositTx.wait()

        // Update statuses — include escrow offer ID so quoter can auto-accept
        await updateQuoteStatus(supabase, quoteIdNum, "accepted", offerId)
        await updateOfferStatus(supabase, rfqIdNum, "accepted")

        // Reject other pending quotes
        for (const q of quotes) {
          if (q.id !== quoteIdNum) {
            await updateQuoteStatus(supabase, q.id, "rejected")
          }
        }

        console.info(`\nEscrow offer created from RFQ:`)
        console.info(`  Escrow Offer ID: ${offerId}`)
        console.info(`  RFQ:     #${rfqIdNum}`)
        console.info(`  Quote:   #${quoteIdNum}`)
        console.info(`  Tx:      ${depositTx.hash}`)
        console.info(`\nQuoter (${quote.quoter.slice(0, 6)}...${quote.quoter.slice(-4)}) will auto-accept shortly.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to pick quote: ${message}`)
        process.exit(1)
      }
    })
}
