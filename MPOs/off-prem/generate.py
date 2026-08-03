#!/usr/bin/env python3
"""
Rebuilds MPOs/off-prem/data/*.json from RDE CSV exports -- a manual
stand-in for the five Snowflake tables (MPO_NEW_BELGIUM_ACTUALS_OFF,
MPO_NEW_BELGIUM_90GOALS_OFF, MPO_WINE_SPIRITS_2XO_OFF,
MPO_SAPPORO_LIGHT_OFF, MPO_FAMOSA_OFF) that sync_snowflake_data.py
normally writes these same files from. Column names/shape match what
that script's `SELECT *` produces, so index.html doesn't care which
path built the JSON -- all five are simple passthroughs, no
reclassification needed (unlike the On-Prem Carbliss new-buyer fix).

Run: python3 generate.py
"""
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"

# Update this each month this file is refreshed by hand. MONTH_KEY controls
# which data/<MONTH_KEY>/ snapshot folder gets (re)written -- it must match a
# key in the MONTHS array in index.html for the tab to pick it up.
MONTH_KEY = "2026-07"

NEW_BELGIUM_GOALS_CSV = HERE / "new_belgium_90goals.csv"
NEW_BELGIUM_ACTUALS_CSV = HERE / "new_belgium_actuals.csv"
SAPPORO_LIGHT_CSV = HERE / "sapporo_light.csv"
WINE_SPIRITS_2XO_CSV = HERE / "wine_spirits_2xo.csv"
FAMOSA_CSV = HERE / "famosa.csv"


def load_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def parse_date(raw):
    return datetime.strptime(raw.strip(), "%m/%d/%Y").date().isoformat()


def find_placement_count_col(fieldnames):
    return next(c for c in fieldnames if c.startswith("Placement Count"))


def build_new_belgium_goals():
    rows = load_csv(NEW_BELGIUM_GOALS_CSV)
    return [{
        "SALES_REP_NAME": r["Sales Rep Name"].strip(),
        "Product #": int(r["Product #"]),
        "PRODUCT_NAME": r["Product Name"].strip(),
        "PACKAGE_TYPE": r["Package Type"].strip(),
        "GOAL90": int(r["Goal90"]),
    } for r in rows]


def build_new_belgium_actuals():
    rows = load_csv(NEW_BELGIUM_ACTUALS_CSV)
    return [{
        "SALES_REP_NAME": r["Sales Rep Name"].strip(),
        "PACKAGE_GROUP": r["Package Group"].strip(),
        "PRODUCT_NUM_NAME": r["Product Num Name"].strip(),
        "PLACEMENTS": int(float(r["Placements"])),
    } for r in rows]


def build_sapporo_light():
    rows = load_csv(SAPPORO_LIGHT_CSV)
    count_col = find_placement_count_col(rows[0].keys())
    return [{
        "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
        "CUSTOMER_NUM": int(r["Customer Num"]),
        "CUSTOMER_NAME": r["Customer Name"].strip(),
        "PRODUCT_NUM": int(r["Product Num"]),
        "PRODUCT_NAME": r["Product Name"].strip(),
        "BRAND": r["Brand"].strip(),
        "DATE": parse_date(r["Date"]),
        "PLACEMENT_COUNT___2026": r[count_col].strip(),
    } for r in rows]


def build_wine_spirits_2xo():
    rows = load_csv(WINE_SPIRITS_2XO_CSV)
    count_col = find_placement_count_col(rows[0].keys())
    return [{
        "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
        "CUSTOMER_NUM": int(r["Customer Num"]),
        "CUSTOMER_NAME": r["Customer Name"].strip(),
        "PRODUCT_NUM": int(r["Product Num"]),
        "PRODUCT_NAME": r["Product Name"].strip(),
        "BRAND_FAMILY": r["Brand Family"].strip(),
        "DATE": parse_date(r["Date"]),
        "PLACEMENT_COUNT___2026": r[count_col].strip(),
    } for r in rows]


def build_famosa():
    rows = load_csv(FAMOSA_CSV)
    count_col = find_placement_count_col(rows[0].keys())
    return [{
        "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
        "CUSTOMER_NUM": int(r["Customer Num"]),
        "CUSTOMER_NAME": r["Customer Name"].strip(),
        "PRODUCT_NUM": int(r["Product Num"]),
        "PRODUCT_NAME": r["Product Name"].strip(),
        "BRAND_FAMILY": r["Brand Family"].strip(),
        "DATE": parse_date(r["Date"]),
        "PLACEMENT_COUNT___2026": r[count_col].strip(),
    } for r in rows]


def main():
    outputs = {
        "mpo_new_belgium_90goals.json": build_new_belgium_goals(),
        "mpo_new_belgium_actuals.json": build_new_belgium_actuals(),
        "mpo_sapporo_light.json": build_sapporo_light(),
        "mpo_wine_spirits_2xo.json": build_wine_spirits_2xo(),
        "mpo_famosa.json": build_famosa(),
    }

    month_dir = DATA_DIR / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    for filename, rows in outputs.items():
        (month_dir / filename).write_text(json.dumps(rows, indent=2))
        print(f"Wrote {len(rows)} rows to {filename}")

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (month_dir / "sync_meta.json").write_text(json.dumps({"synced_at": synced_at}, indent=2))
    print(f"sync_meta.json timestamped {synced_at} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
