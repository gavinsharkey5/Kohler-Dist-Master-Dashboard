On-Prem MPO Tracker

Tracks each rep's progress toward the on-premise Monthly Program
Objectives: Carbliss new buying accounts, Sapporo NA new buying
accounts, and Wine & Spirits placements.

Month tabs: data lives in a per-month snapshot folder,
data/<MONTH_KEY>/ (e.g. data/2026-07/), and index.html shows a tab
bar (the MONTHS array near the top of the <script>) so every past
month stays permanently viewable -- opening a new month's tab does
not touch or overwrite an older one. To add a new month once its RDE
exports/Snowflake tables are ready:
  1. Append an entry to MONTHS in index.html, e.g.
     {key:'2026-08', label:'August 2026', dir:'data/2026-08/'}.
  2. Set MONTH_KEY to the same key at the top of generate.py, update
     NEW_BUYER_WINDOW_START/END for the new month, and point the CSV
     filenames at that month's exports (or, for the Snowflake path,
     update sync_snowflake_data.py's output paths for this dashboard
     to data/<MONTH_KEY>/ -- see that script's TABLES_TO_EXPORT).
  3. Run generate.py -- it creates data/<MONTH_KEY>/ and writes the
     three JSON files (+ sync_meta.json) there, leaving every earlier
     month's folder untouched.
  4. Commit and push. The new tab appears automatically; the newest
     entry in MONTHS is NOT auto-selected as default -- MONTHS[0]
     (the first entry) loads on page open, so re-order MONTHS if the
     newest month should open by default.
Note: as of 2026-08, August's on-premise MPO objectives/programs are
themselves changing (different from July's Carbliss/Sapporo NA/Wine &
Spirits structure) -- adding an August tab will need matching updates
to OBJECTIVES, the builder functions, and possibly new CSV/JSON shapes
in generate.py, not just a new MONTHS entry and refreshed data.

Normally this page's data (data/<MONTH_KEY>/mpo_carbliss_new_buyers.json,
data/<MONTH_KEY>/mpo_sapporo_na_new_buyers.json,
data/<MONTH_KEY>/mpo_wine_spirits_placements.json) is refreshed
automatically by .github/workflows/snowflake-sync.yml running
sync_snowflake_data.py, which pulls straight from Snowflake tables
MPO_CARBLISS_NEW_BUYERS / MPO_SAPPORO_NA_NEW_BUYERS_ON /
MPO_WINE_SPIRITS_PLACEMENTS_ON. That workflow's schedule is currently
paused (see the workflow file); its output paths still target the
flat pre-month-tabs data/ folder and would need updating to match the
current month's data/<MONTH_KEY>/ before being re-enabled.

Files (for a manual refresh, when Kohler sends the RDE report exports
by hand instead):
  carbliss_new_buyers.csv     RDE "Carbliss (15) New Buying Accounts"
                               export: Sales Rep Name, Customer ID,
                               Customer Name, Premise, Brand Family,
                               Date, Buyers. The "Buyers" column is a
                               raw Encompass flag and is NOT trusted --
                               see classification logic below. As of the
                               2026-07-28 refresh RDE started exporting
                               this one under different headers (Sales
                               Rep Assigned / Customer Num, no Premise
                               column, two windowed "Buyer Count ..."
                               columns instead of one "Buyers" flag) --
                               generate.py's build_carbliss() accepts
                               either header set (see pick_col()); the
                               windowed Buyer Count columns aren't used
                               either way since classification is driven
                               off each row's own Date, and Premise
                               defaults to "On Premise" when absent
                               (this tracker is on-premise only).
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
  2. If refreshing for a new month, update MONTH_KEY and
     NEW_BUYER_WINDOW_START / NEW_BUYER_WINDOW_END at the top of
     generate.py, and add the matching entry to MONTHS in index.html
     (see "Month tabs" above).
  3. Run: python3 generate.py -- it prints how many customers
     qualified as new buyers out of how many appeared in the export,
     worth a sanity check against what you'd expect, and confirms
     which data/<MONTH_KEY>/ folder it wrote to.
  4. Commit and push.
