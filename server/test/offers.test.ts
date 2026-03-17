import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildApp } from "../src/app"
import { TEST_CONFIG, SELLER, BUYER, SELL_TOKEN, BUY_TOKEN, ESCROW_ADDR, makeOffer } from "./helpers"

// Mock supabase — all named exports used by routes
vi.mock("../src/supabase", () => ({
  createSupabaseClient: vi.fn(),
  insertOffer: vi.fn(),
  fetchOpenOffers: vi.fn(),
  fetchHistory: vi.fn(),
  getOfferById: vi.fn(),
  updateOfferStatus: vi.fn(),
  getReputation: vi.fn(),
  updateReputation: vi.fn(),
  insertQuote: vi.fn(),
  fetchQuotesForRfq: vi.fn(),
  getQuoteById: vi.fn(),
  updateQuoteStatus: vi.fn(),
  rejectOtherQuotes: vi.fn(),
}))

// Mock contract
vi.mock("../src/contract", () => ({
  getFactory: () => ({
    useNonce: vi.fn().mockResolvedValue({ wait: vi.fn() }),
    nextNonce: vi.fn().mockResolvedValue(1n),
  }),
  computeEscrowAddress: vi.fn().mockResolvedValue("0x" + "ee".repeat(20)),
  deployEscrow: vi.fn().mockResolvedValue({ address: "0x" + "ee".repeat(20), txHash: "0xtxhash" }),
  settleEscrow: vi.fn(),
  refundEscrow: vi.fn(),
  isEscrowCancelled: vi.fn(),
  checkTokenBalance: vi.fn(),
}))

import {
  insertOffer,
  fetchOpenOffers,
  fetchHistory,
  getOfferById,
  updateOfferStatus,
  getReputation,
  updateReputation,
} from "../src/supabase"

