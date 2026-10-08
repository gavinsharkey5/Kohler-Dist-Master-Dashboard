-- Non-Buy Reports (2026-10-08): saved templates, dated report snapshots and
-- explicitly shared target lists. Idempotent; run after
-- 20261002120000_account_notes_photos.sql (kdh_name_key) and
-- 20261008120000_manage_programs.sql (kdh_program_scope, the manager scope the
-- page uses). The CALCULATION runs in the browser from the per-rep sales
-- history the middleware already serves; this table only keeps what a person
-- saved. Rules:
--   * a row belongs to the sign-in that saved it (owner_email from the token,
--     never from the page); a manager or a rep may save; nobody reads another
--     person's rows directly;
--   * a target list is a report whose shared_reps names the reps it is shared
--     with -- EXPLICIT sharing only; a rep reads it through kdh_nonbuy_shared,
--     which hands back ONLY that rep's own subset of the snapshot (the manager's
--     other reps never reach a rep's browser);
--   * a rep can never share (shared_reps is forced empty) and can only save a
--     snapshot of their own results (snapshot.byRep must hold only their name).
create table if not exists public.nonbuy_reports (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('template', 'report', 'target')),
  name          text not null check (length(btrim(name)) between 1 and 120),
  owner_email   text not null,
  owner_name    text,
  criteria      jsonb not null default '{}'::jsonb,
  period        jsonb,
  coverage      jsonb,
  rule_version  text,
  counts        jsonb,
  snapshot      jsonb,
  shared_reps   text[] not null default '{}',
  run_at        timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists nonbuy_reports_owner_idx on public.nonbuy_reports (owner_email, updated_at desc);
create index if not exists nonbuy_reports_shared_idx on public.nonbuy_reports using gin (shared_reps);
alter table public.nonbuy_reports enable row level security;

-- read / delete: own rows only (managers and reps alike)
drop policy if exists "nonbuy own rows" on public.nonbuy_reports;
create policy "nonbuy own rows" on public.nonbuy_reports for select to authenticated
  using (owner_email = public.kdh_caller_email());
drop policy if exists "nonbuy delete own" on public.nonbuy_reports;
create policy "nonbuy delete own" on public.nonbuy_reports for delete to authenticated
  using (owner_email = public.kdh_caller_email());
-- writes go through kdh_nonbuy_save (security definer) so the owner and the rep
-- limits are enforced in one place; no direct insert / update policy
grant select, delete on public.nonbuy_reports to authenticated;

-- save (insert or update own): p = {id?, kind, name, criteria, period, coverage, rule_version, counts, snapshot, shared_reps, run_at}
create or replace function public.kdh_nonbuy_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me record; rid uuid; shared text[]; snap jsonb; k text; mykey text; v_kind text;
begin
  select * into me from public.allowed_users where email = public.kdh_caller_email();
  if me is null then raise exception 'Not on the allow list.'; end if;
  v_kind := coalesce(p->>'kind', 'report');
  if v_kind not in ('template', 'report', 'target') then raise exception 'Unknown kind %', v_kind; end if;
  snap := p->'snapshot';
  if me.role = 'manager' then
    select array_agg(x) into shared from jsonb_array_elements_text(coalesce(p->'shared_reps', '[]'::jsonb)) x;
    shared := coalesce(shared, '{}');
    if v_kind = 'target' and coalesce(array_length(shared, 1), 0) = 0 then raise exception 'A target list must name the reps it is shared with.'; end if;
  else
    -- a rep saves only their own results and never shares
    shared := '{}';
    if v_kind = 'target' then raise exception 'Only a manager can share a target list.'; end if;
    mykey := public.kdh_name_key(me.name);
    if snap is not null and jsonb_typeof(snap->'byRep') = 'object' then
      for k in select jsonb_object_keys(snap->'byRep') loop
        if public.kdh_name_key(k) <> mykey then raise exception 'A rep can only save their own results.'; end if;
      end loop;
    end if;
  end if;
  rid := nullif(p->>'id', '')::uuid;
  if rid is not null then
    update public.nonbuy_reports set kind = v_kind, name = btrim(p->>'name'), criteria = coalesce(p->'criteria', '{}'::jsonb), period = p->'period',
      coverage = p->'coverage', rule_version = p->>'rule_version', counts = p->'counts', snapshot = snap, shared_reps = shared,
      run_at = nullif(p->>'run_at', '')::timestamptz, updated_at = now()
      where id = rid and owner_email = me.email;
    if not found then raise exception 'Not yours to change.'; end if;
  else
    insert into public.nonbuy_reports (kind, name, owner_email, owner_name, criteria, period, coverage, rule_version, counts, snapshot, shared_reps, run_at)
      values (v_kind, btrim(p->>'name'), me.email, me.name, coalesce(p->'criteria', '{}'::jsonb), p->'period', p->'coverage', p->>'rule_version', p->'counts', snap, shared, nullif(p->>'run_at', '')::timestamptz)
      returning id into rid;
  end if;
  return jsonb_build_object('id', rid, 'kind', v_kind);
end $$;
revoke all on function public.kdh_nonbuy_save(jsonb) from public;
grant execute on function public.kdh_nonbuy_save(jsonb) to authenticated;

-- target lists shared with a rep: ONLY that rep's subset of each snapshot.
-- A rep gets their own lists (p_rep ignored); a manager may ask for any rep's
-- view (preview), which is still that rep's subset only.
create or replace function public.kdh_nonbuy_shared(p_rep text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me record; who text; k text; out jsonb := '[]'::jsonb; r record; sub jsonb; repname text;
begin
  select * into me from public.allowed_users where email = public.kdh_caller_email();
  if me is null then return '[]'::jsonb; end if;
  who := case when me.role = 'manager' and coalesce(p_rep, '') <> '' then p_rep else me.name end;
  k := public.kdh_name_key(who);
  for r in select * from public.nonbuy_reports t where t.kind = 'target'
             and exists (select 1 from unnest(t.shared_reps) s where public.kdh_name_key(s) = k)
           order by t.run_at desc nulls last, t.updated_at desc loop
    sub := null; repname := null;
    if r.snapshot is not null and jsonb_typeof(r.snapshot->'byRep') = 'object' then
      select key into repname from jsonb_each(r.snapshot->'byRep') where public.kdh_name_key(key) = k limit 1;
      if repname is not null then sub := r.snapshot->'byRep'->repname; end if;
    end if;
    out := out || jsonb_build_object('id', r.id, 'name', r.name, 'owner_name', r.owner_name, 'criteria', r.criteria, 'period', r.period, 'coverage', r.coverage,
      'rule_version', r.rule_version, 'run_at', r.run_at, 'rep', coalesce(repname, who), 'rows', coalesce(sub, '[]'::jsonb),
      'products', coalesce(r.snapshot->'products', '[]'::jsonb), 'type', r.snapshot->>'type');
  end loop;
  return out;
end $$;
revoke all on function public.kdh_nonbuy_shared(text) from public;
grant execute on function public.kdh_nonbuy_shared(text) to authenticated;
