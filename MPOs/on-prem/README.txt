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
ONE row per customer -- not one per transaction. For sources whose lines
carry a PERIOD field ("base"/"current" -- currently August's Angry Orchard
and Molson Coors, see "90-Day Non-Buy" below), it classifies each account
per Gavin, 2026-08-08:
  New Buyer              bought this month, never in the base period.
                           Eligible for the incentive.
  Repeat Buyer            bought in BOTH the base period and this month.
                           Not new, but actively reordering.
  Bought in Base Period   bought in the base period only, no this-month
                           purchase yet. Already carries the brand, not
                           an incentive-eligible target.
Only New Buyer rows are shown directly (with both the base-period and
this-month date, since a rep confirming a fresh placement still wants to
see when it happened) -- per Gavin, 2026-08-08: "the target accounts and
new placement accounts should be the focus of what the rep sees when
they open the program." Repeat Buyer and Bought in Base Period rows are
NOT the focus (they're accounts a rep already has, nothing to act on),
so they're tucked behind a collapsed "N Existing Accounts" dropdown
(existingAccountsBlockHtml()) using the exact same collapsed-by-default
pattern as Target Accounts -- fully available for traceability, just not
cluttering the default view. If an objective has zero new placements
this month, the drill-down just says "No new placements yet this month."
instead of an empty table.
Within each card the order is fixed: New Placements table (or the "no
new placements" message), then the "N Target Accounts" dropdown, then
the "N Existing Accounts" dropdown -- per Gavin, 2026-08-08: "move
target accounts above the repeat buyers," since target accounts (where
to hunt) matter more to a rep than accounts already carrying the brand.
lineTableNewAccounts() takes the pre-rendered targetsHtml as its third
argument so it can interpolate it in the right spot, rather than callers
appending it after the function returns.
For sources with no PERIOD field (July's Carbliss/Sapporo, and buyer_count
sources like Wine & Spirits) there's no base-period concept and no
Target Accounts either, so lineTableNewAccounts() falls back to the
original single-date "New Buyer"/"Regular Buyer"/"—" table, all rows
shown directly, unchanged.

Off-premise exclusion applies to EVERY on-prem August dataset, not just
Target Accounts (per Kohler, 2026-08-07: "off premise accounts should not
be included in this dashboard ever"). load_off_premise_only_ids() in
generate_2026-08.py flags any Customer Num that appears in
sales_reps_customer_base.csv WITHOUT ever appearing as "On Premise" there,
and build_angry_orchard()/build_molson_coors()/build_wine_spirits() all
drop those rows up front. This matters beyond Target Accounts:
angry_orchard_new_lines.csv (the RDE activity export itself, not a
Kohler-side territory file) carries ~15 off-premise-only customers (Total
Wine & More, Bottle King, Shop Rite Wine & Spirits, etc.) whose purchase
history was showing up in reps' Angry Orchard drill-downs even after
Target Accounts was already on-premise-only -- found 2026-08-07.

Target Accounts (Angry Orchard, Molson Coors Peroni/Banquet only -- per
Gavin, 2026-08-04, Wine & Spirits' Yave/Leyenda are sold in every county
so skip the territory filter there): a collapsed-by-default "who to go
after" list under each rep, for objectives whose table config has a
`targetsFile` (see MONTHS in index.html). Built server-side by
generate_2026-08.py's build_targets() -- a rep's on-premise-only account
base (via the customer-base export's Premise column) MINUS customers who
already carry the brand MINUS customers outside ALLOWED_TARGET_COUNTIES --
per Kohler, 2026-08-06, these on-premise accounts are only ever sold in
Bergen, Passaic, Passaic-FF, Morris 1, Morris 3, and Sussex; every other
county (Essex/Hudson/Union/Morris 2, Middlesex) is excluded outright, not
flagged. Each account's county is the CSV's own Distribution Area column,
except when that's the "Sales" placeholder (no geographic data on that
export path) -- then it falls back to the CSV's County column instead
(per Kohler, 2026-08-07: "use the county column to see where the customer
is located"), which the 2026-08-07 refresh populates for every row, so no
separate lookup file is needed for this anymore. Rendered by
targetsBlockHtml()/groupTargetsByRep() in index.html -- shown for EVERY
rep with prospects, even one with zero current-month activity (that's
often exactly the rep who most needs the list), via the `hasTargets`
check alongside the usual `hasAny`/`r` activity checks in both
renderRepView() and renderObjectiveView(). As of 2026-08-08 the list is
also grouped by county (groupTargetsByCounty(), COUNTY_ORDER constant),
each county collapsed by default -- a rep's target list can run to 100+
rows, and one long undifferentiated list was too much for reps to scan on
an iPad; grouping + double-collapse (outer "N Target Accounts", then each
county within it) keeps it scannable. This also surfaced a real bug: the
card's CSS had a hard `max-height:6000px` + `overflow:hidden` cap that
silently clipped a rep's combined activity+targets content once it got
tall enough (Nick Melissari's Angry Orchard card in particular) -- fixed
by removing the cap entirely on always-open rep-view cards and raising it
generously on the toggleable objective-view cards.

"90-Day Non-Buy" new-placement classification (Angry Orchard, and
Peroni/Banquet independently within Molson Coors -- per Kohler,
2026-08-04): a customer+brand is a NEW placement only if they have NO
purchase of that brand in the base period (the 90-day non-buy window) AND
DO have a purchase of it in the current period. A customer who bought in
the base period and buys again in the current period is a repeat
placement and does NOT count. As of the 2026-08-08 RDE format, this no
longer needs hardcoded window dates at all -- angry_orchard_new_lines.csv
and molson_coors_peroni_banquet.csv now carry the base period (5/1-7/31)
and current period (8/1-8/31) as two SEPARATE columns (e.g. "Units
5/1/2026 - 7/31/2026" and "Units 8/1/2026 - 8/31/2026"), with each row's
value already placed in whichever column matches that row's Date. See
find_period_cols() (picks the two columns apart by each header's embedded
start date, not exact text, so a slightly different day-of-month in a
future export still resolves correctly) and classify_dual_period() in
generate_2026-08.py -- every transaction row is kept in the output,
tagged PERIOD "base"/"current", with NEW_PLACEMENT set to 1 on exactly
the customer's first qualifying current-period row and 0 on every other
row for that customer+brand, so a repeat purchase never double-counts.
classify_dual_period() is brand-scoped (the `brand_key` argument), so
Molson Coors classifies Peroni and Coors/Banquet completely independently
per customer. Wine & Spirits (Yave/Leyenda) is unaffected -- its export
format didn't change, still a single-window buyer count with no base
period concept.

SEPTEMBER 2026 (added 2026-09-02, from September_ON_PREM_2026_MPO.docx)
Four objectives at 25% each:
  1. Lofted Spirits - (5) New Bardstown Menu Placements
  2. Molson Coors - Fever Tree (3) New Placements
  3. Spirits - Carbliss (10) New On Premise Buying Accounts
  4. HUSA - (1) New XX Draft Line

All four are data-backed. Numbers as of the SECOND 2026-09-04 refresh (exports
now run through 9/4; Fever Tree stayed PRODUCT-level -- see "A FEVER TREE
PLACEMENT IS ONE SKU" below): Bardstown 1 menu placement, Fever Tree 8 new
placements, Carbliss 2 new buying accounts, HUSA 1 new draft line.

FIRST REP AT GOAL ON FEVER TREE: Allison Scott has 3 of 3 (Buffalo Wild Wings
Wayne took Ginger Beer, Club Soda and Tonic Water on 9/4 -- one account, three
SKUs, three placements under the per-SKU rule). Paul Mclaughlin 2, and Robin
Feldman / Brian Sengebush / Nick Melissari 1 each. This is the first month
where the per-SKU vs per-account choice actually decides whether someone gets
paid: per ACCOUNT those same three rows would be ONE placement and Allison
would sit at 1, not 3. Gavin confirmed per-SKU on 2026-09-04.

That jump came entirely from six new 9/4 Fever Tree rows, of which four
qualified -- the Allison Scott trio above plus Robin Feldman / 76004 Marriot
Hotel Saddle Brook (Ginger Beer). The other two (Anthonys CF Pizza 12048,
Pazza 95001) are accounts that already bought that SKU in 6/1-8/31, so they
read as repeat. The four placements the earlier 9/4 build found all survived
unchanged; nothing was reclassified.

CARBLISS AND HUSA DID NOT MOVE, and that is the export, not the build: this
pull's Carbliss and HUSA files are the SAME ROWS as the previous one, merely
re-sorted (verified set-identical before the run; both still top out at 9/3
and 9/10 respectively, same as before). Only Fever Tree carried genuinely new
data. If a future pull's Carbliss/HUSA counts hold still, check whether the
rows themselves actually changed before hunting for a bug in classify().

Superseded, kept for the reasoning: numbers as of the 2026-09-03 refresh (still only
three days into the month): Bardstown 1 menu placement, Fever Tree 2 new
placements, Carbliss 2 new buying accounts, HUSA 1 new draft line. Only HUSA
has anyone at goal, its goal being 1. Those are the SAME four qualifying
accounts the 2026-09-02 build found -- the wider 9/3 exports added plenty of
September activity but all of it at accounts that already bought in 6/1-8/31,
so it lands as repeat business, not new placements. Early-month flatness like
this is expected, not a sign the refresh failed to take.

One row to be aware of on the 2026-09-03 Carbliss export: Robin Feldman /
230108 Vfw 7248 Sparta carries a load sheet date of 9/10/2026, a week in the
FUTURE. It is a scheduled load sheet, not a data error to fix here, and it
changes nothing -- that account also bought in the base period, so it reads as
a repeat buyer either way. Worth a glance on future refreshes if a
future-dated row ever lands on an account that WOULD otherwise qualify as new.

OBJECTIVE 1 HAS A DIFFERENT KIND OF SOURCE from the other three, and it is the
one to be careful with. It is not RDE -- it is an iSellBeer PROMOS export
(Promos_Report_NN.xlsx), which means:

  * It is a PARTIAL WEEKLY PULL. bardstown_menu_promos.xlsx in this folder is
    the cumulative ARCHIVE, not a scratch copy of the latest pull. Saving a new
    Promos_Report over it would silently drop every menu placement published
    before that window (repo CLAUDE.md). Merge instead:
        python3 generate_2026-09.py --merge-bardstown Promos_Report_NN.xlsx
    That reuses off-prem's proven merge_export() (hyperlinks preserved, columns
    matched by header name, re-merging an applied export is a no-op) with
    "Promo #" passed as a volatile column -- it is a per-export counter like
    PODS' "POD #", and leaving it in the dedupe key makes every overlapping row
    read as new.
  * IT COUNTS DISTINCT SUBMISSIONS, NOT ROWS. One promo carries one row per
    brand on the menu. The first pull is a single table tent at Hilton
    Hasbrouck Heights listing two Bardstown SKUs, arriving as Promo # 1.1 and
    1.2 -- that is ONE menu placement, counted once, the same rule the display
    auction uses for photos. A submission is (photo taker + account + date/time).
    OPEN WITH GAVIN: the sister program in incentive-tracking pays "per printed
    menu MENTION, multiple mentions on one menu means multiple payouts". If this
    MPO objective is scored that way too, drop the dedupe and flag every row.
    Both counts print at build time so the gap stays visible -- 1 vs 2 today.
  * iSellBeer spells rep names its own way ("robin feldman"); build_bardstown_
    menu() canonicalises to the RDE ROSTER spelling. An unmatched name is kept
    as-is so it surfaces on the board rather than vanishing.
  * THE PHOTO IS LINKED FROM THE ROW. A photo-verified objective proves itself
    with the picture, so PHOTO_URL rides through to a "View Photo" link in the
    drill-down. The column is ADDITIVE: buildNewAccountsDataset() looks for a
    photo column via PHOTO_COLS and finds none on the other three objectives,
    so their tables render exactly as before -- only a dataset that actually
    carries photos grows the column. Links are deduped per account, since one
    promo repeats its photo on every brand row; an account with genuinely
    different photos gets "View Photo 1 / 2". The link comes from the
    workbook's hyperlink, which is why the archive is .xlsx and not a CSV --
    a CSV export drops it, the same reason the display auction keeps .xlsx.

A FEVER TREE PLACEMENT IS ONE SKU IN ONE ACCOUNT (confirmed with Gavin,
2026-09-04), not one newly-opened account. A restaurant already pouring Fever
Tree Tonic still earns credit for a first order of Ginger Beer. Gavin re-pulled
the export at the PRODUCT level that day for exactly this -- "Product Num Name"
replaces "Brand Family" -- so classify() takes a product_col and keys Fever
Tree per (rep, customer, SKU). It reads 4 new placements per SKU against 2 per
account; nobody is at the goal of 3 either way, but the boards would diverge
as the month fills in. Off-prem's Fever Tree and Wine & Spirits objectives use
the same unit, so all three now agree.

CARBLISS AND HUSA STAY ACCOUNT-KEYED, deliberately. Their objectives are "(10)
New On Premise BUYING ACCOUNTS" and "(1) New XX DRAFT LINE" -- both are facts
about an account, not about a SKU, and Carbliss' export has no product column
anyway. classify()'s product_col defaults to None, so they are unchanged.

THE DRILL-DOWN NAMES THE SKU, since it is now the unit of credit. The Product
column is ADDITIVE, the same trick the Bardstown photo column uses:
buildNewAccountsDataset() looks for a SKU column via SKU_COLS and finds none on
Carbliss, HUSA or Bardstown, so their tables render exactly as before. SKU_COLS
is deliberately narrower than the existing PRODUCT_COLS, which falls back to
["brand"] and would have matched BRAND_FAMILY -- hanging a useless constant
"Carbliss"/"Dos Equis" column off the account-scored objectives. A dataset that
carries a SKU also gets its drill-down keyed per customer+SKU rather than per
customer, so two new SKUs at one account render as two rows; collapsing them
would have made the card's count disagree with its own table.

SEPTEMBER'S EXPORTS CHANGED SHAPE three ways, which is why generate_2026-09.py
exists rather than a tweak to August's:
  1. Customer Num and Customer Name arrive as ONE column, "Customer Num &
     Company" ("24038 J. Alexander's Restaurant"). split_customer() pulls them
     apart on the leading digits; anything without a leading number keeps the
     whole string as the name and gets no id, so a format change surfaces as a
     missing id rather than a crash.
  2. Fever Tree and Carbliss carried NO Date column at all in the 2026-09-02
     export. (Fever Tree changed again on 2026-09-04, to product level -- see
     "A FEVER TREE PLACEMENT IS ONE SKU" above. The date story below still
     applies to both.) This one is a trap: index.html's buildNewAccountsDataset() starts
     with `if(!repCol||!custCol||!dateCol||!flagCol) return null;` -- with no
     date column it returns null and the objective renders as if it had no
     data, silently. So those two datasets were stamped with a placeholder
     DATE of the current window's start (2026-09-01), the same trick
     off-prem's Corona Premier export uses for the same reason.
     RESOLVED as of the 2026-09-03 export, which changed shape again: Fever
     Tree and Carbliss now arrive one row PER LOAD SHEET DATE (rather than one
     aggregated row per account -- for Fever Tree, per account AND SKU) and
     carry a real "Load Sheet Date" column.
     generate_2026-09.py reads it via FEVER_TREE_DATE_COL/CARBLISS_DATE_COL
     and the placeholder is gone for those two -- this README's own rule is
     to drop the placeholder once a real date arrives rather than leave both.
     That is not cosmetic: under the placeholder every base-period row also
     read 2026-09-01, so the Existing Accounts dropdown showed September dates
     in its "Base Period" column for accounts that had actually bought in June
     or July. emit() still falls back to the window start for an individual
     blank cell (a dataset with no dates at all would blank the objective
     outright, which is worse), and the build log prints how many rows needed
     that fallback -- it is 0 on a healthy export, and 0 on this one. If a
     later export drops the date column again, that count is the tell.
  3. The premise column is "On-Off Premise", not "Premise".

NEW-PLACEMENT RULE is unchanged: current window (9/1-9/30) populated, base
window (6/1-8/31) not. A populated cell counts even when its value is 0 --
the question is whether the account transacted in that window at all, same as
August. Classification is per (rep, customer); none of September's three
objectives splits by brand, so classify_dual_period()'s brand_key machinery
isn't needed and none of them uses the dual/subs config.

NO TARGET ACCOUNTS for September. August built them for Angry Orchard and
Peroni/Banquet only because Kohler had confirmed those sell in the six Core
Market counties. Fever Tree, Carbliss and Dos Equis draft have no confirmed
scope, and this README's own rule is that a prospect list is a claim a rep
acts on and is never guessed. Add targetsFile entries in MONTHS and a
build_targets() call once Kohler confirms.

Off-premise exclusion still runs (1043 customer ids on the current
sales_reps_customer_base.csv; the 1067 this line used to quote predates the
2026-09-03 closed-account fix in dd74143, which is the last commit to touch
that file), even though all three
exports look on-premise already -- the rule is about the account, not about
what a given export happens to contain.

Files:
  July 2026 (see generate.py's own docstring for full detail):
    carbliss_new_buyers.csv, sapporo_na_new_buyers.csv,
    wine_spirits_placements.csv, generate.py

  August 2026 (see generate_2026-08.py's own docstring for full detail):
    angry_orchard_new_lines.csv       RDE "2 New Angry Orchard Draft
                                        Lines" export: Sales Rep Assigned,
                                        Brand Family, Customer Num,
                                        Customer Name, Date, and two Units
                                        columns (base period 5/1-7/31,
                                        current period 8/1-8/31 -- see
                                        "90-Day Non-Buy" above). Format as
                                        of 2026-08-08.
    molson_coors_peroni_banquet.csv   RDE "Molson Coors ON (4) New
                                        Peroni Placements (4) New
                                        Banquet Placements 90 Day Non
                                        Buy" export -- same shape as
                                        angry_orchard_new_lines.csv but
                                        with the base/current split
                                        applied to a Placement Count pair
                                        AND a Cases pair. Brand Family is
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
                                        Territory" export. NOT interchangeable
                                        with off-prem's
                                        sales_reps_customer_base_core.csv,
                                        despite the similar name: this one
                                        must carry BOTH premises, because
                                        load_off_premise_only_ids() decides
                                        which customers are off-premise-ONLY
                                        by checking whether an account ever
                                        appears as "On Premise". Hand it an
                                        off-premise-only book (like the "Core
                                        Off Prem" workbook off-prem takes) and
                                        every on-premise account would read as
                                        off-premise-only and get stripped from
                                        all four objectives. Columns: Sales Rep
                                        Assigned, Customer Num, Customer
                                        Name, Shipping Address,
                                        Distribution Area, County, City,
                                        Area, Premise, Buyer Count, Cases
                                        -- one row per rep/account/
                                        shipping-address (so some accounts
                                        appear more than once). Distribution
                                        Area and Area are the same field
                                        duplicated; County is a coarser
                                        fallback (no Morris 1/2/3 or
                                        Passaic/Passaic-FF split, but also
                                        no "Sales" placeholder -- see
                                        load_customer_base()). Drives TWO
                                        things: (1) which Customer Nums are
                                        off-premise-only and get stripped
                                        from every August dataset (see
                                        load_off_premise_only_ids() above),
                                        and (2) Target Accounts' on-premise
                                        account base (deduped by Customer
                                        Num, Premise=="On Premise" only).
                                        Also has ~4 rows for non-rep
                                        entities (e.g. "Default", "Office
                                        Tell Sell") not in ROSTER --
                                        harmless, never looked up since
                                        rendering only iterates ROSTER.
    kohler_brands_whitelist_blacklist.xlsx
                                       Kohler's per-brand-family,
                                        per-county sell authorization
                                        workbook, kept for reference/audit
                                        only -- generate_2026-08.py does
                                        NOT read this file. The county
                                        eligibility check is the hardcoded
                                        ALLOWED_TARGET_COUNTIES constant
                                        (Bergen/Passaic/Passaic-FF/Morris 1/
                                        Morris 3/Sussex, per Kohler,
                                        2026-08-06), and every account's
                                        county now comes straight from
                                        sales_reps_customer_base.csv (see
                                        above), so this workbook's "Master
                                        - US vs THEM" tab (which agrees
                                        with the same 6 counties, last
                                        checked 2026-08-07) is redundant
                                        with the current logic.
    generate_2026-08.py               Rebuilds the five JSON files above
                                        (three MPO datasets + two Target
                                        Accounts prospect lists).

  September 2026 (see generate_2026-09.py's own docstring for full detail):
    fever_tree_new_placements.csv     RDE "Molson Coors - Fever Tree (3) New
                                        Placements ON" export: Sales Rep
                                        Assigned, Brand Family, Customer Num &
                                        Company, On-Off Premise, Load Sheet
                                        Date, and two Placement Count columns
                                        (base 6/1-8/31, current 9/1-9/30).
                                        One row per account per load sheet
                                        date as of 2026-09-03; the 2026-09-02
                                        version was one aggregated row per
                                        account with no date column at all.
    carbliss_new_on_prem_buyers.csv   RDE "Carbliss (10) New On Premise
                                        Buying Accounts" export -- same shape
                                        as Fever Tree but with a Buyer Count
                                        pair instead of Placement Count.
    husa_xx_draft.csv                 RDE "HUSA - (1) New XX Draft Line"
                                        export: adds Package and a real Date
                                        column, and carries a Units pair
                                        alongside the Buyer Count pair. Brand
                                        Family is "Dos Equis" (XX). This one
                                        always had real dates.
    bardstown_menu_promos.xlsx        Cumulative iSellBeer promo ARCHIVE for
                                        objective 1 -- NOT a scratch copy of
                                        the latest pull. Merge new
                                        Promos_Report pulls onto it, never
                                        overwrite (see objective 1 above and
                                        repo CLAUDE.md).
    sales_reps_customer_base.csv      Shared with August -- drives the
                                        off-premise exclusion (see above).
                                        Refreshed 2026-09-04 via the
                                        repo-root territory-accounts/
                                        folder, which applies Kohler's
                                        "Entire Core Market / Southern
                                        District, On/Off Prem" exports to
                                        this file (and two others outside
                                        this folder) in one pass -- see
                                        territory-accounts/README.txt.
                                        That refresh is scoped to the nine
                                        areas those exports cover; rows
                                        outside it (Morris 2, Middlesex,
                                        RDE's "Sales" placeholder when its
                                        County doesn't resolve) are left
                                        untouched, since a refresh source
                                        that never claims to describe a
                                        territory is no basis for dropping
                                        accounts in it.
    generate_2026-09.py               Rebuilds the four JSON files above.

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
     sales_reps_customer_base.csv -- same column headers, i.e. keep the
     base-period-then-current-period two-column format for Angry Orchard/
     Molson Coors (see "90-Day Non-Buy" above); find_period_cols() reads
     each header's embedded date to tell them apart, so the exact day
     shifting slightly between exports is fine, but there must still be
     exactly 2 columns per prefix. Update
     kohler_brands_whitelist_blacklist.xlsx too if Kohler sends a new
     one, though it's reference-only now (see Files below).
  2. Run: python3 generate_2026-08.py -- prints how many new placements
     qualified out of how many customer+brand pairs appeared in each
     export, how many off-premise-only customer IDs got excluded, and
     how many Target Accounts prospects were found per brand.
  3. Commit and push.

To refresh September manually:
  1. Save the new RDE exports over fever_tree_new_placements.csv /
     carbliss_new_on_prem_buyers.csv / husa_xx_draft.csv. Fever Tree must stay
     PRODUCT-level ("Product Num Name"); if it ever comes back with "Brand
     Family" instead, classify() silently falls back to one key per account and
     the count drops without erroring, so check the build log's
     "account+SKU pairs" line looks right. Keep the
     base-then-current two-column format -- find_period_cols() reads each
     header's embedded start date, so the exact day shifting between exports
     is fine, but there must still be exactly 2 columns per prefix
     ("Placement Count" for Fever Tree, "Buyer Count" for Carbliss, and both
     "Buyer Count" and "Units" for HUSA).
     DO NOT overwrite bardstown_menu_promos.xlsx with a new Promos_Report --
     it is a cumulative archive fed by weekly partial pulls. Merge instead:
       python3 generate_2026-09.py --merge-bardstown Promos_Report_NN.xlsx
     which merges and then rebuilds in one pass.
  2. Run: python3 generate_2026-09.py -- prints, per objective, how many
     accounts qualified as new out of how many appeared in the export, how
     many off-premise-only customer IDs got excluded, and how many rows had
     no usable date and fell back to the window-start placeholder. That last
     number should be 0; anything else means an export lost its date column
     (see "SEPTEMBER'S EXPORTS CHANGED SHAPE", point 2).
  3. Sanity-check the new-placement counts against the previous build before
     committing. They move slowly by design -- an account only counts as new
     if it did NOT buy in 6/1-8/31 -- so identical counts after a refresh are
     usually correct, not a sign the new export failed to load. The row count
     and the date range are the better tell that fresh data actually landed.
  4. Commit and push.

Theme: Kohler navy (changed 2026-09-01)
Re-themed from the original warm barrel-wood browns to Kohler
Distributing navy, per Gavin ("black or dark blue... Kohler Distributing
color scheme"), together with off-prem, the Incentive Tracker and the tap
tracker -- all four share the palette, so keep them in sync (off-prem's
README already says to carry theme tweaks across).

The whole palette is index.html's :root, so this was a value-only swap.
One thing that is NOT in :root and had to follow the canvas: the
.hero-banner::after scrim, which fades the hero photo into the page
background and was hardcoded rgba(21,16,10,...) -- the old brown. It is
now rgba(8,12,22,...). Miss that and the photo fades to brown against a
navy page. See incentive-tracking/README.txt for how the blue was chosen.

