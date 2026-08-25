#!/usr/bin/env python3
"""
Regenerates the embedded data in index.html from RDE_Bardstown_Green_River_Retention_History.csv.

Usage (from this folder):
    python3 generate.py

Input (keep this filename when re-exporting from RDE):
    RDE_Bardstown_Green_River_Retention_History.csv
    - "RDE Bardstown / Green River Retention History" export, one row per
      account x product x purchase date, with per-row Buyer Count (always 1),
      Cases, Revenue and Gross Profit for that single order.

VOLUME IS ALWAYS CASES. The export carries a real "Cases" column (1 bottle =
.17 cases, i.e. 6 bottles to a case) and that column is the single source of
volume for every number this script emits -- nothing downstream reports
bottles/each-counts as a volume figure. The only place bottle counts survive
is the "bottle vs. case" first-order-size segmentation, which is by
definition a question about order size in bottles; it reports no volume of
its own.

Every row is one order occasion, so counting rows per (account, product) is
literally "how many times this account bought this product" in the window
covered by the export.

CORE definitions (from Kohler, hard-coded below):
    Green River CORE  = Bourbon, Full Proof, Rye, Wheated, Honey (5 SKUs)
    Bardstown Bourbon CORE = Bottled-in-Bond, Bourbon, Double Barrel Rye, High Wheat (4 SKUs)
An account "carries the CORE" for a brand only if it has bought EVERY one of
that brand's core SKUs at least once in the window.

BRAND LINES (the "four brands" in the rep placement-gap matrix) are the four
sellable lines this book is built around -- see BRAND_LINES below. Edit that
list if Kohler re-cuts the lineup.
"""
import csv, json, re, os, datetime
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, 'RDE_Bardstown_Green_River_Retention_History.csv')
HTML = os.path.join(HERE, 'index.html')
# Assigned-account roster for the Wine & Spirits book -- the denominator for
# "% of total account universe" in the Retention section, and a premise
# fallback for any account missing from the W&S monthly roster.
ROSTER_CSV = os.path.join(HERE, '..', 'wine-spirits', 'ws_account_roster.csv')
WS_ROSTER_CSV = os.path.join(HERE, '..', 'wine-spirits-portfolio', 'ws_account_level_by_month.csv')

GREEN_RIVER_CORE = ['201051', '201054', '201052', '201053', '201077']
BARDSTOWN_CORE = ['201055', '201056', '201058', '201057']
BRANDS = ['Green River', 'Bardstown Bourbon']
CORE_SKUS = {'Green River': GREEN_RIVER_CORE, 'Bardstown Bourbon': BARDSTOWN_CORE}

# The four brand lines used by the rep placement-gap matrix ("who has all
# four, who is missing one"). Anything not listed falls into the line whose
# brand it belongs to via LINE_FALLBACK.
BRAND_LINES = [
    {'key': 'bb_origin', 'label': 'Bardstown Origin Series', 'brand': 'Bardstown Bourbon',
     'products': ['201055', '201056', '201057', '201058']},
    {'key': 'bb_limited', 'label': 'Bardstown Discovery / Collab', 'brand': 'Bardstown Bourbon',
     'products': ['201059', '201060', '201061', '201062', '201063', '201064',
                  '201069', '201070', '201071', '201073', '201074']},
    {'key': 'gr_core', 'label': 'Green River Core', 'brand': 'Green River',
     'products': ['201051', '201052', '201053', '201054', '201065', '201077']},
    {'key': 'gr_limited', 'label': 'Green River Single Barrel / Specialty', 'brand': 'Green River',
     'products': ['201066', '201067', '201068', '201072', '201075', '201076']},
]
LINE_FALLBACK = {'Bardstown Bourbon': 'bb_limited', 'Green River': 'gr_limited'}
LINE_OF_PRODUCT = {p: l['key'] for l in BRAND_LINES for p in l['products']}

# 1 bottle = .17 cases (6 bottles to a case), per Kohler, 2026-07-22. Used
# only to classify the SIZE of an account's first order (bottle vs. case),
# never to report volume -- volume is the export's Cases column.
BOTTLES_PER_CASE = 6
FIRST_ORDER_SEGMENTS = [
    ('bottle', 'Single bottle (0.17 case)'),
    ('partial', 'Partial case (2-5 bottles)'),
    ('case', 'Full case+ (6+ bottles)'),
]
# Purchase-frequency ladder for the Retention section, per Kohler's spec.
FREQ_THRESHOLDS = [1, 2, 3, 4, 5, 10, 20]

MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def classify_order_size(bottles):
    if bottles == 1:
        return 'bottle'
    if bottles >= BOTTLES_PER_CASE and bottles % BOTTLES_PER_CASE == 0:
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
    if not s:
        return 0.0
    s = s.strip()
    neg = s.startswith('(') and s.endswith(')')
    s = s.strip('()').replace(',', '')
    v = float(s) if s else 0.0
    return -v if neg else v


def pct_change(now, prior):
    if prior:
        return round((now - prior) / abs(prior) * 100, 1)
    return None


