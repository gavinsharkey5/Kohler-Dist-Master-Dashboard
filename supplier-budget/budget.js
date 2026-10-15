/* Supplier Budgets (2026-10-14). The tracker workbook as a page: a Ledger of
   expenses, an Add / Edit Expense form, a Budget tab. Every row comes from
   PostgREST with the signed-in token; row-level security decides what each
   manager sees and who may write (budget_editor / program_admin). The page
   never filters by name on its own except the brand-scope cut the brief asks
   for, and never takes a 2xx as proof a write happened: every POST / PATCH /
   DELETE asks for the rows back and counts them. README.txt has every rule. */
(function(){
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = $('#app');
const U = (function(){ try{ return window.kdhUser ? window.kdhUser() : null; }catch(e){ return null; } })();
// a MANAGER preview (Gavin's View As -> Manager) is allowed: read-only, the rows cut to what that manager would see
// (kdh_budget_standing says who they are); a rep or associate preview is refused like a rep
if(!U || U.role !== 'manager'){
  app.innerHTML = '<div class="kdh-state unavailable"><b>Supplier Budgets Is for Managers</b><span>' + (U && U.preview ? 'Exit preview to open it: supplier budgets never reach a rep.' : 'Managers only.') + '</span></div>';
  return;
}
const PREVIEW = !!U.preview;
const cookie = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
const cfg = () => { const c = window.KDH_AUTH; const t = cookie('kdh_at'); return c && c.url && c.key && t ? {url: String(c.url).replace(/\/$/, ''), key: c.key, token: t} : null; };
const MIGRATION = 'supabase/migrations/20261014210000_supplier_budget.sql';
const PAGE = 100;
const YEAR = new Date().getFullYear();
const COLS = [ // Time Entered first (the default sort), then the sheet's columns in its order. k = sort key
  {k: 'created_at', l: 'Time Entered', w: 7}, {k: 'expense_date', l: 'Date', w: 5}, {k: 'year', l: 'Year', num: 1, w: 4, narrow: 1}, {k: 'invoice', l: 'Invoice', w: 7}, {k: 'vendor', l: 'Vendor', w: 7},
  {k: 'description', l: 'Description', acct: 1, w: 7.5}, {k: 'brand_manager', l: 'Brand Manager', acct: 1, w: 7}, {k: 'items_purchased', l: 'Items Purchased', wrap: 1, w: 9},
  {k: 'total_amount', l: 'Total', num: 1, money: 1, w: 7}, {k: 'kohler_spend', l: 'Kohler Spend', num: 1, money: 1, w: 7}, {k: 'billback_amount', l: 'Billback', num: 1, money: 1, w: 6.5},
  {k: 'billback_received', l: 'Received', w: 6}, {k: 'code', l: 'Code', acct: 1, w: 5}, {k: 'account', l: 'Account', acct: 1, w: 10.5}, {k: 'notes', l: 'Notes', wrap: 1, w: 4.5, narrow: 1}];
const S = {me: null, accounts: null, expenses: null, vendors: [], recent: [], settings: {}, settingsMissing: false, scope: undefined, missing: false, err: null,
  f: Object.assign({q: '', year: String(YEAR), acct: '', sup: '', bm: '', rec: '', from: '', to: ''}, sget('kdh_sb_f') || {}),
  sort: sget('kdh_sb_sort2') || {k: 'created_at', d: -1}, shown: PAGE, hl: '', msg: null, form: null, keep: null, scroll: 0};
function sget(k){ try{ return JSON.parse(sessionStorage.getItem(k) || 'null'); }catch(e){ return null; } }
function sset(k, v){ try{ sessionStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

/* ---------------- formats ---------------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
const TODAY = ymd(new Date());
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dShort(s){ if(!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return MON[+m-1] + ' ' + (+d) + (String(y) !== String(YEAR) ? ', ' + y : ''); }
function dNum(s){ if(!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return (+m) + '/' + (+d) + '/' + y; }
const n2 = v => v == null || v === '' ? null : Math.round(Number(v) * 100) / 100;
function money(v, blank){ if(v == null || isNaN(v)) return blank || '—'; const neg = v < 0; const s = Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}); return (neg ? '-$' : '$') + s; }
function money0(v, blank){ if(v == null || isNaN(v)) return blank || '—'; const neg = v < 0; return (neg ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : null;
const first = n => String(n || '').trim().split(/\s+/)[0] || '';

/* ---------------- data ---------------- */
async function rest(path, opts, retry){
  const c = cfg(); if(!c) throw Object.assign(new Error('off'), {off: true});
  const o = opts || {};
  const h = Object.assign({apikey: c.key, authorization: 'Bearer ' + c.token, accept: 'application/json'}, o.headers || {});
  if(o.body != null) h['content-type'] = 'application/json';
  const r = await fetch(c.url + '/rest/v1/' + path, {method: o.method || 'GET', headers: h, body: o.body != null ? JSON.stringify(o.body) : undefined});
  if(r.status === 401 && !retry && window.kdhFreshToken){ try{ await window.kdhFreshToken(); }catch(e){} return rest(path, opts, true); }
  const txt = await r.text(); let j = null; try{ j = txt ? JSON.parse(txt) : null; }catch(e){ j = null; }
  if(!r.ok){
    const code = j && j.code || ''; const msg = (j && (j.message || j.hint)) || ('HTTP ' + r.status);
    const err = new Error(msg); err.status = r.status; err.code = code;
    err.missing = r.status === 404 && /PGRST20[25]/.test(code) || /relation .* does not exist|Could not find/.test(msg);
    throw err;
  }
  return j;
}
function friendly(e){
  if(!e) return 'Something went wrong.';
  if(e.off) return 'Supplier Budgets are not set up on this copy of the site.';
  if(e.missing) return 'Supplier Budgets are not live yet. Run ' + MIGRATION + ' in the Supabase SQL Editor, then paste the seed (supplier-budget/README.txt).';
  const m = String(e.message || '');
  const known = m.match(/(billback must be between 0 and the total amount|the date must fall in an open year|an expense needs a vendor|an expense needs a total amount|an account needs a name|a budget cannot be negative)/);
  if(known) return known[1].charAt(0).toUpperCase() + known[1].slice(1) + '.';
  if(/duplicate key/.test(m)) return 'That account name already exists for this year.';
  if(/row-level security|permission denied/.test(m)) return 'You do not have permission to change supplier budgets.';
  return m.length > 160 ? m.slice(0, 160) + '…' : m;
}
const EXP_COLS = 'id,account_id,expense_date,year,invoice,vendor,items_purchased,total_amount,billback_amount,kohler_spend,billback_received,received_date,notes,source,created_by,created_name,created_at,updated_by,updated_name,updated_at';
async function load(){
  S.err = null; S.missing = false;
  try{
    const me = await rest('rpc/kdh_budget_me', {method: 'POST', body: {}});
    S.me = me || {editor: false, admin: false, manager: true};
    if(PREVIEW){
      // the previewed manager's standing; without the RPC (migration not run) the preview is read-only over every account
      let st = null; try{ st = await rest('rpc/kdh_budget_standing', {method: 'POST', body: {p_name: U.name}}); }catch(e){ st = null; }
      S.me = st ? {editor: !!st.editor, admin: !!st.admin, manager: true, found: st.found !== false, brands: Array.isArray(st.brands) ? st.brands : []} : {editor: true, admin: true, manager: true, unknown: true, brands: []};
    }
    const [acc, exp, ven, set] = await Promise.all([
      rest('budget_accounts?select=*&order=year.desc,account.asc'),
      rest('supplier_expenses?select=' + EXP_COLS + '&order=expense_date.desc,created_at.desc&limit=20000'),
      rest('budget_vendors?select=name,uses,last_used&order=uses.desc,name.asc').catch(() => []),
      rest('budget_settings?select=key,value').catch(() => { S.settingsMissing = true; return []; })
    ]);
    S.accounts = acc || []; S.expenses = exp || []; setVendors(ven || []);
    S.settings = {}; (set || []).forEach(x => { if(x && x.key) S.settings[x.key] = x.value; });
  }catch(e){
    if(e.missing || (e.status === 404 && /kdh_budget_me/.test(String(e.message)))) S.missing = true; else S.err = e;
    S.accounts = S.accounts || []; S.expenses = S.expenses || [];
  }
  if(S.scope === undefined){
    S.scope = null;
    if(S.me && !S.me.editor && !S.me.admin && window.kdhBrandScope){
      try{ S.scope = await Promise.race([window.kdhBrandScope(), new Promise(r => setTimeout(() => r(null), 3000))]); }catch(e){ S.scope = null; }
      if(PREVIEW && S.me.brands && S.me.brands.length){ const sc = (S.scope || []).concat(S.me.brands); sc.suppliers = ((S.scope && S.scope.suppliers) || []).concat(S.me.brands); S.scope = sc; }
    }
  }
}
const canEdit = () => !PREVIEW && !!(S.me && (S.me.editor || S.me.admin));
const previewEditor = () => PREVIEW && !!(S.me && (S.me.editor || S.me.admin));
const acctById = id => (S.accounts || []).find(a => a.id === id);
// SAVED VENDORS: by uses for the typeahead, by last use for the quick buttons (a new name is saved by the database on Save)
function setVendors(rows){
  S.vendors = rows.map(v => v.name);
  S.recent = rows.slice().sort((a, b) => String(b.last_used || '').localeCompare(String(a.last_used || '')) || (b.uses || 0) - (a.uses || 0)).map(v => v.name);
}
function useVendor(name){ S.vendors = [name].concat(S.vendors.filter(v => v !== name)); S.recent = [name].concat(S.recent.filter(v => v !== name)); }
const canonVendor = v => { const t = String(v || '').trim(); const hit = S.vendors.find(x => x.toLowerCase() === t.toLowerCase()); return hit || t; };
function lastVendorFor(accountId){ const rows = (S.expenses || []).filter(e => e.account_id === accountId).sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || ''))); return rows.length ? rows[0].vendor : ''; }
// BILLBACK RULE per account: split = 50/50, none = no billback (Constellation / Crown), manual = typed each time
const RULES = [{v: 'split', l: '50/50 Split'}, {v: 'none', l: 'No Split (Kohler Pays All)'}, {v: 'manual', l: 'Enter Each Time'}];
const NO_SPLIT_RX = /crown|constellation/i;
const hasRules = () => (S.accounts || []).some(a => a && 'billback_rule' in a);
function ruleOf(a){ if(!a) return 'manual'; if(a.billback_rule) return a.billback_rule; return NO_SPLIT_RX.test([a.account, a.supplier, a.description].join(' ')) ? 'none' : 'manual'; }
// INVOICE LINKS: a numeric invoice opens in Encompass once an editor saves one invoice's address (settings.invoice_link)
const invNum = v => { const m = String(v == null ? '' : v).trim().match(/^(\d{3,})(?:\.0+)?$/); return m ? m[1] : ''; };
const invUrl = v => { const n = invNum(v), t = S.settings.invoice_link; return n && t ? t.split('{invoice}').join(encodeURIComponent(n)) : ''; };
function invHtml(v){ if(v == null || v === '') return ''; const u = invUrl(v); return u ? '<a class="inv" href="' + esc(u) + '" target="_blank" rel="noopener" title="Open invoice ' + esc(invNum(v)) + ' in Encompass">' + esc(invNum(v)) + '</a>' : esc(v); }
// the brand-scope cut the brief asks for (RLS already applies the same rule server-side with the database's own brands)
function visibleAccounts(){
  const all = S.accounts || [];
  if(canEdit() || previewEditor() || !S.me) return all;
  const me = U.name || '';
  return all.filter(a => (a.brand_manager && window.kdhMatchName && window.kdhMatchName(me, [a.brand_manager])) || (S.scope && window.kdhBrandMatch && window.kdhBrandMatch([a.supplier, a.account], S.scope)));
}
function joined(){
  const vis = new Map(visibleAccounts().map(a => [a.id, a]));
  return (S.expenses || []).map(e => { const a = vis.get(e.account_id); return a ? Object.assign({}, e, {account: a.account, code: a.code, supplier: a.supplier, brand_manager: a.brand_manager, description: a.description, _a: a}) : null; }).filter(Boolean);
}

/* ---------------- routing ---------------- */
function view(){ const h = location.hash.replace(/^#/, ''); const m = h.match(/^([a-z]+)(?:=(.+))?$/); return m ? {v: m[1], id: m[2] || ''} : {v: 'ledger', id: ''}; }
function go(h){ if(S.msg && !S.msg.shown) S.msg.to = h; location.hash = h; }   // only a message not yet shown travels with the move
// a message travels only to the screen it was sent to (go), and any other navigation drops it
window.addEventListener('hashchange', () => { const h = location.hash.replace(/^#/, ''); if(S.msg && S.msg.to !== h) S.msg = null; render(); if(S.msg) S.msg.to = null; });

/* ---------------- filters ---------------- */
function filtered(rows){
  const f = S.f; const q = f.q.trim().toLowerCase();
  return rows.filter(r => {
    if(f.year && String(r.year) !== f.year) return false;
    if(f.acct && r.account_id !== f.acct) return false;
    if(f.sup && (r.supplier || '(No Supplier)') !== f.sup) return false;
    if(f.bm && (r.brand_manager || '(No Brand Manager)') !== f.bm) return false;
    if(f.rec === 'yes' && !r.billback_received) return false;
    if(f.rec === 'no' && (r.billback_received || !(r.billback_amount > 0))) return false;
    if(f.from && r.expense_date < f.from) return false;
    if(f.to && r.expense_date > f.to) return false;
    if(q){ const hay = [r.vendor, r.invoice, r.items_purchased, r.account, r.code, r.description, r.brand_manager, r.notes, r.supplier].join(' ').toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });
}
function sorted(rows){
  const {k, d} = S.sort; const col = COLS.find(c => c.k === k) || COLS[0];
  return rows.slice().sort((a, b) => {
    let x = a[k], y = b[k];
    if(col.num){ x = x == null ? -Infinity : +x; y = y == null ? -Infinity : +y; }
    else if(k === 'billback_received'){ x = a.billback_received ? 1 : 0; y = b.billback_received ? 1 : 0; }
    else if(k === 'created_at'){ x = a.source === 'site' ? (a.created_at || '') : ''; y = b.source === 'site' ? (b.created_at || '') : ''; }
    else { x = String(x || '').toLowerCase(); y = String(y || '').toLowerCase(); }
    if(x < y) return -d; if(x > y) return d;
    if(k !== 'expense_date' && a.expense_date !== b.expense_date) return (b.expense_date || '').localeCompare(a.expense_date || '');
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}
function strip(rows, accts){
  const spend = rows.reduce((s, r) => s + (+r.kohler_spend || 0), 0);
  const recv = rows.reduce((s, r) => s + (r.billback_received ? (+r.billback_amount || 0) : 0), 0);
  const out = rows.reduce((s, r) => s + (!r.billback_received ? (+r.billback_amount || 0) : 0), 0);
  const budget = accts.reduce((s, a) => s + (+a.budget_amount || 0), 0);
  return {budget, spend, recv, out, pct: pct(spend, budget)};
}
// the accounts the current filter is "about": Account / Supplier / Brand Manager / Year narrow it; search and dates do not
function accountsInFilter(){
  const f = S.f;
  return visibleAccounts().filter(a => (!f.year || String(a.year) === f.year) && (!f.acct || a.id === f.acct) && (!f.sup || (a.supplier || '(No Supplier)') === f.sup) && (!f.bm || (a.brand_manager || '(No Brand Manager)') === f.bm));
}
function activeLine(n){
  const f = S.f, parts = [];
  if(f.q.trim()) parts.push('“' + f.q.trim() + '”');
  if(f.acct){ const a = acctById(f.acct); if(a) parts.push(a.account); }
  if(f.sup) parts.push(f.sup); if(f.bm) parts.push(f.bm);
  if(f.rec === 'yes') parts.push('Billback Received'); if(f.rec === 'no') parts.push('Billback Outstanding');
  if(f.from || f.to) parts.push((f.from ? dNum(f.from) : '…') + ' – ' + (f.to ? dNum(f.to) : '…'));
  if(!parts.length) return '';
  return '<div class="afl"><span>' + esc(parts.join(' · ')) + ' · <b>' + n.toLocaleString() + ' Rows</b></span><button type="button" class="btn sm" id="sbClear">Clear</button></div>';
}

/* ---------------- views ---------------- */
function render(){
  const v = view();
  app.classList.toggle('wide', v.v === 'ledger' || v.v === 'budget');
  if(S.accounts === null){ app.innerHTML = '<div class="kdh-state loading">Loading…</div>'; return; }
  if(v.v === 'new' && canEdit()) return renderForm(null);
  if(v.v === 'edit' && v.id){ const e = (S.expenses || []).find(x => x.id === v.id); if(e) return canEdit() ? renderForm(e) : renderView(e); }
  if(v.v === 'budget') return renderBudget();
  renderLedger();
}
function header(sub){
  return '<div class="sb-head"><h1>Supplier Budgets<small>' + esc(sub) + '</small></h1>' +
    '<div class="acts">' + (canEdit() ? '<a class="btn primary" href="#new" id="sbNew">Add Expense</a>' : previewEditor() ? '<button type="button" class="btn primary" id="sbNewOff" disabled title="Saving is off in preview">Add Expense</button>' : '') + '</div></div>' +
    (S.missing ? '<div class="kdh-state unavailable"><b>Supplier Budgets Are Not Live Yet</b><span>Run ' + esc(MIGRATION) + ' in the Supabase SQL Editor, then paste the seed from supplier-budget/seed_from_workbook.py.</span></div>' : '') +
    (S.err ? '<div class="kdh-state error"><b>Could Not Load</b><span>' + esc(friendly(S.err)) + '</span></div>' : '') +
    (S.msg ? (S.msg.shown = true, '<div class="msg' + (S.msg.bad ? ' bad' : '') + '">' + esc(S.msg.text) + '</div>') : '') +
    tabs();
}
function tabs(){ const v = view().v; return '<div class="seg" role="tablist"><button type="button" role="tab" aria-pressed="' + (v !== 'budget') + '" data-go="ledger">Ledger</button><button type="button" role="tab" aria-pressed="' + (v === 'budget') + '" data-go="budget">Budget</button></div>'; }
function whoLine(){
  if(PREVIEW){
    const who = first(U.name) || 'this manager';
    if(S.me.unknown) return 'Previewing ' + who + ' over every account. Run supabase/migrations/20261015090000_budget_preview.sql to see their exact standing. Saving is off in preview.';
    if(S.me.found === false) return who + ' is not on the allow list as a manager, so they would see nothing here. Saving is off in preview.';
    if(previewEditor()) return who + ' can add and edit expenses and budgets. Saving is off in preview.';
    return who + ' sees only the accounts filed under their name or their suppliers, read only.' + (S.scope && S.scope.suppliers && S.scope.suppliers.length ? ' Their Suppliers: ' + S.scope.suppliers.slice(0, 6).join(', ') + '.' : '');
  }
  if(canEdit()) return (S.me.admin && !S.me.editor ? 'You see every account (program admin).' : 'You can add and edit expenses and budgets.') + ' Tap any row to edit it, imported rows included.';
  const s = S.scope && S.scope.suppliers && S.scope.suppliers.length ? ' Your Suppliers: ' + S.scope.suppliers.slice(0, 6).join(', ') + (S.scope.suppliers.length > 6 ? ' (and ' + (S.scope.suppliers.length - 6) + ' more)' : '') + '.' : '';
  return 'Read only. You see the accounts filed under your name or your suppliers.' + s;
}
function options(list, cur, blank){ return '<option value="">' + esc(blank) + '</option>' + list.map(x => '<option value="' + esc(x.v) + '"' + (x.v === cur ? ' selected' : '') + '>' + esc(x.l) + '</option>').join(''); }
function renderLedger(){
  const all = joined();
  const rows = sorted(filtered(all));
  const years = Array.from(new Set(all.map(r => String(r.year)))).sort().reverse();
  const accts = visibleAccounts().filter(a => !S.f.year || String(a.year) === S.f.year).sort((a, b) => a.account.localeCompare(b.account));
  const sups = Array.from(new Set(accts.map(a => a.supplier || '(No Supplier)'))).sort();
  const bms = Array.from(new Set(accts.map(a => a.brand_manager || '(No Brand Manager)'))).sort();
  const st = strip(rows, accountsInFilter());
  const shown = rows.slice(0, S.shown);
  app.innerHTML = header(whoLine()) +
    '<div class="strip">' +
      '<div class="st"><b>' + money0(st.budget, '—') + '</b><span>Total Budget</span></div>' +
      '<div class="st"><b>' + money0(st.spend) + '</b><span>Kohler Spend</span></div>' +
      '<div class="st' + (st.pct != null && st.pct > 100 ? ' warn' : '') + '"><b>' + (st.pct == null ? '—' : st.pct + '%') + '</b><span>% to Budget</span></div>' +
      '<div class="st ok"><b>' + money0(st.recv) + '</b><span>Billback Received</span></div>' +
      '<div class="st' + (st.out > 0 ? ' warn' : '') + '"><b>' + money0(st.out) + '</b><span>Billback Outstanding</span></div>' +
    '</div>' +
    '<div class="fbar">' +
      '<div class="q"><label for="sbQ">Search</label><input type="search" id="sbQ" placeholder="Vendor, invoice, items, account…" value="' + esc(S.f.q) + '" autocomplete="off"></div>' +
      '<div><label for="sbYear">Year</label><select id="sbYear" data-f="year">' + options(years.map(y => ({v: y, l: y + (y !== String(YEAR) && +y < YEAR ? ' (History)' : '')})), S.f.year, 'All Years') + '</select></div>' +
      '<div><label for="sbAcct">Account</label><select id="sbAcct" data-f="acct">' + options(accts.map(a => ({v: a.id, l: a.account + (a.code ? ' · ' + a.code : '')})), S.f.acct, 'All Accounts') + '</select></div>' +
      '<div><label for="sbSup">Supplier</label><select id="sbSup" data-f="sup">' + options(sups.map(s => ({v: s, l: s})), S.f.sup, 'All Suppliers') + '</select></div>' +
      '<div><label for="sbBm">Brand Manager</label><select id="sbBm" data-f="bm">' + options(bms.map(s => ({v: s, l: s})), S.f.bm, 'All Brand Managers') + '</select></div>' +
      '<div><label for="sbRec">Billback</label><select id="sbRec" data-f="rec">' + options([{v: 'yes', l: 'Received'}, {v: 'no', l: 'Outstanding'}], S.f.rec, 'Any') + '</select></div>' +
      '<div><label for="sbFrom">From</label><input type="date" id="sbFrom" data-f="from" value="' + esc(S.f.from) + '"></div>' +
      '<div><label for="sbTo">To</label><input type="date" id="sbTo" data-f="to" value="' + esc(S.f.to) + '"></div>' +
    '</div>' +
    activeLine(rows.length) +
    (rows.length ? tableHtml(shown) + cardsHtml(shown) : '<div class="kdh-state empty"><b>No Expenses Match</b><span>' + (all.length ? 'Change the filters.' : (S.missing ? '' : 'Nothing has been entered yet.')) + '</span></div>') +
    (rows.length > S.shown ? '<div class="more"><button type="button" class="btn" id="sbMore">Show More (' + (rows.length - S.shown).toLocaleString() + ' Left)</button></div>' : '') +
    '<div class="sb-note">' + rows.length.toLocaleString() + ' of ' + all.length.toLocaleString() + ' rows' + (canEdit() ? ' · <button type="button" class="back" id="sbCsv">Export CSV</button>' : '') + '</div>' +
    '<details class="fold"><summary>About This Data</summary><div class="body">Kohler Spend is always Total minus Billback. Constellation / Crown accounts never split: their Billback is $0, so Kohler Spend equals the Total. Accounts set to 50/50 fill half the Total as the Billback when you enter an expense. Description, Brand Manager and Code come from the account on the Budget tab. Rows marked History were imported from the 2025 tab of the tracker workbook; rows from the 2026 tab carry their original cells in the database. Billback Received is marked here by the office; "Received" with a date means the supplier paid it back.</div></details>' + invLinkFold();
  wireLedger(rows);
}
function recBtn(r, compact){
  if(!(r.billback_amount > 0)) return '<span class="rec none">—</span>';
  const on = !!r.billback_received;
  const label = on ? (compact ? 'Yes' : 'Received') + (r.received_date ? ' ' + dShort(r.received_date) : '') : (compact ? 'No' : 'Not Yet');
  return '<button type="button" class="rec' + (on ? ' yes' : '') + '" data-rec="' + esc(r.id) + '"' + (canEdit() ? '' : ' disabled') + ' aria-pressed="' + on + '" title="' + (canEdit() ? 'Tap to mark ' + (on ? 'not received' : 'received') : (on ? 'Billback received' : 'Billback not yet received')) + '">' + esc(label) + '</button>';
}
function editedBy(r){ const who = r.updated_name || r.created_name; if(!who || r.source !== 'site' && !r.updated_name) return ''; const same = !r.updated_at || r.updated_at === r.created_at; return '<span class="edited">' + (same ? 'Added' : 'Edited') + ' by ' + esc(first(who)) + ' ' + esc(dShort((r.updated_at || r.created_at || '').slice(0, 10))) + '</span>'; }
function tEntered(r){
  if(r.source !== 'site' || !r.created_at) return '';
  const d = new Date(r.created_at); if(isNaN(d)) return '';
  const h = d.getHours(), m = pad(d.getMinutes());
  return MON[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== YEAR ? ', ' + d.getFullYear() : '') + ' ' + ((h % 12) || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
}
function cell(r, c){
  if(c.k === 'created_at'){ const t = tEntered(r); return t ? esc(t) : '<span class="muted">Imported</span>'; }
  if(c.k === 'expense_date') return '<span class="nw">' + esc(dShort(r.expense_date)) + '</span>';
  if(c.k === 'billback_received') return recBtn(r, true);
  if(c.k === 'invoice') return invHtml(r.invoice);
  if(c.k === 'code' || c.k === 'year') return '<span class="nw">' + esc(r[c.k] == null ? '' : r[c.k]) + '</span>';
  if(c.money) return esc(money(n2(r[c.k])));
  if(c.k === 'vendor') return esc(r.vendor) + editedBy(r) + (r.source === 'import_2025' ? '<span class="chip hist">History</span>' : '');
  return esc(r[c.k] == null ? '' : r[c.k]);
}
function tableHtml(rows){
  const s = S.sort;
  return '<div class="tbl-wrap"><table class="led"><thead><tr>' + COLS.map(c => '<th' + (c.num ? ' class="num"' : '') + (c.narrow ? ' data-narrow="1"' : '') + ' style="width:' + c.w + '%" data-sort="' + c.k + '" aria-sort="' + (s.k === c.k ? (s.d > 0 ? 'ascending' : 'descending') : 'none') + '">' + esc(c.l).replace('Description', 'Descrip&shy;tion').replace('Received', 'Re&shy;ceived') + (s.k === c.k ? '<span class="ar">' + (s.d > 0 ? '▲' : '▼') + '</span>' : '') + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr class="r' + (r.id === S.hl ? ' hl' : '') + (r.source === 'import_2025' ? ' hist' : '') + '" data-id="' + esc(r.id) + '">' + COLS.map(c => '<td' + (c.num ? ' class="num"' : c.wrap ? ' class="wrap"' : '') + (c.narrow ? ' data-narrow="1"' : '') + ' title="' + esc(c.money ? '' : (r[c.k] || '')) + '">' + cell(r, c) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
}
function cardsHtml(rows){
  return '<div class="cards">' + rows.map(r => '<div class="card' + (r.id === S.hl ? ' hl' : '') + '" role="button" tabindex="0" data-id="' + esc(r.id) + '">' +
    '<span class="t"><span>' + esc(r.vendor) + '</span><b>' + esc(money(n2(r.total_amount))) + '</b></span>' +
    '<span class="m">' + esc(dShort(r.expense_date)) + ' · ' + esc(r.account) + (r.code ? ' · ' + esc(r.code) : '') + (r.source === 'import_2025' ? ' · History' : '') + '</span>' +
    (tEntered(r) ? '<span class="m">Entered ' + esc(tEntered(r)) + '</span>' : '') +
    (r.items_purchased ? '<span class="m">' + esc(r.items_purchased) + '</span>' : '') +
    '<span class="f"><div><span>Kohler Spend</span><b>' + esc(money(n2(r.kohler_spend))) + '</b></div><div><span>Billback</span><b>' + esc(money(n2(r.billback_amount))) + '</b></div>' +
    (r.invoice ? '<div><span>Invoice</span><b>' + invHtml(r.invoice) + '</b></div>' : '') + (r.brand_manager ? '<div><span>Brand Manager</span><b>' + esc(r.brand_manager) + '</b></div>' : '') + '</span>' +
    '<span class="row2">' + recBtn(r) + editedBy(r) + '</span></div>').join('') + '</div>';
}
function wireLedger(rows){
  const bar = document.getElementById('kdhBar'); const live = document.getElementById('kdhLive');
  document.documentElement.style.setProperty('--sb-top', ((bar ? bar.offsetHeight : 0) + (live ? live.offsetHeight : 0)) + 'px');
  const q = $('#sbQ'); if(q){ let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.f.q = q.value; S.shown = PAGE; sset('kdh_sb_f', S.f); const pos = q.selectionStart; renderLedger(); const q2 = $('#sbQ'); if(q2){ q2.focus(); try{ q2.setSelectionRange(pos, pos); }catch(e){} } }, 180); }); }
  $$('[data-f]').forEach(el => el.addEventListener('change', () => { S.f[el.dataset.f] = el.value; if(el.dataset.f === 'year'){ S.f.acct = ''; } S.shown = PAGE; sset('kdh_sb_f', S.f); renderLedger(); }));
  const cl = $('#sbClear'); if(cl) cl.addEventListener('click', () => { S.f = {q: '', year: String(YEAR), acct: '', sup: '', bm: '', rec: '', from: '', to: ''}; S.shown = PAGE; sset('kdh_sb_f', S.f); renderLedger(); });
  $$('th[data-sort]').forEach(th => th.addEventListener('click', () => { const k = th.dataset.sort; S.sort = S.sort.k === k ? {k, d: -S.sort.d} : {k, d: k === 'expense_date' || k === 'created_at' || COLS.find(c => c.k === k).num ? -1 : 1}; sset('kdh_sb_sort2', S.sort); renderLedger(); }));
  const more = $('#sbMore'); if(more) more.addEventListener('click', () => { S.shown += PAGE; renderLedger(); });
  $$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  $$('tr.r,.card[data-id]').forEach(el => { el.addEventListener('click', ev => { if(ev.target.closest('[data-rec],a.inv')) return; go('edit=' + el.dataset.id); }); el.addEventListener('keydown', ev => { if(ev.key === 'Enter' && ev.target === el) go('edit=' + el.dataset.id); }); });
  $$('[data-rec]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); if(!canEdit()) return; toggleReceived(b.dataset.rec, b); }));
  const csv = $('#sbCsv'); if(csv) csv.addEventListener('click', () => exportCsv(rows));
  wireInvLink();
  if(S.hl){ const el = document.querySelector('.tbl-wrap tr.hl') || document.querySelector('.card.hl'); if(el && el.offsetParent) el.scrollIntoView({block: 'center'}); setTimeout(() => { S.hl = ''; $$('.hl').forEach(x => x.classList.remove('hl')); }, 6000); }
}

/* ---------------- writes ---------------- */
function rep(){ return {headers: {prefer: 'return=representation'}}; }
function replaceRow(row){ const i = S.expenses.findIndex(e => e.id === row.id); if(i >= 0) S.expenses[i] = Object.assign({}, S.expenses[i], row); else S.expenses.unshift(row); }
async function toggleReceived(id, btn){
  const e = S.expenses.find(x => x.id === id); if(!e) return;
  const want = !e.billback_received;
  btn.setAttribute('aria-busy', 'true');
  try{
    const r = await rest('supplier_expenses?id=eq.' + encodeURIComponent(id) + '&select=' + EXP_COLS, Object.assign({method: 'PATCH', body: {billback_received: want, received_date: want ? TODAY : null}}, rep()));
    if(!r || !r.length) throw new Error('Not saved: the database did not return the row (no permission or the row is gone).');
    replaceRow(r[0]); S.msg = null; renderLedger();
  }catch(err){ btn.removeAttribute('aria-busy'); S.msg = {text: friendly(err), bad: true}; renderLedger(); }
}
function exportCsv(rows){
  const H = ['Time Entered','Date','Year','Invoice','Vendor Name','Description','Brand Manager','Items Purchased','Total Amount','Kohler Spend','Billback Amt','Billback Received?','Received Date','Code','Account','Supplier','Notes','Source'];
  const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [H.join(',')].concat(rows.map(r => [tEntered(r) ? r.created_at : '', r.expense_date, r.year, r.invoice, r.vendor, r.description, r.brand_manager, r.items_purchased, n2(r.total_amount), n2(r.kohler_spend), n2(r.billback_amount), r.billback_received ? 'Y' : 'N', r.received_date || '', r.code, r.account, r.supplier, r.notes, r.source].map(q).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'supplier-expenses-' + TODAY + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------- invoice links (editors set one Encompass address) ---------------- */
function invLinkFold(){
  if(!canEdit()) return '';
  const on = !!S.settings.invoice_link;
  return '<details class="fold" id="sbInvFold"><summary>Invoice Links to Encompass' + (on ? ' · On' : '') + '</summary><div class="body">' +
    (S.settingsMissing ? '<p class="sb-note" style="margin:0">Run supabase/migrations/20261015150000_budget_rules.sql to turn this on.</p>' :
    '<p class="sb-note" style="margin:0 0 10px">' + (on ? 'Numeric invoice numbers open in Encompass.' : 'Open any invoice in Encompass, copy the address from the browser, and paste it here with that invoice\'s number. Every numeric invoice on this page then opens in Encompass.') + '</p>' +
    '<div class="two"><div class="fld"><label for="ilUrl">Address of One Invoice</label><input type="text" id="ilUrl" inputmode="url" placeholder="https://kohlerdist.encompass8.com/…" autocomplete="off"></div>' +
    '<div class="fld"><label for="ilNum">That Invoice\'s Number</label><input type="text" id="ilNum" inputmode="numeric" autocomplete="off"></div></div>' +
    '<div class="err" id="ilErr"></div><div class="acts" style="margin-top:8px"><button type="button" class="btn" id="ilSave">Save Link</button>' + (on ? '<button type="button" class="btn ghost" id="ilOff">Turn Off</button>' : '') + '</div>') +
    '</div></details>';
}
function linkTemplate(url, num){
  url = String(url || '').trim(); num = String(num || '').trim();
  if(!/^\d{3,}$/.test(num)) return {err: 'Type the invoice number, digits only.'};
  let u; try{ u = new URL(url); }catch(e){ return {err: 'Paste the full address, starting with https://'}; }
  if(u.protocol !== 'https:' || !/(^|\.)encompass8\.com$/i.test(u.hostname)) return {err: 'That is not an Encompass address (it should end in encompass8.com).'};
  const parts = url.split(num);
  if(parts.length === 1) return {err: 'That number is not in the address. Copy the address while that invoice is open.'};
  if(parts.length > 2) return {err: 'That number appears more than once in the address. Pick an invoice with a different number.'};
  return {t: parts.join('{invoice}')};
}
function wireInvLink(){
  const save = $('#ilSave'), off = $('#ilOff'), err = $('#ilErr');
  const put = async value => {
    const r = value == null
      ? await rest('budget_settings?key=eq.invoice_link&select=key,value', Object.assign({method: 'DELETE'}, rep()))
      : await rest('budget_settings?on_conflict=key&select=key,value', {method: 'POST', body: {key: 'invoice_link', value}, headers: {prefer: 'resolution=merge-duplicates,return=representation'}});
    if(value != null && (!r || !r.length)) throw new Error('Not saved: the database did not return the setting (no permission?).');
    if(value == null) delete S.settings.invoice_link; else S.settings.invoice_link = r[0].value;
  };
  if(save) save.addEventListener('click', async () => {
    const t = linkTemplate($('#ilUrl').value, $('#ilNum').value);
    if(t.err){ err.textContent = t.err; return; }
    save.setAttribute('aria-busy', 'true');
    try{ await put(t.t); S.msg = {text: 'Invoice links saved. Numeric invoices now open in Encompass.'}; renderLedger(); }
    catch(e){ save.removeAttribute('aria-busy'); err.textContent = /Encompass address/.test(e.message) ? 'That is not an Encompass address.' : friendly(e); }
  });
  if(off) off.addEventListener('click', async () => {
    off.setAttribute('aria-busy', 'true');
    try{ await put(null); S.msg = {text: 'Invoice links turned off.'}; renderLedger(); }
    catch(e){ off.removeAttribute('aria-busy'); err.textContent = friendly(e); }
  });
}

/* ---------------- the form (Add / Edit Expense) ---------------- */
function blankForm(){ const k = S.keep || {}; return {expense_date: k.expense_date || TODAY, account_id: k.account_id || '', vendor: k.vendor || '', items_purchased: '', invoice: '', total_amount: '', billback_amount: '0', billback_received: false, received_date: TODAY, notes: ''}; }
function renderForm(e){
  const edit = !!e;
  const f = S.form && S.form.id === (e ? e.id : 'new') ? S.form : Object.assign({id: e ? e.id : 'new', bbAuto: !e}, edit ? {expense_date: e.expense_date, account_id: e.account_id, vendor: e.vendor, items_purchased: e.items_purchased || '', invoice: e.invoice || '', total_amount: e.total_amount == null ? '' : String(e.total_amount), billback_amount: e.billback_amount == null ? '0' : String(e.billback_amount), billback_received: !!e.billback_received, received_date: e.received_date || TODAY, notes: e.notes || ''} : blankForm());
  S.form = f;
  const a = acctById(f.account_id);
  if(ruleOf(a) === 'none') f.billback_amount = '0';
  const total = n2(f.total_amount), bb = n2(f.billback_amount) || 0;
  const spend = total == null ? null : Math.round((total - bb) * 100) / 100;
  app.innerHTML = '<button type="button" class="back" id="sbBack">‹ Ledger</button>' +
    '<h1>' + (edit ? 'Edit Expense' : 'Add Expense') + (edit && e.source !== 'site' ? '<small>Imported from the tracker workbook' + (e.source === 'import_2025' ? ' (2025 history)' : '') + '</small>' : '') + '</h1>' +
    (S.msg ? (S.msg.shown = true, '<div class="msg' + (S.msg.bad ? ' bad' : '') + '">' + esc(S.msg.text) + '</div>') : '') +
    '<form class="form" id="sbForm" novalidate>' +
      '<div class="two"><div class="fld"><label for="fDate">Date</label><input type="date" id="fDate" name="expense_date" value="' + esc(f.expense_date) + '" required><div class="err" data-err="expense_date"></div></div>' +
      '<div class="fld"><label for="fInv">Invoice # <small>optional</small></label><input type="text" id="fInv" name="invoice" value="' + esc(f.invoice) + '" autocomplete="off"><a class="inv hint" id="fInvLink" target="_blank" rel="noopener"' + (invUrl(f.invoice) ? ' href="' + esc(invUrl(f.invoice)) + '"' : ' hidden') + '>Open in Encompass</a></div></div>' +
      '<div class="fld" id="fAcctFld"><label for="fAcct">Account</label>' + (a ? pickedHtml(a) : '<div class="pick"><input type="search" id="fAcct" placeholder="Search accounts…" autocomplete="off"><div class="opts" id="fAcctOpts" hidden></div></div>') + '<div class="err" data-err="account_id"></div></div>' +
      '<div class="fld"><label for="fVendor">Vendor</label><div class="pick"><input type="text" id="fVendor" name="vendor" value="' + esc(f.vendor) + '" placeholder="Who was paid" autocomplete="off"><div class="opts" id="fVendorOpts" hidden></div></div>' +
        '<div class="quick">' + ['Kohler'].concat(S.recent.filter(v => v !== 'Kohler').slice(0, 5)).map(v => '<button type="button" data-vendor="' + esc(v) + '">' + esc(v) + '</button>').join('') + '</div><div class="err" data-err="vendor"></div></div>' +
      '<div class="fld"><label for="fItems">Items Purchased</label><input type="text" id="fItems" name="items_purchased" value="' + esc(f.items_purchased) + '" placeholder="What was bought" autocomplete="off"></div>' +
      '<div class="two"><div class="fld"><label for="fTotal">Total Amount</label><input type="number" id="fTotal" name="total_amount" inputmode="decimal" step="0.01" value="' + esc(f.total_amount) + '" placeholder="0.00" required><div class="err" data-err="total_amount"></div></div>' +
      '<div class="fld"><label for="fBb">Billback Amt</label><input type="number" id="fBb" name="billback_amount" inputmode="decimal" step="0.01" value="' + esc(f.billback_amount) + '"><div class="hint" id="fBbHint"></div><div class="err" data-err="billback_amount"></div></div></div>' +
      '<div class="two"><div class="fld"><label>Kohler Spend</label><div class="calc" id="fSpend">' + esc(money(spend, '—')) + '</div><div class="hint">Total minus Billback</div></div>' +
      '<div class="fld"><label>Billback Received?</label><div class="toggle2" id="fRec"><button type="button" data-v="0" aria-pressed="' + !f.billback_received + '">No</button><button type="button" data-v="1" aria-pressed="' + !!f.billback_received + '">Yes</button></div></div></div>' +
      '<div class="fld" id="fRecDateFld"' + (f.billback_received ? '' : ' hidden') + '><label for="fRecDate">Received Date</label><input type="date" id="fRecDate" name="received_date" value="' + esc(f.received_date) + '"></div>' +
      '<div class="fld"><label for="fNotes">Notes <small>optional</small></label><textarea id="fNotes" name="notes">' + esc(f.notes) + '</textarea></div>' +
      (edit ? '<div class="facts">' + (e.created_name ? '<div><span>Added</span><b>' + esc(e.created_name) + ' · ' + esc(dShort((e.created_at || '').slice(0, 10))) + '</b></div>' : '') + (e.updated_name && e.updated_at !== e.created_at ? '<div><span>Last Edited</span><b>' + esc(e.updated_name) + ' · ' + esc(dShort((e.updated_at || '').slice(0, 10))) + '</b></div>' : '') + '</div>' : '') +
      '<div class="savebar"><button type="submit" class="btn primary" id="fSave">' + (edit ? 'Save Changes' : 'Save') + '</button>' + (edit ? '<button type="button" class="btn" id="fDelete">Delete</button>' : '<button type="submit" class="btn" id="fSaveAdd" data-again="1">Save and Add Another</button>') + '<button type="button" class="btn ghost" id="fCancel">Cancel</button></div>' +
    '</form>';
  wireForm(f, e);
}
function acctLine(a){ return [a.code ? 'Code ' + a.code : '', a.brand_manager, a.supplier, a.description].filter(Boolean).join(' · '); }
function pickedHtml(a){ return '<div class="picked" id="fPicked"><span>' + esc(a.account) + '<small>' + esc(acctLine(a) || 'No code or supplier on file') + '</small></span><button type="button" class="btn sm ghost" id="fAcctChange">Change</button></div>'; }
function wireForm(f, e){
  const form = $('#sbForm');
  const capture = () => { ['expense_date','invoice','vendor','items_purchased','total_amount','billback_amount','notes','received_date'].forEach(k => { const el = form.elements[k]; if(el) f[k] = el.value; }); };
  const calc = () => { capture(); const t = n2(f.total_amount), b = n2(f.billback_amount) || 0; $('#fSpend').textContent = money(t == null ? null : Math.round((t - b) * 100) / 100, '—'); };
  // the account's billback rule: none = locked at 0, split = half the Total until the billback is typed by hand
  const applyRule = () => {
    const bbIn = form.elements.billback_amount, hint = $('#fBbHint'); if(!bbIn || !hint) return;
    const rule = ruleOf(acctById(f.account_id));
    const had = e && n2(e.billback_amount) ? n2(e.billback_amount) : 0;
    bbIn.disabled = rule === 'none';
    if(rule === 'none'){ bbIn.value = '0'; hint.textContent = 'No split for this account (Constellation / Crown): Kohler Spend = Total.' + (had && f.account_id === e.account_id ? ' Saving sets this row\'s ' + money(had) + ' billback to $0.' : ''); }
    else if(rule === 'split'){ if(f.bbAuto){ const t = n2(form.elements.total_amount.value); bbIn.value = t == null ? '0' : String(Math.round(t * 50) / 100); } hint.textContent = '50/50 split' + (f.bbAuto ? ', filled from the Total. Change it if this one is different.' : ' account.'); }
    else { if(f.bbAuto) bbIn.value = '0'; hint.textContent = ''; }
    calc();
  };
  form.elements.billback_amount.addEventListener('input', () => { f.bbAuto = false; });
  form.elements.total_amount.addEventListener('input', () => { if(f.bbAuto) applyRule(); });
  const invIn = form.elements.invoice, invA = $('#fInvLink');
  if(invIn && invA) invIn.addEventListener('input', () => { const u = invUrl(invIn.value); invA.hidden = !u; if(u) invA.href = u; });
  form.addEventListener('input', ev => { calc(); const fld = ev.target.closest('.fld'); if(fld){ const er = fld.querySelector('.err'); if(er) er.textContent = ''; } });
  $('#sbBack').addEventListener('click', () => { S.form = null; S.msg = null; go('ledger'); });
  $('#fCancel').addEventListener('click', () => { S.form = null; S.msg = null; go('ledger'); });
  // account picker: grouped by supplier, code + brand manager under each option
  const mountPicker = () => {
    const inp = $('#fAcct'), opts = $('#fAcctOpts'); if(!inp) return;
    // the accounts of the expense's own year (an older year's accounts are kept even when inactive)
    const yr = () => +String(form.elements.expense_date.value || '').slice(0, 4) || YEAR;
    const list = () => visibleAccounts().filter(a => String(a.year) === String(yr()) && (a.active !== false || yr() !== YEAR)).sort((x, y) => (x.supplier || 'zzz').localeCompare(y.supplier || 'zzz') || x.account.localeCompare(y.account));
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      const hits = list().filter(a => !q || [a.account, a.code, a.supplier, a.brand_manager, a.description].join(' ').toLowerCase().includes(q)).slice(0, 80);
      let last = null;
      const typed = inp.value.trim();
      opts.innerHTML = (canEdit() ? '<button type="button" class="newacct" data-newacct="1">+ New Account' + (typed ? ' “' + esc(typed) + '”' : '') + '<small>Not on the list yet? Add it for ' + yr() + '.</small></button>' : '') +
        (hits.length ? hits.map(a => { const g = a.supplier || 'No Supplier'; const head = g !== last ? '<div class="g">' + esc(g) + '</div>' : ''; last = g; return head + '<button type="button" data-acct="' + esc(a.id) + '">' + esc(a.account) + (a.needs_review ? ' <span class="chip">Needs Review</span>' : '') + '<small>' + esc([a.code ? 'Code ' + a.code : '', a.brand_manager].filter(Boolean).join(' · ') || '—') + '</small></button>'; }).join('') : '<div class="g">No ' + yr() + ' account matches</div>');
      opts.hidden = false;
      $$('[data-acct]', opts).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); pick(b.dataset.acct); }));
      $$('[data-newacct]', opts).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); opts.hidden = true; accountSheet(null, false, {name: typed, year: yr(), onSaved: a => pick(a.id)}); }));
    };
    inp.addEventListener('input', draw); inp.addEventListener('focus', draw);
    inp.addEventListener('blur', () => setTimeout(() => { opts.hidden = true; }, 150));
  };
  // choosing an account: show it, apply its billback rule, fill the vendor it uses (its default, else the last one used on it)
  const pick = id => {
    f.account_id = id; $('#fAcctFld').innerHTML = '<label>Account</label>' + pickedHtml(acctById(id)) + '<div class="err" data-err="account_id"></div>'; wireChange();
    const v = $('#fVendor'); if(v && !v.value.trim()){ const a = acctById(id); const nv = (a && a.vendor_default) || lastVendorFor(id); if(nv){ v.value = nv; f.vendor = nv; } }
    if(!e) f.bbAuto = true;
    applyRule();
  };
  const wireChange = () => { const c = $('#fAcctChange'); if(c) c.addEventListener('click', () => { f.account_id = ''; $('#fAcctFld').innerHTML = '<label for="fAcct">Account</label><div class="pick"><input type="search" id="fAcct" placeholder="Search accounts…" autocomplete="off"><div class="opts" id="fAcctOpts" hidden></div></div><div class="err" data-err="account_id"></div>'; mountPicker(); $('#fAcct').focus(); }); };
  mountPicker(); wireChange(); applyRule();
  form.elements.expense_date.addEventListener('change', () => { const a = acctById(f.account_id); const y = +String(form.elements.expense_date.value).slice(0, 4); const er = $('[data-err="account_id"]'); if(er) er.textContent = a && y && +a.year !== y ? 'This account is for ' + a.year + '. Pick the ' + y + ' account or add it.' : ''; });
  // vendor typeahead (any new name is allowed)
  const vin = $('#fVendor'), vopts = $('#fVendorOpts');
  const vdraw = () => { const q = vin.value.trim().toLowerCase(); const hits = q ? S.vendors.filter(v => v.toLowerCase().includes(q) && v.toLowerCase() !== q).sort((x, y) => (y.toLowerCase().startsWith(q) ? 1 : 0) - (x.toLowerCase().startsWith(q) ? 1 : 0)).slice(0, 8) : S.recent.slice(0, 8); vopts.innerHTML = (hits.length ? '<div class="g">' + (q ? 'Saved Vendors' : 'Recent Vendors') + '</div>' : '') + hits.map(v => '<button type="button" data-v="' + esc(v) + '">' + esc(v) + '</button>').join(''); vopts.hidden = !hits.length; $$('[data-v]', vopts).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); vin.value = b.dataset.v; f.vendor = vin.value; vopts.hidden = true; })); };
  vin.addEventListener('input', vdraw); vin.addEventListener('focus', vdraw); vin.addEventListener('blur', () => setTimeout(() => { vopts.hidden = true; }, 150));
  $$('[data-vendor]').forEach(b => b.addEventListener('click', () => { vin.value = b.dataset.vendor; f.vendor = vin.value; vin.dispatchEvent(new Event('input', {bubbles: true})); }));
  $$('#fRec button').forEach(b => b.addEventListener('click', () => { f.billback_received = b.dataset.v === '1'; $$('#fRec button').forEach(x => x.setAttribute('aria-pressed', String((x.dataset.v === '1') === f.billback_received))); $('#fRecDateFld').hidden = !f.billback_received; }));
  const del = $('#fDelete'); if(del) del.addEventListener('click', async () => {
    if(!confirm('Delete this expense? The change is logged.')) return;
    del.setAttribute('aria-busy', 'true');
    try{
      const r = await rest('supplier_expenses?id=eq.' + encodeURIComponent(e.id) + '&select=id', Object.assign({method: 'DELETE'}, rep()));
      if(!r || !r.length) throw new Error('Not deleted: the database did not return the row.');
      S.expenses = S.expenses.filter(x => x.id !== e.id); S.form = null; S.msg = {text: 'Expense deleted.'}; go('ledger');
    }catch(err){ del.removeAttribute('aria-busy'); S.msg = {text: friendly(err), bad: true}; renderForm(e); }
  });
  form.addEventListener('submit', async ev => {
    ev.preventDefault(); capture();
    const again = !!(ev.submitter && ev.submitter.dataset.again);
    const errs = validate(f, e);
    $$('[data-err]', form).forEach(el => { el.textContent = errs[el.dataset.err] || ''; });
    if(Object.keys(errs).length){ const bad = form.querySelector('[data-err]:not(:empty)'); if(bad) bad.closest('.fld').scrollIntoView({block: 'center'}); return; }
    const btn = ev.submitter || $('#fSave'); btn.setAttribute('aria-busy', 'true');
    const body = {expense_date: f.expense_date, account_id: f.account_id, vendor: canonVendor(f.vendor), items_purchased: f.items_purchased.trim() || null, invoice: f.invoice.trim() || null, total_amount: n2(f.total_amount), billback_amount: n2(f.billback_amount) || 0, billback_received: !!f.billback_received, received_date: f.billback_received ? (f.received_date || TODAY) : null, notes: f.notes.trim() || null};
    try{
      let r;
      if(e) r = await rest('supplier_expenses?id=eq.' + encodeURIComponent(e.id) + '&select=' + EXP_COLS, Object.assign({method: 'PATCH', body}, rep()));
      else r = await rest('supplier_expenses?select=' + EXP_COLS, Object.assign({method: 'POST', body}, rep()));
      if(!r || !r.length) throw new Error('Not saved: the database did not return the row (no permission?).');
      replaceRow(r[0]); useVendor(r[0].vendor);
      S.hl = r[0].id; S.form = null; S.msg = {text: e ? 'Changes saved.' : 'Expense saved.'};
      if(again){ S.keep = {expense_date: f.expense_date, account_id: f.account_id, vendor: f.vendor}; S.msg = {text: 'Expense saved. Date, Account and Vendor kept.'}; renderForm(null); return; }
      S.keep = null;
      // make sure the saved row is in view: its year, sorted newest first
      if(S.f.year && S.f.year !== String(r[0].year)){ S.f.year = String(r[0].year); sset('kdh_sb_f', S.f); }
      if(!e && (S.sort.k !== 'created_at' || S.sort.d !== -1)){ S.sort = {k: 'created_at', d: -1}; sset('kdh_sb_sort2', S.sort); }   // newest entry on top
      go('ledger');
    }catch(err){ btn.removeAttribute('aria-busy'); S.msg = {text: friendly(err), bad: true}; renderForm(e); }
  });
  const fa = form.querySelector('#fAcct,#fTotal'); if(fa && !e) setTimeout(() => fa.focus(), 50);
}
function validate(f, e){
  // an existing row (imported ones included) is checked only on what was changed, so a credit or an old row can be edited
  const errs = {};
  if(!f.account_id) errs.account_id = 'Pick an account.';
  if(!f.vendor.trim()) errs.vendor = 'Who was paid?';
  const t = n2(f.total_amount); if(t == null || isNaN(t)) errs.total_amount = 'Enter the total amount.';
  const b = n2(f.billback_amount) || 0;
  const same = e && t === n2(e.total_amount) && b === (n2(e.billback_amount) || 0);
  if(t != null && !isNaN(t) && !same){
    if(t >= 0 && b < 0) errs.billback_amount = 'Billback cannot be negative.';
    else if(t >= 0 && b > t) errs.billback_amount = 'Billback cannot be more than the total.';
    else if(t < 0 && (b > 0 || b < t)) errs.billback_amount = 'For a credit, the billback must be between the total and 0.';
  }
  if(!f.expense_date) errs.expense_date = 'Pick a date.';
  else if(!e || f.expense_date !== e.expense_date){ const y = +f.expense_date.slice(0, 4); if(y < YEAR - 1 || y > YEAR + 1) errs.expense_date = 'The date must fall in an open year (' + (YEAR - 1) + '–' + (YEAR + 1) + ').'; }
  const a = acctById(f.account_id), y = +String(f.expense_date || '').slice(0, 4);
  if(a && y && +a.year !== y && (!e || f.account_id !== e.account_id || f.expense_date !== e.expense_date)) errs.account_id = 'This account is for ' + a.year + '. Pick the ' + y + ' account or add it.';
  return errs;
}
function renderView(e){
  const a = acctById(e.account_id) || {};
  app.innerHTML = '<button type="button" class="back" id="sbBack">‹ Ledger</button><h1>' + esc(e.vendor) + '<small>' + esc(dShort(e.expense_date)) + ' · ' + esc(a.account || '') + '</small></h1>' +
    '<div class="facts">' + [['Total', money(n2(e.total_amount))], ['Kohler Spend', money(n2(e.kohler_spend))], ['Billback', money(n2(e.billback_amount))], ['Billback Received', e.billback_received ? 'Yes' + (e.received_date ? ' · ' + dShort(e.received_date) : '') : 'No'], ['Invoice', e.invoice ? {h: invHtml(e.invoice)} : '—'], ['Items Purchased', e.items_purchased || '—'], ['Code', a.code || '—'], ['Brand Manager', a.brand_manager || '—'], ['Supplier', a.supplier || '—'], ['Description', a.description || '—'], ['Notes', e.notes || '—']].map(x => '<div><span>' + esc(x[0]) + '</span><b>' + (x[1] && x[1].h ? x[1].h : esc(x[1])) + '</b></div>').join('') + '</div>' +
    '<p class="sb-note">' + (PREVIEW ? 'Saving is off in preview.' + (previewEditor() ? ' ' + esc(first(U.name)) + ' can edit this row when signed in.' : '') : 'Read only. Only a budget editor can change an expense.') + '</p>';
  $('#sbBack').addEventListener('click', () => go('ledger'));
}

