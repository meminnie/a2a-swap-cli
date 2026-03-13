import { ethers } from "ethers"
import type { Config } from "../config"
import type { ActionType } from "../types/offer"
import { getEscrowContract, getErc20Contract, getSigner } from "../contract"
import { getSupabaseClient, insertOffer, updateOfferStatus } from "../supabase"
import { resolveTokenAddress } from "../tokens"

export interface ProposeParams {
  readonly sell: string
  readonly buy: string
  readonly action?: ActionType
  readonly chain?: string
  readonly duration?: number
}

export interface ProposeResult {
  readonly offerId: number
  readonly txHash: string
  readonly depositTxHash: string
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
  readonly chain: string
  readonly deadline: number
}

export interface AcceptResult {
  readonly offerId: number
  readonly acceptTxHash: string
  readonly depositTxHash: string
  readonly settled: boolean
}

export interface RefundResult {
  readonly offerId: number
  readonly txHash: string
  readonly proposerRefunded: boolean
  readonly acceptorRefunded: boolean
}

export interface DepositTimeoutResult {
  readonly offerId: number
  readonly txHash: string
  readonly proposerRefunded: boolean
  readonly acceptorRefunded: boolean
}

export async function propose(
  config: Config,
  params: ProposeParams
): Promise<ProposeResult> {
  const action = params.action ?? "swap"
  const chain = params.chain ?? config.chain
  const duration = params.duration ?? 3600

  const [sellAmount, sellToken] = params.sell.split(" ")
  const [buyAmount, buyToken] = params.buy.split(" ")

  if (!sellAmount || !sellToken || !buyAmount || !buyToken) {
    throw new Error("Invalid format. Use: '1000 USDC' style strings")
  }

  const sellNum = Number(sellAmount)
  const buyNum = Number(buyAmount)
  if (Number.isNaN(sellNum) || sellNum <= 0) {
    throw new Error(`Invalid sell amount: ${sellAmount}`)
  }
  if (Number.isNaN(buyNum) || buyNum <= 0) {
    throw new Error(`Invalid buy amount: ${buyAmount}`)
  }
  if (duration <= 0 || duration > 30 * 24 * 60 * 60) {
    throw new Error("Duration must be between 1 second and 30 days")
  }

  const signer = getSigner(config)
  const escrow = getEscrowContract(config, signer)
  const supabase = getSupabaseClient(config)

  const sellTokenAddress = resolveTokenAddress(sellToken, chain)
  const buyTokenAddress = resolveTokenAddress(buyToken, chain)
  const sellAmountWei = ethers.parseUnits(sellAmount, 18)
  const buyAmountWei = ethers.parseUnits(buyAmount, 18)

  let nonce = await signer.getNonce()

  const tx = await escrow.createOffer(
    sellTokenAddress,
    sellAmountWei,
    buyTokenAddress,
    buyAmountWei,
    duration,
    { nonce: nonce++ }
  )
  const receipt = await tx.wait()

  const offerCreatedEvent = receipt.logs
    .map((log: ethers.Log) => {
      try {
        return escrow.interface.parseLog({ topics: [...log.topics], data: log.data })
      } catch {
        return null
      }
    })
    .find((parsed: ethers.LogDescription | null) => parsed?.name === "OfferCreated")

  if (!offerCreatedEvent) {
    throw new Error("OfferCreated event not found in transaction receipt")
  }

  const offerId = Number(offerCreatedEvent.args.offerId)

  const sellTokenContract = getErc20Contract(sellTokenAddress, config, signer)
  const approveTx = await sellTokenContract.approve(
    config.escrowAddress,
    sellAmountWei,
    { nonce: nonce++, gasLimit: 100_000 }
  )
  await approveTx.wait()

  const depositTx = await escrow.deposit(offerId, { nonce: nonce++, gasLimit: 300_000 })
  await depositTx.wait()

  const deadline = Math.floor(Date.now() / 1000) + duration

  await insertOffer(supabase, {
    id: offerId,
    action_type: action,
    proposer: await signer.getAddress(),
    sell_token: sellTokenAddress,
    sell_amount: sellAmount,
    buy_token: buyTokenAddress,
    buy_amount: buyAmount,
    chain,
    deadline,
    tx_hash: tx.hash,
  })

  return {
    offerId,
    txHash: tx.hash,
    depositTxHash: depositTx.hash,
    sellToken: sellTokenAddress,
    sellAmount,
    buyToken: buyTokenAddress,
    buyAmount,
    chain,
    deadline,
  }
}

