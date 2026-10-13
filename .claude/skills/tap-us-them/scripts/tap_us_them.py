#!/usr/bin/env python3
"""
tap_us_them.py -- set Distributor (col O) to US / THEM on a block of new rows in
ISB_Raw_Data of the iSellBeer TAPS US/THEM Audit Matrix workbook.

Every rule table is READ FROM THE WORKBOOK at run time (Brand Sell Rules
(Handoff), Brand Crosswalk, Brands (Enc), Customers Table (Enc)); nothing about
brands, families, aliases or counties is hard-coded here.

The workbook is written by editing the sheet XML inside the .xlsx zip, never by
re-saving through openpyxl: the workbook carries dynamic-array formulas (SORT,
UNIQUE, FILTER, MAP, LAMBDA, XLOOKUP, BYROW) that a library re-save would strip.
Only xl/worksheets/<ISB_Raw_Data>.xml, xl/styles.xml and (if a new string is
needed) xl/sharedStrings.xml change; every other zip entry is copied byte for
byte and the script verifies that before it reports success.

Usage:
  tap_us_them.py WORKBOOK.xlsx --rows 6872-7352 --out OUTDIR [--dry-run]
  tap_us_them.py WORKBOOK.xlsx --suggest-range      # where col A last restarts at 1

Outputs (in OUTDIR): <name>_reviewed.xlsx, decisions_log_rows_<a>-<b>.csv,
summary.json; the tally and REVIEW list are printed to stdout.
"""
import argparse, csv, json, os, re, sys, zipfile, collections
import openpyxl

SHEET = 'ISB_Raw_Data'
HANDOFF, CROSSWALK, BRANDS, CUSTOMERS = ('Brand Sell Rules (Handoff)', 'Brand Crosswalk',
                                        'Brands (Enc)', 'Customers Table (Enc)')
# ISB_Raw_Data columns (1-based): B account, D area, K brand, L family, M supplier, O distributor
C_ACCT, C_AREA, C_BRAND, C_FAM, C_SUP, C_OUT = 2, 4, 11, 12, 13, 15
OUT_LETTER = 'O'
FILL_CHANGED = 'FFFFFF00'   # yellow
FILL_REVIEW = 'FFFFC000'    # orange
PLACEHOLDER_SUPPLIER = 'default supplier'


def norm(s):
    """Match ignoring case and extra spaces."""
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s)).strip().casefold()


def cur_value(v):
    return str(v).strip().upper() if v is not None and str(v).strip() else ''


# ----------------------------------------------------------------- rule tables
def load_tables(wb):
    h = wb[HANDOFF]
    hdr = [h.cell(1, c).value for c in range(4, 14)]            # D1:M1
    if any(x is None for x in hdr):
        sys.exit(f'{HANDOFF}!D1:M1 has no cached area names; open and save the workbook in Excel first.')
    area_col = {norm(a): i for i, a in enumerate(hdr)}
    hand_rows, handoff = {}, {}
    for r in range(2, h.max_row + 1):
        fam = h.cell(r, 1).value
        if fam is None or str(fam).strip() == '':
            continue
        hand_rows[r] = {'fam': fam, 'cells': [h.cell(r, c).value for c in range(4, 14)]}
        handoff.setdefault(norm(fam), r)
        aliases = h.cell(r, 2).value
        if aliases:
            for a in str(aliases).split('; '):
                if a.strip():
                    handoff.setdefault(norm(a), r)
    x = wb[CROSSWALK]
    crosswalk = {}
    for r in range(2, x.max_row + 1):
        a = x.cell(r, 1).value
        if a is None or str(a).strip() == '':
            continue
        crosswalk.setdefault(norm(a), (x.cell(r, 3).value, x.cell(r, 6).value))
    b = wb[BRANDS]
    brands = {}
    for r in range(2, b.max_row + 1):
        br = b.cell(r, 3).value
        if br is None or str(br).strip() == '':
            continue
        brands.setdefault(norm(br), b.cell(r, 4).value)
    c = wb[CUSTOMERS]
    customers = {}
    for r in range(2, c.max_row + 1):
        cid = c.cell(r, 1).value
        if cid is None:
            continue
        try:
            cid = int(float(cid))
        except (TypeError, ValueError):
            pass
        customers[cid] = c.cell(r, 9).value
    return dict(hdr=hdr, area_col=area_col, hand_rows=hand_rows, handoff=handoff,
                crosswalk=crosswalk, brands=brands, customers=customers)


