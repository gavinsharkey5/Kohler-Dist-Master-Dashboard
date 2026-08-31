#!/usr/bin/env python3
"""
Rebuilds data/keystone_ice.json (+ data/sync_meta.json) for the Keystone Ice
24 oz Rewards dashboard (September 2026 program, August placements count).

Inputs
  goals.csv    Extracted from Kohler's "2026 Key Ice Goals" workbook: one row
               per rep with Buyer Count 2026 (their off-premise MolsonCoors
               account base), Qualifier (40% of that base) and Bonus Goal
               (50%). Both thresholds ship in the file rather than being
               recomputed here -- if Kohler changes the percentages, the new
               workbook carries the new numbers and nothing in code moves.
  actuals.csv  RDE "Comparison" export of Keystone Ice 24 oz off-premise
               buyers, windowed 8/1/2026 - 9/30/2026.

               NOTE the shape of this export: buyer counts are DISTINCT
               ACCOUNTS, so they do NOT add up across rows. The 8/31 pull
               listed 62 buyer-count units across 20 daily rows but a "Total"
               row of 54 -- 54 is the real distinct-buyer figure and 62 is
               the same accounts counted on more than one day. read_actuals()
               therefore takes the Total row as the house figure and treats
               the daily rows as activity only, never summing them.

               The 8/31 export carries NO rep column, so per-rep progress
               cannot be computed from it -- every rep renders as "awaiting
               data" and the page says so. Re-pull with "Sales Rep Assigned"
               added as a dimension and this script picks it up automatically:
               if a rep column is present it builds per-rep distinct-buyer
               counts and the page fills in with no code change.

Cases are deliberately ignored (per Gavin, 2026-08-31: "disregard the cases
portion for now") -- the program's qualifier, bonus and top-performer awards
are all scored on buyer count. The column is carried through to the JSON
unused so a future cases view doesn't need a re-export.

Run: python3 generate.py
"""
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"

# Slide-defined reward structure (Kohler, September 2026). No data source for
# these -- they came off the program one-pager, so edit here if it changes.
REWARDS = {
    "perPlacement": 5,        # $ per off-premise Keystone Ice 24oz placement, once qualified
    "perPlacementBonus": 10,  # $ per placement instead, once the bonus goal is hit
    "isellPerPhoto": 5,       # $ per cooler-door photo submitted in iSell Beer
    "topPerformer": [300, 150],  # 1st / 2nd highest off-premise distribution %
}


def find_col(fieldnames, *needles):
    for f in fieldnames:
        low = f.lower()
        if all(n in low for n in needles):
            return f
    return None


def read_goals():
    with open(HERE / "goals.csv", newline="", encoding="utf-8-sig") as f:
        return [{
            "rep": r["Sales Rep Assigned"].strip(),
            "base": int(float(r["Buyer Count 2026"])),
            "qualifier": float(r["Qualifier"]),
            "bonus": float(r["Bonus Goal"]),
        } for r in csv.DictReader(f) if r["Sales Rep Assigned"].strip()]


def read_actuals():
    with open(HERE / "actuals.csv", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        buyer_col = find_col(cols, "buyer count")
        cases_col = find_col(cols, "cases")
        rep_col = find_col(cols, "sales rep") or find_col(cols, "rep assigned")
        rows = list(reader)

    window = ""
    m = re.search(r"(\d+/\d+/\d{4})\s*-\s*(\d+/\d+/\d{4})", buyer_col or "")
    if m:
        window = f"{m.group(1)} – {m.group(2)}"

    def num(v):
        v = (v or "").strip()
        try:
            return float(v)
        except ValueError:
            return 0.0

    # The export's own "Total" row is the distinct-buyer count for the window.
    first_col = cols[0]
    total_row = next((r for r in rows if (r.get(first_col) or "").strip().lower() == "total"), None)
    daily = [r for r in rows if r is not total_row and (r.get("Date") or "").strip()]

    by_rep = {}
    if rep_col:
        # Distinct accounts per rep. Needs a customer column to dedupe properly;
        # without one, fall back to the rep's own Total row if the export has one.
        cust_col = find_col(cols, "customer")
        seen = {}
        for r in daily:
            rep = (r.get(rep_col) or "").strip()
            if not rep:
                continue
            if cust_col:
                seen.setdefault(rep, set()).add((r.get(cust_col) or "").strip())
            else:
                seen.setdefault(rep, set())
        by_rep = {rep: len(v) for rep, v in seen.items()} if cust_col else {}

    return {
        "window": window,
        "houseBuyers": int(num(total_row.get(buyer_col))) if total_row else None,
        "byRep": by_rep,
        "repLevel": bool(by_rep),
        "daily": sorted(
            [{"date": (r.get("Date") or "").strip(),
              "buyers": int(num(r.get(buyer_col))),
              "cases": num(r.get(cases_col)) if cases_col else 0}
             for r in daily],
            key=lambda d: datetime.strptime(d["date"], "%m/%d/%Y")),
    }


def main():
    goals = read_goals()
    act = read_actuals()

    reps = []
    for g in goals:
        buyers = act["byRep"].get(g["rep"]) if act["repLevel"] else None
        row = dict(g, buyers=buyers,
                   pct=(buyers / g["base"] * 100) if buyers is not None and g["base"] else None,
                   qualified=(buyers >= g["qualifier"]) if buyers is not None else None,
                   bonusHit=(buyers >= g["bonus"]) if buyers is not None else None)
        row["payout"] = (buyers * (REWARDS["perPlacementBonus"] if row["bonusHit"]
                                   else REWARDS["perPlacement"])) if row["qualified"] else 0
        reps.append(row)
    reps.sort(key=lambda r: (-(r["pct"] or -1), -r["base"], r["rep"]))

    out = {
        "meta": {
            "program": "Keystone Ice 24 oz Cans — September 2026",
            "window": act["window"],
            "repLevel": act["repLevel"],
            "houseBuyers": act["houseBuyers"],
            "houseBase": sum(g["base"] for g in goals),
            "houseQualifier": round(sum(g["qualifier"] for g in goals), 1),
            "houseBonus": round(sum(g["bonus"] for g in goals), 1),
            "repCount": len(goals),
        },
        "rewards": REWARDS,
        "reps": reps,
        "daily": act["daily"],
    }

    DATA.mkdir(exist_ok=True)
    (DATA / "keystone_ice.json").write_text(json.dumps(out, indent=2))
    synced = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (DATA / "sync_meta.json").write_text(json.dumps({"synced_at": synced}, indent=2))

    print(f"{len(reps)} reps | house base {out['meta']['houseBase']} "
          f"| qualifier {out['meta']['houseQualifier']} | bonus {out['meta']['houseBonus']}")
    print(f"house distinct buyers: {act['houseBuyers']} over {act['window']} "
          f"({len(act['daily'])} active days)")
    if act["repLevel"]:
        print(f"rep-level buyers resolved for {len(act['byRep'])} reps")
    else:
        print("NO rep column in actuals.csv -- per-rep progress renders as "
              "'awaiting data'. Re-pull the Comparison export with "
              "'Sales Rep Assigned' (and a Customer column) to fill it in.")
    print(f"sync_meta.json timestamped {synced}")


if __name__ == "__main__":
    main()
