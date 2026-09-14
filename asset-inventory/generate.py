#!/usr/bin/env python3
"""Builds the embedded JSON for index.html -- the ASSET INVENTORY dashboard.

One question: WHAT IS UPSTAIRS RIGHT NOW, and what is moving in and out of it.
This is a current-state stockroom page, not a historical analytics page.

Reads THREE of the four exports in data/ (see README.txt for why the fourth is
only used for one field):

  assets.csv            THE SPINE. ONE ROW = ONE PHYSICAL UNIT sitting upstairs,
                        not a quantity line. So quantity on hand is a ROW COUNT
                        per Asset Type -- there is no quantity column and none is
                        needed. Every row on the 9/14 pull is Status=Good,
                        Location=Hawthorne, Customer blank and Sold Date blank:
                        the export is already filtered to unplaced stock.
                        VERIFIED: of the 1,502 asset requests carrying an
                        allocated Asset ID, ZERO appear in this file. Allocation
                        removes the unit from the export, which is what makes a
                        plain row count trustworthy as on-hand -- it cannot
                        double-count a unit that has already gone out.
                        Cost, Remaining Value, Serial Num, Asset Num, Purchase,
                        Placed in Service Date and Asset Owner are empty or
                        constant on every row and are ignored.
  asset_requests.csv    One row = one request for ONE unit (no quantity column,
                        so quantity requested is a row count too). There is NO
                        status column. Fulfilment is derived from the join above:
                          Asset ID present  -> FULFILLED (unit pulled and gone)
                          Asset ID blank    -> OPEN (nothing pulled yet)
                        That split is 1,502 / 98 and it corroborates itself --
                        91 of the 98 open rows also have no Delivery Date and
                        have never been touched since creation (Time Updated ==
                        Time Created), while all 1,502 fulfilled rows carry a
                        Delivery Date. The 7 rows with a delivery date but no
                        asset are reported as a data issue, not silently binned.
                        Also the ONLY source of Supplier / Brand / Brand Family
                        per asset type (no conflicts: every type maps to exactly
                        one supplier+brand pair). Covers 145 of 243 on-hand types.
  placed_assets_by_customer.csv
                        One row = one customer + asset type, quantity = LIFETIME
                        units placed there, Time Placed = MOST RECENT placement.
                        Superset: all 2,444 keys of the by-date report are in
                        here, and its quantity is never smaller.

  asset_placement_by_date.csv  -- used for ONE field only, see below.

NO CANCELLED STATE EXISTS in any export, so "open" here means "not yet
fulfilled", which includes requests nobody ever intends to fill. The page ages
them instead of pretending: anything open past OPEN_STALE_DAYS is flagged.

Deduplication between the two placement files
---------------------------------------------
They are the same underlying placements over different windows, NOT independent
events, so their quantities must never be added:
  by-customer  = lifetime, every year (2024/2025/2026 + 967 undated rows)
  by-date      = the 2026 slice only, and its Purchased/Sold Date columns are
                 100% EMPTY despite the report's name
Joined on (customer, asset type) -- 2,444 of 2,444 by-date keys match, neither
file has a duplicate key, and by-date quantity <= by-customer quantity on every
single row. So each file supplies only what it uniquely knows: lifetime units
and last-placed date from by-customer, 2026 units from by-date. Nothing is
counted twice.

Inventory rule
--------------
    Available = On Hand - Pending Out
    On Hand     row count in assets.csv (units physically upstairs)
    Pending Out open requests for that type (approved into the queue, no unit
                pulled yet -- so still on the shelf but spoken for)
    Reserved    NOT SUPPORTED. Encompass has no reserve state here: a request
                either has a unit allocated (and that unit is already out of the
                export) or it has nothing. There is no third bucket, so no
                Reserved column is shown rather than one filled with a guess.

Refresh: drop the four new exports into data/ under the same names, run this,
commit and push. See README.txt.
"""
import csv, json, os, re, collections, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

LOW_STOCK_AT   = 2    # available <= this (and > 0) reads as Low Stock
OPEN_STALE_DAYS = 30  # an open request older than this is flagged as ageing
RECENT_DAYS    = 30   # window for "recently received" / "recently sent out"