/* ---------------- Budget tab ---------------- */
function renderBudget(){
  const year = S.f.year && S.f.year !== String(YEAR) && S.f.year ? S.f.year : String(YEAR);
  const accts = visibleAccounts().filter(a => String(a.year) === year).sort((x, y) => x.account.localeCompare(y.account));
  const exps = joined().filter(r => String(r.year) === year);
  const by = {}; exps.forEach(r => { const b = by[r.account_id] = by[r.account_id] || {spend: 0, out: 0, n: 0}; b.spend += +r.kohler_spend || 0; b.out += !r.billback_received ? (+r.billback_amount || 0) : 0; b.n++; });
  const tot = strip(exps, accts);
  const review = accts.filter(a => a.needs_review).length;
  app.innerHTML = header(year + ' budgets by account.' + (canEdit() ? ' Tap a budget amount to change it.' : '')) +
    '<div class="strip">' +
      '<div class="st"><b>' + money0(tot.budget) + '</b><span>Total Budget</span></div><div class="st"><b>' + money0(tot.spend) + '</b><span>Kohler Spend</span></div>' +
      '<div class="st' + (tot.pct > 100 ? ' warn' : '') + '"><b>' + (tot.pct == null ? '—' : tot.pct + '%') + '</b><span>% to Budget</span></div>' +
      '<div class="st"><b>' + accts.length + '</b><span>Accounts</span></div><div class="st' + (review ? ' warn' : '') + '"><b>' + review + '</b><span>Need Review</span></div>' +
    '</div>' +
    (canEdit() ? '<div class="acts" style="margin:0 0 12px"><button type="button" class="btn" id="sbAddAcct">+ New Account</button></div>' : '') +
    (review && canEdit() ? '<p class="sb-note">Accounts marked Needs Review came from the expense sheet with no Budget row. Open one to set its supplier and budget, or move its expenses to the right account.</p>' : '') +
    '<div class="tbl-wrap"><table class="led bud"><thead><tr><th>Account</th><th>Code</th><th>Brand Manager</th><th>Supplier</th><th class="num">Budget Amount</th><th class="num">Amount Spent</th><th>% to Budget</th><th class="num">Billback Outstanding</th><th class="num">Rows</th></tr></thead><tbody>' +
      accts.map(a => { const b = by[a.id] || {spend: 0, out: 0, n: 0}; const p = pct(b.spend, +a.budget_amount || 0); return '<tr class="r" data-acct="' + esc(a.id) + '"><td title="' + esc(a.account) + '">' + esc(a.account) + (a.needs_review ? ' <span class="chip">Needs Review</span>' : '') + (a.active === false ? ' <span class="chip hist">Inactive</span>' : '') + (ruleOf(a) === 'none' ? ' <span class="chip hist">No Split</span>' : ruleOf(a) === 'split' ? ' <span class="chip hist">50/50</span>' : '') + '</td><td>' + esc(a.code || '') + '</td><td>' + esc(a.brand_manager || '') + '</td><td>' + esc(a.supplier || '') + '</td><td class="num">' + (canEdit() ? '<button type="button" class="rec" data-budget="' + esc(a.id) + '">' + esc(money(n2(a.budget_amount), 'Set')) + '</button>' : esc(money(n2(a.budget_amount), '—'))) + '</td><td class="num">' + esc(money(b.spend)) + '</td><td>' + (p == null ? '<span class="edited">No budget</span>' : p + '%<div class="bar"><i class="' + (p > 100 ? 'over' : '') + '" style="width:' + Math.min(100, p) + '%"></i></div>') + '</td><td class="num">' + esc(money(b.out)) + '</td><td class="num">' + b.n + '</td></tr>'; }).join('') +
    '</tbody></table></div>' +
    '<div class="cards">' + accts.map(a => { const b = by[a.id] || {spend: 0, out: 0, n: 0}; const p = pct(b.spend, +a.budget_amount || 0); return '<div class="card budcard" role="button" tabindex="0" data-acct="' + esc(a.id) + '"><span class="t"><span>' + esc(a.account) + '</span><b>' + esc(money0(n2(a.budget_amount), 'No budget')) + '</b></span><span class="m">' + esc([a.supplier, a.brand_manager, a.code ? 'Code ' + a.code : ''].filter(Boolean).join(' · ')) + (a.needs_review ? ' · Needs Review' : '') + '</span><span class="f"><div><span>Spent</span><b>' + esc(money0(b.spend)) + '</b></div><div><span>% to Budget</span><b>' + (p == null ? '—' : p + '%') + '</b></div><div><span>Billback Out</span><b>' + esc(money0(b.out)) + '</b></div><div><span>Rows</span><b>' + b.n + '</b></div></span>' + (p != null ? '<span class="bar"><i class="' + (p > 100 ? 'over' : '') + '" style="width:' + Math.min(100, p) + '%"></i></span>' : '') + '</div>'; }).join('') + '</div>' +
    (!accts.length ? '<div class="kdh-state empty"><b>No Budget Accounts</b><span>' + (S.missing ? '' : 'Nothing is on file for ' + year + '.') + '</span></div>' : '') +
    '<details class="fold"><summary>About This Data</summary><div class="body">Amount Spent and Billback Outstanding are summed from the Ledger. A row with no budget amount shows no percentage. Budget amounts and account details are changed here by the office; every change is stamped with who made it.</div></details>';
  $$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  $$('[data-acct]').forEach(el => el.addEventListener('click', ev => { if(ev.target.closest('[data-budget]')) return; if(canEdit()) accountSheet(acctById(el.dataset.acct)); else { S.f.acct = el.dataset.acct; sset('kdh_sb_f', S.f); go('ledger'); } }));
  $$('[data-budget]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); accountSheet(acctById(b.dataset.budget), true); }));
  const add = $('#sbAddAcct'); if(add) add.addEventListener('click', () => accountSheet(null));
}
function sheet(title, bodyHtml){
  closeSheet();
  const w = document.createElement('div'); w.className = 'kdh-sheet-wrap'; w.id = 'sbSheet';
  w.innerHTML = '<div class="kdh-sheet-back"></div><div class="kdh-sheet sb" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="kdh-sheet-h"><b>' + esc(title) + '</b><button type="button" class="kdh-sheet-x" id="sbSheetX">Close</button></div><div class="kdh-sheet-list" style="min-height:0">' + bodyHtml + '</div></div>';
  document.body.appendChild(w);
  $('#sbSheetX', w).addEventListener('click', closeSheet); $('.kdh-sheet-back', w).addEventListener('click', closeSheet);
  return w;
}
function closeSheet(){ const w = $('#sbSheet'); if(w) w.remove(); }
function accountSheet(a, budgetOnly, opt){
  opt = opt || {};
  const edit = !!a; a = a || {year: opt.year || YEAR, active: true, account: opt.name || ''};
  const rule0 = edit ? ruleOf(a) : (NO_SPLIT_RX.test(a.account) ? 'none' : 'manual');
  const w = sheet(edit ? (budgetOnly ? 'Budget Amount' : 'Edit Account') : 'New Account' + (a.year !== YEAR ? ' for ' + a.year : ''),
    '<form id="sbAcctForm" class="form" style="padding-bottom:0" novalidate>' +
      '<div class="fld"' + (budgetOnly ? ' hidden' : '') + '><label for="aName">Account</label><input type="text" id="aName" name="account" value="' + esc(a.account || '') + '" required autocomplete="off"><div class="hint">As it reads on the Budget tab, e.g. CROWN- TACTICAL</div></div>' +
      (budgetOnly ? '<p class="sb-note" style="margin:0"><b>' + esc(a.account) + '</b>' + (a.supplier ? ' · ' + esc(a.supplier) : '') + '</p>' : '') +
      '<div class="two"' + (budgetOnly ? ' hidden' : '') + '><div class="fld"><label for="aCode">Code</label><input type="text" id="aCode" name="code" value="' + esc(a.code || '') + '" inputmode="numeric" autocomplete="off"></div><div class="fld"><label for="aSup">Supplier</label><input type="text" id="aSup" name="supplier" value="' + esc(a.supplier || '') + '" autocomplete="off"></div></div>' +
      '<div class="two"' + (budgetOnly ? ' hidden' : '') + '><div class="fld"><label for="aBm">Brand Manager</label><input type="text" id="aBm" name="brand_manager" value="' + esc(a.brand_manager || '') + '" autocomplete="off"></div><div class="fld"><label for="aDesc">Description</label><input type="text" id="aDesc" name="description" value="' + esc(a.description || '') + '" autocomplete="off"></div></div>' +
      '<div class="two"><div class="fld"><label for="aBudget">Budget Amount</label><input type="number" id="aBudget" name="budget_amount" inputmode="decimal" step="0.01" min="0" value="' + esc(a.budget_amount == null ? '' : a.budget_amount) + '" placeholder="Leave blank for none"></div><div class="fld"' + (budgetOnly ? ' hidden' : '') + '><label for="aBasis">Basis <small>optional</small></label><input type="text" id="aBasis" name="basis_text" value="' + esc(a.basis_text || '') + '" placeholder="50/50 Split, .25/case…" autocomplete="off"></div></div>' +
      (budgetOnly ? '' : '<div class="fld"><label for="aRule">Billback</label><select id="aRule" name="billback_rule">' + RULES.map(x => '<option value="' + x.v + '"' + (x.v === rule0 ? ' selected' : '') + '>' + esc(x.l) + '</option>').join('') + '</select><div class="hint">Constellation / Crown accounts are always No Split.</div></div>') +
      (edit && !budgetOnly ? '<div class="fld"><label>Status</label><div class="toggle2" id="aActive"><button type="button" data-v="1" aria-pressed="' + (a.active !== false) + '">Active</button><button type="button" data-v="0" aria-pressed="' + (a.active === false) + '">Inactive</button></div></div>' + (a.needs_review ? '<div class="fld"><label>Review</label><div class="toggle2" id="aReview"><button type="button" data-v="1" aria-pressed="true">Needs Review</button><button type="button" data-v="0" aria-pressed="false">Reviewed</button></div></div>' : '') : '') +
      '<div class="err" id="aErr"></div>' +
      '<div class="sheet-foot" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><button type="submit" class="btn primary" id="aSave">Save</button><button type="button" class="btn" id="aCancel">Cancel</button></div>' +
    '</form>');
  const f = $('#sbAcctForm', w); const st = {active: a.active !== false, review: !!a.needs_review};
  $$('#aActive button', w).forEach(b => b.addEventListener('click', () => { st.active = b.dataset.v === '1'; $$('#aActive button', w).forEach(x => x.setAttribute('aria-pressed', String((x.dataset.v === '1') === st.active))); }));
  $$('#aReview button', w).forEach(b => b.addEventListener('click', () => { st.review = b.dataset.v === '1'; $$('#aReview button', w).forEach(x => x.setAttribute('aria-pressed', String((x.dataset.v === '1') === st.review))); }));
  $('#aCancel', w).addEventListener('click', closeSheet);
  setTimeout(() => { const i = $(budgetOnly ? '#aBudget' : '#aName', w); if(i) i.focus(); }, 50);
  const nameIn = $('#aName', w), ruleIn = $('#aRule', w);
  const lockRule = () => { if(!ruleIn) return; const crown = NO_SPLIT_RX.test([nameIn.value, f.elements.supplier.value, f.elements.description.value].join(' ')); if(crown) ruleIn.value = 'none'; ruleIn.disabled = crown; };
  ['account', 'supplier', 'description'].forEach(k => f.elements[k] && f.elements[k].addEventListener('input', lockRule)); lockRule();
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const body = {account: f.elements.account.value.trim(), code: f.elements.code.value.trim() || null, supplier: f.elements.supplier.value.trim() || null, brand_manager: f.elements.brand_manager.value.trim() || null, description: f.elements.description.value.trim() || null, budget_amount: n2(f.elements.budget_amount.value), basis_text: f.elements.basis_text.value.trim() || null, active: st.active, needs_review: st.review};
    if(!edit) body.year = a.year || YEAR;
    if(f.elements.billback_rule && hasRules()) body.billback_rule = NO_SPLIT_RX.test([body.account, body.supplier, body.description].join(' ')) ? 'none' : f.elements.billback_rule.value;
    if(!body.account){ $('#aErr', w).textContent = 'The account needs a name.'; return; }
    if(body.budget_amount != null && body.budget_amount < 0){ $('#aErr', w).textContent = 'A budget cannot be negative.'; return; }
    $('#aSave', w).setAttribute('aria-busy', 'true');
    try{
      const r = edit ? await rest('budget_accounts?id=eq.' + encodeURIComponent(a.id) + '&select=*', Object.assign({method: 'PATCH', body}, rep())) : await rest('budget_accounts?select=*', Object.assign({method: 'POST', body}, rep()));
      if(!r || !r.length) throw new Error('Not saved: the database did not return the row (no permission?).');
      const i = S.accounts.findIndex(x => x.id === r[0].id); if(i >= 0) S.accounts[i] = r[0]; else S.accounts.push(r[0]);
      closeSheet();
      if(opt.onSaved){ opt.onSaved(r[0]); return; }
      S.msg = {text: edit ? 'Account saved.' : 'Account added.'}; renderBudget();
    }catch(err){ $('#aSave', w).removeAttribute('aria-busy'); $('#aErr', w).textContent = friendly(err); }
  });
}

/* ---------------- boot ---------------- */
(async function(){
  await load();
  render();
  const v = view(); if(v.v === 'new' && !canEdit()) go('ledger');
})();
})();
