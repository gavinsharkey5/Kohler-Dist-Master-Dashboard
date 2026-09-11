#!/usr/bin/env python3
"""
Rebuilds data.csv from the RDE "Red Bull Tracker" export -- a raw
transaction-level report (one row per account x SKU x order date), not
the pre-aggregated (Customer Name, Category, Sales Rep, Bought) shape
index.html actually reads.

Classification (per Kohler, 2026-09-11):
    Core   = Red Bull Regular
    Free   = Red Bull Sugar Free (incl. Sugar Free Watermelon)
    Core+  = every other flavor edition
Explicit product lists below, not a keyword guess -- the script raises if
an unrecognized product shows up so a new flavor gets a deliberate
Core/Free/Core+ call instead of a silent guess.

Usage:
    python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start.csv
    python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start.xlsx   (needs openpyxl)

Output: data.csv, tab-separated, one row per (Customer Name, Category,
Sales Rep) with at least one qualifying order -- matching the existing
file's shape exactly (index.html's ingestData() doesn't care about the
Bought column's value, just whether the row exists, so it's always 1).

goals.csv is untouched -- this export carries no goal information.
"""
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
OUT_CSV = HERE / "data.csv"

# Product names WITHOUT the leading product number -- new flavors get new
# numbers, so matching on the name alone keeps a renumbered SKU from
# tripping the unknown-product check. Compared after normalize().
CORE_PRODUCTS = {
    'Red Bull 1/24/8.4 oz Can',
}
FREE_PRODUCTS = {
    'Red Bull Sugar Free 1/24/8.4 oz Can',
    'Red Bull Sugar Free Watermelon 1/24/8.4 oz Can',
}
COREPLUS_PRODUCTS = {
    'Red Bull Orange Edition 1/24/8.4 oz Can',
    'Red Bull Sea Blue-Juneberry 1/24/8.4 oz Can',
    'Red Bull Blue Edition 1/24/8.4 oz Can',
    'Red Bull Coconut 1/24/8.4 oz Can',
    'Red Bull Yellow Edition 1/24/8.4 oz Can',
    'Red Bull White Peach Edition 1/24/8.4 oz Can',
    'Red Bull Red Edition 1/24/8.4 oz Can',
}

# Rendered in this order in data.csv and on the page.
CATEGORIES = ('Core', 'Free', 'Core+')


def normalize(product):
    """Strip the leading product number and every space, lowercase the rest.

    Drops spaces so the export's inconsistent sizing ("8.4 oz Can" vs
    "8.4oz Can") doesn't read as two different SKUs.
    """
    s = re.sub(r'^\s*\d+\s*', '', str(product or ''))
    return re.sub(r'\s+', '', s).lower()


LOOKUP = {}
for _cat, _names in (('Core', CORE_PRODUCTS), ('Free', FREE_PRODUCTS),
                     ('Core+', COREPLUS_PRODUCTS)):
    for _n in _names:
        LOOKUP[normalize(_n)] = _cat


def classify(product):
    return LOOKUP.get(normalize(product))


def read_rows(src):
    """Yield (Sales Rep Assigned, Customer Name, Product Num & Name) tuples."""
    if src.suffix.lower() in ('.xlsx', '.xlsm'):
        import openpyxl
        wb = openpyxl.load_workbook(src, data_only=True)
        ws = wb[wb.sheetnames[0]]
        header = [c.value for c in ws[1]]
        idx = {name: i for i, name in enumerate(header)}
        for row in ws.iter_rows(min_row=2, values_only=True):
            yield (row[idx['Sales Rep Assigned']], row[idx['Customer Name']],
                   row[idx['Product Num & Name']])
    else:
        with open(src, newline='', encoding='utf-8-sig') as fh:
            for row in csv.DictReader(fh):
                yield (row.get('Sales Rep Assigned'), row.get('Customer Name'),
                       row.get('Product Num & Name'))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start.csv")
    src = Path(sys.argv[1])

    unknown = set()
    seen = {}   # (rep, customer) -> set of categories
    order = []
    for rep, cust, product in read_rows(src):
        rep = (rep or '').strip()
        cust = (cust or '').strip()
        if not rep or not cust:
            continue
        cat = classify(product)
        if cat is None:
            unknown.add(str(product))
            continue
        key = (rep, cust)
        if key not in seen:
            seen[key] = set()
            order.append(key)
        seen[key].add(cat)

    if unknown:
        raise SystemExit(
            f"Unclassified Red Bull product(s) -- add to CORE_PRODUCTS, FREE_PRODUCTS "
            f"or COREPLUS_PRODUCTS in this script after confirming with the user: "
            f"{sorted(unknown)}"
        )

    lines = ["Customer Name\tCategory\tSales Rep\tBought"]
    for (rep, cust) in order:
        for cat in CATEGORIES:
            if cat in seen[(rep, cust)]:
                lines.append(f"{cust}\t{cat}\t{rep}\t1")
    OUT_CSV.write_text("\n".join(lines) + "\n")

    counts = {c: sum(1 for k in order if c in seen[k]) for c in CATEGORIES}
    tally = ", ".join(f"{counts[c]} {c}" for c in CATEGORIES)
    print(f"Wrote {len(lines) - 1} rows across {len(order)} buying accounts ({tally})")


if __name__ == "__main__":
    main()
