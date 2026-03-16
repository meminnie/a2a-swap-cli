import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners()
  const balance = await ethers.provider.getBalance(deployer.address)

  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address
  const feeBps = Number(process.env.FEE_BPS || "10") // default 0.1%

  console.info(`Deploying Escrow contract...`)
  console.info(`  Deployer:       ${deployer.address}`)
  console.info(`  Balance:        ${ethers.formatEther(balance)} ETH`)
  console.info(`  Fee Recipient:  ${feeRecipient}`)
  console.info(`  Fee BPS:        ${feeBps} (${feeBps / 100}%)`)

  const Escrow = await ethers.getContractFactory("Escrow")
  const escrow = await Escrow.deploy(feeRecipient, feeBps)
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