def rd(name):
    with open(os.path.join(DATA, name), newline='', encoding='utf-8-sig') as f:
        return [{k: (v or '').strip() for k, v in row.items()} for row in csv.DictReader(f)]

def pdate(s):
    """Encompass writes 9/14/2026 and 9/14/2026 10:11 AM. Normalise both."""
    s = (s or '').strip()
    if not s:
        return None
    for fmt in ('%m/%d/%Y %I:%M %p', '%m/%d/%Y %H:%M', '%m/%d/%Y'):
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None

def iso(d):
    return d.strftime('%Y-%m-%d') if d else None

def loose(s):
    """Punctuation/space-insensitive form of a name. Used ONLY to spot near-
    duplicate customer spellings, never to join -- collapsing punctuation merges
    genuinely separate rows ("Thatcher Mc Ghees (A)" and "Thatcher Mcghee's (A)"
    are one key under it) and double-counts their units."""
    return re.sub(r'[^a-z0-9]+', '', (s or '').lower())

# ---------------------------------------------------------------- load
assets   = rd('assets.csv')
requests = rd('asset_requests.csv')
by_cust  = rd('placed_assets_by_customer.csv')
by_date  = rd('asset_placement_by_date.csv')

issues = []   # every record we refuse to trust lands here, out of the totals

# ---------------------------------------------------------------- assets
seen_ids, units = set(), []
for r in assets:
    aid, atype = r['Asset ID'], r['Asset Type']
    if not aid:
        issues.append({'kind': 'Missing Asset ID', 'ref': '-', 'detail': f"Unit row for '{atype or '(no type)'}' has no Asset ID; excluded from counts."})
        continue
    if aid in seen_ids:
        issues.append({'kind': 'Duplicate Asset ID', 'ref': aid, 'detail': f"Asset ID {aid} appears more than once; counted once."})
        continue
    if not atype:
        issues.append({'kind': 'Missing asset name', 'ref': aid, 'detail': f"Asset ID {aid} has no Asset Type; excluded from counts."})
        continue
    seen_ids.add(aid)
    units.append(r)

# conflicting names: same Asset Type carrying a different Asset Description
name_conflicts = collections.defaultdict(set)
for r in units:
    if r['Asset Description'] and r['Asset Description'] != r['Asset Type']:
        name_conflicts[r['Asset Type']].add(r['Asset Description'])
for t, alts in sorted(name_conflicts.items()):
    issues.append({'kind': 'Conflicting asset names', 'ref': t,
                   'detail': f"Description differs from type: {', '.join(sorted(alts))}. Counted under the type."})

on_hand    = collections.Counter(r['Asset Type'] for r in units)
created_at = collections.defaultdict(list)
bins       = collections.defaultdict(collections.Counter)
for r in units:
    d = pdate(r['Time Created'])
    if d:
        created_at[r['Asset Type']].append(d)
    bins[r['Asset Type']][r['Bin'] or '--'] += 1

# ---------------------------------------------------------------- requests
#   Asset ID present -> fulfilled (that unit is gone from assets.csv)
#   Asset ID blank   -> open
onhand_ids = seen_ids
open_reqs, filled_reqs = [], []
alloc_count = collections.Counter(r['Asset'] for r in requests if r['Asset'])

for r in requests:
    rid, atype, unit = r['Asset Request ID'], r['Asset Type'], r['Asset']
    if not atype:
        issues.append({'kind': 'Request without asset', 'ref': rid, 'detail': f"Request {rid} names no asset type; excluded."})
        continue
    if unit:
        if unit in onhand_ids:
            # would contradict the verified rule -- never silently counted
            issues.append({'kind': 'Request without matching asset', 'ref': rid,
                           'detail': f"Request {rid} allocates unit {unit}, which is ALSO still in the on-hand export. Treated as open."})
            open_reqs.append(r)
            continue
        if alloc_count[unit] > 1:
            issues.append({'kind': 'Possible duplicate request', 'ref': rid,
                           'detail': f"Unit {unit} is allocated to {alloc_count[unit]} requests ({atype})."})
        filled_reqs.append(r)
    else:
        if r['Delivery Date']:
            issues.append({'kind': 'Possible duplicate request', 'ref': rid,
                           'detail': f"Request {rid} ({atype}) has a delivery date of {r['Delivery Date']} but no unit allocated. Counted as open."})
        open_reqs.append(r)

