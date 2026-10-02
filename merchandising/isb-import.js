/* iSELLBEER EXPORT IMPORT (2026-10-04) -- parsing and grouping only.
 *
 * Reads the iSellBeer exports Gavin pulls (display "Report", tap survey "Raw
 * Reports report", "Promos Report") and the "photos" PDFs, and turns them into
 * merchandising RECORDS with LINES and PHOTO references for
 * public.kdh_merch_import (supabase/migrations/20261004090000_merchandising.sql).
 * No UI and no business rules about programs or credit live here; the import
 * page (merchandising/import/) and the tests call these functions.
 *
 * Rules (merchandising/README.txt has the full write-up):
 *  - A record is one observation at one account: same Account #, same
 *    Date/Time, same photo link, same photo taker (and, for promos, the same
 *    Promotion type / Theme / Elements). Its rows become its lines.
 *  - The record key is built from the photo link's own id + account + time
 *    (+ promotion type), never from a row number or Promo #, which restart in
 *    every export. Re-importing an overlapping export finds the same keys.
 *  - A shared photo link joins rows only when the other fields agree; two
 *    observations that share a photo stay two records pointing at ONE photo.
 *  - Quantities keep their unit: display / promo quantities are "unit not
 *    stated" (the export does not say cases, bottles or facings); tap rows are
 *    taps. A blank quantity stays blank; a 0 stays 0.
 *  - "24 PK" is a package description, kept as written; it is not a product.
 *  - US / THEM on a tap row is the export's own flag (ownership_source). A
 *    corrected value is attached only from the Tap Tracker's audited survey
 *    for the same account, time and brand -- never re-derived here.
 *  - PDF pages are REPORT PAGES (iSellBeer's printed frame + metadata around a
 *    small copy of the photo). They are matched to a record only by a person;
 *    page order means nothing.
 */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- zip + xml */
  const td = new TextDecoder('utf-8');
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  async function unzip(buf) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not an .xlsx file (no zip directory found).');
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged .xlsx file (zip directory).');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = td.decode(b.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lxlen, data = b.subarray(start, start + csize);
      files[name] = { method, data };
      p += 46 + nlen + xlen + clen;
    }
    return {
      has: name => !!files[name],
      text: async name => { const f = files[name]; if (!f) return null; const raw = f.method === 0 ? f.data : await inflateRaw(f.data); return td.decode(raw); }
    };
  }
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unxml = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
  const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? unxml(m[1]) : null; };
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const tText = xml => { let out = ''; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g; let m; while ((m = re.exec(xml))) out += m[1] ? unxml(m[1]) : ''; return out; };

  // -> {sheets: {name: [[{v, link}]]}} ; every cell's hyperlink target kept
  async function readXlsx(buf) {
    const z = await unzip(buf);
    const wb = await z.text('xl/workbook.xml'); if (!wb) throw new Error('Not an Excel workbook (xl/workbook.xml missing).');
    const wbRels = (await z.text('xl/_rels/workbook.xml.rels')) || '';
    const relT = {}; (wbRels.match(/<Relationship\b[^>]*>/g) || []).forEach(t => { relT[attr(t, 'Id')] = attr(t, 'Target'); });
    const ss = [];
    const sst = await z.text('xl/sharedStrings.xml');
    if (sst) (sst.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).forEach(si => ss.push(tText(si)));
    const sheets = {};
    for (const t of (wb.match(/<sheet\b[^>]*>/g) || [])) {
      const name = attr(t, 'name'), rid = attr(t, 'r:id');
      let target = relT[rid] || ''; target = target.replace(/^\/?xl\//, ''); const path = 'xl/' + target.replace(/^\//, '');
      const xml = await z.text(path); if (!xml) continue;
      const relsPath = path.replace(/([^/]+)$/, '_rels/$1.rels');
      const rels = (await z.text(relsPath)) || ''; const links = {};
      (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(r => { links[attr(r, 'Id')] = attr(r, 'Target'); });
      const hl = {};
      (xml.match(/<hyperlink\b[^>]*>/g) || []).forEach(h => {
        const ref = attr(h, 'ref'), id = attr(h, 'r:id'); if (!ref) return;
        const target = id ? links[id] : null; const loc = attr(h, 'location');
        // a range (O2:O4) applies to every cell in it
        const [a, bb] = ref.split(':'); const ca = colIdx(a), ra = +/\d+/.exec(a)[0];
        const cb = bb ? colIdx(bb) : ca, rb = bb ? +/\d+/.exec(bb)[0] : ra;
        for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) hl[r + ':' + c] = target || (loc ? '#' + loc : null);
      });
      const rows = [];
      (xml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []).forEach(rowXml => {
        const rn = +attr(rowXml.match(/<row\b[^>]*>/)[0], 'r');
        const row = [];
        (rowXml.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) || []).forEach(c => {
          const head = c.match(/<c\b[^>]*>/)[0]; const ref = attr(head, 'r'); const ty = attr(head, 't');
          const ci = colIdx(ref);
          let v = null; const vm = /<v>([\s\S]*?)<\/v>/.exec(c);
          if (ty === 's') v = vm ? ss[+vm[1]] : null;
          else if (ty === 'inlineStr') v = tText(c);
          else if (ty === 'str' || ty === 'e') v = vm ? unxml(vm[1]) : null;
          else if (ty === 'b') v = vm ? vm[1] === '1' : null;
          else v = vm ? Number(vm[1]) : null;
          let link = hl[rn + ':' + ci] || null;
          const f = /<f>([\s\S]*?)<\/f>/.exec(c);
          if (!link && f) { const hm = /HYPERLINK\(\s*"([^"]+)"/i.exec(unxml(f[1])); if (hm) link = hm[1]; }
          row[ci] = { v, link };
        });
        rows[rn - 1] = row;
      });
      sheets[name] = rows.filter(Boolean);
    }
    return { sheets };
  }

  /* ---------------------------------------------------------------- helpers */
  const val = c => (c == null || c.v == null) ? null : (typeof c.v === 'string' ? (c.v.trim() === '' ? null : c.v.trim()) : c.v);
  const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  // Excel serial -> "MM/DD/YYYY hh:mm AM" so one parser handles both
  function excelSerial(n) { const ms = Math.round((n - 25569) * 86400000); const d = new Date(ms); const p = x => String(x).padStart(2, '0');
    let h = d.getUTCHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()} ${p(h)}:${p(d.getUTCMinutes())} ${ap}`; }
  // offset of America/New_York at a local wall time, e.g. "-04:00"
  function nyOffset(y, mo, d, h, mi) {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset', year: 'numeric' });
    const part = f.formatToParts(new Date(guess + 5 * 3600000)).find(x => x.type === 'timeZoneName').value; // GMT-4
    const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(part); if (!m) return '-05:00';
    return `${m[1]}${String(m[2]).padStart(2, '0')}:${String(m[3] || '00').padStart(2, '0')}`;
  }
  // "09/30/2026 01:44 PM" (local, Eastern) -> {iso:"2026-09-30T13:44:00-04:00", key:"20260930T1344"}
  function parseWhen(v) {
    if (v == null) return null;
    if (typeof v === 'number') v = excelSerial(v);
    const s = String(v).trim();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i.exec(s);
    let y, mo, d, h, mi;
    if (m) { mo = +m[1]; d = +m[2]; y = +m[3]; h = +m[4]; mi = +m[5]; if (m[6]) { const pm = /p/i.test(m[6]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; } }
    else if ((m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; h = +m[4]; mi = +m[5]; }
    else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { mo = +m[1]; d = +m[2]; y = +m[3]; h = 0; mi = 0; }
    else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; h = 0; mi = 0; }
    else return null;
    const p = x => String(x).padStart(2, '0');
    return { iso: `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:00${nyOffset(y, mo, d, h, mi)}`, key: `${y}${p(mo)}${p(d)}T${p(h)}${p(mi)}`, day: `${y}-${p(mo)}-${p(d)}` };
  }
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  // the photo link's own id: a uuid in the iSellBeer viewer path, or the file name on S3
  function photoId(url) {
    if (!url) return null;
    const u = String(url);
    let m = /view-photo\/[a-z]+\/([0-9a-f-]{36})/i.exec(u); if (m) return m[1].toLowerCase();
    m = /\/([0-9a-f]{24,64})\.(?:jpe?g|png|webp)(?:\?|$)/i.exec(u); if (m) return m[1].toLowerCase();
    m = /\/([^/?#]+)\/?(?:\?|#|$)/.exec(u); return m ? slug(m[1]) : null;
  }
  // a short stable hash for keys built from text (FNV-1a, hex)
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

  /* ---------------------------------------------------------------- formats */
  const FORMATS = {
    display:    { need: ['Account #', 'Photo Taker', 'SKU', 'Quantity', 'Date/Time', 'Photo'], label: 'Display report' },
    tap_survey: { need: ['Account #', 'Date/Time', 'Photos', '# of Taps', 'Distributor', 'Brand'], label: 'Tap survey report' },
    promo:      { need: ['Promo #', 'Promotion type', 'Account #', 'Elements', 'Date/Time', 'Photo'], label: 'Promotions report' }
  };
  function findTable(sheets) {
    for (const name of Object.keys(sheets)) {
      const rows = sheets[name]; if (!rows.length) continue;
      for (let hi = 0; hi < Math.min(rows.length, 5); hi++) {
        const head = (rows[hi] || []).map(c => val(c)).map(x => x == null ? '' : String(x).trim());
        for (const [kind, f] of Object.entries(FORMATS)) {
          if (f.need.every(h => head.some(x => norm(x) === norm(h)))) return { kind, sheet: name, headRow: hi, head, rows: rows.slice(hi + 1) };
        }
      }
    }
    return null;
  }
  // the export's own "Values were filtered by:" sheet
  function readFilters(sheets) {
    const fs = sheets.Filters || sheets.filters; const out = { pairs: [], from: null, to: null };
    if (!fs) return out;
    fs.forEach(r => { const k = val(r[0]), v = val(r[1]); if (k == null || v == null) return; out.pairs.push([String(k), String(v)]);
      if (/^start date$/i.test(String(k))) out.from = (parseWhen(v) || {}).day || null;
      if (/^end date$/i.test(String(k))) out.to = (parseWhen(v) || {}).day || null; });
    return out;
  }

  // promotion type / elements -> the Hub's simplified category (iSellBeer's values are kept beside it)
  function promoCategory(type, elements, theme) {
    const el = norm(elements), ty = norm(type), th = norm(theme);
    if (/cooler door/.test(el)) return { category: 'cooler_door', subtype: 'cooler_door_wrap' };
    if (/table tent/.test(el)) return { category: 'menu', subtype: 'table_tent' };
    if (/spirit list/.test(el)) return { category: 'menu', subtype: 'spirit_list' };
    if (/cocktail list/.test(el)) return { category: 'menu', subtype: 'cocktail_list' };
    if (/\bmenu\b/.test(el)) return { category: 'menu', subtype: 'menu' };
    if (/window/.test(el)) return { category: 'window', subtype: null };
    if (/tasting|event/.test(th) || /event/.test(ty)) return { category: 'other', subtype: 'tasting_event' };
    if (/cocktail list|menu/.test(ty)) return { category: 'menu', subtype: null };
    return { category: 'other', subtype: null };   // e.g. "Feature Activation" with no elements: not assumed to be a display
  }

  // -> {kind, label, filters, rows:[...], records:[...], issues:[...]}
  function parseTable(t, fileName, filters) {
    const H = {}; t.head.forEach((h, i) => { if (h) H[norm(h)] = i; });
    const cell = (r, name) => r[H[norm(name)]] || null;
    const g = (r, name) => { const c = cell(r, name); return c ? val(c) : null; };
    const link = (r, name) => { const c = cell(r, name); return c && c.link && /^https?:/i.test(c.link) ? c.link : null; };
    const recs = new Map(); const issues = []; const rowsOut = [];
    let dupRows = 0; const seenRow = new Set();
    t.rows.forEach((r, i) => {
      if (!r || !r.some(c => val(c) != null)) return;
      const acct = g(r, 'Account #'); const when = parseWhen(g(r, 'Date/Time'));
      const photoCol = t.kind === 'tap_survey' ? 'Photos' : 'Photo';
      const url = link(r, photoCol); const pid = photoId(url);
      const sig = JSON.stringify(r.map(c => c ? [c.v, c.link] : null));
      const rowNo = i + t.headRow + 2;                       // the sheet's own row number
      if (seenRow.has(sig)) dupRows++; seenRow.add(sig);
      const row = { rowNo, acct: acct == null ? null : String(acct).trim(), when, url, pid };
      rowsOut.push(row);
      if (!row.acct) { issues.push({ kind: 'no_account', row: rowNo, text: `Row ${rowNo}: no Account # — skipped.` }); return; }
      if (!when) { issues.push({ kind: 'no_date', row: rowNo, text: `Row ${rowNo}: Date/Time "${g(r, 'Date/Time')}" not readable — skipped.` }); return; }
      const cellText = cell(r, photoCol) && val(cell(r, photoCol));
      if (!url && cellText) issues.push({ kind: 'photo_no_link', row: rowNo, text: `Row ${rowNo}: the "${photoCol}" cell has no link target.` });
      let gk, rec;
      if (t.kind === 'display') {
        const who = g(r, 'Photo Taker');
        gk = [row.acct, when.key, pid || 'nophoto', norm(who)].join('|');
        rec = { source_kind: 'display', category: 'display', subtype: null,
          source_key: `isb:display:${pid || 'nophoto-' + fnv(gk)}:${row.acct}:${when.key}`,
          source_author: who, source_author_role: g(r, "Photo Taker's Role"), source_dm: g(r, 'District Manager'), source_rep: null,
          dba: g(r, 'DBA'), city: g(r, 'City') };
      } else if (t.kind === 'tap_survey') {
        gk = [row.acct, when.key, pid || 'nophoto'].join('|');
        rec = { source_kind: 'tap_survey', category: 'tap_handle', subtype: null,
          source_key: `isb:taps:${row.acct}:${when.key}:${pid || 'nophoto'}`,
          source_author: null, source_author_role: null, source_dm: g(r, 'District Manager'), source_rep: g(r, 'Route / Sales Rep'),
          dba: g(r, 'DBA'), city: g(r, 'City'), area: g(r, 'Distribution Area') };
      } else {
        const who = g(r, 'Photo taker'), ty = g(r, 'Promotion type'), th = g(r, 'Theme'), el = g(r, 'Elements');
        gk = [row.acct, when.key, pid || 'nophoto', norm(who), norm(ty), norm(th), norm(el)].join('|');
        const pc = promoCategory(ty, el, th);
        rec = { source_kind: 'promo', category: pc.category, subtype: pc.subtype,
          source_key: `isb:promo:${pid || 'nophoto-' + fnv(gk)}:${row.acct}:${when.key}:${slug(ty)}`,
          isb_promotion_type: ty, isb_theme: th, isb_elements: el,
          source_author: who, source_author_role: g(r, "Photo taker's role"), source_dm: g(r, 'District Manager'), source_rep: null,
          sales_manager: g(r, 'Sales Manager'), dba: g(r, 'DBA'), city: g(r, 'City') };
      }
      if (!recs.has(gk)) recs.set(gk, Object.assign(rec, { customer_num: row.acct, observed_at: when.iso, observed_key: when.key, lines: [], photos: [], rows: [], promo: [] }));
      const R = recs.get(gk);
      R.rows.push(rowNo);
      if (url && !R.photos.some(p => p.source_url === url)) R.photos.push({ source_url: url, photo_kind: 'original', photo_status: 'link' });
      if (t.kind === 'display') {
        const q = g(r, 'Quantity');
        R.lines.push({ supplier: g(r, 'Supplier'), brand_family: g(r, 'Brand Family'), brand: g(r, 'Brand'), package: g(r, 'SKU'),
          quantity: q == null ? null : Number(q), quantity_unit: q == null ? null : 'unspecified', source_line_ref: `Row ${rowNo} (# ${g(r, '#') ?? '?'})` });
      } else if (t.kind === 'tap_survey') {
        const q = g(r, '# of Taps'); const us = String(g(r, 'Distributor') || '').toUpperCase();
        R.lines.push({ supplier: g(r, 'Supplier'), brand_family: g(r, 'Brand Family'), brand: g(r, 'Brand'), package: null,
          quantity: q == null ? null : Number(q), quantity_unit: q == null ? null : 'taps',
          ownership_source: us === 'US' || us === 'THEM' ? us : null, source_line_ref: `Row ${rowNo} (# ${g(r, '#') ?? '?'})` });
      } else {
        const q = g(r, 'Quantity'); const pn = g(r, 'Promo #');
        R.promo.push(pn);
        R.lines.push({ supplier: g(r, 'Supplier'), brand_family: null, brand: g(r, 'Brand'), package: null,
          quantity: q == null ? null : Number(q), quantity_unit: q == null ? null : 'unspecified', source_line_ref: `Promo # ${pn ?? '?'} (row ${rowNo})` });
      }
    });
    const records = [...recs.values()].map(R => {
      R.brands = [...new Set(R.lines.map(l => l.brand).filter(Boolean))];
      R.source_ref = { file: fileName, rows: R.rows, promo: R.promo.length ? R.promo : undefined, photo_ids: R.photos.map(p => photoId(p.source_url)) };
      return R;
    });
    return { kind: t.kind, label: FORMATS[t.kind].label, filters, rows: rowsOut, dupRows, records, issues };
  }

  async function parseWorkbook(buf, fileName) {
    const { sheets } = await readXlsx(buf);
    const t = findTable(sheets);
    if (!t) throw new Error(`${fileName}: not a display, tap survey or promotions export (the expected column headings are missing).`);
    return parseTable(t, fileName, readFilters(sheets));
  }

  /* ---------------------------------------------------------------- tap corrections */
  // From the Tap Tracker's own audited survey (its embedded tap-data JSON):
  // same account + same minute + same brand -> the tracker's status + reason.
  function applyTapAudit(parsed, tapData) {
    if (!tapData || parsed.kind !== 'tap_survey') return { matched: 0, lines: 0 };
    const idx = new Map();
    const add = r => { if (!r || !r.account || !r.visited) return; const k = String(r.account) + '|' + String(r.visited).slice(0, 16) + '|' + norm(r.brand); idx.set(k, r); };
    (tapData.records || []).forEach(add);
    // history = {account: [{visited, brands:[{brand, status, reason}]}]} -- earlier passes of the same account
    const H = tapData.history; if (H && typeof H === 'object') Object.entries(H).forEach(([acct, passes]) => (passes || []).forEach(p => (p.brands || []).forEach(br => add(Object.assign({ account: acct, visited: p.visited }, br)))));
    let matched = 0, lines = 0;
    parsed.records.forEach(R => {
      const local = R.observed_at.slice(0, 16);   // 2026-07-30T12:54
      let any = false;
      R.lines.forEach(l => { lines++; const t = idx.get(R.customer_num + '|' + local + '|' + norm(l.brand));
        if (t && (t.status === 'US' || t.status === 'THEM')) { l.ownership_corrected = t.status; l.ownership_rule = 'Tap Tracker audit: ' + (t.reason || 'territory rules'); any = true; } });
      if (any) matched++;
    });
    return { matched, lines };
  }

  /* ---------------------------------------------------------------- PDF report pages */
  function a85(bytes) {   // ASCII85 -> bytes
    const out = []; let tuple = 0, n = 0;
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c === 0x7e) break;                       // ~>
      if (c <= 32) continue;
      if (c === 0x7a && n === 0) { out.push(0, 0, 0, 0); continue; }
      tuple = tuple * 85 + (c - 33); n++;
      if (n === 5) { out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255); tuple = 0; n = 0; }
    }
    if (n) { for (let k = n; k < 5; k++) tuple = tuple * 85 + 84; for (let k = 0; k < n - 1; k++) out.push((tuple >>> (24 - 8 * k)) & 255); }
    return new Uint8Array(out);
  }
  // every JPEG image XObject, in file order: [{page, bytes, width, height}]
  function pdfImages(buf) {
    const b = new Uint8Array(buf); const s = new TextDecoder('latin1').decode(b);
    if (!/^%PDF-/.test(s)) throw new Error('Not a PDF file.');
    const out = []; const re = /<<((?:(?!>>\s*stream)[\s\S]){0,800}?\/Subtype\s*\/Image[\s\S]{0,800}?)>>\s*stream\r?\n/g; let m;
    while ((m = re.exec(s))) {
      const dict = m[1]; const start = m.index + m[0].length;
      const lenM = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict); let end;
      if (lenM) end = start + +lenM[1]; else end = s.indexOf('endstream', start);
      const filters = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict) || [, ''])[1];
      const w = +((/\/Width\s+(\d+)/.exec(dict) || [])[1] || 0), h = +((/\/Height\s+(\d+)/.exec(dict) || [])[1] || 0);
      let data = b.subarray(start, end);
      if (/ASCII85Decode/.test(filters)) data = a85(data);
      if (!/DCTDecode/.test(filters)) { out.push({ page: out.length + 1, bytes: null, width: w, height: h, unsupported: filters }); continue; }
      out.push({ page: out.length + 1, bytes: data, width: w, height: h });
      re.lastIndex = end;
    }
    return out;
  }

  /* ---------------------------------------------------------------- reconciliation */
  // parsedList: results of parseWorkbook; known: Set of CustomerIDs in the customer base;
  // existing: Set of source_keys already in the Hub; pages: {total, matched, unresolved}
  function reconcile(parsedList, known, existing, pages) {
    const out = { files: [], totals: { rows: 0, records: 0, lines: 0, photoRefs: 0, rowsWithoutPhoto: 0, duplicateRows: 0, duplicateRecords: 0,
      newRecords: 0, updatedRecords: 0, unknownAccounts: 0, issues: 0 }, unresolved: [] };
    const allKeys = new Map(); const allPhotos = new Set();
    parsedList.forEach(P => {
      const f = { file: P.records[0] ? P.records[0].source_ref.file : '?', kind: P.kind, label: P.label, period: [P.filters.from, P.filters.to], filters: P.filters.pairs,
        rows: P.rows.length, records: P.records.length, lines: P.records.reduce((a, R) => a + R.lines.length, 0),
        photoRefs: new Set(P.records.flatMap(R => R.photos.map(p => p.source_url))).size,
        rowsWithoutPhoto: P.rows.filter(r => !r.url).length, duplicateRows: P.dupRows, issues: P.issues.length };
      out.files.push(f);
      ['rows', 'records', 'lines', 'rowsWithoutPhoto', 'duplicateRows', 'issues'].forEach(k => out.totals[k] += f[k]);
      P.records.forEach(R => {
        if (allKeys.has(R.source_key)) out.totals.duplicateRecords++; else allKeys.set(R.source_key, R);
        R.photos.forEach(p => allPhotos.add(p.source_url));
      });
      P.issues.forEach(x => out.unresolved.push(Object.assign({ file: f.file }, x)));
    });
    out.totals.photoRefs = allPhotos.size;
    allKeys.forEach(R => {
      if (existing && existing.has(R.source_key)) out.totals.updatedRecords++; else out.totals.newRecords++;
      if (known && !known.has(String(R.customer_num))) { out.totals.unknownAccounts++; R.unknownAccount = true;
        out.unresolved.push({ kind: 'unknown_account', file: R.source_ref.file, text: `Account #${R.customer_num} (${R.dba || 'no name'}) is not in the customer base — imported only after it is checked.` }); }
    });
    out.records = [...allKeys.values()];
    out.pages = pages || { total: 0, matched: 0, unresolved: 0 };
    return out;
  }

  // the payload for kdh_merch_import (one call per file keeps batches per export)
  function payload(P, opts) {
    const o = opts || {};
    const recs = P.records.filter(R => !R.unknownAccount || o.includeUnknown).map(R => ({
      source_key: R.source_key, source_kind: R.source_kind, customer_num: R.customer_num, category: R.category, subtype: R.subtype,
      premise: R.premise || null, observed_at: R.observed_at, isb_promotion_type: R.isb_promotion_type || null, isb_theme: R.isb_theme || null,
      isb_elements: R.isb_elements || null, source_author: R.source_author || null, source_author_role: R.source_author_role || null,
      source_dm: R.source_dm || null, source_rep: R.source_rep || null, source_ref: R.source_ref, brands: R.brands, lines: R.lines,
      photos: R.photos.concat((o.pagePhotos && o.pagePhotos[R.source_key]) || [])
    }));
    return { batch: { source_file: recs[0] ? recs[0].source_ref.file : (o.file || '?'), file_kind: P.kind, filters: P.filters.pairs,
      period_from: P.filters.from, period_to: P.filters.to, counts: o.counts || null }, records: recs, review: o.review || [] };
  }

  const API = { readXlsx, parseWorkbook, parseTable, findTable, readFilters, parseWhen, photoId, promoCategory, applyTapAudit, pdfImages, reconcile, payload, FORMATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.KdhIsb = API;
})(typeof window !== 'undefined' ? window : globalThis);
