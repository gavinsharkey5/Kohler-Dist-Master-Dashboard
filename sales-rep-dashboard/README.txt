SALES REP COCKPIT
=================

The rep's core book of business: commission-generating sales activity,
by brand and by account. Deliberately has NOTHING to do with incentives,
MPOs or program tracking -- those live in incentive-tracking/ and MPOs/
and must stay there. This page is the bread-and-butter view a rep opens
in the morning.


REFRESH STEPS
-------------

1. Pull two reports out of the reporting system, both over the SAME date
   windows (the page reads the windows off the column headers, so any
   MTD/YTD pair works -- they just have to match between the files):

   a) Brand-level:   Supplier / Brand Family / Sales Rep Assigned
      with MTD and YTD columns, current year vs prior year.
      Save over  brand_ytd.csv

   b) Account-level: Customer Num / Customer Name / Sales Rep Assigned /
      Brand Family, same MTD and YTD columns.
      Save over  account_ytd.csv

2. Refresh the customer base if reps or accounts have moved:

      cp ../incentive-tracking/data/customer_base_full.csv customer_base.csv

   This is the same Sales Reps' Customer Base export the incentive
   dashboards use. It supplies each rep's full book -- address, Distribution
   Area, county, city, premise and draft/package -- and is what powers the
   territory and channel filters plus the "on your book but no volume"
   accounts. Without it the dashboard still builds, but every account shows
   a blank channel and territory.

3. Run:

      python3 generate.py

   Writes data/index.json, data/reps/<rep>.json (one per rep) and
   data/sync_meta.json. The console prints rep count, total cases and
   total modeled commission -- sanity-check those against the export's
   own Total row before pushing.

4. Commit and push. Nothing else to do; the page fetches its own JSON.


COMMISSION IS MODELED, NOT SOURCED  <-- read this
--------------------------------------------------

Neither export carries a commission figure or a dollar revenue figure.
Both report Case Equivalents only. So the dashboard models commission as

    commission = case equivalents x rate per case

with the rates in commission_rates.csv, which currently holds a single
DEFAULT of $1.00/case and a $1.00 line per supplier for you to overwrite.
At $1.00 the commission numbers are literally the case numbers.

What that means in practice:
  - every SHARE, RANK, RATIO and YEAR-OVER-YEAR MOVE on the page is exact
    and stays exact whatever the rates are;
  - only the absolute dollar SCALE is a placeholder.

To make the dollars real, put Kohler's actual comp plan into
commission_rates.csv (per supplier, or per brand where a brand differs
from its supplier's rate -- BRAND beats SUPPLIER beats DEFAULT) and re-run
generate.py. Nothing else needs to change. The page labels the figures as
modeled until then.


WHO COUNTS AS A REP
-------------------

27 reps, the same ROSTER the incentive dashboards use. "Default",
"Office Tell Sell", "John Neukum" and "Chris Politano" carry rows in the
exports but are not sales reps -- Default is the unassigned-account
bucket, the others are house/tell-sell/chain buckets. They are dropped in
generate.py (NON_REPS), which is why the dashboard's total (~4.08M cases)
is below the exports' Total row (~4.48M cases). That gap is those four
buckets, not lost data.


WHAT THE DASHBOARD DERIVES, AND HOW
-----------------------------------

Most of the page is straight arithmetic on the two exports. Four things
are derived, and are worth understanding before you trust them:

* "Last activity" per account. NEITHER EXPORT HAS AN ORDER DATE. Status
  is inferred from which windows carry volume:
      Ordered this month     MTD current-year volume > 0
      Quiet this month       YTD volume > 0 but no MTD volume
      No orders in 2026      bought last year, nothing this year
      No volume either year  on the book, never bought in either window
  If you ever get an export with a real last-order date, that column
  should replace this inference.

* "vs prior period". The exports ship an MTD window and a YTD window and
  nothing else, so there is no true prior period and no QTD. What the card
  shows instead is a PACE comparison: this month's cases per day against
  the cases per day of the rest of the year (Jan 1 - Jul 31). It answers
  "am I running hotter or colder than I have been," which is the useful
  version of the question. If you want a real QTD, the export needs a QTD
  column pair; the code picks up any dated column pair by prefix.

* Placement gaps ("untapped"). For each brand, the company's placement
  rate is computed SEPARATELY for on-premise and off-premise, then
  weighted by that rep's own channel mix -- so an on-premise book is never
  measured against a supermarket brand's off-premise reach. Each open door
  is then valued at the company-wide MEDIAN volume among accounts that buy
  the brand, scaled by how big that rep's doors are next to the company
  average. Both adjustments matter: without the size scaling a rep whose
  accounts average 300 cases shows "upside" larger than their whole book,
  because it prices new doors like the company's 1,700-case average ones.
  The result is still a ceiling, and the page says so.

* Opportunity severity. Act now / Worth a look / Upside, ordered by
  severity then by dollar value. Rules are in find_opportunities() in
  generate.py -- each one writes its own explanation with real numbers in
  it, because a red arrow on its own tells a rep nothing they can act on.
  Rules that would otherwise emit several near-identical cards (placement
  gaps, stopped-ordering accounts, soft-month accounts) emit ONE grouped
  card with a row per item. If you add a rule, keep that pattern.


FILE MAP
--------
  brand_ytd.csv          source: brand x rep, MTD + YTD, CY vs PY
  account_ytd.csv        source: account x brand x rep, MTD + YTD, CY vs PY
  customer_base.csv      source: the rep's full book (copy of the incentive
                         dashboards' customer_base_full.csv)
  commission_rates.csv   EDIT ME: the $/case model
  generate.py            builds everything under data/
  index.html             the dashboard; fetches data/, no build step
  data/index.json        roster + headline KPIs (loads first, small)
  data/reps/<rep>.json   one file per rep, fetched on demand (~450KB)
  data/sync_meta.json    drives the "Data refreshed" pill
