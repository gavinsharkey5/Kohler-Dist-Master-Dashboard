-- Kohler Dist Hub: SUPPLIER BUDGETS, round two (2026-10-15). Run AFTER 20261014210000_supplier_budget.sql.
--
-- 1. BILLBACK RULE PER ACCOUNT  budget_accounts.billback_rule
--      'split'  = 50/50: the page fills Billback with half the Total (editable)
--      'none'   = no split: Kohler pays it all, Billback is always 0, so Kohler Spend = Total.
--                 Constellation / Crown accounts (Gavin, 2026-10-15). ENFORCED here, not only on the page.
--      'manual' = typed each time (the old behaviour)
--    Filled once from the data (re-running never overwrites a rule set on the site):
--    Crown / Constellation -> none; an account whose Budget Breakdown says 50/50, or whose rows were mostly
--    split exactly in half -> split; everything else -> manual.
-- 2. CREDITS AND PAST ROWS  a site-entered row may now be a credit (negative Total; Billback then between
--    the Total and 0). The open-year date check applies to a new row or a changed date only, so an old row
--    can be edited. Imported rows are still not range-checked (the sheet had credits and odd billbacks).
-- 3. VENDORS  a vendor typed with different capitals reuses the saved spelling; uses / last_used move only
--    when a row is added or its vendor changes.
-- 4. SETTINGS  budget_settings (key / value): 'invoice_link' = an Encompass invoice address with {invoice}
--    where the number goes, set on the page by an editor. Managers read, editors write.
--
-- Safe to run more than once.

alter table public.budget_accounts add column if not exists billback_rule text;
update public.budget_accounts a set billback_rule = case
    when concat_ws(' ', a.account, a.supplier, a.description) ~* '(crown|constellation)' then 'none'
    when coalesce(a.basis_text, '') ~* '50\s*/\s*50' then 'split'
    when (select count(*) filter (where e.billback_amount > 0 and abs(e.billback_amount - e.total_amount / 2) < 0.02) * 2 >= count(*) and count(*) >= 2
            from public.supplier_expenses e where e.account_id = a.id) then 'split'
    else 'manual' end
  where a.billback_rule is null;
alter table public.budget_accounts alter column billback_rule set default 'manual';
alter table public.budget_accounts alter column billback_rule set not null;
alter table public.budget_accounts drop constraint if exists budget_accounts_billback_rule_check;
alter table public.budget_accounts add constraint budget_accounts_billback_rule_check check (billback_rule in ('split', 'none', 'manual'));
comment on column public.budget_accounts.billback_rule is
  'split = 50/50 (page fills half), none = no billback ever (Kohler Spend = Total; Constellation / Crown), manual = typed each time.';

-- a new Crown / Constellation account is always 'none'
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
  new.billback_rule := coalesce(new.billback_rule, 'manual');
  if concat_ws(' ', new.account, new.supplier, new.description) ~* '(crown|constellation)' then new.billback_rule := 'none'; end if;
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

create or replace function public.supplier_expenses_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  nm text := public.kdh_caller_name_or('');
  this_year int := extract(year from current_date)::int;
  rule text;
  canon text;
begin
  new.vendor := nullif(btrim(coalesce(new.vendor, '')), '');
  if new.vendor is null then raise exception 'an expense needs a vendor'; end if;
  if new.total_amount is null then raise exception 'an expense needs a total amount'; end if;
  new.billback_amount := coalesce(new.billback_amount, 0);
  -- the saved spelling of a vendor wins over different capitals
  select v.name into canon from public.budget_vendors v where lower(v.name) = lower(new.vendor) order by v.uses desc, v.name limit 1;
  if canon is not null then new.vendor := canon; end if;
  -- no-split accounts (Constellation / Crown): Kohler Spend = Total, always
  select a.billback_rule into rule from public.budget_accounts a where a.id = new.account_id;
  if rule = 'none' and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id
      or new.total_amount is distinct from old.total_amount or new.billback_amount is distinct from old.billback_amount) then
    new.billback_amount := 0;
  end if;
  if new.source = 'site' then
    if new.billback_amount < least(0, new.total_amount) or new.billback_amount > greatest(0, new.total_amount) then
      raise exception 'billback must be between 0 and the total amount';
    end if;
    if (tg_op = 'INSERT' or new.expense_date is distinct from old.expense_date)
       and (new.expense_date < make_date(this_year - 1, 1, 1) or new.expense_date > make_date(this_year + 1, 12, 31)) then
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
  -- the saved vendor list (typeahead + quick buttons): counted when a row is added or its vendor changes
  if tg_op = 'INSERT' or new.vendor is distinct from old.vendor then
    insert into public.budget_vendors (name, uses, last_used) values (new.vendor, 1, now())
      on conflict (name) do update set uses = public.budget_vendors.uses + 1, last_used = now();
  end if;
  return new;
end $$;

-- page settings (no money, no emails)
create table if not exists public.budget_settings (
  key          text primary key,
  value        text,
  updated_by   text,
  updated_name text,
  updated_at   timestamptz not null default now()
);
comment on table public.budget_settings is 'Supplier Budgets page settings. invoice_link = Encompass invoice address with {invoice}.';
create or replace function public.budget_settings_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.key = 'invoice_link' and new.value is not null and new.value !~ '^https://[A-Za-z0-9.-]+\.encompass8\.com/.*\{invoice\}' then
    raise exception 'the invoice link must be an https Encompass address containing {invoice}';
  end if;
  new.updated_by := public.kdh_caller_email(); new.updated_name := public.kdh_caller_name_or(''); new.updated_at := now();
  return new;
end $$;
drop trigger if exists budget_settings_stamp on public.budget_settings;
create trigger budget_settings_stamp before insert or update on public.budget_settings
  for each row execute function public.budget_settings_stamp();
alter table public.budget_settings enable row level security;
drop policy if exists "budget settings read" on public.budget_settings;
create policy "budget settings read" on public.budget_settings for select to authenticated using (public.kdh_is_manager());
drop policy if exists "budget settings write" on public.budget_settings;
create policy "budget settings write" on public.budget_settings for all to authenticated
  using (public.kdh_is_budget_editor()) with check (public.kdh_is_budget_editor());
grant select, insert, update, delete on public.budget_settings to authenticated;
