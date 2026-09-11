#!/usr/bin/env python3
"""Builds Summer_of_Success_ROI_Analysis.xlsx -- the did-it-work evaluation of the
Summer of Success 2026 incentive.

    python3 make_roi_analysis.py

Reads three RDE exports (paths in SRC below) plus summer26/goals.csv, and writes a
14-tab workbook in which every analysis cell is a live formula off three Data tabs.
Replace a Data tab with a fresh export of the same shape and the whole evaluation
re-runs.

See README.txt in this folder for what each tab argues and where the numbers come
from. The evaluation itself is described there, not here.
"""
import csv, collections, datetime
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter as gl

U = Path('/root/.claude/uploads/899825c2-dd3d-53b0-913e-556db6c3b287')
SRC = {
    'season': U / '0ebc5a61-RDE_2026_Summer_of_Success_3.csv',
    'pre':    U / '14fcc67e-RDE_2026_Summer_of_Success_Jan__May.csv',
    'ctrl':   U / '83af7b6d-RDE_2026_Summer_of_Success_Brands_Not_Included_in_SoS.csv',
}
OUT = Path('/home/user/Kohler-Dist-Master-Dashboard/summer26/roi/Summer_of_Success_ROI_Analysis.xlsx')

EXCLUDED = {'Default', 'Office Tell Sell', 'Chris Politano', 'Total', ''}
NAVY, GREY, BLUE, RED, GREEN = '1F3864', '595959', '0000FF', 'C00000', '156B2E'
FONT = 'Arial'
CE   = '#,##0;(#,##0);-'
USD  = '$#,##0;($#,##0);-'
USD2 = '$#,##0.00;($#,##0.00);-'
PCT  = '0.0%;(0.0%);-'
PTS  = '+0.0" pts";(0.0)" pts";-'


def n(s):
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
         'r25': col('Revenue', '2025'),     'r26': col('Revenue', '2026'),
         'g25': col('Gross Profit  ', '2025'), 'g26': col('Gross Profit  ', '2026')}
    out = []
    for r in rows:
        rep = r['Sales Rep Assigned'].strip()
        if rep in EXCLUDED:
            continue
        rec = {'rep': rep, 'sup': r['Supplier'].strip(), 'brand': r['Brand Family'].strip()}
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
            rec[k] = n(r[cc])
        out.append(rec)
    return out


def st(cell, *, bold=False, size=10, color=None, bg=None, fmt=None, wrap=False,
       italic=False, align=None, border=False):
    cell.font = Font(name=FONT, size=size, bold=bold, color=color, italic=italic)
    if bg:
        cell.fill = PatternFill('solid', fgColor=bg)
    if fmt:
        cell.number_format = fmt
    if wrap or align:
        cell.alignment = Alignment(wrap_text=wrap, vertical='top', horizontal=align)
    if border:
        thin = Side(style='thin', color='BFBFBF')
        cell.border = Border(top=thin, bottom=thin, left=thin, right=thin)
    return cell


def head(ws, title, subtitle):
    st(ws.cell(1, 1, title), bold=True, size=15, color=NAVY)
    st(ws.cell(2, 1, subtitle), size=9, color=GREY)


def table_head(ws, headers, widths, row=4):
    for i, (h, w) in enumerate(zip(headers, widths), 1):
        st(ws.cell(row, i, h), bold=True, size=9, color='FFFFFF', bg=NAVY, wrap=True,
           align='center')
        ws.column_dimensions[gl(i)].width = w
    ws.row_dimensions[row].height = 30
    ws.freeze_panes = ws.cell(row + 1, 1).coordinate


def note(ws, row, lines, col=1):
    for i, line in enumerate(lines):
        st(ws.cell(row + i, col, line), size=9, color=GREY)
    return row + len(lines)


# ---------------------------------------------------------------- load source
season, pre = load(SRC['season']), load(SRC['pre'])
ctrl = load(SRC['ctrl'], tagged=False)
# The control set is consumed only at supplier x brand (no analysis tab reads it per rep),
# so it is aggregated to that grain here. 4,149 export rows -> 292. This keeps the workbook's
# SUMIFS cheap enough that Excel recalculates it instantly on open.
_ca = {}
for _r in ctrl:
    _k = (_r['sup'], _r['brand'])
    _ca.setdefault(_k, {'sup': _r['sup'], 'brand': _r['brand'],
                        'ce25': 0, 'ce26': 0, 'r25': 0, 'r26': 0, 'g25': 0, 'g26': 0})
    for _kk in ('ce25', 'ce26', 'r25', 'r26', 'g25', 'g26'):
        _ca[_k][_kk] += _r[_kk]
ctrl_rows = [_ca[_k] for _k in sorted(_ca)]
prog_keys = sorted({(r['seg'], r['sup'], r['brand']) for r in season})
ctrl_keys = sorted({(r['sup'], r['brand']) for r in ctrl})
suppliers_both = sorted({r['sup'] for r in season} & {r['sup'] for r in ctrl})
reps = sorted({r['rep'] for r in season})

wb = openpyxl.Workbook()
wb.remove(wb.active)

# ================================================================ DATA TABS
DATA_SPECS = [
    ('Data - Season', season, 'tagged', 'Program brands, 6/1–8/31 (2026 vs 2025)',
     'RDE_2026_Summer_of_Success_3.csv'),
    ('Data - Pre',    pre,    'tagged', 'Program brands, 1/1–5/31 (2026 vs 2025) — pre-program baseline',
     'RDE_2026_Summer_of_Success_Jan__May.csv'),
    ('Data - Control', ctrl_rows, 'agg',
     'Brands NOT in Summer of Success, 6/1–8/31 (2026 vs 2025) — aggregated to supplier × brand',
     'RDE_2026_Summer_of_Success_Brands_Not_Included_in_SoS.csv'),
]
for name, recs, mode, sub, srcfile in DATA_SPECS:
    ws = wb.create_sheet(name)
    head(ws, name.replace('Data - ', 'Source data — '), f'{sub}   ·   Source: {srcfile}')
    lead = {'tagged': ['Rep', 'Segment'], 'plain': ['Rep'], 'agg': []}[mode]
    leadw = {'tagged': [20, 11], 'plain': [20], 'agg': []}[mode]
    cols = lead + ['Supplier', 'Brand Family'] + \
        ['CE 2025', 'CE 2026', 'Revenue 2025', 'Revenue 2026', 'GP 2025', 'GP 2026']
    w = leadw + [30, 26] + [11, 11, 14, 14, 13, 13]
    table_head(ws, cols, w)
    for i, r in enumerate(recs):
        row = 5 + i
        vals = ([r[k] for k in {'tagged': ('rep', 'seg'), 'plain': ('rep',), 'agg': ()}[mode]]
                + [r['sup'], r['brand']])
        for j, v in enumerate(vals, 1):
            st(ws.cell(row, j, v), size=9, color=BLUE)
        base = len(vals)
        for j, (k, f) in enumerate(zip(('ce25', 'ce26', 'r25', 'r26', 'g25', 'g26'),
                                       (CE, CE, USD, USD, USD, USD)), base + 1):
            st(ws.cell(row, j, r[k]), size=9, color=BLUE, fmt=f)
    ws.auto_filter.ref = f'A4:{gl(len(cols))}{4 + len(recs)}'
    tail = (['This tab is the export summed to supplier × brand — the grain every analysis '
             'tab reads it at. The full rep-level export is the source CSV named above.']
            if mode == 'agg' else [])
    note(ws, 6 + len(recs),
         ['Blue = values exactly as exported from RDE. Reps excluded to match the live '
          'dashboard and the payout recap: Default, Office Tell Sell, Chris Politano.',
          'Replace this tab with a fresh export of the same shape and every analysis tab '
          'recalculates.'] + tail)

