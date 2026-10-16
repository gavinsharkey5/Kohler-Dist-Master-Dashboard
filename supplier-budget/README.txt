Supplier Budgets  (/supplier-budget/, managers only; 2026-10-14)

The "Supplier Budgets Tracker" workbook as a page. Alexis (office assistant)
enters every supplier-marketing expense here instead of into the sheet; the
Budget tab tracks spend against each GL account's budget; brand managers read
their own accounts.

WHERE THE DATA LIVES
  Supabase, never this repo (it is PUBLIC; this is dollars by vendor).
  Migration: supabase/migrations/20261014210000_supplier_budget.sql
    budget_accounts          the Budget tab: one row per Account per year (GL code,
                             supplier, brand manager, description, file name,
                             default vendor, budget amount, basis text, active,
                             needs_review)
    supplier_expenses        the Expenses tab: one row per invoice line. kohler_spend
                             is ALWAYS total_amount - billback_amount (trigger).
                             source = site | import_2026 | import_2025; imported rows
                             keep the sheet's cells in sheet_values and a source_key
                             so a re-pasted seed never duplicates.
    supplier_expense_events  the audit trail: create / update (changed columns,
                             from -> to) / delete, who and when. Editors only.
    budget_vendors           vendor names for the typeahead, filled by the trigger.
  The seed script (ONE TIME, from a laptop, the workbook never committed):
    python3 supplier-budget/seed_from_workbook.py <Supplier_Budgets_Tracker.xlsx>
  writes supabase/data/supplier_budget_seed_part1.sql, _part2.sql ... (+ _report.txt), all git-ignored
  (the SQL Editor caps one query at ~1 MB, so the seed comes in parts; part 1 first).
  Paste the SQL into the Supabase SQL Editor after the migration. Safe to paste
  again. The report lists what was flagged (see RULES).

WHO MAY DO WHAT (decided by the database, the page only draws)
  allowed_users.budget_editor = true   add / edit / delete expenses, edit budgets,
                                       add accounts, export CSV. Set by hand:
                                         update allowed_users set budget_editor = true
                                         where email = '<Alexis>';
  program_admin                        the same (Gavin)
  any other manager                    read only, and only the accounts whose Brand
                                       Manager is them (name key) or whose supplier
                                       is one of their program_brands; the page also
                                       applies kdhBrandScope() the same way
  rep / associate / a rep preview      nothing: not in REP_PATHS (the middleware
                                       redirects), and the page refuses a rep cookie
                                       or a rep / associate preview
  a MANAGER preview (View As -> Manager) read-only: the page still reads with the
                                       signed-in person's token, asks kdh_budget_standing
                                       (migration 20261015090000_budget_preview.sql) who
                                       the previewed manager is, and shows what they would
                                       see -- an editor's page with Add Expense disabled,
                                       or a brand manager's cut (name + program_brands).
                                       Without that migration the preview is read-only
                                       over every account and says so.
  Identity is always the token (kdh_caller_email); created_by / updated_by and the
  names are stamped by the trigger. Every write asks PostgREST for the rows back
  and counts them -- a 2xx under RLS proves nothing.

