#!/usr/bin/env python3
"""
Rebuilds MPOs/off-prem/data/2026-08/*.json from the August RDE CSV exports.

August's off-premise MPO objectives are entirely different brands/rules
from July's (New Belgium/W&S 2XO/Sapporo Light/Famosa), so this is a
separate script from generate.py rather than another branch of it -- see
MONTH_KEY in each script and the MONTHS array in index.html for how a
month's script maps to its data/<MONTH_KEY>/ folder.

Inputs (keep these filenames when re-exporting from RDE):
  corona_premier_suitcase.csv           RDE "5 Corona Premier Suitcase
                                          Placements" export: Sales Rep
                                          Assigned, Product Num, Product
                                          Name, Customer Num, Customer
                                          Name, Placement Count, Cases --
                                          August-only window. This report
                                          has no per-row Date column at
                                          all (RDE doesn't track one for
                                          it), so a placeholder DATE
                                          (window start) is stamped on
                                          every row purely so the
                                          client-side placements builder
                                          -- which requires a date column
                                          to exist -- doesn't reject the
                                          file. It's cosmetic only; this
                                          objective is a plain summed
                                          count, not date-based.
  molson_coors_off_peroni_banquet.csv   RDE "Molson Coors OFF (4) New
                                          Peroni Placements (4) New
                                          Banquet Placements 90 Day Non
                                          Buy" export: Sales Rep Assigned,
                                          Brand Family, Customer Num,
                                          Customer Name, Date, Placement
                                          Count, Cases -- Brand Family is
                                          "Peroni" or "Coors" (Coors = the
                                          Banquet objective's raw brand
                                          label in RDE), windowed
                                          5/1/2026-8/31/2026.
  wine_spirits_legrand_leyenda_greenriver.csv
                                         RDE "5 New Placements -- (2) Le
                                          Grand Wines (2) Leyenda (1)
                                          Green River 50 MLs" export:
                                          Sales Rep Assigned, Product
                                          Name, Product Num, Brand Family,
                                          Customer Num, Customer Name,
                                          Date, Placement Count, Cases --
                                          Brand Family is "Le Grand Noir",
                                          "Leyenda 1925", or "Bardstown
                                          Green River", windowed
                                          5/1/2026-8/31/2026.
  bbc_lytt_distro.csv                   RDE "BBC -- Achieve distro Lytt
                                          25% of Account Base" export:
                                          Sales Rep Assigned, Product
                                          Name, Product Num, Brand Family,
                                          Customer ID, Customer Name,
                                          Buyer Count, Placement Count,
                                          Cases -- one row per rep/
                                          product/account carrying Lytt,
                                          no Date column (this is a
                                          distro snapshot, not a
                                          transaction log).
  sales_reps_customer_base.csv          RDE "Sales Reps: Customer Base
                                          Core Territory" export: Sales
                                          Rep Assigned, Customer Num,
                                          Customer Name, Shipping Address,
                                          City, Area, Cases -- one row per
                                          rep/account/shipping-address, so
                                          some accounts appear more than
                                          once (multiple ship-to
                                          addresses); the account-base
                                          size per rep is the count of
                                          DISTINCT Customer Num, computed
                                          client-side.

Classification -- "90-Day Non-Buy" new placement (Molson Coors Peroni/
Banquet independently, and each Wine & Spirits brand family
independently), per Kohler, 2026-08-04: a customer's row on a given date
is a NEW placement only if they have NO purchase of that same brand
before NEW_BUYER_WINDOW_START (i.e. in May/June/July) AND DO have a
purchase of it in August. A customer who bought before August and buys
again in August is a regular repeat placement and does NOT count. Same
date-based approach as on-prem's August build (see
on-prem/generate_2026-08.py) -- every transaction row is kept in the
output, with NEW_PLACEMENT set to 1 on exactly the customer's first
qualifying row in the window and 0 on every other row for that
customer+brand, so a repeat purchase in August never double-counts.
Molson Coors classifies Peroni and Coors (Banquet) independently; Wine &
Spirits classifies Le Grand Noir, Leyenda 1925, and Bardstown Green River
independently -- confirmed with Gavin (2026-08-04) that all three Wine &
Spirits sub-targets are required (not a combined pool of 5).

BBC Lytt (25% of Account Base) is a per-rep VARIABLE target, not a fixed
number: each rep's target is ceil(25% * their distinct account-base
size), computed client-side from sales_reps_customer_base.json (the
denominator) against bbc_lytt_distro's distinct Lytt-carrying accounts
per rep (the numerator) -- see buildPctOfBaseDataset() in index.html.

Run: python3 generate_2026-08.py
"""
import csv
import json
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
MONTH_KEY = "2026-08"

