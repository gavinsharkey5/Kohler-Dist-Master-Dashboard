Wine & Spirits — one dashboard (distribution + execution)
=========================================================

This folder holds THE Wine & Spirits dashboard. It replaced the two older
pages on 2026-08-25:

  * the "W&S Portfolio" dashboard (wine-spirits-portfolio/) — distribution,
    account detail, margins
  * the "W&S Execution Tracker" (wine-spirits/wine-spirits-tracker.html) —
    rep activation, account status, brand-by-rep, cities, par level, lost
    placements

Both old URLs are now redirect stubs pointing here, so existing links and
bookmarks keep working. Tabs on the unified page: Overview, Report Card,
Distribution, Rep Performance, Account Detail, Brand Performance, By City,
Placement Gaps, Opportunity Tracker, Lost / At-Risk (Margins lives inside
Brand Performance).

CASES ARE THE ONLY VOLUME MEASURE
---------------------------------
There are no "units" anywhere on the page. The Encompass exports report a
selling unit that differs by item — a bottle for some items, a full case for
others — so build_ws_dashboard.py converts every figure to cases AT THE
PRODUCT LEVEL before anything is aggregated:

    cases = units / unitsPerCase[product]

unitsPerCase comes first from the Encompass PACKAGE MASTER,
../wine-spirits-portfolio/ws_packages.csv, whose "Wholesale Units per Case"
column is exactly this number: 6 for a bottle-order package sold by the bottle
("4) Bottle (BO)"), 1 for a package sold by the case ("3) Case (CA)"). Any
package not in that file falls back to voting on ws_invoice_trans.csv, which
carries both a Cases and a Num Units column on every invoice line. Every run
prints where each ratio came from, names any product whose invoice lines
disagree with no package on file to settle it, and reconciles converted case
volume against invoiced cases — read that output before publishing a refresh.

One product is overridden by hand in RATIO_OVERRIDES at the top of the build
script: Striped Pig Doppio (200365). The monthly grid still labels most of its
rows "1/6/750 mL", but every line of the 2026-08-25 detailed invoice-trans pull
carries Package ID 453 = "1/6/750 mL (BO)", 6 wholesale units per case, sold by
the bottle at ~$19 (6 x $19 = the $114 case). 97 grid units / 6 = 16.2 cases
against 18.2 invoiced — the bottle reading is the one that reconciles. Remove
the override once a package export covers that label.

DATE RANGE — EVERYTHING FOLLOWS IT
---------------------------------
The page has a global date-range selector. Pick any range of months, or a
preset (latest month, previous month, QTD, YTD, last 3 / last 12 months,
previous year, all data), and every tab recalculates for it: cases, buying
accounts, activation, new/lapsed/never-bought status, distribution, brand and
rep performance, city velocity, placement gaps, par level, margins, lost
placements and at-risk accounts.

The source account file is MONTHLY, so ranges snap to whole months. (The
Bardstown dashboard, whose export is transaction-level, does true day-level
ranges.)

Alongside it is a comparison period, chosen in "Compare with":
    Last year          the same months one year earlier (default)
    Previous period    the equally long block of months immediately before
    No comparison      hides the comparison columns
Every KPI and most tables then show current, comparison, absolute change and
% change — always equal-length windows, never a partial period against a full
one. Two more global filters sit next to it: Rep and Premise, so a rep can
scope the whole dashboard to their own book in one move.

Because of that, build_ws_dashboard.py no longer pre-aggregates the
dashboard. It emits lookup tables plus three columnar blocks — sales cells
(account × item × month, in cases), invoice cells (item × month: cases,
revenue, cost, discount) and placement rows — and index.html aggregates
whatever range is selected. The payload dropped from ~3.2 MB to ~660 KB while
answering far more questions.

Account status is relative to the selected range:
    Active        bought inside the range and also before it
    New           first ever purchase falls inside the range
    Lapsed        bought before the range, nothing inside it
    Never Bought  no purchase on file at all
A range starting at the very beginning of the data makes every buyer look
"new"; the page says so under the range line when that happens.