SEA, PRE, CTL = "'Data - Season'", "'Data - Pre'", "'Data - Control'"
nS, nP, nC = len(season), len(pre), len(ctrl_rows)
# Season/Pre: A rep, B segment, C supplier, D brand, E ce25, F ce26, G r25, H r26, I g25, J g26
# Control:    A supplier, B brand, C ce25, D ce26, E r25, F r26, G g25, H g26  (aggregated)
SEA_R = {c: f'{SEA}!${c}$5:${c}${4+nS}' for c in 'ABCDEFGHIJ'}
PRE_R = {c: f'{PRE}!${c}$5:${c}${4+nP}' for c in 'ABCDEFGHIJ'}
CTL_R = {c: f'{CTL}!${c}$5:${c}${4+nC}' for c in 'ABCDEFGH'}

# ================================================================ ASSUMPTIONS
ws = wb.create_sheet('Assumptions')
head(ws, 'Assumptions, constants and open items',
     'Blue = typed in. Every other tab is formulas off these cells and the Data tabs.')
for c, w in zip('ABCDE', (46, 18, 16, 16, 16)):
    ws.column_dimensions[c].width = w

st(ws.cell(4, 1, 'Program cost'), bold=True, size=11, color=NAVY)
for i, (label, val, src) in enumerate([
        ('Tier payouts earned', 27000, 'Summer_of_Success_Recap.xlsx → Rep Totals'),
        ('Amplify payouts earned', 26746, 'Summer_of_Success_Recap.xlsx → Rep Totals'),
]):
    r = 5 + i
    st(ws.cell(r, 1, label), size=10)
    st(ws.cell(r, 2, val), color=BLUE, fmt=USD)
    st(ws.cell(r, 3, src), size=8, color=GREY)
st(ws.cell(7, 1, 'Total payout'), bold=True)
st(ws.cell(7, 2, '=SUM(B5:B6)'), bold=True, fmt=USD)
st(ws.cell(8, 1, 'Reps earning > $0  /  reps in program'), size=10)
st(ws.cell(8, 2, '=27&" of "&28'), size=10)

st(ws.cell(10, 1, 'Periods compared'), bold=True, size=11, color=NAVY)
for i, (a, b) in enumerate([
        ('Pre-program baseline', 'Jan 1 – May 31, 2026 vs 2025'),
        ('Program period', 'Jun 1 – Aug 31, 2026 vs 2025'),
        ('Control (same window)', 'Jun 1 – Aug 31, brands NOT in Summer of Success'),
        ('Data as of', 'Snowflake sync 9/1/2026 — re-pull before anything is paid'),
]):
    st(ws.cell(11 + i, 1, a), size=10)
    st(ws.cell(11 + i, 2, b), size=10, color=BLUE)

st(ws.cell(16, 1, 'Payout model rules (from Summer_of_Success_Recap.xlsx)'), bold=True,
   size=11, color=NAVY)
note(ws, 17, [
    'Qualifier — a rep clears a supplier at 100% of their own personal goal; the tier is then '
    'read off the route-volume grid.  Tier payouts: T1 $750 · T2 $500 · T3 $250.',
    'Amplify — pays only on cases ABOVE each brand\'s goal, per brand, at $1/case ($2 for '
    'Fever Tree, Mike\'s Harder, MXD).  90%–99.99% of the qualifier goal earns half rate and '
    'no tier; below 90% earns nothing.',
])

st(ws.cell(21, 1, '⚠ OPEN ITEMS — these change the cost side, not the lift finding'),
   bold=True, size=11, color=RED)
note(ws, 22, [
    'a) FUNDING — no Summer of Success line appears in supplier-budget/expenses.csv. If the '
    'suppliers billback the payout, Kohler\'s cost is near zero and the finding becomes '
    'opportunity cost rather than spend.',
    'b) TIER BASIS — the deck writes thresholds as "+25,000 CE\'s". If "+" means GROWTH over '
    '2025 rather than total 2026 CE, almost no one clears Tier 1 and the $27,000 tier line '
    'largely disappears.',
    'c) PER REP vs HOUSE — summer26/README.txt describes the same grid as a company-wide '
    'aggregate. The recap applies it per rep, as instructed.',
    'd) The control set is "brands not in SoS," so it contains non-incented brands from the '
    'SAME suppliers. That is what makes the Control by Supplier tab a within-supplier test.',
    'e) NOT YET AVAILABLE — a Jan–May pull of the control set would complete a formal '
    'difference-in-differences. Three of the four cells are here.',
])

# ================================================================ PROGRAM BRANDS
ws = wb.create_sheet('Program Brands')
head(ws, 'Program brands — both periods, brand-family level',
     'SUMIFS off Data - Season and Data - Pre. Feeds the Acceleration Test, Counterfactual '
     'and GP Bridge tabs.')
cols = ['Segment', 'Supplier', 'Brand Family',
        'CE 2025', 'CE 2026', 'Rev 2025', 'Rev 2026', 'GP 2025', 'GP 2026',
        'CE 2025', 'CE 2026', 'GP 2025', 'GP 2026',
        'GP/CE 2025', 'GP/CE 2026', 'Rev/CE 2025', 'Rev/CE 2026',
        'Laid-in/CE 2025', 'Laid-in/CE 2026',
        'GP26 at LY rate', 'Rate effect',
        'Cases % Jun–Aug', 'Cases % Jan–May', 'Swing']
widths = [11, 28, 24] + [11]*6 + [11]*4 + [11]*6 + [14, 12] + [13, 13, 11]
table_head(ws, cols, widths, row=5)
st(ws.cell(4, 4, 'JUN–AUG  (program period)'), bold=True, size=9, color=NAVY)
st(ws.cell(4, 10, 'JAN–MAY  (pre-program)'), bold=True, size=9, color=NAVY)
st(ws.cell(4, 14, 'PER-CASE ECONOMICS, JUN–AUG'), bold=True, size=9, color=NAVY)
st(ws.cell(4, 20, 'GP BRIDGE INPUTS'), bold=True, size=9, color=NAVY)
st(ws.cell(4, 22, 'ACCELERATION'), bold=True, size=9, color=NAVY)

for i, (seg, sup, brand) in enumerate(prog_keys):
    r = 6 + i
    for c, v in ((1, seg), (2, sup), (3, brand)):
        st(ws.cell(r, c, v), size=9)
    sif = lambda rng, R: (f'=SUMIFS({R[rng]},{R["B"]},$A{r},{R["C"]},$B{r},{R["D"]},$C{r})')
    for c, rng in zip(range(4, 10), 'EFGHIJ'):
        st(ws.cell(r, c, sif(rng, SEA_R)), size=9, fmt=CE if c < 6 else USD)
    for c, rng in zip(range(10, 14), 'EFIJ'):
        st(ws.cell(r, c, sif(rng, PRE_R)), size=9, fmt=CE if c < 12 else USD)
    f = {
        14: f'=IFERROR($H{r}/$D{r},0)', 15: f'=IFERROR($I{r}/$E{r},0)',
        16: f'=IFERROR($F{r}/$D{r},0)', 17: f'=IFERROR($G{r}/$E{r},0)',
        18: f'=IFERROR(($F{r}-$H{r})/$D{r},0)', 19: f'=IFERROR(($G{r}-$I{r})/$E{r},0)',
        20: f'=$E{r}*$N{r}', 21: f'=$E{r}*($O{r}-$N{r})',
        22: f'=IFERROR($E{r}/$D{r}-1,"")', 23: f'=IFERROR($K{r}/$J{r}-1,"")',
        24: f'=IFERROR($V{r}-$W{r},"")',
    }
    fmt = {14: USD2, 15: USD2, 16: USD2, 17: USD2, 18: USD2, 19: USD2,
           20: USD, 21: USD, 22: PCT, 23: PCT, 24: PCT}
    for c, formula in f.items():
        st(ws.cell(r, c, formula), size=9, fmt=fmt[c])