CORONA_PREMIER_CSV = HERE / "corona_premier_suitcase.csv"
MOLSON_COORS_CSV = HERE / "molson_coors_off_peroni_banquet.csv"
WINE_SPIRITS_CSV = HERE / "wine_spirits_legrand_leyenda_greenriver.csv"
BBC_LYTT_CSV = HERE / "bbc_lytt_distro.csv"
CUSTOMER_BASE_CSV = HERE / "sales_reps_customer_base.csv"

NEW_BUYER_WINDOW_START = date(2026, 8, 1)
NEW_BUYER_WINDOW_END = date(2026, 8, 31)


def parse_date(raw):
    return datetime.strptime(raw.strip(), "%m/%d/%Y").date()


def load_csv(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    # RDE exports consistently end with a trailing blank line -- drop any
    # row where every field is empty rather than special-casing it below.
    return [r for r in rows if any((v or "").strip() for v in r.values())]


def find_col(fieldnames, prefix):
    return next(c for c in fieldnames if c.startswith(prefix))


def classify_new_placements(rows, brand_key):
    """Shared 90-day-non-buy classifier. `brand_key(row)` returns the
    per-row key (e.g. Brand Family) that purchase history is scoped to --
    a customer's "new" status is evaluated independently per distinct key.
    Returns (output_rows, new_count, total_customer_brand_pairs).
    """
    parsed = [(parse_date(r["Date"]), r) for r in rows]

    by_cust_brand = {}
    for d, r in parsed:
        key = (r["Customer Num"], brand_key(r))
        by_cust_brand.setdefault(key, []).append(d)

    new_keys = set()
    for key, dates in by_cust_brand.items():
        bought_before = any(d < NEW_BUYER_WINDOW_START for d in dates)
        bought_in_window = any(NEW_BUYER_WINDOW_START <= d <= NEW_BUYER_WINDOW_END for d in dates)
        if not bought_before and bought_in_window:
            new_keys.add(key)

    parsed.sort(key=lambda item: item[0])  # earliest first, so the first qualifying row wins
    flagged = set()
    out = []
    for d, r in parsed:
        key = (r["Customer Num"], brand_key(r))
        is_new_row = 0
        if key in new_keys and key not in flagged and NEW_BUYER_WINDOW_START <= d <= NEW_BUYER_WINDOW_END:
            is_new_row = 1
            flagged.add(key)
        out.append((d, r, is_new_row))
    return out, len(new_keys), len(by_cust_brand)


def build_corona_premier():
    rows = load_csv(CORONA_PREMIER_CSV)
    if not rows:
        return []
    cases_col = find_col(rows[0].keys(), "Cases")
    placement_col = find_col(rows[0].keys(), "Placement Count")
    out = []
    for r in rows:
        out.append({
            "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
            "PRODUCT_NUM": r["Product Num"].strip(),
            "PRODUCT_NAME": r["Product Name"].strip(),
            "CUSTOMER_NUM": int(r["Customer Num"]),
            "CUSTOMER_NAME": r["Customer Name"].strip(),
            "DATE": NEW_BUYER_WINDOW_START.isoformat(),
            "PLACEMENT_COUNT": float(r[placement_col]),
            "CASES": float(r[cases_col]),
        })
    out.sort(key=lambda row: row["CUSTOMER_NAME"])
    return out


def build_molson_coors():
    rows = load_csv(MOLSON_COORS_CSV)
    cases_col = find_col(rows[0].keys(), "Cases")
    placement_col = find_col(rows[0].keys(), "Placement Count")
    classified, new_count, total_pairs = classify_new_placements(rows, brand_key=lambda r: r["Brand Family"])
    out = [{
        "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
        "CUSTOMER_NUM": int(r["Customer Num"]),
        "CUSTOMER_NAME": r["Customer Name"].strip(),
        "BRAND_FAMILY": r["Brand Family"].strip(),
        "DATE": d.isoformat(),
        "PLACEMENT_COUNT": float(r[placement_col]),
        "CASES": float(r[cases_col]),
        "NEW_PLACEMENT": is_new,
    } for d, r, is_new in classified]
    out.sort(key=lambda row: row["DATE"], reverse=True)
    return out, new_count, total_pairs


def build_wine_spirits():
    rows = load_csv(WINE_SPIRITS_CSV)
    cases_col = find_col(rows[0].keys(), "Cases")
    placement_col = find_col(rows[0].keys(), "Placement Count")
    classified, new_count, total_pairs = classify_new_placements(rows, brand_key=lambda r: r["Brand Family"])
    out = [{
        "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
        "PRODUCT_NAME": r["Product Name"].strip(),
        "PRODUCT_NUM": r["Product Num"].strip(),
        "CUSTOMER_NUM": int(r["Customer Num"]),
        "CUSTOMER_NAME": r["Customer Name"].strip(),
        "BRAND_FAMILY": r["Brand Family"].strip(),
        "DATE": d.isoformat(),
        "PLACEMENT_COUNT": float(r[placement_col]),
        "CASES": float(r[cases_col]),
        "NEW_PLACEMENT": is_new,
    } for d, r, is_new in classified]
    out.sort(key=lambda row: row["DATE"], reverse=True)
    return out, new_count, total_pairs


def build_bbc_lytt_numerator():
    rows = load_csv(BBC_LYTT_CSV)
    out = []
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        if not rep:
            continue
        out.append({
            "SALES_REP_ASSIGNED": rep,
            "PRODUCT_NAME": (r.get("Product Name") or "").strip(),
            "PRODUCT_NUM": (r.get("Product Num") or "").strip(),
            "BRAND_FAMILY": (r.get("Brand Family") or "").strip(),
            "CUSTOMER_NUM": int(r["Customer ID"]),
            "CUSTOMER_NAME": (r.get("Customer Name") or "").strip(),
        })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["CUSTOMER_NAME"]))
    return out


