#!/usr/bin/env python3
"""
Builds data/data.json for the 6-Month Review dashboard: for every brand
family, current YTD trend % vs. its 2026 Brewery Goal % and Kohler Goal %
(both from the 2026 planning workbook), so brand managers can see at a
glance whether they're ahead of, on, or behind pace -- and recalibrate the
back half of the year accordingly.

Inputs (keep these filenames when refreshing):
  2026_planning_source.xlsx  The 2026 Planning by Brand workbook. Gives us
                              the brand -> supplier / brand manager taxonomy
                              plus each brand's 2026 Brewery & Kohler Goal %
                              (columns K/N of the '2026 Planning by Brand'
                              tab). Same workbook used by ../2027-planning/.
  ytd_comparison.csv          RDE "Comparison" export, same-period-both-years
                              (e.g. "Case Equiv 1/1/2025-7/28/2025" vs
                              "Case Equiv 1/1/2026-7/28/2026" plus a
                              "Case Equiv % +/-" column) -- this IS the
                              current trend %, no projection math needed.
                              Column headers' date ranges shift every time
                              this gets re-pulled; matched by "Case Equiv"
                              prefix, not the exact header string.
  denise_food_bev_product_detail.csv (optional)
                              Product-level RDE export for Food & Bev
                              Enterprise LLC. RDE's own Brand Family
                              tagging conflates several of that
                              supplier's workbook brands (see
                              FOOD_BEV_BRAND_KEYWORDS below); this file's
                              Product Name text still distinguishes them,
                              recovering the real per-brand split.

A brand with no Brewery/Kohler goal set in the workbook (new items launched
after the plan was built, e.g. Carbliss, Monaco, Noca) is kept OUT of the
main vs-goal table and instead listed on its own "New in 2026" tab --
there's no goal to compare it against yet.

Run: python3 generate.py
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
WORKBOOK = HERE / "2026_planning_source.xlsx"
CSV_YTD = HERE / "ytd_comparison.csv"
DENISE_PRODUCT_DETAIL = HERE / "denise_food_bev_product_detail.csv"
HTML = HERE / "index.html"
OUT = HERE / "data" / "data.json"

# Same aliasing quirk documented in ../2027-planning/build_data.py: the
# workbook's hand-entered "Pabst Brand" is RDE's "Pabst Blue Ribbon".
NAME_ALIASES = {
    "pabst blue ribbon": "Pabst Brand",
}


def to_num(raw):
    if raw is None:
        return 0.0
    raw = str(raw).strip()
    if raw == "" or raw == "-":
        return 0.0
    neg = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()").replace("$", "").replace(",", "").replace("%", "")
    if raw == "":
        return 0.0
    val = float(raw)
    return -val if neg else val


def load_workbook_taxonomy():
    wb_values = openpyxl.load_workbook(WORKBOOK, data_only=True)
    wb_formulas = openpyxl.load_workbook(WORKBOOK, data_only=False)
    wsv = wb_values["2026 Planning by Brand"]
    wsf = wb_formulas["2026 Planning by Brand"]

    brands = {}
    brands_lower = {}
    supplier_names = set()
    brand_manager_by_supplier = {}

    for r in range(3, wsv.max_row + 1):
        brand = wsv.cell(r, 1).value
        if brand is None or str(brand).strip() == "":
            continue
        is_grey = wsf.cell(r, 1).fill.patternType == "solid"
        supplier = wsv.cell(r, 2).value

        if is_grey:
            grey_name = str(brand).strip()
            supplier_names.add(grey_name)
            grey_manager = wsv.cell(r, 3).value
            if grey_manager:
                brand_manager_by_supplier.setdefault(grey_name, str(grey_manager).strip())
            continue

        manager = wsv.cell(r, 3).value
        finish_2025 = wsv.cell(r, 10).value
        brewery_pct = wsv.cell(r, 11).value
        kohler_pct = wsv.cell(r, 14).value

        name = str(brand).strip()
        brands[name] = {
            "brand": name,
            "supplier": (str(supplier).strip() if supplier else None),
            "brand_manager": manager,
            "finish_2025_ce": finish_2025 if isinstance(finish_2025, (int, float)) else None,
            "goal2026_brewery_pct": brewery_pct if isinstance(brewery_pct, (int, float)) else None,
            "goal2026_kohler_pct": kohler_pct if isinstance(kohler_pct, (int, float)) else None,
        }
        if supplier:
            supplier_names.add(str(supplier).strip())
        if supplier and manager:
            brand_manager_by_supplier.setdefault(str(supplier).strip(), str(manager).strip())
        brands_lower[name.lower()] = name

    return brands, brands_lower, supplier_names, brand_manager_by_supplier


def parse_ytd_csv(path, brands, brands_lower, supplier_names):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        prior_col = next(c for c in fieldnames if c.startswith("Case Equiv 1/1/2025") or c.startswith("Case Equiv 1/1/202") and "2025" in c)
        # Robust column matching: first "Case Equiv <date>" column is the prior
        # year, the second is the current year; the % column starts "Case Equiv %".
        ce_cols = [c for c in fieldnames if c.startswith("Case Equiv") and not c.startswith("Case Equiv %") and not c.startswith("Case Equiv ±")]
        pct_col = next(c for c in fieldnames if c.startswith("Case Equiv %"))
        prior_col, current_col = ce_cols[0], ce_cols[1]

        rows = []
        for r in reader:
            name = (r.get("Supplier / Brand Family") or "").strip()
            if not name or name == "Total":
                continue
            rows.append((name, {
                "ce_prior": to_num(r[prior_col]),
                "ce_current": to_num(r[current_col]),
                "pct_change": to_num(r[pct_col]) / 100.0,
            }))

    supplier_names_lower = {s.lower() for s in supplier_names}
    results = {}
    current_supplier = None
    unclassified = []
    skipped_phantom_headers = []

    for i, (raw_name, metrics) in enumerate(rows):
        name_l = raw_name.lower()
        next_name_l = rows[i + 1][0].lower() if i + 1 < len(rows) else None
        next_metrics = rows[i + 1][1] if i + 1 < len(rows) else None

        alias = NAME_ALIASES.get(name_l)
        canonical = alias or brands_lower.get(name_l)

        # A brand-family name that's immediately followed by an identical-name
        # row is functioning as this brand's own supplier-subtotal header here
        # (e.g. "Heineken USA" / "Heineken USA", "Sapporo" / "Sapporo") -- the
        # SECOND occurrence is the real leaf data, this first one is skipped.
        if canonical and next_name_l == name_l:
            current_supplier = canonical
            continue

        # A known brand name is treated as real leaf data even when that same
        # name is ALSO registered as a supplier label in the workbook (e.g.
        # single-brand entities like "Carbliss", "Monaco") -- some RDE pulls
        # emit just the one row for these instead of a header+leaf pair, and
        # without this check that lone row would get swallowed as a phantom
        # header (see the Kohler-side supplier check just below).
        if canonical:
            supplier = brands[canonical]["supplier"] or current_supplier
            results[(supplier, canonical)] = metrics
            continue

        if name_l in supplier_names_lower:
            current_supplier = next(s for s in supplier_names if s.lower() == name_l)
            continue

        # Unrecognized name, not a known brand or supplier. If the very next
        # row has identical Case Equiv figures, this row is almost certainly
        # a phantom supplier-subtotal for that single next brand (RDE's own
        # distributor/supplier label for it, which isn't in the workbook at
        # all -- e.g. "SN Food & Beverage LLC" heading straight into
        # "Carbliss" with the same total) rather than real brand data of its
        # own; skip it so its volume isn't double-counted under two names.
        if next_metrics is not None and next_metrics == metrics:
            skipped_phantom_headers.append(raw_name)
            current_supplier = raw_name
            continue

        unclassified.append((current_supplier, raw_name, metrics))

    if skipped_phantom_headers:
        print(f"Skipped {len(skipped_phantom_headers)} phantom header row(s) (unrecognized name, "
              f"identical totals to the very next row): {skipped_phantom_headers}")

    return results, unclassified


# RDE's own Brand Family tagging conflates several of Food & Bev Enterprise
# LLC's workbook line-item brands: Aguila Light Import products get tagged
# "Aguila Import" (inflating that brand's real total), and Club Colombia
# Dorada/Roja + Pilsen Import products all get tagged a generic "Food & Bev"
# with no per-brand split at all. Confirmed with Kohler, 2026-07-29, via a
# product-level RDE export (denise_food_bev_product_detail.csv) where the
# Product Name text (unlike Brand Family) still distinguishes them -- this
# recovers the real per-brand split by matching on that text instead.
FOOD_BEV_SUPPLIER = "Food & Bev Enterprise LLC"
FOOD_BEV_BRAND_KEYWORDS = [
    # (keyword to find in Product Name, canonical workbook brand). Order
    # matters: "light" is checked before the bare "aguila" fallback so
    # Aguila Light Import products don't get counted as Aguila Import.
    ("dorada", "Club Colombia Dorada"),
    ("roja", "Club Colombia Roja"),
    ("pilsen", "Pilsen Import"),
    ("light", "Aguila Light"),
    ("aguila", "Aguila Import"),
]


def parse_product_detail_overrides(path, supplier=FOOD_BEV_SUPPLIER, keywords=FOOD_BEV_BRAND_KEYWORDS):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        ce_cols = [c for c in fieldnames if c.startswith("Case Equiv") and not c.startswith("Case Equiv %") and not c.startswith("Case Equiv ±")]
        prior_col, current_col = ce_cols[0], ce_cols[1]
        rows = list(reader)

    sums = defaultdict(lambda: {"ce_prior": 0.0, "ce_current": 0.0})
    for row in rows:
        if (row.get("Supplier") or "").strip() != supplier:
            continue
        product = (row.get("Product Name") or "").lower()
        brand = next((b for kw, b in keywords if kw in product), None)
        if brand is None:
            continue
        sums[brand]["ce_prior"] += to_num(row[prior_col])
        sums[brand]["ce_current"] += to_num(row[current_col])

    overrides = {}
    for brand, m in sums.items():
        pct_change = (m["ce_current"] / m["ce_prior"] - 1) if m["ce_prior"] else None
        overrides[brand] = {"ce_prior": m["ce_prior"], "ce_current": m["ce_current"], "pct_change": pct_change}
    return overrides


# Excluded outright (per Kohler, 2026-07-28) -- these are negative/near-zero
# credit-adjustment entries in the RDE export, not real current placements.
EXCLUDED_BRANDS = {"shipyard", "jersey girl", "soda birch", "whole hog"}

# Per Kohler, 2026-07-29: show these managers' goal-less-but-actively-selling
# brands on the main Vs. Goal table instead of "New in 2026", with the goal/
# gap/projection columns left blank (no goal to map them to). Scoped to named
# managers only, not a general policy change -- brands with zero 2025 volume
# still belong on the New tab regardless of manager, since there's no prior-
# year baseline to show a trend against either way.
FORCE_VS_GOAL_MANAGERS = {"Denise Montes"}


def main():
    brands, brands_lower, supplier_names, brand_manager_by_supplier = load_workbook_taxonomy()
    print(f"Loaded {len(brands)} canonical brand families with 2026 goals from the workbook.")

    matched, unclassified = parse_ytd_csv(CSV_YTD, brands, brands_lower, supplier_names)
    print(f"Matched {len(matched)} brand families in {CSV_YTD.name}; {len(unclassified)} unmatched (new SKUs).")

    if DENISE_PRODUCT_DETAIL.exists():
        overrides = parse_product_detail_overrides(DENISE_PRODUCT_DETAIL)
        for brand, metrics in overrides.items():
            matched[(FOOD_BEV_SUPPLIER, brand)] = metrics
        # The generic "Food & Bev" rollup row is now fully represented by the
        # disaggregated brands above -- drop it so its volume isn't double-counted.
        unclassified = [u for u in unclassified if not (u[0] == FOOD_BEV_SUPPLIER and u[1] == "Food & Bev")]
        print(f"Applied product-level brand split for {len(overrides)} {FOOD_BEV_SUPPLIER} brand(s) "
              f"from {DENISE_PRODUCT_DETAIL.name}: {sorted(overrides)}.")

    matched = {k: v for k, v in matched.items() if k[1].lower() not in EXCLUDED_BRANDS}
    unclassified = [u for u in unclassified if u[1].lower() not in EXCLUDED_BRANDS]

    with_goal = []
    no_goal = []

    for (supplier, brand), metrics in matched.items():
        base = brands.get(brand, {})
        brewery_pct = base.get("goal2026_brewery_pct")
        kohler_pct = base.get("goal2026_kohler_pct")
        finish_2025 = base.get("finish_2025_ce")
        manager = base.get("brand_manager") or brand_manager_by_supplier.get(supplier)
        trend = metrics["pct_change"]
        ce_prior, ce_current = metrics["ce_prior"], metrics["ce_current"]

        # 2026 projected finish = current YTD + (2025's full-year finish minus
        # its own YTD-comparable slice, i.e. the "remainder" period) grown at
        # this year's YTD trend rate. Same method used in ../2027-planning/.
        if finish_2025 is not None:
            remainder_2025 = finish_2025 - ce_prior
            proj_finish = ce_current + remainder_2025 * (1 + (trend or 0))
        else:
            proj_finish = None

        rec = {
            "brand": brand,
            "supplier": supplier,
            "brand_manager": manager,
            "ce_prior": ce_prior,
            "ce_current": ce_current,
            "trend_pct": trend,
            "finish_2025_ce": finish_2025,
            "proj_finish_2026_ce": proj_finish,
        }

        # No goal at all, OR zero recorded sales in the 2025 comparable
        # window -- either way there's no real prior-year baseline to
        # measure a 2026 trend against, so it belongs on the New tab
        # rather than the main vs-goal table (per Kohler, 2026-07-28).
        if (brewery_pct is None and kohler_pct is None) or ce_prior == 0:
            if manager in FORCE_VS_GOAL_MANAGERS and ce_prior != 0:
                rec["goal_brewery_pct"] = None
                rec["goal_kohler_pct"] = None
                rec["gap_brewery"] = None
                rec["gap_kohler"] = None
                with_goal.append(rec)
            else:
                no_goal.append(rec)
        else:
            rec["goal_brewery_pct"] = brewery_pct
            rec["goal_kohler_pct"] = kohler_pct
            rec["gap_brewery"] = (trend - brewery_pct) if (trend is not None and brewery_pct is not None) else None
            rec["gap_kohler"] = (trend - kohler_pct) if (trend is not None and kohler_pct is not None) else None
            with_goal.append(rec)

    # Some suppliers have workbook line-item brands that RDE's brand-family
    # tagging never breaks out individually -- their combined volume shows up
    # as one generic-named row (e.g. "Sinless Vodka Cocktail" covering both
    # Jim Beam Kentucky and Sinless). Relabel those rows to name the actual
    # planning-workbook brands they represent, so they're recognizable
    # instead of opaque. (Food & Bev Enterprise LLC's brands used to hit this
    # too, until the product-level override above started splitting them for
    # real instead of just relabeling the rollup.)
    matched_brand_names = {b for (_supplier, b) in matched.keys()}
    brands_by_supplier = defaultdict(list)
    for b_name, b_rec in brands.items():
        if b_rec["supplier"]:
            brands_by_supplier[b_rec["supplier"]].append(b_name)

    for supplier, name, metrics in unclassified:
        manager = brand_manager_by_supplier.get(supplier)
        unbroken_out = [b for b in brands_by_supplier.get(supplier, []) if b not in matched_brand_names]
        brand_label = f"{name} ({', '.join(sorted(unbroken_out))})" if unbroken_out else name
        rec = {
            "brand": brand_label,
            "supplier": supplier,
            "brand_manager": manager,
            "ce_prior": metrics["ce_prior"],
            "ce_current": metrics["ce_current"],
            "trend_pct": metrics["pct_change"],
        }
        if manager in FORCE_VS_GOAL_MANAGERS and metrics["ce_prior"] != 0:
            rec.update(finish_2025_ce=None, proj_finish_2026_ce=None,
                       goal_brewery_pct=None, goal_kohler_pct=None,
                       gap_brewery=None, gap_kohler=None)
            with_goal.append(rec)
        else:
            no_goal.append(rec)

    # Terminated: zero or negative 2026 YTD case volume, regardless of
    # whether the brand has a goal or prior-year sales -- it's not actively
    # selling right now, so it doesn't belong in either the vs-goal
    # comparison or the New-in-2026 white-space list. Pulled out of both
    # buckets rather than added on top, so a brand appears in exactly one tab.
    # ce_current is None for the goal-only per-brand rows added above (no
    # actual sales tracked against them individually) -- never terminated.
    terminated = [r for r in with_goal + no_goal if r["ce_current"] is not None and r["ce_current"] <= 0]
    with_goal = [r for r in with_goal if r["ce_current"] is None or r["ce_current"] > 0]
    no_goal = [r for r in no_goal if r["ce_current"] is None or r["ce_current"] > 0]

    with_goal.sort(key=lambda r: (r["gap_brewery"] if r["gap_brewery"] is not None else 999))
    no_goal.sort(key=lambda r: -r["ce_current"])
    terminated.sort(key=lambda r: r["ce_current"])

    managers = sorted({r["brand_manager"] for r in with_goal + no_goal + terminated if r.get("brand_manager")})
    suppliers = sorted({r["supplier"] for r in with_goal + no_goal if r.get("supplier")})

    behind_brewery = sum(1 for r in with_goal if r.get("gap_brewery") is not None and r["gap_brewery"] < 0)
    behind_kohler = sum(1 for r in with_goal if r.get("gap_kohler") is not None and r["gap_kohler"] < 0)

    payload = {
        "generatedNote": "Built from 2026_planning_source.xlsx (goals) + ytd_comparison.csv (current trend). "
                          "See generate.py for methodology.",
        "meta": {
            "totalWithGoal": len(with_goal),
            "totalNoGoal": len(no_goal),
            "totalTerminated": len(terminated),
            "behindBrewery": behind_brewery,
            "behindKohler": behind_kohler,
        },
        "managers": managers,
        "suppliers": suppliers,
        "brands": with_goal,
        "newBrands": no_goal,
        "terminatedBrands": terminated,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {len(with_goal)} brands with goals + {len(no_goal)} brands with no 2025 goal/sales "
          f"+ {len(terminated)} terminated brands to {OUT}")
    print(f"Behind Brewery goal: {behind_brewery} / {len(with_goal)}   Behind Kohler goal: {behind_kohler} / {len(with_goal)}")


if __name__ == "__main__":
    main()
