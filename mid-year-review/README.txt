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
directly -- every supplier and brand family RDE tracks, not just the
with-goal subset the By Brand Family / By Supplier tabs use. A brand
or supplier with no workbook goal simply shows blank Goal %/Goal
CE/Gap cells and a "No Goal" status, same treatment goal-less items
already got elsewhere. See build_raw_supplier_tree() in generate.py:
RDE flattens its 2-level Supplier -> Brand Family tree into one column
with no indent marker, but it's fully recoverable because a header
row's own Case Equiv figures always exactly equal the sum of the
brand-family rows immediately beneath it, up to the next header row --
reconstructed by finding that run for every row, greedily, and
validated to fully resolve all ~465 rows in the export with zero
leftovers.

As of 2026-08-05 (per Gavin's managers' request): a whole supplier
with 0 or negative 2026 YTD CE (e.g. the Buzbee's...Point Brewing tail
of the export) is dropped from this tab entirely, and an individual
brand family with 0/negative 2026 YTD CE is dropped even under an
otherwise-healthy supplier (e.g. Corona Refresca under Constellation
Brands, Coney Island under Boston Beer Company) -- same threshold the
Terminated Brands tab already uses. 109 suppliers / 291 brand families
remain as of this refresh (down from 129 / 338). Buzbee's Beverages
USA LLC itself is technically +$0.57 CE, not zero or negative, but was
named explicitly as the start of the range to drop, so it's excluded
by name (COMBO_MANUAL_EXCLUDE_SUPPLIERS in generate.py) rather than by
the numeric rule. Every brand dropped this way that wasn't already
represented in Terminated Brands gets added there (2 this refresh --
most of the ~45 dropped brands already existed there since they're
also workbook-recognized brands); Shipyard/Jersey Girl/Soda
Birch/Whole Hog are skipped per the existing EXCLUDED_BRANDS policy
rather than added.

Mirrored the other direction the next day (per Gavin's managers'
request): a whole supplier with 0 sales in 2025 (brand-new to the
portfolio, e.g. Carbliss under SN Food & Beverage LLC, Noca under Noca
Beverages) is also dropped from this tab, and an individual brand
family with 0 2025 sales is dropped even under an established supplier
(e.g. Monaco under MolsonCoors Beverage Company) -- no real prior-year
baseline to show a trend against, same threshold New Brand Families in
2026 already uses. 86 suppliers / 241 brand families remain as of this
refresh. Dropped brands not already represented in New Brand Families
get added there.

A raw CSV row that never matched any single workbook brand (like
"Monaco" above) is often ALREADY represented in New Brand Families
under a relabeled compound name from the unbroken_out logic further
below (e.g. "Monaco (Lech, Milwaukee's Best)" -- Lech and Milwaukee's
Best are workbook brands under MolsonCoors that RDE never broke out
individually, so their volume rides along on whatever raw row RDE
happened to label). Both of these removal passes match on the raw
(supplier, brand) pair against the unclassified list, not just the
display name, so a brand like this gets pulled off the Supplier +
Brand tab without creating a second, duplicate row elsewhere.

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

Trend-driver "i" popovers (added 2026-08-10, a manager's suggestion,
built from a one-off Fusion export the user attached in chat): a small
"i" icon next to each supplier's name on the Supplier + Brand tab
(hover on desktop, tap to pin on touch -- click elsewhere, or the icon
again, to unpin) shows a quick synopsis of WHY that supplier's Trend %
looks the way it does -- its top brand families driving growth vs.
dragging it down, and which SPECIFIC package (the raw Fusion Package
label, e.g. "1/15/19.2oz Can" -- not a coarse Cans/Bottles/Kegs
grouping, per Gavin 2026-08-10) is growing vs. shrinking within
that supplier. A matching icon next to the "Supplier + Brand rollup"
heading itself shows the same thing rolled up company-wide. Data comes
from brand_package_trend.csv (see that file's own entry above) via
generate.py's parse_brand_package_trend() -- entirely independent of
the workbook-goal machinery the rest of this tab uses, so a supplier
with no popover data just gets no icon rather than a blank/broken one.
Rendered into one shared #infoTooltip element positioned in JS (not
nested inside each row) specifically so it can't get clipped by
.tablewrap's horizontal scroll container or by a long supplier name's
own text-overflow ellipsis.

