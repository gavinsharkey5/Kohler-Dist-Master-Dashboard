#!/usr/bin/env python3
"""
Regenerates the embedded data in index.html from accounts.csv (+ the buyers and sell-sheet files).

Usage (from this folder):
    python3 generate.py

Inputs (keep these filenames when re-exporting from RDE):
    accounts.csv   - "RDE Carbliss Eval vs Sun Cruiser & White Claw" export
                     (Sales Rep Assigned, Customer ID, Customer Name, Shipping Address, City,
                      On Premise, Brand Family, Product Num Name, Cases 2025, Buyer Count 2025,
                      Cases 2026, Buyer Count 2026)

Dollars are NOT used anywhere on this page (Gavin, 2026-10-06): distribution
only -- placements (accounts / buyers) and cases. The old price & volume
export (price_vol.csv) is no longer read or kept; per-product cases come from
accounts.csv's Product Num Name rows, which matched it case for case.

City comes straight from accounts.csv's own City column (added 2026-07-21 --
100% of accounts resolve directly from the source export now). The old
cross-reference lookup from other trackers in this repo (molsoncoors/retention,
carbliss/data.csv, isellbeer DisplayPhotoReport.csv) is kept only as a fallback
for the rare case a future export drops the City column or leaves it blank for
an account.
"""
import csv, json, re, os, datetime
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
F1 = os.path.join(HERE, 'accounts.csv')
# 2026-09-30: the rolling-90 buyer export ("RDE Carbliss Buyers (ON) L90 vs
# Start": one row per Carbliss load sheet, with Buyers L90 = 1 when that load
# sheet falls inside the last 90 days and Buyers 2026 = 1 for the year) and
# the Brands workbook that carries a sell-sheet URL per Carbliss flavor.
F3 = os.path.join(HERE, 'carbliss_buyers_l90.csv')
F4 = os.path.join(HERE, 'brands_sell_sheets.xlsx')
HTML = os.path.join(HERE, 'index.html')

CARBLISS_FLAVORS = ['Black Cherry', 'Black Raspberry', 'Blood Orange', 'Cranberry', 'Grapefruit',
                     'Lemon Lime', 'Lemon Tea', 'Mango', 'Peach', 'Pineapple', 'Watermelon']

# Broad flavor "families" used to steer the gap recommendation toward something
# genuinely different from whatever's already selling, instead of always the
# single most popular missing flavor company-wide.
FLAVOR_FAMILY = {
    'Lemon Lime': 'citrus', 'Lemon Tea': 'citrus', 'Grapefruit': 'citrus', 'Blood Orange': 'citrus',
    'Mango': 'tropical', 'Pineapple': 'tropical', 'Watermelon': 'tropical', 'Peach': 'tropical',
    'Black Cherry': 'berry', 'Black Raspberry': 'berry', 'Cranberry': 'berry',
}

# Ordered keyword -> flavor map for competitor (Sun Cruiser / White Claw) product names.
# Order matters: more specific keywords are checked first (e.g. "ruby grapefruit"
# before "grapefruit" before generic "grape"; "iced tea" before "lemonade").
FLAVOR_KEYWORDS = [
    ('black cherry', 'Black Cherry'),
    ('blood orange', 'Blood Orange'),
    ('ruby grapefruit', 'Grapefruit'),
    ('grapefruit', 'Grapefruit'),
    ('natural lime', 'Lemon Lime'),
    ('iced tea', 'Lemon Tea'),
    ('ice tea', 'Lemon Tea'),
    ('lemonade', 'Lemon Lime'),
    ('mango', 'Mango'),
    ('peach', 'Peach'),
    ('pineapple', 'Pineapple'),
    ('watermelon', 'Watermelon'),
    ('cranberry', 'Cranberry'),
    ('raspberry', 'Black Raspberry'),
    ('blackberry', 'Black Raspberry'),
]
# Deliberately unmapped (no direct or close Carbliss analog): variety packs, Green Apple,
# plain Grape, Strawberry, Blueberry — these count toward SKU breadth but not flavor coverage.


