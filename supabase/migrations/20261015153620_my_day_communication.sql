-- Extend Field Tasks without changing existing IDs or the photo bucket.
-- associate_email/name remain the compatible assignee columns (now reps too).
begin;
create schema if not exists kdh_work;
revoke all on schema kdh_work from public;
grant usage on schema kdh_work to authenticated;

create or replace function kdh_work.employee() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.allowed_users u
 where email = public.kdh_caller_email() and role in ('rep','associate','manager') and coalesce(to_jsonb(u)->>'workspace','')<>'finance');
$$;
create or replace function kdh_work.supervises(person text) returns boolean
language sql stable security definer set search_path = '' as $$
 select kdh_work.employee() and exists (
 select 1 from public.allowed_users m, public.allowed_users u
 where m.email = public.kdh_caller_email() and m.role = 'manager' and u.email = person
 and u.email <> m.email and u.name in (select public.kdh_reports_under(m.name)));
$$;
create or replace function kdh_work.account_allowed(customer text) returns boolean
language sql stable security definer set search_path = '' as $$
 select kdh_work.employee() and (customer is null or exists (
 select 1 from public.account_assignments a join public.allowed_users u
 on public.kdh_name_key(u.name) = a.rep_key
 where a.customer_num = customer and (u.email = public.kdh_caller_email() or kdh_work.supervises(u.email))));
$$;
create or replace function kdh_work.can_assign(person text) returns boolean
language sql stable security definer set search_path = '' as $$
 select kdh_work.employee() and exists(select 1 from public.allowed_users u
 where u.email = person and coalesce(to_jsonb(u)->>'workspace','')<>'finance' and u.role in ('rep','associate','manager') and
 (person = public.kdh_caller_email() or kdh_work.supervises(person)
 or (public.kdh_caller_role() = 'rep' and u.role = 'associate'
 and nullif(trim(u.reports_to),'') is not null and exists(select 1 from public.allowed_users me
 where me.email = public.kdh_caller_email() and lower(trim(me.reports_to)) = lower(trim(u.reports_to))))));
$$;

alter table public.field_tasks add column if not exists personal boolean not null default false;
alter table public.field_tasks add column if not exists planned_on date not null default ((now() at time zone 'America/New_York')::date);
alter table public.field_tasks add column if not exists sort_order double precision not null default 0;
alter table public.field_tasks add column if not exists source_key text;
alter table public.field_tasks add column if not exists source_url text;
alter table public.field_tasks add column if not exists assigned_by text;
alter table public.field_tasks add column if not exists assigned_at timestamptz;
alter table public.field_tasks add column if not exists completed_by text;
alter table public.field_tasks add column if not exists revision bigint not null default 1;
alter table public.field_tasks disable trigger field_tasks_guard;
update public.field_tasks set assigned_by=rep_email, assigned_at=created_at where assigned_by is null;
alter table public.field_tasks enable trigger field_tasks_guard;
create unique index if not exists field_tasks_source on public.field_tasks(rep_email,source_key) where source_key is not null;
create index if not exists field_tasks_day on public.field_tasks(associate_email,planned_on,sort_order) where archived_at is null;
alter table public.field_task_comments add column if not exists client_id uuid default gen_random_uuid();
create unique index if not exists field_task_comments_retry on public.field_task_comments(author_email,client_id);

