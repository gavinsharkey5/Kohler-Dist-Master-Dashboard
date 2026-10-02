/* MANAGER EXCEPTIONS (2026-10-03). See the comment in index.html and
   exceptions/README.txt. Data comes only through shared/kdh-data.js (files +
   Supabase) and hub.js's library (programs); this file computes the
   exceptions and renders them. It never marks anything done. */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = document.getElementById('excApp');
const U = window.kdhUser ? window.kdhUser() : null;
if(!U || U.role!=='manager'){
  app.innerHTML = U && U.preview
    ? `<div class="kdh-state unavailable"><b>You are previewing a rep.</b><span>Exceptions is a manager view. Exit preview to see your team.</span><button type="button" class="btn" id="excExit" style="margin-top:12px">Exit Preview</button></div>`
    : `<div class="kdh-state unavailable"><b>Exceptions is for managers.</b><span><a href="../rep/">Go to your home</a>.</span></div>`;
  const x = document.getElementById('excExit'); if(x) x.addEventListener('click', ()=>{ if(window.kdhExitPreview) window.kdhExitPreview(); });
  return;
}
const H = window.KohlerHub, D = window.KdhData;
const DAY = 86400000;
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const parseDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||'')); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; };
const fmtDay = d => d ? d.toLocaleDateString('en-US', {month:'short', day:'numeric', year: d.getFullYear()===TODAY.getFullYear() ? undefined : 'numeric'}) : '';
const days = d => Math.round((d - TODAY)/DAY);
const plural = (n, w, p) => n+' '+(n===1 ? w : (p || w+'s'));
const rel = d => { const n = days(d); return n===0 ? 'today' : n<0 ? plural(-n,'day')+' overdue' : 'in '+plural(n,'day'); };

/* ---- the rules (also in README.txt and on the page under "How This Works") ---- */
const PROGRAM_WINDOW = 14;   // a program "near deadline" ends within 14 days
const SOON = 7;              // a dated follow-up or survey "due soon" falls within 7 days
const STALE_UNDATED = 14;    // an undated follow-up becomes an exception after 14 days open
const TAP_DUE = 60;          // the Tap Tracker's 60-day resurvey rule
// priority: lower number first; within a type the most overdue / soonest first
const TYPES = {
  fu_over:   {p:1, label:'Follow-Up Overdue',        f:'follow', why:'The rep set a due date and it has passed.'},
  tap_over:  {p:2, label:'Tap Survey Overdue',       f:'tap',    why:'Last survey is past the 60-day resurvey rule.'},
  prog:      {p:3, label:'Program Ending, Work Left', f:'prog',  why:'The program ends within 14 days and the rep has not reached its goal.'},
  fu_soon:   {p:4, label:'Follow-Up Due Soon',       f:'follow', why:'Due within 7 days.'},
  tap_soon:  {p:5, label:'Tap Survey Due Soon',      f:'tap',    why:'Reaches the 60-day resurvey rule within 7 days.'},
  fu_stale:  {p:6, label:'Follow-Up Open, No Date',  f:'follow', why:'Open for 14+ days with no due date set.'},
};
const FILTERS = [['all','All'],['follow','Follow-Ups'],['tap','Tap Surveys'],['prog','Program Deadlines']];
const DUE = [['','Any Due Date'],['over','Overdue'],['7','Due Within 7 Days'],['14','Due Within 14 Days']];

/* ---- state (kept in the hash) ---- */
const PAGE = 25;
const st = {rep:'', q:'', type:'all', due:'', limit:PAGE};
function readHash(){ const h = new URLSearchParams(location.hash.slice(1)); st.rep = h.get('rep')||''; st.q = h.get('q')||''; st.type = h.get('type')||'all'; st.due = h.get('due')||''; }
function writeHash(){ const h = new URLSearchParams(); if(st.rep) h.set('rep', st.rep); if(st.q) h.set('q', st.q); if(st.type!=='all') h.set('type', st.type); if(st.due) h.set('due', st.due); const s = h.toString(); history.replaceState(null, '', location.pathname + (s ? '#'+s : '')); }

