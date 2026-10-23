-- Phase 5. Approved 2026-10-23. No inferred account tags.
-- Requires the existing allowed_users, account_assignments and account access helpers.
create table if not exists public.account_fit_types (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 1 and 60),
  families text[] not null check (cardinality(families) between 1 and 40 and array_position(families,null) is null)
);
create unique index if not exists account_fit_types_label on public.account_fit_types(lower(trim(label)));
create table if not exists public.account_fit_tags (
  customer_num text not null references public.account_assignments(customer_num) on delete cascade,
  type_id uuid not null references public.account_fit_types(id) on delete restrict,
  primary key(customer_num,type_id)
);
create index if not exists account_fit_tags_type on public.account_fit_tags(type_id);
alter table public.account_fit_types enable row level security;
alter table public.account_fit_tags enable row level security;
revoke all on public.account_fit_types,public.account_fit_tags from public,anon,authenticated;
grant select,insert,update on public.account_fit_types to authenticated;
grant select,insert,delete on public.account_fit_tags to authenticated;

-- Look up the verified allow-list row, never user-editable JWT metadata.
drop policy if exists fit_types_read on public.account_fit_types;
create policy fit_types_read on public.account_fit_types for select to authenticated using (
  exists(select 1 from public.allowed_users u where u.email=(select public.kdh_caller_email())
    and u.role in ('manager','rep') and coalesce(to_jsonb(u)->>'workspace','')<>'finance')
);
drop policy if exists fit_types_insert on public.account_fit_types;
create policy fit_types_insert on public.account_fit_types for insert to authenticated with check (
  exists(select 1 from public.allowed_users u where u.email=(select public.kdh_caller_email())
    and u.role='manager' and coalesce(to_jsonb(u)->>'workspace','')<>'finance')
);
drop policy if exists fit_types_update on public.account_fit_types;
create policy fit_types_update on public.account_fit_types for update to authenticated using (
  exists(select 1 from public.allowed_users u where u.email=(select public.kdh_caller_email())
    and u.role='manager' and coalesce(to_jsonb(u)->>'workspace','')<>'finance')
) with check (
  exists(select 1 from public.allowed_users u where u.email=(select public.kdh_caller_email())
    and u.role='manager' and coalesce(to_jsonb(u)->>'workspace','')<>'finance')
);
drop policy if exists fit_tags_read on public.account_fit_tags;
create policy fit_tags_read on public.account_fit_tags for select to authenticated using (
  public.kdh_can_access_account(customer_num) and exists(select 1 from public.allowed_users u
    where u.email=(select public.kdh_caller_email()) and u.role in ('manager','rep')
    and coalesce(to_jsonb(u)->>'workspace','')<>'finance')
);
drop policy if exists fit_tags_insert on public.account_fit_tags;
create policy fit_tags_insert on public.account_fit_tags for insert to authenticated with check (
  public.kdh_can_access_account(customer_num) and exists(select 1 from public.allowed_users u
    where u.email=(select public.kdh_caller_email()) and u.role='manager'
    and coalesce(to_jsonb(u)->>'workspace','')<>'finance')
);
drop policy if exists fit_tags_delete on public.account_fit_tags;
create policy fit_tags_delete on public.account_fit_tags for delete to authenticated using (
  public.kdh_can_access_account(customer_num) and exists(select 1 from public.allowed_users u
    where u.email=(select public.kdh_caller_email()) and u.role='manager'
    and coalesce(to_jsonb(u)->>'workspace','')<>'finance')
);
-- User-supplied starting mappings, resolved to the current catalogue's family labels.
-- No account is classified by these seeds. Managers can edit every mapping.
insert into public.account_fit_types(id,label,families) values
 ('b5f17000-0000-4000-8000-000000000001','Dive Bar',array['Miller High Life','Pabst Blue Ribbon','Pabst Light','Narragansett']),
 ('b5f17000-0000-4000-8000-000000000002','German Bar',array['Hofbrau Usa']),
 ('b5f17000-0000-4000-8000-000000000003','Asian Restaurant',array['Sapporo'])
on conflict do nothing;
comment on table public.account_fit_types is 'Manager-editable account type to brand families. Territory and catalogue checks still apply.';
comment on table public.account_fit_tags is 'Explicit manager-verified account types. No account-name, chain or class inference.';
