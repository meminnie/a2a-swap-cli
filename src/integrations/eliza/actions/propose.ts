import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core"
import { ZeroOTC } from "../../../sdk"

export const proposeAction: Action = {
  name: "PROPOSE_SWAP",
  similes: ["CREATE_OFFER", "MAKE_SWAP", "OTC_PROPOSE"],
  description: "Create an OTC swap offer — lock tokens in escrow and broadcast to the network",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content?.text?.toLowerCase() ?? ""
    return text.includes("propose") || text.includes("swap") || text.includes("offer")
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const text = message.content?.text ?? ""
    const sellMatch = text.match(/sell\s+["']?(\d+\.?\d*\s+\w+)["']?/i)
    const buyMatch = text.match(/buy\s+["']?(\d+\.?\d*\s+\w+)["']?/i)

    if (!sellMatch || !buyMatch) {
      if (callback) {
        callback({ text: "Please specify what to sell and buy. Example: 'propose swap sell 1000 USDC buy 0.5 WETH'" })
      }
      return
    }

    try {
      const wallet = runtime.getSetting("ZERO_OTC_WALLET") as string | undefined
      const otc = ZeroOTC.fromEnv(wallet)
      const result = await otc.propose({ sell: sellMatch[1], buy: buyMatch[1] })

      if (callback) {
        callback({
          text: `Offer created! ID: ${result.offerId}, Sell: ${result.sellAmount} → Buy: ${result.buyAmount}, Tx: ${result.txHash}`,
        })
      }
    } catch (error) {
      if (callback) {
        callback({ text: `Failed to create offer: ${error instanceof Error ? error.message : "Unknown error"}` })
      }
    }
  },
  examples: [
    [
      { user: "user1", content: { text: "propose swap sell 1000 USDC buy 0.5 WETH" } },
      { user: "agent", content: { text: "Offer created! ID: 5, Sell: 1000 USDC → Buy: 0.5 WETH" } },
    ],
  ],
}
