import { ethers } from "ethers"
import type { Abi } from "viem"
import type { KernelClient } from "./account"
import { sendGaslessTransaction } from "./transaction"

const WETH_DEPOSIT_ABI: Abi = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
]

const WETH_WITHDRAW_ABI: Abi = [
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
]

export async function fundAndWrapETH(
  eoaSigner: ethers.Wallet,
  smartAccountAddress: string,
  kernelClient: KernelClient,
  wethAddress: string,
  amount: bigint
): Promise<{ readonly fundTxHash: string; readonly wrapTxHash: string }> {
  const balance = await eoaSigner.provider!.getBalance(eoaSigner.address)
  const gasEstimate = ethers.parseEther("0.002")

  if (balance < amount + gasEstimate) {
    throw new Error(
      `Insufficient ETH in EOA. Need ${ethers.formatEther(amount + gasEstimate)} (${ethers.formatEther(amount)} + gas), have ${ethers.formatEther(balance)}`
    )
  }

  console.info(`  Funding Smart Account with ${ethers.formatEther(amount)} ETH...`)
  const fundTx = await eoaSigner.sendTransaction({
    to: smartAccountAddress,
    value: amount,
  })
  await fundTx.wait()

  console.info(`  Wrapping ETH → WETH via Smart Account (gasless)...`)
  const wrapTxHash = await sendGaslessTransaction(
    kernelClient,
    wethAddress,
    WETH_DEPOSIT_ABI,
    "deposit",
    [],
    amount
  )

  return { fundTxHash: fundTx.hash, wrapTxHash }
}

export async function gaslessUnwrapWETH(
  kernelClient: KernelClient,
  wethAddress: string,
  amount: bigint
): Promise<string> {
  return sendGaslessTransaction(
    kernelClient,
    wethAddress,
    WETH_WITHDRAW_ABI,
    "withdraw",
    [amount]
  )
}
