Off-Prem MPO Tracker

Tracks each rep's progress toward the off-premise Monthly Program
Objectives: New Belgium 90%-of-goal distribution, Sapporo Light
placements, Wine & Spirits (2XO/Le Grand Noir/YaVe) placements, and
Famosa 7oz placements.

Month tabs: data lives in a per-month snapshot folder,
data/<MONTH_KEY>/ (e.g. data/2026-07/), and index.html shows a tab
bar (the MONTHS array near the top of the <script>) so every past
month stays permanently viewable -- opening a new month's tab does
not touch or overwrite an older one. To add a new month once its RDE
exports/Snowflake tables are ready:
  1. Append an entry to MONTHS in index.html, e.g.
     {key:'2026-08', label:'August 2026', dir:'data/2026-08/'}.
  2. Set MONTH_KEY to the same key at the top of generate.py and
     point the five CSV filenames at that month's exports (or, for
     the Snowflake path, update sync_snowflake_data.py's output paths
     for this dashboard to data/<MONTH_KEY>/ -- see that script's
     TABLES_TO_EXPORT).
  3. Run generate.py -- it creates data/<MONTH_KEY>/ and writes the
     five JSON files (+ sync_meta.json) there, leaving every earlier
     month's folder untouched.
  4. Commit and push. The new tab appears automatically; the newest
     entry in MONTHS is NOT auto-selected as default -- MONTHS[0]
     (the first entry) loads on page open, so re-order MONTHS if the
     newest month should open by default.
Note: as of 2026-08, August's off-premise MPO objectives/programs are
themselves changing (different from July's New Belgium/Sapporo
Light/W&S 2XO/Famosa structure) -- adding an August tab will need
matching updates to OBJECTIVES and generate.py's builders, not just a
new MONTHS entry and refreshed data.

Normally this page's data (the five files in data/<MONTH_KEY>/) is
refreshed automatically by .github/workflows/snowflake-sync.yml
running sync_snowflake_data.py, which pulls straight from Snowflake
tables MPO_NEW_BELGIUM_ACTUALS_OFF / MPO_NEW_BELGIUM_90GOALS_OFF /
MPO_WINE_SPIRITS_2XO_OFF / MPO_SAPPORO_LIGHT_OFF / MPO_FAMOSA_OFF.
That workflow's schedule is currently paused (see the workflow file);
its output paths still target the flat pre-month-tabs data/ folder
and would need updating to match the current month's
data/<MONTH_KEY>/ before being re-enabled.

Files (for a manual refresh, when Kohler sends the RDE report exports
by hand instead):
  new_belgium_90goals.csv   RDE "New Belgium 90% Goals" export: Sales
                            Rep Name, Product #, Product Name, Package
                            Type, Goal90 -- each rep's assigned 90%
                            distribution goal, one row per product.
  new_belgium_actuals.csv   RDE "New Belgium May-July Distribution
                            Report": Sales Rep Name, Package Group,
                            Product Num Name (product # + name
                            combined in one field), Placements.
                            index.html joins this against the goals
                            file itself (by rep + product number,
                            falling back to rep + normalized product
                            name) -- generate.py does NOT pre-merge
                            these two.
  sapporo_light.csv         RDE "Sapporo (5) Sapporo Light Placements"
                            export: Sales Rep Assigned, Customer Num,
                            Customer Name, Product Num, Product Name,
                            Brand, Date, Placement Count.
  wine_spirits_2xo.csv      RDE "Wine & Spirits (2XO/Le Grand
                            Noir/YaVe) Placements" export: same shape
                            as sapporo_light.csv plus Brand Family
                            instead of Brand.
  famosa.csv                RDE "Famosa 7oz Urban Market Placements"
                            export: same shape as wine_spirits_2xo.csv.
  generate.py               Rebuilds the five JSON files in data/.
  index.html                The page itself.

All five conversions here are simple passthroughs -- column values are
used exactly as exported, no reclassification (unlike the On-Prem
tracker's Carbliss new-buyer fix).

To refresh manually:
  1. Save the new exports over the five CSVs above (same column
     headers -- the "Placement Count ..." header's trailing text can
     shift between exports, generate.py matches by column-name prefix,
     not the exact string).
  2. If refreshing for a new month, update MONTH_KEY at the top of
     generate.py and add the matching entry to MONTHS in index.html
     (see "Month tabs" above).
  3. Run: python3 generate.py -- it confirms which data/<MONTH_KEY>/
     folder it wrote to.
  4. Commit and push.
