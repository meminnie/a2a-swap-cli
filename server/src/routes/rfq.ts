import { FastifyInstance } from "fastify"
import type { ServerConfig } from "../config"
import {
  createRfqSchema,
  submitQuoteSchema,
  listQuotesSchema,
  pickQuoteSchema,
} from "../schemas/rfq"
import {
  insertOffer,
  getOfferById,
  updateOfferStatus,
  insertQuote,
  fetchQuotesForRfq,
  getQuoteById,
  updateQuoteStatus,
  rejectOtherQuotes,
  getReputation,
  createSupabaseClient,
} from "../supabase"
import { computeEscrowAddress, deployEscrow, getFactory } from "../contract"

interface CreateRfqBody {
  readonly seller: string
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
  readonly minScore?: number
  readonly deadlineSeconds?: number
}

interface SubmitQuoteBody {
  readonly quoter: string
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
}

interface RfqParams {
  readonly id: number
}

interface PickParams {
  readonly id: number
  readonly quoteId: number
}

export async function rfqRoutes(
  app: FastifyInstance,
  opts: { readonly config: ServerConfig }
): Promise<void> {
  const { config } = opts
  const supabase = createSupabaseClient(config)

  // Create RFQ (offchain only, no escrow address yet)
  app.post<{ Body: CreateRfqBody }>(
    "/rfq",
    { schema: createRfqSchema },
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

      const now = Math.floor(Date.now() / 1000)
      const deadline = now + deadlineSeconds

      const rfq = await insertOffer(supabase, {
        seller: seller.toLowerCase(),
        sell_token: sellToken,
        sell_amount: sellAmount,
        buy_token: buyToken,
        buy_amount: buyAmount,
        action_type: "rfq",
        chain: config.chain,
        deadline: new Date(deadline * 1000).toISOString(),
        min_score: minScore,
      })

      return reply.send({
        success: true,
        data: {
          rfqId: rfq.id,
          deadline: new Date(deadline * 1000).toISOString(),
        },
      })
    }
  )

  // Submit quote for an RFQ
  app.post<{ Params: RfqParams; Body: SubmitQuoteBody }>(
    "/rfq/:id/quote",
    { schema: submitQuoteSchema },
    async (request, reply) => {
      const rfq = await getOfferById(supabase, request.params.id)
      if (!rfq) {
        return reply.status(404).send({ success: false, error: "RFQ not found" })
      }
      if (rfq.action_type !== "rfq") {
        return reply.status(400).send({ success: false, error: "Not an RFQ" })
      }
      if (rfq.status !== "open") {
        return reply.status(400).send({ success: false, error: "RFQ is not open" })
      }
      if (new Date(rfq.deadline) <= new Date()) {
        return reply.status(400).send({ success: false, error: "RFQ has expired" })
      }

      const { quoter, sellToken, sellAmount, buyToken, buyAmount } = request.body

      // Check quoter reputation
      const quoterRep = await getReputation(supabase, quoter)
      if (quoterRep.score < rfq.min_score) {
        return reply.status(403).send({
          success: false,
          error: `Quoter score ${quoterRep.score} is below minimum ${rfq.min_score}`,
        })
      }

      const quote = await insertQuote(supabase, {
        rfq_id: rfq.id,
        quoter: quoter.toLowerCase(),
        sell_token: sellToken,
        sell_amount: sellAmount,
        buy_token: buyToken,
        buy_amount: buyAmount,
        chain: config.chain,
      })

      return reply.send({
        success: true,
        data: { quoteId: quote.id },
      })
    }
  )

  // List quotes for an RFQ (with quoter scores)
  app.get<{ Params: RfqParams }>(
    "/rfq/:id/quotes",
    { schema: listQuotesSchema },
    async (request, reply) => {
      const rfq = await getOfferById(supabase, request.params.id)
      if (!rfq) {
        return reply.status(404).send({ success: false, error: "RFQ not found" })
      }

      const quotes = await fetchQuotesForRfq(supabase, rfq.id)

      const results = await Promise.all(
        quotes.map(async (q) => {
          const rep = await getReputation(supabase, q.quoter)
          return {
            id: q.id,
            quoter: q.quoter,
            sellToken: q.sell_token,
            sellAmount: q.sell_amount,
            buyToken: q.buy_token,
            buyAmount: q.buy_amount,
            status: q.status,
            quoterScore: rep.score,
          }
        })
      )

      return reply.send({ success: true, data: results })
    }
  )

  // Pick a quote — deploys escrow, rejects other quotes
  app.post<{ Params: PickParams }>(
    "/rfq/:id/pick/:quoteId",
    { schema: pickQuoteSchema },
    async (request, reply) => {
      const rfq = await getOfferById(supabase, request.params.id)
      if (!rfq) {
        return reply.status(404).send({ success: false, error: "RFQ not found" })
      }
      if (rfq.action_type !== "rfq") {
        return reply.status(400).send({ success: false, error: "Not an RFQ" })
      }
      if (rfq.status !== "open") {
        return reply.status(400).send({ success: false, error: "RFQ is not open" })
      }

      const quote = await getQuoteById(supabase, request.params.quoteId)
      if (!quote) {
        return reply.status(404).send({ success: false, error: "Quote not found" })
      }
      if (quote.rfq_id !== rfq.id) {
        return reply.status(400).send({ success: false, error: "Quote does not belong to this RFQ" })
      }
      if (quote.status !== "pending") {
        return reply.status(400).send({ success: false, error: "Quote is not pending" })
      }

      // Accept this quote, reject others
      await updateQuoteStatus(supabase, quote.id, "accepted")
      await rejectOtherQuotes(supabase, rfq.id, quote.id)

      // RFQ requester = seller, quoter = buyer
      const seller = rfq.seller
      const buyer = quote.quoter

      const factory = getFactory(config)
      const nonceTx = await factory.useNonce()
      await nonceTx.wait()
      const nonce = (await factory.nextNonce()) - 1n

      const deadline = Math.floor(new Date(rfq.deadline).getTime() / 1000)

      const deployParams = {
        seller,
        buyer,
        sellToken: quote.sell_token,
        buyToken: quote.buy_token,
        deadline,
        nonce,
      }

      try {
        const result = await deployEscrow(config, deployParams)

        const depositDeadline = new Date(
          Date.now() + config.depositDeadlineSeconds * 1000
        ).toISOString()

        await updateOfferStatus(supabase, rfq.id, "deployed", {
          buyer: buyer,
          escrow_address: result.address,
          nonce: Number(nonce),
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
        // Rollback quote status
        await updateQuoteStatus(supabase, quote.id, "pending")
        const message = err instanceof Error ? err.message : "Deploy failed"
        return reply.status(500).send({ success: false, error: message })
      }
    }
  )
}
