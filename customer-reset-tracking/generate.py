#!/usr/bin/env python3
"""
Rebuilds the embedded data in index.html for the Customer Reset Tracking
dashboard: does resetting an off-premise account's shelf/cooler space (the
"SFS" program) actually lift its sales? Evaluates TWO cohorts side by side
-- the 2025 resets and the 2026 resets -- each against its own prior-year
baseline.

Methodology (per Kohler, 2026-08-07 -- monthly, not daily, since that's the
grain the RDE/Fusion exports below actually come in; kept deliberately
simple):
  - Sales inputs are monthly account totals (Customer Num x Year Month x
    Cases), not a dated transaction ledger, so windows are whole calendar
    months, not a rolling N-day window from the exact reset date.
  - 3-MONTH window: the reset's own month plus the following two calendar
    months (e.g. a March reset -> March+April+May), that same window one
    year earlier for the PRE side -- a year-over-year comparison at each
    account's own reset anchor, not a same-year before/after, so it isn't
    just normal seasonal variation.
  - YTD window: January through the latest fully-elapsed calendar month
    present in that cohort's sales file (the current in-progress month, if
    the file's newest month equals today's real month, is dropped so a
    half-finished month doesn't understate YTD), same Jan-through-that-month
    range one year earlier for the PRE side.
  - Lift % = (post total - pre total) / pre total, on Cases (the only
    metric in these exports -- no $ Volume / Gross Profit here, unlike the
    old daily-ledger build; see README). An account with zero prior-year
    cases in a window (a genuine brand-new placement, not just a
    first-time RESET of an existing account) has no baseline to divide by
    -- flagged as "no prior baseline" rather than an invented or infinite
    percentage.
  - First-time resets (a store's first-ever SFS reset) are tracked
    SEPARATELY from repeat resets, same as the prior build -- blending
    them together has previously hidden a large gap between the two.

Inputs (keep these filenames when refreshing -- see README for the full
refresh steps):
  reset_accounts_2026.xlsx  2026 reset roster -- Kohler Account #, TD Linx
                             #, Account Name, City, Segmentation (A/B/C),
                             Reset Date. Join key: Kohler Account # (==
                             sales_2026.csv's Customer Num).
  sales_2026.csv             RDE export, one row per (Customer, Brand
                              Family, Year Month) since Jan 2025, Cases only
                              -- replaces the old sales_2026-MM_batch.csv
                              files (those were a daily ledger covering only
                              Jan/Feb/Mar; this is a monthly aggregate
                              covering the full roster and all five cohort
                              months at once).
  reset_accounts_2025.xlsx  2025 reset roster -- TD Linx #, Account Name,
                             City, Segmentation, Reset Date, and a
                             "Customer ID" column that's ALREADY the sales
                             join key (Kohler manually matched TD Linx -> a
                             Customer Num for this file; see its own "Match
                             Basis" column) -- use that directly, there's no
                             "Kohler Account #" column in this file.
  sales_2025.csv             Same shape as sales_2026.csv (Customer Num x
                              Brand Family x Year Month x Cases), one year
                              back (Jan 2024 - Dec 2025), from a different
                              source system ("Fusion" vs. RDE) -- column
                              names are otherwise identical.
  reset_history_2024.xlsx    Prior program years (keyed by TD Linx #) --
  reset_history_2025.xlsx    used only to tag first-time vs. repeat resets,
                              not for their own sales figures. The 2025
                              cohort can only be checked against
                              reset_history_2024.xlsx (there's no 2023
                              history file), so "Repeat" there means
                              specifically "also reset in 2024."

Run: python3 generate.py
"""
import csv
import json
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

HERE = Path(__file__).parent
HISTORY_2024 = HERE / "reset_history_2024.xlsx"
HISTORY_2025 = HERE / "reset_history_2025.xlsx"
HTML = HERE / "index.html"

WINDOW_MONTHS = 3


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


def load_tdlinx_set(path, sheet, header_row):
    wb = load_workbook(path, data_only=True)
    ws = wb[sheet]
    out = set()
    for r in ws.iter_rows(min_row=header_row + 1, values_only=True):
        if r[0]:
            out.add(r[0])
    return out


def load_roster_2026():
    wb = load_workbook(HERE / "reset_accounts_2026.xlsx", data_only=True)
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


