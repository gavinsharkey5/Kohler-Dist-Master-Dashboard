-- Kohler Dist Hub: who reports to whom, for the Team activity page
-- (2026-09-28). allowed_users' row-level security lets a person read only
-- their own row, so a manager cannot list their reps from it directly.
-- kdh_team() returns name / role / title / reports_to for everyone -- no
-- emails, no phones -- and only when the caller is a manager.
--
-- Safe to run more than once.

create or replace function public.kdh_team()
returns table (name text, role text, title text, reports_to text)
language sql stable security definer set search_path = public as $$
  select u.name, u.role, u.title, u.reports_to
  from public.allowed_users u
  where public.kdh_is_manager()
  order by u.name;
$$;

revoke all on function public.kdh_team() from public;
grant execute on function public.kdh_team() to authenticated;
