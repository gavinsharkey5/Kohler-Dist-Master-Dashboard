-- Kohler Dist Hub: the server keeps each device's sign-in (2026-10-13).
--
-- WHY. Since 2026-10-02 a device's long-lived sign-in was Supabase's refresh
-- token in an HttpOnly cookie (kdh_rt). Supabase ROTATES that token every
-- time it is redeemed (about once an hour), so the browser had to receive
-- and store a new cookie on every renewal -- most of them on ordinary page
-- and data requests passing through the Vercel middleware. Whenever that
-- new cookie did not land (a dropped reply on cellular, a response whose
-- Set-Cookie the browser never applied, a preload) the phone kept sending
-- the OLD token; Supabase treats a used token sent again more than 10 s
-- later as theft and revokes the whole session, and the rep was back at the
-- password box. Reps reported "it makes me log in every time".
--
-- NOW. The browser holds ONE random secret (cookie kdh_sid) that never
-- changes. This table holds the Supabase refresh token and the latest
-- access token for that secret. Renewal happens here, server-side: the
-- rotated refresh token is written back to the row, never to the phone, so
-- a lost reply costs nothing -- the next request simply renews again from
-- the row. api/session.js and middleware.js are the only callers.
--
-- SECURITY. The table is reachable only through the functions below, each
-- keyed by sha256(secret): a caller who does not hold the cookie's secret
-- cannot find a row (256-bit secret; the hash is stored, so a read of the
-- table does not yield usable cookies). RLS is on with no policies, and
-- nothing on the table is granted to the API roles. The functions are
-- callable with the publishable key (role anon), the same way the sign-in
-- page calls is_allowed(). Deleting a row ends that device's sign-in.
--
-- Safe to run more than once. Nothing else depends on it: until it has
-- run, api/session.js falls back to the cookie-held refresh token.

create table if not exists public.kdh_sessions (
  sid_hash      text primary key,                 -- sha256 (hex) of the kdh_sid cookie secret
  email         text not null,
  refresh_token text not null,                    -- Supabase's current refresh token for this device
  access_token  text not null,                    -- the latest access token issued for it
  access_exp    timestamptz not null,             -- when that access token expires
  keep          boolean not null default true,    -- "Remember me on this device" (cookie life)
  created_at    timestamptz not null default now(),
  used_at       timestamptz not null default now(),
  claimed_at    timestamptz                       -- a renewal is in flight since (see kdh_session_get)
);

comment on table public.kdh_sessions is
  'One row per signed-in device of kohlerdisthub.com: the Supabase refresh token the server renews from. Read only through kdh_session_* (api/session.js).';

alter table public.kdh_sessions enable row level security;
revoke all on public.kdh_sessions from public, anon, authenticated;

