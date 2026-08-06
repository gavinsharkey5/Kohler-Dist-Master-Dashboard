# Kohler Dist Master Dashboard

Static dashboards (GitHub Pages, deployed from `main` by
`.github/workflows/pages-deploy.yml` on every push) tracking rep
performance against various Kohler Distributing incentive programs.
Each dashboard folder (`summer26/`, `MPOs/off-prem/`, `MPOs/on-prem/`,
etc.) has its own README.txt with that dashboard's specific refresh
steps (which CSVs to overwrite, which `generate*.py` to run) -- read
that first.

## After every manual data refresh, verify the deploy actually went out

Pushing to `main` is not the end of the job -- GitHub Pages deploys on
this repo have intermittently gotten stuck in `deployment_in_progress`
for ~10 minutes and then failed with `Timeout reached, aborting!`
(seen repeatedly 2026-08-06). When that happens the live site keeps
serving whatever the last *successful* deploy was, silently ignoring
every commit pushed since -- including `sync_meta.json` timestamp
bumps, so the "Data refreshed" pill on the page can be stale even
though the underlying JSON on `main` is current.

So after pushing a data refresh (or a manual sync_meta.json bump):
  1. Check the latest "Deploy static site to Pages" run for that
     commit (GitHub Actions -- gh_actions tools, or the Actions tab).
  2. If it succeeded, done.
  3. If it failed or is still stuck several minutes in, push an empty
     commit (`git commit --allow-empty -m "Retrigger Pages deploy"`)
     to fire the workflow again via its `push` trigger -- this has
     been the reliable fix. The GitHub App token available in this
     environment does NOT have `actions:write`, so re-running the
     failed run via the Actions API (`rerun_workflow_run`/
     `run_workflow`) returns 403 -- don't bother trying that, go
     straight to the empty-commit retrigger.
  4. Re-check the new run; repeat step 3 if it fails again.

Only after a run actually succeeds is the "Data refreshed" pill (which
reads `data/.../sync_meta.json`'s `synced_at`, not any HTTP header --
see each dashboard's index.html) guaranteed to reflect the latest
push.
