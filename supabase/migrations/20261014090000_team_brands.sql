-- Kohler Dist Hub: kdh_team() also returns program_brands (2026-10-14).
--
-- A BRAND MANAGER covers a supplier (or a few) with every rep under them;
-- a DISTRICT MANAGER covers a team of reps across every supplier. The
-- Incentive Hub opens a brand manager on Program View for their brands
-- only (hub/hub.js BRAND_SCOPE). A signed-in manager reads their own
-- allowed_users.program_brands through row-level security; Gavin's
-- "Preview as a manager" switcher (root index.html) needs the previewed
-- manager's brands too, so kdh_team() now carries program_brands beside
-- name / role / title / reports_to. Supplier names only -- no emails.
--
-- program_brands is the column supabase/migrations/20261008120000_manage_programs.sql
-- adds (Fusion supplier names, e.g. 'Boston Beer Company'); it is created
-- here as well so this file runs on its own, before or after that one.
-- Set it in the Table Editor, or with supabase/seed/program_brands.sql.
--
-- Safe to run more than once. The return type changes, so the function is
-- dropped and recreated (nothing in the database depends on it).

alter table public.allowed_users add column if not exists program_brands text[];
comment on column public.allowed_users.program_brands is
  'Brand manager: the suppliers this manager covers (Fusion supplier names). NULL = not a brand manager.';

drop function if exists public.kdh_team();
create function public.kdh_team()
returns table (name text, role text, title text, reports_to text, program_brands text[])
language sql stable security definer set search_path = public as $$
  select u.name, u.role, u.title, u.reports_to, u.program_brands
  from public.allowed_users u
  where public.kdh_is_manager()
  order by u.name;
$$;

revoke all on function public.kdh_team() from public;
grant execute on function public.kdh_team() to authenticated;
