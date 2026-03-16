import { ethers } from "ethers"
import * as fs from "fs"
import * as path from "path"
import type { ServerConfig } from "./config"

function loadAbi(contractName: string): ethers.InterfaceAbi {
  const artifactPath = path.resolve(
    __dirname,
    `../../artifacts/contracts/${contractName}.sol/${contractName}.json`
  )
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"))
  return artifact.abi as ethers.InterfaceAbi
}

export function getProvider(config: ServerConfig): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.rpcUrl)
}

export function getOperatorSigner(config: ServerConfig): ethers.Wallet {
  const provider = getProvider(config)
  return new ethers.Wallet(config.operatorPrivateKey, provider)
}

export function getFactory(config: ServerConfig): ethers.Contract {
  const signer = getOperatorSigner(config)
  const abi = loadAbi("EscrowFactory")
  return new ethers.Contract(config.factoryAddress, abi, signer)
}

export function getTradeEscrow(
  address: string,
  config: ServerConfig
): ethers.Contract {
  const signer = getOperatorSigner(config)
  const abi = loadAbi("TradeEscrow")
  return new ethers.Contract(address, abi, signer)
}

export async function computeEscrowAddress(
  config: ServerConfig,
  params: {
    readonly seller: string
    readonly buyer: string
    readonly sellToken: string
    readonly buyToken: string
    readonly sellAmount: bigint
    readonly buyAmount: bigint
    readonly deadline: number
    readonly nonce: bigint
  }
): Promise<string> {
  const factory = getFactory(config)
  const address = await factory.computeAddress(
    params.seller,
    params.buyer,
    params.sellToken,
    params.buyToken,
    params.sellAmount,
    params.buyAmount,
    params.deadline,
    params.nonce
  )
  return address as string
}

export async function deployEscrow(
  config: ServerConfig,
  params: {
    readonly seller: string
    readonly buyer: string
    readonly sellToken: string
    readonly buyToken: string
    readonly sellAmount: bigint
    readonly buyAmount: bigint
    readonly deadline: number
    readonly nonce: bigint
  }
): Promise<{ address: string; txHash: string }> {
  const factory = getFactory(config)
  const tx = await factory.deploy(
    params.seller,
    params.buyer,
    params.sellToken,
    params.buyToken,
    params.sellAmount,
    params.buyAmount,
    params.deadline,
    params.nonce
  )
  const receipt = await tx.wait()
  const event = receipt.logs.find((log: ethers.Log) => {
    try {
      const parsed = factory.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      })
      return parsed?.name === "EscrowDeployed"
    } catch {
      return false
    }
  })

  const parsed = factory.interface.parseLog({
    topics: [...event!.topics],
    data: event!.data,
  })

  return {
    address: parsed!.args[0] as string,
    txHash: receipt.hash as string,
  }
}

export async function settleEscrow(
  config: ServerConfig,
  escrowAddress: string
): Promise<string> {
  const escrow = getTradeEscrow(escrowAddress, config)
  const tx = await escrow.settle()
  const receipt = await tx.wait()
  return receipt.hash as string
}

export async function refundEscrow(
  config: ServerConfig,
  escrowAddress: string
): Promise<string> {
  const escrow = getTradeEscrow(escrowAddress, config)
  const tx = await escrow.refund()
  const receipt = await tx.wait()
  return receipt.hash as string
}

export async function checkTokenBalance(
  config: ServerConfig,
  tokenAddress: string,
  walletAddress: string
): Promise<bigint> {
  const provider = getProvider(config)
  const erc20 = new ethers.Contract(
    tokenAddress,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  )
  return erc20.balanceOf(walletAddress) as Promise<bigint>
}
