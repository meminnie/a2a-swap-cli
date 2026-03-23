import { Command } from "commander"
import { listOffers } from "../../api"
import { getTokenSymbol } from "../../tokens"
import { formatTable, formatTokenAmount } from "../format"

interface ListOptions {
  readonly chain: string
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("View open OTC offers")
    .option("--chain <chain>", "Filter by chain", "base")
    .action(async (options: ListOptions) => {
      try {
        console.info(`Fetching offers on ${options.chain}...`)
        const offers = await listOffers(options.chain)

        const rows = offers.map((o) => ({
          ID: o.id,
          Sell: `${formatTokenAmount(o.sellAmount)} ${getTokenSymbol(o.sellToken, options.chain) ?? o.sellToken.slice(0, 10)}`,
          Buy: `${formatTokenAmount(o.buyAmount)} ${getTokenSymbol(o.buyToken, options.chain) ?? o.buyToken.slice(0, 10)}`,
          Seller: `${o.seller.slice(0, 6)}...${o.seller.slice(-4)}`,
          Score: o.sellerScore,
          MinScore: o.minScore,
          Deadline: new Date(o.deadline).toLocaleString(),
        }))

        formatTable(rows)
        console.info(`\n${offers.length} open offer(s)`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to list offers: ${message}`)
        process.exit(1)
      }
    })
}
