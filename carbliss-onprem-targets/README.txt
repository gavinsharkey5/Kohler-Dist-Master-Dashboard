Carbliss On-Premise Targets

Turns the "Carbliss Eval vs Sun Cruiser & White Claw" RDE exports into a
per-account sales-pitch generator: every on-premise account with real
Sun Cruiser or White Claw volume, sized by opportunity, with a
computed talking-point pitch (best-selling item, whether it's new or
established, how many SKUs move through the account, the Carbliss
flavor that lines up with what's already selling, and a second flavor
that's a genuine gap on their menu — chosen from a different flavor
family than the first pick so it reads as a real gap, not a repeat of
the top seller company-wide).

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
