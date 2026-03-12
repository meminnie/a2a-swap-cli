import { Command } from "commander"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { getSupabaseClient, fetchHistory } from "../../supabase"
import { getTokenSymbol } from "../../tokens"

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .description("View past trade records")
    .option("--limit <n>", "Number of records to show", "20")
    .action(async (options: { readonly limit: string }) => {
      try {
        const config = loadConfig()
        const signer = getSigner(config)
        const supabase = getSupabaseClient(config)
        const address = await signer.getAddress()

        console.info(`Fetching last ${options.limit} trades for ${address.slice(0, 6)}...${address.slice(-4)}...`)
        const trades = await fetchHistory(supabase, address, Number(options.limit))

        if (trades.length === 0) {
          console.info("No trade history found.")
          return
        }

        for (const t of trades) {
          const sellSymbol = getTokenSymbol(t.sell_token, t.chain) ?? t.sell_token.slice(0, 10)
          const buySymbol = getTokenSymbol(t.buy_token, t.chain) ?? t.buy_token.slice(0, 10)
          const role = t.proposer.toLowerCase() === address.toLowerCase() ? "proposer" : "acceptor"
          const date = new Date(t.created_at).toLocaleDateString()

          console.info(
            `  #${t.id} [${t.status.toUpperCase()}] ${t.sell_amount} ${sellSymbol} -> ${t.buy_amount} ${buySymbol} (${role}) ${date}`
          )
        }

        console.info(`\n${trades.length} trade(s)`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to fetch history: ${message}`)
        process.exit(1)
      }
    })
}
