import { expect } from "chai"
import hre from "hardhat"

describe("Escrow", function () {
  async function deployEscrowFixture() {
    const [proposer, acceptor] = await hre.ethers.getSigners()

    const Escrow = await hre.ethers.getContractFactory("Escrow")
    const escrow = await Escrow.deploy()

    // Deploy mock ERC20 tokens for testing
    const MockToken = await hre.ethers.getContractFactory("MockERC20")
    const tokenA = await MockToken.deploy("Token A", "TKA", 18)
    const tokenB = await MockToken.deploy("Token B", "TKB", 18)

    const mintAmount = hre.ethers.parseEther("10000")
    await tokenA.mint(proposer.address, mintAmount)
    await tokenB.mint(acceptor.address, mintAmount)

    return { escrow, tokenA, tokenB, proposer, acceptor }
  }

  describe("createOffer", function () {
    it("should create an offer with correct parameters", async function () {
      const { escrow, tokenA, tokenB, proposer } =
        await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("1000")
      const buyAmount = hre.ethers.parseEther("0.5")
      const duration = 3600

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        duration
      )

      const offer = await escrow.getOffer(0)
      expect(offer.proposer).to.equal(proposer.address)
      expect(offer.sellAmount).to.equal(sellAmount)
      expect(offer.buyAmount).to.equal(buyAmount)
      expect(offer.status).to.equal(0) // Open
    })
  })

  describe("full swap flow", function () {
    it("should settle when both parties deposit", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor } =
        await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      // Create offer
      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      // Accept offer
      await escrow.connect(acceptor).acceptOffer(0)

      const escrowAddress = await escrow.getAddress()

      // Both approve and deposit
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await tokenB.connect(acceptor).approve(escrowAddress, buyAmount)

      await escrow.connect(proposer).deposit(0)
      await escrow.connect(acceptor).deposit(0)

      // Check settlement
      const offer = await escrow.getOffer(0)
      expect(offer.status).to.equal(2) // Settled

      // Check token transfers
      expect(await tokenA.balanceOf(acceptor.address)).to.equal(sellAmount)
      expect(await tokenB.balanceOf(proposer.address)).to.equal(buyAmount)
    })
  })
})
