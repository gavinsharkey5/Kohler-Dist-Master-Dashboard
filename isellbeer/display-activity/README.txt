Display Activity folder &mdash; June 2026

A row-level log of every display photo submission in the June 2026 report
(06/01/2026-06/30/2026), split by brand manager and supplier so each
manager can pull just their book and hand a clean list to that supplier.

Source: June_2026_display_activity.xlsx, exported from the Raw Reports
display activity report. That workbook already contains:
  - "Report": all 370 rows (rep, account, supplier, brand, SKU, qty,
    date, photo link)
  - Per-manager sheets (Chris Politano, Dan Downing, Jason Koo, Perry
    Calderone, Sean Donahue, Steve Halloran, Tom Gibbons, Unassigned)
    that already split those 370 rows by brand manager

index.html joins the "Report" sheet's photo hyperlinks (the per-manager
sheets don't carry hyperlink metadata, only the raw "Photo" text) back
onto each row using the report's own row number, then embeds the result
as a JSON snapshot (see the <script id="da-data"> tag), so the page
works standalone with no fetch calls.

Filters: Brand Manager -> Supplier (narrows to just that manager's
suppliers, e.g. Steve Halloran -> Constellation Brands vs. Mark Anthony
Group) -> Rep -> free-text search. The Download CSV button exports
exactly whatever's currently filtered, named for the active
manager/supplier (e.g. display-activity_Steve-Halloran_Constellation-
Brands_june-2026.csv).

Supplier grouping: Fever Tree USA is grouped under Molson Coors
Beverage Company in the Supplier filter/download (they share a
distribution relationship), via a "supplierGroup" field on each
record. This only affects filtering/download grouping -- each row's
"Supplier" column in the table and CSV still shows its real supplier.
To add another grouping, add an entry to GROUP_OVERRIDES when
regenerating the embedded JSON (raw supplier -> group name it should
file under).

CSV photo links: the Photo column in the CSV is written as an Excel
=HYPERLINK() formula rather than a plain URL, so it's clickable when
opened in Excel or Google Sheets. Excel may show a one-time security
prompt for downloaded CSVs with formulas -- the links still work after
dismissing it.

To refresh: re-export the Raw Reports display activity for the new
period, keeping the per-manager sheets and the Photo column's
hyperlinks intact, and I'll rebuild this.
