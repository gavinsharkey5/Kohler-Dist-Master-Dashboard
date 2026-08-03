6-Month Review — Brand Trend vs. Goal

For every brand family, compares its current year-over-year trend
(Case Equivalents, same comparable date range both years -- currently
1/1-7/31) against its 2026 Brewery Goal % and Kohler Goal % from the
planning workbook -- so brand managers can see at a glance who's
ahead of, on, or behind pace, and recalibrate for the back half of
the year. Rows are color-coded (red = behind goal, green = ahead/on
pace). Brewery-goal columns are amber, Kohler-goal columns are blue.
The exact comparable date range is read straight out of
ytd_comparison.csv's own column headers each refresh (see
generate.py's range_prior/range_current), so the page's subtitle text
never needs a manual edit when the window shifts.

Shows both years' comparable-YTD case volumes plus a 2026 Projected
Finish (this year's YTD case count + the 2025 remainder-of-year grown
at this year's YTD trend rate -- same method as ../2027-planning/).
Each brand's Brewery Goal % and Kohler Goal % is editable right in the
table -- typing a new value recalculates that track's Goal CE and Gap
live (and the KPI tiles above), so a manager can test "what if we
recalibrated this brand's goal" without touching the workbook. Edits
are local to the browser only (not saved back); "Reset edited goals"
reverts everything to the workbook's original values.

Default sort is 2026 YTD CE, largest first.

Tab order (per Gavin, 2026-08-04): "Supplier + Brand" opens first,
then "By Supplier", then "By Brand Family" (the original brand-level
table, renamed from "Vs. Goal"), then "New Brand Families in 2026"
(renamed from "New in 2026"), then "Terminated Brands" last.

"New Brand Families in 2026" lists brands with zero prior-year sales
(regardless of whether a goal exists for them in the workbook -- per
Kohler, 2026-07-28, a handful of brands do have a goal % on file
despite zero 2025 volume, e.g. Viva Tequila Seltzer, Pop Sips,
Newcastle; those move here too since there's no real prior-year
baseline to measure a trend against). Almost always brand-new
launches (e.g. Carbliss, Monaco, Noca) the plan was built before they
existed.

"Terminated Brands" (per Kohler, 2026-07-28) lists brands with zero
or negative 2026 YTD Case Equivalents -- pulled out of both the By
Brand Family and New Brand Families in 2026 tabs regardless of
whether they have a goal or prior-year sales on file, since they
aren't actively selling right now either way.

Shipyard, Jersey Girl, Soda Birch, and Whole Hog are excluded from the
dashboard entirely (per Kohler, 2026-07-28) -- negative/near-zero
credit-adjustment entries in the RDE export, not real placements. See
EXCLUDED_BRANDS in generate.py.

"By Supplier" (added 2026-08-03 per Gavin's managers' request) is the
same vs.-goal math rolled up to the supplier level (Constellation
Brands, MolsonCoors, etc.) instead of brand family. Each supplier's
Brewery/Kohler Goal % and 2025 Finish come from that supplier's own
grey header row in the planning workbook (not a sum of its brands'
individual goals), and its YTD Case Equiv figures come from that
supplier's own subtotal row in ytd_comparison.csv (not a re-sum of the
brand-level rows, so it still reconciles even for brands the By Brand
Family tab excludes, relabels, or moves to another tab). Goal % is
editable here too, independently of the brand-level table. Only
suppliers with BOTH a workbook goal and recorded YTD volume in either
year appear -- 119 of 133 workbook suppliers as of this refresh; the
other 14 (Suntory, Iron Horse, Heavy Seas, etc.) had zero volume in
both years and so don't have a row in the RDE export at all. Plus 1
synthesized entry (see below) for a supplier with brand-level goals
but no supplier-level grey row of its own -- 120 total.

