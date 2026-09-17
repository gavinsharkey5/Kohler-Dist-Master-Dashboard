#!/usr/bin/env python3
"""
Rebuilds data.csv from the RDE "Red Bull Tracker" export -- a raw
transaction-level report (one row per account x SKU x order date), not
the pre-aggregated (Customer Name, Category, Sales Rep, Bought) shape
index.html actually reads.

Classification (per Kohler, 2026-09-11). These are the three things an
account can buy, and the only categories written to data.csv:
    Regular = Red Bull Regular
    Free    = Red Bull Sugar Free
    Flavor  = every other flavor edition
Explicit product lists below, not a keyword guess -- the script raises if
an unrecognized product shows up so a new flavor gets a deliberate
Regular/Free/Flavor call instead of a silent guess.

The program TIERS are NOT written here -- index.html derives them, because
each one requires a combination rather than a single purchase:
    Core  = Regular AND Free
    Core+ = Regular AND Free AND Flavor   (the "all 3" account)

BUYING PERIOD (Gavin, 2026-09-17): July 1 through September 30, 2026.
The export he pulls for it may start earlier (the 9/17 file ran from
June 1) -- June rows are dropped here, per Gavin the same day ("start in
july, ignore june"). The tracker used to count every order from the
export's first day (the RDE report is pulled "Apr 1 Start"), so an
account that bought once in April and never again still read as buying. Now only rows dated inside
PERIOD_START..PERIOD_END count -- the export can still be pulled from
April 1; everything outside the window is dropped here and reported on
the build. The window is written to period.json beside data.csv so the
page shows the same dates the data was cut to. Rows dated ahead of the
pull (scheduled load sheets) count only if they fall inside the window.

Usage:
    python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start.csv
    python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start.xlsx   (needs openpyxl)
    python3 generate.py EXPORT --start 2026-07-01 --end 2026-09-30   (override)
    (default window: PERIOD_START..PERIOD_END below)

Output: data.csv, tab-separated, one row per (Customer Name, Category,
Sales Rep) with at least one qualifying order -- matching the existing
file's shape exactly (index.html's ingestData() doesn't care about the
Bought column's value, just whether the row exists, so it's always 1);
and period.json, the window the rows were filtered to.

goals.csv is untouched -- this export carries no goal information.
"""
import csv
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).parent
OUT_CSV = HERE / "data.csv"
OUT_PERIOD = HERE / "period.json"

# The buying period. Inclusive on both ends.
PERIOD_START = date(2026, 7, 1)
PERIOD_END = date(2026, 9, 30)

# Product names WITHOUT the leading product number -- new flavors get new
# numbers, so matching on the name alone keeps a renumbered SKU from
# tripping the unknown-product check. Compared after normalize().
REGULAR_PRODUCTS = {
    'Red Bull 1/24/8.4 oz Can',
}
FREE_PRODUCTS = {
    # Kohler does not carry Sugar Free Watermelon -- do not add it back
    # without confirming that changed.
    'Red Bull Sugar Free 1/24/8.4 oz Can',
}
FLAVOR_PRODUCTS = {
    'Red Bull Orange Edition 1/24/8.4 oz Can',
    'Red Bull Sea Blue-Juneberry 1/24/8.4 oz Can',
    'Red Bull Blue Edition 1/24/8.4 oz Can',
    'Red Bull Coconut 1/24/8.4 oz Can',
    'Red Bull Yellow Edition 1/24/8.4 oz Can',
    'Red Bull White Peach Edition 1/24/8.4 oz Can',
    'Red Bull Red Edition 1/24/8.4 oz Can',
}

# Rendered in this order in data.csv and on the page.
CATEGORIES = ('Regular', 'Free', 'Flavor')


def normalize(product):
    """Strip the leading product number and every space, lowercase the rest.

    Drops spaces so the export's inconsistent sizing ("8.4 oz Can" vs
    "8.4oz Can") doesn't read as two different SKUs.
    """
    s = re.sub(r'^\s*\d+\s*', '', str(product or ''))
    return re.sub(r'\s+', '', s).lower()


LOOKUP = {}
for _cat, _names in (('Regular', REGULAR_PRODUCTS), ('Free', FREE_PRODUCTS),
                     ('Flavor', FLAVOR_PRODUCTS)):
    for _n in _names:
        LOOKUP[normalize(_n)] = _cat


def classify(product):
    return LOOKUP.get(normalize(product))


def date_column(header):
    """The export's order-date column. RDE names it differently per report
    ("Date", "Load Sheet Date", "Order Date" ...), so take the first header
    with "date" in it and refuse to build without one -- a silent no-filter
    would put April buyers back on the board."""
    for name in header:
        if name and 'date' in str(name).lower():
            return name
    raise SystemExit(
        f"No date column in the export (headers: {list(header)}) -- the buying "
        f"period filter needs one. Re-pull the RDE Red Bull Tracker with its date column."
    )


