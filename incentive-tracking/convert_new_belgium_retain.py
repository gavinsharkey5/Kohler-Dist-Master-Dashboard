#!/usr/bin/env python3
"""Normalize the grouped New Belgium report; never add subtotal and SKU rows.
Refresh: python convert_new_belgium_retain.py [report.xlsx]
Then: python generate.py (also refreshes protected per-rep copies).
The reporting window is Sep 1-Dec 31, confirmed by Gavin on 2026-10-16,
overriding the October deck's Oct-Nov label. No payout or bonus is inferred.
"""
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path
import openpyxl

HERE = Path(__file__).resolve().parent
GROUPS = {"12pk Can": "Voodoo 12pk", "19.2oz Can": "Voodoo 19.2oz",
          "6pk Can + Btl": "Hearted + Kirin 6pk (combined report goal)"}

def count(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label}: missing or nonnumeric count {value!r}")
    if not math.isfinite(value) or value < 0 or int(value) != value:
        raise ValueError(f"{label}: expected a nonnegative integer, got {value!r}")
    return int(value)

def convert(source):
    book = openpyxl.load_workbook(source, data_only=True, read_only=True)
    try:
        sheet = book["New Belgium Distribution Repor"]
        rows = list(sheet.values)
        expected = ("Sales Rep Name / Package Group / Product Num Name", "FPL",
                    "Placements", "( Placements) Goals", "( Placements) % of Goals")
        if tuple(rows[0]) != expected:
            raise ValueError("Report layout changed: check the five source columns")
        details = list(book["Details"].values)
        values = {str(r[0]): r[2] for r in details if r[0]}
        start = str(values.get("Dist Start", ""))[:10]
        end = str(values.get("Dist End", ""))[:10]
        if (start, end) != ("2026-09-01", "2026-12-31"):
            raise ValueError(f"Reporting window changed: {start} to {end}; confirm before publishing")
        if values.get("On/Off Premise") != 0:
            raise ValueError("Report is no longer filtered to off-premise")
        created = next(r[2] for r in details if r[0] == "Report Created Time")
        if not isinstance(created, dt.datetime):
            raise ValueError("Report created time is missing")
        report = {"meta": {"source": Path(source).name, "reportId": details[4][0],
                  "reportCreated": created.isoformat(), "periodStart": start, "periodEnd": end,
                  "deckPeriod": "October-November", "windowConfirmed": "2026-10-16",
                  "channel": "off", "nonZeroFilter": values.get("NonZero"),
                  "scope": "Only reps present in the supplied filtered report",
                  "goalBasis": "Reported rep and package-group totals; SKU goals are independent, not additive"},
                  "house": None, "reps": []}
        rep = group = None
        rep_names = set()
        for index, raw in enumerate(rows[1:], 2):
            label, fpl, actual, goal, _ = raw
            if not label:
                if any(v not in (None, "") for v in raw): raise ValueError(f"Unlabelled row {index}")
                continue
            label = str(label).strip()
            # A SKU line can carry placements with no SKU goal (Bell's Big Hearted, 2026-10-21):
            # that is "no goal on this SKU" = 0. Rep, package-group and report totals stay strict.
            sku_line = re.fullmatch(r"\d+ .+", label) is not None
            metric = {"placements": count(actual, f"row {index} actual"),
                      "goal": 0 if (goal is None and sku_line) else count(goal, f"row {index} goal")}
            if label == "Total":
                if report["house"] is not None or report["reps"]:
                    raise ValueError("Unexpected extra report total")
                report["house"] = metric
                continue
            if fpl == "Full Product List":
                if not rep or label not in GROUPS: raise ValueError(f"Unexpected package group: {label}")
                if any(g["sourceLabel"] == label for g in rep["groups"]):
                    raise ValueError(f"Duplicate group for {rep['rep']}: {label}")
                group = {**metric, "sourceLabel": label, "label": GROUPS[label], "products": []}
                rep["groups"].append(group)
                continue
            product = re.fullmatch(r"(\d+) (.+)", label)
            if product:
                if not group: raise ValueError(f"Product without a package group at {index}")
                product_id, name = product.groups()
                if any(p["id"] == product_id for p in group["products"]):
                    raise ValueError(f"Duplicate product {product_id} for {rep['rep']}")
                group["products"].append({**metric, "id": product_id, "product": name})
                continue
            if fpl not in (None, ""): raise ValueError(f"Unknown row kind at {index}")
            if label in rep_names: raise ValueError(f"Duplicate rep {label}")
            rep_names.add(label)
            rep = {**metric, "rep": label, "groups": []}
            report["reps"].append(rep)
            group = None
        if not report["house"] or not report["reps"]: raise ValueError("Empty report")
        for rep in report["reps"]:
            if {g["sourceLabel"] for g in rep["groups"]} != set(GROUPS):
                raise ValueError(f"Missing package groups for {rep['rep']}")
            for key in ["placements", "goal"]:
                if sum(g[key] for g in rep["groups"]) != rep[key]:
                    raise ValueError(f"Package groups do not reconcile to {rep['rep']} {key}")
            for group in rep["groups"]:
                if sum(p["placements"] for p in group["products"]) != group["placements"]:
                    raise ValueError(f"SKU activity does not reconcile for {rep['rep']} {group['label']}")
                group["visibleSkuGoal"] = sum(p["goal"] for p in group["products"])
                group["skuGoalDifference"] = group["goal"] - group["visibleSkuGoal"]
        for key in ["placements", "goal"]:
            if sum(r[key] for r in report["reps"]) != report["house"][key]:
                raise ValueError(f"Rep totals do not reconcile to report {key}")
        return report
    finally:
        book.close()

def main():
    source = Path(sys.argv[1]) if len(sys.argv)>1 else HERE/"data/new_belgium_distribution_retain.xlsx"
    report = convert(source)
    target = HERE/"data/new_belgium_distribution_retain.json"
    target.write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(f"Wrote {target.name}: {len(report['reps'])} reps, {report['house']}, Sep 1-Dec 31")
if __name__ == "__main__":
    main()
