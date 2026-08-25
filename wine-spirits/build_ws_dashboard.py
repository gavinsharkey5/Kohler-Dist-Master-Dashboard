#!/usr/bin/env python3
"""
Builds the embedded <script id="ws-data"> JSON inside wine-spirits/index.html --
the single, unified Wine & Spirits dashboard that replaced the two separate
pages (the "W&S Portfolio" distribution/margin dashboard and the "W&S Execution
Tracker" rep/account dashboard). Both old URLs redirect here.

Usage (from this folder):
    python3 build_ws_dashboard.py
To add new dates without re-pulling the whole year, use ../update_data.py.

WHAT THIS SCRIPT EMITS (changed 2026-08-25)
It no longer pre-aggregates the dashboard. The page now has a global date-range
selector, so every KPI, table and drilldown has to be computable for whatever
range the user picks -- which means the browser needs the underlying cells, not
a fixed set of rollups. This script emits compact lookup tables plus three
columnar blocks:

    sales       one entry per (account, item, month) with volume, in CASES
    invoice     one entry per (margin item, month): cases, revenue, cost, discount
    placements  one entry per (account, item, load-sheet date) from the L6/L90
                placement exports, in cases

and index.html aggregates whatever range is selected. The payload is far
smaller than the old pre-rolled one even though it can answer far more.

VOLUME IS ALWAYS CASES. The Encompass exports report "Units", which is the
selling unit and differs per item (a bottle for some items, a full case for
others). Every units figure is converted to cases IN THIS SCRIPT, at the
product level, before anything is aggregated or emitted -- so nothing
downstream can report units.
    cases = units / unitsPerCase[product]
`unitsPerCase` is derived per product from ws_invoice_trans.csv, which carries
BOTH a Cases and a Num Units column on every invoice line: the ratio is exact
and, as of the 2026-08 refresh, perfectly consistent within each product and
covers 100% of the products in the monthly account file. Products with no
invoice history fall back to 1 unit = 1 case and are named in the run output.

Inputs (keep these filenames when re-exporting):
    ../wine-spirits-portfolio/ws_account_level_by_month.csv   monthly volume grid
    ../wine-spirits-portfolio/ws_invoice_trans.csv            cost/price detail
    ws_l6_months.csv / ws_l90_days.csv                        placements
    ws_account_roster.csv                                     the assigned book

Note: ws_brand_by_item.csv is deliberately unused -- its only content was a
full-calendar-2025 buyer count against a partial-2026 YTD count, the mismatched
comparison this rebuild removed.
"""
import csv
import json
import os
import re
from collections import defaultdict
from datetime import datetime

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
DECLINE_THRESHOLD = -25.0
GAP_MATRIX_FAMILIES = 12


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


class Interner:
    """Small string table so the payload stores indexes, not repeated strings."""
    def __init__(self):
        self.items, self.index = [], {}

    def __call__(self, value):
        value = (value or '').strip()
        if value not in self.index:
            self.index[value] = len(self.items)
            self.items.append(value)
        return self.index[value]


# ---------------------------------------------------------------------------
# 1. Units -> cases, straight from invoice transactions
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

UNITS_PER_CASE, conflicting = {}, []
for pnum, votes in ratio_votes.items():
    if len(votes) > 1:
        conflicting.append(pnum)
    UNITS_PER_CASE[pnum] = max(votes.items(), key=lambda kv: kv[1])[0]


def to_cases(units, pnum):
    return units / UNITS_PER_CASE.get(pnum, 1.0)


