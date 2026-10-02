MANAGER EXCEPTIONS (exceptions/, 2026-10-03)

What a manager should look at across their reps, grouped by account (Attio's
"My Tasks" pattern). Managers only: /exceptions/ is not in middleware.js
REP_PATHS, so a rep is sent to /rep/ and refused any file here; the page also
refuses a rep cookie and a manager previewing a rep. Linked from the manager
home (Field & Team) and the sidebar / More menu (Manager -> Exceptions).

SCOPE. "All My Reps" = the hub's roster (hub.js KohlerHub.roster, house reps
dropped by kdhIsRep). For a district manager kdhTeam() cuts it to their DM
group, as on every other page; Gavin / a VP see every rep. The rep select
narrows to one rep.

SOURCES (loaded through shared/kdh-data.js; nothing is computed elsewhere)
  - follow-ups: Supabase rep_actions, status 'follow' (account notes AND
    program marks), read live with the manager's own token. follow_on is the
    due date (the 2026-10-02 notes migration). Without it every follow-up is
    treated as undated and the page says so.
  - tap surveys: accounts/data/reps/<key>.json, each account's latest survey
    (taps.last) -- the Tap Tracker's export date is on the page.
  - programs: the trackers' registries + program_data.js through hub.js
    (progFacts / nextAccounts), the same numbers the hub shows.

TYPES AND PRIORITY (lower first; within a type most overdue / soonest first)
  1 Follow-Up Overdue          dated follow-up whose date has passed
  2 Tap Survey Overdue         latest survey older than 60 days
  3 Program Ending, Work Left  program ends within 14 days and the rep's
                               progress is short of the goal (not "Goal met",
                               "Top tier", "Every one pays", not awaiting data)
  4 Follow-Up Due Soon         dated, due within 7 days
  5 Tap Survey Due Soon        reaches 60 days within 7 days
  6 Follow-Up Open, No Date    undated follow-up open 14+ days (oldest first)
Accounts are ordered by their most urgent exception. Program deadlines belong
to a rep, so they are their own section (rep, program, progress, the
tracker's lead accounts) and are counted separately from accounts.

COUNTS. "N accounts with M exceptions": an account counts once; every row is
an exception. Program deadlines are counted on their own.

NOT HERE, ON PURPOSE
  - no checkboxes: a follow-up is closed by the rep on the account; a program
    requirement or sales gap closes only when qualifying sales arrive.
  - unresolved issues: there is no issue log (REPORTING_REQUEST.md, 10).
  - buying alerts stay on the rep's My Accounts (Needs Attention).
  - no missed-visit claim and no activity-volume score: there are no visit
    records.

Filters (kept in the hash): rep=, q= (account, town, #, rep, note text),
type=follow|tap|prog, due=over|7|14. Account groups load 25 at a time.
