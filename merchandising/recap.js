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
  + 'merch_lines(line_no,supplier,brand_family,brand,package,product_num,quantity,quantity_unit,ownership_source,ownership_corrected,ownership_rule,attrs,consumer_price),merch_record_photos(ord,photo_id)';
// before 20261005160000_capture_items.sql is run the two item columns do not exist yet
const REC_COLS_OLD = REC_COLS.replace(',attrs,consumer_price', '');
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
  catch(e){
    if(e.status===404 || e.code==='PGRST205' || e.code==='42P01') merchMissing = true;
    else if(e.status===400 || e.code==='42703' || e.code==='PGRST204'){ recs = await all('merch_records?select=' + REC_COLS_OLD + '&order=observed_at.desc.nullslast'); }
    else throw e; }
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
  out.forEach(r=>{ const a = ACCTS.get(String(r.customer_num)) || {}; r.acct = a.name || ('Account #'+r.customer_num); r.rep = a.rep || ''; r.city = a.city || ''; r.prem = a.prem || r.premise || '';
    r.when = r.observed_at || r.created_at; });
  RECS = out.filter(r=>inScope(r.rep)).sort((a,b)=>String(b.when).localeCompare(String(a.when)));
  LOADED_AT = new Date();
}

/* ---- filters (kept in the hash) ---- */
const st = {q:'', rep:'', from:'', to:'', brand:'', cat:'', prog:'', src:'', town:'', prem:'', limit:48};
const KEYS = ['q','rep','from','to','brand','cat','prog','src','town','prem'];
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
    if(st.town && r.city!==st.town) return false;
    if(st.prem && r.prem!==st.prem) return false;
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
  if(SEL.size) f.push(`Selection: ${SEL.size} selected record${SEL.size===1?'':'s'}`);
  if(st.q) f.push(`Account: “${st.q}”`);
  f.push('Rep: ' + (st.rep || (TEAM ? `${TEAM.dm.split(' ')[0]}’s team` : 'all reps')));
  if(st.from || st.to) f.push(`Dates: ${st.from ? fmtDay(st.from+'T12:00:00') : 'any'} – ${st.to ? fmtDay(st.to+'T12:00:00') : 'any'}`);
  if(st.brand) f.push(`Supplier / brand: “${st.brand}”`);
  if(st.cat) f.push('Category: ' + (st.cat==='none' ? 'Uncategorized' : M.catLabel(st.cat)));
  if(st.prog) f.push('Program: ' + (st.prog==='none' ? 'No program' : progName(st.prog)));
  if(st.src) f.push('Source: ' + M.SOURCE_LABEL[st.src]);
  if(st.town) f.push('Town: ' + st.town);
  if(st.prem) f.push('Premise: ' + (st.prem==='On' ? 'On-premise' : 'Off-premise'));
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
const lineHtml = l => `<li>${E([l.supplier, l.brand || l.brand_family, l.package].filter(Boolean).join(' · ') || 'Product not named')} — ${E(M.qtyText(l.quantity, l.quantity_unit))}${l.ownership_source ? ` · ${E(l.ownership_rule ? ({US:'Ours', THEM:'Theirs'}[l.ownership_source] + (l.ownership_rule==='rep' ? ' (rep’s call)' : '')) : l.ownership_source)}${l.ownership_corrected && l.ownership_corrected!==l.ownership_source ? ` (audited: ${E(l.ownership_corrected)})` : ''}` : ''}</li>`;
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

/* ---- screen (2026-10-07: photo workspace) ----
   One card per merchandising RECORD (lead photo + count), a wide responsive grid, a compact filter bar, and a full
   viewer (large photo, Previous / Next, zoom, details beside or under it). Filters live in the hash, so Back from an
   account lands on the same filtered gallery; the scroll position and "Show More" depth are kept in sessionStorage. */
