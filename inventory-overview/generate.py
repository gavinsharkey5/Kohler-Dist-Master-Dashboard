#!/usr/bin/env python3
"""Builds the embedded JSON for index.html -- the management Inventory
Overview -- from the three warehouse exports in this folder.

  inventory_status.csv    Encompass "Inventory Status": the CURRENT on-hand
                          position, one row per product, GROUPED BY SUPPLIER.
                          The supplier is a header row (its numeric columns are
                          all blank) followed by that supplier's product rows,
                          then a "Total" subtotal row. Product cells read
                          "<prod #> <product name>". This grouping is the ONLY
                          place supplier lives in any of the three files, so it
                          is what gives the other two a supplier dimension.
  inventory_received.csv  RDE "Inventory Received": one row per receipt LOT --
                          PO, receive date, units, shelf life, expiration date,
                          and On Hand Remaining (what's left of that lot).
                          Covers a rolling ~3-month window only (5/26-8/22 on
                          the first pull), NOT all history -- see WINDOW below.
  inventory_at_risk.csv   Encompass "Inventory at Risk (0-60 Days to Expire)":
                          a curated lot-level list with what the other two
                          lack -- sales velocity (Avg Sales/Day), days of
                          inventory (DOI), and a dollar Write-Off Risk. Its
                          Brand column is a logo <img> and Prod # an <a> tag,
                          so both need their HTML stripped.

Join key is the PRODUCT NUMBER, which all three carry (34/34 at-risk and
1,437/1,452 received products resolved against status on the first pull).

WINDOW -- the received export is a rolling window, and that shapes what can
honestly be said:
  * It is NOT the full lot history. 23 of the 38 at-risk lots were received
    before it starts, so its lots cannot be used to total up expiring stock.
    inventory_at_risk.csv is the authority for the 0-60 day exposure; the
    received lots only extend the picture BEYOND 60 days, for recently
    received stock, and the page labels that section accordingly.
  * Every row in it is dated in the PAST -- there are no future-dated inbound
    shipments in this export at all (statuses Confirmed/Received/Ordered/New
    all carry past receive dates). So "incoming inventory that could create an
    overstock" cannot be answered forward-looking from this data. The page
    answers the version that IS supported: stock RECEIVED RECENTLY that is
    already slow-moving or already near expiry.

Two catalog-wide movement signals are derived here, both proxies, both labeled
as such on the page -- real days-of-inventory needs sales velocity, and that
only exists for the 34 products in the at-risk export:
  SLOW      >= 100 units on hand AND either nothing received in the last 90
            days at all, or on hand >= 2x what was received. Stock that
            predates the receiving window and is still sitting.
  STOCKOUT  nothing available to sell now, but the product WAS received in the
            last 90 days -- it moved recently and has run dry.

Run: python3 generate.py   (prints a summary worth eyeballing before committing)
"""
import csv
import datetime
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
STATUS_CSV = os.path.join(HERE, 'inventory_status.csv')
RECEIVED_CSV = os.path.join(HERE, 'inventory_received.csv')
AT_RISK_CSV = os.path.join(HERE, 'inventory_at_risk.csv')
HTML = os.path.join(HERE, 'index.html')

# Columns that are all-zero in every export seen so far (the warehouse doesn't
# populate them). Kept out of the payload rather than shown as dead zeros.
DEAD_COLUMNS = ['Purchases', 'Invoices', 'Picked', 'In Production']

SLOW_MULTIPLE = 2.0      # on hand >= 2x trailing-90-day receipts...
SLOW_MIN_UNITS = 100     # ...with enough units on hand for it to matter.
                         # Nothing received in 90 days counts as slow outright --
                         # the first cut required recv90 > 0 and so skipped the
                         # 53 most stagnant products (14,655 units) entirely.
DEAD_VELOCITY = 0.2      # cases/day below which an at-risk lot won't clear


def strip_html(s):
    return re.sub(r'<[^>]+>', ' ', str(s or '')).replace('&amp;', '&').strip()


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
    """Derived, NOT a real field -- no export carries a brand column (the at-risk
    file's Brand is a logo image). The first word of the product name is the
    brand in this catalogue's naming ("Lagunitas Trooper 4/6/12 oz Can"), which
    holds well enough to group by; the page labels it as derived."""
    toks = str(name or '').split()
    return toks[0] if toks else '(unknown)'


