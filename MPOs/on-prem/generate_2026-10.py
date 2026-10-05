#!/usr/bin/env python3
"""Builds October 2026's on-premise MPO datasets (OCTOBER_ON_PREM_2026_MPO.docx).

  25%  Carbliss  -- 40% Buying Accounts              (awaiting: account base not loaded yet)
  25%  BBC       -- Complete Oktoberfest Draft Conversion   (built here)
  25%  Spirits   -- Follow up on all On-Premise Spirits placements   (built here)
  25%  iSellBeer -- (5) Feature Photos               (awaiting: no October export yet)

Inputs (this folder, overwrite to refresh):
  sam_adams_kegs_summer_to_octoberfest.csv   RDE "Sam Adams Kegs: Summer Ale to Octoberfest" --
                                             one row per rep / account / keg SKU / load-sheet date.
  spirits_followup_placements.csv            RDE two-window export (7/1-9/30 placements, 10/1-10/31).

Run:  python3 generate_2026-10.py     (also rebuilds the per-rep copies)

Both objectives are FOLLOW-UP scores: a rep has a list of accounts (the base)
and each one is either done or not yet.

--- BBC Oktoberfest conversion ---
BASE = accounts whose NET Summer Ale keg units are > 0 over the export's whole
window (4/1/2026 on; a keg bought and returned is nothing -- the same net rule
the Incentive Tracker's Sam Adams conversion uses). DONE = the same account has
NET Octoberfest keg units > 0. Accounts that took Octoberfest but never Summer
Ale ("gained") are not in the base. "Complete" = every base account, so the
target is 100% of the rep's base.

--- Spirits follow-up ---
BASE = accounts with a spirits placement in 7/1-9/30. DONE = the same account
placed spirits again in 10/1-10/31 (any spirit). Accounts that are new in October
(no Q3 placement) are not in the base. Target = every base account.
"""
import csv, json, subprocess, sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
MONTH_KEY = "2026-10"
KEGS_CSV = HERE / "sam_adams_kegs_summer_to_octoberfest.csv"
SPIRITS_CSV = HERE / "spirits_followup_placements.csv"
HOUSE = {"Default", "Office Tell Sell"}      # Encompass house "reps" -- not people


