import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from "@virtuals-protocol/game"
import { ZeroOTC } from "../../../sdk"

export function createEvaluateFunction(otc: ZeroOTC): GameFunction {
  return new GameFunction({
    name: "evaluate_offer",
    description: "Evaluate whether an offer is a good deal using oracle price comparison",
    args: [
      { name: "sellToken", type: "string", description: "Token address being sold" },
      { name: "sellAmount", type: "string", description: "Amount being sold" },
      { name: "buyToken", type: "string", description: "Token address being bought" },
      { name: "buyAmount", type: "string", description: "Amount being bought" },
      { name: "maxSlippage", type: "number", description: "Max acceptable slippage % (default: 1)" },
    ],
    executable: async (args: Record<string, string>) => {
      try {
        const result = await otc.evaluateOffer(
          {
            sellToken: args.sellToken,
            sellAmount: args.sellAmount,
            buyToken: args.buyToken,
            buyAmount: args.buyAmount,
          },
          args.maxSlippage ? Number(args.maxSlippage) : undefined
        )
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify(result)
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
