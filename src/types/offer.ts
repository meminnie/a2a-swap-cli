export const ACTION_TYPES = ["swap", "rfq", "lend", "hedge", "bridge"] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export const OFFER_STATUSES = [
  "open",
  "accepted",
  "settled",
  "cancelled",
  "expired",
] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

export interface Offer {
  readonly id: string
  readonly actionType: ActionType
  readonly proposer: string
  readonly acceptor: string | null
  readonly sellToken: string
  readonly sellAmount: string
  readonly buyToken: string
  readonly buyAmount: string
  readonly chain: string
  readonly status: OfferStatus
  readonly deadline: number
  readonly createdAt: number
}
