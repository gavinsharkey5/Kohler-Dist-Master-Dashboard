Online Ordering Pulse Check (Boston Beer)
===========================================

Simplified 2026-07-20 per Kohler: this used to run a trend-line
projection / seasonal fallback / case-pack rounding engine and compute
a "Recommended" order quantity. That's gone. This page is now just a
pulse check: for each SKU, line up Boston Beer's own forecast (F) per
week against recent actual case sales and current inventory, so it's
easy to eyeball whether F needs adjusting -- no projection, no formula
box, no sliders.

Files
-----
  076KOH_Forecasts.csv   Forecast export from the Boston Beer portal.
                         Columns: Product, Distributor, BBC SKU,
                         Customer SKU, then a pair of columns per week:
                         "<date> F" is Boston Beer's own system-
                         generated forecast, "<date> A" is your
                         manager's confirmed order for that week
                         (blank until entered). The nearest week is
                         locked on the live portal (can't be changed)
                         -- shown here for reference only, excluded
                         from the CSV export.
  generate.py            Rebuilds data/forecast.json from the CSV
                         above. Run: python3 generate.py
  data/forecast.json     The page's data. Inventory-side fields
                         (Available, 4-wk/8-wk Average, last 5 weeks of
                         actual case sales, Last Receive Date/Qty,
                         brand/package, cleaned-up product name) are
                         carried forward from whatever was last built
                         in here -- generate.py does NOT take an
                         Encompass Inventory Report as input, it only
                         refreshes the forecast/on-file numbers. To
                         refresh the inventory-side fields, ask Claude
                         to rebuild from a fresh "Boston Beer Inventory
                         Report" export the same way this page was
                         originally built.
  index.html             The page itself.

To refresh with a new forecast export
--------------------------------------
  1. Save the new export over 076KOH_Forecasts.csv (same column
     layout -- a Product/Distributor/BBC SKU/Customer SKU block
     followed by "<date> F"/"<date> A" week pairs).
  2. Run: python3 generate.py
  3. Commit and push.

What's on the page
-------------------
Per SKU: Product (cleaned-up name from Encompass's Products export
where matched, raw portal name + a dagger otherwise), Available,
Last Receive (date + quantity), 4-wk Avg (Encompass's own trailing
average, not something computed here), a small sparkline of the last
5 weeks' actual case sales, then one column per forecast week.

Each week shows Boston Beer's F value in an editable field, with your
manager's confirmed order (A) underneath in small text when one's on
file. F is tinted amber if it's 50%+ above the SKU's own 4-wk Avg, or
teal if it's 50%+ below -- that's the entire "flag" logic, there is no
further math behind it. Everything else (Available, Last Receive,
Recent Sales) is raw source data, meant to be read by eye alongside
the tint, not run through a formula.

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
bottom is unchanged from before -- SKUs Encompass has sales history for
that don't appear in the current Boston Beer forecast export, worth a
glance in case something's missing from the portal.
