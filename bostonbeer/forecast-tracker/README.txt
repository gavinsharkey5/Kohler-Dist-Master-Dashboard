Boston Beer Forecast & Inventory Tracker
=========================================

Cross-references your Boston Beer portal forecast against Encompass
sell-through/inventory data, flags SKUs you're likely over- or
under-ordering, and exports a corrected forecast in the format the
Boston Beer online ordering system accepts as a CSV upload.

Inputs
------
1. The forecast file you export from the Boston Beer portal (what you
   currently have entered as your order plan). Columns: Product,
   Distributor, BBC SKU, Customer SKU, then a pair of columns per week
   ("<date> F" = your forecast, "<date> A" = what's currently on file
   in the portal for that week).

2. The Encompass "Boston Beer Inventory Report" export. Columns include
   Supplier Product ID (joins to BBC SKU), Available, L4 Average / L8
   Average (average weekly cases sold over the trailing 4/8 weeks),
   the last 5 weeks of case sales, and Last Receive Date/Quantity.

How the join works
-------------------
Matched by BBC SKU == Supplier Product ID, exact match first. A small
number of SKUs in the inventory export carry a suffix variant of the
forecast SKU (e.g. forecast "AJ0153" vs inventory "AJ0153A1") -- those
are matched by prefix and flagged in the row detail as "matched by
prefix, not exact match" so you can sanity-check them. SKUs that don't
resolve either way still show up with their forecast data, just without
inventory-based recommendations.

Recommendation math (see the in-page "How Recommended is computed" box
for the live version)
------------------------------------------------------------------
For SKUs with sell-through history: target inventory position =
(target weeks of supply) x (4-week average weekly sales). The gap
between that and current Available is corrected entirely in the
nearest week; the following weeks keep your own forecast's relative
week-to-week shape (so a known seasonal ramp like Octoberfest carries
through) but rescaled to the corrected level.

For SKUs with no recent sell-through (new/seasonal items not yet
shipping), there's no data to correct against -- the recommendation
just passes your forecast through unchanged.

Target weeks of supply and tolerance are adjustable live on the page
(default 4 weeks +/- 1) -- there's no single correct number here since
it depends on Boston Beer's actual delivery lead time, which isn't in
either source file. Tune it to what you know.

Exporting
---------
The "Export upload CSV" button generates a CSV using the CURRENT
slider settings, with columns Product / Distributor / BBC SKU /
Customer (populated from Customer SKU -- adjust if the portal expects
something different there) followed by the first 8 week-ending date
columns present in the source forecast file (the upload format wants
8 weeks; the source file tracks 13 weeks further out for your own
reference, visible in the on-page detail view but not exported).

To refresh with new exports
----------------------------
Replace the two source files and re-run the build script (ask Claude
to regenerate, or re-run build_forecast_data.py against the new CSVs)
to regenerate data/forecast.json, then reload the page -- no HTML
changes needed for a routine data refresh.

Known gaps -- see the chat conversation that built this for the full
list of reports that would fortify this further (lead time, case-pack
minimums, promo calendar, code dates, historical forecast accuracy).
