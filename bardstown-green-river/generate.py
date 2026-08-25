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
    To add new dates without re-pulling the year, use ../update_data.py.

WHAT THIS SCRIPT EMITS (changed 2026-08-25)
It no longer pre-aggregates anything. The dashboard now has a global date-range
selector, so every KPI, table and drilldown has to be computable for an
arbitrary start/end date -- which means the browser needs the transactions
themselves, not a fixed set of rollups. This script therefore emits:

    * the account, product and brand-line lookup tables
    * one compact columnar block of every order line: account index, product
      index, day offset from the first date in the file, cases, revenue, gross
      profit
    * the assigned-account universe (per premise, and per city)

and index.html does all the aggregation client-side for whatever range is
selected. The whole payload is ~10x smaller than the old pre-rolled one.

VOLUME IS ALWAYS CASES. The export carries a real "Cases" column (1 bottle =
.17 cases, i.e. 6 bottles to a case) and that column is the single source of
volume. The only place bottle counts survive is the "bottle vs. case"
first-order-size segmentation, which is by definition a question about order
size; it reports no volume of its own.

CORE definitions (from Kohler, hard-coded below):
    Green River CORE  = Bourbon, Full Proof, Rye, Wheated, Honey (5 SKUs)
    Bardstown Bourbon CORE = Bottled-in-Bond, Bourbon, Double Barrel Rye, High Wheat (4 SKUs)

