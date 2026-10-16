-- MANAGE PROGRAMS v2 (2026-10-08): recoverable Delete Program. Run AFTER
-- 20261008120000_manage_programs.sql. Idempotent.
--
-- A deleted program is MOVED to status 'deleted' (never destroyed): its
-- versions, finance, history, closeout and notices stay. It leaves every
-- ordinary list, the approval queue and every participant view
-- (kdh_my_programs lists approved / closed only). Restore puts it back WITHOUT
-- publishing: a program that was live comes back as an unpublished draft
-- that keeps its approved version; only the approver can publish it again
-- (kdh_program_republish). While deleted, nothing can edit, submit, approve,
-- close out or archive it (kdh_program_can_edit is false and a trigger
-- refuses any other status change until it is restored).
--
-- WHO: the owner / a manager whose scope covers the program may delete a
-- DRAFT or TEST program; a published (approved, scheduled, active, ended,
-- closed) real program is the approver's to delete and to restore.

alter table public.programs drop constraint if exists programs_status_check;
alter table public.programs add constraint programs_status_check
  check (status in ('draft', 'submitted', 'returned', 'approved', 'closed', 'archived', 'deleted'));
alter table public.programs add column if not exists deleted_at   timestamptz;
alter table public.programs add column if not exists deleted_by   text;
alter table public.programs add column if not exists deleted_from text;
alter table public.programs add column if not exists restored_at  timestamptz;

