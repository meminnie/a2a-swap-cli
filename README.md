# zero-otc

> P2P OTC token swaps for AI agents and humans. No DEX, no slippage, no MEV.

[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Chain: Base](https://img.shields.io/badge/chain-Base-0052FF.svg)](https://base.org)

## What is this?

**zero-otc** is a trustless OTC swap platform on Base chain. Agents call it programmatically via the SDK. Humans use the CLI directly.

- CREATE2 escrow per trade — tokens are locked before the contract is even deployed
- Offchain matching — fast discovery, zero gas for browsing
- Reputation gating — sellers choose who can accept their offers
- Gasless for users — the operator handles all contract deployments and settlements
- Two swap modes: **Direct offers** and **RFQ (Request for Quote)**

## Install

```bash
npm install a2a-cli
```

Or clone and run locally:

```bash
git clone https://github.com/minniejung/a2a-cli.git
cd a2a-cli
npm install
```

## Setup

```bash
cp .env.example .env
```

Add your wallet private key(s):

```env
# Default wallet
PRIVATE_KEY=0xabc...

# Or use named wallets (recommended for multi-wallet testing)
PRIVATE_KEY_ALICE=0xabc...
PRIVATE_KEY_BOB=0xdef...

# API server (default: http://localhost:3000)
API_URL=http://localhost:3000

# RPC endpoint (default: Base Sepolia)
RPC_URL=https://sepolia.base.org
```

## Usage

```bash
# If installed globally
zero-otc <command> [options]

# If running locally
npx ts-node src/cli/index.ts <command> [options]

# Or use the npm script
npm run cli -- <command> [options]
```

All commands support `--wallet <name>` to select a named wallet from `.env`.
For example, `--wallet alice` loads `PRIVATE_KEY_ALICE`.

---

## Commands

### Swap Flow

#### `propose` — Create a new OTC offer

Computes a CREATE2 escrow address and transfers your sell tokens to it.

```bash
zero-otc propose --sell "1000 tUSDC" --buy "0.5 tWETH"
zero-otc propose --sell "1000 tUSDC" --buy "0.5 tWETH" --min-score 3 --wallet alice
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--sell <amount token>` | Yes | — | Amount and token to sell (e.g. `"1000 USDC"`) |
| `--buy <amount token>` | Yes | — | Amount and token to buy (e.g. `"0.5 WETH"`) |
| `--min-score <n>` | No | `0` | Minimum buyer reputation score |
| `--duration <seconds>` | No | `3600` | Offer duration (max 30 days) |
| `--chain <chain>` | No | `base-sepolia` | Target chain |
| `--wallet <name>` | No | — | Named wallet from `.env` |

#### `accept <id>` — Accept an open offer

Deploys the escrow contract and transfers your buy tokens to it. Settlement happens automatically.

```bash
zero-otc accept 42 --wallet bob
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<id>` | Yes | — | Offer ID |
| `--wallet <name>` | No | — | Named wallet from `.env` |

#### `cancel <id>` — Cancel an offer

Free if still open. Reputation penalty (-2) if already matched.

```bash
zero-otc cancel 42 --wallet alice
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<id>` | Yes | — | Offer ID |
| `--wallet <name>` | No | — | Named wallet from `.env` |

---

### RFQ Flow

#### `rfq` — Broadcast a Request for Quote

Post what you need and your budget. Other agents/users submit competing quotes.

```bash
zero-otc rfq --need "1 tWETH" --budget "2200 tUSDC" --wallet alice
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--need <amount token>` | Yes | — | Token and amount needed |
| `--budget <amount token>` | Yes | — | Max willing to pay |
| `--min-score <n>` | No | `0` | Minimum quoter reputation score |
| `--duration <seconds>` | No | `3600` | RFQ duration |
| `--chain <chain>` | No | `base-sepolia` | Target chain |
| `--wallet <name>` | No | — | Named wallet from `.env` |

#### `quote <rfq-id>` — Submit a quote

Respond to an open RFQ with your offer.

```bash
zero-otc quote 7 --offer "0.9 tWETH" --wallet bob
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<rfq-id>` | Yes | — | RFQ ID |
| `--offer <amount token>` | Yes | — | What you're offering |
| `--chain <chain>` | No | `base-sepolia` | Target chain |
| `--wallet <name>` | No | — | Named wallet from `.env` |

#### `quotes <rfq-id>` — List quotes

View all quotes for an RFQ with quoter reputation scores.

```bash
zero-otc quotes 7
```

#### `pick <rfq-id> <quote-id>` — Accept a quote

Deploys escrow and transfers your tokens. Settlement is automatic.

```bash
zero-otc pick 7 3 --wallet alice
```

---

### Discovery

#### `list` — View open offers

Shows all open offers with seller reputation scores. Offers with insufficient escrow balance are hidden.

```bash
zero-otc list
zero-otc list --chain base-sepolia
```

#### `watch` — Poll for new offers

Continuously polls the API for new offers.

```bash
zero-otc watch
zero-otc watch --interval 5
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--chain <chain>` | No | `base-sepolia` | Filter by chain |
| `--interval <seconds>` | No | `10` | Poll interval |

#### `history` — View past trades

Shows settled, cancelled, and expired trades for your wallet.

```bash
zero-otc history --wallet alice
zero-otc history --wallet alice --limit 50
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--limit <n>` | No | `20` | Number of records |
| `--wallet <name>` | No | — | Named wallet from `.env` |

#### `trust <address>` — Check reputation

```bash
zero-otc trust 0x1234...abcd
```

Returns: score, successful swaps, failed swaps, cancellations.

---

## SDK

Use `zero-otc` programmatically in your AI agent or application:

```typescript
import { ZeroOTC } from "a2a-cli"

const otc = new ZeroOTC({ apiUrl: "http://localhost:3000" })

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

| Event | Score Delta |
|-------|-------------|
| Successful swap | **+1** (both sides) |
| Buyer timeout (no deposit) | **-3** (buyer) |
| Post-match cancellation | **-2** (canceller) |

```
score = successful_swaps - (failed_swaps * 3) - (cancellations * 2)
```

Sellers set `--min-score` to filter out low-reputation buyers.

---

## Supported Tokens

### Base Sepolia (Testnet)

| Symbol | Address |
|--------|---------|
| tUSDC | `0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2` |
| tWETH | `0x4322cB832Ab806cC123540428125a92180725a23` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH | `0x4200000000000000000000000000000000000006` |
| DAI | `0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9` |

### Base (Mainnet)

| Symbol | Address |
|--------|---------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` |

You can also pass raw token addresses instead of symbols:
```bash
zero-otc propose --sell "1000 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" --buy "0.5 WETH"
```

---

## Architecture

```
Seller CLI ──→ API Server ──→ Supabase (offers, reputation)
Buyer  CLI ──→ API Server ──→ Operator EOA (CREATE2 deploy + settle)
                          ──→ Base chain (TradeEscrow contracts)
```

**How a trade works:**

1. Seller runs `propose` → API computes CREATE2 escrow address → Seller sends tokens to that address
2. Buyer runs `accept` → API validates reputation + deploys escrow → Buyer sends tokens to escrow
3. Operator detects both deposits → calls `settle()` → tokens swapped, 0.1% fee deducted

**Contracts:**

| Contract | Description | Address (Base Sepolia) |
|----------|-------------|------------------------|
| EscrowFactory | Deploys per-trade escrow contracts via CREATE2 | `0x1354252a5B16899e7D1450a8Fc84eF5c04393BA4` |
| TradeEscrow | Holds tokens and executes atomic swap on settle | Deployed per trade |

- `settle(sellAmt, buyAmt)` — operator passes amounts; contract validates balances
- `refund()` — returns tokens to seller if buyer doesn't deposit before deadline
- `cancel()` — either party can cancel; returns tokens to respective owners
- `rescueToken(token)` — recover tokens sent to wrong escrow
- Protocol fee: 0.1% (10 bps) from both sides, configurable up to 1%

---

## Self-Hosting

### Prerequisites

- Node.js 18+
- A Supabase project
- A Base Sepolia wallet with test ETH (for the operator)

### 1. Deploy Contracts

```bash
npx hardhat compile
npx hardhat run contracts/scripts/deploy.ts --network baseSepolia
```

### 2. Set Up Database

Run `server/supabase/schema-v2.sql` in your Supabase SQL Editor.

### 3. Configure Server

```env
# server/.env
OPERATOR_PRIVATE_KEY=0x...        # Operator EOA (deploys + settles)
FACTORY_ADDRESS=0x...             # EscrowFactory address from step 1
SUPABASE_URL=https://...          # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=...     # Supabase service_role key
RPC_URL=https://sepolia.base.org
PORT=3000
FEE_BPS=10                        # Fee in basis points (0.1%)
```

### 4. Start Server

```bash
cd server
npm install
npm run dev
# Swagger docs at http://localhost:3000/docs
```

---

## Testing

```bash
# Contract tests (39 passing)
npx hardhat test

# Server tests (26 passing)
cd server && npm test
```

---

## Project Structure

```
contracts/
  src/                Solidity contracts (EscrowFactory, TradeEscrow)
  test/               Contract tests
  scripts/            Deploy scripts
server/
  src/                Fastify API server + operator automation
  test/               Server tests
  supabase/           SQL schema
src/
  cli/commands/       CLI command implementations
  sdk/index.ts        SDK (ZeroOTC class)
  api.ts              API client
  config.ts           Environment config
  contract.ts         ethers.js signer/provider
  tokens.ts           Token symbol <-> address mapping
```

## License

ISC
