/* Import From iSellBeer (2026-10-04). See the comment in index.html. */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = document.getElementById('impApp');
const U = window.kdhUser ? window.kdhUser() : null;
if(!U || U.role!=='manager' || (U.preview && U.role!=='manager')){
  app.innerHTML = `<div class="kdh-state unavailable"><b>Importing is for managers.</b><span>Reps add evidence from the Account page.</span></div>`; return;
}
const I = window.KdhIsb, D = window.KdhData, M = window.KdhMerch;
const plural = (n, w, p) => n+' '+(n===1 ? w : (p || w+'s'));
const fmtWhen = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'}); };

// the customer base (CustomerID -> name, premise, rep): records are matched by ID only
const ACCTS = new Map();
try{ Object.entries(HUB_ACCOUNTS.reps).forEach(([rep, list])=>list.forEach(a=>ACCTS.set(String(a.n), {name:a.name, prem:a.prem, rep, city:a.city}))); }catch(e){}
let TAP = null;   // the Tap Tracker's audited survey data, for US/THEM corrections
async function tapData(){
  if(TAP !== null) return TAP;
  try{ const h = await (await fetch('../../isellbeer/tap-survey-tracking/index.html', {cache:'no-store'})).text();
    const m = /<script id="tap-data" type="application\/json">([\s\S]*?)<\/script>/.exec(h); TAP = m ? JSON.parse(m[1]) : false; }
  catch(e){ TAP = false; }
  return TAP;
}

const st = {files:[], parsed:[], pdfs:[], pages:[], existing:new Set(), rec:null, busy:false, result:null, err:''};
// pages: {id, file, page, blob, url, width, height, match:'' (source_key) }

