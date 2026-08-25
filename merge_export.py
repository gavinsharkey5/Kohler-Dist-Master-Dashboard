#!/usr/bin/env python3
"""
Merge a PARTIAL Encompass/RDE export into the full CSV a dashboard already
publishes, so you can pull just the newest stretch of dates instead of
re-exporting the whole year every time.

Why this exists: every generate*/build* script in this repo REBUILDS its
dashboard from whatever file it is handed. Hand one a Jul-23-onward export and
everything before Jul 23 silently disappears -- YTD collapses, retention
counts reset, and every account looks like a brand-new placement. Merge first,
then run the generator, and history stays intact.

Two shapes of export, two modes:

  rows     One row per transaction/placement (Bardstown retention history,
           invoice transactions, the L6-month and L90-day placement files).
           The master and the new pull are compared as MULTISETS: if the new
           export holds more copies of a row than the master does, only the
           extra copies are appended. That makes an overlapping date range
           safe without deleting legitimate duplicate rows -- the invoice
           export has no customer column, so two customers buying the same
           item at the same price on the same day really do produce identical
           lines (about 7,000 of them in the current file).
           Column headers may carry the report's own date range (e.g.
           "Cases   1/1/2025 - 12/31/2026"); that stamp is ignored when
           matching columns, and a different column order is tolerated.

             python3 merge_export.py rows \\
                 bardstown-green-river/RDE_Bardstown_Green_River_Retention_History.csv \\
                 ~/Downloads/bardstown_jul23_onward.csv

  monthly  The wide "Account Level by Month" grid: one row per
           (channel, product, customer) with a Buyer Count + Units pair per
           month. Month columns from the new file are merged in -- new months
           become new columns, and months present in both are overwritten with
           the new file's values (the fresher pull wins).

             python3 merge_export.py monthly \\
                 wine-spirits-portfolio/ws_account_level_by_month.csv \\
                 ~/Downloads/ws_account_level_aug.csv

The master file is rewritten in place, after a timestamp-free .bak copy is
written next to it (one backup, overwritten each run). Nothing is deleted from
the master in either mode.

After merging, run that dashboard's generator (bardstown-green-river/generate.py
or wine-spirits/build_ws_dashboard.py) and check the run output before pushing.
"""
import csv
import os
import re
import shutil
import sys
from collections import defaultdict

MONTH_COL = re.compile(r'^(Buyer Count|Units)\s+(\d{4})/(\d{1,2})$')
# RDE stamps the report's own date range into some column names, e.g.
# "Cases   1/1/2025 - 12/31/2026" or "Placement Count   2026". A partial pull
# therefore arrives with different header TEXT for the same column, so headers
# are compared on the part before that stamp.
HEADER_STAMP = re.compile(r'\s{2,}(\d{1,2}/\d{1,2}/\d{2,4}\s*-\s*\d{1,2}/\d{1,2}/\d{2,4}|\d{4})\s*$')


def norm_header(h):
    if MONTH_COL.match(h.strip()):      # month columns keep their year/month
        return h.strip()
    return HEADER_STAMP.sub('', h.strip())


def add_cells(old_val, new_val, kind):
    """Top-up arithmetic for an overlapping month. Units add; a Buyer Count is a
    distinct-account count for the month, so the larger of the two is the safest
    read (adding would double-count an account that bought in both slices)."""
    a, b = _f(old_val), _f(new_val)
    if a == 0 and old_val.strip() == '':
        return new_val
    if kind == 'Buyer Count':
        return _fmt_num(max(a, b))
    return _fmt_num(a + b)


def _f(v):
    v = (v or '').strip().replace(',', '')
    if not v:
        return 0.0
    try:
        return float(v)
    except ValueError:
        return 0.0


def _fmt_num(v):
    return f'{v:.2f}' if v % 1 else f'{v:.2f}'


def die(msg):
    print('ERROR: ' + msg, file=sys.stderr)
    sys.exit(1)


