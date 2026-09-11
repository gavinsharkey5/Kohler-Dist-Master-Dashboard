Summer of Success 2026 — ROI evaluation

Answers one question: did the incentive generate incremental volume or
gross profit, or did it pay for a trend that was already running?

  Summer_of_Success_ROI_Analysis.xlsx   the evaluation, 21 tabs
  make_roi_analysis.py                  rebuilds it

This is an EVALUATION, not a tracker. The live tracker is summer26/
index.html and the payout model is Summer_of_Success_Recap_vF.xlsx;
neither is touched by anything here. Payout figures are READ from the vF
recap, not recomputed, so this workbook can never disagree with it.

SOURCES
  Three RDE exports, each "Sales Rep x Supplier x Brand Family x Customer
  Num Name x County" with Case Equiv, Revenue, Gross Profit, GP/CE and
  Margin %:
    1. 2026 Summer of Success                   6/1-8/31, program brands
    2. 2026 Summer of Success Jan-May           1/1-5/31, program brands
    3. Summer of Success Brands Not Included    6/1-8/31, everything else
  plus Summer_of_Success_Recap_vF.xlsx (payout + manager), summer26/
  goals.csv (per-rep qualifier goals), and territory-accounts/*.csv in
  this repo (on/off-premise, joined on the leading customer number).

  Export 2 is the pre-program baseline. Export 3 is the control and does
  the most work: because it is "brands NOT in SoS" rather than "other
  suppliers," it contains non-incented brands from the SAME suppliers and
  the SAME accounts — which is what makes the within-supplier and
  within-account tests possible.

  SRC at the top of make_roi_analysis.py points at wherever these files
  live. Update those paths before a rerun.

THE SEVEN TESTS, AND WHAT THEY FOUND
  1. Acceleration — did growth speed up once the program started?
     Amplify +12.0% Jan-May -> +11.5% Jun-Aug. Qualifier -2.5% -> -5.2%.
     No acceleration in either.
  2. Counterfactual — apply each segment's Jan-May trajectory to its
     Jun-Aug base. Amplify landed $78 off its own trend, against $26,746
     of amplify payout.
  3. Within-supplier control — incented brands -3.4%, the same suppliers'
     non-incented brands +1.0%.
  4. Within-ACCOUNT control — in the 1,704 stores that bought both,
     incented -3.90% vs non-incented -3.51% in the same store. This is the
     tightest control the data allows and the hardest to argue with.
  5. Distribution — amplify PODs +4.2% during the program but +5.5%
     before it. Distribution growth decelerated too.
  6. Goal design — 128 of 137 qualifier goals (93%) were set BELOW that
     rep's own 2025 volume and 129 at or below it; the aggregate goal
     asked for 2.5% LESS than the same reps delivered last year. Thirty-two
     goals sat within 1% of the rep's own prior-year figure and fifteen
     within two cases of it — prior-year volume restated as a target.
  7. Payout vs performance — correlation between payout earned and volume
     delivered is roughly zero (r = -0.07; r = -0.22 against each rep's
     own control).

  Verdict: no measurable incremental lift. The program paid for the trend.

WHAT IS FAIR TO THE SALES TEAM
  The qualifier decline was NOT lost distribution. PODs fell 1.2%, the
  same as the control — reps held their accounts. What fell was rate of
  sale (-0.9% pre-program to -4.1% during), which is a market result. And
  no volume was bought with discount: revenue per case held on every
  growing amplify brand.

THE THREE FINDINGS FOR 2027
  Brand Selection tab — brand choice decided the outcome. Boston Beer
  incented Twisted Tea (-7,585 cases) and Truly (-3,111), both in
  structural decline, while Sun Cruiser — no incentive — grew 13,728 cases
  and $237,182 of GP with the same reps in the same summer. Mark Anthony
  is the mirror image and the program's one clear win.

  Goal Design tab — goals set below prior-year actual cannot produce
  incremental volume. 52 sub-2025 goals cleared on volume flat to last
  year and earned tier payouts for it, and a large block of goals was set
  at last year's number rather than merely below it.

  Channel tab — the one constructive finding. On-premise is the ONLY cut
  where the program accelerated (Amplify +13.7% -> +18.4%, Qualifier -3.6%
  -> -0.1%). It is 11% of volume and still trailed its own control, but a
  smaller, on-premise-weighted program is the one version of this
  incentive the data gives any reason to run again.

  Account Concentration tab — the caution. The top 10 accounts produced
  37% of the amplify gain and the top 100 produced 90%, out of 1,847
  accounts. Most of it sits in BJ's, Super Wine Warehouse, Beverage Barn,
  Total Wine and Sam's Club, where volume moves on chain decisions
  negotiated above the rep.

REFRESH
  1. Point SRC at the new files.
  2. python3 make_roi_analysis.py
  Every analysis cell is a formula off the Data tabs, so replacing a Data
  tab re-runs the whole evaluation. Blue text marks typed-in values, per
  the convention in the recap workbook.

  GRAIN: the exports are one row per rep x brand x ACCOUNT (19k-32k rows).
  Data - Season is summed to rep x segment x supplier x brand, Data - Pre
  and Data - Control to brand, and Data - Accounts to one row per account.
  POD counts are carried on the brand tabs because they are additive
  across brands (each account maps to exactly one rep and one county —
  checked, not assumed). Keeping the full account grain in the workbook
  made Excel's SUMIFS unusably slow for no analytical gain.

VERIFICATION
  openpyxl writes formulas with no cached values, so Excel computes them
  on open — same as the recap workbook. The usual check (scripts/recalc.py,
  which drives LibreOffice) CANNOT run in the Claude Code web environment:
  LibreOffice fails with "failed to launch javaldx" and never
  recalculates, even on a three-cell file. This workbook is verified
  instead with the `formulas` package (pip install formulas), which
  evaluates the sheet in Python: 11,834 formulas, zero errors, and
  headline values cross-checked against figures computed directly from the
  CSVs.
  If you rebuild, verify the same way.

WHAT THIS STILL CANNOT TELL YOU
  - Whether the payout is Kohler's cost or supplier billback. No Summer of
    Success line appears in supplier-budget/expenses.csv. This is the one
    open item worth resolving before presenting.
  - A formal difference-in-differences. Three of the four cells are here;
    a Jan-May pull of the control set completes it.
  - Whether September gave any of it back.
  - Chain vs independent within off-premise. The concentration finding
    points at chain retail, but nothing here carries a chain flag.
  - Price vs discount. Revenue-GP gives laid-in cost, but gross price
    before discount is not in any export, so the +$0.145/case rate effect
    cannot be split into "raised price" vs "stopped discounting."

  Tier basis and per-rep-vs-house remain open on the payout side; both are
  documented on the Assumptions tab and neither changes the lift finding.

KNOWN DATA QUIRK
  The account-level exports total 323 more 2026 cases than the brand-level
  ones for the same window (+0.02%), spread across every rep as +1 to +40 —
  RDE rounding each account row before summing rather than rounding once.
  It moves nothing, but it does shift two or three goal rows across the
  "below prior year" line, which is why that count reads 128 here and 126
  if computed from the brand-level export. Several goals sit within one or
  two cases of prior year, so the count is sensitive at the boundary; the
  aggregate (-2.5%) is not.

  A cross-check worth knowing about: isellbeer/display-auction-tracker/
  DisplayPhotoReport.csv covers Jul-Aug 2026 and joins on account number.
  Accounts with a display photo grew amplify +14.1% vs +9.2% for those
  without, and 14 of the top 25 amplify-gaining accounts had one. It is NOT
  in this workbook because those displays were bought under the display
  auction — a different incentive — so the two programs are confounded and
  neither can claim the result alone.
