# Accounts page: what the data already supports, and the one request

Written 2026-09-30 for the Accounts tab / Account page. Nothing below asks
for information the repo already holds. The repo is public: no names,
emails or phone numbers in exports that get committed.

## Already usable (no request needed)

| Need | Source already in the repo | Used for |
|---|---|---|
| Customer + route assignment | `hub/data/accounts.js` from the Encompass **Sales Reps' Customer Base** report (CustomerID, name, town, county, area, premise, 2026 cases, assigned rep); `rolling-distribution/data/master/customers.csv` adds the street address. Book as of 2026-09-10. | who owns which account; the middleware's per-rep slices |
| Manager -> reps | `allowed_users.reports_to` (Supabase) and the trackers' DM groups | "All my reps" for a district manager |
| Sales history | Rolling Distribution master: **Fusion product x account x month** cases, net of returns, Jan 2025 -> Aug 2026 (20 months), plus `products.csv` (name, brand family, supplier, package) | last purchase, 3-month comparisons, possible reorder gaps, purchase history |
| Product master | `products.csv` (ProductID, name, supplier, family, brand, package) | product names on purchase rows |
| Programs | the trackers' own libraries (`incentive-tracking/programs.js`, both MPO `programs.js`) and data | credited / lead / could-qualify status per account, what to sell, deadlines |
| Taps + visits | the Tap Tracker's survey (last visit, handles, brands, earlier passes) | Taps & visits, overdue surveys |
| Notes + follow-ups | Supabase `rep_actions` (rep, program, account, status, note, date) | Focus item 1, Notes & follow-ups |
| Account size | `deciles/universe.csv` (class, decile by 2026 gross) | the size class on the identity line |

## Limits of what exists (why some things are labelled "possible")

- Sales are **monthly**, not by invoice, and run **through August 2026**. A
  "reorder gap" can only be judged in whole months and cannot see September.
  The reorder / lapsed / buying-less-often alerts (added 2026-09-30) therefore
  count **buying months** and **months since**, never days between orders,
  and use August 2026 as "today". Products bought several times a month
  look identical to products bought once a month.
- No **product status** is loaded: a discontinued or out-of-stock SKU that an
  account bought every month shows as a lapsed buyer until it ages out.
- No **substitution / supersession** list (old ProductID -> new): a pack
  change reads as one product lapsing and another starting. The page infers
  "family still bought: <product>" from the data, which is a hint, not a fact.
- Case equivalents: the master carries `cases` as Fusion exports them; no
  separate CE conversion is loaded, so comparisons are in cases.
- Active/inactive status is not in the customer base report; an account that
  stopped buying looks the same as one that is closed.

## The one request (in priority order)

### Essential

1. **Daily-grain invoice history** (Fusion or Encompass): CustomerID, invoice
   number, invoice date, ProductID, quantity, unit of measure, case
   equivalent (or the pack size to derive it), returns/credits flagged, for
   **Jan 2025 -> today**, then weekly. Enables: "last ordered on <date>",
   usual order day and cadence in weeks instead of months, September and the
   current month on the page, returns shown separately. One export can
   REPLACE the monthly rolling pulls (the monthly master is derivable from it).
   For the buying alerts specifically it turns "3 months since" into "42 days
   since, usually every 14", lets a product bought twice a month be judged on
   its own cadence, and adds September and the current month, so an alert
   raised today reflects this week's orders.
2. **Customer master with status**: CustomerID, name, address, town, county,
   Encompass area, premise, **active / inactive flag and last activity
   date**, assigned rep **and the rep's Encompass user ID**. Enables: hiding
   closed accounts from Focus and reorder checks, and a stable rep identifier
   so the middleware can key slices on an ID instead of a name.

### Important

2a. **Product master with status and supersession**: ProductID, name, brand
   family, supplier, package, **active / discontinued flag with date**, and
   the replacement ProductID when a pack or SKU was superseded. Enables:
   no lapsed-buyer alert on a discontinued SKU; a pack change shown as one
   continuing product instead of a lapse plus a new placement.
2b. **Seasonal flag per product** (or per brand): if Encompass/Fusion holds
   one. Enables: seasonal products excluded from alerts by rule instead of
   inferred from two winters of gaps (which needs 18+ months and misses a
   product in its first season).

3. **Rep <-> manager assignment by ID**: each sales rep's Encompass user ID
   with their district manager's ID (the Users export you already gave for
   the allow list has titles; it needs the manager column or a
   reports-to ID). Enables: "All my reps" from an authoritative list rather
   than the trackers' hand-kept DM groups.
4. **Inventory availability with timestamp**, rep-safe (product, on-hand
   available to sell, as-of time), as a scheduled export. The current
   inventory feed lives on a managers-only page. Enables: "in stock as of
   <time>" on Products to discuss.

### Optional

5. **Selling resources**: per brand family or ProductID, an approved quick
   pitch (2-3 sentences), sell-sheet link, package list and any current deal
   or price support with its dates. Enables: the pitch and package line on
   Products to discuss.
6. **Tap survey export with CustomerID** (it carries the account number
   today, which matches; confirming it is the Encompass CustomerID would
   remove one join by name).

## Shared accounts

The customer base assigns every one of the 2,351 accounts to exactly one
rep (checked 2026-09-30), so no rule is needed today. If Encompass can hold
two reps on an account (a split route, sales support), say how the page
should treat it: show it to both, or to the primary only.

## History recommended

- Reorder analysis: at least **12 months of invoice-level history**, 18 to
  see seasonality once; the current alerts already need 18 months of monthly
  history (recurring = 6+ buying months in 18, with the same 6 months before
  the recent 6 for the less-often comparison).
- Comparable periods: **24 months**, so any 3-month window has its
  same-period prior year.
