-- Kohler Dist Hub: account notes, follow-ups and photos (2026-10-02).
--
-- NOTES REUSE rep_actions (the hub's write-back table) instead of a second
-- notes system: an account note is a rep_actions row whose program_id is
-- 'note:<uuid>' -- status 'note' (a general note) or 'follow' (an actionable
-- follow-up, optionally due on follow_on) -- so the rep home's follow-up list
-- and the Team Activity page count account follow-ups with the program ones.
-- The existing trigger still stamps rep_email / rep_name from the token.
--
-- PHOTOS are rows in account_photos plus a JPEG in the private Storage
-- bucket 'account-photos' at <customer_num>/<uuid>.jpg.
--
-- ACCOUNT-LEVEL ACCESS: account_assignments (customer_num -> rep_key) is
-- loaded from supabase/seed/account_assignments.sql, which
-- accounts/generate.py writes from the customer base. A rep may add notes
-- and photos on, and read the shared notes and photos of, the accounts
-- assigned to them; a manager reads and writes every account (a DM's team
-- scope stays in the pages, as everywhere else). Program marks keep their
-- old rule: private to the author, readable by managers.
--
-- rep_key is the site's name key (shared/kdh-user.js, middleware.js,
-- api/chat.js nameKey): canonical first name + surname, e.g. "mike-ast".
-- kdh_name_key() below is a MIRROR of that function, nickname map included;
-- scratchpad sql_notes_test pins the two together.
--
-- Safe to run more than once. Run it, then the seed file.

-- ------------------------------------------------------------ name key
create or replace function public.kdh_name_key(n text)
returns text language plpgsql immutable as $$
declare
  nick constant jsonb := '{"daniel":"dan","james":"jim","matthew":"matt","nicholas":"nick","michael":"mike","christopher":"chris","robert":"rob","william":"bill","joseph":"joe","jonathan":"jon","kenneth":"ken","timothy":"tim","thomas":"tom","richard":"rich","edward":"ed","andrew":"andy","anthony":"tony","steven":"steve","stephen":"steve","benjamin":"ben","samuel":"sam","alexander":"alex","patrick":"pat","gregory":"greg","jeffrey":"jeff","joshua":"josh","zachary":"zach","charles":"chuck","frederick":"fred","ronald":"ron","donald":"don","douglas":"doug","kevin":"kev","katherine":"kate","elizabeth":"liz","jennifer":"jen","jessica":"jess","rebecca":"becky","danielle":"dani","nicole":"nikki","alexandra":"alex","victoria":"vicky"}';
  parts text[];
  first text;
  rest text;
