#!/usr/bin/env python3
"""
Regenerates the embedded DATA in index.html from expenses.csv.

Usage (from this folder):
    python3 generate.py

Input:
    expenses.csv - the "Expenses" tab of Supplier Budgets Tracker.xlsx, exported
                    as-is (including the pivot-summary header rows at the top;
                    this script skips down to the real transaction rows itself).
                    Columns expected (in order): Date, Year, Invoice, Vendor Name,
                    Description, Brand Manager, Items Purchased, Total Amount,
                    Kohler Spend, Billback Amt, Billback Received?, Reference #,
                    Code, Account, File Name, Notes, Y/N Helper.

Per-supplier BUDGET figures are NOT in expenses.csv (they live on a separate
tab of the workbook that isn't exported here) - they're maintained by hand in
SUPPLIER_BUDGETS below. Update that dict directly when a budget changes.

ACCOUNT_SUPPLIER_MAP maps each raw "Account" value (or, if Account is blank,
"DESC::<Description>") to the supplier it rolls up to. This mapping isn't
derivable from the export - it was reconstructed from the tracker's existing
data plus manual review of new accounts. When a future expenses.csv introduces
an Account/Description this script doesn't recognize, it's collected under an
"(Unmapped)" pseudo-supplier with budget 0 so nothing silently disappears -
check the printed warning and add a real mapping entry.
"""
import csv, json, re, os
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, 'expenses.csv')
HTML = os.path.join(HERE, 'index.html')

ACCOUNT_SUPPLIER_MAP = {'ADV. FOUR LOKO': 'Four Loko',
 'ADV. GREAT LAKES BREWING CO.': 'Great Lakes',
 'ADV. USBEVERAGE': 'US Beverage',
 'ADVERTISING- COORS': 'Molson Coors',
 'ADVERTISING- HOFBRAU': 'Hofbrau',
 "ADVERTISING- MIKE'S": 'Mark Anthony',
 'ATHletic Brewing Company': 'Athletic',
 'Athletic Brewing Company': 'Athletic',
 'BINDING': 'Binding',
 'BOLD ROCK': 'Bold Rock',
 "Bell's": "Bell's",
 'CAPE MAY TACTICAL': 'Cape May',
 'CARBLISS': 'Carbliss',
 'COORS- TACTICAL': 'Molson Coors',
 'CROWN- TACTICAL': 'Constellation',
 'Caravella': 'Caravella',
 'Carvalier Ventures': 'Carvalier Ventures',
 'Central Beer Tactical': 'Central Beer',
 'Colombian Roots Company': 'Colombian Roots Company',
 'Crescent Distributing': 'Crescent',
 'DESC::PRESTIGE TACTICAL': 'Adv.Prestige Wine Group',
 'Delta': 'Delta Beverages',
 'Drink Four Brewing': 'Drink Four Brewing',
 'EMERGENT BEVERAGES LLC': 'Emergent Beverage',
 'ENCORE TALKHOUSE': 'Encore Talkhouse',
 'EVIL GENIUS BREWING': 'Evil Genius',
 'FAMOSA': 'Famosa',
 'FLYING FISH': 'Flying Fish',
 'FORGED IRISH STOUT': 'Forged Irish Stout',
 'GARAGE BEER': 'Garage Beer',
 'Gambinus Company': 'Shiner',
 'GarAGE BEER': 'Garage Beer',
 'HEINEKEN TACTICAL': 'Heineken',
 'HEINEKEN-LBDF(LOCAL BUS.FUND)': 'Heineken',
 'HOFBRAU': 'Hofbrau',
 'HOP WTR': 'Hop Wtr',
 'Hornell Brewing': 'Hornell Brewing',
 'Lagunitas Brewing Company': 'Lagunitas',
 'Lodo Brands': 'LODO',
 'Long Trail': 'Long Trail',
 'Modern Infusions': 'Modern Infusion',
 'Montauk Brewing Company': 'Montauk',
 'NARRAGANSETT': 'Narragansett',
 'NEW BELGIUM': 'New Belgium',
 'New Belgium': 'New Belgium',
 'PABST BREWING CO(PAB/ST/BALL)': 'Pabst',
 'PAULANER USA TACTICAL': 'Paulaner',
 'Paradisse Spirit': 'Paradisse Spirit',
 'Passion Tree Co': 'Passion Tree Co',
 'Plaid Duck': 'Plaid Duck',
 'Prestige': 'Adv.Prestige Wine Group',
 'RADEBERGER GRUPPE USA': 'Radeberger',
 'SAM ADAMS- TACTICAL': 'Boston Beer',
 'SAPPORO': 'Sapporo',
 'SIERRA NEVADA': 'Sierra Nevada',
 'SIXPOINT': 'Sixpoint',
 'SOUTHERN TIER': 'Southern Tier',
 'SOUTHERN TIER DISTILLING': 'Southern Tier',
 'STONE BREWING CO': 'Stone Brewing Co',
 'Saratoga': 'Saratoga',
 'Shaw-Ross Inter. Imports': 'Shaw-Ross Inter. Imports',
 'TALKHOUSE ENCORE': 'Encore Talkhouse',
 'THE BARDSTOWN BOURBON COMPANY': 'Bardstown',
 'THE BARN (BARN BREW CO)': 'Barn Brew',
 'TILRAY ALTERNATIVE BEVERAGE': 'Tilray Alternative Beverage',
 'TOTAL BEVERAGE SOLUTION': 'Total Beverage',
 'VICTORY BREWING COMPANY': 'Victory Brewing Company',
 'Vermont Cider Company': 'US Beverage',
 'Vinaio Imports': 'Vinaio Imports',
 'Viva Beverages': 'Viva Beverages',
 'YUENGLING- TACTICAL': 'Yuengling',
 'STRIPED PIG DIST': 'Striped Pig Distilling',
 'FIFCO': 'FIFCO USA',
 'PIO IMPORTS': 'Pio Imports'}

