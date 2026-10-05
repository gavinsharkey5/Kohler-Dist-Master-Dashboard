/* Merchandising Recap (2026-10-04). See the comment in index.html and
   merchandising/README.txt. Reads only through shared/kdh-data.js; computes
   the filtered set ONCE (view()) and the list, the counts, the CSV and the
   printed recap all render that same set. */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = document.getElementById('recApp'), printEl = document.getElementById('recPrint');
const U = window.kdhUser ? window.kdhUser() : null;
if(!U || U.role!=='manager'){
  app.innerHTML = U && U.preview
    ? `<div class="kdh-state unavailable"><b>You are previewing a rep.</b><span>The merchandising recap is a manager view. Exit preview to use it.</span></div>`
    : `<div class="kdh-state unavailable"><b>The merchandising recap is for managers.</b><span>Reps see their photos on each account’s Photos &amp; Merchandising page.</span></div>`;
  return;
}
const D = window.KdhData, M = window.KdhMerch;
const plural = (n, w, p) => n.toLocaleString('en-US')+' '+(n===1 ? w : (p || w+'s'));
const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}); };
const fmtWhen = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'}); };
const progName = id => id ? (window.kdhTitle ? window.kdhTitle(id, id) : id) : '';

// account -> rep / name / town from the customer base; a district manager sees their team only
const ACCTS = new Map();
try{ Object.entries(HUB_ACCOUNTS.reps).forEach(([rep, list])=>list.forEach(a=>ACCTS.set(String(a.n), {name:a.name, rep, city:a.city, prem:a.prem}))); }catch(e){}
const TEAM = window.kdhTeam ? window.kdhTeam(window.KDH_DM_GROUPS || []) : null;
const inScope = rep => !TEAM || (rep && TEAM.reps.includes(rep));
const ROSTER = Array.from(new Set(Array.from(ACCTS.values()).map(a=>a.rep))).filter(r=>(!window.kdhIsRep || window.kdhIsRep(r)) && inScope(r)).sort();

const REC_COLS = 'id,customer_num,category,subtype,subtype_note,caption,location,brands,program_id,premise,source,source_kind,isb_promotion_type,isb_theme,isb_elements,source_author,observed_at,created_at,author_name,'
  + 'merch_lines(line_no,supplier,brand_family,brand,package,product_num,quantity,quantity_unit,ownership_source,ownership_corrected),merch_record_photos(ord,photo_id)';
const PH_COLS = 'id,customer_num,category,caption,storage_path,source,source_url,photo_kind,photo_status,captured_at,uploaded_at,author_name,brand,program_id';
const PAGE_ROWS = 1000;
async function all(path){ // PostgREST pages (Supabase caps a response at 1,000 rows)
  const out = [];
  for(let off = 0; off < 50000; off += PAGE_ROWS){
    const r = await D.rest(path + (path.includes('?') ? '&' : '?') + 'limit=' + PAGE_ROWS + '&offset=' + off);
    if(!r.ok){ const e = new Error((r.data && r.data.message) || ('HTTP ' + r.status)); e.status = r.status; e.code = r.data && r.data.code; throw e; }
    out.push(...(r.data || [])); if(!r.data || r.data.length < PAGE_ROWS) break;
  }
  return out;
}

