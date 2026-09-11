#!/usr/bin/env python3
"""Builds Summer_of_Success_ROI_Analysis.xlsx -- the did-it-work evaluation of the
Summer of Success 2026 incentive.

    python3 make_roi_analysis.py

Reads three account-level RDE exports, the vF payout recap, summer26/goals.csv and
this repo's territory rosters, and writes a 21-tab workbook in which every analysis
cell is a live formula off the Data tabs. Replace a Data tab with a fresh export of
the same shape and the whole evaluation re-runs.

Payout figures are READ from Summer_of_Success_Recap_vF.xlsx rather than recomputed,
so this workbook cannot disagree with the document that actually pays people.

See README.txt for what each tab argues and where the numbers come from.
"""
import csv, collections, datetime, re
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter as gl

import csv, collections, re
from pathlib import Path
import openpyxl

U = Path('/root/.claude/uploads/899825c2-dd3d-53b0-913e-556db6c3b287')
SRC = {
    'season': U / 'a1ea6715-RDE_2026_Summer_of_Success_52.csv',
    'pre':    U / '209b605a-RDE_2026_Summer_of_Success_Jan__May_1.csv',
    'ctrl':   U / '802c8f64-RDE_2026_Summer_of_Success_Brands_Not_Included_in_SoS_1.csv',
    'recap':  U / '77ef586c-Summer_of_Success_Recap_vF.xlsx',
}
REPO = Path('/home/user/Kohler-Dist-Master-Dashboard')
GOALS = REPO / 'summer26' / 'goals.csv'
OUT = REPO / 'summer26' / 'roi' / 'Summer_of_Success_ROI_Analysis.xlsx'
EXCLUDED = {'Default', 'Office Tell Sell', 'Chris Politano', 'Total', ''}


def num(s):
    s = (s or '').strip().replace(',', '').replace('$', '').replace('%', '')
    if s.startswith('(') and s.endswith(')'):
        s = '-' + s[1:-1]
    try:
        return float(s)
    except ValueError:
        return 0.0


def load(path, tagged=True):
    rows = list(csv.DictReader(open(path)))
    K = list(rows[0].keys())
    col = lambda p, y: next(x for x in K if x.startswith(p) and y in x)
    c = {'ce25': col('Case Equiv', '2025'), 'ce26': col('Case Equiv', '2026'),
         'r25': col('Revenue', '2025'), 'r26': col('Revenue', '2026'),
         'g25': col('Gross Profit  ', '2025'), 'g26': col('Gross Profit  ', '2026')}
    out = []
    for r in rows:
        rep = r['Sales Rep Assigned'].strip()
        if rep in EXCLUDED:
            continue
        rec = {'rep': rep, 'sup': r['Supplier'].strip(), 'brand': r['Brand Family'].strip(),
               'acct': r['Customer Num Name'].strip(), 'county': r['County'].strip()}
        if tagged:
            t = r['Qualifier Brands'].strip()
            if t.startswith('Amplify'):
                rec['seg'] = 'Amplify'
            elif t.startswith('Qualifier'):
                rec['seg'] = 'Qualifier'
            else:
                continue
        else:
            rec['seg'] = 'Control'
        for k, cc in c.items():
            rec[k] = num(r[cc])
        out.append(rec)
    return out


MONEY = ('ce25', 'ce26', 'r25', 'r26', 'g25', 'g26')


def roll(recs, keyfn):
    d = collections.defaultdict(collections.Counter)
    for r in recs:
        for k in MONEY:
            d[keyfn(r)][k] += r[k]
    return d


def pods(recs, keyfn):
    """POD = one account x brand that bought. Counts are additive across brands."""
    cell = collections.defaultdict(lambda: [0.0, 0.0])
    for r in recs:
        k = (keyfn(r), r['acct'])
        cell[k][0] += r['ce25']
        cell[k][1] += r['ce26']
    out = collections.defaultdict(collections.Counter)
    for (key, _acct), v in cell.items():
        o = out[key]
        if v[0] > 0:
            o['p25'] += 1
        if v[1] > 0:
            o['p26'] += 1
        if v[0] <= 0 and v[1] > 0:
            o['new'] += 1
            o['newce'] += v[1]
        if v[0] > 0 and v[1] <= 0:
            o['lost'] += 1
            o['lostce'] += v[0]
    return out


def load_payout():
    """Per-rep payout + manager from the vF recap -- Gavin's final payout model."""
    wb = openpyxl.load_workbook(SRC['recap'], data_only=True)
    ws = wb['Rep Totals']
    reps, tot = {}, None
    for r in range(5, ws.max_row + 1):
        name = ws.cell(r, 1).value
        if not name:
            continue
        row = dict(manager=ws.cell(r, 2).value or '',
                   suppliers=ws.cell(r, 3).value or 0, qualified=ws.cell(r, 4).value or 0,
                   partial=ws.cell(r, 5).value or 0, elig=ws.cell(r, 6).value or 0,
                   tier=ws.cell(r, 7).value or 0, amp=ws.cell(r, 8).value or 0,
                   total=ws.cell(r, 9).value or 0)
        if str(name).strip().upper() == 'TOTAL':
            tot = row
        else:
            reps[str(name).strip()] = row
    return reps, tot


def load_goals(qual_recs):
    b2s = {}
    raw = list(csv.DictReader(open(SRC['season'])))
    for r in raw:
        rep = r['Sales Rep Assigned'].strip()
        if rep in EXCLUDED:
            continue
        t = r['Qualifier Brands'].strip()
        if t.startswith('Qualifier') and ': ' in t:
            b2s[(rep, t.split(': ', 1)[1])] = r['Supplier'].strip()
    goals = {}
    for g in csv.DictReader(open(GOALS)):
        if g['Type'].strip() != 'Qualifier':
            continue
        rep = g['Sales Rep'].strip()
        if rep in EXCLUDED:
            continue
        s = b2s.get((rep, g['Brand(s)'].strip()))
        if s:
            goals[(rep, s)] = num(g['2026 Goal'])
    return goals


PREMISE_FILES = [('territory-accounts/core_market_off_prem.csv', 'Off-premise'),
                 ('territory-accounts/core_market_on_prem.csv', 'On-premise'),
                 ('territory-accounts/southern_district_off_prem.csv', 'Off-premise'),
                 ('territory-accounts/southern_district_on_prem.csv', 'On-premise')]


def load_premise():
    """Customer Num -> On/Off-premise, from territory-accounts/ -- the repo's own rosters.

    The exports' "Customer Num Name" starts with that same customer number, which is the join.
    Roughly 9% of accounts (2% of volume) are not on a roster and are carried as 'Unmatched'
    rather than silently dropped or guessed.
    """
    import re as _re
    prem = {}
    for f, kind in PREMISE_FILES:
        for r in csv.DictReader(open(REPO / f)):
            cn = (r.get('Customer Num') or '').strip()
            if cn:
                prem[cn] = kind
    return prem


def premise_of(account, prem):
    import re as _re
    m = _re.match(r'^(\d+)\s', account)
    return prem.get(m.group(1), 'Unmatched') if m else 'Unmatched'


import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter as gl

NAVY, GREY, BLUE, RED, GREEN = '1F3864', '595959', '0000FF', 'C00000', '156B2E'
FONT = 'Arial'
CE = '#,##0;(#,##0);-'
USD = '$#,##0;($#,##0);-'
USD2 = '$#,##0.00;($#,##0.00);-'
PCT = '0.0%;(0.0%);-'
PCT2 = '0.00%;(0.00%);-'
PTS = '+0.0" pts";(0.0)" pts";-'
NUM = '#,##0;(#,##0);-'


def st(c, *, bold=False, size=10, color=None, bg=None, fmt=None, wrap=False,
       italic=False, align=None):
    c.font = Font(name=FONT, size=size, bold=bold, color=color, italic=italic)
    if bg:
        c.fill = PatternFill('solid', fgColor=bg)
    if fmt:
        c.number_format = fmt
    if wrap or align:
        c.alignment = Alignment(wrap_text=wrap, vertical='top', horizontal=align)
    return c


def head(ws, title, sub):
    st(ws.cell(1, 1, title), bold=True, size=15, color=NAVY)
    st(ws.cell(2, 1, sub), size=9, color=GREY)


def thead(ws, headers, widths, row=4):
    for i, (h, w) in enumerate(zip(headers, widths), 1):
        st(ws.cell(row, i, h), bold=True, size=9, color='FFFFFF', bg=NAVY, wrap=True,
           align='center')
        ws.column_dimensions[gl(i)].width = w
    ws.row_dimensions[row].height = 32
    ws.freeze_panes = ws.cell(row + 1, 1).coordinate


def note(ws, row, lines, col=1):
    for i, t in enumerate(lines):
        st(ws.cell(row + i, col, t), size=9, color=GREY)
    return row + len(lines)


def band(ws, row, text, size=12, color=NAVY):
    st(ws.cell(row, 1, text), bold=True, size=size, color=color)
    return row + 1


# ------------------------------------------------------------------ load
season = load(SRC['season'])
pre = load(SRC['pre'])
ctrl = load(SRC['ctrl'], tagged=False)
pay_reps, pay_tot = load_payout()
goals = load_goals(season)

SEG_KEY = lambda r: (r['seg'], r['sup'], r['brand'])
CTL_KEY = lambda r: (r['sup'], r['brand'])

b_sea, b_pre = roll(season, SEG_KEY), roll(pre, SEG_KEY)
b_ctl = roll(ctrl, CTL_KEY)
p_sea, p_pre = pods(season, SEG_KEY), pods(pre, SEG_KEY)
p_ctl = pods(ctrl, CTL_KEY)
prog_keys = sorted(b_sea)
ctrl_keys = sorted(b_ctl)
suppliers_both = sorted({k[1] for k in prog_keys} & {k[0] for k in ctrl_keys})
reps = sorted({r['rep'] for r in season})

# account table: one row per account (verified one rep + one county each)
acct = collections.defaultdict(lambda: collections.Counter())
ameta = {}
for r in season:
    a = acct[r['acct']]
    a['pce25'] += r['ce25']; a['pce26'] += r['ce26']
    a['pg25'] += r['g25']; a['pg26'] += r['g26']
    if r['seg'] == 'Amplify':
        a['ace25'] += r['ce25']; a['ace26'] += r['ce26']
    ameta[r['acct']] = (r['rep'], r['county'])
for r in ctrl:
    a = acct[r['acct']]
    a['cce25'] += r['ce25']; a['cce26'] += r['ce26']
    ameta.setdefault(r['acct'], (r['rep'], r['county']))
acct_rows = sorted(acct.items(), key=lambda kv: -(kv[1]['ace26'] - kv[1]['ace25']))

