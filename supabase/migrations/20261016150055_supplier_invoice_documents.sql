-- Private invoice PDFs; preserve the existing expense/account access rules.
create table public.supplier_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.supplier_expenses(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 5 and 255 and file_name ~* '\.pdf$'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid,
  uploaded_name text,
  created_at timestamptz not null default now(),
  unique (expense_id, sha256),
  check (storage_path = expense_id::text || '/' || id::text || '.pdf')
);
alter table public.supplier_invoice_documents enable row level security;
grant select, insert on public.supplier_invoice_documents to authenticated;
create index supplier_invoice_documents_expense on public.supplier_invoice_documents(expense_id);

create function public.supplier_invoice_documents_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.uploaded_by := auth.uid();
  new.uploaded_name := case when auth.uid() is null then 'Initial import'
    else public.kdh_caller_name_or('Budget editor') end;
  new.created_at := now();
  return new;
end $$;
revoke all on function public.supplier_invoice_documents_stamp() from public, anon, authenticated;
create trigger supplier_invoice_documents_stamp before insert on public.supplier_invoice_documents
for each row execute function public.supplier_invoice_documents_stamp();

create policy "invoice documents read" on public.supplier_invoice_documents
for select to authenticated using (
  exists (select 1 from public.supplier_expenses e where e.id = expense_id)
);
create policy "invoice documents add" on public.supplier_invoice_documents
for insert to authenticated with check (
  public.kdh_is_budget_editor() and uploaded_by = auth.uid()
  and exists (select 1 from public.supplier_expenses e where e.id = expense_id)
  and exists (select 1 from storage.objects o
    where o.bucket_id = 'supplier-invoices' and o.name = storage_path
      and o.owner_id = auth.uid()::text
      and (o.metadata->>'size')::bigint = size_bytes)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-invoices', 'supplier-invoices', false, 20971520, array['application/pdf']);

create policy "invoice PDF read" on storage.objects
for select to authenticated using (
  bucket_id = 'supplier-invoices'
  and exists (select 1 from public.supplier_expenses e where e.id::text = split_part(name, '/', 1))
);
create policy "invoice PDF upload" on storage.objects
for insert to authenticated with check (
  bucket_id = 'supplier-invoices' and public.kdh_is_budget_editor()
  and owner_id = auth.uid()::text
  and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.pdf$'
  and exists (select 1 from public.supplier_expenses e where e.id::text = split_part(name, '/', 1))
);
-- No overwrite/delete policy: corrections are additional documents; preserve originals.
notify pgrst, 'reload schema';

