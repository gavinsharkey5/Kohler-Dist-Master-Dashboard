Online Ordering Pulse Check (Boston Beer)
===========================================

Simplified 2026-07-20 per Kohler: this used to run a trend-line
projection / seasonal fallback / case-pack rounding engine and compute
a "Recommended" order quantity. That's gone. The Pulse Check tab is
deliberately just that -- pulse check, not a projection: for each SKU,
line up your confirmed order (On File) per week against recent actual
case sales, current inventory, Boston Beer's own forecast (F, shown
for reference), and Encompass's own forward-looking system forecast,
so it's easy to eyeball whether On File needs adjusting -- no
projection, no formula box, no sliders.

Added 2026-07-22: a second Trend Forecast tab, which *is* a genuine
projection (see "Trend Forecast tab" below) -- it lives alongside the
Pulse Check rather than replacing it, since they answer different
questions: Pulse Check is "does On File look right against what
already happened", Trend Forecast is "what does the recent trend say
we should expect, and where does Boston Beer's own forecast disagree
with that by more than 10%".

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
                                 Encompass's own forward-looking
                                 system forecast in case-equivalents,
                                 one column per week for several months
                                 out -- this is what lets you see
                                 whether a product's sales look
                                 seasonal (a real ramp coming) or just
                                 growing, beyond what recent weeks
                                 alone would show.
  L13_Trend.csv                  RDE "Comparison" export, trailing 13
                                 weeks: Product Num, Supplier Product
                                 ID, Product Name, then a "Cases <start>
                                 - <end> M/D/YYYY" column for this
                                 year's window and last year's, plus
                                 Cases +/- and Cases % +/- (the file's
                                 own computed change -- generate.py
                                 recomputes this itself from the two
                                 raw case columns rather than parsing
                                 the formatted % text). This is the
                                 source of each SKU's trend %.
  LY_By_Week.csv                 RDE "Comparison" export, full prior
                                 year: Product Num, Supplier Product
                                 ID, Product Name, then one "Cases
                                 <year> <NN>" column per retail week
                                 (NN = 01-52, plus a "<year-1> 00" stub
                                 week) and a Cases Sum total. This is
                                 the last-year weekly baseline the
                                 trend % gets applied to.
  generate.py                    Rebuilds data/forecast.json from the
                                 first three files, and data/
                                 trend_forecast.json from all five. Run:
                                 python3 generate.py
  data/forecast.json             Pulse Check tab's data.
  data/trend_forecast.json       Trend Forecast tab's data.
  index.html                      The page itself (both tabs).

Encompass's inventory SKU sometimes carries a suffix the Boston Beer
portal SKU doesn't (e.g. portal "AJ0153" vs Encompass "AJ0153A1").
Inventory Report, ForecastReport, L13_Trend, and LY_By_Week all use
the same kind of suffixed codes, so generate.py matches each portal
SKU into all four by exact match first, then by prefix.

4-wk Avg is computed in generate.py (Encompass no longer provides a
pre-computed average column in this export) as the mean of the last 4
*complete* weeks -- Cases This Week is excluded since it's a partial,
still-in-progress week that would understate the average. It's still
shown in the Recent Sales detail, just as the last bar.

