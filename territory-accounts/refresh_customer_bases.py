#!/usr/bin/env python3
"""Applies the four Core Market / Southern District account exports in this
folder to the three customer-base files they can refresh. See README.txt for
the full reasoning -- short version:

  MPOs/off-prem/sales_reps_customer_base_core.csv
      FULL REPLACE from core_market_off_prem.csv alone (Core Market only --
      Southern District accounts don't belong in an off-prem Core Market
      denominator).
  MPOs/on-prem/sales_reps_customer_base.csv
      SCOPED MERGE across all four files: a row is refreshed only if its
      Distribution Area is one of the nine areas these exports cover
      (Bergen/Passaic/Passaic-FF/Sussex/Morris 1/Morris 3/Essex/Hudson/
      Union); everything else (Morris 2, Middlesex, "Sales") is left as-is,
      since these exports say nothing about that territory.
  incentive-tracking/data/customer_base_full.csv
      Same scoped merge, plus the Draft Package flag is preserved by
      Customer Num lookup from the old file (blank for brand-new accounts).

A row whose key (rep, customer num) drops out of the matching fresh export
is a CLOSED account and is removed. This is the fix for "i still see the
accounts that are closed still populating" (Gavin, 2026-09-04).

Run: python3 refresh_customer_bases.py [--dry-run]
"""
import csv
import sys
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parent

CORE_MARKET_ON = HERE / "core_market_on_prem.csv"
CORE_MARKET_OFF = HERE / "core_market_off_prem.csv"
SOUTHERN_ON = HERE / "southern_district_on_prem.csv"
SOUTHERN_OFF = HERE / "southern_district_off_prem.csv"

OFF_PREM_CORE_CSV = REPO / "MPOs" / "off-prem" / "sales_reps_customer_base_core.csv"
ON_PREM_BASE_CSV = REPO / "MPOs" / "on-prem" / "sales_reps_customer_base.csv"
INCENTIVE_FULL_CSV = REPO / "incentive-tracking" / "data" / "customer_base_full.csv"

# The nine Distribution Area values the four exports jointly cover. Anything
# else in a target file (Morris 2, Middlesex, RDE's "Sales" placeholder) is
# outside what these exports claim to describe and is left untouched.
CORE_MARKET_AREAS = {"Bergen", "Passaic", "Passaic-FF", "Sussex", "Morris 1", "Morris 3"}
SOUTHERN_DISTRICT_AREAS = {"Essex", "Hudson", "Union"}
SCOPED_AREAS = CORE_MARKET_AREAS | SOUTHERN_DISTRICT_AREAS

# Some OLDER rows in the target files carry RDE's "Sales" placeholder instead
# of a real Distribution Area (no geographic detail on that export path --
# same fallback incentive-tracking/generate.py's _row_is_core_market() already
# uses). Those rows are still genuinely in scope if their County resolves
# unambiguously to one of the nine areas -- Morris is excluded from the
# fallback because "Sales"+County=Morris could be Morris 1, 2, or 3 and County
# alone can't tell them apart (same reasoning as generate.py's
# CORE_FALLBACK_COUNTIES, extended here to Southern District's three counties,
# which have no such sub-area split). Without this, a "Sales"-labeled closed
# account -- e.g. Chris Payton's Ani Service Station Inc, County=Bergen --
# would read as "out of scope" and never get pruned, silently undermining the
# whole point of this script.
SALES_FALLBACK_COUNTIES = {"Bergen", "Passaic", "Sussex", "Essex", "Hudson", "Union"}


def in_scope(row):
    area = row["Distribution Area"].strip()
    if area in SCOPED_AREAS:
        return True
    if area == "Sales":
        return row["County"].strip() in SALES_FALLBACK_COUNTIES
    return False

RAW_COLS = ["Sales Rep Assigned", "Customer Num", "Customer Name", "Shipping Address",
            "City", "County", "Distribution Area", "Buyer Count   2026", "Cases   2026"]

MIN_RAW_ROWS, MAX_RAW_ROWS = 100, 1200


def load_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return [r for r in csv.DictReader(f) if any((v or "").strip() for v in r.values())]


