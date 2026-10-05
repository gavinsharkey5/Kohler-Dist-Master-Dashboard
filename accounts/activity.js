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
const JPEG_Q = 0.86;             // long edge 2560 px (3200 for menus / other, so menu text stays readable)
const M = () => window.KdhMerch;  // shared/merch-types.js: categories, subtypes, units, labels
const CATS = {}; (window.KdhMerch ? window.KdhMerch.CATS : []).forEach(c=>{ CATS[c.k] = c.label; });
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
// author_email is read so "your photo" means the SAME sign-in the database's
// delete / relabel policies check (author_email = kdh_caller_email()), never
// just the same display name (two sign-ins can share one name).
const PHOTO_COLS = 'id,customer_num,category,premise,caption,storage_path,width,height,captured_at,uploaded_at,author_name,author_email';
const MERCH_SQL = 'supabase/migrations/20261004090000_merchandising.sql';
const REC_COLS = 'id,category,subtype,subtype_note,caption,location,brands,program_id,premise,source,source_kind,source_key,isb_promotion_type,isb_theme,isb_elements,source_author,source_author_role,observed_at,created_at,author_name,author_email,'
  + 'merch_lines(line_no,supplier,brand_family,brand,package,quantity,quantity_unit,ownership_source,ownership_corrected,ownership_rule,source_line_ref),merch_record_photos(ord,photo_id)';