# per-rep POD counts (not additive from brand level, so derived here)
rep_pods = pods(season, lambda r: r['rep'])
rep_sea = roll(season, lambda r: r['rep'])
rep_ctl = roll(ctrl, lambda r: r['rep'])
counties = sorted({c for _, c in ameta.values()})
PREM = load_premise()
premise = {acct: premise_of(acct, PREM) for acct in acct}
channels = ['Off-premise', 'On-premise', 'Unmatched']

wb = openpyxl.Workbook()
wb.remove(wb.active)

# ============================================================== DATA TABS
def data_tab(name, sub, srcfile, rows, lead_cols, lead_vals, extra=()):
    ws = wb.create_sheet(name)
    head(ws, name.replace('Data - ', 'Source data — '), f'{sub}   ·   Source: {srcfile}')
    cols = list(lead_cols) + ['CE 2025', 'CE 2026', 'Revenue 2025', 'Revenue 2026',
                              'GP 2025', 'GP 2026'] + [e[0] for e in extra]
    w = [28 if 'Supplier' in c or 'Account' in c else 22 if c in ('Rep', 'Brand Family')
         else 11 for c in lead_cols] + [11, 11, 14, 14, 13, 13] + [12] * len(extra)
    thead(ws, cols, w)
    for i, (key, v) in enumerate(rows):
        r = 5 + i
        for j, val in enumerate(lead_vals(key, v), 1):
            st(ws.cell(r, j, val), size=9, color=BLUE)
        b = len(lead_cols)
        for j, (k, f) in enumerate(zip(('ce25', 'ce26', 'r25', 'r26', 'g25', 'g26'),
                                       (CE, CE, USD, USD, USD, USD)), b + 1):
            st(ws.cell(r, j, v[k]), size=9, color=BLUE, fmt=f)
        for j, (_lbl, fn, fmt) in enumerate(extra, b + 7):
            st(ws.cell(r, j, fn(key, v)), size=9, color=BLUE, fmt=fmt)
    ws.auto_filter.ref = f'A4:{gl(len(cols))}{4 + len(rows)}'
    return ws, 4 + len(rows)


POD_EXTRA = lambda src: [
    ('PODs 2025', lambda k, v: src[k]['p25'], NUM),
    ('PODs 2026', lambda k, v: src[k]['p26'], NUM),
    ('New PODs', lambda k, v: src[k]['new'], NUM),
    ('CE from new', lambda k, v: src[k]['newce'], CE),
    ('Lost PODs', lambda k, v: src[k]['lost'], NUM),
    ('CE from lost', lambda k, v: src[k]['lostce'], CE),
]

# Season carries REP as well -- Goal Design needs rep x supplier qualifier actuals, and POD
# counts stay additive at this grain because every account maps to exactly one rep.
SEA_KEY = lambda r: (r['rep'], r['seg'], r['sup'], r['brand'])
b_sea_rep, p_sea_rep = roll(season, SEA_KEY), pods(season, SEA_KEY)
sea_keys = sorted(b_sea_rep)
ws_s, LS = data_tab(
    'Data - Season', 'Program brands, 6/1–8/31 (2026 vs 2025), summed to rep × segment × '
    'supplier × brand, with account-derived POD counts', 'RDE_2026_Summer_of_Success_52.csv',
    [(k, b_sea_rep[k]) for k in sea_keys], ['Rep', 'Segment', 'Supplier', 'Brand Family'],
    lambda k, v: list(k), POD_EXTRA(p_sea_rep))
ws_p, LP = data_tab(
    'Data - Pre', 'Program brands, 1/1–5/31 (2026 vs 2025) — pre-program baseline',
    'RDE_2026_Summer_of_Success_Jan__May_1.csv',
    [(k, b_pre[k]) for k in prog_keys], ['Segment', 'Supplier', 'Brand Family'],
    lambda k, v: [k[0], k[1], k[2]], POD_EXTRA(p_pre))
ws_c, LC = data_tab(
    'Data - Control', 'Brands NOT in Summer of Success, 6/1–8/31 (2026 vs 2025)',
    'RDE_2026_..._Brands_Not_Included_in_SoS_1.csv',
    [(k, b_ctl[k]) for k in ctrl_keys], ['Supplier', 'Brand Family'],
    lambda k, v: [k[0], k[1]], POD_EXTRA(p_ctl))

for ws_, n_, agg_note in ((ws_s, LS, 'segment × supplier × brand'),
                          (ws_p, LP, 'segment × supplier × brand'),
                          (ws_c, LC, 'supplier × brand')):
    note(ws_, n_ + 2, [
        f'Blue = from the RDE export, summed to {agg_note}. The export itself is one row per '
        f'rep × brand × ACCOUNT; no tab reads it at that grain, so it is summed here.',
        'POD = a point of distribution, one account × brand that bought. New / lost are '
        'measured at that grain, and the counts are additive across brands, which is why they '
        'can live on this tab and still roll up correctly.',
        'Account-grain analysis runs off the Data - Accounts tab instead.'])

# ------------------------------------------------------------ Data - Accounts
ws = wb.create_sheet('Data - Accounts')
head(ws, 'Source data — accounts',
     'One row per account, 6/1–8/31. Program and non-program volume side by side. '
     'Sorted by program case gain, biggest first.   ·   Source: all three RDE exports')
thead(ws, ['Account', 'County', 'Rep', 'Channel', 'Program CE 2025', 'Program CE 2026',
           'Program GP 2025', 'Program GP 2026', 'Non-program CE 2025',
           'Non-program CE 2026', 'Amplify CE 2025', 'Amplify CE 2026',
           'Program Δ cases', 'Amplify Δ cases'],
      [40, 13, 20, 13, 14, 14, 14, 14, 16, 16, 13, 13, 14, 14])
for i, (a, v) in enumerate(acct_rows):
    r = 5 + i
    rep_, cty = ameta[a]
    for c, val in ((1, a), (2, cty), (3, rep_), (4, premise[a])):
        st(ws.cell(r, c, val), size=9, color=BLUE)
    for c, k, f in ((5, 'pce25', CE), (6, 'pce26', CE), (7, 'pg25', USD), (8, 'pg26', USD),
                    (9, 'cce25', CE), (10, 'cce26', CE), (11, 'ace25', CE), (12, 'ace26', CE)):
        st(ws.cell(r, c, v[k]), size=9, color=BLUE, fmt=f)
    st(ws.cell(r, 13, f'=F{r}-E{r}'), size=9, fmt=CE)
    st(ws.cell(r, 14, f'=L{r}-K{r}'), size=9, fmt=CE)
LA = 4 + len(acct_rows)
ws.auto_filter.ref = f'A4:N{LA}'
note(ws, LA + 2, [
    'Every account maps to exactly one rep and one county in these exports — checked, not '
    'assumed — so this tab is an exact re-grouping, not an approximation.',
    'An account with zero in the non-program columns bought only incented brands, and vice '
    'versa. The Within-Account Control tab uses only accounts with volume on both sides.',
    'Sorted by AMPLIFY case gain, biggest first — that is the order the Account Concentration '
    'tab reads. Concentration is only meaningful on a segment whose net change is positive, '
    'and the program total is negative.',
    'Channel is joined from territory-accounts/ in this repo on the leading customer number. '
    'Accounts on neither roster are carried as Unmatched — about 2% of volume — rather than '
    'guessed at.'])

SEA, PRE, CTL, ACC = "'Data - Season'", "'Data - Pre'", "'Data - Control'", "'Data - Accounts'"

def colmap(names, start='A'):
    """name -> column letter, so a tab's layout can change without hunting letters."""
    from openpyxl.utils import get_column_letter as _gl
    o = ord(start) - ord('A') + 1
    return {n: _gl(o + i) for i, n in enumerate(names)}

MONEY_COLS = ['ce25', 'ce26', 'r25', 'r26', 'g25', 'g26']
POD_COLS = ['p25', 'p26', 'new', 'newce', 'lost', 'lostce']
C_SEA = colmap(['rep', 'seg', 'sup', 'brand'] + MONEY_COLS + POD_COLS)
C_PRE = colmap(['seg', 'sup', 'brand'] + MONEY_COLS + POD_COLS)
C_CTL = colmap(['sup', 'brand'] + MONEY_COLS + POD_COLS)
C_ACC = colmap(['acct', 'county', 'rep', 'channel', 'pce25', 'pce26', 'pg25',
                'pg26', 'cce25', 'cce26', 'ace25', 'ace26', 'delta', 'adelta'])

R_SEA = {n: f'{SEA}!${c}$5:${c}${LS}' for n, c in C_SEA.items()}
R_PRE = {n: f'{PRE}!${c}$5:${c}${LP}' for n, c in C_PRE.items()}
R_CTL = {n: f'{CTL}!${c}$5:${c}${LC}' for n, c in C_CTL.items()}
R_ACC = {n: f'{ACC}!${c}$5:${c}${LA}' for n, c in C_ACC.items()}

# ====================================================== PROGRAM BRANDS engine
ws = wb.create_sheet('Program Brands')
head(ws, 'Program brands — both periods, brand level',
     'SUMIFS off Data - Season and Data - Pre. Feeds the Acceleration Test, Counterfactual, '
     'Distribution and GP Bridge tabs.')
cols = (['Segment', 'Supplier', 'Brand Family'] +
        ['CE 2025', 'CE 2026', 'Rev 2025', 'Rev 2026', 'GP 2025', 'GP 2026'] +
        ['CE 2025', 'CE 2026', 'GP 2025', 'GP 2026'] +
        ['GP/CE 2025', 'GP/CE 2026', 'Rev/CE 2025', 'Rev/CE 2026'] +
        ['GP26 at LY rate', 'Rate effect'] +
        ['Cases % Jun–Aug', 'Cases % Jan–May', 'Swing'])
thead(ws, cols, [11, 28, 24] + [11] * 6 + [11] * 4 + [11] * 4 + [14, 12] + [13, 13, 11], row=5)
st(ws.cell(4, 4, 'JUN–AUG (program period)'), bold=True, size=9, color=NAVY)
st(ws.cell(4, 10, 'JAN–MAY (pre-program)'), bold=True, size=9, color=NAVY)
st(ws.cell(4, 14, 'PER-CASE ECONOMICS, JUN–AUG'), bold=True, size=9, color=NAVY)
st(ws.cell(4, 18, 'GP BRIDGE INPUTS'), bold=True, size=9, color=NAVY)
st(ws.cell(4, 20, 'ACCELERATION'), bold=True, size=9, color=NAVY)
for i, (seg, sup, brand) in enumerate(prog_keys):
    r = 6 + i
    for c, v in ((1, seg), (2, sup), (3, brand)):
        st(ws.cell(r, c, v), size=9)
    SS = lambda k: (f'=SUMIFS({R_SEA[k]},{R_SEA["seg"]},$A{r},{R_SEA["sup"]},$B{r},'
                    f'{R_SEA["brand"]},$C{r})')
    SP = lambda k: (f'=SUMIFS({R_PRE[k]},{R_PRE["seg"]},$A{r},{R_PRE["sup"]},$B{r},'
                    f'{R_PRE["brand"]},$C{r})')
    for c, k in zip(range(4, 10), MONEY_COLS):
        st(ws.cell(r, c, SS(k)), size=9, fmt=CE if c < 6 else USD)
    for c, k in zip(range(10, 14), ['ce25', 'ce26', 'g25', 'g26']):
        st(ws.cell(r, c, SP(k)), size=9, fmt=CE if c < 12 else USD)
    for c, f, fmt in (
            (14, f'=IFERROR($H{r}/$D{r},0)', USD2), (15, f'=IFERROR($I{r}/$E{r},0)', USD2),
            (16, f'=IFERROR($F{r}/$D{r},0)', USD2), (17, f'=IFERROR($G{r}/$E{r},0)', USD2),
            (18, f'=$E{r}*$N{r}', USD),             (19, f'=$E{r}*($O{r}-$N{r})', USD),
            (20, f'=IFERROR($E{r}/$D{r}-1,"")', PCT),
            (21, f'=IFERROR($K{r}/$J{r}-1,"")', PCT),
            (22, f'=IFERROR($T{r}-$U{r},"")', PCT)):
        st(ws.cell(r, c, f), size=9, fmt=fmt)
