Incentives & MPO Hub
====================

One link for reps: pick your name, pick what you are looking for, and see
every incentive and MPO program you are in -- where you stand, what you
still need, when each one ends and what it pays -- in one design.
Managers get the same board by program (Program View), with participation,
completion, payout exposure where the data carries it, and rep rankings.

URL: /Kohler-Dist-Master-Dashboard/hub/

WHAT IT MERGES
  incentive-tracking/   the Incentive Tracker (every deck program, both month tabs)
  MPOs/on-prem/         the On-Prem MPO Tracker (every month in its MONTHS array)
  MPOs/off-prem/        the Off-Prem MPO Tracker (every month in its MONTHS array)

THE PROGRAM NUMBERS ARE NOT COMPUTED HERE. The page loads the three
trackers' own program libraries -- the same files those pages run -- and
arranges their results. The only thing this folder builds itself is the
ACCOUNT layer (see ACCOUNT DRILL-DOWN below):

  ../incentive-tracking/data/program_data.js   the incentive data blobs
                                               (generate.py writes it beside
                                               the inline copy in index.html)
  ../incentive-tracking/programs.js            registries, summarize(),
                                               cardFor(), rankProgram(),
                                               PROGRAM_RULES, SUPPLIERS ...
  ../MPOs/on-prem/programs.js                  window.OnPremMPO: OBJECTIVES/
                                               MONTHS, builders, metricFor(),
                                               detailFor(), objPct(), atGoalFor()
  ../MPOs/off-prem/programs.js                 window.OffPremMPO, same shape
  ../MPOs/shared/guided.css                    the MPO dashboards' own card
                                               styles (.g-*), reused for the
                                               MPO half of Program View
  hub.js                                       adapters, sorting, screens
  accounts.js                                  eligible / buying / high-
                                               potential / can't-sell logic
  data/accounts.js                             each rep's customer base +
                                               brand territory (generate.py)
  generate.py                                  builds data/accounts.js from
                                               the two workbooks in data/
  hub.css                                      Kohler navy tokens, the
                                               tracker's card CSS carried over

Those programs.js files were split out of each tracker's index.html on
2026-09-10 (verbatim -- the trackers were diffed headless before/after and
render identically). Edit program rules, summaries, cards, objectives and
targets THERE; both the original page and the hub pick the change up.

REFRESHING DATA
  Nothing new. Run the trackers exactly as their own README.txt says:
    incentive-tracking:  python3 generate.py   (also rewrites data/program_data.js)
    MPOs/on-prem:        python3 generate_<month>.py -> data/<month>/mpo_*.json
    MPOs/off-prem:       python3 generate_<month>.py -> data/<month>/mpo_*.json
  Commit and push; the hub reads the new numbers on next load. The "Data
  refreshed" line shows the incentive generator's stamp and each MPO
  month's sync_meta.json.

