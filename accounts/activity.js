/* Account activity: notes, follow-ups and photos (2026-10-02).
   folk's notes beside the record + Outseta's activity column + Freeform's
   photo source menu.

   NOTES are rows in rep_actions -- the hub's write-back table, reused rather
   than a second notes system (migration 20261002120000): program_id
   'note:<uuid>', status 'note' (general) or 'follow' (actionable, optional
   follow_on date), 'done' once the author marks it done. rep_email /
   rep_name are stamped by the database from the token. A rep reads every
   account note on accounts assigned to them (so a note survives an account
   moving between reps) and only their own program marks; a manager reads
   all. Nothing is kept on the device: there were never device-only notes to
   migrate (the hub's marks were always in Supabase).

   PHOTOS: Add Photo -> Photo Type (Display / Window / Cooler Door for
   off-premise, Tap Handle for on-premise, from the customer base's premise;
   no type is offered when the premise is missing) -> Take Photo / Choose
   From Library -> Preview (account + type shown, optional caption, retake /
   remove) -> Save. The image is resized to 2048 px JPEG in the browser
   (which also drops the file's GPS metadata), uploaded to the private
   Storage bucket account-photos at <customer #>/<uuid>.jpg with upload
   progress, then its row is written to account_photos. "Saved" appears only
   after BOTH succeed; a failed row removes the uploaded file. Capture time
   comes from the photo's EXIF DateTimeOriginal when present, or the moment
   the in-app camera took it; otherwise it is left empty.
   Camera permission is asked only when Take Photo is tapped (getUserMedia);
   if it is refused, or the device has no camera API, the rep gets Choose
   From Library instead. Photos do NOT go to iSellBeer: no integration
   exists, and the page never says they do.

   PREVIEW (a manager viewing as a rep) is read-only: no composer, no Add
   Photo, no Mark Done, no Remove. */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cookie = n => { try{ const m = document.cookie.match(new RegExp('(?:^|;\\s*)'+n+'=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }catch(e){ return ''; } };
const BUCKET = 'account-photos';
const MAX_EDGE = 2048, JPEG_Q = 0.85;
const CATS = {display:'Display', window:'Window', cooler_door:'Cooler Door', tap_handle:'Tap Handle'};
const CAT_HELP = {display:'A floor or endcap display', window:'Window signage or a window display', cooler_door:'Cooler door clings or cooler sets', tap_handle:'The tap handles on the bar'};
const UPDATE_SQL = 'supabase/migrations/20261002120000_account_notes_photos.sql';
const fmtWhen = s => { if(!s) return ''; const d = new Date(s); if(isNaN(d)) return ''; return d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})+', '+d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'}); };
const fmtDay = s => { if(!s) return ''; const d = new Date(String(s).length===10 ? s+'T12:00:00' : s); return isNaN(d) ? '' : d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{ const r = Math.random()*16|0; return (c==='x' ? r : (r&3|8)).toString(16); }));
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); };

function cfg(){ const c = window.KDH_AUTH || {}; const t = cookie('kdh_at'); return (c.url && c.key && t) ? {url:c.url.replace(/\/$/,''), key:c.key, token:t} : null; }
async function rest(path, opts){
  const c = cfg(); if(!c) throw Object.assign(new Error('off'), {code:'off'});
  const r = await fetch(c.url+'/rest/v1/'+path, Object.assign({}, opts, {headers: Object.assign({apikey:c.key, authorization:'Bearer '+c.token, accept:'application/json'}, (opts&&opts.headers)||{})}));
  let body = null; try{ body = await r.json(); }catch(e){}
  if(!r.ok){ const err = new Error((body && (body.message || body.hint)) || ('HTTP '+r.status)); err.status = r.status; err.code = body && body.code; err.body = body; throw err; }
  return body;
}
// the database update is missing: a column / table / constraint from 20261002120000 is not there
const needsUpdate = e => !!e && (e.code==='PGRST204' || e.code==='PGRST205' || e.code==='42703' || e.code==='42P01' || (e.code==='23514' && /status_check/.test(e.message||'')) || (e.status===404 && /account_photos/.test(e.message||'')));
const denied = e => !!e && (e.status===401 || e.status===403 || e.code==='42501' || /row-level security/i.test(e.message||''));

