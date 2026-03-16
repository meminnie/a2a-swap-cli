import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type { ServerConfig } from "./config"

export interface OfferRow {
  readonly id: number
  readonly seller: string
  readonly buyer: string | null
  readonly sell_token: string
  readonly sell_amount: string
  readonly buy_token: string
  readonly buy_amount: string
  readonly action_type: string
  readonly chain: string
  readonly status: string
  readonly escrow_address: string | null
  readonly nonce: number | null
  readonly deadline: string
  readonly min_score: number
  readonly tx_hash: string | null
  readonly created_at: string
}

export interface QuoteRow {
  readonly id: number
  readonly rfq_id: number
  readonly quoter: string
  readonly sell_token: string
  readonly sell_amount: string
  readonly buy_token: string
  readonly buy_amount: string
  readonly chain: string
  readonly status: string
  readonly created_at: string
}

export interface ReputationRow {
  readonly wallet: string
  readonly successful_swaps: number
  readonly failed_swaps: number
  readonly cancellations: number
  readonly score: number
  readonly updated_at: string
}

export function createSupabaseClient(config: ServerConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey)
}

export async function insertOffer(
  supabase: SupabaseClient,
  offer: {
    readonly seller: string
    readonly sell_token: string
    readonly sell_amount: string
    readonly buy_token: string
    readonly buy_amount: string
    readonly action_type?: string
    readonly chain: string
    readonly escrow_address?: string
    readonly nonce?: number
    readonly deadline: string
    readonly min_score: number
  }
): Promise<OfferRow> {
  const { data, error } = await supabase
    .from("offers_v2")
    .insert({
      ...offer,
      status: "open",
      action_type: offer.action_type ?? "swap",
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to insert offer: ${error.message}`)
  return data as OfferRow
}

export async function fetchOpenOffers(
  supabase: SupabaseClient,
  chain: string,
  actionType: string = "swap"
): Promise<readonly OfferRow[]> {
  const { data, error } = await supabase
    .from("offers_v2")
    .select("*")
    .eq("chain", chain)
    .eq("action_type", actionType)
    .eq("status", "open")
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Failed to fetch offers: ${error.message}`)
  return data as OfferRow[]
}

export async function getOfferById(
  supabase: SupabaseClient,
  id: number
): Promise<OfferRow | null> {
  const { data, error } = await supabase
    .from("offers_v2")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return null
  return data as OfferRow
}

export async function updateOfferStatus(
  supabase: SupabaseClient,
  id: number,
  status: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("offers_v2")
    .update({ status, ...extra })
    .eq("id", id)

  if (error) throw new Error(`Failed to update offer: ${error.message}`)
}

export async function getReputation(
  supabase: SupabaseClient,
  wallet: string
): Promise<ReputationRow> {
  const { data, error } = await supabase
    .from("reputation")
    .select("*")
    .eq("wallet", wallet.toLowerCase())
    .single()

  if (error) {
    return {
      wallet: wallet.toLowerCase(),
      successful_swaps: 0,
      failed_swaps: 0,
      cancellations: 0,
      score: 0,
      updated_at: new Date().toISOString(),
    }
  }
  return data as ReputationRow
}

export async function updateReputation(
  supabase: SupabaseClient,
  wallet: string,
  update: {
    readonly successful_swaps_delta?: number
    readonly failed_swaps_delta?: number
    readonly cancellations_delta?: number
  }
): Promise<void> {
  const current = await getReputation(supabase, wallet)
  const successfulSwaps = current.successful_swaps + (update.successful_swaps_delta ?? 0)
  const failedSwaps = current.failed_swaps + (update.failed_swaps_delta ?? 0)
  const cancellations = current.cancellations + (update.cancellations_delta ?? 0)
  const score = successfulSwaps - (failedSwaps * 3) - (cancellations * 2)

  const { error } = await supabase
    .from("reputation")
    .upsert({
      wallet: wallet.toLowerCase(),
      successful_swaps: successfulSwaps,
      failed_swaps: failedSwaps,
      cancellations,
      score,
      updated_at: new Date().toISOString(),
    })

  if (error) throw new Error(`Failed to update reputation: ${error.message}`)
}

export async function fetchHistory(
  supabase: SupabaseClient,
  wallet: string,
  limit: number = 20
): Promise<readonly OfferRow[]> {
  const walletLower = wallet.toLowerCase()
  const { data, error } = await supabase
    .from("offers_v2")
    .select("*")
    .or(`seller.eq.${walletLower},buyer.eq.${walletLower}`)
    .in("status", ["settled", "cancelled", "expired"])
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch history: ${error.message}`)
  return data as OfferRow[]
}

// --- Quotes (RFQ) ---

export async function insertQuote(
  supabase: SupabaseClient,
  quote: {
    readonly rfq_id: number
    readonly quoter: string
    readonly sell_token: string
    readonly sell_amount: string
    readonly buy_token: string
    readonly buy_amount: string
    readonly chain: string
  }
): Promise<QuoteRow> {
  const { data, error } = await supabase
    .from("quotes_v2")
    .insert({ ...quote, status: "pending" })
    .select()
    .single()

  if (error) throw new Error(`Failed to insert quote: ${error.message}`)
  return data as QuoteRow
}

export async function fetchQuotesForRfq(
  supabase: SupabaseClient,
  rfqId: number
): Promise<readonly QuoteRow[]> {
  const { data, error } = await supabase
    .from("quotes_v2")
    .select("*")
    .eq("rfq_id", rfqId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Failed to fetch quotes: ${error.message}`)
  return data as QuoteRow[]
}

export async function getQuoteById(
  supabase: SupabaseClient,
  id: number
): Promise<QuoteRow | null> {
  const { data, error } = await supabase
    .from("quotes_v2")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return null
  return data as QuoteRow
}

export async function updateQuoteStatus(
  supabase: SupabaseClient,
  id: number,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from("quotes_v2")
    .update({ status })
    .eq("id", id)

  if (error) throw new Error(`Failed to update quote: ${error.message}`)
}

export async function rejectOtherQuotes(
  supabase: SupabaseClient,
  rfqId: number,
  acceptedQuoteId: number
): Promise<void> {
  const { error } = await supabase
    .from("quotes_v2")
    .update({ status: "rejected" })
    .eq("rfq_id", rfqId)
    .eq("status", "pending")
    .neq("id", acceptedQuoteId)

  if (error) throw new Error(`Failed to reject quotes: ${error.message}`)
}
