#!/usr/bin/env python3
"""Builds October 2026's off-premise MPO datasets (October_2026_MPO.docx).

  30%  Constellation -- 75% Corona Innovation Distro        (built here)
  30%  BBC           -- 50% Buying Accounts Lytt            (built here)
  15%  Spirits       -- Molly's (2) New Placements           (built here)
  15%  Wine          -- (1) New Placements                   (built here)
  10%  POS           -- (5) Cooler Door Stickers, iSellBeer  (awaiting October's Promos_Report)

Inputs (this folder, overwrite to refresh):
  constellation_innovation_october.csv   RDE "Innovation SKUs Placements 10/1/2026 - 10/31/2026"
                                         (rep, customer, product, 1.00 per placement)
  constellation_innovation_goals.csv     each rep's Corona Innovation GOAL (RDE "Goals" column,
                                         9/1-11/30/2026). The objective is 75% of it. A rep with
                                         no row here is NOT scored. Edit this file when goals change.
  lytt_october.csv                       RDE "BBC Lytt October MPO" -- one row per rep / account / SKU
                                         (Buyer / Placement / Cases 10/1-10/31)
  sales_reps_customer_base_core.csv      each rep's CORE off-premise accounts = the Lytt denominator
                                         (Lytt can only be sold in the core territory)
  mollys_new_placements.csv              RDE two-window export (7/1-9/30 base, 10/1-10/31 current)
  wine_new_placements.csv                same shape

Run:  python3 generate_2026-10.py     (also rebuilds the per-rep copies)

--- Constellation ---
Progress = placements in the export's window (10/1-10/31) summed per rep; target
= ceil(75% x goal). The goal report's window is 9/1-11/30 while this export is
October only -- if Gavin wants September / November counted too, pull the export
for that window and rerun; nothing else changes.

--- Lytt: 50% buying accounts (pct_of_base) ---
Denominator = the rep's accounts in sales_reps_customer_base_core.csv, MINUS every
Whole Foods account (they cannot sell alcohol; Gavin, 2026-10-05). Scoped to Lytt:
Keystone / Fever Tree still read the shared core file as before. Numerator = the
accounts that bought any Lytt SKU in October (1+ SKU: "buying account"), counted
distinct, and ONLY accounts that are in that rep's own base -- a buyer outside the
core base (the build prints them) would otherwise inflate a rep past 50%. Target =
ceil(50% x base). Target Accounts = base accounts with no Lytt purchase in October.

--- Molly's / Wine: new placements ---
Same rule as September (generate_2026-09.py build_new_placements): NEW = the
current window is populated and the 90-day base window is not, per rep /
account / product, counted once per key (largest single load sheet).
"""
import csv, json, math, re, sys, importlib.util
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
MONTH_KEY = "2026-10"
NINE = importlib.util.spec_from_file_location("gen09", HERE / "generate_2026-09.py")
gen09 = importlib.util.module_from_spec(NINE)
NINE.loader.exec_module(gen09)

CONSTELLATION_CSV = HERE / "constellation_innovation_october.csv"
GOALS_CSV = HERE / "constellation_innovation_goals.csv"
MOLLYS_CSV = HERE / "mollys_new_placements.csv"
WINE_CSV = HERE / "wine_new_placements.csv"
GOAL_PCT = 0.75
BASE_START = datetime(2026, 7, 1)
CURRENT_START = datetime(2026, 10, 1)


def build_constellation():
    rows = gen09.load_csv(CONSTELLATION_CSV)
    col = gen09.find_col(rows[0].keys(), "Innovation SKUs Placements")
    gen09.check_window(col, CURRENT_START, "Constellation Innovation window")
    agg = {}
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        if not rep:
            continue
        product = re.sub(r"^\d+\s+", "", (r.get("Product Num Name") or "").strip())
        agg[(rep, product)] = agg.get((rep, product), 0.0) + gen09.to_num(r[col])
    out = [{"SALES_REP_ASSIGNED": rep, "PRODUCT_NAME": prod, "BASE_PLACEMENTS": 0, "CURRENT_PLACEMENTS": n}
           for (rep, prod), n in sorted(agg.items())]
    goals = []
    for r in gen09.load_csv(GOALS_CSV):
        goals.append({"SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
                      "GOAL": gen09.to_num(r["Corona Innovation Goal"])})
    return out, goals


LYTT_CSV = HERE / "lytt_october.csv"


def is_whole_foods(name):
    return "whole foods" in (name or "").lower()


