import { Command } from "commander"
import { listQuotes } from "../../api"

function formatTable(rows: ReadonlyArray<Record<string, unknown>>): void {
  if (rows.length === 0) {
    console.info("No quotes found.")
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

export function registerQuotesCommand(program: Command): void {
  program
    .command("quotes <rfq-id>")
    .description("List quotes for an RFQ")
    .action(async (rfqId: string) => {
      try {
        console.info(`Fetching quotes for RFQ #${rfqId}...`)
        const quotes = await listQuotes(Number(rfqId))

        const rows = quotes.map((q) => ({
          ID: q.id,
          Quoter: `${q.quoter.slice(0, 6)}...${q.quoter.slice(-4)}`,
          Sell: q.sellAmount,
          Buy: q.buyAmount,
          Score: q.quoterScore,
          Status: q.status,
        }))

        formatTable(rows)
        console.info(`\n${quotes.length} quote(s)`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to list quotes: ${message}`)
        process.exit(1)
      }
    })
}
