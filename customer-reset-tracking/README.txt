Customer Reset Tracking — Does a Reset Lift Sales?

Evaluates whether Kohler's off-premise shelf/cooler resets (the "SFS"
program) actually increase sales, using each account's own reset date as
the anchor. Two cohorts, evaluated and shown separately (a tab switcher at
the top of the page): the 2026 resets (the main focus, and the default tab)
and the 2025 resets. Each is its own roster + sales export + methodology
run -- they aren't blended together.

Methodology (v3, 2026-08-10 -- see "v2 -> v3" below for what changed):
  - Sales inputs are monthly account totals (Customer Num x Year Month x
    Cases), not a dated transaction ledger, so windows are whole calendar
    months, not a rolling day count from the exact reset date.
  - Two different 3-month comparisons are shown side by side per account,
    not just one:
      - Year-over-year (pre3/post3/lift3): the reset's own month plus the
        following two calendar months (e.g. a March reset -> March+April+
        May), vs. that exact same 3-month window one year earlier.
        Controls for normal seasonal variation.
      - Before -> after, same year (preAdj/liftAdj): the 3 calendar months
        immediately before the reset's month, vs. the same "after" window
        above (reset month + next two), both within the same year. Shows
        the immediate change around the reset, but does NOT control for
        seasonality -- read it alongside the year-over-year number, not
        instead of it. In this data it runs much higher than the YoY
        number in both cohorts (2026: +37.9% vs. +0.6%; 2025: +48.4% vs.
        -3.8%), which is itself informative: most of that gap is likely
        normal seasonal lift (resets cluster earlier in the year, and
        cases/demand generally climb through spring into summer), not the
        reset's own effect -- exactly why both numbers are shown rather
        than just one.
  - YTD window: January through the latest fully-elapsed calendar month
    present in that cohort's sales file (today's real in-progress month,
    if the file happens to include it, is dropped so a half-finished month
    doesn't understate YTD), vs. the same January-through-that-month range
    one year earlier. For the 2025 cohort (a complete calendar year) this
    is effectively full-year 2024 vs. 2025.
  - Lift % = (post total - pre total) / pre total, on Cases -- the only
    metric in these exports (no $ Volume / Gross Profit, unlike v1's daily
    ledger). A non-positive baseline (zero, or -- at a couple of small
    accounts -- net-negative, where returns/credits outweighed purchases in
    that window) has no meaningful "% growth" reading: shown as "No
    baseline" rather than an invented, infinite, or sign-flipped number.
  - A "Misc" Brand Family bucket in BOTH source exports (~30% of raw case
    volume in each) is removed entirely from the sales data before any
    total is computed -- see "Data quality: the 'Misc' bucket" below.
  - First-time vs. repeat reset tracking has been REMOVED (was in v1/v2) --
    see "v2 -> v3" below.

Data quality: the "Misc" bucket (found 2026-08-07, load_monthly_sales() in
generate.py) -- both sales_2026.csv and sales_2025.csv carry rows with
Brand Family "Misc" (Supplier is always "Misc" too on those rows
specifically -- checked, never a real supplier paired with a "Misc" brand
family or the reverse). These rows are opaque -- not tied to any specific
brand, so not tied to anything a shelf/cooler reset actually touches -- and
wildly lumpy per account/month: single rows worth tens of thousands of
cases at ONE account in ONE month, then nothing for that account for
months at a stretch. In aggregate they're ~30% of total raw case volume in
BOTH files (751,153 of ~2.41M cases in sales_2026.csv; 838,959 of ~3.05M in
sales_2025.csv) -- not a fringe artifact. Before they were removed, an
early build of this methodology showed blended lifts in the tens to
hundreds of percent (one account: +983.6%, driven by a single ~38,200-case
"Misc" row landing inside its post-reset window) that had nothing to do
with resets -- purely which accounts happened to have a "Misc" spike land
inside their evaluation window. With it removed, the numbers land close to
v1's independently-built, differently-sourced result (see below) -- a
consistency check that this exclusion was the right call. Re-running
generate.py prints the removed total per file so this stays visible on
every refresh.

