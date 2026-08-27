# Where the numbers come from — and what will fool you

`scripts/extract.py` covers the routine pull. Read this when you need something
it does not print, or when a number looks off.

## How data is stored in this repo

Most dashboards embed their data in `index.html`, either in a
`<script id="..." type="application/json">` tag or a `const NAME = {...}`
assignment. Nothing is fetched at build time — parse the HTML.

| Dashboard | Location | How to read it |
|---|---|---|
| Tap survey | `isellbeer/tap-survey-tracking/index.html` | `<script id="tap-data">` — `records[]`, one row per account/brand, with `taps`, `status` (US/THEM), `county`, `rep` |
| Tap velocity | `isellbeer/executive-overview/index.html` | `<script id="exec-data">` — `velocity.brands[]`, `areas.core[]`, `summary` (core) vs `companyWide` |
| Display auction | `isellbeer/display-auction-tracker/index.html` | `<script id="da-data">` — `people[]` with `points`, `displays[]` |
| Tier 1 displays | `isellbeer/tier1-display-recap/index.html` | `const DATA = {...}` |
| Incentives | `incentive-tracking/index.html` | `const PROGRAM_DATA = {...}` — 20 programs keyed by name |
| MPOs | `MPOs/{off,on}-prem/data/2026-MM/*.json` | Plain JSON. `mpo_targets_*.json` is the denominator |
| Summer of Success | `summer26/data/summer_of_success_full.json` + `goals.csv` | Goals join by `rep\|type\|brandkey` |
| Wine & Spirits | `wine-spirits/wine-spirits-tracker.html` | `<script id="ws-data">` — `repSummary`, `lostByRep`, `overview` |
| Brand/draft trends | `mid-year-review/brand_package_trend.csv` | Filter `Package` for keg/BBL to isolate draft |
| Customer base | `incentive-tracking/data/customer_base_full.csv` | The opportunity denominator for everything |
| Inventory | `inventory/data/InventoryProjections.csv` | `Backordered`, `Days of Inventory` |

## Traps

These have each produced a wrong headline at least once.

**Wine & Spirits year-over-year is not year-over-year.** `ws-data`'s `vol25` is
full-year 2025; `vol26` is 2026 year-to-date. Every `yoy` field in that blob —
including the alarming "−58%" — is a window artifact, not a decline. Use
activation rates, new-vs-lapsed buyer counts, and reorder gaps instead, all of
which use consistent windows on both sides.

**Velocity aliases split and inflate.** In `exec-data`, the same Encompass pool
appears under several names ("Yuengling" 312 handles, "Yuengling Brewery" 9), and
the small alias inherits the whole pool's units — producing a fake ~300
units/handle that tops every ranking. Dedupe by `encKey`, keeping the alias with
the most matched taps. The dashboard's own quadrant cards do this; the raw table
does not. Velocity is also company-wide, not Core-only, and covers ~4 of 5
surveyed accounts. Directional, never exact.

**Tap share cannot be trended from snapshots.** The survey is a census still
being built. Comparing two snapshots measures survey coverage, not the market.
For draft direction use keg case-equivalents from `brand_package_trend.csv`.

**Southern District coverage is thin and skewed.** Roughly 16% of its
draft-capable accounts are surveyed against ~90% in Core Market, and the surveyed
ones average far more handles each — reps walked the big craft rooms first. Any
Southern share number is directional. Say so.

**Not every rep is on every card.** Off-premise MPO objectives only apply to reps
with a real off-premise book (`core` base ≥ 25 in the customer base file).
Scoring an on-premise rep against Corona Premier produces a fake zero. Likewise
most of the Angry Orchard target list sits with five on-premise reps; the rest of
the roster has one target or none. Always divide by that rep's own target count.

**Molson Coors softness tracks inventory.** The last inventory pull showed 85
Molson SKUs backordered and 20 moving items at zero days on hand — including
Peroni 16oz and Coors Banquet 18-packs, the exact SKUs the MPO and retention
program score. Frame as availability, not execution, and note the pull date.

**Summer of Success totals may not match older editions.** Recomputing from
committed data has produced different cleared-goal counts than a prior Pulse
reported. Trust the recomputation, and if the difference is large enough that
leadership would notice, mention it to the user rather than the VP.

## Core Market vs Southern District

- **Core**: Bergen, Passaic, Passaic-FF, Sussex, Morris 1, Morris 3
- **Southern**: Morris 2, Essex, Hudson, Union

The difference is structural, not effort. Southern off-premise accounts average
roughly 300–670 cases a year; Core off-premise reps average 5,000–22,000 per
account. Displays, suitcase placements, and big MPO targets barely exist there.
Where the portfolio fits — small-format Wine & Spirits — Southern outperforms.

## Refreshing the underlying data

Each dashboard folder has a README.txt with its own steps. Two repo-wide rules
from `CLAUDE.md`: weekly partial exports must be merged, not rebuilt (the display
auction's `generate.py --merge` is the default for that board), and pushing to
`main` is what publishes — there is no deploy workflow to check.
