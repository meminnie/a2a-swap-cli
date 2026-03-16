import type { SupabaseClient } from "@supabase/supabase-js"
import type { ServerConfig } from "../config"
import { settleEscrow, refundEscrow, checkTokenBalance } from "../contract"
import { updateOfferStatus, updateReputation } from "../supabase"
import type { OfferRow } from "../supabase"

export async function trySettle(
  config: ServerConfig,
  supabase: SupabaseClient,
  offer: OfferRow
): Promise<boolean> {
  try {
    const sellBalance = await checkTokenBalance(
      config,
      offer.sell_token,
      offer.escrow_address
    )
    const buyBalance = await checkTokenBalance(
      config,
      offer.buy_token,
      offer.escrow_address
    )

    if (sellBalance < BigInt(offer.sell_amount)) return false
    if (buyBalance < BigInt(offer.buy_amount)) return false

    const txHash = await settleEscrow(config, offer.escrow_address)

    await updateOfferStatus(supabase, offer.id, "settled", { tx_hash: txHash })

    // Both parties get +1 reputation
    await updateReputation(supabase, offer.seller, { successful_swaps_delta: 1 })
    if (offer.buyer) {
      await updateReputation(supabase, offer.buyer, { successful_swaps_delta: 1 })
    }

    console.info(`[operator] Settled offer #${offer.id} tx=${txHash}`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[operator] Failed to settle offer #${offer.id}: ${message}`)
    return false
  }
}

export async function tryRefund(
  config: ServerConfig,
  supabase: SupabaseClient,
  offer: OfferRow
): Promise<boolean> {
  try {
    const txHash = await refundEscrow(config, offer.escrow_address)

    await updateOfferStatus(supabase, offer.id, "expired", { tx_hash: txHash })

    // Buyer gets -3 for failing to deposit
    if (offer.buyer) {
      await updateReputation(supabase, offer.buyer, { failed_swaps_delta: 1 })
    }

    console.info(`[operator] Refunded offer #${offer.id} tx=${txHash}`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[operator] Failed to refund offer #${offer.id}: ${message}`)
    return false
  }
}

export function startOperatorLoop(
  config: ServerConfig,
  supabase: SupabaseClient,
  intervalMs: number = 15_000
): NodeJS.Timeout {
  console.info(`[operator] Starting monitor loop (${intervalMs}ms interval)`)

  const tick = async () => {
    try {
      // Check deployed offers for settlement
      const { data: deployedOffers } = await supabase
        .from("offers_v2")
        .select("*")
        .eq("status", "deployed")

      if (deployedOffers) {
        for (const offer of deployedOffers) {
          const now = new Date()
          const deadline = new Date(offer.deadline)

          if (now > deadline) {
            await tryRefund(config, supabase, offer as OfferRow)
          } else {
            await trySettle(config, supabase, offer as OfferRow)
          }
        }
      }

      // Check expired open offers
      const { data: expiredOffers } = await supabase
        .from("offers_v2")
        .select("*")
        .eq("status", "open")
        .lt("deadline", new Date().toISOString())

      if (expiredOffers) {
        for (const offer of expiredOffers) {
          await updateOfferStatus(supabase, offer.id, "expired")
          console.info(`[operator] Expired open offer #${offer.id}`)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[operator] Loop error: ${message}`)
    }
  }

  // Run immediately then on interval
  tick()
  return setInterval(tick, intervalMs)
}
