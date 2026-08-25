Bardstown Bourbon & Green River — Cases, Placements, Retention & CORE

Turns the "RDE Bardstown / Green River Retention History" export into a
sales-execution dashboard. Tabs, in order:

  Monthly Close & YTD   Month-to-date, the last complete month, and YTD --
                        each against a like-for-like prior-year range -- plus
                        the monthly cases chart and a reach table (how much of
                        the assigned account universe is buying).
  New Placements        Every account whose FIRST EVER order of the brand (in
                        this report window) lands in the selected period --
                        MTD, prior month or YTD -- with brand, account, city,
                        rep, premise, first-purchase date and cases. Click a
                        row for the SKUs they bought. The YTD new-placement
                        KPI on the first tab links straight here.
  Retention & Frequency Purchase-frequency ladder (1+, 2+, 3+, 4+, 5+, 10+,
                        20+ orders) with accounts and % of the ENTIRE account
                        universe, not just buyers; plus the order-frequency
                        chart and the bottle-vs-case first-order analysis.
  Accounts & SKUs       Brand -> Account -> SKU. Every account, with a SKU
                        dropdown showing cases, sales, first/last purchase,
                        purchase frequency, cases trend and YTD cases.
  Rep Placement Gaps    Rep x brand-line matrix: who has all four lines, who
                        is missing one, with clickable MISSING cells listing
                        the accounts behind each gap. Spans both brands, so
                        the brand chips don't scope it.
  Cities & Velocity     Account velocity by city -- buying accounts, orders,
                        cases, orders/account, cases/account, YTD YoY, and an
                        on-premise vs off-premise split -- plus the
                        distribution-area view.
  SKU Performance       Buyers, repeat rate, cases, YTD vs prior-year YTD per
                        SKU.
  CORE Tracker          Which accounts carry every SKU in the brand's CORE
                        lineup, which are one SKU away, the velocity
                        leaderboard, and CORE + cases by rep.

CASES ARE THE ONLY VOLUME MEASURE (changed 2026-08-25)
The export carries a real "Cases" column (1 bottle = .17 cases, i.e. 6
bottles to a case) and that column is the single source of volume for every
KPI, chart, table, tooltip and drilldown. The only place bottle counts survive
is the bottle-vs-case first-order-size segmentation, which is by definition a
question about the size of an order -- it reports no volume of its own.

DATE RANGE (added 2026-08-25)
The page has a global date-range selector. Pick any start/end date, or a
preset (MTD, previous month, QTD, YTD, last 90 days, previous year, all data),
and EVERY tab recalculates for it: cases, orders, accounts, revenue, new
placements, retention ladder, account and SKU detail, brand-line gaps, city
velocity and CORE.

Alongside it is a comparison period, chosen in "Compare with":
  Last year         the same dates one calendar year earlier (default)
  Previous period   the equally long stretch immediately before the range
  No comparison     hides the comparison columns
Every KPI and most tables then show current, comparison, absolute change and
% change. Comparisons are always equal-length windows -- a partial month is
never compared against a full one.

Because of that, generate.py no longer pre-aggregates anything. It emits the
lookup tables plus one compact columnar block of the order lines themselves
(account index, product index, day offset, cases, revenue, gross profit) and
index.html does the aggregation in the browser. The payload dropped from
~2.2 MB to ~150 KB in the process.

Note on "new placements": first-purchase history only reaches back to the
start of the export, so an account that first bought before then never counts
as new -- and a range that starts at the very beginning of the data makes
every buyer look new. The page says so under the range line when that happens.

ACCOUNT UNIVERSE
"% of universe" in the Retention tab uses the assigned Wine & Spirits account
book (../wine-spirits/ws_account_roster.csv -- 2,351 accounts, 1,290
on-premise / 1,061 off-premise), not just the accounts already buying these
brands. Switching the premise chips re-scopes the denominator too. City-level
"% of city" uses the same roster, which only carries a city for accounts that
have transacted at some point, so treat it as a floor rather than a census.

BRAND LINES (the "four brands" in the placement-gap matrix)
Set in BRAND_LINES at the top of generate.py -- edit there if Kohler re-cuts
the lineup:
  Bardstown Origin Series               Bottled-in-Bond, Bourbon, Double
                                        Barrel Rye, High Wheat
  Bardstown Discovery / Collab          Discovery Series, Collaboration
                                        Series, Bardstown Single Barrel
  Green River Core                      Bourbon, Full Proof, Rye, Wheated,
                                        Honey, 1L
  Green River Single Barrel / Specialty Single Barrel GSPD, Army Anniversary,
                                        Wheated Full Proof, Single Barrel
                                        Wheated
A rep "has" a line once at least one of their accounts has bought any SKU in
it; a MISSING cell lists that rep's buying accounts, which are the accounts
that could carry it.

