import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { acceptOffer, getOffer } from "../../api"
import { getWethAddress } from "../../tokens"
import { wrapETH } from "../../weth"
import { pollAndUnwrap } from "../../poll"
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

        // 3. Wrap ETH if buyer is paying with native token
        const buyAmount = BigInt(offer.buyAmount)
        const chain = offer.chain ?? "base"
        const wethAddress = getWethAddress(chain)
        const isBuyNative = offer.buyToken.toLowerCase() === wethAddress.toLowerCase()

        if (isBuyNative) {
          console.info("Wrapping ETH → WETH...")
          await wrapETH(signer, wethAddress, buyAmount)
        }

        // 4. Transfer buy tokens to deployed escrow
        const buyTokenContract = new ethers.Contract(
          offer.buyToken,
          ERC20_TRANSFER_ABI,
          signer
        )

        console.info("Transferring tokens to escrow...")
        const tx = await buyTokenContract.transfer(
          result.escrowAddress,
          buyAmount
        )
        await tx.wait()

        console.info(`Offer accepted successfully:`)
        console.info(`  Offer ID: ${offerId}`)
        console.info(`  Escrow:   ${result.escrowAddress}`)
        console.info(`  Tx:       ${tx.hash}`)

        // 5. Poll for settlement, then auto-unwrap if receiving WETH
        const sellToken = offer.sellToken.toLowerCase()
        const willReceiveWeth = sellToken === wethAddress.toLowerCase()
        const sellAmount = BigInt(offer.sellAmount)

        if (willReceiveWeth || isBuyNative) {
          const unwrapAmount = willReceiveWeth ? sellAmount : buyAmount
          console.info("  Waiting for settlement to auto-unwrap WETH → ETH...")
          console.info("  (Press Ctrl+C to skip — you can unwrap manually later)")
          await pollAndUnwrap(id, signer, wethAddress, unwrapAmount)
        } else {
          console.info("  Settlement will happen automatically.")
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to accept offer: ${message}`)
        process.exit(1)
      }
    })
}
