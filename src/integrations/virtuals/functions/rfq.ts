import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from "@virtuals-protocol/game"
import { ZeroOTC } from "../../../sdk"

export function createRfqFunction(otc: ZeroOTC): GameFunction {
  return new GameFunction({
    name: "create_rfq",
    description: "Broadcast a Request for Quote — announce what token you need and your budget",
    args: [
      { name: "need", type: "string", description: "Token and amount needed (e.g. '1 WETH')" },
      { name: "budget", type: "string", description: "Max willing to pay (e.g. '2200 USDC')" },
    ],
    executable: async (args: Record<string, string>) => {
      try {
        const result = await otc.createRfq({ need: args.need, budget: args.budget })
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify({ rfqId: result.rfqId, need: result.needAmount, budget: result.budgetAmount })
        )
      } catch (error) {
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          error instanceof Error ? error.message : "Unknown error"
        )
      }
    },
  })
}

export function createQuoteFunction(otc: ZeroOTC): GameFunction {
  return new GameFunction({
    name: "submit_quote",
    description: "Submit a quote for an RFQ — offer your price for someone's request",
    args: [
      { name: "rfqId", type: "number", description: "The RFQ ID to quote" },
      { name: "offer", type: "string", description: "What you're offering (e.g. '0.9 WETH')" },
    ],
    executable: async (args: Record<string, string>) => {
      try {
        const result = await otc.submitQuote({
          rfqId: Number(args.rfqId),
          offer: args.offer,
        })
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify({ quoteId: result.quoteId, rfqId: result.rfqId })
        )
      } catch (error) {
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          error instanceof Error ? error.message : "Unknown error"
        )
      }
    },
  })
}
