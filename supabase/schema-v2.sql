-- zero-otc v2 schema: CREATE2 escrow + reputation system
-- Run this in Supabase SQL Editor

-- ============================================================
-- offers_v2 table (replaces offers for new CREATE2 flow)
-- ============================================================
create table if not exists offers_v2 (
  id bigserial primary key,
  seller text not null,
  buyer text,
  sell_token text not null,
  sell_amount text not null,
  buy_token text not null,
  buy_amount text not null,
  chain text not null default 'base-sepolia',
  status text not null default 'open',
  escrow_address text not null,
  nonce bigint not null,
  deadline timestamptz not null,
  min_score integer not null default 0,
  tx_hash text,
  created_at timestamptz default now()
);

-- status values: open, matched, deployed, settled, cancelled, expired

create index if not exists idx_offers_v2_open
  on offers_v2 (chain, status)
  where status = 'open';

create index if not exists idx_offers_v2_seller on offers_v2 (seller);
create index if not exists idx_offers_v2_buyer on offers_v2 (buyer);
create index if not exists idx_offers_v2_status on offers_v2 (status);
create index if not exists idx_offers_v2_escrow on offers_v2 (escrow_address);

-- ============================================================
-- reputation table
-- ============================================================
create table if not exists reputation (
  wallet text primary key,
  successful_swaps integer not null default 0,
  failed_swaps integer not null default 0,
  cancellations integer not null default 0,
  score integer not null default 0,
  updated_at timestamptz default now()
);

create index if not exists idx_reputation_score on reputation (score desc);

-- ============================================================
-- Row Level Security
-- ============================================================

-- offers_v2: read-only for public, write via service_role only
alter table offers_v2 enable row level security;

create policy "Public can read offers_v2"
  on offers_v2 for select
  using (true);

-- No insert/update/delete policy for anon = service_role only writes

-- reputation: read-only for public, write via service_role only
alter table reputation enable row level security;

create policy "Public can read reputation"
  on reputation for select
  using (true);

-- No insert/update/delete policy for anon = service_role only writes