/* ---- program helpers (the hub's own filters, as the Accounts page uses them) ---- */
function programsFor(rep){
  return H.programs().filter(p=>{
    if(p.type==='MPO'){ if(p.monthKey!==H.mpoRepMonth(p.source)) return false; }
    else if(!H.isActive(p)) return false;
    if(!H.supportAllows(rep, p)) return false;
    const r = p.forRep(rep); if(!r || r.soon) return false;
    if(H.isDollarProgram(r)) return false;
    if(r.status==='unavailable') return false;
    if(!H.availability(p, rep).ok) return false;
    return true;
  });
}
const strip = s => String(s||'').replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const DONE_RE = /goal met|top tier|every one pays/i;
const progLink = (p, rep) => '../hub/#view=detail&rep='+encodeURIComponent(rep)+'&cat='+(p.type==='MPO' ? p.source : 'inc')+'&prog='+encodeURIComponent(p.id);
const acctLink = (n, rep, sub) => '../accounts/#acct='+encodeURIComponent(n)+'&rep='+encodeURIComponent(rep)+(sub ? '&sec=more&sub='+sub : '');

/* ---- build ---- */
let ROSTER = [], DM = null, EXC = [], META = {}, NOTES = [];
async function load(){
  const all = (H.roster || []).filter(n=>!window.kdhIsRep || window.kdhIsRep(n));
  DM = window.kdhTeam ? window.kdhTeam(H.dmGroups || []) : null;
  ROSTER = all.slice().sort();
  const [idx, act, books] = await Promise.all([
    D.repIndex().catch(()=>null),
    D.actions({reps: ROSTER, status:'follow'}).catch(e=>({rows:[], err:e.message||String(e)})),
    Promise.all(ROSTER.map(n=>D.repBook(n).then(b=>[n, b]).catch(()=>[n, null])))
  ]);
  META = {idx, act};
  if(act.err) NOTES.push(`<b>Follow-ups could not be loaded</b> (${E(act.err)}). Reload, or sign in again.`);
  else if(act.off) NOTES.push('<b>Follow-ups need a sign-in on kohlerdisthub.com.</b> Tap surveys and program deadlines are still listed.');
  else if(!act.dated) NOTES.push('Follow-up due dates need the notes update (supabase/migrations/20261002120000_account_notes_photos.sql); every open follow-up is treated as undated until it is run.');
  const out = [];
  const town = new Map();   // "rep|n" -> {name, city}
  // tap surveys, from each rep's account book
  books.forEach(([rep, b])=>{ if(!b) return; b.accounts.forEach(a=>{
    town.set(rep+'|'+a.n, {name:a.name, city:a.city, prem:a.prem});
    const last = a.taps && parseDay(a.taps.last); if(!last) return;
    const due = new Date(last.getTime() + TAP_DUE*DAY); const d = days(due);
    if(d<0 || d<=SOON) out.push({type: d<0 ? 'tap_over' : 'tap_soon', rep, n:a.n, acct:a.name, city:a.city, due,
      what: `Last tap survey ${a.taps.lastDisplay || fmtDay(last)}`,
      next: 'Resurvey the taps in iSellBeer', href:'../isellbeer/tap-survey-tracking/#q='+encodeURIComponent(a.name), hl:'Open in Tap Tracker'});
  }); });
  // follow-ups, from rep_actions (the rep's own records)
  (act.rows||[]).forEach(r=>{
    if(r.status!=='follow' || !r.rep_name) return;
    const rep = (window.kdhMatchName && window.kdhMatchName(r.rep_name, ROSTER)) || r.rep_name;
    if(!ROSTER.includes(rep)) return;
    const t = town.get(rep+'|'+r.account_num) || {};
    const isNote = String(r.program_id||'').startsWith('note:');
    const due = parseDay(r.follow_on);
    const opened = new Date(r.created_at || r.updated_at);
    const base = {rep, n:r.account_num, acct:r.account_name || t.name || 'Account #'+r.account_num, city:t.city||'', note:r.note||'',
      src: isNote ? 'Account note' : 'Program mark', next:'Check in with the rep on this follow-up', href:acctLink(r.account_num, rep, 'activity'), hl:'Open Account Activity'};
    if(due){ const d = days(due); if(d<0) out.push(Object.assign(base, {type:'fu_over', due, what: r.note ? `“${r.note}”` : 'Follow-up'}));
      else if(d<=SOON) out.push(Object.assign(base, {type:'fu_soon', due, what: r.note ? `“${r.note}”` : 'Follow-up'})); return; }
    const age = Math.floor((TODAY - opened)/DAY);
    if(!isNaN(age) && age>=STALE_UNDATED) out.push(Object.assign(base, {type:'fu_stale', due:null, age, what: (r.note ? `“${r.note}”` : 'Follow-up')+` · open ${plural(age,'day')}`}));
  });
  // programs near deadline with work left, per rep
  const near = new Set();
  const progRows = [];
  for(const rep of ROSTER){
    const ps = programsFor(rep).filter(p=>p.period && p.period.end && days(p.period.end)>=0 && days(p.period.end)<=PROGRAM_WINDOW);
    if(ps.some(p=>p.type==='MPO')) await H.loadFor(ps.filter(p=>p.type==='MPO'));
    ps.forEach(p=>{
      const r = p.forRep(rep); const f = H.progFacts(p, r, rep); if(!f || f.cls==='met' || f.cls==='na' || DONE_RE.test(strip(f.need)) || !strip(f.need)) return;
      const leads = H.nextAccounts(p, rep).rows.filter(a=>a.warm && !a.foreign);
      near.add(p.id);
      progRows.push({type:'prog', rep, p, due:new Date(p.period.end), name: window.kdhTitle ? window.kdhTitle(p.id, p.shortName||p.name) : (p.shortName||p.name), supplier:p.supplier,
        main: strip(f.main), need: strip(f.need), leads: leads.slice(0, 3).map(a=>({n:a.n, name:a.name})), leadCount: leads.length,
        next: leads.length ? `Visit ${leads.length===1 ? 'the lead account' : 'the '+leads.length+' lead accounts'}` : 'Review the program with the rep', href:progLink(p, rep), hl:'Open in Incentive Hub'});
    });
  }
  EXC = out.concat(progRows);
  META.programsChecked = near.size;
}

