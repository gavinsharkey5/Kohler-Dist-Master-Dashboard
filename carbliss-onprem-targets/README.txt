Carbliss On-Premise Targets

Turns the "Carbliss Eval vs Sun Cruiser & White Claw" RDE exports into a
per-account sales-pitch generator: every on-premise account with real
Sun Cruiser or White Claw volume, sized by opportunity, with a
computed talking-point pitch (best-selling item, whether it's new or
established, how many SKUs move through the account).

Flavor recommendation logic (updated 2026-07-20 per Kohler): if a
flavor already sells well through the account via Sun Cruiser/White
Claw, the pitch does NOT recommend Carbliss in that same flavor —
that's competing head-on with an already-satisfied craving. Instead it
recommends a genuinely different flavor (gap_flavor) that's real white
space on their menu, preferring one from a different flavor family than
whatever's already dominant, so Carbliss adds breadth to the menu
instead of cannibalizing a proven seller.

UI (updated 2026-07-20 per Kohler): the account list is a sortable,
filterable table — the same format as the /carbliss/ "Placement Gap
Tracker" page, minus its Channel column (every account here is
already on-premise-only, so a Channel column would be redundant).
Columns: Account, Rep, Territory, Sun Cruiser (cs), White Claw (cs),
Combined Volume, Carbliss?, Gap Size, Pitch. Filters: search, Rep,
Territory, a Gap threshold (cases) number input, and a "Gap accounts
only" checkbox. A gap account = no Carbliss yet with combined SC+WC
volume at or above the threshold; Gap Size shows that combined volume
for gap accounts and an em dash otherwise. Clicking Pitch expands a
row with the account's brand-level case counts (2025→2026) and the
same pitch bullets/flavor tags the old card view showed, plus a copy
button. Any column header sorts the table; default sort is Combined
Volume, biggest first.

Files:
  accounts.csv   RDE "Carbliss Eval vs Sun Cruiser & White Claw" export
                 (Sales Rep Assigned, Customer ID, Customer Name, Shipping
                 Address, City, On Premise, Brand Family, Product Num Name,
                 Cases/Buyer Count 2025 vs 2026 — one row per customer/brand/
                 product, since Product Num Name was added 2026-07-21; cases
                 and buyer counts are summed across a brand's product rows
                 per account in generate.py, not just the last row read)
  price_vol.csv  RDE "...Price & Vol" export
                 (SKU-level price, cases, and $ volume per account, both brands + Carbliss)
  generate.py    Rebuilds the embedded data in index.html from the two CSVs above
  index.html     The page itself (data is embedded in the <script id="tg-data"> tag)

To refresh with new exports:
  1. Re-export both RDE reports, keeping the same columns.
  2. Save them over accounts.csv and price_vol.csv in this folder (same filenames).
  3. Run: python3 generate.py
  4. Commit and push.

City comes straight from accounts.csv's own City column (added
2026-07-21) — 100% of accounts resolve directly from the source export
now. The old cross-reference lookup from other trackers in this repo
(molsoncoors/retention/data.csv, carbliss/data.csv, isellbeer's
DisplayPhotoReport.csv) is kept only as a fallback for the rare case a
future export drops the City column or leaves it blank for an account.

accounts.csv's Product Num Name column (also added 2026-07-21) isn't
used for flavor detection — cross-checked against price_vol.csv's
Product Name and found to be a perfect match on every (customer,
product) pair (identical cases both years, zero mismatches across
2,689 rows), so price_vol.csv remains the single source for per-SKU
flavor coverage and pricing; accounts.csv is the source for
account-level brand totals (Sun Cruiser/White Claw/Carbliss cases by
year) and now City.

Flavor mapping and the "gap" ranking (most broadly-carried missing flavor,
preferring one from a different flavor family than the pitched SKU) are
both defined at the top of generate.py — edit FLAVOR_KEYWORDS or
FLAVOR_FAMILY there if Carbliss's flavor lineup changes.
