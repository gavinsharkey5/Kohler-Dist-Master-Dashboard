-- Kohler Dist Hub: the account assistant's usage ledger and spend limits
-- (2026-09-30). api/chat.js writes one row per answered question with the
-- caller's own token (the trigger stamps who asked from the JWT, never from
-- the page) and calls kdh_assistant_quota() before every call to enforce a
-- per-person daily request limit and an everyone-together daily spend limit
-- (the limits themselves are Vercel env vars KDH_CHAT_USER_DAILY and
-- KDH_CHAT_DAILY_USD; this table is the count they are checked against).
--
-- est_usd is the function's estimate from Anthropic's list prices at the
-- time of the call (tokens x price table in api/chat.js); the console's
-- Usage page is the bill. No account names, no question text, no answers
-- are stored -- only the customer number, the rep, the mode, the model and
-- the token counts.
--
-- Safe to run more than once.

create table if not exists public.assistant_usage (
  id                 bigint generated always as identity primary key,
  user_email         text not null,            -- stamped from auth.jwt() by the trigger
  user_name          text,                     -- stamped from allowed_users by the trigger
  account_num        text,
  rep_name           text,
  mode               text,                     -- ask | pitch | feedback
  model              text,                     -- the model that served the answer
  requested_model    text,                     -- what the function asked for (differs after a fallback)
  input_tokens       integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens  integer not null default 0,
  output_tokens      integer not null default 0,
  rounds             integer not null default 1,   -- tool rounds
  ms                 integer,                  -- wall time of the whole answer
  stop               text,                     -- end_turn | tool_use | max_tokens | refusal | error
  tools              text,                     -- comma-separated tool names used
  est_usd            numeric(10,6) not null default 0,
  created_at         timestamptz not null default now()
);

comment on table public.assistant_usage is
  'Account assistant (/api/chat) ledger: one row per answer, tokens + estimated USD; who asked comes from the token.';

create index if not exists assistant_usage_user_day on public.assistant_usage (user_email, created_at desc);
create index if not exists assistant_usage_day on public.assistant_usage (created_at desc);

-- kdh_caller_email() and kdh_is_manager() exist from 20260925180000_rep_actions.sql.
create or replace function public.assistant_usage_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_email := public.kdh_caller_email();
  new.user_name  := (select name from public.allowed_users where email = new.user_email);
  new.created_at := now();
  return new;
end $$;

drop trigger if exists assistant_usage_stamp on public.assistant_usage;
create trigger assistant_usage_stamp
  before insert on public.assistant_usage
  for each row execute function public.assistant_usage_stamp();

alter table public.assistant_usage enable row level security;

-- Anyone signed in may add their own row (the trigger decides whose it is);
-- a person reads their own rows, a manager reads everyone's; nobody edits.
drop policy if exists "insert own" on public.assistant_usage;
create policy "insert own" on public.assistant_usage
  for insert to authenticated
  with check (true);

drop policy if exists "read own or manager" on public.assistant_usage;
create policy "read own or manager" on public.assistant_usage
  for select to authenticated
  using (user_email = public.kdh_caller_email() or public.kdh_is_manager());

revoke update, delete on public.assistant_usage from authenticated, anon;

-- What the function checks before each call: the caller's requests today
-- and everyone's estimated spend today (UTC days). SECURITY DEFINER so the
-- everyone-total is not cut down by the read policy.
create or replace function public.kdh_assistant_quota()
returns table (user_requests_today integer, user_usd_today numeric, all_requests_today integer, all_usd_today numeric)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::integer from public.assistant_usage
       where user_email = public.kdh_caller_email() and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
    (select coalesce(sum(est_usd), 0) from public.assistant_usage
       where user_email = public.kdh_caller_email() and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
    (select count(*)::integer from public.assistant_usage
       where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
    (select coalesce(sum(est_usd), 0) from public.assistant_usage
       where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc');
$$;

revoke all on function public.kdh_assistant_quota() from public;
grant execute on function public.kdh_assistant_quota() to authenticated;

-- Gavin's view of the spend (managers only through RLS): per day and per model.
-- select date_trunc('day', created_at) d, model, count(*) answers, sum(est_usd) usd,
--        avg(ms) avg_ms, sum(input_tokens) input, sum(cache_read_tokens) cache_read,
--        sum(cache_write_tokens) cache_write, sum(output_tokens) output
--   from public.assistant_usage group by 1, 2 order by 1 desc, 2;
