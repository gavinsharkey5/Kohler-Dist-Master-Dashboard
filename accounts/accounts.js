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
const state = {view:'list', q:'', rep:'', need:'', n:null, acctRep:null, from:null, fl:'', limit:120};
function readHash(){
  const h = (location.hash||'').replace(/^#/,''); const o = {};
  h.split('&').filter(Boolean).forEach(kv=>{ const i = kv.indexOf('='); if(i<0) return; o[kv.slice(0,i)] = decodeURIComponent(kv.slice(i+1)); });
  return o;
}
function applyHash(){
  const h = readHash();
  state.q = h.q || ''; state.rep = h.rep && SCOPE.includes(h.rep) ? h.rep : ''; state.need = h.need || '';
  state.from = h.from || null; state.fl = h.fl || '';
  if(h.acct){ state.view = 'acct'; state.n = String(h.acct); } else { state.view = 'list'; state.n = null; }
}
function listHash(){
  const p = [];
  if(state.q) p.push('q='+encodeURIComponent(state.q));
  if(state.rep) p.push('rep='+encodeURIComponent(state.rep));
  if(state.need) p.push('need='+state.need);
  return '#'+p.join('&');
}
function acctHash(n, rep){ return '#acct='+encodeURIComponent(n)+(rep && isMgr ? '&rep='+encodeURIComponent(rep) : ''); }
const scrollMem = {};

/* ---------------- data ---------------- */
const repData = new Map();     // rep -> reps/<key>.json
const salesCache = new Map();  // n -> sales/<key>/<n>.json (or null when 404)
const marks = new Map();       // account_num -> rep_actions rows (all statuses)
let marksLoaded = false, marksError = '';
let progIdx = new Map();       // rep -> {targets: Map(n -> [{p, why, warm}]), credited: Map(n -> [rows]), programs:[p]}
async function getJson(url){ const r = await fetch(url, {cache:'no-store'}); if(r.status===404 || r.status===403) return null; if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
async function loadReps(names){
  await Promise.all(names.map(async n=>{ if(repData.has(n)) return; const d = await getJson('data/reps/'+repKey(n)+'.json').catch(()=>null); repData.set(n, d); }));
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
// POSSIBLE REORDER GAP -- the same rule generate.py applies (see README):
// a regular product (bought in 4+ of the last 12 months, usually <= 3 months
// apart) not bought for >= 2 months and >= twice its usual gap.
function reorderGaps(sales){
  if(!sales) return [];
  const N = sales.months.length, out = [];
  sales.products.forEach(p=>{
    const arr = p[5]; const idxs = []; arr.forEach((c,i)=>{ if(c>0) idxs.push(i); });
    const recent = idxs.filter(i=>i>=N-12); if(recent.length<4) return;
    const ints = idxs.slice(1).map((b,i)=>b-idxs[i]).sort((a,b)=>a-b); const med = ints.length ? ints[Math.floor(ints.length/2)] : 1;
    if(med>3) return;
    const since = (N-1)-idxs[-1+idxs.length];
    if(since>=2 && since>=2*med){
      const usual = recent.reduce((s,i)=>s+arr[i],0)/recent.length;
      out.push({p, since, med, last: sales.months[idxs[idxs.length-1]], bought12: recent.length, usual});
    }
  });
  return out.sort((a,b)=>b.usual-a.usual);
}

/* ---------------- list ---------------- */
function needOf(a, rep){
  const idx = progIdx.get(rep); const k = String(a.n);
  const follow = (marks.get(k)||[]).filter(r=>r.status==='follow').length;
  // "to discuss" = the trackers' own WARM leads for this account (1 SKU
  // short, still on Summer Ale, missing product ...). Plain eligibility is
  // shown on the account page, not counted as attention.
  const progs = idx ? (idx.targets.get(k)||[]).filter(t=>t.warm).length : null;
  const due = tapDue(a.taps);
  return {follow, progs, gaps: a.gaps||0, tap: due && due.level!=='ok' ? due : null};
}
function chipsHtml(nd){
  const c = [];
  if(nd.follow) c.push(`<span class="chip follow">⚑ ${plural(nd.follow,'follow-up')}</span>`);
  if(nd.progs) c.push(`<span class="chip prog">${plural(nd.progs,'program lead')}</span>`);
  if(nd.gaps) c.push(`<span class="chip gap">${plural(nd.gaps,'reorder')} to check</span>`);
  if(nd.tap) c.push(`<span class="chip tap${nd.tap.level==='soon'?' soon':''}">${nd.tap.level==='overdue' ? 'Survey overdue '+nd.tap.days+'d' : 'Survey due in '+(60-nd.tap.days)+'d'}</span>`);
  return c.length ? `<span class="chips">${c.join('')}</span>` : '';
}
function matchesNeed(nd, need){
  if(!need) return true;
  if(need==='any') return !!(nd.follow || nd.progs || nd.tap);   // reorder checks have their own filter
  if(need==='follow') return nd.follow>0; if(need==='prog') return nd.progs>0; if(need==='gap') return nd.gaps>0; if(need==='tap') return !!nd.tap;
  return true;
}
function renderList(){
  const reps = state.rep ? [state.rep] : SCOPE;
  const rows = [];
  reps.forEach(rep=>{ const d = repData.get(rep); if(!d) return; d.accounts.forEach(a=>rows.push({a, rep})); });
  rows.sort((x,y)=>x.a.name.localeCompare(y.a.name));
  const q = state.q.trim().toLowerCase();
  const shown = rows.filter(({a, rep})=>{
    if(q && !(a.name.toLowerCase().includes(q) || String(a.n).includes(q) || (a.city||'').toLowerCase().includes(q) || (isMgr && rep.toLowerCase().includes(q)))) return false;
    return matchesNeed(needOf(a, rep), state.need);
  });
  const attention = rows.filter(({a, rep})=>matchesNeed(needOf(a, rep), 'any')).length;
  const missing = reps.filter(r=>!repData.get(r));
  const who = !isMgr ? '' : (SCOPE.length===rosterAll.length ? 'Every rep' : 'Your team');
  const title = isMgr ? 'Team accounts' : 'My accounts';
  const sub = isMgr ? `${plural(rows.length,'account')} · ${plural(SCOPE.length,'rep')} · ${who}` : `${plural(rows.length,'account')} on your route`;
  const first = repData.get(reps[0]);
  const fresh = first ? `Book as of ${E(first.book.asOf)} · sales through ${E(monLabel(first.sales.through))} · taps as of ${E((first.taps.asOf||'').slice(0,10))}` : '';
  app.innerHTML = `<header class="ws"><div class="id"><p class="kicker">Accounts</p><h1>${title}</h1><p class="idline">${sub}${attention ? ` · <b>${attention}</b> need attention` : ''}</p><p class="fresh">${fresh}</p></div></header>
    <div class="filters">
      <input type="search" class="kdh-field" id="q" placeholder="Search accounts${isMgr?' or reps':''}" value="${E(state.q)}" autocomplete="off" aria-label="Search accounts">
      ${isMgr ? `<select id="repSel" aria-label="Rep"><option value="">All my reps</option>${SCOPE.map(r=>`<option value="${E(r)}"${r===state.rep?' selected':''}>${E(r)}</option>`).join('')}</select>` : ''}
      <select id="needSel" aria-label="Needs attention"><option value="">All accounts</option><option value="any"${state.need==='any'?' selected':''}>Needs attention (follow-ups, leads, surveys)</option><option value="follow"${state.need==='follow'?' selected':''}>Open follow-ups</option><option value="prog"${state.need==='prog'?' selected':''}>Program lead</option><option value="gap"${state.need==='gap'?' selected':''}>Reorder to check</option><option value="tap"${state.need==='tap'?' selected':''}>Survey due or overdue</option></select>
    </div>
    ${missing.length ? `<div class="kdh-state unavailable"><b>No account list on file for ${E(missing.join(', '))}.</b><span>The customer base report has no accounts under that name, or the data slice has not been generated.</span></div>` : ''}
    ${!SCOPE.length ? `<div class="kdh-state unavailable"><b>We couldn’t find your name on the customer base.</b><span>You’re signed in as ${E(U ? U.name : '')}. Ask Gavin to check the spelling on the access list.</span></div>` : ''}
    <p class="count">${shown.length===rows.length ? '' : `${shown.length} of `}${plural(rows.length,'account')}${state.need ? ' · filtered' : ''}</p>
    <div class="rows" id="rows">${shown.slice(0, state.limit).map(({a, rep})=>{
      const nd = needOf(a, rep);
      return `<a class="row" href="${acctHash(a.n, rep)}" data-n="${E(a.n)}" data-rep="${E(rep)}">
        <span class="row-main"><h3>${E(a.name)}</h3><span class="row-s">${E([a.city, premWord(a.prem)].filter(Boolean).join(' · '))}${isMgr ? ` · <span class="rep">${E(rep)}</span>` : ''}</span>${chipsHtml(nd)}</span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></a>`; }).join('')}
      ${!shown.length && rows.length ? `<div class="kdh-state empty"><b>No account matches.</b></div>` : ''}</div>
    ${shown.length>state.limit ? `<button class="btn outline more" id="more" type="button">Show ${Math.min(120, shown.length-state.limit)} more of ${shown.length}</button>` : ''}`;
  const mb = $('#more'); if(mb) mb.addEventListener('click', ()=>{ state.limit += 120; const y = window.scrollY; renderList(); window.scrollTo(0, y); });
  $('#q').addEventListener('input', e=>{ state.q = e.target.value; history.replaceState(null,'',listHash()); const list = $('#rows'); if(list) renderListRowsOnly(); });
  const rs = $('#repSel'); if(rs) rs.addEventListener('change', e=>{ state.rep = e.target.value; history.replaceState(null,'',listHash()); render(); });
  $('#needSel').addEventListener('change', e=>{ state.need = e.target.value; history.replaceState(null,'',listHash()); render(); });
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
function progName(id){ const p = H.programs().find(x=>x.id===id); return p ? (p.shortName||p.name)+(p.type==='MPO' ? ' · '+p.channelLabel+' MPO' : '') : id; }
function sumRange(arr, from, to){ let s = 0; for(let i=from;i<to;i++) s += arr[i]||0; return s; }
function rangeLabel(months, from, to){ return monShort(months[from])+'–'+monLabel(months[to-1]); }

async function renderAccount(){
  const hit = findAccount(state.n);
  const fromHref = state.from || (sessionStorage.getItem('kdh_acct_list') || './');
  const fromLabel = state.fl || 'Accounts';
  if(!hit){
    app.innerHTML = back(fromLabel, fromHref) + `<div class="kdh-state unavailable"><b>That account is not on ${isMgr ? 'your team’s' : 'your'} list.</b><span>Accounts open only from the assigned route${isMgr ? 's of the reps you oversee' : ''}.</span></div>`;
    return;
  }
  const {a, rep, d} = hit;
  app.innerHTML = back(fromLabel, fromHref) + `<div class="acct-head"><h1>${E(a.name)}</h1><p class="sub">${E([a.city, premWord(a.prem)].filter(Boolean).join(' · '))}</p><p class="sub2">Account #${E(a.n)}${a.address ? ' · '+E(a.address) : ''}${a.area ? ' · '+E(a.area) : ''}${isMgr ? ' · Rep: '+E(rep) : ''}</p></div><div class="kdh-state loading">Loading this account…</div>`;
  // everything the page needs, in parallel
  const key = repKey(rep);
  const [sales, idx] = await Promise.all([
    salesCache.has(String(a.n)) ? Promise.resolve(salesCache.get(String(a.n))) : getJson('data/sales/'+key+'/'+encodeURIComponent(a.n)+'.json').catch(()=>null).then(s=>{ salesCache.set(String(a.n), s); return s; }),
    indexPrograms(rep),
    loadMarks(SCOPE),
  ]);
  if(state.view!=='acct' || String(state.n)!==String(a.n)) return;   // navigated away meanwhile
  const k = String(a.n);
  const rows = marks.get(k) || [];
  const follows = rows.filter(r=>r.status==='follow');
  const targets = idx.targets.get(k) || [];
  const credited = idx.credited.get(k) || [];
  const gaps = reorderGaps(sales);
  const due = tapDue(a.taps);
  const months = sales ? sales.months : (d.sales.months||[]);
  const N = months.length;

  /* ---- Focus: up to three supported actions, in a fixed order ---- */
  const focus = [];
  follows.slice(0,1).forEach(r=>focus.push({kind:'Follow-up', t:`Follow up on ${E(progName(r.program_id))}`, w:`You flagged this account ${E(fmtDay(new Date(r.updated_at)))}${r.note ? ' — “'+E(r.note)+'”' : ''}.`, n:`Pick the conversation back up, then mark it Done in the hub.`, href:hubAcctLink(H.programs().find(p=>p.id===r.program_id), rep, a.n, 'follow'), hl:'Open in the hub'}));
  if(due && due.level==='overdue') focus.push({kind:'Tap survey', t:'Resurvey the taps', w:`Last surveyed ${E(a.taps.lastDisplay||a.taps.last)}, ${due.days} days ago — past the 60-day window.`, n:'Walk the taps and submit the survey in iSellBeer.', href:TAP+'#q='+encodeURIComponent(a.name), hl:'Open the Tap Tracker'});
  targets.filter(t=>t.warm || (t.p.period.end - TODAY)/86400000 <= 14).sort((x,y)=>(y.warm-x.warm) || (x.p.period.end-y.p.period.end)).slice(0, 2).forEach(t=>{
    const f = H.progFacts(t.p, t.r, rep);
    focus.push({kind: t.warm ? 'Program lead' : 'Program ending soon', t:E(H.sellAsk(t.p)), w:`${E(t.p.shortName||t.p.name)} (${E(t.p.supplier)}) · ${E(t.why || 'this account is eligible and not buying it yet')} · ${E(H.endsLabel(t.p.period))}.`, n:`You are at ${f.main}${f.need && f.need!=='Goal met' ? ' — '+f.need : ''}.`, href:progLink(t.p, rep), hl:'Program details'});
  });
  gaps.slice(0,2).forEach(g=>focus.push({kind:'Reorder to check', t:`Ask about ${E(g.p[1])}`, w:`Bought in ${g.bought12} of the last 12 months, usually every ${g.med===1?'month':g.med+' months'}; last in ${E(monLabel(g.last))}, ${g.since} months ago in the data.`, n:'Check whether they need a reorder — a gap in the data, not a confirmed need.', href:'#sales', hl:'See purchases'}));
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
    const gapRows = gaps.slice(0, 6).map(g=>`<tr><td><b>${E(g.p[1])}</b><span class="sub">${E(g.p[2])}</span></td><td class="num" data-l="Usually">every ${g.med===1?'month':g.med+' mo'}</td><td class="num" data-l="Last bought">${E(monLabel(g.last))}</td><td class="num" data-l="Typical order">${fmtN(g.usual)} cs</td></tr>`).join('');
    const hist = sales.products.slice(0, 40).map(p=>`<div class="hist"><b>${E(p[1])}</b> · ${p[5].map((c,i)=>c>0 ? monShort(months[i])+' '+fmtN(c) : '').filter(Boolean).join(' · ') || 'no cases'}</div>`).join('');
    salesHtml = `<div class="card">
      <div class="kv"><span>Last purchase</span><span>${lastIdx>=0 ? E(monLabel(months[lastIdx])) : 'none in the data'}</span></div>
      <div class="kv"><span>${E(rangeLabel(months,N-3,N))}</span><span><b>${fmtN(last3)} cases</b> · ${E(rangeLabel(months,N-6,N-3))}: ${fmtN(prior3)}${ly3!=null ? ' · '+E(rangeLabel(months,N-15,N-12))+': '+fmtN(ly3) : ''}</span></div>
      <div class="kv"><span>Products</span><span>${plural(sales.products.filter(p=>sumRange(p[5],N-12,N)>0).length,'product')} bought in the last 12 months</span></div>
      ${gaps.length ? `<h3 class="note" style="margin-top:12px"><b>Possible reorder gaps</b> · ${gaps.length} regular ${gaps.length===1?'product':'products'} not bought recently</h3><table class="tbl"><thead><tr><th>Product</th><th class="num">Usually</th><th class="num">Last bought</th><th class="num">Typical order</th></tr></thead><tbody>${gapRows}</tbody></table>${gaps.length>6 ? `<p class="note">${gaps.length-6} more in the purchase history below.</p>` : ''}` : `<p class="note">No regular product is overdue against its usual pattern in the data.</p>`}
      <h3 class="note" style="margin-top:6px"><b>Recent purchases</b> · top products of ${E(rangeLabel(months,N-3,N))}</h3>
      ${recent.length ? `<table class="tbl"><thead><tr><th>Product</th><th class="num">${E(rangeLabel(months,N-3,N))}</th><th class="num">${E(rangeLabel(months,N-6,N-3))}</th><th class="num">Last bought</th></tr></thead><tbody>${recentRows}</tbody></table>` : `<p class="note">Nothing bought in ${E(rangeLabel(months,N-3,N))}.</p>`}
      <details class="fold" id="sales"><summary>Purchase history by product (${plural(sales.products.length,'product')}, ${E(monLabel(months[0]))} – ${E(monLabel(months[N-1]))})</summary>${hist}${sales.products.length>40 ? `<p class="note">Showing the 40 biggest products of the last 12 months.</p>` : ''}</details>
    </div>`;
  }

  /* ---- Programs: what this ACCOUNT can still earn, kept apart from the rep's progress.
     Credited / warm lead / already buying stay open; plain eligibility ("could
     still qualify") and programs where the account is not on any list fold. ---- */
  const pitem = (p, tag, line, links) => `<div class="pitem"><div class="pt"><span>${E(p.shortName||p.name)}</span>${tag}</div><div class="ps">${E(p.supplier)} · ${E(p.channelLabel)}${p.type==='MPO' ? ' · '+E(p.monthLabel)+' MPO' : ''} · ${E(H.endsLabel(p.period))}</div>${line ? `<div class="pl">${line}</div>` : ''}<div class="pa">${links}</div></div>`;
  const openItems = [], couldItems = [], otherItems = [];
  idx.programs.forEach(p=>{
    const r = p.forRep(rep); if(!r) return;
    const cred = credited.filter(c=>c.p===p);
    const tgt = targets.find(t=>t.p===p);
    const A = H.accountsFor(p, rep);
    const excl = (A.excluded||[]).concat(A.unknown||[]).find(x=>String(x.n)===k);
    const buying = (A.buying||[]).find(x=>String(x.n)===k);
    const links = `<a href="${E(progLink(p, rep))}">Program details ›</a>${(tgt||cred.length) ? `<a href="${E(hubAcctLink(p, rep, a.n, cred.length ? 'dist' : 'targets'))}">Account in the hub ›</a>` : ''}`;
    if(cred.length) openItems.push(pitem(p, '<span class="tag ok">Credited</span>', cred.map(c=>`<b>${E(c.what||'Credited')}</b>${c.date ? ' · '+E(c.date) : ''}`).join('<br>'), links));
    else if(tgt && tgt.warm) openItems.push(pitem(p, '<span class="tag go">Lead</span>', `<b>To qualify:</b> ${E(H.sellAsk(p))} · ${E(tgt.why)}`, links));
    else if(buying) openItems.push(pitem(p, '<span class="tag">Already buying</span>', `Already on the brand${buying.note ? ' · '+E(buying.note) : ''} — no credit recorded for this account yet.`, links));
    else if(tgt) couldItems.push(pitem(p, '<span class="tag go">Could qualify</span>', `<b>To qualify:</b> ${E(H.sellAsk(p))}${tgt.why && tgt.why!=='Never bought it' ? ' · '+E(tgt.why) : ' · not buying it yet'}`, links));
    else if(excl) otherItems.push(pitem(p, '<span class="tag na">Not sellable here</span>', E(excl.why || 'The brand cannot be sold in this account’s area.'), links));
    else if(r.soon) otherItems.push(pitem(p, '<span class="tag na">Awaiting data</span>', '', links));
    else otherItems.push(pitem(p, '<span class="tag na">Not on its lists</span>', '', links));
  });
  const progHtml = idx.programs.length ? `<div class="card">${openItems.join('') || `<p>No credit, lead or current purchase for this account on an active program.</p>`}
      ${couldItems.length ? `<details class="fold"><summary>Could still qualify · ${plural(couldItems.length,'program')}</summary>${couldItems.join('')}</details>` : ''}
      ${otherItems.length ? `<details class="fold"><summary>Other active programs · ${otherItems.length}</summary>${otherItems.join('')}</details>` : ''}
    </div>` : `<div class="card"><p>No active incentive or MPO applies to ${E(rep.split(' ')[0])} right now.</p></div>`;

  /* ---- Products to discuss: program targets + what the sales history says ---- */
  const famStatus = (fams)=>{
    if(!sales || !fams || !fams.length) return '';
    const hits = sales.products.filter(p=>fams.some(f=>{ const a2 = String(p[2]||'').toLowerCase(), b = String(f).toLowerCase(); return a2 && (a2.includes(b) || b.includes(a2)); }));
    if(!hits.length) return `Never bought ${E(fams.slice(0,2).join(' or '))} in the available history (${E(monLabel(months[0]))} – ${E(monLabel(months[N-1]))}).`;
    let li = -1; hits.forEach(p=>p[5].forEach((c,i)=>{ if(c>0 && i>li) li = i; }));
    const in12 = li>=N-12;
    return in12 ? `Bought ${E(fams.slice(0,2).join(' / '))} as recently as ${E(monLabel(months[li]))}.` : `Bought ${E(fams.slice(0,2).join(' / '))} before, last in ${E(monLabel(months[li]))} — not in the last 12 months.`;
  };
  const warm = targets.filter(t=>t.warm).sort((x,y)=>x.p.period.end-y.p.period.end);
  const discuss = warm.map(t=>{
    const fams = HubAccounts.PROGRAM_BRANDS[HubAccounts.brandKey(t.p)] || [];
    return `<div class="pitem"><div class="pt"><span>${E(H.sellAsk(t.p))}</span><span class="tag go">Lead</span></div><div class="ps">${E(t.p.shortName||t.p.name)} · ${E(t.p.supplier)} · ${E(H.endsLabel(t.p.period))}</div><div class="pl">${E(t.why)}${famStatus(fams) ? '<br>'+famStatus(fams) : ''}</div></div>`;
  }).join('');
  const discussHtml = discuss ? `<div class="card">${discuss}<p class="note">Leads come from the trackers’ own opportunity lists. Sell sheets, approved pitches and inventory availability are not in the data yet (see README).</p></div>`
    : `<div class="card"><p>No tracker lead for this account right now. Programs it could still qualify for are listed above; recent purchases show what it usually takes.</p></div>`;

  /* ---- Notes & follow-ups (rep_actions, read here, edited in the hub) ---- */
  const LBL = {follow:'Follow up', done:'Done', skip:'Not now'};
  const notesHtml = marksError==='off' ? `<div class="card"><p>Notes need a sign-in on kohlerdisthub.com.</p></div>`
    : marksError ? `<div class="card"><p>Couldn’t load notes (${E(marksError)}).</p></div>`
    : rows.length ? `<div class="card">${rows.map(r=>`<div class="pitem"><div class="ra-line"><span class="st ${E(r.status)}">${LBL[r.status]||r.status}</span><span>${E(progName(r.program_id))}</span><small>${E(fmtDay(new Date(r.updated_at)))}${isMgr ? ' · '+E(r.rep_name||rep) : ''}</small></div>${r.note ? `<div class="pl"><i>${E(r.note)}</i></div>` : ''}<div class="pa"><a href="${E(hubAcctLink(H.programs().find(p=>p.id===r.program_id), rep, a.n, r.status==='follow' ? 'follow' : r.status))}">${(!isMgr && !U.preview) ? 'Edit in the hub ›' : 'View in the hub ›'}</a></div></div>`).join('')}
        <p class="note">${isMgr ? `These are ${E(rep.split(' ')[0])}’s own marks; only the rep can change them.` : U.preview ? 'Saving is off in preview — these are the rep’s own marks.' : 'Marks are made on the account inside a program in the hub, where they save.'}</p></div>`
    : `<div class="card"><p>No notes or follow-ups on this account yet.${!isMgr && !U.preview ? ' Open a program in the hub and mark the account Follow up to start one.' : ''}</p></div>`;

  /* ---- Taps & visits (on-premise accounts the survey covers) ---- */
  let tapsHtml = '';
  if(a.taps){
    const t = a.taps; const brands = (sales && sales.taps) || [];
    const dueTxt = due ? (due.level==='overdue' ? `<span class="tag warn">Resurvey overdue · ${due.days} days</span>` : due.level==='soon' ? `<span class="tag warn">Resurvey due in ${60-due.days} days</span>` : `<span class="tag ok">Surveyed ${due.days} days ago</span>`) : '';
    tapsHtml = `<div class="card">
      <div class="kv"><span>Last survey</span><span>${E(t.lastDisplay||t.last)} ${dueTxt}</span></div>
      <div class="kv"><span>Handles</span><span><b>${t.ours} ours</b> · ${t.them} theirs${t.unv ? ' · '+t.unv+' unverified' : ''}</span></div>
      ${brands.length ? `<details class="fold"><summary>What’s on tap (${plural(brands.length,'handle')})</summary>${brands.map(b=>`<div class="hist"><b>${E(b.b||'(unnamed)')}</b> · ${E(b.s)}${b.n>1 ? ' × '+b.n : ''}</div>`).join('')}</details>` : ''}
      ${t.passes>1 && sales && sales.tapHistory && sales.tapHistory.length ? `<details class="fold"><summary>Earlier surveys (${t.passes-1})</summary>${sales.tapHistory.map(h=>`<div class="hist"><b>${E(h.display||h.visited)}</b> · ${h.ours} ours · ${h.them} theirs</div>`).join('')}</details>` : ''}
      <div class="kv"><span></span><span><a href="${TAP}#q=${encodeURIComponent(a.name)}">Open in the Tap Tracker ›</a></span></div>
    </div>`;
  } else if(a.prem==='On'){
    tapsHtml = `<div class="card"><p>No tap survey on file for this account in the current export (${E((d.taps.asOf||'').slice(0,10))}).</p></div>`;
  }

  const focusHtml = top.length ? `<div class="focus">${top.map((f,i)=>`<div class="fitem"><span class="num">${i+1}</span><div class="fmain"><span class="fkind">${E(f.kind)}</span><div class="ft">${f.t}</div><p class="fw">${f.w}</p><p class="fn">${E(f.n)} <a href="${E(f.href)}">${E(f.hl)} ›</a></p></div></div>`).join('')}</div>`
    : `<div class="kdh-state empty"><b>Nothing flagged for this account right now.</b><span>No open follow-up, no program target, no overdue survey and no regular product overdue in the data.</span></div>`;

  app.innerHTML = back(fromLabel, fromHref) + `<div class="acct-head"><h1>${E(a.name)}</h1><p class="sub">${E([a.city, premWord(a.prem)].filter(Boolean).join(' · '))}</p><p class="sub2">Account #${E(a.n)}${a.address ? ' · '+E(a.address) : ''}${a.area ? ' · '+E(a.area) : ''}${a.sizeClass ? ' · Class '+E(a.sizeClass) : ''}${isMgr ? ' · Rep: '+E(rep) : ''}</p></div>
    <section class="sec"><h2>Focus for this account</h2>${focusHtml}</section>
    <section class="sec"><h2>Sales &amp; reorders <small>Fusion, through ${E(monLabel(months[N-1]))}</small></h2>${salesHtml}</section>
    <section class="sec"><h2>Programs <small>${plural(idx.programs.length,'active program')} for ${E(rep.split(' ')[0])}</small></h2>${progHtml}</section>
    <section class="sec"><h2>Products to discuss</h2>${discussHtml}</section>
    <section class="sec"><h2>Notes &amp; follow-ups</h2>${notesHtml}</section>
    ${tapsHtml ? `<section class="sec"><h2>Taps &amp; visits <small>survey as of ${E((d.taps.asOf||'').slice(0,10))}</small></h2>${tapsHtml}</section>` : ''}
    <p class="fresh-foot">Customer base as of ${E(d.book.asOf)} · sales master through ${E(monLabel(months[N-1]))} (loaded ${E((d.sales.loaded||'').slice(0,10))}, monthly, net of returns) · programs as refreshed in the hub · tap survey as of ${E((d.taps.asOf||'').slice(0,10))}. Reorder gaps: regular products (4+ of the last 12 months, usually ≤3 months apart) not bought for 2+ months and twice their usual gap — a possibility to check, not a confirmed need.</p>`;
  const y = scrollMem[location.hash]; if(typeof y==='number'){ requestAnimationFrame(()=>window.scrollTo(0,y)); delete scrollMem[location.hash]; }
}

/* ---------------- render + boot ---------------- */
function render(){
  if(state.view==='acct') renderAccount(); else renderList();
}
document.addEventListener('click', e=>{
  const a = e.target.closest('a.row[data-n]'); if(!a) return;
  // remember where the list was so Back lands here
  try{ sessionStorage.setItem('kdh_acct_list', listHash()); sessionStorage.setItem('kdh_acct_scroll', String(window.scrollY)); }catch(err){}
});
window.addEventListener('hashchange', ()=>{
  const wasList = state.view==='list';
  applyHash(); render();
  if(state.view==='list'){ let y = 0; try{ y = +sessionStorage.getItem('kdh_acct_scroll')||0; }catch(err){} if(!wasList) requestAnimationFrame(()=>window.scrollTo(0, y)); }
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
  if(state.view==='list'){ let y = 0; try{ y = +sessionStorage.getItem('kdh_acct_scroll')||0; }catch(err){} if(y) requestAnimationFrame(()=>window.scrollTo(0, y)); }
}
boot();
})();