export async function accept(
  config: Config,
  offerId: number
): Promise<AcceptResult> {
  if (offerId < 0) {
    throw new Error("Invalid offer ID")
  }

  const signer = getSigner(config)
  const escrow = getEscrowContract(config, signer)
  const supabase = getSupabaseClient(config)
  const signerAddress = await signer.getAddress()

  const offer = await escrow.getOffer(offerId)
  if (Number(offer.status) !== 0) {
    throw new Error("Offer is not open")
  }

  let nonce = await signer.getNonce()

  const acceptTx = await escrow.acceptOffer(offerId, { nonce: nonce++ })
  await acceptTx.wait()

  await updateOfferStatus(supabase, offerId, "accepted", signerAddress)

  const buyToken = getErc20Contract(offer.buyToken, config, signer)
  const buyAmount: bigint = offer.buyAmount

  const approveTx = await buyToken.approve(
    config.escrowAddress,
    buyAmount,
    { nonce: nonce++, gasLimit: 100_000 }
  )
  await approveTx.wait()

  const depositTx = await escrow.deposit(offerId, { nonce: nonce++, gasLimit: 300_000 })
  await depositTx.wait()

  const updatedOffer = await escrow.getOffer(offerId)
  const settled = Number(updatedOffer.status) === 2

  if (settled) {
    await updateOfferStatus(supabase, offerId, "settled")
  }

  return {
    offerId,
    acceptTxHash: acceptTx.hash,
    depositTxHash: depositTx.hash,
    settled,
  }
}

export async function refund(
  config: Config,
  offerId: number
): Promise<RefundResult> {
  if (offerId < 0) {
    throw new Error("Invalid offer ID")
  }

  const signer = getSigner(config)
  const escrow = getEscrowContract(config, signer)
  const supabase = getSupabaseClient(config)

  const offer = await escrow.getOffer(offerId)
  const status = Number(offer.status)
  const deadline = Number(offer.deadline)
  const now = Math.floor(Date.now() / 1000)

  if (status === 2) {
    throw new Error("Offer already settled")
  }
  if (status === 3) {
    throw new Error("Offer already cancelled")
  }
  if (status === 4) {
    throw new Error("Offer already expired and refunded")
  }
  if (now < deadline) {
    throw new Error(`Offer not yet expired. ${deadline - now}s remaining`)
  }

  const tx = await escrow.refund(offerId, { gasLimit: 300_000 })
  await tx.wait()

  await updateOfferStatus(supabase, offerId, "expired")

  return {
    offerId,
    txHash: tx.hash,
    proposerRefunded: Boolean(offer.proposerDeposited),
    acceptorRefunded: Boolean(offer.acceptorDeposited),
  }
}

export async function claimDepositTimeout(
  config: Config,
  offerId: number
): Promise<DepositTimeoutResult> {
  if (offerId < 0) {
    throw new Error("Invalid offer ID")
  }

  const signer = getSigner(config)
  const escrow = getEscrowContract(config, signer)
  const supabase = getSupabaseClient(config)

  const offer = await escrow.getOffer(offerId)
  const status = Number(offer.status)

  if (status !== 1) {
    throw new Error("Offer is not in Accepted state")
  }

  const depositDeadline = Number(offer.depositDeadline)
  const now = Math.floor(Date.now() / 1000)

  if (now < depositDeadline) {
    throw new Error(`Deposit window not expired. ${depositDeadline - now}s remaining`)
  }

  if (offer.proposerDeposited && offer.acceptorDeposited) {
    throw new Error("Both parties deposited — offer should have settled")
  }

  const tx = await escrow.claimDepositTimeout(offerId, { gasLimit: 300_000 })
  await tx.wait()

  await updateOfferStatus(supabase, offerId, "expired")

  return {
    offerId,
    txHash: tx.hash,
    proposerRefunded: Boolean(offer.proposerDeposited),
    acceptorRefunded: Boolean(offer.acceptorDeposited),
  }
}
