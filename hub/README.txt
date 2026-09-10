Incentives & MPO Hub
====================

One link for reps: pick your name, pick what you are looking for, and see
every incentive and MPO program you are in -- where you stand, what you
still need, when each one ends and what it pays -- in one design.
Managers get the same board by program (Program View), with participation,
completion, payout exposure where the data carries it, and rep rankings.

URL: /Kohler-Dist-Master-Dashboard/hub/

WHAT IT MERGES
  incentive-tracking/   the Incentive Tracker (every deck program, both month tabs)
  MPOs/on-prem/         the On-Prem MPO Tracker (every month in its MONTHS array)
  MPOs/off-prem/        the Off-Prem MPO Tracker (every month in its MONTHS array)

THIS FOLDER COMPUTES NOTHING. There is no generate.py here and no data.
The page loads the three trackers' own program libraries -- the same
files those pages run -- and arranges their results:

  ../incentive-tracking/data/program_data.js   the incentive data blobs
                                               (generate.py writes it beside
                                               the inline copy in index.html)
  ../incentive-tracking/programs.js            registries, summarize(),
                                               cardFor(), rankProgram(),
                                               PROGRAM_RULES, SUPPLIERS ...
  ../MPOs/on-prem/programs.js                  window.OnPremMPO: OBJECTIVES/
                                               MONTHS, builders, metricFor(),
                                               detailFor(), objPct(), atGoalFor()
  ../MPOs/off-prem/programs.js                 window.OffPremMPO, same shape
  hub.js                                       adapters, sorting, screens
  hub.css                                      Kohler navy tokens, the
                                               tracker's card CSS carried over

Those programs.js files were split out of each tracker's index.html on
2026-09-10 (verbatim -- the trackers were diffed headless before/after and
render identically). Edit program rules, summaries, cards, objectives and
targets THERE; both the original page and the hub pick the change up.

REFRESHING DATA
  Nothing new. Run the trackers exactly as their own README.txt says:
    incentive-tracking:  python3 generate.py   (also rewrites data/program_data.js)
    MPOs/on-prem:        python3 generate_<month>.py -> data/<month>/mpo_*.json
    MPOs/off-prem:       python3 generate_<month>.py -> data/<month>/mpo_*.json
  Commit and push; the hub reads the new numbers on next load. The "Data
  refreshed" line shows the incentive generator's stamp and each MPO
  month's sync_meta.json.

ADDING A PROGRAM OR A MONTH
  Add it to the tracker as usual (a registry entry + builder/card in
  incentive-tracking/programs.js; an OBJECTIVES_* entry + MONTHS table row
  in MPOs/<scope>/programs.js). The hub lists it automatically. Two optional
  fields the hub reads and the trackers ignore:
    incentive entry   nothing extra -- period comes from the data blob's
                      periodStart/periodEnd when the builder emits them, else
                      from the entry's tag ("Aug–Sept", "Jul 20–Sep 30",
                      "September", "Sept–Oct (retro Aug)" all parse), else
                      the registry month.
    MPO objective     periodStart / periodEnd (ISO dates) when an objective
                      does not run exactly the calendar month -- e.g.
                      constellation_gaintain periodEnd:'2026-11-30'.
  Channel for an incentive (On / Off / both) is INC_CHANNEL in hub.js --
  add a key there when a new program is one-sided; the default is both.

HOW THE HUB READS EACH TRACKER (hub.js)
  Incentives  forRep(rep) calls the tracker's summarize(entry, rep): the
              same label / goal / remaining / next-step sentence and the same
              status ladder (Earned / Close / On Track / Needs Attention /
              Not Started / Coming Soon). The hub's status word is a
              straight mapping -- Earned => Completed (Exceeded when now >
              target), anything started => In Progress, otherwise Not
              Started / Coming Soon -- and the ladder survives as the bar
              colour and the "pace" note. Open-ended programs (goal:false --
              every placement pays) show what they have landed/earned and
              "No cap" instead of a percentage, exactly as the tracker's
              hero does. A rep is IN a program when getRep() returns their
              record and territoryEligible/programEligible are not false;
              a program with data for other reps but none for this rep is
              simply not shown to them (e.g. Keystone Ice's 17 goaled reps).
              The full detailed card (cardFor) and the leaderboard
              (rankProgram + PROGRAM_BOARD) render as on the tracker.
  MPOs        forRep(rep) calls metricFor(o, rep, DATA) from the scope's
              programs.js: value/goal/pct/remaining/valueText/goalText/
              remainText/status straight off the tracker. achieved =>
              Completed (Exceeded when value > goal), inprogress => In
              Progress, notstarted => Not Started; notScored (no account
              base / no assigned goal) => not shown. hasData:false
              objectives (photo-verified) show as Coming Soon / manually
              verified. The drill-down is detailFor(), unchanged, and the
              tracker's targets/existing-accounts toggles keep working.
  Loading     the incentive blobs are in memory from program_data.js. MPO
              months are fetched on demand: the months still running load
              at boot, older months only when "Ended" is expanded or the
              Program View month filter asks for them (August off-prem is
              ~6 MB, so it is not pulled for a rep who never opens it).

SORT ORDER ON A REP'S PAGE (the brief's order, made explicit)
  1  Ending soon     active, not complete, ends within 14 days (soonest first)
  2  Almost there    active, not complete, 75%+ done (the tracker's "Close"
                     bar), highest first
  3  In progress     everything else started, soonest to end first
  4  Not started     active programs with nothing counted, soonest to end
  5  Completed       goals already hit, latest-ending first
  6  Coming soon     programs with no feed yet (manual / awaiting export)
  7  Ended           past programs, collapsed until tapped
  ENDING_SOON_DAYS and ALMOST_PCT are constants at the top of hub.js.

CATEGORIES ("What are you looking for?")
  All Programs / Incentives / MPOs / On-Premise MPOs / Off-Premise MPOs.
  On/Off filters MPOs only; incentives show their channel as a chip (On,
  Off, or On & Off-Premise) and appear under Incentives and All.

STATE
  The rep and category are remembered in localStorage (key kohler-hub) so
  a returning rep lands straight on their programs; "Change rep" / "Change
  view" go back to the landing screen with the current picks filled in.
  Every screen has a URL hash (#view=rep&rep=...&cat=..., #view=detail&
  prog=inc:keystone_ice, #view=programs, #view=program&prog=off:2026-09:
  fever_tree) so a page can be shared or bookmarked. Opening another rep's
  row from a leaderboard "peeks" at them (who=) without changing the
  remembered rep.

NO $ TOTALS PER REP, NO $ LEADERBOARD -- per Gavin 2026-08-05 the incentive
tracker tracks progress, not estimated payouts. The hub keeps that: a
program's payout line is the deck rule, a rep's tracked dollars appear
only where the tracker's own summary already shows them (Touchdowns &
Tea, Montauk ...), and the only sum is the Program View's per-program
"payout exposure" across all reps, which the brief asked for.

VERIFYING A CHANGE
  Serve the repo root (python3 -m http.server) and open /hub/. Everything
  renders client-side; a broken registry shows up as a console error. The
  headless checks used on 2026-09-10 live in the session's scratchpad, not
  the repo: they load each tracker before and after a change and diff
  every rep x program result, and drive the hub at 390px and 1280px.
