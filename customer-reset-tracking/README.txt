Customer Reset Tracking — Does a Reset Lift Sales?

Evaluates whether Kohler's off-premise shelf/cooler resets (the "SFS"
program) actually increase sales, using each account's own reset date as
the anchor. Two cohorts, evaluated and shown separately (a tab switcher at
the top of the page): the 2026 resets and the 2025 resets. Each is its own
roster + sales export + methodology run -- they aren't blended together.

Methodology (v2, 2026-08-07 -- see "v1 -> v2" below for what changed):
  - Sales inputs are monthly account totals (Customer Num x Year Month x
    Cases), not a dated transaction ledger, so windows are whole calendar
    months, not a rolling day count from the exact reset date.
  - 3-MONTH window: the reset's own month plus the following two calendar
    months (e.g. a March reset -> March+April+May), that same window one
    year earlier for the PRE side -- a year-over-year comparison anchored
    at each account's own reset date, not a same-year before/after, so it
    isn't just normal seasonal variation.
  - YTD window: January through the latest fully-elapsed calendar month
    present in that cohort's sales file (today's real in-progress month,
    if the file happens to include it, is dropped so a half-finished month
    doesn't understate YTD), vs. the same January-through-that-month range
    one year earlier.
  - Lift % = (post total - pre total) / pre total, on Cases -- the only
    metric in these exports (no $ Volume / Gross Profit, unlike v1's daily
    ledger). A non-positive baseline (zero, or -- at a couple of small
    accounts -- net-negative, where returns/credits outweighed purchases in
    that window) has no meaningful "% growth" reading: shown as "No
    baseline" rather than an invented, infinite, or sign-flipped number.
  - First-time resets (a store's first-ever SFS reset) are tracked
    SEPARATELY from repeat resets rather than blended together -- in both
    cohorts First-Time shows a clearly better blended lift than Repeat (see
    "Key findings" below), same pattern v1 found.
  - A "Misc" Brand Family bucket in BOTH source exports (~30% of raw case
    volume in each) is excluded from every number on this page -- see
    "Data quality: the 'Misc' bucket" below. This is not a small rounding
    choice; it changed the headline numbers by roughly two orders of
    magnitude (see "v1 -> v2").

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
sales_2025.csv) -- not a fringe artifact. Before they were excluded, an
early build of this v2 methodology showed blended lifts in the tens to
hundreds of percent (one account: +983.6%, driven by a single ~38,200-case
"Misc" row landing inside its post-reset window) that had nothing to do
with resets -- purely which accounts happened to have a "Misc" spike land
inside their evaluation window. Excluded, the numbers land close to v1's
independently-built, differently-sourced result (see below) -- a
consistency check that this exclusion was the right call, not just a
number that "looks nicer." Re-running generate.py prints the excluded
total per file so this stays visible on every refresh.

v1 -> v2 (2026-08-07): v1 covered only the 2026 cohort's Jan/Feb/Mar
sub-set (38 of 73 accounts) from a daily transaction ledger (Case
Equivalent / $ Volume / Gross Profit, 90-day windows). Kohler then supplied
a full 2026 roster + a consolidated monthly sales export covering all 73
accounts, AND a full 2025 roster + its own monthly sales export -- both
new exports are Cases-only and monthly-grain, not daily, which is why the
methodology moved to calendar-month windows (see above) instead of v1's
exact 90-day span. v1's own numbers (+0.2% blended, First-Time +12.3%,
Repeat -3.4%, all 38 accounts) are close to v2's 2026-cohort numbers
below despite the completely different data source, window definition,
and metric -- read that agreement as corroboration, not a coincidence to
wave away.

