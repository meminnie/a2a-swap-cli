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

export function getSupabaseClient(config: Config): SupabaseClient {
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
