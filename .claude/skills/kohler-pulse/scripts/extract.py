#!/usr/bin/env python3
"""
Pull the Sales Pulse fact base out of every dashboard in one pass.

Run from the repo root:   python3 .claude/skills/kohler-pulse/scripts/extract.py

Prints opportunity-adjusted numbers, not raw totals -- every rep figure is
divided by that rep's own account base or target list, because the customer
mix here varies so much that raw counts mislead. See references/data-sources.md
for the traps this script already handles (velocity alias splits, the Wine &
Spirits window artifact, off-prem vs on-prem rosters).

Sections can be run individually:  extract.py taps draft ws
"""
import collections
import csv
import json
import math
import os
import re
import statistics
import sys

ROOT = os.getcwd()
CORE_COUNTIES = {'BERGEN', 'PASSAIC', 'PASSAIC-FF', 'SUSSEX', 'MORRIS 1', 'MORRIS 3'}
CORE_AREAS = {'Bergen', 'Passaic', 'Passaic-FF', 'Sussex', 'Morris 1', 'Morris 3'}
SOUTH_AREAS = {'Morris 2', 'Essex', 'Hudson', 'Union'}
SKIP_REPS = {'Default', 'Office Tell Sell', 'Chris Politano'}


def head(title):
    print('\n' + '=' * 68)
    print(title)
    print('=' * 68)


def path(*p):
    return os.path.join(ROOT, *p)


def read(*p):
    with open(path(*p), encoding='utf-8') as fh:
        return fh.read()


def blob(html_path, script_id):
    """Data embedded as <script id="..." type="application/json">."""
    txt = read(html_path)
    m = re.search(r'<script id="%s"[^>]*>(.*?)</script>' % re.escape(script_id), txt, re.S)
    return json.loads(m.group(1)) if m else None


def const_blob(html_path, name):
    """Data embedded as `const NAME = {...};`."""
    txt = read(html_path)
    i = txt.index('const %s' % name)
    j = txt.index('\n};', i)
    return json.loads(txt[txt.index('=', i) + 1:j + 2].strip().rstrip(';'))


def num(x):
    """Parse a spreadsheet-style number: commas, parens for negative, blanks."""
    s = str(x if x is not None else '').replace(',', '').replace('$', '').strip()
    neg = s.startswith('(')
    s = s.strip('()%')
    try:
        v = float(s or 0)
    except ValueError:
        return 0.0
    return -v if neg else v


def truthy(v):
    return str(v).strip().lower() in ('1', 'true', 'yes', 'y', 'new placement', 'qualifying buyer', 'new buyer')


def latest_mpo_month(side):
    d = path('MPOs', side, 'data')
    months = sorted(x for x in os.listdir(d) if re.match(r'^\d{4}-\d{2}$', x))
    return months[-1]


# --------------------------------------------------------------------------
def customer_base():
    """Every rep's real opportunity. Read this before judging anyone."""
    rows = list(csv.DictReader(open(path('incentive-tracking/data/customer_base_full.csv'))))
    prof = collections.defaultdict(lambda: {
        'n': 0, 'on': 0, 'off': 0, 'draft': 0, 'cases': 0.0,
        'off_cases': [], 'areas': collections.Counter()})
    for r in rows:
        rep = r['Sales Rep Assigned'].strip()
        p = prof[rep]
        p['n'] += 1
        p['on'] += r['Premise'] == 'On Premise'
        p['off'] += r['Premise'] == 'Off Premise'
        p['draft'] += r['Draft Package'].startswith('2)')
        c = num(r.get('Cases   2026'))
        p['cases'] += c
        if r['Premise'] == 'Off Premise':
            p['off_cases'].append(c)
        p['areas'][r['Area']] += 1
    return prof


def group_of(prof_entry):
    a = prof_entry['areas']
    core = sum(v for k, v in a.items() if k in CORE_AREAS)
    south = sum(v for k, v in a.items() if k in SOUTH_AREAS)
    return 'SOUTH' if south > core else 'CORE'