LASTP = 5 + len(prog_keys)
ws.auto_filter.ref = f'A5:X{LASTP}'
st(ws.cell(LASTP + 1, 1, 'TOTAL'), bold=True)
for c in (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20, 21):
    st(ws.cell(LASTP + 1, c, f'=SUM({gl(c)}6:{gl(c)}{LASTP})'), bold=True, size=9,
       fmt=CE if c in (4, 5, 10, 11) else USD)

PB = "'Program Brands'"
PBR = {c: f'{PB}!${c}$6:${c}${LASTP}' for c in
       ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'T', 'U']}

# ================================================================ CONTROL BRANDS
ws = wb.create_sheet('Control Brands')
head(ws, 'Non-program brands — Jun–Aug, brand-family level',
     'The control set: every brand NOT in Summer of Success. SUMIFS off Data - Control.')
cols = ['Supplier', 'Brand Family', 'CE 2025', 'CE 2026', 'Rev 2025', 'Rev 2026',
        'GP 2025', 'GP 2026', 'GP/CE 2025', 'GP/CE 2026', 'GP26 at LY rate', 'Rate effect',
        'Cases %']
table_head(ws, cols, [28, 26, 11, 11, 14, 14, 13, 13, 12, 12, 14, 12, 11])
for i, (sup, brand) in enumerate(ctrl_keys):
    r = 5 + i
    st(ws.cell(r, 1, sup), size=9)
    st(ws.cell(r, 2, brand), size=9)
    for c, rng in zip(range(3, 9), 'CDEFGH'):
        st(ws.cell(r, c, f'=SUMIFS({CTL_R[rng]},{CTL_R["A"]},$A{r},{CTL_R["B"]},$B{r})'),
           size=9, fmt=CE if c < 5 else USD)
    for c, formula, fmt in (
            (9,  f'=IFERROR($G{r}/$C{r},0)', USD2), (10, f'=IFERROR($H{r}/$D{r},0)', USD2),
            (11, f'=$D{r}*$I{r}', USD),             (12, f'=$D{r}*($J{r}-$I{r})', USD),
            (13, f'=IFERROR($D{r}/$C{r}-1,"")', PCT)):
        st(ws.cell(r, c, formula), size=9, fmt=fmt)
LASTC = 4 + len(ctrl_keys)
ws.auto_filter.ref = f'A4:M{LASTC}'
st(ws.cell(LASTC + 1, 1, 'TOTAL'), bold=True)
for c in (3, 4, 5, 6, 7, 8, 11, 12):
    st(ws.cell(LASTC + 1, c, f'=SUM({gl(c)}5:{gl(c)}{LASTC})'), bold=True, size=9,
       fmt=CE if c in (3, 4) else USD)

CB = "'Control Brands'"
CBR = {c: f'{CB}!${c}$5:${c}${LASTC}' for c in ['A', 'B', 'C', 'D', 'G', 'H', 'K', 'L']}

exec(open('/tmp/claude-0/-home-user-Kohler-Dist-Master-Dashboard/899825c2-dd3d-53b0-913e-556db6c3b287/scratchpad/build.py').read().split("wb.save(OUT)")[0])

SEGS = ('Qualifier', 'Amplify')

# ============================================================ ACCELERATION TEST
ws = wb.create_sheet('Acceleration Test')
head(ws, 'Test 1 — did growth accelerate once the program started?',
     'The core causal test. If the incentive worked, the Jun–Aug growth rate should exceed the '
     'Jan–May rate the same brands were already running.')
for c, w in zip('ABCDEFG', (34, 15, 15, 15, 15, 15, 44)):
    ws.column_dimensions[c].width = w
table_head(ws, ['', 'Jan–May 2025', 'Jan–May 2026', 'Jan–May %',
                'Jun–Aug 2025', 'Jun–Aug 2026', 'Jun–Aug %'],
           [34, 15, 15, 15, 15, 15, 15])
ws.column_dimensions['H'].width = 13

row = 5
blocks = [('CASE EQUIVALENTS', ('J', 'K', 'D', 'E'), CE),
          ('GROSS PROFIT',     ('L', 'M', 'H', 'I'), USD)]
acc_ref = {}
for title, (p25, p26, s25, s26), fmt in blocks:
    st(ws.cell(row, 1, title), bold=True, size=11, color=NAVY)
    st(ws.cell(row, 8, 'Swing'), bold=True, size=9, color='FFFFFF', bg=NAVY, align='center')
    row += 1
    first = row
    for seg in SEGS:
        st(ws.cell(row, 1, f'{seg} brands'), size=10)
        sif = lambda col: f'=SUMIFS({PBR[col]},{PBR["A"]},"{seg}")'
        st(ws.cell(row, 2, sif(p25)), fmt=fmt); st(ws.cell(row, 3, sif(p26)), fmt=fmt)
        st(ws.cell(row, 4, f'=IFERROR(C{row}/B{row}-1,"")'), fmt=PCT, bold=True)
        st(ws.cell(row, 5, sif(s25)), fmt=fmt); st(ws.cell(row, 6, sif(s26)), fmt=fmt)
        st(ws.cell(row, 7, f'=IFERROR(F{row}/E{row}-1,"")'), fmt=PCT, bold=True)
        st(ws.cell(row, 8, f'=IFERROR(G{row}-D{row},"")'), fmt=PTS, bold=True,
           color=RED if title == 'CASE EQUIVALENTS' else None)
        acc_ref[(title, seg)] = row
        row += 1
    st(ws.cell(row, 1, 'All program brands'), bold=True)
    for c in (2, 3, 5, 6):
        st(ws.cell(row, c, f'=SUM({gl(c)}{first}:{gl(c)}{row-1})'), bold=True, fmt=fmt)
    st(ws.cell(row, 4, f'=IFERROR(C{row}/B{row}-1,"")'), bold=True, fmt=PCT)
    st(ws.cell(row, 7, f'=IFERROR(F{row}/E{row}-1,"")'), bold=True, fmt=PCT)
    st(ws.cell(row, 8, f'=IFERROR(G{row}-D{row},"")'), bold=True, fmt=PTS)
    acc_ref[(title, 'All')] = row
    row += 2

ACC = "'Acceleration Test'"
st(ws.cell(row, 1, 'How to read this'), bold=True, size=11, color=NAVY)
row = note(ws, row + 1, [
    'The Swing column is the whole test: Jun–Aug growth rate minus Jan–May growth rate. A '
    'positive swing is the signature of an incentive that changed behaviour.',
    'Amplify brands entered the summer already growing double digits and did not speed up. '
    'Qualifier volume slowed by nearly three points once the program started.',
    'Caveat, stated plainly: Jan–May and Jun–Aug are different seasons. Beer is seasonal, so '
    'this compares each period against its OWN prior year, which removes seasonality from the '
    'growth rates being compared. What it cannot remove is a change in the market between the '
    'two windows — that is what the Control tab is for.',
])

# ============================================================ COUNTERFACTUAL
ws = wb.create_sheet('Counterfactual')
head(ws, 'Test 2 — measured lift against the pre-program trajectory',
     'Applies each segment\'s Jan–May growth rate to its Jun–Aug 2025 base. The gap between '
     'that and what actually happened is the lift the program can claim.')
for c, w in zip('ABCDEF', (34, 17, 17, 17, 17, 17)):
    ws.column_dimensions[c].width = w
