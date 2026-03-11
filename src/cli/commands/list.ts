import { Command } from "commander"

interface ListOptions {
  readonly chain: string
  readonly action: string
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("View open OTC offers")
    .option("--chain <chain>", "Filter by chain", "base-sepolia")
    .option("--action <type>", "Filter by action type", "swap")
    .action(async (options: ListOptions) => {
      try {
        // TODO: fetch offers from relay server
        // TODO: display as formatted table

        console.info(`Fetching ${options.action} offers on ${options.chain}...`)
        console.info("TODO: implement relay server query")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to list offers: ${message}`)
        process.exit(1)
      }
    })
}
