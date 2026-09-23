#!/usr/bin/env python3
"""Rolling Distribution Tracker -- merge Fusion exports into the master
dataset and build data/dist_data.js for index.html.

    python3 generate.py <export.csv> [<export.csv> ...]
    python3 generate.py --build          # rebuild dist_data.js from master only

Every file is auto-detected by its header:

  DETAIL   Supplier, Brand Family, Brand, Product Num & Name, Customer Num
           Name, On Premise, Shipping Address, County, Distribution Area,
           then Buyer Count / Placement Count / Cases per YYYY/M.
           One row = one product at one account. Each month the export
           covers REPLACES that month in data/master/months/ in full (a
           re-exported month is a restatement, never a top-up), months it
           does not cover are untouched. This is what stops double counting
           when exports overlap.
  PRODUCT  Product Num & Name, Package, (monthly totals ignored)
           -> package per product in data/master/products.csv
  CUSTOMER Customer Num & Company, Sales Rep Assigned, District Manager,
           (monthly totals ignored)
           -> rep / DM per account in data/master/customers.csv
  SUPPLIER Supplier ID, Supplier, <brand manager column> (Fusion labels
           it "License Number"; the third column is taken as the brand
           manager) -> data/master/suppliers.csv
  TERRITORY Brand Family, Territory, then one column per Encompass area
           (BERGEN, PASSAIC, PASSAIC-FF, ESSEX, HUDSON, UNION, SUSSEX,
           MORRIS 1, MORRIS 2, MORRIS 3) holding "Can Sell" / "Can't Sell"
           -- the Brand_Selling_Restrictions workbook (.xlsx or .csv).
           -> data/master/territory.csv, one row per brand family with the
           areas it may be sold in. The page uses it to keep each brand's
           account universe (and its placements) to those areas; a family
           not in the file is treated as sellable everywhere.
  MONEY    Customer Num & Company, Product Num & Name, then Laid-In Cost /
           $Vol / Gross per YYYY/M (Fusion's cost, revenue and gross profit
           export at the same product x account x month grain). Each month
           REPLACES data/master/money/YYYY-MM.csv in full, like a detail
           month. Rows for Fusion's internal accounts (5 Inventory
           Adjustment, 7 Breakage, 8 Out Of Code, 9 Fifo Adjustment, 25
           Repack, 120022 Samples...) are KEPT -- they are not customers,
           but "8 Out Of Code" per product is the out-of-code cost the
           quality tab otherwise lacks. All-zero rows are dropped.

Dimension attributes (names, supplier, family, brand, premise, area, rep,
DM, package) are "latest file wins": the attributes of a product or account
are whatever the newest export said, applied to all of its history.

A month whose calendar month equals the export's own date (from the
Fusion_..._YYYYMMDD_ filename, else the file's mtime) is flagged PARTIAL in
data/master/sources.json and labelled on the page. Pass --complete to
override when you know the month was closed.
"""
import csv, json, os, re, sys, glob, datetime, collections

HERE = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(HERE, 'data', 'master')
MONTHS_DIR = os.path.join(MASTER, 'months')
PRODUCTS_CSV = os.path.join(MASTER, 'products.csv')
CUSTOMERS_CSV = os.path.join(MASTER, 'customers.csv')
SUPPLIERS_CSV = os.path.join(MASTER, 'suppliers.csv')
SOURCES_JSON = os.path.join(MASTER, 'sources.json')
OUT_JS = os.path.join(HERE, 'data', 'dist_data.js')
OUT_META = os.path.join(HERE, 'data', 'sync_meta.json')

PRODUCT_FIELDS = ['product_num', 'name', 'supplier', 'family', 'brand', 'package']
CUSTOMER_FIELDS = ['customer_num', 'name', 'premise', 'address', 'county', 'area', 'rep', 'dm']
SUPPLIER_FIELDS = ['supplier', 'supplier_id', 'brand_manager']
TERRITORY_CSV = os.path.join(MASTER, 'territory.csv')
MONEY_DIR = os.path.join(MASTER, 'money')
MONEY_RE = re.compile(r'^(Laid-In Cost|\$Vol|Gross)\s+(\d{4})/(\d{1,2})$')
TERRITORY_FIELDS = ['family', 'territory', 'can_sell', 'cant_sell', 'source']
METRIC_RE = re.compile(r'^(Buyer Count|Placement Count|Cases)\s+(\d{4})/(\d{1,2})$')


