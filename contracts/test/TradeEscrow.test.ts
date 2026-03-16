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

  async function deployEscrowViaFactory(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    overrides?: { deadline?: number }
  ) {
    const { factory, tokenA, tokenB, operatorSigner, seller, buyer } = fixture

    const sellAmount = hre.ethers.parseEther("100")
    const buyAmount = hre.ethers.parseEther("50")
    const now = await time.latest()
    const deadline = overrides?.deadline ?? now + 3600

    const nonceTx = await factory.connect(operatorSigner).useNonce()
    const receipt = await nonceTx.wait()
    const nonce = await factory.nextNonce() - 1n

    const escrowAddress = await factory.computeAddress(
      seller.address,
      buyer.address,
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      sellAmount,
      buyAmount,
      deadline,
      nonce
    )

    const tx = await factory.connect(operatorSigner).deploy(
      seller.address,
      buyer.address,
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      sellAmount,
      buyAmount,
      deadline,
      nonce
    )

    const TradeEscrow = await hre.ethers.getContractFactory("TradeEscrow")
    const escrow = TradeEscrow.attach(escrowAddress)

    return { escrow, escrowAddress, sellAmount, buyAmount, deadline, nonce }
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

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")
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
        sellAmount,
        buyAmount,
        deadline,
        nonce
      )

      const tx = await factory.connect(operatorSigner).deploy(
        seller.address,
        buyer.address,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        sellAmount,
        buyAmount,
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
          100,
          50,
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
    it("should have correct immutable parameters", async function () {
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

    it("should settle when both tokens are deposited", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, sellAmount, buyAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner, feeWallet } = fixture

      // Seller and buyer send tokens directly to escrow address
      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      await escrow.connect(operatorSigner).settle()

      expect(await escrow.settled()).to.be.true

      const sellFee = (sellAmount * BigInt(FEE_BPS)) / 10000n
      const buyFee = (buyAmount * BigInt(FEE_BPS)) / 10000n

      // Buyer gets sellToken minus fee
      expect(await tokenA.balanceOf(buyer.address)).to.equal(
        sellAmount - sellFee
      )
      // Seller gets buyToken minus fee
      expect(await tokenB.balanceOf(seller.address)).to.equal(
        buyAmount - buyFee
      )
      // Fee recipient gets fees
      expect(await tokenA.balanceOf(feeWallet.address)).to.equal(sellFee)
      expect(await tokenB.balanceOf(feeWallet.address)).to.equal(buyFee)
    })

    it("should handle CREATE2 pre-deployment deposit (seller sends before deploy)", async function () {
      const fixture = await deployFixture()
      const { factory, tokenA, tokenB, operatorSigner, seller, buyer } = fixture

      const sellAmount = hre.ethers.parseEther("100")
      const buyAmount = hre.ethers.parseEther("50")
      const now = await time.latest()
      const deadline = now + 3600

      const nonceTx = await factory.connect(operatorSigner).useNonce()
      await nonceTx.wait()
      const nonce = await factory.nextNonce() - 1n

      // Compute address BEFORE deployment
      const escrowAddress = await factory.computeAddress(
        seller.address,
        buyer.address,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        sellAmount,
        buyAmount,
        deadline,
        nonce
      )

      // Seller sends tokens to the address BEFORE contract exists
      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)
      expect(await tokenA.balanceOf(escrowAddress)).to.equal(sellAmount)

      // Now deploy the contract
      await factory.connect(operatorSigner).deploy(
        seller.address,
        buyer.address,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        sellAmount,
        buyAmount,
        deadline,
        nonce
      )

      // Buyer sends tokens after deployment
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      // Settle
      const TradeEscrow = await hre.ethers.getContractFactory("TradeEscrow")
      const escrow = TradeEscrow.attach(escrowAddress)
      await escrow.connect(operatorSigner).settle()

      expect(await escrow.settled()).to.be.true

      const sellFee = (sellAmount * BigInt(FEE_BPS)) / 10000n
      const buyFee = (buyAmount * BigInt(FEE_BPS)) / 10000n

      expect(await tokenA.balanceOf(buyer.address)).to.equal(
        sellAmount - sellFee
      )
      expect(await tokenB.balanceOf(seller.address)).to.equal(
        buyAmount - buyFee
      )
    })

    it("should return excess tokens on settle (overpayment)", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, sellAmount, buyAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      const excess = hre.ethers.parseEther("10")

      // Seller overpays
      await tokenA.connect(seller).transfer(escrowAddress, sellAmount + excess)
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)
      await escrow.connect(operatorSigner).settle()

      // Seller should get excess back
      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      const buyFee = (buyAmount * BigInt(FEE_BPS)) / 10000n
      // Seller gets: buyAmount - buyFee (from buyToken) + excess (from sellToken overpayment)
      expect(sellerBalAfter - sellerBalBefore).to.equal(excess)
    })

    it("should revert settle if sell deposit insufficient", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, buyAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      // Only buyer deposits
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      await expect(
        escrow.connect(operatorSigner).settle()
      ).to.be.revertedWithCustomError(escrow, "InsufficientSellDeposit")
    })

    it("should revert settle if buy deposit insufficient", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, sellAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, operatorSigner } = fixture

      // Only seller deposits
      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)

      await expect(
        escrow.connect(operatorSigner).settle()
      ).to.be.revertedWithCustomError(escrow, "InsufficientBuyDeposit")
    })

    it("should revert settle from non-operator", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, sellAmount, buyAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, third } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      await expect(
        escrow.connect(third).settle()
      ).to.be.revertedWithCustomError(escrow, "OnlyOperator")
    })

    it("should revert double settle", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, sellAmount, buyAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      await escrow.connect(operatorSigner).settle()

      await expect(
        escrow.connect(operatorSigner).settle()
      ).to.be.revertedWithCustomError(escrow, "AlreadySettled")
    })

    it("should revert settle after deadline", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, sellAmount, buyAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      await time.increase(3601)

      await expect(
        escrow.connect(operatorSigner).settle()
      ).to.be.revertedWithCustomError(escrow, "DeadlinePassed")
    })
  })

  // --- Refund tests ---

  describe("refund", function () {
    it("should refund both parties after deadline", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, sellAmount, buyAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)
      const buyerBalBefore = await tokenB.balanceOf(buyer.address)

      await time.increase(3601)
      await escrow.connect(operatorSigner).refund()

      expect(await escrow.refunded()).to.be.true

      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      const buyerBalAfter = await tokenB.balanceOf(buyer.address)

      expect(sellerBalAfter - sellerBalBefore).to.equal(sellAmount)
      expect(buyerBalAfter - buyerBalBefore).to.equal(buyAmount)
    })

    it("should refund only seller if buyer didn't deposit", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress, sellAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, seller, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)

      const sellerBalBefore = await tokenA.balanceOf(seller.address)

      await time.increase(3601)
      await escrow.connect(operatorSigner).refund()

      const sellerBalAfter = await tokenA.balanceOf(seller.address)
      expect(sellerBalAfter - sellerBalBefore).to.equal(sellAmount)
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
      const { escrow, escrowAddress, sellAmount, buyAmount } =
        await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, seller, buyer, operatorSigner } = fixture

      await tokenA.connect(seller).transfer(escrowAddress, sellAmount)
      await tokenB.connect(buyer).transfer(escrowAddress, buyAmount)

      await escrow.connect(operatorSigner).settle()

      await time.increase(3601)

      await expect(
        escrow.connect(operatorSigner).refund()
      ).to.be.revertedWithCustomError(escrow, "AlreadySettled")
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

  // --- Rescue tests ---

  describe("rescueToken", function () {
    it("should rescue a mistakenly sent token", async function () {
      const fixture = await deployFixture()
      const { escrow, escrowAddress } = await deployEscrowViaFactory(fixture)
      const { operatorSigner, seller } = fixture

      // Deploy a random token and send it to escrow by mistake
      const MockToken = await hre.ethers.getContractFactory("MockERC20")
      const randomToken = await MockToken.deploy("Random", "RND", 18)
      const amount = hre.ethers.parseEther("999")
      await randomToken.mint(seller.address, amount)
      await randomToken.connect(seller).transfer(escrowAddress, amount)

      // Operator rescues to seller
      await escrow.connect(operatorSigner).rescueToken(
        await randomToken.getAddress(),
        seller.address
      )

      expect(await randomToken.balanceOf(seller.address)).to.equal(amount)
      expect(await randomToken.balanceOf(escrowAddress)).to.equal(0)
    })

    it("should revert rescue for sellToken or buyToken", async function () {
      const fixture = await deployFixture()
      const { escrow } = await deployEscrowViaFactory(fixture)
      const { tokenA, tokenB, operatorSigner, seller } = fixture

      await expect(
        escrow.connect(operatorSigner).rescueToken(
          await tokenA.getAddress(),
          seller.address
        )
      ).to.be.revertedWithCustomError(escrow, "NotRescuable")

      await expect(
        escrow.connect(operatorSigner).rescueToken(
          await tokenB.getAddress(),
          seller.address
        )
      ).to.be.revertedWithCustomError(escrow, "NotRescuable")
    })

    it("should revert rescue from non-operator", async function () {
      const fixture = await deployFixture()
      const { escrow } = await deployEscrowViaFactory(fixture)
      const { third } = fixture

      const MockToken = await hre.ethers.getContractFactory("MockERC20")
      const randomToken = await MockToken.deploy("Random", "RND", 18)

      await expect(
        escrow.connect(third).rescueToken(
          await randomToken.getAddress(),
          third.address
        )
      ).to.be.revertedWithCustomError(escrow, "OnlyOperator")
    })
  })
})
