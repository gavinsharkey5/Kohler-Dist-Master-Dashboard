#!/usr/bin/env python3
"""
Rebuilds the embedded data in index.html: a top-line, phone-friendly summary
of our tap-handle share vs. competitors', for the head of the company (not
the reps -- see ../tap-survey-tracking/ for the rep-facing drill-down that
this reuses raw data from, but does not modify).

Inputs (keep these filenames when refreshing):
  iSellBeer_TAPS_US_THEM_Audit_Matrix.xlsx
      Same shape as ../tap-survey-tracking/'s mediator workbook (see that
      folder's README for the full sheet-by-sheet explanation) -- one row per
      surveyed tap handle, joined against the audit engine's Corrected
      Distributor (US/THEM) ruling. Also reads its "Brand Crosswalk" sheet
      (Report Brand Family -> Mapped Encompass Brand Family) to connect tap
      brand families to the Encompass units-sold export below.
  encompass_units_sold.csv
      RDE "iSellBeer TAPS Exec Overview" export: Customer Num, Customer Name,
      Area, Shipping Address, City, Date, Sales Rep Name, District Manager
      Name, Brand, Brand Family, Supplier, Units <year>. Used only for the
      velocity section -- units sold, at the same accounts we have a tap
      survey for, per our own brand families (Encompass only carries OUR
      sales, so this can never cover competitor brands).

"# of Taps" (not row count) is what's summed for every tally here, same
convention as ../tap-survey-tracking/ -- an account with 3 handles of one
brand counts as 3 taps, not 1 row.

Distribution-area data-quality fix (per Kohler, 2026-07-30): three area
labels in the source aren't real distribution areas --
  - "Passaic-FF" is folded into "Passaic" (same area, different label).
  - "Sales" is a placeholder for rows that were never assigned a real area --
    every one is re-assigned here from its City (majority-vote against every
    correctly-labeled row sharing that city), falling back to Address for a
    handful of cities that don't appear anywhere else in the export (Old
    Tappan and Ridgefield -> Bergen, Passaic city -> Passaic area -- all
    well-established NJ municipalities, not a judgment call).
  - "Morris 2" is left alone -- it's a real area, just not one of Kohler's
    named core-market or non-focus areas, so it surfaces in its own small
    "Other Areas" bucket rather than being folded into Morris 1/3.

Run: python3 generate.py
"""
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

HERE = Path(__file__).parent
XLSX_PATH = HERE / "iSellBeer_TAPS_US_THEM_Audit_Matrix.xlsx"
UNITS_CSV = HERE / "encompass_units_sold.csv"
HTML = HERE / "index.html"

RAW_COLUMNS = ['#', 'Account #', 'DBA', 'Distribution Area', 'Address', 'City', 'Date/Time',
               'Route / Sales Rep', 'District Manager', 'Brand', 'Brand Family', 'Supplier',
               '# of Taps', 'Distributor']

# Per Kohler, 2026-07-30.
CORE_AREAS = ['BERGEN', 'SUSSEX', 'PASSAIC', 'MORRIS 1', 'MORRIS 3']
NON_FOCUS_AREAS = ['ESSEX', 'HUDSON', 'UNION']
# Manually-known NJ municipalities for the handful of "Sales"-labeled rows
# whose city doesn't appear anywhere else in the export with a real area.
CITY_AREA_FALLBACK = {'OLD TAPPAN': 'BERGEN', 'RIDGEFIELD': 'BERGEN', 'PASSAIC': 'PASSAIC'}
TOP_N_BRANDS = 8
TOP_N_AREA_BRANDS = 5


def find_raw_sheet(wb):
    for name in wb.sheetnames:
        header = [c.value for c in wb[name][1]]
        if 'Account #' in header and 'Route / Sales Rep' in header and 'Corrected Distributor' not in header:
            return wb[name]
    raise SystemExit("Could not find the raw tap-survey sheet")


def sheet_rows(ws, columns):
    header = [c.value for c in ws[1]]
    col_idx = {name: header.index(name) for name in columns}
    out = {}
    for r in ws.iter_rows(min_row=2):
        num_cell = r[col_idx['#']]
        if num_cell.value in (None, ''):
            continue
        row = {c: ('' if r[col_idx[c]].value is None else str(r[col_idx[c]].value)) for c in columns}
        out[str(int(float(num_cell.value)))] = row
    return out


def num(s):
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 1