def die(msg):
    sys.exit('ERROR: ' + msg)


def split_num(s):
    """'2809 Modelo Especial 1/24/12 oz Loose Can' -> ('2809', 'Modelo ...')."""
    s = s.strip()
    m = re.match(r'^(\d+)\s+(.*)$', s)
    if not m:
        die('cannot split number from name: %r' % s)
    return m.group(1), m.group(2).strip()


def num(v):
    v = (v or '').strip()
    return float(v) if v else None


def month_key(y, m):
    return '%04d-%02d' % (int(y), int(m))


def export_date(path):
    m = re.search(r'_(\d{4})(\d{2})(\d{2})_', os.path.basename(path))
    if m:
        return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return datetime.date.fromtimestamp(os.path.getmtime(path))


# ---------------------------------------------------------------- master I/O

def load_dim(path, fields, key):
    out = {}
    if os.path.exists(path):
        with open(path, newline='', encoding='utf-8') as fh:
            for r in csv.DictReader(fh):
                out[r[key]] = {f: r.get(f, '') for f in fields}
    return out


def save_dim(path, fields, rows):
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for k in sorted(rows, key=lambda s: (len(s), s)):
            w.writerow(rows[k])


def load_sources():
    if os.path.exists(SOURCES_JSON):
        with open(SOURCES_JSON, encoding='utf-8') as fh:
            return json.load(fh)
    return {}


def month_path(mk):
    return os.path.join(MONTHS_DIR, mk + '.csv')


def read_month(mk):
    """-> {(product_num, customer_num): (buyer, cases)}"""
    out = {}
    p = month_path(mk)
    if os.path.exists(p):
        with open(p, newline='', encoding='utf-8') as fh:
            for r in csv.DictReader(fh):
                out[(r['product_num'], r['customer_num'])] = (int(r['buyer']), float(r['cases']))
    return out


def write_month(mk, cells):
    with open(month_path(mk), 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['product_num', 'customer_num', 'buyer', 'cases'])
        for (pn, cn) in sorted(cells, key=lambda k: (len(k[0]), k[0], len(k[1]), k[1])):
            b, c = cells[(pn, cn)]
            w.writerow([pn, cn, b, ('%.2f' % c).rstrip('0').rstrip('.') if c else '0'])


# ---------------------------------------------------------------- ingest

def detect(hdr):
    h = [x.strip() for x in hdr]
    if 'Product Num & Name' in h and 'Customer Num Name' in h:
        return 'detail'
    if 'Product Num & Name' in h and 'Package' in h:
        return 'product'
    if 'Customer Num & Company' in h and 'Sales Rep Assigned' in h:
        return 'customer'
    if 'Supplier ID' in h and 'Supplier' in h:
        return 'supplier'
    if 'Brand Family' in h and 'Territory' in h:
        return 'territory'
    if 'Customer Num & Company' in h and 'Product Num & Name' in h and any(MONEY_RE.match(x) for x in h):
        return 'money'
    die('unrecognised header: %s' % h[:6])


def metric_cols(hdr):
    """-> {month_key: {'Buyer Count': idx, 'Placement Count': idx, 'Cases': idx}}"""
    out = collections.defaultdict(dict)
    for i, h in enumerate(hdr):
        m = METRIC_RE.match(h.strip())
        if m:
            mk = month_key(m.group(2), m.group(3))
            if m.group(1) in out[mk]:
                die('duplicate column %r -- the export has the same month twice' % h)
            out[mk][m.group(1)] = i
    return out


