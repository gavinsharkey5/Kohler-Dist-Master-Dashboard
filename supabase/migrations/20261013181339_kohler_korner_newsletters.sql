-- Kohler Korner: isolated editor permissions, private drafts, immutable releases.
-- Existing authentication and other permission flags are not changed.
alter table public.allowed_users add column if not exists newsletter_editor boolean not null default false;
create or replace function public.kdh_newsletter_editor() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.allowed_users where email=public.kdh_caller_email() and role='manager' and newsletter_editor);
$$;
create or replace function public.kdh_newsletter_reader() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.allowed_users where email=public.kdh_caller_email());
$$;
revoke all on function public.kdh_newsletter_editor(), public.kdh_newsletter_reader() from public,anon;
grant execute on function public.kdh_newsletter_editor(), public.kdh_newsletter_reader() to authenticated;

create table public.newsletter_editions (
 id uuid primary key default gen_random_uuid(), month integer not null check(month between 1 and 12), year integer not null check(year between 2000 and 2100),
 is_sample boolean not null default false, content jsonb not null, revision integer not null default 1,
 updated_at timestamptz not null default now(), updated_by text not null, created_at timestamptz not null default now(),
 unique(month,year,is_sample)
);
create table public.newsletter_versions (
 id uuid primary key default gen_random_uuid(), edition_id uuid not null references public.newsletter_editions(id),
 version integer not null, month integer not null, year integer not null, content jsonb not null,
 asset_paths text[] not null default '{}', published_at timestamptz not null default now(), published_by text not null,
 unique(edition_id,version)
);
create table public.newsletter_sample_material (
 id text primary key check(id='december-2015'), decryption_key text not null
);
alter table public.newsletter_editions enable row level security;
alter table public.newsletter_versions enable row level security;
alter table public.newsletter_sample_material enable row level security;
revoke all on public.newsletter_editions, public.newsletter_versions, public.newsletter_sample_material from public,anon,authenticated;
grant select on public.newsletter_editions, public.newsletter_versions, public.newsletter_sample_material to authenticated;
create policy newsletter_drafts_editor on public.newsletter_editions for select to authenticated using(public.kdh_newsletter_editor());
create policy newsletter_versions_employee on public.newsletter_versions for select to authenticated using(public.kdh_newsletter_reader());
create policy newsletter_sample_editor on public.newsletter_sample_material for select to authenticated using(public.kdh_newsletter_editor());

