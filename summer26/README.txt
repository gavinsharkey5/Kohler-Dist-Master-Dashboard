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

THC Volume Rewards (added 2026-08-05): its own tab on the SAME page
(index.html), toggled by the "Summer of Success" / "THC Volume Rewards"
buttons at the very top of <body> -- a pure display:none/block switch
between two sibling containers, #view-summer (the entire tracker
above, byte-for-byte unchanged) and #view-thc (new). Built as a fully
independent tab rather than folded into the existing tracker because
its reward structure doesn't fit either pattern the tracker already
knows:
  - The tracker's per-supplier Qualifier/Amplify goals are PERSONALIZED
    per rep (goals.csv -- one rep's goal differs from another's).
  - The static "Rewards Payouts" grid at the top is a company-wide
    AGGREGATE route-volume threshold (e.g. +25,000 case equivalents
    total across every rep combined).
  - THC (confirmed with Gavin, 2026-08-05) is a FLAT per-rep
    threshold -- Delta Tier 1 = 50 cases, Crescent Canna Tier 1 = 20 /
    Tier 2 = 10 cases, same number for every rep -- and Crescent Canna
    has two dollar tiers where the tracker's Qualifier concept is
    pass/fail, one tier only.
  Building THC as its own tab means a mistake in its code can't touch
  DATA/build()/render()/etc. in the tracker that's already running in
  production -- #view-thc has its own fetch (bootTHC()), its own
  render functions (all prefixed thc*), its own DOM ids, and only reads
  (never writes) the tracker's REPS/EXCLUDE/esc/money globals.

  thc_sales.csv   RDE "2026 Summer of Success THC" export: Sales Rep
                  Assigned, Supplier, Brand Family, Case Equiv for the
                  matching 6/1-8/31 windows in 2025 vs 2026, Case Equiv
                  Unit Difference. Same shape as sales.csv minus the
                  "Qualifier Brands" column -- THC has no personalized
                  per-rep goal to tag, so there's nothing for that
                  column to carry.
  generate_thc.py Rebuilds data/thc.json (+ data/thc_sync_meta.json)
                  from thc_sales.csv. Does NOT touch generate.py, its
                  two CSVs, or its two output JSON files -- entirely
                  separate pipeline.
  data/thc.json, data/thc_sync_meta.json
                  Fetched by index.html's bootTHC() the same way the
                  tracker fetches its own JSON -- if these 404, the
                  THC tab silently renders empty (bootTHC() returns
                  early), it does NOT throw or affect the tracker tab.

  The tier thresholds, dollar amounts, and the $1/case Amplify rate
  live in index.html as a hardcoded THC_TIERS JS object (search for
  "const THC_TIERS") -- there's no data source for these numbers, they
  came directly from Kohler. If a threshold or payout changes, edit
  THC_TIERS; only case-volume data flows through thc_sales.csv/
  generate_thc.py.

To refresh THC manually:
  1. Save the new export over thc_sales.csv (same column headers).
  2. Run: python3 generate_thc.py
  3. Commit and push.
  (If Kohler changes a tier threshold or dollar amount, also edit
  THC_TIERS in index.html -- generate_thc.py only rebuilds the volume
  data, not the reward config.)

Payout recap workbook (added 2026-09-01):
  Summer_of_Success_Recap.xlsx  Four-tab qualifier/amplify payout model --
                  Recap (rep x supplier), Program Setup (every constant plus
                  the rules and open questions), Amplify Detail (rep x
                  supplier x brand, since amplify pays PER BRAND on cases
                  above that brand's goal), Rep Totals.
  make_sos_recap.py             Rebuilds it from sales.csv + goals.csv:
                    python3 make_sos_recap.py

Only labels, the qualifier goal, the CE figures and the Program Setup
constants are values; everything else is a live formula, so editing a tier
threshold or a rate multiplier on Program Setup re-runs the whole model.
Blue text marks the typed-in cells, per the workbook's own convention.

goals.csv IS read by this script -- note that the "now-unused source files"
line above applies to generate.py and index.html only. goals.csv carries the
per-rep qualifier goals, and it names BRAND GROUPS ("Modelo/Corona") where
sales.csv names suppliers; the qualifier rows' own "Qualifier: <brands>" tag
is what ties the two together. Same trick joins the amplify goals.

Managers come from incentive-tracking/index.html's DM_GROUPS, the repo's one
rep->DM roster -- if that constant is renamed or moved, this script raises
rather than silently emptying the Manager column.

The workbook carries formulas with no cached values (openpyxl cannot compute
them, and LibreOffice takes too long on a model this size to be worth
wiring in). Excel calculates on open, so the numbers appear on first
opening; the same was true of the hand-built workbook this replaces. If you
need a version with values baked in, open it in Excel and save.

Refresh order: overwrite sales.csv, run generate.py (dashboard), then
make_sos_recap.py (workbook), so both come from the same export.
