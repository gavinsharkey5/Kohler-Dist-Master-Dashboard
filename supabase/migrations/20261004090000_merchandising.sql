-- MERCHANDISING RECORDS (2026-10-04). Run AFTER 20261002120000_account_notes_photos.sql
-- and 20261003090000_photo_labels.sql. Idempotent: safe to run more than once.
--
-- One MERCHANDISING RECORD = one display / window / cooler door / tap survey /
-- menu placement / other activation at one account (CustomerID), observed at
-- one time. It has:
--   * zero or more LINES  (merch_lines: supplier / brand / package / quantity +
--     unit, or a tap brand with its tap count and the source's US/THEM), and
--   * zero or more PHOTOS (the existing account_photos table, linked through
--     merch_record_photos so one photo is stored ONCE even when two records
--     share it).
-- Records come from two places, kept apart by `source`:
--   'hub'       captured in Kohler Hub (author = the signed-in person, stamped)
--   'isellbeer' imported from an iSellBeer export (photo taker kept as
--               source_author -- history only, never used for access)
-- Duplicates are impossible by construction: a record is keyed by source_key
-- (a hub capture's client id, or the stable iSellBeer identifiers), a photo by
-- its storage_path or source_url. Re-importing an overlapping export updates
-- the same rows and restates the record's lines; it never adds a second copy.
--
-- Access: exactly the account rule the notes / photos already use
-- (kdh_can_access_account: a rep their assigned accounts, managers all).
-- Imports and the review queue are managers only. Saving here never touches
-- iSellBeer and never awards program credit.

-- ------------------------------------------------------------ photos: room for imported evidence
alter table public.account_photos alter column storage_path drop not null;
alter table public.account_photos add column if not exists source text not null default 'hub';
alter table public.account_photos add column if not exists source_url text;
alter table public.account_photos add column if not exists photo_kind text not null default 'original';
alter table public.account_photos add column if not exists photo_status text not null default 'stored';
alter table public.account_photos drop constraint if exists account_photos_source_check;
alter table public.account_photos add constraint account_photos_source_check check (source in ('hub', 'isellbeer'));
alter table public.account_photos drop constraint if exists account_photos_kind_check;
alter table public.account_photos add constraint account_photos_kind_check check (photo_kind in ('original', 'report_page'));
alter table public.account_photos drop constraint if exists account_photos_status_check;
alter table public.account_photos add constraint account_photos_status_check check (photo_status in ('stored', 'link', 'unavailable'));
alter table public.account_photos drop constraint if exists account_photos_path;
alter table public.account_photos add constraint account_photos_path
  check (storage_path is null or storage_path like customer_num || '/%');
alter table public.account_photos drop constraint if exists account_photos_has_file;
alter table public.account_photos add constraint account_photos_has_file
  check (storage_path is not null or source_url is not null);
alter table public.account_photos drop constraint if exists account_photos_category_check;
alter table public.account_photos add constraint account_photos_category_check
  check (category is null or category in ('display', 'window', 'cooler_door', 'tap_handle', 'menu', 'other'));
create unique index if not exists account_photos_source_url on public.account_photos (source_url) where source_url is not null;

-- ------------------------------------------------------------ import batches (managers only)
create table if not exists public.merch_import_batches (
  id          uuid primary key default gen_random_uuid(),
  source_file text not null,
  file_kind   text not null check (file_kind in ('display', 'tap_survey', 'promo', 'pdf')),
  filters     jsonb,                       -- the export's own "Values were filtered by" sheet
  period_from date,
  period_to   date,
  counts      jsonb,                       -- the reconciliation shown before commit
  created_by  text not null default public.kdh_caller_email(),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ records
create table if not exists public.merch_records (
  id            uuid primary key default gen_random_uuid(),
  customer_num  text not null,
  category      text not null check (category in ('display', 'window', 'cooler_door', 'tap_handle', 'menu', 'other')),
  subtype       text check (subtype is null or subtype in ('menu', 'cocktail_list', 'spirit_list', 'table_tent', 'cooler_door_wrap', 'tasting_event', 'other')),
  subtype_note  text check (subtype_note is null or length(subtype_note) <= 120),
  caption       text check (caption is null or length(caption) <= 500),
  location      text check (location is null or length(location) <= 120),   -- where in the account
  brands        text[] not null default '{}',                                 -- brand / product tags
  program_id    text check (program_id is null or length(program_id) <= 120),
  premise       text check (premise is null or premise in ('On', 'Off')),
  source        text not null check (source in ('hub', 'isellbeer')),
  source_kind   text check (source_kind is null or source_kind in ('display', 'tap_survey', 'promo')),
  source_key    text not null unique,
  source_ref    jsonb,                     -- original identifiers: file, row #s, Promo #s, photo link ids
  isb_promotion_type text,                 -- iSellBeer's own fields, kept as they were
  isb_theme     text,
  isb_elements  text,
  source_author text,                      -- iSellBeer photo taker (history only)
  source_author_role text,
  source_dm     text,
  source_rep    text,
  observed_at   timestamptz,               -- when the photo / survey was taken, when known
  created_at    timestamptz not null default now(),   -- saved in the Hub / imported
  updated_at    timestamptz not null default now(),
  author_email  text not null,             -- who saved / imported it here
  author_name   text,
  import_batch  uuid references public.merch_import_batches(id) on delete set null
);
create index if not exists merch_records_acct on public.merch_records (customer_num, observed_at desc nulls last);

create table if not exists public.merch_lines (
  id            bigint generated always as identity primary key,
  record_id     uuid not null references public.merch_records(id) on delete cascade,
  line_no       int not null,
  supplier      text,
  brand_family  text,
  brand         text,
  package       text,                      -- a package description ("24 PK"), NOT a product id
  product_num   text,                      -- a Kohler product # when one is known
  quantity      numeric,                   -- null = not recorded; 0 = recorded zero
  quantity_unit text check (quantity_unit is null or quantity_unit in ('cases', 'bottles', 'units', 'facings', 'placements', 'taps', 'unspecified')),
  ownership_source    text check (ownership_source is null or ownership_source in ('US', 'THEM')),
  ownership_corrected text check (ownership_corrected is null or ownership_corrected in ('US', 'THEM')),
  ownership_rule      text,
  source_line_ref text,                    -- e.g. "Promo # 3.2", "row 2"
  unique (record_id, line_no)
);

create table if not exists public.merch_record_photos (
  record_id uuid not null references public.merch_records(id) on delete cascade,
  photo_id  uuid not null references public.account_photos(id) on delete cascade,
  ord       int not null default 0,
  primary key (record_id, photo_id)
);

-- uncertain matches wait here; nothing is guessed
create table if not exists public.merch_review (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid references public.merch_import_batches(id) on delete cascade,
  kind         text not null check (kind in ('pdf_page', 'unknown_account', 'photo_unavailable', 'other')),
  customer_num text,
  storage_path text,                       -- an unmatched report-page image, when uploaded
  detail       jsonb,
  record_id    uuid references public.merch_records(id) on delete set null,
  resolved_at  timestamptz,
  resolved_by  text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------ RLS
alter table public.merch_import_batches enable row level security;
alter table public.merch_records enable row level security;
alter table public.merch_lines enable row level security;
alter table public.merch_record_photos enable row level security;
alter table public.merch_review enable row level security;

drop policy if exists "read records" on public.merch_records;
create policy "read records" on public.merch_records for select to authenticated
  using (public.kdh_can_access_account(customer_num));
drop policy if exists "read lines" on public.merch_lines;
create policy "read lines" on public.merch_lines for select to authenticated
  using (exists (select 1 from public.merch_records r where r.id = record_id and public.kdh_can_access_account(r.customer_num)));
drop policy if exists "read record photos" on public.merch_record_photos;
create policy "read record photos" on public.merch_record_photos for select to authenticated
  using (exists (select 1 from public.merch_records r where r.id = record_id and public.kdh_can_access_account(r.customer_num)));
drop policy if exists "managers read batches" on public.merch_import_batches;
create policy "managers read batches" on public.merch_import_batches for select to authenticated using (public.kdh_is_manager());
drop policy if exists "managers read review" on public.merch_review;
create policy "managers read review" on public.merch_review for select to authenticated using (public.kdh_is_manager());
-- labels on a hub record: its author only (the functions below do every insert)
drop policy if exists "author edits record" on public.merch_records;
create policy "author edits record" on public.merch_records for update to authenticated
  using (source = 'hub' and author_email = public.kdh_caller_email())
  with check (source = 'hub' and author_email = public.kdh_caller_email());
drop policy if exists "author removes record" on public.merch_records;
create policy "author removes record" on public.merch_records for delete to authenticated
  using (source = 'hub' and author_email = public.kdh_caller_email());
grant select on public.merch_records, public.merch_lines, public.merch_record_photos, public.merch_import_batches, public.merch_review to authenticated;
grant update (caption, location, brands, program_id, subtype, subtype_note, category) on public.merch_records to authenticated;
grant delete on public.merch_records to authenticated;

-- imported photos: managers may add rows for any account (the stamp trigger still
-- records who imported them); the existing "add account photos" policy covers it.

-- ------------------------------------------------------------ save a Hub record (rep or manager)
-- p: {key, customer_num, category, subtype, subtype_note, caption, location, brands[], program_id,
--     premise, observed_at, photos:[storage_path...], lines:[{supplier, brand_family, brand, package,
--     product_num, quantity, quantity_unit}]}
-- Retry-safe: the same key returns the record already saved (lines and links are restated).
create or replace function public.kdh_merch_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  acct text := trim(coalesce(p->>'customer_num', ''));
  k text := 'hub:' || coalesce(p->>'key', '');
  rid uuid; existed boolean; i int := 0; ln jsonb; ph text; pid uuid;
begin
  if me is null or me = '' then raise exception 'not signed in' using errcode = '42501'; end if;
  if coalesce(p->>'key', '') !~ '^[0-9a-f-]{16,64}$' then raise exception 'bad key'; end if;
  if not public.kdh_can_access_account(acct) then raise exception 'account not on your route' using errcode = '42501'; end if;
  select id into rid from public.merch_records where source_key = k;
  existed := rid is not null;
  if existed then
    if (select author_email from public.merch_records where id = rid) <> me then raise exception 'not your record' using errcode = '42501'; end if;
    update public.merch_records set category = p->>'category', subtype = nullif(p->>'subtype', ''), subtype_note = nullif(left(trim(coalesce(p->>'subtype_note', '')), 120), ''),
      caption = nullif(left(trim(coalesce(p->>'caption', '')), 500), ''), location = nullif(left(trim(coalesce(p->>'location', '')), 120), ''),
      brands = coalesce((select array_agg(left(trim(b), 120)) from jsonb_array_elements_text(coalesce(p->'brands', '[]'::jsonb)) b where trim(b) <> ''), '{}'),
      program_id = nullif(left(trim(coalesce(p->>'program_id', '')), 120), ''), updated_at = now()
     where id = rid;
  else
    insert into public.merch_records (customer_num, category, subtype, subtype_note, caption, location, brands, program_id, premise, source, source_key,
                                      observed_at, author_email, author_name)
    values (acct, p->>'category', nullif(p->>'subtype', ''), nullif(left(trim(coalesce(p->>'subtype_note', '')), 120), ''),
            nullif(left(trim(coalesce(p->>'caption', '')), 500), ''), nullif(left(trim(coalesce(p->>'location', '')), 120), ''),
            coalesce((select array_agg(left(trim(b), 120)) from jsonb_array_elements_text(coalesce(p->'brands', '[]'::jsonb)) b where trim(b) <> ''), '{}'),
            nullif(left(trim(coalesce(p->>'program_id', '')), 120), ''), nullif(p->>'premise', ''), 'hub', k,
            case when (p->>'observed_at') is not null and (p->>'observed_at')::timestamptz between now() - interval '5 years' and now() + interval '1 day'
                 then (p->>'observed_at')::timestamptz end,
            me, (select name from public.allowed_users where email = me))
    returning id into rid;
  end if;
  delete from public.merch_lines where record_id = rid;
  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    i := i + 1;
    insert into public.merch_lines (record_id, line_no, supplier, brand_family, brand, package, product_num, quantity, quantity_unit)
    values (rid, i, nullif(ln->>'supplier', ''), nullif(ln->>'brand_family', ''), nullif(ln->>'brand', ''), nullif(ln->>'package', ''), nullif(ln->>'product_num', ''),
            case when ln ? 'quantity' and ln->>'quantity' is not null and ln->>'quantity' <> '' then (ln->>'quantity')::numeric end,
            case when ln->>'quantity' is not null and ln->>'quantity' <> '' then coalesce(nullif(ln->>'quantity_unit', ''), 'unspecified') end);
  end loop;
  i := 0;
  for ph in select * from jsonb_array_elements_text(coalesce(p->'photos', '[]'::jsonb)) loop
    i := i + 1;
    select id into pid from public.account_photos where storage_path = ph and customer_num = acct;
    if pid is null then raise exception 'photo % is not saved yet', ph; end if;
    insert into public.merch_record_photos (record_id, photo_id, ord) values (rid, pid, i)
      on conflict (record_id, photo_id) do update set ord = excluded.ord;
  end loop;
  return jsonb_build_object('id', rid, 'existed', existed);
end $$;
revoke all on function public.kdh_merch_save(jsonb) from public;
grant execute on function public.kdh_merch_save(jsonb) to authenticated;

-- ------------------------------------------------------------ import a reconciled batch (managers only)
-- p: {batch:{source_file, file_kind, filters, period_from, period_to, counts},
--     records:[{source_key, source_kind, customer_num, category, subtype, caption, premise, observed_at,
--               isb_promotion_type, isb_theme, isb_elements, source_author, source_author_role, source_dm,
--               source_rep, source_ref, brands[], lines:[...], photos:[{source_url | storage_path,
--               photo_kind, photo_status}]}],
--     review:[{kind, customer_num, storage_path, detail}]}
-- Upserts by source_key; lines are restated (the export is the record's statement);
-- photos are found by source_url / storage_path before any is created.
create or replace function public.kdh_merch_import(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  bid uuid; r jsonb; ln jsonb; ph jsonb; rv jsonb; rid uuid; pid uuid; i int; j int;
  n_new int := 0; n_upd int := 0; n_lines int := 0; n_ph_new int := 0; n_ph_old int := 0; n_links int := 0; n_rev int := 0;
begin
  if not public.kdh_is_manager() then raise exception 'managers only' using errcode = '42501'; end if;
  insert into public.merch_import_batches (source_file, file_kind, filters, period_from, period_to, counts, created_by)
  values (left(coalesce(p->'batch'->>'source_file', '?'), 200), p->'batch'->>'file_kind', p->'batch'->'filters',
          nullif(p->'batch'->>'period_from', '')::date, nullif(p->'batch'->>'period_to', '')::date, p->'batch'->'counts', me)
  returning id into bid;
  for r in select * from jsonb_array_elements(coalesce(p->'records', '[]'::jsonb)) loop
    if coalesce(r->>'source_key', '') !~ '^isb:' then raise exception 'bad source_key %', r->>'source_key'; end if;
    select id into rid from public.merch_records where source_key = r->>'source_key';
    if rid is null then
      insert into public.merch_records (customer_num, category, subtype, caption, premise, source, source_kind, source_key, source_ref,
        isb_promotion_type, isb_theme, isb_elements, source_author, source_author_role, source_dm, source_rep, brands, observed_at,
        author_email, author_name, import_batch)
      values (trim(r->>'customer_num'), r->>'category', nullif(r->>'subtype', ''), nullif(r->>'caption', ''), nullif(r->>'premise', ''),
        'isellbeer', r->>'source_kind', r->>'source_key', r->'source_ref', nullif(r->>'isb_promotion_type', ''), nullif(r->>'isb_theme', ''),
        nullif(r->>'isb_elements', ''), nullif(r->>'source_author', ''), nullif(r->>'source_author_role', ''), nullif(r->>'source_dm', ''),
        nullif(r->>'source_rep', ''),
        coalesce((select array_agg(b) from jsonb_array_elements_text(coalesce(r->'brands', '[]'::jsonb)) b), '{}'),
        nullif(r->>'observed_at', '')::timestamptz, me, (select name from public.allowed_users where email = me), bid)
      returning id into rid;
      n_new := n_new + 1;
    else
      update public.merch_records set category = r->>'category', subtype = nullif(r->>'subtype', ''), source_ref = r->'source_ref',
        isb_promotion_type = nullif(r->>'isb_promotion_type', ''), isb_theme = nullif(r->>'isb_theme', ''), isb_elements = nullif(r->>'isb_elements', ''),
        source_author = nullif(r->>'source_author', ''), source_author_role = nullif(r->>'source_author_role', ''),
        source_dm = nullif(r->>'source_dm', ''), source_rep = nullif(r->>'source_rep', ''),
        brands = coalesce((select array_agg(b) from jsonb_array_elements_text(coalesce(r->'brands', '[]'::jsonb)) b), '{}'),
        observed_at = nullif(r->>'observed_at', '')::timestamptz, import_batch = bid, updated_at = now()
      where id = rid;
      n_upd := n_upd + 1;
    end if;
    delete from public.merch_lines where record_id = rid;
    i := 0;
    for ln in select * from jsonb_array_elements(coalesce(r->'lines', '[]'::jsonb)) loop
      i := i + 1;
      insert into public.merch_lines (record_id, line_no, supplier, brand_family, brand, package, quantity, quantity_unit,
                                      ownership_source, ownership_corrected, ownership_rule, source_line_ref)
      values (rid, i, nullif(ln->>'supplier', ''), nullif(ln->>'brand_family', ''), nullif(ln->>'brand', ''), nullif(ln->>'package', ''),
              case when ln->>'quantity' is not null and ln->>'quantity' <> '' then (ln->>'quantity')::numeric end,
              nullif(ln->>'quantity_unit', ''), nullif(ln->>'ownership_source', ''), nullif(ln->>'ownership_corrected', ''),
              nullif(ln->>'ownership_rule', ''), nullif(ln->>'source_line_ref', ''));
      n_lines := n_lines + 1;
    end loop;
    j := 0;
    for ph in select * from jsonb_array_elements(coalesce(r->'photos', '[]'::jsonb)) loop
      j := j + 1; pid := null;
      if ph->>'source_url' is not null then select id into pid from public.account_photos where source_url = ph->>'source_url'; end if;
      if pid is null and ph->>'storage_path' is not null then select id into pid from public.account_photos where storage_path = ph->>'storage_path'; end if;
      if pid is null then
        insert into public.account_photos (customer_num, category, premise, storage_path, source_url, source, photo_kind, photo_status, captured_at, author_email)
        values (trim(r->>'customer_num'), r->>'category', nullif(r->>'premise', ''), nullif(ph->>'storage_path', ''), nullif(ph->>'source_url', ''), 'isellbeer',
                coalesce(nullif(ph->>'photo_kind', ''), 'original'), coalesce(nullif(ph->>'photo_status', ''), 'link'),
                nullif(r->>'observed_at', '')::timestamptz, me)
        returning id into pid;
        n_ph_new := n_ph_new + 1;
      else
        n_ph_old := n_ph_old + 1;
      end if;
      insert into public.merch_record_photos (record_id, photo_id, ord) values (rid, pid, j)
        on conflict (record_id, photo_id) do nothing;
      n_links := n_links + 1;
    end loop;
  end loop;
  for rv in select * from jsonb_array_elements(coalesce(p->'review', '[]'::jsonb)) loop
    insert into public.merch_review (batch_id, kind, customer_num, storage_path, detail)
    values (bid, rv->>'kind', nullif(rv->>'customer_num', ''), nullif(rv->>'storage_path', ''), rv->'detail');
    n_rev := n_rev + 1;
  end loop;
  return jsonb_build_object('batch', bid, 'records_new', n_new, 'records_updated', n_upd, 'lines', n_lines,
                            'photos_new', n_ph_new, 'photos_existing', n_ph_old, 'photo_links', n_links, 'review', n_rev);
end $$;
revoke all on function public.kdh_merch_import(jsonb) from public;
grant execute on function public.kdh_merch_import(jsonb) to authenticated;

-- ------------------------------------------------------------ attach a reviewed report page to a record (managers)
-- An unmatched page waits under _review/ in the bucket. When a manager matches it,
-- the page re-uploads the image under the record's account folder (p_path, so a rep
-- with that account can open it) and calls this to file it. Nothing is matched by
-- page order.
create or replace function public.kdh_merch_resolve(p_review uuid, p_record uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rv public.merch_review; rec public.merch_records; pid uuid;
begin
  if not public.kdh_is_manager() then raise exception 'managers only' using errcode = '42501'; end if;
  select * into rv from public.merch_review where id = p_review;
  select * into rec from public.merch_records where id = p_record;
  if rv.id is null or rec.id is null then raise exception 'not found'; end if;
  if p_path is null or p_path not like rec.customer_num || '/%' then
    raise exception 'the page image must be filed under account %', rec.customer_num;
  end if;
  select id into pid from public.account_photos where storage_path = p_path;
  if pid is null then
    insert into public.account_photos (customer_num, category, premise, storage_path, source, photo_kind, photo_status, captured_at, author_email)
    values (rec.customer_num, rec.category, rec.premise, p_path, 'isellbeer', 'report_page', 'stored', rec.observed_at, public.kdh_caller_email())
    returning id into pid;
  end if;
  insert into public.merch_record_photos (record_id, photo_id, ord) values (rec.id, pid, 99) on conflict do nothing;
  update public.merch_review set record_id = rec.id, resolved_at = now(), resolved_by = public.kdh_caller_email() where id = rv.id;
  return jsonb_build_object('photo', pid, 'record', rec.id);
end $$;
drop function if exists public.kdh_merch_resolve(uuid, uuid);
revoke all on function public.kdh_merch_resolve(uuid, uuid, text) from public;
grant execute on function public.kdh_merch_resolve(uuid, uuid, text) to authenticated;
