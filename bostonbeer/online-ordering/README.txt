Online Ordering Tracker (Boston Beer)
======================================

Cross-references your Boston Beer portal forecast against Encompass
sell-through/inventory data, flags SKUs you're likely over- or
under-ordering, and exports a corrected forecast in the format the
Boston Beer online ordering system accepts as a CSV upload.

Inputs
------
1. Forecast file exported from the Boston Beer portal. Columns: Product,
   Distributor, BBC SKU, Customer SKU, then a pair of columns per week:
   "<date> F" is Boston Beer's OWN system-generated forecast (not your
   team's number), and "<date> A" is your confirmed order for that
   week, entered by your manager -- blank until he's reviewed/adjusted
   it. On the live portal, only the nearest week is locked (grey, can't
   be changed -- it's already committed to ship); every week after that
   is open to edit whether or not it already has a value in it.

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

5. Encompass "Products" export. Maps each Supplier Product Num (BBC SKU)
   to the clean product name stored in Encompass -- this replaces the
   raw, inconsistently-abbreviated names from the Boston Beer forecast
   file (e.g. "Sun Cruiser Half & Half 12oz 6/4pk SK" becomes "Sun
   Cruiser Lemonade & Iced Tea 6/4/12 oz Can") everywhere on the page
   and in the CSV export. SKUs with no match (shown with a "†" marker
   and an "Unmatched product name" tag in the detail view) fall back to
   the raw forecast-file name.

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

Date range and the locked week
-------------------------------
The dashboard only tracks weeks through the end of August -- September
and October are far enough out to just be noise for ordering decisions
right now (edit CUTOFF in build_forecast_data.py to change this). The
nearest week is tagged "Locked" in the detail view: it's already
committed with Boston Beer and can't be changed, so it's shown for
reference only and excluded from the KPI totals, the Difference column,
and the CSV export. Every week after that is still open.

"Difference" compares Recommended against whatever's the CURRENT plan
for that week -- your confirmed order (the "A" column) if one's been
entered, Boston Beer's own forecast (the "F" column) if not. That's
the number that actually matters: it tells you whether to adjust what's
already been typed in, not just how the tool disagrees with Boston
Beer's forecast.

A note on precision: on screen, quantities are always shown as whole
orderable units (e.g. "3" kegs, never "6.94"). The exported CSV,
though, still carries the raw case-equivalent value (6.94) since that's
the unit the upload format is believed to expect -- that number is
still an exact whole-keg multiple, not a rounding artifact. If the
Boston Beer portal actually wants a whole keg count instead of a
case-equivalent in that column, divide the exported value by the SKU's
Case Equiv (from the Packages file) before upload. This hasn't been
confirmed against the portal's actual keg input format yet.

Exporting
---------
The "Export upload CSV" button generates a CSV using the CURRENT
slider settings, with columns Product / Distributor / BBC SKU /
Customer (populated from Customer SKU -- adjust if the portal expects
something different there) followed by the open week-ending date
columns (everything through end of August except the locked nearest
week, since that one can't be changed anyway).

To refresh with new exports
----------------------------
Replace the five source files and re-run the build script (ask Claude
to regenerate, or re-run build_forecast_data.py against the new CSVs)
to regenerate data/forecast.json, then reload the page -- no HTML
changes needed for a routine data refresh.

Click any column header in the SKU table to sort by it; click again to
reverse direction.

Known gaps -- see the chat conversation that built this for the full
list of reports that would fortify this further (promo calendar, code
dates, a running history of forecast accuracy over time).
