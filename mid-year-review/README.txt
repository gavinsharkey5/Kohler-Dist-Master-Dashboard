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

A second tab, "New in 2026", lists brands with zero prior-year sales
(regardless of whether a goal exists for them in the workbook -- per
Kohler, 2026-07-28, a handful of brands do have a goal % on file
despite zero 2025 volume, e.g. Viva Tequila Seltzer, Pop Sips,
Newcastle; those move here too since there's no real prior-year
baseline to measure a trend against). Almost always brand-new
launches (e.g. Carbliss, Monaco, Noca) the plan was built before they
existed.

A third tab, "Terminated Brands" (per Kohler, 2026-07-28), lists
brands with zero or negative 2026 YTD Case Equivalents -- pulled out
of both the Vs. Goal and New in 2026 tabs regardless of whether they
have a goal or prior-year sales on file, since they aren't actively
selling right now either way.

Shipyard, Jersey Girl, Soda Birch, and Whole Hog are excluded from the
dashboard entirely (per Kohler, 2026-07-28) -- negative/near-zero
credit-adjustment entries in the RDE export, not real placements. See
EXCLUDED_BRANDS in generate.py.

A fourth tab, "By Supplier" (added 2026-08-03 per Gavin's managers'
request), is the same vs.-goal math rolled up to the supplier level
(Constellation Brands, MolsonCoors, etc.) instead of brand family.
Each supplier's Brewery/Kohler Goal % and 2025 Finish come from that
supplier's own grey header row in the planning workbook (not a sum of
its brands' individual goals), and its YTD Case Equiv figures come
from that supplier's own subtotal row in ytd_comparison.csv (not a
re-sum of the brand-level rows, so it still reconciles even for
brands the Vs. Goal tab excludes, relabels, or moves to another tab).
Goal % is editable here too, independently of the brand-level table.
Only suppliers with BOTH a workbook goal and recorded YTD volume in
either year appear -- 119 of 133 workbook suppliers as of this
refresh; the other 14 (Suntory, Iron Horse, Heavy Seas, etc.) had zero
volume in both years and so don't have a row in the RDE export at all.
Plus 1 synthesized entry (see below) for a supplier with brand-level
goals but no supplier-level grey row of its own -- 120 total.

A fifth tab, "Supplier + Brand" (added 2026-08-03 per Gavin's
managers' request), mimics the layout of the "2026 Planning by Brand"
workbook sheet itself: each supplier's own row (bold, collapsed by
default) with its brand families listed underneath when expanded.
Only brands with a 2026 goal are nested here (the same 235-brand set
as the Vs. Goal tab) -- New in 2026 and Terminated brands stay off
this view. Clicking a supplier row toggles it; Expand All/Collapse All
and a search box (which force-expands any supplier with a matching
brand) make it easy to find one brand without opening all 120 groups.
Brand rows within a group are always sorted by Gap vs. Brewery Goal
(worst first); clicking a column header sorts the supplier rows
instead. Editable Goal % works the same way as the other two tabs,
independently (edits here don't affect the Vs. Goal or By Supplier
tabs, and vice versa).

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