def section_base():
    head('REP OPPORTUNITY PROFILE  (the denominator for everything else)')
    prof = customer_base()
    print('%-20s %5s %5s %5s %6s %10s %9s  %s' %
          ('REP', 'ACCTS', 'ON', 'OFF', 'DRAFT', 'CASES 26', 'AVG/OFF', 'GROUP'))
    for rep, p in sorted(prof.items(), key=lambda x: -x[1]['n']):
        if rep in SKIP_REPS:
            continue
        avg = (sum(p['off_cases']) / len(p['off_cases'])) if p['off_cases'] else 0
        print('%-20s %5d %5d %5d %6d %10.0f %9.0f  %s' %
              (rep, p['n'], p['on'], p['off'], p['draft'], p['cases'], avg, group_of(p)))
    print('\nOff-prem MPO objectives only apply to reps with a real off-premise book.')
    print('Southern off-prem accounts are far smaller -- displays and suitcase')
    print('placements barely exist there. Judge on portfolio fit, not raw counts.')
    return prof


# --------------------------------------------------------------------------
def section_taps():
    head('TAPS -- CORE MARKET SHARE')
    d = blob('isellbeer/tap-survey-tracking/index.html', 'tap-data')
    print('survey generated: %s' % d['generatedAt'])
    recs = d['records']
    core = [r for r in recs if r['county'] in CORE_COUNTIES]

    def share(rows):
        us = sum(r['taps'] for r in rows if r['status'] == 'US')
        tot = sum(r['taps'] for r in rows)
        return us, tot, (us / tot * 100 if tot else 0)

    us, tot, pct = share(core)
    print('CORE MARKET: %d of %d handles = %.1f%% across %d accounts'
          % (us, tot, pct, len({r['account'] for r in core})))
    us2, tot2, pct2 = share(recs)
    print('COMPANY-WIDE: %.1f%% (%d/%d)' % (pct2, us2, tot2))

    print('\nby area:')
    areas = collections.defaultdict(lambda: [0, 0])
    for r in recs:
        areas[r['county']][1] += r['taps']
        if r['status'] == 'US':
            areas[r['county']][0] += r['taps']
    for a, (u, t) in sorted(areas.items(), key=lambda x: -x[1][1]):
        tag = 'core' if a in CORE_COUNTIES else ''
        print('   %-12s %5.1f%%  (%d/%d) %s' % (a, u / t * 100 if t else 0, u, t, tag))

    bu, bt = collections.Counter(), collections.Counter()
    accts = collections.defaultdict(set)
    for r in core:
        (bu if r['status'] == 'US' else bt)[r['brandFamily']] += r['taps']
        if r['status'] == 'US':
            accts[r['brandFamily']].add(r['account'])
    print('\nour biggest core draft brands by handles:')
    for b, n in bu.most_common(10):
        print('   %-32s %4d handles in %3d accounts' % (b[:32], n, len(accts[b])))
    print('\nlargest competitor brands in core (ignore "OTHER SUPPLIER", a catch-all):')
    for b, n in bt.most_common(8):
        print('   %-32s %4d handles  %.1f%% of core' % (b[:32], n, n / tot * 100))

    zero = collections.defaultdict(lambda: [0, 0])
    for r in core:
        zero[r['account']][1] += r['taps']
        if r['status'] == 'US':
            zero[r['account']][0] += r['taps']
    z = [k for k, v in zero.items() if v[0] == 0]
    print('\n%d of %d core accounts carry no Kohler handle (%.0f%%)'
          % (len(z), len(zero), len(z) / len(zero) * 100))

    # Survey coverage vs draft-capable base -- the Southern District caveat.
    # Group by the ACCOUNT's own area on both sides, so the two halves of the
    # ratio describe the same geography. Anything outside core/south (the
    # "Sales" house bucket) is excluded rather than dumped into one side.
    south_counties = {'MORRIS 2', 'ESSEX', 'HUDSON', 'UNION'}
    draftcap = collections.Counter()
    for r in csv.DictReader(open(path('incentive-tracking/data/customer_base_full.csv'))):
        if not r['Draft Package'].startswith('2)'):
            continue
        area = r['Area']
        if area in CORE_AREAS:
            draftcap['CORE'] += 1
        elif area in SOUTH_AREAS:
            draftcap['SOUTH'] += 1
    surveyed = collections.defaultdict(set)
    for r in recs:
        if r['county'] in CORE_COUNTIES:
            surveyed['CORE'].add(r['account'])
        elif r['county'] in south_counties:
            surveyed['SOUTH'].add(r['account'])
    print('\nsurvey coverage (surveyed accounts vs draft-capable accounts in base):')
    for g in ('CORE', 'SOUTH'):
        if draftcap[g]:
            print('   %-6s %3d of %3d = %.0f%% covered'
                  % (g, len(surveyed[g]), draftcap[g], len(surveyed[g]) / draftcap[g] * 100))
    print('   Southern coverage is thin and skews to big craft rooms -- directional only.')


