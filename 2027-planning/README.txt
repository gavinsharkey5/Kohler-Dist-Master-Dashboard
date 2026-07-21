2026 Mod Year Review & 2027 Planning

Compares where each brand finished 2025 against its 2026 Brewery/Kohler
goal, projects where 2026 will land by 12/31 from YTD actuals through
7/21/2026, and gives an editable, brand-level starting point for 2027
case, revenue, and gross-profit targets.

Files:
  2026_planning_source.xlsx   The "2026 Planning by Brand" workbook --
                               source of the brand -> supplier / segment /
                               sub-segment / brand manager taxonomy and
                               each brand's 2026 Brewery & Kohler goal %.
  fy2024_fy2025_full_year.csv RDE "Comparison" export: CE / $Vol / Gross,
                               1/1/2024-12/31/2024 and 1/1/2025-12/31/2025.
  fy2025_ytd_comparable.csv   Same export, 1/1/2025-7/21/2025.
  fy2026_ytd.csv               Same export, 1/1/2026-7/21/2026.
  build_data.py                Rebuilds data/data.json from the four files
                               above. See the big comment at the top for
                               the matching/reconciliation approach (RDE's
                               hierarchical "Supplier / Brand Family" export
                               has no column marking which rows are
                               supplier subtotals vs. brand families -- the
                               workbook's grey/formula rows are used to
                               build that lookup).
  data/data.json                Output of build_data.py; the page's only
                               data source.
  index.html                   The dashboard itself. All 2027 target math
                               (price/margin per case, the editable goal %,
                               segment rollups) runs client-side in JS from
                               data.json -- editing a row's % doesn't
                               change data.json, it's a local scratch pad
                               (use the Export CSV button to keep results).

To refresh with new exports:
  1. Save the new files over 2026_planning_source.xlsx / the three CSVs
     (same filenames, same RDE "Comparison" export format -- Supplier /
     Brand Family plus Case Equiv / $Vol / Gross columns for the matching
     date windows).
  2. Run: python3 build_data.py
     It prints a reconciliation check (matched + unclassified brand sums
     vs. each file's own Total row) and lists any brands it couldn't match
     to the workbook's taxonomy -- read that output before trusting the
     refreshed dashboard.
  3. Commit and push.

Known data-quality caveats (also shown in the dashboard's own
"Data quality caveats" section):
  - ~43 brands in the RDE exports aren't yet in the 2026 Planning by Brand
    workbook (new SKUs launched after 1/8/2026). They're kept as
    "Unclassified" / tagged New so $ totals still reconcile, but have no
    2026 goal, segment, or brand manager to compare against.
  - A few brands (Lightstrike, Czechvar, Fresca Mixed) are grouped under a
    different supplier in the RDE exports than in the workbook; the
    workbook's attribution is used since that's what the 2026 goals were
    set against.
  - "Pabst Blue Ribbon" (RDE) is matched to "Pabst Brand" (workbook) via an
    explicit alias in build_data.py -- same product, different label.
