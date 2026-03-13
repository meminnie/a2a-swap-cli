import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getEscrowContract, getErc20Contract, getSigner } from "../../contract"
import { getSupabaseClient, updateOfferStatus } from "../../supabase"

export function registerAcceptCommand(program: Command): void {
  program
    .command("accept <offer-id>")
    .description("Accept an open OTC offer and settle via escrow")
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
        const signerAddress = await signer.getAddress()

        const offer = await escrow.getOffer(id)
        if (Number(offer.status) !== 0) {
          throw new Error("Offer is not open")
        }

        let nonce = await signer.getNonce()

        console.info("Accepting offer on-chain...")
        const acceptTx = await escrow.acceptOffer(id, { nonce: nonce++ })
        console.info(`Accept tx sent: ${acceptTx.hash}`)
        await acceptTx.wait()

        await updateOfferStatus(supabase, id, "accepted", signerAddress)

        const buyToken = getErc20Contract(offer.buyToken, config, signer)
        const buyAmount: bigint = offer.buyAmount

        console.info("Approving token transfer...")
        const approveTx = await buyToken.approve(
          config.escrowAddress,
          buyAmount,
          { nonce: nonce++, gasLimit: 100_000 }
        )
        await approveTx.wait()

        console.info("Depositing tokens into escrow...")
        const depositTx = await escrow.deposit(id, { nonce: nonce++, gasLimit: 300_000 })
        console.info(`Deposit tx sent: ${depositTx.hash}`)
        await depositTx.wait()

        const updatedOffer = await escrow.getOffer(id)
        const settled = Number(updatedOffer.status) === 2

        if (settled) {
          await updateOfferStatus(supabase, id, "settled")
          console.info("Swap settled successfully!")
        } else {
          console.info("Deposit complete. Waiting for proposer to deposit.")
        }

        console.info(`  Offer ID: ${id}`)
        console.info(`  Tx:       ${depositTx.hash}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to accept offer: ${message}`)
        process.exit(1)
      }
    })
}
