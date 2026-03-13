import { Command } from "commander"
import { loadConfig } from "../../config"
import { getEscrowContract, getErc20Contract, getSigner } from "../../contract"
import { getSupabaseClient, updateOfferStatus } from "../../supabase"

export function registerDepositCommand(program: Command): void {
  program
    .command("deposit <offer-id>")
    .description("Deposit your tokens into escrow for an accepted offer")
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
        const status = Number(offer.status)
        const isProposer = offer.proposer.toLowerCase() === signerAddress.toLowerCase()
        const isAcceptor = offer.acceptor.toLowerCase() === signerAddress.toLowerCase()

        if (isProposer && status !== 0 && status !== 1) {
          throw new Error("Offer is not open or accepted. Current status: " + status)
        }
        if (isAcceptor && status !== 1) {
          throw new Error("Offer is not in accepted state. Current status: " + status)
        }

        if (!isProposer && !isAcceptor) {
          throw new Error("You are not a party to this offer.")
        }

        const token = isProposer
          ? getErc20Contract(offer.sellToken, config, signer)
          : getErc20Contract(offer.buyToken, config, signer)

        const amount: bigint = isProposer ? offer.sellAmount : offer.buyAmount

        let nonce = await signer.getNonce()

        console.info(`Depositing as ${isProposer ? "proposer" : "acceptor"}...`)

        console.info("Approving token transfer...")
        const approveTx = await token.approve(
          config.escrowAddress,
          amount,
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
          console.info("Deposit complete. Waiting for counterparty to deposit.")
        }

        console.info(`  Offer ID: ${id}`)
        console.info(`  Tx:       ${depositTx.hash}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to deposit: ${message}`)
        process.exit(1)
      }
    })
}
