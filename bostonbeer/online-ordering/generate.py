#!/usr/bin/env python3
"""
Rebuilds data/trend_forecast.json for the Boston Beer Trend Forecast page.

For each SKU on Boston Beer's own forecast, projects the next up-to-8 weeks
two ways and lines them up:

  trend forecast = last year's actual cases for that same retail week
    (matched by week number, see week_number() below) x (1 + that SKU's
    13-week YoY case trend from L13_Trend.csv), floored at 0.
  bbc forecast = Boston Beer's own "<date> F" value for that week.

If a SKU has no L13_Trend.csv row, or its last-year trailing-13-week total
is zero or negative (e.g. a mostly-returns window -- no positive base to
measure growth against), there's no 13-week trend % to apply. Rather than
show "no data" for a SKU that clearly has sales history, that week's trend
forecast falls back to last year's actual cases carried forward as-is
(0% applied) -- weeks_out[i]["fallback"] flags this so the page can say so.

Any week where the two disagree by more than 10% is flagged for the page to
tint. Each product also carries the full run of last year's weekly actuals
from the current week through week 52 (not just the 8 forecast weeks) and
its L13 comparison (this year's 13-wk total vs. last year's), so a manager
can expand a product to see the whole reference picture the 8-week number
was built from, not just the number itself.

Four inputs, each refreshable independently:
  076KOH_Forecasts.csv        Boston Beer portal forecast export -- Product,
                               Distributor, BBC SKU, Customer SKU, then a
                               pair of columns per week ("<date> F" / "<date> A"
                               -- only F is used here, A was the Pulse Check
                               tab's On File field, which this page no longer has).
  Boston_Beer_Inventory_Report.csv   Encompass "Boston Beer Inventory Report"
                               export -- just Available and Last Receive
                               Date/Quantity are used now.
  L13_Trend.csv                RDE "Comparison" export, trailing 13 weeks:
                               Supplier Product ID, Product Name, then a
                               "Cases <start> - <end>" column for this year's
                               window and last year's. Source of each SKU's
                               13-week trend %.
  LY_By_Week.csv               RDE "Comparison"/"Fusion" export, full prior
                               year: Supplier Product ID, Product Name, then
                               one "Cases <year> <NN>" column per retail week.
                               Last-year weekly baseline the trend gets
                               applied to, and the full reference run shown
                               when a product is expanded.

Encompass's inventory SKU sometimes carries a suffix the Boston Beer portal
SKU doesn't (e.g. portal "AJ0153" vs Encompass "AJ0153A1") -- Inventory
Report, L13_Trend, and LY_By_Week all use the same kind of suffixed codes,
so generate.py matches each portal SKU into all three by exact match first,
then by prefix.

Run: python3 generate.py [forecast_csv] [inventory_csv] [l13_csv] [ly_by_week_csv]
(all four default to the filenames committed in this folder)
"""
import csv
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_FORECAST_CSV = HERE / "076KOH_Forecasts.csv"
DEFAULT_INVENTORY_CSV = HERE / "Boston_Beer_Inventory_Report.csv"
DEFAULT_L13_CSV = HERE / "L13_Trend.csv"
DEFAULT_LY_BY_WEEK_CSV = HERE / "LY_By_Week.csv"
TREND_OUT_JSON = HERE / "data" / "trend_forecast.json"

WEEK_COL_RE = re.compile(r"^(\d{2}/\d{2}/\d{4}) F$")
L13_WINDOW_COL_RE = re.compile(r"^Cases (\d{1,2}/\d{1,2}/\d{4}) - (\d{1,2}/\d{1,2}/\d{4})$")
# LY_By_Week.csv's header spacing has varied between exports ("Cases 2025 01"
# vs "Cases   2025 01") -- match on any whitespace run, not an exact count.
LY_WEEK_COL_RE = re.compile(r"^Cases\s+(\d{4})\s+(\d{2})$")

LAST_WEEK_NUM = 52


def to_num(raw):
    raw = (raw or "").strip()
    if raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        return float(raw)


def to_num_rde(raw):
    """L13_Trend.csv / LY_By_Week.csv are RDE exports: comma thousands
    separators and parenthesized negatives (e.g. " (2,448.00)"), unlike the
    Boston Beer portal/Encompass CSVs to_num() above handles."""
    raw = (raw or "").strip()
    if raw == "":
        return None
    neg = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()").replace(",", "")
    if raw == "":
        return None
    val = float(raw)
    return -val if neg else val


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
        inv[sku] = {
            "available": to_num(r.get("Available")),
            "lastReceiveDate": (r.get("Last Receive Date") or "").strip() or None,
            "lastReceiveQty": to_num(r.get("Last Receive Quantity")),
        }
    return inv


