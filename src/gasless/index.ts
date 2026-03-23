export { loadGaslessConfig, type GaslessConfig } from "./config"
export { createSmartAccount, type SmartAccountBundle, type KernelClient } from "./account"
export { sendGaslessTransaction } from "./transaction"

import { checkGaslessEnabled } from "../api"
import { loadGaslessConfig } from "./config"

export async function requireGasless(): Promise<void> {
  loadGaslessConfig()

  const serverEnabled = await checkGaslessEnabled()
  if (!serverEnabled) {
    throw new Error("Gasless mode is disabled by server. Contact the admin to enable it.")
  }
}
