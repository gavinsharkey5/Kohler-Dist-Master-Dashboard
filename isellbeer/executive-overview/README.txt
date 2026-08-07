Tap Share — Executive Overview

Two tabs, same underlying data (see exec-data below) -- "Snapshot" and
"Full Detail":
  Snapshot     Default tab. Built for a non-technical, glance-and-go reader
               (per Kohler, 2026-08-07: the VP of Sales, who doesn't want to
               click around) -- one scroll, big KPI numbers, donut charts, a
               per-area scoreboard, and two auto-picked callouts ("Strongest
               Area" / "Area to Watch"), no customize panels, no dropdowns.
               Purely a condensed client-side render of the same DATA blob
               the Full Detail tab uses -- nothing here needs its own data
               or its own refresh step.
                 Fast Facts (per Kohler, 2026-08-07: "facts my manager can
                 relay to suppliers"): a card above the hero box with a
                 handful of one-line, sales-conversation-ready facts --
                 segment leader, our #1 brand and the leading competitor
                 brand core-market-wide, how many core counties we lead
                 outright, our fastest-turning top brand -- plus a "Leading
                 Brand by County" tile row (one brand + handle count per
                 core area, US and THEM combined by name so a brand that
                 appears on both sides in different accounts still shows as
                 one number, same spirit as brandLookup). Catch-all/generic
                 names (Other Supplier, blank, etc.) are excluded from every
                 fact and county tile -- a rep can't cite a brand that isn't
                 a real brand. See renderFastFacts()/topNamedBrand()/
                 topNamedBrandCombined() in index.html.
                 Top Brands pies: top 20 brands per side, every slice shown,
                 no "All Other" fold (per Kohler, 2026-08-07 -- explicit
                 override of this page's normal top-8-then-fold pattern).
                 Beyond the page's 8 fixed brand hues, slices 9-20 reuse
                 those same hues at a lighter/darker step (see brandColor()
                 in index.html) since color alone can't carry 20 distinct
                 identities -- the always-visible legend (name + %) is what
                 actually disambiguates. Legend % is share of the shown top
                 20, not the side's full total; a coverage line under each
                 chart states what fraction of the side that top 20 covers.
                 Area cards (per Kohler, 2026-08-07): each core area now
                 shows its own top 10 brands per side (from that area's full
                 allUs/allThem ranked lists, already computed for the Full
                 Detail tab's area customizer -- no generate.py change
                 needed) as two donut charts, not a text list -- hover (or
                 tap, on touch) any slice for that brand's name, handle
                 count, and % (of that side's top 10 shown, in parens: see
                 the "Interactivity" note below). %s at the county level
                 (the Us/Them split line, and every pie slice) render in
                 parens per Kohler, 2026-08-07. A handful of surveyed taps
                 across both brand sides have no Brand Family recorded in
                 the source export at all (blank, not "Other Supplier") --
                 labeled "(Brand Not Specified)" rather than shown blank or
                 dropped, same spirit as this page's other documented
                 data-quality fixes below.
                 The county cards grid (auto-fit, min 400px per card) flows
                 into multiple columns on wide screens instead of stacking
                 vertically one-per-row -- per Kohler, 2026-08-07 ("use the
                 whole page ... spread it out horizontally"). The Snapshot
                 tab's own <div class="wrap"> is widened to 1400px (Full
                 Detail stays at the page default, 840px) for the same
                 reason.
                 Segment breakdown ("Core Market by Segment", per Kohler,
                 2026-08-07): one donut, Craft / Domestic / Import / Cider &
                 Other / Unclassified, summed across allBrandsUs +
                 allBrandsThem. THIS IS A PLACEHOLDER -- Kohler has not yet
                 supplied an authoritative brand-to-segment mapping; see
                 BRAND_SEGMENTS / classifySegment() in index.html for the
                 interim heuristic (an exact-match table for this core
                 market's higher-volume brands, then a keyword fallback,
                 then a genuine "Unclassified" bucket rather than a guess).
                 classifySegment() checks `b.segment` first, so a future
                 generate.py that emits a real per-brand segment field
                 (once Kohler provides the mapping) overrides this map
                 automatically -- no index.html change needed at that point.
                 A "What's in each bucket?" toggle under the chart explains
                 each segment in plain language.
                 Interactivity: every donut on this page (top-level and
                 per-county) now supports hover-for-desktop / tap-for-touch
                 on any slice, showing brand + handle count + % in a
                 tooltip (see renderDonut()'s shared tooltip in index.html).
                 Each slice draws as two overlapping circles: a thin visible
                 ring and a much wider invisible one that actually owns the
                 hover/click handlers, so the tap target is comfortably
                 larger than the visible ring (true even on the small
                 22px-wide county mini-pies).
  Full Detail  The original page described below, unchanged -- every
               section, the brand customizers, the area customizer, the
               brand-by-area lookup, and the velocity table.
Switching tabs is pure client-side show/hide (renderSnapshot() +
CUSTOMIZERS wiring in index.html); refreshing data (see "To refresh with new
exports" below) updates both tabs at once.

Theme (per Kohler, 2026-08-07): re-skinned to match ../../MPOs/off-prem/'s
"warm barrel-wood + amber-beer + Kohler-blue" palette (see that file's own
:root comment) instead of this page's original neutral blue-black/pink UI --
:root custom properties only (--canvas/--card/--ink/--accent/--us/--them/
etc.), same component structure. --us/--them now ride that theme's green/red
status colors; --b1..--b8 (this page's own brand-pie categorical set, off-
prem has no equivalent) were re-picked and validated with the dataviz
skill's validate_palette.js against this page's new dark canvas -- all six
checks pass at the documented order. Body text is set to Calibri (falls
back to Segoe UI / system-ui where Calibri isn't installed) and every
font-size in the stylesheet was scaled up ~18% off the previous values, per
Kohler, 2026-08-07.

A phone-friendly, top-line summary of our tap-handle share vs. competitors',
built for the head of the company (not the reps -- see ../tap-survey-tracking/
for the rep-facing account-by-account drill-down; this page reads a separate
snapshot of the same kind of workbook, but does not modify or link to that
tracker's own data). The default view has no filters and no drill-down --
everything is visible on one page by scrolling, so it's easy to pull up on a
phone mid-conversation with a supplier. Two opt-in interactive pieces (below)
exist for whoever preps talking points beforehand; neither changes what the
page shows until someone actually touches them.

Shows, in order:
  1. Grand total tap handles surveyed, and our share vs. competitors' (big
     numbers, a stacked bar, and a donut chart) -- CORE MARKET ONLY (per
     Kohler, 2026-07-30: the manager isn't as concerned with areas outside
     it, so the headline numbers are scoped to match what he actually cares
     about day to day). A "Core Market" badge sits right above these numbers
     so it's never ambiguous what they cover. The company-wide total (all
     areas, including non-focus) is kept as a single reference line in the
     "Other Areas" section rather than dropped -- see companyWide in the
     generated data.
  2. Brand breakdown: top 8 brand families on each side by handle count
     within the core market (everything smaller grouped into "All Other" so
     the chart/list stays readable), each with its own donut + ranked list.
     Per Kohler, 2026-07-30: a "Customize brands shown" toggle under each
     donut opens a searchable checklist of every brand family on that side
     (see allBrandsUs/allBrandsThem in the generated data) -- check/uncheck
     up to 8 to swap which get their own slice, anything unchecked folds into
     "All Other". Capped at 8 explicit slices (a 9th checkbox just disables
     until one is unchecked) to keep the chart's colors validated and
     readable; "Reset to Top 8" restores the default. Pure client-side
     re-render, no new data needed for a different selection.
  3. Core market by area (Bergen, Sussex, Passaic, Morris 1, Morris 3): each
     area's total handles, our/their split, and the top 5 brands on each side
     in that specific area -- this is the "what's our share in your area"
     section for in-person conversations. Per Kohler, 2026-07-30: a single
     "Customize brands shown in every area" toggle above the cards opens two
     searchable checklists (Our Brands / Competitor Brands, capped at 5 each,
     same pattern as the pie customizer) -- whatever's checked replaces the
     default top-5 in EVERY area card at once (same brand set, same order,
     so you can compare one brand's numbers across areas at a glance; a
     brand absent from a given area shows 0 rather than being omitted).
     "Reset to Top 5" restores each area's own natural top 5.
  4. Look up a brand's share by area: per Kohler, 2026-07-30, a single
     dropdown (grouped "Our Brands" / "Competitor Brands", every brand family
     in the export, not just the top 8) lets you pick any one brand and see
     its handle count and % share in EVERY area, core market first then the
     others. Answers "what's our Modelo share in Sussex" for a brand that
     isn't one of the precomputed top-5 shown in section 3. Combines a
     brand's US and THEM taps together (a handful of brands, e.g. Blue Moon,
     show up on both sides at different accounts) since the point here is
     "how much of this brand is out there," not who gets credit for it -- see
     brandLookup in the generated data.
  5. Other areas (Essex, Hudson, Union, Morris 2): per Kohler, 2026-07-28/30,
     not a primary focus -- shown as a compact summary table only, no
     per-brand detail, plus the company-wide reference line mentioned above.
  6. Velocity: units sold per tap handle, for our own brand families only
     (Encompass only ever records our own sales, so this can't be computed
     for competitor brands) -- computed company-wide (not core-market-only),
     since it's a separate, clearly-labeled section -- see the "Velocity"
     note below for how this is joined and its limits. Per Kohler,
     2026-07-30: a "Customize brands shown" toggle opens a searchable
     checklist of every brand that resolved to an Encompass match (up to 99
     in this build, not just the default top 8), sorted by units/handle so
     the fastest (and slowest) movers are easy to spot even if they're a
     small brand; capped at 15 shown at once to keep the table readable.
     "Reset to Default" restores the original top-8-by-handle-count view.

Files:
  iSellBeer_TAPS_US_THEM_Audit_Matrix.xlsx
                 Same shape as ../tap-survey-tracking/'s mediator workbook --
                 see that folder's README for the full sheet-by-sheet
                 breakdown of the raw survey sheet + "iSellBeer Import
                 Template" (Corrected Distributor = the authoritative US/THEM
                 ruling). This file additionally reads the workbook's "Brand
                 Crosswalk" sheet (Report Brand Family -> Mapped Encompass
                 Brand Family) for the velocity join below.
  encompass_units_sold.csv
                 RDE "iSellBeer TAPS Exec Overview" export: Customer Num,
                 Customer Name, Area, Shipping Address, City, Date, Sales Rep
                 Name, District Manager Name, Brand, Brand Family, Supplier,
                 Units <year>. Used only for the velocity section.
  generate.py    Rebuilds the embedded data in index.html from the two files
                 above. Requires openpyxl (pip install openpyxl).
  index.html     The dashboard itself (data is embedded in the
                 <script id="exec-data"> tag).

To refresh with new exports:
  1. Re-run the tap-audit process on the new raw survey export (see the
     tap-audit skill) to produce an updated audit-matrix workbook. Save it
     over iSellBeer_TAPS_US_THEM_Audit_Matrix.xlsx, same filename.
  2. Save the new Encompass units-sold export over encompass_units_sold.csv,
     same filename/columns (the "Units <year>" header's year can shift
     between exports -- generate.py matches by column-name prefix, not the
     exact string).
  3. Run: python3 generate.py -- it prints the overall split, each core
     area's total, and how many of the top brands matched to Encompass,
     worth a sanity check against what you'd expect.
  4. Commit and push.

Distribution-area data-quality fix (per Kohler, 2026-07-30): three area
labels in the source export aren't real distribution areas, corrected here
rather than left as-is or silently dropped:
  - "Passaic-FF" is folded into "Passaic" (same area, different label).
  - "Sales" is a placeholder for rows Kohler's own process never assigned a
    real area to. Every one is reassigned here from its City, majority-vote
    against every OTHER, correctly-labeled row that shares that city; a
    handful of cities that appear nowhere else in the export fall back to
    Address-confirmed manual assignment (Old Tappan and Ridgefield, NJ ->
    Bergen; Passaic city -> Passaic area) -- all well-established NJ
    municipalities, not a judgment call.
  - "Morris 2" is left alone: it's a real area, just not one of Kohler's
    named core-market or non-focus areas, so it surfaces in its own "Other
    Areas" row rather than being folded into Morris 1 or 3.

Brand grouping (per Kohler, 2026-07-30): the raw export has 100+ distinct
brand families on each side (our brands and competitors'), far too many for
a readable pie chart or list. Both the top-line brand breakdown and each
core area's brand lists show the top N by handle count (8 for the top-line
breakdown, 5 per area) with everything else folded into "All Other" --
adjust TOP_N_BRANDS / TOP_N_AREA_BRANDS in generate.py if that should change.

Velocity (per Kohler, 2026-07-30): "map the actual velocity of the tap
handles" using the Encompass units-sold export. This only works for our own
brands -- Encompass has no record of what a competitor sold through a handle
we don't own -- and only at accounts where the export has BOTH a tap-survey
row and a matching Encompass sales record for the same customer number (in
this build, ~504 of 650 surveyed accounts, ~78%). Brand names differ between
the two systems (e.g. "Sam Adams Seasonal" vs. "Samuel Adams", "Miller Lite"
vs. "Lite", "Yuengling" vs. its supplier "Dg Yuengling Inc"), so
generate.py's resolve_encompass_key() tries, in order: (1) an exact
Brand-Family match, (2) the audit workbook's own Brand Crosswalk sheet's
mapped name as a Brand Family, (3) that same mapped name as a Supplier
match. A brand with no resolvable match (rare among the top 8, but possible)
is listed in the page's "no Encompass match" note rather than silently
dropped or shown with made-up numbers. Treat the resulting units-per-handle
figures as directional, not exact to the unit.
