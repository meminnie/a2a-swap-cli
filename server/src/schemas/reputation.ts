export const getReputationSchema = {
  description: "Get reputation score for a wallet",
  tags: ["reputation"],
  params: {
    type: "object" as const,
    properties: {
      wallet: { type: "string" as const },
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
            wallet: { type: "string" as const },
            successfulSwaps: { type: "integer" as const },
            failedSwaps: { type: "integer" as const },
            cancellations: { type: "integer" as const },
            score: { type: "integer" as const },
          },
        },
      },
    },
  },
}
