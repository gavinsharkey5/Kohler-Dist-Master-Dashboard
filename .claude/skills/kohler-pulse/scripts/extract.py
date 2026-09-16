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
    """Wine & Spirits.

    Rebuilt 2026-08-25 into ONE dashboard (wine-spirits/index.html) holding a
    compressed columnar payload: lookup tables plus sales cells (account x item
    x month, in cases), so nothing is pre-aggregated -- the page sums whatever
    range you pick. That rebuild also fixed the old full-year-vs-YTD artifact,
    so year-over-year here is real. Compare COMPLETE months only: the current
    month is partial on one side and will read as a collapse if you include it.
    """
    head('WINE & SPIRITS')
    d = blob('wine-spirits/index.html', 'ws-data')
    mk = d['meta']['monthKeys']
    S, accounts, items = d['sales'], d['accounts'], d['items']
    fams, reps, areaNames = d['families'], d['reps'], d['areaNames']

    complete = [k for k in mk if k < max(mk)]          # drop the in-progress month
    year = max(complete)[:4]
    cur_keys = [k for k in complete if k.startswith(year)]
    pri_keys = [str(int(year) - 1) + k[4:] for k in cur_keys]
    cur = {i for i, k in enumerate(mk) if k in set(cur_keys)}
    pri = {i for i, k in enumerate(mk) if k in set(pri_keys)}
    print('equal windows: %s..%s vs %s..%s' % (cur_keys[0], cur_keys[-1], pri_keys[0], pri_keys[-1]))

    cc = pc = 0.0
    buy_c, buy_p = set(), set()
    fam_c, fam_p = collections.Counter(), collections.Counter()
    for n in range(len(S['a'])):
        m, c, a, f = S['m'][n], S['c'][n], S['a'][n], items[S['i'][n]]['f']
        if m in cur:
            cc += c; buy_c.add(a); fam_c[f] += c
        elif m in pri:
            pc += c; buy_p.add(a); fam_p[f] += c
    print('CASES            %.0f -> %.0f  (%+.1f%%)' % (pc, cc, (cc - pc) / pc * 100 if pc else 0))
    print('BUYING ACCOUNTS  %d -> %d   (roster %d, %.0f%% activated)'
          % (len(buy_p), len(buy_c), len(accounts), len(buy_c) / len(accounts) * 100))
    print('new this year %d | went quiet %d' % (len(buy_c - buy_p), len(buy_p - buy_c)))

    rows = [(fam_c[i], fam_p[i], fams[i]) for i in set(list(fam_c) + list(fam_p))]
    tot = sum(r[0] for r in rows)
    print('\nconcentration -- check whether one family is carrying the whole trend:')
    for c, pv, n in sorted(rows, reverse=True)[:6]:
        print('   %-26s %7.0f cs = %4.1f%% of book  (%+.0f%% YoY)'
              % (n[:26], c, c / tot * 100 if tot else 0, ((c - pv) / pv * 100) if pv else 0))
    top = max(rows)[2] if rows else None
    if top:
        tc = sum(c for c, pv, n in rows if n == top)
        tp = sum(pv for c, pv, n in rows if n == top)
        if pc - tp:
            print('   excluding %s: %.0f -> %.0f  (%+.1f%%)'
                  % (top, pc - tp, cc - tc, ((cc - tc) - (pc - tp)) / (pc - tp) * 100))

    big = [(c, pv, n) for c, pv, n in rows if c >= 100 or pv >= 100]
    print('\ngrowing:')
    for c, pv, n in sorted(big, key=lambda x: -(x[0] - x[1]))[:5]:
        print('   %-26s %+7.0f cs  (%.0f -> %.0f)' % (n[:26], c - pv, pv, c))
    print('declining:')
    for c, pv, n in sorted(big, key=lambda x: (x[0] - x[1]))[:5]:
        print('   %-26s %+7.0f cs  (%.0f -> %.0f)' % (n[:26], c - pv, pv, c))

    # Activation against each rep's own assigned book, and by district --
    # this is the scoreboard Southern District is reported on (never taps).
    CORE = {'Bergen', 'Passaic', 'Passaic-FF', 'Sussex', 'Morris 1', 'Morris 3'}
    SOUTH = {'Morris 2', 'Essex', 'Hudson', 'Union'}
    roster, active = collections.Counter(), collections.Counter()
    g_r, g_a = collections.Counter(), collections.Counter()
    for idx, a in enumerate(accounts):
        rep = reps[a['r']] if a.get('r') is not None and a['r'] < len(reps) else '?'
        roster[rep] += 1
        area = areaNames[a['ar']] if a.get('ar') is not None and a['ar'] < len(areaNames) else None
        grp = 'CORE' if area in CORE else ('SOUTH' if area in SOUTH else None)
        if grp:
            g_r[grp] += 1
        if idx in buy_c:
            active[rep] += 1
            if grp:
                g_a[grp] += 1
    print('\nactivation by district (Southern is reported here, not on taps):')
    for g in ('CORE', 'SOUTH'):
        if g_r[g]:
            print('   %-6s %4d assigned, %3d buying = %.0f%%' % (g, g_r[g], g_a[g], g_a[g] / g_r[g] * 100))
    print('\ntop reps by activation rate (own book, min 20 accounts):')
    rr = [(active[r] / roster[r] * 100, r, active[r], roster[r]) for r in roster if roster[r] >= 20]
    for p_, r, a, t in sorted(rr, reverse=True)[:6]:
        print('   %5.0f%%  %-20s %3d of %3d' % (p_, r, a, t))
    print('   (on-premise reps sit structurally lower -- spirits in a bar is a different sell)')

    P, W = d['placements'], d['meta']['lostWindowDays']
    lost = [i for i in range(len(P['d'])) if P['d'][i] > W]
    print('\nreorder gap: %d of %d placements have no order in %d+ days (%.0f%%)'
          % (len(lost), len(P['d']), W, len(lost) / len(P['d']) * 100 if P['d'] else 0))
    print('   %d distinct accounts, %.0f cases behind them, anchored %s'
          % (len({P['cust'][i] for i in lost}), sum(P['c'][i] for i in lost), d['meta']['placementAnchor']))


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
    # Inventory data moved to inventory-data/ (lowercase filenames) in Sept 2026.
    p = path('inventory-data/inventory_projections.csv')
    if not os.path.exists(p):
        p = path('inventory/data/InventoryProjections.csv')
    rows = list(csv.DictReader(open(p, encoding='utf-8-sig')))
    k = list(rows[0].keys())
    mc = [r for r in rows if re.search(r'peroni|coors|blue moon|miller|molson|banquet|fever tree|leinenkugel|keystone',
                                       str(r[k[1]]), re.I)]
    bo = [r for r in mc if num(r['Backordered']) > 0]
    mcol = [c for c in k if re.match(r'^[A-Z][a-z]{2} \d\d$', c)][-1]   # newest actual month column
    low = [r for r in mc if 0 <= num(r['Days of Inventory']) <= 7 and num(r[mcol]) > 50]
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
