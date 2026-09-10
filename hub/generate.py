#!/usr/bin/env python3
"""Builds hub/data/accounts.js from the two workbooks in hub/data/.

    Sales_Reps_Customer_Base.xlsx     each rep's assigned account universe
                                      (RDE "Sales Reps' Customer Base" report,
                                      one block per rep, YTD buyers with 2026
                                      case volume, area/county/city/premise)
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
import json
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
DATA = HERE / "data"
BASE_XLSX = DATA / "Sales_Reps_Customer_Base.xlsx"
BRAND_XLSX = DATA / "Brand_Sellable_Unsellable.xlsx"
OUT = DATA / "accounts.js"

AREAS = ["Bergen", "Passaic", "Passaic-FF", "Essex", "Hudson", "Union", "Sussex", "Morris 1", "Morris 2", "Morris 3"]
COUNTY_TO_AREA = {"Bergen": "Bergen", "Passaic": "Passaic", "Hudson": "Hudson", "Essex": "Essex",
                  "Union": "Union", "Sussex": "Sussex"}


def load_base():
    wb = openpyxl.load_workbook(BASE_XLSX, read_only=True, data_only=True)
    ws = wb["Sales Reps Customer Base"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(h or "").strip() for h in rows[0]]
    col = {h.split()[0].lower() if h else "": i for i, h in enumerate(hdr)}
    # The header row is fixed by the RDE report; locate by leading word so a
    # respaced "Cases   2026" still resolves.
    i_num = next(i for i, h in enumerate(hdr) if h.startswith("Sales Rep Assigned"))
    i_name = hdr.index("Customer Name"); i_area = hdr.index("Area"); i_county = hdr.index("County")
    i_city = hdr.index("City"); i_prem = hdr.index("Premise")
    i_cases = next(i for i, h in enumerate(hdr) if h.startswith("Cases"))
    reps, cur, unresolved = {}, None, {}
    for r in rows[1:]:
        key = r[i_num]
        if key is None:
            continue
        if isinstance(key, str):
            if key.strip() == "Total":
                continue
            cur = key.strip(); reps[cur] = []
            continue
        raw_area = (r[i_area] or "").strip()
        county = (r[i_county] or "").strip()
        area = raw_area if raw_area in AREAS else COUNTY_TO_AREA.get(county)
        if area is None:
            unresolved[(raw_area, county)] = unresolved.get((raw_area, county), 0) + 1
        prem = (r[i_prem] or "").strip()
        reps[cur].append({
            "n": int(key), "name": (r[i_name] or "").strip(),
            "area": area, "rawArea": raw_area, "county": county, "city": (r[i_city] or "").strip(),
            "prem": "On" if prem.lower().startswith("on") else ("Off" if prem.lower().startswith("off") else prem),
            "cases": round(float(r[i_cases] or 0), 1),
        })
    details = wb["Details"] if "Details" in wb.sheetnames else None
    as_of = None
    if details:
        for r in details.iter_rows(values_only=True):
            if r and r[0] == "Report Created Time" and isinstance(r[2], datetime.datetime):
                as_of = r[2].date().isoformat()
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
        "// GENERATED by hub/generate.py from data/Sales_Reps_Customer_Base.xlsx and\n"
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


if __name__ == "__main__":
    main()
