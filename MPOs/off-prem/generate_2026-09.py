#!/usr/bin/env python3
"""Builds September 2026's off-premise MPO datasets.

Per this folder's README, EACH MONTH GETS ITS OWN generate_<MONTH_KEY>.py
-- September's objectives share nothing with August's (Corona Premier/BBC
Lytt/Peroni+Banquet/Le Grand+Leyenda+Green River), so this is a sibling of
generate_2026-08.py rather than a branch inside it.

September's five objectives (September_2026_MPO.docx):
  30%  Constellation -- 30% Corona Gaintain Distro
  30%  Molson Coors  -- Keystone Ice 40% Buying Account
  15%  Molson Coors  -- Fever Tree (10) New Placements
  15%  Wine & Spirits -- (5) New Placements Any Brand
  10%  POS           -- (5) Cooler Door Stickers Any Brand in iSellBeer

--- Constellation: 30% Corona Gaintain Distro (pct_of_goal) ---
The RDE export is one row per rep/product with TWO placement columns:
9/1/2025 - 11/30/2025 (last fall) and 9/1/2026 - 11/30/2026 (this fall).
Per Gavin, 2026-09-02: "their goals is the distribution (placements) made
from 9/1/2025 - 11/30/2025. the 1st column." So each rep's GOAL is 30% of
their OWN prior-fall placement total -- a per-rep VARIABLE target, like
BBC Lytt's pct_of_base, except the denominator is last year's distribution
rather than an account base. Actuals are the 2026 column. Note this is a
THREE-MONTH program (Sept-Nov) tracked on September's tab, so partial
progress is expected all month -- unlike the other four, it does not
close out on 9/30.

RDE PREFIXES EACH REP'S BLOCK WITH A SUBTOTAL ROW, and that row reuses
the first product's name rather than saying "Total" -- Chris Payton's
first "Coronita Extra 1/24/7 oz Btl" row is 133, which is exactly
26+33+37+23+14, the sum of his five real rows. Summing every row
therefore counted each rep TWICE (house-wide 3,256 last fall instead of
1,628), and aggregating by product name folded the subtotal into a real
SKU of the same name on top of that. _strip_rep_subtotal_rows() drops
that first row per rep, and only when it actually equals the sum of the
rest in BOTH columns -- if RDE ever stops emitting it, the check fails
loudly rather than silently halving real placements. Found by Gavin,
2026-09-02: "you counted the goals for the reps (last fall + this fall)
2x".

--- Molson Coors: Keystone Ice 40% Buying Account (pct_of_base) ---
Same objective shape as August's BBC Lytt, at 40% instead of 25% and with
NO minimum-SKU bar (Keystone Ice 24 oz is a single SKU -- product 622 --
so "carries it" is simply "bought it"). Denominator is the off-premise
core territory (sales_reps_customer_base_core.csv), same file August used
for Lytt: Keystone is a Molson Coors beer sold in the same core counties.
The export's own window is 8/1/2026 - 9/30/2026 ("Keystone Ice 24 oz cans
are back" is an Aug-Sept push, and RDE built the export that way), so
EVERY row in it counts toward penetration, not just the September ones --
scoring September alone would ignore two thirds of the window RDE
measured. Buying accounts are counted DISTINCT: a rep who sold the same
store three times has one buying account.

--- Fever Tree (10) and Wine & Spirits (5): new placements ---
Both exports carry a base-period column (6/1/2026 - 8/31/2026, the 90-day
non-buy window) and a current column (9/1/2026 - 9/30/2026), so the
classification is a column read rather than the date-walking
classify_dual_period() August needed: NEW means the current window is
populated and the base window is not. Same rule as every prior month --
"no purchase in the prior ~90 days, a purchase this month" -- handed to
us pre-windowed.

SHAPE CHANGE, 2026-09-04 -- ONE ROW PER LOAD SHEET DATE. Both exports
gained a "Load Sheet Date" column and dropped "Placement Count Percentage
Total". They are now transaction logs: the same rep/account (Fever Tree)
or rep/account/SKU (Wine & Spirits) appears once per load sheet, each row
carrying only that sheet's window. The pre-2026-09-04 exports were
pre-aggregated, one row per key with both windows filled in on the same
row, which is why the original build_new_placements() classified row by
row.

That per-row read is now WRONG, and wrong in the dangerous direction. An
account that bought in July and again in September no longer has one row
with both columns filled -- it has a July row with only the base column
and a September row with only the current column, and the September row
read alone looks exactly like a brand-new placement. On this export that
turns Fever Tree's 1 genuinely new account into 20, and Wine & Spirits'
75 new placements into 129. build_new_placements() therefore folds every
row for a key together BEFORE classifying.

COUNTING PLACEMENTS ACROSS LOAD SHEETS -- the one open question here.
Progress counts PLACEMENTS, not rows: Wine & Spirits' export is
product-level with every current value 1.00, but Fever Tree's is
ACCOUNT-level (its only Brand Family is Fever Tree) with values from 1 to
19, so one newly-opened account placing 6 Fever Tree SKUs is 6 placements
toward the 10, not 1.

Summing a key's rows across load sheets does NOT reproduce the number the
old pre-aggregated export gave for the same window: Klejdi Lamo's Shop
Rite Stanhope reads 24 base placements on the 2026-09-02 export and 44 if
you sum the same window's load sheets on the 2026-09-04 one. The old
column was a DISTINCT count -- SKUs placed in the window -- and a SKU
reordered on three load sheets is one placement, not three. The new export
cannot be de-duplicated the same way, because for Fever Tree it never says
WHICH SKUs a load sheet carried, only how many.

So the value taken per key is the LARGEST SINGLE LOAD SHEET's count, not
the sum: it cannot over-credit a rep for reorders, where summing inflates
the base window by ~80%. It can under-credit an account that genuinely
adds new SKUs on a later sheet. Today the two agree exactly -- the one
newly-opened Fever Tree account has a single current-window row (6
placements on 9/2), and no Wine & Spirits key has more than one -- so
nothing rides on the choice yet, but it will once September fills in.
Both numbers print at build time so the gap stays visible.
OPEN WITH GAVIN: if a rep should be credited per load sheet line rather
than per distinct SKU, switch to the "current_sum" the aggregator already
tracks. Ideally RDE adds a product column to the Fever Tree export, which
would make the distinct count exact and retire the question.

--- POS: (5) Cooler Door Stickers ---
No data source yet (the iSellBeer photo export for cooler door stickers
hasn't been pulled), so it ships as a hasData:false placeholder in
index.html, exactly like July's Disruptors did. Nothing to generate.

To refresh: save new exports over the four CSVs named below, run this
script, commit and push. A "Load Sheet Date" column on Fever Tree or Wine
& Spirits is expected and handled; what must not change is the pair of
date-windowed "Placement Count" columns, which check_window() verifies
start on 6/1/2026 and 9/1/2026 and which the script refuses to guess at.
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

CONSTELLATION_CSV = HERE / "constellation_corona_gaintain.csv"
KEYSTONE_CSV = HERE / "keystone_ice_24oz.csv"
FEVER_TREE_CSV = HERE / "molson_coors_fever_tree.csv"
WINE_SPIRITS_CSV = HERE / "wine_spirits_new_placements.csv"
CUSTOMER_BASE_CORE_CSV = HERE / "sales_reps_customer_base_core.csv"

# KEYSTONE-ONLY ACCOUNT-BASE EXCLUSIONS (per Gavin, 2026-09-04). Accounts that
# sit in a rep's core off-premise book but must not count toward the Keystone
# Ice 40% objective -- so they come out of BOTH the penetration DENOMINATOR
# and the Keystone Target Accounts list, and nothing else.
#
# This lives here, in code, rather than as a hand-deletion from
# sales_reps_customer_base_core.csv, because that CSV is REGENERATED -- by
# convert_customer_base_core.py from Kohler's workbook, and by the repo-root
# territory-accounts/ pass. Either one would quietly hand the rows back and
# put Shane's denominator to 29 again with nothing in the diff to explain it.
#
# SCOPED TO KEYSTONE DELIBERATELY. Both accounts are still in Shane's Fever
# Tree Target Accounts list, because the ask named Keystone. If they should be
# out of the core book altogether, that is a different (and bigger) change --
# widen it here only on an explicit ask.
KEYSTONE_BASE_EXCLUDED = {
    # (rep, customer num): why
    ("Shane Barreca", "201097"): "Whole Foods #10381 (Closter)",
    ("Shane Barreca", "201098"): "Whole Foods #8407 (Woodcliff Lake)",
}


def keystone_excluded(rep, customer_num):
    return (rep.strip(), str(customer_num).strip()) in KEYSTONE_BASE_EXCLUDED


# Corona Gaintain's goal window (last fall) and this fall's actuals window.
CONSTELLATION_GOAL_PCT = 0.30
GOAL_WINDOW_START = datetime(2025, 9, 1)
ACTUAL_WINDOW_START = datetime(2026, 9, 1)

KEYSTONE_GOAL_PCT = 0.40


def load_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    # RDE exports consistently end with a trailing blank line -- drop any
    # row where every field is empty rather than special-casing it below.
    return [r for r in rows if any((v or "").strip() for v in r.values())]


def find_col(fieldnames, prefix):
    return next(c for c in fieldnames if c.startswith(prefix))


def to_num(raw):
    """Blank means "no rows in that window", which is 0 -- not missing."""
    raw = (raw or "").strip().replace(",", "")
    if raw == "":
        return 0.0
    return float(raw)


def window_cols(fieldnames, prefix):
    """Two columns share `prefix`, each carrying its own date window in the
    header (RDE's split-column shape -- see generate_2026-08.py's
    find_period_cols()). Sorted by the START date embedded in the header
    rather than matched on exact text, so a window that shifts by a day in
    a future export still resolves. Returns (earlier_col, later_col)."""
    # Only the DATE-WINDOWED columns. The 2026-09-04 exports dropped RDE's
    # trailing "Placement Count Percentage Total" roll-up, but older ones
    # carry it and it shares this prefix while having no window of its own,
    # so it stays filtered out rather than counted as a third period.
    cols = [f for f in fieldnames
            if f.startswith(prefix) and re.search(r"\d{1,2}/\d{1,2}/\d{4}", f)]
    if len(cols) != 2:
        raise SystemExit(f"Expected exactly 2 date-windowed {prefix!r} columns, found: {cols}")

    def start_date(col):
        m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", col)
        if not m:
            raise SystemExit(f"Could not find a date in column header: {col!r}")
        month, day, year = m.groups()
        return datetime(int(year), int(month), int(day))

    cols.sort(key=start_date)
    return cols[0], cols[1]


def check_window(col, expected_start, label):
    """The two-window columns are what every classification below turns on,
    so fail loudly if a re-pull silently moved one -- a base window that
    slid forward would quietly reclassify existing accounts as new."""
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", col)
    month, day, year = m.groups()
    got = datetime(int(year), int(month), int(day))
    if got != expected_start:
        raise SystemExit(
            f"{label}: expected a window starting {expected_start:%-m/%-d/%Y}, "
            f"got column {col!r}. Check the export's date range before rerunning."
        )


def split_customer(raw):
    """RDE's "Customer Num & Company"/"Customer Num Name" columns pack both
    into one string ("8007 Krauszer's Liquor Wine and Spirits")."""
    raw = (raw or "").strip()
    num, _, name = raw.partition(" ")
    return num.strip(), name.strip()


# ---------------------------------------------------------------- objective 1

def _strip_rep_subtotal_rows(rows, goal_col, actual_col):
    """Drop RDE's per-rep SUBTOTAL row -- see this script's docstring.

    It is the first row of each rep's block and carries the first product's
    name, so it cannot be spotted by label alone. It IS identifiable
    arithmetically: its value equals the sum of that rep's remaining rows in
    both columns. Only a row that passes that test is dropped, so if the export
    ever stops carrying subtotals nothing is silently thrown away -- the rep is
    left intact and a warning is printed.
    """
    by_rep = {}
    order = []
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        if not rep:
            continue
        if rep not in by_rep:
            by_rep[rep] = []
            order.append(rep)
        by_rep[rep].append(r)

    kept, dropped, suspicious = [], 0, []
    for rep in order:
        block = by_rep[rep]
        if len(block) >= 2:
            head, tail = block[0], block[1:]
            head_g, head_a = to_num(head[goal_col]), to_num(head[actual_col])
            tail_g = sum(to_num(r[goal_col]) for r in tail)
            tail_a = sum(to_num(r[actual_col]) for r in tail)
            if abs(head_g - tail_g) < 0.01 and abs(head_a - tail_a) < 0.01:
                kept.extend(tail)
                dropped += 1
                continue
            suspicious.append(rep)
        kept.extend(block)
    if suspicious:
        print(f"  Constellation: NO subtotal row detected for {len(suspicious)} rep(s) "
              f"({', '.join(sorted(suspicious))}) -- their rows were all kept. If the "
              f"export format changed, check this before trusting the totals.")
    return kept, dropped


def build_constellation():
    rows = load_csv(CONSTELLATION_CSV)
    goal_col, actual_col = window_cols(rows[0].keys(), "Corona Gaintain SKUs Placements")
    check_window(goal_col, GOAL_WINDOW_START, "Constellation goal window")
    check_window(actual_col, ACTUAL_WINDOW_START, "Constellation actuals window")
    rows, subtotals_dropped = _strip_rep_subtotal_rows(rows, goal_col, actual_col)
    print(f"  Constellation: dropped {subtotals_dropped} per-rep subtotal row(s) before totalling")

    # Aggregate by rep + product NAME: with the subtotal gone, a repeated name
    # is a genuine second SKU RDE labels identically, and those do belong
    # together on one drill-down line.
    agg = {}
    order = []
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        product = (r.get("Product Name") or "").strip()
        if not rep:
            continue
        key = (rep, product)
        if key not in agg:
            agg[key] = {"base": 0.0, "current": 0.0}
            order.append(key)
        agg[key]["base"] += to_num(r[goal_col])
        agg[key]["current"] += to_num(r[actual_col])

    out = []
    for rep, product in order:
        v = agg[(rep, product)]
        out.append({
            "SALES_REP_ASSIGNED": rep,
            "PRODUCT_NAME": product,
            "BASE_PLACEMENTS": v["base"],
            "CURRENT_PLACEMENTS": v["current"],
        })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["PRODUCT_NAME"]))
    return out


# ---------------------------------------------------------------- objective 2

def build_keystone_numerator():
    """One row per rep/account/purchase. buildPctOfBaseDataset() in
    index.html counts DISTINCT customer numbers, so repeat purchases at the
    same store collapse to one buying account on their own -- no dedupe
    needed here, and keeping every row means the drill-down can show what
    actually shipped."""
    rows = load_csv(KEYSTONE_CSV)
    cases_col = find_col(rows[0].keys(), "Cases")
    out = []
    for r in rows:
        rep = (r.get("Sales Rep Name") or "").strip()
        if not rep:
            continue
        num, name = split_customer(r.get("Customer Num Name"))
        out.append({
            "SALES_REP_ASSIGNED": rep,
            "PRODUCT_NAME": (r.get("Product Num & Name") or "").strip(),
            "BRAND_FAMILY": (r.get("Brand") or "").strip(),
            "CUSTOMER_NUM": int(num) if num.isdigit() else num,
            "CUSTOMER_NAME": name,
            "DATE": (r.get("Date") or "").strip(),
            "CASES": to_num(r.get(cases_col)),
        })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["CUSTOMER_NAME"]))
    return out


def build_customer_base_core():
    """Keystone Ice's account-base denominator -- same row shape (and same
    source file) as August's BBC Lytt denominator, so buildPctOfBaseDataset()
    reads it unchanged."""
    rows = load_csv(CUSTOMER_BASE_CORE_CSV)
    cases_col = find_col(rows[0].keys(), "Cases")
    out = []
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        if not rep:
            continue
        if keystone_excluded(rep, r.get("Customer Num")):
            continue
        out.append({
            "SALES_REP_ASSIGNED": rep,
            "CUSTOMER_NUM": int(r["Customer Num"]),
            "CUSTOMER_NAME": (r.get("Customer Name") or "").strip(),
            "SHIPPING_ADDRESS": (r.get("Shipping Address") or "").strip(),
            "CITY": (r.get("City") or "").strip(),
            "AREA": (r.get("Area") or "").strip(),
            "COUNTY": (r.get("County") or "").strip(),
            "CASES": to_num(r.get(cases_col)),
        })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["CUSTOMER_NAME"]))
    return out


# ------------------------------------------------------------- objectives 3/4

def build_new_placements(path, product_col=None):
    """The two-window new-placement read (see this script's docstring): a
    key is NEW when its current window is populated and its base window is
    not. The key is one rep/account (Fever Tree) or rep/account/product
    (Wine & Spirits), and the 2026-09-04 exports carry SEVERAL ROWS PER KEY
    -- one per load sheet date -- so every row for a key is folded together
    BEFORE classifying. Doing this per row instead, as the pre-2026-09-04
    aggregated exports allowed, reads an account's base-window row and its
    current-window row as two unrelated rows and calls the second one a new
    placement: on this export that turns Fever Tree's 1 genuinely new
    account into 20 and Wine & Spirits' 75 new placements into 129.

    PLACEMENTS PER KEY ARE NOT SUMMED ACROSS LOAD SHEETS -- see the
    docstring's "counting placements" note. The value taken is the largest
    single load sheet's count, and the summed alternative is returned
    alongside it so main() can print both.

    Returns (rows, new_placements, new_keys, total_keys, summed_alt)."""
    rows = load_csv(path)
    base_col, current_col = window_cols(rows[0].keys(), "Placement Count")
    check_window(base_col, datetime(2026, 6, 1), f"{path.name} base window")
    check_window(current_col, ACTUAL_WINDOW_START, f"{path.name} current window")

    agg, order = {}, []
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        if not rep:
            continue
        num, name = split_customer(r.get("Customer Num & Company"))
        product = (r.get(product_col) or "").strip() if product_col else ""
        key = (rep, num, product)
        if key not in agg:
            agg[key] = {"rep": rep, "num": num, "name": name, "product": product,
                        "brand": (r.get("Brand Family") or "").strip(),
                        "base": 0.0, "current": 0.0,
                        "base_sum": 0.0, "current_sum": 0.0,
                        "has_base": False, "has_current": False}
            order.append(key)
        a = agg[key]
        # Populated-ness, not quantity: an account whose base row happens to
        # read 0 still transacted in the base window.
        if (r[base_col] or "").strip() != "":
            a["has_base"] = True
            a["base"] = max(a["base"], to_num(r[base_col]))
            a["base_sum"] += to_num(r[base_col])
        if (r[current_col] or "").strip() != "":
            a["has_current"] = True
            a["current"] = max(a["current"], to_num(r[current_col]))
            a["current_sum"] += to_num(r[current_col])

    out = []
    new_placements = 0.0
    summed_alt = 0.0
    new_keys = 0
    for key in order:
        a = agg[key]
        is_new = 1 if (a["has_current"] and not a["has_base"]) else 0
        if is_new:
            new_placements += a["current"]
            summed_alt += a["current_sum"]
            new_keys += 1
        out.append({
            "SALES_REP_ASSIGNED": a["rep"],
            "PRODUCT_NAME": a["product"],
            "BRAND_FAMILY": a["brand"],
            "CUSTOMER_NUM": int(a["num"]) if a["num"].isdigit() else a["num"],
            "CUSTOMER_NAME": a["name"],
            "BASE_PLACEMENTS": a["base"],
            "CURRENT_PLACEMENTS": a["current"],
            "NEW_PLACEMENT": is_new,
        })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["CUSTOMER_NAME"], row["PRODUCT_NAME"]))
    return out, new_placements, new_keys, len(out), summed_alt


# --------------------------------------------------------------- target lists

def load_core_customer_base():
    """One entry per (rep, customer) -- the export has a row per shipping
    address, so the same account can appear more than once. Already scoped
    to the off-premise core territory, so no county whitelist is applied.
    Same helper as generate_2026-08.py's."""
    rows = load_csv(CUSTOMER_BASE_CORE_CSV)
    by_rep = {}
    seen = set()
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        cust_num = (r.get("Customer Num") or "").strip()
        if not rep or not cust_num or (rep, cust_num) in seen:
            continue
        seen.add((rep, cust_num))
        area = (r.get("Distribution Area") or "").strip()
        if area == "Sales":
            area = (r.get("County") or "").strip() or area
        by_rep.setdefault(rep, []).append({
            "customer_num": cust_num,
            "customer_name": (r.get("Customer Name") or "").strip(),
            "area": area,
        })
    return by_rep


def build_targets(customer_base_by_rep, carrying, exclude=None):
    """Core-territory accounts with NO row at all in the brand's export --
    the "hasn't touched it" prospect list, same as August's.

    `exclude(rep, customer_num) -> bool` drops accounts that are in the core
    book but out of scope for THIS brand (see KEYSTONE_BASE_EXCLUDED). It is
    per-brand on purpose: an account excluded from Keystone is still a live
    prospect for Fever Tree unless someone says otherwise."""
    out = []
    for rep, accounts in customer_base_by_rep.items():
        for a in accounts:
            if a["customer_num"] in carrying:
                continue
            if exclude and exclude(rep, a["customer_num"]):
                continue
            out.append({
                "SALES_REP_ASSIGNED": rep,
                "CUSTOMER_NUM": int(a["customer_num"]) if a["customer_num"].isdigit() else a["customer_num"],
                "CUSTOMER_NAME": a["customer_name"],
                "AREA": a["area"],
            })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["CUSTOMER_NAME"]))
    return out


