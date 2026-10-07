"""THE rep account base (Gavin, 2026-10-07): Encompass' "Customers" export of ACTIVE
accounts, saved as territory-accounts/customers_active.csv. Every generator that needs
"which accounts does a rep own, and where are they" reads it through this module.

Columns used: Customer ID, Customer Name, On Premise, Sales Rep Name, Customer Type,
Shipping Address, City, County, Distribution Area. (The export has no phones or emails;
keep it that way -- the repo is public.)

TERRITORY (Gavin, 2026-10-07 -- remember it):
  Core Market        Bergen, Passaic, Passaic-FF, Morris 1, Morris 3, Sussex
  Southern District  Essex, Hudson, Union
  "Sales"            a routing placeholder: placed by its County (Bergen / Passaic / Sussex ->
                     Core Market; Essex / Hudson / Union -> Southern District; anything else,
                     e.g. Warren, Morris -> neither)
  Morris 2, Middlesex and everything else belong to neither.

PROGRAM BASES (`program_base`): the rep's accounts of one premise in the Core Market, Whole
Foods removed (they cannot sell alcohol) and the MetLife Stadium concession stands removed
(Gavin, 2026-10-07: "leave out"). The full book (`load`) keeps every account -- those stands are
still Alex Rodriguez's accounts on My Accounts.

Refresh: save the new export over territory-accounts/customers_active.csv, then run
hub/generate.py, accounts/generate.py, carbliss-mpo/generate.py and the MPO generators.
"""
import csv
from pathlib import Path

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "middleware.js").exists())
CUSTOMERS_CSV = ROOT / "territory-accounts" / "customers_active.csv"

CORE_AREAS = ("Bergen", "Passaic", "Passaic-FF", "Morris 1", "Morris 3", "Sussex")
SOUTHERN_AREAS = ("Essex", "Hudson", "Union")
CORE_SALES_COUNTIES = ("Bergen", "Passaic", "Sussex")
SOUTHERN_SALES_COUNTIES = ("Essex", "Hudson", "Union")

# MetLife Stadium concession stands filed as off-premise "Sales" accounts (Qsr, Lounge,
# Victory Terrace, Backyard, Izod Center): out of every program base.
LEFT_OUT = {"30018", "30019", "30020", "30027", "31012"}

# Bars Encompass files as Off Premise that pour draft kegs -- counted as ON-premise for program
# reach (Gavin, 2026-10-07: Milton Inn, White Deer Inn, The George Inn). Read by the on-prem MPO
# generator (Oktoberfest base) and hub/generate.py (shared/data/rep-premise.js counts).
ON_PREM_BARS = {"191210", "230121", "231203"}


def _s(v):
    return (v or "").strip()


def territory(area, county):
    """'core' | 'southern' | None for a Distribution Area (+ County when the area is "Sales")."""
    area, county = _s(area), _s(county)
    if area in CORE_AREAS:
        return "core"
    if area in SOUTHERN_AREAS:
        return "southern"
    if area == "Sales":
        if county in CORE_SALES_COUNTIES:
            return "core"
        if county in SOUTHERN_SALES_COUNTIES:
            return "southern"
    return None


def is_whole_foods(name):
    return "whole foods" in _s(name).lower()


def load(path=CUSTOMERS_CSV):
    """Every active account: dicts with num, name, rep, premise ('On' / 'Off'), type, address,
    city, county, area (the raw Distribution Area), terr ('core' / 'southern' / None)."""
    out = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            num, rep = _s(r.get("Customer ID")), _s(r.get("Sales Rep Name"))
            if not num or not rep:
                continue
            prem = _s(r.get("On Premise")).lower()
            out.append({
                "num": num, "name": _s(r.get("Customer Name")), "rep": rep,
                "premise": "On" if prem.startswith("on") else ("Off" if prem.startswith("off") else _s(r.get("On Premise"))),
                "type": _s(r.get("Customer Type")), "address": _s(r.get("Shipping Address")),
                "city": _s(r.get("City")), "county": _s(r.get("County")), "area": _s(r.get("Distribution Area")),
                "terr": territory(r.get("Distribution Area"), r.get("County")),
            })
    return out


def program_base(premise, terr="core", path=CUSTOMERS_CSV):
    """(base, removed): the accounts a program counts for one premise in one territory --
    Whole Foods and the LEFT_OUT stands are returned separately in `removed`."""
    base, removed = [], []
    for a in load(path):
        if a["premise"] != premise or a["terr"] != terr:
            continue
        (removed if (is_whole_foods(a["name"]) or a["num"] in LEFT_OUT) else base).append(a)
    return base, removed


def cases_2026():
    """customer # -> net 2026 cases from the Rolling Distribution sales master (Jan 2026 -> the
    latest loaded month). Used only to order / label target lists."""
    out = {}
    for f in sorted((ROOT / "rolling-distribution" / "data" / "master" / "months").glob("2026-*.csv")):
        with open(f, newline="") as fh:
            for r in csv.DictReader(fh):
                out[r["customer_num"]] = out.get(r["customer_num"], 0.0) + float(r["cases"] or 0)
    return out


INCENTIVE_BASE_CSV = ROOT / "incentive-tracking" / "data" / "customer_base_full.csv"


def write_incentive_base(path=INCENTIVE_BASE_CSV):
    """incentive-tracking/data/customer_base_full.csv in its existing column layout, from the
    Customers export (every active account, both premises, all areas; Draft Package from the
    export; Buyer Count / Cases 2026 from the sales master). incentive-tracking/generate.py reads
    it unchanged (Area + County decide Core Market exactly as `territory` does)."""
    cases = cases_2026()
    raw = {}
    with open(CUSTOMERS_CSV, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            raw[_s(r.get("Customer ID"))] = _s(r.get("Draft Package"))
    cols = ["Sales Rep Assigned", "Customer Num", "Customer Name", "Shipping Address", "Distribution Area",
            "County", "City", "Area", "Premise", "Draft Package", "Buyer Count   2026", "Cases   2026"]
    rows = []
    for a in load():
        c = max(cases.get(a["num"], 0.0), 0.0)
        rows.append([a["rep"], a["num"], a["name"], a["address"], a["area"], a["county"], a["city"], a["area"],
                     a["premise"] + " Premise", raw.get(a["num"], ""), "1" if c > 0 else "0", f"{c:.2f}"])
    rows.sort(key=lambda r: (r[0], -float(r[11]), r[2]))
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)
    return len(rows)


if __name__ == "__main__":
    import sys
    if "--write-incentive-base" in sys.argv:
        print(f"wrote {INCENTIVE_BASE_CSV.relative_to(ROOT)}: {write_incentive_base()} accounts")
    else:
        base_off, out_off = program_base("Off")
        base_on, out_on = program_base("On")
        print(f"{CUSTOMERS_CSV.relative_to(ROOT)}: {len(load())} active accounts; Core Market program bases: "
              f"off-premise {len(base_off)} ({len(out_off)} left out), on-premise {len(base_on)} ({len(out_on)} left out)")
