import * as api from "../api"

export type {
  OfferListItem,
  CreateOfferResult,
  AcceptOfferResult,
  ReputationResult,
  CreateRfqResult,
  QuoteListItem,
  HistoryItem,
} from "../api"

export interface ZeroOTCConfig {
  readonly apiUrl?: string
}

export class ZeroOTC {
  constructor(config?: ZeroOTCConfig) {
    if (config?.apiUrl) {
      process.env.API_URL = config.apiUrl
    }
  }

  // ── Swap ──

  async propose(params: {
    readonly seller: string
    readonly sellToken: string
    readonly sellAmount: string
    readonly buyToken: string
    readonly buyAmount: string
    readonly minScore?: number
    readonly deadlineSeconds?: number
  }): Promise<api.CreateOfferResult> {
    return api.createOffer(params)
  }

  async accept(
    offerId: number,
    buyer: string
  ): Promise<api.AcceptOfferResult> {
    return api.acceptOffer(offerId, buyer)
  }

  async cancel(
    offerId: number,
    wallet: string
  ): Promise<{ readonly penalty: boolean; readonly scoreDelta?: number }> {
    return api.cancelOffer(offerId, wallet)
  }

  // ── Discovery ──

  async listOffers(chain?: string): Promise<readonly api.OfferListItem[]> {
    return api.listOffers(chain)
  }

  async getOffer(id: number): Promise<Record<string, unknown>> {
    return api.getOffer(id)
  }

  // ── RFQ ──

  async createRfq(params: {
    readonly seller: string
    readonly sellToken: string
    readonly sellAmount: string
    readonly buyToken: string
    readonly buyAmount: string
    readonly minScore?: number
    readonly deadlineSeconds?: number
  }): Promise<api.CreateRfqResult> {
    return api.createRfq(params)
  }

  async submitQuote(
    rfqId: number,
    params: {
      readonly quoter: string
      readonly sellToken: string
      readonly sellAmount: string
      readonly buyToken: string
      readonly buyAmount: string
    }
  ): Promise<{ readonly quoteId: number }> {
    return api.submitQuote(rfqId, params)
  }

  async listQuotes(rfqId: number): Promise<readonly api.QuoteListItem[]> {
    return api.listQuotes(rfqId)
  }

  async pickQuote(
    rfqId: number,
    quoteId: number
  ): Promise<api.AcceptOfferResult> {
    return api.pickQuote(rfqId, quoteId)
  }

  // ── History ──

  async getHistory(
    wallet: string,
    limit?: number
  ): Promise<readonly api.HistoryItem[]> {
    return api.fetchHistory(wallet, limit)
  }

  // ── Reputation ──

  async getReputation(wallet: string): Promise<api.ReputationResult> {
    return api.getReputation(wallet)
  }
}