def pct(part, whole):
    return round(part / whole * 100, 1) if whole else 0.0


# ---------- load tap survey ----------
wb = load_workbook(XLSX_PATH, data_only=True)
raw_by_num = sheet_rows(find_raw_sheet(wb), RAW_COLUMNS)
tmpl_by_num = sheet_rows(wb['iSellBeer Import Template'], RAW_COLUMNS + ['Corrected Distributor'])

records = []
for n, raw in raw_by_num.items():
    t = tmpl_by_num.get(n)
    if t is None or not raw['Route / Sales Rep'].strip():
        continue
    area = raw['Distribution Area'].strip().upper()
    if area == 'PASSAIC-FF':
        area = 'PASSAIC'
    corrected = (t['Corrected Distributor'] or '').strip().upper() or 'UNVERIFIED'
    records.append({
        'account': raw['Account #'].strip(),
        'dba': raw['DBA'].strip(),
        'area': area,
        'city': raw['City'].strip().upper(),
        'address': raw['Address'].strip().upper(),
        'brand': raw['Brand'].strip(),
        'brandFamily': raw['Brand Family'].strip().upper(),
        'supplier': raw['Supplier'].strip(),
        'taps': num(raw['# of Taps']),
        'status': corrected,
    })

# ---------- fix the "Sales" placeholder area via city majority-vote ----------
city_area_votes = defaultdict(Counter)
for r in records:
    if r['area'] and r['area'] != 'SALES':
        city_area_votes[r['city']][r['area']] += 1

unresolved_cities = set()
for r in records:
    if r['area'] == 'SALES':
        votes = city_area_votes.get(r['city'])
        if votes:
            r['area'] = votes.most_common(1)[0][0]
        elif r['city'] in CITY_AREA_FALLBACK:
            r['area'] = CITY_AREA_FALLBACK[r['city']]
        else:
            unresolved_cities.add(r['city'])
            r['area'] = 'UNASSIGNED'
if unresolved_cities:
    print(f"WARNING: could not resolve area for city/cities (left as UNASSIGNED): {sorted(unresolved_cities)}")

area_group = {}
for a in CORE_AREAS:
    area_group[a] = 'core'
for a in NON_FOCUS_AREAS:
    area_group[a] = 'nonFocus'


def group_of(area):
    return area_group.get(area, 'other')


# ---------- top-line summary ----------
# Per Kohler, 2026-07-30: the headline numbers (hero + brand breakdown) are
# scoped to the core market only, since that's what the manager actually
# cares about day to day -- company-wide totals are kept as a smaller
# reference figure (see companyWide below) rather than dropped, so nothing's
# hidden, just de-emphasized.
def summarize(rows):
    taps = sum(r['taps'] for r in rows)
    us = sum(r['taps'] for r in rows if r['status'] == 'US')
    them = sum(r['taps'] for r in rows if r['status'] == 'THEM')
    return {
        'totalTaps': taps, 'usTaps': us, 'themTaps': them, 'unverifiedTaps': taps - us - them,
        'usPct': pct(us, taps), 'themPct': pct(them, taps),
        'accountsSurveyed': len(set(r['account'] for r in rows)),
    }


core_records = [r for r in records if group_of(r['area']) == 'core']
summary = summarize(core_records)
company_wide = summarize(records)


# ---------- brand mix (top N + Other), each side -- core market only ----------
def brand_breakdown(status, top_n, rows):
    totals = defaultdict(int)
    for r in rows:
        if r['status'] == status:
            totals[r['brandFamily']] += r['taps']
    side_total = sum(totals.values())
    ranked = sorted(totals.items(), key=lambda kv: -kv[1])
    top = ranked[:top_n]
    other_taps = sum(t for _, t in ranked[top_n:])
    other_count = len(ranked) - len(top)
    return {
        'total': side_total,
        'top': [{'brand': b.title(), 'taps': t, 'pct': pct(t, side_total)} for b, t in top],
        'other': {'taps': other_taps, 'pct': pct(other_taps, side_total), 'brandCount': other_count},
    }


brands_us = brand_breakdown('US', TOP_N_BRANDS, core_records)
brands_them = brand_breakdown('THEM', TOP_N_BRANDS, core_records)


