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
                                          covers). Kept and still built
                                          (mpo_sales_reps_customer_base.json)
                                          as a general full-book reference,
                                          but as of 2026-08-07 no longer
                                          feeds any objective -- see
                                          sales_reps_customer_base_core.csv
                                          below.
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
                                          county filter. Originally used
                                          ONLY for Target Accounts (Corona
                                          Premier, Molson Coors Peroni/
                                          Banquet); as of 2026-08-07,
                                          confirmed with the user that Lytt
                                          is ALSO core-territory-only
                                          (correcting the earlier assumption
                                          that it was unrestricted), so this
                                          file now doubles as BBC Lytt's
                                          account-base denominator too --
                                          see build_sales_reps_customer_base_core().
                                          Wine & Spirits (Le Grand/Leyenda/
                                          Green River) is sold in every
                                          county per Kohler, so it gets no
                                          Target Accounts at all -- same
                                          precedent as on-prem's Yave/
                                          Leyenda.

Classification -- "90-Day Non-Buy" new placement: a customer+key is a NEW
placement only if they have NO row with a populated base-period column
value (i.e. in May/June/July) AND DO have a row with a populated
current-period column value (August). A customer who bought before
August and buys again in August is a regular repeat placement and does
NOT count -- see find_period_cols()/classify_dual_period(), ported
verbatim from on-prem's identical dual-period classifier (both Molson
Coors' and Wine & Spirits' exports carry the same base/current column
pair; the classifier itself doesn't need NEW_BUYER_WINDOW_START/END,
just which column is populated). Every transaction row is kept in the
output, tagged with which period it belongs to (PERIOD: "base" or
"current"), with NEW_PLACEMENT set to 1 on exactly the customer's first
qualifying current-period row and 0 on every other row for that
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
core-territory accounts don't carry the brand yet.

Corona Premier stays BRAND-level (build_targets()/already_carrying()),
same approach as on-prem's build_targets() (see
on-prem/generate_2026-08.py) minus the county whitelist, since
sales_reps_customer_base_core.csv is already scoped to the core
territory -- it isn't a per-SKU 90-day-non-buy incentive, just a plain
placement count, so there's no per-product distinction to make.

Molson Coors is PRODUCT-level (build_targets_by_product()), per Kohler's
manager (2026-08-05): since the 90-day-non-buy incentive is scored per
Product Num (see classify_dual_period() in build_molson_coors()), an
account that already carries 2 of 9 Peroni SKUs still has a real,
sellable gap in the other 7 -- excluding it from Target Accounts entirely
just because it "carries Peroni" (the old brand-level behavior) hid that
opportunity. build_targets_by_product() cross-references:
  1. sales_reps_customer_base_core.csv -- the rep's core account base,
     deduped by Customer Num.
  2. molson_coors_off_peroni_banquet.csv, scoped to ONE Product Num at a
     time (already_carrying_by_product()) -- ANY customer appearing here
     for that exact SKU (placement flagged new or not) already has recent
     purchase history of it, so they're excluded from that SKU's target
     list specifically (not the whole brand's).
One output row per (rep, account, product) the account hasn't carried --
an account can appear once per missing SKU, so this list runs
considerably larger than a brand-level one would (e.g. ~1,300+ rows
across ~9 Peroni + ~11 Banquet SKUs vs. ~200 at brand level). Peroni and
Coors (Banquet) are still computed independently, same as the placement
classification.

Rep-level drill-down display (index.html, mirrors on-prem's identical
cleanup, then extended for the per-product Target Accounts above): the
PERIOD field lets Molson Coors/Wine & Spirits show both a customer's most
recent base-period and current-month activity, tagged New Buyer / Repeat
Buyer (bought both) / Bought in Base Period (base only). Only New Buyers
-- and, for Molson Coors, Target Accounts -- show by default; Repeat
Buyer/Bought-in-Base-Period rows are tucked behind a collapsed "N
Existing Accounts" dropdown so a rep's long purchase history doesn't
bury what they need to act on this month. Corona Premier's Target
Accounts groups by county (collapsed at both the overall-list and
per-county level); Molson Coors' groups by PRODUCT instead (one
collapsed "N accounts don't carry it yet" block per SKU) since the point
is showing a rep exactly which product to go sell in, not where. See
groupTargetsByCounty()/groupTargetsByProduct()/targetsBlockHtml()/
lineTableNewAccounts()/existingAccountsBlockHtml() in index.html.
Molson Coors' line tables also show a Product column (lineTableNewAccounts
dedupes by customer+product, not customer alone) since its classification
is per-SKU -- an account can have independent new/existing statuses for
different Peroni or Banquet
SKUs in the same sub-table.

