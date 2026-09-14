#!/usr/bin/env python3
"""Flattens Yuengling Fall 2026's retention workbooks into the CSVs generate.py reads.

SAME SHAPE CHANGE MOLSON COORS MADE ON 2026-09-04, and it arrived here on
2026-09-14: the three reports now come from the BI tool's GROUPED export (an
.xlsx tree -- one combined "Sales Rep Assigned / Brand Family" column, level
implied by position) instead of the FLAT one the pipeline was built on.

build_yuengling_retention_fall() reads the FLAT layout and needs it: it calls
_split_report_subtotals(), which keeps the first row of each rep block as that
rep's TOTAL and reconciles the brand rows beneath it against that total. So
this writes the flat layout back out rather than a clean file -- the rep-total
row first, carrying the label of that rep's first brand exactly as the flat
export's "borrowed" label did, then the brand rows. Nothing downstream changes.

LEVELS ARE RESOLVED STRUCTURALLY, not by a name set: every brand row's label
starts with "Yuengling" (Lager / Light Lager / Flight), so anything else under
the report is a rep. That is stronger than the DM/rep name matching the Molson
Coors converter has to do, and it means a new rep needs no list updating here.
Every total is still reconciled arithmetically before anything is written:

  * BUYER COUNTS ARE DISTINCT ACCOUNTS, so a rep's total is NOT the sum of its
    brand rows -- an account buying both Lager and Flight is one buyer on the
    rep's line and a buyer on each brand's. What must hold is the bound: the
    total sits between the biggest single brand and the sum of all of them.
    Same rule build_yuengling_retention_fall() applies, and the same one the
    on-premise side of convert_mc_retention.py uses.
  * The report's own "Total" row is bounded by the rep rows the same way.
  A file that fails either check is a mis-levelled read, and the script
  refuses to write rather than publish it.

THE GOALS COLUMN IS READ BUT NOT WRITTEN. These workbooks now carry Kohler's
own goal per brand row; generate.py computes the goal itself as
_yuengling_fall_goal() = ceil(0.95 x the rep's 2025 base), per Gavin on
2026-09-10 ("I meant round up"). The two disagree wherever 0.95 x base is
fractional -- Kohler truncates, we round up -- so the workbook's number is
reported as a cross-check and deliberately NOT published. If Kohler's column
ever becomes the bar, that is a decision to take with Gavin, not a silent
switch here.

Run: python3 convert_yuengling_fall.py <off.xlsx> <packages.xlsx> <draft.xlsx> [--dry-run]
"""
import csv
import math
import re
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
DATA = HERE / "data"
OUT = {
    "off":      DATA / "yuengling_retention_fall_off.csv",
    "packages": DATA / "yuengling_retention_fall_packages_on.csv",
    "draft":    DATA / "yuengling_retention_fall_draft_on.csv",
}
BRAND_PREFIX = "yuengling"
TOTAL_LABELS = {"Total"}


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").strip()
    return float(s) if s else None