let RECS = [], NOTE = '', LOADED_AT = null;
async function load(){
  if(!D.signedIn()) throw Object.assign(new Error('Sign in on kohlerdisthub.com to read merchandising records.'), {off:true});
  let recs = [], merchMissing = false;
  try{ recs = await all('merch_records?select=' + REC_COLS + '&order=observed_at.desc.nullslast'); }
  catch(e){ if(e.status===404 || e.code==='PGRST205' || e.code==='42P01') merchMissing = true; else throw e; }
  let photos = [];
  try{ photos = await all('account_photos?select=' + PH_COLS + '&order=uploaded_at.desc'); }
  catch(e){ photos = await all('account_photos?select=id,customer_num,category,caption,storage_path,captured_at,uploaded_at,author_name&order=uploaded_at.desc'); }
  if(merchMissing) NOTE = 'Records with product lines need supabase/migrations/20261004090000_merchandising.sql. Until it is run, each photo is listed on its own.';
  const byId = new Map(photos.map(p=>[p.id, p])); const used = new Set();
  const out = recs.map(r=>{
    // stored photos first (always load; an iSellBeer link may need an iSellBeer sign-in), then the record's own order
    const ph = (r.merch_record_photos||[]).slice().sort((a,b)=>a.ord-b.ord).map(x=>{ used.add(x.photo_id); return byId.get(x.photo_id); }).filter(Boolean)
      .map((p, i)=>[p, i]).sort((a,b)=>((b[0].storage_path?1:0) - (a[0].storage_path?1:0)) || a[1]-b[1]).map(x=>x[0]);
    return Object.assign({}, r, {key:'mr:'+r.id, lines:(r.merch_lines||[]).slice().sort((a,b)=>a.line_no-b.line_no), photos:ph});
  });
  photos.forEach(p=>{ if(used.has(p.id)) return;
    out.push({key:'ph:'+p.id, id:p.id, customer_num:p.customer_num, category:p.category||null, caption:p.caption, brands:p.brand ? [p.brand] : [], program_id:p.program_id||null,
      source:p.source||'hub', observed_at:p.captured_at, created_at:p.uploaded_at, author_name:p.author_name, lines:[], photos:[p]}); });
  out.forEach(r=>{ const a = ACCTS.get(String(r.customer_num)) || {}; r.acct = a.name || ('Account #'+r.customer_num); r.rep = a.rep || ''; r.city = a.city || '';
    r.when = r.observed_at || r.created_at; });
  RECS = out.filter(r=>inScope(r.rep)).sort((a,b)=>String(b.when).localeCompare(String(a.when)));
  LOADED_AT = new Date();
}

/* ---- filters (kept in the hash) ---- */
const st = {q:'', rep:'', from:'', to:'', brand:'', cat:'', prog:'', src:'', limit:40};
const KEYS = ['q','rep','from','to','brand','cat','prog','src'];
function readHash(){ const h = new URLSearchParams(location.hash.slice(1)); KEYS.forEach(k=>{ st[k] = h.get(k) || ''; }); }
function writeHash(){ const h = new URLSearchParams(); KEYS.forEach(k=>{ if(st[k]) h.set(k, st[k]); }); const s = h.toString(); history.replaceState(null, '', location.pathname + (s ? '#'+s : '')); }
const brandHay = r => [].concat(r.brands||[], r.lines.map(l=>[l.supplier, l.brand_family, l.brand, l.package].join(' '))).join(' ').toLowerCase();
function view(){
  const q = st.q.trim().toLowerCase(), b = st.brand.trim().toLowerCase();
  return RECS.filter(r=>{
    if(st.rep && r.rep!==st.rep) return false;
    if(st.cat && (st.cat==='none' ? r.category : r.category!==st.cat)) return false;
    if(st.prog && (st.prog==='none' ? r.program_id : r.program_id!==st.prog)) return false;
    if(st.src && (r.source||'hub')!==st.src) return false;
    const day = String(r.when||'').slice(0,10);
    if(st.from && (!day || day < st.from)) return false;
    if(st.to && (!day || day > st.to)) return false;
    if(q && ![r.acct, r.city, r.customer_num].join(' ').toLowerCase().includes(q)) return false;
    if(b && !brandHay(r).includes(b)) return false;
    return true;
  });
}
// separate counts: never one number called "placements"
function counts(rows){
  const photos = new Set(); rows.forEach(r=>r.photos.forEach(p=>photos.add(p.id)));
  return {accounts: new Set(rows.map(r=>String(r.customer_num))).size, records: rows.length, photos: photos.size, lines: rows.reduce((n, r)=>n + r.lines.length, 0)};
}
function filterText(){
  const f = [];
  if(st.q) f.push(`Account: “${st.q}”`);
  f.push('Rep: ' + (st.rep || (TEAM ? `${TEAM.dm.split(' ')[0]}’s team` : 'all reps')));
  if(st.from || st.to) f.push(`Dates: ${st.from ? fmtDay(st.from+'T12:00:00') : 'any'} – ${st.to ? fmtDay(st.to+'T12:00:00') : 'any'}`);
  if(st.brand) f.push(`Supplier / brand: “${st.brand}”`);
  if(st.cat) f.push('Category: ' + (st.cat==='none' ? 'Uncategorized' : M.catLabel(st.cat)));
  if(st.prog) f.push('Program: ' + (st.prog==='none' ? 'No program' : progName(st.prog)));
  if(st.src) f.push('Source: ' + M.SOURCE_LABEL[st.src]);
  return f.join(' · ');
}

