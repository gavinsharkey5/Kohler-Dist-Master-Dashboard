-- PHOTO LABELS (2026-10-03). Run AFTER 20261002120000_account_notes_photos.sql.
-- Idempotent: safe to run more than once.
--
--   * category may be empty: such photos show under "Uncategorized" on the
--     Account page (older or imported photos, or one saved before a type was
--     chosen); the four types stay the only allowed values otherwise.
--   * brand / program_id: an optional association a rep can add when saving
--     (or later, on their own photo), so photos can be filtered by brand.
--   * the AUTHOR may relabel their own photo (category, caption, brand,
--     program) -- nothing else about the record can change: the account, the
--     file, the author and the times are kept by the trigger below.
-- The page works before this is run: it saves without brand / program and
-- hides relabelling, and says so once.

alter table public.account_photos alter column category drop not null;
alter table public.account_photos drop constraint if exists account_photos_category_check;
alter table public.account_photos add constraint account_photos_category_check
  check (category is null or category in ('display', 'window', 'cooler_door', 'tap_handle'));

alter table public.account_photos add column if not exists brand text;
alter table public.account_photos add column if not exists program_id text;
alter table public.account_photos drop constraint if exists account_photos_brand_len;
alter table public.account_photos add constraint account_photos_brand_len check (brand is null or length(brand) <= 120);
alter table public.account_photos drop constraint if exists account_photos_program_len;
alter table public.account_photos add constraint account_photos_program_len check (program_id is null or length(program_id) <= 120);

-- relabelling keeps the record's identity
create or replace function public.account_photos_relabel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id           := old.id;
  new.customer_num := old.customer_num;
  new.storage_path := old.storage_path;
  new.author_email := old.author_email;
  new.author_name  := old.author_name;
  new.uploaded_at  := old.uploaded_at;
  new.captured_at  := old.captured_at;
  new.premise      := old.premise;
  new.width        := old.width;
  new.height       := old.height;
  new.caption      := nullif(left(trim(coalesce(new.caption, '')), 500), '');
  new.brand        := nullif(left(trim(coalesce(new.brand, '')), 120), '');
  new.program_id   := nullif(left(trim(coalesce(new.program_id, '')), 120), '');
  return new;
end $$;
drop trigger if exists account_photos_relabel on public.account_photos;
create trigger account_photos_relabel before update on public.account_photos
  for each row execute function public.account_photos_relabel();

drop policy if exists "relabel own photos" on public.account_photos;
create policy "relabel own photos" on public.account_photos
  for update to authenticated
  using (author_email = public.kdh_caller_email())
  with check (author_email = public.kdh_caller_email());
grant update (category, caption, brand, program_id) on public.account_photos to authenticated;