/* ---------------- data ---------------- */
const cache = new Map();      // n -> {notes, photos, notesErr, photosErr, update}
async function load(n, force){
  if(!force && cache.has(n)) return cache.get(n);
  const out = {notes:[], photos:[], notesErr:'', photosErr:'', update:false};
  if(!cfg()){ out.notesErr = out.photosErr = 'off'; cache.set(n, out); return out; }
  const base = 'select=id,program_id,account_num,account_name,status,note,updated_at,created_at,rep_name';
  await Promise.all([
    rest('rep_actions?'+base+',follow_on&account_num=eq.'+encodeURIComponent(n)+'&order=updated_at.desc&limit=200')
      .catch(e=>{ if(needsUpdate(e)){ out.update = true; return rest('rep_actions?'+base+'&account_num=eq.'+encodeURIComponent(n)+'&order=updated_at.desc&limit=200'); } throw e; })
      .then(rows=>{ out.notes = Array.isArray(rows) ? rows : []; })
      .catch(e=>{ out.notesErr = e.message || 'error'; }),
    rest('account_photos?select=id,customer_num,category,premise,caption,storage_path,width,height,captured_at,uploaded_at,author_name&customer_num=eq.'+encodeURIComponent(n)+'&order=uploaded_at.desc&limit=200')
      .then(rows=>{ out.photos = Array.isArray(rows) ? rows.filter(r=>r && r.storage_path && r.category) : []; })
      .catch(e=>{ if(needsUpdate(e)){ out.update = true; out.photosErr = 'update'; } else out.photosErr = e.message || 'error'; }),
  ]);
  cache.set(n, out);
  return out;
}
const blobUrls = new Map();
async function photoUrl(path){
  if(blobUrls.has(path)) return blobUrls.get(path);
  const c = cfg(); if(!c) throw new Error('off');
  const p = fetch(c.url+'/storage/v1/object/authenticated/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'), {headers:{apikey:c.key, authorization:'Bearer '+c.token}})
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.blob(); }).then(b=>URL.createObjectURL(b));
  blobUrls.set(path, p); p.catch(()=>blobUrls.delete(path));
  return p;
}