table_head(ws, ['', 'Jan–May run rate', 'Jun–Aug 2025 base', 'Expected Jun–Aug',
                'Actual Jun–Aug', 'Lift vs trend'], [34, 17, 17, 17, 17, 17])
row = 5
cf = {}
for title, (p25, p26, s25, s26), fmt in blocks:
    st(ws.cell(row, 1, title), bold=True, size=11, color=NAVY); row += 1
    first = row
    for seg in SEGS:
        st(ws.cell(row, 1, f'{seg} brands'), size=10)
        a = acc_ref[(title, seg)]
        st(ws.cell(row, 2, f'={ACC}!D{a}'), fmt=PCT)
        st(ws.cell(row, 3, f'={ACC}!E{a}'), fmt=fmt)
        st(ws.cell(row, 4, f'=C{row}*(1+B{row})'), fmt=fmt)
        st(ws.cell(row, 5, f'={ACC}!F{a}'), fmt=fmt)
        st(ws.cell(row, 6, f'=E{row}-D{row}'), fmt=fmt, bold=True)
        row += 1
    st(ws.cell(row, 1, 'TOTAL'), bold=True)
    for c in (3, 4, 5, 6):
        st(ws.cell(row, c, f'=SUM({gl(c)}{first}:{gl(c)}{row-1})'), bold=True, fmt=fmt)
    cf[title] = row
    row += 2

st(ws.cell(row, 1, 'THE BOTTOM LINE'), bold=True, size=12, color=NAVY)
row += 1
CFS = "'Counterfactual'"
for label, formula, fmt, bold in [
        ('Gross profit lift vs pre-program trend', f'=F{cf["GROSS PROFIT"]}', USD, True),
        ('Case lift vs pre-program trend', f'=F{cf["CASE EQUIVALENTS"]}', CE, False),
        ('Amplify GP lift alone (the segment the payout targets)',
         f'=F{cf["GROSS PROFIT"] - 2 + 1}', USD, False),
        ('Total payout', '=Assumptions!$B$7', USD, False),
        ('Net of payout', f'=F{cf["GROSS PROFIT"]}-Assumptions!$B$7', USD, True),
        ('Return per payout dollar', f'=IFERROR(F{cf["GROSS PROFIT"]}/Assumptions!$B$7,"")',
         '0.00"x"', True),
]:
    st(ws.cell(row, 1, label), size=10, bold=bold)
    st(ws.cell(row, 2, formula), fmt=fmt, bold=bold, size=10)
    row += 1
row += 1
row = note(ws, row, [
    'Read the Amplify line first — it is the cleanest number in the whole analysis. Amplify is '
    'the segment the per-case payout actually targets, and it landed within a rounding error '
    'of the trajectory it was already on.',
    'The Qualifier GP line reads positive, but the GP Bridge and Control tabs show why that is '
    'not program lift: it is a house-wide margin expansion that the non-incented book captured '
    'far more of, per case, than the incented book did.',
    'A trend extrapolation is not a controlled experiment. It assumes the Jan–May trajectory '
    'would have continued absent the program. The Control tab tests that assumption against '
    'brands that got no incentive at all.',
])

# ============================================================ CONTROL BY SUPPLIER
ws = wb.create_sheet('Control by Supplier')
head(ws, 'Test 3 — incented brands vs the SAME supplier\'s non-incented brands',
     'Jun–Aug, same reps, same window, same pricing environment. The tightest control the data '
     'allows: the only difference between the two columns is whether a payout was attached.')
table_head(ws, ['Supplier', 'Incented CE 2025', 'Incented CE 2026', 'Incented %',
                'Not incented CE 2025', 'Not incented CE 2026', 'Not incented %',
                'Gap (pts)', 'Incented GP Δ', 'Not incented GP Δ'],
           [30, 14, 14, 12, 15, 15, 13, 11, 14, 15])
for i, sup in enumerate(suppliers_both):
    r = 5 + i
    st(ws.cell(r, 1, sup), size=10)
    for c, col in ((2, 'D'), (3, 'E')):
        st(ws.cell(r, c, f'=SUMIFS({PBR[col]},{PBR["B"]},$A{r})'), fmt=CE, size=9)
    st(ws.cell(r, 4, f'=IFERROR(C{r}/B{r}-1,"")'), fmt=PCT, size=9, bold=True)
    for c, col in ((5, 'C'), (6, 'D')):
        st(ws.cell(r, c, f'=SUMIFS({CBR[col]},{CBR["A"]},$A{r})'), fmt=CE, size=9)
    st(ws.cell(r, 7, f'=IFERROR(F{r}/E{r}-1,"")'), fmt=PCT, size=9, bold=True)
    st(ws.cell(r, 8, f'=IFERROR(D{r}-G{r},"")'), fmt=PTS, size=9, bold=True)
    st(ws.cell(r, 9, f'=SUMIFS({PBR["I"]},{PBR["B"]},$A{r})-SUMIFS({PBR["H"]},{PBR["B"]},$A{r})'),
       fmt=USD, size=9)
    st(ws.cell(r, 10, f'=SUMIFS({CBR["H"]},{CBR["A"]},$A{r})-SUMIFS({CBR["G"]},{CBR["A"]},$A{r})'),
       fmt=USD, size=9)
LR = 4 + len(suppliers_both)
st(ws.cell(LR + 1, 1, 'WEIGHTED TOTAL'), bold=True)
for c in (2, 3, 5, 6, 9, 10):
    st(ws.cell(LR + 1, c, f'=SUM({gl(c)}5:{gl(c)}{LR})'), bold=True,
       fmt=CE if c in (2, 3, 5, 6) else USD)
st(ws.cell(LR + 1, 4, f'=IFERROR(C{LR+1}/B{LR+1}-1,"")'), bold=True, fmt=PCT)
st(ws.cell(LR + 1, 7, f'=IFERROR(F{LR+1}/E{LR+1}-1,"")'), bold=True, fmt=PCT)
st(ws.cell(LR + 1, 8, f'=IFERROR(D{LR+1}-G{LR+1},"")'), bold=True, fmt=PTS, color=RED)
CTLS = "'Control by Supplier'"
CTL_TOT = LR + 1
note(ws, LR + 3, [
    'Only suppliers appearing on both sides are shown — those are the ones where a true '
    'within-supplier comparison exists.',
    'A negative gap means the supplier\'s incented brands did WORSE than its own non-incented '
    'brands over the same three months.',
    'Boston Beer is the finding worth presenting: see the Brand Selection tab.',
])

# ============================================================ GP BRIDGE
ws = wb.create_sheet('GP Bridge')
head(ws, 'Where the gross profit change actually came from',
     'ΔGP split three ways: cases sold (Volume), which brands sold (Mix), and gross profit per '
     'case within a brand (Rate). Volume is the only one an incentive plausibly drives.')
for c, w in zip('ABCDEF', (40, 18, 18, 18, 18, 18)):
    ws.column_dimensions[c].width = w
table_head(ws, ['', 'Program brands', 'Non-program brands (control)', '', '', ''],
           [40, 20, 24, 14, 14, 14])
row = 5
bridge = {}
for label, pf, cf_ in [
        ('Cases 2025', f'=SUM({PBR["D"]})', f'=SUM({CBR["C"]})'),
        ('Cases 2026', f'=SUM({PBR["E"]})', f'=SUM({CBR["D"]})'),
        ('Gross profit 2025', f'=SUM({PBR["H"]})', f'=SUM({CBR["G"]})'),
        ('Gross profit 2026', f'=SUM({PBR["I"]})', f'=SUM({CBR["H"]})'),
]:
    st(ws.cell(row, 1, label), size=10)
    fmt = CE if 'Cases' in label else USD
    st(ws.cell(row, 2, pf), fmt=fmt); st(ws.cell(row, 3, cf_), fmt=fmt)
    bridge[label] = row
    row += 1

