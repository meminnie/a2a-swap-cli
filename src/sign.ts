import { ethers } from "ethers"

export async function signRequest(
  signer: ethers.Wallet,
  body: Record<string, unknown>
): Promise<{ readonly signature: string; readonly timestamp: string }> {
  const timestamp = String(Date.now())
  const payload = timestamp + ":" + JSON.stringify(body)
  const signature = await signer.signMessage(payload)
  return { signature, timestamp }
}