def map_flavor(product_name):
    n = product_name.lower()
    for kw, flavor in FLAVOR_KEYWORDS:
        if kw in n:
            return flavor
    return None


def carbliss_flavor_of(prod_name):
    for fl in CARBLISS_FLAVORS:
        if prod_name.startswith(f'Carbliss {fl} '):
            return fl
    return None


def join_flavors(flavors):
    """'Pineapple' / 'Pineapple or Watermelon' / 'Pineapple, Watermelon, or Peach'."""
    if len(flavors) == 1:
        return flavors[0]
    if len(flavors) == 2:
        return f"{flavors[0]} or {flavors[1]}"
    return f"{', '.join(flavors[:-1])}, or {flavors[-1]}"


def brand_of(product_name):
    if product_name.startswith('Sun Cruiser'):
        return 'Sun Cruiser'
    if product_name.startswith('White Claw'):
        return 'White Claw'
    if product_name.startswith('Carbliss'):
        return 'Carbliss'
    return 'Other'


def strip_brand(product_name, brand):
    return product_name[len(brand):].strip() if product_name.startswith(brand) else product_name


def num(s):
    s = (s or '').strip()
    return float(s) if s else 0.0


def fmt_cases(n):
    return f'{n:,.0f}'


# ---------- City lookup: direct from accounts.csv, with the old cross-referenced
# lookup from other trackers kept only as a fallback ----------
xref_city = {}


def load_city(path, id_col, city_col):
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            cid = (r.get(id_col) or '').strip()
            c = (r.get(city_col) or '').strip()
            if cid and c and cid not in xref_city:
                xref_city[cid] = c


load_city(os.path.join(REPO, 'molsoncoors/retention/data.csv'), 'cust', 'city')
load_city(os.path.join(REPO, 'carbliss/data.csv'), 'Customer ID', 'City')
load_city(os.path.join(REPO, 'isellbeer/display-auction-tracker/DisplayPhotoReport.csv'), 'Account #', 'City')

direct_city = {}

# ---------- accounts.csv: brand-level YoY per account ----------
accounts = {}
with open(F1, encoding='utf-8') as f:
    for r in csv.DictReader(f):
        cid = r['Customer ID'].strip()
        if cid not in accounts:
            accounts[cid] = {
                'id': cid, 'name': r['Customer Name'].strip(), 'rep': r['Sales Rep Assigned'].strip(),
                'brands': {},
            }
        c = (r.get('City') or '').strip()
        if c:
            direct_city[cid] = c
        b = r['Brand Family'].strip()
        # accounts.csv is now one row per (customer, brand, product) since Product
        # Num Name was added -- a brand with multiple flavors at an account spans
        # multiple rows, so cases/buyers must be summed, not overwritten by the
        # last row seen.
        bucket = accounts[cid]['brands'].setdefault(b, {'cases25': 0.0, 'buyers25': 0, 'cases26': 0.0, 'buyers26': 0})
        bucket['cases25'] += num(r['Cases   2025'])
        bucket['cases26'] += num(r['Cases   2026'])
        bucket['buyers25'] += int(r['Buyer Count   2025'] or 0)
        bucket['buyers26'] += int(r['Buyer Count   2026'] or 0)

# ---------- accounts.csv again: per-account per-product cases ----------
# One row per (customer, brand, product); the same pair can repeat, so sum.
prod_agg = defaultdict(lambda: {'cases25': 0.0, 'cases26': 0.0})
with open(F1, encoding='utf-8') as f:
    for r in csv.DictReader(f):
        pn = re.sub(r'^\s*\d+\s+', '', r['Product Num Name'].strip())
        key = (r['Customer ID'].strip(), pn)
        prod_agg[key]['cases25'] += num(r['Cases   2025'])
        prod_agg[key]['cases26'] += num(r['Cases   2026'])

# Global per-Carbliss-flavor totals across every account: used both to rank which
# missing flavor is the strongest bet.
flavor_global = defaultdict(lambda: {'cases26': 0.0})
for (cid, prod), agg in prod_agg.items():
    if prod.startswith('Carbliss'):
        fl = carbliss_flavor_of(prod)
        if fl:
            flavor_global[fl]['cases26'] += agg['cases26']