LPB = 5 + len(prog_keys)
ws.auto_filter.ref = f'A5:V{LPB}'
st(ws.cell(LPB + 1, 1, 'TOTAL'), bold=True)
for c in (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 18, 19):
    st(ws.cell(LPB + 1, c, f'=SUM({gl(c)}6:{gl(c)}{LPB})'), bold=True, size=9,
       fmt=CE if c in (4, 5, 10, 11) else USD)
PB = "'Program Brands'"
R_PB = {c: f'{PB}!${c}$6:${c}${LPB}' for c in 'ABCDEFGHIJKLMNOPQRSTUV'}

# ====================================================== CONTROL BRANDS engine
ws = wb.create_sheet('Control Brands')
head(ws, 'Non-program brands — Jun–Aug, brand level',
     'The control set: every brand NOT in Summer of Success. SUMIFS off Data - Control.')
thead(ws, ['Supplier', 'Brand Family', 'CE 2025', 'CE 2026', 'Rev 2025', 'Rev 2026',
           'GP 2025', 'GP 2026', 'GP/CE 2025', 'GP/CE 2026', 'GP26 at LY rate',
           'Rate effect', 'Cases %'],
      [28, 26, 11, 11, 14, 14, 13, 13, 12, 12, 14, 12, 11])
for i, (sup, brand) in enumerate(ctrl_keys):
    r = 5 + i
    st(ws.cell(r, 1, sup), size=9); st(ws.cell(r, 2, brand), size=9)
    for c, col in zip(range(3, 9), MONEY_COLS):
        st(ws.cell(r, c, f'=SUMIFS({R_CTL[col]},{R_CTL["sup"]},$A{r},{R_CTL["brand"]},$B{r})'),
           size=9, fmt=CE if c < 5 else USD)
    for c, f, fmt in ((9, f'=IFERROR($G{r}/$C{r},0)', USD2),
                      (10, f'=IFERROR($H{r}/$D{r},0)', USD2),
                      (11, f'=$D{r}*$I{r}', USD), (12, f'=$D{r}*($J{r}-$I{r})', USD),
                      (13, f'=IFERROR($D{r}/$C{r}-1,"")', PCT)):
        st(ws.cell(r, c, f), size=9, fmt=fmt)
LCB = 4 + len(ctrl_keys)
ws.auto_filter.ref = f'A4:M{LCB}'
st(ws.cell(LCB + 1, 1, 'TOTAL'), bold=True)
for c in (3, 4, 5, 6, 7, 8, 11, 12):
    st(ws.cell(LCB + 1, c, f'=SUM({gl(c)}5:{gl(c)}{LCB})'), bold=True, size=9,
       fmt=CE if c in (3, 4) else USD)
CB = "'Control Brands'"
R_CB = {c: f'{CB}!${c}$5:${c}${LCB}' for c in 'ABCDEFGHIJKLM'}

# ====================================================== DISTRIBUTION
ws = wb.create_sheet('Distribution')
head(ws, 'Did the program build distribution, or just move cases?',
     'A POD is one account × brand that bought. ΔCE splits into a distribution effect '
     '(more or fewer PODs) and a rate-of-sale effect (each POD buying more or less).')
for c, w in zip('ABCDEFGHIJKLM', (30, 12, 12, 10, 11, 12, 11, 12, 12, 12, 10, 14, 14)):
    ws.column_dimensions[c].width = w
thead(ws, ['', 'PODs 2025', 'PODs 2026', 'POD %', 'New PODs', 'CE from new', 'Lost PODs',
           'CE from lost', 'Cases/POD 25', 'Cases/POD 26', 'Rate %', 'Distribution effect',
           'Rate-of-sale effect'],
      [30, 12, 12, 10, 11, 12, 11, 12, 12, 12, 10, 14, 14])

BLOCKS = [
    ('JUN–AUG — the program period', [
        ('Qualifier brands', R_SEA, 'seg', 'Qualifier'),
        ('Amplify brands', R_SEA, 'seg', 'Amplify'),
        ('Non-program brands (control)', R_CTL, 'ctl', None)]),
    ('JAN–MAY — the same brands, before the program', [
        ('Qualifier brands', R_PRE, 'seg', 'Qualifier'),
        ('Amplify brands', R_PRE, 'seg', 'Amplify')]),
]
row = 5
dist_ref = {}
for title, items in BLOCKS:
    row = band(ws, row, title, size=11)
    for label, R, kind, seg in items:
        st(ws.cell(row, 1, label), size=10)
        crit = f',{R["seg"]},"{seg}"' if kind == 'seg' else ''
        f = (lambda key: (f'=SUMIFS({R[key]}{crit})' if crit else f'=SUM({R[key]})'))
        for c, key, fmt in ((2, 'p25', NUM), (3, 'p26', NUM), (5, 'new', NUM),
                            (6, 'newce', CE), (7, 'lost', NUM), (8, 'lostce', CE)):
            st(ws.cell(row, c, f(key)), size=10, fmt=fmt)
        st(ws.cell(row, 4, f'=IFERROR(C{row}/B{row}-1,"")'), size=10, fmt=PCT, bold=True)
        # cases per POD needs the CE totals; park them off to the right
        st(ws.cell(row, 15, f(  'ce25')), size=9, fmt=CE, color=GREY)
        st(ws.cell(row, 16, f(  'ce26')), size=9, fmt=CE, color=GREY)
        st(ws.cell(row, 9,  f'=IFERROR(O{row}/B{row},"")'), size=10, fmt='#,##0.0')
        st(ws.cell(row, 10, f'=IFERROR(P{row}/C{row},"")'), size=10, fmt='#,##0.0')
        st(ws.cell(row, 11, f'=IFERROR(J{row}/I{row}-1,"")'), size=10, fmt=PCT, bold=True)
        st(ws.cell(row, 12, f'=(C{row}-B{row})*I{row}'), size=10, fmt=CE, bold=True)
        st(ws.cell(row, 13, f'=C{row}*(J{row}-I{row})'), size=10, fmt=CE, bold=True)
        dist_ref[(title.split(' —')[0], label)] = row
        row += 1
    row += 1
st(ws.cell(4, 15, 'CE 2025'), bold=True, size=8, color=GREY)
st(ws.cell(4, 16, 'CE 2026'), bold=True, size=8, color=GREY)
ws.column_dimensions['O'].width = 12
ws.column_dimensions['P'].width = 12
DIST = "'Distribution'"
row = band(ws, row, 'WHAT THIS SETTLES')
note(ws, row, [
    'Amplify PODs grew 4.2% during the program — but 5.5% in the five months BEFORE it. '
    'Distribution growth decelerated, exactly like volume did.',
    'The qualifier decline was NOT lost distribution. PODs fell only 1.2%, the same as the '
    'control; what collapsed was rate of sale, from -0.9% pre-program to -4.1% during. Reps '
    'held their accounts; the accounts bought less. That is a market result, not an effort one.',
    'Distribution effect = (PODs 2026 − PODs 2025) × cases per POD in 2025. Rate-of-sale '
    'effect = PODs 2026 × the change in cases per POD. The two sum to ΔCE.',
])

# ====================================================== WITHIN-ACCOUNT CONTROL
ws = wb.create_sheet('Within-Account Control')
head(ws, 'The tightest control available — same account, same summer, same buyer',
     'Restricted to accounts that bought BOTH incented and non-incented brands. Account mix, '
     'rep, channel and geography are all held constant; the only difference is the incentive.')
for c, w in zip('ABCDEF', (46, 18, 18, 16, 14, 14)):
    ws.column_dimensions[c].width = w
thead(ws, ['', 'CE 2025', 'CE 2026', 'Change', '', ''], [46, 18, 18, 16, 14, 14])
BOTH = f'{R_ACC["pce25"]},">0",{R_ACC["cce25"]},">0"'
row = 5
st(ws.cell(row, 1, 'Accounts buying on both sides'), size=10)
st(ws.cell(row, 2, f'=COUNTIFS({BOTH})'), size=10, fmt=NUM, bold=True)
row += 2
wa = {}
for label, c25, c26 in (('INCENTED brands in those accounts', 'pce25', 'pce26'),
                        ('NON-incented brands in the SAME accounts', 'cce25', 'cce26')):
    st(ws.cell(row, 1, label), size=10, bold=True)
    st(ws.cell(row, 2, f'=SUMIFS({R_ACC[c25]},{BOTH})'), size=10, fmt=CE)
    st(ws.cell(row, 3, f'=SUMIFS({R_ACC[c26]},{BOTH})'), size=10, fmt=CE)
    st(ws.cell(row, 4, f'=IFERROR(C{row}/B{row}-1,"")'), size=10, fmt=PCT2, bold=True)
    wa[label.split()[0]] = row
    row += 1
st(ws.cell(row, 1, 'Gap'), bold=True, size=11)
st(ws.cell(row, 4, f'=D{wa["INCENTED"]}-D{wa["NON-incented"]}'), bold=True, size=11,
   fmt=PTS, color=RED)
WAC_GAP = row
row += 2
row = band(ws, row, 'WHY THIS MATTERS MOST')
note(ws, row, [
    'Every other control in this workbook can be answered with "but those were different '
    'accounts." This one cannot. Inside the same 1,704 stores, over the same three months, '
    'the brands carrying an incentive performed no better than the brands carrying none.',
    'It is also the fairest test to the sales team: it holds constant everything a rep does '
    'not control — which accounts they have, what channel, what geography — and still finds '
    'no incentive effect.',
])

# ====================================================== ACCOUNT CONCENTRATION
ws = wb.create_sheet('Account Concentration')
head(ws, 'How many accounts actually produced the gain?',
     'AMPLIFY volume only — that is the segment with a positive net change, and the only one '
     'where "share of the gain" means anything. Accounts ranked by amplify case gain.')
