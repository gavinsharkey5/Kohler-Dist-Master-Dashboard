/* UPC REGISTRATION AUDIT -- the matching rules (2026-10-15).
 *
 * Pure functions, no page and no network: the page (upc.js) and the tests
 * call them. Input = the parsed workbooks (shared/xlsx-read.js -> {sheets});
 * output = one result row per FileMaker product. upc-audit/README.txt has
 * every rule in words; the short version:
 *
 *  FILEMAKER EXPORT   Vlad's 12-column export (KohlerProductCode, ABC_UPC,
 *                     ABC_UPC_Text, ABC_Registrant, ABCRegNo, ProductName,
 *                     ProductType, PackageSize, Unit, Units, Vintage, Proof).
 *                     The UPC is read from ABC_UPC_Text (ABC_UPC is a number
 *                     and has lost its leading zeros).
 *  ABC SEARCH         the ABC "register product search" download: sheet Data
 *                     (one row per registration x UPC, State = Current /
 *                     Pending / Historical, Expiration Date) and sheet
 *                     Criteria (the search that was run). A file is refused
 *                     unless it was run for Kohler's license 3403-23-652-002
 *                     and, when it is filtered by expiration year, for the
 *                     current year or later (Gavin, 2026-10-15). Several ABC
 *                     files merge (e.g. 2026 + 2027 once renewals start).
 *  A REGISTRATION COUNTS (is "current") when its State is Current and it
 *                     expires in the current year or later. Pending = filed,
 *                     not approved yet. Historical, or expiring before this
 *                     year = not valid.
 *  UPC MATCH          digits only; exact first, then with leading zeros
 *                     removed on both sides (UPC-A vs EAN-13 / GTIN-14). Any
 *                     ABC row for the UPC that carries FileMaker's
 *                     registration number counts (never only the first hit).
 *  RESULT (first that applies):
 *    match       UPC on a current registration, FileMaker's number among them
 *    wrongreg    UPC on a current registration, FileMaker has another number
 *    notonreg    UPC on no current registration, but FileMaker's number is a
 *                current registration (with other UPCs): add this UPC to it
 *    pending     UPC or FileMaker's number only on a Pending registration
 *    expired     UPC or FileMaker's number found only Historical / expired
 *    notreg      nothing found: register it
 *    noupc       FileMaker has no UPC for the product
 */
