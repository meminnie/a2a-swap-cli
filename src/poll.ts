import { ethers } from "ethers"
import { getOffer } from "./api"
import { unwrapWETH } from "./weth"

const POLL_INTERVAL_MS = 10_000
const POLL_MAX_ATTEMPTS = 180 // 30 minutes

const TERMINAL_STATUSES = ["settled", "refunded", "cancelled"] as const

export async function pollAndUnwrap(
  offerId: number,
  signer: ethers.Wallet,
  wethAddress: string,
  expectedAmount?: bigint
): Promise<void> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

    try {
      const offer = await getOffer(offerId)

      if (TERMINAL_STATUSES.includes(offer.status as typeof TERMINAL_STATUSES[number])) {
        console.info(`  Offer ${offer.status}. Checking WETH balance...`)
        const receipt = await unwrapWETH(signer, wethAddress, expectedAmount)
        if (receipt) {
          console.info(`  Unwrapped WETH → ETH (tx: ${receipt.hash})`)
        } else {
          console.info("  No WETH to unwrap.")
        }
        return
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  Poll error (attempt ${i + 1}/${POLL_MAX_ATTEMPTS}): ${msg}`)
    }
  }

  console.info("  Timed out waiting for settlement. Run 'airfi-swap unwrap' manually.")
}
