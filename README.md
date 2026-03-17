# zero-otc

AI agent-to-agent P2P OTC swap platform on Base chain with CREATE2 escrow and reputation gating.

No DEX routing — no slippage, no MEV. Agents call it programmatically, humans use it directly.

## Architecture

```
Seller CLI ──→ API Server ──→ Supabase (offers, reputation)
Buyer  CLI ──→ API Server ──→ Operator EOA (CREATE2 deploy + settle)
                          ──→ Base chain (TradeEscrow contracts)
```

- **Offchain matching** via Supabase — fast discovery, no gas for browsing
- **CREATE2 escrow** per trade — seller sends tokens to pre-computed address before contract exists
- **Amounts off-chain** — trade amounts stored in DB, not in contract constructor. Operator passes amounts at settle time.
- **Operator deploys + settles** — gasless for users, they only transfer tokens
- **Balance-gated listing** — offers hidden from discovery if escrow balance < promised amount
- **Reputation system** — score starts at 0, grows with successful trades

## Stack

- **Contracts**: Solidity 0.8.24 + Hardhat (EscrowFactory + TradeEscrow)
- **API Server**: Fastify + Swagger (operator automation)
- **DB**: Supabase (PostgreSQL, service_role writes only)
- **CLI**: TypeScript + Commander.js
- **SDK**: `ZeroOTC` class for programmatic access
- **Chain**: Base Sepolia (testnet) → Base (mainnet)

## Quick Start

### Prerequisites

- Node.js 18+
- A Base Sepolia wallet with test ETH
- A Supabase project

### Setup

```bash
npm install
cp .env.example .env
# Fill in wallet keys
```

### Deploy Contracts

```bash
npx hardhat compile
npx hardhat run contracts/scripts/deploy.ts --network baseSepolia
# Copy FACTORY_ADDRESS into server .env
```

### Set Up Supabase

Run `server/supabase/schema-v2.sql` in your Supabase SQL Editor.

### Start Server

```bash
cd server
npm install
npm run dev
# Swagger docs at http://localhost:3000/docs
```

### Run CLI

```bash
# Create an offer (tokens sent to CREATE2 address)
npx ts-node src/cli/index.ts propose --sell "1000 tUSDC" --buy "0.5 tWETH" --min-score 3

# List open offers (with seller reputation)
npx ts-node src/cli/index.ts list

# Accept an offer (escrow deployed, tokens transferred)
npx ts-node src/cli/index.ts accept 42 --wallet buyer

# Cancel (free if open, -2 penalty if matched)
npx ts-node src/cli/index.ts cancel 42

# Check reputation
npx ts-node src/cli/index.ts trust 0x1234...abcd

# Trade history
npx ts-node src/cli/index.ts history --wallet test1
```

## Commands

| Command | Description |
|---------|-------------|
| `propose --sell "amt token" --buy "amt token"` | Create offer, send tokens to CREATE2 escrow address |
| `accept <id>` | Accept offer, deploy escrow, transfer buy tokens |
| `cancel <id>` | Cancel offer (penalty if already matched) |
| `list [--chain]` | View open offers with seller scores |
| `watch [--chain]` | Poll for new offers |
| `history [--limit]` | View past trades |
| `trust <address>` | Check wallet reputation score |
| `rfq --need "amt token" --budget "amt token"` | Broadcast Request for Quote |
| `quote <rfq-id> --offer "amt token"` | Submit quote for an RFQ |
| `quotes <rfq-id>` | List quotes with quoter scores |
| `pick <rfq-id> <quote-id>` | Pick quote, deploy escrow, transfer tokens |

All commands support `--wallet <name>` to select a named wallet from `.env`.

## RFQ Flow

