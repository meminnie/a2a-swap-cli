import { ethers } from "hardhat"

const TUSDC = "0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2"
const TWETH = "0x4322cB832Ab806cC123540428125a92180725a23"
const RECIPIENT = process.argv[2] || "0xaDDfFc7a83A0B443dC68ccf4624007a26bA67E89"

async function main() {
  const mintAmount = ethers.parseEther("100000")

  console.info(`Minting to ${RECIPIENT}...`)

  const tusdc = await ethers.getContractAt("MockERC20", TUSDC)
  console.info("Minting 100,000 tUSDC...")
  const tx1 = await tusdc.mint(RECIPIENT, mintAmount)
  await tx1.wait()

  const tweth = await ethers.getContractAt("MockERC20", TWETH)
  console.info("Minting 100,000 tWETH...")
  const tx2 = await tweth.mint(RECIPIENT, mintAmount)
  await tx2.wait()

  console.info(`tUSDC balance: ${ethers.formatEther(await tusdc.balanceOf(RECIPIENT))}`)
  console.info(`tWETH balance: ${ethers.formatEther(await tweth.balanceOf(RECIPIENT))}`)
  console.info("Done!")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
