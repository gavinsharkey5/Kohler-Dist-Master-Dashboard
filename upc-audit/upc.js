/* UPC REGISTRATION AUDIT -- the page (2026-10-15). README.txt has the rules;
 * the matching itself is engine.js (KdhUpc). Both files are read in this
 * browser and never uploaded. Supabase holds only the notes log (upc_notes)
 * and a summary of each run (upc_runs). */
(function () {
'use strict';
const app = document.getElementById('app');
const E = window.KdhUpc, XR = window.KdhXlsxRead;
const U = window.kdhUser ? window.kdhUser() : null;
const cookie = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
const REAL = (() => { try { return JSON.parse(cookie('kdh_user') || 'null'); } catch (e) { return null; } })();
const MIGRATION = 'supabase/migrations/20261015190000_upc_audit.sql';
const YEAR = new Date().getFullYear();
const PAGE = 100;
// a rep / associate preview never opens it; a manager preview (Gavin's View As) is read-only
if (U && U.preview && U.role !== 'manager') { app.innerHTML = '<div class="kdh-state unavailable"><b>UPC Registration Audit Is Not Part of This View</b><span>Exit preview to open it.</span></div>'; return; }
// The middleware already decided who may load this page. The cookie's upc flag can be older than the
// person's access (a cookie written before upc_audit was ticked), so a manager without it is asked about
// once more against the database (kdh_upc_can) before being turned away.
const NOT_AVAILABLE = '<div class="kdh-state unavailable"><b>Not Available</b><span>The UPC Registration Audit is for IT and the brand managers.</span></div>';
if (REAL && REAL.role !== 'it' && REAL.role !== 'manager') { app.innerHTML = NOT_AVAILABLE; return; }
const CHECK_ACCESS = !!(REAL && REAL.role === 'manager' && !REAL.upc);
const READONLY = !!(U && U.preview);
const STATUS = [['open', 'Open'], ['submitted', 'Submitted to ABC'], ['waiting_supplier', 'Waiting on Supplier'], ['fixed_filemaker', 'Fixed in FileMaker'], ['registered', 'Registered'], ['not_needed', 'Not Needed']];
const STATUS_L = Object.fromEntries(STATUS);

const S = { fm: null, abc: [], res: null, prev: null, cmp: null, notes: {}, notesState: 'loading', runs: null, saved: null,
  f: { b: 'attn', q: '' }, shown: PAGE, busy: false, err: '' };

/* ---------------- helpers ---------------- */
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = n => Number(n || 0).toLocaleString('en-US');
const plural = (n, w, p) => n0(n) + ' ' + (n === 1 ? w : (p || w + 's'));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(ts) { if (!ts) return ''; const d = new Date(ts); if (isNaN(d)) return ''; let h = d.getHours(), ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return MON[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== YEAR ? ', ' + d.getFullYear() : '') + ' ' + h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap; }
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const NEEDS = E.NEEDS_REGISTRATION;

/* ---------------- Supabase ---------------- */
const cfg = () => { const c = window.KDH_AUTH; const t = cookie('kdh_at'); return c && c.url && c.key && t ? { url: String(c.url).replace(/\/$/, ''), key: c.key, token: t } : null; };
async function rest(path, opts, retry) {
  const c = cfg(); if (!c) throw Object.assign(new Error('off'), { off: true });
  const o = opts || {};
  const h = Object.assign({ apikey: c.key, authorization: 'Bearer ' + c.token, accept: 'application/json' }, o.headers || {});
  if (o.body != null) h['content-type'] = 'application/json';
  const r = await fetch(c.url + '/rest/v1/' + path, { method: o.method || 'GET', headers: h, body: o.body != null ? JSON.stringify(o.body) : undefined });
  if (r.status === 401 && !retry && window.kdhFreshToken) { try { await window.kdhFreshToken(); } catch (e) {} return rest(path, opts, true); }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
  if (!r.ok) {
    const code = j && j.code || '', msg = (j && (j.message || j.hint)) || ('HTTP ' + r.status);
    const err = new Error(msg); err.status = r.status; err.code = code;
    err.missing = r.status === 404 && /PGRST20[25]/.test(code) || /relation .* does not exist|Could not find/.test(msg);
    throw err;
  }
  return j;
}
async function loadNotes() {
  try {
    const rows = await rest('upc_notes?select=id,product_code,upc,status,note,bucket,author_name,created_at&order=created_at.desc&limit=20000');
    const by = {}; (rows || []).forEach(n => { (by[n.product_code] = by[n.product_code] || []).push(n); });
    S.notes = by; S.notesState = 'ok';
  } catch (e) { S.notesState = e.off ? 'off' : e.missing ? 'missing' : 'error'; S.notesErr = e.message; }
}
async function loadRuns() {
  try { S.runs = await rest('upc_runs?select=id,created_at,run_by_name,fm_file,fm_rows,abc_files,counts&order=created_at.desc&limit=20'); }
  catch (e) { S.runs = null; S.runsState = e.off ? 'off' : e.missing ? 'missing' : 'error'; }
}
async function lastOpen() {
  try { const r = await rest('upc_runs?select=id,created_at,run_by_name,open_codes&order=created_at.desc&limit=1'); return r && r[0] || null; }
  catch (e) { return null; }
}

/* ---------------- files ---------------- */
async function readBook(file) { return XR.read(await file.arrayBuffer()); }
async function addFm(file) {
  S.err = ''; S.res = null;
  try {
    const p = E.parseFileMaker(await readBook(file), file.name);
    S.fm = Object.assign({ name: file.name }, p);
  } catch (e) { S.fm = { name: file.name, ok: false, problems: ['Could not read this file: ' + (e.message || e) + '. Save it as .xlsx and try again.'] }; }
  render();
}
async function addAbc(files) {
  S.err = ''; S.res = null;
  for (const file of files) {
    let p;
    try { p = E.parseAbc(await readBook(file), file.name, { year: YEAR }); }
    catch (e) { p = { ok: false, problems: ['Could not read this file: ' + (e.message || e) + '. Download the search again as Excel and add that file.'], rows: [] }; }
    S.abc = S.abc.filter(a => a.name !== file.name).concat([Object.assign({ name: file.name }, p)]);
  }
  render();
}
const readyFm = () => S.fm && S.fm.ok;
const readyAbc = () => S.abc.length && S.abc.every(a => a.ok);

async function run() {
  if (!readyFm() || !readyAbc() || S.busy) return;
  S.busy = true; render();
  try {
    const rows = [].concat(...S.abc.map(a => a.rows));
    S.res = E.audit(S.fm.rows, rows, { year: YEAR });
    S.res.at = new Date().toISOString();
    S.prev = await lastOpen();
    S.cmp = S.prev ? E.compare(S.res.rows, S.prev.open_codes) : null;
    if (S.notesState !== 'ok') await loadNotes();
    S.f = { b: 'attn', q: '' }; S.shown = PAGE;
    S.saved = null;
    if (!READONLY && S.notesState === 'ok') {
      try {
        const body = { fm_file: S.fm.name.slice(0, 300), fm_rows: S.fm.rows.length,
          abc_files: S.abc.map(a => ({ file: a.name, rows: a.rows.length, license: a.meta.license, expYear: a.meta.expYear, runOn: a.meta.runOn })),
          counts: S.res.counts, open_codes: S.res.rows.filter(r => r.bucket !== 'match').map(r => [r.code, r.bucket]) };
        const saved = await rest('upc_runs', { method: 'POST', body, headers: { prefer: 'return=representation' } });
        S.saved = Array.isArray(saved) && saved[0] ? 'ok' : 'refused';   // never trust a 2xx under row-level security
      } catch (e) { S.saved = 'error'; }
      loadRuns().then(render);
    }
  } finally { S.busy = false; }
  render();
  const r = document.getElementById('results'); if (r) r.scrollIntoView({ block: 'start' });
}

/* ---------------- rows ---------------- */
const ORDER = Object.fromEntries(E.BUCKETS.map((b, i) => [b.key, i]));
function latest(code) { const a = S.notes[code]; return a && a[0] || null; }
function view() {
  if (!S.res) return [];
  const q = S.f.q.trim().toLowerCase(), b = S.f.b;
  return S.res.rows.filter(r => {
    if (b === 'attn' ? r.bucket === 'match' : b === 'needreg' ? !NEEDS[r.bucket] : b !== 'all' && r.bucket !== b) return false;
    if (!q) return true;
    return (r.code + ' ' + r.upc + ' ' + r.reg + ' ' + r.name + ' ' + r.fm.registrant + ' ' + r.abcRegs.join(' ')).toLowerCase().includes(q);
  }).sort((a, x) => ORDER[a.bucket] - ORDER[x.bucket] || a.name.localeCompare(x.name));
}
function pill(b) { return '<span class="bk bk-' + b + '">' + esc(E.BUCKET[b].label) + '</span>'; }
function rowHtml(r) {
  const n = latest(r.code), tag = S.cmp && S.cmp.tag[r.code];
  const meta = ['#' + r.code, r.upc ? 'UPC ' + r.upc : 'No UPC', r.reg ? 'FileMaker Reg # ' + r.reg : 'No Reg #'].join(' · ');
  return '<button type="button" class="ur" data-code="' + esc(r.code) + '">' +
    '<span class="ur-top"><b class="ur-n">' + esc(r.name || '(no product name)') + '</b>' + pill(r.bucket) + (tag === 'new' ? '<span class="tg new">New</span>' : '') + '</span>' +
    '<span class="ur-m">' + esc(meta) + '</span>' +
    (r.bucket !== 'match' ? '<span class="ur-a">' + esc(r.note || E.BUCKET[r.bucket].action) + '</span>' : '') +
    (n ? '<span class="ur-note">' + (n.status ? '<span class="st st-' + n.status + '">' + esc(STATUS_L[n.status]) + '</span> ' : '') + esc(n.note ? (n.note.length > 140 ? n.note.slice(0, 140) + '…' : n.note) : '') + ' <span class="by">' + esc(first(n.author_name)) + ', ' + esc(when(n.created_at)) + '</span></span>' : '') +
    '</button>';
}

/* ---------------- render ---------------- */
function fileCard() {
  const fm = S.fm;
  const fmLine = !fm ? '<span class="muted">Not added yet</span>' : fm.ok
    ? '<span class="ok">' + esc(fm.name) + ' · ' + plural(fm.rows.length, 'product') + '</span>' + (fm.warnings || []).map(w => '<span class="warn">' + esc(w) + '</span>').join('')
    : '<span class="bad">' + esc(fm.name) + '</span>' + (fm.problems || []).map(p => '<span class="bad">' + esc(p) + '</span>').join('');
  const abcLines = !S.abc.length ? '<span class="muted">Not added yet</span>' : S.abc.map(a => {
    const head = a.ok
      ? '<span class="ok">' + esc(a.name) + ' · ' + plural(a.rows.length, 'registration') + (a.meta.expYear ? ' expiring ' + a.meta.expYear : ' (all years)') + (a.meta.runOn ? ' · run ' + esc(a.meta.runOn) : '') + '</span>'
      : '<span class="bad">' + esc(a.name) + '</span>';
    return '<span class="fl">' + head + (a.problems || []).map(p => '<span class="bad">' + esc(p) + '</span>').join('') + (a.warnings || []).map(w => '<span class="warn">' + esc(w) + '</span>').join('') +
      '<button type="button" class="linkbtn rm" data-rm="' + esc(a.name) + '" aria-label="Remove ' + esc(a.name) + '">Remove</button></span>';
  }).join('');
  const can = readyFm() && readyAbc();
  return '<section class="card up">' +
    '<div class="step"><div class="step-h"><span class="num">1</span><div><b>FileMaker Export</b><small>Vlad’s product export (.xlsx)</small></div>' +
      '<label class="btn sm"><input type="file" id="fmIn" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' + (fm ? 'Replace File' : 'Choose File') + '</label></div>' +
      '<div class="step-s" id="fmS">' + fmLine + '</div></div>' +
    '<div class="step"><div class="step-h"><span class="num">2</span><div><b>ABC Registration Search</b><small>License ' + E.LICENSE + ' · expiring ' + YEAR + ' or later (add one file per year)</small></div>' +
      '<label class="btn sm"><input type="file" id="abcIn" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple hidden>' + (S.abc.length ? 'Add Another' : 'Choose File') + '</label></div>' +
      '<div class="step-s" id="abcS">' + abcLines + '</div></div>' +
    '<div class="go"><button type="button" class="btn primary" id="runBtn"' + (can ? '' : ' disabled') + (S.busy ? ' aria-busy="true"' : '') + '>Run Audit</button>' +
      '<span class="muted">' + (can ? 'Both files are read on this device. Nothing is uploaded.' : 'Add both files to run the audit. Nothing is uploaded.') + '</span></div>' +
    '<details class="fold"><summary>How It Works</summary><ul class="rules">' +
      '<li>UPCs are matched digit for digit, then again with leading zeros removed.</li>' +
      '<li>A registration counts when ABC shows it Current and it expires in ' + YEAR + ' or later. Pending, Historical and past years do not count.</li>' +
      '<li>Matched = the UPC is on a current registration and FileMaker has that registration number.</li>' +
      '<li>The ABC file must be the Excel download of a search for license ' + E.LICENSE + '. Add a second file for next year’s registrations once renewals start.</li>' +
      '<li>Notes are kept by product code, newest first, and never edited, so the history stays.</li></ul></details>' +
    '</section>';
}
function summary() {
  const c = S.res.counts, total = S.res.rows.length, attn = total - c.match, need = c.notreg + c.notonreg + c.expired;
  const tiles = [['attn', 'Need Attention', attn], ['needreg', 'Still to Register', need]].concat(E.BUCKETS.map(b => [b.key, b.short, c[b.key]]));
  const abcMeta = S.abc.map(a => plural(a.rows.length, 'registration') + (a.meta.expYear ? ' expiring ' + a.meta.expYear : '') + (a.meta.runOn ? ' (run ' + a.meta.runOn + ')' : '')).join(' + ');
  let since = '';
  if (S.prev && S.cmp) {
    const newN = Object.values(S.cmp.tag).filter(t => t === 'new').length, still = Object.values(S.cmp.tag).filter(t => t === 'still').length;
    since = '<p class="since">Since the last run (' + esc(when(S.prev.created_at)) + (S.prev.run_by_name ? ', ' + esc(first(S.prev.run_by_name)) : '') + '): <b>' + n0(newN) + ' new</b> · ' + n0(still) + ' still open · <b>' + n0(S.cmp.resolved.length) + ' resolved</b>' +
      (S.cmp.resolved.length ? ' <button type="button" class="linkbtn" id="showRes">Show Resolved</button>' : '') + '</p>';
  } else if (S.notesState === 'ok') since = '<p class="since">First run on file. The next run will show what is new and what was resolved.</p>';
  return '<div class="res-h" id="results"><h2>Results</h2><button type="button" class="btn sm" id="dlX">Download Excel</button></div>' +
    '<p class="meta">' + plural(total, 'product') + ' from FileMaker · ' + esc(abcMeta) + ' · checked ' + esc(when(S.res.at)) + '</p>' + since +
    savedLine() +
    '<div class="tiles" role="group" aria-label="Filter by result">' + tiles.map(t => '<button type="button" class="tile t-' + t[0] + '" data-b="' + t[0] + '" aria-pressed="' + (S.f.b === t[0]) + '"><b>' + n0(t[2]) + '</b><span>' + esc(t[1]) + '</span></button>').join('') +
      '<button type="button" class="tile t-all" data-b="all" aria-pressed="' + (S.f.b === 'all') + '"><b>' + n0(total) + '</b><span>All Products</span></button></div>';
}
function savedLine() {
  if (READONLY) return '<p class="note-off">Preview: notes are read-only and this run is not saved.</p>';
  if (S.notesState === 'missing') return '<p class="note-off">Notes and run history turn on once ' + esc(MIGRATION) + ' is run in Supabase.</p>';
  if (S.notesState === 'off') return '<p class="note-off">Notes and run history are not set up on this copy of the site.</p>';
  if (S.notesState === 'error') return '<p class="note-off">Notes could not be loaded (' + esc(S.notesErr || 'error') + '). The audit still works.</p>';
  if (S.saved === 'error' || S.saved === 'refused') return '<p class="note-off">This run could not be saved to the history. The results below are still correct.</p>';
  return '';
}
function list() {
  const rows = view(), shown = rows.slice(0, S.shown);
  const label = S.f.b === 'attn' ? 'Need Attention' : S.f.b === 'needreg' ? 'Still to Register' : S.f.b === 'all' ? 'All Products' : E.BUCKET[S.f.b].label;
  return '<div class="lbar"><input type="search" id="q" placeholder="Search code, UPC, name, registrant or reg #" value="' + esc(S.f.q) + '" aria-label="Search products"></div>' +
    '<p class="cnt"><b>' + esc(label) + '</b> · ' + plural(rows.length, 'product') + (S.f.b !== 'attn' && S.f.b !== 'all' && E.BUCKET[S.f.b] ? ' · ' + esc(E.BUCKET[S.f.b].action) : '') + '</p>' +
    (rows.length ? '<div class="ul" id="ul">' + shown.map(rowHtml).join('') + '</div>' : '<div class="kdh-state empty"><b>Nothing Here</b><span>' + (S.f.q ? 'No product matches “' + esc(S.f.q) + '”.' : 'No products in this group.') + '</span></div>') +
    (rows.length > shown.length ? '<button type="button" class="btn wide" id="more">Show ' + n0(Math.min(PAGE, rows.length - shown.length)) + ' More (' + n0(rows.length - shown.length) + ' left)</button>' : '');
}
function history() {
  if (!S.runs || !S.runs.length) return '';
  return '<details class="fold hist"><summary>Previous Runs (' + S.runs.length + ')</summary><div class="runs">' + S.runs.map(r => {
    const c = r.counts || {}, attn = Object.keys(c).filter(k => k !== 'match').reduce((a, k) => a + (c[k] || 0), 0);
    return '<div class="run"><b>' + esc(when(r.created_at)) + '</b> <span class="muted">' + esc(r.run_by_name || '') + '</span><span>' + plural(r.fm_rows, 'product') + ' · ' + n0(attn) + ' need attention · ' + n0(c.match || 0) + ' matched</span><span class="muted">' + esc(r.fm_file) + ' · ' + esc((r.abc_files || []).map(a => a.file).join(', ')) + '</span></div>';
  }).join('') + '</div></details>';
}
function render() {
  const y = window.scrollY;
  app.innerHTML = '<div class="upc-h"><h1>UPC Registration Audit</h1><p class="sub">FileMaker products checked against ABC state registrations</p></div>' +
    fileCard() + (S.res ? '<section class="resw">' + summary() + list() + '</section>' : '') + history();
  wire();
  window.scrollTo(0, y);
}
function renderList() {
  const host = document.querySelector('.resw'); if (!host) return render();
  const y = window.scrollY, active = document.activeElement && document.activeElement.id;
  host.innerHTML = summary() + list();
  wire();
  if (active === 'q') { const q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  window.scrollTo(0, y);
}

/* ---------------- wiring ---------------- */
let qT = 0;
function wire() {
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on('fmIn', 'change', e => { const f = e.target.files[0]; if (f) addFm(f); });
  on('abcIn', 'change', e => { const fs = Array.from(e.target.files || []); if (fs.length) addAbc(fs); });
  on('runBtn', 'click', run);
  on('dlX', 'click', download);
  on('more', 'click', () => { S.shown += PAGE; renderList(); });
  on('showRes', 'click', showResolved);
  on('q', 'input', e => { clearTimeout(qT); const v = e.target.value; qT = setTimeout(() => { S.f.q = v; S.shown = PAGE; renderList(); }, 150); });
  app.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { S.abc = S.abc.filter(a => a.name !== b.dataset.rm); S.res = null; render(); }));
  app.querySelectorAll('.tile[data-b]').forEach(b => b.addEventListener('click', () => { S.f.b = b.dataset.b; S.shown = PAGE; renderList(); }));
  const ul = document.getElementById('ul');
  if (ul) ul.addEventListener('click', e => { const b = e.target.closest('.ur'); if (b) openDetail(b.dataset.code, b); });
}

/* ---------------- detail sheet + notes ---------------- */
let lastFocus = null;
function closeSheet() { const o = document.getElementById('upcSheet'); if (o) o.remove(); document.documentElement.classList.remove('upc-lock'); if (lastFocus && lastFocus.isConnected) lastFocus.focus(); }
function openDetail(code, from) {
  const r = S.res.rows.find(x => x.code === code); if (!r) return;
  lastFocus = from || null;
  closeSheet();
  const f = r.fm, notes = S.notes[code] || [];
  const kv = (k, v) => v ? '<div class="kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>' : '';
  const abc = r.abc.length ? r.abc.map(a => '<div class="abc"><b>Reg # ' + esc(a.reg) + '</b> <span class="as as-' + esc(String(a.state).toLowerCase()) + '">' + esc(a.state) + '</span> <span class="muted">expires ' + esc(a.exp) + '</span>' +
    '<span>' + esc([a.name, a.variety].filter(Boolean).join(' · ')) + '</span><span class="muted">' + esc([a.registrant, 'UPC ' + a.upc, [a.qty, a.unit, a.size].filter(Boolean).join(' x ')].filter(Boolean).join(' · ')) + '</span></div>').join('')
    : '<p class="muted">' + (r.bucket === 'noupc' ? 'No UPC to look up.' : 'No ABC registration has this UPC or this registration number.') + '</p>';
  const form = READONLY ? '<p class="note-off">Preview: notes are read-only.</p>'
    : S.notesState === 'ok' ? '<form id="noteF" class="nf"><label for="nSt">Status</label><select id="nSt"><option value="">No change</option>' + STATUS.map(s => '<option value="' + s[0] + '">' + esc(s[1]) + '</option>').join('') + '</select>' +
      '<label for="nTx">Note</label><textarea id="nTx" maxlength="2000" placeholder="What was done, who to follow up with, a submission #"></textarea>' +
      '<div class="nf-a"><button type="submit" class="btn primary" id="nSave">Save Note</button><span id="nMsg" class="muted" role="status"></span></div></form>'
    : '<p class="note-off">' + (S.notesState === 'missing' ? 'Notes turn on once ' + esc(MIGRATION) + ' is run.' : 'Notes are unavailable right now.') + '</p>';
  const log = notes.length ? notes.map(n => '<li><span class="nh">' + (n.status ? '<span class="st st-' + n.status + '">' + esc(STATUS_L[n.status]) + '</span>' : '') + '<span class="by">' + esc(n.author_name || 'Someone') + ' · ' + esc(when(n.created_at)) + (n.bucket && E.BUCKET[n.bucket] ? ' · result then: ' + esc(E.BUCKET[n.bucket].label) : '') + '</span></span>' + (n.note ? '<span class="nt">' + esc(n.note) + '</span>' : '') + '</li>').join('') : '';
  const o = document.createElement('div');
  o.id = 'upcSheet'; o.className = 'upc-ov';
  o.innerHTML = '<div class="upc-sh" role="dialog" aria-modal="true" aria-labelledby="shT">' +
    '<div class="sh-h"><div><h2 id="shT">' + esc(r.name || '(no product name)') + '</h2><p class="muted">#' + esc(r.code) + '</p></div><button type="button" class="btn sm" id="shX">Close</button></div>' +
    '<div class="sh-b">' + pill(r.bucket) +
    '<p class="act"><b>' + esc(E.BUCKET[r.bucket].action) + '</b>' + (r.note ? '<br>' + esc(r.note) : '') + '</p>' +
    '<h3>FileMaker</h3><div class="kvs">' + kv('UPC', f.upc || 'None') + kv('Reg #', f.reg || 'None') + kv('Registrant', f.registrant) + kv('Type', f.type) + kv('Package', f.size) + kv('Units', [f.units, f.unit].filter(Boolean).join(' ')) + kv('Vintage', f.vintage) + kv('Proof', f.proof) + '</div>' +
    '<h3>ABC</h3>' + abc +
    '<h3>Notes' + (notes.length ? ' (' + notes.length + ')' : '') + '</h3>' + form + (log ? '<ul class="log">' + log + '</ul>' : (S.notesState === 'ok' ? '<p class="muted">No notes yet.</p>' : '')) +
    '</div></div>';
  document.body.appendChild(o);
  document.documentElement.classList.add('upc-lock');
  o.addEventListener('click', e => { if (e.target === o) closeSheet(); });
  o.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  document.getElementById('shX').addEventListener('click', closeSheet);
  document.getElementById('shX').focus();
  const nf = document.getElementById('noteF');
  if (nf) nf.addEventListener('submit', async e => {
    e.preventDefault();
    const st = document.getElementById('nSt').value, tx = document.getElementById('nTx').value.trim(), msg = document.getElementById('nMsg'), btn = document.getElementById('nSave');
    if (!st && !tx) { msg.textContent = 'Pick a status or write a note.'; return; }
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); msg.textContent = '';
    try {
      const out = await rest('upc_notes', { method: 'POST', headers: { prefer: 'return=representation' }, body: { product_code: r.code, upc: r.upc || null, status: st || null, note: tx, bucket: r.bucket } });
      const row = Array.isArray(out) && out[0];
      if (!row) throw new Error('The note was not saved (no permission).');   // never trust a 2xx under row-level security
      (S.notes[r.code] = S.notes[r.code] || []).unshift(row);
      renderList();
      openDetail(r.code, document.querySelector('.ur[data-code="' + CSS.escape(r.code) + '"]'));
      const m2 = document.getElementById('nMsg'); if (m2) m2.textContent = 'Saved.';
    } catch (err) {
      btn.disabled = false; btn.removeAttribute('aria-busy');
      msg.textContent = err.missing ? 'Notes are not live yet (run ' + MIGRATION + ').' : 'Not saved: ' + (err.message || 'error');
    }
  });
}
function showResolved() {
  const byCode = Object.fromEntries(S.res.rows.map(r => [r.code, r]));
  const prev = Object.fromEntries((S.prev.open_codes || []).map(p => [p[0], p[1]]));
  closeSheet();
  lastFocus = document.getElementById('showRes');
  const o = document.createElement('div'); o.id = 'upcSheet'; o.className = 'upc-ov';
  o.innerHTML = '<div class="upc-sh" role="dialog" aria-modal="true" aria-labelledby="shT"><div class="sh-h"><div><h2 id="shT">Resolved Since the Last Run</h2><p class="muted">' + plural(S.cmp.resolved.length, 'product') + '</p></div><button type="button" class="btn sm" id="shX">Close</button></div><div class="sh-b"><ul class="log">' +
    S.cmp.resolved.map(c => { const r = byCode[c]; return '<li><span class="nh"><b>' + esc(r ? r.name : c) + '</b></span><span class="muted">#' + esc(c) + ' · was ' + esc(E.BUCKET[prev[c]] ? E.BUCKET[prev[c]].label : prev[c]) + ' · ' + (r ? 'now ' + esc(E.BUCKET[r.bucket].label) : 'no longer in the FileMaker export') + '</span></li>'; }).join('') +
    '</ul></div></div>';
  document.body.appendChild(o); document.documentElement.classList.add('upc-lock');
  o.addEventListener('click', e => { if (e.target === o) closeSheet(); });
  o.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  document.getElementById('shX').addEventListener('click', closeSheet); document.getElementById('shX').focus();
}