RULES
  Kohler Spend = Total - Billback, always. Nobody types it. Where the sheet's own
    cell disagreed (172 rows on 2026-10-14) the computed value is used and the
    sheet value stays in sheet_values; the seed report lists them.
  A site-entered expense needs an Account, a Vendor and a Total; 0 <= Billback <=
    Total; a date in an open year (last year .. next year; the page says
    "this year or last" plus next for pre-dated invoices). Imported rows skip
    those checks (history has negatives and credits).
  Billback Received: flipping it on stamps received_date (today unless given);
    off clears it. One tap from the row (editors).
  Year is read from the date (the sheet's Year column had a 2062 typo).
  Accounts on the Expenses tab with no Budget row (59 on 2026-10-14) were created
    by the seed as placeholder accounts: needs_review = true, supplier blank, code
    + brand manager copied from their own rows. They show "Needs Review" on the
    Budget tab until an editor fills them in or moves the expenses. Nothing was
    mapped by guess (several are spellings of accounts that do exist:
    'Crescent Distributions' / 'Crescent Distributing', 'Athletic Brewing Co' /
    'ATHletic Brewing Company', 'Primos Imports' / 'Primos Imports LLC').
  The 2025 tab: rows dated 2025 are history (source import_2025) under year-2025
    account rows (inactive, no budget); its 2026 rows were skipped (copies of the
    2026 tab). The Ledger's Year filter defaults to the current year.
  Description, Brand Manager and Code on a ledger row come from the ACCOUNT
    (Budget tab wins); the row's own sheet cells are kept in sheet_values. 21 rows
    disagreed on Brand Manager and 128 on Code -- the report lists them.
  Budget Breakdown basis text was attached where the brand name matched a Budget
    supplier (12 of 21); the rest are listed for Alexis to type in.
  The summary strip is for the current filter: Total Budget = the budgets of the
    accounts the Account / Supplier / Brand Manager / Year filters leave (search
    and dates do not change it); the other four sum the rows shown.

PAGE
  Ledger: Time Entered first (when a site-entered row was saved; imported rows read
    "Imported"; the DEFAULT SORT, newest entry on top, ties by Date), then the
    sheet's columns in order (Date, Year, Invoice, Vendor, Description, Brand
    Manager, Items Purchased, Total, Kohler Spend, Billback, Received, Code,
    Account, Notes; the File column was removed 2026-10-15 -- file_name stays on the
    account row, unused). EVERY COLUMN IN VIEW, NO SIDEWAYS SCROLL (Gavin,
    2026-10-15): fixed proportional widths (COLS[].w), wrapped cells, 13px type,
    the page uses the full width from 1100px and the header sticks under the top
    bar; under 1100px Year and Notes fold away (row view + CSV keep them).
    Sortable header, search, filters, 100 rows + Show More, labelled stacked rows
    under 760px, Export CSV (editors; Time Entered is its first column).
    Tap a row = Edit (editors) or a read-only view. "Added / Edited by <first
    name> <date>" on site-entered rows.
  Add Expense: Date (today), Account (search, grouped by supplier, code + brand
    manager under each; picked = "Code 423101 · Steve Halloran · Constellation ·
    CROWN/KOHLER TACTICAL"), Vendor (typeahead, new names allowed, Kohler one tap;
    the account's default vendor fills a blank box), Items Purchased, Invoice #,
    Total, Billback (0), Kohler Spend live, Received Yes / No (+ date), Notes;
    Save / Save and Add Another (keeps Date, Account, Vendor). The new row lands
    highlighted at the top of the Ledger and the strip updates.
  Budget tab: Account, Code, Brand Manager, Supplier, Budget Amount (tap to edit),
    Amount Spent, % to Budget + bar, Billback Outstanding, Rows; Add Account;
    Needs Review / Inactive chips; a row opens the account editor (editors) or
    filters the Ledger (readers).
  State: filters + sort in sessionStorage (kdh_sb_f / kdh_sb_sort); the view in
    the hash (#ledger, #budget, #new, #edit=<id>).

ROUND TWO (2026-10-15, Gavin; migration 20261015150000_budget_rules.sql)
  BILLBACK RULE per account (budget_accounts.billback_rule, set on the account sheet):
    50/50 Split (split) = the form fills Billback with half the Total until a
      billback is typed; No Split (none) = Billback locked at 0, Kohler Spend = Total;
      Enter Each Time (manual) = the old behaviour. CONSTELLATION / CROWN NEVER SPLIT
      (Gavin): any account whose name, supplier or description says Crown or
      Constellation is 'none', ENFORCED BY THE DATABASE on every insert and on any
      edit that touches the account, Total or Billback (a notes-only edit or a
      Received tap leaves an old row alone). Backfill: Crown / Constellation -> none;
      Budget Breakdown says 50/50, or the account's rows were mostly split exactly in
      half -> split; the rest -> manual. A re-run never overwrites a rule set on the
      site. Rows split before the rule (7 Crown rows on the 2026 tab, 1 on the 2025
      tab) keep their billback until edited or until the cleanup in
      ROADMAP "Now" runs.
  NEW ACCOUNT from the Add Expense picker: "+ New Account" (with the typed name)
    opens the account sheet for the expense's year and selects the new account. The
    Budget tab button reads "+ New Account" too. The picker lists the accounts of the
    EXPENSE's year (an old year's inactive accounts included), so a 2025 row can be
    moved between 2025 accounts; an account from another year is refused on save.
  SAVED VENDORS: every vendor saved on a row goes into budget_vendors (that already
    happened; the page just did not show it). Now: tapping the Vendor box lists the
    recent vendors, typing lists matches (starts-with first), the quick buttons are
    Kohler + the 5 most recently used, picking an account fills its default vendor or
    else the vendor last used on it, and a name typed in other capitals reuses the
    saved spelling (page + database). Uses count only on a new row or a vendor change.
  INVOICE LINKS: an editor opens "Invoice Links to Encompass" under the Ledger, pastes
    the address of ANY invoice open in Encompass and types that invoice's number; the
    page swaps the number for {invoice} and saves the template in budget_settings
    (key invoice_link; the database accepts only https://*.encompass8.com addresses
    containing {invoice}). Every NUMERIC invoice (3+ digits) then opens in Encompass
    in a new tab, in the table, the phone cards, the edit form and the read-only view;
    text invoices ("Expense (Steve)") stay plain. Turn Off deletes the setting. No
    Encompass address format is guessed in the code.
  EDITING PAST ROWS: any row opens in the edit form for an editor (it always did); what
    failed was validation. 39 imported 2026 rows are credits (negative Total) and 102
    rows on the 2025 tab had a Billback above the Total, so ANY edit of them was
    refused. Now an existing row is checked only on what changed: Total / Billback only
    when one of them changed (a credit's billback must sit between the Total and 0),
    the open-year date rule only when the date changed. The database applies the same
    rules to site rows; imported rows are still not range-checked.
  CROWN CLEANUP (optional, Gavin's call; SQL Editor, logged in supplier_expense_events):
    -- list the no-split rows that still carry a billback
    select e.expense_date, e.vendor, e.invoice, e.total_amount, e.billback_amount
      from public.supplier_expenses e join public.budget_accounts a on a.id = e.account_id
     where a.billback_rule = 'none' and e.billback_amount <> 0 order by e.expense_date;
    -- zero them (Kohler Spend becomes the Total)
    update public.supplier_expenses e set billback_amount = 0
      from public.budget_accounts a
     where a.id = e.account_id and a.billback_rule = 'none' and e.billback_amount <> 0;
  MESSAGES: a "saved" message shows once, on the screen it was sent to; it no longer
    rides along onto the next form (it did).

INVOICE DOCUMENTS (2026-10-16)
  Apply migrations 20261016150055_supplier_invoice_documents.sql and
  20261016150710_invoice_document_grants.sql. Already applied to the connected
  Kohler Dist Hub project during implementation; other environments need both.
  Private Storage bucket: supplier-invoices. Metadata: supplier_invoice_documents.
  No invoice PDFs or document metadata belong in this PUBLIC repository.
  Documents attach to the permanent supplier_expenses.id, never an array position
  or just an invoice number. Existing expense/account RLS controls metadata and
  file access; budget editors/program admins upload, scoped managers read.
  Created time and uploader name are stamped by the database. The grants migration
  removes inherited API TRUNCATE/TRIGGER/REFERENCES privileges (RLS does not cover
  TRUNCATE). API roles receive only SELECT/INSERT. No overwrite/delete policies:
  upload corrections as additional PDFs. An expense with supporting documents
  cannot be deleted until an administrator resolves its document retention.

  Ledger invoice cells and phone cards show View PDF, Open in Encompass, Missing
  PDF and (editors) Attach PDF. The saved expense edit/read view also has documents.
  New expenses must be saved first. PDF status failures say "unavailable", not
  "missing". View PDF creates a private signed link valid for 60 seconds, opening
  the browser PDF viewer (which also offers download). The supplied Kohler Encompass
  invoice address is the default; a saved invoice_link setting overrides it.
  Numeric ledger references open that source record; vendor invoice numbers which
  are not Encompass invoice IDs may not resolve in Encompass.

  BULK: Ledger -> Bulk Upload PDFs. Select up to 200 PDFs, at most 20 MB each.
  Recommended filenames: INVOICE Supplier.pdf. The matcher suggests only exact
  invoice tokens containing a digit; generic labels such as "Samples" are manual.
  Matches use all visible expenses, across years, rather than just the filtered
  screen. If the same invoice occurs on multiple rows/years, select the intended
  expense. Use Find an Expense for unmatched files. Review before Upload Reviewed
  PDFs; unmatched/invalid files are skipped, failures remain for retry. Files with
  the same SHA-256 on the same expense are skipped as duplicates. One invoice with
  multiple allocation rows needs explicit attachment to each intended expense.
  Successful uploads persist immediately; closing/reloading a batch keeps them.
  An upload whose metadata save fails keeps its immutable object for a safe retry
  in that dialog. An abandoned unlinked object is private and can be reviewed by
  an administrator. There is no automatic Encompass export/API integration.

  Verification (synthetic fixtures; tools/node_modules via npm ci --prefix tools):
    node tools/invoice-documents-sql-test.cjs
    node tools/invoice-documents-browser-test.cjs
  Browser suite uses installed Chrome, or KDH_BROWSER_CHANNEL for another channel.
  Screenshots are written beside the checkout, not into the public repo.

NOT IN V1 (on purpose)
  Approvals / sign-off;
  email reminders for outstanding billbacks; monthly / quarterly roll-ups; vendor
  management beyond the typeahead; deleting an account that has expenses;
  restoring a deleted expense (the event row keeps it; an editor re-enters it);
  the "Copy of Budget" tab; multi-year budgets (2025 is history only); dollars
  anywhere a rep can see.

TESTS (scratchpad)
  sql_budget_test.sh   65 checks (round two: rule backfill + re-run, Crown forced to
                       no split, pre-rule split rows, credits, old site rows, vendor
                       spelling + uses, settings RLS + Encompass-only check); before:
                       39 checks on local Postgres 16: flag, brand-key match, RLS
                       for editor / admin / brand manager by name / by brands / VP /
                       rep / anon, trigger rules, received stamp, events, imports.
  budget_test.mjs      167 checks (round two at 1366 light + 390 dark: no File column,
                       invoice links set / refused / clicked, credit row edited, Crown
                       row zeroed with the warning, 50/50 fill + typed value kept, New
                       Account from the picker, saved vendors, rule chips, contrast);
                       before: 78 checks: editor at 1366 light + 390 dark, admin at 820,
                       brand manager, VP, rep + preview refused, migration missing,
                       nav; stub budget_stub.mjs mirrors the RLS.

HISTORY
  Until 2026-10-14 this folder held expenses.csv (the Expenses tab, with dollars)
  and a generate.py that embedded it into index.html. Both are deleted from the
  tree; the CSV is still in git history until Gavin decides on a rewrite
  (ROADMAP "Tabled").