pending_out = collections.Counter(r['Asset Type'] for r in open_reqs)

# supplier / brand per asset type, from the requests export (the only carrier)
meta = {}
conflict_meta = collections.defaultdict(set)
for r in requests:
    t = r['Asset Type']
    if not t:
        continue
    pair = (r['Supplier'], r['BrandFamily'] or r['Brand'])
    conflict_meta[t].add(pair)
    meta.setdefault(t, {'supplier': r['Supplier'], 'brand': r['BrandFamily'] or r['Brand']})
for t, pairs in conflict_meta.items():
    if len(pairs) > 1:
        issues.append({'kind': 'Conflicting asset names', 'ref': t,
                       'detail': f"Type maps to {len(pairs)} supplier/brand pairs; first kept."})

# ---------------------------------------------------------------- placements
# by-customer = lifetime + last placed;  by-date = 2026 units. Joined, never summed.
ytd = {}
for r in by_date:
    cust, t, q = r['Customer Name'], r['Asset Type'], r['Num Of Placed Assets']
    try:
        q = int(q)
    except ValueError:
        issues.append({'kind': 'Invalid quantity', 'ref': f'{cust} / {t}', 'detail': f"Placement (by date) quantity '{q}' is not a number; excluded."})
        continue
    if q <= 0:
        issues.append({'kind': 'Invalid quantity', 'ref': f'{cust} / {t}', 'detail': f"Placement (by date) quantity {q}; excluded."})
        continue
    ytd[(cust, t)] = ytd.get((cust, t), 0) + q

placements, unmatched_ytd = [], set(ytd)
for r in by_cust:
    cust, t, q = r['Customer'], r['Asset Type'], r['Number of Assets']
    if not cust or not t:
        issues.append({'kind': 'Placement without matching asset', 'ref': cust or t or '-', 'detail': 'Placement row missing customer or asset type; excluded.'})
        continue
    try:
        q = int(q)
    except ValueError:
        issues.append({'kind': 'Invalid quantity', 'ref': f'{cust} / {t}', 'detail': f"Placement quantity '{q}' is not a number; excluded."})
        continue
    if q <= 0:
        issues.append({'kind': 'Invalid quantity', 'ref': f'{cust} / {t}', 'detail': f"Placement quantity {q}; excluded."})
        continue
    k = (cust, t)
    unmatched_ytd.discard(k)
    d = pdate(r['Time Placed'])
    placements.append({'customer': cust, 'type': t, 'qty': q, 'ytd': ytd.get(k, 0), 'date': iso(d),
                       'stocked': t in on_hand})
dupe_names = collections.defaultdict(set)
for r in by_cust:
    if r['Customer']:
        dupe_names[loose(r['Customer'])].add(r['Customer'])
for _, names in sorted(dupe_names.items()):
    if len(names) > 1:
        issues.append({'kind': 'Possible duplicate placement', 'ref': sorted(names)[0],
                       'detail': 'Same account appears under ' + str(len(names)) + ' spellings: '
                                 + ', '.join(sorted(names)) + '. Counted separately -- merge in Encompass to combine.'})

for k in sorted(unmatched_ytd):
    issues.append({'kind': 'Placement without matching asset', 'ref': ' / '.join(k),
                   'detail': 'Appears in the by-date placement report but not in the by-customer report; excluded from placement totals.'})

print(f'  placement join: {len(ytd) - len(unmatched_ytd)}/{len(ytd)} by-date rows matched by exact customer+type')

placed_lifetime = collections.Counter()
placed_ytd      = collections.Counter()
last_placed     = {}
for p in placements:
    placed_lifetime[p['type']] += p['qty']
    placed_ytd[p['type']]      += p['ytd']
    if p['date'] and p['date'] > last_placed.get(p['type'], ''):
        last_placed[p['type']] = p['date']

# ---------------------------------------------------------------- items
today = datetime.date.today()
types = set(on_hand) | set(pending_out)   # stocked, plus anything with live demand