thead(ws, ['Rank', 'Account', 'County', 'Channel', 'Rep', 'Amplify CE 2025',
           'Amplify CE 2026', 'Δ cases', 'Cumulative Δ', 'Share of net amplify gain'],
      [7, 40, 12, 13, 19, 14, 14, 12, 13, 16])
TOPN = 60
NET = f'=SUM({R_ACC["ace26"]})-SUM({R_ACC["ace25"]})'
for i in range(TOPN):
    r, src = 5 + i, 5 + i
    st(ws.cell(r, 1, i + 1), size=9)
    for col, key in ((2, 'acct'), (3, 'county'), (4, 'channel'), (5, 'rep')):
        st(ws.cell(r, col, f'={ACC}!{C_ACC[key]}{src}'), size=9)
    st(ws.cell(r, 6, f'={ACC}!{C_ACC["ace25"]}{src}'), size=9, fmt=CE)
    st(ws.cell(r, 7, f'={ACC}!{C_ACC["ace26"]}{src}'), size=9, fmt=CE)
    st(ws.cell(r, 8, f'=G{r}-F{r}'), size=9, fmt=CE, bold=True)
    st(ws.cell(r, 9, f'=SUM($H$5:$H{r})'), size=9, fmt=CE)
    st(ws.cell(r, 10, f'=IFERROR($I{r}/$B${5 + TOPN + 2},"")'), size=9, fmt=PCT)
row = 5 + TOPN + 1
st(ws.cell(row, 1, 'Net AMPLIFY case gain, all accounts'), bold=True, size=10)
row += 1
CONC_NET = row
for label, formula, fmt, bold in [
        ('Net amplify case gain, all accounts', NET, CE, True),
        ('Accounts buying amplify brands',
         f'=COUNTIF({R_ACC["ace26"]},">0")+COUNTIFS({R_ACC["ace26"]},0,{R_ACC["ace25"]},">0")',
         NUM, False),
        ('   of those, accounts that grew', f'=COUNTIF({R_ACC["adelta"]},">0")', NUM, False),
        ('   accounts that declined', f'=COUNTIF({R_ACC["adelta"]},"<0")', NUM, False),
        ('Top 10 accounts — share of the net amplify gain',
         f'=IFERROR(SUM($H$5:$H$14)/$B${CONC_NET},"")', PCT, True),
        ('Top 25 accounts — share of the net amplify gain',
         f'=IFERROR(SUM($H$5:$H$29)/$B${CONC_NET},"")', PCT, True),
        ('Top 50 accounts — share of the net amplify gain',
         f'=IFERROR(SUM($H$5:$H$54)/$B${CONC_NET},"")', PCT, True),
        ('For contrast — net PROGRAM case change, all accounts',
         f'=SUM({R_ACC["pce26"]})-SUM({R_ACC["pce25"]})', CE, False)]:
    st(ws.cell(row, 1, label), size=10, bold=bold)
    st(ws.cell(row, 2, formula), size=10, fmt=fmt, bold=bold)
    row += 1
ws.column_dimensions['A'].width = 46
row += 1
row = band(ws, row, 'WHAT THIS MEANS')
note(ws, row, [
    'The gain is not broad execution across a route. A handful of large-format accounts — '
    "BJ's, Super Wine Warehouse, Beverage Barn, Total Wine, Sam's Club — carry most of it.",
    'Volume in those doors moves on chain decisions and warehouse display buys negotiated '
    'above the rep. A per-case incentive paid to 28 reps is not the lever that produced it, '
    'and would not reliably reproduce it.',
    'This is also why the program looked better at brand level than it does here: brand totals '
    'hide the fact that the growth came from very few doors.',
    'The last line is the reminder that the program as a whole LOST cases. Concentration is '
    'measured on amplify because that is the only segment with a gain to concentrate.',
])

# ====================================================== COUNTY
ws = wb.create_sheet('County')
head(ws, 'Did the program work anywhere in particular?',
     'Program vs non-program brands by county, Jun–Aug. The control column is the same '
     'county\'s non-incented volume.')
thead(ws, ['County', 'Program CE 2025', 'Program CE 2026', 'Program %',
           'Non-program CE 2025', 'Non-program CE 2026', 'Non-program %', 'Gap',
           'Share of program volume'],
      [16, 15, 15, 12, 16, 16, 13, 11, 15])
for i, cty in enumerate(counties):
    r = 5 + i
    st(ws.cell(r, 1, cty), size=10)
    for c, key in ((2, 'pce25'), (3, 'pce26'), (5, 'cce25'), (6, 'cce26')):
        st(ws.cell(r, c, f'=SUMIFS({R_ACC[key]},{R_ACC["county"]},$A{r})'), size=9, fmt=CE)
    st(ws.cell(r, 4, f'=IFERROR(C{r}/B{r}-1,"")'), size=9, fmt=PCT, bold=True)
    st(ws.cell(r, 7, f'=IFERROR(F{r}/E{r}-1,"")'), size=9, fmt=PCT)
    st(ws.cell(r, 8, f'=IFERROR(D{r}-G{r},"")'), size=9, fmt=PTS, bold=True)
    st(ws.cell(r, 9, f'=IFERROR(C{r}/SUM({R_ACC["pce26"]}),"")'), size=9, fmt=PCT)
LCT = 4 + len(counties)
st(ws.cell(LCT + 1, 1, 'TOTAL'), bold=True)
for c in (2, 3, 5, 6):
    st(ws.cell(LCT + 1, c, f'=SUM({gl(c)}5:{gl(c)}{LCT})'), bold=True, size=9, fmt=CE)
for c, f in ((4, f'=IFERROR(C{LCT+1}/B{LCT+1}-1,"")'), (7, f'=IFERROR(F{LCT+1}/E{LCT+1}-1,"")'),
             (8, f'=IFERROR(D{LCT+1}-G{LCT+1},"")')):
    st(ws.cell(LCT + 1, c, f), bold=True, size=9, fmt=PCT if c != 8 else PTS)
note(ws, LCT + 3, [
    'The four counties carrying essentially all the volume — Bergen, Passaic, Morris, Sussex — '
    'each trailed their own county\'s non-incented brands.',
    'Hudson, Union and Essex show big positive percentages on a base of roughly 12,000 cases '
    'between them, under 1% of the program. Read the Share column before the Gap column.',
])

SEGS = ('Qualifier', 'Amplify')
BLOCKS2 = [('CASE EQUIVALENTS', ('J', 'K', 'D', 'E'), CE),
           ('GROSS PROFIT', ('L', 'M', 'H', 'I'), USD)]

# ====================================================== ACCELERATION TEST
ws = wb.create_sheet('Acceleration Test')
head(ws, 'Test 1 — did growth accelerate once the program started?',
     'If the incentive worked, Jun–Aug growth should exceed the Jan–May rate the same brands '
     'were already running.')
thead(ws, ['', 'Jan–May 2025', 'Jan–May 2026', 'Jan–May %', 'Jun–Aug 2025', 'Jun–Aug 2026',
           'Jun–Aug %', 'Swing'], [34, 15, 15, 13, 15, 15, 13, 13])
row, acc_ref = 5, {}
for title, (p25, p26, s25, s26), fmt in BLOCKS2:
    row = band(ws, row, title, size=11)
    first = row
    for seg in SEGS:
        st(ws.cell(row, 1, f'{seg} brands'), size=10)
        S = lambda col: f'=SUMIFS({R_PB[col]},{R_PB["A"]},"{seg}")'
        st(ws.cell(row, 2, S(p25)), fmt=fmt); st(ws.cell(row, 3, S(p26)), fmt=fmt)
        st(ws.cell(row, 4, f'=IFERROR(C{row}/B{row}-1,"")'), fmt=PCT, bold=True)
        st(ws.cell(row, 5, S(s25)), fmt=fmt); st(ws.cell(row, 6, S(s26)), fmt=fmt)
        st(ws.cell(row, 7, f'=IFERROR(F{row}/E{row}-1,"")'), fmt=PCT, bold=True)
        st(ws.cell(row, 8, f'=IFERROR(G{row}-D{row},"")'), fmt=PTS, bold=True, color=RED)
        acc_ref[(title, seg)] = row
        row += 1
    st(ws.cell(row, 1, 'All program brands'), bold=True)
    for c in (2, 3, 5, 6):
        st(ws.cell(row, c, f'=SUM({gl(c)}{first}:{gl(c)}{row-1})'), bold=True, fmt=fmt)
    for c, f in ((4, f'=IFERROR(C{row}/B{row}-1,"")'), (7, f'=IFERROR(F{row}/E{row}-1,"")'),
                 (8, f'=IFERROR(G{row}-D{row},"")')):
        st(ws.cell(row, c, f), bold=True, fmt=PCT if c != 8 else PTS)
    acc_ref[(title, 'All')] = row
    row += 2
ACC = "'Acceleration Test'"
row = band(ws, row, 'HOW TO READ THIS')
note(ws, row, [
    'The Swing column is the test: Jun–Aug growth rate minus Jan–May growth rate. A positive '
    'swing is the signature of an incentive that changed behaviour.',
    'Amplify entered the summer already growing double digits and did not speed up. Qualifier '
    'volume slowed by nearly three points.',
    'Jan–May and Jun–Aug are different seasons, so each period is measured against its OWN '
    'prior year — that removes seasonality from the rates being compared. What it cannot '
    'remove is a change in the market between the two windows; the control tabs handle that.',
])

# ====================================================== COUNTERFACTUAL
ws = wb.create_sheet('Counterfactual')
head(ws, 'Test 2 — measured lift against the pre-program trajectory',
     'Applies each segment\'s Jan–May growth rate to its Jun–Aug 2025 base. The gap to what '
     'actually happened is the lift the program can claim.')
thead(ws, ['', 'Jan–May run rate', 'Jun–Aug 2025 base', 'Expected Jun–Aug', 'Actual Jun–Aug',
           'Lift vs trend'], [36, 17, 17, 17, 17, 17])
row, cf = 5, {}
for title, _cols, fmt in BLOCKS2:
    row = band(ws, row, title, size=11)
    first = row
    for seg in SEGS:
        a = acc_ref[(title, seg)]
        st(ws.cell(row, 1, f'{seg} brands'), size=10)
        st(ws.cell(row, 2, f'={ACC}!D{a}'), fmt=PCT)
        st(ws.cell(row, 3, f'={ACC}!E{a}'), fmt=fmt)
        st(ws.cell(row, 4, f'=C{row}*(1+B{row})'), fmt=fmt)
        st(ws.cell(row, 5, f'={ACC}!F{a}'), fmt=fmt)
        st(ws.cell(row, 6, f'=E{row}-D{row}'), fmt=fmt, bold=True)
        cf[(title, seg)] = row
        row += 1
    st(ws.cell(row, 1, 'TOTAL'), bold=True)
    for c in (3, 4, 5, 6):
        st(ws.cell(row, c, f'=SUM({gl(c)}{first}:{gl(c)}{row-1})'), bold=True, fmt=fmt)
    cf[title] = row
    row += 2
