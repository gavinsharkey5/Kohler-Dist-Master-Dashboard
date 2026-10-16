-- iSELLBEER PHOTO PDFs ATTACH TO RECORDS ALREADY IMPORTED (2026-10-05).
-- Run AFTER 20261004090000_merchandising.sql. Idempotent: safe to run more than once.
--
-- Every page of an iSellBeer photo PDF carries a clickable link to its photo
-- ("view-photo/<type>/<photo id>"), the same link the export's Photo cell holds.
-- The import page reads that link, so a page is matched to its record by the
-- photo itself -- never by page order -- and the page's image becomes that
-- photo's stored copy, labelled a REPORT PAGE (iSellBeer's printed frame -- date,
-- account, caption, author -- around the photo; not the original file), so the
-- record shows a picture in the Hub without opening iSellBeer.
--
-- The spreadsheet and the PDF can be imported in different sittings, and the
-- PDF in several parts: this function fills in the stored copy of photos that
-- an earlier import already created as links. It never creates a photo, never
-- moves one to another account and never replaces a copy already stored.
--
-- The relabel trigger (20261003090000_photo_labels.sql) freezes storage_path on every
-- update so a relabel can never move a photo. It is redefined here with ONE exception:
-- a photo with NO stored copy (an imported link) may receive one, and only under its
-- own account's folder. A stored path still never changes.
create or replace function public.account_photos_relabel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id           := old.id;
  new.customer_num := old.customer_num;
  if old.storage_path is not null or new.storage_path is null or new.storage_path not like old.customer_num || '/%' then
    new.storage_path := old.storage_path;
  end if;
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

-- p: {items:[{source_url, storage_path}]}   storage_path must sit under the photo's own account folder
create or replace function public.kdh_merch_attach_photos(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; ph public.account_photos; n_st int := 0; n_old int := 0; n_missing int := 0; n_bad int := 0;
begin
  if not public.kdh_is_manager() then raise exception 'managers only' using errcode = '42501'; end if;
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    ph := null;
    select * into ph from public.account_photos where source_url = it->>'source_url';
    if ph.id is null then n_missing := n_missing + 1;
    elsif ph.storage_path is not null then n_old := n_old + 1;
    elsif coalesce(it->>'storage_path', '') not like ph.customer_num || '/%' then n_bad := n_bad + 1;
    else
      update public.account_photos set storage_path = it->>'storage_path', photo_status = 'stored', photo_kind = 'report_page' where id = ph.id;
      n_st := n_st + 1;
    end if;
  end loop;
  return jsonb_build_object('stored', n_st, 'already_stored', n_old, 'not_in_hub', n_missing, 'wrong_account', n_bad);
end $$;
revoke all on function public.kdh_merch_attach_photos(jsonb) from public;
grant execute on function public.kdh_merch_attach_photos(jsonb) to authenticated;
