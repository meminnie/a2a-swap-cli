import { Command } from "commander"
import { loadConfig } from "../../config"
import { getEscrowContract, getSigner } from "../../contract"
import { getSupabaseClient, updateOfferStatus } from "../../supabase"

export function registerRefundCommand(program: Command): void {
  program
    .command("refund <offer-id>")
    .description("Refund deposits from an expired offer")
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
        const deadline = Number(offer.deadline)
        const now = Math.floor(Date.now() / 1000)

        if (status === 2) {
          throw new Error("Offer already settled — nothing to refund.")
        }
        if (status === 3) {
          throw new Error("Offer already cancelled.")
        }
        if (status === 4) {
          throw new Error("Offer already expired and refunded.")
        }
        if (now < deadline) {
          const remaining = deadline - now
          throw new Error(
            `Offer not yet expired. ${remaining}s remaining (deadline: ${new Date(deadline * 1000).toISOString()})`
          )
        }

        console.info("Claiming refund for expired offer...")
        const tx = await escrow.refund(id, { gasLimit: 300_000 })
        console.info(`Refund tx sent: ${tx.hash}`)
        await tx.wait()

        await updateOfferStatus(supabase, id, "expired")

        console.info("Refund complete!")
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
        console.error(`Failed to refund: ${message}`)
        process.exit(1)
      }
    })
}
