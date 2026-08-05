#!/usr/bin/env python3
"""
Rebuilds data/thc.json from thc_sales.csv -- the THC Volume Rewards
section of the Summer of Success page (its own tab, separate from the
main Qualifier/Amplify tracker built by generate.py).

Why a separate tab instead of folding THC into the existing tracker:
THC's reward structure doesn't fit either of the two patterns the main
tracker already knows how to render --
  - The main tracker's per-supplier Qualifier/Amplify goals are
    PERSONALIZED per rep (see goals.csv -- e.g. one rep's Coors Light
    goal is 491, another's is different).
  - The static "Rewards Payouts" grid at the top of the page is a
    company-wide AGGREGATE route-volume threshold (e.g. +25,000 case
    equivalents total across every rep combined).
THC (confirmed with Gavin, 2026-08-05) is a FLAT threshold applied
identically to every rep -- Delta Tier 1 = 50 cases, Crescent Canna
Tier 1 = 20 cases / Tier 2 = 10 cases, same number regardless of a
rep's book size -- with Crescent Canna additionally having TWO reward
tiers (main tracker's Qualifier concept is pass/fail, one tier only).
Building it as an independent tab keeps the existing tracker's code
(index.html's DATA/REPS/build()/etc., all of generate.py) completely
untouched -- THC has its own fetch, its own render function, its own
JSON file -- so a mistake here can't break the tracker that's already
running in production.

Input (keep this filename when re-exporting from RDE):
  thc_sales.csv   RDE "2026 Summer of Success THC" export: Sales Rep
                  Assigned, Supplier, Brand Family, Case Equiv for the
                  matching 6/1-8/31 windows in 2025 vs 2026, Case Equiv
                  Unit Difference. Same shape as sales.csv minus the
                  "Qualifier Brands" column -- THC has no per-rep
                  personalized goal to tag, so there's nothing for that
                  column to carry here.

The reward math itself (tier thresholds, dollar amounts, the $1/case
Amplify rate) lives in index.html as a hardcoded THC_TIERS config, not
in this script or any CSV -- there's no data source for it, Kohler
just told us the numbers (see the screenshot in the request that
prompted this). If those numbers change, edit THC_TIERS in index.html;
this script only ever handles the case-volume data.

Run: python3 generate_thc.py
"""
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
THC_CSV = HERE / "thc_sales.csv"
DATA_DIR = HERE / "data"


def find_col(fieldnames, *, year=None):
    for f in fieldnames:
        if f.startswith("Case Equiv") and year in f:
            return f
    return None


def to_num(raw):
    raw = (raw or "").strip()
    if raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        return float(raw)


def main():
    with open(THC_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        col_2025 = find_col(fieldnames, year="2025")
        col_2026 = find_col(fieldnames, year="2026")
        if not (col_2025 and col_2026):
            raise SystemExit(f"{THC_CSV}: could not find expected 'Case Equiv' columns in {fieldnames}")

        rows = []
        for r in reader:
            rep = (r.get("Sales Rep Assigned") or "").strip()
            if not rep:
                continue
            rows.append({
                "SALES_REP_ASSIGNED": rep,
                "SUPPLIER": r["Supplier"].strip(),
                "BRAND_FAMILY": r["Brand Family"].strip(),
                "CASE_EQUIV_2025": to_num(r[col_2025]),
                "CASE_EQUIV_2026": to_num(r[col_2026]),
                "CASE_EQUIV_UNIT_DIFFERENCE": to_num(r["Case Equiv Unit Difference"]),
            })

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "thc.json").write_text(json.dumps(rows, indent=2))

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (DATA_DIR / "thc_sync_meta.json").write_text(json.dumps({"synced_at": synced_at}, indent=2))

    print(f"Wrote {len(rows)} rows to data/thc.json")
    print(f"data/thc_sync_meta.json timestamped {synced_at}")


if __name__ == "__main__":
    main()
