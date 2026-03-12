import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners()
  const balance = await ethers.provider.getBalance(deployer.address)

  console.info(`Deploying Escrow contract...`)
  console.info(`  Deployer: ${deployer.address}`)
  console.info(`  Balance:  ${ethers.formatEther(balance)} ETH`)

  const Escrow = await ethers.getContractFactory("Escrow")
  const escrow = await Escrow.deploy()
  await escrow.waitForDeployment()

  const address = await escrow.getAddress()

  console.info(`Escrow deployed successfully!`)
  console.info(`  Address: ${address}`)
  console.info(`\nAdd to your .env:`)
  console.info(`  ESCROW_ADDRESS=${address}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
