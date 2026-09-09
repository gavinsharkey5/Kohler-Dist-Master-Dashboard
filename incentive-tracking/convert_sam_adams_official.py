#!/usr/bin/env python3
"""Flatten Boston Beer's two "Sam Adams Seasonal ... Fall" workbooks -- the
per-rep conversion scoreboard and the unconverted-account list -- into
data/sam_adams_conversion_official.csv and data/sam_adams_unconverted_official.csv.

THESE ARE THE PROGRAM'S SOURCE OF TRUTH (Gavin, 2026-09-09: "this should be
the main source for this program"). Every scored number on the card -- lines
converted, not converted, gained, current season, converted % -- is Boston
Beer's own figure from the scoreboard, and the "still to convert" list is
their unconverted-account list, assigned to reps by Route. The RDE keg export
(data/sam_adams_keg_conversion.csv) is the DAILY SUPPLEMENT between
workbooks: it shows which of those accounts have taken an Octoberfest keg
since the workbook's as-of date. See build_sam_adams_conversion() in
generate.py. The raw workbooks are archived alongside as
data/sam_adams_conversion_boston_beer.xlsx and
data/sam_adams_unconverted_boston_beer.xlsx; generate.py never reads them.

Run: python3 convert_sam_adams_official.py <MMDDYY_..._Conversion_Fall.xlsx> <MMDDYY_..._Unconverted_Accounts_Fall.xlsx> [--dry-run]

The unconverted list carries no rep name, only a Route; each route is mapped
to the rep who owns it on the scoreboard, and the per-route count is
reconciled against that rep's "Not Converted" -- a mismatch means the two
workbooks are from different pulls, and nothing is written.

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
OUT_UNCONV = DATA / "sam_adams_unconverted_official.csv"
UNCONV_COLS = ["Div-Reg-Distributor Account - Extended Outlet Name", "Route", "County", "City",
               "Not Converted", "Current Season CEs", "Current Season LY CEs", "Prev Season CEs"]

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
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    as_of = None
    if "--as-of" in argv:
        i = argv.index("--as-of")
        as_of = argv[i + 1]
        del argv[i:i + 2]
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        raise SystemExit(__doc__)
    path = Path(args[0])
    unconv_path = Path(args[1])
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

    # ---- the unconverted-account list: no rep column, only a Route ----
    rep_by_route = {o["Route"]: o["Sales Rep Name"] for o in out}
    notc_by_route = {o["Route"]: o["Not Converted"] for o in out}
    uws = openpyxl.load_workbook(unconv_path, data_only=True).worksheets[0]
    urows = [list(r) for r in uws.iter_rows(values_only=True)]
    uhdr = [c for c in urows[0] if c is not None]
    if uhdr != UNCONV_COLS:
        raise SystemExit(f"{unconv_path.name}: header changed -- expected {UNCONV_COLS}, got {uhdr}")
    unconv, utotal = [], None
    for r in urows[1:]:
        if not any(v is not None for v in r):
            continue
        v = dict(zip(UNCONV_COLS, r))
        if v["Route"] is None:
            # The trailing row is the total: its Not Converted is the count.
            utotal = int(v["Not Converted"] or 0)
            continue
        route = str(v["Route"]).strip()
        name = str(v["Div-Reg-Distributor Account - Extended Outlet Name"] or "").strip()
        outlet, _, address = name.partition(" - ")
        unconv.append({"Sales Rep Name": rep_by_route.get(route, f"Route {route} (unassigned)"),
                       "Route": route, "Account": outlet.strip(), "Address": address.strip(),
                       "County": str(v["County"] or "").strip(), "City": str(v["City"] or "").strip(),
                       "Prev Season CEs": round(float(v["Prev Season CEs"] or 0), 2),
                       "Current Season LY CEs": round(float(v["Current Season LY CEs"] or 0), 2),
                       "Current Season CEs": round(float(v["Current Season CEs"] or 0), 2),
                       "As Of": as_of})
    if utotal is None:
        raise SystemExit(f"{unconv_path.name}: no total row found")
    if utotal != len(unconv):
        raise SystemExit(f"{unconv_path.name}: total row says {utotal} unconverted but {len(unconv)} account rows; refusing to write")
    per_route = {}
    for u in unconv:
        per_route[u["Route"]] = per_route.get(u["Route"], 0) + 1
    bad = [(rt, n, notc_by_route.get(rt)) for rt, n in per_route.items() if notc_by_route.get(rt) != n]
    bad += [(rt, 0, n) for rt, n in notc_by_route.items() if n and rt not in per_route]
    if bad:
        raise SystemExit(f"unconverted list does not reconcile to the scoreboard by route "
                         f"(route, list rows, scoreboard Not Converted): {bad} -- are the two workbooks from the same pull?")
    print(f"{unconv_path.name}: {len(unconv)} unconverted accounts across {len(per_route)} routes -- "
          f"reconciled to the scoreboard's Not Converted route by route")
    if dry:
        print("--dry-run: nothing written")
        return
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    with open(OUT_UNCONV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(unconv[0].keys()))
        w.writeheader()
        w.writerows(unconv)
    print(f"wrote {OUT.relative_to(HERE.parent)} and {OUT_UNCONV.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
