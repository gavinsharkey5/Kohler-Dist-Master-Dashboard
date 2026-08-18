#!/usr/bin/env python3
"""Builds the embedded JSON in index.html from the raw incentive RDE exports.

Run: python3 generate.py
Reads everything from data/, writes the PROGRAM_DATA JSON block into
index.html between the START/END markers.
"""
import csv
import datetime
import json
import re
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
INDEX_HTML = Path(__file__).parent / "index.html"

# Per Gavin, 2026-08-1x: Chris Politano, John Neukum, and Office Tell
# Sell are NOT reps (despite having rows in the Sun Cruiser file) and
# must not appear on the dashboard -- their rows are simply excluded,
# same as "Default" (an unassigned-account bucket in the customer base
# files).
ROSTER = ["Alex Rodriguez","Alisa Acciardi","Allison Scott","Andrew Lundy","Anthony Palmisano",
          "Brian Sengebush","Chris Payton","Dan Lagala","Dave Ehlers","Derrick Laws","Dylan Rubino",
          "Hakan Sadik","Jaime Colonna","Javier Melo","Jayson Romine","Jim Heaney","John O'Donoghue",
          "Klejdi Lamo","Matt Powierski","Michael Harboy","Mike Ast","Nick Melissari","Pablo Lopez",
          "Paul Mclaughlin","Phil Ernst","Robin Feldman","Shane Barreca"]

DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")


def to_num(s):
    s = (s or "").strip().replace(",", "")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def find_period_cols(fieldnames, prefix):
    """Find the two dated columns sharing `prefix` (e.g. 'Cases'), return
    (base_col, current_col) sorted by embedded start date."""
    cols = [f for f in fieldnames if f.startswith(prefix + " ") or f.startswith(prefix + "  ")]
    dated = []
    for c in cols:
        m = DATE_RE.search(c)
        if m:
            mo, da, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
            dated.append((yr, mo, da, c))
    dated.sort()
    if len(dated) != 2:
        raise ValueError(f"expected 2 dated columns for prefix {prefix!r}, found {dated} in {fieldnames}")
    return dated[0][3], dated[1][3]


def keg_bbl(package):
    """Barrel-equivalent for a keg package string. Returns None if not a keg."""
    p = (package or "").lower()
    if "1/6 bbl" in p or "5.2 gal" in p:
        return 1.0 / 6.0
    if "1/4 bbl" in p or "7.75 gal" in p:
        return 1.0 / 4.0
    if "15.5 gal" in p:
        return 0.5
    if "gal keg" in p or "keg" in p:
        # fallback: try to pull the gallon number and convert (31 gal = 1 bbl)
        m = re.search(r"([\d.]+)\s*gal", p)
        if m:
            return float(m.group(1)) / 31.0
        return None
    return None


def is_keg_package(package):
    return keg_bbl(package) is not None


def read_rows(filename):
    path = DATA_DIR / filename
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def classify_dual(rows, base_col, current_col, key_fields):
    """Group rows by key_fields; classify each key as 'new' (populated in
    current_col only), 'rebuy' (populated in both), 'base_only', or
    omitted (populated in neither). Returns (classification dict, by_key
    dict) so callers can look up detail rows for a key."""
    by_key = {}
    for row in rows:
        key = tuple(row[k] for k in key_fields)
        by_key.setdefault(key, []).append(row)
    classified = {}
    for key, krows in by_key.items():
        has_current = any(r[current_col].strip() != "" for r in krows)
        has_base = any(r[base_col].strip() != "" for r in krows)
        if has_current and has_base:
            classified[key] = "rebuy"
        elif has_current:
            classified[key] = "new"
        elif has_base:
            classified[key] = "base_only"
    return classified, by_key


def classify_by_customer(krows_by_cust, base_col, current_col):
    """Classify each (rep, customer) group as 'new' / 'reorder' / 'lapsed' by
    whether ANY row for that customer (across all its qualifying products) has
    base/current period activity. This is the account-level definition most
    placement incentives actually use -- an account that already carries one
    SKU and adds a second SKU is not a new ACCOUNT placement, so classification
    must happen at the customer grain, not per (customer, product) row. Per
    Gavin, 2026-08-17 (correcting the original per-product assumption)."""
    classified = {}
    for key, krows in krows_by_cust.items():
        has_current = any(r[current_col].strip() != "" for r in krows)
        has_base = any(r[base_col].strip() != "" for r in krows)
        if has_current and has_base:
            classified[key] = "reorder"
        elif has_current:
            classified[key] = "new"
        elif has_base:
            classified[key] = "lapsed"
    return classified


def latest_date(krows, col):
    dates = []
    for r in krows:
        if r[col].strip():
            m = DATE_RE.search(r["Date"])
            if m:
                mo, da, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
                dates.append(((yr, mo, da), r["Date"]))
    if not dates:
        return None
    dates.sort()
    return dates[-1][1]


def period_dates(krows, col):
    """All distinct dates where `col` is populated for these rows,
    chronologically sorted and comma-joined -- used to show a rebuy
    customer's full base-period purchase history (there can be more
    than one), not just the latest."""
    seen = {}
    for r in krows:
        if r[col].strip():
            m = DATE_RE.search(r["Date"])
            if m:
                mo, da, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
                seen[(yr, mo, da)] = r["Date"]
    if not seen:
        return None
    return ", ".join(seen[k] for k in sorted(seen))


