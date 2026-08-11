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

"By Supplier" and "By Brand Family" hidden (2026-08-10, per Gavin --
"they are redundant" against Supplier + Brand, which covers the same
ground in one place). Hidden via a .tab-hidden{display:none} CSS class
on those 2 tab buttons only -- everything else (their render
functions, DATA.supplierRollup/DATA.brands, the KPI tiles, the goal-%
edit machinery) is untouched and still works if navigated to directly
(e.g. someone had a bookmark) or un-hidden later; this was a
visibility change, not a feature removal. "District Manager Trends"
(also 2026-08-10) added as a new tab, last in the bar -- see its own
section below.

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

Brand-family-level "i" popovers (added 2026-08-10, per Gavin): the
same icon, now ALSO next to each individual brand family row (a
supplier's expanded children) on the Supplier + Brand tab -- per
Gavin, "just want to see the packages that have grown and declined"
at that level, so this popover skips the Brands driving growth/
Brands dragging it down sections entirely (there's nothing below
"brand family" to compare against) and shows only that brand's own
Packages growing/shrinking, same CE units and MIN_MOVER_CE floor as
the supplier-level version. insightTooltipHtml() in index.html detects
which shape it got (insight.brandGainers!==undefined) and renders the
brand-comparison sections only when present, so one function serves
both levels. Backend: generate.py's parse_brand_package_trend() now
also aggregates by_brand_pkg[supplier][brand][package] (package movers
scoped to ONE brand family, not the whole supplier) via a new
build_brand_insight() helper, returned as payload["byBrand"][supplier]
[brand] and attached to each combo_rollup child as child["insight"] in
main(), alongside the existing supplier-level attachment. 238 of 241
brand families on the tab matched a popover as of this refresh (the
handful that don't are raw-CSV-vs-workbook brand-name mismatches, same
kind of thing documented elsewhere in this file -- e.g. Kirin/Lech --
not a bug).

County "i" popover sections (added 2026-08-10, per Gavin, from an
Encompass "Comparison" export the user attached in chat -- confirmed
first that no existing file carried a location field, then confirmed
this NEW file's Total row reconciles exactly to ytd_comparison.csv's,
so it's the same underlying scope, just with City/County/Package/
Sales Rep Assigned added): a "Counties growing"/"Counties shrinking"
section, same collapsed-list-of-movers format as Packages, added to
the SAME "i" popovers brand_package_trend.csv already feeds (overall,
supplier-level, and brand-family-level) -- not a separate feature, a
3rd section on the existing tooltip. Only County is used (9 distinct
in the territory, small enough for a top-3 mover list per
TOP_COUNTY_MOVERS); City (219 distinct, also in the file) is unused
for now -- would need its own top-N-with-volume-floor treatment like
Package Trend's if ever wanted, since 219 is too many to just top-3.
See parse_brand_geography_trend() in generate.py: builds its own
overall/bySupplier/byBrand structure independently, then main() MERGES
countyGainers/countyDecliners keys directly into brand_package_trend's
already-built insight objects (requires brand_package_trend.csv to
also be present -- nothing to merge county data into otherwise) rather
than keeping geography as a parallel structure, so index.html's
insightTooltipHtml() needed only one small addition (a 3rd
hasXSections check, same pattern as hasBrandSections) instead of new
plumbing. 131 suppliers / 334 brand families got county data merged in
as of this refresh.
  CAUTION for future edits to this merge loop: it iterates
  brand_package_trend["byBrand"].items() as (supplier, <dict-of-
  brand-insights>) -- do NOT name that loop variable "brands", since
  load_workbook_taxonomy() already returns an outer "brands" dict (the
  workbook taxonomy) that's read again later in main() for the
  unbroken-out-brand relabeling logic. Reusing the name silently
  rebinds it for the rest of the function (Python has no block
  scoping), which surfaced as a bare "KeyError: 'supplier'" many lines
  away, in code that never changed -- confusing to debug blind. Fixed
  by naming it supplier_brand_insights instead.

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
statuses. The Supplier + Brand tab's own KPI row now has 3 tiles:
Company Trend (YTD), YTD Case Equiv (the raw 2025 vs. 2026 Jan-Jul CE
totals behind that %, added 2026-08-10 per Gavin), and 2026 Projected
Finish.

The widget's 4 Vs. Goal rows are clickable filters (added 2026-08-10,
per Gavin): clicking one (e.g. "Behind Both") jumps to the Supplier +
Brand tab (switchTab('combo'), from wherever you were) and filters its
rollup to just that status -- comboFilterByStatus() just sets
COMBO_FILTER.status and keeps the #comboStatusFilter dropdown in sync,
rather than being a second independent filter, so the two stay
interchangeable no matter which one you used. Clicking the same status
again clears it back to "All Statuses" (same toggle-off convention as
the rest of the page). The dropdown's own change handler now also
calls renderSuppliersWidget() so the widget's highlighted row stays in
sync if you use the dropdown instead of clicking here. Two more rows
underneath, "New Brand Families" and "Terminated Brands" (their tab's
own counts, DATA.meta.totalNoGoal/totalTerminated), aren't part of
that same status filter -- they're a different tab's dataset entirely
-- clicking one just jumps to that tab (switchTab('new') /
switchTab('terminated')). Every row's label text is wrapped in its own
.lbl-txt span with overflow:hidden/text-overflow:ellipsis (and
.trend-widget itself got overflow-x:hidden as a backstop) so a long
label truncates cleanly instead of forcing the card to scroll
horizontally -- it was doing that before this fix, once "Brand
Lifecycle" was added as a 2nd statusgrid section underneath.

