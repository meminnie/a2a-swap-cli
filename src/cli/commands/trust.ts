import { Command } from "commander"
import { getReputation } from "../../api"

export function registerTrustCommand(program: Command): void {
  program
    .command("trust <address>")
    .description("Check reputation score for a wallet")
    .action(async (address: string) => {
      try {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          throw new Error("Invalid Ethereum address")
        }

        const rep = await getReputation(address)

        console.info(`Reputation for ${address}:`)
        console.info(`  Score:            ${rep.score}`)
        console.info(`  Successful swaps: ${rep.successfulSwaps}`)
        console.info(`  Failed swaps:     ${rep.failedSwaps}`)
        console.info(`  Cancellations:    ${rep.cancellations}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to check reputation: ${message}`)
        process.exit(1)
      }
    })
}