# -------------------------------------------------------------------- decide
def decide_row(ws, r, T):
    acct, area = ws.cell(r, C_ACCT).value, ws.cell(r, C_AREA).value
    brand, fam_l, sup = ws.cell(r, C_BRAND).value, ws.cell(r, C_FAM).value, ws.cell(r, C_SUP).value
    cur = ws.cell(r, C_OUT).value
    rec = dict(row=r, acct=acct, area=area, area_used=area, brand=brand, family=fam_l,
               supplier=sup, cur=cur, lookup='', fam_matched='', new='', why='')

    def done(dec, why):
        rec['new'], rec['why'] = dec, why
        return rec

    blank_brand = norm(brand) == '' and norm(fam_l) == ''
    if blank_brand:
        if norm(sup) == PLACEHOLDER_SUPPLIER:
            return done('THEM', 'placeholder line, no brand')
        return done('REVIEW', 'Blank Brand and Brand Family')
    name = fam_l if norm(fam_l) else brand
    rec['lookup'] = name
    if '(IN-HOUSE)' in (str(brand or '') + ' ' + str(sup or '')).upper():
        return done('US', 'In-house brand')
    n = norm(name)
    fam, hr, src = None, None, None
    if n in T['handoff']:
        hr = T['handoff'][n]; fam = T['hand_rows'][hr]['fam']; src = 'Handoff'
    elif n in T['crosswalk']:
        mapped, status = T['crosswalk'][n]
        if norm(status) == 'mapped':
            fam, src = mapped, 'Crosswalk'; hr = T['handoff'].get(norm(mapped))
        elif norm(status) == 'no encompass match':
            return done('THEM', 'Crosswalk: No Encompass Match')
        else:
            rec['why'] = f'Crosswalk status "{status}" ignored; '
    if fam is None and n in T['brands']:
        fam, src = T['brands'][n], 'Brands (Enc)'; hr = T['handoff'].get(norm(fam))
    if fam is None:
        return done('REVIEW', rec['why'] + 'Family not found in Handoff, Crosswalk or Brands (Enc)')
    rec['fam_matched'] = f'{fam} ({src})'
    a = norm(area)
    if a == 'sales':
        try:
            key = int(float(str(acct).strip()))
        except (TypeError, ValueError):
            key = None
        county = T['customers'].get(key)
        if county is None:
            return done('REVIEW', f'Area SALES: account {acct} not in {CUSTOMERS}')
        cn = norm(county)
        if cn in ('morris', 'default'):
            return done('REVIEW', f'Area SALES: county "{county}" cannot be placed')
        a = cn; rec['area_used'] = f'{county} (county of account {acct})'
    if a not in T['area_col']:
        return done('REVIEW', f'Area "{rec["area_used"]}" is not a column on the Handoff sheet')
    if hr is None:
        return done('THEM', f'{fam} ({src}) not on the Handoff sheet')
    label = T['hdr'][T['area_col'][a]]
    cell = T['hand_rows'][hr]['cells'][T['area_col'][a]]
    cs = norm(cell)
    if cs == 'can sell':
        return done('US', f'{fam} / {label}: Can Sell')
    if cs == "can't sell":
        return done('THEM', f"{fam} / {label}: Can't Sell")
    return done('REVIEW', f'Handoff cell for {fam} / {label} reads "{cell}"')


