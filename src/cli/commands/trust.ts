import { Command } from "commander"

export function registerTrustCommand(program: Command): void {
  program
    .command("trust <address>")
    .description("Check ERC-8004 trust score for an address")
    .action(async (address: string) => {
      try {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          throw new Error("Invalid Ethereum address")
        }

        // TODO: query ERC-8004 trust registry contract

        console.info(`Trust score for ${address}:`)
        console.info("TODO: implement ERC-8004 query")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to check trust: ${message}`)
        process.exit(1)
      }
    })
}
