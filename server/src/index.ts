import Fastify from "fastify"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { loadServerConfig } from "./config"
import { offerRoutes } from "./routes/offers"
import { reputationRoutes } from "./routes/reputation"
import { createSupabaseClient } from "./supabase"
import { startOperatorLoop } from "./services/operator"

async function main() {
  const config = loadServerConfig()

  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" })

  await app.register(swagger, {
    openapi: {
      info: {
        title: "zero-otc API",
        description: "P2P OTC swap API with CREATE2 escrow and reputation system",
        version: "2.0.0",
      },
      servers: [{ url: `http://localhost:${config.port}` }],
      tags: [
        { name: "offers", description: "OTC swap offer endpoints" },
        { name: "reputation", description: "Wallet reputation endpoints" },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  })

  await app.register(offerRoutes, { config })
  await app.register(reputationRoutes, { config })

  // Health check
  app.get("/health", async () => ({ status: "ok", chain: config.chain }))

  // Start operator monitoring loop
  const supabase = createSupabaseClient(config)
  startOperatorLoop(config, supabase)

  await app.listen({ port: config.port, host: config.host })
  console.info(`Server running at http://localhost:${config.port}`)
  console.info(`Swagger docs at http://localhost:${config.port}/docs`)
}

main().catch((err) => {
  console.error("Failed to start server:", err)
  process.exit(1)
})
