#!/usr/bin/env python3
"""Builds October 2026's on-premise MPO datasets (OCTOBER_ON_PREM_2026_MPO.docx).

  25%  Carbliss  -- 40% Buying Accounts              (built here)
  25%  BBC       -- Complete Oktoberfest Draft Conversion   (built here)
  25%  Spirits   -- Follow up on all On-Premise Spirits placements   (built here)
  25%  iSellBeer -- (5) Feature Photos               (awaiting: no October export yet)

Inputs (this folder, overwrite to refresh):
  core_market_on_prem_accts.csv              RDE "Entire Core Market On Prem Accts" -- every on-premise
                                             account in the Core Market, per rep: the Carbliss DENOMINATOR.
  carbliss_buying_accounts.csv               RDE "Carbliss 40% Buying Accounts": one row per load sheet,
                                             Buyer Count 9/1/2026 - 10/31/2026 (September + October).
  sam_adams_kegs_summer_to_octoberfest.csv   RDE "Sam Adams Kegs: Summer Ale to Octoberfest" --
                                             one row per rep / account / keg SKU / load-sheet date.
  spirits_followup_placements.csv            RDE two-window export (7/1-9/30 placements, 10/1-10/31).

Run:  python3 generate_2026-10.py     (also rebuilds the per-rep copies)

Both objectives are FOLLOW-UP scores: a rep has a list of accounts (the base)
and each one is either done or not yet.

--- Carbliss: 40% buying accounts ---
Base = the rep's accounts in core_market_on_prem_accts.csv; DONE = the account bought Carbliss
on any load sheet 9/1-10/31 (the objective carries over from September, so the window is
September + October). Distinct accounts, so repeat orders count once. Target = ceil(40% x
base). A buyer that is not in that rep's own base would not be counted (the build prints them).

--- BBC Oktoberfest conversion ---
BASE = accounts with NET Summer Ale keg units > 0 loaded 4/1/2026 - 7/17/2026
(Gavin, 2026-10-05). DONE = the same account has NET Octoberfest keg units > 0
loaded 8/1/2026 - 10/23/2026. Net = a keg bought and returned is nothing (the
same net rule the Incentive Tracker's Sam Adams conversion uses). Summer Ale
loaded after 7/17 and Octoberfest loaded before 8/1 count toward neither side.
Accounts that took Octoberfest but never poured Summer Ale in the base window
("gained") are not in the base. "Complete" = every base account, so the target
is 100% of the rep's base.

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
BASE_WINDOW = (datetime(2026, 4, 1), datetime(2026, 7, 17))     # Summer Ale poured
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


BB_DIR = HERE.parent.parent / "incentive-tracking" / "data"


def apply_boston_beer(rows):
    """BOSTON BEER SCOREBOARD OVERRIDE (Gavin, 2026-10-05: "use the boston beer
    files to update this mpo"). For every rep on Boston Beer's seasonal
    conversion scoreboard the MPO counts are THEIR numbers: base = Prev Season
    lines, done = Converted, with their unconverted-account list as the named
    targets (matched to the RDE keg export by outlet name when possible).
    Converted accounts are named from the RDE export where it agrees; surplus
    RDE conversions (newest first-Octoberfest keg first -- those landed after
    Boston Beer's snapshot) are left out, and a shortfall is filled with
    "Converted account (Boston Beer count)" lines. Reps with no scoreboard row
    (Dave Ehlers, Phil Ernst, Shane Barreca) and the route-90 row keep the RDE
    list. Source files: incentive-tracking/data/sam_adams_seasonal_oct_*.csv."""
    import csv, re
    off = BB_DIR / "sam_adams_seasonal_oct_official.csv"
    unc = BB_DIR / "sam_adams_seasonal_oct_unconverted.csv"
    if not off.exists() or not unc.exists():
        return rows
    norm = lambda t: re.sub(r"[^a-z0-9]", "", (t or "").lower())
    score = {r["Sales Rep Name"]: r for r in csv.DictReader(open(off, encoding="utf-8"))
             if not r["Sales Rep Name"].startswith("Route ")}
    bb_unc = defaultdict(list)
    for u in csv.DictReader(open(unc, encoding="utf-8")):
        bb_unc[u["Sales Rep Name"]].append(u)
    out, report = [], []
    by_rep = defaultdict(list)
    for r in rows:
        by_rep[r["SALES_REP_ASSIGNED"]].append(r)
    for rep, lst in sorted(by_rep.items()):
        sc = score.get(rep)
        if not sc:
            out += lst
            continue
        conv_n, not_n = int(sc["Converted"]), int(sc["Not Converted"])
        pool = {norm(r["CUSTOMER_NAME"]): r for r in lst}
        used, targets = set(), []
        for u in bb_unc.get(rep, []):
            outlet = u["Account"]
            hit = pool.get(norm(outlet))
            used.add(norm(outlet))
            if hit:
                t = dict(hit); t["DONE"] = 0; t["DONE_DETAIL"] = ""; t["DONE_DATE"] = ""
                if not t["BASE_DETAIL"]:
                    t["BASE_DETAIL"] = "Summer Ale (Boston Beer list)"
            else:
                t = {"SALES_REP_ASSIGNED": rep, "CUSTOMER_NUM": "", "CUSTOMER_NAME": outlet.title(),
                     "BASE_DETAIL": f"Summer Ale last season · {float(u['Prev Season CEs'] or 0):.1f} CE (Boston Beer list)",
                     "BASE_DATE": "", "DONE": 0, "DONE_DETAIL": "", "DONE_DATE": ""}
            targets.append(t)
        done = [r for r in lst if r["DONE"] and norm(r["CUSTOMER_NAME"]) not in used]
        done.sort(key=lambda r: (r["DONE_DATE"] or ""))          # oldest first-Octoberfest keg first
        done = done[:conv_n]
        pad = conv_n - len(done)
        for i in range(pad):
            done.append({"SALES_REP_ASSIGNED": rep, "CUSTOMER_NUM": "", "CUSTOMER_NAME": "Converted account (Boston Beer count)",
                         "BASE_DETAIL": "Summer Ale last season", "BASE_DATE": "", "DONE": 1,
                         "DONE_DETAIL": "Octoberfest (Boston Beer scoreboard 10/5)", "DONE_DATE": "2026-10-05"})
        out += targets + done
        report.append((rep, conv_n + not_n, conv_n, len(targets), pad))
    print("sam_adams_conversion (Boston Beer scoreboard 10/5): " + "; ".join(
        f"{r[0]} {r[2]}/{r[1]} (named targets {r[3]}, filler {r[4]})" for r in report))
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
CARBLISS_CSV = HERE / "carbliss_buying_accounts.csv"


def build_carbliss():
    base = {}
    for r in load(CORE_ON_CSV):
        rep = (r["Sales Rep Assigned"] or "").strip()
        if not rep or rep in HOUSE:
            continue
        base.setdefault((rep, r["Customer Num"].strip()), r)
    bcol = next(c for c in load(CARBLISS_CSV)[0] if c.startswith("Buyer Count"))
    buyers, outside = {}, set()
    for r in load(CARBLISS_CSV):
        rep = (r["Sales Rep Assigned"] or "").strip()
        num_, name = split_customer(r["Customer Num & Company"])
        if not rep or rep in HOUSE or num(r[bcol]) <= 0:
            continue
        if (rep, num_) not in base:
            outside.add((rep, num_, name))
            continue
        d = dt(r["Load Sheet Date"])
        b = buyers.setdefault((rep, num_), d)
        if d and (b is None or d > b):
            buyers[(rep, num_)] = d
    out = []
    for (rep, num_), r in sorted(base.items(), key=lambda kv: (kv[0][0], kv[1]["Customer Name"])):
        done = (rep, num_) in buyers
        out.append({"SALES_REP_ASSIGNED": rep, "CUSTOMER_NUM": int(num_) if num_.isdigit() else num_,
                    "CUSTOMER_NAME": r["Customer Name"].strip(), "BASE_DETAIL": (r["City"] or "").strip(),
                    "BASE_DATE": "", "DONE": 1 if done else 0, "DONE_DETAIL": "Carbliss" if done else "",
                    "DONE_DATE": fmt(buyers.get((rep, num_)))})
    return out, outside


def main():
    month_dir = HERE / "data" / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    conv, spirits = apply_boston_beer(build_conversion()), build_spirits()
    carb, carb_outside = build_carbliss()
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
    if carb_outside:
        print("  Carbliss buyers NOT in the rep's core on-prem base (not counted): "
              + "; ".join(sorted(f"{r} / {n} {m}" for r, n, m in carb_outside)))
    print(f"sync_meta.json timestamped {synced} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
    root = next(p for p in Path(__file__).resolve().parents if (p / "middleware.js").exists())
    subprocess.run([sys.executable, str(root / "tools" / "rep_slices.py")], check=True)
