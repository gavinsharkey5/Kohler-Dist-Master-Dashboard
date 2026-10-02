#!/usr/bin/env python3
"""
Accounts tab + Account page -- per-rep data slices (2026-09-30).

Reads what the site already has and writes ONE small file per rep, so a
rep's browser only ever receives their own accounts (the Vercel
middleware maps a rep to their slice by name key and refuses every other
slice -- see middleware.js):

  hub/data/accounts.js                      each rep's assigned customer base
                                            (Sales Reps' Customer Base report)
  rolling-distribution/data/master/         Fusion product x account x month
      months/YYYY-MM.csv                    cases (net of returns), Jan 2025 ->
      products.csv, customers.csv           product master, addresses
      deciles/universe.csv                  account size decile (gross 2026)
  isellbeer/tap-survey-tracking/index.html  the current tap survey per account
                                            (the embedded tap-data JSON)

Outputs (all git-tracked, all generated -- never edit by hand):

  data/index.json          months list, source dates, the rep keys
  data/book/<key>.js       `const HUB_ACCOUNTS/HUB_BRANDS` for ONE rep -- what
                           the middleware serves a rep who asks for
                           hub/data/accounts.js
  data/reps/<key>.json     the rep's accounts with a one-line summary each
                           (last purchase month, months bought of the last
                           12, taps + last survey, alert counts + the
                           evidence lines from patterns.py) -- the Accounts list
  data/sales/<key>/<n>.json  one account's product x month case history
                           (n = Encompass customer number) -- loaded when
                           that Account page opens; per-rep folder so the
                           middleware's path check is one prefix; carries
                           `findings` (alerts with evidence + buying
                           patterns) from patterns.py
  data/catalog.json        the PRODUCT CATALOGUE the Account page's product
                           list browses (2026-09-30): every product sold
                           anywhere in the last 12 months or held in the
                           warehouse, with supplier / family / package from
                           products.csv, the warehouse's sellable units and
                           days-of-cover status exactly as ../inventory/
                           computes them (its embedded rep-data JSON, so the
                           number a rep sees here is the number that page
                           shows), and the sell-sheet URL where the Brands
                           export carries one. Not per rep (no customer
                           data in it) -- the middleware lets a rep fetch
                           it like index.json.

<key> = kdhNameKey(rep): canonical first name (Michael -> mike) + '-' +
surname without spaces/punctuation, exactly as shared/kdh-user.js and the
middleware compute it, so "Michael Ast" on the allow list and "Mike Ast"
in the customer base meet at mike-ast.

Refresh: run this after hub/generate.py, after a rolling-distribution
month lands, or after the tap tracker is rebuilt. Idempotent.
"""
import csv, json, re, sys
from pathlib import Path
from collections import defaultdict
sys.path.insert(0, str(Path(__file__).resolve().parent))
from patterns import analyze, summary_lines

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = HERE / "data"
MASTER = ROOT / "rolling-distribution" / "data" / "master"

NICK = {'daniel':'dan','james':'jim','matthew':'matt','nicholas':'nick','michael':'mike','christopher':'chris','robert':'rob','william':'bill','joseph':'joe','jonathan':'jon','kenneth':'ken','timothy':'tim','thomas':'tom','richard':'rich','edward':'ed','andrew':'andy','anthony':'tony','steven':'steve','stephen':'steve','benjamin':'ben','samuel':'sam','alexander':'alex','patrick':'pat','gregory':'greg','jeffrey':'jeff','joshua':'josh','zachary':'zach','charles':'chuck','frederick':'fred','ronald':'ron','donald':'don','douglas':'doug','kevin':'kev','katherine':'kate','elizabeth':'liz','jennifer':'jen','jessica':'jess','rebecca':'becky','danielle':'dani','nicole':'nikki','alexandra':'alex','victoria':'vicky'}
NOT_REPS = {'default', 'office tell sell'}

def name_key(n):
    parts = re.sub(r'\s+', ' ', re.sub(r'[^a-z\s]', ' ', str(n or '').lower())).strip().split(' ')
    if not parts or not parts[0]: return ''
    first = NICK.get(parts[0], parts[0])
    last = ''.join(parts[1:])
    return first + ('-' + last if last else '')

