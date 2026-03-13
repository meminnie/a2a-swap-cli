import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core"
import { ZeroOTC } from "../../../sdk"
import { getTokenSymbol } from "../../../tokens"

export const listAction: Action = {
  name: "LIST_OFFERS",
  similes: ["SHOW_OFFERS", "VIEW_OFFERS", "OTC_LIST"],
  description: "List open OTC swap offers from the network",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content?.text?.toLowerCase() ?? ""
    return text.includes("list") || text.includes("show") || text.includes("offers")
  },
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    try {
      const wallet = runtime.getSetting("ZERO_OTC_WALLET") as string | undefined
      const otc = ZeroOTC.fromEnv(wallet)
      const offers = await otc.listOffers()

      if (offers.length === 0) {
        if (callback) callback({ text: "No open offers found." })
        return
      }

      const lines = offers.map((o) => {
        const sell = getTokenSymbol(o.sell_token, o.chain) ?? o.sell_token.slice(0, 10)
        const buy = getTokenSymbol(o.buy_token, o.chain) ?? o.buy_token.slice(0, 10)
        return `#${o.id}: ${o.sell_amount} ${sell} → ${o.buy_amount} ${buy}`
      })

      if (callback) callback({ text: `Open offers:\n${lines.join("\n")}` })
    } catch (error) {
      if (callback) {
        callback({ text: `Failed to list offers: ${error instanceof Error ? error.message : "Unknown error"}` })
      }
    }
  },
  examples: [
    [
      { user: "user1", content: { text: "show me open offers" } },
      { user: "agent", content: { text: "Open offers:\n#1: 1000 USDC → 0.5 WETH" } },
    ],
  ],
}
