/* Accounts tab + Account page (2026-09-30). See index.html for the idea and
   README.txt for every rule. hub.js is loaded in library mode and exposes
   window.KohlerHub; HubAccounts / HUB_ACCOUNTS come from the hub's account
   layer; shared/kdh-user.js says who is signed in. Nothing here recomputes
   a program figure -- this page only decides what to show first. */
(function(){
'use strict';
const H = window.KohlerHub;
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);
const app = document.getElementById('acctApp');
const U = window.kdhUser ? window.kdhUser() : null;
const isMgr = !!(U && U.role === 'manager');
const HUB = '../hub/';
const TAP = '../isellbeer/tap-survey-tracking/';
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monLabel = k => { const [y,m] = k.split('-'); return MON[+m-1]+' '+y; };
const monShort = k => MON[+k.split('-')[1]-1];
const fmtN = v => { const n = Number(v); if(!isFinite(n)) return '—'; return (Math.round(n*10)/10).toLocaleString('en-US'); };
const plural = (n, w) => n+' '+w+(n===1?'':'s');
const fmtDay = d => d ? d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
const daysAgo = iso => { const d = iso ? new Date(iso.length>10 ? iso : iso+'T00:00:00') : null; return d && !isNaN(d) ? Math.round((TODAY - d)/86400000) : null; };
const repKey = n => (window.kdhNameKey ? window.kdhNameKey(n) : String(n).toLowerCase()).replace('|','-').replace(/-$/,'');
// the account's premise, spelled out once
// the hub's "no purchases" target reason (old and new wording)
const NOBUY = /^(Never bought it|No purchases in the available history)/;
const premWord = p => p==='On' ? 'On-premise' : p==='Off' ? 'Off-premise' : '';

/* ---------------- who, and whose accounts ---------------- */
const BOOK = (typeof HUB_ACCOUNTS!=='undefined' && HUB_ACCOUNTS) || {reps:{}};
const rosterAll = Object.keys(BOOK.reps).filter(n=>!window.kdhIsRep || window.kdhIsRep(n));
// A rep: their own roster entry (forgiving match), or nothing. A manager:
// their team (kdhTeam on the trackers' DM groups) or everyone.
let SCOPE = [];            // rep names whose accounts this person may see
let ME = null;             // the rep's own roster name (rep / preview)
if(U && !isMgr){
  ME = window.kdhMatchName ? window.kdhMatchName(U.name, rosterAll) : (rosterAll.includes(U.name) ? U.name : null);
  SCOPE = ME ? [ME] : [];
} else if(U){
  const T = window.kdhTeam ? window.kdhTeam(H.dmGroups || []) : null;
  SCOPE = T ? rosterAll.filter(n => T.reps.includes(n) || (window.kdhMatchName && !!window.kdhMatchName(n, T.reps))) : rosterAll;
}

/* ---------------- state + hash ---------------- */
const state = {view:'list', mode:'list', q:'', rep:'', need:'', kind:'', fam:'', n:null, acctRep:null, from:null, fl:'', limit:120, sec:'over', sub:''};
// The Account page is FOUR SECTIONS (2026-09-30, Gavin's Encompass brief):
// Overview / Sales & Products / Invoices & Balances / Tasks & Resources.
// `sec=` in the hash remembers the open one; in-page links carry
// data-go="<sec>:<element id>" so a Focus item can open its evidence.
// The Account page is FOUR SECTIONS (2026-10-02, after Attio's company
// record): Overview (identity, next actions, sales context, details) /
// Products / History / More (programs, notes, taps, tools, the assistant).
// Same labels on phones and desktop. `sec=` + `sub=` in the hash; old links
// (sec=sales / inv / tasks / ask, data-go="sales:alerts" ...) translate.
const SECS = [['over','Overview'],['products','Products'],['history','History'],['more','More']];
const HSUBS = [['sales','Sales & Alerts'],['patterns','Buying Patterns'],['record','Monthly Record']];
const MSUBS = ['programs','activity','notes','photos','taps','tools','ask','about'];
const LEGACY_SEC = {sales:['history','sales'], inv:['history','record'], tasks:['more',''], ask:['more','ask']};
// in-page destinations: key -> [section, sub-view, element id]
const GO = {'sales:sales':['history','sales','sales'], 'sales:alerts':['history','sales','alerts'], 'sales:patterns':['history','patterns','patterns'],
  'sales:products':['products','','products'], 'sales:discuss':['products','','discuss'], 'inv:inv':['history','record','inv'], 'inv:balances':['history','record','balances'],
  'tasks:programs':['more','programs','programs'], 'tasks:notes':['more','activity','activity'], 'tasks:taps':['more','taps','taps'], 'tasks:tools':['more','tools','tools'], 'ask:ask':['more','ask','ask']};
function goTarget(go){ if(GO[go]) return GO[go]; const [sec, sub, id] = String(go).split(':'); return [sec, sub||'', id||'']; }
// product list (Sales & Products): search, view, filters -- kept in memory per account
const plist = {n:null, q:'', view:'bought', sup:'', fam:'', pkg:'', prog:'', limit:40};
let CATALOG = null;            // data/catalog.json (products + warehouse availability), loaded once
function readHash(){
  const h = (location.hash||'').replace(/^#/,''); const o = {};
  h.split('&').filter(Boolean).forEach(kv=>{ const i = kv.indexOf('='); if(i<0) return; o[kv.slice(0,i)] = decodeURIComponent(kv.slice(i+1)); });
  return o;
}
function applyHash(){
  const h = readHash();
  state.q = h.q || ''; state.rep = h.rep && SCOPE.includes(h.rep) ? h.rep : ''; state.need = h.need || '';
  state.kind = h.kind || ''; state.fam = h.fam || ''; state.mode = h.map==='1' ? 'map' : 'list';
  state.from = h.from || null; state.fl = h.fl || '';
  if(LEGACY_SEC[h.sec]){ state.sec = LEGACY_SEC[h.sec][0]; state.sub = h.sub || LEGACY_SEC[h.sec][1]; }
  else { state.sec = SECS.some(x=>x[0]===h.sec) ? h.sec : 'over'; state.sub = h.sub || ''; }
  if(state.sec==='history' && !HSUBS.some(x=>x[0]===state.sub)) state.sub = 'sales';
  if(state.sec==='more' && !MSUBS.includes(state.sub)) state.sub = '';
  if(state.sec==='more' && state.sub==='notes') state.sub = 'activity';
  if(state.sec==='over' || state.sec==='products') state.sub = '';
  if(h.acct){ state.view = 'acct'; state.n = String(h.acct); } else { state.view = 'list'; state.n = null; }
}
function listHash(){
  const p = [];
  if(state.q) p.push('q='+encodeURIComponent(state.q));
  if(state.rep) p.push('rep='+encodeURIComponent(state.rep));
  if(state.need) p.push('need='+state.need);
  if(state.kind) p.push('kind='+state.kind);
  if(state.fam) p.push('fam='+encodeURIComponent(state.fam));
  if(state.mode==='map') p.push('map=1');
  return '#'+p.join('&');
}
function acctHash(n, rep, sec, sub){ if(sec && sec.includes(':')){ const g = goTarget(sec); sec = g[0]; sub = g[1]; } return '#acct='+encodeURIComponent(n)+(rep && isMgr ? '&rep='+encodeURIComponent(rep) : '')+(sec && sec!=='over' ? '&sec='+sec : '')+(sub ? '&sub='+sub : '')+(state.from ? '&from='+encodeURIComponent(state.from)+'&fl='+encodeURIComponent(state.fl||'') : ''); }
const mapsHref = a => 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([a.address, a.city, 'NJ'].filter(Boolean).join(', '));
const scrollMem = {};
// the list's place (search, filters, rep, scroll) is remembered per tab and
// per viewer (kdh-user.js scope: the signed-in person + any preview), so the
// navigation's My Accounts lands where it was left and nobody else's state leaks
const SK = k => 'kdh_acct:'+(window.kdhScope ? window.kdhScope() : '')+':'+k;
const ss = { get(k){ try{ return sessionStorage.getItem(SK(k)); }catch(e){ return null; } }, set(k, v){ try{ sessionStorage.setItem(SK(k), v); }catch(e){} } };
function rememberList(){ if(window.kdhRemember) window.kdhRemember('accounts', location.pathname + listHash()); ss.set('list', listHash()); }

/* ---------------- data ---------------- */
const repData = new Map();     // rep -> reps/<key>.json
const salesCache = new Map();  // n -> sales/<key>/<n>.json (or null when 404)
const marks = new Map();       // account_num -> rep_actions rows (all statuses)
let marksLoaded = false, marksError = '';
let progIdx = new Map();       // rep -> {targets: Map(n -> [{p, why, warm}]), credited: Map(n -> [rows]), programs:[p]}
async function getJson(url){ const r = await fetch(url, {cache:'no-store'}); if(r.status===404 || r.status===403) return null; if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
async function loadCatalog(){
  if(CATALOG) return CATALOG;
  const d = await getJson('data/catalog.json').catch(()=>null);
  CATALOG = d && d.products ? d : {products:[], inventory:{}, sellSheets:{}};
  CATALOG.byNum = new Map(CATALOG.products.map(r=>[String(r[0]), r]));
  return CATALOG;
}
// account size (class + gross-profit decile) lives in data/size.json, which
// only a manager may fetch (2026-10-01); merged into the rows for a manager
let SIZES = null;
async function loadReps(names){
  if(isMgr && SIZES===null) SIZES = await getJson('data/size.json').catch(()=>null) || {};
  await Promise.all(names.map(async n=>{ if(repData.has(n)) return; const d = await getJson('data/reps/'+repKey(n)+'.json').catch(()=>null);
    if(d && SIZES) d.accounts.forEach(a=>{ const z = SIZES[String(a.n)]; if(z){ a.sizeClass = z.sizeClass; a.decile = z.decile; } });
    repData.set(n, d); }));
}
function cookie(name){ const m = document.cookie.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
// Notes and follow-ups are the hub's rep_actions rows (Supabase, RLS: a rep
// reads their own, a manager reads everyone's). Read-only here; editing
// stays in the hub, which stamps the rows.
async function loadMarks(names){
  if(marksLoaded) return;
  const cfg = window.KDH_AUTH || {}, token = cookie('kdh_at');
  marksLoaded = true;
  if(!cfg.url || !cfg.key || !token || !names.length){ marksError = 'off'; return; }
  try{
    const inList = '('+names.map(n=>'"'+n.replace(/"/g,'')+'"').join(',')+')';
    const url = cfg.url.replace(/\/$/,'')+'/rest/v1/rep_actions?select=program_id,account_num,account_name,status,note,updated_at,rep_name&rep_name=in.'+encodeURIComponent(inList)+'&order=updated_at.desc&limit=5000';
    const r = await fetch(url, {headers:{apikey:cfg.key, authorization:'Bearer '+token, accept:'application/json'}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    (await r.json()).forEach(row=>{ const k = String(row.account_num); if(!marks.has(k)) marks.set(k, []); marks.get(k).push(row); });
  }catch(e){ marksError = e.message||String(e); }
}
// Primary contact (name / phone / email) per account, from the PRIVATE
// account_contacts table (Supabase, RLS = the notes/photos rule: a rep reads
// only their own accounts, a manager all). Never in a committed file -- the
// repo is public. Missing table / not loaded yet -> the page says so.
const contactCache = new Map();
async function loadContact(n){
  const k = String(n);
  if(contactCache.has(k)) return contactCache.get(k);
  const cfg = window.KDH_AUTH || {}, token = cookie('kdh_at');
  let row = null;
  if(cfg.url && cfg.key && token){
    try{
      const r = await fetch(cfg.url.replace(/\/$/,'')+'/rest/v1/account_contacts?select=contact_name,phone,email&customer_num=eq.'+encodeURIComponent(k)+'&limit=1',
        {headers:{apikey:cfg.key, authorization:'Bearer '+token, accept:'application/json'}});
      if(r.ok) row = (await r.json())[0] || null;
    }catch(e){ row = null; }
  }
  contactCache.set(k, row);
  return row;
}
// The programs a rep is in right now: active incentives + this month's MPOs,
// through the hub's own filters (support reps, territory, dollar programs).
function programsFor(rep){
  return H.programs().filter(p=>{
    if(p.type==='MPO'){ if(p.monthKey!==H.mpoRepMonth(p.source)) return false; }
    else if(!H.isActive(p)) return false;
    if(!H.supportAllows(rep, p)) return false;
    const r = p.forRep(rep); if(!r) return false;
    if(H.isDollarProgram(r)) return false;
    if(r.status==='unavailable') return false;
    if(!H.availability(p, rep).ok) return false;
    return true;
  });
}
async function indexPrograms(rep){
  if(progIdx.has(rep)) return progIdx.get(rep);
  const programs = programsFor(rep);
  await H.loadFor(programs.filter(p=>p.type==='MPO'));
  const targets = new Map(), credited = new Map();
  programs.forEach(p=>{
    const r = p.forRep(rep); if(!r || r.soon) return;
    H.nextAccounts(p, rep).rows.filter(a=>!a.foreign).forEach(a=>{ const k = String(a.n!=null ? a.n : 'name:'+a.name); if(!targets.has(k)) targets.set(k, []); targets.get(k).push({p, r, why:a.why||'', warm:!!a.warm, hold:false}); });
    H.distFor(p, rep).forEach(x=>{ const k = String(x.n!=null ? x.n : 'name:'+x.name); if(!credited.has(k)) credited.set(k, []); credited.get(k).push(Object.assign({p}, x)); });
  });
  const out = {programs, targets, credited}; progIdx.set(rep, out); return out;
}
// 60-day resurvey rule, the Tap Tracker's own: overdue past 60 days, due soon from 53.
function tapDue(t){ if(!t || !t.last) return null; const d = daysAgo(t.last); if(d==null) return null; if(d>60) return {level:'overdue', days:d}; if(d>=53) return {level:'soon', days:d}; return {level:'ok', days:d}; }
// Reorder / lapsed / buying-less-often alerts and the buying patterns are
// computed ONCE, in accounts/patterns.py (run by generate.py) and written
// into the data files: a.alerts / a.summary / a.alertProducts on each list
// row, sales.findings on the account file. This page renders them; it
// never re-derives a rule, so the list and the page can't disagree.
const KIND = {reorder:'Possible Reorder', lapsed:'Lapsed Product', slower:'Buying Less Often'};
const every = I => I===1 ? 'every month' : 'every '+I+' months';

/* ---------------- list ---------------- */
function needOf(a, rep){
  const idx = progIdx.get(rep); const k = String(a.n);
  const follow = (marks.get(k)||[]).filter(r=>r.status==='follow').length;
  // "to discuss" = the trackers' own WARM leads for this account (1 SKU
  // short, still on Summer Ale, missing product ...). Plain eligibility is
  // shown on the account page, not counted as attention.
  const progs = idx ? (idx.targets.get(k)||[]).filter(t=>t.warm).length : null;
  const due = tapDue(a.taps);
  const al = a.alerts || {reorder:0, lapsed:0, slower:0};
  const followRows = (marks.get(k)||[]).filter(r=>r.status==='follow');
  const warm = idx ? (idx.targets.get(k)||[]).filter(t=>t.warm).sort((x,y)=>x.p.period.end-y.p.period.end) : [];
  return {follow, progs, reorder: al.reorder||0, lapsed: al.lapsed||0, slower: al.slower||0, lessOften: !!a.lessOften, tap: due && due.level!=='ok' ? due : null,
          products: (al.reorder||0)+(al.lapsed||0)+(al.slower||0), followRows, warm};
}
// THE LEADING ACTION (2026-10-02, Shopify's one-status-per-row): each row
// shows ONE supported action and how many more the account holds. Rules, in
// order -- the most time-bound and most reliable signal wins:
//   1 open follow-up (the rep's own record; newest)
//   2 tap survey past the 60-day resurvey rule
//   3 program lead (the tracker's warm list), soonest program deadline first
//   4 tap survey due within the week (53-60 days)
//   5 possible reorder (backtest: re-bought within 3 months 72-85% of the time)
//   6 lapsed product (52-69% in the same backtest)
//   7 buying less often
// "N More Items" counts every other follow-up, survey, lead and product
// alert on the account. Nothing here changes how an alert is calculated
// (patterns.py) -- only which one is shown first. accounts/README.txt.
function leadOf(a, nd){
  const ap = a.alertProducts || [];
  const firstOf = t => ap.find(x=>x.t===t);
  const items = nd.follow + (nd.tap ? 1 : 0) + nd.warm.length + nd.reorder + nd.lapsed + (nd.slower || (nd.lessOften ? 1 : 0));
  let L = null;
  if(nd.follow){ const r = nd.followRows[0]; L = {k:'follow', g:'follow', label:'Follow-Up', d: progName(r.program_id)}; }
  else if(nd.tap && nd.tap.level==='overdue') L = {k:'tap', g:'tap', label:'Tap Survey Overdue', d: nd.tap.days+' days since the last survey'};
  else if(nd.warm.length){ const t = nd.warm[0]; L = {k:'prog', g:'prog', label:'Program Lead', d: (t.p.shortName||t.p.name)+' · '+H.endsLabel(t.p.period)}; }
  else if(nd.tap) L = {k:'tap', g:'tap', label:'Tap Survey Due', d: 'due in '+plural(Math.max(0, 60-nd.tap.days),'day')};
  else if(nd.reorder){ const x = firstOf('reorder'); L = {k:'reorder', g:'reorder', label:'Possible Reorder', d: x ? x.p : plural(nd.reorder,'product')}; }
  else if(nd.lapsed){ const x = firstOf('lapsed'); L = {k:'lapsed', g:'lapsed', label:'Lapsed Product', d: x ? x.p : plural(nd.lapsed,'product')}; }
  else if(nd.slower || nd.lessOften){ const x = firstOf('slower'); L = {k:'slower', g:'slower', label:'Buying Less Often', d: x ? x.p : 'fewer buying months than the six before'}; }
  // an alert lead states its kind's TOTAL once ("21 products · e.g. X"); "Also ..." then lists only the other kinds
  if(L && (L.k==='reorder' || L.k==='lapsed' || L.k==='slower')){
    const n = L.k==='reorder' ? nd.reorder : L.k==='lapsed' ? nd.lapsed : (nd.slower || (nd.lessOften ? 1 : 0));
    const x = firstOf(L.k);
    if(n > 1) L.d = plural(n,'product') + (x ? ' · e.g. '+x.p : '');
    L.whole = true;
  }
  if(L){
    L.more = Math.max(0, items-1);
    // what the other records ARE, in words (2026-10-02: "13 More Items" said nothing)
    const left = {follow:nd.follow, tap:nd.tap?1:0, prog:nd.warm.length, reorder:nd.reorder, lapsed:nd.lapsed, slower:nd.slower || (nd.lessOften?1:0)};
    left[L.k] = L.whole ? 0 : Math.max(0, (left[L.k]||0)-1);
    const parts = MORE_WORDS.filter(([k])=>left[k]>0).map(([k, one, many])=>left[k]+' '+(left[k]===1 ? one : many));
    L.moreText = parts.length ? 'Also '+parts.join(' · ') : '';
  }
  return L;
}
const MORE_WORDS = [['follow','follow-up','follow-ups'], ['tap','survey due','surveys due'], ['prog','program lead','program leads'], ['reorder','possible reorder','possible reorders'], ['lapsed','lapsed product','lapsed products'], ['slower','product bought less often','products bought less often']];
function hasKind(nd, kind){
  if(kind==='reorder') return nd.reorder>0; if(kind==='lapsed') return nd.lapsed>0; if(kind==='slower') return nd.slower>0 || nd.lessOften;
  if(kind==='follow') return nd.follow>0; if(kind==='prog') return nd.progs>0; if(kind==='tap') return !!nd.tap;
  return false;
}
function matchesNeed(a, nd, need, kind, fam){
  if(fam){
    // brand family: the account buys it (last 12 months) or has an alert on it
    const buys = (a.families||[]).includes(fam) || (a.alertProducts||[]).some(x=>x.f===fam);
    if(!buys) return false;
  }
  if(need==='follow') return nd.follow>0;
  if(need==='any'){
    if(kind){
      if(fam && (kind==='reorder' || kind==='lapsed' || kind==='slower')) return (a.alertProducts||[]).some(x=>x.t===kind && x.f===fam);
      return hasKind(nd, kind);
    }
    return !!(nd.follow || nd.progs || nd.tap || nd.products || nd.lessOften);
  }
  return true;
}
function renderList(){
  const reps = state.rep ? [state.rep] : SCOPE;
  const rows = [];
  reps.forEach(rep=>{ const d = repData.get(rep); if(!d) return; d.accounts.forEach(a=>rows.push({a, rep, nd: needOf(a, rep)})); });
  rows.sort((x,y)=>x.a.name.localeCompare(y.a.name));
  const q = state.q.trim().toLowerCase();
  const shown = rows.filter(({a, rep, nd})=>{
    if(q && !(a.name.toLowerCase().includes(q) || String(a.n).includes(q) || (a.city||'').toLowerCase().includes(q) || (isMgr && rep.toLowerCase().includes(q)))) return false;
    return matchesNeed(a, nd, state.need, state.kind, state.fam);
  });
  const attention = rows.filter(({a, nd})=>matchesNeed(a, nd, 'any', '', '')).length;
  const flagged = rows.filter(({nd})=>nd.products || nd.lessOften).length;
  const productAlerts = rows.reduce((t,{nd})=>t+nd.products, 0);
  const fams = Array.from(new Set(rows.flatMap(({a})=>(a.families||[]).concat((a.alertProducts||[]).map(x=>x.f))))).filter(Boolean).sort();
  const missing = reps.filter(r=>!repData.get(r));
  const who = !isMgr ? '' : (SCOPE.length===rosterAll.length ? 'Every rep' : 'Your team');
  const title = isMgr ? 'Team Accounts' : 'My Accounts';
  const sub = isMgr ? (state.rep ? E(state.rep) : `${plural(SCOPE.length,'rep')} · ${who}`) : 'Your route';
  const first = repData.get(reps[0]);
  const ref = first && first.sales.ref ? first.sales.ref : (first ? first.sales.through : '');
  const fresh = first ? `Customer base as of ${E(first.book.asOf)} · sales through ${E(monLabel(ref))} · tap surveys as of ${E((first.taps.asOf||'').slice(0,10))}` : '';
  const follows = rows.filter(({nd})=>nd.follow>0).length;
  const kindOpts = [['', 'All Reasons'], ['reorder', 'Possible reorder'], ['slower', 'Buying less often'], ['lapsed', 'Lapsed product'], ['follow', 'Open follow-up'], ['prog', 'Program lead'], ['tap', 'Survey due or overdue']];
  const active = state.need==='any';
  // the three views as one segmented control (Shopify's filter tabs): the
  // selected one is filled, each says how many accounts it holds
  const segs = [['', 'All', rows.length], ['any', 'Needs Attention', attention], ['follow', 'Follow-Ups', follows]];
  const segHtml = `<div class="seg" id="needSeg" role="group" aria-label="Show">${segs.map(([v, l, c])=>`<button type="button" data-need="${v}" aria-pressed="${state.need===v}"${state.need===v ? ' class="on"' : ''}>${l}<span class="n">${c}</span></button>`).join('')}</div>`;
  // COMPACT HEADER (2026-10-01, third pass; Shopify's list header): title and
  // counts on one line, search, the three views, then one row of small
  // labelled controls -- Reason (Needs Attention only), More Filters, Data --
  // with the dates and the rule text inside them instead of above the list.
  const dataLbl = first ? `<span class="dl">Data </span>${E(monLabel(ref))}` : 'Data';
  // LIST / MAP (2026-10-02): one selector; the map draws exactly the rows the
  // list would show (same search, filters and authorized accounts)
  const viewSeg = `<div class="seg vseg" id="viewSeg" role="group" aria-label="View">${[['list','List'],['map','Map']].map(([v,l])=>`<button type="button" data-mode="${v}" aria-pressed="${state.mode===v}"${state.mode===v?' class="on"':''}>${l}</button>`).join('')}</div>`;
  app.innerHTML = `<header class="ws lhead"><div class="lh-top"><h1>${title}</h1>${viewSeg}</div><div class="id"><p class="idline">${sub}${flagged ? ` · ${plural(flagged,'account')} with buying alerts` : ''}${ref ? ` · sales through ${E(monLabel(ref))}` : ''}</p></div></header>
    <div id="laterStrip"></div>
    <div class="filters">
      <input type="search" class="kdh-field" id="q" placeholder="Search by name, town or #${isMgr?' or rep':''}" value="${E(state.q)}" autocomplete="off" aria-label="Search accounts">
      ${isMgr ? `<select id="repSel" aria-label="Rep"><option value="">All my reps</option>${SCOPE.map(r=>`<option value="${E(r)}"${r===state.rep?' selected':''}>${E(r)}</option>`).join('')}</select>` : ''}
      ${segHtml}
      <div class="fbar">
        ${active ? `<label class="fsel"><select id="kindSel" aria-label="Reason">${kindOpts.map(([v,l])=>`<option value="${v}"${state.kind===v?' selected':''}>${l}</option>`).join('')}</select></label>` : ''}
        <details class="more-filters fpop"${state.fam ? ' open' : ''}><summary>Filters${state.fam ? ' · 1' : ''}</summary>
          <div class="fpanel"><div class="mf-row"><label for="famSel">Brand family</label><select id="famSel" aria-label="Brand family"><option value="">Any brand family</option>${fams.map(f=>`<option value="${E(f)}"${f===state.fam?' selected':''}>${E(f)}</option>`).join('')}</select>${state.fam ? `<button type="button" class="btn outline" id="famClear">Clear</button>` : ''}</div>
          <p class="note">Matches accounts that bought the family in the last 12 months or have an alert on one of its products. With a reason, only alerts on that family count.</p></div>
        </details>
        <details class="fpop fdata"><summary>${dataLbl}</summary>
          <div class="fpanel"><p class="note">${fresh}</p>
          <p class="note legend"><b>Needs Attention</b> = an open follow-up, a program lead, a tap survey due, or a buying alert: <b>possible reorder</b> (a regular product past its usual gap), <b>buying less often</b> (fewer buying months than the six before), <b>lapsed product</b> (no recent purchase of a recurring product). Alerts are read from Fusion through ${E(monLabel(ref))} — a possibility to check, not a confirmed need.</p></div>
        </details>
      </div>
    </div>
    ${missing.length ? `<div class="kdh-state unavailable"><b>No account list on file for ${E(missing.join(', '))}.</b><span>The customer base report has no accounts under that name, or the data slice has not been generated.</span></div>` : ''}
    ${!SCOPE.length ? `<div class="kdh-state unavailable"><b>We couldn’t find your name on the customer base.</b><span>You’re signed in as ${E(U ? U.name : '')}. Ask Gavin to check the spelling on the access list.</span></div>` : ''}
    ${state.mode==='map' ? `<div id="mapSlot" class="mapslot"></div>` : `${shown.length!==rows.length || state.q ? `<p class="count">Showing ${shown.length} of ${plural(rows.length,'account')}</p>` : ''}
    <div id="rows">${listBody(shown, rows)}</div>
    ${shown.length>state.limit ? `<button class="btn outline more" id="more" type="button">Show ${Math.min(120, shown.length-state.limit)} more of ${shown.length}</button>` : ''}`}`;
  if(state.mode==='map' && window.KdhMap){
    // "All Assigned Accounts": there is no route schedule in the data, so no
    // Today's Stops view and no stop order (REPORTING_REQUEST.md asks for it)
    const scopeLabel = isMgr ? (state.rep ? E(state.rep)+'’s Accounts' : 'Team Accounts') : 'All Assigned Accounts';
    window.KdhMap.mount($('#mapSlot'), shown.map(x=>({a:x.a, rep:x.rep, lead:leadOf(x.a, x.nd), showRep:isMgr})),
      {scopeLabel, hrefFor: it=>acctHash(it.a.n, it.rep), mapsHref, premWord, memKey: SK('map'), restoreView: !!ss.get('mapback')});
    ss.set('mapback', '');
  }
  rememberList();
  const mb = $('#more'); if(mb) mb.addEventListener('click', ()=>{ state.limit += 120; const y = window.scrollY; renderList(); window.scrollTo(0, y); });
  let qT = 0;
  $('#q').addEventListener('input', e=>{ state.q = e.target.value; history.replaceState(null,'',listHash()); if(state.mode==='map'){ clearTimeout(qT); qT = setTimeout(renderListRowsOnly, 300); return; } const list = $('#rows'); if(list) renderListRowsOnly(); });
  document.querySelectorAll('#viewSeg [data-mode]').forEach(b=>b.addEventListener('click', ()=>{ if(state.mode===b.dataset.mode) return; state.mode = b.dataset.mode; history.replaceState(null,'',listHash()); render(); }));
  const rs = $('#repSel'); if(rs) rs.addEventListener('change', e=>{ state.rep = e.target.value; history.replaceState(null,'',listHash()); render(); });
  document.querySelectorAll('#needSeg [data-need]').forEach(b=>b.addEventListener('click', ()=>{ state.need = b.dataset.need; if(state.need!=='any') state.kind = ''; history.replaceState(null,'',listHash()); render(); }));
  const ks = $('#kindSel'); if(ks) ks.addEventListener('change', e=>{ state.kind = e.target.value; history.replaceState(null,'',listHash()); render(); });
  $('#famSel').addEventListener('change', e=>{ state.fam = e.target.value; history.replaceState(null,'',listHash()); render(); });
  const fc = $('#famClear'); if(fc) fc.addEventListener('click', ()=>{ state.fam = ''; history.replaceState(null,'',listHash()); render(); });
  fillLater();
}
// One list row (Shopify All Customers): the account name, town · #CustomerID
// (· premise · rep for a manager), then ONE leading action and a count of the
// rest. Accounts with nothing to do stay plain two-line rows.
function rowHtml({a, rep, nd}){
  const L = leadOf(a, nd);
  return `<a class="row arow" href="${acctHash(a.n, rep)}" data-n="${E(a.n)}" data-rep="${E(rep)}">
        <span class="row-main"><h3>${E(a.name)}</h3><span class="row-s">${E([a.city, '#'+a.n, premWord(a.prem)].filter(Boolean).join(' · '))}${isMgr ? ` · <span class="rep">${E(rep)}</span>` : ''}</span>${L ? `<span class="row-lead k-${L.k}"><b>${E(L.label)}</b><span class="ld">${E(L.d)}</span>${L.moreText ? `<span class="lm">${E(L.moreText)}</span>` : ''}</span>` : ''}</span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></a>`;
}
// NEEDS ATTENTION, BY LEADING ACTION (Todoist's sections): each account once,
// under the action its row leads with. Filtering is unchanged (matchesNeed).
const GROUPS = [['follow','Follow-Ups'], ['tap','Tap Surveys'], ['prog','Program Leads'], ['reorder','Possible Reorders'], ['lapsed','Lapsed Products'], ['slower','Buying Less Often']];
function listBody(shown, rows){
  if(!shown.length) return rows.length ? `<div class="kdh-state empty"><b>No account matches.</b><span>Clear the search or pick another filter.</span></div>` : '';
  const grouped = state.need==='any' && !state.kind;
  if(!grouped) return `<div class="rows">${shown.slice(0, state.limit).map(rowHtml).join('')}</div>`;
  const by = new Map(GROUPS.map(g=>[g[0], []]));
  shown.forEach(x=>{ const L = leadOf(x.a, x.nd); by.get(L ? L.g : 'slower').push(x); });
  let left = state.limit;
  return GROUPS.filter(g=>by.get(g[0]).length).map(g=>{ const list = by.get(g[0]); const take = list.slice(0, Math.max(0, left)); left -= take.length; if(!take.length) return '';
    return `<h3 class="lgroup" data-g="${g[0]}">${E(g[1])} <span>${list.length}</span></h3><div class="rows">${take.map(rowHtml).join('')}</div>`; }).join('');
}
// SAVED FOR LATER (2026-10-05): photo records this person started and kept on this phone, any account,
// so a rep who hurried out of a store finds them again. Device-only (IndexedDB), the real signed-in person only.
async function fillLater(){
  const el = document.getElementById('laterStrip'); if(!el || !window.KdhActivity || !window.KdhActivity.savedForLater || (U && U.preview)) return;
  let list = []; try{ list = await window.KdhActivity.savedForLater(); }catch(e){}
  if(!list.length || !el.isConnected){ el.innerHTML = ''; return; }
  const byAcct = new Map(); list.forEach(d=>{ const k = d.n; if(!byAcct.has(k)) byAcct.set(k, []); byAcct.get(k).push(d); });
  el.innerHTML = `<section class="later" aria-label="Saved for later"><p class="later-h">Saved for Later <span>${list.length} on this phone · not on the account yet</span></p>
    ${Array.from(byAcct.entries()).map(([n, ds])=>`<a class="later-row" href="#acct=${encodeURIComponent(n)}"><b>${E(ds[0].name || ('Account #'+n))}</b><span>${E(ds.map(d=>d.label).join(' · '))}${ds.some(d=>d.state==='failed' || d.state==='pending') ? ' · needs Retry' : ''}</span></a>`).join('')}</section>`;
}
function renderListRowsOnly(){ const y = window.scrollY; renderList(); const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); window.scrollTo(0, y); }

/* ---------------- account page ---------------- */
function findAccount(n){
  for(const rep of SCOPE){ const d = repData.get(rep); if(!d) continue; const a = d.accounts.find(x=>String(x.n)===String(n)); if(a) return {a, rep, d}; }
  return null;
}
const back = (label, href) => `<a class="hreturn" href="${E(href)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span>${E(label)}</span></a>`;
function progLink(p, rep){ return HUB+'#view=detail&rep='+encodeURIComponent(rep)+'&cat='+(p.type==='MPO' ? p.source : 'inc')+'&prog='+encodeURIComponent(p.id); }
function hubAcctLink(p, rep, n, list){ return HUB+'#view=acct&rep='+encodeURIComponent(rep)+'&cat='+(p ? (p.type==='MPO' ? p.source : 'inc') : 'inc')+(p ? '&prog='+encodeURIComponent(p.id) : '')+'&n='+encodeURIComponent(n)+'&list='+(list||'targets'); }
function progName(id){ if(/^note:/.test(id||'')) return 'Account Note'; const p = H.programs().find(x=>x.id===id); return p ? (p.shortName||p.name)+(p.type==='MPO' ? ' · '+p.channelLabel+' MPO' : '') : id; }
function sumRange(arr, from, to){ let s = 0; for(let i=from;i<to;i++) s += arr[i]||0; return s; }
function rangeLabel(months, from, to){ const a = months[from], b = months[to-1]; return (a.slice(0,4)===b.slice(0,4) ? monShort(a) : monLabel(a))+'–'+monLabel(b); }

async function renderAccount(){
  const hit = findAccount(state.n);
  const fromHref = state.from || (ss.get('list') || './');
  const fromLabel = state.fl || (isMgr ? 'Accounts' : 'My Accounts');
  if(!hit){
    app.innerHTML = back(fromLabel, fromHref) + `<div class="kdh-state unavailable"><b>That account is not on ${isMgr ? 'your team’s' : 'your'} list.</b><span>Accounts open only from the assigned route${isMgr ? 's of the reps you oversee' : ''}.</span></div>`;
    return;
  }
  const {a, rep, d} = hit;
  const headHtml = `<div class="acct-head"><h1>${E(a.name)}</h1><p class="sub">${E([a.city, premWord(a.prem), 'Account #'+a.n].filter(Boolean).join(' · '))}${isMgr ? `<span class="sub2"> · Rep: ${E(rep)}</span>` : ''}</p></div>`;
  app.innerHTML = back(fromLabel, fromHref) + headHtml + `<div class="kdh-state loading">Loading this account…</div>`;
  // everything the page needs, in parallel
  const key = repKey(rep);
  const [sales, idx, , CAT, ACT, ED, CONTACT] = await Promise.all([
    salesCache.has(String(a.n)) ? Promise.resolve(salesCache.get(String(a.n))) : getJson('data/sales/'+key+'/'+encodeURIComponent(a.n)+'.json').catch(()=>null).then(s=>{ salesCache.set(String(a.n), s); return s; }),
    indexPrograms(rep),
    loadMarks(SCOPE),
    loadCatalog(),
    window.KdhActivity ? window.KdhActivity.load(String(a.n)).catch(()=>null) : Promise.resolve(null),
    window.KdhElig ? window.KdhElig.load(rep).catch(()=>null) : Promise.resolve(null),
    loadContact(a.n),
  ]);
  if(CONTACT){ a.contact_name = CONTACT.contact_name || ''; a.phone = CONTACT.phone || ''; a.email = CONTACT.email || ''; }
  const ELIG_ACC = window.KdhElig ? window.KdhElig.forAccount(a.n, ED) : [];
  if(state.view!=='acct' || String(state.n)!==String(a.n)) return;   // navigated away meanwhile
  const k = String(a.n);
  // this account's rep_actions: the notes module's account-level read when it
  // worked (every note the caller may see, with follow-up dates), else the
  // route rep's own marks loaded with the list
  const rows = (ACT && !ACT.notesErr && ACT.notes) ? ACT.notes : (marks.get(k) || []);
  const follows = rows.filter(r=>r.status==='follow');
  const targets = idx.targets.get(k) || [];
  const credited = idx.credited.get(k) || [];
  const due = tapDue(a.taps);
  const months = sales ? sales.months : (d.sales.months||[]);
  const N = months.length;
  const F = (sales && sales.findings) || {alerts:[], counts:{reorder:0,lapsed:0,slower:0}, patterns:null};
  const alerts = F.alerts || [];
  const refKey = F.ref || d.sales.ref || months[N-1];
  const R = months.indexOf(refKey) >= 0 ? months.indexOf(refKey) : N-1;   // reference = last complete month
  // one alert, explained: what, the pattern, the gap, the supporting numbers
  const alertShort = x => {
    const bits = [`${x.buying} of the last 18 months`, `${plural(x.since,'month')} since`];
    if(x.type==='slower') bits.push(`${x.recent6} of 6 months in ${rangeLabel(months, R-5, R+1)} vs ${x.prior6} in ${rangeLabel(months, R-11, R-5)}`);
    if(x.switch) bits.push(`${x.family} still bought: ${x.switch.product}, ${monLabel(x.switch.month)}`);
    return bits.join(' · ');
  };
  const alertWhy = x => {
    const bits = [`bought in ${x.buying} of the last 18 months, usually ${every(x.interval)}`, `last in ${monLabel(x.last)} (${plural(x.since,'month')} ago in the data)`];
    if(x.type==='lapsed') bits.push(`past the ${x.lapseAt}-month mark that counts as lapsed for a product bought ${every(x.interval)}`);
    if(x.type==='slower') bits.push(`${x.recent6} buying ${x.recent6===1?'month':'months'} in ${rangeLabel(months, R-5, R+1)} vs ${x.prior6} in ${rangeLabel(months, R-11, R-5)}`);
    if(x.usual) bits.push(`usual order ${fmtN(x.usual)} cs`);
    if(x.switch) bits.push(`${x.family} still bought: ${x.switch.product} in ${monLabel(x.switch.month)}`);
    return bits.join(' · ');
  };

  /* ---- Focus: up to three supported actions, in a fixed order ---- */
  const focus = [];
  follows.slice(0,1).forEach(r=>/^note:/.test(r.program_id||'') ? focus.push({kind:'Follow-Up', ws:`${r.follow_on ? (r.follow_on < new Date().toISOString().slice(0,10) ? 'Overdue · was due ' : 'Due ')+E(fmtDay(new Date(r.follow_on+'T12:00:00'))) : 'Added '+E(fmtDay(new Date(r.created_at||r.updated_at)))}${r.rep_name && isMgr ? ' · '+E(r.rep_name) : ''}`, t:E(r.note||'Follow up'), go:'over::activity', hl:'View Note'}) : focus.push({kind:'Follow-up', ws:`Flagged ${E(fmtDay(new Date(r.updated_at)))}${r.note ? ' · “'+E(r.note)+'”' : ''}`, t:`Follow up on ${E(progName(r.program_id))}`, w:`You flagged this account ${E(fmtDay(new Date(r.updated_at)))}${r.note ? ' — “'+E(r.note)+'”' : ''}.`, n:`Pick the conversation back up, then mark it Done in the hub.`, href:hubAcctLink(H.programs().find(p=>p.id===r.program_id), rep, a.n, 'follow'), hl:'View Follow-up'}));
  if(due && due.level==='overdue') focus.push({kind:'Tap Survey', ws:`Last surveyed ${E(a.taps.lastDisplay||a.taps.last)} · ${due.days} days ago`, t:'Resurvey the taps', w:`Last surveyed ${E(a.taps.lastDisplay||a.taps.last)}, ${due.days} days ago — past the 60-day window.`, n:'Walk the taps and submit the survey in iSellBeer.', href:TAP+'#q='+encodeURIComponent(a.name), hl:'View in Tap Tracker'});
  targets.filter(t=>t.p.period.end >= TODAY && (t.warm || (t.p.period.end - TODAY)/86400000 <= 14)).sort((x,y)=>(y.warm-x.warm) || (x.p.period.end-y.p.period.end)).slice(0, 2).forEach(t=>{
    const f = H.progFacts(t.p, t.r, rep);
    focus.push({kind: t.warm ? 'Program Lead' : 'Program Ending Soon', ws:`${E(t.p.shortName||t.p.name)} · ${E(H.endsLabel(t.p.period))}`, t:E(H.sellAsk(t.p)), w:`${E(t.p.shortName||t.p.name)} (${E(t.p.supplier)}) · ${E(t.why || 'this account is eligible and not buying it yet')} · ${E(H.endsLabel(t.p.period))}.`, n:`You are at ${f.main}${f.need && f.need!=='Goal met' ? ' — '+f.need : ''}.`, href:progLink(t.p, rep), hl:'View Program'});
  });
  // strongest buying alerts: lapsed before possible reorder, biggest usual order first (patterns.py's order)
  alerts.filter(x=>x.type!=='slower').slice(0,2).forEach(x=>focus.push({kind: KIND[x.type], t: x.type==='lapsed' ? `No recent purchase of ${E(x.product)}` : `Ask about ${E(x.product)}`, w: E(alertWhy(x))+'.', ws: `Last bought ${E(monLabel(x.last))} · usually ${E(every(x.interval))}${x.switch ? ` · ${E(x.family)} still bought` : ''}`, cs: x.type==='lapsed' ? 'Check with the buyer; ordering history does not explain the gap' : 'Not a confirmed need', caveat:1, n: x.type==='lapsed' ? 'Find out whether they stopped or switched — the data shows the gap, not the reason.' : 'Check whether they need a reorder — a gap in the data, not a confirmed need.', go:'sales:alerts', hl:'View Purchase History'}));
  if(F.patterns && F.patterns.lessOften && !alerts.length) focus.push({kind:'Buying Less Often', cs:'Not a confirmed problem', t:'Purchasing less frequently', w:`${F.patterns.freq.recent6} buying ${F.patterns.freq.recent6===1?'month':'months'} in ${E(rangeLabel(months, R-5, R+1))} vs ${F.patterns.freq.prior6} in ${E(rangeLabel(months, R-11, R-5))}.`, caveat:1, n:'Ask what changed — a slower pattern in the data, not a confirmed problem.', go:'sales:patterns', hl:'View Buying Patterns'});
  const top = focus.slice(0,3);

  /* ---- Sales & reorders ---- */
  let salesHtml;
  if(!sales || !sales.products.length){
    salesHtml = `<div class="card"><p>${a.inMaster===false ? 'This account number is not in the Fusion sales master, so there is no purchase history to show.' : `No cases on record for this account between ${E(monLabel(months[0]))} and ${E(monLabel(months[N-1]))}.`}</p></div>`;
  } else {
    const s = sales.series;
    const last3 = sumRange(s, N-3, N), prior3 = sumRange(s, N-6, N-3), ly3 = N>=15 ? sumRange(s, N-15, N-12) : null;
    const lastIdx = (()=>{ for(let i=N-1;i>=0;i--) if(s[i]>0) return i; return -1; })();
    const recent = sales.products.filter(p=>sumRange(p[5], N-3, N)>0).slice(0, 8);
    const recentRows = recent.map(p=>{ const li = (()=>{ for(let i=N-1;i>=0;i--) if(p[5][i]>0) return i; return -1; })();
      return `<tr><td><b>${E(p[1])}</b><span class="sub">${E([p[2], p[4]].filter(Boolean).join(' · '))}</span></td><td class="num" data-l="${E(rangeLabel(months,N-3,N))}">${fmtN(sumRange(p[5],N-3,N))}</td><td class="num" data-l="${E(rangeLabel(months,N-6,N-3))}">${fmtN(sumRange(p[5],N-6,N-3))}</td><td class="num" data-l="Last bought">${li>=0 ? E(monLabel(months[li])) : '—'}</td></tr>`; }).join('');
    const tagOf = t => `<span class="tag ${t}">${KIND[t]}</span>`;
    const onOver = new Set(alerts.filter(x=>x.type!=='slower').slice(0,2));
    const alertRows = alerts.slice(0, 8).map(x=>`<tr${onOver.has(x) ? ' class="hi"' : ''}><td>${tagOf(x.type)}${onOver.has(x) ? ' <span class="tag go">In Next Actions</span>' : ''} <b>${E(x.product)}</b><span class="sub">${E([x.family, x.pkg].filter(Boolean).join(' · '))} · ${E(alertShort(x))}</span></td><td class="num" data-l="Usually">${E(every(x.interval))}</td><td class="num" data-l="Last bought">${E(monLabel(x.last))}</td><td class="num" data-l="Usual order">${fmtN(x.usual)} cs</td></tr>`).join('');
    const cnt = F.counts || {};
    const alertHead = [cnt.reorder ? plural(cnt.reorder,'possible reorder') : '', cnt.lapsed ? plural(cnt.lapsed,'lapsed product') : '', cnt.slower ? cnt.slower+' bought less often' : ''].filter(Boolean).join(' · ');
    const hist = sales.products.slice(0, 40).map(p=>`<div class="hist"><b>${E(p[1])}</b> · ${p[5].map((c,i)=>c>0 ? monShort(months[i])+' '+fmtN(c) : '').filter(Boolean).join(' · ') || 'no cases'}</div>`).join('');
    salesHtml = `<div class="card">
      <div class="kv"><span>Last purchase</span><span>${lastIdx>=0 ? E(monLabel(months[lastIdx])) : 'none in the data'}</span></div>
      <div class="kv"><span>${E(rangeLabel(months,N-3,N))}</span><span><b>${fmtN(last3)} cases</b> · ${E(rangeLabel(months,N-6,N-3))}: ${fmtN(prior3)}${ly3!=null ? ' · '+E(rangeLabel(months,N-15,N-12))+': '+fmtN(ly3) : ''}</span></div>
      <div class="kv"><span>Products</span><span>${plural(sales.products.filter(p=>sumRange(p[5],N-12,N)>0).length,'product')} bought in the last 12 months</span></div>
      <h3 class="note" id="alerts" style="margin-top:12px"><b>Buying Alerts</b> · ${alerts.length ? alertHead : 'none'} <small>· data through ${E(monLabel(refKey))}</small></h3>
      ${alerts.length ? `<table class="tbl alerts"><thead><tr><th>Product</th><th class="num">Usually</th><th class="num">Last bought</th><th class="num">Usual order</th></tr></thead><tbody>${alertRows}</tbody></table>${alerts.length>8 ? `<details class="fold"><summary>Show ${alerts.length-8} More Alerts</summary><table class="tbl alerts"><tbody>${alerts.slice(8).map(x=>`<tr><td>${tagOf(x.type)} <b>${E(x.product)}</b><span class="sub">${E(alertShort(x))}</span></td><td class="num" data-l="Usually">${E(every(x.interval))}</td><td class="num" data-l="Last bought">${E(monLabel(x.last))}</td><td class="num" data-l="Usual order">${fmtN(x.usual)} cs</td></tr>`).join('')}</tbody></table></details>` : ''}<p class="note">A <b>possible reorder</b> is a regular product (6+ of the last 18 months, usually ≤3 months apart) at least a month past its usual gap; <b>lapsed</b> is the same product past ${'twice'} its gap (never sooner than 3 months); <b>buying less often</b> is a product still being bought, but in 3+ fewer months than the six before. Each is a possibility to check — the data has no shelf stock, sell-through or reason. <b>Order:</b> lapsed first, then possible reorders, then buying less often; within each, the biggest usual order first. The top two (not “buying less often”) are the ones in Next Actions.</p>` : `<p class="note">No regular product is past its usual gap in the data, and none is being bought noticeably less often.</p>`}
      <h3 class="note" style="margin-top:6px"><b>Recent purchases</b> · top products of ${E(rangeLabel(months,N-3,N))}</h3>
      ${recent.length ? `<table class="tbl"><thead><tr><th>Product</th><th class="num">${E(rangeLabel(months,N-3,N))}</th><th class="num">${E(rangeLabel(months,N-6,N-3))}</th><th class="num">Last bought</th></tr></thead><tbody>${recentRows}</tbody></table>` : `<p class="note">Nothing bought in ${E(rangeLabel(months,N-3,N))}.</p>`}
      <details class="fold" id="sales"><summary>Purchase History by Product (${plural(sales.products.length,'product')}, ${E(monLabel(months[0]))} – ${E(monLabel(months[N-1]))})</summary>${hist}${sales.products.length>40 ? `<p class="note">Showing the 40 biggest products of the last 12 months.</p>` : ''}</details>
    </div>`;
  }

  /* ---- Buying patterns: the account's own history, in fair equal-length comparisons ---- */
  let patHtml = '';
  if(F.patterns){
    const P = F.patterns, v = P.volume, fq = P.freq, os = P.orderSize;
    const pct = (now, before) => (before && before >= 10) ? ` (${now>=before?'+':''}${Math.round((now-before)/before*100)}%)` : '';
    const kv = (l, v) => `<div class="kv"><span>${l}</span><span>${v}</span></div>`;
    const lab3 = rangeLabel(months, R-2, R+1), labP3 = R>=5 ? rangeLabel(months, R-5, R-2) : '', labLy = R>=14 ? rangeLabel(months, R-14, R-11) : '';
    const lab6 = rangeLabel(months, R-5, R+1), labP6 = rangeLabel(months, R-11, R-5);
    const list = xs => xs.map(E).join(', ');
    const top = P.topProducts.map(t=>`<div class="hist"><b>${E(t.product)}</b> · ${t.months12} of 12 months · ${fmtN(t.cases12)} cs · ${t.kind==='regular' ? every(t.interval) : t.kind==='one-time' ? 'one-time' : t.kind==='stopped' ? 'no longer bought' : E(t.kind)}</div>`).join('');
    const famsHtml = P.topFamilies.map(f=>`<div class="hist"><b>${E(f.family)}</b> · ${fmtN(f.cases12)} cs in 12 months${f.last ? ' · last '+E(monLabel(f.last)) : ''}${f.kind==='regular' ? ' · '+every(f.interval) : ''}</div>`).join('');
    const newPl = P.newPlacements.map(n=>`<div class="hist"><b>${E(n.product)}</b> · first ${E(monLabel(n.first))} · ${n.repeat ? `<span class="tag ok">Repeated</span> ${plural(n.buying,'buying month')}` : n.since>=2 ? `<span class="tag warn">One-time so far</span> not bought since` : 'one purchase so far'}</div>`).join('');
    const sizes = P.sizeChanges.map(c=>`<div class="hist"><b>${E(c.product)}</b> · ${fmtN(c.prior)} → ${fmtN(c.recent)} cs per order (${c.dir})</div>`).join('');
    const stopped = P.stopped.map(c=>`<div class="hist"><b>${E(c.product)}</b> · was ${every(c.interval)} · last ${E(monLabel(c.last))}</div>`).join('');
    const seasonal = P.seasonal.map(c=>`<div class="hist"><b>${E(c.product)}</b> · last ${E(monLabel(c.last))}</div>`).join('');
    const switching = alerts.filter(x=>x.switch).slice(0,5).map(x=>`<div class="hist"><b>${E(x.product)}</b> last ${E(monLabel(x.last))} → <b>${E(x.switch.product)}</b> ${E(monLabel(x.switch.month))} (${E(x.family)})</div>`).join('');
    const freqLine = fq.prior6 ? `<b>${fq.recent6} of 6 months</b> in ${E(lab6)} · ${fq.prior6} of 6 in ${E(labP6)}${P.lessOften ? ' · <span class="tag warn">Less often</span>' : fq.recent6 > fq.prior6 ? ' · <span class="tag ok">More often</span>' : ''}` : `<b>${fq.recent6} of 6 months</b> in ${E(lab6)} · no purchases in ${E(labP6)}`;
    const sizeLine = os.recent!=null ? `<b>${fmtN(os.recent)} cs</b> per buying month, last 6 buying months${os.prior!=null ? ` · ${fmtN(os.prior)} the 6 before${pct(os.recent, os.prior)}` : ' · not enough earlier months to compare'}` : 'fewer than 3 buying months on record';
    const volLine = `<b>${fmtN(v.last3)} cs</b> in ${E(lab3)}${v.prior3!=null ? ` · ${fmtN(v.prior3)} in ${E(labP3)}${pct(v.last3, v.prior3)}` : ''}${v.ly3!=null ? ` · ${fmtN(v.ly3)} in ${E(labLy)}${pct(v.last3, v.ly3)}` : ''}`;
    const mix = [P.recurringN ? plural(P.recurringN,'regular product') : '', P.consistentN ? P.consistentN+' bought 9+ of the last 12 months' : '', P.occasionalN ? P.occasionalN+' occasional' : '', P.oneTimeN ? P.oneTimeN+' one-time' : '', P.seasonalN ? P.seasonalN+' seasonal' : '', P.stoppedN ? P.stoppedN+' no longer bought' : ''].filter(Boolean).join(' · ');
    patHtml = `<div class="card" id="patterns">
      ${kv('Buying months', freqLine)}
      ${kv('Order size', sizeLine)}
      ${kv('Volume', volLine)}
      ${kv('Product mix', mix || 'no products on record')}
      ${P.consistent.length ? kv('Consistent', list(P.consistent)) : ''}
      ${top ? `<details class="fold"><summary>Top Products · Last 12 Months</summary>${top}</details>` : ''}
      ${famsHtml ? `<details class="fold"><summary>Top Brand Families · Last 12 Months</summary>${famsHtml}</details>` : ''}
      ${newPl ? `<details class="fold" open><summary>New Placements · First Bought in the Last 6 Months (${P.newPlacementsN}, ${P.newRepeatN} repeated)</summary>${newPl}${P.newPlacementsN>P.newPlacements.length ? `<p class="note">Newest ${P.newPlacements.length} of ${P.newPlacementsN}.</p>` : ''}</details>` : ''}
      ${sizes ? `<details class="fold"><summary>Order Size Changed · ${P.sizeChanges.length} ${P.sizeChanges.length===1?'product':'products'}</summary>${sizes}<p class="note">Median cases per buying month, the last 6 buying months against the 6 before; shown only when the change is at least 25% and 2 cases.</p></details>` : ''}
      ${switching ? `<details class="fold"><summary>Possible Switches Within a Family · ${alerts.filter(x=>x.switch).length}</summary>${switching}<p class="note">A product on alert whose brand family kept selling through another product — a switch is the likely story, so ask before pitching the old one back.</p></details>` : ''}
      ${stopped ? `<details class="fold"><summary>Recurring Products No Longer Bought · ${P.stoppedN}</summary>${stopped}<p class="note">Were regular, not bought for well past their gap (${'lapsed mark + 3 months'}). History, not an alert.</p></details>` : ''}
      ${seasonal ? `<details class="fold"><summary>Seasonal or Irregular · ${P.seasonalN + P.irregularN}</summary>${seasonal}<p class="note">Bought in bursts with long gaps across more than one year — never alerted, since the gap is the pattern.</p></details>` : ''}
      <p class="note">Periods are equal length and labelled; percentages appear only on a base of 10+ cases. Frequency (buying months) and order size are kept apart on purpose. Monthly data cannot show days between orders — see the reporting request.</p>
    </div>`;
  }

  /* ---- Programs: what this ACCOUNT can still earn, kept apart from the rep's progress.
     Credited / warm lead / already buying stay open; plain eligibility ("could
     still qualify") and programs where the account is not on any list fold. ---- */
  const pitem = (p, tag, line, links) => `<div class="pitem"><div class="pt"><span>${E(p.shortName||p.name)}</span>${tag}</div><div class="ps">${E(p.supplier)} · ${E(p.channelLabel)}${p.type==='MPO' ? ' · '+E(p.monthLabel)+' MPO' : ''} · ${E(H.endsLabel(p.period))}</div>${line ? `<div class="pl">${line}</div>` : ''}<div class="pa">${links}</div></div>`;
  const openItems = [], couldItems = [], otherItems = [], progList = [];
  idx.programs.forEach(p=>{
    const r = p.forRep(rep); if(!r) return;
    const cred = credited.filter(c=>c.p===p);
    const tgt = targets.find(t=>t.p===p);
    const A = H.accountsFor(p, rep);
    const excl = (A.excluded||[]).concat(A.unknown||[]).find(x=>String(x.n)===k);
    const buying = (A.buying||[]).find(x=>String(x.n)===k);
    { const f = H.progFacts(p, r, rep) || {};
      progList.push({name:p.shortName||p.name, supplier:p.supplier, channel:p.channelLabel, type:p.type, ends:H.endsLabel(p.period), ask:H.sellAsk(p),
        status: cred.length ? 'credited' : (tgt && tgt.warm) ? 'lead' : buying ? 'already buying' : tgt ? 'could qualify' : excl ? 'not sellable here' : r.soon ? 'awaiting data' : 'not on its lists',
        why: tgt ? (tgt.why||'') : (excl ? (excl.why||'') : ''), credited: cred.map(c=>[c.what||'', c.date||''].filter(Boolean).join(' · ')),
        repProgress: [f.main, f.need].filter(Boolean).join(' · '),
        // the products that count -- the same rule as the opportunity cards and the Products list
        ...(()=>{ const el = window.KdhOpps && CAT ? window.KdhOpps.eligibleFor(p, CAT, HubAccounts, famKey) : null; if(!el) return {};
          const ok = el.rows.filter(c=>familyAllowed(c[3], a.area).ok);
          return {productsThatCount: el.byProduct ? el.rule : (HubAccounts.PROGRAM_BRANDS[HubAccounts.brandKey(p)]||[]).join(' / ')+' (any product in the brand family)',
            eligibleHere: ok.length, eligibleExamples: ok.slice(0, 8).map(c=>c[1])}; })()}); }
    const links = `<a href="${E(progLink(p, rep))}">Program details ›</a>${(tgt||cred.length) ? `<a href="${E(hubAcctLink(p, rep, a.n, cred.length ? 'dist' : 'targets'))}">Account in the hub ›</a>` : ''}`;
    if(cred.length) openItems.push(pitem(p, '<span class="tag ok">Credited</span>', cred.map(c=>`<b>${E(c.what||'Credited')}</b>${c.date ? ' · '+E(c.date) : ''}`).join('<br>'), links));
    else if(tgt && tgt.warm) openItems.push(pitem(p, '<span class="tag go">Lead</span>', `<b>To qualify:</b> ${E(H.sellAsk(p))} · ${E(tgt.why)}`, links));
    else if(buying) openItems.push(pitem(p, '<span class="tag">Already buying</span>', `Already on the brand${buying.note ? ' · '+E(buying.note) : ''} — no credit recorded for this account yet.`, links));
    else if(tgt) couldItems.push(pitem(p, '<span class="tag go">Could qualify</span>', `<b>To qualify:</b> ${E(H.sellAsk(p))}${tgt.why && !NOBUY.test(tgt.why) ? ' · '+E(tgt.why) : ' · not buying it yet'}`, links));
    else if(excl) otherItems.push(pitem(p, '<span class="tag na">Not sellable here</span>', E(excl.why || 'The brand cannot be sold in this account’s area.'), links));
    else if(r.soon) otherItems.push(pitem(p, '<span class="tag na">Awaiting data</span>', '', links));
    else otherItems.push(pitem(p, '<span class="tag na">Not on its lists</span>', '', links));
  });
  const progHtml = idx.programs.length ? `<div class="card">${openItems.join('') || `<p>No credit, lead or current purchase for this account on an active program.</p>`}
      ${couldItems.length ? `<details class="fold"><summary>Could Still Qualify · ${plural(couldItems.length,'program')}</summary>${couldItems.join('')}</details>` : ''}
      ${otherItems.length ? `<details class="fold"><summary>Other Active Programs · ${otherItems.length}</summary>${otherItems.join('')}</details>` : ''}
    </div>` : `<div class="card"><p>No active incentive or MPO applies to ${E(rep.split(' ')[0])} right now.</p></div>`;

  /* ---- Products to discuss: program targets + what the sales history says ---- */
  const famStatus = (fams)=>{
    if(!sales || !fams || !fams.length) return '';
    const hits = sales.products.filter(p=>fams.some(f=>{ const a2 = String(p[2]||'').toLowerCase(), b = String(f).toLowerCase(); return a2 && (a2.includes(b) || b.includes(a2)); }));
    if(!hits.length) return `No purchases of ${E(fams.slice(0,2).join(' or '))} in the available history (${E(monLabel(months[0]))} – ${E(monLabel(months[N-1]))}).`;
    let li = -1; hits.forEach(p=>p[5].forEach((c,i)=>{ if(c>0 && i>li) li = i; }));
    const in12 = li>=N-12;
    return in12 ? `Bought ${E(fams.slice(0,2).join(' / '))} as recently as ${E(monLabel(months[li]))}.` : `Bought ${E(fams.slice(0,2).join(' / '))} before, last in ${E(monLabel(months[li]))} — not in the last 12 months.`;
  };
  const warm = targets.filter(t=>t.warm).sort((x,y)=>x.p.period.end-y.p.period.end);
  const discuss = warm.map(t=>{
    const fams = HubAccounts.PROGRAM_BRANDS[HubAccounts.brandKey(t.p)] || [];
    return `<div class="pitem"><div class="pt"><span>${E(H.sellAsk(t.p))}</span><span class="tag go">Lead</span></div><div class="ps">${E(t.p.shortName||t.p.name)} · ${E(t.p.supplier)} · ${E(H.endsLabel(t.p.period))}</div><div class="pl">${E(t.why)}${famStatus(fams) ? '<br>'+famStatus(fams) : ''}</div></div>`;
  }).join('');
  const discussHtml = discuss ? `<div class="card">${discuss}<p class="note">Leads come from the trackers’ own opportunity lists. The product list above shows what is sellable here and the warehouse stock at its last update; approved pitches and pricing are not in the data yet (see REPORTING_REQUEST.md).</p></div>`
    : `<div class="card"><p>No tracker lead for this account right now. Programs it could still qualify for are under More › Programs; the product list above shows what it usually takes.</p></div>`;

  /* ---- Taps & visits (on-premise accounts the survey covers) ---- */
  let tapsHtml = '';
  if(a.taps){
    const t = a.taps; const brands = (sales && sales.taps) || [];
    const dueTxt = due ? (due.level==='overdue' ? `<span class="tag warn">Resurvey overdue · ${due.days} days</span>` : due.level==='soon' ? `<span class="tag warn">Resurvey due in ${60-due.days} days</span>` : `<span class="tag ok">Surveyed ${due.days} days ago</span>`) : '';
    tapsHtml = `<div class="card">
      <div class="kv"><span>Last survey</span><span>${E(t.lastDisplay||t.last)} ${dueTxt}</span></div>
      <div class="kv"><span>Handles</span><span><b>${t.ours} ours</b> · ${t.them} theirs${t.unv ? ' · '+t.unv+' unverified' : ''}</span></div>
      ${brands.length ? `<details class="fold"><summary>What’s on Tap (${plural(brands.length,'handle')})</summary>${brands.map(b=>`<div class="hist"><b>${E(b.b||'(unnamed)')}</b> · ${E(b.s)}${b.n>1 ? ' × '+b.n : ''}</div>`).join('')}</details>` : ''}
      ${t.passes>1 && sales && sales.tapHistory && sales.tapHistory.length ? `<details class="fold"><summary>Earlier Surveys (${t.passes-1})</summary>${sales.tapHistory.map(h=>`<div class="hist"><b>${E(h.display||h.visited)}</b> · ${h.ours} ours · ${h.them} theirs</div>`).join('')}</details>` : ''}
      <div class="kv"><span></span><span><a href="${TAP}#q=${encodeURIComponent(a.name)}">Open in the Tap Tracker ›</a></span></div>
    </div>`;
  } else if(a.prem==='On'){
    tapsHtml = `<div class="card"><p>No tap survey on file for this account in the current export (${E((d.taps.asOf||'').slice(0,10))}).</p></div>`;
  }

  // NEXT ACTIONS (2026-10-01, Jobber / Todoist rows): the whole row opens the
  // evidence; one short line says why; the full reasoning lives one tap away.
  const focusHtml = top.length ? `<div class="focus nexta">${top.map(f=>{ const href = f.go ? acctHash(a.n, rep, f.go) : f.href;
      return `<a class="fitem" href="${E(href)}"${f.go ? ` data-go="${E(f.go)}"` : ''}><div class="fmain"><span class="fkind">${E(f.kind)}</span><div class="ft">${f.t}</div><p class="fw">${f.ws || f.w}${f.caveat ? ` <span class="cav">· ${E(f.cs || f.n)}</span>` : ''}</p><span class="fgo">${E(f.hl)}</span></div>${CHEV}</a>`; }).join('')}</div>`
    + (focus.length>3 || alerts.length>2 ? `<p class="note prio-note">Showing the ${plural(top.length,'strongest item')}${focus.length>3 ? ` of ${focus.length}` : ''}. Order: an open follow-up, an overdue tap survey, program leads (soonest deadline first), then buying alerts — lapsed products before possible reorders, the biggest usual order first.${alerts.length>2 ? ` All ${plural(alerts.length,'buying alert')} are under History › Sales &amp; Alerts.` : ''}</p>` : '')
    : `<div class="kdh-state empty"><b>Nothing flagged for this account right now.</b><span>No open follow-up, no program target, no overdue survey and no buying alert in the data through ${E(monLabel(refKey))}.</span></div>`;

  /* ---- Buying at a glance (2026-10-01): three numbers, the alerts in one line, one way to the evidence ---- */
  let buyHtml;
  if(sales && sales.products.length){
    const s2 = sales.series; const li = (()=>{ for(let i=N-1;i>=0;i--) if(s2[i]>0) return i; return -1; })();
    const l3 = sumRange(s2, N-3, N), p3 = sumRange(s2, N-6, N-3);
    const cnt1 = F.counts || {};
    const al = [cnt1.reorder ? plural(cnt1.reorder,'possible reorder') : '', cnt1.lapsed ? plural(cnt1.lapsed,'lapsed product') : '', cnt1.slower ? cnt1.slower+' bought less often' : ''].filter(Boolean);
    const big = alerts.filter(x=>x.type!=='slower')[0];
    buyHtml = `<div class="card buy">
      <div class="kpis"><div><span>Last purchase</span><b>${li>=0 ? E(monLabel(months[li])) : '—'}</b></div>
        <div><span>Cases ${E(rangeLabel(months,N-3,N))}</span><b>${fmtN(l3)}</b><small>${E(rangeLabel(months,N-6,N-3))}: ${fmtN(p3)}</small></div>
        <div><span>Products, 12 months</span><b>${sales.products.filter(p=>sumRange(p[5],N-12,N)>0).length}</b></div></div>
      ${al.length ? `<p class="buy-al"><b>Buying alerts:</b> ${E(al.join(' · '))}${big ? `. Largest: ${E(big.product)}.` : '.'}</p>` : `<p class="buy-al">No buying alerts in the data through ${E(monLabel(refKey))}.</p>`}
      <a class="btn outline wide" href="${E(acctHash(a.n, rep, 'sales:sales'))}" data-go="sales:sales">View Purchase History</a>
    </div>`;
  } else buyHtml = `<div class="card"><p>${a.inMaster===false ? 'This account number is not in the sales master, so there is no purchase history.' : 'No cases on record in the loaded months.'}</p></div>`;

  /* ---- Account details (Attio's Record Details): grouped facts, beside the work on desktop ---- */
  const kvl = (l, v) => v ? `<div class="kv"><span>${l}</span><span>${v}</span></div>` : '';
  // account size (class + gross-profit decile) is for managers only (Gavin, 2026-10-01)
  const sizeTxt = isMgr && a.sizeClass ? `Class ${E(a.sizeClass)}${a.decile ? ` · decile ${a.decile} by 2026 gross` : ''}` : '';
  // ACCOUNT DETAILS (2026-10-02, folk's grouped contact card): who, where,
  // contact, servicing. Fields the customer base does not carry are said
  // once per group, never shown as empty rows. Contact / hours / servicing
  // fields render when a future export supplies them (REPORTING_REQUEST.md).
  const grp = (title, body) => body ? `<div class="dg"><h3 class="dg-h">${title}</h3>${body}</div>` : '';
  const telHref = v => 'tel:'+String(v).replace(/[^\d+]/g,'');
  const contactBody = (a.contact_name || a.phone || a.email)
    ? kvl('Contact', E(a.contact_name||'')) + (a.phone ? `<div class="kv"><span>Phone</span><span><a href="${E(telHref(a.phone))}">${E(a.phone)}</a></span></div>` : '') + (a.email ? `<div class="kv"><span>Email</span><span><a href="mailto:${E(a.email)}">${E(a.email)}</a></span></div>` : '')
    : `<p class="dg-na">No contact is on file for this account yet — check Encompass.</p>`;
  const serviceBody = kvl('Service', E(a.service||'')) + (a.stops2026!=null ? kvl('2026 So Far', `${plural(a.stops2026,'stop')}${a.distPts!=null ? ' · '+plural(a.distPts,'distribution point') : ''}${a.cases2026!=null ? ' · '+fmtN(a.cases2026)+' cases' : ''}`) : (a.cases2026!=null ? kvl('2026 So Far', fmtN(a.cases2026)+' cases') : ''))
    + (a.hours ? kvl('Hours', E(a.hours)) : '') + (a.instructions ? kvl('Instructions', E(a.instructions)) : '')
    + (a.hours && a.instructions ? '' : `<p class="dg-na">Business hours, delivery days and servicing instructions are not in our exports yet.</p>`);
  const wide = window.matchMedia && window.matchMedia('(min-width: 1180px)').matches;
  const identHtml = `<div class="card dgroup">
      ${grp('Account', kvl('Customer ID', '#'+E(a.n)) + kvl('Premise', [premWord(a.prem) || '<span class="dim">not in the customer base</span>', a.service].filter(Boolean).join(' · ')) + kvl('Area', [a.area, a.county ? a.county+' County' : ''].filter(Boolean).join(' · ')) + (isMgr ? kvl('Rep', E(rep)) : '') + kvl('Size', sizeTxt))}
      ${a.address ? '' : grp('Location', kvl('Address', `${E(a.city||'')}${a.city ? ' · ' : ''}<span class="dim">street address not in the customer base export</span>`))}
      <details class="dmore"${wide ? ' open' : ''}><summary>Contact &amp; Servicing</summary>
        ${grp('Contact', contactBody)}
        ${grp('Servicing', serviceBody)}
      </details>
    </div>`;

  /* ---- Invoices & Balances: what the data has (monthly cases) and, honestly, what it does not ---- */
  let invHtml;
  if(sales && sales.products.length){
    const s2 = sales.series; const from = Math.max(0, N-12);
    const monthRows = []; for(let i=N-1;i>=from;i--){ const c = s2[i]; const np = sales.products.filter(p=>p[5][i]>0).length; monthRows.push(`<tr><td><b>${E(monLabel(months[i]))}</b>${i>R ? '<span class="sub">partial month in the export</span>' : ''}</td><td class="num" data-l="Cases">${c>0 ? fmtN(c) : '—'}</td><td class="num" data-l="Products">${np || '—'}</td></tr>`); }
    invHtml = `<div class="card"><h3 class="note" style="margin-top:10px"><b>Purchases on record</b> · monthly cases from Fusion, net of returns <small>· not invoices</small></h3>
      <table class="tbl"><thead><tr><th>Month</th><th class="num">Cases</th><th class="num">Products</th></tr></thead><tbody>${monthRows.join('')}</tbody></table>
      <p class="note">Fusion reports cases per product per month; there are no invoice numbers, dates, dollar amounts or returns lines in it. A month with a credit larger than its sales shows as a dash. The per-product history is under Sales &amp; Alerts.</p></div>`;
  } else invHtml = `<div class="card"><p>No purchases on record for this account in the sales master.</p></div>`;
  const invMissingHtml = `<div class="card">
      <div class="kdh-state unavailable slim"><b>Invoices, credits and receivables are not connected yet.</b><span>Invoice history with line items and PDFs, accounts receivable (amount due, credits, total balance, aging), pre-orders, backorders and customer allocations need the Encompass exports in the reporting request. Nothing on this page is estimated from sales, so there are no balances to show until then.</span></div>
    </div>`;

  /* ---- Tasks & Resources: tools that exist, and the ones that do not, said once ---- */
  const toolRows = [];
  toolRows.push(`<a class="row" href="${E(HUB)}#view=rep&rep=${encodeURIComponent(rep)}&cat=inc&only=inc"><span class="row-main"><h3>Incentive Hub</h3><span class="row-s">${E(rep.split(' ')[0])}’s programs, with this account’s marks inside each one</span></span>${CHEV}</a>`);
  if(a.taps || a.prem==='On') toolRows.push(`<a class="row" href="${TAP}#q=${encodeURIComponent(a.name)}"><span class="row-main"><h3>Tap Tracker</h3><span class="row-s">${a.taps ? 'This account’s handles and survey history' : 'Survey status for on-premise accounts'}</span></span>${CHEV}</a>`);
  if(a.address) toolRows.push(`<a class="row" href="${E(mapsHref(a))}" target="_blank" rel="noopener"><span class="row-main"><h3>Directions</h3><span class="row-s">Opens Maps with the account’s address</span></span>${CHEV}</a>`);
  const toolsHtml = `<div class="rows">${toolRows.join('')}</div>
    <div class="card" style="margin-top:10px"><div class="kdh-state unavailable slim"><b>iSellBeer, DSDLink, PayLink, the license lookup, surveys, assets and documents stay in Encompass for now.</b><span>No account-specific link for them is documented to us yet; the reporting request asks for the link formats before anything here pretends to open them.</span></div></div>`;

  /* ---- record header (Attio): status, name, where, the main action ---- */
  const nAct = top.length;
  const headFull = `<div class="acct-head rec">
      <p class="rec-st ${nAct ? 'att' : 'ok'}"><span class="dot"></span>${nAct ? `${nAct} Action ${nAct===1 ? 'Item' : 'Items'}` : 'No Action Items'}</p>
      <h1>${E(a.name)}</h1>
      <p class="sub">${E([a.city, premWord(a.prem), 'Account #'+a.n].filter(Boolean).join(' · '))}${isMgr ? `<span class="sub2"> · Rep: ${E(rep)}</span>` : ''}</p>
      ${a.address ? `<div class="rec-loc"><p class="rec-addr">${E(a.address)}, ${E(a.city||'')}</p><a class="btn outline sm dirbtn rec-dir" href="${E(mapsHref(a))}" target="_blank" rel="noopener" aria-label="Directions to ${E(a.name)} (opens Maps)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="12" r="2.5"/></svg>Directions</a></div>` : ''}
      <div id="actQuick" class="act-quick"></div>
    </div>`;

  /* ---- PROGRAM OPPORTUNITIES (accounts/opps.js) ---- */
  const OPP = window.KdhOpps ? window.KdhOpps.build({a, rep, k, programs: idx.programs, credited, targets, H, HB: HubAccounts, CAT, famKey, familyAllowed, today: TODAY, whose: isMgr ? rep.split(' ')[0]+'’s' : 'Your', elig: ELIG_ACC}) : null;
  const oppLinks = {prog: o=>progLink(o.p, rep), progView: (o, pv)=>progLink(o.p, rep)+'&pv='+pv, acct: o=>hubAcctLink(o.p, rep, a.n, 'targets'), prem: a.prem, evidence: !!(window.KdhActivity && window.KDH_AUTH && !(U && U.preview))};
  const oppOver = OPP ? window.KdhOpps.overviewHtml(OPP, oppLinks, acctHash(a.n, rep, 'more', 'programs')) : progHtml;
  const oppFull = OPP ? window.KdhOpps.fullHtml(OPP, oppLinks) : progHtml;
  /* ---- the activity timeline's non-Hub records: tap survey passes (iSellBeer)
     and monthly purchase activity (the sales record, never called invoices) ---- */
  const tapPasses = [];
  ((sales && sales.tapHistory) || []).forEach(t=>{ if(t && t.visited) tapPasses.push(t); });
  if(a.taps && a.taps.last && !tapPasses.some(t=>t.visited===a.taps.last)) tapPasses.push({visited:a.taps.last, display:a.taps.lastDisplay||a.taps.last, taps:(a.taps.ours||0)+(a.taps.them||0), ours:a.taps.ours||0, them:a.taps.them||0});
  const purchases = [];
  if(sales){ for(let i=N-1;i>=0;i--){ const cs = sales.series[i]||0; if(cs<=0) continue;
    const bought = sales.products.filter(p=>p[5][i]>0).sort((x,y)=>y[5][i]-x[5][i]);
    purchases.push({month: months[i], label: monLabel(months[i]), cases: cs, products: bought.length, top: bought.slice(0, 5).map(p=>({name:p[1], cases:p[5][i]}))}); } }

  /* ---- More: one plain menu of the account's remaining sections ---- */
  const openProg = idx.programs.filter(p=>{ const cred = credited.some(c=>c.p===p); const tg = targets.find(t=>t.p===p); return cred || (tg && tg.warm); }).length;
  const tapLine = a.taps ? (due ? (due.level==='overdue' ? `Resurvey overdue · ${due.days} days since the last survey` : due.level==='soon' ? `Resurvey due in ${plural(60-due.days,'day')}` : `Surveyed ${due.days} days ago`)+` · ${a.taps.ours} ours · ${a.taps.them} theirs` : 'Survey on file') : (a.prem==='On' ? 'No tap survey on file' : '');
  const moreItems = [
    ['programs', 'Program Opportunities', OPP ? `${plural(OPP.list.length,'opportunity','opportunities')}${OPP.credited.length ? ` · ${OPP.credited.length} credited` : ''}` : `${plural(idx.programs.length,'active program')}${openProg ? ` · ${openProg} credited or a lead here` : ''}`],
    ['activity', 'Account Activity', `Notes, follow-ups, photos, tap surveys and purchases${rows.length ? ` · ${plural(follows.length,'open follow-up')}` : ''}`],
    ['photos', 'Photos & Merchandising', ACT && ACT.records && ACT.records.length ? `${plural(ACT.records.length,'record')} · ${plural(ACT.records.reduce((n, r)=>n + r.photos.length, 0),'photo')} · latest ${E(fmtDay(new Date(ACT.records[0].observed_at || ACT.records[0].created_at)))}` : 'Displays, windows, cooler doors, tap handles, menus'],
    tapLine ? ['taps', 'Taps & Visits', tapLine] : null,
    ['tools', 'Tools & Links', 'Incentive Hub, Tap Tracker, Directions'],
    ['ask', 'Ask About This Account', 'Questions about this account’s buying, or practice a pitch'],
    ['about', 'About This Data', 'Sources and the date of each'],
  ].filter(Boolean);
  const moreMenu = `<div class="rows mlist">${moreItems.map(([k, t, l])=>`<a class="row" href="${E(acctHash(a.n, rep, 'more', k))}" data-go="more:${k}"><span class="row-main"><h3>${E(t)}</h3><span class="row-s">${E(l)}</span></span>${CHEV}</a>`).join('')}</div>`;
  const moreBack = `<a class="subback" href="${E(acctHash(a.n, rep, 'more'))}" data-go="more:"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>More</a>`;
  const aboutHtml = `<div class="card"><p class="fresh-foot">Customer base as of ${E(d.book.asOf)} · sales master through ${E(monLabel(months[N-1]))} (loaded ${E((d.sales.loaded||'').slice(0,10))}, monthly, net of returns) · Kohler warehouse stock as of ${E((CAT.inventory && CAT.inventory.asOf) || '—')} · programs as refreshed in the Incentive Hub · tap survey as of ${E((d.taps.asOf||'').slice(0,10))}. Buying alerts use the last complete month (${E(monLabel(refKey))}) as today, so nothing grows more overdue than the data; rules and thresholds are in accounts/README.txt.</p></div>`;

  /* ---- assemble: four sections, one open; sub-views switch in place ---- */
  const nBought = sales ? sales.products.length : 0;
  const secnav = `<nav class="secnav" role="tablist" aria-label="Account sections">${SECS.map(([k, label])=>`<a role="tab" class="sectab${state.sec===k?' active':''}" aria-selected="${state.sec===k}" href="${E(acctHash(a.n, rep, k))}" data-sec="${k}"><span>${E(label)}</span>${k==='products' && nBought ? `<small>${nBought}</small>` : k==='more' && follows.length ? `<small>${follows.length}</small>` : ''}</a>`).join('')}</nav>`;
  const secHtml = (k, inner) => `<div class="secbody" data-sec="${k}"${state.sec===k ? '' : ' hidden'}>${inner}</div>`;
  const subHtml = (sec, k, inner) => `<div class="subbody" data-sec="${sec}" data-sub="${k}"${state.sec===sec && state.sub===k ? '' : ' hidden'}>${inner}</div>`;
  const hseg = `<div class="pseg hseg" role="tablist" aria-label="History views">${HSUBS.map(([k, l])=>`<button type="button" role="tab" data-go="history:${k}" class="${state.sub===k?'active':''}" aria-selected="${state.sub===k}">${E(l)}</button>`).join('')}</div>`;
  const invAsOf = CAT.inventory && CAT.inventory.asOf;
  app.innerHTML = back(fromLabel, fromHref) + headFull + secnav
    + secHtml('over', `<div class="over-grid"><div class="over-main">
      <section class="sec" id="focus"><h2>Next Actions</h2>${focusHtml}</section>
      <section class="sec" id="opps"><h2>Program Opportunities</h2>${oppOver}</section>
      <section class="sec" id="activity"><h2>Account Activity</h2><div class="card actcard" id="actFeed"><div class="kdh-state loading slim">Loading activity…</div></div></section>
      <section class="sec" id="buying"><h2>Sales Context <small>through ${E(monLabel(refKey))}</small></h2>${buyHtml}</section>
    </div><aside class="over-side">
      <section class="sec" id="overview"><h2>Account Details</h2>${identHtml}</section>
      <section class="sec" id="photos-side"><h2>Photos &amp; Merchandising</h2><div class="card" id="actPhotos"></div></section>
    </aside></div>`)
    + secHtml('products', `
    <section class="sec" id="products"><div class="card" id="plistCard"></div></section>
    <details class="fold discuss-fold" id="discuss"${warm.length ? '' : ''}><summary>Products to Discuss · ${plural(warm.length,'program lead')}</summary>${discussHtml}</details>`)
    + secHtml('history', hseg
      + subHtml('history', 'sales', `<section class="sec"><h2>Sales &amp; Alerts <small>Fusion, through ${E(monLabel(refKey))}</small></h2>${salesHtml}</section>`)
      + subHtml('history', 'patterns', patHtml ? `<section class="sec"><h2>Buying Patterns <small>${E(monLabel(months[0]))} – ${E(monLabel(refKey))}</small></h2>${patHtml}</section>` : `<div class="kdh-state empty"><b>Not enough purchase history for buying patterns.</b></div>`)
      + subHtml('history', 'record', `<section class="sec" id="inv"><h2>Monthly Record <small>Fusion, net of returns</small></h2>${invHtml}</section>
        <section class="sec" id="balances"><h2>Invoices, Credits &amp; Receivables</h2>${invMissingHtml}</section>`))
    + secHtml('more', subHtml('more', '', moreMenu)
      + subHtml('more', 'programs', moreBack + `<section class="sec" id="programs"><h2>Program Opportunities <small>${plural(idx.programs.length,'active program')} for ${E(rep.split(' ')[0])}</small></h2>${oppFull}</section>`)
      + subHtml('more', 'activity', moreBack + `<section class="sec" id="notes"><h2>Account Activity</h2><div class="card actcard" id="actAll"></div></section>`)
      + subHtml('more', 'photos', moreBack + `<section class="sec" id="photos"><h2>Photos &amp; Merchandising</h2><div class="card" id="actPhotosAll"></div></section>`)
      + subHtml('more', 'taps', moreBack + (tapsHtml ? `<section class="sec" id="taps"><h2>Taps &amp; Visits <small>survey as of ${E((d.taps.asOf||'').slice(0,10))}</small></h2>${tapsHtml}</section>` : `<div class="kdh-state empty"><b>No tap survey for this account.</b></div>`))
      + subHtml('more', 'tools', moreBack + `<section class="sec" id="tools"><h2>Tools &amp; Links</h2>${toolsHtml}</section>`)
      + subHtml('more', 'ask', `<a class="subback" href="${E(acctHash(a.n, rep, 'over'))}" data-go="over:"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Back to Overview</a><section class="sec" id="ask"><h2>Ask About This Account</h2><p class="ask-for">${E(a.name)} · sales record ${E(monLabel(months[0]))} – ${E(monLabel(refKey))}</p><div class="card ask" id="askCard"></div></section>`)
      + subHtml('more', 'about', moreBack + `<section class="sec" id="about"><h2>About This Data</h2>${aboutHtml}</section>`));
  if(plist.n !== String(a.n)){
    let saved = null; try{ saved = JSON.parse(ss.get('plist:'+a.n) || 'null'); }catch(e){}
    Object.assign(plist, {n:String(a.n), q:'', view: (sales && sales.products.length) ? 'bought' : 'all', sup:'', fam:'', pkg:'', prog:'', limit:40}, saved || {});
  }
  renderProducts(a, rep, sales, CAT, months, N, targets);
  app.querySelectorAll('[data-pq]').forEach(b=>b.addEventListener('click', e=>{ e.preventDefault();
    Object.assign(plist, {view:'all', q: b.dataset.pprog ? '' : (b.dataset.pq||''), prog: b.dataset.pprog || '', sup:'', fam:'', pkg:'', limit:40}); renderProducts(a, rep, sales, CAT, months, N, targets); showSec('products', ''); window.scrollTo(0, 0); }));
  if(window.KdhActivity){
    const real = (()=>{ try{ return JSON.parse(cookie('kdh_user')||'null'); }catch(e){ return null; } })();
    window.KdhActivity.attach({n:String(a.n), name:a.name, area:a.area||"", prem: a.prem==='On' || a.prem==='Off' ? a.prem : '', rep, me: real, isMgr,
      readOnly: !!(U && U.preview), readOnlyWhy: `Saving is off in preview — notes and photos belong to ${rep.split(' ')[0]} and the people on the route.`,
      extra: {taps: tapPasses, purchases, families: a.families || [],
        // the capture search: Kohler's catalogue + this account's own products, most recently bought first
        catalog: CAT && CAT.products ? CAT.products : [],
        bought: sales && sales.products ? sales.products.map(p=>[p[0], (p[5]||[]).slice(-6).reduce((x, y)=>x + (+y||0), 0), (p[5]||[]).reduce((x, y)=>x + (+y||0), 0)]).sort((x, y)=>(y[1]-x[1]) || (y[2]-x[2])).map(p=>p[0]) : [],
        opps: OPP ? OPP.list.concat(OPP.credited).map(o=>({id:o.id, name:o.name, fams:o.fams || []})) : []},
      progName, hubLink: r=>hubAcctLink(H.programs().find(p=>p.id===r.program_id), rep, a.n, r.status==='follow' ? 'follow' : r.status),
      openAsk: ()=>showSec('more', 'ask', 'ask'), showOverview: ()=>showSec('over', ''),
      onChange: ()=>{ const y = window.scrollY; renderAccount().then(()=>window.scrollTo(0, y)); }});
  }
  // Add Evidence: the photo flow with the program and a category preselected (never in preview)
  app.querySelectorAll('[data-evid]').forEach(b=>b.addEventListener('click', ()=>{
    if(window.KdhActivity) window.KdhActivity.capture({program_id: b.dataset.evid, category: b.dataset.ecat || ''}); }));
  // the assistant gets a packet of what this page already shows -- nothing more
  if(window.KdhAssistant){ const packet = buildPacket({a, rep, d, sales, months, N, R, refKey, F, alerts, rows, follows, targets, credited, due, CAT, progList}); window.KdhAssistant.mount(document.getElementById('askCard'), packet, {}); }
  const y = scrollMem[location.hash]; if(typeof y==='number'){ requestAnimationFrame(()=>window.scrollTo(0,y)); delete scrollMem[location.hash]; }
}

/* ---------------- Products: the account-context product list ----------------
   Previously purchased (this account's own history, all months) by default;
   All eligible = the catalogue minus brand families the territory workbook
   marks NOT IN TERRITORY / BLOCKED for this account's area. Each row:
   name (wraps), package · supplier · #ProductID, this account's last
   purchase + 12-month cases, the warehouse's sellable units with the
   inventory report's date and days-of-cover status, a program lead tag when
   the family is on one of this rep's warm lists for the account, and the
   sell-sheet link when the Brands export carries one. Pricing, deals and
   retailer stock are not in the data; the note says so once. */
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
const famKey = f => String(f||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function familyAllowed(fam, area){
  const F = (typeof HUB_BRANDS!=='undefined' && HUB_BRANDS && HUB_BRANDS.families) || null;
  if(!F || !fam || !area) return {ok:true, why:''};
  let hit = F[fam]; if(!hit){ const k = famKey(fam); const name = Object.keys(F).find(x=>famKey(x)===k); hit = name ? F[name] : null; }
  if(!hit || !hit.areas) return {ok:true, why:''};
  const st = hit.areas[area];
  if(st==='CAN SELL' || st==null) return {ok:true, why:''};
  return {ok:false, why: st==='BLOCKED' ? 'blocked in '+area : 'not in territory for '+area};
}
function renderProducts(a, rep, sales, CAT, months, N, targets){
  const box = document.getElementById('plistCard'); if(!box) return;
  const inv = CAT.inventory || {};
  const asOf = inv.asOf ? new Date(inv.asOf+'T00:00:00') : null; const invAge = asOf ? Math.round((TODAY-asOf)/86400000) : null;
  // this account's own history, by product number
  const mine = new Map(); (sales ? sales.products : []).forEach(p=>{ let li=-1; for(let i=N-1;i>=0;i--) if(p[5][i]>0){ li=i; break; } mine.set(String(p[0]), {li, cases12:sumRange(p[5], N-12, N), months12:p[5].slice(N-12).filter(c=>c>0).length, cases:sumRange(p[5],0,N), p}); });
  // program leads (warm targets only), by the SAME product rule the opportunity
  // cards use (hub/accounts.js eligibleProducts) -- a Lagunitas Sprint lead tags
  // IPA and Little Sumpin', never the Variety pack
  const elig = p => window.KdhOpps ? window.KdhOpps.eligibleFor(p, CAT, HubAccounts, famKey) : {rows: []};
  const leadNums = new Map(); (targets||[]).filter(t=>t.warm).forEach(t=>elig(t.p).rows.forEach(c=>{ const k = String(c[0]); if(!leadNums.has(k)) leadNums.set(k, t.p); }));
  // "View N Eligible Products" from an opportunity card: that program's list only
  const progP = plist.prog ? H.programs().find(p=>p.id===plist.prog) : null;
  const progNums = progP ? new Set(elig(progP).rows.map(c=>String(c[0]))) : null;
  if(plist.prog && !progP) plist.prog = '';
  // rows: purchased = own history (catalogue fills availability); all = catalogue within territory
  let all;
  if(plist.view==='bought'){
    all = Array.from(mine.entries()).map(([num, m])=>{ const c = CAT.byNum.get(num); return {num, name:m.p[1], fam:m.p[2], sup:m.p[3], pkg:m.p[4], c, m}; });
    all.sort((x,y)=> (y.m.li - x.m.li) || (y.m.cases12 - x.m.cases12));
  } else {
    all = CAT.products.map(r=>({num:String(r[0]), name:r[1], sup:r[2], fam:r[3], pkg:r[4], c:r, m:mine.get(String(r[0]))||null}))
      .filter(x=>familyAllowed(x.fam, a.area).ok);
    all.sort((x,y)=> ((y.m?1:0)-(x.m?1:0)) || x.sup.localeCompare(y.sup) || x.name.localeCompare(y.name));
  }
  const sups = Array.from(new Set(all.map(x=>x.sup).filter(Boolean))).sort();
  const fams = Array.from(new Set(all.filter(x=>!plist.sup || x.sup===plist.sup).map(x=>x.fam).filter(Boolean))).sort();
  const pkgs = Array.from(new Set(all.filter(x=>(!plist.sup || x.sup===plist.sup) && (!plist.fam || x.fam===plist.fam)).map(x=>x.pkg).filter(Boolean))).sort();
  const q = plist.q.trim().toLowerCase();
  const shown = all.filter(x=>(!progNums || progNums.has(x.num)) && (!plist.sup || x.sup===plist.sup) && (!plist.fam || x.fam===plist.fam) && (!plist.pkg || x.pkg===plist.pkg) && (!q || x.name.toLowerCase().includes(q) || x.num.includes(q)));
  // STOCK AT LAST UPDATE (2026-10-02): the warehouse figure is a snapshot,
  // never live availability -- the date and its age sit on the list's own
  // heading, a past expected-arrival date is labelled as such, and Kohler's
  // warehouse stock is never confused with what is on the retailer's shelf.
  const invDay = asOf ? fmtDay(asOf) : '';
  const stale = invAge!=null && invAge>7;
  const fmtArr = v => { const d = new Date(String(v).length>10 ? v : v+'T00:00:00'); return isNaN(d) ? {txt:String(v), past:false} : {txt:fmtDay(d), past: d < TODAY}; };
  const availTxt = c => {
    if(!c || c[5]==null) return `<span class="dim">No warehouse figure</span>`;
    const st = c[7]; const tag = st==='out' ? '<span class="tag lapsed">Out at the warehouse</span>' : st==='low' ? '<span class="tag warn">Running low</span>' : '';
    const arr = c[8] ? fmtArr(c[8]) : null;
    return `<span class="stk">Stock at last update: <b>${fmtN(c[5])} ${Number(c[5])===1 ? 'unit' : 'units'}</b></span>${tag ? ' '+tag : ''}${arr ? ` · ${arr.past ? `expected arrival ${E(arr.txt)} <span class="dim">(past estimate)</span>` : `expected arrival ${E(arr.txt)}`}` : ''}`;
  };
  const rowsHtml = shown.slice(0, plist.limit).map(x=>{
    const lead = leadNums.get(x.num);
    const hist = x.m ? (x.m.li>=0 ? `Last bought here ${monLabel(months[x.m.li])} · ${fmtN(x.m.cases12)} cs in 12 months (${x.m.months12} of 12 months)` : 'Bought here before the loaded history') : `<span class="dim">Not bought here in ${monLabel(months[0])}–${monLabel(months[N-1])}</span>`;
    return `<div class="prow"><div class="pt"><span>${E(x.name)}</span>${lead ? `<span class="tag go">Lead · ${E(lead.shortName||lead.name)}</span>` : ''}</div>
      <div class="ps">${E(x.pkg||'')}${x.pkg ? ' · ' : ''}#${E(x.num)}${x.sup ? ' · '+E(x.sup) : ''}</div>
      <div class="pl">${hist}</div>
      <div class="pl">${availTxt(x.c)}</div>
      ${x.c && x.c[10] ? `<div class="pa"><a href="${E(x.c[10])}" target="_blank" rel="noopener">Sell Sheet (PDF) ↗</a></div>` : ''}</div>`;
  }).join('');
  const nb = mine.size;
  const nf = [plist.sup, plist.fam, plist.pkg].filter(Boolean).length;
  box.innerHTML = `<div class="phead"><h2>Products</h2><span class="dim">${plist.view==='all' ? 'Sellable in '+E(a.area||'this area') : 'Bought by this account'}</span></div>
    <div class="pctl">
      <div class="pseg" role="tablist"><button type="button" class="${plist.view==='bought'?'active':''}" data-pv="bought"><span class="pl-long">Previously </span>Purchased</button><button type="button" class="${plist.view==='all'?'active':''}" data-pv="all">All Eligible</button></div>
      <input type="search" class="kdh-field" id="pq" placeholder="Search by product name or #" value="${E(plist.q)}" autocomplete="off" aria-label="Search products">
      <details class="more-filters fpop"${nf ? ' open' : ''}><summary>Filters${nf ? ' · '+nf : ''}</summary>
        <div class="fpanel"><div class="mf-row"><select id="psup" aria-label="Supplier"><option value="">Any supplier</option>${sups.map(v=>`<option value="${E(v)}"${v===plist.sup?' selected':''}>${E(v)}</option>`).join('')}</select>
        <select id="pfam" aria-label="Brand family"><option value="">Any brand family</option>${fams.map(v=>`<option value="${E(v)}"${v===plist.fam?' selected':''}>${E(v)}</option>`).join('')}</select>
        <select id="ppkg" aria-label="Package"><option value="">Any package</option>${pkgs.map(v=>`<option value="${E(v)}"${v===plist.pkg?' selected':''}>${E(v)}</option>`).join('')}</select>
        ${nf ? '<button type="button" class="btn outline" id="pclear">Clear</button>' : ''}</div></div></details>
    </div>
    ${progP ? `<p class="pprog">Products that count for <b>${E(window.kdhTitle ? window.kdhTitle(progP.id, progP.shortName||progP.name) : (progP.shortName||progP.name))}</b>${(()=>{ const r = HubAccounts.PROGRAM_PRODUCTS && HubAccounts.PROGRAM_PRODUCTS[HubAccounts.brandKey(progP)]; return r ? ' — '+E(r.rule) : ''; })()} <button type="button" class="btn outline sm" id="pprogClear">Show All Products</button></p>` : ''}
    <p class="inv-fresh${stale ? ' stale' : ''}">${invDay ? `Kohler warehouse stock as of <b>${E(invDay)}</b>${invAge!=null ? ` · ${plural(invAge,'day')} old` : ''}${stale ? ' · may have changed — confirm in Encompass' : ''}` : 'No warehouse stock report loaded'}</p>
    <p class="count">${shown.length===all.length ? plural(all.length,'product') : shown.length+' of '+plural(all.length,'product')}${plist.view==='all' ? ' sellable in '+E(a.area||'this area') : ''}</p>
    <div class="plist">${rowsHtml || `<div class="kdh-state empty"><b>${q ? 'No product matches “'+E(q)+'”.' : plist.view==='bought' ? 'No purchases on record for this account.' : 'No product matches these filters.'}</b></div>`}</div>
    ${shown.length>plist.limit ? `<button class="btn outline more" id="pmore" type="button">Show ${Math.min(40, shown.length-plist.limit)} More of ${shown.length}</button>` : ''}
    <p class="note">Stock is Encompass’s sellable units in the Kohler warehouse at the report date, not the retailer’s shelf; “running low” is under ${E(String(inv.lowDoi||14))} days of cover. Eligibility follows the brand territory workbook for ${E(a.area||'this area')}. Pricing, deals, promotions and close-dated lots are not in our data (see REPORTING_REQUEST.md). Sell sheets are on file for ${E(String((CAT.sellSheets&&CAT.sellSheets.brands)||0))} brands so far.</p>`;
  ss.set('plist:'+a.n, JSON.stringify({q:plist.q, view:plist.view, sup:plist.sup, fam:plist.fam, pkg:plist.pkg, prog:plist.prog, limit:plist.limit}));
  const rr = ()=>renderProducts(a, rep, sales, CAT, months, N, targets);
  box.querySelectorAll('[data-pv]').forEach(b=>b.addEventListener('click', ()=>{ plist.view = b.dataset.pv; plist.limit = 40; plist.sup = plist.fam = plist.pkg = plist.prog = ''; rr(); }));
  const ppc = box.querySelector('#pprogClear'); if(ppc) ppc.addEventListener('click', ()=>{ plist.prog = ''; plist.limit = 40; rr(); });
  const pq = box.querySelector('#pq'); pq.addEventListener('input', e=>{ plist.q = e.target.value; plist.limit = 40; const y = window.scrollY; rr(); const el = box.querySelector('#pq'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); window.scrollTo(0, y); });
  box.querySelector('#psup').addEventListener('change', e=>{ plist.sup = e.target.value; plist.fam = plist.pkg = ''; plist.limit = 40; rr(); });
  box.querySelector('#pfam').addEventListener('change', e=>{ plist.fam = e.target.value; plist.pkg = ''; plist.limit = 40; rr(); });
  box.querySelector('#ppkg').addEventListener('change', e=>{ plist.pkg = e.target.value; plist.limit = 40; rr(); });
  const pc = box.querySelector('#pclear'); if(pc) pc.addEventListener('click', ()=>{ plist.sup = plist.fam = plist.pkg = ''; rr(); });
  const pm = box.querySelector('#pmore'); if(pm) pm.addEventListener('click', ()=>{ plist.limit += 40; const y = window.scrollY; rr(); window.scrollTo(0, y); });
}
/* ---------------- the assistant's CONTEXT PACKET ----------------
   Everything the Ask section may talk about, taken from the data already
   loaded for this account: identity, the reference month, monthly cases,
   the top products with their last 12 months, every alert with its
   evidence, the buying patterns, this account's status on the rep's
   programs, the rep's notes, the tap survey, warehouse availability for
   the products it buys, and a plain list of what is NOT in the data. Kept
   around 20-40 KB. No dollars anywhere in it. */
function buildPacket(x){
  const {a, rep, d, sales, months, N, R, refKey, F, alerts, rows, follows, targets, credited, due, CAT, progList} = x;
  const P = F.patterns || null;
  const last12 = arr => arr.slice(Math.max(0, N-12)).map(v=>Math.round(v*10)/10);
  const lab12 = months.slice(Math.max(0, N-12));
  const prodRows = (sales ? sales.products : []).map(p=>{ let li=-1; for(let i=N-1;i>=0;i--) if(p[5][i]>0){ li=i; break; } const c = CAT.byNum ? CAT.byNum.get(String(p[0])) : null;
    return {num:String(p[0]), name:p[1], family:p[2], supplier:p[3], pkg:p[4], cases12: Math.round(sumRange(p[5], N-12, N)*10)/10, months12: p[5].slice(N-12).filter(v=>v>0).length, lastMonth: li>=0 ? months[li] : null, last12: last12(p[5]),
      warehouseAvailable: c && c[5]!=null ? c[5] : null, warehouseStatus: c ? c[7] : null}; });
  const alerted = new Set(alerts.map(al=>String(al.pn)));
  const products = prodRows.filter((p,i)=>i<30 || alerted.has(p.num)).slice(0, 45);
  const trim = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : arr;
  const patterns = P ? Object.assign({}, P, {topProducts:trim(P.topProducts,15), topFamilies:trim(P.topFamilies,10), newPlacements:trim(P.newPlacements,10), sizeChanges:trim(P.sizeChanges,10), stopped:trim(P.stopped,15), seasonal:trim(P.seasonal,10), consistent:trim(P.consistent,15), families:undefined}) : null;
  const taps = a.taps ? {lastSurvey:a.taps.lastDisplay||a.taps.last, daysSince: due ? due.days : null, resurvey: due ? due.level : null, handlesOurs:a.taps.ours, handlesTheirs:a.taps.them, unverified:a.taps.unv,
      brands: ((sales && sales.taps) || []).slice(0, 25).map(b=>({brand:b.b, side:b.s, handles:b.n})), earlierSurveys: a.taps.passes>1 ? a.taps.passes-1 : 0} : (a.prem==='On' ? {note:'on-premise account with no tap survey on file'} : null);
  return {
    v:1, rep, viewer: U ? {name:U.name, role:U.role, preview:!!U.preview} : null,
    account: {n:a.n, name:a.name, city:a.city, county:a.county, area:a.area, premise:premWord(a.prem), service:a.service||null, address:a.address||null, sizeClass:isMgr ? a.sizeClass||null : null, decile:isMgr ? a.decile||null : null, stops2026:a.stops2026, distributionPoints2026:a.distPts, cases2026:a.cases2026},
    data: {salesThrough: months[N-1], referenceMonth: refKey, referenceMonthLabel: monLabel(refKey), firstMonth: months[0], firstMonthLabel: monLabel(months[0]), monthsLoaded: months.length, salesLoaded: (d.sales && d.sales.loaded || '').slice(0,10), bookAsOf: d.book.asOf, tapsAsOf: (d.taps.asOf||'').slice(0,10), warehouseAsOf: (CAT.inventory && CAT.inventory.asOf) || null,
           grain: 'cases per product per calendar month, net of returns; no invoice dates, no dollars'},
    monthlyCases: sales ? lab12.map((m,i)=>[m, last12(sales.series)[i]]) : [],
    productsOnRecord: sales ? sales.products.length : 0,
    products,
    alerts: alerts.slice(0, 25),
    alertCounts: F.counts || null,
    patterns,
    programs: progList,
    notes: rows.map(r=>({status:r.status, program: progName(r.program_id), note:r.note||'', date:(r.updated_at||'').slice(0,10)})),
    openFollowUps: follows.length,
    taps,
    notInData: [
      'contact name, phone, email, business hours, delivery instructions, next delivery date (Encompass customer master -- requested)',
      'invoices, invoice dates, dollar amounts, prices, deals, promotions, payouts',
      'accounts receivable, balances, credits, aging',
      'retailer shelf stock, backorders, pre-orders, customer allocations',
      'other accounts, area-wide or comparable-account trends',
      'days between orders (sales are monthly)',
      'why an account stopped or slowed (the data shows the gap, not the reason)',
    ],
  };
}
// switch the open section / sub-view in place (no re-render): hidden attribute + hash
function showSec(k, sub, toId){
  state.sec = SECS.some(x=>x[0]===k) ? k : 'over';
  state.sub = state.sec==='history' ? (HSUBS.some(x=>x[0]===sub) ? sub : (state.sec==='history' && HSUBS.some(x=>x[0]===state.sub) ? state.sub : 'sales')) : state.sec==='more' ? (MSUBS.includes(sub) ? sub : '') : '';
  document.querySelectorAll('.secbody').forEach(el=>{ el.hidden = el.dataset.sec!==state.sec; });
  document.querySelectorAll('.subbody').forEach(el=>{ el.hidden = !(el.dataset.sec===state.sec && el.dataset.sub===state.sub); });
  document.querySelectorAll('.sectab').forEach(t=>{ const on = t.dataset.sec===state.sec; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
  document.querySelectorAll('.hseg [data-go]').forEach(t=>{ const on = t.dataset.go==='history:'+state.sub; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
  const hit = findAccount(state.n);
  history.replaceState(null, '', acctHash(state.n, hit ? hit.rep : '', state.sec, state.sub));
  if(toId){ const el = document.getElementById(toId); if(el && !el.closest('[hidden]')) requestAnimationFrame(()=>el.scrollIntoView({block:'start', behavior:'smooth'})); else window.scrollTo(0, 0); }
  else { const nav = document.querySelector('.secnav'); const y = nav ? nav.getBoundingClientRect().top + window.scrollY - 70 : 0; if(window.scrollY > y) window.scrollTo(0, Math.max(0, y)); }
}

/* ---------------- render + boot ---------------- */
function render(){
  if(state.view==='acct') renderAccount(); else renderList();
}
document.addEventListener('click', e=>{
  const t = e.target.closest('.sectab[data-sec], [data-go]'); if(!t || state.view!=='acct') return;
  e.preventDefault();
  if(t.dataset.go){ const [sec, sub, id] = goTarget(t.dataset.go); showSec(sec, sub, id); } else showSec(t.dataset.sec, '');
});

document.addEventListener('click', e=>{
  const om = e.target.closest('.msheet a[data-open]'); if(om){ rememberList(); ss.set('mapback', '1'); return; }
  const a = e.target.closest('a.row[data-n]'); if(!a) return;
  // remember where the list was so Back lands here
  rememberList(); ss.set('scroll', String(window.scrollY));
});
window.addEventListener('hashchange', ()=>{
  const wasList = state.view==='list';
  applyHash(); render();
  if(state.view==='list'){ let y = +(ss.get('scroll')||0); if(!wasList) requestAnimationFrame(()=>window.scrollTo(0, y)); }
  else window.scrollTo(0, 0);
});
async function boot(){
  if(!U){ app.innerHTML = '<div class="kdh-state unavailable"><b>Sign in to see accounts.</b></div>'; return; }
  applyHash();
  await loadReps(SCOPE);
  // action chips need the program targets; compute for the reps on screen
  await Promise.all(SCOPE.filter(r=>repData.get(r)).map(indexPrograms));
  await loadMarks(SCOPE);
  render();
  // back on the same list as it was left (the navigation's My Accounts, or a reload): same scroll too
  if(state.view==='list' && ss.get('list')===listHash()){ let y = +(ss.get('scroll')||0); if(y) requestAnimationFrame(()=>window.scrollTo(0, y)); }
}
window.addEventListener('pagehide', ()=>{ if(state.view==='list'){ rememberList(); ss.set('scroll', String(window.scrollY)); } });
boot();
})();