def ingest_detail(path, products, customers, sources, complete):
    with open(path, newline='', encoding='utf-8-sig') as fh:
        r = csv.reader(fh)
        hdr = [x.strip() for x in next(r)]
        col = {h: i for i, h in enumerate(hdr)}
        for need in ['Supplier', 'Brand Family', 'Brand', 'Product Num & Name', 'Customer Num Name',
                     'On Premise', 'Shipping Address', 'County', 'Distribution Area']:
            if need not in col:
                die('%s: missing column %s' % (path, need))
        mcols = metric_cols(hdr)
        if not mcols:
            die('%s: no Buyer Count / Cases YYYY/M columns' % path)
        months = sorted(mcols)
        new = {mk: {} for mk in months}
        nrows = 0
        for x in r:
            if not any(v.strip() for v in x):
                continue
            nrows += 1
            pn, pname = split_num(x[col['Product Num & Name']])
            cn, cname = split_num(x[col['Customer Num Name']])
            products[pn] = dict(products.get(pn, {f: '' for f in PRODUCT_FIELDS}),
                                product_num=pn, name=pname, supplier=x[col['Supplier']].strip(),
                                family=x[col['Brand Family']].strip(), brand=x[col['Brand']].strip())
            prem = x[col['On Premise']].strip()
            customers[cn] = dict(customers.get(cn, {f: '' for f in CUSTOMER_FIELDS}),
                                 customer_num=cn, name=cname,
                                 premise='On' if prem.lower().startswith('on') else 'Off',
                                 address=x[col['Shipping Address']].strip(), county=x[col['County']].strip(),
                                 area=x[col['Distribution Area']].strip())
            for mk in months:
                c = mcols[mk]
                b = num(x[c['Buyer Count']]) if 'Buyer Count' in c else None
                cs = num(x[c['Cases']]) if 'Cases' in c else None
                if b is None and cs is None:
                    continue
                b = 1 if (b or 0) > 0 else 0
                cs = cs or 0.0
                if b == 0 and cs == 0:
                    continue
                if (pn, cn) in new[mk]:
                    die('%s: duplicate product/customer row %s / %s' % (path, pn, cn))
                new[mk][(pn, cn)] = (b, cs)
    exp = export_date(path)
    print('DETAIL   %s  rows=%d  months=%s..%s' % (os.path.basename(path), nrows, months[0], months[-1]))
    for mk in months:
        old = read_month(mk)
        cells = new[mk]
        ob = sum(v[0] for v in old.values()); oc = sum(v[1] for v in old.values())
        nb = sum(v[0] for v in cells.values()); nc = sum(v[1] for v in cells.values())
        partial = (not complete) and mk == exp.strftime('%Y-%m')
        if old:
            same = sum(1 for k, v in cells.items() if k in old and old[k] == v)
            print('   %s  RESTATED  placements %d -> %d  cases %.0f -> %.0f  (%d of %d cells unchanged, %d dropped)%s'
                  % (mk, ob, nb, oc, nc, same, len(old), sum(1 for k in old if k not in cells),
                     '  PARTIAL' if partial else ''))
        else:
            print('   %s  new       placements %d  cases %.0f%s' % (mk, nb, nc, '  PARTIAL' if partial else ''))
        write_month(mk, cells)
        sources[mk] = {'file': os.path.basename(path), 'exported': exp.isoformat(),
                       'rows': len(cells), 'placements': nb, 'cases': round(nc, 2), 'partial': partial,
                       'loaded': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}


def ingest_product(path, products):
    n = 0; new = 0
    with open(path, newline='', encoding='utf-8-sig') as fh:
        r = csv.reader(fh)
        hdr = [x.strip() for x in next(r)]
        col = {h: i for i, h in enumerate(hdr)}
        for x in r:
            if not any(v.strip() for v in x):
                continue
            pn, pname = split_num(x[col['Product Num & Name']])
            if pn not in products:
                products[pn] = {f: '' for f in PRODUCT_FIELDS}; products[pn]['product_num'] = pn; new += 1
            products[pn]['name'] = pname
            products[pn]['package'] = x[col['Package']].strip()
            n += 1
    print('PRODUCT  %s  rows=%d  (%d products not yet in any detail export)' % (os.path.basename(path), n, new))


def ingest_customer(path, customers):
    n = 0; new = 0
    with open(path, newline='', encoding='utf-8-sig') as fh:
        r = csv.reader(fh)
        hdr = [x.strip() for x in next(r)]
        col = {h: i for i, h in enumerate(hdr)}
        for x in r:
            if not any(v.strip() for v in x):
                continue
            cn, cname = split_num(x[col['Customer Num & Company']])
            if cn not in customers:
                customers[cn] = {f: '' for f in CUSTOMER_FIELDS}; customers[cn]['customer_num'] = cn; new += 1
            customers[cn]['name'] = cname
            customers[cn]['rep'] = x[col['Sales Rep Assigned']].strip()
            customers[cn]['dm'] = x[col['District Manager']].strip() if 'District Manager' in col else customers[cn].get('dm', '')
            n += 1
    print('CUSTOMER %s  rows=%d  (%d accounts not yet in any detail export)' % (os.path.basename(path), n, new))


