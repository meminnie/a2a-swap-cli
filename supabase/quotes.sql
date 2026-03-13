-- Supabase schema for zero-otc RFQ quotes table
-- Run this in Supabase SQL Editor after schema.sql

create table if not exists quotes (
  id bigserial primary key,
  rfq_id bigint not null references offers(id),
  quoter text not null,
  sell_token text not null,
  sell_amount text not null,
  buy_token text not null,
  buy_amount text not null,
  chain text not null default 'base-sepolia',
  status text not null default 'pending',
  created_at timestamptz default now()
);

-- Index for querying quotes by RFQ
create index if not exists idx_quotes_rfq on quotes (rfq_id, status);

-- Index for querying quotes by quoter
create index if not exists idx_quotes_quoter on quotes (quoter);

-- Enable RLS
alter table quotes enable row level security;

create policy "Anyone can read quotes"
  on quotes for select using (true);

create policy "Anyone can insert quotes"
  on quotes for insert with check (true);

create policy "Anyone can update quotes"
  on quotes for update using (true);

-- Enable realtime for quotes
alter publication supabase_realtime add table quotes;
