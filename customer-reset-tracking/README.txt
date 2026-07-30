Customer Reset Tracking — Does a Reset Lift Sales?

Evaluates whether Kohler's off-premise shelf/cooler resets (the "SFS"
program) actually increase sales, using each account's own reset date as
the anchor.

Methodology (matches the "3 Months From Reset Date" window already used in
reset_history_2025.xlsx's own Store Reset Data tab):
  - POST window: each account's own Reset Date through Reset Date + 90
    days, using 2026 transactions.
  - PRE window: the SAME 90-day calendar window one year earlier (Reset
    Date - 365 days), using 2025 transactions -- a year-over-year
    comparison, not a same-year before/after, so the result isn't just
    normal seasonal variation.
  - Lift % = (post total - pre total) / pre total, on Case Equivalents
    (the headline metric; $ Volume and Gross Profit are computed the same
    way per account -- see generate.py).
  - First-time resets (a store's first-ever SFS reset) are tracked
    SEPARATELY from repeat resets (reset again in 2024 and/or 2025) rather
    than blended together -- per the v1 build's own numbers, First-Time
    shows +12.3% blended lift vs. Repeat's -3.4%; averaging them together
    would have hidden that split entirely.

v1 status (2026-07-30): 38 of 73 total 2026 reset accounts evaluated
(the January, February, and March reset cohorts) -- the April and May
cohorts don't have sales data pulled yet.

Files:
  reset_accounts_2026.xlsx  The 2026 reset roster -- Kohler Account #, TD
                             Linx #, Name, Address, City, State, Zip,
                             Segmentation (A/B/C), Reset Date. 73 accounts,
                             1/2-5/7/2026. (Originally "SFS_JanJune_2026.xlsx".)
  reset_history_2024.xlsx   Prior program years, keyed by TD Linx # -- used
  reset_history_2025.xlsx   ONLY to tag each 2026 account as first-time vs.
                             repeat, not for their own sales figures (kept
                             for methodology reference; see "Key findings"
                             below).
  sales_2026-01_batch.csv   RDE "Jan/Feb/Mar 2026 Reset Stores Data"
  sales_2026-02_batch.csv   exports -- one row per (Customer, Brand Family,
  sales_2026-03_batch.csv   actual invoice date), Jan 2025 onward, with
                             Case Equiv/$vol/Gross Profit. Only one of each
                             metric's "2025"/"2026" column pair is ever
                             populated per row (whichever year the row's
                             own Load Sheet Date falls in) -- this is a flat
                             transaction ledger, not a pre-aggregated pivot;
                             generate.py does the pre/post windowing.
                             Future batches should follow the naming
                             pattern sales_2026-MM_batch.csv.
  generate.py               Rebuilds the embedded data in index.html.
                             Requires openpyxl (pip install openpyxl).
  index.html                The dashboard itself (data is embedded in the
                             <script id="reset-data"> tag).

To refresh with a new monthly cohort (e.g. April):
  1. Pull that cohort's sales data (same RDE report, same columns) and
     save it as sales_2026-04_batch.csv in this folder.
  2. If the roster or segmentation changed, save the updated workbook over
     reset_accounts_2026.xlsx.
  3. Run: python3 generate.py -- it prints the overall split, up/down
     counts, and the First-Time vs. Repeat blended lift, worth a sanity
     check against what you'd expect.
  4. Commit and push.

Key findings so far (v1, Jan/Feb/Mar 2026 cohorts, 38 accounts):
  - Blended (all 38): +0.2% Case Equiv lift, 17 up / 19 down / 1 with no
    prior-year baseline (a genuine brand-new placement, not just a
    first-time reset).
  - First-Time resets (9 accounts): +12.3% blended lift.
  - Repeat resets (29 accounts): -3.4% blended lift.
  - This mirrors the pattern already known from 2024/2025: most of the 73
    2026 accounts are repeat resets (this is mostly a recurring annual
    program), and repeats show a much weaker (here, negative) effect than
    first-time resets -- consistent with the idea that a store's shelf
    space only has so much room to gain each time it's touched.
  - The 2024/2025 files' own methodology (YoY anchored to reset date, plus
    a non-reset control-store baseline) found reset stores performed
    roughly in line with a control group's own decline (-8.7% vs -8.0%
    average case change, per reset_history_2025.xlsx Summary Stats) --
    i.e. resets may not be beating "doing nothing." v1 here doesn't yet
    have its own control-store pull to check whether that still holds for
    2026 (see "Still open" below).

Still open / not yet in v1:
  - A non-reset "control" account sales pull for 2026, so the control
    comparison can be verified directly rather than relying on the prior
    program's summary number.
  - Confirmation of what Segmentation A/B/C actually measures (assumed to
    be a volume tier, not confirmed) -- carried through and shown as a
    grouping in the dashboard, but not treated as an endorsed metric.
  - What Constellation's relationship to the reset actually is (shares the
    reset shelf/cooler space? a separate benchmark?) -- the 2026 monthly
    sales exports don't carry a Constellation benchmark column the way the
    2024/2025 workbooks did, so it isn't in v1 at all.
  - April and May 2026 reset cohorts (35 accounts) still need their sales
    data pulled, same shape as the Jan/Feb/Mar batches.
