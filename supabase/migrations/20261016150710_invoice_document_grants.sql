-- Project default privileges include TRUNCATE, REFERENCES and TRIGGER.
-- RLS does not protect TRUNCATE; explicitly remove all inherited API grants.
revoke all on public.supplier_invoice_documents from anon, authenticated;
grant select, insert on public.supplier_invoice_documents to authenticated;
notify pgrst, 'reload schema';
