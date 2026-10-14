-- Kohler Dist Hub: HYBRID managers (2026-10-14, Gavin: "Chris McCrohan is a
-- hybrid brand manager and on-premise manager -- allow him to also see his
-- team of reps").
--
-- A manager can be BOTH a district manager (reps report to them through
-- allowed_users.reports_to) and a brand manager (allowed_users.program_brands).
-- Before this file, kdh_program_scope returned both lists and every reader
-- took the INTERSECTION: their team, but only their brand's products -- so a
-- DM who also carries Red Bull lost every other supplier for his own reps.
--
-- Now kdh_program_scope marks that case `hybrid: true` (team and brands both
-- present) and kdh_program_scope_problem reads it as a UNION: a program is
-- inside a hybrid manager's scope when EITHER every participant is on their
-- team (any supplier) OR every product belongs to their brands (any rep).
-- The pages (nonbuy/source-static.js, manage-programs/manage.js) treat a
-- hybrid as a team manager with every supplier, and the Hub / MPO trackers
-- already give a DM their team across every supplier.
--
-- Idempotent; run after 20261008120000_manage_programs.sql and
-- 20261008200000_program_suppliers.sql (it redefines both functions with
-- the same signatures).

create or replace function public.kdh_program_scope()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me record; team text[]; brands text[];
begin
  select * into me from public.allowed_users where email = public.kdh_caller_email();
  if me is null or me.role <> 'manager' then
    return jsonb_build_object('manager', false, 'admin', false, 'team', '[]'::jsonb, 'brands', '[]'::jsonb, 'hybrid', false);
  end if;
  if me.program_admin then
    return jsonb_build_object('manager', true, 'admin', true, 'team', null, 'brands', null, 'hybrid', false, 'name', me.name);
  end if;
  select array_agg(n) into team from public.kdh_reports_under(me.name) n;
  brands := me.program_brands;
  return jsonb_build_object(
    'manager', true, 'admin', false, 'name', me.name,
    'hybrid', team is not null and brands is not null,                        -- a DM who also carries a brand
    'team',   case when team is null and brands is not null then null            -- brand manager: any rep
                   when team is null then '[]'::jsonb else to_jsonb(team) end,
    'brands', case when brands is null and team is not null then null            -- district manager: any supplier
                   when brands is null then '[]'::jsonb else to_jsonb(brands) end);
end $$;
revoke all on function public.kdh_program_scope() from public;
grant execute on function public.kdh_program_scope() to authenticated;

create or replace function public.kdh_program_scope_problem(def jsonb)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  sc jsonb := public.kdh_program_scope();
  team text[]; brands text[]; names text[]; bad text[]; bad_b text[]; pids text[]; sups text[]; n int;
  hybrid boolean := coalesce((sc->>'hybrid')::boolean, false);
  team_ok boolean; brand_ok boolean;
begin
  select array_agg(p->>'id') into pids from jsonb_array_elements(coalesce(def #> '{products,resolved}', '[]'::jsonb)) p;
  -- consistency rule for everyone (the approver included): products must belong to the chosen suppliers
  if jsonb_typeof(def->'suppliers') = 'array' and jsonb_array_length(def->'suppliers') > 0
     and pids is not null and array_length(pids, 1) > 0 then
    select array_agg(x) into sups from jsonb_array_elements_text(def->'suppliers') x;
    select count(*) into n from public.product_master;
    if n > 0 then
      select array_agg(distinct coalesce(m.supplier, '(unknown)')) into bad
        from unnest(pids) id left join public.product_master m on m.product_num = id
        where m.product_num is null or not (lower(coalesce(m.supplier, '')) = any (select lower(b) from unnest(sups) b));
      if bad is not null then return 'Outside the selected suppliers: ' || array_to_string(bad, ', '); end if;
    end if;
  end if;
  if (sc->>'admin')::boolean then return null; end if;
  if not (sc->>'manager')::boolean then return 'Only a manager can build programs.'; end if;
  select array_agg(x) into names from (
    select jsonb_array_elements_text(coalesce(def #> '{participants,resolved,reps}', '[]'::jsonb)) x
    union all
    select jsonb_array_elements_text(coalesce(def #> '{participants,resolved,associates}', '[]'::jsonb)) x) s;

  -- HYBRID (team AND brands): a union, not an intersection
  if hybrid then
    select array_agg(x) into team from jsonb_array_elements_text(sc->'team') x;
    select array_agg(x) into brands from jsonb_array_elements_text(sc->'brands') x;
    team_ok := names is null or array_length(names, 1) is null;
    if not team_ok then
      select array_agg(x) into bad from unnest(names) x
        where not exists (select 1 from unnest(coalesce(team, '{}')) t where public.kdh_name_key(t) = public.kdh_name_key(x));
      team_ok := bad is null;
    end if;
    brand_ok := pids is null or array_length(pids, 1) is null;
    if not brand_ok then
      select count(*) into n from public.product_master;
      if n = 0 then
        brand_ok := false;                                   -- cannot be checked: the team rule must carry it
      else
        select array_agg(distinct coalesce(m.supplier, '(unknown)')) into bad_b
          from unnest(pids) id left join public.product_master m on m.product_num = id
          where m.product_num is null or not (lower(coalesce(m.supplier, '')) = any (select lower(b) from unnest(brands) b));
        brand_ok := bad_b is null;
      end if;
    end if;
    if team_ok or brand_ok then return null; end if;
    return 'You cover a team and a brand, so a program must be either for your team with any supplier, or for your brands ('
      || array_to_string(coalesce(brands, '{}'), ', ') || ') with any rep. This one has reps outside your team ('
      || array_to_string(coalesce(bad, '{}'), ', ') || ') and products outside your brands ('
      || array_to_string(coalesce(bad_b, '{}'), ', ') || ').';
  end if;

  if names is not null and array_length(names, 1) > 0 and sc->'team' <> 'null'::jsonb then
    select array_agg(x) into team from jsonb_array_elements_text(sc->'team') x;
    select array_agg(x) into bad from unnest(names) x
      where not exists (select 1 from unnest(coalesce(team, '{}')) t where public.kdh_name_key(t) = public.kdh_name_key(x));
    if bad is not null then
      return case when coalesce(array_length(team, 1), 0) = 0
        then 'You have no team or brand assignment on file, so you cannot submit a program with participants. Ask Gavin to set it.'
        else 'Not on your team: ' || array_to_string(bad, ', ') end;
    end if;
  end if;
  if pids is not null and array_length(pids, 1) > 0 and sc->'brands' <> 'null'::jsonb then
    select array_agg(x) into brands from jsonb_array_elements_text(sc->'brands') x;
    if coalesce(array_length(brands, 1), 0) = 0 then
      return 'You have no brand or team assignment on file, so you cannot submit a program with products. Ask Gavin to set it.';
    end if;
    select count(*) into n from public.product_master;
    if n = 0 then return 'The product master is not loaded yet, so brand scope cannot be checked. Ask Gavin to load supabase/seed/product_master.sql.'; end if;
    select array_agg(distinct coalesce(m.supplier, '(unknown)')) into bad
      from unnest(pids) id left join public.product_master m on m.product_num = id
      where m.product_num is null or not (lower(coalesce(m.supplier, '')) = any (select lower(b) from unnest(brands) b));
    if bad is not null then return 'Outside your brands: ' || array_to_string(bad, ', '); end if;
  end if;
  return null;
end $$;
revoke all on function public.kdh_program_scope_problem(jsonb) from public;
grant execute on function public.kdh_program_scope_problem(jsonb) to authenticated;
