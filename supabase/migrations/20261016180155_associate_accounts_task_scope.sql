begin;

-- Associates may document any known customer; other roles keep their existing scope.
-- Reuse the existing private assignment lookup and its grants.
create or replace function public.kdh_can_access_account(n text)
returns boolean language sql stable security definer set search_path = '' as $$
 select public.kdh_is_manager()
 or exists(select 1 from public.account_assignments a where a.customer_num=trim(n)
   and ((auth.uid() is not null and public.kdh_caller_role()='associate')
        or (a.rep_key=public.kdh_my_key() and a.rep_key<>'')));
$$;
revoke all on function public.kdh_can_access_account(text) from public,anon;
grant execute on function public.kdh_can_access_account(text) to authenticated;

-- Reps and managers can delegate to any sales associate. Rep destinations stay team scoped.
create or replace function kdh_work.can_assign(person text) returns boolean
language sql stable security definer set search_path = '' as $$
 select kdh_work.employee() and exists(select 1 from public.allowed_users u
 where u.email=person and coalesce(to_jsonb(u)->>'workspace','')<>'finance'
 and u.role in ('rep','associate','manager')
 and (person=public.kdh_caller_email() or kdh_work.supervises(person)
      or (public.kdh_caller_role() in ('rep','manager') and u.role='associate')));
$$;

-- Task supervision follows the task's rep, or an assigned rep on the manager's
-- reporting team. Sharing an associate with another rep does not expose their work.
create or replace function kdh_work.task_visible(creator text,assignee text) returns boolean
language sql stable security definer set search_path = '' as $$
 select kdh_work.employee() and (
 public.kdh_caller_email() in (creator,assignee)
 or kdh_work.supervises(creator)
 or (kdh_work.supervises(assignee) and exists(select 1 from public.allowed_users u where u.email=assignee and u.role='rep')));
$$;
revoke all on function kdh_work.task_visible(text,text) from public,anon;
grant execute on function kdh_work.task_visible(text,text) to authenticated;

create or replace function kdh_work.task_member(task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.field_tasks t where t.id=task
 and kdh_work.task_visible(t.rep_email,t.associate_email));
$$;
drop policy if exists "tasks read" on public.field_tasks;
create policy "tasks read" on public.field_tasks for select to authenticated
 using(kdh_work.task_visible(rep_email,associate_email));
drop policy if exists "tasks update" on public.field_tasks;
create policy "tasks update" on public.field_tasks for update to authenticated
 using(kdh_work.task_member(id)) with check(kdh_work.task_visible(rep_email,associate_email));
-- Task comments, evidence storage and read receipts already use task_member.
commit;
