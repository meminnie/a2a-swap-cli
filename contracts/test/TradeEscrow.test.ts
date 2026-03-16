import { expect } from "chai"
import hre from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"

describe("EscrowFactory + TradeEscrow", function () {
  const FEE_BPS = 10 // 0.1%

  async function deployFixture() {
    const [owner, operatorSigner, seller, buyer, feeWallet, third] =
      await hre.ethers.getSigners()

    const Factory = await hre.ethers.getContractFactory("EscrowFactory")
    const factory = await Factory.deploy(
      operatorSigner.address,
      feeWallet.address,
      FEE_BPS
    )

    const MockToken = await hre.ethers.getContractFactory("MockERC20")
    const tokenA = await MockToken.deploy("Token A", "TKA", 18)
    const tokenB = await MockToken.deploy("Token B", "TKB", 18)

    const mintAmount = hre.ethers.parseEther("10000")
    await tokenA.mint(seller.address, mintAmount)
    await tokenB.mint(buyer.address, mintAmount)

    return {
      factory,
      tokenA,
      tokenB,
      owner,
      operatorSigner,
      seller,
      buyer,
      feeWallet,
      third,
    }
  }

  // Amounts are off-chain (server-managed), not in contract
  const SELL_AMOUNT = hre.ethers.parseEther("100")
  const BUY_AMOUNT = hre.ethers.parseEther("50")

  async function deployEscrowViaFactory(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    overrides?: { deadline?: number }
  ) {
    const { factory, tokenA, tokenB, operatorSigner, seller, buyer } = fixture

    const now = await time.latest()
    const deadline = overrides?.deadline ?? now + 3600

    const nonceTx = await factory.connect(operatorSigner).useNonce()
    await nonceTx.wait()
    const nonce = await factory.nextNonce() - 1n

    const escrowAddress = await factory.computeAddress(
      seller.address,
      buyer.address,
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      deadline,
      nonce
    )

    await factory.connect(operatorSigner).deploy(
      seller.address,
      buyer.address,
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      deadline,
      nonce
    )

    const TradeEscrow = await hre.ethers.getContractFactory("TradeEscrow")
    const escrow = TradeEscrow.attach(escrowAddress)

    return { escrow, escrowAddress, deadline, nonce }
  }

  // --- EscrowFactory tests ---

  describe("EscrowFactory", function () {
    it("should initialize with correct parameters", async function () {
      const { factory, operatorSigner, feeWallet } = await deployFixture()
      expect(await factory.operator()).to.equal(operatorSigner.address)
      expect(await factory.feeRecipient()).to.equal(feeWallet.address)
      expect(await factory.feeBps()).to.equal(FEE_BPS)
    })

    it("should reject zero operator address", async function () {
      const Factory = await hre.ethers.getContractFactory("EscrowFactory")
      const [, , , feeWallet] = await hre.ethers.getSigners()
      await expect(
        Factory.deploy(hre.ethers.ZeroAddress, feeWallet.address, FEE_BPS)
      ).to.be.revertedWithCustomError(Factory, "InvalidAddress")
    })

    it("should reject fee above MAX_FEE_BPS", async function () {
      const Factory = await hre.ethers.getContractFactory("EscrowFactory")
      const [, operator, , feeWallet] = await hre.ethers.getSigners()
      await expect(
        Factory.deploy(operator.address, feeWallet.address, 101)
      ).to.be.revertedWithCustomError(Factory, "FeeTooHigh")
    })

    it("should compute deterministic address correctly", async function () {
      const fixture = await deployFixture()
      const { factory, tokenA, tokenB, operatorSigner, seller, buyer } = fixture

      const now = await time.latest()
      const deadline = now + 3600

      const nonceTx = await factory.connect(operatorSigner).useNonce()
      await nonceTx.wait()
      const nonce = await factory.nextNonce() - 1n

      const predicted = await factory.computeAddress(
        seller.address,
        buyer.address,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        deadline,
        nonce
      )

      const tx = await factory.connect(operatorSigner).deploy(
        seller.address,
        buyer.address,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        deadline,
        nonce
      )

      const receipt = await tx.wait()
      const event = receipt?.logs.find((log: { fragment?: { name: string } }) => {
        try {
          const parsed = factory.interface.parseLog({
            topics: [...log.topics],
            data: log.data,
          } as { topics: string[]; data: string })
          return parsed?.name === "EscrowDeployed"
        } catch {
          return false
        }
      })

      const parsed = factory.interface.parseLog({
        topics: [...event!.topics],
        data: event!.data,
      } as { topics: string[]; data: string })

      expect(parsed!.args[0]).to.equal(predicted)
    })

    it("should reject deploy from non-operator", async function () {
      const fixture = await deployFixture()
      const { factory, tokenA, tokenB, seller, buyer, third } = fixture

      await expect(
        factory.connect(third).deploy(
          seller.address,
          buyer.address,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          9999999999,
          0
        )
      ).to.be.revertedWithCustomError(factory, "OnlyOperator")
    })

    it("should allow owner to update operator", async function () {
      const { factory, third } = await deployFixture()
      await factory.setOperator(third.address)
      expect(await factory.operator()).to.equal(third.address)
    })

    it("should allow owner to update feeBps", async function () {
      const { factory } = await deployFixture()
      await factory.setFeeBps(20)
      expect(await factory.feeBps()).to.equal(20)
    })

    it("should reject non-owner admin calls", async function () {
      const { factory, third } = await deployFixture()
      await expect(
        factory.connect(third).setOperator(third.address)
      ).to.be.revertedWithCustomError(factory, "OnlyOwner")
      await expect(
        factory.connect(third).setFeeBps(20)
      ).to.be.revertedWithCustomError(factory, "OnlyOwner")
    })
  })

  // --- TradeEscrow tests ---

  describe("TradeEscrow", function () {
    it("should have correct immutable parameters (no amounts)", async function () {
      const fixture = await deployFixture()
      const { escrow } = await deployEscrowViaFactory(fixture)
      const { seller, buyer, tokenA, tokenB, operatorSigner, feeWallet } = fixture

      expect(await escrow.seller()).to.equal(seller.address)
      expect(await escrow.buyer()).to.equal(buyer.address)
      expect(await escrow.sellToken()).to.equal(await tokenA.getAddress())
      expect(await escrow.buyToken()).to.equal(await tokenB.getAddress())
      expect(await escrow.operator()).to.equal(operatorSigner.address)
      expect(await escrow.feeRecipient()).to.equal(feeWallet.address)
      expect(await escrow.feeBps()).to.equal(FEE_BPS)
    })

    it("should settle with operator-specified amounts", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner, feeWallet } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)

      expect(await escrow.settled()).to.be.true

      const sellFee = (SELL_AMOUNT * BigInt(FEE_BPS)) / 10000n
      const buyFee = (BUY_AMOUNT * BigInt(FEE_BPS)) / 10000n

      expect(await tokenA.balanceOf(buyer.address)).to.equal(
        SELL_AMOUNT - sellFee
      )
      expect(await tokenB.balanceOf(seller.address)).to.equal(
        BUY_AMOUNT - buyFee
      )
      expect(await tokenA.balanceOf(feeWallet.address)).to.equal(sellFee)
      expect(await tokenB.balanceOf(feeWallet.address)).to.equal(buyFee)
    })

    it("should handle CREATE2 pre-deployment deposit", async function () {
      const fixture = await deployFixture()
      const { factory, tokenA, tokenB, operatorSigner, seller, buyer } = fixture

      const now = await time.latest()
      const deadline = now + 3600

      const nonceTx = await factory.connect(operatorSigner).useNonce()
      await nonceTx.wait()
      const nonce = await factory.nextNonce() - 1n

      const escrowAddress = await factory.computeAddress(
        seller.address,
        buyer.address,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        deadline,
        nonce
      )

      // Seller sends tokens BEFORE contract exists
      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      expect(await tokenA.balanceOf(escrowAddress)).to.equal(SELL_AMOUNT)

      // Deploy the contract
      await factory.connect(operatorSigner).deploy(
        seller.address,
        buyer.address,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        deadline,
        nonce
      )

      // Buyer deposits after deployment
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      const TradeEscrow = await hre.ethers.getContractFactory("TradeEscrow")
      const escrow = TradeEscrow.attach(escrowAddress)
      await escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)

      expect(await escrow.settled()).to.be.true
    })

    it("should return excess tokens on settle", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      const excess = hre.ethers.parseEther("10")

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT + excess)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)
      await escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)

      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      expect(sellerBalAfter - sellerBalBefore).to.equal(excess)
    })

    it("should revert settle if sell deposit insufficient", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenB, buyer, operatorSigner } = fixture

      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await expect(
        escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)
      ).to.be.revertedWithCustomError(escrow, "InsufficientSellDeposit")
    })

    it("should revert settle if buy deposit insufficient", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, seller, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)

      await expect(
        escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)
      ).to.be.revertedWithCustomError(escrow, "InsufficientBuyDeposit")
    })

    it("should revert settle with zero amounts", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await expect(
        escrow.connect(operatorSigner).settle(0, BUY_AMOUNT)
      ).to.be.revertedWithCustomError(escrow, "ZeroAmount")

      await expect(
        escrow.connect(operatorSigner).settle(SELL_AMOUNT, 0)
      ).to.be.revertedWithCustomError(escrow, "ZeroAmount")
    })

    it("should revert settle from non-operator", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, third } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await expect(
        escrow.connect(third).settle(SELL_AMOUNT, BUY_AMOUNT)
      ).to.be.revertedWithCustomError(escrow, "OnlyOperator")
    })

    it("should revert double settle", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)

      await expect(
        escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)
      ).to.be.revertedWithCustomError(escrow, "AlreadySettled")
    })

    it("should revert settle after deadline", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await time.increase(3601)

      await expect(
        escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)
      ).to.be.revertedWithCustomError(escrow, "DeadlinePassed")
    })

    it("should revert settle after cancel", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await escrow.connect(seller).cancel()

      await expect(
        escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)
      ).to.be.revertedWithCustomError(escrow, "AlreadyCancelled")
    })
  })

  // --- Refund tests ---

  describe("refund", function () {
    it("should refund both parties after deadline", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)
      const buyerBalBefore = await tokenB.balanceOf(buyer.address)

      await time.increase(3601)
      await escrow.connect(operatorSigner).refund()

      expect(await escrow.refunded()).to.be.true

      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      const buyerBalAfter = await tokenB.balanceOf(buyer.address)

      expect(sellerBalAfter - sellerBalBefore).to.equal(SELL_AMOUNT)
      expect(buyerBalAfter - buyerBalBefore).to.equal(BUY_AMOUNT)
    })

    it("should refund only seller if buyer didn't deposit", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, seller, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)

      await time.increase(3601)
      await escrow.connect(operatorSigner).refund()

      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      expect(sellerBalAfter - sellerBalBefore).to.equal(SELL_AMOUNT)
    })

    it("should revert refund before deadline", async function () {
      const fixture = await deployFixture()
      const { escrow } = await deployEscrowViaFactory(fixture)
      const { operatorSigner } = fixture

      await expect(
        escrow.connect(operatorSigner).refund()
      ).to.be.revertedWithCustomError(escrow, "DeadlineNotReached")
    })

    it("should revert refund if already settled", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)
      await time.increase(3601)

      await expect(
        escrow.connect(operatorSigner).refund()
      ).to.be.revertedWithCustomError(escrow, "AlreadySettled")
    })

    it("should revert refund if already cancelled", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, seller, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await escrow.connect(seller).cancel()

      await time.increase(3601)

      await expect(
        escrow.connect(operatorSigner).refund()
      ).to.be.revertedWithCustomError(escrow, "AlreadyCancelled")
    })

    it("should revert refund from non-operator", async function () {
      const fixture = await deployFixture()
      const { escrow } = await deployEscrowViaFactory(fixture)
      const { third } = fixture

      await time.increase(3601)

      await expect(
        escrow.connect(third).refund()
      ).to.be.revertedWithCustomError(escrow, "OnlyOperator")
    })
  })

  // --- Cancel tests ---

  describe("cancel", function () {
    it("should allow seller to cancel and return tokens", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)
      const buyerBalBefore = await tokenB.balanceOf(buyer.address)

      await expect(escrow.connect(seller).cancel())
        .to.emit(escrow, "Cancelled")
        .withArgs(seller.address)

      expect(await escrow.cancelled()).to.be.true

      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      const buyerBalAfter = await tokenB.balanceOf(buyer.address)

      expect(sellerBalAfter - sellerBalBefore).to.equal(SELL_AMOUNT)
      expect(buyerBalAfter - buyerBalBefore).to.equal(BUY_AMOUNT)
    })

    it("should allow buyer to cancel and return tokens", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      await expect(escrow.connect(buyer).cancel())
        .to.emit(escrow, "Cancelled")
        .withArgs(buyer.address)

      expect(await escrow.cancelled()).to.be.true
    })

    it("should cancel with only seller deposit", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, seller } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)
      await escrow.connect(seller).cancel()

      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      expect(sellerBalAfter - sellerBalBefore).to.equal(SELL_AMOUNT)
    })

    it("should revert cancel from third party", async function () {
      const fixture = await deployFixture()
      const { escrow } = await deployEscrowViaFactory(fixture)
      const { third } = fixture

      await expect(
        escrow.connect(third).cancel()
      ).to.be.revertedWithCustomError(escrow, "OnlyParty")
    })

    it("should revert cancel if already settled", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)
      await escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)

      await expect(
        escrow.connect(seller).cancel()
      ).to.be.revertedWithCustomError(escrow, "AlreadySettled")
    })

    it("should revert cancel if already refunded", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, seller, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await time.increase(3601)
      await escrow.connect(operatorSigner).refund()

      await expect(
        escrow.connect(seller).cancel()
      ).to.be.revertedWithCustomError(escrow, "AlreadyRefunded")
    })

    it("should revert double cancel", async function () {
      const fixture = await deployFixture()
      const { escrow } = await deployEscrowViaFactory(fixture)
      const { seller, buyer } = fixture

      await escrow.connect(seller).cancel()

      await expect(
        escrow.connect(buyer).cancel()
      ).to.be.revertedWithCustomError(escrow, "AlreadyCancelled")
    })
  })

  // --- Rescue tests ---

  describe("rescueToken", function () {
    it("should rescue sellToken back to seller", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, seller } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)
      await escrow.connect(seller).rescueToken(await tokenA.getAddress())

      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      expect(sellerBalAfter - sellerBalBefore).to.equal(SELL_AMOUNT)
      expect(await tokenA.balanceOf(escrowAddress)).to.equal(0)
    })

    it("should rescue buyToken back to buyer", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenB, buyer } = fixture

      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      const buyerBalBefore = await tokenB.balanceOf(buyer.address)
      await escrow.connect(buyer).rescueToken(await tokenB.getAddress())

      const buyerBalAfter = await tokenB.balanceOf(buyer.address)
      expect(buyerBalAfter - buyerBalBefore).to.equal(BUY_AMOUNT)
      expect(await tokenB.balanceOf(escrowAddress)).to.equal(0)
    })

    it("should rescue unknown token to caller", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { seller } = fixture

      const MockToken = await hre.ethers.getContractFactory("MockERC20")
      const randomToken = await MockToken.deploy("Random", "RND", 18)
      const amount = hre.ethers.parseEther("999")
      await randomToken.mint(seller.address, amount)
      await randomToken.connect(seller).transfer(escrowAddress, amount)

      await expect(
        escrow.connect(seller).rescueToken(await randomToken.getAddress())
      )
        .to.emit(escrow, "TokenRescued")
        .withArgs(seller.address, await randomToken.getAddress(), amount)

      expect(await randomToken.balanceOf(seller.address)).to.equal(amount)
      expect(await randomToken.balanceOf(escrowAddress)).to.equal(0)
    })

    it("should not allow seller to rescue buyToken (goes to buyer)", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenB, buyer, seller } = fixture

      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)

      const buyerBalBefore = await tokenB.balanceOf(buyer.address)
      // Seller calls rescueToken for buyToken — tokens go to buyer, not seller
      await escrow.connect(seller).rescueToken(await tokenB.getAddress())

      const buyerBalAfter = await tokenB.balanceOf(buyer.address)
      expect(buyerBalAfter - buyerBalBefore).to.equal(BUY_AMOUNT)
      expect(await tokenB.balanceOf(seller.address)).to.equal(0)
    })

    it("should revert rescue from third party", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { third } = fixture

      const MockToken = await hre.ethers.getContractFactory("MockERC20")
      const randomToken = await MockToken.deploy("Random", "RND", 18)
      const amount = hre.ethers.parseEther("100")
      await randomToken.mint(third.address, amount)
      await randomToken.connect(third).transfer(escrowAddress, amount)

      await expect(
        escrow.connect(third).rescueToken(await randomToken.getAddress())
      ).to.be.revertedWithCustomError(escrow, "OnlyParty")
    })

    it("should no-op rescue when balance is zero", async function () {
      const fixture = await deployFixture()
      const { escrow } = await deployEscrowViaFactory(fixture)
      const { seller } = fixture

      const MockToken = await hre.ethers.getContractFactory("MockERC20")
      const randomToken = await MockToken.deploy("Random", "RND", 18)

      // No transfer, balance is 0 — should not revert
      await escrow.connect(seller).rescueToken(await randomToken.getAddress())
    })

    it("should revert rescue after settlement", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, SELL_AMOUNT)
      await tokenB.connect(buyer).transfer(escrowAddress, BUY_AMOUNT)
      await escrow.connect(operatorSigner).settle(SELL_AMOUNT, BUY_AMOUNT)

      await expect(
        escrow.connect(seller).rescueToken(await tokenA.getAddress())
      ).to.be.revertedWithCustomError(escrow, "AlreadySettled")
    })
  })
})
