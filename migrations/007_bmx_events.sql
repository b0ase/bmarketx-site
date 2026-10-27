-- Visit and conversion counts (see /privacy): what happened, when, and the campaign that brought the visit.
-- No IP address, wallet key, name or address is stored.
create table if not exists bmx_events (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  event     text not null check (event in ('visit','wallet_connected','store_opened','listings_imported','checkout_started','purchase','promote_paid')),
  campaign  text check (length(campaign) <= 80),   -- utm_campaign, or ref:<handle>
  source    text check (length(source) <= 80),     -- utm_source, else the referring site's host
  medium    text check (length(medium) <= 40),
  page      text check (length(page) <= 120),
  n         integer check (n between 0 and 100000),     -- listings imported
  cents     integer check (cents between 0 and 100000000) -- order value
);
create index if not exists bmx_events_at on bmx_events (at desc);
create index if not exists bmx_events_campaign on bmx_events (campaign, event);
alter table bmx_events enable row level security;
