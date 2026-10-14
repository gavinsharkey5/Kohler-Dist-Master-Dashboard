-- Sales associates (Encompass "Merchandisers") sign in with role 'associate'.
-- They are neither reps nor managers: the Sales Associates section will key
-- on this role; until it ships the middleware treats them like a rep
-- (non-manager -> REP_PATHS), which lets them sign in and nothing else.
alter table public.allowed_users drop constraint if exists allowed_users_role_check;
alter table public.allowed_users
  add constraint allowed_users_role_check check (role in ('rep', 'manager', 'associate'));

comment on table public.allowed_users is
  'Sign-in allow list for kohlerdisthub.com. role: rep, manager or associate.';
