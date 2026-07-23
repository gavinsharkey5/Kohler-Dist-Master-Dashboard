Customer Reset Tracking — working folder, no dashboard yet

Goal: figure out whether Kohler's off-premise shelf/store resets (the
"SFS" program) actually increase or decrease sales, and build a
dashboard once the methodology and data are solid. Per Gavin: do NOT
build a dashboard from this data yet -- this folder exists to collect
and organize the inputs while the eval approach is worked out.

Files:
  reset_history_2024.xlsx   Prior program year. 78 reset accounts,
                             Jan-Dec 2024. Sales compared 2023 vs 2024,
                             anchored to each account's own reset date,
                             plus a parallel "Constellation Brands"
                             column as an in-store benchmark. Segmented
                             A/B/C. (Originally
                             "20232024_SFS_Reset_Comparison_v1.xlsx".)
  reset_history_2025.xlsx   Prior program year. 69 reset accounts,
                             Jan-Jun 2025, same shape as above plus a
                             "Before/After PSA" (photo) tracking column
                             and SKU/"Placement Count" pre vs post.
                             (Originally "Store_Reset_Data_Eval_2025.xlsx".)
  reset_accounts_2026.xlsx  The 2026 reset account list to evaluate --
                             73 accounts, reset dates 1/2 - 5/7/2026,
                             with both Kohler Account # and TD Linx #.
                             (Originally "SFS_JanJune_2026.xlsx".)
  sales_2026-01_batch.csv   First raw sales pull, for the January 2026
                             reset cohort only (11 accounts: 49055,
                             29008, 45004, 21044, 27063, 27034, 36007,
                             48002, 24017, 43001, 67005). One row per
                             (Customer, Brand Family, actual invoice
                             date) from Encompass's InvoiceTrans, Jan
                             2025 - Jun 2026, with Case Equiv, $vol, and
                             Gross Profit. The "2025"/"2026" column
                             split in this export is just which year
                             the row's own date falls in -- only one of
                             each pair is ever populated per row, it is
                             NOT a same-day 2025-vs-2026 pivot. 9,605
                             rows, 209 distinct Brand Families, no gaps.
                             (Originally
                             "Fusion_GSHARKEY_20260723_1253413352281.csv".)
                             Future monthly batches should follow the
                             naming pattern sales_2026-MM_batch.csv.

Key findings so far (see chat history for full detail):
  - 10 of the 11 January accounts were ALSO reset in 2024 and/or 2025
    (only City Supermarkets/43001 is a true first-time reset). Across
    all three program years, 118 unique stores have been reset at
    least once, and 31 of the 73 2026 accounts have now been reset
    three years running. This is mostly a recurring annual program,
    not one-time events -- the eval needs to split "first-time" vs
    "repeat" resets rather than treat all accounts the same.
  - The 2024/2025 files already used a decent methodology: YoY
    comparison anchored to each account's own reset date (not a shared
    calendar cutoff), a Constellation-brand in-store benchmark, and a
    (not-included-here) non-reset "control store" baseline (-8.0% avg
    case change vs. -8.7% for reset stores, per reset_history_2025.xlsx
    Summary Stats tab).
  - sales_2026-01_batch.csv only goes back to Jan 2025, not 2024 as
    originally asked -- workable (still covers each account's most
    recent prior reset for the ones reset in 2025), but doesn't reach
    back to a pre-2024 baseline for accounts whose only prior reset was
    in 2024.

Still open / needed before building anything:
  - Segmentation (A/B/C) definition -- assumed to be a volume tier,
    not confirmed.
  - What Constellation's relationship to the reset actually is (shares
    the reset shelf/cooler space? a separate benchmark?) -- changes how
    much weight to put on it as a control.
  - A non-reset "control" account sales pull, so the control comparison
    can be built/verified directly rather than relying on the prior
    program's summary number.
  - How to treat the repeat-reset cohort in the eventual dashboard
    (separate cohort is the working recommendation).
  - Remaining monthly batches (Feb-May 2026 reset accounts) need the
    same sales pull as sales_2026-01_batch.csv.