def decide(ws, r0, r1, T):
    out = []
    for r in range(r0, r1 + 1):
        rec = decide_row(ws, r, T)
        cur = cur_value(rec['cur'])
        rec['result'] = ('REVIEW' if rec['new'] == 'REVIEW'
                         else 'unchanged' if rec['new'] == cur
                         else 'changed to ' + rec['new'])
        out.append(rec)
    return out


# ------------------------------------------------------------------ xml edit
def sheet_part(zin):
    wbxml = zin.read('xl/workbook.xml').decode()
    rels = zin.read('xl/_rels/workbook.xml.rels').decode()
    m = re.search(r'<sheet\b[^>]*?name="%s"[^>]*?/?>' % re.escape(SHEET), wbxml)
    if not m:
        sys.exit(f'sheet {SHEET} not found')
    rid = re.search(r'r:id="(rId\d+)"', m.group(0)).group(1)
    rel = next(x for x in re.finditer(r'<Relationship\b[^>]*/?>', rels) if f'Id="{rid}"' in x.group(0))
    target = re.search(r'Target="([^"]+)"', rel.group(0)).group(1)
    return target.lstrip('/') if target.startswith('/') else 'xl/' + target


def shared_string_index(sst, text):
    """Index of <si><t>text</t></si> in sharedStrings.xml, appending it when absent."""
    for i, si in enumerate(re.finditer(r'<si>.*?</si>', sst, re.S)):
        if re.fullmatch(r'<si><t(?: [^>]*)?>%s</t></si>' % re.escape(text), si.group(0)):
            return sst, i
    n = len(re.findall(r'<si>', sst))
    sst = sst.replace('</sst>', f'<si><t>{text}</t></si></sst>')
    sst = re.sub(r'uniqueCount="\d+"', f'uniqueCount="{n + 1}"', sst, count=1)
    sst = re.sub(r'count="(\d+)"', lambda m: f'count="{int(m.group(1)) + 1}"', sst, count=1)
    return sst, n


def add_fill(styles, rgb):
    m = re.search(r'<fills count="(\d+)">(.*?)</fills>', styles, re.S)
    n = int(m.group(1))
    fill = f'<fill><patternFill patternType="solid"><fgColor rgb="{rgb}"/><bgColor indexed="64"/></patternFill></fill>'
    return styles.replace(m.group(0), f'<fills count="{n + 1}">{m.group(2)}{fill}</fills>'), n


def xf_with_fill(xf, fid):
    xf = re.sub(r'fillId="\d+"', f'fillId="{fid}"', xf)
    if 'applyFill=' in xf:
        xf = re.sub(r'applyFill="\d"', 'applyFill="1"', xf)
    else:
        xf = xf.replace('<xf ', '<xf applyFill="1" ', 1)
    return xf