flavor_popularity = {fl: flavor_global.get(fl, {}).get('cases26', 0.0) for fl in CARBLISS_FLAVORS}

by_account = defaultdict(list)
for (cid, prod), agg in prod_agg.items():
    by_account[cid].append((prod, agg))


def build_pitch(r):
    """Short, bite-sized talking points a rep can relay out loud to a store owner —
    each bullet is one breath, not a paragraph."""
    name = r['name']
    bullets = []

    if r['lapsed']:
        prod, agg = r['primary'] if r['primary'] else (None, None)
        if prod:
            brand = brand_of(prod)
            sku = strip_brand(prod, brand)
            bullets.append({'label': 'Heads up', 'text': f"{fmt_cases(agg['cases25'])} cs of {brand} ({sku}) moved last year — nothing on file so far in 2026. Worth a check-in before this account goes quiet on RTDs/seltzers for good."})
        else:
            bullets.append({'label': 'Heads up', 'text': "No meaningful Sun Cruiser/White Claw volume on file — confirm what's actually on shelf before pitching a flavor."})
    elif r['primary']:
        prod, agg = r['primary']
        brand = brand_of(prod)
        sku = strip_brand(prod, brand)
        new_habit = agg['cases25'] <= 0
        if new_habit:
            tail = "brand new this year, nothing moved here in 2025."
        else:
            tail = f"steady seller — {fmt_cases(agg['cases25'])} cs moved last year too."
        bullets.append({'label': 'Top mover', 'text': f"{fmt_cases(agg['cases26'])} cs of {brand} ({sku}) this year — {tail}"})

        if r['breadth'] > 1:
            bullets.append({'label': 'Not a one-off', 'text': f"{r['breadth']} different Sun Cruiser/White Claw SKUs move through this account."})
    else:
        bullets.append({'label': 'Heads up', 'text': "No meaningful Sun Cruiser/White Claw volume on file — confirm what's actually pouring here before pitching a flavor."})

    # Flavor recommendation: if a flavor is already proven to sell here (via Sun
    # Cruiser/White Claw), don't pitch Carbliss in that same flavor — that's
    # competing head-on with an already-satisfied craving. Instead pitch
    # gap_flavor, a flavor from a different family that's genuine white space,
    # so Carbliss adds menu breadth instead of cannibalizing a proven seller.
    if r['gap_flavors']:
        gap_flavors = r['gap_flavors']
        top_flavor = gap_flavors[0]
        flavor_list = join_flavors(gap_flavors)
        pf = r['primary_flavor']
        if pf:
            covering_brand = brand_of(r['primary_sku_for_flavor'][0])
            bullets.append({'label': 'Diversify with', 'items': [
                f"Their {pf} craving is already covered by {covering_brand}.",
                f"Pitch Carbliss {flavor_list} instead to open a new flavor lane rather than compete head-on.",
            ]})
        else:
            bullets.append({'label': 'Diversify with', 'items': [
                f"Carbliss {flavor_list} — nothing on their menu covers it yet, clean white space.",
            ]})
    elif r['existing_carbliss']:
        bullets.append({'label': 'Note', 'text': "Their flavor mix already lines up with Carbliss — this is about shelf share, not a new flavor."})
    elif r['primary']:
        bullets.append({'label': 'Note', 'text': "Volume runs almost entirely through variety packs or flavors Carbliss doesn't carry — no clean flavor gap to lead with; pitch on category momentum instead."})

    ask_place = f"in {r['city']}" if r['city'] else "here"
    bullets.append({'label': 'The ask', 'text': f"A menu or tap-list slot {ask_place} — sized for social-pour occasions."})

    return bullets


