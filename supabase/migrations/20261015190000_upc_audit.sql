-- UPC REGISTRATION AUDIT (2026-10-15). Paste into the Supabase SQL Editor.
-- Safe to run more than once.
--
-- The page /upc-audit/ matches Vlad's FileMaker product export to the ABC
-- registration search IN THE BROWSER: neither file is uploaded or stored.
-- The database holds only what people add on top of a run:
--   upc_notes  a dated log per Kohler product code (who, when, status, note);
--              append-only -- a correction is a new note, never an edit.
--   upc_runs   one row per audit run: the files' summaries, the bucket
--              counts and the product codes that needed attention, so the
--              next run can say New / Still Open / Resolved.
--
-- WHO (Gavin, 2026-10-15): Gavin, Vlad (IT) and every brand manager.
--   allowed_users.role 'it'          = an IT person: this page and nothing else
--                                      (the middleware enforces it; no other
--                                      row-level grant applies to 'it')
--   allowed_users.upc_audit = true   = a manager who may open the page too
-- This migration sets upc_audit for every program_admin and for the brand
-- managers of shared/data/brand-managers.json (by NAME KEY -- no emails in
-- this public repo). A new brand manager later: tick upc_audit in Table
-- Editor -> allowed_users, or re-run supabase/seed/upc_audit_access.sql
-- (written by tools/program_seed.py).

-- ------------------------------------------------------------ allow list
alter table public.allowed_users drop constraint if exists allowed_users_role_check;
alter table public.allowed_users
  add constraint allowed_users_role_check check (role in ('rep', 'manager', 'associate', 'it'));

alter table public.allowed_users add column if not exists upc_audit boolean not null default false;

update public.allowed_users set upc_audit = true
 where upc_audit = false
   and (role = 'it'
        or coalesce(program_admin, false)
        or (role = 'manager' and public.kdh_name_key(name) in (
              public.kdh_name_key('Chris McCrohan'), public.kdh_name_key('Chris Politano'),
              public.kdh_name_key('Dan Downing'), public.kdh_name_key('Denise Montes'),
              public.kdh_name_key('Jason Koo'), public.kdh_name_key('Perry Calderone'),
              public.kdh_name_key('Sean Donahue'), public.kdh_name_key('Steve Halloran'),
              public.kdh_name_key('Tom Gibbons'))));

-- May the caller use the UPC audit?
create or replace function public.kdh_upc_can()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
     where email = public.kdh_caller_email()
       and (role = 'it' or upc_audit)
  );
$$;
grant execute on function public.kdh_upc_can() to authenticated;

-- ------------------------------------------------------------ notes (append-only log)
create table if not exists public.upc_notes (
  id           bigint generated always as identity primary key,
  product_code text not null check (length(btrim(product_code)) between 1 and 40),
  upc          text check (upc is null or length(upc) <= 40),
  status       text check (status is null or status in
                 ('open', 'submitted', 'waiting_supplier', 'fixed_filemaker', 'registered', 'not_needed')),
  note         text not null default '' check (length(note) <= 2000),
  bucket       text check (bucket is null or length(bucket) <= 40),   -- the audit result when the note was written
  author_email text not null default '',
  author_name  text not null default '',
  created_at   timestamptz not null default now(),
  check (status is not null or length(btrim(note)) > 0)
);
create index if not exists upc_notes_code on public.upc_notes (product_code, created_at desc);

create or replace function public.upc_notes_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_email := public.kdh_caller_email();
  new.author_name  := coalesce((select name from public.allowed_users where email = new.author_email), '');
  new.created_at   := now();
  new.product_code := btrim(new.product_code);
  new.note         := btrim(coalesce(new.note, ''));
  return new;
end $$;
drop trigger if exists upc_notes_stamp on public.upc_notes;
create trigger upc_notes_stamp before insert on public.upc_notes
  for each row execute function public.upc_notes_stamp();

alter table public.upc_notes enable row level security;
drop policy if exists "upc notes read" on public.upc_notes;
create policy "upc notes read" on public.upc_notes for select to authenticated
  using (public.kdh_upc_can());
drop policy if exists "upc notes add" on public.upc_notes;
create policy "upc notes add" on public.upc_notes for insert to authenticated
  with check (public.kdh_upc_can());
-- no update / delete policy: the log is append-only
revoke update, delete on public.upc_notes from authenticated, anon;
grant select, insert on public.upc_notes to authenticated;

-- ------------------------------------------------------------ runs
create table if not exists public.upc_runs (
  id          bigint generated always as identity primary key,
  run_by_email text not null default '',
  run_by_name  text not null default '',
  created_at  timestamptz not null default now(),
  fm_file     text not null default '' check (length(fm_file) <= 300),
  fm_rows     integer not null default 0,
  abc_files   jsonb not null default '[]'::jsonb,   -- [{file, rows, license, expYear, runOn}]
  counts      jsonb not null default '{}'::jsonb,   -- {bucket: n}
  open_codes  jsonb not null default '[]'::jsonb,   -- [[product_code, bucket], ...] every row not a match
  check (pg_column_size(open_codes) < 500000)
);
create index if not exists upc_runs_when on public.upc_runs (created_at desc);

create or replace function public.upc_runs_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.run_by_email := public.kdh_caller_email();
  new.run_by_name  := coalesce((select name from public.allowed_users where email = new.run_by_email), '');
  new.created_at   := now();
  return new;
end $$;
drop trigger if exists upc_runs_stamp on public.upc_runs;
create trigger upc_runs_stamp before insert on public.upc_runs
  for each row execute function public.upc_runs_stamp();

alter table public.upc_runs enable row level security;
drop policy if exists "upc runs read" on public.upc_runs;
create policy "upc runs read" on public.upc_runs for select to authenticated
  using (public.kdh_upc_can());
drop policy if exists "upc runs add" on public.upc_runs;
create policy "upc runs add" on public.upc_runs for insert to authenticated
  with check (public.kdh_upc_can());
revoke update, delete on public.upc_runs from authenticated, anon;
grant select, insert on public.upc_runs to authenticated;