const cache = new Map();      // n -> {notes, photos, records, notesErr, photosErr, update, merchMissing, admin}
// PHOTO ADMIN (2026-10-05): the database says whether this sign-in may remove ANY
// photo / record (allowed_users.photo_admin, migration 20261005090000). Asked
// once per page; no function yet (SQL not run) = false. The database still
// decides every delete -- this only decides which buttons to draw.
let adminAsk = null;
function isPhotoAdmin(){
  if(!adminAsk) adminAsk = rest('rpc/kdh_is_photo_admin', {method:'POST', headers:{'content-type':'application/json'}, body:'{}'})
    .then(v=>v===true).catch(()=>false);
  return adminAsk;
}
async function load(n, force){
  if(!force && cache.has(n)) return cache.get(n);
  const out = {notes:[], photos:[], records:[], notesErr:'', photosErr:'', update:false, merchMissing:false};
  if(!cfg()){ out.notesErr = out.photosErr = 'off'; cache.set(n, out); return out; }
  const base = 'select=id,program_id,account_num,account_name,status,note,updated_at,created_at,rep_name';
  let recs = [];
  await Promise.all([
    rest('rep_actions?'+base+',follow_on&account_num=eq.'+encodeURIComponent(n)+'&order=updated_at.desc&limit=200')
      .catch(e=>{ if(needsUpdate(e)){ out.update = true; return rest('rep_actions?'+base+'&account_num=eq.'+encodeURIComponent(n)+'&order=updated_at.desc&limit=200'); } throw e; })
      .then(rows=>{ out.notes = Array.isArray(rows) ? rows : []; })
      .catch(e=>{ out.notesErr = e.message || 'error'; }),
    // newer columns arrive with each migration; before one is run, ask without its columns
    rest('account_photos?select='+PHOTO_COLS+',brand,program_id,source,source_url,photo_kind,photo_status&customer_num=eq.'+encodeURIComponent(n)+'&order=uploaded_at.desc&limit=500')
      .catch(e=>{ if(colMissing(e)) return rest('account_photos?select='+PHOTO_COLS+',brand,program_id&customer_num=eq.'+encodeURIComponent(n)+'&order=uploaded_at.desc&limit=500'); throw e; })
      .catch(e=>{ if(colMissing(e)) return rest('account_photos?select='+PHOTO_COLS+'&customer_num=eq.'+encodeURIComponent(n)+'&order=uploaded_at.desc&limit=500'); throw e; })
      .then(rows=>{ out.photos = Array.isArray(rows) ? rows.filter(r=>r && (r.storage_path || r.source_url)) : []; })
      .catch(e=>{ if(needsUpdate(e)){ out.update = true; out.photosErr = 'update'; } else out.photosErr = e.message || 'error'; }),
    rest('merch_records?select='+REC_COLS+'&customer_num=eq.'+encodeURIComponent(n)+'&order=observed_at.desc.nullslast&limit=300')
      .then(rows=>{ recs = Array.isArray(rows) ? rows : []; })
      .catch(e=>{ out.merchMissing = true; }),
  ]);
  out.records = buildRecords(recs, out.photos);
  out.admin = await isPhotoAdmin();
  cache.set(n, out);
  return out;
}
// one merchandising record per observation; a photo saved before records existed
// (or while the merchandising update is not run) is its own one-photo record
function buildRecords(recs, photos){
  const byId = new Map(photos.map(p=>[p.id, p])); const used = new Set();
  const out = recs.map(r=>{
    // stored photos first (they always load; an iSellBeer link may need an iSellBeer sign-in), then the record's own order
    const ph = (r.merch_record_photos||[]).slice().sort((a,b)=>a.ord-b.ord).map(x=>{ used.add(x.photo_id); return byId.get(x.photo_id); }).filter(Boolean)
      .map((p, i)=>[p, i]).sort((a,b)=>((b[0].storage_path?1:0) - (a[0].storage_path?1:0)) || a[1]-b[1]).map(x=>x[0]);
    return Object.assign({}, r, {rid:r.id, key:'mr:'+r.id, lines:(r.merch_lines||[]).slice().sort((a,b)=>a.line_no-b.line_no), photos:ph, legacy:false});
  });
  photos.forEach(p=>{ if(used.has(p.id)) return;
    out.push({rid:null, key:'ph:'+p.id, legacy:true, id:p.id, category:p.category || null, subtype:null, caption:p.caption, location:null, brands:p.brand ? [p.brand] : [],
      program_id:p.program_id || null, source:p.source || 'hub', observed_at:p.captured_at, created_at:p.uploaded_at, author_name:p.author_name, author_email:p.author_email || null, lines:[], photos:[p]}); });
  return out.sort((a,b)=>String(b.observed_at||b.created_at).localeCompare(String(a.observed_at||a.created_at)));
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
async function toJpeg(source, maxEdge){
  // source: File/Blob or a canvas already drawn by the camera
  let w, h, draw;
  if(source instanceof HTMLCanvasElement){ w = source.width; h = source.height; draw = (ctx, W, H)=>ctx.drawImage(source, 0, 0, W, H); }
  else {
    let bmp = null;
    try{ bmp = await createImageBitmap(source, {imageOrientation:'from-image'}); }catch(e){ bmp = null; }
    if(!bmp){
      bmp = await new Promise((res, rej)=>{ const img = new Image(); img.onload = ()=>res(img); img.onerror = ()=>rej(new Error(/heic|heif/i.test((source && (source.type || source.name)) || '') ? 'This browser can’t open HEIC photos. Take or choose the photo on the iPhone or iPad itself (Safari converts it), or pick a JPEG or PNG.' : 'That file is not a photo this browser can open. Pick a JPEG or PNG.')); img.src = URL.createObjectURL(source); });
    }
    w = bmp.width || bmp.naturalWidth; h = bmp.height || bmp.naturalHeight; draw = (ctx, W, H)=>ctx.drawImage(bmp, 0, 0, W, H);
  }
  if(!w || !h) throw new Error('That file is not an image this browser can open.');
  const k = Math.min(1, (maxEdge || 2560) / Math.max(w, h)); const W = Math.round(w*k), H = Math.round(h*k);
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
// DELETE that reports whether a row was really removed. Row-level security does
// not error on a row you may not delete -- it deletes nothing and answers 204 --
// so the reply's rows are counted. soft=true returns false instead of throwing.
async function deleteRow(path, soft){
  const rows = await rest(path, {method:'DELETE', headers:{prefer:'return=representation'}});
  if(Array.isArray(rows) && rows.length) return true;
  if(soft) return false;
  throw Object.assign(new Error('Not removed — only the sign-in that saved it can remove it. Nothing was changed.'), {notRemoved:true});
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
        const rq = indexedDB.open('kdh-drafts', 2);
        rq.onupgradeneeded = ()=>{ const d = rq.result;
          if(!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', {keyPath:'id'});      // single-photo drafts (2026-10-03)
          if(!d.objectStoreNames.contains('records')) d.createObjectStore('records', {keyPath:'id'}); }; // record drafts (2026-10-04)
        rq.onsuccess = ()=>res(rq.result); rq.onerror = ()=>res(null); rq.onblocked = ()=>res(null);
      }catch(e){ res(null); }
    });
    return this.db;
  },
  async tx(store, mode, fn){ const d = await this.open(); if(!d) return null; return new Promise(res=>{ try{ const t = d.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = ()=>res(out && 'result' in out ? out.result : true); t.onerror = ()=>res(null); t.onabort = ()=>res(null); }catch(e){ res(null); } }); },
  put(store, rec){ return this.tx(store, 'readwrite', s=>s.put(rec)); },
  del(store, id){ return this.tx(store, 'readwrite', s=>s.delete(id)); },
  async list(store, owner, n){ const all = await this.tx(store, 'readonly', s=>s.getAll()); return (all||[]).filter(r=>r.owner===owner && String(r.n)===String(n)).sort((a,b)=>a.at-b.at); },
};
let recDrafts = [];            // this person's unsaved records for the open account
async function refreshDrafts(){
  if(!ctx || ctx.readOnly){ recDrafts = []; return; }
  // a single-photo draft kept by the 2026-10-03 build becomes a one-photo record draft (same file path: no duplicate)
  const old = await IDB.list('photos', ownerId(), ctx.n);
  for(const r of old){
    await IDB.put('records', {id: r.id, owner: r.owner, n: r.n, name: r.name, prem: r.prem, category: r.type || '', subtype:'', subtype_note:'', caption: r.caption || '', location:'', brands: r.brand ? [r.brand] : [],
      program_id: r.program || '', lines:[], photos:[{pid: r.id, blob: r.blob, width: r.width, height: r.height, capturedAt: r.capturedAt, path: r.path, uploaded: !!r.uploaded, rowSaved:false}], state: r.state==='uploading' ? 'pending' : (r.state || 'pending'), err: r.err || '', at: r.at});
    await IDB.del('photos', r.id);
  }
  recDrafts = (await IDB.list('records', ownerId(), ctx.n)).map(d=>{ if(d.state==='uploading') d.state = 'pending'; return d; });
}
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
    <button type="button" class="btn qa" data-qa="photo"${ro?' disabled':''}${ro?` title="${E(why)}"`:''}>${ICON.photo}<span>Add Photos</span></button>
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
  (st.records||[]).forEach(r=>add({id:r.key, type:'photo', t:r.observed_at || r.created_at, rec:r}));
  const x = ctx.extra || {};
  (x.taps||[]).forEach(s=>add({id:'tap:'+s.visited, type:'tap', t:s.visited+'T12:00:00', s}));
  (x.purchases||[]).forEach(m=>{ const [y, mo] = m.month.split('-').map(Number); add({id:'buy:'+m.month, type:'buy', t:new Date(y, mo, 0, 12).toISOString(), m}); });
  return Array.from(ev.values()).sort((a,b)=>String(b.t).localeCompare(String(a.t)));
}
function evText(e){
  if(e.type==='photo'){ const r = e.rec; return [catName(r.category), r.caption, (r.brands||[]).join(' '), r.lines.map(l=>l.brand).join(' '), recAuthor(r), r.isb_elements].join(' '); }
  if(e.type==='tap') return 'tap survey '+(e.s.display||'');
  if(e.type==='buy') return 'purchase '+e.m.label+' '+(e.m.top||[]).map(t=>t.name).join(' ');
  return [e.r.note, e.r.rep_name, e.type==='mark' ? ctx.progName(e.r.program_id) : ''].join(' ');
}
function evHtml(e){
  const det = (inner, open) => inner ? `<details class="act-det"${open?' open':''}><summary>Details</summary><div class="act-dbody">${inner}</div></details>` : '';
  if(e.type==='photo'){
    const r = e.rec, hist = r.source==='isellbeer';
    const sub = r.subtype ? ' · '+(M().SUB_LABEL[r.subtype]||r.subtype) : '';
    const thumbs = r.photos.slice(0, 3).map(p=>`<button type="button" class="act-thumb" data-rec="${E(r.key)}" aria-label="Open the ${E(catName(r.category))} photos"><img alt="" ${thumbAttr(p)}></button>`).join('');
    const brands = (r.brands||[]).length ? r.brands : Array.from(new Set(r.lines.map(l=>l.brand).filter(Boolean)));
    return `<li class="act k-photo" data-ev="${E(e.id)}"><span class="act-ic">${ICON.photo}</span><div class="act-b">
      <p class="act-h"><b>${E(catName(r.category))}${E(sub)}</b>${brands.length ? ` <span class="act-p">${E(brands.slice(0,3).join(', '))}${brands.length>3 ? ' +'+(brands.length-3) : ''}</span>` : ''}</p>
      ${r.caption ? `<p class="act-t">${E(r.caption)}</p>` : ''}
      ${thumbs ? `<div class="act-thumbs">${thumbs}${r.photos.length > 3 ? `<span class="act-more">+${r.photos.length-3}</span>` : ''}</div>` : ''}
      ${r.lines.length ? `<details class="act-det"><summary>${r.lines.length} ${r.category==='tap_handle' ? (r.lines.length===1?'tap line':'tap lines') : (r.lines.length===1?'product line':'product lines')} · ${r.photos.length} ${r.photos.length===1?'photo':'photos'}</summary><div class="act-dbody"><ul class="rv-lines">${r.lines.map(lineHtml).join('')}</ul></div></details>` : ''}
      <p class="act-m">${E(recAuthor(r))} · ${hist ? 'Last observed ' : (r.observed_at ? 'Taken ' : 'Saved ')}${E(fmtWhen(r.observed_at || r.created_at))}${hist ? ' · Imported From iSellBeer' : ''}</p></div></li>`;
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
/* IMPORTED RECORDS STAY OUT OF THE WAY (2026-10-05). One account can carry 80+
   iSellBeer display records. The Overview shows people's own notes, follow-ups
   and photos and ONE summary row for the imports; the full Account Activity
   folds the imports into one row per month (opened in place), unless the Photos
   chip or a search asks for them one by one; the gallery pages 24 at a time with
   a Source filter. Nothing is hidden from a filter or a count. */
const isImport = e => e.type==='photo' && e.rec && e.rec.source==='isellbeer';
const monKey = t => String(t||'').slice(0, 7);
const monLabel = k => { const [y, m] = k.split('-').map(Number); return m ? MONL[m-1]+' '+y : 'Undated'; };
function groupImports(list){
  const out = [], at = new Map();
  list.forEach(e=>{
    if(!isImport(e)){ out.push(e); return; }
    const k = monKey(e.t); let g = at.get(k);
    if(!g){ g = {group:true, id:'isb:'+k, month:k, t:e.t, members:[]}; at.set(k, g); out.push(g); }
    g.members.push(e);
  });
  // a month with a single import shows that record itself
  return out.map(x=>x.group && x.members.length===1 ? x.members[0] : x);
}
function importCounts(evs){
  const recs = evs.map(e=>e.rec), photos = recs.reduce((a, r)=>a + r.photos.length, 0);
  const cats = {}; recs.forEach(r=>{ const c = catName(r.category); cats[c] = (cats[c]||0)+1; });
  return {n:recs.length, photos, cats:Object.entries(cats).sort((a,b)=>b[1]-a[1])};
}
function importSummaryHtml(evs){
  const c = importCounts(evs), last = evs[0];
  return `<li class="act k-isb" data-ev="isb:summary"><span class="act-ic">${ICON.photo}</span><div class="act-b">
    <p class="act-h"><b>Imported From iSellBeer</b> <span class="act-p">${c.n} ${c.n===1?'record':'records'}</span></p>
    <p class="act-t">${E(c.cats.slice(0,3).map(([k, n])=>n+' '+k).join(' · '))}${c.cats.length>3 ? ' · …' : ''}</p>
    <p class="act-m">Latest ${E(fmtDay(last.t))} · <a href="#" data-go="more:photos" data-src-filter="isellbeer">View Imported Photos</a></p></div></li>`;
}
function importGroupHtml(g){
  const c = importCounts(g.members);
  // preview: records whose picture the Hub has stored first (an iSellBeer link may not load)
  const pick = g.members.filter(e=>e.rec.photos[0] && e.rec.photos[0].storage_path).concat(g.members.filter(e=>!(e.rec.photos[0] && e.rec.photos[0].storage_path)));
  const thumbs = pick.slice(0, 4).map(e=>e.rec.photos[0] ? `<button type="button" class="act-thumb" data-rec="${E(e.rec.key)}" aria-label="Open the ${E(catName(e.rec.category))} photos"><img alt="" loading="lazy" ${thumbAttr(e.rec.photos[0])}></button>` : '').join('');
  return `<li class="act k-isb" data-ev="${E(g.id)}"><span class="act-ic">${ICON.photo}</span><div class="act-b">
    <p class="act-h"><b>Imported From iSellBeer · ${E(monLabel(g.month))}</b> <span class="act-p">${c.n} records · ${c.photos} ${c.photos===1?'photo':'photos'}</span></p>
    <p class="act-t">${E(c.cats.slice(0,3).map(([k, n])=>n+' '+k).join(' · '))}${c.cats.length>3 ? ' · …' : ''}</p>
    ${thumbs ? `<div class="act-thumbs">${thumbs}${g.members.length > 4 ? `<span class="act-more">+${g.members.length-4}</span>` : ''}</div>` : ''}
    <details class="act-det act-grp"><summary>Show ${c.n} Records</summary><ul class="acts">${g.members.map(evHtml).join('')}</ul></details></div></li>`;
}
function timelineHtml(st, full){
  const all = events(st);
  if(!full){
    // the Overview keeps the people's own work in view: imported iSellBeer records are summarised in ONE row
    const recent = all.filter(e=>e.type!=='buy' && !isImport(e)).slice(0, 5);
    const imp = all.filter(isImport);
    const empty = !recent.length && !imp.length ? `<p class="act-empty">${ctx.readOnly ? 'No notes or photos on this account yet.' : 'No notes or photos yet. Notes save to this account for everyone on its route and for managers.'}</p>` : '';
    return `${stateNote(st)}${empty}<ul class="acts">${recent.map(evHtml).join('')}${imp.length ? importSummaryHtml(imp) : ''}</ul><a class="btn outline wide" href="#" data-go="more:activity">View All Activity</a>`;
  }
  const counts = {}; all.forEach(e=>{ counts[e.type] = (counts[e.type]||0)+1; });
  const q = tl.q.trim().toLowerCase();
  const shown = all.filter(e=>(tl.type==='all' || e.type===tl.type) && (!q || evText(e).toLowerCase().includes(q)));
  const items = tl.type==='all' && !q ? groupImports(shown) : shown;
  const chips = TYPES.filter(([k])=>k==='all' || counts[k]).map(([k, l])=>`<button type="button" class="chip" data-tl="${k}" aria-pressed="${tl.type===k}">${E(l)} <span>${k==='all' ? all.length : counts[k]}</span></button>`).join('');
  return `${stateNote(st)}<div class="tl-bar">
      <input type="search" class="kdh-field" id="tlq" placeholder="Search activity" value="${E(tl.q)}" aria-label="Search this account’s activity">
      <div class="chips" role="group" aria-label="Activity type">${chips}</div>
    </div>
    <p class="tl-count">${shown.length===all.length ? `${all.length} ${all.length===1?'record':'records'}` : `Showing ${shown.length} of ${all.length} records`} · newest first</p>
    ${items.length ? `<ul class="acts">${items.slice(0, tl.limit).map(it=>it.group ? importGroupHtml(it) : evHtml(it)).join('')}</ul>` : `<div class="kdh-state empty slim"><b>No activity matches.</b><span>Clear the search or pick another type.</span></div>`}
    ${items.length > tl.limit ? `<button type="button" class="btn outline wide" id="tlMore">Load Older Activity · ${items.length - tl.limit} more</button>` : ''}
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

/* ---------------- record drafts (not yet saved) ----------------
   One draft = one merchandising record in progress: its type, details, product
   lines and every photo (the resized JPEG). Kept in IndexedDB `kdh-drafts` /
   `records`, tagged with the signed-in person and the account, from the first
   photo until the record and every photo are saved. Retrying re-sends the SAME
   record key and the SAME photo paths, so nothing is ever saved twice. */
function draftsHtml(){
  if(!recDrafts.length) return '';
  return `<div class="drafts" aria-label="Evidence not yet saved"><p class="drafts-h">Not Yet Saved <span>· kept on this device</span></p>${recDrafts.map(d=>`
    <div class="dphoto" data-draft="${E(d.id)}"><img alt="" data-dblob="${E(d.id)}">
      <div class="dp-b"><p class="dp-h"><b>${E(catName(d.category))}</b> · ${d.photos.length} ${d.photos.length===1?'photo':'photos'}${d.caption ? ' · '+E(d.caption) : ''}</p>
      <p class="dp-s">${stateChip(d.state==='uploading' ? 'pending' : d.state, d.err || (d.state==='pending' ? 'Tap Retry when you have signal.' : d.state==='draft' ? 'Open it to finish and save.' : ''))}</p>
      <div class="dp-p" hidden><div class="pf-bar"><i></i></div></div>
      <div class="dp-a">${d.state==='draft' ? `<button type="button" class="btn primary sm" data-dopen="${E(d.id)}">Continue</button>` : `<button type="button" class="btn primary sm" data-dretry="${E(d.id)}">Retry</button><button type="button" class="btn sm" data-dopen="${E(d.id)}">Edit</button>`}<button type="button" class="btn sm" data-ddiscard="${E(d.id)}">Discard</button></div></div>
    </div>`).join('')}</div>`;
}
const blobFor = new Map();
const blobUrlOf = (key, blob) => { let u = blobFor.get(key); if(!u){ u = URL.createObjectURL(blob); blobFor.set(key, u); } return u; };
function hydrateDrafts(root){
  root.querySelectorAll('img[data-dblob]').forEach(img=>{ const d = recDrafts.find(x=>x.id===img.dataset.dblob); const ph = d && d.photos[0]; if(ph && ph.blob) img.src = blobUrlOf(d.id+':'+ph.pid, ph.blob); });
  root.querySelectorAll('[data-dretry]').forEach(b=>b.addEventListener('click', async ()=>{
    const d = recDrafts.find(x=>x.id===b.dataset.dretry); if(!d) return;
    const card = b.closest('.dphoto'), sx = card.querySelector('.dp-s'), pb = card.querySelector('.dp-p'), bar = card.querySelector('.pf-bar i');
    card.querySelectorAll('button').forEach(x=>x.disabled = true); b.setAttribute('aria-busy', 'true');
    sx.innerHTML = stateChip('uploading'); pb.hidden = false;
    const ok = await uploadRecord(d, f=>{ bar.style.width = Math.round(f*100)+'%'; });
    if(ok){ sx.innerHTML = stateChip('saved'); toast(`${catName(d.category)} saved to ${ctx.name}`); const s2 = await load(ctx.n, true); await refreshDrafts(); paint(s2); }
    else { b.removeAttribute('aria-busy'); card.querySelectorAll('button').forEach(x=>x.disabled = false); pb.hidden = true; sx.innerHTML = stateChip(d.state, d.err); }
  }));
  root.querySelectorAll('[data-dopen]').forEach(b=>b.addEventListener('click', ()=>{ const d = recDrafts.find(x=>x.id===b.dataset.dopen); if(d) detailsStep(d); }));
  root.querySelectorAll('[data-ddiscard]').forEach(b=>b.addEventListener('click', async ()=>{
    const d = recDrafts.find(x=>x.id===b.dataset.ddiscard); if(!d) return;
    if(!confirm('Discard this evidence and its photos? It has not been saved to the account.')) return;
    await discardDraft(d); paint(cache.get(ctx.n) || await load(ctx.n));
  }));
}
async function discardDraft(d){
  for(const ph of d.photos) if(ph.uploaded && !ph.rowSaved) await removeObject(ph.path);
  await IDB.del('records', d.id); d.photos.forEach(ph=>{ const u = blobFor.get(d.id+':'+ph.pid); if(u){ try{ URL.revokeObjectURL(u); }catch(e){} blobFor.delete(d.id+':'+ph.pid); } });
  await refreshDrafts();
}
// one save attempt for a record draft: every photo file, every photo row, then the record
// (kdh_merch_save, keyed by the draft id). true = all saved; false = d.state / d.err updated
async function uploadRecord(d, onProgress){
  const why = await authCheck(d.owner);
  if(why){ d.state = 'failed'; d.err = why; await IDB.put('records', d); return false; }
  if(!navigator.onLine){ d.state = 'pending'; d.err = 'No connection right now. Tap Retry when you have signal.'; await IDB.put('records', d); return false; }
  d.state = 'uploading'; d.err = ''; await IDB.put('records', d);
  const total = d.photos.reduce((a, p)=>a + (p.blob ? p.blob.size : 0), 0) || 1; let done = 0;
  try{
    for(const ph of d.photos){
      if(!ph.uploaded){
        try{ await uploadWithProgress(ph.path, ph.blob, f=>onProgress && onProgress((done + f*ph.blob.size)/total)); }
        catch(e){ if(!isDup(e)) throw e; }                // the file arrived on an earlier attempt
        ph.uploaded = true; await IDB.put('records', d);
      }
      done += ph.blob ? ph.blob.size : 0;
      if(!ph.rowSaved){
        const row = {customer_num:String(d.n), category:d.category, premise:d.prem||null, caption:(d.caption||'').trim()||null, storage_path:ph.path, width:ph.width, height:ph.height, captured_at:ph.capturedAt||null, author_email:'-'};
        try{ await rest('account_photos', {method:'POST', headers:{'content-type':'application/json', prefer:'return=minimal'}, body: JSON.stringify(row)}); }
        catch(e){
          if(isDup(e)){ /* written on an earlier attempt */ }
          else if(e.code==='23514' && /category/.test(e.message||'')){ row.category = null; try{ await rest('account_photos', {method:'POST', headers:{'content-type':'application/json', prefer:'return=minimal'}, body: JSON.stringify(row)}); }catch(e2){ if(!isDup(e2)) throw e2; } }
          else throw e;
        }
        ph.rowSaved = true; await IDB.put('records', d);
      }
    }
    const lines = (d.lines||[]).filter(l=>l.brand || l.package || (l.quantity!=='' && l.quantity!=null)).map(l=>({brand:l.brand||'', package:l.package||'', product_num:l.product_num||'',
      quantity: l.quantity==='' || l.quantity==null ? null : Number(l.quantity), quantity_unit: l.quantity==='' || l.quantity==null ? null : (l.unit || 'unspecified')}));
    try{
      await rest('rpc/kdh_merch_save', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({p:{key:d.id, customer_num:String(d.n), category:d.category, subtype:d.subtype||'', subtype_note:d.subtype_note||'',
        caption:d.caption||'', location:d.location||'', brands:d.brands||[], program_id:d.program_id||'', premise:d.prem||'', observed_at:(d.photos.find(p=>p.capturedAt)||{}).capturedAt || null,
        photos:d.photos.map(p=>p.path), lines}})});
    }catch(e){
      // the merchandising update is not run yet: the photos are saved (as single photos); say what is missing
      if(e.status===404 || e.code==='PGRST202' || e.code==='42883'){ merchSaveMissing = true; }
      else throw e;
    }
    await IDB.del('records', d.id);
    return true;
  }catch(e){
    d.state = 'failed';
    d.err = needsUpdate(e) ? 'Photos need the one-time database update ('+UPDATE_SQL+').' : denied(e) ? 'This account is not on your route in the photo system (the account list in Supabase may need its refresh).' : (e.message || 'Something went wrong.');
    await IDB.put('records', d);
    return false;
  }
}
let merchSaveMissing = false;

/* ---------------- PHOTOS & MERCHANDISING (komoot's Photos: category selection above an
   even grid; one tile per record -- its first photo, with the photo count) ---------------- */
const pf = {cat:'all', q:'', author:'', brand:'', prog:'', when:'', src:'', limit:24};
const GALLERY_PAGE = 24;
function catOrder(){ const first = M().BY_PREMISE[ctx.prem] || []; return first.concat(M().CATS.map(c=>c.k).filter(k=>!first.includes(k))); }
function recDate(r){ return r.observed_at || r.created_at; }
function recAuthor(r){ return r.source==='isellbeer' ? (r.source_author || 'iSellBeer') : (r.author_name || ''); }
function thumbAttr(ph){ return ph.storage_path ? `data-src="${E(ph.storage_path)}"` : ph.source_url ? `data-ext="${E(ph.source_url)}"` : ''; }
function recGrid(list, limit){
  const show = limit ? list.slice(0, limit) : list;
  return `<div class="pgrid">${show.map(r=>{ const ph = r.photos[0];
    return `<button type="button" class="pcell" data-rec="${E(r.key)}">${ph ? `<img alt="${E(catName(r.category))}${r.caption ? ': '+E(r.caption) : ''}" ${thumbAttr(ph)}>` : `<span class="pnone">No photo</span>`}
      ${r.photos.length > 1 ? `<span class="pcount">${r.photos.length} photos</span>` : ''}
      <span class="pcap"><b>${E(catName(r.category))}</b><span>${E(fmtDay(recDate(r)))}</span>${r.caption ? `<i>${E(r.caption)}</i>` : ''}</span></button>`; }).join('')}</div>`;
}
function photosErr(st){
  if(st.photosErr==='off') return `<p class="act-empty">Photos need a sign-in on kohlerdisthub.com.</p>`;
  if(st.photosErr==='update') return `<div class="kdh-state unavailable slim"><b>Photos need a one-time database update.</b><span>Run ${E(UPDATE_SQL)} in the Supabase SQL Editor.</span></div>`;
  if(st.photosErr) return `<div class="kdh-state error slim"><b>Couldn’t load photos.</b><span>${E(st.photosErr)}</span></div>`;
  return '';
}
function photosSide(st){
  const err = photosErr(st); if(err) return err;
  if(!st.records.length) return draftsHtml() + `<p class="act-empty">No photos or merchandising yet.${ctx.readOnly ? '' : ' Use Add Photo to document a display, window, cooler door, tap handles or a menu placement.'}</p>`;
  const withFile = st.records.filter(r=>r.photos[0] && r.photos[0].storage_path);
  const side = withFile.slice(0, 4).concat(st.records.filter(r=>!withFile.includes(r)).slice(0, Math.max(0, 4 - withFile.length)));
  return draftsHtml() + recGrid(side, 4) + `<a class="btn outline wide" href="#" data-go="more:photos">${st.records.length > 4 ? `View All · ${st.records.length} Records` : 'Open Photos & Merchandising'}</a>`;
}
function photosFull(st){
  const err = photosErr(st);
  const add = ctx.readOnly || !cfg() ? '' : `<button type="button" class="btn primary" data-qa="photo">${ICON.photo} Add Photos</button>`;
  if(err) return add + err;
  const all = st.records;
  const counts = {}; all.forEach(r=>{ const k = r.category || 'none'; counts[k] = (counts[k]||0)+1; });
  const first = M().BY_PREMISE[ctx.prem] || [];
  const order = catOrder().filter(c=>first.includes(c) || counts[c]);
  // a type with nothing in it gets no chip (unless it is the one selected)
  const chips = [['all', 'All', all.length]].concat(order.filter(c=>counts[c] || pf.cat===c).map(c=>[c, M().catLabel(c), counts[c]||0])).concat(counts.none ? [['none', 'Uncategorized', counts.none]] : []);
  const authors = Array.from(new Set(all.map(recAuthor).filter(Boolean))).sort();
  const brands = Array.from(new Set(all.flatMap(r=>(r.brands||[]).concat(r.lines.map(l=>l.brand)).filter(Boolean)))).sort();
  const progs = Array.from(new Set(all.map(r=>r.program_id).filter(Boolean)));
  const q = pf.q.trim().toLowerCase(), since = pf.when ? Date.now() - Number(pf.when)*86400000 : 0;
  const nHub = all.filter(r=>r.source!=='isellbeer').length, nIsb = all.length - nHub;
  const shown = all.filter(r=>(!pf.src || (pf.src==='isellbeer' ? r.source==='isellbeer' : r.source!=='isellbeer'))
    && (pf.cat==='all' || (pf.cat==='none' ? !r.category : r.category===pf.cat))
    && (!q || [r.caption, r.location, (r.brands||[]).join(' '), r.lines.map(l=>[l.brand, l.package].join(' ')).join(' '), recAuthor(r), catName(r.category), r.isb_elements, r.isb_promotion_type].join(' ').toLowerCase().includes(q))
    && (!pf.author || recAuthor(r)===pf.author) && (!pf.brand || (r.brands||[]).includes(pf.brand) || r.lines.some(l=>l.brand===pf.brand))
    && (!pf.prog || r.program_id===pf.prog)
    && (!since || new Date(recDate(r)).getTime() >= since));
  const nPhotos = all.reduce((a, r)=>a + r.photos.length, 0);
  return `${add}${draftsHtml()}
    ${st.merchMissing && all.length ? `<p class="note">Product lines and multi-photo records turn on after ${E(MERCH_SQL)} is run; photos show one per record until then.</p>` : ''}
    <div class="ph-cats chips" role="group" aria-label="Evidence type">${chips.map(([k, l, n])=>`<button type="button" class="chip" data-pc="${k}" aria-pressed="${pf.cat===k}">${E(l)} <span>${n}</span></button>`).join('')}</div>
    <div class="ph-bar">
      <input type="search" class="kdh-field" id="phq" placeholder="Search captions, brands, products" value="${E(pf.q)}" aria-label="Search photos and merchandising">
      <label class="fsel"><select id="phWhen" aria-label="Date"><option value="">Any date</option>${[['30','Last 30 days'],['90','Last 90 days'],['365','Last 12 months']].map(([v,l])=>`<option value="${v}"${pf.when===v?' selected':''}>${l}</option>`).join('')}</select></label>
      ${brands.length ? `<label class="fsel"><select id="phBrand" aria-label="Brand"><option value="">Any brand</option>${brands.map(b=>`<option${pf.brand===b?' selected':''}>${E(b)}</option>`).join('')}</select></label>` : ''}
      ${progs.length ? `<label class="fsel"><select id="phProg" aria-label="Program"><option value="">Any program</option>${progs.map(p=>`<option value="${E(p)}"${pf.prog===p?' selected':''}>${E(ctx.progName(p))}</option>`).join('')}</select></label>` : ''}
      ${nHub && nIsb ? `<label class="fsel"><select id="phSrc" aria-label="Source"><option value="">Any source</option><option value="hub"${pf.src==='hub'?' selected':''}>Captured in the Hub · ${nHub}</option><option value="isellbeer"${pf.src==='isellbeer'?' selected':''}>Imported From iSellBeer · ${nIsb}</option></select></label>` : ''}
      ${authors.length > 1 ? `<label class="fsel"><select id="phAuthor" aria-label="Taken by"><option value="">Anyone</option>${authors.map(a=>`<option${pf.author===a?' selected':''}>${E(a)}</option>`).join('')}</select></label>` : ''}
    </div>
    ${!all.length ? `<p class="act-empty">No photos or merchandising yet.${ctx.readOnly ? '' : ' Use Add Photos to document a display, window, cooler door, tap handles or a menu placement.'}</p>`
      : shown.length ? `<p class="tl-count">${shown.length===all.length ? `${all.length} ${all.length===1?'record':'records'} · ${nPhotos} ${nPhotos===1?'photo':'photos'}` : `${shown.length} of ${all.length} records match`} · newest first</p>${recGrid(shown, pf.limit)}
        ${shown.length > pf.limit ? `<button type="button" class="btn outline wide" id="phMore">Show More · ${Math.min(GALLERY_PAGE, shown.length - pf.limit)} of ${shown.length - pf.limit} more</button>` : ''}`
      : `<div class="kdh-state empty slim"><b>Nothing matches.</b><span>Pick another type or clear the search.</span></div>`}
    ${merchSaveMissing ? `<p class="note">Your photos were saved. Grouping them into one record with product lines needs ${E(MERCH_SQL)} in Supabase.</p>` : ''}`;
}
// stored photos load with the person's own token; an iSellBeer link loads straight from iSellBeer
// (it may need an iSellBeer sign-in) -- when it does not load, the tile says Photo Unavailable
function loadImg(img){
  if(img.dataset.src){ const path = img.dataset.src; img.removeAttribute('data-src'); photoUrl(path).then(u=>{ img.src = u; }).catch(()=>unavailable(img)); return; }
  if(img.dataset.ext){ const u = img.dataset.ext; img.removeAttribute('data-ext'); img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', ()=>unavailable(img), {once:true}); img.src = u; }
}
let imgIO = null;
function hydrateImages(root){
  const imgs = root.querySelectorAll('img[data-src], img[data-ext]');
  if(!('IntersectionObserver' in window)){ imgs.forEach(loadImg); return; }
  if(!imgIO) imgIO = new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting){ imgIO.unobserve(en.target); loadImg(en.target); } }), {rootMargin:'400px 0px'});
  imgs.forEach(img=>imgIO.observe(img));
}
function unavailable(img){
  const s = document.createElement('span'); s.className = 'pnone'; s.textContent = 'Photo Unavailable';
  img.replaceWith(s);
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
  root.querySelectorAll('[data-pc]').forEach(b=>b.addEventListener('click', ()=>{ pf.cat = b.dataset.pc; pf.limit = GALLERY_PAGE; repaintPhotos(root, st); }));
  const q = root.querySelector('#phq'); let t = 0;
  if(q) q.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=>{ pf.q = q.value; pf.limit = GALLERY_PAGE; repaintPhotos(root, st, true); }, 200); });
  [['#phWhen','when'], ['#phAuthor','author'], ['#phBrand','brand'], ['#phProg','prog'], ['#phSrc','src']].forEach(([sel, k])=>{ const s = root.querySelector(sel); if(s) s.addEventListener('change', ()=>{ pf[k] = s.value; pf.limit = GALLERY_PAGE; repaintPhotos(root, st); }); });
  const more = root.querySelector('#phMore'); if(more) more.addEventListener('click', ()=>{ pf.limit += GALLERY_PAGE; const y = window.scrollY; repaintPhotos(root, st); window.scrollTo(0, y); });
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
  root.querySelectorAll('[data-rec]').forEach(b=>b.addEventListener('click', ()=>viewer(st, b.dataset.rec)));
  // "View Imported Photos" opens the gallery already filtered to the imports
  root.querySelectorAll('[data-src-filter]').forEach(a=>a.addEventListener('click', ()=>{ pf.src = a.dataset.srcFilter; pf.limit = GALLERY_PAGE;
    const pa = document.getElementById('actPhotosAll'); if(pa) repaintPhotos(pa, st); }));
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
  root.querySelectorAll('[data-rec]').forEach(b=>b.addEventListener('click', ()=>viewer(st, b.dataset.rec)));
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

/* ---------------- RECORD VIEWER (Google Photos' information panel: a large image,
   then date, caption and storage status in a separate panel -- never printed on
   the image). Historical evidence reads "Last observed": a photo shows what was
   there on that date, not that it is still there today. ---------------- */
function lineHtml(l){
  const what = [l.brand || l.brand_family, l.package].filter(Boolean).join(' · ') || 'Product not named';
  const own = l.ownership_source ? ` <span class="lv-own">iSellBeer: ${E(l.ownership_source)}${l.ownership_corrected ? (l.ownership_corrected===l.ownership_source ? ' · Tap Tracker agrees' : ` · Tap Tracker: ${E(l.ownership_corrected)}`) : ' · not audited'}</span>` : '';
  return `<li><span class="lv-w">${E(what)}</span><span class="lv-q">${E(M().qtyText(l.quantity, l.quantity_unit))}</span>${own}</li>`;
}
function viewer(st, key, idx){
  const r = st.records.find(x=>x.key===key); if(!r) return;
  idx = Math.min(idx||0, Math.max(0, r.photos.length-1));
  const ph = r.photos[idx];
  const mineHub = r.source==='hub' && !r.legacy && ctx.me && r.author_email && String(r.author_email).toLowerCase()===String(ctx.me.email||'').toLowerCase();
  const myEmail = String((ctx.me||{}).email||'').toLowerCase();
  const mineLegacy = r.legacy && !!r.author_email && !!myEmail && String(r.author_email).toLowerCase()===myEmail;
  // same name, different sign-in: say why there is no Remove instead of offering one that cannot work
  const admin = !!st.admin && !ctx.readOnly;         // never in preview: preview shows what the rep sees
  const adminRec = admin && !r.legacy && !mineHub;     // someone else's record, or an iSellBeer import
  const adminPhoto = admin && r.legacy && !mineLegacy;
  const otherSignIn = !admin && r.legacy && !mineLegacy && r.author_email && (r.author_name||'').toLowerCase()===String((ctx.me||{}).name||'').toLowerCase();
  const hist = r.source==='isellbeer' || (r.observed_at && Date.now() - new Date(r.observed_at) > 2*86400000);
  const prog = r.program_id ? ctx.progName(r.program_id) : '';
  const isb = [r.isb_promotion_type, r.isb_theme, r.isb_elements].filter(Boolean).join(' · ');
  const title = `${E(catName(r.category))}${r.subtype ? ' · '+E(M().SUB_LABEL[r.subtype]||r.subtype) : ''}`;
  const w = sheet(title, `
    <div class="rv-img" id="rvImg">${ph ? `<img alt="${title} photo ${idx+1} of ${r.photos.length}" ${thumbAttr(ph)}>` : `<span class="pnone">No photo on this record</span>`}</div>
    ${ph ? `<p class="rv-hint">${r.photos.length > 1 ? `Photo ${idx+1} of ${r.photos.length} · ` : ''}Tap the photo to zoom${ph.photo_kind==='report_page' ? ' · iSellBeer report page: the printed frame around a small copy of the photo' : ''}</p>` : ''}
    ${r.photos.length > 1 ? `<div class="rv-strip">${r.photos.map((p, i)=>`<button type="button" class="rv-th${i===idx?' on':''}" data-ri="${i}" aria-label="Photo ${i+1}"><img alt="" ${thumbAttr(p)}></button>`).join('')}</div>` : ''}
    ${r.caption ? `<p class="pv-cap">${E(r.caption)}</p>` : ''}
    <dl class="pv-meta">
      <dt>Account</dt><dd>${E(ctx.name)} · #${E(ctx.n)}</dd>
      <dt>${hist ? 'Last Observed' : 'Observed'}</dt><dd>${r.observed_at ? E(fmtWhen(r.observed_at)) : 'Not recorded'}${hist ? '<span class="pv-sub">A photo shows what was there on that date, not that it is still there today.</span>' : ''}</dd>
      ${r.source==='isellbeer' ? `<dt>Photo Taker</dt><dd>${E(r.source_author||'Not in the export')}${r.source_author_role ? ' · '+E(r.source_author_role) : ''}</dd><dt>Imported</dt><dd>${E(fmtWhen(r.created_at))}${r.author_name ? ' by '+E(r.author_name) : ''}</dd>`
        : `<dt>Recorded By</dt><dd>${E(r.author_name||'—')}</dd><dt>Saved</dt><dd>${E(fmtWhen(r.created_at))}</dd>`}
      <dt>Source</dt><dd>${E(M().SOURCE_LABEL[r.source]||r.source)}${isb ? `<span class="pv-sub">iSellBeer: ${E(isb)}</span>` : ''}</dd>
      ${r.location ? `<dt>Location</dt><dd>${E(r.location)}</dd>` : ''}
      ${(r.brands||[]).length ? `<dt>Brands</dt><dd>${E(r.brands.join(', '))}</dd>` : ''}
      ${prog ? `<dt>Program</dt><dd>${E(prog)}<span class="pv-sub">Evidence only. Program credit still comes from the tracker’s sales data.</span></dd>` : ''}
      <dt>Status</dt><dd>Saved${ph && ph.photo_status==='link' ? ' · photo is a link to iSellBeer' : ''}</dd>
      ${ph && ph.captured_at ? `<dt>Photo Taken</dt><dd>${E(fmtWhen(ph.captured_at))}</dd>` : ''}
    </dl>
    ${r.lines.length ? `<h3 class="rv-h">${r.category==='tap_handle' ? 'Tap Lines' : 'Products'} · ${r.lines.length}</h3><ul class="rv-lines">${r.lines.map(lineHtml).join('')}</ul>` : ''}
    <div class="sheet-b">
      ${ph && ph.source_url ? `<a class="btn outline" href="${E(ph.source_url)}" target="_blank" rel="noopener noreferrer">Open in iSellBeer ↗</a>` : ''}
      ${!ctx.readOnly && mineHub ? `<button type="button" class="btn outline" id="rvEdit">Edit Details</button><button type="button" class="btn outline danger" id="rvDel">Remove</button>` : ''}
      ${!ctx.readOnly && mineLegacy ? `<button type="button" class="btn outline" id="pvEdit">Edit Labels</button><button type="button" class="btn outline danger" id="pvDel">Remove Photo</button>` : ''}
      ${adminRec ? `<button type="button" class="btn outline danger" id="rvDel" data-admin="1">Remove (Photo Admin)</button>` : ''}
      ${adminPhoto ? `<button type="button" class="btn outline danger" id="pvDel" data-admin="1">Remove Photo (Photo Admin)</button>` : ''}
      ${!ctx.readOnly && otherSignIn ? `<p class="pv-sub">Saved by another sign-in under the name ${E(r.author_name)}. Only that sign-in can edit or remove it.</p>` : ''}
    </div>`);
  hydrateImages(w);
  const box = w.querySelector('#rvImg'); if(box) box.addEventListener('click', ()=>box.classList.toggle('zoom'));
  w.querySelectorAll('[data-ri]').forEach(b=>b.addEventListener('click', ()=>viewer(st, key, +b.dataset.ri)));
  const ed = w.querySelector('#rvEdit'); if(ed) ed.addEventListener('click', ()=>editRecord(st, r));
  const rd = w.querySelector('#rvDel'); if(rd) rd.addEventListener('click', async ()=>{
    const who = r.source==='isellbeer' ? 'imported from iSellBeer' : 'saved by '+(r.author_name||'someone else');
    if(!confirm(rd.dataset.admin
      ? `Remove this ${catName(r.category).toLowerCase()} (${who}) and its ${r.photos.length} ${r.photos.length===1?'photo':'photos'} as photo admin? This cannot be undone.${r.source==='isellbeer' ? ' Importing the same iSellBeer file again would bring it back.' : ''}`
      : `Remove this ${catName(r.category).toLowerCase()} and its ${r.photos.length} ${r.photos.length===1?'photo':'photos'} from the account? This cannot be undone.`)) return;
    rd.disabled = true; rd.setAttribute('aria-busy', 'true');
    try{ await deleteRow('merch_records?id=eq.'+encodeURIComponent(r.rid));
      for(const p of r.photos){ let gone = false; try{ gone = await deleteRow('account_photos?id=eq.'+encodeURIComponent(p.id), true); }catch(e){} if(gone && p.storage_path) await removeObject(p.storage_path); }
      closeSheet(); const s2 = await load(ctx.n, true); paint(s2); toast('Removed'); }
    catch(e){ rd.disabled = false; rd.removeAttribute('aria-busy'); toast(e.notRemoved ? e.message : 'Could not remove it: '+(e.message||'error')); }
  });
  const pe = w.querySelector('#pvEdit'); if(pe) pe.addEventListener('click', ()=>relabel(st, r));
  const pd = w.querySelector('#pvDel'); if(pd) pd.addEventListener('click', async ()=>{
    if(!confirm(pd.dataset.admin ? `Remove this photo saved by ${r.author_name||'someone else'} as photo admin? This cannot be undone.` : 'Remove this photo from the account? This cannot be undone.')) return;
    pd.disabled = true; pd.setAttribute('aria-busy', 'true');
    try{ await deleteRow('account_photos?id=eq.'+encodeURIComponent(ph.id)); if(ph.storage_path) await removeObject(ph.storage_path);
      closeSheet(); const s2 = await load(ctx.n, true); paint(s2); toast('Photo removed'); }
    catch(e){ pd.disabled = false; pd.removeAttribute('aria-busy'); toast(e.notRemoved ? e.message : 'Could not remove it: '+(e.message||'error')); }
  });
}
function editRecord(st, r){
  const progs = (ctx.extra && ctx.extra.opps) || [];
  const subs = M().SUBTYPES[r.category] || [];
  const w = sheet('Edit Details', `<p class="pf-acct"><b>${E(ctx.name)}</b> · ${E(catName(r.category))}</p>
    ${subs.length ? `<label class="pf-cap" for="edSub">Kind <span>(optional)</span></label><select id="edSub" class="kdh-field"><option value="">Not specified</option>${subs.map(([k,l])=>`<option value="${k}"${r.subtype===k?' selected':''}>${E(l)}</option>`).join('')}</select>` : ''}
    <label class="pf-cap" for="edCap">Caption <span>(optional)</span></label><input type="text" id="edCap" maxlength="500" value="${E(r.caption||'')}">
    <label class="pf-cap" for="edLoc">Location in the account <span>(optional)</span></label><input type="text" id="edLoc" maxlength="120" value="${E(r.location||'')}" list="capLocs">${locList()}
    <label class="pf-cap" for="edBrands">Brands <span>(optional, separate with commas)</span></label><input type="text" id="edBrands" maxlength="500" value="${E((r.brands||[]).join(', '))}">
    ${progs.length ? `<label class="pf-cap" for="edProg">Program <span>(optional)</span></label><select id="edProg" class="kdh-field"><option value="">None</option>${progs.map(p=>`<option value="${E(p.id)}"${r.program_id===p.id?' selected':''}>${E(p.name)}</option>`).join('')}</select>` : ''}
    <p class="ncomp-msg" id="edMsg" hidden></p>
    <div class="sheet-b"><button type="button" class="btn" id="edCancel">Cancel</button><button type="button" class="btn primary" id="edSave" data-first>Save Details</button></div>`);
  w.querySelector('#edCancel').addEventListener('click', ()=>{ closeSheet(); viewer(st, r.key); });
  w.querySelector('#edSave').addEventListener('click', async ()=>{
    const b = w.querySelector('#edSave'); b.disabled = true; b.setAttribute('aria-busy', 'true');
    const v = id => { const el = w.querySelector(id); return el ? el.value.trim() : ''; };
    const body = {caption: v('#edCap') || null, location: v('#edLoc') || null, brands: v('#edBrands').split(',').map(s=>s.trim()).filter(Boolean).slice(0, 20)};
    if(w.querySelector('#edSub')) body.subtype = v('#edSub') || null;
    if(w.querySelector('#edProg')) body.program_id = v('#edProg') || null;
    try{ { const rows = await rest('merch_records?id=eq.'+encodeURIComponent(r.rid), {method:'PATCH', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify(body)});
      if(!Array.isArray(rows) || !rows.length) throw new Error('Not saved — only the sign-in that saved it can change it.'); }
      closeSheet(); const s2 = await load(ctx.n, true); paint(s2); toast('Details saved'); }
    catch(e){ b.disabled = false; b.removeAttribute('aria-busy'); const m = w.querySelector('#edMsg'); m.hidden = false; m.className = 'ncomp-msg err'; m.textContent = 'Not saved — '+(e.message||'error')+'.'; }
  });
}
// a photo saved before records existed: its own labels, as before
function relabel(st, r){
  const p = r.photos[0];
  const types = M().CATS.map(c=>c.k);
  const w = sheet('Edit Labels', `<p class="pf-acct"><b>${E(ctx.name)}</b> · ${E(catName(p.category))}</p>
    <label class="pf-cap" for="plType">Type</label><select id="plType" class="kdh-field">${!p.category ? '<option value="" selected>Uncategorized</option>' : ''}${types.map(t=>`<option value="${t}"${p.category===t?' selected':''}>${E(M().catLabel(t))}</option>`).join('')}</select>
    <label class="pf-cap" for="plBrand">Brand <span>(optional)</span></label><input type="text" id="plBrand" maxlength="120" value="${E(p.brand||'')}">
    <label class="pf-cap" for="plCap">Caption <span>(optional)</span></label><input type="text" id="plCap" maxlength="500" value="${E(p.caption||'')}">
    <p class="ncomp-msg" id="plMsg" hidden></p>
    <div class="sheet-b"><button type="button" class="btn" id="plCancel">Cancel</button><button type="button" class="btn primary" id="plSave" data-first>Save Labels</button></div>`);
  w.querySelector('#plCancel').addEventListener('click', ()=>{ closeSheet(); viewer(st, r.key); });
  w.querySelector('#plSave').addEventListener('click', async ()=>{
    const b = w.querySelector('#plSave'), msg = w.querySelector('#plMsg'); b.disabled = true; b.setAttribute('aria-busy', 'true');
    const body = {category: w.querySelector('#plType').value || null, caption: w.querySelector('#plCap').value.trim() || null, brand: w.querySelector('#plBrand').value.trim() || null};
    try{ { const rows = await rest('account_photos?id=eq.'+encodeURIComponent(p.id), {method:'PATCH', headers:{'content-type':'application/json', prefer:'return=representation'}, body: JSON.stringify(body)});
      if(!Array.isArray(rows) || !rows.length) throw new Error('Not saved — only the sign-in that saved it can change it.'); }
      closeSheet(); const s2 = await load(ctx.n, true); paint(s2); toast('Labels saved'); }
    catch(e){ b.disabled = false; b.removeAttribute('aria-busy'); msg.hidden = false; msg.className = 'ncomp-msg err';
      msg.textContent = colMissing(e) || denied(e) ? 'Editing labels needs the photo-labels update (supabase/migrations/20261003090000_photo_labels.sql).' : 'Not saved — '+(e.message||'error')+'.'; }
  });
}

/* ---------------- ADD PHOTOS: Choose Type -> Take or Select Photos -> Review and Add
   Details -> Save (Apple Notes' capture: one obvious shutter, thumbnail feedback,
   clear cancel / confirm). Photos come from the device's own camera through an
   image-only file input (capture="environment") -- no in-page video, no playback
   controls, no microphone -- or from the photo library (several at once). The
   account and the signed-in author are attached automatically. ---------------- */
const LOCS = ['Front of store', 'Floor / aisle', 'End cap', 'Cooler', 'Register / checkout', 'Window', 'Bar', 'Back bar', 'Tables', 'Patio', 'Entrance'];
function locList(){ return `<datalist id="capLocs">${LOCS.map(l=>`<option value="${E(l)}">`).join('')}</datalist>`; }
function newDraft(opts){
  opts = opts || {};
  return {id: uuid(), owner: ownerId(), n: String(ctx.n), name: ctx.name, prem: ctx.prem || '', category: opts.category || '', subtype:'', subtype_note:'',
    caption:'', location:'', brands: opts.brands || [], program_id: opts.program_id || '', lines:[], photos:[], state:'draft', err:'', at: Date.now(), fresh:true};
}
function photoFlow(opts){
  if(ctx.readOnly || !cfg()) return;
  const d = newDraft(opts);
  if(d.category) return detailsStep(d);
  typeStep(d);
}
function typeStep(d, showAll){
  const first = M().BY_PREMISE[ctx.prem] || [];
  const list = showAll || !first.length ? M().CATS.map(c=>c.k) : first;
  const rest_ = M().CATS.map(c=>c.k).filter(k=>!list.includes(k));
  const prog = d.program_id ? ctx.progName(d.program_id) : '';
  const w = sheet('Add Photos', `<p class="pf-acct"><b>${E(ctx.name)}</b> · #${E(ctx.n)}${ctx.prem ? ' · '+(ctx.prem==='On' ? 'On-premise' : 'Off-premise') : ''}</p>
    ${prog ? `<p class="pf-prog-note">For <b>${E(prog)}</b></p>` : ''}
    <p class="pf-step">What are you documenting?</p>
    <div class="pf-list">${list.map((k, i)=>{ const c = M().cat(k); return `<button type="button" class="pf-opt${d.category===k?' on':''}" data-type="${k}"${i===0?' data-first':''}><b>${E(c.label)}</b><span>${E(c.hint)}</span></button>`; }).join('')}</div>
    ${rest_.length ? `<button type="button" class="btn ghost" id="pfMore">More Types · ${rest_.map(k=>M().catLabel(k)).join(', ')}</button>` : ''}`, ()=>keepIfStarted(d));
  w.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click', ()=>{ d.category = b.dataset.type; if(!(M().SUBTYPES[d.category]||[]).some(s=>s[0]===d.subtype)) d.subtype = ''; detailsStep(d); }));
  const more = w.querySelector('#pfMore'); if(more) more.addEventListener('click', ()=>typeStep(d, true));
}
// closing the sheet with photos in it keeps a draft (under "Not Yet Saved"); Cancel discards
async function keepIfStarted(d){ if(d.photos.length && d.state!=='saved'){ await IDB.put('records', d); await refreshDrafts(); paint(cache.get(ctx.n) || await load(ctx.n)); toast('Kept on this device under Not Yet Saved'); } }
const maxEdge = cat => (cat==='menu' || cat==='other') ? 3200 : 2560;
async function addFiles(d, files, fromCamera, replaceIdx){
  const out = [];
  for(const f of files){
    const img = await toJpeg(f, maxEdge(d.category));
    const pid = uuid();
    out.push({pid, blob: img.blob, width: img.width, height: img.height, capturedAt: (await exifTime(f)) || (fromCamera ? new Date().toISOString() : null),
      path: String(ctx.n)+'/'+uuid()+'.jpg', uploaded:false, rowSaved:false});
    try{ URL.revokeObjectURL(img.url); }catch(e){}
  }
  if(replaceIdx!=null){ const old = d.photos[replaceIdx]; if(old && old.uploaded && !old.rowSaved) removeObject(old.path); d.photos.splice(replaceIdx, 1, ...out); }
  else d.photos.push(...out);
}
function detailsStep(d){
  const c = M().cat(d.category) || {label:'Photos'};
  const subs = M().SUBTYPES[d.category] || [];
  const progs = (ctx.extra && ctx.extra.opps) || [];
  const fams = (ctx.extra && ctx.extra.families) || [];
  const lineMode = M().LINES[d.category] || '';
  const w = sheet(`Add Photos · ${E(c.label)}`, `
    <p class="pf-acct"><b>${E(ctx.name)}</b> · #${E(ctx.n)} · <b>${E(c.label)}</b> <button type="button" class="linkbtn" id="pfType">Change</button></p>
    <div class="cap-strip" id="capStrip" aria-live="polite"></div>
    <div class="cap-acts">
      <button type="button" class="btn primary cap-shutter" id="capTake">${ICON.photo}<span>Take Photo</span></button>
      <button type="button" class="btn outline" id="capLib">${ICON.library}<span>Choose From Photos</span></button>
    </div>
    <p class="pf-time" id="capErr" role="alert" hidden></p>
    <input type="file" accept="image/*" capture="environment" id="capIn" hidden>
    <input type="file" accept="image/*" multiple id="libIn" hidden>
    <input type="file" accept="image/*" capture="environment" id="retakeIn" hidden>
    ${subs.length ? `<p class="pf-cap">Kind <span>(optional)</span></p><div class="chips cap-sub" role="group" aria-label="Kind">${subs.map(([k,l])=>`<button type="button" class="chip" data-msub="${k}" aria-pressed="${d.subtype===k}">${E(l)}</button>`).join('')}</div>
      <input type="text" id="capSubNote" maxlength="120" placeholder="Describe it briefly" value="${E(d.subtype_note)}"${d.subtype==='other' ? '' : ' hidden'}>` : ''}
    <label class="pf-cap" for="capCap">Caption <span>(optional)</span></label>
    <input type="text" id="capCap" maxlength="500" placeholder="What does this show?" value="${E(d.caption)}">
    <label class="pf-cap" for="capLoc">Location in the account <span>(optional)</span></label>
    <input type="text" id="capLoc" maxlength="120" placeholder="e.g. Front of store" value="${E(d.location)}" list="capLocs">${locList()}
    <p class="pf-cap">Brands <span>(optional)</span></p>
    <div class="tagrow" id="capTags">${d.brands.map((b, i)=>`<span class="tag2">${E(b)}<button type="button" data-untag="${i}" aria-label="Remove ${E(b)}">&times;</button></span>`).join('')}</div>
    <div class="tagadd"><input type="text" id="capBrand" maxlength="120" placeholder="Add a brand" list="capFams"><button type="button" class="btn sm" id="capBrandAdd">Add</button></div>
    <datalist id="capFams">${fams.slice(0, 300).map(f=>`<option value="${E(f)}">`).join('')}</datalist>
    ${progs.length ? `<label class="pf-cap" for="capProg">Program <span>(optional)</span></label><select id="capProg" class="kdh-field"><option value="">None</option>${progs.map(p=>`<option value="${E(p.id)}"${d.program_id===p.id?' selected':''}>${E(p.name)}</option>`).join('')}</select>
      <p class="pf-sub">Saving evidence does not award program credit; credit comes from the tracker’s sales data.</p>` : ''}
    ${lineMode ? `<details class="pf-more"${d.lines.length ? ' open' : ''}><summary>${lineMode==='taps' ? 'Tap Lines' : 'Products & Quantities'} <span>(optional)</span></summary>
      <p class="pf-sub">${lineMode==='taps' ? 'One line per brand on tap, with how many handles.' : 'One line per product or package. A quantity needs its unit — say whether it is cases, bottles, facings or placements.'}</p>
      <div id="capLines"></div><button type="button" class="btn sm" id="capLineAdd">Add ${lineMode==='taps' ? 'Tap Line' : 'Product'}</button></details>` : ''}
    <div class="pf-prog" hidden><div class="pf-bar"><i></i></div><p class="pf-st" role="status"></p></div>
    <div class="sheet-b pf-actions">
      <button type="button" class="btn" id="capCancel">Cancel</button>
      <button type="button" class="btn primary" id="capSave"${d.photos.length ? '' : ' disabled'} data-first>${d.state==='failed' || d.state==='pending' ? 'Retry' : 'Save Photos'}</button>
    </div>`, ()=>keepIfStarted(d));
  const $ = s => w.querySelector(s);
  let t = 0; const persist = () => { clearTimeout(t); t = setTimeout(async ()=>{ if(d.photos.length){ d.at = Date.now(); await IDB.put('records', d); } }, 300); };
  const strip = () => {
    $('#capStrip').innerHTML = d.photos.length ? d.photos.map((p, i)=>`<figure class="cap-th"><img alt="Photo ${i+1}" src="${blobUrlOf(d.id+':'+p.pid, p.blob)}">
      <figcaption>${p.rowSaved ? '<span class="cap-saved">Saved</span>' : `<button type="button" data-retake="${i}">Retake</button><button type="button" data-rm="${i}">Remove</button>`}</figcaption></figure>`).join('')
      + `<p class="cap-n">${d.photos.length} ${d.photos.length===1?'photo':'photos'} · tap Take Photo or Choose From Photos to add another</p>`
      : `<p class="cap-empty">No photos yet. Take a photo or choose from your photos — you can add several.</p>`;
    $('#capSave').disabled = !d.photos.length;
    w.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click', ()=>{ const i = +b.dataset.rm; const p = d.photos[i]; if(p.uploaded) removeObject(p.path); d.photos.splice(i, 1); strip(); persist(); if(!d.photos.length) IDB.del('records', d.id); }));
    w.querySelectorAll('[data-retake]').forEach(b=>b.addEventListener('click', ()=>{ retakeIdx = +b.dataset.retake; $('#retakeIn').click(); }));
  };
  let retakeIdx = null;
  const err = m => { const e = $('#capErr'); e.hidden = !m; e.textContent = m || ''; };
  const take = async (inp, fromCamera, replace) => {
    const files = Array.from(inp.files || []); inp.value = ''; if(!files.length) return;
    err(''); $('#capSave').disabled = true;
    try{ await addFiles(d, files, fromCamera, replace); }catch(e){ err(e.message || 'That photo could not be opened.'); }
    strip(); persist();
  };
  $('#capIn').addEventListener('change', ()=>take($('#capIn'), true));
  $('#libIn').addEventListener('change', ()=>take($('#libIn'), false));
  $('#retakeIn').addEventListener('change', ()=>{ const i = retakeIdx; retakeIdx = null; take($('#retakeIn'), true, i); });
  $('#capTake').addEventListener('click', ()=>$('#capIn').click());
  $('#capLib').addEventListener('click', ()=>$('#libIn').click());
  $('#pfType').addEventListener('click', ()=>{ readForm(); typeStep(d, true); });
  w.querySelectorAll('[data-msub]').forEach(b=>b.addEventListener('click', ()=>{ d.subtype = d.subtype===b.dataset.msub ? '' : b.dataset.msub;
    w.querySelectorAll('[data-msub]').forEach(x=>x.setAttribute('aria-pressed', String(x.dataset.msub===d.subtype))); const n = $('#capSubNote'); if(n) n.hidden = d.subtype!=='other'; persist(); }));
  const tags = () => { $('#capTags').innerHTML = d.brands.map((b, i)=>`<span class="tag2">${E(b)}<button type="button" data-untag="${i}" aria-label="Remove ${E(b)}">&times;</button></span>`).join('');
    w.querySelectorAll('[data-untag]').forEach(b=>b.addEventListener('click', ()=>{ d.brands.splice(+b.dataset.untag, 1); tags(); persist(); })); };
  tags();
  const addTag = () => { const v = $('#capBrand').value.trim(); if(v && !d.brands.includes(v) && d.brands.length < 20){ d.brands.push(v); tags(); persist(); } $('#capBrand').value = ''; };
  $('#capBrandAdd').addEventListener('click', addTag);
  $('#capBrand').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addTag(); } });
  // product / tap lines
  const lines = () => {
    const box = $('#capLines'); if(!box) return;
    box.innerHTML = d.lines.map((l, i)=>`<div class="cap-line" data-li="${i}">
      <input type="text" data-lf="brand" maxlength="120" placeholder="Brand or product" value="${E(l.brand||'')}" list="capFams" aria-label="Brand or product, line ${i+1}">
      ${lineMode==='taps' ? '' : `<input type="text" data-lf="package" maxlength="60" placeholder="Package (e.g. 24 PK)" value="${E(l.package||'')}" aria-label="Package, line ${i+1}">`}
      <input type="number" data-lf="quantity" min="0" step="1" inputmode="numeric" placeholder="${lineMode==='taps' ? 'Taps' : 'Qty'}" value="${E(l.quantity==null ? '' : l.quantity)}" aria-label="Quantity, line ${i+1}">
      ${lineMode==='taps' ? '<span class="cap-unit">taps</span>' : `<select data-lf="unit" aria-label="What the quantity counts, line ${i+1}"><option value="">Unit…</option>${M().UNITS.filter(u=>u[0]!=='taps' && u[0]!=='unspecified').map(([k,lab])=>`<option value="${k}"${l.unit===k?' selected':''}>${E(lab)}</option>`).join('')}</select>`}
      <button type="button" class="cap-lx" data-lrm="${i}" aria-label="Remove line ${i+1}">&times;</button></div>`).join('');
    box.querySelectorAll('[data-lf]').forEach(inp=>inp.addEventListener(inp.tagName==='SELECT' ? 'change' : 'input', ()=>{ const i = +inp.closest('[data-li]').dataset.li; d.lines[i][inp.dataset.lf] = inp.value; persist(); }));
    box.querySelectorAll('[data-lrm]').forEach(b=>b.addEventListener('click', ()=>{ d.lines.splice(+b.dataset.lrm, 1); lines(); persist(); }));
  };
  const la = $('#capLineAdd'); if(la) la.addEventListener('click', ()=>{ d.lines.push(lineMode==='taps' ? {brand:'', quantity:'', unit:'taps'} : {brand:'', package:'', quantity:'', unit:''}); lines(); persist(); });
  lines();
  const readForm = () => { d.caption = $('#capCap').value.trim(); d.location = $('#capLoc').value.trim(); const n = $('#capSubNote'); d.subtype_note = n ? n.value.trim() : ''; const p = $('#capProg'); if(p) d.program_id = p.value; };
  ['#capCap', '#capLoc', '#capSubNote'].forEach(s=>{ const el = $(s); if(el) el.addEventListener('input', ()=>{ readForm(); persist(); }); });
  const ps = $('#capProg'); if(ps) ps.addEventListener('change', ()=>{ readForm(); persist(); });
  $('#capCancel').addEventListener('click', async ()=>{
    if(d.photos.some(p=>!p.rowSaved) && !confirm('Discard these photos? They have not been saved to the account.')) return;
    w._noKeep = true; await discardDraft(d); closeSheet(); paint(cache.get(ctx.n) || await load(ctx.n));
  });
  $('#capSave').addEventListener('click', async ()=>{
    readForm();
    if(!d.photos.length){ err('Add at least one photo.'); return; }
    if(d.subtype==='other' && !d.subtype_note){ err('Describe the activation in a few words (Other).'); $('#capSubNote').focus(); return; }
    const bad = d.lines.findIndex(l=>l.quantity!=='' && l.quantity!=null && lineMode!=='taps' && !l.unit);
    if(bad >= 0){ err(`Line ${bad+1}: choose what the quantity counts (cases, bottles, facings…).`); return; }
    err('');
    const prog = w.querySelector('.pf-prog'), bar = w.querySelector('.pf-bar i'), stx = w.querySelector('.pf-st');
    const btns = w.querySelectorAll('.sheet-b button, .cap-acts button'); btns.forEach(b=>b.disabled = true);
    const save = $('#capSave'); save.setAttribute('aria-busy', 'true');
    prog.hidden = false; prog.classList.remove('err'); bar.style.width = '0%';
    d.fresh = false;
    const kept = await IDB.put('records', d);
    stx.innerHTML = stateChip('uploading', '0%');
    const ok = await uploadRecord(d, f=>{ const pct = Math.round(f*100); bar.style.width = pct+'%'; stx.innerHTML = stateChip('uploading', pct+'%'); });
    if(ok){
      d.state = 'saved'; bar.style.width = '100%'; stx.innerHTML = stateChip('saved');
      const s2 = await load(ctx.n, true); await refreshDrafts(); paint(s2); if(ctx.onChange) ctx.onChange(s2);
      setTimeout(()=>{ w._noKeep = true; closeSheet(); toast(`${c.label} saved to ${ctx.name} · ${d.photos.length} ${d.photos.length===1?'photo':'photos'}`); }, 500);
      return;
    }
    prog.classList.add('err'); save.removeAttribute('aria-busy');
    stx.innerHTML = stateChip(d.state, d.err) + `<br><span class="dwhy">${kept ? 'Everything is kept on this device under “Not Yet Saved” — retry now or later.' : 'This browser could not keep a copy on the device. Keep this window open and retry.'}</span>`;
    btns.forEach(b=>b.disabled = false); save.textContent = 'Retry';
    if(kept){ await refreshDrafts(); paint(cache.get(ctx.n) || await load(ctx.n)); }
  });
  strip();
}

// drafts for the whole device: /login/ "Switch account" calls this so the next person sees none
async function forgetDrafts(){
  try{ Object.keys(localStorage).filter(k=>k.indexOf('kdh_draft:')===0).forEach(k=>localStorage.removeItem(k)); }catch(e){}
  try{ if(window.indexedDB) indexedDB.deleteDatabase('kdh-drafts'); }catch(e){}
}
window.KdhActivity = {attach, load, openComposer, photoFlow, capture: photoFlow, forgetDrafts, _exifTime: exifTime, _cats: CATS, _events: ()=>ctx ? events(cache.get(ctx.n) || {notes:[], photos:[], records:[]}) : []};
})();
