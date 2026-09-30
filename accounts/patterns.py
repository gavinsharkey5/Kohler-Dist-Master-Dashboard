"""
Buying patterns + alerts for one account (2026-09-30).

THE ONE RULE ENGINE. generate.py runs it per account and writes the result
into the account's data file; accounts.js only renders. backtest.py runs
the same code against earlier months to measure how often a flagged
product was in fact bought afterwards. Every threshold is here, named.

GRAIN. The sales master is Fusion product x account x MONTH, net cases
(returns already netted; a net-negative month is a credit, not a
purchase). So every interval below is in MONTHS, "purchase dates" are
BUYING MONTHS (a month with net cases > 0), and the reference point is
the last COMPLETE loaded month, never today -- overdue never grows past
the data. Invoice-level history (see REPORTING_REQUEST.md) would let the
same rules run in days.

DEFINITIONS (per product, and again per brand family)
  window          the last 18 months ending at the reference month
  buying months   months in the window with net cases > 0
  recurring       6+ buying months in the window (backtested: 4 flagged
                  far too much; see backtest.py)
  interval (I)    median gap, in months, between consecutive buying
                  months (window); "regular" when I <= 3
  irregular       the longest gap is >= 3x the median and >= 4 months
                  -> patterns are reported, alerts are NOT raised
  seasonal        irregular AND bought in two different calendar years
                  -> reported as seasonal, never alerted
  since           months from the last buying month to the reference month
  one-time        exactly one buying month in the whole history
  occasional      2-5 buying months in the window
  consistent      bought in 9+ of the last 12 months

ALERTS (recurring, regular products only; a one-time or occasional or
irregular product is never alerted)
  possible reorder      I + 1 <= since < lapse_at   (PAST the usual gap by
                        at least a month; at the usual gap is not an alert)
  lapsed buyer          lapse_at <= since < lapse_at + 3,
                        lapse_at = max(2 x I, I + 2)
                        (I=1 -> lapsed at 3 months; I=2 -> 4; I=3 -> 6)
  stopped               since >= lapse_at + 3: reported under "no longer
                        bought", NOT alerted (too old to chase as a reorder)
  buying less often     the product still has no reorder / lapsed alert, the
                        prior 6 months had 5+ buying months and the recent 6
                        have at least 3 fewer (equal-length periods)
  order size change     median cases per buying month over the recent 6
                        buying months vs the 6 before, changed >= 25% AND
                        >= 2 cases

ACCOUNT LEVEL
  frequency  distinct buying months (any product), recent 6 vs prior 6
  volume     last 3 months vs the 3 before vs the same 3 months a year ago
  order size median monthly cases, recent 6 buying months vs prior 6
  new placements  first buying month within the last 6 months, with 6+
                  months of history before it: "repeat" (2+ buying months)
                  or "one-time" (1, and since >= 2)
  switching  a product flagged reorder/lapsed whose brand family was still
             bought (other products) within the last I months -> the alert
             is kept but says "family still buying: <product> in <month>"

Everything is a possibility to check. Nothing here knows shelf stock,
sell-through, or why an account stopped ordering.
"""
from statistics import median

WINDOW = 18
RECUR_MIN = 6
REGULAR_MAX = 3
SLOWER_MIN_PRIOR = 5
SLOWER_DROP = 3
REORDER_PAST = 1     # possible reorder only once PAST the usual gap (since >= I + 1)
STOP_AFTER = 3       # lapsed for more than lapse_at + 3 months -> 'stopped' (history, no alert)
SIZE_CHANGE_PCT = 0.25
SIZE_CHANGE_ABS = 2.0
CONSISTENT_MIN12 = 9


def _buying(arr, lo, hi):
    return [i for i in range(lo, hi + 1) if arr[i] > 0]


def _gaps(idxs):
    return [b - a for a, b in zip(idxs, idxs[1:])]


def _med(xs):
    return float(median(xs)) if xs else None


def lapse_at(interval):
    return max(2 * interval, interval + 2)