def load_status():
    """Supplier header rows have every numeric column blank; "Total" rows are
    that supplier's subtotal. Both are structure, not products."""
    products, supplier, totals_seen = {}, None, 0
    with open(STATUS_CSV, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            label = (row.get('Product') or '').strip()
            if not label:
                continue
            if not (row.get('Inventory') or '').strip():
                supplier = label          # supplier group header
                continue
            if label == 'Total':
                totals_seen += 1          # subtotal row
                continue
            m = re.match(r'^(\d+)\s+(.*)$', label)
            if not m:
                continue
            pnum, pname = m.group(1), m.group(2).strip()
            products[pnum] = {
                'num': pnum,
                'name': pname,
                'supplier': supplier or '(unassigned)',
                'brand': brand_of(pname),
                'inventory': num(row.get('Inventory')),
                'available': num(row.get('Available')),
                'allocated': num(row.get('Allocated')),
                'unsellable': num(row.get('Unsellable')),
                'preSales': num(row.get('Pre-Sales')),
                'onFloor': num(row.get('On-Floor')),
                'loaded': num(row.get('Loaded')),
                'delivered': num(row.get('Delivered')),
                'pendingInvoices': num(row.get('Pending Invoices')),
            }
    return products, totals_seen


def load_received():
    lots = []
    with open(RECEIVED_CSV, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            lots.append({
                'num': (row.get('Product') or '').strip(),
                'name': (row.get('Product Name') or '').strip(),
                'po': (row.get('PO Num') or '').strip(),
                'location': (row.get('To Location') or '').strip(),
                'status': strip_html(row.get('Status')),
                'received': parse_date(row.get('Receive Date')),
                'units': num(row.get('Num Units')),
                'ordered': num(row.get('Ordered')),
                'shelfLife': num(row.get('Shelf Life')),
                'expires': parse_date(row.get('Expiration Date')),
                'onHand': num(row.get('On Hand Remaining')),
            })
    return lots


def load_at_risk():
    rows = []
    with open(AT_RISK_CSV, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            name = strip_html(row.get('Product Name'))
            if not name:
                continue
            raw = str(row.get('Prod #') or '')
            m = re.search(r'>(\d+)<', raw) or re.search(r'(\d+)', strip_html(raw))
            rows.append({
                'num': m.group(1) if m else '',
                'name': name,
                'received': parse_date(row.get('Receive Date')),
                'transId': strip_html(row.get('Purchase Trans ID')),
                'units': num(row.get('Inventory')),
                'expires': parse_date(row.get('Expiration Date')),
                'doi': num(row.get('DOI')),
                'velocity': num(row.get('Avg Sales / Day')),
                'daysLeft': int(num(row.get('Days till Expire'))),
                'pods': num(row.get('POD Actual')),
                'last7': num(row.get('Last 7 Days CEs')),
                'risk': num(row.get('Write-Off Risk')),
            })
    return rows


def bucket_for(days):
    if days < 0:
        return 'expired'
    if days <= 30:
        return 'd30'
    if days <= 60:
        return 'd60'
    if days <= 90:
        return 'd90'
    return 'd90plus'


def main():
    products, totals_seen = load_status()
    lots = load_received()
    at_risk = load_at_risk()

    # "Today" is the newest receive date in the export, not the clock -- the
    # page's day counts must stay fixed to the data, so re-rendering an old
    # snapshot later doesn't silently age every lot.
    dates = [l['received'] for l in lots if l['received']]
    today = max(dates) if dates else datetime.date.today()
    win_start = min(dates) if dates else today
    d90, d30 = today - datetime.timedelta(days=90), today - datetime.timedelta(days=30)

    for p in products.values():
        p.update(recv90=0.0, recv30=0.0, recvLots=0, lastRecv=None, flags=[],
                 riskUnits=0.0, riskDollars=0.0, daysLeft=None, velocity=None, doi=None)

    # Lots whose product number isn't in the status export are non-product items
    # -- pallets, bulkhead spacers, kegboard (15 distinct numbers on the first
    # pull). They're warehouse handling material, not sellable stock, so they
    # join nothing and are simply reported.
    unmatched_lots, unmatched_nums = 0, set()
    for l in lots:
        p = products.get(l['num'])
        if not p:
            unmatched_lots += 1
            unmatched_nums.add(l['num'])
            continue
        p['recvLots'] += 1
        if l['received'] and l['received'] >= d90:
            p['recv90'] += l['units']
        if l['received'] and l['received'] >= d30:
            p['recv30'] += l['units']
        if l['received'] and (p['lastRecv'] is None or l['received'] > p['lastRecv']):
            p['lastRecv'] = l['received']

    unmatched_risk = 0
    for r in at_risk:
        p = products.get(r['num'])
        if not p:
            unmatched_risk += 1
            continue
        p['riskUnits'] += r['units']
        p['riskDollars'] += r['risk']
        # A product can hold several at-risk lots; surface the most urgent one.
        if p['daysLeft'] is None or r['daysLeft'] < p['daysLeft']:
            p['daysLeft'] = r['daysLeft']
        p['velocity'] = r['velocity']
        p['doi'] = r['doi']

    # Expired-but-still-on-hand, from the received lots. Some expiration dates in
    # the source are plainly bad (2009, 2024) -- kept and shown, because a lot
    # carrying stock against a nonsense date is itself the thing to go fix.
    expired_lots = [l for l in lots if l['onHand'] > 0 and l['expires']
                    and (l['expires'] - today).days < 0]
    expired_by_product = {}
    for l in expired_lots:
        e = expired_by_product.setdefault(l['num'], {'units': 0.0, 'lots': 0, 'oldest': None})
        e['units'] += l['onHand']
        e['lots'] += 1
        if e['oldest'] is None or l['expires'] < e['oldest']:
            e['oldest'] = l['expires']

    # Flags -- what makes a product show up in "needs attention".
    for p in products.values():
        if p['riskDollars'] > 0:
            p['flags'].append('atrisk')
        if p['num'] in expired_by_product:
            p['flags'].append('expired')
            p['expiredUnits'] = expired_by_product[p['num']]['units']
        if p['unsellable'] > 0:
            p['flags'].append('unsellable')
        if p['inventory'] < 0 or p['available'] < 0:
            p['flags'].append('negative')
        if p['inventory'] >= SLOW_MIN_UNITS and (
                p['recv90'] == 0 or p['inventory'] >= SLOW_MULTIPLE * p['recv90']):
            p['flags'].append('slow')
        if p['available'] <= 0 and p['recv90'] > 0:
            p['flags'].append('stockout')

    # Expiration pipeline BEYOND the at-risk file's 60 days, from received lots.
    pipeline = {k: {'units': 0.0, 'lots': 0} for k in ['expired', 'd30', 'd60', 'd90', 'd90plus']}
    for l in lots:
        if l['onHand'] <= 0 or not l['expires']:
            continue
        b = pipeline[bucket_for((l['expires'] - today).days)]
        b['units'] += l['onHand']
        b['lots'] += 1

    # Weekly receipt volume (week starting Monday).
    weekly = {}
    for l in lots:
        if not l['received']:
            continue
        wk = l['received'] - datetime.timedelta(days=l['received'].weekday())
        w = weekly.setdefault(wk.isoformat(), {'week': wk.isoformat(), 'units': 0.0, 'lots': 0})
        w['units'] += l['units']
        w['lots'] += 1

    def agg(key):
        out = {}
        for p in products.values():
            g = out.setdefault(p[key], {'name': p[key], 'onHand': 0.0, 'available': 0.0,
                                        'riskDollars': 0.0, 'riskUnits': 0.0,
                                        'recv90': 0.0, 'products': 0, 'stocked': 0})
            g['onHand'] += p['inventory']
            g['available'] += p['available']
            g['riskDollars'] += p['riskDollars']
            g['riskUnits'] += p['riskUnits']
            g['recv90'] += p['recv90']
            g['products'] += 1
            g['stocked'] += 1 if p['inventory'] > 0 else 0
        return sorted(out.values(), key=lambda g: -g['onHand'])

    stocked = [p for p in products.values() if p['inventory'] > 0]
    # Rows with no stock, nothing available and no receipts in 90 days are dead
    # catalogue entries -- they can't inform any decision and they double the
    # payload, so they're left out of the product list but still counted in the
    # catalogue totals. A genuine stockout still shows: the 'stockout' flag needs
    # a receipt inside 90 days, which keeps that product in.
    live = [p for p in products.values()
            if p['inventory'] != 0 or p['available'] != 0 or p['recv90'] > 0 or p['flags']]
    payload = {
        'generatedAt': datetime.datetime.now(datetime.timezone.utc)
                       .replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
        'asOf': today.isoformat(),
        'receivedWindow': {'start': win_start.isoformat(), 'end': today.isoformat()},
        'locations': sorted({l['location'] for l in lots if l['location']}),
        'summary': {
            'onHand': sum(p['inventory'] for p in products.values()),
            'available': sum(p['available'] for p in products.values()),
            'allocated': sum(p['allocated'] for p in products.values()),
            'preSales': sum(p['preSales'] for p in products.values()),
            'unsellable': sum(p['unsellable'] for p in products.values()),
            'productsTotal': len(products),
            'productsStocked': len(stocked),
            'productsListed': len(live),
            'suppliers': len({p['supplier'] for p in products.values()}),
            'riskUnits': sum(r['units'] for r in at_risk),
            'riskDollars': sum(r['risk'] for r in at_risk),
            'riskLots': len(at_risk),
            'riskProducts': len({r['num'] for r in at_risk}),
            'expiredUnits': sum(l['onHand'] for l in expired_lots),
            'expiredLots': len(expired_lots),
            'recv30Units': sum(l['units'] for l in lots if l['received'] and l['received'] >= d30),
            'recv30Lots': sum(1 for l in lots if l['received'] and l['received'] >= d30),
            'recvWindowUnits': sum(l['units'] for l in lots),
            'recvWindowLots': len(lots),
            'flagCounts': {f: sum(1 for p in products.values() if f in p['flags'])
                           for f in ['atrisk', 'expired', 'unsellable', 'negative', 'slow', 'stockout']},
        },
        'pipeline': pipeline,
        'weekly': sorted(weekly.values(), key=lambda w: w['week']),
        'suppliers': agg('supplier'),
        'brands': agg('brand'),
        'atRisk': [dict(r, received=r['received'].isoformat() if r['received'] else None,
                        expires=r['expires'].isoformat() if r['expires'] else None,
                        supplier=products.get(r['num'], {}).get('supplier', '(unknown)'),
                        dead=r['velocity'] < DEAD_VELOCITY)
                   for r in sorted(at_risk, key=lambda r: -r['risk'])],
        'expired': [{'num': k, 'name': products.get(k, {}).get('name', ''),
                     'supplier': products.get(k, {}).get('supplier', '(unknown)'),
                     'units': v['units'], 'lots': v['lots'],
                     'oldest': v['oldest'].isoformat() if v['oldest'] else None}
                    for k, v in sorted(expired_by_product.items(), key=lambda kv: -kv[1]['units'])],
        'products': [{'num': p['num'], 'name': p['name'], 'supplier': p['supplier'],
                      'brand': p['brand'], 'onHand': p['inventory'], 'available': p['available'],
                      'allocated': p['allocated'], 'unsellable': p['unsellable'],
                      'preSales': p['preSales'], 'onFloor': p['onFloor'],
                      'recv30': p['recv30'], 'recv90': p['recv90'],
                      'lastRecv': p['lastRecv'].isoformat() if p['lastRecv'] else None,
                      'riskUnits': p['riskUnits'], 'riskDollars': p['riskDollars'],
                      'daysLeft': p['daysLeft'], 'velocity': p['velocity'], 'doi': p['doi'],
                      'expiredUnits': p.get('expiredUnits', 0.0), 'flags': p['flags']}
                     for p in sorted(live, key=lambda p: -p['inventory'])],
    }

    data_json = json.dumps(payload, separators=(',', ':'))
    html = open(HTML, encoding='utf-8').read()
    new_html, n = re.subn(
        r'(<script id="inv-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + data_json.replace('\\', '\\\\') + m.group(2),
        html, count=1, flags=re.S)
    assert n == 1, 'inv-data script tag not found in index.html'
    open(HTML, 'w', encoding='utf-8').write(new_html)

    s = payload['summary']
    print(f"As of {today:%m/%d/%Y} (newest receive date in the export)")
    print(f"  Products: {s['productsTotal']:,} across {s['suppliers']} suppliers; "
          f"{s['productsStocked']:,} hold stock ({totals_seen} subtotal rows skipped)")
    print(f"  On hand: {s['onHand']:,.0f} units | available {s['available']:,.0f} | "
          f"pre-sales {s['preSales']:,.0f} | allocated {s['allocated']:,.0f} | "
          f"unsellable {s['unsellable']:,.0f}")
    print(f"  At risk 0-60d: {s['riskLots']} lots / {s['riskProducts']} products, "
          f"{s['riskUnits']:,.0f} units, ${s['riskDollars']:,.0f} write-off risk")
    print(f"  Expired but on hand: {s['expiredLots']} lots, {s['expiredUnits']:,.0f} units")
    print(f"  Received: {s['recv30Lots']:,} lots / {s['recv30Units']:,.0f} units in last 30d; "
          f"window {win_start:%m/%d}-{today:%m/%d} = {s['recvWindowLots']:,} lots / "
          f"{s['recvWindowUnits']:,.0f} units")
    print(f"  Flags: " + ", ".join(f"{k} {v}" for k, v in s['flagCounts'].items()))
    print(f"  Products listed on the page: {s['productsListed']:,} "
          f"({s['productsTotal'] - s['productsListed']:,} dead catalogue rows omitted)")
    print(f"  Non-product receipt lots (pallets/dunnage, no status match): {unmatched_lots:,} "
          f"lots over {len(unmatched_nums)} item numbers; unmatched at-risk rows: {unmatched_risk}")
    print(f"  Wrote {len(data_json):,} bytes of JSON into index.html")


if __name__ == '__main__':
    main()
