#!/usr/bin/env python3
"""Flattens the two MABI Fall 2026 Retention exports into the CSVs generate.py reads.

BOTH source files are GROUPED exports with the tree flattened, so BOTH carry
subtotal rows that must be dropped before anything is summed. Reading either
one at face value roughly TRIPLES every number (the actuals sum to 6,543 raw
against a true 2,181), which is the whole reason this script exists.

  actuals CSV   Sales Rep Assigned / Brand Family / Product Num & Name in three
                real columns -- but the FIRST row of a rep block is that rep's
                TOTAL, and the first row of each brand block within it is that
                brand's SUBTOTAL. Nothing marks them; the level is implied by
                position, exactly like the Molson Coors grouped workbooks.
  goals XLSX    one column ("Sales Rep Assigned / Brand Family / Product Num &
                Name"), level implied by position: Total -> rep -> brand ->
                product. Products are told apart by their leading product
                number, brands by a known brand set, and everything else at
                that level is a rep.

EVERY TOTAL IS RECONCILED ARITHMETICALLY rather than trusted, the same defence
convert_mc_retention.py uses: each brand subtotal must equal the sum of its
product rows, each rep total must equal the sum of its brand subtotals, and the
goals' base column must sum to the report's own Total row. A mis-levelled file
fails those sums, so this refuses to write rather than publish bad numbers.

THE GOAL COLUMN IS "90% of Placement Count GOAL" over the 6/1-8/31 BASE window,
applied to 9/1-11/30 actuals -- that is the retention structure, per Gavin
(2026-09-08): hold 90% of what you had over the summer. Verified: the goal is
exactly round-half-up(0.9 x base) on all 949 rows. Because each level rounds
independently, brand goals do NOT sum to the rep goal and rep goals do not sum
to the Total row (7,329 vs 7,326) -- that is rounding, not an error, so only
the BASE column is reconciled against the Total row, and the REP-LEVEL goal row
is what scores a rep.

Writes a third CSV, mabi_retention_fall_brand_goals.csv, with the workbook's
per-(rep, brand) base and goal -- see parse_goals().
THE GOALS FILE IS THE SOURCE OF THE GOALS (Gavin, 2026-09-23: "the file
for mabi contains the goal in the 90% of Placement Count GOAL column" --
make the dashboard match it). This reverses the 2026-09-21 rule that let the
actuals export's own goal column win: that column broke the 90% rule on four
brand rows (Chris Payton / Mike's Harder 77 on a base of 49, Dave Ehlers /
Mike's Hard Dirty Lemonade 5 on 2, ...), while every one of the goals file's
948 rows is exactly round-half-up(0.9 x base). The export's goals are now a
CROSS-CHECK only: every value that disagrees is printed, nothing is applied.
The goals file may be the original XLSX tree or the flat CSV export
("MABI_Fall_2026_Retention_Goals.csv": rep / brand / product columns, first
row of a rep block = rep total, first row of a brand block = brand subtotal).

Run: python3 convert_mabi_fall.py <actuals.csv> <goals.xlsx|goals.csv> [--dry-run]
     python3 convert_mabi_fall.py --goals-only <goals.xlsx|goals.csv> [--dry-run]
       (rewrites only the two goals CSVs; the actuals CSV is left as published)
"""
import csv
import re
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
DATA = HERE / "data"

# The six MABI brand families. Used only to tell a brand row from a rep row in
# the goals tree; a brand that ever appears outside this set would land at the
# rep level and be caught by the reconciliation below rather than pass quietly.
BRANDS = {"White Claw", "Cayman Jack", "Mike's Hard Lemonade", "Mike's Harder",
          "Mike's Hard Dirty Lemonade", "Mxd Cocktails"}


def num(v):
    if v is None or v == "":
        return 0.0
    return float(str(v).replace(",", "").strip())