Files
-----
  index.html                   The dashboard. Data lives in the embedded
                               <script id="ws-data"> tag.
  build_ws_dashboard.py        Rebuilds that JSON from every input below.
  ../wine-spirits-portfolio/ws_packages.csv
                               Encompass package master (Package ID, Package,
                               Wholesale Units per Case, Selling Unit of
                               Measure). The authoritative source for the
                               units-to-cases conversion. The full export
                               (2026-08-25) holds 457 packages and covers every
                               product in the data: 187 of 188 ratios come
                               straight from it, one is overridden by hand (see
                               below), none are inferred. Where both sources
                               existed they agreed on every product, so
                               installing it changed no numbers. Re-export it
                               whenever new packages appear — anything missing
                               falls back to inference and is named in the run
                               output.
  ws_account_roster.csv        The assigned W&S account book — customer, rep,
                               city, route, premise. This is the denominator
                               for activation / "never bought" and the source
                               of rep + city for every account. Extracted from
                               the retired tracker's embedded data on
                               2026-08-25; re-export it from Encompass the
                               same way whenever the book is re-cut, keeping
                               the same column headers.
  ws_l6_months.csv             RDE "WS L6 Complete Months Placements/Cases".
  ws_l90_days.csv              RDE "WS L90 Days Placements/Cases".
                               Together these drive the Lost / At-Risk tab.
                               Rows in the overlapping range are identical and
                               are deduplicated before aggregating.
  wine-spirits-tracker.html    Redirect stub for the retired tracker URL.

Also read (from the sibling folder, left in place):
  ../wine-spirits-portfolio/ws_account_level_by_month.csv
      RDE "WS Account Level by Month" — one row per (channel, product,
      customer) with Buyer Count + Units per month. The volume, distribution
      and account-status engine.
  ../wine-spirits-portfolio/ws_invoice_trans.csv
      Encompass invoice transactions — the only source with cost/price, so it
      drives the Margins panel (reported per case) and the units-per-case
      ratios.

ws_brand_by_item.csv is no longer used by anything. Its only content was the
mismatched full-year-vs-YTD buyer comparison described above; it's left in the
portfolio folder for reference.

AP -- ACCOUNTS PLACED -- MEANS DISTINCT ACCOUNTS
------------------------------------------------
One definition, every tab, no exceptions:

    AP = the number of DISTINCT CUSTOMER NUMBERS that bought the thing at
         least once inside the window.

