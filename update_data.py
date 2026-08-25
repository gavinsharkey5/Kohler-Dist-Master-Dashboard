#!/usr/bin/env python3
"""
One command for an incremental data update. Point it at whatever you just
downloaded from RDE/Encompass; it works out which dashboard file each export
belongs to, merges it into the published master (keeping every earlier date),
and re-runs the dashboards that changed.

    python3 update_data.py ~/Downloads/bardstown_jul24_onward.csv
    python3 update_data.py ~/Downloads                    # every .csv in a folder
    python3 update_data.py ~/Downloads/*.csv --overlap add

Nothing historical is ever re-uploaded or re-processed: the master CSVs in this
repo stay put, and only the rows/months in your new export are folded in.

    Master (Jan 1 -> Jul 23)  +  New pull (Jul 24 -> today)  =  Jan 1 -> today

What it recognises, by the export's own column headers:

    Bardstown / Green River retention history  -> appended, duplicates dropped
    WS Account Level by Month (the wide grid)  -> month columns merged in
    WS invoice transactions                    -> appended, duplicates dropped
    WS L6-month / L90-day placements           -> appended, duplicates dropped
    Assigned account roster                    -> updated per customer

Overlapping dates are safe for every row-style export: a row already in the
master is skipped rather than duplicated, so it does not matter if your pull
starts a few days early.

The monthly grid is the one that needs a decision, because it stores one number
per calendar month. If your new pull covers a month the master already holds,
say which it is:

    --overlap add       the pull is a TOP-UP of days the master doesn't have yet
                        (master holds Jul 1-23, your pull is Jul 24-31)
    --overlap replace   the pull covers those whole months and should overwrite
    --overlap keep      ignore the overlapping months, take only the new ones

Months only present in the new pull are always added, whichever you choose.
Without the flag, an overlap stops the run rather than guessing.

Every master file is backed up to <name>.csv.bak before it is touched.

After a successful run: check the printed summary, then commit and push.
"""
import glob
import os
import subprocess
import sys

import merge_export

HERE = os.path.dirname(os.path.abspath(__file__))
BARDSTOWN = os.path.join(HERE, 'bardstown-green-river')
WS = os.path.join(HERE, 'wine-spirits')
PORTFOLIO = os.path.join(HERE, 'wine-spirits-portfolio')

# (label, required columns, master file, mode, which generator it feeds)
TARGETS = [
    ('Bardstown / Green River retention history',
     {'Sales Rep Assigned', 'Customer Num', 'Product Num', 'Date', 'Distribution Area'},
     os.path.join(BARDSTOWN, 'RDE_Bardstown_Green_River_Retention_History.csv'), 'rows', 'bardstown'),
    ('WS Account Level by Month',
     {'On-Off Premise', 'Customer ID', 'Brand Family', 'Product Num'},
     os.path.join(PORTFOLIO, 'ws_account_level_by_month.csv'), 'monthly', 'ws'),
    ('WS invoice transactions',
     {'Segment', 'Laid-in Cost', 'Ext Price', 'Load Sheet Date', 'Product'},
     os.path.join(PORTFOLIO, 'ws_invoice_trans.csv'), 'rows', 'ws'),
    ('WS placements (L6 month / L90 day)',
     {'District Manager', 'Sales Rep Assigned', 'Customer Num', 'Load Sheet Date'},
     os.path.join(WS, 'ws_l6_months.csv'), 'rows', 'ws'),
    ('Assigned account roster',
     {'Customer Num', 'Sales Rep Assigned', 'Route', 'On-Off Premise'},
     os.path.join(WS, 'ws_account_roster.csv'), 'roster', 'both'),
]

GENERATORS = {
    'bardstown': (os.path.join(BARDSTOWN, 'generate.py'), 'Bardstown / Green River'),
    'ws': (os.path.join(WS, 'build_ws_dashboard.py'), 'Wine & Spirits'),
}


def header_of(path):
    import csv
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.reader(f):
            return [c.strip() for c in row]
    return []


def classify(path):
    """Which master does this export belong to? Most specific match wins."""
    cols = set(header_of(path))
    if not cols:
        return None
    best = None
    for label, required, master, mode, feeds in TARGETS:
        if required <= cols:
            if best is None or len(required) > len(best[1]):
                best = (label, required, master, mode, feeds)
    return best


def merge_roster(master, new_path):
    """The roster is a snapshot, not a log: one row per customer, newest wins."""
    import csv
    header, rows = merge_export.read_csv(master)
    nheader, nrows = merge_export.read_csv(new_path)
    if nheader != header:
        merge_export.die(f'{new_path} has different columns than {master}')
    key_i = header.index('Customer Num')
    by_cust = {r[key_i].strip(): r for r in rows}
    order = [r[key_i].strip() for r in rows]
    added = updated = 0
    for r in nrows:
        if not any(v.strip() for v in r):
            continue
        k = r[key_i].strip()
        if k in by_cust:
            if by_cust[k] != r:
                updated += 1
            by_cust[k] = r
        else:
            by_cust[k] = r
            order.append(k)
            added += 1
    bak = merge_export.backup(master)
    merge_export.write_csv(master, header, [by_cust[k] for k in order])
    print(f'roster: {added} accounts added, {updated} updated, {len(order)} total (backup at {bak})')


def expand(args):
    out = []
    for a in args:
        if os.path.isdir(a):
            out.extend(sorted(glob.glob(os.path.join(a, '*.csv'))))
        else:
            out.extend(sorted(glob.glob(a)) or [a])
    return [p for p in out if not p.endswith('.bak')]


def main():
    argv = sys.argv[1:]
    overlap = None
    if '--overlap' in argv:
        i = argv.index('--overlap')
        if i + 1 >= len(argv):
            merge_export.die('--overlap needs a value: add, replace or keep')
        overlap = argv[i + 1]
        del argv[i:i + 2]
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0 if argv else 1)

    files = expand(argv)
    if not files:
        merge_export.die('no CSV files found in ' + ', '.join(argv))

    to_run = set()
    unknown = []
    print(f'Found {len(files)} file(s) to merge.\n')
    for path in files:
        match = classify(path)
        if not match:
            unknown.append(path)
            continue
        label, _req, master, mode, feeds = match
        print(f'--- {os.path.basename(path)}')
        print(f'    looks like: {label}')
        print(f'    merging into: {os.path.relpath(master, HERE)}')
        if mode == 'rows':
            merge_export.merge_rows(master, [path])
        elif mode == 'monthly':
            merge_export.merge_monthly(master, path, overlap)
        else:
            merge_roster(master, path)
        if feeds == 'both':
            to_run.update(GENERATORS)
        else:
            to_run.add(feeds)
        print()

    if unknown:
        print('Could not place these files (column headers did not match any known export):')
        for p in unknown:
            print('  ' + p)
        print('  Re-export with the same report layout, or merge them by hand with '
              'merge_export.py.\n')

    if not to_run:
        merge_export.die('nothing was merged, so no dashboard was rebuilt')

    for key in ('bardstown', 'ws'):
        if key not in to_run:
            continue
        script, label = GENERATORS[key]
        print(f'=== Rebuilding the {label} dashboard ===')
        r = subprocess.run([sys.executable, script], cwd=os.path.dirname(script))
        if r.returncode != 0:
            merge_export.die(f'{os.path.basename(script)} failed — the merged CSV is fine, '
                             'but the dashboard was not rebuilt. Fix the error and re-run '
                             'that generator on its own.')
        print()

    print('Done. Check the numbers above (especially the date windows and account counts), then:')
    print('    git add -A && git commit -m "refresh data" && git push')


if __name__ == '__main__':
    main()
