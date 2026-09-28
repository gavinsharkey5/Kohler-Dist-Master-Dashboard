-- Kohler Dist Hub: passwords (2026-09-28).
--
-- Sign-in used to be code-only: every visit meant waiting for an email.
-- Now the emailed code is for the FIRST sign-in (it proves the person owns
-- the Kohler address), after which they create a password and use that
-- every time. "Forgot password" falls back to the code and then asks for a
-- new password. Nothing here changes who may sign in: the allow list and
-- the middleware's check are untouched.
--
-- The sign-in page needs one thing the client cannot see: whether this
-- email has a password yet. Supabase keeps that in auth.users
-- (encrypted_password is empty for a person who has only ever used a
-- code), which the API roles cannot read, so this function answers on
-- their behalf. It reveals, for an address the caller already typed,
-- only: not listed / listed but no password yet / has a password.
--
-- Safe to run more than once.

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
    when exists (
      select 1 from auth.users u
      where lower(u.email) = lower(trim(coalesce(p_email, '')))
        and coalesce(u.encrypted_password, '') <> ''
    ) then 'password'
    else 'code'
  end;
$$;

comment on function public.kdh_signin_mode(text) is
  'Sign-in page: no (not on the allow list) / code (listed, no password yet: first sign-in) / password (listed, has a password).';

revoke all on function public.kdh_signin_mode(text) from public;
grant execute on function public.kdh_signin_mode(text) to anon, authenticated;
