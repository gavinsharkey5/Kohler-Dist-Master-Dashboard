-- Kohler Dist Hub: starred products (2026-10-14, Gavin: "allow sales reps to
-- star certain products").
--
-- One row per person x product. The Inventory page (inventory/) keeps a copy
-- on the device (localStorage) and syncs it here with the signed-in token, so
-- a rep's stars follow them from the iPhone to the iPad. The email is stamped
-- from the token by the trigger, never trusted from the page; row-level
-- security lets a person read and change ONLY their own rows (a manager does
-- not see a rep's stars -- they are a personal shortlist, not a report).
-- Nothing here is an alert: the page shows a starred product's stock as of
-- the inventory snapshot and never claims to watch it live.
--
-- Safe to run more than once.

create table if not exists public.product_stars (
  email        text not null,             -- stamped from auth.jwt() by the trigger
  product_num  text not null,             -- Encompass product number ("2409")
  product_name text,                      -- as shown when starred (display only)
  created_at   timestamptz not null default now(),
  primary key (email, product_num)
);

comment on table public.product_stars is
  'Starred products per signed-in person (Inventory page shortlist). Own rows only.';

create or replace function public.product_stars_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := public.kdh_caller_email();
  new.product_num := trim(new.product_num);
  new.product_name := nullif(left(trim(coalesce(new.product_name, '')), 200), '');
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  if new.email = '' or new.product_num = '' then
    raise exception 'product_stars: email and product_num are required';
  end if;
  return new;
end $$;

drop trigger if exists product_stars_stamp on public.product_stars;
create trigger product_stars_stamp
  before insert or update on public.product_stars
  for each row execute function public.product_stars_stamp();

alter table public.product_stars enable row level security;

drop policy if exists "read own stars" on public.product_stars;
create policy "read own stars" on public.product_stars
  for select to authenticated
  using (email = public.kdh_caller_email());

drop policy if exists "insert own stars" on public.product_stars;
create policy "insert own stars" on public.product_stars
  for insert to authenticated
  with check (true);   -- the trigger overwrites email with the caller's

drop policy if exists "update own stars" on public.product_stars;
create policy "update own stars" on public.product_stars
  for update to authenticated
  using (email = public.kdh_caller_email())
  with check (email = public.kdh_caller_email());

drop policy if exists "delete own stars" on public.product_stars;
create policy "delete own stars" on public.product_stars
  for delete to authenticated
  using (email = public.kdh_caller_email());

grant select, insert, update, delete on public.product_stars to authenticated;