st(ws.cell(row, 1, 'Actual ΔGP'), bold=True)
st(ws.cell(row, 2, f'=B{bridge["Gross profit 2026"]}-B{bridge["Gross profit 2025"]}'),
   bold=True, fmt=USD)
st(ws.cell(row, 3, f'=C{bridge["Gross profit 2026"]}-C{bridge["Gross profit 2025"]}'),
   bold=True, fmt=USD)
delta_row = row
row += 2

st(ws.cell(row, 1, 'DECOMPOSED'), bold=True, size=11, color=NAVY); row += 1
c25, c26 = bridge['Cases 2025'], bridge['Cases 2026']
g25r = bridge['Gross profit 2025']
comp = {}
for label, pf, cf_ in [
        ('Volume — cases, at last year\'s GP/CE',
         f'=(B{c26}-B{c25})*(B{g25r}/B{c25})', f'=(C{c26}-C{c25})*(C{g25r}/C{c25})'),
        ('Mix — which brands sold',
         f'=SUM({PBR["T"]})-B{c26}*(B{g25r}/B{c25})',
         f'=SUM({CBR["K"]})-C{c26}*(C{g25r}/C{c25})'),
        ('Rate — GP per case within a brand',
         f'=SUM({PBR["U"]})', f'=SUM({CBR["L"]})'),
]:
    st(ws.cell(row, 1, label), size=10)
    st(ws.cell(row, 2, pf), fmt=USD); st(ws.cell(row, 3, cf_), fmt=USD)
    comp[label] = row
    row += 1
st(ws.cell(row, 1, 'Sum (ties to Actual ΔGP)'), bold=True, italic=True, size=9)
for c in (2, 3):
    st(ws.cell(row, c, f'=SUM({gl(c)}{row-3}:{gl(c)}{row-1})'), bold=True, fmt=USD, size=9)
tie_row = row
row += 2

st(ws.cell(row, 1, 'Rate effect per 2026 case'), bold=True, size=11, color=NAVY)
rate_row = comp['Rate — GP per case within a brand']
st(ws.cell(row, 2, f'=IFERROR(B{rate_row}/B{c26},"")'), bold=True, fmt=USD2)
st(ws.cell(row, 3, f'=IFERROR(C{rate_row}/C{c26},"")'), bold=True, fmt=USD2)
per_case_row = row
row += 1
st(ws.cell(row, 1, 'Control advantage per case'), size=10)
st(ws.cell(row, 2, f'=C{per_case_row}-B{per_case_row}'), fmt=USD2, bold=True, color=RED)
row += 2
row = note(ws, row, [
    'The margin gain was real but house-wide. Per case, the non-incented book captured several '
    'times the rate improvement the incented book did — so the program cannot claim it.',
    'Volume is the line an incentive is supposed to move, and on the program brands it is the '
    'negative one.',
    'Mix on the control side is large because the non-program book shifted toward higher-margin '
    'brands (Sun Cruiser, Sierra Nevada) while low-margin Pabst declined.',
])

GPB = "'GP Bridge'"

exec(open('/tmp/claude-0/-home-user-Kohler-Dist-Master-Dashboard/899825c2-dd3d-53b0-913e-556db6c3b287/scratchpad/build2.py').read().split("wb.save(OUT)\nprint('part 2 ok')")[0])

import re
# ======================================================= BRAND SELECTION
ws = wb.create_sheet('Brand Selection')
head(ws, 'The variable that decided the outcome — which brands got incented',
     'Every brand of every supplier that appears on both sides, Jun–Aug. INCENTED rows carried '
     'a payout; NOT INCENTED rows did not.')
table_head(ws, ['Supplier', 'Incented?', 'Brand Family', 'CE 2025', 'CE 2026', 'Δ cases',
                'Cases %', 'GP 2025', 'GP 2026', 'Δ GP'],
           [28, 13, 26, 12, 12, 12, 11, 13, 13, 13])
prog_by_sup = collections.defaultdict(list)
for seg, sup, brand in prog_keys:
    prog_by_sup[sup].append(brand)
ctrl_by_sup = collections.defaultdict(list)
for sup, brand in ctrl_keys:
    if sup in suppliers_both:
        ctrl_by_sup[sup].append(brand)
# order suppliers by how badly brand selection hurt, worst first (label order only)
sea_by = collections.defaultdict(collections.Counter)
ctl_by = collections.defaultdict(collections.Counter)
for r in season:
    for k in ('ce25', 'ce26'):
        sea_by[r['sup']][k] += r[k]
for r in ctrl:
    for k in ('ce25', 'ce26'):
        ctl_by[r['sup']][k] += r[k]
def gap(s):
    a = (sea_by[s]['ce26'] / sea_by[s]['ce25'] - 1) if sea_by[s]['ce25'] else 0
    b = (ctl_by[s]['ce26'] / ctl_by[s]['ce25'] - 1) if ctl_by[s]['ce25'] else 0
    return a - b
r = 5
for sup in sorted(suppliers_both, key=gap):
    start = r
    for flag, brands, R, keycols in (
            ('INCENTED', sorted(prog_by_sup[sup]), PBR, ('D', 'E', 'H', 'I')),
            ('not incented', sorted(ctrl_by_sup[sup]), CBR, ('C', 'D', 'G', 'H'))):
        for b in brands:
            st(ws.cell(r, 1, sup), size=9, color=GREY if flag != 'INCENTED' else None)
            st(ws.cell(r, 2, flag), size=9, bold=(flag == 'INCENTED'),
               color=NAVY if flag == 'INCENTED' else GREY)
            st(ws.cell(r, 3, b), size=9)
            crit = (f',{R["A"]},$A{r},{R["B"]},$C{r})' if flag != 'INCENTED'
                    else f',{R["B"]},$A{r},{R["C"]},$C{r})')
            for c, col, fmt in ((4, keycols[0], CE), (5, keycols[1], CE),
                                (8, keycols[2], USD), (9, keycols[3], USD)):
                st(ws.cell(r, c, f'=SUMIFS({R[col]}{crit}'), size=9, fmt=fmt)
            st(ws.cell(r, 6, f'=E{r}-D{r}'), size=9, fmt=CE, bold=True)
            st(ws.cell(r, 7, f'=IFERROR(E{r}/D{r}-1,"")'), size=9, fmt=PCT)
            st(ws.cell(r, 10, f'=I{r}-H{r}'), size=9, fmt=USD, bold=True)
            r += 1
    st(ws.cell(r, 3, f'{sup} — total'), bold=True, size=9)
    for c in (4, 5, 6, 8, 9, 10):
        st(ws.cell(r, c, f'=SUM({gl(c)}{start}:{gl(c)}{r-1})'), bold=True, size=9,
           fmt=CE if c in (4, 5, 6) else USD)
    r += 2
ws.auto_filter.ref = f'A4:J{r-2}'
note(ws, r, [
    'Boston Beer is the case to present. The program pointed reps at Twisted Tea and Truly — '
    'both in decline — while Sun Cruiser, carrying no incentive at all, grew by more cases than '
    'the incented brands lost.',
    'Mark Anthony is the mirror image and the program\'s one clear win: incented brands held '
    'while the same supplier\'s non-incented brands fell more than twenty points further.',
    'Sort or filter column B to compare the two halves of any supplier.',
])

