Tap Share — Executive Overview

ONE page now (2026-08-19, per Gavin: "Delete full detail tab. Bring in
the volume portion to the snapshot"): the Full Detail tab is DELETED --
its markup, its tab bar, and its JS (segment battleground, account
control, shared brands, brand/area customizers, brand lookup, other
areas) are all removed from index.html, not hidden. The one piece that
survived is the VOLUME section -- "Velocity: Units Sold Per Tap Handle"
(velocity note + Hidden Gems/Workhorses/Watch List quadrant cards +
customizable table), moved to the bottom of the Snapshot page (capped at
900px wide inside Snapshot's 1400px wrap so the table stays readable),
along with the Data & methodology notes block. generate.py still emits
the full DATA blob unchanged -- the removed sections' data
(accountAnalysis, sharedBrands, etc.) is simply unused now, so
resurrecting any of them later is a render-code job, not a data job.
The section descriptions below are kept for that history.

The page previously had two tabs, same underlying data (see exec-data
below) -- "Snapshot" and "Full Detail":
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
                 allBrandsThem. As of 2026-08-17 this is majority REAL
                 data: generate.py emits a per-brand `segment` field
                 resolved from the workbook's own segment sheets (see the
                 Full Detail tab's Segment Battleground entry above for the
                 mechanics), and classifySegment() prefers that field --
                 exactly the forward-compatible hook this section was built
                 with. Brands with no emitted segment (style-only workbook
                 labels, or no segment row at all) still fall back to
                 BRAND_SEGMENTS / classifySegment()'s heuristic in
                 index.html, so keep those maps -- they still cover just
                 under half the handles.
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
  Full Detail  The in-depth analysis tab (reworked 2026-08-17, per Gavin:
               "I want the full detail tab to do more in depth analysis" --
               Snapshot stays the glance-and-go scope view, Full Detail is
               where the analysis lives). Keeps every original section (the
               brand customizers, the area customizer, the brand-by-area
               lookup, the velocity table) and adds four analysis sections:
                 Segment Battleground   Us-vs-them split bars per segment
                   (Craft/Domestic/Import/Cider & Other/Unclassified) with
                   each side's #1 brand in that segment. Segments are REAL
                   workbook data now where cleanly mappable: generate.py
                   ports ../tap-survey-tracking/'s build_segment_resolver()
                   (Encompass Sub-Segment first, then iSell's survey tag)
                   and emits a per-brand `segment` field whenever a brand
                   family's tap-weighted majority segment maps onto a tier
                   bucket (SEGMENT_NORMALIZE in generate.py) with a >=60%
                   majority -- ~54% of core handles in the 8.17 build.
                   Style-shaped workbook values ("Wheat Beer", "Pilsner And
                   Pale Lager") are deliberately NOT mapped (a style says
                   nothing reliable about tier), so those brands keep using
                   index.html's brand-name heuristic, which classifySegment()
                   was already built to fall back to. This also silently
                   upgraded the Snapshot tab's segment donut -- its note text
                   was updated accordingly, nothing else on Snapshot changed.
                   The Unclassified row shows the split but no #1 brands
                   (it's almost entirely "Other Supplier" rows).
                 Account Control   Every core-market account with recorded
                   handles, banded by our share of its tap wall (Fully ours /
                   We lead / Contested 40-59% / They lead / Fully theirs) as
                   a diverging stacked bar (band palette validated with the
                   dataviz skill's validator -- CVD, normal-vision, and
                   contrast checks pass; the categorical lightness/chroma
                   checks don't apply to a diverging ramp), plus a
                   concentration line (top-10/25/50 accounts' share of
                   handles). Then two tables from generate.py's
                   accountAnalysis: Biggest Flip Targets (top 20 accounts by
                   competitor handles, with what they pour there -- "Other
                   Supplier" deliberately kept, it's real unidentified
                   competitor handles) and Our Anchor Accounts (accounts we
                   control at 60%+, ranked by our handles at stake; generic
                   labels dropped from its brand list since "our biggest
                   brands" citing "Other Brand Family" says nothing).
                 Brands Pouring on Both Sides   sharedBrands in the
                   generated data: brand families with >=2 handles through
                   us AND >=2 through a competing distributor in the core
                   market (e.g. Dos Equis, Lagunitas), with account counts
                   and where the competitor's handles pour. Framed as share
                   that needs no new-brand authorization to win back.
                 Velocity quadrants   Three cards above the velocity table
                   (Hidden Gems / Workhorses / Watch List), splitting brands
                   with 5+ matched handles at the median handle count and
                   median units-per-handle. Computed client-side from the
                   existing velocity data, with one generate.py addition:
                   each velocity brand now carries its resolved Encompass
                   pool as `encKey`, and the quadrants keep only the most-
                   surveyed alias per pool -- without that, a split alias
                   ("Yuengling Brewery", 9 taps) inherits the whole pool's
                   units against its own few taps and tops every ranking
                   with a fake ~290 units/handle. The raw velocity table
                   still shows every alias row, unchanged.
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

Current lineup only (added 2026-09-04): every number on this page counts
each account's MOST RECENT survey pass only. A survey submission is one
(Account # + Date/Time) pair; through 8.27.26 each account had exactly one,
so summing every row was the same thing as the current tap wall. The 9.4.26
workbook is the first with repeat passes -- 70 accounts with two, one with
three -- and summing them all counted a brand once per pass and kept
pouring brands that had since come off. The filter sits immediately after
the record loop in generate.py, above every total, split, area card,
velocity join and flip-target list, rather than in each of them. Core
market went 5,971 -> 5,525 taps; the split barely moved (51.4% / 48.6%),
and the 718-account book is unchanged. An assert refuses to build if any
account still carries more than one pass.
  ../tap-survey-tracking/generate.py got the same filter the same day --
  it joins the same two sheets of the same workbook and had the identical
  double-count -- plus a per-account Survey history section, which is where
  the superseded passes are viewable. This page keeps none: it's the
  one-scroll executive view, and a "what changed at this account" panel
  belongs on the rep drill-down. Read that folder's README ("Current
  lineup only" / "Survey history") for the full reasoning, including why
  the "iSellBeer Import Template" sheet is NOT a shortcut to the latest
  pass despite looking like one in the 9.4 delivery.

Supplier policy override (confirmed with the user 2026-08-12): the 8.12.26
source file added an "Unverified Brands" sheet ruling that taps from
suppliers marked "(In-House)", Other Half, Industrial Arts, and Pabst count
as US -- reflected in the raw survey sheet's own Distributor column
(green-highlighted at the source) but not yet in the Import Template's
Corrected Distributor formula, which still defaults them to THEM under the
older "No Encompass Match" rule. generate.py special-cases exactly these
four supplier keywords (SUPPLIER_STATUS_OVERRIDE_KEYWORDS, resolve_status(),
same rule as ../tap-survey-tracking/generate.py) to trust the raw sheet's
Distributor over Corrected Distributor for just those rows. Shifted the
core-market split from 49.2%/48.6% to 50.1%/47.7% (US now over 50%). If a
future export's Import Template formula catches up to this ruling, the
override becomes a no-op automatically; only revisit it if a future export
disagrees with this policy for these suppliers.

Corrected Distributor fill-down gap (found 2026-08-12, still present as of
the second 8.12.26 export): the newest ~116 rows in the Import Template
never got the Corrected Distributor (column Y) formula dragged down to
cover them -- the cells are blank, not miscalculated. generate.py's
fill_corrected() replicates the exact formula those blank cells would
contain -- trusts Expected Distributor (column W) when it's a real US/THEM
verdict, else falls back to the Import Template's own pre-audit Distributor
column (same fallback the formula itself uses) -- same rule as
../tap-survey-tracking/generate.py. This is arithmetic, not a judgment
call: every input it reads is already present and calculated in the source
file. Shifted the core-market split again, from 50.1%/47.7% to 51.6%/48.4%.
Once a future export actually fills column Y down, this is a no-op. The
underlying spreadsheet gap should still get fixed at the source -- see the
fix steps given to the user 2026-08-12 (fill Y5001:Y5116 down from Y5000's
formula, or the equivalent range in a future export).

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
