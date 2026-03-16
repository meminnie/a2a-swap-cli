import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners()
  const balance = await ethers.provider.getBalance(deployer.address)

  const operatorAddress = process.env.OPERATOR_ADDRESS || deployer.address
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address
  const feeBps = Number(process.env.FEE_BPS || "10") // default 0.1%

  console.info(`Deploying EscrowFactory...`)
  console.info(`  Deployer:       ${deployer.address}`)
  console.info(`  Balance:        ${ethers.formatEther(balance)} ETH`)
  console.info(`  Operator:       ${operatorAddress}`)
  console.info(`  Fee Recipient:  ${feeRecipient}`)
  console.info(`  Fee BPS:        ${feeBps} (${feeBps / 100}%)`)

  const Factory = await ethers.getContractFactory("EscrowFactory")
  const factory = await Factory.deploy(operatorAddress, feeRecipient, feeBps)
  await factory.waitForDeployment()

  const address = await factory.getAddress()

  console.info(`\nEscrowFactory deployed successfully!`)
  console.info(`  Address: ${address}`)
  console.info(`\nAdd to your server .env:`)
  console.info(`  FACTORY_ADDRESS=${address}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
