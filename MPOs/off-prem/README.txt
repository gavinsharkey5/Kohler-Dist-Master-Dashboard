Off-Prem MPO Tracker

Same Kohler Distributing navy theme as the on-premise dashboard (see
on-prem/index.html's :root CSS vars) -- matched 2026-08-05 so both
dashboards read as one system, and re-themed together 2026-09-01 from
the original warm barrel-wood browns to navy, per Gavin ("black or dark
blue... Kohler Distributing color scheme"). The Incentive Tracker and
the tap tracker carry the identical palette; keep all four in sync. index.html's
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
Light / Famosa 7oz), August 2026 (Constellation Corona Premier /
BBC Lytt / Molson Coors Peroni+Banquet / Wine & Spirits Le Grand
Noir+Leyenda+Green River) and September 2026 (Constellation Corona
Gaintain / Molson Coors Keystone Ice / Molson Coors Fever Tree /
Wine & Spirits any brand / POS cooler door stickers) are entirely
different programs, since Kohler changes the MPO objectives month to
month.

Month tabs: data lives in a per-month snapshot folder,
data/<MONTH_KEY>/ (e.g. data/2026-07/, data/2026-08/, data/2026-09/), and index.html
shows a tab bar so every past month stays permanently viewable --
opening a new month's tab does not touch or overwrite an older one.
The MOST RECENTLY ADDED entry in the MONTHS array (index.html) is the
default/active tab on page load (MONTHS[MONTHS.length-1]), so append
new months to the END of that array, not the start.

Because each month's objectives are usually different brands with
different rules, EACH MONTH GETS ITS OWN generate_<MONTH_KEY>.py
script (generate.py is specifically July's, generate_2026-08.py
August's, generate_2026-09.py September's) rather than one script
branching on month -- the classification logic rarely has anything in
common between two months' objectives. All of them write to
data/<MONTH_KEY>/ and follow
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
                  MINIMUM SKUs as of 2026-08-26, per Gavin ("only count
                  the account if they have AT LEAST 3 Lytt skus. anything
                  under this does not qualify"): an account in the
                  numerator only counts toward penetration once it
                  carries minSkus DISTINCT products -- set per table in
                  MONTHS (BBC Lytt: minSkus:3), omit it and any carrying
                  account counts, as before. Distinct PRODUCTS, not rows:
                  the same SKU on three lines is one SKU. This dropped 12
                  of the 136 carrying accounts on the 8/26 data and took
                  reps at goal from 11 to 9 (Mike Ast 29.0% -> 16.1% and
                  Javier Melo 27.6% -> 17.2% fell below 25%).
                  Under-threshold accounts are deliberately NOT filtered
                  out of the numerator JSON or the drill-down -- an
                  account already carrying 2 SKUs is the cheapest one a
                  rep can convert, so lineTableLytt() lists them under
                  their own "N accounts carrying Lytt but under 3 SKUs"
                  heading with how many more each needs. They just don't
                  count. Note this leaves them out of Target Accounts too
                  (already_carrying() still treats any Lytt row as
                  carrying), which is why that drill-down section matters
                  -- it is the only place a 1-2 SKU account appears.
  'new_placements'
                  September's Fever Tree (10) and Wine & Spirits (5).
                  Same 90-day-non-buy question as 'new_accounts', but
                  read off RDE's TWO WINDOWED COLUMNS rather than by
                  walking dates, and scored in PLACEMENTS rather than
                  qualifying rows: Fever Tree's export is ACCOUNT-level,
                  so one newly-opened account carrying 6 Fever Tree SKUs
                  is 6 placements toward the 10, not 1. Wine & Spirits'
                  is product-level with every current value 1.00, so
                  there rows and placements are the same number.
                  buildNewPlacementsDataset() / lineTableNewPlacements()
                  -- the drill-down's two middle columns are base-period
                  and this-month PLACEMENT COUNTS, not dates.
                  As of the 2026-09-04 exports these two sources are
                  TRANSACTION LOGS (one row per load sheet date), not the
                  pre-aggregated one-row-per-key shape they started as,
                  so generate_2026-09.py folds a key's rows together
                  before classifying and the JSON the client reads is
                  still one row per key. See "SEPTEMBER'S FEVER TREE AND
                  WINE & SPIRITS EXPORTS CHANGED SHAPE" below -- the
                  client is unaffected, but the generator very much is.
  'pct_of_goal'   Per-rep VARIABLE target measured against the rep's own
                  PRIOR-YEAR result: September's Constellation "30%
                  Corona Gaintain Distro". Sibling of 'pct_of_base' --
                  same "every rep gets a different number" idea, with
                  last fall's distribution as the denominator instead of
                  an account base. Per Gavin (2026-09-02): "their goals
                  is the distribution (placements) made from 9/1/2025 -
                  11/30/2025. the 1st column." One file carries both
                  columns per rep/product, so nothing is joined
                  (buildPctOfGoalDataset()). NOTE this objective runs
                  9/1 - 11/30/2026 -- three months, not one -- so it
                  keeps accruing on September's tab after the other four
                  close out on 9/30; partial progress all month is
                  expected and is not a data problem.
  'photos'        Placeholder only when hasData:false -- July's
                  Disruptors and September's POS cooler door stickers
                  have no iSellBeer export yet. August's Lytt POS pics
                  objective is the one with real data (see below).

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

  September 2026 (see generate_2026-09.py's own docstring for full detail):
    constellation_corona_gaintain.csv RDE "Constellation Corona Gaintain
                                        FALL 2026 OFF w/ Goals" export:
                                        Sales Rep Assigned, Product Name,
                                        and TWO placement columns --
                                        9/1/2025-11/30/2025 (last fall)
                                        and 9/1/2026-11/30/2026 (this
                                        fall). The FIRST column is the
                                        goal source: each rep's target is
                                        30% of their OWN prior-fall
                                        number (per Gavin, 2026-09-02).
                                        RDE gives the same Product Name
                                        to more than one SKU, so lines are
                                        aggregated by name -- rep totals
                                        are unaffected.
    keystone_ice_24oz.csv             RDE "KEYSTONE ICE 24 OZ CANS ARE
                                        BACK SEPT 2026" export: one row
                                        per rep/account/purchase with a
                                        Date and a Buyer Count. Its own
                                        window is 8/1/2026-9/30/2026 (an
                                        Aug-Sept push, and RDE built the
                                        export that way), so EVERY row in
                                        it counts toward penetration --
                                        scoring September's rows alone
                                        would ignore two thirds of the
                                        window RDE measured. Buying
                                        accounts are counted DISTINCT
                                        (buildPctOfBaseDataset() dedupes
                                        on customer number), so three
                                        purchases at one store is one
                                        buying account. Numerator for the
                                        40% pct_of_base objective; no
                                        minSkus bar, since Keystone Ice
                                        24 oz is a single SKU (product
                                        622).
    molson_coors_fever_tree.csv       RDE "Molson Coors - Fever Tree (10)
                                        New Placements" export -- a
                                        6/1-8/31 base column and a
                                        9/1-9/30 current column, its only
                                        Brand Family being Fever Tree, so
                                        it is ACCOUNT-level with no SKU
                                        detail. New placement = current
                                        populated, base blank. Counted in
                                        PLACEMENTS (the current column's
                                        value, 1-19 per account), not
                                        rows. As of 2026-09-04 it carries
                                        a Load Sheet Date and repeats an
                                        account once per load sheet; it
                                        dropped "Placement Count
                                        Percentage Total". See "EXPORTS
                                        CHANGED SHAPE" below.
    wine_spirits_new_placements.csv   RDE "Wine & Spirits (5) New
                                        Placements Any Brand" export --
                                        same two windows, but
                                        PRODUCT-level (Product Num Name +
                                        Brand Family), and every current
                                        value is 1.00, so a key and a
                                        placement are the same thing.
                                        "Any brand" means no sub-targets:
                                        it is a single 'new_placements'
                                        objective, not a 'dual' like
                                        August's. Same 2026-09-04 Load
                                        Sheet Date change as Fever Tree
                                        -- the key is now
                                        rep+account+SKU across several
                                        rows. See "EXPORTS CHANGED SHAPE"
                                        below.
    sales_reps_customer_base_core.csv Reused unchanged from August (see
                                        its entry above) as Keystone Ice's
                                        account-base DENOMINATOR and as
                                        the scope for both Target Accounts
                                        lists. Keystone and Fever Tree are
                                        Molson Coors brands sold in the
                                        same core off-premise counties.
                                        Gavin did not send a fresh core
                                        base with September's exports --
                                        re-pull and overwrite it if the
                                        territory has moved.
    generate_2026-09.py               Rebuilds the seven JSON files above
                                        (five datasets + two Target
                                        Accounts files). It hard-checks
                                        each export's window start dates
                                        and stops rather than silently
                                        reclassifying if a re-pull moved
                                        one.
    (no file)                         POS - (5) Cooler Door Stickers has
                                        no iSellBeer export yet, so it
                                        ships as a hasData:false
                                        placeholder card, same as July's
                                        Disruptors.

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

That whole-month exception did come up: PODS_Report_14 (2026-08-26)
spanned 08/01-08/26 with a date on every row, carried all 10 already-
published POD photos plus 3 new ones, and was saved straight over
lytt_pos_pods.xlsx rather than merged. Overwriting was the RIGHT call
there and merging would have been the wrong one -- merge_export() dedupes
on the columns the archive already had, Date/Time included, so the 7 POD
photos published while the export had no Date/Time (blank in the archive,
dated in the new pull) would not have matched their own published copies
and would have landed a second time. Overwriting instead backfilled their
real dates (08/11-08/18, previously em dashes on the board). Two non-LYTT
rows (Victory Brewing, from an unfiltered earlier pull) dropped out of the
archive with it -- no loss, generate_lytt_pos.py already refused to write
them to the JSON. So: check an incoming PODS pull's Filters tab span
before choosing; whole month with dates throughout -> overwrite, anything
narrower -> --merge-pods.

PODS' "POD #" column is VOLATILE and is excluded from the merge dedupe key
(found 2026-08-27, PODS_Report_15). It is a sequence number scoped to the
export's own window, not a property of the row: the same Matt Powierski
purchase at Garfield Bar & Liq is "6.1" in a pull starting 08/01 and "28.1"
in one starting 08/25. Because the key was built from every archive column,
that one difference made EVERY overlapping row read as new -- the first run
of PODS_Report_15 reported 45 of 45 rows new and re-added 3 already-published
photos as duplicates. merge_export() now takes volatile_cols and main()
passes ("POD #",) for --merge-pods, the same way "#" has always been ignored;
nothing downstream reads either column, and the archive keeps whichever value
it already had. With that fix PODS_Report_15 merges as 22 new / 23 already
published, and re-merging PODS_Report_14 over it is a clean 586/586 no-op.
The displays and promos exports have no such column, so they are unaffected.
Watch for this shape generally: any per-export counter in a future export
needs the same treatment, and the symptom is a merge reporting suspiciously
close to 100% of an OVERLAPPING export's rows as new.

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

To refresh September manually:
  1. Save the new exports over constellation_corona_gaintain.csv /
     keystone_ice_24oz.csv / molson_coors_fever_tree.csv /
     wine_spirits_new_placements.csv, and sales_reps_customer_base_core.csv
     if the core territory changed. A Load Sheet Date column on the two
     new-placement exports is expected and handled; what must NOT change
     is the pair of date-windowed "Placement Count" columns, which
     check_window() verifies start on 6/1/2026 and 9/1/2026 and refuses to
     guess at. Constellation must keep its per-rep subtotal rows (see
     _strip_rep_subtotal_rows()) and its 9/1/2025 + 9/1/2026 windows.
  2. Run: python3 generate_2026-09.py -- it prints new placements,
     penetration and reps-at-goal counts, worth a sanity check.
  3. Sanity-check against the previous build before committing. These
     numbers should only ever GROW within a month: a refresh that drops a
     previously-qualifying account is the signal that something reclassified
     wrongly, which is exactly what the shape change below would have caused.
  4. Commit and push.

SEPTEMBER'S FEVER TREE AND WINE & SPIRITS EXPORTS CHANGED SHAPE (2026-09-04)
Both gained a "Load Sheet Date" column, dropped "Placement Count Percentage
Total", and are now TRANSACTION LOGS -- the same rep/account (Fever Tree) or
rep/account/SKU (Wine & Spirits) appears once per load sheet, each row
carrying only that sheet's window. They used to be pre-aggregated: one row
per key with both windows filled in on that one row.

THIS SILENTLY BREAKS A PER-ROW CLASSIFICATION, in the direction that
over-credits reps. An account that bought in July and again in September no
longer has a single row with both columns filled -- it has a July row with
only the base column and a September row with only the current column, and
that September row read on its own looks exactly like a brand-new placement.
Rerunning the old per-row logic against these exports would have reported 20
newly-opened Fever Tree accounts instead of 1, and 129 Wine & Spirits new
placements instead of 75. build_new_placements() now folds every row for a
key together BEFORE classifying, so the JSON the client reads is still one
row per key and index.html needed no change at all.

COUNTING PLACEMENTS ACROSS LOAD SHEETS is the open question this leaves.
Summing a key's rows does NOT reproduce what the old pre-aggregated export
reported for the same window -- Klejdi Lamo's Shop Rite Stanhope reads 24
base placements on the 2026-09-02 export and 44 if you sum the same window's
load sheets on the 2026-09-04 one. The old column was a DISTINCT count (SKUs
placed in the window); a SKU reordered on three load sheets is one placement,
not three. The new export cannot be de-duplicated the same way because for
Fever Tree it never says WHICH SKUs a load sheet carried, only how many.
So the generator takes the LARGEST SINGLE LOAD SHEET's count per key rather
than the sum: it cannot over-credit reorders, where summing inflates the base
window by ~80%. It can under-credit an account that genuinely adds new SKUs
on a later sheet. Today the two agree exactly -- the one newly-opened Fever
Tree account has a single current-window row (6 placements on 9/2) and no
Wine & Spirits key has more than one -- so nothing rides on it yet, but it
will once September fills in. Both numbers print at build time.
OPEN WITH GAVIN: if credit is meant per load sheet line rather than per
distinct SKU, switch to the "current_sum" the aggregator already tracks.
Better still, RDE adding a product column to the Fever Tree export would make
the distinct count exact and retire the question.

TWO NAMES IN THE EXPORTS ARE NOT ON THE BOARD (pre-existing, NOT changed
here). Constellation carries "John Neukum" and "Office Tell Sell", and Fever
Tree carries "John Neukum"; neither is in index.html's ROSTER, and every view
iterates ROSTER, so their rows are generated into the JSON and then never
rendered. "Office Tell Sell" is the known non-rep entity the on-prem README
also calls out -- correct to skip. John Neukum is not: he shows 7 Corona
Gaintain placements last fall and 7 this fall, which would put him at goal,
plus one Fever Tree account. He was in the 2026-09-02 exports too, so this is
not new. Deliberately left alone: adding a name to ROSTER is a claim about who
is on the program, and this README's rule is that those are confirmed, never
guessed. ASK GAVIN whether he belongs on the board.

ONE MORE THING WORTH CONFIRMING (pre-existing, NOT changed here): on-prem and
off-prem count Fever Tree in DIFFERENT UNITS. Off-prem's "(10) New
Placements" scores the placement COUNT (a new account taking 6 SKUs is 6),
while on-prem's "(3) New Placements" uses buildNewAccountsDataset() and
scores one per new ACCOUNT regardless of SKUs. Both of September's on-prem
new accounts happen to carry a placement count of 1, so no current number
differs either way -- but the two boards would diverge the moment an on-prem
account takes several SKUs at once.

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
territory-restricted. September adds the same treatment for Keystone Ice
and Fever Tree (mpo_targets_keystone_ice.json /
mpo_targets_fever_tree.json, generate_2026-09.py's build_targets(), same
core-territory scope); September's Wine & Spirits is "any brand", so a
"doesn't carry the brand yet" list has nothing to name, and Constellation
Corona Gaintain is scored on placement volume across a rep's whole book
rather than on reaching new accounts -- neither gets one. BBC Lytt's Target Accounts sits alongside its
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

CONSTELLATION READS AS A PERCENTAGE (changed 2026-09-02, per Gavin: "shows
last fall and this fall, then has the % in the status -- if the rep gets to
30% they are at goal"). The card and the objective table now lead with
r.share -- THIS FALL AS A PERCENTAGE OF LAST FALL -- rather than a raw
placements/target pair, so the number on screen is the one the objective is
named for. The columns are Last Fall / This Fall / % of Last Fall / Status.

Two similarly-named fields, do not mix them up:
  r.share  this fall / last fall * 100. The headline, and what 30% is judged
           against. Brian Sengebush reads 40%, "+10 pts over", at goal.
  r.pct    progress toward that 30% goal (placements / target * 100). What
           the progress BAR fills on, so a rep at 15% of last fall shows a
           half-full bar rather than a nearly-empty one.
The at-goal flag is still r.hit (placements >= target), unchanged, so the
flag and the percentage can never disagree the way two separate tests could.

The per-product drill-down deliberately keeps its own Last Fall / 30% Goal /
This Fall / % to Goal columns -- per product the useful question is "is this
SKU at its own 30%", which is a different question from the rep's overall
share and worth keeping alongside it.

CONSTELLATION DOUBLE-COUNT, fixed 2026-09-02 (Gavin: "you counted the goals
for the reps (last fall + this fall) 2x"). RDE prefixes each rep's block with
a SUBTOTAL row, and it reuses the first product's NAME instead of saying
"Total", so it cannot be spotted by label. Chris Payton's first "Coronita
Extra 1/24/7 oz Btl" row is 133, which is exactly 26+33+37+23+14 -- the sum of
his five real rows. Summing every row counted every rep twice (house-wide
3,256 placements last fall instead of 1,628) and, because lines are aggregated
by product name, also folded the subtotal into a real SKU sharing that name.

_strip_rep_subtotal_rows() drops the first row of each rep's block, but ONLY
when it actually equals the sum of the rest in BOTH columns. If RDE stops
emitting subtotals, no row is thrown away and the script prints which reps
looked wrong -- the failure mode is a warning, not silently halving real
placements. It printed "dropped 24 per-rep subtotal row(s)" on the fix run,
one per rep in the export, and every rep total was checked against the
de-duplicated CSV afterwards (24 of 24 matching).

Worth knowing for anyone comparing screenshots from before the fix: the
PERCENTAGE was mostly unaffected, because numerator and denominator were both
doubled -- Chris Payton read 27.8% either way. What was wrong was every
absolute number on the card (266/74 instead of 133/37), plus a handful of
at-goal flips from ceil() rounding on the doubled target. Do not assume a
double-count is harmless just because the headline ratio looks stable.

