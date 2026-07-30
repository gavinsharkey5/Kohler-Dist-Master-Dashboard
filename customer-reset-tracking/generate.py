#!/usr/bin/env python3
"""
Rebuilds the embedded data in index.html for the Customer Reset Tracking
dashboard: does
resetting an off-premise account's shelf/cooler space (the "SFS" program)
actually lift its sales?

Methodology (per Kohler, matches the "3 Months From Reset Date" window
already used in reset_history_2025.xlsx's own Store Reset Data tab):
  - POST window: each account's own Reset Date through Reset Date + 90 days,
    using 2026 transactions.
  - PRE window (year-over-year baseline, not same-year before/after): the
    SAME 90-day calendar window one year earlier (Reset Date - 365 days
    through Reset Date - 365 + 90 days), using 2025 transactions. This
    controls for seasonality (e.g. a January reset naturally selling more in
    Feb-Apr than Nov-Dec regardless of any reset effect) the same way the
    prior two program years' own methodology did.
  - Lift % = (post total - pre total) / pre total. An account with zero
    prior-year sales in that window (a genuine first-ever placement, not
    just a first-time RESET of an existing account) has no baseline to
    divide by -- flagged as "no prior baseline" rather than shown as an
    infinite or invented percentage.

Inputs (keep these filenames when refreshing):
  reset_accounts_2026.xlsx   The 2026 reset roster -- Kohler Account #, TD
                              Linx #, Name, Address, City, State, Zip,
                              Segmentation (A/B/C, meaning not yet confirmed
                              -- see README), Reset Date. 73 accounts,
                              1/2-5/7/2026.
  reset_history_2024.xlsx    Prior program year (keyed by TD Linx #) --
  reset_history_2025.xlsx    used only to tag each 2026 account as a
                              first-time reset vs. a repeat of a 2024 and/or
                              2025 reset, not for their own sales figures.
  sales_2026-MM_batch.csv    One file per reset cohort month (currently 01,
                              02, 03 -- April/May cohorts not pulled yet).
                              RDE export: one row per (Customer, Brand
                              Family, actual invoice date), Jan 2025 onward,
                              with Case Equiv / $vol / Gross Profit. Only one
                              of each metric's "2025"/"2026" column pair is
                              ever populated per row (whichever year the
                              row's own Load Sheet Date falls in) -- this is
                              a flat transaction ledger, not a pre-aggregated
                              pivot, so generate.py does the windowing.

Not yet available (see README "Still open"): a non-reset control-account
baseline, and confirmation of what Segmentation A/B/C actually represents.
Both are flagged in the dashboard's own caveats rather than assumed.

Run: python3 generate.py
"""
import csv
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from openpyxl import load_workbook

HERE = Path(__file__).parent
ROSTER_XLSX = HERE / "reset_accounts_2026.xlsx"
HISTORY_2024 = HERE / "reset_history_2024.xlsx"
HISTORY_2025 = HERE / "reset_history_2025.xlsx"
SALES_GLOB = "sales_2026-*_batch.csv"
HTML = HERE / "index.html"

WINDOW_DAYS = 90


def to_num(raw):
    if raw is None:
        return None
    raw = str(raw).strip()
    if raw == "":
        return None
    neg = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()").replace("$", "").replace(",", "").replace("%", "")
    if raw == "":
        return None
    val = float(raw)
    return -val if neg else val


def load_roster():
    wb = load_workbook(ROSTER_XLSX, data_only=True)
    ws = wb["Sheet1"]
    header = [c.value for c in ws[1]]
    idx = {h: i for i, h in enumerate(header)}
    accounts = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[idx["Kohler Account #"]]:
            continue
        accounts.append({
            "account": str(r[idx["Kohler Account #"]]),
            "tdLinx": r[idx["TD Linx #"]],
            "name": (r[idx["Account Name"]] or "").strip(),
            "city": (r[idx["City"]] or "").strip().title(),
            "segment": (r[idx["Segmentation"]] or "").strip() or None,
            "resetDate": r[idx["RESET DATE"]].date(),
        })
    return accounts


def load_tdlinx_set(path, sheet, header_row):
    wb = load_workbook(path, data_only=True)
    ws = wb[sheet]
    out = set()
    for r in ws.iter_rows(min_row=header_row + 1, values_only=True):
        if r[0]:
            out.add(r[0])
    return out


def load_sales_batches():
    """One row per (account, brand family, date, amount) -- the 2025/2026
    column pair is collapsed into a single dated value here since only one
    of the pair is ever populated per row (whichever year it actually fell
    in)."""
    rows = []
    for path in sorted(HERE.glob(SALES_GLOB)):
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for r in reader:
                date_raw = (r.get("Load Sheet Date") or "").strip()
                if not date_raw:
                    continue
                date = datetime.strptime(date_raw, "%m/%d/%Y").date()
                ce = to_num(r.get("Case Equiv   2025")) or to_num(r.get("Case Equiv   2026"))
                dv = to_num(r.get("$vol   2025")) or to_num(r.get("$vol   2026"))
                gp = to_num(r.get("Gross Profit   2025")) or to_num(r.get("Gross Profit   2026"))
                rows.append({
                    "account": r["Customer Num"].strip(),
                    "brand": r["Brand Family"].strip(),
                    "date": date,
                    "caseEquiv": ce or 0.0,
                    "dollarVol": dv or 0.0,
                    "grossProfit": gp or 0.0,
                })
    return rows


def window_totals(rows, account, start, end):
    ce = dv = gp = 0.0
    for r in rows:
        if r["account"] == account and start <= r["date"] < end:
            ce += r["caseEquiv"]; dv += r["dollarVol"]; gp += r["grossProfit"]
    return {"caseEquiv": round(ce, 2), "dollarVol": round(dv, 2), "grossProfit": round(gp, 2)}


