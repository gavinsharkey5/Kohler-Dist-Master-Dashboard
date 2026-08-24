Inventory Overview (management view)
====================================

Built 2026-08-24 per Gavin: a high-level read on the warehouse position for
management, with drill-down into products, suppliers and inventory problems.
The question it is built to answer is not "what do we have" but "where do we
have a problem or an opportunity that needs action" -- hence the What Needs
Attention list sitting directly under the KPI row, above every chart.

NOT the same thing as ../inventory/ -- that folder is the rep-facing SKU
tracker (Current Stock / Trends & Forecast / Watch List), built 2026-08-18 off
InventoryStatus + InventoryProjections + WatchList_P90_OOS. This one is the
management overview and uses a different source set (it shares only
InventoryStatus). Both were left in place; if they should be merged into one
page, that is a decision to make, not something to assume.

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
                          lot-level, and the only file carrying sales velocity
                          (Avg Sales/Day), days of inventory (DOI) and a dollar
                          Write-Off Risk. Its Brand column is a logo <img> and
                          Prod # an <a> tag; generate.py strips both.
  generate.py             Joins all three on PRODUCT NUMBER and writes the
                          embedded JSON into index.html's <script id="inv-data">
                          tag. Prints a summary worth eyeballing.
  index.html              The page. Standalone -- no fetches, no dependencies.

To refresh:
  1. Save the three new exports over the filenames above (same columns).
  2. Run: python3 generate.py
  3. Check the printed summary against the previous run -- on-hand units,
     at-risk dollars and received units should all be in a plausible range.
  4. Commit and push.

WHAT THE DATA CANNOT DO (read before adding metrics)
----------------------------------------------------
Three limits shaped the build. Each is stated on the page itself rather than
papered over, and each is the thing to fix by adding a source, not by inventing
a formula:

  * NO INCOMING PIPELINE. Every row of the received export is dated in the
    PAST -- including the ones marked "Ordered" and "New". There are no
    future-dated inbound shipments anywhere in the data, so "which products
    have incoming inventory that could create an overstock or expiration risk"
    CANNOT be answered forward-looking. The page answers the supported version:
    stock received recently that is already slow-moving or already near expiry.
    An open-PO / on-order export would close this properly.

  * NO CATALOG-WIDE SALES VELOCITY. Real days-of-inventory needs a sales rate,
    and that exists only for the 34 products in the at-risk export. So the two
    movement signals on the page are PROXIES, labelled as such:
      Slow moving   >= 100 units on hand AND either nothing received in the
                    last 90 days, or on hand >= 2x what was received.
      Out of stock  nothing available now, but received within the last 90
                    days -- it was moving and has run dry.
    NOTE: the first cut of the slow rule required recv90 > 0, which silently
    excluded the 53 MOST stagnant products (14,655 units with no receipts at
    all). If this rule is ever retuned, keep the zero-receipt case in it.
    A sales-history export would replace both proxies with real DOI.

  * THE RECEIVED EXPORT IS A ROLLING WINDOW (05/26-08/22 on the first pull),
    not full lot history -- 23 of the 38 at-risk lots arrived before it starts.
    So its lots CANNOT be summed to total expiring stock. inventory_at_risk.csv
    is the authority for the 0-60 day exposure; the receipt lots only extend the
    picture beyond 60 days, and the expiry chart says so on its face.

Other build notes:
  * "As of" is the newest receive date in the export, NOT the clock, so day
    counts stay pinned to the data and an old snapshot doesn't silently age.
  * Encompass writes negatives in accounting form -- " (14)" means -14. num()
    handles it; a plain float() would throw.
  * Purchases / Invoices / Picked / In Production are all zero in every export
    seen so far and are left out rather than shown as dead columns.
  * 1,390 receipt lots join no product: they are pallets, bulkhead spacers and
    kegboard across 15 item numbers -- warehouse handling material, not stock.
    Excluded, and reported as such by generate.py so the count isn't alarming.
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