def parse_actuals(path):
    """-> (products, rep_totals). products is a list of clean product rows."""
    rows = list(csv.DictReader(open(path, newline="", encoding="utf-8-sig")))
    if not rows:
        sys.exit("actuals: file is empty")
    vcol = next((c for c in rows[0] if c.startswith("Placement Count")), None)
    if not vcol:
        sys.exit("actuals: no 'Placement Count' column -- wrong export?")
    # The "w/ Goals" export (first seen 2026-09-21) adds a "( Placement Count
    # ... ) Goals" column that RDE fills on the rep-total and brand-subtotal
    # rows only. Since 2026-09-21 (Gavin) those ARE the goals the page shows,
    # at both levels; the workbook fills in only what the export lacks. See
    # main() for the merge and the build log for every value that differs.
    gcol = next((c for c in rows[0] if c.strip().endswith(") Goals")), None)
    recs = [(r["Sales Rep Assigned"].strip(), r["Brand Family"].strip(),
             r["Product Num & Name"].strip(), num(r[vcol]),
             num(r[gcol]) if gcol and (r[gcol] or "").strip() else None) for r in rows]

    products, rep_totals, problems = [], {}, []
    export_goals = {}                    # (rep, brand) -> goal, from the export's subtotal rows
    i = 0
    while i < len(recs):
        rep = recs[i][0]
        j = i
        while j < len(recs) and recs[j][0] == rep:
            j += 1
        block = recs[i:j]
        rep_total = block[0][3]          # first row of a rep block IS the total
        if block[0][4] is not None:
            export_goals[(rep, None)] = block[0][4]   # the rep-level goal, keyed with brand None
        body, k, brand_sum = block[1:], 0, 0.0
        while k < len(body):
            bf = body[k][1]
            m = k
            while m < len(body) and body[m][1] == bf:
                m += 1
            run = body[k:m]
            sub = run[0][3]              # first row of a brand block IS the subtotal
            if run[0][4] is not None:
                export_goals[(rep, bf)] = run[0][4]
            prods = run[1:]
            got = sum(x[3] for x in prods)
            if prods and abs(sub - got) > 1e-6:
                problems.append(f"  {rep} / {bf}: subtotal {sub:g} != products {got:g}")
            for x in prods:
                products.append({"Sales Rep Name": rep, "Brand Family": bf,
                                 "Product Num Name": x[2], "Placements": f"{x[3]:g}"})
            brand_sum += sub
            k = m
        if abs(rep_total - brand_sum) > 1e-6:
            problems.append(f"  {rep}: rep total {rep_total:g} != brands {brand_sum:g}")
        rep_totals[rep] = rep_total
        i = j
    return products, rep_totals, problems, vcol, export_goals


def parse_goals(path):
    """-> (rep_goals, house, product_count, brand_goals).
    rep_goals[rep] = (base, goal); brand_goals[(rep, brand)] = (base, goal).

    BRAND-LEVEL GOALS (added 2026-09-21, per Gavin: show MABI's goals per
    brand family the way Constellation / Yuengling / Molson Coors show
    theirs). The workbook carries a base and a 90% goal on every brand row
    under every rep; they are lifted here and, since 2026-09-23, are FINAL --
    the export's goal column is only cross-checked against them (main()). Each level rounds on
    its own, so a rep's brand goals need not sum to the rep goal (the
    docstring above); the BASES do sum, and that is checked."""
    if str(path).lower().endswith(".csv"):
        return _parse_goals_csv(path)
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = [(str(r[0]).strip(), r[1], r[2])
            for r in ws.iter_rows(min_row=2, values_only=True) if r[0] is not None]
    rep_goals, house, problems, nprod = {}, None, [], 0
    brand_goals, brand_base_sum = {}, {}
    cur = None
    for lab, base, goal in rows:
        if base is not None and goal is not None:
            # The stated rule: 90% of the base, rounded half up. Checked on
            # every row so a reissue that changes the percentage is caught here
            # rather than silently shifting everyone's bar.
            if int(num(base) * 0.9 + 0.5) != int(num(goal)):
                problems.append(f"  {lab}: goal {goal} != round(0.9 x {base})")
        if lab == "Total":
            house = (num(base), num(goal))
            continue
        if re.match(r"^\d", lab):        # product row: starts with its product number
            nprod += 1
            continue
        if lab in BRANDS:
            brand_goals[(cur, lab)] = (num(base), num(goal))
            brand_base_sum[cur] = brand_base_sum.get(cur, 0.0) + num(base)
            continue
        cur = lab
        rep_goals[lab] = (num(base), num(goal))
    for rep, (b, _) in rep_goals.items():
        if abs(brand_base_sum.get(rep, 0.0) - b) > 1e-6:
            problems.append(f"  {rep}: brand bases {brand_base_sum.get(rep, 0.0):g} != rep base {b:g}")
    if house is None:
        problems.append("  no 'Total' row found in the goals workbook")
    else:
        base_sum = sum(b for b, _ in rep_goals.values())
        if abs(base_sum - house[0]) > 1e-6:
            problems.append(f"  rep base {base_sum:g} != Total row {house[0]:g}")
    return rep_goals, house, problems, nprod, brand_goals


