import { Command } from "commander"
import { loadConfig } from "../../config"
import { getEscrowContract, getSigner } from "../../contract"
import { getSupabaseClient, updateOfferStatus } from "../../supabase"

export function registerClaimTimeoutCommand(program: Command): void {
  program
    .command("claim-timeout <offer-id>")
    .description("Claim deposit timeout — refund when counterparty didn't deposit in time")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (offerId: string, options: { readonly wallet?: string }) => {
      try {
        const id = Number(offerId)
        if (Number.isNaN(id) || id < 0) {
          throw new Error("Invalid offer ID. Must be a non-negative number.")
        }

        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const escrow = getEscrowContract(config, signer)
        const supabase = getSupabaseClient(config)

        const offer = await escrow.getOffer(id)
        const status = Number(offer.status)

        if (status !== 1) {
          throw new Error("Offer is not in Accepted state.")
        }

        const depositDeadline = Number(offer.depositDeadline)
        const now = Math.floor(Date.now() / 1000)

        if (now < depositDeadline) {
          const remaining = depositDeadline - now
          throw new Error(
            `Deposit window not expired. ${remaining}s remaining (deadline: ${new Date(depositDeadline * 1000).toISOString()})`
          )
        }

        if (offer.proposerDeposited && offer.acceptorDeposited) {
          throw new Error("Both parties deposited — offer should have settled.")
        }

        console.info("Claiming deposit timeout...")
        const tx = await escrow.claimDepositTimeout(id, { gasLimit: 300_000 })
        console.info(`Tx sent: ${tx.hash}`)
        await tx.wait()

        await updateOfferStatus(supabase, id, "expired")

        console.info("Deposit timeout claimed!")
        console.info(`  Offer ID: ${id}`)
        console.info(`  Tx:       ${tx.hash}`)

        if (offer.proposerDeposited) {
          console.info(`  Refunded: proposer deposit (sellToken)`)
        }
        if (offer.acceptorDeposited) {
          console.info(`  Refunded: acceptor deposit (buyToken)`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to claim timeout: ${message}`)
        process.exit(1)
      }
    })
}
