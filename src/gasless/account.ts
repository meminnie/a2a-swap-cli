import { createPublicClient, http, type Hex, type Chain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { entryPoint07Address } from "viem/account-abstraction"
import { baseSepolia } from "viem/chains"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk"
import type { GaslessConfig } from "./config"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KernelClient = any

export interface SmartAccountBundle {
  readonly kernelClient: KernelClient
  readonly smartAccountAddress: string
}

const CHAIN_MAP: Record<string, Chain> = {
  "base-sepolia": baseSepolia,
}

function resolveChain(chain: string): Chain {
  const resolved = CHAIN_MAP[chain]
  if (!resolved) {
    throw new Error(`Unsupported chain for gasless: ${chain}`)
  }
  return resolved
}

export async function createSmartAccount(
  privateKey: string,
  gaslessConfig: GaslessConfig,
  chain: string = "base-sepolia"
): Promise<SmartAccountBundle> {
  const viemChain = resolveChain(chain)

  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(),
  })

  const signer = privateKeyToAccount(privateKey as Hex)

  const entryPoint = {
    address: entryPoint07Address,
    version: "0.7" as const,
  }

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion: "0.3.1",
  })

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion: "0.3.1",
  })

  const paymasterClient = createZeroDevPaymasterClient({
    chain: viemChain,
    transport: http(gaslessConfig.paymasterUrl),
  })

  const kernelClient = createKernelAccountClient({
    account,
    chain: viemChain,
    bundlerTransport: http(gaslessConfig.bundlerUrl),
    paymaster: paymasterClient,
  })

  return {
    kernelClient,
    smartAccountAddress: account.address,
  }
}
