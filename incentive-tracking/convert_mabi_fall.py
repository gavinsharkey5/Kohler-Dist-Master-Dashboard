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

Run: python3 convert_mabi_fall.py <actuals.csv> <goals.xlsx> [--dry-run]
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
    recs = [(r["Sales Rep Assigned"].strip(), r["Brand Family"].strip(),
             r["Product Num & Name"].strip(), num(r[vcol])) for r in rows]

    products, rep_totals, problems = [], {}, []
    i = 0
    while i < len(recs):
        rep = recs[i][0]
        j = i
        while j < len(recs) and recs[j][0] == rep:
            j += 1
        block = recs[i:j]
        rep_total = block[0][3]          # first row of a rep block IS the total
        body, k, brand_sum = block[1:], 0, 0.0
        while k < len(body):
            bf = body[k][1]
            m = k
            while m < len(body) and body[m][1] == bf:
                m += 1
            run = body[k:m]
            sub = run[0][3]              # first row of a brand block IS the subtotal
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
    return products, rep_totals, problems, vcol


def parse_goals(path):
    """-> (rep_goals, house, product_count). rep_goals[rep] = (base, goal)."""
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = [(str(r[0]).strip(), r[1], r[2])
            for r in ws.iter_rows(min_row=2, values_only=True) if r[0] is not None]
    rep_goals, house, problems, nprod = {}, None, [], 0
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
            continue
        cur = lab
        rep_goals[lab] = (num(base), num(goal))
    if house is None:
        problems.append("  no 'Total' row found in the goals workbook")
    else:
        base_sum = sum(b for b, _ in rep_goals.values())
        if abs(base_sum - house[0]) > 1e-6:
            problems.append(f"  rep base {base_sum:g} != Total row {house[0]:g}")
    return rep_goals, house, problems, nprod


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if len(args) != 2:
        sys.exit(__doc__.strip().splitlines()[-1])
    actuals_path, goals_path = args

    products, rep_totals, ap, vcol = parse_actuals(actuals_path)
    rep_goals, house, gp, nprod = parse_goals(goals_path)

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

    if dry:
        print("\n--dry-run: nothing written")
        return

    with open(DATA / "mabi_retention_fall.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Sales Rep Name", "Brand Family",
                                          "Product Num Name", "Placements"])
        w.writeheader()
        w.writerows(products)
    with open(DATA / "mabi_retention_fall_goals.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Sales Rep Name", "Base Placements", "Goal"])
        for rep in sorted(rep_goals):
            b, g = rep_goals[rep]
            w.writerow([rep, f"{b:g}", f"{g:g}"])
        w.writerow(["Total", f"{house[0]:g}", f"{house[1]:g}"])

    print("\nwrote data/mabi_retention_fall.csv and data/mabi_retention_fall_goals.csv")
    print("These are CLEAN (no subtotal rows). Now run: python3 generate.py")


if __name__ == "__main__":
    main()
