-- Supabase schema for zero-otc offers table
-- Run this in Supabase SQL Editor to set up the database

create table if not exists offers (
  id bigint primary key,
  action_type text not null default 'swap',
  proposer text not null,
  acceptor text,
  sell_token text not null,
  sell_amount text not null,
  buy_token text not null,
  buy_amount text not null,
  chain text not null default 'base-sepolia',
  status text not null default 'open',
  deadline bigint not null,
  tx_hash text,
  created_at timestamptz default now()
);

-- Index for querying open offers by chain and action type
create index if not exists idx_offers_open
  on offers (chain, action_type, status)
  where status = 'open';

-- Index for querying history by participant address
create index if not exists idx_offers_proposer on offers (proposer);
create index if not exists idx_offers_acceptor on offers (acceptor);

-- Enable Row Level Security (configure policies as needed)
alter table offers enable row level security;

-- Allow anonymous reads for listing offers
create policy "Anyone can read offers"
  on offers for select
  using (true);

-- Allow anonymous inserts (CLI authenticated via Supabase anon key)
create policy "Anyone can insert offers"
  on offers for insert
  with check (true);

-- Allow anonymous updates (for status changes)
create policy "Anyone can update offers"
  on offers for update
  using (true);