# ---------- full brand totals, core market (for the pie-chart brand picker) ----------
def all_brand_totals(status, rows):
    totals = defaultdict(int)
    for r in rows:
        if r['status'] == status:
            totals[r['brandFamily']] += r['taps']
    side_total = sum(totals.values())
    ranked = sorted(totals.items(), key=lambda kv: -kv[1])
    return [{'brand': b.title(), 'taps': t, 'pct': pct(t, side_total)} for b, t in ranked]


all_brands_us = all_brand_totals('US', core_records)
all_brands_them = all_brand_totals('THEM', core_records)


# ---------- by area ----------
def area_summary(area_name):
    rows = [r for r in records if r['area'] == area_name]
    taps = sum(r['taps'] for r in rows)
    us = sum(r['taps'] for r in rows if r['status'] == 'US')
    them = sum(r['taps'] for r in rows if r['status'] == 'THEM')
    return rows, {
        'area': area_name.title(), 'totalTaps': taps, 'usTaps': us, 'themTaps': them,
        'usPct': pct(us, taps), 'themPct': pct(them, taps),
    }


def top_brands_in(rows, status, top_n):
    totals = defaultdict(int)
    for r in rows:
        if r['status'] == status:
            totals[r['brandFamily']] += r['taps']
    ranked = sorted(totals.items(), key=lambda kv: -kv[1])
    return [{'brand': b.title(), 'taps': t} for b, t in ranked[:top_n]]


core_areas_out = []
for a in CORE_AREAS:
    rows, s = area_summary(a)
    s['topUs'] = top_brands_in(rows, 'US', TOP_N_AREA_BRANDS)
    s['topThem'] = top_brands_in(rows, 'THEM', TOP_N_AREA_BRANDS)
    core_areas_out.append(s)

non_focus_areas_out = [area_summary(a)[1] for a in NON_FOCUS_AREAS]

other_area_names = sorted({r['area'] for r in records if group_of(r['area']) == 'other' and r['area'] != 'UNASSIGNED'})
other_areas_out = [area_summary(a)[1] for a in other_area_names]
unassigned_rows, unassigned_summary = area_summary('UNASSIGNED')
if unassigned_summary['totalTaps']:
    other_areas_out.append(unassigned_summary)


# ---------- brand lookup: any brand family's handle share, in every area ----------
# Combines US + THEM taps for the same brand-family text (a handful of brands,
# e.g. Blue Moon, show up on both sides at different accounts -- this answers
# "how much of this brand is out there in area X", not "how much do we
# specifically get credit for"). Covers every area, not just the core market,
# since this is a lookup tool, not the headline framing above.
area_total_taps = {}
area_group_label = {}
for grp, out_list in (('core', core_areas_out), ('nonFocus', non_focus_areas_out), ('other', other_areas_out)):
    for a in out_list:
        area_total_taps[a['area']] = a['totalTaps']
        area_group_label[a['area']] = grp

brand_area_taps = defaultdict(lambda: defaultdict(int))
brand_side_taps = defaultdict(lambda: {'US': 0, 'THEM': 0})
for r in records:
    if r['area'] == 'UNASSIGNED':
        continue
    area_title = r['area'].title()
    brand_area_taps[r['brandFamily']][area_title] += r['taps']
    if r['status'] in ('US', 'THEM'):
        brand_side_taps[r['brandFamily']][r['status']] += r['taps']

brand_lookup = []
for bf, area_map in brand_area_taps.items():
    sides = brand_side_taps[bf]
    side = 'US' if sides['US'] >= sides['THEM'] else 'THEM'
    total = sum(area_map.values())
    by_area = [
        {'area': area_title, 'group': area_group_label.get(area_title, 'other'), 'taps': taps,
         'areaTotal': area_total_taps.get(area_title, 0), 'pct': pct(taps, area_total_taps.get(area_title, 0))}
        for area_title, taps in sorted(area_map.items(), key=lambda kv: -kv[1])
    ]
    brand_lookup.append({'brand': bf.title(), 'side': side, 'totalTaps': total, 'byArea': by_area})
brand_lookup.sort(key=lambda b: -b['totalTaps'])


# ---------- velocity: join tap brands (US only) to Encompass units sold ----------
# Encompass only ever carries OUR sales, so velocity is only ever computable
# for our own (US) brand families -- there is no Encompass record of what a
# competitor sold through a handle we don't own.
crosswalk = {}
cw = wb['Brand Crosswalk']
cw_header = [c.value for c in cw[1]]
cw_idx = {h: i for i, h in enumerate(cw_header)}
for r in cw.iter_rows(min_row=2, values_only=True):
    rb = (r[cw_idx['Report Brand Family']] or '').strip().upper()
    mapped = r[cw_idx['Mapped Encompass Brand Family']]
    if rb:
        crosswalk[rb] = mapped.strip().upper() if mapped else None