ACCOUNT DRILL-DOWN (added 2026-09-10, v2)
  Every program card expands to four account lists for the rep, and the
  detail page carries the same block. Two workbooks in data/ drive it:

    Sales_Reps_Customer_Base.xlsx   the RDE "Sales Reps' Customer Base"
                                    report: each rep's ASSIGNED accounts
                                    (customer #, name, address, area,
                                    county, city, premise, 2026 cases)
    Brand_Sellable_Unsellable.xlsx  "Brand Permissions -- can we sell this
                                    brand in this area?": one row per brand
                                    family, CAN SELL / NOT IN TERRITORY /
                                    BLOCKED for each Encompass area

  Refresh: overwrite either file (keep the names), then
      cd hub && python3 generate.py
  which rewrites data/accounts.js. Commit and push.

  The lists, per program x rep:
    Eligible        in the rep's book, right premise for the program's
                    channel, brand CAN SELL in the account's area, not
                    already buying
    Already buying  accounts the tracker's own data shows on the brand
                    (new placements, rebuys, buying-account lists, MPO
                    line items) -- matched to the book by name; a name the
                    tracker has that the book does not is still listed,
                    dashed, as "not in your assigned book"
    High potential  the ten eligible accounts with the most 2026 cases.
                    This is the proxy the two files support: the customer
                    base carries TOTAL volume per account, not brand-level
                    or "similar product" sales, so "does well with similar
                    products" cannot be ranked from these sources. Add a
                    brand-level sales export if that is wanted.
    Can't sell here in the rep's book but NOT IN TERRITORY / BLOCKED for
                    every brand the program pays on, with the reason; plus
                    accounts whose area could not be resolved (Middlesex,
                    a Morris account with no numbered area), listed but
                    never counted as eligible

  PROGRAM -> BRAND FAMILY is PROGRAM_BRANDS in accounts.js, keyed by the
  program id (inc:<key>, on:<key>, off:<key>). A multi-brand program counts
  an account as sellable if ANY of its families can be sold there. null
  means "any brand" (house programs, the any-brand MPOs): no territory
  rule, no buying list, just the rep's book. Brand families missing from
  the Brand Permissions file (the wine & spirits brands, Tona, Lytt) fall
  back to the tracker's own call -- Core Market for programs the incentive
  tracker greys out of non-core counties, otherwise NO filter -- and the
  list says so in an amber note. Add the family to the workbook and the
  note disappears.

  Area resolution: the brand file is keyed by Encompass AREA. ~110
  accounts carry Area "Sales" (a routing bucket) -- generate.py resolves
  those from COUNTY where that is unambiguous (Bergen, Passaic, Hudson,
  Essex, Union, Sussex) and leaves Morris/Middlesex unresolved.

  Premise: on-premise programs list On Premise accounts, off-premise
  programs Off Premise, "On & Off" programs the whole book. "Already
  buying" is matched against the whole book regardless -- the off-prem
  W&S MPO credits wine placements at restaurants -- and such rows are
  tagged "on-premise account".

REP MODE vs MANAGER MODE (v3, 2026-09-10)
  Rep Mode is the default. An expanded card (and the detail page) answers
  only five things: your goal, where you stand, how much more you need,
  which accounts to visit next, and what to sell there. "Where to go
  next" is a numbered list -- warm leads first (accounts the tracker
  flags as one SKU short, one oak short, still pouring Summer Ale,
  missing a product), then the biggest eligible accounts by 2026 cases
  -- every one in the rep's book and in territory (accounts.js). "What
  to sell" is SELL_ASK in hub.js, one plain sentence per program; add a
  line there for a new program or the fallback names the brand families.
  Retention programs list the accounts to HOLD instead.
  Manager Mode keeps the full v2 view: type/channel/supplier chips, the
  four account tabs (Eligible / Already buying / High potential / Can't
  sell here) with reasons and territory notes, the tracker's own tables,
  rankings, payout exposure and the Program View. The Rep / Manager
  toggle sits in the top-right of every inner page; the landing screen
  links to it. The choice is remembered with the rep (localStorage) and
  travels in the URL as mode=manager.

REFINEMENTS (v4, 2026-09-10)
  * "MPOs" on the rep page splits into two colour-coded sections, On-
    Premise MPOs (purple) and Off-Premise MPOs (teal), each with its own
    ending-soon / almost-there / in-progress groups.
  * The name picker groups reps under a District Manager header (team
    card, DM name in amber, rep count).
  * Manager Mode is DESKTOP-ONLY. isMobile() in hub.js (narrow window,
    touch pointer under 1100px, or an iPhone/iPad/Android UA) forces Rep
    Mode, hides the toggle and the Program View, and rewrites a
    mode=manager link to Rep Mode.
  * Rep Mode cards say three things in Space Grotesk at 18-21px: WHAT TO
    SELL ("Place Corona Premier."), WHERE TO GO ("Start with these 8
    eligible accounts."), NEXT STEP ("Open the account list." -- a button
    that reveals the numbered list). The list is sized to about twice
    what is still needed, 5-10 rows. Reasons on rows are two or three
    words ("Never bought it", "2 SKUs short", "Still on Summer Ale").
    The tracker's own next-step sentence stays on the detail page and in
    Manager Mode.