Bottle vs. case (added 2026-07-22, per a manager's question about whether
single-bottle buyers retain better than case buyers): generate.py classifies
each account by the size of its earliest order in the window -- single bottle,
partial case (2-5 bottles), or full case+ (6+ bottles in multiples of six) --
then reports what share of each group placed a 2nd order. Current data shows
the opposite of the hypothesis: accounts starting with a full case (or even a
partial case) retain noticeably BETTER than accounts starting with a single
bottle, in both brands.

Account premise (added 2026-08-04): every section has an All Accounts /
On-Premise / Off-Premise toggle. This export has no Premise column of its own,
so generate.py joins each Customer Num against
wine-spirits-portfolio/ws_account_level_by_month.csv's "On-Off Premise" column
by Customer ID, falling back to the assigned roster -- confirmed 100% of this
export's ~350 customers match (0 unmatched as of the 2026-08-25 refresh). New
accounts that haven't reached either roster yet fall back to "Unknown" and
appear in the All Accounts view only; generate.py prints the match count on
every run and the page shows a caveat under the premise toggle whenever there
are unmatched accounts.

CORE definitions (set by Kohler, hard-coded in generate.py):
  Green River CORE       = Bourbon, Full Proof, Rye, Wheated, Honey (5 SKUs)
  Bardstown Bourbon CORE = Bottled-in-Bond, Bourbon, Double Barrel Rye,
                            High Wheat (4 SKUs)
An account only counts as carrying the CORE once it has bought EVERY SKU in
that brand's list at least once in the window. If the CORE lineup ever
changes, edit GREEN_RIVER_CORE / BARDSTOWN_CORE at the top of generate.py.

Files:
  RDE_Bardstown_Green_River_Retention_History.csv
                 RDE "Bardstown / Green River Retention History" export
                 (Sales Rep, Customer, City, Distribution Area, Product, Date,
                  Buyer Count, Cases, Units, Revenue, Gross Profit — one row
                  per account x product x order date). The Cases column is the
                  volume source; the Units column is read only to classify
                  first-order size.
  generate.py    Rebuilds the embedded data in index.html from the CSV above.
                 Also reads ../wine-spirits-portfolio/ws_account_level_by_
                 month.csv (premise join) and ../wine-spirits/ws_account_
                 roster.csv (account universe, premise fallback, city counts)
                 — keep both reasonably current.
  index.html     The dashboard itself. The data lives in the embedded
                 <script id="bg-data"> tag as lookup tables plus one columnar
                 block of the order lines; the page aggregates whatever date
                 range, brand and premise are selected.

ADDING NEW DATA WITHOUT RE-PULLING THE WHOLE YEAR
THE SHORT VERSION -- one command from the repo root:

    python3 update_data.py ~/Downloads/bardstown_jul24_onward.csv

It works out which master the file belongs to from its column headers, merges
it in (keeping every earlier order), drops any row already in the master so an
overlapping date range is safe, backs the master up to .bak, and re-runs this
dashboard's generator. The rest of this section is the manual equivalent.

generate.py REBUILDS everything from whatever CSV it is handed, so dropping a
"Jul 23 onward" export over the master file would wipe out every earlier
order: YTD would collapse to those few weeks, the retention ladder would
reset, and every account would look like a brand-new placement. Two safe
options:

  1. Re-export the full window (Jan 1 through today) over the master file.
     This is the simplest path and what the refresh steps below assume.
  2. Pull only the new stretch of dates and MERGE it first:

         python3 ../merge_export.py rows \
             RDE_Bardstown_Green_River_Retention_History.csv \
             ~/Downloads/bardstown_jul23_onward.csv
         python3 generate.py

     merge_export.py appends the new rows, drops any that are already in the
     master (so an overlapping date range is safe), and writes a .bak copy of
     the master before touching it. Keep the same report columns in the
     partial export or it will refuse to merge.

To refresh with a new export:
  1. Re-export "RDE Bardstown / Green River Retention History", keeping the
     same columns.
  2. Save it over RDE_Bardstown_Green_River_Retention_History.csv in this
     folder (same filename).
  3. Run: python3 generate.py -- it prints the premise match count, the
     account universe, the period windows, and each brand's YTD vs prior-year
     YTD cases. Worth a glance if any of those look off.
  4. Commit and push.

Velocity is cases per month, averaged over the whole report window (the
earliest to latest date across the export) rather than per-account tenure, so
a brand-new account isn't artificially inflated just because it's only been
buying for a few weeks.

New-placement history only reaches back to the start of the report window, so
accounts that first bought before then are never counted as new — and
prior-year new-placement counts aren't shown as a comparison, since every
account looked "new" in the window's opening months.
