import { ethers } from "ethers"
import type { Config } from "../config"
import { getEscrowContract, getErc20Contract, getSigner } from "../contract"
import {
  getSupabaseClient,
  insertRfq,
  insertQuote,
  fetchQuotesForRfq,
  updateQuoteStatus,
  updateOfferStatus,
  subscribeQuotes,
  subscribeQuoteUpdate,
} from "../supabase"
import type { OfferRow, QuoteRow } from "../supabase"
import { resolveTokenAddress } from "../tokens"

export interface CreateRfqParams {
  readonly need: string
  readonly budget: string
  readonly chain?: string
  readonly duration?: number
}

export interface CreateRfqResult {
  readonly rfqId: number
  readonly needToken: string
  readonly needAmount: string
  readonly budgetToken: string
  readonly budgetAmount: string
  readonly chain: string
  readonly deadline: number
}

export interface SubmitQuoteParams {
  readonly rfqId: number
  readonly offer: string
}

export interface SubmitQuoteResult {
  readonly quoteId: number
  readonly rfqId: number
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
}

export interface PickQuoteResult {
  readonly escrowOfferId: number
  readonly rfqId: number
  readonly quoteId: number
  readonly depositTxHash: string
}

export async function createRfq(
  config: Config,
  params: CreateRfqParams
): Promise<CreateRfqResult> {
  const chain = params.chain ?? config.chain
  const duration = params.duration ?? 1800

  const [needAmount, needToken] = params.need.split(" ")
  const [budgetAmount, budgetToken] = params.budget.split(" ")

  if (!needAmount || !needToken || !budgetAmount || !budgetToken) {
    throw new Error("Invalid format. Use: '1 WETH' style strings")
  }

  const needNum = Number(needAmount)
  const budgetNum = Number(budgetAmount)
  if (Number.isNaN(needNum) || needNum <= 0) {
    throw new Error(`Invalid need amount: ${needAmount}`)
  }
  if (Number.isNaN(budgetNum) || budgetNum <= 0) {
    throw new Error(`Invalid budget amount: ${budgetAmount}`)
  }
  if (duration <= 0) {
    throw new Error("Invalid duration")
  }

  const signer = getSigner(config)
  const supabase = getSupabaseClient(config)
  const signerAddress = await signer.getAddress()

  const needTokenAddress = resolveTokenAddress(needToken, chain)
  const budgetTokenAddress = resolveTokenAddress(budgetToken, chain)

  const deadline = Math.floor(Date.now() / 1000) + duration

  const rfq = await insertRfq(supabase, {
    action_type: "rfq",
    proposer: signerAddress,
    buy_token: needTokenAddress,
    buy_amount: needAmount,
    sell_token: budgetTokenAddress,
    sell_amount: budgetAmount,
    chain,
    deadline,
  })

  return {
    rfqId: rfq.id,
    needToken: needTokenAddress,
    needAmount,
    budgetToken: budgetTokenAddress,
    budgetAmount,
    chain,
    deadline,
  }
}

export function watchQuotes(
  config: Config,
  rfqId: number,
  onQuote: (quote: QuoteRow) => void
): { readonly unsubscribe: () => void } {
  const supabase = getSupabaseClient(config)
  return subscribeQuotes(supabase, rfqId, onQuote)
}

export async function submitQuote(
  config: Config,
  params: SubmitQuoteParams
): Promise<SubmitQuoteResult> {
  const [offerAmount, offerToken] = params.offer.split(" ")
  if (!offerAmount || !offerToken) {
    throw new Error("Invalid offer format. Use: '1 WETH'")
  }

  const offerNum = Number(offerAmount)
  if (Number.isNaN(offerNum) || offerNum <= 0) {
    throw new Error(`Invalid offer amount: ${offerAmount}`)
  }

  const signer = getSigner(config)
  const supabase = getSupabaseClient(config)
  const signerAddress = await signer.getAddress()

  const { data: rfq, error: rfqError } = await supabase
    .from("offers")
    .select("*")
    .eq("id", params.rfqId)
    .eq("action_type", "rfq")
    .single()

  if (rfqError || !rfq) {
    throw new Error(`RFQ #${params.rfqId} not found`)
  }

  if (rfq.status !== "open") {
    throw new Error(`RFQ #${params.rfqId} is no longer open (status: ${rfq.status})`)
  }

  if (rfq.proposer.toLowerCase() === signerAddress.toLowerCase()) {
    throw new Error("Cannot quote your own RFQ")
  }

  const now = Math.floor(Date.now() / 1000)
  if (now >= rfq.deadline) {
    throw new Error("RFQ has expired")
  }

  const chain = rfq.chain as string
  const offerTokenAddress = resolveTokenAddress(offerToken, chain)

  const quote = await insertQuote(supabase, {
    rfq_id: params.rfqId,
    quoter: signerAddress,
    sell_token: offerTokenAddress,
    sell_amount: offerAmount,
    buy_token: rfq.sell_token,
    buy_amount: rfq.sell_amount,
    chain,
  })

  return {
    quoteId: quote.id,
    rfqId: params.rfqId,
    sellToken: offerTokenAddress,
    sellAmount: offerAmount,
    buyToken: rfq.sell_token,
    buyAmount: rfq.sell_amount,
  }
}

export function watchQuoteStatus(
  config: Config,
  quoteId: number,
  onUpdate: (quote: QuoteRow) => void
): { readonly unsubscribe: () => void } {
  const supabase = getSupabaseClient(config)
  return subscribeQuoteUpdate(supabase, quoteId, onUpdate)
}

export async function pickQuote(
  config: Config,
  rfqId: number,
  quoteId: number
): Promise<PickQuoteResult> {
  const signer = getSigner(config)
  const escrow = getEscrowContract(config, signer)
  const supabase = getSupabaseClient(config)
  const signerAddress = await signer.getAddress()

  const { data: rfq, error: rfqError } = await supabase
    .from("offers")
    .select("*")
    .eq("id", rfqId)
    .eq("action_type", "rfq")
    .single()

  if (rfqError || !rfq) {
    throw new Error(`RFQ #${rfqId} not found`)
  }

  if (rfq.proposer.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error("Only the RFQ creator can pick a quote")
  }

  if (rfq.status !== "open") {
    throw new Error(`RFQ #${rfqId} is no longer open`)
  }

  const quotes = await fetchQuotesForRfq(supabase, rfqId)
  const quote = quotes.find((q) => q.id === quoteId)

  if (!quote) {
    throw new Error(`Quote #${quoteId} not found or not pending`)
  }

  const sellAmountWei = ethers.parseUnits(quote.buy_amount, 18)
  const buyAmountWei = ethers.parseUnits(quote.sell_amount, 18)
  const duration = 1800

  let nonce = await signer.getNonce()

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

  const sellToken = getErc20Contract(quote.buy_token, config, signer)
  const approveTx = await sellToken.approve(
    config.escrowAddress,
    sellAmountWei,
    { nonce: nonce++, gasLimit: 100_000 }
  )
  await approveTx.wait()

  const depositTx = await escrow.deposit(offerId, { nonce: nonce++, gasLimit: 300_000 })
  await depositTx.wait()

  await updateQuoteStatus(supabase, quoteId, "accepted", offerId)
  await updateOfferStatus(supabase, rfqId, "accepted")

  for (const q of quotes) {
    if (q.id !== quoteId) {
      await updateQuoteStatus(supabase, q.id, "rejected")
    }
  }

  return {
    escrowOfferId: offerId,
    rfqId,
    quoteId,
    depositTxHash: depositTx.hash,
  }
}
