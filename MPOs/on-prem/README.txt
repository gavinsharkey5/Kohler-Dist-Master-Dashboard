On-Prem MPO Tracker

Tracks each rep's progress toward the on-premise Monthly Program
Objectives. Each month's objectives are tracked on their own tab --
July 2026 (Carbliss / Sapporo NA / Wine & Spirits) and August 2026
(Boston Beer Angry Orchard / Molson Coors Peroni+Banquet / Wine &
Spirits Yave+Leyenda) are entirely different programs, since Kohler
changes the MPO objectives month to month.

Month tabs: data lives in a per-month snapshot folder,
data/<MONTH_KEY>/ (e.g. data/2026-07/, data/2026-08/), and index.html
shows a tab bar so every past month stays permanently viewable --
opening a new month's tab does not touch or overwrite an older one.
The MOST RECENTLY ADDED entry in the MONTHS array (index.html) is the
default/active tab on page load (MONTHS[MONTHS.length-1]), so append
new months to the END of that array, not the start.

Because each month's objectives are usually different brands with
different rules, EACH MONTH GETS ITS OWN generate_<MONTH_KEY>.py
script (generate.py is specifically July's; generate_2026-08.py is
August's) rather than one script branching on month -- the
classification logic rarely has anything in common between two
months' objectives. All of them write to data/<MONTH_KEY>/ and follow
the same "raw transaction rows + a computed flag, fuzzy-matched
client-side" pattern (see index.html's tokens()/findCol() and the
Carbliss-style classification below) so index.html doesn't care
whether a file came from a manual CSV parse or a Snowflake sync.

