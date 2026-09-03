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
    # bought yet this period). Since 2026-08-18 these come from the FULL
    # route universe (customer_base_full.csv, all counties -- 1911 and
    # Woodchuck are All-Counties brands), and draft targets only include
    # accounts whose Draft Package flag says they can actually buy kegs.
    for rep, d in by_rep.items():
        off_seen = {c for (r, c) in off_by_cust if r == rep}
        d["offPremTargets"], d["offPremTargetCount"] = targets_from(
            base_accounts(rep, premise="Off Premise"), off_seen)
        draft_seen = {c for (r, c) in draft_by_cust if r == rep}
        d["draftTargets"], d["draftTargetCount"] = targets_from(
            base_accounts(rep, premise="On Premise", draft=True), draft_seen)

    leaderboard = []
    for rep, d in by_rep.items():
        d["totalNewPlacements"] = d["offPremNewCount"] + d["draftNewCount"]
        # Draft channel applicability: a rep with no keg-capable on-premise
        # accounts anywhere on their route (and no draft activity in the
        # data) can't work the draft side of this program at all.
        d["draftChannelOk"] = (d["draftTargetCount"] > 0 or len(d["draftAccounts"]) > 0
                               or d["draftNewCount"] > 0 or d["draftReorderCount"] > 0)
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
    # docstring): off-prem accounts with zero 24oz-can activity in either
    # period, from the FULL route universe (Tona is All-Counties).
    for rep, d in by_rep.items():
        seen = {c for (r, c) in can24_by_cust if r == rep}
        d["targets24oz"], d["targets24ozCount"] = targets_from(
            base_accounts(rep, premise="Off Premise"), seen)

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

    # True non-buyer whitespace, from the full customer base filtered to
    # Core Market (Boston Beer is Core-Market-restricted): draft targets
    # additionally require the account's Draft Package flag to allow kegs
    # -- no point sending a rep to pitch a $100 POD at a package-only bar.
    # The channel flags grey out a whole section for reps whose route
    # structurally can't work it (e.g. no keg-capable Core Market
    # on-premise accounts).
    for rep, d in by_rep.items():
        draft_seen = {c for (r, c) in draft_by_cust if r == rep}
        package_seen = {c for (r, c) in package_by_cust if r == rep}
        draft_capable = base_accounts(rep, premise="On Premise", core=True, draft=True)
        d["draftWhitespace"], _ = targets_from(draft_capable, draft_seen, cap=15)
        core_off = base_accounts(rep, premise="Off Premise", core=True)
        d["packageWhitespace"], _ = targets_from(core_off, package_seen, cap=15)
        d["draftChannelOk"] = (len(draft_capable) > 0 or d["draftNewCount"] > 0
                               or d["draftRebuyCount"] > 0 or d["draftLapsedCount"] > 0)
        d["packageChannelOk"] = (len(core_off) > 0 or d["packageNewCount"] > 0
                                 or d["packageRebuyCount"] > 0 or d["packageLapsedCount"] > 0)

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

    # True non-buyer whitespace within the featured tier: Core Market
    # on-premise accounts whose Draft Package flag allows kegs. The same
    # set drives draftEligible -- this program is 100% kegs, so a rep with
    # zero keg-capable Core Market on-premise accounts (and no draft
    # activity in the data) can't participate at all and gets a greyed
    # card, same treatment as the territory blackout (per Gavin,
    # 2026-08-18, the "Dave Ehlers" class of case).
    for rep, d in by_rep.items():
        seen = featured_seen_by_rep.get(rep, set())
        draft_capable = base_accounts(rep, premise="On Premise", core=True, draft=True)
        d["featuredWhitespace"], _ = targets_from(draft_capable, seen, cap=15)
        d["draftCapableCount"] = len(draft_capable)
        d["draftEligible"] = (len(draft_capable) > 0 or d["featuredNewCount"] > 0
                              or d["featuredRebuyCount"] > 0 or d["otherNamedKegCount"] > 0)
        # Generic whole-program flag the leaderboards key off (same idea as
        # territoryEligible): false = this rep can't participate at all.
        d["programEligible"] = d["draftEligible"]

    for rep, d in by_rep.items():
        d["featuredNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["featuredRebuy"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["featuredLapsed"].sort(key=lambda e: e["lastDate"] or "", reverse=True)
        d["otherNamedKegVolumeBbl"] = round(d["otherNamedKegVolumeBbl"], 2)

    return {"byRep": by_rep, "housePodsTotal": house_pods_total, "houseGoal": 70}


LYTT_TIERS = [(0.75, 2.00, "Lytt-Faced"), (0.50, 1.00, "Lytty City"), (0.25, 0.50, "Gettin' Lytt")]
# An account only counts toward penetration once it carries this many DISTINCT
# Lytt products (per Gavin, 2026-08-26 -- the same rule applied to the off-prem
# MPO tracker's "Achieve Distro Lytt 25% of Account Base" the same day, applied
# here on his follow-up "apply that same methodology to the lytt incentive").
# Distinct Product Num, not rows: the same SKU reordered three times is one SKU.
LYTT_MIN_SKUS = 3


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

    # Eligible universe (penetration denominator): Core Market off-premise
    # accounts, from the full customer base (switched from the legacy
    # customer_base_off_prem.csv on 2026-08-18 -- same six-county universe,
    # fresher pull, one consistent source).
    eligible_by_rep = {}
    for rep, accounts in load_customer_base_full().items():
        for cust_num, info in accounts.items():
            if info["premise"] == "Off Premise" and info["core"]:
                eligible_by_rep.setdefault(rep, {})[cust_num] = {
                    "customer": info["customer"],
                    "cases2026": info["cases2026"],
                }

    by_rep = {rep: {
        "buyingAccounts": [], "buyingAccountCount": 0,
        "eligibleAccountCount": len(eligible_by_rep.get(rep, {})),
        "caseVolume": 0.0,
        "penetrationPct": 0.0, "tier": None, "rate": 0.0,
        "whitespaceAccounts": [], "partialAccounts": [], "minSkus": LYTT_MIN_SKUS,
    } for rep in ROSTER}

    # An account's SKU count decides whether it counts at all (LYTT_MIN_SKUS),
    # so gather the accounts first and only split them into counting vs short
    # once every row has been read.
    acct_rows = {}
    buying_cust_nums = {}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        by_rep[rep]["caseVolume"] += to_num(row[cases_col])
        cust_key = (rep, row["Customer Num"])
        buying_cust_nums.setdefault(rep, set()).add(row["Customer Num"])
        acct = acct_rows.get(cust_key)
        if acct is None:
            acct = acct_rows[cust_key] = {
                "customer": row["Customer Name"], "date": row["Date"], "skus": set(),
            }
        acct["skus"].add(row["Product Num"])

    # Accounts carrying Lytt but under the SKU bar don't count toward
    # penetration, and they are NOT whitespace either (whitespace is accounts
    # that never bought). They'd vanish from the card entirely if they weren't
    # tracked separately -- and they are the cheapest accounts a rep can
    # convert, needing one or two more SKUs rather than a cold sell.
    for (rep, _cust), acct in acct_rows.items():
        skus = len(acct["skus"])
        entry = {"customer": acct["customer"], "date": acct["date"], "skus": skus}
        if skus >= LYTT_MIN_SKUS:
            by_rep[rep]["buyingAccounts"].append(entry)
        else:
            entry["need"] = LYTT_MIN_SKUS - skus
            by_rep[rep]["partialAccounts"].append(entry)
    for d in by_rep.values():
        d["partialAccounts"].sort(key=lambda a: (-a["skus"], a["customer"]))

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
        # Lytt is an off-premise penetration program: a rep with zero
        # eligible off-premise accounts (and no Lytt buyers) has no
        # denominator and structurally can't participate -- greyed card,
        # excluded from the leaderboard (per Gavin, 2026-08-18, same
        # route-based treatment as the draft programs).
        # Carrying ANY Lytt keeps a rep in the program, even if none of those
        # accounts clears LYTT_MIN_SKUS yet -- buyingAccountCount alone would
        # flip a rep with only 1-2 SKU accounts to the "Not Applicable" card
        # and hide the very list telling them what to do about it.
        d["programEligible"] = (len(eligible_by_rep.get(rep, {})) > 0
                                or d["buyingAccountCount"] > 0
                                or len(d["partialAccounts"]) > 0)
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
    """Customer Num -> 'On Premise'/'Off Premise' (used wherever a
    program's own RDE export has no Premise column, e.g. Yave). Legacy
    Core-Market files first, then the full customer base overlays them --
    the full file wins and also covers non-Core-Market accounts."""
    premise = {}
    for filename, premise_label in [("customer_base_off_prem.csv", "Off Premise"), ("customer_base_on_prem.csv", "On Premise")]:
        for row in read_rows(filename):
            premise[row["Customer Num"]] = premise_label
    for accounts in load_customer_base_full().values():
        for cust_num, info in accounts.items():
            premise[cust_num] = info["premise"]
    return premise


# --- Full-route customer base (customer_base_full.csv, added 2026-08-18) ---
# "Sales Reps' Customer Base 4" from Gavin: the COMPLETE account book for
# every rep -- all counties (including the blackout ones), both premises --
# unlike the two legacy customer_base_{off,on}_prem.csv files, which are
# pre-filtered to the six Core Market counties. This file supersedes them
# as the eligibility/target universe. Two columns drive everything:
#   Area ("Bergen", "Morris 1", "Morris 2", ...) -- disambiguates Morris
#     1/3 (Core Market) from Morris 2 (blackout), which the County column
#     alone cannot. A handful of rows carry Area "Sales" (an internal
#     grouping, not a distribution area); those fall back to County, where
#     Bergen/Passaic/Sussex are unambiguously Core Market.
#   Draft Package -- per Gavin, 2026-08-18: values starting "1)" or "2)"
#     mean the account CAN purchase kegs/draft; "3) Package Only" means it
#     cannot. This is the signal for greying out draft incentives for reps
#     whose routes have no keg-capable accounts (e.g. Jayson Romine and
#     Shane Barreca have zero on-premise accounts at all).
CORE_MARKET_AREAS = {"Bergen", "Passaic", "Passaic-FF", "Sussex", "Morris 1", "Morris 3"}
BLACKOUT_AREAS = {"Essex", "Hudson", "Union", "Morris 2", "Middlesex County", "Middlesex not in use", "Rockland"}
CORE_FALLBACK_COUNTIES = {"Bergen", "Passaic", "Sussex"}


def is_draft_capable(value):
    return (value or "").strip()[:1] in ("1", "2")


def _row_is_core_market(row):
    area = row["Area"].strip()
    if area in CORE_MARKET_AREAS:
        return True
    if area in BLACKOUT_AREAS:
        return False
    # Non-distribution-area values ("Sales"): fall back to the county.
    # Morris county is left non-core here since it can't be split 1/2/3
    # without an Area value (no such rows exist in the current file).
    return row["County"].strip() in CORE_FALLBACK_COUNTIES


_FULL_BASE_CACHE = None


def load_customer_base_full():
    """{rep: {cust_num: {"customer","premise","core","draft","cases2026"}}}
    from customer_base_full.csv (cached -- several builders share it)."""
    global _FULL_BASE_CACHE
    if _FULL_BASE_CACHE is None:
        by_rep = {}
        for row in read_rows("customer_base_full.csv"):
            by_rep.setdefault(row["Sales Rep Assigned"], {})[row["Customer Num"]] = {
                "customer": row["Customer Name"],
                "premise": row["Premise"],
                "core": _row_is_core_market(row),
                "draft": is_draft_capable(row["Draft Package"]),
                "cases2026": to_num(row.get("Cases   2026", "")),
            }
        _FULL_BASE_CACHE = by_rep
    return _FULL_BASE_CACHE


def base_accounts(rep, premise=None, core=None, draft=None):
    """Filtered view of one rep's full-base accounts."""
    out = {}
    for cust_num, info in load_customer_base_full().get(rep, {}).items():
        if premise is not None and info["premise"] != premise:
            continue
        if core is not None and info["core"] != core:
            continue
        if draft is not None and info["draft"] != draft:
            continue
        out[cust_num] = info
    return out


def targets_from(accounts, seen, cap=20):
    """(top-N target list, full count) of accounts with no program activity,
    sorted by the account's own 2026 all-product case volume."""
    targets = [
        {"customer": info["customer"], "cases2026": round(info["cases2026"], 1)}
        for cust_num, info in accounts.items() if cust_num not in seen
    ]
    targets.sort(key=lambda a: -a["cases2026"])
    return targets[:cap], len(targets)


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
CORE_MARKET_PROGRAMS = {"boston_beer", "sam_adams", "new_belgium", "new_belgium_distribution", "sun_cruiser", "lytt",
                        "mc_retention", "mabi_retention", "constellation_retention",
                        "yuengling_retention"}

# Core-Market-restricted programs whose data (if any) lives OUTSIDE the
# `data` dict the territoryEligible loop below walks, so they can't be run
# through it (data[key] would KeyError) but must still show the "Core
# Market" pill. Two different reasons land a key here:
#
#   (a) August continuations with no builder yet -- direct September
#       continuations of a program already in CORE_MARKET_PROGRAMS above,
#       same supplier, same restriction, scope carried over rather than
#       newly assumed. Move a key up into CORE_MARKET_PROGRAMS the moment
#       its September builder exists, so the pill and the blocking re-couple.
#   (b) September-blob programs (keys in data_09, not data) -- confirmed
#       Core Market against kohler_brands_whitelist_blacklist.xlsx's
#       "Brand Family Territory (Enc)" sheet 2026-09-04, but data_09 is
#       never walked by the eligibility loop at all (it's a separate dict
#       built after the loop runs), so these can NEVER move to
#       CORE_MARKET_PROGRAMS the way (a)'s keys can -- eligibility
#       (greying out non-Core-Market reps) for September's own programs is
#       simply not wired up yet, pill aside. That is a real gap, not an
#       oversight to silently paper over: keystone_ice and touchdowns_tea
#       currently show every rep as eligible regardless of territory.
#       printed_menu and bardstown_display have no builder yet either, so
#       they're doubly not gated.
#
# NOT listed here: heineken_husa and other_half. heineken_husa's own five
# SKUs in the whitelist workbook disagree with each other and with Core
# Market (Heineken proper is US in Bergen/Passaic/Passaic-FF/Morris 3 only,
# missing Sussex/Morris 1 that Core Market has; Dos Equis is narrower still,
# Bergen & Passaic only) -- HUSA SDD covers multiple brands with genuinely
# different footprints, so neither "Core Market" nor "All Counties" is an
# accurate claim for the program as a whole. other_half isn't in the
# whitelist workbook at all (too new, same situation Lytt was in before it
# was confirmed directly with Gavin). Both keep showing no territory pill
# (see TERRITORY_UNCONFIRMED in index.html) until confirmed some other way.
CORE_MARKET_PROGRAMS_PENDING = {"constellation_fall", "mabi_retention_fall",
                                "yuengling_retention_fall",
                                "new_belgium_distribution_retain",
                                "keystone_ice", "touchdowns_tea",
                                "printed_menu", "bardstown_display"}


def load_core_market_reps():
    """Reps with at least one account in a Core Market distribution area.
    Since 2026-08-18 this is computed from customer_base_full.csv's Area
    column (the old presence-in-prefiltered-file shortcut no longer works
    now that the full file contains every rep's blackout-county accounts
    too). Same rule as before: ANY Core Market account makes the rep
    eligible (per Gavin, 2026-08-10)."""
    reps = set()
    for rep, accounts in load_customer_base_full().items():
        if any(info["core"] for info in accounts.values()):
            reps.add(rep)
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
        # Channel applicability from the full customer base: a rep with no
        # on-premise (or off-premise) accounts at all gets that side of the
        # card greyed instead of a hollow zero (per Gavin, 2026-08-18).
        d["hasOnPremAccounts"] = len(base_accounts(rep, premise="On Premise")) > 0 or d["onPremAccountCount"] > 0
        d["hasOffPremAccounts"] = len(base_accounts(rep, premise="Off Premise")) > 0 or d["offPremAccountCount"] > 0

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


# RETENTION PROGRAMS (April deck slides 13+, retention phase) ---------------
#
# These reports come from the BI tool's grouped "Saved Reports" view, so the
# CSV export flattens the on-screen subtotal rows into ordinary data rows:
# the first row of each District Manager block is the DM total (carrying an
# arbitrary rep/brand label and no goal), and the first row of each rep's
# contiguous run is that rep's total (again with a borrowed brand label and
# no goal). Verified against Gavin's screenshot of the off-prem MC report:
# e.g. "Chris McCrohan,Robin Feldman,Peroni,123" is the McCrohan DM total,
# not a Robin Feldman row. _strip_report_subtotals() removes both layers
# positionally; a duplicate (rep, brand) surviving the strip means the
# export shape changed -- it's summed with a warning rather than dropped.

def _strip_report_subtotals(rows, rep_col, dm_col=None):
    """Drop both subtotal layers, keeping only real data rows."""
    return _split_report_subtotals(rows, rep_col, dm_col=dm_col)[1]


def _parse_retention_goals(filename, value_prefix, dm_col=None, label_map=None):
    """One brand-goal report -> {rep: [{label, actual, goal, pct}]}.
    value_prefix finds the metric column (its full header embeds the
    distribution/base period dates); the goals column ends ') Goals'.
    The report's own '% of Goals' column is ignored and recomputed."""
    rows = read_rows(filename)
    if not rows:
        return {}
    fieldnames = list(rows[0].keys())
    val_col = next(f for f in fieldnames if f.startswith(value_prefix))
    goal_col = next(f for f in fieldnames if f.rstrip().endswith(") Goals"))
    rows = _strip_report_subtotals(rows, "Sales Rep Name", dm_col=dm_col)
    roster = set(ROSTER)
    by_rep = {}
    for r in rows:
        rep = r["Sales Rep Name"]
        if rep not in roster:
            continue
        raw_label = r["Brand Family"]
        label = (label_map or {}).get(raw_label, raw_label)
        goal_s = (r.get(goal_col) or "").strip()
        goal = to_num(goal_s) if goal_s else None
        actual = to_num(r.get(val_col))
        brands = by_rep.setdefault(rep, {})
        if label in brands:
            print(f"WARNING: {filename}: duplicate brand row for ({rep}, {label}) "
                  f"survived subtotal strip -- export shape may have changed; summing.")
            brands[label]["actual"] += actual
            if goal is not None:
                brands[label]["goal"] = goal
        else:
            brands[label] = {"label": label, "actual": actual, "goal": goal}
    out = {}
    for rep, brands in by_rep.items():
        lst = sorted(brands.values(), key=lambda b: b["label"])
        for b in lst:
            b["actual"] = round(b["actual"])
            if b["goal"] is not None:
                b["goal"] = round(b["goal"])
            b["pct"] = round(b["actual"] / b["goal"] * 100, 1) if b["goal"] else None
        out[rep] = lst
    return out


def build_le_grand_noir():
    """Le Grand Noir Volume Incentive (program 11 of the original deck)
    -- went live 2026-08-20 when the first RDE file arrived (it was HELD
    with no data since 2026-08-05). $10 per case of Le Grand Noir,
    gated on a 70-case COMPANY-WIDE house goal (per Gavin, 2026-08-05:
    company-wide, not per-rep). Single-period file (Cases 8/1-10/31),
    no base period. companyCases counts EVERY row (a house gate counts
    all sales, roster or not); byRep keeps roster reps only, with the
    raw sale lines for the drill-down. Progress only -- whether the
    $10/case pays retroactively or post-threshold is still an open
    question with Gavin, and this dashboard doesn't estimate dollars
    anyway (folder policy)."""
    rows = read_rows("le_grand_noir.csv")
    cases_col = "Cases   8/1/2026 - 10/31/2026"
    by_rep = {rep: {"cases": 0.0, "lines": []} for rep in ROSTER}
    company = 0.0
    for row in rows:
        cases = to_num(row[cases_col])
        company += cases
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        d = by_rep[rep]
        d["cases"] = round(d["cases"] + cases, 2)
        d["lines"].append({
            "customer": row["Customer Name"],
            "product": row["Product Name"],
            "date": row["Date"],
            "cases": round(cases, 2),
        })
    for d in by_rep.values():
        d["lines"].sort(key=lambda l: -l["cases"])
    return {"byRep": by_rep, "companyCases": round(company, 2), "houseGoal": 70}


def build_mc_retention():
    """MolsonCoors Distro Rewards -- retention phase (April deck slides
    14-15). Retain window 7/27-10/31/2026: hold each brand's distribution
    at/above the rep's own goal from the report. Off-prem metric is
    Placements, on-prem is draft Buyers (all Keg Beer rows). Up to $500
    per brand goal retained per the deck; house-goal-missed = 50% payout.
    No $ totals computed -- the deck's "$500 max payout" wording doesn't
    give a clean per-goal rate to multiply.

    Brand labels: the on-prem file's "Coors" is Coors Banquet and "Lite"
    is Miller Lite (the deck's draft brand list -- Coors Lt, Banquet,
    Miller Lite, Blue Moon, Peroni -- pins the mapping); relabeled for
    display. Off-prem "Coors" is left as-is (the deck's off-prem list
    doesn't disambiguate it)."""
    off = _parse_retention_goals("mc_retention_off_prem.csv", "Placements",
                                 dm_col="District Manager Name")
    on = _parse_retention_goals("mc_retention_on_prem.csv", "Buyers",
                                label_map={"Coors": "Coors Banquet", "Lite": "Miller Lite"})

    by_rep = {}
    for rep in ROSTER:
        d = {}
        goaled_all = []
        for side, src in (("off", off), ("on", on)):
            brands = src.get(rep, [])
            goaled = [b for b in brands if b["goal"]]
            actual = sum(b["actual"] for b in goaled)
            goal = sum(b["goal"] for b in goaled)
            d[side + "Brands"] = brands
            d[side + "Actual"] = actual
            d[side + "Goal"] = goal
            d[side + "Pct"] = round(actual / goal * 100, 1) if goal else None
            goaled_all += goaled
        d["goalsTotal"] = len(goaled_all)
        d["goalsRetained"] = sum(1 for b in goaled_all if b["pct"] >= 100)
        total_goal = sum(b["goal"] for b in goaled_all)
        d["overallPct"] = round(sum(b["actual"] for b in goaled_all) / total_goal * 100, 1) if total_goal else None
        by_rep[rep] = d

    return {"byRep": by_rep}


def _split_report_subtotals(rows, rep_col, dm_col=None):
    """Same flattened-subtotal layout as _strip_report_subtotals, but keeps
    the per-rep total rows instead of discarding them -- used by reports
    (e.g. MABI) where the GOAL lives on the rep-total row and the rows
    beneath it are that rep's per-product breakdown. Returns
    ({rep: total_row}, [detail rows])."""
    if dm_col:
        kept, prev_dm = [], object()
        for r in rows:
            if r[dm_col] != prev_dm:
                prev_dm = r[dm_col]
                continue
            kept.append(r)
        rows = kept
    totals, detail, prev_rep = {}, [], object()
    for r in rows:
        rep = r[rep_col]
        if rep != prev_rep:
            prev_rep = rep
            if rep in totals:
                print(f"WARNING: rep {rep!r} appears in two separate blocks -- "
                      f"export shape may have changed; keeping the first total row.")
            else:
                totals[rep] = r
            continue
        detail.append(r)
    return totals, detail


MABI_MADE_HOUSE_GOAL = 8440      # deck slide 22/23: "House Goal=MADE 8,440 PODs"
MABI_RETAIN_THRESHOLD = 0.90     # deck slide 22: "Retain 90% Distribution Goals"


def build_mabi_retention():
    """Mark Anthony (MABI) MADE Distro Rewards -- retention phase (April
    deck slides 22-23). Retain window 6/1-8/31/2026 (base 2/1-5/31), the
    deck's "RETAIN GOALS June-Aug" period.

    Report shape differs from MolsonCoors: the GOAL is a single overall
    MADE placement goal per rep, carried on that rep's flattened total
    row, and the rows beneath it are the per-SKU breakdown (verified: every
    rep's product rows sum exactly to their total row). So this uses
    _split_report_subtotals() to keep the totals rather than drop them.

    Qualifying bar is 90% of goal, not 100% -- MABI's own retention rule.
    House gate: 8,440 MADE PODs company-wide (50% payouts if missed).
    Payout is "up to $500 max" for the MADE/INNOV goal, which isn't a
    per-placement rate, so no $ total is computed.

    NOT built (no data): the INNOVATION goal (2,310 PODs -- separate
    product list/report not yet provided) and the deck's on-premise piece
    ($25 per new Black Cherry non-buy, $10 per new White Claw flavor,
    on-prem goal 410) -- this report is MADE off-premise placements only."""
    products = {}
    for row in read_rows("mabi_made_product_list.csv"):
        pid = (row["Product ID"] or "").strip()
        if pid:
            products[pid] = {"name": row["Product Name"].strip(),
                             "cases2026": to_num(row["Case Equiv   2026"])}

    rows = read_rows("mabi_retention_made.csv")
    fieldnames = list(rows[0].keys()) if rows else []
    plc_col = next(f for f in fieldnames if f.startswith("Placements Made"))
    goal_col = next(f for f in fieldnames if f.rstrip().endswith(") Goals"))
    rebuy_col = next(f for f in fieldnames if f.startswith("Re-Buys"))
    totals, detail = _split_report_subtotals(rows, "Sales Rep Name",
                                             dm_col="District Manager")

    by_prod = defaultdict(list)
    for r in detail:
        by_prod[r["Sales Rep Name"]].append(r)

    by_rep = {}
    for rep in ROSTER:
        trow = totals.get(rep)
        placements = to_num(trow[plc_col]) if trow else 0.0
        rebuys = to_num(trow[rebuy_col]) if trow else 0.0
        goal_s = (trow[goal_col].strip() if trow else "")
        goal = to_num(goal_s) if goal_s else None
        pct = round(placements / goal * 100, 1) if goal else None

        prod_rows, seen_ids = [], set()
        for r in by_prod.get(rep, []):
            label = r["Product Num Name"].strip()
            pid, _, name = label.partition(" ")
            seen_ids.add(pid)
            n = to_num(r[plc_col])
            if n > 0:
                prod_rows.append({"product": (name or label).strip(), "productId": pid,
                                  "placements": round(n), "rebuys": round(to_num(r[rebuy_col]))})
        prod_rows.sort(key=lambda p: (-p["placements"], p["product"]))
        placed_ids = {p["productId"] for p in prod_rows}

        # Honest opportunity list: qualifying MADE SKUs this rep has zero
        # placements on (either a 0 row in the report or no row at all),
        # ranked by that SKU's company-wide 2026 volume as a "worth a pitch"
        # proxy -- same approach as Lytt's whitespace list.
        gaps = [{"product": p["name"], "cases2026": round(p["cases2026"], 1)}
                for pid, p in products.items() if pid not in placed_ids]
        gaps.sort(key=lambda g: -g["cases2026"])

        by_rep[rep] = {
            "placements": round(placements), "goal": round(goal) if goal else None,
            "pct": pct, "rebuys": round(rebuys),
            "retained": bool(goal and placements >= MABI_RETAIN_THRESHOLD * goal),
            "hitFullGoal": bool(goal and placements >= goal),
            "products": prod_rows, "skusWithPlacements": len(prod_rows),
            "totalSkus": len(products),
            "gapSkus": gaps[:20], "gapSkuCount": len(gaps),
            "inReport": trow is not None,
        }

    house_total = sum(d["placements"] for d in by_rep.values())
    return {"byRep": by_rep, "houseTotal": house_total,
            "houseGoal": MABI_MADE_HOUSE_GOAL,
            "houseMet": house_total >= MABI_MADE_HOUSE_GOAL,
            "retainThresholdPct": int(MABI_RETAIN_THRESHOLD * 100)}


# Constellation off-premise retention: one file per goal category, each
# with the deck's own off-prem house goal (slide 18). Same report shape as
# MABI -- the rep-total row carries the goal, the rows beneath it are that
# rep's per-SKU breakdown -- but with no District Manager column.
CONSTELLATION_OFF_CATEGORIES = [
    {"key": "corona_gaintain", "label": "Corona Gaintain",
     "file": "constellation_corona_gaintain_off.csv",
     "prefix": "Corona Gaintain SKUs Placements", "houseGoal": 1575},
    {"key": "modelo_gaintain", "label": "Modelo Gaintain",
     "file": "constellation_modelo_gaintain_off.csv",
     "prefix": "Modelo Gaintain SKUs Placements", "houseGoal": 2400},
    {"key": "impact", "label": "Impact",
     "file": "constellation_impact_off.csv",
     "prefix": "Impact SKUs Placements", "houseGoal": 3220},
    {"key": "innovation", "label": "Innovation",
     "file": "constellation_innovation_off.csv",
     "prefix": "Innovation SKUs Placements", "houseGoal": 1200},
]

CONSTELLATION_RETAIN_THRESHOLD = 0.90   # deck slide 18: "Retain 90% Distribution Goals"


# --- Constellation ON-PREMISE ------------------------------------------
# Two more files, each a different shape again (2026-08-19):
#
# constellation_packages_on.csv: one row per rep, one COLUMN per brand,
# values are buyer counts for June-August 2026. No goals column at all,
# and no subtotal rows -- the simplest file in the whole dashboard.
#
# constellation_draft_on.csv: account-level draft rows grouped
# rep -> (brand, package) -> customer. TWO subtotal layers: the first row
# of each rep run is the rep total, and the first row of each
# (rep, brand, package) run is that block's subtotal; both borrow their
# top customer's name. Verified on the 2026-08-19 pull: all 119 block
# subtotals equal their leaf sums exactly, and every rep's Current Units
# total equals its leaf sum.
#
# CRITICAL: "New Buyers" is a DISTINCT-ACCOUNT count at each grouping
# level, NOT a summable measure -- summing it across blocks double-counts
# an account that went new on more than one brand or keg size (Shane
# Barreca: 7 new accounts but 12 new lines). Leaf rows are always 0 or 1,
# so new LINES = leaf rows with New Buyers = 1, while new ACCOUNTS =
# distinct customers among them. The report's own rep-total row equals
# the distinct-account count for all 21 reps, which is what confirms the
# semantics. The deck pays per LINE ("$100 for Targeted Draft Line"), so
# both numbers are carried and labelled distinctly on the card.

CONSTELLATION_ON_PKG_PREFIXES = [
    "Corona Extra", "Modelo Especial", "Corona Light", "Corona Premier",
    "Pacifico", "Corona NA", "Sunbrew", "Modelo Oro",
]

# Per Gavin, 2026-08-19: do NOT show goals on the draft side. The draft
# report carries no goals column, and the slide-18 draft numbers are not
# to be used as stand-ins -- so this program tracks draft activity
# (new lines, barrels, bonus tiers) with no goal or house gate attached.
# Deck slide 20: "MODELO TARGETED NEW LINE REWARDS" pays $100 a line and
# "ALL OTHER LINE REWARDS" $50. Slide 18 lists "Modelo Draft" separately
# from "Negra Draft", so the targeted line is read as Modelo Especial
# only -- confirm with Gavin.
CONSTELLATION_TARGETED_DRAFT_BRAND = "Modelo Especial"


def _constellation_packages_on():
    rows = read_rows("constellation_packages_on.csv")
    if not rows:
        return {}, []
    fieldnames = list(rows[0].keys())
    cols = []
    for label in CONSTELLATION_ON_PKG_PREFIXES:
        match = next((f for f in fieldnames if f.startswith(label + " Buyers")), None)
        if match:
            cols.append((label, match))
    by_rep, house = {}, {label: 0 for label, _ in cols}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in set(ROSTER):
            continue
        brands = [{"label": label, "buyers": round(to_num(row[col]))} for label, col in cols]
        by_rep[rep] = brands
        for b in brands:
            house[b["label"]] += b["buyers"]
    return by_rep, [{"label": label, "buyers": house[label]} for label, _ in cols]


def _constellation_draft_buyers():
    """Per-rep REGULAR (total) draft buyers by brand -- RDE "Constellation:
    Draft ON (Summer 2026)", data/constellation_draft_on_buyers.csv.

    These are the rep's draft buyers outright, NOT new ones. Corrected
    2026-08-25 after this file and the New Draft Distro export were built
    the wrong way round: per Gavin, "1st i mentioned [New Draft Distro] is
    new and has no goals and 2nd i mentioned [Draft ON] is regular buyers.
    no goals at rep level, just brand level for regular." New buyers come
    from _constellation_new_draft_distro() below; this is the standing book.

    The file ships Goals / % of Goals columns beside every brand and every
    Goals cell is blank -- consistent with "no goals at rep level", so those
    columns are ignored outright rather than rendered as a wall of 0%.
    """
    rows = read_rows("constellation_draft_on_buyers.csv")
    if not rows:
        return {}, []
    # "Corona Light Buyers: June - August   2026" -> "Corona Light"; skip the
    # paired "( ... ) Goals" / "% of Goals" columns the same match would catch.
    cols = [(f.split(" Buyers:")[0], f) for f in rows[0]
            if " Buyers:" in f and not f.startswith("(")]
    roster = set(ROSTER)
    by_rep, house = {}, {label: 0 for label, _ in cols}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in roster:
            continue
        brands = [{"label": label, "buyers": round(to_num(row[col]))} for label, col in cols]
        by_rep[rep] = brands
        for b in brands:
            house[b["label"]] += b["buyers"]
    return by_rep, [{"label": label, "buyers": house[label]} for label, _ in cols]


def _constellation_new_draft_distro():
    """Account-level NEW DRAFT rows -- RDE "Constellation: New Draft Distro
    (Summer 2026)", data/constellation_new_draft_distro.csv. This is the NEW
    side of Constellation draft (see _constellation_draft_buyers above for
    the regular book, and the 2026-08-25 correction noted there).

    A hierarchical pivot export: a rep-total row, then a (brand, package)
    block row, then the account leaves -- both header layers are stripped
    below so only leaves are counted.

    NOTE on counting new buyers: the report's own rep-level "New Buyers"
    figure is DISTINCT NEW ACCOUNTS, not a sum of the leaf column and not a
    count of leaf rows. One account carrying two brands appears twice, so
    the leaf sum (109 house-wide) and the leaf row count (109) both
    overstate it; distinct accounts reproduces the report's 90 exactly,
    rep for rep. draftNewAccountCount is therefore the headline number.
    """
    rows = read_rows("constellation_new_draft_distro.csv")
    # strip the rep-total layer, then the (brand, package) block layer
    prev, body = object(), []
    for r in rows:
        if r["Sales Rep Name"] != prev:
            prev = r["Sales Rep Name"]
            continue
        body.append(r)
    prev, leaf = object(), []
    for r in body:
        key = (r["Sales Rep Name"], r["Brand Family"], r["Package"])
        if key != prev:
            prev = key
            continue
        leaf.append(r)

    roster = set(ROSTER)
    by_rep = {}
    for r in leaf:
        rep = r["Sales Rep Name"]
        if rep not in roster:
            continue
        units = to_num(r["Current Units"])
        is_new = to_num(r["New Buyers"]) > 0
        if units == 0 and not is_new:
            continue
        bbl = keg_bbl(r["Package"])
        barrels = units * bbl if bbl else 0.0
        brand = r["Brand Family"]
        customer = r["Customer Num Company"].strip()
        targeted = brand == CONSTELLATION_TARGETED_DRAFT_BRAND
        # Deck slide 20 retention bonus, halved on 1/4 and 1/6 kegs.
        half = bbl is not None and bbl < 0.5
        if barrels >= 8:
            tier, amt = 8, (400 if targeted else 250)
        elif barrels >= 4:
            tier, amt = 4, (200 if targeted else 150)
        else:
            tier, amt = 0, 0
        d = by_rep.setdefault(rep, {"lines": [], "accounts": set(), "newAccounts": set()})
        d["lines"].append({
            "customer": customer, "brand": brand, "package": r["Package"],
            "units": round(units), "barrels": round(barrels, 2),
            "isNew": is_new, "targeted": targeted, "tier": tier,
            "bonus": round(amt * 0.5) if (amt and half) else amt,
            "halfKeg": half,
        })
        if units > 0:
            d["accounts"].add(customer)
        if is_new:
            d["newAccounts"].add(customer)

    return by_rep


def build_constellation_retention():
    """Constellation "Fast Start" Distro Rewards -- retention phase, OFF
    PREMISE (April deck slides 18-19). Retain window 6/1-8/31/2026, the
    deck's "REWARDS RETAIN GOALS June-Aug" period; qualifying bar is 90%
    of goal (same as MABI, unlike MolsonCoors' straight retention).

    Four separate files, one per off-premise goal category, whose house
    goals come straight off slide 18: Corona Gaintain 1,575 / Modelo
    Gaintain 2,400 / Impact 3,220 / Innovation 1,200. Each file has the
    MABI shape (rep-total row carries the goal, per-SKU rows beneath;
    verified every rep total equals the sum of its own product rows) but
    no District Manager column.

    Payout is "up to $500 max" per period, so no $ total is computed.
    NOT built yet: the ON-PREMISE side (package + draft goals on slide
    18) -- those files are coming separately. The all-3-periods $500
    bonus and the MLB All-Star raffle aren't tracked (they depend on the
    earlier Achieve period's results, which aren't in these files)."""
    by_rep = {rep: {"offCategories": [], "inReport": False} for rep in ROSTER}
    house = []

    for cat in CONSTELLATION_OFF_CATEGORIES:
        rows = read_rows(cat["file"])
        fieldnames = list(rows[0].keys()) if rows else []
        val_col = next(f for f in fieldnames
                       if f.startswith(cat["prefix"]) and not f.startswith("("))
        goal_col = next(f for f in fieldnames if f.rstrip().endswith(") Goals"))
        totals, detail = _split_report_subtotals(rows, "Sales Rep Assigned")

        prods = defaultdict(list)
        for r in detail:
            n = to_num(r[val_col])
            if n > 0:
                prods[r["Sales Rep Assigned"]].append(
                    {"product": r["Product Name"].strip(), "placements": round(n)})

        house_total = 0
        for rep in ROSTER:
            trow = totals.get(rep)
            if trow is None:
                by_rep[rep]["offCategories"].append({
                    "key": cat["key"], "label": cat["label"], "placements": 0,
                    "goal": None, "pct": None, "retained": False,
                    "hitFullGoal": False, "inReport": False, "products": [],
                })
                continue
            by_rep[rep]["inReport"] = True
            placements = to_num(trow[val_col])
            house_total += placements
            goal_s = trow[goal_col].strip()
            goal = to_num(goal_s) if goal_s else None
            plist = sorted(prods.get(rep, []), key=lambda p: (-p["placements"], p["product"]))
            by_rep[rep]["offCategories"].append({
                "key": cat["key"], "label": cat["label"], "placements": round(placements),
                "goal": round(goal) if goal else None,
                "pct": round(placements / goal * 100, 1) if goal else None,
                "retained": bool(goal and placements >= CONSTELLATION_RETAIN_THRESHOLD * goal),
                "hitFullGoal": bool(goal and placements >= goal),
                "inReport": True, "products": plist,
            })

        house.append({"key": cat["key"], "label": cat["label"],
                      "total": round(house_total), "goal": cat["houseGoal"],
                      "met": house_total >= cat["houseGoal"],
                      "short": max(0, cat["houseGoal"] - round(house_total))})

    pkg_by_rep, pkg_house = _constellation_packages_on()
    draft_by_rep = _constellation_new_draft_distro()
    regbuyers_by_rep, regbuyers_house = _constellation_draft_buyers()

    for rep, d in by_rep.items():
        goaled = [c for c in d["offCategories"] if c["goal"]]
        d["offGoalsTotal"] = len(goaled)
        d["offGoalsRetained"] = sum(1 for c in goaled if c["retained"])
        d["offPlacements"] = sum(c["placements"] for c in d["offCategories"])
        d["offGoal"] = sum(c["goal"] for c in goaled)
        d["offPct"] = round(sum(c["placements"] for c in goaled) / d["offGoal"] * 100, 1) if d["offGoal"] else None

        brands = pkg_by_rep.get(rep)
        d["onPkgInReport"] = brands is not None
        d["onPkgBrands"] = [b for b in (brands or []) if b["buyers"] > 0]
        d["onPkgTotal"] = sum(b["buyers"] for b in (brands or []))

        dr = draft_by_rep.get(rep)
        d["draftInReport"] = dr is not None
        lines = sorted((dr or {}).get("lines", []),
                       key=lambda l: (-l["barrels"], l["customer"]))
        d["draftLines"] = lines
        d["draftNewLines"] = [l for l in lines if l["isNew"]]
        d["draftNewLineCount"] = len(d["draftNewLines"])
        d["draftNewTargetedCount"] = sum(1 for l in d["draftNewLines"] if l["targeted"])
        d["draftNewAccountCount"] = len((dr or {}).get("newAccounts", ()))
        d["draftAccountCount"] = len((dr or {}).get("accounts", ()))
        d["draftBarrels"] = round(sum(l["barrels"] for l in lines), 1)
        d["draftLinesAtBonus"] = sum(1 for l in d["draftNewLines"] if l["tier"])

        rb = regbuyers_by_rep.get(rep)
        d["regBuyersInReport"] = rb is not None
        d["regBuyersBrands"] = [b for b in (rb or []) if b["buyers"] > 0]
        d["regBuyersTotal"] = sum(b["buyers"] for b in (rb or []))

    return {"byRep": by_rep, "houseOff": house,
            "houseOffMet": sum(1 for h in house if h["met"]),
            "houseOffTotal": len(house),
            "housePkgOn": pkg_house,
            "houseDraftBuyers": regbuyers_house,
            "targetedDraftBrand": CONSTELLATION_TARGETED_DRAFT_BRAND,
            "retainThresholdPct": int(CONSTELLATION_RETAIN_THRESHOLD * 100)}


# --- YUENGLING ON & OFF PREMISE DISTRO REWARDS -- RETENTION -------------
# (April deck slides 28-29.) Five files, and the first supplier in this
# dashboard to hand over an explicit RETENTION ACCOUNT LIST per rep --
# so "listed account with zero placements" is a real, supplier-defined
# at-risk list rather than anything inferred.
#
# The two placement files (off, on-packages) use the familiar flattened
# shape: first row of each rep run is the rep total carrying that rep's
# goals, rows beneath are per-account. Verified 2026-08-19: every rep
# total equals the sum of its own account rows in both files.
# The two customer-list files repeat the same artifact -- the first row
# of each rep run duplicates an entry that also appears in the real
# alphabetical list below it -- so the same positional strip applies.
#
# NO HOUSE GOALS ARE SHOWN. Slide 28's numbers (off: Lager 48, Flight
# 100, Lt. Lager 35; on: Lager Draft 12, Flight Draft 10, Lager Package
# 40, Flight Package 20) do NOT reconcile with these files -- summing
# every rep's own goal gives 44 / 101 / 67 off-premise and 102 / 29
# on-premise. Per Gavin's standing instruction on the Constellation
# draft ("dont include any goals"), deck numbers are not used as
# stand-ins; only goals carried by the files themselves are shown.

YUENGLING_RETAIN_THRESHOLD = 0.90    # deck slide 28: "Retain 90% Distribution Goals" (Jun-Aug)

YUENGLING_OFF_BRANDS = [
    ("Lager 16oz 12pk Can", "Lager 16oz 12pk Can Retention Placements"),
    ("Flight Packages", "Flight Packages Retention Placements"),
    ("Light Lager Packages", "Light Lager Packages Retention Placements"),
]
YUENGLING_ON_BRANDS = [
    ("Lager Package", "Lager Package Retention Placements"),
    ("Flight Packages", "Flight Packages Retention Placements"),
]


def _yuengling_customer_list(filename):
    """Retention account list per rep. The first row of each rep run is
    the same header artifact seen in the placement files (it duplicates
    an entry from the alphabetical list below it), so it is stripped
    positionally rather than by value."""
    _, detail = _split_report_subtotals(read_rows(filename), "Sales Rep Name")
    out = defaultdict(list)
    for r in detail:
        name = (r["Retention Customers"] or "").strip()
        if name and name not in out[r["Sales Rep Name"]]:
            out[r["Sales Rep Name"]].append(name)
    return out


def _yuengling_side(placement_file, customer_file, brands):
    rows = read_rows(placement_file)
    totals, detail = _split_report_subtotals(rows, "Sales Rep Name")
    lists = _yuengling_customer_list(customer_file)

    per_account = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    for r in detail:
        rep = r["Sales Rep Name"]
        cust = (r["Retention Customers"] or "").strip()
        for label, col in brands:
            per_account[rep][cust][label] += to_num(r[col])

    out = {}
    for rep in ROSTER:
        trow = totals.get(rep)
        listed = lists.get(rep, [])
        accounts = []
        for cust, vals in per_account.get(rep, {}).items():
            total = sum(vals.values())
            accounts.append({"customer": cust, "total": round(total),
                             "brands": [{"label": lb, "placements": round(vals[lb])}
                                        for lb, _ in brands if vals[lb]]})
        accounts.sort(key=lambda a: (-a["total"], a["customer"]))
        held = {a["customer"] for a in accounts if a["total"] > 0}
        # Supplier-defined at-risk list: on the retention list, nothing on it yet.
        at_risk = [c for c in listed if c not in held]
        # A few off-premise accounts appear in the placement file but not on
        # the list (9 reps on the 2026-08-19 pull) -- kept visible rather
        # than silently dropped, since they are real placements.
        off_list = [a["customer"] for a in accounts if a["customer"] not in listed]

        brand_rows = []
        for label, col in brands:
            placements = to_num(trow[col]) if trow else 0.0
            goal_s = (trow[f"( {col} ) Goals"].strip() if trow else "")
            goal = to_num(goal_s) if goal_s else None
            brand_rows.append({
                "label": label, "placements": round(placements),
                "goal": round(goal) if goal else None,
                "pct": round(placements / goal * 100, 1) if goal else None,
                "retained": bool(goal and placements >= YUENGLING_RETAIN_THRESHOLD * goal),
                "hitFullGoal": bool(goal and placements >= goal),
            })
        goaled = [b for b in brand_rows if b["goal"]]
        goal_sum = sum(b["goal"] for b in goaled)
        out[rep] = {
            "inReport": trow is not None,
            "brands": brand_rows,
            "goalsTotal": len(goaled),
            "goalsRetained": sum(1 for b in goaled if b["retained"]),
            "placements": sum(b["placements"] for b in brand_rows),
            "goal": goal_sum,
            "pct": round(sum(b["placements"] for b in goaled) / goal_sum * 100, 1) if goal_sum else None,
            "accounts": accounts,
            "listedCount": len(listed),
            "heldCount": len([c for c in listed if c in held]),
            "atRisk": at_risk,
            "notOnList": off_list,
        }
    return out


def _yuengling_draft():
    """Load-sheet-level draft rows (6/1-8/20/2026 on this pull, which is
    what pins the Jun-Aug window). No goals column, so this side tracks
    activity only -- units and accounts, no goal or house gate, per
    Gavin's standing instruction."""
    rows = read_rows("yuengling_retention_draft_on.csv")
    by_rep = {}
    for r in rows:
        rep = r["Sales Rep Name"]
        if rep not in set(ROSTER):
            continue
        cust = (r["Retention Customers"] or "").strip()
        lager = to_num(r["Lager Draft Retention Units Sold"])
        flight = to_num(r["Flight Draft Retention Units Sold"])
        d = by_rep.setdefault(rep, {"accounts": {}, "lagerUnits": 0.0, "flightUnits": 0.0})
        d["lagerUnits"] += lager
        d["flightUnits"] += flight
        a = d["accounts"].setdefault(cust, {"customer": cust, "lager": 0.0, "flight": 0.0,
                                            "loads": 0, "lastDate": None})
        a["lager"] += lager
        a["flight"] += flight
        a["loads"] += 1
        m = DATE_RE.search(r["Load Sheet Date"] or "")
        if m:
            key = (int(m.group(3)), int(m.group(1)), int(m.group(2)))
            if a["lastDate"] is None or key > a["lastDate"][0]:
                a["lastDate"] = (key, r["Load Sheet Date"])
    out = {}
    for rep, d in by_rep.items():
        accounts = []
        for a in d["accounts"].values():
            accounts.append({"customer": a["customer"], "lager": round(a["lager"]),
                             "flight": round(a["flight"]), "loads": a["loads"],
                             "lastDate": a["lastDate"][1] if a["lastDate"] else None,
                             "units": round(a["lager"] + a["flight"])})
        accounts.sort(key=lambda a: (-a["units"], a["customer"]))
        out[rep] = {"lagerUnits": round(d["lagerUnits"]), "flightUnits": round(d["flightUnits"]),
                    "units": round(d["lagerUnits"] + d["flightUnits"]),
                    "accountCount": len(accounts), "accounts": accounts}
    return out


def build_yuengling_retention():
    off = _yuengling_side("yuengling_retention_off.csv",
                          "yuengling_retention_customers_off.csv", YUENGLING_OFF_BRANDS)
    on = _yuengling_side("yuengling_retention_packages_on.csv",
                         "yuengling_retention_customers_on.csv", YUENGLING_ON_BRANDS)
    draft = _yuengling_draft()

    by_rep = {}
    for rep in ROSTER:
        o, p = off[rep], on[rep]
        dr = draft.get(rep)
        by_rep[rep] = {
            "off": o, "onPkg": p,
            "draft": dr or {"lagerUnits": 0, "flightUnits": 0, "units": 0,
                            "accountCount": 0, "accounts": []},
            "draftInReport": dr is not None,
            "goalsTotal": o["goalsTotal"] + p["goalsTotal"],
            "goalsRetained": o["goalsRetained"] + p["goalsRetained"],
            "listedCount": o["listedCount"] + p["listedCount"],
            "heldCount": o["heldCount"] + p["heldCount"],
        }
        goal_sum = o["goal"] + p["goal"]
        placed = sum(b["placements"] for b in o["brands"] if b["goal"]) + \
                 sum(b["placements"] for b in p["brands"] if b["goal"])
        by_rep[rep]["overallPct"] = round(placed / goal_sum * 100, 1) if goal_sum else None

    return {"byRep": by_rep,
            "retainThresholdPct": int(YUENGLING_RETAIN_THRESHOLD * 100)}


# --- iSELLBEER SUMMER DISPLAY AUCTION (points leaderboard) -------------
# Wired in 2026-08-25 at Gavin's request ("is there a way you can wire the
# isellbeer auction display program into this page? make it a tile just
# like the other programs. put it in ongoing."). Until then the auction
# lived only in its own dashboard, isellbeer/display-auction-tracker/, and
# the README said outright that it was not part of this page.
#
# SOURCE IS THE TRACKER'S OWN PUBLISHED JSON, not its raw export. The
# tracker embeds a fully-scored per-person block (id="da-data") in its
# index.html, and its generate.py owns the scoring: what counts as one
# display, the priority/all-other split, the case tiers, the points per
# tier, and the weekly --merge that keeps older weeks on the board. All of
# that was reverse-engineered once and its README says not to re-derive it,
# so this reads the finished numbers instead of rescoring anything. One
# consequence worth knowing: this page is only as current as the last
# auction-tracker refresh -- refresh that first, then run this.
AUCTION_INDEX = Path(__file__).resolve().parent.parent / "isellbeer" / "display-auction-tracker" / "index.html"
AUCTION_DATA_RE = re.compile(r'<script[^>]*id="da-data"[^>]*>(.*?)</script>', re.S)

# iSellBeer spells names its own way (and uses a curly apostrophe). Same
# canonicalization job as generate_lytt_pos.py in MPOs/off-prem/.
AUCTION_NAME_FIXES = {
    "MATTHEW POWIERSKI": "Matt Powierski",
    "JAMES HEANEY": "Jim Heaney",
    "DANIEL LA GALA": "Dan Lagala",
    "NICHOLAS MELISSARI": "Nick Melissari",
}
_ROSTER_BY_UPPER = {n.upper(): n for n in ROSTER}


def _canon_auction_name(name):
    n = re.sub(r"\s+", " ", str(name or "").replace("\u2019", "'").strip())
    if not n:
        return None
    return AUCTION_NAME_FIXES.get(n.upper()) or _ROSTER_BY_UPPER.get(n.upper())


def build_display_auction():
    """Per-rep points, displays and photo links for the display auction.

    SALES REPS ONLY. The auction is open to Sales Associates too and they
    are a real force in it -- mickey obrien would sit 2nd overall -- but
    this dashboard is a rep board (ROSTER drives every chip and card), so
    associates are dropped here and stay visible on the auction tracker
    itself, which ranks everyone. John Neukum is dropped for the usual
    roster reason. The card says so rather than implying the rep ranking
    is the whole auction.
    """
    if not AUCTION_INDEX.exists():
        print("display_auction: SKIPPED -- no isellbeer/display-auction-tracker/index.html found")
        return {"byRep": {}, "meta": {}, "houseRepPoints": 0, "houseRepDisplays": 0,
                "excludedPoints": 0, "excludedNames": []}
    m = AUCTION_DATA_RE.search(AUCTION_INDEX.read_text())
    if not m:
        print("display_auction: SKIPPED -- da-data block not found in the tracker's index.html")
        return {"byRep": {}, "meta": {}, "houseRepPoints": 0, "houseRepDisplays": 0,
                "excludedPoints": 0, "excludedNames": []}
    src = json.loads(m.group(1))

    by_rep, excluded, excluded_pts = {}, [], 0
    for person in src.get("people", []):
        rep = _canon_auction_name(person.get("name"))
        if not rep:
            excluded.append(f"{person.get('name')} ({person.get('role')})")
            excluded_pts += person.get("points", 0) or 0
            continue
        displays = [{
            "customer": d.get("dba", ""),
            "city": d.get("city", ""),
            "date": d.get("dt", ""),
            "cases": d.get("cases", 0),
            "tier": d.get("tier"),
            "classification": d.get("classification", ""),
            "points": d.get("points", 0),
            "brands": d.get("brands", []),
            # A display can carry more than one photo; the first is the link.
            "photo": (d.get("photos") or [None])[0],
        } for d in person.get("displays", [])]
        by_rep[rep] = {
            "points": person.get("points", 0),
            "qualifying": person.get("qualifying", 0),
            "submitted": person.get("total", 0),
            "priorityQualifying": person.get("priorityQualifying", 0),
            "otherQualifying": person.get("otherQualifying", 0),
            "displays": displays,
        }

    # Every rep can enter this auction, so a rep with nothing on the board
    # still gets a card -- a zero-state that shows how points are earned,
    # rather than the program vanishing for exactly the people who have not
    # started. Same reasoning as Target Accounts on the MPO trackers.
    for rep in ROSTER:
        by_rep.setdefault(rep, {"points": 0, "qualifying": 0, "submitted": 0,
                                "priorityQualifying": 0, "otherQualifying": 0, "displays": []})

    # Rank within the reps on this board only -- see the docstring on why
    # that is not the same as the auction's overall standing. Reps with no
    # points are unranked (null) rather than sharing a meaningless last
    # place; the card shows a dash.
    scoring = sorted((kv for kv in by_rep.items() if kv[1]["points"] > 0), key=lambda kv: -kv[1]["points"])
    for i, (rep, _) in enumerate(scoring, start=1):
        by_rep[rep]["rank"] = i
    for rep, d in by_rep.items():
        d.setdefault("rank", None)
    return {
        "byRep": by_rep,
        "meta": src.get("meta", {}),
        "repCount": len(scoring),
        "houseRepPoints": sum(d["points"] for d in by_rep.values()),
        "houseRepDisplays": sum(d["qualifying"] for d in by_rep.values()),
        "excludedPoints": excluded_pts,
        "excludedNames": sorted(excluded),
    }



# --- KEYSTONE ICE 24 OZ REWARDS (September 2026) -----------------------
# Wired in 2026-08-31 at Gavin's request ("can you incorporate this into the
# incentive tracker? this is one of the new incentives"). First of the eight
# brand-new September programs to get real data, so it is also the first user
# of the PROGRAM_DATA_2026_09 blob the September registry was built against.
#
# SOURCE IS THE KEYSTONE DASHBOARD'S OWN PUBLISHED JSON, same arrangement as
# build_display_auction() above: keystone-ice/generate.py owns the scoring --
# which accounts count (distinct customers, never a sum of the Buyer Count
# column), and the whole-number ceiling on each rep's qualifier and bonus --
# and this reads the finished numbers rather than rescoring anything. So this
# page is only as current as the last Keystone dashboard refresh: refresh that
# first, then run this.
KEYSTONE_JSON = Path(__file__).resolve().parent.parent / "keystone-ice" / "data" / "keystone_ice.json"


def build_keystone_ice():
    """Per-rep Keystone Ice 24 oz distribution against each rep's own goal.

    Kohler's goals workbook covers 18 reps, one of whom (John Neukum) is not on
    this page's ROSTER -- dropped here for the same reason every other program
    drops him. Reps with a goal but no accounts yet are KEPT, at zero: this is
    a distribution program, so "you have sold none of your 12" is exactly the
    thing a rep needs to see, and dropping them would quietly shorten the
    leaderboard.
    """
    empty = {"byRep": {}, "meta": {}}
    if not KEYSTONE_JSON.exists():
        print("keystone_ice: SKIPPED -- no keystone-ice/data/keystone_ice.json found "
              "(run keystone-ice/generate.py first)")
        return empty
    src = json.loads(KEYSTONE_JSON.read_text())
    if not src.get("meta", {}).get("repLevel"):
        print("keystone_ice: SKIPPED -- the Keystone dashboard has no rep-level data yet")
        return empty

    roster = set(ROSTER)
    off_roster = sorted({r["rep"] for r in src["reps"] if r["rep"] not in roster})

    by_rep = {}
    for r in src["reps"]:
        if r["rep"] not in roster:
            continue
        by_rep[r["rep"]] = {
            "base": r["base"],
            "qualifier": r["qualifier"],
            "bonus": r["bonus"],
            "accounts": r["buyers"],
            "pct": r["pct"],
            "qualified": bool(r["qualified"]),
            "bonusHit": bool(r["bonusHit"]),
            "toQualifier": r["toQualifier"],
            "toBonus": r["toBonus"],
            "payout": r["payout"],
            "accountList": r["accounts"],
        }
    # Rank on percentage of own base -- the measure the $300/$150 top-performer
    # award is decided on, not raw account count, so a small book competes.
    for i, rep in enumerate(sorted(by_rep, key=lambda k: (-by_rep[k]["pct"], -by_rep[k]["base"], k)), 1):
        by_rep[rep]["rank"] = i

    return {
        "byRep": by_rep,
        "meta": {
            "window": src["meta"].get("window", ""),
            "houseAccounts": src["meta"].get("houseBuyers"),
            "repCount": len(by_rep),
            "offRoster": off_roster,
            "rewards": src.get("rewards", {}),
        },
    }


# The three September exports name their premise column "On-Off Premise" where
# every earlier RDE file on this page says "Premise". Normalised on read rather
# than special-cased in each builder.
def _premise(row):
    return (row.get("Premise") or row.get("On-Off Premise") or "").strip()


# "1 1/2 bbl or 2 1/6 bbl minimum" (Evil Genius and Montauk draft). Two sixtels
# is the smaller of the two acceptable orders, so 1/3 bbl is the qualifying
# floor. NOTE this is a different KIND of threshold from 1911/Woodchuck's
# "paid after 2 barrels", which is a cumulative volume gate -- here the deck is
# describing the minimum keg order, so it is checked per account's September
# keg volume, not against a season total.
DRAFT_MIN_BBL = 1.0 / 3.0


def _draft_accounts(rows, place_base_col, place_current_col, case_current_col,
                    product_filter=None):
    """Shared draft half of Evil Genius / Montauk: classify keg accounts as new
    vs reorder and total each one's current-period barrels."""
    by_cust, bbl, name = defaultdict(list), defaultdict(float), {}
    for row in rows:
        if _premise(row) != "On Premise" or not is_keg_package(row.get("Package")):
            continue
        if product_filter and not product_filter(row["Product Name"]):
            continue
        key = (row["Sales Rep Assigned"], row["Customer Num"])
        by_cust[key].append(row)
        name.setdefault(key, row["Customer Name"])
        bbl[key] += (keg_bbl(row["Package"]) or 0.0) * to_num(row[case_current_col])
    return by_cust, bbl, name, classify_by_customer(by_cust, place_base_col, place_current_col)


def build_montauk():
    """Montauk Wave Chaser new placements, September 2026 (deck p6).

        $10  new placement of Wave Chaser 6pk cans
        $15  new placement of Wave Chaser 12pk cans OR 19.2oz cans
        $100 per new draught line, Wave Chaser only, 1x1/2bbl or 2x1/6bbl min

    Because the package tiers pay DIFFERENT amounts, off-premise placements are
    classified per (rep, customer, tier) rather than per (rep, customer) the way
    1911/Woodchuck are. Those programs pay one flat rate for any new placement,
    so Gavin's 2026-08-17 account-level rule ("a second SKU at an account that
    already carries one is a reorder, not a new placement") collapses tiers
    without losing money. Here it would: an account that takes 6pks and 12pks
    is two placements at two prices on the deck's wording. The account-level
    count is emitted alongside as newAccounts so the two readings can be
    compared -- see the README, this is the one open question on this program.
    """
    rows = read_rows("montauk.csv")
    fields = rows[0].keys() if rows else []
    place_base, place_current = find_period_cols(fields, "Placement Count")
    case_base, case_current = find_period_cols(fields, "Cases")

    def tier_of(package):
        p = (package or "").lower()
        if "4/6/" in p:
            return "sixpack"
        if "2/12/" in p:
            return "twelvepack"
        if "19.2" in p:
            return "nineteen2"
        return None

    TIER_RATE = {"sixpack": 10, "twelvepack": 15, "nineteen2": 15}
    TIER_LABEL = {"sixpack": "6pk cans", "twelvepack": "12pk cans", "nineteen2": "19.2oz cans"}

    by_rep = {rep: {"offPremNew": [], "offPremNewCount": 0, "offPremReorderCount": 0,
                    "newAccounts": 0, "byTier": {t: 0 for t in TIER_RATE},
                    "draftNew": [], "draftNewCount": 0, "draftReorderCount": 0,
                    "draftQualifiedCount": 0, "draftAccounts": [],
                    "caseVolume": 0.0, "packagePayout": 0, "draftPayout": 0,
                    "payout": 0, "totalNewPlacements": 0, "draftChannelOk": False}
              for rep in ROSTER}

    pkg_by_tier, pkg_by_cust = defaultdict(list), defaultdict(list)
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        by_rep[rep]["caseVolume"] += to_num(row[case_current])
        if _premise(row) != "Off Premise":
            continue
        tier = tier_of(row.get("Package"))
        if not tier:
            continue
        pkg_by_tier[(rep, row["Customer Num"], tier)].append(row)
        pkg_by_cust[(rep, row["Customer Num"])].append(row)

    for key, status in classify_by_customer(pkg_by_tier, place_base, place_current).items():
        rep, _cust, tier = key
        if status == "new":
            krows = pkg_by_tier[key]
            dates = sorted((r["Date"] for r in krows if r[place_current].strip()), reverse=True)
            by_rep[rep]["offPremNew"].append({
                "customer": krows[0]["Customer Name"],
                "tier": TIER_LABEL[tier],
                "rate": TIER_RATE[tier],
                "date": dates[0] if dates else None,
            })
            by_rep[rep]["offPremNewCount"] += 1
            by_rep[rep]["byTier"][tier] += 1
            by_rep[rep]["packagePayout"] += TIER_RATE[tier]
        elif status == "reorder":
            by_rep[rep]["offPremReorderCount"] += 1

    for key, status in classify_by_customer(pkg_by_cust, place_base, place_current).items():
        if status == "new":
            by_rep[key[0]]["newAccounts"] += 1

    d_by_cust, d_bbl, d_name, d_class = _draft_accounts(
        rows, place_base, place_current, case_current)
    for key, status in d_class.items():
        rep, _cust = key
        if rep not in by_rep:
            continue
        bbl = round(d_bbl[key], 3)
        qualifies = bbl >= DRAFT_MIN_BBL
        by_rep[rep]["draftAccounts"].append({"customer": d_name[key], "bbl": bbl,
                                             "qualifies": qualifies, "status": status})
        if status == "new":
            dates = sorted((r["Date"] for r in d_by_cust[key] if r[place_current].strip()), reverse=True)
            by_rep[rep]["draftNew"].append({"customer": d_name[key], "bbl": bbl,
                                            "qualifies": qualifies,
                                            "date": dates[0] if dates else None})
            by_rep[rep]["draftNewCount"] += 1
            if qualifies:
                by_rep[rep]["draftQualifiedCount"] += 1
                by_rep[rep]["draftPayout"] += 100
        elif status == "reorder":
            by_rep[rep]["draftReorderCount"] += 1

    leaderboard = []
    for rep, d in by_rep.items():
        d["caseVolume"] = round(d["caseVolume"], 2)
        d["totalNewPlacements"] = d["offPremNewCount"] + d["draftQualifiedCount"]
        d["payout"] = d["packagePayout"] + d["draftPayout"]
        d["offPremNew"].sort(key=lambda e: (-e["rate"], e["date"] or ""))
        d["draftAccounts"].sort(key=lambda a: -a["bbl"])
        d["draftChannelOk"] = bool(d["draftAccounts"]) or d["draftNewCount"] > 0
        d["offPremTargets"], d["offPremTargetCount"] = targets_from(
            base_accounts(rep, premise="Off Premise"),
            {c for (r, c) in pkg_by_cust if r == rep})
        leaderboard.append({"rep": rep, "newPlacements": d["totalNewPlacements"],
                            "payout": d["payout"]})
    leaderboard.sort(key=lambda x: (-x["newPlacements"], -x["payout"]))
    for i, e in enumerate(leaderboard):
        e["rank"] = i + 1
    return {"byRep": by_rep, "leaderboard": leaderboard,
            "meta": {"draftMinBbl": round(DRAFT_MIN_BBL, 3),
                     "rates": {"sixpack": 10, "twelvepack": 15, "nineteen2": 15, "draft": 100}}}


def build_evil_genius():
    """Evil Genius Core Growth, September 2026 (deck p4).

        Qualifier: 3 placements minimum before ANYTHING pays
        $10  every new off-premise placement of Stacy's Mom, Adulting or 867-5309
        $100 every new placement of Stacy's Mom DRAFT, 1x1/2bbl or 2x1/6bbl min
        Bonus: $1 for every CE sold over 2025 sales

    Off-premise placements pay one flat rate, so they use the account-level
    rule (1911 precedent) rather than Montauk's per-tier split.

    THE BONUS IS SCORED as of the 2026-09-02 re-export. The first export
    baselined against a full calendar year (1/1-12/31/2025) set beside a single
    September, which nobody could ever beat -- 7 CE against 1,230 house-wide --
    so it was left uncounted. Gavin re-pulled it against 9/1-9/30/2025, the
    like-for-like month, and the bonus now pays $1 per CE over that figure.
    The baseline column is located by its embedded date rather than by name, so
    this needed no code change when the window moved.

    Bonus CE is floored at zero per rep: being down against last September
    costs nothing, it just pays nothing. And the bonus is gated by the same
    3-placement qualifier as everything else -- the deck says "3 placements
    minimum for any payout", not just for the placement money.
    """
    rows = read_rows("evil_genius.csv")
    fields = list(rows[0].keys()) if rows else []
    # Three dated periods here (2025 full year, Jun-Aug 2026, Sept 2026), so
    # find_period_cols -- which insists on exactly two -- cannot be used.
    def dated(prefix):
        out = []
        for c in fields:
            if c.startswith(prefix + " "):
                m = DATE_RE.search(c)
                if m:
                    out.append((int(m.group(3)), int(m.group(1)), int(m.group(2)), c))
        out.sort()
        return [c for *_, c in out]
    case_cols, place_cols = dated("Cases"), dated("Placement Count")
    case_baseline, _case_base, case_current = case_cols
    place_base, place_current = place_cols[-2], place_cols[-1]
    baseline_window = case_baseline.split("  ")[-1].strip() or "prior year"

    QUALIFIER = 3
    by_rep = {rep: {"offPremNew": [], "offPremNewCount": 0, "offPremReorderCount": 0,
                    "draftNew": [], "draftNewCount": 0, "draftReorderCount": 0,
                    "draftQualifiedCount": 0, "draftAccounts": [],
                    "totalNewPlacements": 0, "qualified": False, "toQualifier": QUALIFIER,
                    "caseVolume": 0.0, "casesBaseline": 0.0,
                    "bonusCe": 0.0, "bonusPayout": 0, "payout": 0,
                    "draftChannelOk": False}
              for rep in ROSTER}

    off_by_cust = defaultdict(list)
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        by_rep[rep]["caseVolume"] += to_num(row[case_current])
        by_rep[rep]["casesBaseline"] += to_num(row[case_baseline])
        if _premise(row) == "Off Premise":
            off_by_cust[(rep, row["Customer Num"])].append(row)

    for key, status in classify_by_customer(off_by_cust, place_base, place_current).items():
        rep, _cust = key
        krows = off_by_cust[key]
        if status == "new":
            cur = [r for r in krows if r[place_current].strip()]
            dates = sorted((r["Date"] for r in cur), reverse=True)
            by_rep[rep]["offPremNew"].append({
                "customer": krows[0]["Customer Name"],
                "products": sorted({r["Product Name"] for r in cur}),
                "date": dates[0] if dates else None,
            })
            by_rep[rep]["offPremNewCount"] += 1
        elif status == "reorder":
            by_rep[rep]["offPremReorderCount"] += 1

    # Draft leg is Stacy's Mom only, per the deck.
    d_by_cust, d_bbl, d_name, d_class = _draft_accounts(
        rows, place_base, place_current, case_current,
        product_filter=lambda p: "stacy" in p.lower())
    for key, status in d_class.items():
        rep, _cust = key
        if rep not in by_rep:
            continue
        bbl = round(d_bbl[key], 3)
        qualifies = bbl >= DRAFT_MIN_BBL
        by_rep[rep]["draftAccounts"].append({"customer": d_name[key], "bbl": bbl,
                                             "qualifies": qualifies, "status": status})
        if status == "new":
            dates = sorted((r["Date"] for r in d_by_cust[key] if r[place_current].strip()), reverse=True)
            by_rep[rep]["draftNew"].append({"customer": d_name[key], "bbl": bbl,
                                            "qualifies": qualifies,
                                            "date": dates[0] if dates else None})
            by_rep[rep]["draftNewCount"] += 1
            if qualifies:
                by_rep[rep]["draftQualifiedCount"] += 1
        elif status == "reorder":
            by_rep[rep]["draftReorderCount"] += 1

    leaderboard = []
    for rep, d in by_rep.items():
        d["caseVolume"] = round(d["caseVolume"], 2)
        d["casesBaseline"] = round(d["casesBaseline"], 2)
        d["totalNewPlacements"] = d["offPremNewCount"] + d["draftQualifiedCount"]
        d["qualified"] = d["totalNewPlacements"] >= QUALIFIER
        d["toQualifier"] = max(0, QUALIFIER - d["totalNewPlacements"])
        # Growth over the same month last year, floored at zero -- being down
        # against last September pays nothing, it does not claw anything back.
        d["bonusCe"] = round(max(0.0, d["caseVolume"] - d["casesBaseline"]), 2)
        d["bonusPayout"] = int(round(d["bonusCe"])) if d["qualified"] else 0
        # Nothing pays until the 3-placement qualifier is cleared -- the deck
        # gates "any payout" on it, the bonus included.
        d["payout"] = (d["offPremNewCount"] * 10 + d["draftQualifiedCount"] * 100
                       + d["bonusPayout"]) if d["qualified"] else 0
        d["offPremNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["draftAccounts"].sort(key=lambda a: -a["bbl"])
        d["draftChannelOk"] = bool(d["draftAccounts"]) or d["draftNewCount"] > 0
        d["offPremTargets"], d["offPremTargetCount"] = targets_from(
            base_accounts(rep, premise="Off Premise"),
            {c for (r, c) in off_by_cust if r == rep})
        leaderboard.append({"rep": rep, "newPlacements": d["totalNewPlacements"],
                            "payout": d["payout"]})
    leaderboard.sort(key=lambda x: (-x["newPlacements"], -x["payout"]))
    for i, e in enumerate(leaderboard):
        e["rank"] = i + 1
    return {"byRep": by_rep, "leaderboard": leaderboard,
            "meta": {"qualifier": QUALIFIER, "draftMinBbl": round(DRAFT_MIN_BBL, 3),
                     "bonusScored": True, "baselineWindow": baseline_window,
                     "rates": {"offPrem": 10, "draft": 100, "bonusPerCe": 1}}}


def build_touchdowns_tea():
    """Touchdowns & Tea, September 2026 (deck p3). Two exports, two channels.

    OFF PREMISE  $15 per new placement of 12pks (Sun Cruiser or Twisted Tea)
                 $1 per case on the floor with football POS, 25-case minimum,
                 not co-branded, iSellBeer picture required
    ON PREMISE   $1 per case sold
                 $25 per account running a football feature, iSellBeer menu or
                 bucket picture required, bucket special under $35 for 5 cans

    Only two of those four legs can be scored from RDE. The $1/case FLOOR
    payout and the $25 feature both depend on a photo and on POS conditions no
    export carries, so they are shown as descriptive blocks the way Keystone's
    cooler-door photos are, and are excluded from the payout figure.

    The off-premise export arrives pre-filtered to 12-packs (every row is a
    2/12/12oz pack), so no product filter is applied here -- if a future export
    widens, this needs a 12pk filter added or it will over-count placements.
    """
    off_rows, on_rows = read_rows("touchdowns_tea_off.csv"), read_rows("touchdowns_tea_on.csv")
    of, onf = off_rows[0].keys(), on_rows[0].keys()
    off_pb, off_pc = find_period_cols(of, "Placement Count")
    off_cb, off_cc = find_period_cols(of, "Cases")
    on_cb, on_cc = find_period_cols(onf, "Cases")

    def brand(product):
        return "Sun Cruiser" if "sun cruiser" in product.lower() else "Twisted Tea"

    by_rep = {rep: {"offPremNew": [], "offPremNewCount": 0, "offPremReorderCount": 0,
                    "offPremCases": 0.0, "onPremCases": 0.0,
                    "onPremAccounts": [], "onPremAccountCount": 0,
                    "placementPayout": 0, "onPremCasePayout": 0, "payout": 0,
                    "byBrand": {"Sun Cruiser": 0, "Twisted Tea": 0}}
              for rep in ROSTER}

    off_by_cust = defaultdict(list)
    for row in off_rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        by_rep[rep]["offPremCases"] += to_num(row[off_cc])
        off_by_cust[(rep, row["Customer Num"])].append(row)

    for key, status in classify_by_customer(off_by_cust, off_pb, off_pc).items():
        rep, _cust = key
        krows = off_by_cust[key]
        if status == "new":
            cur = [r for r in krows if r[off_pc].strip()]
            dates = sorted((r["Date"] for r in cur), reverse=True)
            brands = sorted({brand(r["Product Name"]) for r in cur})
            by_rep[rep]["offPremNew"].append({
                "customer": krows[0]["Customer Name"],
                "brands": brands,
                "date": dates[0] if dates else None,
            })
            by_rep[rep]["offPremNewCount"] += 1
            for b in brands:
                by_rep[rep]["byBrand"][b] += 1
        elif status == "reorder":
            by_rep[rep]["offPremReorderCount"] += 1

    on_by_cust = defaultdict(float)
    on_name = {}
    for row in on_rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        cases = to_num(row[on_cc])
        by_rep[rep]["onPremCases"] += cases
        if cases:
            on_by_cust[(rep, row["Customer Num"])] += cases
            on_name[(rep, row["Customer Num"])] = row["Customer Name"]

    for (rep, _cust), cases in on_by_cust.items():
        by_rep[rep]["onPremAccounts"].append({"customer": on_name[(rep, _cust)],
                                              "cases": round(cases, 2)})

    leaderboard = []
    for rep, d in by_rep.items():
        d["offPremCases"] = round(d["offPremCases"], 2)
        d["onPremCases"] = round(d["onPremCases"], 2)
        d["onPremAccounts"].sort(key=lambda a: -a["cases"])
        d["onPremAccountCount"] = len(d["onPremAccounts"])
        d["placementPayout"] = d["offPremNewCount"] * 15
        d["onPremCasePayout"] = int(round(d["onPremCases"]))
        d["payout"] = d["placementPayout"] + d["onPremCasePayout"]
        d["offPremNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["offPremTargets"], d["offPremTargetCount"] = targets_from(
            base_accounts(rep, premise="Off Premise"),
            {c for (r, c) in off_by_cust if r == rep})
        leaderboard.append({"rep": rep, "payout": d["payout"],
                            "newPlacements": d["offPremNewCount"]})
    # Ranked on trackable payout, not placements alone: the two legs pay $15 and
    # $1, so neither channel on its own represents where a rep stands.
    leaderboard.sort(key=lambda x: (-x["payout"], -x["newPlacements"]))
    for i, e in enumerate(leaderboard):
        e["rank"] = i + 1
    return {"byRep": by_rep, "leaderboard": leaderboard,
            "meta": {"rates": {"placement": 15, "onPremCase": 1, "floorCase": 1,
                               "feature": 25, "floorMinCases": 25},
                     "photoLegsTracked": False}}


def build_two_xo():
    """2XO Bourbon, Sept-Oct 2026 (retro August) (deck p9).

        OFF-PREMISE  $40 for 1 case American Oak + 1 case French Oak together
                     +$35 more for 1 case White Oak Rye on top of that pair
        ON-PREMISE   a 2-bottle POD qualifier pays $25, every 2-bottle POD pays
                     $15 per POD cocktail menu placement (photo verified)
        Targets 60-day non-buy accounts; August activity counts retroactively,
        which is why the base window here is only 6/1-7/31 (60 days), not the
        90-day window every other September program uses.

    OFF-PREMISE pays for the PAIR, not either oak alone -- "1 case American
    Oak + 1 case French Oak pays $40" -- so classification runs per (rep,
    customer, product) rather than Gavin's usual account-level rule
    (2026-08-17): an account opening with American Oak only is not yet a
    placement this program pays for, so collapsing to the account grain would
    have to invent whether a single-SKU open counts, which the deck doesn't
    say. Comparing every new account's set of newly-placed products against
    {American Oak, French Oak} keeps that distinction instead of guessing it
    away. White Oak Rye is coded the same way (stacks an extra $35 on an
    already-paired account) but has never appeared in an export yet, so it is
    currently always $0 -- not a bug, just no data to trigger it.

    ON-PREMISE: RESOLVED 2026-09-04, per Gavin -- "it doesn't matter the
    specific product, it is just 2 pods for 2xo for the on premise." So
    unlike off-premise, product identity doesn't matter here: this is the
    ACCOUNT-level rule (Gavin's usual one), summing UNITS (not cases) across
    every 2XO product a NEW account buys in the current window. >=2 units
    pays $25 flat, once, on the account's first qualifying window -- same
    "pays once per new account" convention as every other new-placement
    program on this page, not a repeating bonus each time 2+ units ship. The
    export's Units column arrived with this refresh specifically to settle
    this (Cases alone was ambiguous -- see git history). No on-premise row in
    the current export is both non-buy AND >=2 units yet (the one on-premise
    account with current-window activity, Andiamo, already bought French Oak
    in the base window, so it's a reorder), so this leg pays $0 today; the
    mechanism is verified against that by hand, not just "runs without
    crashing."

    The $15 POD-cocktail-menu leg is still photo-verified with no export --
    "shown, not scored" treatment, same as touchdowns_tea's floor/feature legs.
    """
    rows = read_rows("two_xo.csv")
    fields = rows[0].keys() if rows else []
    place_base, place_current = find_period_cols(fields, "Placement Count")
    unit_base, unit_current = find_period_cols(fields, "Units")

    def oak(product):
        p = (product or "").lower()
        if "american oak" in p:
            return "American Oak"
        if "french oak" in p:
            return "French Oak"
        if "white oak rye" in p:
            return "White Oak Rye"
        return None

    by_rep = {rep: {"offPremNew": [], "offPremSingles": [], "offPremNewCount": 0,
                    "offPremReorderCount": 0, "onPremNew": [], "onPremBuilding": [],
                    "onPremNewCount": 0, "onPremReorderCount": 0,
                    "onPremUnits": 0.0, "onPremPayout": 0, "payout": 0}
              for rep in ROSTER}

    off_by_sku = defaultdict(list)    # (rep, customer, oak) -> rows
    on_by_cust = defaultdict(list)    # (rep, customer) -> rows (any product)
    cust_name = {}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        cust_name[(rep, row["Customer Num"])] = row["Customer Name"]
        by_rep[rep]["onPremUnits"] += to_num(row[unit_current]) if _premise(row) == "On Premise" else 0
        if _premise(row) == "On Premise":
            on_by_cust[(rep, row["Customer Num"])].append(row)
            continue
        product = oak(row["Product Name"])
        if not product:
            continue
        off_by_sku[(rep, row["Customer Num"], product)].append(row)

    sku_status = classify_by_customer(off_by_sku, place_base, place_current)
    new_products = defaultdict(set)   # (rep, customer) -> {oak names newly placed}
    any_off_reorder = set()
    for (rep, cust, product), status in sku_status.items():
        if status == "new":
            new_products[(rep, cust)].add(product)
        elif status == "reorder":
            any_off_reorder.add((rep, cust))

    for (rep, cust), products in new_products.items():
        krows = [r for p in products for r in off_by_sku[(rep, cust, p)] if r[place_current].strip()]
        dates = sorted((r["Date"] for r in krows), reverse=True)
        date = dates[0] if dates else None
        if {"American Oak", "French Oak"} <= products:
            payout = 40 + (35 if "White Oak Rye" in products else 0)
            by_rep[rep]["offPremNew"].append({
                "customer": cust_name[(rep, cust)], "products": sorted(products),
                "payout": payout, "date": date,
            })
            by_rep[rep]["offPremNewCount"] += 1
            by_rep[rep]["payout"] += payout
        else:
            by_rep[rep]["offPremSingles"].append({
                "customer": cust_name[(rep, cust)], "products": sorted(products), "date": date,
            })
    for (rep, cust) in any_off_reorder:
        by_rep[rep]["offPremReorderCount"] += 1

    on_status = classify_by_customer(on_by_cust, place_base, place_current)
    for (rep, cust), status in on_status.items():
        if status == "reorder":
            by_rep[rep]["onPremReorderCount"] += 1
            continue
        if status != "new":
            continue
        krows = on_by_cust[(rep, cust)]
        units = sum(to_num(r[unit_current]) for r in krows)
        dates = sorted((r["Date"] for r in krows if r[unit_current].strip()), reverse=True)
        date = dates[0] if dates else None
        entry = {"customer": cust_name[(rep, cust)], "units": units, "date": date}
        if units >= 2:
            entry["payout"] = 25
            by_rep[rep]["onPremNew"].append(entry)
            by_rep[rep]["onPremNewCount"] += 1
            by_rep[rep]["onPremPayout"] += 25
            by_rep[rep]["payout"] += 25
        else:
            by_rep[rep]["onPremBuilding"].append(entry)

    leaderboard = []
    for rep, d in by_rep.items():
        d["onPremUnits"] = round(d["onPremUnits"], 1)
        d["offPremNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["onPremNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        leaderboard.append({"rep": rep, "payout": d["payout"],
                            "newPlacements": d["offPremNewCount"] + d["onPremNewCount"]})
    leaderboard.sort(key=lambda x: (-x["payout"], -x["newPlacements"]))
    for i, e in enumerate(leaderboard):
        e["rank"] = i + 1
    return {"byRep": by_rep, "leaderboard": leaderboard,
            "meta": {"rates": {"pair": 40, "rye": 35, "pod": 25, "podMenu": 15},
                     "onPremScored": True}}


# Kohler's most recent Southern District off-premise account pull -- read
# ONLY to route Other Half's off-premise payout formula (see
# build_other_half()). Cross-folder read, same pattern as KEYSTONE_JSON /
# AUCTION_INDEX above -- territory-accounts/ is a repo-root utility shared
# with MPOs/, not something to duplicate into this folder's data/.
SOUTHERN_DISTRICT_OFF_CSV = Path(__file__).resolve().parent.parent / "territory-accounts" / "southern_district_off_prem.csv"


def _southern_district_off_accounts():
    if not SOUTHERN_DISTRICT_OFF_CSV.exists():
        return set()
    with open(SOUTHERN_DISTRICT_OFF_CSV, newline="", encoding="utf-8-sig") as f:
        return {r["Customer Num"] for r in csv.DictReader(f)}


def split_customer(raw):
    """"9002 Tavern 5_2" -> ("9002", "Tavern 5_2"). Other Half's exports pack
    Customer Num and Company into one column the way September's on-prem MPO
    exports do -- see MPOs/on-prem/generate_2026-09.py's split_customer()."""
    raw = (raw or "").strip()
    m = re.match(r"(\d+)\s+(.*)", raw)
    if not m:
        return None, raw
    return m.group(1), m.group(2)


def build_other_half():
    """Other Half Target Account Launch, Sept-Dec 2026 (deck p4).

        ON-PREMISE 1st half (Sept-Oct): a non-buy target account buying OH
                   core draft in BOTH months pays $150
        ON-PREMISE 2nd half (Nov-Dec): the same account buying both months
                   again pays $250
                   (account must purchase 1/2 bbl, or two 1/6 bbls, each month)
        OFF-PREMISE $40 per non-buy account opened with a minimum of 3 core
                   SKUs, +$10 for every SKU beyond the first 3
        SOUTHERN DISTRICT $50 per account opened with Other Half

    EVERY ACCOUNT IS NON-BUY -- confirmed by Gavin, 2026-09-04 ("we just
    acquired this brand so there is no base period ... every account is a
    non buy"). Other Half has no history with Kohler before this export, so
    unlike every other new-placement program on this page there is no
    base/current column pair to classify against: both exports are a SINGLE
    WINDOW (9/1-10/31), and every row in them qualifies as non-buy by
    definition. That resolves the biggest blocker to scoring this program at
    all. Two things remain open, and they are handled differently:

    OFF-PREMISE SOUTHERN DISTRICT RATE IS A READING OF THE DECK, NOT A
    CONFIRMATION FROM KOHLER. The "minimum of 3 core SKUs" / "$10 per SKU
    beyond the first 3" language only appears on the two bullets that don't
    mention Southern District; the Southern District bullet stands alone
    with no SKU count at all. Taken at face value, that means a Southern
    District account gets a flat $50 per account opened -- no 3-SKU
    minimum -- INSTEAD OF the $40+$10/extra formula, not on top of it.
    Territory is resolved against territory-accounts/southern_district_off_prem.csv
    (that folder's most recent Southern District off-premise pull, see its
    README); an account not found there -- Core Market, or one of the areas
    that pull doesn't cover -- scores under the standard formula. This
    prices real dollars on a specific reading of ambiguous deck wording, so
    the card says so and it needs Kohler confirmation, same spirit as
    Montauk's placement-grain footnote.

    ON-PREMISE IS NOT SCORED -- this one is a data gap, not a reading
    question. The $150 needs the SAME account to buy in BOTH September and
    October; only September exists right now. September activity is shown
    as "bought this month, needs October too" progress with NO dollar
    figure attached -- attaching one would overstate a confirmed payout that
    doesn't exist yet. Comes back and gets priced once an October export
    lands; the account-level tracking here (draft volume vs. the 1/3 bbl
    floor) is what that will key off.
    """
    off_rows = read_rows("other_half_off.csv")
    on_rows = read_rows("other_half_on.csv")
    off_unit_col = find_single_col(off_rows[0].keys(), "Units") if off_rows else None
    on_unit_col = find_single_col(on_rows[0].keys(), "Units") if on_rows else None
    south_accounts = _southern_district_off_accounts()

    by_rep = {rep: {"offPremNew": [], "offPremNewCount": 0, "offPremPayout": 0,
                    "onPremSeptember": [], "onPremQualifyingCount": 0,
                    "payout": 0}
              for rep in ROSTER}

    off_by_cust = defaultdict(set)   # (rep, customer) -> {product keys}
    cust_name = {}
    for row in off_rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        num, name = split_customer(row["Customer Num & Company"])
        if not num:
            continue
        off_by_cust[(rep, num)].add(row["Product Num & Name"])
        cust_name[(rep, num)] = name

    for (rep, num), products in off_by_cust.items():
        sku_count = len(products)
        if sku_count < 1:
            continue
        southern = num in south_accounts
        if southern:
            payout = 50
        elif sku_count >= 3:
            payout = 40 + 10 * (sku_count - 3)
        else:
            continue
        by_rep[rep]["offPremNew"].append({
            "customer": cust_name[(rep, num)], "skuCount": sku_count,
            "southern": southern, "payout": payout,
        })
        by_rep[rep]["offPremNewCount"] += 1
        by_rep[rep]["offPremPayout"] += payout
        by_rep[rep]["payout"] += payout

    on_by_cust = defaultdict(list)
    for row in on_rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        num, name = split_customer(row["Customer Num & Company"])
        if not num:
            continue
        on_by_cust[(rep, num)].append(row)
        cust_name[(rep, num)] = name

    for (rep, num), krows in on_by_cust.items():
        bbl = sum((keg_bbl(r["Package"]) or 0.0) * to_num(r[on_unit_col]) for r in krows)
        bbl = round(bbl, 3)
        qualifies = bbl >= DRAFT_MIN_BBL
        by_rep[rep]["onPremSeptember"].append({
            "customer": cust_name[(rep, num)], "bbl": bbl, "qualifies": qualifies,
        })
        if qualifies:
            by_rep[rep]["onPremQualifyingCount"] += 1

    leaderboard = []
    for rep, d in by_rep.items():
        d["offPremNew"].sort(key=lambda e: -e["payout"])
        d["onPremSeptember"].sort(key=lambda e: -e["bbl"])
        leaderboard.append({"rep": rep, "payout": d["payout"], "newPlacements": d["offPremNewCount"]})
    leaderboard.sort(key=lambda x: (-x["payout"], -x["newPlacements"]))
    for i, e in enumerate(leaderboard):
        e["rank"] = i + 1
    return {"byRep": by_rep, "leaderboard": leaderboard,
            "meta": {"rates": {"offPrem": 40, "offPremExtraSku": 10, "southernDistrict": 50,
                               "onPrem1stHalf": 150, "onPrem2ndHalf": 250},
                     "draftMinBbl": round(DRAFT_MIN_BBL, 3), "onPremScored": False,
                     "southernDistrictReading": "unconfirmed"}}


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
        "le_grand_noir": build_le_grand_noir(),
        "new_belgium_distribution": build_new_belgium_distribution(),
        "mc_retention": build_mc_retention(),
        "mabi_retention": build_mabi_retention(),
        "constellation_retention": build_constellation_retention(),
        "yuengling_retention": build_yuengling_retention(),
        "display_auction": build_display_auction(),
    }

    # September 2026 lives in its own blob. The September registry in
    # index.html reads PROGRAM_DATA_2026_09, and every program in it that has
    # no builder yet stays on the zero-state card -- so programs switch on one
    # at a time as their data arrives, without touching the August tab.
    data_09 = {
        "keystone_ice": build_keystone_ice(),
        "touchdowns_tea": build_touchdowns_tea(),
        "evil_genius": build_evil_genius(),
        "montauk": build_montauk(),
        "two_xo": build_two_xo(),
        "other_half": build_other_half(),
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
    blocked = sorted(rep for rep, d in data["boston_beer"]["byRep"].items() if not d["territoryEligible"])
    print(f"territory-blocked reps: {blocked}")
    nb_na = sorted(rep for rep, d in data["new_belgium"]["byRep"].items() if d["territoryEligible"] and not d["draftEligible"])
    print(f"new_belgium draft-not-applicable (no keg-capable Core Market on-prem accounts): {nb_na}")
    d1911 = sorted(rep for rep, d in data["1911"]["byRep"].items() if not d["draftChannelOk"])
    print(f"1911/woodchuck draft section n/a (no keg-capable on-prem accounts anywhere): {d1911}")
    bb_draft_na = sorted(rep for rep, d in data["boston_beer"]["byRep"].items() if d["territoryEligible"] and not d["draftChannelOk"])
    bb_pkg_na = sorted(rep for rep, d in data["boston_beer"]["byRep"].items() if d["territoryEligible"] and not d["packageChannelOk"])
    print(f"boston_beer draft section n/a: {bb_draft_na} | package section n/a: {bb_pkg_na}")
    yave_on_na = sorted(rep for rep, d in data["yave"]["byRep"].items() if not d["hasOnPremAccounts"])
    yave_off_na = sorted(rep for rep, d in data["yave"]["byRep"].items() if not d["hasOffPremAccounts"])
    print(f"yave on-prem section n/a: {yave_on_na} | off-prem section n/a: {yave_off_na}")
    lytt_na = sorted(rep for rep, d in data["lytt"]["byRep"].items() if d["territoryEligible"] and not d["programEligible"])
    print(f"lytt not-applicable (no eligible off-prem accounts): {lytt_na}")

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
    print(f"le_grand_noir: {data['le_grand_noir']['companyCases']} / {data['le_grand_noir']['houseGoal']} house cases")
    print(f"new_belgium_distribution: {sum(d['pushVolumeCE'] for d in data['new_belgium_distribution']['byRep'].values()):.0f} total Aug push-volume CE")
    mc = data["mc_retention"]["byRep"]
    mc_with_goals = sum(1 for d in mc.values() if d["goalsTotal"] > 0)
    print(f"mc_retention: {mc_with_goals} reps with goals, "
          f"{sum(d['goalsRetained'] for d in mc.values())} / {sum(d['goalsTotal'] for d in mc.values())} brand goals retained, "
          f"off {sum(d['offActual'] for d in mc.values())} / {sum(d['offGoal'] for d in mc.values())} placements, "
          f"on {sum(d['onActual'] for d in mc.values())} / {sum(d['onGoal'] for d in mc.values())} buyers")

    mabi = data["mabi_retention"]["byRep"]
    mabi_goaled = [d for d in mabi.values() if d["goal"]]
    print(f"mabi_retention: house {data['mabi_retention']['houseTotal']} / {data['mabi_retention']['houseGoal']} MADE PODs "
          f"({'MET' if data['mabi_retention']['houseMet'] else 'not met'}), "
          f"{sum(1 for d in mabi_goaled if d['retained'])} / {len(mabi_goaled)} reps at 90%+ of goal, "
          f"{sum(1 for d in mabi_goaled if d['hitFullGoal'])} at 100%+, "
          f"{sum(1 for d in mabi.values() if d['inReport'] and not d['goal'])} reps with activity but no goal")

    con = data["constellation_retention"]
    con_goaled = [d for d in con["byRep"].values() if d["offGoalsTotal"]]
    print(f"constellation_retention: house off-prem {con['houseOffMet']} / {con['houseOffTotal']} goals met "
          f"({', '.join(h['label']+' '+str(h['total'])+'/'+str(h['goal'])+('' if h['met'] else ' SHORT '+str(h['short'])) for h in con['houseOff'])}), "
          f"{sum(d['offGoalsRetained'] for d in con_goaled)} / {sum(d['offGoalsTotal'] for d in con_goaled)} rep category goals at 90%+, "
          f"{len(con_goaled)} reps with goals")
    print(f"constellation on-prem: packages {sum(d['onPkgTotal'] for d in con['byRep'].values())} buyers across "
          f"{sum(1 for d in con['byRep'].values() if d['onPkgTotal'])} reps | draft "
          f"{sum(d['draftNewLineCount'] for d in con['byRep'].values())} new lines "
          f"({sum(d['draftNewTargetedCount'] for d in con['byRep'].values())} targeted Modelo), "
          f"{sum(d['draftBarrels'] for d in con['byRep'].values()):.0f} total bbl (no goals tracked on draft, per Gavin) | "
          f"new draft buyers (distinct accounts) {sum(d['draftNewAccountCount'] for d in con['byRep'].values())} | "
          f"regular draft buyers {sum(d['regBuyersTotal'] for d in con['byRep'].values())} across "
          f"{sum(1 for d in con['byRep'].values() if d['regBuyersTotal'])} reps")

    da = data["display_auction"]
    if da["byRep"]:
        top = max(da["byRep"].items(), key=lambda kv: kv[1]["points"])
        print(f"display_auction: {da['houseRepPoints']:,} pts across {da['repCount']} reps "
              f"({da['houseRepDisplays']} qualifying displays), top {top[0]} {top[1]['points']:,} | "
              f"excluded {len(da['excludedNames'])} non-roster ({da['excludedPoints']:,} pts): "
              f"{', '.join(da['excludedNames'])} | tracker window {da['meta'].get('startDate')} - {da['meta'].get('endDate')}")

    ki = data_09["keystone_ice"]
    if ki["byRep"]:
        qualified = [r for r, d in ki["byRep"].items() if d["qualified"]]
        lead = min(ki["byRep"].items(), key=lambda kv: kv[1]["rank"])
        print(f"keystone_ice: {ki['meta']['houseAccounts']} accounts house-wide, "
              f"{len(qualified)} of {ki['meta']['repCount']} reps qualified, "
              f"leader {lead[0]} {lead[1]['accounts']} of {lead[1]['qualifier']} ({lead[1]['pct']}%)"
              + (f" | off-roster, not shown: {', '.join(ki['meta']['offRoster'])}" if ki["meta"]["offRoster"] else ""))

    td = data_09["touchdowns_tea"]["byRep"]
    print(f"touchdowns_tea: {sum(d['offPremNewCount'] for d in td.values())} new off-prem 12pk placements, "
          f"{sum(d['onPremCases'] for d in td.values()):,.0f} on-prem cases across "
          f"{sum(1 for d in td.values() if d['onPremAccountCount'])} reps "
          f"| trackable ${sum(d['payout'] for d in td.values()):,} (floor-display and feature legs are photo-verified, not scored)")

    eg = data_09["evil_genius"]["byRep"]
    eg_q = [r for r, d in eg.items() if d["qualified"]]
    eg_meta = data_09["evil_genius"]["meta"]
    eg_ahead = [r for r, d in eg.items() if d["bonusCe"] > 0]
    print(f"evil_genius: {sum(d['totalNewPlacements'] for d in eg.values())} new placements "
          f"({sum(d['draftQualifiedCount'] for d in eg.values())} qualifying draft), "
          f"{len(eg_q)} of {len(ROSTER)} reps past the 3-placement qualifier "
          f"| CE {sum(d['caseVolume'] for d in eg.values()):,.0f} vs {eg_meta['baselineWindow']} "
          f"{sum(d['casesBaseline'] for d in eg.values()):,.0f} -- {len(eg_ahead)} reps ahead, "
          f"{sum(d['bonusCe'] for d in eg.values()):,.0f} bonus CE, "
          f"${sum(d['bonusPayout'] for d in eg.values()):,} paid (qualifier-gated)")

    mo = data_09["montauk"]["byRep"]
    tiers = {t: sum(d["byTier"][t] for d in mo.values()) for t in ("sixpack", "twelvepack", "nineteen2")}
    print(f"montauk: {sum(d['totalNewPlacements'] for d in mo.values())} new placements "
          f"(6pk {tiers['sixpack']} + 12pk {tiers['twelvepack']} + 19.2oz {tiers['nineteen2']} "
          f"+ draft {sum(d['draftQualifiedCount'] for d in mo.values())}) "
          f"| {sum(d['newAccounts'] for d in mo.values())} distinct new ACCOUNTS if scored 1911-style "
          f"| ${sum(d['payout'] for d in mo.values()):,}")

    xo = data_09["two_xo"]["byRep"]
    xo_singles = sum(len(d["offPremSingles"]) for d in xo.values())
    xo_building = sum(len(d["onPremBuilding"]) for d in xo.values())
    print(f"two_xo: {sum(d['offPremNewCount'] for d in xo.values())} new off-premise pairs "
          f"(${sum(d['payout'] for d in xo.values()):,} paid total) | {xo_singles} single-oak opens not paid "
          f"(pair rule) | on-premise {sum(d['onPremNewCount'] for d in xo.values())} new 2+-unit PODs "
          f"(${sum(d['onPremPayout'] for d in xo.values()):,}), {xo_building} new accounts under 2 units "
          f"not yet paid, {sum(d['onPremUnits'] for d in xo.values()):,.1f} total on-premise units")

    oh = data_09["other_half"]["byRep"]
    oh_south = sum(1 for d in oh.values() for e in d["offPremNew"] if e["southern"])
    print(f"other_half: {sum(d['offPremNewCount'] for d in oh.values())} off-premise accounts opened "
          f"(${sum(d['offPremPayout'] for d in oh.values()):,} -- {oh_south} at the Southern District "
          f"$50 flat rate, unconfirmed reading) | on-premise {sum(len(d['onPremSeptember']) for d in oh.values())} "
          f"accounts active in September ({sum(d['onPremQualifyingCount'] for d in oh.values())} at the "
          f"1/3 bbl floor), NOT paid -- needs October to confirm the two-month hold")

    yu = data["yuengling_retention"]["byRep"]
    yu_goaled = [d for d in yu.values() if d["goalsTotal"]]
    print(f"yuengling_retention: {sum(d['goalsRetained'] for d in yu_goaled)} / {sum(d['goalsTotal'] for d in yu_goaled)} brand goals at 90%+ "
          f"across {len(yu_goaled)} reps | retention accounts held {sum(d['heldCount'] for d in yu.values())} / {sum(d['listedCount'] for d in yu.values())} "
          f"({sum(len(d['off']['atRisk']) + len(d['onPkg']['atRisk']) for d in yu.values())} at risk) | draft "
          f"{sum(d['draft']['units'] for d in yu.values())} units across {sum(1 for d in yu.values() if d['draftInReport'])} reps (no goals tracked)")

    payload = json.dumps(data, indent=2)
    html = INDEX_HTML.read_text()
    start_marker = "/* PROGRAM_DATA_START */"
    end_marker = "/* PROGRAM_DATA_END */"
    start = html.index(start_marker) + len(start_marker)
    end = html.index(end_marker)
    # CORE_MARKET_PROGRAM_KEYS is emitted from CORE_MARKET_PROGRAMS rather
    # than hand-maintained in index.html: the Python set drives eligibility
    # and the JS set drives the "Core Market" pill, and keeping them in sync
    # by hand silently mislabelled two programs' pills (2026-08-19).
    core_keys = json.dumps(sorted(CORE_MARKET_PROGRAMS | CORE_MARKET_PROGRAMS_PENDING))
    html = html[:start] + (f"\nconst PROGRAM_DATA = {payload};\n"
                           f"const CORE_MARKET_PROGRAM_KEYS = new Set({core_keys});\n") + html[end:]

    # September's blob is written the same way, into its own marker pair, so
    # the two months' datasets never have to be merged into one object.
    s09, e09 = "/* PROGRAM_DATA_09_START */", "/* PROGRAM_DATA_09_END */"
    i09 = html.index(s09) + len(s09)
    j09 = html.index(e09)
    html = html[:i09] + f"\nconst PROGRAM_DATA_2026_09 = {json.dumps(data_09, indent=2)};\n" + html[j09:]

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
