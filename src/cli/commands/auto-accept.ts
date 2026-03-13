import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getEscrowContract, getErc20Contract, getSigner } from "../../contract"
import { getSupabaseClient, subscribeOffers, updateOfferStatus } from "../../supabase"
import type { OfferRow } from "../../supabase"
import { getTokenSymbol } from "../../tokens"
import { evaluateOffer } from "../../policy"
import type { PolicyConfig } from "../../policy"
import { loadPolicyFile } from "../../policy-config"

function formatOffer(offer: OfferRow, chain: string): string {
  const sellSymbol = getTokenSymbol(offer.sell_token, chain) ?? offer.sell_token.slice(0, 10)
  const buySymbol = getTokenSymbol(offer.buy_token, chain) ?? offer.buy_token.slice(0, 10)
  const proposer = `${offer.proposer.slice(0, 6)}...${offer.proposer.slice(-4)}`
  return `#${offer.id} | ${offer.sell_amount} ${sellSymbol} → ${offer.buy_amount} ${buySymbol} | ${proposer}`
}

async function executeAccept(
  offerId: number,
  config: ReturnType<typeof loadConfig>,
  signer: ethers.Wallet,
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<void> {
  const escrow = getEscrowContract(config, signer)
  const signerAddress = await signer.getAddress()

  const offer = await escrow.getOffer(offerId)
  if (Number(offer.status) !== 0) {
    console.info(`  [SKIP] Offer #${offerId} is no longer open`)
    return
  }

  let nonce = await signer.getNonce()

  console.info("  Accepting offer on-chain...")
  const acceptTx = await escrow.acceptOffer(offerId, { nonce: nonce++ })
  await acceptTx.wait()

  await updateOfferStatus(supabase, offerId, "accepted", signerAddress)

  const buyToken = getErc20Contract(offer.buyToken, config, signer)
  const buyAmount: bigint = offer.buyAmount

  console.info("  Approving token transfer...")
  const approveTx = await buyToken.approve(
    config.escrowAddress,
    buyAmount,
    { nonce: nonce++, gasLimit: 100_000 }
  )
  await approveTx.wait()

  console.info("  Depositing tokens into escrow...")
  const depositTx = await escrow.deposit(offerId, { nonce: nonce++, gasLimit: 300_000 })
  await depositTx.wait()

  const updatedOffer = await escrow.getOffer(offerId)
  const settled = Number(updatedOffer.status) === 2

  if (settled) {
    await updateOfferStatus(supabase, offerId, "settled")
    console.info(`  Settled! tx: ${depositTx.hash}`)
  } else {
    console.info(`  Deposited. Waiting for proposer deposit. tx: ${depositTx.hash}`)
  }
}

export function registerAutoAcceptCommand(program: Command): void {
  program
    .command("auto-accept")
    .description("Watch for new offers and auto-accept if price is within threshold")
    .option("--chain <chain>", "Filter by chain", "base-sepolia")
    .option("--max-slippage <pct>", "Max price deviation from oracle (%)", "1")
    .option("--dry-run", "Evaluate offers without accepting", false)
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .option("--policy-file <path>", "JSON file with per-pair slippage overrides")
    .action(async (options: {
      readonly chain: string
      readonly maxSlippage: string
      readonly dryRun: boolean
      readonly wallet?: string
      readonly policyFile?: string
    }) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const supabase = getSupabaseClient(config)
        const signerAddress = await signer.getAddress()
        const maxSlippagePct = Number(options.maxSlippage)

        let policyConfig: PolicyConfig = {
          maxSlippagePct,
          minTrustScore: config.minTrustScore,
          chain: options.chain,
        }

        if (options.policyFile) {
          const fileConfig = loadPolicyFile(options.policyFile)
          policyConfig = {
            ...policyConfig,
            maxSlippagePct: fileConfig.maxSlippagePct,
            pairOverrides: fileConfig.pairOverrides,
          }
        }

        console.info(`Auto-accept agent started`)
        console.info(`  Signer:       ${signerAddress}`)
        console.info(`  Chain:        ${options.chain}`)
        console.info(`  Max slippage: ${policyConfig.maxSlippagePct}% (default)`)
        if (policyConfig.pairOverrides && policyConfig.pairOverrides.length > 0) {
          for (const po of policyConfig.pairOverrides) {
            console.info(`    ${po.pair}: ${po.maxSlippagePct}%`)
          }
        }
        console.info(`  Dry run:      ${options.dryRun}`)
        console.info(`\nWatching for new offers...\n`)

        let processing = false

        subscribeOffers(
          supabase,
          async (offer) => {
            if (offer.chain !== options.chain) return
            if (offer.status !== "open") return
            if (offer.proposer.toLowerCase() === signerAddress.toLowerCase()) return
            if (processing) {
              console.info(`[BUSY] Skipping #${offer.id} — already processing another offer`)
              return
            }

            console.info(`[NEW] ${formatOffer(offer, options.chain)}`)

            try {
              processing = true
              const result = await evaluateOffer(offer, policyConfig)

              console.info(`  Receive: $${result.receiveValueUsd.toFixed(2)}`)
              console.info(`  Pay:     $${result.payValueUsd.toFixed(2)}`)
              console.info(`  Deviation: ${result.deviationPct.toFixed(2)}%`)
              console.info(`  Decision:  ${result.accept ? "ACCEPT" : "REJECT"} — ${result.reason}`)

              if (result.accept && !options.dryRun) {
                await executeAccept(offer.id, config, signer, supabase)
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown error"
              console.error(`  [ERROR] Failed to process offer #${offer.id}: ${message}`)
            } finally {
              processing = false
            }
          }
        )

        await new Promise(() => {})
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to start auto-accept: ${message}`)
        process.exit(1)
      }
    })
}
