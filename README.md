# zero-otc

AI agent-to-agent OTC swap CLI on Base chain, gated by ERC-8004 reputation scores.

No DEX routing — no slippage, no MEV. Agents call it programmatically, humans use it directly.

## Stack

- **Contracts**: Solidity 0.8.24 + Hardhat + OpenZeppelin
- **CLI**: TypeScript + Commander.js
- **Discovery**: Supabase (offers DB + realtime subscriptions)
- **Settlement**: On-chain Escrow contract (atomic swap on mutual deposit)
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

Run the SQL in `supabase/schema.sql` in your Supabase SQL Editor to create the `offers` table.

### Run CLI

```bash
# Create an offer
npx ts-node src/cli/index.ts propose --sell "1000 USDC" --buy "0.5 WETH"

# List open offers
npx ts-node src/cli/index.ts list

# Accept an offer
npx ts-node src/cli/index.ts accept 0

# View trade history
npx ts-node src/cli/index.ts history

# Check trust score
npx ts-node src/cli/index.ts trust 0x1234...abcd
```

## Commands

| Command | Description |
|---------|-------------|
| `propose --sell <amount token> --buy <amount token>` | Create on-chain offer + broadcast to Supabase |
| `accept <offer-id>` | Accept offer, approve tokens, deposit into escrow |
| `list [--chain] [--action]` | Query open offers from Supabase |
| `history [--limit]` | View your settled/cancelled trades |
| `trust <address>` | Check ERC-8004 trust score |

## Architecture

```
CLI (Commander.js)
 ├── Escrow Contract (Base chain) — settlement
 └── Supabase — discovery (offer listing, history, realtime)
```

**Hybrid design**: Escrow contract handles money (settlement), Supabase handles data (offer discovery and status tracking). Any agent framework can integrate via CLI or direct SDK calls.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes | — | Wallet private key |
| `ESCROW_ADDRESS` | Yes | — | Deployed Escrow contract address |
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | — | Supabase anonymous key |
| `RPC_URL` | No | `https://sepolia.base.org` | RPC endpoint |
| `CHAIN` | No | `base-sepolia` | Target chain |
| `MIN_TRUST_SCORE` | No | `80` | Minimum ERC-8004 trust score |
| `TRUST_REGISTRY_ADDRESS` | No | — | ERC-8004 trust registry contract |

## Supported Tokens

**Base Sepolia**: USDC, WETH, DAI

You can also pass raw token addresses instead of symbols.

## Testing

```bash
npx hardhat test
```

## Project Structure

```
contracts/          Solidity contracts (Escrow, MockERC20)
src/
  cli/
    commands/       CLI command implementations
    index.ts        CLI entry point
  config.ts         Environment config loader
  contract.ts       ethers.js contract factory
  supabase.ts       Supabase client + CRUD
  tokens.ts         Token symbol ↔ address mapping
  types/            TypeScript type definitions
scripts/            Hardhat deploy scripts
supabase/           Database schema
test/               Contract tests
```

## License

ISC