/* ---------------- image handling ---------------- */
// EXIF DateTimeOriginal (0x9003) or DateTime (0x0132) from a JPEG's APP1, as an ISO string, or null
async function exifTime(file){
  try{
    if(!/jpe?g/i.test(file.type||'') && !/\.jpe?g$/i.test(file.name||'')) return null;
    const buf = new DataView(await file.slice(0, 128*1024).arrayBuffer());
    if(buf.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while(off + 4 < buf.byteLength){
      const marker = buf.getUint16(off), size = buf.getUint16(off+2);
      if(marker === 0xFFE1 && buf.getUint32(off+4) === 0x45786966){
        const t = off + 10, le = buf.getUint16(t) === 0x4949;
        const u16 = o => buf.getUint16(t+o, le), u32 = o => buf.getUint32(t+o, le);
        const readStr = (o, len) => { let s = ''; for(let i=0;i<len-1;i++) s += String.fromCharCode(buf.getUint8(t+o+i)); return s; };
        const findTag = (ifd, tag) => { const n = u16(ifd); for(let i=0;i<n;i++){ const e = ifd+2+i*12; if(u16(e)===tag) return e; } return -1; };
        const ifd0 = u32(4);
        let when = null;
        const exifPtr = findTag(ifd0, 0x8769);
        if(exifPtr >= 0){ const sub = u32(exifPtr+8); const e = findTag(sub, 0x9003); if(e >= 0) when = readStr(u32(e+8), u32(e+4)); }
        if(!when){ const e = findTag(ifd0, 0x0132); if(e >= 0) when = readStr(u32(e+8), u32(e+4)); }
        const m = when && when.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if(!m) return null;
        const d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);   // camera local time
        return isNaN(d) ? null : d.toISOString();
      }
      if((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + size;
    }
  }catch(e){}
  return null;
}
async function toJpeg(source){
  // source: File/Blob or a canvas already drawn by the camera
  let w, h, draw;
  if(source instanceof HTMLCanvasElement){ w = source.width; h = source.height; draw = (ctx, W, H)=>ctx.drawImage(source, 0, 0, W, H); }
  else {
    let bmp = null;
    try{ bmp = await createImageBitmap(source, {imageOrientation:'from-image'}); }catch(e){ bmp = null; }
    if(!bmp){
      bmp = await new Promise((res, rej)=>{ const img = new Image(); img.onload = ()=>res(img); img.onerror = ()=>rej(new Error('That file is not an image this browser can open.')); img.src = URL.createObjectURL(source); });
    }
    w = bmp.width || bmp.naturalWidth; h = bmp.height || bmp.naturalHeight; draw = (ctx, W, H)=>ctx.drawImage(bmp, 0, 0, W, H);
  }
  if(!w || !h) throw new Error('That file is not an image this browser can open.');
  const k = Math.min(1, MAX_EDGE / Math.max(w, h)); const W = Math.round(w*k), H = Math.round(h*k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  draw(cv.getContext('2d'), W, H);
  const blob = await new Promise(res=>cv.toBlob(res, 'image/jpeg', JPEG_Q));
  if(!blob) throw new Error('Could not prepare the photo.');
  return {blob, width:W, height:H, url: URL.createObjectURL(blob)};
}
function uploadWithProgress(path, blob, onProgress){
  return new Promise((resolve, reject)=>{
    const c = cfg(); if(!c){ reject(new Error('off')); return; }
    const x = new XMLHttpRequest();
    x.open('POST', c.url+'/storage/v1/object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'));
    x.setRequestHeader('apikey', c.key); x.setRequestHeader('authorization', 'Bearer '+c.token);
    x.setRequestHeader('content-type', 'image/jpeg'); x.setRequestHeader('x-upsert', 'false'); x.setRequestHeader('cache-control', 'max-age=3600');
    x.upload.onprogress = e=>{ if(e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = ()=>{ if(x.status >= 200 && x.status < 300) resolve(); else { let m = ''; try{ m = JSON.parse(x.responseText).message || ''; }catch(e){} const err = new Error(m || ('HTTP '+x.status)); err.status = x.status; reject(err); } };
    x.onerror = ()=>reject(new Error('The connection dropped while uploading.'));
    x.ontimeout = ()=>reject(new Error('The upload took too long.'));
    x.timeout = 120000;
    x.send(blob);
  });
}
async function removeObject(path){ const c = cfg(); if(!c) return; try{ await fetch(c.url+'/storage/v1/object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'), {method:'DELETE', headers:{apikey:c.key, authorization:'Bearer '+c.token}}); }catch(e){} }

/* ---------------- the account's activity UI ---------------- */
let ctx = null;              // {n, name, prem, rep, me, readOnly, readOnlyWhy, isMgr, onChange, openAsk, hubLink, progName}
const ICON = {
  note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z"/></svg>',
  follow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
  done:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  photo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  prog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  ask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  library:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
};

function quickHtml(){
  const off = !cfg();
  const ro = ctx.readOnly || off;
  const why = off ? 'Notes and photos need a sign-in on kohlerdisthub.com' : ctx.readOnlyWhy;
  return `<div class="qacts" role="group" aria-label="Account actions">
    <button type="button" class="qa" data-qa="note"${ro?' disabled':''}${ro?` title="${E(why)}"`:''}>${ICON.note}<span>Add Note</span></button>
    <button type="button" class="qa" data-qa="photo"${ro?' disabled':''}${ro?` title="${E(why)}"`:''}>${ICON.photo}<span>Add Photo</span></button>
    <button type="button" class="qa" data-qa="ask">${ICON.ask}<span>Ask About This Account</span></button>
  </div>${ro && !off ? `<p class="qa-ro">${E(why)}</p>` : ''}`;
}
const isMine = r => !!(ctx.me && r && (r.rep_name||'').toLowerCase() === String(ctx.me.name||'').toLowerCase());
function items(st){
  const out = [];
  st.notes.forEach(r=>{
    const isNote = /^note:/.test(r.program_id||'');
    out.push({t: r.updated_at || r.created_at, kind: isNote ? (r.status==='follow' ? 'follow' : r.status==='done' ? 'done' : 'note') : 'prog', r});
  });
  st.photos.forEach(p=>out.push({t: p.uploaded_at, kind:'photo', p}));
  out.sort((a,b)=> String(b.t).localeCompare(String(a.t)));
  return out;
}
function itemHtml(it){
  if(it.kind==='photo'){
    const p = it.p;
    return `<li class="act k-photo"><span class="act-ic">${ICON.photo}</span><div class="act-b">
      <p class="act-h"><b>Photo · ${E(CATS[p.category]||p.category)}</b></p>
      ${p.caption ? `<p class="act-t">${E(p.caption)}</p>` : ''}
      <button type="button" class="act-thumb" data-photo="${E(p.id)}" aria-label="Open the ${E(CATS[p.category]||'')} photo"><img alt="" data-src="${E(p.storage_path)}"></button>
      <p class="act-m">${E(p.author_name||'')} · ${E(fmtWhen(p.uploaded_at))}${p.captured_at ? ` · taken ${E(fmtWhen(p.captured_at))}` : ''}</p></div></li>`;
  }
  const r = it.r;
  if(it.kind==='prog'){
    const L = {follow:'Follow Up', done:'Done', skip:'Not Now'}[r.status] || r.status;
    return `<li class="act k-prog"><span class="act-ic">${ICON.prog}</span><div class="act-b">
      <p class="act-h"><b>Program Mark · ${E(L)}</b> <span class="act-p">${E(ctx.progName(r.program_id))}</span></p>
      ${r.note ? `<p class="act-t">${E(r.note)}</p>` : ''}
      <p class="act-m">${E(r.rep_name||'')} · ${E(fmtWhen(r.updated_at))} · <a href="${E(ctx.hubLink(r))}">Open in the Incentive Hub</a></p></div></li>`;
  }
  const due = r.follow_on ? fmtDay(r.follow_on) : '';
  const overdue = it.kind==='follow' && r.follow_on && r.follow_on < todayIso();
  const head = it.kind==='follow' ? `<b>Follow-Up</b>${due ? ` <span class="act-due${overdue?' late':''}">${overdue ? 'Overdue · was due ' : 'Due '}${E(due)}</span>` : ' <span class="act-due">No date</span>'}`
    : it.kind==='done' ? `<b>Follow-Up · Done</b>${due ? ` <span class="act-p">was due ${E(due)}</span>` : ''}` : `<b>Note</b>`;
  const canDone = it.kind==='follow' && isMine(r) && !ctx.readOnly;
  return `<li class="act k-${it.kind}"><span class="act-ic">${ICON[it.kind==='done'?'done':it.kind]}</span><div class="act-b">
    <p class="act-h">${head}</p>
    ${r.note ? `<p class="act-t">${E(r.note)}</p>` : ''}
    <p class="act-m">${E(r.rep_name||'')} · ${E(fmtWhen(r.created_at || r.updated_at))}${r.status==='done' && r.updated_at !== r.created_at ? ` · done ${E(fmtWhen(r.updated_at))}` : ''}</p>
    ${canDone ? `<button type="button" class="btn outline sm" data-done="${E(r.id)}">Mark Done</button>` : ''}</div></li>`;
}
function stateNote(st){
  if(st.notesErr==='off') return `<div class="kdh-state unavailable slim"><b>Notes and photos need a sign-in on kohlerdisthub.com.</b></div>`;
  if(st.update) return `<div class="kdh-state unavailable slim"><b>Account notes and photos need a one-time database update.</b><span>Run ${E(UPDATE_SQL)} and then supabase/seed/account_assignments.sql in the Supabase SQL Editor. Program marks below still show.</span></div>`;
  if(st.notesErr) return `<div class="kdh-state error slim"><b>Couldn’t load this account’s notes.</b><span>${E(st.notesErr)}</span></div>`;
  return '';
}
function composerHtml(){
  if(ctx.readOnly || !cfg()) return '';
  return `<form class="ncomp" id="ncomp" novalidate>
    <label class="sr" for="ntext">Note</label>
    <textarea id="ntext" rows="2" maxlength="2000" placeholder="Write a note about ${E(ctx.name)}…"></textarea>
    <div class="ncomp-x" hidden>
      <div class="ncomp-row">
        <label class="nfu"><input type="checkbox" id="nfollow"> Follow up</label>
        <label class="ndate" hidden>By <input type="date" id="ndate" min="${todayIso()}"></label>
      </div>
      <p class="ncomp-msg" id="nmsg" role="status" hidden></p>
      <div class="ncomp-b"><button type="button" class="btn" id="ncancel">Cancel</button><button type="submit" class="btn primary" id="nsave">Save Note</button></div>
    </div>
  </form>`;
}
function feedHtml(st, limit){
  const all = items(st);
  const list = limit ? all.slice(0, limit) : all;
  const empty = !all.length ? `<p class="act-empty">${ctx.readOnly ? 'No notes or photos on this account yet.' : 'No notes or photos yet. Notes save to this account for everyone on its route and for managers.'}</p>` : '';
  return `${stateNote(st)}${empty}<ul class="acts">${list.map(itemHtml).join('')}</ul>${limit && all.length > limit ? `<a class="btn outline wide" href="#" data-go="more:notes">View All Activity · ${all.length}</a>` : ''}`;
}
function photosHtml(st, limit){
  if(st.photosErr==='off') return `<p class="act-empty">Photos need a sign-in on kohlerdisthub.com.</p>`;
  if(st.photosErr==='update') return `<div class="kdh-state unavailable slim"><b>Photos need a one-time database update.</b><span>Run ${E(UPDATE_SQL)} in the Supabase SQL Editor.</span></div>`;
  if(st.photosErr) return `<div class="kdh-state error slim"><b>Couldn’t load photos.</b><span>${E(st.photosErr)}</span></div>`;
  const list = limit ? st.photos.slice(0, limit) : st.photos;
  if(!st.photos.length) return `<p class="act-empty">No photos yet.${ctx.readOnly ? '' : ' Use Add Photo to save a display, window, cooler door or tap handle.'}</p>`;
  return `<div class="pgrid">${list.map(p=>`<button type="button" class="pcell" data-photo="${E(p.id)}"><img alt="${E(CATS[p.category]||p.category)} photo${p.caption ? ': '+E(p.caption) : ''}" data-src="${E(p.storage_path)}"><span class="pcap"><b>${E(CATS[p.category]||p.category)}</b><span>${E(fmtDay(p.uploaded_at))}</span></span></button>`).join('')}</div>
    ${limit && st.photos.length > limit ? `<a class="btn outline wide" href="#" data-go="more:photos">View All Photos · ${st.photos.length}</a>` : ''}`;
}
function hydrateImages(root){
  root.querySelectorAll('img[data-src]').forEach(img=>{
    const path = img.dataset.src; img.removeAttribute('data-src');
    photoUrl(path).then(u=>{ img.src = u; }).catch(()=>{ img.closest('button') && img.closest('button').classList.add('pmissing'); img.alt = 'Photo could not load'; });
  });
}

async function attach(c){
  ctx = c;
  const st = await load(ctx.n);
  paint(st);
}
function paint(st){
  const q = document.getElementById('actQuick'); if(q){ q.innerHTML = quickHtml(); wireQuick(q); }
  const f = document.getElementById('actFeed'); if(f){ f.innerHTML = composerHtml() + feedHtml(st, 5); wireFeed(f, st); }
  const all = document.getElementById('actAll'); if(all){ all.innerHTML = composerHtml() + feedHtml(st, 0); wireFeed(all, st); }
  const ps = document.getElementById('actPhotos'); if(ps){ ps.innerHTML = photosHtml(st, 4); wirePhotos(ps, st); }
  const pa = document.getElementById('actPhotosAll'); if(pa){ pa.innerHTML = (ctx.readOnly || !cfg() ? '' : `<button type="button" class="btn primary" data-qa="photo">${ICON.photo} Add Photo</button>`) + photosHtml(st, 0); wireQuick(pa); wirePhotos(pa, st); }
}
function wireQuick(root){
  root.querySelectorAll('[data-qa]').forEach(b=>b.addEventListener('click', ()=>{
    if(b.disabled) return;
    if(b.dataset.qa==='note') openComposer();
    else if(b.dataset.qa==='photo') photoFlow();
    else if(b.dataset.qa==='ask' && ctx.openAsk) ctx.openAsk();
  }));
}
function openComposer(){
  let form = document.querySelector('.secbody:not([hidden]) #ncomp') || document.getElementById('ncomp');
  if(!form){ if(ctx.showOverview) ctx.showOverview(); form = document.getElementById('ncomp'); }
  if(!form) return;
  form.scrollIntoView({block:'center', behavior:'smooth'});
  const ta = form.querySelector('textarea'); ta.focus(); expand(form);
}
function expand(form){ form.querySelector('.ncomp-x').hidden = false; form.classList.add('open'); }
function wireFeed(root, st){
  hydrateImages(root);
  root.querySelectorAll('[data-photo]').forEach(b=>b.addEventListener('click', ()=>viewer(st, b.dataset.photo)));
  root.querySelectorAll('[data-done]').forEach(b=>b.addEventListener('click', async ()=>{
    b.disabled = true; b.textContent = 'Saving…';
    try{ await rest('rep_actions?id=eq.'+encodeURIComponent(b.dataset.done), {method:'PATCH', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify({status:'done'})});
      const s2 = await load(ctx.n, true); paint(s2); if(ctx.onChange) ctx.onChange(s2);
    }catch(e){ b.disabled = false; b.textContent = 'Mark Done'; toast(denied(e) ? 'Only the person who wrote a follow-up can mark it done.' : 'Could not save: '+(e.message||'error')); }
  }));
  const form = root.querySelector('#ncomp'); if(!form) return;
  const ta = form.querySelector('#ntext'), fu = form.querySelector('#nfollow'), dl = form.querySelector('.ndate'), msg = form.querySelector('#nmsg');
  ta.addEventListener('focus', ()=>expand(form));
  ta.addEventListener('input', ()=>{ ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight)+'px'; });
  fu.addEventListener('change', ()=>{ dl.hidden = !fu.checked; form.querySelector('#nsave').textContent = fu.checked ? 'Save Follow-Up' : 'Save Note'; });
  form.querySelector('#ncancel').addEventListener('click', ()=>{ ta.value = ''; fu.checked = false; dl.hidden = true; msg.hidden = true; form.querySelector('.ncomp-x').hidden = true; form.classList.remove('open'); ta.style.height = ''; });
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const text = ta.value.trim(); const follow = fu.checked; const date = form.querySelector('#ndate').value || null;
    if(!text){ msg.hidden = false; msg.className = 'ncomp-msg err'; msg.textContent = 'Write the note first.'; ta.focus(); return; }
    if(date && date < todayIso()){ msg.hidden = false; msg.className = 'ncomp-msg err'; msg.textContent = 'Pick today or a later date.'; return; }
    const save = form.querySelector('#nsave'); save.disabled = true; save.textContent = 'Saving…'; msg.hidden = true;
    try{
      const row = {program_id:'note:'+uuid(), account_num:String(ctx.n), account_name:ctx.name, status: follow ? 'follow' : 'note', note:text};
      if(follow && date) row.follow_on = date;
      await rest('rep_actions', {method:'POST', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify(row)});
      const s2 = await load(ctx.n, true); paint(s2); if(ctx.onChange) ctx.onChange(s2);
      toast(follow ? 'Follow-up saved' : 'Note saved');
    }catch(err){
      save.disabled = false; save.textContent = follow ? 'Save Follow-Up' : 'Save Note';
      msg.hidden = false; msg.className = 'ncomp-msg err';
      msg.textContent = needsUpdate(err) ? 'Saving notes needs the one-time database update ('+UPDATE_SQL+'). Your text is still here.'
        : denied(err) ? 'This account is not on your route in the notes system yet (the account list in Supabase may need its refresh). Your text is still here.'
        : 'Not saved — '+(err.message||'something went wrong')+'. Your text is still here; try again.';
    }
  });
}
function wirePhotos(root, st){
  hydrateImages(root);
  root.querySelectorAll('[data-photo]').forEach(b=>b.addEventListener('click', ()=>viewer(st, b.dataset.photo)));
}
function toast(t){
  let el = document.getElementById('actToast');
  if(!el){ el = document.createElement('div'); el.id = 'actToast'; el.className = 'act-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(()=>el.classList.remove('on'), 3200);
}

/* ---------------- sheet (bottom sheet on phones, dialog on desktop) ---------------- */
function sheet(title, body, onClose){
  closeSheet();
  const wrap = document.createElement('div'); wrap.className = 'asheet-wrap'; wrap.id = 'asheet';
  wrap.innerHTML = `<div class="asheet" role="dialog" aria-modal="true" aria-labelledby="asheetT"><div class="asheet-h"><h2 id="asheetT">${title}</h2><button type="button" class="asheet-x" aria-label="Close">&times;</button></div><div class="asheet-b">${body}</div></div>`;
  document.body.appendChild(wrap);
  document.documentElement.classList.add('asheet-open');
  const close = ()=>{ closeSheet(); if(onClose) onClose(); };
  wrap.querySelector('.asheet-x').addEventListener('click', close);
  wrap.addEventListener('click', e=>{ if(e.target===wrap) close(); });
  wrap._esc = e=>{ if(e.key==='Escape') close(); }; document.addEventListener('keydown', wrap._esc);
  setTimeout(()=>{ const f = wrap.querySelector('[data-first]') || wrap.querySelector('button, input, textarea'); if(f) f.focus(); }, 30);
  return wrap;
}
function closeSheet(){ const w = document.getElementById('asheet'); if(w){ document.removeEventListener('keydown', w._esc); if(w._stop) w._stop(); w.remove(); } document.documentElement.classList.remove('asheet-open'); }

function viewer(st, id){
  const p = st.photos.find(x=>x.id===id); if(!p) return;
  const mine = (p.author_name||'').toLowerCase() === String((ctx.me||{}).name||'').toLowerCase();
  const w = sheet(`${E(CATS[p.category]||p.category)} · ${E(ctx.name)}`, `<div class="pview"><img alt="${E(CATS[p.category]||'')} photo" data-src="${E(p.storage_path)}"></div>
    ${p.caption ? `<p class="pv-cap">${E(p.caption)}</p>` : ''}
    <dl class="pv-meta"><dt>Account</dt><dd>${E(ctx.name)} · #${E(ctx.n)}</dd><dt>Type</dt><dd>${E(CATS[p.category]||p.category)}</dd><dt>Added by</dt><dd>${E(p.author_name||'—')}</dd><dt>Uploaded</dt><dd>${E(fmtWhen(p.uploaded_at))}</dd><dt>Taken</dt><dd>${p.captured_at ? E(fmtWhen(p.captured_at)) : 'Not recorded in the file'}</dd></dl>
    ${mine && !ctx.readOnly ? `<div class="sheet-b"><button type="button" class="btn outline danger" id="pvDel">Remove Photo</button></div>` : ''}`);
  hydrateImages(w);
  const del = w.querySelector('#pvDel');
  if(del) del.addEventListener('click', async ()=>{
    if(!confirm('Remove this photo from the account? This cannot be undone.')) return;
    del.disabled = true; del.textContent = 'Removing…';
    try{ await rest('account_photos?id=eq.'+encodeURIComponent(p.id), {method:'DELETE', headers:{prefer:'return=representation'}}); await removeObject(p.storage_path);
      closeSheet(); const s2 = await load(ctx.n, true); paint(s2); toast('Photo removed'); }
    catch(e){ del.disabled = false; del.textContent = 'Remove Photo'; toast('Could not remove it: '+(e.message||'error')); }
  });
}

/* ---------------- Add Photo: type -> source -> preview -> save ---------------- */
function photoTypes(){
  if(ctx.prem==='Off') return ['display', 'window', 'cooler_door'];
  if(ctx.prem==='On') return ['tap_handle'];
  return [];
}
function photoFlow(){
  if(ctx.readOnly || !cfg()) return;
  const types = photoTypes();
  const head = `<p class="pf-acct"><b>${E(ctx.name)}</b> · #${E(ctx.n)}${ctx.prem ? ' · '+(ctx.prem==='On' ? 'On-premise' : 'Off-premise') : ''}</p>`;
  if(!types.length){
    sheet('Add Photo', head + `<div class="kdh-state unavailable slim"><b>We can’t tell whether this account is on- or off-premise.</b><span>The customer base has no premise for it, so we can’t offer the right photo types. Ask Gavin to check the account’s premise in Encompass.</span></div>`);
    return;
  }
  if(types.length===1) return chooseSource(types[0]);
  const w = sheet('Add Photo', head + `<p class="pf-step">Choose the photo type</p><div class="pf-list">${types.map((t,i)=>`<button type="button" class="pf-opt" data-type="${t}"${i===0?' data-first':''}><b>${E(CATS[t])}</b><span>${E(CAT_HELP[t])}</span></button>`).join('')}</div>`);
  w.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click', ()=>chooseSource(b.dataset.type)));
}
function chooseSource(type, note){
  const w = sheet('Add Photo', `<p class="pf-acct"><b>${E(ctx.name)}</b> · ${E(CATS[type])}</p>
    ${note ? `<div class="kdh-state unavailable slim">${note}</div>` : ''}
    <div class="pf-list">
      <button type="button" class="pf-opt src" data-src="camera" data-first>${ICON.photo}<span><b>Take Photo</b><span>Use the camera now</span></span></button>
      <button type="button" class="pf-opt src" data-src="library">${ICON.library}<span><b>Choose From Library</b><span>Pick a photo already on this device</span></span></button>
    </div>
    ${photoTypes().length > 1 ? `<button type="button" class="btn" id="pfBack">‹ Photo Type</button>` : ''}
    <input type="file" accept="image/*" id="pfFile" hidden>
    <input type="file" accept="image/*" capture="environment" id="pfCap" hidden>`);
  const back = w.querySelector('#pfBack'); if(back) back.addEventListener('click', photoFlow);
  const fileIn = w.querySelector('#pfFile'), capIn = w.querySelector('#pfCap');
  const takeFile = async (inp, fromCamera)=>{ const f = inp.files && inp.files[0]; if(!f) return; preview(type, {file:f, capturedAt: (await exifTime(f)) || (fromCamera ? new Date().toISOString() : null)}); };
  fileIn.addEventListener('change', ()=>takeFile(fileIn, false));
  capIn.addEventListener('change', ()=>takeFile(capIn, true));
  w.querySelector('[data-src="library"]').addEventListener('click', ()=>fileIn.click());
  w.querySelector('[data-src="camera"]').addEventListener('click', ()=>{
    if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext) camera(type);
    else capIn.click();            // no in-page camera API: the device's own camera picker
  });
}
async function camera(type){
  const w = sheet(`Take Photo · ${E(CATS[type])}`, `<div class="cam"><video playsinline muted autoplay></video><div class="cam-msg" role="status">Asking for the camera…</div></div>
    <div class="sheet-b"><button type="button" class="btn" id="camCancel">Cancel</button><button type="button" class="btn primary" id="camShot" disabled data-first>Take Photo</button></div>`);
  const video = w.querySelector('video'), msg = w.querySelector('.cam-msg');
  let stream = null;
  w._stop = ()=>{ if(stream) stream.getTracks().forEach(t=>t.stop()); stream = null; };
  w.querySelector('#camCancel').addEventListener('click', ()=>{ closeSheet(); chooseSource(type); });
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:2048}}, audio:false});
  }catch(e){
    closeSheet();
    const deniedCam = e && (e.name==='NotAllowedError' || e.name==='SecurityError');
    chooseSource(type, deniedCam ? `<b>Camera access is off for this site.</b><span>Choose From Library instead — or allow the camera for kohlerdisthub.com in your browser’s settings and try again.</span>`
      : `<b>No camera is available here.</b><span>Choose From Library instead.</span>`);
    return;
  }
  if(!document.getElementById('asheet')){ if(stream) stream.getTracks().forEach(t=>t.stop()); return; }
  video.srcObject = stream; msg.textContent = ''; msg.hidden = true;
  const shot = w.querySelector('#camShot'); shot.disabled = false;
  shot.addEventListener('click', ()=>{
    const cv = document.createElement('canvas'); cv.width = video.videoWidth; cv.height = video.videoHeight;
    if(!cv.width){ return; }
    cv.getContext('2d').drawImage(video, 0, 0);
    const when = new Date().toISOString();
    w._stop(); closeSheet();
    preview(type, {canvas:cv, capturedAt:when, fromCamera:true});
  });
}
async function preview(type, src, caption){
  let img;
  const w = sheet(`Preview · ${E(CATS[type])}`, `<div class="kdh-state loading slim">Preparing the photo…</div>`);
  try{ img = await toJpeg(src.canvas || src.file); }
  catch(e){ closeSheet(); chooseSource(type, `<b>${E(e.message || 'That photo could not be opened.')}</b><span>Try another photo.</span>`); return; }
  w.querySelector('.asheet-b').innerHTML = `
    <p class="pf-acct"><b>${E(ctx.name)}</b> · #${E(ctx.n)} · <b>${E(CATS[type])}</b></p>
    <div class="pview"><img src="${img.url}" alt="Preview of the ${E(CATS[type])} photo"></div>
    <p class="pf-time">${src.capturedAt ? 'Taken '+E(fmtWhen(src.capturedAt)) : 'No capture time in this file — the upload time will be recorded.'}</p>
    <label class="pf-cap" for="pfCaption">Caption <span>(optional)</span></label>
    <input type="text" id="pfCaption" maxlength="500" placeholder="What does this photo show?" value="${E(caption||'')}">
    <div class="pf-prog" hidden><div class="pf-bar"><i></i></div><p class="pf-st" role="status"></p></div>
    <div class="sheet-b pf-actions">
      <button type="button" class="btn" id="pfRetake">${src.fromCamera ? 'Retake' : 'Choose Another'}</button>
      <button type="button" class="btn outline" id="pfRemove">Remove</button>
      <button type="button" class="btn primary" id="pfSave" data-first>Save Photo</button>
    </div>`;
  const discard = ()=>{ try{ URL.revokeObjectURL(img.url); }catch(e){} };
  w.querySelector('#pfRetake').addEventListener('click', ()=>{ discard(); closeSheet(); if(src.fromCamera) camera(type); else chooseSource(type); });
  w.querySelector('#pfRemove').addEventListener('click', ()=>{ discard(); closeSheet(); chooseSource(type); });
  w.querySelector('#pfSave').addEventListener('click', ()=>save(w, type, img, src, w.querySelector('#pfCaption').value));
}
async function save(w, type, img, src, caption){
  const prog = w.querySelector('.pf-prog'), bar = w.querySelector('.pf-bar i'), stx = w.querySelector('.pf-st');
  const btns = w.querySelectorAll('.pf-actions button'); btns.forEach(b=>b.disabled = true);
  prog.hidden = false; prog.classList.remove('err'); bar.style.width = '0%'; stx.textContent = 'Uploading… 0%';
  const path = String(ctx.n)+'/'+uuid()+'.jpg';
  try{
    await uploadWithProgress(path, img.blob, f=>{ const pct = Math.round(f*100); bar.style.width = pct+'%'; stx.textContent = 'Uploading… '+pct+'%'; });
    stx.textContent = 'Saving to the account…';
    try{
      await rest('account_photos', {method:'POST', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify({customer_num:String(ctx.n), category:type, premise:ctx.prem||null, caption: caption.trim()||null, storage_path:path, width:img.width, height:img.height, captured_at:src.capturedAt||null, author_email:'-'})});
    }catch(e){ await removeObject(path); throw e; }
    bar.style.width = '100%'; stx.textContent = 'Saved';
    try{ URL.revokeObjectURL(img.url); }catch(e){}
    const s2 = await load(ctx.n, true); paint(s2);
    setTimeout(()=>{ closeSheet(); toast(`${CATS[type]} photo saved to ${ctx.name}`); }, 500);
  }catch(e){
    prog.classList.add('err');
    stx.innerHTML = `<b>Not saved.</b> ${E(needsUpdate(e) ? 'Photos need the one-time database update ('+UPDATE_SQL+').' : denied(e) ? 'This account is not on your route in the photo system yet (the account list in Supabase may need its refresh).' : (e.message||'Something went wrong.'))} The photo is still here.`;
    btns.forEach(b=>b.disabled = false);
    w.querySelector('#pfSave').textContent = 'Retry';
  }
}

window.KdhActivity = {attach, load, openComposer, photoFlow, _exifTime: exifTime, _cats: CATS};
})();
