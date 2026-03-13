import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core"
import { ZeroOTC } from "../../../sdk"

export const acceptAction: Action = {
  name: "ACCEPT_OFFER",
  similes: ["TAKE_OFFER", "ACCEPT_SWAP", "OTC_ACCEPT"],
  description: "Accept an open OTC offer — deposit tokens and settle via escrow",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content?.text?.toLowerCase() ?? ""
    return text.includes("accept") && (text.includes("offer") || /\d/.test(text))
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const text = message.content?.text ?? ""
    const idMatch = text.match(/(?:accept|offer)\s+#?(\d+)/i)

    if (!idMatch) {
      if (callback) {
        callback({ text: "Please specify the offer ID. Example: 'accept offer 5'" })
      }
      return
    }

    try {
      const wallet = runtime.getSetting("ZERO_OTC_WALLET") as string | undefined
      const otc = ZeroOTC.fromEnv(wallet)
      const result = await otc.accept(Number(idMatch[1]))

      if (callback) {
        callback({
          text: `Offer #${result.offerId} ${result.settled ? "settled!" : "accepted, waiting for counterparty deposit."} Tx: ${result.depositTxHash}`,
        })
      }
    } catch (error) {
      if (callback) {
        callback({ text: `Failed to accept: ${error instanceof Error ? error.message : "Unknown error"}` })
      }
    }
  },
  examples: [
    [
      { user: "user1", content: { text: "accept offer 5" } },
      { user: "agent", content: { text: "Offer #5 settled! Tx: 0x..." } },
    ],
  ],
}