const PAGE = 48;
const SEL = new Set();                       // selected record keys (export scope); separate from opening a photo
const BYKEY = () => new Map(RECS.map(r=>[r.key, r]));
const exportRows = () => { const v = view(); return SEL.size ? RECS.filter(r=>SEL.has(r.key) && inScope(r.rep)) : v; };
const typeTitle = r => [M.catLabel(r.category), r.subtype ? (M.SUB_LABEL[r.subtype] || r.subtype) : ''].filter(Boolean).join(' · ') || 'Photo';
const dayText = r => { const d = fmtDay(r.when); return d ? (r.source==='isellbeer' ? 'Observed on ' : '') + d : ''; };
function brandLine(r){
  const names = Array.from(new Set([].concat(r.brands||[], r.lines.map(l=>l.brand || l.brand_family || l.supplier)).filter(Boolean)));
  return names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) : '') : '';
}
function cardHtml(r){
  const n = r.photos.length, lead = r.photos[0];
  return `<article class="gc${SEL.has(r.key) ? ' on' : ''}" data-key="${E(r.key)}">
    <button type="button" class="gc-open" data-open="${E(r.key)}" aria-label="Open photos: ${E(r.acct)}, ${E(typeTitle(r))}">
      <span class="gc-ph">${lead ? `<img alt="" data-pid="${E(lead.id)}" decoding="async">` : `<span class="noimg">No photo on this record</span>`}
        ${n > 1 ? `<span class="gc-n" aria-hidden="true">${n} Photos</span>` : ''}</span>
      <span class="gc-b"><b class="gc-t">${E(r.acct)}</b>
        <span class="gc-m"><span class="gc-chip">${E(typeTitle(r))}</span></span>
        <span class="gc-s">${E([r.city, dayText(r)].filter(Boolean).join(' · '))}</span>
        ${r.rep ? `<span class="gc-r">${E(r.rep)}</span>` : ''}
        ${brandLine(r) ? `<span class="gc-r">${E(brandLine(r))}</span>` : ''}</span>
    </button>
    <label class="gc-sel"><input type="checkbox" data-sel="${E(r.key)}"${SEL.has(r.key) ? ' checked' : ''}><span class="sr">Select ${E(r.acct)} for export</span></label>
  </article>`;
}
// load thumbnails only as they scroll into view (a record's photo is a private-storage fetch)
let IO = null;
function hydrateLazy(root){
  if(!('IntersectionObserver' in window)) return hydrate(root);
  if(!IO) IO = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ IO.unobserve(e.target); hydrate(e.target); } }), {rootMargin:'400px'});
  root.querySelectorAll('.gc-ph').forEach(el=>IO.observe(el));
}
function activeChips(){
  const c = [];
  if(st.q) c.push(['q', 'Account: ' + st.q]);
  if(st.rep) c.push(['rep', st.rep]);
  if(st.cat) c.push(['cat', st.cat==='none' ? 'Uncategorized' : M.catLabel(st.cat)]);
  if(st.from || st.to) c.push(['dates', (st.from ? fmtDay(st.from+'T12:00:00') : 'Any') + ' – ' + (st.to ? fmtDay(st.to+'T12:00:00') : 'Any')]);
  if(st.town) c.push(['town', st.town]);
  if(st.prem) c.push(['prem', st.prem==='On' ? 'On-Premise' : 'Off-Premise']);
  if(st.brand) c.push(['brand', 'Brand: ' + st.brand]);
  if(st.prog) c.push(['prog', st.prog==='none' ? 'No program' : progName(st.prog)]);
  if(st.src) c.push(['src', M.SOURCE_LABEL[st.src]]);
  return c;
}
function render(keepScroll){
  const rows = view(); const c = counts(rows); const all = counts(RECS);
  PHOTOS = new Map(); RECS.forEach(r=>r.photos.forEach(p=>PHOTOS.set(String(p.id), p)));
  const progs = Array.from(new Set(RECS.map(r=>r.program_id).filter(Boolean))).sort((a,b)=>progName(a).localeCompare(progName(b)));
  const towns = Array.from(new Set(RECS.map(r=>r.city).filter(Boolean))).sort();
  const repOpts = ROSTER.map(n=>`<option${st.rep===n?' selected':''}>${E(n)}</option>`).join('');
  const chips = activeChips();
  const more = !!(st.brand || st.prog || st.src || st.town || st.prem);
  const scope = SEL.size ? `Exports ${plural(SEL.size, 'selected record')}.` : `Exports all ${plural(rows.length, 'matching record')}.`;
  const shown = rows.slice(0, st.limit);
  app.innerHTML = `
  <header class="mg-h"><div><h1>Photos &amp; Merchandising</h1>
    <p class="mg-sum" aria-live="polite"><b>${c.accounts.toLocaleString('en-US')}</b> ${c.accounts===1?'Account':'Accounts'} · <b>${c.records.toLocaleString('en-US')}</b> ${c.records===1?'Record':'Records'} · <b>${c.photos.toLocaleString('en-US')}</b> ${c.photos===1?'Photo':'Photos'}
      <span class="mg-2">· ${plural(c.lines, 'product / brand line')}${c.records===all.records ? '' : ' · of '+all.records.toLocaleString('en-US')+' records'}</span></p></div>
    <p class="mg-up">${TEAM ? `${E(TEAM.dm.split(' ')[0])}’s Team` : 'All Reps'} · Data read ${E(fmtWhen(LOADED_AT))}</p></header>
  ${NOTE ? `<div class="kdh-state unavailable slim">${E(NOTE)}</div>` : ''}
  <section class="mg-bar no-print" aria-label="Filters">
    <div class="mg-f">
      <label class="mg-q"><span>Account</span><input type="search" id="fq" value="${E(st.q)}" placeholder="Name, town or #" autocomplete="off"></label>
      <label><span>Photo Type</span><select id="fcat"><option value="">All Types</option>${M.CATS.map(x=>`<option value="${x.k}"${st.cat===x.k?' selected':''}>${E(x.label)}</option>`).join('')}<option value="none"${st.cat==='none'?' selected':''}>Uncategorized</option></select></label>
      <label><span>From</span><input type="date" id="ffrom" value="${E(st.from)}"></label>
      <label><span>To</span><input type="date" id="fto" value="${E(st.to)}"></label>
      <label><span>Rep</span><select id="frep"><option value="">${TEAM ? `${E(TEAM.dm.split(' ')[0])}’s Team` : 'All Reps'}</option>${repOpts}</select></label>
    </div>
    <details class="mg-more"${more ? ' open' : ''}><summary>More Filters</summary>
      <div class="mg-f">
        <label><span>Town</span><select id="ftown"><option value="">All Towns</option>${towns.map(t=>`<option${st.town===t?' selected':''}>${E(t)}</option>`).join('')}</select></label>
        <label><span>Premise</span><select id="fprem"><option value="">On &amp; Off</option><option value="On"${st.prem==='On'?' selected':''}>On-Premise</option><option value="Off"${st.prem==='Off'?' selected':''}>Off-Premise</option></select></label>
        <label><span>Brand or Product</span><input type="search" id="fbrand" value="${E(st.brand)}" placeholder="e.g. Boston Beer" autocomplete="off"></label>
        <label><span>Program</span><select id="fprog"><option value="">Any Program</option>${progs.map(p=>`<option value="${E(p)}"${st.prog===p?' selected':''}>${E(progName(p))}</option>`).join('')}<option value="none"${st.prog==='none'?' selected':''}>No program</option></select></label>
        <label><span>Source</span><select id="fsrc"><option value="">Hub and iSellBeer</option><option value="hub"${st.src==='hub'?' selected':''}>Captured in Hub</option><option value="isellbeer"${st.src==='isellbeer'?' selected':''}>Imported From iSellBeer</option></select></label>
      </div></details>
    ${chips.length ? `<div class="mg-chips"><span class="mg-ct">Filters:</span>${chips.map(x=>`<button type="button" class="mg-chip" data-unf="${x[0]}" aria-label="Remove filter ${E(x[1])}">${E(x[1])} <i aria-hidden="true">×</i></button>`).join('')}<button type="button" class="btn ghost sm" id="fclear">Clear Filters</button></div>` : ''}
  </section>
  <section class="mg-ex no-print" aria-label="Export">
    <div class="mg-exb">
      <button type="button" class="btn primary" id="dlXlsx"${rows.length || SEL.size ? '' : ' disabled'}>Download Excel</button>
      <button type="button" class="btn outline" id="doRecap"${rows.length || SEL.size ? '' : ' disabled'}>Export Photo PDF</button>
      <button type="button" class="btn ghost" id="dlCsv"${rows.length || SEL.size ? '' : ' disabled'}>CSV</button>
    </div>
    <div class="mg-exs"><span id="exScope">${E(scope)}</span> <span class="mg-hint">Photo PDF opens a print view — choose Save as PDF.</span>
      ${rows.length ? `<button type="button" class="linkbtn" id="selAll">Select All ${rows.length.toLocaleString('en-US')} Matching</button>` : ''}${SEL.size ? `<button type="button" class="linkbtn" id="selNone">Clear Selection</button>` : ''}</div>
  </section>
  ${shown.length ? `<div class="gg" id="gg">${shown.map(cardHtml).join('')}</div>
    ${rows.length > shown.length ? `<button type="button" class="btn outline wide" id="more">Show More · ${(rows.length - shown.length).toLocaleString('en-US')} Records</button>` : ''}`
    : RECS.length ? `<div class="kdh-state empty"><b>No Records Match</b><span>Clear a filter or widen the dates.</span></div>`
    : `<div class="kdh-state empty"><b>No Records Yet</b><span>Reps add them with Add Photos on an account.</span></div>`}
  <p class="mnote no-print"><a href="import/">Import From iSellBeer ›</a></p>`;
  wire(); hydrateLazy(app);
}
function wire(){
  const on = (id, ev, f) => { const el = document.getElementById(id); if(el) el.addEventListener(ev, f); };
  const set = (k, v) => { st[k] = v; st.limit = PAGE; writeHash(); render(); };
  let t = 0; const typed = (id, k) => on(id, 'input', e=>{ clearTimeout(t); const v = e.target.value; t = setTimeout(()=>{ set(k, v); const n = document.getElementById(id); n.focus(); n.setSelectionRange(v.length, v.length); }, 250); });
  typed('fq', 'q'); typed('fbrand', 'brand');
  [['frep','rep'],['ffrom','from'],['fto','to'],['fcat','cat'],['fprog','prog'],['fsrc','src'],['ftown','town'],['fprem','prem']].forEach(([id, k])=>on(id, 'change', e=>set(k, e.target.value)));
  const clear = ks => { ks.forEach(k=>{ st[k] = ''; }); st.limit = PAGE; writeHash(); render(); };
  on('fclear', 'click', ()=>clear(KEYS));
  document.querySelectorAll('[data-unf]').forEach(b=>b.addEventListener('click', ()=>clear(b.dataset.unf==='dates' ? ['from','to'] : [b.dataset.unf])));
  on('more', 'click', ()=>{ const y = window.scrollY; st.limit += PAGE; render(); window.scrollTo(0, y); });
  on('selAll', 'click', ()=>{ view().forEach(r=>SEL.add(r.key)); const y = window.scrollY; render(); window.scrollTo(0, y); });
  on('selNone', 'click', ()=>{ SEL.clear(); const y = window.scrollY; render(); window.scrollTo(0, y); });
  on('dlCsv', 'click', downloadCsv); on('dlXlsx', 'click', downloadXlsx); on('doRecap', 'click', recap);
  const gg = document.getElementById('gg');
  if(gg){
    gg.addEventListener('click', e=>{
      const o = e.target.closest('[data-open]'); if(o){ openViewer(o.dataset.open, 0, o); }
    });
    gg.addEventListener('change', e=>{
      const k = e.target.dataset && e.target.dataset.sel; if(!k) return;
      if(e.target.checked) SEL.add(k); else SEL.delete(k);
      e.target.closest('.gc').classList.toggle('on', e.target.checked);
      const sc = document.getElementById('exScope'); if(sc) sc.textContent = SEL.size ? `Exports ${plural(SEL.size, 'selected record')}.` : `Exports all ${plural(view().length, 'matching record')}.`;
      const ex = document.querySelector('.mg-exs'); if(ex){ let b = document.getElementById('selNone'); if(SEL.size && !b){ b = document.createElement('button'); b.type = 'button'; b.className = 'linkbtn'; b.id = 'selNone'; b.textContent = 'Clear Selection'; b.addEventListener('click', ()=>{ SEL.clear(); const y = window.scrollY; render(); window.scrollTo(0, y); }); ex.appendChild(b); } else if(!SEL.size && b) b.remove(); }
    });
  }
}