SUPPLIER_BUDGETS = {'Adv.Prestige Wine Group': 0.0,
 'Alias Brewing': 0.0,
 'Athletic': 12500.0,
 'Bardstown': 0.0,
 'Barn Brew': 0.0,
 "Bell's": 0.0,
 'Binding': 0.0,
 'Bold Rock': 0.0,
 'Boston Beer': 0.0,
 "Brewt'S Mixers": 0.0,
 'Cape May': 0.0,
 'Caravella': 0.0,
 'Carbliss': 0.0,
 'Carvalier Ventures': 0.0,
 'Central Beer': 0.0,
 'Colombian Roots Company': 0.0,
 'Constellation': 853388.0,
 'Crescent': 0.0,
 'Delta Beverages': 0.0,
 "Doc's Cider": 0.0,
 'Drink Four Brewing': 0.0,
 'Duclaw': 0.0,
 'Emergent Beverage': 0.0,
 'Encore Talkhouse': 0.0,
 'Evil Genius': 0.0,
 'FX Matt': 15000.0,
 'Famosa': 30000.0,
 'Flying Fish': 0.0,
 'Forged Irish Stout': 0.0,
 'Four Loko': 0.0,
 'Garage Beer': 0.0,
 'Global Beer': 3735.0,
 'Great Lakes': 4000.0,
 'Green River': 0.0,
 'Heineken': 171178.0,
 'Hofbrau': 31000.0,
 'Hop Wtr': 0.0,
 'Hornell Brewing': 0.0,
 'LODO': 0.0,
 'Lagunitas': 63769.0,
 'Little Water': 0.0,
 'Long Trail': 0.0,
 'Mark Anthony': 106232.0,
 'Modern Infusion': 0.0,
 'Molson Coors': 1525568.0,
 'Montauk': 0.0,
 'Nan': 0.0,
 'Narragansett': 0.0,
 'New Belgium': 0.0,
 'Pabst': 37500.0,
 'Paradisse Spirit': 0.0,
 'Passion Tree Co': 0.0,
 'Paulaner': 16172.0,
 'Plaid Duck': 0.0,
 'Primos Imports LLC': 0.0,
 'Radeberger': 15000.0,
 'Sapporo': 0.0,
 'Saratoga': 0.0,
 'Shaw-Ross Inter. Imports': 0.0,
 'Shiner': 0.0,
 'Sierra Nevada': 22800.0,
 'Sixpoint': 0.0,
 'Southern Tier': 0.0,
 'Stone Brewing Co': 0.0,
 'Tilray Alternative Beverage': 0.0,
 'Total Beverage': 0.0,
 'US Beverage': 0.0,
 'Vermont Hard Cider': 0.0,
 'Victory Brewing Company': 0.0,
 'Vinaio Imports': 0.0,
 'Viva Beverages': 0.0,
 'Yuengling': 112769.0,
 'Striped Pig Distilling': 0.0,
 'FIFCO USA': 0.0,
 'Pio Imports': 0.0}