"Supplier + Brand" (added 2026-08-03, reordered to the first tab and
tuned 2026-08-04, both per Gavin's managers' request) mimics the
layout of the "2026 Planning by Brand" workbook sheet itself: each
supplier's own row (bold, darker background, collapsed by default)
with its brand families listed underneath when expanded, sorted by
2026 YTD CE largest-first (so e.g. Corona Extra is the first brand
listed under Constellation Brands). Clicking a supplier row toggles
it; Expand All/Collapse All and a search box (which force-expands any
supplier with a matching brand) make it easy to find one brand
without opening all 129 groups. Clicking a column header sorts the
supplier rows (brand rows within a group keep their fixed
CE-descending order regardless of the supplier-level sort). Editable
Goal % works the same way as the other two tabs, independently (edits
here don't affect the By Brand Family or By Supplier tabs, and vice
versa).

As of 2026-08-04 (per Gavin's managers' request), this tab's grouping
mirrors ytd_comparison.csv's OWN Supplier -> Brand Family hierarchy
directly -- every supplier and brand family RDE tracks (129 suppliers,
338 brand families this refresh), not just the with-goal subset the
By Brand Family / By Supplier tabs use. A brand or supplier with no
workbook goal simply shows blank Goal %/Goal CE/Gap cells and a "No
Goal" status, same treatment goal-less items already got elsewhere.
See build_raw_supplier_tree() in generate.py: RDE flattens its 2-level
Supplier -> Brand Family tree into one column with no indent marker,
but it's fully recoverable because a header row's own Case Equiv
figures always exactly equal the sum of the brand-family rows
immediately beneath it, up to the next header row -- reconstructed by
finding that run for every row, greedily, and validated to fully
resolve all ~465 rows in the export with zero leftovers.

