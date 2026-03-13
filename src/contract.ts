import { ethers } from "ethers"
import * as path from "path"
import * as fs from "fs"
import type { Config } from "./config"

function loadEscrowAbi(): ethers.InterfaceAbi {
  const artifactPath = path.resolve(__dirname, "../artifacts/contracts/Escrow.sol/Escrow.json")
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"))
  return artifact.abi as ethers.InterfaceAbi
}

export function getProvider(config: Config): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.rpcUrl)
}

export function getSigner(config: Config): ethers.Wallet {
  const provider = getProvider(config)
  return new ethers.Wallet(config.privateKey, provider)
}

export function getEscrowContract(config: Config): ethers.Contract {
  const signer = getSigner(config)
  return new ethers.Contract(config.escrowAddress, loadEscrowAbi(), signer)
}

export function getErc20Contract(
  tokenAddress: string,
  config: Config
): ethers.Contract {
  const signer = getSigner(config)
  const erc20Abi = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ]
  return new ethers.Contract(tokenAddress, erc20Abi, signer)
}