items = []
for t in sorted(types):
    oh, po = on_hand.get(t, 0), pending_out.get(t, 0)
    # Demand above stock is a real shortage, not bad data: on hand is never
    # negative (it is a row count), there are simply more open requests than
    # units. Available floors at 0 and the item still reads Out of Stock -- the
    # honest status -- while the shortfall is carried as its own flag so it is
    # reviewable without being laundered into the "data issue" bucket.
    short = max(0, po - oh)
    avail = max(0, oh - po)
    flag = (f'{po} open request{"s" if po != 1 else ""} against {oh} on hand.') if short else None
    if short:
        issues.append({'kind': 'Demand exceeds stock', 'ref': t,
                       'detail': f'Short {short} -- {flag} Available shown as 0; the requests stay open.'})
    status = 'Out of Stock' if avail == 0 else ('Low Stock' if avail <= LOW_STOCK_AT else 'Available')
    recv = sorted(created_at.get(t, []))
    shelf = ', '.join(b for b, _ in bins[t].most_common(2)) if t in bins else ''
    m = meta.get(t, {})
    items.append({
        'type': t, 'supplier': m.get('supplier', ''), 'brand': m.get('brand', ''),
        'category': re.search(r'-\s*([^-]+)$', t).group(1).strip().title() if re.search(r'-\s*([^-]+)$', t) else 'Uncategorised',
        'location': 'Hawthorne' if oh else '', 'shelf': shelf,
        'onHand': oh, 'pending': po, 'available': avail, 'status': status, 'flag': flag, 'short': short,
        'lastReceived': iso(recv[-1]) if recv else None,
        'received30': sum(1 for d in recv if (today - d.date()).days <= RECENT_DAYS),
        'ids': sorted((r['Asset ID'] for r in units if r['Asset Type'] == t), key=lambda x: -int(x))[:40],
        'placedLifetime': placed_lifetime.get(t, 0), 'placedYtd': placed_ytd.get(t, 0),
        'lastPlaced': last_placed.get(t),
    })
by_type = {i['type']: i for i in items}

# ---------------------------------------------------------------- activity
# Requests are one row per unit, so a rep asking for 18 mugs files 18 identical
# rows. Listing them individually is unreadable and buries everything else, so
# rows identical in item + requester + day collapse into one line whose QUANTITY
# is the row count. No request is lost: each line carries its request IDs, and
# the unit totals still reconcile to the export.
def group(rows, key, build):
    out = collections.defaultdict(list)
    for r in rows:
        out[key(r)].append(r)
    return [build(k, v) for k, v in out.items()]

open_rows = group(open_reqs,
    lambda r: (r['Asset Type'], r['Created By'], iso(pdate(r['Time Created']))),
    lambda k, v: {
        'ids': sorted(x['Asset Request ID'] for x in v), 'type': k[0], 'rep': k[1], 'date': k[2],
        'qty': len(v),
        'age': (today - datetime.date.fromisoformat(k[2])).days if k[2] else None,
        'stale': bool(k[2]) and (today - datetime.date.fromisoformat(k[2])).days > OPEN_STALE_DAYS,
        'onHand': on_hand.get(k[0], 0),
    })
open_rows.sort(key=lambda x: (x['date'] or '', x['qty']), reverse=True)

sent_rows = group(filled_reqs,
    lambda r: (r['Asset Type'], r['Updated By'] or r['Created By'],
               iso(pdate(r['Delivery Date']) or pdate(r['Time Updated']))),
    lambda k, v: {
        'ids': sorted(x['Asset Request ID'] for x in v),
        'units': sorted(x['Asset'] for x in v),
        'type': k[0], 'rep': k[1], 'date': k[2], 'qty': len(v),
    })
sent_rows.sort(key=lambda x: (x['date'] or '', x['qty']), reverse=True)

recv_rows = []
for t, ds in created_at.items():
    g = collections.Counter(iso(d) for d in ds)
    for day, n in g.items():
        if 0 <= (today - datetime.date.fromisoformat(day)).days <= 120:
            m = meta.get(t, {})
            recv_rows.append({'date': day, 'type': t, 'qty': n, 'supplier': m.get('supplier', ''), 'brand': m.get('brand', '')})
recv_rows.sort(key=lambda x: x['date'], reverse=True)

placements.sort(key=lambda p: (p['date'] or '', p['qty']), reverse=True)

