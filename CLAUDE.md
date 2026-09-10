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