v2 -> v3 (2026-08-10): three changes at Kohler's request --
  1. First-time-vs-repeat tracking (its own dashboard section, plus the
     account table's "Type" column/filter) has been removed entirely --
     the dashboard was doing too much. generate.py no longer reads
     reset_history_2024.xlsx / reset_history_2025.xlsx at all (kept on
     disk for provenance, just unused).
  2. Added the "before -> after, same year" 3-month comparison (preAdj/
     liftAdj/cases3Adj) alongside the existing year-over-year one -- see
     methodology above.
  3. The "Misc" data-quality notice banner is kept (per Kohler request, so
     it's visible on every load that this data doesn't include Misc), but
     its wording changed from "excluded from every number" to "removed
     entirely" to be unambiguous that it's gone, not just downweighted.
  2026 is now called out as the main-focus cohort in the page copy (it was
  already the default/first tab).

v1 -> v2 (2026-08-07): v1 covered only the 2026 cohort's Jan/Feb/Mar
sub-set (38 of 73 accounts) from a daily transaction ledger (Case
Equivalent / $ Volume / Gross Profit, 90-day windows). Kohler then supplied
a full 2026 roster + a consolidated monthly sales export covering all 73
accounts, AND a full 2025 roster + its own monthly sales export -- both
new exports are Cases-only and monthly-grain, not daily, which is why the
methodology moved to calendar-month windows (see above) instead of v1's
exact 90-day span. v1's own blended number (+0.2%, all 38 accounts) is
close to v2/v3's 2026-cohort year-over-year number below despite the
completely different data source, window definition, and metric -- read
that agreement as corroboration, not a coincidence to wave away.

Key findings so far (v3, 2026-08-10):
  2026 cohort (73 of 73 accounts evaluated) -- MAIN FOCUS:
    - Blended 3-month Cases lift (year-over-year): +0.6% (33 up / 38 down /
      2 no baseline).
    - Blended 3-month Cases lift (before -> after, same year): +37.9% --
      see the seasonality caveat above; not directly comparable to the
      year-over-year number.
    - YTD (Jan-Jul 2026 vs. Jan-Jul 2025): +0.6% blended.
  2025 cohort (69 of 69 accounts evaluated):
    - Blended 3-month Cases lift (year-over-year): -3.8% (20 up / 45 down /
      4 no baseline).
    - Blended 3-month Cases lift (before -> after, same year): +48.4% --
      same seasonality caveat as above.
    - YTD (Jan-Dec 2025 vs. Jan-Dec 2024, i.e. full calendar year): -3.3%
      blended.
  - The 2024/2025 program-year workbooks' own methodology (YoY anchored to
    reset date, plus a non-reset control-store baseline) found reset
    stores performed roughly in line with a control group's own decline --
    i.e. resets may not be beating "doing nothing." Still no 2026 or 2025
    control-store pull to check that directly here (see "Still open").

Still open / not yet in v3:
  - A non-reset "control" account sales pull for both 2026 and 2025, so
    the control comparison can be verified directly rather than relying on
    the prior program's own summary number.
  - Confirmation of what Segmentation A/B/C actually measures (assumed to
    be a volume tier, not confirmed) -- carried through and shown as a
    grouping in the dashboard, not treated as an endorsed metric.
  - What's actually inside the "Misc" bucket -- it's removed outright now,
    not held as an open question the way it was in v2.
  - The Constellation Brands in-store benchmark used in the 2024/2025
    program-year workbooks isn't in either of these monthly exports --
    not included here.

