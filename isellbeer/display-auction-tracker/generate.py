#!/usr/bin/env python3
"""
Rebuilds DisplayPhotoReport.csv and the embedded <script id="da-data">
JSON in index.html from a fresh iSellBeer "Report" export (Report_NN.xlsx).

Reconstructed methodology (the source export doesn't document this — it
was reverse-engineered from the previously-committed data and verified
to reproduce identical aggregate totals):

  - One "display" = one photo submission = rows sharing the same
    (Photo Taker, Account #, Date/Time). If a photo logs multiple SKUs,
    their Quantity values are summed into that display's case count.
  - A row's canonical brand is its "Brand Family" column when non-blank,
    else its raw "Brand" column (a handful of brands — Carbliss, Monaco,
    Monaco Cocktails, Sinless RTD, Sun Cruisers RTD — have no Brand
    Family populated in the source export).
  - Each display's canonical brand(s) must all agree on Priority vs. All
    Other classification (mixed-classification displays haven't been
    observed; the script errors out if one appears rather than guess).
  - Tier is by total cases: 0 (<10, non-qualifying), 1 (10-19),
    2 (20-39), 3 (40-69), 4 (70+).
  - Points = TIER_POINTS[classification][tier]. allother/tier1 has never
    been observed in any export to date, so it's deliberately absent —
    the script raises if it's ever needed instead of guessing at a value.
  - Sales Reps and Sales Associates earn on the same point scale.
  - Within a person's display list: sorted by points desc, then cases desc
    (not by date — a date-sort was tried once and explicitly reverted).

Run: python3 generate.py Report_NN.xlsx
"""
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
OUT_CSV = HERE / "DisplayPhotoReport.csv"
OUT_HTML = HERE / "index.html"

PRIORITY_BRANDS = {
    'BLUE MOON', 'CARBLISS', 'CAYMAN JACK', 'COORS', 'COORS LIGHT', 'CORONA', 'CORONA EXTRA',
    'CORONA NON-ALCOHOLIC', 'DOS EQUIS', 'FEVER TREE', 'GARAGE BEER - CONTRACT BREWING',
    'DOGFISH HEAD BREWERY', 'HEINEKEN', "LEINENKUGEL'S", 'MILLER LITE', 'MODELO CERVEZA', 'MODELO CHELADA', 'MODELO ORO', 'MONACO',
    'MONACO COCKTAILS', 'PACIFICO', 'PERONI NASTRO AZZURRO', 'RED STRIPE', 'SAM ADAMS SEASONAL',
    'SAMUEL ADAMS', 'SAPPORO', 'SINLESS RTD', 'SINLESS SPIRITS', 'SUN CRUISER ICED TEA VODKA',
    'SUN CRUISER LEMONADE', 'SUN CRUISERS RTD', 'TRULY', 'TRULY HARD SELTZER',
    'TRULY SEASONAL HARD SELTZER', 'TWISTED TEA', 'WHITE CLAW CLAWTAILS',
    'WHITE CLAW ORIGINAL HARD SELTZER', 'WHITE CLAW SURF HARD SELTZER',
    'WHITE CLAW SURGE HARD SELTZER', 'WHITE CLAW VODKA + SODA', 'YUENGLING BREWERY',
    # Confirmed with the user 2026-07-30.
    'WHITE CLAW ZERO', 'SIMPLY SPIKED LEMONADE',
}
ALLOTHER_BRANDS = {
    'ATHLETIC BREWING COMPANY', 'CARIB BREWERY', 'DELTA THC SELTZER', 'FAMOSA', 'KIRIN',
    'KIRIN ICHIBAN', 'POPSICLE FMB', 'SIERRA NEVADA BREWING COMPANY',
    # Confirmed with the user 2026-07-30.
    'TALKHOUSE ENCORE TEQUILA SODA', 'TALKHOUSE ENCORE VARIETY PACK',
}
# Brand Family aliases -- iSellBeer sometimes tags the same product with an
# inconsistent Brand Family value (e.g. the contract brewer's name instead of
# the beer's own brand family). Confirmed with the user 2026-07-20: BRAXTON
# rows are Garage Beer (Supplier "GARAGE BEER CO.", Brand "GARAGE BEER
# LAGER") mislabeled with the contract brewer's name as Brand Family.
# Confirmed with the user 2026-07-22: "GARAGE BEER" and "SAM ADAMS" are
# shorter Brand Family labels for the same already-classified brands.
# Confirmed with the user 2026-07-23: "YUENGLING" is the same shorter-label
# pattern for "YUENGLING BREWERY".
# Confirmed with the user 2026-07-30: "ATHLETIC BREWING CO" and "CARBLISS
# COCKTAILS" are the same shorter-label pattern for "ATHLETIC BREWING
# COMPANY" and "CARBLISS" respectively.
BRAND_FAMILY_ALIASES = {
    'BRAXTON': 'GARAGE BEER - CONTRACT BREWING',
    'GARAGE BEER': 'GARAGE BEER - CONTRACT BREWING',
    'SAM ADAMS': 'SAMUEL ADAMS',
    'YUENGLING': 'YUENGLING BREWERY',
    'ATHLETIC BREWING CO': 'ATHLETIC BREWING COMPANY',
    'CARBLISS COCKTAILS': 'CARBLISS',
}
TIER_POINTS = {
    'priority': {1: 200, 2: 300, 3: 500, 4: 1000},
    'allother': {2: 200, 3: 300, 4: 600},
}
COLS = ['num', 'taker', 'role', 'dm', 'acct', 'dba', 'address', 'city',
        'supplier', 'brand_family', 'brand', 'sku', 'qty', 'dt', 'photo']


