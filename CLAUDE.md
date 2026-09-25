# Kohler Dist Master Dashboard

Static dashboards (GitHub Pages) tracking rep performance against
various Kohler Distributing incentive programs. Each dashboard folder
(`summer26/`, `MPOs/off-prem/`, `MPOs/on-prem/`, etc.) has its own
README.txt with that dashboard's specific refresh steps (which CSVs to
overwrite, which `generate*.py` to run) -- read that first.

## Pages deploy: back on "Deploy from a branch" (2026-08-06)

This repo briefly had an explicit `.github/workflows/pages-deploy.yml`
(added 13:49 UTC, removed later the same day) that deployed via
`actions/deploy-pages`. It was added because the built-in "Deploy from
a branch" pipeline had been repeatedly hanging in `deployment_in_progress`
for ~10 minutes and failing with `Timeout reached, aborting!` after a
deploy got cancelled mid-flight by a rapid follow-up push. The Actions
workflow didn't reliably fix it either -- deploys kept hanging/timing
out (sometimes succeeding after ~9 minutes, sometimes not at all), and
switching to it required a manual repo Settings -> Pages -> Source
toggle that a Claude session has no way to verify or set (GitHub API
access to `/repos/.../pages` returns 403 through this environment's
proxy). So the user reverted: the workflow file is deleted and Pages
Settings -> Source should be back on "Deploy from a branch."

That means: pushing to `main` is GitHub's job to publish, same as
before this whole episode -- no workflow run to check, nothing to
retrigger from this environment. If the site doesn't reflect a push
after a few minutes, that's the legacy pipeline's own
`deployment_in_progress` stall, and there is no tool available in this
environment to inspect or clear it (no repo Settings/Environments API
access). Tell the user -- they can check repo Settings -> Environments
-> github-pages (or the Pages deployment history) in the browser for a
stuck deployment to cancel, or just wait, since these locks have
self-cleared before. Don't re-add a `pages-deploy.yml` workflow to
"fix" this without the user explicitly asking for it again -- it was
tried and explicitly undone.

