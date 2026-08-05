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
                                          Product Num, Product Name,
                                          Customer Num, Customer Name,
                                          Date, Placement Count, Cases,
                                          windowed 5/1/2026-8/31/2026.
                                          Per Kohler's manager (2026-08-05):
                                          this dropped its Brand Family
                                          column in favor of one row per
                                          PRODUCT (e.g. "Coors Banquet
                                          1/12/24 oz Can" and "Coors
                                          Banquet 2/12/12 oz Can" are
                                          separate products, both under
                                          the same Banquet objective) --
                                          the 90-Day Non-Buy classification
                                          must key on Product Num, NOT
                                          Brand Family: a customer who
                                          already carries one Peroni SKU
                                          but adds a second, different
                                          Peroni SKU in August is a NEW
                                          placement for that SKU, where
                                          the old brand-level key would
                                          have wrongly excluded it as
                                          "already carrying Peroni".
                                          derive_brand_family() recovers
                                          the Peroni/Banquet grouping the
                                          dual-objective UI still needs
                                          (every product name is
                                          unambiguously one or the other)
                                          purely for display/bucketing --
                                          it plays no part in the
                                          new-vs-repeat classification
                                          itself.
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
                                          client-side. This is the FULL
                                          off-prem book (every county a rep
                                          covers) -- BBC Lytt's denominator,
                                          since Lytt isn't territory-
                                          restricted.
  sales_reps_customer_base_core.csv     RDE "Sales Reps: Customer Base
                                          Core Off Prem" export: Sales Rep
                                          Assigned, Customer Num, Customer
                                          Name, Shipping Address,
                                          Distribution Area, Area, County,
                                          City, Premise, Buyer Count,
                                          Cases. Per Kohler (2026-08-05),
                                          Corona Premier and Molson Coors
                                          Peroni/Banquet can ONLY be sold in
                                          this narrower "core" off-premise
                                          territory (Bergen/Morris/Passaic/
                                          Sussex, 503 accounts across 26
                                          reps as of this export) -- unlike
                                          on-prem, where the source file
                                          covers a broader area and needs an
                                          ALLOWED_TARGET_COUNTIES whitelist
                                          applied in code, this file is
                                          already pre-scoped to exactly the
                                          authorized-to-sell accounts, so
                                          every row in it is fair game for
                                          Target Accounts with no additional
                                          county filter. Used ONLY for
                                          Target Accounts (Corona Premier,
                                          Molson Coors Peroni/Banquet) --
                                          NOT for BBC Lytt's account-base
                                          denominator, which stays the
                                          full sales_reps_customer_base.csv
                                          (Lytt isn't territory-restricted).
                                          Wine & Spirits (Le Grand/Leyenda/
                                          Green River) is sold in every
                                          county per Kohler, so it gets no
                                          Target Accounts at all -- same
                                          precedent as on-prem's Yave/
                                          Leyenda.

Classification -- "90-Day Non-Buy" new placement: a customer's row on a
given date is a NEW placement only if they have NO purchase of the SAME
KEY before NEW_BUYER_WINDOW_START (i.e. in May/June/July) AND DO have a
purchase of it in August. A customer who bought before August and buys
again in August is a regular repeat placement and does NOT count. Same
date-based approach as on-prem's August build (see
on-prem/generate_2026-08.py) -- every transaction row is kept in the
output, with NEW_PLACEMENT set to 1 on exactly the customer's first
qualifying row in the window and 0 on every other row for that
customer+key, so a repeat purchase in August never double-counts.

The "KEY" is NOT the same granularity for both objectives:
  Molson Coors  PRODUCT NUM, independently per product -- per Kohler's
                manager (2026-08-05), a customer who already carries one
                Peroni SKU but adds a DIFFERENT Peroni SKU in August is a
                new placement for that SKU. Classifying by Brand Family
                (the original approach) wrongly treated "already carries
                any Peroni" as disqualifying, undercounting genuine new
                SKU placements. See molson_coors_off_peroni_banquet.csv's
                entry above and derive_brand_family().
  Wine & Spirits  Brand Family, independently per family (Le Grand Noir,
                Leyenda 1925, Bardstown Green River) -- confirmed with
                Gavin (2026-08-04) that all three sub-targets are
                required (not a combined pool of 5). Unchanged by the
                Molson Coors product-level fix above; revisit if Kohler's
                manager gives the same product-level correction for
                Wine & Spirits.

BBC Lytt (25% of Account Base) is a per-rep VARIABLE target, not a fixed
number: each rep's target is ceil(25% * their distinct account-base
size), computed client-side from sales_reps_customer_base.json (the
denominator) against bbc_lytt_distro's distinct Lytt-carrying accounts
per rep (the numerator) -- see buildPctOfBaseDataset() in index.html.

