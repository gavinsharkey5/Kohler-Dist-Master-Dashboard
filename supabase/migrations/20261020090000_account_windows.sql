-- ACCOUNT WINDOWS (2026-10-20). Run AFTER 20261004090000_merchandising.sql and
-- 20261016180155_associate_accounts_task_scope.sql. Idempotent: safe to run more than once.
--
-- A WINDOW is one signage spot at an account (a storefront with four places a
-- sign can go = four windows). Unlike a merchandising record (one dated
-- observation), a window LASTS: it has a name, where it is, its size in inches,
-- its importance, and a CURRENT state that each visit updates:
--   status   executed   = our brand is on it
--            competitor = a competitor's brand is on it
--            open       = nothing on it, available to sell in
--            NULL       = on the list, not verified yet (never counted as open)
--   brand / program (free text) / latest photo / last verified (when, who).
-- A visit is still captured through the existing Window photo flow
-- (accounts/activity.js): the photo becomes a merch_records row as before and
-- kdh_window_verify() points the window at it. Every change is written to
-- account_window_events (append-only: add / edit / verify / remove / restore,
-- with the full state after the change), so history is never lost; a removed
-- window is hidden, not deleted, and can be restored.
--
-- Access: the account rule notes, photos and merchandising already use
-- (kdh_can_access_account: a rep their assigned accounts, an associate any
-- assigned customer, managers all). Nobody writes the tables directly; the
-- three functions below check access and stamp the author from the token.
-- Execution % = executed / every window on the list (unverified included).

-- ------------------------------------------------------------ windows
create table if not exists public.account_windows (
  id                uuid primary key default gen_random_uuid(),
  customer_num      text not null,
  name              text not null,
  location          text not null default 'other',
  width_in          numeric(6, 1),
  height_in         numeric(6, 1),
  importance        text not null default 'medium',
  status            text,
  brand             text,
  brand_family      text,
  program           text,
  photo_path        text,
  record_id         uuid references public.merch_records (id) on delete set null,
  verified_at       timestamptz,
  verified_by_email text,
  verified_by_name  text,
  created_at        timestamptz not null default now(),
  created_by_email  text,
  created_by_name   text,
  updated_at        timestamptz not null default now(),
  removed_at        timestamptz,
  removed_by_email  text,
  removed_by_name   text
);
alter table public.account_windows drop constraint if exists account_windows_location_check;
alter table public.account_windows add constraint account_windows_location_check check (location in ('front', 'side', 'entrance', 'other'));
alter table public.account_windows drop constraint if exists account_windows_importance_check;
alter table public.account_windows add constraint account_windows_importance_check check (importance in ('high', 'medium', 'low'));
alter table public.account_windows drop constraint if exists account_windows_status_check;
alter table public.account_windows add constraint account_windows_status_check check (status is null or status in ('executed', 'competitor', 'open'));
alter table public.account_windows drop constraint if exists account_windows_size_check;
alter table public.account_windows add constraint account_windows_size_check
  check ((width_in is null or (width_in > 0 and width_in <= 1200)) and (height_in is null or (height_in > 0 and height_in <= 1200)));
alter table public.account_windows drop constraint if exists account_windows_name_check;
alter table public.account_windows add constraint account_windows_name_check check (length(trim(name)) between 1 and 60);
alter table public.account_windows drop constraint if exists account_windows_brand_check;
alter table public.account_windows add constraint account_windows_brand_check
  check ((status is distinct from 'open' or brand is null) and (status not in ('executed', 'competitor') or brand is not null));
alter table public.account_windows drop constraint if exists account_windows_photo_check;
alter table public.account_windows add constraint account_windows_photo_check
  check (photo_path is null or photo_path like customer_num || '/%');
-- one live window per name at an account (a removed one frees its name)
create unique index if not exists account_windows_live_name on public.account_windows (customer_num, lower(trim(name))) where removed_at is null;
create index if not exists account_windows_acct on public.account_windows (customer_num);
comment on table public.account_windows is
  'One signage spot per row at an account: name, location, size (inches), importance, and its current status / brand / program / photo. Written only through kdh_window_save / kdh_window_verify / kdh_window_remove.';

