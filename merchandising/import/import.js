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

const st = {files:[], parsed:[], pdfs:[], pages:[], existing:new Set(), known:new Map(), rec:null, busy:false, result:null, err:'', prog:''};
// pages: {id, file, page, blob, url, width, height, links:[url], match:'' (source_key, by hand),
//         auto: null | {url, key, customer_num, stored, inHub}  (matched by the photo link printed on the page),
//         orphan: '' | 'not_in_hub' | 'unknown_account'  (has a link, but no record to attach it to)}
// st.known: photo link -> {customer_num, stored} for photos an EARLIER import already put in the Hub,
// so a PDF (or one part of a split PDF) can be added in a later sitting than its spreadsheet.
const pageStats = () => { const a = st.pages.filter(p=>p.auto), s0 = a.filter(p=>p.auto.stored).length;
  return {auto:a.length, stored:s0, hand:st.pages.filter(p=>!p.auto && p.match).length,
          orphan:st.pages.filter(p=>p.orphan).length, open:st.pages.filter(p=>!p.auto && !p.orphan && !p.match).length}; };

function render(){
  const P = st.parsed, rec = st.rec;
  const ps = pageStats(), matched = ps.auto + ps.hand;
  const recordOpts = rec ? rec.records.slice().sort((a,b)=>a.observed_at<b.observed_at?1:-1) : [];
  app.innerHTML = `
  <header class="ws mh"><h1>Import From iSellBeer</h1>
    <p class="mh-sub">Nothing Is Saved Until You Press Import</p></header>
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
    <p class="mnote">${plural(rec.records.filter(r=>!r.unknownAccount).length,'record')} will be imported${rec.totals.updatedRecords ? ` (${rec.totals.updatedRecords} already in the Hub are restated, not added again)` : ''}${rec.totals.unknownAccounts ? `; ${plural(rec.totals.unknownAccounts,'record')} on an account not in the customer base stay out until checked` : ''}. ${st.pages.length ? pagesSentence(ps) : ''}</p>
    ${importBtn(`Import ${plural(rec.records.filter(r=>!r.unknownAccount).length,'Record')}`)}
    ${st.result ? st.result : ''}</section>` : ''}
  ${!rec && st.pages.length ? `<section class="mcard"><h2>3. Import</h2>
    <p class="mnote">${pagesSentence(ps)}</p>
    ${importBtn(ps.auto - ps.stored ? `Attach ${plural(ps.auto - ps.stored,'Report Page')}` : 'Import Report Pages', !(ps.auto - ps.stored + ps.hand + ps.open))}
    ${st.result ? st.result : ''}</section>` : ''}
  <section class="mcard" id="queue"><h2>Review Queue</h2><div id="queueBody"><div class="kdh-state loading slim">Loading unresolved items…</div></div></section>`;
  wire(); loadQueue();
}
function importBtn(label, off){
  return `<button type="button" class="btn primary" id="doImport"${st.busy || off ? ' disabled' : ''}${st.busy ? ' aria-busy="true"' : ''}>${st.busy ? 'Importing…' : E(label)}</button>
    <p class="mnote" id="impProg" aria-live="polite">${E(st.prog)}</p>`;
}
function pagesSentence(ps){
  const bits = [];
  if(ps.auto) bits.push(`${plural(ps.auto,'report page')} matched by the iSellBeer link printed on the page${ps.stored ? ` (${ps.stored} already stored, skipped)` : ''}`);
  if(ps.hand) bits.push(`${ps.hand} matched by you`);
  if(ps.open) bits.push(`${ps.open} without a readable link go to the review queue unless you match them`);
  if(ps.orphan) bits.push(`${plural(ps.orphan,'page')} skipped: the photo is not in the Hub yet, or its account is not in the customer base -- import the spreadsheet that lists it, then add this PDF again`);
  return bits.join('; ')+'.';
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
      ${tile(st.pages.length ? matched+' of '+st.pages.length : '0', 'Report Pages Matched', st.pages.length ? 'by the link on the page, or by you' : 'no PDF added')}
      ${tile(t.duplicateRecords + t.duplicateRows, 'Duplicates Collapsed', t.duplicateRecords ? t.duplicateRecords+' records found in two files' : 'none')}
      ${tile(rec.unresolved.length + pageStats().open + pageStats().orphan, 'Unresolved', 'listed below')}
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
const PAGE_SHOW = 60;   // pages that need a person are drawn as cards; never hundreds at once
function pagesHtml(opts){
  const ps = pageStats();
  const need = st.pages.filter(p=>!p.auto && !p.orphan), orph = st.pages.filter(p=>p.orphan), auto = st.pages.filter(p=>p.auto);
  const card = p => `<div class="pg${p.match ? ' on' : ''}"><img src="${p.url}" loading="lazy" alt="Report page ${p.page} of ${E(p.file)}"><div class="pg-b"><p class="pg-h">${E(p.file)} · page ${p.page}</p>
      <label class="msel"><span>Match To Record</span><select data-page="${p.id}"><option value="">Leave unresolved</option>${opts.map(R=>`<option value="${E(R.source_key)}"${p.match===R.source_key?' selected':''}>${E(recLabel(R))}</option>`).join('')}</select></label></div></div>`;
  const autoLine = p => { const R = p.auto.key && st.rec ? st.rec.records.find(x=>x.source_key===p.auto.key) : null; const a = ACCTS.get(String(p.auto.customer_num));
    return `<li>${E(p.file)} · page ${p.page} → ${R ? E(recLabel(R)) : `${E(a ? a.name : '')} #${E(p.auto.customer_num)} (already in the Hub)`}${p.auto.stored ? ' · already stored' : ''}</li>`; };
  return `<section class="mcard"><h2>3. Report Pages</h2>
    <p class="mnote">iSellBeer prints a link to the photo on every page, and that link is the same one the export's Photo cell holds, so pages are matched to their record by the photo itself. Page order means nothing. Each matched page is stored as that photo's <b>report page</b> (the printed frame around the photo), so the record shows a picture without opening iSellBeer; it never adds a second photo.</p>
    <div class="mtiles mt3">
      <div class="mt"><b>${ps.auto}</b><span>Matched by Link</span>${ps.stored ? `<small>${ps.stored} already stored</small>` : ''}</div>
      <div class="mt"><b>${need.length}</b><span>Need You</span><small>no readable link</small></div>
      <div class="mt"><b>${orph.length}</b><span>Not in the Hub Yet</span><small>skipped</small></div>
    </div>
    ${auto.length ? `<details class="mfold"><summary>Matched by link · ${auto.length}</summary><ul class="ulist">${auto.slice(0,400).map(autoLine).join('')}${auto.length>400 ? `<li>…and ${auto.length-400} more</li>` : ''}</ul></details>` : ''}
    ${orph.length ? `<details class="mfold"><summary>Not in the Hub yet · ${orph.length}</summary><p class="mnote">These pages link to photos that are not in the exports added here or in the Hub${orph.some(p=>p.orphan==='unknown_account') ? ', or to records on an account not in the customer base' : ''}. Import the spreadsheet that lists them, then add this PDF again. Nothing is stored for them now.</p><ul class="ulist">${orph.slice(0,200).map(p=>`<li>${E(p.file)} · page ${p.page}${p.orphan==='unknown_account' ? ' · account not in the customer base' : ''}</li>`).join('')}</ul></details>` : ''}
    ${need.length ? `<h3 class="msub">Pages without a readable link</h3><p class="mnote">Match a page only when its printed account, date and brand agree with a record. Pages left unmatched go to the review queue.</p>
    <div class="pgrid2">${need.slice(0,PAGE_SHOW).map(card).join('')}</div>${need.length>PAGE_SHOW ? `<p class="mnote">Showing ${PAGE_SHOW} of ${need.length}. The rest go to the review queue on Import, where they can be matched later.</p>` : ''}` : ''}
  </section>`;
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
        if(st.pdfs.some(x=>x.name===f.name && x.size===f.size)){ entry.status = 'Already added'; continue; }
        const imgs = await I.pdfImages(buf);
        const usable = imgs.filter(x=>x.bytes);
        usable.forEach(x=>{ const blob = new Blob([x.bytes], {type:'image/jpeg'}); st.pages.push({id:'pg'+st.pages.length, file:f.name, page:x.page, blob, url:URL.createObjectURL(blob), width:x.width, height:x.height, links:x.links||[], match:'', auto:null, orphan:''}); });
        st.pdfs.push({name:f.name, size:f.size, count:usable.length});
        const linked = usable.filter(x=>(x.links||[]).some(u=>I.photoId(u))).length;
        entry.status = `${plural(usable.length,'report page')} read · ${linked} with a photo link${imgs.length > usable.length ? ` · ${imgs.length-usable.length} in a format this page cannot read` : ''}`;
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
// photo links on the pages that an earlier import already put in the Hub
async function lookupKnown(){
  const want = [...new Set(st.pages.flatMap(p=>p.links||[]))].filter(u=>!st.known.has(u));
  for(let i=0;i<want.length;i+=25){
    const chunk = want.slice(i, i+25);
    const r = await D.rest('account_photos?select=customer_num,source_url,storage_path&source_url=in.('+chunk.map(u=>'"'+encodeURIComponent(u.replace(/"/g,''))+'"').join(',')+')');
    if(!r.ok) break;
    chunk.forEach(u=>st.known.set(u, null));
    (r.data||[]).forEach(x=>st.known.set(x.source_url, {customer_num:x.customer_num, stored:!!x.storage_path}));
  }
}
function autoMatch(){
  const recs = st.rec ? st.rec.records : [];
  st.pages.forEach(p=>{
    p.auto = null; p.orphan = '';
    if(!(p.links||[]).length) return;
    const m = I.matchPage(p, recs);
    const known = (p.links||[]).map(u=>st.known.get(u)).find(Boolean);
    const knownUrl = known ? (p.links||[]).find(u=>st.known.get(u)) : null;
    if(m && !m.record.unknownAccount){ const k = st.known.get(m.url); p.auto = {url:m.url, key:m.record.source_key, customer_num:String(m.record.customer_num), stored:!!(k && k.stored)}; }
    else if(known) p.auto = {url:knownUrl, key:null, customer_num:String(known.customer_num), stored:known.stored, inHub:true};
    else if(m) p.orphan = 'unknown_account';
    else if((p.links||[]).some(u=>I.photoId(u))) p.orphan = 'not_in_hub';
    if(p.auto) p.match = '';
  });
}
async function recompute(){
  if(st.pages.length){ await lookupKnown(); }
  if(!st.parsed.length){ st.rec = null; autoMatch(); return; }
  const keys = [...new Set(st.parsed.flatMap(P=>P.records.map(R=>R.source_key)))];
  st.existing = new Set();
  for(let i=0;i<keys.length;i+=40){
    const chunk = keys.slice(i, i+40); const q = 'merch_records?select=source_key&source_key=in.('+chunk.map(k=>'"'+k.replace(/"/g,'')+'"').join(',')+')';
    const r = await D.rest(q); if(r.ok) (r.data||[]).forEach(x=>st.existing.add(x.source_key));
    else if(r.status===404 || (r.data && r.data.code==='PGRST205')){ st.err = 'The merchandising tables are not in Supabase yet: run supabase/migrations/20261004090000_merchandising.sql first.'; break; }
  }
  st.rec = I.reconcile(st.parsed, ACCTS.size ? new Set(ACCTS.keys()) : null, st.existing, {total:st.pages.length, matched:0});
  autoMatch();
  st.rec.pages = {total:st.pages.length, matched:st.pages.filter(p=>p.auto || p.match).length};
}

const RECORDS_PER_CALL = 150, ATTACH_PER_CALL = 200, UPLOADS_AT_ONCE = 4;
function progress(t){ st.prog = t; const el = document.getElementById('impProg'); if(el) el.textContent = t; }
async function pool(items, n, fn){ let i = 0; const run = async () => { while(i < items.length){ const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({length:Math.min(n, items.length)}, run)); }
async function doImport(){
  st.busy = true; st.result = ''; st.prog = ''; render();
  const out = []; let fail = ''; const att = {stored:0, already_stored:0, not_in_hub:0, wrong_account:0, skipped:0};
  try{
    // 1. pages matched BY HAND go with their record (as report pages); pages with no readable link and no match
    //    go to the review queue under _review/. Pages matched by link are attached in step 3.
    const pagePhotos = {}; const review = [];
    const hand = st.pages.filter(p=>!p.auto && !p.orphan);
    for(const [k, p] of hand.entries()){
      progress(`Uploading pages to match or review: ${k+1} of ${hand.length}`);
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
    // 2. the records, a few hundred at a time (a 900-record export is several calls; each one is safe to repeat)
    for(const P of st.parsed){
      const pay = I.payload(P, {pagePhotos, counts:st.rec.files.find(f=>f.file===(P.records[0]||{source_ref:{}}).source_ref.file) || null});
      pay.records.forEach(r=>{ const a = ACCTS.get(String(r.customer_num)); r.premise = a ? a.prem : null; });
      if(!pay.records.length) continue;
      const parts = Math.ceil(pay.records.length / RECORDS_PER_CALL); const sum = {records_new:0, records_updated:0, lines:0, photos_new:0, photos_existing:0, review:0};
      for(let k=0;k<parts;k++){
        progress(`Saving ${pay.batch.source_file}: records ${k*RECORDS_PER_CALL+1}–${Math.min((k+1)*RECORDS_PER_CALL, pay.records.length)} of ${pay.records.length}`);
        const part = Object.assign({}, pay, {records:pay.records.slice(k*RECORDS_PER_CALL, (k+1)*RECORDS_PER_CALL), review:[],
          batch:Object.assign({}, pay.batch, parts>1 ? {source_file:`${pay.batch.source_file} (part ${k+1} of ${parts})`} : {}, k ? {counts:null} : {})});
        const res = await D.rpc('kdh_merch_import', {p:part});
        Object.keys(sum).forEach(x=>sum[x] += +(res[x]||0));
      }
      out.push({file:pay.batch.source_file, res:sum});
    }
    if(review.length){ const res = await D.rpc('kdh_merch_import', {p:{batch:{source_file:st.pdfs.map(p=>p.name).join(', '), file_kind:'pdf'}, records:[], review}}); out.push({file:'Report pages', res}); }
    // 3. pages matched by their link: upload under the photo's account (name = the iSellBeer photo id, so a repeat
    //    lands on the same file), then attach to the photo row the import created. Already stored = skipped.
    const todo = st.pages.filter(p=>p.auto && !p.auto.stored); att.skipped = st.pages.filter(p=>p.auto && p.auto.stored).length;
    const items = []; let done = 0;
    await pool(todo, UPLOADS_AT_ONCE, async p=>{
      const path = `${p.auto.customer_num}/isb-${I.photoId(p.auto.url)}.jpg`;
      await D.upload(path, p.blob);
      items.push({source_url:p.auto.url, storage_path:path});
      progress(`Uploading report pages: ${++done} of ${todo.length}`);
    });
    for(let k=0;k<items.length;k+=ATTACH_PER_CALL){
      progress(`Attaching report pages: ${Math.min(k+ATTACH_PER_CALL, items.length)} of ${items.length}`);
      const res = await D.rpc('kdh_merch_attach_photos', {p:{items:items.slice(k, k+ATTACH_PER_CALL)}});
      Object.keys(res||{}).forEach(x=>att[x] = (att[x]||0) + +(res[x]||0));
    }
  }catch(e){ fail = /kdh_merch_attach_photos/.test(e.message||'') || /PGRST202/.test(e.message||'') ? 'Run supabase/migrations/20261005100000_isb_pdf_photos.sql in the Supabase SQL Editor, then press Import again (nothing is added twice).' : (e.message || String(e)); }
  st.busy = false; progress('');
  const pageLine = st.pages.some(p=>p.auto) ? `<p><b>Report pages</b>: ${att.stored} attached to their photos${att.already_stored + att.skipped ? ` · ${att.already_stored + att.skipped} already stored` : ''}${att.not_in_hub ? ` · ${att.not_in_hub} not in the Hub` : ''}${att.wrong_account ? ` · ${att.wrong_account} refused (account mismatch)` : ''}</p>` : '';
  st.result = `<div class="mresult">${out.map(o=>`<p><b>${E(o.file)}</b>: ${o.res.records_new} new, ${o.res.records_updated} restated · ${o.res.lines} lines · ${o.res.photos_new} new photos (${o.res.photos_existing} already in the Hub)${o.res.review ? ` · ${o.res.review} to review` : ''}</p>`).join('')}${pageLine}
    ${fail ? `<div class="kdh-state error slim"><b>Import stopped: ${E(fail)}</b><span>${out.length ? 'Files listed above were imported. ' : ''}Importing again is safe: nothing is added twice.</span></div>` : `<p class="ok">Done. Importing these files again changes nothing.</p>`}</div>`;
  queueRows = null;   // the import may have added items to the queue
  st.known = new Map();   // re-read what is stored now
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
