-- Kohler Dist Hub: passwords without a code (2026-09-29).
--
-- Gavin's decision: the FIRST sign-in creates the password directly --
-- no emailed code -- and every sign-in after that is email + password.
-- The emailed code is kept only for "Forgot password" and for the few
-- accounts created before passwords existed (they have a Supabase user
-- but no password, so they verify by code once and then set one).
--
-- Two pieces:
--   1. kdh_signin_mode(email) now answers one of FOUR things about the
--      address the sign-in page was given:
--        no        not on the allow list
--        new       listed, never signed in -> "Create your password"
--        code      listed, has a Supabase user but no password (signed
--                  in by code before 2026-09-29) -> code once, then set one
--        password  listed, has a password -> "Welcome back"
--   2. A trigger on auth.users so that ONLY allow-listed emails can be
--      registered, whatever calls the sign-up API. The page checks the
--      list first; this is the lock on the door itself.
--
-- Supabase setting that must match (Authentication -> Sign In / Providers
-- -> Email): "Confirm email" OFF. With it on, sign-up sends a confirmation
-- email instead of signing the person in, which is the wait this removes.
--
-- Safe to run more than once. Replaces the 2026-09-28 kdh_signin_mode.

create or replace function public.kdh_signin_mode(p_email text)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.allowed_users
      where email = lower(trim(coalesce(p_email, '')))
    ) then 'no'
    when not exists (
      select 1 from auth.users u
      where lower(u.email) = lower(trim(coalesce(p_email, '')))
    ) then 'new'
    when exists (
      select 1 from auth.users u
      where lower(u.email) = lower(trim(coalesce(p_email, '')))
        and coalesce(u.encrypted_password, '') <> ''
    ) then 'password'
    else 'code'
  end;
$$;

comment on function public.kdh_signin_mode(text) is
  'Sign-in page: no (not listed) / new (listed, no account yet: create a password) / code (account without a password: code once) / password (has one).';

revoke all on function public.kdh_signin_mode(text) from public;
grant execute on function public.kdh_signin_mode(text) to anon, authenticated;

-- Only allow-listed emails may become Supabase users. Also applies to
-- Authentication -> Users -> "Add user" in the dashboard: add the person
-- to allowed_users first.
create or replace function public.kdh_only_allowed_signups()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_users
    where email = lower(trim(coalesce(new.email, '')))
  ) then
    raise exception 'This email is not on the Kohler Dist Hub access list'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists kdh_only_allowed_signups on auth.users;
create trigger kdh_only_allowed_signups
  before insert on auth.users
  for each row execute function public.kdh_only_allowed_signups();