def parse_mdy(s):
    m, d, y = s.split("/")
    return date(int(y), int(m), int(d))


def week1_start(year):
    """The Sunday on or before Jan 1 of `year` -- the anchor of the retail
    week-numbering convention L13_Trend.csv / LY_By_Week.csv use (verified
    below, not assumed)."""
    jan1 = date(year, 1, 1)
    offset = (jan1.weekday() + 1) % 7  # Mon=0..Sun=6 -> days back to that Sunday
    return jan1 - timedelta(days=offset)


def week_number(d):
    """(year, week_num) for date d under the week1_start() convention -- week
    N runs Sunday..Saturday, N=1 being the week containing (or ending at)
    week1_start(d.year). Verified against L13_Trend.csv's own stated
    windows: this reproduces 4/20/2025 as week 17's start and 7/19/2025 as
    week 29's end exactly, for both the 2025 and 2026 windows the file
    ships with -- that agreement (not a hardcoded week number) is why this
    rule is trusted to project forward to arbitrary future dates too."""
    year = d.year
    start = week1_start(year)
    if d < start:
        year -= 1
        start = week1_start(year)
    return year, (d - start).days // 7 + 1


def week_end_label(year, week_num):
    """Short M/D label for the Saturday ending retail week `week_num` of
    `year`, for chart axis labels (e.g. week 30 of 2025 -> "7/26")."""
    end = week1_start(year) + timedelta(days=(week_num - 1) * 7 + 6)
    return f"{end.month}/{end.day}"


