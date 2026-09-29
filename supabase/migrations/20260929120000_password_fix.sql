-- Kohler Dist Hub: passwords, fix for accounts made by code (2026-09-29).
--
-- What went wrong: an account that only ever signed in by emailed code
-- still has something in auth.users.encrypted_password -- Supabase stores
-- a bcrypt hash of the EMPTY password -- so kdh_signin_mode() said
-- 'password' and the page showed "Welcome back" to someone who had never
-- created one (Gavin, 2026-09-29).
--
-- Fix: kdh_real_password(hash) is true only for a hash that is NOT of the
-- empty string (pgcrypto's crypt() re-hashes '' with the stored salt and
-- compares). kdh_signin_mode() uses it, so such an account answers 'code':
-- the page sends the code ONE more time and then shows "Create your
-- password". A brand-new address (no account at all) answers 'new' and
-- goes straight to "Create your password", no code.
--
-- To skip even that one code for an existing account, remove the account
-- in the dashboard (Authentication -> Users -> the person -> Delete user):
-- its owner then signs in as 'new'. Such an account holds nothing but old
-- sessions -- the allow list (allowed_users) and the hub write-back
-- (rep_actions, keyed by email) are separate tables and keep everything.
--
-- Safe to run more than once.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.kdh_real_password(p_hash text)
returns boolean
language sql immutable
set search_path = public
as $$
  select case
    when coalesce(p_hash, '') = '' then false
    when left(p_hash, 2) = '$2' then p_hash <> extensions.crypt('', p_hash)   -- bcrypt: is it the empty password?
    else true                                                                 -- another scheme: trust it
  end;
$$;
revoke all on function public.kdh_real_password(text) from public;

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
        and public.kdh_real_password(u.encrypted_password)
    ) then 'password'
    else 'code'
  end;
$$;

comment on function public.kdh_signin_mode(text) is
  'Sign-in page: no (not listed) / new (listed, no account yet: create a password) / code (account without a real password: code once) / password (has one).';

revoke all on function public.kdh_signin_mode(text) from public;
grant execute on function public.kdh_signin_mode(text) to anon, authenticated;