def write_workbook(src, dst, decisions):
    changes = {d['row']: d['new'] for d in decisions if d['result'].startswith('changed')}
    reviews = [d['row'] for d in decisions if d['result'] == 'REVIEW']
    zin = zipfile.ZipFile(src)
    part = sheet_part(zin)
    if not changes and not reviews:            # nothing to write: an exact copy
        with open(dst, 'wb') as f:
            f.write(open(src, 'rb').read())
        return part
    sheet = zin.read(part).decode()
    styles = zin.read('xl/styles.xml').decode()
    sst = zin.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in zin.namelist() else None
    styles, fill_changed = add_fill(styles, FILL_CHANGED)
    styles, fill_review = add_fill(styles, FILL_REVIEW)
    mx = re.search(r'<cellXfs count="(\d+)">(.*?)</cellXfs>', styles, re.S)
    xfs = re.findall(r'<xf\b[^>]*?(?:/>|>.*?</xf>)', mx.group(2), re.S)
    assert len(xfs) == int(mx.group(1)), 'cellXfs count mismatch'
    new_xfs, remap = [], {}

    def cell_match(r):
        m = re.search(r'<c r="%s%d"(?P<attrs>[^>]*?)(?:/>|>(?P<body>.*?)</c>)' % (OUT_LETTER, r), sheet, re.S)
        if not m:
            sys.exit(f'cell {OUT_LETTER}{r} is not in the sheet XML (empty cell); cannot write it')
        return m

    def restyle(r, fid):
        nonlocal sheet
        m = cell_match(r)
        s = int((re.search(r' s="(\d+)"', m.group('attrs')) or [None, '0'])[1])
        if (s, fid) not in remap:
            remap[(s, fid)] = len(xfs) + len(new_xfs)
            new_xfs.append(xf_with_fill(xfs[s], fid))
        return m, remap[(s, fid)]

    for r in sorted(changes):
        m, sidx = restyle(r, fill_changed)
        text = changes[r]
        if sst is not None:
            sst, ssi = shared_string_index(sst, text)
            new = f'<c r="{OUT_LETTER}{r}" s="{sidx}" t="s"><v>{ssi}</v></c>'
        else:
            new = f'<c r="{OUT_LETTER}{r}" s="{sidx}" t="inlineStr"><is><t>{text}</t></is></c>'
        sheet = sheet[:m.start()] + new + sheet[m.end():]
    for r in reviews:
        m, sidx = restyle(r, fill_review)
        attrs = re.sub(r' s="\d+"', '', m.group('attrs'))
        new = f'<c r="{OUT_LETTER}{r}" s="{sidx}"{attrs}' + ('/>' if m.group('body') is None else f'>{m.group("body")}</c>')
        sheet = sheet[:m.start()] + new + sheet[m.end():]
    styles = styles.replace(mx.group(0), '<cellXfs count="%d">%s%s</cellXfs>'
                            % (len(xfs) + len(new_xfs), mx.group(2), ''.join(new_xfs)))
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == part:
                data = sheet.encode()
            elif info.filename == 'xl/styles.xml':
                data = styles.encode()
            elif info.filename == 'xl/sharedStrings.xml' and sst is not None:
                data = sst.encode()
            zout.writestr(info, data)
    return part


def verify(src, dst, part, r0, r1, decisions):
    """Prove nothing outside the processed O cells changed."""
    a, b = zipfile.ZipFile(src), zipfile.ZipFile(dst)
    assert a.namelist() == b.namelist(), 'zip entry list changed'
    allowed = {part, 'xl/styles.xml', 'xl/sharedStrings.xml'}
    differing = [n for n in a.namelist() if a.read(n) != b.read(n)]
    bad = [n for n in differing if n not in allowed]
    assert not bad, f'unexpected parts changed: {bad}'
    expect = {d['row']: d['new'] for d in decisions if d['result'].startswith('changed')}
    diffs = []
    # row-by-row compare of cached values (read_only rows are tuples; pad to the same width)
    rows_a = list(openpyxl.load_workbook(src, data_only=True, read_only=True)[SHEET].iter_rows(values_only=True))
    rows_b = list(openpyxl.load_workbook(dst, data_only=True, read_only=True)[SHEET].iter_rows(values_only=True))
    assert len(rows_a) == len(rows_b), 'row count changed'
    for i, (ra, rb) in enumerate(zip(rows_a, rows_b), start=1):
        w = max(len(ra), len(rb))
        ra, rb = tuple(ra) + (None,) * (w - len(ra)), tuple(rb) + (None,) * (w - len(rb))
        for j in range(w):
            if ra[j] != rb[j]:
                if j + 1 == C_OUT and r0 <= i <= r1 and expect.get(i) == rb[j]:
                    continue
                diffs.append((i, j + 1, ra[j], rb[j]))
    assert not diffs, f'unexpected cell differences: {diffs[:10]}'
    return differing