CFS = "'Counterfactual'"
row = band(ws, row, 'THE BOTTOM LINE')
for label, f, fmt, bold in [
        ('Gross profit lift vs pre-program trend', f'=F{cf["GROSS PROFIT"]}', USD, True),
        ('Case lift vs pre-program trend', f'=F{cf["CASE EQUIVALENTS"]}', CE, False),
        ('Amplify GP lift alone (what the per-case payout targets)',
         f'=F{cf[("GROSS PROFIT", "Amplify")]}', USD, True),
        ('Total payout', '=Assumptions!$B$7', USD, False),
        ('Net of payout', f'=F{cf["GROSS PROFIT"]}-Assumptions!$B$7', USD, True),
        ('Return per payout dollar',
         f'=IFERROR(F{cf["GROSS PROFIT"]}/Assumptions!$B$7,"")', '0.00"x"', True)]:
    st(ws.cell(row, 1, label), size=10, bold=bold)
    st(ws.cell(row, 2, f), fmt=fmt, bold=bold, size=10)
    row += 1
row += 1
note(ws, row, [
    'Read the Amplify line first: it is the segment the per-case payout actually targets, and '
    'it landed within a rounding error of the trajectory it was already on.',
    'The Qualifier GP line reads positive, but the GP Bridge and control tabs show why that is '
    'not program lift — it is a house-wide margin expansion the non-incented book captured '
    'far more of, per case.',
    'A trend extrapolation assumes the Jan–May trajectory would have continued. The control '
    'tabs test that assumption directly, and agree.',
])

# ====================================================== CONTROL BY SUPPLIER
ws = wb.create_sheet('Control by Supplier')
head(ws, 'Test 3 — incented brands vs the SAME supplier\'s non-incented brands',
     'Jun–Aug, same reps, same window, same pricing environment. The only difference between '
     'the two halves is whether a payout was attached.')
thead(ws, ['Supplier', 'Incented CE 2025', 'Incented CE 2026', 'Incented %',
           'Not incented CE 2025', 'Not incented CE 2026', 'Not incented %', 'Gap (pts)',
           'Incented GP Δ', 'Not incented GP Δ'],
      [30, 14, 14, 12, 15, 15, 13, 11, 14, 15])
for i, sup in enumerate(suppliers_both):
    r = 5 + i
    st(ws.cell(r, 1, sup), size=10)
    for c, col in ((2, 'D'), (3, 'E')):
        st(ws.cell(r, c, f'=SUMIFS({R_PB[col]},{R_PB["B"]},$A{r})'), fmt=CE, size=9)
    st(ws.cell(r, 4, f'=IFERROR(C{r}/B{r}-1,"")'), fmt=PCT, size=9, bold=True)
    for c, col in ((5, 'C'), (6, 'D')):
        st(ws.cell(r, c, f'=SUMIFS({R_CB[col]},{R_CB["A"]},$A{r})'), fmt=CE, size=9)
    st(ws.cell(r, 7, f'=IFERROR(F{r}/E{r}-1,"")'), fmt=PCT, size=9, bold=True)
    st(ws.cell(r, 8, f'=IFERROR(D{r}-G{r},"")'), fmt=PTS, size=9, bold=True)
    st(ws.cell(r, 9, f'=SUMIFS({R_PB["I"]},{R_PB["B"]},$A{r})-SUMIFS({R_PB["H"]},{R_PB["B"]},$A{r})'),
       fmt=USD, size=9)
    st(ws.cell(r, 10, f'=SUMIFS({R_CB["H"]},{R_CB["A"]},$A{r})-SUMIFS({R_CB["G"]},{R_CB["A"]},$A{r})'),
       fmt=USD, size=9)
LR = 4 + len(suppliers_both)
CTL_TOT = LR + 1
st(ws.cell(CTL_TOT, 1, 'WEIGHTED TOTAL'), bold=True)
for c in (2, 3, 5, 6, 9, 10):
    st(ws.cell(CTL_TOT, c, f'=SUM({gl(c)}5:{gl(c)}{LR})'), bold=True,
       fmt=CE if c in (2, 3, 5, 6) else USD)
for c, f in ((4, f'=IFERROR(C{CTL_TOT}/B{CTL_TOT}-1,"")'),
             (7, f'=IFERROR(F{CTL_TOT}/E{CTL_TOT}-1,"")'),
             (8, f'=IFERROR(D{CTL_TOT}-G{CTL_TOT},"")')):
    st(ws.cell(CTL_TOT, c, f), bold=True, fmt=PCT if c != 8 else PTS,
       color=RED if c == 8 else None)
CTLS = "'Control by Supplier'"
note(ws, CTL_TOT + 2, [
    'Only suppliers appearing on both sides are shown — those are the ones where a true '
    'within-supplier comparison exists.',
    'A negative gap means that supplier\'s incented brands did worse than its own non-incented '
    'brands over the same three months.',
    'Boston Beer is the finding worth presenting — see the Brand Selection tab.',
])

# ====================================================== GP BRIDGE
ws = wb.create_sheet('GP Bridge')
head(ws, 'Where the gross profit change actually came from',
     'ΔGP split three ways: cases sold (Volume), which brands sold (Mix), and gross profit per '
     'case within a brand (Rate). Volume is the only one an incentive plausibly drives.')
for c, w in zip('ABC', (44, 20, 24)):
    ws.column_dimensions[c].width = w
thead(ws, ['', 'Program brands', 'Non-program brands (control)'], [44, 20, 24])
row, br = 5, {}
for label, pf, cfm in [
        ('Cases 2025', f'=SUM({R_PB["D"]})', f'=SUM({R_CB["C"]})'),
        ('Cases 2026', f'=SUM({R_PB["E"]})', f'=SUM({R_CB["D"]})'),
        ('Gross profit 2025', f'=SUM({R_PB["H"]})', f'=SUM({R_CB["G"]})'),
        ('Gross profit 2026', f'=SUM({R_PB["I"]})', f'=SUM({R_CB["H"]})')]:
    st(ws.cell(row, 1, label), size=10)
    fmt = CE if 'Cases' in label else USD
    st(ws.cell(row, 2, pf), fmt=fmt); st(ws.cell(row, 3, cfm), fmt=fmt)
    br[label] = row
    row += 1
st(ws.cell(row, 1, 'Actual ΔGP'), bold=True)
st(ws.cell(row, 2, f'=B{br["Gross profit 2026"]}-B{br["Gross profit 2025"]}'), bold=True, fmt=USD)
st(ws.cell(row, 3, f'=C{br["Gross profit 2026"]}-C{br["Gross profit 2025"]}'), bold=True, fmt=USD)
row += 2
row = band(ws, row, 'DECOMPOSED', size=11)
c25, c26, g25r = br['Cases 2025'], br['Cases 2026'], br['Gross profit 2025']
comp = {}
for label, pf, cfm in [
        ("Volume — cases, at last year's GP/CE",
         f'=(B{c26}-B{c25})*(B{g25r}/B{c25})', f'=(C{c26}-C{c25})*(C{g25r}/C{c25})'),
        ('Mix — which brands sold',
         f'=SUM({R_PB["R"]})-B{c26}*(B{g25r}/B{c25})',
         f'=SUM({R_CB["K"]})-C{c26}*(C{g25r}/C{c25})'),
        ('Rate — GP per case within a brand', f'=SUM({R_PB["S"]})', f'=SUM({R_CB["L"]})')]:
    st(ws.cell(row, 1, label), size=10)
    st(ws.cell(row, 2, pf), fmt=USD); st(ws.cell(row, 3, cfm), fmt=USD)
    comp[label] = row
    row += 1
st(ws.cell(row, 1, 'Sum (ties to Actual ΔGP)'), bold=True, italic=True, size=9)
for c in (2, 3):
    st(ws.cell(row, c, f'=SUM({gl(c)}{row-3}:{gl(c)}{row-1})'), bold=True, fmt=USD, size=9)
row += 2
row = band(ws, row, 'RATE EFFECT PER 2026 CASE', size=11)
rate_row = comp['Rate — GP per case within a brand']
st(ws.cell(row, 1, 'Rate effect per case'), bold=True, size=10)
st(ws.cell(row, 2, f'=IFERROR(B{rate_row}/B{c26},"")'), bold=True, fmt=USD2)
st(ws.cell(row, 3, f'=IFERROR(C{rate_row}/C{c26},"")'), bold=True, fmt=USD2)
PER_CASE = row
row += 1
st(ws.cell(row, 1, 'Control advantage per case'), size=10)
st(ws.cell(row, 2, f'=C{PER_CASE}-B{PER_CASE}'), fmt=USD2, bold=True, color=RED)
row += 2
note(ws, row, [
    'The margin gain was real but house-wide. Per case, the non-incented book captured several '
    'times the rate improvement the incented book did, so the program cannot claim it.',
    'Volume is the line an incentive is supposed to move, and on the program brands it is the '
    'negative one.',
    'Control mix is large because the non-program book shifted toward higher-margin brands '
    '(Sun Cruiser, Sierra Nevada) while low-margin Pabst declined.',
])
GPB = "'GP Bridge'"

# ====================================================== BRAND SELECTION
ws = wb.create_sheet('Brand Selection')
head(ws, 'The variable that decided the outcome — which brands got incented',
     'Every brand of every supplier appearing on both sides, Jun–Aug. INCENTED rows carried a '
     'payout; NOT INCENTED rows did not.')
thead(ws, ['Supplier', 'Incented?', 'Brand Family', 'CE 2025', 'CE 2026', 'Δ cases', 'Cases %',
           'GP 2025', 'GP 2026', 'Δ GP', 'PODs 2026'],
      [28, 13, 26, 12, 12, 12, 11, 13, 13, 13, 11])
prog_by_sup, ctrl_by_sup = collections.defaultdict(list), collections.defaultdict(list)
for seg, sup, brand in prog_keys:
    prog_by_sup[sup].append(brand)
for sup, brand in ctrl_keys:
    if sup in suppliers_both:
        ctrl_by_sup[sup].append(brand)


def supgap(s):
    a = sum(b_sea[k]['ce25'] for k in prog_keys if k[1] == s)
    b = sum(b_sea[k]['ce26'] for k in prog_keys if k[1] == s)
    c = sum(b_ctl[k]['ce25'] for k in ctrl_keys if k[0] == s)
    d = sum(b_ctl[k]['ce26'] for k in ctrl_keys if k[0] == s)
    return (b / a - 1 if a else 0) - (d / c - 1 if c else 0)


