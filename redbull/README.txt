Red Bull Distribution Tracker

Per-rep tracking of unique buying accounts (any qualifying Red Bull
order) against the team goal.

Categories (per Kohler, updated 2026-09-11). These three are what an
account actually buys, and they are the only values in data.csv:
  Regular  Red Bull 1/24/8.4 oz Can
  Free     Red Bull Sugar Free
  Core+    Orange Edition, Sea Blue-Juneberry, Blue Edition, Coconut,
           Yellow Edition, White Peach Edition, Red Edition

Kohler does NOT carry Red Bull Sugar Free Watermelon -- it was listed
briefly and removed. Don't add it back without confirming that changed.

CORE IS A ROLLUP, not a fourth thing to sell: an account counts as Core
as soon as it buys Regular OR Sugar Free. It is derived in index.html
(the ROLLUPS list) and never written to data.csv, because Kohler's 155
Core goal was always set on Regular and Sugar Free together. So Core
(192) is not Regular (184) + Free (96) -- accounts buying both are
counted once.

COMPLETE ACCOUNTS (the number that counts): an account is complete only
when it buys ALL THREE of the categories above -- Regular AND Free AND
Core+. Two of the three is not complete. The Core rollup does NOT
substitute for Regular + Free here: an account buying only Sugar Free is
Core, but it is not complete. The page is built around that rule: a "Complete
(all 3)" stat tile, a green "what counts as complete" band, the rep
leaderboard ranked by complete accounts (total accounts only breaks
ties), and each rep's account list split into "Still to finish"
(closest-to-complete first, with the missing categories shown as "+ Free"
/ "+ Core+" tags) and "Complete accounts". Completeness is derived in
index.html (isComplete()) from the category rows -- data.csv carries no
complete flag, so nothing to regenerate when the rule is explained
differently.

Files:
  data.csv        Customer Name, Category (Regular/Free/Core+), Sales Rep,
                  Bought -- one row per (customer, category, rep) with a
                  qualifying order. Tab-separated. Read directly by
                  index.html via fetch() at page load -- no build step,
                  no embedded JSON.
  goals.csv       Category, Goal (Core/Regular/Free/Core+/Overall --
                  Core here is the rollup, and carries the 155). Also read
                  directly by index.html. Not touched by generate.py --
                  the RDE export carries no goal information. A goal of
                  0 means "no goal set yet": that category's card shows
                  the team count with no goal bar, and it's left out of
                  the headline/footer goal line. Free is 0 until Kohler
                  sets one -- fill it in here and the page picks it up,
                  and bump Overall if the split changes it.
  generate.py     Rebuilds data.csv from a raw RDE "Red Bull Tracker"
                  export (one row per account x SKU x order date, NOT
                  the pre-aggregated shape data.csv needs). Takes the
                  export as .csv or .xlsx.
  index.html      The page itself.

To refresh with a new export:
  1. Re-export the RDE Red Bull Tracker report.
  2. Run: python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start.csv
     (an .xlsx also works; that path needs openpyxl)
  3. If it errors on an unrecognized product, confirm with the user
     whether it's Regular, Free or Core+, then add it to
     REGULAR_PRODUCTS / FREE_PRODUCTS / COREPLUS_PRODUCTS at the top of
     generate.py.
  4. Commit and push.

NOTE: the export must cover the whole tracked period (Apr 1 on).
generate.py REBUILDS data.csv from whatever file it's handed -- it does
not merge -- so a partial/current-week export would silently drop every
account outside its window.

generate.py uses an explicit product list, not a keyword guess, and
raises on an unrecognized product rather than guessing -- add new
flavors there after confirming with the user, the same way the Display
Auction Tracker's PRIORITY_BRANDS/ALLOTHER_BRANDS work. Products are
matched on the name with the leading product number and all spaces
stripped, so a renumbered SKU or an "8.4oz" vs "8.4 oz" spelling still
matches. Several Core+ flavors (Orange, Sea Blue-Juneberry, Blue) and
Sugar Free Watermelon are listed but have not appeared in an export
yet.

Adding or renaming a category means editing CATEGORIES + the product
sets in generate.py AND the CATS registry near the top of index.html's
script (key / label / tag CSS class / blurb); rollups like Core live in
the ROLLUPS list beside it (key / label / class / blurb / the categories
it covers). Everything else on the page -- stat tiles, leaderboard
lines, goal cards, account tags, headline and footer -- is generated
from those lists. index.html also keeps a LEGACY map so a data.csv from
before the rename (which called Regular "Core") still reads correctly.

index.html's ingestData() only checks whether a (customer, category)
row EXISTS for a rep, not the Bought column's value -- so Bought is
always written as 1 by generate.py, matching the existing file.
