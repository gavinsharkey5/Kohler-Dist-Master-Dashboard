Summer of Success tracker

Tracks each rep's progress toward the Summer 2026 (Jun-Aug) supplier
Qualifier/Amplify goals, plus tiered route-volume reward payouts.

Normally this page's data (data/summer_of_success_full.json and
data/summer_of_success_mtd_trend.json) is refreshed automatically by
.github/workflows/snowflake-sync.yml running sync_snowflake_data.py,
which pulls straight from Snowflake tables
KOHLER_DASH.PUBLIC.SUMMER_OF_SUCCESS_FULL / _MTD_TREND.

Files (for a manual refresh, when a fresh Snowflake sync isn't
available and Kohler instead sends the two RDE report exports by
hand):
  sales.csv    RDE "2026 Summer of Success" export (season-to-date:
               Sales Rep Assigned, Qualifier Brands, Supplier, Brand
               Family, Case Equiv for the matching 6/1-8/31 windows in
               2025 vs 2026, Case Equiv Unit Difference).
  trend.csv    RDE "2026 Summer of Success MTD Trend" export (same
               columns, but month-to-date window instead of full
               season, plus Case Equiv Percentage Difference).
  generate.py  Rebuilds data/summer_of_success_full.json and
               data/summer_of_success_mtd_trend.json from the two
               CSVs above, in exactly the column-name format
               sync_snowflake_data.py's `SELECT *` would produce, so
               index.html doesn't care which path built the JSON.
  index.html   The page itself.

To refresh manually:
  1. Save the new exports over sales.csv / trend.csv (same column
     headers -- the date range embedded in the "Case Equiv ..." header
     text can shift between exports, generate.py matches by which
     year appears in the header, not the exact string).
  2. Run: python3 generate.py
  3. Commit and push.

goals.csv and data.csv in this folder are earlier, now-unused source
files from before the Snowflake sync was set up -- left in place for
reference, not read by generate.py or index.html.
