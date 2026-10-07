#!/usr/bin/env python3
"""Builds October 2026's on-premise MPO datasets (OCTOBER_ON_PREM_2026_MPO.docx).

  25%  Carbliss  -- 40% Buying Accounts              (copied from the Carbliss Leaderboard's program)
  25%  BBC       -- Complete Oktoberfest Draft Conversion   (built here)
  25%  Spirits   -- Follow up on all On-Premise Spirits placements   (built here)
  25%  iSellBeer -- (5) Feature Photos               (awaiting: no October export yet)

Inputs (this folder, overwrite to refresh):
  core_market_on_prem_accts.csv              RDE "Entire Core Market On Prem Accts" -- every on-premise
                                             account in the Core Market, per rep: the Carbliss DENOMINATOR.
  ../../carbliss-mpo/data/program.json       The Carbliss Leaderboard's program (carbliss-mpo/generate.py):
                                             who bought Carbliss Aug 1 - Oct 31, per base account. Run that
                                             generator first -- it runs this one at its end.
  sam_adams_kegs_summer_to_octoberfest.csv   RDE "Sam Adams Kegs: Summer Ale to Octoberfest" --
                                             one row per rep / account / keg SKU / load-sheet date.
  spirits_followup_placements.csv            RDE two-window export (7/1-9/30 placements, 10/1-10/31).

Run:  python3 generate_2026-10.py     (also rebuilds the per-rep copies)

Both objectives are FOLLOW-UP scores: a rep has a list of accounts (the base)
and each one is either done or not yet.

--- Carbliss: 40% buying accounts ---
The SAME program as the Carbliss Leaderboard (Gavin, 2026-10-07): base = the rep's accounts in
core_market_on_prem_accts.csv (house reps dropped); DONE = the account bought Carbliss on a load
sheet Aug 1 - Oct 31, 2026 (the leaderboard's "L90"), read from carbliss-mpo/data/program.json --
so the freeze (--finalize) applies here too. Distinct accounts, so repeat orders count once.
Target = ceil(40% x base) (the October docx). Was Sep 1 - Oct 31 from carbliss_buying_accounts.csv
until 2026-10-07; that file is no longer read.

--- BBC Oktoberfest conversion ---
BASE = ON-PREMISE accounts (the export's Premise column) with NET Summer Ale keg units > 0
loaded 4/1/2026 - 7/17/2026; DONE = the same account has NET Octoberfest keg units > 0 loaded
8/1/2026 - 10/23/2026 (Gavin's windows; confirmed 2026-10-07 after a day on 4/1 - 8/31).
Net = add up the units: a keg bought and returned is nothing, and the export's 0-unit rows
(Buyer Count 1, units 0) count for nothing -- never read the Buyer Count column.
Off-premise keg buyers (liquor stores) are out (Gavin, 2026-10-07: Dave Ehlers, Phil Ernst and
Shane Barreca are left out of this objective), EXCEPT ON_PREM_EXTRA -- Milton Inn, White Deer
Inn, The George Inn: filed Off Premise in Encompass but bars, kept in (Gavin, 2026-10-07).
House "reps" (Default, Office Tell Sell) are not people and are dropped. "Complete" = every
base account (target 100%). Boston Beer's scoreboard no longer overrides this objective
(apply_boston_beer removed 2026-10-07); it still scores the October INCENTIVE.

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
BASE_WINDOW = (datetime(2026, 4, 1), datetime(2026, 7, 17))     # Summer Ale poured (Gavin's window)
# Filed Off Premise in Encompass but bars that pour kegs; Boston Beer counts them on-premise.
ON_PREM_EXTRA = {"191210", "230121", "231203"}   # Milton Inn, White Deer Inn, The George Inn
DONE_WINDOW = (datetime(2026, 8, 1), datetime(2026, 10, 23))    # Oktoberfest taken


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


def on_premise(r, cnum, _book={}):
    """The export's Premise column; the active Customers export when the column is missing."""
    if cnum in ON_PREM_EXTRA:
        return True
    p = (r.get("Premise") or "").strip().lower()
    if not p:
        if not _book:
            sys.path.insert(0, str(HERE.parent.parent / "tools"))
            import customer_base
            _book.update({a["num"]: a["premise"] for a in customer_base.load()})
        p = (_book.get(cnum) or "").lower()
    return p.startswith("on")


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
        cnum = split_customer(r["Customer Num & Company"])[0]
        if not on_premise(r, cnum):
            continue
        units = sum(num(r[c]) for c in ucols)
        side = "S" if "summer" in r["Brand"].lower() else "O"
        d = dt(r["Date"])
        lo, hi = BASE_WINDOW if side == "S" else DONE_WINDOW
        if not d or not (lo <= d <= hi):
            continue                # outside that side's window: counts for nothing
        a = acct[(rep, r["Customer Num & Company"].strip())]
        a[side][short_keg(r["Product Num & Name"])] += units
        key = "sd" if side == "S" else "od"
        if units > 0 and (a[key] is None or (side == "S" and d > a[key]) or (side == "O" and d < a[key])):
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