def ingest_supplier(path, suppliers):
    n = 0
    with open(path, newline='', encoding='utf-8-sig') as fh:
        r = csv.reader(fh)
        hdr = [x.strip() for x in next(r)]
        col = {h: i for i, h in enumerate(hdr)}
        # the brand-manager column is whatever is not the id / name column
        bm_col = [i for i, h in enumerate(hdr) if h not in ('Supplier ID', 'Supplier')]
        if not bm_col:
            die('%s: no brand manager column' % path)
        bm_col = bm_col[0]
        for x in r:
            if not any(v.strip() for v in x):
                continue
            name = x[col['Supplier']].strip()
            if not name:
                continue
            suppliers[name] = {'supplier': name, 'supplier_id': x[col['Supplier ID']].strip(),
                               'brand_manager': x[bm_col].strip()}
            n += 1
    print('SUPPLIER %s  rows=%d  (column %r read as brand manager)' % (os.path.basename(path), n, hdr[bm_col]))


def read_rows(path):
    """Rows of a .csv or the first sheet of an .xlsx, as lists of strings."""
    if path.lower().endswith('.xlsx'):
        try:
            import openpyxl
        except ImportError:
            die('%s: reading .xlsx needs openpyxl (pip install openpyxl) -- or save the sheet as CSV' % path)
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        return [['' if v is None else str(v) for v in row] for row in ws.iter_rows(values_only=True)]
    with open(path, newline='', encoding='utf-8-sig') as fh:
        return list(csv.reader(fh))


def area_key(name):
    return re.sub(r'\s+', ' ', name.strip()).upper()


def ingest_territory(path, territory):
    rows = read_rows(path)
    hdr = [x.strip() for x in rows[0]]
    col = {h: i for i, h in enumerate(hdr)}
    fam_c, terr_c = col['Brand Family'], col['Territory']
    area_cols = []
    for i, h in enumerate(hdr):
        if i <= terr_c or not h or h.startswith('#') or h in ('Can Sell In', "Can't Sell In", 'Rule Source'):
            continue
        area_cols.append((i, h))
    if not area_cols:
        die('%s: no area columns after Territory' % path)
    src_c = col.get('Rule Source')
    n = 0
    for x in rows[1:]:
        if fam_c >= len(x) or not x[fam_c].strip():
            continue
        fam = x[fam_c].strip()
        can = [h for i, h in area_cols if i < len(x) and x[i].strip().lower() == 'can sell']
        cant = [h for i, h in area_cols if i < len(x) and x[i].strip().lower() != 'can sell']
        territory[fam] = {'family': fam, 'territory': x[terr_c].strip() if terr_c < len(x) else '',
                          'can_sell': '; '.join(can), 'cant_sell': '; '.join(cant),
                          'source': x[src_c].strip() if src_c is not None and src_c < len(x) else ''}
        n += 1
    print('TERRITORY %s  rows=%d  areas=%s' % (os.path.basename(path), n, ', '.join(h for _, h in area_cols)))


def money(v):
    v = (v or '').strip().replace('$', '').replace(',', '')
    if not v:
        return 0.0
    neg = v.startswith('(') or v.startswith('-')
    v = v.strip('()-')
    return (-1.0 if neg else 1.0) * float(v or 0)