CLOSED / COMPLETED (v5, 2026-09-10)
  Every Rep Mode card opens on two large tabs: WHAT TO SELL (the plan
  above) and CLOSED / COMPLETED -- a log of the placements the tracker
  already credits to the rep: customer, product/SKU, date, newest first.
  closedFor() in hub.js reads it straight from the tracker's own per-rep
  lists (offPremNew, draftNew, new24ozNew, accountList, buyingAccounts,
  lines, rebuys ... and MPO line items flagged new / on the shelf /
  photographed). A blank product means the tracker counts the account,
  not a SKU, so the row names the program's brand instead. Undated
  duplicates of a dated placement are dropped. The detail page shows
  both sections stacked; Manager Mode gets the log as a fifth account
  tab. Programs that count by product only (Corona Gaintain) say so.

TERRITORY AVAILABILITY + SECTIONS (v6, 2026-09-10)
  availability(p, rep) in hub.js asks accounts.js whether the rep can sell
  the program's brand ANYWHERE on their route. A program is "Unavailable based
  on account base/territory" (UNAVAILABLE in hub.js; the label was "Not
  Available in Your Territory" before v7) when every account in the rep's book is NOT IN
  TERRITORY / BLOCKED for the brand (or the book has no account of the
  program's premise). Such a card is greyed, labelled, listed in its own
  group after Coming Soon, and left out of the counts, the goals and the
  visit lists; the detail page explains why. A rep the incentive tracker
  itself marks territoryEligible:false gets the same treatment. Partial
  routes stay active and the lists simply hold the eligible accounts.
  "All Programs" is three sections -- Incentives (amber), Off-Premise MPOs
  (teal), On-Premise MPOs (purple); "MPOs" is the last two. MPOs on the
  rep page are the CURRENT calendar month's only (mpoRepMonth: today's
  YYYY-MM, or the newest published month if that one is not up yet), so
  older months never appear for reps; Manager Mode's Program View keeps
  its month filter. Incentives follow their own start/end dates.

CARDS (v2)
  The rep page shows every card COLLAPSED: brand mark, name, status chip,
  and four quick facts -- Progress (with bar), Goal, Remaining, Deadline.
  Tapping the card header expands it in place: type/channel/supplier
  chips, period, data refresh, the "Next" sentence, the four account
  lists, and "Full program details" to the detail page. Expanded cards
  are remembered for the page visit only. "Reset selections" on the
  landing screen clears the remembered rep, category and every expanded
  card.

ADDING A PROGRAM OR A MONTH
  Add it to the tracker as usual (a registry entry + builder/card in
  incentive-tracking/programs.js; an OBJECTIVES_* entry + MONTHS table row
  in MPOs/<scope>/programs.js). The hub lists it automatically. Two optional
  fields the hub reads and the trackers ignore:
    incentive entry   nothing extra -- period comes from the data blob's
                      periodStart/periodEnd when the builder emits them, else
                      from the entry's tag ("Aug–Sept", "Jul 20–Sep 30",
                      "September", "Sept–Oct (retro Aug)" all parse), else
                      the registry month.
    MPO objective     periodStart / periodEnd (ISO dates) when an objective
                      does not run exactly the calendar month -- e.g.
                      constellation_gaintain periodEnd:'2026-11-30'.
  Channel for an incentive (On / Off / both) is INC_CHANNEL in hub.js --
  add a key there when a new program is one-sided; the default is both.
  Its brand families go in PROGRAM_BRANDS in accounts.js, or the account
  lists apply no territory rule and say so.

