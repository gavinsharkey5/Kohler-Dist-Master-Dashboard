---
name: tap-us-them
description: Set US / THEM (column O, "Distributor") on a new pull of rows in the ISB_Raw_Data sheet of the iSellBeer TAPS US/THEM Audit Matrix workbook, reading every rule from the workbook's own tabs (Brand Sell Rules (Handoff), Brand Crosswalk, Brands (Enc), Customers Table (Enc)), and return the corrected file with changed cells yellow, REVIEW cells orange, a decision-log CSV and a tally. Use this whenever Gavin attaches the TAPS Audit Matrix (or any "US THEM" / "Audit Matrix" workbook with an ISB_Raw_Data tab) and asks to process, audit, correct, fill, check or re-run US/THEM on new rows, a new pull, a new week, or a row range -- even if he only says "run the taps" or "do the new rows". Not for the older tap-audit skill's column-N Master-engine workflow; this one is the Handoff-sheet workflow.
---

# tap-us-them

Gavin pulls tap surveys from iSellBeer in batches and appends them to
`ISB_Raw_Data`. Each new batch needs column O (Distributor) set to US or THEM
so the tap tracker counts our handles and theirs correctly. The rulebook lives
in the workbook's other tabs, which Gavin maintains in Excel, so the script
reads them fresh every run and hard-codes no brand, family, alias or county.

## Inputs

1. The workbook (attached upload). It must contain `ISB_Raw_Data`,
   `Brand Sell Rules (Handoff)`, `Brand Crosswalk`, `Brands (Enc)` and
   `Customers Table (Enc)`.
2. The row range of the new pull in `ISB_Raw_Data` (e.g. 6872-7352).
   If Gavin gives no range, ASK before processing anything. You may run
   `--suggest-range` first (column A, `#`, restarts at 1 on each pull) so the
   question carries a concrete proposal, but his answer decides.

## Run

```bash
python3 -I .claude/skills/tap-us-them/scripts/tap_us_them.py <workbook.xlsx> \
    --rows <first>-<last> --out <scratchpad dir>
```

`--dry-run` prints the tally and REVIEW list without writing. The script:

- decides every row in the range (rules below) and prints the tally, the
  changed rows and the REVIEW rows;
- writes `<name>_reviewed.xlsx` by editing the sheet XML inside the zip, so the
  workbook's dynamic-array formulas (SORT, UNIQUE, FILTER, MAP, LAMBDA,
  XLOOKUP, BYROW on the Handoff / Master / Corrections tabs) survive. Never
  re-save this workbook through openpyxl or LibreOffice: both strip or break
  those formulas and their cached values;
- verifies the output: the zip's entry list is unchanged, only the ISB sheet
  part, `styles.xml` and (if a new string was needed) `sharedStrings.xml`
  differ, and no cached cell value anywhere in `ISB_Raw_Data` differs except
  the column-O cells it changed. It aborts rather than report success if any
  of that fails. With nothing to change or flag, the output is a byte-identical
  copy;
- writes `decisions_log_rows_<a>-<b>.csv` (one line per row: name looked up,
  family matched and where, area used, current value, verdict, reason) and
  `summary.json`.

## Rules (what the script implements; read this to answer questions)

Columns in `ISB_Raw_Data`: B Account #, D Distribution Area, K Brand,
L Brand Family, M Supplier, O Distributor. Row 1 is the header. Matching is
case-insensitive with whitespace collapsed.

1. Name to look up = Brand Family (L); if blank, Brand (K).
2. Placeholder lines: Brand and Brand Family both blank AND Supplier is
   "Default supplier" -> THEM, reason "placeholder line, no brand" (Gavin,
   2026-10-13). Both blank with any other supplier -> REVIEW, value left as is.
3. In-house: Brand or Supplier contains "(IN-HOUSE)" -> US. Stop.
4. Find the family:
   a. the name equals Handoff col A, or appears in Handoff col B ("; "-separated
      iSellBeer aliases) -> that row;
   b. else in Brand Crosswalk col A: Status (col F) "Mapped" -> family = col C
      (then looked up on the Handoff); "No Encompass Match" -> THEM, stop;
      any other status is ignored and the search continues;
   c. else in Brands (Enc) col C (Brand) -> family = col D;
   d. else REVIEW.
5. Find the area: col D. "SALES" is a placeholder: look up Account # (as a
   number) in Customers Table (Enc) col A and use the County in col I. County
   "Morris" (no number), "Default", or an account not found -> REVIEW. An area
   that is not one of the Handoff's D:M column headers -> REVIEW.
6. Decide: the family's Handoff row x the area's column: "Can Sell" -> US,
   "Can't Sell" -> THEM, anything else -> REVIEW. A family that is not on the
   Handoff sheet at all -> THEM.
7. REVIEW rows keep their current value and get an orange fill; changed cells
   get the new value and a yellow fill; unchanged cells are untouched.

## Report back (in chat)

Give the tally as a small table (changed to US, changed to THEM, unchanged,
REVIEW), then every REVIEW row with account, area, brand, family, supplier,
current value and the reason, then a short note on how the rows resolved
(Handoff direct / Crosswalk no-match / in-house / SALES by county) so Gavin can
judge the match. Send the reviewed workbook and the CSV with SendUserFile.

If every row is unchanged, say so plainly: the batch had already been audited
correctly. Do not invent changes to look useful.

## When the script stops

- "no cached area names": the Handoff header formulas have no cached values
  (file produced by a tool that does not calculate). Ask Gavin to open and
  save it in Excel, then rerun.
- "cell O<n> is not in the sheet XML": that row has no column-O cell at all.
  Ask whether the pull was pasted with Distributor blank; the script does not
  create cells.
- An assertion in verify: do not deliver the file. Read the message, fix the
  cause, rerun.

## Changing the rules

Rules change in the WORKBOOK (Gavin edits the Handoff / Crosswalk / Brands /
Customers tabs), not in the script. Only a new kind of rule (like the
placeholder rule) needs a script edit: add it to `decide_row()` and to the
Rules list above in the same change, and test on a doctored copy (flip two
column-O values, blank a supplier) so both the change path and the REVIEW path
are exercised, then confirm the real file still comes back byte-identical when
nothing changes.
