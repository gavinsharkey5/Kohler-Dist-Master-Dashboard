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
  + 'merch_lines(line_no,supplier,brand_family,brand,package,product_num,quantity,quantity_unit,ownership_source,ownership_corrected,ownership_rule,source_line_ref,attrs,consumer_price),merch_record_photos(ord,photo_id)';
// before 20261005160000_capture_items.sql is run the two item columns do not exist yet
const REC_COLS_OLD = REC_COLS.replace(',product_num', '').replace(',attrs,consumer_price', '');
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
      .catch(e=>{ if(colMissing(e) || e.status===400) return rest('merch_records?select='+REC_COLS_OLD+'&customer_num=eq.'+encodeURIComponent(n)+'&order=observed_at.desc.nullslast&limit=300'); throw e; })
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
const catOne = c => { const x = window.KdhMerch && window.KdhMerch.cat(c); return x ? (x.one || x.label) : catName(c); };

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
    const thumbs = r.photos.slice(0, 3).map(p=>`<button type="button" class="act-thumb" data-rec="${E(r.key)}" aria-label="Open the ${E(catName(r.category))} photos"><img alt="" ${thumbAttr(p)}></button>`).join('');
    const meta = `<p class="act-m">${E(recAuthor(r))} · ${hist ? 'Last observed ' : (r.observed_at ? 'Taken ' : 'Saved ')}${E(fmtWhen(r.observed_at || r.created_at))}${hist ? ' · Imported From iSellBeer' : ''}</p>`;
    // a record captured in the Hub reads as its items (2026-10-05): "Tap Handles · Main Bar", the photo,
    // one line per item (3 shown, the rest folded), tap totals, who and when
    if(!hist && r.lines.length){
      const sp = M().ITEMS[r.category] || {}, taps = r.category==='tap_handle';
      const noun = sp.noun==='SKU' ? ['SKU', 'SKUs'] : sp.noun==='Brand' ? ['brand', 'brands'] : ['placement', 'placements'];
      const head = `${E(catOne(r.category))}${r.location ? ' · '+E(r.location) : ''}${!taps ? ` · <span class="act-p">${r.lines.length} ${r.lines.length===1 ? noun[0] : noun[1]}</span>` : ''}`;
      const row = l => `<li class="ai"><span class="ai-n">${E(l.brand || l.brand_family || 'Not named')}${taps && l.ownership_source ? ` <i class="ai-own own-${(l.ownership_corrected||l.ownership_source)==='US'?'us':'them'}">${OWN_WORD[l.ownership_corrected||l.ownership_source]}</i>` : ''}</span>
        <span class="ai-v">${E(taps ? M().qtyText(l.quantity, l.quantity_unit) : M().itemText(r.category, l))}</span></li>`;
      const first = r.lines.slice(0, 3), rest = r.lines.slice(3);
      const tot = taps ? (()=>{ const n = v => r.lines.filter(l=>(l.ownership_corrected||l.ownership_source)===v).reduce((a, l)=>a + (l.quantity==null ? 1 : +l.quantity||0), 0);
        const all = r.lines.reduce((a, l)=>a + (l.quantity==null ? 1 : +l.quantity||0), 0); return `<p class="ai-tot">${all} ${all===1?'tap':'taps'} · ${n('US')} Kohler · ${n('THEM')} competitor</p>`; })() : '';
      return `<li class="act k-photo" data-ev="${E(e.id)}"><span class="act-ic">${ICON.photo}</span><div class="act-b">
        <p class="act-h"><b>${head}</b></p>
        ${thumbs ? `<div class="act-thumbs">${thumbs}${r.photos.length > 3 ? `<span class="act-more">+${r.photos.length-3}</span>` : ''}</div>` : ''}
        <ul class="ai-list">${first.map(row).join('')}</ul>
        ${rest.length ? `<details class="act-det"><summary>${rest.length} more</summary><ul class="ai-list">${rest.map(row).join('')}</ul></details>` : ''}
        ${tot}${r.caption ? `<p class="act-t">${E(r.caption)}</p>` : ''}${meta}</div></li>`;
    }
    const sub = r.subtype ? ' · '+(M().SUB_LABEL[r.subtype]||r.subtype) : '';
    const brands = (r.brands||[]).length ? r.brands : Array.from(new Set(r.lines.map(l=>l.brand).filter(Boolean)));
    return `<li class="act k-photo" data-ev="${E(e.id)}"><span class="act-ic">${ICON.photo}</span><div class="act-b">
      <p class="act-h"><b>${E(catName(r.category))}${E(sub)}</b>${brands.length ? ` <span class="act-p">${E(brands.slice(0,3).join(', '))}${brands.length>3 ? ' +'+(brands.length-3) : ''}</span>` : ''}</p>
      ${r.caption ? `<p class="act-t">${E(r.caption)}</p>` : ''}
      ${thumbs ? `<div class="act-thumbs">${thumbs}${r.photos.length > 3 ? `<span class="act-more">+${r.photos.length-3}</span>` : ''}</div>` : ''}
      ${r.lines.length ? `<details class="act-det"><summary>${r.lines.length} ${r.category==='tap_handle' ? (r.lines.length===1?'tap line':'tap lines') : (r.lines.length===1?'product line':'product lines')}${ownSummary(r.lines)} · ${r.photos.length} ${r.photos.length===1?'photo':'photos'}</summary><div class="act-dbody"><ul class="rv-lines">${r.lines.map(l=>lineHtml(l, r.category)).join('')}</ul></div></details>` : ''}
      ${meta}</div></li>`;
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
    const lines = (d.lines||[]).filter(l=>l.brand || l.product_num || l.package || (l.quantity!=='' && l.quantity!=null)).map(l=>({brand:l.brand||'', package:l.package||l.pkg||'', product_num:l.product_num||'',
      supplier: l.sup || '', attrs: l.attrs && Object.keys(l.attrs).length ? l.attrs : null,
      consumer_price: l.price!=='' && l.price!=null && /^\d{1,4}(\.\d{1,2})?$/.test(String(l.price)) ? Number(l.price).toFixed(2) : null,
      brand_family: l.fam || '', ownership_source: l.own==='US' || l.own==='THEM' ? l.own : '', ownership_rule: (l.own==='US' || l.own==='THEM') ? (l.ownRule || 'rep') : '',
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
function sheet(title, body, onClose, opts){
  opts = opts || {};
  closeSheet();
  const wrap = document.createElement('div'); wrap.className = 'asheet-wrap'; wrap.id = 'asheet';
  wrap.innerHTML = `<div class="asheet${opts.foot ? ' has-foot' : ''}${opts.cls ? ' '+opts.cls : ''}" role="dialog" aria-modal="true" aria-labelledby="asheetT"><div class="asheet-h"><div class="asheet-ht"><h2 id="asheetT">${title}</h2>${opts.sub ? `<p class="asheet-sub">${opts.sub}</p>` : ''}</div><button type="button" class="asheet-x" aria-label="Close">&times;</button></div><div class="asheet-b">${body}</div>${opts.foot ? `<div class="asheet-f">${opts.foot}</div>` : ''}</div>`;
  document.body.appendChild(wrap);
  document.documentElement.classList.add('asheet-open');
  const close = ()=>{ closeSheet(); if(onClose) onClose(); };
  wrap.querySelector('.asheet-x').addEventListener('click', close);
  wrap.addEventListener('click', e=>{ if(e.target===wrap) close(); });
  wrap._esc = e=>{ if(e.key==='Escape') close(); }; document.addEventListener('keydown', wrap._esc);
  // phone keyboard (2026-10-05): the sheet follows the VISIBLE viewport, so the footer (Save) sits above
  // the keyboard and the field being typed in is scrolled into view, never trapped behind it
  const vv = window.visualViewport;
  if(vv){ const fit = ()=>{ wrap.style.height = vv.height+'px'; wrap.style.top = vv.offsetTop+'px'; };
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    wrap._stop = ()=>{ vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }; }
  wrap.addEventListener('focusin', e=>{ const t = e.target; if(t && t.matches && t.matches('input, textarea')) setTimeout(()=>{ try{ t.scrollIntoView({block:'center', behavior:'smooth'}); }catch(x){} }, 280); });
  if(!opts.noFocus) setTimeout(()=>{ const f = wrap.querySelector('[data-first]') || wrap.querySelector('button, input, textarea'); if(f) f.focus({preventScroll:true}); }, 30);
  return wrap;
}
function closeSheet(){ const w = document.getElementById('asheet'); if(w){ document.removeEventListener('keydown', w._esc); if(w._stop) w._stop(); w.remove(); } document.documentElement.classList.remove('asheet-open'); }

/* ---------------- RECORD VIEWER (Google Photos' information panel: a large image,
   then date, caption and storage status in a separate panel -- never printed on
   the image). Historical evidence reads "Last observed": a photo shows what was
   there on that date, not that it is still there today. ---------------- */
/* ---------------- TAP LINES: OURS vs THEIRS (2026-10-05). The label comes from
   Kohler's territory rulebook (shared/data/tap-rules.json, built from the same
   workbook and steps as the Tap Tracker audit -- build_tap_rules.py; checked
   equal on all 6,870 surveyed taps). Brand -> Encompass brand family -> the
   family's ruling in this account's distribution area. Only a brand the
   rulebook does not cover asks the rep; that answer is saved as the rep's call. ---------------- */
let TAP_RULES = null;
function tapRules(){
  if(!TAP_RULES) TAP_RULES = fetch(new URL('../shared/data/tap-rules.json', location.href), {cache:'force-cache'})
    .then(r=>r.ok ? r.json() : null).then(j=>j ? Object.assign(j, {by:new Map(j.brands.map(([b, f])=>[b.toUpperCase(), f]))}) : null).catch(()=>null);
  return TAP_RULES;
}
function tapLabel(R, brand, area){
  const b = String(brand||'').trim(); if(!b) return null;
  if(/\(IN-HOUSE\)/i.test(b)) return {own:'US', why:'In-house brand'};
  if(!R) return {own:'', why:'The territory list did not load'};
  const f = R.by.get(b.toUpperCase());
  if(f==null) return {own:'', why:'Not in the territory list'};
  const fam = R.families[f];
  if(/^no encompass match$/i.test(fam)) return {own:'THEM', why:'Kohler doesn’t carry this brand'};
  if(/^not mapped$/i.test(fam)) return {own:'', why:'Not in the territory list'};
  const v = (R.master[String(f)]||{})[String(area||'').toUpperCase()];
  if(v) return {own:v, fam, why: v==='US' ? `${fam} is ours in ${area}` : `${fam} is not ours in ${area}`};
  return {own:'', fam, why: area ? `No territory ruling for ${fam} in ${area}` : 'This account has no distribution area on file'};
}
const OWN_WORD = {US:'Ours', THEM:'Theirs'};
// "· 5 ours · 3 theirs" (tap handles, counted from the lines' quantities when given)
function ownSummary(lines){
  const n = v => lines.filter(l=>(l.ownership_corrected || l.ownership_source)===v).reduce((a, l)=>a + (l.quantity==null ? 1 : Number(l.quantity)||0), 0);
  const us = n('US'), them = n('THEM'); return us || them ? ` · ${us} ours · ${them} theirs` : '';
}
function lineHtml(l, cat){
  const what = [l.brand || l.brand_family, l.package].filter(Boolean).join(' · ') || 'Product not named';
  // a structured item (2026-10-05): its own fields in one line ("Shelf · Eye Level · 4 facings · $19.99")
  const item = (l.attrs && Object.keys(l.attrs).length) || l.consumer_price != null ? M().itemText(cat, l) : '';
  if(l.ownership_rule==='territory' || l.ownership_rule==='rep')
    return `<li><span class="lv-w">${E(what)}</span><span class="lv-q">${E(M().qtyText(l.quantity, l.quantity_unit))}</span> <span class="lv-own own-${l.ownership_source==='US'?'us':'them'}">${OWN_WORD[l.ownership_source]||''} · ${l.ownership_rule==='territory' ? 'territory list' : 'rep’s call'}</span></li>`;
  if(item) return `<li><span class="lv-w">${E(l.brand || l.brand_family || 'Not named')}</span><span class="lv-q">${E(item)}</span></li>`;
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
    ${r.lines.length ? `<h3 class="rv-h">${r.category==='tap_handle' ? 'Taps' : (M().ITEMS[r.category]||{}).noun==='SKU' ? 'SKUs' : 'Items'} · ${r.lines.length}</h3><ul class="rv-lines">${r.lines.map(l=>lineHtml(l, r.category)).join('')}</ul>` : ''}
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
const LOCS = ['Front of store', 'Floor / aisle', 'End cap', 'Cooler', 'Register / checkout', 'Window', 'Main Bar', 'Back Bar', 'Tables', 'Patio', 'Entrance'];
function locList(){ return `<datalist id="capLocs">${LOCS.map(l=>`<option value="${E(l)}">`).join('')}</datalist>`; }
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

/* ---------------- ADD PHOTOS, REDESIGNED FOR THE PHONE (2026-10-05) ----------------
   Gavin's brief: the selected type decides the form. Type -> photo -> only that
   type's fields -> Save. One record per photo set; what the photo shows is a list
   of ITEMS (shared/merch-types.js ITEMS: a POD's SKU + POD type + shelf + facings +
   price; a sticker's brand + type + cooler + placement; a window's brand + material
   + window + theme; a menu placement's brand / SKU + placement + menu + price +
   promotion; a tap's brand + handles, Ours / Theirs derived from the territory
   list). Nothing is asked twice: no generic Caption / Brands / Program / Location /
   Products block -- the record's brand tags are derived from the items, the note is
   an optional "Add Note", a program comes only from Add Evidence on a program card.
   Fields appear one decision at a time; a finished item folds into one line. The
   sheet header is "Add <type>" + the account; Cancel / Save sit in a footer that
   stays above the phone keyboard. Photos still come from the device's own camera
   (an image-only file input, capture="environment") or the library; account,
   author, time and premise are attached automatically. Drafts, retry and
   duplicate-proof saving are unchanged (uploadRecord). */
const TICON = {
  display:'<path d="M4 20h16M6 20V9h12v11M9 9V5h6v4"/>',
  pod:'<path d="M4 4h16v16H4zM4 10h16M4 15h16M9 4v6M15 10v5"/>',
  cooler_door:'<path d="M6 3h12v18H6zM15 9v3"/><path d="M9 7h3"/>',
  window:'<path d="M4 4h16v16H4zM12 4v16M4 12h16"/>',
  signage:'<path d="M5 21V4h12l-2 4 2 4H5"/>',
  tap_handle:'<path d="M10 3h4v7h-4zM8 10h8v3a4 4 0 0 1-8 0zM12 17v4"/>',
  menu:'<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/>',
  other:'<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>'
};
const ticon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TICON[k]||TICON.other}</svg>`;
const SVG_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
const SVG_RETAKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
const SVG_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
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
  const w = sheet('What are you documenting?', `
    ${prog ? `<p class="pf-prog-note">For <b>${E(prog)}</b></p>` : ''}
    <div class="pf-list tp-list">${list.map((k, i)=>{ const c = M().cat(k); return `<button type="button" class="pf-opt src tp${d.category===k?' on':''}" data-type="${k}"${i===0?' data-first':''}><span class="tp-ic">${ticon(k)}</span><span><b>${E(c.label)}</b><span>${E(c.hint)}</span></span></button>`; }).join('')}</div>
    ${rest_.length ? `<button type="button" class="btn ghost pf-more-types" id="pfMore">More Types · ${rest_.slice(0,2).map(k=>M().catLabel(k)).join(', ')}${rest_.length>2 ? ` +${rest_.length-2}` : ''}</button>` : ''}`,
    ()=>keepIfStarted(d), {sub: E(ctx.name)});
  w.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click', ()=>{
    const was = d.category; d.category = b.dataset.type;
    if(was && was!==d.category) d.lines = [];          // a different type asks different questions
    detailsStep(d); }));
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

/* ---- search sources: this account's own products first, then Kohler's catalogue, then other
   brands (the territory list's brand names, which include competitors) ---- */
let SRC = null;
function sources(){
  if(SRC && SRC.n===ctx.n) return SRC;
  const ex = ctx.extra || {}, cat = ex.catalog || [], bought = ex.bought || [];
  const brank = new Map(bought.map((num, i)=>[String(num), i]));
  const products = cat.map(r=>{ const b = brank.has(String(r[0]));
    return {kind:'sku', label:r[1], meta:[r[4], r[2]].filter(Boolean).join(' · '), hay:String(r[1]+' '+(r[3]||'')+' '+r[0]).toUpperCase(), rank: b ? 0 : 1, sub: b ? brank.get(String(r[0])) : 0, bought:b,
      val:{brand:r[1], product_num:String(r[0]), fam:r[3]||'', sup:r[2]||'', pkg:r[4]||''}}; });
  const boughtFams = new Set(cat.filter(r=>brank.has(String(r[0]))).map(r=>String(r[3]||'').toUpperCase()));
  const famSeen = new Map();
  cat.forEach(r=>{ const f = r[3]; if(!f) return; const k = f.toUpperCase(); if(!famSeen.has(k)) famSeen.set(k, {kind:'brand', label:f, meta:r[2]||'Kohler brand', hay:k+' '+String(r[2]||'').toUpperCase(),
    rank: boughtFams.has(k) ? 0 : 1, sub:0, bought: boughtFams.has(k), val:{brand:f, fam:f, sup:r[2]||''}}); });
  SRC = {n:ctx.n, products, brands:Array.from(famSeen.values()), others:null};
  return SRC;
}
async function otherBrands(){
  const S = sources(); if(S.others) return S.others;
  const R = await tapRules(); const seen = new Set(S.brands.map(b=>b.label.toUpperCase()));
  S.others = R ? R.brands.filter(([b])=>!seen.has(b.toUpperCase())).map(([b, f])=>({kind:'brand', label:b, meta:/^(no encompass match|not mapped)$/i.test(R.families[f]) ? '' : R.families[f], hay:b.toUpperCase(), rank:2, sub:0,
    val:{brand:b, fam: /^(no encompass match|not mapped)$/i.test(R.families[f]) ? '' : R.families[f]}})) : [];
  return S.others;
}
function rankSearch(list, q, max){
  const toks = String(q||'').trim().toUpperCase().split(/\s+/).filter(Boolean);
  let out = toks.length ? list.filter(x=>toks.every(t=>x.hay.includes(t))) : list.filter(x=>x.bought);
  const t0 = toks[0] || '';
  out.sort((a, b)=>(a.rank - b.rank) || (a.sub - b.sub) || ((a.hay.startsWith(t0) ? 0 : 1) - (b.hay.startsWith(t0) ? 0 : 1)) || (a.label.length - b.label.length));
  return out.slice(0, max);
}
// a full-height search panel over the sheet: type a few letters, tap the result
function pickPanel(w, mode, title, onPick){
  const host = w.querySelector('.asheet');
  const p = document.createElement('div'); p.className = 'cap-search'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', title);
  p.innerHTML = `<div class="cs-h"><button type="button" class="cs-back" aria-label="Back">&lsaquo;</button><label class="cs-in">${SVG_SEARCH}<input type="search" id="csQ" placeholder="${E(title)}" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search"></label></div><div class="cs-list" id="csList" role="listbox" aria-label="Results"></div>`;
  host.appendChild(p);
  const q = p.querySelector('#csQ'), listEl = p.querySelector('#csList');
  let others = null;
  const draw = () => {
    const S = sources(), v = q.value.trim(); let rows = [];
    if(mode==='sku' || mode==='either') rows = rows.concat(rankSearch(S.products, v, 40));
    if(mode==='sku' && v) rows = rows.concat(rankSearch(others || [], v, 15));   // competitor brands (not in Kohler's catalogue)
    if(mode==='brand' || mode==='either' || mode==='tap') rows = rows.concat(rankSearch(S.brands.concat(others || []), v, 40));
    if(mode==='either') rows.sort((a, b)=>(a.rank - b.rank) || (a.kind==='brand' ? -1 : 1));
    const head = !v ? `<p class="cs-cap">${rows.length ? 'Bought at this account' : (mode==='sku' ? 'Type part of the product name' : 'Type part of the brand name')}</p>` : '';
    listEl.innerHTML = head + rows.slice(0, 50).map((r, i)=>`<button type="button" class="cs-row" data-ci="${i}" role="option"><b>${E(r.label)}</b><span>${r.bought ? '<i class="cs-here">Bought here</i>' : ''}${E(r.meta||'')}</span></button>`).join('')
      + (v && !rows.some(r=>r.label.toUpperCase()===v.toUpperCase()) ? `<button type="button" class="cs-row cs-free" data-free="1" role="option"><b>Use “${E(v)}”</b><span>Not in the list</span></button>` : '')
      + (v && !rows.length && !others ? '<p class="cs-cap">Loading more brands…</p>' : '');
    listEl.querySelectorAll('[data-ci]').forEach(b=>b.addEventListener('click', ()=>{ done(rows[+b.dataset.ci].val); }));
    const fr = listEl.querySelector('[data-free]'); if(fr) fr.addEventListener('click', ()=>done({brand:v}));
  };
  const done = val => { p.remove(); onPick(val); };
  p.querySelector('.cs-back').addEventListener('click', ()=>{ p.remove(); onPick(null); });
  q.addEventListener('input', draw);
  draw(); setTimeout(()=>q.focus(), 30);
  otherBrands().then(o=>{ others = o; if(p.isConnected) draw(); });
}

function detailsStep(d){
  const c = M().cat(d.category) || {label:'Photos', one:'Photos'};
  const spec = M().ITEMS[d.category] || M().ITEMS.other;
  const taps = spec.pick==='tap';
  if(taps && d.lines.length) d.lines.forEach(l=>{ if(l.unit!=='taps') l.unit = 'taps'; });
  let editing = d.lines.findIndex(l=>!itemDone(l)); // the item whose fields are open (-1 = none)
  let RULES = null;
  const prog = d.program_id ? ctx.progName(d.program_id) : '';
  const w = sheet(`Add ${E(c.one || c.label)}`, `<div id="capBody"></div>
    <input type="file" accept="image/*" capture="environment" id="capIn" hidden>
    <input type="file" accept="image/*" multiple id="libIn" hidden>
    <input type="file" accept="image/*" capture="environment" id="retakeIn" hidden>`, ()=>keepIfStarted(d),
    {cls:'cap-sheet', noFocus:true, sub:`${E(ctx.name)} · <button type="button" class="linkbtn" id="pfType">Change type</button>`,
     foot:`<p class="cap-msg" id="capErr" role="alert" hidden></p>
       <div class="cap-foot"><button type="button" class="btn" id="capCancel">Cancel</button>
       <button type="button" class="btn primary" id="capSave"><span class="cs-lbl">${d.state==='failed' || d.state==='pending' ? 'Retry' : 'Save'}</span></button></div>`});
  const $ = s => w.querySelector(s);
  let t = 0; const persist = () => { clearTimeout(t); t = setTimeout(async ()=>{ if(d.photos.length){ d.at = Date.now(); await IDB.put('records', d); } }, 300); };
  const err = m => { const e = $('#capErr'); e.hidden = !m; e.textContent = m || ''; };
  function itemDone(l){
    if(!l || !(l.brand || l.product_num)) return false;
    if(taps) return l.own==='US' || l.own==='THEM';
    return (spec.groups||[]).every(g=>!g.req || (l.attrs && l.attrs[g.k]));
  }
  function newItem(){ const a = {}; (spec.groups||[]).forEach(g=>{ if(g.def) a[g.k] = g.def; });
    return taps ? {brand:'', quantity:1, unit:'taps', attrs:{}} : {brand:'', product_num:'', fam:'', sup:'', pkg:'', quantity: spec.qty ? 1 : '', unit: spec.qty || '', price:'', attrs:a}; }
  // ---- render ----
  const photosHtml = () => !d.photos.length
    ? `<div class="cap-first">
        <button type="button" class="btn primary cap-shutter" id="capTake">${ICON.photo}<span>Take Photo</span></button>
        <button type="button" class="btn outline cap-lib" id="capLib">${ICON.library}<span>Choose From Photos</span></button></div>`
    : `<div class="cap-strip" id="capStrip">${d.photos.map((p, i)=>`<figure class="cap-th"><img alt="Photo ${i+1}" src="${blobUrlOf(d.id+':'+p.pid, p.blob)}">
        ${p.rowSaved ? '<span class="cap-saved">Saved</span>' : `<figcaption><button type="button" data-retake="${i}" aria-label="Retake photo ${i+1}">${SVG_RETAKE}</button><button type="button" data-rm="${i}" aria-label="Remove photo ${i+1}">${SVG_TRASH}</button></figcaption>`}</figure>`).join('')}
        <button type="button" class="cap-add" id="capTake" aria-label="Take another photo">${ICON.photo}<span>Photo</span></button>
        <button type="button" class="cap-add" id="capLib" aria-label="Add from your photos">${ICON.library}<span>Library</span></button></div>`;
  const chips = (g, val, i) => `<div class="cchips" role="group" aria-label="${E(g.l)}">${g.o.map(o=>`<button type="button" class="cchip" data-g="${g.k}" data-v="${E(o.k)}"${i!=null ? ` data-i="${i}"` : ''} aria-pressed="${val===o.k}">${E(o.l)}</button>`).join('')}</div>`;
  const stepper = (i, val, unit) => `<div class="cstep" role="group" aria-label="${E(unit)}"><button type="button" data-step="-1" data-i="${i}" aria-label="One fewer"${(+val||0) <= (taps ? 1 : 0) ? ' disabled' : ''}>&minus;</button><output aria-live="polite">${E(val==='' || val==null ? 0 : val)}</output><button type="button" data-step="1" data-i="${i}" aria-label="One more">+</button></div>`;
  const label = l => l.brand || l.fam || 'Not named';
  const ownLine = (l, i) => {
    if(l.ownRule==='territory') return `<span class="own-tag own-${l.own==='US'?'us':'them'}">${OWN_WORD[l.own]}</span><span class="own-why">${E(shortWhy(l.ownWhy))}</span>`;
    return `<span class="own-why">Whose tap?</span><span class="own-pick" role="group" aria-label="Ours or theirs"><button type="button" class="cchip sm" data-ownset="${i}:US" aria-pressed="${l.own==='US'}">Ours</button><button type="button" class="cchip sm" data-ownset="${i}:THEM" aria-pressed="${l.own==='THEM'}">Theirs</button></span>`;
  };
  const shortWhy = why => !why ? '' : /doesn’t carry/.test(why) ? 'Not a Kohler brand' : /is ours in/.test(why) ? 'Kohler · '+String(why).split(' is ours in ')[1] : /is not ours in/.test(why) ? 'Not ours in '+String(why).split(' is not ours in ')[1] : why;
  const tapRows = () => d.lines.map((l, i)=>`<div class="ctap" data-i="${i}">
      <div class="ctap-n"><b>${E(label(l))}</b><span class="ctap-own">${ownLine(l, i)}</span></div>
      ${stepper(i, l.quantity, 'Taps')}
      <button type="button" class="ci-x" data-irm="${i}" aria-label="Remove ${E(label(l))}">&times;</button></div>`).join('');
  const tapTotals = () => {
    if(!d.lines.length) return '';
    const n = v => d.lines.filter(l=>l.own===v).reduce((a, l)=>a + (+l.quantity||0), 0);
    const all = d.lines.reduce((a, l)=>a + (+l.quantity||0), 0), open = d.lines.filter(l=>l.own!=='US' && l.own!=='THEM').length;
    return `<p class="ctot"><b>${all} ${all===1?'tap':'taps'}</b> · ${n('US')} Kohler · ${n('THEM')} competitor${open ? ` · <span class="warn">${open} to answer</span>` : ''}</p>`;
  };
  const itemRow = (l, i) => `<div class="ci" data-i="${i}"><div class="ci-t"><b>${E(label(l))}</b><span>${E(M().itemText(d.category, {attrs:l.attrs, quantity: spec.qty ? (+l.quantity||0) : null, quantity_unit:l.unit, consumer_price: l.price===''||l.price==null ? null : l.price}) || 'Tap Edit to finish')}</span></div>
      <button type="button" class="btn sm ghost" data-iedit="${i}">Edit</button><button type="button" class="ci-x" data-irm="${i}" aria-label="Remove ${E(label(l))}">&times;</button></div>`;
  const editor = (l, i) => {
    const picked = !!(l.brand || l.product_num);
    let html = `<div class="ce" data-i="${i}">`;
    html += picked
      ? `<div class="ce-p"><div><b>${E(label(l))}</b>${l.pkg ? `<span>${E(l.pkg)}</span>` : ''}</div><button type="button" class="linkbtn" data-ipick="${i}">Change</button></div>`
      : `<button type="button" class="ce-pick" data-ipick="${i}">${SVG_SEARCH}<span>Select ${E(spec.noun)}</span></button>`;
    if(picked){
      const gs = spec.groups || []; let open = true;
      gs.forEach(g=>{ if(!open) return;
        html += `<p class="ce-l">${E(g.l)}${g.opt ? ' <span>optional</span>' : ''}</p>${chips(g, (l.attrs||{})[g.k], i)}`;
        if(g.k==='theme' && (l.attrs||{}).theme==='custom') html += `<input type="text" class="ce-in" data-ithemetext="${i}" maxlength="60" placeholder="Theme" value="${E((l.attrs||{}).theme_text||'')}">`;
        if(g.req && !(l.attrs||{})[g.k]) open = false; });     // the next question appears once this one is answered
      if(open){
        if(spec.qty) html += `<p class="ce-l">${spec.qty==='facings' ? 'Facings' : 'Taps'}</p>${stepper(i, l.quantity, spec.qty)}`;
        if(spec.price) html += `<p class="ce-l">Price to Consumer <span>optional</span></p><label class="cmoney"><span>$</span><input type="text" inputmode="decimal" data-iprice="${i}" placeholder="0.00" value="${E(l.price||'')}" aria-label="Price to consumer"></label>`;
        html += `<div class="ce-acts"><button type="button" class="btn primary sm" data-idone="${i}">Done</button></div>`;
      }
    }
    return html + `</div>`;
  };
  function render(focusSel){
    const body = $('#capBody'); const y = body.closest('.asheet-b').scrollTop;
    const rec = spec.rec;
    let h = `<section class="cap-sec cap-photos">${photosHtml()}</section>`;
    if(prog) h += `<p class="cap-prog">For <b>${E(prog)}</b> <button type="button" class="linkbtn" id="capProgX">Remove</button></p>`;
    if(d.photos.length || d.lines.length || d.location){
      if(rec){ const val = d.location; const isOther = val && !rec.o.some(o=>o.k===val && o.k!=='Other');
        h += `<section class="cap-sec"><p class="ce-l">${E(rec.l)}</p><div class="cchips" role="group" aria-label="${E(rec.l)}">${rec.o.map(o=>`<button type="button" class="cchip" data-rec="${E(o.k)}" aria-pressed="${val===o.k || (o.k==='Other' && isOther)}">${E(o.l)}</button>`).join('')}</div>
          ${isOther ? `<input type="text" class="ce-in" id="capRecOther" maxlength="60" placeholder="Where?" value="${E(val==='Other' ? '' : val)}">` : ''}</section>`; }
      if(spec.what) h += `<section class="cap-sec"><p class="ce-l">What is it?</p><input type="text" class="ce-in" id="capWhat" maxlength="120" placeholder="e.g. Tasting, sampling event" value="${E(d.subtype_note)}"></section>`;
      h += `<section class="cap-sec cap-items"><p class="ce-l">${taps ? 'Taps' : spec.what ? 'Brands <span>optional</span>' : (spec.noun==='SKU' ? 'SKUs' : spec.noun==='Brand' ? 'Brands' : 'Placements')}${d.lines.length ? ` <span class="cnum">${d.lines.length}</span>` : ''}</p>`;
      if(taps) h += tapRows() + tapTotals();
      else h += d.lines.map((l, i)=>i===editing ? editor(l, i) : itemRow(l, i)).join('');
      if(!(editing>=0 && !taps)) h += `<button type="button" class="btn outline cap-addi" id="capAddItem">+ ${E(d.lines.length || taps ? spec.add : 'Select '+spec.noun)}</button>`;
      h += `</section>`;
      h += d.caption || d._noteOpen ? `<section class="cap-sec"><p class="ce-l">Note <span>optional</span></p><textarea id="capNote" rows="2" maxlength="500" placeholder="Anything worth knowing">${E(d.caption)}</textarea></section>`
        : `<button type="button" class="linkbtn cap-notebtn" id="capNoteAdd">+ Add Note</button>`;
    } else {
      h += `<p class="cap-hint">Start with a photo. Then ${taps ? 'add the brands on tap' : 'say what it shows'}.</p>`;
    }
    body.innerHTML = h;
    body.closest('.asheet-b').scrollTop = y;
    wire();
    if(focusSel){ const f = w.querySelector(focusSel); if(f){ f.focus({preventScroll:true}); try{ f.scrollIntoView({block:'nearest'}); }catch(e){} } }
  }
  function openPick(i){
    const l = d.lines[i];
    pickPanel(w, spec.pick, spec.pick==='sku' ? 'Search products' : spec.pick==='either' ? 'Search brands or products' : 'Search brands', val=>{
      if(!val){ if(!(l.brand || l.product_num)){ d.lines.splice(i, 1); editing = -1; } render(); return; }
      Object.assign(l, {brand: val.brand || '', product_num: val.product_num || '', fam: val.fam || '', sup: val.sup || '', pkg: val.pkg || ''});
      if(taps){ relabel(l); editing = -1; }
      persist(); render(taps ? null : `[data-i="${i}"] .cchip`);
    });
  }
  function relabel(l){
    const r = tapLabel(RULES, l.brand, ctx.area);
    if(r && r.own && r.why!=='The territory list did not load'){ l.own = r.own; l.ownRule = 'territory'; l.ownWhy = r.why; if(r.fam) l.fam = r.fam; }
    else { if(l.ownRule==='territory') l.own = ''; l.ownRule = l.own ? 'rep' : ''; l.ownWhy = r ? r.why : ''; }
  }
  function closeEditor(){
    if(editing < 0) return true;
    const l = d.lines[editing];
    if(!(l.brand || l.product_num)){ d.lines.splice(editing, 1); editing = -1; return true; }
    const miss = (spec.groups||[]).find(g=>g.req && !(l.attrs||{})[g.k]);
    if(miss){ err(`${label(l)}: choose ${miss.l}.`); return false; }
    if(l.price!=='' && l.price!=null && !/^\d{1,4}(\.\d{1,2})?$/.test(String(l.price))){ err(`${label(l)}: the price should look like 19.99.`); return false; }
    editing = -1; err(''); return true;
  }
  function wire(){
    const tk = $('#capTake'), lb = $('#capLib');
    if(tk) tk.addEventListener('click', ()=>$('#capIn').click());
    if(lb) lb.addEventListener('click', ()=>$('#libIn').click());
    w.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click', ()=>{ const i = +b.dataset.rm; const p = d.photos[i]; if(p.uploaded) removeObject(p.path); d.photos.splice(i, 1); render(); persist(); if(!d.photos.length) IDB.del('records', d.id); }));
    w.querySelectorAll('[data-retake]').forEach(b=>b.addEventListener('click', ()=>{ retakeIdx = +b.dataset.retake; $('#retakeIn').click(); }));
    w.querySelectorAll('[data-rec]').forEach(b=>b.addEventListener('click', ()=>{ d.location = b.dataset.rec; persist(); render(d.location==='Other' ? '#capRecOther' : null); }));
    const ro = $('#capRecOther'); if(ro) ro.addEventListener('input', ()=>{ d.location = ro.value.trim() || 'Other'; persist(); });
    const wh = $('#capWhat'); if(wh) wh.addEventListener('input', ()=>{ d.subtype_note = wh.value.trim(); d.subtype = 'other'; persist(); });
    const nb = $('#capNoteAdd'); if(nb) nb.addEventListener('click', ()=>{ d._noteOpen = true; render('#capNote'); });
    const nt = $('#capNote'); if(nt) nt.addEventListener('input', ()=>{ d.caption = nt.value; persist(); });
    const px = $('#capProgX'); if(px) px.addEventListener('click', ()=>{ d.program_id = ''; persist(); detailsStep(d); });
    const ai = $('#capAddItem'); if(ai) ai.addEventListener('click', ()=>{ if(!closeEditor()){ render(); return; } d.lines.push(newItem()); const i = d.lines.length-1; if(!taps) editing = i; render(); openPick(i); });
    w.querySelectorAll('[data-ipick]').forEach(b=>b.addEventListener('click', ()=>openPick(+b.dataset.ipick)));
    w.querySelectorAll('.cchip[data-g]').forEach(b=>b.addEventListener('click', ()=>{ const l = d.lines[+b.dataset.i]; l.attrs = l.attrs || {};
      const g = b.dataset.g, v = b.dataset.v; l.attrs[g] = l.attrs[g]===v && (spec.groups.find(x=>x.k===g)||{}).opt ? '' : v; if(!l.attrs[g]) delete l.attrs[g];
      persist(); render(`[data-i="${b.dataset.i}"] [data-g="${g}"][data-v="${CSS.escape(v)}"]`); }));
    w.querySelectorAll('[data-ithemetext]').forEach(inp=>inp.addEventListener('input', ()=>{ const l = d.lines[+inp.dataset.ithemetext]; l.attrs.theme_text = inp.value.trim(); persist(); }));
    w.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click', ()=>{ const l = d.lines[+b.dataset.i]; const min = taps ? 1 : 0;
      l.quantity = Math.max(min, Math.min(99, (+l.quantity||0) + (+b.dataset.step))); persist();
      const box = b.closest('.cstep'); box.querySelector('output').textContent = l.quantity; box.querySelector('[data-step="-1"]').disabled = l.quantity <= min;
      if(taps){ const tt = w.querySelector('.ctot'); if(tt) tt.outerHTML = tapTotals(); } }));
    w.querySelectorAll('[data-iprice]').forEach(inp=>inp.addEventListener('input', ()=>{ const v = inp.value.replace(/[^0-9.]/g, ''); if(v!==inp.value) inp.value = v; d.lines[+inp.dataset.iprice].price = v; persist(); }));
    w.querySelectorAll('[data-idone]').forEach(b=>b.addEventListener('click', ()=>{ if(closeEditor()){ persist(); render(); } }));
    w.querySelectorAll('[data-iedit]').forEach(b=>b.addEventListener('click', ()=>{ if(!closeEditor()){ render(); return; } editing = +b.dataset.iedit; render(`[data-i="${editing}"] .cchip`); }));
    w.querySelectorAll('[data-irm]').forEach(b=>b.addEventListener('click', ()=>{ const i = +b.dataset.irm; d.lines.splice(i, 1); if(editing===i) editing = -1; else if(editing > i) editing--; persist(); render(); }));
    w.querySelectorAll('[data-ownset]').forEach(b=>b.addEventListener('click', ()=>{ const [i, v] = b.dataset.ownset.split(':'); const l = d.lines[+i]; l.own = l.own===v ? '' : v; l.ownRule = l.own ? 'rep' : ''; persist(); render(); }));
  }
  let retakeIdx = null;
  const take = async (inp, fromCamera, replace) => {
    const files = Array.from(inp.files || []); inp.value = ''; if(!files.length) return;
    err(''); $('#capSave').disabled = true;
    try{ await addFiles(d, files, fromCamera, replace); }catch(e){ err(e.message || 'That photo could not be opened.'); }
    $('#capSave').disabled = false; render(); persist();
  };
  $('#capIn').addEventListener('change', ()=>take($('#capIn'), true));
  $('#libIn').addEventListener('change', ()=>take($('#libIn'), false));
  $('#retakeIn').addEventListener('change', ()=>{ const i = retakeIdx; retakeIdx = null; take($('#retakeIn'), true, i); });
  $('#pfType').addEventListener('click', ()=>typeStep(d, true));
  $('#capCancel').addEventListener('click', async ()=>{
    if(d.photos.some(p=>!p.rowSaved) && !confirm('Discard this? The photos have not been saved to the account.')) return;
    w._noKeep = true; await discardDraft(d); closeSheet(); paint(cache.get(ctx.n) || await load(ctx.n));
  });
  const saveBtn = $('#capSave'), lbl = saveBtn.querySelector('.cs-lbl');
  saveBtn.addEventListener('click', async ()=>{
    if(saveBtn.getAttribute('aria-busy')==='true') return;          // one save at a time
    if(!d.photos.length){ err('Take or choose a photo first.'); return; }
    if(!closeEditor()){ render(); return; }
    if(spec.rec && spec.rec.req && !d.location){ err(`Choose the ${spec.rec.l.toLowerCase()}.`); return; }
    if(spec.what && !d.subtype_note){ err('Say what it is in a few words.'); const x = $('#capWhat'); if(x) x.focus(); return; }
    if(!spec.what && !d.lines.length){ err(taps ? 'Add the brands on tap.' : `Select at least one ${spec.noun==='Brand or SKU' ? 'brand or product' : spec.noun==='SKU' ? 'SKU' : 'brand'}.`); return; }
    const unl = taps ? d.lines.findIndex(l=>l.own!=='US' && l.own!=='THEM') : -1;
    if(unl >= 0){ err(`${label(d.lines[unl])}: tap Ours or Theirs.`); return; }
    err('');
    if(spec.what) d.subtype = 'other';
    d.brands = Array.from(new Set(d.lines.map(l=>l.fam || l.brand).filter(Boolean))).slice(0, 20);
    d.lines.forEach(l=>{ if(!spec.qty && !taps){ l.quantity = ''; l.unit = ''; } });
    saveBtn.setAttribute('aria-busy', 'true'); $('#capCancel').disabled = true; lbl.textContent = 'Saving…';
    d.fresh = false;
    const kept = await IDB.put('records', d);
    const ok = await uploadRecord(d, f=>{ lbl.textContent = `Saving ${Math.round(f*100)}%`; });
    if(ok){
      d.state = 'saved'; lbl.textContent = 'Saved';
      const s2 = await load(ctx.n, true); await refreshDrafts(); paint(s2); if(ctx.onChange) ctx.onChange(s2);
      w._noKeep = true; closeSheet();
      const n = d.lines.length;
      toast(`${c.one || c.label} saved${n ? ` · ${n} ${n===1 ? 'item' : 'items'}` : ''}`);
      return;
    }
    saveBtn.removeAttribute('aria-busy'); $('#capCancel').disabled = false; lbl.textContent = 'Retry';
    err(`Not saved — ${d.err || 'something went wrong'}. ${kept ? 'Everything is kept on this device; tap Retry now or later.' : 'Keep this screen open and tap Retry.'}`);
    if(kept){ await refreshDrafts(); paint(cache.get(ctx.n) || await load(ctx.n)); }
  });
  if(taps) tapRules().then(R=>{ RULES = R; d.lines.forEach(l=>{ if(l.ownRule!=='rep') relabel(l); }); if(w.isConnected) render(); });
  render();
  // an empty new record opens straight on the camera choice; a resumed draft keeps its place
  setTimeout(()=>{ const f = w.querySelector('#capTake'); if(f && !d.photos.length) f.focus({preventScroll:true}); }, 40);
}

// drafts for the whole device: /login/ "Switch account" calls this so the next person sees none
async function forgetDrafts(){
  try{ Object.keys(localStorage).filter(k=>k.indexOf('kdh_draft:')===0).forEach(k=>localStorage.removeItem(k)); }catch(e){}
  try{ if(window.indexedDB) indexedDB.deleteDatabase('kdh-drafts'); }catch(e){}
}
window.KdhActivity = {attach, load, openComposer, photoFlow, capture: photoFlow, forgetDrafts, _exifTime: exifTime, _cats: CATS, _events: ()=>ctx ? events(cache.get(ctx.n) || {notes:[], photos:[], records:[]}) : []};
})();
