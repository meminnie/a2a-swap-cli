import { Command } from "commander"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { getSupabaseClient, insertRfq, subscribeQuotes } from "../../supabase"
import type { QuoteRow } from "../../supabase"
import { resolveTokenAddress, getTokenSymbol } from "../../tokens"

interface RfqOptions {
  readonly need: string
  readonly budget: string
  readonly chain: string
  readonly duration: string
  readonly wallet?: string
  readonly watch: boolean
}

function formatQuote(quote: QuoteRow, chain: string): string {
  const sellSymbol = getTokenSymbol(quote.sell_token, chain) ?? quote.sell_token.slice(0, 10)
  const buySymbol = getTokenSymbol(quote.buy_token, chain) ?? quote.buy_token.slice(0, 10)
  const quoter = `${quote.quoter.slice(0, 6)}...${quote.quoter.slice(-4)}`
  return `Quote #${quote.id} | ${quote.sell_amount} ${sellSymbol} for ${quote.buy_amount} ${buySymbol} | ${quoter}`
}

export function registerRfqCommand(program: Command): void {
  program
    .command("rfq")
    .description("Broadcast a Request for Quote — 'I need X, willing to pay up to Y'")
    .requiredOption("--need <amount_token>", "Token and amount you need (e.g. '1 WETH')")
    .requiredOption("--budget <amount_token>", "Max you're willing to pay (e.g. '2200 USDC')")
    .option("--chain <chain>", "Target chain", "base-sepolia")
    .option("--duration <seconds>", "RFQ duration in seconds", "1800")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .option("--watch", "Watch for incoming quotes in realtime", false)
    .action(async (options: RfqOptions) => {
      try {
        const [needAmount, needToken] = options.need.split(" ")
        const [budgetAmount, budgetToken] = options.budget.split(" ")

        if (!needAmount || !needToken || !budgetAmount || !budgetToken) {
          throw new Error("Invalid format. Use: --need '1 WETH' --budget '2200 USDC'")
        }

        const needNum = Number(needAmount)
        const budgetNum = Number(budgetAmount)
        if (Number.isNaN(needNum) || needNum <= 0) {
          throw new Error(`Invalid need amount: ${needAmount}. Must be a positive number.`)
        }
        if (Number.isNaN(budgetNum) || budgetNum <= 0) {
          throw new Error(`Invalid budget amount: ${budgetAmount}. Must be a positive number.`)
        }

        const duration = Number(options.duration)
        if (Number.isNaN(duration) || duration <= 0) {
          throw new Error("Invalid duration.")
        }

        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const supabase = getSupabaseClient(config)
        const signerAddress = await signer.getAddress()

        const needTokenAddress = resolveTokenAddress(needToken, options.chain)
        const budgetTokenAddress = resolveTokenAddress(budgetToken, options.chain)

        const rfq = await insertRfq(supabase, {
          action_type: "rfq",
          proposer: signerAddress,
          buy_token: needTokenAddress,
          buy_amount: needAmount,
          sell_token: budgetTokenAddress,
          sell_amount: budgetAmount,
          chain: options.chain,
          deadline: Math.floor(Date.now() / 1000) + duration,
        })

        console.info("RFQ broadcast successfully:")
        console.info(`  RFQ ID:   ${rfq.id}`)
        console.info(`  Need:     ${needAmount} ${needToken}`)
        console.info(`  Budget:   ${budgetAmount} ${budgetToken}`)
        console.info(`  Chain:    ${options.chain}`)
        console.info(`  Duration: ${duration}s`)
        console.info(`\nOther agents can respond with:`)
        console.info(`  npx ts-node src/cli/index.ts quote ${rfq.id} --offer "<amount> ${needToken}"`)

        if (options.watch) {
          console.info(`\nWatching for quotes...\n`)
          subscribeQuotes(supabase, rfq.id, (quote) => {
            console.info(`[QUOTE] ${formatQuote(quote, options.chain)}`)
          })
          await new Promise(() => {})
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to create RFQ: ${message}`)
        process.exit(1)
      }
    })
}