units_rows = []
with open(UNITS_CSV, newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    units_col = next(c for c in reader.fieldnames if c.startswith('Units'))
    for row in reader:
        units_rows.append({
            'account': row['Customer Num'].strip(),
            'brandFamily': row['Brand Family'].strip().upper(),
            'supplier': row['Supplier'].strip().upper(),
            'units': float(row[units_col] or 0),
        })

units_bf_set = {u['brandFamily'] for u in units_rows}
units_by_account_bf = defaultdict(float)
units_by_account_supplier = defaultdict(float)
for u in units_rows:
    units_by_account_bf[(u['account'], u['brandFamily'])] += u['units']
    units_by_account_supplier[(u['account'], u['supplier'])] += u['units']

tap_accounts = {r['account'] for r in records}
units_accounts = {u['account'] for u in units_rows}
matched_accounts = tap_accounts & units_accounts


def resolve_encompass_key(brand_family):
    """Returns ('bf', name) or ('supplier', name) or None."""
    if brand_family in units_bf_set:
        return ('bf', brand_family)
    mapped = crosswalk.get(brand_family)
    if mapped:
        if mapped in units_bf_set:
            return ('bf', mapped)
        mapped_upper = mapped.upper()
        if any(u['supplier'] == mapped_upper for u in units_rows):
            return ('supplier', mapped_upper)
    return None


velocity_brands = []
velocity_unmatched = []
for entry in brands_us['top']:
    brand_family = entry['brand'].upper()
    key = resolve_encompass_key(brand_family)
    if key is None:
        velocity_unmatched.append(entry['brand'])
        continue
    kind, name = key
    matched_taps = sum(r['taps'] for r in records
                        if r['brandFamily'] == brand_family and r['status'] == 'US' and r['account'] in matched_accounts)
    if kind == 'bf':
        matched_units = sum(units_by_account_bf[(a, name)] for a in matched_accounts)
    else:
        matched_units = sum(units_by_account_supplier[(a, name)] for a in matched_accounts)
    velocity_brands.append({
        'brand': entry['brand'],
        'matchedTaps': matched_taps,
        'unitsSold': round(matched_units, 1),
        'unitsPerTap': round(matched_units / matched_taps, 2) if matched_taps else None,
    })

velocity = {
    'accountsSurveyed': len(tap_accounts),
    'accountsMatched': len(matched_accounts),
    'brands': velocity_brands,
    'unmatchedBrands': velocity_unmatched,
}

payload = {
    'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    'summary': summary,
    'companyWide': company_wide,
    'brandsUs': brands_us,
    'brandsThem': brands_them,
    'allBrandsUs': all_brands_us,
    'allBrandsThem': all_brands_them,
    'brandLookup': brand_lookup,
    'areas': {'core': core_areas_out, 'nonFocus': non_focus_areas_out, 'other': other_areas_out},
    'velocity': velocity,
}

data_json = json.dumps(payload, separators=(',', ':'))
html = HTML.read_text(encoding='utf-8')
new_html, n = re.subn(
    r'(<script id="exec-data" type="application/json">).*?(</script>)',
    lambda m: m.group(1) + data_json + m.group(2),
    html, count=1, flags=re.S,
)
assert n == 1, 'exec-data script tag not found in index.html'
HTML.write_text(new_html, encoding='utf-8')

print(f"CORE MARKET: {summary['totalTaps']} taps at {summary['accountsSurveyed']} accounts: "
      f"{summary['usTaps']} ours ({summary['usPct']}%) / {summary['themTaps']} competitor ({summary['themPct']}%)")
print(f"  by area: {', '.join(a['area'] + ' ' + str(a['totalTaps']) for a in core_areas_out)}")
print(f"Company-wide (reference only): {company_wide['totalTaps']} taps, "
      f"{company_wide['usPct']}% ours / {company_wide['themPct']}% competitor")
print(f"Velocity: {len(velocity_brands)}/{TOP_N_BRANDS} top brands matched to Encompass "
      f"({len(matched_accounts)}/{len(tap_accounts)} accounts have a units-sold record)")
if velocity_unmatched:
    print(f"  No Encompass mapping found for: {velocity_unmatched}")