def section_draft():
    head('DRAFT -- VELOCITY AND VOLUME MOMENTUM')
    ex = blob('isellbeer/executive-overview/index.html', 'exec-data')
    brands = [b for b in ex['velocity']['brands'] if b['matchedTaps'] >= 5]
    # dedupe alias splits: one row per Encompass pool, keep the most-surveyed
    best = {}
    for b in brands:
        k = b.get('encKey') or b['brand']
        if k not in best or b['matchedTaps'] > best[k]['matchedTaps']:
            best[k] = b
    rows = list(best.values())
    mh = statistics.median(b['matchedTaps'] for b in rows)
    mv = statistics.median(b['unitsPerTap'] for b in rows)
    print('velocity generated %s | %d brands | median %d handles, %.1f units/handle'
          % (ex['generatedAt'], len(rows), mh, mv))
    print('(company-wide, ~4 of 5 surveyed accounts matched -- directional)')

    def quad(b):
        hh, hv = b['matchedTaps'] >= mh, b['unitsPerTap'] >= mv
        return 'WORKHORSE' if hh and hv else 'HIDDEN GEM' if hv else 'WATCH LIST' if hh else 'small/slow'

    for label in ('WORKHORSE', 'HIDDEN GEM', 'WATCH LIST'):
        sel = [b for b in rows if quad(b) == label]
        print('\n%s -- %s' % (label, {'WORKHORSE': 'big footprint, strong pull',
                                      'HIDDEN GEM': 'small footprint, strong pull',
                                      'WATCH LIST': 'big footprint, weaker pull'}[label]))
        for b in sorted(sel, key=lambda x: -x['unitsPerTap'])[:8]:
            print('   %-30s %4d handles  %6.1f units/handle' % (b['brand'][:30], b['matchedTaps'], b['unitsPerTap']))

    # true draft momentum: keg case-equivalents year over year
    print('\nDRAFT VOLUME YEAR OVER YEAR (keg packages only, Jan-Jul):')
    rows2 = list(csv.DictReader(open(path('mid-year-review/brand_package_trend.csv'), encoding='utf-8-sig')))
    h = list(rows2[0].keys())
    kegs = [r for r in rows2 if re.search(r'keg|bbl', r['Package'], re.I)]
    bf = collections.defaultdict(lambda: [0.0, 0.0])
    for r in kegs:
        bf[r['Brand Family']][0] += num(r[h[6]])
        bf[r['Brand Family']][1] += num(r[h[7]])
    ly = sum(v[0] for v in bf.values())
    ty = sum(v[1] for v in bf.values())
    print('   TOTAL DRAFT: %.0f -> %.0f CE  (%+.1f%%)' % (ly, ty, (ty - ly) / ly * 100 if ly else 0))
    big = [(k, v[0], v[1], v[1] - v[0], ((v[1] - v[0]) / v[0] * 100 if v[0] else 0))
           for k, v in bf.items() if v[0] >= 800 or v[1] >= 800]
    print('   growing:')
    for k, a, b, dd, p in sorted(big, key=lambda x: -x[3])[:8]:
        print('      %-28s %+7.0f CE  %+6.1f%%  (now %.0f)' % (k[:28], dd, p, b))
    print('   declining:')
    for k, a, b, dd, p in sorted(big, key=lambda x: x[3])[:8]:
        print('      %-28s %+7.0f CE  %+6.1f%%  (now %.0f)' % (k[:28], dd, p, b))


