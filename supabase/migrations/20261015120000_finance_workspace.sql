-- Kohler Dist Hub: the FINANCE workspace (2026-10-15). Run AFTER 20261014090000_team_brands.sql
-- and 20261015090000_budget_preview.sql.
--
-- Gavin: Alexis handles every billback and the recaps sent to suppliers for the incentive
-- programs. She needs the Incentive Hub (Program View, Export Data / Export Recap), the
-- Incentive Tracker, both MPO trackers, Supplier Budgets and Incentive Performance -- and
-- nothing else (no accounts, team, trackers, tasks, merchandising, ...).
--
-- allowed_users.workspace = 'finance' marks such a manager. The middleware lets a finance
-- manager open only those pages (anything else goes to /hub/; 403 for data) and the site's
-- navigation lists just them. Row-level security elsewhere is unchanged: she is still a
-- manager, so the hub's data and the budget tables answer as they do for any manager.
-- NULL = the full manager site. Set it by hand:
--   update public.allowed_users set workspace = 'finance' where email = '<alexis>';
-- Safe to run more than once.

alter table public.allowed_users add column if not exists workspace text;
alter table public.allowed_users drop constraint if exists allowed_users_workspace_check;
alter table public.allowed_users add constraint allowed_users_workspace_check check (workspace is null or workspace in ('finance'));
comment on column public.allowed_users.workspace is
  'NULL = the full site for the role. ''finance'' = a manager limited to incentives, MPOs, supplier budgets and incentive performance.';

-- kdh_team carries it so Gavin's View As -> Manager can preview the workspace
drop function if exists public.kdh_team();
create function public.kdh_team()
returns table (name text, role text, title text, reports_to text, program_brands text[], workspace text)
language sql stable security definer set search_path = public as $$
  select u.name, u.role, u.title, u.reports_to, u.program_brands, u.workspace
  from public.allowed_users u
  where public.kdh_is_manager()
  order by u.name;
$$;
revoke all on function public.kdh_team() from public;
grant execute on function public.kdh_team() to authenticated;

-- the Supplier Budgets preview reads it too
create or replace function public.kdh_budget_standing(p_name text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.kdh_is_manager() then null else coalesce((
    select jsonb_build_object('found', true, 'name', u.name, 'role', u.role,
      'editor', coalesce(u.budget_editor, false), 'admin', coalesce(u.program_admin, false),
      'brands', to_jsonb(coalesce(u.program_brands, '{}'::text[])), 'workspace', u.workspace)
    from public.allowed_users u
    where u.role = 'manager' and public.kdh_name_key(u.name) = public.kdh_name_key(p_name)
    order by (u.title is not null and u.title <> '') desc, u.email limit 1
  ), jsonb_build_object('found', false, 'editor', false, 'admin', false, 'brands', '[]'::jsonb)) end;
$$;
revoke all on function public.kdh_budget_standing(text) from public;
grant execute on function public.kdh_budget_standing(text) to authenticated;