r = 5
for sup in sorted(suppliers_both, key=supgap):
    start = r
    for inc, brands in ((True, sorted(prog_by_sup[sup])), (False, sorted(ctrl_by_sup[sup]))):
        R = R_PB if inc else R_CB
        keys = ('D', 'E', 'H', 'I') if inc else ('C', 'D', 'G', 'H')
        for b in brands:
            st(ws.cell(r, 1, sup), size=9, color=None if inc else GREY)
            st(ws.cell(r, 2, 'INCENTED' if inc else 'not incented'), size=9, bold=inc,
               color=NAVY if inc else GREY)
            st(ws.cell(r, 3, b), size=9)
            crit = (f',{R["B"]},$A{r},{R["C"]},$C{r})' if inc
                    else f',{R["A"]},$A{r},{R["B"]},$C{r})')
            for c, col, fmt in ((4, keys[0], CE), (5, keys[1], CE),
                                (8, keys[2], USD), (9, keys[3], USD)):
                st(ws.cell(r, c, f'=SUMIFS({R[col]}{crit}'), size=9, fmt=fmt)
            st(ws.cell(r, 6, f'=E{r}-D{r}'), size=9, fmt=CE, bold=True)
            st(ws.cell(r, 7, f'=IFERROR(E{r}/D{r}-1,"")'), size=9, fmt=PCT)
            st(ws.cell(r, 10, f'=I{r}-H{r}'), size=9, fmt=USD, bold=True)
            pod = (f'=SUMIFS({R_SEA["p26"]},{R_SEA["sup"]},$A{r},{R_SEA["brand"]},$C{r})' if inc
                   else f'=SUMIFS({R_CTL["p26"]},{R_CTL["sup"]},$A{r},{R_CTL["brand"]},$C{r})')
            st(ws.cell(r, 11, pod), size=9, fmt=NUM)
            r += 1
    st(ws.cell(r, 3, f'{sup} — total'), bold=True, size=9)
    for c in (4, 5, 6, 8, 9, 10, 11):
        st(ws.cell(r, c, f'=SUM({gl(c)}{start}:{gl(c)}{r-1})'), bold=True, size=9,
           fmt=CE if c in (4, 5, 6) else NUM if c == 11 else USD)
    r += 2
ws.auto_filter.ref = f'A4:K{r-2}'
note(ws, r, [
    'Boston Beer is the case to present. The program pointed reps at Twisted Tea and Truly — '
    'both in decline — while Sun Cruiser, carrying no incentive, grew by more cases than the '
    'incented brands lost.',
    'Mark Anthony is the mirror image and the program\'s one clear win: incented brands held '
    'while the same supplier\'s non-incented brands fell more than twenty points further.',
    'Filter column B to compare the two halves of any supplier.',
])

# ====================================================== GOAL DESIGN
q25_by = collections.Counter()
for rr in season:
    if rr['seg'] == 'Qualifier':
        q25_by[(rr['rep'], rr['sup'])] += rr['ce25']
goal_rows = sorted((rp, sp, g) for (rp, sp), g in goals.items() if g > 0)

ws = wb.create_sheet('Goal Design')
head(ws, 'Were the goals ever hard? — qualifier goal vs the rep\'s own prior-year volume',
     'A goal set below last year\'s actual pays for maintenance. Goal is typed from goals.csv; '
     'both actuals are live SUMIFS off Data - Season.')
thead(ws, ['Rep', 'Manager', 'Supplier', '2026 qualifier goal', 'Rep\'s own 2025 CE',
           'Goal vs 2025', 'Goal below 2025?', '2026 actual CE', '% to goal', 'Cleared?',
           '2026 vs 2025', 'At or below LY?', 'Within 1% of LY?'],
      [20, 16, 30, 15, 14, 12, 15, 13, 10, 10, 12, 13, 15])
for i, (rp, sp, g) in enumerate(goal_rows):
    r = 5 + i
    st(ws.cell(r, 1, rp), size=9)
    st(ws.cell(r, 2, pay_reps.get(rp, {}).get('manager', ''), ), size=9, color=GREY)
    st(ws.cell(r, 3, sp), size=9)
    st(ws.cell(r, 4, g), size=9, color=BLUE, fmt=CE)
    Q = lambda k: (f'=SUMIFS({R_SEA[k]},{R_SEA["rep"]},$A{r},{R_SEA["sup"]},$C{r},'
                   f'{R_SEA["seg"]},"Qualifier")')
    st(ws.cell(r, 5, Q('ce25')), size=9, fmt=CE)
    st(ws.cell(r, 6, f'=IFERROR($D{r}/$E{r}-1,"")'), size=9, fmt=PCT)
    st(ws.cell(r, 7, f'=IF($D{r}<$E{r},"YES — below LY","no")'), size=9,
       color=RED if g < q25_by[(rp, sp)] else None)
    st(ws.cell(r, 8, Q('ce26')), size=9, fmt=CE)
    st(ws.cell(r, 9, f'=IFERROR($H{r}/$D{r},"")'), size=9, fmt=PCT)
    st(ws.cell(r, 10, f'=IF($H{r}>=$D{r},"cleared","missed")'), size=9)
    st(ws.cell(r, 11, f'=IFERROR($H{r}/$E{r}-1,"")'), size=9, fmt=PCT)
    st(ws.cell(r, 12, f'=IF($D{r}<=$E{r},"at or below","above")'), size=9, color=GREY)
    st(ws.cell(r, 13, f'=IF(AND($E{r}>0,ABS($D{r}/$E{r}-1)<=0.01),"within 1%","")'),
       size=9, color=GREY)
LG = 4 + len(goal_rows)
ws.auto_filter.ref = f'A4:M{LG}'
st(ws.cell(LG + 1, 1, 'TOTAL'), bold=True)
for c in (4, 5, 8):
    st(ws.cell(LG + 1, c, f'=SUM({gl(c)}5:{gl(c)}{LG})'), bold=True, size=9, fmt=CE)
for c, f in ((6, f'=IFERROR(D{LG+1}/E{LG+1}-1,"")'), (11, f'=IFERROR(H{LG+1}/E{LG+1}-1,"")')):
    st(ws.cell(LG + 1, c, f), bold=True, size=9, fmt=PCT)
row = band(ws, LG + 3, 'HOW THE GOALS WERE SET')
GD = "'Goal Design'"
GD_SUMMARY = row
for label, f, fmt, bold in [
        ('Qualifier goals with a prior-year comparison', f'=COUNT($D$5:$D${LG})', NUM, False),
        ('   set BELOW the rep\'s own 2025 volume', f'=COUNTIF($G$5:$G${LG},"YES*")', NUM, True),
        ('   set AT or below it', f'=COUNTIF($L$5:$L${LG},"at or below")', NUM, True),
        ('   set within 1% of it — effectively last year\'s number',
         f'=COUNTIF($M$5:$M${LG},"within 1%")', NUM, True),
        ('   share of all qualifier goals',
         f'=IFERROR(COUNTIF($G$5:$G${LG},"YES*")/COUNT($D$5:$D${LG}),"")', PCT, True),
        ('Aggregate goal vs the same reps\' 2025 volume', f'=F{LG+1}', PCT, True),
        ('Sub-2025 goals that were CLEARED and paid',
         f'=COUNTIFS($G$5:$G${LG},"YES*",$J$5:$J${LG},"cleared")', NUM, False),
        ('   their 2026 volume vs their own 2025',
         f'=IFERROR(SUMIFS($H$5:$H${LG},$G$5:$G${LG},"YES*",$J$5:$J${LG},"cleared")/'
         f'SUMIFS($E$5:$E${LG},$G$5:$G${LG},"YES*",$J$5:$J${LG},"cleared")-1,"")', PCT, True)]:
    st(ws.cell(row, 1, label), size=10, bold=bold)
    st(ws.cell(row, 2, f), size=10, bold=bold, fmt=fmt)
    row += 1
ws.column_dimensions['A'].width = 44
note(ws, row + 1, [
    'The qualifier half of this program was designed to pay for decline: in aggregate the '
    'goals asked for less volume than the same reps delivered in 2025, and nine in ten '
    'individual goals sat below that rep\'s own prior-year number.',
    'A sizeable block was not merely below last year but AT it — set within 1% of the rep\'s '
    'own 2025 figure, and in fifteen cases within two cases of it. Those goals were prior-year '
    'volume restated as a target.',
    'The sub-2025 goals that cleared delivered volume flat to last year — and earned tier '
    'payouts for it. That is a goal-setting outcome, not a rep-performance one.',
    'This is the cheapest thing to fix for 2027, and it is independent of brand selection: a '
    'goal below last year cannot produce incremental volume no matter which brand carries it.',
])

# ====================================================== PAYOUT vs PERFORMANCE
ws = wb.create_sheet('Payout vs Performance')
head(ws, 'Did the reps who earned the most actually deliver the most?',
     'Payout columns are the vF recap. Volume and POD columns are live off Data - Accounts and '
     'Data - Season. "Their own control" is that rep\'s non-incented volume.')
thead(ws, ['Rep', 'Manager', 'Tier payout', 'Amplify payout', 'Total payout',
           'Program CE 2025', 'Program CE 2026', 'Program %',
           'Their own control %', 'Gap vs own control', 'PODs 2025', 'PODs 2026', 'POD %'],
      [20, 16, 12, 13, 12, 14, 14, 11, 14, 13, 11, 11, 10])
order = sorted(reps, key=lambda x: -pay_reps.get(x, {}).get('total', 0))
for i, rp in enumerate(order):
    r = 5 + i
    p = pay_reps.get(rp, {})
    st(ws.cell(r, 1, rp), size=9)
    st(ws.cell(r, 2, p.get('manager', ''), ), size=9, color=GREY)
    st(ws.cell(r, 3, p.get('tier', 0)), size=9, color=BLUE, fmt=USD)
    st(ws.cell(r, 4, p.get('amp', 0)), size=9, color=BLUE, fmt=USD)
    st(ws.cell(r, 5, f'=C{r}+D{r}'), size=9, fmt=USD, bold=True)
    for c, key in ((6, 'pce25'), (7, 'pce26')):
        st(ws.cell(r, c, f'=SUMIFS({R_ACC[key]},{R_ACC["rep"]},$A{r})'), size=9, fmt=CE)
    st(ws.cell(r, 8, f'=IFERROR(G{r}/F{r}-1,"")'), size=9, fmt=PCT, bold=True)
    st(ws.cell(r, 9, f'=IFERROR(SUMIFS({R_ACC["cce26"]},{R_ACC["rep"]},$A{r})/'
                     f'SUMIFS({R_ACC["cce25"]},{R_ACC["rep"]},$A{r})-1,"")'), size=9, fmt=PCT)
    st(ws.cell(r, 10, f'=IFERROR(H{r}-I{r},"")'), size=9, fmt=PTS, bold=True)
    st(ws.cell(r, 11, rep_pods[rp]['p25']), size=9, color=BLUE, fmt=NUM)
    st(ws.cell(r, 12, rep_pods[rp]['p26']), size=9, color=BLUE, fmt=NUM)
    st(ws.cell(r, 13, f'=IFERROR(L{r}/K{r}-1,"")'), size=9, fmt=PCT)
