Summer of Success 2026 — ROI evaluation

Answers one question: did the incentive generate incremental volume or
gross profit, or did it pay for a trend that was already running?

  Summer_of_Success_ROI_Analysis.xlsx   the evaluation, 14 tabs
  make_roi_analysis.py                  rebuilds it

This is an EVALUATION, not a tracker. The live tracker is summer26/
index.html and the payout model is summer26/Summer_of_Success_Recap.xlsx;
neither is touched by anything here.

SOURCES
  Three RDE exports, all "Sales Rep Assigned x Supplier x Brand Family"
  with Case Equiv, Revenue, Gross Profit, GP/CE and Margin %:
    1. 2026 Summer of Success                      6/1–8/31, program brands
    2. 2026 Summer of Success Jan–May              1/1–5/31, program brands
    3. Summer of Success Brands Not Included       6/1–8/31, everything else
  plus summer26/goals.csv for the per-rep qualifier goals.

  Export 2 is the pre-program baseline. Export 3 is the control, and it is
  the one that does the most work: because it is "brands NOT in SoS" rather
  than "other suppliers," it contains non-incented brands from the SAME
  suppliers — which is what makes the within-supplier test on the Control by
  Supplier tab possible.

  SRC at the top of make_roi_analysis.py points at wherever those CSVs live.
  Update those paths before a rerun.

THE FOUR TESTS, AND WHAT THEY FOUND
  1. Acceleration Test — did growth speed up once the program started?
     Amplify ran +12.0% Jan–May and +11.5% Jun–Aug. Qualifier went from
     -2.5% to -5.2%. No acceleration in either.
  2. Counterfactual — apply each segment's Jan–May trajectory to its Jun–Aug
     base. Amplify landed $78 off its own trend, against $26,746 of amplify
     payout.
  3. Control by Supplier — incented brands -3.4%, the same suppliers'
     non-incented brands +1.0%. The incented book lost to the book with no
     incentive.
  4. GP Bridge — gross profit held up on rate, not volume, and the rate gain
     was house-wide: +$0.145/case on program brands vs +$0.526 on the
     control. The program captured least of a margin wave it did not cause.

  Verdict: no measurable incremental lift. The program paid for the trend.

THE TWO FINDINGS THAT MATTER FOR 2027
  Brand Selection tab — brand choice decided the outcome, not payout design.
  Boston Beer incented Twisted Tea (-7,585 cases) and Truly (-3,111), both
  in structural decline, while Sun Cruiser — no incentive — grew 13,728
  cases and $237,182 of GP with the same reps in the same summer. Mark
  Anthony is the mirror image and the program's one clear win: incented
  brands -5.9% against its own non-incented brands at -22.2%.

  Goal Design tab — 126 of 137 qualifier goals (92%) were set BELOW that
  rep's own 2025 volume. In aggregate the goals asked for 2.5% LESS than the
  same reps did last year, and 52 sub-2025 goals cleared on volume flat to
  last year and earned tier payouts for it.

REFRESH
  1. Point SRC at the new exports.
  2. python3 make_roi_analysis.py
  Every analysis cell is a formula off the three Data tabs, so replacing a
  Data tab re-runs the whole evaluation. Only labels, the qualifier goals,
  the CE/Revenue/GP figures and the Assumptions constants are values; blue
  text marks them, per the convention in Summer_of_Success_Recap.xlsx.

  Data - Control is the export summed to supplier x brand (4,149 rows ->
  292). No tab reads the control per rep, and at full grain the workbook's
  SUMIFS got slow enough to be annoying in Excel.

VERIFICATION
  openpyxl writes formulas with no cached values, so Excel computes them on
  open — same as Summer_of_Success_Recap.xlsx. The usual check
  (scripts/recalc.py, which drives LibreOffice) CANNOT run in the Claude
  Code web environment: LibreOffice fails with "failed to launch javaldx"
  and never recalculates, even on a three-cell file. This workbook was
  verified instead with the `formulas` package (pip install formulas),
  which evaluates the sheet in Python: 6,079 formulas across 25,203 cells,
  zero errors, and the headline values cross-checked against the figures
  computed directly from the CSVs. If you rebuild, verify the same way.

WHAT THIS CANNOT TELL YOU
  - Whether the payout is Kohler's cost or supplier billback. No Summer of
    Success line appears in supplier-budget/expenses.csv.
  - Whether amplify gains were new points of distribution or deeper volume
    in existing accounts. No export here carries account counts — an
    Account x Brand Family pull would close this, and it is the biggest
    remaining gap.
  - A formal difference-in-differences. Three of the four cells are here; a
    Jan–May pull of the control set would complete it.
  - Whether September gave any of it back.

  The payout total here is $53,996, not the $53,746 in
  Summer_of_Success_Recap.xlsx: one rep/supplier crossed a Tier 3 line on
  the fresher export. Amplify is identical. Both figures and the
  reconciliation are on the Assumptions tab, along with the three open
  questions that move the cost side (funding, tier basis, per-rep vs house).
