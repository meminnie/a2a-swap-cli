/**
 * Price oracle — fetches spot prices from CoinGecko (free, no API key).
 * Used by auto-accept policy to evaluate offer fairness.
 */

const COINGECKO_API = "https://api.coingecko.com/api/v3"

const TOKEN_TO_COINGECKO_ID: Readonly<Record<string, string>> = {
  WETH: "ethereum",
  tWETH: "ethereum",
  ETH: "ethereum",
  USDC: "usd-coin",
  tUSDC: "usd-coin",
  DAI: "dai",
}

interface PriceResult {
  readonly token: string
  readonly priceUsd: number
}

export async function fetchTokenPrice(symbol: string): Promise<PriceResult> {
  const geckoId = TOKEN_TO_COINGECKO_ID[symbol] ?? TOKEN_TO_COINGECKO_ID[symbol.toUpperCase()]
  if (!geckoId) {
    throw new Error(`No oracle mapping for token: ${symbol}`)
  }

  const url = `${COINGECKO_API}/simple/price?ids=${geckoId}&vs_currencies=usd`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as Record<string, { usd: number }>
  const priceUsd = data[geckoId]?.usd

  if (priceUsd === undefined) {
    throw new Error(`No price data for ${symbol} (${geckoId})`)
  }

  return { token: symbol, priceUsd }
}

export async function fetchPairRate(
  sellSymbol: string,
  buySymbol: string
): Promise<number> {
  const [sellPrice, buyPrice] = await Promise.all([
    fetchTokenPrice(sellSymbol),
    fetchTokenPrice(buySymbol),
  ])

  if (buyPrice.priceUsd === 0) {
    throw new Error(`Buy token ${buySymbol} has zero price`)
  }

  return sellPrice.priceUsd / buyPrice.priceUsd
}
