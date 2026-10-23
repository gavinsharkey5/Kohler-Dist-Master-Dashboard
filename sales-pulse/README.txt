SALES PULSE (2026-10-23)
======================================

URL: /sales-pulse/ (Manager Home -> All Tools & Reports -> Sales Performance -> Sales Pulse).
Managers only under the existing middleware rules. Reps, associates and IT
cannot open the page or its files. Rep previews do not fetch Pulse data.
Existing finance-workspace restrictions are retained. No rollout changes.

SOURCE AND REFRESH
  rolling-distribution/data/master/months/YYYY-MM.csv, products.csv,
  customers.csv and sources.json; tools/customer_base.py reads the current
  active customer export for geography. Historical customers absent from
  that export use the master's geography. Closed/inactive historical sales
  remain counted. No money, cost, gross-profit or payout files are read.

  python sales-pulse/generate.py
  python sales-pulse/generate.py --check

  Rolling Distribution's normal generate.py import / --build now rebuilds
  Pulse after its master is saved. Rebuild Pulse after customer-base changes
  too. Do not hand-edit data/pulse.json. No background job or database needed.

PERIODS AND DEFINITIONS
  Current build: Jan 2025-Sep 2026 history, 18 matched comparisons for 2026
  (nine single months and nine year-to-date windows). Default: Jan-Sep 2026
  vs Jan-Sep 2025. Sales imported Oct 1, 2026. No daily/weekly or October
  MTD data exists in this master. Partial months are excluded; an incomplete
  YTD window is never padded with zeroes and falls back to a complete month.

  Cases: net of returns. Placement: distinct account x product with net
  positive cases over the whole selected window. Buying account: account
  with net positive cases in that window. Never add monthly distinct counts.
  New buying accounts: first net-positive month observed in loaded history
  falls in the selected period AND the account is buying in that period.
  Accounts already buying in the first history month have an unknown start
  and are excluded. This is NOT a lifetime first order; no prior-year % shown.
  Internal adjustment accounts and finance-charge products are excluded.

  Core / Southern follow tools/customer_base.py, including the Sales/county
  fallback. Morris 2 is Other, not Southern. Total includes all three groups;
  Other's numbers are in Coverage & Definitions so the total reconciles.
  Each market compares with its own prior year; raw sizes are not a ranking.
  Detail: monthly cases, top ten brand-family/account gains and declines
  by absolute case change. New brands/accounts with no prior cases are
  retained; a zero comparison base is labeled, never an infinite percent.

  Program progress has separate, newer windows: the page links to the hub
  rather than mixing October incentive/MPO progress with September sales.

REP INCENTIVE ESTIMATES (explicit user instruction, 2026-10-23)
  hub.js shows Estimated Earnings only for the signed-in rep's own incentives,
  including owner preview of that rep. It reads the existing numeric payout
  from p.entry.getRep(rep), already computed by the incentive generator.
  No new payout formula, no extrapolation, no billing changes. A missing
  estimate is Estimate Unavailable, never $0. Existing unconfirmed Southern
  rates remain flagged. Amounts are tracker estimates, not final payroll.
  MPO dollars are deferred: no payout constructs have been supplied.
  Other reps' dollars, rates, house-dollar goals and financial terms remain
  hidden. Rep datasets are still their own middleware-served copies.
  Custom programs / older trackers without a stored payout show unavailable;
  reps never fetch program_finance or manager payout/billback terms.

SHARING WITH THE EXISTING REPORT
  This is the live site page, not the kohler-pulse email/report skill.
  Its volume definitions and generated JSON can be reused by that report.
  The report's old Morris-2-as-Southern note must not override customer_base.
  No report, email, PDF or scheduled automation is created in this phase.

VERIFICATION
  python tools/sales-pulse-data-test.py
  node tools/sales-pulse-browser-test.cjs (Playwright available)
  Uses real static data, actual middleware routing and local identity fixtures.
  No live sign-in, database writes or financial-term requests. Screenshots:
  shots/sales-pulse/ (ignored). Check 390 / 820 / 1366, light and dark.
  Passed: 518 independent data checks + 740 browser checks. Pulse and own
  estimate cards/detail checked at all three widths in both themes. Nine reps
  exercised 26 positive, 47 zero and 64 unavailable incentive estimates.
  Existing rep/DM regression suites now permit currency only in .inc-estimate.
  Cache tags: hub.js / hub.css and Pulse JS/CSS/JSON = 20261023p4b.
  Approved for commit and publication 2026-10-23. Phase 5 has not started.
