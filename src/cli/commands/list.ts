import { Command } from "commander"
import { listOffers } from "../../api"
import { getTokenSymbol } from "../../tokens"

interface ListOptions {
  readonly chain: string
}

function formatTable(rows: ReadonlyArray<Record<string, unknown>>): void {
  if (rows.length === 0) {
    console.info("No open offers found.")
    return
  }

  const headers = Object.keys(rows[0])
  const widths = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length))
  )

  const divider = widths.map((w) => "-".repeat(w)).join(" | ")
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(" | ")

  console.info(headerLine)
  console.info(divider)
  for (const row of rows) {
    const line = headers.map((h, i) => String(row[h] ?? "").padEnd(widths[i])).join(" | ")
    console.info(line)
  }
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("View open OTC offers")
    .option("--chain <chain>", "Filter by chain", "base-sepolia")
    .action(async (options: ListOptions) => {
      try {
        console.info(`Fetching offers on ${options.chain}...`)
        const offers = await listOffers(options.chain)

        const rows = offers.map((o) => ({
          ID: o.id,
          Sell: `${o.sellAmount} ${getTokenSymbol(o.sellToken, options.chain) ?? o.sellToken.slice(0, 10)}`,
          Buy: `${o.buyAmount} ${getTokenSymbol(o.buyToken, options.chain) ?? o.buyToken.slice(0, 10)}`,
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
