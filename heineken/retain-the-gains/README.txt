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

KNOWN GAP (as of 2026-07-17): HUSA's ON PREMISE files are missing some
SKUs — Kohler flagged this and a corrected ON PREMISE export is expected
soon. When it arrives, just re-run step 1-2 below; the 5-column layout
and downstream logic don't need to change, only the file contents.

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

CELL CODE CONVENTION — confirmed directly with a HUSA rep on 2026-07-17.
This SUPERSEDES an earlier interpretation (2026-07-16) that had codes 2
and 3 backwards in spirit, even though the raw numeric counts matched
the reference PDF either way — do not re-derive this from the PDF chart
numbers alone, ask HUSA if in doubt:
  1 = Unretained     — had this SKU at some point, doesn't currently.
                        A generic, longstanding gap.
  2 = Open Opportunity — never filled in Mar-Apr AND still not filled in
                        Jun-Aug. NOT a loss, just untouched whitespace
                        that was never won in the first place.
  3 = Lost New Gain  — WAS gained as a new placement in Mar-Apr, but has
                        not been (re-)gained in Jun-Aug. Also a loss,
                        just higher-priority than plain Unretained since
                        it's a recently-won POD that slipped.
  blank = not applicable (outlet was never eligible/distributed for
                        that SKU) — excluded entirely, not counted.

There is NO code representing "currently, successfully held" — every
non-blank cell is some flavor of gap or open whitespace (the column is
literally headered "UnRetained" for exactly this reason). Do NOT build
a retention-rate percentage from this file — there's no positive state
to rate against. "Total gaps to close" = count of codes 1 + 3. Code 2 is
a separate "open opportunity" list, not part of the gap count.

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