/* ---- images: private storage with the manager's token; iSellBeer links load straight ---- */
const blobs = new Map();
function imgFor(p){
  if(p.storage_path) return blobs.has(p.storage_path) ? Promise.resolve(blobs.get(p.storage_path))
    : D.objectBlob(p.storage_path).then(b=>{ const u = b ? URL.createObjectURL(b) : null; blobs.set(p.storage_path, u); return u; });
  return Promise.resolve(p.source_url || null);
}
function hydrate(root){
  root.querySelectorAll('img[data-pid]').forEach(img=>{
    const p = PHOTOS.get(img.dataset.pid); if(!p){ return; }
    imgFor(p).then(u=>{ if(!u){ img.replaceWith(Object.assign(document.createElement('span'), {className:'noimg', textContent:'Photo Unavailable'})); return; }
      img.onerror = ()=>img.replaceWith(Object.assign(document.createElement('span'), {className:'noimg', textContent:'Photo Unavailable'}));
      img.src = u; });
  });
}
let PHOTOS = new Map();
const lineHtml = l => `<li>${E([l.supplier, l.brand || l.brand_family, l.package].filter(Boolean).join(' · ') || 'Product not named')} — ${E(M.qtyText(l.quantity, l.quantity_unit))}${l.ownership_source ? ` · ${E(l.ownership_source)}${l.ownership_corrected && l.ownership_corrected!==l.ownership_source ? ` (audited: ${E(l.ownership_corrected)})` : ''}` : ''}</li>`;
function recHtml(r, big){
  const imp = r.source==='isellbeer';
  const title = [M.catLabel(r.category), r.subtype ? (M.SUB_LABEL[r.subtype] || r.subtype) : '', imp && r.isb_promotion_type ? r.isb_promotion_type : ''].filter(Boolean).join(' · ');
  return `<article class="rrec${r.category==='menu' ? ' menu' : ''}">
    <div class="rrec-ph">${r.photos.length ? r.photos.slice(0, big ? 4 : 2).map(p=>`<img alt="${E(title)} photo at ${E(r.acct)}" data-pid="${E(p.id)}" loading="lazy">`).join('') : `<span class="noimg">No photo on this record</span>`}</div>
    <div><h4>${E(title)}</h4>
      <p class="rm">${imp ? 'Last observed ' : 'Taken '}${E(fmtWhen(r.when))} · ${E(r.author_name || r.source_author || 'Unknown author')} · ${E(M.SOURCE_LABEL[r.source||'hub'])}</p>
      ${r.program_id ? `<p class="rm">Program: <b>${E(progName(r.program_id))}</b> · evidence, not credit</p>` : ''}
      ${r.caption ? `<p class="rm">“${E(r.caption)}”</p>` : ''}${r.location ? `<p class="rm">Location: ${E(r.location)}</p>` : ''}
      ${r.lines.length ? `<ul>${r.lines.map(lineHtml).join('')}</ul>` : (r.brands||[]).length ? `<p class="rm">Brands: ${E(r.brands.join(', '))}</p>` : ''}
      <p class="rm">${plural(r.photos.length,'photo')}${r.lines.length ? ' · '+plural(r.lines.length,'line') : ''}</p></div></article>`;
}
function groupByAccount(rows){
  const g = new Map(); rows.forEach(r=>{ const k = String(r.customer_num); if(!g.has(k)) g.set(k, {n:k, acct:r.acct, city:r.city, rep:r.rep, recs:[]}); g.get(k).recs.push(r); });
  return Array.from(g.values());
}

