-- TAP LINES: OURS vs THEIRS (2026-10-05). Run AFTER 20261004090000_merchandising.sql.
-- Idempotent: safe to run more than once.
--
-- A rep capturing Tap Handles in the Hub now labels each tap line US (ours) or
-- THEM (theirs). The label comes from Kohler's territory rulebook -- the same
-- workbook and steps the Tap Tracker's audit uses (shared/data/tap-rules.json,
-- built by isellbeer/tap-survey-tracking/build_tap_rules.py) -- and only for a
-- brand the rulebook does not cover does the rep choose. merch_lines already
-- has ownership_source / ownership_rule (the iSellBeer import uses them); this
-- redefines kdh_merch_save so Hub lines store them too. The function is
-- otherwise identical to 20261004090000_merchandising.sql.
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
    -- a tap line carries Ours / Theirs: 'territory' = from Kohler's territory list (shared/data/tap-rules.json),
    -- 'rep' = the rep's call for a brand the list does not cover. Anything else is dropped, never guessed.
    insert into public.merch_lines (record_id, line_no, supplier, brand_family, brand, package, product_num, quantity, quantity_unit,
                                    ownership_source, ownership_rule)
    values (rid, i, nullif(ln->>'supplier', ''), nullif(ln->>'brand_family', ''), nullif(ln->>'brand', ''), nullif(ln->>'package', ''), nullif(ln->>'product_num', ''),
            case when ln ? 'quantity' and ln->>'quantity' is not null and ln->>'quantity' <> '' then (ln->>'quantity')::numeric end,
            case when ln->>'quantity' is not null and ln->>'quantity' <> '' then coalesce(nullif(ln->>'quantity_unit', ''), 'unspecified') end,
            case when ln->>'ownership_source' in ('US', 'THEM') and ln->>'ownership_rule' in ('territory', 'rep') then ln->>'ownership_source' end,
            case when ln->>'ownership_source' in ('US', 'THEM') and ln->>'ownership_rule' in ('territory', 'rep') then ln->>'ownership_rule' end);
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
