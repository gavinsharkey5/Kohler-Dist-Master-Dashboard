Inventory Overview (management view)
====================================

Built 2026-08-24 per Gavin: a high-level read on the warehouse position for
management, with drill-down into products, suppliers and inventory problems.
The question it is built to answer is not "what do we have" but "where do we
have a problem or an opportunity that needs action" -- hence the What Needs
Attention list sitting directly under the KPI row, above every chart.

THE EXECUTIVE HALF OF A DELIBERATE SPLIT (2026-08-28, per Gavin):
  ../inventory/       Rep view -- "what can I sell?" Available, days of cover,
                      what just landed, what is on the way. No money at all.
  this folder         Executive view -- "what inventory risk are we carrying?"
                      Value, cost, write-off exposure, expiry, aging, excess.
Both read the SAME five exports out of ../inventory-data/, so a refresh is one
set of pulls and two generator runs. The rep view reads three of the five; the
two it skips (purchase_transactions, inventory_at_risk) are exactly the
financial ones. That is the whole reason the split is worth having: a rep never
downloads the 17,000-row purchase file to find out whether they can sell a case.

The earlier three-tab rep page that lived in ../inventory/ (Current Stock /
Trends & Forecast / Watch List, built 2026-08-18 on its own copies of the
exports) is gone, replaced by that rep view.

Files:
  inventory_status.csv    Encompass "Inventory Status" export -- the current
                          on-hand position, one row per product, GROUPED BY
                          SUPPLIER: a supplier header row (every numeric column
                          blank), then its products, then a "Total" subtotal
                          row. Product cells read "<prod #> <product name>".
                          This grouping is the ONLY place supplier appears in
                          any of the three files, so it is what gives the other
                          two their supplier dimension.
  inventory_received.csv  RDE "Inventory Received" -- one row per receipt lot:
                          PO, receive date, units, shelf life, expiration date,
                          On Hand Remaining. A rolling ~3-month window.
  inventory_at_risk.csv   Encompass "Inventory at Risk (0-60 Days to Expire)" --
                          lot-level, carrying Avg Sales/Day, DOI and a dollar
                          Write-Off Risk for the lots inside 60 days. Its Brand
                          column is a logo <img> and Prod # an <a> tag;
                          generate.py strips both.
  inventory_projections.csv   ADDED 2026-08-28. Encompass "Inventory
                          Projections": catalog-wide Days of Inventory, 10/28-day
                          trend, monthly depletions, backorders, units on order
                          and next receive date -- ~2,700 products. Supplier-
                          grouped like the status export (a row whose Product Num
                          is not numeric is a group header).
                          ITS MONTH COLUMNS SHIFT EVERY PULL (Apr-Jul on the 8/24
                          file, May-Aug on the 8/28 one). load_projections()
                          matches them by pattern -- "Mmm YY" for actuals, the
                          "Projected " prefix for forecasts -- so never hardcode
                          a month name here. The newest actual month is
                          month-to-date on the pull day and is deliberately not
                          used as a rate on its own; DOI is taken from Encompass.
  purchase_transactions.csv   ADDED 2026-08-28. Encompass "Purchase
                          Transactions": one row per purchase lot with Laid-in
                          Cost and FOB, and -- the point -- FUTURE-dated rows in
                          status New/Ordered, which is the inbound pipeline.
                          This file is a UNION of two pulls taken 2026-08-28
                          (08:23 and 09:13), deduped on Purchase Trans ID: the
                          first was capped at exactly 5,000 rows but reached
                          10/31, the second ran to 16,900 rows but was dated
                          5/1-8/31 and so cut the forward view off. Next refresh,
                          pull ONE file dated 5/1/2026-12/31/2026 and this
                          stops being a union. Watch the row count: exactly
                          5,000 means you hit the cap again.
  generate.py             Joins all five on PRODUCT NUMBER and writes the
                          embedded JSON into index.html's <script id="inv-data">
                          tag. Prints a summary worth eyeballing.
  index.html              The page. Standalone -- no fetches, no dependencies.

To refresh:
  1. Save the new exports over the filenames above (same columns).
  2. Run: python3 generate.py
  3. Check the printed summary against the previous run -- on-hand units, value
     on hand, inbound units and at-risk dollars should all be in a plausible
     range, and "real DOI on N products" should stay in the 2,500-3,000 band.
     If value on hand collapses, the laid-in cost column moved.
  4. Commit and push.

