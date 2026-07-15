Online Ordering Tracker (Boston Beer)
======================================

Cross-references your Boston Beer portal forecast against Encompass
sell-through/inventory data, flags SKUs you're likely over- or
under-ordering, and exports a corrected forecast in the format the
Boston Beer online ordering system accepts as a CSV upload.

Inputs
------
1. Forecast file exported from the Boston Beer portal (your current
   order plan). Columns: Product, Distributor, BBC SKU, Customer SKU,
   then a pair of columns per week ("<date> F" = your forecast,
   "<date> A" = what's currently on file in the portal for that week).

2. Encompass "Boston Beer Inventory Report" export. Columns include
   Supplier Product ID (joins to BBC SKU), Package, Available, L4
   Average / L8 Average (average weekly cases sold over the trailing
   4/8 weeks), the last 5 weeks of case sales, and Last Receive
   Date/Quantity.

3. Encompass "Packages" reference export. Maps each Package description
   (e.g. "1/2 BBL Keg") to Case Equiv (case-equivalent conversion
   factor) and Wholesale Units per Case -- this is what lets a
   recommendation land on a physically orderable quantity (e.g. a
   whole keg) instead of an arbitrary case-equivalent fraction.

4. Encompass "ForecastReport" export. Per SKU, this carries the actual
   Boston Beer lead time (days) plus 52 weeks of trailing sell-through
   history. Two things come from this file: the real lead time (used
   instead of a guessed default) and, for SKUs with no current
   velocity, the same week from a year ago as a seasonal reference
   point.

How the joins work
-------------------
Forecast rows are matched to inventory by BBC SKU == Supplier Product
ID, exact match first. A small number of SKUs in the inventory export
carry a suffix variant of the forecast SKU (e.g. forecast "AJ0153" vs
inventory "AJ0153A1") -- those are matched by prefix and flagged in the
row detail as "matched by prefix, not exact match" so you can
sanity-check them. Packages and ForecastReport both join on the same
BBC SKU / Supplier Product ID key (Packages via the inventory row's
Package description, ForecastReport directly). SKUs that don't resolve
against inventory still show up with their forecast data, just without
inventory-based recommendations.

Recommendation math (see the in-page "How Recommended is computed" box
for the live version)
------------------------------------------------------------------
(a) Case-pack-aware rounding -- every recommended quantity is converted
    from case-equivalents to physical orderable units using that SKU's
    Case Equiv (from Packages), rounded to the nearest whole unit (e.g.
    nearest whole keg), then converted back to case-equivalents for
    display/export. Standard 1/1 packaging rounds to whole
    case-equivalents as before; non-standard packaging (kegs, etc.)
    rounds to whole physical units instead, which is why you'll see
    values like 6.94 case-equivalents on keg SKUs -- that's exactly 3
    kegs, not a rounding artifact.

(b) Lead-time-aware correction spreading -- for SKUs with sell-through
    history, the gap between target inventory position (target weeks
    of supply x 4-week average weekly sales) and current Available is
    no longer dumped entirely into the nearest week. It's spread evenly
    across however many weeks correspond to Boston Beer's actual lead
    time for that SKU (from ForecastReport; correction weeks = lead
    time in days / 7, rounded, minimum 1). All weeks keep your own
    forecast's relative week-to-week shape (so a known seasonal ramp
    like Octoberfest carries through) but rescaled to the corrected
    level.

(c) Seasonal fallback -- for SKUs with no recent sell-through velocity
    (new/seasonal items not yet shipping this cycle, or between
    seasons) but with 52-week history available, the recommendation
    uses the same week from a year ago (+/- 5 days) as a reference
    point instead of just passing your forecast through unchanged.
    SKUs with neither velocity nor a usable historical match fall back
    to passing your own forecast through as-is. The in-page detail view
    for each SKU shows which of the three methods (velocity / seasonal
    / passthrough) was used.

Target weeks of supply and tolerance are adjustable live on the page
(default 4 weeks +/- 1).

A note on precision: recommended quantities for non-1:1 packaging
(kegs) are shown and exported to 2 decimal places because that's the
exact case-equivalent value of a whole number of physical units --
it is NOT a fractional order. If the Boston Beer portal wants whole
keg counts instead of case-equivalents in that column, divide the
exported value by the SKU's Case Equiv (from the Packages file) before
upload. This hasn't been confirmed against the portal's actual keg
input format yet.

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
Replace the four source files and re-run the build script (ask Claude
to regenerate, or re-run build_forecast_data.py against the new CSVs)
to regenerate data/forecast.json, then reload the page -- no HTML
changes needed for a routine data refresh.

Known gaps -- see the chat conversation that built this for the full
list of reports that would fortify this further (promo calendar, code
dates, a running history of forecast accuracy over time).