HOW THE HUB READS EACH TRACKER (hub.js)
  Incentives  forRep(rep) calls the tracker's summarize(entry, rep): the
              same label / goal / remaining / next-step sentence and the same
              status ladder (Earned / Close / On Track / Needs Attention /
              Not Started / Coming Soon). The hub's status word is a
              straight mapping -- Earned => Completed (Exceeded when now >
              target), anything started => In Progress, otherwise Not
              Started / Coming Soon -- and the ladder survives as the bar
              colour and the "pace" note. Open-ended programs (goal:false --
              every placement pays) show what they have landed/earned and
              "No cap" instead of a percentage, exactly as the tracker's
              hero does. A rep is IN a program when getRep() returns their
              record and territoryEligible/programEligible are not false;
              a program with data for other reps but none for this rep is
              simply not shown to them (e.g. Keystone Ice's 17 goaled reps).
              The full detailed card (cardFor) and the leaderboard
              (rankProgram + PROGRAM_BOARD) render as on the tracker.
  MPOs        forRep(rep) calls metricFor(o, rep, DATA) from the scope's
              programs.js: value/goal/pct/remaining/valueText/goalText/
              remainText/status straight off the tracker. achieved =>
              Completed (Exceeded when value > goal), inprogress => In
              Progress, notstarted => Not Started; notScored (no account
              base / no assigned goal) => not shown. hasData:false
              objectives (photo-verified) show as Coming Soon / manually
              verified. The drill-down is detailFor(), unchanged, and the
              tracker's targets/existing-accounts toggles keep working.
  Loading     the incentive blobs are in memory from program_data.js. MPO
              months are fetched on demand: the months still running load
              at boot, older months only when "Ended" is expanded or the
              Program View month filter asks for them (August off-prem is
              ~6 MB, so it is not pulled for a rep who never opens it).

SORT ORDER ON A REP'S PAGE (the brief's order, made explicit)
  1  Ending soon     active, not complete, ends within 14 days (soonest first)
  2  Almost there    active, not complete, 75%+ done (the tracker's "Close"
                     bar), highest first
  3  In progress     everything else started, soonest to end first
  4  Not started     active programs with nothing counted, soonest to end
  5  Completed       goals already hit, latest-ending first
  6  Coming soon     programs with no feed yet (manual / awaiting export)
  7  Ended           past programs, collapsed until tapped
  ENDING_SOON_DAYS and ALMOST_PCT are constants at the top of hub.js.

CATEGORIES ("What are you looking for?") -- v7, 2026-09-10
  The home screen offers TWO choices, Incentives or MPOs (MAINS in hub.js).
  "View My Programs" then opens a sub-category screen (view=pick) with one
  big tile per sub-category and that rep's active count on each:
    Incentives -> one card per SUPPLIER (v8, 2026-09-10 -- the New /
                  Ongoing / Retention split was replaced at Gavin's request
                  with the Incentive Tracker's own "choose a supplier" step:
                  "<First name>, choose a supplier", logo + name, "n
                  incentives · n already earned", one SEE THESE INCENTIVES
                  button; repSuppliers() in hub.js, same order as the
                  tracker -- suppliers with live programs first, then A-Z;
                  "already earned" counts a met goal OR an open-ended
                  program that has paid, like the tracker's `earned`).
                  Category key is sup:<supplierKey> from SUPPLIERS /
                  PROGRAM_SUPPLIER in incentive-tracking/programs.js.
    MPOs       -> On-Premise / Off-Premise   (this month's only)
  Tapping a tile opens the rep page for that sub-category. A supplier's
  page is deliberately quiet: no status count boxes, no filter pills, one
  column of cards, no group headings (Unavailable and Ended still get
  theirs), and the card drops the supplier line since the page is the
  supplier. MPO pages keep the count boxes and the On / Off pill bar. "Change
  category" in the nav returns to the tile screen. The wider keys (all /
  inc / mpo) are still accepted in the hash for Manager Mode links but no
  longer appear on the home screen.

STATE
  A reload ALWAYS starts over on the home screen with an empty picker
  (per Gavin, 2026-09-10: "every time I refresh it takes me to the home
  page") -- only the Rep / Manager mode is remembered (localStorage key
  kohler-hub). A 🏠 Home button sits first in the nav on every inner page
  and starts over the same way; "Change rep" goes back to the landing
  screen with the name filled in. The sub-category screen and the program
  list each carry a "‹ Back" button (tiles -> home with the picks kept,
  list -> tiles), and the kicker above the title on both is a dropdown
  that flips Incentives <-> MPOs in place (v7.1).
  Every screen has a URL hash (#view=rep&rep=...&cat=..., #view=detail&
  prog=inc:keystone_ice, #view=programs, #view=program&prog=off:2026-09:
  fever_tree) so a page can be shared or bookmarked. Opening another rep's
  row from a leaderboard "peeks" at them (who=) without changing the
  remembered rep.

NO $ TOTALS PER REP, NO $ LEADERBOARD -- per Gavin 2026-08-05 the incentive
tracker tracks progress, not estimated payouts. The hub keeps that: a
program's payout line is the deck rule, a rep's tracked dollars appear
only where the tracker's own summary already shows them (Touchdowns &
Tea, Montauk ...), and the only sum is the Program View's per-program
"payout exposure" across all reps, which the brief asked for.