WHAT THE 2026-08-28 REBUILD CLOSED (and what it did not)
--------------------------------------------------------
The 8/24 build shipped with three stated limits. Two source files closed all
three; the history is kept here because the fixes are the reason to keep those
files coming.

  * NO INCOMING PIPELINE -> CLOSED by purchase_transactions.csv. The received
    export is entirely past-dated, so the first build could not answer "what is
    coming that will create an overstock." Purchase Transactions carries
    future-dated lots in status New/Ordered: 531 lots, 139,137 units,
    $3.3M on the 8/28 data. Its own section on the page charts arrivals by week
    and, more usefully, lists the lots landing on products that ALREADY hold
    90+ days of cover -- POs that can still be cut before they become stock.

  * NO CATALOG-WIDE SALES VELOCITY -> CLOSED by inventory_projections.csv. The
    two proxies ("slow" from receipt patterns, "out of stock" from a receipt
    inside 90 days) are GONE, not relabelled. Real Days of Inventory now covers
    2,701 products (median 60 days) and every movement flag is scored on it:
    slow >= 180d, overstock >= 90d, low <= 14d with stock, stockout when
    nothing is available and the product is backordered or still selling.
    A product with NO projections row gets no movement flag at all -- absence
    of a rate is not evidence of a slow rate, and the old proxies got that
    wrong by construction.

  * NO DOLLAR VALUE -> CLOSED by the Laid-in Cost column on the same purchase
    file. $18.5M on hand across 1,468 costed products, covering 97% of units.
    Cost basis is the MOST RECENT lot carrying a laid-in cost, not an average
    across lots: averaging blends a 2025 price into a 2026 valuation, and the
    latest cost is what the next case is actually worth.

  * STILL TRUE -- THE RECEIVED EXPORT IS A ROLLING WINDOW (05/29-08/27 on this
    pull), not full lot history. Its lots still cannot be summed to total
    expiring stock; inventory_at_risk.csv remains the authority for the 0-60 day
    exposure, and the expiry chart still says so on its face. The purchase file
    now reaches further back with cost and expiry per lot, so this matters less
    than it did, but it is not fixed.

  * STILL TRUE -- an invoice-level sales export was attempted on 8/28 and
    REFUSED by Encompass ("Can not export more than 100000 records in a single
    file"). It is not needed: projections already carry the depletion history
    and DOI. If true line-level depletions are ever wanted, ask for a
    SUMMARISED export (units by product by week or month), which fits well
    under the cap -- not the raw line file.

Other build notes:
  * "As of" is the newest receive date in the export, NOT the clock, so day
    counts stay pinned to the data and an old snapshot doesn't silently age.
  * Encompass writes negatives in accounting form -- " (14)" means -14. num()
    handles it; a plain float() would throw.
  * Purchases / Invoices / Picked / In Production are all zero in every export
    seen so far and are left out rather than shown as dead columns.
  * The received export RENAMED its last column between the 8/24 and 8/28 pulls:
    "On Hand Remaining" -> "Available". load_received() reads whichever is
    present. Left unfixed this returned 0 for every lot silently -- no error,
    just an expiry chart quietly built on nothing.
  * 1,390 receipt lots join no product: they are pallets, bulkhead spacers and
    kegboard across 15 item numbers -- warehouse handling material, not stock.
    Excluded, and reported as such by generate.py so the count isn't alarming.
  * The product table now carries Days of inv, Value and Inbound columns
    (added 2026-08-28), all sortable like the rest.
  * The product table lists ~2,000 of the 4,239 catalogue entries. The rest hold
    no stock, nothing available and no receipts in 90 days -- dead rows that
    halved the payload for no information. A genuine stockout still appears,
    since that flag requires a receipt inside 90 days.
  * Brand is DERIVED from the product name's first word -- no export carries a
    brand field (the at-risk file's Brand column is a logo image). Supplier is
    the reliable grouping; the page labels brand as a convenience.
  * Single warehouse (Hawthorne) in the data, so there is no location filter --
    add one when a second location shows up rather than shipping a dead control.
  * A few lots hold stock against expiration dates years in the past (2009,
    2024). Left in and shown: a live count against a nonsense date is itself
    worth fixing.

Charts follow the repo's dataviz rules. The severity palette
(#DC3E43/#C98500/#3987E5/#199E70) was validated against the #1C130C chart
surface -- lightness band, chroma floor, CVD separation, normal-vision floor
and contrast all pass -- and every tier is directly labelled so nothing depends
on colour alone. The expiry chart deliberately plots only the three actionable
tiers: 90+ days is ~96% of the stock and including it squashed "expired" and
"0-60 days" into invisible slivers, which is precisely what that chart exists
to show. The healthy figure is stated as text beneath instead.

Linked from the root hub page (../index.html).
