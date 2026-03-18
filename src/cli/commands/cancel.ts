import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { cancelOffer, getOffer } from "../../api"
import { TRADE_ESCROW_CANCEL_ABI } from "../abi"

interface CancelOptions {
  readonly wallet?: string
}

export function registerCancelCommand(program: Command): void {
  program
    .command("cancel <offer-id>")
    .description("Cancel an offer (penalty if already matched)")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (offerId: string, options: CancelOptions) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const wallet = await signer.getAddress()

        const offer = await getOffer(Number(offerId))

        if (offer.status === "deployed" && offer.escrowAddress) {
          console.info(`Cancelling on-chain (escrow at ${offer.escrowAddress})...`)
          const escrow = new ethers.Contract(
            offer.escrowAddress,
            TRADE_ESCROW_CANCEL_ABI,
            signer
          )
          const tx = await escrow.cancel()
          const receipt = await tx.wait()
          console.info(`On-chain cancel tx: ${receipt.hash}`)
        }

        console.info(`Cancelling offer #${offerId}...`)
        const result = await cancelOffer(Number(offerId), wallet)

        if (result.penalty) {
          console.info(`Offer #${offerId} cancelled with penalty (score ${result.scoreDelta})`)
        } else {
          console.info(`Offer #${offerId} cancelled (no penalty)`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to cancel offer: ${message}`)
        process.exit(1)
      }
    })
}
