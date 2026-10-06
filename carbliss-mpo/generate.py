#!/usr/bin/env python3
"""Carbliss MPO tracker data (2026-10-06).

Builds carbliss-mpo/data/program.json from two files that already live in the repo:

  carbliss-onprem-targets/carbliss_buyers_l90.csv
      RDE "Carbliss Buyers (ON) L90 vs Start": one row per ON-PREMISE load sheet
      that carried Carbliss, with the Buyers 2026 flag (year to date). This is the
      only day-level Carbliss source; its dates are the load-sheet dates.
  MPOs/on-prem/core_market_on_prem_accts.csv
      RDE "Entire Core Market On Prem Accts": the rep's assigned on-premise
      accounts. This is the DENOMINATOR (the same base the October on-premise MPO
      uses for its Carbliss objective).

Rules (README.txt has the evidence behind each one):
  * PROGRAM PERIOD is fixed: Aug 1 - Oct 31, 2026, inclusive. It is not a
    rolling window. A load sheet dated outside it never changes the result.
  * SINCE LAUNCH = any qualifying load sheet from the launch date (the first
    Carbliss load sheet on file) through the latest load sheet in the export.
  * A QUALIFYING PURCHASE = a load-sheet row of the export with Buyers 2026 > 0
    (Carbliss brand family, every flavor, on-premise). Counted by CustomerID.
    An account counts once however many SKUs, loads or reorders it has.
  * HOUSE TOTAL = distinct CustomerIDs with a qualifying load sheet in the
    program period, whoever their rep is.
  * REP PENETRATION = distinct assigned accounts that bought in the period /
    that rep's accounts in the core on-premise base. The house "reps" (Default,
    Office Tell Sell) are not people and carry no base.
  * An account follows its CURRENT rep (the base file's assignment): history is
    re-attributed, exactly like the rolling-distribution page.

FREEZE: `--finalize` (once the export runs through Oct 31) writes
data/final.json = the program-period result (accounts in the base, who bought,
the rep and house numbers). From then on every run reads the program-period
fields from it, so later purchases, transfers or new accounts cannot change
the completed result; Bought Since Launch and Last Carbliss Purchase keep
updating. `--reopen` ignores the freeze (a correction, on purpose).

  python3 carbliss-mpo/generate.py                # rebuild
  python3 carbliss-mpo/generate.py --finalize     # lock the program period (needs data through Oct 31)
"""
import argparse
import csv
import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
EXPORT = ROOT / "carbliss-onprem-targets" / "carbliss_buyers_l90.csv"
BASE = ROOT / "MPOs" / "on-prem" / "core_market_on_prem_accts.csv"
MASTER = ROOT / "rolling-distribution" / "data" / "master"

PERIOD_START = date(2026, 8, 1)
PERIOD_END = date(2026, 10, 31)
# The export's flag is "Buyers 2026" (year to date), so it reports every 2026
# load sheet. If a future export is cut shorter, move this date and the
# non-buyers' Since Launch turns "unknown" instead of a false "No".
COVERAGE_START = date(2026, 1, 1)
HOUSE = {"Default", "Office Tell Sell"}


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


def parse_day(s):
    s = (s or "").strip()
    for f in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, f).date()
        except ValueError:
            pass
    return None