# ---------------------------------------------------------------------------
# 2. Assigned roster -- the account universe, rep / city / premise
# ---------------------------------------------------------------------------
reps, cities, premises = Interner(), Interner(), Interner()
roster = {}
with open(ROSTER_CSV, newline='', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        cid = r['Customer Num'].strip()
        roster[cid] = {
            'name': r['Customer Name'].strip(),
            'rep': r['Sales Rep Assigned'].strip() or 'Unassigned',
            'city': r['City'].strip() or 'Unknown',
            'premise': r['On-Off Premise'].strip() or 'Unknown',
        }

# ---------------------------------------------------------------------------
# 3. Monthly grid -> sales cells in cases
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
    MONTHS = sorted(month_cols)
    month_idx = {ym: i for i, ym in enumerate(MONTHS)}

    idx = {name: header.index(name) for name in
           ['On-Off Premise', 'Supplier', 'Brand', 'Brand Family', 'Product Num',
            'Product Name', 'Package', 'Customer ID', 'Customer Name', 'Shipping Address']}

    suppliers, families, brands, channels = Interner(), Interner(), Interner(), Interner()
    items, item_index = [], {}
    accounts, acct_index = [], {}

    sales_a, sales_i, sales_m, sales_c = [], [], [], []

    def account_slot(cust, fallback_name, fallback_premise):
        if cust in acct_index:
            return acct_index[cust]
        info = roster.get(cust)
        name = (info or {}).get('name') or fallback_name
        rep = (info or {}).get('rep') or 'Unassigned'
        city = (info or {}).get('city') or 'Unknown'
        prem = (info or {}).get('premise') or fallback_premise or 'Unknown'
        acct_index[cust] = len(accounts)
        accounts.append({'c': cust, 'n': name, 'r': reps(rep), 'y': cities(city), 'p': premises(prem)})
        return acct_index[cust]

    for row in reader:
        if not row or len(row) < len(header):
            continue
        pnum = row[idx['Product Num']].strip()
        channel = row[idx['On-Off Premise']].strip()
        key = (channel, pnum)
        if key not in item_index:
            item_index[key] = len(items)
            items.append({
                'p': pnum,
                'n': row[idx['Product Name']].strip(),
                'b': brands(row[idx['Brand']].strip()),
                'f': families(row[idx['Brand Family']].strip()),
                's': suppliers(row[idx['Supplier']].strip()),
                'k': row[idx['Package']].strip(),
                'ch': channels(channel),
            })
        ii = item_index[key]
        ai = account_slot(row[idx['Customer ID']].strip(),
                          row[idx['Customer Name']].strip(), channel)
        for ym, (_b, u) in month_cols.items():
            if u is None:
                continue
            units = num(row[u])
            if not units:
                continue
            sales_a.append(ai)
            sales_i.append(ii)
            sales_m.append(month_idx[ym])
            sales_c.append(round(to_cases(units, pnum), 3))

# roster accounts that never bought anything still belong to the universe
for cust, info in roster.items():
    account_slot(cust, info['name'], info['premise'])

missing_ratio = sorted({it['p'] for it in items if it['p'] not in UNITS_PER_CASE})

# ---------------------------------------------------------------------------
# 4. Invoice transactions -> per (margin item, month) cases / revenue / cost
# ---------------------------------------------------------------------------
segments = Interner()
margin_items, margin_index = [], {}
inv_acc = defaultdict(lambda: {'cases': 0.0, 'revenue': 0.0, 'cost': 0.0, 'discount': 0.0})
invoice_dates, skipped_zero_price = [], 0
for row in invoice_rows:
    unit_price = money(row['Unit Price'])
    ext_price = money(row['Ext Price'])
    # Rows with no price at all are load-sheet/inventory movements, not sales.
    if unit_price == 0 and ext_price == 0:
        skipped_zero_price += 1
        continue
    m = prod_pat.match(row['Product'].strip())
    pnum, pname = (m.group(1), m.group(2)) if m else ('', row['Product'].strip())
    key = (row['Segment'].strip(), row['Supplier'].strip(), row['Brand'].strip(), pnum, row['Package'].strip())
    if key not in margin_index:
        margin_index[key] = len(margin_items)
        margin_items.append({
            'p': pnum, 'n': pname, 'g': segments(row['Segment'].strip()),
            's': suppliers(row['Supplier'].strip()), 'b': brands(row['Brand'].strip()),
            'f': families(row['Brand Family'].strip()), 'k': row['Package'].strip(),
        })
    mi = margin_index[key]
    d = datetime.strptime(row['Load Sheet Date'].strip(), '%m/%d/%Y').date()
    invoice_dates.append(d)
    ym = (d.year, d.month)
    if ym not in month_idx:                 # invoice month outside the monthly grid
        continue
    units = num(row['Num Units'])
    cases = num(row['Cases']) or to_cases(units, pnum)
    a = inv_acc[(mi, month_idx[ym])]
    a['cases'] += cases
    a['revenue'] += ext_price
    a['cost'] += money(row['Laid-in Cost']) * units
    a['discount'] += money(row['Discount']) * units

inv_i, inv_m, inv_c, inv_r, inv_k, inv_d = [], [], [], [], [], []
for (mi, m), a in sorted(inv_acc.items()):
    inv_i.append(mi)
    inv_m.append(m)
    inv_c.append(round(a['cases'], 3))
    inv_r.append(round(a['revenue'], 2))
    inv_k.append(round(a['cost'], 2))
    inv_d.append(round(a['discount'], 2))

# ---------------------------------------------------------------------------
# 5. Placement exports -> raw rows for the Lost / At-Risk tab
# ---------------------------------------------------------------------------
placement_rows = {}
for path in (L6_CSV, L90_CSV):
    with open(path, newline='', encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            pc_col = next(c for c in r if c.startswith('Placement Count'))
            cs_col = next(c for c in r if c.startswith('Cases'))
            key = (r['Customer Num'].strip(), r['Product Num'].strip(),
                   r['Load Sheet Date'].strip(), r[pc_col], r[cs_col])
            placement_rows[key] = (r, cs_col)

dms = Interner()
placement_products = Interner()
p_a, p_p, p_d, p_c, p_r, p_m, p_cust, p_name = [], [], [], [], [], [], [], []
p_dates = []
for (cust, pnum, dstr, _pc, _cs), (r, cs_col) in placement_rows.items():
    d = datetime.strptime(dstr, '%m/%d/%Y').date()
    p_dates.append(d)
if p_dates:
    P_START = min(p_dates)
    P_ANCHOR = max(p_dates)
    for (cust, pnum, dstr, _pc, _cs), (r, cs_col) in placement_rows.items():
        d = datetime.strptime(dstr, '%m/%d/%Y').date()
        p_a.append(acct_index.get(cust, -1))
        p_cust.append(cust)
        p_name.append(r['Customer Name'].strip())
        p_p.append(placement_products(r['Product Name'].strip()))
        p_d.append((d - P_START).days)
        p_c.append(round(num(r[cs_col]), 3))
        p_r.append(reps(r['Sales Rep Assigned'].strip() or 'Unassigned'))
        p_m.append(dms(r['District Manager'].strip() or 'Unassigned'))
else:
    P_START = P_ANCHOR = None

# ---------------------------------------------------------------------------
# 6. Assemble
# ---------------------------------------------------------------------------
data = {
    'meta': {
        'months': [f'{MONTH_NAMES[m]} {y}' for (y, m) in MONTHS],
        'monthKeys': [f'{y}-{m:02d}' for (y, m) in MONTHS],
        'monthYear': [y for (y, _m) in MONTHS],
        'monthNum': [m for (_y, m) in MONTHS],
        'invoiceMin': min(invoice_dates).isoformat() if invoice_dates else None,
        'invoiceMax': max(invoice_dates).isoformat() if invoice_dates else None,
        'placementStart': P_START.isoformat() if P_START else None,
        'placementAnchor': P_ANCHOR.isoformat() if P_ANCHOR else None,
        'lostWindowDays': LOST_WINDOW_DAYS,
        'declineThreshold': DECLINE_THRESHOLD,
        'gapFamilies': GAP_MATRIX_FAMILIES,
        'productsMissingCaseRatio': missing_ratio,
        'conflictingCaseRatios': conflicting,
    },
    'reps': reps.items, 'cities': cities.items, 'premises': premises.items,
    'suppliers': suppliers.items, 'families': families.items, 'brands': brands.items,
    'channels': channels.items, 'segments': segments.items, 'dms': dms.items,
    'accounts': accounts,
    'items': items,
    'marginItems': margin_items,
    'placementProducts': placement_products.items,
    'sales': {'a': sales_a, 'i': sales_i, 'm': sales_m, 'c': sales_c},
    'invoice': {'i': inv_i, 'm': inv_m, 'c': inv_c, 'r': inv_r, 'k': inv_k, 'd': inv_d},
    'placements': {'a': p_a, 'p': p_p, 'd': p_d, 'c': p_c, 'r': p_r, 'm': p_m,
                   'cust': p_cust, 'name': p_name},
}

blob = json.dumps(data, separators=(',', ':'))
html = open(HTML, encoding='utf-8').read()
m = re.search(r'(<script id="ws-data" type="application/json">)(.*?)(</script>)', html, re.S)
assert m, 'ws-data script tag not found in index.html'
open(HTML, 'w', encoding='utf-8').write(html[:m.start(2)] + blob + html[m.end(2):])

# ---------------------------------------------------------------------------
# 7. Run summary
# ---------------------------------------------------------------------------
latest = MONTHS[-1]
ytd = [i for i, ym in enumerate(MONTHS) if ym[0] == latest[0] and ym[1] <= latest[1]]
py = [month_idx[(latest[0] - 1, MONTHS[i][1])] for i in ytd if (latest[0] - 1, MONTHS[i][1]) in month_idx]
ytd_set, py_set = set(ytd), set(py)
ytd_cases = sum(c for c, mm in zip(sales_c, sales_m) if mm in ytd_set)
py_cases = sum(c for c, mm in zip(sales_c, sales_m) if mm in py_set)
ytd_buyers = len({a for a, mm in zip(sales_a, sales_m) if mm in ytd_set})
py_buyers = len({a for a, mm in zip(sales_a, sales_m) if mm in py_set})

print(f'Months: {data["meta"]["months"][0]} – {data["meta"]["months"][-1]} ({len(MONTHS)} months)')
print(f'Units->cases ratios: {len(UNITS_PER_CASE)} products '
      f'({len(conflicting)} conflicting, {len(missing_ratio)} with no invoice history)')
if missing_ratio:
    print('  defaulted to 1 unit = 1 case: ' + ', '.join(missing_ratio))
print(f'Accounts: {len(accounts)} on the assigned book · items: {len(items)} · '
      f'margin items: {len(margin_items)}')
print(f'Sales cells: {len(sales_c):,} · invoice cells: {len(inv_c):,} · '
      f'placement rows: {len(p_c):,}')
print(f'YTD ({data["meta"]["months"][ytd[0]]} – {data["meta"]["months"][ytd[-1]]}): '
      f'{ytd_cases:,.1f} cases, {ytd_buyers} buying accounts')
print(f'Prior-year YTD: {py_cases:,.1f} cases, {py_buyers} buying accounts '
      f'({(ytd_cases / py_cases - 1) * 100:+.1f}% cases)' if py_cases else '')
print(f'Placements: {len(p_c):,} rows, anchored {P_ANCHOR}')
print(f'Skipped zero-price invoice rows: {skipped_zero_price:,}')
print(f'Payload: {len(blob):,} bytes embedded in index.html')
