#!/usr/bin/env python3
"""
Regenerates the embedded data in index.html from RDE_Bardstown_Green_River_Retention_History.csv.

Usage (from this folder):
    python3 generate.py

Input (keep this filename when re-exporting from RDE):
    RDE_Bardstown_Green_River_Retention_History.csv
    - "RDE Bardstown / Green River Retention History" export, one row per
      account x product x purchase date, with per-row Buyer Count (always 1),
      Units, Revenue and Gross Profit for that single order.

Every row is one order occasion, so counting rows per (account, product) is
literally "how many times this account bought this product" in the window
covered by the export.

CORE definitions (from Kohler, hard-coded below):
    Green River CORE  = Bourbon, Full Proof, Rye, Wheated, Honey (5 SKUs)
    Bardstown Bourbon CORE = Bottled-in-Bond, Bourbon, Double Barrel Rye, High Wheat (4 SKUs)
An account "carries the CORE" for a brand only if it has bought EVERY one of
that brand's core SKUs at least once in the window.
"""
import csv, json, re, os, datetime
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, 'RDE_Bardstown_Green_River_Retention_History.csv')
HTML = os.path.join(HERE, 'index.html')

GREEN_RIVER_CORE = ['201051', '201054', '201052', '201053', '201077']
BARDSTOWN_CORE = ['201055', '201056', '201058', '201057']
BRANDS = ['Green River', 'Bardstown Bourbon']
CORE_SKUS = {'Green River': GREEN_RIVER_CORE, 'Bardstown Bourbon': BARDSTOWN_CORE}

# 1 unit = 1 bottle; a case is 6 bottles (1 unit = .17 cases), per Kohler, 2026-07-22.
CASE_PACK_UNITS = 6
FIRST_ORDER_SEGMENTS = [
    ('bottle', 'Single bottle (1 unit)'),
    ('partial', 'Partial case (2-5 units)'),
    ('case', 'Full case+ (6+ units)'),
]


def classify_order_size(units):
    if units == 1:
        return 'bottle'
    if units >= CASE_PACK_UNITS and units % CASE_PACK_UNITS == 0:
        return 'case'
    return 'partial'


def brand_of(product_name):
    if product_name.startswith('Green River'):
        return 'Green River'
    if product_name.startswith('Bardstown'):
        return 'Bardstown Bourbon'
    return None


def parse_date(s):
    m, d, y = s.split('/')
    return datetime.date(int(y), int(m), int(d))


def money(s):
    if not s:
        return 0.0
    neg = s.startswith('(') and s.endswith(')')
    s = s.strip('()').replace('$', '').replace(',', '')
    v = float(s) if s else 0.0
    return -v if neg else v


def num(s):
    return float(s) if s else 0.0


