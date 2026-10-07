#!/usr/bin/env python3
"""Builds October 2026's off-premise MPO datasets (October_2026_MPO.docx).

  30%  Constellation -- 75% Corona Innovation Distro        (built here)
  30%  BBC           -- 50% Buying Accounts Lytt            (built here)
  15%  Spirits       -- Molly's (2) New Placements           (built here)
  15%  Wine          -- (1) New Placements                   (built here)
  10%  POS           -- (5) Cooler Door Stickers, iSellBeer  (awaiting October's Promos_Report)

Inputs (this folder, overwrite to refresh):
  constellation_innovation_fall.csv      RDE "Constellation Innovation Fall 2026 OFF w Goals":
                                         placements by product 9/1-11/30/2026 plus the rep's GOAL
                                         (100%) on each rep's subtotal row. The objective is 75% of
                                         that goal. A rep with no goal is NOT scored.
  lytt_october.csv                       RDE "LYTT OCTOBER 2026 MPO OFF" -- one row per rep / account / SKU /
                                         load sheet, Placement Count + Cases 8/1-10/31/2026 (Gavin,
                                         2026-10-07: August and September distribution counts)
  ../../territory-accounts/customers_active.csv
                                         Encompass "Customers" export (active accounts): the Lytt
                                         denominator = OFF-PREMISE accounts in the CORE MARKET, Whole
                                         Foods removed (see build_core_off_base). 2026 cases for target
                                         ordering still come from sales_reps_customer_base_core.csv.
  mollys_new_placements.csv              RDE two-window export (7/1-9/30 base, 10/1-10/31 current)
  wine_new_placements.csv                same shape

Run:  python3 generate_2026-10.py     (also rebuilds the per-rep copies)

--- Constellation ---
Progress = the rep's placements from 9/1/2026 (the export's window is 9/1-11/30); the Goals
column is the rep's 100% goal; the MPO = 75% of it, ROUNDED to the nearest whole number (halves
up), reached BY OCT 31 (Gavin, 2026-10-07). Freeze the result after Oct 31 -- a later export
would add November placements.

--- Lytt: 50% buying accounts (pct_of_base) ---
Denominator = the rep's accounts in sales_reps_customer_base_core.csv, MINUS every
Whole Foods account (they cannot sell alcohol; Gavin, 2026-10-05). Scoped to Lytt:
Keystone / Fever Tree still read the shared core file as before. WINDOW (Gavin,
2026-10-07): distribution done Aug 1 - Oct 31, 2026 counts (the export's own window).
An account QUALIFIES with 3+ DISTINCT Lytt SKUs over that window (programs.js minSkus 3),
counted once, and ONLY in that rep's own base -- a buyer outside the core base (the build
prints them) would otherwise inflate a rep past 50%. A SKU whose cases net to 0 or less
over the window (bought, then fully returned) does not count (the build prints them).
Target = ceil(50% x base). Target Accounts = base accounts with no Lytt purchase.

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

CONSTELLATION_CSV = HERE / "constellation_innovation_fall.csv"
MOLLYS_CSV = HERE / "mollys_new_placements.csv"
WINE_CSV = HERE / "wine_new_placements.csv"
GOAL_PCT = 0.75
BASE_START = datetime(2026, 7, 1)
CURRENT_START = datetime(2026, 10, 1)
FALL_START = datetime(2026, 9, 1)     # Constellation Innovation runs the whole fall: 9/1 - 11/30


def build_constellation():
    """RDE "Constellation Innovation Fall 2026 OFF w Goals": one block per rep, first
    row = the rep's SUBTOTAL (it reuses the first product's name, carries the rep's
    9/1-11/30 placements AND the goal), then one row per product. Progress = the
    placements column over the same window; goal = the "Goals" column (100% of the
    goal; the objective is 75% of it). The subtotal row is dropped only when it equals
    the sum of the rest, so nothing real is thrown away if RDE changes the layout."""
    rows = gen09.load_csv(CONSTELLATION_CSV)
    k = list(rows[0].keys())
    goal_col = next(c for c in k if "Goals" in c and "% of" not in c)
    pct_col = next(c for c in k if "% of" in c)
    act_col = next(c for c in k if c.startswith("Innovation SKUs Placements"))
    gen09.check_window(act_col, FALL_START, "Constellation Innovation window")
    blocks, order = defaultdict(list), []
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        if not rep:
            continue
        if rep not in blocks:
            order.append(rep)
        blocks[rep].append(r)
    out, goals, warned = [], [], []
    for rep in order:
        blk = blocks[rep]
        head, rest = blk[0], blk[1:]
        goal = gen09.to_num(head[goal_col])
        if rest and abs(gen09.to_num(head[act_col]) - sum(gen09.to_num(r[act_col]) for r in rest)) < 0.01:
            product_rows = rest
        else:
            product_rows = blk
            warned.append(rep)
        agg = defaultdict(float)
        for r in product_rows:
            agg[(r.get("Product Name") or "").strip()] += gen09.to_num(r[act_col])
        out += [{"SALES_REP_ASSIGNED": rep, "PRODUCT_NAME": prod, "BASE_PLACEMENTS": 0, "CURRENT_PLACEMENTS": n}
                for prod, n in sorted(agg.items(), key=lambda kv: (-kv[1], kv[0]))]
        goals.append({"SALES_REP_ASSIGNED": rep, "GOAL": goal})
    if warned:
        print(f"  Constellation: no subtotal row detected for {', '.join(warned)} -- all rows kept; check the export")
    return out, goals


LYTT_CSV = HERE / "lytt_october.csv"
LYTT_START = datetime(2026, 8, 1)     # Lytt counts distribution from Aug 1 (Gavin, 2026-10-07)


def is_whole_foods(name):
    return "whole foods" in (name or "").lower()


# THE CUSTOMER BASE (Gavin, 2026-10-07): Encompass' "Customers" export of active accounts
# (territory-accounts/customers_active.csv). Base = OFF-PREMISE accounts in the CORE MARKET:
# Distribution Area Bergen, Passaic, Passaic-FF, Morris 1, Morris 3, Sussex (Morris 2 is neither core nor
# southern). An area of "Sales" is placed by its County: Bergen / Passaic / Sussex = core; Essex / Hudson /
# Union = Southern District; anything else (Warren ...) is out. Whole Foods is never in the base.
CUSTOMERS_CSV = HERE.parent.parent / "territory-accounts" / "customers_active.csv"
CORE_AREAS = {"Bergen", "Passaic", "Passaic-FF", "Morris 1", "Morris 3", "Sussex"}
CORE_SALES_COUNTIES = {"Bergen", "Passaic", "Sussex"}


def build_core_off_base():
    old_cases = {}
    for r in gen09.load_csv(gen09.CUSTOMER_BASE_CORE_CSV):   # 2026 cases, for ordering target lists only
        old_cases[(r.get("Customer Num") or "").strip()] = gen09.to_num(next((r[c] for c in r if c.startswith("Cases")), ""))
    base, removed = [], []
    for r in gen09.load_csv(CUSTOMERS_CSV):
        if (r.get("On Premise") or "").strip() != "Off Premise":
            continue
        area, county = (r.get("Distribution Area") or "").strip(), (r.get("County") or "").strip()
        if not (area in CORE_AREAS or (area == "Sales" and county in CORE_SALES_COUNTIES)):
            continue
        num = (r.get("Customer ID") or "").strip()
        row = {"SALES_REP_ASSIGNED": (r.get("Sales Rep Name") or "").strip(),
               "CUSTOMER_NUM": int(num) if num.isdigit() else num,
               "CUSTOMER_NAME": (r.get("Customer Name") or "").strip(),
               "SHIPPING_ADDRESS": (r.get("Shipping Address") or "").strip(),
               "CITY": (r.get("City") or "").strip(),
               "AREA": county if area == "Sales" else area,
               "COUNTY": county, "CASES": old_cases.get(num, 0.0)}
        if not row["SALES_REP_ASSIGNED"]:
            continue
        (removed if is_whole_foods(row["CUSTOMER_NAME"]) else base).append(row)
    base.sort(key=lambda x: (x["SALES_REP_ASSIGNED"], x["CUSTOMER_NAME"]))
    return base, removed


def build_lytt():
    base, removed = build_core_off_base()
    base_by_rep = defaultdict(set)
    for r in base:
        base_by_rep[r["SALES_REP_ASSIGNED"]].add(str(r["CUSTOMER_NUM"]))
    raw = gen09.load_csv(LYTT_CSV)
    cases_col = next(c for c in raw[0] if c.startswith("Cases"))
    gen09.check_window(cases_col, LYTT_START, "Lytt window")
    net = defaultdict(float)
    for r in raw:
        net[((r.get("Sales Rep Assigned") or "").strip(), (r.get("Customer Num") or "").strip(),
             (r.get("Product Name") or "").strip())] += gen09.to_num(r.get(cases_col))
    returned = sorted(k for k, v in net.items() if v <= 0)
    num, outside = [], []
    for r in raw:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        cust = (r.get("Customer Num") or "").strip()
        if not rep or not cust or net[(rep, cust, (r.get("Product Name") or "").strip())] <= 0:
            continue
        row = {"SALES_REP_ASSIGNED": rep, "PRODUCT_NAME": (r.get("Product Name") or "").strip(),
               "BRAND_FAMILY": (r.get("Brand Family") or "").strip(),
               "CUSTOMER_NUM": int(cust) if cust.isdigit() else cust,
               "CUSTOMER_NAME": (r.get("Customer Name") or "").strip(),
               "DATE": (r.get("Date") or "").strip(),
               "CASES": gen09.to_num(r.get(cases_col))}
        (num if cust in base_by_rep.get(rep, ()) else outside).append(row)
    carrying = defaultdict(set)
    for r in num:
        carrying[r["SALES_REP_ASSIGNED"]].add(str(r["CUSTOMER_NUM"]))
    targets = [{"SALES_REP_ASSIGNED": r["SALES_REP_ASSIGNED"], "CUSTOMER_NUM": r["CUSTOMER_NUM"],
                "CUSTOMER_NAME": r["CUSTOMER_NAME"], "AREA": r["AREA"]}
               for r in base if str(r["CUSTOMER_NUM"]) not in carrying[r["SALES_REP_ASSIGNED"]]]
    num.sort(key=lambda r: (r["SALES_REP_ASSIGNED"], r["CUSTOMER_NAME"], r["PRODUCT_NAME"]))
    return base, num, targets, removed, outside, returned


def build_cooler_doors():
    """POS (5) Cooler Door Stickers: the cumulative iSellBeer archive
    (pos_cooler_door_promos.xlsx, shared with September) cut to October-dated
    cooler-door promos. Scored per DISTINCT PHOTO by the 'photos' builder."""
    rows, photos, mentions, elements = gen09.build_pos_cooler_doors()
    oct_rows = [r for r in rows if re.match(r"^10/\d{1,2}/2026", str(r.get("DATE") or ""))]
    return oct_rows


def main():
    # Partial weekly iSellBeer pull: merge onto the archive first (README / repo CLAUDE.md),
    # then rebuild. Usage: python3 generate_2026-10.py --merge-cooler-doors Promos_Report_NN.xlsx
    if len(sys.argv) == 3 and sys.argv[1] == "--merge-cooler-doors":
        gen09._lytt_pos().merge_export(gen09.COOLER_DOOR_XLSX, Path(sys.argv[2]),
                                       date_col="Date/Time", volatile_cols=("Promo #",),
                                       row_filter=gen09.is_cooler_door)
    month_dir = HERE / "data" / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    cooler = build_cooler_doors()
    const_rows, goals = build_constellation()
    mollys, m_new, m_keys, m_total, _ = gen09.build_new_placements(
        MOLLYS_CSV, product_col="Product Num & Name", base_start=BASE_START, current_start=CURRENT_START)
    wine, w_new, w_keys, w_total, _ = gen09.build_new_placements(
        WINE_CSV, product_col="Product Num & Name", base_start=BASE_START, current_start=CURRENT_START)
    lbase, lnum, ltargets, lremoved, loutside, lreturned = build_lytt()
    for name, data in (("mpo_sales_reps_customer_base_core.json", lbase),
                       ("mpo_bbc_lytt_numerator.json", lnum),
                       ("mpo_targets_bbc_lytt.json", ltargets),
                       ("mpo_constellation_innovation.json", const_rows),
                       ("mpo_constellation_innovation_goals.json", goals),
                       ("mpo_mollys.json", mollys),
                       ("mpo_wine_new_placements.json", wine),
                       ("mpo_pos_cooler_doors.json", cooler)):
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
    skus = defaultdict(set)
    for r in lnum:
        skus[(r["SALES_REP_ASSIGNED"], r["CUSTOMER_NUM"])].add(r["PRODUCT_NAME"])
    lbuy, lqual = defaultdict(set), defaultdict(set)
    for (rp, c), v in skus.items():
        lbuy[rp].add(c)
        if len(v) >= 3:
            lqual[rp].add(c)
    print(f"Lytt (Aug 1-Oct 31): {sum(len(v) for v in lbuy.values())} buying accounts in base, "
          f"{sum(len(v) for v in lqual.values())} with 3+ SKUs ({len(lbase)} base accounts, "
          f"{len(lremoved)} Whole Foods removed: {', '.join(r['CUSTOMER_NAME'] for r in lremoved)}); "
          f"{sum(1 for rp, n in lb.items() if len(lqual[rp]) >= max(1, -(-n * 50 // 100)))} reps at 50%")
    if lreturned:
        print("  Lytt SKUs bought then fully returned (net cases <= 0, not counted): " +
              "; ".join(f"{r} / {c} {p}" for r, c, p in lreturned))
    if loutside:
        print("  Lytt buyers NOT in the rep's core base (not counted): " +
              "; ".join(sorted({f"{r['SALES_REP_ASSIGNED']} / {r['CUSTOMER_NUM']} {r['CUSTOMER_NAME']}" for r in loutside})))
    print(f"Molly's: {m_new:.0f} new placements across {m_keys} keys (of {m_total} exported)")
    print(f"Wine: {w_new:.0f} new placements across {w_keys} keys (of {w_total} exported)")
    cp = defaultdict(set)
    for r in cooler:
        if r.get("PHOTO_URL"): cp[r["REP"]].add(r["PHOTO_URL"])
    print(f"POS cooler doors (October): {sum(len(v) for v in cp.values())} distinct stickers, "
          f"{sum(1 for v in cp.values() if len(v) >= 5)} rep(s) at 5 | " + ", ".join(f"{k} {len(v)}" for k, v in sorted(cp.items(), key=lambda kv: -len(kv[1]))))
    print(f"sync_meta.json timestamped {synced} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()

# Per-rep copies (tools/rep_slices.py): a signed-in rep's browser is served only
# their own rows, so the copies are rebuilt after every run.
if __name__ == "__main__":
    import subprocess as _sp
    _root = next(p for p in Path(__file__).resolve().parents if (p / "middleware.js").exists())
    _sp.run([sys.executable, str(_root / "tools" / "rep_slices.py")], check=True)

# Program eligibility (tools/program_eligibility.py, 2026-10-05): the one account-level
# calculation behind the hub's Eligible Accounts / Qualifying Products / Credited Results
# and the Account page's Program Opportunities -- rebuilt from the same inputs.
if __name__ == "__main__":
    import subprocess as _sp2, sys as _sys2
    from pathlib import Path as _P2
    _root2 = next(p for p in _P2(__file__).resolve().parents if (p / "middleware.js").exists())
    _sp2.run([_sys2.executable, str(_root2 / "tools" / "program_eligibility.py")], check=True)
