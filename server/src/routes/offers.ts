import { FastifyInstance } from "fastify"
import type { ServerConfig } from "../config"
import {
  createOfferSchema,
  listOffersSchema,
  historySchema,
  acceptOfferSchema,
  cancelOfferSchema,
  getOfferSchema,
} from "../schemas/offer"
import {
  insertOffer,
  fetchOpenOffers,
  fetchHistory,
  getOfferById,
  updateOfferStatus,
  getReputation,
  updateReputation,
  createSupabaseClient,
} from "../supabase"
import { computeEscrowAddress, deployEscrow, getFactory } from "../contract"

interface CreateOfferBody {
  readonly seller: string
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
  readonly minScore?: number
  readonly deadlineSeconds?: number
}

interface AcceptOfferBody {
  readonly buyer: string
}

interface CancelOfferBody {
  readonly wallet: string
}

interface OfferParams {
  readonly id: number
}

interface ListOffersQuery {
  readonly chain?: string
}

interface HistoryQuery {
  readonly wallet: string
  readonly limit?: number
}

export async function offerRoutes(
  app: FastifyInstance,
  opts: { readonly config: ServerConfig }
): Promise<void> {
  const { config } = opts
  const supabase = createSupabaseClient(config)

  app.post<{ Body: CreateOfferBody }>(
    "/offers",
    { schema: createOfferSchema },
    async (request, reply) => {
      const {
        seller,
        sellToken,
        sellAmount,
        buyToken,
        buyAmount,
        minScore = 0,
        deadlineSeconds = 3600,
      } = request.body

      const factory = getFactory(config)
      const nonceTx = await factory.useNonce()
      await nonceTx.wait()
      const nonce = (await factory.nextNonce()) - 1n

      const now = Math.floor(Date.now() / 1000)
      const deadline = now + deadlineSeconds

      const escrowAddress = await computeEscrowAddress(config, {
        seller,
        buyer: seller, // placeholder — will be updated on accept
        sellToken,
        buyToken,
        deadline,
        nonce,
      })

      const offer = await insertOffer(supabase, {
        seller: seller.toLowerCase(),
        sell_token: sellToken,
        sell_amount: sellAmount,
        buy_token: buyToken,
        buy_amount: buyAmount,
        chain: config.chain,
        escrow_address: escrowAddress,
        nonce: Number(nonce),
        deadline: new Date(deadline * 1000).toISOString(),
        min_score: minScore,
      })

      return reply.send({
        success: true,
        data: {
          offerId: offer.id,
          escrowAddress,
          deadline: new Date(deadline * 1000).toISOString(),
          nonce: Number(nonce),
        },
      })
    }
  )

  app.get<{ Querystring: ListOffersQuery }>(
    "/offers",
    { schema: listOffersSchema },
    async (request, reply) => {
      const chain = request.query.chain ?? config.chain
      const offers = await fetchOpenOffers(supabase, chain)

      const results = await Promise.all(
        offers.map(async (offer) => {
          const rep = await getReputation(supabase, offer.seller)
          return {
            id: offer.id,
            seller: offer.seller,
            sellToken: offer.sell_token,
            sellAmount: offer.sell_amount,
            buyToken: offer.buy_token,
            buyAmount: offer.buy_amount,
            escrowAddress: offer.escrow_address,
            minScore: offer.min_score,
            deadline: offer.deadline,
            sellerScore: rep.score,
          }
        })
      )

      return reply.send({ success: true, data: results })
    }
  )

  app.get<{ Querystring: HistoryQuery }>(
    "/offers/history",
    { schema: historySchema },
    async (request, reply) => {
      const { wallet, limit = 20 } = request.query
      const trades = await fetchHistory(supabase, wallet, limit)

      const results = trades.map((t) => ({
        id: t.id,
        seller: t.seller,
        buyer: t.buyer,
        sellToken: t.sell_token,
        sellAmount: t.sell_amount,
        buyToken: t.buy_token,
        buyAmount: t.buy_amount,
        status: t.status,
        chain: t.chain,
        createdAt: t.created_at,
      }))

      return reply.send({ success: true, data: results })
    }
  )

  app.get<{ Params: OfferParams }>(
    "/offers/:id",
    { schema: getOfferSchema },
    async (request, reply) => {
      const offer = await getOfferById(supabase, request.params.id)
      if (!offer) {
        return reply.status(404).send({ success: false, error: "Offer not found" })
      }

      const sellerRep = await getReputation(supabase, offer.seller)
      const buyerRep = offer.buyer
        ? await getReputation(supabase, offer.buyer)
        : null

      return reply.send({
        success: true,
        data: {
          id: offer.id,
          seller: offer.seller,
          buyer: offer.buyer,
          sellToken: offer.sell_token,
          sellAmount: offer.sell_amount,
          buyToken: offer.buy_token,
          buyAmount: offer.buy_amount,
          status: offer.status,
          escrowAddress: offer.escrow_address,
          minScore: offer.min_score,
          deadline: offer.deadline,
          nonce: offer.nonce,
          txHash: offer.tx_hash,
          chain: offer.chain,
          createdAt: offer.created_at,
          sellerScore: sellerRep.score,
          buyerScore: buyerRep?.score ?? null,
        },
      })
    }
  )

  app.post<{ Params: OfferParams; Body: AcceptOfferBody }>(
    "/offers/:id/accept",
    { schema: acceptOfferSchema },
    async (request, reply) => {
      const offer = await getOfferById(supabase, request.params.id)
      if (!offer) {
        return reply.status(404).send({ success: false, error: "Offer not found" })
      }
      if (offer.status !== "open") {
        return reply.status(400).send({ success: false, error: "Offer is not open" })
      }

      const { buyer } = request.body

      // Check buyer reputation meets minimum score
      const buyerRep = await getReputation(supabase, buyer)
      if (buyerRep.score < offer.min_score) {
        return reply.status(403).send({
          success: false,
          error: `Buyer score ${buyerRep.score} is below minimum ${offer.min_score}`,
        })
      }

      // Check deadline not passed
      if (new Date(offer.deadline) <= new Date()) {
        await updateOfferStatus(supabase, offer.id, "expired")
        return reply.status(400).send({ success: false, error: "Offer has expired" })
      }

      // Update offer status to matched
      await updateOfferStatus(supabase, offer.id, "matched", {
        buyer: buyer.toLowerCase(),
      })

      // Recompute address with actual buyer and deploy
      const deadline = Math.floor(new Date(offer.deadline).getTime() / 1000)
      const deployParams = {
        seller: offer.seller,
        buyer: buyer.toLowerCase(),
        sellToken: offer.sell_token,
        buyToken: offer.buy_token,
        deadline,
        nonce: BigInt(offer.nonce ?? 0),
      }

      try {
        const result = await deployEscrow(config, deployParams)

        const depositDeadline = new Date(
          Date.now() + config.depositDeadlineSeconds * 1000
        ).toISOString()

        await updateOfferStatus(supabase, offer.id, "deployed", {
          escrow_address: result.address,
          tx_hash: result.txHash,
        })

        return reply.send({
          success: true,
          data: {
            escrowAddress: result.address,
            txHash: result.txHash,
            depositDeadline,
          },
        })
      } catch (err) {
        await updateOfferStatus(supabase, offer.id, "open", { buyer: null })
        const message = err instanceof Error ? err.message : "Deploy failed"
        return reply.status(500).send({ success: false, error: message })
      }
    }
  )

  app.post<{ Params: OfferParams; Body: CancelOfferBody }>(
    "/offers/:id/cancel",
    { schema: cancelOfferSchema },
    async (request, reply) => {
      const offer = await getOfferById(supabase, request.params.id)
      if (!offer) {
        return reply.status(404).send({ success: false, error: "Offer not found" })
      }

      const { wallet } = request.body
      const walletLower = wallet.toLowerCase()

      // Only seller or buyer can cancel
      if (walletLower !== offer.seller && walletLower !== offer.buyer) {
        return reply.status(403).send({ success: false, error: "Not a participant" })
      }

      if (offer.status === "open") {
        // Pre-match cancel: no penalty
        if (walletLower !== offer.seller) {
          return reply.status(403).send({ success: false, error: "Only seller can cancel open offer" })
        }
        await updateOfferStatus(supabase, offer.id, "cancelled")
        return reply.send({ success: true, data: { penalty: false } })
      }

      if (offer.status === "matched" || offer.status === "deployed") {
        // Post-match cancel: -2 penalty
        await updateOfferStatus(supabase, offer.id, "cancelled")
        await updateReputation(supabase, walletLower, { cancellations_delta: 1 })
        return reply.send({ success: true, data: { penalty: true, scoreDelta: -2 } })
      }

      return reply.status(400).send({
        success: false,
        error: `Cannot cancel offer in status: ${offer.status}`,
      })
    }
  )
}
