Online Ordering Pulse Check (Boston Beer)
===========================================

Simplified 2026-07-20 per Kohler: this used to run a trend-line
projection / seasonal fallback / case-pack rounding engine and compute
a "Recommended" order quantity. That's gone. This page is a pulse
check: for each SKU, line up Boston Beer's own forecast (F) per week
against recent actual case sales, current inventory, and Boston Beer's
own forward-looking system forecast, so it's easy to eyeball whether F
needs adjusting -- no projection, no formula box, no sliders.

Files
-----
  076KOH_Forecasts.csv          Forecast export from the Boston Beer
                                 portal. Columns: Product, Distributor,
                                 BBC SKU, Customer SKU, then a pair of
                                 columns per week: "<date> F" is Boston
                                 Beer's own system-generated forecast,
                                 "<date> A" is your manager's confirmed
                                 order for that week (blank until
                                 entered). The nearest week is locked
                                 on the live portal (can't be changed)
                                 -- shown here for reference only,
                                 excluded from the CSV export.
  Boston_Beer_Inventory_Report.csv   Encompass "Boston Beer Inventory
                                 Report" export. Columns: Supplier,
                                 Brand Family, Package, Product Link
                                 (Customer SKU + clean product name in
                                 one field -- this is the only source
                                 of the cleaned-up product name shown
                                 on the page, no separate "Products"
                                 export needed anymore), Supplier
                                 Product ID, Cases -6 Weeks through
                                 Cases This Week (8 weeks of actual
                                 case sales), Available, Last Receive
                                 Date/Quantity.
  ForecastReport.xlsx            Encompass "ForecastReport" export.
                                 Boston Beer's own forward-looking
                                 system forecast in case-equivalents,
                                 one column per week for several months
                                 out -- this is what lets you see
                                 whether a product's sales look
                                 seasonal (a real ramp coming) or just
                                 growing, beyond what recent weeks
                                 alone would show.
  generate.py                    Rebuilds data/forecast.json from the
                                 three files above. Run:
                                 python3 generate.py
  data/forecast.json             The page's data.
  index.html                      The page itself.

Encompass's inventory SKU sometimes carries a suffix the Boston Beer
portal SKU doesn't (e.g. portal "AJ0153" vs Encompass "AJ0153A1").
Both the Inventory Report and ForecastReport use the same suffixed
codes, so generate.py matches each portal SKU to inventory/forecast
data by exact match first, then by prefix.

4-wk Avg is computed in generate.py (Encompass no longer provides a
pre-computed average column in this export) as the mean of the last 4
*complete* weeks -- Cases This Week is excluded since it's a partial,
still-in-progress week that would understate the average. It's still
shown in the Recent Sales detail, just as the last bar.

To refresh with new exports
----------------------------
  1. Save the new exports over 076KOH_Forecasts.csv /
     Boston_Beer_Inventory_Report.csv / ForecastReport.xlsx (same
     column layouts). Any of the three can be refreshed independently
     -- generate.py re-reads all three every run regardless of which
     changed.
  2. Run: python3 generate.py
  3. Check the printed match-rate lines -- if the "no matching
     Inventory Report row" or "no matching ForecastReport row" counts
     jump a lot, something about the export format likely changed.
  4. Commit and push.

What's on the page
-------------------
Per SKU: Product (cleaned-up name from the Inventory Report's Product
Link column where matched, raw portal name + a dagger otherwise),
Available, Last Receive (date + quantity), 4-wk Avg, a small sparkline
of the last 8 weeks' actual case sales, then one column per forecast
week.

Each week shows Boston Beer's F value in an editable field, with your
manager's confirmed order (A) underneath in small text when one's on
file. F is tinted amber if it's 50%+ above the SKU's own 4-wk Avg, or
teal if it's 50%+ below -- that's the entire "flag" logic, there is no
further math behind it. Everything else (Available, Last Receive,
Recent Sales) is raw source data, meant to be read by eye alongside
the tint, not run through a formula.

Click a product's name to expand a detail panel with two mini bar
charts: "Recent actual sales" (the same 8 weeks as the Recent Sales
sparkline, but full numbers and week labels) and "Boston Beer's system
forecast" (their own forward-looking model from ForecastReport, several
months out). Neither chart computes anything -- they're both raw
numbers, side by side, so you can eyeball whether a product's recent
run-rate and Boston Beer's own forward expectation agree, and whether
a seasonal ramp or a growth trend shows up in their forecast that
recent weeks alone wouldn't tell you. A SKU with no Inventory Report or
ForecastReport row shows a plain "not available" line in that chart's
place instead of a broken/empty chart.

You can edit any (non-locked) F value directly in the table -- it's
kept in the browser only, not written back to the CSV or JSON. "Export
upload CSV" downloads Product/Distributor/BBC SKU/Customer plus every
open (non-locked) week, using whatever's currently in each F field
(your edits if you made any, Boston Beer's original number otherwise)
-- ready to re-upload to the portal. "Reset edits" clears anything
you've typed and reverts every field to Boston Beer's original
forecast.

Click any of the first four column headers to sort; type in the
search box to filter by product name or SKU.

The "SKUs with recent sales but no current forecast row" panel at the
bottom lists Inventory Report rows that don't appear in the current
Boston Beer forecast export -- worth a glance in case something's
missing from the portal.