def month_label(ym):
    y, m = ym
    return f'{MONTH_NAMES[m]} {y}'


# ---------- premise + account universe ----------
# This export has no Premise column of its own. Cross-referenced against the
# Wine & Spirits portfolio account roster (which does carry an "On-Off
# Premise" tag per Customer ID) -- confirmed 2026-08-04 that 100% of this
# export's ~350 customer numbers are present in that roster. The assigned
# roster (ws_account_roster.csv) is the second source and supplies the
# account-universe denominator for the Retention section.
premise_by_cust = {}
with open(WS_ROSTER_CSV, newline='', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        cid = r['Customer ID'].strip()
        prem = r['On-Off Premise'].strip()
        if cid and cid not in premise_by_cust:
            premise_by_cust[cid] = prem

universe = {'all': 0, 'on': 0, 'off': 0}
with open(ROSTER_CSV, newline='', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        cid = r['Customer Num'].strip()
        prem = r['On-Off Premise'].strip()
        premise_by_cust.setdefault(cid, prem)
        universe['all'] += 1
        if prem == 'On Premise':
            universe['on'] += 1
        elif prem == 'Off Premise':
            universe['off'] += 1

# ---------- load ----------
with open(CSV_PATH, newline='', encoding='utf-8-sig') as f:
    raw = list(csv.DictReader(f))

rev_col = next(c for c in raw[0] if c.startswith('Revenue'))
cases_col = next(c for c in raw[0] if c.startswith('Cases'))
bottles_col = next(c for c in raw[0] if c.startswith('Units'))  # source column only; never reported
gp_col = next(c for c in raw[0] if c.startswith('Gross Profit'))

rows = []
for r in raw:
    b = brand_of(r['Product Name'])
    if not b:
        continue
    cust = r['Customer Num']
    prod = r['Product Num']
    rows.append({
        'cust': cust, 'name': r['Customer Name'], 'rep': r['Sales Rep Assigned'],
        'area': r['Distribution Area'], 'city': r['City'].strip() or 'Unknown',
        'prod': prod, 'prodName': r['Product Name'], 'brand': b,
        'line': LINE_OF_PRODUCT.get(prod, LINE_FALLBACK[b]),
        'date': parse_date(r['Date']), 'cases': num(r[cases_col]),
        'bottles': num(r[bottles_col]),
        'revenue': money(r[rev_col]), 'gp': money(r[gp_col]),
        'premise': premise_by_cust.get(cust, 'Unknown'),
    })

ALL_DATES = [r['date'] for r in rows]
WINDOW_START, WINDOW_END = min(ALL_DATES), max(ALL_DATES)
WINDOW_MONTHS = (WINDOW_END - WINDOW_START).days / 30.44

# ---------- period definitions (all comparisons are like-for-like) ----------
CUR_YEAR = WINDOW_END.year
CUR_MONTH = (WINDOW_END.year, WINDOW_END.month)
PRIOR_MONTH = (CUR_YEAR - 1, 12) if WINDOW_END.month == 1 else (CUR_YEAR, WINDOW_END.month - 1)
YTD_START = datetime.date(CUR_YEAR, 1, 1)
PY_YTD_START = datetime.date(CUR_YEAR - 1, 1, 1)
try:
    PY_YTD_END = WINDOW_END.replace(year=CUR_YEAR - 1)
except ValueError:                      # Feb 29 -> Feb 28
    PY_YTD_END = WINDOW_END.replace(year=CUR_YEAR - 1, day=28)
# Same calendar days last year for the current (partial) month, so
# month-to-date is never compared against a full prior-year month.
PY_CUR_MONTH_START = datetime.date(CUR_YEAR - 1, WINDOW_END.month, 1)
PY_CUR_MONTH_END = PY_YTD_END
PRIOR_MONTH_START = datetime.date(PRIOR_MONTH[0], PRIOR_MONTH[1], 1)
PRIOR_MONTH_END = datetime.date(CUR_YEAR, WINDOW_END.month, 1) - datetime.timedelta(days=1)
PY_PRIOR_MONTH_START = datetime.date(PRIOR_MONTH[0] - 1, PRIOR_MONTH[1], 1)
try:
    PY_PRIOR_MONTH_END = PRIOR_MONTH_END.replace(year=PRIOR_MONTH_END.year - 1)
except ValueError:                      # Feb 29 -> Feb 28
    PY_PRIOR_MONTH_END = PRIOR_MONTH_END.replace(year=PRIOR_MONTH_END.year - 1, day=28)

ALL_MONTHS = []
_y, _m = WINDOW_START.year, WINDOW_START.month
while (_y, _m) <= CUR_MONTH:
    ALL_MONTHS.append((_y, _m))
    _m += 1
    if _m == 13:
        _m, _y = 1, _y + 1

# Trailing 3 months vs the 3 before that, for per-account / per-SKU trend.
TREND_RECENT = ALL_MONTHS[-3:]
TREND_PRIOR = ALL_MONTHS[-6:-3]

PERIODS = {
    'mtd': (datetime.date(CUR_YEAR, WINDOW_END.month, 1), WINDOW_END),
    'mtdPy': (PY_CUR_MONTH_START, PY_CUR_MONTH_END),
    'priorMonth': (PRIOR_MONTH_START, PRIOR_MONTH_END),
    'priorMonthPy': (PY_PRIOR_MONTH_START, PY_PRIOR_MONTH_END),
    'ytd': (YTD_START, WINDOW_END),
    'pyYtd': (PY_YTD_START, PY_YTD_END),
}


def in_period(d, key):
    lo, hi = PERIODS[key]
    return lo <= d <= hi


PRODUCTS = {}
for r in rows:
    PRODUCTS[r['prod']] = {'num': r['prod'], 'name': r['prodName'], 'brand': r['brand'],
                           'line': r['line'], 'core': r['prod'] in CORE_SKUS[r['brand']]}

# First-ever purchase dates, for new-placement detection. Computed on the
# full export (not the premise slice) so a "new placement" always means the
# account's genuine first order of that brand/SKU in the window.
first_brand_order = {}
first_sku_order = {}
for r in rows:
    kb = (r['cust'], r['brand'])
    if kb not in first_brand_order or r['date'] < first_brand_order[kb]:
        first_brand_order[kb] = r['date']
    ks = (r['cust'], r['prod'])
    if ks not in first_sku_order or r['date'] < first_sku_order[ks]:
        first_sku_order[ks] = r['date']

_all_accts = {r['cust'] for r in rows}
_unmatched_accts = {r['cust'] for r in rows if r['premise'] == 'Unknown'}
PREMISE_COVERAGE = {
    'totalAccounts': len(_all_accts),
    'unmatchedAccounts': len(_unmatched_accts),
}


def period_stats(rows_subset, key):
    """Cases / orders / buyers / revenue for one named period."""
    cases = orders = revenue = gp = 0.0
    buyers = set()
    for r in rows_subset:
        if not in_period(r['date'], key):
            continue
        cases += r['cases']
        orders += 1
        revenue += r['revenue']
        gp += r['gp']
        buyers.add(r['cust'])
    return {'cases': round(cases, 2), 'orders': int(orders), 'buyers': len(buyers),
            'revenue': round(revenue, 2), 'gp': round(gp, 2)}


def delta(now, prior):
    return {
        'cases': round(now['cases'] - prior['cases'], 2),
        'casesPct': pct_change(now['cases'], prior['cases']),
        'buyers': now['buyers'] - prior['buyers'],
        'buyersPct': pct_change(now['buyers'], prior['buyers']),
        'orders': now['orders'] - prior['orders'],
        'revenue': round(now['revenue'] - prior['revenue'], 2),
        'revenuePct': pct_change(now['revenue'], prior['revenue']),
    }


def build_new_placements(rows_subset, brand, period_key):
    """Accounts whose FIRST-EVER order of this brand lands inside the period."""
    lo, hi = PERIODS[period_key]
    acc = defaultdict(lambda: {'cases': 0.0, 'revenue': 0.0, 'orders': 0, 'skus': {}})
    meta = {}
    for r in rows_subset:
        if r['brand'] != brand:
            continue
        first = first_brand_order[(r['cust'], r['brand'])]
        if not (lo <= first <= hi):
            continue
        if not (lo <= r['date'] <= hi):
            continue
        a = acc[r['cust']]
        a['cases'] += r['cases']
        a['revenue'] += r['revenue']
        a['orders'] += 1
        a['skus'][r['prodName']] = a['skus'].get(r['prodName'], 0) + r['cases']
        meta[r['cust']] = r
    out = []
    for cust, a in acc.items():
        r = meta[cust]
        out.append({
            'cust': cust, 'name': r['name'], 'brand': brand, 'city': r['city'],
            'rep': r['rep'], 'area': r['area'], 'premise': r['premise'],
            'firstDate': first_brand_order[(cust, brand)].isoformat(),
            'cases': round(a['cases'], 2), 'revenue': round(a['revenue'], 2),
            'orders': a['orders'],
            'skus': [{'name': n, 'cases': round(c, 2)} for n, c in
                     sorted(a['skus'].items(), key=lambda kv: -kv[1])],
        })
    out.sort(key=lambda x: (x['firstDate'], -x['cases']))
    return out


def build_brand_payload(brand, rows_subset, view_universe):
    brand_rows = [r for r in rows_subset if r['brand'] == brand]

    # ---------- account x brand rollups (scoped to this premise slice) ----------
    acct_brand = defaultdict(lambda: {'orders': 0, 'cases': 0.0, 'revenue': 0.0, 'gp': 0.0,
                                      'skus': defaultdict(lambda: {'cases': 0.0, 'revenue': 0.0,
                                                                   'orders': 0, 'dates': [],
                                                                   'ytd': 0.0, 'pyYtd': 0.0,
                                                                   'recent': 0.0, 'prior': 0.0}),
                                      'dates': [], 'orderLines': [],
                                      'ytdCases': 0.0, 'pyYtdCases': 0.0,
                                      'mtdCases': 0.0, 'priorMonthCases': 0.0,
                                      'recentCases': 0.0, 'priorCases': 0.0})
    for r in brand_rows:
        o = acct_brand[r['cust']]
        o['orders'] += 1
        o['cases'] += r['cases']
        o['revenue'] += r['revenue']
        o['gp'] += r['gp']
        o['dates'].append(r['date'])
        o['orderLines'].append((r['date'], r['bottles']))
        s = o['skus'][r['prod']]
        s['cases'] += r['cases']
        s['revenue'] += r['revenue']
        s['orders'] += 1
        s['dates'].append(r['date'])
        ym = (r['date'].year, r['date'].month)
        if in_period(r['date'], 'ytd'):
            o['ytdCases'] += r['cases']
            s['ytd'] += r['cases']
        if in_period(r['date'], 'pyYtd'):
            o['pyYtdCases'] += r['cases']
            s['pyYtd'] += r['cases']
        if in_period(r['date'], 'mtd'):
            o['mtdCases'] += r['cases']
        if in_period(r['date'], 'priorMonth'):
            o['priorMonthCases'] += r['cases']
        if ym in TREND_RECENT:
            o['recentCases'] += r['cases']
            s['recent'] += r['cases']
        elif ym in TREND_PRIOR:
            o['priorCases'] += r['cases']
            s['prior'] += r['cases']

    acct_info = {}
    for r in brand_rows:
        acct_info.setdefault(r['cust'], {'name': r['name'], 'rep': r['rep'], 'area': r['area'],
                                         'city': r['city'], 'premise': r['premise']})

    core_set = set(CORE_SKUS[brand])
    accounts = []
    for cust, o in acct_brand.items():
        info = acct_info[cust]
        first, last = min(o['dates']), max(o['dates'])
        span_days = (last - first).days
        skus = []
        for pnum, s in o['skus'].items():
            sf, sl = min(s['dates']), max(s['dates'])
            skus.append({
                'num': pnum, 'name': PRODUCTS[pnum]['name'], 'core': PRODUCTS[pnum]['core'],
                'cases': round(s['cases'], 2), 'revenue': round(s['revenue'], 2),
                'orders': s['orders'],
                'firstDate': sf.isoformat(), 'lastDate': sl.isoformat(),
                'ytdCases': round(s['ytd'], 2), 'pyYtdCases': round(s['pyYtd'], 2),
                'trendPct': pct_change(s['recent'], s['prior']),
                'recentCases': round(s['recent'], 2), 'priorCases': round(s['prior'], 2),
                'daysBetween': round((sl - sf).days / (s['orders'] - 1), 1) if s['orders'] > 1 else None,
                'ordersPerMonth': round(s['orders'] / WINDOW_MONTHS, 2) if WINDOW_MONTHS else 0,
            })
        skus.sort(key=lambda s: -s['cases'])
        missing_core = sorted(core_set - set(o['skus'].keys()))
        first_order_bottles = sorted(o['orderLines'], key=lambda ol: ol[0])[0][1]
        accounts.append({
            'id': cust, 'name': info['name'], 'rep': info['rep'], 'area': info['area'],
            'city': info['city'], 'premise': info['premise'],
            'orders': o['orders'], 'cases': round(o['cases'], 2), 'revenue': round(o['revenue'], 2),
            'gp': round(o['gp'], 2), 'skuCount': len(o['skus']),
            'firstDate': first.isoformat(), 'lastDate': last.isoformat(),
            'velocity': round(o['cases'] / WINDOW_MONTHS, 3) if WINDOW_MONTHS > 0 else 0.0,
            'ytdCases': round(o['ytdCases'], 2), 'pyYtdCases': round(o['pyYtdCases'], 2),
            'ytdYoyPct': pct_change(o['ytdCases'], o['pyYtdCases']),
            'mtdCases': round(o['mtdCases'], 2), 'priorMonthCases': round(o['priorMonthCases'], 2),
            'trendPct': pct_change(o['recentCases'], o['priorCases']),
            'daysBetween': round(span_days / (o['orders'] - 1), 1) if o['orders'] > 1 else None,
            'ordersPerMonth': round(o['orders'] / WINDOW_MONTHS, 2) if WINDOW_MONTHS else 0,
            'isCore': core_set.issubset(set(o['skus'].keys())),
            'missingCore': [PRODUCTS[p]['name'] for p in missing_core],
            'missingCoreCount': len(missing_core),
            'firstOrderType': classify_order_size(first_order_bottles),
            'newThisYear': first_brand_order[(cust, brand)] >= YTD_START,
            'skus': skus,
        })
    accounts.sort(key=lambda a: -a['cases'])

    buyers = len(accounts)
    core_accounts = [a for a in accounts if a['isCore']]
    near_core = [a for a in accounts if not a['isCore'] and a['missingCoreCount'] == 1]
    total_orders = sum(a['orders'] for a in accounts)
    total_cases = sum(a['cases'] for a in accounts)
    total_revenue = sum(a['revenue'] for a in accounts)
    repeat_accounts = [a for a in accounts if a['orders'] >= 2]

    # ---------- monthly close + YTD performance ----------
    m_acc = defaultdict(lambda: {'cases': 0.0, 'orders': 0, 'revenue': 0.0, 'buyers': set()})
    for r in brand_rows:
        m = m_acc[(r['date'].year, r['date'].month)]
        m['cases'] += r['cases']
        m['orders'] += 1
        m['revenue'] += r['revenue']
        m['buyers'].add(r['cust'])
    monthly = [{
        'ym': f'{y}-{m:02d}', 'label': month_label((y, m)),
        'cases': round(m_acc[(y, m)]['cases'], 2) if (y, m) in m_acc else 0.0,
        'orders': m_acc[(y, m)]['orders'] if (y, m) in m_acc else 0,
        'revenue': round(m_acc[(y, m)]['revenue'], 2) if (y, m) in m_acc else 0.0,
        'buyers': len(m_acc[(y, m)]['buyers']) if (y, m) in m_acc else 0,
        'partial': (y, m) == CUR_MONTH,
    } for (y, m) in ALL_MONTHS]

    periods = {k: period_stats(brand_rows, k) for k in PERIODS}
    new_placements = {k: build_new_placements(rows_subset, brand, k)
                      for k in ('mtd', 'priorMonth', 'ytd', 'pyYtd')}
    for k in periods:
        periods[k]['newPlacements'] = len(new_placements[k]) if k in new_placements else 0
    # prior-year YTD new placements are only ever shown as a count
    new_placements['pyYtdCount'] = len(new_placements.pop('pyYtd'))

    performance = {
        'mtd': periods['mtd'], 'mtdPy': periods['mtdPy'],
        'priorMonth': periods['priorMonth'], 'priorMonthPy': periods['priorMonthPy'],
        'ytd': periods['ytd'], 'pyYtd': periods['pyYtd'],
        'mom': delta(periods['mtd'], periods['priorMonth']),
        'momFull': delta(periods['priorMonth'], periods['priorMonthPy']),
        'mtdYoy': delta(periods['mtd'], periods['mtdPy']),
        'yoy': delta(periods['ytd'], periods['pyYtd']),
    }

    # ---------- retention / purchase frequency vs the whole account universe ----------
    def freq_table(order_counts):
        out = []
        for t in FREQ_THRESHOLDS:
            n = sum(1 for c in order_counts if c >= t)
            out.append({
                'threshold': t,
                'label': f'{t}+ order' + ('' if t == 1 else 's'),
                'accounts': n,
                'pctUniverse': round(n / view_universe * 100, 1) if view_universe else 0.0,
                'pctBuyers': round(n / buyers * 100, 1) if buyers else 0.0,
            })
        return out

    window_orders = [a['orders'] for a in accounts]
    ytd_order_counts = defaultdict(int)
    for r in brand_rows:
        if in_period(r['date'], 'ytd'):
            ytd_order_counts[r['cust']] += 1
    retention = {
        'window': freq_table(window_orders),
        'ytd': freq_table(list(ytd_order_counts.values())),
        'universe': view_universe,
        'buyersWindow': buyers,
        'buyersYtd': len(ytd_order_counts),
    }

    # legacy bucket chart (exact order counts, not cumulative)
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

    # ---------- per-SKU stats ----------
    sku_acc = defaultdict(lambda: {'accts': defaultdict(int), 'cases': 0.0, 'revenue': 0.0,
                                   'ytd': 0.0, 'pyYtd': 0.0, 'ytdBuyers': set(), 'pyBuyers': set()})
    for r in brand_rows:
        s = sku_acc[r['prod']]
        s['accts'][r['cust']] += 1
        s['cases'] += r['cases']
        s['revenue'] += r['revenue']
        if in_period(r['date'], 'ytd'):
            s['ytd'] += r['cases']
            s['ytdBuyers'].add(r['cust'])
        if in_period(r['date'], 'pyYtd'):
            s['pyYtd'] += r['cases']
            s['pyBuyers'].add(r['cust'])
    sku_stats = []
    for prod, p in PRODUCTS.items():
        if p['brand'] != brand:
            continue
        s = sku_acc.get(prod)
        if not s:
            continue
        n_buyers = len(s['accts'])
        n_repeat = sum(1 for c in s['accts'].values() if c >= 2)
        sku_stats.append({
            'num': prod, 'name': p['name'], 'core': p['core'], 'line': p['line'],
            'buyers': n_buyers, 'orders': sum(s['accts'].values()),
            'cases': round(s['cases'], 2), 'revenue': round(s['revenue'], 2),
            'ytdCases': round(s['ytd'], 2), 'pyYtdCases': round(s['pyYtd'], 2),
            'ytdYoyPct': pct_change(s['ytd'], s['pyYtd']),
            'ytdBuyers': len(s['ytdBuyers']), 'pyYtdBuyers': len(s['pyBuyers']),
            'repeatBuyers': n_repeat, 'repeatRate': round(n_repeat / n_buyers * 100, 1) if n_buyers else 0,
            'avgOrdersPerBuyer': round(sum(s['accts'].values()) / n_buyers, 2) if n_buyers else 0,
        })
    sku_stats.sort(key=lambda s: -s['cases'])

    # ---------- area rollups ----------
    area_map = defaultdict(lambda: {'accts': set(), 'orders': 0, 'cases': 0.0, 'revenue': 0.0,
                                    'repeatAccts': 0, 'coreAccts': 0})
    for a in accounts:
        o = area_map[a['area']]
        o['accts'].add(a['id'])
        o['orders'] += a['orders']
        o['cases'] += a['cases']
        o['revenue'] += a['revenue']
        if a['orders'] >= 2:
            o['repeatAccts'] += 1
        if a['isCore']:
            o['coreAccts'] += 1
    areas = []
    for area, o in area_map.items():
        n = len(o['accts'])
        areas.append({
            'area': area, 'buyers': n, 'orders': o['orders'], 'cases': round(o['cases'], 2),
            'revenue': round(o['revenue'], 2),
            'repeatRate': round(o['repeatAccts'] / n * 100, 1) if n else 0,
            'velocity': round(o['cases'] / n / WINDOW_MONTHS, 3) if n and WINDOW_MONTHS > 0 else 0,
            'coreAccts': o['coreAccts'],
        })
    areas.sort(key=lambda a: -a['cases'])

    # ---------- account velocity by city (with premise split) ----------
    city_map = defaultdict(lambda: {'accts': set(), 'orders': 0, 'cases': 0.0, 'revenue': 0.0,
                                    'ytd': 0.0, 'pyYtd': 0.0, 'reps': set(),
                                    'onAccts': set(), 'offAccts': set(),
                                    'onCases': 0.0, 'offCases': 0.0, 'newAccts': set()})
    for r in brand_rows:
        c = city_map[r['city']]
        c['accts'].add(r['cust'])
        c['orders'] += 1
        c['cases'] += r['cases']
        c['revenue'] += r['revenue']
        c['reps'].add(r['rep'])
        if in_period(r['date'], 'ytd'):
            c['ytd'] += r['cases']
        if in_period(r['date'], 'pyYtd'):
            c['pyYtd'] += r['cases']
        if r['premise'] == 'On Premise':
            c['onAccts'].add(r['cust'])
            c['onCases'] += r['cases']
        elif r['premise'] == 'Off Premise':
            c['offAccts'].add(r['cust'])
            c['offCases'] += r['cases']
        if first_brand_order[(r['cust'], brand)] >= YTD_START:
            c['newAccts'].add(r['cust'])
    cities = []
    for city, c in city_map.items():
        n = len(c['accts'])
        cities.append({
            'city': city, 'buyers': n,
            'universeAccounts': city_universe.get(city, 0),
            'pctOfCityUniverse': round(n / city_universe[city] * 100, 1) if city_universe.get(city) else None,
            'reps': sorted(c['reps']),
            'repCount': len(c['reps']),
            'orders': c['orders'], 'cases': round(c['cases'], 2), 'revenue': round(c['revenue'], 2),
            'ordersPerAccount': round(c['orders'] / n, 2) if n else 0,
            'casesPerAccount': round(c['cases'] / n, 2) if n else 0,
            'velocity': round(c['cases'] / n / WINDOW_MONTHS, 3) if n and WINDOW_MONTHS > 0 else 0,
            'ytdCases': round(c['ytd'], 2), 'pyYtdCases': round(c['pyYtd'], 2),
            'ytdYoyPct': pct_change(c['ytd'], c['pyYtd']),
            'onBuyers': len(c['onAccts']), 'offBuyers': len(c['offAccts']),
            'onCases': round(c['onCases'], 2), 'offCases': round(c['offCases'], 2),
            'newPlacements': len(c['newAccts']),
        })
    cities.sort(key=lambda c: -c['cases'])

    # ---------- rep leaderboard (brand-scoped CORE + cases) ----------
    rep_map = defaultdict(lambda: {'buyers': 0, 'core': 0, 'cases': 0.0, 'ytd': 0.0,
                                   'pyYtd': 0.0, 'newPlacements': 0, 'orders': 0})
    for a in accounts:
        rm = rep_map[a['rep']]
        rm['buyers'] += 1
        rm['cases'] += a['cases']
        rm['ytd'] += a['ytdCases']
        rm['pyYtd'] += a['pyYtdCases']
        rm['orders'] += a['orders']
        if a['isCore']:
            rm['core'] += 1
        if a['newThisYear']:
            rm['newPlacements'] += 1
    reps = [{'rep': rep, 'buyers': o['buyers'], 'core': o['core'],
             'cases': round(o['cases'], 2), 'ytdCases': round(o['ytd'], 2),
             'pyYtdCases': round(o['pyYtd'], 2), 'ytdYoyPct': pct_change(o['ytd'], o['pyYtd']),
             'orders': o['orders'], 'newPlacements': o['newPlacements'],
             'coreRate': round(o['core'] / o['buyers'] * 100, 1) if o['buyers'] else 0}
            for rep, o in rep_map.items()]
    reps.sort(key=lambda r: -r['ytdCases'])

    velocity_leaders = sorted([a for a in accounts if a['orders'] >= 2], key=lambda a: -a['velocity'])[:25]

    # ---------- bottle vs. case: does first-order size predict repeat? ----------
    first_order_size = []
    for key, label in FIRST_ORDER_SEGMENTS:
        seg_accts = [a for a in accounts if a['firstOrderType'] == key]
        n = len(seg_accts)
        repeat_n = sum(1 for a in seg_accts if a['orders'] >= 2)
        first_order_size.append({
            'key': key, 'label': label, 'accounts': n, 'repeatAccounts': repeat_n,
            'repeatRate': round(repeat_n / n * 100, 1) if n else 0,
            'avgOrdersPerBuyer': round(sum(a['orders'] for a in seg_accts) / n, 2) if n else 0,
            'avgCasesPerBuyer': round(sum(a['cases'] for a in seg_accts) / n, 2) if n else 0,
        })

    return {
        'name': brand,
        'coreSkus': [PRODUCTS[p]['name'] for p in CORE_SKUS[brand]],
        'summary': {
            'buyers': buyers, 'orders': total_orders, 'cases': round(total_cases, 2),
            'revenue': round(total_revenue, 2),
            'universe': view_universe,
            'pctUniverse': round(buyers / view_universe * 100, 1) if view_universe else 0.0,
            'repeatAccounts': len(repeat_accounts),
            'repeatRate': round(len(repeat_accounts) / buyers * 100, 1) if buyers else 0,
            'avgOrdersPerBuyer': round(total_orders / buyers, 2) if buyers else 0,
            'avgCasesPerBuyer': round(total_cases / buyers, 2) if buyers else 0,
            'coreAccounts': len(core_accounts),
            'coreRate': round(len(core_accounts) / buyers * 100, 1) if buyers else 0,
            'nearCoreAccounts': len(near_core),
        },
        'performance': performance,
        'monthly': monthly,
        'newPlacements': new_placements,
        'retention': retention,
        'frequency': frequency,
        'skuStats': sku_stats,
        'areas': areas,
        'cities': cities,
        'reps': reps,
        # ID lists, resolved client-side against `accounts` -- these used to
        # embed whole account objects and tripled the payload size.
        'velocityLeaders': [a['id'] for a in velocity_leaders],
        'firstOrderSize': first_order_size,
        'coreAccounts': [a['id'] for a in core_accounts],
        'nearCoreAccounts': [a['id'] for a in sorted(near_core, key=lambda a: -a['cases'])],
        'accounts': accounts,
    }


def build_rep_matrix(rows_subset):
    """Rep x brand-line placement matrix: who has all four lines placed, who
    is missing one, and which accounts sit behind each gap."""
    line_keys = [l['key'] for l in BRAND_LINES]
    rep_acc = defaultdict(lambda: {
        'accounts': set(),
        'lines': {k: {'accounts': set(), 'cases': 0.0, 'ytdCases': 0.0} for k in line_keys},
        'cases': 0.0, 'ytdCases': 0.0,
    })
    acct_lines = defaultdict(set)          # cust -> lines placed
    acct_meta = {}
    for r in rows_subset:
        rm = rep_acc[r['rep']]
        rm['accounts'].add(r['cust'])
        rm['cases'] += r['cases']
        lk = rm['lines'][r['line']]
        lk['accounts'].add(r['cust'])
        lk['cases'] += r['cases']
        if in_period(r['date'], 'ytd'):
            rm['ytdCases'] += r['cases']
            lk['ytdCases'] += r['cases']
        acct_lines[r['cust']].add(r['line'])
        acct_meta[r['cust']] = r

    reps = []
    for rep, rm in rep_acc.items():
        lines = {}
        for k in line_keys:
            l = rm['lines'][k]
            lines[k] = {
                'accounts': len(l['accounts']),
                'cases': round(l['cases'], 2),
                'ytdCases': round(l['ytdCases'], 2),
                'has': len(l['accounts']) > 0,
                # accounts of this rep that buy the brand but NOT this line
                'missingAccounts': sorted(
                    ({'cust': c, 'name': acct_meta[c]['name'], 'city': acct_meta[c]['city'],
                      'premise': acct_meta[c]['premise']}
                     for c in rm['accounts'] if k not in acct_lines[c]),
                    key=lambda x: x['name']),
            }
        held = sum(1 for k in line_keys if lines[k]['has'])
        reps.append({
            'rep': rep, 'accounts': len(rm['accounts']),
            'cases': round(rm['cases'], 2), 'ytdCases': round(rm['ytdCases'], 2),
            'lines': lines, 'linesHeld': held,
            'missingLines': [k for k in line_keys if not lines[k]['has']],
        })
    reps.sort(key=lambda r: (-r['linesHeld'], -r['ytdCases']))

    summary = {str(i): sum(1 for r in reps if r['linesHeld'] == i) for i in range(5)}
    # Accounts carrying all four lines / missing exactly one, for the drilldown.
    acct_gap = []
    for cust, held in acct_lines.items():
        r = acct_meta[cust]
        acct_gap.append({
            'cust': cust, 'name': r['name'], 'rep': r['rep'], 'city': r['city'],
            'premise': r['premise'], 'linesHeld': len(held),
            'missing': [l['label'] for l in BRAND_LINES if l['key'] not in held],
        })
    acct_gap.sort(key=lambda a: (-a['linesHeld'], a['name']))
    return {'reps': reps, 'summary': summary, 'accounts': acct_gap,
            'accountSummary': {str(i): sum(1 for a in acct_gap if a['linesHeld'] == i)
                               for i in range(1, 5)}}


# City-level account universe, from the assigned W&S roster (cities are only
# known for accounts that have transacted at some point, so this is a floor,
# not a census -- surfaced as a caveat in the UI).
city_universe = defaultdict(int)
with open(ROSTER_CSV, newline='', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        c = (r['City'] or '').strip()
        if c and c != 'Unknown':
            city_universe[c] += 1

# Three parallel views, all sharing the same report window/products so
# they're a true apples-to-apples comparison: All accounts, On-Premise
# only, Off-Premise only. 'Unknown' (unmatched-to-roster) accounts are
# included in "all" but excluded from the on/off splits, same as the
# on/off-prem MPO dashboards do for their own premise breakdowns.
PREMISE_VIEWS = [('all', None), ('on', 'On Premise'), ('off', 'Off Premise')]

views = {}
for key, premise in PREMISE_VIEWS:
    subset = [r for r in rows if premise is None or r['premise'] == premise]
    view_universe = universe[key]
    views[key] = {
        'universe': view_universe,
        'brands': {b: build_brand_payload(b, subset, view_universe) for b in BRANDS},
        'repMatrix': build_rep_matrix(subset),
    }

payload = {
    'meta': {
        'windowStart': WINDOW_START.isoformat(), 'windowEnd': WINDOW_END.isoformat(),
        'windowMonths': round(WINDOW_MONTHS, 1),
        'totalRows': len(rows),
        'currentMonthLabel': month_label(CUR_MONTH),
        'priorMonthLabel': month_label(PRIOR_MONTH),
        'ytdLabel': f'{MONTH_NAMES[1]} 1 – {MONTH_NAMES[WINDOW_END.month]} {WINDOW_END.day}, {CUR_YEAR}',
        'pyYtdLabel': f'{MONTH_NAMES[1]} 1 – {MONTH_NAMES[PY_YTD_END.month]} {PY_YTD_END.day}, {CUR_YEAR - 1}',
        'currentMonthPartial': True,
        'trendRecentLabel': f'{month_label(TREND_RECENT[0])} – {month_label(TREND_RECENT[-1])}',
        'trendPriorLabel': f'{month_label(TREND_PRIOR[0])} – {month_label(TREND_PRIOR[-1])}',
    },
    'premiseCoverage': PREMISE_COVERAGE,
    'universe': universe,
    'brandLines': [{'key': l['key'], 'label': l['label'], 'brand': l['brand'],
                    'products': [PRODUCTS[p]['name'] for p in l['products'] if p in PRODUCTS]}
                   for l in BRAND_LINES],
    'views': views,
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
print(f"Account universe (assigned W&S roster): {universe['all']} "
      f"({universe['on']} on-premise, {universe['off']} off-premise)")
print(f"Window {WINDOW_START} – {WINDOW_END}; YTD {PERIODS['ytd'][0]} – {PERIODS['ytd'][1]}, "
      f"prior-year YTD {PERIODS['pyYtd'][0]} – {PERIODS['pyYtd'][1]}")

for b in BRANDS:
    bp = payload['views']['all']['brands'][b]
    s, p = bp['summary'], bp['performance']
    print(f"\n{b}: {s['buyers']} buyers ({s['pctUniverse']}% of universe), "
          f"{s['cases']:,.1f} cases, {s['orders']} orders")
    print(f"  YTD {p['ytd']['cases']:,.1f} cases vs PY YTD {p['pyYtd']['cases']:,.1f} "
          f"({p['yoy']['casesPct']}%) · {month_label(PRIOR_MONTH)} {p['priorMonth']['cases']:,.1f} cases "
          f"· {month_label(CUR_MONTH)} MTD {p['mtd']['cases']:,.1f} cases")
    print(f"  New placements YTD: {len(bp['newPlacements']['ytd'])}")
matrix = payload['views']['all']['repMatrix']
print(f"\nRep brand-line coverage: " + ", ".join(f"{k} of 4: {v} reps" for k, v in
                                                 sorted(matrix['summary'].items(), reverse=True)))
