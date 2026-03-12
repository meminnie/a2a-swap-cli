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
zero-otc propose --action swap  --sell 1000 USDC --buy 0.5 ETH
zero-otc propose --action rfq   --need 0.5 ETH --budget 1000 USDC       # later
zero-otc propose --action lend  --offer 5000 USDC --rate 0.05 --duration 7d  # later
```

## Phase 1: MVP (Base chain, same-chain, escrow, swap only)

### 1. Smart Contracts
- [x] Escrow contract — both parties deposit tokens, swap executes on mutual deposit
- [ ] ERC-8004 trust score integration — on-chain reputation check
- [ ] Trust gating — minimum score threshold to participate in trades
- [ ] Deploy to Base Sepolia testnet

### 2. Core CLI Commands
- [x] `zero-otc propose` — creates on-chain offer + inserts to Supabase
- [x] `zero-otc accept` — accepts offer + approves tokens + deposits into escrow + updates Supabase
- [x] `zero-otc list` — queries open offers from Supabase, table output
- [x] `zero-otc history` — queries settled/cancelled trades by signer address
- [x] `zero-otc trust` — checks ERC-8004 trust score (placeholder if registry not configured)

### 3. Infrastructure Modules
- [x] `src/contract.ts` — ethers provider/signer/escrow/erc20 contract factory
- [x] `src/supabase.ts` — Supabase client + CRUD (insert, update, fetchOpen, fetchHistory)
- [x] `src/tokens.ts` — token symbol ↔ address mapping (Base Sepolia + Mainnet: USDC, WETH, DAI)
- [x] `src/config.ts` — env config with trustRegistryAddress support
- [x] `supabase/schema.sql` — offers table DDL + indexes + RLS policies
- [x] `scripts/deploy.ts` — Hardhat deploy script

### 4. Discovery Layer (Supabase)
- [x] `offers` table schema designed (supabase/schema.sql)
- [x] Supabase client module (`src/supabase.ts`)
- [x] Insert offer on propose (mirror on-chain data)
- [x] Update offer status on accept/settle
- [ ] Realtime subscription for new offers (agent push notifications)

### 5. Remaining for Phase 1
- [ ] Create Supabase project + run schema.sql
- [ ] Deploy Escrow to Base Sepolia (`npx hardhat run scripts/deploy.ts --network baseSepolia`)
- [ ] End-to-end testnet test (propose → accept → settle)
- [ ] ERC-8004 trust score contract integration
- [ ] Trust gating on acceptOffer

### 6. Agent Automation
- [ ] Auto-accept policy engine (trust score + oracle price threshold)
- [ ] Example: `if trust_score > 80 && price <= oracle_price * 1.01 → accept`

## Phase 2: Hardening + RFQ

### Counterparty Griefing Mitigation
- [ ] Offer deposit / bonding mechanism to prevent no-show attacks
- [ ] Timeout and auto-refund for stale offers
- [ ] Reputation penalty for failed settlements

### Settlement Robustness
- [ ] Handle partial failures — fund locking prevention
- [ ] Two-phase commit or HTLC option for trustless settlement
- [ ] Gas optimization for escrow operations

### RFQ Primitive
- [ ] `--action rfq` — agents broadcast "I need X", get competing quotes
- [ ] Quote response and selection flow
- [ ] Helps solve liquidity cold start

### Security
- [ ] Smart contract audit
- [ ] Input validation on all CLI parameters
- [x] No hardcoded secrets — env-based config (done: src/config.ts)

## Phase 3: Distribution & Growth

### Agent Ecosystem Integration
- [ ] SDK / API wrapper for programmatic access (not CLI-only)
- [ ] Agent framework integrations (Eliza, LangChain, CrewAI 등 — framework-agnostic)
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
