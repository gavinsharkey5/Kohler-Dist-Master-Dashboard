#!/usr/bin/env python3
"""
Rebuilds the embedded data in index.html from the iSellBeer US/THEM mediator
workbook (the tap-audit engine's own working file -- see the tap-audit skill).

Usage (from this folder):
    python3 generate.py
    (requires openpyxl: pip install openpyxl)

Input (keep this filename when re-exporting):
    iSellBeer_TAPS_US_THEM_Mediator.xlsx
    A multi-sheet workbook. Only two sheets are actually read; the rest
    (Master - US vs THEM, Brand Family Territory(ies), Whitelist, Brand
    Crosswalk, Brands (Enc), Customers Table (Enc), Master Matrix View) are
    the audit engine's own reference tables -- kept in the repo for
    provenance/future use, not parsed here yet:
      - "Sheet6": one row per surveyed tap, same 14 raw columns as a plain
        iSellBeer export (Account #, DBA, Distribution Area, Address, City,
        Date/Time, Photos, Route / Sales Rep, Brand, Brand Family, Supplier,
        # of Taps, Distributor). This is also where real photo links live
        -- the "Photos" cell's hyperlink -- which a CSV export of the same
        report would flatten to plain display text.
      - "iSellBeer Import Template": the same rows plus the audit engine's
        helper/output columns, notably "Distributor" (the ORIGINAL iSellBeer
        app flag, pre-audit) and "Corrected Distributor" (the engine's final
        US/THEM ruling after checking the product catalog + territory
        tables). This is the authoritative status -- more current than
        Sheet6's own Distributor column, which lags behind for a handful of
        rows (an incomplete write-back, not a judgment call) as of this
        build's source file.
    The two sheets are joined on "#" (row number) to get: raw fields + real
    photo (Sheet6) and corrected status + audit reasoning (Import Template).

index.html does all the rep -> account -> brand grouping client-side from
the flat row list emitted here, the same way it re-groups after search/
county/status filtering -- so there's exactly one grouping implementation
to keep correct, not two. This export is one snapshot in time (each account
has a single visit date here), so "most recent visit"/"most recent photo"
is just that snapshot's values.

Run: python3 generate.py
"""
import json, re, os, datetime
from collections import defaultdict
from openpyxl import load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX_PATH = os.path.join(HERE, 'iSellBeer_TAPS_US_THEM_Mediator.xlsx')
HTML = os.path.join(HERE, 'index.html')

RAW_COLUMNS = ['#', 'Account #', 'DBA', 'Distribution Area', 'Address', 'City', 'Date/Time',
               'Photos', 'Route / Sales Rep', 'Brand', 'Brand Family', 'Supplier', '# of Taps', 'Distributor']


def sheet_rows(ws, columns, with_photo_link=False):
    header = [c.value for c in ws[1]]
    col_idx = {name: header.index(name) for name in columns}
    photo_idx = col_idx.get('Photos') if with_photo_link else None
    out = {}
    for r in ws.iter_rows(min_row=2):
        num_cell = r[col_idx['#']]
        if num_cell.value in (None, ''):
            continue
        row = {c: ('' if r[col_idx[c]].value is None else str(r[col_idx[c]].value)) for c in columns}
        if with_photo_link:
            row['photo'] = r[photo_idx].hyperlink.target if r[photo_idx].hyperlink else None
        out[str(int(float(num_cell.value)))] = row
    return out


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


def audit_reason(t_row):
    result = (t_row.get('Audit Result') or '').strip()
    canonical = (t_row.get('Canonical Brand Family') or '').strip()
    if result == 'Review' or canonical in ('', 'Not Mapped'):
        return 'No product-catalog match for this brand family — defaults to THEM'
    if result == 'MISMATCH':
        return 'iSellBeer’s own flag was wrong here — corrected against territory rules'
    return 'Confirmed against the product catalog and territory rules'


# ---------- load ----------
wb = load_workbook(XLSX_PATH, data_only=True)
raw_by_num = sheet_rows(wb['Sheet6'], RAW_COLUMNS, with_photo_link=True)
tmpl_by_num = sheet_rows(wb['iSellBeer Import Template'], RAW_COLUMNS + ['Corrected Distributor', 'Audit Result', 'Canonical Brand Family'])

records = []
for n, raw in raw_by_num.items():
    t = tmpl_by_num.get(n)
    if t is None:
        continue
    visited = parse_datetime(raw['Date/Time'])
    corrected = (t['Corrected Distributor'] or '').strip().upper() or 'UNVERIFIED'
    raw_status = (t['Distributor'] or '').strip().upper() or 'UNVERIFIED'
    records.append({
        'account': raw['Account #'].strip(),
        'dba': raw['DBA'].strip(),
        'county': raw['Distribution Area'].strip(),
        'address': raw['Address'].strip(),
        'city': raw['City'].strip(),
        'visited': visited.isoformat(),
        'visitedDisplay': visited.strftime('%b %-d, %Y'),
        'rep': parse_rep(raw['Route / Sales Rep']),
        'brand': raw['Brand'].strip(),
        'brandFamily': raw['Brand Family'].strip(),
        'supplier': raw['Supplier'].strip(),
        'taps': num(raw['# of Taps']),
        'status': corrected,
        'flipped': corrected != raw_status,
        'rawStatus': raw_status,
        'reason': audit_reason(t),
        'photo': raw['photo'],
    })

counties = sorted(set(r['county'] for r in records))
reps = sorted(set(r['rep'] for r in records))
accounts = set((r['account'], r['dba']) for r in records)

total_taps = sum(r['taps'] for r in records)
total_us = sum(r['taps'] for r in records if r['status'] == 'US')
total_them = sum(r['taps'] for r in records if r['status'] == 'THEM')
total_unv = total_taps - total_us - total_them
total_flipped = sum(1 for r in records if r['flipped'])
photos_available = len(set(r['account'] for r in records if r['photo']))

payload = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    'photosSource': 'xlsx',
    'counties': counties,
    'reps': reps,
    'summary': {
        'taps': total_taps, 'us': total_us, 'them': total_them, 'unv': total_unv,
        'usPct': round(total_us / total_taps * 100, 1) if total_taps else 0,
        'themPct': round(total_them / total_taps * 100, 1) if total_taps else 0,
        'repCount': len(reps), 'accountCount': len(accounts),
        'photosAvailable': photos_available,
        'flipped': total_flipped,
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

print(f"{len(reps)} reps, {len(accounts)} accounts, {total_taps} taps "
      f"({total_us} ours / {total_them} competitor / {total_unv} unverified)")
print(f"Corrected vs. iSellBeer's own raw flag: {total_flipped} of {len(records)} rows")
print(f"Accounts with a photo on file: {photos_available} of {len(accounts)}")