def read_csv(path):
    if not os.path.exists(path):
        die(f'no such file: {path}')
    with open(path, newline='', encoding='utf-8-sig') as f:
        rows = list(csv.reader(f))
    if not rows:
        die(f'empty file: {path}')
    return rows[0], rows[1:]


def backup(path):
    bak = path + '.bak'
    shutil.copyfile(path, bak)
    return bak


def write_csv(path, header, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


# ---------------------------------------------------------------- rows mode --
def merge_rows(master_path, new_paths):
    header, rows = read_csv(master_path)
    norm = [norm_header(h) for h in header]
    # Counts, not a set: some of these exports legitimately contain identical
    # rows (the invoice file has no customer column, so two customers buying
    # the same item at the same price on the same day produce identical
    # lines). Deduping by identity would silently delete real sales, so the
    # master and the new pull are compared as multisets: if the new export has
    # more copies of a row than the master, only the extras are appended.
    have = defaultdict(int)
    for r in rows:
        have[tuple(r)] += 1
    added = skipped = 0
    for p in new_paths:
        nheader, nrows = read_csv(p)
        nnorm = [norm_header(h) for h in nheader]
        if sorted(nnorm) != sorted(norm):
            only_master = [c for c in norm if c not in nnorm]
            only_new = [c for c in nnorm if c not in norm]
            die(f'{p} has different columns than {master_path}.\n'
                f'  missing from the new export: {only_master or "none"}\n'
                f'  extra in the new export:     {only_new or "none"}\n'
                '  Re-export with the same report layout and try again.')
        # tolerate a different column ORDER, and different date stamps in the
        # header text -- the master's own header is kept
        order = [nnorm.index(c) for c in norm]
        incoming = defaultdict(int)
        for r in nrows:
            if not any(v.strip() for v in r):
                continue
            incoming[tuple(r[i] for i in order)] += 1
        for key, count in incoming.items():
            extra = count - have.get(key, 0)
            skipped += min(count, have.get(key, 0))
            for _ in range(max(0, extra)):
                rows.append(list(key))
                have[key] += 1
                added += 1
    bak = backup(master_path)
    write_csv(master_path, header, rows)
    print(f'rows mode: {added} new rows added, {skipped} rows already in the master')
    print(f'{master_path} now has {len(rows)} rows (backup at {bak})')
    return rows, header


# ------------------------------------------------------------- monthly mode --
def month_pairs(header):
    """{(year, month): {'Buyer Count': idx, 'Units': idx}} for a wide grid."""
    out = {}
    for i, h in enumerate(header):
        m = MONTH_COL.match(h.strip())
        if m:
            out.setdefault((int(m.group(2)), int(m.group(3))), {})[m.group(1)] = i
    return out


def merge_monthly(master_path, new_path, overlap=None):
    header, rows = read_csv(master_path)
    nheader, nrows = read_csv(new_path)

    m_months, n_months = month_pairs(header), month_pairs(nheader)
    if not m_months:
        die(f'{master_path} has no "Buyer Count YYYY/M" columns — is this the monthly grid?')
    if not n_months:
        die(f'{new_path} has no "Buyer Count YYYY/M" columns — for a transaction-style '
            'export use "rows" mode instead.')

    meta_cols = [h for h in header if not MONTH_COL.match(h.strip())]
    n_meta = [norm_header(h) for h in nheader if not MONTH_COL.match(h.strip())]
    missing = [c for c in meta_cols if norm_header(c) not in n_meta]
    if missing:
        die(f'{new_path} is missing these identifying columns: {missing}')
    for key in ('On-Off Premise', 'Product Num', 'Customer ID'):
        if key not in meta_cols:
            die(f'{master_path} has no "{key}" column — cannot match rows safely.')

    def row_key(row, hdr):
        idx = {h: i for i, h in enumerate(hdr)}
        return (row[idx['On-Off Premise']].strip(),
                row[idx['Product Num']].strip(),
                row[idx['Customer ID']].strip())

    all_months = sorted(set(m_months) | set(n_months))
    out_header = meta_cols + [f'{kind}   {y}/{mo}' for (y, mo) in all_months
                              for kind in ('Buyer Count', 'Units')]

    m_idx = {h: i for i, h in enumerate(header)}
    n_idx = {h: i for i, h in enumerate(nheader)}

    merged = {}
    order = []
    for r in rows:
        k = row_key(r, header)
        cells = {c: r[m_idx[c]] for c in meta_cols}
        for ym, kinds in m_months.items():
            for kind, i in kinds.items():
                cells[(kind, ym)] = r[i]
        merged[k] = cells
        order.append(k)

    # A month present in BOTH files is ambiguous: a full re-pull of that month
    # should replace what's there, but a partial top-up (say Jul 24-31 when the
    # master already holds Jul 1-23) must be added to it or the earlier days
    # vanish. There is nothing in the file that says which it is, so ask.
    overlapping_pre = sorted(set(n_months) & set(m_months))
    if overlapping_pre and overlap not in ('replace', 'add', 'keep'):
        die('the new export overlaps months already in the master: '
            + ', '.join(f'{y}/{m}' for (y, m) in overlapping_pre) + '\n'
            '  Say what should happen to those months:\n'
            '    --overlap add      the new pull is a TOP-UP of days not yet in the master\n'
            '                       (e.g. master has Jul 1-23, new pull is Jul 24-31)\n'
            '    --overlap replace  the new pull covers those whole months and should\n'
            '                       overwrite them\n'
            '    --overlap keep     ignore the overlapping months, take only the new ones\n'
            '  Months only in the new export are always added, whichever you pick.')

    updated = added = 0
    for r in nrows:
        if not any(v.strip() for v in r):
            continue
        k = row_key(r, nheader)
        if k in merged:
            cells = merged[k]
            updated += 1
        else:
            cells = {c: r[n_idx[c]] for c in meta_cols}
            merged[k] = cells
            order.append(k)
            added += 1
        for ym, kinds in n_months.items():
            is_overlap = ym in m_months
            if is_overlap and overlap == 'keep':
                continue
            for kind, i in kinds.items():
                if is_overlap and overlap == 'add':
                    # top-up: add the new days onto whatever the month already held
                    cells[(kind, ym)] = add_cells(cells.get((kind, ym), ''), r[i], kind)
                else:
                    cells[(kind, ym)] = r[i]

    out_rows = []
    for k in order:
        cells = merged[k]
        row = [cells.get(c, '') for c in meta_cols]
        for ym in all_months:
            for kind in ('Buyer Count', 'Units'):
                row.append(cells.get((kind, ym), ''))
        out_rows.append(row)

    new_months = sorted(set(n_months) - set(m_months))
    overlapping = sorted(set(n_months) & set(m_months))
    bak = backup(master_path)
    write_csv(master_path, out_header, out_rows)
    fmt = lambda ms: ', '.join(f'{y}/{m}' for (y, m) in ms) or 'none'
    action = {'add': 'topped up with the new days',
              'replace': 'overwritten by the newer pull',
              'keep': 'left untouched'}.get(overlap, 'n/a')
    print(f'monthly mode: {added} new rows added, {updated} existing rows refreshed')
    print(f'  months added:     {fmt(new_months)}')
    print(f'  months already present ({action}): {fmt(overlapping)}')
    print(f'{master_path} now covers {fmt(all_months)} ({len(out_rows)} rows, backup at {bak})')


def main():
    argv = sys.argv[1:]
    overlap = None
    if '--overlap' in argv:
        i = argv.index('--overlap')
        if i + 1 >= len(argv):
            die('--overlap needs a value: add, replace or keep')
        overlap = argv[i + 1]
        del argv[i:i + 2]
    if len(argv) < 3 or argv[0] not in ('rows', 'monthly'):
        print(__doc__)
        sys.exit(1 if argv else 0)
    mode, master, new = argv[0], argv[1], argv[2:]
    if mode == 'rows':
        merge_rows(master, new)
    else:
        if len(new) != 1:
            die('monthly mode takes exactly one new export')
        merge_monthly(master, new[0], overlap)
    print('\nNow re-run that dashboard\'s generator and check its output before committing.')


if __name__ == '__main__':
    main()