def load_book():
    s = (ROOT / "hub" / "data" / "accounts.js").read_text()
    parts = dict(re.findall(r'const (\w+) = (\{.*?\});\n', s, re.S))
    return json.loads(parts['HUB_ACCOUNTS']), parts['HUB_BRANDS']

def load_master():
    months = sorted(p.stem for p in (MASTER / "months").glob("*.csv"))
    idx = {m: i for i, m in enumerate(months)}
    sales = defaultdict(lambda: defaultdict(lambda: [0.0] * len(months)))   # cust -> prod -> [cases per month]
    for m in months:
        with open(MASTER / "months" / f"{m}.csv", newline='') as f:
            for row in csv.DictReader(f):
                c = float(row['cases'] or 0)
                if c == 0: continue
                sales[row['customer_num']][row['product_num']][idx[m]] += c
    products = {r['product_num']: r for r in csv.DictReader(open(MASTER / "products.csv", newline=''))}
    customers = {r['customer_num']: r for r in csv.DictReader(open(MASTER / "customers.csv", newline=''))}
    deciles = {}
    p = MASTER / "deciles" / "universe.csv"
    if p.exists():
        for r in csv.DictReader(open(p, newline='')):
            deciles[r['customer_num']] = {'decile': int(r['decile']) if r.get('decile') else None, 'class': r.get('class') or '',
                                          'stops': int(float(r['stops_2026'])) if r.get('stops_2026') else None, 'distPts': int(float(r['dist_pts'])) if r.get('dist_pts') else None}
    sources = json.loads((MASTER / "sources.json").read_text()) if (MASTER / "sources.json").exists() else {}
    return months, sales, products, customers, deciles, sources

def load_catalog(products, months, sales):
    """Product catalogue + warehouse availability for the Account page's
    product list. Availability is taken from ../inventory/index.html's
    embedded rep-data JSON (asOf, available units, days of cover, status,
    next arrival, backordered) -- computed once there, never here."""
    inv, inv_meta = {}, {}
    p = ROOT / "inventory" / "index.html"
    if p.exists():
        m = re.search(r'<script id="rep-data" type="application/json">(.*?)</script>', p.read_text(), re.S)
        if m:
            d = json.loads(m.group(1))
            inv_meta = {'asOf': d.get('asOf', ''), 'generatedAt': d.get('generatedAt', ''), 'lowDoi': d.get('lowDoi'), 'heavyDoi': d.get('heavyDoi')}
            inv = {str(x['num']): x for x in d.get('products', [])}
    sheets = {}
    xl = ROOT / "carbliss-onprem-targets" / "brands_sell_sheets.xlsx"
    if xl.exists():
        try:
            import openpyxl
            ws = openpyxl.load_workbook(xl, read_only=True)[ 'Brands' ]
            rows = list(ws.iter_rows(values_only=True))
            hdr = [str(h or '').strip() for h in rows[0]]
            bi, ui = hdr.index('Brand'), hdr.index('Sell Sheet URL')
            for r in rows[1:]:
                if r[bi] and r[ui]: sheets[str(r[bi]).strip()] = str(r[ui]).strip()
        except Exception as e:
            print("sell sheets not read:", e)
    # sold anywhere in the last 12 loaded months
    sold12 = set()
    cut = len(months) - 12
    for cust in sales.values():
        for pn, arr in cust.items():
            if any(c > 0 for c in arr[cut:]): sold12.add(pn)
    out = []
    for pn, pr in products.items():
        if pr.get('supplier') == 'Misc' or pr.get('family') == 'Misc': continue
        iv = inv.get(pn)
        if pn not in sold12 and not iv: continue
        out.append([pn, pr.get('name', pn), pr.get('supplier', ''), pr.get('family', ''), pr.get('package', ''),
                    iv['available'] if iv else None, iv.get('doi') if iv else None, iv.get('status') if iv else None,
                    iv.get('nextArrival') if iv else None, iv.get('backordered') if iv else None,
                    sheets.get(pr.get('brand', '')) or None])
    for pn, iv in inv.items():          # stocked products the sales master has never seen
        if pn in products: continue
        out.append([pn, iv.get('name', pn), iv.get('supplier', ''), '', iv.get('pack', ''), iv['available'], iv.get('doi'), iv.get('status'), iv.get('nextArrival'), iv.get('backordered'), None])
    out.sort(key=lambda r: (r[2].lower(), r[1].lower()))
    return {'products': out, 'inventory': inv_meta, 'sellSheets': {'file': xl.name if xl.exists() else '', 'brands': len(sheets)},
            'columns': ['num', 'name', 'supplier', 'family', 'package', 'available', 'doi', 'status', 'nextArrival', 'backordered', 'sellSheet']}

