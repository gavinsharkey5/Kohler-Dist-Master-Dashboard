#!/usr/bin/env python3
"""Rewrites sales_reps_customer_base_core.csv from RDE's "Entire Core Market Off
Prem Accts" export (core_market_off_prem_export.csv in this folder).

Why this exists next to territory-accounts/refresh_customer_bases.py: the
2026-10-05 export carries a "Sales Route Num" column and 23 accounts whose
Distribution Area is RDE's "Sales" placeholder (no geographic detail), and that
script refuses both. This file is the Core Off-Premise base ONLY (Lytt's and
Keystone's denominator, the Target Accounts scope), full replace, same 11
columns convert_customer_base_core.py has always written; "Sales" rows are kept
(consumers fall back to County for them) and Premise is "Off Premise".
It does NOT touch MPOs/on-prem/sales_reps_customer_base.csv or
incentive-tracking/data/customer_base_full.csv.

Run: python3 refresh_core_base_from_export.py [--dry-run]
Then rerun the CURRENT month's generator (a closed month is a published snapshot).
Whole Foods accounts stay in this file; generate_2026-10.py drops them for Lytt only.
"""
import csv, sys
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "core_market_off_prem_export.csv"
OUT = HERE / "sales_reps_customer_base_core.csv"
HEADER = ["Sales Rep Assigned", "Customer Num", "Customer Name", "Shipping Address",
          "Distribution Area", "Area", "County", "City", "Premise", "Buyer Count   2026", "Cases   2026"]
CORE_AREAS = {"Bergen", "Passaic", "Passaic-FF", "Morris 1", "Morris 3", "Sussex", "Sales"}


def main():
    with open(SRC, newline="", encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if any((v or "").strip() for v in r.values())]
    need = {"Sales Rep Assigned", "Customer Num", "Customer Name", "Shipping Address", "City", "County", "Distribution Area"}
    if need - set(rows[0]):
        raise SystemExit(f"export is missing columns {need - set(rows[0])}")
    bad = {r["Distribution Area"] for r in rows} - CORE_AREAS
    if bad:
        raise SystemExit(f"non-Core-Market Distribution Area values {bad}: wrong export?")
    if not 400 <= len(rows) <= 700:
        raise SystemExit(f"{len(rows)} rows is outside the expected 400-700 band")
    seen = set()
    for r in rows:
        k = (r["Sales Rep Assigned"].strip(), r["Customer Num"].strip())
        if k in seen:
            raise SystemExit(f"duplicate rep + customer {k}")
        seen.add(k)
    cases = next(c for c in rows[0] if c.startswith("Cases"))
    buyers = next(c for c in rows[0] if c.startswith("Buyer Count"))
    out = [[r["Sales Rep Assigned"].strip(), r["Customer Num"].strip(), r["Customer Name"].strip(), r["Shipping Address"].strip(),
            r["Distribution Area"].strip(), r["Distribution Area"].strip(), r["County"].strip(), r["City"].strip(),
            "Off Premise", r[buyers], r[cases]] for r in rows]
    old = {}
    if OUT.exists():
        with open(OUT, newline="", encoding="utf-8-sig") as f:
            old = {(r["Sales Rep Assigned"], r["Customer Num"]): r["Customer Name"] for r in csv.DictReader(f)}
    new = {(o[0], o[1]): o[2] for o in out}
    print(f"{len(out)} accounts (was {len(old)}): +{len(set(new) - set(old))} added, -{len(set(old) - set(new))} dropped, "
          f"{sum(1 for o in out if o[4] == 'Sales')} with the 'Sales' area placeholder")
    for k in sorted(set(new) - set(old)):
        print("  +", k[0], k[1], new[k])
    for k in sorted(set(old) - set(new)):
        print("  -", k[0], k[1], old[k])
    if "--dry-run" in sys.argv:
        print("--dry-run: nothing written")
        return
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        w.writerows(out)
    print(f"wrote {OUT.name}")


if __name__ == "__main__":
    main()
