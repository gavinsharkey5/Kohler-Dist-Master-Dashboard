Rep View -- Inventory ("What Can I Sell")
=========================================

Rebuilt 2026-10-14 (Gavin's brief: inventory/design-refs/CLAUDE_CODE_PROMPT.md)
for iPhone / iPad use on route. The executive view (../inventory-overview/) is
a separate page and was not touched.

One question drives every element here: what is available to sell right now.
There is deliberately NO cost, NO inventory value, NO write-off exposure and NO
aging analysis -- those are the other page's job.

Files:
  generate.py   Reads ONE report (below) and writes the embedded JSON into
                index.html's <script id="rep-data"> tag. Prints a summary.
  index.html    The page. No libraries; the only fetches are the star sync and
                the brand scope (both optional -- the list itself is embedded).
  design-refs/  The three Mobbin screenshots the layout follows, the brief,
                and a sample report (Inventory_Report_1.csv) for testing.

The report
----------
Encompass inventory report with exactly these columns:
  Product Num Name | Supplier | Brand Family | On Floor Inventory | Pre Sales |
  Allocated | Available
~3,200 rows, ~124 suppliers, ~326 brand families. "Product Num Name" is the
product number followed by the description ("2409 Corona Extra 1/24/12 oz
Loose Btl"); generate.py splits it on the first space. The four numeric
columns are coerced (blank = 0, '-1' / '(1)' = negative). Available is used
EXACTLY as the report carries it -- never re-derived. The snapshot date is the
report FILE's modified time (the report has no date column); the page flags a
snapshot older than 7 days.

To refresh:
  1. Save the new report as ../inventory-data/Inventory_Report.csv (or pass
     any path as the first argument).
  2. Run: python3 generate.py            (or python3 generate.py path/to/report.csv)
  3. Run ../accounts/generate.py so the Account page's product list picks up
     the same snapshot (it reads this file's rep-data JSON).
  4. Commit and push.
The three older exports in ../inventory-data/ (status / projections /
received) are no longer read by this page -- the executive view still uses
them.

The page
--------
  Header       "Inventory", "Inventory as of <date>" (+ the stale tag past 7 days).
  KPI tiles    Products Available (Available > 0) · Out of Stock (Available <= 0)
               · Running Low (Available 1-24). Units, never dollars. Each tile
               is a filter (tap again to clear).
  Search       Debounced (150 ms), case-insensitive substring over the full
               "Product Num Name" string, so "2409" and "modelo" both work.
  Sort         Available high to low (default) · Name A to Z · Pre Sales high
               to low. Filter opens a bottom sheet (centred dialog from 760px)
               with Supplier and Brand Family multi-select, each with its own
               find box; brand families narrow to the chosen suppliers.
  Chips        Active supplier / brand filters first, as dismissible chips (x),
               then All / In Stock / Low / Out. The row scrolls sideways; the
               page never does.
  Rows         Description bold; "#number · Brand Family" muted; Available as
               a pill on the right (green > 24, amber 1-24, red <= 0, on the
               kdh tokens). Min height 56px, whole row is the tap target.
               Phone: tap expands the row (one open at a time) to a 2x2 grid of
               On Floor / Pre Sales / Allocated / Available. 768px and up: the
               figures sit inline on every row, no accordion.
  Grouping     Sticky Supplier headers (A-Z, product count) when no search or
               filter is active; a flat sorted list otherwise.
  Loading      The list renders in chunks (60, then 120 as you scroll, with a
               Show More fallback) so first paint is fast on an older phone; a
               skeleton shows until the first chunk is in.
  State        Sort + filters persist in localStorage `kdh_inv:v2`; the search
               text does not. Empty state: "No Products Match" + Clear.
  Starred      (2026-10-14) Every row has a star. Starred products sit in a
               "Starred" group at the TOP of the grouped list (with "N Out ·
               M Low" in the header) and under a Starred chip; they also stay
               under their supplier. Stars are the person's own shortlist: kept
               on the device (localStorage `kdh_inv_star:v1:<hash of email>`)
               and synced to Supabase `public.product_stars` with the signed-in
               token once migration 20261014150000_product_stars.sql is run
               (a 404 = device-only until then; a removal that fails to reach
               the server is retried on the next load and never comes back).
               Own rows only -- a manager does not see a rep's stars. A manager
               PREVIEWING someone cannot star (the control is hidden: a star
               would be the manager's, not the rep's). A star never reserves
               stock or watches it live -- the page says so in About This Data.
  Brand scope  (2026-10-14) A manager who covers suppliers (kdhBrandScope():
               allowed_users.program_brands, the preview cookie's brands, or
               shared/data/brand-managers.json by name) sees ONLY products of
               those suppliers and brand families -- the tiles, the list, the
               search and the filter sheet are all cut, and a "Your Suppliers:
               ..." line sits under the snapshot date. A district manager who
               also carries a brand (kdhTeam matches, from shared/dm-groups.js)
               keeps everything, the same hybrid rule as the hub and the MPO
               trackers. Reps and rep previews are never scoped. Nothing in the
               scope -> "None of Your Suppliers Are on This Report".
  Defaults     A rep opens on their Starred group, then every supplier A-Z. A
               brand manager opens on their suppliers' products with the three
               tiles counting only those. Everyone else sees the whole report.

Decisions worth not re-litigating
---------------------------------
  * `Available` IS the answer to "what can I sell", exactly as Encompass
    reports it. Do not recompute it from On Floor / Pre Sales / Allocated.
  * Dropped with the old exports, because the new report cannot support them:
    days of cover (no rate of sale), "on the way" / next arrival (no purchase
    orders), "just arrived" (no receipts), backordered. "Running Low" is now
    a unit threshold (1-24), not a days-of-cover rule. The Account page's
    product list still reads status + available from this page's JSON; its
    days-of-cover / arrival fields are null now.
  * Every row of the report is listed, including the ~1,400 with nothing
    available -- a rep searching for a product should find it and see "0",
    not wonder whether the page is missing it.
  * No warehouse filter: one warehouse in the data.
  * Status and the pill colours come from the kdh tokens (--kdh-ok / -warn /
    -bad + the -soft backgrounds), AA in both themes; every status also reads
    as a number and a chip label, so nothing depends on colour alone.

Tests: scratchpad inv_test.mjs (390 / 820 / 1366 x light / dark as a rep +
manager: KPIs, search by word and number, chips, sheet, expand / inline,
sort, persistence, chunked loading, sticky offsets, contrast, no sideways
scroll), inv2_test.mjs (stars: device-only on 404, group + chip + filter +
empty state, star tap vs row tap, sync GET / POST / DELETE with the token,
lost delete retried; scope: brand preview, database row, the file by name,
hybrid DM, nothing on the report, a rep never scoped) and sql_stars_test.sh
(the migration on local Postgres 16: stamped email, own rows only, anon
refused).
