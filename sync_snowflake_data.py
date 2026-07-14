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

import snowflake.connector

# --- Config: edit this list to add/remove tables you want synced ---
# Each entry: (table_name_in_snowflake, output_json_filename)
TABLES_TO_EXPORT = [
    ("KOHLER_DASH.PUBLIC.SUMMER_OF_SUCCESS_FULL", "summer_of_success_full.json"),
    ("KOHLER_DASH.PUBLIC.SUMMER_OF_SUCCESS_MTD_TREND", "summer_of_success_mtd_trend.json"),
]

# Where in the repo the JSON files should be written.
# Adjust this if your dashboard expects the data somewhere else.
OUTPUT_DIR = "summer26/data"


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


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    conn = get_connection()
    try:
        cursor = conn.cursor()
        for table_name, filename in TABLES_TO_EXPORT:
            output_path = os.path.join(OUTPUT_DIR, filename)
            export_table_to_json(cursor, table_name, output_path)
    finally:
        conn.close()

    print("Done.")


if __name__ == "__main__":
    main()