def lift_pct(post, pre):
    if pre in (0, None):
        return None
    return round((post - pre) / pre * 100, 1)


def main():
    roster = load_roster()
    tdlinx_2024 = load_tdlinx_set(HISTORY_2024, "2024 Store Reset Data", 2)
    tdlinx_2025 = load_tdlinx_set(HISTORY_2025, "Store Reset Data", 3)
    sales_rows = load_sales_batches()
    sales_accounts = {r["account"] for r in sales_rows}

    by_account = defaultdict(list)
    for r in sales_rows:
        by_account[r["account"]].append(r)

    evaluated = []
    pending = []
    for a in roster:
        reset_date = a["resetDate"]
        is_repeat_24 = a["tdLinx"] in tdlinx_2024
        is_repeat_25 = a["tdLinx"] in tdlinx_2025
        entry = {
            "account": a["account"], "name": a["name"].title(), "city": a["city"],
            "segment": a["segment"], "resetDate": reset_date.isoformat(),
            "resetMonth": reset_date.strftime("%B %Y"),
            "resetType": "Repeat" if (is_repeat_24 or is_repeat_25) else "First-Time",
            "repeatYears": [y for y, hit in (("2024", is_repeat_24), ("2025", is_repeat_25)) if hit],
        }
        if a["account"] not in sales_accounts:
            entry["status"] = "pending"
            pending.append(entry)
            continue

        post_start = reset_date
        post_end = reset_date + timedelta(days=WINDOW_DAYS)
        pre_start = reset_date - timedelta(days=365)
        pre_end = pre_start + timedelta(days=WINDOW_DAYS)

        rows = by_account[a["account"]]
        post = window_totals(rows, a["account"], post_start, post_end)
        pre = window_totals(rows, a["account"], pre_start, pre_end)

        entry.update({
            "status": "evaluated",
            "post": post, "pre": pre,
            "liftCaseEquiv": lift_pct(post["caseEquiv"], pre["caseEquiv"]),
            "liftDollarVol": lift_pct(post["dollarVol"], pre["dollarVol"]),
            "liftGrossProfit": lift_pct(post["grossProfit"], pre["grossProfit"]),
        })
        evaluated.append(entry)

    evaluated.sort(key=lambda e: (e["liftCaseEquiv"] is None, -(e["liftCaseEquiv"] or 0)))

    def blended(group, metric_pre, metric_post):
        pre_sum = sum(e["pre"][metric_pre] for e in group)
        post_sum = sum(e["post"][metric_post] for e in group)
        return {"pre": round(pre_sum, 2), "post": round(post_sum, 2), "liftPct": lift_pct(post_sum, pre_sum)}

    def cohort_summary(group):
        return {
            "accountCount": len(group),
            "caseEquiv": blended(group, "caseEquiv", "caseEquiv"),
            "dollarVol": blended(group, "dollarVol", "dollarVol"),
            "grossProfit": blended(group, "grossProfit", "grossProfit"),
            "upCount": sum(1 for e in group if e["liftCaseEquiv"] is not None and e["liftCaseEquiv"] > 0),
            "downCount": sum(1 for e in group if e["liftCaseEquiv"] is not None and e["liftCaseEquiv"] < 0),
            "noBaselineCount": sum(1 for e in group if e["liftCaseEquiv"] is None),
        }

    overall = cohort_summary(evaluated)
    by_reset_type = {t: cohort_summary([e for e in evaluated if e["resetType"] == t]) for t in ("First-Time", "Repeat")}
    by_month = {}
    for e in evaluated:
        by_month.setdefault(e["resetMonth"], []).append(e)
    by_month_summary = {m: cohort_summary(g) for m, g in sorted(by_month.items(), key=lambda kv: kv[1][0]["resetDate"])}
    by_segment = {}
    for e in evaluated:
        if e["segment"]:
            by_segment.setdefault(e["segment"], []).append(e)
    by_segment_summary = {s: cohort_summary(g) for s, g in sorted(by_segment.items())}

    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "windowDays": WINDOW_DAYS,
        "rosterTotal": len(roster),
        "evaluatedCount": len(evaluated),
        "pendingCount": len(pending),
        "overall": overall,
        "byResetType": by_reset_type,
        "byMonth": by_month_summary,
        "bySegment": by_segment_summary,
        "accounts": evaluated,
        "pendingAccounts": pending,
    }

    data_json = json.dumps(payload, separators=(',', ':'))
    html = HTML.read_text(encoding='utf-8')
    new_html, n = re.subn(
        r'(<script id="reset-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + data_json + m.group(2),
        html, count=1, flags=re.S,
    )
    assert n == 1, 'reset-data script tag not found in index.html'
    HTML.write_text(new_html, encoding='utf-8')

    print(f"{len(evaluated)} accounts evaluated ({len(pending)} pending -- no sales data pulled yet), "
          f"of {len(roster)} total 2026 reset accounts")
    print(f"Overall: {overall['upCount']} up / {overall['downCount']} down / {overall['noBaselineCount']} no baseline "
          f"-- blended Case Equiv lift {overall['caseEquiv']['liftPct']}%")
    print(f"First-Time: {by_reset_type['First-Time']['accountCount']} accounts, "
          f"blended lift {by_reset_type['First-Time']['caseEquiv']['liftPct']}%")
    print(f"Repeat: {by_reset_type['Repeat']['accountCount']} accounts, "
          f"blended lift {by_reset_type['Repeat']['caseEquiv']['liftPct']}%")


if __name__ == "__main__":
    main()
