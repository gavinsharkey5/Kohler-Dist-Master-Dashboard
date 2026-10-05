#!/usr/bin/env python3
"""Builds October 2026's off-premise MPO datasets (October_2026_MPO.docx).

  30%  Constellation -- 75% Corona Innovation Distro        (built here)
  30%  BBC           -- 50% Buying Accounts Lytt            (structure only: no data yet)
  15%  Spirits       -- Molly's (2) New Placements           (built here)
  15%  Wine          -- (1) New Placements                   (built here)
  10%  POS           -- (5) Cooler Door Stickers, iSellBeer  (awaiting October's Promos_Report)

Inputs (this folder, overwrite to refresh):
  constellation_innovation_october.csv   RDE "Innovation SKUs Placements 10/1/2026 - 10/31/2026"
                                         (rep, customer, product, 1.00 per placement)
  constellation_innovation_goals.csv     each rep's Corona Innovation GOAL (RDE "Goals" column,
                                         9/1-11/30/2026). The objective is 75% of it. A rep with
                                         no row here is NOT scored. Edit this file when goals change.
  mollys_new_placements.csv              RDE two-window export (7/1-9/30 base, 10/1-10/31 current)
  wine_new_placements.csv                same shape

Run:  python3 generate_2026-10.py     (also rebuilds the per-rep copies)

--- Constellation ---
Progress = placements in the export's window (10/1-10/31) summed per rep; target
= ceil(75% x goal). The goal report's window is 9/1-11/30 while this export is
October only -- if Gavin wants September / November counted too, pull the export
for that window and rerun; nothing else changes.

--- Molly's / Wine: new placements ---
Same rule as September (generate_2026-09.py build_new_placements): NEW = the
current window is populated and the 90-day base window is not, per rep /
account / product, counted once per key (largest single load sheet).
"""
import csv, json, math, re, sys, importlib.util
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


def main():
    month_dir = HERE / "data" / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    const_rows, goals = build_constellation()
    mollys, m_new, m_keys, m_total, _ = gen09.build_new_placements(
        MOLLYS_CSV, product_col="Product Num & Name", base_start=BASE_START, current_start=CURRENT_START)
    wine, w_new, w_keys, w_total, _ = gen09.build_new_placements(
        WINE_CSV, product_col="Product Num & Name", base_start=BASE_START, current_start=CURRENT_START)
    for name, data in (("mpo_constellation_innovation.json", const_rows),
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