To add a new month once its RDE exports are ready:
  1. Add a new generate_<MONTH_KEY>.py (copy the closest existing
     month's script as a starting point) that reads that month's CSVs
     and writes data/<MONTH_KEY>/*.json + sync_meta.json.
  2. In index.html, add an OBJECTIVES_<MONTH_KEY> array (see
     OBJECTIVES_2026_07 / OBJECTIVES_2026_08 near the top of the
     <script> for the two supported shapes -- see "Objective types"
     below) and a matching MONTHS entry at the END of the array:
     {key:'<MONTH_KEY>', label:'<Month> 2026', dir:'data/<MONTH_KEY>/',
      objectives: OBJECTIVES_<MONTH_KEY>, tables: [...]}.
  3. Run the new generate_<MONTH_KEY>.py script.
  4. Commit and push. The new tab appears and becomes the default.

Objective types (index.html):
  'new_accounts'  Single metric, one file, one target -- a rep either
                  qualifies N times or doesn't. Carbliss, Sapporo NA,
                  and August's Angry Orchard all use this (built by
                  buildNewAccountsDataset(), which fuzzy-matches a
                  "new buyer"/"is new"/"new placement" flag column).
  'placements'    Single metric, no new-vs-repeat distinction, just a
                  summed count column (July's Wine & Spirits).
  'buyer_count'   Single metric, no new-vs-repeat distinction, but
                  counts DISTINCT buying accounts rather than summing
                  a count column (August's Wine & Spirits Yave/
                  Leyenda -- built by buildBuyerCountDataset()).
  'dual'          TWO independent brand-family sub-targets under ONE
                  objective (e.g. "4 New Peroni + 4 New Banquet"), that
                  BOTH must be hit for the objective to count as
                  achieved -- not a combined pool (confirmed with
                  Gavin, 2026-08-04). One raw JSON file is split
                  client-side by a brand-family column (see each
                  table's `dual`/`brandField`/`subs` config in MONTHS)
                  into two sub-datasets, each built with the sub's own
                  builder/target. August's Molson Coors and Wine &
                  Spirits both use this.
  'photos'        Placeholder only (hasData:false) -- no iSellBeer
                  photo-count data source exists yet for any month.

Each rep's customer-line drill-down (lineTableNewAccounts()) collapses to
ONE row per customer -- not one per transaction -- and only shows a date
when that customer has activity in the ACTIVE month (isActiveMonthDate());
pure prior-month purchase history (kept only so the 90-day-non-buy
classifier has something to check) shows no date at all, just a "Regular
Buyer" or "—" status. Per Gavin, 2026-08-04: dates are "only for you to
denote new buyers and the specific metrics we track", not a full
transaction log.

Target Accounts (Angry Orchard, Molson Coors Peroni/Banquet only -- per
Gavin, 2026-08-04, Wine & Spirits' Yave/Leyenda are sold in every county
so skip the territory filter there): a collapsed-by-default "who to go
after" list under each rep, for objectives whose table config has a
`targetsFile` (see MONTHS in index.html). Built server-side by
generate_2026-08.py's build_targets() -- a rep's ON-PREMISE-only account
base (per Kohler, 2026-08-05, via the customer-base export's Premise
column -- this dashboard is on-prem, so off-premise accounts are NEVER
valid targets here, full stop) MINUS customers who already carry the
brand MINUS customers outside ALLOWED_TARGET_COUNTIES -- per Kohler,
2026-08-06, these on-premise accounts are only ever sold in Bergen,
Passaic, Passaic-FF, Morris 1, Morris 3, and Sussex; every other county
(Essex/Hudson/Union/Morris 2, Middlesex, and the "Sales" placeholder some
accounts fall back to) is excluded outright, not flagged. Each account's
county comes from the whitelist workbook's "Customers Table (Enc)" sheet,
not the CSV's own Area column -- the CSV's Area falls back to "Sales" for
accounts missing geographic data on that export path, and that sheet
resolves essentially all of them to a real county instead (load_
customer_area_overrides() in generate_2026-08.py). Rendered by
targetsBlockHtml()/groupTargetsByRep() in index.html -- shown for EVERY
rep with prospects, even one with zero current-month activity (that's
often exactly the rep who most needs the list), via the `hasTargets`
check alongside the usual `hasAny`/`r` activity checks in both
renderRepView() and renderObjectiveView().

"90-Day Non-Buy" new-placement classification (Angry Orchard, and
Peroni/Banquet independently within Molson Coors -- per Kohler,
2026-08-04): a customer's row on a given date is a NEW placement only
if they have NO purchase of that brand before NEW_BUYER_WINDOW_START
(i.e. in the prior ~3 months) AND DO have a purchase of it in the
current month. A customer who bought before the window and buys again
in it is a regular repeat placement and does NOT count. Same
date-based, per-transaction-row approach as July's Carbliss
classification (see generate.py) -- every transaction row is kept in
the output, NEW_PLACEMENT is set to 1 on exactly the customer's first
qualifying row and 0 on every other row for that customer+brand, so a
repeat purchase never double-counts. See
generate_2026-08.py's classify_new_placements() -- it's brand-scoped
(the `brand_key` argument), so Molson Coors classifies Peroni and
Coors/Banquet completely independently per customer.

Files:
  July 2026 (see generate.py's own docstring for full detail):
    carbliss_new_buyers.csv, sapporo_na_new_buyers.csv,
    wine_spirits_placements.csv, generate.py

  August 2026 (see generate_2026-08.py's own docstring for full detail):
    angry_orchard_new_lines.csv       RDE "2 New Angry Orchard Draft
                                        Lines" export.
    molson_coors_peroni_banquet.csv   RDE "Molson Coors ON (4) New
                                        Peroni Placements (4) New
                                        Banquet Placements 90 Day Non
                                        Buy" export -- Brand Family is
                                        "Peroni" or "Coors" ("Coors" =
                                        the Banquet objective's raw
                                        brand label in RDE).
    wine_spirits_yave_leyenda.csv     RDE "2 Yave Buying Accounts 2
                                        Leyenda Buying Accounts" export
                                        -- August-only window (no prior
                                        months), since this objective is
                                        a plain buyer count, not a
                                        new-vs-repeat classification.
                                        As of the 2026-08-04 refresh
                                        this file has zero Leyenda rows
                                        (no Leyenda buyers yet that
                                        early in the month) -- that's
                                        expected, not a data bug.
    sales_reps_customer_base.csv      RDE "Sales Reps: Customer Base Core
                                        Territory" export: Sales Rep
                                        Assigned, Customer Num, Customer
                                        Name, Shipping Address, City,
                                        Area, Premise, Cases -- one row per
                                        rep/account/shipping-address (so
                                        some accounts appear more than
                                        once); the Target Accounts feature
                                        dedupes by Customer Num and keeps
                                        only Premise=="On Premise" rows
                                        (added 2026-08-05). Also has ~4
                                        rows for non-rep entities (e.g.
                                        "Default", "Office Tell Sell") not
                                        in ROSTER -- harmless, they're just
                                        never looked up since rendering
                                        only iterates ROSTER.
    kohler_brands_whitelist_blacklist.xlsx
                                       Kohler's per-brand-family,
                                        per-county sell authorization
                                        workbook. generate_2026-08.py only
                                        reads its "Customers Table (Enc)"
                                        tab (Customer ID -> Distribution
                                        Area, added 2026-08-05) -- the
                                        authoritative county per account,
                                        used instead of the CSV's own Area
                                        column (see
                                        load_customer_area_overrides()).
                                        The actual county eligibility
                                        check is the hardcoded
                                        ALLOWED_TARGET_COUNTIES constant
                                        (Bergen/Passaic/Passaic-FF/Morris 1/
                                        Morris 3/Sussex, per Kohler,
                                        2026-08-06), not this workbook's
                                        "Master - US vs THEM" tab. Only
                                        used for Target Accounts (Angry
                                        Orchard, Peroni, Coors/Banquet);
                                        Wine & Spirits doesn't need it
                                        since Yave/Leyenda are sold in
                                        every county.
    generate_2026-08.py               Rebuilds the five JSON files above
                                        (three MPO datasets + two Target
                                        Accounts prospect lists).

  index.html   The page itself (shared by every month).

Normally each month's data is refreshed automatically by
.github/workflows/snowflake-sync.yml running sync_snowflake_data.py --
that workflow's schedule is currently paused (see the workflow file),
its output paths still target the old flat pre-month-tabs data/
folder, and it was only ever wired up for July's three Snowflake
tables anyway. August's objectives don't have Snowflake tables yet, so
it's manual-CSV-only for now.

To refresh July manually:
  1. Save the new exports over carbliss_new_buyers.csv /
     sapporo_na_new_buyers.csv / wine_spirits_placements.csv (same
     column headers).
  2. Run: python3 generate.py -- it prints how many customers
     qualified as new buyers out of how many appeared in the export,
     worth a sanity check against what you'd expect.
  3. Commit and push.

To refresh August manually:
  1. Save the new exports over angry_orchard_new_lines.csv /
     molson_coors_peroni_banquet.csv / wine_spirits_yave_leyenda.csv /
     sales_reps_customer_base.csv (same column headers), and
     kohler_brands_whitelist_blacklist.xlsx if Kohler sends an updated
     territory file.
  2. Run: python3 generate_2026-08.py -- requires openpyxl (`pip install
     openpyxl`) to read the whitelist workbook. Prints how many new
     placements qualified out of how many customer+brand pairs appeared
     in each export, plus how many Target Accounts prospects were found
     per brand and how many fell in unmapped ("Unverified") territory.
  3. Commit and push.
