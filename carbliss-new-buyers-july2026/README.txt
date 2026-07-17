Carbliss New Buying Accounts — July 2026

Tracks which accounts bought Carbliss for the first time in July 2026,
plus each rep's open whitespace opportunities.

Files:
  data.csv           RDE Carbliss export: Sales Rep Assigned, Brand
                      Family, Customer Num, Customer Name, Buyer Count
                      for 4/1-6/30/2026 (baseline) and 7/1-7/31/2026.
                      Carbliss buyers only.
  full_accounts.csv  Fusion export: Sales Rep Assigned, Customer Num,
                      Customer Name, Buyer Count 2026 — every account
                      that bought ANYTHING in 2026 (each rep's full
                      book), not Carbliss-specific. Used only to compute
                      Opportunities.
  generate.py         Rebuilds the embedded DATA in index.html.
  index.html           The page itself.

New buyer logic (per Kohler, 2026-07-17):
  - Bought in both periods -> repeat buyer, NOT new.
  - Bought Apr-Jun but not July -> churned (bought before, not now).
  - Did NOT buy Apr-Jun but DID buy July -> new buyer.

Opportunities (per Kohler, 2026-07-17 — replaced an earlier "Churned"
column in the UI): accounts on a rep's full 2026 account list
(full_accounts.csv) with NO Carbliss purchase history at all in
data.csv — not new, not repeat, not churned. True whitespace, distinct
from Churned (a Carbliss buyer who stopped). Reps with zero current
Carbliss accounts still show up in the By Rep table if they have any
opportunities, since they're exactly who'd want to see that list.

The "By Rep" table rows are clickable/expandable — clicking a rep opens
a three-column New Buyers / Repeat Buyers / Opportunities account list
nested under their row. Each account line shows the Customer Num before
the name. Churned accounts are still computed (rep_summary[i]
["churnedAccounts"] in the JSON) but not rendered anywhere, since that
wasn't asked for — ask if a churned win-back list would be useful too.

To refresh:
  1. Save the new Carbliss export over data.csv, and/or the new Fusion
     full-roster export over full_accounts.csv (same column headers —
     if the baseline/current period dates change, update
     PRIOR_COL/JULY_COL at the top of generate.py to match).
  2. Run: python3 generate.py
  3. Commit and push.
