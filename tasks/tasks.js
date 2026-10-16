/* Field Tasks (2026-10-14). Reps assign; associates work a queue; managers read.
   Every rule is in README.txt. Rows come from PostgREST with the signed-in
   token: row-level security decides what each person sees, the page only
   draws. A 2xx from PostgREST is never taken as proof a write happened --
   every PATCH / DELETE asks for the rows back and counts them. */
(function(){
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = $('#app');
const U = (function(){ try{ return window.kdhUser ? window.kdhUser() : null; }catch(e){ return null; } })();
const ROLE = U ? (U.role === 'associate' ? 'associate' : U.role === 'manager' ? 'manager' : 'rep') : '';
const PREVIEW = !!(U && U.preview);   // a manager looking as someone else: read-only, that person's tasks
const MY_EMAIL = (U && U.email || '').toLowerCase();           // in preview this is the MANAGER's email
const cookie = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
const cfg = () => { const c = window.KDH_AUTH; const t = cookie('kdh_at'); return c && c.url && c.key && t ? {url: String(c.url).replace(/\/$/, ''), key: c.key, token: t} : null; };
const BUCKET = 'task-photos';
const TYPES = {display: 'Display', tap_handle: 'Tap Handle', pos: 'POS', other: 'Other'};
const TYPE_ORDER = ['display', 'tap_handle', 'pos', 'other'];
const PHOTO_REQUIRED = {display: 1, tap_handle: 1};
const STATUS = {assigned: 'Assigned', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked'};
const MIGRATION = 'supabase/migrations/20261014180000_field_tasks.sql';
const S = {tasks: null, reads: {}, people: {associate: [], rep: []}, comments: {}, missing: false, filter: sget('kdh_tasks_f') || 'open', mf: sget('kdh_tasks_mf') || {}, sort: sget('kdh_tasks_sort') || {k: 'due', d: 1}, sheet: null, pollT: null, lastJson: ''};
function sget(k){ try{ return JSON.parse(sessionStorage.getItem(k) || 'null'); }catch(e){ return null; } }
function sset(k, v){ try{ sessionStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }));

/* ---------------- dates ---------------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
let TODAY = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function addDays(s, n){ const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function dueText(s){
  if(!s) return 'No Due Date';
  if(s === TODAY) return 'Today';
  if(s === addDays(TODAY, 1)) return 'Tomorrow';
  if(s === addDays(TODAY, -1)) return 'Yesterday';
  const d = new Date(s + 'T00:00:00');
  return DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : '');
}
function dueClass(t){ if(!t.due_date || t.status === 'done') return ''; return t.due_date < TODAY ? 'over' : t.due_date === TODAY ? 'today' : ''; }
const isOverdue = t => !!t.due_date && t.due_date < TODAY && t.status !== 'done';
function when(iso){
  if(!iso) return '';
  const d = new Date(iso), now = Date.now(), m = Math.round((now - d.getTime()) / 60000);
  if(m < 1) return 'Just now';
  if(m < 60) return m + ' min ago';
  if(m < 60*24 && ymd(d) === TODAY) return 'Today ' + tm(d);
  if(ymd(d) === addDays(TODAY, -1)) return 'Yesterday ' + tm(d);
  return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + tm(d);
}
function tm(d){ let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad(d.getMinutes()) + ' ' + ap; }
const initials = n => String(n || '').trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';
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
  if(e.off) return 'Field Tasks are not set up on this copy of the site.';
  if(e.missing) return 'Field Tasks are not live yet.' + (ROLE === 'manager' ? ' Run ' + MIGRATION + ' in the Supabase SQL Editor.' : ' Ask your manager.');
  const m = String(e.message || '');
  const known = m.match(/(only a rep or a manager can assign a task|assign a task to a sales associate|a task needs a title|an associate may change the status, the photo and the note only|not your task|say why the task is blocked|a photo is required to complete a \w+ task|an empty comment)/);
  if(known) return known[1].charAt(0).toUpperCase() + known[1].slice(1).replace(/_/g, ' ') + '.';
  if(/row-level security/i.test(m)) return 'You are not allowed to do that.';
  if(/Failed to fetch|NetworkError|network/i.test(m)) return 'The connection dropped. Try again.';
  return m;
}
let previewScopePromise;
function previewScope(){
 if(!previewScopePromise)previewScopePromise=Promise.all([rest('rpc/kdh_work_people',{method:'POST',body:{p_assign:false}}),ROLE==='manager'?rest('rpc/kdh_team',{method:'POST',body:{}}):Promise.resolve([])]).then(([people,roster])=>window.KdhTaskScope.create(U,people,roster));
 return previewScopePromise;
}
async function loadAll(){
  const scope=PREVIEW?await previewScope():null;
  let tasks = [], offset = 0;
  for(;;){ const page = await rest('field_tasks?select=*&archived_at=is.null&order=due_date.asc.nullslast,created_at.desc,id.asc&limit=500&offset='+offset); tasks.push(...page); if(page.length<500) break; offset+=500; }
  const reads = await rest('field_task_reads?select=task_id,seen_at');
  const rd = {}; (reads || []).forEach(r => { rd[r.task_id] = r.seen_at; });
  S.reads = rd;
  S.tasks = (tasks || []).filter(t => !PREVIEW || scope.visible(t));
}
async function loadPeople(){
  try { const people=await rest('rpc/kdh_work_people',{method:'POST',body:{p_assign:true}}); S.people.associate=people; S.people.rep=people.filter(p=>p.role==='rep'); return; } catch(e){ if(!e.missing) throw e; }
  if(ROLE === 'associate') return;
  try{ S.people.associate = (await rest('rpc/kdh_people', {method: 'POST', body: {p_role: 'associate'}})) || []; }catch(e){ if(e.missing) throw e; }
  if(ROLE === 'manager'){ try{ S.people.rep = (await rest('rpc/kdh_people', {method: 'POST', body: {p_role: 'rep'}})) || []; }catch(e){} }
}
async function loadComments(id){
  let rows=[],offset=0; for(;;){const page=await rest('field_task_comments?select=*&task_id=eq.'+encodeURIComponent(id)+'&order=created_at.asc,id.asc&limit=500&offset='+offset);rows.push(...page);if(page.length<500)break;offset+=500;}
  S.comments[id] = rows || [];
  return S.comments[id];
}
async function patchTask(id, patch){
  const rows = await rest('field_tasks?id=eq.' + encodeURIComponent(id), {method: 'PATCH', body: patch, headers: {prefer: 'return=representation'}});
  if(!Array.isArray(rows) || !rows.length) throw new Error('Nothing was changed -- the task may have been reassigned. Reload and try again.');
  const t = rows[0]; const i = S.tasks.findIndex(x => x.id === id); if(i >= 0) S.tasks[i] = t; else S.tasks.push(t);
  return t;
}
async function addComment(id, body, photo_path, client_id){
  const rows = await rest('field_task_comments?on_conflict=author_email,client_id', {method: 'POST', body: {task_id: id, body: body || null, photo_path: photo_path || null, kind: photo_path ? 'photo' : 'comment', client_id: client_id || uuid()}, headers: {prefer: 'resolution=ignore-duplicates,return=representation'}});
  const c = rows && rows[0]; if(!c) { await loadComments(id); return null; } if(c) (S.comments[id] = S.comments[id] || []).push(c);
  return c;
}
async function markRead(id){
  if(PREVIEW) return;
  try{ const viewedAt=new Date().toISOString(); await rest('field_task_reads?on_conflict=task_id,email', {method: 'POST', body: {task_id: id, email: MY_EMAIL}, headers: {prefer: 'resolution=merge-duplicates,return=minimal'}}); S.reads[id] = viewedAt;
    await rest('work_notifications?task_id=eq.'+encodeURIComponent(id)+'&recipient=eq.'+encodeURIComponent(MY_EMAIL)+'&read_at=is.null&created_at=lte.'+encodeURIComponent(viewedAt),{method:'PATCH',body:{read_at:viewedAt},headers:{prefer:'return=minimal'}});
    if(window.KdhWork) window.KdhWork.refresh();
  }catch(e){}
}
// "New" = something happened since you last opened it. With no read row yet, a task
// you created yourself is new only once someone else has touched it.
const unseen = t => { if(PREVIEW) return false; const seen = S.reads[t.id]; if(seen) return t.updated_at > seen; return (t.rep_email || '').toLowerCase() === MY_EMAIL ? t.updated_at > t.created_at : true; };
async function signedUrl(path){
  const c = cfg(); if(!c || !path) return '';
  try{
    const r = await fetch(c.url + '/storage/v1/object/sign/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), {method: 'POST', headers: {apikey: c.key, authorization: 'Bearer ' + c.token, 'content-type': 'application/json'}, body: JSON.stringify({expiresIn: 3600})});
    if(!r.ok) return '';
    const j = await r.json(); return j && j.signedURL ? c.url + '/storage/v1' + j.signedURL : '';
  }catch(e){ return ''; }
}
async function toJpeg(file, maxEdge){
  let bmp = null;
  try{ bmp = await createImageBitmap(file, {imageOrientation: 'from-image'}); }catch(e){ bmp = null; }
  if(!bmp) bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error(/heic|heif/i.test(file.type || file.name || '') ? 'This browser cannot open HEIC photos. Take the photo on the phone itself, or pick a JPEG or PNG.' : 'That file is not a photo this browser can open.')); img.src = URL.createObjectURL(file); });
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  if(!w || !h) throw new Error('That file is not an image this browser can open.');
  const k = Math.min(1, (maxEdge || 2048) / Math.max(w, h)); const W = Math.round(w*k), H = Math.round(h*k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(bmp, 0, 0, W, H);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.86));
  if(!blob) throw new Error('Could not prepare the photo.');
  return {blob, url: URL.createObjectURL(blob)};
}
function upload(path, blob, onProgress){
  return new Promise((resolve, reject) => {
    const c = cfg(); if(!c){ reject(new Error('off')); return; }
    const x = new XMLHttpRequest();
    x.open('POST', c.url + '/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'));
    x.setRequestHeader('apikey', c.key); x.setRequestHeader('authorization', 'Bearer ' + c.token);
    x.setRequestHeader('content-type', 'image/jpeg'); x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = e => { if(e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => { if(x.status >= 200 && x.status < 300) resolve(); else { let m = ''; try{ m = JSON.parse(x.responseText).message || ''; }catch(e){} reject(new Error(m || ('Upload failed (HTTP ' + x.status + ')'))); } };
    x.onerror = () => reject(new Error('The connection dropped while uploading.'));
    x.timeout = 120000; x.ontimeout = () => reject(new Error('The upload took too long.'));
    x.send(blob);
  });
}
function pickFile(capture){
  return new Promise(res => {
    const inp = $(capture ? '#tkPhotoIn' : '#tkLibIn'); inp.value = '';
    inp.onchange = () => res(inp.files && inp.files[0] || null);
    inp.click();
  });
}

/* ---------------- accounts (for the New Task form) ---------------- */
function book(){
  const H = typeof HUB_ACCOUNTS !== 'undefined' ? HUB_ACCOUNTS : null;
  if(!H || !H.reps) return [];
  const out = [];
  Object.keys(H.reps).forEach(rep => { (H.reps[rep] || []).forEach(a => out.push({n: String(a.n), name: a.name, city: a.city || '', rep})); });
  return out;
}
let BOOK = null;
function findAccounts(q){
  if(!BOOK) BOOK = book();
  q = String(q || '').trim().toLowerCase(); if(!q) return [];
  const words = q.split(/\s+/);
  return BOOK.filter(a => { const s = (a.name + ' ' + a.city + ' ' + a.n).toLowerCase(); return words.every(w => s.indexOf(w) >= 0); }).slice(0, 8);
}

/* ---------------- shell ---------------- */
let toastT = null;
function toast(msg){ let t = $('.toast'); if(!t){ t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }
function go(hash){ location.hash = hash; }
function route(){
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^([a-z]+)(?:=(.+))?$/);
  if(h.startsWith('new')) return {v:'new',id:''};
  return m ? {v: m[1], id: m[2] || ''} : {v: 'list', id: ''};
}
function sheet(title, bodyHtml, opts){
  closeSheet();
  const o = opts || {};
  const w = document.createElement('div'); w.className = 'kdh-sheet-wrap'; w.id = 'tkSheet';
  w.innerHTML = '<div class="kdh-sheet-back"></div><div class="kdh-sheet tk ' + (o.cls || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="kdh-sheet-h"><b>' + esc(title) + '</b><button type="button" class="kdh-sheet-x" id="tkSheetX">Close</button></div>' + (o.sub ? '<p class="kdh-sheet-p">' + esc(o.sub) + '</p>' : '') + '<div class="kdh-sheet-list" style="min-height:0">' + bodyHtml + '</div></div>';
  document.body.appendChild(w);
  $('#tkSheetX', w).addEventListener('click', closeSheet);
  $('.kdh-sheet-back', w).addEventListener('click', closeSheet);
  S.sheet = w;
  const f = w.querySelector('textarea,input,select,button.primary'); if(f && !o.noFocus) setTimeout(() => f.focus(), 50);
  return w;
}
function closeSheet(){ const w = $('#tkSheet'); if(w) w.remove(); S.sheet = null; }

/* ---------------- list views ---------------- */
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></svg>';
const BACKI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
const isOpen = t => t.status === 'assigned' || t.status === 'in_progress';
function chipsFor(t, opts){
  const o = opts || {}; let h = '';
  if(o.status) h += '<span class="chip st ' + t.status + '">' + STATUS[t.status] + '</span>';
  if(t.account_name && !o.noAcct) h += '<span class="chip"><span>' + esc(t.account_name) + '</span></span>';
  if(t.due_date || !o.status) h += '<span class="chip due ' + dueClass(t) + '">' + esc(t.due_date ? (isOverdue(t) ? 'Overdue · ' : 'Due ') + dueText(t.due_date) : 'No Due Date') + '</span>';
  if(t.priority === 'urgent' && t.status !== 'done') h += '<span class="chip urgent">Urgent</span>';
  if(o.type) h += '<span class="chip">' + TYPES[t.task_type] + '</span>';
  if(unseen(t)) h += '<span class="chip new">New</span>';
  return h;
}
function rowAssoc(t){
  return '<div class="row' + (t.status === 'done' ? ' done' : '') + '" data-id="' + esc(t.id) + '">' +
    '<button type="button" class="ck" data-complete="' + esc(t.id) + '" aria-label="' + (t.status === 'done' ? 'Completed' : 'Mark Complete') + '"' + (t.status === 'done' || PREVIEW ? ' disabled' : '') + '><span>' + TICK + '</span></button>' +
    '<a class="main" href="#task=' + esc(t.id) + '"><span class="t">' + esc(t.title) + '</span><span class="chips">' + chipsFor(t, {}) + (t.status === 'blocked' ? '<span class="chip st blocked">Blocked</span>' : '') + '</span></a>' +
    '<span class="av" title="' + esc(t.rep_name || '') + '" aria-label="From ' + esc(t.rep_name || 'rep') + '">' + esc(initials(t.rep_name)) + '</span></div>';
}
function rowRep(t){
  return '<a class="row mine' + (t.status === 'done' ? ' done' : '') + '" href="#task=' + esc(t.id) + '" data-id="' + esc(t.id) + '"><span class="main"><span class="t">' + esc(t.title) + '</span><span class="chips">' + chipsFor(t, {status: 1}) + '</span></span>' +
    '<span class="av" title="' + esc(t.associate_name || '') + '" aria-label="Assigned to ' + esc(t.associate_name || '') + '">' + esc(initials(t.associate_name)) + '</span></a>';
}
function section(title, list, rowFn, opts){
  const o = opts || {};
  if(!list.length && !o.always) return '';
  return '<details class="sec' + (o.cls ? ' ' + o.cls : '') + '"' + (o.closed ? '' : ' open') + '><summary>' + esc(title) + ' <span class="n">' + list.length + '</span>' + CHEV + '</summary><div class="rows">' + (list.length ? list.map(rowFn).join('') : '<div class="empty">' + esc(o.empty || 'Nothing here.') + '</div>') + '</div></details>';
}
const byDue = (a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : (a.due_date || '9999') > (b.due_date || '9999') ? 1 : (a.priority === 'urgent' ? -1 : b.priority === 'urgent' ? 1 : 0);
const byRecent = (a, b) => (b.updated_at || '') < (a.updated_at || '') ? -1 : 1;
function recentDone(list){ const cut = new Date(Date.now() - 7*86400000).toISOString(); return list.filter(t => t.status === 'done' && (t.completed_at || t.updated_at) >= cut).sort((a, b) => (b.completed_at || '') < (a.completed_at || '') ? -1 : 1); }

function viewAssociate(){
  const T = S.tasks, open = T.filter(isOpen).sort(byDue);
  const over = open.filter(t => t.due_date && t.due_date < TODAY), today = open.filter(t => t.due_date === TODAY), up = open.filter(t => t.due_date && t.due_date > TODAY), none = open.filter(t => !t.due_date);
  const blocked = T.filter(t => t.status === 'blocked').sort(byDue), done = recentDone(T);
  let h = '<h1>My Tasks<small>' + esc(U.name) + ' · Sales Associate' + (PREVIEW ? ' · preview, saving is off' : '') + '</small></h1>' +
    '<p class="tk-sub"><b>' + open.length + '</b> open' + (today.length ? ' · <b>' + today.length + '</b> due today' : '') + (over.length ? ' · <b class="over" style="color:var(--kdh-bad)">' + over.length + '</b> overdue' : '') + (blocked.length ? ' · <b>' + blocked.length + '</b> blocked' : '') + '</p>';
  if(!T.length) h += '<div class="empty">No tasks yet. When a rep assigns you one it shows here.</div>';
  h += section('Overdue', over, rowAssoc, {cls: 'over'}) + section('Today', today, rowAssoc, {always: !!T.length, empty: 'Nothing due today.'}) + section('Upcoming', up, rowAssoc) + section('No Due Date', none, rowAssoc) + section('Blocked', blocked, rowAssoc) + section('Done · Last 7 Days', done, rowAssoc, {closed: true});
  return h;
}
function viewRep(){
  const T = S.tasks; const f = S.filter;
  const counts = {all: T.length, open: T.filter(isOpen).length, done: T.filter(t => t.status === 'done').length, blocked: T.filter(t => t.status === 'blocked').length};
  const seg = '<div class="seg" role="group" aria-label="Filter">' + [['open', 'Open'], ['blocked', 'Blocked'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => '<button type="button" data-f="' + k + '" aria-pressed="' + (f === k) + '">' + l + '<small>' + counts[k] + '</small></button>').join('') + '</div>';
  let h = '<div class="tk-head"><h1>Field Tasks<small>' + (PREVIEW ? esc(U.name) + '’s tasks · preview, saving is off' : 'Your tasks and delegated work') + '</small></h1>' + (PREVIEW ? '' : '<a class="btn primary new" href="#new">' + PLUS + 'New Task</a>') + '</div>' + seg;
  if(!T.length){ h += '<div class="empty">No tasks yet.' + (PREVIEW ? '' : ' Tap New Task to hand a display, tap handle or POS drop to a sales associate.') + '</div>'; }
  else if(f === 'open'){
    const open = T.filter(isOpen); const att = open.filter(t => unseen(t) || isOverdue(t)).sort(byDue), rest = open.filter(t => !(unseen(t) || isOverdue(t))).sort(byDue);
    h += section('Needs a Look', att, rowRep) + section('Open', rest, rowRep, {always: true, empty: 'No open tasks.'});
  }
  else if(f === 'blocked') h += section('Blocked', T.filter(t => t.status === 'blocked').sort(byRecent), rowRep, {always: true, empty: 'Nothing is blocked.'});
  else if(f === 'done') h += section('Done', T.filter(t => t.status === 'done').sort((a, b) => (b.completed_at || '') < (a.completed_at || '') ? -1 : 1), rowRep, {always: true, empty: 'Nothing completed yet.'});
  else h += '<div class="rows">' + T.slice().sort(byRecent).map(rowRep).join('') + '</div>';
  if(!PREVIEW) h += '<a class="fab" href="#new" aria-label="New Task">' + PLUS + 'New Task</a>';
  return h;
}
function mgrFiltered(){
  const m = S.mf; let L = S.tasks.slice();
  if(m.account) L=L.filter(t=>t.account_num===m.account);
  if(m.status === 'open') L = L.filter(isOpen); else if(m.status) L = L.filter(t => t.status === m.status);
  if(m.rep) L = L.filter(t => t.rep_email === m.rep);
  if(m.assoc) L = L.filter(t => t.associate_email === m.assoc);
  if(m.type) L = L.filter(t => t.task_type === m.type);
  if(m.due === 'over') L = L.filter(isOverdue); else if(m.due === 'today') L = L.filter(t => t.due_date === TODAY); else if(m.due === 'week') L = L.filter(t => t.due_date && t.due_date >= TODAY && t.due_date <= addDays(TODAY, 7)); else if(m.due === 'none') L = L.filter(t => !t.due_date);
  const k = S.sort.k, d = S.sort.d;
  const key = t => k === 'due' ? (t.due_date || '9999') : k === 'status' ? ['blocked', 'assigned', 'in_progress', 'done'].indexOf(t.status) : k === 'task' ? t.title.toLowerCase() : k === 'account' ? (t.account_name || '').toLowerCase() : k === 'rep' ? (t.rep_name || '') : k === 'assoc' ? (t.associate_name || '') : k === 'pri' ? (t.priority === 'urgent' ? 0 : 1) : k === 'done' ? (t.completed_at || '') : '';
  L.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -d : x > y ? d : 0; });
  return L;
}
function viewManager(){
  const T = S.tasks; const open = T.filter(isOpen), over = T.filter(isOverdue);
  const wk = new Date(Date.now() - 7*86400000).toISOString(); const doneWk = T.filter(t => t.status === 'done' && (t.completed_at || '') >= wk);
  const done = T.filter(t => t.status === 'done' && t.completed_at); const avg = done.length ? done.reduce((s, t) => s + (new Date(t.completed_at) - new Date(t.created_at)), 0) / done.length / 86400000 : null;
  const sel = (name, label, opts) => '<div><label for="mf-' + name + '">' + label + '</label><select id="mf-' + name + '" data-mf="' + name + '">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + ((S.mf[name] || '') === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
  const reps = uniq(T.map(t => [t.rep_email, t.rep_name])), assocs = uniq(T.map(t => [t.associate_email, t.associate_name]));
  const perA = {}; open.forEach(t => { perA[t.associate_name || t.associate_email] = (perA[t.associate_name || t.associate_email] || 0) + 1; });
  let h = '<h1>Field Tasks<small>Team overview' + (PREVIEW ? ' · preview' : '') + '</small></h1>' +
    '<div class="strip"><div class="tile"><b>' + open.length + '</b><span>Open</span></div><div class="tile' + (over.length ? ' bad' : '') + '"><b>' + over.length + '</b><span>Overdue</span></div><div class="tile"><b>' + doneWk.length + '</b><span>Done This Week</span></div><div class="tile"><b>' + (avg == null ? '–' : avg < 1 ? (Math.round(avg*24) + 'h') : (Math.round(avg*10)/10 + 'd')) + '</b><span>Avg Time to Complete</span></div></div>';
  if(!PREVIEW) h += '<a class="btn primary" href="#new">Assign Task</a>';
  const names = Object.keys(perA).sort();
  if(names.length) h += '<div class="per">' + names.map(n => '<button type="button" class="chip" data-assoc-name="' + esc(n) + '"><span>' + esc(n) + ' · ' + perA[n] + ' open</span></button>').join('') + '</div>';
  h += '<div class="fbar">' + sel('status', 'Status', [['', 'All'], ['open', 'Open'], ['assigned', 'Assigned'], ['in_progress', 'In Progress'], ['blocked', 'Blocked'], ['done', 'Done']]) +
    sel('account', 'Account', [['', 'All']].concat(uniq(T.filter(t=>t.account_num).map(t=>[t.account_num,(t.account_name||t.account_num)+' · #'+t.account_num])))) + sel('rep', 'Created By', [['', 'All']].concat(reps)) + sel('assoc', 'Assigned To', [['', 'All']].concat(assocs)) +
    sel('type', 'Task Type', [['', 'All']].concat(TYPE_ORDER.map(k => [k, TYPES[k]]))) + sel('due', 'Due', [['', 'Any'], ['over', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 Days'], ['none', 'No Due Date']]) + '</div>';
  const L = mgrFiltered();
  h += '<p class="tk-sub"><b>' + L.length + '</b> of ' + T.length + ' tasks</p>';
  if(!L.length) h += '<div class="empty">' + (T.length ? 'No tasks match these filters.' : 'No tasks yet. Reps create them from Field Tasks.') + '</div>';
  else {
    const th = (k, l) => '<th scope="col" data-sort="' + k + '"' + (S.sort.k === k ? ' aria-sort="' + (S.sort.d > 0 ? 'ascending' : 'descending') + '"' : '') + '>' + l + '</th>';
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + th('status', 'Status') + th('task', 'Task') + th('account', 'Account') + th('rep', 'Rep') + th('assoc', 'Assigned To') + th('due', 'Due') + th('pri', 'Priority') + th('done', 'Completed') + '</tr></thead><tbody>' +
      L.map(t => '<tr><td><span class="chip st ' + t.status + '">' + STATUS[t.status] + '</span></td><td><a href="#task=' + esc(t.id) + '">' + esc(t.title) + '</a><br><small style="color:var(--kdh-text-3)">' + TYPES[t.task_type] + '</small></td><td>' + esc(t.account_name || '–') + '</td><td>' + esc(t.rep_name || '') + '</td><td>' + esc(t.associate_name || '') + '</td><td><span class="chip due ' + dueClass(t) + '">' + esc(t.due_date ? dueText(t.due_date) : 'None') + '</span></td><td>' + (t.priority === 'urgent' ? '<span class="chip urgent">Urgent</span>' : 'Normal') + '</td><td>' + esc(t.completed_at ? when(t.completed_at) : '–') + '</td></tr>').join('') + '</tbody></table></div>';
    h += '<div class="cards mgr">' + L.map(t => '<a class="card" href="#task=' + esc(t.id) + '"><span class="t">' + esc(t.title) + '</span><span class="m">' + esc(t.rep_name || '') + ' → ' + esc(t.associate_name || '') + (t.account_name ? ' · ' + esc(t.account_name) : '') + '</span><span class="chips">' + chipsFor(t, {status: 1, type: 1, noAcct: 1}) + '</span></a>').join('') + '</div>';
  }
  return h;
}
function uniq(pairs){ const m = {}; pairs.forEach(([e, n]) => { if(e && !m[e]) m[e] = n || e; }); return Object.keys(m).map(e => [e, m[e]]).sort((a, b) => a[1] < b[1] ? -1 : 1); }

/* ---------------- detail ---------------- */
function viewDetail(t, comments){
  const assigned = MY_EMAIL === (t.associate_email || '').toLowerCase();
  const mine = MY_EMAIL === (t.rep_email || '').toLowerCase();
  const canStatus = (assigned || ROLE === 'manager') && !PREVIEW;
  const canEdit = (mine || ROLE === 'manager') && !PREVIEW;
  const canComment = !PREVIEW && (ROLE === 'manager' || mine || assigned);
  const over = isOverdue(t);
  let h = '<div class="dh"><a class="back" href="#">' + BACKI + (ROLE === 'associate' ? 'My Tasks' : 'Field Tasks') + '</a><span class="sp"></span><span class="chip st ' + t.status + '">' + STATUS[t.status] + '</span>' + (t.priority === 'urgent' ? '<span class="chip urgent">Urgent</span>' : '') + '</div>' +
    '<h1 class="dtitle">' + esc(t.title) + '</h1>';
  if(canStatus){
    h += '<div class="stbox"><label for="stSel">Status</label><div class="stsel"><span class="dot ' + t.status + '"></span><select id="stSel">' + Object.keys(STATUS).map(k => '<option value="' + k + '"' + (k === t.status ? ' selected' : '') + '>' + STATUS[k] + '</option>').join('') + '</select></div>' +
      (t.status === 'blocked' ? '<div class="blk">Blocked: ' + esc(t.blocked_reason || '') + '</div>' : '') +
      '<div class="acts">' + (t.status !== 'done' ? '<button type="button" class="btn ok" id="btnDone">' + TICK + 'Mark Complete</button>' : '<button type="button" class="btn" id="btnReopen">Reopen</button>') + (t.status === 'assigned' ? '<button type="button" class="btn" id="btnStart">Start Working</button>' : '') + (t.status !== 'blocked' && t.status !== 'done' ? '<button type="button" class="btn" id="btnBlock">Can’t Do This</button>' : '') + '</div>' +
      (PHOTO_REQUIRED[t.task_type] && t.status !== 'done' ? '<p class="tk-note" style="margin:10px 0 0">A photo of the finished ' + TYPES[t.task_type].toLowerCase() + ' is required to complete this task.</p>' : '') + '</div>';
  } else if(t.status === 'blocked') h += '<div class="blk" style="margin:0 0 12px">Blocked: ' + esc(t.blocked_reason || '') + '</div>';
  h += '<div class="grid2"><div class="cell"><label>Assigned To</label><b><span class="av" style="width:26px;height:26px;font-size:12px">' + esc(initials(t.associate_name)) + '</span><span>' + esc(t.associate_name || '') + '</span></b></div><div class="cell' + (over ? ' over' : '') + '"><label>Due Date</label><b><span>' + esc(t.due_date ? dueText(t.due_date) + (over ? ' · Overdue' : '') : 'No Due Date') + '</span></b></div></div>';
  h += '<div class="facts">' + (t.account_name ? '<div class="f"><label>Account</label><b>' + esc(t.account_name) + (t.account_num ? ' <span style="color:var(--kdh-text-3);font-weight:500">#' + esc(t.account_num) + '</span>' : '') + '</b></div>' : '<div class="f"><label>Account</label><b style="color:var(--kdh-text-3)">None</b></div>') +
    '<div class="f"><label>Task Type</label><b>' + TYPES[t.task_type] + '</b></div><div class="f"><label>Priority</label><b>' + (t.priority === 'urgent' ? 'Urgent' : 'Normal') + '</b></div><div class="f"><label>Assigned By</label><b>' + esc(t.rep_name || '') + '</b></div><div class="f"><label>Created</label><b>' + esc(when(t.created_at)) + '</b></div>' + (t.completed_at ? '<div class="f"><label>Completed</label><b>' + esc(when(t.completed_at)) + '</b></div>' : '') + '</div>';
  h += '<h2>Description</h2><div class="desc' + (t.description ? '' : ' none') + '">' + (t.description ? esc(t.description) : 'No description.') + '</div>';
  if(t.photo_path) h += '<h2>Completion Photo</h2><div class="ph" id="tkPhoto" data-path="' + esc(t.photo_path) + '"><img alt="Completion photo" src=""><div class="pm"><b>' + (t.completion_note ? esc(t.completion_note) : 'Photo attached') + '</b>' + (t.completed_at ? esc(when(t.completed_at)) : '') + ' · <a href="#" data-open-photo>Open</a></div></div>';
  if(t.account_num) h += '<a class="btn" href="../accounts/'+(ROLE==='associate'?'field.html':'')+'#acct='+encodeURIComponent(t.account_num)+'">Open Account</a>';
  if(t.source_url) h += '<a class="btn" href="'+esc(t.source_url)+'">Open Related Work</a>';
  if(t.completion_note && !t.photo_path) h += '<h2>Completion Note</h2><p>'+esc(t.completion_note)+'</p>';
  if(canEdit) h += '<div class="acts" style="margin:0 0 14px"><a class="btn" href="#edit=' + esc(t.id) + '">Edit Task</a>' + (t.rep_email===MY_EMAIL && (t.personal || t.status === 'assigned') ? '<button type="button" class="btn danger" id="btnWithdraw">Delete Task</button>' : '') + '</div>';
  h += '<h2>Thread</h2><div class="thread" id="thread">' + threadHtml(comments) + '</div>';
  if(canComment) h += '<form class="composer" id="composer"><textarea id="cBody" rows="1" placeholder="Write a message…" aria-label="Message"></textarea><button type="button" class="btn cam" id="cCam" aria-label="Attach a photo">' + CAM + '</button><button type="submit" class="btn primary" id="cSend" aria-label="Send">' + SEND + '</button></form><div id="cAtt"></div>';
  else if(PREVIEW) h += '<p class="tk-note">Saving is off in preview. These are ' + esc(first(U.name)) + '’s tasks.</p>';
  return h;
}
function threadHtml(cs){
  if(!cs || !cs.length) return '<div class="empty">No messages yet.</div>';
  return cs.map(c => {
    if(c.kind === 'status') return '<div class="sys"><b>' + esc(c.author_name || c.author_email) + '</b> set ' + esc(c.body || '') + ' · ' + esc(when(c.created_at)) + '</div>';
    const me = (c.author_email || '').toLowerCase() === MY_EMAIL && !PREVIEW;
    return '<div class="msg' + (me ? ' me' : '') + '"><span class="who">' + esc(c.author_name || c.author_email) + '</span>' + (c.body ? esc(c.body) : '') + (c.photo_path ? '<img alt="Photo" data-path="' + esc(c.photo_path) + '" src="" loading="lazy">' : '') + '<span class="when">' + esc(when(c.created_at)) + '</span></div>';
  }).join('');
}
async function hydratePhotos(root){
  const imgs = (root || app).querySelectorAll('img[data-path]');
  for(const img of imgs){ if(img.getAttribute('src')) continue; const u = await signedUrl(img.getAttribute('data-path')); if(u){ img.src = u; const a = img.closest('.ph') && img.closest('.ph').querySelector('[data-open-photo]'); if(a){ a.href = u; a.target = '_blank'; a.rel = 'noopener'; } } else img.alt = 'Photo unavailable'; }
  const ph = $('#tkPhoto'); if(ph && !ph.querySelector('img').getAttribute('src')){ const u = await signedUrl(ph.getAttribute('data-path')); if(u){ ph.querySelector('img').src = u; const a = ph.querySelector('[data-open-photo]'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; } }
}

/* ---------------- complete / block flows ---------------- */
function completeFlow(t){
  const need = !!PHOTO_REQUIRED[t.task_type];
  const w = sheet(need ? 'Add a Photo' : 'Complete This Task', (need ? '<p class="kdh-sheet-p">A photo of the finished ' + TYPES[t.task_type].toLowerCase() + ' is required.</p>' : '<p class="kdh-sheet-p">Add a photo if you have one, then submit.</p>') +
    '<div class="sheet-foot"><button type="button" class="btn primary" id="shTake">' + CAM + 'Take Photo</button><button type="button" class="btn" id="shLib">Choose From Library</button>' + (need ? '' : '<button type="button" class="btn ok" id="shNoPhoto">' + TICK + 'Complete Without a Photo</button>') + '</div>', {noFocus: 1});
  $('#shTake', w).addEventListener('click', async () => { const f = await pickFile(true); if(f) checkPhoto(t, f); });
  $('#shLib', w).addEventListener('click', async () => { const f = await pickFile(false); if(f) checkPhoto(t, f); });
  const np = $('#shNoPhoto', w); if(np) np.addEventListener('click', () => checkPhoto(t, null));
}
async function checkPhoto(t, file){
  let img = null, uploadedPath = null;
  if(file){ try{ img = await toJpeg(file, 2048); }catch(e){ toast(friendly(e)); return; } }
  const w = sheet('Check Your Photo', '<div class="chk">' + (img ? '<img src="' + img.url + '" alt="Your photo">' : '<p class="kdh-sheet-p">No photo attached.</p>') + '<div class="fld" style="margin-top:10px"><label for="shNote">Note <small>(optional)</small></label><textarea id="shNote" rows="2" placeholder="Anything the rep should know"></textarea></div><div class="prog" id="shProg" hidden><i></i></div><div class="err-line" id="shErr" hidden></div>' +
    '<div class="sheet-foot"><button type="button" class="btn ok" id="shSubmit">' + TICK + 'Submit &amp; Complete</button>' + (img ? '<button type="button" class="btn" id="shRetake">Retake Photo</button>' : '<button type="button" class="btn" id="shRetake">Add a Photo</button>') + '</div></div>', {noFocus: 1});
  $('#shRetake', w).addEventListener('click', async () => { const f = await pickFile(!!img); if(f) checkPhoto(t, f); });
  $('#shSubmit', w).addEventListener('click', async () => {
    const b = $('#shSubmit', w); if(b.disabled) return; b.disabled=true; b.setAttribute('aria-busy', 'true'); const err = $('#shErr', w); err.hidden = true;
    try{
      let path = null;
      if(img){ const pr = $('#shProg', w); pr.hidden = false; path = uploadedPath || (t.id + '/' + uuid() + '.jpg'); if(!uploadedPath){ await upload(path, img.blob, p => { pr.querySelector('i').style.width = Math.round(p*100) + '%'; }); uploadedPath=path; } }
      const note = $('#shNote', w).value.trim();
      await patchTask(t.id, {status: 'done', photo_path: path || t.photo_path || null, completion_note: note || null});
      // The database logs completion and its photo in the same transaction.
      delete S.comments[t.id]; closeSheet(); toast('Task completed'); render();
    }catch(e){ err.textContent = friendly(e); err.hidden = false; b.disabled=false; b.removeAttribute('aria-busy'); }
  });
}
function blockFlow(t, revert){
  const w = sheet('Can’t Do This Task', '<div class="fld"><label for="shWhy">Why? <small>The rep sees this.</small></label><textarea id="shWhy" rows="3" placeholder="Store closed, no space, wrong product…"></textarea><div class="err-line" id="shErr" hidden></div></div><div class="sheet-foot"><button type="button" class="btn danger" id="shBlock">Mark Blocked</button><button type="button" class="btn" id="shCancel">Cancel</button></div>');
  $('#shCancel', w).addEventListener('click', () => { closeSheet(); if(revert) revert(); });
  $('#shBlock', w).addEventListener('click', async () => {
    const why = $('#shWhy', w).value.trim(); const err = $('#shErr', w);
    if(!why){ err.textContent = 'Say why, so the rep can fix it.'; err.hidden = false; return; }
    const b = $('#shBlock', w); b.setAttribute('aria-busy', 'true');
    try{ await patchTask(t.id, {status: 'blocked', blocked_reason: why}); delete S.comments[t.id]; closeSheet(); toast('Marked blocked'); render(); }
    catch(e){ err.textContent = friendly(e); err.hidden = false; b.removeAttribute('aria-busy'); }
  });
}
async function setStatus(t, st, revert){
  if(st === t.status) return;
  if(st === 'done') return completeFlow(t);
  if(st === 'blocked') return blockFlow(t, revert);
  try{ await patchTask(t.id, {status: st}); delete S.comments[t.id]; toast(STATUS[st]); render(); }catch(e){ toast(friendly(e)); if(revert) revert(); }
}

/* ---------------- new / edit form ---------------- */
function viewForm(t){
  const edit = !!t; const d = edit ? t : {title: '', description: '', task_type: 'other', account_num: new URLSearchParams(location.search).get('account') || '', account_name: new URLSearchParams(location.search).get('name') || '', associate_email: MY_EMAIL, due_date: '', priority: 'normal'};
  const assocs = S.people.associate;
  if(!edit) d.title=new URLSearchParams(location.search).get('title') || '';
  if(edit && !assocs.some(p=>p.email===d.associate_email)) assocs.push({email:d.associate_email,name:d.associate_name});
  let h = '<div class="dh"><a class="back" href="' + (edit ? '#task=' + esc(t.id) : '#') + '">' + BACKI + (edit ? 'Task' : 'Field Tasks') + '</a></div><h1 class="dtitle">' + (edit ? 'Edit Task' : 'New Task') + '</h1>';
  h += '<form class="form" id="tf" novalidate>' +
    '<div class="fld"><label for="fTitle">Task</label><input type="text" id="fTitle" maxlength="160" value="' + esc(d.title) + '" placeholder="Build a Corona floor display" autocomplete="off"><div class="err" id="eTitle" hidden></div></div>' +
    '<div class="fld"><label for="fDesc">Details <small>(optional)</small></label><textarea id="fDesc" rows="3" placeholder="What to build, where, how many cases, anything the associate needs">' + esc(d.description || '') + '</textarea></div>' +
    '<div class="fld"><label for="fAssoc">Assigned To</label>' + (assocs.length ? '<select id="fAssoc"><option value="">Choose…</option>' + assocs.map(p => '<option value="' + esc(p.email) + '"' + (p.email === d.associate_email ? ' selected' : '') + '>' + esc(p.name) + (p.email===MY_EMAIL?' (Me)':'') + '</option>').join('') + '</select>' : '<div class="hint">No eligible employees are available.</div>') + '<div class="err" id="eAssoc" hidden></div></div>' +
    '<div class="fld"><label for="fAcct">Account <small>(optional)</small></label><div class="pick" id="acctPick">' + (d.account_name ? pickedHtml(d) : '<input type="search" id="fAcct" placeholder="Search your accounts by name, town or number" autocomplete="off"><div class="opts" id="acctOpts" hidden></div>') + '</div></div>' +
    '<div class="fld"><label>Task Type</label><div class="seg" style="margin:0" role="group" aria-label="Task type">' + TYPE_ORDER.map(k => '<button type="button" data-type="' + k + '" aria-pressed="' + (k === d.task_type) + '">' + TYPES[k] + '</button>').join('') + '</div><div class="hint" id="typeHint">' + typeHint(d.task_type) + '</div></div>' +
    '<div class="fld"><label for="fPlan">Show in My Day</label><input type="date" id="fPlan" value="' + esc(d.planned_on || TODAY) + '"></div><div class="fld"><label for="fDue">Due Date <small>(optional)</small></label><input type="date" id="fDue" value="' + esc(d.due_date || '') + '"><div class="quick"><button type="button" data-due="0">Today</button><button type="button" data-due="1">Tomorrow</button><button type="button" data-due="7">Next Week</button><button type="button" data-due="">Clear</button></div></div>' +
    '<div class="fld"><label>Priority</label><div class="toggle2" role="group" aria-label="Priority"><button type="button" data-pri="normal" aria-pressed="' + (d.priority !== 'urgent') + '">Normal</button><button type="button" class="urg" data-pri="urgent" aria-pressed="' + (d.priority === 'urgent') + '">Urgent</button></div></div>' +
    '<div class="err-line" id="fErr" hidden></div>' +
    '<div class="savebar"><a class="btn" href="' + (edit ? '#task=' + esc(t.id) : '#') + '">Cancel</a><button type="submit" class="btn primary" id="fSave">' + (edit ? 'Save Changes' : 'Assign Task') + '</button></div></form>';
  return h;
}
const typeHint = k => k === 'display' || k === 'tap_handle' ? 'A completion photo is required.' : 'A completion photo is optional.';
function pickedHtml(d){ return '<div class="picked" id="acctPicked" data-n="' + esc(d.account_num || '') + '" data-name="' + esc(d.account_name) + '"><span>' + esc(d.account_name) + (d.account_num ? '<small>#' + esc(d.account_num) + '</small>' : '') + '</span><button type="button" class="btn sm ghost" id="acctClear">Change</button></div>'; }
function wireForm(t){
  const f = $('#tf'); const createId=uuid(); const st = {type: t ? t.task_type : 'other', pri: t ? t.priority : 'normal'};
  f.addEventListener('click', e => {
    const ty = e.target.closest('[data-type]'); if(ty){ st.type = ty.getAttribute('data-type'); f.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', b === ty)); $('#typeHint').textContent = typeHint(st.type); return; }
    const pr = e.target.closest('[data-pri]'); if(pr){ st.pri = pr.getAttribute('data-pri'); f.querySelectorAll('[data-pri]').forEach(b => b.setAttribute('aria-pressed', b === pr)); return; }
    const q = e.target.closest('[data-due]'); if(q){ const v = q.getAttribute('data-due'); $('#fDue').value = v === '' ? '' : addDays(TODAY, +v); return; }
    const o = e.target.closest('[data-acct]'); if(o){ const [n, name] = [o.getAttribute('data-acct'), o.getAttribute('data-name')]; $('#acctPick').innerHTML = pickedHtml({account_num: n, account_name: name}); return; }
    if(e.target.closest('#acctClear')){ $('#acctPick').innerHTML = '<input type="search" id="fAcct" placeholder="Search your accounts by name, town or number" autocomplete="off"><div class="opts" id="acctOpts" hidden></div>'; $('#fAcct').focus(); }
  });
  f.addEventListener('change', e => { if(e.target.id === 'fAssoc') $('#eAssoc').hidden = !!e.target.value; });
  f.addEventListener('input', e => {
    if(e.target.id === 'fTitle'){ if(e.target.value.trim()) $('#eTitle').hidden = true; return; }
    if(e.target.id !== 'fAcct') return;
    const list = findAccounts(e.target.value); const o = $('#acctOpts');
    if(!BOOK || !BOOK.length){ o.innerHTML = '<button type="button" disabled>' + (window.__noBook ? 'Your account list is not available here.' : 'No accounts on file.') + '</button>'; o.hidden = !e.target.value; return; }
    o.innerHTML = list.length ? list.map(a => '<button type="button" data-acct="' + esc(a.n) + '" data-name="' + esc(a.name) + '">' + esc(a.name) + '<small>' + esc(a.city) + ' · #' + esc(a.n) + (ROLE === 'manager' ? ' · ' + esc(a.rep) : '') + '</small></button>').join('') : '<button type="button" disabled>No matching accounts</button>';
    o.hidden = !e.target.value.trim();
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if($('#fSave').disabled) return;
    const title = $('#fTitle').value.trim(); const sel = $('#fAssoc'); const assoc = sel ? sel.value : '';
    let ok = true;
    $('#eTitle').hidden = !!title; if(!title){ $('#eTitle').textContent = 'Give the task a name.'; ok = false; }
    $('#eAssoc').hidden = !!assoc; if(!assoc){ $('#eAssoc').textContent = 'Choose who will handle this task.'; ok = false; }
    if(!ok) return;
    const pk = $('#acctPicked');
    const def = {title, description: $('#fDesc').value.trim() || null, task_type: st.type, associate_email: assoc, account_num: pk ? (pk.getAttribute('data-n') || null) : null, account_name: pk ? pk.getAttribute('data-name') : null, due_date: $('#fDue').value || null, priority: st.pri};
    def.planned_on=$('#fPlan').value || TODAY;
    const b = $('#fSave'); b.disabled=true; b.setAttribute('aria-busy', 'true'); const err = $('#fErr'); err.hidden = true;
    try{
      if(t){ await patchTask(t.id, def); toast('Saved'); go('task=' + t.id); }
      else {
        const params=new URLSearchParams(location.search); if(params.get('source')) { const existing=await rest('field_tasks?rep_email=eq.'+encodeURIComponent(MY_EMAIL)+'&source_key=eq.'+encodeURIComponent(params.get('source'))); if(existing.length){if(!S.tasks.some(t=>t.id===existing[0].id))S.tasks.push(existing[0]);go('task='+existing[0].id);return;} } def.id=createId; def.source_key=params.get('source')||null; def.source_url=params.get('from')||null;
        const rows = await rest('field_tasks?on_conflict=id', {method: 'POST', body: def, headers: {prefer: 'resolution=ignore-duplicates,return=representation'}});
        const nt = rows && rows[0] || (await rest('field_tasks?id=eq.'+createId))[0]; if(!nt) throw new Error('The task was not saved.');
        S.tasks.unshift(nt); await markRead(nt.id); toast('Task assigned to ' + first(nt.associate_name)); go('task=' + nt.id);
      }
    }catch(e2){ err.textContent = friendly(e2); err.hidden = false; b.disabled=false; b.removeAttribute('aria-busy'); }
  });
}

/* ---------------- render ---------------- */
let CUR = null;   // current detail id (for polling)
async function render(){
  if(!U){ app.innerHTML = '<div class="kdh-state">Sign in to see field tasks.</div>'; return; }
  if(!cfg()){ app.innerHTML = '<h1>Field Tasks</h1><div class="kdh-state"><b>Field Tasks are not set up on this copy of the site.</b> They need the sign-in service.</div>'; return; }
  if(S.missing){ app.innerHTML = '<h1>Field Tasks</h1><div class="kdh-state"><b>Field Tasks are not live yet.</b> ' + (ROLE === 'manager' ? 'Run <code>' + MIGRATION + '</code> in the Supabase SQL Editor, then reload.' : 'Ask your manager.') + '</div>'; return; }
  const r = route(); CUR = null;
  window.scrollTo(0, 0);
  if(r.v === 'task' && r.id){
    let t = S.tasks.find(x => x.id === r.id);
    if(!t && !PREVIEW){try{t=(await rest('field_tasks?id=eq.'+encodeURIComponent(r.id)))[0];if(t)S.tasks.push(t);}catch(e){}}
    if(!t){ app.innerHTML = '<div class="dh"><a class="back" href="#">' + BACKI + 'Back</a></div><div class="kdh-state"><b>That task is not here.</b> It may have been withdrawn or reassigned.</div>'; return; }
    CUR = t.id;
    let cs = S.comments[t.id]; if(!cs){ app.innerHTML = viewDetail(t, []); try{ cs = await loadComments(t.id); }catch(e){ cs = []; } if(CUR !== t.id) return; }
    app.innerHTML = viewDetail(t, cs);
    wireDetail(t); hydratePhotos(); markRead(t.id);
    const th = $('#thread'); if(th && cs.length > 3) th.lastElementChild.scrollIntoView({block: 'nearest'});
    return;
  }
  if((r.v === 'new' || r.v === 'edit') && ROLE !== 'associate' && !PREVIEW){
    const t = r.v === 'edit' ? S.tasks.find(x => x.id === r.id) : null;
    if(r.v === 'edit' && (!t || (t.rep_email!==MY_EMAIL && ROLE!=='manager'))){ go(t?'task='+t.id:''); return; }
    app.innerHTML = viewForm(t); wireForm(t); const ft = $('#fTitle'); if(ft && !t) ft.focus();
    return;
  }
  app.innerHTML = ROLE === 'associate' ? viewAssociate() : ROLE === 'manager' ? viewManager() : viewRep();
  wireList();
}
function wireList(){
  app.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { S.filter = b.getAttribute('data-f'); sset('kdh_tasks_f', S.filter); render(); }));
  app.querySelectorAll('[data-mf]').forEach(s => s.addEventListener('change', () => { S.mf[s.getAttribute('data-mf')] = s.value; sset('kdh_tasks_mf', S.mf); render(); }));
  app.querySelectorAll('[data-assoc-name]').forEach(b => b.addEventListener('click', () => { const n = b.getAttribute('data-assoc-name'); const t = S.tasks.find(x => (x.associate_name || x.associate_email) === n); S.mf.assoc = S.mf.assoc === (t && t.associate_email) ? '' : (t ? t.associate_email : ''); S.mf.status = S.mf.assoc ? 'open' : S.mf.status; sset('kdh_tasks_mf', S.mf); render(); }));
  app.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => { const k = th.getAttribute('data-sort'); S.sort = {k, d: S.sort.k === k ? -S.sort.d : 1}; sset('kdh_tasks_sort', S.sort); render(); }));
  app.querySelectorAll('[data-complete]').forEach(b => b.addEventListener('click', () => { const t = S.tasks.find(x => x.id === b.getAttribute('data-complete')); if(t) completeFlow(t); }));
}
function wireDetail(t){
  const sel = $('#stSel'); if(sel) sel.addEventListener('change', () => setStatus(t, sel.value, () => { sel.value = t.status; }));
  const bd = $('#btnDone'); if(bd) bd.addEventListener('click', () => completeFlow(t));
  const bs = $('#btnStart'); if(bs) bs.addEventListener('click', () => setStatus(t, 'in_progress'));
  const bb = $('#btnBlock'); if(bb) bb.addEventListener('click', () => blockFlow(t));
  const br = $('#btnReopen'); if(br) br.addEventListener('click', () => setStatus(t, 'in_progress'));
  const bw = $('#btnWithdraw'); if(bw) bw.addEventListener('click', async () => {
    if(!confirm(t.personal?'Delete this task?':'Withdraw this task? The assignee will no longer see it.')) return;
    try{ const rows = await rest('field_tasks?id=eq.' + encodeURIComponent(t.id), {method: 'DELETE', headers: {prefer: 'return=representation'}}); if(!rows || !rows.length) throw new Error('Not withdrawn -- the associate may already have started it.'); S.tasks = S.tasks.filter(x => x.id !== t.id); toast('Task withdrawn'); go(''); }catch(e){ toast(friendly(e)); }
  });
  const form = $('#composer'); if(!form) return;
  let att = null, pendingComment=null, uploadedPath=null;
  const ta = $('#cBody'); ta.addEventListener('input', () => { pendingComment=null; ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', e => { if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });
  $('#cCam').addEventListener('click', async () => {
    const f = await pickFile(true); if(!f) return;
    try{ att = await toJpeg(f, 2048); pendingComment=null; uploadedPath=null; $('#cAtt').innerHTML = '<div class="att"><img src="' + att.url + '" alt=""><span>Photo attached</span><button type="button" class="btn sm ghost" id="cAttX">Remove</button></div>'; $('#cAttX').addEventListener('click', () => { att = null; pendingComment=null; uploadedPath=null; $('#cAtt').innerHTML = ''; }); }
    catch(e){ toast(friendly(e)); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const body = ta.value.trim(); if(!body && !att) return; if($('#cSend').disabled) return; if(!pendingComment) pendingComment=uuid();
    const b = $('#cSend'); b.disabled=true; b.setAttribute('aria-busy', 'true');
    try{
      let path = null;
      if(att){ path = uploadedPath || (t.id + '/' + uuid() + '.jpg'); if(!uploadedPath) await upload(path, att.blob); uploadedPath=path; }
      const c = await addComment(t.id, body, path, pendingComment); pendingComment=null; uploadedPath=null;
      ta.value = ''; ta.style.height = 'auto'; att = null; $('#cAtt').innerHTML = '';
      const th = $('#thread'); if(th){ th.innerHTML = threadHtml(S.comments[t.id]); hydratePhotos(th); th.lastElementChild.scrollIntoView({block: 'nearest'}); }
      const i = S.tasks.findIndex(x => x.id === t.id); if(i >= 0) S.tasks[i].updated_at = c && c.created_at || new Date().toISOString();
      markRead(t.id);
    }catch(e2){ toast(friendly(e2)); }
    b.disabled=false; b.removeAttribute('aria-busy');
  });
}

/* ---------------- polling: every 30 s while the page is visible ---------------- */
async function poll(){
  TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(document.visibilityState !== 'visible' || S.sheet || !S.tasks) return;
  const r = route(); if(r.v === 'new' || r.v === 'edit') return;
  try{
    const before = JSON.stringify(S.tasks) + JSON.stringify(S.reads);
    await loadAll();
    if(CUR){
      const old = (S.comments[CUR] || []).length; const cs = await loadComments(CUR);
      const t = S.tasks.find(x => x.id === CUR);
      if(cs.length !== old && t){ const th = $('#thread'); if(th){ th.innerHTML = threadHtml(cs); hydratePhotos(th); } markRead(CUR); }
      const nowT = JSON.stringify(t);
      if(t && nowT !== S.lastJson && S.lastJson && document.activeElement === document.body) render();
      S.lastJson = nowT || '';
      return;
    }
    if(JSON.stringify(S.tasks) + JSON.stringify(S.reads) !== before && document.activeElement === document.body) render();
  }catch(e){}
}

/* ---------------- boot ---------------- */
async function boot(){
  if(!U || !cfg()){ render(); return; }
  try{ await loadPeople(); await loadAll(); }
  catch(e){
    if(e.missing){ S.missing = true; render(); return; }
    app.innerHTML = '<h1>Field Tasks</h1><div class="kdh-state"><b>Could not load tasks.</b> ' + esc(friendly(e)) + ' <button type="button" class="btn sm" onclick="location.reload()">Reload</button></div>';
    return;
  }
  render();
  window.addEventListener('hashchange', () => { closeSheet(); render(); });
  S.pollT = setInterval(poll, 30000);
  window.addEventListener('kdh:work-changed',poll);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') poll(); });
}
window.KdhTasks = {state: S, render, reload: async () => { await loadAll(); render(); }};
boot();
})();