# ---------------------------------------------------------------- validate
tot_units = sum(i['onHand'] for i in items)
assert tot_units == len(units), f'unit total {tot_units} != {len(units)} asset rows'
assert sum(i['pending'] for i in items) == sum(r['qty'] for r in open_rows), 'pending total != open request units'
assert sum(r['qty'] for r in open_rows) + sum(r['qty'] for r in sent_rows) \
    + sum(1 for i in issues if i['kind'] == 'Request without asset') == len(requests), 'request rows unaccounted for'
for i in items:
    assert i['available'] == max(0, i['onHand'] - i['pending']), f"available mismatch on {i['type']}"

ytd_raw = sum(int(r['Num Of Placed Assets']) for r in by_date if r['Num Of Placed Assets'].strip().isdigit())
ytd_page = sum(p['ytd'] for p in placements)
assert ytd_page + sum(ytd[k] for k in unmatched_ytd) == ytd_raw, \
    f'2026 placement units {ytd_page} + {len(unmatched_ytd)} unmatched != {ytd_raw} in the by-date export'
assert sum(p['qty'] for p in placements) == sum(int(r['Number of Assets']) for r in by_cust if r['Number of Assets'].strip().isdigit()), \
    'lifetime placement units do not match the by-customer export'

refreshed = max([d for ds in created_at.values() for d in ds] +
                [pdate(r['Time Updated']) for r in requests if pdate(r['Time Updated'])])

summary = {
    'items': len(items), 'stocked': sum(1 for i in items if i['onHand']),
    'units': tot_units, 'available': sum(i['available'] for i in items),
    'openRequests': sum(r['qty'] for r in open_rows), 'openLines': len(open_rows),
    'staleRequests': sum(r['qty'] for r in open_rows if r['stale']),
    'low': sum(1 for i in items if i['status'] == 'Low Stock'),
    'out': sum(1 for i in items if i['status'] == 'Out of Stock'),
    'short': sum(1 for i in items if i['short']),
    'shortUnits': sum(i['short'] for i in items),
    'dataIssues': len(issues),
    'received30': sum(r['qty'] for r in recv_rows if (today - datetime.date.fromisoformat(r['date'])).days <= RECENT_DAYS),
    'sent30': sum(r['qty'] for r in sent_rows if r['date'] and 0 <= (today - datetime.date.fromisoformat(r['date'])).days <= RECENT_DAYS),
    'customers': len({p['customer'] for p in placements}),
    'refreshed': iso(refreshed), 'generated': today.isoformat(),
    'lowAt': LOW_STOCK_AT, 'staleAt': OPEN_STALE_DAYS, 'recentDays': RECENT_DAYS,
}

payload = {'summary': summary, 'items': items, 'open': open_rows,
           'sent': sent_rows[:400], 'received': recv_rows[:400],
           'placements': placements, 'issues': issues}

blob = json.dumps(payload, separators=(',', ':'))
page = os.path.join(HERE, 'index.html')
with open(page, encoding='utf-8') as f:
    html = f.read()
new, n = re.subn(r'(<script id="asset-data" type="application/json">)(.*?)(</script>)',
                 lambda m: m.group(1) + blob + m.group(3), html, flags=re.S)
if n != 1:
    raise SystemExit('could not find <script id="asset-data"> in index.html')
with open(page, 'w', encoding='utf-8') as f:
    f.write(new)

print(f"""asset-inventory rebuilt  ({len(blob):,} bytes embedded)
  items tracked      {summary['items']:>6}   ({summary['stocked']} with stock on hand)
  units on hand      {summary['units']:>6}
  units available    {summary['available']:>6}   (on hand - {summary['openRequests']} open request units)
  open requests      {summary['openRequests']:>6}   units across {summary['openLines']} request lines, {summary['staleRequests']} older than {OPEN_STALE_DAYS} days
  low stock items    {summary['low']:>6}   (available 1-{LOW_STOCK_AT})
  out of stock       {summary['out']:>6}
  short items        {summary['short']:>6}   ({summary['shortUnits']} units of unmet open demand)
  received /{RECENT_DAYS}d      {summary['received30']:>6} units
  sent out /{RECENT_DAYS}d      {summary['sent30']:>6} units
  placements         {len(placements):>6} rows across {summary['customers']} customers
  data issues        {summary['dataIssues']:>6}""")
for k, n in collections.Counter(i['kind'] for i in issues).most_common():
    print(f"     {n:>4}  {k}")
