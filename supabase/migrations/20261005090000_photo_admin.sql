-- PHOTO ADMIN (2026-10-05). Run AFTER 20261004090000_merchandising.sql.
-- Idempotent: safe to run more than once.
--
-- Gavin oversees the whole iSellBeer / merchandising operation and needs to
-- remove ANY photo or merchandising record, not only the ones his own sign-in
-- saved. This adds a per-person flag on the allow list and widens the three
-- delete rules (photo rows, merchandising records, the stored image files) to
-- "the author OR a photo admin". Nothing else changes: reading still follows
-- the account rules, and nobody can turn the flag on for themselves --
-- signed-in people may only READ their own allow-list row (no update grant).
--
-- WHO is an admin is NOT written here (the repo is public; no emails in it).
-- Turn it on in the SQL Editor after running this file:
--   update public.allowed_users set photo_admin = true where email = '<the email>';
-- or tick the photo_admin box on that row in Table Editor -> allowed_users.

alter table public.allowed_users add column if not exists photo_admin boolean not null default false;
comment on column public.allowed_users.photo_admin is
  'May remove ANY account photo / merchandising record (not only their own). Set only by an owner in the SQL Editor or Table Editor.';

-- the caller's own flag (security definer: the lookup is not blocked by row-level security)
create or replace function public.kdh_is_photo_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select photo_admin from public.allowed_users where email = public.kdh_caller_email()), false);
$$;
revoke all on function public.kdh_is_photo_admin() from public;
grant execute on function public.kdh_is_photo_admin() to authenticated;

-- photo rows: the author, or a photo admin
drop policy if exists "remove own photos" on public.account_photos;
create policy "remove own photos" on public.account_photos
  for delete to authenticated
  using (author_email = public.kdh_caller_email() or public.kdh_is_photo_admin());

-- merchandising records: the author's Hub record, or ANY record (Hub or imported) for a photo admin.
-- Lines and photo links go with the record (on delete cascade).
drop policy if exists "author removes record" on public.merch_records;
create policy "author removes record" on public.merch_records
  for delete to authenticated
  using ((source = 'hub' and author_email = public.kdh_caller_email()) or public.kdh_is_photo_admin());

-- the stored image files: the uploader (existing policy) or a photo admin
drop policy if exists "kdh photos remove admin" on storage.objects;
create policy "kdh photos remove admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'account-photos' and public.kdh_is_photo_admin());
