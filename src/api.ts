import * as dotenv from "dotenv"
import type { ethers } from "ethers"
import { signRequest } from "./sign"

dotenv.config()

let apiUrlOverride: string | undefined

export function setApiUrl(url: string): void {
  apiUrlOverride = url
}

function getApiUrl(): string {
  return apiUrlOverride ?? process.env.API_URL ?? "http://localhost:8080"
}

interface ApiResponse<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: string
}

interface SignedRequestOptions extends RequestInit {
  readonly signer?: ethers.Wallet
}

async function request<T>(
  path: string,
  options?: SignedRequestOptions
): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> }
  if (options?.body) {
    headers["Content-Type"] = "application/json"
  }

  if (options?.signer && options?.body) {
    const bodyObj = JSON.parse(options.body as string)
    const { signature, timestamp } = await signRequest(options.signer, bodyObj)
    headers["x-signature"] = signature
    headers["x-timestamp"] = timestamp
  }

  const { signer: _signer, ...fetchOptions } = options ?? {}

  const res = await fetch(`${getApiUrl()}${path}`, {
    ...fetchOptions,
    headers,
  })

  const body = (await res.json()) as ApiResponse<T>

  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `API error: ${res.status}`)
  }

  return body.data as T
}

// --- Offers ---

export interface OfferListItem {
  readonly id: number
  readonly seller: string
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
  readonly escrowAddress: string
  readonly minScore: number
  readonly deadline: string
  readonly sellerScore: number
}

export interface CreateOfferResult {
  readonly offerId: number
  readonly escrowAddress: string
  readonly deadline: string
  readonly nonce: number
}

export interface AcceptOfferResult {
  readonly escrowAddress: string
  readonly txHash: string
  readonly depositDeadline: string
}

export async function createOffer(
  params: {
    readonly seller: string
    readonly sellToken: string
    readonly sellAmount: string
    readonly buyToken: string
    readonly buyAmount: string
    readonly minScore?: number
    readonly deadlineSeconds?: number
  },
  signer: ethers.Wallet
): Promise<CreateOfferResult> {
  return request<CreateOfferResult>("/offers", {
    method: "POST",
    body: JSON.stringify(params),
    signer,
  })
}

export async function listOffers(
  chain?: string
): Promise<readonly OfferListItem[]> {
  const query = chain ? `?chain=${chain}` : ""
  return request<readonly OfferListItem[]>(`/offers${query}`)
}

export interface OfferDetail {
  readonly id: number
  readonly seller: string
  readonly buyer: string | null
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
  readonly status: string
  readonly escrowAddress: string
  readonly minScore: number
  readonly deadline: string
  readonly nonce: number
  readonly txHash: string | null
  readonly chain: string
  readonly createdAt: string
  readonly sellerScore: number
  readonly buyerScore: number | null
}

export async function getOffer(id: number): Promise<OfferDetail> {
  return request<OfferDetail>(`/offers/${id}`)
}

export async function acceptOffer(
  id: number,
  buyer: string,
  signer: ethers.Wallet
): Promise<AcceptOfferResult> {
  return request<AcceptOfferResult>(`/offers/${id}/accept`, {
    method: "POST",
    body: JSON.stringify({ buyer }),
    signer,
  })
}

export async function cancelOffer(
  id: number,
  wallet: string,
  signer: ethers.Wallet
): Promise<{ readonly penalty: boolean; readonly scoreDelta?: number }> {
  return request(`/offers/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ wallet }),
    signer,
  })
}

// --- History ---

export interface HistoryItem {
  readonly id: number
  readonly seller: string
  readonly buyer: string | null
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
  readonly status: string
  readonly chain: string
  readonly createdAt: string
}

export async function fetchHistory(
  wallet: string,
  limit: number = 20
): Promise<readonly HistoryItem[]> {
  return request<readonly HistoryItem[]>(
    `/offers/history?wallet=${wallet}&limit=${limit}`
  )
}

// --- Reputation ---

export interface ReputationResult {
  readonly wallet: string
  readonly successfulSwaps: number
  readonly failedSwaps: number
  readonly cancellations: number
  readonly score: number
}

export async function getReputation(
  wallet: string
): Promise<ReputationResult> {
  return request<ReputationResult>(`/reputation/${wallet}`)
}

// --- RFQ ---

export interface CreateRfqResult {
  readonly rfqId: number
  readonly deadline: string
}

export interface QuoteListItem {
  readonly id: number
  readonly quoter: string
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
  readonly status: string
  readonly quoterScore: number
}

export async function createRfq(
  params: {
    readonly seller: string
    readonly sellToken: string
    readonly sellAmount: string
    readonly buyToken: string
    readonly buyAmount: string
    readonly minScore?: number
    readonly deadlineSeconds?: number
  },
  signer: ethers.Wallet
): Promise<CreateRfqResult> {
  return request<CreateRfqResult>("/rfq", {
    method: "POST",
    body: JSON.stringify(params),
    signer,
  })
}

export async function submitQuote(
  rfqId: number,
  params: {
    readonly quoter: string
    readonly sellToken: string
    readonly sellAmount: string
    readonly buyToken: string
    readonly buyAmount: string
  },
  signer: ethers.Wallet
): Promise<{ readonly quoteId: number }> {
  return request(`/rfq/${rfqId}/quote`, {
    method: "POST",
    body: JSON.stringify(params),
    signer,
  })
}

export async function listQuotes(
  rfqId: number
): Promise<readonly QuoteListItem[]> {
  return request<readonly QuoteListItem[]>(`/rfq/${rfqId}/quotes`)
}

export async function pickQuote(
  rfqId: number,
  quoteId: number,
  wallet: string,
  signer: ethers.Wallet
): Promise<AcceptOfferResult> {
  return request<AcceptOfferResult>(`/rfq/${rfqId}/pick/${quoteId}`, {
    method: "POST",
    body: JSON.stringify({ wallet }),
    signer,
  })
}
