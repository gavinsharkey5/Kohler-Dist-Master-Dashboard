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

Also builds a supplier-level rollup (payload["supplierRollup"], the "By
Supplier" tab) using the SAME vs-goal math, but sourced from each
supplier's own grey header row in the workbook (its own Brewery/Kohler
Goal % and 2025 Finish, not a sum of its brands') and its own subtotal
row in ytd_comparison.csv (not a re-sum of the brand-level rows).

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

# Per Gavin, 2026-08-04: the workbook itself mis-lists these brands' Supplier
# column -- e.g. "Fresca Mixed" is tagged "Constellation Brands" in the
# workbook, but ytd_comparison.csv's own row order puts it under its own
# "SAZERAC INC" header, separate from Constellation's brands entirely (a
# workbook data-entry error, not an RDE/parsing issue). Corrected here rather
# than editing 2026_planning_source.xlsx directly.
SUPPLIER_OVERRIDES = {
    "Fresca Mixed": "Sazerac Inc",
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
    # Supplier-level rollup: the grey header row for each supplier carries its
    # OWN 2026 Brewery/Kohler Goal % and 2025 Finish (same columns J/K/N as a
    # brand row), not just its per-brand children -- this is what powers the
    # "By Supplier" tab.
    supplier_goals = {}

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
            grey_finish_2025 = wsv.cell(r, 10).value
            grey_brewery_pct = wsv.cell(r, 11).value
            grey_kohler_pct = wsv.cell(r, 14).value
            supplier_goals[grey_name] = {
                "supplier": grey_name,
                "brand_manager": str(grey_manager).strip() if grey_manager else None,
                "finish_2025_ce": grey_finish_2025 if isinstance(grey_finish_2025, (int, float)) else None,
                "goal2026_brewery_pct": grey_brewery_pct if isinstance(grey_brewery_pct, (int, float)) else None,
                "goal2026_kohler_pct": grey_kohler_pct if isinstance(grey_kohler_pct, (int, float)) else None,
            }
            continue

        manager = wsv.cell(r, 3).value
        finish_2025 = wsv.cell(r, 10).value
        brewery_pct = wsv.cell(r, 11).value
        kohler_pct = wsv.cell(r, 14).value

        name = str(brand).strip()
        supplier_name = str(supplier).strip() if supplier else None
        supplier_name = SUPPLIER_OVERRIDES.get(name, supplier_name)
        brands[name] = {
            "brand": name,
            "supplier": supplier_name,
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

    return brands, brands_lower, supplier_names, brand_manager_by_supplier, supplier_goals


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
        # e.g. "Case Equiv 1/1/2025 - 7/31/2025" -> "1/1/2025 - 7/31/2025" --
        # the exact comparison window pulled this refresh, so the dashboard's
        # column headers/notices can show it without ever being hand-edited.
        range_prior = prior_col.replace("Case Equiv", "").strip()
        range_current = current_col.replace("Case Equiv", "").strip()

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
    supplier_ytd = {}
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
        # When that header name is itself a known supplier (single-brand
        # suppliers like these), its own row IS that supplier's total.
        if canonical and next_name_l == name_l:
            current_supplier = canonical
            if canonical.lower() in supplier_names_lower:
                exact_supplier = next(s for s in supplier_names if s.lower() == canonical.lower())
                supplier_ytd.setdefault(exact_supplier, metrics)
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
            # Single-brand suppliers (Sapporo, Kirin Ichiban, ...) sometimes
            # collapse to just this one row instead of a header+leaf pair --
            # when the brand's own registered supplier IS itself (same name),
            # this row's total doubles as that supplier's own YTD total.
            if supplier and supplier.lower() == canonical.lower() and supplier.lower() in supplier_names_lower:
                exact_supplier = next(s for s in supplier_names if s.lower() == supplier.lower())
                supplier_ytd.setdefault(exact_supplier, metrics)
            continue

        if name_l in supplier_names_lower:
            current_supplier = next(s for s in supplier_names if s.lower() == name_l)
            # This row's own Case Equiv figures ARE that supplier's total
            # (sum of every brand-family row that follows it) -- captured
            # here for the "By Supplier" rollup tab.
            supplier_ytd.setdefault(current_supplier, metrics)
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

    return results, unclassified, supplier_ytd, range_prior, range_current


# ---------------------------------------------------------------------------
# Raw Supplier -> Brand Family hierarchy, reconstructed straight from
# ytd_comparison.csv's own row order -- for the "Supplier + Brand" combo tab.
# ---------------------------------------------------------------------------
# Per Gavin, 2026-08-04: that tab should mirror the RDE export's own
# structure exactly (every supplier it tracks, every brand family under it,
# whether or not it has a workbook goal) rather than the curated with-goal
# subset the Vs. Goal / By Supplier tabs use. RDE flattens a 2-level
# Supplier -> Brand Family tree into one column with no indent markers, but
# it's still fully recoverable: a header row's own Case Equiv figures always
# equal the SUM of the brand-family rows immediately beneath it, up to the
# next header row. This reconstructs that tree by greedily finding, for each
# candidate header row, the smallest run of following rows whose Case Equiv
# sum matches it exactly (absorbing any trailing exact-zero row too, since a
# real zero-volume child can be genuinely ambiguous with the next header
# otherwise -- see "Coney Island" under Boston Beer Company).
HIERARCHY_TOLERANCE = 0.03
HIERARCHY_MAX_CHILDREN = 60


def build_raw_supplier_tree(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        ce_cols = [c for c in fieldnames if c.startswith("Case Equiv")
                   and not c.startswith("Case Equiv %") and not c.startswith("Case Equiv ±")]
        prior_col, current_col = ce_cols[0], ce_cols[1]
        rows = []
        for r in reader:
            name = (r.get("Supplier / Brand Family") or "").strip()
            if not name or name == "Total":
                continue
            rows.append((name, to_num(r[prior_col]), to_num(r[current_col])))

    groups = []
    unresolved = []
    i = 0
    while i < len(rows):
        name, prior, current = rows[i]
        matched_k = None
        csum_p = csum_c = 0.0
        for k in range(1, min(HIERARCHY_MAX_CHILDREN, len(rows) - i)):
            cp, cc = rows[i + k][1], rows[i + k][2]
            csum_p += cp
            csum_c += cc
            if abs(csum_p - prior) < HIERARCHY_TOLERANCE and abs(csum_c - current) < HIERARCHY_TOLERANCE:
                # Greedily absorb any immediately-following exact-zero row(s)
                # too -- they don't change the sum, so they're ambiguous
                # between "this group's trailing child" and "next header's
                # leading child"; a zero-volume item is unambiguously the
                # former.
                j = k
                while (i + j + 1 < len(rows)
                       and abs(rows[i + j + 1][1]) < HIERARCHY_TOLERANCE
                       and abs(rows[i + j + 1][2]) < HIERARCHY_TOLERANCE):
                    j += 1
                matched_k = j
                break
        if matched_k is None:
            unresolved.append((name, prior, current))
            i += 1
            continue
        children = rows[i + 1:i + 1 + matched_k]
        groups.append({"supplier": name, "ce_prior": prior, "ce_current": current, "children": children})
        i += 1 + matched_k

    if unresolved:
        raise SystemExit(
            f"Could not reconstruct the Supplier/Brand Family hierarchy for {len(unresolved)} row(s) in "
            f"{path.name} -- a header row's own Case Equiv figures no longer sum-match its following rows. "
            f"Investigate before trusting the Supplier + Brand tab: {unresolved[:10]}")

    return groups


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
    brands, brands_lower, supplier_names, brand_manager_by_supplier, supplier_goals = load_workbook_taxonomy()
    print(f"Loaded {len(brands)} canonical brand families with 2026 goals from the workbook.")

    matched, unclassified, supplier_ytd, range_prior, range_current = parse_ytd_csv(
        CSV_YTD, brands, brands_lower, supplier_names)
    print(f"Matched {len(matched)} brand families in {CSV_YTD.name}; {len(unclassified)} unmatched (new SKUs).")
    print(f"YTD comparison window: {range_prior}  vs.  {range_current}")

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

    # ------------------------------------------------------------------
    # Supplier-level rollup ("By Supplier" tab): same vs-goal math as brand
    # families, but at the supplier (Constellation, MolsonCoors, ...) level,
    # using each supplier's OWN Brewery/Kohler Goal % from the workbook's
    # grey header row and its own Case Equiv total from the YTD comparison.
    # ------------------------------------------------------------------
    supplier_rollup = []
    for supplier_name, metrics in supplier_ytd.items():
        goal = supplier_goals.get(supplier_name)
        if goal is None:
            continue
        ce_prior, ce_current, trend = metrics["ce_prior"], metrics["ce_current"], metrics["pct_change"]
        finish_2025 = goal.get("finish_2025_ce")
        brewery_pct = goal.get("goal2026_brewery_pct")
        kohler_pct = goal.get("goal2026_kohler_pct")

        if finish_2025 is not None:
            remainder_2025 = finish_2025 - ce_prior
            proj_finish = ce_current + remainder_2025 * (1 + (trend or 0))
        else:
            proj_finish = None

        supplier_rollup.append({
            "supplier": supplier_name,
            "brand_manager": goal.get("brand_manager"),
            "finish_2025_ce": finish_2025,
            "ce_prior": ce_prior,
            "ce_current": ce_current,
            "trend_pct": trend,
            "proj_finish_2026_ce": proj_finish,
            "goal_brewery_pct": brewery_pct,
            "goal_kohler_pct": kohler_pct,
            "gap_brewery": (trend - brewery_pct) if (trend is not None and brewery_pct is not None) else None,
            "gap_kohler": (trend - kohler_pct) if (trend is not None and kohler_pct is not None) else None,
        })

    # A handful of suppliers appear on brand rows (their "Supplier" column
    # value) but never got their own grey header/goal row built into the
    # workbook at all (e.g. "Food & Bev Enterprise LLC" for Denise Montes'
    # brands -- confirmed there's no such grey row anywhere in the workbook).
    # Rather than let their brands silently vanish from every supplier-level
    # view, synthesize a no-goal supplier entry by summing their own
    # with-goal children directly -- same "No Goal" treatment a goal-less
    # brand already gets, just at the supplier level.
    covered_suppliers = {r["supplier"] for r in supplier_rollup}
    orphan_suppliers = defaultdict(list)
    for r in with_goal:
        sup = r.get("supplier")
        if sup and sup not in covered_suppliers:
            orphan_suppliers[sup].append(r)

    for supplier_name, children in orphan_suppliers.items():
        ce_prior = sum(c["ce_prior"] for c in children if c["ce_prior"] is not None)
        ce_current = sum(c["ce_current"] for c in children if c["ce_current"] is not None)
        trend = (ce_current / ce_prior - 1) if ce_prior else None
        manager = brand_manager_by_supplier.get(supplier_name) or next(
            (c.get("brand_manager") for c in children if c.get("brand_manager")), None)
        supplier_rollup.append({
            "supplier": supplier_name,
            "brand_manager": manager,
            "finish_2025_ce": None,
            "ce_prior": ce_prior,
            "ce_current": ce_current,
            "trend_pct": trend,
            "proj_finish_2026_ce": None,
            "goal_brewery_pct": None,
            "goal_kohler_pct": None,
            "gap_brewery": None,
            "gap_kohler": None,
        })
    if orphan_suppliers:
        print(f"Synthesized {len(orphan_suppliers)} no-goal supplier rollup row(s) for suppliers with "
              f"brand-level goals but no supplier-level grey row in the workbook: {sorted(orphan_suppliers)}")

    supplier_rollup.sort(key=lambda r: (r["gap_brewery"] if r["gap_brewery"] is not None else 999))
    behind_brewery_supplier = sum(1 for r in supplier_rollup if r.get("gap_brewery") is not None and r["gap_brewery"] < 0)
    behind_kohler_supplier = sum(1 for r in supplier_rollup if r.get("gap_kohler") is not None and r["gap_kohler"] < 0)
    print(f"Supplier rollup: {len(supplier_rollup)} suppliers with both workbook goals and YTD data "
          f"(+ {len(orphan_suppliers)} synthesized no-goal supplier(s)).")

    # ------------------------------------------------------------------
    # "Supplier + Brand" combo tab: mirrors ytd_comparison.csv's own
    # Supplier -> Brand Family structure directly (every supplier RDE
    # tracks, every brand family under it -- not just the with-goal
    # subset above), attaching a workbook goal % wherever one exists and
    # leaving it blank otherwise. Per Gavin, 2026-08-04.
    # ------------------------------------------------------------------
    supplier_goals_lower = {k.lower(): v for k, v in supplier_goals.items()}
    raw_tree = build_raw_supplier_tree(CSV_YTD)

    def brand_goal_lookup(raw_name):
        canonical = NAME_ALIASES.get(raw_name.lower()) or brands_lower.get(raw_name.lower())
        return brands.get(canonical) if canonical else None

    combo_rollup = []
    for group in raw_tree:
        supplier_name = group["supplier"]

        if supplier_name == FOOD_BEV_SUPPLIER:
            # Per Gavin, 2026-08-04: leave Denise Montes' Food & Bev
            # Enterprise LLC brands exactly as already computed above (the
            # product-detail override split) -- don't rebuild them from
            # this raw CSV's generic, unsplit rollup.
            parent = next((r for r in supplier_rollup if r["supplier"] == FOOD_BEV_SUPPLIER), None)
            if parent is None:
                continue
            children_recs = [dict(r) for r in with_goal if r.get("supplier") == FOOD_BEV_SUPPLIER]
            combo_rollup.append({**dict(parent), "children": children_recs})
            continue

        goal = supplier_goals_lower.get(supplier_name.lower())
        ce_prior, ce_current = group["ce_prior"], group["ce_current"]
        trend = (ce_current / ce_prior - 1) if ce_prior else None
        finish_2025 = goal.get("finish_2025_ce") if goal else None
        brewery_pct = goal.get("goal2026_brewery_pct") if goal else None
        kohler_pct = goal.get("goal2026_kohler_pct") if goal else None
        manager = (goal.get("brand_manager") if goal else None) or brand_manager_by_supplier.get(supplier_name)
        proj_finish = (ce_current + (finish_2025 - ce_prior) * (1 + (trend or 0))) if finish_2025 is not None else None

        children_recs = []
        for child_name, c_prior, c_current in group["children"]:
            base = brand_goal_lookup(child_name) or {}
            c_trend = (c_current / c_prior - 1) if c_prior else None
            c_finish = base.get("finish_2025_ce")
            c_proj = (c_current + (c_finish - c_prior) * (1 + (c_trend or 0))) if c_finish is not None else None
            children_recs.append({
                "brand": child_name,
                "brand_manager": base.get("brand_manager") or manager,
                "finish_2025_ce": c_finish, "ce_prior": c_prior, "ce_current": c_current,
                "trend_pct": c_trend, "proj_finish_2026_ce": c_proj,
                "goal_brewery_pct": base.get("goal2026_brewery_pct"),
                "goal_kohler_pct": base.get("goal2026_kohler_pct"),
            })

        combo_rollup.append({
            "supplier": supplier_name, "brand_manager": manager,
            "finish_2025_ce": finish_2025, "ce_prior": ce_prior, "ce_current": ce_current,
            "trend_pct": trend, "proj_finish_2026_ce": proj_finish,
            "goal_brewery_pct": brewery_pct, "goal_kohler_pct": kohler_pct,
            "children": children_recs,
        })

    combo_rollup.sort(key=lambda r: -(r["ce_current"] or 0))
    total_combo_children = sum(len(g["children"]) for g in combo_rollup)
    print(f"Supplier + Brand combo rollup: {len(combo_rollup)} suppliers, {total_combo_children} brand families "
          f"(mirrors {CSV_YTD.name}'s own hierarchy; Food & Bev Enterprise LLC left as the existing override).")

    payload = {
        "generatedNote": "Built from 2026_planning_source.xlsx (goals) + ytd_comparison.csv (current trend). "
                          "See generate.py for methodology.",
        "meta": {
            "totalWithGoal": len(with_goal),
            "totalNoGoal": len(no_goal),
            "totalTerminated": len(terminated),
            "behindBrewery": behind_brewery,
            "behindKohler": behind_kohler,
            "totalSuppliers": len(supplier_rollup),
            "behindBrewerySupplier": behind_brewery_supplier,
            "behindKohlerSupplier": behind_kohler_supplier,
            "ytdRangePrior": range_prior,
            "ytdRangeCurrent": range_current,
        },
        "managers": managers,
        "suppliers": suppliers,
        "brands": with_goal,
        "newBrands": no_goal,
        "terminatedBrands": terminated,
        "supplierRollup": supplier_rollup,
        "comboRollup": combo_rollup,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {len(with_goal)} brands with goals + {len(no_goal)} brands with no 2025 goal/sales "
          f"+ {len(terminated)} terminated brands to {OUT}")
    print(f"Behind Brewery goal: {behind_brewery} / {len(with_goal)}   Behind Kohler goal: {behind_kohler} / {len(with_goal)}")
    print(f"Supplier rollup behind Brewery: {behind_brewery_supplier} / {len(supplier_rollup)}   "
          f"behind Kohler: {behind_kohler_supplier} / {len(supplier_rollup)}")


if __name__ == "__main__":
    main()
