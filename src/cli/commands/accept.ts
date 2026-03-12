import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getEscrowContract, getErc20Contract, getSigner } from "../../contract"
import { getSupabaseClient, updateOfferStatus } from "../../supabase"

export function registerAcceptCommand(program: Command): void {
  program
    .command("accept <offer-id>")
    .description("Accept an open OTC offer and settle via escrow")
    .action(async (offerId: string) => {
      try {
        const id = Number(offerId)
        if (Number.isNaN(id) || id < 0) {
          throw new Error("Invalid offer ID. Must be a non-negative number.")
        }

        const config = loadConfig()
        const escrow = getEscrowContract(config)
        const signer = getSigner(config)
        const supabase = getSupabaseClient(config)
        const signerAddress = await signer.getAddress()

        const offer = await escrow.getOffer(id)
        if (Number(offer.status) !== 0) {
          throw new Error("Offer is not open")
        }

        console.info("Accepting offer on-chain...")
        const acceptTx = await escrow.acceptOffer(id)
        console.info(`Accept tx sent: ${acceptTx.hash}`)
        await acceptTx.wait()

        await updateOfferStatus(supabase, id, "accepted", signerAddress)

        const buyToken = getErc20Contract(offer.buyToken, config)
        const buyAmount: bigint = offer.buyAmount

        console.info("Approving token transfer...")
        const approveTx = await buyToken.approve(config.escrowAddress, buyAmount)
        await approveTx.wait()

        console.info("Depositing tokens into escrow...")
        const depositTx = await escrow.deposit(id)
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
