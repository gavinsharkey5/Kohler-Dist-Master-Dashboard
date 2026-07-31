#!/usr/bin/env python3
"""
Builds the embedded <script id="ws-data"> JSON inside index.html for the
Wine & Spirits Distribution, Sales & Margin dashboard, from three raw RDE /
Encompass exports. This script fully regenerates that JSON block every run
-- it does not hand-edit the HTML otherwise.

Inputs (keep these filenames when re-exporting):
    ws_account_level_by_month.csv   RDE "WS Account Level by Month" export.
        One row per (On/Off Premise, Product, Customer) with a Buyer Count
        and Units pair for every month from 2025/1 through the latest
        complete month. This is the source for:
          - the Account Detail tab (rolling 12-month grid per account/item)
          - trailing-window "Accounts Purchasing" (AP) counts in the
            Distribution tab (Total/lifetime, 1YR, 6M, ~90-Day), computed
            by counting distinct Customer IDs with Units > 0 in each window
          - company-wide AP KPIs on the Overview tab

    ws_brand_by_item.csv   RDE "WS Brand by Item" export. One row per
        (On/Off Premise, Product), with full-calendar-year 2025 Buyer
        Count/Units vs. year-to-date 2026 Buyer Count/Units. Merged into
        the Distribution tab as a supplementary "FY25 vs FY26 YTD" YoY
        reference alongside the rolling AP windows above.

    ws_invoice_trans.csv   Encompass invoice transaction export, one row
        per invoice line (Segment, Supplier, Brand Family, Brand, Product,
        Package, Cases, Num Units, Tax Cost, Laid-in Cost, Discount,
        Participation, Full Price, Unit Price, Ext Price, Load Sheet Date).
        This is the ONLY source with real cost/price data, so it drives
        every number on the Margins tab: realized $ margin/unit and %
        margin per item, computed as (Unit Price - Laid-in Cost), weighted
        by units actually sold across the file's date range. There is no
        per-brand FOB/Tax/Distrib-Allowance/Suggested-Retail cost sheet for
        the whole portfolio (only a single sample SKU in the "Pricing"
        request tab), so this dashboard reports REALIZED margin from actual
        sales rather than reconstructing the theoretical case-pricing-tier
        template.

Definitions (see also the in-page glossary tooltips):
    AP (Accounts Purchasing) = distinct accounts ("Buyers" in Encompass
        terms) with at least one unit sold in the window.
    Total AP  = lifetime distinct buyers across every month in the file
                (2025/1 through the latest month) -- NOT a %-of-market
                figure, just the broadest buyer-count window available.
    1YR AP    = distinct buyers in the trailing 12 complete months.
    6M AP     = distinct buyers in the trailing 6 complete months.
    90D AP    = distinct buyers in the trailing 3 calendar months, used as
                an approximation of a rolling 90-day window since the
                source data is monthly, not daily.
    Realized Margin $/Unit = Unit Price - Laid-in Cost, weighted by units
        sold. Realized Margin % = that $ figure divided by Unit Price.

To refresh:
    1. Re-export all three RDE/Encompass reports, keeping the same columns
       and filenames (overwrite the CSVs in this folder).
    2. Run: python3 build_dashboard.py
    3. Commit and push.
"""
import csv
import json
import os
import re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ACCOUNT_MONTH_CSV = os.path.join(HERE, 'ws_account_level_by_month.csv')
BRAND_ITEM_CSV = os.path.join(HERE, 'ws_brand_by_item.csv')
INVOICE_CSV = os.path.join(HERE, 'ws_invoice_trans.csv')
HTML = os.path.join(HERE, 'index.html')

MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


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


