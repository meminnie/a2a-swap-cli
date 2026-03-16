import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners()
  const balance = await ethers.provider.getBalance(deployer.address)

  console.info(`Deploying Mock ERC20 tokens...`)
  console.info(`  Deployer: ${deployer.address}`)
  console.info(`  Balance:  ${ethers.formatEther(balance)} ETH`)

  const MockToken = await ethers.getContractFactory("MockERC20")

  // Deploy Token A (test USDC)
  console.info("  Deploying tUSDC...")
  const tokenA = await MockToken.deploy("Test USDC", "tUSDC", 18)
  await tokenA.waitForDeployment()
  const tokenAAddress = await tokenA.getAddress()
  console.info(`  tUSDC deployed: ${tokenAAddress}`)

  // Deploy Token B (test WETH)
  console.info("  Deploying tWETH...")
  const tokenB = await MockToken.deploy("Test WETH", "tWETH", 18)
  await tokenB.waitForDeployment()
  const tokenBAddress = await tokenB.getAddress()
  console.info(`  tWETH deployed: ${tokenBAddress}`)

  // Mint tokens to deployer (wait for each tx to confirm)
  const mintAmount = ethers.parseEther("100000")
  console.info("  Minting tUSDC...")
  const mintATx = await tokenA.mint(deployer.address, mintAmount)
  await mintATx.wait()
  console.info("  Minting tWETH...")
  const mintBTx = await tokenB.mint(deployer.address, mintAmount)
  await mintBTx.wait()

  console.info(`\nTokens deployed and minted:`)
  console.info(`  tUSDC: ${tokenAAddress} (100,000 minted)`)
  console.info(`  tWETH: ${tokenBAddress} (100,000 minted)`)
  console.info(`\nAdd to your src/tokens.ts token map if needed.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
