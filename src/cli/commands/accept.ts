import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { acceptOffer, getOffer } from "../../api"
import { ERC20_TRANSFER_ABI } from "../abi"
import { parsePositiveInt } from "../validation"

interface AcceptOptions {
  readonly wallet?: string
}

export function registerAcceptCommand(program: Command): void {
  program
    .command("accept <offer-id>")
    .description("Accept an open offer")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (offerId: string, options: AcceptOptions) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const buyerAddress = await signer.getAddress()

        // 1. Get offer details
        console.info(`Fetching offer #${offerId}...`)
        const id = parsePositiveInt(offerId, "offer-id")
        const offer = await getOffer(id)

        // 2. Accept via API → triggers contract deployment
        console.info("Accepting offer (deploying escrow)...")
        const result = await acceptOffer(id, buyerAddress, signer)

        console.info(`Escrow deployed: ${result.escrowAddress}`)
        console.info(`Deposit deadline: ${result.depositDeadline}`)

        // 3. Transfer buy tokens to deployed escrow
        const buyTokenContract = new ethers.Contract(
          offer.buyToken,
          ERC20_TRANSFER_ABI,
          signer
        )

        console.info("Transferring tokens to escrow...")
        const tx = await buyTokenContract.transfer(
          result.escrowAddress,
          BigInt(offer.buyAmount)
        )
        await tx.wait()

        console.info(`Offer accepted successfully:`)
        console.info(`  Offer ID: ${offerId}`)
        console.info(`  Escrow:   ${result.escrowAddress}`)
        console.info(`  Tx:       ${tx.hash}`)
        console.info(`  Settlement will happen automatically.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to accept offer: ${message}`)
        process.exit(1)
      }
    })
}