def carrying_nums(rows):
    return {str(r["CUSTOMER_NUM"]) for r in rows}


def main():
    constellation_rows = build_constellation()
    keystone_rows = build_keystone_numerator()
    customer_base_core_rows = build_customer_base_core()
    fever_tree_rows, ft_new, ft_new_rows, ft_total, ft_summed = build_new_placements(
        FEVER_TREE_CSV, product_col="Product Num Name")
    wine_spirits_rows, ws_new, ws_new_rows, ws_total, ws_summed = build_new_placements(
        WINE_SPIRITS_CSV, product_col="Product Num Name")

    core_by_rep = load_core_customer_base()
    targets_keystone = build_targets(core_by_rep, carrying_nums(keystone_rows),
                                     exclude=keystone_excluded)
    targets_fever_tree = build_targets(core_by_rep, carrying_nums(fever_tree_rows))

    month_dir = DATA_DIR / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    (month_dir / "mpo_constellation_gaintain.json").write_text(json.dumps(constellation_rows, indent=2))
    (month_dir / "mpo_keystone_ice_numerator.json").write_text(json.dumps(keystone_rows, indent=2))
    (month_dir / "mpo_sales_reps_customer_base_core.json").write_text(json.dumps(customer_base_core_rows, indent=2))
    (month_dir / "mpo_fever_tree.json").write_text(json.dumps(fever_tree_rows, indent=2))
    (month_dir / "mpo_wine_spirits_any_brand.json").write_text(json.dumps(wine_spirits_rows, indent=2))
    (month_dir / "mpo_targets_keystone_ice.json").write_text(json.dumps(targets_keystone, indent=2))
    (month_dir / "mpo_targets_fever_tree.json").write_text(json.dumps(targets_fever_tree, indent=2))

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (month_dir / "sync_meta.json").write_text(json.dumps({"synced_at": synced_at}, indent=2))

    # --- sanity output -------------------------------------------------
    by_rep = {}
    for r in constellation_rows:
        v = by_rep.setdefault(r["SALES_REP_ASSIGNED"], [0.0, 0.0])
        v[0] += r["BASE_PLACEMENTS"]
        v[1] += r["CURRENT_PLACEMENTS"]
    at_goal = sum(1 for base, cur in by_rep.values()
                  if base and cur >= max(1, math.ceil(base * CONSTELLATION_GOAL_PCT)))
    print(f"Constellation Corona Gaintain: {len(constellation_rows)} rep+product lines, "
          f"{sum(v[0] for v in by_rep.values()):.0f} placements last fall -> "
          f"{sum(v[1] for v in by_rep.values()):.0f} this fall; {at_goal} of {len(by_rep)} reps "
          f"in the export at 30% of their own goal")

    base_by_rep = {}
    for r in customer_base_core_rows:
        base_by_rep.setdefault(r["SALES_REP_ASSIGNED"], set()).add(r["CUSTOMER_NUM"])
    ks_by_rep = {}
    for r in keystone_rows:
        ks_by_rep.setdefault(r["SALES_REP_ASSIGNED"], set()).add(r["CUSTOMER_NUM"])
    ks_at_goal = sum(1 for rep, accts in base_by_rep.items()
                     if accts and len(ks_by_rep.get(rep, ())) >= max(1, math.ceil(len(accts) * KEYSTONE_GOAL_PCT)))
    print(f"Keystone Ice: {len(keystone_rows)} purchase rows, "
          f"{len({r['CUSTOMER_NUM'] for r in keystone_rows})} distinct buying accounts; "
          f"{ks_at_goal} of {len(base_by_rep)} reps with a core-territory base at 40% penetration")
    print(f"Sales Reps Customer Base (Core, Keystone's denominator): {len(customer_base_core_rows)} rows "
          f"({len(KEYSTONE_BASE_EXCLUDED)} account(s) excluded from Keystone only -- "
          + ", ".join(f"{rep}/{name}" for (rep, _), name in KEYSTONE_BASE_EXCLUDED.items()) + ")")
    print(f"Fever Tree: {ft_new:.0f} new placements across {ft_new_rows} newly-placed "
          f"rep+account+SKU keys (out of {ft_total} exported); summing load sheets instead "
          f"would read {ft_summed:.0f}")
    print(f"Wine & Spirits (any brand): {ws_new:.0f} new placements across {ws_new_rows} "
          f"newly-placed rep+account+SKU keys (out of {ws_total} exported); summing load "
          f"sheets instead would read {ws_summed:.0f}")
    print(f"Target accounts -- Keystone Ice: {len(targets_keystone)} prospects (core territory only)")
    print(f"Target accounts -- Fever Tree: {len(targets_fever_tree)} prospects (core territory only)")
    print(f"sync_meta.json timestamped {synced_at} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
