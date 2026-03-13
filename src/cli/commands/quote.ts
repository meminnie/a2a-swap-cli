import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getEscrowContract, getErc20Contract, getSigner } from "../../contract"
import {
  getSupabaseClient,
  insertQuote,
  subscribeQuoteUpdate,
  updateOfferStatus,
} from "../../supabase"
import type { QuoteRow } from "../../supabase"
import { resolveTokenAddress, getTokenSymbol } from "../../tokens"

interface QuoteOptions {
  readonly offer: string
  readonly wallet?: string
}

async function autoAcceptEscrow(
  quote: QuoteRow,
  config: ReturnType<typeof loadConfig>,
  signer: ethers.Wallet,
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<void> {
  const escrowOfferId = quote.escrow_offer_id
  if (escrowOfferId === null) {
    console.error("  [ERROR] Quote accepted but no escrow_offer_id found")
    return
  }

  const escrow = getEscrowContract(config, signer)
  const signerAddress = await signer.getAddress()

  const offer = await escrow.getOffer(escrowOfferId)
  if (Number(offer.status) !== 0) {
    console.info("  [SKIP] Escrow offer is no longer open")
    return
  }

  let nonce = await signer.getNonce()

  console.info("  Accepting escrow offer on-chain...")
  const acceptTx = await escrow.acceptOffer(escrowOfferId, { nonce: nonce++ })
  await acceptTx.wait()

  await updateOfferStatus(supabase, escrowOfferId, "accepted", signerAddress)

  const buyToken = getErc20Contract(offer.buyToken, config, signer)
  const buyAmount: bigint = offer.buyAmount

  console.info("  Approving token transfer...")
  const approveTx = await buyToken.approve(
    config.escrowAddress,
    buyAmount,
    { nonce: nonce++, gasLimit: 100_000 }
  )
  await approveTx.wait()

  console.info("  Depositing tokens into escrow...")
  const depositTx = await escrow.deposit(escrowOfferId, { nonce: nonce++, gasLimit: 300_000 })
  await depositTx.wait()

  const updatedOffer = await escrow.getOffer(escrowOfferId)
  const settled = Number(updatedOffer.status) === 2

  if (settled) {
    await updateOfferStatus(supabase, escrowOfferId, "settled")
    console.info(`  Swap settled! tx: ${depositTx.hash}`)
  } else {
    console.info(`  Deposited. Waiting for counterparty. tx: ${depositTx.hash}`)
  }
}

export function registerQuoteCommand(program: Command): void {
  program
    .command("quote <rfq-id>")
    .description("Submit a quote for an RFQ — offer your price, auto-accept when picked")
    .requiredOption("--offer <amount_token>", "What you're offering (e.g. '1 WETH')")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (rfqId: string, options: QuoteOptions) => {
      try {
        const id = Number(rfqId)
        if (Number.isNaN(id) || id < 0) {
          throw new Error("Invalid RFQ ID.")
        }

        const [offerAmount, offerToken] = options.offer.split(" ")
        if (!offerAmount || !offerToken) {
          throw new Error("Invalid format. Use: --offer '1 WETH'")
        }

        const offerNum = Number(offerAmount)
        if (Number.isNaN(offerNum) || offerNum <= 0) {
          throw new Error(`Invalid offer amount: ${offerAmount}. Must be a positive number.`)
        }

        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const supabase = getSupabaseClient(config)
        const signerAddress = await signer.getAddress()

        // Fetch the RFQ
        const { data: rfq, error: rfqError } = await supabase
          .from("offers")
          .select("*")
          .eq("id", id)
          .eq("action_type", "rfq")
          .single()

        if (rfqError || !rfq) {
          throw new Error(`RFQ #${id} not found.`)
        }

        if (rfq.status !== "open") {
          throw new Error(`RFQ #${id} is no longer open (status: ${rfq.status}).`)
        }

        if (rfq.proposer.toLowerCase() === signerAddress.toLowerCase()) {
          throw new Error("Cannot quote your own RFQ.")
        }

        const now = Math.floor(Date.now() / 1000)
        if (now >= rfq.deadline) {
          throw new Error("RFQ has expired.")
        }

        const chain = rfq.chain as string
        const offerTokenAddress = resolveTokenAddress(offerToken, chain)

        // Submit quote to Supabase
        const quote = await insertQuote(supabase, {
          rfq_id: id,
          quoter: signerAddress,
          sell_token: offerTokenAddress,
          sell_amount: offerAmount,
          buy_token: rfq.sell_token,
          buy_amount: rfq.sell_amount,
          chain,
        })

        const needSymbol = getTokenSymbol(rfq.buy_token, chain) ?? "?"
        const budgetSymbol = getTokenSymbol(rfq.sell_token, chain) ?? "?"

        console.info("Quote submitted:")
        console.info(`  Quote ID: ${quote.id}`)
        console.info(`  RFQ #${id}: needs ${rfq.buy_amount} ${needSymbol}, budget ${rfq.sell_amount} ${budgetSymbol}`)
        console.info(`  Your offer: ${offerAmount} ${offerToken} for ${rfq.sell_amount} ${budgetSymbol}`)
        console.info(`\nWaiting for pick — will auto-accept when selected...\n`)

        // Watch for quote to be accepted (picked)
        subscribeQuoteUpdate(supabase, quote.id, async (updatedQuote) => {
          if (updatedQuote.status === "accepted") {
            console.info(`[PICKED] Your quote #${quote.id} was selected!`)
            try {
              await autoAcceptEscrow(updatedQuote, config, signer, supabase)
              process.exit(0)
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown error"
              console.error(`  [ERROR] Auto-accept failed: ${message}`)
              process.exit(1)
            }
          } else if (updatedQuote.status === "rejected") {
            console.info(`[REJECTED] Your quote #${quote.id} was not selected.`)
            process.exit(0)
          }
        })

        await new Promise(() => {})
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to submit quote: ${message}`)
        process.exit(1)
      }
    })
}
