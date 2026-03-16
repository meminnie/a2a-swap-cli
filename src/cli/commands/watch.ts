import { Command } from "commander"
import { listOffers } from "../../api"
import type { OfferListItem } from "../../api"
import { getTokenSymbol } from "../../tokens"

function formatOffer(offer: OfferListItem, chain: string): string {
  const sellSymbol = getTokenSymbol(offer.sellToken, chain) ?? offer.sellToken.slice(0, 10)
  const buySymbol = getTokenSymbol(offer.buyToken, chain) ?? offer.buyToken.slice(0, 10)
  const seller = `${offer.seller.slice(0, 6)}...${offer.seller.slice(-4)}`
  const time = new Date().toLocaleTimeString()

  return `[${time}] #${offer.id} | ${offer.sellAmount} ${sellSymbol} -> ${offer.buyAmount} ${buySymbol} | ${seller} (score: ${offer.sellerScore})`
}

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Watch for new offers (polls API every 10s)")
    .option("--chain <chain>", "Filter by chain", "base-sepolia")
    .option("--interval <seconds>", "Poll interval in seconds", "10")
    .action(async (options: { readonly chain: string; readonly interval: string }) => {
      try {
        const intervalMs = Number(options.interval) * 1000
        const seenIds = new Set<number>()

        console.info(`Watching for new offers on ${options.chain} (polling every ${options.interval}s)...`)
        console.info("Press Ctrl+C to stop.\n")

        const poll = async (): Promise<void> => {
          try {
            const offers = await listOffers(options.chain)

            for (const offer of offers) {
              if (!seenIds.has(offer.id)) {
                seenIds.add(offer.id)
                console.info(`NEW  ${formatOffer(offer, options.chain)}`)
              }
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error(`Poll error: ${message}`)
          }
        }

        await poll()
        setInterval(poll, intervalMs)
        await new Promise(() => {})
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to watch offers: ${message}`)
        process.exit(1)
      }
    })
}
