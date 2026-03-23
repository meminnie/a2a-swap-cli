import { Command } from "commander"
import { ethers } from "ethers"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { getWethAddress } from "../../tokens"
import { unwrapWETH, getWethContract } from "../../weth"

interface UnwrapOptions {
  readonly chain: string
  readonly amount?: string
  readonly wallet?: string
}

export function registerUnwrapCommand(program: Command): void {
  program
    .command("unwrap")
    .description("Unwrap WETH → ETH (converts WETH balance to native ETH)")
    .option("--chain <chain>", "Target chain", "base")
    .option("--amount <ether>", "Amount to unwrap (default: all)")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .action(async (options: UnwrapOptions) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const wethAddress = getWethAddress(options.chain)

        const weth = getWethContract(wethAddress, signer)
        const balance: bigint = await weth.balanceOf(signer.address)

        if (balance === 0n) {
          console.info("No WETH to unwrap.")
          return
        }

        const unwrapAmount = options.amount
          ? ethers.parseEther(options.amount)
          : undefined

        if (unwrapAmount !== undefined && unwrapAmount > balance) {
          throw new Error(
            `Requested ${ethers.formatEther(unwrapAmount)} WETH but only have ${ethers.formatEther(balance)}`
          )
        }

        const displayAmount = unwrapAmount ?? balance
        console.info(`Unwrapping ${ethers.formatEther(displayAmount)} WETH → ETH...`)
        const receipt = await unwrapWETH(signer, wethAddress, unwrapAmount)

        if (receipt) {
          console.info(`Unwrapped successfully:`)
          console.info(`  Amount: ${ethers.formatEther(displayAmount)} ETH`)
          console.info(`  Tx:     ${receipt.hash}`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to unwrap: ${message}`)
        process.exit(1)
      }
    })
}
