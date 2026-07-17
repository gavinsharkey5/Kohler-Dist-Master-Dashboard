Carbliss New Buying Accounts — July 2026

Tracks which accounts bought Carbliss for the first time in July 2026,
by comparing two Buyer Count columns from an RDE export:
  - 4/1/2026 - 6/30/2026 (baseline period)
  - 7/1/2026 - 7/31/2026 (the month being evaluated)

New buyer logic (per Kohler, 2026-07-17):
  - Bought in both periods -> repeat buyer, NOT new.
  - Bought Apr-Jun but not July -> churned (bought before, not now).
  - Did NOT buy Apr-Jun but DID buy July -> new buyer.

Files:
  data.csv       The RDE export as-is.
  generate.py    Rebuilds the embedded DATA in index.html from data.csv.
  index.html     The page itself.

To refresh with a new month's export:
  1. Save the new export over data.csv (same column headers — if the
     baseline/current period dates change, update PRIOR_COL/JULY_COL at
     the top of generate.py to match the new header text exactly).
  2. Run: python3 generate.py
  3. Commit and push.

Note: this only builds a detailed list for New buyers, per what was
asked for. Churned counts are shown in the summary/by-rep table for
context but don't get their own account-level list — ask if a win-back
list for churned accounts would be useful too.
