import { Command } from "commander"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { fetchHistory } from "../../api"
import { getTokenSymbol } from "../../tokens"
import { parsePositiveInt } from "../validation"

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .description("View past trade records")
    .option("--limit <n>", "Number of records to show", "20")
    .option("--chain <chain>", "Target chain", "base")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (options: { readonly limit: string; readonly chain: string; readonly wallet?: string }) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const address = await signer.getAddress()

        console.info(`Fetching last ${options.limit} trades for ${address.slice(0, 6)}...${address.slice(-4)}...`)
        const limit = parsePositiveInt(options.limit, "limit")
        const trades = await fetchHistory(address, limit)

        if (trades.length === 0) {
          console.info("No trade history found.")
          return
        }

        for (const t of trades) {
          const sellSymbol = getTokenSymbol(t.sellToken, options.chain) ?? t.sellToken.slice(0, 10)
          const buySymbol = getTokenSymbol(t.buyToken, options.chain) ?? t.buyToken.slice(0, 10)
          const role = t.seller.toLowerCase() === address.toLowerCase() ? "seller" : "buyer"
          const date = new Date(t.createdAt).toLocaleDateString()

          console.info(
            `  #${t.id} [${t.status.toUpperCase()}] ${t.sellAmount} ${sellSymbol} -> ${t.buyAmount} ${buySymbol} (${role}) ${date}`
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
