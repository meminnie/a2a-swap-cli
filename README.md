# zero-otc

AI agent-to-agent P2P OTC swap CLI on Base chain, gated by ERC-8004 reputation scores.

No DEX routing — no slippage, no MEV. Agents call it programmatically, humans use it directly.

## Stack

- **Contracts**: Solidity 0.8.24 + Hardhat + OpenZeppelin
- **CLI**: TypeScript + Commander.js
- **Discovery**: Supabase (offers DB + realtime subscriptions)
- **Settlement**: On-chain Escrow contract (atomic swap on mutual deposit)
- **Oracle**: CoinGecko (free API, no key required)
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
# Fill in your .env values
```

### Deploy Contract

```bash
npx hardhat compile
npx hardhat run scripts/deploy.ts --network baseSepolia
# Copy the deployed ESCROW_ADDRESS into .env
```

### Set Up Supabase

Run the SQL in `supabase/schema.sql` and `supabase/quotes.sql` in your Supabase SQL Editor to create the `offers` and `quotes` tables.

Enable realtime:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE offers;
ALTER PUBLICATION supabase_realtime ADD TABLE quotes;
```

### Run CLI

```bash
# Create an offer
npx ts-node src/cli/index.ts propose --sell "1000 USDC" --buy "0.5 WETH"

# List open offers
npx ts-node src/cli/index.ts list

# Accept an offer
npx ts-node src/cli/index.ts accept 0

# Watch offers in realtime
npx ts-node src/cli/index.ts watch

# View trade history
npx ts-node src/cli/index.ts history

# Check trust score
npx ts-node src/cli/index.ts trust 0x1234...abcd
```

## Commands

| Command | Description |
|---------|-------------|
| `propose --sell <"amount token"> --buy <"amount token">` | Create on-chain offer + lock tokens + broadcast to Supabase |
| `accept <offer-id>` | Accept offer, approve tokens, deposit into escrow, auto-settle |
| `deposit <offer-id>` | Manual deposit for either party |
| `refund <offer-id>` | Claim refund from expired offers (handles both Open and Accepted status) |
| `list [--chain] [--action]` | Query open offers from Supabase |
| `watch [--chain]` | Realtime monitoring of new/updated offers |
| `auto-accept [--max-slippage] [--dry-run]` | Auto-accept offers within oracle price threshold |
| `rfq --need <"amount token"> --budget <"amount token">` | Broadcast RFQ — "I need X, willing to pay up to Y" |
| `quote <rfq-id> --offer <"amount token">` | Submit quote for an RFQ, auto-accepts when picked |
| `pick <rfq-id> <quote-id>` | Pick a quote, create on-chain escrow, auto-settles |
| `history [--limit]` | View your settled/cancelled trades |
| `trust <address>` | Check ERC-8004 trust score |

All commands support `--wallet <name>` to select a named wallet from `.env`.

## Auto-Accept (Agent Mode)

The `auto-accept` command runs as a persistent agent that monitors new offers via Supabase Realtime and automatically accepts them if the price is within the configured oracle threshold.

```bash
# Dry run — evaluate offers without accepting
npx ts-node src/cli/index.ts auto-accept --wallet test2 --dry-run

# Live — accept offers within 1% of oracle price (default)
npx ts-node src/cli/index.ts auto-accept --wallet test2

# Custom slippage tolerance
npx ts-node src/cli/index.ts auto-accept --wallet test2 --max-slippage 5
```

**Policy logic:**
- Compares USD value of what acceptor receives vs pays (via CoinGecko oracle)
- Accepts if overpay is within `--max-slippage` percentage
- Skips own offers (same wallet)
- Processes one offer at a time (sequential, no race conditions)

## Multi-Wallet Support

Store multiple private keys in `.env` with the `PRIVATE_KEY_<NAME>` pattern:

```env
PRIVATE_KEY_TEST1=abc...
PRIVATE_KEY_TEST2=def...
```

```bash
# Propose from test1 wallet
npx ts-node src/cli/index.ts propose --wallet test1 --sell "2100 tUSDC" --buy "1 tWETH"

# Auto-accept from test2 wallet
npx ts-node src/cli/index.ts auto-accept --wallet test2
```

## RFQ Flow (Request for Quote)

RFQ enables price discovery — broadcast what you need, get competing quotes, pick the best one.

```bash
# 1. Broadcast RFQ (I need 1 tWETH, willing to pay up to 2200 tUSDC)
npx ts-node src/cli/index.ts rfq --need "1 tWETH" --budget "2200 tUSDC" --watch --wallet test1

# 2. Submit a quote (from another wallet)
npx ts-node src/cli/index.ts quote 1 --offer "0.9 tWETH" --wallet test2

# 3. Pick the best quote → creates on-chain escrow + deposits
npx ts-node src/cli/index.ts pick 1 2 --wallet test1

# 4. Quoter auto-accepts: the quote command auto-detects the pick and settles the escrow
```

