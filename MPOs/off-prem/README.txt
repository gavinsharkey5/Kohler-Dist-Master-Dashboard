Off-Prem MPO Tracker

Same warm barrel-wood + amber-beer + Kohler-blue visual theme as the
on-premise dashboard (see on-prem/index.html's :root CSS vars) --
matched 2026-08-05 so both dashboards read as one system. index.html's
<style> block is the only place that differs meaningfully from
on-prem's (plus off-prem's own extra classes: a 5-column KPI strip,
.table-scroll for the July New Belgium goals table, and
.pkg-group-row for its package-group drill-down) -- carry any future
on-prem theme tweak (color vars, hero banner, card/table treatment)
over to off-prem's <style> block too so they don't drift apart again.

Rep-level activity/Target Accounts display also mirrors on-prem's
identical cleanup (also 2026-08-05): collapsed-by-default Target
Accounts, and Repeat Buyer/Bought-in-Base-Period rows tucked behind a
collapsed "N Existing Accounts" dropdown instead of cluttering the
default view (existingAccountsBlockHtml()) -- see generate_2026-08.py's
own docstring for the full rundown, and carry future on-prem tweaks to
this pattern over the same way as the theme above.

Molson Coors' Target Accounts is PRODUCT-level, not county-level (added
2026-08-05, per Kohler's manager): since its 90-day-non-buy incentive is
scored per SKU, an account already carrying some Peroni/Banquet products
can still be a real target for the ones it's missing -- grouped by
product instead (groupTargetsByProduct(), reusing the same .tgt-county*
CSS/collapse pattern), so a rep sees exactly which product to sell in.
Corona Premier's Target Accounts is unaffected -- it's a plain placement
count with no per-SKU distinction, so it stays grouped by county
(groupTargetsByCounty()). targetsBlockHtml() picks whichever grouping
applies by checking for a Product field on the target rows.

Tracks each rep's progress toward the off-premise Monthly Program
Objectives. Each month's objectives are tracked on their own tab --
July 2026 (New Belgium / Wine & Spirits 2XO+Le Grand+Yave / Sapporo
Light / Famosa 7oz) and August 2026 (Constellation Corona Premier /
BBC Lytt / Molson Coors Peroni+Banquet / Wine & Spirits Le Grand
Noir+Leyenda+Green River) are entirely different programs, since
Kohler changes the MPO objectives month to month.

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
client-side" pattern (see index.html's tokens()/findCol()) so
index.html doesn't care whether a file came from a manual CSV parse
or a Snowflake sync.

