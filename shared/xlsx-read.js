/* XLSX READER (2026-10-15) -- a small, dependency-free .xlsx reader for pages
 * that read a workbook in the browser (the site has no build step and no npm
 * packages). The same code as merchandising/isb-import.js's reader, shared so
 * a page outside /merchandising/ (the UPC audit) can load it.
 *   KdhXlsxRead.read(arrayBuffer) -> Promise<{sheets: {name: [[{v, link}]]}}>
 * Values: shared / inline strings as text, numbers as numbers (dates stay
 * Excel serial numbers), booleans; every cell's hyperlink target is kept.
 * Needs DecompressionStream('deflate-raw') (every current browser, Node 18+). */
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
      // element prefixes dropped (<x:row> -> <row>): some writers (the ABC registration search) qualify every tag
      text: async name => { const f = files[name]; if (!f) return null; const raw = f.method === 0 ? f.data : await inflateRaw(f.data); return td.decode(raw).replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, '<$1'); }
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

  var API = { read: readXlsx };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.KdhXlsxRead = API;
})(typeof window !== 'undefined' ? window : globalThis);
