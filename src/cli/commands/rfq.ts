import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { resolveTokenAddress } from "../../tokens"
import { createRfq } from "../../api"

interface RfqOptions {
  readonly need: string
  readonly budget: string
  readonly chain: string
  readonly duration: string
  readonly minScore: string
  readonly wallet?: string
}

export function registerRfqCommand(program: Command): void {
  program
    .command("rfq")
    .description("Broadcast a Request for Quote")
    .requiredOption("--need <amount_token>", "What you need (e.g. '0.5 ETH')")
    .requiredOption("--budget <amount_token>", "Your budget (e.g. '1000 USDC')")
    .option("--chain <chain>", "Target chain", "base-sepolia")
    .option("--duration <seconds>", "RFQ duration in seconds", "3600")
    .option("--min-score <score>", "Minimum quoter reputation score", "0")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (options: RfqOptions) => {
      try {
        const [needAmount, needToken] = options.need.split(" ")
        const [budgetAmount, budgetToken] = options.budget.split(" ")

        if (!needAmount || !needToken || !budgetAmount || !budgetToken) {
          throw new Error("Invalid format. Use: --need '0.5 ETH' --budget '1000 USDC'")
        }

        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const sellerAddress = await signer.getAddress()

        const sellTokenAddress = resolveTokenAddress(budgetToken, options.chain)
        const buyTokenAddress = resolveTokenAddress(needToken, options.chain)
        const sellAmountWei = ethers.parseUnits(budgetAmount, 18)
        const buyAmountWei = ethers.parseUnits(needAmount, 18)

        console.info("Broadcasting RFQ...")
        const result = await createRfq({
          seller: sellerAddress,
          sellToken: sellTokenAddress,
          sellAmount: sellAmountWei.toString(),
          buyToken: buyTokenAddress,
          buyAmount: buyAmountWei.toString(),
          minScore: Number(options.minScore),
          deadlineSeconds: Number(options.duration),
        }, signer)

        console.info(`RFQ created:`)
        console.info(`  RFQ ID:   ${result.rfqId}`)
        console.info(`  Need:     ${needAmount} ${needToken}`)
        console.info(`  Budget:   ${budgetAmount} ${budgetToken}`)
        console.info(`  Deadline: ${result.deadline}`)
        console.info(`  Waiting for quotes... Use 'airfi-swap quotes ${result.rfqId}' to check.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to create RFQ: ${message}`)
        process.exit(1)
      }
    })
}