def load_service():
    """Draft / package service type per account (the fuller customer base
    export kept for the incentive trackers)."""
    p = ROOT / "incentive-tracking" / "data" / "customer_base_full.csv"
    if not p.exists(): return {}
    out = {}
    with open(p, newline='', encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            v = re.sub(r'^\d+\)\s*', '', (r.get('Draft Package') or '').strip())
            if r.get('Customer Num') and v: out[str(r['Customer Num']).strip()] = v
    return out

def load_taps():
    html = (ROOT / "isellbeer" / "tap-survey-tracking" / "index.html").read_text()
    m = re.search(r'<script id="tap-data" type="application/json">(.*?)</script>', html, re.S)
    if not m: return {}, ''
    d = json.loads(m.group(1))
    out = defaultdict(lambda: {'last': '', 'lastDisplay': '', 'ours': 0, 'them': 0, 'unv': 0, 'brands': [], 'rep': '', 'passes': 0})
    for r in d.get('records', []):
        a = out[str(r.get('account', ''))]
        if r.get('visited', '') > a['last']:
            a['last'] = r['visited']; a['lastDisplay'] = r.get('visitedDisplay', '')
        st = r.get('status')
        if st == 'US': a['ours'] += r.get('taps', 0) or 0
        elif st == 'THEM': a['them'] += r.get('taps', 0) or 0
        else: a['unv'] += r.get('taps', 0) or 0
        a['brands'].append({'b': r.get('brand', ''), 'f': r.get('brandFamily', ''), 's': 'ours' if st == 'US' else ('theirs' if st == 'THEM' else 'unverified'), 'n': r.get('taps', 0) or 0})
        a['rep'] = r.get('rep', '')
    # superseded passes: {account: [{visited, display, taps, us, them, ...}]}
    hist = d.get('history') or {}
    hist_list = {}
    for k, a in out.items():
        prev = hist.get(k, []) if isinstance(hist, dict) else []
        a['passes'] = 1 + len(prev)
        a['history'] = [{'visited': (p.get('visited') or '')[:10], 'display': p.get('display', ''), 'taps': p.get('taps', 0), 'ours': p.get('us', 0), 'them': p.get('them', 0)} for p in prev]
        a['brands'].sort(key=lambda x: (-x['n'], x['b']))
    return dict(out), d.get('generatedAt', '')

GEO_FILE = HERE / "geo.csv"
def load_geo():
    """VALIDATED COORDINATES (2026-10-02), optional: accounts/geo.csv with
    customer_num, lat, lng[, source]. Encompass's own customer coordinates are
    the preferred source (REPORTING_REQUEST.md); a row here wins over the map's
    on-demand geocoding (api/geocode.js). Rows outside northern NJ's bounding
    box are refused and printed -- a coordinate typo must not put a pin in
    another state."""
    out, bad = {}, []
    if not GEO_FILE.exists(): return out
    with open(GEO_FILE, newline='', encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            n = str(r.get('customer_num') or r.get('CustomerID') or '').strip()
            try: lat, lng = float(r.get('lat') or r.get('latitude')), float(r.get('lng') or r.get('longitude'))
            except (TypeError, ValueError): continue
            if not n: continue
            if not (39.5 <= lat <= 41.5 and -75.7 <= lng <= -73.5): bad.append(n); continue
            out[n] = [round(lat, 6), round(lng, 6), (r.get('source') or 'file').strip()[:20]]
    print(f"geo.csv: {len(out)} coordinates" + (f", {len(bad)} refused (outside northern NJ): {bad[:10]}" if bad else ''))
    return out

def write_assignments(assign):
    """supabase/seed/account_assignments.sql: who may add notes and photos on
    which account (migration 20261002120000). Re-run it in the Supabase SQL
    Editor after a customer-base refresh that moved accounts between reps.
    Customer numbers and rep keys only -- no emails, no names of people."""
    seed = ROOT / "supabase" / "seed"
    seed.mkdir(parents=True, exist_ok=True)
    vals = ",\n".join(f"  ('{n}', '{k}')" for n, k in sorted(assign.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0))
    sql = ("-- GENERATED by accounts/generate.py -- do not edit. Paste into the Supabase SQL Editor\n"
           "-- after migration 20261002120000_account_notes_photos.sql, and again whenever\n"
           "-- the customer base moves accounts between reps. Safe to run more than once.\n"
           "begin;\ncreate temp table _a (customer_num text, rep_key text) on commit drop;\n"
           f"insert into _a (customer_num, rep_key) values\n{vals};\n"
           "insert into public.account_assignments (customer_num, rep_key)\n  select customer_num, rep_key from _a\n"
           "  on conflict (customer_num) do update set rep_key = excluded.rep_key, updated_at = now()\n"
           "  where public.account_assignments.rep_key is distinct from excluded.rep_key;\n"
           "delete from public.account_assignments a where not exists (select 1 from _a where _a.customer_num = a.customer_num);\n"
           "commit;\n")
    (seed / "account_assignments.sql").write_text(sql)
    print(f"supabase/seed/account_assignments.sql: {len(assign)} accounts")

def main():
    book, brands_src = load_book()
    months, sales, products, customers, deciles, sources = load_master()
    taps, taps_asof = load_taps()
    service = load_service()
    geo = load_geo()
    assign = {}
    catalog = load_catalog(products, months, sales)
    (OUT).mkdir(parents=True, exist_ok=True)
    (OUT / "catalog.json").write_text(json.dumps(dict(catalog, generated=__import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')), separators=(',', ':')))
    print(f"catalog: {len(catalog['products'])} products, warehouse as of {catalog['inventory'].get('asOf','?')}, {catalog['sellSheets']['brands']} sell sheets")
    last_month = months[-1] if months else ''
    # reference month: the last month NOT flagged partial in sources.json
    ref_i = len(months) - 1
    while ref_i > 0 and (sources.get(months[ref_i]) or {}).get('partial'):
        ref_i -= 1
    ref_month = months[ref_i] if months else ''
    sales_loaded = max((v.get('loaded', '') for v in sources.values()), default='')
    for sub in ('book', 'reps', 'sales'):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    keys = {}
    n_months = len(months)
    for rep, accts in book['reps'].items():
        if rep.strip().lower() in NOT_REPS: continue
        key = name_key(rep)
        if key in keys.values():
            sys.exit(f"two reps share the key {key}: {rep} and {[r for r, k in keys.items() if k == key]}")
        keys[rep] = key
        rows, sale_rows = [], {}
        for a in sorted(accts, key=lambda x: x['name'].lower()):
            n = str(a['n'])
            cust = customers.get(n, {})
            prods = sales.get(n, {})
            series = [0.0] * n_months
            plist = []
            for pn, arr in prods.items():
                if not any(arr): continue
                for i, c in enumerate(arr): series[i] += c
                pr = products.get(pn, {})
                plist.append([pn, pr.get('name', pn), pr.get('family', ''), pr.get('supplier', ''), pr.get('package', ''), [round(c, 1) for c in arr]])
            plist.sort(key=lambda p: -sum(p[5][-12:]))
            bought = [i for i, c in enumerate(series) if c > 0]
            last_i = bought[-1] if bought else None
            t = taps.get(n)
            # BUYING PATTERNS + ALERTS (patterns.py is the one rule engine; the
            # page only renders what is written here). Reference month = the
            # last COMPLETE loaded month (never a partial one, never today).
            res = analyze(plist, months, ref_i)
            cnt = res.get('counts') or {'reorder': 0, 'lapsed': 0, 'slower': 0}
            row = {
                'n': a['n'], 'name': a['name'], 'city': a.get('city', ''), 'county': a.get('county', ''), 'area': a.get('area') or a.get('rawArea', ''),
                'prem': a.get('prem', ''), 'address': cust.get('address', ''), 'cases2026': a.get('cases'),
                'decile': (deciles.get(n) or {}).get('decile'), 'sizeClass': (deciles.get(n) or {}).get('class', ''),
                'stops2026': (deciles.get(n) or {}).get('stops'), 'distPts': (deciles.get(n) or {}).get('distPts'), 'service': service.get(n, ''),
                'last': months[last_i] if last_i is not None else None,
                'buy12': sum(1 for i in bought if i >= n_months - 12),
                'products12': sum(1 for p in plist if any(p[5][-12:])),
                'cases3': round(sum(series[-3:]), 1), 'casesPrior3': round(sum(series[-6:-3]), 1), 'casesLy3': round(sum(series[-15:-12]), 1) if n_months >= 15 else None,
                'inMaster': n in customers, 'gaps': cnt['reorder'],
                'alerts': cnt, 'lessOften': bool(res['patterns'] and res['patterns']['lessOften']),
                'summary': summary_lines(res), 'families': (res['patterns'] or {}).get('families', []),
                'alertProducts': [{'t': x['type'], 'p': x['product'], 'f': x['family']} for x in res['alerts'][:12]],
            }
            if n in geo: row['geo'] = geo[n]
            assign[n] = key
            if t: row['taps'] = {'last': t['last'][:10], 'lastDisplay': t['lastDisplay'], 'ours': t['ours'], 'them': t['them'], 'unv': t['unv'], 'passes': t['passes']}
            rows.append(row)
            sale_rows[n] = {'series': [round(c, 1) for c in series], 'products': plist, 'taps': (t['brands'] if t else None), 'tapHistory': (t['history'] if t else None),
                            'findings': {'ref': res['ref'], 'alerts': res['alerts'], 'counts': cnt, 'patterns': res['patterns']}}
        meta = {'rep': rep, 'key': key, 'generated': __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
                'book': {'asOf': book.get('asOf', '')}, 'sales': {'months': months, 'through': last_month, 'ref': ref_month, 'loaded': sales_loaded},
                'taps': {'asOf': taps_asof}}
        (OUT / "reps" / f"{key}.json").write_text(json.dumps(dict(meta, accounts=rows), separators=(',', ':')))
        d = OUT / "sales" / key
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob('*.json'): old.unlink()
        for n, sr in sale_rows.items():
            (d / f"{n}.json").write_text(json.dumps(dict(sr, n=int(n), months=months), separators=(',', ':')))
        slice_book = {'asOf': book.get('asOf', ''), 'areas': book.get('areas', []), 'reps': {rep: accts}}
        (OUT / "book" / f"{key}.js").write_text(
            "// GENERATED by accounts/generate.py -- one rep's slice of hub/data/accounts.js (the middleware serves this to that rep).\n"
            f"const HUB_ACCOUNTS = {json.dumps(slice_book, separators=(',', ':'))};\n"
            f"const HUB_BRANDS = {brands_src};\n")
    (OUT / "index.json").write_text(json.dumps({'generated': __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'months': months, 'salesThrough': last_month, 'salesRef': ref_month, 'salesLoaded': sales_loaded, 'tapsAsOf': taps_asof, 'bookAsOf': book.get('asOf', ''),
        'reps': [{'rep': r, 'key': k} for r, k in sorted(keys.items())]}, indent=1))
    tot = sum(f.stat().st_size for f in OUT.rglob('*.js*'))
    write_assignments(assign)
    print(f"{len(keys)} reps, {n_months} months through {last_month}, taps as of {taps_asof}; {tot/1e6:.1f} MB written to {OUT}")
    big = sorted(((f.stat().st_size, f.parent.name + '/' + f.name) for f in (OUT / 'sales').glob('*/*.json')), reverse=True)[:3]
    print("largest account files:", [(round(s/1e3), n) for s, n in big])

if __name__ == '__main__':
    main()

# Per-rep copies (tools/rep_slices.py, 2026-10-01): a signed-in rep's browser
# is served only their own rows, so the copies are rebuilt after every run.
if __name__ == "__main__":
    import subprocess as _sp, sys as _sys
    from pathlib import Path as _P
    _root = next(p for p in _P(__file__).resolve().parents if (p / "middleware.js").exists())
    _sp.run([_sys.executable, str(_root / "tools" / "rep_slices.py")], check=True)