/* ---- screen ---- */
function render(){
  const rows = view(); const c = counts(rows); const all = counts(RECS);
  PHOTOS = new Map(); RECS.forEach(r=>r.photos.forEach(p=>PHOTOS.set(String(p.id), p)));
  const groups = groupByAccount(rows);
  const progs = Array.from(new Set(RECS.map(r=>r.program_id).filter(Boolean))).sort((a,b)=>progName(a).localeCompare(progName(b)));
  const repOpts = (TEAM ? [] : []).concat(ROSTER).map(n=>`<option${st.rep===n?' selected':''}>${E(n)}</option>`).join('');
  const tile = (n, l, s) => `<div class="mt"><b>${n.toLocaleString('en-US')}</b><span>${E(l)}</span>${s ? `<small>${E(s)}</small>` : ''}</div>`;
  let shown = 0; const body = groups.map(g=>{ if(shown >= st.limit) return ''; const recs = g.recs.slice(0, Math.max(1, st.limit - shown)); shown += recs.length;
    return `<section class="rgroup"><h3>${E(g.acct)} <small class="rm">${E([g.city, '#'+g.n, g.rep ? 'Rep: '+g.rep : 'Not in the customer base'].filter(Boolean).join(' · '))} · ${plural(g.recs.length,'record')}</small></h3>${recs.map(r=>recHtml(r)).join('')}</section>`; }).join('');
  app.innerHTML = `
  <header class="ws mh"><h1>Merchandising Recap</h1>
    <p class="mh-sub">Photos and merchandising records your reps captured in the Hub or that were imported from iSellBeer${TEAM ? `, for ${E(TEAM.dm.split(' ')[0])}’s team` : ''}. A saved photo is evidence, not program credit.</p></header>
  ${NOTE ? `<div class="kdh-state unavailable slim">${E(NOTE)}</div>` : ''}
  <section class="mcard no-print"><h2>Filters</h2>
    <div class="mform">
      <label>Account<input type="search" id="fq" value="${E(st.q)}" placeholder="Name, town or #" autocomplete="off"></label>
      <label>Rep<select id="frep"><option value="">${TEAM ? `${E(TEAM.dm.split(' ')[0])}’s team` : 'All reps'} · ${ROSTER.length}</option>${repOpts}</select></label>
      <label>Supplier or Brand<input type="search" id="fbrand" value="${E(st.brand)}" placeholder="e.g. Boston Beer, Twisted Tea" autocomplete="off"></label>
      <label>From<input type="date" id="ffrom" value="${E(st.from)}"></label>
      <label>To<input type="date" id="fto" value="${E(st.to)}"></label>
      <label>Category<select id="fcat"><option value="">Any category</option>${M.CATS.map(x=>`<option value="${x.k}"${st.cat===x.k?' selected':''}>${E(x.label)}</option>`).join('')}<option value="none"${st.cat==='none'?' selected':''}>Uncategorized</option></select></label>
      <label>Program<select id="fprog"><option value="">Any program</option>${progs.map(p=>`<option value="${E(p)}"${st.prog===p?' selected':''}>${E(progName(p))}</option>`).join('')}<option value="none"${st.prog==='none'?' selected':''}>No program</option></select></label>
      <label>Source<select id="fsrc"><option value="">Hub and iSellBeer</option><option value="hub"${st.src==='hub'?' selected':''}>Captured in Kohler Hub</option><option value="isellbeer"${st.src==='isellbeer'?' selected':''}>Imported From iSellBeer</option></select></label>
    </div>
    <div class="mact">
      <button type="button" class="btn" id="dlCsv"${rows.length ? '' : ' disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Download CSV</button>
      <button type="button" class="btn outline" id="doRecap"${rows.length ? '' : ' disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>Export Recap</button>
      ${KEYS.some(k=>st[k]) ? `<button type="button" class="btn ghost" id="fclear">Clear Filters</button>` : ''}
    </div>
    <p class="mnote">Both exports use exactly the ${plural(c.records,'record')} below — every one the filters match, not just the ones on screen.</p>
  </section>
  <section class="mcard" aria-live="polite"><h2>Results</h2>
    <div class="mtiles mt4">${tile(c.accounts,'Accounts')}${tile(c.records,'Records','one per observation')}${tile(c.photos,'Photos','unique images')}${tile(c.lines,'Product / Brand Lines','what a record lists')}</div>
    <p class="mnote">${c.records===all.records ? 'All records you can see.' : `Of ${plural(all.records,'record')} you can see.`} Read ${E(fmtWhen(LOADED_AT))}. Counts are kept apart: one display can list several products, one survey several brands, one photo can belong to one record only.</p>
    ${rows.length ? body + (rows.length > shown ? `<button type="button" class="btn outline wide" id="more">Show More · ${plural(rows.length - shown,'record')}</button>` : '')
      : RECS.length ? `<div class="kdh-state empty"><b>No records match these filters.</b><span>Clear a filter or widen the dates.</span></div>`
      : `<div class="kdh-state empty"><b>No merchandising records yet.</b><span>Reps add them with Add Photos on an account; managers can import iSellBeer exports under <a href="import/">Import From iSellBeer</a>.</span></div>`}
  </section>
  <p class="mnote no-print"><a href="import/">Import From iSellBeer ›</a></p>`;
  wire(); hydrate(app);
}
function wire(){
  const on = (id, ev, f) => { const el = document.getElementById(id); if(el) el.addEventListener(ev, f); };
  const set = (k, v) => { st[k] = v; st.limit = 40; writeHash(); render(); };
  let t = 0; const typed = (id, k) => on(id, 'input', e=>{ clearTimeout(t); const v = e.target.value; t = setTimeout(()=>{ set(k, v); const n = document.getElementById(id); n.focus(); n.setSelectionRange(v.length, v.length); }, 250); });
  typed('fq', 'q'); typed('fbrand', 'brand');
  [['frep','rep'],['ffrom','from'],['fto','to'],['fcat','cat'],['fprog','prog'],['fsrc','src']].forEach(([id, k])=>on(id, 'change', e=>set(k, e.target.value)));
  on('fclear', 'click', ()=>{ KEYS.forEach(k=>{ st[k] = ''; }); st.limit = 40; writeHash(); render(); });
  on('more', 'click', ()=>{ const y = window.scrollY; st.limit += 40; render(); window.scrollTo(0, y); });
  on('dlCsv', 'click', downloadCsv);
  on('doRecap', 'click', recap);
}