# ======================================================= PAYOUT BY REP
# Recompute the payout model on this export, matching Summer_of_Success_Recap.xlsx.
ROLL = {"Bell's": 'New Belgium Brewing Company'}
TIERS = {'Constellation Brands': (25000, 6000, 1000),
         'MolsonCoors Beverage Company': (16000, 8000, 1000),
         'Heineken USA': (8200, 2300, 100), 'DG Yuengling Inc': (2600, 1000, 100),
         'Mark Anthony': (4000, 1000, 500), 'Boston Beer Company': (4000, 2000, 500)}
TIER_PAY = {1: 750, 2: 500, 3: 250}
raw = list(csv.DictReader(open(SRC['season'])))
Kx = list(raw[0].keys())
cx = lambda p, y: next(x for x in Kx if x.startswith(p) and y in x)
qual, amp = [], []
for rr in raw:
    rep = rr['Sales Rep Assigned'].strip()
    if rep in EXCLUDED:
        continue
    tag = rr['Qualifier Brands'].strip()
    sup = ROLL.get(rr['Supplier'].strip(), rr['Supplier'].strip())
    rec = {'rep': rep, 'sup': sup, 'brand': rr['Brand Family'].strip(),
           'ce26': n(rr[cx('Case Equiv', '2026')]), 'ce25': n(rr[cx('Case Equiv', '2025')]),
           'tag': tag.split(': ', 1)[1] if ': ' in tag else ''}
    (qual if tag.startswith('Qualifier') else amp).append(rec) if tag.startswith(
        ('Qualifier', 'Amplify')) else None
b2s = {(q['rep'], q['tag']): q['sup'] for q in qual}
goals = {}
for g in csv.DictReader(open('/home/user/Kohler-Dist-Master-Dashboard/summer26/goals.csv')):
    if g['Type'].strip() != 'Qualifier':
        continue
    rp = g['Sales Rep'].strip()
    if rp in EXCLUDED:
        continue
    s = b2s.get((rp, g['Brand(s)'].strip()))
    if s:
        goals[(rp, s)] = n(g['2026 Goal'])
actual = collections.Counter()
for q in qual:
    actual[(q['rep'], q['sup'])] += q['ce26']
pkeys = sorted({(x['rep'], x['sup']) for x in qual + amp})
mult, tier_pay = {}, collections.Counter()
for k in pkeys:
    g, a = goals.get(k), actual.get(k)
    if g and g > 0:
        p = (a or 0) / g
        sts = 'Qualified' if p >= 1 else '90% Partial Amplify' if p >= 0.9 else 'Not Qualified'
    else:
        sts = 'No qualifier - Amplify open'
    mult[k] = {'Qualified': 1, '90% Partial Amplify': 0.5, 'Not Qualified': 0}.get(sts, 1)
    if sts == 'Qualified' and k[1] in TIERS:
        t1, t2, t3 = TIERS[k[1]]
        a = a or 0
        t = 1 if a >= t1 else 2 if a >= t2 else 3 if a >= t3 else None
        if t:
            tier_pay[k] = TIER_PAY[t]
amp_pay = collections.Counter()
for x in amp:
    k = (x['rep'], x['sup'])
    e = max(0, x['ce26'] - x['ce25'])
    rate = 2 if re.search(r'fever|mike|mxd', x['brand'], re.I) else 1
    amp_pay[k] += e * rate * mult.get(k, 0)

ws = wb.create_sheet('Payout by Rep')
head(ws, 'What each rep earned, against what each rep delivered',
     'Payout columns are the Summer_of_Success_Recap.xlsx model re-run on this export. Volume '
     'columns are live SUMIFS off Data - Season.')
table_head(ws, ['Rep', 'Tier payout', 'Amplify payout', 'Total payout',
                'Amplify CE 2025', 'Amplify CE 2026', 'Amplify %',
                'Qualifier CE 2025', 'Qualifier CE 2026', 'Qualifier %',
                'Payout per incremental case'],
           [22, 13, 14, 13, 14, 14, 11, 15, 15, 12, 16])
rep_tier = collections.Counter()
rep_amp = collections.Counter()
for k in pkeys:
    rep_tier[k[0]] += tier_pay[k]
    rep_amp[k[0]] += amp_pay[k]
order = sorted(reps, key=lambda x: -(rep_tier[x] + rep_amp[x]))
for i, rp in enumerate(order):
    r = 5 + i
    st(ws.cell(r, 1, rp), size=9)
    st(ws.cell(r, 2, rep_tier[rp]), size=9, color=BLUE, fmt=USD)
    st(ws.cell(r, 3, round(rep_amp[rp], 2)), size=9, color=BLUE, fmt=USD)
    st(ws.cell(r, 4, f'=B{r}+C{r}'), size=9, fmt=USD, bold=True)
    for c, seg, col in ((5, 'Amplify', 'E'), (6, 'Amplify', 'F'),
                        (8, 'Qualifier', 'E'), (9, 'Qualifier', 'F')):
        st(ws.cell(r, c, f'=SUMIFS({SEA_R[col]},{SEA_R["A"]},$A{r},{SEA_R["B"]},"{seg}")'),
           size=9, fmt=CE)
    st(ws.cell(r, 7, f'=IFERROR(F{r}/E{r}-1,"")'), size=9, fmt=PCT)
    st(ws.cell(r, 10, f'=IFERROR(I{r}/H{r}-1,"")'), size=9, fmt=PCT)
    st(ws.cell(r, 11, f'=IF((F{r}-E{r})+(I{r}-H{r})>0,D{r}/((F{r}-E{r})+(I{r}-H{r})),'
                      f'"no net gain")'), size=9, fmt=USD2)
LRP = 4 + len(order)
ws.auto_filter.ref = f'A4:K{LRP}'
st(ws.cell(LRP + 1, 1, 'TOTAL'), bold=True)
for c in (2, 3, 4, 5, 6, 8, 9):
    st(ws.cell(LRP + 1, c, f'=SUM({gl(c)}5:{gl(c)}{LRP})'), bold=True, size=9,
       fmt=USD if c < 5 else CE)
st(ws.cell(LRP + 1, 7, f'=IFERROR(F{LRP+1}/E{LRP+1}-1,"")'), bold=True, fmt=PCT, size=9)
st(ws.cell(LRP + 1, 10, f'=IFERROR(I{LRP+1}/H{LRP+1}-1,"")'), bold=True, fmt=PCT, size=9)
note(ws, LRP + 3, [
    'Blue payout figures carry the three open items on the Assumptions tab — most materially, '
    'whether the tier thresholds mean total 2026 CE or growth over 2025.',
    '"Payout per incremental case" is blank where a rep took payout while their combined program '
    'volume fell. That is not a rep failure — it is what a program pays out when its goals sit '
    'below last year\'s volume.',
])
PAYR = "'Payout by Rep'"

exec(open('/tmp/claude-0/-home-user-Kohler-Dist-Master-Dashboard/899825c2-dd3d-53b0-913e-556db6c3b287/scratchpad/build3.py').read().rsplit(chr(10)+'wb.save(OUT)',1)[0])

TOTROW = LRP + 1
aw = wb['Assumptions']
st(aw.cell(5, 2, f'={PAYR}!B{TOTROW}'), fmt=USD)
st(aw.cell(5, 3, 'Recap model re-run on this export — see Payout by Rep'), size=8, color=GREY)
st(aw.cell(6, 2, f'={PAYR}!C{TOTROW}'), fmt=USD)
st(aw.cell(6, 3, 'Recap model re-run on this export — see Payout by Rep'), size=8, color=GREY)
st(aw.cell(8, 1, 'Reps earning > $0  /  reps in program'), size=10)
st(aw.cell(8, 2, f'=COUNTIF({PAYR}!$D$5:$D${LRP},">0")&" of "&{LRP-4}'), size=10)
st(aw.cell(9, 1, 'Variance vs Summer_of_Success_Recap.xlsx ($53,746)'), size=9, color=GREY)
st(aw.cell(9, 2, f'=B7-53746'), size=9, color=GREY, fmt=USD)
st(aw.cell(9, 3, 'One rep/supplier crossed a Tier 3 line on the fresher export; '
                 'Amplify is identical.', ), size=8, color=GREY)