describe("Offer Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: getReputation returns score 0
    vi.mocked(getReputation).mockResolvedValue({
      wallet: "", successful_swaps: 0, failed_swaps: 0, cancellations: 0, score: 0, updated_at: "",
    })
    vi.mocked(updateOfferStatus).mockResolvedValue(undefined)
    vi.mocked(updateReputation).mockResolvedValue(undefined)
  })

  describe("POST /offers", () => {
    it("should create an offer", async () => {
      vi.mocked(insertOffer).mockResolvedValue(makeOffer() as any)

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers",
        payload: {
          seller: SELLER,
          sellToken: SELL_TOKEN,
          sellAmount: "1000000",
          buyToken: BUY_TOKEN,
          buyAmount: "500000",
        },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.data.offerId).toBe(1)
      expect(body.data.escrowAddress).toBe(ESCROW_ADDR)
    })

    it("should reject missing required fields", async () => {
      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers",
        payload: { seller: SELLER },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /offers", () => {
    it("should list open offers with reputation", async () => {
      vi.mocked(fetchOpenOffers).mockResolvedValue([makeOffer() as any])
      vi.mocked(getReputation).mockResolvedValue({
        wallet: SELLER, successful_swaps: 5, failed_swaps: 0, cancellations: 0, score: 5, updated_at: "",
      })

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({ method: "GET", url: "/offers" })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.data).toHaveLength(1)
      expect(body.data[0].sellToken).toBe(SELL_TOKEN)
      expect(body.data[0].sellerScore).toBe(5)
    })

    it("should return empty array when no offers", async () => {
      vi.mocked(fetchOpenOffers).mockResolvedValue([])

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({ method: "GET", url: "/offers" })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(0)
    })
  })

  describe("GET /offers/:id", () => {
    it("should return offer details in camelCase", async () => {
      vi.mocked(getOfferById).mockResolvedValue(makeOffer({ buyer: BUYER.toLowerCase() }) as any)
      vi.mocked(getReputation)
        .mockResolvedValueOnce({ wallet: SELLER, successful_swaps: 5, failed_swaps: 0, cancellations: 0, score: 5, updated_at: "" })
        .mockResolvedValueOnce({ wallet: BUYER, successful_swaps: 3, failed_swaps: 0, cancellations: 0, score: 3, updated_at: "" })

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({ method: "GET", url: "/offers/1" })

      expect(res.statusCode).toBe(200)
      const data = res.json().data
      expect(data.sellToken).toBe(SELL_TOKEN)
      expect(data.escrowAddress).toBe(ESCROW_ADDR)
      expect(data.sellerScore).toBe(5)
      expect(data.buyerScore).toBe(3)
    })

    it("should return 404 for non-existent offer", async () => {
      vi.mocked(getOfferById).mockResolvedValue(null)

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({ method: "GET", url: "/offers/999" })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /offers/history", () => {
    it("should return trade history", async () => {
      vi.mocked(fetchHistory).mockResolvedValue([
        makeOffer({ status: "settled", buyer: BUYER.toLowerCase() }) as any,
      ])

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "GET",
        url: `/offers/history?wallet=${SELLER}`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].status).toBe("settled")
    })
  })

  describe("POST /offers/:id/accept", () => {
    it("should accept an open offer", async () => {
      vi.mocked(getOfferById).mockResolvedValue(makeOffer() as any)
      vi.mocked(getReputation).mockResolvedValue({
        wallet: BUYER, successful_swaps: 5, failed_swaps: 0, cancellations: 0, score: 5, updated_at: "",
      })

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers/1/accept",
        payload: { buyer: BUYER },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.data.escrowAddress).toBe(ESCROW_ADDR)
      expect(body.data.txHash).toBe("0xtxhash")
    })

    it("should reject if offer not open", async () => {
      vi.mocked(getOfferById).mockResolvedValue(makeOffer({ status: "matched" }) as any)

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers/1/accept",
        payload: { buyer: BUYER },
      })

      expect(res.statusCode).toBe(400)
    })

    it("should reject buyer below min score", async () => {
      vi.mocked(getOfferById).mockResolvedValue(makeOffer({ min_score: 10 }) as any)
      vi.mocked(getReputation).mockResolvedValue({
        wallet: BUYER, successful_swaps: 0, failed_swaps: 0, cancellations: 0, score: 0, updated_at: "",
      })

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers/1/accept",
        payload: { buyer: BUYER },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error).toContain("below minimum")
    })

    it("should reject expired offer", async () => {
      vi.mocked(getOfferById).mockResolvedValue(
        makeOffer({ deadline: new Date(Date.now() - 10000).toISOString() }) as any
      )
      vi.mocked(getReputation).mockResolvedValue({
        wallet: BUYER, successful_swaps: 5, failed_swaps: 0, cancellations: 0, score: 5, updated_at: "",
      })

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers/1/accept",
        payload: { buyer: BUYER },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain("expired")
    })
  })

  describe("POST /offers/:id/cancel", () => {
    it("should cancel open offer without penalty", async () => {
      vi.mocked(getOfferById).mockResolvedValue(makeOffer() as any)

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers/1/cancel",
        payload: { wallet: SELLER },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.penalty).toBe(false)
    })

    it("should cancel deployed offer with penalty", async () => {
      vi.mocked(getOfferById).mockResolvedValue(
        makeOffer({ status: "deployed", buyer: BUYER.toLowerCase() }) as any
      )

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers/1/cancel",
        payload: { wallet: SELLER },
      })

      expect(res.statusCode).toBe(200)
      const data = res.json().data
      expect(data.penalty).toBe(true)
      expect(data.scoreDelta).toBe(-2)
    })

    it("should reject cancel from non-participant", async () => {
      vi.mocked(getOfferById).mockResolvedValue(makeOffer() as any)

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers/1/cancel",
        payload: { wallet: "0x" + "cc".repeat(20) },
      })

      expect(res.statusCode).toBe(403)
    })

    it("should reject cancel of settled offer", async () => {
      vi.mocked(getOfferById).mockResolvedValue(makeOffer({ status: "settled" }) as any)

      const app = await buildApp(TEST_CONFIG)
      const res = await app.inject({
        method: "POST",
        url: "/offers/1/cancel",
        payload: { wallet: SELLER },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})

describe("Health Check", () => {
  it("should return ok", async () => {
    const app = await buildApp(TEST_CONFIG)
    const res = await app.inject({ method: "GET", url: "/health" })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: "ok", chain: "base-sepolia" })
  })
})
