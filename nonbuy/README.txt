Non-Buy Reports (2026-10-08) -- distribution gaps a manager can act on, accounts
a rep can sell into
===============================================================================

What it is
----------
/nonbuy/ answers two questions with ONE engine:
  manager  "Where are the distribution gaps across my authorized accounts, and
            which reps can act on them?"
  rep      "Which accounts on my route can I sell this product or brand to?"
The rule that matters most: an opportunity is shown ONLY for a product the
account is permitted to buy, judged per account AND product.

Files
-----
  engine.js         KdhNonBuyEngine -- the calculation, PURE (no fetch, no DOM):
                    date presets, period resolution against loaded months,
                    eligibility, run(), finding sentences. Rule version
                    RULE_VERSION is written into every snapshot and export.
  source-static.js  KdhNonBuySource -- the ONLY file that reads today's data
                    (account books, catalogue, per-rep monthly history, Brand
                    Permissions, DM groups, kdh_program_scope, the saved-report
                    table). A Snowflake / Postgres source implements the same
                    methods (context, accounts, hist/histFor, scope, list/get/
                    save/remove/shared) and nothing else changes.
  nonbuy.js         the screens: entry page, four setup steps, results, saves,
                    exports. Manager and rep share every screen; the rep one is
                    the same screen with the team controls removed.
  nonbuy.css        on manage-programs/manage.css (dialog, picker, review
                    sections) and the Hub tokens.
  supabase/migrations/20261009090000_nonbuy_reports.sql  saved templates /
                    reports / target lists (table nonbuy_reports, RLS,
                    kdh_nonbuy_save, kdh_nonbuy_shared).

Who sees what (permissions)
---------------------------
  REP            the middleware already serves a rep only their own account
                 book (/hub/data/accounts.js -> their slice) and their own
                 sales history (accounts/data/hist/<key>.json); the page's
                 scope is forced to that one rep whatever a criteria object
                 says (a saved / injected "reps" list is ignored). No rep
                 picker, no district filter, no team controls.
  MANAGER        kdh_program_scope decides: the program approver (admin) ->
                 every rep; a district manager -> the reps under them
                 (kdh_reports_under); a brand manager -> every rep but ONLY
                 their suppliers' products (the product dialog's pool);
                 a manager with neither assignment -> NOBODY ("All My Reps"
                 is never silently everyone). The RPC missing = nothing, with
                 the migration named.
  PREVIEW        a manager previewing a rep gets that rep's view; Save is off.
  SAVED ROWS     RLS: a row belongs to the sign-in that saved it; nobody reads
                 another person's rows directly. A target list is shared
                 EXPLICITLY (shared_reps); a rep reads it through
                 kdh_nonbuy_shared, which returns only that rep's subset of
                 the snapshot. A rep can never share and can only save a
                 snapshot that holds their own name.
  EXPORTS        exactly the rows on screen (filters applied), grouped by rep;
                 a rep exports their own authorized rows only; no dollars.

