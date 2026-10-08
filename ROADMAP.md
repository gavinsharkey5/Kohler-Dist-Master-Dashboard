# Kohler Dist Hub -- build tracker

One list of what the website / app (kohlerdisthub.com) still needs, what is
in flight, and what is done. Gavin's checklist. Updated whenever work lands
(Claude: keep this current -- move items, date them, add the follow-ups you
create). No names, emails or phone numbers in here: the repo is public.

Legend: `[ ]` open, `[~]` built, waiting on a step outside the repo,
`[x]` done. "(Gavin)" = a step only Gavin can do (a dashboard setting, a
device, a decision).

## Now -- needs Gavin (built in the repo, not live until these are done)

- [ ] **Non-Buy Reports (2026-10-08, approved and merged to main 2026-10-08).** /nonbuy/ (nonbuy/README.txt)
  is live for managers and reps. Still on Gavin: run `supabase/migrations/20261009090000_nonbuy_reports.sql` in the SQL Editor
  (saved reports / templates / target lists; the page generates and exports without it). Decide the
  "bought then fully returned" rule (today: not a purchase for that month) and read REPORTING_REQUEST
  section 14 (dated sales lines, purchase occurrence, unit conversion, missing Brand Permissions rows).
- [ ] **Manage Programs (2026-10-08).** Managers build incentives / MPOs in the Hub
  (/manage-programs/; manage-programs/README.txt). To make it live, in the Supabase SQL
  Editor in order: `supabase/migrations/20261008120000_manage_programs.sql`, then
  `supabase/migrations/20261008180000_program_delete.sql` (v2: Delete / Restore / Publish Again), then
  `supabase/migrations/20261008200000_program_suppliers.sql` (v3: products must belong to the chosen suppliers); set
  `program_admin = true` on the approver's allow-list row (the flag, never a name);
  `supabase/seed/product_master.sql`; then REVIEW and run `supabase/seed/program_brands.sql`
  (brand managers' suppliers by name match -- edit the arrays first). Then: create a TEST
  program, submit, approve, "Open Programs as <rep>" and check the hub row / MPO card.
  Decisions still needed before a REAL program is built: (1) rounding for fractional
  account goals (up / nearest / down -- the builder refuses to guess); (2) "positive growth"
  programs need an explicit comparison period (same months last year? the prior period?);
  (3) sales associates: which accounts an associate is credited for (no associate -> account
  mapping exists on the site); (4) merchandising objectives: who verifies a record before it
  counts (today they are "recorded, never verified"); (5) tiered / package payouts (Four
  Loko-style) are stored as text for the manager preview -- the projected payout is only
  computed for per-unit and flat rates; (6) house / team-total objectives show on the
  manager preview only (a rep's card says "house goal"); (7) rolling windows (e.g. L90)
  are saved but not scored in this version.

- [ ] **Re-run supabase/seed/account_assignments.sql** in the Supabase SQL Editor (2026-10-07): the rep
  books now come from the active Customers export (2,850 accounts), so notes / photos / contacts permissions
  must follow them.

- [ ] **Account contacts (2026-10-06).** In the Supabase SQL Editor run, in order:
  `supabase/migrations/20261006100000_account_contacts.sql`, then
  `supabase/data/account_contacts.sql` (generated from the Encompass Customers
  export by `python3 tools/load_contacts.py <export.csv>`; git-ignored because
  the repo is public). Until both are run the Account page's Contact group says
  no contact is on file. To refresh: new export -> run the tool -> paste -> run.
- [ ] **Carbliss MPO tracker: confirm five points, then refresh weekly** (Gavin):
  built 2026-10-06 (carbliss-mpo/README.txt); it now shows in the October on-premise Carbliss card (Program Period Aug 1-Oct 31 + Since Launch, "See Leaderboard" -> the Carbliss targets page), not as its own tile. Confirm: (1) the
  program is ON-PREMISE only (off-premise accounts bought Carbliss too and are
  not counted); (2) launch = Jun 2, 2026, the first Carbliss load sheet (or give
  Kohler's official date); (3) an account whose Carbliss load sheet was fully
  returned the same month still counts as a buyer (2 such accounts so far --
  Encompass's buyer flag does not net returns); (4) the existing October
  on-premise MPO objective "Carbliss 40% buying accounts" now IS this program
  (Aug 1-Oct 31, same base, same export, done 2026-10-07) -- confirm the credit
  stays 40% of each rep's own base (the docx) while the team chases 331; (5) the denominator is the core
  on-premise base the October MPO already uses (no inactive flag, no Carbliss
  territory rule on file). Weekly: save the new buyers export over
  carbliss-onprem-targets/carbliss_buyers_l90.csv and run
  `python3 carbliss-mpo/generate.py`; after Oct 31, `--finalize`. 21 accounts
  are newer than the Account page's books and show unlinked until
  hub/generate.py + accounts/generate.py are re-run on the refreshed base.

- [ ] **Program eligibility: answer the rule questions** (Gavin):
  accounts/REPORTING_REQUEST.md section 12 -- C1 the Constellation "Innovation
  SKUs" list, C2 the same export with Customer Num + Product Num, rounding
  (C3 / L1 / K1), Lytt returns (L2), refresh the hub account list so the 25
  accounts added Oct 5 open in My Accounts (B1), a beer-only vs wine & spirits
  flag (M1, before Molly's / Wine get account lists), Boston Beer lists with
  Customer Num (S1), and each October incentive's supplier rules (P1). Then
  look at Corona Innovation / Lytt / Carbliss in the hub on a phone: Details
  shows each rule as Verified / Assumed / Unverified.

- [ ] **Redesigned Add Photos: run the SQL, then try it on a phone** (Gavin):
  Supabase SQL Editor, run `supabase/migrations/20261005160000_capture_items.sql`
  (after the tap file). Until then the new flow works but the POD type / shelf /
  sticker / window / menu choices and the price to consumer are NOT stored (only
  the brand / SKU, facings and taps are). Then on the iPhone: an off-premise
  account -> Add Photos -> PODs -> photo -> Select SKU -> Shelf -> Eye Level -> 4
  facings -> $19.99 -> + Add Another SKU -> Save; an on-premise one -> Tap
  Handles -> Main Bar -> + Add Brand x2. Watch the keyboard: the price field and
  Save should stay visible (tested in desktop Chromium only).
- [x] **Tap lines Ours / Theirs: run the SQL** (Gavin, done 2026-10-05): Supabase SQL Editor,
  run `supabase/migrations/20261005140000_tap_us_them.sql` (after the PODs +
  Signage file). Until then tap lines save without their Ours / Theirs label.
  Idempotent.
- [x] **PODs + Signage photo types: run the SQL** (Gavin, done 2026-10-05): Supabase SQL
  Editor, run `supabase/migrations/20261005120000_merch_pod_signage.sql`.
  Until then a rep who picks PODs or Signage gets a save error; the other
  types work. Idempotent.
- [ ] **Stop capturing in iSellBeer, page by page** (Gavin + Claude): the Tap
  Tracker now reads tap surveys reps take in the Hub (2026-10-05). Still built
  from iSellBeer exports only: Off-Premise MPO cooler doors + Lytt POS,
  On-Premise MPO Bardstown menus, Display Auction, Tier 1 Display Recap,
  Executive Overview -- each needs the same treatment before iSellBeer can be
  dropped, and supplier programs that require iSellBeer proof need confirming.
- [ ] **Tap Tracker + Hub surveys: live check** (Gavin): take one tap photo in
  the Hub at an account (Tap Handles, two or three lines), open the Tap
  Tracker, search the account: its current lineup should be the Hub survey
  ("· Kohler Hub" by the date) and the footer should say "Includes 1 Kohler
  Hub tap survey". Also once as a rep on a phone.
- [ ] **iSellBeer photo PDFs: run one more SQL file** (Gavin, before importing
  PDFs): Supabase SQL Editor, run
  `supabase/migrations/20261005100000_isb_pdf_photos.sql`. It lets a photo PDF
  attach each page to the photo an earlier import already created (so the
  spreadsheet and the PDF -- or the PDF's parts -- can go in on different
  days). Idempotent.
- [ ] **Merchandising: import the iSellBeer exports** (Gavin, after that SQL):
  Manager -> Merchandising -> Import From iSellBeer, on a computer. Add the
  .xlsx exports first (or together with the PDFs), read the reconciliation,
  Import; then add the photo PDFs -- whole or split into parts, any order --
  and press Attach. Pages match their record by the photo link iSellBeer prints
  on each page; only a page with no readable link asks for a person (or goes to
  the Review Queue). Re-importing restates, never duplicates. The files never
  pass through a chat: they are read in the browser.
- [ ] **Merchandising: real-device capture check** (Gavin): on the iPhone and
  iPad, Account -> Add Photos -> Display -> Take Photo (the camera should
  open with no video controls and no microphone prompt), take two, Retake
  one, add a product line with a unit, Save Photos. Then a Menu Placement
  and zoom into the saved photo to check the print is readable. Also try it
  inside the Encompass app's built-in browser, and once with Airplane Mode
  on (it should say Pending Upload and keep the draft). Built and tested in
  desktop Chromium with phone emulation only.
- [ ] **Assistant: turn it on if it says "not set up"** (Gavin): My Accounts
  -> an account -> Ask. A manager now sees the exact step: Vercel ->
  Settings -> Environment Variables -> `ANTHROPIC_API_KEY` (value from
  console.anthropic.com -> API Keys, pasted only into Vercel), Production,
  Save, then Redeploy the latest Production deployment. The pilot item below
  still applies (ledger SQL, KDH_CHAT_USERS).
- [ ] **Lagunitas Sprint: two decisions** (Gavin; REPORTING_REQUEST.md 11.4):
  does the Little Sumpin' 15.5 gal keg (#12920) count, and is the
  workbook's NOT IN TERRITORY for Union / Essex right? The Hub, Account page
  and assistant now follow the workbook; the Incentive Tracker's own "Stores
  To Target" list still includes those accounts until its generator is
  fixed.
- [x] **Photo labels: run one more SQL file** (Gavin, done 2026-10-02): Supabase SQL Editor,
  run `supabase/migrations/20261003090000_photo_labels.sql`. Lets a photo
  be Uncategorized, adds optional Brand / Program labels and Edit Labels on
  your own photos. Until then photos still save (without brand / program).
- [ ] **Drafts + recovery: one device check** (Gavin): on the iPhone, write a
  note, turn on Airplane Mode, Save (it should say Pending Upload), turn it
  off, tap Retry. Same with a photo: it should sit under "Not Yet Saved"
  until Retry. Built and tested in a desktop browser with the network cut;
  not yet tried on a real phone or the home-screen app.
- [ ] **Exceptions: look it over** (Gavin): Manager -> Exceptions. 461 tap
  surveys are past the 60-day rule in the 2026-09-23 export -- decide
  whether some on-premise accounts should be exempt (REPORTING_REQUEST.md
  10.4). Approved pitches / sell sheets / visit records / an issue log are
  the asks in section 10.
- [x] **Notes + photos: run the SQL** (Gavin, done 2026-10-02): Supabase SQL Editor, run
  `supabase/migrations/20261002120000_account_notes_photos.sql`, then
  `supabase/seed/account_assignments.sql` (re-run the seed whenever
  accounts/generate.py runs after a reassignment). Until then the Account
  page says notes / photos need the update and the hub's marks keep working.
  Then on the phone: Add Note (with and without a follow-up date), Add
  Photo -> Take Photo (allow the camera) -> Save, reload, see both; preview
  as a rep and check nothing can be added.
- [ ] **Map: one live check** (Gavin): My Accounts -> Map. Pins should load
  (Census geocoder, first time a few seconds per 200 accounts). Accounts it
  cannot place are listed under "Not on the map". If you can get validated
  coordinates from Encompass, drop them in `accounts/geo.csv`
  (customer_num,lat,lng,source) and re-run accounts/generate.py. Before
  heavy use, decide on a tile provider (OSM's free tiles are for light use).
- [ ] **Incentive Performance: confirm the 12 definitions** (Gavin): the
  manager page /performance/ lists them under "Definitions to Confirm";
  nothing financial is calculated until they are answered and P1-P4 in
  accounts/REPORTING_REQUEST.md section 9 are available (money data covers
  only Jan-Mar 2025 today).
- [ ] **Breakage / out-of-code for September** (Gavin): the Fusion
  Comparison export, when ready -- rolling-distribution/README has the step.
- [ ] **Account assistant: controlled pilot** (Gavin; api/README.txt
  "CONTROLLED PILOT" has the exact clicks). (1) Supabase SQL Editor: run
  `supabase/migrations/20260930210000_assistant_usage.sql`. (2) Anthropic
  console: a dedicated key with its own spend limit. (3) Vercel env:
  `ANTHROPIC_API_KEY` + `KDH_CHAT_USERS=<your email>` on PREVIEW only.
  (4) Open a preview deployment, sign in, My Accounts -> account -> Ask.
  (5) `node tools/assistant-eval/run.mjs --base <preview> --cookie
  "kdh_at=..." --rep "Mike Ast" --account 81006` and read the report
  (answers, tokens, latency, est. USD, numbers not found in the record).
  (6) Same with `--models claude-opus-5-5,claude-sonnet-5-5` to pick the
  model. (7) Production: key + 2-3 reps in KDH_CHAT_USERS +
  `KDH_CHAT_DAILY_USD=10`; watch the ledger a week. (8) Clear
  KDH_CHAT_USERS. Cost per question is an estimate ($0.05-0.07) until the
  ledger says otherwise. Tell me anything the report flags.
- [ ] **Friday: September recap on the hub** -- remove the `note` / `sub`
  from the September entry of INC_MONTHS in hub/hub.js so the September
  programs list under Previous months (they are "ended" from Oct 1), then
  bump the hub.js tag. If the recap needs a card per program rather than
  the one-line rows, say so.
- [ ] **My Accounts: Encompass exports + 14 definitions** (Gavin): read
  accounts/REPORTING_REQUEST.md. Essential: E1 customer master with
  contacts / hours / instructions (private folder or Supabase, never the
  repo), E2 route schedule, E3 invoice history with lines (quarterly
  slices under the 100k cap), E4 accounts receivable, E5 backorders /
  pre-orders / allocations, E6 invoice PDFs or their URL format. Confirm
  the definitions in section 4 (Next Available Date, "17 Wed", invoice
  statuses, Close Dated / Stagnant / Distribution void, account suffixes
  and the (HH) ledger, AR signs, Assets, Customer Users, license lookup,
  stops_2026). Decide who may see dollars (receivables, prices) before
  any appear on a rep page. Live integrations (orders, payments, sync,
  iSellBeer, DSDLink, PayLink) wait for documentation.
- [ ] **October incentives: answers still open** (Gavin): Lagunitas -- does nothing
  pay until a rep has 3 new PODs (as built), or do the first PODs pay $10?
  Four Loko cases: send a fresh cases export (the "volume" file had placements
  only). Is "Long Drink Intro" (deck title slide, no slide) a program to add?
  Answered 2026-10-07: Four Loko = cases vs last year + new placements, no
  payments; Industrial Arts off-premise = all 16oz / 19.2oz / 12oz, on-premise =
  Wrench draft only; draft conversion ends Oct 23; Touchdowns & Tea Oct 31.

- [ ] **Accounts: one live check on Vercel** (Gavin): signed in as a rep,
  open kohlerdisthub.com/accounts/ and confirm the list shows only that
  rep's accounts, then open kohlerdisthub.com/hub/data/accounts.js in the
  same browser and confirm it shows ONE rep (the middleware rewrite). If
  it shows everyone, tell Claude: the rewrite header needs the
  @vercel/edge form. (2026-09-30)
- [ ] **Accounts: re-run the backtest after each rolling month** (Claude, when
  a month lands): `python3 accounts/backtest.py` after `accounts/generate.py`;
  if lapsed buyers drift toward the baseline or reorders fall under ~60%,
  retune the thresholds in `accounts/patterns.py` (README says which).
- [ ] **Accounts: the reporting request** (Gavin): `accounts/REPORTING_REQUEST.md`
  -- daily invoice history and a customer master with active status are
  the two essentials; rep/manager IDs, a rep-safe inventory feed, pitches
  and sell sheets follow. Say how a shared account should behave if
  Encompass can assign two reps. (2026-09-30)
- [ ] **Try "View as rep" from your phone** (Gavin): manager home -> View
  as rep -> pick a rep -> walk Incentives -> a supplier -> a program ->
  Potential accounts -> an account -> Back all the way -> Exit. Anything
  that still feels cramped: a screenshot points straight at it.
  (2026-09-30)
- [ ] **Check "Confirm email" is OFF** (Gavin): Supabase -> Authentication ->
  Sign In / Providers -> Email. With it on, a new person's first sign-in
  mails a link instead of signing them in. (2026-09-29)
- [ ] **Designed sign-in email** (Gavin, optional): paste
  `supabase/email/magic-link.html` whole into Supabase -> Authentication
  -> Emails -> Magic Link (Source view) and again into Confirm sign up,
  replacing the one-line version. Navy header, Sign in button, the code
  in big type. (2026-09-28)
- [~] **Try "Add to Home Screen" on one iPad** (Gavin): open
  kohlerdisthub.com/rep/ in Safari -> Share -> Add to Home Screen -> open
  the "Dist Hub" icon -> sign in with the emailed code. Confirm it opens
  full-screen at the workspace and the Back bar gets you around. If IT
  prefers to push it, a "web clip" for https://kohlerdisthub.com/rep/ in
  their MDM does the same thing on every iPad at once. (2026-09-25)
- [ ] **Session length** (Gavin): Supabase -> Authentication -> Sessions ->
  JWT expiry 604800 (one week) so reps are not asked to sign in daily.
  (Since 2026-09-30 an expired cookie recovers silently on /login/ when
  "Remember me" was on -- the stored session refreshes and the cookies are
  re-issued -- so a short JWT costs a redirect, not a password.)
  2026-10-05, reps still being asked to sign in: set this NOW. Each renewal
  rotates the refresh token, and a phone on weak cell service that loses the
  reply is locked out once Supabase's reuse window (10 s) passes; a week-long
  JWT cuts renewals from hourly to weekly. Also confirm Sessions has NO
  time-box / inactivity timeout, and (if shown) raise "Refresh token reuse
  interval". Reps who signed in before 2026-10-02 have no server cookie and
  need to sign in one more time.
- [ ] **Roll out to reps** (Gavin): send the kohlerdisthub.com link (or the
  home-screen steps) to the reps; DMs get the same link and see everything.
- [ ] **Vercel plan** (Gavin): Hobby is for non-commercial use; move the
  project to Pro when it is clearly in company use.

## Next -- to build (in order)

- [ ] **Weekly rep email** (Monday, Resend): where you stand in every
  program you are in, what ends this month, your open follow-ups. Sent
  from a scheduled job (Vercel cron or Supabase edge function); the copy
  comes from the same summaries the hub renders.
- [ ] **Write-back on the other rep pages** where it fits: Carbliss
  on-prem targets and Red Bull buying accounts could carry the same
  Done / Follow up / Not now strip, reading the same table.

## Later -- ideas kept handy

- Accounts page, once the invoice-level history and customer status land
  (`accounts/REPORTING_REQUEST.md`): reorder cadence in weeks, "last
  ordered on <date>", closed accounts hidden, inventory "in stock as of"
  and approved pitches on Products to discuss.

- Home-screen icon badge / push notifications (needs a service worker
  and, on iOS, the installed app; only worth it once reps live in the app).
- Per-rep "usual order day" from daily-grain invoice history, so a rep's
  visit list is sorted by who orders today (waiting on the data below).
- Sell sheets from the Brands table on each program card.
- Sales-assistant chat (the prompt Gavin drafted) once live data is in
  Supabase -- estimate: Sonnet-class model, well under $50/month at 27 reps.

## Tabled -- waiting on data or a signature

- Encompass -> Snowflake -> Supabase pipeline (Snowflake agreement not
  signed yet). Unblocks: live sales numbers, the display auction tracker
  moving off weekly CSV pulls, order-day derivation, the assistant.
- "Today's route": Encompass Stops is delivery routes, not sales visits;
  reps set their own days. Needs daily-grain 2026 invoice history (Google
  Drive), a Stops export without the invoice join, and a Brands sample.

## Product direction (Gavin, 2026-09-30)

- **Starred products + inventory alerts** -- wait for an accurate
  inventory feed (RDE or Snowflake). Confirm the sellable-inventory field,
  when orders reduce it, how allocations / holds / receipts move it, and
  the refresh delay before any alert is promised. Alerts never reserve
  stock.
- **Account-aware assistant + mock pitch** -- built 2026-09-30 and hardened the same day (server-side account authorization, server-built record, tools on the full record, ledger + spend limits); waiting on the pilot above. Snowflake later adds freshness (daily grain, invoices, inventory); route-wide / comparable-account questions need a permission rule first.

## Done

- [x] **Non-Buy Reports (2026-10-08, merged to main the same day after Gavin's approval):** one engine (nonbuy/engine.js, pure) + one static source
  (source-static.js) + two experiences: managers (authorized reps, Shopify-style product dialog, account filters
  incl. new Chain / Customer Type fields, Non-Buyers / Missing Products / Lapsed Buyers, by account or by
  product / brand / supplier, Zillow-style review, results grouped by rep, Save Report / Template / Target List,
  Excel / CSV / PDF) and reps (My Route, Non-Buyers, Last 90 Days, eligible products only, compact rows).
  Eligibility per account x product from Brand Permissions; unknown is never permission; whole-month dates
  with requested vs effective vs coverage; reconciled against Gavin's Dave Ehlers Lagunitas exports.
- [x] **Manage Programs v3 (2026-10-08):** eight steps with Objectives on its own (name / what is measured /
  unit / qualification / who it counts for; the stored metric derived from them), Dates & Rules showing only
  each objective's own settings (per-objective Non-Buy Lookback with an explicit fixed anchor, comparison /
  baseline periods with Same Period Last Year, activity dates for merchandising; hidden values cleared), the
  product dialog limited to the suppliers chosen in Basics (removal explains what goes with it; stale
  selections blocked in the UI and by the database), readable type, and a Review & Submit of stacked
  sections with Edit / Return to Review, Data Readiness and Progress So Far kept apart ("Not Yet Available"
  vs a real 0, goal always shown). Needs the third SQL file under Now.
- [x] **Manage Programs v2 (2026-10-08):** spacious builder (1120px, 16px inputs), plain copy, a participant
  picker that keeps scroll / focus / search while ticking (bulk actions scoped to the filter), SKU-level
  Add Products dialog (search, filters, deliberate whole-group add, dedupe, Remove -> explicit exclusion,
  Restore), Advanced Product Settings, "Which Accounts Count?" cards, recoverable Delete Program ->
  Deleted Programs -> Restore (never republished by itself) -> approver's Publish Again. Needs the second
  SQL file under Now.
- [x] **Manage Programs v1 (2026-10-08):** seven-step builder, drafts / duplicate / templates,
  approval with versions + retroactive-or-future recalc, notices, test programs, closeout, and
  the approved definition drawn by the existing hub rows / MPO cards. Waiting on the SQL steps
  under Now.
- [x] 2026-10-08 **MPO cards: Details + Potential Accounts side by side ("Option 2 -- Shared Product List").** Under every
  On-/Off-Premise MPO summary: a muted amber Details control and a wider muted green Potential Accounts (N) control, one
  open at a time, inline. Potential Accounts = one shared "Qualifying Products (N)" fold, then compact account rows (name,
  town); tapping a row shows what is still needed there and only the products open at that account (an account that can
  take every product links to the shared list instead of repeating it). Spirits flags that its SKU list is not on file.
  Rules and counts unchanged. Nothing for Gavin to do.
- [x] 2026-10-08 **MPO cards: Potential Accounts inside the card.** "View Eligible Accounts" is replaced by a
  collapsed list of the accounts on the rep's route that can still earn the program's credit, with the exact SKUs and
  what is left. Molly's and Wine now have eligibility rules. To confirm (question N1): do on-premise placements count
  for the Off-Premise Molly's / Wine MPOs? The tracker counts them today, so the list includes on-premise accounts.
- [x] 2026-10-08 **My Accounts + program wording.** My Accounts filters read All Accounts / Needs Attention /
  Follow-Ups, and a filtered list shows the filters, the count and Clear. Program pages say Goal / Current /
  Remaining. Eligible-account rows say what is left ("Needs 1 more qualifying product · has 2 of 3"). The
  Rep Home redesign tried the same day was reverted at Gavin's request: Rep Home keeps the layout the Manager
  Home uses. No data, rule or permission changed.
- [x] 2026-10-07 **Rep account base = the active Customers export** (territory-accounts/customers_active.csv,
  tools/customer_base.py): rep books, My Accounts, Incentives target lists, the Lytt and Carbliss bases;
  Core Market / Southern District rules written down; MetLife stands out of program bases.
- [x] 2026-10-07 **Off-Premise MPO rules confirmed**: core base rebuilt from the active Customers
  export (off-premise, core areas, "Sales" by county, no Whole Foods; 506 accounts); Constellation = 75% of
  the assigned goal, rounded to the nearest whole number, by Oct 31 (2 reps achieved).
- [x] 2026-10-07 **October Off-Premise MPO refreshed; Lytt counts Aug 1 - Oct 31**: new Lytt,
  Molly's and Wine exports loaded; Lytt = 50% of the core base with 3+ SKUs bought since Aug 1
  (fully returned SKUs not counted -- to confirm). Constellation left on the fall export until Gavin
  says whether the new October-only file should score it.
- [x] 2026-10-07 **Incentives page is incentives only; MPO trackers open By Program**: the
  hub lost its On/Off-Premise MPO tabs and Program View's Type filter (MPOs live on their two
  trackers); both MPO trackers now open on View by Program for every manager, DMs included.
- [x] 2026-10-07 **Carbliss on-premise MPO = the Carbliss Leaderboard's program**:
  the October objective now counts the leaderboard's L90 buyers (bought Aug 1 -
  Oct 31, in the rep's own core on-premise base) instead of a separate Sep 1 -
  Oct 31 export. MPO tracker card, hub, Account page and leaderboard agree rep for
  rep (182 in rep bases). Credit is still 40% of the rep's base. Weekly refresh is
  just `python3 carbliss-mpo/generate.py` -- it rebuilds the MPO too.
- [x] 2026-10-07 **Manager Home + Rep Home rebuilt**: compact left-aligned header,
  tools grouped into clear sections, one clickable card style everywhere (icon,
  title, one line, status only where real data exists, chevron). Incentive
  Performance now has a card; the rep home gained Inventory and Account Map cards.

- [x] 2026-10-07 **Company photos + cleaner sign-in**: the team photo, the
  mission line and the Beer / Wine & Spirits / Beyond Beer photos from
  kohlerdistributing.co on the sign-in page, both home pages and the Wine &
  Spirits / Carbliss / Tap Tracker headers. TO DO (optional): send the
  ORIGINAL photo files (the ones on the website) -- today's were cut from
  screenshots and are only ~580px wide, so they look soft on large screens.

- [x] 2026-10-07 **Kohler branding, light and dark**: Kohler blue actions, navy
  headings and sidebar, small gold accents, the official logo in the header,
  sidebar and sign-in, and the warehouse photo on the desktop sign-in. TO DO
  (you): (1) if you want the website's exact colours and font, allow
  kohlerdistributing.co in the cloud environment's network settings or send
  the official values -- today's colours are sampled from the logo files;
  (2) re-paste supabase/email/magic-link.html into the Supabase email
  templates (it now uses Kohler navy / blue and the new app name).
- [x] 2026-10-06 **Carbliss MPO tracker** (/carbliss-mpo/): fixed program period Aug 1-Oct 30,
  house buying-account total, each rep's "X of Y assigned accounts / Z% penetration",
  every account (buyers and nonbuyers) with Bought Aug 1-Oct 30 / Bought Since Launch /
  Last Carbliss Purchase, Sales Through date, `--finalize` freeze. Rep home tile, manager
  card, Programs sidebar item. See the Now item for what to confirm.
- [x] 2026-10-06 **Official SKU lists loaded** for the October Off-Premise MPOs (Corona
  Innovation 11, Lytt 6, Molly's 5, Wine 60). Corona and Lytt matched the reports
  exactly and are now confirmed. TO DO (you): Carbliss + Spirits follow-up
  (on-premise) and the October incentives -- REPORTING_REQUEST section 13.
- [x] 2026-10-06 **Incentives use the same Eligible Accounts page** as the MPOs (goal,
  What Counts, Qualifying Products, search, accounts; Back returns where you
  came from), and every product shows as one line ("Corona Non-Alcoholic
  4/6/12 oz Btl"). TO DO (you): send one SKU CSV per program -- list in
  accounts/REPORTING_REQUEST.md section 13 -- so each program shows its exact
  products instead of the whole brand.
- [x] 2026-10-06 **Eligible Accounts, simplified**: from an MPO card, "View Eligible
  Accounts" opens one focused page -- goal / current / still needed, a folded
  Qualifying Products list (product, package, size), search, and the accounts.
  Back returns to the exact MPO screen (same rep, month and scroll), also after
  opening an account. Nothing to do on your side.
- [x] 2026-10-06 **Hub: a manager stays in Manager Mode after viewing one rep**:
  tapping Change on the "Viewing <rep>" chip used to leave the hub in rep mode, so
  the next rep you picked showed "Choose Another Rep" instead of "‹ Program View".
  Nothing to do on your side.
- [x] 2026-10-06 **Cards easier to read**: every incentive and MPO card leads with
  the goal (with its unit and the rule behind it), then Current / Still Needed in
  large dark numbers, one bar, the deadline and View Eligible Accounts; weight
  and full rules sit lower. Supporting tables fit their content (the phone
  placement counts were off-screen), empty columns are hidden with a note, and
  the manager's rep cards are no longer dark-on-dark in light mode.

- [x] 2026-10-05 **Program eligibility, one calculation**: Corona Innovation,
  Lytt and Carbliss 40% show "54 of 69 Required Placements / 15 More Needed",
  the goal math with each rule's status, and three views -- Eligible Accounts
  (with the reason the data supports, filter by product / rep), Qualifying
  Products (ProductID + package; the non-counting packages of the same brands
  listed), Credited Results. The Account page's Program Opportunities name the
  exact products still open there, and Back returns to the same list. Tracker
  and calculation agree for every rep. Corona Innovation now respects the Core
  Market (it used to list Essex / Hudson / Union accounts).

- [x] 2026-10-05 **Save for Later on Add Photos**: a rep in a rush keeps a
  half-done photo record on the phone (no checks, no upload); it is listed on
  the account and in a "Saved for Later" strip on My Accounts; Continue
  finishes it.

- [x] 2026-10-05 **Add Photos redesigned for the phone**: the selected type
  decides the form (POD / Display, Cooler Stickers, Windows, Signage, Menu
  Placements, Tap Handles, Other); no generic Caption / Brands / Program /
  Products; one decision at a time with chips, steppers, a $ keypad and a fast
  SKU / brand search (this account's products first); several items under one
  photo, folded into one-line rows; footer Save above the keyboard; activity
  cards and exports show the items. Tested at 375 / 390 / 393 / 430 light + dark.

- [x] 2026-10-05 **Tap Tracker reads Hub tap surveys**: the page merges the
  tap surveys reps take in the Hub (viewer's own sign-in, a rep gets only
  their accounts) with iSellBeer's -- newest survey per account is the current
  lineup, older ones go to Survey history; never-surveyed accounts appear;
  footer says how many Hub surveys are included. No file to upload. Tap lines
  must be answered Ours / Theirs before saving.

- [x] 2026-10-05 **Tap lines Ours / Theirs in the Hub**: a rep's Tap Handles
  lines label themselves from Kohler's territory rulebook (the Tap Tracker's
  US vs THEM workbook, shared/data/tap-rules.json -- equal to the audit on all
  6,870 surveyed taps); only a brand the rulebook does not cover asks the rep.
  Saved with its basis (territory list / rep's call), shown in the viewer,
  Account Activity ("3 ours · 1 theirs") and the Excel export.

- [x] 2026-10-05 **Merchandising: PODs + Signage, Excel export**: capture
  lists now match Gavin's (off-premise Display, PODs, Cooler Door, Window,
  Signage; on-premise Tap Handles, Menu Placement, Signage), and the
  Merchandising page has Download Excel -- one row per product line like
  iSellBeer's reports, clickable photo links (7-day links for Hub photos,
  iSellBeer's own for imports), Open in Hub per row, an About sheet.

- [x] 2026-10-05 **iSellBeer import at full scale**: PDF pages matched by the
  photo link printed on each page (any order, split or re-saved PDFs too),
  stored as that photo's report page (no second photo), later PDFs attach to
  records already in the Hub, records sent 150 per call with upload progress.
  The Account page stays clean with 80+ imported records: Overview shows one
  "Imported From iSellBeer" summary row, Account Activity folds imports by
  month, the gallery pages 24 at a time with a Source filter and loads images
  only as they come into view. Tested with Report (68) (899 records, 80 on one
  account).
- [x] 2026-10-05 **Photo admin + merchandising SQL run** (Gavin): photo admin
  flag set on the work sign-in; removing any photo verified live.

- [x] **Merchandising records + iSellBeer import + recap** (2026-10-04):
  photos attached to records (Display, Window, Cooler Door, Tap Handles,
  Menu Placement, Other Activation; subtypes; premise defaults), fast
  capture (native image capture, several photos, retake / remove, caption,
  location, brand tags, program, product / tap lines with units), record
  drafts + retry without duplicates, gallery with filters and a viewer (zoom,
  information panel, Last Observed for imports), one Account Activity event
  per record, Add Evidence from a program card (evidence, not credit); the
  iSellBeer importer (CustomerID-only matching, stable keys, every line kept,
  US/THEM + audited correction kept apart, hyperlink targets, PDF pages
  matched by hand, reconciliation before writing, review queue); the manager
  Merchandising recap (filters, separate counts, Download CSV, printable
  recap with readable photos). Also: one shared program-product eligibility
  rule (Lagunitas Sprint = its export's 13 products, territory respected),
  "Program Opportunities" cards (Program -> What to Sell -> What Is Needed ->
  Deadline, the rest in Details), "No purchases in the available history",
  "Check with the buyer; ordering history does not explain the gap", one
  address block, alert priority explained, the assistant's availability check
  with the setup step for managers (and "it does not look at photos"),
  managers land on Program View with a rep filter, explicit Download CSV /
  Export Recap buttons in the hub, Exceptions grouped by rep / type /
  urgency / account with a data-sources panel.
- [x] **Account workspace, third build** (2026-10-03): Rep Home rebuilt
  (search, prominent My Accounts, labelled attention counts, consistent
  tool buttons); My Accounts toolbar (title + List/Map, accurate "Also N
  ..." wording); Account Activity timeline (notes, follow-ups, photos,
  program marks, tap surveys, monthly purchase activity -- never a
  "visit"; type filters, search, Load Older); "Programs This Account Could
  Help Complete" with Selling Resources (requirement, no-approved-pitch
  notice, sell sheets, packages, dated warehouse snapshot); drafts +
  upload recovery (Draft / Pending Upload / Uploading / Saved / Upload
  Failed -- Retry, per person on the device, retry without duplicates);
  photo labels + filters; manager Exceptions page; shared/kdh-data.js
  data-source layer; one 44px button system.

- [x] 2026-10-02 Stay signed in: reps sign in once per device and stay signed
  in until they tap Sign out (the server keeps the session in a protected
  cookie and renews it; Safari / home-screen apps no longer lose it). A
  remembered email opens straight on the password box so the phone's saved
  password fills it. Nothing to switch on; each rep signs in one last time
  after it deploys. Leave Supabase Auth -> Sessions time-box / inactivity
  timeout OFF, or sessions will end on that schedule.
- [x] 2026-10-02 Account map (List / Map in My Accounts, clustered pins, a
  sheet with Open Account + Directions, Use My Location only on tap); notes
  with follow-up dates and account photos by type (Display / Window /
  Cooler Door / Tap Handle) in shared storage, read-only in preview;
  Account Details grouped with Add Note / Add Photo / Ask About This
  Account up top; six starter questions in Ask; concise program titles
  everywhere (full name kept on the program screen); Inventory in the rep
  bottom bar; manager Export Data (CSV) + Export Recap (print / PDF);
  manager-only Incentive Performance page (no numbers until definitions
  are confirmed); measured AA contrast fixed in both themes; reporting
  request section 9. Steps for Gavin are under Now.
- [x] 2026-10-02 Navigation + account workspace rebuild: bottom bar (Home /
  My Accounts / Programs / More) on phones and iPads, a labelled sidebar on
  desktop, Back and every list remembering where you were; My Accounts rows
  lead with one action; the Account page is Overview / Products / History /
  More; Products show Kohler warehouse stock "at last update"; Programs show
  progress without drilling in; MPO pages, Tap Tracker (account search first)
  and Red Bull (Your vs Team progress, period ended) cleaned up. Nothing for
  Gavin to switch on -- check it on the phone once it deploys.
- [x] 2026-10-01 Every rep dataset served per rep: a signed-in rep's browser now
  receives only their own rows of the incentive data, the MPO month files,
  the Tap Tracker, Red Bull and Carbliss (tools/rep_slices.py writes the
  copies; middleware.js serves them; leaderboards and team totals stay as
  counts with no account names). Raw CSV exports and account size are
  refused to reps. Supplier logos now load for reps (they saw initials).
  Checked live by Gavin on 2026-10-01: rep pages work as before.
- [x] 2026-10-01 Account size (class / decile) shown to managers only; manager
  switcher shows names only, the personal account as "(Personal)".
- [x] 2026-10-01 Visual refinement, third pass: Inter everywhere (self-hosted),
  one type scale, neutral Shopify-style surfaces with a single Kohler blue
  accent, no decorative gradients, Title Case headings / nav / tabs, shorter
  wording ("3 Action Items", "View Follow-up", "2 Products Needed",
  "Accounts to Complete"), compact Needs Attention strip on Rep Home,
  compact My Accounts header (Reason / More Filters / Data controls),
  small Directions button beside the address, shorter assistant intro.
  Nothing for Gavin to do; data, rules and permissions unchanged.
- [x] 2026-10-01 Redesign, second pass (Jobber pattern): rep home opens on
  "Needs attention on your route" (reorders, lapsed buyers, surveys due,
  each opening the filtered list); Needs attention grouped by reason; the
  account page is a record -- status, address, Directions, Next actions,
  a two-line buying summary with a way to the evidence, contact &
  servicing, data notes folded; Red Bull opens on progress and the
  accounts to finish with what to sell at each, rules under How it works.
- [x] 2026-10-01 Navigation and readability pass (Shopify iOS + Todoist web
  references): labelled Home / Accounts / Incentives (+ Team for managers)
  in the top bar on iPad and desktop and as a bottom tab bar on phones, the
  current one marked; the big "Back to Rep Home" button replaced by a quiet
  Back only where it adds a destination; account menu without duplicate
  links; My Accounts filters as one segmented control with counts, one
  attention block per account; Account page opens with Focus, then grouped
  Details & servicing; rep home tools as compact cards. Fixed: an ended
  program showing as "ending soon" in Focus. Gavin: try it on the iPhone and
  iPad and say if any destination is missing from the tab bar.
- [x] 2026-09-30 Account assistant v2: the server authorizes every question
  against the rep's route (or the DM's team), builds the record itself,
  answers arithmetic through three server tools on the full record, prints
  period + load date + lookups + links under every answer, keeps pitch
  practice grounded (simulated objections labelled, no invented prices /
  stock / competitor facts), separates transcripts per viewer and forgets
  them on preview change / sign-out, logs every answer to a usage ledger
  with per-person and everyone daily limits, and takes the model from env.
  Live pilot still needs Gavin's key (Now).
- [x] 2026-09-30 Account assistant: My Accounts -> Ask. Questions about one
  account's buying, alerts, patterns, programs, notes and taps, answered
  from the page's own data with the period stated; Practice a pitch (the
  assistant plays the buyer) with Get feedback. Needs the API key (above).
- [x] 2026-09-30 Hub Incentives: "Previous months" toggle (August live,
  September shows "September recap coming Friday") replaces the Ended
  programs fold; the doubled "Ended Ended" date is fixed.
- [x] 2026-09-30 My Accounts on the Encompass pattern: the Account page is
  four sections (Overview / Sales & Products / Invoices & Balances / Tasks &
  Resources) with Directions, service type, size and stops on the Overview,
  an account-context product list (previously purchased, all eligible by
  territory, search, filters, warehouse availability with its date, program
  lead tags, Carbliss sell sheets), a monthly purchase record and honest
  unavailable states for invoices / AR / tools; CustomerID on list rows;
  consolidated reporting request rewritten.
- [x] 2026-09-30 Touchdowns & Tea is one card with the Off-Premise and
  On-Premise programs separated inside it (progress screen, hub program
  screen and the full card); programs still waiting on their first export no longer show on the
  rep hub; Lagunitas, Famosa, Industrial Arts, Four Loko, White Claw, Mike's
  Harder and Cayman Jack marks cut from the October deck. Still no Twisted
  Tea or Heineken artwork -- send a logo file if you want those chips.
- [x] 2026-09-30 October 2026 tab on the Incentive Tracker and the hub: MABI
  Fall Single Serve, Lagunitas Sprint to the Finish, Push Famosa and
  Industrial Arts Target Account Launch scored from their RDE exports; Four
  Loko and the Sam Adams seasonal conversion as structure-only shapes; the
  deck's continuing programs carried over with October windows. October is
  the default tab.

- [x] 2026-09-30 Carbliss targets: YTD vs rolling-90 Carbliss buyers with a
  "fell off rolling 90" alert and list (rep / team / company scope), Pitch as
  the first column, and a sell-sheet picker per flavor in the pitch panel
  (Pineapple has no sheet in the Brands file yet). Refresh needs the L90
  export saved over `carbliss_buyers_l90.csv` alongside the two Eval files.

- [x] 2026-09-30 Light / dark: follows the device until chosen, a labelled
  switch in the bar on every page (phone, iPad, desktop), choice saved per
  device, "Use device theme" to go back, no wrong-theme flash (every page
  sets data-theme in <head> before paint).
- [x] 2026-09-30 Sign-in remembers the email (prefilled next visit), keeps a
  valid session when "Remember me" is on (no password until it lapses),
  "Not you? Switch account" clears the identity for the next person; a
  saved email never signs anyone in and no password is stored.
- [x] 2026-09-30 Rep leaderboards on Red Bull (Core+ accounts, ties by total
  buying accounts) and Carbliss (target accounts carrying Carbliss, ties by
  share): rank, rep, result, period, data date, own row marked, ties shared,
  aggregate counts only -- no other rep's accounts. Carbliss's header now
  shows the build date from the data instead of today's date.

- [x] 2026-09-30 Buying alerts + patterns on My Accounts: possible reorder,
  lapsed buyer and buying-less-often alerts per product from each account's
  own history (monthly grain, last complete month as today, thresholds
  documented and backtested: reorder flags bought again 72-85% of the time,
  lapsed 52-69% vs a 95% baseline), evidence lines and reason / brand family
  filters on the list, Focus + alerts table + a Buying patterns section on
  the account page (frequency, order size, volume in labelled equal-length
  periods, new placements repeat vs one-time, switches within a family,
  seasonal / no-longer-bought). `accounts/patterns.py` + `backtest.py`;
  reporting request updated (invoice dates, product status / supersession,
  seasonal flag). No resolve / snooze state yet.

- [x] 2026-09-30 "Remember me on this device" on both password steps of
  the sign-in page, checked by default: stay signed in for 30 days, or
  unchecked, signed out when the browser closes. The choice is
  remembered per device.
- [x] 2026-09-30 Accounts tab + Account page (`accounts/`): a rep's assigned
  accounts as a searchable list with what needs attention (follow-ups,
  program leads, reorder checks, survey due); managers see their team with
  the rep on every row and rep / attention filters; one account page that
  leads with up to three supported actions and then Sales & reorders
  (Fusion monthly history), Programs (this account's credit / lead /
  could-qualify status), Products to discuss, Notes & follow-ups (read
  here, edited in the hub), Taps & visits. Opened from the rep home,
  the hub's account screen and the Tap Tracker; Back returns with
  filters and position. A rep's browser receives only their own account
  slices (middleware rewrite + 403 on other reps' slices). Verified at
  375 / 390 / 430 / 820 / 1366, as rep, DM, manager and preview.
- [x] 2026-09-30 Responsive cleanup, no redesign: Tap Tracker drill panels
  stack on phones (title and count, description at full width, actions,
  then one labelled row per account with Ours / Theirs in words, visit
  date with its due badge, corrected-tap count); the floating Reset is
  gone (the toolbar's Reset All stays); county chips and brand names
  use the full width; the explanatory footer folds. Carbliss tiles and
  filters fill the phone, the Rep column is hidden for a rep, and the
  account name stays pinned while the table scrolls. Checked at 375,
  390, 430, iPad and desktop as a rep and in manager preview.
- [x] 2026-09-30 Mobile rep experience rebuilt on the Encompass pattern:
  rep home is a short identity line, a "Follow-ups (N)" row that opens
  in place, and compact tool rows; the hub runs Incentives -> supplier ->
  program -> account list -> account as separate screens (one program
  only skips the supplier step), each program a short summary (name,
  deadline, what qualifies, "6 of 8 accounts", "2 more accounts needed",
  one bar, the goal rule in small type, scoring and history folded);
  account lists are searchable rows (name, town, one opportunity line)
  and Back restores the list, its search and scroll position. Percent
  goals read as account counts from the tracker's own eligible base.
  MPO tracker cards use the same summary. "View as rep" (account menu
  and a button on the manager home) opens a searchable rep picker; one
  small "Previewing <rep> · Exit" chip on every page; a preview shows the
  rep's own marks with saving switched off; Exit returns to the manager
  home. Theme and Sign out moved into the account menu. Verified at 375,
  390, 430 and iPad against a real rep sign-in, screen for screen.
- [x] 2026-09-28 Rep pages simplified: one "Back to My Dashboards" button
  on every page, hero photos / crumbs / long intros gone for reps, MPO
  header stacked (name, premise, manager) with no Step badge, objective
  cards down to one status pill + three facts, hub without a lone tab.
- [x] 2026-09-28 GitHub Pages unpublished; kohlerdisthub.com is the only
  copy. Rep lock hardened: names matched forgivingly (Michael/Mike,
  Daniel/Dan ...) and a rep whose name matches no roster sees a notice
  instead of everyone's data; Team Activity flags such names.
- [x] 2026-09-28 Site-wide design system: one token set (light + dark),
  one top bar on every page (logo, page name, back to dashboards, Team,
  theme, who is signed in, Sign out), Oswald + Source Sans 3 everywhere,
  the 18 dashboards re-skinned through `shared/kdh-skin.css` with their
  data and logic untouched. Notes in `shared/README.txt`.
- [x] 2026-09-28 Manager page rebuilt on the rep workspace design: same
  top bar (Team activity, Rep workspace, light/dark, name chip), building
  photo, five sections of the one card component with live MPO / Red Bull
  status; all 19 dashboards carried over. The old dark home.css retired.
- [x] 2026-09-28 "Your follow-ups" strip on the rep workspace: count,
  done-this-week, the three newest flagged accounts with program and
  note, each linking into the hub; a nudge line when nothing is flagged;
  follows the manager's "Viewing as" switcher.
- [x] 2026-09-28 Team Activity page (/team/, managers only): one row per
  rep with open follow-ups, Done this week, Not now and last activity;
  open a rep for the follow-ups with notes and their recent marks;
  "My team" (via kdh_team RPC + reports_to, rolling up through managers
  who report to you) or Everyone or one pill per DM; Open their hub /
  Preview as rep links. Linked from the manager page and the rep
  workspace top bar. Migration run and reports_to verified live.
- [x] 2026-09-29 Mobile-first pass: every page audited on iPhone and iPad
  (portrait and landscape) as manager, rep and preview; top bar fits with
  the Viewing / Previewing chip on its own row, no text under 12.5px
  anywhere, tap targets at least 36-44px, Carbliss pitch readable without
  sideways scrolling. Rep view can be simulated from a phone.
- [x] 2026-09-29 A manager opening a tracker or the hub for one rep sees
  exactly that rep's page (no view bar, no other reps); the "Viewing
  <rep> · Change" chip is the way out. Bigger, solid Back button.
- [x] 2026-09-29 UI + navigation overhaul: one readable font (no
  condensed type, no all-caps), light default, banners off every working
  screen, Back buttons that name where they go, a "Viewing <rep>" chip
  for managers, hub program rows that read qualifies / progress with
  units / next step, still-needed totals by unit, closed suppliers still
  scannable, ended programs in a history section, MPO Program View
  without repeated tiles, Rolling with results first and "More filters",
  Carbliss expanded rows in-theme with plain labels, inventory freshness
  stated honestly.
- [x] 2026-09-29 Password sign-in no longer stalls on "Signing in..."
  (the page now uses the session the sign-in call returns). Carbliss
  on-premise targets scoped to a district manager's team.
- [x] 2026-09-29 DMs open both MPO trackers by rep (their team's picker,
  then the rep's programs); "Default" and "Office Tell Sell" no longer
  appear in any rep list.
- [x] 2026-09-29 District managers see only their own team: the hub
  picker, both MPO trackers, the rep workspace switcher, Team Activity
  and the tap tracker are scoped to their reps; VPs and Gavin still see
  everyone, and Gavin can check any DM's view with "Preview as this
  manager".
- [x] 2026-09-29 Managers open to the manager page (the home-screen app
  starts at the site root now; reinstall the icon once to pick that up)
  and Gavin's account has a "Viewing as" manager switcher there: preview
  the whole site as any manager, Team Activity included.
- [x] 2026-09-29 Password migrations run in Supabase (both the sign-up
  version and the placeholder-hash fix); one manager's password set by
  hand at her request.
- [x] 2026-09-29 Passwords from the start: a new person creates their
  password on the first sign-in (no code), then uses it every time;
  "Forgot password" goes code -> new password; only allow-listed emails
  can register (database trigger). Migration
  `20260929090000_password_signup.sql` (see Now). Supersedes the
  2026-09-28 code-then-password version.
- [x] 2026-09-28 Sign-in page redesigned: white card, two clear steps
  (email, then link-or-code) with a big code box that submits itself,
  resend with a 30 s clock, "use a different email". Oswald + Source
  Sans 3 now served from the site (`shared/fonts.css`, `assets/fonts/`)
  on the sign-in, rep and manager pages, so type no longer depends on
  Google Fonts. Designed email template written.
- [x] 2026-09-28 Gavin ran the rep_actions migration, added the code to
  the sign-in email, and confirmed the buttons save and show for a DM.
- [x] 2026-09-25 Hub write-back: Done / Follow up / Not now + note on every
  target list (incentive rows, MPO cards, detail page), saved to Supabase
  `rep_actions`, follow-ups float up, Done / Not now fold away and stop
  counting; DMs (and Preview as this rep) see the marks read-only.
- [x] 2026-09-25 Home-screen install: `manifest.webmanifest`, Kohler icons
  (192 / 512 / Apple 180), iOS full-screen tags on every rep page, starts
  at /rep/; sign-in page accepts the emailed 6-digit code.
- [x] 2026-09-25 This tracker.
- [x] 2026-09-25 Incentive Hub tile opens the hub in incentives-only mode.
- [x] 2026-09-25 Back bar on every rep dashboard; manager "Preview as this
  rep" mode; every rep page (hub, both MPO trackers, tap tracker, Red Bull,
  Carbliss) locked to the signed-in rep.
- [x] 2026-09-25 Rep workspace /rep/ (light "sales app" design, Oswald +
  Source Sans 3, light/dark toggle, NJ banner); manager page redesign
  (card grid, sections, building photo) and pruning of unused dashboards.
- [x] 2026-09-25 Rep vs manager routing: reps see only their six pages.
- [x] 2026-09-25 Sign-in mail through Resend from signin@kohlerdisthub.com
  (Supabase's mailer was rate-limited and quarantined at Kohler).
- [x] 2026-09-24 Magic-link login gate (Supabase Auth + Vercel middleware),
  allow list loaded from the Encompass users export.
- [x] 2026-09-24 kohlerdisthub.com on Vercel beside GitHub Pages.
