import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from "@virtuals-protocol/game"
import { ZeroOTC } from "../../../sdk"

export function createAcceptFunction(otc: ZeroOTC): GameFunction {
  return new GameFunction({
    name: "accept_offer",
    description: "Accept an open OTC offer — deposit tokens and settle via escrow",
    args: [
      { name: "offerId", type: "number", description: "The offer ID to accept" },
    ],
    executable: async (args: Record<string, string>) => {
      try {
        const result = await otc.accept(Number(args.offerId))
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify({
            offerId: result.offerId,
            settled: result.settled,
            txHash: result.depositTxHash,
          })
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
