#!/usr/bin/env python3
"""Builds data/2026-09/*.json for the September 2026 OFF-premise MPO tab.

Five objectives (from September_2026_MPO.docx):

  1. Constellation - 30% Corona Gaintain Distro              30%  DATA
  2. Molson Coors - Keystone Ice 40% Buying account          30%  DATA
  3. Molson Coors - Fever Tree (10) New Placements           15%  no export yet
  4. Wine & Spirits - (5) New Placements Any Brand           15%  DATA
  5. POS - (5) Cooler Door Stickers Any Brand in iSellBeer   10%  no export yet

OBJECTIVES 1 AND 2 ARE THE SAME SHAPE, which is the point of them: both are
"hit this percentage and you are at goal", so both are emitted as the
pct_of_base dataset the BBC Lytt objective already uses -- {pct, reps:[{rep,
base, target, qualifying, lines}], reps_at_goal, reps_total} -- and both render
through the same card. Gavin asked for Constellation to read like Keystone;
they are literally the same renderer now rather than two lookalikes.

What differs is only what the denominator MEANS:
  Constellation  base = the rep's Sept-Nov 2025 Corona Gaintain placements,
                 qualifying = their Sept-Nov 2026 placements. So the headline
                 percentage is THIS FALL AS A SHARE OF LAST FALL, and 30% is
                 the goal. Note that makes "100%" flat year-over-year, not a
                 full score -- a rep at 30% has rebuilt to a third of last
                 fall, which is what the objective asks for.
  Keystone Ice   base = the rep's off-premise account base, qualifying = the
                 accounts buying Keystone Ice 24oz, goal 40%. Read straight
                 from the Keystone dashboard's own published JSON rather than
                 re-derived here -- that dashboard owns the scoring, the same
                 arrangement incentive-tracking's build_keystone_ice() uses.
                 SO REFRESH keystone-ice FIRST, then this.

Objectives 3 and 5 have no export yet and carry hasData:false. Objective 3 is
NOT the on-prem Fever Tree file: that one is on-premise and its goal is 3, this
is off-premise with a goal of 10. Dropping the on-prem file in here would score
the wrong reps against the wrong target.

Run: python3 generate_2026-09.py
"""
import csv
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
MONTH_KEY = "2026-09"

CONSTELLATION_CSV = HERE / "constellation_corona_gaintain_fall.csv"
WINE_SPIRITS_CSV = HERE / "wine_spirits_any_brand.csv"
KEYSTONE_JSON = HERE.parent.parent / "keystone-ice" / "data" / "keystone_ice.json"

CONSTELLATION_GOAL_PCT = 0.30
KEYSTONE_GOAL_PCT = 0.40
WINE_SPIRITS_TARGET = 5

ROSTER = ["Alex Rodriguez", "Alisa Acciardi", "Allison Scott", "Andrew Lundy",
          "Anthony Palmisano", "Brian Sengebush", "Chris Payton", "Dan Lagala",
          "Dave Ehlers", "Derrick Laws", "Dylan Rubino", "Hakan Sadik",
          "Jaime Colonna", "Javier Melo", "Jayson Romine", "Jim Heaney",
          "John O'Donoghue", "Klejdi Lamo", "Matt Powierski", "Michael Harboy",
          "Mike Ast", "Nick Melissari", "Pablo Lopez", "Paul Mclaughlin",
          "Phil Ernst", "Robin Feldman", "Shane Barreca"]


def load_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def to_num(raw):
    raw = (raw or "").strip()
    if raw == "":
        return 0.0
    try:
        return float(raw)
    except ValueError:
        return 0.0


def split_customer(raw):
    m = re.match(r"\s*(\d+)\s+(.*)$", raw or "")
    if not m:
        return None, (raw or "").strip()
    return m.group(1), m.group(2).strip()


def find_period_cols(fieldnames, prefix):
    cols = [f for f in fieldnames if f.startswith(prefix) and re.search(r"\d{1,2}/\d{1,2}/\d{4}", f)]

    def start(col):
        mo, da, yr = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", col).groups()
        return datetime(int(yr), int(mo), int(da))

    cols.sort(key=start)
    if len(cols) != 2:
        raise SystemExit(f"Expected exactly 2 '{prefix}' columns, found: {cols}")
    return cols[0], cols[1]