BRAND LINES (the "four brands" in the rep placement-gap matrix) are the four
sellable lines this book is built around -- see BRAND_LINES below. Edit that
list if Kohler re-cuts the lineup.
"""
import csv, json, re, os, datetime
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, 'RDE_Bardstown_Green_River_Retention_History.csv')
HTML = os.path.join(HERE, 'index.html')
ROSTER_CSV = os.path.join(HERE, '..', 'wine-spirits', 'ws_account_roster.csv')
WS_ROSTER_CSV = os.path.join(HERE, '..', 'wine-spirits-portfolio', 'ws_account_level_by_month.csv')

GREEN_RIVER_CORE = ['201051', '201054', '201052', '201053', '201077']
BARDSTOWN_CORE = ['201055', '201056', '201058', '201057']
BRANDS = ['Green River', 'Bardstown Bourbon']
CORE_SKUS = {'Green River': GREEN_RIVER_CORE, 'Bardstown Bourbon': BARDSTOWN_CORE}

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

BOTTLES_PER_CASE = 6


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


# ---------- premise + assigned account universe ----------
premise_by_cust = {}
with open(WS_ROSTER_CSV, newline='', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        cid = r['Customer ID'].strip()
        prem = r['On-Off Premise'].strip()
        if cid and cid not in premise_by_cust:
            premise_by_cust[cid] = prem

universe = {'all': 0, 'on': 0, 'off': 0}
city_universe = defaultdict(int)
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
        city = (r['City'] or '').strip()
        if city and city != 'Unknown':
            city_universe[city] += 1

# ---------- load transactions ----------
with open(CSV_PATH, newline='', encoding='utf-8-sig') as f:
    raw = list(csv.DictReader(f))

rev_col = next(c for c in raw[0] if c.startswith('Revenue'))
cases_col = next(c for c in raw[0] if c.startswith('Cases'))
bottles_col = next(c for c in raw[0] if c.startswith('Units'))   # first-order size only
gp_col = next(c for c in raw[0] if c.startswith('Gross Profit'))

records = []
for r in raw:
    b = brand_of(r['Product Name'])
    if not b:
        continue
    records.append({
        'cust': r['Customer Num'].strip(), 'name': r['Customer Name'].strip(),
        'rep': r['Sales Rep Assigned'].strip() or 'Unassigned',
        'area': r['Distribution Area'].strip() or 'Unknown',
        'city': r['City'].strip() or 'Unknown',
        'prod': r['Product Num'].strip(), 'prodName': r['Product Name'].strip(), 'brand': b,
        'date': parse_date(r['Date']), 'cases': num(r[cases_col]),
        'bottles': num(r[bottles_col]),
        'revenue': money(r[rev_col]), 'gp': money(r[gp_col]),
    })
records.sort(key=lambda x: x['date'])

START = records[0]['date']
END = records[-1]['date']

# ---------- lookup tables ----------
acct_index, accounts = {}, []
for r in records:
    if r['cust'] in acct_index:
        continue
    acct_index[r['cust']] = len(accounts)
    accounts.append({
        'id': r['cust'], 'name': r['name'], 'rep': r['rep'], 'area': r['area'],
        'city': r['city'], 'premise': premise_by_cust.get(r['cust'], 'Unknown'),
    })

prod_index, products = {}, []
for r in sorted(records, key=lambda x: x['prod']):
    if r['prod'] in prod_index:
        continue
    prod_index[r['prod']] = len(products)
    products.append({
        'num': r['prod'], 'name': r['prodName'], 'brand': r['brand'],
        'line': LINE_OF_PRODUCT.get(r['prod'], LINE_FALLBACK[r['brand']]),
        'core': r['prod'] in CORE_SKUS[r['brand']],
        'shortName': re.sub(r'\s+1/.*$', '', r['prodName']),
    })

# ---------- columnar transaction block ----------
col_a, col_p, col_d, col_c, col_r, col_g, col_b = [], [], [], [], [], [], []
for r in records:
    col_a.append(acct_index[r['cust']])
    col_p.append(prod_index[r['prod']])
    col_d.append((r['date'] - START).days)
    col_c.append(round(r['cases'], 3))
    col_r.append(round(r['revenue'], 2))
    col_g.append(round(r['gp'], 2))
    col_b.append(int(r['bottles']))

unmatched = sorted({r['cust'] for r in records if premise_by_cust.get(r['cust'], 'Unknown') == 'Unknown'})

payload = {
    'meta': {
        'start': START.isoformat(), 'end': END.isoformat(),
        'rows': len(records),
        'brands': BRANDS,
        'bottlesPerCase': BOTTLES_PER_CASE,
    },
    'universe': universe,
    'cityUniverse': dict(sorted(city_universe.items())),
    'premiseCoverage': {'totalAccounts': len(accounts), 'unmatchedAccounts': len(unmatched)},
    'accounts': accounts,
    'products': products,
    'brandLines': [{'key': l['key'], 'label': l['label'], 'brand': l['brand'],
                    'products': [prod_index[p] for p in l['products'] if p in prod_index]}
                   for l in BRAND_LINES],
    'coreSkus': {b: [prod_index[p] for p in CORE_SKUS[b] if p in prod_index] for b in BRANDS},
    'tx': {'a': col_a, 'p': col_p, 'd': col_d, 'c': col_c, 'r': col_r, 'g': col_g, 'b': col_b},
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

# ---------- run summary ----------
def window(lo, hi):
    return [r for r in records if lo <= r['date'] <= hi]


ytd_lo = datetime.date(END.year, 1, 1)
try:
    py_hi = END.replace(year=END.year - 1)
except ValueError:
    py_hi = END.replace(year=END.year - 1, day=28)
py_lo = datetime.date(END.year - 1, 1, 1)

print(f'Rows: {len(records)}  ·  window {START} – {END}')
print(f'Accounts in the export: {len(accounts)} '
      f'({len(unmatched)} with no known premise)')
print(f'Assigned account universe: {universe["all"]} '
      f'({universe["on"]} on-premise, {universe["off"]} off-premise)')
print(f'Payload: {len(data_json):,} bytes embedded in index.html')
for b in BRANDS:
    ytd = [r for r in window(ytd_lo, END) if r['brand'] == b]
    py = [r for r in window(py_lo, py_hi) if r['brand'] == b]
    ytd_cases = sum(r['cases'] for r in ytd)
    py_cases = sum(r['cases'] for r in py)
    delta = f'{(ytd_cases / py_cases - 1) * 100:+.1f}%' if py_cases else 'n/a'
    print(f'  {b}: YTD {ytd_cases:,.1f} cases vs {py_cases:,.1f} prior-year YTD ({delta}), '
          f'{len({r["cust"] for r in ytd})} buying accounts')
