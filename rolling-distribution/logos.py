#!/usr/bin/env python3
"""Pull supplier / brand-family logos out of the Fusion workbooks.

    python3 logos.py <Suppliers.xlsx> <BrandFamilies.xlsx> [...]

Files are auto-detected by header: a "Supplier Logo" column -> supplier
logos, a "Brand Family Logo" column -> brand family logos, a "Brand
Logo" column -> brand logos (matched to the "Brand" name). Each embedded
image is matched to the name in column B of the row it is anchored to,
shrunk to fit 220x88 px, and written to assets/logos/<kind>/<slug>.png
(transparency kept) or .jpg. data/logos.js maps names to those paths.
Re-running replaces the logos for names present in the files and keeps
the rest; a name with no image in the file keeps whatever it had.

After the files are read, two fill steps run:
  * a brand family with no logo of its own borrows a brand logo from one
    of its brands (the brand named like the family first, else the first
    brand alphabetically), using brand -> family from
    data/master/products.csv (or the Brands file's own Brand Family col);
  * assets/logos/overrides.json, if present, forces entries, e.g.
      {"family": {"Corona Extra": "supplier:Constellation Brands"}}
    means "use that other logo" (kind:Name), or a plain path to a file.
"""
import io, json, os, re, sys, zipfile, html

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'assets', 'logos')
JS = os.path.join(HERE, 'data', 'logos.js')
MAXW, MAXH = 220, 88
OVERRIDES = os.path.join(OUT, 'overrides.json')
PRODUCTS = os.path.join(HERE, 'data', 'master', 'products.csv')

try:
    from PIL import Image
except ImportError:
    sys.exit('needs Pillow: pip install pillow')


def slug(s):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-') or 'x'


def read_sheet(z):
    names = z.namelist()
    sst = z.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in names else ''
    strings = [html.unescape(re.sub(r'<[^>]+>', '', m)) for m in re.findall(r'<si>(.*?)</si>', sst, re.S)]
    sh = z.read('xl/worksheets/sheet1.xml').decode()
    rows = {}
    for rm in re.finditer(r'<row r="(\d+)"[^>]*>(.*?)</row>', sh, re.S):
        cells = {}
        for cm in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)</v>)?', rm.group(2)):
            col, attrs, v = cm.groups()
            if v is None:
                continue
            cells[col] = strings[int(v)] if 't="s"' in attrs else v
        rows[int(rm.group(1))] = cells
    return rows


def images(z):
    """-> list of (0-based row, media path)"""
    dr = [n for n in z.namelist() if re.match(r'xl/drawings/drawing\d+\.xml$', n)]
    out = []
    for d in dr:
        xml = z.read(d).decode()
        rels = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"',
                               z.read(d.replace('xl/drawings/', 'xl/drawings/_rels/') + '.rels').decode()))
        for row, rid in re.findall(r'<xdr:from>.*?<xdr:row>(\d+)</xdr:row>.*?r:embed="(rId\d+)"', xml, re.S):
            out.append((int(row), 'xl/' + rels[rid].replace('../', '')))
    return out


def shrink(data):
    im = Image.open(io.BytesIO(data))
    im.load()
    has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    im = im.convert('RGBA' if has_alpha else 'RGB')
    im.thumbnail((MAXW * 2, MAXH * 2))  # 2x for sharp rendering
    buf = io.BytesIO()
    if has_alpha:
        im.save(buf, 'PNG', optimize=True); ext = 'png'
    else:
        im.save(buf, 'JPEG', quality=82, optimize=True); ext = 'jpg'
    return buf.getvalue(), ext


