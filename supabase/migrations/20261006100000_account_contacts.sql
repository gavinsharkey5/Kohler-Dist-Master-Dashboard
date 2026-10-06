-- Account contacts (2026-10-06): primary contact name, phone and email per
-- customer, from Encompass' Customers export. PRIVATE: the repo is public, so
-- this data lives only here, never in a committed file. Run after
-- 20261002120000_account_notes_photos.sql (needs kdh_can_access_account).
-- Idempotent. Read policy = the same rule as notes and photos: a rep reads
-- only accounts assigned to them, a manager reads all. Nobody signed in can
-- write; the loader (tools/load_contacts.py -> SQL Editor) runs as the owner.

create table if not exists public.account_contacts (
  customer_num text primary key,
  contact_name text,
  phone        text,
  email        text,
  updated_at   timestamptz not null default now()
);
comment on table public.account_contacts is
  'Primary contact per customer (Encompass Customers export). Loaded by tools/load_contacts.py; read-only for signed-in users.';

alter table public.account_contacts enable row level security;
revoke all on public.account_contacts from anon, authenticated;
grant select on public.account_contacts to authenticated;

drop policy if exists "read contacts of my accounts" on public.account_contacts;
create policy "read contacts of my accounts" on public.account_contacts
  for select to authenticated
  using (public.kdh_can_access_account(customer_num));
