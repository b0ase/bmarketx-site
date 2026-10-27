-- bMarketX checkout: buyers pay the seller's wallet directly (BRC-29), no bMarketX fee.
-- Postage: a store default, overridden per listing. null on a listing = use the store's.
alter table bmx_stores   add column if not exists ship_cents integer not null default 0 check (ship_cents between 0 and 100000);
alter table bmx_listings add column if not exists ship_cents integer check (ship_cents between 0 and 100000);

create table if not exists bmx_orders (
  id                bigserial primary key,
  listing_id        bigint not null references bmx_listings (id) on delete restrict,
  store_handle      text not null,
  title             text not null,                  -- as bought, so the receipt survives edits
  buyer_key         text not null,                  -- bWalletX identity keys
  seller_key        text not null,
  qty               integer not null check (qty between 1 and 100),
  price_cents       integer not null,
  ship_cents        integer not null,
  total_cents       integer not null,
  usd_per_bsv       numeric not null,
  sats              bigint not null check (sats > 0),
  derivation_prefix text not null,                  -- BRC-29, counterparty "anyone": the server can check the address,
  derivation_suffix text not null,                  -- the seller's wallet can spend it
  locking_script    text not null,
  ship_to           jsonb not null,                 -- seen by the buyer and the seller only
  status            text not null default 'quoted' check (status in ('quoted','paid','shipped','received','cancelled')),
  oversold          boolean not null default false,
  txid              text unique,
  vout              integer,
  beef              text,                           -- hex AtomicBEEF, for the seller's wallet to take the payment in
  tracking          text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '20 minutes',
  paid_at           timestamptz, collected_at timestamptz, shipped_at timestamptz, received_at timestamptz
);
create index if not exists bmx_orders_buyer  on bmx_orders (buyer_key, created_at desc);
create index if not exists bmx_orders_seller on bmx_orders (seller_key, created_at desc);
alter table bmx_orders enable row level security;

-- Record a checked payment and take the stock in one step. A second call for the same order changes nothing.
create or replace function bmx_order_paid(p_order bigint, p_txid text, p_vout integer, p_beef text) returns text
language plpgsql security definer set search_path = public as $$
declare o bmx_orders; left_qty integer;
begin
  select * into o from bmx_orders where id = p_order for update;
  if not found then return 'missing'; end if;
  if o.status <> 'quoted' then return case when o.txid = p_txid then 'ok' else 'done' end; end if;
  update bmx_listings set quantity = quantity - o.qty where id = o.listing_id and quantity >= o.qty returning quantity into left_qty;
  if left_qty = 0 then update bmx_listings set status = 'sold' where id = o.listing_id; end if;
  update bmx_orders set status = 'paid', txid = p_txid, vout = p_vout, beef = p_beef, paid_at = now(), oversold = (left_qty is null)
   where id = p_order;
  return 'ok';
end $$;
revoke all on function bmx_order_paid(bigint, text, integer, text) from public, anon, authenticated;
