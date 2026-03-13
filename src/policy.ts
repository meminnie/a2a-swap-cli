/**
 * Auto-accept policy engine.
 * Evaluates whether an offer meets acceptance criteria based on oracle price.
 *
 * Acceptor perspective:
 *   - Acceptor RECEIVES sellAmount of sellToken (proposer's sell)
 *   - Acceptor PAYS buyAmount of buyToken (proposer's buy)
 *   - Good deal = receiveValueUsd >= payValueUsd (within slippage)
 */

import { fetchTokenPrice } from "./oracle"
import { getTokenSymbol } from "./tokens"

export interface PairSlippageOverride {
  readonly pair: string
  readonly maxSlippagePct: number
}

export interface PolicyConfig {
  readonly maxSlippagePct: number
  readonly minTrustScore: number
  readonly chain: string
  readonly pairOverrides?: ReadonlyArray<PairSlippageOverride>
}

export interface PolicyResult {
  readonly accept: boolean
  readonly reason: string
  readonly receiveValueUsd: number
  readonly payValueUsd: number
  readonly deviationPct: number
}

function normalizePairKey(a: string, b: string): string {
  const sorted = [a.toUpperCase(), b.toUpperCase()].sort()
  return `${sorted[0]}/${sorted[1]}`
}

export function resolveSlippage(
  sellSymbol: string,
  buySymbol: string,
  config: PolicyConfig
): number {
  if (!config.pairOverrides || config.pairOverrides.length === 0) {
    return config.maxSlippagePct
  }

  const key = normalizePairKey(sellSymbol, buySymbol)

  for (const override of config.pairOverrides) {
    const overrideKey = normalizePairKey(
      ...override.pair.split("/") as [string, string]
    )
    if (overrideKey === key) {
      return override.maxSlippagePct
    }
  }

  return config.maxSlippagePct
}

export async function evaluateOffer(
  offer: {
    readonly sell_token: string
    readonly sell_amount: string
    readonly buy_token: string
    readonly buy_amount: string
  },
  policyConfig: PolicyConfig
): Promise<PolicyResult> {
  const sellSymbol = getTokenSymbol(offer.sell_token, policyConfig.chain)
  const buySymbol = getTokenSymbol(offer.buy_token, policyConfig.chain)

  if (!sellSymbol || !buySymbol) {
    return {
      accept: false,
      reason: `Unknown token — sell: ${sellSymbol ?? offer.sell_token}, buy: ${buySymbol ?? offer.buy_token}`,
      receiveValueUsd: 0,
      payValueUsd: 0,
      deviationPct: 0,
    }
  }

  const [sellPrice, buyPrice] = await Promise.all([
    fetchTokenPrice(sellSymbol),
    fetchTokenPrice(buySymbol),
  ])

  const sellAmount = Number(offer.sell_amount)
  const buyAmount = Number(offer.buy_amount)

  // USD value of what acceptor receives vs pays
  const receiveValueUsd = sellAmount * sellPrice.priceUsd
  const payValueUsd = buyAmount * buyPrice.priceUsd

  if (payValueUsd === 0) {
    return {
      accept: false,
      reason: "Pay value is zero",
      receiveValueUsd,
      payValueUsd,
      deviationPct: 100,
    }
  }

  // Resolve per-pair slippage or fall back to default
  const maxSlippage = resolveSlippage(sellSymbol, buySymbol, policyConfig)

  // Positive deviation = acceptor overpays, negative = acceptor gets a deal
  const deviationPct = ((payValueUsd - receiveValueUsd) / receiveValueUsd) * 100

  // Accept if acceptor overpays by at most maxSlippage
  const accept = deviationPct <= maxSlippage

  const reason = accept
    ? `Price OK — you ${deviationPct < 0 ? "save" : "overpay"} ${Math.abs(deviationPct).toFixed(2)}% (max ${maxSlippage}%)`
    : `Bad deal — you overpay ${deviationPct.toFixed(2)}% (max ${maxSlippage}%)`

  return { accept, reason, receiveValueUsd, payValueUsd, deviationPct }
}
