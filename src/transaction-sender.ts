import { ethers } from "ethers"
import type { Abi } from "viem"
import type { GaslessConfig } from "./gasless/config"
import { createSmartAccount, type KernelClient } from "./gasless/account"
import { sendGaslessTransaction } from "./gasless/transaction"

export interface TransactionResult {
  readonly hash: string
}

export interface TransactionSender {
  readonly address: string
  readonly kernelClient?: KernelClient
  sendErc20Transfer(tokenAddress: string, to: string, amount: bigint): Promise<TransactionResult>
  sendContractCall(
    contractAddress: string,
    abi: readonly string[],
    method: string,
    args: readonly unknown[],
    value?: bigint
  ): Promise<TransactionResult>
}

const ERC20_TRANSFER_ABI_VIEM: Abi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
]

export function createEoaSender(signer: ethers.Wallet): TransactionSender {
  return {
    address: signer.address,

    async sendErc20Transfer(tokenAddress, to, amount) {
      const contract = new ethers.Contract(
        tokenAddress,
        ["function transfer(address to, uint256 amount) returns (bool)"],
        signer
      )
      const tx = await contract.transfer(to, amount)
      const receipt = await tx.wait()
      if (!receipt) {
        throw new Error(`Transaction ${tx.hash} was not mined`)
      }
      return { hash: receipt.hash }
    },

    async sendContractCall(contractAddress, abi, method, args, value) {
      const contract = new ethers.Contract(contractAddress, abi, signer)
      const tx = await contract[method](...args, value !== undefined ? { value } : {})
      const receipt = await tx.wait()
      if (!receipt) {
        throw new Error(`Transaction ${tx.hash} was not mined`)
      }
      return { hash: receipt.hash }
    },
  }
}

function ethersAbiToViem(ethersAbi: readonly string[]): Abi {
  const iface = new ethers.Interface(ethersAbi)
  return JSON.parse(iface.formatJson()) as Abi
}

export async function createGaslessSender(
  privateKey: string,
  gaslessConfig: GaslessConfig,
  chain?: string
): Promise<TransactionSender> {
  const { kernelClient, smartAccountAddress } = await createSmartAccount(
    privateKey,
    gaslessConfig,
    chain
  )

  return {
    address: smartAccountAddress,
    kernelClient,

    async sendErc20Transfer(tokenAddress, to, amount) {
      const hash = await sendGaslessTransaction(
        kernelClient,
        tokenAddress,
        ERC20_TRANSFER_ABI_VIEM,
        "transfer",
        [to, amount]
      )
      return { hash }
    },

    async sendContractCall(contractAddress, abi, method, args, value) {
      const viemAbi = ethersAbiToViem(abi)
      const hash = await sendGaslessTransaction(
        kernelClient,
        contractAddress,
        viemAbi,
        method,
        args,
        value
      )
      return { hash }
    },
  }
}