def load_roster_2025():
    """Header is on row 2 here (row 1 is blank) -- see the file itself."""
    wb = load_workbook(HERE / "reset_accounts_2025.xlsx", data_only=True)
    ws = wb["Sheet1"]
    header = [c.value for c in ws[2]]
    idx = {h: i for i, h in enumerate(header)}
    accounts = []
    for r in ws.iter_rows(min_row=3, values_only=True):
        if not r[idx["Customer ID"]] or not r[idx["RESET DATE"]]:
            continue
        accounts.append({
            "account": str(r[idx["Customer ID"]]),
            "tdLinx": r[idx["TD Linx #"]],
            "name": (r[idx["Account Name"]] or "").strip(),
            "city": (r[idx["City"]] or "").strip().title(),
            "segment": (r[idx["Segmentation"]] or "").strip() or None,
            "resetDate": r[idx["RESET DATE"]].date(),
        })
    return accounts


def parse_year_month(s):
    y, m = s.strip().split("/")
    return int(y), int(m)


def load_monthly_sales(path):
    """Returns {(account, year, month): total cases across every brand}.
    Each row's two "Cases <year>" columns are mutually exclusive (whichever
    one matches the row's own Year Month is populated, same pattern as the
    prior daily export) -- summed rather than picked, defensively, in case
    a future export ever populates both.

    Rows with Brand Family "Misc" (Supplier is always "Misc" too, on these
    rows specifically -- checked, never a real supplier paired with a
    "Misc" brand family or vice versa) are dropped: they're an opaque,
    unattributed catch-all -- not tied to any specific brand's shelf/cooler
    placement, which is what a reset actually affects -- and in this data
    they're wildly lumpy per account/month (single rows worth tens of
    thousands of cases in one month, then zero for months at a stretch),
    which was single-handedly producing account-level lift swings well into
    quadruple digits. They're a large share of raw volume (roughly
    30% of total cases in both exports) -- excluded rather than silently
    kept, so the number is visible: see the printed summary below and the
    dashboard's own caveats."""
    out = defaultdict(float)
    misc_cases = 0.0
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        cases_cols = [c for c in reader.fieldnames
                      if c.strip().startswith("Cases") and "Unit" not in c and "Percentage" not in c]
        for r in reader:
            ym = r.get("Year Month")
            account = (r.get("Customer Num") or "").strip()
            if not ym or not account:
                continue
            year, month = parse_year_month(ym)
            cases = 0.0
            found = False
            for c in cases_cols:
                v = to_num(r.get(c))
                if v is not None:
                    cases += v
                    found = True
            if not found:
                continue
            if (r.get("Brand Family") or "").strip().lower() == "misc":
                misc_cases += cases
                continue
            out[(account, year, month)] += cases
    return out, misc_cases


