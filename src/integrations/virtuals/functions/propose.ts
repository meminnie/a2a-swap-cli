import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from "@virtuals-protocol/game"
import { ZeroOTC } from "../../../sdk"

export function createProposeFunction(otc: ZeroOTC): GameFunction {
  return new GameFunction({
    name: "propose_swap",
    description: "Create an OTC swap offer — lock tokens in escrow and broadcast",
    args: [
      { name: "sell", type: "string", description: "Amount and token to sell (e.g. '1000 USDC')" },
      { name: "buy", type: "string", description: "Amount and token to buy (e.g. '0.5 WETH')" },
    ],
    executable: async (args: Record<string, string>) => {
      try {
        const result = await otc.propose({ sell: args.sell, buy: args.buy })
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify({ offerId: result.offerId, txHash: result.txHash })
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
