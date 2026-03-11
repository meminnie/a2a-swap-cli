import { Command } from "commander"

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .description("View past trade records")
    .option("--limit <n>", "Number of records to show", "20")
    .action(async (options: { readonly limit: string }) => {
      try {
        // TODO: query on-chain events or relay server for past trades

        console.info(`Fetching last ${options.limit} trades...`)
        console.info("TODO: implement trade history")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to fetch history: ${message}`)
        process.exit(1)
      }
    })
}