One surprising but confirmed-correct consequence: this tab now follows
RDE's OWN routing rather than the planning workbook's taxonomy, and
those two occasionally disagree. Kirin Ichiban and Kirin Light are
each their own goal-tracked entity in the workbook, but RDE's current
export nests both of them as brand families under New Belgium Brewing
Company (not their own supplier header) -- so here they show up as
children of New Belgium (each still carrying their own individual
goal %, separate from New Belgium's), whereas the By Brand Family tab
still shows their workbook-assigned supplier. Worth flagging to
whoever owns the workbook if that routing looks wrong; not touched
here since the instruction was to mirror the RDE export exactly.

Exception (per Gavin, 2026-08-04): Food & Bev Enterprise LLC (Denise
Montes' brands) is deliberately NOT rebuilt from this raw hierarchy --
its 6 children here are the exact same product-detail-corrected
records already used elsewhere (see the Food & Bev Enterprise LLC
paragraph below), not the raw CSV's generic 4-row breakdown, per
explicit instruction to leave her brands unchanged.

Conditional formatting on Trend %: every Trend % cell (By Brand
Family, By Supplier, and Supplier + Brand) is shaded on a continuous
green-to-red scale based on how far it is from 0% -- more saturated
green the more it's growing, more saturated red the more it's
bleeding, capped at a +/-30% swing (see TREND_SCALE_CAP in
index.html) so one extreme outlier doesn't wash out the rest of the
scale for everything else.

Click-to-sum on '26 YTD CE: click any '26 YTD CE cell (in any tab,
including New Brand Families in 2026 and Terminated Brands) to select
it -- click again to deselect. A floating bar at the bottom-right of
the page sums every selected cell in the CURRENT tab live, so you can
spot-check that a supplier's own total on the Supplier + Brand or By
Supplier tab actually matches the sum of its individual brands (or
vice versa). Selections are local to whichever tab is open and clear
automatically when you switch tabs or re-sort/re-filter the table.

One supplier -- Food & Bev Enterprise LLC (Denise Montes' brands:
Aguila Import/Light, Club Colombia Dorada/Roja, Poker Import,
Costenita) -- has brand-level goals in the workbook but never got its
own grey header/goal row built into the sheet, so there's no
supplier-level Brewery/Kohler Goal % for it. Rather than let its 6
brands silently vanish from the By Supplier and Supplier + Brand tabs,
generate.py synthesizes a "No Goal" supplier entry for it by summing
its own children directly (see the orphan_suppliers logic in
generate.py) -- it shows correct YTD/Trend numbers with blank goal
columns, same treatment a goal-less brand already gets.

Files:
  2026_planning_source.xlsx  The 2026 Planning by Brand workbook --
                              gives us each brand's supplier, brand
                              manager, and 2026 Brewery/Kohler Goal %
                              (columns K/N of the '2026 Planning by
                              Brand' tab). Same workbook used by
                              ../2027-planning/.
  ytd_comparison.csv          RDE "Comparison" export, same period
                              both years (e.g. "Case Equiv
                              1/1/2025-7/28/2025" vs "Case Equiv
                              1/1/2026-7/28/2026" plus a "Case Equiv %
                              +/-" column, which IS the current trend
                              -- no projection math involved). Column
                              headers' date range shifts every refresh;
                              matched by "Case Equiv" prefix, not the
                              exact string.
  denise_food_bev_product_detail.csv
                              RDE product-level export (Supplier, Brand
                              Family, Product Name, both years' Case
                              Equiv) scoped to Denise Montes' brands.
                              RDE's own Brand Family tagging lumps
                              several Food & Bev Enterprise LLC brands
                              together (Aguila Light Import counted
                              under "Aguila Import"; Club Colombia
                              Dorada/Roja and Pilsen Import all under a
                              generic "Food & Bev") -- this file's
                              Product Name text still distinguishes
                              them, so generate.py matches on keywords
                              in that column instead (see
                              FOOD_BEV_BRAND_KEYWORDS) to recover the
                              real per-brand split. Optional -- if this
                              file is absent, those brands just fall
                              back to RDE's own (contaminated) rollup.
  generate.py                 Rebuilds data/data.json from the files
                              above.
  index.html                  The page itself.

To refresh (e.g. at each month-end check-in):
  1. Re-pull the Encompass report (same QuickLink Gavin was given) for
     the new date range, save it over ytd_comparison.csv (same
     filename, same columns).
  2. If the goals themselves changed, save the updated workbook over
     2026_planning_source.xlsx.
  3. If refreshing Denise Montes' Food & Bev Enterprise LLC brands,
     re-pull the product-level export too and save it over
     denise_food_bev_product_detail.csv.
  4. Run: python3 generate.py
  5. Commit and push.

Notes:
  - A brand whose name is also used as its own supplier label in the
    workbook (single-brand entities like Carbliss, Sapporo, Monaco)
    is matched correctly even when RDE emits it as one row instead of
    a header+leaf pair -- see the lookahead logic in
    parse_ytd_csv() in generate.py.
  - A handful of brands have unusually large Goal % values in the
    workbook (e.g. 2000%+) -- these read as placeholder multipliers
    entered for brand-new-2026 items rather than real annual growth
    targets. Flagged in the dashboard's own data-quality caveats
    rather than silently corrected; worth confirming with whoever set
    them.
  - Segment/sub-segment is deliberately left out of this tool (per
    Kohler, 2026-07-28) -- filter by Brand Manager or Supplier
    instead.
  - Brand-level totals reconcile to ytd_comparison.csv's own Total row
    within ~0.02%.
  - denise_food_bev_product_detail.csv is now on the same 1/1-7/31
    window as ytd_comparison.csv (re-pulled 2026-08-03).
  - SUPPLIER_OVERRIDES in generate.py corrects brand->supplier
    mismatches in the workbook itself (e.g. "Fresca Mixed" is tagged
    "Constellation Brands" in the workbook, but really belongs to
    Sazerac Inc per ytd_comparison.csv's own row order). This affects
    the By Brand Family tab's Supplier column; the Supplier + Brand
    tab doesn't need it since that tab's grouping already comes
    straight from the raw CSV hierarchy, independent of the workbook.
