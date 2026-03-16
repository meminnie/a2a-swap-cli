import { Command } from "commander"
import { ethers } from "ethers"
import { loadReadonlyConfig } from "../../config"
import { getProvider } from "../../contract"

const TRUST_REGISTRY_ABI = [
  "function getScore(address account) view returns (uint256)",
  "function hasMinScore(address account, uint256 minScore) view returns (bool)",
]

export function registerTrustCommand(program: Command): void {
  program
    .command("trust <address>")
    .description("Check ERC-8004 trust score for an address")
    .action(async (address: string) => {
      try {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          throw new Error("Invalid Ethereum address")
        }

        const config = loadReadonlyConfig()

        if (!config.trustRegistryAddress) {
          console.info(`Trust score for ${address}:`)
          console.info("  Trust registry not configured.")
          console.info("  Set TRUST_REGISTRY_ADDRESS in .env to enable ERC-8004 trust checks.")
          return
        }

        const provider = getProvider(config)
        const registry = new ethers.Contract(
          config.trustRegistryAddress,
          TRUST_REGISTRY_ABI,
          provider
        )

        const score: bigint = await registry.getScore(address)
        const meetsMin: boolean = await registry.hasMinScore(address, config.minTrustScore)

        console.info(`Trust score for ${address}:`)
        console.info(`  Score:     ${score.toString()}`)
        console.info(`  Min required: ${config.minTrustScore}`)
        console.info(`  Eligible:  ${meetsMin ? "YES" : "NO"}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to check trust: ${message}`)
        process.exit(1)
      }
    })
}
