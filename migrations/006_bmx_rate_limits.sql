-- Rate limits: a fixed-window counter per (action, wallet or IP). One call counts and answers in one step.
create table if not exists bmx_hits (
  key         text not null,
  window_at   timestamptz not null,
  n           integer not null default 0,
  primary key (key, window_at)
);
alter table bmx_hits enable row level security;

create or replace function bmx_hit(p_key text, p_limit integer, p_secs integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_secs) * p_secs); c integer;
begin
  insert into bmx_hits (key, window_at, n) values (p_key, w, 1)
    on conflict (key, window_at) do update set n = bmx_hits.n + 1 returning n into c;
  if random() < 0.01 then delete from bmx_hits where window_at < now() - interval '1 day'; end if;
  return c <= p_limit;
end $$;
revoke all on function bmx_hit(text, integer, integer) from public, anon, authenticated;
