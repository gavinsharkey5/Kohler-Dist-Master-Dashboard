Margin & Deal Level Analysis (Excel workbook)
=============================================

Kohler_Margin_Deal_Level_Analysis_Aug_2026.xlsx analyses one month of
invoice margin against the Encompass deal ladder: executive summary,
supplier / brand family / product / customer margin tables, deal-level
analysis (actual price vs front-line vs published tiers), opportunities
lists, and two pricing scenario sheets (constant-volume what-ifs).

The workbook's own "Read Me" sheet documents sources, definitions,
how returns / credits / breakage / out-of-code are treated, the deal
level matching rules, assumptions and the reports that would strengthen
it. Read that first.

REFRESH (next month)
--------------------
1. Pull from Encompass into one folder:
     - Invoice Transaction Report(s) covering the whole month
       (InvoiceTransReport*.csv -- several date slices are fine, they are
       concatenated; the script warns on duplicate Invoice Trans IDs)
     - Pricing Analysis RDE by Month for the same month
       (Pricing_Analysis_RDE_by_Month*.csv)
     - optional: the Pricing_Deal_Levels_<month>.xlsx workbook, whose
       Deal Levels sheet supplies the Supplier / Brand / Package split
2. python3 build_margin_workbook.py --inputs <folder> --out Kohler_Margin_Deal_Level_Analysis_<Mon>_<yyyy>.xlsx
   (needs pandas + openpyxl; ~4 minutes; reads ../hub/data/accounts.js
   for rep / area / premise labels)
3. Open in Excel so the formulas calculate (or run LibreOffice headless).
   Every summary is a live formula; the "Executive Summary" integrity
   checks should both read "OK - all sheets tie".

WHAT IS AND IS NOT FORMULA-DRIVEN
---------------------------------
Values written by the script: Sales Lines (the audit trail, one row per
customer x product x net price), the base sums on Deal Level Analysis
(cases / units / sales / front-line value / COGS per product x level),
the Deal Ladder (export as received), Excluded Lines, Brand Family Map,
and the ranked snapshot lists on Opportunities.  Everything else --
supplier / brand family / product / customer tables, deal band summary,
executive summary, flags, scenarios -- is formulas over those sheets.
Customer Summary sums each customer's contiguous block of Sales Lines
rows (From / To row pointers) because 1,900 SUMIFS over 79,000 rows made
LibreOffice time out.

Deal levels are identified only where the net price matches exactly one
published level for the invoice date. Where two or more tiers share the
same price the row is labelled Ambiguous and never assigned -- the
margin is still exact, only the tier label is not.
