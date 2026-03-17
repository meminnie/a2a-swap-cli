import { describe, it, expect, vi, beforeEach } from "vitest"
import { trySettle, tryRefund } from "../src/services/operator"
import { TEST_CONFIG, makeOffer, SELLER, BUYER } from "./helpers"
import type { OfferRow } from "../src/supabase"

// Mock contract
vi.mock("../src/contract", () => ({
  settleEscrow: vi.fn().mockResolvedValue("0xsettletx"),
  refundEscrow: vi.fn().mockResolvedValue("0xrefundtx"),
  isEscrowCancelled: vi.fn().mockResolvedValue(false),
  checkTokenBalance: vi.fn(),
}))

// Mock supabase functions
vi.mock("../src/supabase", () => ({
  updateOfferStatus: vi.fn().mockResolvedValue(undefined),
  updateReputation: vi.fn().mockResolvedValue(undefined),
  getReputation: vi.fn().mockResolvedValue({
    wallet: "", successful_swaps: 0, failed_swaps: 0, cancellations: 0, score: 0, updated_at: "",
  }),
}))

import { checkTokenBalance } from "../src/contract"
import { updateOfferStatus, updateReputation } from "../src/supabase"

const mockSupabase = {} as any

describe("Operator: trySettle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should settle when both balances are sufficient", async () => {
    const offer = makeOffer({
      status: "deployed",
      buyer: BUYER.toLowerCase(),
    }) as OfferRow

    vi.mocked(checkTokenBalance)
      .mockResolvedValueOnce(BigInt(offer.sell_amount)) // sell balance
      .mockResolvedValueOnce(BigInt(offer.buy_amount))  // buy balance

    const result = await trySettle(TEST_CONFIG, mockSupabase, offer)

    expect(result).toBe(true)
    expect(updateOfferStatus).toHaveBeenCalledWith(
      mockSupabase, 1, "settled", { tx_hash: "0xsettletx" }
    )
    expect(updateReputation).toHaveBeenCalledWith(
      mockSupabase, SELLER.toLowerCase(), { successful_swaps_delta: 1 }
    )
    expect(updateReputation).toHaveBeenCalledWith(
      mockSupabase, BUYER.toLowerCase(), { successful_swaps_delta: 1 }
    )
  })

  it("should skip when sell balance insufficient", async () => {
    const offer = makeOffer({ status: "deployed" }) as OfferRow

    vi.mocked(checkTokenBalance)
      .mockResolvedValueOnce(0n) // sell balance = 0
      .mockResolvedValueOnce(BigInt(offer.buy_amount))

    const result = await trySettle(TEST_CONFIG, mockSupabase, offer)

    expect(result).toBe(false)
    expect(updateOfferStatus).not.toHaveBeenCalled()
  })

  it("should skip when buy balance insufficient", async () => {
    const offer = makeOffer({ status: "deployed" }) as OfferRow

    vi.mocked(checkTokenBalance)
      .mockResolvedValueOnce(BigInt(offer.sell_amount))
      .mockResolvedValueOnce(0n) // buy balance = 0

    const result = await trySettle(TEST_CONFIG, mockSupabase, offer)

    expect(result).toBe(false)
    expect(updateOfferStatus).not.toHaveBeenCalled()
  })

  it("should return false when no escrow address", async () => {
    const offer = makeOffer({ escrow_address: null }) as OfferRow
    const result = await trySettle(TEST_CONFIG, mockSupabase, offer)
    expect(result).toBe(false)
  })

  it("should catch errors and return false", async () => {
    const offer = makeOffer({ status: "deployed" }) as OfferRow

    vi.mocked(checkTokenBalance).mockRejectedValue(new Error("rpc failed"))

    const result = await trySettle(TEST_CONFIG, mockSupabase, offer)
    expect(result).toBe(false)
  })
})

describe("Operator: tryRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should refund and penalize buyer", async () => {
    const offer = makeOffer({
      status: "deployed",
      buyer: BUYER.toLowerCase(),
    }) as OfferRow

    const result = await tryRefund(TEST_CONFIG, mockSupabase, offer)

    expect(result).toBe(true)
    expect(updateOfferStatus).toHaveBeenCalledWith(
      mockSupabase, 1, "expired", { tx_hash: "0xrefundtx" }
    )
    expect(updateReputation).toHaveBeenCalledWith(
      mockSupabase, BUYER.toLowerCase(), { failed_swaps_delta: 1 }
    )
  })

  it("should return false when no escrow address", async () => {
    const offer = makeOffer({ escrow_address: null }) as OfferRow
    const result = await tryRefund(TEST_CONFIG, mockSupabase, offer)
    expect(result).toBe(false)
  })
})
