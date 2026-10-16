-- Kohler Dist Hub: FIELD TASKS -- reps hand work to sales associates (2026-10-14).
--
-- A field task is one piece of account work a rep asks an associate to do
-- (build a display, drop a tap handle, deliver POS, other), with a due date,
-- a priority, a status and ONE message thread. The thread is also the audit
-- trail: every status change and the completion photo are posted into it.
--
-- WHO MAY DO WHAT (row-level security + the guard trigger below):
--   rep (creator)      insert; read own; edit title / description / type /
--                      account / associate / due / priority; archive; comment
--   associate          read tasks assigned to them; change status (Assigned ->
--                      In Progress -> Done, or Blocked with a reason); attach
--                      the completion photo + note; comment
--   manager            read everything; comment; may also create (any account)
--   anyone else        nothing
-- Identity is always the token's email (kdh_caller_email), never the page.
-- A Display or Tap Handle task cannot reach Done without a photo; Blocked
-- needs a reason. Done stamps completed_at.
--
-- Photos live in Storage bucket 'task-photos' at <task id>/<uuid>.jpg;
-- read / add only for the task's participants (and managers to read).
-- In-app notification = field_task_reads: a task is "new for you" when its
-- updated_at is after your seen_at.
--
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.field_tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  task_type        text not null check (task_type in ('display', 'tap_handle', 'pos', 'other')),
  account_num      text,
  account_name     text,
  rep_email        text not null,          -- creator, stamped from the token
  rep_name         text,
  associate_email  text not null,
  associate_name   text,
  due_date         date,
  priority         text not null default 'normal' check (priority in ('normal', 'urgent')),
  status           text not null default 'assigned' check (status in ('assigned', 'in_progress', 'done', 'blocked')),
  blocked_reason   text,
  photo_path       text,                   -- task-photos/<id>/<uuid>.jpg
  completion_note  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  archived_at      timestamptz
);
comment on table public.field_tasks is 'Field tasks a rep assigns to a sales associate (Sales Associates section).';
create index if not exists field_tasks_assoc on public.field_tasks (associate_email, status, due_date);
create index if not exists field_tasks_rep on public.field_tasks (rep_email, status, updated_at desc);

create table if not exists public.field_task_comments (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.field_tasks (id) on delete cascade,
  author_email text not null,
  author_name text,
  kind        text not null default 'comment' check (kind in ('comment', 'status', 'photo')),
  body        text,
  photo_path  text,
  created_at  timestamptz not null default now()
);
create index if not exists field_task_comments_task on public.field_task_comments (task_id, created_at);

create table if not exists public.field_task_reads (
  task_id  uuid not null references public.field_tasks (id) on delete cascade,
  email    text not null,
  seen_at  timestamptz not null default now(),
  primary key (task_id, email)
);

-- ------------------------------------------------------------ who is who
create or replace function public.kdh_caller_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.allowed_users where email = public.kdh_caller_email()), '');
$$;
create or replace function public.kdh_caller_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.allowed_users where email = public.kdh_caller_email()), '');
$$;
-- the people a task can be assigned to / filtered by: associates for everyone signed in
-- (a rep has to pick one), reps too for managers (filter chips). Names + emails only.
create or replace function public.kdh_people(p_role text)
returns table (email text, name text, role text, reports_to text)
language sql stable security definer set search_path = public as $$
  select u.email, u.name, u.role, u.reports_to
  from public.allowed_users u
  where u.role = p_role
    and (p_role = 'associate' or public.kdh_is_manager())
  order by u.name;
$$;
revoke all on function public.kdh_caller_role() from public;
revoke all on function public.kdh_caller_name() from public;
revoke all on function public.kdh_people(text) from public;
grant execute on function public.kdh_caller_role() to authenticated;
grant execute on function public.kdh_caller_name() to authenticated;
grant execute on function public.kdh_people(text) to authenticated;

