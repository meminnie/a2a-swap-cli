import type { ServerConfig } from "../src/config"

export const TEST_CONFIG: ServerConfig = {
  port: 0,
  host: "127.0.0.1",
  rpcUrl: "http://localhost:8545",
  operatorPrivateKey: "0x" + "ab".repeat(32),
  factoryAddress: "0x" + "ff".repeat(20),
  supabaseUrl: "http://localhost:54321",
  supabaseServiceRoleKey: "test-service-key",
  feeBps: 10,
  chain: "base-sepolia",
  depositDeadlineSeconds: 300,
}

export const SELLER = "0x" + "aa".repeat(20)
export const BUYER = "0x" + "bb".repeat(20)
export const SELL_TOKEN = "0x" + "11".repeat(20)
export const BUY_TOKEN = "0x" + "22".repeat(20)
export const ESCROW_ADDR = "0x" + "ee".repeat(20)

export function makeOffer(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    seller: SELLER.toLowerCase(),
    buyer: null,
    sell_token: SELL_TOKEN,
    sell_amount: "1000000",
    buy_token: BUY_TOKEN,
    buy_amount: "500000",
    action_type: "swap",
    chain: "base-sepolia",
    status: "open",
    escrow_address: ESCROW_ADDR,
    nonce: 0,
    deadline: new Date(Date.now() + 3600_000).toISOString(),
    min_score: 0,
    tx_hash: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}