create or replace function kdh_work.task_member(task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select kdh_work.employee() and exists(select 1 from public.field_tasks t where t.id=task and
 (public.kdh_caller_email() in (t.rep_email,t.associate_email) or kdh_work.supervises(t.associate_email) or kdh_work.supervises(t.rep_email)));
$$;
create or replace function public.kdh_task_member(p_task uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select kdh_work.task_member(p_task); $$;

create or replace function public.kdh_work_people(p_assign boolean default false)
returns table(email text,name text,role text) language sql stable security definer set search_path = '' as $$
 select u.email,u.name,u.role from public.allowed_users u where kdh_work.employee()
 and coalesce(to_jsonb(u)->>'workspace','')<>'finance' and u.role in ('rep','associate','manager') and (not p_assign or kdh_work.can_assign(u.email)) order by u.name,u.email;
$$;

create or replace function public.field_tasks_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare me text := public.kdh_caller_email(); a record; may_edit boolean;
begin
 if not kdh_work.employee() then raise exception 'Employee access required'; end if;
 if tg_op='INSERT' then
   if public.kdh_caller_role() not in ('rep','manager') then raise exception 'Only reps and managers create tasks'; end if;
   new.rep_email:=me; new.rep_name:=public.kdh_caller_name();
   new.status:='assigned'; new.photo_path:=null; new.completion_note:=null; new.blocked_reason:=null;
   new.created_at:=now(); new.completed_at:=null; new.completed_by:=null; new.archived_at:=null; new.revision:=1;
 else
   if not kdh_work.task_member(old.id) then raise exception 'Not your task'; end if;
   may_edit:=me=old.rep_email or kdh_work.supervises(old.associate_email) or kdh_work.supervises(old.rep_email);
   if not may_edit and (to_jsonb(new) - array['status','blocked_reason','photo_path','completion_note','planned_on','sort_order','updated_at'])
      is distinct from (to_jsonb(old) - array['status','blocked_reason','photo_path','completion_note','planned_on','sort_order','updated_at']) then
     raise exception 'Only the creator or supervisor can edit task details';
   end if;
   if new.status is distinct from old.status and me<>old.associate_email
     and not kdh_work.supervises(old.associate_email) then raise exception 'Only the assignee or supervisor can change status'; end if;
   if new.id<>old.id then raise exception 'Task identity cannot change'; end if;
   new.rep_email:=old.rep_email; new.rep_name:=old.rep_name; new.created_at:=old.created_at;
   new.source_key:=old.source_key; new.source_url:=old.source_url;
   new.assigned_by:=old.assigned_by; new.assigned_at:=old.assigned_at;
   new.completed_at:=old.completed_at; new.completed_by:=old.completed_by;
   new.revision:=old.revision;
   if (to_jsonb(new)-array['updated_at','revision']) is distinct from (to_jsonb(old)-array['updated_at','revision']) then new.revision:=old.revision+1; end if;
 end if;
 new.title:=nullif(trim(new.title),'');
 if new.title is null or length(new.title)>160 then raise exception 'Use a task title of 1 to 160 characters'; end if;
 if length(coalesce(new.description,''))>4000 or length(coalesce(new.completion_note,''))>2000 then raise exception 'Task note is too long'; end if;
 new.account_num:=nullif(trim(new.account_num),'');
 if tg_op='INSERT' or new.account_num is distinct from old.account_num then
   if not kdh_work.account_allowed(new.account_num) then raise exception 'Account is outside your territory'; end if;
 end if;
 if new.source_url is not null and (new.source_url !~ '^/[^/]' or position(chr(92) in new.source_url)>0 or position(chr(13) in new.source_url)>0 or position(chr(10) in new.source_url)>0) then raise exception 'Use an internal source link'; end if;
 if new.sort_order='NaN'::float8 or abs(new.sort_order)>1e15 then raise exception 'Invalid task order'; end if;
 new.associate_email:=lower(trim(new.associate_email));
 if tg_op='INSERT' or new.associate_email is distinct from old.associate_email then
   if not kdh_work.can_assign(new.associate_email) then raise exception 'Choose an employee on your team'; end if;
   select * into a from public.allowed_users where email=new.associate_email;
   new.associate_name:=a.name; new.assigned_by:=me; new.assigned_at:=now();
   if tg_op='UPDATE' then
     new.status:='assigned'; new.completed_at:=null; new.completed_by:=null; new.photo_path:=null; new.completion_note:=null;
   end if;
 elsif tg_op='UPDATE' then new.associate_name:=old.associate_name;
 end if;
 new.personal:=new.rep_email=new.associate_email;
 if new.status='blocked' and nullif(trim(new.blocked_reason),'') is null then raise exception 'Say why the task is blocked'; end if;
 if new.status<>'blocked' then new.blocked_reason:=null; end if;
 if new.photo_path is not null and (tg_op='INSERT' or new.photo_path is distinct from old.photo_path) then
   if split_part(new.photo_path,'/',1)<>new.id::text or not exists(select 1 from storage.objects where bucket_id='task-photos' and name=new.photo_path) then
     raise exception 'Upload a photo for this task first'; end if;
 end if;
 if new.status='done' and new.task_type in ('display','tap_handle') and new.photo_path is null then raise exception 'A completion photo is required'; end if;
 if new.status='done' and (tg_op='INSERT' or old.status<>'done') then
   new.completed_at:=now(); new.completed_by:=me;
 elsif new.status<>'done' then new.completed_at:=null; new.completed_by:=null;
 end if;
 new.updated_at:=now(); return new;
end $$;

drop policy if exists "tasks read" on public.field_tasks;
create policy "tasks read" on public.field_tasks for select to authenticated using(kdh_work.employee() and (public.kdh_caller_email() in(rep_email,associate_email) or kdh_work.supervises(rep_email) or kdh_work.supervises(associate_email)));
drop policy if exists "tasks insert" on public.field_tasks;
create policy "tasks insert" on public.field_tasks for insert to authenticated with check(kdh_work.employee() and rep_email=public.kdh_caller_email());
drop policy if exists "tasks update" on public.field_tasks;
create policy "tasks update" on public.field_tasks for update to authenticated using(kdh_work.task_member(id)) with check(kdh_work.employee() and (public.kdh_caller_email() in(rep_email,associate_email) or kdh_work.supervises(rep_email) or kdh_work.supervises(associate_email)));
drop policy if exists "tasks delete" on public.field_tasks;
create policy "tasks delete" on public.field_tasks for delete to authenticated using(kdh_work.employee() and rep_email=public.kdh_caller_email() and (personal or status='assigned'));
drop policy if exists "reads own" on public.field_task_reads;
create policy "reads own" on public.field_task_reads for all to authenticated using(email=public.kdh_caller_email() and kdh_work.task_member(task_id)) with check(email=public.kdh_caller_email() and kdh_work.task_member(task_id));

create table public.work_notifications (
 id bigint generated always as identity primary key,
 recipient text not null, event_key text not null, task_id uuid references public.field_tasks(id) on delete cascade,
 conversation_id uuid, label text not null, created_at timestamptz not null default now(), read_at timestamptz,
 unique(recipient,event_key)
);
alter table public.work_notifications enable row level security;
create index work_notifications_inbox on public.work_notifications(recipient,created_at desc);
create policy "own notifications" on public.work_notifications for select to authenticated
 using(kdh_work.employee() and recipient=public.kdh_caller_email() and (task_id is null or kdh_work.task_member(task_id)));
create policy "read notifications" on public.work_notifications for update to authenticated
 using(kdh_work.employee() and recipient=public.kdh_caller_email()) with check(recipient=public.kdh_caller_email());
revoke all on public.work_notifications from anon,authenticated;
grant select on public.work_notifications to authenticated;
grant update(read_at) on public.work_notifications to authenticated;

create or replace function kdh_work.notify_task(t public.field_tasks, key text, label text) returns void
language sql security definer set search_path = '' as $$
 insert into public.work_notifications(recipient,event_key,task_id,label)
 select distinct u.email,key,t.id,left(label,240) from public.allowed_users u
 where u.email<>public.kdh_caller_email() and coalesce(to_jsonb(u)->>'workspace','')<>'finance' and u.role in('rep','associate','manager') and
 (u.email in(t.rep_email,t.associate_email) or
 (u.role='manager' and exists(select 1 from public.field_task_comments c where c.task_id=t.id and c.author_email=u.email)
 and exists(select 1 from public.allowed_users member where member.email in(t.rep_email,t.associate_email)
 and member.name in(select public.kdh_reports_under(u.name)))))
 on conflict(recipient,event_key) do nothing;
$$;
create or replace function public.field_tasks_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='INSERT' then
   perform kdh_work.notify_task(new,'assignment:'||new.id||':'||new.revision,'Assigned: '||new.title);
 elsif new.associate_email is distinct from old.associate_email then
   insert into public.field_task_comments(task_id,author_email,kind,body)
   values(new.id,public.kdh_caller_email(),'status','Assigned to '||new.associate_name);
   perform kdh_work.notify_task(new,'assignment:'||new.id||':'||new.revision,'Assigned: '||new.title);
 elsif new.status is distinct from old.status then
   insert into public.field_task_comments(task_id,author_email,kind,body,photo_path)
   values(new.id,public.kdh_caller_email(),'status',left(replace(new.status,'_',' ')||coalesce(': '||new.completion_note,'')||case when new.status='blocked' then ': '||new.blocked_reason else '' end,2000),
     case when new.status='done' then new.photo_path end);
   perform kdh_work.notify_task(new,'status:'||new.id||':'||new.revision,replace(new.status,'_',' ')||': '||new.title);
 end if;
 return new;
end $$;
drop trigger field_tasks_log on public.field_tasks;
create trigger field_tasks_log after insert or update on public.field_tasks for each row execute function public.field_tasks_log();

create or replace function public.field_task_comments_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if not kdh_work.task_member(new.task_id) then raise exception 'Not your task'; end if;
 new.author_email:=public.kdh_caller_email(); new.author_name:=public.kdh_caller_name();
 if new.kind='status' and pg_trigger_depth()<2 then new.kind:='comment'; end if;
 new.body:=nullif(trim(new.body),'');
 if length(new.body)>2000 or (new.body is null and new.photo_path is null) then raise exception 'Write a message of up to 2000 characters'; end if;
 if new.photo_path is not null and (split_part(new.photo_path,'/',1)<>new.task_id::text or not exists(select 1 from storage.objects where bucket_id='task-photos' and name=new.photo_path)) then raise exception 'Invalid task photo'; end if;
 new.created_at:=now(); return new;
end $$;
create or replace function kdh_work.comment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.field_tasks;
begin
 if new.kind<>'status' then
   update public.field_tasks set updated_at=now() where id=new.task_id returning * into t;
   perform kdh_work.notify_task(t,'comment:'||new.id,'New comment: '||t.title);
 end if;
 return new;
end $$;
create trigger work_comment_notify after insert on public.field_task_comments for each row execute function kdh_work.comment_notify();

-- One conversation per pair; all employees may message, only participants may read.
create table public.work_conversations (
 id uuid primary key default gen_random_uuid(), person_a text not null, person_b text not null,
 created_at timestamptz not null default now(), check(person_a<person_b), unique(person_a,person_b)
);
create table public.work_messages (
 id bigint generated always as identity primary key,
 client_id uuid not null, conversation_id uuid not null references public.work_conversations(id),
 author_email text not null, body text not null check(length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now(), unique(author_email,client_id)
);
create table public.work_message_reads (
 conversation_id uuid not null references public.work_conversations(id), email text not null,
 last_message_id bigint not null default 0, primary key(conversation_id,email)
);
alter table public.work_notifications add foreign key(conversation_id) references public.work_conversations(id);
create index work_messages_thread on public.work_messages(conversation_id,id);
create or replace function kdh_work.conversation_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select kdh_work.employee() and exists(select 1 from public.work_conversations c where c.id=cid and public.kdh_caller_email() in(c.person_a,c.person_b));
$$;
alter table public.work_conversations enable row level security;
alter table public.work_messages enable row level security;
alter table public.work_message_reads enable row level security;
create policy "conversation participants" on public.work_conversations for select to authenticated using(kdh_work.conversation_member(id));
create policy "message participants" on public.work_messages for select to authenticated using(kdh_work.conversation_member(conversation_id));
create policy "own read cursor" on public.work_message_reads for select to authenticated using(kdh_work.conversation_member(conversation_id) and email=public.kdh_caller_email());
revoke all on public.work_conversations,public.work_messages,public.work_message_reads from anon,authenticated;
grant select on public.work_conversations,public.work_messages,public.work_message_reads to authenticated;

create or replace function public.kdh_message_send(p_to text,p_body text,p_client uuid) returns public.work_messages
language plpgsql security definer set search_path = '' as $$
declare me text:=public.kdh_caller_email(); cid uuid; result public.work_messages;
begin
 if not kdh_work.employee() or p_to=me or not exists(select 1 from public.allowed_users u where email=p_to and role in('rep','associate','manager') and coalesce(to_jsonb(u)->>'workspace','')<>'finance') then raise exception 'Choose an employee'; end if;
 select * into result from public.work_messages where author_email=me and client_id=p_client;
 if found then return result; end if;
 insert into public.work_conversations(person_a,person_b) values(least(me,p_to),greatest(me,p_to)) on conflict do nothing;
 select id into cid from public.work_conversations where person_a=least(me,p_to) and person_b=greatest(me,p_to);
 insert into public.work_messages(client_id,conversation_id,author_email,body) values(p_client,cid,me,trim(p_body))
 on conflict(author_email,client_id) do nothing returning * into result;
 if result.id is null then select * into result from public.work_messages where author_email=me and client_id=p_client; return result; end if;
 insert into public.work_notifications(recipient,event_key,conversation_id,label)
 values(p_to,'message:'||result.id,cid,'Message from '||public.kdh_caller_name()) on conflict do nothing;
 return result;
end $$;
create or replace function public.kdh_message_read(p_conversation uuid,p_last bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not kdh_work.conversation_member(p_conversation) then raise exception 'Not your conversation'; end if;
 if not exists(select 1 from public.work_messages where conversation_id=p_conversation and id=p_last) then return; end if;
 insert into public.work_message_reads(conversation_id,email,last_message_id) values(p_conversation,public.kdh_caller_email(),p_last)
 on conflict(conversation_id,email) do update set last_message_id=greatest(public.work_message_reads.last_message_id,excluded.last_message_id);
 update public.work_notifications set read_at=now() where recipient=public.kdh_caller_email() and conversation_id=p_conversation
 and event_key in(select 'message:'||id from public.work_messages where conversation_id=p_conversation and id<=p_last) and read_at is null;
end $$;

-- Functions are explicitly granted; internal trigger/notification functions are not RPCs.
revoke all on all functions in schema kdh_work from public,anon,authenticated;
grant execute on function kdh_work.employee(),kdh_work.supervises(text),kdh_work.account_allowed(text),kdh_work.can_assign(text),kdh_work.task_member(uuid),kdh_work.conversation_member(uuid) to authenticated;
revoke all on function public.kdh_work_people(boolean),public.kdh_message_send(text,text,uuid),public.kdh_message_read(uuid,bigint) from public,anon;
grant execute on function public.kdh_work_people(boolean),public.kdh_message_send(text,text,uuid),public.kdh_message_read(uuid,bigint) to authenticated;
revoke all on function public.field_tasks_guard(),public.field_tasks_log(),public.field_task_comments_stamp() from public,anon,authenticated;
-- Existing policies reference kdh_task_member, so storage and comments inherit team scope.
do $$ declare tab text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach tab in array array['field_tasks','field_task_comments','work_notifications','work_messages'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tab) then
 execute format('alter publication supabase_realtime add table public.%I',tab); end if;
 end loop; end if;
end $$;
commit;