def section_mpo():
    head('MPO PROGRESS -- AGAINST EACH REP\'S OWN TARGET LIST')
    for side in ('off-prem', 'on-prem'):
        month = latest_mpo_month(side)
        base = path('MPOs', side, 'data', month)
        print('\n--- %s  %s ---' % (side.upper(), month))
        files = os.listdir(base)
        for f in sorted(files):
            if not f.startswith('mpo_') or f.startswith('mpo_targets') or f.endswith('customer_base.json'):
                continue
            if 'customer_base' in f:
                continue
            try:
                rows = json.load(open(os.path.join(base, f)))
            except Exception:
                continue
            if not isinstance(rows, list) or not rows:
                continue
            key = f.replace('mpo_', '').replace('.json', '')
            repcol = 'SALES_REP_ASSIGNED' if 'SALES_REP_ASSIGNED' in rows[0] else ('REP' if 'REP' in rows[0] else None)
            if not repcol:
                continue
            tf = os.path.join(base, 'mpo_targets_%s.json' % key)
            targets = collections.defaultdict(set)
            if os.path.exists(tf):
                for r in json.load(open(tf)):
                    targets[r['SALES_REP_ASSIGNED'].strip()].add(r['CUSTOMER_NUM'])
            has_flag = 'NEW_PLACEMENT' in rows[0]
            got = collections.Counter()
            touched = collections.defaultdict(set)
            for r in rows:
                if has_flag and not truthy(r.get('NEW_PLACEMENT')):
                    continue
                rep = str(r[repcol]).strip()
                got[rep] += num(r.get('PLACEMENT_COUNT')) or 1
                if 'CUSTOMER_NUM' in r:
                    touched[rep].add(r['CUSTOMER_NUM'])
            total = sum(got.values())
            print('  %-28s %5.0f %s across %d reps'
                  % (key, total, 'new placements' if has_flag else 'placements', len(got)))
            if targets:
                ranked = sorted(targets.items(), key=lambda x: -len(x[1]))[:6]
                for rep, t in ranked:
                    if len(t) < 5:
                        continue
                    print('      %-20s %3.0f done / %3d target accounts  (%.0f%% of accounts touched)'
                          % (rep, got.get(rep, 0), len(t), len(touched.get(rep, ())) / len(t) * 100))


def section_ws():
    head('WINE & SPIRITS')
    d = blob('wine-spirits/wine-spirits-tracker.html', 'ws-data')
    o = d['overview']
    print('generated %s' % d.get('generatedAt'))
    print('assigned accounts %d | activated 2026 %d (%.1f%%) | never bought %d'
          % (o['assignedAccounts'], o['activated26'], o['pctActivated26'], o['neverBought']))
    print('new buyers %d vs lapsed %d  -- %.1f accounts go quiet per new one'
          % (o['newBuyers'], o['lapsedBuyers'], o['lapsedBuyers'] / o['newBuyers'] if o['newBuyers'] else 0))
    print('IGNORE the yoy/vol25/vol26 fields -- full-year 2025 vs YTD 2026, not comparable.')

    lo = d['lostOverview']
    print('\nreorder gap: %d of %d tracked placements lost (%.1f%%) across %d accounts'
          % (lo['totalLost'], lo['totalTracked'], lo['pctLost'], lo['distinctAccountsLost']))
    print('   window: %d days, anchored %s' % (lo['windowDays'], lo['anchorDate']))

    prof = customer_base()
    print('\nactivation by district (opportunity-adjusted):')
    g = collections.defaultdict(lambda: [0, 0])
    for r in d['repSummary']:
        if r['assignedAccounts'] < 20 or r['rep'] in SKIP_REPS:
            continue
        grp = group_of(prof[r['rep']]) if r['rep'] in prof else 'CORE'
        g[grp][0] += r['assignedAccounts']
        g[grp][1] += r['activated26']
    for k, (n, a) in g.items():
        print('   %-6s %4d assigned, %3d activated = %.0f%%' % (k, n, a, a / n * 100 if n else 0))

    pre = collections.defaultdict(lambda: [0, 0])
    for a in d['byAccount']:
        pre[a['onOff']][0] += 1
        if (a.get('vol26') or 0) > 0:
            pre[a['onOff']][1] += 1
    print('\nactivation by premise (explains low on-prem rep numbers):')
    for k, (n, a) in pre.items():
        print('   %-14s %4d assigned, %3d activated = %.0f%%' % (k, n, a, a / n * 100 if n else 0))

    print('\ntop reps by activation rate:')
    for r in sorted([x for x in d['repSummary'] if x['assignedAccounts'] >= 20],
                    key=lambda x: -x['pctActivated26'])[:6]:
        print('   %-20s %3d of %3d (%.0f%%)' % (r['rep'], r['activated26'], r['assignedAccounts'], r['pctActivated26']))


