import { ethers } from "ethers"
import type { Config } from "./config"

export function getProvider(config: Pick<Config, "rpcUrl">): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.rpcUrl)
}

export function getSigner(config: Config): ethers.Wallet {
  const provider = getProvider(config)
  return new ethers.Wallet(config.privateKey, provider)
}