def classify(arr, ref, months):
    """One product (or family) series -> pattern + alert. arr: cases per month."""
    lo = max(0, ref - WINDOW + 1)
    win = _buying(arr, lo, ref)
    ever = _buying(arr, 0, ref)
    out = {'buying': len(win), 'ever': len(ever), 'last': months[ever[-1]] if ever else None,
           'since': (ref - ever[-1]) if ever else None, 'kind': None, 'interval': None, 'alert': None,
           'recent6': len([i for i in win if i > ref - 6]), 'prior6': len([i for i in win if ref - 12 < i <= ref - 6])}
    if not ever:
        out['kind'] = 'none'; return out
    if len(ever) == 1:
        out['kind'] = 'one-time'; return out
    if len(win) < RECUR_MIN:
        out['kind'] = 'occasional'; return out
    gaps = _gaps(win)
    I = int(round(_med(gaps))) if gaps else 1
    out['interval'] = I
    longest = max(gaps) if gaps else 0
    if longest >= 3 * I and longest >= 4:
        years = {months[i][:4] for i in win}
        out['kind'] = 'seasonal' if len(years) > 1 else 'irregular'
        return out
    if I > REGULAR_MAX:
        out['kind'] = 'infrequent'; return out
    out['kind'] = 'regular'
    since = out['since']
    L = lapse_at(I)
    out['lapseAt'] = L
    if since >= L + STOP_AFTER:
        out['kind'] = 'stopped'          # history, not an alert: too long ago to chase as a reorder
        return out
    if since >= L: out['alert'] = 'lapsed'
    elif since >= I + REORDER_PAST: out['alert'] = 'reorder'
    # buying less often: still a buyer (no reorder / lapsed alert) but the recent 6
    # months hold far fewer buying months than the 6 before (equal-length periods)
    if not out['alert'] and out['prior6'] >= SLOWER_MIN_PRIOR and out['recent6'] <= out['prior6'] - SLOWER_DROP:
        out['slower'] = True
    # order size: median cases per buying month, recent 6 buying months vs the 6 before
    recent_b = win[-6:]; prior_b = win[-12:-6]
    if len(recent_b) >= 3 and len(prior_b) >= 3:
        r = _med([arr[i] for i in recent_b]); p = _med([arr[i] for i in prior_b])
        if p and abs(r - p) >= SIZE_CHANGE_ABS and abs(r - p) / p >= SIZE_CHANGE_PCT:
            out['size'] = {'recent': round(r, 1), 'prior': round(p, 1), 'dir': 'up' if r > p else 'down'}
    out['usual'] = round(_med([arr[i] for i in win]), 1)
    return out