results = []
for cid, acct in accounts.items():
    products = by_account.get(cid, [])
    competitor_26, competitor_25_only, existing_carbliss = [], [], []
    for prod, agg in products:
        if prod.startswith('Carbliss'):
            if agg['cases26'] > 0:
                fl = carbliss_flavor_of(prod)
                if fl:
                    existing_carbliss.append(fl)
            continue
        if agg['cases26'] > 0:
            competitor_26.append((prod, agg))
        elif agg['cases25'] > 0:
            competitor_25_only.append((prod, agg))

    competitor_26.sort(key=lambda x: -x[1]['cases26'])
    competitor_25_only.sort(key=lambda x: -x[1]['cases25'])
    existing_carbliss_set = set(existing_carbliss)

    lapsed = len(competitor_26) == 0 and len(competitor_25_only) > 0
    active_list = competitor_26 if not lapsed else competitor_25_only
    breadth = len(active_list)

    # Flavor coverage across both years, so a lapsed flavor still counts as "on the menu".
    coverage = set(existing_carbliss_set)
    for prod, agg in products:
        if prod.startswith('Carbliss'):
            continue
        if agg['cases26'] > 0 or agg['cases25'] > 0:
            fl = map_flavor(prod)
            if fl:
                coverage.add(fl)

    primary = active_list[0] if active_list else None
    primary_flavor, primary_sku_for_flavor = None, None
    if primary:
        fl = map_flavor(primary[0])
        if fl and fl not in existing_carbliss_set:
            primary_flavor, primary_sku_for_flavor = fl, primary
        else:
            for prod, agg in active_list[1:]:
                fl2 = map_flavor(prod)
                if fl2 and fl2 not in existing_carbliss_set:
                    primary_flavor, primary_sku_for_flavor = fl2, (prod, agg)
                    break

    gap_candidates = [fl for fl in CARBLISS_FLAVORS if fl not in coverage and fl != primary_flavor]
    dominant_family = FLAVOR_FAMILY.get(primary_flavor) if primary_flavor else None
    if not dominant_family and coverage:
        cov_cases = {}
        for prod, agg in products:
            fl = carbliss_flavor_of(prod) if prod.startswith('Carbliss') else map_flavor(prod)
            if fl:
                cov_cases[fl] = cov_cases.get(fl, 0) + agg['cases26']
        if cov_cases:
            dominant_family = FLAVOR_FAMILY.get(max(cov_cases, key=cov_cases.get))
    if dominant_family:
        contrast = [fl for fl in gap_candidates if FLAVOR_FAMILY.get(fl) != dominant_family]
        pool = contrast if contrast else gap_candidates
    else:
        pool = gap_candidates
    pool.sort(key=lambda fl: -flavor_popularity[fl])

    results.append({
        'id': cid, 'name': acct['name'], 'rep': acct['rep'], 'city': direct_city.get(cid) or xref_city.get(cid),
        'brands': acct['brands'], 'lapsed': lapsed, 'breadth': breadth, 'primary': primary,
        'primary_flavor': primary_flavor, 'primary_sku_for_flavor': primary_sku_for_flavor,
        'gap_flavors': pool, 'existing_carbliss': sorted(existing_carbliss_set),
    })

for r in results:
    r['pitch_bullets'] = build_pitch(r)

# ---------- carbliss_buyers_l90.csv: YTD vs rolling-90 buyers ----------
# An ACCOUNT is a YTD buyer when any of its load sheets carries Buyers 2026 = 1
# and a rolling-90 buyer when any carries Buyers L90 = 1. "Fell off rolling
# 90" = YTD buyer with no load sheet inside the window -- the account bought
# this year but not in the last 90 days. The RDE decides the window; the
# page reports it from the data (latest load sheet date, earliest L90 row).
buyers = {}
buyers_meta = {'asOf': '', 'windowStart': '', 'rows': 0}
loads = []   # one row per load sheet, every column of the export (2026-10-07: Load Sheets table)
def _d(s):
    try:
        m, d, y = s.strip().split('/'); return datetime.date(int(y), int(m), int(d))
    except Exception:
        return None
