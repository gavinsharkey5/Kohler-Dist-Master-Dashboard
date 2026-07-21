#!/usr/bin/env python3
"""
Rebuilds data/forecast.json for the Boston Beer Online Ordering pulse-check
page. This is deliberately a simple join, not a projection engine: for each
SKU it lines up Boston Beer's own forecast (F) and the confirmed order (A)
per week against Encompass's actual sell-through/inventory numbers and
Boston Beer's own forward-looking system forecast, with no invented math on
top (no trend line, no seasonal fallback, no recommended quantity). The page
itself decides whether to draw the eye to a week where F looks out of line
with recent sales -- this script just gets the raw numbers lined up.

Three independent inputs, each refreshable on its own:
  076KOH_Forecasts.csv        Boston Beer portal forecast export -- Product,
                               Distributor, BBC SKU, Customer SKU, then a
                               pair of columns per week ("<date> F" / "<date> A").
  Boston_Beer_Inventory_Report.csv   Encompass "Boston Beer Inventory Report"
                               export -- Available, the last 8 weeks of actual
                               case sales (Cases -6 Weeks through Cases This
                               Week), Last Receive Date/Quantity, and a
                               "Product Link" column ("<Customer SKU> <clean
                               product name>") that's the only source of the
                               cleaned-up product name now (Encompass's
                               separate "Products" export is no longer needed
                               for that).
  ForecastReport.xlsx         Encompass "ForecastReport" export -- Boston
                               Beer's own forward-looking system forecast,
                               in case-equivalents, one column per week
                               several months out. This is what lets you
                               gauge whether a product's sales look set to
                               pick up (seasonal ramp) or keep climbing
                               (growing brand) beyond what recent weeks show.

Encompass's inventory SKU sometimes carries a suffix the Boston Beer portal
SKU doesn't (e.g. portal "AJ0153" vs Encompass "AJ0153A1") -- both the
Inventory Report and ForecastReport use the same suffixed codes, so both are
matched to the portal SKU by exact match first, then by prefix.

L4 Avg is computed here (not read from Encompass -- this export doesn't
carry a pre-computed average column) as the mean of the last 4 *complete*
weeks (Cases -3 Weeks through Cases Last Week). Cases This Week is excluded
from the average since it's a partial, still-in-progress week that would
understate it -- it's still shown in the Recent Sales detail, just labeled
as in progress.

Run: python3 generate.py [forecast_csv] [inventory_csv] [forecast_report_xlsx]
(all three default to the filenames committed in this folder)
"""
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
DEFAULT_FORECAST_CSV = HERE / "076KOH_Forecasts.csv"
DEFAULT_INVENTORY_CSV = HERE / "Boston_Beer_Inventory_Report.csv"
DEFAULT_FORECAST_REPORT_XLSX = HERE / "ForecastReport.xlsx"
OUT_JSON = HERE / "data" / "forecast.json"

WEEK_COL_RE = re.compile(r"^(\d{2}/\d{2}/\d{4}) F$")
PRODUCT_LINK_RE = re.compile(r"^\s*\S+\s+(.*\S)\s*$")
DATE_HEADER_RE = re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$")

# Chronological order, oldest to newest. Index 6 (Last Week) is the newest
# *complete* week; index 7 (This Week) is still in progress.
RECENT_WEEK_COLS = [
    "Cases -6 Weeks", "Cases -5 Weeks", "Cases -4 Weeks", "Cases -3 Weeks",
    "Cases -2 Weeks", "Cases -1 Weeks", "Cases Last Week", "Cases This Week",
]
RECENT_WEEK_LABELS = ["-6 wk", "-5 wk", "-4 wk", "-3 wk", "-2 wk", "-1 wk", "Last wk", "This wk"]


def to_num(raw):
    raw = (raw or "").strip()
    if raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        return float(raw)


def resolve(sku, lookup):
    """Exact match first, else the one key that starts with sku (Encompass's
    suffixed inventory-SKU variants)."""
    if sku in lookup:
        return lookup[sku]
    for k, v in lookup.items():
        if k.startswith(sku):
            return v
    return None