def load_grouped(path, side):
    """The report sheet. Named 'Yuengling Fall 2026 Off Premis' / '... On
    Premise' today, but Excel caps a sheet name at 31 characters and the BI
    tool has renamed these reports before (see convert_mc_retention.py), so
    the match is on the premise words rather than an exact title. Both
    on-premise workbooks carry the SAME sheet name, which is why the caller
    passes the side and the two are told apart by the file it hands over."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    want = re.compile(r"\boff[-\s]?prem" if side == "off" else r"\bon[-\s]?prem", re.I)
    sheets = [s for s in wb.sheetnames if want.search(s)]
    if side != "off":
        sheets = [s for s in sheets if not re.search(r"\boff[-\s]?prem", s, re.I)]
    if len(sheets) != 1:
        raise SystemExit(f"{path.name}: expected exactly one {side}-premise sheet, "
                         f"found {sheets or wb.sheetnames}")
    ws = wb[sheets[0]]
    rows = [r for r in ws.iter_rows(values_only=True)
            if r and r[0] is not None and str(r[0]).strip()]
    return sheets[0], rows[0], rows[1:]


def convert(path, side):
    sheet, header, rows = load_grouped(path, side)
    base_col, cur_col, goal_col = header[1], header[2], header[3]
    if "2025" not in str(base_col) or "2026" not in str(cur_col):
        raise SystemExit(f"{path.name}: unexpected columns {header[:3]} -- expected a "
                         f"2025 base and a 2026 current Buyer Count.")
    reps, order, problems, goal_notes = {}, [], [], []
    rep = None
    report_total = None
    for r in rows:
        label = str(r[0]).strip()
        vals = (num(r[1]), num(r[2]))
        if label in TOTAL_LABELS:
            report_total = vals
            continue
        if label.lower().startswith(BRAND_PREFIX):
            if rep is None:
                raise SystemExit(f"{path.name}: brand row {label!r} appears before any rep row.")
            reps[rep]["brands"].append({"family": label, "base": vals[0], "cur": vals[1]})
            wb_goal, base = num(r[3]), vals[0]
            if wb_goal is not None and base:
                ours = math.ceil(base * 0.95)
                if abs(wb_goal - ours) > 0.001:
                    goal_notes.append(f"{rep} / {label}: base {base:.0f} -> workbook {wb_goal:.0f}, ours {ours}")
        else:
            rep = label
            if rep in reps:
                raise SystemExit(f"{path.name}: rep {rep!r} appears twice -- export shape changed?")
            reps[rep] = {"total": vals, "brands": []}
            order.append(rep)

    # Distinct buyer counts: a total sits between its biggest part and their sum.
    def bound(name, total, parts, what):
        for i, key in enumerate(("base", "cur") if what == "brand" else (0, 1)):
            tv = total[i]
            vals = [(p[key] if what == "brand" else p[key]) or 0 for p in parts]
            if tv is None:
                continue
            lo, hi = (max(vals) if vals else 0), sum(vals)
            if not (lo - 0.5 <= tv <= hi + 0.5):
                col = (base_col, cur_col)[i]
                problems.append(f"{name}: total {tv:.0f} on '{col}' is outside its parts "
                                f"[{lo:.0f}, {hi:.0f}]")

    for name in order:
        bound(name, reps[name]["total"], reps[name]["brands"], "brand")
    if report_total:
        bound("REPORT Total", report_total,
              [{0: reps[n]["total"][0], 1: reps[n]["total"][1]} for n in order], "rep")
    return sheet, (base_col, cur_col), order, reps, report_total, problems, goal_notes


def write_csv(path, cols, order, reps):
    """The FLAT layout build_yuengling_retention_fall() expects: each rep's
    total row first, carrying the first brand's label the way the flat export
    borrowed it, then that rep's real brand rows."""
    base_col, cur_col = cols
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Sales Rep Assigned", "Brand Family", base_col, cur_col])

        def fmt(v):
            return "" if v is None else f"{v:.2f}"
        for rep in order:
            b = reps[rep]["brands"]
            if not b:
                continue
            w.writerow([rep, b[0]["family"], fmt(reps[rep]["total"][0]), fmt(reps[rep]["total"][1])])
            for x in b:
                w.writerow([rep, x["family"], fmt(x["base"]), fmt(x["cur"])])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if len(args) != 3:
        raise SystemExit(__doc__.strip().splitlines()[-1])
    results, all_problems = {}, []
    for side, arg in zip(("off", "packages", "draft"), args):
        sheet, cols, order, reps, rtotal, problems, goal_notes = convert(Path(arg), side)
        n_brand = sum(len(reps[r]["brands"]) for r in order)
        print(f"{side:9s} sheet {sheet!r}: {n_brand} brand rows across {len(order)} reps"
              + (f", report total {rtotal[0]:.0f} / {rtotal[1]:.0f}" if rtotal else ""))
        if goal_notes:
            print(f"  goal cross-check: {len(goal_notes)} row(s) where Kohler's column differs from "
                  f"ceil(0.95 x base) -- ours is the bar (Gavin, 2026-09-10). Not published.")
            for g in goal_notes[:4]:
                print(f"    {g}")
            if len(goal_notes) > 4:
                print(f"    ... and {len(goal_notes)-4} more")
        all_problems += [f"{side}: {p}" for p in problems]
        results[side] = (cols, order, reps)
    if all_problems:
        print("\nRECONCILIATION FAILED -- nothing written:")
        for p in all_problems:
            print("  " + p)
        raise SystemExit(1)
    print("reconciliation: every rep total and the report total sit inside their parts' bound")
    if dry:
        print("\n--dry-run: nothing written")
        return
    for side, (cols, order, reps) in results.items():
        write_csv(OUT[side], cols, order, reps)
        print(f"wrote {OUT[side].relative_to(HERE.parent)}")
    print("Now run: python3 generate.py")


if __name__ == "__main__":
    main()
