6-Month Review — Brand Trend vs. Goal

For every brand family, compares its current year-over-year trend
(Case Equivalents, same comparable date range both years, e.g.
1/1-7/28) against its 2026 Brewery Goal % and Kohler Goal % from the
planning workbook -- so brand managers can see at a glance who's
ahead of, on, or behind pace, and recalibrate for the back half of
the year. Rows are color-coded (red = behind goal, green = ahead/on
pace). Brewery-goal columns are amber, Kohler-goal columns are blue.

Shows both years' comparable-YTD case volumes plus a 2026 Projected
Finish (this year's YTD case count + the 2025 remainder-of-year grown
at this year's YTD trend rate -- same method as ../2027-planning/).
Each brand's Brewery Goal % and Kohler Goal % is editable right in the
table -- typing a new value recalculates that track's Goal CE and Gap
live (and the KPI tiles above), so a manager can test "what if we
recalibrated this brand's goal" without touching the workbook. Edits
are local to the browser only (not saved back); "Reset edited goals"
reverts everything to the workbook's original values.

A second tab, "New in 2026", lists brands with zero prior-year sales
(regardless of whether a goal exists for them in the workbook -- per
Kohler, 2026-07-28, a handful of brands do have a goal % on file
despite zero 2025 volume, e.g. Viva Tequila Seltzer, Pop Sips,
Newcastle; those move here too since there's no real prior-year
baseline to measure a trend against). Almost always brand-new
launches (e.g. Carbliss, Monaco, Noca) the plan was built before they
existed.

Shipyard, Jersey Girl, Soda Birch, and Whole Hog are excluded from the
dashboard entirely (per Kohler, 2026-07-28) -- negative/near-zero
credit-adjustment entries in the RDE export, not real placements. See
EXCLUDED_BRANDS in generate.py.

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
  generate.py                 Rebuilds data/data.json from the two
                              files above.
  index.html                  The page itself.

To refresh (e.g. at each month-end check-in):
  1. Re-pull the Encompass report (same QuickLink Gavin was given) for
     the new date range, save it over ytd_comparison.csv (same
     filename, same columns).
  2. If the goals themselves changed, save the updated workbook over
     2026_planning_source.xlsx.
  3. Run: python3 generate.py
  4. Commit and push.

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