/* ---------------- Excel ---------------- */
function download() {
  if (!S.res || !window.KdhXlsx) return;
  const head = ['Result', 'What To Do', 'Product Code', 'Product Name', 'Product Type', 'Package Size', 'Units', 'FileMaker UPC', 'FileMaker Reg #', 'FileMaker Registrant',
    'ABC Reg # Found', 'ABC State', 'ABC Expires', 'ABC Registrant', 'ABC Product Name', 'ABC UPC', 'Match Detail', 'Since Last Run', 'Latest Note Status', 'Latest Note', 'Note By', 'Note Date', 'Notes on File'];
  const line = r => { const a = r.abc[0] || {}, n = latest(r.code), t = S.cmp ? (S.cmp.tag[r.code] === 'new' ? 'New' : S.cmp.tag[r.code] === 'still' ? 'Still Open' : '') : '';
    return [E.BUCKET[r.bucket].label, E.BUCKET[r.bucket].action, r.code, r.name, r.fm.type, r.fm.size, [r.fm.units, r.fm.unit].filter(Boolean).join(' '), r.upc, r.reg, r.fm.registrant,
      r.abcRegs.join(', '), a.state || '', a.exp || '', a.registrant || '', [a.name, a.variety].filter(Boolean).join(' · '), a.upc || '', r.note, t,
      n && n.status ? STATUS_L[n.status] : '', n ? n.note : '', n ? n.author_name : '', n ? when(n.created_at) : '', (S.notes[r.code] || []).length || ''];
  };
  const sorted = S.res.rows.slice().sort((a, x) => ORDER[a.bucket] - ORDER[x.bucket] || a.name.localeCompare(x.name));
  const widths = [24, 44, 12, 46, 10, 10, 10, 16, 12, 28, 14, 10, 13, 28, 34, 16, 50, 11, 18, 40, 16, 18, 8];
  const c = S.res.counts;
  const summaryRows = [['UPC Registration Audit'], ['Checked', when(S.res.at)], ['FileMaker export', S.fm.name, plural(S.fm.rows.length, 'product')]]
    .concat(S.abc.map(a => ['ABC search', a.name, plural(a.rows.length, 'registration') + (a.meta.expYear ? ', expiring ' + a.meta.expYear : '') + (a.meta.runOn ? ', run ' + a.meta.runOn : '') + ', license ' + a.meta.license]))
    .concat([[], ['Result', 'Products', 'What To Do']], E.BUCKETS.map(b => [b.label, c[b.key], b.action]))
    .concat([[], ['Rules'], ['A registration counts when ABC shows it Current and it expires in ' + YEAR + ' or later.'], ['UPCs match digit for digit, then with leading zeros removed. Any ABC row for the UPC with FileMaker’s registration number counts.']]);
  if (S.prev && S.cmp) summaryRows.push([], ['Since the last run', when(S.prev.created_at), Object.values(S.cmp.tag).filter(t => t === 'new').length + ' new, ' + S.cmp.resolved.length + ' resolved']);
  const blob = window.KdhXlsx.book([
    { name: 'Summary', rows: summaryRows, widths: [24, 40, 60] },
    { name: 'Need Attention', rows: [head].concat(sorted.filter(r => r.bucket !== 'match').map(line)), widths, freeze: 1 },
    { name: 'All Products', rows: [head].concat(sorted.map(line)), widths, freeze: 1 }
  ]);
  const d = new Date(), name = 'UPC_Registration_Audit_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.xlsx';
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------------- start ---------------- */
async function start() {
  if (CHECK_ACCESS) {
    app.innerHTML = '<div class="kdh-state loading"><b>Checking access</b></div>';
    let ok = false;
    try { ok = (await rest('rpc/kdh_upc_can', { method: 'POST', body: {} })) === true; } catch (e) { ok = false; }
    if (!ok) { app.innerHTML = NOT_AVAILABLE; return; }
  }
  render();
  Promise.all([loadNotes(), loadRuns()]).then(render);
}
start();
})();
