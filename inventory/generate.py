#!/usr/bin/env python3
"""Builds the embedded JSON for index.html -- the REP-FACING inventory view.

One question: WHAT CAN I SELL RIGHT NOW? Everything here serves that. There is
deliberately no cost, no inventory value, no write-off exposure and no aging
analysis -- that is the executive view's job (../inventory-overview/), and a rep
standing in an account does not need it. Rebuilt 2026-08-28 per Gavin, who split
the two audiences apart: "Rep View = what can I sell? Executive View = what
inventory risk are we carrying?"

Reads THREE of the five shared exports in ../inventory-data/ (the exec view
reads all five):

  inventory_status.csv       The spine. One row per product, GROUPED BY SUPPLIER
                             -- a supplier header row (numeric columns blank),
                             its products, then a "Total" subtotal. Product cells
                             read "<prod #> <product name>".
                             `Available` is the sellable number and is taken AS
                             DELIVERED. It is not recomputed here, and should not
                             be: no arithmetic on the visible columns reproduces
                             it (Inventory - Allocated - Pre-Sales - Unsellable
                             matches only 3,292 of 4,240 rows), while it equals
                             On-Floor on 4,057 of them. Encompass is reporting
                             something closer to physical floor stock than to a
                             ledger subtraction, and a number a rep sees here has
                             to match the number they see in Encompass.
  inventory_projections.csv  Days of cover per product (real DOI, ~2,700
                             products), plus Ordered and Next Receive Date --
                             which is why the rep view does NOT need the 17,000-
                             row purchase_transactions.csv to answer "is more
                             coming?". Projections covers MORE products for that
                             question (490) than the purchase file does (346).
                             Supplier-grouped like the status export; a row whose
                             Product Num is not numeric is a group header.
                             ITS MONTH COLUMNS SHIFT EVERY PULL, so anything
                             reading them must match by pattern, not by name.
                             (This view only reads DOI/Ordered/Next Receive, so
                             it is immune -- noted because the exec view is not.)
  inventory_received.csv     Recent receipts -- "what just came in". A rolling
                             ~3-month window, which is all this view needs.

Stock status, on real days of cover rather than the receipt-pattern proxies the
first build used:
  OUT    nothing available to sell
  LOW    1-14 days of cover left
  OK     15-89 days
  HEAVY  90+ days -- plenty, sell it hard
A product with no projections row gets status UNKNOWN, not a guess.

Run: python3 generate.py
"""
import csv
import datetime
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, os.pardir, 'inventory-data')
STATUS_CSV = os.path.join(DATA, 'inventory_status.csv')
PROJECTIONS_CSV = os.path.join(DATA, 'inventory_projections.csv')
RECEIVED_CSV = os.path.join(DATA, 'inventory_received.csv')
HTML = os.path.join(HERE, 'index.html')

LOW_DOI = 14        # days of cover at or under which a product is "running low"
HEAVY_DOI = 90      # days of cover at or over which there is plenty to push
JUST_IN_DAYS = 14   # a receipt inside this window counts as "just arrived"

MONTH_RE = re.compile(r'^[A-Z][a-z]{2} \d{2}$')
# Pack config lives at the end of the product name ("4/6/12 oz Can"). Derived,
# like brand -- no export carries a package field. Parses on ~85% of stocked
# products; the rest simply show no pack and are excluded from that filter
# rather than bucketed into a wrong one.
PACK_RE = re.compile(r'(\d+(?:/[\d.]+)+\s*(?:oz|ml|l|gal)\b.*)$', re.I)


def num(v):
    """Encompass writes negatives in accounting form -- ' (14)' means -14."""
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


def parse_date(s):
    s = str(s or '').strip()
    if not s:
        return None
    try:
        return datetime.datetime.strptime(s, '%m/%d/%Y').date()
    except ValueError:
        return None


def brand_of(name):
    """Derived, not a real field -- no export carries a brand column. The first
    word of the product name is the brand in this catalogue's naming, which
    holds well enough to filter by; the page says it is derived."""
    toks = str(name or '').split()
    return toks[0] if toks else '(unknown)'


def pack_of(name):
    m = PACK_RE.search(str(name or '').strip())
    return m.group(1).strip() if m else ''