Suppliers Overview header widget (moved 2026-08-10, per Gavin): what
used to be 2 separate tiles in the Supplier + Brand tab's own KPI row
-- "Suppliers Tracked" (count + brand-family rollup) and "Suppliers
vs. Goal" (the On Pace / Behind Brewery / Behind Kohler / Behind Both
breakdown) -- are now combined into ONE "Suppliers Overview" card in
the page header, sitting in the row alongside Segment Trend and
Package Trend (between the lede text and Segment Trend, filling what
was previously empty whitespace there). Like those two, it's
page-level -- visible on every tab, not just when Supplier + Brand is
active -- even though its underlying numbers still come from
DATA.comboGroups (the Supplier + Brand tab's own dataset).
renderSuppliersWidget() re-renders automatically any time
renderComboKPIs() does (initial load, a live Goal % edit, or Reset
edited goals), since editing a goal can move a supplier between
statuses. The Supplier + Brand tab's own KPI row now has just 2 tiles
left: Company Trend (YTD) and 2026 Projected Finish.

Package Trend units-first format (changed 2026-08-10, per Gavin): each
mover row used to show that package's absolute CURRENT-year Cases
count next to a %-change pill (e.g. "22,248  +644.3%"). Now shows the
UNIT swing first with the % in parens right after (e.g. "+19,257
(+644.3%)"), colored green/up or red/down as one unit -- the point of
this panel is "how many cases moved," not an absolute count that only
means something alongside the % pill next to it. This is
Package-Trend-only (pkgTwRow() in index.html); Segment Trend keeps the
plain absolute-count row (twRow()) since it's showing this year's mix,
not movement.

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
  segment_package_trend.csv (optional)
                              Fusion "Segment / Package" export (Supplier,
                              Brand Family, Segment, Sub-Segments,
                              Package, Cases for the same two YTD
                              windows as ytd_comparison.csv, $Vol for
                              both). Feeds two panels in the page header
                              (visible on every tab), both company-wide
                              Cases YoY:
                                - Segment Trend: a dropdown starts on all
                                  9 Segments (Beer/RTD/Spirits/etc.);
                                  picking one drills into that segment's
                                  own Sub-Segments instead.
                                - Package Trend: the top 10 individual
                                  packages (raw Package column, e.g.
                                  "2/12/12oz Can") trending up and top 10
                                  trending down by Cases %, restricted to
                                  packages with real volume in both years
                                  and at least MIN_PACKAGE_VOLUME cases
                                  (500) in generate.py, so small-package
                                  noise and brand-new/discontinued
                                  packages (an undefined % swing) can't
                                  crowd out genuine trends.
                              Optional -- if this file is absent, both
                              panels are just left off the page.
  brand_package_trend.csv (optional)
                              Fusion product-level export (Supplier, Brand
                              Family, Product Name, Package, Premise, Year
                              Month, Case Equiv for the same two YTD
                              windows). One row per product/package/
                              premise/month -- each row's Case Equiv lands
                              in whichever year column matches its own
                              Year Month, so generate.py sums across all
                              months present to get each window's total.
                              Feeds the "i" trend-driver popovers added
                              2026-08-10 (a manager's suggestion): hover or
                              tap the small "i" next to each supplier's
                              name on the Supplier + Brand tab (and the
                              one next to the tab's own heading, for the
                              company-wide version) to see which brand
                              families drove that supplier's growth vs.
                              dragged it down, and which SPECIFIC package
                              (the raw Package column value as-is, e.g.
                              "1/15/19.2oz Can" -- deliberately NOT
                              bucketed into a coarse Cans/Bottles/Kegs
                              grouping, per Gavin 2026-08-10: the point is
                              to name the exact package worth pushing, not
                              a package category) grew vs. shrank. Top 3
                              brand movers and top 3 package movers each
                              direction, floored at MIN_MOVER_CE (0.5 CE)
                              so rounding dust can't show up as a
                              "driver." See parse_brand_package_trend()
                              in generate.py.
                              Optional -- if this file is absent, no "i"
                              icons render at all.
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
  4. If refreshing the header's Segment Trend / Package Trend panels, re-pull
     the Fusion segment/package export and save it over
     segment_package_trend.csv.
  5. If refreshing the Supplier + Brand tab's "i" trend-driver popovers,
     re-pull the Fusion product-level export and save it over
     brand_package_trend.csv.
  6. Run: python3 generate.py
  7. Commit and push.

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
