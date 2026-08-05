#!/usr/bin/env python3
"""Builds the embedded JSON in index.html from the raw incentive RDE exports.

Run: python3 generate.py
Reads everything from data/, writes the PROGRAM_DATA JSON block into
index.html between the START/END markers.
"""
import csv
import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
INDEX_HTML = Path(__file__).parent / "index.html"

ROSTER = ["Alex Rodriguez","Alisa Acciardi","Allison Scott","Andrew Lundy","Anthony Palmisano",
          "Brian Sengebush","Chris Payton","Dan Lagala","Dave Ehlers","Derrick Laws","Dylan Rubino",
          "Hakan Sadik","Jaime Colonna","Javier Melo","Jayson Romine","Jim Heaney","John O'Donoghue",
          "Klejdi Lamo","Matt Powierski","Michael Harboy","Mike Ast","Nick Melissari","Pablo Lopez",
          "Paul Mclaughlin","Phil Ernst","Robin Feldman","Shane Barreca"]

DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")


def to_num(s):
    s = (s or "").strip()
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


def new_rows_dual(rows, base_col, current_col, key_fields):
    """Group rows by key_fields; return set of keys that are 'new' this
    period (populated in current_col, never populated in base_col) and a
    dict of key -> list of matching rows (for date/detail lookups)."""
    by_key = {}
    for row in rows:
        key = tuple(row[k] for k in key_fields)
        by_key.setdefault(key, []).append(row)
    new_keys = set()
    for key, krows in by_key.items():
        has_current = any(to_num(r[current_col]) > 0 or r[current_col].strip() not in ("", None) for r in krows)
        has_base = any(r[base_col].strip() not in ("", None) for r in krows)
        if has_current and not has_base:
            new_keys.add(key)
    return new_keys, by_key


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


