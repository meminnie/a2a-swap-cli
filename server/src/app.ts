import Fastify, { FastifyInstance } from "fastify"
import type { ServerConfig } from "./config"
import { offerRoutes } from "./routes/offers"
import { rfqRoutes } from "./routes/rfq"
import { reputationRoutes } from "./routes/reputation"

export async function buildApp(config: ServerConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(offerRoutes, { config })
  await app.register(rfqRoutes, { config })
  await app.register(reputationRoutes, { config })

  app.get("/health", async () => ({ status: "ok", chain: config.chain }))

  return app
}
