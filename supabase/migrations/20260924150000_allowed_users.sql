-- Kohler Dist Hub: sign-in allow list.
--
-- Who may sign in to kohlerdisthub.com. Gavin edits this table in the
-- Supabase Table Editor (Table Editor -> allowed_users). A person who is
-- not in it cannot request a sign-in link and cannot get past the gate
-- even if they somehow have a session.
--
-- Safe to run more than once.

create table if not exists public.allowed_users (
  email      text primary key,
  name       text,
  phone      text,
  role       text not null default 'rep' check (role in ('rep', 'manager')),
  title      text,   -- Encompass role as exported (Sales, Sales Manager, ...)
  reports_to text,   -- Encompass "Manager 1"
  added_at   timestamptz not null default now()
);
alter table public.allowed_users add column if not exists title text;
alter table public.allowed_users add column if not exists reports_to text;

comment on table public.allowed_users is
  'Sign-in allow list for kohlerdisthub.com. role: rep or manager.';

-- Emails compare case-insensitively everywhere, so store them lower-case
-- and trimmed no matter how they are typed in. Same for role, so typing
-- "Manager" in the Table Editor works.
create or replace function public.allowed_users_normalize()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  new.role  := lower(trim(coalesce(new.role, 'rep')));
  return new;
end $$;

drop trigger if exists allowed_users_normalize on public.allowed_users;
create trigger allowed_users_normalize
  before insert or update on public.allowed_users
  for each row execute function public.allowed_users_normalize();

-- Row-level security: a signed-in user can read their own row and
-- nothing else. That single query is what the Vercel middleware runs to
-- decide whether to let a request through.
alter table public.allowed_users enable row level security;

drop policy if exists "read own row" on public.allowed_users;
create policy "read own row" on public.allowed_users
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- "Automatically expose new tables" is off on this project, so grant the
-- API role explicitly. Nothing is granted to anon.
grant select on public.allowed_users to authenticated;

-- The sign-in page calls this before sending a magic link, so people who
-- are not on the list get told immediately instead of getting an email
-- that leads nowhere. It reveals only yes/no for an email the caller
-- already typed.
create or replace function public.is_allowed(p_email text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(trim(coalesce(p_email, '')))
  );
$$;

revoke all on function public.is_allowed(text) from public;
grant execute on function public.is_allowed(text) to anon, authenticated;

-- First manager, so the list is never empty. Everyone else comes from
-- the Encompass users export via import_allowed_users.py.
insert into public.allowed_users (email, name, role, title) values
  ('g.sharkey@kohlerdist.com', 'Gavin Sharkey', 'manager', 'Sales Manager+')
on conflict (email) do nothing;