To add a new month once its RDE exports are ready:
  1. Add a new generate_<MONTH_KEY>.py (copy the closest existing
     month's script as a starting point) that reads that month's CSVs
     and writes data/<MONTH_KEY>/*.json + sync_meta.json.
  2. In index.html, add an OBJECTIVES_<MONTH_KEY> array (see
     OBJECTIVES_2026_07 / OBJECTIVES_2026_08 near the top of the
     <script> for the supported shapes -- see "Objective types"
     below) and a matching MONTHS entry at the END of the array:
     {key:'<MONTH_KEY>', label:'<Month> 2026', dir:'data/<MONTH_KEY>/',
      objectives: OBJECTIVES_<MONTH_KEY>, tables: [...]}.
  3. Run the new generate_<MONTH_KEY>.py script.
  4. Commit and push. The new tab appears and becomes the default.

Objective types (index.html):
  'new_belgium'   July-only, bespoke -- joins a flat actuals export
                  against a long-format 90%-goals export (by rep +
                  product number, falling back to rep + normalized
                  product name) via buildNewBelgiumDataset(), with
                  package-group drill-downs (nbLineTable()/
                  groupNBLines()). Company-wide % of goal, not a
                  reps-at-goal count, drives its progress bar --
                  handled by a `o.key==='new_belgium'` special case in
                  objPct()/renderKPIs()/both render functions, since
                  no other objective (in any month) works this way.
  'placements'    Single metric, one file, one fixed per-rep target --
                  a rep's summed count either clears the bar or
                  doesn't. July's Wine & Spirits/Sapporo Light/Famosa
                  and August's Constellation Corona Premier all use
                  this (buildPlacementsDataset()).
  'new_accounts'  Single metric, one fixed per-rep target, but counts
                  rows flagged NEW_PLACEMENT=1 rather than summing a
                  count column (buildNewAccountsDataset()) -- used
                  internally by August's "dual" sub-targets (Molson
                  Coors, Wine & Spirits), not as a top-level objective
                  type in either month currently.
  'dual'          TWO OR MORE independent brand-family sub-targets
                  under ONE weighted objective (e.g. "4 New Peroni + 4
                  New Banquet", or "2 Le Grand + 2 Leyenda + 1 Green
                  River"), ALL of which must be hit for the objective
                  to count as achieved -- not a combined pool
                  (confirmed with Gavin, 2026-08-04). One raw JSON
                  file is split client-side by a brand-family column
                  (see each table's `dual`/`brandField`/`subs` config
                  in MONTHS) into N sub-datasets, each built with the
                  sub's own builder/target. Renders as N columns (rep
                  table) or N progress bars (rep view), so this scales
                  to any number of subs without code changes -- August's
                  Molson Coors (2 subs) and Wine & Spirits (3 subs)
                  both use this.
  'pct_of_base'   Per-rep VARIABLE target: each rep's target is
                  ceil(pct * their own distinct account-base size), not
                  a fixed number shared across reps. Two raw files are
                  joined client-side by buildPctOfBaseDataset() -- a
                  denominator file (one row per rep/account, account
                  size = count of DISTINCT customer numbers) and a
                  numerator file (one row per rep/account/product
                  carrying the tracked brand, again deduped by distinct
                  customer number). August's BBC Lytt (25% of account
                  base) is the only user of this so far.
  'photos'        Placeholder only (hasData:false) -- no iSellBeer
                  photo-count data source exists yet for any month.

"90-Day Non-Buy" new-placement classification (Molson Coors Peroni/
Banquet independently, and each Wine & Spirits brand family
independently -- per Kohler, 2026-08-04): a customer's row on a given
date is a NEW placement only if they have NO purchase of that brand
before NEW_BUYER_WINDOW_START (i.e. in the prior ~3 months) AND DO
have a purchase of it in the current month. A customer who bought
before the window and buys again in it is a regular repeat placement
and does NOT count. Same date-based, per-transaction-row approach as
on-prem's August classification (see on-prem/generate_2026-08.py) --
every transaction row is kept in the output, NEW_PLACEMENT is set to
1 on exactly the customer's first qualifying row and 0 on every other
row for that customer+brand, so a repeat purchase never double-counts.
See generate_2026-08.py's classify_new_placements() -- it's
brand-scoped (the `brand_key` argument), so Molson Coors classifies
Peroni and Coors/Banquet independently, and Wine & Spirits classifies
Le Grand Noir, Leyenda 1925, and Bardstown Green River independently
per customer.

Files:
  July 2026:
    new_belgium_90goals.csv   RDE "New Belgium 90% Goals" export: Sales
                              Rep Name, Product #, Product Name, Package
                              Type, Goal90 -- each rep's assigned 90%
                              distribution goal, one row per product.
    new_belgium_actuals.csv  RDE "New Belgium May-July Distribution
                              Report": Sales Rep Name, Package Group,
                              Product Num Name, Placements. index.html
                              joins this against the goals file itself
                              -- generate.py does NOT pre-merge them.
    sapporo_light.csv        RDE "Sapporo (5) Sapporo Light Placements"
                              export.
    wine_spirits_2xo.csv     RDE "Wine & Spirits (2XO/Le Grand
                              Noir/YaVe) Placements" export.
    famosa.csv                RDE "Famosa 7oz Urban Market Placements"
                              export.
    generate.py               Rebuilds July's five JSON files.

  August 2026 (see generate_2026-08.py's own docstring for full detail):
    corona_premier_suitcase.csv       RDE "5 Corona Premier Suitcase
                                        Placements" export -- August-only
                                        window. Has NO per-row Date
                                        column (RDE doesn't track one for
                                        this report), so generate.py
                                        stamps a placeholder DATE (window
                                        start) on every row purely so the
                                        client-side placements builder
                                        (which requires a date column to
                                        exist) doesn't reject the file.
    molson_coors_off_peroni_banquet.csv
                                       RDE "Molson Coors OFF (4) New
                                        Peroni Placements (4) New Banquet
                                        Placements 90 Day Non Buy" export.
                                        As of 2026-08-05, per Kohler's
                                        manager, this dropped its Brand
                                        Family column for one row per
                                        PRODUCT (Product Num/Product
                                        Name) -- new-placement
                                        classification is now keyed on
                                        Product Num, NOT brand, so a
                                        second, different Peroni SKU at
                                        an account that already carries
                                        one Peroni SKU still counts as a
                                        new placement. derive_brand_family()
                                        recovers the Peroni/Banquet
                                        grouping from the product name
                                        for display and Target Accounts
                                        only -- see generate_2026-08.py's
                                        docstring.
    wine_spirits_legrand_leyenda_greenriver.csv
                                       RDE "5 New Placements -- (2) Le
                                        Grand Wines (2) Leyenda (1) Green
                                        River 50 MLs" export -- Brand
                                        Family is "Le Grand Noir",
                                        "Leyenda 1925", or "Bardstown
                                        Green River".
    bbc_lytt_distro.csv               RDE "BBC -- Achieve distro Lytt
                                        25% of Account Base" export: one
                                        row per rep/account/product
                                        carrying Lytt, no Date column
                                        (distro snapshot, not a
                                        transaction log) -- this is the
                                        NUMERATOR for the pct_of_base
                                        objective.
    sales_reps_customer_base.csv      RDE "Sales Reps: Customer Base
                                        Core Territory" export: one row
                                        per rep/account/shipping-address
                                        (so some accounts appear more
                                        than once). Full off-prem book
                                        (every county a rep covers).
                                        Was BBC Lytt's denominator until
                                        2026-08-07, when the user
                                        confirmed Lytt is ALSO core-
                                        territory-only (see
                                        sales_reps_customer_base_core.csv
                                        below) -- kept and still built
                                        (mpo_sales_reps_customer_base.json)
                                        as a general full-book reference,
                                        but no objective reads it anymore.
    sales_reps_customer_base_core.csv RDE "Sales Reps: Customer Base
                                        Core Off Prem" export -- added
                                        2026-08-05. Narrower than the
                                        file above: only the counties
                                        where Corona Premier and Molson
                                        Coors Peroni/Banquet are
                                        authorized to sell (per Kohler,
                                        2026-08-05), pre-scoped by RDE
                                        (no county whitelist needed in
                                        code, unlike on-prem). Drives
                                        Target Accounts for Corona
                                        Premier/Molson Coors -- see
                                        generate_2026-08.py's own
                                        docstring for the full field
                                        list and build_targets() logic --
                                        AND, as of 2026-08-07 (confirmed
                                        with the user: Lytt can only be
                                        sold in this same core territory,
                                        correcting the earlier "Lytt
                                        isn't territory-restricted"
                                        assumption), BBC Lytt's account-
                                        base DENOMINATOR too, via
                                        build_sales_reps_customer_base_core()
                                        -> mpo_sales_reps_customer_base_core.json.
                                        Reps with zero core-territory
                                        accounts (Alex Rodriguez, Allison
                                        Scott, Andrew Lundy, Hakan Sadik
                                        as of this refresh) simply have no
                                        row in that JSON, which the
                                        existing pct_of_base rendering
                                        already treats as "no data" --
                                        greyed-out .rep-row-nodata row in
                                        the objective table, "No data yet"
                                        in the rep view -- no extra code
                                        needed for that. Wine & Spirits
                                        gets no Target Accounts since it's
                                        sold in every county (same
                                        precedent as on-prem's
                                        Yave/Leyenda).
    generate_2026-08.py               Rebuilds the eight JSON files
                                        above (six datasets + two
                                        Target Accounts files).

  index.html   The page itself (shared by every month).

Normally each month's data is refreshed automatically by
.github/workflows/snowflake-sync.yml running sync_snowflake_data.py --
that workflow's schedule is currently paused (see the workflow file),
its output paths still target the old flat pre-month-tabs data/
folder, and it was only ever wired up for July's five Snowflake
tables anyway. August's objectives don't have Snowflake tables yet, so
it's manual-CSV-only for now.

To refresh July manually:
  1. Save the new exports over new_belgium_90goals.csv /
     new_belgium_actuals.csv / sapporo_light.csv / wine_spirits_2xo.csv
     / famosa.csv (same column headers).
  2. Run: python3 generate.py.
  3. Commit and push.

To refresh August manually:
  1. Save the new exports over corona_premier_suitcase.csv /
     molson_coors_off_peroni_banquet.csv /
     wine_spirits_legrand_leyenda_greenriver.csv / bbc_lytt_distro.csv /
     sales_reps_customer_base.csv / sales_reps_customer_base_core.csv
     (same column headers).
  2. Run: python3 generate_2026-08.py -- it prints how many new
     placements/rows qualified out of how many were exported, worth a
     sanity check against what you'd expect.
  3. Commit and push.

Target Accounts (added 2026-08-05): a per-rep "who to go after"
prospect list -- accounts in a rep's OWN off-premise core territory
that don't carry the brand yet -- shown as a collapsed amber toggle
under that rep's activity table on both the Corona Premier and Molson
Coors Peroni/Banquet cards (rep view and objective view alike). Same
groupTargetsByRep()/targetsBlockHtml() pattern as on-prem's Angry
Orchard/Molson Coors (see on-prem/index.html), fed by
mpo_targets_corona_premier.json and mpo_targets_molson_coors.json
(generate_2026-08.py's build_targets(), scoped by
sales_reps_customer_base_core.csv -- see that file's entry above).
Wine & Spirits has no Target Accounts card since it isn't
territory-restricted, and BBC Lytt already IS a "which of your
accounts don't carry it yet" objective by construction, so it doesn't
need a separate Target Accounts block.

Note (2026-08-05): as of that refresh, RDE started splitting Molson
Coors' and Wine & Spirits' "Placement Count"/"Cases" columns into TWO
date-windowed columns on the same export (e.g. "Placement Count
5/1/2026 - 7/31/2026" AND "Placement Count 8/1/2026 - 8/31/2026")
instead of one combined column -- each row is only ever populated in
whichever of the two matches its own Date. generate_2026-08.py's
sum_cols() handles this by summing every column sharing the prefix
(treating blank as 0) rather than find_col()'s old single-match
lookup, so it works whether RDE exports one combined column or several
split ones. Corona Premier and BBC Lytt haven't split (still one
column each) but would also be handled fine if they start.
