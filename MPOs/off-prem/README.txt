Off-Prem MPO Tracker

Same Kohler Distributing navy theme as the on-premise dashboard (see
on-prem/index.html's :root CSS vars) -- matched 2026-08-05 so both
dashboards read as one system, and re-themed together 2026-09-01 from
the original warm barrel-wood browns to navy, per Gavin ("black or dark
blue... Kohler Distributing color scheme"). The Incentive Tracker and
the tap tracker carry the identical palette; keep all four in sync. index.html's
<style> block is the only place that differs meaningfully from
on-prem's (plus off-prem's own extra classes, chiefly .pkg-group-row for
the New Belgium package-group drill-down) -- carry any future on-prem
theme tweak (color vars, hero banner, card/table treatment) over to
off-prem's <style> block too so they don't drift apart again. As of the
2026-09-08 guided rebuild the two pages also share MPOs/shared/guided.css
outright, so the flow and card styling no longer live in either <style>
block at all. The KPI strip and rep-chip bar this line used to describe
are gone -- Program View's summary cards replaced the first and Rep
View's Step 1 chooser the second.

GUIDED REP VIEW / PROGRAM VIEW (2026-09-08)
Both MPO dashboards were rebuilt around the Incentive Tracker's guided
flow, per Gavin: "use the Incentive Tracker as the design and
user-experience reference". A segmented toggle under the header picks
between two ways in, and REP VIEW IS THE DEFAULT:

  Rep View      Step 1 is the tracker's own chooser -- one large card per
                rep, grouped under their sales manager, three columns on
                desktop and one on a phone. Picking a name replaces the
                chooser with that rep's own dashboard: four summary cards
                (weighted MPO, achieved / in progress / not started) and
                one card per objective answering, in plain words, what the
                goal is, where they are, how much more they need and
                whether credit is earned yet. The existing drill-down
                moves behind a "See My Progress" button rather than being
                always-open.
  Program View  the manager read, and the old page's content: company KPI
                cards, then one expandable card per objective with every
                rep's result inside, sortable by progress, closest-to-goal
                or name.

WHERE THE CODE LIVES. The UI is shared: MPOs/shared/guided.css and
MPOs/shared/guided.js serve BOTH dashboards, so a change to the flow or
the styling happens once. Each index.html supplies a host object
(MPOGuided.init) with the things only that page knows -- its ROSTER,
its objectives, and two functions:

  metricFor(objective, rep)  ONE normalized shape per rep+objective:
                             value, goal, pct, remaining, status, plus the
                             display strings. Rep View's cards, Program
                             View's rows, the summary counts AND the
                             sorting all read this, which is what stops
                             the two views from disagreeing.
  detailFor(objective, rep)  the existing drill-down markup, unchanged.

The per-objective-type arithmetic in metricFor() is lifted verbatim from
the old renderRepView()/renderObjectiveView() -- same targets, same
qualification tests, same percentages. Those two renderers are gone; they
were ~500 lines that computed the same numbers twice, once per view.

NO MPO MATHS CHANGED. Weights, per-rep targets, the builders, the
"reps at goal" counts and objPct() are all untouched, and the company
figure in Program View is the same number the old KPI strip showed.

ONE NUMBER IS NEW, because none existed before: the per-rep weighted
total on a rep's own dashboard. The company formula is
sum(weight x % of reps at goal), which narrowed to a single rep is just
"did they hit it" -- so the headline is the weight a rep has actually
EARNED, which is what pays. Partial progress is printed beside it rather
than folded into it, because a rep at 9 of 10 has earned nothing on that
objective yet and a headline implying otherwise would be wrong on payday.

REPS WITH NO GOAL ON AN OBJECTIVE ARE EXCLUDED, NOT ZEROED. Four reps
(Alex Rodriguez, Allison Scott, Andrew Lundy, Hakan Sadik) are
on-premise only and have no off-premise core account base, so off-prem's
pct_of_base / pct_of_goal objectives have nothing to measure them
against. Their cards read "Not scored" and their weight is left out of
that rep's denominator; scoring them as a zero would read as
underperformance where there is simply nothing to do. Program View shows
them as "No goal this month" and never ranks them as closest-to-goal.
OPEN WITH GAVIN if Kohler actually re-weights those reps differently.

STATE AND THE BACK BUTTON. The URL hash carries view + rep + program +
month, so a drill-down is linkable and the browser Back button walks it
(expanded program -> program view -> rep -> chooser). Month tabs use
replaceState rather than pushState -- Back should walk the drill-down,
not the month tabs -- but the hash still names the month on screen, so a
reload lands where you were. The last view/rep/month is also remembered
in localStorage per dashboard; a remembered rep who is no longer on the
roster is discarded rather than wedging the page.

The month tabs, the data-refresh pill, the breadcrumb, every generate
script and every data file are unchanged. The breadcrumb gained a link
back to the main Kohler Dashboard alongside the MPO Tracker one.
Dead CSS from the old renderers was removed (~70 rules per page,
verified against a pixel diff of every month x view: identical except the
pulsing "data refreshed" dot).

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
                  qualifying rows. Both exports are PRODUCT-level as of
                  2026-09-04, every current value is 1.00, and ONE
                  PLACEMENT IS ONE SKU IN ONE ACCOUNT -- a store already
                  carrying Fever Tree Tonic still earns credit for a
                  first order of Ginger Beer (confirmed with Gavin).
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
  'photos'        August's Lytt POS pics and, since 2026-09-04,
                  September's POS cooler door stickers. Scored on
                  DISTINCT PHOTO_URL by buildPhotosDataset(), which is
                  what makes one promo one submission however many brand
                  rows it carries. Still placeholder-only where
                  hasData:false (July's Disruptors, which has no
                  iSellBeer export). The drill-down's wording follows the
                  objective -- photoUnit / photoColLabel /
                  photoItemsLabel / photoEmptyLabel on the objective
                  definition, defaulting to the Lytt phrasing so August
                  reads exactly as it always did.

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
                                        rows. As of the 2026-09-04
                                        re-pull it is PRODUCT-level
                                        ("Product Num Name" replaces
                                        "Brand Family"), carries a Load
                                        Sheet Date, repeats a key once per
                                        load sheet, and dropped "Placement
                                        Count Percentage Total" -- the same
                                        shape as Wine & Spirits, built by
                                        the same call. See "EXPORTS
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
    convert_customer_base_core.py     Flattens RDE's "Sales Reps: Customer
                                        Base Core Off Prem" WORKBOOK into
                                        sales_reps_customer_base_core.csv.
                                        Needed because that workbook is
                                        hierarchical -- column B holds a rep
                                        NAME on a grouping row and a customer
                                        NUMBER on each of that rep's rows,
                                        over a "Total" row and a Rank column
                                        -- so a plain save-as would fill the
                                        rep column with customer numbers.
                                        Refuses to write on a bad pull (any
                                        on-premise row, a duplicate rep+
                                        customer pair, a non-Core-Market
                                        area, or a row count outside
                                        400-700), and --dry-run prints the
                                        adds and drops first. See "REFRESHING
                                        THE CORE OFF-PREMISE BASE" below.
    sales_reps_customer_base_core.csv Keystone Ice's account-base
                                        DENOMINATOR and the scope for both
                                        Target Accounts
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
    pos_cooler_door_promos.xlsx       Cumulative iSellBeer promo ARCHIVE
                                        for the POS cooler door sticker
                                        objective -- NOT a scratch copy of
                                        the latest Promos_Report. Merge new
                                        pulls onto it, never overwrite, and
                                        the merge FILTERS to cooler-door
                                        rows (see the objective's section
                                        below and repo CLAUDE.md).
    (no file, July only)              July's Disruptors objective has
                                        no iSellBeer export, so it
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

REFRESHING THE CORE OFF-PREMISE CUSTOMER BASE (2026-09-04)
sales_reps_customer_base_core.csv is the Core Market off-premise account book:
Keystone Ice's penetration DENOMINATOR, and the scope for both Target Accounts
lists. It moves on its own schedule -- accounts open and close independent of
any brand's RDE pull -- so re-pull it periodically, not just when an objective
changes. Gavin sends it as the "Sales Reps: Customer Base Core Off Prem"
workbook; run it through convert_customer_base_core.py rather than saving it to
CSV by hand (the workbook is hierarchical -- see that script's entry in Files).

  python3 convert_customer_base_core.py <workbook.xlsx> --dry-run   # review
  python3 convert_customer_base_core.py <workbook.xlsx>             # write
  python3 generate_2026-09.py                                       # rebuild

A SECOND, HOUSE-WIDE refresh source exists now too: the repo-root
territory-accounts/ folder takes Kohler's "Entire Core Market / Southern
District, On/Off Prem" exports and applies them to THREE files at once,
including this one -- MPOs/on-prem/sales_reps_customer_base.csv and
incentive-tracking/data/customer_base_full.csv are the other two. See
territory-accounts/README.txt. Either refresh path updates this file; use
whichever export Gavin actually sends. If both land close together, order
doesn't matter -- they're both "closed accounts are gone, open accounts are
current" refreshes of the same underlying account book.

WHERE THIS FILE APPLIES, and where it deliberately does not:
  YES  September's tab. Keystone Ice's denominator and the Keystone/Fever Tree
       Target Accounts lists all come from it. Rerun generate_2026-09.py.
  NO   August's tab, even though generate_2026-08.py reads the same file. That
       month closed on 8/31 and its tab is a published snapshot; rebuilding it
       against a September-dated account book would retroactively restate
       scores reps were already measured on. Leave it. The same goes for any
       future closed month -- only the CURRENT month's generator gets rerun.
  NO   MPOs/on-prem/sales_reps_customer_base.csv. That one drives the
       off-premise EXCLUSION, which needs to see both premises to decide which
       customers are off-premise-ONLY. This export is off-premise rows only,
       so feeding it in would mark the entire on-prem book excluded.
  NO   incentive-tracking/. Its Lytt penetration denominator moved to
       customer_base_full.csv on 2026-08-18 ("same six-county universe, fresher
       pull, one consistent source" -- see generate.py's build_lytt comment).
       The legacy customer_base_off_prem.csv survives only as a premise-map
       fallback that customer_base_full.csv then overlays and wins over, so
       overwriting it would change nothing. And this workbook cannot refresh
       customer_base_full.csv in its place: that file is the COMPLETE book --
       both premises, all counties including the blackout ones, plus a Draft
       Package column -- where this one is 501 core off-premise accounts.
       Refreshing the incentive tracker needs a new "Sales Reps' Customer
       Base 4" pull, which is a different export.

The 2026-09-04 pull: 501 accounts across 26 reps, one in (Klejdi Lamo /
Mountain Lakes Wine & Liquor) and one out (Shane Barreca / Cambridge Wines,
Woodcliff Lake), so Klejdi's base went 27 -> 28 and Shane's 29 -> 28. Neither
crossed the 40% Keystone bar at the time (21.4% and 0.0%), and both Target
Accounts lists swapped the same one account, staying at 427 and 368.
SUPERSEDED THE SAME DAY by dd74143's house-wide closed-account fix, which is
what the file actually holds now: 488 rows, and the Target Accounts lists
rebuilt to 415 and 357 off it. The 501/427/368 above describe bd58a4c only --
kept because they are the before-picture for that fix, not the current file.
Read the current count off the build log, which prints it every run. The CSV also went 527
rows -> 501: older pulls carried ONE ROW PER SHIPPING ADDRESS, so 26 accounts
appeared twice. Nothing downstream counted those twice -- buildPctOfBaseDataset()
counts distinct customer numbers and load_core_customer_base() dedupes by
(rep, customer) -- but the dedupe does mean an account's Distribution Area is
now its real one rather than whichever duplicate row happened to come first.

To refresh September manually:
  1. Save the new exports over constellation_corona_gaintain.csv /
     keystone_ice_24oz.csv / molson_coors_fever_tree.csv /
     wine_spirits_new_placements.csv, and sales_reps_customer_base_core.csv
     if the core territory changed.
     DO NOT overwrite pos_cooler_door_promos.xlsx with a new Promos_Report
     -- it is a cumulative archive fed by weekly partial pulls, and one
     report also carries other objectives' rows. Merge instead:
       python3 generate_2026-09.py --merge-cooler-doors Promos_Report_NN.xlsx
     which filters to cooler-door rows, merges and rebuilds in one pass. A Load Sheet Date column on the two
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

POS - (5) COOLER DOOR STICKERS WENT LIVE (2026-09-04)
Was a hasData:false placeholder; now scored off an iSellBeer Promos_Report,
the same export family as on-prem's Bardstown menu objective. First pull
(Promos_Report_10, window 9/1-9/4): 12 distinct stickers from 14 brand rows,
Chris Payton 11 (at goal, target 5) and Mike Ast 1. Nobody else has submitted
one yet.

ONE PROMOS_REPORT CARRIES EVERY ELEMENT IN ITS WINDOW. Promos_Report_10 held
22 rows: 14 cooler door wraps, 5 signage, 2 table tents and 1 Lytt POS pic.
The table tents are on-prem's Bardstown menu placement -- per Gavin,
2026-09-04: "do not count the bardstown rows. those are for on premise." So
the archive is FILTERED on the way in: is_cooler_door() keeps any Elements
value containing "cooler door" (today only "Cooler Door Wrap", written wide
enough that a future "Cooler Door Sticker"/"Decal" still lands), and
merge_export() grew a row_filter parameter to apply it. The build log prints
which Elements values matched and how many rows were skipped, so a new variant
shows up rather than silently vanishing.

That filter is not optional bookkeeping. Merging a whole Promos_Report into a
per-objective archive unfiltered imports every other objective's rows -- an
on-premise Bardstown table tent would have counted as an off-premise cooler
door sticker. The same trap applies in the other direction to on-prem's
bardstown_menu_promos.xlsx, which is table-tents-only and whose merge call
does NOT yet pass a row_filter; it has only ever been fed narrow pulls, but
hand it a full report and it would take the cooler doors. Worth fixing there
the next time that path is touched.

IT COUNTS DISTINCT PHOTOS, NOT ROWS. One promo emits a row per brand on the
sticker and every one of those rows shares a photo URL -- promo 4 at USA Wine
Traders is a single wrap listing Corona Extra AND Modelo Especial. That is one
sticker. index.html's buildPhotosDataset() already counts distinct PHOTO_URL,
so no dedupe was needed in the generator; both figures print at build time (12
stickers vs 14 brand rows) so the gap stays visible if the objective ever turns
out to be scored per mention, the way incentive-tracking's sister menu program
is.

PARTIAL WEEKLY PULL, so pos_cooler_door_promos.xlsx is the cumulative archive
(repo CLAUDE.md). Refresh with:
    python3 generate_2026-09.py --merge-cooler-doors Promos_Report_NN.xlsx
which merges and rebuilds in one pass. Re-merging an applied export is a no-op
(verified on Promos_Report_10: 14 in, 0 new, 14 already published). "Promo #"
is passed as a volatile column -- it is a per-export counter like PODS' "POD
#", and leaving it in the dedupe key makes every overlapping row read as new.
The archive is .xlsx and not a CSV because the photo link lives in the cell's
hyperlink, which a CSV export drops.

iSellBeer spells rep names its own way ("robin feldman"); the builder
canonicalises to the roster spelling, borrowing ROSTER from
generate_lytt_pos.py rather than keeping a second copy to drift. An unmatched
name is kept as-is so it surfaces on the board rather than vanishing.

KEYSTONE-ONLY ACCOUNT-BASE EXCLUSIONS (2026-09-04, per Gavin)
Two of Shane Barreca's accounts are out of the Keystone Ice objective:
Whole Foods #10381 (Closter, 201097) and Whole Foods #8407 (Woodcliff Lake,
201098). His denominator goes 29 -> 27 and his penetration 3.4% -> 3.7%; his
one Keystone buyer is Garden State Deli, neither Whole Foods, so only the
denominator moves. Nobody else's base changed and the count of reps at the 40%
bar is unchanged at 2.

IT LIVES IN CODE, NOT IN THE CSV -- KEYSTONE_BASE_EXCLUDED in
generate_2026-09.py, applied in build_customer_base_core() and passed to
build_targets() for Keystone only. Deleting the two rows from
sales_reps_customer_base_core.csv by hand would have worked exactly once:
that file is regenerated by convert_customer_base_core.py and again by the
repo-root territory-accounts/ pass, either of which hands the rows back with
nothing in the diff to say why the number moved. The build log prints the
exclusion every run so it cannot go quiet.

SCOPED TO KEYSTONE, DELIBERATELY. Both accounts are still in Shane's Fever
Tree Target Accounts list (355 rows, unchanged), because the ask named
Keystone. Widening it to the whole core book is a bigger change -- it would
touch Fever Tree's prospect list and any future objective scoped to that file
-- so do it only on an explicit ask. Keystone's own Target Accounts went
407 -> 405.

THE OTHER HALF OF THIS DECISION IS keystone-ice/goals.csv, where the same two
accounts come out of Shane's row: 29 / 11.6 / 14.5 becomes 27 / 10.8 / 13.5,
recomputed at Kohler's own 40% and 50%, which ceil to a qualifier of 11 and a
bonus of 14. That file feeds the standalone Keystone dashboard AND the
incentive tracker's Keystone card (via keystone-ice/data/keystone_ice.json).
It is a hand-maintained extract of Kohler's workbook, so unlike this side it
is NOT protected against a refresh -- re-extracting goals.csv from a reissued
goals.xlsx silently restores 29. See keystone-ice/README.txt. Keep the two
halves in step: they are one decision expressed in two places.

KEYSTONE EXPORT IS SHARED WITH TWO OTHER DASHBOARDS (2026-09-08)
keystone_ice_24oz.csv is the SAME RDE export as keystone-ice/actuals.csv, and
incentive-tracking reads keystone-ice's published JSON in turn. All three must
move together: refresh keystone-ice first, then this board, then
incentive-tracking. On 2026-09-08 this file was found a pull AHEAD of
keystone-ice (108 rows vs 96) and both were brought onto the same 115-row
export; a per-rep cross-check then agreed exactly (101 accounts on each). A
disagreement between this board's Keystone objective and the keystone-ice page
means these two CSVs differ -- diff them first.

2026-09-11 -- Promos_Report_18 merged; Matt Powierski's stickers recovered
  python3 generate_2026-09.py --merge-cooler-doors Promos_Report_18.xlsx
The report is 31 rows, ALL of them Cooler Door Wraps (nothing filtered out),
all 31 carrying a photo link -- and all 31 were ALREADY in the archive from
Reports 16 and 17: "31 row(s) in, 0 new, 31 already published". So no sticker
was missing; 26 distinct photos and 2 reps at goal, unchanged.

WHAT WAS MISSING WAS A REP. iSellBeer files "Matthew Powierski" and the
roster (the RDE spelling) says "Matt Powierski", so the exact-lowercase
photo-taker lookup missed and his 2 stickers were credited to a rep who does
not exist on the board -- flagged on the 2026-09-11 refresh and left alone
then because fixing it moves a published figure. Gavin asked for all of
Report_18 to show, so build_pos_cooler_doors() now also matches on SURNAME +
first initial, and only when exactly one roster name fits, so it can never
hand one rep another's photo. Same fix as on-prem's build_bardstown_menu();
keep the two in step. Matt Powierski 0 -> 2 stickers, "Matthew Powierski"
gone from the board. Nobody else moved and the distinct-photo total is the
same 26, because the count never depended on the spelling -- only the
attribution did.

The builder now also prints what it aliased, warns about any photo taker
still matching no roster rep, and warns if an archive row has lost its photo
hyperlink (all 31 have one today). Verified end to end: every one of
Report_18's 26 distinct photo links is in the archive, and Matt's two open
from both the off-prem board's Rep View and the hub's card.

2026-09-11 REFRESH -- all four exports plus Promos_Report_16
All four RDE exports re-pulled and merged in one pass:
    python3 generate_2026-09.py --merge-cooler-doors Promos_Report_16.xlsx
Row counts: Constellation 122 (unchanged), Keystone 139 -> 144, Fever Tree
2,009 -> 2,049, Wine & Spirits 2,508 -> 2,577. Promos_Report_16 held 64 rows
of every element type; the filter kept 31 Cooler Door Wraps, 1 new and 30
already published, 30 -> 31 archive rows.

  Constellation   726 -> 839 placements this fall against an UNCHANGED 1,628
                  last fall (goals are history and must never move -- checked
                  per rep, all 24 identical); 17 -> 21 of 24 reps at 30%.
  Keystone Ice    119 -> 122 distinct buying accounts; still 4 of 26 at 40%.
  Fever Tree      60 -> 74 new placements; 2 -> 3 reps at the goal of 10.
  Wine & Spirits  147 -> 184 new placements; 13 -> 17 reps at the goal of 5.
  Cooler doors    25 -> 26 distinct stickers from 31 brand rows; still 2 reps
                  at the goal of 5.
  Target lists    Keystone 372 -> 369, Fever Tree 352 -> 350 prospects --
                  these SHRINK as prospects convert, which is correct.

NINE PLACEMENTS WENT AWAY, AND IT IS NOT A RECLASSIFICATION. The README's
step-3 rule ("numbers should only ever GROW within a month") fired on three
reps. Checked row by row: these keys are not misread, they are ABSENT from
the new export -- RDE withdrew the load-sheet rows it had published before.
  Derrick Laws     Fever Tree 9 -> 3. His six 9/11 rows at Shop Rite
                   Wines/Spirits #23004 (Ginger Beer, Club Soda, Tonic,
                   Tonic Light, Espresso Martini, Bloody Mary) are in the
                   previous export and gone from this one; the account's row
                   count fell 32 -> 26 and its latest load sheet is now 8/14.
                   He drops from 9 of 10 to 3 of 10 and will notice.
  Anthony Palmisano  Wine & Spirits 6 -> 5 (account #2003, 6 rows -> 5).
  Michael Harboy     Wine & Spirits 12 -> 10 (account #150041, 7 rows -> 5).
Both W&S reps stay above their goal of 5. Nothing was patched here: the
board shows what the current export says. If those loads were real, the fix
is a corrected RDE pull, not a change on this side.

2026-09-10 REFRESH -- cooler doors from Promos_Report_15
python3 generate_2026-09.py --merge-cooler-doors Promos_Report_15.xlsx: the
report carried 48 rows of every element type (on-prem menus, posters, table
tents, window signs, signage, the two Bardstown table tents already on the
on-prem archive); the merge kept the 30 Cooler Door Wrap rows, 8 new and 22
already published, 22 -> 30 archive rows. Distinct stickers 20 -> 25:
Jayson Romine 0 -> 4 (USA Wine Traders Club of Newton, 9/9 -- Athletic,
Talkhouse, Sun Cruiser, Cape May) and Matthew Powierski 0 -> 1 (Wine Grand
Carlstadt, Keystone Ice, 9/10). Still 2 reps at the goal of 5. Nothing else
on this board was re-pulled. The report's on-premise rows carried no NEW
Bardstown line, so MPOs/on-prem's menu archive was left alone.

2026-09-10 REFRESH -- Keystone only, riding the incentive-tracker refresh
keystone_ice_24oz.csv and keystone-ice/actuals.csv moved together onto the
139-row export (15 rows added, none removed): 109 -> 119 distinct buying
accounts, 3 -> 4 reps at 40% penetration (Dan Lagala joins at 44.4% of 45).
Nothing else on this board was re-pulled; Constellation, Fever Tree, W&S and
the cooler doors rebuilt from the files already here and did not move.

2026-09-09 REFRESH -- all four exports moved, plus Promos_Report_13
Exports now run through 9/11 (Keystone, one future-dated C Town load sheet
for Derrick Laws), 9/10 (Wine & Spirits) and 9/9 (Fever Tree). Keystone,
Fever Tree and Wine & Spirits gained rows (+9 / +100 / +66, W&S also -7, see
below) and Constellation kept its 122 rows but revised 69 upward. Before ->
after:

  Constellation Corona Gaintain   598 -> 726 placements this fall
                                  15 -> 16 roster reps at their own 30% goal
                                  (newly: Shane Barreca 24 -> 39 of 85)
  Keystone Ice (40% penetration)  101 -> 109 distinct buying accounts, still
                                  3 reps at goal (Javier Melo 13/28, Pablo
                                  Lopez 12/26, Derrick Laws 14/32). Dan
                                  Lagala 14 -> 17 of 45 = 37.8%, one account
                                  short of 40%.
  Fever Tree (10 placements)      39 -> 60 new placements, still 2 reps at
                                  goal (Matt Powierski 12, Jayson Romine 11);
                                  Derrick Laws 2 -> 9 is one away, Javier
                                  Melo opens at 7.
  Wine & Spirits (5 placements)   122 -> 147 new placements, 9 -> 13 reps at
                                  goal (newly: Anthony Palmisano 1 -> 6, Jim
                                  Heaney 2 -> 7, Allison Scott 4 -> 5, Klejdi
                                  Lamo 3 -> 5)
  POS cooler door stickers        12 -> 20 distinct stickers, 1 -> 2 reps at
                                  goal (Derrick Laws opens at 5 of 5 on 9/8:
                                  four wraps at The Liquor Shop and one at
                                  Raphael & Angel; Chris Payton 11 -> 12 with
                                  Wineland on 9/9; Mike Ast 1 -> 3 with two
                                  at Waldwick Wine/Spirits on 9/8)

THE ROW-LEVEL CHECK FIRED AGAIN ON WINE & SPIRITS, and again it is benign.
Seven rows left the export: six Michael Harboy / 150041 A&M Liquor Chateau
Diana rows dated 9/9 came back dated 9/10 (RDE re-stamped the load sheet, so
they are still the same six qualifying placements -- he reads 8 -> 12 because
Lo Secco Prosecco and others landed at the same account), and Nick Melissari's
19006 Blackjack Mulligans (Hawthorne) Yave row moved to Allison Scott, the
same rep reassignment on-prem's Carbliss export carried the same day. No rep
went down on any objective and nobody lost goal.

PROMOS_REPORT_13 MERGED 8 NEW COOLER DOORS out of 22 in its window (9/2-9/9;
the other 14 were the already-published rows, a no-op). The 9 rows it skipped
were signage, a window sign, a Lytt POS pic and the two Bardstown table tents
-- the row_filter doing its job again. merge_export() warned that 9/4 and
9/7 had no cooler-door rows between the last published row and this export's
first new one: the export's window covers both days (Pablo Lopez's 9/4
window sign is in it), so that is a quiet stretch, not a gap to re-pull.
iSellBeer spelled Derrick as "Derrick laws"; the roster match is
case-insensitive, so he lands under his RDE name.

Keystone moved with keystone-ice/ (actuals.csv on the same 124-row export,
109 accounts on both boards) and incentive-tracking/ was rebuilt after it,
per the sync rule above.

2026-09-08 REFRESH -- all four exports moved, plus Promos_Report_11
Exports now run through 9/9 (Keystone) / 9/8 (Fever Tree, Wine & Spirits).
Keystone, Fever Tree and Wine & Spirits gained rows (+12 / +19 / +55) and
Constellation kept its 122 rows but revised 65 of them upward. Before -> after:

  Constellation Corona Gaintain   502 -> 598 placements this fall
                                  12 -> 15 roster reps at their own 30% goal
                                  (newly: Jim Heaney, Matt Powierski,
                                  Michael Harboy)
  Keystone Ice (40% penetration)  84 -> 94 distinct buying accounts
                                  2 -> 3 reps at goal (Javier Melo newly at
                                  12/28 = 42.9%, joining Pablo Lopez 12/26 =
                                  46.2% and Derrick Laws 13/32 = 40.6%)
  Fever Tree (10 placements)      33 -> 39 new placements, still 2 reps at
                                  goal (Matt Powierski 12, Jayson Romine
                                  10 -> 11)
  Wine & Spirits (5 placements)   93 -> 122 new placements, 7 -> 9 reps at
                                  goal (newly: Michael Harboy 2 -> 8, Mike
                                  Ast 3 -> 5)
  POS cooler door stickers        12 stickers, 1 rep at goal -- UNCHANGED,
                                  see Promos_Report_11 below

THE SANITY CHECK PASSED AT REP LEVEL BUT NOT AT ROW LEVEL, and the exception
is worth knowing about because it is the first one. No rep on any objective
went down, and no rep lost goal. But Wine & Spirits is the first export to
REMOVE a row rather than only add: one row is gone,

    Dave Ehlers / 40004 Simple Simon's (Z) /
    201056 Bardstown Origin Series Bourbon 1/750 mL Btl / 9/4/2026

and it was a QUALIFYING new placement in the previous build. It is genuinely
absent from the new export -- not re-dated, not reassigned to another rep, and
that account+SKU appears nowhere in the new file (checked before rebuilding).
So this is RDE dropping a transaction on its own side, the shape of a voided
or returned order, NOT the reclassification bug this README's "should only
ever GROW" rule is written to catch. Dave Ehlers still reads 12 because he
picked up a different placement in the same pull (Shop Rite Liq (A) Englewd /
200741 Poggio Torselli Chianti Classico), so the coincidence hides it on the
board -- which is exactly why it is recorded here. If a future refresh drops a
row that ISN'T offset, a rep's total will fall and the check will fire.

PROMOS_REPORT_11 MERGED ZERO NEW COOLER DOORS, and that is correct rather than
a merge that failed to take. Its window is 9/1-9/8 (vs Report_10's 9/1-9/4),
it carries 23 rows of which 14 are cooler doors, and all 14 are the same rows
already published -- nobody submitted a cooler door sticker between 9/5 and
9/8. The build log says so plainly ("14 row(s) in, 0 new, 14 already
published"), which is the re-merge no-op the archive is designed for. The
filter also did its job: 9 rows belonging to other objectives were skipped,
including the SAME two Bardstown table-tent rows that on-prem's archive
holds -- confirmation that the row_filter this README warns about is the only
thing keeping an on-premise menu placement out of the off-premise cooler door
count.

OPEN WITH GAVIN -- COOLER DOORS ARE STILL SCORED PER PHOTO. On 2026-09-08 he
settled the sister question on on-prem's Bardstown menu objective the other
way: that one now counts per brand MENTION, so one table tent listing two
brands is two placements (see on-prem/README.txt). Cooler doors have the
identical shape -- promo 4 at USA Wine Traders is one wrap listing Corona
Extra AND Modelo Especial -- and are still counted per distinct PHOTO, which
reads 12 where per-brand-row would read 14. That was NOT changed here, because
he asked about menu placements and these are a different objective with a
different Kohler program behind it. Both numbers still print at build time. If
he wants them consistent, it is a switch to buildPhotosDataset()'s counting,
not a data problem.

SECOND 2026-09-04 REFRESH -- all four exports moved, every objective grew
Re-pulled the same day as the shape change above, and this time it is real
new data rather than a re-shaping: Keystone, Fever Tree and Wine & Spirits
each gained rows with NO row removed (+11 / +22 / +38), and Constellation kept
its 122 rows but revised 70 of them upward. Before -> after:

  Constellation Corona Gaintain   394 -> 502 placements this fall
                                  7 -> 12 roster reps at their own 30% goal
                                  (newly: Alisa Acciardi, Derrick Laws,
                                  Javier Melo, Klejdi Lamo, Phil Ernst)
  Keystone Ice (40% penetration)  75 -> 84 distinct buying accounts
                                  0 -> 2 reps at goal -- the FIRST any month:
                                  Pablo Lopez 12/26 = 46.2%, Derrick Laws
                                  13/32 = 40.6%
  Fever Tree (10 placements)      18 -> 33 new placements, 1 -> 2 reps at
                                  goal (Matt Powierski 12 joins Jayson
                                  Romine 10)
  Wine & Spirits (5 placements)   75 -> 93 new placements, 6 -> 7 reps at
                                  goal (Derrick Laws newly at 5)

THE SANITY CHECK THIS README ASKS FOR PASSED, and it is worth recording how,
since the shape change above is exactly the failure it guards against: every
one of the 18 previously-qualifying Fever Tree keys and all 75 Wine & Spirits
keys survived unchanged, with 15 and 18 added respectively and ZERO dropped.
Constellation likewise moved monotonically -- no rep's this-fall total went
down and no rep lost goal. A dropped key is the tell that a re-pull
reclassified something wrongly; there were none.

DERRICK LAWS CLEARS THE KEYSTONE BAR BY ONE ACCOUNT (13 of 32 = 40.6%; 12
would be 37.5% and short). Worth knowing before anyone pays on it, because the
denominator is not frozen: it is sales_reps_customer_base_core.csv, which
moves on its own schedule (see "REFRESHING THE CORE OFF-PREMISE BASE" above),
and one closed account in his book would push him back under without any
change to his selling. Pablo Lopez at 46.2% has more room.

TARGET ACCOUNTS SHRANK, which is the good direction: 415 -> 407 Keystone and
357 -> 355 Fever Tree. Nothing changed in the core base (unchanged at 488
rows this run) -- the lists got shorter purely because more accounts now carry
the brand and dropped out of "doesn't carry it yet". A prospect list that
grows while the numerator also grows would be the odd result, not this.

sales_reps_customer_base_core.csv was NOT part of this pull and was left
alone, so the Keystone denominator and both Target Accounts scopes are the
same book as the previous build. Nothing in the two closed months was touched.

SEPTEMBER'S FEVER TREE AND WINE & SPIRITS EXPORTS CHANGED SHAPE (2026-09-04)
Both gained a "Load Sheet Date" column, dropped "Placement Count Percentage
Total", and are now TRANSACTION LOGS (Fever Tree was re-pulled again the same
day at the PRODUCT level, so both are keyed rep+account+SKU) -- the same rep/account (Fever Tree) or
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

COUNTING PLACEMENTS ACROSS LOAD SHEETS -- RESOLVED 2026-09-04, and the
reasoning is kept because it is how the resolution was verified. When Fever
Tree was still ACCOUNT-level, summing a key's load sheets did not reproduce
what the pre-aggregated export reported for the same window (Klejdi Lamo's
Shop Rite Stanhope: 24 base placements on the 2026-09-02 export, 44 if you
summed the same window's load sheets on the 2026-09-04 one), because the old
column was a DISTINCT count of SKUs placed and a SKU reordered on three load
sheets is one placement, not three. That could not be de-duplicated from an
account-level export, which never says WHICH SKUs a load sheet carried.
Gavin then re-pulled Fever Tree at the PRODUCT level, which settles it: with
"Product Num Name" in place of "Brand Family" the key is rep+account+SKU and
every Placement Count value is 1.00, so a reorder is the same key rather than
an extra count, and max-per-sheet and sum-of-sheets now agree by construction
(18 and 18). The distinct-SKU reading was confirmed against the old export
before switching -- counting distinct SKUs per account in the product-level
file reproduces all 133 of the 2026-09-02 account-level base-window values
exactly, Stanhope's 24 included. Both numbers still print at build time; if
they ever diverge again, an export has gone back to account level.

A PLACEMENT IS ONE SKU IN ONE ACCOUNT (confirmed with Gavin, 2026-09-04), not
one newly-opened account. A store already carrying Fever Tree Tonic still
earns credit for a first order of Ginger Beer. That is the unit Wine & Spirits
has always used here, and it is what the product-level re-pull is for. It
matters: at the time off-prem September read 18 new placements per SKU against
6 per account, and Jayson Romine reached the goal of 10 only under the SKU
reading. As of the second 2026-09-04 refresh it is 33 per SKU and Matt
Powierski has joined him at goal (12) -- see "SECOND 2026-09-04 REFRESH"
below.
On-prem now scores Fever Tree the same way (4 placements, nobody at 3 yet),
which retires the on-prem/off-prem unit mismatch previously noted here.

TWO NAMES IN THE EXPORTS ARE NOT ON THE BOARD (pre-existing, NOT changed
here). Constellation carries "John Neukum" and "Office Tell Sell", and Fever
Tree carries "John Neukum"; neither is in index.html's ROSTER, and every view
iterates ROSTER, so their rows are generated into the JSON and then never
rendered. "Office Tell Sell" is the known non-rep entity the on-prem README
also calls out -- correct to skip. John Neukum is not: he shows 7 Corona
Gaintain placements last fall and 7 this fall, which would put him at goal,
plus one Fever Tree account. He was in the 2026-09-02 exports too, so this is
not new. SETTLED 2026-09-04, per Gavin: "do not add neukum, disregard him."
So both names stay off ROSTER and their rows stay unrendered -- correct as
built, nothing to do. Kept on the record because his rows keep arriving in the
export and would otherwise look like a bug to whoever notices them next.


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

