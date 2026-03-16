import { Command } from "commander"
import type { ActionType } from "../../types/offer"
import { loadReadonlyConfig } from "../../config"
import { getSupabaseClient, fetchOpenOffers } from "../../supabase"
import { getTokenSymbol } from "../../tokens"

interface ListOptions {
  readonly chain: string
  readonly action: ActionType
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
    .option("--action <type>", "Filter by action type", "swap")
    .action(async (options: ListOptions) => {
      try {
        const config = loadReadonlyConfig()
        const supabase = getSupabaseClient(config)

        console.info(`Fetching ${options.action} offers on ${options.chain}...`)
        const offers = await fetchOpenOffers(supabase, options.chain, options.action)

        const rows = offers.map((o) => ({
          ID: o.id,
          Sell: `${o.sell_amount} ${getTokenSymbol(o.sell_token, options.chain) ?? o.sell_token.slice(0, 10)}`,
          Buy: `${o.buy_amount} ${getTokenSymbol(o.buy_token, options.chain) ?? o.buy_token.slice(0, 10)}`,
          Proposer: `${o.proposer.slice(0, 6)}...${o.proposer.slice(-4)}`,
          Deadline: new Date(o.deadline * 1000).toISOString(),
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
