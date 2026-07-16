Retain the Gains — HUSA T2 Margin Incentive Tracker

Tracks POD retention status for Heineken/Dos Equis against HUSA's own
"Retain the Gains" June-August program, using HUSA's official export as
the source of truth (not Kohler's own case-movement estimates, which is
what the older heineken/heineken-draft, dosequis, and dosequis-packages
trackers use — those stay in place but are a different, Kohler-side
methodology and can disagree with HUSA's numbers).

Files:
  HUSA_Retained_PODS_ON.xlsx   HUSA's ON PREMISE retained/unretained export
                                — 5 SKU-family columns (Core/Local groups).
  HUSA_Retained_PODS_OFF.xlsx  HUSA's OFF PREMISE retained/unretained export
                                — 16 individual-SKU columns.
  HUSA_CurrentPOD_ON.xlsx      HUSA's ON PREMISE current-state POD export
                                (separate report — see EP's/DB's below).
  HUSA_CurrentPOD_OFF.xlsx     HUSA's OFF PREMISE current-state POD export,
                                split by outlet Format (Large/Small).
  Kohler_Customer_Data.csv     Kohler's own Encompass customer/rep roster,
                                used only to attribute outlets to reps.
  generate.py                  Rebuilds the embedded DATA in index.html.
  index.html                   The page itself.

To refresh with a new HUSA export:
  1. Save the new ON/OFF workbooks over HUSA_Retained_PODS_ON.xlsx /
     HUSA_Retained_PODS_OFF.xlsx (same sheet names/column layout), and the
     current-POD workbooks over HUSA_CurrentPOD_ON.xlsx / _OFF.xlsx.
     Re-export Kohler_Customer_Data.csv too if the rep roster changed.
  2. Run: python3 generate.py
  3. Check the printed match stats — if "unmatched" or the discrepancy
     count jumps a lot, something about the export format likely changed.
     Also check the printed EP's/DB's line against HUSA's latest T2 slide
     if you have one — it should track their Current figures closely.
  4. Commit and push.

CELL CODE CONVENTION (confirmed against HUSA's reference PDF, and
directly per Kohler's own correction on 2026-07-16 — do not re-derive
this from scratch, it looks backwards if you eyeball the raw counts):
  1 = Unretained     — had the POD, lost it. This is the actionable gap.
  2 = New Placement  — won during the program window; not part of the
                        original retention base, tracked separately.
  3 = Retained       — had the POD, kept it.
  blank = not applicable (outlet was never eligible/distributed for
                        that SKU) — excluded entirely, not counted as 0.

Retention rate = Retained / (Retained + Unretained). New Placements are
deliberately excluded from that denominator since they were never part
of the base being measured.

We are NOT attempting to reproduce HUSA's Total Volume goal figures
(May-Aug Goal 209,124 / Current 116,770) — not derivable from anything
we have, and Kohler confirmed not to worry about matching it.

EP's / DB's (Off/On Premise Distribution goal), however, ARE now
reproduced — not from the retained/unretained files above, but from the
separate HUSA_CurrentPOD_ON/OFF.xlsx exports, which are a plain current-
state POD snapshot (0/1 flags, no retained/unretained distinction) with
a per-outlet Total column:
  - DB's (On Premise) = sum of the Total column across all outlets in
    HUSA_CurrentPOD_ON.xlsx. Matched HUSA's reported 374 closely (382,
    2% off — normal snapshot-timing drift).
  - EP's (Off Premise) = sum of the Total column across Large-format
    outlets ONLY in HUSA_CurrentPOD_OFF.xlsx (that file splits Large vs.
    Small format, each with its own Total column). Matched HUSA's
    reported 645 closely (650, <1% off). Large+Small combined overshoots
    (657) — Large-only is the better fit, and lines up with the original
    filtered files' own "Format is Large" filter footer.
  - Goal (794 off / 873 on) is a fixed HUSA target, hardcoded in
    EP_DB_GOAL at the top of generate.py — not derivable from any file
    we have. Update it by hand if HUSA raises/changes the goal.

REP ATTRIBUTION:
HUSA identifies outlets by VIP ID / TDLinx / Dist SAP; Kohler's own
system (Encompass) has no shared ID, so outlets are matched to
Kohler_Customer_Data.csv by normalized street address + city, falling
back to a fuzzy address match (difflib, threshold 0.82) within the same
city. If neither matches, HUSA's own "Sales Person" column is used as a
fallback (labeled the same as any other rep — there's no visual
distinction in the UI, since cross-checking showed HUSA's field agrees
with Kohler's roster ~94% of the time where both are known). Every
outlet gets a rep this way; none are silently dropped.

Where the roster match AND HUSA's Sales Person field both resolve but
DISAGREE on who owns the account, that's surfaced in the dashboard's
"Rep Assignment Discrepancies" table instead of silently picking one —
this is one concrete, checkable instance of the "our data vs. their
data" gap Kohler flagged when asking for this tracker.
