import * as fs from "fs"
import type { PairSlippageOverride } from "./policy"

export interface PolicyFileConfig {
  readonly defaultSlippage: number
  readonly pairs: Readonly<Record<string, number>>
}

export function loadPolicyFile(filePath: string): {
  readonly maxSlippagePct: number
  readonly pairOverrides: ReadonlyArray<PairSlippageOverride>
} {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Policy file not found: ${filePath}`)
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as PolicyFileConfig

  if (typeof raw.defaultSlippage !== "number" || raw.defaultSlippage < 0) {
    throw new Error("Policy file: defaultSlippage must be a non-negative number")
  }

  const pairOverrides: PairSlippageOverride[] = []

  if (raw.pairs && typeof raw.pairs === "object") {
    for (const [pair, slippage] of Object.entries(raw.pairs)) {
      if (!pair.includes("/")) {
        throw new Error(`Policy file: invalid pair format "${pair}". Use "WETH/USDC"`)
      }
      if (typeof slippage !== "number" || slippage < 0) {
        throw new Error(`Policy file: slippage for "${pair}" must be a non-negative number`)
      }
      pairOverrides.push({ pair, maxSlippagePct: slippage })
    }
  }

  return {
    maxSlippagePct: raw.defaultSlippage,
    pairOverrides,
  }
}