The "Data refreshed" pill on each dashboard (reads
`data/.../sync_meta.json`'s `synced_at`, not any HTTP header -- see
each dashboard's index.html) reflects whatever `main` last had
*published*, which now depends entirely on the legacy pipeline
actually completing -- there's no run status to confirm that from here
anymore, only what the live site shows.

## Vercel hosting alongside GitHub Pages (2026-09-24)

`vercel.json` + `.vercelignore` at the root let the repo be imported into
Vercel (Pro plan, GitHub-connected) as a plain static site: no framework,
no build step, the folders are served as-is with `trailingSlash: true` so
every page's relative `data/...` and `../` links resolve exactly as they
do on Pages. `.vercelignore` drops only files no page fetches (Python,
xlsx, READMEs, the workflow). CSVs stay -- several pages fetch them at
runtime. GitHub Pages is NOT turned off; both serve `main` until Gavin
retires Pages.

The Vercel site is live at https://kohlerdisthub.com (Gavin's own
domain, bought through Vercel on 2026-09-24; kohlerdistributing.co is
Kohler's IT-controlled site and is NOT involved). Point reps at
kohlerdisthub.com, not the github.io address. The Vercel project is on
the Hobby plan for now. Next planned steps: a Supabase Auth login gate
via Vercel middleware, then live data in Supabase.

## Login gate: Supabase Auth + Vercel Edge Middleware (2026-09-24)

kohlerdisthub.com is behind a magic-link login. `middleware.js` at the
repo root runs on every request except `/login/`, `/assets/` and
favicons: it reads the `kdh_at` cookie (a Supabase access token) and
lets the request through only if `GET /rest/v1/allowed_users` with that
token returns the caller's own row (row-level security), cached per token
for 5 minutes. Otherwise a page load is redirected to
`/login/?next=...&why=...` and a data fetch gets a 401. The middleware
also answers `/shared/auth-config.js` from Vercel's `SUPABASE_URL` /
`SUPABASE_PUBLISHABLE_KEY` env vars so the sign-in page needs nothing
hard-coded. `login/index.html` uses supabase-js (CDN, implicit flow),
calls `is_allowed(email)` before sending a link so unlisted emails are
refused up front, sets the cookie on sign-in and bounces to `next`.
Schema is `supabase/migrations/20260924150000_allowed_users.sql`
(idempotent; run in the SQL Editor). `supabase/README.txt` has the
operating notes: adding people (Table Editor -> allowed_users),
`supabase/import_allowed_users.py` for the Encompass users export (its
output goes to git-ignored `supabase/data/` -- the repo is PUBLIC, never
commit emails/phones), custom SMTP before rollout, JWT expiry.
Rep vs manager (2026-09-25): the middleware reads `role` from the same
allowed_users row. A manager may open everything (the root index is the
managers' page). A REP may open only the paths in `REP_PATHS` in
middleware.js -- `/rep/` (their landing page: hub, off/on-prem MPOs for
the current month, tap tracker, Red Bull, Carbliss on-prem targets, per
Gavin's list of what reps actually use), those six dashboards, and the
files they load -- and is sent to `/rep/` for anything else (403 for a
data fetch). /login/ also sets a readable `kdh_user` cookie ({name, role,
email}); `hub/hub.js` uses it to LOCK a rep to their own name (no picker,
no peek, no Manager Mode; `LOCKED_REP`), and /rep/ and the root index
greet by name and carry a Sign out link. The REP page (`rep/index.html` + `rep/rep.css`, 2026-09-25) is a light
"sales app" workspace, styled after shadcn's dashboard: compact sticky
top bar (wordmark, avatar chip, Sign out; "Manager page" for managers),
a workspace header with the rep's name, title, "Reports to <DM>" (both
from the kdh_user cookie, which /login/ fills from allowed_users.title /
reports_to), and account count + on/off split + top areas computed from
`hub/data/accounts.js` (loaded deferred). Managers get a "Viewing as"
rep switcher (roster = accounts.js reps; remembered in localStorage
`kdh_rep_view`) and the hub card deep-links `#view=rep&rep=<name>`. Cards
are one component (icon, title, 2-line description, footer status +
"Open"); status is shown ONLY where cheap real data exists: MPO cards
fetch `data/<YYYY-MM>/sync_meta.json` for the current month (fall back
to last month with an amber note, or a muted "No programs loaded yet"),
Red Bull reads `period.json` for the period and days left. Tap Tracker
and Carbliss embed their data in multi-MB HTML, so no status. Fonts are
Oswald (headings) + Source Sans 3 (body) -- Gavin's pick ("option C") --
on the rep page, the manager page and /login/. The rep page has a light/dark toggle (sun/moon button in the top bar;
`data-theme` on <html>, remembered in localStorage `kdh_theme`, applied
by an inline head script before first paint; with no choice saved it
follows the device's prefers-color-scheme). The dark palette lives in
rep.css under `:root[data-theme="dark"]` and the matching media query --
change both together. The manager page still uses the dark
`shared/home.css` theme.
Both landing pages share
`shared/home.css` (Kohler theme: denim/navy canvas and cards, Kohler
blue accents; a hero band under the header -- the building photo
`assets/hero-banner.jpg` on the manager page, the "Distributing the best
beverages to Northern NJ" graphic `assets/nj-banner.webp` on the rep
page and on top of the /login/ card; per-page `--hero-h` / `--focus-x` /
`--focus-y` control the crop) (card grid, sections: reps' daily tools / sales
performance / warehouse / planning & finance / field & team on the
manager page; your programs / trackers & targets on the rep page).
Gavin pruned the manager page on 2026-09-25: Heineken, Molson Coors,
Customer Reset Tracking, Garage Beer, Boston Beer, Constellation,
Yuengling, Carbliss New Buyers, Carbliss Rep Scorecard, Supplier Budget
Tracker and Mark Anthony (setup pending) are no longer linked (folders
kept). The same cookie now also locks the other rep pages (2026-09-25):
`MPOs/shared/guided.js` pins a signed-in rep to their own name on both
MPO trackers (`lockedRep()` / `applyLock()`: view=rep, no picker, no
View by Program, no back-to-picker, a rep in the URL is overridden, the
breadcrumb becomes "Dashboards" -> /rep/), and
`isellbeer/tap-survey-tracking/index.html` sets `state.rep` to the rep's
route and hides the DM/rep pills and filters (Reset keeps the rep). iSellBeer
spells some names differently from Encompass ("Daniel La Gala" / "Dan
Lagala", "James Heaney" / "Jim Heaney", curly apostrophes), so the tap
lock matches by canonical first name + surname (all 21 surveyed reps
match); a rep with no surveyed accounts gets a plain notice instead of
everyone's routes. The tap generator only replaces the data <script>, so
these edits survive a refresh. `redbull/index.html` (setRep pinned, chips hidden, a rep with no buying
accounts this period gets a note) and `carbliss-onprem-targets/index.html`
(state.rep pinned, rep filter hidden, stats + goal bar recomputed for the
rep's own book, note when they have no target accounts) are locked the
same way. All of these read identity through `shared/kdh-user.js`
(`kdhUser()`), which also implements PREVIEW MODE: a manager sets
`kdh_preview=<rep name>` (the "Preview as this rep" button beside the
"Viewing as" switcher on /rep/) and every page then behaves as if that
rep signed in, with a fixed "Previewing as X -- Exit preview" bar at the
bottom (`kdhPreviewBar()`); Exit clears the cookie and reloads, and
signing out clears it too. Preview changes only what pages SHOW -- the
middleware still sees a manager, so manager URLs still open. The same
helper injects a sticky BACK BAR (`kdhBackBar()`, navy, top of the page)
for a signed-in rep on every dashboard except /rep/: "Back" (history.back)
when the referrer is one of our pages, otherwise "My dashboards" ->
`<root>/rep/`, root derived from the script's own src so it also works
under a github.io sub-path. The hub's own "Dashboards" button was
removed in favour of it. The workspace's first tile is "Incentive Hub"
(Gavin, 2026-09-25): it links `hub/#view=rep&rep=<name>&cat=inc&only=inc`
and the hub's `only=inc` mode (`state.only`, kept in the hash) shows the
Incentives tab alone -- the On/Off-Premise MPO tabs are the two tiles
beside it. `boot()` now honours an explicit deep link (`rep=` on the
roster, or `only=`) instead of always starting on the picker; a bare
reload still does. The rep workspace shows the Northern NJ banner
under its header again (Gavin: keep the theme); `--hero` rules in
rep.css, full aspect on phones. Managers,
and any name not on a page's roster, get every page unchanged. Beyond
that nothing reads the cookie; access is decided only by the middleware. If a rep needs another page,
add its prefix to REP_PATHS (plus whatever it loads) and to rep/index.html.
GitHub Pages still serves the same files with no login until Gavin
retires it.

Mail (2026-09-25): sign-in links go out through Resend as
signin@kohlerdisthub.com (domain verified via Resend's Vercel
auto-configure; Supabase Auth -> Emails -> SMTP Settings holds the
Resend key). Supabase's built-in mailer capped at a couple of messages
an hour and Kohler's MxGuardDog quarantine held it; signed mail from the
real domain reached g.sharkey@kohlerdist.com immediately. The allow list
was loaded from the Encompass users export on 2026-09-25 (49 people:
Sales / Sales/Delivery -> rep, every other title -> manager) plus
gavinsharkey711@gmail.com for testing.

## Commit author: use the gavinsharkey5 noreply address (2026-09-24)

Author commits as `Gavin Sharkey <240726853+gavinsharkey5@users.noreply.github.com>`.
Do NOT use gavinsharkey36@gmail.com -- GitHub has that email on a
different account (gavinsharkey-nfl), so commits authored with it show up
on GitHub and on every Vercel deployment as that account. The repo owner
and the account Vercel is linked to is gavinsharkey5.

## Weekly partial exports merge onto published data (2026-08-20)

Gavin pulls only the CURRENT WEEK from iSellBeer for the display
auction tracker, to keep each upload small. New data is meant to MERGE
onto what's already published -- older weeks must stay on the board and
never drop off.

That cuts against how most `generate*.py` in this repo work: they
rebuild their dashboard's whole dataset from whichever file(s) they're
handed, so feeding one a partial export silently drops everything
outside its window. Before running any generator against an export that
covers less than the dashboard's full tracked period, check whether it
appends or rebuilds, and compare the export's date range against what's
already published.

`isellbeer/display-auction-tracker/generate.py` has a `--merge` mode for
exactly this and it is the DEFAULT for that dashboard -- see its
README.txt. Don't ask Gavin to re-pull a whole period as a matter of
course; --merge is the routine path. If another dashboard moves to
weekly pulls, it needs the same treatment rather than a plain rerun.

## Tap dashboards show the CURRENT lineup, not every survey ever (2026-09-04)

An iSellBeer tap export can now contain more than one survey pass for the
same account -- one submission is an `Account # + Date/Time` pair. The
9.4.26 workbook was the first: 70 accounts surveyed twice, one three times.
Both tap dashboards (`isellbeer/tap-survey-tracking/`,
`isellbeer/executive-overview/`) read that workbook, and both were summing
every pass, so a brand on tap at both visits counted twice and a brand
since removed still poured. Applebee's Clifton read 17 taps for a wall
that holds 8.

Both generators now keep only each account's newest pass. Do NOT undo this
by "restoring" the missing taps -- the drop (6,795 -> 6,215 on the tracker,
5,971 -> 5,525 core on the exec page) is the fix, not data loss. The
superseded passes are still published: the tracker emits them as a separate
`history` payload and renders them per account under "Survey history",
where nothing feeds a total.

The tracker's `generate.py` has a `reconcile()` that re-derives every
account's taps from the raw sheet and HARD-FAILS the build on a mismatch or
a mixed-date account. If a future export changes the Date/Time format, that
check is what fires -- fix the parsing, never loosen the check.

## MetLife Beer Audit is device-first, no generator (2026-09-09)

`metlife-audit/` is a single-file phone form + dashboard for Chris
Politano's stadium beer audit (cooler facings, taps, photos per
location, auto-lettered 125-A, 125-B...; fixed Ours/Theirs brand
pickers and a location-description picker). There is NO `generate.py`
and no CSV to overwrite: captured data lives in IndexedDB on the
auditor's phone until they export a JSON from the Log tab. To publish
results, save that export as `metlife-audit/data/audit.json`, commit
and push -- the dashboard fetches it on load and merges it with
whatever is on the viewing device. Multiple auditors = import each
phone's export on one device (newest edit per location wins), then
export the combined file. `?demo=1` previews the dashboard with fake
data; nothing in demo mode is saved. See `metlife-audit/README.txt`.

## Incentives & MPO Hub reads the trackers' shared program libraries (2026-09-10)

`hub/` is one page for reps (pick your name -> every incentive and MPO
you are in, sorted by what ends soonest / is closest to done) and a
by-program view for managers. It has NO generator and NO data of its
own: it loads `incentive-tracking/data/program_data.js` (which
`incentive-tracking/generate.py` now writes beside the inline blob in
index.html), `incentive-tracking/programs.js`, `MPOs/on-prem/programs.js`
and `MPOs/off-prem/programs.js`, and calls the same `summarize()` /
`cardFor()` / `metricFor()` / `detailFor()` those trackers run.

Those `programs.js` files are where each tracker's registries, builders,
summaries, rules and cards now live -- moved verbatim out of the three
index.html files so both the original page and the hub read one copy.
Edit program logic THERE, not in index.html (which keeps only the data
blobs / month tabs / rendering). Refresh steps are unchanged: run each
tracker's generator as its README says and the hub picks the numbers up.
See `hub/README.txt` for how statuses map and how sorting works.

The one thing the hub builds itself is the ACCOUNT layer: `hub/generate.py`
turns `hub/data/Sales_Reps_Customer_Base.xlsx` (each rep's assigned
accounts) and `hub/data/Brand_Sellable_Unsellable.xlsx` (CAN SELL / NOT
IN TERRITORY / BLOCKED per brand family and area) into
`hub/data/accounts.js`; `hub/accounts.js` derives each program's
eligible / already-buying / high-potential / can't-sell lists from it.
Every target list respects both files. Program-to-brand-family mapping
is PROGRAM_BRANDS in `hub/accounts.js`. "High potential" is by 2026 case
volume only -- neither file carries brand-level sales.

The hub has two modes: Rep Mode (default: goal / where you stand / still
needed / where to go next / what to sell, one numbered visit list per
program, SELL_ASK in `hub/hub.js` supplies the "what to sell" line) and
Manager Mode (the full account tabs, tracker tables, rankings, Program
View). Keep manager-level detail out of Rep Mode -- Gavin's bar is a rep
who has never sold a beer understanding a card immediately. Manager Mode
is desktop-only (phones and tablets are forced to Rep Mode); Rep Mode
cards carry the sell / go lines on the collapsed card and open to a
TARGETS tab (the numbered visit list) beside a COMPLETED tab that logs the
rep's credited placements (customer, product, date) from the tracker data.
`hub/index.html` loads its assets with `?v=` cache-busting tags -- bump
the tag whenever hub.js / hub.css / accounts.js changes, or reps keep the
old copy.
A program whose brand cannot be sold anywhere on a rep's route (per the
two workbooks) is greyed as "Unavailable based on account base/territory"
and left out of that rep's counts and visit lists; rep-page MPOs are the
current calendar month's only. The home screen asks only Incentives or
MPOs; the next screen is the Incentive Tracker's own "choose a supplier"
step for Incentives (one card per supplier, count + already earned, SEE
THESE INCENTIVES) and On / Off-Premise tiles for MPOs. A supplier's page
is one quiet column of cards -- no count boxes, no filter pills. Retention
programs open to a "Your brand goals" list (one row per brand family:
current / goal, a bar, "N more needed" or "✓ Retained") instead of an
account list; brandGoals() in `hub/hub.js` maps each tracker's rows.

## W&S monthly grid: partial-looking exports are RESTATEMENTS (2026-09-14)

The Wine & Spirits RDE pulls now arrive as a recent slice, and the
covering note can say they exclude older months when they don't. On
2026-09-14 the "Account Level by Month" export carried 2026/8 and
2026/9 only -- but its August was a fuller restatement of the whole
month, not a top-up of the days after the 24th: every master August row
was present, 660 matched exactly, 85 had grown, none were missing, and
the month went 1,543 -> 2,089 units. `--overlap replace` was right;
`add` would have double-counted 660 rows.

So don't infer the mode from the column headers. CHECK: for the
overlapping month, compare the export against the master per key. If
every master row with volume reappears and values only go up, it's a
restatement -> `--overlap replace`. If the export holds only the days
the master lacks, it's a top-up -> `--overlap add`. The invoice-style
export (Portfolio Overview) is always safe in `rows` mode -- it dedupes
whole rows as a multiset.

Duplicate keys, for the record: the monthly grid matches on
(On-Off Premise, Product Num, Customer ID) -- verified unique in both
files; the invoice file matches on the entire row, because it has no
customer column and identical lines are legitimate.

`wine-spirits/README.md` carries the full write-up, including the AP
definition (AP = DISTINCT ACCOUNTS everywhere, never customer x item
pairs -- it deliberately does not sum across items) and the fact that
the dashboard holds NO goals: the Opportunity Tracker is deliberately
not a goal tracker, and `ws_goals.csv` is the drop-in that would turn
Goal / Progress / Still needed on if goals are ever approved.

## Rolling Distribution Trends (rolling-distribution/) keeps a month-per-file master (2026-09-21)

`rolling-distribution/` is the history + baseline page: buyers, placements
and cases by supplier -> brand family -> brand -> product in rolling
N-month periods (default 3) that advance one calendar month, filterable by
rep / DM / premise / area / draft-vs-package. It is fed by Fusion
product x account exports (three months per file because of the export
size cap) plus two optional lookups (product -> package, customer -> rep
and DM). `generate.py` auto-detects all three by header.

The historical dataset is `rolling-distribution/data/master/`: one CSV
per calendar month (product_num, customer_num, buyer, cases) plus
products.csv / customers.csv / sources.json. The raw 20 MB exports are
NOT committed. Each month in a detail export REPLACES that month's file
in full (restatement, never top-up -- same rule as the W&S grid); months
the export doesn't cover are untouched, so history never drops off and
overlapping exports can't double count. Routine pull = latest three
months. A month equal to the export's own date is flagged partial.

Counting rules, verified against Fusion's own product- and customer-level
exports: Fusion's Buyer Count and Placement Count are the SAME 1/0 flag at
the product x account grain. Buyer = distinct account with net cases > 0
in the period for the rows in scope; placement = product x account with
net cases > 0; cases net of returns. Rolling-period buyers are never the
sum of monthly buyer counts -- always re-derive from account rows. Rep and
DM are today's assignment applied to all history (Fusion has no history
of who held an account). No dollars, no goals on this page.

Territory rule (2026-09-23): `data/master/territory.csv` (from Gavin's
Brand_Selling_Restrictions workbook, fed to `generate.py` like any other
lookup) says which Encompass areas each brand family may be sold in. The
page applies it by DEFAULT: a brand's account universe is only the
accounts in its areas (so nothing outside the territory shows up as a
missed opportunity) and out-of-territory invoices are hidden; a gold note
under the filters says what was left out and a Territory box / "Show all
areas" turns it off (`terr=off` in the link). Families missing from the
workbook are counted everywhere and the build prints them. Gavin's
Sales_Reps__Customer_Base CSV was checked against the master and matched
rep and area for every account -- it adds nothing here, don't load it.

Money (2026-09-23): Fusion's cost / revenue / gross-profit export
(Customer Num & Company, Product Num & Name, Laid-In Cost / $Vol / Gross
per YYYY/M) is ingested by `generate.py` into `data/master/money/YYYY-MM.csv`
(month replaces month). It matches the detail grain exactly -- every
placement with cases had a $ row for Jan-Mar 2025 -- and it carries
Fusion's internal accounts too: customer 8 is "Out Of Code" (the
destruction cost per product the quality tab was missing), 7 Breakage, 5
Inventory Adjustment, 9 Fifo, 25 Repack, 120022 Samples. Keep those rows;
never treat them as customers. Use Fusion's Gross as-is (it is not $Vol
minus Laid-In on half the rows). Only Jan-Mar 2025 is loaded and NOTHING
on the page reads it yet. Gavin's instruction (2026-09-23): keep loading
money months as they arrive but do NOT put dollars on the page until
every month through Sep 2026 is in. Then: revenue / gross columns on the
tracker, GP by tier and GP per placement on the quality tab, and
out-of-code cost by brand.

