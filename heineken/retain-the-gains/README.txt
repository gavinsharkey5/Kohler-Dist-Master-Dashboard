Retain the Gains — HUSA T2 Margin Incentive Tracker

Tracks POD retention status for Heineken/Dos Equis against HUSA's own
"Retain the Gains" June-August program, using HUSA's official export as
the source of truth (not Kohler's own case-movement estimates, which is
what the older heineken/heineken-draft, dosequis, and dosequis-packages
trackers use — those stay in place but are a different, Kohler-side
methodology and can disagree with HUSA's numbers).

Files:
  HUSA_Retained_PODS_ON.xlsx   HUSA's ON PREMISE export — 5 SKU-family
                                columns (Core/Local package + draft groups).
  HUSA_Retained_PODS_OFF.xlsx  HUSA's OFF PREMISE export — 16 individual-
                                SKU columns.
  Kohler_Customer_Data.csv     Kohler's own Encompass customer/rep roster,
                                used only to attribute outlets to reps.
  generate.py                  Rebuilds the embedded DATA in index.html.
  index.html                   The page itself.

To refresh with a new HUSA export:
  1. Save the new ON/OFF workbooks over HUSA_Retained_PODS_ON.xlsx /
     HUSA_Retained_PODS_OFF.xlsx (same sheet names/column layout).
     Re-export Kohler_Customer_Data.csv too if the rep roster changed.
  2. Run: python3 generate.py
  3. Check the printed match stats — if "unmatched" or the discrepancy
     count jumps a lot, something about the export format likely changed.
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

We are NOT attempting to reproduce HUSA's top-line EP's / DB's / Total
Volume goal figures from the PDF (Off-Prem 794/645, On-Prem 873/374,
Volume 209,124/116,770) — those aren't derivable from these two exports
and Kohler confirmed not to worry about matching them. This tracker is
scoped to POD-level retained/unretained/new-placement counts only.

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
