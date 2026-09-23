ROLLING DISTRIBUTION TRENDS
===========================

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

The page has two tabs under the same link (page=tracker | page=quality
in the link). ROLLING TRENDS is the period comparison described above.
DISTRIBUTION QUALITY is the "are the points real?" tab for supplier
conversations, using the same step 1 filters and period choice:
  1. Placement quality -- every placement tiered into Core / Steady /
     Thin by cases per month. DEFAULT is relative to each brand family:
     Core = top 25% of that family's own placements in the period, Thin
     = bottom 25% (families with < 8 active placements fall back to the
     fixed rule). The alternative is fixed cases per month (Core >= 5,
     Thin < 1, editable). Share of placements vs share of cases, and a
     per-period table with cases per placement.
     Under the rule line sits a gold "The takeaway" box written from
     the live numbers for whatever is filtered: placements, what the
     best and slowest quarter sold, whether the Thin share moved since
     last period, and a "Say it to the supplier" line. Sections 2 and
     5 carry the same box for new-point survival and reorder rates.
  2. What happened to new points -- placements first gained in a chosen
     period (never bought before it), what they sold, and whether they
     were still buying 1-4 periods later, broken down by brand / rep /
     DM / area / county / premise.
  3. Where it fits -- areas, counties, premise, reps, DMs ranked by cases
     per buyer, with penetration and retention, not by count.
  4. Look-alike targets -- accounts buying from us that resemble the
     scope's core buyers (premise, area, the other brands they carry)
     but are not buying the scope; "Lapsed" ones bought it before.
  5. Rebuy rates and repeat velocity -- cohort view over the whole
     history: placement start = first month with net cases > 0
     (placements already active in the first month of history are
     excluded, they have no known start); rebuy within 3 / 6 months
     counted only once that full window has passed ("too recent"
     otherwise); months to rebuy, consistency (active months of the 6
     after the start), first-month cases vs repeat cases per month,
     one-and-done, return signal (a net-negative month after the start).
     Rows with < 20 judged placements are flagged small.
  6. Where it rebuys -- counties / areas with a fit score (percentile of
     6-month rebuy + percentile of repeat velocity, 20+ judged only),
     next to total cases and cases per buying account.
  7. Account targeting -- Retain (bought 4+ of last 6 months), One-and-
     done (never reordered in 6 months, biggest drops first, return
     signal), Expand selectively (places with fit >= 50 -> use section 4).
  8. Broad or selective? -- per child row: placements / cases / cases per
     placement vs prior year, 6-month rebuy, repeat velocity, and a
     verdict (Broader distribution works: rebuy >= 60% and cases per
     placement holding; Be selective: rebuy < 40%, or points +10% with
     cases growing less than half as fast; < 50 judged = Small sample).
  Every table on both tabs sorts by any column: click a header (first
  click = greatest to least, again to flip; first column A-Z). The
  Trends tables re-render sorted; the Quality tables re-order in place.
  9. Print one-pager -- prints / saves the tab as a PDF (light theme,
     filters and buttons hidden) for the supplier meeting.
Limitations stated on the tab: shipments net of credits are a proxy for
consumer demand, not sell-through; returns / out-of-code / destruction
are not loaded (the return signal is the nearest thing); rep and DM are
today's assignment.
Section 2's "Points gained in" list greys out the newest periods: a
drive is judged by whether its points were still buying a FULL period
later, so Jun-Aug 2026 only becomes selectable once Sep-Nov 2026 data
is loaded (the greyed option says which months it needs).

TERRITORY RULE (both tabs, on by default, "Territory" box under
Customer): each brand family is counted only in the Encompass areas it
can be sold in, per data/master/territory.csv (from the Brand Selling
Restrictions workbook, step f below). Two things happen:
  - the ACCOUNT UNIVERSE shrinks to accounts in those areas, so the fit
    map, look-alike targets, county fit score and "not buying" lists
    never show an Essex bar as a missed Coors opportunity;
  - invoices outside the territory (rare: 103 placements / 477 cases
    across all suppliers in Jun-Aug 2026) are hidden from every count.
A gold note under the filters says which areas the brand is sold in,
how many accounts were left out and what was hidden; "Show all areas"
(or terr=off in the link) turns the rule off and the note goes red.
Accounts whose area is not a rule column ("Sales" house accounts,
Middlesex) are placed by county: Bergen/Passaic/Essex/Hudson/Union/
Sussex map to the area of that name (and the account is SHOWN under
that area in every filter and breakdown, so no "Sales" row appears),
Morris county is in if ANY Morris area is, anything else is in only
for "All Counties" families. A family
with no row in the workbook is counted everywhere and the note says so
(the build prints the list -- Coors 0.0, Yuengling Premium, Newcastle,
Honey Brown among them as of 2026-09-23).
Cases per placement is also a fourth column toggle and KPI tile on the
tracker tab. Revenue / gross profit are not loaded yet; when they are,
the tiers and fit map are where they plug in.

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
  data/master/territory.csv        brand family -> territory label, areas
                                   it can / can't be sold in
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

   f) TERRITORY (optional, only when selling rules change): the
      Brand_Selling_Restrictions workbook (Brand Family / Territory /
      one Can Sell - Can't Sell column per area). Pass the .xlsx straight
      to generate.py (needs openpyxl) or save the sheet as CSV. The file
      is the WHOLE rule set -- it replaces data/master/territory.csv, it
      does not top it up. The build prints families with no rule and
      rule rows that match no family in the data (spelling differences:
      the workbook must use the same family name Fusion does).

   e) LOGOS (optional): the Fusion "Suppliers" and "Brand Families"
      workbooks that carry a logo picture per row (xlsx, not csv). Run

         python3 logos.py <Suppliers.xlsx> <BrandFamilies.xlsx>

      (needs Pillow: pip install pillow). Each picture is matched to the
      name on its row, shrunk, and written to assets/logos/; data/logos.js
      maps names -> files and the page shows them beside supplier,
      brand-family and brand rows and in the breadcrumb. Names must
      match the sales data exactly to appear. The Fusion "Brands"
      workbook (Brand Logo column) is accepted too; a brand family with
      no logo of its own borrows one of its brands' logos, and
      assets/logos/overrides.json forces entries (Corona Extra uses the
      Constellation supplier logo, which is the Corona Extra crown).

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
