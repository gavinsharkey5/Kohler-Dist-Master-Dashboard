#!/usr/bin/env python3
"""Builds the embedded JSON for index.html -- the REP-FACING inventory list.

One question: WHAT CAN I SELL RIGHT NOW? Everything here serves that. There is
deliberately no cost, no inventory value, no write-off exposure and no aging
analysis -- that is the executive view's job (../inventory-overview/).

Rebuilt 2026-10-14 on ONE report (Gavin's brief, inventory/design-refs/
CLAUDE_CODE_PROMPT.md) in place of the three shared exports in
../inventory-data/ that the 2026-08-28 build read. The report has exactly
these columns:

  Product Num Name     "<product number> <description>", e.g.
                       "2409 Corona Extra 1/24/12 oz Loose Btl". Split on the
                       first space into `num` and `name`.
  Supplier             the grouping the page uses (~124).
  Brand Family         Encompass's own family (~326) -- a real field now, no
                       longer derived from the product name.
  On Floor Inventory   units on the floor.
  Pre Sales            units sold but not yet shipped, as Encompass reports it.
  Allocated            units held back, as Encompass reports it.
  Available            THE sellable number, taken AS DELIVERED. Never
                       re-derived here: no arithmetic on the other columns is
                       guaranteed to reproduce it, and the number a rep sees
                       here has to match the number they see in Encompass.

Numbers: the four numeric columns are coerced to floats (blank = 0; a
leading '-' or accounting parentheses = negative; thousands commas dropped).
Status, on Available alone (the report carries no rate of sale):
  OUT   Available <= 0
  LOW   Available 1-24
  OK    Available 25+
The snapshot date is the report FILE's modified time (the report has no date
column); the page flags a snapshot older than 7 days.

Run: python3 generate.py [path/to/Inventory_Report.csv]
     default path ../inventory-data/Inventory_Report.csv
Then run ../accounts/generate.py so the Account page's product list picks up
the same snapshot (it reads this file's rep-data JSON).
"""
import csv
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REPORT = os.path.join(HERE, os.pardir, 'inventory-data', 'Inventory_Report.csv')
HTML = os.path.join(HERE, 'index.html')

LOW_MAX = 24   # Available 1..LOW_MAX = running low; above = in stock
STALE_DAYS = 7

COLS = ['Product Num Name', 'Supplier', 'Brand Family',
        'On Floor Inventory', 'Pre Sales', 'Allocated', 'Available']
NUM_COLS = COLS[3:]


def num(v):
    """Blank = 0. '-14', '(14)' and '-1.00' are all -14 / -1; commas dropped."""
    s = str(v or '').replace(',', '').replace('$', '').strip()
    if not s or s == '-':
        return 0.0
    neg = s.startswith('(') and s.endswith(')')
    if neg:
        s = s[1:-1]
    try:
        return -float(s) if neg else float(s)
    except ValueError:
        return 0.0


def split_name(label):
    """'2409 Corona Extra 1/24/12 oz Loose Btl' -> ('2409', 'Corona Extra ...').
    A label with no leading number keeps the whole text as the name."""
    m = re.match(r'^(\d+)\s+(.*)$', label.strip())
    if m:
        return m.group(1), m.group(2).strip()
    return '', label.strip()


def status_of(avail):
    if avail <= 0:
        return 'out'
    if avail <= LOW_MAX:
        return 'low'
    return 'ok'


def load(path):
    rows, skipped = [], 0
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        reader.fieldnames = [(h or '').strip() for h in reader.fieldnames or []]
        missing = [c for c in COLS if c not in reader.fieldnames]
        if missing:
            sys.exit(f'report is missing columns: {missing}\n   has: {reader.fieldnames}')
        for r in reader:
            label = (r.get('Product Num Name') or '').strip()
            if not label:
                skipped += 1
                continue
            pnum, pname = split_name(label)
            avail = num(r.get('Available'))
            rows.append({
                'num': pnum, 'name': pname, 'label': label,
                'supplier': (r.get('Supplier') or '').strip() or '(no supplier)',
                'family': (r.get('Brand Family') or '').strip() or '(no brand family)',
                'onFloor': num(r.get('On Floor Inventory')),
                'preSales': num(r.get('Pre Sales')),
                'allocated': num(r.get('Allocated')),
                'available': avail,
                'status': status_of(avail),
            })
    return rows, skipped


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_REPORT
    if not os.path.exists(path):
        sys.exit(f'report not found: {path}\n   usage: python3 generate.py [path/to/Inventory_Report.csv]')
    rows, skipped = load(path)
    if not rows:
        sys.exit('report has no product rows')

    # The report carries no date column: the file's modified time is the
    # snapshot date, and the page ages the snapshot from it.
    mtime = datetime.datetime.fromtimestamp(os.path.getmtime(path))
    as_of = mtime.date()

    counts = {k: sum(1 for p in rows if p['status'] == k) for k in ('out', 'low', 'ok')}
    suppliers = sorted({p['supplier'] for p in rows}, key=str.lower)
    families = sorted({p['family'] for p in rows}, key=str.lower)

    payload = {
        'generatedAt': datetime.datetime.now(datetime.timezone.utc)
                       .replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
        'asOf': as_of.isoformat(),
        'source': os.path.basename(path),
        'lowMax': LOW_MAX,
        'staleDays': STALE_DAYS,
        'summary': {
            'products': len(rows),
            'productsAvailable': counts['ok'] + counts['low'],
            'available': sum(p['available'] for p in rows if p['available'] > 0),
            'suppliers': len(suppliers),
            'families': len(families),
            'counts': counts,
        },
        'products': [{'num': p['num'], 'name': p['name'], 'supplier': p['supplier'],
                      'family': p['family'], 'available': p['available'],
                      'onFloor': p['onFloor'], 'preSales': p['preSales'],
                      'allocated': p['allocated'], 'status': p['status']}
                     for p in sorted(rows, key=lambda p: (-p['available'], p['name'].lower()))],
    }

    data_json = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
    html = open(HTML, encoding='utf-8').read()
    new_html, n = re.subn(
        r'(<script id="rep-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + data_json.replace('\\', '\\\\').replace('</', '<\\/') + m.group(2),
        html, count=1, flags=re.S)
    assert n == 1, 'rep-data script tag not found in index.html'
    open(HTML, 'w', encoding='utf-8').write(new_html)

    s = payload['summary']
    neg_floor = sum(1 for p in rows if p['onFloor'] < 0)
    neg_avail = sum(1 for p in rows if p['available'] < 0)
    no_num = sum(1 for p in rows if not p['num'])
    print(f"Report: {path}")
    print(f"  Snapshot date (file modified): {as_of:%m/%d/%Y}")
    print(f"  {s['products']:,} products · {s['suppliers']} suppliers · {s['families']} brand families"
          + (f" · {skipped} blank rows skipped" if skipped else ''))
    print(f"  Available: {s['available']:,.0f} units across {s['productsAvailable']:,} products")
    print(f"  Status: out {counts['out']:,} (Available <= 0) | low {counts['low']:,} (1-{LOW_MAX}) | "
          f"in stock {counts['ok']:,} ({LOW_MAX + 1}+)")
    print(f"  Negative Available: {neg_avail} · negative On Floor: {neg_floor} · rows with no product number: {no_num}")
    print(f"  Wrote {len(data_json):,} bytes of JSON into index.html")


if __name__ == '__main__':
    main()
