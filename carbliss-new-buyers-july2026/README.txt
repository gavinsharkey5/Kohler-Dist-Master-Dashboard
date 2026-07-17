Carbliss New Buying Accounts — July 2026

Tracks which accounts bought Carbliss for the first time in July 2026,
plus each rep's open whitespace opportunities.

Files:
  data.csv           RDE Carbliss export: Sales Rep Assigned, Brand
                      Family, Customer Num, Customer Name, Buyer Count
                      for 4/1-6/30/2026 (baseline) and 7/1-7/31/2026.
                      Carbliss buyers only.
  full_accounts.csv  Fusion export: Sales Rep Assigned, Customer Num,
                      Customer Name, Buyer Count 2026 — each rep's
                      curated list of true Carbliss TARGET accounts (not
                      their whole book). An earlier version of this file
                      (replaced 2026-07-17) had every account that
                      bought anything in 2026, which overstated
                      Opportunities (1,159 vs. the correct 849) — if the
                      opportunity count ever looks too high again,
                      double-check this file is the target list, not a
                      general active-account roster.
  generate.py         Rebuilds the embedded DATA in index.html.
  index.html           The page itself.

New buyer logic (per Kohler, 2026-07-17):
  - Bought in both periods -> repeat buyer, NOT new.
  - Bought Apr-Jun but not July -> churned (bought before, not now).
  - Did NOT buy Apr-Jun but DID buy July -> new buyer.

Opportunities (per Kohler, 2026-07-17): accounts on a rep's target
account list (full_accounts.csv) with NO Carbliss purchase history at
all in data.csv — not new, not repeat, not churned. True whitespace,
distinct from Churned (a Carbliss buyer who stopped). Reps with zero
current Carbliss accounts still show up in the By Rep table if they
have any opportunities.

UI structure:
  - "By Rep" table: clicking a rep's ROW expands a two-column New
    Buyers / Repeat Buyers account list nested under them.
  - The Opportunities NUMBER in that same row is a separate click
    target (does not toggle the row) — clicking it sets the Opportunities
    section's rep filter to that rep and smooth-scrolls down to it.
  - "Opportunities" section (below By Rep): a standalone filterable/
    searchable table, defaulting to "All reps", showing every target
    account with no Carbliss history. Columns are Rep, Account #,
    Account — Customer Num always comes before the account name,
    per Kohler's preference, everywhere accounts are listed on this page.

Churned accounts are still computed (rep_summary[i]["churnedAccounts"]
in the JSON) but not rendered anywhere, since that wasn't asked for —
ask if a churned win-back list would be useful too.

To refresh:
  1. Save the new Carbliss export over data.csv, and/or the new Fusion
     target-account export over full_accounts.csv (same column headers —
     if the baseline/current period dates change, update
     PRIOR_COL/JULY_COL at the top of generate.py to match).
  2. Run: python3 generate.py
  3. Commit and push.