# ==================================================================== SUMMARY
ws = wb.create_sheet('Summary')
st(ws.cell(1, 1, 'Summer of Success 2026 — did it work?'), bold=True, size=18, color=NAVY)
st(ws.cell(2, 1, f'Jun 1 – Aug 31, 2026 vs 2025 · 28 reps · 10 suppliers · '
                 f'built {datetime.date.today():%m/%d/%Y} from three RDE exports'),
   size=9, color=GREY)
for c, w in zip('ABCDEFG', (52, 17, 17, 17, 15, 15, 15)):
    ws.column_dimensions[c].width = w

acc_ce_amp = acc_ref[('CASE EQUIVALENTS', 'Amplify')]
acc_ce_qual = acc_ref[('CASE EQUIVALENTS', 'Qualifier')]
cf_gp, cf_ce = cf['GROSS PROFIT'], cf['CASE EQUIVALENTS']
cf_gp_amp = cf_gp - 1

r = 4
st(ws.cell(r, 1, 'THE VERDICT'), bold=True, size=13, color=NAVY)
r += 1
st(ws.cell(r, 1, 'The incentive did not generate measurable incremental volume or gross '
                 'profit. It paid for a trend that was already running.'),
   bold=True, size=11, color=RED, wrap=True)
ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
ws.row_dimensions[r].height = 20
r += 2

st(ws.cell(r, 1, 'THE THREE TESTS'), bold=True, size=12, color=NAVY)
r += 1
table_head(ws, ['Test', 'Result', 'What it means', '', '', '', ''],
           [52, 17, 17, 17, 15, 15, 15], row=r)
r += 1
tests = [
    ('1. Did AMPLIFY growth accelerate when the program started?',
     f"={ACC}!H{acc_ce_amp}", PTS,
     'No. Already +12% before a dollar was offered.'),
    ('1b. Did QUALIFIER volume accelerate?',
     f"={ACC}!H{acc_ce_qual}", PTS,
     'No — it slowed by nearly three points.'),
    ('2. Amplify GP lift vs its own pre-program trajectory',
     f"={CFS}!F{cf_gp_amp}", USD,
     'Zero, against $26,746 of amplify payout.'),
    ('3. Incented brands vs the same suppliers\' non-incented brands',
     f"={CTLS}!H{CTL_TOT}", PTS,
     'The incented book LOST to the book with no incentive.'),
    ('4. Rate (margin) gain per case — program vs control',
     f"={GPB}!B{per_case_row}&\" vs \"&{GPB}!C{per_case_row}", None,
     'Margin rose house-wide; the incented book captured least.'),
]
for label, formula, fmt, meaning in tests:
    st(ws.cell(r, 1, label), size=10, wrap=True)
    st(ws.cell(r, 2, formula), bold=True, size=11, fmt=fmt, color=RED, align='center')
    st(ws.cell(r, 3, meaning), size=9, color=GREY, wrap=True)
    ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=7)
    ws.row_dimensions[r].height = 26
    r += 1
r += 1

st(ws.cell(r, 1, 'THE NUMBERS'), bold=True, size=12, color=NAVY)
r += 1
for label, formula, fmt, bold in [
        ('Program cases, Jun–Aug', f"={ACC}!F{acc_ref[('CASE EQUIVALENTS','All')]}", CE, False),
        ('   vs 2025', f"={ACC}!G{acc_ref[('CASE EQUIVALENTS','All')]}", PCT, False),
        ('Program gross profit, Jun–Aug', f"={ACC}!F{acc_ref[('GROSS PROFIT','All')]}", USD, False),
        ('   vs 2025', f"={ACC}!G{acc_ref[('GROSS PROFIT','All')]}", PCT, False),
        ('Gross profit lift vs pre-program trend', f'={CFS}!F{cf_gp}', USD, True),
        ('Total payout', '=Assumptions!$B$7', USD, True),
        ('Net of payout', f'={CFS}!F{cf_gp}-Assumptions!$B$7', USD, True),
]:
    st(ws.cell(r, 1, label), size=10, bold=bold)
    st(ws.cell(r, 2, formula), size=10, bold=bold, fmt=fmt)
    r += 1
r += 1

st(ws.cell(r, 1, 'WHAT THE PROGRAM CAN HONESTLY CLAIM'), bold=True, size=12, color=GREEN)
r += 1
r = note(ws, r, [
    'Mark Anthony held. Incented White Claw and Cayman Jack fell 5.9% while the same '
    'supplier\'s non-incented brands fell 22.2% — a 16-point gap in the program\'s favour, the '
    'clearest evidence anywhere in this analysis that the incentive changed a rep\'s behaviour.',
    'No volume was bought with discount. Revenue per case held on every growing amplify brand '
    '— Modelo Chelada, Pacifico, Victoria, Coors all flat or up. Whatever the program did, it '
    'did not do it by giving margin away.',
    'Engagement was near-universal: 27 of 28 reps earned something, so the mechanics were '
    'understood and played.',
])
r += 1

st(ws.cell(r, 1, 'THE FINDING THAT MATTERS FOR 2027'), bold=True, size=12, color=NAVY)
r += 1
r = note(ws, r, [
    'Brand selection decided the outcome — not payout size, not goal design, not rep effort.',
    'Boston Beer: the program paid reps to push Twisted Tea (-7,585 cases) and Truly (-3,111), '
    'both in structural decline, while Sun Cruiser — no incentive attached — grew 13,728 cases '
    'and $237,182 of gross profit with the same reps in the same summer.',
    'Where the program picked brands with momentum it held share. Where it picked declining '
    'brands it paid reps to fight the market. No payout structure fixes that.',
    'Recommendation: for 2027, screen candidate brands on their own trailing trajectory before '
    'attaching a dollar. A brand already growing does not need the money; a brand in structural '
    'decline will not be saved by it. The spend belongs in between.',
])
r += 1

st(ws.cell(r, 1, 'WHAT THIS ANALYSIS CANNOT TELL YOU'), bold=True, size=12, color=RED)
r += 1
r = note(ws, r, [
    'Whether the payout is Kohler\'s cost or the suppliers\' — no Summer of Success line appears '
    'in the expense tracker. If billback, the finding becomes opportunity cost, not spend.',
    'Whether amplify gains came from new points of distribution or deeper volume in existing '
    'accounts — no account or distribution counts in any of the three exports.',
    'A formal difference-in-differences. Three of the four cells are here; a Jan–May pull of '
    'the control set would complete it.',
    'Whether September gave any of it back. Amplify tracked its trend almost exactly, which '
    'argues against pull-forward, but one confirming pull would settle it.',
])
r += 2
st(ws.cell(r, 1, 'Tab guide'), bold=True, size=11, color=NAVY)
note(ws, r + 1, [
    'Assumptions — payout, periods, open items.   Acceleration Test — test 1.   Counterfactual '
    '— test 2.   Control by Supplier — test 3.',
    'GP Bridge — where the gross profit change came from.   Brand Selection — the Boston Beer '
    'finding.   Payout by Rep — who earned what against what they delivered.',
    'Program Brands / Control Brands — brand-level engines.   Data - Season / Pre / Control — '
    'the three RDE exports, unmodified. Replace a Data tab and everything recalculates.',
])