It is NOT customer x item pairs, NOT orders and NOT invoice lines. An account
buying four items of a brand, or the same item in six different months, counts
ONCE. An account whose only line in the window was a credit still counts as
placed, because that is how the rest of the page has always counted a buyer --
presence of a sales cell, not a positive net. (The Opportunity Tracker was the
one place that briefly disagreed, counting net-positive cases only; it now
matches, which is why its Current AP equals the Brand tab's AP exactly.)

The consequence worth internalising: AP DOES NOT ADD UP ACROSS ITEMS. A brand's
AP is the size of the UNION of its items' buyers, so it is lower than the item
APs summed together whenever an account stocks more than one item. Pride &
Clarke YTD 2026: five items, 983 item-level APs, 312 accounts. Open any brand on
Brand Performance and the drilldown prints that reconciliation in full -- the
item cases summing exactly to the brand's cases, and the AP overlap spelled out
so nobody adds the AP column up by hand.

Comparative reporting reaches the item level
--------------------------------------------
Cases and AP both carry current / comparison / variance / % change at brand
family, brand AND item level, on Distribution, Brand Performance and the Report
Card. Opening a brand on Brand Performance gives the same four measures per
item, plus the reconciliation above.

A percentage change against a zero comparison period is never printed as a
number: a row that sold nothing then and something now reads "new". Only the
comparison selector at the top of the page decides the comparison window, and
every window is equal in length.

The Report Card
---------------
Fixed windows that deliberately do NOT follow the range selector (the rep and
premise filters still apply):

    MTD cases   the latest month on file, first of the month to the latest
                data date
    YTD cases   January of the latest year through that same date
    YTD AP      distinct accounts over that same January-to-date window

Viewable by brand family, brand, item, segment or supplier. Segment comes from
the invoice export (the monthly grid does not carry it) and is mapped product
number -> segment in the build script; products that never appear on an invoice
line read "Unknown" rather than being guessed at.

Performance is a reading of the YTD case change alone (+/-5%), NOT progress
against a goal.

The Opportunity Tracker (there are no goals)
--------------------------------------------
Deliberately not a goal tracker. No goal, progress percentage or "still needed"
figure appears anywhere, because no approved goals exist in any file this
dashboard reads.

An account is ELIGIBLE for a selection when all of these hold:
  * it is on the assigned W&S book
  * it is ACTIVE -- it bought something in the portfolio in the trailing 12
    months
  * its premise matches a premise the selection actually sells in
  * the selection's brand family is authorized in that account's area

Then:
    Potential additional accounts = eligible - current AP
Accounts already buying are always counted as eligible (they demonstrably are)
and are then excluded from the recommendations, so the figure can never go
negative and a current buyer can never be recommended.

Territory comes from `../hub/data/accounts.js`, which hub/generate.py already
derives from the two Encompass workbooks (Sales_Reps_Customer_Base.xlsx and
Brand_Sellable_Unsellable.xlsx): per-account area and 2026 all-products volume,
and a CAN SELL / NOT IN TERRITORY / BLOCKED verdict per brand family and area.
It is READ, never re-derived, so the hub and this page cannot disagree. Re-run
hub/generate.py when either workbook is re-exported. 2,306 of 2,368 accounts
carry an area; 19 W&S brand families have no row in the permissions workbook and
are treated as unrestricted -- both numbers are printed on the page itself.

Accounts are ranked on evidence only, and every point of it is shown in the row:
bought it before 45, already buys the family 25, up to 25 for comparable brands
in the same segment, up to 20 for related W&S volume, up to 10 for account size.

WHAT THE OPPORTUNITY TRACKER CANNOT SEE (the missing report)
------------------------------------------------------------
ws_account_roster.csv carries Customer Num, Customer Name, Sales Rep Assigned,
City, Route, On-Off Premise -- and nothing else. It has NO licence status, NO
open/closed flag and NO warm-licence, transfer or non-alcohol classification, so
those accounts CANNOT be excluded by name. "Active in the trailing 12 months" is
standing in for that, which is a proxy, not the real test.

To do it properly this dashboard needs an Encompass ACCOUNT MASTER export
carrying, per Customer Num:
    Account Status        active / inactive / closed
    Licence Type          full / warm / transfer / non-alcohol
    Licence Expiry        or an equivalent good-standing flag
    Account Type/Channel  liquor store, bar, restaurant, grocery, club...
    County / Area         so area no longer has to come via the hub workbook
Drop that beside ws_account_roster.csv and the eligibility gate can use the real
classifications instead of the recency proxy.

FUTURE GOALS -- the model is already in place
----------------------------------------------
No goals are shown, and none are invented. The shape is defined so that the day
real goals are approved they are a CSV drop, not a code change. Create
`ws_goals.csv` beside build_ws_dashboard.py:

    level      supplier | family | brand | item | segment
    name       the exact value at that level, e.g. "Bardstown Green River"
    metric     cases | ap
    period     YYYY for an annual goal, YYYY-MM for a monthly one
    goal       the number
    rep        optional; blank = company-wide
    territory  optional; blank = every area

Rebuild, and the Report Card grows Goal / Progress / Still needed columns for
exactly the rows that file covers:

    progress % = actual / goal        still needed = MAX(goal - actual, 0)

Without the file the columns do not exist at all.

Definitions
-----------
  YTD Buyers        Distinct accounts with at least one case YTD.
  Gained / Lost     Accounts buying this year that weren't buying in the
                    prior-year window, and vice versa. Click any row in
                    Distribution or Brand Performance to see them by name.
  Active            Bought this year and last.
  New               First purchase this year (nothing in the prior year).
  Lapsed            Bought last year, nothing at all YTD.
  Never Bought      On the assigned book with no purchase on file.
  Par level         The average number of buying accounts per rep for that
                    brand family, company-wide. Below par = a placement
                    opportunity. (Same definition the old tracker used.)
  Lost placement    An account × item pair that ordered earlier in the window
                    and nothing in the trailing 60 days, anchored on the
                    latest load-sheet date in the placement exports.
  At-risk account   Still buying this year but down 25% or more in cases
                    against the same months last year.
  Realized margin   Case price minus laid-in cost, weighted by cases actually
                    sold. Invoice rows with both $0 unit price and $0 ext
                    price are load-sheet/inventory movements rather than paid
                    sales and are excluded, same as the old portfolio page.

Caveats worth knowing
---------------------
  * Cities come from the assigned roster, which only carries a city for
    accounts that have transacted at some point — the rest sit under
    "Unknown". City-level activation is therefore a floor, not a census.
  * The Margins panel covers the invoice file's own date range (printed in
    the header), which is wider than the YTD window used everywhere else.
  * Accounts on the roster with no rep are shown as "Unassigned".

THE 2026-09-14 REFRESH -- read this before the next one
-------------------------------------------------------
Three RDE exports arrived covering only the recent stretch, with the note that
they "no longer include records from August 2026 and earlier". That turned out
to be only half right, and the difference matters:

  WS Account Level by Month   columns: 2026/8 and 2026/9 ONLY.
      Its August was NOT a partial top-up. It was a fuller RESTATEMENT of the
      whole month: every one of the master's 497 August rows was present, 660
      keys matched to the cent, 85 had grown, 1 carried a credit, and NOT ONE
      master row with August units was missing. August went 1,543 -> 2,089
      units because the master's own August had been cut off at 8/24.
      => merged with --overlap REPLACE. Adding would have double-counted.

  WS Portfolio Overview       8/24/2026 - 9/16/2026 (invoice transactions).
      The master ended at 8/24 with 29 rows; the export opened on 8/24 with the
      same 29 rows, byte for byte. A clean seam.
      => merged in rows mode: 875 new rows added, 29 recognised as duplicates.

  WS Brand by Item            a 2026 full-year aggregate. Still unused by the
      dashboard (see above) and not merged. Useful only as an independent
      check on item-level YTD buyer counts.