def tier_for(cases):
    if cases >= 70:
        return 4
    if cases >= 40:
        return 3
    if cases >= 20:
        return 2
    if cases >= 10:
        return 1
    return 0


def canonical_brand(row):
    bf = (row['brand_family'] or '').strip()
    brand = bf if bf else (row['brand'] or '').strip()
    return BRAND_FAMILY_ALIASES.get(brand, brand)


def classify(brand):
    if brand in PRIORITY_BRANDS:
        return 'priority'
    if brand in ALLOTHER_BRANDS:
        return 'allother'
    return None


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 generate.py Report_NN.xlsx")
    src = Path(sys.argv[1])

    wb = openpyxl.load_workbook(src, data_only=True)
    ws = wb["Report"]
    rows = []
    for r in range(2, ws.max_row + 1):
        row = {col: ws.cell(row=r, column=i + 1).value for i, col in enumerate(COLS)}
        if not row['taker']:
            continue
        photo_cell = ws.cell(row=r, column=15)
        row['photo_url'] = photo_cell.hyperlink.target if photo_cell.hyperlink else None
        rows.append(row)

    unknown = {canonical_brand(r) for r in rows} - PRIORITY_BRANDS - ALLOTHER_BRANDS
    if unknown:
        raise SystemExit(
            f"Unclassified brand(s) found — add to PRIORITY_BRANDS or ALLOTHER_BRANDS "
            f"in this script after confirming with the user: {sorted(unknown)}"
        )

    # write the plain CSV export (human-diffable, no hyperlinks)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(['#', 'Photo Taker', "Photo Taker's Role", 'District Manager', 'Account #',
                    'DBA', 'Address', 'City', 'Supplier', 'Brand Family', 'Brand', 'SKU',
                    'Quantity', 'Date/Time', 'Photo'])
        for row in rows:
            w.writerow([row['num'], row['taker'], row['role'], row['dm'], row['acct'],
                        row['dba'], row['address'], row['city'], row['supplier'],
                        row['brand_family'] or '', row['brand'], row['sku'], row['qty'],
                        row['dt'], 'Photo'])

    groups = defaultdict(list)
    for row in rows:
        groups[(row['taker'], row['acct'], row['dt'])].append(row)

    people = defaultdict(lambda: {"displays": []})
    dates = []
    total_displays = 0
    total_points = 0

    for (taker, acct, dt), grp in groups.items():
        cases = sum(g['qty'] for g in grp)
        brands = sorted({canonical_brand(g) for g in grp})
        classes = {classify(b) for b in brands}
        if len(classes) > 1:
            raise SystemExit(f"Mixed-classification display for {taker}/{acct}/{dt}: {brands}")
        classification = classes.pop()
        t = tier_for(cases)
        points = TIER_POINTS.get(classification, {}).get(t, 0) if t else 0
        photos = sorted({g['photo_url'] for g in grp if g['photo_url']})
        first = grp[0]
        dates.append(dt.split(' ')[0])
        total_displays += 1
        total_points += points

        p = people[taker]
        p['role'] = first['role']
        p['displays'].append({
            "taker": taker, "role": first['role'], "acct": acct, "dba": first['dba'],
            "city": first['city'], "dt": dt, "cases": cases, "classification": classification,
            "tier": t, "points": points, "brands": brands, "photos": photos,
        })

    people_out = []
    for name, p in people.items():
        displays = sorted(p['displays'], key=lambda d: (-d['points'], -d['cases'], d['dt']))
        qualifying = [d for d in displays if d['tier'] >= 1]
        people_out.append({
            "name": name,
            "role": p['role'],
            "points": sum(d['points'] for d in displays),
            "qualifying": len(qualifying),
            "total": len(displays),
            "priorityQualifying": len([d for d in qualifying if d['classification'] == 'priority']),
            "otherQualifying": len([d for d in qualifying if d['classification'] == 'allother']),
            "displays": displays,
        })
    people_out.sort(key=lambda p: -p['points'])

    data = {
        "meta": {
            "startDate": min(dates),
            "endDate": max(dates),
            "totalDisplays": total_displays,
            "totalPoints": total_points,
        },
        "people": people_out,
    }

    html = OUT_HTML.read_text()
    tag_open = '<script id="da-data" type="application/json">'
    if tag_open not in html:
        raise SystemExit("Could not find da-data script tag in index.html")
    new_html = re.sub(
        r'(<script id="da-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + json.dumps(data) + m.group(2),
        html,
        flags=re.DOTALL,
    )
    OUT_HTML.write_text(new_html)
    print(f"Wrote {total_displays} displays ({sum(1 for p in people_out for d in p['displays'] if d['tier']>=1)} qualifying), "
          f"{total_points} total points across {len(people_out)} people.")
    print(f"Date range: {min(dates)} to {max(dates)}")


if __name__ == "__main__":
    main()
