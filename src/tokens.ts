/**
 * Token symbol → address mapping for supported chains.
 * Addresses are for Base Sepolia testnet.
 * Add mainnet addresses when ready for production.
 */

interface TokenMap {
  readonly [symbol: string]: string
}

interface ChainTokens {
  readonly [chain: string]: TokenMap
}

const TOKEN_ADDRESSES: ChainTokens = {
  "base-sepolia": {
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    WETH: "0x4200000000000000000000000000000000000006",
    DAI: "0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9",
    tUSDC: "0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2",
    tWETH: "0x4322cB832Ab806cC123540428125a92180725a23",
  },
  base: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    WETH: "0x4200000000000000000000000000000000000006",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  },
}

export function resolveTokenAddress(
  symbol: string,
  chain: string
): string {
  const upper = symbol.toUpperCase()
  const chainTokens = TOKEN_ADDRESSES[chain]

  if (!chainTokens) {
    throw new Error(`Unsupported chain: ${chain}. Supported: ${Object.keys(TOKEN_ADDRESSES).join(", ")}`)
  }

  const address = chainTokens[upper]

  if (!address) {
    // If it looks like an address already, return it as-is
    if (/^0x[a-fA-F0-9]{40}$/.test(symbol)) {
      return symbol
    }
    const supported = Object.keys(chainTokens).join(", ")
    throw new Error(`Unknown token: ${symbol}. Supported on ${chain}: ${supported}. Or pass a token address directly.`)
  }

  return address
}

export function getTokenSymbol(
  address: string,
  chain: string
): string | null {
  const chainTokens = TOKEN_ADDRESSES[chain]
  if (!chainTokens) return null

  const entry = Object.entries(chainTokens).find(
    ([, addr]) => addr.toLowerCase() === address.toLowerCase()
  )
  return entry ? entry[0] : null
}