```bash
# 1. Broadcast RFQ
npx ts-node src/cli/index.ts rfq --need "1 tWETH" --budget "2200 tUSDC" --wallet alice

# 2. Submit quote (from another wallet)
npx ts-node src/cli/index.ts quote 7 --offer "0.9 tWETH" --wallet bob

# 3. List and compare quotes
npx ts-node src/cli/index.ts quotes 7

# 4. Pick best quote → deploys escrow, transfers tokens
npx ts-node src/cli/index.ts pick 7 3 --wallet alice
# Settlement happens automatically via operator
```

## SDK

```typescript
import { ZeroOTC } from "a2a-cli"

const otc = new ZeroOTC({ apiUrl: "http://localhost:3000" })

// Propose a swap
const offer = await otc.propose({
  seller: "0x...", sellToken: "0x...", sellAmount: "1000000",
  buyToken: "0x...", buyAmount: "500000", minScore: 3,
})

// Accept
const result = await otc.accept(offer.offerId, "0xBuyerAddress")

// RFQ flow
const rfq = await otc.createRfq({ ... })
const quotes = await otc.listQuotes(rfq.rfqId)
const pick = await otc.pickQuote(rfq.rfqId, quotes[0].id)

// Reputation
const rep = await otc.getReputation("0x...")

// History
const trades = await otc.getHistory("0x...", 20)
```

## Reputation

| Event | Score |
|-------|-------|
| Successful swap | +1 (both sides) |
| Buyer timeout | -3 (buyer) |
| Post-match cancel | -2 (canceller) |

`score = successful_swaps - (failed_swaps * 3) - (cancellations * 2)`

Sellers can set `--min-score` to gate who can accept their offers.

## Contract Architecture

- **TradeEscrow** constructor takes: seller, buyer, sellToken, buyToken, feeBps, feeRecipient, operator, deadline (no amounts)
- **`settle(sellAmt, buyAmt)`** — operator passes amounts from DB; contract validates `balance >= amount`
- **`rescueToken(token)`** — unrestricted: sellToken→seller, buyToken→buyer, unknown→caller. Blocked after settle/refund/cancel.
- **Protocol fee**: 0.1% (10 bps) from both sides on settlement. Owner can adjust via `setFeeBps()` (max 1%) and `setFeeRecipient()`.

## Environment Variables

### CLI (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes* | — | Default wallet private key |
| `PRIVATE_KEY_<NAME>` | No | — | Named wallet (`--wallet name`) |
| `RPC_URL` | No | `https://sepolia.base.org` | RPC endpoint |
| `API_URL` | No | `http://localhost:3000` | API server URL |

\* Not required if using `--wallet` flag exclusively.

### Server (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPERATOR_PRIVATE_KEY` | Yes | — | Operator EOA (deploys + settles) |
| `FACTORY_ADDRESS` | Yes | — | EscrowFactory contract address |
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Supabase service_role key |
| `RPC_URL` | No | `https://sepolia.base.org` | RPC endpoint |
| `PORT` | No | `3000` | Server port |
| `FEE_BPS` | No | `10` | Fee in basis points |

## Project Structure

```
contracts/
  src/               Solidity contracts (EscrowFactory, TradeEscrow)
  test/              Contract tests (39 passing)
  scripts/           Deploy scripts
server/
  src/               Fastify API server + operator automation
  test/              Server tests (26 passing)
  supabase/          SQL schema (schema-v2.sql)
src/
  cli/commands/      CLI command implementations
  sdk/index.ts       SDK (ZeroOTC class)
  api.ts             API client (fetch-based)
  config.ts          Environment config
  contract.ts        ethers.js signer/provider
  tokens.ts          Token symbol <-> address mapping
```

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| EscrowFactory | `0x1354252a5B16899e7D1450a8Fc84eF5c04393BA4` |
| tUSDC | `0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2` |
| tWETH | `0x4322cB832Ab806cC123540428125a92180725a23` |

## Testing

```bash
npx hardhat test              # 39 contract tests
cd server && npm test         # 26 server tests
```

## License

ISC