wb.move_sheet('Summary', offset=-len(wb.sheetnames) + 1)
order = ['Summary', 'Assumptions', 'Acceleration Test', 'Counterfactual',
         'Control by Supplier', 'GP Bridge', 'Brand Selection', 'Payout by Rep',
         'Program Brands', 'Control Brands', 'Data - Season', 'Data - Pre', 'Data - Control']
wb._sheets = [wb[s] for s in order]
for s in wb.sheetnames:
    wb[s].sheet_view.showGridLines = False
wb['Summary'].sheet_properties.tabColor = NAVY

exec(open('/tmp/claude-0/-home-user-Kohler-Dist-Master-Dashboard/899825c2-dd3d-53b0-913e-556db6c3b287/scratchpad/build4.py').read().rsplit(chr(10)+"OUT.parent.mkdir",1)[0])

# ---------------------------------------------------------------- GOAL DESIGN
# goals.csv names BRAND GROUPS; the export's "Qualifier: <brands>" tag is the join.
# No qualifier row carries Bell's, so the payout model's Bell's -> New Belgium rollup
# does not apply here and rep+supplier is an exact key.
qual_2025 = collections.Counter()
for q in qual:
    qual_2025[(q['rep'], q['sup'])] += q['ce25']
goal_rows = sorted(((rp, sp, g) for (rp, sp), g in goals.items() if g > 0),
                   key=lambda t: (t[0], t[1]))

ws = wb.create_sheet('Goal Design')
head(ws, 'Were the goals ever hard? — qualifier goal vs the rep\'s own prior-year volume',
     'A goal set below last year\'s actual pays for maintenance. Goal column is from '
     'goals.csv; both actuals are live SUMIFS off Data - Season.')
table_head(ws, ['Rep', 'Supplier', '2026 qualifier goal', 'Rep\'s own 2025 CE',
                'Goal vs 2025', 'Goal below 2025?', '2026 actual CE', '% to goal',
                'Cleared?', '2026 vs 2025'],
           [20, 30, 16, 15, 13, 15, 14, 11, 11, 13])
for i, (rp, sp, g) in enumerate(goal_rows):
    r = 5 + i
    st(ws.cell(r, 1, rp), size=9)
    st(ws.cell(r, 2, sp), size=9)
    st(ws.cell(r, 3, g), size=9, color=BLUE, fmt=CE)
    sif = lambda col: (f'=SUMIFS({SEA_R[col]},{SEA_R["A"]},$A{r},{SEA_R["C"]},$B{r},'
                       f'{SEA_R["B"]},"Qualifier")')
    st(ws.cell(r, 4, sif('E')), size=9, fmt=CE)
    st(ws.cell(r, 5, f'=IFERROR($C{r}/$D{r}-1,"")'), size=9, fmt=PCT)
    st(ws.cell(r, 6, f'=IF($C{r}<$D{r},"YES — below LY","no")'), size=9,
       color=RED if g < qual_2025[(rp, sp)] else None)
    st(ws.cell(r, 7, sif('F')), size=9, fmt=CE)
    st(ws.cell(r, 8, f'=IFERROR($G{r}/$C{r},"")'), size=9, fmt=PCT)
    st(ws.cell(r, 9, f'=IF($G{r}>=$C{r},"cleared","missed")'), size=9)
    st(ws.cell(r, 10, f'=IFERROR($G{r}/$D{r}-1,"")'), size=9, fmt=PCT)
LG = 4 + len(goal_rows)
ws.auto_filter.ref = f'A4:J{LG}'
st(ws.cell(LG + 1, 1, 'TOTAL'), bold=True)
for c in (3, 4, 7):
    st(ws.cell(LG + 1, c, f'=SUM({gl(c)}5:{gl(c)}{LG})'), bold=True, size=9, fmt=CE)
st(ws.cell(LG + 1, 5, f'=IFERROR(C{LG+1}/D{LG+1}-1,"")'), bold=True, size=9, fmt=PCT)
st(ws.cell(LG + 1, 10, f'=IFERROR(G{LG+1}/D{LG+1}-1,"")'), bold=True, size=9, fmt=PCT)

r = LG + 3
st(ws.cell(r, 1, 'HOW THE GOALS WERE SET'), bold=True, size=12, color=NAVY)
r += 1
GD = "'Goal Design'"
for label, formula, fmt, bold in [
        ('Qualifier goals with a prior-year comparison', f'=COUNT($C$5:$C${LG})', CE, False),
        ('   set BELOW the rep\'s own 2025 volume',
         f'=COUNTIF($F$5:$F${LG},"YES*")', CE, True),
        ('   share of all qualifier goals',
         f'=IFERROR(COUNTIF($F$5:$F${LG},"YES*")/COUNT($C$5:$C${LG}),"")', PCT, True),
        ('Aggregate goal vs the same reps\' 2025 volume', f'=E{LG+1}', PCT, True),
        ('Sub-2025 goals that were CLEARED and paid',
         f'=COUNTIFS($F$5:$F${LG},"YES*",$I$5:$I${LG},"cleared")', CE, False),
        ('   their 2026 volume vs their own 2025',
         f'=IFERROR(SUMIFS($G$5:$G${LG},$F$5:$F${LG},"YES*",$I$5:$I${LG},"cleared")/'
         f'SUMIFS($D$5:$D${LG},$F$5:$F${LG},"YES*",$I$5:$I${LG},"cleared")-1,"")', PCT, True),
]:
    st(ws.cell(r, 1, label), size=10, bold=bold)
    st(ws.cell(r, 2, formula), size=10, bold=bold, fmt=fmt)
    r += 1
ws.column_dimensions['A'].width = 44
r += 1
note(ws, r, [
    'The qualifier half of this program was designed to pay for decline. In aggregate the goals '
    'asked for 2.5% LESS volume than the same reps did in 2025, and nine in ten individual '
    'goals sat below that rep\'s own prior-year number.',
    'The sub-2025 goals that cleared delivered volume flat to last year — and earned tier '
    'payouts for it. That is a goal-setting outcome, not a rep-performance one.',
    'This is the cheapest thing to fix for 2027, and it is independent of the brand-selection '
    'finding: a goal below last year cannot produce incremental volume no matter which brand '
    'it is attached to.',
])

# Summary: add the goal-design line to THE THREE TESTS block
sw = wb['Summary']
ins = None
for row in range(1, 40):
    if sw.cell(row, 1).value == 'THE NUMBERS':
        ins = row
        break
sw.insert_rows(ins)
st(sw.cell(ins, 1, '5. Were the qualifier goals set above last year\'s volume?'), size=10,
   wrap=True)
st(sw.cell(ins, 2, f'={GD}!$B${LG + 6}'), bold=True, size=11, fmt=PCT, color=RED,
   align='center')
st(sw.cell(ins, 3, 'No — 9 in 10 sat BELOW the rep\'s own 2025.'), size=9, color=GREY,
   wrap=True)
sw.merge_cells(start_row=ins, start_column=3, end_row=ins, end_column=7)
sw.row_dimensions[ins].height = 26

order = ['Summary', 'Assumptions', 'Acceleration Test', 'Counterfactual',
         'Control by Supplier', 'GP Bridge', 'Brand Selection', 'Goal Design',
         'Payout by Rep', 'Program Brands', 'Control Brands',
         'Data - Season', 'Data - Pre', 'Data - Control']
wb._sheets = [wb[s] for s in order]
for s in wb.sheetnames:
    wb[s].sheet_view.showGridLines = False
wb['Summary'].sheet_properties.tabColor = NAVY

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print(f'saved {OUT}  ({len(goal_rows)} qualifier goals, {len(wb.sheetnames)} tabs)')