def _parse_goals_csv(path):
    """The flat CSV shape of the goals report (first seen 2026-09-23): three
    real label columns, levels implied by position exactly like the actuals
    export -- first row of a rep block is the rep total, first row of each
    brand block its subtotal. Same return shape and the same checks as the
    XLSX path: 90% rule on every row, products sum to their brand subtotal,
    brands to their rep total. It carries NO house Total row, so the house
    is the sum of rep bases and round-half-up(0.9 x that)."""
    rows = list(csv.DictReader(open(path, newline="", encoding="utf-8-sig")))
    if not rows:
        sys.exit("goals: file is empty")
    bcol = next((c for c in rows[0] if c.startswith("Placement Count")), None)
    gcol = next((c for c in rows[0] if "GOAL" in c.upper()), None)
    if not bcol or not gcol:
        sys.exit("goals: need a 'Placement Count' and a '... GOAL' column -- wrong export?")
    recs = [(r["Sales Rep Assigned"].strip(), r["Brand Family"].strip(),
             r["Product Num & Name"].strip(), num(r[bcol]), num(r[gcol]))
            for r in rows if (r.get("Sales Rep Assigned") or "").strip()]
    rep_goals, brand_goals, problems, nprod = {}, {}, [], 0
    for rep, bf, prod, base, goal in recs:
        if int(base * 0.9 + 0.5) != int(goal):
            problems.append(f"  {rep} / {bf} / {prod}: goal {goal:g} != round(0.9 x {base:g})")
    i = 0
    while i < len(recs):
        rep = recs[i][0]
        j = i
        while j < len(recs) and recs[j][0] == rep:
            j += 1
        block = recs[i:j]
        rep_goals[rep] = (block[0][3], block[0][4])
        body, k, brand_sum = block[1:], 0, 0.0
        while k < len(body):
            bf = body[k][1]
            m = k
            while m < len(body) and body[m][1] == bf:
                m += 1
            run = body[k:m]
            brand_goals[(rep, bf)] = (run[0][3], run[0][4])
            got = sum(x[3] for x in run[1:])
            nprod += len(run) - 1
            if run[1:] and abs(run[0][3] - got) > 1e-6:
                problems.append(f"  {rep} / {bf}: subtotal {run[0][3]:g} != products {got:g}")
            brand_sum += run[0][3]
            k = m
        if abs(block[0][3] - brand_sum) > 1e-6:
            problems.append(f"  {rep}: rep base {block[0][3]:g} != brands {brand_sum:g}")
        i = j
    hb = sum(b for b, _ in rep_goals.values())
    return rep_goals, (hb, float(int(hb * 0.9 + 0.5))), problems, nprod, brand_goals


