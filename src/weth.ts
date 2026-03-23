import { ethers } from "ethers"

const WETH_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
] as const

function ensureProvider(signer: ethers.Wallet): ethers.Provider {
  const provider = signer.provider
  if (!provider) {
    throw new Error("Signer has no provider attached")
  }
  return provider
}

async function estimateGasBuffer(provider: ethers.Provider): Promise<bigint> {
  const feeData = await provider.getFeeData()
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("50", "gwei")
  const estimatedGas = 50_000n
  return gasPrice * estimatedGas
}

export function getWethContract(
  wethAddress: string,
  signer: ethers.Wallet
): ethers.Contract {
  return new ethers.Contract(wethAddress, WETH_ABI, signer)
}

export async function wrapETH(
  signer: ethers.Wallet,
  wethAddress: string,
  amount: bigint
): Promise<ethers.TransactionReceipt> {
  const provider = ensureProvider(signer)
  const gasBuffer = await estimateGasBuffer(provider)
  const balance = await provider.getBalance(signer.address)
  const required = amount + gasBuffer

  if (balance < required) {
    const have = ethers.formatEther(balance)
    const need = ethers.formatEther(required)
    throw new Error(
      `Insufficient ETH. Need ${need} (${ethers.formatEther(amount)} + gas ~${ethers.formatEther(gasBuffer)}), have ${have}`
    )
  }

  const weth = getWethContract(wethAddress, signer)
  const tx = await weth.deposit({ value: amount })
  const receipt = await tx.wait()
  if (!receipt) {
    throw new Error(`Wrap transaction ${tx.hash} was not mined`)
  }
  return receipt
}

export async function unwrapWETH(
  signer: ethers.Wallet,
  wethAddress: string,
  amount?: bigint
): Promise<ethers.TransactionReceipt | null> {
  const weth = getWethContract(wethAddress, signer)
  const balance: bigint = await weth.balanceOf(signer.address)

  if (balance === 0n) {
    return null
  }

  const withdrawAmount = amount !== undefined && amount < balance ? amount : balance

  if (withdrawAmount === 0n) {
    return null
  }

  const tx = await weth.withdraw(withdrawAmount)
  const receipt = await tx.wait()
  if (!receipt) {
    throw new Error(`Unwrap transaction ${tx.hash} was not mined`)
  }
  return receipt
}
