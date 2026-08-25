#!/usr/bin/env python3
"""
Builds the embedded <script id="ws-data"> JSON inside wine-spirits/index.html --
the single, unified Wine & Spirits dashboard that replaced the two separate
pages (the "W&S Portfolio" distribution/margin dashboard and the "W&S Execution
Tracker" rep/account dashboard). Both old URLs now redirect here.

Usage (from this folder):
    python3 build_ws_dashboard.py

VOLUME IS ALWAYS CASES. The Encompass exports report "Units", which is the
selling unit and differs per item (a bottle for some items, a full case for
others). Every units figure is converted to cases IN THIS SCRIPT, at the
product level, before any aggregation -- so every KPI, chart, table, drilldown
and filter downstream is in cases and nothing user-facing reports units.
    cases = units / unitsPerCase[product]
`unitsPerCase` is derived per product from ws_invoice_trans.csv, which carries
BOTH a Cases and a Num Units column on every invoice line: the ratio is exact
and, as of the 2026-08 refresh, perfectly consistent within each product (188
products, no product with a conflicting ratio) and covers 100% of the products
in the monthly account file. Products with no invoice history fall back to
1 unit = 1 case and are listed in the run output.

Inputs (keep these filenames when re-exporting):
    ../wine-spirits-portfolio/ws_account_level_by_month.csv
        RDE "WS Account Level by Month" -- one row per (channel, product,
        customer) with Buyer Count + Units for every month from 2025/1 through
        the latest complete month. This is the volume/distribution engine:
        every case figure, buyer count, YTD window and account status comes
        from here.
    ../wine-spirits-portfolio/ws_invoice_trans.csv
        Encompass invoice transactions -- the only source with cost/price, so
        it drives the Margins panel (now reported per case) and the
        units-per-case ratios above.
    ws_l6_months.csv / ws_l90_days.csv
        RDE placement exports (already in cases) behind the Lost / At-Risk tab.
    ws_account_roster.csv
        The assigned W&S account book (customer, rep, city, route, premise) --
        the denominator for activation and "never bought", and the source of
        rep and city for every account. Extracted from the retired tracker's
        embedded data on 2026-08-25.

Period rules (no partial-vs-full comparisons anywhere):
    YTD            = Jan 1 of the latest year in the file through the latest
                     complete month in the file.
    Prior-Year YTD = exactly the same months one year earlier.
    Latest month / Prior month, each against the same month a year earlier.

Note: ws_brand_by_item.csv is deliberately NOT used any more. Its only content
was a full-calendar-2025 buyer count against a partial-2026 YTD buyer count --
the mismatched comparison this rebuild was asked to remove. Matched YTD buyer
counts are computed from the monthly file instead.

To refresh:
    1. Re-export the RDE/Encompass reports over the CSVs above (same filenames).
    2. Run: python3 build_ws_dashboard.py
    3. Commit and push.
"""
import csv
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
PORTFOLIO = os.path.join(HERE, '..', 'wine-spirits-portfolio')
ACCOUNT_MONTH_CSV = os.path.join(PORTFOLIO, 'ws_account_level_by_month.csv')
INVOICE_CSV = os.path.join(PORTFOLIO, 'ws_invoice_trans.csv')
ROSTER_CSV = os.path.join(HERE, 'ws_account_roster.csv')
L6_CSV = os.path.join(HERE, 'ws_l6_months.csv')
L90_CSV = os.path.join(HERE, 'ws_l90_days.csv')
HTML = os.path.join(HERE, 'index.html')

MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
LOST_WINDOW_DAYS = 60
GAP_MATRIX_FAMILIES = 12        # brand families shown in the rep x family matrix
MIN_CASES_FOR_MARGIN_WATCH = 12


def money(s):
    if s is None:
        return 0.0
    s = str(s).strip().replace('$', '').replace(',', '')
    if not s:
        return 0.0
    neg = s.startswith('(') and s.endswith(')')
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return 0.0
    return -v if neg else v


def num(s):
    if s is None or str(s).strip() == '':
        return 0.0
    s = str(s).strip().replace(',', '')
    neg = s.startswith('(') and s.endswith(')')
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return 0.0
    return -v if neg else v


def pct_change(now, prior):
    if prior:
        return round((now - prior) / abs(prior) * 100, 1)
    return None


def label_of(ym):
    return f'{MONTH_NAMES[ym[1]]} {ym[0]}'


def trend_of(now, prior):
    if now > prior:
        return 'up'
    if now < prior:
        return 'down'
    return 'flat'


# ---------------------------------------------------------------------------
# 1. Units -> cases conversion factors, straight from invoice transactions
# ---------------------------------------------------------------------------
prod_pat = re.compile(r'^\s*(\d+)\s+(.*)$')
ratio_votes = defaultdict(lambda: defaultdict(int))
with open(INVOICE_CSV, newline='', encoding='utf-8-sig') as f:
    invoice_rows = list(csv.DictReader(f))
for r in invoice_rows:
    m = prod_pat.match(r['Product'])
    if not m:
        continue
    cases, units = num(r['Cases']), num(r['Num Units'])
    if cases > 0 and units > 0:
        ratio_votes[m.group(1)][round(units / cases, 4)] += 1

UNITS_PER_CASE = {}
conflicting = []
for pnum, votes in ratio_votes.items():
    if len(votes) > 1:
        conflicting.append((pnum, dict(votes)))
    UNITS_PER_CASE[pnum] = max(votes.items(), key=lambda kv: kv[1])[0]


def to_cases(units, pnum):
    return units / UNITS_PER_CASE.get(pnum, 1.0)