def build_sales_reps_customer_base():
    rows = load_csv(CUSTOMER_BASE_CSV)
    cases_col = find_col(rows[0].keys(), "Cases")
    out = []
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        if not rep:
            continue
        cases_raw = r.get(cases_col)
        out.append({
            "SALES_REP_ASSIGNED": rep,
            "CUSTOMER_NUM": int(r["Customer Num"]),
            "CUSTOMER_NAME": (r.get("Customer Name") or "").strip(),
            "SHIPPING_ADDRESS": (r.get("Shipping Address") or "").strip(),
            "CITY": (r.get("City") or "").strip(),
            "AREA": (r.get("Area") or "").strip(),
            "CASES": float(cases_raw) if cases_raw not in (None, "") else 0.0,
        })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["CUSTOMER_NAME"]))
    return out


def main():
    corona_premier_rows = build_corona_premier()
    molson_coors_rows, mc_new, mc_total = build_molson_coors()
    wine_spirits_rows, ws_new, ws_total = build_wine_spirits()
    bbc_lytt_rows = build_bbc_lytt_numerator()
    customer_base_rows = build_sales_reps_customer_base()

    month_dir = DATA_DIR / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    (month_dir / "mpo_corona_premier.json").write_text(json.dumps(corona_premier_rows, indent=2))
    (month_dir / "mpo_molson_coors.json").write_text(json.dumps(molson_coors_rows, indent=2))
    (month_dir / "mpo_wine_spirits.json").write_text(json.dumps(wine_spirits_rows, indent=2))
    (month_dir / "mpo_bbc_lytt_numerator.json").write_text(json.dumps(bbc_lytt_rows, indent=2))
    (month_dir / "mpo_sales_reps_customer_base.json").write_text(json.dumps(customer_base_rows, indent=2))

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (month_dir / "sync_meta.json").write_text(json.dumps({"synced_at": synced_at}, indent=2))

    distinct_base = len({(r["SALES_REP_ASSIGNED"], r["CUSTOMER_NUM"]) for r in customer_base_rows})
    print(f"Corona Premier: {len(corona_premier_rows)} rows written (no per-row Date in source; "
          f"placeholder DATE={NEW_BUYER_WINDOW_START.isoformat()} stamped on every row)")
    print(f"Molson Coors (Peroni+Coors/Banquet independently): {mc_new} new placements out of {mc_total} "
          f"customer+brand pairs ({len(molson_coors_rows)} transaction rows written)")
    print(f"Wine & Spirits (Le Grand/Leyenda/Green River independently): {ws_new} new placements out of "
          f"{ws_total} customer+brand pairs ({len(wine_spirits_rows)} transaction rows written)")
    print(f"BBC Lytt: {len(bbc_lytt_rows)} distro rows written")
    print(f"Sales Reps Customer Base: {len(customer_base_rows)} rows written ({distinct_base} distinct rep+customer pairs)")
    print(f"sync_meta.json timestamped {synced_at} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