Files:
  reset_accounts_2026.xlsx  2026 reset roster -- Kohler Account #, TD Linx
                             #, Account Name, Address, City, State, Zip,
                             Segmentation (A/B/C), Reset Date. 73 accounts,
                             1/2-5/7/2026. Join key: Kohler Account # (==
                             sales_2026.csv's Customer Num).
  sales_2026.csv             RDE export: Customer Num, Customer Name,
                              Supplier, Brand Family, Year Month, Cases
                              2025, Cases 2026, + diff columns (not used --
                              generate.py aggregates its own windows from
                              the raw Cases columns instead). One row per
                              (Customer, Brand Family, Year Month), Jan
                              2025 - Aug 2026 (a still-in-progress month,
                              handled -- see "YTD window" above). Replaces
                              v1's sales_2026-MM_batch.csv files (those
                              were a daily ledger covering only Jan/Feb/Mar
                              for 38 of the 73 accounts; this covers the
                              full roster and all five 2026 cohort months
                              in one file).
  reset_accounts_2025.xlsx  2025 reset roster -- TD Linx #, Account Name,
                             Address, City, State, Zip, Segmentation, Reset
                             Date, and a "Customer ID" column that's
                             ALREADY the sales join key (Kohler manually
                             matched TD Linx -> a Customer Num for this
                             file -- see its own "Match Basis" column per
                             row). There's no "Kohler Account #" column in
                             this file -- use Customer ID instead. Also has
                             a Sheet2 (Customer ID/Name/Address/City/
                             Distribution Area/Account Type) -- a broader
                             Kohler customer reference table, not read by
                             generate.py (kept for provenance / future use
                             if the matching approach ever needs revisiting).
  sales_2025.csv              Same shape as sales_2026.csv, one year back
                              (Jan 2024 - Dec 2025), from a different
                              source system ("Fusion" vs. RDE -- column
                              names are otherwise identical, right down to
                              the "Misc" bucket, see above).
  reset_history_2024.xlsx    NOT read by generate.py as of v3 -- kept on
  reset_history_2025.xlsx    disk for provenance only. Previously used to
                              tag first-time vs. repeat resets, a feature
                              removed in v3 (see "v2 -> v3" above).
  generate.py                Rebuilds the embedded data in index.html for
                              BOTH cohorts. Requires openpyxl (pip install
                              openpyxl).
  index.html                  The dashboard itself -- a "2026 Resets" /
                              "2025 Resets" tab switcher at the top, each
                              rendering the same layout (Overall KPIs,
                              by-month, by-segment, full sortable account
                              table, methodology) against that cohort's own
                              data. Data is embedded in the <script
                              id="reset-data"> tag as {"cohorts": {"2026":
                              {...}, "2025": {...}}}.

To refresh:
  - 2026 cohort: pull a fresh RDE "SFS Reset Accounts" export (same
    columns as sales_2026.csv) and save it over sales_2026.csv. If the
    roster or segmentation changed, save the updated workbook over
    reset_accounts_2026.xlsx.
  - 2025 cohort: same idea with sales_2025.csv / reset_accounts_2025.xlsx,
    from the Fusion source system. (In practice this cohort is complete --
    2025 is over -- so this mainly matters if a correction ever comes in.)
  - Either way: run python3 generate.py -- it prints, per cohort, how many
    accounts evaluated and the blended year-over-year / before-after /
    YTD lift, and prints the removed "Misc" case total per sales file --
    worth a sanity check that it's still in the same ballpark (~30% of raw
    volume) rather than newly dominant or newly absent, either of which
    would mean the export's shape changed. Then commit and push.

Notes:
  - Segmentation (A/B/C) is carried through from each roster as-is; its
    exact definition hasn't been confirmed (assumed to be a volume tier).
  - index.html does the per-cohort table sort/filter/search entirely
    client-side from the flat account list generate.py emits per cohort --
    switching tabs resets the table's filters/sort back to the default
    (3-Mo Lift % (YoY), descending) rather than trying to carry a filter
    that might not even apply to the other cohort's accounts.
