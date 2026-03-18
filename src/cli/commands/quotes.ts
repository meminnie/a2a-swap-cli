import { Command } from "commander"
import { listQuotes } from "../../api"
import { formatTable, formatTokenAmount } from "../format"
import { parsePositiveInt } from "../validation"

export function registerQuotesCommand(program: Command): void {
  program
    .command("quotes <rfq-id>")
    .description("List quotes for an RFQ")
    .action(async (rfqId: string) => {
      try {
        console.info(`Fetching quotes for RFQ #${rfqId}...`)
        const id = parsePositiveInt(rfqId, "rfq-id")
        const quotes = await listQuotes(id)

        const rows = quotes.map((q) => ({
          ID: q.id,
          Quoter: `${q.quoter.slice(0, 6)}...${q.quoter.slice(-4)}`,
          Sell: formatTokenAmount(q.sellAmount),
          Buy: formatTokenAmount(q.buyAmount),
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