def main(files):
    logos = {'supplier': {}, 'family': {}, 'brand': {}}
    brand_family = {}  # brand -> family, from the Brands file and products.csv
    if os.path.exists(JS):
        m = re.search(r'=\s*(\{.*\});?\s*$', open(JS, encoding='utf-8').read(), re.S)
        if m:
            logos.update(json.loads(m.group(1)))
    for f in files:
        z = zipfile.ZipFile(f)
        rows = read_sheet(z)
        hdr = rows.get(1, {})
        kind = 'supplier' if 'Supplier Logo' in hdr.values() else ('family' if 'Brand Family Logo' in hdr.values() else ('brand' if 'Brand Logo' in hdr.values() else None))
        if not kind:
            sys.exit('%s: no "Supplier Logo", "Brand Family Logo" or "Brand Logo" column' % f)
        want = {'supplier': 'Supplier', 'family': 'Brand Family', 'brand': 'Brand'}[kind]
        name_col = [c for c, v in hdr.items() if v == want][0]
        fam_col = [c for c, v in hdr.items() if v == 'Brand Family'] if kind == 'brand' else []
        if fam_col:
            for r, cells in rows.items():
                if r > 1 and cells.get(name_col) and cells.get(fam_col[0]):
                    brand_family[cells[name_col].strip()] = cells[fam_col[0]].strip()
        os.makedirs(os.path.join(OUT, kind), exist_ok=True)
        n = 0; skipped = []
        for row0, media in images(z):
            name = rows.get(row0 + 1, {}).get(name_col, '').strip()
            if not name:
                skipped.append(row0 + 1); continue
            data, ext = shrink(z.read(media))
            fn = slug(name) + '.' + ext
            for old in ('png', 'jpg'):
                p = os.path.join(OUT, kind, slug(name) + '.' + old)
                if os.path.exists(p) and old != ext:
                    os.remove(p)
            with open(os.path.join(OUT, kind, fn), 'wb') as fh:
                fh.write(data)
            logos[kind][name] = 'assets/logos/%s/%s' % (kind, fn)
            n += 1
        print('%-8s %s  logos=%d  (rows without a name: %s)' % (kind.upper(), os.path.basename(f), n, skipped or 'none'))
    # ---- fill: families without a logo borrow one of their brands' logos
    if os.path.exists(PRODUCTS):
        import csv
        for r in csv.DictReader(open(PRODUCTS, newline='', encoding='utf-8')):
            brand_family.setdefault(r['brand'], r['family'])
    fam_brands = {}
    for b, fam in brand_family.items():
        if b in logos['brand']:
            fam_brands.setdefault(fam, []).append(b)
    borrowed = []
    for fam, bl in fam_brands.items():
        if fam in logos['family']:
            continue
        pick = fam if fam in bl else sorted(bl)[0]
        logos['family'][fam] = logos['brand'][pick]
        borrowed.append('%s <- %s' % (fam, pick))
    if borrowed:
        print('FILLED   %d families from brand logos: %s' % (len(borrowed), '; '.join(borrowed)))
    # ---- overrides
    if os.path.exists(OVERRIDES):
        ov = json.load(open(OVERRIDES, encoding='utf-8'))
        for kind, entries in ov.items():
            for name, ref in entries.items():
                if ':' in ref and not ref.startswith('assets/'):
                    k2, n2 = ref.split(':', 1)
                    if n2 not in logos.get(k2, {}):
                        print('WARNING: override %s -> %s: no such %s logo' % (name, ref, k2)); continue
                    logos.setdefault(kind, {})[name] = logos[k2][n2]
                else:
                    logos.setdefault(kind, {})[name] = ref
        print('OVERRIDE %s' % '; '.join('%s: %s -> %s' % (k, n, r) for k, e in ov.items() for n, r in e.items()))
    os.makedirs(os.path.dirname(JS), exist_ok=True)
    with open(JS, 'w', encoding='utf-8') as fh:
        fh.write('// GENERATED by rolling-distribution/logos.py -- do not edit by hand.\nwindow.DIST_LOGOS=' + json.dumps(logos, sort_keys=True) + ';\n')
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print('WROTE    data/logos.js  suppliers=%d families=%d brands=%d  assets/logos %.1f MB' % (len(logos['supplier']), len(logos['family']), len(logos.get('brand', {})), total / 1e6))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    main(sys.argv[1:])
