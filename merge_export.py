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
           New rows are appended; rows identical to ones already in the master
           are dropped, so overlapping date ranges are safe.

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

MONTH_COL = re.compile(r'^(Buyer Count|Units)\s+(\d{4})/(\d{1,2})$')


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
    seen = {tuple(r) for r in rows}
    added = skipped = 0
    for p in new_paths:
        nheader, nrows = read_csv(p)
        if nheader != header:
            only_master = [c for c in header if c not in nheader]
            only_new = [c for c in nheader if c not in header]
            die(f'{p} has different columns than {master_path}.\n'
                f'  missing from the new export: {only_master or "none"}\n'
                f'  extra in the new export:     {only_new or "none"}\n'
                '  Re-export with the same report layout and try again.')
        for r in nrows:
            if not any(v.strip() for v in r):
                continue
            key = tuple(r)
            if key in seen:
                skipped += 1
                continue
            seen.add(key)
            rows.append(r)
            added += 1
    bak = backup(master_path)
    write_csv(master_path, header, rows)
    print(f'rows mode: {added} new rows added, {skipped} duplicate rows skipped')
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


def merge_monthly(master_path, new_path):
    header, rows = read_csv(master_path)
    nheader, nrows = read_csv(new_path)

    m_months, n_months = month_pairs(header), month_pairs(nheader)
    if not m_months:
        die(f'{master_path} has no "Buyer Count YYYY/M" columns — is this the monthly grid?')
    if not n_months:
        die(f'{new_path} has no "Buyer Count YYYY/M" columns — for a transaction-style '
            'export use "rows" mode instead.')

    meta_cols = [h for h in header if not MONTH_COL.match(h.strip())]
    n_meta = [h for h in nheader if not MONTH_COL.match(h.strip())]
    missing = [c for c in meta_cols if c not in n_meta]
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
        # the fresher pull wins for any month it covers
        for ym, kinds in n_months.items():
            for kind, i in kinds.items():
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
    overlap = sorted(set(n_months) & set(m_months))
    bak = backup(master_path)
    write_csv(master_path, out_header, out_rows)
    fmt = lambda ms: ', '.join(f'{y}/{m}' for (y, m) in ms) or 'none'
    print(f'monthly mode: {added} new rows added, {updated} existing rows refreshed')
    print(f'  months added:     {fmt(new_months)}')
    print(f'  months overwritten with the newer pull: {fmt(overlap)}')
    print(f'{master_path} now covers {fmt(all_months)} ({len(out_rows)} rows, backup at {bak})')


def main():
    if len(sys.argv) < 4 or sys.argv[1] not in ('rows', 'monthly'):
        print(__doc__)
        sys.exit(1 if len(sys.argv) > 1 else 0)
    mode, master, new = sys.argv[1], sys.argv[2], sys.argv[3:]
    if mode == 'rows':
        merge_rows(master, new)
    else:
        if len(new) != 1:
            die('monthly mode takes exactly one new export')
        merge_monthly(master, new[0])
    print('\nNow re-run that dashboard\'s generator and check its output before committing.')


if __name__ == '__main__':
    main()