def load_inventory(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    inv = {}
    for r in rows:
        sku = r["Supplier Product ID"].strip()
        if not sku:
            continue
        weeks = [to_num(r[c]) for c in RECENT_WEEK_COLS]
        complete_weeks = [w for w in weeks[:7] if w is not None]  # excludes This Week
        last4_complete = [w for w in weeks[3:7] if w is not None]
        m = PRODUCT_LINK_RE.match(r.get("Product Link") or "")
        inv[sku] = {
            "brandFamily": (r.get("Brand Family") or "").strip() or None,
            "package": (r.get("Package") or "").strip() or None,
            "cleanName": m.group(1).strip() if m else None,
            "available": to_num(r.get("Available")),
            "recentWeeks": weeks,
            "l4Avg": round(sum(last4_complete) / len(last4_complete), 1) if last4_complete else None,
            "l8Avg": round(sum(complete_weeks) / len(complete_weeks), 1) if complete_weeks else None,
            "lastReceiveDate": (r.get("Last Receive Date") or "").strip() or None,
            "lastReceiveQty": to_num(r.get("Last Receive Quantity")),
        }
    return inv


def load_forecast_report(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    header = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]
    date_cols = [(i, str(h)) for i, h in enumerate(header, start=1) if h and DATE_HEADER_RE.match(str(h))]
    if not date_cols:
        raise SystemExit(f"{path}: could not find any date columns in row 1")

    out = {}
    for r in range(2, ws.max_row + 1):
        sku = ws.cell(row=r, column=1).value
        product = ws.cell(row=r, column=3).value
        if not sku or not product:
            continue
        sku = str(sku).strip()
        weeks = []
        for col, wd in date_cols:
            v = ws.cell(row=r, column=col).value
            weeks.append({"weekEnding": wd, "cases": round(v, 1) if isinstance(v, (int, float)) else None})
        out[sku] = weeks
    return out


def main():
    forecast_csv = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_FORECAST_CSV
    inventory_csv = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_INVENTORY_CSV
    forecast_report_xlsx = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_FORECAST_REPORT_XLSX
    for p in (forecast_csv, inventory_csv, forecast_report_xlsx):
        if not p.exists():
            raise SystemExit(f"Not found: {p}")

    with open(forecast_csv, newline="") as f:
        forecast_rows = list(csv.DictReader(f))
    if not forecast_rows:
        raise SystemExit("Forecast CSV has no data rows")

    week_dates = [m.group(1) for col in forecast_rows[0].keys() if (m := WEEK_COL_RE.match(col))]
    if not week_dates:
        raise SystemExit("Could not find any '<date> F' week columns in the forecast CSV")

    inv_lookup = load_inventory(inventory_csv)
    fr_lookup = load_forecast_report(forecast_report_xlsx)

    skus_out = []
    unmatched_inv = unmatched_fr = 0
    matched_inv_skus = set()
    for r in forecast_rows:
        bbc = r["BBC SKU"].strip()
        inv = resolve(bbc, inv_lookup)
        fr_weeks = resolve(bbc, fr_lookup)
        if inv is None:
            unmatched_inv += 1
        else:
            for k, v in inv_lookup.items():
                if v is inv:
                    matched_inv_skus.add(k)
                    break
        if fr_weeks is None:
            unmatched_fr += 1

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
            "product": (inv["cleanName"] if inv and inv["cleanName"] else None) or r["Product"],
            "rawProduct": r["Product"],
            "cleanName": bool(inv and inv["cleanName"]),
            "distributor": r["Distributor"],
            "customerSku": r["Customer SKU"],
            "weeks": weeks,
            "brandFamily": inv["brandFamily"] if inv else None,
            "package": inv["package"] if inv else None,
            "available": inv["available"] if inv else None,
            "l4Avg": inv["l4Avg"] if inv else None,
            "l8Avg": inv["l8Avg"] if inv else None,
            "recentWeeks": inv["recentWeeks"] if inv else None,
            "recentWeekLabels": RECENT_WEEK_LABELS,
            "lastReceiveDate": inv["lastReceiveDate"] if inv else None,
            "lastReceiveQty": inv["lastReceiveQty"] if inv else None,
            "forecastReportWeeks": fr_weeks,
        })

    orphan_inventory = []
    for sku, inv in inv_lookup.items():
        if sku not in matched_inv_skus:
            orphan_inventory.append({
                "sku": sku,
                "product": inv["cleanName"] or sku,
                "brandFamily": inv["brandFamily"],
                "available": inv["available"],
                "l4Avg": inv["l4Avg"],
                "lastReceiveDate": inv["lastReceiveDate"],
            })

    out = {
        "meta": {
            "weekDates": week_dates,
            "distributor": forecast_rows[0]["Distributor"],
            "lockedWeeks": 1,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "skus": skus_out,
        "orphanInventory": orphan_inventory,
    }
    OUT_JSON.write_text(json.dumps(out))
    print(f"Wrote {len(skus_out)} SKUs, {len(week_dates)} weeks ({week_dates[0]} - {week_dates[-1]}).")
    if unmatched_inv:
        print(f"{unmatched_inv} SKU(s) in the forecast CSV have no matching Inventory Report row (new/unlisted item) -- shown with blanks for Available/recent sales.")
    if unmatched_fr:
        print(f"{unmatched_fr} SKU(s) in the forecast CSV have no matching ForecastReport row -- shown with no forward forecast.")
    print(f"{len(orphan_inventory)} Inventory Report row(s) have no matching forecast-CSV row (in inventory but not on the portal's forecast).")


if __name__ == "__main__":
    main()
