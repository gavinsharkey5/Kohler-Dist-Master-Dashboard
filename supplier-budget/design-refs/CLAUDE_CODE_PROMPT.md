I want to turn the Supplier Budgets Tracker workbook into a section of kohlerdisthub for Alexis
Derrickson (Office Assistant, Hawthorne; already in allowed_users as a manager). Today she types every
column of the "Expenses 2026" tab by hand. I want a guided entry workflow on the site that asks only for
what she actually decides, derives the rest, and writes each entry straight into a table that looks like
the raw sheet. Read CLAUDE.md first (COPY + LAYOUT STANDARD, public-repo rule, Supabase conventions) and
the existing `supplier-budget/` folder before planning.

## The workbook (I will attach `Supplier_Budgets_Tracker_v1_2.xlsx` in this session; NEVER commit it)
- **Expenses 2026** (987 rows): Date, Year, Invoice, Vendor Name, Description, Brand Manager (formula),
  Items Purchased, Total Amount, Kohler Spend (formula = Total − Billback), Billback Amt, Billback
  Received? (Y/N), Reference # (blank on every row — drop it), Code (GL, e.g. 423101), Account (e.g.
  "CROWN- TACTICAL"), File Name, Notes. Header rows 1–6 are a pivot summary (Total Budget, Kohler Spend,
  % to Budget, Billback Received / Outstanding) with a supplier picker (data validation on Budget!F5:F68).
- **Budget**: one row per Account — Year, Code, Brand Manager, Supplier, Account, Vendor Name,
  Description, Budget Amount, Amount Spent (SUMIF of Kohler Spend by Account), % to Budget.
- **Budget Breakdown**: per-brand budget basis text (".25 cents/Case", "50/50 Split") + total.
- The other tabs are copies / 2025 history. 2025 may be imported as read-only history.

KEY FACT: once the Account is chosen, Code, Brand Manager, Supplier, Description and File Name are fixed
by the Budget row. Kohler Spend = Total − Billback. So an entry is really: Date, Account, Vendor, Items
Purchased, Total Amount, Billback Amt, Billback Received?, optional Invoice # and Notes.

## Where the data lives
The repo is PUBLIC and this is dollars by vendor, so NOTHING from the workbook goes in the repo. All of
it lives in Supabase with row-level security, following the patterns already in `supabase/migrations/`
(allowed_users flags like photo_admin; kdh_* RPCs; stamp the author from the token, never trust the page).
Propose tables along these lines, adjust if the code suggests better:
- `budget_accounts` (year, code, account, supplier, brand_manager, description, file_name,
  budget_amount, basis_text, active)
- `supplier_expenses` (expense_date, year, invoice, vendor, items_purchased, total_amount, billback_amount,
  billback_received bool, received_date, notes, account_id -> budget_accounts; kohler_spend is a generated
  column = total − billback; created_by / created_at / updated_by / updated_at)
- `supplier_expense_events` (who changed what, when) — an audit trail, because this is money.
- `vendors` (name only, for typeahead; seeded from distinct Vendor Name values — 80 today).
Permissions: a new `allowed_users.budget_editor boolean` flag (set by hand in Supabase, like photo_admin)
= may add / edit expenses and budget rows. READ: budget_editor and program_admin see everything; a brand
manager sees only accounts whose supplier / brand family matches `kdhBrandScope()` (same rule as the hub
and Inventory); a hybrid DM-with-brands sees their brands; reps see nothing (page not in REP_PATHS, page
refuses a rep cookie or rep preview). Dollars never reach a rep page.
Write a one-time seed script `supplier-budget/seed_from_workbook.py <xlsx>` that reads the workbook and
writes git-ignored `supabase/data/supplier_budget_seed.sql` for me to paste into the SQL Editor
(Budget tab -> budget_accounts; Expenses 2026 -> supplier_expenses; 2025 tab -> history, flagged).
Report row counts and any Account values in Expenses that have no Budget row (there are some: 110
distinct Accounts in Expenses vs ~64 on Budget) — list them, don't guess a mapping.
Then: the current `supplier-budget/` page embeds `expenses.csv` (real amounts) in the public repo. Rebuild
that page to read Supabase instead, delete expenses.csv and the embedded data, and tell me it needs a
history rewrite to fully remove (I'll decide).

## The page: /supplier-budget/ (managers only)
Mobile-first per CLAUDE.md, but Alexis works on a desktop most of the day — make the desktop layout
first-class too (960px column; the table may use the full width on >= 1280px).

1. **Ledger** (the "raw data view" — keep it): a table with the same columns in the same order as the
   sheet (Date · Year · Invoice · Vendor · Description · Brand Manager · Items Purchased · Total · Kohler
   Spend · Billback · Received · Code · Account · File · Notes). Sticky header, sortable, search, filters
   for Account / Supplier / Brand Manager / Received / date range, newest first, 100 rows then Show More.
   Summary strip above it = the sheet's header block: Total Budget, Kohler Spend, % to Budget, Billback
   Received, Billback Outstanding — for the current filter (so picking one supplier gives "Selected
   Supplier Budget"). Phones: labelled stacked rows per the page standard. Export CSV (budget_editor and
   admins only) of exactly the filtered view.
2. **Add Expense** (the workflow): a full-screen form opened from a primary "Add Expense" button.
   Order and behavior:
   - Date (default today), Account (searchable picker over active budget_accounts, grouped by Supplier;
     shows Code and Brand Manager under each option). Picking it fills a read-only line:
     "Code 423101 · Steve Halloran · Constellation · CROWN/KOHLER TACTICAL".
   - Vendor (typeahead over `vendors`, allow a new name; "Kohler" is the most common — keep it one tap).
   - Items Purchased (text), Invoice # (optional).
   - Total Amount, Billback Amt (default 0); Kohler Spend computed live and shown, not typed.
   - Billback Received? (Yes / No segmented, default No); Notes (optional).
   - Save, or "Save and Add Another" which keeps Date, Account and Vendor (she enters runs of similar
     rows — e.g. several Yankees suite statements under the same account).
   - On save: the row appears at the top of the Ledger with a highlight; the summary strip updates.
   Validation: Account and Total required; Billback <= Total; dates within the open year.
3. **Edit / Mark Received**: tapping a ledger row opens the same form prefilled; Billback Received
   flips with one tap from the row (writes received_date = today). Every change writes an event; the
   row shows "edited by <name> <date>" in its detail.
4. **Budget** tab: the Budget sheet as a table (Account, Code, Brand Manager, Supplier, Budget Amount,
   Amount Spent, % to Budget with a bar, Billback Outstanding), editable budget amounts for
   budget_editor, add an account. Amount Spent and % come from supplier_expenses, never typed.
5. Nav: manager home card "Supplier Budgets" (Warehouse & Inventory / Planning & Finance group — pick the
   right one) and the sidebar; hidden for reps.

## Before writing code
1. Read `supplier-budget/`, `supabase/README.txt`, the merchandising migration (closest pattern: records
   with an author stamp, RLS, an admin flag) and `shared/kdh-user.js` (kdhBrandScope, kdhTeam).
2. Propose: the schema + RLS (SQL), how the seed handles Accounts missing from Budget, the page
   structure, and what you will NOT build in v1.
3. Ask me anything unclear. Then build after I confirm; verify at 390 / 820 / 1366 light and dark; write
   the SQL tests the repo's other migrations have (local Postgres), and update ROADMAP.md with the steps I
   must take (run the migration, paste the seed, set budget_editor for Alexis).