# ---------- premise lookup ----------
# This export has no Premise column of its own. Cross-referenced against
# the Wine & Spirits portfolio account roster (which does carry an
# "On-Off Premise" tag per Customer ID) -- confirmed 2026-08-04 that 100%
# of this export's ~350 customer numbers are present in that roster, so
# it's a reliable join key rather than a fresh RDE re-export. Per Kohler
# request 2026-08-04, to view retention/velocity/CORE performance split
# by account premise.
WS_ROSTER_CSV = os.path.join(HERE, '..', 'wine-spirits-portfolio', 'ws_account_level_by_month.csv')
premise_by_cust = {}
with open(WS_ROSTER_CSV, newline='', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        cid = r['Customer ID'].strip()
        prem = r['On-Off Premise'].strip()
        if cid and cid not in premise_by_cust:
            premise_by_cust[cid] = prem

# ---------- load ----------
with open(CSV_PATH, newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    raw = list(reader)

rev_col = next(c for c in raw[0] if c.startswith('Revenue'))
units_col = next(c for c in raw[0] if c.startswith('Units'))
gp_col = next(c for c in raw[0] if c.startswith('Gross Profit'))

rows = []
for r in raw:
    b = brand_of(r['Product Name'])
    if not b:
        continue
    cust = r['Customer Num']
    rows.append({
        'cust': cust, 'name': r['Customer Name'], 'rep': r['Sales Rep Assigned'],
        'area': r['Distribution Area'], 'city': r['City'],
        'prod': r['Product Num'], 'prodName': r['Product Name'], 'brand': b,
        'date': parse_date(r['Date']), 'units': num(r[units_col]),
        'revenue': money(r[rev_col]), 'gp': money(r[gp_col]),
        'premise': premise_by_cust.get(cust, 'Unknown'),
    })

ALL_DATES = [r['date'] for r in rows]
WINDOW_START, WINDOW_END = min(ALL_DATES), max(ALL_DATES)
WINDOW_MONTHS = (WINDOW_END - WINDOW_START).days / 30.44

PRODUCTS = {}
for r in rows:
    PRODUCTS[r['prod']] = {'num': r['prod'], 'name': r['prodName'], 'brand': r['brand'],
                            'core': r['prod'] in CORE_SKUS[r['brand']]}

# How many distinct accounts didn't match the premise roster (surfaced in
# the UI as a caveat -- 0 as of the 2026-08-04 refresh, but the join could
# drift if brand-new accounts appear here before they show up in the W&S
# roster on its own refresh cycle).
_all_accts = {r['cust'] for r in rows}
_unmatched_accts = {r['cust'] for r in rows if r['premise'] == 'Unknown'}
PREMISE_COVERAGE = {
    'totalAccounts': len(_all_accts),
    'unmatchedAccounts': len(_unmatched_accts),
}


def build_brand_payload(brand, rows_subset):
    # ---------- account x brand rollups (scoped to this premise slice) ----------
    acct_brand = defaultdict(lambda: {'orders': 0, 'units': 0.0, 'revenue': 0.0, 'gp': 0.0,
                                       'skus': set(), 'dates': [], 'orderLines': []})
    for r in rows_subset:
        o = acct_brand[(r['cust'], r['brand'])]
        o['orders'] += 1
        o['units'] += r['units']
        o['revenue'] += r['revenue']
        o['gp'] += r['gp']
        o['skus'].add(r['prod'])
        o['dates'].append(r['date'])
        o['orderLines'].append((r['date'], r['units']))

    acct_info = {}
    for r in rows_subset:
        acct_info.setdefault(r['cust'], {'name': r['name'], 'rep': r['rep'], 'area': r['area'], 'city': r['city']})

    core_set = set(CORE_SKUS[brand])
    accounts = []
    for (cust, b), o in acct_brand.items():
        if b != brand:
            continue
        info = acct_info[cust]
        first, last = min(o['dates']), max(o['dates'])
        velocity = o['units'] / WINDOW_MONTHS if WINDOW_MONTHS > 0 else 0.0
        missing_core = sorted(core_set - o['skus'])
        first_order_units = sorted(o['orderLines'], key=lambda ol: ol[0])[0][1]
        accounts.append({
            'id': cust, 'name': info['name'], 'rep': info['rep'], 'area': info['area'], 'city': info['city'],
            'orders': o['orders'], 'units': round(o['units'], 2), 'revenue': round(o['revenue'], 2),
            'gp': round(o['gp'], 2), 'skuCount': len(o['skus']),
            'firstDate': first.isoformat(), 'lastDate': last.isoformat(),
            'velocity': round(velocity, 3),
            'isCore': core_set.issubset(o['skus']),
            'missingCore': [PRODUCTS[p]['name'] for p in missing_core],
            'missingCoreCount': len(missing_core),
            'firstOrderType': classify_order_size(first_order_units),
        })
    accounts.sort(key=lambda a: -a['revenue'])

    buyers = len(accounts)
    core_accounts = [a for a in accounts if a['isCore']]
    near_core = [a for a in accounts if not a['isCore'] and a['missingCoreCount'] == 1]
    total_orders = sum(a['orders'] for a in accounts)
    total_units = sum(a['units'] for a in accounts)
    total_revenue = sum(a['revenue'] for a in accounts)
    repeat_accounts = [a for a in accounts if a['orders'] >= 2]

    # purchase-frequency distribution at the account level (total brand orders per account)
    def bucket(n):
        if n == 1: return '1x'
        if n == 2: return '2x'
        if n == 3: return '3x'
        if 4 <= n <= 6: return '4-6x'
        return '7x+'
    freq_order = ['1x', '2x', '3x', '4-6x', '7x+']
    freq_counts = {k: 0 for k in freq_order}
    for a in accounts:
        freq_counts[bucket(a['orders'])] += 1
    frequency = [{'bucket': k, 'count': freq_counts[k]} for k in freq_order]

    # per-SKU stats (retention rate = accounts with 2+ orders of that SKU / accounts with 1+)
    sku_stats = []
    for prod, p in PRODUCTS.items():
        if p['brand'] != brand:
            continue
        prod_accts = defaultdict(int)
        prod_units = 0.0
        prod_rev = 0.0
        for r in rows_subset:
            if r['prod'] != prod:
                continue
            prod_accts[r['cust']] += 1
            prod_units += r['units']
            prod_rev += r['revenue']
        n_buyers = len(prod_accts)
        n_repeat = sum(1 for c in prod_accts.values() if c >= 2)
        sku_stats.append({
            'num': prod, 'name': p['name'], 'core': p['core'], 'buyers': n_buyers,
            'orders': sum(prod_accts.values()), 'units': round(prod_units, 2), 'revenue': round(prod_rev, 2),
            'repeatBuyers': n_repeat, 'repeatRate': round(n_repeat / n_buyers * 100, 1) if n_buyers else 0,
            'avgOrdersPerBuyer': round(sum(prod_accts.values()) / n_buyers, 2) if n_buyers else 0,
        })
    sku_stats.sort(key=lambda s: -s['revenue'])

    # area rollups
    area_map = defaultdict(lambda: {'accts': set(), 'orders': 0, 'units': 0.0, 'revenue': 0.0, 'repeatAccts': 0})
    for a in accounts:
        o = area_map[a['area']]
        o['accts'].add(a['id'])
        o['orders'] += a['orders']
        o['units'] += a['units']
        o['revenue'] += a['revenue']
        if a['orders'] >= 2:
            o['repeatAccts'] += 1
    areas = []
    for area, o in area_map.items():
        n = len(o['accts'])
        areas.append({
            'area': area, 'buyers': n, 'orders': o['orders'], 'units': round(o['units'], 2),
            'revenue': round(o['revenue'], 2), 'repeatRate': round(o['repeatAccts'] / n * 100, 1) if n else 0,
            'velocity': round(o['units'] / n / WINDOW_MONTHS, 3) if n and WINDOW_MONTHS > 0 else 0,
            'coreAccts': sum(1 for a in accounts if a['area'] == area and a['isCore']),
        })
    areas.sort(key=lambda a: -a['revenue'])

    # rep leaderboard for CORE accountability
    rep_map = defaultdict(lambda: {'buyers': 0, 'core': 0})
    for a in accounts:
        rm = rep_map[a['rep']]
        rm['buyers'] += 1
        if a['isCore']:
            rm['core'] += 1
    reps = [{'rep': rep, 'buyers': o['buyers'], 'core': o['core'],
             'coreRate': round(o['core'] / o['buyers'] * 100, 1) if o['buyers'] else 0}
            for rep, o in rep_map.items()]
    reps.sort(key=lambda r: -r['core'])

    velocity_leaders = sorted([a for a in accounts if a['orders'] >= 2], key=lambda a: -a['velocity'])[:25]

    # bottle vs. case: does the size of an account's very first order predict whether it repeats?
    first_order_size = []
    for key, label in FIRST_ORDER_SEGMENTS:
        seg_accts = [a for a in accounts if a['firstOrderType'] == key]
        n = len(seg_accts)
        repeat_n = sum(1 for a in seg_accts if a['orders'] >= 2)
        first_order_size.append({
            'key': key, 'label': label, 'accounts': n, 'repeatAccounts': repeat_n,
            'repeatRate': round(repeat_n / n * 100, 1) if n else 0,
            'avgOrdersPerBuyer': round(sum(a['orders'] for a in seg_accts) / n, 2) if n else 0,
        })

    return {
        'name': brand,
        'coreSkus': [PRODUCTS[p]['name'] for p in CORE_SKUS[brand]],
        'summary': {
            'buyers': buyers, 'orders': total_orders, 'units': round(total_units, 2),
            'revenue': round(total_revenue, 2),
            'repeatAccounts': len(repeat_accounts),
            'repeatRate': round(len(repeat_accounts) / buyers * 100, 1) if buyers else 0,
            'avgOrdersPerBuyer': round(total_orders / buyers, 2) if buyers else 0,
            'coreAccounts': len(core_accounts), 'coreRate': round(len(core_accounts) / buyers * 100, 1) if buyers else 0,
            'nearCoreAccounts': len(near_core),
        },
        'frequency': frequency,
        'skuStats': sku_stats,
        'areas': areas,
        'reps': reps,
        'velocityLeaders': velocity_leaders,
        'firstOrderSize': first_order_size,
        'coreAccounts': core_accounts,
        'nearCoreAccounts': sorted(near_core, key=lambda a: -a['revenue']),
        'accounts': accounts,
    }


# Three parallel views, all sharing the same report window/products so
# they're a true apples-to-apples comparison: All accounts, On-Premise
# only, Off-Premise only. 'Unknown' (unmatched-to-roster) accounts are
# included in "all" but excluded from the on/off splits, same as the
# on/off-prem MPO dashboards do for their own premise breakdowns.
PREMISE_VIEWS = [('all', None), ('on', 'On Premise'), ('off', 'Off Premise')]

payload = {
    'meta': {
        'windowStart': WINDOW_START.isoformat(), 'windowEnd': WINDOW_END.isoformat(),
        'windowMonths': round(WINDOW_MONTHS, 1),
        'totalRows': len(rows),
    },
    'premiseCoverage': PREMISE_COVERAGE,
    'views': {
        key: {'brands': {b: build_brand_payload(b, [r for r in rows if premise is None or r['premise'] == premise])
                          for b in BRANDS}}
        for key, premise in PREMISE_VIEWS
    },
}

data_json = json.dumps(payload, separators=(',', ':'))

html = open(HTML, encoding='utf-8').read()
new_html, n = re.subn(
    r'(<script id="bg-data" type="application/json">).*?(</script>)',
    lambda m: m.group(1) + data_json + m.group(2),
    html, count=1, flags=re.S,
)
assert n == 1, 'bg-data script tag not found in index.html'
open(HTML, 'w', encoding='utf-8').write(new_html)

print(f"Premise coverage: {PREMISE_COVERAGE['totalAccounts'] - PREMISE_COVERAGE['unmatchedAccounts']} of "
      f"{PREMISE_COVERAGE['totalAccounts']} accounts matched to a known premise "
      f"({PREMISE_COVERAGE['unmatchedAccounts']} unmatched)")

for b in BRANDS:
    print(b, json.dumps(payload['views']['all']['brands'][b]['summary'], indent=2))
