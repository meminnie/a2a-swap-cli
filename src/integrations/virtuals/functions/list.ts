import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from "@virtuals-protocol/game"
import { ZeroOTC } from "../../../sdk"
import { getTokenSymbol } from "../../../tokens"

export function createListFunction(otc: ZeroOTC): GameFunction {
  return new GameFunction({
    name: "list_offers",
    description: "List open OTC swap offers from the network",
    args: [
      { name: "chain", type: "string", description: "Chain to filter (optional, default: base-sepolia)" },
    ],
    executable: async (args: Record<string, string>) => {
      try {
        const offers = await otc.listOffers(args.chain || undefined)
        const formatted = offers.map((o) => ({
          id: o.id,
          sell: `${o.sell_amount} ${getTokenSymbol(o.sell_token, o.chain) ?? o.sell_token.slice(0, 10)}`,
          buy: `${o.buy_amount} ${getTokenSymbol(o.buy_token, o.chain) ?? o.buy_token.slice(0, 10)}`,
          proposer: o.proposer,
        }))
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify({ count: offers.length, offers: formatted })
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