-- ------------------------------------------------------------ history (append-only)
create table if not exists public.account_window_events (
  id            bigserial primary key,
  window_id     uuid not null references public.account_windows (id) on delete cascade,
  customer_num  text not null,
  kind          text not null,
  state         jsonb not null,
  author_email  text,
  author_name   text,
  at            timestamptz not null default now()
);
alter table public.account_window_events drop constraint if exists account_window_events_kind_check;
alter table public.account_window_events add constraint account_window_events_kind_check check (kind in ('add', 'edit', 'verify', 'remove', 'restore'));
create index if not exists account_window_events_win on public.account_window_events (window_id, at desc);

-- a window visit's merchandising record knows its window
alter table public.merch_records add column if not exists window_id uuid references public.account_windows (id) on delete set null;

alter table public.account_windows enable row level security;
alter table public.account_window_events enable row level security;
drop policy if exists "read windows" on public.account_windows;
create policy "read windows" on public.account_windows for select to authenticated
  using (public.kdh_can_access_account(customer_num));
drop policy if exists "read window history" on public.account_window_events;
create policy "read window history" on public.account_window_events for select to authenticated
  using (public.kdh_can_access_account(customer_num));
revoke insert, update, delete on public.account_windows from anon, authenticated;
revoke insert, update, delete on public.account_window_events from anon, authenticated;
grant select on public.account_windows to authenticated;
grant select on public.account_window_events to authenticated;

-- ------------------------------------------------------------ functions
create or replace function public.kdh_window_log(w public.account_windows, k text)
returns void language sql security definer set search_path = public as $$
  insert into public.account_window_events (window_id, customer_num, kind, state, author_email, author_name)
  values (w.id, w.customer_num, k,
          jsonb_build_object('name', w.name, 'location', w.location, 'width_in', w.width_in, 'height_in', w.height_in, 'importance', w.importance,
                             'status', w.status, 'brand', w.brand, 'brand_family', w.brand_family, 'program', w.program,
                             'photo_path', w.photo_path, 'record_id', w.record_id, 'verified_at', w.verified_at, 'removed_at', w.removed_at),
          public.kdh_caller_email(), (select name from public.allowed_users where email = public.kdh_caller_email()));
$$;
revoke all on function public.kdh_window_log(public.account_windows, text) from public, anon, authenticated;

-- add a window, or edit what it IS (name, location, size, importance). p: {id?, customer_num, name, location, width_in, height_in, importance}
create or replace function public.kdh_window_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  nm text := (select name from public.allowed_users where email = me);
  acct text := trim(coalesce(p->>'customer_num', ''));
  wid uuid; w public.account_windows; num_re text := '^[0-9]{1,4}(\.[0-9])?$';
  wi numeric; hi numeric;
begin
  if me is null or me = '' or nm is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if coalesce(p->>'width_in', '') <> '' and (p->>'width_in') !~ num_re then raise exception 'width should be inches, like 36 or 36.5'; end if;
  if coalesce(p->>'height_in', '') <> '' and (p->>'height_in') !~ num_re then raise exception 'height should be inches, like 48 or 48.5'; end if;
  wi := nullif(p->>'width_in', '')::numeric; hi := nullif(p->>'height_in', '')::numeric;
  if coalesce(p->>'id', '') <> '' then
    wid := (p->>'id')::uuid;
    select * into w from public.account_windows where id = wid;
    if w.id is null or not public.kdh_can_access_account(w.customer_num) then raise exception 'window not found' using errcode = '42501'; end if;
    if w.removed_at is not null then raise exception 'that window was removed'; end if;
    update public.account_windows set
      name = left(trim(coalesce(p->>'name', name)), 60), location = coalesce(nullif(p->>'location', ''), location),
      width_in = wi, height_in = hi, importance = coalesce(nullif(p->>'importance', ''), importance), updated_at = now()
     where id = wid returning * into w;
    if (select state from public.account_window_events where window_id = wid order by id desc limit 1)
       is distinct from (select jsonb_build_object('name', w.name, 'location', w.location, 'width_in', w.width_in, 'height_in', w.height_in, 'importance', w.importance,
                             'status', w.status, 'brand', w.brand, 'brand_family', w.brand_family, 'program', w.program,
                             'photo_path', w.photo_path, 'record_id', w.record_id, 'verified_at', w.verified_at, 'removed_at', w.removed_at)) then
      perform public.kdh_window_log(w, 'edit');
    end if;
  else
    if not public.kdh_can_access_account(acct) then raise exception 'account not on your route' using errcode = '42501'; end if;
    insert into public.account_windows (customer_num, name, location, width_in, height_in, importance, created_by_email, created_by_name)
    values (acct, left(trim(coalesce(p->>'name', '')), 60), coalesce(nullif(p->>'location', ''), 'other'), wi, hi, coalesce(nullif(p->>'importance', ''), 'medium'), me, nm)
    returning * into w;
    perform public.kdh_window_log(w, 'add');
  end if;
  return to_jsonb(w);
