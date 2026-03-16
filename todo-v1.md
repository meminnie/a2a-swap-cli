# zero-otc: AI Agent-to-Agent OTC Swap CLI

## Overview

CLI tool for AI agent P2P OTC swaps on Base chain, gated by ERC-8004 reputation scores.
No DEX routing — no slippage, no MEV. Agents call it programmatically, humans use it directly.

## Stack

- **Contracts**: Hardhat + Solidity (shared TypeScript toolchain with CLI)
- **CLI**: Node.js / TypeScript (Commander.js)
- **Discovery**: Supabase (offers DB + realtime subscriptions)
- **Settlement**: On-chain Escrow contract
- **Chain**: Base (testnet first, then mainnet)

## Architecture Decision

- Use an `actionType` field in the offer schema from day one. MVP only implements `swap`, but the data model supports future primitives (rfq, lend, hedge, bridge) without rewriting.
- **Hybrid architecture**: Escrow contract handles settlement (돈), Supabase handles discovery (오퍼 조회/실시간 알림). Framework-agnostic — 어떤 agent framework이든 HTTP/SDK로 연결 가능.

```
zero-otc propose --action swap  --sell "1000 USDC" --buy "0.5 ETH"
zero-otc propose --action rfq   --need "0.5 ETH" --budget "1000 USDC"       # later
zero-otc propose --action lend  --offer "5000 USDC" --rate 0.05 --duration 7d  # later
```

## Phase 1: MVP (Base chain, same-chain, escrow, swap only)

### 1. Smart Contracts
- [x] Escrow contract — both parties deposit tokens, swap executes on mutual deposit
- [x] Proposer deposits on propose (token lock at offer creation)
- [x] Cancel refunds deposited tokens automatically
- [x] Deploy to Base Sepolia testnet (Escrow: `0x969dD18434a46948CdE50D50fA71bBE286Fa036E`)
- [x] Mock ERC20 tokens deployed (tUSDC: `0xc210208ee5Ad77FFa7E0eB0690f74a2E269d42b2`, tWETH: `0x4322cB832Ab806cC123540428125a92180725a23`)
- [ ] ERC-8004 trust score integration — on-chain reputation check
- [ ] Trust gating — minimum score threshold to participate in trades

### 2. Core CLI Commands
- [x] `zero-otc propose` — creates on-chain offer + locks tokens + inserts to Supabase
- [x] `zero-otc accept` — accepts offer + approves tokens + deposits into escrow + auto-settles
- [x] `zero-otc deposit` — manual deposit for either party (standalone command)
- [x] `zero-otc list` — queries open offers from Supabase, table output
- [x] `zero-otc history` — queries settled/cancelled trades by signer address
- [x] `zero-otc trust` — checks ERC-8004 trust score (placeholder if registry not configured)
- [x] `zero-otc watch` — realtime offer monitoring via Supabase Realtime
- [x] `zero-otc auto-accept` — automated offer evaluation + accept via oracle price policy
- [x] `--wallet <name>` option — multi-wallet support (loads `PRIVATE_KEY_<NAME>` from .env)

### 3. Infrastructure Modules
- [x] `src/contract.ts` — ethers provider/signer/escrow/erc20 contract factory (shared signer support)
- [x] `src/supabase.ts` — Supabase client + CRUD (insert, update, fetchOpen, fetchHistory, subscribeOffers)
- [x] `src/tokens.ts` — token symbol ↔ address mapping (Base Sepolia + Mainnet: USDC, WETH, DAI, tUSDC, tWETH)
- [x] `src/config.ts` — env config with multi-wallet + trustRegistryAddress support
- [x] `src/oracle.ts` — CoinGecko price oracle (token price + pair rate)
- [x] `src/policy.ts` — auto-accept policy engine (USD value comparison + slippage threshold)
- [x] `supabase/schema.sql` — offers table DDL + indexes + RLS policies
- [x] `scripts/deploy.ts` — Hardhat deploy script
- [x] `scripts/deploy-mocks.ts` — Mock token deploy + mint script
- [x] `scripts/mint-to.ts` — Mint test tokens to arbitrary address

### 4. Discovery Layer (Supabase)
- [x] `offers` table schema designed (supabase/schema.sql)
- [x] Supabase client module (`src/supabase.ts`)
- [x] Insert offer on propose (mirror on-chain data)
- [x] Update offer status on accept/settle
- [x] Realtime subscription for new offers (`watch` command + `subscribeOffers` SDK)

