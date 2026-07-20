Bardstown Bourbon & Green River — Retention, Velocity & CORE Tracker

Turns the "RDE Bardstown / Green River Retention History" export into a
dashboard covering, per brand:
  - Retention: how many separate times each account has bought each SKU
    (every row in the export is one order occasion, so counting rows per
    account x product is literally that count).
  - Velocity leaderboard: the accounts moving the most product per month,
    averaged over the full report window so accounts are compared fairly
    regardless of when they started buying.
  - Area performance: buyers, repeat rate, velocity and CORE penetration
    by Distribution Area, to see where each brand is succeeding.
  - CORE tracker: which accounts carry every SKU in the brand's CORE
    lineup, and which are one SKU away (near-CORE).

CORE definitions (set by Kohler, hard-coded in generate.py):
  Green River CORE       = Bourbon, Full Proof, Rye, Wheated, Honey (5 SKUs)
  Bardstown Bourbon CORE = Bottled-in-Bond, Bourbon, Double Barrel Rye,
                            High Wheat (4 SKUs)
An account only counts as carrying the CORE once it has bought EVERY SKU
in that brand's list at least once in the window. If the CORE lineup ever
changes, edit GREEN_RIVER_CORE / BARDSTOWN_CORE at the top of generate.py.

Files:
  RDE_Bardstown_Green_River_Retention_History.csv
                 RDE "Bardstown / Green River Retention History" export
                 (Sales Rep, Customer, Product, Date, Buyer Count, Units,
                  Revenue, Gross Profit — one row per account x product x
                  order date)
  generate.py    Rebuilds the embedded data in index.html from the CSV above
  index.html     The dashboard itself (data is embedded in the
                 <script id="bg-data"> tag)

To refresh with a new export:
  1. Re-export "RDE Bardstown / Green River Retention History", keeping the
     same columns.
  2. Save it over RDE_Bardstown_Green_River_Retention_History.csv in this
     folder (same filename).
  3. Run: python3 generate.py
  4. Commit and push.

Velocity is units per month, averaged over the whole report window (the
earliest to latest date across the export) rather than per-account tenure,
so a brand-new account isn't artificially inflated just because it's only
been buying for a few weeks.
