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
                  DISPLAYED AS PENETRATION as of 2026-08-25, per Gavin
                  ("change the lytt accounts from 14/10 to % penetration.
                  if the rep is >= 25% they are at goal"): the headline
                  number is qualifying/base as a percent ("35%", with the
                  raw "14 of 40 accounts" as the subline and its own
                  Lytt Accounts column in the objective table), and the
                  bar/over-badge measure that percentage against the 25%
                  goal rather than the count against ceil(). This is a
                  DISPLAY change only -- who is at goal did not move,
                  because for an integer count qualifying >=
                  ceil(pct * base) is exactly qualifying/base >= pct
                  (verified rep-by-rep against the 8/25 data, 0
                  mismatches). r.target is still what the at-goal flag
                  is scored on, so the flag and the percentage can never
                  disagree; keep it that way rather than re-testing
                  penetration >= 25 separately, which would reintroduce
                  float-rounding edge cases at exactly 25%. Percentage
                  GAPS render as points ("+10 pts over"), never "+10%"
                  -- see fmtPen()/fmtPts().
  'photos'        Placeholder only (hasData:false) -- no iSellBeer
                  photo-count data source exists yet for any month.

"90-Day Non-Buy" new-placement classification (Molson Coors Peroni/
Banquet and Wine & Spirits Le Grand Noir/Leyenda 1925/Bardstown Green
River): a customer's row on a given date is a NEW placement only if
they have NO purchase of that brand/product before
NEW_BUYER_WINDOW_START (i.e. in the prior ~3 months) AND DO have a
purchase of it in the current month. A customer who bought before the
window and buys again in it is a regular repeat placement and does NOT
count. Same date-based, per-transaction-row approach as on-prem's
August classification (see on-prem/generate_2026-08.py) -- every
transaction row is kept in the output, NEW_PLACEMENT is set to 1 on
exactly the customer's first qualifying row and 0 on every other row
for that customer+key, so a repeat purchase never double-counts.

See generate_2026-08.py's classify_dual_period() -- it's scoped by the
`brand_key` argument. As of 2026-08-24 BOTH objectives key on Product
Num, i.e. per SKU:
  Molson Coors    Product Num (fixed to product-level 2026-08-05 per
                  Kohler's manager) -- a second, different Peroni SKU at
                  an account already carrying one Peroni SKU counts as a
                  new placement.
  Wine & Spirits  Product Num as of 2026-08-24, per Gavin: "if an account
                  did not buy a product in the last 90 days from August
                  then it counts as a new placement... we want to change
                  this to placements." An account that already carried
                  Leyenda 1925 Blanco DOES now generate a second new
                  placement by adding Leyenda 1925 Reposado in August --
                  those two count as 2, not 1.
                  This one has flip-flopped, so check the history before
                  touching it: Brand Family originally, Product Num on
                  2026-08-12, back to Brand Family on 2026-08-17, and
                  Product Num again on 2026-08-24. The last change was
                  asked for directly and in detail (not inferred from
                  Molson Coors), so it stands until Gavin says otherwise.
                  Switching it moved the month from 44 to 73 new
                  placements and took reps hitting all three sub-targets
                  from 0 to 1.
Wine & Spirits' Brand Family column still splits the three sub-targets
(Le Grand Noir/Leyenda 1925/Green River) apart in the UI -- that job is
unchanged; only the new-vs-existing classification moved to Product Num.
The client side needed no change: buildNewAccountsDataset() already
counts flagged ROWS (so two SKUs at one account count twice), and
lineTableNewAccounts() already keys its drill-down on customer+product
whenever the source carries a product column.

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
    generate_2026-08.py               Rebuilds the nine JSON files
                                        above (six datasets + three
                                        Target Accounts files).

  index.html   The page itself (shared by every month).

Disruptors – (8) Lytt POS Items Pics (went live 2026-08-19, per Gavin):
the August photos objective, fed by three iSellBeer photo exports saved
under stable names in this folder (they are .xlsx because only the
workbook carries the clickable photo hyperlinks -- a CSV export loses
them, same reason as the display-auction tracker):
  lytt_pos_displays.xlsx   iSellBeer Report_NN.xlsx (Lytt-filtered)
  lytt_pos_promos.xlsx     iSellBeer Promos_Report_N.xlsx
  lytt_pos_pods.xlsx       iSellBeer PODS_Report_N.xlsx (only its few
                           photo-bearing rows are used; the rest of the
                           PODS export is a distro list with no photos).
                           Windowed and dated as of PODS_Report_12 -- see
                           the refresh note below.
  generate_lytt_pos.py     Rebuilds data/2026-08/mpo_lytt_photos.json
                           from the three files above. Separate from
                           generate_2026-08.py (different source system,
                           different cadence); does not touch
                           sync_meta.json.
Rules (all confirmed with Gavin 2026-08-19): SALES REPS ONLY (associates
are filtered out by the exports' Role column; iSellBeer name spellings
are canonicalized to the RDE roster names -- James Heaney->Jim Heaney,
Matthew Powierski->Matt Powierski, Daniel La Gala->Dan Lagala, etc.);
every line must carry a clickable photo link; and the 8-pic target
counts DISTINCT PHOTOS, not rows -- one photo showing five Lytt items is
ONE pic ("each distinct photo", chosen over row-counting). index.html's
buildPhotosDataset()/lineTablePhotos() render it like the display
auction tracker: rep -> one row per photo with a View Photo link and
every Lytt item pictured in it.

To refresh (2026-08-21): those three .xlsx files are the cumulative
ARCHIVE of this objective, not a scratch copy of the latest pull. Gavin
pulls iSellBeer one week at a time to keep each upload small (see the repo
CLAUDE.md), so a fresh Report_NN.xlsx normally covers only its own window
-- Report_45.xlsx, the 2026-08-21 pull, held 12 rows dated 08/20-08/21
against 113 already-published rows from 08/06-08/19 -- and saving it over
lytt_pos_displays.xlsx would have silently dropped every earlier photo.
So MERGE a partial export rather than overwriting:
  python3 generate_lytt_pos.py --merge-displays Report_NN.xlsx
  python3 generate_lytt_pos.py --merge-promos Promos_Report_N.xlsx
  python3 generate_lytt_pos.py --merge-pods PODS_Report_N.xlsx
Any of these unions the incoming rows into the matching stable workbook
(merge_export(): deduped on the columns the archive already had, ignoring
the "#" counter where the export has one, re-sorted newest-first, "#"
renumbered, photo hyperlinks preserved, the Filters tab's date span
widened to cover both windows) and then rebuilds the JSON
as usual -- so the JSON stays a purely derived artifact that can always be
rebuilt from the workbooks. Re-merging an export already applied is a
no-op, and it warns if a weekday falls between the last published row and
the export's first new one, since a photo submitted in that gap is not on
the board and won't arrive on its own. Only save an export straight over a
stable filename when it covers the WHOLE tracked period (08/01/2026
onward).

PODS used to be that exception -- an undated full snapshot, safe to
overwrite -- but PODS_Report_12 (2026-08-24) arrived as a ONE-DAY windowed
pull carrying a new Date/Time column, and overwriting with it would have
dropped the 7 photo rows already published from 08/01-08/19. So PODS merges
like the other two now (--merge-pods); do not overwrite lytt_pos_pods.xlsx
again unless a pull genuinely spans the whole month. merge_export() matches
columns by HEADER NAME rather than position, so that added Date/Time was
appended to the archive and left blank on the rows published before it
existed (the dashboard renders a missing date as an em dash); rows carrying
a date sort newest-first and the undated older ones stay put below them. A
column DISAPPEARING from an export is still treated as a format regression
and stops the merge rather than blanking the archive. Then commit and
push.

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

Target Accounts (added 2026-08-05, extended to BBC Lytt 2026-08-10): a
per-rep "who to go after" prospect list -- accounts in a rep's OWN
off-premise core territory that don't carry the brand yet -- shown as
a collapsed amber toggle under that rep's activity table on the
Corona Premier, Molson Coors Peroni/Banquet, and BBC Lytt cards (rep
view and objective view alike). Same groupTargetsByRep()/
targetsBlockHtml() pattern as on-prem's Angry Orchard/Molson Coors
(see on-prem/index.html), fed by mpo_targets_corona_premier.json,
mpo_targets_molson_coors.json, and mpo_targets_bbc_lytt.json
(generate_2026-08.py's build_targets(), scoped by
sales_reps_customer_base_core.csv -- see that file's entry above).
Wine & Spirits has no Target Accounts card since it isn't
territory-restricted. BBC Lytt's Target Accounts sits alongside its
existing "Lytt Accounts" list (lineTableLytt() -- accounts that
ALREADY carry Lytt, grouped by customer) rather than replacing it: the
"Lytt Accounts" list shows progress made, Target Accounts shows what's
left to reach 25% of the account base. already_carrying() reads BBC
Lytt's numerator export by its "Customer ID" column (id_col param --
every other Target Accounts source uses "Customer Num") since
bbc_lytt_distro.csv names that column differently.

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
