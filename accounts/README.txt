Accounts tab + Account page (2026-09-30)
==========================================

"What should I do at this account today?" -- one list of a rep's assigned
accounts, one page per account that leads with up to three supported
actions, then the supporting detail. Managers see their team's accounts
with the rep named on every row and open the same page.

URL: /accounts/            the list      (#q=..., #rep=<name>, #need=any|follow|prog|gap|tap)
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
  KNOWN GAP the other datasets a rep page loads (program_data.js, the MPO
            month JSON, the tap survey embedded in the Tap Tracker) still
            carry every rep's rows, as they always have; only the account
            slices are enforced per rep. Closing that needs per-rep slices
            of those files too (same mechanism) -- listed in ROADMAP.md.

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

  Outputs of generate.py (git-tracked, regenerate after hub/generate.py, a
  rolling month, or a tap rebuild):
    data/index.json, data/book/<key>.js, data/reps/<key>.json (list + one-line
    summary per account), data/sales/<key>/<n>.json (one account's product x
    month history + its tap brands and earlier surveys).

THE ACCOUNT PAGE, TOP TO BOTTOM
  Identity   name; town · premise; account #, address, area, size class; the rep (managers).
  Focus      up to three, in this fixed order, each saying why and what next:
             1 the newest open follow-up on this account (rep_actions, status follow)
             2 an overdue tap survey (last visit > 60 days ago -- the Tap Tracker's rule;
               "due soon" from 53 days is shown in Taps & visits, not here)
             3 program LEADS: the trackers' own warm opportunity lists for this account
               ("1 SKU short", "still on Summer Ale", "missing <product>"), warm first,
               soonest deadline first; a cold eligible target only when its program
               ends within 14 days                                            (up to 2)
             4 possible REORDER GAPS, largest usual order first                   (up to 2)
             Nothing invented: no urgency, no potential, no deadline that is not the
             program's own. No item -> a plain "Nothing flagged" line.
  Sales & reorders (Fusion master, monthly, net of returns, through the last loaded month)
             last purchase month; the last 3 months vs the 3 before vs the same 3 last year
             (labelled with their months); products bought in the last 12 months;
             POSSIBLE REORDER GAPS -- a regular product (bought in 4+ of the last 12 months,
             usually <= 3 months apart by median gap) not bought for >= 2 months and >= twice
             its usual gap. Shown as "usually every N months · last bought <month> · typical
             order X cases". A possibility to check, never a confirmed need; a month equal to
             the export's own date may be partial (sources.json says so). Recent purchases
             (top products of the last 3 months) and the full product history fold.
             MINIMUM HISTORY: 4 buying months for a gap; 15 loaded months for the
             same-period-last-year comparison (otherwise it is omitted, not zeroed).
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

LIST
  Rows: name; town · premise (· rep for managers); chips: N follow-ups, N program leads,
  N reorders to check, survey overdue Nd / due in Nd. "Needs attention" = follow-ups,
  leads and surveys (reorder checks have their own filter -- with sales through the last
  loaded month most accounts have one). Search matches name, number, town (and rep for
  managers). Long lists page 120 at a time. Back from an account restores the list, its
  filters and scroll.

TESTS  scratchpad acct_test.mjs (rep scope from the allow-list spelling, direct link to
       another rep's account fails closed, search cannot reach it, manager filters + Back,
       DM team only, preview == rep list, entry points from rep home / hub / Tap Tracker,
       375 / 390 / 430 / 820 / 1366), mw_test.mjs (the middleware's slice enforcement).