SUPPLIER_ORDER = ['Molson Coors',
 'Constellation',
 'Heineken',
 'Yuengling',
 'Mark Anthony',
 'Lagunitas',
 'Pabst',
 'Hofbrau',
 'Sierra Nevada',
 'Paulaner',
 'Radeberger',
 'FX Matt',
 'Athletic',
 'Great Lakes',
 'Global Beer',
 'Victory Brewing Company',
 'Boston Beer',
 'Total Beverage',
 'Garage Beer',
 'Sixpoint',
 'Montauk',
 'Sapporo',
 'Central Beer',
 'Flying Fish',
 'Four Loko',
 'Encore Talkhouse',
 'New Belgium',
 'Carvalier Ventures',
 'Famosa',
 'Barn Brew',
 'Modern Infusion',
 'Adv.Prestige Wine Group',
 'Southern Tier',
 'Cape May',
 'Narragansett',
 'US Beverage',
 'Bold Rock',
 'Viva Beverages',
 'Crescent',
 'Passion Tree Co',
 'Evil Genius',
 'Tilray Alternative Beverage',
 'Emergent Beverage',
 'LODO',
 'Forged Irish Stout',
 'Bardstown',
 'Vinaio Imports',
 'Stone Brewing Co',
 'Delta Beverages',
 'Saratoga',
 'Hop Wtr',
 'Hornell Brewing',
 'Plaid Duck',
 'Caravella',
 'Binding',
 "Bell's",
 'Alias Brewing',
 'Duclaw',
 "Doc's Cider",
 "Brewt'S Mixers",
 'Green River',
 'Nan',
 'Little Water',
 'Long Trail',
 'Primos Imports LLC',
 'Shiner',
 'Vermont Hard Cider',
 'Carbliss',
 'Colombian Roots Company',
 'Drink Four Brewing',
 'Paradisse Spirit',
 'Shaw-Ross Inter. Imports']


def money(s):
    s = (s or '').strip().replace('$', '').replace(',', '')
    if not s:
        return None
    neg = s.startswith('(') and s.endswith(')')
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def parse_ts(date_str):
    date_str = date_str.strip()
    for fmt in ('%m/%d/%Y', '%m/%d/%y'):
        try:
            d = datetime.strptime(date_str, fmt)
            return int(d.strftime('%Y%m%d'))
        except ValueError:
            continue
    return 0


rows = list(csv.reader(open(CSV_PATH, encoding='utf-8-sig')))
header_idx = next(i for i, r in enumerate(rows) if r[:1] == ['Date'])
data_rows = rows[header_idx + 1:]