-- Start a device's sign-in (the hand-off right after the password is
-- accepted). Replaces a row with the same hash (a repeated hand-off).
create or replace function public.kdh_session_create(
  p_sid_hash text, p_email text, p_refresh_token text, p_access_token text, p_access_exp timestamptz, p_keep boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(p_sid_hash, '') = '' or coalesce(p_email, '') = '' or coalesce(p_refresh_token, '') = '' or coalesce(p_access_token, '') = '' or p_access_exp is null then
    raise exception 'kdh_session_create: missing argument';
  end if;
  -- Housekeeping: a device not seen for 400 days (the longest a browser
  -- keeps the cookie) cannot come back.
  delete from public.kdh_sessions where used_at < now() - interval '400 days';
  insert into public.kdh_sessions (sid_hash, email, refresh_token, access_token, access_exp, keep)
  values (p_sid_hash, lower(trim(p_email)), p_refresh_token, p_access_token, p_access_exp, coalesce(p_keep, true))
  on conflict (sid_hash) do update
    set email = excluded.email, refresh_token = excluded.refresh_token, access_token = excluded.access_token,
        access_exp = excluded.access_exp, keep = excluded.keep, used_at = now(), claimed_at = null;
end $$;

-- Read a device's sign-in. With p_claim the caller intends to renew: the
-- refresh token is handed out only when no other renewal is in flight (a
-- claim older than 20 seconds is treated as abandoned); otherwise the
-- reply says busy:true and the caller waits for the other renewal's
-- kdh_session_put and reads again. Without p_claim the refresh token is
-- not returned. NULL when the hash matches no row (signed out / unknown).
create or replace function public.kdh_session_get(p_sid_hash text, p_claim boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r public.kdh_sessions%rowtype;
  busy boolean := false;
begin
  if coalesce(p_sid_hash, '') = '' then return null; end if;
  if p_claim then
    -- Lock the row so two renewals arriving together cannot both claim it.
    select * into r from public.kdh_sessions where sid_hash = p_sid_hash for update;
    if not found then return null; end if;
    if r.claimed_at is not null and r.claimed_at > now() - interval '20 seconds' then
      busy := true;
    else
      update public.kdh_sessions set claimed_at = now(), used_at = now() where sid_hash = p_sid_hash;
    end if;
  else
    select * into r from public.kdh_sessions where sid_hash = p_sid_hash;
    if not found then return null; end if;
  end if;
  return jsonb_build_object(
    'email', r.email,
    'keep', r.keep,
    'access_token', r.access_token,
    'access_exp', r.access_exp,
    'busy', busy,
    'refresh_token', case when p_claim and not busy then r.refresh_token else null end);
end $$;

-- A renewal succeeded: keep the rotated refresh token and the new access
-- token. Returns false when the row is gone (signed out meanwhile).
create or replace function public.kdh_session_put(
  p_sid_hash text, p_refresh_token text, p_access_token text, p_access_exp timestamptz)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(p_sid_hash, '') = '' or coalesce(p_refresh_token, '') = '' or coalesce(p_access_token, '') = '' or p_access_exp is null then
    raise exception 'kdh_session_put: missing argument';
  end if;
  update public.kdh_sessions
     set refresh_token = p_refresh_token, access_token = p_access_token, access_exp = p_access_exp,
         used_at = now(), claimed_at = null
   where sid_hash = p_sid_hash;
  return found;
end $$;

-- A renewal failed or the caller is done: release the claim so the next
-- request may try (used after Supabase was unreachable).
create or replace function public.kdh_session_release(p_sid_hash text)
returns void
language sql security definer
set search_path = public
as $$
  update public.kdh_sessions set claimed_at = null where sid_hash = p_sid_hash;
$$;

-- Sign out on that device (or Supabase said the refresh token is dead).
create or replace function public.kdh_session_delete(p_sid_hash text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.kdh_sessions where sid_hash = p_sid_hash;
  return found;
end $$;

revoke all on function public.kdh_session_create(text, text, text, text, timestamptz, boolean) from public;
revoke all on function public.kdh_session_get(text, boolean) from public;
revoke all on function public.kdh_session_put(text, text, text, timestamptz) from public;
revoke all on function public.kdh_session_release(text) from public;
revoke all on function public.kdh_session_delete(text) from public;
grant execute on function public.kdh_session_create(text, text, text, text, timestamptz, boolean) to anon, authenticated;
grant execute on function public.kdh_session_get(text, boolean) to anon, authenticated;
grant execute on function public.kdh_session_put(text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.kdh_session_release(text) to anon, authenticated;
grant execute on function public.kdh_session_delete(text) to anon, authenticated;

-- Removing someone from the allow list should end their devices' sign-ins
-- too (the middleware refuses them anyway; this keeps the table tidy).
create or replace function public.kdh_sessions_drop_for_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.kdh_sessions where email = lower(trim(old.email));
  return old;
end $$;
drop trigger if exists kdh_sessions_drop_for_user on public.allowed_users;
create trigger kdh_sessions_drop_for_user
  after delete on public.allowed_users
  for each row execute function public.kdh_sessions_drop_for_user();
