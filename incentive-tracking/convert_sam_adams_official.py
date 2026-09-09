#!/usr/bin/env python3
"""Flatten Boston Beer's "Sam Adams Seasonal Conversion Fall" workbook into
data/sam_adams_conversion_official.csv -- the SUPPLIER'S OWN per-rep scoreboard
for the Summer Ale -> Octoberfest draft conversion program.

Boston Beer sends this workbook every couple of weeks; the daily source for
the program is the RDE keg export (data/sam_adams_keg_conversion.csv, see
build_sam_adams_conversion() in generate.py). This file is kept so the card
can print "Boston Beer's own count as of <date>" next to the daily number and
the two can be reconciled by eye. The raw workbook is archived alongside as
data/sam_adams_conversion_boston_beer.xlsx; generate.py never reads it.

Run: python3 convert_sam_adams_official.py <MMDDYY_Sam_Adams_Seasonal_Conversion_Fall.xlsx> [--dry-run]

The as-of date is read from the filename's leading MMDDYY (090826 -> 2026-09-08);
pass --as-of YYYY-MM-DD to override. Boston Beer spells some reps its own way
(Paul McLaughlin, Clay Lamo, Dan LaGala, James Heaney); ALIASES maps them onto
the RDE roster spelling generate.py uses. A rep name this script cannot map is
kept as-is so it surfaces in the build log rather than vanishing. The route-90
row carries no rep name and is written as "Route 90 (unassigned)".
"""
import csv
import datetime
import re
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = DATA / "sam_adams_conversion_official.csv"

ALIASES = {
    "paul mclaughlin": "Paul Mclaughlin",
    "clay lamo": "Klejdi Lamo",
    "dan lagala": "Dan Lagala",
    "james heaney": "Jim Heaney",
}

COLS = ["Rep Name", "Route", "Prev Season Dist", "Converted", "Converted %", "Not Converted",
        "Gained Not from Conversion", "Current Season Dist", "Current Season LY Dist",
        "Current Season % LY", "Fall Distribution LY", "Current Season % Fall Distro LY"]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    as_of = None
    for i, a in enumerate(sys.argv):
        if a == "--as-of":
            as_of = sys.argv[i + 1]
    if len(args) != 1:
        raise SystemExit(__doc__)
    path = Path(args[0])
    if as_of is None:
        m = re.match(r"(?:[0-9a-f]+-)?(\d{2})(\d{2})(\d{2})_", path.name)
        if not m:
            raise SystemExit(f"{path.name}: no leading MMDDYY in the filename; pass --as-of YYYY-MM-DD")
        as_of = datetime.date(2000 + int(m.group(3)), int(m.group(1)), int(m.group(2))).isoformat()

    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    hdr_i = next(i for i, r in enumerate(rows) if r and r[0] == "Rep Name")
    header = [c for c in rows[hdr_i] if c is not None]
    if header[:len(COLS)] != COLS:
        raise SystemExit(f"{path.name}: header changed -- expected {COLS}, got {header}")

    out, total = [], None
    for r in rows[hdr_i + 1:]:
        if not any(v is not None for v in r):
            continue
        name = (r[0] or "").strip() if isinstance(r[0], str) else r[0]
        route = str(r[1]).strip() if r[1] is not None else ""
        vals = {c: r[i] for i, c in enumerate(COLS)}
        if name == "Total":
            total = vals
            continue
        if not name:
            name = f"Route {route} (unassigned)"
        rep = ALIASES.get(name.lower(), name)
        conv = int(vals["Converted"] or 0)
        notc = int(vals["Not Converted"] or 0)
        gained = int(vals["Gained Not from Conversion"] or 0)
        # Boston Beer leaves "Prev Season Dist" and "Current Season Dist" BLANK
        # on some rows (Brian Sengebush, James Heaney on the 9/8 workbook) even
        # though the Total row counts them: prev is converted + not converted
        # and current is converted + gained by the workbook's own arithmetic,
        # so a blank is derived rather than read as zero -- reading it as zero
        # is exactly what made the Total fail to reconcile.
        prev = int(vals["Prev Season Dist"]) if vals["Prev Season Dist"] is not None else conv + notc
        cur = int(vals["Current Season Dist"]) if vals["Current Season Dist"] is not None else conv + gained
        out.append({"Sales Rep Name": rep, "Route": route,
                    "Prev Season Dist": prev,
                    "Converted": conv,
                    "Not Converted": notc,
                    "Gained": gained,
                    "Current Season Dist": cur,
                    "Current Season LY Dist": int(vals["Current Season LY Dist"] or 0),
                    "Fall Distribution LY": int(vals["Fall Distribution LY"] or 0),
                    "As Of": as_of})
    if total is None:
        raise SystemExit(f"{path.name}: no Total row found")

    # Reconcile: the Total row must equal the sum of the rep rows on every
    # count column, or the workbook's layout has changed under us.
    for col, key in [("Prev Season Dist", "Prev Season Dist"), ("Converted", "Converted"),
                     ("Not Converted", "Not Converted"), ("Gained Not from Conversion", "Gained"),
                     ("Current Season Dist", "Current Season Dist")]:
        s = sum(o[key] for o in out)
        if int(total[col] or 0) != s:
            raise SystemExit(f"{path.name}: Total {col} = {total[col]} but rep rows sum to {s}; refusing to write")
    print(f"{path.name}: {len(out)} rep rows as of {as_of}; Total prev {total['Prev Season Dist']} / "
          f"converted {total['Converted']} / not converted {total['Not Converted']} / gained "
          f"{total['Gained Not from Conversion']} / current {total['Current Season Dist']} -- reconciled")
    if dry:
        print("--dry-run: nothing written")
        return
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print(f"wrote {OUT.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
