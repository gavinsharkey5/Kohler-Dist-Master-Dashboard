-- Supplier Budgets: "View As" a manager (2026-10-15). Run AFTER 20261014210000_supplier_budget.sql.
-- Gavin previews another manager on /supplier-budget/ to see what they would see. The page still
-- reads with GAVIN's token (RLS: everything), so it asks here what the previewed person's standing is
-- and cuts the rows client-side: an editor / admin sees everything (read-only in preview), anyone
-- else only the accounts under their name or their program_brands. Managers only; names, no emails.
create or replace function public.kdh_budget_standing(p_name text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.kdh_is_manager() then null else coalesce((
    select jsonb_build_object('found', true, 'name', u.name, 'role', u.role,
      'editor', coalesce(u.budget_editor, false), 'admin', coalesce(u.program_admin, false),
      'brands', to_jsonb(coalesce(u.program_brands, '{}'::text[])))
    from public.allowed_users u
    where u.role = 'manager' and public.kdh_name_key(u.name) = public.kdh_name_key(p_name)
    order by (u.title is not null and u.title <> '') desc, u.email limit 1
  ), jsonb_build_object('found', false, 'editor', false, 'admin', false, 'brands', '[]'::jsonb)) end;
$$;
revoke all on function public.kdh_budget_standing(text) from public;
grant execute on function public.kdh_budget_standing(text) to authenticated;
