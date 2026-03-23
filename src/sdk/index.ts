import type { ethers } from "ethers"
import * as api from "../api"
import { setApiUrl } from "../api"

export type {
  OfferListItem,
  OfferDetail,
  CreateOfferResult,
  AcceptOfferResult,
  ReputationResult,
  CreateRfqResult,
  QuoteListItem,
  HistoryItem,
} from "../api"

export interface A2ASwapConfig {
  readonly apiUrl?: string
  readonly signer: ethers.Wallet
}

export class A2ASwap {
  private readonly signer: ethers.Wallet

  constructor(config: A2ASwapConfig) {
    if (config.apiUrl) {
      setApiUrl(config.apiUrl)
    }
    this.signer = config.signer
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
    return api.createOffer(params, this.signer)
  }

  async accept(
    offerId: number,
    buyer: string
  ): Promise<api.AcceptOfferResult> {
    return api.acceptOffer(offerId, buyer, this.signer)
  }

  async cancel(
    offerId: number,
    wallet: string
  ): Promise<{ readonly penalty: boolean; readonly scoreDelta?: number }> {
    return api.cancelOffer(offerId, wallet, this.signer)
  }

  // ── Discovery ──

  async listOffers(chain?: string): Promise<readonly api.OfferListItem[]> {
    return api.listOffers(chain)
  }

  async getOffer(id: number): Promise<api.OfferDetail> {
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
    return api.createRfq(params, this.signer)
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
    return api.submitQuote(rfqId, params, this.signer)
  }

  async listQuotes(rfqId: number): Promise<readonly api.QuoteListItem[]> {
    return api.listQuotes(rfqId)
  }

  async pickQuote(
    rfqId: number,
    quoteId: number,
    wallet: string
  ): Promise<api.AcceptOfferResult> {
    return api.pickQuote(rfqId, quoteId, wallet, this.signer)
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