begin
  parts := regexp_split_to_array(btrim(regexp_replace(regexp_replace(lower(coalesce(n, '')), '[^a-z[:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g')), ' ');
  if parts is null or array_length(parts, 1) is null or parts[1] = '' then return ''; end if;
  first := coalesce(nick ->> parts[1], parts[1]);
  rest := array_to_string(parts[2:array_length(parts, 1)], '');
  return first || case when coalesce(rest, '') <> '' then '-' || rest else '' end;
end $$;

-- ------------------------------------------------------------ assignments
create table if not exists public.account_assignments (
  customer_num text primary key,
  rep_key      text not null,
  updated_at   timestamptz not null default now()
);
comment on table public.account_assignments is
  'Which rep (name key) holds each account. Loaded from supabase/seed/account_assignments.sql; gates notes and photos.';
create index if not exists account_assignments_rep on public.account_assignments (rep_key);
alter table public.account_assignments enable row level security;
-- nobody reads it directly; the security-definer checks below do
revoke all on public.account_assignments from anon, authenticated;

create or replace function public.kdh_my_key()
returns text language sql stable security definer set search_path = public as $$
  select public.kdh_name_key(name) from public.allowed_users where email = public.kdh_caller_email();
$$;

create or replace function public.kdh_can_access_account(n text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.kdh_is_manager()
      or exists (select 1 from public.account_assignments a
                 where a.customer_num = trim(n) and a.rep_key = public.kdh_my_key() and a.rep_key <> '');
$$;

revoke all on function public.kdh_my_key() from public;
revoke all on function public.kdh_can_access_account(text) from public;
grant execute on function public.kdh_name_key(text) to authenticated;
grant execute on function public.kdh_my_key() to authenticated;
grant execute on function public.kdh_can_access_account(text) to authenticated;

-- ------------------------------------------------------------ notes in rep_actions
alter table public.rep_actions add column if not exists follow_on date;
alter table public.rep_actions drop constraint if exists rep_actions_status_check;
alter table public.rep_actions add constraint rep_actions_status_check
  check (status in ('done', 'follow', 'skip', 'note'));
-- a 'note' status only on an account note, never on a program mark
alter table public.rep_actions drop constraint if exists rep_actions_note_scope;
alter table public.rep_actions add constraint rep_actions_note_scope
  check (status <> 'note' or program_id like 'note:%');
create index if not exists rep_actions_account on public.rep_actions (account_num, updated_at desc);

drop policy if exists "read own or manager" on public.rep_actions;
create policy "read own or manager" on public.rep_actions
  for select to authenticated
  using (rep_email = public.kdh_caller_email()
         or public.kdh_is_manager()
         or (program_id like 'note:%' and public.kdh_can_access_account(account_num)));

drop policy if exists "insert own" on public.rep_actions;
create policy "insert own" on public.rep_actions
  for insert to authenticated
  with check (program_id not like 'note:%' or public.kdh_can_access_account(account_num));

-- update / delete stay "own rows only" (20260925180000)

-- ------------------------------------------------------------ photos
create table if not exists public.account_photos (
  id            uuid primary key default gen_random_uuid(),
  customer_num  text not null,
  category      text not null check (category in ('display', 'window', 'cooler_door', 'tap_handle')),
  premise       text check (premise in ('On', 'Off')),
  caption       text,
  storage_path  text not null unique,
  width         int,
  height        int,
  captured_at   timestamptz,               -- from the photo's EXIF when the file has it, else null
  uploaded_at   timestamptz not null default now(),
  author_email  text not null,
  author_name   text,
  constraint account_photos_path check (storage_path like customer_num || '/%')
);
comment on table public.account_photos is
  'Account photos (Display / Window / Cooler Door off-premise, Tap Handle on-premise). The JPEG is in Storage bucket account-photos at storage_path.';
create index if not exists account_photos_acct on public.account_photos (customer_num, uploaded_at desc);

create or replace function public.account_photos_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_email := public.kdh_caller_email();
  new.author_name  := (select name from public.allowed_users where email = new.author_email);
  new.uploaded_at  := now();
  new.customer_num := trim(new.customer_num);
  new.caption      := nullif(left(trim(coalesce(new.caption, '')), 500), '');
  if new.captured_at is not null and (new.captured_at > now() + interval '1 day' or new.captured_at < now() - interval '5 years') then
    new.captured_at := null;           -- a camera clock that is plainly wrong is not a capture time
  end if;
  return new;
end $$;
drop trigger if exists account_photos_stamp on public.account_photos;
create trigger account_photos_stamp before insert on public.account_photos
  for each row execute function public.account_photos_stamp();

alter table public.account_photos enable row level security;
drop policy if exists "read account photos" on public.account_photos;
create policy "read account photos" on public.account_photos
  for select to authenticated
  using (public.kdh_can_access_account(customer_num) or author_email = public.kdh_caller_email());
drop policy if exists "add account photos" on public.account_photos;
create policy "add account photos" on public.account_photos
  for insert to authenticated
  with check (public.kdh_can_access_account(customer_num));
drop policy if exists "remove own photos" on public.account_photos;
create policy "remove own photos" on public.account_photos
  for delete to authenticated
  using (author_email = public.kdh_caller_email());
grant select, insert, delete on public.account_photos to authenticated;

-- ------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-photos', 'account-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kdh photos read" on storage.objects;
create policy "kdh photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'account-photos' and public.kdh_can_access_account((storage.foldername(name))[1]));
drop policy if exists "kdh photos add" on storage.objects;
create policy "kdh photos add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'account-photos' and public.kdh_can_access_account((storage.foldername(name))[1]));
drop policy if exists "kdh photos remove own" on storage.objects;
create policy "kdh photos remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'account-photos' and owner_id = auth.uid()::text);
