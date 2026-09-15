Pricing / Deal Levels workbook
==============================

Turns the Encompass RDE export "Pricing Analysis RDE by Month" into an
Excel workbook that lays out every product, every deal level (Min
Purchase Qty) and the case price / cases / margin at each level, plus
INFERRED mix-and-match families and supplier / brand / deal-depth
summaries.

Files
-----
  data/Pricing_Analysis_RDE_by_Month.csv   the export (Aug 2026 on first build)
  build_pricing_workbook.py                builds the workbook
  Pricing_Deal_Levels_Aug_2026.xlsx        the output (rename per month)

Refresh
-------
  1. Export "Pricing Analysis RDE by Month" from Encompass for the month
     (same 13 columns: Supplier, Product Num & Name, Min Purchase Qty,
     Case Unit Price, Deal Start Date, Deal End Date, Cases, FOB, Tax,
     Participation, Laid-in Cost, Gross, Margin %).
  2. Save it over data/Pricing_Analysis_RDE_by_Month.csv (or pass a path).
  3. python3 build_pricing_workbook.py [in.csv] [out.xlsx]
  4. Recalculate (the build writes formulas without cached values):
     python3 <xlsx skill>/scripts/recalc.py out.xlsx 600
     Needs LibreOffice CALC -- the web container ships only
     libreoffice-core; `apt-get install -y libreoffice-calc` first
     (took ~1 min on 2026-09-15). Recalc of this workbook takes ~35 s.
     Excel also recalculates on open, so an un-recalculated file is
     still usable in Excel, just not in previewers / pandas.

What the numbers are
--------------------
  One export row = product x deal level x deal window, with the cases
  sold at that level. Gross $ and Margin % are kept AS REPORTED by
  Encompass: for spirits sold by the bottle the FOB / Laid-in columns
  are per bottle while the price is per case, so Cases x (Price -
  Laid-in) would be wrong there. Everything derived (Revenue, GP/case,
  Front-line price, Discount, Level Band, summaries) is a live formula
  over the Deal Levels sheet.

  Laid-in != FOB + Tax - Participation on 597 rows (Yuengling, Pabst,
  spirits); freight or another component is embedded. Flagged, not
  "fixed".

Mix & match is INFERRED
-----------------------
  The export has no deal-group field. Products are grouped within a
  supplier by the ladder of levels they share at 20+ cases; a lone
  ladder is folded into the supplier ladder it overlaps most (Jaccard
  >= 1/3). That reproduces the recognizable programs (Corona bottles
  25/54/108/162/320, Modelo cans 25/50/81/130/320, White Claw
  25/50/91/104/208, Coors/Miller 25/35/50/150, Twisted Tea 25/50/200,
  Sun Cruiser 20/25/52/208, Heineken 20/30/60/100) but it is a hint,
  not the deal sheet. Confirm before pricing decisions.