Top Headlines combined KPI tile (added 2026-08-10, per Gavin): the
Supplier + Brand tab's Company Trend (YTD) / YTD Case Equiv / 2026
Projected Finish tiles are now ONE wide tile (kpi-headline, spans the
full .kpis row) instead of 3 separate ones, with an ESPN-headlines-
style plain-English summary on TOP (what grew, what didn't, and why)
and those 3 numbers as a compact stat strip underneath. Built by
overallHeadlineLines() in index.html from DATA.overallInsight -- same
brand/package top-mover data that feeds the Supplier + Brand "i"
popovers, just company-wide instead of per-supplier: the overall
Jan-Jul CE trend, the top 3 brand families driving growth, the top 3
dragging it down, and the #1 package (plus 2 runners-up) each for
growth and decline. Deliberately sourced from DATA.overallInsight (the
TRUE 131-supplier company-wide total from brand_package_trend.csv),
NOT DATA.comboGroups (the Supplier + Brand tab's own 86-supplier
subset the stat strip below still uses) -- "what happened overall"
should reflect literally everything, not just the goal-tracked subset
one tab happens to show, so the two numbers can differ very slightly
(e.g. -1.6% headline vs. -1.7% Company Trend stat) by design.

The headline package figures are in Case Equivalents (CE, valDiff from
brand_package_trend.csv). Package Trend (the header panel above the
Top Headlines tile) is ALSO CE-based as of the same day (see next
paragraph) -- the two used to disagree on units (this tile CE, that
panel Cases), which briefly showed up as the same package having two
different unit counts for a matching %; both now source from
brand_package_trend.csv's Case Equivalents, so they agree.

Package Trend switched from Cases to Case Equivalents (changed
2026-08-10, per Gavin, same request as the header/i-popover CE
push): originally sourced from segment_package_trend.csv's Cases
columns -- the one Cases-based panel on an otherwise all-CE page,
which is what caused the Top-Headlines-vs-Package-Trend unit mismatch
above. main() now OVERRIDES segment_package_trend's packageMovers
with brand_package_trend.csv's Case-Equiv version (build_package_
movers(overall_pkg, MIN_PACKAGE_VOLUME) in parse_brand_package_
trend()) whenever that file is present -- same top-10-up/top-10-down-
by-%, same MIN_PACKAGE_VOLUME=500 floor (reused as-is; 500 CE excludes
a similar-sized tail as 500 Cases did), just Case Equivalents instead
of Cases. Falls back to the original Cases-based version (unchanged)
if brand_package_trend.csv isn't present. A packageMoversUnit field
("CE" or "Cases") tells index.html which unit it's showing, so the
panel's subtitle/note text ("Top movers by CE %" / "&ge; 500 CE") stay
accurate either way. Segment Trend (the Beer/Seltzer/FMB/etc.
breakdown) stays Cases-based regardless -- brand_package_trend.csv has
no Segment/Sub-Segment column to derive it from; that would need a
re-pull of segment_package_trend.csv itself using the Case Equiv
formula (SUM(NumUnits * CaseEquiv)) instead of the Cases formula
(SUM(NumUnits / WholesaleUnitsPerCase)) it currently uses -- per
Gavin, 2026-08-10, a per-package CONVERSION file wouldn't work for
this: those two formulas pull from different per-product fields
(CaseEquiv vs. WholesaleUnitsPerCase), and a single raw Package label
can span multiple products with different values for each, so there's
no single fixed multiplier to convert existing Cases numbers into
exact CE after the fact -- only a fresh CE-formula pull gives exact
numbers.

