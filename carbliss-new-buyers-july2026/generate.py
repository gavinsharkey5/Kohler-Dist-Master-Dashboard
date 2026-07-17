#!/usr/bin/env python3
"""
Rebuilds the embedded DATA in index.html from data.csv (an RDE export:
Sales Rep Assigned, Brand Family, Customer Num, Customer Name, Buyer
Count for the Apr-Jun 2026 baseline period, Buyer Count for the July
2026 window).

New buyer logic (per Kohler, 2026-07-17):
  - Bought in both periods -> NOT a new buyer (repeat).
  - Bought Apr-Jun but not July -> churned (bought before, not now).
  - Did NOT buy Apr-Jun but DID buy July -> new buyer.
  - Blank in both never occurs in this export, but would count as neither.

Run: python3 generate.py
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
SRC_CSV = HERE / "data.csv"
OUT_HTML = HERE / "index.html"

PRIOR_COL = "Buyer Count   4/1/2026 - 6/30/2026"
JULY_COL = "Buyer Count   7/1/2026 - 7/31/2026"


def main():
    with open(SRC_CSV, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    accounts = []
    for r in rows:
        prior = (r[PRIOR_COL] or "").strip()
        july = (r[JULY_COL] or "").strip()
        if not july and not prior:
            status = "neither"
        elif july and not prior:
            status = "new"
        elif july and prior:
            status = "repeat"
        else:
            status = "churned"
        accounts.append({
            "rep": r["Sales Rep Assigned"].strip(),
            "acct": r["Customer Num"].strip(),
            "name": r["Customer Name"].strip(),
            "status": status,
        })

    by_rep_counts = defaultdict(lambda: {"new": 0, "repeat": 0, "churned": 0, "neither": 0})
    by_rep_accounts = defaultdict(lambda: {"new": [], "repeat": [], "churned": []})
    for a in accounts:
        by_rep_counts[a["rep"]][a["status"]] += 1
        if a["status"] in ("new", "repeat", "churned"):
            by_rep_accounts[a["rep"]][a["status"]].append({"name": a["name"], "acct": a["acct"]})

    rep_summary = []
    for rep, counts in by_rep_counts.items():
        accts = by_rep_accounts[rep]
        for lst in accts.values():
            lst.sort(key=lambda a: a["name"])
        rep_summary.append({
            "rep": rep, **counts,
            "newAccounts": accts["new"],
            "repeatAccounts": accts["repeat"],
            "churnedAccounts": accts["churned"],
        })
    rep_summary.sort(key=lambda r: -r["new"])

    new_list = sorted(
        (a for a in accounts if a["status"] == "new"),
        key=lambda a: (a["rep"], a["name"]),
    )

    totals = {
        "new": sum(1 for a in accounts if a["status"] == "new"),
        "repeat": sum(1 for a in accounts if a["status"] == "repeat"),
        "churned": sum(1 for a in accounts if a["status"] == "churned"),
        "totalAccounts": len(accounts),
    }

    data = {
        "totals": totals,
        "repSummary": rep_summary,
        "newList": new_list,
    }

    html = OUT_HTML.read_text()
    tag_open = '<script id="carbliss-newbuyers-data" type="application/json">'
    if tag_open not in html:
        raise SystemExit("Could not find carbliss-newbuyers-data script tag in index.html")
    new_html = re.sub(
        r'(<script id="carbliss-newbuyers-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + json.dumps(data, indent=2) + m.group(2),
        html,
        flags=re.DOTALL,
    )
    OUT_HTML.write_text(new_html)
    print(f"Wrote {totals['new']} new buyers, {totals['repeat']} repeat, "
          f"{totals['churned']} churned, across {len(rep_summary)} reps.")


if __name__ == "__main__":
    main()
