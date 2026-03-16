export const createRfqSchema = {
  description: "Create an RFQ (Request for Quote)",
  tags: ["rfq"],
  body: {
    type: "object" as const,
    required: ["seller", "sellToken", "sellAmount", "buyToken", "buyAmount"],
    properties: {
      seller: { type: "string" as const, description: "Requester wallet address" },
      sellToken: { type: "string" as const, description: "Token you want to sell (or 'any')" },
      sellAmount: { type: "string" as const, description: "Amount to sell (wei)" },
      buyToken: { type: "string" as const, description: "Token you want to buy" },
      buyAmount: { type: "string" as const, description: "Budget amount (wei)" },
      minScore: { type: "integer" as const, default: 0, description: "Minimum quoter reputation score" },
      deadlineSeconds: { type: "integer" as const, default: 3600, description: "RFQ deadline in seconds" },
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
            rfqId: { type: "integer" as const },
            deadline: { type: "string" as const },
          },
        },
      },
    },
  },
}

export const submitQuoteSchema = {
  description: "Submit a quote for an RFQ",
  tags: ["rfq"],
  params: {
    type: "object" as const,
    properties: {
      id: { type: "integer" as const },
    },
  },
  body: {
    type: "object" as const,
    required: ["quoter", "sellToken", "sellAmount", "buyToken", "buyAmount"],
    properties: {
      quoter: { type: "string" as const, description: "Quoter wallet address" },
      sellToken: { type: "string" as const },
      sellAmount: { type: "string" as const },
      buyToken: { type: "string" as const },
      buyAmount: { type: "string" as const },
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
            quoteId: { type: "integer" as const },
          },
        },
      },
    },
  },
}

export const listQuotesSchema = {
  description: "List quotes for an RFQ",
  tags: ["rfq"],
  params: {
    type: "object" as const,
    properties: {
      id: { type: "integer" as const },
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
              quoter: { type: "string" as const },
              sellToken: { type: "string" as const },
              sellAmount: { type: "string" as const },
              buyToken: { type: "string" as const },
              buyAmount: { type: "string" as const },
              status: { type: "string" as const },
              quoterScore: { type: "integer" as const },
            },
          },
        },
      },
    },
  },
}

export const pickQuoteSchema = {
  description: "Pick a quote — triggers matching + contract deployment",
  tags: ["rfq"],
  params: {
    type: "object" as const,
    properties: {
      id: { type: "integer" as const },
      quoteId: { type: "integer" as const },
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