lineitems = []
unmapped = {}
for r in data_rows:
    if len(r) < 14:
        continue
    date_str = r[0].strip()
    account = r[13].strip()
    desc = r[4].strip()
    total = money(r[7])
    kohler = money(r[8])
    if not date_str or not (account or desc) or (total is None and kohler is None):
        continue

    key = account if account else ('DESC::' + desc)
    supplier = ACCOUNT_SUPPLIER_MAP.get(key)
    if supplier is None:
        supplier = '(Unmapped)'
        unmapped[key] = unmapped.get(key, 0.0) + (kohler or 0.0)

    bb = money(r[9]) or 0.0
    rec = r[10].strip().upper()
    rec = 'Y' if rec == 'Y' else ('N' if rec else '')

    lineitems.append({
        'date': date_str, 'ts': parse_ts(date_str), 'supplier': supplier,
        'vendor': r[3].strip(), 'desc': desc, 'items': r[6].strip(), 'mgr': r[5].strip(),
        'total': total or 0.0, 'kohler': kohler or 0.0, 'bb': bb, 'rec': rec,
        'invoice': r[2].strip(), 'code': r[12].strip(), 'account': account,
    })

if unmapped:
    print(f"WARNING: {len(unmapped)} account/description value(s) have no supplier mapping — "
          f"filed under '(Unmapped)'. Add them to ACCOUNT_SUPPLIER_MAP in this script:")
    for k, v in sorted(unmapped.items(), key=lambda x: -x[1]):
        print(f"    {k!r}: ${v:,.2f}")

lineitems.sort(key=lambda li: li['ts'])

# ---------- Aggregate accounts within each supplier ----------
acct_agg = {}  # (supplier, account_display) -> {spend, bb_received, bb_outstanding}
supplier_seen = set()
for li in lineitems:
    supplier_seen.add(li['supplier'])
    acct_label = li['account'] if li['account'] else '(none)'
    key = (li['supplier'], acct_label)
    if key not in acct_agg:
        acct_agg[key] = {'spend': 0.0, 'bb_received': 0.0, 'bb_outstanding': 0.0}
    a = acct_agg[key]
    a['spend'] += li['kohler']
    if li['bb'] > 0:
        if li['rec'] == 'Y':
            a['bb_received'] += li['bb']
        else:
            a['bb_outstanding'] += li['bb']

budgets = dict(SUPPLIER_BUDGETS)
order = list(SUPPLIER_ORDER)
for sup in sorted(supplier_seen):
    if sup not in budgets:
        budgets[sup] = 0.0
    if sup not in order:
        order.append(sup)

suppliers = []
for sup in order:
    accts = []
    for (s, acct_label), a in acct_agg.items():
        if s == sup:
            accts.append({
                'account': acct_label, 'spend': round(a['spend'], 2),
                'bb_received': round(a['bb_received'], 2), 'bb_outstanding': round(a['bb_outstanding'], 2),
            })
    accts.sort(key=lambda a: a['account'])
    spend = sum(a['spend'] for a in accts)
    bb_received = sum(a['bb_received'] for a in accts)
    bb_outstanding = sum(a['bb_outstanding'] for a in accts)
    budget = budgets.get(sup, 0.0)
    pct = round(spend / budget * 100, 1) if budget > 0 else None
    suppliers.append({
        'supplier': sup, 'budget': budget, 'spend': round(spend, 2), 'pct': pct,
        'bb_received': round(bb_received, 2), 'bb_outstanding': round(bb_outstanding, 2),
        'accounts': accts,
    })

data = {'suppliers': suppliers, 'lineitems': lineitems}
data_json = json.dumps(data, separators=(',', ':'))

html = open(HTML, encoding='utf-8').read()
new_html, n = re.subn(r'const DATA = \{.*?\};', 'const DATA = ' + data_json + ';', html, count=1, flags=re.S)
assert n == 1, 'DATA assignment not found in index.html'
open(HTML, 'w', encoding='utf-8').write(new_html)

total_budget = sum(s['budget'] for s in suppliers)
total_spend = sum(s['spend'] for s in suppliers)
print(f"Wrote {len(suppliers)} suppliers, {len(lineitems)} line items.")
print(f"Total budget ${total_budget:,.0f} · Total spend ${total_spend:,.0f} "
      f"({total_spend/total_budget*100:.1f}% of budget)" if total_budget else "")
