-- MERCHANDISING: PODs AND SIGNAGE (2026-10-05). Run AFTER 20261004090000_merchandising.sql.
-- Idempotent: safe to run more than once.
--
-- Gavin: reps photograph displays, PODs, cooler doors, windows and signage at
-- off-premise accounts, and taps, menu promos (and signage) on-premise. Two
-- categories are added to the two checks; nothing else changes. The labels and
-- premise lists live in shared/merch-types.js.
alter table public.merch_records drop constraint if exists merch_records_category_check;
alter table public.merch_records add constraint merch_records_category_check
  check (category in ('display', 'pod', 'window', 'cooler_door', 'signage', 'tap_handle', 'menu', 'other'));
alter table public.account_photos drop constraint if exists account_photos_category_check;
alter table public.account_photos add constraint account_photos_category_check
  check (category is null or category in ('display', 'pod', 'window', 'cooler_door', 'signage', 'tap_handle', 'menu', 'other'));