Data (today's static source)
----------------------------
  Accounts       hub/data/accounts.js rows per rep: CustomerID (n), name,
                 area (Encompass Distribution Area resolved from the county
                 when it says "Sales"), county, city, premise, and -- new on
                 2026-10-08 -- chain and type (Encompass Chain / Customer Type,
                 added to hub/generate.py and accounts/generate.py's per-rep
                 books). Only ACTIVE accounts are on the books (the Customers
                 export), so inactive accounts never appear; the page says so.
  Products       accounts/data/products.json through KdhPrograms.products:
                 ProductID, name, supplier, brand family, brand, package,
                 draft. Selections (sku / brand / family / supplier / package /
                 draft, plus exclusions) resolve through
                 KdhPrograms.resolveProducts; duplicates are removed by
                 ProductID.
  History        accounts/data/hist/<rep key>.json: net cases per product per
                 account per MONTH, Jan 2025 -> the last loaded month
                 (tools/program_history.py). `ref` = the last COMPLETE month.
  Permissions    HUB_BRANDS (inside the books): brand family x area ->
                 CAN SELL / NOT IN TERRITORY / BLOCKED (the Brand Permissions
                 workbook). Plus account rules (below).
  Scope          RPC kdh_program_scope (Manage Programs migration).
  Districts      shared/dm-groups.js.

The rules
---------
  PURCHASE       net cases > 0 in a sales month. The record is monthly net
                 cases, so a purchase that is fully returned INSIDE the same
                 month nets to 0 and does not count; a return in a LATER month
                 does not undo the earlier purchase month; a month that nets
                 negative is not a purchase. Purchase OCCURRENCE (invoice lines)
                 is not in the record -- REPORTING_REQUEST 14 (N1-N3) asks for
                 it and for Gavin's ruling on "bought then fully returned".
                 "At least one unit" is read as net cases > 0 (fractional
                 cases count; the case/unit conversion is not on file).
  ELIGIBILITY    per account x product: eligibility(acc, prod, brands) =
                   ok       family CAN SELL in the account's area
                   no       NOT IN TERRITORY / BLOCKED, or an account rule
                            (Whole Foods: alcohol refused; a product whose name
                            says Non-Alcoholic / NA / alcohol-free is allowed)
                   unknown  account area not on file, family not in the
                            Brand Permissions file, or no entry for that area
                 An account appears only when it has >= 1 ELIGIBLE selected
                 product; only eligible missing products are opportunities;
                 UNKNOWN pairs are counted and reported in a notice ("ask for
                 the missing Brand Permissions rows"), never treated as
                 permission. Historical purchases are shown as recorded
                 whatever today's permission; permission is never inferred
                 from a purchase.
  REPORT TYPES   Non-Buyers      no purchase of ANY eligible selected product
                                 in the period (a combined selection: buying
                                 any included product makes a buyer)
                 Missing Products  missing >= 1 eligible selected product in
                                 the period; finding "none" (bought none) vs
                                 "some" (bought others)
                 Lapsed Buyers   bought >= 1 eligible selected product in the
                                 baseline months and none in the current
                                 months (baseline = the same number of whole
                                 months immediately before, or custom dates)
  LEVELS         By Account (rows with the missing products inside) or By
                 Product / Brand / Brand Family / Supplier: each group judged
                 on ITS OWN products (an account is a non-buyer of a brand
                 when it bought none of that brand's eligible products).
  DATES          presets Last 30 / 60 / 90 Days, Month to Date, Previous
                 Month, Custom. A requested range maps to the whole sales
                 months it touches, cut to the loaded months up to the last
                 complete month: the EFFECTIVE period is always printed beside
                 the requested one, with the coverage month; a range with no
                 complete month cannot run (never a zero, never a silently
                 substituted period). Example on Oct 8, 2026 with data
                 complete through Sep: Last 90 Days -> effective Jul 1 - Sep
                 30 with "Oct 2026 is not loaded yet"; Month to Date -> blocked.
  ACTIVITY       "Bought Anything From Kohler During This Period" (default
                 on; anyone may turn it off): keeps only accounts with >= 1
                 purchase of ANY product in the period, from the full history.
  FILTERS        reps (manager), district (DM groups), territory (Core
                 Market / Southern District by area), town, premise, chain,
                 account type, specific CustomerIDs typed or uploaded (CSV
                 with a CustomerID column; matched by CustomerID only; unknown
                 numbers listed, never added).
  COUNTS         distinct accounts are shown separately from account-product
                 opportunities; exclusions are counted (no eligible product,
                 unverified only, no activity, buyers) and explained once.
  WORDING        "No purchases during <dates>. Last bought <month>." /
                 "No purchases in available history: <first month> - <end>." /
                 "Purchased during the baseline (<dates>); no purchases during
                 <dates>." / "Missing N of M selected products during <dates>."
                 Never "Never Bought" (history starts Jan 2025).

Screens
-------
  Entry          manager: title, one line, Create Report, tabs Saved Reports /
                 Templates / Target Lists. Rep: Find Non-Buying Accounts, My
                 Saved Reports / My Templates / Shared With Me.
  Setup          1 Choose Products (Shopify Select Products pattern: search,
                 supplier -> brand -> family -> package -> category filters, a
                 supplier narrows the brands, checkbox rows with name first and
                 package + ProductID beneath, Show Selected, "Add Entire
                 Brand Family: X (N products)" as one rule, N selected, Cancel /
                 Add Products; Manage Products = the same dialog with the
                 current selection checked and "Adding N, Removing M" + Done;
                 removing a product that came from a group writes an
                 exclusion; the summary is one expandable "N Products
                 Selected"). 2 Choose Accounts (reps All My Reps / Selected
                 Reps picker that patches counts in place -- never a re-render
                 or a jump; district, territory, premise, town, chain, type,
                 specific accounts, upload; the activity default). 3 Choose
                 Dates & Report Type (type cards, preset, results level,
                 custom dates, requested vs effective vs coverage box,
                 baseline for lapsed). 4 Review & Generate (Zillow-style
                 stacked sections Products / Accounts / Report Type & Dates /
                 Data Coverage, each with a short summary and Edit, full lists
                 on request, problems beside their section, one Generate
                 Report button). Phones show "Step N of 4 · <name>" with dots,
                 not four labels.
  Results        title (Save, Export menu), criteria line + Edit Criteria,
                 distinct accounts / opportunities / reps / coverage, notices,
                 search + rep / premise / finding + view level (+ More Columns
                 for managers), then the rows. Manager: grouped by rep with
                 counts, table Account / Town / Missing Products / Last
                 Purchase / Action (+ optional Area, Premise, Chain, Type,
                 Last Kohler Purchase). Rep: compact rows (name, town +
                 CustomerID, finding, View Missing Products, Open Account) --
                 no rep name, no SKU dump. Phones: labelled rows.
                 "Open Account" carries the return (from= / fl=); coming back
                 restores filters and scroll (sessionStorage kdh_nb:<who>:*).
  Saves          Save Report = dated snapshot (results, resolved products,
                 periods, coverage, counts, generation time, rule version).
                 Save Template = criteria only (relative dates re-resolve;
                 rerunning never overwrites a snapshot). Save as Target List =
                 a snapshot shared with the chosen reps (each gets only their
                 own subset). Opening a saved row re-checks permissions
                 through RLS / the RPC.
  Exports        Download CSV (header rows with criteria, dates, coverage,
                 rule; then one row per account-product opportunity with a Rep
                 column first, sorted by rep; formula-like text is prefixed),
                 Download Excel (same rows with a heading row per rep, through
                 merchandising/xlsx-write.js), Export PDF (print view grouped
                 by rep, Save as PDF), Save as Target List. No financial
                 amounts anywhere.

Validation against the Encompass example (2026-10-08)
-----------------------------------------------------
Gavin's two Comparison exports for Dave Ehlers: a summary (36 accounts with
2026 cases; one Total row dropped) and a product export (644 dated rows, Jan 5 -
Oct 7, 2026; 23 accounts; 9 Lagunitas IPA / Little Sumpin' SKUs; one
parenthesized negative "(1.00)" at Portland Wine & Liquor, SKU 12908, 4/17/2026).
Reconciled against accounts/data/hist/dave-ehlers.json for the same 9 SKUs,
Jan - Sep 2026 (our last complete month): 21 of the 23 Encompass buyers are
buyers in our history; the other 2 (Deli Mart 41012, Burgundy Convenience
52040) bought ONLY in October, which is outside loaded coverage -- the page says
so instead of listing them as non-buyers of a period it cannot see; no account
is a buyer in our data that Encompass lacks. All 13 accounts absent from the
product export are non-buyers of every one of the 9 SKUs through September and
all 13 bought other Kohler products in the period (so the activity filter keeps
them). The Portland return nets April to -1 (not a purchase) while February's
+1 keeps the account a buyer -- consistent with Encompass' Buyer Count of 1.
Nothing from the example is hard-coded; scratchpad nb_test.mjs re-derives it.

Tests (scratchpad)
------------------
  nb_test.mjs     engine rules on synthetic data (combined vs per-product
                  gaps, restricted / unknown territories, Whole Foods, lapsed,
                  the returned month, date boundaries and incomplete coverage,
                  activity filter, by-brand level), the manager flow (family
                  rule, exclusion + restore, rep tick without a jump, requested
                  vs effective dates, review sections, results, the Encompass
                  reconciliation, CSV / Excel / menu, Save Report / Template /
                  Target List, back from an Account page, template rerun = new
                  snapshot, open from snapshot), scope (DM team, no assignment
                  = nobody, brand manager's pool), the rep flow (defaults,
                  no team controls, another rep requested = own route only,
                  shared list = own subset, own save never shared, wording),
                  preview read-only, layout at 375 / 390 / 430 / 820 / 1366 in
                  light + dark (no sideways scroll, nothing under 14px, the
                  phone step indicator, the product panel's action area).
  nb_smoke.mjs    screenshots of each screen.
  sql_nonbuy_test.sh  the migration on local Postgres 16 (13 checks: owner
                  rows, shared subset, rep limits, another manager refused).
  nb_stub.mjs     the in-memory stand-in for the table + RPCs (RLS-faithful).

Mobbin references (inspected through the Mobbin plugin)
-------------------------------------------------------
  Shopify Select Products 823f4ce6 and Manage Products 9fadbfbf (both found by
  id) -> the product dialog; Calendly Contacts (the screen id in the brief,
  222efb40, is not returned by the plugin's search -- sibling screens of the
  same Contacts page were inspected) -> the results toolbar + table; Zillow
  review screens (6f72137e likewise not returned; siblings aa311974 / d816822c
  inspected) -> Review & Generate.
