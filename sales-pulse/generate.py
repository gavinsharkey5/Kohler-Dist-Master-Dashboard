"""Build the manager Sales Pulse from monthly volume; never read money exports.

Run python sales-pulse/generate.py after refreshing rolling-distribution's master.
YTD placements/buyers are distinct net-positive pairs/accounts across the window,
not sums of monthly counts. Current active account geography takes precedence;
historical customers absent from that file retain the master's geography.
"""
import calendar
import csv
import json
import sys
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import customer_base

MASTER = ROOT / 'rolling-distribution/data/master'
INTERNAL = {5, 6, 7, 8, 9, 25, 120022}
SCOPES = ('core', 'southern', 'other', 'total')


def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def cents(value):
    return int((Decimal(value or '0') * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def add_month(target, rows):
    for pair, value in rows.items():
        target[pair] += value


def measures(pairs, customers, products, first, start, end):
    result = {}
    for scope in SCOPES:
        accounts, brands = defaultdict(int), defaultdict(int)
        total, placements = 0, 0
        for (product, account), value in pairs.items():
            if scope != 'total' and customers[account]['scope'] != scope:
                continue
            total += value
            accounts[account] += value
            brands[products[product]['family'] or '(Unmapped Brand Family)'] += value
            placements += value > 0
        buyers = {a for a, value in accounts.items() if value > 0}
        new = {a for a in buyers if first.get(a) and start <= first[a] <= end}
        result[scope] = {'cases': total / 100, 'placements': placements,
                         'buying_accounts': len(buyers), 'new_buying_accounts': len(new),
                         'accounts': dict(accounts), 'brands': dict(brands)}
    return result


def movements(now, before, names=None):
    rows = []
    for key in now.keys() | before.keys():
        cur, prior = now.get(key, 0) / 100, before.get(key, 0) / 100
        delta = round(cur - prior, 2)
        if delta:
            rows.append({'name': names[key]['name'] if names else key,
                         'id': str(key), 'current': cur, 'prior': prior, 'change': delta})
    return {'up': sorted((r for r in rows if r['change'] > 0), key=lambda r: (-r['change'], r['name']))[:10],
            'down': sorted((r for r in rows if r['change'] < 0), key=lambda r: (r['change'], r['name']))[:10]}


def build(master=MASTER, active=None):
    sources = json.loads((master / 'sources.json').read_text(encoding='utf-8'))
    products = {int(p['product_num']): p for p in read_csv(master / 'products.csv')}
    customers = {int(a['customer_num']): a for a in read_csv(master / 'customers.csv')}
    active = customer_base.load() if active is None else active
    active_by_id = {int(a['num']): a for a in active}
    for number, a in customers.items():
        current = active_by_id.get(number)
        area, county = (current['area'], current['county']) if current else (a['area'], a['county'])
        a['scope'] = customer_base.territory(area, county) or 'other'
    months, first_positive, excluded = {}, {}, 0
    for path in sorted((master / 'months').glob('20??-??.csv')):
        month = path.stem
        if month not in sources:
            raise ValueError(f'Missing month metadata: {month}')
        if sources[month].get('partial') is not False:
            continue
        pairs, account_total = defaultdict(int), defaultdict(int)
        for row in read_csv(path):
            product, account = int(row['product_num']), int(row['customer_num'])
            if account in INTERNAL:
                excluded += 1
                continue
            if product not in products or account not in customers:
                raise ValueError(f'Unknown product/account in {month}: {product}/{account}')
            # Finance charges are not physical beverage sales.
            if products[product]['name'].lower().find('finance charge') >= 0:
                excluded += 1
                continue
            value = cents(row['cases'])
            pairs[(product, account)] += value
            account_total[account] += value
        months[month] = dict(pairs)
        for account, value in account_total.items():
            if value > 0:
                first_positive.setdefault(account, month)
    if not months:
        raise ValueError('No complete sales months')
    history_start, latest = min(months), max(months)
    # Accounts already buying at the left edge have an unknown first purchase.
    first = {a: month for a, month in first_positive.items() if month != history_start}
    year = int(latest[:4])
    periods, trend = {}, []
    for end in sorted(m for m in months if int(m[:4]) == year):
        prior_end = f'{year-1}{end[4:]}'
        if prior_end not in months:
            continue
        for mode in ('month', 'ytd'):
            count = int(end[5:]) if mode == 'ytd' else 1
            current_keys = [f'{year}-{n:02}' for n in range(1, count+1)] if mode == 'ytd' else [end]
            prior_keys = [f'{year-1}-{n:02}' for n in range(1, count+1)] if mode == 'ytd' else [prior_end]
            if any(m not in months for m in current_keys + prior_keys):
                continue
            current, prior = defaultdict(int), defaultdict(int)
            for m in current_keys:
                add_month(current, months[m])
            for m in prior_keys:
                add_month(prior, months[m])
            now = measures(current, customers, products, first, current_keys[0], end)
            before = measures(prior, customers, products, first, prior_keys[0], prior_end)
            scopes = {}
            for scope in SCOPES:
                a, b = now[scope], before[scope]
                scopes[scope] = {
                    'current': {k: a[k] for k in ('cases', 'placements', 'buying_accounts', 'new_buying_accounts')},
                    'prior': {k: b[k] for k in ('cases', 'placements', 'buying_accounts')},
                    'brands': movements(a['brands'], b['brands']),
                    'accounts': movements(a['accounts'], b['accounts'], customers),
                }
            label = f'{calendar.month_abbr[int(end[5:])]} {year}'
            if mode == 'ytd':
                label = f'Jan–{label}' if int(end[5:]) > 1 else label
            periods[f'{mode}:{end}'] = {'label': label, 'start': current_keys[0], 'end': end,
                                       'prior_start': prior_keys[0], 'prior_end': prior_end, 'scopes': scopes}
            if mode == 'month':
                trend.append({'month': end, 'current': {s: now[s]['cases'] for s in SCOPES},
                              'prior': {s: before[s]['cases'] for s in SCOPES}})
    if not periods:
        raise ValueError('No complete matching prior-year periods')
    default = f'ytd:{latest}' if f'ytd:{latest}' in periods else max(periods, key=lambda key: key.split(':')[1])
    return {'history_start': history_start, 'through': latest, 'year': year,
            'exported': sources[latest].get('exported'), 'default': default,
            'partial_excluded': sorted(m for m, s in sources.items() if s.get('partial') is not False),
            'internal_rows_excluded': excluded, 'periods': periods, 'trend': trend}


def main():
    data = build()
    out = Path(__file__).parent / 'data/pulse.json'
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    if '--check' in sys.argv:
        if not out.exists() or out.read_text(encoding='utf-8') != payload:
            raise SystemExit('Sales Pulse is stale: run python sales-pulse/generate.py')
        print('Sales Pulse data is current.')
    else:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding='utf-8')
        print(f'Sales Pulse: {len(data["periods"])} matched periods through {data["through"]}; {len(payload):,} characters.')


if __name__ == '__main__':
    main()