def load_status():
    products, supplier = {}, None
    with open(STATUS_CSV, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            label = (row.get('Product') or '').strip()
            if not label:
                continue
            if not (row.get('Inventory') or '').strip():
                supplier = label
                continue
            if label == 'Total':
                continue
            m = re.match(r'^(\d+)\s+(.*)$', label)
            if not m:
                continue
            pnum, pname = m.group(1), m.group(2).strip()
            products[pnum] = {
                'num': pnum, 'name': pname,
                'supplier': supplier or '(unassigned)',
                'brand': brand_of(pname), 'pack': pack_of(pname),
                'onHand': num(row.get('Inventory')),
                'available': num(row.get('Available')),
                'unsellable': num(row.get('Unsellable')),
                'doi': None, 'incoming': 0.0, 'nextArrival': None,
                'backordered': 0.0, 'lastRecv': None, 'recvUnits': 0.0,
            }
    return products


def load_projections(products):
    """DOI and inbound. Skips group headers (non-numeric Product Num).

    Inbound is deliberately NOT taken at face value. 211 of the 490 products
    carrying a Next Receive Date on the 8/28 pull are dated in the PAST -- some
    back to 2021 -- and between them they hold 139,772 of the 239,497 units the
    export calls "Ordered". They are stale purchase orders nobody closed out.
    Promising a rep 13,815 cases of Corona against a 2023 date is worse than
    telling them nothing, so only a future-dated arrival counts as inbound here;
    the stale ones are counted and reported, not silently dropped."""
    matched, stale_units, stale_products = 0, 0.0, 0
    with open(PROJECTIONS_CSV, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            pnum = str(row.get('Product Num') or '').strip()
            if not pnum.isdigit():
                continue
            p = products.get(pnum)
            if not p:
                continue
            matched += 1
            doi = str(row.get('Days of Inventory') or '').strip()
            p['doi'] = num(doi) if doi else None
            p['backordered'] = num(row.get('Backordered'))
            ordered = num(row.get('Ordered'))
            arrival = parse_date(row.get('Next Receive Date'))
            p['orderedRaw'] = ordered
            p['nextArrival'] = arrival
            p['incoming'] = ordered      # trimmed to future-dated only in main()
    return matched, stale_units, stale_products


def load_received(products):
    """Recent receipts. Lots whose product number is not in the status export are
    pallets, bulkhead spacers and kegboard -- warehouse handling material, not
    sellable stock -- so they join nothing and are counted separately."""
    lots, unmatched = [], 0
    with open(RECEIVED_CSV, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            pnum = (row.get('Product') or '').strip()
            when = parse_date(row.get('Receive Date'))
            units = num(row.get('Num Units'))
            lots.append({'num': pnum, 'when': when, 'units': units})
            p = products.get(pnum)
            if not p:
                unmatched += 1
                continue
            if when and (p['lastRecv'] is None or when > p['lastRecv']):
                p['lastRecv'] = when
    return lots, unmatched


def status_of(p):
    if p['available'] <= 0:
        return 'out'
    if p['doi'] is None:
        return 'unknown'
    if p['doi'] <= LOW_DOI:
        return 'low'
    if p['doi'] >= HEAVY_DOI:
        return 'heavy'
    return 'ok'


def main():
    products = load_status()
    proj_matched, _, _ = load_projections(products)
    lots, unmatched = load_received(products)

    # "Today" is the newest receive date in the data, not the clock, so day
    # counts stay pinned to the snapshot and an old pull doesn't silently age.
    dates = [l['when'] for l in lots if l['when']]
    today = max(dates) if dates else datetime.date.today()
    just_in = today - datetime.timedelta(days=JUST_IN_DAYS)

    for l in lots:
        p = products.get(l['num'])
        if p and l['when'] and l['when'] >= just_in:
            p['recvUnits'] += l['units']

    # Drop stale inbound (see load_projections). Counted for the page's notes so
    # the gap between "Ordered" and what a rep is actually promised is visible.
    stale_units, stale_products = 0.0, 0
    for p in products.values():
        if p['incoming'] > 0 and (p['nextArrival'] is None or p['nextArrival'] < today):
            stale_units += p['incoming']
            stale_products += 1
            p['incoming'] = 0.0
            p['staleArrival'] = p['nextArrival']
            p['nextArrival'] = None

    for p in products.values():
        p['status'] = status_of(p)

    # A rep only cares about what is sellable or about to be. Everything else --
    # dead catalogue rows with no stock, no availability and no recent receipt --
    # is dropped, which is what keeps this page small enough to open on a phone.
    live = [p for p in products.values()
            if p['available'] > 0 or p['onHand'] > 0
            or p['recvUnits'] > 0 or p['incoming'] > 0]

    counts = {k: sum(1 for p in live if p['status'] == k)
              for k in ['out', 'low', 'ok', 'heavy', 'unknown']}
    just_arrived = sorted([p for p in live if p['recvUnits'] > 0],
                          key=lambda p: (p['lastRecv'] or today, p['recvUnits']),
                          reverse=True)

    payload = {
        'generatedAt': datetime.datetime.now(datetime.timezone.utc)
                       .replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
        'asOf': today.isoformat(),
        'justInDays': JUST_IN_DAYS,
        'lowDoi': LOW_DOI, 'heavyDoi': HEAVY_DOI,
        'summary': {
            'available': sum(p['available'] for p in live),
            'productsAvailable': sum(1 for p in live if p['available'] > 0),
            'productsTotal': len(products),
            'suppliers': len({p['supplier'] for p in live}),
            'counts': counts,
            'justInUnits': sum(p['recvUnits'] for p in live),
            'justInProducts': len(just_arrived),
            'incomingUnits': sum(p['incoming'] for p in live),
            'incomingProducts': sum(1 for p in live if p['incoming'] > 0),
            'backordered': sum(p['backordered'] for p in live),
            'staleOrderUnits': stale_units,
            'staleOrderProducts': stale_products,
        },
        'justArrived': [{'num': p['num'], 'name': p['name'], 'supplier': p['supplier'],
                         'units': p['recvUnits'], 'available': p['available'],
                         'when': p['lastRecv'].isoformat() if p['lastRecv'] else None}
                        for p in just_arrived[:60]],
        'products': [{'num': p['num'], 'name': p['name'], 'supplier': p['supplier'],
                      'brand': p['brand'], 'pack': p['pack'],
                      'available': p['available'], 'onHand': p['onHand'],
                      'doi': p['doi'], 'status': p['status'],
                      'incoming': p['incoming'],
                      'nextArrival': p['nextArrival'].isoformat() if p['nextArrival'] else None,
                      'backordered': p['backordered'],
                      'recvUnits': p['recvUnits'],
                      'lastRecv': p['lastRecv'].isoformat() if p['lastRecv'] else None}
                     for p in sorted(live, key=lambda p: -p['available'])],
    }

    data_json = json.dumps(payload, separators=(',', ':'))
    html = open(HTML, encoding='utf-8').read()
    new_html, n = re.subn(
        r'(<script id="rep-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + data_json.replace('\\', '\\\\') + m.group(2),
        html, count=1, flags=re.S)
    assert n == 1, 'rep-data script tag not found in index.html'
    open(HTML, 'w', encoding='utf-8').write(new_html)

    s = payload['summary']
    print(f"As of {today:%m/%d/%Y} (newest receive date in the export)")
    print(f"  Sellable: {s['available']:,.0f} units across {s['productsAvailable']:,} products "
          f"({s['suppliers']} suppliers)")
    print(f"  Status: out {counts['out']:,} | low {counts['low']:,} | ok {counts['ok']:,} | "
          f"heavy {counts['heavy']:,} | no rate {counts['unknown']:,}")
    print(f"  Just arrived (last {JUST_IN_DAYS}d): {s['justInUnits']:,.0f} units over "
          f"{s['justInProducts']:,} products")
    print(f"  Inbound: {s['incomingUnits']:,.0f} units over {s['incomingProducts']:,} products; "
          f"backordered {s['backordered']:,.0f}")
    print(f"  Stale orders IGNORED (Next Receive Date in the past): "
          f"{s['staleOrderUnits']:,.0f} units over {s['staleOrderProducts']:,} products")
    print(f"  Days of cover matched on {proj_matched:,} products from the projections export")
    print(f"  Listed: {len(payload['products']):,} of {s['productsTotal']:,} catalogue rows "
          f"({s['productsTotal'] - len(payload['products']):,} dead rows omitted)")
    print(f"  Receipt lots joining no product (pallets/dunnage): {unmatched:,}")
    print(f"  Wrote {len(data_json):,} bytes of JSON into index.html")


if __name__ == '__main__':
    main()
