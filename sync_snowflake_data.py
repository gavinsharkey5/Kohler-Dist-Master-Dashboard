"""
sync_snowflake_data.py

Connects to Snowflake, pulls the Summer of Success tracker tables,
and writes them out as JSON files that the GitHub Pages dashboard
can fetch directly.

This script is meant to be run automatically by a GitHub Actions
workflow (see .github/workflows/snowflake-sync.yml), but you can
also run it locally to test:

    pip install snowflake-connector-python --break-system-packages
    export SNOWFLAKE_ACCOUNT="your_account_identifier"
    export SNOWFLAKE_USER="your_username"
    export SNOWFLAKE_PASSWORD="your_password_here"
    export SNOWFLAKE_WAREHOUSE="COMPUTE_WH"
    export SNOWFLAKE_ROLE="ACCOUNTADMIN"
    python sync_snowflake_data.py
"""

import json
import os
import sys
from datetime import datetime, timezone

import snowflake.connector

# --- Config: edit this list to add/remove tables you want synced ---
# Each entry: (table_name_in_snowflake, output_dir_in_repo, output_json_filename)
TABLES_TO_EXPORT = [
    ("KOHLER_DASH.PUBLIC.SUMMER_OF_SUCCESS_FULL", "summer26/data", "summer_of_success_full.json"),
    ("KOHLER_DASH.PUBLIC.SUMMER_OF_SUCCESS_MTD_TREND", "summer26/data", "summer_of_success_mtd_trend.json"),
    ("KOHLER_DASH.PUBLIC.MPO_CARBLISS_NEW_BUYERS", "MPOs/on-prem/data", "mpo_carbliss_new_buyers.json"),
    ("KOHLER_DASH.PUBLIC.MPO_SAPPORO_NA_NEW_BUYERS_ON", "MPOs/on-prem/data", "mpo_sapporo_na_new_buyers.json"),
    ("KOHLER_DASH.PUBLIC.MPO_WINE_SPIRITS_PLACEMENTS_ON", "MPOs/on-prem/data", "mpo_wine_spirits_placements.json"),
    ("KOHLER_DASH.PUBLIC.MPO_NEW_BELGIUM_ACTUALS_OFF", "MPOs/off-prem/data", "mpo_new_belgium_actuals.json"),
    ("KOHLER_DASH.PUBLIC.MPO_NEW_BELGIUM_90GOALS_OFF", "MPOs/off-prem/data", "mpo_new_belgium_90goals.json"),
    ("KOHLER_DASH.PUBLIC.MPO_WINE_SPIRITS_2XO_OFF", "MPOs/off-prem/data", "mpo_wine_spirits_2xo.json"),
    ("KOHLER_DASH.PUBLIC.MPO_SAPPORO_LIGHT_OFF", "MPOs/off-prem/data", "mpo_sapporo_light.json"),
    ("KOHLER_DASH.PUBLIC.MPO_FAMOSA_OFF", "MPOs/off-prem/data", "mpo_famosa.json"),
]


def get_connection():
    """Build a Snowflake connection from environment variables (GitHub Secrets)."""
    required_vars = [
        "SNOWFLAKE_ACCOUNT",
        "SNOWFLAKE_USER",
        "SNOWFLAKE_PASSWORD",
        "SNOWFLAKE_WAREHOUSE",
        "SNOWFLAKE_ROLE",
    ]
    missing = [v for v in required_vars if not os.environ.get(v)]
    if missing:
        print(f"ERROR: Missing required environment variables: {missing}")
        sys.exit(1)

    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.environ["SNOWFLAKE_WAREHOUSE"],
        role=os.environ["SNOWFLAKE_ROLE"],
    )


def export_table_to_json(cursor, table_name, output_path):
    """Run SELECT * on a table and write the results as a JSON list of objects."""
    print(f"Querying {table_name}...")
    cursor.execute(f"SELECT * FROM {table_name}")

    # Column names, in order
    columns = [col[0] for col in cursor.description]

    rows = []
    for row in cursor.fetchall():
        rows.append(dict(zip(columns, row)))

    with open(output_path, "w") as f:
        json.dump(rows, f, indent=2, default=str)

    print(f"  -> wrote {len(rows)} rows to {output_path}")


def write_sync_meta(output_dir):
    """Record when this sync actually ran, so dashboards don't have to rely
    on HTTP Last-Modified headers (which GitHub Pages' CDN can serve
    stale)."""
    meta_path = os.path.join(output_dir, "sync_meta.json")
    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(meta_path, "w") as f:
        json.dump({"synced_at": synced_at}, f, indent=2)
    print(f"  -> wrote sync timestamp ({synced_at}) to {meta_path}")


def main():
    output_dirs = sorted({output_dir for _, output_dir, _ in TABLES_TO_EXPORT})
    for output_dir in output_dirs:
        os.makedirs(output_dir, exist_ok=True)

    conn = get_connection()
    try:
        cursor = conn.cursor()
        for table_name, output_dir, filename in TABLES_TO_EXPORT:
            output_path = os.path.join(output_dir, filename)
            export_table_to_json(cursor, table_name, output_path)
    finally:
        conn.close()

    for output_dir in output_dirs:
        write_sync_meta(output_dir)
    print("Done.")


if __name__ == "__main__":
    main()
