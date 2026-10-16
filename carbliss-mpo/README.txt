CARBLISS MPO TRACKER (2026-10-06)
=================================
A fixed-window program, not a monthly MPO: which on-premise accounts bought
Carbliss between Aug 1 and Oct 31, 2026 (inclusive), each rep's penetration of
their own assigned accounts, and every account's status. The figures show in the October on-premise
Carbliss Buying Accounts card (guided.js); /carbliss-mpo/ is no longer linked from the nav or home pages.

REFRESH (about weekly while the program runs)
  1. Save the new RDE "Carbliss Buyers (ON) L90 vs Start" export over
     carbliss-onprem-targets/carbliss_buyers_l90.csv (same file the Carbliss
     Targets page reads -- one source, no copy here).
  2. If the account base changed, save the new "Entire Core Market On Prem
     Accts" export over MPOs/on-prem/core_market_on_prem_accts.csv.
  3. python3 carbliss-mpo/generate.py      (also runs tools/rep_slices.py)
  4. Commit and push.
  AFTER OCT 30: load the final export, then
     python3 carbliss-mpo/generate.py --finalize
  which writes data/final.json (never served: .vercelignore + middleware).
  From then on the program-period fields (who bought, each rep's base and
  count, the house total) come from that file; Bought Since Launch and Last
  Carbliss Purchase keep updating. --reopen ignores the freeze (a correction).

DEFINITIONS (one set, used for the house total, rep percentages and rows)
  Program period   Aug 1 - Oct 31, 2026, fixed. Never "L90". A load sheet dated
                   outside it cannot change the result.
  Qualifying       a load-sheet row of the export with Buyers 2026 > 0: any
  purchase         Carbliss flavor (brand family Carbliss, all 11 products,
                   6/4/12 oz can), ON-PREMISE. By CustomerID, not name. An
                   account counts once however many SKUs / loads / reorders.
  House total      distinct CustomerIDs with a qualifying load sheet in the
                   period, whoever their rep is (147 on the first build).
  Penetration      distinct assigned accounts that bought in the period /
                   the rep's accounts in the core on-premise base x 100.
  Since Launch     any qualifying load sheet from the launch date through the
                   latest one in the export. "Unknown" (not "No") only if the
                   export's coverage starts after launch (COVERAGE_START in
                   generate.py; the export is a 2026 year-to-date flag and the
                   rolling master shows no Carbliss sales before June 2026, so
                   every non-buyer reads "No" today).
  Last purchase    latest qualifying load sheet in the available history.
  Sales Through    the latest load-sheet date in the export (Oct 7, 2026 on the
                   first build) -- not today's date.
  Launch           Jun 2, 2026 = the first Carbliss load sheet on file. The
                   rolling master agrees: no Carbliss sales Jan 2025 - May 2026,
                   first activity in June 2026.
  Denominator      MPOs/on-prem/core_market_on_prem_accts.csv -- the SAME base
                   the October on-premise MPO's Carbliss objective uses (1,047
                   accounts after dropping the house "reps" Default / Office Tell
                   Sell). All are On Premise; every buyer in the export is in it
                   and under the same rep. Nothing was added or removed to
                   flatter a number. The base export carries no inactive /
                   closed flag, and Carbliss has no row in the territory
                   workbooks (Brand_Sellable_Unsellable / territory.csv), so no
                   territory filter is applied. Transfers: an account follows
                   its CURRENT rep (history is re-attributed, like the rolling
                   distribution page); a transfer after the freeze does not move
                   a frozen result.

EVIDENCE (checked 2026-10-06)
  * The export is ON-PREMISE only and complete: month by month its distinct
    accounts equal the rolling master's on-premise Carbliss buyers for Jun 86,
    Jul 113, Aug 21 (+1), Sep 118 (+1). The two extras are accounts whose load
    sheet carried Carbliss but whose NET cases for the month were -1 (231211
    Tony's Pizza, Aug) and 0 (191406 Courtyard Marriott, Sep): the RDE buyer
    flag is per load sheet and does not net later returns. We count them (the
    flag is Encompass's own buyer definition and what the October MPO uses).
  * Off-premise accounts also bought Carbliss (65 in August per the master).
    They are not in this tracker: it is the on-premise MPO.
  * 394 qualifying load sheets, 297 accounts since launch, 147 in the period.

DATA SAFETY
  data/program.json is the full file (managers). Each rep is served
  rep/<key>/program.json (tools/rep_slices.py + middleware.js): their own
  summary row and account rows, plus the house total as one number -- no other
  rep's accounts or percentages. Page: a rep is also pinned to their name
  (kdhMatchName, fail closed with the "couldn't find your name" notice); a
  district manager sees only their team's rep groups (kdhTeam); the house
  total stays company-wide (an aggregate). Preview-as-rep behaves as the rep.
  data/final.json is denied to reps and left out of the deployment.

ACCOUNT LINKS
  Account names open the Account page (../accounts/#acct=<n>&from=<this page +
  filters>&fl=Carbliss MPO) so Back returns to the same rep, filter, search and
  scroll (filters live in the hash, groups and scroll in sessionStorage).
  An account that is in the base export but not yet in the Account page's book
  (accounts/data/reps/<key>.json; 21 on the first build, accounts newer than
  the last hub/generate.py + accounts/generate.py run) is listed without a link
  and says so.

OPEN CONFIRMATIONS FOR GAVIN: see ROADMAP.md "Carbliss MPO tracker".

THE OCTOBER ON-PREMISE MPO READS THIS (2026-10-07)
The October on-premise objective "Carbliss – 40% Buying Accounts" is this program: its DONE flag per
account is `prog` from data/program.json (Aug 1 - Oct 31, same base, same freeze). generate.py runs
../MPOs/on-prem/generate_2026-10.py and ../tools/program_eligibility.py at the end, so refreshing here
refreshes the MPO card, the hub and the Account page's Program Opportunities. Credit stays 40% of the
rep's own base (the MPO docx).
