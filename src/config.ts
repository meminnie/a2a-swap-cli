import * as dotenv from "dotenv";

dotenv.config();

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export interface Config {
  readonly privateKey: string;
  readonly rpcUrl: string;
  readonly chain: string;
}

function resolvePrivateKey(wallet?: string): string {
  if (wallet) {
    const envKey = `PRIVATE_KEY_${wallet.toUpperCase()}`;
    const value = process.env[envKey];
    if (!value) {
      throw new Error(`Wallet "${wallet}" not found. Set ${envKey} in .env`);
    }
    return value;
  }

  const value = process.env.PRIVATE_KEY;
  if (!value) {
    throw new Error("Missing PRIVATE_KEY in .env (or use --wallet <name>)");
  }
  return value;
}

export function loadConfig(wallet?: string): Config {
  return {
    privateKey: resolvePrivateKey(wallet),
    rpcUrl: optionalEnv("RPC_URL", "https://mainnet.base.org"),
    chain: optionalEnv("CHAIN", "base"),
  };
}