Run: python3 generate_2026-08.py
"""
import csv
import json
import re
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


def to_num(raw):
    raw = (raw or "").strip()
    if raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        return float(raw)


def find_period_cols(fieldnames, prefix):
    """Two columns share `prefix` (e.g. "Placement Count", "Cases") -- one
    embeds the 90-day non-buy base-period date range (5/1-7/31), the other
    the current distribution period (8/1-8/31). Picked apart by each
    column's embedded START date (not the exact header text), so a future
    export with a slightly different day-of-month still resolves correctly.
    Same helper as on-prem's (see on-prem/generate_2026-08.py). Returns
    (base_col, current_col)."""
    cols = [f for f in fieldnames if f.startswith(prefix)]

    def start_date(col):
        m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", col)
        if not m:
            raise SystemExit(f"Could not find a date in column header: {col!r}")
        month, day, year = m.groups()
        return datetime(int(year), int(month), int(day))

    cols.sort(key=start_date)
    if len(cols) != 2:
        raise SystemExit(f"Expected exactly 2 '{prefix}' columns (base period + current period), found: {cols}")
    return cols[0], cols[1]


def classify_dual_period(rows, brand_key, base_col, current_col):
    """Each row's Date already falls in exactly one of two known windows,
    and RDE puts that row's value in the matching column (base_col for
    5/1-7/31, current_col for 8/1-8/31), leaving the other blank -- so
    classification doesn't need NEW_BUYER_WINDOW_START/END, just which
    column is populated. `brand_key(row)` returns the per-row key (Product
    Num for Molson Coors, Brand Family for Wine & Spirits) that purchase
    history is scoped to -- a customer's "new" status is evaluated
    independently per distinct key. A customer+key is NEW if they have a
    populated current_col row and NO populated base_col row (regardless of
    the actual quantity -- even "0" counts as "a row exists in that
    window"). Same helper as on-prem's classify_dual_period(). Returns
    (output_rows, new_count, total_customer_key_pairs) where each output
    row is (row, period, is_new_row) and period is "base"/"current"/None.
    """
    def has_value(row, col):
        return (row.get(col) or "").strip() != ""

    by_cust_key = {}
    for r in rows:
        key = (r["Customer Num"], brand_key(r))
        state = by_cust_key.setdefault(key, {"base": False, "current": False})
        if has_value(r, base_col):
            state["base"] = True
        if has_value(r, current_col):
            state["current"] = True

    new_keys = {key for key, v in by_cust_key.items() if v["current"] and not v["base"]}

    rows_sorted = sorted(rows, key=lambda r: parse_date(r["Date"]))  # earliest first, first qualifying row wins
    flagged = set()
    out = []
    for r in rows_sorted:
        key = (r["Customer Num"], brand_key(r))
        if has_value(r, current_col):
            period = "current"
        elif has_value(r, base_col):
            period = "base"
        else:
            period = None
        is_new_row = 0
        if period == "current" and key in new_keys and key not in flagged:
            is_new_row = 1
            flagged.add(key)
        out.append((r, period, is_new_row))
    return out, len(new_keys), len(by_cust_key)


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
    base_col, current_col = find_period_cols(rows[0].keys(), "Placement Count")
    cases_base_col, cases_current_col = find_period_cols(rows[0].keys(), "Cases")
    classified, new_count, total_pairs = classify_dual_period(
        rows, brand_key=lambda r: r["Product Num"], base_col=base_col, current_col=current_col)
    out = []
    for r, period, is_new in classified:
        if not period:
            continue
        cases_col = cases_current_col if period == "current" else cases_base_col
        out.append({
            "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
            "CUSTOMER_NUM": int(r["Customer Num"]),
            "CUSTOMER_NAME": r["Customer Name"].strip(),
            "PRODUCT_NUM": r["Product Num"].strip(),
            "PRODUCT_NAME": r["Product Name"].strip(),
            "BRAND_FAMILY": derive_brand_family(r["Product Name"]),
            "DATE": parse_date(r["Date"]).isoformat(),
            "PERIOD": period,
            "PLACEMENT_COUNT": to_num(r[current_col] if period == "current" else r[base_col]),
            "CASES": to_num(r[cases_col]),
            "NEW_PLACEMENT": is_new,
        })
    out.sort(key=lambda row: row["DATE"], reverse=True)
    return out, new_count, total_pairs


def build_wine_spirits():
    rows = load_csv(WINE_SPIRITS_CSV)
    base_col, current_col = find_period_cols(rows[0].keys(), "Placement Count")
    cases_base_col, cases_current_col = find_period_cols(rows[0].keys(), "Cases")
    classified, new_count, total_pairs = classify_dual_period(
        rows, brand_key=lambda r: r["Brand Family"], base_col=base_col, current_col=current_col)
    out = []
    for r, period, is_new in classified:
        if not period:
            continue
        cases_col = cases_current_col if period == "current" else cases_base_col
        out.append({
            "SALES_REP_ASSIGNED": r["Sales Rep Assigned"].strip(),
            "PRODUCT_NAME": r["Product Name"].strip(),
            "PRODUCT_NUM": r["Product Num"].strip(),
            "CUSTOMER_NUM": int(r["Customer Num"]),
            "CUSTOMER_NAME": r["Customer Name"].strip(),
            "BRAND_FAMILY": r["Brand Family"].strip(),
            "DATE": parse_date(r["Date"]).isoformat(),
            "PERIOD": period,
            "PLACEMENT_COUNT": to_num(r[current_col] if period == "current" else r[base_col]),
            "CASES": to_num(r[cases_col]),
            "NEW_PLACEMENT": is_new,
        })
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


def build_sales_reps_customer_base_core():
    """BBC Lytt's account-base denominator (confirmed with the user,
    2026-08-07: Lytt can ONLY be sold in the core off-premise territory,
    correcting the earlier assumption that it was unrestricted) -- same
    row shape as build_sales_reps_customer_base() so buildPctOfBaseDataset()
    in index.html doesn't care which file it's reading, just pointed at
    CUSTOMER_BASE_CORE_CSV instead of the full book."""
    rows = load_csv(CUSTOMER_BASE_CORE_CSV)
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
            "COUNTY": (r.get("County") or "").strip(),
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
    classification in build_molson_coors()/classify_dual_period()."""
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