def month_range(year, month, count):
    out = []
    for i in range(count):
        total = (year * 12 + (month - 1)) + i
        out.append((total // 12, total % 12 + 1))
    return out


def sum_months(cases_by_ym, account, months):
    return round(sum(cases_by_ym.get((account, y, m), 0.0) for y, m in months), 2)


def lift_pct(post, pre):
    # A non-positive baseline (zero, or negative -- a window where returns/
    # credits outweighed purchases, seen at a couple of small accounts) has
    # no meaningful "% growth" reading -- "no prior baseline" rather than a
    # sign-flipped or wildly negative-looking percentage.
    if pre is None or pre <= 0:
        return None
    return round((post - pre) / pre * 100, 1)


def latest_complete_month(cases_by_ym):
    """The newest (year, month) with data, EXCLUDING the current real-world
    month if the export happens to include a still-in-progress month (its
    partial total would otherwise understate a YTD comparison)."""
    yms = sorted({(y, m) for (_, y, m) in cases_by_ym.keys()})
    if not yms:
        return None
    latest = yms[-1]
    today = date.today()
    if latest == (today.year, today.month):
        return yms[-2] if len(yms) >= 2 else None
    return latest


def evaluate_cohort(roster, cases_by_ym, reset_year, repeat_sets):
    """repeat_sets: list of (label, tdlinx_set) checked for the Repeat tag."""
    sales_accounts = {a for (a, _, _) in cases_by_ym.keys()}
    cutoff = latest_complete_month(cases_by_ym)
    cutoff_month = cutoff[1] if cutoff and cutoff[0] == reset_year else 12
    ytd_post_months = [(reset_year, m) for m in range(1, cutoff_month + 1)]
    ytd_pre_months = [(reset_year - 1, m) for m in range(1, cutoff_month + 1)]
    ytd_label = f"Jan–{date(reset_year, cutoff_month, 1).strftime('%b')} {reset_year}"

    evaluated, pending = [], []
    for a in roster:
        reset_date = a["resetDate"]
        hits = [label for label, s in repeat_sets if a["tdLinx"] in s]
        entry = {
            "account": a["account"], "name": a["name"].title(), "city": a["city"],
            "segment": a["segment"], "resetDate": reset_date.isoformat(),
            "resetMonth": reset_date.strftime("%B %Y"),
            "resetType": "Repeat" if hits else "First-Time",
            "repeatYears": hits,
        }
        if a["account"] not in sales_accounts:
            entry["status"] = "pending"
            pending.append(entry)
            continue

        post_months = month_range(reset_date.year, reset_date.month, WINDOW_MONTHS)
        pre_months = month_range(reset_date.year - 1, reset_date.month, WINDOW_MONTHS)
        post3 = sum_months(cases_by_ym, a["account"], post_months)
        pre3 = sum_months(cases_by_ym, a["account"], pre_months)
        ytdPost = sum_months(cases_by_ym, a["account"], ytd_post_months)
        ytdPre = sum_months(cases_by_ym, a["account"], ytd_pre_months)

        entry.update({
            "status": "evaluated",
            "post3": post3, "pre3": pre3, "lift3": lift_pct(post3, pre3),
            "ytdPost": ytdPost, "ytdPre": ytdPre, "liftYtd": lift_pct(ytdPost, ytdPre),
        })
        evaluated.append(entry)

    evaluated.sort(key=lambda e: (e["lift3"] is None, -(e["lift3"] or 0)))

    def blended(group, post_key, pre_key):
        pre_sum = sum(e[pre_key] for e in group)
        post_sum = sum(e[post_key] for e in group)
        return {"pre": round(pre_sum, 2), "post": round(post_sum, 2), "liftPct": lift_pct(post_sum, pre_sum)}

    def cohort_summary(group):
        return {
            "accountCount": len(group),
            "cases3": blended(group, "post3", "pre3"),
            "casesYtd": blended(group, "ytdPost", "ytdPre"),
            "upCount": sum(1 for e in group if e["lift3"] is not None and e["lift3"] > 0),
            "downCount": sum(1 for e in group if e["lift3"] is not None and e["lift3"] < 0),
            "noBaselineCount": sum(1 for e in group if e["lift3"] is None),
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

    return {
        "resetYear": reset_year,
        "ytdLabel": ytd_label,
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


def main():
    tdlinx_2024 = load_tdlinx_set(HISTORY_2024, "2024 Store Reset Data", 2)
    tdlinx_2025 = load_tdlinx_set(HISTORY_2025, "Store Reset Data", 3)

    sales_2026, misc_2026 = load_monthly_sales(HERE / "sales_2026.csv")
    sales_2025, misc_2025 = load_monthly_sales(HERE / "sales_2025.csv")

    cohort_2026 = evaluate_cohort(
        load_roster_2026(), sales_2026, 2026,
        [("2024", tdlinx_2024), ("2025", tdlinx_2025)],
    )
    cohort_2025 = evaluate_cohort(
        load_roster_2025(), sales_2025, 2025,
        [("2024", tdlinx_2024)],
    )

    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "windowMonths": WINDOW_MONTHS,
        "cohorts": {"2026": cohort_2026, "2025": cohort_2025},
    }

    data_json = json.dumps(payload, separators=(",", ":"))
    html = HTML.read_text(encoding="utf-8")
    new_html, n = re.subn(
        r'(<script id="reset-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + data_json + m.group(2),
        html, count=1, flags=re.S,
    )
    assert n == 1, 'reset-data script tag not found in index.html'
    HTML.write_text(new_html, encoding="utf-8")

    for year, misc in (("2026", misc_2026), ("2025", misc_2025)):
        print(f"{year} sales file: excluded {round(misc):,} Brand Family \"Misc\" cases (opaque, unattributed -- see generate.py)")
    for year, c in (("2026", cohort_2026), ("2025", cohort_2025)):
        o = c["overall"]
        print(f"{year} cohort: {c['evaluatedCount']} of {c['rosterTotal']} accounts evaluated "
              f"({c['pendingCount']} pending), YTD = {c['ytdLabel']}")
        print(f"  Overall: {o['upCount']} up / {o['downCount']} down / {o['noBaselineCount']} no baseline "
              f"-- blended 3-month Cases lift {o['cases3']['liftPct']}%, YTD lift {o['casesYtd']['liftPct']}%")
        ft, rp = c["byResetType"]["First-Time"], c["byResetType"]["Repeat"]
        print(f"  First-Time: {ft['accountCount']} accounts, blended 3-month lift {ft['cases3']['liftPct']}%")
        print(f"  Repeat: {rp['accountCount']} accounts, blended 3-month lift {rp['cases3']['liftPct']}%")


if __name__ == "__main__":
    main()
