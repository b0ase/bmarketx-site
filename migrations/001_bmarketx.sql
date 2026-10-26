-- bMarketX: stores and listings. Server-side only (service key); closed to anon.
create table if not exists bmx_stores (
  handle          text primary key check (handle ~ '^[a-z0-9._-]{2,64}$'),
  owner_key       text not null,                 -- bWalletX identity key (BRC-100); the account
  display_name    text not null,
  tagline         text,
  logo            text,
  ebay_name       text unique,                   -- set once the eBay store is proved
  ebay_feedback   text, ebay_sold text, ebay_followers text,
  verify_code     text,                          -- put in the eBay store description to prove it
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists bmx_stores_owner on bmx_stores (owner_key);

create table if not exists bmx_listings (
  id              bigserial primary key,
  store_handle    text not null references bmx_stores (handle) on delete cascade,
  title           text not null check (length(title) between 1 and 80),
  price_cents     integer not null check (price_cents > 0),
  was_cents       integer,
  promo           text,
  condition       text,
  category        text,
  description     text,
  images          jsonb not null default '[]',
  quantity        integer not null default 1 check (quantity >= 0),
  ebay_id         text,
  status          text not null default 'active' check (status in ('draft','active','sold','ended')),
  created_at      timestamptz not null default now(),
  unique (store_handle, ebay_id)
);
create index if not exists bmx_listings_store on bmx_listings (store_handle, status, created_at desc);
create index if not exists bmx_listings_search on bmx_listings using gin (to_tsvector('simple', title));

alter table bmx_stores enable row level security;
alter table bmx_listings enable row level security;
