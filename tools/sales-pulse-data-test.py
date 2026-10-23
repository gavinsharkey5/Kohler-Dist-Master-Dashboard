"""Independent volume reconciliation plus synthetic boundary cases; no live services."""
import csv
import importlib.util
import json
import sys
import tempfile
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import customer_base

spec = importlib.util.spec_from_file_location('pulse_generator', ROOT / 'sales-pulse/generate.py')
G = importlib.util.module_from_spec(spec)
spec.loader.exec_module(G)
checks = 0


def check(value, label):
    global checks
    assert value, label
    checks += 1


data = json.loads((ROOT / 'sales-pulse/data/pulse.json').read_text(encoding='utf-8'))
base = ROOT / 'rolling-distribution/data/master'
customers = {int(a['customer_num']): a for a in G.read_csv(base / 'customers.csv')}
active = {int(a['num']): a for a in customer_base.load()}
products = {int(a['product_num']): a for a in G.read_csv(base / 'products.csv')}
for p in data['periods'].values():
    # Read the CSVs independently using Decimal and unique keys, never monthly sums.
    for side, start, end in [('current', p['start'], p['end']), ('prior', p['prior_start'], p['prior_end'])]:
        pairs = defaultdict(Decimal)
        for month in sorted((base / 'months').glob('*.csv')):
            if not start <= month.stem <= end:
                continue
            for r in G.read_csv(month):
                product, account = int(r['product_num']), int(r['customer_num'])
                if account in G.INTERNAL or 'finance charge' in products[product]['name'].lower():
                    continue
                pairs[(product, account)] += Decimal(r['cases'])
        scopes = {s: {} for s in G.SCOPES}
        for (product, account), value in pairs.items():
            a = active.get(account, customers[account])
            scope = customer_base.territory(a['area'], a['county']) or 'other'
            scopes[scope][(product, account)] = value
            scopes['total'][(product, account)] = value
        for scope, values in scopes.items():
            buyers = defaultdict(Decimal)
            for (_, account), value in values.items():
                buyers[account] += value
            got = p['scopes'][scope][side]
            check(abs(got['cases'] - float(sum(values.values()))) < .00001, f'{p["end"]}/{side}/{scope} cases')
            check(got['placements'] == sum(v > 0 for v in values.values()), f'{scope} distinct placements')
            check(got['buying_accounts'] == sum(v > 0 for v in buyers.values()), f'{scope} distinct buyers')
    for key in ('cases', 'placements', 'buying_accounts', 'new_buying_accounts'):
        parts = sum(p['scopes'][s]['current'][key] for s in ('core', 'southern', 'other'))
        check(abs(parts - p['scopes']['total']['current'][key]) < .00001, 'Core + Southern + Other = Total')
check('$' not in json.dumps(data), 'no dollars in Pulse data')
check(all(not any(k in row for k in ('revenue', 'gross', 'payout')) for row in data['periods'].values()), 'volume only')

with tempfile.TemporaryDirectory(prefix='kdh-pulse-') as tmp:
    root = Path(tmp); (root / 'months').mkdir()

    def write(file, rows):
        with (root / file).open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)

    write('products.csv', [{'product_num': n, 'name': name, 'family': 'Test'} for n, name in [(11, 'Test Beer'), (12, 'Test Return'), (5, 'Finance Charge')]])
    write('customers.csv', [{'customer_num': n, 'name': 'Test Account', 'area': area, 'county': county} for n, area, county in [(1001, 'Bergen', 'Bergen'), (1002, 'Essex', 'Essex'), (1003, 'Morris 2', 'Morris'), (1004, 'Sales', 'Union'), (1005, 'Morris 2', 'Morris'), (5, '', '')]])
    raw = {
        '2025-01': [(11, 1001, 5), (11, 1002, 2), (11, 1003, 1), (11, 1004, 1)],
        '2025-02': [(11, 1001, 5), (11, 1002, 2)],
        '2026-01': [(11, 1001, 10), (12, 1001, -2), (11, 1002, 4), (11, 1003, 3), (11, 1004, 2), (11, 1005, 7), (11, 5, 100), (5, 1001, 99)],
        '2026-02': [(11, 1001, -10), (11, 1002, 4)],
        '2026-03': [(11, 1001, 999)],
    }
    for m, rows in raw.items():
        write(f'months/{m}.csv', [{'product_num': a, 'customer_num': b, 'buyer': 1, 'cases': c} for a, b, c in rows])
    (root / 'sources.json').write_text(json.dumps({m: {'partial': m == '2026-03', 'exported': '2026-04-01'} for m in raw}))
    got = G.build(root, active=[{'num': '1005', 'area': 'Bergen', 'county': 'Bergen'}])
    y = got['periods']['ytd:2026-02']['scopes']
    check(got['through'] == '2026-02' and got['partial_excluded'] == ['2026-03'], 'partial month excluded')
    check(y['core']['current']['cases'] == 5, 'returns netted; current geography overrides history')
    check(y['core']['current']['placements'] == 1, 'fully returned pair is not a placement')
    check(y['core']['current']['buying_accounts'] == 1, 'net negative account is not a buyer')
    check(y['southern']['current']['buying_accounts'] == 2, 'Sales resolves by county')
    check(y['other']['current']['cases'] == 3, 'Morris 2 is Other, not Southern')
    check(y['total']['current']['cases'] == 18, 'internal rows and finance charges excluded')
    check(y['core']['current']['new_buying_accounts'] == 1, 'new observed buyer counted once')
    check('new_buying_accounts' not in y['core']['prior'], 'no unsupported new-account comparison')
    check(len(got['trend']) == 2, 'partial month not charted')
    metadata = json.loads((root / 'sources.json').read_text())
    metadata['2026-01']['partial'] = True
    (root / 'sources.json').write_text(json.dumps(metadata))
    fallback = G.build(root, active=[])
    check(fallback['default'] == 'month:2026-02', 'missing YTD history falls back to a complete month')
    check('ytd:2026-02' not in fallback['periods'], 'missing month never treated as zero')
print(f'{checks} Sales Pulse data checks passed: independent CSV reconciliation and boundary fixtures.')
