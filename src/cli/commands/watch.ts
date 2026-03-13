import { Command } from "commander"
import { loadConfig } from "../../config"
import { getSupabaseClient, subscribeOffers } from "../../supabase"
import type { OfferRow } from "../../supabase"
import { getTokenSymbol } from "../../tokens"

function formatOffer(offer: OfferRow, chain: string): string {
  const sellSymbol = getTokenSymbol(offer.sell_token, chain) ?? offer.sell_token.slice(0, 10)
  const buySymbol = getTokenSymbol(offer.buy_token, chain) ?? offer.buy_token.slice(0, 10)
  const proposer = `${offer.proposer.slice(0, 6)}...${offer.proposer.slice(-4)}`
  const time = new Date().toLocaleTimeString()

  return `[${time}] #${offer.id} | ${offer.sell_amount} ${sellSymbol} -> ${offer.buy_amount} ${buySymbol} | ${proposer}`
}

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Watch for new offers in realtime")
    .option("--chain <chain>", "Filter by chain", "base-sepolia")
    .action(async (options: { readonly chain: string }) => {
      try {
        const config = loadConfig()
        const supabase = getSupabaseClient(config)

        console.info(`Watching for new offers on ${options.chain}...`)
        console.info("Press Ctrl+C to stop.\n")

        subscribeOffers(
          supabase,
          (offer) => {
            if (offer.chain === options.chain) {
              console.info(`NEW  ${formatOffer(offer, options.chain)}`)
            }
          },
          (offer) => {
            if (offer.chain === options.chain) {
              const status = offer.status.toUpperCase()
              console.info(`${status.padEnd(4)} ${formatOffer(offer, options.chain)}`)
            }
          }
        )

        await new Promise(() => {})
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to watch offers: ${message}`)
        process.exit(1)
      }
    })
}