def pct_dataset(reps, pct, line_kind):
    """The shape buildPctOfBaseDataset() returns, so the client renders these
    through the existing pct_of_base card with no new builder."""
    at_goal = sum(1 for name in ROSTER
                  for r in [next((x for x in reps if x["rep"] == name), None)]
                  if r and r["qualifying"] >= r["target"])
    return {"pct": pct, "lineKind": line_kind, "reps": reps,
            "reps_at_goal": at_goal, "reps_total": len(ROSTER)}


def build_constellation():
    """This fall's Corona Gaintain placements as a share of last fall's."""
    rows = load_csv(CONSTELLATION_CSV)
    last_col, this_col = find_period_cols(rows[0].keys(), "Corona Gaintain SKUs Placements")
    by_rep = {}
    for r in rows:
        rep = (r["Sales Rep Assigned"] or "").strip()
        if rep not in ROSTER:
            continue
        d = by_rep.setdefault(rep, {"base": 0.0, "current": 0.0, "products": {}})
        last, this = to_num(r[last_col]), to_num(r[this_col])
        d["base"] += last
        d["current"] += this
        # The export repeats a product per SKU line, so accumulate rather than
        # overwrite -- Coronita Extra appears twice for most reps.
        p = d["products"].setdefault((r["Product Name"] or "").strip(), {"base": 0.0, "current": 0.0})
        p["base"] += last
        p["current"] += this

    reps = []
    for rep, d in by_rep.items():
        base = int(round(d["base"]))
        reps.append({
            "rep": rep,
            "base": base,
            "qualifying": int(round(d["current"])),
            # ceil so a rep with any base has a target of at least 1, matching
            # buildPctOfBaseDataset's own rule.
            "target": max(1, math.ceil(base * CONSTELLATION_GOAL_PCT)) if base else 0,
            "lines": sorted(
                ({"product": name, "base": int(round(v["base"])), "current": int(round(v["current"]))}
                 for name, v in d["products"].items()),
                key=lambda l: -l["base"]),
        })
    reps.sort(key=lambda r: r["rep"])
    return pct_dataset(reps, CONSTELLATION_GOAL_PCT, "yoy")


def build_keystone():
    """Read from the Keystone dashboard's published JSON -- it owns the scoring.

    Its qualifier is already 40% of each rep's base, so nothing is recomputed
    here beyond reshaping into the pct_of_base contract.
    """
    if not KEYSTONE_JSON.exists():
        print("  Keystone Ice: SKIPPED -- no keystone-ice/data/keystone_ice.json "
              "(run keystone-ice/generate.py first)")
        return None
    src = json.loads(KEYSTONE_JSON.read_text())
    if not src.get("meta", {}).get("repLevel"):
        print("  Keystone Ice: SKIPPED -- Keystone dashboard has no rep-level data yet")
        return None
    reps = []
    off_roster = []
    for r in src["reps"]:
        if r["rep"] not in ROSTER:
            off_roster.append(r["rep"])
            continue
        reps.append({
            "rep": r["rep"], "base": r["base"], "qualifying": r["buyers"],
            "target": r["qualifier"],
            "lines": [{"customer": a.get("name", ""), "num": a.get("num", ""),
                       "date": a.get("date", "")} for a in (r.get("accounts") or [])],
        })
    reps.sort(key=lambda r: r["rep"])
    if off_roster:
        print(f"  Keystone Ice: {len(off_roster)} off-roster rep(s) dropped: {', '.join(sorted(off_roster))}")
    return pct_dataset(reps, KEYSTONE_GOAL_PCT, "accounts")


