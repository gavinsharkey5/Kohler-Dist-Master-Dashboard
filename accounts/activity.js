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
   From Library -> Preview (account + type, optional caption, optional brand /
   program) -> Save. The image is resized to 2048 px JPEG in the browser
   (which also drops the file's GPS metadata), uploaded to the private
   Storage bucket account-photos at <customer #>/<uuid>.jpg with progress,
   then its row is written to account_photos. "Saved" appears only after
   BOTH succeed. Capture time comes from EXIF DateTimeOriginal, or the moment
   the in-app camera took it; otherwise it is left empty (upload time shown).
   Camera permission is asked only when Take Photo is tapped (getUserMedia);
   if it is refused, or the device has no camera API, the rep gets Choose
   From Library instead. Photos do NOT go to iSellBeer: no integration
   exists, and the page never says they do.

   DRAFTS + RECOVERY (2026-10-03): see the DRAFTS block below -- an unsaved
   note or photo is kept on the device for its author and account, labelled
   truthfully, and retried with the same identifiers (no duplicates).
   ACTIVITY: notes, follow-ups (+ "marked done"), program marks, photos, tap
   surveys and monthly purchase activity as one dated timeline with type
   filters, search and Load Older -- none of it claims a visit.
   PHOTOS VIEW: category chips (the premise's types first, Uncategorized
   when any photo has no type), caption search, date / author / brand
   filters, an even grid, and a detail sheet with every label.

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
const PHOTO_COLS = 'id,customer_num,category,premise,caption,storage_path,width,height,captured_at,uploaded_at,author_name';
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
    // brand / program_id arrive with 20261003090000_photo_labels.sql; before it, ask without them
    rest('account_photos?select='+PHOTO_COLS+',brand,program_id&customer_num=eq.'+encodeURIComponent(n)+'&order=uploaded_at.desc&limit=500')
      .catch(e=>{ if(colMissing(e)){ return rest('account_photos?select='+PHOTO_COLS+'&customer_num=eq.'+encodeURIComponent(n)+'&order=uploaded_at.desc&limit=500'); } throw e; })
      .then(rows=>{ out.photos = Array.isArray(rows) ? rows.filter(r=>r && r.storage_path) : []; })
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

/* ---------------- drafts: kept on THIS device, for THIS person and account ----------------
   Notes: localStorage `kdh_draft:v1:<owner>:<customer #>:note` (one per account).
   Photos: IndexedDB `kdh-drafts` / store `photos` (the resized JPEG + labels).
   <owner> is a hash of the SIGNED-IN email (the kdh_user cookie, never the
   preview), so on a shared device another person's drafts are never listed,
   and "Switch account" on /login/ removes every draft on the device.
   A draft is only ever labelled with what is true: Draft — Saved on This
   Device / Pending Upload / Uploading / Saved / Upload Failed — Retry.
   Retrying re-sends the SAME identifiers (note program_id, photo storage
   path), and the database's unique keys turn a second copy into "already
   saved" -- so a retry can never create a duplicate record. Nothing uploads
   in the background: a pending item waits for the rep's Retry. */
const DSTATE = {draft:'Draft — Saved on This Device', pending:'Pending Upload', uploading:'Uploading', saved:'Saved', failed:'Upload Failed — Retry', local:'Not Saved on This Device'};
const fnv = s => { let h = 0x811c9dc5; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
function ownerId(){ try{ const raw = cookie('kdh_user'); const u = raw ? JSON.parse(raw) : null; const e = u && u.email ? String(u.email).toLowerCase() : ''; return e ? fnv(e) : ''; }catch(e){ return ''; } }
const lsGet = k => { try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } };
const lsSet = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } };
const lsDel = k => { try{ localStorage.removeItem(k); }catch(e){} };
const noteKey = () => 'kdh_draft:v1:'+ownerId()+':'+ctx.n+':note';
const IDB = {
  db: null,
  open(){
    if(this.db) return this.db;
    this.db = new Promise((res)=>{
      try{
        if(!window.indexedDB) return res(null);
        const rq = indexedDB.open('kdh-drafts', 1);
        rq.onupgradeneeded = ()=>{ const d = rq.result; if(!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', {keyPath:'id'}); };
        rq.onsuccess = ()=>res(rq.result); rq.onerror = ()=>res(null); rq.onblocked = ()=>res(null);
      }catch(e){ res(null); }
    });
    return this.db;
  },
  async tx(mode, fn){ const d = await this.open(); if(!d) return null; return new Promise(res=>{ try{ const t = d.transaction('photos', mode); const s = t.objectStore('photos'); const out = fn(s); t.oncomplete = ()=>res(out && 'result' in out ? out.result : true); t.onerror = ()=>res(null); t.onabort = ()=>res(null); }catch(e){ res(null); } }); },
  put(rec){ return this.tx('readwrite', s=>s.put(rec)); },
  del(id){ return this.tx('readwrite', s=>s.delete(id)); },
  async list(owner, n){ const all = await this.tx('readonly', s=>s.getAll()); return (all||[]).filter(r=>r.owner===owner && String(r.n)===String(n)).sort((a,b)=>a.at-b.at); },
};
let photoDrafts = [];          // this person's unsaved photos for the open account
async function refreshDrafts(){ photoDrafts = ctx && !ctx.readOnly ? await IDB.list(ownerId(), ctx.n) : []; }
// sign-in still valid, and still the person who owns the draft: renew the token first
async function authCheck(owner){
  if(window.kdhFreshToken){ try{ await window.kdhFreshToken(); }catch(e){} }
  if(!cfg()) return 'Your sign-in has ended. Sign in again, then tap Retry — the draft stays on this device.';
  if(owner && owner !== ownerId()) return 'This draft belongs to someone else who used this device.';
  return '';
}
const isDup = e => !!e && (e.code==='23505' || e.status===409 || /duplicate|already exists/i.test(e.message||''));
const colMissing = e => !!e && (e.code==='PGRST204' || e.code==='42703' || /column .* does not exist|could not find the .* column/i.test(e.message||''));

/* ---------------- the account's activity UI ---------------- */
let ctx = null;              // {n, name, prem, rep, me, readOnly, readOnlyWhy, isMgr, onChange, openAsk, hubLink, progName, extra:{taps, purchases, opps}}
const ICON = {
  note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z"/></svg>',
  follow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
  done:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  photo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  mark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  tap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.7 6.5 9a6.5 6.5 0 1 0 11 0z"/></svg>',
  buy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.2a1 1 0 0 0 1-.8L20 8H7"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>',
  ask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  library:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
};
ICON.prog = ICON.mark;
const catName = c => c ? (CATS[c] || c) : 'Uncategorized';

function quickHtml(){
  const off = !cfg();
  const ro = ctx.readOnly || off;
  const why = off ? 'Notes and photos need a sign-in on kohlerdisthub.com' : ctx.readOnlyWhy;
  return `<div class="qacts" role="group" aria-label="Account actions">
    <button type="button" class="btn qa" data-qa="note"${ro?' disabled':''}${ro?` title="${E(why)}"`:''}>${ICON.note}<span>Add Note</span></button>
    <button type="button" class="btn qa" data-qa="photo"${ro?' disabled':''}${ro?` title="${E(why)}"`:''}>${ICON.photo}<span>Add Photo</span></button>
    <button type="button" class="btn qa" data-qa="ask">${ICON.ask}<span>Ask About This Account</span></button>
  </div>${ro && !off ? `<p class="qa-ro">${E(why)}</p>` : ''}`;
}
const isMine = r => !!(ctx.me && r && (r.rep_name||'').toLowerCase() === String(ctx.me.name||'').toLowerCase());

/* ---------------- ACCOUNT ACTIVITY (HubSpot's activities: search, type filters,
   dated events, expandable detail). One event per real record, each with a
   stable id (ra:<row id>, ph:<photo id>, tap:<survey date>, buy:<month>), so
   nothing appears twice. A note, a photo or a survey is NOT a visit -- nothing
   here says "visited". Purchases are the monthly sales record, labelled as
   purchase activity, never as invoices. ---------------- */
const TYPES = [['all','All'], ['note','Notes'], ['follow','Follow-Ups'], ['photo','Photos'], ['tap','Tap Surveys'], ['mark','Program Marks'], ['buy','Purchases']];
const MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function events(st){
  const ev = new Map(), add = e => { if(e.t && !ev.has(e.id)) ev.set(e.id, e); };
  st.notes.forEach(r=>{
    if(/^note:/.test(r.program_id||'')){
      add({id:'ra:'+r.id, type: r.status==='note' ? 'note' : 'follow', t: r.created_at || r.updated_at, r, sub:'created'});
      if(r.status==='done' && r.updated_at && r.created_at && r.updated_at !== r.created_at) add({id:'ra:'+r.id+':done', type:'follow', t:r.updated_at, r, sub:'done'});
    } else add({id:'ra:'+r.id, type:'mark', t:r.updated_at, r});
  });
  st.photos.forEach(p=>add({id:'ph:'+p.id, type:'photo', t:p.captured_at || p.uploaded_at, p}));
  const x = ctx.extra || {};
  (x.taps||[]).forEach(s=>add({id:'tap:'+s.visited, type:'tap', t:s.visited+'T12:00:00', s}));
  (x.purchases||[]).forEach(m=>{ const [y, mo] = m.month.split('-').map(Number); add({id:'buy:'+m.month, type:'buy', t:new Date(y, mo, 0, 12).toISOString(), m}); });
  return Array.from(ev.values()).sort((a,b)=>String(b.t).localeCompare(String(a.t)));
}
function evText(e){
  if(e.type==='photo') return [catName(e.p.category), e.p.caption, e.p.brand, e.p.author_name].join(' ');
  if(e.type==='tap') return 'tap survey '+(e.s.display||'');
  if(e.type==='buy') return 'purchase '+e.m.label+' '+(e.m.top||[]).map(t=>t.name).join(' ');
  return [e.r.note, e.r.rep_name, e.type==='mark' ? ctx.progName(e.r.program_id) : ''].join(' ');
}
function evHtml(e){
  const det = (inner, open) => inner ? `<details class="act-det"${open?' open':''}><summary>Details</summary><div class="act-dbody">${inner}</div></details>` : '';
  if(e.type==='photo'){
    const p = e.p, both = p.captured_at && p.uploaded_at && Math.abs(new Date(p.uploaded_at) - new Date(p.captured_at)) > 5*60000;
    return `<li class="act k-photo" data-ev="${E(e.id)}"><span class="act-ic">${ICON.photo}</span><div class="act-b">
      <p class="act-h"><b>Photo · ${E(catName(p.category))}</b>${p.brand ? ` <span class="act-p">${E(p.brand)}</span>` : ''}</p>
      ${p.caption ? `<p class="act-t">${E(p.caption)}</p>` : ''}
      <button type="button" class="act-thumb" data-photo="${E(p.id)}" aria-label="Open the ${E(catName(p.category))} photo"><img alt="" data-src="${E(p.storage_path)}"></button>
      <p class="act-m">${E(p.author_name||'')} · ${p.captured_at ? 'Taken '+E(fmtWhen(p.captured_at)) : 'Uploaded '+E(fmtWhen(p.uploaded_at))}${both ? ` · uploaded ${E(fmtWhen(p.uploaded_at))}` : ''}</p></div></li>`;
  }
  if(e.type==='tap'){
    const s = e.s;
    return `<li class="act k-tap" data-ev="${E(e.id)}"><span class="act-ic">${ICON.tap}</span><div class="act-b">
      <p class="act-h"><b>Tap Survey</b> <span class="act-p">iSellBeer</span></p>
      <p class="act-t">${s.taps} ${s.taps===1?'tap':'taps'} · ${s.ours} ours · ${s.them} theirs</p>
      <p class="act-m">Surveyed ${E(s.display || fmtDay(s.visited))} · <a href="#" data-go="more:taps">View Taps &amp; Survey History</a></p></div></li>`;
  }
  if(e.type==='buy'){
    const m = e.m;
    const top = (m.top||[]).map(t=>`<li>${E(t.name)} · ${fmtN(t.cases)} cs</li>`).join('');
    return `<li class="act k-buy" data-ev="${E(e.id)}"><span class="act-ic">${ICON.buy}</span><div class="act-b">
      <p class="act-h"><b>Purchase Activity · ${E(m.label)}</b></p>
      <p class="act-t">${fmtN(m.cases)} cases across ${m.products} ${m.products===1?'product':'products'}</p>
      ${det(top ? `<ul class="act-list">${top}</ul><p class="note">Monthly totals from the sales record (Fusion, net of returns) — not invoices, and not a visit.</p>` : '')}
      <p class="act-m">Monthly sales record · <a href="#" data-go="history:record">View Monthly Record</a></p></div></li>`;
  }
  const r = e.r;
  if(e.type==='mark'){
    const L = {follow:'Follow Up', done:'Done', skip:'Not Now'}[r.status] || r.status;
    return `<li class="act k-mark" data-ev="${E(e.id)}"><span class="act-ic">${ICON.mark}</span><div class="act-b">
      <p class="act-h"><b>Program Mark · ${E(L)}</b> <span class="act-p">${E(ctx.progName(r.program_id))}</span></p>
      ${r.note ? `<p class="act-t">${E(r.note)}</p>` : ''}
      <p class="act-m">${E(r.rep_name||'')} · ${E(fmtWhen(r.updated_at))} · <a href="${E(ctx.hubLink(r))}">Open in the Incentive Hub</a></p></div></li>`;
  }
  if(e.sub==='done'){
    return `<li class="act k-done" data-ev="${E(e.id)}"><span class="act-ic">${ICON.done}</span><div class="act-b">
      <p class="act-h"><b>Follow-Up Marked Done</b>${r.follow_on ? ` <span class="act-p">was due ${E(fmtDay(r.follow_on))}</span>` : ''}</p>
      ${r.note ? `<p class="act-t">${E(r.note)}</p>` : ''}
      <p class="act-m">${E(r.rep_name||'')} · ${E(fmtWhen(r.updated_at))}</p></div></li>`;
  }
  const isFollow = e.type==='follow';
  const due = r.follow_on ? fmtDay(r.follow_on) : '';
  const open = r.status==='follow';
  const overdue = open && r.follow_on && r.follow_on < todayIso();
  const head = isFollow ? `<b>Follow-Up</b>${open ? (due ? ` <span class="act-due${overdue?' late':''}">${overdue ? 'Overdue · was due ' : 'Due '}${E(due)}</span>` : ' <span class="act-due">No due date</span>') : ' <span class="act-p">Done</span>'}` : `<b>Note</b>`;
  const canDone = open && isMine(r) && !ctx.readOnly;
  return `<li class="act k-${isFollow?'follow':'note'}" data-ev="${E(e.id)}"><span class="act-ic">${ICON[isFollow?'follow':'note']}</span><div class="act-b">
    <p class="act-h">${head}</p>
    ${r.note ? `<p class="act-t">${E(r.note)}</p>` : ''}
    <p class="act-m">${E(r.rep_name||'')} · ${E(fmtWhen(r.created_at || r.updated_at))}</p>
    ${canDone ? `<button type="button" class="btn outline sm" data-done="${E(r.id)}">Mark Done</button>` : ''}</div></li>`;
}
const fmtN = n => (Math.round(Number(n||0)*10)/10).toLocaleString('en-US');
function stateNote(st){
  if(st.notesErr==='off') return `<div class="kdh-state unavailable slim"><b>Notes and photos need a sign-in on kohlerdisthub.com.</b></div>`;
  if(st.update) return `<div class="kdh-state unavailable slim"><b>Account notes and photos need a one-time database update.</b><span>Run ${E(UPDATE_SQL)} and then supabase/seed/account_assignments.sql in the Supabase SQL Editor. Program marks below still show.</span></div>`;
  if(st.notesErr) return `<div class="kdh-state error slim"><b>Couldn’t load this account’s notes.</b><span>${E(st.notesErr)}</span></div>`;
  return '';
}
const tl = {type:'all', q:'', limit:15};       // the full timeline's filters (kept while the page is open)
function timelineHtml(st, full){
  const all = events(st);
  if(!full){
    const recent = all.filter(e=>e.type!=='buy').slice(0, 5);
    const empty = !recent.length ? `<p class="act-empty">${ctx.readOnly ? 'No notes or photos on this account yet.' : 'No notes or photos yet. Notes save to this account for everyone on its route and for managers.'}</p>` : '';
    return `${stateNote(st)}${empty}<ul class="acts">${recent.map(evHtml).join('')}</ul><a class="btn outline wide" href="#" data-go="more:activity">View All Activity</a>`;
  }
  const counts = {}; all.forEach(e=>{ counts[e.type] = (counts[e.type]||0)+1; });
  const q = tl.q.trim().toLowerCase();
  const shown = all.filter(e=>(tl.type==='all' || e.type===tl.type) && (!q || evText(e).toLowerCase().includes(q)));
  const chips = TYPES.filter(([k])=>k==='all' || counts[k]).map(([k, l])=>`<button type="button" class="chip" data-tl="${k}" aria-pressed="${tl.type===k}">${E(l)} <span>${k==='all' ? all.length : counts[k]}</span></button>`).join('');
  return `${stateNote(st)}<div class="tl-bar">
      <input type="search" class="kdh-field" id="tlq" placeholder="Search activity" value="${E(tl.q)}" aria-label="Search this account’s activity">
      <div class="chips" role="group" aria-label="Activity type">${chips}</div>
    </div>
    <p class="tl-count">${shown.length===all.length ? `${all.length} ${all.length===1?'record':'records'}` : `Showing ${shown.length} of ${all.length} records`} · newest first</p>
    ${shown.length ? `<ul class="acts">${shown.slice(0, tl.limit).map(evHtml).join('')}</ul>` : `<div class="kdh-state empty slim"><b>No activity matches.</b><span>Clear the search or pick another type.</span></div>`}
    ${shown.length > tl.limit ? `<button type="button" class="btn outline wide" id="tlMore">Load Older Activity · ${shown.length - tl.limit} more</button>` : ''}
    <p class="note">Notes, follow-ups, photos and program marks are saved in the Hub; tap surveys come from iSellBeer; purchases are the monthly sales record. None of these is recorded as a visit.</p>`;
}

/* ---------------- note composer with a device draft ---------------- */
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
      <p class="dstate" id="nstate" role="status" hidden></p>
      <p class="ncomp-msg" id="nmsg" role="status" hidden></p>
      <div class="ncomp-b"><button type="button" class="btn" id="ncancel">Discard</button><button type="submit" class="btn primary" id="nsave">Save Note</button></div>
    </div>
  </form>`;
}
function stateChip(state, extra){
  const cls = {draft:'d-draft', pending:'d-pend', uploading:'d-up', saved:'d-ok', failed:'d-fail', local:'d-fail'}[state] || '';
  return `<span class="dchip ${cls}">${E(DSTATE[state]||state)}</span>${extra ? ` <span class="dwhy">${E(extra)}</span>` : ''}`;
}

/* ---------------- photo drafts (not yet saved) ---------------- */
function draftsHtml(){
  if(!photoDrafts.length) return '';
  return `<div class="drafts" aria-label="Photos not yet saved"><p class="drafts-h">Not Yet Saved <span>· kept on this device</span></p>${photoDrafts.map(r=>`
    <div class="dphoto" data-draft="${E(r.id)}"><img alt="" data-blob="${E(r.id)}">
      <div class="dp-b"><p class="dp-h"><b>${E(catName(r.type))}</b>${r.caption ? ' · '+E(r.caption) : ''}</p>
      <p class="dp-s">${stateChip(r.state==='uploading' ? 'pending' : r.state, r.err || (r.state==='pending' ? 'Tap Retry when you have signal.' : ''))}</p>
      <div class="dp-p" hidden><div class="pf-bar"><i></i></div></div>
      <div class="dp-a"><button type="button" class="btn primary sm" data-dretry="${E(r.id)}">Retry</button><button type="button" class="btn sm" data-ddiscard="${E(r.id)}">Discard</button></div></div>
    </div>`).join('')}</div>`;
}
const blobFor = new Map();
function hydrateDrafts(root){
  root.querySelectorAll('img[data-blob]').forEach(img=>{ const r = photoDrafts.find(x=>x.id===img.dataset.blob); if(!r || !r.blob) return; let u = blobFor.get(r.id); if(!u){ u = URL.createObjectURL(r.blob); blobFor.set(r.id, u); } img.src = u; });
  root.querySelectorAll('[data-dretry]').forEach(b=>b.addEventListener('click', async ()=>{
    const r = photoDrafts.find(x=>x.id===b.dataset.dretry); if(!r) return;
    const card = b.closest('.dphoto'), st = card.querySelector('.dp-s'), pb = card.querySelector('.dp-p'), bar = card.querySelector('.pf-bar i');
    card.querySelectorAll('button').forEach(x=>x.disabled = true); b.setAttribute('aria-busy', 'true');
    st.innerHTML = stateChip('uploading'); pb.hidden = false;
    const ok = await uploadPhoto(r, f=>{ bar.style.width = Math.round(f*100)+'%'; });
    if(ok){ st.innerHTML = stateChip('saved'); toast(`${catName(r.type)} photo saved to ${ctx.name}`); const s2 = await load(ctx.n, true); await refreshDrafts(); paint(s2); }
    else { b.removeAttribute('aria-busy'); card.querySelectorAll('button').forEach(x=>x.disabled = false); pb.hidden = true; st.innerHTML = stateChip(r.state, r.err); }
  }));
  root.querySelectorAll('[data-ddiscard]').forEach(b=>b.addEventListener('click', async ()=>{
    const r = photoDrafts.find(x=>x.id===b.dataset.ddiscard); if(!r) return;
    if(!confirm('Discard this photo? It has not been saved to the account.')) return;
    if(r.uploaded) await removeObject(r.path);
    await IDB.del(r.id); const u = blobFor.get(r.id); if(u){ try{ URL.revokeObjectURL(u); }catch(e){} blobFor.delete(r.id); }
    await refreshDrafts(); paint(cache.get(ctx.n) || await load(ctx.n));
  }));
}
// one upload attempt for a photo draft; true = saved (file + record), false = r.state/err updated
async function uploadPhoto(r, onProgress){
  const why = await authCheck(r.owner);
  if(why){ r.state = 'failed'; r.err = why; await IDB.put(r); return false; }
  if(!navigator.onLine){ r.state = 'pending'; r.err = 'No connection right now. Tap Retry when you have signal.'; await IDB.put(r); return false; }
  r.state = 'uploading'; r.err = ''; await IDB.put(r);
  try{
    if(!r.uploaded){
      try{ await uploadWithProgress(r.path, r.blob, onProgress || (()=>{})); }
      catch(e){ if(!isDup(e)) throw e; }          // the file arrived on an earlier attempt
      r.uploaded = true; await IDB.put(r);
    }
    const row = {customer_num:String(r.n), category:r.type || null, premise:r.prem||null, caption:(r.caption||'').trim()||null, storage_path:r.path, width:r.width, height:r.height, captured_at:r.capturedAt||null, author_email:'-'};
    if(r.brand) row.brand = r.brand; if(r.program) row.program_id = r.program;
    const post = body => rest('account_photos', {method:'POST', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify(body)});
    try{ await post(row); }
    catch(e){
      if(isDup(e)){ /* the record was written on an earlier attempt */ }
      else if(colMissing(e) && (row.brand || row.program_id)){ delete row.brand; delete row.program_id; try{ await post(row); }catch(e2){ if(!isDup(e2)) throw e2; } labelsMissing = true; }
      else throw e;
    }
    await IDB.del(r.id);
    return true;
  }catch(e){
    r.state = 'failed';
    r.err = needsUpdate(e) ? 'Photos need the one-time database update ('+UPDATE_SQL+').' : denied(e) ? 'This account is not on your route in the photo system (the account list in Supabase may need its refresh).' : (e.message || 'Something went wrong.');
    await IDB.put(r);
    return false;
  }
}
let labelsMissing = false;

/* ---------------- PHOTOS (komoot's Photos: category selection above an even grid) ---------------- */
const pf = {cat:'all', q:'', author:'', brand:'', when:''};
function catOrder(){ return ctx.prem==='On' ? ['tap_handle', 'display', 'window', 'cooler_door'] : ['display', 'window', 'cooler_door', 'tap_handle']; }
function photosGrid(list, limit){
  const show = limit ? list.slice(0, limit) : list;
  return `<div class="pgrid">${show.map(p=>`<button type="button" class="pcell" data-photo="${E(p.id)}"><img alt="${E(catName(p.category))} photo${p.caption ? ': '+E(p.caption) : ''}" data-src="${E(p.storage_path)}"><span class="pcap"><b>${E(catName(p.category))}</b><span>${E(fmtDay(p.captured_at || p.uploaded_at))}</span></span></button>`).join('')}</div>`;
}
function photosErr(st){
  if(st.photosErr==='off') return `<p class="act-empty">Photos need a sign-in on kohlerdisthub.com.</p>`;
  if(st.photosErr==='update') return `<div class="kdh-state unavailable slim"><b>Photos need a one-time database update.</b><span>Run ${E(UPDATE_SQL)} in the Supabase SQL Editor.</span></div>`;
  if(st.photosErr) return `<div class="kdh-state error slim"><b>Couldn’t load photos.</b><span>${E(st.photosErr)}</span></div>`;
  return '';
}
function photosSide(st){
  const err = photosErr(st); if(err) return err;
  if(!st.photos.length) return draftsHtml() + `<p class="act-empty">No photos yet.${ctx.readOnly ? '' : ' Use Add Photo to save a display, window, cooler door or tap handle.'}</p>`;
  return draftsHtml() + photosGrid(st.photos, 4) + (st.photos.length > 4 ? `<a class="btn outline wide" href="#" data-go="more:photos">View All Photos · ${st.photos.length}</a>` : `<a class="btn outline wide" href="#" data-go="more:photos">Open Photos</a>`);
}
function photosFull(st){
  const err = photosErr(st);
  const add = ctx.readOnly || !cfg() ? '' : `<button type="button" class="btn primary" data-qa="photo">${ICON.photo} Add Photo</button>`;
  if(err) return add + err;
  const all = st.photos;
  const counts = {}; all.forEach(p=>{ const k = p.category || 'none'; counts[k] = (counts[k]||0)+1; });
  // the premise's own types first (komoot's category row), then any other type that has photos, then Uncategorized
  const order = catOrder().filter((c, i)=>i===0 || counts[c] || (ctx.prem==='Off' && c!=='tap_handle'));
  const chips = [['all', 'All', all.length]].concat(order.map(c=>[c, CATS[c], counts[c]||0])).concat(counts.none ? [['none', 'Uncategorized', counts.none]] : []);
  const authors = Array.from(new Set(all.map(p=>p.author_name).filter(Boolean))).sort();
  const brands = Array.from(new Set(all.map(p=>p.brand).filter(Boolean))).sort();
  const q = pf.q.trim().toLowerCase(), since = pf.when ? Date.now() - Number(pf.when)*86400000 : 0;
  const shown = all.filter(p=>(pf.cat==='all' || (pf.cat==='none' ? !p.category : p.category===pf.cat))
    && (!q || [p.caption, p.brand, p.author_name, catName(p.category)].join(' ').toLowerCase().includes(q))
    && (!pf.author || p.author_name===pf.author) && (!pf.brand || p.brand===pf.brand)
    && (!since || new Date(p.captured_at || p.uploaded_at).getTime() >= since));
  return `${add}${draftsHtml()}
    <div class="ph-cats chips" role="group" aria-label="Photo type">${chips.map(([k, l, n])=>`<button type="button" class="chip" data-pc="${k}" aria-pressed="${pf.cat===k}">${E(l)} <span>${n}</span></button>`).join('')}</div>
    <div class="ph-bar">
      <input type="search" class="kdh-field" id="phq" placeholder="Search captions" value="${E(pf.q)}" aria-label="Search photo captions">
      <label class="fsel"><select id="phWhen" aria-label="Date"><option value="">Any date</option>${[['30','Last 30 days'],['90','Last 90 days'],['365','Last 12 months']].map(([v,l])=>`<option value="${v}"${pf.when===v?' selected':''}>${l}</option>`).join('')}</select></label>
      ${authors.length > 1 ? `<label class="fsel"><select id="phAuthor" aria-label="Taken by"><option value="">Anyone</option>${authors.map(a=>`<option${pf.author===a?' selected':''}>${E(a)}</option>`).join('')}</select></label>` : ''}
      ${brands.length ? `<label class="fsel"><select id="phBrand" aria-label="Brand"><option value="">Any brand</option>${brands.map(b=>`<option${pf.brand===b?' selected':''}>${E(b)}</option>`).join('')}</select></label>` : ''}
    </div>
    ${!all.length ? `<p class="act-empty">No photos yet.${ctx.readOnly ? '' : ' Use Add Photo to save a display, window, cooler door or tap handle.'}</p>`
      : shown.length ? `<p class="tl-count">${shown.length===all.length ? `${all.length} ${all.length===1?'photo':'photos'}` : `Showing ${shown.length} of ${all.length} photos`} · newest first</p>${photosGrid(shown, 0)}`
      : `<div class="kdh-state empty slim"><b>No photo matches.</b><span>Pick another type or clear the search.</span></div>`}
    ${labelsMissing ? `<p class="note">Brand and program labels need the photo-labels update (supabase/migrations/20261003090000_photo_labels.sql); the photo itself was saved.</p>` : ''}`;
}
function hydrateImages(root){
  root.querySelectorAll('img[data-src]').forEach(img=>{
    const path = img.dataset.src; img.removeAttribute('data-src');
    photoUrl(path).then(u=>{ img.src = u; }).catch(()=>{ img.closest('button') && img.closest('button').classList.add('pmissing'); img.alt = 'Photo could not load'; });
  });
}

async function attach(c){
  ctx = c;
  const [st] = await Promise.all([load(ctx.n), refreshDrafts()]);
  paint(st);
}
function paint(st){
  const q = document.getElementById('actQuick'); if(q){ q.innerHTML = quickHtml(); wireQuick(q); }
  const f = document.getElementById('actFeed'); if(f){ f.innerHTML = composerHtml() + draftsHtml() + timelineHtml(st, false); wireFeed(f, st); }
  const all = document.getElementById('actAll'); if(all){ all.innerHTML = composerHtml() + timelineHtml(st, true); wireFeed(all, st); wireTimeline(all, st); }
  const ps = document.getElementById('actPhotos'); if(ps){ ps.innerHTML = photosSide(st); wirePhotos(ps, st); }
  const pa = document.getElementById('actPhotosAll'); if(pa){ pa.innerHTML = photosFull(st); wireQuick(pa); wirePhotos(pa, st); wirePhotoFilters(pa, st); }
}
function wireTimeline(root, st){
  root.querySelectorAll('[data-tl]').forEach(b=>b.addEventListener('click', ()=>{ tl.type = b.dataset.tl; tl.limit = 15; repaintTimeline(root, st); }));
  const q = root.querySelector('#tlq'); let t = 0;
  if(q) q.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=>{ tl.q = q.value; tl.limit = 15; repaintTimeline(root, st, true); }, 200); });
  const more = root.querySelector('#tlMore'); if(more) more.addEventListener('click', ()=>{ tl.limit += 15; const y = window.scrollY; repaintTimeline(root, st); window.scrollTo(0, y); });
}
function repaintTimeline(root, st, keepFocus){
  root.innerHTML = composerHtml() + timelineHtml(st, true); wireFeed(root, st); wireTimeline(root, st);
  if(keepFocus){ const q = root.querySelector('#tlq'); if(q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
function wirePhotoFilters(root, st){
  root.querySelectorAll('[data-pc]').forEach(b=>b.addEventListener('click', ()=>{ pf.cat = b.dataset.pc; repaintPhotos(root, st); }));
  const q = root.querySelector('#phq'); let t = 0;
  if(q) q.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=>{ pf.q = q.value; repaintPhotos(root, st, true); }, 200); });
  [['#phWhen','when'], ['#phAuthor','author'], ['#phBrand','brand']].forEach(([sel, k])=>{ const s = root.querySelector(sel); if(s) s.addEventListener('change', ()=>{ pf[k] = s.value; repaintPhotos(root, st); }); });
}
function repaintPhotos(root, st, keepFocus){
  root.innerHTML = photosFull(st); wireQuick(root); wirePhotos(root, st); wirePhotoFilters(root, st);
  if(keepFocus){ const q = root.querySelector('#phq'); if(q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
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
  hydrateImages(root); hydrateDrafts(root);
  root.querySelectorAll('[data-photo]').forEach(b=>b.addEventListener('click', ()=>viewer(st, b.dataset.photo)));
  root.querySelectorAll('[data-done]').forEach(b=>b.addEventListener('click', async ()=>{
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try{ await rest('rep_actions?id=eq.'+encodeURIComponent(b.dataset.done), {method:'PATCH', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify({status:'done'})});
      const s2 = await load(ctx.n, true); paint(s2); if(ctx.onChange) ctx.onChange(s2);
    }catch(e){ b.disabled = false; b.removeAttribute('aria-busy'); toast(denied(e) ? 'Only the person who wrote a follow-up can mark it done.' : 'Could not save: '+(e.message||'error')); }
  }));
  const form = root.querySelector('#ncomp'); if(!form) return;
  const ta = form.querySelector('#ntext'), fu = form.querySelector('#nfollow'), dl = form.querySelector('.ndate'), dt = form.querySelector('#ndate'), msg = form.querySelector('#nmsg'), sx = form.querySelector('#nstate'), save = form.querySelector('#nsave');
  const label = d => (d && (d.state==='failed' || d.state==='pending')) ? 'Retry' : (fu.checked ? 'Save Follow-Up' : 'Save Note');
  const show = (state, extra) => { sx.hidden = !state; sx.innerHTML = state ? stateChip(state, extra) : ''; };
  // restore an unsaved draft (a reload during "Uploading" did not finish -- it is pending)
  const saved = lsGet(noteKey());
  if(saved && saved.text){
    ta.value = saved.text; fu.checked = !!saved.follow; dl.hidden = !fu.checked; if(saved.date) dt.value = saved.date;
    if(saved.state==='uploading') saved.state = 'pending';
    expand(form); show(saved.state, saved.err || (saved.state==='pending' ? 'Not sent yet. Tap Retry to save it.' : '')); save.textContent = label(saved);
  }
  let typing = 0;
  const persist = () => {
    const text = ta.value; if(!text.trim()){ lsDel(noteKey()); show(''); return; }
    const prev = lsGet(noteKey()) || {};
    const d = {id: prev.id || 'note:'+uuid(), text, follow: fu.checked, date: dt.value || '', state: prev.state==='failed' || prev.state==='pending' ? prev.state : 'draft', err: prev.err || '', at: Date.now(), owner: ownerId()};
    if(lsSet(noteKey(), d)) show(d.state, d.state==='draft' ? '' : d.err);
    else show('local', 'This browser is not keeping drafts (private browsing or storage full). Keep this page open until it says Saved.');
  };
  ta.addEventListener('focus', ()=>expand(form));
  ta.addEventListener('input', ()=>{ ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight)+'px'; clearTimeout(typing); typing = setTimeout(persist, 400); });
  fu.addEventListener('change', ()=>{ dl.hidden = !fu.checked; save.textContent = label(lsGet(noteKey())); persist(); });
  dt.addEventListener('change', persist);
  form.querySelector('#ncancel').addEventListener('click', ()=>{
    if(ta.value.trim() && !confirm('Discard this note? It has not been saved to the account.')) return;
    lsDel(noteKey()); ta.value = ''; fu.checked = false; dl.hidden = true; msg.hidden = true; show(''); save.textContent = 'Save Note';
    form.querySelector('.ncomp-x').hidden = true; form.classList.remove('open'); ta.style.height = '';
  });
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const text = ta.value.trim(); const follow = fu.checked; const date = dt.value || null;
    if(!text){ msg.hidden = false; msg.className = 'ncomp-msg err'; msg.textContent = 'Write the note first.'; ta.focus(); return; }
    if(date && date < todayIso() && !(lsGet(noteKey())||{}).id){ msg.hidden = false; msg.className = 'ncomp-msg err'; msg.textContent = 'Pick today or a later date.'; return; }
    clearTimeout(typing);
    const prev = lsGet(noteKey()) || {};
    const d = {id: prev.id || 'note:'+uuid(), text, follow, date: date || '', state:'pending', err:'', at: Date.now(), owner: ownerId()};
    const kept = lsSet(noteKey(), d);
    msg.hidden = true;
    if(!navigator.onLine){ show('pending', 'No connection right now. '+(kept ? 'The note is kept on this device — tap Retry when you have signal.' : 'Keep this page open and tap Retry when you have signal.')); save.textContent = 'Retry'; return; }
    const why = await authCheck(d.owner);
    if(why){ d.state = 'failed'; d.err = why; lsSet(noteKey(), d); show('failed', why); save.textContent = 'Retry'; return; }
    d.state = 'uploading'; lsSet(noteKey(), d); show('uploading'); save.disabled = true; save.setAttribute('aria-busy', 'true');
    try{
      const row = {program_id: d.id, account_num:String(ctx.n), account_name:ctx.name, status: follow ? 'follow' : 'note', note:text};
      if(follow && date) row.follow_on = date;
      try{ await rest('rep_actions', {method:'POST', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify(row)}); }
      catch(err){ if(!isDup(err)) throw err; }          // saved on an earlier attempt: same id, no second copy
      lsDel(noteKey());
      show('saved');
      const s2 = await load(ctx.n, true); paint(s2); if(ctx.onChange) ctx.onChange(s2);
      toast(follow ? 'Follow-up saved' : 'Note saved');
    }catch(err){
      save.disabled = false; save.removeAttribute('aria-busy'); save.textContent = 'Retry';
      d.state = 'failed';
      d.err = needsUpdate(err) ? 'Saving notes needs the one-time database update ('+UPDATE_SQL+').'
        : denied(err) ? 'This account is not on your route in the notes system yet (the account list in Supabase may need its refresh).'
        : (err.message || 'Something went wrong') + '.';
      const keptNow = lsSet(noteKey(), d);
      show('failed', d.err + (keptNow ? ' The note is kept on this device.' : ' Keep this page open to retry.'));
    }
  });
}
function wirePhotos(root, st){
  hydrateImages(root); hydrateDrafts(root);
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
  const prog = p.program_id ? ctx.progName(p.program_id) : '';
  const w = sheet(`${E(catName(p.category))} · ${E(ctx.name)}`, `<div class="pview"><img alt="${E(catName(p.category))} photo" data-src="${E(p.storage_path)}"></div>
    ${p.caption ? `<p class="pv-cap">${E(p.caption)}</p>` : ''}
    <dl class="pv-meta"><dt>Account</dt><dd>${E(ctx.name)} · #${E(ctx.n)}</dd><dt>Type</dt><dd>${E(catName(p.category))}</dd>${p.brand ? `<dt>Brand</dt><dd>${E(p.brand)}</dd>` : ''}${prog ? `<dt>Program</dt><dd>${E(prog)}</dd>` : ''}<dt>Taken by</dt><dd>${E(p.author_name||'—')}</dd><dt>Taken</dt><dd>${p.captured_at ? E(fmtWhen(p.captured_at)) : 'Not recorded in the file'}</dd><dt>Uploaded</dt><dd>${E(fmtWhen(p.uploaded_at))}</dd></dl>
    <p class="pv-ref">File reference ${E(p.storage_path)}</p>
    ${mine && !ctx.readOnly ? `<div class="sheet-b"><button type="button" class="btn outline" id="pvEdit">Edit Labels</button><button type="button" class="btn outline danger" id="pvDel">Remove Photo</button></div>` : ''}`);
  hydrateImages(w);
  const edit = w.querySelector('#pvEdit');
  if(edit) edit.addEventListener('click', ()=>relabel(st, p));
  const del = w.querySelector('#pvDel');
  if(del) del.addEventListener('click', async ()=>{
    if(!confirm('Remove this photo from the account? This cannot be undone.')) return;
    del.disabled = true; del.setAttribute('aria-busy', 'true');
    try{ await rest('account_photos?id=eq.'+encodeURIComponent(p.id), {method:'DELETE', headers:{prefer:'return=representation'}}); await removeObject(p.storage_path);
      closeSheet(); const s2 = await load(ctx.n, true); paint(s2); toast('Photo removed'); }
    catch(e){ del.disabled = false; del.removeAttribute('aria-busy'); toast('Could not remove it: '+(e.message||'error')); }
  });
}
function labelFields(cur){
  const types = (photoTypes().length ? photoTypes() : Object.keys(CATS));
  const progs = (ctx.extra && ctx.extra.opps) || [];
  return `<label class="pf-cap" for="plType">Photo type</label>
    <select id="plType" class="kdh-field">${types.map(t=>`<option value="${t}"${cur.category===t?' selected':''}>${E(CATS[t])}</option>`).join('')}${cur.category && !types.includes(cur.category) ? `<option value="${E(cur.category)}" selected>${E(catName(cur.category))}</option>` : ''}${!cur.category ? '<option value="" selected>Uncategorized</option>' : ''}</select>
    <label class="pf-cap" for="plBrand">Brand <span>(optional)</span></label>
    <input type="text" id="plBrand" maxlength="120" placeholder="e.g. Lytt" value="${E(cur.brand||'')}" list="plBrands">
    ${progs.length ? `<label class="pf-cap" for="plProg">Program <span>(optional)</span></label><select id="plProg" class="kdh-field"><option value="">None</option>${progs.map(p=>`<option value="${E(p.id)}"${cur.program_id===p.id?' selected':''}>${E(p.name)}</option>`).join('')}</select>` : ''}`;
}
function relabel(st, p){
  const w = sheet('Edit Labels', `<p class="pf-acct"><b>${E(ctx.name)}</b> · ${E(catName(p.category))}</p>${labelFields(p)}
    <label class="pf-cap" for="plCap">Caption <span>(optional)</span></label><input type="text" id="plCap" maxlength="500" value="${E(p.caption||'')}">
    <p class="ncomp-msg" id="plMsg" hidden></p>
    <div class="sheet-b"><button type="button" class="btn" id="plCancel">Cancel</button><button type="button" class="btn primary" id="plSave" data-first>Save Labels</button></div>`);
  w.querySelector('#plCancel').addEventListener('click', ()=>{ closeSheet(); viewer(st, p.id); });
  w.querySelector('#plSave').addEventListener('click', async ()=>{
    const b = w.querySelector('#plSave'), msg = w.querySelector('#plMsg'); b.disabled = true; b.setAttribute('aria-busy', 'true');
    const body = {category: w.querySelector('#plType').value || null, caption: w.querySelector('#plCap').value.trim() || null, brand: w.querySelector('#plBrand').value.trim() || null};
    const ps = w.querySelector('#plProg'); if(ps) body.program_id = ps.value || null;
    try{ await rest('account_photos?id=eq.'+encodeURIComponent(p.id), {method:'PATCH', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify(body)});
      closeSheet(); const s2 = await load(ctx.n, true); paint(s2); toast('Labels saved'); }
    catch(e){ b.disabled = false; b.removeAttribute('aria-busy'); msg.hidden = false; msg.className = 'ncomp-msg err';
      msg.textContent = colMissing(e) || e.status===403 || denied(e) ? 'Editing labels needs the photo-labels update (supabase/migrations/20261003090000_photo_labels.sql).' : 'Not saved — '+(e.message||'error')+'.'; }
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
    <details class="pf-more"><summary>Brand or Program <span>(optional)</span></summary>
      <label class="pf-cap" for="pfBrand">Brand</label><input type="text" id="pfBrand" maxlength="120" placeholder="e.g. Lytt">
      ${((ctx.extra && ctx.extra.opps) || []).length ? `<label class="pf-cap" for="pfProg">Program</label><select id="pfProg" class="kdh-field"><option value="">None</option>${ctx.extra.opps.map(p=>`<option value="${E(p.id)}">${E(p.name)}</option>`).join('')}</select>` : ''}
    </details>
    <div class="pf-prog" hidden><div class="pf-bar"><i></i></div><p class="pf-st" role="status"></p></div>
    <div class="sheet-b pf-actions">
      <button type="button" class="btn" id="pfRetake">${src.fromCamera ? 'Retake' : 'Choose Another'}</button>
      <button type="button" class="btn outline" id="pfRemove">Remove</button>
      <button type="button" class="btn primary" id="pfSave" data-first>Save Photo</button>
    </div>`;
  const discard = ()=>{ try{ URL.revokeObjectURL(img.url); }catch(e){} };
  w.querySelector('#pfRetake').addEventListener('click', ()=>{ discard(); closeSheet(); if(src.fromCamera) camera(type); else chooseSource(type); });
  w.querySelector('#pfRemove').addEventListener('click', ()=>{ discard(); closeSheet(); chooseSource(type); });
  let rec = null;
  w.querySelector('#pfSave').addEventListener('click', ()=>{
    const v = id => { const el = w.querySelector(id); return el ? el.value.trim() : ''; };
    if(!rec) rec = {id: uuid(), owner: ownerId(), n: String(ctx.n), name: ctx.name, prem: ctx.prem || '', type, caption: v('#pfCaption'), brand: v('#pfBrand'), program: v('#pfProg'),
      capturedAt: src.capturedAt || null, blob: img.blob, width: img.width, height: img.height, path: String(ctx.n)+'/'+uuid()+'.jpg', state:'uploading', err:'', uploaded:false, at: Date.now()};
    else { rec.caption = v('#pfCaption'); rec.brand = v('#pfBrand'); rec.program = v('#pfProg'); }
    save(w, rec, img);
  });
}
// save from the preview sheet: keep a device copy first, then upload; on failure the
// copy stays under "Not Yet Saved" with Retry -- same storage path, so no duplicate
async function save(w, rec, img){
  const prog = w.querySelector('.pf-prog'), bar = w.querySelector('.pf-bar i'), stx = w.querySelector('.pf-st');
  const btns = w.querySelectorAll('.pf-actions button'); btns.forEach(b=>b.disabled = true);
  const saveBtn = w.querySelector('#pfSave'); saveBtn.setAttribute('aria-busy', 'true');
  prog.hidden = false; prog.classList.remove('err'); bar.style.width = '0%';
  const kept = await IDB.put(rec);
  stx.innerHTML = stateChip('uploading', '0%');
  const ok = await uploadPhoto(rec, f=>{ const pct = Math.round(f*100); bar.style.width = pct+'%'; stx.innerHTML = stateChip('uploading', pct+'%'); });
  if(ok){
    bar.style.width = '100%'; stx.innerHTML = stateChip('saved');
    try{ URL.revokeObjectURL(img.url); }catch(e){}
    const s2 = await load(ctx.n, true); await refreshDrafts(); paint(s2);
    setTimeout(()=>{ closeSheet(); toast(`${catName(rec.type)} photo saved to ${ctx.name}`); }, 500);
    return;
  }
  prog.classList.add('err'); saveBtn.removeAttribute('aria-busy');
  stx.innerHTML = stateChip(rec.state, rec.err) + `<br><span class="dwhy">${kept ? 'The photo is kept on this device under “Not Yet Saved” — retry now or later.' : 'This browser could not keep a copy on the device. Keep this window open and retry.'}</span>`;
  btns.forEach(b=>b.disabled = false);
  saveBtn.textContent = 'Retry';
  if(kept){ await refreshDrafts(); paint(cache.get(ctx.n) || await load(ctx.n)); }
}

// drafts for the whole device: /login/ "Switch account" calls this so the next person sees none
async function forgetDrafts(){
  try{ Object.keys(localStorage).filter(k=>k.indexOf('kdh_draft:')===0).forEach(k=>localStorage.removeItem(k)); }catch(e){}
  try{ if(window.indexedDB) indexedDB.deleteDatabase('kdh-drafts'); }catch(e){}
}
window.KdhActivity = {attach, load, openComposer, photoFlow, forgetDrafts, _exifTime: exifTime, _cats: CATS, _events: ()=>ctx ? events(cache.get(ctx.n) || {notes:[], photos:[]}) : []};
})();
