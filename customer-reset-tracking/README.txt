Customer Reset Tracking — Does a Reset Lift Sales?

Evaluates whether Kohler's off-premise shelf/cooler resets (the "SFS"
program) actually increase sales, using each account's own reset date as
the anchor. Two cohorts, evaluated and shown separately (a tab switcher at
the top of the page): the 2026 resets (the main focus, and the default tab)
and the 2025 resets. Each is its own roster + sales export + methodology
run -- they aren't blended together.

Methodology (v8, 2026-08-11 -- see the changelog below for what changed
and when):
  - The account table has two date-view modes, switched with a button pair
    above it:
      - YTD (the default view): each account's total for one calendar-date
        range this year vs. the same range last year, plus Lift %. Column
        headers show the literal date range (e.g. "Jan 1-Jul 31, 2025").
        Computed directly from each cohort's own monthly sales file
        (sales_2026.csv / sales_2025.csv) -- see "2026 YTD fix" below for
        a prior version of this page that briefly sourced the 2026
        cohort's YTD from a separate, since-corrected-away Fusion export.
      - 3-Month Reset Window: the year-over-year 3-month comparison
        (pre3/post3/lift3 -- the reset's own month plus the following two
        calendar months, e.g. a March reset -> March+April+May, vs. that
        exact same 3-month window one year earlier), with the exact months
        each account is being compared over shown inline under each number
        (since every account's reset date, and therefore its window,
        differs).
    Every account row can be expanded (click the small arrow) to show the
    same numbers broken out by Brand Family, for whichever window is
    currently selected -- always computed from that cohort's own monthly
    sales file (the only source with brand-level detail), so it always
    sums exactly to the account's own top-line total.
  - Sales inputs are monthly account totals (Customer Num x Year Month x
    Cases), not a dated transaction ledger, so windows are whole calendar
    months, not a rolling day count from the exact reset date.
  - A same-year "before -> after" 3-month comparison (preAdj/liftAdj,
    the 3 calendar months immediately before the reset vs. the reset
    month + the following two) is still computed by generate.py and sits
    in the embedded JSON (cases3Adj/preAdj/liftAdj) but is NOT shown
    anywhere on the page as of 2026-08-11 -- it ran much higher than the
    year-over-year number in both cohorts (2026: +37.9% vs. +0.6%; 2025:
    +48.4% vs. -3.8%), almost certainly normal seasonal lift rather than
    the reset's own effect, and Kohler asked to drop it from the UI rather
    than keep explaining that caveat. Still computable from the data for
    anyone who wants it.
  - YTD window: January through the latest fully-elapsed calendar month
    present in that cohort's sales file (today's real in-progress month,
    if the file happens to include it, is dropped so a half-finished month
    doesn't understate YTD), vs. the same January-through-that-month range
    one year earlier. For the 2026 cohort this lands on Jan-Jul (the
    current in-progress month is August); for the 2025 cohort (a complete
    calendar year) this is the full year, Jan-Dec 2024 vs. 2025 -- these
    two cohorts are on DIFFERENT YTD windows on purpose, confirmed with
    Kohler 2026-08-11 (see "2026 YTD fix" below).
  - Lift % = (post total - pre total) / pre total, on Cases -- the only
    metric in these exports (no $ Volume / Gross Profit, unlike v1's daily
    ledger). A non-positive baseline (zero, or -- at a couple of small
    accounts -- net-negative, where returns/credits outweighed purchases in
    that window) has no meaningful "% growth" reading: shown as "No
    baseline" rather than an invented, infinite, or sign-flipped number.
  - A "Misc" Brand Family bucket in BOTH source exports (~30% of raw case
    volume in each) is removed entirely from the sales data before any
    total is computed, including every Brand Family breakdown -- see
    "Data quality: the 'Misc' bucket" below.
  - First-time vs. repeat reset tracking has been REMOVED (was in v1/v2) --
    see "v2 -> v3" below.
  - Accounts Evaluated / 3-Mo Lift / YTD Lift are ONE combined card (the
    "kpi-mega" -- was three separate tiles through v7, merged 2026-08-11)
    with a single "supplier spotlight" underneath, collapsed by default
    behind a <details> (click "Constellation Brands ..." to expand): every
    Brand Family under SPOTLIGHT_SUPPLIER ("Constellation Brands" --
    Corona, Modelo, Pacifico, Victoria, The Drop; 15 Brand Families in the
    2026 cohort's data, 16 in 2025's, since only 2025 has any "Corona
    Seltzer" rows), blended across every evaluated account, with BOTH a
    3-Mo column (each account's own reset-anchored window) and a YTD
    column (the cohort's YTD window) per brand side by side -- same math
    as the card's own 3-Mo/YTD numbers above it, just filtered to one
    supplier. This is its OWN total, not a subset that sums into the
    card's overall numbers above it (it only covers one supplier's
    brands, not the full roster). Constellation's own resets are running
    well ahead of the full-roster blended number in both cohorts (2026:
    +3.6% 3-mo / +3.1% YTD vs. the overall +0.6% either way).

2026 YTD fix (2026-08-10 -> 2026-08-11): Kohler initially supplied
fusion_ytd_2026.csv, a Fusion "Case Equivalent" export giving Jan 1-Jul 31
totals for both 2025 and 2026 directly, which briefly overrode this
script's own computed YTD numbers for the 2026 cohort only. Its numbers
did NOT match what generate.py computes by summing sales_2026.csv's
monthly Cases over the same window (differences ran up to double digits
at some accounts, e.g. blended YTD lift read +0.4% Fusion-sourced vs.
+0.6% computed) -- and that mismatch turned out to BE the bug: Kohler had
pulled fusion_ytd_2026.csv with the wrong date range on their end. They
confirmed this 2026-08-11 by sending two corrected RDE exports (one per
cohort, both Jan-Jul both years) -- cross-checked here and their numbers
match sales_2026.csv / sales_2025.csv's own existing Jan-Jul subset
EXACTLY (0 of 73 2026 accounts differ, 0 of 68 2025 accounts differ --
not new data, just confirmation the existing files were always right).
So fusion_ytd_2026.csv is deleted and no longer read; the 2026 cohort's
YTD is back to being computed directly from sales_2026.csv, same as the
2025 cohort's always was. Kohler explicitly declined to also change the
2025 cohort's YTD window to match 2026's (Jan-Jul) -- it stays full-year
(Jan-Dec), untouched by any of this. This fix also means the account-level
Brand Family breakdown (always computed from the same monthly sales file)
now sums exactly to the top-line total for BOTH cohorts, removing the
mismatch caveat that used to be on the 2026 cohort's account table.

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

v4 -> v6 (2026-08-11, two rounds of feedback -- v5 was skipped, never
independently released before v6's changes landed on top of it):
  1. Overall section: "Accounts Evaluated" and "Up / Down" merged into one
     KPI tile (was two) -- the up/down split now counts against YTD lift
     instead of the 3-month year-over-year lift it used before.
  2. The standalone "3-Mo Lift (Before -> After)" KPI tile was removed,
     and later the same comparison's two columns ("Pre (Before->After)" /
     "Lift % (Before->After)") were also removed from the account table's
     3-Month Reset Window view -- that comparison isn't shown ANYWHERE on
     the page now (still computed, see methodology above).
  3. Every remaining KPI label and "What am I looking at?" explainer was
     rewritten in plainer language (dropped "blended," "cohort," bare
     "YoY," etc., in favor of "vs. Last Year" and concrete examples).
  4. Added a small highlighted callout to each Overall KPI tile (best
     Segment; top-riser account, excluding Costambar Bar & Liquor as a
     tiny-base outlier) -- SUPERSEDED the same day, see "v6 -> v7" below.
  5. The 2026 YTD fix described above (Fusion source dropped, back to
     computed-from-sales_2026.csv) -- the 2025 cohort's YTD window was
     NOT changed to match; Kohler explicitly asked to leave 2025 as
     full-year Jan-Dec, only fix 2026.

v7 -> v8 (2026-08-11, same day as v6->v7 above): two more changes at
Kohler's request --
  1. The three Overall tiles (Accounts Evaluated, 3-Mo Lift, YTD Lift)
     were merged into one combined card ("kpi-mega" in index.html) instead
     of three separate boxes.
  2. The Constellation Brands spotlight -- previously duplicated once
     under the 3-Mo tile (3-Mo numbers only) and once under the YTD tile
     (YTD numbers only) -- is now ONE spotlight shared by the combined
     card, showing both a 3-Mo and a YTD column per brand side by side,
     and it's collapsed behind a <details>/<summary> by default (click to
     expand the 15/16-brand list) instead of always being fully expanded.

v6 -> v7 (2026-08-11, same day as v4->v6 above): two more changes at
Kohler's request --
  1. Removed the "of N total accounts / up / down YTD / no comparison"
     subtext AND the "best Segment" / "top riser" highlighted callout from
     every Overall KPI tile -- the "Accounts Evaluated" tile is now just
     the bare count, nothing else.
  2. Added the "Constellation Brands" supplier spotlight described in the
     methodology above to the 3-Mo and YTD Lift tiles, filling the space
     freed up by (1) -- this is a materially different feature from the
     "top riser" callout it replaced (a full per-brand breakdown for one
     named supplier, not a single top-performing account/segment pick).

v3 -> v4 (2026-08-10): four changes at Kohler's request --
  1. The account table's default view changed to a Jan 1-Jul 31 (2026) /
     Jan 1-Dec 31 (2025) YTD comparison -- Account, City, Segment, Reset
     Date, the two date-range Case columns (headers spell out the literal
     dates), and Lift % only. A "3-Month Reset Window" button switches to
     the reset-anchored comparisons instead -- see methodology above.
  2. For the 2026 cohort specifically, that default YTD view is now
     sourced from a new file, fusion_ytd_2026.csv, instead of computed
     from sales_2026.csv -- see "2026 YTD source" above. The 2025 cohort
     is unaffected (no equivalent file, none needed).
  3. Every account row can now be expanded to show a Brand Family
     breakdown, for whichever window (YTD or 3-Month) is currently
     selected -- computed from that cohort's own monthly sales file, since
     that's the only source with brand-level detail.
  4. In 3-Month Reset Window mode, the exact months being compared are now
     shown under each number in every row (e.g. "Mar-May 2026"), since
     they differ account to account by reset date -- previously only
     implied by the Reset Date column.

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

Key findings so far (v8, 2026-08-11 -- the "before -> after" numbers below
are computed but no longer shown on the page itself, see methodology):
  2026 cohort (73 of 73 accounts evaluated) -- MAIN FOCUS:
    - Blended 3-month Cases lift (year-over-year): +0.6% (33 up / 38 down /
      2 no baseline).
    - Blended 3-month Cases lift (before -> after, same year): +37.9% --
      see the seasonality caveat above; not directly comparable to the
      year-over-year number.
    - YTD (Jan-Jul 2025 vs. Jan-Jul 2026, computed from sales_2026.csv):
      +0.6% blended.
    - Constellation Brands spotlight (15 Brand Families): +3.6% 3-mo,
      +3.1% YTD -- notably ahead of the full-roster blended number.
  2025 cohort (69 of 69 accounts evaluated):
    - Blended 3-month Cases lift (year-over-year): -3.8% (20 up / 45 down /
      4 no baseline).
    - Blended 3-month Cases lift (before -> after, same year): +48.4% --
      same seasonality caveat as above.
    - YTD (Jan-Dec 2025 vs. Jan-Dec 2024, i.e. full calendar year): -3.3%
      blended.
    - Constellation Brands spotlight (16 Brand Families): -0.1% 3-mo,
      +0.1% YTD -- roughly flat, unlike the 2026 cohort's clear lead.
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
                              in one file). Drives BOTH the account table's
                              YTD default view and its 3-Month Reset Window
                              view for the 2026 cohort, plus its Brand
                              Family breakdown -- see "2026 YTD fix" above
                              (there used to be a separate fusion_ytd_2026
                              .csv override file for the YTD view; it was
                              wrong and has been deleted).
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
    reset_accounts_2026.xlsx. This one file now drives everything for the
    2026 cohort -- YTD view, 3-Month Reset Window, and Brand Family
    breakdown -- no separate YTD file needed (see "2026 YTD fix" above).
  - 2025 cohort: same idea with sales_2025.csv / reset_accounts_2025.xlsx,
    from the Fusion source system. (In practice this cohort is complete --
    2025 is over -- so this mainly matters if a correction ever comes in.)
  - Either way: run python3 generate.py -- it prints, per cohort, how many
    accounts evaluated and the blended year-over-year / before-after / YTD
    lift, and prints the removed "Misc" case total per sales file -- worth
    a sanity check that it's still in the same ballpark (~30% of raw
    volume) rather than newly dominant or newly absent, either of which
    would mean the export's shape changed. Then commit and push.

Notes:
  - Segmentation (A/B/C) is carried through from each roster as-is; its
    exact definition hasn't been confirmed (assumed to be a volume tier).
  - index.html does the per-cohort table sort/filter/search/expand entirely
    client-side from the flat account list generate.py emits per cohort --
    switching tabs resets the table's filters/sort/date-view/expanded-rows
    back to the default (YTD view, Lift % descending) rather than trying to
    carry state that might not even apply to the other cohort's accounts.
    Switching between YTD and 3-Month Reset Window (same cohort) keeps the
    search/segment/month filters but resets sort and collapses any
    expanded Brand Family rows.
  - A "(Unlabeled)" Brand Family in the expand/collapse breakdown means a
    sales row had a blank Brand Family value (not the same thing as
    "Misc," which is a real, populated, deliberately-excluded value --
    see above).
