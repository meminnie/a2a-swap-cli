import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type { Config } from "./config"
import type { ActionType, OfferStatus } from "./types/offer"

export interface OfferRow {
  readonly id: number
  readonly action_type: ActionType
  readonly proposer: string
  readonly acceptor: string | null
  readonly sell_token: string
  readonly sell_amount: string
  readonly buy_token: string
  readonly buy_amount: string
  readonly chain: string
  readonly status: OfferStatus
  readonly deadline: number
  readonly tx_hash: string | null
  readonly created_at: string
}

export function getSupabaseClient(config: Pick<Config, "supabaseUrl" | "supabaseAnonKey">): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey)
}

export async function insertOffer(
  client: SupabaseClient,
  offer: {
    readonly id: number
    readonly action_type: ActionType
    readonly proposer: string
    readonly sell_token: string
    readonly sell_amount: string
    readonly buy_token: string
    readonly buy_amount: string
    readonly chain: string
    readonly deadline: number
    readonly tx_hash: string
  }
): Promise<OfferRow> {
  const { data, error } = await client
    .from("offers")
    .insert({
      ...offer,
      status: "open" as OfferStatus,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to insert offer: ${error.message}`)
  }
  return data as OfferRow
}

export async function updateOfferStatus(
  client: SupabaseClient,
  offerId: number,
  status: OfferStatus,
  acceptor?: string
): Promise<void> {
  const update: Record<string, unknown> = { status }
  if (acceptor) {
    update.acceptor = acceptor
  }

  const { error } = await client
    .from("offers")
    .update(update)
    .eq("id", offerId)

  if (error) {
    throw new Error(`Failed to update offer: ${error.message}`)
  }
}

export async function fetchOpenOffers(
  client: SupabaseClient,
  chain: string,
  actionType: ActionType
): Promise<ReadonlyArray<OfferRow>> {
  const { data, error } = await client
    .from("offers")
    .select("*")
    .eq("status", "open")
    .eq("chain", chain)
    .eq("action_type", actionType)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch offers: ${error.message}`)
  }
  return (data ?? []) as ReadonlyArray<OfferRow>
}

export function subscribeOffers(
  client: SupabaseClient,
  onInsert: (offer: OfferRow) => void,
  onUpdate?: (offer: OfferRow) => void
): { unsubscribe: () => void } {
  const channel = client
    .channel("offers-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "offers" },
      (payload) => onInsert(payload.new as OfferRow)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "offers" },
      (payload) => {
        if (onUpdate) onUpdate(payload.new as OfferRow)
      }
    )
    .subscribe()

  return {
    unsubscribe: () => {
      client.removeChannel(channel)
    },
  }
}

// ── Quotes (RFQ) ──

export type QuoteStatus = "pending" | "accepted" | "rejected" | "expired"

export interface QuoteRow {
  readonly id: number
  readonly rfq_id: number
  readonly quoter: string
  readonly sell_token: string
  readonly sell_amount: string
  readonly buy_token: string
  readonly buy_amount: string
  readonly chain: string
  readonly status: QuoteStatus
  readonly escrow_offer_id: number | null
  readonly created_at: string
}

export async function insertRfq(
  client: SupabaseClient,
  rfq: {
    readonly action_type: "rfq"
    readonly proposer: string
    readonly buy_token: string
    readonly buy_amount: string
    readonly sell_token: string
    readonly sell_amount: string
    readonly chain: string
    readonly deadline: number
  }
): Promise<OfferRow> {
  const { data, error } = await client
    .from("offers")
    .insert({
      ...rfq,
      status: "open" as OfferStatus,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to insert RFQ: ${error.message}`)
  }
  return data as OfferRow
}

export async function insertQuote(
  client: SupabaseClient,
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
  const { data, error } = await client
    .from("quotes")
    .insert({ ...quote, status: "pending" as QuoteStatus })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to insert quote: ${error.message}`)
  }
  return data as QuoteRow
}

export async function fetchQuotesForRfq(
  client: SupabaseClient,
  rfqId: number
): Promise<ReadonlyArray<QuoteRow>> {
  const { data, error } = await client
    .from("quotes")
    .select("*")
    .eq("rfq_id", rfqId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch quotes: ${error.message}`)
  }
  return (data ?? []) as ReadonlyArray<QuoteRow>
}

export async function updateQuoteStatus(
  client: SupabaseClient,
  quoteId: number,
  status: QuoteStatus,
  escrowOfferId?: number
): Promise<void> {
  const update: Record<string, unknown> = { status }
  if (escrowOfferId !== undefined) {
    update.escrow_offer_id = escrowOfferId
  }

  const { error } = await client
    .from("quotes")
    .update(update)
    .eq("id", quoteId)

  if (error) {
    throw new Error(`Failed to update quote: ${error.message}`)
  }
}

export function subscribeQuotes(
  client: SupabaseClient,
  rfqId: number,
  onInsert: (quote: QuoteRow) => void
): { unsubscribe: () => void } {
  const channel = client
    .channel(`quotes-rfq-${rfqId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "quotes",
        filter: `rfq_id=eq.${rfqId}`,
      },
      (payload) => onInsert(payload.new as QuoteRow)
    )
    .subscribe()

  return {
    unsubscribe: () => {
      client.removeChannel(channel)
    },
  }
}

export function subscribeQuoteUpdate(
  client: SupabaseClient,
  quoteId: number,
  onUpdate: (quote: QuoteRow) => void
): { unsubscribe: () => void } {
  const channel = client
    .channel(`quote-update-${quoteId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "quotes",
        filter: `id=eq.${quoteId}`,
      },
      (payload) => onUpdate(payload.new as QuoteRow)
    )
    .subscribe()

  return {
    unsubscribe: () => {
      client.removeChannel(channel)
    },
  }
}

export async function fetchHistory(
  client: SupabaseClient,
  address: string,
  limit: number
): Promise<ReadonlyArray<OfferRow>> {
  const { data, error } = await client
    .from("offers")
    .select("*")
    .or(`proposer.eq.${address},acceptor.eq.${address}`)
    .in("status", ["settled", "cancelled", "expired"])
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch history: ${error.message}`)
  }
  return (data ?? []) as ReadonlyArray<OfferRow>
}
