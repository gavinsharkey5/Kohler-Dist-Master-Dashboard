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

Duplicate product NAMES appear per rep (RDE labels two different SKUs
"Coronita Extra 1/24/7 oz Btl"), so lines are aggregated by product name
-- rep totals are unaffected, it just stops the drill-down repeating a
name with two different numbers next to it.

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
Both exports are the new RDE two-window shape with NO per-row Date at
all: one row per rep/account (Fever Tree) or rep/account/product (Wine &
Spirits) carrying a base-period column (6/1/2026 - 8/31/2026, the 90-day
non-buy window) and a current column (9/1/2026 - 9/30/2026). That makes
the classification a column read rather than the date-walking
classify_dual_period() August needed: a row is a NEW placement when the
current column is populated and the base column is not. Same rule as
every prior month -- "no purchase in the prior ~90 days, a purchase this
month" -- just handed to us pre-windowed.

Progress counts PLACEMENTS, not rows. Wine & Spirits' export is
product-level and every current value is 1.00, so there the two are the
same number. Fever Tree's is ACCOUNT-level (its only Brand Family is
Fever Tree) with current values from 1 to 11 -- one newly-opened account
placing 6 Fever Tree SKUs is 6 placements toward the 10, not 1.

--- POS: (5) Cooler Door Stickers ---
No data source yet (the iSellBeer photo export for cooler door stickers
hasn't been pulled), so it ships as a hasData:false placeholder in
index.html, exactly like July's Disruptors did. Nothing to generate.

To refresh: save new exports over the four CSVs named below (same column
headers), run this script, commit and push.
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
    # Only the DATE-WINDOWED columns: the same prefix also picks up RDE's
    # trailing "Placement Count Percentage Total" roll-up column, which
    # carries no window and is not one of the two periods.
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

def build_constellation():
    rows = load_csv(CONSTELLATION_CSV)
    goal_col, actual_col = window_cols(rows[0].keys(), "Corona Gaintain SKUs Placements")
    check_window(goal_col, GOAL_WINDOW_START, "Constellation goal window")
    check_window(actual_col, ACTUAL_WINDOW_START, "Constellation actuals window")

    # Aggregate by rep + product NAME (see this script's docstring -- RDE
    # gives the same name to more than one SKU).
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
    row is NEW when its current-window column is populated and its
    base-window column is not. Each source row is already one
    rep/account(/product) pair -- there is no per-row Date and no repeat
    rows to collapse -- so a row maps to exactly one output row, and no
    "first qualifying row wins" flagging is needed the way August's
    transaction-log exports required.

    Returns (rows, new_placements, new_rows, total_rows). new_placements
    sums the current column (Fever Tree's export is account-level: one new
    account can be several placements); new_rows counts the qualifying rows
    themselves, which is the same number only for product-level exports."""
    rows = load_csv(path)
    base_col, current_col = window_cols(rows[0].keys(), "Placement Count")
    check_window(base_col, datetime(2026, 6, 1), f"{path.name} base window")
    check_window(current_col, ACTUAL_WINDOW_START, f"{path.name} current window")

    out = []
    new_placements = 0.0
    new_rows = 0
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        if not rep:
            continue
        num, name = split_customer(r.get("Customer Num & Company"))
        base = to_num(r[base_col])
        current = to_num(r[current_col])
        # Populated-ness, not quantity: an existing account whose base row
        # happens to read 0 still bought in the base window.
        has_base = (r[base_col] or "").strip() != ""
        has_current = (r[current_col] or "").strip() != ""
        is_new = 1 if (has_current and not has_base) else 0
        if is_new:
            new_placements += current
            new_rows += 1
        out.append({
            "SALES_REP_ASSIGNED": rep,
            "PRODUCT_NAME": (r.get(product_col) or "").strip() if product_col else "",
            "BRAND_FAMILY": (r.get("Brand Family") or "").strip(),
            "CUSTOMER_NUM": int(num) if num.isdigit() else num,
            "CUSTOMER_NAME": name,
            "BASE_PLACEMENTS": base,
            "CURRENT_PLACEMENTS": current,
            "NEW_PLACEMENT": is_new,
        })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["CUSTOMER_NAME"], row["PRODUCT_NAME"]))
    return out, new_placements, new_rows, len(out)


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


def build_targets(customer_base_by_rep, carrying):
    """Core-territory accounts with NO row at all in the brand's export --
    the "hasn't touched it" prospect list, same as August's."""
    out = []
    for rep, accounts in customer_base_by_rep.items():
        for a in accounts:
            if a["customer_num"] in carrying:
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
    fever_tree_rows, ft_new, ft_new_rows, ft_total = build_new_placements(FEVER_TREE_CSV)
    wine_spirits_rows, ws_new, ws_new_rows, ws_total = build_new_placements(
        WINE_SPIRITS_CSV, product_col="Product Num Name")

    core_by_rep = load_core_customer_base()
    targets_keystone = build_targets(core_by_rep, carrying_nums(keystone_rows))
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
    print(f"Sales Reps Customer Base (Core, Keystone's denominator): {len(customer_base_core_rows)} rows")
    print(f"Fever Tree: {ft_new:.0f} new placements across {ft_new_rows} newly-opened accounts "
          f"(out of {ft_total} rep+account rows exported)")
    print(f"Wine & Spirits (any brand): {ws_new:.0f} new placements across {ws_new_rows} rows "
          f"(out of {ws_total} rep+account+product rows exported)")
    print(f"Target accounts -- Keystone Ice: {len(targets_keystone)} prospects (core territory only)")
    print(f"Target accounts -- Fever Tree: {len(targets_fever_tree)} prospects (core territory only)")
    print(f"sync_meta.json timestamped {synced_at} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