def list_products(rows, brand_of, brand_filter):
    """Distinct (Product Num, Product Name) pairs for a brand, in first-
    seen order (not alphabetical) -- one entry per SKU Target Accounts
    needs its own collapsible group for."""
    seen = set()
    out = []
    for r in rows:
        if brand_of(r).strip().lower() != brand_filter.lower():
            continue
        key = r["Product Num"].strip()
        if key in seen:
            continue
        seen.add(key)
        out.append((key, r["Product Name"].strip()))
    return out


def already_carrying_by_product(rows, product_num):
    """Customer Nums with ANY row for this EXACT product (any Date, whether
    or not that row was flagged NEW_PLACEMENT) -- recent purchase history
    scoped to one SKU, not the brand as a whole."""
    return {r["Customer Num"].strip() for r in rows if r["Product Num"].strip() == product_num}


def build_targets_by_product(customer_base_by_rep, rows, brand_filter, brand_of):
    """Per Kohler's manager (2026-08-05): since the 90-day-non-buy
    incentive is scored per PRODUCT (see classify_dual_period's Product
    Num key in build_molson_coors()), Target Accounts shows which SPECIFIC
    SKUs a rep's own accounts don't carry, not just whether they carry the
    brand overall -- an account with 2 of 9 Peroni SKUs already "carries
    Peroni" under the old brand-level logic, but is still a real target
    for the other 7. One row per (rep, account, product) where that
    account has never carried that exact product -- an account can appear
    once per SKU it's missing, so this list is considerably larger and
    more granular than build_targets()'s brand-level version. Replaces the
    old brand-level Molson Coors Target Accounts entirely (Corona Premier
    keeps build_targets() -- it isn't a per-SKU 90-day-non-buy incentive,
    just a plain placement count, so there's no per-product distinction to
    make there)."""
    out = []
    for product_num, product_name in list_products(rows, brand_of, brand_filter):
        carrying = already_carrying_by_product(rows, product_num)
        for rep, accounts in customer_base_by_rep.items():
            for a in accounts:
                if a["customer_num"] in carrying:
                    continue
                out.append({
                    "SALES_REP_ASSIGNED": rep,
                    "CUSTOMER_NUM": int(a["customer_num"]) if a["customer_num"].isdigit() else a["customer_num"],
                    "CUSTOMER_NAME": a["customer_name"],
                    "AREA": a["area"],
                    "PRODUCT_NUM": product_num,
                    "PRODUCT_NAME": product_name,
                    "BRAND_FAMILY": brand_filter,
                })
    out.sort(key=lambda row: (row["SALES_REP_ASSIGNED"], row["PRODUCT_NAME"], row["CUSTOMER_NAME"]))
    return out


