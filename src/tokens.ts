/**
 * Token symbol → address/decimals mapping for supported chains.
 * Addresses are for Base Sepolia testnet.
 * Add mainnet addresses when ready for production.
 */

interface TokenInfo {
  readonly address: string
  readonly decimals: number
}

interface ChainTokens {
  readonly [chain: string]: {
    readonly [symbol: string]: TokenInfo
  }
}

const DEFAULT_DECIMALS = 18

const TOKEN_REGISTRY: ChainTokens = {
  "base-sepolia": {
    USDC: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    DAI: { address: "0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9", decimals: 18 },
    tUSDC: {
      address: process.env.TUSDC_CONTRACT_ADDRESS ?? "0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2",
      decimals: 18,
    },
    tWETH: {
      address: process.env.TWETH_CONTRACT_ADDRESS ?? "0x4322cB832Ab806cC123540428125a92180725a23",
      decimals: 18,
    },
  },
  base: {
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    DAI: { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
  },
}

const NATIVE_ALIASES = new Set(["ETH", "eth"])

export function isNativeToken(symbol: string): boolean {
  return NATIVE_ALIASES.has(symbol)
}

export function getWethAddress(chain: string): string {
  const chainTokens = TOKEN_REGISTRY[chain]
  if (!chainTokens?.WETH) {
    throw new Error(`No WETH address configured for chain: ${chain}`)
  }
  return chainTokens.WETH.address
}

export function getTokenDecimals(symbol: string, chain: string): number {
  if (isNativeToken(symbol)) return 18

  const chainTokens = TOKEN_REGISTRY[chain]
  if (!chainTokens) return DEFAULT_DECIMALS

  const entry = Object.entries(chainTokens).find(
    ([key]) => key.toLowerCase() === symbol.toLowerCase(),
  )
  return entry ? entry[1].decimals : DEFAULT_DECIMALS
}

export function resolveTokenAddress(symbol: string, chain: string): string {
  const chainTokens = TOKEN_REGISTRY[chain]

  if (!chainTokens) {
    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${Object.keys(TOKEN_REGISTRY).join(", ")}`,
    )
  }

  if (isNativeToken(symbol)) {
    return getWethAddress(chain)
  }

  const entry = Object.entries(chainTokens).find(
    ([key]) => key.toLowerCase() === symbol.toLowerCase(),
  )
  const info = entry ? entry[1] : undefined

  if (!info) {
    if (/^0x[a-fA-F0-9]{40}$/.test(symbol)) {
      return symbol
    }
    const supported = Object.keys(chainTokens).join(", ")
    throw new Error(
      `Unknown token: ${symbol}. Supported on ${chain}: ${supported}. Or pass a token address directly.`,
    )
  }

  return info.address
}

export function getTokenSymbol(address: string, chain: string): string | null {
  const chainTokens = TOKEN_REGISTRY[chain]
  if (!chainTokens) return null

  const entry = Object.entries(chainTokens).find(
    ([, info]) => info.address.toLowerCase() === address.toLowerCase(),
  )
  return entry ? entry[0] : null
}
