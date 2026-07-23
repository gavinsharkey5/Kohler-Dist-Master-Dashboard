Red Bull Distribution Tracker

Team goal of buying accounts (per rep, unique accounts with any
qualifying order): 239 overall -- 155 Core (Regular / Sugar Free) and
84 Core+ (all other Red Bull flavor editions).

Files:
  data.csv        Sales Rep, Customer Name, Category (Core/Core+), Bought
                  -- one row per (customer, category, rep) with a
                  qualifying order. Tab-separated. Read directly by
                  index.html via fetch() at page load -- no build step,
                  no embedded JSON.
  goals.csv       Category, Goal (Core/Core+/Overall). Also read directly
                  by index.html. Not touched by generate.py -- the RDE
                  export carries no goal information.
  generate.py     Rebuilds data.csv from a raw RDE "Red Bull Tracker"
                  export (one row per account x SKU x order date, NOT
                  the pre-aggregated shape data.csv needs).
  index.html      The page itself.

To refresh with a new export:
  1. Re-export the RDE Red Bull Tracker report.
  2. Run: python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start.xlsx
     (requires openpyxl: pip install openpyxl)
  3. If it errors on an unrecognized product, confirm with the user
     whether it's Core or Core+, then add it to CORE_PRODUCTS /
     COREPLUS_PRODUCTS at the top of generate.py.
  4. Commit and push.

Classification (per Kohler): Core = Red Bull Regular (8710) and Sugar
Free (8720). Core+ = every other flavor edition (currently Red Edition,
Yellow Edition, Coconut, White Peach Edition). generate.py uses an
explicit product list, not a keyword guess, and raises on an
unrecognized product rather than guessing -- add new flavors there
after confirming with the user, the same way the Display Auction
Tracker's PRIORITY_BRANDS/ALLOTHER_BRANDS work.

index.html's ingestData() only checks whether a (customer, category)
row EXISTS for a rep, not the Bought column's value -- so Bought is
always written as 1 by generate.py, matching the existing file.