# ---------------------------------------------------------------------------
# 1. Account-level-by-month: account detail rows + distribution AP windows
# ---------------------------------------------------------------------------
with open(ACCOUNT_MONTH_CSV, newline='', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    header = next(reader)

    month_cols = {}  # (year,month) -> (buyerIdx, unitsIdx)
    pat = re.compile(r'(Buyer Count|Units)\s+(\d{4})/(\d{1,2})')
    for i, h in enumerate(header):
        m = pat.search(h)
        if not m:
            continue
        kind, yr, mo = m.group(1), int(m.group(2)), int(m.group(3))
        ym = (yr, mo)
        b, u = month_cols.get(ym, (None, None))
        if kind == 'Buyer Count':
            b = i
        else:
            u = i
        month_cols[ym] = (b, u)

    all_months = sorted(month_cols.keys())
    latest = all_months[-1]

    def months_back(end, n):
        """Return the list of (year,month) tuples ending at `end`, n months long."""
        out = []
        y, m = end
        for _ in range(n):
            out.append((y, m))
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        return list(reversed(out))

    window_1yr = months_back(latest, 12)
    window_6mo = months_back(latest, 6)
    window_90d = months_back(latest, 3)
    window_prior_90d = months_back(months_back(window_90d[0], 2)[0], 3)  # the 3 months before window_90d

    idx_onoff = header.index('On-Off Premise')
    idx_supplier = header.index('Supplier')
    idx_brand = header.index('Brand')
    idx_family = header.index('Brand Family')
    idx_pnum = header.index('Product Num')
    idx_pname = header.index('Product Name')
    idx_pkg = header.index('Package')
    idx_custid = header.index('Customer ID')
    idx_custname = header.index('Customer Name')
    idx_addr = header.index('Shipping Address')

    account_rows = []
    dist_acc = defaultdict(lambda: {
        'onoff': None, 'supplier': None, 'brand': None, 'family': None,
        'pnum': None, 'pname': None, 'pkg': None,
        'buyers_total': set(), 'buyers_1yr': set(), 'buyers_6mo': set(), 'buyers_90d': set(), 'buyers_prior_90d': set(),
        'units_total': 0.0, 'units_1yr': 0.0, 'units_6mo': 0.0, 'units_90d': 0.0, 'units_prior_90d': 0.0,
    })

    r12_cols = window_1yr  # the account-detail grid shows the same trailing-12-month window

    for row in reader:
        if not row or len(row) < len(header):
            continue
        onoff = row[idx_onoff].strip()
        pnum = row[idx_pnum].strip()
        key = (onoff, pnum)
        d = dist_acc[key]
        d['onoff'] = onoff
        d['supplier'] = row[idx_supplier].strip()
        d['brand'] = row[idx_brand].strip()
        d['family'] = row[idx_family].strip()
        d['pnum'] = pnum
        d['pname'] = row[idx_pname].strip()
        d['pkg'] = row[idx_pkg].strip()

        custid = row[idx_custid].strip()
        monthly_units = {}
        for ym in all_months:
            _, uidx = month_cols[ym]
            monthly_units[ym] = num(row[uidx]) if uidx is not None else 0.0

        u_total = sum(monthly_units.values())
        u_1yr = sum(monthly_units[ym] for ym in window_1yr)
        u_6mo = sum(monthly_units[ym] for ym in window_6mo)
        u_90d = sum(monthly_units[ym] for ym in window_90d)
        u_prior_90d = sum(monthly_units[ym] for ym in window_prior_90d)

        if u_total > 0:
            d['buyers_total'].add(custid)
            d['units_total'] += u_total
        if u_1yr > 0:
            d['buyers_1yr'].add(custid)
            d['units_1yr'] += u_1yr
        if u_6mo > 0:
            d['buyers_6mo'].add(custid)
            d['units_6mo'] += u_6mo
        if u_90d > 0:
            d['buyers_90d'].add(custid)
            d['units_90d'] += u_90d
        if u_prior_90d > 0:
            d['buyers_prior_90d'].add(custid)
            d['units_prior_90d'] += u_prior_90d

        r12_vol = sum(monthly_units[ym] for ym in r12_cols)
        if r12_vol > 0 or u_total > 0:
            account_rows.append({
                'onoff': onoff,
                'supplier': row[idx_supplier].strip(),
                'brand': row[idx_brand].strip(),
                'family': row[idx_family].strip(),
                'pnum': pnum,
                'pname': row[idx_pname].strip(),
                'pkg': row[idx_pkg].strip(),
                'custId': custid,
                'custName': row[idx_custname].strip(),
                'address': row[idx_addr].strip(),
                'r12Vol': round(r12_vol, 2),
                'months': [round(monthly_units[ym], 2) for ym in r12_cols],
            })

account_rows.sort(key=lambda r: -r['r12Vol'])
r12_month_labels = [f'{MONTH_NAMES[m]} {y}' for (y, m) in r12_cols]

# ---------------------------------------------------------------------------
# 2. Brand-by-item: FY25 vs FY26 YTD YoY reference, merged into distribution
# ---------------------------------------------------------------------------
yoy_by_key = {}
with open(BRAND_ITEM_CSV, newline='', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        onoff = row['On-Off Premise'].strip()
        pnum = row['Product Num'].strip()
        yoy_by_key[(onoff, pnum)] = {
            'buyers25': num(row['Buyer Count   2025']),
            'buyers26': num(row['Buyer Count   2026']),
            'units25': num(row['Units   2025']),
            'units26': num(row['Units   2026']),
        }

# ---------------------------------------------------------------------------
# Assemble the Distribution tab from dist_acc + yoy reference
# ---------------------------------------------------------------------------
distribution = []
for (onoff, pnum), d in dist_acc.items():
    yoy = yoy_by_key.get((onoff, pnum), {})
    ap90_now = len(d['buyers_90d'])
    ap90_prior = len(d['buyers_prior_90d'])
    if ap90_now > ap90_prior:
        trend = 'up'
    elif ap90_now < ap90_prior:
        trend = 'down'
    else:
        trend = 'flat'
    distribution.append({
        'onoff': d['onoff'], 'supplier': d['supplier'], 'brand': d['brand'], 'family': d['family'],
        'pnum': d['pnum'], 'pname': d['pname'], 'pkg': d['pkg'],
        'apTotal': len(d['buyers_total']), 'ap1yr': len(d['buyers_1yr']), 'ap6mo': len(d['buyers_6mo']),
        'ap90d': ap90_now, 'ap90dPrior': ap90_prior, 'trend': trend,
        'unitsTotal': round(d['units_total'], 1), 'units1yr': round(d['units_1yr'], 1),
        'units6mo': round(d['units_6mo'], 1), 'units90d': round(d['units_90d'], 1),
        'buyers25': yoy.get('buyers25', 0), 'buyers26': yoy.get('buyers26', 0),
        'unitsFy25': yoy.get('units25', 0), 'unitsFy26': yoy.get('units26', 0),
    })
distribution.sort(key=lambda r: -r['ap1yr'])

# ---------------------------------------------------------------------------
# 3. Invoice transactions: realized margins by item
# ---------------------------------------------------------------------------
prod_pat = re.compile(r'^(\d+)\s+(.*)$')
margin_acc = defaultdict(lambda: {
    'segment': None, 'supplier': None, 'brand': None, 'family': None, 'pnum': None, 'pname': None, 'pkg': None,
    'units': 0.0, 'cases': 0.0, 'revenue': 0.0, 'cost': 0.0, 'discountTotal': 0.0,
    'minDate': None, 'maxDate': None,
})
invoice_dates = []
skipped_zero_price_rows = 0
with open(INVOICE_CSV, newline='', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        unit_price = money(row['Unit Price'])
        ext_price = money(row['Ext Price'])
        # Rows with both $0 Unit Price and $0 Ext Price aren't paid sales --
        # they read as inventory/load-sheet movements bundled into this same
        # export (large same-day batches, e.g. 50-60 units on one date, with
        # no revenue at all). Counting their Laid-in Cost against zero
        # revenue produces nonsensical negative-thousand-percent "margins",
        # so they're excluded from the Margins tab entirely.
        if unit_price == 0 and ext_price == 0:
            skipped_zero_price_rows += 1
            continue

        product_raw = row['Product'].strip()
        m = prod_pat.match(product_raw)
        pnum, pname = (m.group(1), m.group(2)) if m else ('', product_raw)
        key = (row['Segment'].strip(), row['Supplier'].strip(), row['Brand'].strip(), pnum, row['Package'].strip())
        a = margin_acc[key]
        a['segment'] = row['Segment'].strip()
        a['supplier'] = row['Supplier'].strip()
        a['brand'] = row['Brand'].strip()
        a['family'] = row['Brand Family'].strip()
        a['pnum'] = pnum
        a['pname'] = pname
        a['pkg'] = row['Package'].strip()

        units = num(row['Num Units'])
        laid_in = money(row['Laid-in Cost'])
        discount = money(row['Discount'])

        a['units'] += units
        a['cases'] += num(row['Cases'])
        a['revenue'] += ext_price
        a['cost'] += laid_in * units
        a['discountTotal'] += discount * units
        invoice_dates.append(row['Load Sheet Date'].strip())

margins = []
for key, a in margin_acc.items():
    units = a['units']
    revenue = a['revenue']
    cost = a['cost']
    margin_dollar_total = revenue - cost
    avg_unit_price = revenue / units if units else 0.0
    avg_laid_in = cost / units if units else 0.0
    margin_per_unit = avg_unit_price - avg_laid_in
    margin_pct = (margin_per_unit / avg_unit_price * 100) if avg_unit_price else 0.0
    margins.append({
        'segment': a['segment'], 'supplier': a['supplier'], 'brand': a['brand'], 'family': a['family'],
        'pnum': a['pnum'], 'pname': a['pname'], 'pkg': a['pkg'],
        'units': round(units, 1), 'cases': round(a['cases'], 2),
        'revenue': round(revenue, 2), 'avgUnitPrice': round(avg_unit_price, 2),
        'avgLaidInCost': round(avg_laid_in, 2), 'marginPerUnit': round(margin_per_unit, 2),
        'marginPct': round(margin_pct, 1), 'marginTotal': round(margin_dollar_total, 2),
        'avgDiscountPerUnit': round(a['discountTotal'] / units, 2) if units else 0.0,
    })
margins.sort(key=lambda r: -r['revenue'])

invoice_dt = [d for d in invoice_dates if d]
def parse_mdy(s):
    mm, dd, yy = s.split('/')
    return (int(yy), int(mm), int(dd))
invoice_dt.sort(key=parse_mdy)
invoice_date_min = invoice_dt[0] if invoice_dt else None
invoice_date_max = invoice_dt[-1] if invoice_dt else None

# ---------------------------------------------------------------------------
# 4. Overview KPIs
# ---------------------------------------------------------------------------
total_revenue = sum(m['revenue'] for m in margins)
total_cost = sum(m['avgLaidInCost'] * m['units'] for m in margins)
total_margin = total_revenue - total_cost
total_units_sold = sum(m['units'] for m in margins)
total_cases_sold = sum(m['cases'] for m in margins)

lifetime_accounts = set()
ap_1yr_accounts = set()
ap_6mo_accounts = set()
ap_90d_accounts = set()
for r in account_rows:
    pass  # account_rows already filtered; recompute company-wide sets below from dist source directly

with open(ACCOUNT_MONTH_CSV, newline='', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    header2 = next(reader)
    for row in reader:
        if not row or len(row) < len(header2):
            continue
        custid = row[idx_custid].strip()
        u_total = sum(num(row[month_cols[ym][1]]) for ym in all_months if month_cols[ym][1] is not None)
        u_1yr = sum(num(row[month_cols[ym][1]]) for ym in window_1yr if month_cols[ym][1] is not None)
        u_6mo = sum(num(row[month_cols[ym][1]]) for ym in window_6mo if month_cols[ym][1] is not None)
        u_90d = sum(num(row[month_cols[ym][1]]) for ym in window_90d if month_cols[ym][1] is not None)
        if u_total > 0:
            lifetime_accounts.add(custid)
        if u_1yr > 0:
            ap_1yr_accounts.add(custid)
        if u_6mo > 0:
            ap_6mo_accounts.add(custid)
        if u_90d > 0:
            ap_90d_accounts.add(custid)

brand_families = sorted(set(d['family'] for d in distribution if d['family']))
suppliers = sorted(set(d['supplier'] for d in distribution if d['supplier']))
items = set((d['onoff'], d['pnum']) for d in distribution)

gaining = sum(1 for d in distribution if d['trend'] == 'up')
declining = sum(1 for d in distribution if d['trend'] == 'down')

# Brand-family rollups for top/bottom callouts on the Overview tab
family_rollup = defaultdict(lambda: {'revenue': 0.0, 'cost': 0.0, 'units': 0.0})
for m in margins:
    fr = family_rollup[m['family']]
    fr['revenue'] += m['revenue']
    fr['cost'] += m['avgLaidInCost'] * m['units']
    fr['units'] += m['units']

family_summary = []
for fam, fr in family_rollup.items():
    if not fam:
        continue
    margin_pct = ((fr['revenue'] - fr['cost']) / fr['revenue'] * 100) if fr['revenue'] else 0.0
    family_summary.append({
        'family': fam, 'revenue': round(fr['revenue'], 2), 'units': round(fr['units'], 1),
        'marginPct': round(margin_pct, 1), 'marginTotal': round(fr['revenue'] - fr['cost'], 2),
    })
top_revenue_families = sorted(family_summary, key=lambda x: -x['revenue'])[:8]
MIN_UNITS_FOR_MARGIN_WATCH = 12
margin_watch = sorted(
    [m for m in family_summary if m['units'] >= MIN_UNITS_FOR_MARGIN_WATCH],
    key=lambda x: x['marginPct']
)[:8]

overview = {
    'asOfLatestMonth': f'{MONTH_NAMES[latest[1]]} {latest[0]}',
    'invoiceDateMin': invoice_date_min,
    'invoiceDateMax': invoice_date_max,
    'totalRevenue': round(total_revenue, 2),
    'totalMargin': round(total_margin, 2),
    'overallMarginPct': round(total_margin / total_revenue * 100, 1) if total_revenue else 0.0,
    'totalUnitsSold': round(total_units_sold, 1),
    'totalCasesSold': round(total_cases_sold, 1),
    'lifetimeAccounts': len(lifetime_accounts),
    'ap1yr': len(ap_1yr_accounts),
    'ap6mo': len(ap_6mo_accounts),
    'ap90d': len(ap_90d_accounts),
    'brandFamilyCount': len(brand_families),
    'supplierCount': len(suppliers),
    'itemCount': len(items),
    'gainingItems': gaining,
    'decliningItems': declining,
    'topRevenueFamilies': top_revenue_families,
    'marginWatch': margin_watch,
}

data = {
    'overview': overview,
    'distribution': distribution,
    'accountDetail': account_rows,
    'r12MonthLabels': r12_month_labels,
    'margins': margins,
    'brandFamilies': brand_families,
    'suppliers': suppliers,
}

html = open(HTML, encoding='utf-8').read()
m = re.search(r'(<script id="ws-data" type="application/json">)(.*?)(</script>)', html, re.S)
new_blob = json.dumps(data, separators=(',', ':'))
html = html[:m.start(2)] + new_blob + html[m.end(2):]
open(HTML, 'w', encoding='utf-8').write(html)

print(f'Latest month in data: {overview["asOfLatestMonth"]}')
print(f'Invoice date range: {overview["invoiceDateMin"]} - {overview["invoiceDateMax"]}')
print(f'Distribution rows: {len(distribution)}')
print(f'Account detail rows: {len(account_rows)}')
print(f'Margin rows: {len(margins)}')
print(f'Skipped zero-price (non-sale) invoice rows: {skipped_zero_price_rows}')
print(f'Lifetime accounts: {overview["lifetimeAccounts"]}  1YR AP: {overview["ap1yr"]}  6M AP: {overview["ap6mo"]}  90D AP: {overview["ap90d"]}')
print(f'Total revenue: {overview["totalRevenue"]:,.2f}  Overall margin %: {overview["overallMarginPct"]}%')