-- Validate at the server too. No HTML or inline image data is ever interpreted.
create function public.kdh_newsletter_validate(p_content jsonb,p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare s jsonb; it jsonb; a jsonb; paths jsonb; typ text;
begin
 if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_content->'sections') is distinct from 'array' or jsonb_array_length(p_content->'sections')>40 or octet_length(p_content::text)>1000000 then raise exception 'Invalid or oversized newsletter'; end if;
 if (select count(*) from jsonb_array_elements(p_content->'sections')) <> (select count(distinct value->>'id') from jsonb_array_elements(p_content->'sections')) then raise exception 'Section IDs must be unique'; end if;
 for s in select value from jsonb_array_elements(p_content->'sections') loop
  typ=s->>'type';
  if typ is null or typ not in ('article','products','events','birthdays','anniversaries','people') or coalesce(length(s->>'title'),0) not between 1 and 160 or coalesce(length(s->>'id'),0)=0 or jsonb_typeof(s->'hidden') is distinct from 'boolean' or jsonb_typeof(s->'complete') is distinct from 'boolean' or jsonb_typeof(s->'article') is distinct from 'object' or jsonb_typeof(s->'article'->'text') is distinct from 'string' or jsonb_typeof(s->'article'->'photos') is distinct from 'array' or jsonb_typeof(s->'items') is distinct from 'array' then raise exception 'Invalid section'; end if;
  if jsonb_array_length(s->'items')>200 or jsonb_array_length(s->'article'->'photos')>40 then raise exception 'Too many entries or photos'; end if;
  if length(coalesce(s->'article'->>'text',''))>100000 then raise exception 'Article too long'; end if;
  for it in select value from jsonb_array_elements(s->'items') loop
   if jsonb_typeof(it) is distinct from 'object' then raise exception 'Invalid entry'; end if;
   if typ='birthdays' then
    if coalesce(it->>'name','')='' or coalesce((it->>'month')::int,0) not between 1 and 12 or coalesce((it->>'day')::int,0) not between 1 and extract(day from (make_date(2000,(it->>'month')::int,1)+interval '1 month - 1 day')) then raise exception 'Invalid birthday (month/day only)'; end if;
   elsif typ='anniversaries' then
    if coalesce(it->>'name','')='' or coalesce((it->>'years')::int,-1) not between 0 and 100 then raise exception 'Invalid service milestone'; end if;
   elsif typ in ('people','products') and coalesce(it->>'name','')='' then raise exception 'Name required';
   elsif typ='events' and coalesce(it->>'title','')='' then raise exception 'Event title required'; end if;
  end loop;
 end loop;
 -- Every asset belongs to this edition, already exists, and is an immutable image.
 for paths in select value from jsonb_path_query(p_content,'$.**.path') as q(value) loop
  if jsonb_typeof(paths)<>'string' or (paths#>>'{}') not like p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='newsletter-images' and name=paths#>>'{}') then raise exception 'Invalid newsletter image'; end if;
 end loop;
end $$;
revoke all on function public.kdh_newsletter_validate(jsonb,uuid) from public,anon,authenticated;

create function public.kdh_newsletter_scope() returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('editor',public.kdh_newsletter_editor(),'contributors',case when public.kdh_newsletter_editor() then coalesce((select jsonb_agg(distinct name) from public.allowed_users where newsletter_editor and role='manager'),'[]'::jsonb) else '[]'::jsonb end);
$$;
create function public.kdh_newsletter_create(p_month integer,p_year integer,p_content jsonb) returns public.newsletter_editions
language plpgsql security definer set search_path = '' as $$
declare r public.newsletter_editions;
begin
 if not public.kdh_newsletter_editor() then raise insufficient_privilege using message='Newsletter editor access required'; end if;
 r.id=gen_random_uuid();perform public.kdh_newsletter_validate(p_content,r.id);
 insert into public.newsletter_editions(id,month,year,content,updated_by) values(r.id,p_month,p_year,p_content,public.kdh_caller_email()) returning * into r; return r;
end $$;
create function public.kdh_newsletter_save(p_id uuid,p_revision integer,p_content jsonb) returns public.newsletter_editions
language plpgsql security definer set search_path = '' as $$
declare r public.newsletter_editions;
begin
 if not public.kdh_newsletter_editor() then raise insufficient_privilege using message='Newsletter editor access required'; end if;
 perform public.kdh_newsletter_validate(p_content,p_id);
 update public.newsletter_editions set content=p_content,revision=revision+1,updated_at=now(),updated_by=public.kdh_caller_email() where id=p_id and revision=p_revision returning * into r;
 if not found then raise sqlstate '40001' using message='Another editor saved changes. Reload the latest draft before saving.'; end if;return r;
end $$;
create function public.kdh_newsletter_publish(p_id uuid,p_revision integer,p_reviewed boolean) returns public.newsletter_versions
language plpgsql security definer set search_path = '' as $$
declare e public.newsletter_editions; v public.newsletter_versions; s jsonb; n integer;
begin
 if not public.kdh_newsletter_editor() then raise insufficient_privilege using message='Newsletter editor access required'; end if;
 if not coalesce(p_reviewed,false) then raise exception 'Confirm employee details and content have been reviewed'; end if;
 select * into e from public.newsletter_editions where id=p_id for update;
 if not found or e.revision<>p_revision then raise sqlstate '40001' using message='Draft changed. Reload and review before publishing.'; end if;
 if e.is_sample then raise exception 'Historical samples cannot be published'; end if;
 perform public.kdh_newsletter_validate(e.content,e.id);
 if not exists(select 1 from jsonb_array_elements(e.content->'sections') as entries(entry) where not (entry->>'hidden')::boolean and ((length(entry->'article'->>'text')>0) or jsonb_array_length(entry->'article'->'photos')>0 or jsonb_array_length(entry->'items')>0)) then raise exception 'Add newsletter content before publishing'; end if;
 for s in select value from jsonb_array_elements(e.content->'sections') loop
  if not (s->>'hidden')::boolean and (length(s->'article'->>'text')>0 or jsonb_array_length(s->'items')>0 or jsonb_array_length(s->'article'->'photos')>0) and not (s->>'complete')::boolean then raise exception 'Review and mark each populated, visible section Complete'; end if;
 end loop;
 select coalesce(max(version),0)+1 into n from public.newsletter_versions where edition_id=p_id;
 insert into public.newsletter_versions(edition_id,version,month,year,content,asset_paths,published_by)
 values(e.id,n,e.month,e.year,e.content,coalesce((select array_agg(distinct value#>>'{}') from jsonb_path_query(e.content,'$.**.path') as q(value)),'{}'),public.kdh_caller_email()) returning * into v;
 -- Move the draft revision too, preventing duplicate publish from an old editor tab.
 update public.newsletter_editions set revision=revision+1 where id=e.id;return v;
end $$;
revoke all on function public.kdh_newsletter_scope(),public.kdh_newsletter_create(integer,integer,jsonb),public.kdh_newsletter_save(uuid,integer,jsonb),public.kdh_newsletter_publish(uuid,integer,boolean) from public,anon;
grant execute on function public.kdh_newsletter_scope(),public.kdh_newsletter_create(integer,integer,jsonb),public.kdh_newsletter_save(uuid,integer,jsonb),public.kdh_newsletter_publish(uuid,integer,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('newsletter-images','newsletter-images',false,8388608,array['image/jpeg','image/png','image/webp']);
create function public.kdh_newsletter_image_read(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
 select public.kdh_newsletter_editor() or (public.kdh_newsletter_reader() and exists(select 1 from public.newsletter_versions where asset_paths @> array[p_path]));
$$;
create function public.kdh_newsletter_image_write(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
 select public.kdh_newsletter_editor() and exists(select 1 from public.newsletter_editions where id::text=split_part(p_path,'/',1)) and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$';
$$;
revoke all on function public.kdh_newsletter_image_read(text),public.kdh_newsletter_image_write(text) from public,anon;
grant execute on function public.kdh_newsletter_image_read(text),public.kdh_newsletter_image_write(text) to authenticated;
create policy newsletter_private_images on storage.objects for select to authenticated using(bucket_id='newsletter-images' and public.kdh_newsletter_image_read(name));
create policy newsletter_upload_images on storage.objects for insert to authenticated with check(bucket_id='newsletter-images' and public.kdh_newsletter_image_write(name));
-- No UPDATE/DELETE policy: a published photograph can never be replaced or deleted.
-- Removing a photo from a draft only removes its reference. Retention cleanup is separate.
