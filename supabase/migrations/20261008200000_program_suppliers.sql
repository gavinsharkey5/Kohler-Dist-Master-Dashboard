-- Manage Programs v3 (2026-10-08): products must belong to the suppliers chosen in Basics.
-- kdh_program_scope_problem is redefined to refuse a definition whose resolved products
-- fall outside definition.suppliers (checked for everyone, the approver included -- it is
-- a consistency rule, not a permission), before the existing team and brand-scope checks.
-- Idempotent; run after 20261008120000_manage_programs.sql.
create or replace function public.kdh_program_scope_problem(def jsonb)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  sc jsonb := public.kdh_program_scope();
  team text[]; brands text[]; names text[]; bad text[]; pids text[]; sups text[]; n int;
begin
  select array_agg(p->>'id') into pids from jsonb_array_elements(coalesce(def #> '{products,resolved}', '[]'::jsonb)) p;
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
