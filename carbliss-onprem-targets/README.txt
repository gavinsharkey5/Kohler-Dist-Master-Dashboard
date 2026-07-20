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
                 (account-level Sun Cruiser / White Claw cases & buyers, 2025 vs 2026)
  price_vol.csv  RDE "...Price & Vol" export
                 (SKU-level price, cases, and $ volume per account, both brands + Carbliss)
  generate.py    Rebuilds the embedded data in index.html from the two CSVs above
  index.html     The page itself (data is embedded in the <script id="tg-data"> tag)

To refresh with new exports:
  1. Re-export both RDE reports, keeping the same columns.
  2. Save them over accounts.csv and price_vol.csv in this folder (same filenames).
  3. Run: python3 generate.py
  4. Commit and push.

City is looked up by customer ID from other trackers already in this repo
(molsoncoors/retention/data.csv, carbliss/data.csv, isellbeer's
DisplayPhotoReport.csv) — about 93% of accounts resolve; the rest render
without a city in the pitch rather than guessing one.

Flavor mapping and the "gap" ranking (most broadly-carried missing flavor,
preferring one from a different flavor family than the pitched SKU) are
both defined at the top of generate.py — edit FLAVOR_KEYWORDS or
FLAVOR_FAMILY there if Carbliss's flavor lineup changes.