LPP = 4 + len(order)
ws.auto_filter.ref = f'A4:M{LPP}'
st(ws.cell(LPP + 1, 1, 'TOTAL'), bold=True)
for c in (3, 4, 5, 6, 7, 11, 12):
    st(ws.cell(LPP + 1, c, f'=SUM({gl(c)}5:{gl(c)}{LPP})'), bold=True, size=9,
       fmt=USD if c < 6 else CE if c < 8 else NUM)
st(ws.cell(LPP + 1, 8, f'=IFERROR(G{LPP+1}/F{LPP+1}-1,"")'), bold=True, size=9, fmt=PCT)
row = band(ws, LPP + 3, 'DOES PAYOUT TRACK PERFORMANCE?')
PP = "'Payout vs Performance'"
PP_CORR = row
for label, f in [
        ('Correlation: payout earned vs program volume growth',
         f'=IFERROR(CORREL($E$5:$E${LPP},$H$5:$H${LPP}),"")'),
        ('Correlation: payout earned vs gap over that rep\'s own control',
         f'=IFERROR(CORREL($E$5:$E${LPP},$J$5:$J${LPP}),"")')]:
    st(ws.cell(row, 1, label), size=10, bold=True)
    st(ws.cell(row, 2, f), size=11, bold=True, fmt='0.00', color=RED)
    row += 1
ws.column_dimensions['A'].width = 48
note(ws, row + 1, [
    'Both correlations sit at roughly zero. The reps who earned the most were not the reps who '
    'grew the most, and were not the reps who beat their own non-incented book.',
    'That is what you would expect when payout is driven by how each rep\'s goal was set '
    'rather than by what they delivered — see the Goal Design tab.',
    'It is not a criticism of the sales team. It says the program did not reward the behaviour '
    'it was meant to reward.',
])

# ====================================================== DATA - CHANNEL
# Channel x segment x period aggregates. Small enough to carry as values; the Channel tab
# is all formulas off this block.
chan_rows = []
for ch in channels:
    for label, recs, seg in (('Jun–Aug', season, 'Qualifier'), ('Jun–Aug', season, 'Amplify'),
                             ('Jan–May', pre, 'Qualifier'), ('Jan–May', pre, 'Amplify'),
                             ('Jun–Aug', ctrl, 'Control')):
        agg = collections.Counter()
        for rr in recs:
            if rr['seg'] != seg or premise_of(rr['acct'], PREM) != ch:
                continue
            for k in MONEY_COLS:
                agg[k] += rr[k]
        chan_rows.append((ch, label, seg, agg))

ws = wb.create_sheet('Data - Channel')
head(ws, 'Source data — channel',
     'Channel × segment × period. Channel joined from territory-accounts/ on customer number.'
     '   ·   Source: all three RDE exports + this repo\'s territory rosters')
thead(ws, ['Channel', 'Period', 'Segment', 'CE 2025', 'CE 2026', 'Revenue 2025',
           'Revenue 2026', 'GP 2025', 'GP 2026'],
      [14, 12, 12, 13, 13, 14, 14, 13, 13])
for i, (ch, per, seg, agg) in enumerate(chan_rows):
    r = 5 + i
    for c, v in ((1, ch), (2, per), (3, seg)):
        st(ws.cell(r, c, v), size=9, color=BLUE)
    for c, k, fmt in zip(range(4, 10), MONEY_COLS, (CE, CE, USD, USD, USD, USD)):
        st(ws.cell(r, c, agg[k]), size=9, color=BLUE, fmt=fmt)
LCH = 4 + len(chan_rows)
ws.auto_filter.ref = f'A4:I{LCH}'
CH = "'Data - Channel'"
C_CH = colmap(['channel', 'period', 'seg'] + MONEY_COLS)
R_CH = {n: f'{CH}!${c}$5:${c}${LCH}' for n, c in C_CH.items()}
note(ws, LCH + 2, [
    'Unmatched = accounts on neither territory roster, about 2% of volume. Shown rather than '
    'dropped so the channel rows still add to the program total.'])

# ====================================================== CHANNEL
ws = wb.create_sheet('Channel')
head(ws, 'On-premise vs off-premise — the one place the program shows a pulse',
     'Same acceleration test as Test 1, cut by channel, with each channel\'s own non-incented '
     'brands as the control.')
thead(ws, ['Channel', 'Segment', 'Jan–May %', 'Jun–Aug %', 'Swing', 'Jun–Aug CE 2026',
           'Share of program volume', 'Control % (same channel)', 'Gap vs control'],
      [14, 13, 12, 12, 12, 15, 15, 17, 13])
row = 5
SC = lambda k, ch, per, seg: (f'=SUMIFS({R_CH[k]},{R_CH["channel"]},"{ch}",'
                              f'{R_CH["period"]},"{per}",{R_CH["seg"]},"{seg}")')
chan_ref = {}
for ch in channels:
    for seg in SEGS:
        st(ws.cell(row, 1, ch), size=10)
        st(ws.cell(row, 2, seg), size=10)
        st(ws.cell(row, 3, f'=IFERROR({SC("ce26", ch, "Jan–May", seg)[1:]}/'
                           f'{SC("ce25", ch, "Jan–May", seg)[1:]}-1,"")'), size=10, fmt=PCT)
        st(ws.cell(row, 4, f'=IFERROR({SC("ce26", ch, "Jun–Aug", seg)[1:]}/'
                           f'{SC("ce25", ch, "Jun–Aug", seg)[1:]}-1,"")'), size=10, fmt=PCT)
        st(ws.cell(row, 5, f'=IFERROR(D{row}-C{row},"")'), size=10, fmt=PTS, bold=True,
           color=GREEN if ch == 'On-premise' else None)
        st(ws.cell(row, 6, SC('ce26', ch, 'Jun–Aug', seg)), size=10, fmt=CE)
        st(ws.cell(row, 7, f'=IFERROR(F{row}/SUM({R_ACC["pce26"]}),"")'), size=10, fmt=PCT)
        st(ws.cell(row, 8, f'=IFERROR({SC("ce26", ch, "Jun–Aug", "Control")[1:]}/'
                           f'{SC("ce25", ch, "Jun–Aug", "Control")[1:]}-1,"")'), size=10, fmt=PCT)
        st(ws.cell(row, 9, f'=IFERROR(D{row}-H{row},"")'), size=10, fmt=PTS)
        chan_ref[(ch, seg)] = row
        row += 1
row += 1
row = band(ws, row, 'THE ONE CONSTRUCTIVE FINDING IN THIS WORKBOOK', color=GREEN)
row = note(ws, row, [
    'On-premise is the only cut where the program accelerated. Amplify went from +13.7% '
    'pre-program to +18.4% during it, and Qualifier from -3.6% to -0.1% — the only positive '
    'swings anywhere in this analysis.',
    'Read it with two caveats. On-premise is about 11% of program volume, so it cannot rescue '
    'the total. And even there the incented brands still trailed that channel\'s non-incented '
    'brands, so the acceleration is real but the lead is not.',
    'Off-premise, which is 87% of the volume and where the concentrated large-format gains '
    'sit, decelerated in both segments.',
    'This is the part worth testing deliberately in 2027: a smaller, on-premise-weighted '
    'program is the one version of this incentive the data gives any reason to believe in.',
])

# ====================================================== ASSUMPTIONS
ws = wb.create_sheet('Assumptions')
head(ws, 'Assumptions, constants and open items',
     'Blue = typed in. Every other tab is formulas off these cells and the Data tabs.')
for c, w in zip('ABCDE', (48, 18, 46, 16, 16)):
    ws.column_dimensions[c].width = w
row = band(ws, 4, 'PROGRAM COST', size=11)
for label, f, src in [
        ('Tier payouts earned', f'={PP}!C{LPP+1}', 'Summer_of_Success_Recap_vF.xlsx → Rep Totals'),
        ('Amplify payouts earned', f'={PP}!D{LPP+1}', 'Summer_of_Success_Recap_vF.xlsx → Rep Totals')]:
    st(ws.cell(row, 1, label), size=10)
    st(ws.cell(row, 2, f), fmt=USD)
    st(ws.cell(row, 3, src), size=8, color=GREY)
    row += 1
st(ws.cell(row, 1, 'Total payout'), bold=True)
st(ws.cell(row, 2, f'=SUM(B{row-2}:B{row-1})'), bold=True, fmt=USD)
PAY_TOTAL = row
row += 1
st(ws.cell(row, 1, 'Reps earning > $0  /  reps in the program'), size=10)
st(ws.cell(row, 2, f'=COUNTIF({PP}!$E$5:$E${LPP},">0")&" of "&{len(order)}'), size=10)
row += 2

row = band(ws, row, 'PERIODS AND DATA', size=11)
for a, b in [('Pre-program baseline', 'Jan 1 – May 31, 2026 vs 2025'),
             ('Program period', 'Jun 1 – Aug 31, 2026 vs 2025'),
             ('Control', 'Jun 1 – Aug 31, brands NOT in Summer of Success'),
             ('Grain of the source exports', 'rep × supplier × brand × ACCOUNT × county'),
             ('Accounts / counties in the program', f'{len({r["acct"] for r in season}):,} / '
                                                    f'{len(counties)}'),
             ('Payout model', 'Summer_of_Success_Recap_vF.xlsx (final)')]:
    st(ws.cell(row, 1, a), size=10)
    st(ws.cell(row, 2, b), size=10, color=BLUE)
    row += 1
row += 1

row = band(ws, row, 'PAYOUT MODEL RULES (from the vF recap)', size=11)
row = note(ws, row, [
    'Qualifier — a rep clears a supplier at 100% of their own personal goal; the tier is then '
    'read off the route-volume grid. Tier payouts: T1 $750 · T2 $500 · T3 $250.',
    'Amplify — pays only on cases ABOVE each brand\'s goal, per brand, at $1/case ($2 for '
    'Fever Tree, Mike\'s Harder, MXD). 90%–99.99% of the qualifier goal earns half rate and no '
    'tier; below 90% earns nothing.',
    'Excluded to match the dashboard and the recap: Default, Office Tell Sell, Chris Politano.',
])
row += 1

row = band(ws, row, '⚠ OPEN ITEMS — these move the cost side, not the lift finding',
           size=11, color=RED)