def build_lytt():
    base = [r for r in gen09.build_customer_base_core() if not is_whole_foods(r["CUSTOMER_NAME"])]
    removed = [r for r in gen09.load_csv(gen09.CUSTOMER_BASE_CORE_CSV) if is_whole_foods(r["Customer Name"])]
    base_by_rep = defaultdict(set)
    for r in base:
        base_by_rep[r["SALES_REP_ASSIGNED"]].add(str(r["CUSTOMER_NUM"]))
    num, outside = [], []
    for r in gen09.load_csv(LYTT_CSV):
        rep = (r.get("Sales Rep Assigned") or "").strip()
        cust = (r.get("Customer Num") or "").strip()
        if not rep or not cust:
            continue
        row = {"SALES_REP_ASSIGNED": rep, "PRODUCT_NAME": (r.get("Product Name") or "").strip(),
               "BRAND_FAMILY": (r.get("Brand Family") or "").strip(),
               "CUSTOMER_NUM": int(cust) if cust.isdigit() else cust,
               "CUSTOMER_NAME": (r.get("Customer Name") or "").strip(),
               "DATE": (r.get("Date") or "").strip(),
               "CASES": gen09.to_num(next((r[c] for c in r if c.startswith("Cases")), ""))}
        (num if cust in base_by_rep.get(rep, ()) else outside).append(row)
    carrying = defaultdict(set)
    for r in num:
        carrying[r["SALES_REP_ASSIGNED"]].add(str(r["CUSTOMER_NUM"]))
    targets = [{"SALES_REP_ASSIGNED": r["SALES_REP_ASSIGNED"], "CUSTOMER_NUM": r["CUSTOMER_NUM"],
                "CUSTOMER_NAME": r["CUSTOMER_NAME"], "AREA": r["AREA"]}
               for r in base if str(r["CUSTOMER_NUM"]) not in carrying[r["SALES_REP_ASSIGNED"]]]
    num.sort(key=lambda r: (r["SALES_REP_ASSIGNED"], r["CUSTOMER_NAME"], r["PRODUCT_NAME"]))
    return base, num, targets, removed, outside


def main():
    month_dir = HERE / "data" / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    const_rows, goals = build_constellation()
    mollys, m_new, m_keys, m_total, _ = gen09.build_new_placements(
        MOLLYS_CSV, product_col="Product Num & Name", base_start=BASE_START, current_start=CURRENT_START)
    wine, w_new, w_keys, w_total, _ = gen09.build_new_placements(
        WINE_CSV, product_col="Product Num & Name", base_start=BASE_START, current_start=CURRENT_START)
    lbase, lnum, ltargets, lremoved, loutside = build_lytt()
    for name, data in (("mpo_sales_reps_customer_base_core.json", lbase),
                       ("mpo_bbc_lytt_numerator.json", lnum),
                       ("mpo_targets_bbc_lytt.json", ltargets),
                       ("mpo_constellation_innovation.json", const_rows),
                       ("mpo_constellation_innovation_goals.json", goals),
                       ("mpo_mollys.json", mollys),
                       ("mpo_wine_new_placements.json", wine)):
        (month_dir / name).write_text(json.dumps(data, indent=2))
    synced = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (month_dir / "sync_meta.json").write_text(json.dumps({"synced_at": synced}, indent=2))

    by_rep = {}
    for r in const_rows:
        by_rep[r["SALES_REP_ASSIGNED"]] = by_rep.get(r["SALES_REP_ASSIGNED"], 0) + r["CURRENT_PLACEMENTS"]
    scored = {g["SALES_REP_ASSIGNED"]: g["GOAL"] for g in goals if g["GOAL"] > 0}
    hit = sum(1 for rep, g in scored.items() if by_rep.get(rep, 0) >= max(1, math.ceil(g * GOAL_PCT)))
    unscored = sorted(r for r in by_rep if r not in scored)
    print(f"Constellation Innovation: {sum(by_rep.values()):.0f} placements, {len(scored)} reps with a goal, "
          f"{hit} at 75%; placements from reps with NO goal (not scored): {', '.join(unscored) or 'none'}")
    lb = defaultdict(int)
    for r in lbase:
        lb[r["SALES_REP_ASSIGNED"]] += 1
    lbuy = defaultdict(set)
    for r in lnum:
        lbuy[r["SALES_REP_ASSIGNED"]].add(r["CUSTOMER_NUM"])
    print(f"Lytt: {sum(len(v) for v in lbuy.values())} buying accounts in base ({len(lbase)} base accounts, "
          f"{len(lremoved)} Whole Foods removed: {', '.join(r['Customer Name'] for r in lremoved)}); "
          f"{sum(1 for rp, n in lb.items() if len(lbuy[rp]) >= max(1, -(-n * 50 // 100)))} reps at 50%")
    if loutside:
        print("  Lytt buyers NOT in the rep's core base (not counted): " +
              "; ".join(sorted({f"{r['SALES_REP_ASSIGNED']} / {r['CUSTOMER_NUM']} {r['CUSTOMER_NAME']}" for r in loutside})))
    print(f"Molly's: {m_new:.0f} new placements across {m_keys} keys (of {m_total} exported)")
    print(f"Wine: {w_new:.0f} new placements across {w_keys} keys (of {w_total} exported)")
    print(f"sync_meta.json timestamped {synced} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()

# Per-rep copies (tools/rep_slices.py): a signed-in rep's browser is served only
# their own rows, so the copies are rebuilt after every run.
if __name__ == "__main__":
    import subprocess as _sp
    _root = next(p for p in Path(__file__).resolve().parents if (p / "middleware.js").exists())
    _sp.run([sys.executable, str(_root / "tools" / "rep_slices.py")], check=True)
