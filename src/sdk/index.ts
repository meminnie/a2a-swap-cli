import type { Config } from "../config"
import { loadConfig } from "../config"
import { getSigner } from "../contract"
import { getSupabaseClient, fetchOpenOffers, fetchHistory, subscribeOffers } from "../supabase"
import type { OfferRow, QuoteRow } from "../supabase"
import { evaluateOffer } from "../policy"
import type { PolicyConfig, PolicyResult } from "../policy"
import { fetchTokenPrice, fetchPairRate } from "../oracle"
import { propose, accept, refund, claimDepositTimeout } from "./swap"
import type { ProposeParams, ProposeResult, AcceptResult, RefundResult, DepositTimeoutResult } from "./swap"
import { createRfq, submitQuote, pickQuote, watchQuotes, watchQuoteStatus } from "./rfq"
import type {
  CreateRfqParams,
  CreateRfqResult,
  SubmitQuoteParams,
  SubmitQuoteResult,
  PickQuoteResult,
} from "./rfq"

export type {
  Config,
  ProposeParams,
  ProposeResult,
  AcceptResult,
  RefundResult,
  DepositTimeoutResult,
  CreateRfqParams,
  CreateRfqResult,
  SubmitQuoteParams,
  SubmitQuoteResult,
  PickQuoteResult,
  PolicyConfig,
  PolicyResult,
  OfferRow,
  QuoteRow,
}

export { loadConfig }

export class ZeroOTC {
  readonly config: Config

  constructor(config: Config) {
    this.config = config
  }

  static fromEnv(wallet?: string): ZeroOTC {
    return new ZeroOTC(loadConfig(wallet))
  }

  // ── Swap ──

  async propose(params: ProposeParams): Promise<ProposeResult> {
    return propose(this.config, params)
  }

  async accept(offerId: number): Promise<AcceptResult> {
    return accept(this.config, offerId)
  }

  async refund(offerId: number): Promise<RefundResult> {
    return refund(this.config, offerId)
  }

  async claimDepositTimeout(offerId: number): Promise<DepositTimeoutResult> {
    return claimDepositTimeout(this.config, offerId)
  }

  // ── Discovery ──

  async listOffers(chain?: string, actionType?: "swap" | "rfq"): Promise<ReadonlyArray<OfferRow>> {
    const supabase = getSupabaseClient(this.config)
    return fetchOpenOffers(supabase, chain ?? this.config.chain, actionType ?? "swap")
  }

  async history(limit?: number): Promise<ReadonlyArray<OfferRow>> {
    const supabase = getSupabaseClient(this.config)
    const signer = getSigner(this.config)
    const address = await signer.getAddress()
    return fetchHistory(supabase, address, limit ?? 20)
  }

  watch(
    onInsert: (offer: OfferRow) => void,
    onUpdate?: (offer: OfferRow) => void
  ): { readonly unsubscribe: () => void } {
    const supabase = getSupabaseClient(this.config)
    return subscribeOffers(supabase, onInsert, onUpdate)
  }

  // ── RFQ ──

  async createRfq(params: CreateRfqParams): Promise<CreateRfqResult> {
    return createRfq(this.config, params)
  }

  async submitQuote(params: SubmitQuoteParams): Promise<SubmitQuoteResult> {
    return submitQuote(this.config, params)
  }

  async pickQuote(rfqId: number, quoteId: number): Promise<PickQuoteResult> {
    return pickQuote(this.config, rfqId, quoteId)
  }

  watchQuotes(
    rfqId: number,
    onQuote: (quote: QuoteRow) => void
  ): { readonly unsubscribe: () => void } {
    return watchQuotes(this.config, rfqId, onQuote)
  }

  watchQuoteStatus(
    quoteId: number,
    onUpdate: (quote: QuoteRow) => void
  ): { readonly unsubscribe: () => void } {
    return watchQuoteStatus(this.config, quoteId, onUpdate)
  }

  // ── Oracle & Policy ──

  async getPrice(symbol: string): Promise<{ readonly token: string; readonly priceUsd: number }> {
    return fetchTokenPrice(symbol)
  }

  async getPairRate(sellSymbol: string, buySymbol: string): Promise<number> {
    return fetchPairRate(sellSymbol, buySymbol)
  }

  async evaluateOffer(
    offer: {
      readonly sellToken: string
      readonly sellAmount: string
      readonly buyToken: string
      readonly buyAmount: string
      readonly chain?: string
    },
    maxSlippagePct?: number
  ): Promise<PolicyResult> {
    return evaluateOffer(
      {
        sell_token: offer.sellToken,
        sell_amount: offer.sellAmount,
        buy_token: offer.buyToken,
        buy_amount: offer.buyAmount,
      },
      {
        maxSlippagePct: maxSlippagePct ?? 1,
        minTrustScore: this.config.minTrustScore,
        chain: offer.chain ?? this.config.chain,
      }
    )
  }
}
