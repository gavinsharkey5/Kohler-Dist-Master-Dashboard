On-Prem MPO Tracker

Tracks each rep's progress toward the on-premise Monthly Program
Objectives: Carbliss new buying accounts, Sapporo NA new buying
accounts, and Wine & Spirits placements.

Normally this page's data (data/mpo_carbliss_new_buyers.json,
data/mpo_sapporo_na_new_buyers.json, data/mpo_wine_spirits_placements.json)
is refreshed automatically by .github/workflows/snowflake-sync.yml
running sync_snowflake_data.py, which pulls straight from Snowflake
tables MPO_CARBLISS_NEW_BUYERS / MPO_SAPPORO_NA_NEW_BUYERS_ON /
MPO_WINE_SPIRITS_PLACEMENTS_ON.

Files (for a manual refresh, when Kohler sends the RDE report exports
by hand instead):
  carbliss_new_buyers.csv     RDE "Carbliss (15) New Buying Accounts"
                               export: Sales Rep Name, Customer ID,
                               Customer Name, Premise, Brand Family,
                               Date, Buyers. The "Buyers" column is a
                               raw Encompass flag and is NOT trusted --
                               see classification logic below.
  sapporo_na_new_buyers.csv   RDE "Sapporo (2) New Buying Accounts"
                               export: same shape plus Product Name,
                               New Buyers (this flag IS used as-is --
                               no known issue with it).
  wine_spirits_placements.csv RDE "Wine & Spirits (3) Placements"
                               export: Sales Rep Assigned, Product Num,
                               Product Name, Customer Num, Customer
                               Name, Premise, Date, Placement Count for
                               the current month (passthrough, no
                               classification needed).
  generate.py                 Rebuilds the three JSON files above.
  index.html                  The page itself.

Carbliss new-buyer classification (per Kohler, 2026-07-21):
Encompass's own "New Buyers" flag in the Carbliss export has been
wrong -- e.g. Orange Lantern was flagged as a new buyer despite having
bought Carbliss in both June and July. generate.py ignores that column
entirely and instead classifies purely from each customer's purchase
dates in the file: a customer is a new buyer if they have NO Carbliss
purchase before NEW_BUYER_WINDOW_START and AT LEAST ONE purchase in
[NEW_BUYER_WINDOW_START, NEW_BUYER_WINDOW_END] (both hardcoded at the
top of generate.py -- currently July 2026, update them each month this
is refreshed by hand). Every transaction row is kept in the output
(the dashboard's rep detail view shows full activity, not just
qualifying rows) -- NEW_BUYERS is set to 1 on exactly the customer's
first qualifying purchase in the window and 0 on every other row for
that customer, including any later purchases in the same window, so a
repeat purchase never double-counts toward a rep's 15-account goal.

Sapporo NA and Wine & Spirits are simple passthroughs -- their columns
are used as exported, no reclassification.

To refresh manually:
  1. Save the new exports over carbliss_new_buyers.csv /
     sapporo_na_new_buyers.csv / wine_spirits_placements.csv (same
     column headers).
  2. If refreshing for a new month, update NEW_BUYER_WINDOW_START /
     NEW_BUYER_WINDOW_END at the top of generate.py.
  3. Run: python3 generate.py -- it prints how many customers
     qualified as new buyers out of how many appeared in the export,
     worth a sanity check against what you'd expect.
  4. Commit and push.
