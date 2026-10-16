-- Kohler Dist Hub: SUPPLIER BUDGETS (2026-10-14). Run AFTER 20261008120000_manage_programs.sql
-- (kdh_is_program_admin) and 20261002120000_account_notes_photos.sql (kdh_name_key).
--
-- The "Supplier Budgets Tracker" workbook as tables: one budget row per Account (GL code,
-- brand manager, supplier, budget amount) and one expense row per invoice line, entered on
-- the site by the office assistant instead of typed into the sheet. The repo is PUBLIC, so
-- every dollar lives here, never in a committed file.
--
-- WHO MAY DO WHAT
--   allowed_users.budget_editor = true   add / edit / delete expenses and budget rows,
--                                        export (Alexis; set by hand, like photo_admin)
--   program_admin                        the same (Gavin)
--   any other manager                    READ ONLY, and only the accounts that are theirs:
--                                        the account's Brand Manager is them (name key), or
--                                        the account's supplier is one of their program_brands
--   rep / associate                      nothing (the page is not in REP_PATHS either)
-- Identity is always the token's email (kdh_caller_email), never the page.
--
-- RULES THE DATABASE ENFORCES
--   kohler_spend = total_amount - billback_amount, always (the trigger computes it; the page
--   shows it, nobody types it). A site-entered row needs 0 <= billback <= total and a date in
--   an open year (this year or last). Flipping billback_received to true stamps received_date
--   (today unless given); flipping it back clears it. Every insert / update / delete writes a
--   supplier_expense_events row with the changed columns (old -> new): the audit trail.
--   Imported rows (source import_2026 / import_2025) keep the sheet's original cells in
--   sheet_values; where the sheet's Kohler Spend differed from total - billback, the seed
--   script reports it and the computed value wins.
--
-- Safe to run more than once.

create extension if not exists pgcrypto;

alter table public.allowed_users add column if not exists budget_editor boolean not null default false;
-- normally added by 20261008120000_manage_programs.sql / 20261014090000_team_brands.sql; harmless here
alter table public.allowed_users add column if not exists program_admin boolean not null default false;
alter table public.allowed_users add column if not exists program_brands text[];
comment on column public.allowed_users.budget_editor is
  'May add / edit supplier budget rows and expenses on /supplier-budget/. Set by hand in Supabase.';

create or replace function public.kdh_is_budget_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select budget_editor or program_admin from public.allowed_users where email = public.kdh_caller_email()), false);
$$;
revoke all on function public.kdh_is_budget_editor() from public;
grant execute on function public.kdh_is_budget_editor() to authenticated;

