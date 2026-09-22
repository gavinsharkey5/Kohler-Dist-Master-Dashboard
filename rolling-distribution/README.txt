ROLLING DISTRIBUTION TRACKER
============================

Buyers, placements and cases for every supplier -> brand family -> brand
-> product, in rolling periods (default three whole calendar months) that
advance one month at a time: Oct-Dec, Nov-Jan, Dec-Feb, Jan-Mar... Filter
by supplier / family / brand / product / package type (draft vs package) /
premise / district manager / sales rep / area. Compare several periods
side by side, or focus on one period to see who bought, who is new and
who was lost, by brand, rep, DM, premise, area, or account by account.

The page has a light / dark switch (top right of the banner), Buyers /
Placements / Cases column toggles above the table (Buyers only by
default; the choice, the hidden KPI tiles, the theme and the chart
open/closed state are remembered per browser), and "Show rows by" to lay
the periods out by supplier hierarchy, rep, DM, area, county, premise or
account. Filters travel in the link by name, so a view can be bookmarked.

This is the HISTORY + BASELINE page for incentive planning: what a brand
did over any past window, so goals can be set against it. It holds no
goals of its own.


WHERE THE DATA LIVES
--------------------

  data/master/months/YYYY-MM.csv   one file per calendar month:
                                   product_num, customer_num, buyer, cases
                                   (one row = one product at one account)
  data/master/products.csv         product_num -> name, supplier, family,
                                   brand, package
  data/master/customers.csv        customer_num -> name, premise, address,
                                   county, area, rep, dm
  data/master/suppliers.csv        supplier -> supplier_id, brand_manager
  data/master/sources.json         which export supplied each month, when
                                   it was exported, and whether the month
                                   was flagged partial
  data/dist_data.js                what index.html loads (GENERATED)
  data/logos.js + assets/logos/    supplier / brand-family logos (logos.py)
  data/sync_meta.json              "Data refreshed" pill (GENERATED)

The master folder IS the historical dataset. The raw Fusion exports are
not committed (20 MB each) -- keep them wherever you keep exports; the
master can always be rebuilt from them, and the master alone is enough to
rebuild the page (python3 generate.py --build).


REFRESH STEPS
-------------

1. Pull from Fusion, any of these, in any combination:

   a) DETAIL (the one that matters): Supplier / Brand Family / Brand /
      Product Num & Name / Customer Num Name / On Premise / Shipping
      Address / County / Distribution Area, with Buyer Count, Placement
      Count and Cases per month (YYYY/M column headers). Three months per
      file keeps it under the export size limit. Column order does not
      matter; the header names do.

   b) PRODUCT lookup (optional, only when new SKUs appeared): Product Num
      & Name / Package, any month columns.

   c) CUSTOMER lookup (optional, only when reps or DMs changed): Customer
      Num & Company / Sales Rep Assigned / District Manager, any months.

   d) SUPPLIER lookup (optional, only when brand managers change): the
      Fusion "Suppliers" list -- Supplier ID / Supplier / brand manager.
      Fusion labels the manager column "License Number"; the generator
      reads whatever third column is there as the brand manager.
      -> data/master/suppliers.csv. Suppliers missing from the list show
      as "Unassigned" on the page; the build prints which ones.

   e) LOGOS (optional): the Fusion "Suppliers" and "Brand Families"
      workbooks that carry a logo picture per row (xlsx, not csv). Run

         python3 logos.py <Suppliers.xlsx> <BrandFamilies.xlsx>

      (needs Pillow: pip install pillow). Each picture is matched to the
      name on its row, shrunk, and written to assets/logos/; data/logos.js
      maps names -> files and the page shows them beside supplier and
      brand-family rows and in the breadcrumb. Names must match the
      sales data exactly to appear.

2. From this folder:

      python3 generate.py <every file you pulled>

   Files are auto-detected by header. Output shows, per month, whether it
   was NEW or RESTATED, with placements and cases before -> after, and
   how many cells were unchanged / dropped. Read that line: a restated
   month whose numbers only went up is the normal case (Fusion re-exports
   a fuller month); a month whose cases DROPPED sharply on a restatement
   means the export was cut short -- check it before committing.

3. Commit data/master/, data/dist_data.js, data/sync_meta.json and push.
   Bump ?v= on the dist_data.js script tag in index.html if a browser
   would otherwise keep a cached copy (it is in the same commit, so a
   hard refresh also works).


HOW MERGING WORKS (no double counting)
--------------------------------------

Each month of a detail export REPLACES that month's file in
data/master/months/ in full. Months the export does not cover are left
alone. So:

  * Historical files never drop off -- only the months you re-export
    change.
  * Overlapping exports cannot double count: the newest export covering a
    month is the only source for that month.
  * A re-exported month is treated as a RESTATEMENT (the whole month as
    Fusion now sees it), never a top-up. This is the same lesson as the
    W&S monthly grid (see CLAUDE.md): if you want to add days to a month,
    re-export the whole month.

Rule of thumb for the routine pull: export the latest three months each
time. The two older months restate cleanly and the newest month arrives.

PARTIAL MONTHS: a month equal to the export's own date (taken from the
Fusion_..._YYYYMMDD_ filename, else the file's mtime) is flagged partial
in sources.json and shown with a "partial" tag and hatched bar on the
page. Pass --complete if you know the month was already closed.

Dimension attributes (names, supplier / family / brand of a product,
premise / area / rep / DM of an account, package) are "latest file wins"
and apply to ALL of that product's or account's history. Rep and DM are
therefore today's assignment applied backwards; Fusion gives no history
of who held an account when.


HOW THINGS ARE COUNTED
----------------------

One source row = one product at one account for one month. Fusion's own
Buyer Count and Placement Count are identical at that grain (both a 1/0
"bought this SKU this month" flag); they only separate on roll-up.

  Buyer      an account whose NET cases across the rows in scope are > 0
             in the period, counted once per row of the table. An account
             buying three Blue Moon packages is 1 Blue Moon buyer.
  Placement  one product at one account with net cases > 0 in the period.
             Same account, three Blue Moon packages = 3 placements.
  Cases      net of returns and credits (Fusion already nets per month).

Rolling periods count a buyer once even if it bought in all three months
-- the page goes back to the account rows for every number rather than
summing monthly buyer counts. Verified against Fusion's own product-level
and customer-level exports for Jan 2025 - Mar 2026: buyer counts match
distinct accounts exactly, customer-level placement counts match the
number of products bought exactly.

"Any invoice activity" (Buyer rule toggle) switches to Fusion's raw flag,
which also counts accounts / products whose period nets to zero or below
(about 24,000 month-cells across 2025 are flagged with cases <= 0).

Prior period = the previous NON-overlapping window of the same length
(Jan-Mar vs Oct-Dec). Prior year = same months one year earlier. New /
lost buyers in Focus view are against the prior period.


WHAT IS NOT HERE
----------------

  * No dollars -- cases only, by design for now.
  * Detail runs Jan 2025 - Aug 2026 (loaded 2026-09-22). September 2026
    and later arrive with the routine pull once the month closes; a pull
    made mid-month is flagged partial on the page.
  * No goals. This page is the baseline; goals live in the incentive
    tracker and the hub.