Package Trend units-first row format (changed 2026-08-10, per Gavin,
independent of the Cases-to-CE switch above): each mover row used to
show that package's absolute CURRENT-year count next to a %-change
pill (e.g. "22,248  +644.3%"). Now shows the UNIT swing first with the
% in parens right after (e.g. "+25,074 (+644.3%)"), colored green/up
or red/down as one unit -- the point of this panel is "how much
moved," not an absolute count that only means something alongside the
% pill next to it. Package-Trend-only (pkgTwRow() in index.html,
reading the unit-agnostic valPrior/valCurrent/valDiff fields
build_package_movers() emits); Segment Trend keeps the plain
absolute-count row (twRow(), still casesPrior/casesCurrent since that
one stays Cases-based) since it's showing this year's mix, not
movement.

Suppliers Overview widget no longer scrolls (fixed 2026-08-10, per
Gavin, two passes -- see both below): its .tw-body carries a "fit"
modifier class (.tw-body.fit{max-height:none;overflow:visible})
instead of the generic 225px cap/scroll every other trend-widget panel
uses -- Suppliers Overview's content is fixed-size (2 short sections,
unlike Segment/Package Trend's variable-length top-10 lists), so it
should just always fit rather than fight over a magic max-height
number.

First pass added overflow-x:hidden to .trend-widget itself and to the
base .tw-body rule, and set .tw-body.fit's overflow-y (only) to
visible. Verified clean in this session's own headless-browser testing
at the time -- but Gavin's own browser still showed a scrollbar, and
re-testing found why: CSS's overflow-x/overflow-y are a linked pair --
per spec, if ONE axis is "hidden"/"scroll"/"auto" and the OTHER is
still "visible", the visible one gets silently recomputed to "auto"
(never actually visible) UNLESS both axes agree. .trend-widget's own
overflow-x:hidden was therefore forcing ITS OWN overflow-y to compute
as auto (not the "visible" the CSS block seemed to promise), and
.tw-body.fit's inherited overflow-x:hidden (from the base .tw-body
rule) was doing the same to its explicit overflow-y:visible --
turning it into overflow-y:auto too, right back into a scrollbar the
instant content was a pixel taller than the box in Gavin's actual
render (this session's own test render happened to land exactly at
the boundary, scrollHeight===clientHeight, so it looked fixed here
even though the underlying computed style was already wrong -- lesson
for next time: check computed overflow-y via getComputedStyle, not
just scrollHeight vs. clientHeight, since "auto with no visible
overflow yet" and "true visible" render identically until content
grows by one pixel).

