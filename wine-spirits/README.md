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
bookmarks keep working. Tabs on the unified page: Overview, Distribution,
Rep Performance, Account Detail, Brand Performance, By City, Placement Gaps,
Lost / At-Risk (Margins lives inside Brand Performance).

CASES ARE THE ONLY VOLUME MEASURE
---------------------------------
There are no "units" anywhere on the page. The Encompass exports report a
selling unit that differs by item — a bottle for some items, a full case for
others — so build_ws_dashboard.py converts every figure to cases AT THE
PRODUCT LEVEL before anything is aggregated:

    cases = units / unitsPerCase[product]

unitsPerCase comes from ws_invoice_trans.csv, which carries both a Cases and
a Num Units column on every invoice line. As of the 2026-08 refresh the ratio
is perfectly consistent within each product (188 products, zero conflicts)
and covers 100% of the products in the monthly account file. Any product with
no invoice history falls back to 1 unit = 1 case and is printed by name at the
end of every run — if that list is ever non-empty, check it before publishing.

PERIODS — NO PARTIAL-VS-FULL COMPARISONS
----------------------------------------
    YTD             Jan 1 of the latest year in the data through the latest
                    complete month in the data.
    Prior-Year YTD  Exactly the same months one year earlier.
    Latest month / Prior month, each compared with the same month last year.

This is the main behavioural change from the old dashboards: the retired
Portfolio page compared full-calendar-2025 buyer counts against partial-2026
YTD (from ws_brand_by_item.csv), and the retired tracker did the same with
$Vol. Both comparisons are gone; matched YTD buyer counts and cases are
computed from the monthly account file instead.

Files
-----
  index.html                   The dashboard. Data lives in the embedded
                               <script id="ws-data"> tag.
  build_ws_dashboard.py        Rebuilds that JSON from every input below.
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

Adding new data without re-pulling the whole year
------------------------------------------------
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
