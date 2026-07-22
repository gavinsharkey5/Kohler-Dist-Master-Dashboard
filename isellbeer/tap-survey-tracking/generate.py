#!/usr/bin/env python3
"""
Rebuilds the embedded data in index.html from the iSellBeer tap survey export.

Usage (from this folder):
    python3 generate.py

Input (keep this filename when re-exporting):
    iSellBeer_Corrected_Brand_County_Taps.csv
    - One row per surveyed tap: Account #, DBA, Distribution Area (county),
      Address, City, Date/Time, Photos, Route / Sales Rep, Brand,
      Brand Family, Supplier, # of Taps, Distributor.
    - "Distributor" (US/THEM) is trusted as-is -- this file is expected to
      already be corrected against the Encompass territory rules (see the
      tap-audit skill), not re-derived here.

Optional input, for real photo links:
    iSellBeer_Corrected_Brand_County_Taps.xlsx
    - Same report, exported as Excel instead of CSV. CSV exports flatten the
      "Photos" column's hyperlink to plain display text ("Photos"), so there
      is no URL to read; the .xlsx keeps the actual link. If this file is
      present, it's used INSTEAD of the .csv (same columns, plus real photo
      URLs); if absent, the dashboard just shows a "no photo on file"
      placeholder per account.

index.html does all the rep -> account -> brand grouping client-side from
the flat row list emitted here (one row per CSV line), the same way it
re-groups after search/county/status filtering -- so there's exactly one
grouping implementation to keep correct, not two. This export is one
snapshot in time (each account has a single visit date here), so "most
recent visit"/"most recent photo" is just that snapshot's values.

Run: python3 generate.py
"""
import csv, json, re, os, datetime
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, 'iSellBeer_Corrected_Brand_County_Taps.csv')
XLSX_PATH = os.path.join(HERE, 'iSellBeer_Corrected_Brand_County_Taps.xlsx')
HTML = os.path.join(HERE, 'index.html')

COLUMNS = ['#', 'Account #', 'DBA', 'Distribution Area', 'Address', 'City', 'Date/Time',
           'Photos', 'Route / Sales Rep', 'Brand', 'Brand Family', 'Supplier', '# of Taps', 'Distributor']


def load_from_csv():
    with open(CSV_PATH, newline='', encoding='cp1252') as f:
        reader = csv.DictReader(f)
        out = []
        for row in reader:
            d = {c: row.get(c, '') for c in COLUMNS}
            d['photo'] = None
            out.append(d)
        return out


def load_from_xlsx():
    from openpyxl import load_workbook
    wb = load_workbook(XLSX_PATH, data_only=True)
    ws = wb.active
    header = [c.value for c in ws[1]]
    col_idx = {name: header.index(name) for name in COLUMNS}
    photo_idx = col_idx['Photos']
    rows = []
    for r in ws.iter_rows(min_row=2):
        if r[col_idx['#']].value in (None, ''):
            continue
        row = {c: ('' if r[col_idx[c]].value is None else str(r[col_idx[c]].value)) for c in COLUMNS}
        photo_cell = r[photo_idx]
        row['photo'] = photo_cell.hyperlink.target if photo_cell.hyperlink else None
        rows.append(row)
    return rows


def parse_rep(raw):
    m = re.match(r'^\s*\d+\s*-\s*(.+)$', raw)
    name = m.group(1).strip() if m else raw.strip()
    return ' '.join(w[:1].upper() + w[1:] for w in name.split(' '))


def parse_datetime(raw):
    return datetime.datetime.strptime(raw.strip(), '%m/%d/%Y %I:%M %p')


def num(s):
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 1


# ---------- load ----------
using_xlsx = os.path.exists(XLSX_PATH)
raw_rows = load_from_xlsx() if using_xlsx else load_from_csv()

records = []
for r in raw_rows:
    visited = parse_datetime(r['Date/Time'])
    records.append({
        'account': r['Account #'].strip(),
        'dba': r['DBA'].strip(),
        'county': r['Distribution Area'].strip(),
        'address': r['Address'].strip(),
        'city': r['City'].strip(),
        'visited': visited.isoformat(),
        'visitedDisplay': visited.strftime('%b %-d, %Y'),
        'rep': parse_rep(r['Route / Sales Rep']),
        'brand': r['Brand'].strip(),
        'brandFamily': r['Brand Family'].strip(),
        'supplier': r['Supplier'].strip(),
        'taps': num(r['# of Taps']),
        'status': (r['Distributor'] or '').strip().upper() or 'UNVERIFIED',
        'photo': r['photo'],
    })

counties = sorted(set(r['county'] for r in records))
reps = sorted(set(r['rep'] for r in records))
accounts = set((r['account'], r['dba']) for r in records)

total_taps = sum(r['taps'] for r in records)
total_us = sum(r['taps'] for r in records if r['status'] == 'US')
total_them = sum(r['taps'] for r in records if r['status'] == 'THEM')
total_unv = total_taps - total_us - total_them
photos_available = len(set(r['account'] for r in records if r['photo']))

payload = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    'photosSource': 'xlsx' if using_xlsx else None,
    'counties': counties,
    'reps': reps,
    'summary': {
        'taps': total_taps, 'us': total_us, 'them': total_them, 'unv': total_unv,
        'usPct': round(total_us / total_taps * 100, 1) if total_taps else 0,
        'themPct': round(total_them / total_taps * 100, 1) if total_taps else 0,
        'repCount': len(reps), 'accountCount': len(accounts),
        'photosAvailable': photos_available,
    },
    'records': records,
}

data_json = json.dumps(payload, separators=(',', ':'))

html = open(HTML, encoding='utf-8').read()
new_html, n = re.subn(
    r'(<script id="tap-data" type="application/json">).*?(</script>)',
    lambda m: m.group(1) + data_json + m.group(2),
    html, count=1, flags=re.S,
)
assert n == 1, 'tap-data script tag not found in index.html'
open(HTML, 'w', encoding='utf-8').write(new_html)

print(f"Photo source: {'xlsx (real links)' if using_xlsx else 'csv (no photo links available)'}")
print(f"{len(reps)} reps, {len(accounts)} accounts, {total_taps} taps "
      f"({total_us} ours / {total_them} competitor / {total_unv} unverified)")
print(f"Accounts with a photo on file: {photos_available} of {len(accounts)}")
