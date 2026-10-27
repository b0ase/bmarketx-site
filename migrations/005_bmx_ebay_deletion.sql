-- eBay account deletion: the eBay user id (from Sign in with eBay, later) and a record of each notice, with no
-- personal data, so we can show we acted on it.
alter table bmx_stores add column if not exists ebay_user_id text unique;

create table if not exists bmx_ebay_deletions (
  notification_id text primary key,
  verified        boolean not null,
  stores_cleared  integer not null default 0,
  received_at     timestamptz not null default now()
);
alter table bmx_ebay_deletions enable row level security;