def build_1911_or_woodchuck(filename, bbl_threshold):
    """Per Gavin, 2026-08-17: 'new placement' means the ACCOUNT had zero
    qualifying purchases of ANY product in that channel (off-prem package,
    or draft) during the base period, and buys at least one qualifying
    product in that channel during the current period -- account-level, not
    per-SKU. An account that already carried one 1911 SKU and adds a second
    one this period is a reorder/existing-buyer event, not a new placement,
    even though that second SKU itself is new to the account. Classification
    is therefore done per (rep, customer) within each channel, not per (rep,
    customer, product) as originally built.

    Per Gavin, 2026-08-18: these are NEW-PLACEMENT programs, so no win-back
    / lapsed list is shown -- prior buyers can never re-qualify as "new"
    within the period, so surfacing them as opportunities was misleading.
    Instead the opportunity list is offPremTargets / draftTargets: accounts
    from the rep's customer-base file with ZERO qualifying purchases in
    either period (never bought May-July, hasn't bought yet in the current
    period) -- i.e. still-live new-placement candidates. Caveat (documented
    in README): the customer-base files only cover the six Core Market
    counties, so for an All-Counties brand like 1911/Woodchuck this target
    list covers the rep's Core Market accounts only, not their whole route."""
    rows = read_rows(filename)
    fieldnames = rows[0].keys() if rows else []
    case_base_col, case_current_col = find_period_cols(fieldnames, "Cases")
    place_base_col, place_current_col = find_period_cols(fieldnames, "Placement Count")

    by_rep = {rep: {
        "offPremNew": [], "offPremNewCount": 0,
        "offPremReorderCount": 0,
        "offPremTargets": [], "offPremTargetCount": 0,
        "draftNew": [], "draftNewCount": 0,
        "draftReorderCount": 0,
        "draftTargets": [], "draftTargetCount": 0,
        "draftAccounts": [], "draftAccountsQualified": 0,
        "caseVolume": 0.0,
        "caseVolumeByAccount": [],
        "totalNewPlacements": 0,
    } for rep in ROSTER}

    # Barrel threshold is PER ACCOUNT (per Gavin, 2026-08-05): sum each
    # account's current-period keg volume across all its draft SKUs,
    # keyed by Customer Num alone (not by rep) since the account is the
    # unit the threshold applies to.
    account_bbl = {}
    account_name = {}
    account_rep = {}
    case_by_account = {}  # (rep, cust_num) -> {"customer":..., "cases": float}
    off_by_cust = defaultdict(list)    # (rep, cust_num) -> off-premise rows
    draft_by_cust = defaultdict(list)  # (rep, cust_num) -> draft rows
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        cases = to_num(row[case_current_col])
        by_rep[rep]["caseVolume"] += cases
        if cases > 0:
            acct_key = (rep, row["Customer Num"])
            entry = case_by_account.setdefault(acct_key, {"customer": row["Customer Name"], "cases": 0.0})
            entry["cases"] += cases
        cust_key = (rep, row["Customer Num"])
        if row["Premise"] == "Off Premise":
            off_by_cust[cust_key].append(row)
        elif row["Premise"] == "On Premise" and is_keg_package(row["Package"]):
            draft_by_cust[cust_key].append(row)
            cust = row["Customer Num"]
            bbl_each = keg_bbl(row["Package"]) or 0.0
            account_bbl[cust] = account_bbl.get(cust, 0.0) + bbl_each * cases
            account_name.setdefault(cust, row["Customer Name"])
            account_rep.setdefault(cust, rep)

    for (rep, _cust), info in case_by_account.items():
        if rep not in by_rep:
            continue
        by_rep[rep]["caseVolumeByAccount"].append({"customer": info["customer"], "cases": round(info["cases"], 2)})

    def current_products(krows):
        out = [{"product": r["Product Name"], "date": r["Date"]} for r in krows if r[place_current_col].strip() != ""]
        out.sort(key=lambda e: e["date"] or "", reverse=True)
        return out

    off_classified = classify_by_customer(off_by_cust, place_base_col, place_current_col)
    for cust_key, status in off_classified.items():
        rep, cust_num = cust_key
        krows = off_by_cust[cust_key]
        sample = krows[0]
        if status == "new":
            products = current_products(krows)
            by_rep[rep]["offPremNew"].append({
                "customer": sample["Customer Name"],
                "products": products,
                "date": products[0]["date"] if products else None,
            })
            by_rep[rep]["offPremNewCount"] += 1
        elif status == "reorder":
            by_rep[rep]["offPremReorderCount"] += 1

    draft_classified = classify_by_customer(draft_by_cust, place_base_col, place_current_col)
    for cust_key, status in draft_classified.items():
        rep, cust_num = cust_key
        krows = draft_by_cust[cust_key]
        sample = krows[0]
        if status == "new":
            products = current_products(krows)
            acct_bbl = account_bbl.get(cust_num, 0.0)
            by_rep[rep]["draftNew"].append({
                "customer": sample["Customer Name"],
                "products": products,
                "date": products[0]["date"] if products else None,
                "accountCumulativeBbl": round(acct_bbl, 2),
                "accountQualifies": acct_bbl >= bbl_threshold,
            })
            by_rep[rep]["draftNewCount"] += 1
        elif status == "reorder":
            by_rep[rep]["draftReorderCount"] += 1

    for cust, bbl in account_bbl.items():
        rep = account_rep[cust]
        if rep not in by_rep:
            continue
        by_rep[rep]["draftAccounts"].append({
            "customer": account_name[cust],
            "cumulativeBbl": round(bbl, 2),
            "qualifies": bbl >= bbl_threshold,
        })

    # New-placement targets: customer-base accounts with zero qualifying
    # activity in EITHER period (never bought the base period, hasn't
    # bought yet this period). Sorted by that account's own 2026 all-
    # product case volume as a "worth a pitch" proxy, capped at 20.
    off_prem_base = load_customer_base_by_rep("customer_base_off_prem.csv")
    on_prem_base = load_customer_base_by_rep("customer_base_on_prem.csv")
    for rep, d in by_rep.items():
        off_seen = {c for (r, c) in off_by_cust if r == rep}
        targets = [
            {"customer": info["customer"], "cases2026": round(info["cases2026"], 1)}
            for cust_num, info in off_prem_base.get(rep, {}).items() if cust_num not in off_seen
        ]
        targets.sort(key=lambda a: -a["cases2026"])
        d["offPremTargets"] = targets[:20]
        d["offPremTargetCount"] = len(targets)
        draft_seen = {c for (r, c) in draft_by_cust if r == rep}
        dtargets = [
            {"customer": info["customer"], "cases2026": round(info["cases2026"], 1)}
            for cust_num, info in on_prem_base.get(rep, {}).items() if cust_num not in draft_seen
        ]
        dtargets.sort(key=lambda a: -a["cases2026"])
        d["draftTargets"] = dtargets[:20]
        d["draftTargetCount"] = len(dtargets)

    leaderboard = []
    for rep, d in by_rep.items():
        d["totalNewPlacements"] = d["offPremNewCount"] + d["draftNewCount"]
        d["caseVolume"] = round(d["caseVolume"], 2)
        d["caseVolumeByAccount"].sort(key=lambda a: -a["cases"])
        d["offPremNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["draftNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["draftAccounts"].sort(key=lambda a: -a["cumulativeBbl"])
        d["draftAccountsQualified"] = sum(1 for a in d["draftAccounts"] if a["qualifies"])
        leaderboard.append({"rep": rep, "newPlacements": d["totalNewPlacements"], "caseVolume": d["caseVolume"]})

    leaderboard.sort(key=lambda x: (-x["newPlacements"], -x["caseVolume"]))
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1

    return {"byRep": by_rep, "leaderboard": leaderboard, "bblThreshold": bbl_threshold}


def build_tona():
    rows = read_rows("tona_rewards.csv")
    fieldnames = rows[0].keys() if rows else []
    case_base_col, case_current_col = find_period_cols(fieldnames, "Cases")
    place_base_col, place_current_col = find_period_cols(fieldnames, "Placement Count")

    by_rep = {rep: {
        "new24ozNew": [], "new24ozCount": 0,
        "new24ozReorderCount": 0,
        "targets24oz": [], "targets24ozCount": 0,
        "caseVolume24oz": 0.0, "caseVolumeOther": 0.0,
        "caseVolume24ozByAccount": [], "caseVolumeOtherByAccount": [],
        "qualifies": False,
    } for rep in ROSTER}

    # "New placement" is account-level within the 24oz-can product (per
    # Gavin, 2026-08-17): zero 24oz placement activity in the base period,
    # then activity in the current period, for that customer.
    can24_by_cust = defaultdict(list)
    for row in rows:
        if row["Package"] != "1/12/24oz Can":
            continue
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        can24_by_cust[(rep, row["Customer Num"])].append(row)

    case24_by_account = {}
    caseOther_by_account = {}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        cases = to_num(row[case_current_col])
        is_24oz = row["Package"] == "1/12/24oz Can"
        bucket = case24_by_account if is_24oz else caseOther_by_account
        if is_24oz:
            by_rep[rep]["caseVolume24oz"] += cases
        else:
            by_rep[rep]["caseVolumeOther"] += cases
        if cases > 0:
            acct_key = (rep, row["Customer Num"])
            entry = bucket.setdefault(acct_key, {"customer": row["Customer Name"], "cases": 0.0})
            entry["cases"] += cases

    for (rep, _cust), info in case24_by_account.items():
        if rep in by_rep:
            by_rep[rep]["caseVolume24ozByAccount"].append({"customer": info["customer"], "cases": round(info["cases"], 2)})
    for (rep, _cust), info in caseOther_by_account.items():
        if rep in by_rep:
            by_rep[rep]["caseVolumeOtherByAccount"].append({"customer": info["customer"], "cases": round(info["cases"], 2)})

    can24_classified = classify_by_customer(can24_by_cust, place_base_col, place_current_col)
    for cust_key, status in can24_classified.items():
        rep, cust_num = cust_key
        krows = can24_by_cust[cust_key]
        sample = krows[0]
        if status == "new":
            by_rep[rep]["new24ozNew"].append({
                "customer": sample["Customer Name"],
                "product": sample["Product Name"],
                "date": latest_date(krows, place_current_col),
            })
            by_rep[rep]["new24ozCount"] += 1
        elif status == "reorder":
            by_rep[rep]["new24ozReorderCount"] += 1

    # New-placement targets (same rules as 1911/Woodchuck -- see that
    # docstring): off-prem customer-base accounts with zero 24oz-can
    # activity in either period. Tona is All-Counties, so this covers
    # the rep's Core Market accounts only.
    off_prem_base = load_customer_base_by_rep("customer_base_off_prem.csv")
    for rep, d in by_rep.items():
        seen = {c for (r, c) in can24_by_cust if r == rep}
        targets = [
            {"customer": info["customer"], "cases2026": round(info["cases2026"], 1)}
            for cust_num, info in off_prem_base.get(rep, {}).items() if cust_num not in seen
        ]
        targets.sort(key=lambda a: -a["cases2026"])
        d["targets24oz"] = targets[:20]
        d["targets24ozCount"] = len(targets)

    for rep, d in by_rep.items():
        d["qualifies"] = d["caseVolume24oz"] >= 20
        d["caseVolume24oz"] = round(d["caseVolume24oz"], 2)
        d["caseVolumeOther"] = round(d["caseVolumeOther"], 2)
        d["caseVolume24ozByAccount"].sort(key=lambda a: -a["cases"])
        d["caseVolumeOtherByAccount"].sort(key=lambda a: -a["cases"])
        d["new24ozNew"].sort(key=lambda e: e["date"] or "", reverse=True)

    return {"byRep": by_rep, "qualifierGoal": 20}


def find_single_col(fieldnames, prefix):
    matches = [f for f in fieldnames if f.startswith(prefix + " ")]
    if len(matches) != 1:
        raise ValueError(f"expected 1 column for prefix {prefix!r}, found {matches}")
    return matches[0]


def build_path_to_victory():
    rows = read_rows("path_to_victory.csv")
    fieldnames = rows[0].keys() if rows else []
    units_current_col = find_single_col(fieldnames, "Units")

    by_rep = {rep: {
        "sixPackAccounts": [], "sixPackAccountCount": 0, "sixPackUnits": 0.0,
        "nineteenTwoAccounts": [], "nineteenTwoAccountCount": 0, "nineteenTwoUnits": 0.0,
    } for rep in ROSTER}

    seen_six = {}
    seen_192 = {}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        if row["Product Type"] != "Case Beer":
            continue
        pkg = row["Package"]
        cust_key = (rep, row["Customer Num"])
        if pkg == "4/6/12oz Can":
            by_rep[rep]["sixPackUnits"] += to_num(row[units_current_col])
            if cust_key not in seen_six:
                seen_six[cust_key] = True
                by_rep[rep]["sixPackAccounts"].append({
                    "customer": row["Customer Name"], "date": row["Date"],
                })
        elif pkg == "1/15/19.2oz Can":
            by_rep[rep]["nineteenTwoUnits"] += to_num(row[units_current_col])
            if cust_key not in seen_192:
                seen_192[cust_key] = True
                by_rep[rep]["nineteenTwoAccounts"].append({
                    "customer": row["Customer Name"], "date": row["Date"],
                })

    for rep, d in by_rep.items():
        d["sixPackAccountCount"] = len(d["sixPackAccounts"])
        d["nineteenTwoAccountCount"] = len(d["nineteenTwoAccounts"])
        d["sixPackUnits"] = round(d["sixPackUnits"], 2)
        d["nineteenTwoUnits"] = round(d["nineteenTwoUnits"], 2)

    return {"byRep": by_rep}


def build_sam_adams():
    """Sam Adams Octoberfest Fast Start. Unlike the other programs, this
    file compares the SAME August window year-over-year (8/1-8/31 2025
    vs 8/1-8/31 2026), not a 90-day-non-buy base period -- find_period_cols
    still works since it just sorts the two dated columns chronologically.
    Per Gavin, 2026-08-05: the "double commission if positive" piece has
    no available per-case commission rate to calculate from, so it's
    tracked as a positive/negative flag only, not a dollar figure."""
    rows = read_rows("sam_adams_octoberfest.csv")
    fieldnames = rows[0].keys() if rows else []
    units_last_col, units_this_col = find_period_cols(fieldnames, "Units")

    by_rep = {rep: {
        "allSkuUnitsLastYear": 0.0, "allSkuUnitsThisYear": 0.0, "isPositive": False,
        "octoberfestUnitsLastYear": 0.0, "octoberfestUnitsThisYear": 0.0, "octoberfestGrowth": 0.0,
        "octoberfestByAccount": [],
        "octoberfestByProduct": [],
    } for rep in ROSTER}

    octoberfest_by_account = {}  # (rep, cust_num) -> {"customer":..., "thisYear":0, "lastYear":0}
    # (rep, product name) -> {"thisYear","lastYear","accounts":{cust_num:{...}}} --
    # per Gavin, 2026-08-18 (request 7): the card is organized by product,
    # each product expandable to the accounts driving its YoY number.
    octoberfest_by_product = {}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        last = to_num(row[units_last_col])
        cur = to_num(row[units_this_col])
        by_rep[rep]["allSkuUnitsLastYear"] += last
        by_rep[rep]["allSkuUnitsThisYear"] += cur
        if "Octoberfest" in row["Product Name"]:
            by_rep[rep]["octoberfestUnitsLastYear"] += last
            by_rep[rep]["octoberfestUnitsThisYear"] += cur
            if cur > 0 or last > 0:
                acct_key = (rep, row["Customer Num"])
                entry = octoberfest_by_account.setdefault(acct_key, {"customer": row["Customer Name"], "thisYear": 0.0, "lastYear": 0.0})
                entry["thisYear"] += cur
                entry["lastYear"] += last
                pkey = (rep, row["Product Name"])
                pentry = octoberfest_by_product.setdefault(pkey, {"thisYear": 0.0, "lastYear": 0.0, "accounts": {}})
                pentry["thisYear"] += cur
                pentry["lastYear"] += last
                pacct = pentry["accounts"].setdefault(row["Customer Num"], {"customer": row["Customer Name"], "thisYear": 0.0, "lastYear": 0.0})
                pacct["thisYear"] += cur
                pacct["lastYear"] += last

    for (rep, _cust), info in octoberfest_by_account.items():
        if rep not in by_rep:
            continue
        by_rep[rep]["octoberfestByAccount"].append({
            "customer": info["customer"],
            "unitsThisYear": round(info["thisYear"], 2),
            "unitsLastYear": round(info["lastYear"], 2),
            "growth": round(info["thisYear"] - info["lastYear"], 2),
        })

    for (rep, product), info in octoberfest_by_product.items():
        if rep not in by_rep:
            continue
        accounts = [{
            "customer": a["customer"],
            "unitsThisYear": round(a["thisYear"], 2),
            "unitsLastYear": round(a["lastYear"], 2),
            "growth": round(a["thisYear"] - a["lastYear"], 2),
        } for a in info["accounts"].values()]
        accounts.sort(key=lambda a: -a["unitsThisYear"])
        by_rep[rep]["octoberfestByProduct"].append({
            "product": product,
            "unitsThisYear": round(info["thisYear"], 2),
            "unitsLastYear": round(info["lastYear"], 2),
            "growth": round(info["thisYear"] - info["lastYear"], 2),
            "accounts": accounts,
        })

    for rep, d in by_rep.items():
        d["isPositive"] = d["allSkuUnitsThisYear"] > d["allSkuUnitsLastYear"]
        d["octoberfestGrowth"] = round(d["octoberfestUnitsThisYear"] - d["octoberfestUnitsLastYear"], 2)
        for k in ("allSkuUnitsLastYear", "allSkuUnitsThisYear", "octoberfestUnitsLastYear", "octoberfestUnitsThisYear"):
            d[k] = round(d[k], 2)
        d["octoberfestByAccount"].sort(key=lambda a: -a["unitsThisYear"])
        d["octoberfestByProduct"].sort(key=lambda p: -p["unitsThisYear"])

    return {"byRep": by_rep}


def build_boston_beer():
    """Boston Beer August Draft Blitz. Product Type cleanly separates
    Draft (Keg Beer/Keg Cider) from Package (Case Beer/Case Cider) --
    no premise inference needed. Per Gavin, 2026-08-1x: the "one on-prem
    rep, one off-prem rep" trip bonus can't be split without a rep-channel
    mapping we don't have, so no leaderboard is built -- each rep just
    sees their own points total."""
    rows = read_rows("boston_beer.csv")
    fieldnames = rows[0].keys() if rows else []
    base_col, current_col = find_period_cols(fieldnames, "Placement Count")

    by_rep = {rep: {
        "draftNew": [], "draftNewCount": 0,
        "draftRebuy": [], "draftRebuyCount": 0,
        "draftLapsed": [], "draftLapsedCount": 0,
        "draftWhitespace": [],
        "packageNew": [], "packageNewCount": 0,
        "packageRebuyCount": 0,
        "packageLapsed": [], "packageLapsedCount": 0,
        "packageWhitespace": [],
        "points": 0,
    } for rep in ROSTER}

    # Account-level classification per channel (per Gavin, 2026-08-17): an
    # account already carrying one draft/package SKU that adds a second SKU
    # this period is a rebuy event for that channel, not a new placement --
    # 25/106 draft accounts and 127/195 package accounts in this file carry
    # more than one product, so grouping by (customer, product) as originally
    # built substantially overcounted "new" placements.
    draft_by_cust = defaultdict(list)
    package_by_cust = defaultdict(list)
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        key = (rep, row["Customer Num"])
        if row["Product Type"].startswith("Keg"):
            draft_by_cust[key].append(row)
        elif row["Product Type"].startswith("Case"):
            package_by_cust[key].append(row)

    def current_products(krows):
        out = [{"product": r["Product Name"], "date": r["Date"]} for r in krows if r[current_col].strip() != ""]
        out.sort(key=lambda e: e["date"] or "", reverse=True)
        return out

    draft_classified = classify_by_customer(draft_by_cust, base_col, current_col)
    for cust_key, status in draft_classified.items():
        rep, cust_num = cust_key
        krows = draft_by_cust[cust_key]
        sample = krows[0]
        if status == "lapsed":
            by_rep[rep]["draftLapsed"].append({
                "customer": sample["Customer Name"],
                "product": sample["Product Name"],
                "lastDate": latest_date(krows, base_col),
            })
            by_rep[rep]["draftLapsedCount"] += 1
        elif status == "new":
            products = current_products(krows)
            by_rep[rep]["draftNew"].append({
                "customer": sample["Customer Name"],
                "products": products,
                "date": products[0]["date"] if products else None,
            })
            by_rep[rep]["draftNewCount"] += 1
        elif status == "reorder":
            products = current_products(krows)
            by_rep[rep]["draftRebuy"].append({
                "customer": sample["Customer Name"],
                "products": products,
                "date": products[0]["date"] if products else None,
                "baseDate": period_dates(krows, base_col),
            })
            by_rep[rep]["draftRebuyCount"] += 1

    package_classified = classify_by_customer(package_by_cust, base_col, current_col)
    for cust_key, status in package_classified.items():
        rep, cust_num = cust_key
        krows = package_by_cust[cust_key]
        sample = krows[0]
        if status == "lapsed":
            by_rep[rep]["packageLapsed"].append({
                "customer": sample["Customer Name"],
                "product": sample["Product Name"],
                "lastDate": latest_date(krows, base_col),
            })
            by_rep[rep]["packageLapsedCount"] += 1
        elif status == "new":
            products = current_products(krows)
            by_rep[rep]["packageNew"].append({
                "customer": sample["Customer Name"],
                "products": products,
                "date": products[0]["date"] if products else None,
            })
            by_rep[rep]["packageNewCount"] += 1
        elif status == "reorder":
            by_rep[rep]["packageRebuyCount"] += 1

    # True non-buyer whitespace: Boston Beer's brands are Core-Market-
    # restricted, and the two Sales Reps' Customer Base files are verified
    # complete for those six counties (see load_customer_base_by_rep), so
    # "eligible account with zero purchase history in either period" is a
    # real, defensible list here -- unlike the All-Counties programs.
    on_prem_base = load_customer_base_by_rep("customer_base_on_prem.csv")
    off_prem_base = load_customer_base_by_rep("customer_base_off_prem.csv")
    for rep, d in by_rep.items():
        draft_seen = {c for (r, c) in draft_by_cust if r == rep}
        package_seen = {c for (r, c) in package_by_cust if r == rep}
        draft_ws = [
            {"customer": info["customer"], "cases2026": round(info["cases2026"], 1)}
            for cust_num, info in on_prem_base.get(rep, {}).items() if cust_num not in draft_seen
        ]
        draft_ws.sort(key=lambda a: -a["cases2026"])
        d["draftWhitespace"] = draft_ws[:15]
        package_ws = [
            {"customer": info["customer"], "cases2026": round(info["cases2026"], 1)}
            for cust_num, info in off_prem_base.get(rep, {}).items() if cust_num not in package_seen
        ]
        package_ws.sort(key=lambda a: -a["cases2026"])
        d["packageWhitespace"] = package_ws[:15]

    for rep, d in by_rep.items():
        d["points"] = (d["draftNewCount"] + d["draftRebuyCount"]) * 2 + d["packageNewCount"] * 1
        for k in ("draftNew", "draftRebuy", "packageNew"):
            d[k].sort(key=lambda e: e["date"] or "", reverse=True)
        for k in ("draftLapsed", "packageLapsed"):
            d[k].sort(key=lambda e: e["lastDate"] or "", reverse=True)

    return {"byRep": by_rep}


NEW_BELGIUM_FEATURED = ("juicy haze", "two hearted")
NEW_BELGIUM_OTHER_NAMED = ("voodoo ranger", "fat tire")


def new_belgium_tier(product_name):
    name = product_name.lower()
    if any(t in name for t in NEW_BELGIUM_FEATURED):
        return "featured"
    if any(t in name for t in NEW_BELGIUM_OTHER_NAMED):
        return "other_named"
    return None  # generic New Belgium Brewing Company SKUs -- out of scope per Gavin, 2026-08-1x


def build_new_belgium():
    """New Belgium Draft (Summer Draft Focus). Per Gavin, 2026-08-1x: only
    the named tiers (Juicy Haze/Two Hearted, Voodoo Ranger/Fat Tire)
    count toward anything -- the file's 3 generic "New Belgium Brewing
    Company" SKUs (Ha Chi Keg, House Golden Pilsner, House Hazy IPA) are
    out of scope and will be removed from future pulls, so they're
    skipped here entirely. The 70-POD house goal spans the whole
    May-Aug window (not just August), so it's a distinct-account count
    across both period columns combined, not a new-vs-base comparison --
    the $100/$50 new-vs-rebuy split is a separate, August-only classification."""
    rows = read_rows("new_belgium.csv")
    fieldnames = rows[0].keys() if rows else []
    base_col, current_col = find_period_cols(fieldnames, "Units")

    by_rep = {rep: {
        "featuredNew": [], "featuredNewCount": 0,
        "featuredRebuy": [], "featuredRebuyCount": 0,
        "featuredLapsed": [], "featuredLapsedCount": 0,
        "featuredWhitespace": [],
        "otherNamedKegCount": 0, "otherNamedKegVolumeBbl": 0.0,
        "housePods": 0,
    } for rep in ROSTER}

    key_fields = ["Sales Rep Assigned", "Customer Num", "Product Num"]
    classified, by_key = classify_dual(rows, base_col, current_col, key_fields)

    # Per Gavin, 2026-08-05 (see build_new_belgium_distribution docstring for
    # the same wording): "POD" here is tracked per (customer, product) --
    # explicitly confirmed by the house-goal description ("company-wide count
    # of distinct featured-tier (customer, product) combos"), unlike 1911/
    # Woodchuck/Boston Beer package where "$X per new placement" is a flat,
    # account-level bonus. Do NOT collapse this to customer-level.
    featured_seen_by_rep = defaultdict(set)
    house_pods_total = 0
    for key, status in classified.items():
        rep, cust_num, prod_num = key
        krows = by_key[key]
        sample = krows[0]
        tier = new_belgium_tier(sample["Product Name"])
        if tier is None:
            continue
        if tier == "featured" and rep in by_rep:
            featured_seen_by_rep[rep].add(cust_num)
        if tier == "featured":
            house_pods_total += 1
            if rep in by_rep:
                by_rep[rep]["housePods"] += 1
        if rep not in by_rep:
            continue
        if tier == "featured" and status == "base_only":
            by_rep[rep]["featuredLapsed"].append({
                "customer": sample["Customer Name"],
                "product": sample["Product Name"],
                "lastDate": latest_date(krows, base_col),
                "isHalfBbl": (keg_bbl(sample["Package"]) or 0.0) >= 0.5,
            })
            by_rep[rep]["featuredLapsedCount"] += 1
            continue
        entry = {
            "customer": sample["Customer Name"],
            "product": sample["Product Name"],
            "date": latest_date(krows, current_col),
            "isHalfBbl": (keg_bbl(sample["Package"]) or 0.0) >= 0.5,
        }
        if tier == "featured":
            if status == "new":
                by_rep[rep]["featuredNew"].append(entry)
                by_rep[rep]["featuredNewCount"] += 1
            elif status == "rebuy":
                entry["baseDate"] = period_dates(krows, base_col)
                by_rep[rep]["featuredRebuy"].append(entry)
                by_rep[rep]["featuredRebuyCount"] += 1
        elif tier == "other_named" and status in ("new", "rebuy"):
            by_rep[rep]["otherNamedKegCount"] += 1
            bbl_each = keg_bbl(sample["Package"]) or 0.0
            current_units = sum(to_num(r[current_col]) for r in krows)
            by_rep[rep]["otherNamedKegVolumeBbl"] += bbl_each * current_units

    # True non-buyer whitespace within the featured tier: New Belgium is
    # Core-Market-restricted and draft-only, so customer_base_on_prem.csv is
    # a legitimate complete eligible universe (see load_customer_base_by_rep).
    on_prem_base = load_customer_base_by_rep("customer_base_on_prem.csv")
    for rep, d in by_rep.items():
        seen = featured_seen_by_rep.get(rep, set())
        ws = [
            {"customer": info["customer"], "cases2026": round(info["cases2026"], 1)}
            for cust_num, info in on_prem_base.get(rep, {}).items() if cust_num not in seen
        ]
        ws.sort(key=lambda a: -a["cases2026"])
        d["featuredWhitespace"] = ws[:15]

    for rep, d in by_rep.items():
        d["featuredNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["featuredRebuy"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["featuredLapsed"].sort(key=lambda e: e["lastDate"] or "", reverse=True)
        d["otherNamedKegVolumeBbl"] = round(d["otherNamedKegVolumeBbl"], 2)

    return {"byRep": by_rep, "housePodsTotal": house_pods_total, "houseGoal": 70}


LYTT_TIERS = [(0.75, 2.00, "Lytt-Faced"), (0.50, 1.00, "Lytty City"), (0.25, 0.50, "Gettin' Lytt")]


def build_lytt_launch():
    """Lytt Launch penetration tracking. Per Gavin, 2026-08-1x: the
    Core Off-Prem customer base file is the eligible-account universe --
    confirmed empirically (54 of 55 Lytt-buying accounts across the
    roster are in the off-prem base, only 1 in on-prem), so penetration
    = distinct off-prem accounts buying Lytt / rep's total off-prem
    account count."""
    rows = read_rows("lytt_launch.csv")
    fieldnames = rows[0].keys() if rows else []
    cases_col = find_single_col(fieldnames, "Cases")

    base_rows = read_rows("customer_base_off_prem.csv")
    eligible_by_rep = {}
    for row in base_rows:
        eligible_by_rep.setdefault(row["Sales Rep Assigned"], {})[row["Customer Num"]] = {
            "customer": row["Customer Name"],
            "cases2026": to_num(row.get("Cases   2026", "")),
        }

    by_rep = {rep: {
        "buyingAccounts": [], "buyingAccountCount": 0,
        "eligibleAccountCount": len(eligible_by_rep.get(rep, {})),
        "caseVolume": 0.0,
        "penetrationPct": 0.0, "tier": None, "rate": 0.0,
        "whitespaceAccounts": [],
    } for rep in ROSTER}

    seen = {}
    buying_cust_nums = {}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        by_rep[rep]["caseVolume"] += to_num(row[cases_col])
        cust_key = (rep, row["Customer Num"])
        buying_cust_nums.setdefault(rep, set()).add(row["Customer Num"])
        if cust_key not in seen:
            seen[cust_key] = True
            by_rep[rep]["buyingAccounts"].append({
                "customer": row["Customer Name"], "date": row["Date"],
            })

    # Whitespace: eligible off-prem accounts (the Core Off-Prem customer
    # base -- Lytt is Core Market so this file IS the rep's real eligible
    # universe, unlike All-Counties brands) that have never bought Lytt.
    # Prioritized by each account's own 2026 case volume of OTHER
    # products, as a proxy for "this account moves volume, worth a pitch."
    for rep, eligible in eligible_by_rep.items():
        if rep not in by_rep:
            continue
        bought = buying_cust_nums.get(rep, set())
        whitespace = [
            {"customer": info["customer"], "cases2026": round(info["cases2026"], 1)}
            for cust_num, info in eligible.items() if cust_num not in bought
        ]
        whitespace.sort(key=lambda a: -a["cases2026"])
        # Full list, not top-15: per Gavin, 2026-08-18 (request 9), the rep
        # should be able to open ALL of their remaining eligible accounts
        # ("View 22 remaining accounts") since penetration is the whole game.
        by_rep[rep]["whitespaceAccounts"] = whitespace

    leaderboard = []
    for rep, d in by_rep.items():
        d["buyingAccountCount"] = len(d["buyingAccounts"])
        d["caseVolume"] = round(d["caseVolume"], 2)
        d["penetrationPct"] = round(100.0 * d["buyingAccountCount"] / d["eligibleAccountCount"], 1) if d["eligibleAccountCount"] else 0.0
        for threshold, rate, label in LYTT_TIERS:
            if d["penetrationPct"] / 100.0 >= threshold:
                d["tier"] = label
                d["rate"] = rate
                break
        leaderboard.append({"rep": rep, "penetrationPct": d["penetrationPct"]})

    leaderboard.sort(key=lambda x: -x["penetrationPct"])
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1

    return {"byRep": by_rep, "leaderboard": leaderboard}


FALL_KEG_TIERS = {1.0 / 6.0: ("sixtel", 5.0), 0.5: ("half-keg", 10.0)}


def build_fall_seasonal_bucket(filename, has_units):
    """Shared logic for both Fall Seasonal files -- single-period (Aug
    2026 only), no new-vs-rebuy split. Package rows (Product Type
    starting 'Case') earn $0.50/CE flat; keg rows (Product Type 'Keg
    Beer', packages_and_draft only) are bucketed by size into sixtel
    ($5) / half-keg ($10) per the deck, or an 'other' bucket for sizes
    the deck doesn't name (7.75 Gal quarter-barrel, 13.2 Gal/50L
    European keg -- both appear in this data) -- tracked as volume only,
    no assumed $ rate."""
    rows = read_rows(filename)
    fieldnames = rows[0].keys() if rows else []
    ce_col = find_single_col(fieldnames, "Case Equivalents")
    units_col = find_single_col(fieldnames, "Units") if has_units else None

    by_rep = {rep: {
        "packagePlacements": [], "packagePlacementCount": 0, "packageCaseEquivalents": 0.0,
        "sixtelCount": 0, "sixtelVolumeBbl": 0.0, "sixtelKegs": [],
        "halfKegCount": 0, "halfKegVolumeBbl": 0.0, "halfKegKegs": [],
        "otherKegCount": 0, "otherKegVolumeBbl": 0.0, "otherKegs": [],
    } for rep in ROSTER}

    key_fields = ["Sales Rep Assigned", "Customer Num", "Product Num"]
    by_key = {}
    for row in rows:
        key = tuple(row[k] for k in key_fields)
        by_key.setdefault(key, []).append(row)

    for key, krows in by_key.items():
        rep = key[0]
        if rep not in by_rep:
            continue
        sample = krows[0]
        is_keg = has_units and sample["Product Type"].startswith("Keg")
        if is_keg:
            bbl_each = keg_bbl(sample["Package"]) or 0.0
            unit_count = sum(to_num(r[units_col]) for r in krows)
            keg_volume = round(bbl_each * unit_count, 2)
            keg_entry = {"customer": sample["Customer Name"], "product": sample["Product Name"], "volumeBbl": keg_volume}
            bucket = FALL_KEG_TIERS.get(round(bbl_each, 4))
            if bucket and bucket[0] == "sixtel":
                by_rep[rep]["sixtelCount"] += 1
                by_rep[rep]["sixtelVolumeBbl"] += bbl_each * unit_count
                by_rep[rep]["sixtelKegs"].append(keg_entry)
            elif bucket and bucket[0] == "half-keg":
                by_rep[rep]["halfKegCount"] += 1
                by_rep[rep]["halfKegVolumeBbl"] += bbl_each * unit_count
                by_rep[rep]["halfKegKegs"].append(keg_entry)
            else:
                by_rep[rep]["otherKegCount"] += 1
                by_rep[rep]["otherKegVolumeBbl"] += bbl_each * unit_count
                by_rep[rep]["otherKegs"].append(keg_entry)
        else:
            ce_total = sum(to_num(r[ce_col]) for r in krows)
            by_rep[rep]["packageCaseEquivalents"] += ce_total
            by_rep[rep]["packagePlacements"].append({
                "customer": sample["Customer Name"],
                "product": sample["Product Name"],
                "date": latest_date(krows, ce_col),
                "caseEquivalents": round(ce_total, 2),
            })
            by_rep[rep]["packagePlacementCount"] += 1

    for rep, d in by_rep.items():
        d["packageCaseEquivalents"] = round(d["packageCaseEquivalents"], 2)
        d["sixtelVolumeBbl"] = round(d["sixtelVolumeBbl"], 2)
        d["halfKegVolumeBbl"] = round(d["halfKegVolumeBbl"], 2)
        d["otherKegVolumeBbl"] = round(d["otherKegVolumeBbl"], 2)
        d["packagePlacements"].sort(key=lambda e: e["date"] or "", reverse=True)

    return {"byRep": by_rep}


def build_fall_seasonal():
    return {
        "package_only": build_fall_seasonal_bucket("fall_seasonal_packages_only.csv", has_units=False),
        "packages_and_draft": build_fall_seasonal_bucket("fall_seasonal_packages_and_draft.csv", has_units=True),
    }


SUN_CRUISER_RATE1_GROUPS = {"12pk Can + 8pk Can + 18pk Can", "12oz 24pk Can"}
SUN_CRUISER_RATE3_GROUPS = {"12oz 4pk Can", "Single Serve (19.2oz and 24oz Cans)"}


def build_sun_cruiser():
    """Sun Cruiser Volume. File arrives pre-aggregated (rep + package
    group + product, with a precomputed this-year-vs-last-year case
    difference for the same May-Aug window) -- no per-transaction rows,
    no dual-period classification needed. Per the deck, payout only
    applies to the case growth OVER last year, at a rate set by package
    group ($1: 12/8/18pk and 24pk; $3: 4pk and single-serve 19.2/24oz).
    Per Gavin, 2026-08-1x: rows for Chris Politano/John Neukum/Office
    Tell Sell/Default are dropped since they aren't reps."""
    rows = read_rows("sun_cruiser.csv")

    by_rep = {rep: {
        "rate1CaseGrowth": 0.0, "rate3CaseGrowth": 0.0,
        "rate1Lines": [], "rate3Lines": [],
        "totalCasesThisYear": 0.0, "totalCasesLastYear": 0.0,
    } for rep in ROSTER}

    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        pkg_group = row["Packages"]
        diff = to_num(row["Cases Unit Difference"])
        this_year = to_num(row["Cases   5/1/2026 - 8/31/2026"])
        last_year = to_num(row["Cases   5/1/2025 - 8/31/2025"])
        by_rep[rep]["totalCasesThisYear"] += this_year
        by_rep[rep]["totalCasesLastYear"] += last_year
        if pkg_group in SUN_CRUISER_RATE1_GROUPS:
            bucket, rate = "rate1", 1.0
        elif pkg_group in SUN_CRUISER_RATE3_GROUPS:
            bucket, rate = "rate3", 3.0
        else:
            continue
        if diff > 0:
            by_rep[rep][f"{bucket}CaseGrowth"] += diff
            by_rep[rep][f"{bucket}Lines"].append({
                "product": row["Product Name"], "packages": pkg_group,
                "caseGrowth": round(diff, 2),
            })

    for rep, d in by_rep.items():
        d["rate1CaseGrowth"] = round(d["rate1CaseGrowth"], 2)
        d["rate3CaseGrowth"] = round(d["rate3CaseGrowth"], 2)
        d["totalCasesThisYear"] = round(d["totalCasesThisYear"], 2)
        d["totalCasesLastYear"] = round(d["totalCasesLastYear"], 2)
        d["rate1Lines"].sort(key=lambda e: -e["caseGrowth"])
        d["rate3Lines"].sort(key=lambda e: -e["caseGrowth"])

    return {"byRep": by_rep}


def load_premise_map():
    """Customer Num -> 'On Premise'/'Off Premise', from the two Sales
    Reps' Customer Base files (used wherever a program's own RDE export
    has no Premise column of its own, e.g. Yave)."""
    premise = {}
    for filename, premise_label in [("customer_base_off_prem.csv", "Off Premise"), ("customer_base_on_prem.csv", "On Premise")]:
        for row in read_rows(filename):
            premise[row["Customer Num"]] = premise_label
    return premise


def load_customer_base_by_rep(filename):
    """{rep: {cust_num: {"customer":..., "cases2026": float}}} from one of
    the Sales Reps' Customer Base files. NOTE: both customer base files are
    pre-filtered to the six Core Market counties only (Bergen, Passaic,
    Passaic-FF, Sussex, Morris 1, Morris 3) -- verified 2026-08-10, neither
    file contains a single non-Core-Market county. That makes this a
    legitimate complete eligible-account universe for Core-Market-restricted
    brands (Boston Beer, New Belgium, Sam Adams, Sun Cruiser, Lytt), but it
    is NOT a complete route universe for All-Counties brands (1911,
    Woodchuck, Tona, Molly's, Yave) -- those reps have real accounts outside
    these four counties that simply aren't in this file, so it cannot be
    used to build a "true non-buyer" whitespace list for those programs."""
    by_rep = {}
    for row in read_rows(filename):
        by_rep.setdefault(row["Sales Rep Assigned"], {})[row["Customer Num"]] = {
            "customer": row["Customer Name"],
            "cases2026": to_num(row.get("Cases   2026", "")),
        }
    return by_rep


# Per kohler_brands_whitelist_blacklist.xlsx ("Blackout Brand Fam Areas
# (Enc)" sheet, 2026-08-10 pull): every brand family used by boston_beer,
# sam_adams, new_belgium, new_belgium_distribution, and sun_cruiser is
# tagged "Core Market" territory in the workbook's "Brand Family
# Territory (Enc)" sheet (Angry Orchard, Dogfish Head Beer, Samuel
# Adams, Bell's/Bell's Hearted Family/Kirin Ichiban/Kirin Light/Voodoo
# Family, Sun Cruiser), and every Core Market brand is blacked out in
# the exact same six counties: Essex, Hudson, Middlesex, Morris 2,
# Rockland, Union -- i.e. authorized ONLY in Bergen, Passaic,
# Passaic-FF, Sussex, Morris 1, Morris 3. Reference file kept for audit
# only (not parsed programmatically -- same "reference only" treatment
# as MPOs/on-prem's copy of this same workbook), because both
# customer_base_off_prem.csv and customer_base_on_prem.csv are already
# pre-filtered to exactly that six-area Core Market set (verified
# 2026-08-10: neither file contains a single non-Core-Market county),
# so a rep's mere presence in either file already proves they have a
# Core Market account. lytt was added 2026-08-10 per Gavin directly
# ("Lytt is core market (Boston Beer Company brand)") -- Lytt doesn't
# appear anywhere in the whitelist workbook itself (too new to have
# been added to Kohler's tracker), so this one entry is NOT verified
# against the workbook the way the other five are; it's taken on
# Gavin's word. 1911, Woodchuck, Molly's, and both Garage Beer programs
# are "All Counties" territory (no blackout at all) and are not in this
# set. Tona and YaVe Tequila were also confirmed "All 7 counties" by
# Gavin, 2026-08-10 (i.e. no blackout) -- also not in this set, and no
# longer an open question.
CORE_MARKET_PROGRAMS = {"boston_beer", "sam_adams", "new_belgium", "new_belgium_distribution", "sun_cruiser", "lytt"}


def load_core_market_reps():
    """Reps with at least one account in a Core Market county -- see
    CORE_MARKET_PROGRAMS docstring above for why simple presence in
    either customer-base file is sufficient."""
    reps = set()
    for filename in ("customer_base_off_prem.csv", "customer_base_on_prem.csv"):
        for row in read_rows(filename):
            reps.add(row["Sales Rep Assigned"])
    return reps


def build_yave():
    """Yave Tequila Launch. Single-period file (7/1-8/31, no base
    period) -- like Path to Victory, there's no way to split new-POD
    from rebuy from this file alone, so this tracks raw per-channel
    account activity against the deck's milestone tiers rather than
    asserting new-vs-rebuy. No Premise column either, so premise comes
    from cross-referencing the Sales Reps' Customer Base files (all 20
    Yave accounts resolved cleanly: 11 off-premise, 9 on-premise).
    Per the deck: on-premise "1 POD = 2 bottles" (tiers at 1 and 2
    qualifying accounts), off-premise "1 POD = 1 case/6-pack" (tiers at
    1, 3, and 5 qualifying accounts)."""
    rows = read_rows("yave.csv")
    fieldnames = rows[0].keys() if rows else []
    units_col = find_single_col(fieldnames, "Units")
    cases_col = find_single_col(fieldnames, "Cases")
    premise_map = load_premise_map()

    by_rep = {rep: {
        "onPremAccounts": [], "onPremAccountCount": 0, "onPremBottles": 0.0,
        "offPremAccounts": [], "offPremAccountCount": 0, "offPremCases": 0.0,
        "unclassifiedAccountCount": 0,
    } for rep in ROSTER}

    key_fields = ["Sales Rep Assigned", "Customer Num"]
    by_key = {}
    for row in rows:
        key = tuple(row[k] for k in key_fields)
        by_key.setdefault(key, []).append(row)

    for key, krows in by_key.items():
        rep, cust_num = key
        if rep not in by_rep:
            continue
        sample = krows[0]
        units_total = sum(to_num(r[units_col]) for r in krows)
        cases_total = sum(to_num(r[cases_col]) for r in krows)
        premise = premise_map.get(cust_num)
        entry = {
            "customer": sample["Customer Name"],
            "date": latest_date(krows, units_col),
        }
        if premise == "On Premise":
            by_rep[rep]["onPremBottles"] += units_total
            if units_total >= 2:
                entry["bottles"] = round(units_total, 2)
                by_rep[rep]["onPremAccounts"].append(entry)
        elif premise == "Off Premise":
            by_rep[rep]["offPremCases"] += cases_total
            if cases_total >= 1:
                entry["cases"] = round(cases_total, 2)
                by_rep[rep]["offPremAccounts"].append(entry)
        else:
            by_rep[rep]["unclassifiedAccountCount"] += 1

    for rep, d in by_rep.items():
        d["onPremAccountCount"] = len(d["onPremAccounts"])
        d["offPremAccountCount"] = len(d["offPremAccounts"])
        d["onPremBottles"] = round(d["onPremBottles"], 2)
        d["offPremCases"] = round(d["offPremCases"], 2)
        d["onPremAccounts"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["offPremAccounts"].sort(key=lambda e: e["date"] or "", reverse=True)

    return {"byRep": by_rep}


def build_mollys():
    """Molly's 1.75L. Same dual-period shape as 1911/Woodchuck (base
    period 4/1-6/30 = the '90 Day Unsold' qualifier window, current
    period 7/1-8/31): $50 new POD, $10/case rebuy. No on/off-premise
    split in the deck for this program."""
    rows = read_rows("mollys.csv")
    fieldnames = rows[0].keys() if rows else []
    place_base_col, place_current_col = find_period_cols(fieldnames, "Placement Count")
    case_base_col, case_current_col = find_period_cols(fieldnames, "Cases")

    by_rep = {rep: {
        "newPod": [], "newPodCount": 0,
        "rebuy": [], "rebuyCount": 0, "rebuyCaseVolume": 0.0,
        "lapsed": [], "lapsedCount": 0,
    } for rep in ROSTER}

    key_fields = ["Sales Rep Assigned", "Customer Num", "Product Num"]
    classified, by_key = classify_dual(rows, place_base_col, place_current_col, key_fields)

    for key, status in classified.items():
        rep = key[0]
        if rep not in by_rep:
            continue
        krows = by_key[key]
        sample = krows[0]
        if status == "base_only":
            by_rep[rep]["lapsed"].append({
                "customer": sample["Customer Name"],
                "lastDate": latest_date(krows, place_base_col),
            })
            by_rep[rep]["lapsedCount"] += 1
            continue
        entry = {
            "customer": sample["Customer Name"],
            "date": latest_date(krows, place_current_col),
        }
        if status == "new":
            by_rep[rep]["newPod"].append(entry)
            by_rep[rep]["newPodCount"] += 1
        elif status == "rebuy":
            case_vol = sum(to_num(r[case_current_col]) for r in krows)
            entry["cases"] = round(case_vol, 2)
            entry["baseDate"] = period_dates(krows, place_base_col)
            by_rep[rep]["rebuy"].append(entry)
            by_rep[rep]["rebuyCount"] += 1
            by_rep[rep]["rebuyCaseVolume"] += case_vol

    for rep, d in by_rep.items():
        d["rebuyCaseVolume"] = round(d["rebuyCaseVolume"], 2)
        d["newPod"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["rebuy"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["lapsed"].sort(key=lambda e: e["lastDate"] or "", reverse=True)

    return {"byRep": by_rep}


def build_garage_beer_summer_sequel():
    """Garage Beer Summer Sequel -- volume-push tiers only (no account/
    product-level data in this file, so the draft bonus and iSellBeer
    feature components aren't built). File gives each rep their OWN
    individual Tiered/Bonus/Super Bonus CE goals (not a single
    company-wide number) plus their current-period Case Equiv.
    Data quality note: the file is sorted by Case Equiv descending and
    its first data row (nominally "Shane Barreca", CE 5152.07) is a
    mislabeled grand-total row -- that value matches the sum of every
    other rep's CE almost exactly, and is wildly inconsistent with
    Shane Barreca's own real row further down (CE 226.92, matching his
    goals of 168/203/227). When a rep name appears twice, the larger
    value is dropped as the total-row artifact."""
    rows = read_rows("garage_beer_summer_sequel.csv")
    by_name_rows = {}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        by_name_rows.setdefault(rep, []).append(row)

    by_rep = {rep: {
        "caseEquiv": 0.0, "tieredGoal": None, "bonusGoal": None, "superBonusGoal": None,
        "tier": None,
    } for rep in ROSTER}

    for rep, rrows in by_name_rows.items():
        if rep not in by_rep:
            continue
        row = min(rrows, key=lambda r: to_num(r["Case Equiv   6/1/2026 - 8/31/2026"]))
        ce = to_num(row["Case Equiv   6/1/2026 - 8/31/2026"])
        tiered = to_num(row["Tiered Goal   6/1/2026 - 8/31/2026"]) if row["Tiered Goal   6/1/2026 - 8/31/2026"].strip() else None
        bonus = to_num(row["Bonus Goal   6/1/2026 - 8/31/2026"]) if row["Bonus Goal   6/1/2026 - 8/31/2026"].strip() else None
        super_bonus = to_num(row["Super Bonus Goal   6/1/2026 - 8/31/2026"]) if row["Super Bonus Goal   6/1/2026 - 8/31/2026"].strip() else None
        by_rep[rep]["caseEquiv"] = round(ce, 2)
        by_rep[rep]["tieredGoal"] = tiered
        by_rep[rep]["bonusGoal"] = bonus
        by_rep[rep]["superBonusGoal"] = super_bonus
        if super_bonus is not None and ce >= super_bonus:
            by_rep[rep]["tier"] = "Super Bonus"
        elif bonus is not None and ce >= bonus:
            by_rep[rep]["tier"] = "Bonus"
        elif tiered is not None and ce >= tiered:
            by_rep[rep]["tier"] = "Tiered"

    return {"byRep": by_rep}


def build_garage_beer_president():
    """Garage Beer President's Incentive -- $1.00/CE over last year,
    once the company-wide total crosses 9,305 CE (Jun-Sep per the
    deck). Sourced from the year-over-year Comparison export: its
    "Total"/"Garage Beer" rows give the company-wide current CE
    directly, and its precomputed +/- column gives each rep's CE
    growth over last year. Rows whose first column isn't a roster name
    (Total, Garage Beer, John Neukum, Default) are skipped."""
    rows = read_rows("garage_beer_president_comparison.csv")
    key = "Supplier / Sales Rep Assigned"

    company_total_this_year = 0.0
    for row in rows:
        if row[key] == "Garage Beer":
            company_total_this_year = to_num(row["Case Equiv 6/1/2026 - 9/30/2026"])
            break

    by_rep = {rep: {"caseGrowthOverLastYear": 0.0} for rep in ROSTER}
    for row in rows:
        rep = row[key]
        if rep not in by_rep:
            continue
        growth = to_num(row["Case Equiv 6/1/2026 - 9/30/2026"]) - to_num(row["Case Equiv 6/1/2025 - 9/30/2025"])
        by_rep[rep]["caseGrowthOverLastYear"] = round(growth, 2)

    return {"byRep": by_rep, "companyTotalThisYear": round(company_total_this_year, 2), "houseGoal": 9305}


NEW_BELGIUM_DIST_BRANDS = ["Bell's", "Bell's Hearted Family", "Kirin Ichiban", "Kirin Light", "Voodoo Family"]


def build_new_belgium_distribution():
    """New Belgium Distribution -- Push Volume phase only. The deck's
    full program is Achieve (May-Jun) / Push Volume (Jul-Aug) / Retain
    (Sep-Oct), but the Achieve and Retain phases need brand-specific
    distribution-goal numbers we don't have -- only Push Volume is
    buildable from this file.

    This file's own periods are May-Jul 2026 (base) vs Aug 2026
    (current), NOT a year-over-year comparison. Aug is also a partial,
    in-progress month (this file was pulled ~5 days into August), so
    comparing full Aug against the 3-month base would show a misleading
    decline every time. Instead this tracks raw Case Equivalents sold
    during the Aug push window per core brand family, with the base
    period's monthly average shown only as a reference rate, not a
    growth/goal figure.

    Per Gavin, 2026-08-1x: Chris Politano/John Neukum/Office Tell
    Sell/Default rows are dropped as elsewhere."""
    rows = read_rows("new_belgium_distribution_push_volume.csv")
    fieldnames = rows[0].keys() if rows else []
    base_col, current_col = find_period_cols(fieldnames, "Case Equivalents")

    def blank_brands():
        return {b: {"label": b, "pushVolumeCE": 0.0, "baseMonthlyAvgCE": 0.0} for b in NEW_BELGIUM_DIST_BRANDS}

    by_rep = {rep: {
        "pushVolumeCE": 0.0, "baseMonthlyAvgCE": 0.0,
        "brands": blank_brands(), "lines": [],
    } for rep in ROSTER}

    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        brand = row["Brand Family"]
        if brand not in NEW_BELGIUM_DIST_BRANDS:
            continue
        cur = to_num(row[current_col])
        base_monthly = to_num(row[base_col]) / 3.0
        d = by_rep[rep]
        d["pushVolumeCE"] += cur
        d["baseMonthlyAvgCE"] += base_monthly
        d["brands"][brand]["pushVolumeCE"] += cur
        d["brands"][brand]["baseMonthlyAvgCE"] += base_monthly
        if cur > 0:
            d["lines"].append({
                "customer": row["Customer Name"], "product": row["Product Name"],
                "brand": brand, "caseEquivalents": round(cur, 2), "date": row["Date"],
            })

    for rep, d in by_rep.items():
        d["pushVolumeCE"] = round(d["pushVolumeCE"], 2)
        d["baseMonthlyAvgCE"] = round(d["baseMonthlyAvgCE"], 2)
        for b in d["brands"].values():
            b["pushVolumeCE"] = round(b["pushVolumeCE"], 2)
            b["baseMonthlyAvgCE"] = round(b["baseMonthlyAvgCE"], 2)
        d["brands"] = [d["brands"][b] for b in NEW_BELGIUM_DIST_BRANDS]
        d["lines"].sort(key=lambda e: -e["caseEquivalents"])

    return {"byRep": by_rep}


def main():
    data = {
        "1911": build_1911_or_woodchuck("1911_rewards.csv", bbl_threshold=2.0),
        "woodchuck": build_1911_or_woodchuck("woodchuck_rewards.csv", bbl_threshold=3.0),
        "tona": build_tona(),
        "path_to_victory": build_path_to_victory(),
        "sam_adams": build_sam_adams(),
        "boston_beer": build_boston_beer(),
        "new_belgium": build_new_belgium(),
        "lytt": build_lytt_launch(),
        "fall_seasonal": build_fall_seasonal(),
        "sun_cruiser": build_sun_cruiser(),
        "yave": build_yave(),
        "mollys": build_mollys(),
        "garage_beer_summer_sequel": build_garage_beer_summer_sequel(),
        "garage_beer_president": build_garage_beer_president(),
        "new_belgium_distribution": build_new_belgium_distribution(),
    }

    for key in ("1911", "woodchuck"):
        for rep, d in data[key]["byRep"].items():
            d["totalNewPlacements"] = d["offPremNewCount"] + d["draftNewCount"]

    core_market_reps = load_core_market_reps()
    for key in CORE_MARKET_PROGRAMS:
        for rep, d in data[key]["byRep"].items():
            d["territoryEligible"] = rep in core_market_reps
    ineligible_counts = {key: sum(1 for d in data[key]["byRep"].values() if not d["territoryEligible"]) for key in CORE_MARKET_PROGRAMS}
    print(f"territory blackout: {ineligible_counts} reps marked ineligible (no Core Market account) per Core-Market-restricted program")

    for key in ("1911", "woodchuck"):
        total_new = sum(d["totalNewPlacements"] for d in data[key]["byRep"].values())
        print(f"{key}: {total_new} total new placements across roster")
    print(f"tona: {sum(d['new24ozCount'] for d in data['tona']['byRep'].values())} total new 24oz placements")
    print(f"path_to_victory: {sum(d['sixPackAccountCount'] for d in data['path_to_victory']['byRep'].values())} accounts w/ 6pk activity, "
          f"{sum(d['nineteenTwoAccountCount'] for d in data['path_to_victory']['byRep'].values())} accounts w/ 19.2oz activity")
    print(f"sam_adams: {sum(1 for d in data['sam_adams']['byRep'].values() if d['isPositive'])} reps positive YoY, "
          f"{sum(d['octoberfestGrowth'] for d in data['sam_adams']['byRep'].values() if d['octoberfestGrowth']>0):.0f} total positive Octoberfest case growth")
    print(f"boston_beer: {sum(d['draftNewCount'] for d in data['boston_beer']['byRep'].values())} new draft PODs, "
          f"{sum(d['draftRebuyCount'] for d in data['boston_beer']['byRep'].values())} draft rebuys, "
          f"{sum(d['packageNewCount'] for d in data['boston_beer']['byRep'].values())} new package placements")
    print(f"new_belgium: {data['new_belgium']['housePodsTotal']} / {data['new_belgium']['houseGoal']} house PODs (featured tier)")
    top_lytt = max(data['lytt']['byRep'].values(), key=lambda d: d['penetrationPct'])
    print(f"lytt: top penetration {top_lytt['penetrationPct']}%, "
          f"{sum(1 for d in data['lytt']['byRep'].values() if d['tier'])} reps in a tier")
    po = data['fall_seasonal']['package_only']['byRep']
    pd_ = data['fall_seasonal']['packages_and_draft']['byRep']
    print(f"fall_seasonal package_only: {sum(d['packageCaseEquivalents'] for d in po.values()):.1f} total CE")
    print(f"fall_seasonal packages_and_draft: {sum(d['packageCaseEquivalents'] for d in pd_.values()):.1f} total CE, "
          f"{sum(d['sixtelCount'] for d in pd_.values())} sixtels, {sum(d['halfKegCount'] for d in pd_.values())} half-kegs, "
          f"{sum(d['otherKegCount'] for d in pd_.values())} other-size kegs")
    print(f"sun_cruiser: {sum(d['rate1CaseGrowth'] for d in data['sun_cruiser']['byRep'].values()):.0f} rate-1 case growth, "
          f"{sum(d['rate3CaseGrowth'] for d in data['sun_cruiser']['byRep'].values()):.0f} rate-3 case growth")
    print(f"yave: {sum(d['onPremAccountCount'] for d in data['yave']['byRep'].values())} on-prem accounts, "
          f"{sum(d['offPremAccountCount'] for d in data['yave']['byRep'].values())} off-prem accounts, "
          f"{sum(d['unclassifiedAccountCount'] for d in data['yave']['byRep'].values())} unclassified")
    print(f"mollys: {sum(d['newPodCount'] for d in data['mollys']['byRep'].values())} new PODs, "
          f"{sum(d['rebuyCount'] for d in data['mollys']['byRep'].values())} rebuys")
    print(f"garage_beer_summer_sequel: {sum(1 for d in data['garage_beer_summer_sequel']['byRep'].values() if d['tier'])} reps in a tier")
    print(f"garage_beer_president: {data['garage_beer_president']['companyTotalThisYear']} / {data['garage_beer_president']['houseGoal']} house CE")
    print(f"new_belgium_distribution: {sum(d['pushVolumeCE'] for d in data['new_belgium_distribution']['byRep'].values()):.0f} total Aug push-volume CE")

    payload = json.dumps(data, indent=2)
    html = INDEX_HTML.read_text()
    start_marker = "/* PROGRAM_DATA_START */"
    end_marker = "/* PROGRAM_DATA_END */"
    start = html.index(start_marker) + len(start_marker)
    end = html.index(end_marker)
    html = html[:start] + f"\nconst PROGRAM_DATA = {payload};\n" + html[end:]

    today = datetime.date.today().strftime("%b %-d, %Y")
    date_start_marker = "<!-- DATA_REFRESHED_START -->"
    date_end_marker = "<!-- DATA_REFRESHED_END -->"
    date_start = html.index(date_start_marker) + len(date_start_marker)
    date_end = html.index(date_end_marker)
    html = html[:date_start] + today + html[date_end:]

    INDEX_HTML.write_text(html)
    print(f"Wrote PROGRAM_DATA into index.html, stamped Data Refreshed as {today}")


if __name__ == "__main__":
    main()
