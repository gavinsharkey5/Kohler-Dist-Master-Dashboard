#!/usr/bin/env python3
"""
Rebuilds data/summer_of_success_full.json and data/summer_of_success_mtd_trend.json
from sales.csv / trend.csv -- manual stand-ins for the Snowflake tables
(KOHLER_DASH.PUBLIC.SUMMER_OF_SUCCESS_FULL / _MTD_TREND) that
sync_snowflake_data.py normally writes these same two files from. Column
names are upper-cased/underscored to match exactly what that script's
`SELECT *` produces, so the dashboard (index.html) doesn't care which
path produced the JSON.

Run: python3 generate.py
"""
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
SALES_CSV = HERE / "sales.csv"
TREND_CSV = HERE / "trend.csv"
DATA_DIR = HERE / "data"

# Source column headers embed a date range that shifts every export
# (e.g. "Case Equiv   6/1/2025 - 8/31/2025"); match by which year
# appears in the header rather than the exact string.
def find_col(fieldnames, *, year=None, suffix=None):
    for f in fieldnames:
        if not f.startswith("Case Equiv"):
            continue
        if year and year in f:
            return f
        if suffix and f.strip().endswith(suffix):
            return f
    return None


def to_num(raw):
    raw = (raw or "").strip()
    if raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        return float(raw)


def load_rows(csv_path, has_pct):
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        col_2025 = find_col(fieldnames, year="2025")
        col_2026 = find_col(fieldnames, year="2026")
        col_diff = find_col(fieldnames, suffix="Unit Difference")
        col_pct = find_col(fieldnames, suffix="Percentage Difference") if has_pct else None
        if not (col_2025 and col_2026 and col_diff):
            raise SystemExit(f"{csv_path}: could not find expected 'Case Equiv' columns in {fieldnames}")

        rows = []
        for r in reader:
            row = {
                "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
                "QUALIFIER_BRANDS": r["Qualifier Brands"].strip(),
                "SUPPLIER": r["Supplier"].strip(),
                "BRAND_FAMILY": r["Brand Family"].strip(),
                "CASE_EQUIV_2025": to_num(r[col_2025]),
                "CASE_EQUIV_2026": to_num(r[col_2026]),
                "CASE_EQUIV_UNIT_DIFFERENCE": to_num(r[col_diff]),
            }
            if has_pct:
                row["CASE_EQUIV_PERCENTAGE_DIFFERENCE"] = (r.get(col_pct) or "").strip() or None
            rows.append(row)
        return rows


def main():
    full_rows = load_rows(SALES_CSV, has_pct=False)
    trend_rows = load_rows(TREND_CSV, has_pct=True)

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "summer_of_success_full.json").write_text(json.dumps(full_rows, indent=2, default=str))
    (DATA_DIR / "summer_of_success_mtd_trend.json").write_text(json.dumps(trend_rows, indent=2, default=str))

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (DATA_DIR / "sync_meta.json").write_text(json.dumps({"synced_at": synced_at}, indent=2))

    print(f"Wrote {len(full_rows)} rows to summer_of_success_full.json")
    print(f"Wrote {len(trend_rows)} rows to summer_of_success_mtd_trend.json")
    print(f"sync_meta.json timestamped {synced_at}")


if __name__ == "__main__":
    main()
