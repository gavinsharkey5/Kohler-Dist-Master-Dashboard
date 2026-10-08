#!/usr/bin/env python3
"""Compact per-rep sales history for manager-built programs (2026-10-08).

Manager-created incentives / MPOs (Manage Programs, /manage-programs/) are
evaluated IN THE BROWSER from existing site data. The only product x account
history on the site is the Rolling Distribution master (net cases per
product per customer per MONTH, Jan 2025 -> the last loaded month), and
accounts/generate.py spreads it over one file per account. That is too many
fetches for a program card, so this script writes ONE file per rep:

  accounts/data/hist/<rep key>.json
    {rep, key, months:[...], ref, through, loaded, accounts:{"<n>": {"<product #>": [cases per month]}}}

protected per rep by the middleware (ACCOUNT_DATA covers `hist`), and ONE
customer-free product list every signed-in person may read:

  accounts/data/products.json
    {generated, columns:["num","name","supplier","family","brand","package","draft"], products:[[...], ...]}

Months, keys and the reference month are exactly accounts/generate.py's.
Run it after accounts/generate.py (that script calls it) or by hand:

  python3 tools/program_history.py          # writes
  python3 tools/program_history.py --check  # exit 1 if a file is stale
"""
import csv, json, re, sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'rolling-distribution' / 'data' / 'master'
OUT = ROOT / 'accounts' / 'data'
HUB = ROOT / 'hub' / 'data' / 'accounts.js'
MW = ROOT / 'middleware.js'
DRAFT_RE = re.compile(r'\b(keg|gal)\b', re.I)


def load_nick():
    m = re.search(r'const NICK = (\{.*?\});', MW.read_text())
    return json.loads(re.sub(r'(\w+):', r'"\1":', m.group(1)).replace("'", '"'))


NICK = load_nick()


def name_key(n):
    parts = re.sub(r'\s+', ' ', re.sub(r'[^a-z\s]', ' ', str(n or '').lower())).strip().split(' ')
    if not parts or not parts[0]:
        return ''
    first = NICK.get(parts[0], parts[0])
    last = ''.join(parts[1:])
    return first + ('-' + last if last else '')


def dumps(o):
    return json.dumps(o, separators=(',', ':'))


def books():
    """rep -> [customer numbers] from hub/data/accounts.js (the rep account base)."""
    txt = HUB.read_text()
    m = re.search(r'const HUB_ACCOUNTS = (\{.*?\});\s*\n', txt, re.S)
    data = json.loads(m.group(1))
    return {rep: [str(a['n']) for a in rows] for rep, rows in data['reps'].items()}, data.get('asOf')


def load_master():
    months = sorted(p.stem for p in (MASTER / 'months').glob('*.csv'))
    idx = {m: i for i, m in enumerate(months)}
    sales = defaultdict(lambda: defaultdict(lambda: [0.0] * len(months)))
    for m in months:
        with open(MASTER / 'months' / f'{m}.csv', newline='') as f:
            for row in csv.DictReader(f):
                c = float(row['cases'] or 0)
                if c == 0:
                    continue
                sales[row['customer_num']][row['product_num']][idx[m]] += c
    products = {r['product_num']: r for r in csv.DictReader(open(MASTER / 'products.csv', newline=''))}
    sources = json.loads((MASTER / 'sources.json').read_text()) if (MASTER / 'sources.json').exists() else {}
    return months, sales, products, sources


def build():
    months, sales, products, sources = load_master()
    ref_i = len(months) - 1
    while ref_i > 0 and (sources.get(months[ref_i]) or {}).get('partial'):
        ref_i -= 1
    loaded = max((v.get('loaded') or '' for v in sources.values()), default='')
    reps, as_of = books()
    files = {}
    for rep, nums in reps.items():
        key = name_key(rep)
        if not key:
            continue
        accts = {}
        for n in nums:
            prods = sales.get(n)
            if not prods:
                continue
            accts[n] = {pn: [round(c, 1) for c in series] for pn, series in prods.items()}
        files[key] = {'rep': rep, 'key': key, 'months': months, 'ref': months[ref_i], 'through': months[-1],
                      'loaded': loaded, 'bookAsOf': as_of, 'accounts': accts}
    plist = []
    for pn, p in sorted(products.items(), key=lambda kv: kv[0]):
        plist.append([pn, p.get('name', ''), p.get('supplier', ''), p.get('family', ''), p.get('brand', ''),
                      p.get('package', ''), 1 if DRAFT_RE.search((p.get('package') or '') + ' ' + (p.get('name') or '')) else 0])
    prod_file = {'generated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                 'columns': ['num', 'name', 'supplier', 'family', 'brand', 'package', 'draft'], 'products': plist}
    return files, prod_file


def main():
    check = '--check' in sys.argv
    files, prod_file = build()
    hist = OUT / 'hist'
    stale = []
    if not check:
        hist.mkdir(parents=True, exist_ok=True)
    for key, data in files.items():
        p = hist / f'{key}.json'
        txt = dumps(data)
        if check:
            if not p.exists() or p.read_text() != txt:
                stale.append(p.name)
        else:
            p.write_text(txt)
    pp = OUT / 'products.json'
    if check:
        cur = json.loads(pp.read_text()) if pp.exists() else None
        if not cur or cur.get('products') != prod_file['products']:
            stale.append(pp.name)
        if stale:
            print('STALE:', ', '.join(stale[:10]), '...' if len(stale) > 10 else '')
            sys.exit(1)
        print('program history up to date (%d reps)' % len(files))
        return
    pp.write_text(dumps(prod_file))
    sizes = sorted(((p.stat().st_size, p.name) for p in hist.glob('*.json')), reverse=True)
    print('wrote %d history files (largest %s %dKB), products.json %d products' % (
        len(files), sizes[0][1], sizes[0][0] // 1000, len(prod_file['products'])))


if __name__ == '__main__':
    main()
