#!/usr/bin/env python3
"""Builds hub/data/accounts.js.

    ../territory-accounts/customers_active.csv
                                      each rep's assigned account universe since
                                      2026-10-07: Encompass' active "Customers"
                                      export, read through tools/customer_base.py
                                      (Gavin: "use that customer file as account base
                                      for reps going forward"). 2026 cases from the
                                      Rolling Distribution sales master.
    Brand_Sellable_Unsellable.xlsx    "Brand Permissions -- can we sell this
                                      brand in this area?" -- one row per
                                      brand family, CAN SELL / NOT IN
                                      TERRITORY / BLOCKED per Encompass area

Run: python3 generate.py            (from hub/, after overwriting either file)

The hub (hub.js) reads the output to answer, per program and per rep:
  eligible   accounts in the rep's book, right premise, brand CAN SELL there,
             not already buying
  buying     accounts already on the brand (from the trackers' own lists)
  high       the eligible accounts with the most 2026 volume
  excluded   accounts in the rep's book where the brand cannot be sold

AREA vs COUNTY. The brand file is keyed by Encompass AREA (Bergen, Passaic,
Passaic-FF, Essex, Hudson, Union, Sussex, Morris 1/2/3). ~110 accounts in the
customer base carry Area "Sales" (a house/telesell routing bucket) and a
handful sit in Middlesex. Those are resolved from COUNTY where that maps to
exactly one area (Bergen, Passaic -> Passaic, Hudson, Essex, Union, Sussex);
a Morris county account with no numbered area, and anything in Middlesex,
gets area null -- the hub lists those under "territory not confirmed" rather
than guessing, because an eligible list is a claim a rep acts on.

Reps outside the trackers' ROSTER (Default, Office Tell Sell, John Neukum,
Chris Politano) are written but never shown -- the hub only asks for roster
reps. Duplicate brand rows (the file flags four) keep the first occurrence;
they are identical.
"""
import datetime
import sys
import json
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
DATA = HERE / "data"
BASE_XLSX = DATA / "Sales_Reps_Customer_Base.xlsx"
BRAND_XLSX = DATA / "Brand_Sellable_Unsellable.xlsx"
OUT = DATA / "accounts.js"
PREM_OUT = HERE.parent / "shared" / "data" / "rep-premise.js"

AREAS = ["Bergen", "Passaic", "Passaic-FF", "Essex", "Hudson", "Union", "Sussex", "Morris 1", "Morris 2", "Morris 3"]
COUNTY_TO_AREA = {"Bergen": "Bergen", "Passaic": "Passaic", "Hudson": "Hudson", "Essex": "Essex",
                  "Union": "Union", "Sussex": "Sussex"}


def load_base():
    """THE REP ACCOUNT BASE (Gavin, 2026-10-07): the active Customers export through
    tools/customer_base.py (territory-accounts/customers_active.csv) -- every active account,
    on- and off-premise, by its Sales Rep Name. 2026 cases come from the Rolling Distribution
    sales master (Jan 2026 -> the latest loaded month), one scale for every account; they only
    order the "high potential" lists. The old Sales_Reps_Customer_Base.xlsx is no longer read."""
    import csv, sys
    sys.path.insert(0, str(HERE.parent / "tools"))
    import customer_base
    cases = {}
    for f in sorted((HERE.parent / "rolling-distribution" / "data" / "master" / "months").glob("2026-*.csv")):
        with open(f, newline="") as fh:
            for r in csv.DictReader(fh):
                cases[r["customer_num"]] = cases.get(r["customer_num"], 0.0) + float(r["cases"] or 0)
    reps, unresolved = {}, {}
    for a in customer_base.load():
        raw_area, county = a["area"], a["county"]
        area = raw_area if raw_area in AREAS else COUNTY_TO_AREA.get(county)
        if area is None:
            unresolved[(raw_area, county)] = unresolved.get((raw_area, county), 0) + 1
        reps.setdefault(a["rep"], []).append({
            "n": int(a["num"]) if a["num"].isdigit() else a["num"], "name": a["name"],
            "area": area, "rawArea": raw_area, "county": county, "city": a["city"],
            "prem": a["premise"], "cases": round(max(cases.get(a["num"], 0.0), 0.0), 1),
        })
    for v in reps.values():
        v.sort(key=lambda x: -x["cases"])
    as_of = datetime.date.fromtimestamp(customer_base.CUSTOMERS_CSV.stat().st_mtime).isoformat()
    return reps, as_of, unresolved


