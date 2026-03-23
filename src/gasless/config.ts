export interface GaslessConfig {
  readonly projectId: string
  readonly bundlerUrl: string
  readonly paymasterUrl: string
}

export function loadGaslessConfig(): GaslessConfig {
  const projectId = process.env.ZERODEV_PROJECT_ID
  const bundlerUrl = process.env.ZERODEV_BUNDLER_URL
  const paymasterUrl = process.env.ZERODEV_PAYMASTER_URL

  if (!projectId) {
    throw new Error("ZERODEV_PROJECT_ID is required for --gasless mode")
  }
  if (!bundlerUrl) {
    throw new Error("ZERODEV_BUNDLER_URL is required for --gasless mode")
  }
  if (!paymasterUrl) {
    throw new Error("ZERODEV_PAYMASTER_URL is required for --gasless mode")
  }

  return { projectId, bundlerUrl, paymasterUrl }
}
