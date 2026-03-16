import { expect } from "chai"
import hre from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"

describe("Escrow", function () {
  const FEE_BPS = 10 // 0.1%

  async function deployEscrowFixture() {
    const [proposer, acceptor, third, feeWallet] = await hre.ethers.getSigners()

    const Escrow = await hre.ethers.getContractFactory("Escrow")
    const escrow = await Escrow.deploy(feeWallet.address, FEE_BPS)

    // Deploy mock ERC20 tokens for testing
    const MockToken = await hre.ethers.getContractFactory("MockERC20")
    const tokenA = await MockToken.deploy("Token A", "TKA", 18)
    const tokenB = await MockToken.deploy("Token B", "TKB", 18)

    const mintAmount = hre.ethers.parseEther("10000")
    await tokenA.mint(proposer.address, mintAmount)
    await tokenB.mint(acceptor.address, mintAmount)

    return { escrow, tokenA, tokenB, proposer, acceptor, third, feeWallet }
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
      expect(offer.depositDeadline).to.equal(0)
    })

    it("should reject zero amounts", async function () {
      const { escrow, tokenA, tokenB } = await deployEscrowFixture()
      await expect(
        escrow.createOffer(await tokenA.getAddress(), 0, await tokenB.getAddress(), 100, 3600)
      ).to.be.revertedWithCustomError(escrow, "InvalidAmount")
    })

    it("should reject same token", async function () {
      const { escrow, tokenA } = await deployEscrowFixture()
      const addr = await tokenA.getAddress()
      await expect(
        escrow.createOffer(addr, 100, addr, 100, 3600)
      ).to.be.revertedWithCustomError(escrow, "SameToken")
    })

    it("should reject invalid duration", async function () {
      const { escrow, tokenA, tokenB } = await deployEscrowFixture()
      await expect(
        escrow.createOffer(await tokenA.getAddress(), 100, await tokenB.getAddress(), 100, 0)
      ).to.be.revertedWithCustomError(escrow, "InvalidDuration")
    })
  })

  describe("full swap flow", function () {
    it("should settle when both parties deposit (with fee deduction)", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor, feeWallet } =
        await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      await escrow.connect(acceptor).acceptOffer(0)

      const escrowAddress = await escrow.getAddress()

      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await tokenB.connect(acceptor).approve(escrowAddress, buyAmount)

      await escrow.connect(proposer).deposit(0)
      await escrow.connect(acceptor).deposit(0)

      const offer = await escrow.getOffer(0)
      expect(offer.status).to.equal(2) // Settled

      // 0.1% fee deducted from both sides
      const sellFee = sellAmount * BigInt(FEE_BPS) / 10000n
      const buyFee = buyAmount * BigInt(FEE_BPS) / 10000n

      expect(await tokenA.balanceOf(acceptor.address)).to.equal(sellAmount - sellFee)
      expect(await tokenB.balanceOf(proposer.address)).to.equal(buyAmount - buyFee)

      // Fee recipient receives fees
      expect(await tokenA.balanceOf(feeWallet.address)).to.equal(sellFee)
      expect(await tokenB.balanceOf(feeWallet.address)).to.equal(buyFee)
    })
  })

  describe("deposit window", function () {
    it("should set depositDeadline on accept", async function () {
      const { escrow, tokenA, tokenB, acceptor } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      await escrow.connect(acceptor).acceptOffer(0)

      const offer = await escrow.getOffer(0)
      expect(offer.depositDeadline).to.be.greaterThan(0)
      // depositDeadline should be ~15 minutes from now
      const now = await time.latest()
      expect(Number(offer.depositDeadline)).to.be.closeTo(now + 300, 5)
    })

    it("should cap depositDeadline at offer deadline", async function () {
      const { escrow, tokenA, tokenB, acceptor } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")
      // Duration shorter than DEPOSIT_WINDOW (2 min < 5 min)
      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        120
      )

      await escrow.connect(acceptor).acceptOffer(0)

      const offer = await escrow.getOffer(0)
      // depositDeadline should equal offer deadline since 2 min < 5 min
      expect(offer.depositDeadline).to.equal(offer.deadline)
    })

    it("should reject deposit after deposit window expires", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      await escrow.connect(acceptor).acceptOffer(0)

      const escrowAddress = await escrow.getAddress()
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await tokenB.connect(acceptor).approve(escrowAddress, buyAmount)

      // Fast forward past deposit window (5 min)
      await time.increase(301)

      await expect(
        escrow.connect(proposer).deposit(0)
      ).to.be.revertedWithCustomError(escrow, "DepositWindowExpired")

      await expect(
        escrow.connect(acceptor).deposit(0)
      ).to.be.revertedWithCustomError(escrow, "DepositWindowExpired")
    })

    it("should allow proposer to deposit before acceptance (no deposit window)", async function () {
      const { escrow, tokenA, tokenB, proposer } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      const escrowAddress = await escrow.getAddress()
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)

      // Proposer can deposit while Open (no deposit window yet)
      await escrow.connect(proposer).deposit(0)

      const offer = await escrow.getOffer(0)
      expect(offer.proposerDeposited).to.be.true
    })
  })

  describe("claimDepositTimeout", function () {
    it("should refund proposer when acceptor doesn't deposit", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      const escrowAddress = await escrow.getAddress()
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await escrow.connect(proposer).deposit(0)

      await escrow.connect(acceptor).acceptOffer(0)

      const balBefore = await tokenA.balanceOf(proposer.address)

      // Fast forward past deposit window
      await time.increase(901)

      await escrow.claimDepositTimeout(0)

      const offer = await escrow.getOffer(0)
      expect(offer.status).to.equal(4) // Expired

      // Proposer should get refund
      const balAfter = await tokenA.balanceOf(proposer.address)
      expect(balAfter - balBefore).to.equal(sellAmount)
    })

    it("should refund acceptor when proposer doesn't deposit after accept", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      await escrow.connect(acceptor).acceptOffer(0)

      const escrowAddress = await escrow.getAddress()
      await tokenB.connect(acceptor).approve(escrowAddress, buyAmount)
      await escrow.connect(acceptor).deposit(0)

      const balBefore = await tokenB.balanceOf(acceptor.address)

      // Fast forward past deposit window
      await time.increase(901)

      await escrow.claimDepositTimeout(0)

      const offer = await escrow.getOffer(0)
      expect(offer.status).to.equal(4) // Expired

      // Acceptor should get refund
      const balAfter = await tokenB.balanceOf(acceptor.address)
      expect(balAfter - balBefore).to.equal(buyAmount)
    })

    it("should revert if deposit window not expired", async function () {
      const { escrow, tokenA, tokenB, acceptor } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      await escrow.connect(acceptor).acceptOffer(0)

      await expect(
        escrow.claimDepositTimeout(0)
      ).to.be.revertedWithCustomError(escrow, "DepositWindowNotExpired")
    })

    it("should revert if both deposited (already settled)", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      await escrow.connect(acceptor).acceptOffer(0)

      const escrowAddress = await escrow.getAddress()
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await tokenB.connect(acceptor).approve(escrowAddress, buyAmount)

      await escrow.connect(proposer).deposit(0)
      await escrow.connect(acceptor).deposit(0)

      // Offer is now Settled, claimDepositTimeout should fail
      await expect(
        escrow.claimDepositTimeout(0)
      ).to.be.revertedWithCustomError(escrow, "OfferNotAccepted")
    })

    it("should revert if offer is still open", async function () {
      const { escrow, tokenA, tokenB } = await deployEscrowFixture()

      await escrow.createOffer(
        await tokenA.getAddress(),
        100,
        await tokenB.getAddress(),
        100,
        3600
      )

      await expect(
        escrow.claimDepositTimeout(0)
      ).to.be.revertedWithCustomError(escrow, "OfferNotAccepted")
    })

    it("should allow anyone to call claimDepositTimeout", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor, third } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      const escrowAddress = await escrow.getAddress()
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await escrow.connect(proposer).deposit(0)

      await escrow.connect(acceptor).acceptOffer(0)

      await time.increase(901)

      // Third party can trigger the timeout claim
      await escrow.connect(third).claimDepositTimeout(0)

      const offer = await escrow.getOffer(0)
      expect(offer.status).to.equal(4) // Expired
    })
  })

  describe("protocol fee", function () {
    it("should initialize with correct fee settings", async function () {
      const { escrow, feeWallet } = await deployEscrowFixture()
      expect(await escrow.feeBps()).to.equal(FEE_BPS)
      expect(await escrow.feeRecipient()).to.equal(feeWallet.address)
    })

    it("should allow owner to update feeBps", async function () {
      const { escrow } = await deployEscrowFixture()
      await escrow.setFeeBps(20) // 0.2%
      expect(await escrow.feeBps()).to.equal(20)
    })

    it("should reject feeBps above MAX_FEE_BPS", async function () {
      const { escrow } = await deployEscrowFixture()
      await expect(escrow.setFeeBps(101)).to.be.revertedWithCustomError(escrow, "FeeTooHigh")
    })

    it("should reject non-owner fee updates", async function () {
      const { escrow, acceptor } = await deployEscrowFixture()
      await expect(
        escrow.connect(acceptor).setFeeBps(20)
      ).to.be.revertedWithCustomError(escrow, "OnlyOwner")
    })

    it("should allow owner to update feeRecipient", async function () {
      const { escrow, third } = await deployEscrowFixture()
      await escrow.setFeeRecipient(third.address)
      expect(await escrow.feeRecipient()).to.equal(third.address)
    })

    it("should reject zero address feeRecipient", async function () {
      const { escrow } = await deployEscrowFixture()
      await expect(
        escrow.setFeeRecipient(hre.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(escrow, "InvalidFeeRecipient")
    })

    it("should track totalFeesCollected", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor } =
        await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("1000")
      const buyAmount = hre.ethers.parseEther("500")

      await escrow.createOffer(
        await tokenA.getAddress(), sellAmount,
        await tokenB.getAddress(), buyAmount, 3600
      )

      await escrow.connect(acceptor).acceptOffer(0)
      const escrowAddress = await escrow.getAddress()
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await tokenB.connect(acceptor).approve(escrowAddress, buyAmount)
      await escrow.connect(proposer).deposit(0)
      await escrow.connect(acceptor).deposit(0)

      const expectedTotal = (sellAmount * BigInt(FEE_BPS) / 10000n) + (buyAmount * BigInt(FEE_BPS) / 10000n)
      expect(await escrow.totalFeesCollected()).to.equal(expectedTotal)
    })
  })

  describe("cancel and refund", function () {
    it("should cancel open offer and refund proposer deposit", async function () {
      const { escrow, tokenA, tokenB, proposer } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      const escrowAddress = await escrow.getAddress()
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await escrow.connect(proposer).deposit(0)

      const balBefore = await tokenA.balanceOf(proposer.address)
      await escrow.connect(proposer).cancelOffer(0)

      const balAfter = await tokenA.balanceOf(proposer.address)
      expect(balAfter - balBefore).to.equal(sellAmount)

      const offer = await escrow.getOffer(0)
      expect(offer.status).to.equal(3) // Cancelled
    })

    it("should refund after deadline expires", async function () {
      const { escrow, tokenA, tokenB, proposer, acceptor } = await deployEscrowFixture()

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")

      await escrow.createOffer(
        await tokenA.getAddress(),
        sellAmount,
        await tokenB.getAddress(),
        buyAmount,
        3600
      )

      const escrowAddress = await escrow.getAddress()
      await tokenA.connect(proposer).approve(escrowAddress, sellAmount)
      await escrow.connect(proposer).deposit(0)

      // Fast forward past offer deadline
      await time.increase(3601)

      await escrow.refund(0)

      const offer = await escrow.getOffer(0)
      expect(offer.status).to.equal(4) // Expired
    })
  })
})
