Territory Account Refresh
=========================

Four RDE "Entire Core Market / Southern District, On/Off Prem Accts"
exports -- Kohler's on/off-premise account book for NINE of the ~13
areas the full book uses:

  Core Market       Bergen, Passaic, Passaic-FF, Sussex, Morris 1, Morris 3
  Southern District Essex, Hudson, Union

(NOT covered by either: Morris 2, Middlesex, and RDE's "Sales"
placeholder rows -- see "WHAT THIS DOES NOT COVER" below.)

Unlike the per-brand MPO/incentive exports elsewhere in this repo,
these are not filtered to a program -- they're literally every account
in those nine areas, which is what makes them useful as a REFRESH
SOURCE for the three files below rather than a data source for any one
dashboard.

Files:
  core_market_on_prem.csv        RDE "Entire Core Market On Prem Accts"
  core_market_off_prem.csv       RDE "Entire Core Market Off Prem Accts"
  southern_district_on_prem.csv  RDE "Entire Southern District On Prem Accts"
  southern_district_off_prem.csv RDE "Entire Southern District Off Prem Accts"
  refresh_customer_bases.py      Applies the four files above to the three
                                   customer-base files listed below.

Each raw export: Sales Rep Assigned, Customer Num, Customer Name,
Shipping Address, City, County, Distribution Area, Buyer Count 2026,
Cases 2026. No Premise column -- implied by which of the four files a
row is in. No Draft Package column either -- see below.

WHERE THIS FEEDS (refresh_customer_bases.py's three targets):
  MPOs/off-prem/sales_reps_customer_base_core.csv
      FULL REPLACE from core_market_off_prem.csv alone. That file's
      whole job is the off-premise Core Market account base (Keystone
      Ice's penetration denominator, Target Accounts scope) -- Southern
      District accounts must NOT be added here, since Keystone Ice and
      the other Core-Market-restricted MPO objectives are not sold
      there, and inflating the denominator with ineligible accounts
      would understate every rep's real penetration.
  MPOs/on-prem/sales_reps_customer_base.csv
      SCOPED MERGE across all four files. This file drives the
      off-premise-ONLY exclusion for every on-prem MPO dataset --
      Angry Orchard, Molson Coors, Fever Tree, Carbliss, all of it --
      and that exclusion has to see both premises across every area a
      rep might sell in, not just Core Market, so both territories are
      folded in.
  incentive-tracking/data/customer_base_full.csv
      Same scoped merge as on-prem's file, PLUS the Draft Package flag
      is preserved by Customer Num lookup (see "DRAFT PACKAGE" below).

  NOT touched: incentive-tracking/data/customer_base_off_prem.csv /
  customer_base_on_prem.csv. Confirmed 2026-09-04: these are legacy
  files that only feed load_premise_map(), where customer_base_full.csv
  already overlays and wins over them -- refreshing them changes
  nothing a rep or Gavin would ever see, so they're left alone rather
  than churned for no behavioral effect.

SCOPED MERGE, exactly what it does: for a target file's existing rows,
any row whose Distribution Area is one of the nine areas above is
DROPPED unless its (Sales Rep Assigned, Customer Num) key still appears
in the matching new file -- that is the "closed accounts" fix (Gavin,
2026-09-04: "i still see the accounts that are closed still
populating"). A key present in the new file replaces the old row
outright (fresh City/County/Distribution Area/Buyer Count/Cases). A key
new to the new file that never existed before is ADDED. Rows whose
Distribution Area is NOT one of the nine (Morris 2, Middlesex, "Sales")
are left completely untouched, because these four exports say nothing
about that territory -- see below.

WHAT THIS DOES NOT COVER, and why nothing was done about it: comparing
the old customer_base_full.csv to the four new files, every row dropped
by the scope check was Area="Sales" (113), "Morris 2" (87), "Middlesex
County" (7) or "Middlesex not in use" (1) -- 208 rows, and NONE of
Kohler's 31 reps disappeared, meaning this isn't reps leaving, it's a
territory these four exports simply don't claim to describe. Pruning
those 208 rows on the theory that "not in the new pull" means "closed"
would have been wrong -- unlike the 22 real Core Market closures found
between last night's off-prem refresh and today's (verified against
Kohler's own two most recent Core Market Off Prem pulls agreeing), there
is no fresh signal on Morris 2/Middlesex/Sales rows at all, so a missing
row there is a coverage gap, not an account being confirmed closed. If a
future export ever states it covers those areas too, extend the scope
list in refresh_customer_bases.py accordingly.

DRAFT PACKAGE (customer_base_full.csv only): several incentive builders
gate draft-channel eligibility on this flag (values starting "1)" or
"2)" mean the account can buy kegs -- see generate.py's
is_draft_capable()). None of the four territory exports carry it, so
refresh_customer_bases.py looks it up by Customer Num from the OLD
customer_base_full.csv (not by rep+customer, since a rep reassignment
shouldn't lose an account's known draft capability) and carries it
forward for every matched account. A brand-new account gets Draft
Package = "" -- which is_draft_capable() reads as NOT draft-capable,
not "unknown" -- so it starts on-package-only until a future customer
base export states otherwise, rather than defaulting to a claim this
data can't support. refresh_customer_bases.py prints how many new
accounts got a blank Draft Package so that count stays visible.

To refresh:
  1. Save fresh RDE pulls over the four CSVs in this folder (same column
     headers -- if a header changes shape, the script's own validation
     will refuse to run rather than silently mis-map columns).
  2. python3 territory-accounts/refresh_customer_bases.py --dry-run
     Review the printed added/dropped accounts per target file.
  3. python3 territory-accounts/refresh_customer_bases.py
  4. Rerun whichever generators consume the three target files:
       python3 MPOs/off-prem/generate_2026-09.py
       python3 MPOs/on-prem/generate_2026-09.py
       python3 incentive-tracking/generate.py
     (Only the CURRENT month's MPO generator -- a closed month's tab is
     a published snapshot, never rebuilt against newer account data;
     see each MPO folder's own README.)
  5. Commit and push.
