#!/usr/bin/env python3
"""
Rebuilds the "lostPlacements" / "lostOverview" / "lostByRep" keys inside
wine-spirits-tracker.html's embedded <script id="ws-data"> JSON, from the
two RDE Encompass exports below. Every other key in that JSON (overview,
byAccount, byBrand, etc.) is left untouched -- this script only
adds/refreshes the Lost Placements tab's data.

Usage (from this folder):
    python3 build_lost_placements.py

Inputs (keep these filenames when re-exporting from RDE/Encompass):
    ws_l6_months.csv   "WS L6 Complete Months Placements/Cases" export --
                       every (customer, product) placement in the last 6
                       COMPLETE calendar months (e.g. run in late July,
                       this covers Jan 1 - Jun 30 -- July itself is not
                       "complete" yet so it's excluded). This is the wider
                       history window ("was this ever placed recently").
    ws_l90_days.csv    "WS L90 Days Placements/Cases" export -- every
                       (customer, product) placement in the trailing
                       rolling 90 days through today. This is the fresher,
                       narrower window that reaches all the way to the
                       most recent data.
    Both share the same columns: District Manager, Sales Rep Assigned,
    Customer Num, Customer Name, Product Num, Product Name, Load Sheet
    Date, Placement Count, Cases. Rows in the two files' overlapping date
    range are identical (verified 2026-07-28) -- they're deduplicated by
    full row content before aggregating, so a placement in that overlap
    isn't double-counted.

Definition of "lost placement" (mirrors the Encompass PlacementData
Value1/Value2 formula Kohler already uses, just computed here from raw
transaction-level rows instead of a canned Encompass comparison report,
since the base-report version couldn't be repointed at a rolling window):
    anchor  = the single most recent Load Sheet Date across both files
    cutoff  = anchor - 60 days
    A (customer, product) pair is a lost placement if it has at least one
    order dated before cutoff (it WAS placed at some point) and no order
    at or after cutoff (nothing in the trailing 60 days). Everything
    that's ever appeared in either file counts as "tracked" for the
    denominator in lostOverview's percentages.

To refresh:
    1. Re-export both RDE reports, keeping the same columns.
    2. Save them over ws_l6_months.csv / ws_l90_days.csv in this folder
       (same filenames).
    3. Run: python3 build_lost_placements.py
    4. Commit and push.
"""
import csv
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
L6 = os.path.join(HERE, 'ws_l6_months.csv')
L90 = os.path.join(HERE, 'ws_l90_days.csv')
HTML = os.path.join(HERE, 'wine-spirits-tracker.html')

LOST_WINDOW_DAYS = 60


def load_rows(path):
    with open(path, newline='') as f:
        return list(csv.DictReader(f))


def row_key(r):
    return (r['Customer Num'], r['Product Num'], r['Load Sheet Date'],
            r['Placement Count   2026'], r['Cases   2026'])


rows_by_key = {}
for path in (L6, L90):
    for r in load_rows(path):
        rows_by_key[row_key(r)] = r
rows = list(rows_by_key.values())

anchor = max(datetime.strptime(r['Load Sheet Date'], '%m/%d/%Y') for r in rows)
cutoff = anchor - timedelta(days=LOST_WINDOW_DAYS)

pairs = defaultdict(lambda: {
    'cust': None, 'name': None, 'productNum': None, 'product': None,
    'rep': None, 'district': None, 'lastDate': datetime.min, 'totalCases': 0.0,
})
for r in rows:
    key = (r['Customer Num'], r['Product Num'])
    p = pairs[key]
    d = datetime.strptime(r['Load Sheet Date'], '%m/%d/%Y')
    p['totalCases'] += float(r['Cases   2026'] or 0)
    if d >= p['lastDate']:
        p['lastDate'] = d
        p['cust'] = r['Customer Num']
        p['name'] = r['Customer Name']
        p['productNum'] = r['Product Num']
        p['product'] = r['Product Name']
        p['rep'] = r['Sales Rep Assigned']
        p['district'] = r['District Manager']

lost_placements = []
for p in pairs.values():
    if p['lastDate'] < cutoff:
        days_since = (anchor - p['lastDate']).days
        lost_placements.append({
            'rep': p['rep'], 'district': p['district'],
            'cust': p['cust'], 'name': p['name'],
            'productNum': p['productNum'], 'product': p['product'],
            'lastOrderDate': p['lastDate'].strftime('%Y-%m-%d'),
            'daysSince': days_since,
            'totalCases': round(p['totalCases'], 2),
        })
lost_placements.sort(key=lambda x: x['daysSince'])

by_rep_tracked = defaultdict(int)
by_rep_lost = defaultdict(int)
for p in pairs.values():
    by_rep_tracked[p['rep']] += 1
for lp in lost_placements:
    by_rep_lost[lp['rep']] += 1

lost_by_rep = []
for rep, tracked in by_rep_tracked.items():
    lost = by_rep_lost.get(rep, 0)
    lost_by_rep.append({
        'rep': rep, 'tracked': tracked, 'lost': lost,
        'pctLost': round(100 * lost / tracked, 1) if tracked else 0.0,
    })
lost_by_rep.sort(key=lambda x: -x['lost'])

distinct_accounts_lost = len(set(lp['cust'] for lp in lost_placements))
distinct_products_lost = len(set(lp['productNum'] for lp in lost_placements))

lost_overview = {
    'anchorDate': anchor.strftime('%Y-%m-%d'),
    'cutoffDate': cutoff.strftime('%Y-%m-%d'),
    'windowDays': LOST_WINDOW_DAYS,
    'totalTracked': len(pairs),
    'totalLost': len(lost_placements),
    'pctLost': round(100 * len(lost_placements) / len(pairs), 1) if pairs else 0.0,
    'distinctAccountsLost': distinct_accounts_lost,
    'distinctProductsLost': distinct_products_lost,
}

lost_reps = sorted(set(lp['rep'] for lp in lost_placements if lp['rep']))

html = open(HTML, encoding='utf-8').read()
m = re.search(r'(<script id="ws-data" type="application/json">)(.*?)(</script>)', html, re.S)
data = json.loads(m.group(2))
data['lostPlacements'] = lost_placements
data['lostOverview'] = lost_overview
data['lostByRep'] = lost_by_rep
data['lostReps'] = lost_reps

new_blob = json.dumps(data, separators=(',', ':'))
html = html[:m.start(2)] + new_blob + html[m.end(2):]
open(HTML, 'w', encoding='utf-8').write(html)

print(f"Anchor date: {lost_overview['anchorDate']}  (60-day cutoff: {lost_overview['cutoffDate']})")
print(f"Tracked pairs: {lost_overview['totalTracked']}")
print(f"Lost placements: {lost_overview['totalLost']} ({lost_overview['pctLost']}%)")
print(f"Distinct accounts affected: {distinct_accounts_lost}")
print(f"Distinct products affected: {distinct_products_lost}")
