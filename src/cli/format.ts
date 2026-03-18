import { ethers } from "ethers"

export function formatTokenAmount(wei: string, decimals: number = 18): string {
  return ethers.formatUnits(wei, decimals)
}

export function formatTable(rows: ReadonlyArray<Record<string, unknown>>): void {
  if (rows.length === 0) {
    console.info("No results found.")
    return
  }

  const headers = Object.keys(rows[0])
  const widths = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length))
  )

  const divider = widths.map((w) => "-".repeat(w)).join(" | ")
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(" | ")

  console.info(headerLine)
  console.info(divider)
  for (const row of rows) {
    const line = headers.map((h, i) => String(row[h] ?? "").padEnd(widths[i])).join(" | ")
    console.info(line)
  }
}
