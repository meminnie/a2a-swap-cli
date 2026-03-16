import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { acceptOffer, getOffer } from "../../api"

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
        const offer = await getOffer(Number(offerId))

        // 2. Accept via API → triggers contract deployment
        console.info("Accepting offer (deploying escrow)...")
        const result = await acceptOffer(Number(offerId), buyerAddress)

        console.info(`Escrow deployed: ${result.escrowAddress}`)
        console.info(`Deposit deadline: ${result.depositDeadline}`)

        // 3. Transfer buy tokens to deployed escrow
        const buyToken = offer.buy_token as string
        const buyAmount = offer.buy_amount as string

        const buyTokenContract = new ethers.Contract(
          buyToken,
          ["function transfer(address to, uint256 amount) returns (bool)"],
          signer
        )

        console.info("Transferring tokens to escrow...")
        const tx = await buyTokenContract.transfer(
          result.escrowAddress,
          BigInt(buyAmount)
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