/* ---- Download CSV: one row per product / brand line (a record with no lines = one row) ---- */
function csvCell(v){ const s = v==null ? '' : String(v); return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g, '""')+'"' : s; }
function downloadCsv(){
  const rows = view(); const c = counts(rows);
  const head = ['record_id','source','account_num','account_name','town','rep','category','subtype','observed_or_taken','author','program','caption','location','record_brands','photo_count','photo_refs',
    'line_no','supplier','brand_family','brand','package','product_num','quantity','quantity_unit','ownership_source','ownership_audited'];
  const out = [['# Merchandising Recap'], ['# Generated', new Date().toISOString()], ['# Filters', filterText()],
    ['# Counts', `${c.accounts} accounts · ${c.records} records · ${c.photos} photos · ${c.lines} product/brand lines (counted separately)`],
    ['# Note', 'Evidence is not program credit. Quantities carry their unit; a blank quantity was not recorded. One row per line; a record with no lines has one row.'], head];
  rows.forEach(r=>{
    const base = [r.key, M.SOURCE_LABEL[r.source||'hub'], r.customer_num, r.acct, r.city, r.rep, M.catLabel(r.category), r.subtype ? (M.SUB_LABEL[r.subtype]||r.subtype) : '', r.when, r.author_name || r.source_author || '',
      progName(r.program_id), r.caption || '', r.location || '', (r.brands||[]).join('; '), r.photos.length, r.photos.map(p=>p.storage_path || p.source_url || '').filter(Boolean).join(' ')];
    if(!r.lines.length) out.push(base.concat(['','','','','','','','','','']));
    else r.lines.forEach(l=>out.push(base.concat([l.line_no, l.supplier||'', l.brand_family||'', l.brand||'', l.package||'', l.product_num||'', l.quantity==null ? '' : l.quantity, l.quantity==null ? '' : (l.quantity_unit||'unspecified'), l.ownership_source||'', l.ownership_corrected||''])));
  });
  const blob = new Blob(['﻿' + out.map(r=>r.map(csvCell).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'merchandising-recap-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---- Export Recap: a print-ready page (Save as PDF) with readable photos ---- */
const RECAP_MAX = 150;
async function recap(){
  const rows = view(); const c = counts(rows);
  const btn = document.getElementById('doRecap'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  const take = rows.slice(0, RECAP_MAX);
  printEl.innerHTML = `<div class="rp-bar no-print"><button type="button" class="btn primary" id="rpPrint" disabled>Preparing photos…</button><button type="button" class="btn outline" id="rpBack">Back to Filters</button>
      <p class="mnote">Use Print → Save as PDF. ${rows.length > RECAP_MAX ? `<b>The recap holds the first ${RECAP_MAX} of ${rows.length} records</b> — narrow the filters (or use Download CSV) for the rest.` : ''}</p></div>
    <header class="rp-h"><h1>Merchandising Recap</h1><p>Generated ${E(fmtWhen(new Date().toISOString()))} · ${E(filterText())}</p>
      <p><b>${plural(c.accounts,'account')}</b> · <b>${plural(c.records,'record')}</b> · <b>${plural(c.photos,'photo')}</b> · <b>${plural(c.lines,'product / brand line')}</b> — counted separately${rows.length > RECAP_MAX ? ` (this printout: ${plural(take.length,'record')})` : ''}.</p>
      <p class="rp-def">Definitions: a <b>record</b> is one observation at one account (a display, a tap survey, a promotion); <b>lines</b> are the products or brands it lists, with the unit as recorded; <b>photos</b> are counted once each. “Last observed” = imported from iSellBeer; “Taken” = captured in the Hub. Evidence is not program credit.</p></header>
    ${groupByAccount(take).map(g=>`<section class="rgroup"><h3>${E(g.acct)} <small>${E([g.city, '#'+g.n, g.rep ? 'Rep: '+g.rep : ''].filter(Boolean).join(' · '))}</small></h3>${g.recs.map(r=>recHtml(r, true)).join('')}</section>`).join('')}`;
  app.hidden = true; printEl.hidden = false; document.body.classList.add('recap-on'); window.scrollTo(0, 0);
  document.getElementById('rpBack').addEventListener('click', ()=>{ printEl.hidden = true; printEl.innerHTML = ''; app.hidden = false; document.body.classList.remove('recap-on'); render(); });
  // load every image before printing (lazy images would print blank)
  printEl.querySelectorAll('img').forEach(i=>i.removeAttribute('loading'));
  hydrate(printEl);
  const imgs = Array.from(printEl.querySelectorAll('img'));
  await Promise.race([Promise.all(imgs.map(i=>new Promise(res=>{ if(i.complete && i.naturalWidth) return res(); i.addEventListener('load', res, {once:true}); i.addEventListener('error', res, {once:true}); }))), new Promise(res=>setTimeout(res, 45000))]);
  const p = document.getElementById('rpPrint'); if(p){ p.disabled = false; p.textContent = 'Print or Save as PDF'; p.addEventListener('click', ()=>window.print()); }
}

readHash();
load().then(()=>{ if(st.rep && !ROSTER.includes(st.rep)) st.rep = ''; render(); })
  .catch(e=>{ app.innerHTML = e.off ? `<div class="kdh-state unavailable"><b>${E(e.message)}</b></div>` : `<div class="kdh-state error"><b>Merchandising records could not be loaded.</b><span>${E(e.message||e)}. Reload, or sign in again.</span></div>`; });
})();