note(ws, row, [
    'a) FUNDING — no Summer of Success line appears in supplier-budget/expenses.csv. If the '
    'suppliers billback the payout, Kohler\'s cost is near zero and the finding becomes '
    'opportunity cost rather than spend. This is the one open item worth resolving before the '
    'meeting.',
    'b) TIER BASIS — the deck writes thresholds as "+25,000 CE\'s". If "+" means GROWTH over '
    '2025 rather than total 2026 CE, almost no one clears Tier 1 and the tier line largely '
    'disappears.',
    'c) PER REP vs HOUSE — summer26/README.txt describes the same grid as a company-wide '
    'aggregate; the recap applies it per rep, as instructed.',
    'd) The control set is "brands not in SoS," so it contains non-incented brands from the '
    'SAME suppliers and the SAME accounts. That is what makes the within-supplier and '
    'within-account tests possible.',
    'e) STILL MISSING — a Jan–May pull of the control set (completes a formal '
    'difference-in-differences) and September actuals (tests for pull-forward).',
    'f) The account-level exports total about 0.02% more cases than the brand-level exports '
    'for the same window — rounding in RDE\'s aggregation. It moves nothing in this analysis.',
])

# ====================================================== SUMMARY
ws = wb.create_sheet('Summary')
st(ws.cell(1, 1, 'Summer of Success 2026 — did it work?'), bold=True, size=18, color=NAVY)
st(ws.cell(2, 1, f'Jun 1 – Aug 31, 2026 vs 2025 · {len(order)} reps · '
                 f'{len(suppliers_both) + 2} suppliers · {len({r["acct"] for r in season}):,} '
                 f'accounts · built {datetime.date.today():%m/%d/%Y}'), size=9, color=GREY)
for c, w in zip('ABCDEFG', (56, 16, 16, 16, 14, 14, 14)):
    ws.column_dimensions[c].width = w

row = 4
row = band(ws, row, 'THE VERDICT', size=13)
st(ws.cell(row, 1, 'The incentive did not generate measurable incremental volume or gross '
                   'profit. It paid for a trend that was already running.'),
   bold=True, size=11, color=RED, wrap=True)
ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
ws.row_dimensions[row].height = 20
row += 2

row = band(ws, row, 'THE TESTS')
thead(ws, ['Test', 'Result', 'What it means', '', '', '', ''],
      [56, 16, 16, 16, 14, 14, 14], row=row)
row += 1
tests = [
    ('1. Did AMPLIFY growth accelerate when the program started?',
     f"={ACC}!H{acc_ref[('CASE EQUIVALENTS', 'Amplify')]}", PTS,
     'No. Already +12% before a dollar was offered.'),
    ('1b. Did QUALIFIER volume accelerate?',
     f"={ACC}!H{acc_ref[('CASE EQUIVALENTS', 'Qualifier')]}", PTS,
     'No — it slowed by nearly three points.'),
    ('2. Amplify GP lift vs its own pre-program trajectory',
     f"={CFS}!F{cf[('GROSS PROFIT', 'Amplify')]}", USD,
     'Zero, against the amplify payout.'),
    ('3. Incented vs the same SUPPLIERS\' non-incented brands',
     f"={CTLS}!H{CTL_TOT}", PTS,
     'The incented book lost to the book with no incentive.'),
    ('4. Incented vs non-incented brands in the SAME ACCOUNTS',
     f"='Within-Account Control'!D{WAC_GAP}", PTS,
     'Same stores, same summer: still no incentive effect.'),
    ('5. Did the program build DISTRIBUTION?',
     f"={DIST}!D{dist_ref[('JUN–AUG', 'Amplify brands')]}", PCT,
     'Amplify PODs +4.2% — but +5.5% before the program.'),
    ('6. Were the qualifier goals set above last year?',
     f"={GD}!$B${GD_SUMMARY + 2}", PCT,
     'No — 9 in 10 sat BELOW the rep\'s own 2025.'),
    ('7. Did payout track performance?',
     f"={PP}!$B${PP_CORR}", '0.00',
     'r ≈ 0. Payout did not follow delivery.'),
]
for label, f, fmt, meaning in tests:
    st(ws.cell(row, 1, label), size=10, wrap=True)
    st(ws.cell(row, 2, f), bold=True, size=11, fmt=fmt, color=RED, align='center')
    st(ws.cell(row, 3, meaning), size=9, color=GREY, wrap=True)
    ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=7)
    ws.row_dimensions[row].height = 26
    row += 1
row += 1

row = band(ws, row, 'THE NUMBERS')
for label, f, fmt, bold in [
        ('Program cases, Jun–Aug', f"={ACC}!F{acc_ref[('CASE EQUIVALENTS', 'All')]}", CE, False),
        ('   vs 2025', f"={ACC}!G{acc_ref[('CASE EQUIVALENTS', 'All')]}", PCT, False),
        ('Program gross profit, Jun–Aug', f"={ACC}!F{acc_ref[('GROSS PROFIT', 'All')]}", USD, False),
        ('   vs 2025', f"={ACC}!G{acc_ref[('GROSS PROFIT', 'All')]}", PCT, False),
        ('Gross profit lift vs pre-program trend', f'={CFS}!F{cf["GROSS PROFIT"]}', USD, True),
        ('Total payout', f'=Assumptions!$B${PAY_TOTAL}', USD, True),
        ('Net of payout', f'={CFS}!F{cf["GROSS PROFIT"]}-Assumptions!$B${PAY_TOTAL}', USD, True)]:
    st(ws.cell(row, 1, label), size=10, bold=bold)
    st(ws.cell(row, 2, f), size=10, bold=bold, fmt=fmt)
    row += 1
row += 1

row = band(ws, row, 'WHAT THE PROGRAM CAN HONESTLY CLAIM', color=GREEN)
row = note(ws, row, [
    'Mark Anthony held. Incented White Claw and Cayman Jack fell 5.9% while the same '
    'supplier\'s non-incented brands fell 22.2% — the clearest evidence anywhere here that the '
    'incentive changed a rep\'s behaviour.',
    'No volume was bought with discount. Revenue per case held on every growing amplify brand.',
    'Distribution did not erode. Qualifier PODs fell only 1.2%, matching the control — reps '
    'held their accounts. What fell was rate of sale, which is a market result, not an effort '
    'one. That is the fair thing to say about the sales team.',
    'Engagement was near-universal: 27 of 28 reps earned something.',
])
row += 1
row = band(ws, row, 'AND ONE PLACE IT ACTUALLY WORKED', color=GREEN)
st(ws.cell(row, 1, 'On-premise — Amplify swing vs its own pre-program rate'), size=10, bold=True)
st(ws.cell(row, 2, f"='Channel'!E{chan_ref[('On-premise', 'Amplify')]}"), size=10, bold=True,
   fmt=PTS, color=GREEN)
row += 1
st(ws.cell(row, 1, 'On-premise — Qualifier swing'), size=10)
st(ws.cell(row, 2, f"='Channel'!E{chan_ref[('On-premise', 'Qualifier')]}"), size=10, fmt=PTS,
   color=GREEN)
row += 1
row = note(ws, row, [
    'On-premise is the only cut in this workbook where the program accelerated — the only '
    'positive swings anywhere. It is about 11% of program volume, and even there the incented '
    'brands still trailed that channel\'s non-incented brands.',
    'It is the one version of this incentive the data gives any reason to run again: smaller, '
    'and weighted on-premise. See the Channel tab.',
])
row += 1

row = band(ws, row, 'THE TWO FINDINGS THAT MATTER FOR 2027')
row = note(ws, row, [
    '1. BRAND SELECTION decided the outcome. Boston Beer: the program paid reps to push '
    'Twisted Tea (-7,585 cases) and Truly (-3,111), both in structural decline, while Sun '
    'Cruiser — no incentive — grew 13,728 cases and $237,182 of GP with the same reps in the '
    'same summer.',
    '2. GOAL DESIGN guaranteed payout regardless. 126 of 137 qualifier goals were set below '
    'that rep\'s own 2025 volume; the aggregate goal asked for 2.5% LESS than last year.',
    'Together they explain the zero correlation between payout and performance: the program '
    'paid for goals that were already met, on brands that were already moving — or already '
    'falling.',
    'Recommendation: screen candidate brands on their own trailing trajectory before attaching '
    'a dollar, and set qualifier goals above prior-year actual. A brand already growing does '
    'not need the money; a brand in structural decline will not be saved by it.',
])
row += 1

row = band(ws, row, 'AND ONE THING TO WATCH', color=RED)
row = note(ws, row, [
    'The amplify gain is concentrated: the top 10 accounts produced 37% of it and the top 100 '
    'produced 90%, out of 1,847 accounts buying those brands. Most of it sits in BJ\'s, Super '
    'Wine Warehouse, Beverage Barn, Total Wine and Sam\'s Club.',
    'Volume in those doors moves on chain decisions and warehouse display buys negotiated '
    'above the rep. A per-case incentive paid to 28 reps is not the lever that produced it.',
])
row += 1

row = band(ws, row, 'WHAT THIS CANNOT TELL YOU', color=RED)
row = note(ws, row, [
    'Whether the payout is Kohler\'s cost or supplier billback — nothing in the expense tracker '
    'names this program.',
    'A formal difference-in-differences: three of the four cells are here; a Jan–May pull of '
    'the control set completes it.',
    'Whether September gave any of it back.',
])
row += 2
row = band(ws, row, 'TAB GUIDE', size=11)
note(ws, row, [
    'Assumptions — cost, periods, open items.   Acceleration Test · Counterfactual · Control by '
    'Supplier · Within-Account Control — the four controls, weakest to strongest.',
    'Distribution — PODs, new/lost placements, distribution vs rate of sale.   Account '
    'Concentration — how few doors produced the gain.   County — geography.',
    'GP Bridge — where the gross profit change came from.   Brand Selection — the Boston Beer '
    'finding.   Goal Design — how the goals were set.   Payout vs Performance — who earned what '
    'against what they delivered.',
    'Program Brands / Control Brands — the engines.   Data - Season / Pre / Control / Accounts '
    '— the exports. Replace a Data tab and everything recalculates.',
])


# ====================================================== ORDER + SAVE
ORDER = ['Summary', 'Assumptions', 'Acceleration Test', 'Counterfactual',
         'Control by Supplier', 'Within-Account Control', 'Distribution',
         'Account Concentration', 'Channel', 'County', 'GP Bridge', 'Brand Selection',
         'Goal Design', 'Payout vs Performance', 'Program Brands', 'Control Brands',
         'Data - Season', 'Data - Pre', 'Data - Control', 'Data - Accounts', 'Data - Channel']
assert sorted(ORDER) == sorted(wb.sheetnames), set(ORDER) ^ set(wb.sheetnames)
wb._sheets = [wb[s] for s in ORDER]
for s in wb.sheetnames:
    wb[s].sheet_view.showGridLines = False
wb['Summary'].sheet_properties.tabColor = NAVY
wb['Channel'].sheet_properties.tabColor = GREEN

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print(f'saved {OUT}')
print(f'  {len(wb.sheetnames)} tabs · {len(acct_rows):,} accounts · {len(prog_keys)} program '
      f'brands · {len(ctrl_keys)} control brands · {len(goal_rows)} goals')