def main():
    corona_premier_rows = build_corona_premier()
    molson_coors_rows, mc_new, mc_total = build_molson_coors()
    wine_spirits_rows, ws_new, ws_total = build_wine_spirits()
    bbc_lytt_rows = build_bbc_lytt_numerator()
    customer_base_rows = build_sales_reps_customer_base()
    customer_base_core_rows = build_sales_reps_customer_base_core()

    core_by_rep = load_core_customer_base()
    targets_corona_premier = build_targets(core_by_rep, already_carrying(CORONA_PREMIER_CSV))

    molson_coors_raw_rows = load_csv(MOLSON_COORS_CSV)
    molson_coors_brand_of = lambda r: derive_brand_family(r["Product Name"])
    targets_peroni = build_targets_by_product(core_by_rep, molson_coors_raw_rows, "Peroni", molson_coors_brand_of)
    targets_coors = build_targets_by_product(core_by_rep, molson_coors_raw_rows, "Coors", molson_coors_brand_of)
    targets_molson_coors = sorted(targets_peroni + targets_coors,
                                   key=lambda r: (r["SALES_REP_ASSIGNED"], r["BRAND_FAMILY"], r["PRODUCT_NAME"], r["CUSTOMER_NAME"]))

    month_dir = DATA_DIR / MONTH_KEY
    month_dir.mkdir(parents=True, exist_ok=True)
    (month_dir / "mpo_corona_premier.json").write_text(json.dumps(corona_premier_rows, indent=2))
    (month_dir / "mpo_molson_coors.json").write_text(json.dumps(molson_coors_rows, indent=2))
    (month_dir / "mpo_wine_spirits.json").write_text(json.dumps(wine_spirits_rows, indent=2))
    (month_dir / "mpo_bbc_lytt_numerator.json").write_text(json.dumps(bbc_lytt_rows, indent=2))
    (month_dir / "mpo_sales_reps_customer_base.json").write_text(json.dumps(customer_base_rows, indent=2))
    (month_dir / "mpo_sales_reps_customer_base_core.json").write_text(json.dumps(customer_base_core_rows, indent=2))
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
    print(f"Sales Reps Customer Base: {len(customer_base_rows)} rows written ({distinct_base} distinct rep+customer pairs) -- "
          f"kept as a general full-book reference; no longer feeds BBC Lytt")
    print(f"Sales Reps Customer Base (Core, BBC Lytt's account-base denominator): "
          f"{len(customer_base_core_rows)} rows written")
    print(f"Off-Premise Core Territory: {distinct_core} distinct rep+customer pairs across {len(core_by_rep)} reps")
    print(f"Target accounts -- Corona Premier: {len(targets_corona_premier)} prospects across all reps (core territory only)")
    peroni_products = len(list_products(molson_coors_raw_rows, molson_coors_brand_of, "Peroni"))
    coors_products = len(list_products(molson_coors_raw_rows, molson_coors_brand_of, "Coors"))
    peroni_distinct = len({(r["SALES_REP_ASSIGNED"], r["CUSTOMER_NUM"]) for r in targets_peroni})
    coors_distinct = len({(r["SALES_REP_ASSIGNED"], r["CUSTOMER_NUM"]) for r in targets_coors})
    print(f"Target accounts -- Molson Coors (per-product): {len(targets_peroni)} account+SKU rows across "
          f"{peroni_products} Peroni products ({peroni_distinct} distinct accounts missing at least one) + "
          f"{len(targets_coors)} account+SKU rows across {coors_products} Banquet products "
          f"({coors_distinct} distinct accounts missing at least one), core territory only")
    print(f"sync_meta.json timestamped {synced_at} in data/{MONTH_KEY}/")


if __name__ == "__main__":
    main()
