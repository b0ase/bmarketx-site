-- bMarketX: site feedback from the "Give feedback" pop-up. Server-side only (service key); closed to anon.
create table if not exists bmx_feedback (
  id           bigserial primary key,
  page         text not null check (length(page) <= 120),
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (length(comment) <= 500),
  contact      text check (length(contact) <= 100),
  identity_key text,                      -- only if the person ticked "include my wallet"
  created_at   timestamptz not null default now()
);
create index if not exists bmx_feedback_created on bmx_feedback (created_at desc);
alter table bmx_feedback enable row level security;