VERIFYING A CHANGE
  Serve the repo root (python3 -m http.server) and open /hub/. Everything
  renders client-side; a broken registry shows up as a console error. The
  headless checks used on 2026-09-10 live in the session's scratchpad, not
  the repo: they load each tracker before and after a change and diff
  every rep x program result, and drive the hub at 390px and 1280px.

REP-MODE CARD LAYOUT (v7, 2026-09-10)
  Every collapsed card reads top to bottom in the order Gavin asked for:
    name + supplier + sub-category  ->  status chip
    GOAL | WHERE YOU ARE | STILL NEED   (three tiles, key numbers in colour)
    progress bar + %  ->  deadline
    SELL  "Place Corona Premier."       (SELL_ASK)
    GO    "Start with these 8 eligible accounts."
    CLOSED "5 placements credited so far."  (only when there are any)
    [ Open the account list ▾ ]         (one big button = the whole head)
  Opening the card shows only the two tabs (Targets = the numbered visit
  list, Completed = the placement log; renamed from "What to sell" /
  "Closed / Completed" per Gavin, 2026-09-10) and the link to the
  full page -- the sell / go lines are not repeated inside. planParts() in
  hub.js builds the pieces; cardPlan() is the opened card, repPlan() the
  detail page. Manager Mode cards keep the tiles and bar but not the
  sell / go lines; their opened body is the account tabs as before.

BRAND-FAMILY GOALS ON RETENTION CARDS (v9, 2026-09-10)
  The retention programs (MolsonCoors, Constellation Fall, Yuengling Fall,
  the summer Constellation / Yuengling, and MABI Fall) have no account list
  to visit -- their "where to go" is the list of brand goals. brandGoals(p,
  rep) in hub.js reads each tracker's own per-rep brand rows (offBrands /
  onBrands, offCategories + on_packages/on_draft families, off/packages/
  draftBrands, off.brands/onPkg.brands ...) into one shape -- {label, now,
  goal, need, held} per family, grouped by side -- and brandGoalsHtml()
  draws it: name, "52 / 63 buyers", a bar, and ONE status line ("11 more
  needed" or "✓ Retained"). Each side gets a banded header (icon, big
  title in the channel colour, "2 of 3 held" pill) so off-premise and
  on-premise never blur together (per Gavin, 2026-09-10). It replaces the
  What-to-sell / Closed tabs in the opened card (button reads "Open your brand goals") and the "What to
  sell" section on the detail page; the collapsed card's GO line says how
  many goals still need attention. MABI Fall is the one program whose
  workbook sets ONE goal per rep, not per family, so its families show
  placements "toward your N goal" with no per-row bar. Nothing is
  recomputed here beyond need = goal - now and the bar width.

PRODUCT-LEVEL GOALS INSIDE A BRAND GOAL (v9.6, 2026-09-11)
  Per Gavin: a Constellation retention category is a bag of SKUs, so Corona
  Gaintain opens to the products inside it, each with its own current
  distribution and goal. brandGoals() hangs skuRows(c.products) off the
  Constellation rows and skuHtml() draws them as a <details> that is CLOSED
  by default -- the category stays the headline and a rep still reads the
  card in one glance; the SKU list is what they open when they want to know
  which product to sell. Summary line: "3 of 7 product goals held · 2 not
  reordered yet".

  The rows come straight from the tracker; nothing is recomputed but need
  and the bar. SKUs short of goal are listed first (the generator sorts
  them that way), so the top of an opened list is the call list, and a SKU
  at 0 against a real goal reads "Not reordered yet" in red -- that is
  distribution the rep has LOST, and it is what the category's shortfall is
  made of.

  ONLY CONSTELLATION FALL HAS PER-SKU GOALS. The summer Constellation
  export sets its goal at the category level only, so its products render
  with no bar, a "Currently placed" status and a productsNote saying so.
  Any other retention program can join in the same way the moment its
  export carries a per-product base -- give its rows a `products` array
  through skuRows() and the rendering is already there. See
  incentive-tracking/README.txt, "PRODUCT-LEVEL GOALS ON CONSTELLATION
  RETENTION", for which exports can and cannot support this.

