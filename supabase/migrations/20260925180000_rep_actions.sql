-- Kohler Dist Hub: what a rep did with each account on their hub target
-- lists (2026-09-25).
--
-- The hub's Rep Mode visit list gets three buttons per account: Done,
-- Follow up, Not now, plus an optional note. Each press upserts one row
-- here, scoped to the signed-in rep (rep_email comes from the token, not
-- the page). Done and Not now sink to the bottom of the list; Follow up
-- floats to the top. A manager (allowed_users.role = manager) reads every
-- rep's rows, so a DM opening a rep's programs sees the same marks.
--
-- Safe to run more than once.

create table if not exists public.rep_actions (
  id           bigint generated always as identity primary key,
  rep_email    text not null,             -- stamped from auth.jwt() by the trigger
  rep_name     text,                      -- stamped from allowed_users by the trigger
  program_id   text not null,             -- hub program id, e.g. "off:2026-09:carbliss" or an incentive key
  account_num  text not null,             -- Encompass customer number (hub row .n)
  account_name text,
  status       text not null check (status in ('done', 'follow', 'skip')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (rep_email, program_id, account_num)
);

comment on table public.rep_actions is
  'Hub write-back: per rep x program x account, done / follow (up) / skip (not now) + note.';

create index if not exists rep_actions_rep_prog on public.rep_actions (rep_email, program_id);
create index if not exists rep_actions_updated  on public.rep_actions (updated_at desc);

-- Who is calling, as the allow list knows them. SECURITY DEFINER so the
-- lookup is not blocked by allowed_users' own "read own row" policy.
create or replace function public.kdh_caller_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.kdh_is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
    where email = public.kdh_caller_email() and role = 'manager'
  );
$$;

-- Stamp identity from the token and the allow list; keep updated_at honest.
create or replace function public.rep_actions_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.rep_email  := public.kdh_caller_email();
  new.rep_name   := (select name from public.allowed_users where email = new.rep_email);
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  new.account_num := trim(new.account_num);
  new.note := nullif(trim(coalesce(new.note, '')), '');
  return new;
end $$;

drop trigger if exists rep_actions_stamp on public.rep_actions;
create trigger rep_actions_stamp
  before insert or update on public.rep_actions
  for each row execute function public.rep_actions_stamp();

alter table public.rep_actions enable row level security;

-- A rep sees and edits their own rows; a manager sees everyone's.
drop policy if exists "read own or manager" on public.rep_actions;
create policy "read own or manager" on public.rep_actions
  for select to authenticated
  using (rep_email = public.kdh_caller_email() or public.kdh_is_manager());

drop policy if exists "insert own" on public.rep_actions;
create policy "insert own" on public.rep_actions
  for insert to authenticated
  with check (true);   -- the trigger overwrites rep_email with the caller's

drop policy if exists "update own" on public.rep_actions;
create policy "update own" on public.rep_actions
  for update to authenticated
  using (rep_email = public.kdh_caller_email())
  with check (rep_email = public.kdh_caller_email());

drop policy if exists "delete own" on public.rep_actions;
create policy "delete own" on public.rep_actions
  for delete to authenticated
  using (rep_email = public.kdh_caller_email());

grant select, insert, update, delete on public.rep_actions to authenticated;

revoke all on function public.kdh_is_manager() from public;
grant execute on function public.kdh_is_manager() to authenticated;
grant execute on function public.kdh_caller_email() to authenticated;