To refresh with new exports
----------------------------
  1. Save the new exports over 076KOH_Forecasts.csv /
     Boston_Beer_Inventory_Report.csv / ForecastReport.xlsx /
     L13_Trend.csv / LY_By_Week.csv (same column layouts). Any of the
     five can be refreshed independently -- generate.py re-reads all
     of them every run regardless of which changed. L13_Trend.csv and
     LY_By_Week.csv are optional -- if either is missing, generate.py
     still rebuilds the Pulse Check tab and just skips
     trend_forecast.json (the Trend Forecast tab then shows "Trend
     forecast data not available").
  2. Run: python3 generate.py
  3. Check the printed match-rate lines -- if the "no matching
     Inventory Report row", "no matching ForecastReport row", "no
     matching L13_Trend.csv row", or "no matching LY_By_Week.csv row"
     counts jump a lot, something about the export format likely
     changed.
  4. Commit and push.

What's on the page
-------------------
Per SKU: Product (cleaned-up name from the Inventory Report's Product
Link column where matched, raw portal name + a dagger otherwise),
Available, Last Receive (date + quantity), 4-wk Avg, a small sparkline
of the last 8 weeks' actual case sales, then one column per forecast
week.

Each week shows your confirmed order (On File, the portal's "A"
column) in an editable field -- blank until your manager actually
enters a number, never silently defaulted to Boston Beer's forecast --
with Boston Beer's F value underneath in small text for reference. On
File is tinted amber if it's 50%+ above the SKU's own 4-wk Avg, or
teal if it's 50%+ below -- that's the entire "flag" logic, there is no
further math behind it, and it only lights up once a number's actually
been entered. Everything else (Available, Last Receive, Recent Sales,
the F reference) is raw source data, meant to be read by eye alongside
the tint, not run through a formula. The locked (nearest) week shows
whatever actually shipped -- On File if one was entered, Boston Beer's
forecast otherwise -- since it already happened and can't change.

Click a product's name to expand a detail panel with two mini bar
charts: "Recent actual sales" (the same 8 weeks as the Recent Sales
sparkline, but full numbers and week labels) and "Encompass System
Forecast" (Encompass's own forward-looking model from ForecastReport,
several months out). Neither chart computes anything -- they're both
raw numbers, side by side, so you can eyeball whether a product's
recent run-rate and Encompass's forward expectation agree, and whether
a seasonal ramp or a growth trend shows up in their forecast that
recent weeks alone wouldn't tell you. A SKU with no Inventory Report or
ForecastReport row shows a plain "not available" line in that chart's
place instead of a broken/empty chart.

You can edit any (non-locked) On File value directly in the table --
it's kept in the browser only, not written back to the CSV or JSON.
"Export upload CSV" downloads Product/Distributor/BBC SKU/Customer plus
every open (non-locked) week, using whatever's currently on file (your
edits if you made any, the original On File value otherwise) -- a week
nobody's decided on yet exports blank rather than guessing at Boston
Beer's forecast. "Reset edits" clears anything you've typed and
reverts every field to the original On File value.

Click any of the first four column headers to sort; type in the
search box to filter by product name or SKU.

The "SKUs with recent sales but no current forecast row" panel at the
bottom lists Inventory Report rows that don't appear in the current
Boston Beer forecast export -- worth a glance in case something's
missing from the portal.

Trend Forecast tab
------------------
For each SKU on the Boston Beer forecast (same driver list as Pulse
Check), the next up-to-8 weeks are projected two ways and lined up:

  Trend forecast = last year's actual cases for that SAME retail week
    (matched by week number, not calendar date -- see week_number() in
    generate.py) x (1 + that SKU's 13-week year-over-year case trend
    from L13_Trend.csv), floored at 0.
  BBC forecast = Boston Beer's own "<date> F" value for that week,
    same number shown on the Pulse Check tab.

The trend forecast is the bold number; Boston Beer's forecast and the
% difference are the small text underneath. A week is tinted amber if
Boston Beer's forecast is more than 10% ABOVE trend, teal if more than
10% below -- purely a threshold on the two numbers already computed,
no further logic. A SKU with no positive last-year volume in the L13
window (new item, nothing to project) or no matching LY_By_Week row
shows "No history" / a dash rather than a fabricated number, with
Boston Beer's forecast still shown alongside for reference.

The week-number matching (which calendar week this year lines up with
which week last year) is derived from L13_Trend.csv's own stated date
windows each run, under the assumption that week 1 of a year starts
the Sunday on or before Jan 1 (verified, not assumed -- it reproduces
both of L13_Trend.csv's window boundaries exactly for both years the
file ships with). That means a refresh with a differently-dated
L13_Trend.csv/076KOH_Forecasts.csv pair re-derives the right weeks
automatically; nothing here is hardcoded to July 2026's specific
dates.

Click the "13-wk Trend" column header to sort by trend %; search
filters by product name or SKU same as the Pulse Check tab.
