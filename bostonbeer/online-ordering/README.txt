Trend Forecast (Boston Beer)
=============================

2026-07-23: the Pulse Check tab is gone (per Kohler -- this page is now
just the Trend Forecast, a genuine projection: for each SKU, the next
8 weeks are projected from last year's actual cases for the matching
retail week x the SKU's trailing-13-week year-over-year trend, then
lined up against Boston Beer's own forecast so it's easy to see where
the two disagree by more than 10%. ForecastReport.xlsx (Encompass's own
forward-looking system forecast, used only by the old Pulse Check
detail panel) is no longer read by generate.py or shipped in this
folder.

Files
-----
  076KOH_Forecasts.csv          Forecast export from the Boston Beer
                                 portal. Columns: Product, Distributor,
                                 BBC SKU, Customer SKU, then a pair of
                                 columns per week: "<date> F" is Boston
                                 Beer's own system-generated forecast
                                 (the "<date> A" confirmed-order column
                                 is no longer used, now that Pulse Check
                                 is gone).
  Boston_Beer_Inventory_Report.csv   Encompass "Boston Beer Inventory
                                 Report" export. Only Supplier Product
                                 ID, Available, and Last Receive
                                 Date/Quantity are used now.
  L13_Trend.csv                  RDE "Comparison" export, trailing 13
                                 weeks: Supplier Product ID, Product
                                 Name, then a "Cases <start> - <end>
                                 M/D/YYYY" column for this year's window
                                 and last year's (generate.py computes
                                 the % change itself from the two raw
                                 case columns). Source of each SKU's
                                 trend % and its L13 comparison numbers
                                 shown in the expand panel.
  LY_By_Week.csv                 RDE "Comparison"/"Fusion" export, full
                                 prior year: Supplier Product ID,
                                 Product Name, then one "Cases <year>
                                 <NN>" column per retail week (NN =
                                 01-52). This is the last-year weekly
                                 baseline the trend % gets applied to,
                                 and the full reference run shown when a
                                 product is expanded.
  generate.py                    Rebuilds data/trend_forecast.json from
                                 the four files above. Run:
                                 python3 generate.py
  data/trend_forecast.json       The page's data.
  index.html                      The page itself.

Encompass's inventory SKU sometimes carries a suffix the Boston Beer
portal SKU doesn't (e.g. portal "AJ0153" vs Encompass "AJ0153A1").
Inventory Report, L13_Trend, and LY_By_Week all use the same kind of
suffixed codes, so generate.py matches each portal SKU into all three
by exact match first, then by prefix.

To refresh with new exports
----------------------------
  1. Save the new exports over 076KOH_Forecasts.csv /
     Boston_Beer_Inventory_Report.csv / L13_Trend.csv / LY_By_Week.csv
     (same column layouts). generate.py re-reads all four every run.
  2. Run: python3 generate.py
  3. Check the printed line -- it states how many SKUs/weeks were
     written and the last-year reference week range. It also prints a
     count of SKUs with no matching L13_Trend.csv or LY_By_Week.csv row
     if those jump a lot, something about the export format likely
     changed.
  4. Commit and push.

What's on the page
-------------------
For each SKU on the Boston Beer forecast, the next up-to-8 weeks are
projected two ways and lined up:

  Trend forecast = last year's actual cases for that SAME retail week
    (matched by week number, not calendar date -- see week_number() in
    generate.py) x (1 + that SKU's 13-week year-over-year case trend
    from L13_Trend.csv), floored at 0.
  BBC forecast = Boston Beer's own "<date> F" value for that week.

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
automatically; nothing here is hardcoded to any specific dates.

Available and Last Receive columns (current on-hand cases and last
delivery date + quantity in Cases, from the Inventory Report) sit
between Product and 13-wk Trend.

Click a product's name to expand a detail panel with two pieces of the
picture behind its 8-week forecast:
  - "Last year's weekly sales" -- the full run of last year's actual
    cases from the same starting week used for the 8-week forecast
    through the end of that year (not just the 8 forecast weeks), so a
    manager can see the whole season the projection was built from.
  - "13-wk trend comparison" -- this year's vs. last year's trailing
    13-week case totals side by side, the two numbers behind the
    SKU's trend % itself.
A SKU missing either source shows a plain "not available" line in that
block's place instead of a broken/empty chart.

The "What does the % next to BBC mean?" details block spells out the
diffPct formula with a worked example, for a manager who doesn't want
to read generate.py to understand the tinting.

The table itself is read-only -- the trend forecast and BBC forecast
numbers in each week cell are NOT editable (an earlier version made
them editable in place; reverted 2026-07-23 per Kohler, who wanted a
separate scratch calculator instead, not edits mixed into the real
data). Below the legend is a standalone "Quick calculator": Boston
Beer forecast / Trend forecast fields computing (BBC - Trend) / Trend
live, entirely disconnected from TREND/the table/the export -- typing
in it never touches a real number anywhere on the page.

Click "Available", "Last Receive", or "13-wk Trend" to sort by that
column; search filters by product name or SKU. "Export CSV" downloads
whatever's currently visible (respects the search filter and sort
order) -- Product, SKU, Available, Last Receive, Last Receive Cases,
13-wk Trend %, then Trend Forecast / BBC Forecast / Diff % for each of
the 8 weeks -- always the computed values, never anything typed into
the quick calculator.