function render(){
  const P = st.parsed, rec = st.rec;
  const matched = st.pages.filter(p=>p.match).length;
  const recordOpts = rec ? rec.records.slice().sort((a,b)=>a.observed_at<b.observed_at?1:-1) : [];
  app.innerHTML = `
  <header class="ws mh"><h1>Import From iSellBeer</h1>
    <p class="mh-sub">Add the exports you pulled from iSellBeer. Nothing is saved until you press Import, and importing never changes iSellBeer.</p></header>
  <section class="mcard">
    <h2>1. Add Files</h2>
    <label class="drop" id="drop"><input type="file" id="files" accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple>
      <span class="drop-t">Choose Exports or Photo PDFs</span><span class="drop-s">Display reports, tap survey (Raw Reports) reports, Promos reports (.xlsx), and Promos / report photo PDFs</span></label>
    ${st.files.length ? `<ul class="flist">${st.files.map(f=>`<li><b>${E(f.name)}</b> <span>${E(f.status)}</span></li>`).join('')}</ul>` : ''}
    ${st.err ? `<div class="kdh-state error slim"><b>${E(st.err)}</b></div>` : ''}
  </section>
  ${rec ? reconHtml(rec, matched) : ''}
  ${st.pages.length ? pagesHtml(recordOpts) : ''}
  ${rec ? recordsHtml(rec) : ''}
  ${rec ? `<section class="mcard"><h2>4. Import</h2>
    <p class="mnote">${plural(rec.records.filter(r=>!r.unknownAccount).length,'record')} will be imported${rec.totals.updatedRecords ? ` (${rec.totals.updatedRecords} already in the Hub are restated, not added again)` : ''}${rec.totals.unknownAccounts ? `; ${plural(rec.totals.unknownAccounts,'record')} on an account not in the customer base stay out until checked` : ''}. ${st.pages.length ? `${matched} of ${plural(st.pages.length,'report page')} matched; the rest go to the review queue.` : ''}</p>
    <button type="button" class="btn primary" id="doImport"${st.busy ? ' disabled aria-busy="true"' : ''}>${st.busy ? 'Importing…' : `Import ${plural(rec.records.filter(r=>!r.unknownAccount).length,'Record')}`}</button>
    ${st.result ? st.result : ''}</section>` : ''}
  <section class="mcard" id="queue"><h2>Review Queue</h2><div id="queueBody"><div class="kdh-state loading slim">Loading unresolved items…</div></div></section>`;
  wire(); loadQueue();
}
function reconHtml(rec, matched){
  const t = rec.totals;
  const tile = (n, l, s) => `<div class="mt"><b>${n}</b><span>${E(l)}</span>${s ? `<small>${E(s)}</small>` : ''}</div>`;
  return `<section class="mcard"><h2>2. Reconciliation</h2>
    <div class="mtiles">
      ${tile(t.rows, 'Source Rows', 'data rows in the exports')}
      ${tile(rec.records.length, 'Grouped Records', 'one per observation')}
      ${tile(t.lines, 'Product / Brand Lines')}
      ${tile(t.photoRefs, 'Unique Photo References', t.rowsWithoutPhoto ? t.rowsWithoutPhoto+' rows have no photo link' : 'from the Photo cells')}
      ${tile(st.pages.length ? matched+' of '+st.pages.length : '0', 'Report Pages Matched', st.pages.length ? 'matched by you, below' : 'no PDF added')}
      ${tile(t.duplicateRecords + t.duplicateRows, 'Duplicates Collapsed', t.duplicateRecords ? t.duplicateRecords+' records found in two files' : 'none')}
      ${tile(rec.unresolved.length + (st.pages.length - matched), 'Unresolved', 'listed below')}
    </div>
    <p class="mnote"><b>${plural(t.newRecords,'new record')}</b> · <b>${t.updatedRecords}</b> already in the Hub (restated from this export, never added twice).</p>
    <div class="tblwrap"><table class="mtbl"><thead><tr><th>File</th><th>Type</th><th>Period · Filters</th><th class="num">Rows</th><th class="num">Records</th><th class="num">Lines</th><th class="num">Photos</th></tr></thead><tbody>
      ${rec.files.map(f=>`<tr><td data-l="File">${E(f.file)}</td><td data-l="Type">${E(f.label)}</td><td data-l="Period">${E([f.period[0], f.period[1]].filter(Boolean).join(' – ') || '—')}${f.filters.filter(p=>!/date/i.test(p[0])).map(p=>` · ${E(p[0])}: ${E(p[1])}`).join('')}</td><td class="num" data-l="Rows">${f.rows}</td><td class="num" data-l="Records">${f.records}</td><td class="num" data-l="Lines">${f.lines}</td><td class="num" data-l="Photos">${f.photoRefs}</td></tr>`).join('')}
      ${st.pdfs.map(p=>`<tr><td data-l="File">${E(p.name)}</td><td data-l="Type">Report photo PDF</td><td data-l="Period">—</td><td class="num" data-l="Rows">—</td><td class="num" data-l="Records">—</td><td class="num" data-l="Lines">—</td><td class="num" data-l="Photos">${p.count} report pages</td></tr>`).join('')}
    </tbody></table></div>
    ${rec.unresolved.length ? `<details class="mfold" open><summary>Unresolved · ${rec.unresolved.length}</summary><ul class="ulist">${rec.unresolved.map(u=>`<li>${E(u.file)}: ${E(u.text)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}
function recLabel(R){ const a = ACCTS.get(String(R.customer_num)); const pn = (R.source_ref.promo||[]).length ? 'Promo # '+R.source_ref.promo.join(', ')+' · ' : '';
  return `${pn}${a ? a.name : R.dba || '?'} #${R.customer_num} · ${fmtWhen(R.observed_at)} · ${M.catLabel(R.category)}${R.brands.length ? ' · '+R.brands.slice(0,2).join(', ')+(R.brands.length>2 ? ' +'+(R.brands.length-2) : '') : ''}`; }
function pagesHtml(opts){
  return `<section class="mcard"><h2>3. Report Pages</h2>
    <p class="mnote">These are iSellBeer report pages: the printed frame and details around a small copy of the photo, not the original. Match a page only when its printed account, date and brand agree with a record; page order means nothing. Pages left unmatched go to the review queue.</p>
    <div class="pgrid2">${st.pages.map(p=>`<div class="pg${p.match ? ' on' : ''}"><img src="${p.url}" alt="Report page ${p.page} of ${E(p.file)}"><div class="pg-b"><p class="pg-h">${E(p.file)} · page ${p.page}</p>
      <label class="msel"><span>Match To Record</span><select data-page="${p.id}"><option value="">Leave unresolved</option>${opts.map(R=>`<option value="${E(R.source_key)}"${p.match===R.source_key?' selected':''}>${E(recLabel(R))}</option>`).join('')}</select></label></div></div>`).join('')}</div></section>`;
}
function recordsHtml(rec){
  const by = {}; rec.records.forEach(R=>{ (by[R.source_ref.file] = by[R.source_ref.file] || []).push(R); });
  return `<section class="mcard"><h2>Records to Import</h2>${Object.entries(by).map(([f, list])=>`<details class="mfold"><summary>${E(f)} · ${plural(list.length,'record')}</summary>
    <ul class="rlist">${list.map(R=>{ const a = ACCTS.get(String(R.customer_num));
      return `<li class="${R.unknownAccount ? 'bad' : ''}"><p class="rl-h"><b>${E(a ? a.name : (R.dba||'?'))}</b> #${E(R.customer_num)} · ${E(fmtWhen(R.observed_at))} · ${E(M.catLabel(R.category))}${R.subtype ? ' · '+E(M.SUB_LABEL[R.subtype]||R.subtype) : ''}</p>
      <p class="rl-s">${R.isb_promotion_type ? 'iSellBeer: '+E([R.isb_promotion_type, R.isb_theme, R.isb_elements].filter(Boolean).join(' · '))+' · ' : ''}${R.source_author ? 'Photo by '+E(R.source_author)+' · ' : ''}${plural(R.lines.length,'line')} · ${plural(R.photos.length,'photo link')}${R.unknownAccount ? ' · <b>account not in the customer base</b>' : ''}</p>
      <ul class="rl-lines">${R.lines.map(l=>`<li>${E([l.brand, l.package].filter(Boolean).join(' · '))} — ${E(M.qtyText(l.quantity, l.quantity_unit))}${l.ownership_source ? ` · iSellBeer ${E(l.ownership_source)}${l.ownership_corrected ? (l.ownership_corrected===l.ownership_source ? ' (Tap Tracker agrees)' : ` → Tap Tracker ${E(l.ownership_corrected)}`) : ' (not audited)'}` : ''}</li>`).join('')}</ul></li>`; }).join('')}</ul></details>`).join('')}</section>`;
}

async function addFiles(list){
  st.err = '';
  for(const f of list){
    const entry = {name:f.name, status:'Reading…'}; st.files.push(entry); render();
    try{
      const buf = await f.arrayBuffer();
      if(/\.pdf$/i.test(f.name) || f.type==='application/pdf'){
        const imgs = I.pdfImages(buf);
        const usable = imgs.filter(x=>x.bytes);
        usable.forEach(x=>{ const blob = new Blob([x.bytes], {type:'image/jpeg'}); st.pages.push({id:'pg'+st.pages.length, file:f.name, page:x.page, blob, url:URL.createObjectURL(blob), width:x.width, height:x.height, match:''}); });
        st.pdfs.push({name:f.name, count:usable.length});
        entry.status = `${plural(usable.length,'report page')} read${imgs.length > usable.length ? ` · ${imgs.length-usable.length} in a format this page cannot read` : ''}`;
      } else {
        const P = await I.parseWorkbook(buf, f.name);
        if(P.kind==='tap_survey'){ const T = await tapData(); const a = T ? I.applyTapAudit(P, T) : {matched:0};
          P.audit = a; }
        P.records.forEach(R=>{ const a = ACCTS.get(String(R.customer_num)); if(a) R.premise = a.prem; });
        st.parsed.push(P);
        entry.status = `${P.label} · ${plural(P.rows.length,'row')} → ${plural(P.records.length,'record')}${P.audit ? ` · ${P.audit.matched ? P.audit.matched+' survey(s) matched the Tap Tracker audit' : 'no audited Tap Tracker survey for these'}` : ''}`;
      }
    }catch(e){ entry.status = 'Could not read: '+(e.message||e); }
  }
  await recompute(); render();
}
async function recompute(){
  if(!st.parsed.length){ st.rec = null; return; }
  const keys = [...new Set(st.parsed.flatMap(P=>P.records.map(R=>R.source_key)))];
  st.existing = new Set();
  for(let i=0;i<keys.length;i+=40){
    const chunk = keys.slice(i, i+40); const q = 'merch_records?select=source_key&source_key=in.('+chunk.map(k=>'"'+k.replace(/"/g,'')+'"').join(',')+')';
    const r = await D.rest(q); if(r.ok) (r.data||[]).forEach(x=>st.existing.add(x.source_key));
    else if(r.status===404 || (r.data && r.data.code==='PGRST205')){ st.err = 'The merchandising tables are not in Supabase yet: run supabase/migrations/20261004090000_merchandising.sql first.'; break; }
  }
  st.rec = I.reconcile(st.parsed, ACCTS.size ? new Set(ACCTS.keys()) : null, st.existing, {total:st.pages.length, matched:st.pages.filter(p=>p.match).length});
}

async function doImport(){
  st.busy = true; st.result = ''; render();
  const out = []; let fail = '';
  try{
    // 1. report pages: matched ones under their record's account, the rest under _review/
    const pagePhotos = {}; const review = [];
    for(const p of st.pages){
      const sha = await D.sha256hex(p.blob);
      if(p.match){
        const R = st.rec.records.find(x=>x.source_key===p.match);
        const path = `${R.customer_num}/isb-page-${sha.slice(0,32)}.jpg`;
        await D.upload(path, p.blob);
        (pagePhotos[p.match] = pagePhotos[p.match] || []).push({storage_path:path, photo_kind:'report_page', photo_status:'stored'});
      } else {
        const path = `_review/isb-page-${sha.slice(0,32)}.jpg`;
        await D.upload(path, p.blob);
        review.push({kind:'pdf_page', storage_path:path, detail:{file:p.file, page:p.page, width:p.width, height:p.height}});
      }
    }
    // 2. one batch per export
    for(const P of st.parsed){
      const pay = I.payload(P, {pagePhotos, counts:st.rec.files.find(f=>f.file===(P.records[0]||{source_ref:{}}).source_ref.file) || null});
      pay.records.forEach(r=>{ const a = ACCTS.get(String(r.customer_num)); r.premise = a ? a.prem : null; });
      if(!pay.records.length) continue;
      const res = await D.rpc('kdh_merch_import', {p:pay});
      out.push({file:pay.batch.source_file, res});
    }
    if(review.length){ const res = await D.rpc('kdh_merch_import', {p:{batch:{source_file:st.pdfs.map(p=>p.name).join(', '), file_kind:'pdf'}, records:[], review}}); out.push({file:'Report pages', res}); }
  }catch(e){ fail = e.message || String(e); }
  st.busy = false;
  st.result = `<div class="mresult">${out.map(o=>`<p><b>${E(o.file)}</b>: ${o.res.records_new} new, ${o.res.records_updated} restated · ${o.res.lines} lines · ${o.res.photos_new} new photos (${o.res.photos_existing} already stored)${o.res.review ? ` · ${o.res.review} to review` : ''}</p>`).join('')}
    ${fail ? `<div class="kdh-state error slim"><b>Import stopped: ${E(fail)}</b><span>${out.length ? 'Files listed above were imported. ' : ''}Importing again is safe: nothing is added twice.</span></div>` : `<p class="ok">Done. Importing these files again changes nothing.</p>`}</div>`;
  queueRows = null;   // the import may have added items to the queue
  await recompute(); render();
}

/* ---------------- review queue: report pages waiting for a person ---------------- */
let queueRows = null, queueRecords = null;
async function loadQueue(){
  const body = document.getElementById('queueBody'); if(!body) return;
  if(queueRows === null){
    const r = await D.rest('merch_review?select=id,kind,storage_path,detail,created_at,resolved_at&resolved_at=is.null&order=created_at.desc&limit=200');
    if(!r.ok){ body.innerHTML = `<div class="kdh-state unavailable slim"><b>${r.off ? 'Sign in on kohlerdisthub.com to see the review queue.' : (r.status===404 ? 'Run supabase/migrations/20261004090000_merchandising.sql to turn the review queue on.' : 'The review queue could not be loaded.')}</b></div>`; return; }
    queueRows = r.data || [];
  }
  if(!queueRows.length){ body.innerHTML = `<p class="mnote">Nothing waiting. Report pages you leave unmatched during an import appear here.</p>`; return; }
  body.innerHTML = `<p class="mnote">${plural(queueRows.length,'item')} waiting. Search by account # or name, pick the record the page shows, then Attach.</p>
    <div class="pgrid2">${queueRows.map(q=>`<div class="pg" data-q="${q.id}"><img alt="Report page" data-path="${E(q.storage_path||'')}"><div class="pg-b"><p class="pg-h">${E((q.detail&&q.detail.file)||'')} · page ${E((q.detail&&q.detail.page)||'?')}</p>
      <input type="search" class="kdh-field" placeholder="Account # or name" data-qs="${q.id}"><select data-qr="${q.id}"><option value="">Choose a record</option></select>
      <button type="button" class="btn sm" data-qa="${q.id}">Attach</button></div></div>`).join('')}</div>`;
  body.querySelectorAll('img[data-path]').forEach(async img=>{ const b = img.dataset.path && await D.objectBlob(img.dataset.path); if(b) img.src = URL.createObjectURL(b); else img.alt = 'Image not available'; });
  body.querySelectorAll('[data-qs]').forEach(inp=>inp.addEventListener('input', async ()=>{
    const q = inp.value.trim(); const sel = body.querySelector(`[data-qr="${inp.dataset.qs}"]`);
    if(q.length < 2){ sel.innerHTML = '<option value="">Choose a record</option>'; return; }
    const ids = [...ACCTS.entries()].filter(([n, a])=>n===q || a.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20).map(([n])=>n);
    if(!ids.length){ sel.innerHTML = '<option value="">No account matches</option>'; return; }
    const r = await D.rest('merch_records?select=id,customer_num,category,observed_at,brands,isb_promotion_type&source=eq.isellbeer&customer_num=in.('+ids.join(',')+')&order=observed_at.desc&limit=50');
    const list = r.ok ? r.data : [];
    sel.innerHTML = `<option value="">${list.length ? 'Choose a record' : 'No imported record on that account'}</option>` + list.map(x=>`<option value="${x.id}|${E(x.customer_num)}">${E((ACCTS.get(x.customer_num)||{}).name||'')} #${E(x.customer_num)} · ${E(fmtWhen(x.observed_at))} · ${E(M.catLabel(x.category))}${x.brands&&x.brands.length ? ' · '+E(x.brands.slice(0,2).join(', ')) : ''}</option>`).join('');
  }));
  body.querySelectorAll('[data-qa]').forEach(b=>b.addEventListener('click', async ()=>{
    const id = b.dataset.qa; const sel = body.querySelector(`[data-qr="${id}"]`); if(!sel.value) return;
    const [rid, acct] = sel.value.split('|'); const q = queueRows.find(x=>x.id===id);
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try{
      const blob = await D.objectBlob(q.storage_path); if(!blob) throw new Error('the page image could not be read');
      const path = `${acct}/${q.storage_path.split('/').pop()}`;
      await D.upload(path, blob);
      await D.rpc('kdh_merch_resolve', {p_review:id, p_record:rid, p_path:path});
      queueRows = queueRows.filter(x=>x.id!==id); loadQueue();
    }catch(e){ b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = 'Retry'; b.title = e.message||String(e); }
  }));
}

function wire(){
  const f = document.getElementById('files'); f.addEventListener('change', ()=>{ const l = [...f.files]; f.value = ''; addFiles(l); });
  const drop = document.getElementById('drop');
  drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', ()=>drop.classList.remove('over'));
  drop.addEventListener('drop', e=>{ e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  app.querySelectorAll('[data-page]').forEach(s=>s.addEventListener('change', async ()=>{ const p = st.pages.find(x=>x.id===s.dataset.page); p.match = s.value; await recompute(); render(); }));
  const b = document.getElementById('doImport'); if(b) b.addEventListener('click', doImport);
}
render();
})();