### 5. Remaining for Phase 1
- [x] Create Supabase project + run schema.sql
- [x] Deploy Escrow to Base Sepolia
- [x] End-to-end testnet test (propose → accept → settle) ✅ Verified on-chain: Offer #3 settled
- [x] Auto-accept policy engine with CoinGecko oracle ✅ Verified: correct REJECT on bad deals, ACCEPT on fair deals
- [ ] ERC-8004 trust score contract integration (deferred — mock registry on testnet, real on mainnet)
- [ ] Trust gating on acceptOffer

### 6. Agent Automation
- [x] Auto-accept policy engine (oracle price threshold)
- [x] `auto-accept` command with `--max-slippage`, `--dry-run`, `--wallet` options
- [ ] Trust score integration in policy (when ERC-8004 registry is ready)
- [x] Multi-token policy rules — per-pair slippage config via `--policy-file` JSON + `resolveSlippage()`

## Phase 2: Hardening + RFQ

### Counterparty Griefing Mitigation
- [x] Offer deposit / bonding mechanism to prevent no-show attacks (proposer locks tokens on propose)
- [x] Timeout and auto-refund for stale offers (`refund` command + contract handles Open & Accepted status)
- [ ] Reputation penalty for failed settlements

### Settlement Robustness
- [x] Handle partial failures — deposit window (15min) + `claimDepositTimeout()` prevents fund locking
- [ ] Two-phase commit or HTLC option for trustless settlement
- [x] Gas optimization — struct packing (8→6 storage slots, ~25% gas savings), `uint48` deadline, gasLimit overrides

### RFQ Primitive
- [x] `zero-otc rfq` — broadcast "I need X, budget Y", get competing quotes
- [x] `zero-otc quote <rfq-id> --offer "amount token"` — submit quote for an RFQ
- [x] `zero-otc pick <rfq-id> <quote-id>` — pick best quote, create on-chain escrow
- [x] Quote auto-accept — quoter auto-accepts escrow when their quote is picked (via Supabase Realtime)
- [x] Supabase `quotes` table + realtime subscriptions
- [x] End-to-end verified: RFQ → Quote → Pick → Auto-settle ✅

### Security
- [ ] Smart contract audit
- [x] Input validation on all CLI parameters (amount > 0, duration > 0 and <= 30 days, valid action type)
- [x] Contract-level validation (zero amounts, same token, duration limits — custom errors)
- [x] No hardcoded secrets — env-based config (done: src/config.ts)

## Phase 3: Distribution & Growth

### Agent Ecosystem Integration
- [x] SDK / API wrapper for programmatic access (`src/sdk/` — ZeroOTC client class)
- [x] Agent framework integrations — Eliza plugin (`src/integrations/eliza/`) + Virtuals GAME worker (`src/integrations/virtuals/`)
- [ ] Agent tool registry listing
- [ ] Agent marketplace discovery

### Liquidity Cold Start
- [ ] Seed initial liquidity with known agents
- [ ] Incentive mechanism for early market makers

### Future Primitives
- [ ] `--action lend` — short-term lending between agents
- [ ] `--action hedge` — OTC options/forwards
- [ ] `--action bridge` — cross-chain liquidity requests (HTLC atomic swaps)

## Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Liquidity cold start | High | Seed liquidity, RFQ mode, incentives |
| Agent distribution / discovery | High | SDK, tool registries, agent marketplaces |
| Counterparty griefing | Medium | Bonding, escrow deposits, reputation penalties |
| Settlement fund locking | Medium | Timeouts, two-phase commit, HTLC |
| Competition (AirSwap, 0x, CoW) | Medium | Differentiate via ERC-8004 trust + agent-native UX |
| Regulatory (broker/exchange classification) | Low-Medium | Legal review at scale |

## Competitive Edge

- ERC-8004 on-chain reputation = trust layer competitors lack
- Agent-native interface (CLI/SDK) vs human-oriented UIs
- P2P = zero slippage, zero MEV for large trades

## Long-term Vision

Reposition from "OTC swap CLI" → **AI agent liquidity routing layer / agent execution network** where OTC is one primitive among many (swap, lend, bridge, hedge).
