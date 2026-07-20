#!/usr/bin/env python3
"""
Rebuilds data/forecast.json for the Boston Beer Online Ordering pulse-check
page. This is deliberately a simple join, not a projection engine: for each
SKU it lines up Boston Beer's own forecast (F) and the confirmed order (A)
per week against Encompass's actual sell-through and inventory numbers, with
no invented math on top (no trend line, no seasonal fallback, no recommended
quantity). The page itself decides whether to draw the eye to a week where F
looks out of line with recent sales -- this script just gets the raw numbers
lined up.

Inventory-side fields (Available, L4/L8 Average, recent weekly case sales,
Last Receive Date/Quantity, brand/package, and the cleaned-up product name
matched from Encompass's Products export) are carried forward unchanged from
whatever was last built into data/forecast.json -- refreshing those requires
a new Encompass Inventory Report export, which this script doesn't take as
input. Only the forecast/on-file numbers refresh here.

Run: python3 generate.py 076KOH_Forecasts.csv
(re-run with no argument to just reuse the committed 076KOH_Forecasts.csv)
"""
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_CSV = HERE / "076KOH_Forecasts.csv"
OUT_JSON = HERE / "data" / "forecast.json"

WEEK_COL_RE = re.compile(r"^(\d{2}/\d{2}/\d{4}) F$")


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not src.exists():
        raise SystemExit(f"Forecast CSV not found: {src}")

    old = json.loads(OUT_JSON.read_text())
    inv_lookup = {s["sku"]: s for s in old["skus"]}

    with open(src, newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit("Forecast CSV has no data rows")

    week_dates = [m.group(1) for col in rows[0].keys() if (m := WEEK_COL_RE.match(col))]
    if not week_dates:
        raise SystemExit("Could not find any '<date> F' week columns in the forecast CSV")

    skus_out = []
    unmatched = 0
    for r in rows:
        bbc = r["BBC SKU"].strip()
        inv = inv_lookup.get(bbc)
        if not inv:
            unmatched += 1

        weeks = []
        for i, wd in enumerate(week_dates):
            f_raw = (r.get(f"{wd} F") or "").strip()
            a_raw = (r.get(f"{wd} A") or "").strip()
            weeks.append({
                "weekEnding": wd,
                "forecast": float(f_raw) if f_raw != "" else None,
                "onFile": float(a_raw) if a_raw != "" else None,
                "locked": i == 0,
            })

        skus_out.append({
            "sku": bbc,
            "product": inv["product"] if inv else r["Product"],
            "rawProduct": r["Product"],
            "cleanName": bool(inv and inv.get("cleanName")),
            "distributor": r["Distributor"],
            "customerSku": r["Customer SKU"],
            "weeks": weeks,
            "brandFamily": inv.get("brandFamily") if inv else None,
            "package": inv.get("package") if inv else None,
            "available": inv.get("available") if inv else None,
            "l4Avg": inv.get("l4Avg") if inv else None,
            "l8Avg": inv.get("l8Avg") if inv else None,
            "recentWeeks": inv.get("recentWeeks") if inv else None,
            "lastReceiveDate": inv.get("lastReceiveDate") if inv else None,
            "lastReceiveQty": inv.get("lastReceiveQty") if inv else None,
        })

    out = {
        "meta": {
            "weekDates": week_dates,
            "distributor": rows[0]["Distributor"],
            "lockedWeeks": 1,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "skus": skus_out,
        "orphanInventory": old.get("orphanInventory", []),
    }
    OUT_JSON.write_text(json.dumps(out))
    print(f"Wrote {len(skus_out)} SKUs, {len(week_dates)} weeks ({week_dates[0]} - {week_dates[-1]}).")
    if unmatched:
        print(f"{unmatched} SKU(s) in the forecast CSV have no matching inventory data (new/unlisted item) -- shown with blanks for Available/recent sales.")


if __name__ == "__main__":
    main()
