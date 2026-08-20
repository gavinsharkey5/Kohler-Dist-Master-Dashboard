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