# ---------------------------------------------------------------------- main
def suggest_range(ws):
    last = None
    for r in range(2, ws.max_row + 1):
        v = ws.cell(r, 1).value
        if v in (1, 1.0, '1'):
            last = r
    return (last, ws.max_row) if last else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('workbook')
    ap.add_argument('--rows', help='first-last row numbers of the new pull in ISB_Raw_Data, e.g. 6872-7352')
    ap.add_argument('--out', help='output directory (default: beside the workbook)')
    ap.add_argument('--dry-run', action='store_true', help='decide and print, write nothing')
    ap.add_argument('--suggest-range', action='store_true', help='print where column A (#) last restarts at 1')
    args = ap.parse_args()

    wb = openpyxl.load_workbook(args.workbook, data_only=True)
    ws = wb[SHEET]
    if args.suggest_range:
        s = suggest_range(ws)
        print(f'Column A (#) last restarts at 1 on row {s[0]}; the sheet ends at row {s[1]}.'
              f' Suggested --rows {s[0]}-{s[1]} (confirm with the user).' if s else 'No row with # = 1 found.')
        return
    if not args.rows:
        ap.error('--rows is required (ask the user for the row range of the new pull)')
    r0, r1 = (int(x) for x in args.rows.split('-'))
    if not (2 <= r0 <= r1 <= ws.max_row):
        ap.error(f'rows must be within 2-{ws.max_row}')
    T = load_tables(wb)
    decisions = decide(ws, r0, r1, T)
    tally = collections.Counter(d['result'] for d in decisions)
    reviews = [d for d in decisions if d['result'] == 'REVIEW']
    changed = [d for d in decisions if d['result'].startswith('changed')]

    print(f'Rows {r0}-{r1}: {len(decisions)} rows')
    for k in ('changed to US', 'changed to THEM', 'unchanged', 'REVIEW'):
        print(f'  {k}: {tally.get(k, 0)}')
    if changed:
        print('CHANGED:')
        for d in changed:
            print(f"  row {d['row']}: {cur_value(d['cur']) or '(blank)'} -> {d['new']} | acct {d['acct']} | {d['area_used']} | {d['brand']} | {d['family']} | {d['why']}")
    print('REVIEW rows:' if reviews else 'REVIEW rows: none')
    for d in reviews:
        print(f"  row {d['row']}: acct {d['acct']} | area {d['area']} | brand {d['brand']!r} | family {d['family']!r} | supplier {d['supplier']!r} | currently {cur_value(d['cur']) or '(blank)'} | {d['why']}")
    if args.dry_run:
        return

    outdir = args.out or os.path.dirname(os.path.abspath(args.workbook))
    os.makedirs(outdir, exist_ok=True)
    base = re.sub(r'\.xlsx$', '', os.path.basename(args.workbook))
    dst = os.path.join(outdir, base + '_reviewed.xlsx')
    part = write_workbook(args.workbook, dst, decisions)
    differing = verify(args.workbook, dst, part, r0, r1, decisions)
    log = os.path.join(outdir, f'decisions_log_rows_{r0}-{r1}.csv')
    with open(log, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Row', 'Account #', 'Distribution Area', 'Area used', 'Brand', 'Brand Family', 'Supplier',
                    'Name looked up', 'Family matched (source)', 'Current O', 'Verdict', 'Result', 'Reason'])
        for d in decisions:
            w.writerow([d['row'], d['acct'], d['area'], d['area_used'], d['brand'], d['family'], d['supplier'],
                        d['lookup'], d['fam_matched'], d['cur'], d['new'], d['result'], d['why']])
    summary = dict(rows=[r0, r1], tally=dict(tally), changed=[d['row'] for d in changed],
                   review=[dict(row=d['row'], acct=d['acct'], why=d['why']) for d in reviews],
                   workbook=dst, log=log, zip_parts_changed=differing)
    with open(os.path.join(outdir, 'summary.json'), 'w') as f:
        json.dump(summary, f, indent=1, default=str)
    print(f'Wrote {dst}\nWrote {log}\nVerified: only {differing} differ inside the .xlsx; '
          f'no cell outside O{r0}:O{r1} changed.')


if __name__ == '__main__':
    main()