**Flow**: RFQ (Supabase only) → Quotes (Supabase only) → Pick (creates on-chain escrow) → Auto-settle

## Architecture

```
CLI (Commander.js)
 ├── propose / accept / deposit / refund  →  Escrow Contract (Base Sepolia)
 ├── list / history / watch               →  Supabase (PostgreSQL + Realtime)
 ├── auto-accept                          →  Supabase Realtime + CoinGecko Oracle + Escrow
 └── rfq / quote / pick                   →  Supabase (discovery) + Escrow (settlement)
```

**Hybrid design**: Escrow contract handles money (settlement), Supabase handles data (offer discovery and status tracking). Any agent framework can integrate via CLI or SDK.

## SDK (Programmatic Access)

Use the `ZeroOTC` class to integrate into any agent framework:

```typescript
import { ZeroOTC } from "a2a-cli"

const otc = ZeroOTC.fromEnv("test1")

// Propose a swap
const result = await otc.propose({ sell: "1000 tUSDC", buy: "0.5 tWETH" })
console.log(result.offerId, result.txHash)

// Accept an offer
const accept = await otc.accept(0)
console.log(accept.settled) // true if both sides deposited

// List open offers
const offers = await otc.listOffers()

// Watch for new offers (realtime)
const { unsubscribe } = otc.watch((offer) => console.log("New offer:", offer.id))

// RFQ flow
const rfq = await otc.createRfq({ need: "1 tWETH", budget: "2200 tUSDC" })
const quote = await otc.submitQuote({ rfqId: rfq.rfqId, offer: "0.9 tWETH" })
const pick = await otc.pickQuote(rfq.rfqId, quote.quoteId)

// Oracle price check
const price = await otc.getPrice("WETH")
const evaluation = await otc.evaluateOffer({
  sellToken: "0x...", sellAmount: "1000", buyToken: "0x...", buyAmount: "0.5"
}, 2) // max 2% slippage

// Refund expired offer
const refund = await otc.refund(42)
```

You can also pass a raw `Config` object instead of using env vars:

```typescript
const otc = new ZeroOTC({
  privateKey: "0x...",
  rpcUrl: "https://sepolia.base.org",
  escrowAddress: "0x4C96...",
  supabaseUrl: "https://xxx.supabase.co",
  supabaseAnonKey: "eyJ...",
  chain: "base-sepolia",
  minTrustScore: 80,
  trustRegistryAddress: null,
})
```

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| Escrow (v3 — deposit window) | `0x8cDeF17F8FC1eBB2d7fabd50d0dBfc564070391B` |
| tUSDC | `0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2` |
| tWETH | `0x4322cB832Ab806cC123540428125a92180725a23` |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes* | — | Default wallet private key |
| `PRIVATE_KEY_<NAME>` | No | — | Named wallet (use with `--wallet`) |
| `ESCROW_ADDRESS` | Yes | — | Deployed Escrow contract address |
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | — | Supabase anonymous key |
| `RPC_URL` | No | `https://sepolia.base.org` | RPC endpoint |
| `CHAIN` | No | `base-sepolia` | Target chain |
| `MIN_TRUST_SCORE` | No | `80` | Minimum ERC-8004 trust score |
| `TRUST_REGISTRY_ADDRESS` | No | — | ERC-8004 trust registry contract |

\* Not required if using `--wallet` flag exclusively.

## Supported Tokens

**Base Sepolia**: USDC, WETH, DAI, tUSDC, tWETH

You can also pass raw token addresses instead of symbols.

## Testing

```bash
npx hardhat test
```

## Project Structure

```
contracts/          Solidity contracts (Escrow, MockERC20)
src/
  sdk/
    index.ts        SDK entry point (ZeroOTC class + re-exports)
    swap.ts         Propose / accept / refund operations
    rfq.ts          RFQ / quote / pick operations
  cli/
    commands/       CLI command implementations
    index.ts        CLI entry point
  config.ts         Environment config loader
  contract.ts       ethers.js contract factory
  oracle.ts         CoinGecko price oracle
  policy.ts         Auto-accept policy engine
  supabase.ts       Supabase client + CRUD + Realtime (offers + quotes)
  tokens.ts         Token symbol <-> address mapping
  types/            TypeScript type definitions
scripts/            Hardhat deploy scripts
supabase/           Database schema
test/               Contract tests
```

## License

ISC