(function (global) {
  'use strict';

  var LICENSE = '3403-23-652-002';
  var BUCKETS = [
    { key: 'notreg',   label: 'Not Registered',             short: 'Not Registered',   action: 'Register this product with ABC.' },
    { key: 'notonreg', label: 'UPC Not on Registration',    short: 'UPC Missing',      action: 'Add this UPC to the registration FileMaker names.' },
    { key: 'expired',  label: 'Expired or Historical',      short: 'Expired',          action: 'Renew or re-register: the only registration found is no longer current.' },
    { key: 'pending',  label: 'Pending at ABC',             short: 'Pending',          action: 'Filed, not approved yet. Check back after ABC approves it.' },
    { key: 'wrongreg', label: 'Wrong Registration # in FileMaker', short: 'Wrong Reg #', action: 'Registered. Correct the registration number in FileMaker.' },
    { key: 'noupc',    label: 'No UPC in FileMaker',        short: 'No UPC',           action: 'Add the UPC in FileMaker, then run the audit again.' },
    { key: 'match',    label: 'Matched',                    short: 'Matched',          action: 'Registered under the number FileMaker has. Nothing to do.' }
  ];
  var BUCKET = {}; BUCKETS.forEach(function (b) { BUCKET[b.key] = b; });
  // still to be registered with the state (the list the brief asks for)
  var NEEDS_REGISTRATION = { notreg: 1, notonreg: 1, expired: 1 };

  /* ------------------------------------------------------------ helpers */
  function v(c) { if (c == null) return null; var x = (typeof c === 'object' && 'v' in c) ? c.v : c; if (x == null) return null; if (typeof x === 'string') { x = x.trim(); return x === '' ? null : x; } return x; }
  function s(c) { var x = v(c); return x == null ? '' : String(x); }
  function norm(h) { return String(h == null ? '' : h).trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function digits(x) { return String(x == null ? '' : x).replace(/\D/g, ''); }
  function strip0(d) { return d.replace(/^0+/, ''); }
  function regNo(x) { var t = String(x == null ? '' : x).trim(); if (/^\d+(\.0+)?$/.test(t)) t = String(parseInt(t, 10)); return t; }
  // a number that a spreadsheet stored for a text UPC (e.g. 7.2890100252E10) -> its digits
  function upcText(textCell, numCell) {
    var t = v(textCell);
    if (t != null && t !== '') return typeof t === 'number' ? numToDigits(t) : String(t).trim();
    var n = v(numCell);
    if (n == null) return '';
    return typeof n === 'number' ? numToDigits(n) : String(n).trim();
  }
  function numToDigits(n) { if (!isFinite(n)) return ''; try { return BigInt(Math.round(n)).toString(); } catch (e) { return String(Math.round(n)); } }
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  // "Dec 31, 2026" | Excel serial | "12/31/2026" | "2026-12-31" -> {y, m, d} | null
  function parseDate(x) {
    if (x == null || x === '') return null;
    if (typeof x === 'number') {
      if (x > 1000 && x < 3000 && Math.floor(x) === x) return { y: x, m: 12, d: 31 };   // a bare year
      var ms = Math.round((x - 25569) * 86400000), dt = new Date(ms);
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }
    var t = String(x).trim(), m;
    if ((m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t)) && MON[m[1].toLowerCase()]) return { y: +m[3], m: MON[m[1].toLowerCase()], d: +m[2] };
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t))) return { y: +m[3], m: +m[1], d: +m[2] };
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return { y: +m[1], m: +m[2], d: +m[3] };
    if ((m = /^(\d{4})$/.exec(t))) return { y: +m[1], m: 12, d: 31 };
    return null;
  }
  function dateText(p) { return p ? ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.m] + ' ' + p.d + ', ' + p.y : ''; }

  // the first row (within the first 10) carrying every needed heading
  function findHeader(rows, need) {
    for (var i = 0; i < Math.min(rows.length, 10); i++) {
      var r = rows[i] || [], idx = {};
      for (var c = 0; c < r.length; c++) { var h = norm(v(r[c])); if (h && !(h in idx)) idx[h] = c; }
      if (need.every(function (n) { return norm(n) in idx; })) return { at: i, idx: idx };
    }
    return null;
  }

  /* ------------------------------------------------------------ FileMaker */
  var FM_COLS = ['KohlerProductCode', 'ABC_UPC', 'ABC_UPC_Text', 'ABC_Registrant', 'ABCRegNo', 'ProductName', 'ProductType', 'PackageSize', 'Unit', 'Units', 'Vintage', 'Proof'];
  // -> {ok, rows, problems, warnings, sheet}
  function parseFileMaker(book, fileName) {
    var names = Object.keys(book.sheets || {});
    for (var i = 0; i < names.length; i++) {
      var rows = book.sheets[names[i]] || [];
      var h = findHeader(rows, ['KohlerProductCode', 'ABCRegNo']);
      if (!h) continue;
      if (!('abcupctext' in h.idx) && !('abcupc' in h.idx)) return { ok: false, problems: ['The FileMaker export has no ABC_UPC_Text or ABC_UPC column.'] };
      var missing = FM_COLS.filter(function (c) { return !(norm(c) in h.idx); });
      var warnings = missing.length ? ['Columns not in this export: ' + missing.join(', ') + '. The audit uses the rest.'] : [];
      var I = h.idx, out = [], seen = {}, dups = 0;
      var get = function (r, col) { var k = norm(col); return k in I ? r[I[k]] : null; };
      for (var r = h.at + 1; r < rows.length; r++) {
        var row = rows[r] || []; var code = s(get(row, 'KohlerProductCode'));
        if (!code) { if (row.some(function (c) { return v(c) != null; })) warnings.push('Row ' + (r + 1) + ' has no KohlerProductCode and was skipped.'); continue; }
        if (seen[code]) { dups++; continue; }
        seen[code] = 1;
        out.push({
          code: code,
          upc: upcText(get(row, 'ABC_UPC_Text'), get(row, 'ABC_UPC')),
          registrant: s(get(row, 'ABC_Registrant')),
          reg: regNo(s(get(row, 'ABCRegNo'))),
          name: s(get(row, 'ProductName')),
          type: s(get(row, 'ProductType')),
          size: s(get(row, 'PackageSize')),
          unit: s(get(row, 'Unit')),
          units: s(get(row, 'Units')),
          vintage: s(get(row, 'Vintage')),
          proof: s(get(row, 'Proof'))
        });
      }
      if (dups) warnings.push(dups + ' repeated product code' + (dups === 1 ? ' was' : 's were') + ' skipped (the first row of each code is used).');
      if (!out.length) return { ok: false, problems: ['The FileMaker export has a header row but no products.'] };
      return { ok: true, rows: out, warnings: warnings, sheet: names[i], file: fileName || '' };
    }
    if (findAbcData(book)) return { ok: false, problems: ['This looks like the ABC search, not the FileMaker export. Add it under ABC Registration Search.'] };
    return { ok: false, problems: ['No KohlerProductCode / ABCRegNo header found. Is this the FileMaker product export?'] };
  }

  /* ------------------------------------------------------------ ABC search */
  var ABC_NEED = ['UPC', 'Registration Number', 'State', 'Expiration Date'];
  function findAbcData(book) {
    var names = Object.keys(book.sheets || {});
    var order = names.filter(function (n) { return norm(n) === 'data'; }).concat(names.filter(function (n) { return norm(n) !== 'data'; }));
    for (var i = 0; i < order.length; i++) { var h = findHeader(book.sheets[order[i]] || [], ABC_NEED); if (h) return { sheet: order[i], h: h }; }
    return null;
  }
  function criteriaOf(book) {
    var names = Object.keys(book.sheets || {}), sh = null;
    for (var i = 0; i < names.length; i++) if (norm(names[i]) === 'criteria') { sh = book.sheets[names[i]]; break; }
    if (!sh) return null;
    var out = {};
    sh.forEach(function (r) { var k = norm(v(r && r[0])); if (k) out[k] = r ? v(r[1]) : null; });
    return out;
  }
  // -> {ok, rows, problems, warnings, meta:{file, license, expYear, runOn, records}}
  function parseAbc(book, fileName, opts) {
    var year = (opts && opts.year) || new Date().getFullYear();
    var d = findAbcData(book);
    if (!d) {
      var probe = { sheets: book.sheets };
      if (parseFileMaker(probe).ok) return { ok: false, problems: ['This looks like the FileMaker export, not the ABC search. Add it under FileMaker Export.'] };
      return { ok: false, problems: ['No sheet with UPC, Registration Number, State and Expiration Date. Is this the ABC registration search download?'] };
    }
    var crit = criteriaOf(book), problems = [], warnings = [];
    var license = crit ? s(crit.distributorlicensenumber) : '';
    var expYear = crit && crit.expirationyear != null && crit.expirationyear !== '' ? parseInt(crit.expirationyear, 10) : null;
    var runOnP = crit ? parseDate(crit.reportrunon) : null;
    if (!crit) problems.push('The Criteria sheet is missing, so the license this search ran for cannot be checked. Download the search again from ABC (Excel) and add that file.');
    else if (license !== LICENSE) problems.push(license ? 'This search ran for license ' + license + ', not Kohler’s ' + LICENSE + '.' : 'This search was not filtered to Kohler’s license ' + LICENSE + '. Search again with Distributor License Number ' + LICENSE + '.');
    if (expYear != null && expYear < year) problems.push('This search covers registrations expiring in ' + expYear + '. Only ' + year + ' and later count. Search again with Expiration Year ' + year + ' (or later).');
    var rows = book.sheets[d.sheet] || [], I = d.h.idx, out = [], recordsFound = null;
    var col = function (r, name) { var k = norm(name); return k in I ? r[I[k]] : null; };
    for (var r = d.h.at + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var first = s(row[0]), m = /^Records Found:\s*([\d,]+)/i.exec(first);
      if (m) { recordsFound = parseInt(m[1].replace(/,/g, ''), 10); continue; }
      var upc = digits(s(col(row, 'UPC'))), reg = regNo(s(col(row, 'Registration Number')));
      if (!upc && !reg) continue;
      var exp = parseDate(v(col(row, 'Expiration Date')));
      out.push({
        id: s(col(row, 'objectid')) || (reg + ':' + upc),
        upc: upc, reg: reg,
        state: s(col(row, 'State')),
        exp: exp, expText: dateText(exp) || s(col(row, 'Expiration Date')),
        registrant: s(col(row, 'Registrant')),
        name: s(col(row, 'Product Name')),
        variety: s(col(row, 'Variety Name')),
        type: s(col(row, 'Product Type')),
        size: [s(col(row, 'Unit Volume Amount')), s(col(row, 'Unit Volume Type'))].filter(Boolean).join(' '),
        unit: s(col(row, 'Unit Type')), qty: s(col(row, 'Unit Quantity'))
      });
    }
    if (!out.length) problems.push('The ABC search has no registrations in it.');
    if (recordsFound != null && recordsFound !== out.length) warnings.push('ABC says ' + recordsFound.toLocaleString('en-US') + ' records; ' + out.length.toLocaleString('en-US') + ' were read.');
    var meta = { file: fileName || '', license: license, expYear: expYear, runOn: runOnP ? dateText(runOnP) : '', records: out.length };
    return { ok: !problems.length, rows: out, problems: problems, warnings: warnings, meta: meta };
  }

  /* ------------------------------------------------------------ the audit */
  function statusOf(a, year) {
    var st = String(a.state || '').toLowerCase();
    if (a.exp && a.exp.y < year) return 'expired';
    if (st === 'current') return a.exp ? 'current' : 'current';
    if (st === 'pending') return 'pending';
    return 'expired';   // Historical (or anything else ABC prints)
  }
  // abcRows: the merged rows of every accepted ABC file; fmRows: parseFileMaker().rows
  function audit(fmRows, abcRows, opts) {
    var year = (opts && opts.year) || new Date().getFullYear();
    var seen = {}, abc = [];
    abcRows.forEach(function (a) { var k = a.id + '|' + a.reg + '|' + a.upc; if (!seen[k]) { seen[k] = 1; a.status = statusOf(a, year); abc.push(a); } });
    var byUpc = {}, byUpc0 = {}, byReg = {}, byNoCheck = {};
    abc.forEach(function (a) {
      if (a.upc) {
        (byUpc[a.upc] = byUpc[a.upc] || []).push(a);
        var z = strip0(a.upc); (byUpc0[z] = byUpc0[z] || []).push(a);
        if (z.length > 8) (byNoCheck[z.slice(0, -1)] = byNoCheck[z.slice(0, -1)] || []).push(a);
      }
      if (a.reg) (byReg[a.reg] = byReg[a.reg] || []).push(a);
    });
    var out = fmRows.map(function (f) {
      var d = digits(f.upc), tier = 0, hits = [];
      if (d) {
        if (byUpc[d]) { hits = byUpc[d]; tier = 1; }
        else if (byUpc0[strip0(d)]) { hits = byUpc0[strip0(d)]; tier = 2; }
      }
      var cur = hits.filter(function (a) { return a.status === 'current'; });
      var regRows = f.reg ? (byReg[f.reg] || []) : [];
      var regCur = regRows.filter(function (a) { return a.status === 'current'; });
      var bucket, note = '', found = [];
      if (!d) { bucket = 'noupc'; found = regRows; }
      else if (cur.length) {
        found = cur;
        if (f.reg && cur.some(function (a) { return a.reg === f.reg; })) bucket = 'match';
        else { bucket = 'wrongreg'; note = f.reg ? 'FileMaker has ' + f.reg + '; ABC lists this UPC under ' + uniq(cur.map(function (a) { return a.reg; })).join(', ') + '.' : 'FileMaker has no registration number; ABC lists this UPC under ' + uniq(cur.map(function (a) { return a.reg; })).join(', ') + '.'; }
      } else if (regCur.length) {
        bucket = 'notonreg'; found = regCur.slice(0, 4);
        note = 'Registration ' + f.reg + ' is current (' + regCur[0].name + '), but this UPC is not on it.';
        var was = hits.filter(function (a) { return a.status !== 'current'; });
        if (was.length) note += ' The UPC was on ' + uniq(was.map(function (a) { return a.reg + ' (' + a.state + ')'; })).join(', ') + '.';
      } else {
        var pend = hits.filter(function (a) { return a.status === 'pending'; }).concat(regRows.filter(function (a) { return a.status === 'pending'; }));
        var old = hits.filter(function (a) { return a.status === 'expired'; }).concat(regRows.filter(function (a) { return a.status === 'expired'; }));
        if (pend.length) { bucket = 'pending'; found = pend; note = 'Pending at ABC under ' + uniq(pend.map(function (a) { return a.reg; })).join(', ') + '.'; }
        else if (old.length) { bucket = 'expired'; found = old; note = 'Found only as ' + uniq(old.map(function (a) { return a.state + (a.exp ? ' (expires ' + a.exp.y + ')' : ''); })).join(', ') + ' under ' + uniq(old.map(function (a) { return a.reg; })).join(', ') + '.'; }
        else {
          bucket = 'notreg';
          // a hint, never a match: the same UPC with the check digit missing / added
          var z = strip0(d), near = (byNoCheck[z] || []).concat(byUpc0[z.slice(0, -1)] || []).filter(function (a) { return a.status === 'current'; });
          if (near.length) { found = near.slice(0, 3); note = 'Possible check-digit difference: ABC has UPC ' + near[0].upc + ' on registration ' + near[0].reg + ' (' + near[0].name + '). Check before registering.'; }
        }
      }
      if (tier === 2 && bucket !== 'notreg') note = (note ? note + ' ' : '') + 'Matched after removing leading zeros (ABC UPC ' + hits[0].upc + ').';
      return {
        code: f.code, fm: f, upc: f.upc, reg: f.reg, name: f.name,
        bucket: bucket, tier: tier, note: note,
        abc: found.slice(0, 6).map(function (a) { return { reg: a.reg, upc: a.upc, state: a.state, exp: a.expText, registrant: a.registrant, name: a.name, variety: a.variety, size: a.size, unit: a.unit, qty: a.qty }; }),
        abcRegs: uniq(found.map(function (a) { return a.reg; }))
      };
    });
    var counts = {}; BUCKETS.forEach(function (b) { counts[b.key] = 0; });
    out.forEach(function (r) { counts[r.bucket]++; });
    return { rows: out, counts: counts, abcRows: abc.length, year: year };
  }
  function uniq(a) { var o = [], k = {}; a.forEach(function (x) { if (x && !k[x]) { k[x] = 1; o.push(x); } }); return o; }

  // previous run's open codes [[code, bucket]] vs this run -> {code: 'new'|'still'} + resolved list
  function compare(rows, prevOpen) {
    var prev = {}; (prevOpen || []).forEach(function (p) { if (p && p[0]) prev[p[0]] = p[1]; });
    var tag = {}, resolved = [], openNow = {};
    rows.forEach(function (r) { if (r.bucket !== 'match') { openNow[r.code] = 1; tag[r.code] = prev[r.code] ? 'still' : 'new'; } });
    Object.keys(prev).forEach(function (c) { if (!openNow[c]) resolved.push(c); });
    return { tag: tag, resolved: resolved };
  }

  var API = { LICENSE: LICENSE, BUCKETS: BUCKETS, BUCKET: BUCKET, NEEDS_REGISTRATION: NEEDS_REGISTRATION, FM_COLS: FM_COLS,
    parseFileMaker: parseFileMaker, parseAbc: parseAbc, audit: audit, compare: compare, parseDate: parseDate, digits: digits };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.KdhUpc = API;
})(typeof window !== 'undefined' ? window : globalThis);