create or replace function public.kdh_task_member(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.field_tasks t
    where t.id = p_task
      and (t.rep_email = public.kdh_caller_email() or t.associate_email = public.kdh_caller_email()
           or public.kdh_is_manager())
  );
$$;
revoke all on function public.kdh_task_member(uuid) from public;
grant execute on function public.kdh_task_member(uuid) to authenticated;

-- ------------------------------------------------------------ guard
create or replace function public.field_tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me text := public.kdh_caller_email();
  my_role text := public.kdh_caller_role();
  a record;
begin
  if tg_op = 'INSERT' then
    if my_role not in ('rep', 'manager') then raise exception 'only a rep or a manager can assign a task'; end if;
    new.rep_email := me;
    new.rep_name := public.kdh_caller_name();
    select email, name, role into a from public.allowed_users where email = lower(trim(coalesce(new.associate_email, '')));
    if a.email is null or a.role <> 'associate' then raise exception 'assign a task to a sales associate'; end if;
    new.associate_email := a.email; new.associate_name := a.name;
    new.title := nullif(left(trim(coalesce(new.title, '')), 160), '');
    if new.title is null then raise exception 'a task needs a title'; end if;
    new.status := 'assigned'; new.blocked_reason := null; new.photo_path := null; new.completion_note := null;
    new.created_at := now(); new.updated_at := now(); new.completed_at := null; new.archived_at := null;
    return new;
  end if;

  -- UPDATE: who may change what
  if me = old.rep_email or my_role = 'manager' then
    -- the rep (or a manager) may edit the task; status changes are the associate's, except reopening
    if new.associate_email is distinct from old.associate_email then
      select email, name, role into a from public.allowed_users where email = lower(trim(coalesce(new.associate_email, '')));
      if a.email is null or a.role <> 'associate' then raise exception 'assign a task to a sales associate'; end if;
      new.associate_email := a.email; new.associate_name := a.name;
    end if;
    new.rep_email := old.rep_email; new.rep_name := old.rep_name;
  elsif me = old.associate_email then
    -- the associate: status, reason, photo, note only
    if new.title is distinct from old.title or new.description is distinct from old.description
       or new.task_type is distinct from old.task_type or new.account_num is distinct from old.account_num
       or new.account_name is distinct from old.account_name or new.associate_email is distinct from old.associate_email
       or new.due_date is distinct from old.due_date or new.priority is distinct from old.priority
       or new.archived_at is distinct from old.archived_at then
      raise exception 'an associate may change the status, the photo and the note only';
    end if;
    new.rep_email := old.rep_email; new.rep_name := old.rep_name; new.associate_name := old.associate_name;
  else
    raise exception 'not your task';
  end if;

  new.title := nullif(left(trim(coalesce(new.title, '')), 160), '');
  if new.title is null then raise exception 'a task needs a title'; end if;
  if new.status = 'blocked' and nullif(trim(coalesce(new.blocked_reason, '')), '') is null then
    raise exception 'say why the task is blocked';
  end if;
  if new.status <> 'blocked' then new.blocked_reason := null; end if;
  if new.status = 'done' and old.status <> 'done' then
    if new.task_type in ('display', 'tap_handle') and nullif(trim(coalesce(new.photo_path, '')), '') is null then
      raise exception 'a photo is required to complete a % task', new.task_type;
    end if;
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists field_tasks_guard on public.field_tasks;
create trigger field_tasks_guard
  before insert or update on public.field_tasks
  for each row execute function public.field_tasks_guard();

-- every status change is a line in the thread (the audit trail the brief asks for)
create or replace function public.field_tasks_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform set_config('kdh.task_sys', '1', true);   -- lets the stamp trigger keep kind = status
    insert into public.field_task_comments (task_id, author_email, author_name, kind, body)
    values (new.id, public.kdh_caller_email(), public.kdh_caller_name(), 'status',
            case new.status when 'assigned' then 'Assigned' when 'in_progress' then 'In Progress'
                            when 'done' then 'Done' when 'blocked' then 'Blocked: ' || coalesce(new.blocked_reason, '') end);
    perform set_config('kdh.task_sys', '', true);
  end if;
  return new;
