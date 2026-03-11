import { Command } from "commander"
import type { ActionType } from "../../types/offer"

interface ProposeOptions {
  readonly action: ActionType
  readonly sell: string
  readonly buy: string
  readonly chain: string
  readonly duration: string
}

export function registerProposeCommand(program: Command): void {
  program
    .command("propose")
    .description("Create a new OTC swap offer")
    .requiredOption("--sell <amount_token>", "Amount and token to sell (e.g. '1000 USDC')")
    .requiredOption("--buy <amount_token>", "Amount and token to buy (e.g. '0.5 ETH')")
    .option("--action <type>", "Action type (swap, rfq, lend, hedge, bridge)", "swap")
    .option("--chain <chain>", "Target chain", "base-sepolia")
    .option("--duration <seconds>", "Offer duration in seconds", "3600")
    .action(async (options: ProposeOptions) => {
      try {
        const [sellAmount, sellToken] = options.sell.split(" ")
        const [buyAmount, buyToken] = options.buy.split(" ")

        if (!sellAmount || !sellToken || !buyAmount || !buyToken) {
          throw new Error("Invalid format. Use: --sell '1000 USDC' --buy '0.5 ETH'")
        }

        // TODO: connect to escrow contract and create on-chain offer
        // TODO: broadcast to relay server

        console.info(`Offer created:`)
        console.info(`  Action:   ${options.action}`)
        console.info(`  Sell:     ${sellAmount} ${sellToken}`)
        console.info(`  Buy:      ${buyAmount} ${buyToken}`)
        console.info(`  Chain:    ${options.chain}`)
        console.info(`  Duration: ${options.duration}s`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to create offer: ${message}`)
        process.exit(1)
      }
    })
}