DUPLICATE IDENTIFICATION -- the keys that decide "same record"
  monthly grid   (On-Off Premise, Product Num, Customer ID). Verified unique in
                 both files: 4,958/4,958 in the master, 974/974 in the export.
                 Month columns present in the newer pull overwrite the master's;
                 every month the pull does not cover is left untouched.
  invoice rows   the ENTIRE row, compared as a multiset. The invoice export has
                 no customer column, so two customers buying the same item at
                 the same price on the same day produce genuinely identical
                 lines; only the COPIES beyond what the master already holds are
                 appended.

History was verified intact afterwards, month by month: all twenty months from
Jan 2025 to Jul 2026 came through with byte-identical unit totals, and no
pre-August invoice month changed row count. Only 2026/8 moved (restated up) and
2026/9 appeared. A missing record was never read as a deletion -- nothing in the
masters is removed by either merge mode.

Backups: merge_export.py writes <name>.csv.bak before touching a master
(gitignored), and this refresh also took wine-spirits/backups/<timestamp>/ with
the two masters plus index.html. Both are local only -- the durable backup is
git history, which holds the previous CSVs in the preceding commit.

NOTE: ws_l6_months.csv and ws_l90_days.csv were NOT part of this drop, so the
Lost / At-Risk tab is still anchored at 2026-08-24. Re-pull those two whenever
that tab needs to be current; they are rolling windows and are simply
overwritten.

Adding new data without re-pulling the whole year
------------------------------------------------
THE SHORT VERSION — one command from the repo root:

    python3 update_data.py ~/Downloads/whatever_you_just_pulled.csv
    python3 update_data.py ~/Downloads            # or a whole folder of CSVs

It reads each file's column headers, works out which master it belongs to,
merges it in (keeping every earlier date), and re-runs the dashboards that
changed. Overlapping dates are safe for the transaction-style exports: a row
already in the master is skipped rather than duplicated. The monthly grid is
the one that needs a decision — if your pull covers a month the master already
holds, add --overlap add (a top-up of days the master doesn't have yet),
--overlap replace (a full re-pull of those months) or --overlap keep. Every
master is backed up to <name>.csv.bak first.

The rest of this section is the manual equivalent, using merge_export.py
directly.
build_ws_dashboard.py REBUILDS the dashboard from whatever files it is handed.
Handing it a "Jul 23 onward" slice of ws_account_level_by_month.csv would drop
every earlier month: YTD would collapse to that slice, prior-year YTD would
empty out, and every account would look new or lapsed. Two safe options:

  1. Re-export each report for its full window and overwrite the CSV. The RDE
     reports are date-range parameterised, so re-running Jan 2025 -> today is
     the same effort as running a narrow slice. This is the default path.
  2. Pull only the new dates and MERGE them into the master file first, with
     the repo-root helper:

        # the wide monthly grid -- new months become new columns, and any
        # month present in both files is overwritten by the newer pull
        python3 ../merge_export.py monthly \
            ../wine-spirits-portfolio/ws_account_level_by_month.csv \
            ~/Downloads/ws_account_level_aug.csv

        # transaction/placement style files -- new rows appended, duplicates
        # dropped, so overlapping date ranges are safe
        python3 ../merge_export.py rows \
            ../wine-spirits-portfolio/ws_invoice_trans.csv \
            ~/Downloads/ws_invoices_aug.csv

        python3 build_ws_dashboard.py

     Each run writes a .bak copy of the master before touching it and prints
     what it added. Keep the same report columns in the partial export.

ws_l6_months.csv and ws_l90_days.csv are the exception: both are rolling
windows by definition (last 6 complete months, last 90 days), so just
overwrite them with fresh pulls — the builder dedupes the overlap between
them. They only feed the Lost / At-Risk tab, which is a "what stopped in the
last 60 days" question and does not need older history.

To refresh
----------
  1. Re-export the RDE/Encompass reports over the CSVs above, keeping the
     same filenames and column headers.
  2. Run: python3 build_ws_dashboard.py
     Check the run output: the units-per-case coverage line, the account
     status counts, and the YTD-vs-prior-year figures.
  3. Commit and push.