PROGRAM VIEW'S MPO HALF IS THE DASHBOARDS' OWN CARD (v9.7, 2026-09-11)
  Per Gavin: the MPO portion of Program View should mirror the individual
  cards on the On-Prem / Off-Prem dashboards. It now renders the same
  screenProgram() shape MPOs/shared/guided.js draws -- a weighted summary
  strip, then one full-width objective card carrying "N / M reps at goal",
  the weight pill, the goal, the eligible-rep count and the company bar --
  using guided.css's own .g-* classes. hub/index.html LOADS
  ../MPOs/shared/guided.css for this, so there is ONE copy of that design
  and the pages cannot drift apart. It is safe because every selector in
  guided.css is .g-* scoped and it only consumes palette variables the hub
  already defines; if you ever add a rule there that reaches outside .g-*,
  it lands on this page too.

  THE NUMBERS NOW MATCH THE BOARD, and that is a real change. The old
  .pvcard counted reps the hub's way -- participants filtered by account
  base / territory, "completed" from each rep's status -- which disagreed
  with the dashboard a manager had open in the next tab: Fever Tree read
  "3 of 21 completed" here and "2 / 27 reps at goal" there. mpoProgramCardHtml()
  reads atGoalFor() and objPct() straight from the MPO module (p.objPct()
  was added beside p.atGoal() for this), so Program View and the trackers
  state one number. The hub's territory/account-base logic still governs
  the REP side, which is where it belongs -- nothing about Rep Mode changed.

  SECTIONS ARE PER SCOPE + MONTH, never mixed: a month's weights sum to 1
  within ONE scope, so On- and Off-Premise can never share a summary strip.
  Cards inside a section follow the month's own objective order (heaviest
  first, as the deck writes it), not this screen's active/end-date sort.

  THE SUMMARY STRIP ALWAYS DESCRIBES THE WHOLE MONTH, never the filtered
  subset -- a supplier filter would otherwise print a weighted percentage
  that means nothing. Its first tile says "across all N objectives" for
  exactly that reason, and when a filter hides cards the sub-line says how
  many. Incentives keep the participation grid, under their own heading;
  they have no weight, no house goal and no reps-at-goal number for these
  cards to show. Clicking an MPO card still goes to the hub's program
  detail (rep rankings) -- the dashboards expand in place, the hub
  navigates, and navigating is the hub's existing pattern here.

CACHE-BUSTING (2026-09-10)
  hub/index.html loads every script and the stylesheet with a ?v=<tag>
  query. GitHub Pages caches for 10 minutes and phones hold files longer,
  so after shipping a change to hub.js / hub.css / accounts.js -- or to
  ../MPOs/shared/guided.css, which this page now loads too -- BUMP THE
  TAG in index.html (any new string) or reps keep the old copy. A change
  Gavin "still can't see after a hard refresh" is either this or the Pages
  deploy pipeline stalling (repo CLAUDE.md, "Deploy from a branch").

VIEW PHOTO ON COMPLETED ROWS (2026-09-10)
  Objectives verified from iSellBeer photos -- the off-prem Cooler Door
  Stickers, the on-prem Bardstown menu placements, August's Lytt POS pics --
  carry the photo URL on each tracker line (photo / photos[0]). closedFor()
  now keeps it and the Completed log renders a "View photo ›" pill that
  opens the picture in a new tab, mirroring the MPO board's "View Photo"
  link, per Gavin. Rows without a photo show only the date.