def load_raw(path, expected_area_set, expected_premise):
    rows = load_csv(path)
    if not MIN_RAW_ROWS <= len(rows) <= MAX_RAW_ROWS:
        raise SystemExit(f"{path.name}: {len(rows)} rows is outside the expected "
                         f"{MIN_RAW_ROWS}-{MAX_RAW_ROWS} band -- looks like a partial or wrong export.")
    got_cols = set(rows[0].keys())
    missing = set(RAW_COLS) - got_cols
    if missing:
        raise SystemExit(f"{path.name} is missing column(s) {missing} -- header shape changed, "
                         f"check before rerunning.")
    bad_areas = {r["Distribution Area"].strip() for r in rows} - expected_area_set
    if bad_areas:
        raise SystemExit(f"{path.name}: unexpected Distribution Area value(s) {bad_areas} -- "
                         f"expected only {sorted(expected_area_set)}.")
    seen = set()
    for r in rows:
        key = (r["Sales Rep Assigned"].strip(), r["Customer Num"].strip())
        if key in seen:
            raise SystemExit(f"{path.name}: duplicate rep+customer key {key} -- "
                             f"expected one row per account.")
        seen.add(key)
        r["Premise"] = expected_premise
    return rows


def build_fresh_index():
    """(rep, customer num) -> row dict, across all four territory exports."""
    fresh = {}
    loads = [
        (CORE_MARKET_ON, CORE_MARKET_AREAS, "On Premise"),
        (CORE_MARKET_OFF, CORE_MARKET_AREAS, "Off Premise"),
        (SOUTHERN_ON, SOUTHERN_DISTRICT_AREAS, "On Premise"),
        (SOUTHERN_OFF, SOUTHERN_DISTRICT_AREAS, "Off Premise"),
    ]
    for path, areas, premise in loads:
        for r in load_raw(path, areas, premise):
            key = (r["Sales Rep Assigned"].strip(), r["Customer Num"].strip())
            fresh[key] = r
    return fresh