end $$;
drop trigger if exists field_tasks_log on public.field_tasks;
create trigger field_tasks_log
  after update on public.field_tasks
  for each row execute function public.field_tasks_log();

create or replace function public.field_task_comments_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.kdh_task_member(new.task_id) then raise exception 'not your task'; end if;
  new.author_email := public.kdh_caller_email();
  new.author_name := public.kdh_caller_name();
  if new.kind = 'status' and coalesce(current_setting('kdh.task_sys', true), '') <> '1' then
    new.kind := 'comment';   -- only the status trigger writes status lines
  end if;
  new.body := nullif(left(trim(coalesce(new.body, '')), 2000), '');
  if new.body is null and nullif(trim(coalesce(new.photo_path, '')), '') is null then raise exception 'an empty comment'; end if;
  new.created_at := now();
  update public.field_tasks set updated_at = now() where id = new.task_id;
  return new;
end $$;
drop trigger if exists field_task_comments_stamp on public.field_task_comments;
create trigger field_task_comments_stamp
  before insert on public.field_task_comments
  for each row execute function public.field_task_comments_stamp();

create or replace function public.field_task_reads_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := public.kdh_caller_email(); new.seen_at := now();
  return new;
end $$;
drop trigger if exists field_task_reads_stamp on public.field_task_reads;
create trigger field_task_reads_stamp
  before insert or update on public.field_task_reads
  for each row execute function public.field_task_reads_stamp();

-- ------------------------------------------------------------ RLS
alter table public.field_tasks enable row level security;
alter table public.field_task_comments enable row level security;
alter table public.field_task_reads enable row level security;

drop policy if exists "tasks read" on public.field_tasks;
create policy "tasks read" on public.field_tasks for select to authenticated
  using (rep_email = public.kdh_caller_email() or associate_email = public.kdh_caller_email() or public.kdh_is_manager());
drop policy if exists "tasks insert" on public.field_tasks;
create policy "tasks insert" on public.field_tasks for insert to authenticated
  with check (public.kdh_caller_role() in ('rep', 'manager'));   -- the trigger stamps the creator
drop policy if exists "tasks update" on public.field_tasks;
create policy "tasks update" on public.field_tasks for update to authenticated
  using (rep_email = public.kdh_caller_email() or associate_email = public.kdh_caller_email() or public.kdh_is_manager())
  with check (true);   -- the guard trigger decides what each person may change
drop policy if exists "tasks delete" on public.field_tasks;
create policy "tasks delete" on public.field_tasks for delete to authenticated
  using (rep_email = public.kdh_caller_email() and status = 'assigned');   -- an unstarted task may be withdrawn

drop policy if exists "comments read" on public.field_task_comments;
create policy "comments read" on public.field_task_comments for select to authenticated
  using (public.kdh_task_member(task_id));
drop policy if exists "comments insert" on public.field_task_comments;
create policy "comments insert" on public.field_task_comments for insert to authenticated
  with check (public.kdh_task_member(task_id));

drop policy if exists "reads own" on public.field_task_reads;
create policy "reads own" on public.field_task_reads for all to authenticated
  using (email = public.kdh_caller_email()) with check (true);

grant select, insert, update, delete on public.field_tasks to authenticated;
grant select, insert on public.field_task_comments to authenticated;
grant select, insert, update, delete on public.field_task_reads to authenticated;

-- ------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-photos', 'task-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kdh task photos read" on storage.objects;
create policy "kdh task photos read" on storage.objects for select to authenticated
  using (bucket_id = 'task-photos' and public.kdh_task_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "kdh task photos add" on storage.objects;
create policy "kdh task photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-photos' and public.kdh_task_member(((storage.foldername(name))[1])::uuid));