/* ---- Photo Admin delete (2026-10-07, Gavin only for now) ----
   Buttons are drawn only when the database says this sign-in is a photo admin (allowed_users.photo_admin, set by hand
   for one account; rpc kdh_is_photo_admin). The database still decides every delete: row-level security removes
   nothing for anyone else, so each DELETE asks for the removed rows back and a 0-row answer is reported, never
   treated as success. Never offered in preview. ---- */
const ADMIN = {ok:false};
const authCfg = () => { const c = window.KDH_AUTH || {}; const m = document.cookie.match(/(?:^|;\s*)kdh_at=([^;]*)/); return c.url && c.key && m ? {url:c.url.replace(/\/$/, ''), key:c.key, tok:decodeURIComponent(m[1])} : null; };
async function delRows(path){ const c = authCfg(); if(!c) throw new Error('Sign in again.');
  const r = await fetch(c.url + '/rest/v1/' + path, {method:'DELETE', headers:{apikey:c.key, authorization:'Bearer ' + c.tok, prefer:'return=representation'}});
  if(!r.ok) throw new Error('HTTP ' + r.status); const rows = await r.json().catch(()=>[]); return Array.isArray(rows) ? rows.length : 0; }
async function delObject(p){ const c = authCfg(); if(!c || !p) return true;
  const r = await fetch(c.url + '/storage/v1/object/account-photos/' + String(p).split('/').map(encodeURIComponent).join('/'), {method:'DELETE', headers:{apikey:c.key, authorization:'Bearer ' + c.tok}});
  if(!r.ok) return false; const j = await r.json().catch(()=>[]); return !Array.isArray(j) || j.length > 0; }
