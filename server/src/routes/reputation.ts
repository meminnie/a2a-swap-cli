import { FastifyInstance } from "fastify"
import type { ServerConfig } from "../config"
import { getReputationSchema } from "../schemas/reputation"
import { createSupabaseClient, getReputation } from "../supabase"

interface ReputationParams {
  readonly wallet: string
}

export async function reputationRoutes(
  app: FastifyInstance,
  opts: { readonly config: ServerConfig }
): Promise<void> {
  const supabase = createSupabaseClient(opts.config)

  app.get<{ Params: ReputationParams }>(
    "/reputation/:wallet",
    { schema: getReputationSchema },
    async (request, reply) => {
      const rep = await getReputation(supabase, request.params.wallet)
      return reply.send({
        success: true,
        data: {
          wallet: rep.wallet,
          successfulSwaps: rep.successful_swaps,
          failedSwaps: rep.failed_swaps,
          cancellations: rep.cancellations,
          score: rep.score,
        },
      })
    }
  )
}
