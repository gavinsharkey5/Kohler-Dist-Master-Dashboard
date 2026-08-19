#!/usr/bin/env python3
"""Builds data/2026-08/mpo_lytt_photos.json -- the "Disruptors – (8) Lytt
POS Items Pics in iSellBeer" objective's dataset -- from three iSellBeer
photo exports saved under stable names in this folder:

  lytt_pos_displays.xlsx   iSellBeer "Report" tab export (Report_NN.xlsx),
                           Lytt-filtered: Photo Taker, Photo Taker's Role,
                           Account #, DBA, City, Brand, SKU, Quantity,
                           Date/Time, Photo (hyperlinked).
  lytt_pos_promos.xlsx     iSellBeer Promos export (Promos_Report_N.xlsx):
                           Photo taker, Photo taker's role, DBA, City,
                           Promotion type, Theme, Elements, Brand,
                           Quantity, Date/Time, Photo (hyperlinked).
  lytt_pos_pods.xlsx       iSellBeer PODS export (PODS_Report_N.xlsx):
                           Route / Sales Rep ("6 - James Heaney" format),
                           DBA, City, Brand, SKU, POD #, Photo -- only a
                           handful of POD rows carry a photo hyperlink;
                           the rest are distro records and are skipped.

Rules (confirmed with Gavin, 2026-08-19):
  - SALES REPS ONLY. Displays/promos rows are filtered by the export's own
    Role column; PODS has no role column but its "Route / Sales Rep" field
    is rep-only by construction. Names are canonicalized to the dashboard
    ROSTER spelling ("James Heaney" -> "Jim Heaney", "phil Ernst" ->
    "Phil Ernst", "Matthew Powierski" -> "Matt Powierski", "Daniel La
    Gala" -> "Dan Lagala", and PODS' "6 - " route prefix stripped); a name
    that still doesn't match the roster is warned about and skipped.
  - Only rows whose Photo cell carries a real hyperlink are written --
    a row without a clickable photo doesn't count for anything here.
  - The 8-pic target is counted in DISTINCT PHOTOS client-side (several
    SKU rows sharing one photo link = one pic -- confirmed 2026-08-19,
    "each distinct photo", NOT each row). Every photo-bearing row is
    still written so the dashboard can show which items are in each pic.
  - Only Lytt rows count (the exports are already Lytt-filtered at the
    source; a non-LYTT brand slipping in is warned about and dropped).

Refresh: save the three new exports over the stable filenames above, run
  python3 generate_lytt_pos.py
then commit and push. Does NOT touch generate_2026-08.py's CSVs/outputs
or sync_meta.json (the "Data refreshed" pill tracks the RDE sync, not
this photo feed).
"""
import json
import re
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
OUT = HERE / "data" / "2026-08" / "mpo_lytt_photos.json"

DISPLAYS_XLSX = HERE / "lytt_pos_displays.xlsx"
PROMOS_XLSX = HERE / "lytt_pos_promos.xlsx"
PODS_XLSX = HERE / "lytt_pos_pods.xlsx"

# Same 27 names as index.html's ROSTER -- keep in sync if the roster changes.
ROSTER = [
    "Alex Rodriguez", "Alisa Acciardi", "Allison Scott", "Andrew Lundy",
    "Anthony Palmisano", "Brian Sengebush", "Chris Payton", "Dan Lagala",
    "Dave Ehlers", "Derrick Laws", "Dylan Rubino", "Hakan Sadik",
    "Jaime Colonna", "Javier Melo", "Jayson Romine", "Jim Heaney",
    "John O'Donoghue", "Klejdi Lamo", "Matt Powierski", "Michael Harboy",
    "Mike Ast", "Nick Melissari", "Pablo Lopez", "Paul Mclaughlin",
    "Phil Ernst", "Robin Feldman", "Shane Barreca",
]
ROSTER_BY_UPPER = {n.upper(): n for n in ROSTER}
# iSellBeer spellings that differ from the RDE/roster spelling.
NAME_FIXES = {
    "JAMES HEANEY": "Jim Heaney",
    "MATTHEW POWIERSKI": "Matt Powierski",
    "DANIEL LA GALA": "Dan Lagala",
    "NICHOLAS MELISSARI": "Nick Melissari",
    "PAUL MCLAUGHLIN": "Paul Mclaughlin",
}


