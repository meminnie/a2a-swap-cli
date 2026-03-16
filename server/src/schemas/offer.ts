export const createOfferSchema = {
  description: "Create a new OTC swap offer",
  tags: ["offers"],
  body: {
    type: "object" as const,
    required: ["seller", "sellToken", "sellAmount", "buyToken", "buyAmount"],
    properties: {
      seller: { type: "string" as const, description: "Seller wallet address" },
      sellToken: { type: "string" as const, description: "Token address to sell" },
      sellAmount: { type: "string" as const, description: "Amount to sell (wei)" },
      buyToken: { type: "string" as const, description: "Token address to buy" },
      buyAmount: { type: "string" as const, description: "Amount to buy (wei)" },
      minScore: { type: "integer" as const, default: 0, description: "Minimum buyer reputation score" },
      deadlineSeconds: { type: "integer" as const, default: 3600, description: "Offer deadline in seconds" },
    },
  },
  response: {
    200: {
      type: "object" as const,
      properties: {
        success: { type: "boolean" as const },
        data: {
          type: "object" as const,
          properties: {
            offerId: { type: "integer" as const },
            escrowAddress: { type: "string" as const },
            deadline: { type: "string" as const },
            nonce: { type: "integer" as const },
          },
        },
      },
    },
  },
}

export const listOffersSchema = {
  description: "List open offers with seller reputation scores",
  tags: ["offers"],
  querystring: {
    type: "object" as const,
    properties: {
      chain: { type: "string" as const, default: "base-sepolia" },
    },
  },
  response: {
    200: {
      type: "object" as const,
      properties: {
        success: { type: "boolean" as const },
        data: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              id: { type: "integer" as const },
              seller: { type: "string" as const },
              sellToken: { type: "string" as const },
              sellAmount: { type: "string" as const },
              buyToken: { type: "string" as const },
              buyAmount: { type: "string" as const },
              escrowAddress: { type: "string" as const },
              minScore: { type: "integer" as const },
              deadline: { type: "string" as const },
              sellerScore: { type: "integer" as const },
            },
          },
        },
      },
    },
  },
}

export const acceptOfferSchema = {
  description: "Accept an offer as buyer (triggers contract deployment)",
  tags: ["offers"],
  params: {
    type: "object" as const,
    properties: {
      id: { type: "integer" as const },
    },
  },
  body: {
    type: "object" as const,
    required: ["buyer"],
    properties: {
      buyer: { type: "string" as const, description: "Buyer wallet address" },
    },
  },
  response: {
    200: {
      type: "object" as const,
      properties: {
        success: { type: "boolean" as const },
        data: {
          type: "object" as const,
          properties: {
            escrowAddress: { type: "string" as const },
            txHash: { type: "string" as const },
            depositDeadline: { type: "string" as const },
          },
        },
      },
    },
  },
}

export const cancelOfferSchema = {
  description: "Cancel an offer (penalty if already matched)",
  tags: ["offers"],
  params: {
    type: "object" as const,
    properties: {
      id: { type: "integer" as const },
    },
  },
  body: {
    type: "object" as const,
    required: ["wallet"],
    properties: {
      wallet: { type: "string" as const, description: "Wallet requesting cancellation" },
    },
  },
}

export const historySchema = {
  description: "Get trade history for a wallet",
  tags: ["offers"],
  querystring: {
    type: "object" as const,
    required: ["wallet"],
    properties: {
      wallet: { type: "string" as const, description: "Wallet address" },
      limit: { type: "integer" as const, default: 20, description: "Max records to return" },
    },
  },
}

export const getOfferSchema = {
  description: "Get offer details and status",
  tags: ["offers"],
  params: {
    type: "object" as const,
    properties: {
      id: { type: "integer" as const },
    },
  },
}
