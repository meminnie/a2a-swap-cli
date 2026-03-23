# a2a-swap-cli

> P2P OTC token swaps for AI agents and humans. No DEX, no slippage, no MEV.

[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Chain: Base](https://img.shields.io/badge/chain-Base-0052FF.svg)](https://base.org)

## What is this?

**a2a-swap-cli** is a CLI and SDK for trustless OTC token swaps on Base chain.

- CREATE2 escrow per trade -- tokens are locked before the contract is even deployed
- Offchain matching -- fast discovery, zero gas for browsing
- Reputation gating -- sellers choose who can accept their offers
- Two swap modes: **Direct offers** and **RFQ (Request for Quote)**

## Install

```bash
npm install a2a-swap
```

Add your wallet private key to `.env`:

```env
# Wallet (use --wallet mykey)
PRIVATE_KEY_MYKEY=0x...
```

## Usage

```bash
npx a2a-swap <command> [options]
```

All commands require `--wallet <name>` to select a wallet from `.env`.

---

## Commands

### Swap Flow

#### `propose` -- Create a new OTC offer

Computes a CREATE2 escrow address and transfers your sell tokens to it.

```bash
npx a2a-swap propose --sell "1000 tUSDC" --buy "0.5 tWETH" --wallet test1
npx a2a-swap propose --sell "1000 tUSDC" --buy "0.5 tWETH" --min-score 3 --wallet test1
```

| Option                  | Required | Default        | Description                    |
| ----------------------- | -------- | -------------- | ------------------------------ |
| `--sell <amount token>` | Yes      | --             | Amount and token to sell       |
| `--buy <amount token>`  | Yes      | --             | Amount and token to buy        |
| `--min-score <n>`       | No       | `0`            | Minimum buyer reputation score |
| `--duration <seconds>`  | No       | `3600`         | Offer duration (max 30 days)   |
| `--chain <chain>`       | No       | `base-sepolia` | Target chain                   |
| `--wallet <name>`       | Yes      | --             | Named wallet from `.env`       |

#### `accept <id>` -- Accept an open offer

Deploys the escrow contract and transfers your buy tokens to it. Settlement happens automatically.

```bash
npx a2a-swap accept 42 --wallet test2
```

#### `cancel <id>` -- Cancel an offer

Free if still open. Reputation penalty (-2) if already matched.

```bash
npx a2a-swap cancel 42 --wallet test1
```

---

### RFQ Flow

#### `rfq` -- Broadcast a Request for Quote

Post what you need and your budget. Other agents/users submit competing quotes.

```bash
npx a2a-swap rfq --need "1 tWETH" --budget "2200 tUSDC" --wallet test1
```

| Option                    | Required | Default        | Description                     |
| ------------------------- | -------- | -------------- | ------------------------------- |
| `--need <amount token>`   | Yes      | --             | Token and amount needed         |
| `--budget <amount token>` | Yes      | --             | Max willing to pay              |
| `--min-score <n>`         | No       | `0`            | Minimum quoter reputation score |
| `--duration <seconds>`    | No       | `3600`         | RFQ duration                    |
| `--chain <chain>`         | No       | `base-sepolia` | Target chain                    |
| `--wallet <name>`         | Yes      | --             | Named wallet from `.env`        |

#### `quote <rfq-id>` -- Submit a quote

```bash
npx a2a-swap quote 7 --offer "0.9 tWETH" --wallet test2
```

#### `quotes <rfq-id>` -- List quotes

```bash
npx a2a-swap quotes 7
```

#### `pick <rfq-id> <quote-id>` -- Accept a quote

```bash
npx a2a-swap pick 7 3 --wallet test1
```

---

### Discovery

#### `list` -- View open offers

```bash
npx a2a-swap list
npx a2a-swap list --chain base-sepolia
```

#### `watch` -- Poll for new offers

```bash
npx a2a-swap watch
npx a2a-swap watch --interval 5
```

#### `history` -- View past trades

```bash
npx a2a-swap history --wallet test1
npx a2a-swap history --wallet test1 --limit 50
```

#### `trust <address>` -- Check reputation

```bash
npx a2a-swap trust 0x1234...abcd
```

---

## SDK

```typescript
import { A2ASwap } from "a2a-swap"

const otc = new A2ASwap()

// Create an offer
const offer = await otc.propose({
  seller: "0x...",
  sellToken: "0x...",
  sellAmount: "1000000000000000000",
  buyToken: "0x...",
  buyAmount: "500000000000000000",
  minScore: 3,
})

// Accept an offer
const result = await otc.accept(offer.offerId, "0xBuyerAddress")

// RFQ flow
const rfq = await otc.createRfq({ ... })
const quotes = await otc.listQuotes(rfq.rfqId)
await otc.pickQuote(rfq.rfqId, quotes[0].id)

// Query
const rep = await otc.getReputation("0x...")
const trades = await otc.getHistory("0x...", 20)
const offers = await otc.listOffers("base-sepolia")
```

---

## Reputation System

| Event                      | Score Delta         |
| -------------------------- | ------------------- |
| Successful swap            | **+1** (both sides) |
| Buyer timeout (no deposit) | **-3** (buyer)      |
| Post-match cancellation    | **-2** (canceller)  |

```
score = successful_swaps - (failed_swaps * 3) - (cancellations * 2)
```

Sellers set `--min-score` to filter out low-reputation buyers.

### Utility

#### `unwrap` -- Convert WETH back to ETH

```bash
npx a2a-swap unwrap --wallet test1
npx a2a-swap unwrap --wallet test1 --amount 0.5
```

| Option             | Required | Default        | Description              |
| ------------------ | -------- | -------------- | ------------------------ |
| `--amount <ether>` | No       | all            | Amount to unwrap         |
| `--chain <chain>`  | No       | `base-sepolia` | Target chain             |
| `--wallet <name>`  | Yes      | --             | Named wallet from `.env` |

---

## Native ETH Support

Use `ETH` as a token symbol. The CLI auto-wraps ETH → WETH before escrow deposit and auto-unwraps after settlement.

```bash
npx a2a-swap propose --sell "0.5 ETH" --buy "1000 USDC" --wallet test1
npx a2a-swap unwrap --wallet test1   # manual unwrap if needed
```

---

## Supported Tokens

### Base Sepolia (Testnet)

| Symbol | Decimals | Address                                      |
| ------ | -------- | -------------------------------------------- |
| USDC   | 6        | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH   | 18       | `0x4200000000000000000000000000000000000006` |
| DAI    | 18       | `0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9` |
| tUSDC  | 18       | `0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2` |
| tWETH  | 18       | `0x4322cB832Ab806cC123540428125a92180725a23` |

### Base (Mainnet)

| Symbol | Decimals | Address                                      |
| ------ | -------- | -------------------------------------------- |
| USDC   | 6        | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH   | 18       | `0x4200000000000000000000000000000000000006` |
| DAI    | 18       | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` |

You can also pass raw token addresses instead of symbols:

```bash
npx a2a-swap propose --sell "1000 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" --buy "0.5 WETH" --wallet test1
```

---

## Architecture

```
Seller CLI ──> API Server ──> Supabase (offers, quotes, reputation)
Buyer  CLI ──> API Server ──> Operator EOA (CREATE2 deploy + settle)
                          ──> Base chain (TradeEscrow contracts)
```

**How a trade works:**

1. Seller runs `propose` -> API computes CREATE2 escrow address -> Seller sends tokens to that address
2. Buyer runs `accept` -> API validates reputation + deploys escrow -> Buyer sends tokens to escrow
3. Operator detects both deposits -> calls `settle()` -> tokens swapped, 0.1% fee deducted

---

## Project Structure

```
src/
  cli/commands/       CLI command implementations
  sdk/index.ts        SDK (A2ASwap class)
  api.ts              API client with signature auth
  config.ts           Environment config
  contract.ts         ethers.js signer/provider
  sign.ts             EIP-191 request signing
  tokens.ts           Token symbol/address/decimals registry
  weth.ts             ETH wrap/unwrap operations
  poll.ts             Settlement polling + auto-unwrap
```

## License

ISC
