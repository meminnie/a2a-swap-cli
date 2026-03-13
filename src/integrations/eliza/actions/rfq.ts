import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core"
import { ZeroOTC } from "../../../sdk"

export const rfqAction: Action = {
  name: "CREATE_RFQ",
  similes: ["REQUEST_QUOTE", "RFQ", "NEED_TOKEN"],
  description: "Broadcast a Request for Quote — announce what you need and your budget",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content?.text?.toLowerCase() ?? ""
    return text.includes("rfq") || text.includes("request for quote") || text.includes("need")
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const text = message.content?.text ?? ""
    const needMatch = text.match(/need\s+["']?(\d+\.?\d*\s+\w+)["']?/i)
    const budgetMatch = text.match(/budget\s+["']?(\d+\.?\d*\s+\w+)["']?/i)

    if (!needMatch || !budgetMatch) {
      if (callback) {
        callback({ text: "Please specify need and budget. Example: 'rfq need 1 WETH budget 2200 USDC'" })
      }
      return
    }

    try {
      const wallet = runtime.getSetting("ZERO_OTC_WALLET") as string | undefined
      const otc = ZeroOTC.fromEnv(wallet)
      const result = await otc.createRfq({ need: needMatch[1], budget: budgetMatch[1] })

      if (callback) {
        callback({
          text: `RFQ #${result.rfqId} broadcast! Need: ${result.needAmount}, Budget: ${result.budgetAmount}`,
        })
      }
    } catch (error) {
      if (callback) {
        callback({ text: `Failed to create RFQ: ${error instanceof Error ? error.message : "Unknown error"}` })
      }
    }
  },
  examples: [
    [
      { user: "user1", content: { text: "rfq need 1 WETH budget 2200 USDC" } },
      { user: "agent", content: { text: "RFQ #3 broadcast! Need: 1 WETH, Budget: 2200 USDC" } },
    ],
  ],
}