def load_l13_trend(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit(f"{path}: no data rows")
    windows = []
    for h in rows[0].keys():
        m = L13_WINDOW_COL_RE.match(h)
        if m:
            windows.append((parse_mdy(m.group(1)), parse_mdy(m.group(2)), h))
    if len(windows) != 2:
        raise SystemExit(f"{path}: expected exactly 2 'Cases <start> - <end>' window columns, found {len(windows)}")
    windows.sort(key=lambda w: w[1])  # earlier end date = last year's window
    ly_start, ly_end, ly_col = windows[0]
    ty_start, ty_end, ty_col = windows[1]

    out = {}
    for r in rows:
        sku = (r.get("Supplier Product ID") or "").strip()
        product = (r.get("Product Name") or "").strip()
        if not sku or not product:
            continue
        out[sku] = {"product": product, "lyCases": to_num_rde(r[ly_col]) or 0, "tyCases": to_num_rde(r[ty_col]) or 0}
    windows_out = {"lyStart": ly_start, "lyEnd": ly_end, "tyStart": ty_start, "tyEnd": ty_end}
    return out, windows_out


def load_ly_by_week(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit(f"{path}: no data rows")
    week_cols = [(int(m.group(1)), int(m.group(2)), h) for h in rows[0].keys() if (m := LY_WEEK_COL_RE.match(h))]
    if not week_cols:
        raise SystemExit(f"{path}: no 'Cases <year> <NN>' week columns found")

    out = {}
    for r in rows:
        sku = (r.get("Supplier Product ID") or "").strip()
        if not sku:
            continue
        weeks = {}
        for yr, wn, col in week_cols:
            v = to_num_rde(r[col])
            if v is not None:
                weeks[(yr, wn)] = v
        out[sku] = weeks
    return out


def build_trend_forecast(forecast_rows, week_dates, l13_lookup, l13_windows, ly_lookup, inv_lookup):
    fc_weeks = week_dates[:8]
    ly_year = l13_windows["lyEnd"].year
    week_meta = []
    for wd in fc_weeks:
        _, wn = week_number(parse_mdy(wd))
        week_meta.append({"weekEnding": wd, "lyYear": ly_year, "lyWeekNum": wn})
    ref_start_week = week_meta[0]["lyWeekNum"] if week_meta else None

    products = []
    unmatched_l13 = unmatched_ly = 0
    for r in forecast_rows:
        bbc = r["BBC SKU"].strip()
        l13 = resolve(bbc, l13_lookup)
        ly_weeks = resolve(bbc, ly_lookup)
        inv = resolve(bbc, inv_lookup)
        if l13 is None:
            unmatched_l13 += 1
        if ly_weeks is None:
            unmatched_ly += 1

        trend_pct = (l13["tyCases"] / l13["lyCases"] - 1) if (l13 and l13["lyCases"] > 0) else None

        # No computable 13-week trend (no L13 row, or last year's 13-week
        # total was zero/negative -- e.g. a mostly-returns window) doesn't
        # mean no forecast: fall back to carrying last year's actual cases
        # forward as-is (0% applied), rather than showing "no data" for a
        # SKU that clearly has sales history, just nothing to scale it by.
        weeks_out = []
        for wm in week_meta:
            f_raw = (r.get(f"{wm['weekEnding']} F") or "").strip()
            bbc_val = float(f_raw) if f_raw != "" else None
            ly_val = ly_weeks.get((wm["lyYear"], wm["lyWeekNum"])) if ly_weeks else None
            used_pct = trend_pct if trend_pct is not None else 0.0
            fallback = trend_pct is None and ly_val is not None
            trend_val = max(0, round(ly_val * (1 + used_pct))) if ly_val is not None else None
            diff_pct = (bbc_val - trend_val) / trend_val if (trend_val and bbc_val is not None) else None
            weeks_out.append({
                "weekEnding": wm["weekEnding"],
                "lyWeekNum": wm["lyWeekNum"],
                "lyCases": ly_val,
                "trendForecast": trend_val,
                "trendPctUsed": round(used_pct, 4) if trend_val is not None else None,
                "fallback": fallback,
                "bbcForecast": bbc_val,
                "diffPct": round(diff_pct, 4) if diff_pct is not None else None,
                "flagged": diff_pct is not None and abs(diff_pct) > 0.10,
            })

        # Full run of last year's actuals from the same starting week through
        # year end -- lets a manager see the whole reference season behind
        # the 8-week number, not just the 8 weeks themselves.
        last_year_ref = []
        if ly_weeks and ref_start_week:
            for wn in range(ref_start_week, LAST_WEEK_NUM + 1):
                last_year_ref.append({
                    "weekNum": wn,
                    "weekEnding": week_end_label(ly_year, wn),
                    "cases": ly_weeks.get((ly_year, wn)),
                })

        products.append({
            "sku": bbc,
            "product": (l13["product"] if l13 else None) or r["Product"].strip(),
            "available": inv["available"] if inv else None,
            "lastReceiveDate": inv["lastReceiveDate"] if inv else None,
            "lastReceiveQty": inv["lastReceiveQty"] if inv else None,
            "trendPct": round(trend_pct, 4) if trend_pct is not None else None,
            "l13LyCases": l13["lyCases"] if l13 else None,
            "l13TyCases": l13["tyCases"] if l13 else None,
            "hasTrend": any(w["trendForecast"] is not None for w in weeks_out),
            "weeks": weeks_out,
            "lastYearWeeklyRef": last_year_ref,
        })

    return {
        "meta": {
            "l13Window": {
                "lastYear": f"{l13_windows['lyStart'].isoformat()} - {l13_windows['lyEnd'].isoformat()}",
                "thisYear": f"{l13_windows['tyStart'].isoformat()} - {l13_windows['tyEnd'].isoformat()}",
            },
            "weeks": week_meta,
            "refStartWeek": ref_start_week,
            "refYear": ly_year,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "products": products,
        "unmatchedL13": unmatched_l13,
        "unmatchedLy": unmatched_ly,
    }


def main():
    forecast_csv = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_FORECAST_CSV
    inventory_csv = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_INVENTORY_CSV
    l13_csv = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_L13_CSV
    ly_by_week_csv = Path(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_LY_BY_WEEK_CSV
    for p in (forecast_csv, inventory_csv, l13_csv, ly_by_week_csv):
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
    l13_lookup, l13_windows = load_l13_trend(l13_csv)
    ly_lookup = load_ly_by_week(ly_by_week_csv)

    trend = build_trend_forecast(forecast_rows, week_dates, l13_lookup, l13_windows, ly_lookup, inv_lookup)
    TREND_OUT_JSON.write_text(json.dumps(trend))
    wk = trend["meta"]["weeks"]
    print(f"Wrote trend forecast for {len(trend['products'])} SKUs, {len(wk)} weeks "
          f"({wk[0]['weekEnding']} - {wk[-1]['weekEnding']}); last-year reference runs "
          f"week {trend['meta']['refStartWeek']}-{LAST_WEEK_NUM} of {trend['meta']['refYear']}.")
    if trend["unmatchedL13"]:
        print(f"{trend['unmatchedL13']} SKU(s) have no matching L13_Trend.csv row -- no trend to project, shown BBC-forecast-only.")
    if trend["unmatchedLy"]:
        print(f"{trend['unmatchedLy']} SKU(s) have no matching LY_By_Week.csv row -- no weekly baseline to scale, shown BBC-forecast-only.")


if __name__ == "__main__":
    main()