def _write_goals(rep_goals, house, brand_goals):
    with open(DATA / "mabi_retention_fall_goals.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Sales Rep Name", "Base Placements", "Goal"])
        for rep in sorted(rep_goals):
            b, g = rep_goals[rep]
            w.writerow([rep, "" if b is None else f"{b:g}", f"{g:g}"])
        w.writerow(["Total", f"{house[0]:g}", f"{house[1]:g}"])
    with open(DATA / "mabi_retention_fall_brand_goals.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Sales Rep Name", "Brand Family", "Base Placements", "Goal"])
        for (rep, brand) in sorted(brand_goals):
            b, g = brand_goals[(rep, brand)]
            w.writerow([rep, brand, "" if b is None else f"{b:g}", f"{g:g}"])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if "--goals-only" in sys.argv:
        if len(args) != 1:
            sys.exit("usage: python3 convert_mabi_fall.py --goals-only <goals.xlsx|goals.csv> [--dry-run]")
        rep_goals, house, gp, nprod, brand_goals = parse_goals(args[0])
        print(f"goals:   {len(rep_goals)} reps, {len(brand_goals)} brand rows, {nprod} product rows, "
              f"house base {house[0]:g} / goal {house[1]:g}")
        if gp:
            print("\nRECONCILIATION FAILED -- refusing to write:")
            for p in gp[:20]:
                print(p)
            sys.exit(1)
        print("reconciliation: every brand subtotal and rep total adds up; every goal is round(0.9 x base)")
        if dry:
            print("\n--dry-run: nothing written")
            return
        _write_goals(rep_goals, house, brand_goals)
        print("\nwrote data/mabi_retention_fall_goals.csv and data/mabi_retention_fall_brand_goals.csv "
              "(actuals untouched). Now run: python3 generate.py")
        return
    if len(args) != 2:
        sys.exit("usage: python3 convert_mabi_fall.py <actuals.csv> <goals.xlsx|goals.csv> [--dry-run]")
    actuals_path, goals_path = args

    products, rep_totals, ap, vcol, export_goals = parse_actuals(actuals_path)
    rep_goals, house, gp, nprod, brand_goals = parse_goals(goals_path)

    print(f"actuals: {len(products)} product rows across {len(rep_totals)} reps "
          f"({vcol.strip()})")
    print(f"goals:   {len(rep_goals)} reps, {nprod} product rows, "
          f"house base {house[0]:g} / goal {house[1]:g}" if house else "goals: no house row")

    problems = ap + gp
    if problems:
        print("\nRECONCILIATION FAILED -- refusing to write:")
        for p in problems[:20]:
            print(p)
        sys.exit(1)
    print("reconciliation: every brand subtotal, rep total and the goals base add up")

    got = sum(rep_totals.values())
    want = sum(float(p["Placements"]) for p in products)
    print(f"  actuals house {got:g} (product rows sum to {want:g})")

    only_goal = sorted(set(rep_goals) - set(rep_totals))
    if only_goal:
        print(f"  goal but no 9/1-11/30 activity yet: {', '.join(only_goal)}")

    # THE GOALS FILE WINS (Gavin, 2026-09-23 -- reverses 2026-09-21's "use
    # the export's goals"). The "w/ Goals" export's goal column is only a
    # cross-check now: every value that disagrees with the goals file is
    # printed, none is applied. A rep the goals file lacks but the export
    # goals is the one exception -- that goal is taken, and printed.
    if export_goals:
        diffs = []
        for (rep, brand), g in sorted(export_goals.items(), key=lambda kv: (kv[0][0], kv[0][1] or "")):
            src = rep_goals if brand is None else brand_goals
            key = rep if brand is None else (rep, brand)
            b, wb = src.get(key, (None, None))
            if wb is None:
                src[key] = (b, g)
                diffs.append(f"    {rep}{'' if brand is None else ' / ' + brand}: not in the goals file -> export's {g:g} TAKEN")
            elif abs(wb - g) > 1e-6:
                diffs.append(f"    {rep}{'' if brand is None else ' / ' + brand}: goals file {wb:g} KEPT (export says {g:g})")
        print(f"  export goal column cross-check: {len(export_goals)} goals, {len(diffs)} disagree with the goals file")
        for line in diffs:
            print(line)

    if dry:
        print("\n--dry-run: nothing written")
        return

    with open(DATA / "mabi_retention_fall.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Sales Rep Name", "Brand Family",
                                          "Product Num Name", "Placements"])
        w.writeheader()
        w.writerows(products)
    _write_goals(rep_goals, house, brand_goals)

    print("\nwrote data/mabi_retention_fall.csv, data/mabi_retention_fall_goals.csv and data/mabi_retention_fall_brand_goals.csv")
    print("These are CLEAN (no subtotal rows). Now run: python3 generate.py")


if __name__ == "__main__":
    main()
