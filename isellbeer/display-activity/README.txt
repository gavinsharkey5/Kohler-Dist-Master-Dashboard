Display Activity folder

A row-level log of every display photo submission, currently covering
04/09/2026 through 07/10/2026 (whatever's in the source export's
"Report" tab), split by brand manager and supplier so each manager can
pull just their book and hand a clean list to that supplier. A date
range picker in the toolbar lets you narrow to any window within that
data.

Source: 2026_display_activity.xlsx, exported from the Raw Reports
display activity report. Sheets used:
  - "Report": every row (rep, account, supplier, brand, SKU, qty, date,
    photo link) -- this is the only sheet index.html actually reads
    row-by-row.
  - Per-manager sheets and "Brand Managers by Supplier" are NOT used
    for row-level joins anymore -- see "How manager assignment works"
    below for why.

How manager assignment works: brand manager ownership is by SUPPLIER,
not by individual row, so index.html maps each row's Supplier field
through a hardcoded supplier -> manager table (built from the original
June-only export's per-manager sheets, which were verified clean/
exclusive: each supplier belonged to exactly one manager). Do NOT
regenerate this mapping by joining a new export's per-manager sheets
by row number ("#") -- if the new Report is sorted differently (e.g.
newest-first vs. the original oldest-first), row numbers from a stale
per-manager tab will point at completely different rows and silently
mis-assign hundreds of displays. This bit us once already; the
supplier-level table below sidesteps it entirely.

Known supplier -> manager assignments (as of this build):
  Chris Politano   Arizona Beverages USA, Boston Beer Company,
                   Drink Carbliss, New Belgium Brands
  Dan Downing      Athletic Brewing Company, Fever Tree USA (grouped
                   under Molson Coors, see below), Molson Coors
                   Beverage Company, Total Beverage Solution
  Jason Koo        Crescent Canna, Delta Beverages LLC
  Perry Calderone  Heineken, Lagunitas Brewing Company, Yuengling
                   Brewery
  Sean Donahue     Cape May Brewing Company, Garage Beer Co., Mahou
                   USA, Sapporo, Tilray Brands
  Steve Halloran   Constellation Brands, Mark Anthony Group, Phusion
                   Projects LLC., US Beverage
  Tom Gibbons      Central Beer Import & Export Famosa, F.X. Matt
                   Brewing Company, Pabst Brewing Company, Radeberger
                   Gruppe, Sierra Nevada Brewing Company
  Unassigned       Quilmes, Starr Hill Brewery, The Five Points
                   Brewing Company (confirmed: no manager)
  Unverified       Artisanal Brewing Ventures (EBI), Bucanero USA,
                   Delta Beer Lab, Destihl Brewery, Flying Dog
                   Brewery, Kirin Brewery Company, Yeasty Brews
                   (not yet confirmed -- ask Gavin before assigning)

When a new export adds a supplier not in this list, it lands in
"Unverified" automatically rather than being guessed -- update the
GROUP_OVERRIDES/supplier_to_mgr table (see index.html's embedded JSON,
built via a one-off Python script using openpyxl) once the real
manager is confirmed.

Supplier grouping: Fever Tree USA is grouped under Molson Coors
Beverage Company in the Supplier filter/download (they share a
distribution relationship), via a "supplierGroup" field on each
record. This only affects filtering/download grouping -- each row's
"Supplier" column in the table and CSV still shows its real supplier.

Date range: index.html embeds META.dataMinDate/dataMaxDate (the full
span of whatever's in the current export) and the toolbar's From/To
date inputs default to that full range. Narrowing them filters the
table, summary cards, and CSV download together.

CSV photo links: the Photo column in the CSV is written as an Excel
=HYPERLINK() formula rather than a plain URL, so it's clickable when
opened in Excel or Google Sheets. Excel may show a one-time security
prompt for downloaded CSVs with formulas -- the links still work after
dismissing it.

To refresh: re-export the Raw Reports display activity report (Photo
column hyperlinks intact) for whatever new date range, tell me the new
suppliers if any showed up, and I'll rebuild this.
