import { Command } from "commander"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { cancelOffer, getOffer } from "../../api"
import { TRADE_ESCROW_CANCEL_ABI } from "../abi"
import { parsePositiveInt } from "../validation"
import {
  type TransactionSender,
  createEoaSender,
  createGaslessSender,
} from "../../transaction-sender"
import { loadGaslessConfig, requireGasless } from "../../gasless"

interface CancelOptions {
  readonly wallet?: string
  readonly gasless?: boolean
}

export function registerCancelCommand(program: Command): void {
  program
    .command("cancel <offer-id>")
    .description("Cancel an offer (penalty if already matched)")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .option("--gasless", "Use ZeroDev Smart Account for gasless transactions")
    .action(async (offerId: string, options: CancelOptions) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const wallet = await signer.getAddress()

        // 1. Fetch offer first (need chain for gasless SA)
        const id = parsePositiveInt(offerId, "offer-id")
        const offer = await getOffer(id)
        const chain = offer.chain ?? "base-sepolia"

        // 2. Create sender with correct chain
        let sender: TransactionSender

        if (options.gasless) {
          await requireGasless()
          const gaslessConfig = loadGaslessConfig()
          sender = await createGaslessSender(config.privateKey, gaslessConfig, chain)
          console.info(`Smart Account: ${sender.address}`)
        } else {
          sender = createEoaSender(signer)
        }

        // 3. On-chain cancel if deployed
        if (offer.status === "deployed" && offer.escrowAddress) {
          console.info(`Cancelling on-chain (escrow at ${offer.escrowAddress})...`)
          const cancelResult = await sender.sendContractCall(
            offer.escrowAddress,
            TRADE_ESCROW_CANCEL_ABI,
            "cancel",
            []
          )
          console.info(`On-chain cancel tx: ${cancelResult.hash}`)
        }

        // 4. API cancel
        console.info(`Cancelling offer #${offerId}...`)
        const result = await cancelOffer(id, wallet, signer)

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