def build_1911_or_woodchuck(filename, bbl_threshold):
    rows = read_rows(filename)
    fieldnames = rows[0].keys() if rows else []
    base_col, current_col = find_period_cols(fieldnames, "Cases")
    _, place_current_col = find_period_cols(fieldnames, "Placement Count")
    place_base_col, _ = find_period_cols(fieldnames, "Placement Count")

    by_rep = {rep: {
        "offPremNew": [], "offPremNewCount": 0,
        "draftNew": [], "draftNewCount": 0,
        "draftAccounts": [], "draftAccountsQualified": 0,
        "caseVolume": 0.0,
        "totalNewPlacements": 0,
    } for rep in ROSTER}

    key_fields = ["Sales Rep Assigned", "Customer Num", "Product Num"]
    new_keys, by_key = new_rows_dual(rows, place_base_col, place_current_col, key_fields)

    # Barrel threshold is PER ACCOUNT (per Gavin, 2026-08-05): sum each
    # account's current-period keg volume across all its draft SKUs,
    # keyed by Customer Num alone (not by rep) since the account is the
    # unit the threshold applies to.
    account_bbl = {}
    account_name = {}
    account_rep = {}
    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        by_rep[rep]["caseVolume"] += to_num(row[current_col])
        if row["Premise"] == "On Premise" and is_keg_package(row["Package"]):
            cust = row["Customer Num"]
            bbl_each = keg_bbl(row["Package"]) or 0.0
            account_bbl[cust] = account_bbl.get(cust, 0.0) + bbl_each * to_num(row[current_col])
            account_name.setdefault(cust, row["Customer Name"])
            account_rep.setdefault(cust, rep)

    for key, krows in by_key.items():
        rep, cust_num, prod_num = key
        if rep not in by_rep:
            continue
        sample = krows[0]
        is_off_prem = sample["Premise"] == "Off Premise"
        is_draft = sample["Premise"] == "On Premise" and is_keg_package(sample["Package"])
        if key not in new_keys or not (is_off_prem or is_draft):
            continue
        entry = {
            "customer": sample["Customer Name"],
            "product": sample["Product Name"],
            "date": latest_date(krows, place_current_col),
        }
        if is_off_prem:
            by_rep[rep]["offPremNew"].append(entry)
            by_rep[rep]["offPremNewCount"] += 1
        elif is_draft:
            acct_bbl = account_bbl.get(cust_num, 0.0)
            entry["accountCumulativeBbl"] = round(acct_bbl, 2)
            entry["accountQualifies"] = acct_bbl >= bbl_threshold
            by_rep[rep]["draftNew"].append(entry)
            by_rep[rep]["draftNewCount"] += 1

    for cust, bbl in account_bbl.items():
        rep = account_rep[cust]
        if rep not in by_rep:
            continue
        by_rep[rep]["draftAccounts"].append({
            "customer": account_name[cust],
            "cumulativeBbl": round(bbl, 2),
            "qualifies": bbl >= bbl_threshold,
        })

    leaderboard = []
    for rep, d in by_rep.items():
        d["totalNewPlacements"] = d["offPremNewCount"] + d["draftNewCount"]
        d["caseVolume"] = round(d["caseVolume"], 2)
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
        "caseVolume24oz": 0.0, "caseVolumeOther": 0.0,
        "qualifies": False,
    } for rep in ROSTER}

    key_fields = ["Sales Rep Assigned", "Customer Num", "Product Num"]
    new_keys, by_key = new_rows_dual(rows, place_base_col, place_current_col, key_fields)

    for row in rows:
        rep = row["Sales Rep Assigned"]
        if rep not in by_rep:
            continue
        is_24oz = row["Package"] == "1/12/24oz Can"
        if is_24oz:
            by_rep[rep]["caseVolume24oz"] += to_num(row[case_current_col])
        else:
            by_rep[rep]["caseVolumeOther"] += to_num(row[case_current_col])

    for key, krows in by_key.items():
        rep, cust_num, prod_num = key
        if rep not in by_rep:
            continue
        sample = krows[0]
        if sample["Package"] != "1/12/24oz Can":
            continue
        entry = {
            "customer": sample["Customer Name"],
            "product": sample["Product Name"],
            "date": latest_date(krows, place_current_col),
        }
        by_rep[rep]["new24ozNew"].append(entry)
        by_rep[rep]["new24ozCount"] += 1

    for rep, d in by_rep.items():
        d["qualifies"] = d["caseVolume24oz"] >= 20
        d["caseVolume24oz"] = round(d["caseVolume24oz"], 2)
        d["caseVolumeOther"] = round(d["caseVolumeOther"], 2)
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
    } for rep in ROSTER}

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

    for rep, d in by_rep.items():
        d["isPositive"] = d["allSkuUnitsThisYear"] > d["allSkuUnitsLastYear"]
        d["octoberfestGrowth"] = round(d["octoberfestUnitsThisYear"] - d["octoberfestUnitsLastYear"], 2)
        for k in ("allSkuUnitsLastYear", "allSkuUnitsThisYear", "octoberfestUnitsLastYear", "octoberfestUnitsThisYear"):
            d[k] = round(d[k], 2)

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
        "packageNew": [], "packageNewCount": 0,
        "points": 0,
    } for rep in ROSTER}

    key_fields = ["Sales Rep Assigned", "Customer Num", "Product Num"]
    classified, by_key = classify_dual(rows, base_col, current_col, key_fields)

    for key, status in classified.items():
        rep, cust_num, prod_num = key
        if rep not in by_rep or status == "base_only":
            continue
        krows = by_key[key]
        sample = krows[0]
        is_draft = sample["Product Type"].startswith("Keg")
        is_package = sample["Product Type"].startswith("Case")
        entry = {
            "customer": sample["Customer Name"],
            "product": sample["Product Name"],
            "date": latest_date(krows, current_col),
        }
        if is_draft:
            if status == "new":
                by_rep[rep]["draftNew"].append(entry)
                by_rep[rep]["draftNewCount"] += 1
            elif status == "rebuy":
                by_rep[rep]["draftRebuy"].append(entry)
                by_rep[rep]["draftRebuyCount"] += 1
        elif is_package and status == "new":
            by_rep[rep]["packageNew"].append(entry)
            by_rep[rep]["packageNewCount"] += 1

    for rep, d in by_rep.items():
        d["points"] = (d["draftNewCount"] + d["draftRebuyCount"]) * 2 + d["packageNewCount"] * 1
        for k in ("draftNew", "draftRebuy", "packageNew"):
            d[k].sort(key=lambda e: e["date"] or "", reverse=True)

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
        "otherNamedKegCount": 0, "otherNamedKegVolumeBbl": 0.0,
        "housePods": 0,
    } for rep in ROSTER}

    key_fields = ["Sales Rep Assigned", "Customer Num", "Product Num"]
    classified, by_key = classify_dual(rows, base_col, current_col, key_fields)

    house_pods_total = 0
    for key, status in classified.items():
        rep, cust_num, prod_num = key
        krows = by_key[key]
        sample = krows[0]
        tier = new_belgium_tier(sample["Product Name"])
        if tier is None:
            continue
        if tier == "featured":
            house_pods_total += 1
            if rep in by_rep:
                by_rep[rep]["housePods"] += 1
        if rep not in by_rep:
            continue
        entry = {
            "customer": sample["Customer Name"],
            "product": sample["Product Name"],
            "date": latest_date(krows, current_col if status != "base_only" else base_col),
            "isHalfBbl": (keg_bbl(sample["Package"]) or 0.0) >= 0.5,
        }
        if tier == "featured":
            if status == "new":
                by_rep[rep]["featuredNew"].append(entry)
                by_rep[rep]["featuredNewCount"] += 1
            elif status == "rebuy":
                by_rep[rep]["featuredRebuy"].append(entry)
                by_rep[rep]["featuredRebuyCount"] += 1
        elif tier == "other_named" and status in ("new", "rebuy"):
            by_rep[rep]["otherNamedKegCount"] += 1
            bbl_each = keg_bbl(sample["Package"]) or 0.0
            current_units = sum(to_num(r[current_col]) for r in krows)
            by_rep[rep]["otherNamedKegVolumeBbl"] += bbl_each * current_units

    for rep, d in by_rep.items():
        d["featuredNew"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["featuredRebuy"].sort(key=lambda e: e["date"] or "", reverse=True)
        d["otherNamedKegVolumeBbl"] = round(d["otherNamedKegVolumeBbl"], 2)

    return {"byRep": by_rep, "housePodsTotal": house_pods_total, "houseGoal": 70}


def main():
    data = {
        "1911": build_1911_or_woodchuck("1911_rewards.csv", bbl_threshold=2.0),
        "woodchuck": build_1911_or_woodchuck("woodchuck_rewards.csv", bbl_threshold=3.0),
        "tona": build_tona(),
        "path_to_victory": build_path_to_victory(),
        "sam_adams": build_sam_adams(),
        "boston_beer": build_boston_beer(),
        "new_belgium": build_new_belgium(),
    }

    for key in ("1911", "woodchuck"):
        for rep, d in data[key]["byRep"].items():
            d["totalNewPlacements"] = d["offPremNewCount"] + d["draftNewCount"]

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

    payload = json.dumps(data, indent=2)
    html = INDEX_HTML.read_text()
    start_marker = "/* PROGRAM_DATA_START */"
    end_marker = "/* PROGRAM_DATA_END */"
    start = html.index(start_marker) + len(start_marker)
    end = html.index(end_marker)
    html = html[:start] + f"\nconst PROGRAM_DATA = {payload};\n" + html[end:]
    INDEX_HTML.write_text(html)
    print("Wrote PROGRAM_DATA into index.html")


if __name__ == "__main__":
    main()