Second-pass fix: removed overflow-x:hidden from .trend-widget
entirely (not needed there -- .tw-body's own rule already handles
Segment/Package Trend's horizontal clipping, and .fit's inner rows are
already ellipsis-truncated so they can't overflow it either), and
changed .tw-body.fit to set BOTH axes to visible explicitly
(overflow:visible, not just overflow-y) so neither axis is "hidden"
and the auto-recompute rule never triggers. Confirmed via
getComputedStyle in this session that suppliersWidget and its .tw-body
both now report overflow-x/overflow-y as literally "visible" (not
"auto"), while packageWidget's .tw-body still correctly reports
"hidden"/"auto" with its 225px cap intact.

Top Headlines expanded to 7 lines (2026-08-10, per Gavin's "I want
more headlines" ask) -- 2 new sentences plus more names in the
existing ones:
  - TOP_BRAND_MOVERS and TOP_PACKAGE_MOVERS both bumped 3 -> 4 in
    generate.py, so the growth-drivers/declines/package-movers
    sentences each name one more brand or package (also widens the
    Supplier + Brand "i" popovers by one row each, same constants).
  - New "By premise" sentence: On-Premise vs. Off-Premise CE trend %,
    from this file's own Premise column (On Premise / Off Premise) --
    a dimension brand_package_trend.csv already carried but nothing
    used yet. See premise_row()/premise_split in
    parse_brand_package_trend(), payload["premiseSplit"].
  - New "Among suppliers with real volume..." sentence: the single
    best- and worst-trending supplier by TREND %, not raw CE (so a
    huge supplier's small % move can't automatically beat a small
    supplier's big %, and vice versa) -- computed client-side in
    overallHeadlineLines() from DATA.comboGroups (the Supplier + Brand
    tab's own dataset, not DATA.overallInsight, since supplier-level
    trend % already lives there and doesn't need re-deriving). Floored
    at MIN_SUPPLIER_CE (5,000 CE prior-year) in index.html so a
    near-zero-volume supplier's noisy swing (e.g. 55 -> 743 CE reads
    as +1250%) can't win this headline -- checked empirically before
    picking that number: unfloored, the top mover was a supplier with
    55 CE prior-year; at a 5,000 CE floor, 31 suppliers qualify and the
    range (Garage Beer +73.4% best, Artisanal Imports -36.1% worst as
    of this refresh) reads as real supplier-level performance, not
    noise.

District Manager Trends tab (added 2026-08-10, per Gavin, from an
Encompass "Comparison" export the user attached in chat: District
Manager, Sales Rep Assigned, Brand Family, Package, Product Type,
On-Off Premise, Case Equiv for the same two YTD windows -- Total row
again reconciles exactly to ytd_comparison.csv's own): an entirely
different org axis from the rest of this page -- District Manager ->
Sales Rep, not Supplier -> Brand -- so it's its own tab rather than
folded into an existing one. Same collapsed-parent/expandable-children
UI as the Supplier + Brand tab (click a district row or its chevron to
expand/collapse; search force-expands matches; Expand All/Collapse
All; click a '26 YTD CE cell to select it, same running-sum bar at the
page bottom), but with NO goal-% columns or editing -- there's no
rep-level goal data on hand, so this tab is pure Jan 1 - Jul 31 CE
trend, nothing to compare it against. 5 real districts (Mike Engel,
Denise Montes, Paul Deady, Chris McCrohan, Mike Kennedy), 30 reps
total across them.

A "None" District Manager / "Default" rep combination in the raw
export (1,881 -> 3,255 CE as of the export this was built from, a
+73% swing off a near-zero base) is a catch-all bucket, not a real
district -- excluded entirely (DM_EXCLUDE_NAMES/REP_EXCLUDE_NAMES in
generate.py) rather than shown as a misleading "Unassigned" row, same
treatment Buzbee's Beverages USA LLC gets on the Supplier + Brand tab.
Two Product Types, "Finance Charges" and "HH Finance Charges", carry
$0 CE in every row of the export this was built from (accounting
adjustments, not real volume) -- excluded from product-type
aggregation specifically (PRODUCT_TYPE_EXCLUDE), though the effect on
totals is nil either way since they're already zero.

Each district's (and each rep's) "i" popover covers 4 things, more
than the Supplier + Brand tab's popovers since this file carries more
dimensions: top brand families driving growth/decline, top Product
Types (Case Beer / Keg Beer / Liquor / Wine / Cider / Cocktails / etc.
-- a genuinely new axis this page didn't have before) growing/
shrinking, the On/Off-Premise CE split (2 stat lines, not a mover
list, since there are only ever 2 buckets -- see premiseSplitHtml() in
index.html), and -- ONLY if brand_geography_trend.csv is also present
-- top Counties growing/shrinking, joined by Sales Rep Assigned name
(100% overlap between the two files' 31 rep names confirmed before
relying on this join; see parse_brand_geography_trend()'s byRepCounty
output, built in the SAME pass that already produces its by-supplier/
by-brand county data for the Supplier + Brand tab, not a second file
read). insightTooltipHtml() in index.html was generalized to render
each of its now-5 possible sections (Brands, Product Types, Packages,
Counties, Premise) independently based on which fields are actually
present on a given insight object, since different tabs' insight
shapes now carry different subsets -- see the comment directly above
that function for the full field-presence matrix.

Asked at the time whether other data would "fortify" this tab further
-- worth revisiting if pursued:
  - Rep-level goals/quotas: none exist today (workbook goals are
    brand-level only), so reps can only be compared against LAST
    YEAR's own volume here, not a target.
  - Rep tenure/start date: would explain a big trend swing as "new rep
    ramping up" rather than a real performance signal.
  - Target Accounts / distribution-gap data per rep (the pattern the
    off-prem/on-prem MPO dashboards already use) -- would turn this
    from a pure retrospective into an actionable "here's what to sell
    next" view too.
  - Call/visit activity data (iSellBeer) -- ties trend results to
    activity level, not just outcome.
Not pursued without that data on hand; documented here so the next
person doesn't have to rediscover the idea.

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
                              (visible on every tab), company-wide:
                                - Segment Trend: a dropdown starts on all
                                  9 Segments (Beer/RTD/Spirits/etc.);
                                  picking one drills into that segment's
                                  own Sub-Segments instead. Always Cases
                                  -- this file is the only source for
                                  Segment/Sub-Segment classification.
                                - Package Trend: the top 10 individual
                                  packages (raw Package column, e.g.
                                  "2/12/12oz Can") trending up and top 10
                                  trending down by %, restricted to
                                  packages with real volume in both years
                                  and at least MIN_PACKAGE_VOLUME (500)
                                  of whichever unit it's ranked in, so
                                  small-package noise and brand-new/
                                  discontinued packages (an undefined %
                                  swing) can't crowd out genuine trends.
                                  This file's OWN Cases figures are used
                                  here only as a FALLBACK -- see
                                  brand_package_trend.csv below, which
                                  overrides Package Trend with Case
                                  Equivalents whenever it's present
                                  (added 2026-08-10, per Gavin -- CE is
                                  this whole page's native unit).
                              Optional -- if this file is absent, both
                              panels are just left off the page (Package
                              Trend still needs THIS file even when CE-
                              overridden, since Segment Trend needs it
                              regardless and both panels are gated on it
                              together in index.html).
  brand_package_trend.csv (optional)
                              Fusion product-level export (Supplier, Brand
                              Family, Product Name, Package, Premise, Year
                              Month, Case Equiv for the same two YTD
                              windows). One row per product/package/
                              premise/month -- each row's Case Equiv lands
                              in whichever year column matches its own
                              Year Month, so generate.py sums across all
                              months present to get each window's total.
                              Feeds:
                                - The "i" trend-driver popovers added
                                  2026-08-10 (a manager's suggestion):
                                  hover or tap the small "i" next to each
                                  supplier's name on the Supplier + Brand
                                  tab (and the one next to the tab's own
                                  heading, for the company-wide version)
                                  to see which brand families drove that
                                  supplier's growth vs. dragged it down,
                                  and which SPECIFIC package (the raw
                                  Package column value as-is, e.g.
                                  "1/15/19.2oz Can" -- deliberately NOT
                                  bucketed into a coarse Cans/Bottles/Kegs
                                  grouping, per Gavin 2026-08-10: the
                                  point is to name the exact package
                                  worth pushing, not a category) grew vs.
                                  shrank. Top 4 brand movers and top 4
                                  package movers each direction (was 3;
                                  bumped 2026-08-10 for more Top
                                  Headlines detail -- TOP_BRAND_MOVERS/
                                  TOP_PACKAGE_MOVERS in generate.py),
                                  floored at MIN_MOVER_CE (0.5 CE) so
                                  rounding dust can't show up as a
                                  "driver." Same icon also sits next to
                                  each individual brand family row
                                  (also 2026-08-10) -- Packages only
                                  there, no brand-comparison section,
                                  since there's nothing below "brand
                                  family" to compare against.
                                - The Top Headlines KPI tile (also
                                  2026-08-10) on the Supplier + Brand tab
                                  -- same company-wide brand/package
                                  mover data as the "i" popovers, written
                                  as plain-English sentences. Also uses
                                  this file's Premise column (On Premise/
                                  Off Premise CE trend, payload
                                  ["premiseSplit"]) for one headline
                                  sentence, and DATA.comboGroups (not
                                  this file) for a best-/worst-trending-
                                  supplier sentence.
                                - Package Trend's CE override (also
                                  2026-08-10) -- see segment_package_
                                  trend.csv above; this file's own
                                  Package-level totals replace that
                                  file's Cases-based ones whenever both
                                  are present.
                              See parse_brand_package_trend() in
                              generate.py.
                              Optional -- if this file is absent, no "i"
                              icons or Top Headlines render, and Package
                              Trend falls back to Cases from
                              segment_package_trend.csv.
  brand_geography_trend.csv (optional)
                              Encompass "Comparison" export (Brand
                              Family, Supplier, Package, City, County,
                              Sales Rep Assigned, Case Equiv for the same
                              two YTD windows -- reconciles exactly to
                              ytd_comparison.csv's own Total row). Adds a
                              "Counties growing/shrinking" section
                              (added 2026-08-10, per Gavin) to the SAME
                              "i" popovers brand_package_trend.csv feeds
                              -- overall, supplier-level, and brand-
                              family-level alike -- rather than being its
                              own separate feature. Only County is used
                              (9 distinct, small enough for a top-3 mover
                              list); City (219 distinct) is in the file
                              but unused for now. See
                              parse_brand_geography_trend() in
                              generate.py -- merges countyGainers/
                              countyDecliners keys directly into
                              brand_package_trend's already-built insight
                              objects in main().
                              Requires brand_package_trend.csv to also be
                              present (nothing to merge county data into
                              otherwise); optional -- if this file is
                              absent, the existing "i" popovers just
                              don't get a Counties section. Also feeds
                              byRepCounty (Sales Rep Assigned -> County
                              totals, same single pass) for the District
                              Manager Trends tab's own Counties sections
                              -- see that file's entry below.
  district_manager_trend.csv (optional)
                              Encompass "Comparison" export (District
                              Manager, Sales Rep Assigned, Brand Family,
                              Package, Product Type, On-Off Premise,
                              Case Equiv for the same two YTD windows --
                              reconciles exactly to ytd_comparison.csv's
                              own Total row). Powers the whole "District
                              Manager Trends" tab (added 2026-08-10, per
                              Gavin) -- the District Manager -> Sales Rep
                              rollup table, its KPI/Top-Headlines tile,
                              and the "i" popovers' Brands/Product Types/
                              Premise sections at both the district and
                              rep level (Counties too, if
                              brand_geography_trend.csv is ALSO present --
                              joined by Sales Rep Assigned name). See
                              parse_district_manager_trend() and
                              build_dm_level_insight() in generate.py.
                              A "None" District Manager / "Default" rep
                              combination in the raw export (a tiny
                              catch-all bucket, not a real district) is
                              excluded entirely -- see
                              DM_EXCLUDE_NAMES/REP_EXCLUDE_NAMES. Two
                              Product Types, "Finance Charges" and "HH
                              Finance Charges" ($0 CE in every row of the
                              export this was built from), are excluded
                              from product-type aggregation specifically
                              -- see PRODUCT_TYPE_EXCLUDE.
                              Optional -- if this file is absent, the
                              District Manager Trends tab shows no data
                              (DATA.dmTrend is null; the tab and its
                              controls still render, just empty).
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
  6. If refreshing the "i" popovers' Counties section, re-pull the
     Encompass "Comparison" export and save it over
     brand_geography_trend.csv.
  7. If refreshing the District Manager Trends tab, re-pull the
     Encompass "Comparison" export (District Manager / Sales Rep
     Assigned / Brand Family / Package / Product Type / On-Off Premise)
     and save it over district_manager_trend.csv.
  8. Run: python3 generate.py
  9. Commit and push.

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
  - "Ask the Data" (added 2026-08-11, per Gavin): the small chat panel
    next to Top Headlines on the Supplier + Brand tab. It is NOT a
    real AI/LLM -- this is a static GitHub Pages site with no backend,
    so an embedded API key would be publicly visible in page source.
    It's pure client-side JS (buildQAIndex()/answerQuestion() and
    friends in index.html) that matches the longest entity name it
    finds in your question (brand, supplier, district manager, rep,
    package, county, or product type) against DATA already loaded for
    this page, then formats an answer from that record's own fields --
    same fmtCE/fmtPct/insight machinery the Top Headlines tile and "i"
    popovers already use. A handful of general keyword questions
    (best/worst district, packages growing/shrinking, brands behind
    goal, new/terminated brand counts, premise split) are tried when
    no entity name matches. No generate.py changes needed -- it reads
    whatever's already in data/data.json, so it refreshes for free
    every time the rest of the page does. Since it's plain substring
    matching, a question has to contain a full entity name to match
    (e.g. "Modelo Especial" works, bare "Modelo" doesn't since there
    are 5 different Modelo brands and no way to guess which one); the
    fallback message points users at a chip example when nothing matches.
  - "Food & Bev Enterprise LLC" displays as "Columbian Roots" on the
    dashboard (per Gavin, 2026-08-11) -- FOOD_BEV_DISPLAY_NAME in
    generate.py, applied as the very last step before writing
    data.json so the underlying FOOD_BEV_SUPPLIER match against RDE's
    raw export name (ytd_comparison.csv, denise_food_bev_product_detail.csv)
    is unaffected. This supplier has no grey header row in
    2026_planning_source.xlsx at all, so its supplier-level 2025
    Finish is a manual override (ORPHAN_SUPPLIER_FINISH_2025_OVERRIDES
    in generate.py, currently 5,470 CE per Gavin) rather than sourced
    from the workbook -- update that constant if the real number
    changes. Any other orphan supplier without a grey row (e.g.
    Sazerac Inc) falls back to summing its own children's individual
    2025 Finish figures instead.
  - Vinaio Imports LTD's supplier-level 2026 Brewery/Kohler Goal % (row
    234 in 2026_planning_source.xlsx, columns K/N) was hand-set to a
    static 10%/10% (per Gavin, 2026-08-11), overwriting the formulas
    that used to derive it from Goal CE / 2025 Finish. Edited via
    direct XML surgery on the .xlsx's zip contents (xl/worksheets/
    sheet1.xml + xl/calcChain.xml) rather than a full openpyxl
    load+save round-trip -- openpyxl doesn't preserve OTHER cells'
    cached formula results on save (it only ever writes the formula
    string, not Excel's last-computed value), so a full re-save wipes
    out cached values workbook-wide until the file is next opened and
    recalculated in real Excel. If this row's goal ever needs to
    change again, edit the same two cells the same way (or open in
    real Excel, edit, and save -- that recalculates everything
    correctly and is the safer option for a broader edit).
  - "What-if" Goal % edits now persist across reloads via localStorage
    (added 2026-08-11, per Gavin), on the By Brand Family, By Supplier,
    and Supplier + Brand tabs -- previously pure in-memory scratch that
    vanished on refresh. Still NOT the real goal data (that's the
    workbook, see above); this is a personal what-if scratchpad that
    now happens to survive a reload/browser restart, in that one
    browser only. Keyed by supplier/brand NAME (goalEditStoreKey() in
    index.html), not the table's own _key (which embeds an array index
    that can shift between data refreshes), so a saved edit still finds
    its row after the next month's data reload. Each tab's own "Reset
    edited goals" button clears both the in-memory edit and its
    localStorage entries, same as before, and now also shows a small
    "N what-if edits saved in this browser" badge next to the button
    when any are active.
  - SUPPLIER_MANAGER_OVERRIDES in generate.py assigns Jason Koo as
    Brand Manager for Ever Grand Group LLC and Sazerac Inc (per Gavin,
    2026-08-11) -- neither has a manager in the workbook itself (blank
    grey-row/brand-row manager column), so this fills the gap wherever
    that manager would otherwise show up blank: New Brand Families
    (Snow Beer, under Ever Grand Group LLC), By Brand Family (Fresca
    Mixed, under Sazerac Inc), By Supplier, and Supplier + Brand.
