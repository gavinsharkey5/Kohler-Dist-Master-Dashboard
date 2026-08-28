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
                          a curated lot-level list carrying sales velocity
                          (Avg Sales/Day), DOI and a dollar Write-Off Risk for
                          the ~34 lots inside 60 days. Its Brand column is a
                          logo <img> and Prod # an <a> tag, so both need their
                          HTML stripped.
  inventory_projections.csv
                          Encompass "Inventory Projections" -- added 2026-08-28,
                          and the file that finally makes this page honest.
                          Carries CATALOG-WIDE Days of Inventory, 10/28-day
                          trend, monthly depletions, backorders, units on order
                          and next receive date for ~2,700 products. Same
                          supplier-grouped shape as the status export (rows
                          whose Product Num is not numeric are group headers).
                          Its MONTH COLUMNS SHIFT EVERY PULL (Apr-Jul on the
                          8/24 file, May-Aug on the 8/28 one), so they are
                          detected by pattern, never by hardcoded name.
  purchase_transactions.csv
                          Encompass "Purchase Transactions" -- added 2026-08-28.
                          One row per purchase lot with Laid-in Cost and FOB
                          (inventory VALUATION) and, crucially, FUTURE-dated
                          rows in status New/Ordered: the INBOUND PIPELINE.

Join key is the PRODUCT NUMBER, which all three carry (34/34 at-risk and
1,437/1,452 received products resolved against status on the first pull).

WINDOW -- the received export is a rolling window, and that shapes what can
honestly be said:
  * It is NOT the full lot history. 23 of the 38 at-risk lots were received
    before it starts, so its lots cannot be used to total up expiring stock.
    inventory_at_risk.csv is the authority for the 0-60 day exposure; the
    received lots only extend the picture BEYOND 60 days, for recently
    received stock, and the page labels that section accordingly.
  * Every row in it is dated in the PAST. The forward view now comes from
    purchase_transactions.csv instead, which does carry future-dated lots.

MOVEMENT -- the two proxies this page shipped with on 2026-08-24 are GONE.
They existed only because sales velocity was available for 34 products; the
projections export carries real Days of Inventory for ~2,700, so the flags are
now scored on the real number:
  OVERSTOCK  DOI >= OVERSTOCK_DOI (90) -- three months or more of stock on the
             floor at the product's own rate of sale.
  SLOW       DOI >= SLOW_DOI (180). A subset of overstock, called out because
             half a year of cover is a different conversation.
  LOW        0 < DOI <= LOW_DOI (14) with stock still available -- about to run
             out rather than already out.
  STOCKOUT   nothing available AND the product is either backordered or still
             selling (a real stockout, not a discontinued line).
A product with no projections row gets NO movement flag rather than a guessed
one -- absence of a rate is not evidence of a slow rate.