Key findings so far (v2, 2026-08-07):
  2026 cohort (73 of 73 accounts evaluated):
    - Blended 3-month Cases lift: +0.6% (33 up / 38 down / 2 no baseline).
    - First-Time (15 accounts): +14.9% blended 3-month lift.
    - Repeat (58 accounts): -1.2% blended 3-month lift.
    - YTD (Jan-Jul 2026 vs. Jan-Jul 2025): +0.6% blended.
  2025 cohort (69 of 69 accounts evaluated):
    - Blended 3-month Cases lift: -3.8% (20 up / 45 down / 4 no baseline).
    - First-Time (25 accounts): +2.2% blended 3-month lift.
    - Repeat (44 accounts): -6.1% blended 3-month lift.
    - YTD (Jan-Dec 2025 vs. Jan-Dec 2024, i.e. full calendar year): -3.3%
      blended.
  - Same pattern in both cohorts and consistent with v1: First-Time resets
    outperform Repeat resets by a wide margin, and most of the roster in
    both years is repeat resets (a recurring annual program), so the
    blended/overall number is pulled toward Repeat's weaker (here,
    negative in both cohorts) result.
  - The 2024/2025 program-year workbooks' own methodology (YoY anchored to
    reset date, plus a non-reset control-store baseline) found reset
    stores performed roughly in line with a control group's own decline --
    i.e. resets may not be beating "doing nothing." Still no 2026 or 2025
    control-store pull to check that directly here (see "Still open").

Still open / not yet in v2:
  - A non-reset "control" account sales pull for both 2026 and 2025, so
    the control comparison can be verified directly rather than relying on
    the prior program's own summary number.
  - Confirmation of what Segmentation A/B/C actually measures (assumed to
    be a volume tier, not confirmed) -- carried through and shown as a
    grouping in the dashboard, not treated as an endorsed metric.
  - What's actually inside the "Misc" bucket, and whether Kohler wants it
    included under a different (e.g. brand-blind but still real) treatment
    rather than excluded outright.
  - The Constellation Brands in-store benchmark used in the 2024/2025
    program-year workbooks isn't in either of these monthly exports --
    not included here.
  - The 2025 cohort's "Repeat" tag only checks reset_history_2024.xlsx (no
    2023 history file exists) -- some 2025 "First-Time" accounts may
    actually be repeats of an even earlier reset this build can't see.

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
  reset_history_2024.xlsx    Prior program years (keyed by TD Linx #) --
  reset_history_2025.xlsx    used only to tag each account as a first-time
                              reset vs. a repeat, not for their own sales
                              figures. reset_history_2025.xlsx is only
                              consulted for the 2026 cohort (checking "was
                              this 2026 account also reset in 2025") -- the
                              2025 cohort obviously can't be checked against
                              its own year, and there's no 2023 file to
                              check further back for it.
  generate.py                Rebuilds the embedded data in index.html for
                              BOTH cohorts. Requires openpyxl (pip install
                              openpyxl).
  index.html                  The dashboard itself -- a "2026 Resets" /
                              "2025 Resets" tab switcher at the top, each
                              rendering the same layout (KPIs, First-Time
                              vs. Repeat split, by-month, by-segment, full
                              sortable account table, methodology) against
                              that cohort's own data. Data is embedded in
                              the <script id="reset-data"> tag as
                              {"cohorts": {"2026": {...}, "2025": {...}}}.

To refresh:
  - 2026 cohort: pull a fresh RDE "SFS Reset Accounts" export (same
    columns as sales_2026.csv) and save it over sales_2026.csv. If the
    roster or segmentation changed, save the updated workbook over
    reset_accounts_2026.xlsx.
  - 2025 cohort: same idea with sales_2025.csv / reset_accounts_2025.xlsx,
    from the Fusion source system. (In practice this cohort is complete --
    2025 is over -- so this mainly matters if a correction ever comes in.)
  - Either way: run python3 generate.py -- it prints, per cohort, how many
    accounts evaluated (should be the full roster now, not a partial
    cohort like v1) and the blended First-Time / Repeat / overall lift, and
    prints the excluded "Misc" case total per sales file -- worth a sanity
    check that it's still in the same ballpark (~30% of raw volume) rather
    than newly dominant or newly absent, either of which would mean the
    export's shape changed. Then commit and push.

Notes:
  - Segmentation (A/B/C) is carried through from each roster as-is; its
    exact definition hasn't been confirmed (assumed to be a volume tier).
  - "Repeat" resets are checked against reset_history_2024.xlsx and (2026
    cohort only) reset_history_2025.xlsx, keyed by TD Linx #.
  - index.html does the per-cohort table sort/filter/search entirely
    client-side from the flat account list generate.py emits per cohort --
    switching tabs resets the table's filters/sort back to the default
    (3-Mo Lift %, descending) rather than trying to carry a filter that
    might not even apply to the other cohort's accounts.