-- the old can_edit logic, without the deleted gate (delete / restore need it)
create or replace function public.kdh_program_may_manage(p_program uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare pr record; v jsonb;
begin
  select * into pr from public.programs where id = p_program;
  if pr is null then return false; end if;
  if public.kdh_is_program_admin() then return true; end if;
  if not public.kdh_is_manager() then return false; end if;
  if pr.owner_email = public.kdh_caller_email() then return true; end if;
  select definition into v from public.program_versions where program_id = p_program order by version desc limit 1;
  return v is not null and public.kdh_program_scope_problem(v) is null
     and (select coalesce(jsonb_array_length(v #> '{participants,resolved,reps}'), 0)
            + coalesce(jsonb_array_length(v #> '{participants,resolved,associates}'), 0)) > 0;
end $$;
revoke all on function public.kdh_program_may_manage(uuid) from public;
grant execute on function public.kdh_program_may_manage(uuid) to authenticated;

-- a deleted program cannot be edited, submitted, withdrawn or archived
create or replace function public.kdh_program_can_edit(p_program uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.kdh_program_may_manage(p_program)
     and exists (select 1 from public.programs where id = p_program and status <> 'deleted');
$$;

-- no status change leaves 'deleted' except through kdh_program_restore
create or replace function public.kdh_programs_guard_deleted()
returns trigger language plpgsql as $$
begin
  if old.status = 'deleted' and new.status <> 'deleted'
     and coalesce(current_setting('kdh.restoring', true), '') <> '1' then
    raise exception 'this program is deleted; restore it first' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists programs_guard_deleted on public.programs;
create trigger programs_guard_deleted before update on public.programs
  for each row execute function public.kdh_programs_guard_deleted();

create or replace function public.kdh_program_delete(p_program uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pr record;
begin
  select * into pr from public.programs where id = p_program;
  if pr is null then raise exception 'no such program'; end if;
  if pr.status = 'deleted' then return; end if;
  if not public.kdh_program_may_manage(p_program) then raise exception 'not yours to delete' using errcode = '42501'; end if;
  if (pr.approved_version is not null or pr.status in ('approved', 'closed')) and not pr.is_test and not public.kdh_is_program_admin() then
    raise exception 'only the program approver can delete a published program' using errcode = '42501';
  end if;
  update public.programs set status = 'deleted', deleted_at = now(), deleted_by = public.kdh_caller_email(),
         deleted_from = pr.status, updated_at = now()
   where id = p_program;
  perform public.kdh_program_log(p_program, pr.approved_version, 'deleted',
    jsonb_build_object('from', pr.status, 'published', pr.approved_version is not null, 'note', p_note));
end $$;
revoke all on function public.kdh_program_delete(uuid, text) from public;
grant execute on function public.kdh_program_delete(uuid, text) to authenticated;

-- Restore = back from the Deleted list, never republished: a draft comes back
-- as it was (a submitted one as a draft, so it must be resubmitted); a program
-- that had been live comes back as an unpublished draft that keeps its approved
-- version until the approver publishes it again.
create or replace function public.kdh_program_restore(p_program uuid)
returns text language plpgsql security definer set search_path = public as $$
declare pr record; target text;
begin
  select * into pr from public.programs where id = p_program;
  if pr is null then raise exception 'no such program'; end if;
  if pr.status <> 'deleted' then raise exception 'this program is not deleted'; end if;
  if not public.kdh_program_may_manage(p_program) then raise exception 'not yours to restore' using errcode = '42501'; end if;
  if pr.approved_version is not null and not pr.is_test and not public.kdh_is_program_admin() then
    raise exception 'only the program approver can restore a published program' using errcode = '42501';
  end if;
  target := case when pr.deleted_from in ('draft', 'returned') then pr.deleted_from else 'draft' end;
  if pr.deleted_from = 'submitted' then
    update public.program_versions set status = 'draft' where program_id = p_program and status = 'submitted';
  end if;
  perform set_config('kdh.restoring', '1', true);
  update public.programs set status = target, restored_at = now(), updated_at = now() where id = p_program;
  perform set_config('kdh.restoring', '0', true);
  perform public.kdh_program_log(p_program, pr.approved_version, 'restored',
    jsonb_build_object('from', pr.deleted_from, 'to', target, 'published', false));
  return target;
end $$;
revoke all on function public.kdh_program_restore(uuid) from public;
grant execute on function public.kdh_program_restore(uuid) to authenticated;

-- approver only: put a restored program's approved version back in front of
-- its participants (closed stays closed). Never automatic.
create or replace function public.kdh_program_republish(p_program uuid)
returns text language plpgsql security definer set search_path = public as $$
declare pr record; target text; def jsonb;
begin
  if not public.kdh_is_program_admin() then raise exception 'only the program approver can publish' using errcode = '42501'; end if;
  select * into pr from public.programs where id = p_program;
  if pr is null then raise exception 'no such program'; end if;
  if pr.status = 'deleted' then raise exception 'restore it first'; end if;
  if pr.approved_version is null then raise exception 'nothing approved to publish'; end if;
  if pr.status in ('approved', 'closed') then return pr.status; end if;
  if exists (select 1 from public.program_versions where program_id = p_program and status = 'submitted') then
    raise exception 'a newer version is awaiting approval; approve or return it instead';
  end if;
  target := case when exists (select 1 from public.program_closeouts where program_id = p_program) then 'closed' else 'approved' end;
  update public.programs set status = target, updated_at = now() where id = p_program;
  select definition into def from public.program_versions where program_id = p_program and version = pr.approved_version;
  insert into public.program_notices (program_id, version, kind, summary, participants, is_test)
    values (p_program, pr.approved_version, 'updated', pr.title || ' is available again', public.kdh_program_participant_keys(def), pr.is_test);
  perform public.kdh_program_log(p_program, pr.approved_version, 'republished', jsonb_build_object('status', target));
  return target;
end $$;
revoke all on function public.kdh_program_republish(uuid) from public;
grant execute on function public.kdh_program_republish(uuid) to authenticated;

-- a deleted program never reaches a participant (defensive: the status filter already excludes it)
create or replace function public.kdh_my_program_notices(p_rep text default null)
returns table (id uuid, program_id uuid, kind text, summary text, created_at timestamptz, is_test boolean)
language plpgsql stable security definer set search_path = public as $$
declare k text; mgr boolean := public.kdh_is_manager();
begin
  if p_rep is not null and p_rep <> '' then
    if not mgr then raise exception 'managers only' using errcode = '42501'; end if;
    k := public.kdh_name_key(p_rep);
  else
    k := public.kdh_my_key();
  end if;
  if coalesce(k, '') = '' then return; end if;
  return query
    select n.id, n.program_id, n.kind, n.summary, n.created_at, n.is_test
    from public.program_notices n
    join public.programs pr on pr.id = n.program_id
    where k = any (n.participants)
      and pr.status in ('approved', 'closed')
      and (not n.is_test or (mgr and p_rep is not null))
      and n.created_at > now() - interval '45 days'
      and not exists (select 1 from public.program_notice_reads r where r.notice_id = n.id and r.email = public.kdh_caller_email())
    order by n.created_at desc;
end $$;