def canon_rep(name):
    n = re.sub(r"^\d+\s*-\s*", "", str(name or "").strip())  # PODS "6 - " route prefix
    if not n:
        return None
    up = re.sub(r"\s+", " ", n).upper()
    return NAME_FIXES.get(up) or ROSTER_BY_UPPER.get(up)


def header_map(ws):
    return {str(c.value).strip(): i for i, c in enumerate(ws[1]) if c.value is not None}


def is_lytt(brand):
    return "LYTT" in str(brand or "").upper()


def main():
    rows_out = []
    skipped_names = set()

    def add(rep_raw, source, dba, city, brand, detail, qty, date, photo_cell):
        if photo_cell is None or not photo_cell.hyperlink:
            return
        if not is_lytt(brand):
            print(f"  WARNING: non-Lytt brand row dropped ({brand!r} at {dba!r})")
            return
        rep = canon_rep(rep_raw)
        if not rep:
            skipped_names.add(str(rep_raw))
            return
        rows_out.append({
            "REP": rep,
            "SOURCE": source,
            "CUSTOMER_NAME": str(dba or "").strip(),
            "CITY": str(city or "").strip(),
            "BRAND": str(brand or "").strip(),
            "DETAIL": str(detail or "").strip(),
            "QUANTITY": qty if qty is not None else "",
            "DATE": str(date or "").strip(),
            "PHOTO_URL": photo_cell.hyperlink.target,
        })

    # -- displays (Report_NN "Report" tab) --
    wb = openpyxl.load_workbook(DISPLAYS_XLSX)
    ws = wb["Report"]
    h = header_map(ws)
    n0 = len(rows_out)
    for r in ws.iter_rows(min_row=2):
        if r[h["#"]].value is None:
            continue
        if str(r[h["Photo Taker's Role"]].value or "").strip() != "Sales Rep":
            continue
        add(r[h["Photo Taker"]].value, "Display", r[h["DBA"]].value, r[h["City"]].value,
            r[h["Brand"]].value, r[h["SKU"]].value, r[h["Quantity"]].value,
            r[h["Date/Time"]].value, r[h["Photo"]])
    print(f"Displays: {len(rows_out)-n0} sales-rep photo rows")

    # -- promos --
    wb = openpyxl.load_workbook(PROMOS_XLSX)
    ws = wb["Report"]
    h = header_map(ws)
    n0 = len(rows_out)
    for r in ws.iter_rows(min_row=2):
        if r[h["Date/Time"]].value is None:
            continue
        if str(r[h["Photo taker's role"]].value or "").strip() != "Sales Rep":
            continue
        detail = " · ".join(x for x in [
            str(r[h["Promotion type"]].value or "").strip(),
            str(r[h["Theme"]].value or "").strip(),
            str(r[h["Elements"]].value or "").strip(),
        ] if x)
        add(r[h["Photo taker"]].value, "Promo", r[h["DBA"]].value, r[h["City"]].value,
            r[h["Brand"]].value, detail, r[h["Quantity"]].value,
            r[h["Date/Time"]].value, r[h["Photo"]])
    print(f"Promos: {len(rows_out)-n0} sales-rep photo rows")

    # -- PODS (photo-bearing rows only; no role column, rep-only by construction) --
    wb = openpyxl.load_workbook(PODS_XLSX)
    ws = wb["Report"]
    h = header_map(ws)
    n0 = len(rows_out)
    for r in ws.iter_rows(min_row=2):
        add(r[h["Route / Sales Rep"]].value, "POD", r[h["DBA"]].value, r[h["City"]].value,
            r[h["Brand"]].value, r[h["SKU"]].value, None, "", r[h["Photo"]])
    print(f"PODS: {len(rows_out)-n0} photo rows (of {ws.max_row-1} total distro rows)")

    if skipped_names:
        print(f"  WARNING: rows skipped for non-roster names: {sorted(skipped_names)}")

    OUT.write_text(json.dumps(rows_out, indent=1))
    per_rep = {}
    for row in rows_out:
        per_rep.setdefault(row["REP"], set()).add(row["PHOTO_URL"])
    print(f"Wrote {len(rows_out)} rows to {OUT.name}; distinct photos per rep "
          f"(target 8): " + ", ".join(f"{k} {len(v)}" for k, v in
                                      sorted(per_rep.items(), key=lambda kv: -len(kv[1]))))


if __name__ == "__main__":
    main()