def analyze(products, months, ref=None):
    """products: [[pn, name, family, supplier, pkg, cases[]], ...]. ref: index of the
    reference (last complete) month. Returns {'ref', 'alerts', 'patterns'}."""
    N = len(months)
    ref = N - 1 if ref is None else ref
    if ref < 0 or not products:
        return {'ref': months[ref] if 0 <= ref < N else None, 'alerts': [], 'patterns': None}
    series = [0.0] * N
    fam_series = {}
    per = []
    for p in products:
        arr = p[5]
        for i in range(N):
            series[i] += arr[i]
        f = p[2] or 'Other'
        fa = fam_series.setdefault(f, [0.0] * N)
        for i in range(N):
            fa[i] += arr[i]
        c = classify(arr, ref, months)
        c['pn'] = p[0]; c['name'] = p[1]; c['family'] = f; c['pkg'] = p[4]
        c['cases12'] = round(sum(arr[max(0, ref - 11):ref + 1]), 1)
        c['months12'] = len(_buying(arr, max(0, ref - 11), ref))
        per.append(c)
    fams = {}
    for f, fa in fam_series.items():
        fc = classify(fa, ref, months); fc['family'] = f
        fc['cases12'] = round(sum(fa[max(0, ref - 11):ref + 1]), 1)
        fams[f] = fc

    # ---- alerts, with evidence ----
    alerts = []
    for c in per:
        if not c['alert'] and not c.get('slower'):
            continue
        f = fams.get(c['family'])
        switch = None
        if c['alert'] and f and f['last'] and (ref - months.index(f['last'])) < c['since']:
            # the family was still bought after this product's last month: find what
            fl = months.index(f['last'])
            others = [q for q in per if q['family'] == c['family'] and q['pn'] != c['pn'] and q['last'] == months[fl]]
            if others:
                o = max(others, key=lambda q: q['cases12'])
                switch = {'product': o['name'], 'month': months[fl]}
        for kind in ([c['alert']] if c['alert'] else []) + (['slower'] if c.get('slower') else []):
            alerts.append({'type': kind, 'pn': c['pn'], 'product': c['name'], 'family': c['family'], 'pkg': c['pkg'],
                           'last': c['last'], 'since': c['since'], 'interval': c['interval'], 'lapseAt': c.get('lapseAt'),
                           'buying': c['buying'], 'usual': c.get('usual'), 'recent6': c['recent6'], 'prior6': c['prior6'],
                           'switch': switch, 'cases12': c['cases12']})
    # strongest first: lapsed before reorder before slower; within a type, the bigger usual order first
    rank = {'lapsed': 0, 'reorder': 1, 'slower': 2}
    alerts.sort(key=lambda a: (rank[a['type']], -(a['usual'] or 0), -(a['cases12'] or 0)))

    # ---- account-level patterns ----
    lo = max(0, ref - WINDOW + 1)
    acct_buying = _buying(series, lo, ref)
    gaps = _gaps(acct_buying)
    top_products = sorted([c for c in per if c['months12']], key=lambda c: (-c['months12'], -c['cases12']))[:5]
    top_fams = sorted(fams.values(), key=lambda f: (-f['cases12']))[:4]
    consistent = [c for c in per if c['months12'] >= CONSISTENT_MIN12]
    occasional = [c for c in per if c['kind'] == 'occasional']
    seasonal = [c for c in per if c['kind'] == 'seasonal']
    new_pl = []
    for c in per:
        arr = next(p[5] for p in products if p[0] == c['pn'])
        ever = _buying(arr, 0, ref)
        if ever and ever[0] > ref - 6 and ever[0] >= 6:
            new_pl.append({'product': c['name'], 'family': c['family'], 'first': months[ever[0]], 'buying': len(ever),
                           'repeat': len(ever) >= 2, 'since': ref - ever[-1]})
    size_recent = _med([series[i] for i in acct_buying[-6:]]) if len(acct_buying) >= 3 else None
    size_prior = _med([series[i] for i in acct_buying[-12:-6]]) if len(acct_buying) >= 9 else None
    last3 = sum(series[max(0, ref - 2):ref + 1]); prior3 = sum(series[max(0, ref - 5):ref - 2]) if ref >= 5 else None
    ly3 = sum(series[ref - 14:ref - 11]) if ref >= 14 else None
    freq = {'recent6': len([i for i in acct_buying if i > ref - 6]), 'prior6': len([i for i in acct_buying if ref - 12 < i <= ref - 6])}
    patterns = {
        'ref': months[ref], 'window': months[lo],
        'accountInterval': int(round(_med(gaps))) if gaps else None, 'buyingMonths': len(acct_buying),
        'freq': freq, 'volume': {'last3': round(last3, 1), 'prior3': round(prior3, 1) if prior3 is not None else None, 'ly3': round(ly3, 1) if ly3 is not None else None},
        'orderSize': {'recent': round(size_recent, 1) if size_recent is not None else None, 'prior': round(size_prior, 1) if size_prior is not None else None},
        'topProducts': [{'product': c['name'], 'family': c['family'], 'months12': c['months12'], 'cases12': c['cases12'], 'kind': c['kind'], 'interval': c['interval']} for c in top_products],
        'topFamilies': [{'family': f['family'], 'cases12': f['cases12'], 'kind': f['kind'], 'interval': f['interval'], 'last': f['last']} for f in top_fams],
        'consistent': [c['name'] for c in sorted(consistent, key=lambda c: -c['cases12'])[:8]],
        'consistentN': len(consistent), 'occasionalN': len(occasional), 'oneTimeN': len([c for c in per if c['kind'] == 'one-time']),
        'seasonal': [{'product': c['name'], 'last': c['last']} for c in seasonal[:5]], 'seasonalN': len(seasonal),
        'irregularN': len([c for c in per if c['kind'] == 'irregular']),
        'newPlacements': sorted(new_pl, key=lambda x: (not x['repeat'], x['first']), reverse=True)[:8],
        'newPlacementsN': len(new_pl), 'newRepeatN': len([x for x in new_pl if x['repeat']]),
        'sizeChanges': [{'product': c['name'], 'recent': c['size']['recent'], 'prior': c['size']['prior'], 'dir': c['size']['dir']} for c in per if c.get('size')][:6],
        'recurringN': len([c for c in per if c['kind'] == 'regular']),
        'stopped': [{'product': c['name'], 'family': c['family'], 'last': c['last'], 'interval': c['interval'], 'buying': c['buying']} for c in sorted([c for c in per if c['kind'] == 'stopped'], key=lambda c: -c['buying'])[:8]],
        'stoppedN': len([c for c in per if c['kind'] == 'stopped']),
        'families': sorted({c['family'] for c in per if c['cases12'] > 0}),
    }
    counts = {'reorder': len([a for a in alerts if a['type'] == 'reorder']), 'lapsed': len([a for a in alerts if a['type'] == 'lapsed']), 'slower': len([a for a in alerts if a['type'] == 'slower'])}
    # account-level "purchasing less frequently" = the ACCOUNT's own buying months
    # dropped (recent 6 vs prior 6, same rule as a product). Products slowing
    # individually are counted separately (counts['slower']), never rolled up.
    patterns['lessOften'] = bool(freq['prior6'] >= SLOWER_MIN_PRIOR and freq['recent6'] <= freq['prior6'] - SLOWER_DROP)
    return {'ref': months[ref], 'alerts': alerts, 'counts': counts, 'patterns': patterns}


def summary_lines(res):
    """The list's one-line evidence, strongest first (max 3)."""
    if not res or res.get('patterns') is None:
        return []
    c = res['counts']; p = res['patterns']; out = []
    if c['reorder']: out.append(f"{c['reorder']} possible reorder{'s' if c['reorder'] != 1 else ''}")
    if c['lapsed']: out.append(f"{c['lapsed']} lapsed product{'s' if c['lapsed'] != 1 else ''}")
    if p['lessOften']: out.append('Purchasing less frequently')
    if c['slower']: out.append(f"{c['slower']} product{'s' if c['slower'] != 1 else ''} bought less often")
    v = p['volume']
    if v['prior3'] and v['prior3'] >= 10:
        if v['last3'] < 0.75 * v['prior3']: out.append('Volume down vs prior 3 months')
        elif v['last3'] > 1.25 * v['prior3']: out.append('Volume up vs prior 3 months')
    return out[:3]
