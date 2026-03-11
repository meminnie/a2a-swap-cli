import { Command } from "commander"

export function registerAcceptCommand(program: Command): void {
  program
    .command("accept <offer-id>")
    .description("Accept an open OTC offer and settle via escrow")
    .action(async (offerId: string) => {
      try {
        // TODO: check ERC-8004 trust score of proposer
        // TODO: call escrow contract acceptOffer + deposit
        // TODO: update relay server

        console.info(`Accepting offer: ${offerId}`)
        console.info("TODO: implement escrow interaction")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to accept offer: ${message}`)
        process.exit(1)
      }
    })
}
