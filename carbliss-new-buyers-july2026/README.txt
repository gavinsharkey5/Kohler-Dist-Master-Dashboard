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

The "By Rep" table rows are clickable/expandable — clicking a rep opens
a New Buyers / Repeat Buyers account list nested right under their row,
instead of a separate flat searchable table. Churned accounts are still
only shown as a count (not broken into their own list) since that
wasn't asked for — the account-level detail is there in generate.py's
output (rep_summary[i]["churnedAccounts"]) if a win-back list ever gets
requested, just not rendered.