def ingest_money(path, customers, sources):
    exported = export_date(path)
    with open(path, newline='', encoding='utf-8-sig') as fh:
        r = csv.reader(fh)
        hdr = [x.strip() for x in next(r)]
        col = {h: i for i, h in enumerate(hdr)}
        cols = collections.defaultdict(dict)
        for i, h in enumerate(hdr):
            m = MONEY_RE.match(h)
            if m:
                mk = month_key(m.group(2), m.group(3))
                if m.group(1) in cols[mk]:
                    die('duplicate column %r -- the export has the same month twice' % h)
                cols[mk][m.group(1)] = i
        months = sorted(cols)
        for mk in months:
            if set(cols[mk]) != {'Laid-In Cost', '$Vol', 'Gross'}:
                die('%s: month %s is missing one of Laid-In Cost / $Vol / Gross' % (path, mk))
        data = {mk: {} for mk in months}
        nrows = 0
        for x in r:
            if not any(v.strip() for v in x):
                continue
            pn = split_num(x[col['Product Num & Name']])[0]
            cn = split_num(x[col['Customer Num & Company']])[0]
            if not pn or not cn:
                continue
            nrows += 1
            for mk in months:
                c = cols[mk]
                l, v, g = money(x[c['Laid-In Cost']]), money(x[c['$Vol']]), money(x[c['Gross']])
                if l == 0 and v == 0 and g == 0:
                    continue
                if (pn, cn) in data[mk]:
                    die('%s: product %s at account %s appears twice for %s' % (path, pn, cn, mk))
                data[mk][(pn, cn)] = (l, v, g)
    os.makedirs(MONEY_DIR, exist_ok=True)
    for mk in months:
        out = os.path.join(MONEY_DIR, mk + '.csv')
        existed = os.path.exists(out)
        rows = data[mk]
        with open(out, 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(['product_num', 'customer_num', 'cost', 'revenue', 'gross'])
            for (pn, cn) in sorted(rows, key=lambda k: (len(k[0]), k[0], len(k[1]), k[1])):
                l, v, g = rows[(pn, cn)]
                w.writerow([pn, cn, '%.2f' % l, '%.2f' % v, '%.2f' % g])
        internal = [k for k in rows if k[1] not in customers]
        rev = sum(v for (l, v, g) in rows.values())
        gp = sum(g for (l, v, g) in rows.values())
        ooc = sum(l for (pn, cn), (l, v, g) in rows.items() if cn == '8')
        src = sources.setdefault(mk, {})
        src['money'] = {'file': os.path.basename(path), 'exported': exported.isoformat()}
        print('MONEY    %s  %s%s  rows=%d  revenue=$%s  gross=$%s (%.1f%%)  internal-account rows=%d  out-of-code cost=$%s'
              % (mk, 'RESTATED' if existed else 'new', '', len(rows), format(round(rev), ','), format(round(gp), ','),
                 (gp / rev * 100) if rev else 0, len(internal), format(round(ooc), ',')))
    print('MONEY    %s  rows=%d  months=%s..%s' % (os.path.basename(path), nrows, months[0], months[-1]))


# ---------------------------------------------------------------- build

DRAFT_RE = re.compile(r'\b(keg|gal)\b', re.I)


def is_draft(p):
    return 1 if DRAFT_RE.search(p.get('package', '') + ' ' + p.get('name', '')) else 0


def fmt(v):
    if v is None:
        return 'null'
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    return ('%.2f' % v).rstrip('0').rstrip('.')


def build(products, customers, sources, suppliers=None, territory=None):
    suppliers = suppliers or {}
    territory = territory or {}
    months = sorted(mk[:-4] for mk in os.listdir(MONTHS_DIR) if mk.endswith('.csv'))
    if not months:
        die('no months in %s' % MONTHS_DIR)
    # contiguous check
    def nxt(mk):
        y, m = int(mk[:4]), int(mk[5:])
        return month_key(y + (m == 12), 1 if m == 12 else m + 1)
    gaps = [mk for i, mk in enumerate(months[:-1]) if nxt(mk) != months[i + 1]]
    if gaps:
        print('WARNING: gap in months after %s -- rolling periods across the gap will be short' % ', '.join(gaps))
    midx = {mk: i for i, mk in enumerate(months)}
    pairs = {}
    for mk in months:
        for (pn, cn), (b, c) in read_month(mk).items():
            pairs.setdefault((pn, cn), {})[midx[mk]] = c
    used_p = sorted({k[0] for k in pairs}, key=lambda s: (len(s), s))
    used_c = sorted({k[1] for k in pairs}, key=lambda s: (len(s), s))
    missing_p = [pn for pn in used_p if pn not in products]
    missing_c = [cn for cn in used_c if cn not in customers]
    if missing_p or missing_c:
        die('master months reference unknown products/customers: %s %s' % (missing_p[:5], missing_c[:5]))

    def lut(values):
        vals = sorted(set(values), key=lambda s: (s == '', s.lower()))
        return vals, {v: i for i, v in enumerate(vals)}

    supplier_names, si = lut(products[p]['supplier'] or '(unknown)' for p in used_p)
    bms, bmi = lut((suppliers.get(n, {}).get('brand_manager') or 'Unassigned') for n in supplier_names)
    no_bm = [n for n in supplier_names if not suppliers.get(n, {}).get('brand_manager')]
    if suppliers and no_bm:
        print('NOTE: %d suppliers have no brand manager: %s' % (len(no_bm), ', '.join(no_bm[:8]) + (' ...' if len(no_bm) > 8 else '')))
    families, fi = lut(products[p]['family'] or '(unknown)' for p in used_p)
    brands, bi = lut(products[p]['brand'] or '(unknown)' for p in used_p)
    packages, ki = lut(products[p]['package'] or '(unknown)' for p in used_p)
    areas, ai = lut(customers[c]['area'] or '(unknown)' for c in used_c)
    reps, ri = lut((customers[c]['rep'] or 'Unassigned') for c in used_c)
    dms, di = lut((customers[c]['dm'] if customers[c]['dm'] and customers[c]['dm'] != 'None' else 'Unassigned') for c in used_c)
    pidx = {p: i for i, p in enumerate(used_p)}
    cidx = {c: i for i, c in enumerate(used_c)}
    no_pkg = sum(1 for p in used_p if not products[p]['package'])
    no_rep = sum(1 for c in used_c if not customers[c]['rep'])
    if no_pkg: print('NOTE: %d products have no package yet (load a product export)' % no_pkg)
    if no_rep: print('NOTE: %d accounts have no rep yet (load a customer export)' % no_rep)

    out = []
    out.append('// GENERATED by rolling-distribution/generate.py -- do not edit by hand.')
    out.append('window.DIST_DATA={')
    out.append('"months":%s,' % json.dumps(months))
    out.append('"partial":%s,' % json.dumps({mk: sources[mk]['exported'] for mk in months if sources.get(mk, {}).get('partial')}))
    out.append('"suppliers":%s,' % json.dumps(supplier_names))
    out.append('"bms":%s,' % json.dumps(bms))
    out.append('"supplier_bm":%s,' % json.dumps([bmi[(suppliers.get(n, {}).get('brand_manager') or 'Unassigned')] for n in supplier_names]))
    out.append('"families":%s,' % json.dumps(families))
    out.append('"brands":%s,' % json.dumps(brands))
    out.append('"packages":%s,' % json.dumps(packages))
    out.append('"areas":%s,' % json.dumps(areas))
    out.append('"reps":%s,' % json.dumps(reps))
    out.append('"dms":%s,' % json.dumps(dms))
    # territory: per family, the area indexes it may be sold in (null = no rule -> everywhere)
    area_by_key = {area_key(a): i for i, a in enumerate(areas)}
    rule_areas = set()
    sell, terr_label = [], []
    for f in families:
        t = territory.get(f)
        if not t:
            sell.append(None); terr_label.append('')
            continue
        idxs = []
        for a in (t['can_sell'] + '; ' + t['cant_sell']).split(';'):
            k = area_key(a)
            if k and k in area_by_key:
                rule_areas.add(area_by_key[k])
        for a in t['can_sell'].split(';'):
            k = area_key(a)
            if k and k in area_by_key:
                idxs.append(area_by_key[k])
        sell.append(sorted(idxs)); terr_label.append(t['territory'])
    if territory:
        no_rule = [f for f, sl in zip(families, sell) if sl is None]
        unused = [f for f in territory if f not in fi]
        print('TERRITORY rules for %d of %d brand families in the data; %d without a rule (sold everywhere): %s'
              % (len(families) - len(no_rule), len(families), len(no_rule), ', '.join(no_rule[:8]) + (' ...' if len(no_rule) > 8 else '')))
        if unused:
            print('NOTE: %d families in the territory file are not in the data: %s' % (len(unused), ', '.join(unused[:6]) + (' ...' if len(unused) > 6 else '')))
        off = [a for i, a in enumerate(areas) if i not in rule_areas]
        if off:
            print('NOTE: areas in the data with no territory column (matched by county on the page): %s' % ', '.join(off))
    out.append('"sell":%s,' % json.dumps(sell, separators=(',', ':')))
    out.append('"territory":%s,' % json.dumps(terr_label))
    out.append('"rule_areas":%s,' % json.dumps(sorted(rule_areas)))
    out.append('"products":[')
    for p in used_p:
        r = products[p]
        out.append(json.dumps([p, r['name'], si[r['supplier'] or '(unknown)'], fi[r['family'] or '(unknown)'],
                               bi[r['brand'] or '(unknown)'], ki[r['package'] or '(unknown)'], is_draft(r)],
                              separators=(',', ':')) + ',')
    out[-1] = out[-1].rstrip(',')
    out.append('],')
    out.append('"customers":[')
    for c in used_c:
        r = customers[c]
        out.append(json.dumps([c, r['name'], 1 if r['premise'] == 'On' else 0, ai[r['area'] or '(unknown)'],
                               ri[r['rep'] or 'Unassigned'], di[r['dm'] if r['dm'] and r['dm'] != 'None' else 'Unassigned'],
                               r['county']], separators=(',', ':')) + ',')
    out[-1] = out[-1].rstrip(',')
    out.append('],')
    # pairs: [productIdx, customerIdx, firstMonthIdx, [cases per month, null = no activity]]
    out.append('"pairs":[')
    cells = 0
    for (pn, cn) in sorted(pairs, key=lambda k: (pidx[k[0]], cidx[k[1]])):
        mm = pairs[(pn, cn)]
        lo, hi = min(mm), max(mm)
        arr = [fmt(mm.get(i)) for i in range(lo, hi + 1)]
        cells += len(mm)
        out.append('[%d,%d,%d,[%s]],' % (pidx[pn], cidx[cn], lo, ','.join(arr)))
    out[-1] = out[-1].rstrip(',')
    out.append(']')
    out.append('};')
    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out) + '\n')
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    with open(OUT_META, 'w', encoding='utf-8') as fh:
        json.dump({'synced_at': now, 'months': months, 'first': months[0], 'last': months[-1],
                   'partial': [mk for mk in months if sources.get(mk, {}).get('partial')],
                   'products': len(used_p), 'customers': len(used_c), 'pairs': len(pairs)}, fh, indent=1)
    print('BUILT    %s  months %s..%s  products=%d accounts=%d pairs=%d cells=%d  %.1f MB'
          % (os.path.relpath(OUT_JS, HERE), months[0], months[-1], len(used_p), len(used_c), len(pairs), cells,
             os.path.getsize(OUT_JS) / 1e6))


