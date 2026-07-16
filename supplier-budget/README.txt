Supplier Marketing Budget Tracker

Every supplier's marketing budget vs. Kohler's actual spend, plus billback
received/outstanding, rolled up from the raw expense ledger.

Files:
  expenses.csv   The "Expenses" tab of Supplier Budgets Tracker.xlsx, exported
                 as-is (pivot-summary header rows and all — generate.py skips
                 down to the real transaction rows on its own).
  generate.py    Rebuilds the embedded DATA in index.html from expenses.csv.
  index.html     The page itself.

To refresh with a new export:
  1. Re-export the Expenses tab, same columns, save over expenses.csv.
  2. Run: python3 generate.py
  3. Commit and push.

IMPORTANT — budgets are not in expenses.csv:
Per-supplier budget targets live on a separate "Budget" tab of the workbook
that isn't part of this export. They're hardcoded in SUPPLIER_BUDGETS at the
top of generate.py and must be updated by hand there when a budget changes.
Reconciled against the Budget tab on 2026-07-16 (sum of SUPPLIER_BUDGETS now
matches its $3,020,611.00 Total Budget exactly). If a future expenses.csv
Total Budget header no longer matches the sum this script prints, re-export
the Budget tab and reconcile SUPPLIER_BUDGETS against it again the same way.

ACCOUNT_SUPPLIER_MAP (also in generate.py) maps each raw "Account" column
value — or, when Account is blank, "DESC::<Description>" — to the supplier
it rolls up to. This mapping isn't derivable from the export itself; it was
reconstructed by reading the tracker's previously-generated data plus manual
review of any new accounts. When a future export introduces an account this
script doesn't recognize, that spend is filed under a "(Unmapped)" pseudo-
supplier (with $0 budget) instead of silently vanishing, and generate.py
prints a warning listing exactly which account/description values need a new
entry added to ACCOUNT_SUPPLIER_MAP.
