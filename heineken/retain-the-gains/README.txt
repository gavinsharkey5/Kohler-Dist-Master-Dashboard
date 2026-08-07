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
  T2_On_Premise_Core_Distribution.xlsx
                                HUSA's ON PREMISE current-distribution
                                export (separate report — see EP's/DB's
                                below). Added 2026-08-07, replacing
                                HUSA_CurrentPOD_ON.xlsx — a hierarchical
                                drill-down shape (Route > Account > Brand >
                                Draft/Package), not a flat per-outlet table.
  T2_Off_Premise_Core_Distribution.xlsx
                                HUSA's OFF PREMISE current-distribution
                                export, split by outlet Format (Large/
                                Small). Added 2026-08-07, replacing
                                HUSA_CurrentPOD_OFF.xlsx — same flat
                                per-outlet shape as the file it replaced.
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
     current-distribution workbooks over T2_On_Premise_Core_Distribution.xlsx
     / T2_Off_Premise_Core_Distribution.xlsx (same filenames/shapes).
     Re-export Kohler_Customer_Data.csv too if the rep roster changed.
  2. Run: python3 generate.py
  3. Check the printed match stats — if "unmatched" or the discrepancy
     count jumps a lot, something about the export format likely changed.
     Also check the printed EP's/DB's line against HUSA's latest T2 slide
     if you have one — as of the 2026-08-07 refresh these match HUSA's
     slide EXACTLY (730/794 off, 655/873 on), not just closely, so a new
     export drifting noticeably from HUSA's own reported figures is worth
     investigating rather than assuming is normal snapshot-timing drift.
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

STILL NOT attempting to reproduce HUSA's Total Volume goal figures (the
"Current Standing" screenshot Kohler shared 2026-08-07 shows Goal 209,124
/ Current 150,948 / 72%) — neither T2 Core Distribution file carries any
case/volume data, only 1/0/blank distribution flags, so this figure is
not derivable from anything we have. This needs its own source file (a
volume/case-movement export) before it can be added as a third "Current
Standing" panel — asked Kohler about this in the 2026-08-07 refresh,
flagging here in case a future session picks it up before that's
resolved.

EP's / DB's (Off/On Premise Distribution goal) ARE fully reproduced, and
as of the 2026-08-07 refresh (T2_On/Off_Premise_Core_Distribution.xlsx,
replacing the old HUSA_CurrentPOD_ON/OFF.xlsx) match HUSA's own T2 slide
EXACTLY, not just closely:
  - EP's (Off Premise) = SUM of every SKU/format Total column (Large
    Total + Small Total) across every outlet in
    T2_Off_Premise_Core_Distribution.xlsx — a flat per-outlet table, same
    shape as the file it replaced. = 730 vs. HUSA's reported 730 (exact).
    The old file/methodology summed Large-format outlets only as a
    best-fit approximation (no way to verify it exactly at the time);
    this file's Large-only sum is actually 722, not 730 — it's the
    Large+Small SUM that reproduces HUSA's figure exactly, which is also
    the more sensible definition (every gained SKU counts, regardless of
    which format group RDE happens to bucket it into).
  - DB's (On Premise) = COUNT of distinct outlets in
    T2_On_Premise_Core_Distribution.xlsx whose own outlet-level row
    (Brand=Total, Draft/Package=Total) has a "Did Buys" flag of 1 — i.e.
    the outlet carries at least one Heineken-family SKU in any
    brand/format. = 655 vs. HUSA's reported 655 (exact). This file is a
    hierarchical drill-down export (Distributor Route > Retail Account >
    Brand > Draft/Package) with 'Total' subtotal rows at every level, NOT
    a flat table like the OFF file or the HUSA_CurrentPOD_ON.xlsx file it
    replaced — see parse_t2_on_distribution()'s docstring in generate.py
    for the parsing approach (including why rep names are parsed by
    splitting the Route label at its first digit, and why non-Kohler
    distributor routes mixed into the export are filtered out).
  - Goal (794 off / 873 on) is a fixed HUSA target, hardcoded in
    EP_DB_GOAL at the top of generate.py — not derivable from any file
    we have. Update it by hand if HUSA raises/changes the goal. Unchanged
    by the 2026-08-07 refresh — these already matched the goal figures in
    Kohler's screenshot before touching anything else.

CELL CODE CONVENTION for the T2 Core Distribution files (confirmed
directly by Kohler, 2026-08-07) — do NOT confuse this with the DIFFERENT
1/2/3/blank convention above, which is for the separate
HUSA_Retained_PODS_ON/OFF.xlsx gap-tracking files:
  1 = gained distribution (currently carries that SKU)
  0 = opportunity/gap (doesn't currently carry it)
  blank = SKU not applicable to that outlet (never eligible/distributed)

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