# ---------------------------------------------------------------- main

def main(argv):
    complete = '--complete' in argv
    build_only = '--build' in argv
    files = [a for a in argv if not a.startswith('--')]
    if not files and not build_only:
        print(__doc__); sys.exit(1)
    os.makedirs(MONTHS_DIR, exist_ok=True)
    products = load_dim(PRODUCTS_CSV, PRODUCT_FIELDS, 'product_num')
    customers = load_dim(CUSTOMERS_CSV, CUSTOMER_FIELDS, 'customer_num')
    suppliers = load_dim(SUPPLIERS_CSV, SUPPLIER_FIELDS, 'supplier')
    territory = load_dim(TERRITORY_CSV, TERRITORY_FIELDS, 'family')
    sources = load_sources()
    # detail first so lookups apply on top, then product/customer files
    typed = []
    for f in files:
        if f.lower().endswith('.xlsx'):
            typed.append((detect(read_rows(f)[0]), f))
            continue
        with open(f, newline='', encoding='utf-8-sig') as fh:
            typed.append((detect(next(csv.reader(fh))), f))
    for kind, f in sorted(typed, key=lambda t: {'detail': 0, 'product': 1, 'customer': 2, 'supplier': 3, 'territory': 4, 'money': 5}[t[0]]):
        if kind == 'detail':
            ingest_detail(f, products, customers, sources, complete)
        elif kind == 'product':
            ingest_product(f, products)
        elif kind == 'customer':
            ingest_customer(f, customers)
        elif kind == 'supplier':
            ingest_supplier(f, suppliers)
        elif kind == 'money':
            ingest_money(f, customers, sources)
        else:
            territory = {}   # the territory file is the whole rule set, never a top-up
            ingest_territory(f, territory)
    save_dim(PRODUCTS_CSV, PRODUCT_FIELDS, products)
    save_dim(CUSTOMERS_CSV, CUSTOMER_FIELDS, customers)
    save_dim(SUPPLIERS_CSV, SUPPLIER_FIELDS, suppliers)
    save_dim(TERRITORY_CSV, TERRITORY_FIELDS, territory)
    with open(SOURCES_JSON, 'w', encoding='utf-8') as fh:
        json.dump(dict(sorted(sources.items())), fh, indent=1)
    build(products, customers, sources, suppliers, territory)


if __name__ == '__main__':
    main(sys.argv[1:])
