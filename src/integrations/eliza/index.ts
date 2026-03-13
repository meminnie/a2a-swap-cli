import type { Plugin, Provider, IAgentRuntime, Memory, State } from "@elizaos/core"
import { proposeAction } from "./actions/propose"
import { acceptAction } from "./actions/accept"
import { listAction } from "./actions/list"
import { rfqAction } from "./actions/rfq"
import { ZeroOTC } from "../../sdk"

const priceProvider: Provider = {
  name: "zero-otc-price",
  description: "Provides current token prices from CoinGecko oracle",
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    try {
      const wallet = runtime.getSetting("ZERO_OTC_WALLET") as string | undefined
      const otc = ZeroOTC.fromEnv(wallet)

      const [eth, usdc] = await Promise.all([
        otc.getPrice("WETH"),
        otc.getPrice("USDC"),
      ])

      return `Current prices: ETH $${eth.priceUsd.toFixed(2)}, USDC $${usdc.priceUsd.toFixed(4)}`
    } catch {
      return "Price data unavailable"
    }
  },
}

export const zeroOtcPlugin: Plugin = {
  name: "zero-otc",
  description: "AI agent-to-agent OTC swaps on Base — P2P trades with escrow settlement",
  actions: [proposeAction, acceptAction, listAction, rfqAction],
  providers: [priceProvider],
}
