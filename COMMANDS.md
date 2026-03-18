# zero-otc CLI Commands (v2)

> All commands interact with the API server. No direct Supabase calls from the CLI.

## Swap Flow

### propose

Create a new OTC swap offer. Computes a CREATE2 escrow address and transfers sell tokens to it.

```bash
npx ts-node src/cli/index.ts propose \
  --sell "1000 tUSDC" \
  --buy "0.5 tWETH" \
  --duration 3600 \
  --min-score 5 \
  --wallet test1
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--sell <amount_token>` | Yes | - | Amount and token to sell (e.g. `"1000 USDC"`) |
| `--buy <amount_token>` | Yes | - | Amount and token to buy (e.g. `"0.5 WETH"`) |
| `--chain <chain>` | No | `base-sepolia` | Target chain |
| `--duration <seconds>` | No | `3600` | Offer duration in seconds (max 30 days) |
| `--min-score <score>` | No | `0` | Minimum buyer reputation score to accept |
| `--wallet <name>` | No | - | Wallet name (loads `PRIVATE_KEY_<NAME>` from .env) |

### accept

Accept an open offer. The API deploys the escrow contract, then you transfer buy tokens to it. Settlement happens automatically via the operator.

```bash
npx ts-node src/cli/index.ts accept 42 --wallet test2
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<offer-id>` | Yes | - | Offer ID |
| `--wallet <name>` | No | - | Wallet name |

### cancel

Cancel an offer. Free if still open; reputation penalty (-2) if already matched.

```bash
npx ts-node src/cli/index.ts cancel 42 --wallet test1
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<offer-id>` | Yes | - | Offer ID |
| `--wallet <name>` | No | - | Wallet name |

## Discovery

### list

View open OTC offers with seller reputation scores.

```bash
npx ts-node src/cli/index.ts list
npx ts-node src/cli/index.ts list --chain base-sepolia
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--chain <chain>` | No | `base-sepolia` | Filter by chain |

### history

View settled/cancelled/expired trade history for a wallet.

```bash
npx ts-node src/cli/index.ts history --wallet test1
npx ts-node src/cli/index.ts history --wallet test1 --limit 50
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--limit <n>` | No | `20` | Number of records to show |
| `--wallet <name>` | No | - | Wallet name |

### watch

Poll for new offers via the API server.

```bash
npx ts-node src/cli/index.ts watch
npx ts-node src/cli/index.ts watch --chain base-sepolia
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--chain <chain>` | No | `base-sepolia` | Filter by chain |

## RFQ Flow

### rfq

Broadcast a Request for Quote — "I need X, budget Y".

```bash
npx ts-node src/cli/index.ts rfq \
  --need "1 tWETH" \
  --budget "2200 tUSDC" \
  --duration 1800 \
  --min-score 3 \
  --wallet test1
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--need <amount_token>` | Yes | - | Token and amount needed (e.g. `"1 WETH"`) |
| `--budget <amount_token>` | Yes | - | Max willing to pay (e.g. `"2200 USDC"`) |
| `--chain <chain>` | No | `base-sepolia` | Target chain |
| `--duration <seconds>` | No | `3600` | RFQ duration in seconds |
| `--min-score <score>` | No | `0` | Minimum quoter reputation score |
| `--wallet <name>` | No | - | Wallet name |

### quote

Submit a quote for an open RFQ.

```bash
npx ts-node src/cli/index.ts quote 7 --offer "0.5 tWETH" --wallet test2
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<rfq-id>` | Yes | - | RFQ ID |
| `--offer <amount_token>` | Yes | - | What you're offering (e.g. `"1 WETH"`) |
| `--chain <chain>` | No | `base-sepolia` | Target chain |
| `--wallet <name>` | No | - | Wallet name |

### quotes

List all quotes for an RFQ with quoter reputation scores.

```bash
npx ts-node src/cli/index.ts quotes 7
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<rfq-id>` | Yes | - | RFQ ID |

### pick

Pick a quote from an RFQ. Deploys escrow and transfers your tokens to it. Settlement is automatic.

```bash
npx ts-node src/cli/index.ts pick 7 3 --wallet test1
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<rfq-id>` | Yes | - | RFQ ID |
| `<quote-id>` | Yes | - | Quote ID to accept |
| `--wallet <name>` | No | - | Wallet name |

## Reputation

### trust

Check reputation score for any wallet address.

```bash
npx ts-node src/cli/index.ts trust 0x1234...abcd
```

Output includes: score, successful swaps, failed swaps, cancellations.

## Common Options

| Option | Description |
|--------|-------------|
| `--wallet <name>` | Multi-wallet support. Loads `PRIVATE_KEY_<NAME>` from `.env`. Example: `--wallet test1` loads `PRIVATE_KEY_TEST1`. |

## Environment Variables

```bash
# Required (CLI)
PRIVATE_KEY_<NAME>=...     # Wallet private keys (e.g. PRIVATE_KEY_TEST1)

# Optional (CLI)
API_URL=http://localhost:3000  # API server URL (default: http://localhost:3000)
RPC_URL=https://sepolia.base.org  # RPC endpoint (default: Base Sepolia)

# Required (Server)
OPERATOR_PRIVATE_KEY=...       # Operator EOA private key (deploys + settles)
FACTORY_ADDRESS=0x...          # Deployed EscrowFactory address
SUPABASE_URL=https://...       # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=...  # Supabase service_role key (write access)
RPC_URL=https://sepolia.base.org
```

## Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| EscrowFactory v2 | `0x1354252a5B16899e7D1450a8Fc84eF5c04393BA4` |
| EscrowFactory v1 (deprecated) | `0x4Eb5F9B97DaCBECE9c870Da94cfF4a883E702527` |
| tUSDC | `0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2` |
| tWETH | `0x4322cB832Ab806cC123540428125a92180725a23` |

## Contract Architecture

- **TradeEscrow** constructor: seller, buyer, sellToken, buyToken, feeBps, feeRecipient, operator, deadline (no amounts)
- **`settle(sellAmt, buyAmt)`**: operator passes amounts from DB; contract checks `balance >= amount`
- **`rescueToken(token)`**: unrestricted — sellToken→seller, buyToken→buyer, unknown→caller. Blocked after settle/refund/cancel.
- Offers with `escrow balance < sellAmount` are hidden from `GET /offers`

## Protocol Fee

- 0.1% (10 bps) from both sides on settlement
- Minimum $0.50 per side
- Owner can adjust via `setFeeBps()` (max 1%) and `setFeeRecipient()`

## Reputation Scoring

| Event | Score Delta |
|-------|------------|
| Successful swap | +1 (both sides) |
| Buyer timeout (no deposit) | -3 (buyer) |
| Post-match cancellation | -2 (canceller) |

Formula: `score = successful_swaps - (failed_swaps × 3) - (cancellations × 2)`