def build_wine_spirits():
    """(5) New Placements Any Brand, 90-day non-buy, OFF PREMISE only.

    The export carries both premises; this is the off-premise dashboard, so
    on-premise rows are dropped rather than inflating the count. NEW is the
    usual rule: current window populated, base window not, per rep+customer+
    product -- per PRODUCT here because the objective is placements, not
    accounts, and the same store adding a second brand is a second placement.
    """
    rows = load_csv(WINE_SPIRITS_CSV)
    base_col, cur_col = find_period_cols(rows[0].keys(), "Placement Count")
    date_col = next((c for c in rows[0] if "Date" in c), None)

    state, parsed, dropped = {}, [], 0
    for r in rows:
        if (r.get("On-Off Premise") or "").strip() != "Off Premise":
            dropped += 1
            continue
        rep = (r["Sales Rep Assigned"] or "").strip()
        if rep not in ROSTER:
            dropped += 1
            continue
        num, name = split_customer(r.get("Customer Num & Company"))
        product = (r.get("Product Num Name") or "").strip()
        key = (rep, num or name, product)
        has_base = (r.get(base_col) or "").strip() != ""
        has_cur = (r.get(cur_col) or "").strip() != ""
        st = state.setdefault(key, {"base": False, "current": False})
        st["base"] = st["base"] or has_base
        st["current"] = st["current"] or has_cur
        parsed.append({"row": r, "rep": rep, "num": num, "name": name,
                       "product": product, "key": key,
                       "has_base": has_base, "has_current": has_cur})

    new_keys = {k for k, v in state.items() if v["current"] and not v["base"]}
    flagged, out = set(), []
    for p in parsed:
        period = "current" if p["has_current"] else ("base" if p["has_base"] else None)
        if not period:
            continue
        is_new = 0
        if period == "current" and p["key"] in new_keys and p["key"] not in flagged:
            is_new = 1
            flagged.add(p["key"])
        raw_date = (p["row"].get(date_col) or "").strip() if date_col else ""
        try:
            date = datetime.strptime(raw_date, "%m/%d/%Y").date().isoformat() if raw_date else None
        except ValueError:
            date = None
        out.append({
            "SALES_REP_ASSIGNED": p["rep"],
            "CUSTOMER_NUM": int(p["num"]) if p["num"] else None,
            "CUSTOMER_NAME": p["name"],
            "PRODUCT_NAME": p["product"],
            "BRAND_FAMILY": (p["row"].get("Brand Family") or "").strip(),
            "DATE": date,
            "PERIOD": period,
            "PLACEMENT_COUNT": to_num(p["row"][cur_col if period == "current" else base_col]),
            "NEW_PLACEMENT": is_new,
        })
    out.sort(key=lambda r: r["DATE"] or "", reverse=True)
    return out, len(new_keys), len(state), dropped


def main():
    const = build_constellation()
    keystone = build_keystone()
    ws_rows, ws_new, ws_pairs, ws_dropped = build_wine_spirits()

    month_dir = DATA_DIR / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    (month_dir / "mpo_constellation_gaintain.json").write_text(json.dumps(const, indent=2))
    if keystone:
        (month_dir / "mpo_keystone_ice.json").write_text(json.dumps(keystone, indent=2))
    (month_dir / "mpo_wine_spirits_any_brand.json").write_text(json.dumps(ws_rows, indent=2))

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (month_dir / "sync_meta.json").write_text(json.dumps({"synced_at": synced_at}, indent=2))

    c_at = const["reps_at_goal"]
    lead = max(const["reps"], key=lambda r: (r["qualifying"] / r["base"]) if r["base"] else 0, default=None)
    print(f"Constellation Corona Gaintain (goal 30% of last fall): {c_at} of {len(ROSTER)} reps at goal "
          f"across {len(const['reps'])} with history"
          + (f" | best {lead['rep']} {lead['qualifying']}/{lead['base']} = "
             f"{lead['qualifying']/lead['base']*100:.0f}%" if lead and lead["base"] else ""))
    if keystone:
        print(f"Keystone Ice (goal 40% of account base): {keystone['reps_at_goal']} of {len(ROSTER)} reps at goal "
              f"across {len(keystone['reps'])} reps (read from the Keystone dashboard's JSON)")
    print(f"Wine & Spirits Any Brand (goal 5): {ws_new} new placements out of {ws_pairs} "
          f"rep+customer+product pairs ({len(ws_rows)} rows written, {ws_dropped} on-premise/off-roster rows dropped)")
    print("Fever Tree (10) and POS cooler-door stickers (5): no export yet -- rules-only on the tab")
    print(f"sync_meta.json timestamped {synced_at} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
