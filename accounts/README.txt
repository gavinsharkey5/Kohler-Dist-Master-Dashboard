Accounts tab + Account page (2026-09-30)
==========================================

"What should I do at this account today?" -- one list of a rep's assigned
accounts, one page per account that leads with up to three supported
actions, then the supporting detail. Managers see their team's accounts
with the rep named on every row and open the same page.

URL: /accounts/            the list      (#q=..., #rep=<name>, #need=any|follow, #kind=reorder|slower|
                                          lapsed|follow|prog|tap (with need=any), #fam=<brand family>)
     /accounts/#acct=<n>   one account   (n = Encompass customer number; managers add &rep=<name>;
                                          &from=<url>&fl=<label> make the Back link return there)

WHO SEES WHAT
  Rep       their own assigned customer base, nothing else. The middleware
            (middleware.js) maps the signed-in name to a NAME KEY
            (canonical first name + surname: "Michael Ast" -> mike-ast) and
            (a) rewrites /hub/data/accounts.js to data/book/<key>.js -- ONE
            rep's slice -- and (b) refuses any data/reps|sales|book/<other key>
            request with 403. So a rep's browser never receives another rep's
            accounts, whatever the page asks for. The page then matches the
            name forgivingly (kdhMatchName) and fails closed when nothing
            matches.
  Manager   every rep, or -- a district manager -- their own team via kdhTeam
            (the trackers' DM groups), as on every other page. That team scope
            is applied on the page (managers receive the whole customer base),
            exactly as the hub and MPO trackers do today.
  Preview   a manager previewing a rep gets the rep's list and pages; notes
            are shown read-only ("Saving is off in preview").
  Every rep dataset is per rep since 2026-10-01 (tools/rep_slices.py; see
            CLAUDE.md "Every rep dataset is served per rep"). Account SIZE
            (sizeClass, decile) is NOT in data/reps/<key>.json: it is moved
            into data/size.json (managers only; the middleware refuses it to a
            rep) and accounts.js merges it into the rows for a manager.

DATA (all existing; generate.py builds the per-rep slices)
  hub/data/accounts.js                     the customer base: rep -> accounts (n, name, town,
                                           county, area, premise, 2026 cases). Book as of its asOf.
  rolling-distribution/data/master/        Fusion product x account x MONTH cases, net of
    months/YYYY-MM.csv                     returns, Jan 2025 -> the last loaded month; products.csv
    products.csv, customers.csv            (name, family, supplier, package); customers.csv (address).
    deciles/universe.csv                   account size class / decile (gross 2026).
  isellbeer/tap-survey-tracking/index.html the current tap survey per account (tap-data JSON):
                                           last visit, ours / theirs / unverified handles, brands,
                                           superseded passes.
  Supabase rep_actions                     the hub's Done / Follow up / Not now + note rows
                                           (read here with the signed-in token; RLS: a rep their
                                           own, a manager everyone's). Edited in the hub only.
  the hub's own adapters (hub.js in LIBRARY MODE -- no #app on the page, so
  it renders nothing and exposes window.KohlerHub): active programs, this
  account's target / credited / can't-sell status, what to sell, deadlines.

  inventory/index.html (rep-data JSON)     the warehouse's sellable units, days of cover, next
                                           arrival per product, as ../inventory/ computes them.
  incentive-tracking/data/customer_base_full.csv   Draft / Package service type per account.
  carbliss-onprem-targets/brands_sell_sheets.xlsx  sell-sheet URL per brand (Carbliss so far).

  Outputs of generate.py (git-tracked, regenerate after hub/generate.py, a
  rolling month, a tap rebuild or an inventory refresh):
    data/index.json, data/book/<key>.js, data/reps/<key>.json (list + one-line
    summary per account, service type, stops / points), data/sales/<key>/<n>.json
    (one account's product x month history + its tap brands and earlier
    surveys), data/catalog.json (the product catalogue with warehouse
    availability -- no customer data, so a rep may fetch it as-is).

THE ACCOUNT PAGE: FOUR SECTIONS (2026-09-30, Gavin's Encompass brief)
  One page per account, a compact section selector under the name
  (Overview / Sales & Products / Invoices & Balances / Tasks & Resources;
  short labels under 480px; `sec=` in the hash remembers the open one; a
  Focus link or an At-a-glance row carries data-go="<sec>:<id>" and opens
  that section scrolled to the block). Sections switch in place -- no
  re-render, no lost list position; Back still returns to the list with
  its filters, or to the tracker that opened the account (`from` / `fl`,
  which the section links keep in the hash).
  Header  name; town · premise · Account #; the rep (managers).
  OVERVIEW
    Account   address + Directions (a Google Maps web URL from the address,
              town, NJ -- no app scheme), premise + service type (Draft and
              Package / Package Only from customer_base_full.csv), area +
              county, size class + decile, "2026 so far" stops · distribution
              points · cases (deciles workbook, definition to confirm), the
              rep for managers; then ONE unavailable line: contact, phone,
              email, hours, instructions and next delivery date are not in
              our exports (REPORTING_REQUEST.md E1 / E2). No empty fields.
    Focus     unchanged rules (below); alert links open Sales & Products.
    At a glance   one row per section with the number that matters: last
              purchase + 3-month cases + products in 12 months; the alert
              counts; the invoices line (monthly record on file, the rest not
              connected); programs (active, credited or a lead here); notes;
              taps status. Each row opens its section.
  SALES & PRODUCTS
    Sales & reorders, Buying patterns, Products to discuss  -- as before
              (rules below).
    Products  the account-context product list. Default PREVIOUSLY PURCHASED:
              every product in this account's own history (all loaded
              months), newest purchase first: name (wraps), package ·
              supplier · #ProductID, "Last bought <month> · N cs in 12 months
              (M of 12 months)", the warehouse's sellable units ("N units
              available", Out at the warehouse / Running low tags, next
              arrival) with the inventory report's date, a "Lead · <program>"
              tag when the brand family is on one of the rep's WARM lists for
              this account, and "Sell sheet (PDF)" where the Brands export
              has a URL. ALL ELIGIBLE PRODUCTS: the catalogue
              (data/catalog.json: products sold anywhere in the last 12
              months or held in the warehouse) minus brand families the
              territory workbook marks NOT IN TERRITORY / BLOCKED for this
              account's area (Bergen and Passaic: none; Essex: 131 families
              out), bought-here first. Search by name or #, Filters fold
              (supplier -> family -> package), 40 rows + Show more. One note
              says what is NOT in the data: pricing, deals, promotions,
              retailer stock, close-dated lots. Availability = Encompass's
              `Available` exactly as ../inventory/ computes it (never
              recomputed), tagged "Snapshot is N days old" past 7 days.
  INVOICES & BALANCES
    Purchases on record   the last 12 months as monthly cases + products
              bought, labelled "not invoices" (Fusion has no invoice numbers,
              dates or dollars); a month later than the reference month says
              "partial month in the export".
    Invoices, credits & receivables   ONE unavailable state: invoice history,
              AR (amount due, credits, balance, aging), pre-orders,
              backorders and allocations need the exports in
              REPORTING_REQUEST.md (E3-E6). No zeros, no estimates from
              sales -- and no dollars until Gavin says who may see them.
  TASKS & RESOURCES
    Programs, Notes & follow-ups, Taps & visits  -- as before.
    Tools & links   rows that work today: Incentive Hub (the rep's programs),
              Tap Tracker on this account (on-premise), Directions; then one
              line: iSellBeer, DSDLink, PayLink, the license lookup, surveys,
              assets and documents stay in Encompass -- no documented
              account link yet (REPORTING_REQUEST.md section 5). Nothing is
              drawn as a button that does not work.

  ASK THE ASSISTANT (fifth tab, 2026-09-30; v2 the same day)
    assistant.js + api/chat.js (api/README.txt has the whole contract).
    The browser sends ONLY the customer number, the rep, the page's program
    status list + warehouse availability (labelled "what the app shows" on
    the server) and the conversation. The server checks the caller may see
    that account (a rep: on their own route file; a DM: a rep on their
    team; another manager: any rep), builds the record itself from
    accounts/data/reps + sales + rep_actions, and gives the model three
    tools that compute on the FULL record (product_history, period_totals,
    list_products) so sums are code, not model arithmetic. Every answer
    carries a footer: "Monthly sales record through <ref>, loaded <date>",
    the lookups run, and links to Purchase history / Alerts / Patterns /
    Programs on this page. Practice a pitch = the assistant plays this
    account's buyer from its real history; objections are simulated and
    it may not invent prices, stock, competitor facts or customer quotes;
    Get feedback ends it with coaching that marks the simulated parts.
    TRANSCRIPTS: sessionStorage of this browser tab only, key
    kdh_ask:<hash of signed-in email + preview identity>:<account>, two
    per account (ask / pitch); "Delete this conversation" (confirmed)
    empties one; kdh-user.js drops them all on any preview change and
    /login/ on sign-out, switch account and sign-in, so nobody sees
    another person's conversation on a shared device. Nothing is stored
    in Supabase except the usage ledger (tokens, no text). Cross-device
    saved conversations would need an authenticated table with RLS, not
    Snowflake. Managers and previews get the same read-only tool.
    Needs ANTHROPIC_API_KEY + the assistant_usage migration; api/README.txt
    has the pilot steps and the spend limits.

ACCOUNT WORKSPACE (2026-10-02, Attio's company record as the pattern)
  Four sections under the header, `sec=` in the hash, switched in place:
    Overview   Next Actions (the Focus rules below, max 3, each with why + a link),
               Sales Context (last purchase, 3 vs 3 months, products in 12 months,
               alert counts, "See purchase history & alerts"), Account Details (Customer
               ID, address, premise, area, size -- managers only --, 2026 so far, rep for
               managers, one "Contact & hours are in Encompass" line). From 1180px the
               details sit in a sticky right column.
    Products   the product list (below), and "Products to Discuss" folded under it.
    History    three views (`sub=`): Sales & Alerts, Buying Patterns, Monthly Record
               (the old Invoices & Balances: the monthly purchase record labelled "not
               invoices" + the one unavailable line for invoices / AR / backorders).
    More       a plain menu: Programs, Notes & Follow-ups, Taps & Visits, Tools & Links,
               Ask the Assistant, About This Data. Each opens in place with "‹ More".
  OLD LINKS STILL WORK: sec=sales -> History > Sales & Alerts, sec=inv -> History >
  Monthly Record, sec=tasks -> More, sec=ask -> More > Ask; data-go keys like
  "sales:alerts" / "tasks:notes" / "inv:inv" are translated by GO / goTarget() in
  accounts.js, so links from the rep home, the hub, the tap tracker and the assistant's
  answer footer land where they did. Tabs show counts (Products = products bought,
  More = open follow-ups).
  PRODUCT LIST: mode (Previously Purchased / All Eligible), search, Filters (supplier ->
  family -> package) and the freshness line sit directly above the rows. Freshness:
  "Kohler warehouse stock as of <date> · N days old · may have changed -- confirm in
  Encompass" (tinted when 7+ days old). Each row: name (+ Lead tag), package · #num ·
  supplier, last bought here, "Stock at last update: N units" (KOHLER'S WAREHOUSE, never
  the retailer's shelf) with Out / Running low tags, "expected arrival <date>" marked
  "(past estimate)" once that date has passed, Sell Sheet (PDF). 40 rows then "Show N
  More of M". Mode, search, filters and how many are shown are kept per account in
  sessionStorage, so Back / a reload return to the same list.

FOCUS + SECTION RULES (unchanged from the first build)
  Focus      up to three, in this fixed order, each saying why and what next:
             1 the newest open follow-up on this account (rep_actions, status follow)
             2 an overdue tap survey (last visit > 60 days ago -- the Tap Tracker's rule;
               "due soon" from 53 days is shown in Taps & visits, not here)
             3 program LEADS: the trackers' own warm opportunity lists for this account
               ("1 SKU short", "still on Summer Ale", "missing <product>"), warm first,
               soonest deadline first; a cold eligible target only when its program
               ends within 14 days                                            (up to 2)
             4 BUYING ALERTS from patterns.py: lapsed buyer before possible reorder,
               biggest usual order first, each with its evidence (months bought, usual
               gap, last month, months since, usual order, "family still bought: ..."),
               and "Purchasing less frequently" for the account when nothing else  (up to 2)
             Nothing invented: no urgency, no potential, no deadline that is not the
             program's own. No item -> a plain "Nothing flagged" line.
  Sales & reorders (Fusion master, monthly, net of returns, through the REFERENCE month)
             last purchase month; the last 3 months vs the 3 before vs the same 3 last year
             (labelled with their months); products bought in the last 12 months;
             BUYING ALERTS -- the account's reorder / lapsed / buying-less-often products
             from patterns.py (see BUYING ALERTS & PATTERNS below), 8 shown with a fold for
             the rest, each row: type tag, product, family · package · "13 of the last 18
             months · 3 months since · <family> still bought: <product>, <month>", usually
             every N months, last bought, usual order; a note under the table restates the
             three rules. Then recent purchases (top products of the last 3 months) and the
             full product history fold. MINIMUM HISTORY: 15 loaded months for the
             same-period-last-year comparison (otherwise it is omitted, not zeroed).
  Buying patterns (patterns.py, Jan 2025 -> the reference month)
             Buying months: the account's distinct buying months, recent 6 vs the 6 before,
             both labelled ("6 of 6 months in Mar–Aug 2026 · 6 of 6 in Sep 2025–Feb 2026"),
             a Less often / More often tag when they differ by the rule. Order size: median
             cases per buying month, last 6 buying months vs the 6 before (abs + %).
             Volume: last 3 months vs the 3 before vs the same 3 a year ago (abs + %).
             Product mix: N regular · N bought 9+ of the last 12 · N occasional · N one-time ·
             N seasonal · N no longer bought. Consistent: the products bought 9+ of the last
             12 months. Folds: top products (12 months: months bought, cases, pattern),
             top brand families, NEW PLACEMENTS (first bought in the last 6 months, with
             6+ months of history before it: Repeated = 2+ buying months, "One-time so
             far" = one month and 2+ months since), order size changed (>= 25% and >= 2
             cases per product), possible switches within a family (an alerted product
             whose family kept selling through another product), recurring products no
             longer bought (history, not alerts), seasonal or irregular (never alerted).
             Percentages appear only on a base of 10+ cases. Frequency and size are never
             combined into one number.
  Programs   the rep's active incentives + this month's MPOs, judged for THIS ACCOUNT:
             Credited (the tracker's own credited line, product · date) / Lead (warm) /
             Already buying open; "Could still qualify" (eligible, not buying) and "Other
             active programs" (not sellable here, awaiting data, not on its lists) folded.
             Links: the hub program screen and the hub account screen (marks live there).
             This is the account's status, never the rep's overall progress.
  Products to discuss   the warm leads with the tracker's reason, plus what the sales
             history says about that brand family: bought recently / bought before but not
             in the last 12 months (last month named) / never in the available history.
             "Not bought this period" and "never bought" are different statements and are
             worded differently. Sell sheets, pitches, pricing and inventory: not in the data
             yet (see REPORTING_REQUEST.md).
  Notes & follow-ups    every rep_actions row on this account (status, program, note, date);
             "Edit in the hub" for the rep, view-only for a manager or a preview.
  Taps & visits (accounts in the survey)  last survey with the 60-day status, handles ours /
             theirs / unverified, what's on tap (fold), earlier surveys (fold), the Tap Tracker
             opened on this account (#q=<name>). On-premise accounts without a survey say so.
  Freshness  book asOf · sales through <month> (loaded <date>) · taps asOf, in the footer.

LIST (Shopify's customer list as the pattern, 2026-10-02)
  Order: title + counts, search, All / Needs Attention / Follow-Ups, then one row of
  secondary filters (Reason under Needs Attention, Filters = brand family, Data month),
  then the rows. Row: name; town · #CustomerID · premise (· rep for managers); ONE
  LEADING ACTION; "N More Items" when the account has more than one.
  LEADING ACTION RULE (accounts.js leadOf(), first match wins):
    1 Follow-Up           newest open rep_actions follow-up (program named)
    2 Tap Survey Overdue  last survey > 60 days ago (days since)
    3 Program Lead        a warm opportunity on the trackers' own lists, soonest-ending
                          program first (program + its end)
    4 Tap Survey Due      53-60 days since the survey (days left)
    5 Possible Reorder    patterns.py reorder alert, biggest usual order first (product)
    6 Lapsed Product      patterns.py lapsed alert (product)
    7 Buying Less Often   patterns.py slower / less-often (product or the account line)
  Why this order: the rep's own promise first, then dated obligations (survey, program
  deadline), then sales signals by backtested reliability (accounts/backtest.py, 2026-09-30:
  reorder 72-85% bought again within 3 months, lapsed 52-69%). "N More Items" counts every
  other follow-up, lead, survey and buying alert on the account (each product alert is one
  item). Under Needs Attention the list is grouped by the leading action (one section per
  rule above), each account once. A possible reorder is never worded as a confirmed need.
  MEMORY: the list's hash (search, need, reason, family, rep) is remembered per signed-in
  user + preview (kdh-user.js kdhRemember('accounts', ...), sessionStorage
  kdh_nav:<scope>:accounts) so My Accounts in the nav returns to the same list after
  visiting another tool; the scroll position comes back with it. Entering or leaving
  preview, or a different person signing in, starts clean.
  Filters: All accounts / Needs attention / Follow-ups; under Needs attention a REASON
  select (Any / Possible reorder / Buying less often / Lapsed buyer / Open follow-up /
  Program lead / Survey due or overdue); "More filters" holds the BRAND FAMILY select
  (families bought in the last 12 months by the accounts on screen, or with an alert):
  alone it keeps accounts that buy the family or have an alert on it; with a reason it
  keeps only accounts whose alert of that type is on that family. "Needs attention" =
  follow-ups + leads + surveys + buying alerts + purchasing less frequently. The header
  counts accounts on the route and "N accounts with alerts" (accounts, never product
  alerts added to accounts). Search matches name, number,
  town (and rep for managers). Long lists page 120 at a time. Back from an account
  restores the list, its filters (need / reason / family / rep / search) and scroll, via
  the hash + sessionStorage.

BUYING ALERTS & PATTERNS (accounts/patterns.py -- THE rule engine; accounts.js renders)
  Grain    Fusion product x account x MONTH, net cases (returns netted; a net-negative month
           is a credit, not a purchase). So every "purchase date" is a BUYING MONTH (net
           cases > 0), intervals are in months, and days-between-orders is impossible until
           invoice-level history arrives (REPORTING_REQUEST.md). Invoice dates would let the
           same code run in days.
  Today    the REFERENCE month = the last loaded month NOT flagged partial in
           rolling-distribution/data/master/sources.json (Aug 2026 on 2026-09-30). Nothing
           grows more overdue than the data: "3 months since" is counted to that month, and
           the page says "data through <month>" wherever an alert appears.
  Per product (and again per brand family)
    window          the last 18 months ending at the reference month
    buying months   months in the window with net cases > 0
    recurring       6+ buying months in the window   (4 was backtested first: it flagged 80%
                    of accounts and 12k "reorders"; 6 halves that at a better hit rate)
    interval I      median gap in months between consecutive buying months; regular = I <= 3
    irregular       longest gap >= 3 x I and >= 4 months: patterns reported, NEVER alerted;
                    seasonal = irregular and bought in two calendar years (reported as such)
    since           months from the last buying month to the reference month
    one-time        exactly one buying month in the whole history (never an alert)
    occasional      2-5 buying months in the window (never an alert)
    consistent      bought in 9+ of the last 12 months
  Alerts (recurring, regular products only)
    Possible reorder    I + 1 <= since < lapse_at   -- at least a month PAST the usual gap;
                        at the usual gap is not an alert
    Lapsed buyer        lapse_at <= since < lapse_at + 3,  lapse_at = max(2I, I + 2)
                        (monthly product: lapsed from 3 months; every 2: from 4; every 3: from 6)
    stopped             since >= lapse_at + 3: "recurring products no longer bought" in the
                        patterns section -- history, not an alert (too old to chase)
    Buying less often   no reorder / lapsed alert on the product, 5+ buying months in the
                        prior 6 and at least 3 fewer in the recent 6 (equal-length periods)
    Order size change   median cases per buying month, last 6 buying months vs the 6 before,
                        changed >= 25% and >= 2 cases (patterns section only, no alert)
    Switching           an alerted product whose family was still bought AFTER the product's
                        last month -> the alert keeps its type but says "family still
                        bought: <product>, <month>" (the likely story is a switch, not a loss)
    Purchasing less frequently (account)   the account's own buying months, recent 6 vs
                        prior 6, by the same 5 / -3 rule. Product-level slowdowns are counted
                        separately ("N products bought less often"), never rolled up.
    Order              lapsed, then possible reorder, then less often; within a type the
                       bigger usual order first (usual = median cases per buying month).
  Wording  "Possible reorder" / "Lapsed buyer" / "Buying less often" / "No recent purchase
           of <product>" -- never "lost", never a confirmed need; one-time placements are
           never "recurring"; "not bought in the window" and "never bought in the history"
           are different statements (Products to discuss keeps that distinction too).
  Handled  returns / credits (netted by Fusion; a net-negative month is not a purchase);
           an inactive or closed account (looks like lapsed buyers -- the customer base has
           no status flag, see REPORTING_REQUEST.md); seasonal products (never alerted);
           substitutions within a family (the "still bought" line); territory (a product
           the account buys is by definition sellable there; program leads keep the
           territory rules); missing months (a month absent from the master is simply not
           a buying month; the reference month skips partial months); discontinued
           products (NOT knowable -- there is no product status, so a discontinued SKU
           bought monthly will show as lapsed until it passes lapse_at + 3; the request
           asks for the flag).
  Backtest accounts/backtest.py runs the same engine with the reference month moved back
           (default: -3 and -6 months) and reports, per alert type, how often the product
           was bought again within the next 3 months, against the baseline of regular
           products bought in the reference month itself. 2026-09-30, data Jan 2025-Aug 2026:
             ref May 2026: possible reorder 2,489 flagged, 72% bought again (1.31 buying
             months of the next 3); lapsed 2,900, 52% (0.88); buying less often 1,122, 92%
             (1.99 -- still buyers, as the rule intends); baseline 41,304, 95.5% (2.31);
             stopped 1,326, 26%. 51% of accounts with sales carried at least one alert.
             ref Feb 2026: reorder 5,216 / 85%; lapsed 2,907 / 69%; less often 1,024 / 92%;
             baseline 95%. (A February reference flags more and recovers more: winter is the
             low season, so the spring rebound catches many "gaps".)
           Reading: a reorder flag is a fair nudge (most come back, so asking is cheap and
           usually right); a lapsed flag is a real signal (half do not come back vs 95%).
           Re-run after every rolling month; if lapsed drifts toward the baseline, raise
           RECUR_MIN or lapse_at; if reorder falls under ~60%, raise REORDER_PAST.
  Reliability  the rules need 6+ buying months in 18 -> a product first bought this spring
           cannot alert yet; an account new to the route inherits its history (Fusion has
           no history of who held it). Accounts with hundreds of SKUs carry many alerts
           (Bottle King: 23 lapsed of 919 products); the list shows counts, the page shows
           8 with a fold, Focus takes the two biggest by usual order.
  States   none in v1. Marking an alert resolved / completed / snoozed / dismissed needs a
           table (rep_actions is per program x account; alerts are per product x account
           x reference month) with RLS like rep_actions and a "resolved by whom, until
           when" column, plus a rule for what re-opens it (a new reference month with the
           gap still open). A completed FOLLOW-UP never resolves a sales gap: the alert
           stands until the sales data shows a purchase. Not built until Gavin wants it.
  Payload  generate.py writes, per account, `alerts` counts + `summary` lines + `families`
           + `alertProducts` (type, product, family) on the list row, and `findings`
           (alerts with evidence, counts, patterns) on the sales file -- 55 MB total for
           2,323 accounts, one file per account, per-rep folders the middleware enforces.

ROUTE / SERVICE DAY  not shown: the customer base carries no service day, stop
       sequence, time window or route totals. When the schedule export (REPORTING_REQUEST.md
       E2) lands, the list gets a Today / This week filter and scheduled stops apart from
       the assigned book, in the export's stop order.

TESTS  scratchpad sections_test.mjs (the brief's checklist: find an account by name / # /
       town, Overview with Directions + the unavailable contact line, Focus, glance rows open
       their section, product list default / search by # / All eligible with territory
       exclusions / filters, Invoices section without dollars or zeros, Tools rows, deep link
       sec=, Back keeps context, 375 / 390 / 430 / 820 / 1366), acct_test.mjs (rep scope from the allow-list spelling, direct link to
       another rep's account fails closed, search cannot reach it, manager filters + Back,
       DM team only, preview == rep list, entry points from rep home / hub / Tap Tracker,
       375 / 390 / 430 / 820 / 1366), alerts_test.mjs (evidence lines, Needs attention +
       reason + family filters match the data file exactly, Back keeps them, the account
       page's alerts table + patterns section + labelled periods, never "lost", preview ==
       rep, manager counts / rep filter, 375 / 390 / 430 / 820 / 1366), mw_test.mjs (the
       middleware's slice enforcement), accounts/backtest.py (the thresholds).

MAP, NOTES, PHOTOS (2026-10-02)
-------------------------------
MAP (map.js): List / Map in My Accounts (`mode=map` in the hash). The map
draws exactly the rows the list would (same search, filters, authorized
rows), clustered, with a sheet for the selected account (name, town,
address, one action, Open Account, Directions). Coordinates come from
accounts/geo.csv when present -- columns customer_num,lat,lng,source, WGS84
decimals, one row per account; generate.py copies them into each list row
as `geo` and refuses points outside northern NJ -- else the device cache
(localStorage kdh_geo:v1, keyed by customer # + address), else
/api/geocode (api/README.txt). Accounts that cannot be placed are listed
under "Not on the map" with the reason, never dropped. Location is asked
only on "Use My Location". The only scope is All Assigned Accounts: the
repo has no route schedule, so there is no Today's Stops view and no stop
order (REPORTING_REQUEST.md G2 / E2). Leaflet + markercluster are vendored
in assets/vendor; tiles are OpenStreetMap's (map.js TILE_URL).

NOTES + PHOTOS (activity.js): see the header comment. Notes are
rep_actions rows (`note:<uuid>`, status note / follow + optional follow_on /
done), shown on Overview under Notes & Activity with author and date,
general notes and follow-ups labelled apart; open follow-ups also appear in
Next Actions. Photos go to the private Storage bucket account-photos and
the account_photos table; types Display / Window / Cooler Door
(off-premise) and Tap Handle (on-premise). "Saved" appears only after the
upload AND the row succeed. Preview is read-only. Needs the migration
supabase/migrations/20261002120000_account_notes_photos.sql and the seed
supabase/seed/account_assignments.sql, which generate.py rewrites on every
run (re-run it in the SQL Editor after reassignments). Nothing is sent to
iSellBeer.

ACCOUNT ACTIVITY, OPPORTUNITIES, DRAFTS, PHOTO LABELS (2026-10-03)
ACCOUNT ACTIVITY (activity.js). One timeline per account, newest first, from:
notes / follow-ups / program marks (rep_actions), photos (account_photos),
tap survey passes (the sales file's tapHistory + the book's latest pass)
and monthly PURCHASE ACTIVITY (the Fusion sales record, one event per month
with cases and the top five products -- labelled "not invoices, and not a
visit"). There are no visit records, so nothing is called a visit. Every
event has a stable id (ra:<row id>, ra:<id>:done, ph:<id>, tap:<date>,
buy:<YYYY-MM>) so a reload never doubles an entry. Photos show "Taken"
(EXIF capture time, when the file has one) apart from "Uploaded". The
Overview shows the five latest non-purchase events + View All Activity; the
full view (More -> Account Activity, sub=activity; old sub=notes links land
there) has type chips, a search box and Load Older (15 at a time).

PROGRAMS THIS ACCOUNT COULD HELP COMPLETE (opps.js, KdhOpps.build). A program
appears only when its tracker lists THIS account for the rep (a warm lead,
or eligible and not yet buying), it has not ended, and the brand is
sellable in the account's area. Order: leads first, then soonest deadline.
Each card: concise title, supplier / premise / deadline, Eligible (brand
family products from data/catalog.json, narrowed by an "N oz" size when the
program names one), To qualify (the hub's sellAsk), Credit here (not
earned yet + what the tracker says is missing), Why it's here, Selling
Resources (requirement + full program name; "No approved pitch on file"
because no approved source exists -- see REPORTING_REQUEST.md 10, A1; sell
sheets where the Brands export has them -- Carbliss only today; package
options; warehouse units for the first three products with the inventory
report date and a stale tag past 7 days -- a snapshot, never live), then
Open Tracker / Account in the Hub. The rep's OVERALL progress is a separate
grey line, never the account's qualification. Credited programs and
programs that don't apply are listed separately on the full view. No
dollars (isDollarProgram programs are already filtered out by the hub).

DRAFTS AND UPLOAD RECOVERY. A note draft lives in localStorage
kdh_draft:v1:<hash of the signed-in email>:<customer #>:note; a photo draft
(the resized JPEG + its labels) in IndexedDB kdh-drafts / photos, tagged
with the same owner hash and account. The hash is of the REAL signed-in
person (kdh_user email), so another person on the same device never sees
them, and preview never writes. States: Draft -- Saved on This Device,
Pending Upload (offline), Uploading, Saved, Upload Failed -- Retry. Retry
is always a tap: nothing syncs in the background. Before sending, the page
renews the session (kdhFreshToken) and checks the draft's owner. Retries
cannot duplicate: a note keeps its program_id (note:<uuid>) and the
rep_actions unique key turns a repeat into 409/23505 = already saved; a
photo keeps its storage path (an existing file = already uploaded) and
account_photos.storage_path is unique. If the browser refuses storage
(private mode, full) the page says "Not Saved on This Device -- keep this
page open". KdhActivity.forgetDrafts() clears both stores.

PHOTO LABELS. Display / Window / Cooler Door (off-premise) and Tap Handle
(on-premise) by default; photos with no type show as Uncategorized. Optional
Brand / Program on save (Program = this account's opportunities). Filters:
type chips, caption / brand search, date (30 / 90 / 365 days), taken by,
brand. The author can Edit Labels later (needs
supabase/migrations/20261003090000_photo_labels.sql; until it is run the
page saves without brand / program and hides Edit Labels).

VERIFIED PROGRAM RULES (2026-10-05)
A program with a rule in shared/data/program-rules.json (tools/program_eligibility.py,
read through shared/eligibility.js) no longer uses the hub's target lists on
this page: opps.js fromRule() reads the account's own row in
data/elig/<rep key>.json (served only to that rep). Placement programs (Corona
Innovation) list the exact qualifying products still open HERE with the reason
(buys the brand, not this product / bought before, not this period / new to the
brand) and what is already credited; account-count programs (Lytt 3+ products,
Carbliss any purchase) say how many more products or purchases are needed. A
territory exclusion shows under "Doesn't apply here". The same ProductIDs feed
eligibleProducts(), so the Products list filter and Lead tags agree. Arriving
from the hub workspace, the Back link reads "<Program> Eligible Accounts".

PROGRAM OPPORTUNITIES + ONE ELIGIBILITY RULE (2026-10-04)
The Overview section "Programs This Account Could Help Complete" is now
"Program Opportunities". Each card reads Program -> What to Sell -> What Is
Needed -> Deadline; why it is listed, credit at this account ("a saved photo
or note is evidence, not credit"), the products that count, selling
resources, the full program name and the rep's overall progress sit in one
Details fold. Add Evidence opens the photo flow with the program and a
category preselected (hidden in preview).
Eligible products come from hub/accounts.js eligibleProducts(): a program's
own product rule when it has one (PROGRAM_PRODUCTS -- Lagunitas Sprint counts
the 13 products of its export, never the Variety pack, Hazy, Daytime or
Maximus), otherwise its brand families (PROGRAM_BRANDS) narrowed to a size the
program names; always only families sellable in the account's area. The SAME
rule drives the card, "View N Eligible Products" (the Products list filtered
to that program, with the rule as its heading and Show All Products), the
Lead tags in the Products list, and the assistant's page context. Add a
PROGRAM_PRODUCTS line whenever a program names specific products.
PROGRAM_BRANDS lists brand FAMILIES only -- a supplier name there ("Lagunitas
Brewing Co", removed 2026-10-04) is "not on file" and switches the territory
filter off.
Wording: "No purchases in the available history" (+ the period) replaces
"Never bought"; a lapsed product's caveat reads "Check with the buyer;
ordering history does not explain the gap". The address and Directions
appear once (the record header); Account Details keeps only the "street
address not in the export" note when there is no street. Next Actions says
how its items are chosen when more exist; the alerts table marks the two that
are in Next Actions and states the order (lapsed, then possible reorders,
then buying less often; the biggest usual order first).
Tests: scratchpad opp_elig_test.mjs (18), acct_test / sections_test /
alerts_test.