CORE_ON_CSV = HERE / "core_market_on_prem_accts.csv"
# The Carbliss objective IS the Carbliss Leaderboard's program (Gavin, 2026-10-07): same base, same
# Aug 1 - Oct 31 window, same export, same freeze. carbliss-mpo/generate.py decides who bought; this
# step only copies its per-account result, so the MPO card, the hub and the leaderboard can't disagree.
CARBLISS_PROGRAM = HERE.parent.parent / "carbliss-mpo" / "data" / "program.json"
CARBLISS_EXPORT = HERE.parent.parent / "carbliss-onprem-targets" / "carbliss_buyers_l90.csv"


def build_carbliss():
    prog = json.loads(CARBLISS_PROGRAM.read_text())
    per = prog["meta"]["period"]
    start, end = datetime.strptime(per["start"], "%Y-%m-%d"), datetime.strptime(per["end"], "%Y-%m-%d")
    # latest in-period load sheet per account (DONE_DATE only; the DONE flag is the leaderboard's own)
    rows = load(CARBLISS_EXPORT)
    flag = next(c for c in rows[0] if " ".join(c.lower().replace(":", " ").split()) in ("buyers ytd 2026", "buyers 2026"))
    last = {}
    for r in rows:
        num_, _ = split_customer(r["Customer Num & Company"])
        d = dt(r["Load Sheet Date"])
        if num_ and d and start <= d <= end and num(r[flag]) > 0 and (num_ not in last or d > last[num_]):
            last[num_] = d
    out = []
    for a in sorted(prog["accounts"], key=lambda a: (a["rep"], a["name"])):
        if a["rep"] in HOUSE:
            continue
        n = str(a["n"])
        done = bool(a["prog"])
        out.append({"SALES_REP_ASSIGNED": a["rep"], "CUSTOMER_NUM": a["n"],
                    "CUSTOMER_NAME": a["name"], "BASE_DETAIL": a.get("town") or "",
                    "BASE_DATE": "", "DONE": 1 if done else 0, "DONE_DETAIL": "Carbliss" if done else "",
                    "DONE_DATE": fmt(last.get(n)) if done else ""})
    return out, prog


def main():
    month_dir = HERE / "data" / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    conv, spirits = build_conversion(), build_spirits()
    carb, carb_prog = build_carbliss()
    (month_dir / "mpo_carbliss.json").write_text(json.dumps(carb, indent=2))
    (month_dir / "mpo_sam_adams_conversion.json").write_text(json.dumps(conv, indent=2))
    (month_dir / "mpo_spirits_followup.json").write_text(json.dumps(spirits, indent=2))
    synced = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (month_dir / "sync_meta.json").write_text(json.dumps({"synced_at": synced}, indent=2))
    for label, rows in (("Carbliss", carb), ("Oktoberfest conversion", conv), ("Spirits follow-up", spirits)):
        by = defaultdict(lambda: [0, 0])
        for r in rows:
            by[r["SALES_REP_ASSIGNED"]][0] += 1
            by[r["SALES_REP_ASSIGNED"]][1] += r["DONE"]
        print(f"{label}: {sum(v[1] for v in by.values())} of {sum(v[0] for v in by.values())} accounts done; "
              f"{sum(1 for v in by.values() if v[1] >= v[0])} of {len(by)} reps complete")
    m = carb_prog["meta"]
    print(f"  Carbliss = the leaderboard's program ({m['period']['label']}, sales through {m['sales_through']}"
          f"{', FROZEN' if m['frozen'] else ''}): {sum(r['DONE'] for r in carb)} buyers in rep bases, "
          f"{m['counts']['prog']} company-wide")
    print(f"sync_meta.json timestamped {synced} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
    root = next(p for p in Path(__file__).resolve().parents if (p / "middleware.js").exists())
    subprocess.run([sys.executable, str(root / "tools" / "rep_slices.py")], check=True)
