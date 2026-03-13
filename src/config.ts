import * as dotenv from "dotenv"

dotenv.config()

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback
}

export interface Config {
  readonly privateKey: string
  readonly rpcUrl: string
  readonly escrowAddress: string
  readonly supabaseUrl: string
  readonly supabaseAnonKey: string
  readonly chain: string
  readonly minTrustScore: number
  readonly trustRegistryAddress: string | null
}

function resolvePrivateKey(wallet?: string): string {
  if (wallet) {
    const envKey = `PRIVATE_KEY_${wallet.toUpperCase()}`
    const value = process.env[envKey]
    if (!value) {
      throw new Error(`Wallet "${wallet}" not found. Set ${envKey} in .env`)
    }
    return value
  }
  return requireEnv("PRIVATE_KEY")
}

export function loadConfig(wallet?: string): Config {
  return {
    privateKey: resolvePrivateKey(wallet),
    rpcUrl: optionalEnv("RPC_URL", "https://sepolia.base.org"),
    escrowAddress: requireEnv("ESCROW_ADDRESS"),
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseAnonKey: requireEnv("SUPABASE_ANON_KEY"),
    chain: optionalEnv("CHAIN", "base-sepolia"),
    minTrustScore: Number(optionalEnv("MIN_TRUST_SCORE", "80")),
    trustRegistryAddress: process.env.TRUST_REGISTRY_ADDRESS || null,
  }
}
