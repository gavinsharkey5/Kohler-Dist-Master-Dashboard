#!/usr/bin/env python3
"""
Rebuilds MPOs/on-prem/data/*.json from RDE CSV exports -- a manual
stand-in for the three Snowflake tables (MPO_CARBLISS_NEW_BUYERS,
MPO_SAPPORO_NA_NEW_BUYERS_ON, MPO_WINE_SPIRITS_PLACEMENTS_ON) that
sync_snowflake_data.py normally writes these same files from. Column
names/shape match what that script's `SELECT *` produces, so
index.html doesn't care which path built the JSON.

Carbliss new-buyer classification (per Kohler, 2026-07-21): the raw
"Buyers"/"New Buyers" flag column in Encompass's own export has been
wrong (e.g. Orange Lantern showed as a new buyer despite buying
Carbliss in both June and July), so it is IGNORED here entirely. A
customer is classified as a new buyer purely from their purchase
dates in this file: no Carbliss purchase before NEW_BUYER_WINDOW_START
(the current month), AND at least one purchase in
[NEW_BUYER_WINDOW_START, NEW_BUYER_WINDOW_END]. Every transaction row
is kept (the dashboard's rep detail view shows full activity, not just
qualifying rows) -- NEW_BUYERS is set to 1 on exactly the customer's
first qualifying purchase in the window, 0 on every other row for that
customer (including any later purchases in the same window), so a
customer is never double-counted toward a rep's new-accounts goal.

Sapporo NA and Wine & Spirits are simple passthroughs -- their "New
Buyers" / count columns are used as-is, no reclassification.

Run: python3 generate.py
"""
import csv
import json
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"

CARBLISS_CSV = HERE / "carbliss_new_buyers.csv"
SAPPORO_CSV = HERE / "sapporo_na_new_buyers.csv"
WINE_SPIRITS_CSV = HERE / "wine_spirits_placements.csv"

# Update these each month this file is refreshed by hand.
NEW_BUYER_WINDOW_START = date(2026, 7, 1)
NEW_BUYER_WINDOW_END = date(2026, 7, 31)


def parse_date(raw):
    return datetime.strptime(raw.strip(), "%m/%d/%Y").date()


def load_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def pick_col(fieldnames, *aliases):
    for a in aliases:
        if a in fieldnames:
            return a
    return None


def build_carbliss():
    rows = load_csv(CARBLISS_CSV)
    fieldnames = rows[0].keys() if rows else []
    # RDE has exported this report under two different header sets --
    # "Sales Rep Name"/"Customer ID"/"Premise" and, as of the 2026-07-28
    # refresh, "Sales Rep Assigned"/"Customer Num" with no Premise column
    # at all (replaced by two windowed "Buyer Count ..." columns we don't
    # need, since classification is driven off each row's own Date). This
    # is the on-prem tracker exclusively, so Premise defaults to "On
    # Premise" when the export doesn't carry it.
    rep_col = pick_col(fieldnames, "Sales Rep Name", "Sales Rep Assigned")
    cust_id_col = pick_col(fieldnames, "Customer ID", "Customer Num")
    premise_col = pick_col(fieldnames, "Premise")
    if not rep_col or not cust_id_col:
        raise SystemExit(f"{CARBLISS_CSV}: could not find rep/customer-id columns in {list(fieldnames)}")

    parsed = [(parse_date(r["Date"]), r) for r in rows]

    by_customer = {}
    for d, r in parsed:
        by_customer.setdefault(r[cust_id_col], []).append(d)

    new_customers = set()
    for cust_id, dates in by_customer.items():
        bought_before_window = any(d < NEW_BUYER_WINDOW_START for d in dates)
        bought_in_window = any(NEW_BUYER_WINDOW_START <= d <= NEW_BUYER_WINDOW_END for d in dates)
        if not bought_before_window and bought_in_window:
            new_customers.add(cust_id)

    parsed.sort(key=lambda item: item[0])  # earliest first, so the first qualifying row wins
    flagged_customer = set()
    out = []
    for d, r in parsed:
        cust_id = r[cust_id_col]
        is_new_row = 0
        if cust_id in new_customers and cust_id not in flagged_customer and NEW_BUYER_WINDOW_START <= d <= NEW_BUYER_WINDOW_END:
            is_new_row = 1
            flagged_customer.add(cust_id)
        out.append({
            "SALES_REP_NAME": r[rep_col].strip(),
            "CUSTOMER_ID": int(cust_id),
            "CUSTOMER_NAME": r["Customer Name"].strip(),
            "PREMISE": r[premise_col].strip() if premise_col else "On Premise",
            "BRAND_FAMILY": r["Brand Family"].strip(),
            "DATE": d.isoformat(),
            "NEW_BUYERS": is_new_row,
        })
    # restore original file order (most-recent-first) for a natural diff/read
    out.sort(key=lambda row: row["DATE"], reverse=True)
    return out, len(new_customers), len(by_customer)


def build_sapporo():
    rows = load_csv(SAPPORO_CSV)
    out = []
    for r in rows:
        out.append({
            "SALES_REP_NAME": r["Sales Rep Name"].strip(),
            "CUSTOMER_ID": int(r["Customer ID"]),
            "CUSTOMER_NAME": r["Customer Name"].strip(),
            "PREMISE": r["Premise"].strip(),
            "PRODUCT_NAME": r["Product Name"].strip(),
            "DATE": parse_date(r["Date"]).isoformat(),
            "NEW_BUYERS": int(r["New Buyers"]),
        })
    return out


def build_wine_spirits():
    rows = load_csv(WINE_SPIRITS_CSV)
    count_col = next(c for c in rows[0].keys() if c.startswith("Placement Count"))
    out = []
    for r in rows:
        out.append({
            "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
            "PRODUCT_NUM": int(r["Product Num"]),
            "PRODUCT_NAME": r["Product Name"].strip(),
            "CUSTOMER_NUM": int(r["Customer Num"]),
            "CUSTOMER_NAME": r["Customer Name"].strip(),
            "PREMISE": r["Premise"].strip(),
            "DATE": parse_date(r["Date"]).isoformat(),
            "Placement Count 2026": r[count_col].strip(),
        })
    return out


def main():
    carbliss_rows, new_count, total_customers = build_carbliss()
    sapporo_rows = build_sapporo()
    wine_spirits_rows = build_wine_spirits()

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "mpo_carbliss_new_buyers.json").write_text(json.dumps(carbliss_rows, indent=2))
    (DATA_DIR / "mpo_sapporo_na_new_buyers.json").write_text(json.dumps(sapporo_rows, indent=2))
    (DATA_DIR / "mpo_wine_spirits_placements.json").write_text(json.dumps(wine_spirits_rows, indent=2))

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (DATA_DIR / "sync_meta.json").write_text(json.dumps({"synced_at": synced_at}, indent=2))

    print(f"Carbliss: {new_count} new buyers out of {total_customers} customers in the export "
          f"({len(carbliss_rows)} transaction rows written)")
    print(f"Sapporo NA: {len(sapporo_rows)} rows written")
    print(f"Wine & Spirits: {len(wine_spirits_rows)} rows written")
    print(f"sync_meta.json timestamped {synced_at}")


if __name__ == "__main__":
    main()