def parse_date(v):
    """9/17/2026, 09/17/2026 2:11 PM, 2026-09-17, or an Excel datetime."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v or '').strip().split()[0] if str(v or '').strip() else ''
    if not s:
        return None
    for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%m/%d/%y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    raise SystemExit(f"Unreadable date in the export: {v!r} -- fix the parsing, don't loosen the filter.")


def read_rows(src):
    """Yield (Sales Rep Assigned, Customer Name, Product Num & Name, order date)."""
    if src.suffix.lower() in ('.xlsx', '.xlsm'):
        import openpyxl
        wb = openpyxl.load_workbook(src, data_only=True)
        ws = wb[wb.sheetnames[0]]
        header = [c.value for c in ws[1]]
        idx = {name: i for i, name in enumerate(header)}
        dcol = date_column(header)
        for row in ws.iter_rows(min_row=2, values_only=True):
            yield (row[idx['Sales Rep Assigned']], row[idx['Customer Name']],
                   row[idx['Product Num & Name']], parse_date(row[idx[dcol]]))
    else:
        with open(src, newline='', encoding='utf-8-sig') as fh:
            reader = csv.DictReader(fh)
            dcol = date_column(reader.fieldnames or [])
            for row in reader:
                yield (row.get('Sales Rep Assigned'), row.get('Customer Name'),
                       row.get('Product Num & Name'), parse_date(row.get(dcol)))


def parse_args(argv):
    args = list(argv)
    start, end = PERIOD_START, PERIOD_END
    src = None
    while args:
        a = args.pop(0)
        if a == '--start':
            start = date.fromisoformat(args.pop(0))
        elif a == '--end':
            end = date.fromisoformat(args.pop(0))
        elif src is None:
            src = Path(a)
        else:
            raise SystemExit("Usage: python3 generate.py EXPORT.csv [--start YYYY-MM-DD] [--end YYYY-MM-DD]")
    if src is None or end < start:
        raise SystemExit("Usage: python3 generate.py EXPORT.csv [--start YYYY-MM-DD] [--end YYYY-MM-DD]")
    return src, start, end


def period_label(start, end):
    def d(x):
        return f"{x.strftime('%b')} {x.day}"
    return f"{d(start)} – {d(end)}, {end.year}" if start.year == end.year else \
        f"{d(start)}, {start.year} – {d(end)}, {end.year}"


def main():
    src, start, end = parse_args(sys.argv[1:])

    unknown = set()
    seen = {}   # (rep, customer) -> set of categories
    order = []
    total_rows = kept_rows = 0
    before = after = 0
    first_seen = last_seen = None
    for rep, cust, product, when in read_rows(src):
        rep = (rep or '').strip()
        cust = (cust or '').strip()
        if not rep or not cust:
            continue
        total_rows += 1
        if when is None:
            raise SystemExit(f"Row with no date for {rep} / {cust} -- every row needs one for the period filter.")
        first_seen = when if first_seen is None or when < first_seen else first_seen
        last_seen = when if last_seen is None or when > last_seen else last_seen
        if when < start:
            before += 1
            continue
        if when > end:
            after += 1
            continue
        kept_rows += 1
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
            f"Unclassified Red Bull product(s) -- add to REGULAR_PRODUCTS, FREE_PRODUCTS "
            f"or FLAVOR_PRODUCTS in this script after confirming with the user: "
            f"{sorted(unknown)}"
        )

    lines = ["Customer Name\tCategory\tSales Rep\tBought"]
    for (rep, cust) in order:
        for cat in CATEGORIES:
            if cat in seen[(rep, cust)]:
                lines.append(f"{cust}\t{cat}\t{rep}\t1")
    OUT_CSV.write_text("\n".join(lines) + "\n")
    OUT_PERIOD.write_text(json.dumps({
        "start": start.isoformat(), "end": end.isoformat(),
        "label": period_label(start, end),
        "export_rows": total_rows, "rows_in_period": kept_rows,
        "export_first_date": first_seen.isoformat() if first_seen else None,
        "export_last_date": last_seen.isoformat() if last_seen else None,
    }, indent=2) + "\n")

    counts = {c: sum(1 for k in order if c in seen[k]) for c in CATEGORIES}
    tally = ", ".join(f"{counts[c]} {c}" for c in CATEGORIES)
    print(f"Buying period {start} to {end}: export ran {first_seen} to {last_seen}, "
          f"{total_rows} rows; kept {kept_rows}, dropped {before} before the window "
          f"and {after} after it")
    print(f"Wrote {len(lines) - 1} rows across {len(order)} buying accounts ({tally}); period.json updated")


if __name__ == "__main__":
    main()
