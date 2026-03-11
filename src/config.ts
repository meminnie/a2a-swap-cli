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
  readonly relayUrl: string
  readonly chain: string
  readonly minTrustScore: number
}

export function loadConfig(): Config {
  return {
    privateKey: requireEnv("PRIVATE_KEY"),
    rpcUrl: optionalEnv("RPC_URL", "https://sepolia.base.org"),
    escrowAddress: requireEnv("ESCROW_ADDRESS"),
    relayUrl: optionalEnv("RELAY_URL", "http://localhost:3000"),
    chain: optionalEnv("CHAIN", "base-sepolia"),
    minTrustScore: Number(optionalEnv("MIN_TRUST_SCORE", "80")),
  }
}