Run: python3 generate.py   (prints a summary worth eyeballing before committing)
"""
import csv
import datetime
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
# One folder of source exports, shared with ../inventory/ (the rep view), so the
# same export is never pulled twice. See ../inventory-data/README.txt.
DATA = os.path.join(HERE, os.pardir, 'inventory-data')
STATUS_CSV = os.path.join(DATA, 'inventory_status.csv')
RECEIVED_CSV = os.path.join(DATA, 'inventory_received.csv')
AT_RISK_CSV = os.path.join(DATA, 'inventory_at_risk.csv')
PROJECTIONS_CSV = os.path.join(DATA, 'inventory_projections.csv')
PURCHASES_CSV = os.path.join(DATA, 'purchase_transactions.csv')
HTML = os.path.join(HERE, 'index.html')

# Columns that are all-zero in every export seen so far (the warehouse doesn't
# populate them). Kept out of the payload rather than shown as dead zeros.
DEAD_COLUMNS = ['Purchases', 'Invoices', 'Picked', 'In Production']

# Movement thresholds, all scored on the projections export's real Days of
# Inventory (see the docstring). Days, not multiples of receipts.
OVERSTOCK_DOI = 90       # three months of cover
SLOW_DOI = 180           # six months -- overstock worth a separate conversation
LOW_DOI = 14             # two weeks left, still has stock to sell
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
                # Renamed 'On Hand Remaining' -> 'Available' in the 8/28 export.
                # Read both: the old name silently returned 0 for every lot.
                'onHand': num(row.get('Available') if row.get('Available') is not None
                              else row.get('On Hand Remaining')),
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


MONTH_RE = re.compile(r'^[A-Z][a-z]{2} \d{2}$')


def load_projections():
    """Real movement, catalog-wide. Same supplier-grouped shape as the status
    export: a row whose Product Num is not numeric is a group header, not a
    product. The month columns shift with every pull, so actual months are
    matched by pattern ("Aug 26") and forecasts by their "Projected " prefix --
    never by a hardcoded month name."""
    out, months, projected = {}, [], []
    with open(PROJECTIONS_CSV, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for c in (reader.fieldnames or []):
            c = (c or '').strip()
            if MONTH_RE.match(c):
                months.append(c)
            elif c.startswith('Projected '):
                projected.append(c)
        for row in reader:
            pnum = str(row.get('Product Num') or '').strip()
            if not pnum.isdigit():
                continue                      # supplier group header
            doi = str(row.get('Days of Inventory') or '').strip()
            out[pnum] = {
                'doi': num(doi) if doi else None,
                'forecastDoi': (num(row.get('Forecast Days of Inventory'))
                                if str(row.get('Forecast Days of Inventory') or '').strip()
                                else None),
                'trend10': str(row.get('10 Day Trend') or '').strip(),
                'trend28': str(row.get('28 Day Trend') or '').strip(),
                'backordered': num(row.get('Backordered')),
                'onOrder': num(row.get('Ordered')),
                'nextReceive': parse_date(row.get('Next Receive Date')),
                # The newest month is month-to-date on the pull day, so it is
                # carried but never used as a rate on its own.
                'monthly': [{'month': m, 'units': num(row.get(m))} for m in months],
                'projected': [{'month': m.replace('Projected ', ''),
                               'units': num(row.get(m))} for m in projected],
                # (projected is aggregated for the page, not carried per product)
            }
    return out, months, projected


def load_purchases():
    """Purchase lots -- the only source of COST, and the only one carrying
    FUTURE-dated rows (status New/Ordered), i.e. the inbound pipeline."""
    lots = []
    with open(PURCHASES_CSV, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            label = (row.get('Product') or '').strip()
            m = re.match(r'^(\d+)\s+(.*)$', label)
            lots.append({
                'id': (row.get('Purchase Trans ID') or '').strip(),
                'num': m.group(1) if m else '',
                'name': m.group(2).strip() if m else label,
                'received': parse_date(row.get('Receive Date')),
                'status': strip_html(row.get('Status')),
                'ordered': num(row.get('Ordered')),
                'units': num(row.get('Num Units')),
                'onHand': num(row.get('On Hand Remaining')),
                'laidIn': num(row.get('Laid-in Cost')),
                'fob': num(row.get('FOB')),
                'expires': parse_date(row.get('Expiration Date')),
                'location': (row.get('Location') or '').strip(),
            })
    return lots


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
    projections, proj_months, proj_forecast = load_projections()
    purchases = load_purchases()

    # "Today" is the newest receive date in the export, not the clock -- the
    # page's day counts must stay fixed to the data, so re-rendering an old
    # snapshot later doesn't silently age every lot.
    dates = [l['received'] for l in lots if l['received']]
    today = max(dates) if dates else datetime.date.today()
    win_start = min(dates) if dates else today
    d90, d30 = today - datetime.timedelta(days=90), today - datetime.timedelta(days=30)

    for p in products.values():
        p.update(recv90=0.0, recv30=0.0, recvLots=0, lastRecv=None, flags=[],
                 riskUnits=0.0, riskDollars=0.0, daysLeft=None, velocity=None, doi=None,
                 forecastDoi=None, trend10='', trend28='', backordered=0.0,
                 onOrder=0.0, nextReceive=None, monthly=[], projected=[],
                 unitCost=0.0, value=0.0, incomingUnits=0.0, incomingLots=0,
                 nextArrival=None)

    # Real movement, from the projections export.
    for pnum, pr in projections.items():
        p = products.get(pnum)
        if not p:
            continue
        p['doi'] = pr['doi']
        p['forecastDoi'] = pr['forecastDoi']
        p['trend10'], p['trend28'] = pr['trend10'], pr['trend28']
        p['backordered'], p['onOrder'] = pr['backordered'], pr['onOrder']
        p['nextReceive'] = pr['nextReceive']
        p['monthly'], p['projected'] = pr['monthly'], pr['projected']

    # Cost basis: the most recent lot that actually carries a laid-in cost.
    # Averaging across lots would blend a 2025 price into today's valuation;
    # the latest cost is what the next case is worth.
    cost_seen = {}
    for l in purchases:
        if not l['num'] or l['laidIn'] <= 0:
            continue
        prev = cost_seen.get(l['num'])
        if prev is None or (l['received'] and prev['received'] and l['received'] > prev['received']):
            cost_seen[l['num']] = l
    for pnum, l in cost_seen.items():
        p = products.get(pnum)
        if p:
            p['unitCost'] = l['laidIn']
            p['value'] = p['inventory'] * l['laidIn']

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

    # INBOUND PIPELINE -- future-dated purchase lots still to arrive. This is
    # the thing the 8/24 build could not answer at all.
    incoming = []
    for l in purchases:
        if not l['received'] or l['received'] <= today:
            continue
        if l['status'] not in ('New', 'Ordered'):
            continue
        units = l['ordered'] or l['units']
        if units <= 0:
            continue
        incoming.append(dict(l, qty=units))
        p = products.get(l['num'])
        if not p:
            continue
        p['incomingUnits'] += units
        p['incomingLots'] += 1
        if p['nextArrival'] is None or l['received'] < p['nextArrival']:
            p['nextArrival'] = l['received']

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
        # Movement, on real DOI. No projections row -> no movement flag: absence
        # of a rate is not evidence of a slow one.
        doi = p['doi']
        if doi is not None and doi > 0:
            if doi >= SLOW_DOI:
                p['flags'].append('slow')
            elif doi >= OVERSTOCK_DOI:
                p['flags'].append('overstock')
            elif doi <= LOW_DOI and p['available'] > 0:
                p['flags'].append('low')
        if p['available'] <= 0 and (p['backordered'] > 0 or (doi is not None and doi > 0)):
            p['flags'].append('stockout')
        # Buying into a problem: more stock inbound on top of 90+ days of cover.
        if p['incomingUnits'] > 0 and doi is not None and doi >= OVERSTOCK_DOI:
            p['flags'].append('inboundrisk')

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
                                        'recv90': 0.0, 'value': 0.0, 'incomingUnits': 0.0,
                                        'products': 0, 'stocked': 0})
            g['onHand'] += p['inventory']
            g['available'] += p['available']
            g['riskDollars'] += p['riskDollars']
            g['riskUnits'] += p['riskUnits']
            g['recv90'] += p['recv90']
            g['value'] += p['value']
            g['incomingUnits'] += p['incomingUnits']
            g['products'] += 1
            g['stocked'] += 1 if p['inventory'] > 0 else 0
        return sorted(out.values(), key=lambda g: -g['value'] or -g['onHand'])

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
                           for f in ['atrisk', 'expired', 'unsellable', 'negative',
                                     'slow', 'overstock', 'low', 'stockout', 'inboundrisk']},
            # Valuation and forward view -- neither existed before 2026-08-28.
            'value': sum(p['value'] for p in products.values()),
            'valuedProducts': sum(1 for p in products.values() if p['value'] > 0),
            'valuedOnHand': sum(p['inventory'] for p in products.values() if p['unitCost'] > 0),
            'incomingUnits': sum(p['incomingUnits'] for p in products.values()),
            'incomingLots': len(incoming),
            'incomingProducts': sum(1 for p in products.values() if p['incomingUnits'] > 0),
            'incomingValue': sum(p['incomingUnits'] * p['unitCost'] for p in products.values()),
            'backordered': sum(p['backordered'] for p in products.values()),
            'doiProducts': sum(1 for p in products.values() if p['doi'] is not None),
            'doiMedian': (sorted(p['doi'] for p in products.values()
                                 if p['doi'] is not None and p['doi'] > 0)
                          [sum(1 for p in products.values() if p['doi'] is not None and p['doi'] > 0) // 2]
                          if any(p['doi'] for p in products.values()) else 0),
        },
        'pipeline': pipeline,
        'projMonths': proj_months,
        'projForecast': [m.replace('Projected ', '') for m in proj_forecast],
        'incoming': [{'num': l['num'], 'name': l['name'],
                      'arrives': l['received'].isoformat(), 'qty': l['qty'],
                      'status': l['status'], 'cost': l['laidIn'],
                      'supplier': products.get(l['num'], {}).get('supplier', '(unknown)'),
                      'doi': products.get(l['num'], {}).get('doi'),
                      'onHand': products.get(l['num'], {}).get('inventory', 0.0)}
                     for l in sorted(incoming, key=lambda l: (l['received'], -l['qty']))],
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
                      'forecastDoi': p['forecastDoi'], 'trend28': p['trend28'],
                      'backordered': p['backordered'], 'onOrder': p['onOrder'],
                      'unitCost': round(p['unitCost'], 2), 'value': round(p['value'], 2),
                      'incomingUnits': p['incomingUnits'],
                      'nextArrival': p['nextArrival'].isoformat() if p['nextArrival'] else None,
                      # Bare numbers -- the labels live once in payload.projMonths
                      # rather than repeated on all ~2,200 products.
                      'monthly': [m['units'] for m in p['monthly']],
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
    print(f"  Value on hand: ${s['value']:,.0f} across {s['valuedProducts']:,} costed products "
          f"({s['valuedOnHand']:,.0f} of {s['onHand']:,.0f} units carry a laid-in cost)")
    print(f"  Inbound: {s['incomingLots']:,} lots / {s['incomingUnits']:,.0f} units "
          f"(${s['incomingValue']:,.0f}) across {s['incomingProducts']:,} products")
    print(f"  Movement: real DOI on {s['doiProducts']:,} products, median {s['doiMedian']:,.0f} days; "
          f"backordered {s['backordered']:,.0f} units")
    print(f"  Flags: " + ", ".join(f"{k} {v}" for k, v in s['flagCounts'].items()))
    print(f"  Products listed on the page: {s['productsListed']:,} "
          f"({s['productsTotal'] - s['productsListed']:,} dead catalogue rows omitted)")
    print(f"  Non-product receipt lots (pallets/dunnage, no status match): {unmatched_lots:,} "
          f"lots over {len(unmatched_nums)} item numbers; unmatched at-risk rows: {unmatched_risk}")
    print(f"  Wrote {len(data_json):,} bytes of JSON into index.html")


if __name__ == '__main__':
    main()