def section_displays():
    head('DISPLAYS')
    d = blob('isellbeer/display-auction-tracker/index.html', 'da-data')
    print('window %s - %s | %d displays | %d points'
          % (d['meta']['startDate'], d['meta']['endDate'], d['meta']['totalDisplays'], d['meta']['totalPoints']))
    for role in ('Sales Rep', 'Sales Associate'):
        print('\n%s leaderboard:' % role)
        for p in sorted([x for x in d['people'] if x['role'] == role], key=lambda x: -x['points'])[:5]:
            print('   %7d pts  %-22s %3d displays' % (p['points'], p['name'], p['total']))

    import datetime
    disp = [x for p in d['people'] for x in p['displays']]
    cw = collections.Counter()
    for x in disp:
        dt = datetime.datetime.strptime(x['dt'].split(' ')[0], '%m/%d/%Y')
        cw[dt.isocalendar()[:2]] += x['cases']
    print('\ncases on display by week:')
    for k in sorted(cw):
        print('   %s-W%02d  %6d cases' % (k[0], k[1], cw[k]))

    prof = customer_base()
    alias = {'phil Ernst': 'Phil Ernst', 'Derrick laws': 'Derrick Laws', 'Daniel La Gala': 'Dan Lagala',
             'Matthew Powierski': 'Matt Powierski', 'John O’Donoghue': "John O'Donoghue"}
    print('\ndisplays per off-premise account (the fair comparison):')
    out = []
    for p in d['people']:
        if p['role'] != 'Sales Rep':
            continue
        n = alias.get(p['name'], p['name'])
        b = prof[n]['off'] if n in prof else 0
        if b >= 8:
            out.append((p['total'] / b, n, p['total'], b))
    for r, n, t, b in sorted(out, reverse=True)[:8]:
        print('   %-20s %.2f per account  (%d displays / %d accounts)' % (n, r, t, b))


def section_inventory():
    head('INVENTORY -- CONTEXT FOR MOLSON COORS')
    p = path('inventory/data/InventoryProjections.csv')
    rows = list(csv.DictReader(open(p)))
    k = list(rows[0].keys())
    mc = [r for r in rows if re.search(r'peroni|coors|blue moon|miller|molson|banquet|fever tree|leinenkugel',
                                       str(r[k[1]]), re.I)]
    bo = [r for r in mc if num(r['Backordered']) > 0]
    low = [r for r in mc if 0 <= num(r['Days of Inventory']) <= 7 and num(r['Jun 26']) > 50]
    print('%d Molson-family SKUs backordered; %d moving SKUs at <=7 days on hand' % (len(bo), len(low)))
    for r in sorted(bo, key=lambda x: -num(x['Backordered']))[:6]:
        print('   BO %8.0f  %-46s' % (num(r['Backordered']), str(r[k[1]])[:46]))
    for r in low[:6]:
        print('   %s days  %-46s' % (str(r['Days of Inventory']).rjust(4), str(r[k[1]])[:46]))
    print('\nNOTE: this export is only as fresh as the last inventory pull -- check git log.')


def section_freshness():
    head('DATA FRESHNESS -- say anything stale out loud in the footer')
    for p in ('summer26/data/sync_meta.json',
              'MPOs/off-prem/data/%s/sync_meta.json' % latest_mpo_month('off-prem'),
              'MPOs/on-prem/data/%s/sync_meta.json' % latest_mpo_month('on-prem')):
        try:
            print('  %-52s %s' % (p, json.load(open(path(p))).get('synced_at')))
        except Exception:
            pass
    for label, hp, sid in (('tap survey', 'isellbeer/tap-survey-tracking/index.html', 'tap-data'),
                           ('exec overview', 'isellbeer/executive-overview/index.html', 'exec-data')):
        try:
            print('  %-52s %s' % (label, blob(hp, sid).get('generatedAt')))
        except Exception:
            pass
    try:
        d = blob('isellbeer/display-auction-tracker/index.html', 'da-data')
        print('  %-52s through %s' % ('display auction', d['meta']['endDate']))
    except Exception:
        pass
    try:
        d = blob('wine-spirits/wine-spirits-tracker.html', 'ws-data')
        print('  %-52s %s (reorders anchored %s)'
              % ('wine & spirits', d.get('generatedAt'), d['lostOverview']['anchorDate']))
    except Exception:
        pass


SECTIONS = {
    'base': section_base, 'taps': section_taps, 'draft': section_draft,
    'mpo': section_mpo, 'ws': section_ws, 'displays': section_displays,
    'inventory': section_inventory, 'freshness': section_freshness,
}

if __name__ == '__main__':
    want = sys.argv[1:] or list(SECTIONS)
    for name in want:
        fn = SECTIONS.get(name)
        if not fn:
            print('unknown section %r -- pick from %s' % (name, ', '.join(SECTIONS)))
            continue
        try:
            fn()
        except Exception as e:
            print('\n[%s failed: %s -- check the dashboard structure changed]' % (name, e))