def refresh_scoped(target_path, fresh, extra_cols_fn, dry_run):
    """Scoped merge: rows in SCOPED_AREAS are replaced/dropped per `fresh`;
    everything else passes through untouched. extra_cols_fn(fresh_row, old_row_or_None)
    returns the target-file-specific extra columns (e.g. Area dup, Draft Package)."""
    old_rows = load_csv(target_path)
    old_by_key = {(r["Sales Rep Assigned"].strip(), r["Customer Num"].strip()): r for r in old_rows}

    kept_out_of_scope = [r for r in old_rows if not in_scope(r)]
    old_in_scope_keys = {k for k, r in old_by_key.items() if in_scope(r)}
    fresh_in_scope_keys = set(fresh)  # every fresh row is already scope-validated by load_raw()

    closed = old_in_scope_keys - fresh_in_scope_keys
    opened = fresh_in_scope_keys - old_in_scope_keys
    kept = old_in_scope_keys & fresh_in_scope_keys

    new_rows = list(kept_out_of_scope)
    for key in sorted(fresh_in_scope_keys):
        r = fresh[key]
        old_row = old_by_key.get(key)
        row = {
            "Sales Rep Assigned": r["Sales Rep Assigned"],
            "Customer Num": r["Customer Num"],
            "Customer Name": r["Customer Name"],
            "Shipping Address": r["Shipping Address"],
            "Distribution Area": r["Distribution Area"],
            "County": r["County"],
            "City": r["City"],
            "Premise": r["Premise"],
            "Buyer Count   2026": r["Buyer Count   2026"],
            "Cases   2026": r["Cases   2026"],
        }
        row.update(extra_cols_fn(r, old_row))
        new_rows.append(row)

    def describe(key, source):
        rep, num = key
        return f"{rep} / {source[key]['Customer Name']}"

    print(f"\n{target_path.relative_to(REPO)}:")
    print(f"  {len(old_rows)} rows -> {len(new_rows)} rows "
          f"({len(kept_out_of_scope)} out-of-scope untouched, {len(kept)} refreshed, "
          f"{len(closed)} closed, {len(opened)} opened)")
    if closed:
        print(f"  CLOSED: {sorted(describe(k, old_by_key) for k in closed)}")
    if opened:
        print(f"  OPENED: {sorted(describe(k, fresh) for k in opened)}")

    if not dry_run:
        fieldnames = list(new_rows[0].keys()) if new_rows else []
        # Preserve the target's own column order rather than dict insertion order.
        fieldnames = list(old_rows[0].keys()) if old_rows else fieldnames
        with open(target_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for row in new_rows:
                w.writerow({k: row.get(k, "") for k in fieldnames})
    return new_rows


def main():
    dry_run = "--dry-run" in sys.argv
    fresh = build_fresh_index()
    print(f"Loaded {len(fresh)} accounts across the four territory exports "
          f"({sum(1 for r in fresh.values() if r['Distribution Area'].strip() in CORE_MARKET_AREAS)} "
          f"Core Market, {sum(1 for r in fresh.values() if r['Distribution Area'].strip() in SOUTHERN_DISTRICT_AREAS)} "
          f"Southern District)")

    # --- off-prem's Core Market denominator: full replace, Core Market only ---
    core_off_rows = load_raw(CORE_MARKET_OFF, CORE_MARKET_AREAS, "Off Premise")
    old_off = load_csv(OFF_PREM_CORE_CSV)
    old_off_keys = {(r["Sales Rep Assigned"].strip(), r["Customer Num"].strip()) for r in old_off}
    new_off_keys = {(r["Sales Rep Assigned"].strip(), r["Customer Num"].strip()) for r in core_off_rows}
    closed = old_off_keys - new_off_keys
    opened = new_off_keys - old_off_keys
    def describe_top(key, source):
        rep, num = key
        return f"{rep} / {source[key]['Customer Name']}"

    print(f"\n{OFF_PREM_CORE_CSV.relative_to(REPO)}:")
    print(f"  {len(old_off)} rows -> {len(core_off_rows)} rows ({len(closed)} closed, {len(opened)} opened)")
    if closed:
        old_by_key = {(r["Sales Rep Assigned"].strip(), r["Customer Num"].strip()): r for r in old_off}
        print(f"  CLOSED: {sorted(describe_top(k, old_by_key) for k in closed)}")
    if opened:
        new_by_key = {(r["Sales Rep Assigned"].strip(), r["Customer Num"].strip()): r for r in core_off_rows}
        print(f"  OPENED: {sorted(describe_top(k, new_by_key) for k in opened)}")
    if not dry_run:
        fieldnames = list(old_off[0].keys())
        with open(OFF_PREM_CORE_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for r in core_off_rows:
                row = {
                    "Sales Rep Assigned": r["Sales Rep Assigned"], "Customer Num": r["Customer Num"],
                    "Customer Name": r["Customer Name"], "Shipping Address": r["Shipping Address"],
                    "Distribution Area": r["Distribution Area"], "Area": r["Distribution Area"],
                    "County": r["County"], "City": r["City"], "Premise": r["Premise"],
                    "Buyer Count   2026": r["Buyer Count   2026"], "Cases   2026": r["Cases   2026"],
                }
                w.writerow({k: row.get(k, "") for k in fieldnames})

    # --- on-prem's exclusion base: scoped merge, no extra columns ---
    refresh_scoped(ON_PREM_BASE_CSV, fresh,
                   extra_cols_fn=lambda r, old: {"Area": r["Distribution Area"]},
                   dry_run=dry_run)

    # --- incentive-tracking's full base: scoped merge, Draft Package preserved by Customer Num ---
    old_incentive_rows = load_csv(INCENTIVE_FULL_CSV)
    draft_by_num = {r["Customer Num"].strip(): r["Draft Package"] for r in old_incentive_rows}
    blank_draft_count = [0]

    def incentive_extra(r, old_row):
        num = r["Customer Num"].strip()
        pkg = draft_by_num.get(num, "")
        if not pkg:
            blank_draft_count[0] += 1
        return {"Area": r["Distribution Area"], "Draft Package": pkg}

    refresh_scoped(INCENTIVE_FULL_CSV, fresh, extra_cols_fn=incentive_extra, dry_run=dry_run)
    print(f"  Draft Package: {blank_draft_count[0]} account(s) in the refreshed rows have no "
          f"known value (blank -- reads as not draft-capable, see README.txt)")

    if dry_run:
        print("\n--dry-run: nothing written")
    else:
        print("\nWrote all three files. Now rerun the current month's generators -- see README.txt.")


if __name__ == "__main__":
    main()