def load(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [{norm(k): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def split_customer(label):
    m = re.match(r"^(\d+)\s+(.*)$", label.strip())
    return (m.group(1), m.group(2)) if m else ("", label.strip())


def pct(n, d):
    return round(100.0 * n / d, 1) if d else None


def master_check():
    """Corroborate the launch date from the monthly rolling master (any premise)."""
    prods = MASTER / "products.csv"
    if not prods.exists():
        return None
    carb = {r[0] for r in csv.reader(open(prods, encoding="utf-8")) if "carbliss" in " ".join(r).lower()}
    first = None
    for f in sorted((MASTER / "months").glob("*.csv")):
        for r in csv.DictReader(open(f, encoding="utf-8")):
            if r["product_num"] in carb and float(r["cases"] or 0) != 0:
                first = f.stem
                break
        if first:
            return first
    return None


def account_pages():
    """rep name -> set of customer numbers on that rep's Account page book
    (accounts/data/reps/<key>.json). An account in the base export but not in the
    book (a newer account) has no Account page yet; the tracker lists it unlinked
    instead of sending the rep to a not-found screen."""
    ix = ROOT / "accounts" / "data" / "index.json"
    out = {}
    if not ix.exists():
        return out
    for r in json.loads(ix.read_text()).get("reps", []):
        f = ROOT / "accounts" / "data" / "reps" / f"{r['key']}.json"
        if f.exists():
            out[r["rep"]] = {str(a["n"]) for a in json.loads(f.read_text()).get("accounts", [])}
    return out


def compute(data_dir, reopen=False):
    rows = load(EXPORT)
    flag = next(c for c in rows[0] if c.lower() == "buyers 2026")
    buys = defaultdict(list)            # customer num -> [dates]
    l90col = next((c for c in rows[0] if c.lower() == "buyers l90 2026"), None)
    l90set = set()                      # accounts with a load sheet the RDE flags as rolling-90
    export_rep = {}
    for r in rows:
        num, _ = split_customer(r["Customer Num & Company"])
        d = parse_day(r["Load Sheet Date"])
        try:
            qualifies = float(r[flag] or 0) > 0
        except ValueError:
            qualifies = False
        if not num or not d or not qualifies:
            continue
        buys[num].append(d)
        export_rep.setdefault(num, r["Sales Rep Assigned"])
        try:
            if l90col and float(r[l90col] or 0) > 0:
                l90set.add(num)
        except ValueError:
            pass
    all_dates = [d for v in buys.values() for d in v]
    launch, through = min(all_dates), max(all_dates)

    base = {}
    for r in load(BASE):
        rep = r["Sales Rep Assigned"]
        if not rep or rep in HOUSE:
            continue
        base.setdefault(r["Customer Num"], r)

    final_path = data_dir / "final.json"
    frozen = None
    if final_path.exists() and not reopen:
        frozen = json.loads(final_path.read_text())

    def in_period(d):
        return PERIOD_START <= d <= PERIOD_END

    def since_state(num):
        if buys.get(num):
            return "yes"
        return "no" if COVERAGE_START <= launch else "unknown"

    accounts = []
    if frozen:
        roster = [(n, v) for n, v in frozen["accounts"].items()]
        for n, v in sorted(roster, key=lambda kv: (kv[1]["rep"], kv[1]["name"])):
            live = base.get(n)
            ds = buys.get(n, [])
            accounts.append({"n": int(n), "name": v["name"], "town": v["town"], "rep": v["rep"],
                             "prog": v["prog"], "l90": 1 if n in l90set else 0, "since": since_state(n),
                             "last": max(ds).isoformat() if ds else ""})
        house_buyers = frozen["house"]["buyers"]
    else:
        for n, r in sorted(base.items(), key=lambda kv: (kv[1]["Sales Rep Assigned"], kv[1]["Customer Name"].lower())):
            ds = buys.get(n, [])
            accounts.append({"n": int(n) if n.isdigit() else n, "name": r["Customer Name"], "town": r["City"],
                             "rep": r["Sales Rep Assigned"], "prog": 1 if any(in_period(d) for d in ds) else 0,
                             "l90": 1 if n in l90set else 0, "since": since_state(n), "last": max(ds).isoformat() if ds else ""})
        house_buyers = sum(1 for ds in buys.values() if any(in_period(d) for d in ds))

    pages = account_pages()
    for a in accounts:
        a["page"] = 1 if str(a["n"]) in pages.get(a["rep"], set()) else 0

    by = defaultdict(lambda: [0, 0])
    for a in accounts:
        by[a["rep"]][0] += 1
        by[a["rep"]][1] += a["prog"]
    reps = [{"rep": k, "base": v[0], "bought": v[1], "pct": pct(v[1], v[0])} for k, v in sorted(by.items())]
    # Rolling-90 / since-launch counts per rep: aggregate numbers only (no account names), so every rep's
    # copy carries the whole board for the leaderboard page.
    bd = defaultdict(lambda: [0, 0, 0])
    for a in accounts:
        bd[a["rep"]][0] += 1
        bd[a["rep"]][1] += a["l90"]
        bd[a["rep"]][2] += 1 if a["since"] == "yes" else 0
    board = [{"rep": k, "base": v[0], "l90": v[1], "ytd": v[2]} for k, v in sorted(bd.items())]
    in_base_buyers = sum(a["prog"] for a in accounts)

    # reconciliation, printed -- never silently dropped
    prog_nums = {n for n, ds in buys.items() if any(in_period(d) for d in ds)}
    outside = sorted(n for n in prog_nums if n not in base)
    moved = sorted((n, export_rep[n], base[n]["Sales Rep Assigned"]) for n in buys if n in base and export_rep[n] != base[n]["Sales Rep Assigned"])

    meta = {
        "program": "Carbliss",
        "channel": "On-Premise",
        "period": {"start": PERIOD_START.isoformat(), "end": PERIOD_END.isoformat(),
                   "label": "Program Period: Aug 1–Oct 31, 2026"},
        "launch": launch.isoformat(),
        "coverage_start": COVERAGE_START.isoformat(),
        "sales_through": through.isoformat(),
        "frozen": bool(frozen),
        "frozen_at": frozen["frozen_at"] if frozen else None,
        "frozen_sales_through": frozen["sales_through"] if frozen else None,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "RDE Carbliss Buyers (ON) load sheets + Entire Core Market On Prem Accts",
    }
    house = {"buyers": house_buyers, "in_rep_bases": in_base_buyers,
             "reps": len(reps), "base": sum(r["base"] for r in reps)}
    return {"meta": meta, "house": house, "reps": reps, "board": board, "accounts": accounts}, {
        "launch": launch, "through": through, "outside": outside, "moved": moved,
        "buyers": len(prog_nums), "rows": len(rows), "customers": len(buys)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--finalize", action="store_true", help="lock the program-period result into data/final.json")
    ap.add_argument("--force", action="store_true", help="with --finalize: allow it before the export reaches the period end")
    ap.add_argument("--reopen", action="store_true", help="ignore data/final.json (a deliberate correction)")
    ap.add_argument("--data-dir", default=str(HERE / "data"))
    ap.add_argument("--no-slices", action="store_true", help="skip tools/rep_slices.py (tests)")
    a = ap.parse_args()
    data_dir = Path(a.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    if a.finalize:
        live, info = compute(data_dir, reopen=True)
        if info["through"] < PERIOD_END and not a.force:
            sys.exit(f"Export runs through {info['through']}, before the period ends ({PERIOD_END}). "
                     "Load the final export first (or --force to freeze early).")
        snap = {"frozen_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sales_through": live["meta"]["sales_through"], "house": {"buyers": live["house"]["buyers"]},
                "accounts": {str(x["n"]): {"rep": x["rep"], "name": x["name"], "town": x["town"], "prog": x["prog"]}
                             for x in live["accounts"]}}
        (data_dir / "final.json").write_text(json.dumps(snap, indent=1))
        print(f"Froze the program period: {live['house']['buyers']} house buyers, "
              f"{len(snap['accounts'])} accounts in the base, sales through {snap['sales_through']}.")

    out, info = compute(data_dir, reopen=a.reopen)
    (data_dir / "program.json").write_text(json.dumps(out, separators=(",", ":")))

    m = out["meta"]
    print(f"{m['period']['label']}  |  launch {m['launch']}  |  sales through {m['sales_through']}"
          f"  |  {'FROZEN ' + m['frozen_at'] if m['frozen'] else 'live'}")
    print(f"export: {info['rows']} qualifying load sheets, {info['customers']} distinct accounts since launch")
    print(f"HOUSE: {out['house']['buyers']} accounts bought in the period; "
          f"{out['house']['in_rep_bases']} are in a rep's base; base {out['house']['base']} accounts / {len(out['reps'])} reps")
    for r in out["reps"]:
        print(f"  {r['rep']:<18} {r['bought']:>3} of {r['base']:<4} {r['pct']}%")
    if info["outside"]:
        print("  period buyers NOT in any rep's base (counted in the house total only): " + ", ".join(info["outside"]))
    if info["moved"]:
        print("  export rep differs from the base's rep (the base wins): " + "; ".join(f"{n}: {x} -> {y}" for n, x, y in info["moved"]))
    nopage = [a for a in out["accounts"] if not a["page"]]
    if nopage:
        print(f"  {len(nopage)} accounts have no Account page yet (newer than accounts/data books; listed without a link): "
              + ", ".join(f"{a['n']}" for a in nopage))
    first = master_check()
    print(f"launch check: first month with Carbliss sales in the rolling master = {first}; "
          f"first load sheet in the export = {info['launch']}")

    if not a.no_slices and data_dir == HERE / "data":
        subprocess.run([sys.executable, str(ROOT / "tools" / "rep_slices.py")], check=True)


if __name__ == "__main__":
    main()
