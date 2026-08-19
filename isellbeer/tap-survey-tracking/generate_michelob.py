#!/usr/bin/env python3
"""Rebuilds the Michelob Bounty Program tab's embedded JSON in index.html
from michelob_bounty_targets.xlsx (the "2026 Fall CL & Lite Draft Targets"
workbook the manager circulated).

The workbook has three hit-list sheets of accounts that pour Michelob
Ultra on draft but are missing Coors Light and/or Miller Lite:
  "No CL or Lite"  neither brand on tap
  "No CL"          no Coors Light (may have Miller Lite)
  "No Lite"        no Miller Lite (may have Coors Light)
Each sheet: a payout-tier legend in rows 1-8 (base tier + a higher
TOP TARGET tier), a header row 9 (Account #, DBA, User, Total Taps,
In-House %, Competitive %), then one row per account followed by
continuation rows listing that account's in-house (col E) and
competitive (col F) draft brands. A YELLOW-highlighted DBA cell marks a
TOP TARGET account (matching the yellow legend row) -- that's the only
per-account tier marker in the file.

Merge rules (confirmed with Gavin, 2026-08-19): each account appears
ONCE in the dashboard with a combined status -- "missing both" if it's
on the "No CL or Lite" sheet (or on both single-brand sheets), else
missing just the one brand. Top-target if highlighted on ANY sheet it
appears on. Taps/percentages/brand lists are taken from the account's
first occurrence (sheet order above).

Payouts (from the legends; the two single-brand sheets share one
schedule): 2 months of CL/ML purchases -> $200 base everywhere; 3
months -> $300 base. Top targets: $400/$600 on "No CL or Lite",
$300/$500 on the single-brand lists. Minimums: 4 half-kegs / 8 quarter-
kegs (2-month tier), 6 half-kegs / 10 quarter-kegs (3-month tier).

Progress tracking: the bounty is earned on MONTHS OF PURCHASES
(Aug-Oct), which this workbook does not carry. Gavin will send a
monthly RDE purchase export (Coors Light / Miller Lite draft purchases
by account, Aug-Oct); when that lands, extend this script to attach a
per-account {"months": [...], "qualified": ...} progress object and the
tab's renderer (renderMichelob in index.html) already reserves the spot
for it. Until then every account carries "purchases": null and the tab
says purchase tracking hasn't started.

Usage: python3 generate_michelob.py
Reads michelob_bounty_targets.xlsx, rewrites the
<script id="michelob-data"> block in index.html in place. Safe to run
in either order with generate.py -- each script only touches its own
script tag.
"""
import json
import os
import re
from datetime import datetime, timezone

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, 'michelob_bounty_targets.xlsx')
HTML = os.path.join(HERE, 'index.html')

SHEETS = [
    ('No CL or Lite', 'both'),
    ('No CL', 'no_cl'),
    ('No Lite', 'no_lite'),
]
YELLOW = 'FFFFFF00'


def is_yellow(cell):
    f = cell.fill
    return bool(f and f.patternType and getattr(f.fgColor, 'rgb', None) == YELLOW)


def parse_sheet(ws):
    accounts = []
    cur = None
    for row in ws.iter_rows(min_row=10):
        a = row[0].value
        if a is not None and str(a).strip().isdigit():
            cur = {
                'account': str(a).strip(),
                'dba': str(row[1].value or '').strip(),
                'rep': str(row[2].value or '').strip(),
                'taps': row[3].value or 0,
                'inhousePct': row[4].value if row[4].value is not None else None,
                'compPct': row[5].value if row[5].value is not None else None,
                'top': is_yellow(row[1]) or is_yellow(row[0]),
                'inhouse': [],
                'comp': [],
            }
            accounts.append(cur)
        elif cur is not None:
            ih, cp = row[4].value, row[5].value
            if ih: cur['inhouse'].append(str(ih).strip())
            if cp: cur['comp'].append(str(cp).strip())
    return accounts


def main():
    wb = openpyxl.load_workbook(XLSX)
    merged = {}
    on_sheets = {}
    for sheet, status in SHEETS:
        for acct in parse_sheet(wb[sheet]):
            key = acct['account']
            on_sheets.setdefault(key, set()).add(status)
            if key not in merged:
                merged[key] = {**acct, 'status': status, 'purchases': None}
            else:
                merged[key]['top'] = merged[key]['top'] or acct['top']

    out = []
    for key, acct in merged.items():
        s = on_sheets[key]
        if 'both' in s or {'no_cl', 'no_lite'} <= s:
            acct['status'] = 'both'
        out.append(acct)
    out.sort(key=lambda a: (a['rep'].upper(), -bool(a['top']), -(a['taps'] or 0)))

    data = {
        'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
        'window': 'August – October 2026',
        'payouts': {
            'both':   {'base': [200, 300], 'top': [400, 600]},
            'single': {'base': [200, 300], 'top': [300, 500]},
            'minimums': {
                'm2': "4 half-kegs or 8 quarter-kegs",
                'm3': "6 half-kegs or 10 quarter-kegs",
            },
        },
        'accounts': out,
    }

    with open(HTML, encoding='utf-8') as f:
        html = f.read()
    payload = json.dumps(data, ensure_ascii=False)
    new_html, n = re.subn(
        r'(<script id="michelob-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + payload + m.group(2),
        html, flags=re.S)
    assert n == 1, 'michelob-data script tag not found in index.html'
    with open(HTML, 'w', encoding='utf-8') as f:
        f.write(new_html)

    tops = sum(1 for a in out if a['top'])
    from collections import Counter
    c = Counter(a['status'] for a in out)
    reps = len({a['rep'] for a in out})
    print(f"Wrote {len(out)} bounty accounts across {reps} reps "
          f"({c.get('both',0)} missing both, {c.get('no_cl',0)} missing Coors Light, "
          f"{c.get('no_lite',0)} missing Miller Lite; {tops} top targets)")


if __name__ == '__main__':
    main()
