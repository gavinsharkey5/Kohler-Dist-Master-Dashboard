"""Rewrite the Yuengling Fall 2026 retention WORKBOOKS into the flat CSVs generate.py reads.

Since 2026-10-21 the three summaries (Off Premise with 95% Goals, On Premise Packages, On Premise
Draft) arrive as .xlsx with one grouped label column, "Sales Rep Assigned / Brand Family": a
"Total" row, then each rep's subtotal row followed by that rep's brand rows. The flat CSV export
generate.py was built on repeats the rep on every row and labels the rep's SUBTOTAL row with the
rep's first brand. This rewrites each workbook into that layout (same header line as the file it
replaces); a row is a brand when its label starts with "Yuengling", otherwise it is a rep.

The draft workbook is the SUMMARY (goals). Draft distribution is still counted from the account
export, data/yuengling_retention_fall_draft_on_detail.csv -- send that one too to move draft buyers.

Usage: python3 incentive-tracking/convert_yuengling_fall_xlsx.py <off.xlsx> <packages_on.xlsx> <draft_on.xlsx>
(recognised by file name: "Off Premise", "Packages", "Draft")
"""
import csv, os, sys
import openpyxl

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def target(path):
    n = os.path.basename(path).lower()
    if "off premise" in n or "off_premise" in n: return "off"
    if "packages" in n: return "packages_on"
    if "draft" in n: return "draft_on"
    sys.exit(f"{os.path.basename(path)}: cannot tell which Yuengling report this is")


def num(v):
    return "" if v in (None, "") else f"{float(v):.2f}"


def convert(path):
    kind = target(path)
    out_path = os.path.join(DATA, f"yuengling_retention_fall_{kind}.csv")
    header = next(csv.reader(open(out_path, newline="", encoding="utf-8-sig")))
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    rows = [r for r in ws.iter_rows(values_only=True)]
    if str(rows[0][0]).strip() != "Sales Rep Assigned / Brand Family":
        sys.exit(f"{os.path.basename(path)}: unexpected header {rows[0][0]!r}")
    body = [r for r in rows[1:] if r and r[0] not in (None, "") and str(r[0]).strip() != "Total"]
    out, rep, reps = [], None, 0
    for i, r in enumerate(body):
        label = str(r[0]).strip()
        if label.startswith("Yuengling"):
            if rep is None: sys.exit(f"{os.path.basename(path)}: brand row before any rep")
            out.append([rep, label] + list(r[1:5]))
        else:
            rep, reps = label, reps + 1
            first = next((str(x[0]).strip() for x in body[i + 1:] if str(x[0]).strip().startswith("Yuengling")), "")
            if not first: sys.exit(f"{os.path.basename(path)}: rep {rep} has no brand rows")
            out.append([rep, first] + list(r[1:5]))
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for rep, brand, base, cur, goal, pct in out:
            w.writerow([rep, brand, num(base), num(cur), num(goal), pct or ""])
    print(f"{os.path.basename(out_path)}: {len(out)} rows, {reps} reps, from {os.path.basename(path)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        convert(p)