async function deletePhoto(){
  const r = VW.rec, p = r.photos[VW.i]; if(!p) return;
  if(!confirm(`Delete this photo from ${r.acct} as Photo Admin? This cannot be undone.${p.source==='isellbeer' ? ' Importing the same iSellBeer file again would bring it back.' : ''}`)) return;
  const btn = document.getElementById('vwDelPhoto'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try{
    if(!await delRows('account_photos?id=eq.' + encodeURIComponent(p.id))) throw new Error('Not deleted — this sign-in is not a Photo Admin. Nothing was changed.');
    const fileGone = await delObject(p.storage_path);
    r.photos.splice(VW.i, 1); PHOTOS.delete(String(p.id));
    if(!r.photos.length && r.key.startsWith('ph:')) RECS.splice(RECS.indexOf(r), 1);
    const y = window.scrollY;
    if(r.photos.length){ VW.i = Math.min(VW.i, r.photos.length - 1); vwShow(); } else closeViewer(true);
    render(); window.scrollTo(0, y);
    toast(fileGone ? 'Photo deleted' : 'Photo deleted. Its stored file could not be removed.');
  } catch(e){ btn.disabled = false; btn.removeAttribute('aria-busy'); toast(e.message || 'Could not delete the photo.'); }
}
async function deleteRecord(){
  const r = VW.rec; if(r.key.startsWith('ph:')) return deletePhoto();
  if(!confirm(`Delete this ${typeTitle(r).toLowerCase()} at ${r.acct} and its ${plural(r.photos.length, 'photo')} as Photo Admin? This cannot be undone.${r.source==='isellbeer' ? ' Importing the same iSellBeer file again would bring it back.' : ''}`)) return;
  const btn = document.getElementById('vwDelRec'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try{
    if(!await delRows('merch_records?id=eq.' + encodeURIComponent(r.id))) throw new Error('Not deleted — this sign-in is not a Photo Admin. Nothing was changed.');
    let stuck = 0;
    for(const p of r.photos){ try{ if(await delRows('account_photos?id=eq.' + encodeURIComponent(p.id)) && !await delObject(p.storage_path)) stuck++; }catch(e){ stuck++; } PHOTOS.delete(String(p.id)); }
    RECS.splice(RECS.indexOf(r), 1); SEL.delete(r.key);
    const y = window.scrollY; closeViewer(true); render(); window.scrollTo(0, y);
    toast(stuck ? `Record deleted. ${plural(stuck, 'file')} could not be removed.` : 'Record deleted');
  } catch(e){ btn.disabled = false; btn.removeAttribute('aria-busy'); toast(e.message || 'Could not delete the record.'); }
}
function toast(msg){ let t = document.getElementById('mgToast'); if(!t){ t = document.createElement('div'); t.id = 'mgToast'; t.className = 'mg-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(()=>t.classList.remove('on'), 5000); }

/* ---- photo viewer: large image, Previous / Next, zoom, details beside (desktop) or under (phone) ---- */
const VW = {rec:null, i:0, opener:null, z:1, x:0, y:0, el:null};
const galleryHash = () => { const h = new URLSearchParams(location.hash.slice(1)); h.delete('rec'); h.delete('ph'); const x = h.toString(); return x ? '#' + x : ''; };
const acctHref = r => '../accounts/#acct=' + encodeURIComponent(r.customer_num) + '&from=' + encodeURIComponent(location.pathname + galleryHash()) + '&fl=' + encodeURIComponent('Photos & Merchandising');
function infoHtml(r, p){
  const imp = r.source==='isellbeer';
  const photographer = (p && p.author_name) || r.author_name || r.source_author || '';
  const row = (k, v) => v ? `<div class="vi-r"><dt>${E(k)}</dt><dd>${v}</dd></div>` : '';
  const lines = r.lines.length ? `<ul class="vi-l">${r.lines.map(lineHtml).join('')}</ul>` : ((r.brands||[]).length ? `<p>${E(r.brands.join(', '))}</p>` : '<p class="vi-mu">No products or brands recorded.</p>');
  return `<section class="vi-g"><h3>Account</h3><dl>${row('Name', `<b>${E(r.acct)}</b>`)}${row('Town', E(r.city))}${row('Account #', E(r.customer_num))}</dl>
      <a class="btn outline sm" href="${E(acctHref(r))}" id="vwAcct">Open Account</a></section>
    <section class="vi-g"><h3>Observation</h3><dl>${row('Type', E(typeTitle(r)))}${row(imp ? 'Observed on' : 'Taken on', E(fmtWhen(r.when)))}
      ${row('Photographer', E(photographer || 'Unknown'))}${row('Assigned Rep', E(r.rep || '—'))}</dl></section>
    <section class="vi-g"><h3>Products / Brands</h3>${lines}</section>
    ${(r.caption || r.location) ? `<section class="vi-g"><h3>Notes</h3>${r.caption ? `<p>“${E(r.caption)}”</p>` : ''}${r.location ? `<p>Location: ${E(r.location)}</p>` : ''}</section>` : ''}
    <section class="vi-g"><h3>Source</h3><p>${E(M.SOURCE_LABEL[r.source||'hub'])}${imp && r.isb_promotion_type ? ' · ' + E(r.isb_promotion_type) : ''}</p></section>
    ${ADMIN.ok ? `<section class="vi-g vi-admin"><h3>Photo Admin</h3><div class="vi-act">${r.photos.length ? `<button type="button" class="btn outline danger sm" id="vwDelPhoto">Delete This Photo</button>` : ''}${r.key.startsWith('ph:') ? '' : `<button type="button" class="btn outline danger sm" id="vwDelRec">Delete Record${r.photos.length > 1 ? ' and All Photos' : ''}</button>`}</div></section>` : ''}
    ${r.program_id ? `<section class="vi-g"><h3>Program</h3><p>${E(progName(r.program_id))}<span class="vi-mu"> · Evidence, not credit</span></p></section>` : ''}`;
}
function openViewer(key, i, opener){
  const r = BYKEY().get(key); if(!r) return;
  closeViewer(true);
  VW.rec = r; VW.i = i || 0; VW.opener = opener || document.activeElement; VW.z = 1; VW.x = 0; VW.y = 0;
  const d = document.createElement('div'); d.className = 'vw'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Photo viewer: ' + r.acct);
  d.innerHTML = `<div class="vw-top"><button type="button" class="vw-x" id="vwClose" aria-label="Close photo viewer">Close <i aria-hidden="true">×</i></button>
      <div class="vw-ti"><b>${E(r.acct)}</b><span>${E(typeTitle(r))}</span></div><div class="vw-pos" id="vwPos" aria-live="polite"></div></div>
    <div class="vw-main"><div class="vw-stage"><div class="vw-view" id="vwView" tabindex="0" aria-label="Photo. Use arrow keys to change photos.">
        <img id="vwImg" alt="${E(typeTitle(r))} at ${E(r.acct)}" draggable="false"><div class="vw-msg" id="vwMsg"></div></div>
      <button type="button" class="vw-nav prev" id="vwPrev" aria-label="Previous photo">‹</button><button type="button" class="vw-nav next" id="vwNext" aria-label="Next photo">›</button>
      <div class="vw-zoom" role="group" aria-label="Zoom"><button type="button" id="vwZm" aria-label="Zoom out">−</button><button type="button" id="vwZr" aria-label="Reset zoom">Fit</button><button type="button" id="vwZp" aria-label="Zoom in">+</button></div></div>
      <details class="vw-info" id="vwInfo"><summary>Record Details</summary><div id="vwBody"></div></details></div>`;
  document.body.appendChild(d); VW.el = d; document.body.classList.add('vw-lock');
  const info = d.querySelector('#vwInfo'); info.open = window.matchMedia('(min-width:900px)').matches;
  if(info.open) info.addEventListener('click', e=>{ if(e.target.tagName==='SUMMARY' && window.matchMedia('(min-width:900px)').matches) e.preventDefault(); });
  d.querySelector('#vwClose').addEventListener('click', ()=>closeViewer());
  d.querySelector('#vwPrev').addEventListener('click', ()=>vwGo(-1)); d.querySelector('#vwNext').addEventListener('click', ()=>vwGo(1));
  d.querySelector('#vwZp').addEventListener('click', ()=>vwZoom(1.5)); d.querySelector('#vwZm').addEventListener('click', ()=>vwZoom(1/1.5)); d.querySelector('#vwZr').addEventListener('click', ()=>vwZoom(0));
  d.addEventListener('keydown', vwKey);
  const view = d.querySelector('#vwView');
  view.addEventListener('wheel', e=>{ e.preventDefault(); vwZoom(e.deltaY < 0 ? 1.15 : 1/1.15); }, {passive:false});
  vwPointer(view);
  d.querySelector('#vwAcct') && 0;
  vwShow(); d.querySelector('#vwClose').focus();
  const h = new URLSearchParams(location.hash.slice(1)); h.set('rec', key); h.set('ph', String(VW.i)); history.replaceState(null, '', location.pathname + '#' + h.toString());
}
function closeViewer(quiet){
  if(!VW.el) return;
  VW.el.remove(); VW.el = null; document.body.classList.remove('vw-lock');
  if(!quiet){ writeHash(); const o = VW.opener; if(o && document.contains(o)) o.focus(); }
}
function vwKey(e){
  if(e.key==='Escape'){ e.preventDefault(); closeViewer(); }
  else if(e.key==='ArrowLeft'){ vwGo(-1); } else if(e.key==='ArrowRight'){ vwGo(1); }
  else if(e.key==='+' || e.key==='='){ vwZoom(1.5); } else if(e.key==='-'){ vwZoom(1/1.5); } else if(e.key==='0'){ vwZoom(0); }
  else if(e.key==='Tab'){ const f = Array.from(VW.el.querySelectorAll('button:not([disabled]),a[href],summary,[tabindex="0"]')).filter(x=>x.offsetParent !== null); if(!f.length) return;
    const a = f[0], z = f[f.length-1]; if(e.shiftKey && document.activeElement===a){ e.preventDefault(); z.focus(); } else if(!e.shiftKey && document.activeElement===z){ e.preventDefault(); a.focus(); } }
}
function vwGo(d){ const n = VW.rec.photos.length; if(n < 2) return; VW.i = (VW.i + d + n) % n; VW.z = 1; VW.x = 0; VW.y = 0; vwShow();
  const h = new URLSearchParams(location.hash.slice(1)); h.set('ph', String(VW.i)); history.replaceState(null, '', location.pathname + '#' + h.toString()); }
function vwApply(){ const im = VW.el && VW.el.querySelector('#vwImg'); if(im) im.style.transform = `translate(${VW.x}px,${VW.y}px) scale(${VW.z})`; const v = VW.el && VW.el.querySelector('#vwView'); if(v) v.classList.toggle('zoomed', VW.z > 1); }
function vwZoom(f){ VW.z = f === 0 ? 1 : Math.min(6, Math.max(1, VW.z * f)); if(VW.z === 1){ VW.x = 0; VW.y = 0; } vwApply(); }
function vwPointer(view){ // drag to pan when zoomed; two fingers pinch
  const pts = new Map(); let d0 = 0, z0 = 1, last = null;
  view.addEventListener('pointerdown', e=>{ pts.set(e.pointerId, {x:e.clientX, y:e.clientY}); view.setPointerCapture(e.pointerId); if(pts.size === 2){ const [a, b] = [...pts.values()]; d0 = Math.hypot(a.x-b.x, a.y-b.y); z0 = VW.z; } last = {x:e.clientX, y:e.clientY}; });
  view.addEventListener('pointermove', e=>{ if(!pts.has(e.pointerId)) return; pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pts.size === 2 && d0){ const [a, b] = [...pts.values()]; VW.z = Math.min(6, Math.max(1, z0 * Math.hypot(a.x-b.x, a.y-b.y) / d0)); vwApply(); }
    else if(pts.size === 1 && VW.z > 1 && last){ VW.x += e.clientX - last.x; VW.y += e.clientY - last.y; last = {x:e.clientX, y:e.clientY}; vwApply(); } });
  const up = e=>{ pts.delete(e.pointerId); if(pts.size < 2) d0 = 0; last = null; };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
}
function vwShow(){
  const r = VW.rec, n = r.photos.length, p = r.photos[VW.i], el = VW.el; if(!el) return;
  el.querySelector('#vwPos').textContent = n ? `Photo ${VW.i + 1} of ${n}` : 'No photos';
  el.classList.toggle('single', n < 2);
  el.querySelector('#vwBody').innerHTML = infoHtml(r, p);
  { const a = el.querySelector('#vwDelPhoto'); if(a) a.addEventListener('click', deletePhoto); const b = el.querySelector('#vwDelRec'); if(b) b.addEventListener('click', deleteRecord); }
  const im = el.querySelector('#vwImg'), msg = el.querySelector('#vwMsg'); vwApply();
  im.removeAttribute('src'); im.hidden = true;
  if(!p){ msg.innerHTML = '<span>No photo on this record</span>'; return; }
  msg.innerHTML = '<span>Loading photo…</span>';
  const mine = p.id + ':' + VW.i;
  const fail = () => { if(VW.el !== el || r.photos[VW.i] !== p) return; im.hidden = true; msg.innerHTML = `<span>This photo could not be loaded.</span><button type="button" class="btn sm" id="vwRetry">Try Again</button>`; const b = msg.querySelector('#vwRetry'); b.addEventListener('click', ()=>{ blobs.delete(p.storage_path); vwShow(); }); };
  imgFor(p).then(u=>{ if(VW.el !== el || r.photos[VW.i] !== p) return; if(!u) return fail();
    im.onload = () => { if(VW.el === el){ msg.innerHTML = ''; im.hidden = false; } }; im.onerror = fail; im.src = u; }).catch(fail);
}

/* ---- Download Excel (2026-10-05): the iSellBeer-style export. One row per product / brand line
   (a record with no lines = one row), clickable Photo columns and an Open in Hub link per row, and an
   About sheet with the filters, the separate counts and the link expiry. Photos the Hub stores get a
   7-day signed link (made with the manager's own sign-in, so only photos they can see); iSellBeer
   imports keep iSellBeer's own link. Exactly view() -- the filtered set on screen. ---- */
const LINK_DAYS = 7, MAX_PHOTO_COLS = 6;
// the capture items' details (shared/merch-types.js ITEMS, 2026-10-05): one column each
const ATTR_COLS = [['pod_type','POD Type'],['shelf','Shelf Location'],['sticker','Sticker Type'],['cooler','Cooler'],['placement','Placement'],['material','Material'],['window','Window'],['theme','Theme'],['menu','Menu'],['promo','Promotion']];
const attrVal = (cat, l, k) => { const a = l.attrs || {}; if(!a[k]) return ''; if(k==='theme' && a[k]==='custom') return a.theme_text || 'Custom'; return M.optLabel(cat, k, a[k]); };
async function downloadXlsx(){
  const btn = document.getElementById('dlXlsx'); const label = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Preparing photo links…'; }
  try{
    const rows = exportRows(); const c = counts(rows);
    const paths = [...new Set(rows.flatMap(r=>r.photos.map(p=>p.storage_path).filter(Boolean)))];
    const signed = await D.signUrls(paths, LINK_DAYS*86400);
    const nPhotoCols = Math.min(MAX_PHOTO_COLS, Math.max(1, ...rows.map(r=>r.photos.length)));
    const hub = location.origin + location.pathname.replace(/merchandising\/.*$/, '');
    const head = ['Date', 'Account #', 'Account', 'Town', 'Premise', 'Rep', 'Category', 'Subtype', 'Supplier', 'Brand Family', 'Brand', 'Package', 'Product #',
      'Quantity', 'Unit', 'Price to Consumer'].concat(ATTR_COLS.map(c=>c[1]), ['US/THEM', 'US/THEM Basis', 'Tap Tracker Audit', 'Record Brands', 'Note', 'Location', 'Program', 'Taken By', 'Source', 'Photos'])
      .concat(Array.from({length:nPhotoCols}, (_, i)=>i ? 'Photo '+(i+1) : 'Photo'), ['Open in Hub', 'Record ID']);
    const photoCell = p => { const u = p.storage_path ? signed[p.storage_path] : p.source_url; return u ? {v: p.storage_path ? 'Open Photo' : 'Open in iSellBeer', link: u} : (p.storage_path ? 'Link unavailable' : ''); };
    const out = [head]; let unsigned = 0;
    rows.forEach(r=>{
      r.photos.forEach(p=>{ if(p.storage_path && !signed[p.storage_path]) unsigned++; });
      const day = String(r.when||'').slice(0,10);
      const base = r2 => [day, Number(r.customer_num) || r.customer_num, r.acct, r.city, r.prem==='On' ? 'On-premise' : r.prem==='Off' ? 'Off-premise' : '', r.rep,
        M.catLabel(r.category), r.subtype ? (M.SUB_LABEL[r.subtype]||r.subtype) : ''].concat(r2, [(r.brands||[]).join('; '), r.caption || '', r.location || '',
        r.program_id ? progName(r.program_id) : '', r.author_name || r.source_author || '', M.SOURCE_LABEL[r.source||'hub'], r.photos.length],
        Array.from({length:nPhotoCols}, (_, i)=>r.photos[i] ? photoCell(r.photos[i]) : ''),
        [{v:'Open in Hub', link: hub + 'accounts/#acct=' + encodeURIComponent(r.customer_num) + '&sec=more&sub=photos'}, r.key]);
      if(!r.lines.length) out.push(base(Array(11 + ATTR_COLS.length).fill('')));
      else r.lines.forEach(l=>out.push(base([l.supplier||'', l.brand_family||'', l.brand||'', l.package||'', l.product_num||'',
        l.quantity==null ? '' : Number(l.quantity), l.quantity==null ? '' : M.UNIT_LABEL[l.quantity_unit||'unspecified'] || l.quantity_unit,
        l.consumer_price==null || l.consumer_price==='' ? '' : Number(l.consumer_price)].concat(ATTR_COLS.map(c=>attrVal(r.category, l, c[0])), [l.ownership_source||'',
        !l.ownership_source ? '' : l.ownership_rule==='territory' ? 'Territory list' : l.ownership_rule==='rep' ? 'Rep’s call' : 'iSellBeer', l.ownership_corrected||'']))));
    });
    const about = [['Merchandising Export'], ['Generated', new Date().toLocaleString('en-US')], ['Filters', filterText()],
      ['Counts', `${c.accounts} accounts · ${c.records} records · ${c.photos} photos · ${c.lines} product / brand lines (counted separately)`],
      ['Rows', 'One row per product / brand line; a record with no lines has one row. A blank quantity was not recorded.'],
      ['Photo links', `Photos saved in the Hub open through a link that works for ${LINK_DAYS} days (until ${new Date(Date.now()+LINK_DAYS*86400000).toLocaleDateString('en-US')}); download again for fresh links. “Open in Hub” always works for a signed-in manager. iSellBeer photos open iSellBeer's own link.`],
      ['Note', 'Evidence is not program credit. Nothing here changes iSellBeer.']];
    if(unsigned) about.push(['Unavailable', `${unsigned} stored photo(s) could not get a link (sign in again and retry).`]);
    const blob = KdhXlsx.book([{name:'Records', rows:out, freeze:1, widths:[11,10,30,14,11,16,14,14,18,18,24,12,10,9,10,10].concat(Array(ATTR_COLS.length).fill(14), [10,14,10,24,30,16,22,18,22,7]).concat(Array(nPhotoCols).fill(16), [14, 22])},
      {name:'About', rows:about, widths:[16, 110]}]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'merchandising-export-' + new Date().toISOString().slice(0,10) + '.xlsx';
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } finally {
    if(btn){ btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = label; }
  }
}

/* ---- Download CSV: one row per product / brand line (a record with no lines = one row) ---- */
function csvCell(v){ const s = v==null ? '' : String(v); return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g, '""')+'"' : s; }
function downloadCsv(){
  const rows = exportRows(); const c = counts(rows);
  const head = ['record_id','source','account_num','account_name','town','rep','category','subtype','observed_or_taken','author','program','caption','location','record_brands','photo_count','photo_refs',
    'line_no','supplier','brand_family','brand','package','product_num','quantity','quantity_unit','consumer_price','details','ownership_source','ownership_basis','ownership_audited'];
  const out = [['# Merchandising Recap'], ['# Generated', new Date().toISOString()], ['# Filters', filterText()],
    ['# Counts', `${c.accounts} accounts · ${c.records} records · ${c.photos} photos · ${c.lines} product/brand lines (counted separately)`],
    ['# Note', 'Evidence is not program credit. Quantities carry their unit; a blank quantity was not recorded. One row per line; a record with no lines has one row.'], head];
  rows.forEach(r=>{
    const base = [r.key, M.SOURCE_LABEL[r.source||'hub'], r.customer_num, r.acct, r.city, r.rep, M.catLabel(r.category), r.subtype ? (M.SUB_LABEL[r.subtype]||r.subtype) : '', r.when, r.author_name || r.source_author || '',
      progName(r.program_id), r.caption || '', r.location || '', (r.brands||[]).join('; '), r.photos.length, r.photos.map(p=>p.storage_path || p.source_url || '').filter(Boolean).join(' ')];
    if(!r.lines.length) out.push(base.concat(['','','','','','','','','','','','','']));
    else r.lines.forEach(l=>out.push(base.concat([l.line_no, l.supplier||'', l.brand_family||'', l.brand||'', l.package||'', l.product_num||'', l.quantity==null ? '' : l.quantity, l.quantity==null ? '' : (l.quantity_unit||'unspecified'), l.consumer_price==null ? '' : l.consumer_price, M.itemText(r.category, Object.assign({}, l, {quantity:null, consumer_price:null})), l.ownership_source||'',
      !l.ownership_source ? '' : l.ownership_rule==='territory' ? 'territory list' : l.ownership_rule==='rep' ? 'rep' : 'isellbeer', l.ownership_corrected||''])));
  });
  const blob = new Blob(['﻿' + out.map(r=>r.map(csvCell).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'merchandising-recap-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---- Export Recap: a print-ready page (Save as PDF) with readable photos ---- */
const RECAP_MAX = 300;
async function recap(){
  const rows = exportRows(); const c = counts(rows);
  const btn = document.getElementById('doRecap'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  const take = rows.slice(0, RECAP_MAX);
  printEl.innerHTML = `<div class="rp-bar no-print"><button type="button" class="btn primary" id="rpPrint" disabled>Preparing photos…</button><button type="button" class="btn outline" id="rpBack">Back to Filters</button>
      <p class="mnote">This is a print view: use Print → Save as PDF. ${rows.length > RECAP_MAX ? `<b>The recap holds the first ${RECAP_MAX} of ${rows.length} records</b> — narrow the filters (or select fewer records, or use Download Excel / CSV, which include every record) for the rest.` : ''}</p></div>
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
    const miss = Array.from(printEl.querySelectorAll('.rrec-ph .noimg')).filter(x=>x.textContent==='Photo Unavailable').length;
  if(miss){ const n = printEl.querySelector('.rp-bar .mnote'); if(n) n.insertAdjacentHTML('beforeend', ` <b>${plural(miss,'photo')} could not be loaded</b> and show as “Photo Unavailable”.`); }
  const p = document.getElementById('rpPrint'); if(p){ p.disabled = false; p.textContent = 'Print or Save as PDF'; p.addEventListener('click', ()=>window.print()); }
}

readHash();
const posKey = 'kdh_merch_pos';
load().then(()=>{
  if(st.rep && !ROSTER.includes(st.rep)) st.rep = '';
  D.rpc('kdh_is_photo_admin').then(v=>{ if(v === true && !(window.kdhUser && (window.kdhUser()||{}).preview)){ ADMIN.ok = true; if(VW.el) vwShow(); } }).catch(()=>{});
  // Back from an account: same filters (hash), same "Show More" depth, same scroll position
  let pos = null; try{ pos = JSON.parse(sessionStorage.getItem(posKey) || 'null'); sessionStorage.removeItem(posKey); }catch(e){}
  if(pos && pos.path === location.pathname + location.hash.replace(/&?(rec|ph)=[^&]*/g, '')) st.limit = Math.max(st.limit, pos.limit || st.limit);
  render();
  if(pos) window.scrollTo(0, pos.y || 0);
  const h = new URLSearchParams(location.hash.slice(1)); if(h.get('rec') && BYKEY().get(h.get('rec'))) openViewer(h.get('rec'), Number(h.get('ph')) || 0, null);
}).catch(e=>{ app.innerHTML = e.off ? `<div class="kdh-state unavailable"><b>${E(e.message)}</b></div>` : `<div class="kdh-state error"><b>Merchandising records could not be loaded.</b><span>${E(e.message||e)}. Reload, or sign in again.</span></div>`; });
// leaving for an account: remember where we were
document.addEventListener('click', e=>{ const a = e.target.closest && e.target.closest('#vwAcct'); if(!a) return;
  try{ const h = new URLSearchParams(location.hash.slice(1)); h.delete('rec'); h.delete('ph'); const hs = h.toString();
    sessionStorage.setItem(posKey, JSON.stringify({path: location.pathname + (hs ? '#' + hs : ''), y: window.scrollY, limit: st.limit})); }catch(_){}
  history.replaceState(null, '', location.pathname + (location.hash.replace(/&?(rec|ph)=[^&]*/g, '').replace(/^#&/, '#') || '')); }, true);
})();