# ---------------------------------------------------------------------------
# 2. Assigned account roster -- the universe, plus rep / city / premise
# ---------------------------------------------------------------------------
roster = {}
with open(ROSTER_CSV, newline='', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        cid = r['Customer Num'].strip()
        roster[cid] = {
            'cust': cid,
            'name': r['Customer Name'].strip(),
            'rep': r['Sales Rep Assigned'].strip() or 'Unassigned',
            'city': (r['City'].strip() or 'Unknown'),
            'route': r['Route'].strip(),
            'premise': r['On-Off Premise'].strip() or 'Unknown',
        }

# ---------------------------------------------------------------------------
# 3. Monthly account-level file -> the case model
# ---------------------------------------------------------------------------
with open(ACCOUNT_MONTH_CSV, newline='', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    header = next(reader)
    month_cols = {}
    pat = re.compile(r'(Buyer Count|Units)\s+(\d{4})/(\d{1,2})')
    for i, h in enumerate(header):
        m = pat.search(h)
        if not m:
            continue
        kind, ym = m.group(1), (int(m.group(2)), int(m.group(3)))
        b, u = month_cols.get(ym, (None, None))
        if kind == 'Buyer Count':
            b = i
        else:
            u = i
        month_cols[ym] = (b, u)
    ALL_MONTHS = sorted(month_cols)
    LATEST = ALL_MONTHS[-1]
    CUR_YEAR = LATEST[0]
    YTD_MONTHS = [ym for ym in ALL_MONTHS if ym[0] == CUR_YEAR and ym[1] <= LATEST[1]]
    PY_YTD_MONTHS = [(CUR_YEAR - 1, ym[1]) for ym in YTD_MONTHS]
    PY_YTD_MONTHS = [ym for ym in PY_YTD_MONTHS if ym in month_cols]
    PRIOR_MONTH = (CUR_YEAR - 1, 12) if LATEST[1] == 1 else (CUR_YEAR, LATEST[1] - 1)
    PY_LATEST = (LATEST[0] - 1, LATEST[1])
    PY_PRIOR_MONTH = (PRIOR_MONTH[0] - 1, PRIOR_MONTH[1])
    PRIOR_YEAR_ALL = [ym for ym in ALL_MONTHS if ym[0] == CUR_YEAR - 1]
    # "90-day" windows: the source data is monthly, so a trailing 90 days is
    # approximated as the last 3 calendar months, compared against the 3
    # months before that. Same approximation the retired portfolio page used.
    MONTHS_90D = ALL_MONTHS[-3:]
    MONTHS_PRIOR_90D = ALL_MONTHS[-6:-3]

    idx = {name: header.index(name) for name in
           ['On-Off Premise', 'Supplier', 'Brand', 'Brand Family', 'Product Num',
            'Product Name', 'Package', 'Customer ID', 'Customer Name', 'Shipping Address']}

    lines = []          # one per (channel, product, customer) with monthly cases
    for row in reader:
        if not row or len(row) < len(header):
            continue
        pnum = row[idx['Product Num']].strip()
        monthly = {}
        for ym in ALL_MONTHS:
            uidx = month_cols[ym][1]
            u = num(row[uidx]) if uidx is not None else 0.0
            if u:
                monthly[ym] = to_cases(u, pnum)
        if not monthly:
            continue
        lines.append({
            'channel': row[idx['On-Off Premise']].strip(),
            'supplier': row[idx['Supplier']].strip(),
            'brand': row[idx['Brand']].strip(),
            'family': row[idx['Brand Family']].strip(),
            'pnum': pnum,
            'pname': row[idx['Product Name']].strip(),
            'pkg': row[idx['Package']].strip(),
            'cust': row[idx['Customer ID']].strip(),
            'custName': row[idx['Customer Name']].strip(),
            'address': row[idx['Shipping Address']].strip(),
            'months': monthly,
        })

missing_ratio = sorted({l['pnum'] for l in lines if l['pnum'] not in UNITS_PER_CASE})

R12_MONTHS = ALL_MONTHS[-12:]
MONTH_LABELS = [label_of(ym) for ym in ALL_MONTHS]


def csum(months, keys):
    return sum(months.get(k, 0.0) for k in keys)


# ---------------------------------------------------------------------------
# 4. Account-level rollups, status, rep / city joins
# ---------------------------------------------------------------------------
acct = defaultdict(lambda: {
    'ytd': 0.0, 'pyYtd': 0.0, 'prior_year_all': 0.0, 'lifetime': 0.0,
    'latest': 0.0, 'priorMonth': 0.0,
    'monthsActive': set(), 'ytdMonths': set(), 'brandsYtd': set(), 'familiesYtd': set(),
    'skus': defaultdict(lambda: {'ytd': 0.0, 'pyYtd': 0.0, 'lifetime': 0.0,
                                 'months': set(), 'pname': '', 'family': '', 'brand': '',
                                 'pkg': '', 'channel': ''}),
    'name': '', 'channel': '',
})

for l in lines:
    a = acct[l['cust']]
    a['name'] = a['name'] or l['custName']
    a['channel'] = a['channel'] or l['channel']
    ytd = csum(l['months'], YTD_MONTHS)
    py = csum(l['months'], PY_YTD_MONTHS)
    a['ytd'] += ytd
    a['pyYtd'] += py
    a['prior_year_all'] += csum(l['months'], PRIOR_YEAR_ALL)
    a['lifetime'] += sum(l['months'].values())
    a['latest'] += l['months'].get(LATEST, 0.0)
    a['priorMonth'] += l['months'].get(PRIOR_MONTH, 0.0)
    for ym in l['months']:
        a['monthsActive'].add(ym)
        if ym in YTD_MONTHS:
            a['ytdMonths'].add(ym)
    if ytd > 0:
        a['brandsYtd'].add(l['brand'])
        a['familiesYtd'].add(l['family'])
    s = a['skus'][l['pnum']]
    s['pname'] = l['pname']
    s['family'] = l['family']
    s['brand'] = l['brand']
    s['pkg'] = l['pkg']
    s['channel'] = l['channel']
    s['ytd'] += ytd
    s['pyYtd'] += py
    s['lifetime'] += sum(l['months'].values())
    s['months'] |= set(l['months'])


def account_meta(cust, fallback_name='', fallback_channel=''):
    r = roster.get(cust)
    if r:
        return r['name'] or fallback_name, r['rep'], r['city'], r['premise'] or fallback_channel, r['route']
    return fallback_name, 'Unassigned', 'Unknown', fallback_channel or 'Unknown', ''


def status_of(ytd, prior_year, lifetime):
    if ytd > 0:
        return 'New' if prior_year <= 0 else 'Active'
    if prior_year > 0 or lifetime > 0:
        return 'Lapsed'
    return 'Never Bought'


accounts = []
seen = set()
for cust, a in acct.items():
    name, rep, city, premise, route = account_meta(cust, a['name'], a['channel'])
    seen.add(cust)
    skus = []
    for pnum, s in a['skus'].items():
        if s['lifetime'] <= 0:
            continue
        months = sorted(s['months'])
        # kept deliberately lean -- this list is embedded for ~900 accounts
        skus.append({
            'pname': s['pname'], 'family': s['family'], 'pkg': s['pkg'],
            'ytdCases': round(s['ytd'], 2), 'pyYtdCases': round(s['pyYtd'], 2),
            'yoyPct': pct_change(s['ytd'], s['pyYtd']),
            'monthsBought': len(months),
            'firstMonth': label_of(months[0]) if months else '',
            'lastMonth': label_of(months[-1]) if months else '',
        })
    skus.sort(key=lambda s: (-s['ytdCases'], -s['pyYtdCases']))
    accounts.append({
        'cust': cust, 'name': name, 'rep': rep, 'city': city, 'premise': premise,
        'status': status_of(a['ytd'], a['prior_year_all'], a['lifetime']),
        'ytdCases': round(a['ytd'], 2), 'pyYtdCases': round(a['pyYtd'], 2),
        'yoyPct': pct_change(a['ytd'], a['pyYtd']),
        'cases': round(a['lifetime'], 2),
        'latestCases': round(a['latest'], 2), 'priorMonthCases': round(a['priorMonth'], 2),
        'monthsBoughtYtd': len(a['ytdMonths']),
        'monthsBought': len(a['monthsActive']),
        'lastMonth': label_of(max(a['monthsActive'])) if a['monthsActive'] else '',
        'brandsYtd': sorted(a['brandsYtd']),
        'familiesYtd': sorted(a['familiesYtd']),
        'skuCount': len(skus),
        'skus': skus,
    })

# roster accounts that have never bought anything in the file
for cust, r in roster.items():
    if cust in seen:
        continue
    accounts.append({
        'cust': cust, 'name': r['name'], 'rep': r['rep'], 'city': r['city'],
        'premise': r['premise'], 'status': 'Never Bought',
        'ytdCases': 0.0, 'pyYtdCases': 0.0, 'yoyPct': None, 'cases': 0.0,
        'latestCases': 0.0, 'priorMonthCases': 0.0,
        'monthsBoughtYtd': 0, 'monthsBought': 0, 'lastMonth': '',
        'brandsYtd': [], 'familiesYtd': [], 'skuCount': 0, 'skus': [],
    })
accounts.sort(key=lambda a: -a['ytdCases'])
acct_by_cust = {a['cust']: a for a in accounts}

# ---------------------------------------------------------------------------
# 5. Distribution -- matched YTD vs prior-year YTD buyer counts
# ---------------------------------------------------------------------------
def buyer_rollup(key_fn, label_fields):
    """Roll lines up to some key, tracking YTD/PY-YTD buyer sets and cases."""
    acc = defaultdict(lambda: {'ytdBuyers': set(), 'pyBuyers': set(), 'lifetimeBuyers': set(),
                               'buyers90d': set(), 'buyersPrior90d': set(),
                               'ytd': 0.0, 'pyYtd': 0.0, 'cases': 0.0, 'latest': 0.0,
                               'priorMonth': 0.0, 'cases90d': 0.0, 'fields': None, 'items': set()})
    for l in lines:
        k = key_fn(l)
        d = acc[k]
        if d['fields'] is None:
            d['fields'] = {f: l[f] for f in label_fields}
        d['items'].add(l['pnum'])
        ytd = csum(l['months'], YTD_MONTHS)
        py = csum(l['months'], PY_YTD_MONTHS)
        d['ytd'] += ytd
        d['pyYtd'] += py
        d['cases'] += sum(l['months'].values())
        d['latest'] += l['months'].get(LATEST, 0.0)
        d['priorMonth'] += l['months'].get(PRIOR_MONTH, 0.0)
        if sum(l['months'].values()) > 0:
            d['lifetimeBuyers'].add(l['cust'])
        if ytd > 0:
            d['ytdBuyers'].add(l['cust'])
        if py > 0:
            d['pyBuyers'].add(l['cust'])
        c90 = csum(l['months'], MONTHS_90D)
        if c90 > 0:
            d['buyers90d'].add(l['cust'])
            d['cases90d'] += c90
        if csum(l['months'], MONTHS_PRIOR_90D) > 0:
            d['buyersPrior90d'].add(l['cust'])
    return acc


def dist_rows(acc, extra=None):
    out = []
    for k, d in acc.items():
        gained = d['ytdBuyers'] - d['pyBuyers']
        lost = d['pyBuyers'] - d['ytdBuyers']
        row = dict(d['fields'])
        row.update({
            'ytdBuyers': len(d['ytdBuyers']), 'pyYtdBuyers': len(d['pyBuyers']),
            'buyerChange': len(d['ytdBuyers']) - len(d['pyBuyers']),
            'buyerPct': pct_change(len(d['ytdBuyers']), len(d['pyBuyers'])),
            'gained': len(gained), 'lost': len(lost),
            'retained': len(d['ytdBuyers'] & d['pyBuyers']),
            'trend': trend_of(len(d['ytdBuyers']), len(d['pyBuyers'])),
            'ytdCases': round(d['ytd'], 2), 'pyYtdCases': round(d['pyYtd'], 2),
            'casesPct': pct_change(d['ytd'], d['pyYtd']),
            'cases': round(d['cases'], 2),
            'latestCases': round(d['latest'], 2), 'priorMonthCases': round(d['priorMonth'], 2),
            'itemCount': len(d['items']),
            'lifetimeBuyers': len(d['lifetimeBuyers']),
            'buyers90d': len(d['buyers90d']),
            'buyersPrior90d': len(d['buyersPrior90d']),
            'buyers90dChange': len(d['buyers90d']) - len(d['buyersPrior90d']),
            'cases90d': round(d['cases90d'], 2),
            'gainedAccounts': sorted(acct_by_cust[c]['name'] for c in gained)[:40],
            'lostAccounts': sorted(acct_by_cust[c]['name'] for c in lost)[:40],
        })
        if extra:
            extra(row, d)
        out.append(row)
    return out


item_acc = buyer_rollup(lambda l: (l['channel'], l['pnum']),
                        ['channel', 'supplier', 'brand', 'family', 'pnum', 'pname', 'pkg'])
distribution = dist_rows(item_acc)
distribution.sort(key=lambda r: -r['ytdBuyers'])

family_acc = buyer_rollup(lambda l: l['family'], ['family', 'supplier'])
families = dist_rows(family_acc)
families.sort(key=lambda r: -r['ytdCases'])

brand_acc = buyer_rollup(lambda l: l['brand'], ['brand', 'family', 'supplier'])
brands = dist_rows(brand_acc)
brands.sort(key=lambda r: -r['ytdCases'])

MIN_BASE_FOR_PCT = 3        # ignore 1->2 style noise in the % leaderboards
movers = {
    'gainers': sorted([f for f in families if f['buyerChange'] > 0],
                      key=lambda f: -f['buyerChange'])[:12],
    'losers': sorted([f for f in families if f['buyerChange'] < 0],
                     key=lambda f: f['buyerChange'])[:12],
    'fastest': sorted([f for f in families if f['buyerPct'] is not None
                       and f['buyerChange'] > 0 and f['pyYtdBuyers'] >= MIN_BASE_FOR_PCT],
                      key=lambda f: -f['buyerPct'])[:12],
    'declining': sorted([f for f in families if f['buyerPct'] is not None
                         and f['buyerChange'] < 0 and f['pyYtdBuyers'] >= MIN_BASE_FOR_PCT],
                        key=lambda f: f['buyerPct'])[:12],
    'minBase': MIN_BASE_FOR_PCT,
}

# ---------------------------------------------------------------------------
# 6. Rep performance & activation
# ---------------------------------------------------------------------------
rep_accounts = defaultdict(list)
for a in accounts:
    rep_accounts[a['rep']].append(a)

reps = []
for rep, accs in rep_accounts.items():
    assigned = len(accs)
    activated = [a for a in accs if a['ytdCases'] > 0]
    activated_py = [a for a in accs if a['pyYtdCases'] > 0]
    new_buyers = [a for a in accs if a['status'] == 'New']
    lapsed = [a for a in accs if a['status'] == 'Lapsed']
    never = [a for a in accs if a['status'] == 'Never Bought']
    ytd = sum(a['ytdCases'] for a in accs)
    py = sum(a['pyYtdCases'] for a in accs)
    fams = set()
    for a in accs:
        fams |= set(a['familiesYtd'])
    reps.append({
        'rep': rep, 'assignedAccounts': assigned,
        'activatedYtd': len(activated), 'activatedPyYtd': len(activated_py),
        'pctActivatedYtd': round(len(activated) / assigned * 100, 1) if assigned else 0.0,
        'activationChange': len(activated) - len(activated_py),
        'newBuyers': len(new_buyers), 'lapsed': len(lapsed), 'neverBought': len(never),
        'pctNeverBought': round(len(never) / assigned * 100, 1) if assigned else 0.0,
        'ytdCases': round(ytd, 2), 'pyYtdCases': round(py, 2),
        'casesPct': pct_change(ytd, py),
        'casesChange': round(ytd - py, 2),
        'familiesPlaced': len(fams),
        'casesPerActiveAccount': round(ytd / len(activated), 2) if activated else 0.0,
    })
reps.sort(key=lambda r: -r['ytdCases'])

# ---------------------------------------------------------------------------
# 7. By city
# ---------------------------------------------------------------------------
city_acc = defaultdict(lambda: {'assigned': 0, 'ytdBuyers': 0, 'pyBuyers': 0, 'never': 0,
                                'ytd': 0.0, 'pyYtd': 0.0, 'reps': set(), 'new': 0, 'lapsed': 0,
                                'onAssigned': 0, 'offAssigned': 0, 'onYtd': 0.0, 'offYtd': 0.0,
                                'onBuyers': 0, 'offBuyers': 0})
for a in accounts:
    c = city_acc[a['city']]
    c['assigned'] += 1
    c['reps'].add(a['rep'])
    c['ytd'] += a['ytdCases']
    c['pyYtd'] += a['pyYtdCases']
    if a['ytdCases'] > 0:
        c['ytdBuyers'] += 1
    if a['pyYtdCases'] > 0:
        c['pyBuyers'] += 1
    if a['status'] == 'Never Bought':
        c['never'] += 1
    if a['status'] == 'New':
        c['new'] += 1
    if a['status'] == 'Lapsed':
        c['lapsed'] += 1
    if a['premise'] == 'On Premise':
        c['onAssigned'] += 1
        c['onYtd'] += a['ytdCases']
        if a['ytdCases'] > 0:
            c['onBuyers'] += 1
    elif a['premise'] == 'Off Premise':
        c['offAssigned'] += 1
        c['offYtd'] += a['ytdCases']
        if a['ytdCases'] > 0:
            c['offBuyers'] += 1

cities = []
for city, c in city_acc.items():
    cities.append({
        'city': city, 'assignedAccounts': c['assigned'],
        'ytdBuyers': c['ytdBuyers'], 'pyYtdBuyers': c['pyBuyers'],
        'buyerChange': c['ytdBuyers'] - c['pyBuyers'],
        'pctActivated': round(c['ytdBuyers'] / c['assigned'] * 100, 1) if c['assigned'] else 0.0,
        'neverBought': c['never'], 'newBuyers': c['new'], 'lapsed': c['lapsed'],
        'ytdCases': round(c['ytd'], 2), 'pyYtdCases': round(c['pyYtd'], 2),
        'casesPct': pct_change(c['ytd'], c['pyYtd']),
        'casesPerBuyer': round(c['ytd'] / c['ytdBuyers'], 2) if c['ytdBuyers'] else 0.0,
        'reps': sorted(c['reps']), 'repCount': len(c['reps']),
        'onAssigned': c['onAssigned'], 'offAssigned': c['offAssigned'],
        'onBuyers': c['onBuyers'], 'offBuyers': c['offBuyers'],
        'onYtdCases': round(c['onYtd'], 2), 'offYtdCases': round(c['offYtd'], 2),
    })
cities.sort(key=lambda c: -c['ytdCases'])

# ---------------------------------------------------------------------------
# 8. Placement gaps -- rep x brand family, plus par level
# ---------------------------------------------------------------------------
fam_rep = defaultdict(lambda: defaultdict(lambda: {'buyers': set(), 'ytd': 0.0}))
for l in lines:
    ytd = csum(l['months'], YTD_MONTHS)
    a = acct_by_cust.get(l['cust'])
    rep = a['rep'] if a else 'Unassigned'
    d = fam_rep[l['family']][rep]
    if ytd > 0:
        d['buyers'].add(l['cust'])
        d['ytd'] += ytd

rep_names = sorted(rep_accounts)
family_names = [f['family'] for f in families if f['family']]
top_families = [f['family'] for f in families[:GAP_MATRIX_FAMILIES] if f['family']]

par_rows = []
par_family = []
for fam in family_names:
    per_rep = fam_rep.get(fam, {})
    total_buyers = sum(len(d['buyers']) for d in per_rep.values())
    par = round(total_buyers / len(rep_names), 1) if rep_names else 0.0
    par_family.append({'family': fam, 'parLevel': par, 'totalBuyers': total_buyers})
    for rep in rep_names:
        d = per_rep.get(rep)
        buyers = len(d['buyers']) if d else 0
        gap = round(buyers - par, 1)
        par_rows.append({
            'rep': rep, 'family': fam, 'ytdBuyers': buyers,
            'ytdCases': round(d['ytd'], 2) if d else 0.0,
            'parLevel': par, 'gap': gap,
            'status': 'At/Above Par' if gap >= 0 else 'Below Par',
        })
par_family.sort(key=lambda p: -p['parLevel'])

matrix = []
for rep in rep_names:
    cells = {}
    for fam in top_families:
        d = fam_rep.get(fam, {}).get(rep)
        buyers = len(d['buyers']) if d else 0
        cells[fam] = {
            'buyers': buyers,
            'ytdCases': round(d['ytd'], 2) if d else 0.0,
            'has': buyers > 0,
        }
    held = sum(1 for f in top_families if cells[f]['has'])
    # The accounts behind every gap for this rep are the same list whichever
    # family is missing -- stored once per rep rather than once per empty cell.
    open_accounts = sorted(
        ({'name': a['name'], 'city': a['city'], 'premise': a['premise'], 'ytdCases': a['ytdCases']}
         for a in rep_accounts[rep] if a['ytdCases'] > 0),
        key=lambda x: -x['ytdCases'])[:25]
    matrix.append({
        'rep': rep, 'cells': cells, 'familiesHeld': held,
        'missing': [f for f in top_families if not cells[f]['has']],
        'openAccounts': open_accounts,
        'buyingAccounts': sum(1 for a in rep_accounts[rep] if a['ytdCases'] > 0),
        'assignedAccounts': len(rep_accounts[rep]),
        'ytdCases': round(sum(a['ytdCases'] for a in rep_accounts[rep]), 2),
    })
matrix.sort(key=lambda r: (-r['familiesHeld'], -r['ytdCases']))

missing_by_family = sorted(
    ({'family': fam, 'repsMissing': sum(1 for r in matrix if fam in r['missing'])}
     for fam in top_families), key=lambda x: -x['repsMissing'])
gap_summary = {
    'families': top_families,
    'allHeld': sum(1 for r in matrix if r['familiesHeld'] == len(top_families)),
    'mostlyHeld': sum(1 for r in matrix if r['familiesHeld'] >= len(top_families) * 2 / 3),
    'halfOrLess': sum(1 for r in matrix if r['familiesHeld'] <= len(top_families) / 2),
    'openGaps': sum(len(r['missing']) for r in matrix),
    'medianHeld': sorted(r['familiesHeld'] for r in matrix)[len(matrix) // 2] if matrix else 0,
    'byFamily': missing_by_family,
    'belowPar': sum(1 for p in par_rows if p['status'] == 'Below Par'),
    'totalCombos': len(par_rows),
}

# ---------------------------------------------------------------------------
# 9. Lost placements (already in cases) + at-risk accounts
# ---------------------------------------------------------------------------
def load_rows(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


placement_rows = {}
for path in (L6_CSV, L90_CSV):
    for r in load_rows(path):
        pc_col = next(c for c in r if c.startswith('Placement Count'))
        cs_col = next(c for c in r if c.startswith('Cases'))
        key = (r['Customer Num'], r['Product Num'], r['Load Sheet Date'], r[pc_col], r[cs_col])
        placement_rows[key] = (r, cs_col)

pairs = defaultdict(lambda: {'dates': [], 'cases': 0.0, 'row': None})
all_dates = []
for (cust, pnum, dstr, _pc, _cs), (r, cs_col) in placement_rows.items():
    d = datetime.strptime(dstr, '%m/%d/%Y').date()
    all_dates.append(d)
    p = pairs[(cust, pnum)]
    p['dates'].append(d)
    p['cases'] += num(r[cs_col])
    p['row'] = r

anchor = max(all_dates)
cutoff = anchor - timedelta(days=LOST_WINDOW_DAYS)
lost_placements = []
for (cust, pnum), p in pairs.items():
    last = max(p['dates'])
    if last >= cutoff:
        continue
    r = p['row']
    a = acct_by_cust.get(cust)
    lost_placements.append({
        'rep': r['Sales Rep Assigned'].strip(), 'district': r['District Manager'].strip(),
        'cust': cust, 'name': r['Customer Name'].strip(),
        'city': a['city'] if a else 'Unknown',
        'premise': a['premise'] if a else 'Unknown',
        'productNum': pnum, 'product': r['Product Name'].strip(),
        'lastOrderDate': last.isoformat(), 'daysSince': (anchor - last).days,
        'cases': round(p['cases'], 2),
    })
lost_placements.sort(key=lambda x: -x['daysSince'])

lost_by_rep = defaultdict(lambda: {'tracked': 0, 'lost': 0, 'cases': 0.0})
for (cust, pnum), p in pairs.items():
    rep = p['row']['Sales Rep Assigned'].strip()
    lost_by_rep[rep]['tracked'] += 1
    if max(p['dates']) < cutoff:
        lost_by_rep[rep]['lost'] += 1
        lost_by_rep[rep]['cases'] += p['cases']
lost_rep_rows = [{'rep': rep, 'tracked': d['tracked'], 'lost': d['lost'],
                  'cases': round(d['cases'], 2),
                  'pctLost': round(d['lost'] / d['tracked'] * 100, 1) if d['tracked'] else 0.0}
                 for rep, d in lost_by_rep.items()]
lost_rep_rows.sort(key=lambda r: -r['lost'])

lost_overview = {
    'anchorDate': anchor.isoformat(), 'cutoffDate': cutoff.isoformat(),
    'windowDays': LOST_WINDOW_DAYS,
    'totalTracked': len(pairs), 'totalLost': len(lost_placements),
    'pctLost': round(len(lost_placements) / len(pairs) * 100, 1) if pairs else 0.0,
    'distinctAccountsLost': len({p['cust'] for p in lost_placements}),
    'distinctProductsLost': len({p['productNum'] for p in lost_placements}),
    'casesLost': round(sum(p['cases'] for p in lost_placements), 2),
}

DECLINE_THRESHOLD = -25.0
at_risk = [a for a in accounts
           if a['pyYtdCases'] > 0 and a['ytdCases'] > 0
           and a['yoyPct'] is not None and a['yoyPct'] <= DECLINE_THRESHOLD]
at_risk.sort(key=lambda a: a['ytdCases'] - a['pyYtdCases'])

# ---------------------------------------------------------------------------
# 10. Margins -- per case, from invoice transactions
# ---------------------------------------------------------------------------
margin_acc = defaultdict(lambda: {'fields': None, 'cases': 0.0, 'revenue': 0.0, 'cost': 0.0,
                                  'discount': 0.0, 'units': 0.0})
invoice_dates = []
skipped_zero_price_rows = 0
for row in invoice_rows:
    unit_price = money(row['Unit Price'])
    ext_price = money(row['Ext Price'])
    # Both $0 Unit Price and $0 Ext Price = load-sheet/inventory movement, not a
    # paid sale. Counting laid-in cost against zero revenue produces nonsense
    # margin %, so these are excluded (same rule the portfolio dashboard used).
    if unit_price == 0 and ext_price == 0:
        skipped_zero_price_rows += 1
        continue
    m = prod_pat.match(row['Product'].strip())
    pnum, pname = (m.group(1), m.group(2)) if m else ('', row['Product'].strip())
    key = (row['Segment'].strip(), row['Supplier'].strip(), row['Brand'].strip(), pnum, row['Package'].strip())
    a = margin_acc[key]
    if a['fields'] is None:
        a['fields'] = {'segment': row['Segment'].strip(), 'supplier': row['Supplier'].strip(),
                       'brand': row['Brand'].strip(), 'family': row['Brand Family'].strip(),
                       'pnum': pnum, 'pname': pname, 'pkg': row['Package'].strip()}
    units = num(row['Num Units'])
    cases = num(row['Cases'])
    if not cases and units:
        cases = to_cases(units, pnum)
    a['units'] += units
    a['cases'] += cases
    a['revenue'] += ext_price
    a['cost'] += money(row['Laid-in Cost']) * units
    a['discount'] += money(row['Discount']) * units
    invoice_dates.append(row['Load Sheet Date'].strip())

margins = []
for key, a in margin_acc.items():
    cases = a['cases']
    revenue = a['revenue']
    cost = a['cost']
    row = dict(a['fields'])
    row.update({
        'cases': round(cases, 2),
        'revenue': round(revenue, 2),
        'avgCasePrice': round(revenue / cases, 2) if cases else 0.0,
        'avgLaidInCostPerCase': round(cost / cases, 2) if cases else 0.0,
        'marginPerCase': round((revenue - cost) / cases, 2) if cases else 0.0,
        'marginPct': round((revenue - cost) / revenue * 100, 1) if revenue else 0.0,
        'marginTotal': round(revenue - cost, 2),
        'avgDiscountPerCase': round(a['discount'] / cases, 2) if cases else 0.0,
    })
    margins.append(row)
margins.sort(key=lambda r: -r['revenue'])


def parse_mdy(s):
    mm, dd, yy = s.split('/')
    return (int(yy), int(mm), int(dd))


invoice_dt = sorted([d for d in invoice_dates if d], key=parse_mdy)

fam_margin = defaultdict(lambda: {'revenue': 0.0, 'cost': 0.0, 'cases': 0.0})
for m in margins:
    fm = fam_margin[m['family']]
    fm['revenue'] += m['revenue']
    fm['cost'] += m['avgLaidInCostPerCase'] * m['cases']
    fm['cases'] += m['cases']
family_margin = [{
    'family': fam, 'revenue': round(v['revenue'], 2), 'cases': round(v['cases'], 2),
    'marginPct': round((v['revenue'] - v['cost']) / v['revenue'] * 100, 1) if v['revenue'] else 0.0,
    'marginTotal': round(v['revenue'] - v['cost'], 2),
} for fam, v in fam_margin.items() if fam]
margin_watch = sorted([f for f in family_margin if f['cases'] >= MIN_CASES_FOR_MARGIN_WATCH],
                      key=lambda f: f['marginPct'])[:8]
top_revenue_families = sorted(family_margin, key=lambda f: -f['revenue'])[:8]

# ---------------------------------------------------------------------------
# 11. Company-wide overview
# ---------------------------------------------------------------------------
monthly_totals = defaultdict(float)
monthly_buyers = defaultdict(set)
for l in lines:
    for ym, c in l['months'].items():
        monthly_totals[ym] += c
        monthly_buyers[ym].add(l['cust'])
monthly = [{'ym': f'{y}-{m:02d}', 'label': label_of((y, m)),
            'cases': round(monthly_totals.get((y, m), 0.0), 2),
            'buyers': len(monthly_buyers.get((y, m), ()))}
           for (y, m) in ALL_MONTHS]

ytd_cases = sum(a['ytdCases'] for a in accounts)
py_ytd_cases = sum(a['pyYtdCases'] for a in accounts)
ytd_buyers = sum(1 for a in accounts if a['ytdCases'] > 0)
py_ytd_buyers = sum(1 for a in accounts if a['pyYtdCases'] > 0)
latest_cases = sum(a['latestCases'] for a in accounts)
prior_month_cases = sum(a['priorMonthCases'] for a in accounts)
py_latest_cases = sum(csum(l['months'], [PY_LATEST]) for l in lines)
py_prior_month_cases = sum(csum(l['months'], [PY_PRIOR_MONTH]) for l in lines)

status_counts = defaultdict(int)
for a in accounts:
    status_counts[a['status']] += 1

overview = {
    'ytdLabel': f'{MONTH_NAMES[YTD_MONTHS[0][1]]}–{MONTH_NAMES[LATEST[1]]} {CUR_YEAR}',
    'pyYtdLabel': f'{MONTH_NAMES[YTD_MONTHS[0][1]]}–{MONTH_NAMES[LATEST[1]]} {CUR_YEAR - 1}',
    'latestMonthLabel': label_of(LATEST),
    'priorMonthLabel': label_of(PRIOR_MONTH),
    'ytdCases': round(ytd_cases, 2), 'pyYtdCases': round(py_ytd_cases, 2),
    'casesPct': pct_change(ytd_cases, py_ytd_cases),
    'casesChange': round(ytd_cases - py_ytd_cases, 2),
    'latestMonthCases': round(latest_cases, 2),
    'latestMonthYoyPct': pct_change(latest_cases, py_latest_cases),
    'priorMonthCases': round(prior_month_cases, 2),
    'priorMonthYoyPct': pct_change(prior_month_cases, py_prior_month_cases),
    'momPct': pct_change(latest_cases, prior_month_cases),
    'ytdBuyers': ytd_buyers, 'pyYtdBuyers': py_ytd_buyers,
    'buyerChange': ytd_buyers - py_ytd_buyers,
    'buyerPct': pct_change(ytd_buyers, py_ytd_buyers),
    'assignedAccounts': len(accounts),
    'pctActivated': round(ytd_buyers / len(accounts) * 100, 1) if accounts else 0.0,
    'newBuyers': status_counts['New'], 'lapsed': status_counts['Lapsed'],
    'neverBought': status_counts['Never Bought'], 'active': status_counts['Active'],
    'pctNeverBought': round(status_counts['Never Bought'] / len(accounts) * 100, 1) if accounts else 0.0,
    'repCount': len(rep_names),
    'familyCount': len(family_names),
    'brandCount': len({l['brand'] for l in lines if l['brand']}),
    'itemCount': len({(l['channel'], l['pnum']) for l in lines}),
    'supplierCount': len({l['supplier'] for l in lines if l['supplier']}),
    'gainingItems': sum(1 for d in distribution if d['trend'] == 'up'),
    'decliningItems': sum(1 for d in distribution if d['trend'] == 'down'),
    'accountsGained': sum(1 for a in accounts if a['status'] == 'New'),
    'accountsLost': sum(1 for a in accounts if a['status'] == 'Lapsed'),
    'totalRevenue': round(sum(m['revenue'] for m in margins), 2),
    'totalMargin': round(sum(m['marginTotal'] for m in margins), 2),
    'overallMarginPct': round(sum(m['marginTotal'] for m in margins) /
                              sum(m['revenue'] for m in margins) * 100, 1) if margins else 0.0,
    'invoiceCases': round(sum(m['cases'] for m in margins), 2),
    'invoiceDateMin': invoice_dt[0] if invoice_dt else None,
    'invoiceDateMax': invoice_dt[-1] if invoice_dt else None,
    'topRevenueFamilies': top_revenue_families,
    'marginWatch': margin_watch,
    'lostPlacements': lost_overview['totalLost'],
    'atRisk': len(at_risk),
}

data = {
    'meta': {
        'monthLabels': MONTH_LABELS,
        'r12Labels': [label_of(ym) for ym in R12_MONTHS],
        'latestMonth': label_of(LATEST),
        'priorMonth': label_of(PRIOR_MONTH),
        'months90d': [label_of(ym) for ym in MONTHS_90D],
        'monthsPrior90d': [label_of(ym) for ym in MONTHS_PRIOR_90D],
        'ytdMonths': [label_of(ym) for ym in YTD_MONTHS],
        'pyYtdMonths': [label_of(ym) for ym in PY_YTD_MONTHS],
        'productsMissingCaseRatio': missing_ratio,
        'conflictingCaseRatios': [c[0] for c in conflicting],
        'declineThreshold': DECLINE_THRESHOLD,
    },
    'overview': overview,
    'monthly': monthly,
    'distribution': distribution,
    'families': families,
    'brands': brands,
    'movers': movers,
    'reps': reps,
    'accounts': accounts,
    'cities': cities,
    'gapMatrix': matrix,
    'gapSummary': gap_summary,
    'parRows': par_rows,
    'parFamilies': par_family,
    'lostPlacements': lost_placements,
    'lostByRep': lost_rep_rows,
    'lostOverview': lost_overview,
    'atRisk': [{k: v for k, v in a.items() if k != 'skus'} for a in at_risk],
    'margins': margins,
    'suppliers': sorted({l['supplier'] for l in lines if l['supplier']}),
    'brandFamilies': sorted(set(family_names)),
    'repNames': rep_names,
}

blob = json.dumps(data, separators=(',', ':'))
html = open(HTML, encoding='utf-8').read()
m = re.search(r'(<script id="ws-data" type="application/json">)(.*?)(</script>)', html, re.S)
assert m, 'ws-data script tag not found in index.html'
open(HTML, 'w', encoding='utf-8').write(html[:m.start(2)] + blob + html[m.end(2):])

print(f'Months in file: {label_of(ALL_MONTHS[0])} – {label_of(LATEST)}')
print(f'YTD window: {overview["ytdLabel"]} vs {overview["pyYtdLabel"]}')
print(f'Units->cases ratios: {len(UNITS_PER_CASE)} products '
      f'({len(conflicting)} with conflicting ratios, {len(missing_ratio)} products with no invoice history)')
if missing_ratio:
    print('  no ratio (defaulted to 1 unit = 1 case): ' + ', '.join(missing_ratio))
print(f'Accounts: {len(accounts)} assigned ({overview["active"]} active, {overview["newBuyers"]} new, '
      f'{overview["lapsed"]} lapsed, {overview["neverBought"]} never bought)')
print(f'YTD cases: {overview["ytdCases"]:,.1f} vs {overview["pyYtdCases"]:,.1f} prior-year YTD '
      f'({overview["casesPct"]}%)')
print(f'YTD buying accounts: {ytd_buyers} vs {py_ytd_buyers} ({overview["buyerPct"]}%)')
print(f'Distribution rows: {len(distribution)} items, {len(families)} brand families, {len(brands)} brands')
print(f'Reps: {len(reps)} · Cities: {len(cities)} · Lost placements: {lost_overview["totalLost"]} '
      f'of {lost_overview["totalTracked"]} tracked ({lost_overview["pctLost"]}%)')
print(f'At-risk accounts (YTD cases down {DECLINE_THRESHOLD}% or worse): {len(at_risk)}')
print(f'Margin rows: {len(margins)} · skipped zero-price invoice rows: {skipped_zero_price_rows}')
print(f'Payload: {len(blob):,} bytes')
