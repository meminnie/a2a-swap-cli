import * as dotenv from "dotenv"
import * as path from "path"

dotenv.config({ path: path.resolve(__dirname, "../../.env") })

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export interface ServerConfig {
  readonly port: number
  readonly host: string
  readonly rpcUrl: string
  readonly operatorPrivateKey: string
  readonly factoryAddress: string
  readonly supabaseUrl: string
  readonly supabaseServiceRoleKey: string
  readonly feeBps: number
  readonly chain: string
  readonly depositDeadlineSeconds: number
}

export function loadServerConfig(): ServerConfig {
  return {
    port: Number(optionalEnv("PORT", "3000")),
    host: optionalEnv("HOST", "0.0.0.0"),
    rpcUrl: optionalEnv("RPC_URL", "https://sepolia.base.org"),
    operatorPrivateKey: requireEnv("OPERATOR_PRIVATE_KEY"),
    factoryAddress: requireEnv("FACTORY_ADDRESS"),
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    feeBps: Number(optionalEnv("FEE_BPS", "10")),
    chain: optionalEnv("CHAIN", "base-sepolia"),
    depositDeadlineSeconds: Number(optionalEnv("DEPOSIT_DEADLINE_SECONDS", "300")),
  }
}