-- the same simplification shared/kdh-user.js brandKey() applies before comparing supplier names
create or replace function public.kdh_brand_key(x text)
returns text language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(replace(lower(coalesce(x, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g'),
      '\m(company|co|inc|llc|ltd|brewing|brewery|brewers|beverage|beverages|group|usa|brands|imports?|exports?|projects|international|distributing|the|and)\M', ' ', 'g'),
    '\s+', '', 'g');
$$;

-- may the caller read a budget account filed under this brand manager / supplier?
create or replace function public.kdh_budget_can_read(p_brand_manager text, p_supplier text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me record;
  k text;
  b text;
begin
  select name, role, budget_editor, program_admin, program_brands into me
    from public.allowed_users where email = public.kdh_caller_email();
  if me is null or me.role <> 'manager' then return false; end if;
  if coalesce(me.budget_editor, false) or coalesce(me.program_admin, false) then return true; end if;
  if p_brand_manager is not null and public.kdh_name_key(p_brand_manager) = public.kdh_name_key(me.name) then return true; end if;
  k := public.kdh_brand_key(p_supplier);
  if k = '' then return false; end if;
  foreach b in array coalesce(me.program_brands, '{}'::text[]) loop
    b := public.kdh_brand_key(b);
    if b <> '' and (b = k or (length(b) >= 4 and length(k) >= 4 and (position(b in k) = 1 or position(k in b) = 1))) then return true; end if;
  end loop;
  return false;
end $$;
revoke all on function public.kdh_budget_can_read(text, text) from public;
grant execute on function public.kdh_budget_can_read(text, text) to authenticated;

-- ------------------------------------------------------------ tables
create table if not exists public.budget_accounts (
  id             uuid primary key default gen_random_uuid(),
  year           int not null,
  code           text,                          -- GL code, e.g. 423101 (not unique: Radeberger and Sixpoint share one)
  account        text not null,                 -- the sheet's Account, e.g. "CROWN- TACTICAL" (the key)
  supplier       text,
  brand_manager  text,
  description    text,                          -- e.g. CROWN/KOHLER TACTICAL
  file_name      text,
  vendor_default text,                          -- the Budget tab's Vendor Name column
  budget_amount  numeric(14,2),                 -- NULL = no budget set (the sheet's 0 / blank)
  basis_text     text,                          -- Budget Breakdown: ".25 cents/Case", "50/50 Split"
  active         boolean not null default true,
  needs_review   boolean not null default false, -- created from an Expenses row whose Account had no Budget row
  notes          text,
  created_by     text, created_name text, created_at timestamptz not null default now(),
  updated_by     text, updated_name text, updated_at timestamptz not null default now(),
  unique (year, account)
);
comment on table public.budget_accounts is 'Supplier Budgets Tracker: the Budget tab, one row per Account per year.';

create table if not exists public.budget_vendors (
  name       text primary key,
  uses       int not null default 0,
  last_used  timestamptz
);

create table if not exists public.supplier_expenses (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.budget_accounts (id),
  expense_date     date not null,
  year             int not null,
  invoice          text,
  vendor           text not null,
  items_purchased  text,
  total_amount     numeric(14,2) not null,
  billback_amount  numeric(14,2) not null default 0,
  kohler_spend     numeric(14,2) not null default 0,   -- = total - billback, by trigger
  billback_received boolean not null default false,
  received_date    date,
  notes            text,
  source           text not null default 'site' check (source in ('site', 'import_2026', 'import_2025')),
  source_key       text unique,                   -- import: tab + row, so a re-pasted seed never duplicates
  sheet_values     jsonb,                         -- import: the original cells
  created_by       text, created_name text, created_at timestamptz not null default now(),
  updated_by       text, updated_name text, updated_at timestamptz not null default now()
);
comment on table public.supplier_expenses is 'Supplier Budgets Tracker: the Expenses tab, one row per invoice line.';
create index if not exists supplier_expenses_account on public.supplier_expenses (account_id, expense_date desc);
create index if not exists supplier_expenses_date on public.supplier_expenses (year, expense_date desc);

create table if not exists public.supplier_expense_events (
  id          bigint generated always as identity primary key,
  expense_id  uuid,                              -- kept after a delete (the row is gone, the trail stays)
  account_id  uuid,
  action      text not null check (action in ('create', 'update', 'delete')),
  changes     jsonb not null default '{}'::jsonb, -- {column: {from, to}} on update; the row on create / delete
  actor_email text not null,
  actor_name  text,
  created_at  timestamptz not null default now()
);
create index if not exists supplier_expense_events_expense on public.supplier_expense_events (expense_id, created_at desc);

-- ------------------------------------------------------------ triggers
create or replace function public.kdh_caller_name_or(p text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select name from public.allowed_users where email = public.kdh_caller_email()), ''), p);
$$;

create or replace function public.budget_accounts_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text := public.kdh_caller_email(); nm text := public.kdh_caller_name_or('');
begin
  new.account := nullif(btrim(coalesce(new.account, '')), '');
  if new.account is null then raise exception 'an account needs a name'; end if;
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  new.supplier := nullif(btrim(coalesce(new.supplier, '')), '');
  new.brand_manager := nullif(btrim(coalesce(new.brand_manager, '')), '');
  if new.budget_amount is not null and new.budget_amount < 0 then raise exception 'a budget cannot be negative'; end if;
  if tg_op = 'INSERT' then
    if me <> '' then new.created_by := me; new.created_name := nm; end if;
    new.created_at := now();
  else
    new.created_by := old.created_by; new.created_name := old.created_name; new.created_at := old.created_at;
  end if;
  if me <> '' then new.updated_by := me; new.updated_name := nm; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists budget_accounts_stamp on public.budget_accounts;
create trigger budget_accounts_stamp before insert or update on public.budget_accounts
  for each row execute function public.budget_accounts_stamp();

create or replace function public.supplier_expenses_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  nm text := public.kdh_caller_name_or('');
  this_year int := extract(year from current_date)::int;
begin
  new.vendor := nullif(btrim(coalesce(new.vendor, '')), '');
  if new.vendor is null then raise exception 'an expense needs a vendor'; end if;
  if new.total_amount is null then raise exception 'an expense needs a total amount'; end if;
  new.billback_amount := coalesce(new.billback_amount, 0);
  if new.source = 'site' then
    if new.billback_amount < 0 or new.billback_amount > new.total_amount then
      raise exception 'billback must be between 0 and the total amount';
    end if;
    if new.expense_date < make_date(this_year - 1, 1, 1) or new.expense_date > make_date(this_year + 1, 12, 31) then
      raise exception 'the date must fall in an open year';
    end if;
  end if;
  new.year := extract(year from new.expense_date)::int;
  new.kohler_spend := round(new.total_amount - new.billback_amount, 2);
  new.invoice := nullif(btrim(coalesce(new.invoice, '')), '');
  new.items_purchased := nullif(btrim(coalesce(new.items_purchased, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  if new.billback_received then
    if new.received_date is null then new.received_date := current_date; end if;
  else
    new.received_date := null;
  end if;
  if tg_op = 'INSERT' then
    if me <> '' then new.created_by := me; new.created_name := nm; end if;
    new.created_at := now();
  else
    new.created_by := old.created_by; new.created_name := old.created_name; new.created_at := old.created_at;
    new.source := old.source; new.source_key := old.source_key; new.sheet_values := old.sheet_values;
  end if;
  if me <> '' then new.updated_by := me; new.updated_name := nm; end if;
  new.updated_at := now();
  -- the vendor list for the typeahead
  insert into public.budget_vendors (name, uses, last_used) values (new.vendor, 1, now())
    on conflict (name) do update set uses = public.budget_vendors.uses + 1, last_used = now();
  return new;
end $$;
drop trigger if exists supplier_expenses_guard on public.supplier_expenses;
create trigger supplier_expenses_guard before insert or update on public.supplier_expenses
  for each row execute function public.supplier_expenses_guard();

-- the audit trail: skipped while a seed runs (set_config('kdh.seeding', '1', false))
create or replace function public.supplier_expenses_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  diff jsonb := '{}'::jsonb;
  k text;
  cols text[] := array['account_id', 'expense_date', 'invoice', 'vendor', 'items_purchased', 'total_amount', 'billback_amount', 'kohler_spend', 'billback_received', 'received_date', 'notes'];
  o jsonb; n jsonb;
begin
  if coalesce(current_setting('kdh.seeding', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then
    n := to_jsonb(new) - 'sheet_values';
    insert into public.supplier_expense_events (expense_id, account_id, action, changes, actor_email, actor_name)
      values (new.id, new.account_id, 'create', n, me, public.kdh_caller_name_or(''));
  elsif tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new);
    foreach k in array cols loop
      if o -> k is distinct from n -> k then diff := diff || jsonb_build_object(k, jsonb_build_object('from', o -> k, 'to', n -> k)); end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
    insert into public.supplier_expense_events (expense_id, account_id, action, changes, actor_email, actor_name)
      values (new.id, new.account_id, 'update', diff, me, public.kdh_caller_name_or(''));
  else
    insert into public.supplier_expense_events (expense_id, account_id, action, changes, actor_email, actor_name)
      values (old.id, old.account_id, 'delete', to_jsonb(old) - 'sheet_values', me, public.kdh_caller_name_or(''));
  end if;
  return null;
end $$;
drop trigger if exists supplier_expenses_log on public.supplier_expenses;
create trigger supplier_expenses_log after insert or update or delete on public.supplier_expenses
  for each row execute function public.supplier_expenses_log();

-- ------------------------------------------------------------ RLS
alter table public.budget_accounts enable row level security;
alter table public.supplier_expenses enable row level security;
alter table public.supplier_expense_events enable row level security;
alter table public.budget_vendors enable row level security;

drop policy if exists "budget accounts read" on public.budget_accounts;
create policy "budget accounts read" on public.budget_accounts for select to authenticated
  using (public.kdh_budget_can_read(brand_manager, supplier));
drop policy if exists "budget accounts write" on public.budget_accounts;
create policy "budget accounts write" on public.budget_accounts for all to authenticated
  using (public.kdh_is_budget_editor()) with check (public.kdh_is_budget_editor());

drop policy if exists "expenses read" on public.supplier_expenses;
create policy "expenses read" on public.supplier_expenses for select to authenticated
  using (exists (select 1 from public.budget_accounts a where a.id = account_id and public.kdh_budget_can_read(a.brand_manager, a.supplier)));
drop policy if exists "expenses write" on public.supplier_expenses;
create policy "expenses write" on public.supplier_expenses for all to authenticated
  using (public.kdh_is_budget_editor()) with check (public.kdh_is_budget_editor());

drop policy if exists "expense events read" on public.supplier_expense_events;
create policy "expense events read" on public.supplier_expense_events for select to authenticated
  using (public.kdh_is_budget_editor());

drop policy if exists "vendors read" on public.budget_vendors;
create policy "vendors read" on public.budget_vendors for select to authenticated using (public.kdh_is_manager());
drop policy if exists "vendors write" on public.budget_vendors;
create policy "vendors write" on public.budget_vendors for all to authenticated
  using (public.kdh_is_budget_editor()) with check (public.kdh_is_budget_editor());

grant select, insert, update, delete on public.budget_accounts, public.supplier_expenses, public.budget_vendors to authenticated;
grant select on public.supplier_expense_events to authenticated;

-- the caller's own standing, for the page (never a secret): {editor, admin, manager}
create or replace function public.kdh_budget_me()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'editor', coalesce((select budget_editor from public.allowed_users where email = public.kdh_caller_email()), false),
    'admin', coalesce((select program_admin from public.allowed_users where email = public.kdh_caller_email()), false),
    'manager', public.kdh_is_manager());
$$;
revoke all on function public.kdh_budget_me() from public;
grant execute on function public.kdh_budget_me() to authenticated;
