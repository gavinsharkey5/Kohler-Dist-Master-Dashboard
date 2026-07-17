#!/usr/bin/env python3
"""
Rebuilds the embedded DATA in index.html from:
  data.csv           RDE export: Sales Rep Assigned, Brand Family,
                      Customer Num, Customer Name, Buyer Count for the
                      Apr-Jun 2026 baseline period, Buyer Count for the
                      July 2026 window. Carbliss buyers only.
  full_accounts.csv  Fusion export: Sales Rep Assigned, Customer Num,
                      Customer Name, Buyer Count 2026 -- each rep's
                      curated list of true Carbliss target accounts
                      (not their whole book -- an earlier, wrong version
                      of this file had every account that bought
                      anything in 2026, which overstated Opportunities).

New buyer logic (per Kohler, 2026-07-17):
  - Bought in both periods -> NOT a new buyer (repeat).
  - Bought Apr-Jun but not July -> churned (bought before, not now).
  - Did NOT buy Apr-Jun but DID buy July -> new buyer.

Opportunities (per Kohler, 2026-07-17, replaces the earlier Churned
column in the UI): accounts on a rep's full 2026 account list that have
NO Carbliss purchase history at all in data.csv (not new, not repeat,
not churned) -- true whitespace, distinct from Churned (which specifically
means "used to buy Carbliss, stopped in July"). Reps with no current
Carbliss accounts but a full book still show up here, since they're
exactly who'd want to see an opportunity list.

Run: python3 generate.py
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
SRC_CSV = HERE / "data.csv"
FULL_CSV = HERE / "full_accounts.csv"
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

    carbliss_accts = {a["acct"] for a in accounts}

    with open(FULL_CSV, newline="", encoding="utf-8-sig") as f:
        full_rows = list(csv.DictReader(f))
    opportunities = [
        {"rep": r["Sales Rep Assigned"].strip(), "acct": r["Customer Num"].strip(),
         "name": r["Customer Name"].strip()}
        for r in full_rows
        if r["Customer Num"].strip() not in carbliss_accts
    ]

    by_rep_counts = defaultdict(lambda: {"new": 0, "repeat": 0, "churned": 0, "neither": 0})
    by_rep_accounts = defaultdict(lambda: {"new": [], "repeat": [], "churned": []})
    for a in accounts:
        by_rep_counts[a["rep"]][a["status"]] += 1
        if a["status"] in ("new", "repeat", "churned"):
            by_rep_accounts[a["rep"]][a["status"]].append({"name": a["name"], "acct": a["acct"]})

    by_rep_opps = defaultdict(list)
    for o in opportunities:
        by_rep_opps[o["rep"]].append({"name": o["name"], "acct": o["acct"]})

    all_reps = set(by_rep_counts) | set(by_rep_opps)
    rep_summary = []
    for rep in all_reps:
        counts = by_rep_counts[rep]
        accts = by_rep_accounts[rep]
        for lst in accts.values():
            lst.sort(key=lambda a: a["name"])
        opp_accts = sorted(by_rep_opps[rep], key=lambda a: a["name"])
        rep_summary.append({
            "rep": rep, **counts,
            "opportunities": len(opp_accts),
            "newAccounts": accts["new"],
            "repeatAccounts": accts["repeat"],
            "churnedAccounts": accts["churned"],
            "opportunityAccounts": opp_accts,
        })
    rep_summary.sort(key=lambda r: (-r["new"], -r["opportunities"]))

    new_list = sorted(
        (a for a in accounts if a["status"] == "new"),
        key=lambda a: (a["rep"], a["name"]),
    )

    totals = {
        "new": sum(1 for a in accounts if a["status"] == "new"),
        "repeat": sum(1 for a in accounts if a["status"] == "repeat"),
        "churned": sum(1 for a in accounts if a["status"] == "churned"),
        "opportunities": len(opportunities),
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
          f"{totals['opportunities']} opportunities, across {len(rep_summary)} reps.")


if __name__ == "__main__":
    main()