Target accounts (Corona Premier, Molson Coors Peroni/Banquet only, per
Kohler 2026-08-05 -- Wine & Spirits isn't territory-restricted so it gets
none): a per-rep "who to go after" list, answering which of a rep's OWN
core-territory accounts don't carry the brand yet. Same approach as
on-prem's build_targets() (see on-prem/generate_2026-08.py) minus the
county whitelist, since sales_reps_customer_base_core.csv is already
scoped to the core territory:
  1. sales_reps_customer_base_core.csv -- the rep's core account base,
     deduped by Customer Num.
  2. corona_premier_suitcase.csv / molson_coors_off_peroni_banquet.csv --
     ANY customer appearing here at all (placement flagged new or not)
     already has recent purchase history of that brand, so they're
     excluded -- a "hasn't bought it recently" list, not just "hasn't
     been flagged new this month".
Molson Coors' Peroni and Coors (Banquet) targets are computed
independently per brand, same as the placement classification.

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
CUSTOMER_BASE_CORE_CSV = HERE / "sales_reps_customer_base_core.csv"

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


def sum_cols(row, prefix):
    """RDE sometimes splits a metric into multiple date-windowed columns
    sharing one prefix (e.g. "Placement Count   5/1/2026 - 7/31/2026" AND
    "Placement Count   8/1/2026 - 8/31/2026" on the same export, each row
    populated in only one of the two since a row has a single Date) --
    sum whichever of them are present/non-blank rather than grabbing just
    the first match, so a value in the second column isn't silently
    dropped. Works the same when there's only one matching column."""
    total = 0.0
    for c, v in row.items():
        if c.startswith(prefix) and (v or "").strip():
            total += float(v)
    return total


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
    out = []
    for r in rows:
        out.append({
            "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
            "PRODUCT_NUM": r["Product Num"].strip(),
            "PRODUCT_NAME": r["Product Name"].strip(),
            "CUSTOMER_NUM": int(r["Customer Num"]),
            "CUSTOMER_NAME": r["Customer Name"].strip(),
            "DATE": NEW_BUYER_WINDOW_START.isoformat(),
            "PLACEMENT_COUNT": sum_cols(r, "Placement Count"),
            "CASES": sum_cols(r, "Cases"),
        })
    out.sort(key=lambda row: row["CUSTOMER_NAME"])
    return out


def derive_brand_family(product_name):
    """molson_coors_off_peroni_banquet.csv has no Brand Family column
    (see this script's docstring) -- every product is unambiguously
    either a Peroni SKU or a Coors Banquet SKU by name, so this recovers
    the Peroni/Banquet grouping the dual-objective UI needs for display
    and Target Accounts, without affecting the product-level 90-day-
    non-buy classification itself (that's keyed on Product Num, not this)."""
    return "Peroni" if "peroni" in product_name.lower() else "Coors"


def build_molson_coors():
    rows = load_csv(MOLSON_COORS_CSV)
    classified, new_count, total_pairs = classify_new_placements(rows, brand_key=lambda r: r["Product Num"])
    out = [{
        "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
        "CUSTOMER_NUM": int(r["Customer Num"]),
        "CUSTOMER_NAME": r["Customer Name"].strip(),
        "PRODUCT_NUM": r["Product Num"].strip(),
        "PRODUCT_NAME": r["Product Name"].strip(),
        "BRAND_FAMILY": derive_brand_family(r["Product Name"]),
        "DATE": d.isoformat(),
        "PLACEMENT_COUNT": sum_cols(r, "Placement Count"),
        "CASES": sum_cols(r, "Cases"),
        "NEW_PLACEMENT": is_new,
    } for d, r, is_new in classified]
    out.sort(key=lambda row: row["DATE"], reverse=True)
    return out, new_count, total_pairs


def build_wine_spirits():
    rows = load_csv(WINE_SPIRITS_CSV)
    classified, new_count, total_pairs = classify_new_placements(rows, brand_key=lambda r: r["Brand Family"])
    out = [{
        "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
        "PRODUCT_NAME": r["Product Name"].strip(),
        "PRODUCT_NUM": r["Product Num"].strip(),
        "CUSTOMER_NUM": int(r["Customer Num"]),
        "CUSTOMER_NAME": r["Customer Name"].strip(),
        "BRAND_FAMILY": r["Brand Family"].strip(),
        "DATE": d.isoformat(),
        "PLACEMENT_COUNT": sum_cols(r, "Placement Count"),
        "CASES": sum_cols(r, "Cases"),
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


def load_core_customer_base():
    """Dedupes to one entry per (rep, customer) -- the same account can
    have more than one row in the export in principle (multiple ship-to
    addresses), same as sales_reps_customer_base.csv. Already scoped to
    the off-premise core territory (see this script's docstring), so no
    county whitelist is applied here -- every row is fair game."""
    rows = load_csv(CUSTOMER_BASE_CORE_CSV)
    by_rep = {}
    seen = set()
    for r in rows:
        rep = (r.get("Sales Rep Assigned") or "").strip()
        cust_num = (r.get("Customer Num") or "").strip()
        if not rep or not cust_num:
            continue
        key = (rep, cust_num)
        if key in seen:
            continue
        seen.add(key)
        area = (r.get("Distribution Area") or "").strip()
        if area == "Sales":
            area = (r.get("County") or "").strip() or area
        by_rep.setdefault(rep, []).append({
            "customer_num": cust_num,
            "customer_name": (r.get("Customer Name") or "").strip(),
            "area": area,
        })
    return by_rep


def already_carrying(path, brand_filter=None, brand_of=None):
    """Customer Nums with ANY row in a brand's raw export -- recent
    purchase history, whether or not that row was flagged NEW_PLACEMENT.
    This stays BRAND-level even for Molson Coors (pass brand_of to derive
    a brand from a column other than "Brand Family", e.g. Product Name)
    -- Target Accounts is a "hasn't touched this brand at all" prospect
    list, a different question from the product-level 90-day-non-buy
    classification in build_molson_coors()/classify_new_placements()."""
    rows = load_csv(path)
    out = set()
    for r in rows:
        if brand_filter:
            brand = brand_of(r) if brand_of else r.get("Brand Family", "")
            if brand.strip().lower() != brand_filter.lower():
                continue
        out.add(r["Customer Num"].strip())
    return out


def build_targets(customer_base_by_rep, carrying):
    out = []
    for rep, accounts in customer_base_by_rep.items():
        for a in accounts:
            if a["customer_num"] in carrying:
                continue
            out.append({
                "SALES_REP_ASSIGNED": rep,
                "CUSTOMER_NUM": int(a["customer_num"]) if a["customer_num"].isdigit() else a["customer_num"],
                "CUSTOMER_NAME": a["customer_name"],
                "AREA": a["area"],
            })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["CUSTOMER_NAME"]))
    return out


