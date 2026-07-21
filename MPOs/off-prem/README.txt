Off-Prem MPO Tracker

Tracks each rep's progress toward the off-premise Monthly Program
Objectives: New Belgium 90%-of-goal distribution, Sapporo Light
placements, Wine & Spirits (2XO/Le Grand Noir/YaVe) placements, and
Famosa 7oz placements.

Normally this page's data (the five files in data/) is refreshed
automatically by .github/workflows/snowflake-sync.yml running
sync_snowflake_data.py, which pulls straight from Snowflake tables
MPO_NEW_BELGIUM_ACTUALS_OFF / MPO_NEW_BELGIUM_90GOALS_OFF /
MPO_WINE_SPIRITS_2XO_OFF / MPO_SAPPORO_LIGHT_OFF / MPO_FAMOSA_OFF.

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
  2. Run: python3 generate.py
  3. Commit and push.
