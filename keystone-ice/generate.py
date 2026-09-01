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
  actuals.csv  RDE "KEYSTONE ICE 24 OZ CANS ARE BACK SEPT 2026" export:
               Sales Rep Name, Product, Brand, Customer Num Name, Date,
               Buyer Count and Cases for 8/1/2026 - 9/30/2026. RDE writes
               these with a UTF-8 BOM, hence encoding="utf-8-sig" -- without
               it the first header key comes back mangled.

WHOLE NUMBERS EVERYWHERE (per Gavin, 2026-08-31: "make the rep goals and all
other decimals whole numbers... easier on the eyes for a rep on their iPad").
Kohler's goals arrive fractional -- 40% of a 43-account base is 17.2 -- so
both thresholds are rounded UP with ceil, and the ceiling is what the page
both displays AND scores against. Rounding up is not a display convenience:
for a whole number of accounts, buyers >= 17.2 and buyers >= 18 are the same
test, so the number a rep reads is exactly the number they have to hit. Down
or nearest would break that (a rep on 17 would read "17 of 17" and still not
be qualified). The raw fractional values are kept in the JSON as
qualifierRaw / bonusRaw so the provenance is never lost.

NO HOUSE GOAL. This program has no house-level target -- it is scored per
rep, and the top-performer award is a race between reps, not a total to
reach (confirmed with Gavin 2026-08-31). Earlier versions of this file summed
every rep's goal into a "house qualifier"; that number was invented here and
meant nothing to anyone, so it is gone. The house figures that remain are
plain counts of what happened, not targets.

BUYER COUNT IS DISTINCT ACCOUNTS. The export carries one row per
rep/account/date, so an account buying on two days appears twice: the 8/31
pull holds 62 rows but only 54 distinct accounts. Every buyer figure here is
therefore a count of DISTINCT customers -- never a sum of the Buyer Count
column, which would overstate any rep whose account bought more than once.
The same trap applies to the daily series, where each day counts the distinct
accounts active that day and the days deliberately do not add up to 54.

Cases are deliberately ignored (per Gavin: "disregard the cases portion for
now") -- the qualifier, the bonus and both top-performer awards are all scored
on buyer count. The column is carried through to the JSON unused so a future
cases view doesn't need a re-export.

Run: python3 generate.py
"""
import csv
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"

# Slide-defined reward structure (Kohler, September 2026). No data source for
# these -- they came off the program one-pager, so edit here if it changes.
REWARDS = {
    "perPlacement": 5,           # $ per off-premise Keystone Ice 24oz placement, once qualified
    "perPlacementBonus": 10,     # $ per placement instead, once the bonus goal is hit
    "isellPerPhoto": 5,          # $ per cooler-door photo submitted in iSell Beer
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
        out = []
        for r in csv.DictReader(f):
            rep = r["Sales Rep Assigned"].strip()
            if not rep:
                continue
            q, b = float(r["Qualifier"]), float(r["Bonus Goal"])
            out.append({"rep": rep, "base": int(float(r["Buyer Count 2026"])),
                        "qualifier": math.ceil(q), "bonus": math.ceil(b),
                        "qualifierRaw": q, "bonusRaw": b})
        return out


def read_actuals():
    with open(HERE / "actuals.csv", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        rows = [r for r in reader if (r.get(cols[0]) or "").strip().lower() != "total"]

    rep_col = find_col(cols, "sales rep") or find_col(cols, "rep")
    cust_col = find_col(cols, "customer")
    date_col = find_col(cols, "date")
    buyer_col = find_col(cols, "buyer count")

    window = ""
    m = re.search(r"(\d+/\d+/\d{4})\s*-\s*(\d+/\d+/\d{4})", buyer_col or "")
    if m:
        window = f"{m.group(1)} – {m.group(2)}"

    # Per-rep progress needs BOTH a rep and a customer column: without customer
    # there is no way to dedupe an account that bought on two days, and summing
    # the Buyer Count column instead would inflate the rep (62 rows vs 54 real
    # accounts on the 8/31 pull). Missing either one, per-rep stays empty and
    # the page renders "awaiting data" rather than publishing a wrong number.
    rep_level = bool(rep_col and cust_col)

    accounts = defaultdict(dict)   # rep -> {account: earliest date}
    daily = defaultdict(set)       # date -> set of accounts active that day
    if rep_level:
        for r in rows:
            rep = (r.get(rep_col) or "").strip()
            acct = (r.get(cust_col) or "").strip()
            date = (r.get(date_col) or "").strip()
            if not rep or not acct:
                continue
            prev = accounts[rep].get(acct)
            if prev is None or (date and _dt(date) < _dt(prev)):
                accounts[rep][acct] = date
            if date:
                daily[date].add(acct)

    return {
        "window": window,
        "repLevel": rep_level,
        "accounts": accounts,
        "houseBuyers": len({a for m in accounts.values() for a in m}) if rep_level else None,
        "daily": [{"date": d, "buyers": len(v)} for d, v in sorted(daily.items(), key=lambda x: _dt(x[0]))],
    }


def _dt(s):
    return datetime.strptime(s.strip(), "%m/%d/%Y")


def split_account(a):
    """'27046 New Eagle Liquors' -> ('27046', 'New Eagle Liquors')."""
    m = re.match(r"^(\d+)\s+(.*)$", a.strip())
    return (m.group(1), m.group(2)) if m else ("", a.strip())


def main():
    goals = read_goals()
    act = read_actuals()

    reps = []
    for g in goals:
        accts = act["accounts"].get(g["rep"], {}) if act["repLevel"] else None
        buyers = len(accts) if accts is not None else None
        qualified = (buyers >= g["qualifier"]) if buyers is not None else None
        bonus_hit = (buyers >= g["bonus"]) if buyers is not None else None
        rate = REWARDS["perPlacementBonus"] if bonus_hit else REWARDS["perPlacement"]
        account_rows = []
        for full, date in sorted((accts or {}).items(),
                                 key=lambda x: (_dt(x[1]) if x[1] else datetime.max)):
            num, name = split_account(full)
            account_rows.append({"num": num, "name": name, "date": date})
        reps.append(dict(
            g,
            buyers=buyers,
            pct=round(buyers / g["base"] * 100) if buyers is not None and g["base"] else None,
            qualified=qualified,
            bonusHit=bonus_hit,
            toQualifier=max(0, g["qualifier"] - buyers) if buyers is not None else None,
            toBonus=max(0, g["bonus"] - buyers) if buyers is not None else None,
            payout=buyers * rate if qualified else 0,
            accounts=account_rows,
        ))
    # Ranked on percentage of their own base -- the measure the $300/$150
    # top-performer awards are decided on.
    reps.sort(key=lambda r: (-(r["pct"] if r["pct"] is not None else -1), -r["base"], r["rep"]))

    qualified_reps = [r for r in reps if r["qualified"]]
    out = {
        "meta": {
            "program": "Keystone Ice 24 oz Cans — September 2026",
            "window": act["window"],
            "repLevel": act["repLevel"],
            "repCount": len(goals),
            "houseBuyers": act["houseBuyers"],
            "qualifiedCount": len(qualified_reps),
            "bonusCount": sum(1 for r in reps if r["bonusHit"]),
            "totalPayout": sum(r["payout"] for r in reps),
        },
        "rewards": REWARDS,
        "reps": reps,
        "daily": act["daily"],
    }

    DATA.mkdir(exist_ok=True)
    (DATA / "keystone_ice.json").write_text(json.dumps(out, indent=2))
    synced = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (DATA / "sync_meta.json").write_text(json.dumps({"synced_at": synced}, indent=2))

    print(f"{len(reps)} reps with goals | window {act['window']}")
    if act["repLevel"]:
        print(f"{act['houseBuyers']} distinct accounts sold house-wide across {len(act['daily'])} active days")
        print(f"{out['meta']['qualifiedCount']} qualified, {out['meta']['bonusCount']} at bonus, "
              f"${out['meta']['totalPayout']:,} projected")
        for r in reps[:5]:
            print(f"   {r['rep']:20} {r['buyers']:3} of {r['qualifier']:3} "
                  f"({r['pct']}% of {r['base']})  {'BONUS' if r['bonusHit'] else 'QUALIFIED' if r['qualified'] else ''}")
    else:
        print("NO rep + customer columns in actuals.csv -- per-rep progress renders as 'awaiting data'.")
    print(f"sync_meta.json timestamped {synced}")


if __name__ == "__main__":
    main()