/* ---- filter + group ---- */
function filtered(){
  const q = st.q.trim().toLowerCase();
  return EXC.filter(x=>{
    if(st.rep && x.rep!==st.rep) return false;
    if(st.type!=='all' && TYPES[x.type].f!==st.type) return false;
    if(st.due){ if(!x.due) return false; const d = days(x.due); if(st.due==='over' ? d>=0 : d>+st.due) return false; }
    if(q){ const hay = x.type==='prog' ? [x.name, x.supplier, x.rep].concat(x.leads.map(l=>l.name)).join(' ') : [x.acct, x.city, x.n, x.rep, x.note].join(' ');
      if(!hay.toLowerCase().includes(q)) return false; }
    return true;
  });
}
const order = (a, b) => TYPES[a.type].p - TYPES[b.type].p || (a.due && b.due ? a.due - b.due : (b.age||0) - (a.age||0));

function excRow(x){
  const t = TYPES[x.type];
  const dueTxt = x.due ? `<span class="ex-due${days(x.due)<0 ? ' late' : ''}">${E(x.type.startsWith('tap') ? 'Survey due ' : x.type==='prog' ? 'Ends ' : 'Due ')}${E(fmtDay(x.due))} · ${E(rel(x.due))}</span>` : `<span class="ex-due">No due date</span>`;
  return `<li class="ex k-${x.type.split('_')[0]}">
    <p class="ex-h"><span class="ex-t">${E(t.label)}</span>${dueTxt}</p>
    <p class="ex-w">${E(x.what)}${x.src ? ` <span class="ex-src">· ${E(x.src)}</span>` : ''}</p>
    <p class="ex-n"><span><b>Why:</b> ${E(t.why)}</span> <span><b>Next:</b> ${E(x.next)} · <a href="${E(x.href)}">${E(x.hl)} ›</a></span></p>
  </li>`;
}
function progCard(x){
  const t = TYPES.prog;
  return `<article class="exa">
    <header class="exa-h"><div><h3>${E(x.name)}</h3><p class="exa-m">${E(x.supplier)} · Rep: <b>${E(x.rep)}</b></p></div><span class="kdh-tag">${plural(1,'exception')}</span></header>
    <ul class="exs"><li class="ex k-prog">
      <p class="ex-h"><span class="ex-t">${E(t.label)}</span><span class="ex-due">Ends ${E(fmtDay(x.due))} · ${E(rel(x.due))}</span></p>
      <p class="ex-w">${E(x.main)} · <b>${E(x.need)}</b></p>
      <p class="ex-n"><span><b>Why:</b> ${E(t.why)} Credit comes from sales data, not from a checkbox.</span> <span><b>Next:</b> ${E(x.next)}${x.leads.length ? ': '+x.leads.map(l=>l.n!=null ? `<a href="${E(acctLink(l.n, x.rep))}">${E(l.name)}</a>` : E(l.name)).join(', ')+(x.leadCount>x.leads.length ? ` and ${x.leadCount-x.leads.length} more` : '') : ''} · <a href="${E(x.href)}">${E(x.hl)} ›</a></span></p>
    </li></ul></article>`;
}
function render(){
  const rows = filtered();
  const acctRows = rows.filter(x=>x.type!=='prog'), progRows = rows.filter(x=>x.type==='prog').sort(order);
  const groups = new Map();
  acctRows.forEach(x=>{ const k = x.rep+'|'+x.n; if(!groups.has(k)) groups.set(k, {rep:x.rep, n:x.n, acct:x.acct, city:x.city, items:[]}); groups.get(k).items.push(x); });
  const G = [...groups.values()]; G.forEach(g=>g.items.sort(order)); G.sort((a, b)=>order(a.items[0], b.items[0]) || a.acct.localeCompare(b.acct));
  const scopeLbl = DM ? `${DM.dm.split(' ')[0]}’s Team` : 'All My Reps';
  const repOpts = `<option value="">${E(scopeLbl)} · ${ROSTER.length}</option>` + ROSTER.map(n=>`<option${st.rep===n?' selected':''}>${E(n)}</option>`).join('');
  const typeCounts = {}; EXC.filter(x=>!st.rep || x.rep===st.rep).forEach(x=>{ const f = TYPES[x.type].f; typeCounts[f] = (typeCounts[f]||0)+1; });
  const idx = META.idx || {};
  const repsWith = new Set(rows.map(x=>x.rep)).size;
  app.innerHTML = `
  <header class="ws exh"><h1>Exceptions</h1>
    <p class="exs-sum" role="status"><b>${plural(G.length,'account')}</b> with ${plural(acctRows.length,'exception')}${progRows.length ? ` · <b>${plural(progRows.length,'program deadline')}</b>` : ''} · across ${repsWith} of ${plural(st.rep ? 1 : ROSTER.length,'rep')}</p>
    <p class="exs-fresh">Follow-ups read live from the Hub · tap surveys as of ${E(String(idx.tapsAsOf||'—').slice(0,10))} · program data from each tracker’s last refresh</p></header>
  <div class="exbar">
    <input type="search" class="kdh-field" id="exq" placeholder="Search accounts, towns or #" value="${E(st.q)}" aria-label="Search accounts">
    <div class="exf">
      <label class="fsel"><span class="sr">Rep</span><select id="exRep" aria-label="Rep">${repOpts}</select></label>
      <label class="fsel"><span class="sr">Due date</span><select id="exDue" aria-label="Due date">${DUE.map(([v,l])=>`<option value="${v}"${st.due===v?' selected':''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="chips" role="group" aria-label="Exception type">${FILTERS.map(([k,l])=>`<button type="button" class="chip" data-type="${k}" aria-pressed="${st.type===k}">${E(l)} <span>${k==='all' ? Object.values(typeCounts).reduce((a,b)=>a+b,0) : (typeCounts[k]||0)}</span></button>`).join('')}</div>
  </div>
  ${NOTES.map(n=>`<div class="kdh-state unavailable slim exnote">${n}</div>`).join('')}
  ${G.length ? `<section class="exsec"><h2>By Account <small>${plural(G.length,'account')} · ${plural(acctRows.length,'exception')}</small></h2>${G.slice(0, st.limit).map(g=>`
    <article class="exa"><header class="exa-h"><div><h3><a href="${E(acctLink(g.n, g.rep))}">${E(g.acct)}</a></h3><p class="exa-m">${E([g.city, g.n!=null ? '#'+g.n : ''].filter(Boolean).join(' · '))} · Rep: <b>${E(g.rep)}</b></p></div><span class="kdh-tag">${plural(g.items.length,'exception')}</span></header>
    <ul class="exs">${g.items.map(excRow).join('')}</ul></article>`).join('')}
    ${G.length > st.limit ? `<button type="button" class="btn outline wide" id="exMore">Show More Accounts · ${G.length - st.limit} more</button>` : ''}</section>` : ''}
  ${progRows.length ? `<section class="exsec"><h2>Program Deadlines <small>ending within ${PROGRAM_WINDOW} days with work left</small></h2>${progRows.map(progCard).join('')}</section>` : ''}
  ${!rows.length ? `<div class="kdh-state empty"><b>${EXC.length ? 'No exceptions match these filters.' : 'No exceptions right now.'}</b><span>${EXC.length ? 'Clear the search or pick another rep, type or due date.' : 'No overdue follow-ups, no tap surveys due and no program ending within 14 days with work left.'}</span></div>` : ''}
  <details class="fold exhow"><summary>How This Works</summary><div class="exhow-b">
    <p><b>Order.</b> Accounts are listed by their most urgent exception, in this order: ${Object.values(TYPES).sort((a,b)=>a.p-b.p).map(t=>E(t.label)).join(' → ')}. Within a type, the most overdue (or soonest) comes first; undated follow-ups, the longest open first.</p>
    <p><b>Counts.</b> An account is counted once however many exceptions it has; the exception count is every row. Program deadlines belong to a rep, not an account, so they are counted on their own.</p>
    <p><b>Rules.</b> Follow-ups are the reps’ own open follow-ups in the Hub (account notes and program marks): overdue when the due date has passed, due soon within ${SOON} days, and an undated one is listed after ${STALE_UNDATED} days open. Tap surveys use the Tap Tracker’s ${TAP_DUE}-day resurvey rule on each account’s latest survey. A program is listed when it ends within ${PROGRAM_WINDOW} days and the rep’s tracker progress is short of the goal; the leads are the tracker’s own opportunity list.</p>
    <p><b>Not here.</b> Nothing on this page can be ticked off: a follow-up is closed by the rep on the account, and a program requirement or a sales gap closes only when qualifying sales arrive. There is no issue log yet, so unresolved issues cannot be listed (see the data request). Buying alerts stay on each rep’s My Accounts. Activity counts are not used as performance, and no missed visit is inferred — there are no visit records.</p>
    <p><b>Scope.</b> ${DM ? `Your team (${E(DM.dm)}): the reps in your district group.` : 'Every rep you are authorized to see.'} Account files are served by the site’s access rules; follow-ups are read with your own sign-in.</p>
  </div></details>`;
  wire();
}
function wire(){
  const q = document.getElementById('exq'); let t = 0;
  q.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=>{ st.q = q.value; st.limit = PAGE; writeHash(); const pos = q.selectionStart; render(); const n = document.getElementById('exq'); n.focus(); n.setSelectionRange(pos, pos); }, 200); });
  document.getElementById('exRep').addEventListener('change', e=>{ st.rep = e.target.value; st.limit = PAGE; writeHash(); render(); });
  document.getElementById('exDue').addEventListener('change', e=>{ st.due = e.target.value; st.limit = PAGE; writeHash(); render(); });
  const more = document.getElementById('exMore');
  if(more) more.addEventListener('click', ()=>{ const y = window.scrollY; st.limit += PAGE; render(); window.scrollTo(0, y); });
  app.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click', ()=>{ st.type = b.dataset.type; st.limit = PAGE; writeHash(); render(); }));
}

readHash();
load().then(()=>{ if(st.rep && !ROSTER.includes(st.rep)) st.rep = ''; render(); if(window.kdhRemember) window.kdhRemember('exceptions', location.pathname + location.hash); })
  .catch(e=>{ app.innerHTML = `<div class="kdh-state error"><b>Exceptions could not be loaded.</b><span>${E(e.message||e)}. Reload, or sign in again.</span></div>`; });
})();