Adjustments (2026-09-23): Fusion's "Comparison" export of the internal
accounts (cases per internal account x product x month, `Cases YYYY MM`
with a space) is ingested into `data/master/adjust/YYYY-MM.csv`; Jan 2025
- Aug 2026 are loaded. Out-of-code (account 8) is the real destruction
signal -- 69k cases over 20 months, 0.6% of sales overall but 14% for
Colt 45 and 26% for Pabst Light -- and it is per PRODUCT only (no
customer in the file), so it can be shown by brand / product / period,
never per account or per placement. On the page since 2026-09-24:
`build()` emits it as `ooc` triples (productIdx, monthIdx, cases); the
quality tab shows it as a section-1 tile, a takeaway line, a column on
the fewest-Thin and verdict tables and a simple-card tile, always by
product and never subject to the customer-side filters.

Account size deciles (2026-09-24): Gavin's Supplier_Deciles workbook
(every account ranked into deciles by 2026 gross profit, and again within
each of 12 suppliers, plus industry class A/B/C, stops and distribution
points) is ingested by `generate.py` (recognised by sheet names) into
`data/master/deciles/` and emitted as `decile` / `sdecile` in
dist_data.js -- deciles, class, stops, points only; the gross dollars are
deliberately NOT emitted while the money hold stands. The page uses them
as size tags on account tables, an "Account size" filter and breakdown,
and section 4's "biggest accounts that under-buy" list (top-30% accounts
not buying the scope, or 3+ deciles lower with the supplier than their
size decile). Supplier sheets are matched to Fusion supplier names by
prefix; all 12 matched on 2026-09-24.

The page has a second tab, DISTRIBUTION QUALITY (page=quality in the
link), built for pushing back on "more points = more sales": placement
tiers by cases/month, new-point survival, fit map, look-alike targets,
rebuy cohorts (start = first net-positive month; placements active in
the first month of history are excluded; a window is judged only once
fully observed), county fit score, retain / one-and-done / expand
lists, and a broad-vs-selective verdict per brand. All of it is
computed in the browser from the same product x account months; the
README lists every definition. Out-of-code cases are loaded (see
Adjustments above); returns per account are still only the "return
signal" (a net-negative month).
The tab opens in SIMPLE mode (the DEFAULT, for managers) with DETAILED
beside it -- a gold "How much detail?" bar, `qview=simple|full` in the
link, remembered in localStorage. Simple renders `simpleView()` from the `QS` numbers the
full `qualityView()` / `rebuyView()` stash as they run, so the two can
never disagree; keep it that way (never recompute in the simple view)
and keep Gavin's full layout untouched -- he uses it himself.