def load(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    return [r for r in rows if any((v or "").strip() for v in r.values())]


def num(v):
    v = (v or "").strip().replace(",", "")
    return float(v) if v else 0.0


def split_customer(raw):
    raw = (raw or "").strip()
    n, _, name = raw.partition(" ")
    return n.strip(), name.strip()


def dt(s):
    try:
        return datetime.strptime((s or "").strip().split()[0], "%m/%d/%Y")
    except (ValueError, IndexError):
        return None


def fmt(d):
    return d.strftime("%-m/%-d/%Y") if d else ""


def short_keg(name):
    # "3813 Sam Adams Octoberfest 15.5 Gal Keg" -> "Octoberfest 15.5 Gal Keg"
    n = name.split(" ", 1)[1] if name[:1].isdigit() else name
    return n.replace("Sam Adams ", "").replace("Summer Ale", "Summer Ale").strip()


def build_conversion():
    rows = load(KEGS_CSV)
    k = list(rows[0].keys())
    ucols = [c for c in k if c.startswith("Units")]
    acct = defaultdict(lambda: {"S": defaultdict(float), "O": defaultdict(float),
                                "sd": None, "od": None})
    for r in rows:
        rep = (r["Sales Rep Assigned"] or "").strip()
        if not rep or rep in HOUSE:
            continue
        units = sum(num(r[c]) for c in ucols)
        a = acct[(rep, r["Customer Num & Company"].strip())]
        side = "S" if "summer" in r["Brand"].lower() else "O"
        a[side][short_keg(r["Product Num & Name"])] += units
        d = dt(r["Date"])
        key = "sd" if side == "S" else "od"
        if d and units > 0 and (a[key] is None or (side == "S" and d > a[key]) or (side == "O" and d < a[key])):
            a[key] = d      # latest Summer Ale load; FIRST Octoberfest load
    out = []
    for (rep, cust), a in sorted(acct.items()):
        s_net = sum(a["S"].values())
        if s_net <= 0:
            continue
        o_net = sum(a["O"].values())
        num_, name = split_customer(cust)
        out.append({
            "SALES_REP_ASSIGNED": rep, "CUSTOMER_NUM": int(num_) if num_.isdigit() else num_, "CUSTOMER_NAME": name,
            "BASE_DETAIL": ", ".join(f"{p} x{u:g}" for p, u in a["S"].items() if u > 0),
            "BASE_DATE": fmt(a["sd"]),
            "DONE": 1 if o_net > 0 else 0,
            "DONE_DETAIL": ", ".join(f"{p} x{u:g}" for p, u in a["O"].items() if u > 0) if o_net > 0 else "",
            "DONE_DATE": fmt(a["od"]) if o_net > 0 else "",
        })
    return out


def build_spirits():
    rows = load(SPIRITS_CSV)
    k = list(rows[0].keys())
    cur = next(c for c in k if c.startswith("Placement Count") and "10/1/2026" in c)
    base = next(c for c in k if c.startswith("Placement Count") and "7/1/2026" in c)
    acct = defaultdict(lambda: {"B": set(), "O": set(), "bd": None, "od": None})
    for r in rows:
        rep = (r["Sales Rep Assigned"] or "").strip()
        if not rep or rep in HOUSE:
            continue
        a = acct[(rep, r["Customer Num & Company"].strip())]
        prod = (r["Product Num & Name"].split(" ", 1)[1] if r["Product Num & Name"][:1].isdigit() else r["Product Num & Name"]).strip()
        d = dt(r["Load Sheet Date"])
        if (r[base] or "").strip():
            a["B"].add(prod)
            if d and (a["bd"] is None or d > a["bd"]):
                a["bd"] = d
        if (r[cur] or "").strip():
            a["O"].add(prod)
            if d and (a["od"] is None or d < a["od"]):
                a["od"] = d
    out = []
    for (rep, cust), a in sorted(acct.items()):
        if not a["B"]:
            continue                         # new in October: not a follow-up account
        num_, name = split_customer(cust)
        out.append({
            "SALES_REP_ASSIGNED": rep, "CUSTOMER_NUM": int(num_) if num_.isdigit() else num_, "CUSTOMER_NAME": name,
            "BASE_DETAIL": f"{len(a['B'])} spirit{'s' if len(a['B']) != 1 else ''}: " + ", ".join(sorted(a["B"])[:4]) + (" ..." if len(a["B"]) > 4 else ""),
            "BASE_DATE": fmt(a["bd"]),
            "DONE": 1 if a["O"] else 0,
            "DONE_DETAIL": ", ".join(sorted(a["O"])[:4]) + (" ..." if len(a["O"]) > 4 else "") if a["O"] else "",
            "DONE_DATE": fmt(a["od"]) if a["O"] else "",
        })
    return out


def main():
    month_dir = HERE / "data" / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    conv, spirits = build_conversion(), build_spirits()
    (month_dir / "mpo_sam_adams_conversion.json").write_text(json.dumps(conv, indent=2))
    (month_dir / "mpo_spirits_followup.json").write_text(json.dumps(spirits, indent=2))
    synced = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (month_dir / "sync_meta.json").write_text(json.dumps({"synced_at": synced}, indent=2))
    for label, rows in (("Oktoberfest conversion", conv), ("Spirits follow-up", spirits)):
        by = defaultdict(lambda: [0, 0])
        for r in rows:
            by[r["SALES_REP_ASSIGNED"]][0] += 1
            by[r["SALES_REP_ASSIGNED"]][1] += r["DONE"]
        print(f"{label}: {sum(v[1] for v in by.values())} of {sum(v[0] for v in by.values())} accounts done; "
              f"{sum(1 for v in by.values() if v[1] >= v[0])} of {len(by)} reps complete")
    print(f"sync_meta.json timestamped {synced} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
    root = next(p for p in Path(__file__).resolve().parents if (p / "middleware.js").exists())
    subprocess.run([sys.executable, str(root / "tools" / "rep_slices.py")], check=True)
