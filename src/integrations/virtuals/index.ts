import { GameWorker } from "@virtuals-protocol/game"
import { ZeroOTC } from "../../sdk"
import type { Config } from "../../config"
import { createProposeFunction } from "./functions/propose"
import { createAcceptFunction } from "./functions/accept"
import { createListFunction } from "./functions/list"
import { createRfqFunction, createQuoteFunction } from "./functions/rfq"
import { createEvaluateFunction } from "./functions/evaluate"

export function createZeroOtcWorker(configOrWallet?: Config | string): GameWorker {
  const otc = typeof configOrWallet === "string"
    ? ZeroOTC.fromEnv(configOrWallet)
    : configOrWallet
      ? new ZeroOTC(configOrWallet)
      : ZeroOTC.fromEnv()

  return new GameWorker({
    id: "zero-otc-worker",
    name: "Zero-OTC Swap Agent",
    description: "Executes peer-to-peer OTC token swaps with atomic escrow settlement on Base chain",
    functions: [
      createProposeFunction(otc),
      createAcceptFunction(otc),
      createListFunction(otc),
      createRfqFunction(otc),
      createQuoteFunction(otc),
      createEvaluateFunction(otc),
    ],
    getEnvironment: async () => ({
      chain: otc.config.chain,
      escrowAddress: otc.config.escrowAddress,
      supportedTokens: ["USDC", "WETH", "DAI", "tUSDC", "tWETH"],
    }),
  })
}