if os.path.exists(F3):
    with open(F3, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            cc = (r.get('Customer Num & Company') or '').strip()
            if not cc: continue
            cid, _, cname = cc.partition(' ')
            b = buyers.setdefault(cid, {'id': cid, 'name': cname.strip(), 'rep': r['Sales Rep Assigned'].strip(),
                                        'ytd': False, 'l90': False, 'buys': 0, 'buysL90': 0, 'last': None, 'first': None})
            dt = _d(r.get('Load Sheet Date') or '')
            l90 = (r.get('Buyers: L90   2026') or r.get('Buyers L90   2026') or '').strip() == '1'
            ytd = (r.get('Buyers: YTD   2026') or r.get('Buyers   2026') or '').strip() == '1'
            b['ytd'] |= ytd; b['l90'] |= l90; b['buys'] += 1; b['buysL90'] += 1 if l90 else 0
            buyers_meta['rows'] += 1
            _flag = lambda k: int((r.get(k) or '0').strip() or 0)
            _prog = next((k for k in r if k and k.startswith('Buyers: Aug')), None)
            loads.append({'id': cid, 'name': cname.strip(), 'rep': r['Sales Rep Assigned'].strip(),
                          'brand': (r.get('Brand Family') or '').strip(),
                          'date': dt.isoformat() if dt else None,
                          'prog': _flag(_prog) if _prog else 0,
                          'l90': _flag('Buyers: L90   2026') if 'Buyers: L90   2026' in r else _flag('Buyers L90   2026'),
                          'ytd': _flag('Buyers: YTD   2026') if 'Buyers: YTD   2026' in r else _flag('Buyers   2026'),
                          'diff': _flag('Difference   2026')})
            if dt:
                if not b['last'] or dt > b['last']: b['last'] = dt
                if not b['first'] or dt < b['first']: b['first'] = dt
                if not buyers_meta['asOf'] or dt > buyers_meta['asOf']: buyers_meta['asOf'] = dt
                if l90 and (not buyers_meta['windowStart'] or dt < buyers_meta['windowStart']): buyers_meta['windowStart'] = dt
    for b in buyers.values():
        b['fell'] = bool(b['ytd'] and not b['l90'])
        b['last'] = b['last'].isoformat() if b['last'] else None
        b['first'] = b['first'].isoformat() if b['first'] else None
    buyers_meta['asOf'] = buyers_meta['asOf'].isoformat() if buyers_meta['asOf'] else ''
    buyers_meta['windowStart'] = buyers_meta['windowStart'].isoformat() if buyers_meta['windowStart'] else ''
    buyers_meta['ytd'] = sum(1 for b in buyers.values() if b['ytd'])
    buyers_meta['l90'] = sum(1 for b in buyers.values() if b['l90'])
    buyers_meta['fell'] = sum(1 for b in buyers.values() if b['fell'])
    print(f"Buyers: {buyers_meta['rows']} load sheets, {len(buyers)} accounts -- YTD {buyers_meta['ytd']}, rolling-90 {buyers_meta['l90']}, fell off {buyers_meta['fell']} (window {buyers_meta['windowStart']} .. {buyers_meta['asOf']})")
else:
    print("Buyers: carbliss_buyers_l90.csv not found -- YTD / rolling-90 status left off the page")

# ---------- brands_sell_sheets.xlsx: one sell-sheet URL per Carbliss flavor ----------
sell_sheets = []
if os.path.exists(F4):
    try:
        import openpyxl
        ws = openpyxl.load_workbook(F4, read_only=True, data_only=True).worksheets[0]
        rows = list(ws.iter_rows(values_only=True)); hdr = [str(h or '').strip() for h in rows[0]]
        bi, ui, fi = hdr.index('Brand'), hdr.index('Sell Sheet URL'), hdr.index('Brand Family')
        for r in rows[1:]:
            brand = str(r[bi] or '').strip(); fam = str(r[fi] or '').strip() if fi < len(r) else ''
            if not brand or (fam and fam != 'Carbliss'): continue
            url = str(r[ui] or '').strip() if ui < len(r) else ''
            flavor = re.sub(r'^Carbliss\s+', '', brand)
            sell_sheets.append({'flavor': flavor, 'brand': brand, 'url': url if url.startswith('http') else ''})
        print(f"Sell sheets: {len(sell_sheets)} Carbliss flavors, {sum(1 for x in sell_sheets if x['url'])} with a URL" + (" -- missing: " + ", ".join(x['flavor'] for x in sell_sheets if not x['url']) if any(not x['url'] for x in sell_sheets) else ""))
    except Exception as e:
        print(f"Sell sheets: could not read brands_sell_sheets.xlsx ({e}) -- picker left off")

final_accounts = []
for r in results:
    sc = r['brands'].get('Sun Cruiser', {})
    wc = r['brands'].get('White Claw', {})
    total26 = (sc.get('cases26', 0) or 0) + (wc.get('cases26', 0) or 0)
    total25 = (sc.get('cases25', 0) or 0) + (wc.get('cases25', 0) or 0)
    final_accounts.append({
        'id': r['id'], 'name': r['name'], 'rep': r['rep'], 'city': r['city'],
        'sunCruiser': {'cases25': sc.get('cases25', 0), 'cases26': sc.get('cases26', 0)},
        'whiteClaw': {'cases25': wc.get('cases25', 0), 'cases26': wc.get('cases26', 0)},
        'total25': total25, 'total26': total26, 'breadth': r['breadth'],
        'existingCarbliss': r['existing_carbliss'],
        # "without Sun Cruiser/White Claw" tab = zero volume so far in 2026, straight
        # from the account-level export (authoritative), not the SKU-level 'lapsed' flag.
        'lapsed': total26 == 0,
        'isNew': total25 == 0 and total26 > 0,
        'primaryFlavor': r['primary_flavor'], 'gapFlavors': r['gap_flavors'],
        'pitchBullets': r['pitch_bullets'],
        # YTD / rolling-90 Carbliss buyer status from the L90 export (None = not a buyer this year)
        'buyer': ({k: buyers[r['id']][k] for k in ('ytd', 'l90', 'fell', 'last', 'buys', 'buysL90')} if r['id'] in buyers else None),
    })
final_accounts.sort(key=lambda a: -a['total26'])

meta = {
    'totalAccounts': len(final_accounts),
    'total26': sum(a['total26'] for a in final_accounts),
    'total25': sum(a['total25'] for a in final_accounts),
    'withCarbliss': sum(1 for a in final_accounts if a['existingCarbliss']),
    'lapsed': sum(1 for a in final_accounts if a['lapsed']),
    'isNew': sum(1 for a in final_accounts if a['isNew']),
    'reps': sorted(set(a['rep'] for a in final_accounts)),
    # when this page was built from the exports (shown as the data date; the
    # exports themselves carry no report date)
    'generatedAt': datetime.datetime.utcnow().strftime('%Y-%m-%d'),
    'buyers': buyers_meta,
    'sellSheets': sell_sheets,
}

data_json = json.dumps({'meta': meta, 'accounts': final_accounts, 'buyers': sorted(buyers.values(), key=lambda b: (b['rep'], b['name'])),
                        'loads': sorted(loads, key=lambda l: (l['date'] or '', l['name']), reverse=True)}, separators=(',', ':'))

html = open(HTML, encoding='utf-8').read()
new_html, n = re.subn(
    r'(<script id="tg-data" type="application/json">).*?(</script>)',
    lambda m: m.group(1) + data_json + m.group(2),
    html, count=1, flags=re.S,
)
assert n == 1, 'tg-data script tag not found in index.html'
open(HTML, 'w', encoding='utf-8').write(new_html)

print(f"Wrote {len(final_accounts)} accounts into index.html")
print(json.dumps(meta, indent=2))

# Per-rep copies (tools/rep_slices.py, 2026-10-01): a signed-in rep's browser
# is served only their own rows, so the copies are rebuilt after every run.
if __name__ == "__main__":
    import subprocess as _sp, sys as _sys
    from pathlib import Path as _P
    _root = next(p for p in _P(__file__).resolve().parents if (p / "middleware.js").exists())
    _sp.run([_sys.executable, str(_root / "tools" / "rep_slices.py")], check=True)
