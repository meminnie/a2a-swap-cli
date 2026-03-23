import { encodeFunctionData, type Abi, type Hex } from "viem"
import type { KernelClient } from "./account"

export async function sendGaslessTransaction(
  kernelClient: KernelClient,
  to: string,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  value?: bigint
): Promise<string> {
  const data = encodeFunctionData({ abi, functionName, args })

  const txHash = await kernelClient.sendTransaction({
    to: to as Hex,
    data,
    value: value ?? 0n,
  })

  return txHash
}