exception when unique_violation then
  raise exception 'this account already has a window named "%"', trim(coalesce(p->>'name', '')) using errcode = '23505';
end $$;

-- a visit: what is on the window now. p: {id, status, brand, brand_family, program, photo_path, record_key}
-- record_key = the capture's client id (kdh_merch_save's key); the same key twice changes nothing (retry-safe).
create or replace function public.kdh_window_verify(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  nm text := (select name from public.allowed_users where email = me);
  w public.account_windows; st text := nullif(p->>'status', ''); rid uuid; ph text := nullif(trim(coalesce(p->>'photo_path', '')), '');
  br text := nullif(left(trim(coalesce(p->>'brand', '')), 120), '');
begin
  if me is null or me = '' or nm is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into w from public.account_windows where id = nullif(p->>'id', '')::uuid;
  if w.id is null or not public.kdh_can_access_account(w.customer_num) then raise exception 'window not found' using errcode = '42501'; end if;
  if w.removed_at is not null then raise exception 'that window was removed'; end if;
  if st is null or st not in ('executed', 'competitor', 'open') then raise exception 'choose Ours, Competitor or Open'; end if;
  if st = 'open' then br := null; elsif br is null then raise exception 'name the brand on the window'; end if;
  if coalesce(p->>'record_key', '') <> '' then
    select id into rid from public.merch_records where source_key = 'hub:' || (p->>'record_key') and customer_num = w.customer_num;
    if rid is not null and rid = w.record_id then return to_jsonb(w); end if;   -- already applied (a retry)
  end if;
  if ph is not null and not exists (select 1 from public.account_photos where storage_path = ph and customer_num = w.customer_num) then ph := null; end if;
  update public.account_windows set status = st, brand = br,
    brand_family = case when st = 'open' then null else nullif(left(trim(coalesce(p->>'brand_family', '')), 120), '') end,
    program = case when st = 'open' then null else nullif(left(trim(coalesce(p->>'program', '')), 120), '') end,
    photo_path = coalesce(ph, photo_path), record_id = coalesce(rid, record_id),
    verified_at = now(), verified_by_email = me, verified_by_name = nm, updated_at = now()
   where id = w.id returning * into w;
  if rid is not null then update public.merch_records set window_id = w.id where id = rid; end if;
  perform public.kdh_window_log(w, 'verify');
  return to_jsonb(w);
end $$;

-- remove (the spot no longer exists) or restore. p: {id, restore?}
create or replace function public.kdh_window_remove(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  nm text := (select name from public.allowed_users where email = me);
  w public.account_windows;
begin
  if me is null or me = '' or nm is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into w from public.account_windows where id = nullif(p->>'id', '')::uuid;
  if w.id is null or not public.kdh_can_access_account(w.customer_num) then raise exception 'window not found' using errcode = '42501'; end if;
  if coalesce((p->>'restore')::boolean, false) then
    if w.removed_at is null then return to_jsonb(w); end if;
    update public.account_windows set removed_at = null, removed_by_email = null, removed_by_name = null, updated_at = now() where id = w.id returning * into w;
    perform public.kdh_window_log(w, 'restore');
  else
    if w.removed_at is not null then return to_jsonb(w); end if;
    update public.account_windows set removed_at = now(), removed_by_email = me, removed_by_name = nm, updated_at = now() where id = w.id returning * into w;
    perform public.kdh_window_log(w, 'remove');
  end if;
  return to_jsonb(w);
exception when unique_violation then
  raise exception 'another live window at this account already has that name -- rename one first' using errcode = '23505';
end $$;

revoke all on function public.kdh_window_save(jsonb) from public, anon;
revoke all on function public.kdh_window_verify(jsonb) from public, anon;
revoke all on function public.kdh_window_remove(jsonb) from public, anon;
grant execute on function public.kdh_window_save(jsonb) to authenticated;
grant execute on function public.kdh_window_verify(jsonb) to authenticated;
grant execute on function public.kdh_window_remove(jsonb) to authenticated;
