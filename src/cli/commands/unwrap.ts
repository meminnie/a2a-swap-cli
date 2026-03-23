import { Command } from "commander"
import { ethers } from "ethers"
import { createPublicClient, http, type Hex } from "viem"
import { baseSepolia } from "viem/chains"
import { loadConfig } from "../../config"
import { getSigner } from "../../contract"
import { getWethAddress } from "../../tokens"
import { unwrapWETH, getWethContract } from "../../weth"
import { loadGaslessConfig, requireGasless } from "../../gasless"
import { createSmartAccount } from "../../gasless/account"
import { gaslessUnwrapWETH } from "../../gasless/wrap-helper"

interface UnwrapOptions {
  readonly chain: string
  readonly amount?: string
  readonly wallet?: string
  readonly gasless?: boolean
}

const WETH_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export function registerUnwrapCommand(program: Command): void {
  program
    .command("unwrap")
    .description("Unwrap WETH → ETH (converts WETH balance to native ETH)")
    .option("--chain <chain>", "Target chain", "base-sepolia")
    .option("--amount <ether>", "Amount to unwrap (default: all)")
    .option("--wallet <name>", "Wallet name (loads PRIVATE_KEY_<NAME> from .env)")
    .option("--gasless", "Use ZeroDev Smart Account for gasless transactions")
    .action(async (options: UnwrapOptions) => {
      try {
        const config = loadConfig(options.wallet)
        const signer = getSigner(config)
        const wethAddress = getWethAddress(options.chain)

        if (options.gasless) {
          await requireGasless()
          const gaslessConfig = loadGaslessConfig()
          const { kernelClient, smartAccountAddress } = await createSmartAccount(
            config.privateKey,
            gaslessConfig,
            options.chain
          )

          console.info(`Smart Account: ${smartAccountAddress}`)

          const publicClient = createPublicClient({
            chain: baseSepolia,
            transport: http(),
          })

          const balance = await publicClient.readContract({
            address: wethAddress as Hex,
            abi: WETH_BALANCE_ABI,
            functionName: "balanceOf",
            args: [smartAccountAddress as Hex],
          })

          if (balance === 0n) {
            console.info("No WETH to unwrap in Smart Account.")
            return
          }

          const unwrapAmount = options.amount
            ? ethers.parseEther(options.amount)
            : balance

          if (unwrapAmount > balance) {
            throw new Error(
              `Requested ${ethers.formatEther(unwrapAmount)} WETH but SA only has ${ethers.formatEther(balance)}`
            )
          }

          console.info(`Unwrapping ${ethers.formatEther(unwrapAmount)} WETH → ETH (gasless)...`)
          const txHash = await gaslessUnwrapWETH(kernelClient, wethAddress, unwrapAmount)

          console.info(`Unwrapped successfully:`)
          console.info(`  Amount: ${ethers.formatEther(unwrapAmount)} ETH`)
          console.info(`  Tx:     ${txHash}`)
        } else {
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
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`Failed to unwrap: ${message}`)
        process.exit(1)
      }
    })
}