def main():
    corona_premier_rows = build_corona_premier()
    molson_coors_rows, mc_new, mc_total = build_molson_coors()
    wine_spirits_rows, ws_new, ws_total = build_wine_spirits()
    bbc_lytt_rows = build_bbc_lytt_numerator()
    customer_base_rows = build_sales_reps_customer_base()

    core_by_rep = load_core_customer_base()
    targets_corona_premier = build_targets(core_by_rep, already_carrying(CORONA_PREMIER_CSV))

    molson_coors_brand_of = lambda r: derive_brand_family(r["Product Name"])
    targets_peroni = build_targets(core_by_rep, already_carrying(MOLSON_COORS_CSV, "Peroni", brand_of=molson_coors_brand_of))
    for row in targets_peroni:
        row["BRAND_FAMILY"] = "Peroni"
    targets_coors = build_targets(core_by_rep, already_carrying(MOLSON_COORS_CSV, "Coors", brand_of=molson_coors_brand_of))
    for row in targets_coors:
        row["BRAND_FAMILY"] = "Coors"
    targets_molson_coors = sorted(targets_peroni + targets_coors, key=lambda r: (r["SALES_REP_ASSIGNED"], r["BRAND_FAMILY"], r["CUSTOMER_NAME"]))

    month_dir = DATA_DIR / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    (month_dir / "mpo_corona_premier.json").write_text(json.dumps(corona_premier_rows, indent=2))
    (month_dir / "mpo_molson_coors.json").write_text(json.dumps(molson_coors_rows, indent=2))
    (month_dir / "mpo_wine_spirits.json").write_text(json.dumps(wine_spirits_rows, indent=2))
    (month_dir / "mpo_bbc_lytt_numerator.json").write_text(json.dumps(bbc_lytt_rows, indent=2))
    (month_dir / "mpo_sales_reps_customer_base.json").write_text(json.dumps(customer_base_rows, indent=2))
    (month_dir / "mpo_targets_corona_premier.json").write_text(json.dumps(targets_corona_premier, indent=2))
    (month_dir / "mpo_targets_molson_coors.json").write_text(json.dumps(targets_molson_coors, indent=2))

    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (month_dir / "sync_meta.json").write_text(json.dumps({"synced_at": synced_at}, indent=2))

    distinct_base = len({(r["SALES_REP_ASSIGNED"], r["CUSTOMER_NUM"]) for r in customer_base_rows})
    distinct_core = sum(len(v) for v in core_by_rep.values())
    print(f"Corona Premier: {len(corona_premier_rows)} rows written (no per-row Date in source; "
          f"placeholder DATE={NEW_BUYER_WINDOW_START.isoformat()} stamped on every row)")
    print(f"Molson Coors (Peroni+Coors/Banquet independently): {mc_new} new placements out of {mc_total} "
          f"customer+brand pairs ({len(molson_coors_rows)} transaction rows written)")
    print(f"Wine & Spirits (Le Grand/Leyenda/Green River independently): {ws_new} new placements out of "
          f"{ws_total} customer+brand pairs ({len(wine_spirits_rows)} transaction rows written)")
    print(f"BBC Lytt: {len(bbc_lytt_rows)} distro rows written")
    print(f"Sales Reps Customer Base: {len(customer_base_rows)} rows written ({distinct_base} distinct rep+customer pairs)")
    print(f"Off-Premise Core Territory: {distinct_core} distinct rep+customer pairs across {len(core_by_rep)} reps")
    print(f"Target accounts -- Corona Premier: {len(targets_corona_premier)} prospects across all reps (core territory only)")
    print(f"Target accounts -- Molson Coors: {len(targets_peroni)} Peroni + {len(targets_coors)} Coors/Banquet "
          f"prospects (core territory only)")
    print(f"sync_meta.json timestamped {synced_at} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