def load_brands():
    wb = openpyxl.load_workbook(BRAND_XLSX, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if r and r[0] == "Brand Family")
    hdr = [str(h or "").strip() for h in rows[hi]]
    ai = {a: hdr.index(a) for a in AREAS}
    i_terr = hdr.index("Brand Family Territory"); i_sup = hdr.index("Supplier"); i_sells = hdr.index("Sells As")
    fams = {}
    for r in rows[hi + 1:]:
        if not r or not r[0]:
            continue
        name = str(r[0]).strip()
        if name in fams:
            continue
        fams[name] = {
            "territory": (r[i_terr] or "").strip() if isinstance(r[i_terr], str) else "",
            "supplier": (r[i_sup] or "").strip() if isinstance(r[i_sup], str) else "",
            "sellsAs": (r[i_sells] or "").strip() if isinstance(r[i_sells], str) else "",
            "areas": {a: (r[ai[a]] or "").strip() for a in AREAS},
        }
    return fams


def main():
    reps, as_of, unresolved = load_base()
    fams = load_brands()
    stamp = as_of or datetime.date.today().isoformat()
    n_acc = sum(len(v) for v in reps.values())
    payload = (
        "// GENERATED by hub/generate.py from territory-accounts/customers_active.csv and\n"
        "// data/Brand_Sellable_Unsellable.xlsx -- do not edit by hand. See generate.py.\n"
        f"const HUB_ACCOUNTS = {json.dumps({'asOf': stamp, 'areas': AREAS, 'reps': reps}, separators=(',', ':'))};\n"
        f"const HUB_BRANDS = {json.dumps({'asOf': stamp, 'areas': AREAS, 'families': fams}, separators=(',', ':'))};\n"
    )
    OUT.write_text(payload)
    statuses = {}
    for f in fams.values():
        for s in f["areas"].values():
            statuses[s] = statuses.get(s, 0) + 1
    print(f"accounts: {n_acc} across {len(reps)} reps (as of {stamp}); "
          f"{sum(unresolved.values())} with no resolvable area: "
          + ", ".join(f"{k[0] or '-'}/{k[1] or '-'}={v}" for k, v in sorted(unresolved.items(), key=lambda x: -x[1])))
    print(f"brands: {len(fams)} families; cell statuses {statuses}")
    print(f"wrote {OUT.relative_to(HERE)} ({OUT.stat().st_size // 1024} KB)")
    # Per-rep on / off-premise ACCOUNT COUNTS (no names) for pages that load no book -- the
    # MPO trackers hide an objective a rep's route cannot reach (Gavin, 2026-10-07).
    sys.path.insert(0, str(HERE.parent / "tools"))
    from customer_base import ON_PREM_BARS
    on = lambda a: a.get("prem") == "On" or str(a.get("n")) in ON_PREM_BARS
    prem = {rep: {"on": sum(1 for a in rows if on(a)),
                  "off": sum(1 for a in rows if not on(a) and a.get("prem") == "Off")} for rep, rows in sorted(reps.items())}
    PREM_OUT.write_text("// GENERATED by hub/generate.py -- account counts per rep by premise, no account data.\n"
                        f"window.KDH_REP_PREMISE = {json.dumps(prem, separators=(',', ':'))};\n")
    print(f"wrote {PREM_OUT.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
