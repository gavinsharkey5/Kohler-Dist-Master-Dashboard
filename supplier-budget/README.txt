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
  Description, Brand Manager, Code and File on a ledger row come from the ACCOUNT
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
    Account, File, Notes). EVERY COLUMN IN VIEW, NO SIDEWAYS SCROLL (Gavin,
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

NOT IN V1 (on purpose)
  File attachments (File Name is text, as on the sheet); approvals / sign-off;
  email reminders for outstanding billbacks; monthly / quarterly roll-ups; vendor
  management beyond the typeahead; deleting an account that has expenses;
  restoring a deleted expense (the event row keeps it; an editor re-enters it);
  the "Copy of Budget" tab; multi-year budgets (2025 is history only); dollars
  anywhere a rep can see.

TESTS (scratchpad)
  sql_budget_test.sh   39 checks on local Postgres 16: flag, brand-key match, RLS
                       for editor / admin / brand manager by name / by brands / VP /
                       rep / anon, trigger rules, received stamp, events, imports.
  budget_test.mjs      78 checks: editor at 1366 light + 390 dark, admin at 820,
                       brand manager, VP, rep + preview refused, migration missing,
                       nav; stub budget_stub.mjs mirrors the RLS.

HISTORY
  Until 2026-10-14 this folder held expenses.csv (the Expenses tab, with dollars)
  and a generate.py that embedded it into index.html. Both are deleted from the
  tree; the CSV is still in git history until Gavin decides on a rewrite
  (ROADMAP "Tabled").
