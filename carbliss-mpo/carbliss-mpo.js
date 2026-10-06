/* CARBLISS MPO TRACKER (2026-10-06). Renders data/program.json; computes nothing but
   counts of the rows it is given (the rules live in generate.py). A rep is served
   their own copy (rows + the house total as a count) and the page also pins them
   to their name; a manager gets everything, a district manager only their team's
   rep groups (the house total stays the house total). */
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = document.getElementById('cmApp');
const U = window.kdhUser ? window.kdhUser() : null;
const isRep = !!(U && U.role !== 'manager' && U.name);
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const parseDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||'')); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; };
const fmt = s => { const d = parseDay(s); return d ? MON[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear() : ''; };
const pctText = p => p==null ? '—' : (Math.round(p*10)/10).toFixed(1).replace(/\.0$/,'')+'%';
const plural = (n, w) => n.toLocaleString('en-US')+' '+w+(n===1 ? '' : 's');
const ICON = {
  y:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  n:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  u:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.1 1-1.1 1.8M12 17h.01"/></svg>'
};
const yn = (state, label) => '<span class="cm-yn '+state+'">'+ICON[state]+'<span>'+label+'</span></span>';

let D = null;
const state = {rep:'', f:'all', q:'', open:new Set()};
let LOCK = null, SCOPE = [], MGR = false;

/* ---- the page's place: filters in the hash, groups + scroll in the tab's storage ---- */
const scope = () => (U && (U.preview ? (U.manager||'')+'/'+(U.email||'')+'|'+U.name : (U.email||U.name))) || 'anon';
const SK = k => 'kdh_cm:'+scope()+':'+k;
const ssGet = k => { try{ return sessionStorage.getItem(SK(k)); }catch(e){ return null; } };
const ssSet = (k,v) => { try{ sessionStorage.setItem(SK(k), v); }catch(e){} };
function readHash(){
  const o = {}; (location.hash||'').replace(/^#/,'').split('&').filter(Boolean).forEach(kv=>{ const i = kv.indexOf('='); if(i>0) o[kv.slice(0,i)] = decodeURIComponent(kv.slice(i+1)); });
  state.rep = MGR && o.rep && SCOPE.includes(o.rep) ? o.rep : '';
  state.f = ['yes','no'].includes(o.f) ? o.f : 'all';
  state.q = o.q || '';
}
function writeHash(){
  const p = [];
  if(state.rep) p.push('rep='+encodeURIComponent(state.rep));
  if(state.f!=='all') p.push('f='+state.f);
  if(state.q) p.push('q='+encodeURIComponent(state.q));
  try{ history.replaceState(null, '', location.pathname+location.search+(p.length ? '#'+p.join('&') : '')); }catch(e){}
  saveOpen();
}
function saveOpen(){ ssSet('open', JSON.stringify(Array.from(state.open))); }
function loadOpen(){ try{ state.open = new Set(JSON.parse(ssGet('open')||'[]')); }catch(e){ state.open = new Set(); } }
function savePos(){ ssSet('pos', JSON.stringify({h:location.hash, y:Math.round(window.scrollY)})); }
function restorePos(){
  let p = null; try{ p = JSON.parse(ssGet('pos')||'null'); }catch(e){}
  if(p && p.h===location.hash && p.y>0) requestAnimationFrame(()=>window.scrollTo(0, p.y));
}

/* ---- rows ---- */
const inScope = a => SCOPE.includes(a.rep);
function repRows(rep){ return D.accounts.filter(a=>a.rep===rep); }
function matches(a){
  if(state.f==='yes' && !a.prog) return false;
  if(state.f==='no' && a.prog) return false;
  const q = state.q.trim().toLowerCase();
  if(q && !(a.name.toLowerCase().includes(q) || (a.town||'').toLowerCase().includes(q) || String(a.n).includes(q))) return false;
  return true;
}
const sumFor = reps => { const rows = D.accounts.filter(a=>reps.includes(a.rep)); return {base:rows.length, bought:rows.filter(a=>a.prog).length}; };
function acctHref(a){
  const from = location.pathname + location.hash;
  return '../accounts/#acct='+encodeURIComponent(a.n)+(MGR && !(U&&U.preview) ? '&rep='+encodeURIComponent(a.rep) : '')+'&from='+encodeURIComponent(from)+'&fl='+encodeURIComponent('Carbliss MPO');
}
function rowsHtml(rows){
  const P = D.meta.period;
  const head = '<thead><tr><th scope="col">Account</th><th scope="col">Bought Aug 1–Oct 30</th><th scope="col">Bought Since Launch</th><th scope="col">Last Carbliss Purchase</th></tr></thead>';
  const body = rows.map(a=>{
    const since = a.since==='yes' ? yn('y','Yes') : a.since==='unknown' ? yn('u','Unknown') : yn('n','No');
    return '<tr><td class="c-acct"><a class="cm-acct" href="'+E(acctHref(a))+'" data-acct>'+E(a.name)+'</a><span class="cm-town">'+E(a.town||'')+(a.town?' · ':'')+'#'+E(a.n)+'</span></td>'
      +'<td data-l="Bought Aug 1–Oct 30">'+(a.prog ? yn('y','Yes') : yn('n','No'))+'</td>'
      +'<td data-l="Bought Since Launch">'+since+'</td>'
      +'<td data-l="Last Carbliss Purchase">'+(a.last ? '<span class="cm-date">'+E(fmt(a.last))+'</span>' : '<span class="cm-none">None on record</span>')+'</td></tr>';
  }).join('');
  return '<div class="cm-list"><table class="cm-tbl">'+head+'<tbody>'+body+'</tbody></table></div>';
}

/* ---- cards ---- */
function houseCard(){
  const M = D.meta;
  return '<section class="cm-card house" aria-label="House total"><p class="cm-lab">Carbliss Buying Accounts</p>'
    +'<p class="cm-big">'+D.house.buyers.toLocaleString('en-US')+'</p>'
    +'<p class="cm-sub">Accounts Bought During the Program Period</p>'
    +'<p class="cm-fine"><em>Aug 1\u2013Oct 30, 2026 \u00b7 '+(M.frozen ? 'Final \u00b7 ' : '')+'Sales Through '+E(fmt(M.frozen ? M.frozen_sales_through : M.sales_through))+'</em></p>'
    +'<p class="cm-fine"><b>House total</b>, all on-premise reps \u2014 separate from '+(LOCK ? 'your results' : 'any one rep\u2019s results')+'.</p></section>';
}
function repCard(rep, s, mine){
  const p = s.base ? 100*s.bought/s.base : 0;
  return '<section class="cm-card" aria-label="'+E(rep)+' results"><p class="cm-rep-name">'+E(rep)+'</p>'
    +'<p class="cm-count-line"><b>'+s.bought.toLocaleString('en-US')+'</b> of <b>'+s.base.toLocaleString('en-US')+'</b> Assigned Accounts Bought Carbliss</p>'
    +'<p class="cm-pct">'+pctText(s.base ? p : null)+' <span>Account Penetration</span></p>'
    +'<div class="cm-bar" role="img" aria-label="'+pctText(p)+' of assigned accounts bought"><i style="width:'+Math.min(100,p).toFixed(1)+'%"></i></div>'
    +'<p class="cm-fine">Penetration = assigned accounts that bought during the program period \u00f7 '+(mine ? 'your' : 'the rep\u2019s')+' eligible assigned accounts ('+s.base.toLocaleString('en-US')+' core on-premise accounts).</p></section>';
}

/* ---- tools ---- */
function toolsHtml(rows){
  const all = rows.length, yes = rows.filter(a=>a.prog).length, no = all-yes;
  const chip = (k, label, n) => '<button type="button" class="cm-chip" data-f="'+k+'" aria-pressed="'+(state.f===k)+'">'+label+' <span>'+n.toLocaleString('en-US')+'</span></button>';
  const sel = (MGR && SCOPE.length>1) ? '<label class="sr" for="cmRep">Rep</label><select id="cmRep"><option value="">All Reps ('+SCOPE.length+')</option>'+SCOPE.map(r=>'<option value="'+E(r)+'"'+(state.rep===r?' selected':'')+'>'+E(r)+'</option>').join('')+'</select>' : '';
  return '<div class="cm-bar-tools"><label class="sr" for="cmQ">Search accounts</label><input id="cmQ" class="kdh-field" type="search" placeholder="Search accounts or towns" value="'+E(state.q)+'" autocomplete="off" enterkeyhint="search">'+sel
    +'<div class="cm-chips" role="group" aria-label="Show">'+chip('all','All Accounts',all)+chip('yes','Program Buyers',yes)+chip('no','Program Nonbuyers',no)+'</div></div>';
}

/* ---- list body (re-rendered on every filter / open change; the cards and inputs stay) ---- */
function listHtml(){
  const reps = state.rep ? [state.rep] : SCOPE;
  const q = state.q.trim();
  if(reps.length===1 || LOCK){
    const rows = repRows(reps[0]).filter(matches);
    return rows.length ? '<p class="cm-count">Showing '+plural(rows.length,'account')+'</p>'+rowsHtml(rows)
      : '<div class="kdh-state empty"><b>No accounts match.</b><span>Clear the search or pick All Accounts.</span></div>';
  }
  let shown = 0;
  const groups = reps.map(rep=>{
    const mine = repRows(rep), s = {base:mine.length, bought:mine.filter(a=>a.prog).length};
    const rows = mine.filter(matches);
    if((q || state.f!=='all') && !rows.length) return '';
    const open = state.open.has(rep) || !!q;
    shown += rows.length;
    const p = s.base ? 100*s.bought/s.base : 0;
    return '<section class="cm-group'+(open?' open':'')+'"><button type="button" class="cm-gh" data-rep="'+E(rep)+'" aria-expanded="'+open+'">'
      +'<b>'+E(rep)+'</b><span class="cm-gs"><b>'+s.bought.toLocaleString('en-US')+' of '+s.base.toLocaleString('en-US')+'</b> bought · <b>'+pctText(s.base?p:null)+'</b> <i class="cm-chev"></i></span>'
      +'<span class="cm-gl"><span class="cm-bar" role="img" aria-label="'+pctText(p)+' account penetration"><i style="width:'+Math.min(100,p).toFixed(1)+'%"></i></span></span></button>'
      +(open ? (rows.length ? rowsHtml(rows) : '<div class="kdh-state empty slim"><b>No accounts match.</b></div>') : '')+'</section>';
  }).join('');
  return groups ? '<div class="cm-groups">'+groups+'</div>' : '<div class="kdh-state empty"><b>No accounts match.</b><span>Clear the search or pick All Accounts.</span></div>';
}

function howHtml(){
  const M = D.meta;
  return '<details class="cm-how"><summary>How This Is Counted</summary><div class="cm-how-b">'
    +'<p><b>Program period.</b> A fixed window, Aug 1–Oct 30, 2026, inclusive. It is not a rolling 90 days, and later purchases never change the program-period result'+(M.frozen ? ' (locked '+E(fmt(M.frozen_at))+')' : '')+'.</p>'
    +'<p><b>A purchase counts</b> when an on-premise load sheet carries any Carbliss flavor (every Carbliss product counts) and Encompass flags the account as a buyer on it. An account counts once, however many flavors, loads or reorders it has. Accounts are matched by customer number, not by name.</p>'
    +'<p><b>Bought Since Launch</b> covers every load sheet from launch ('+E(fmt(M.launch))+', the first Carbliss load sheet on file) through '+E(fmt(M.sales_through))+', including the program period (it keeps updating after the program ends; the program-period result does not). <b>Last Carbliss Purchase</b> is the most recent of those load sheets.</p>'
    +'<p><b>Account penetration</b> = assigned accounts that bought during the program period ÷ the rep’s core on-premise accounts. An account follows its current rep, so a transfer moves its history with it. The house total counts every account that bought, whoever its rep is.</p>'
    +'<p><b>Sales Through</b> is the latest load-sheet date in the Encompass report, not today’s date. This site does not update in real time.</p>'
    +'</div></details>';
}

/* ---- page ---- */
function status(){
  const M = D.meta, end = parseDay(M.period.end), through = parseDay(M.sales_through);
  const done = M.frozen || (through && end && through >= end);
  return done ? '<span class="kdh-tag ok">'+(M.frozen ? 'Final' : 'Program ended')+'</span>' : '<span class="kdh-tag brand">In progress</span>';
}
function renderPage(){
  const M = D.meta;
  const one = LOCK || state.rep;
  const s = one ? sumFor([one]) : null;
  const rowsForChips = one ? repRows(one) : D.accounts.filter(inScope);
  app.innerHTML =
    '<header class="cmh"><h1>Carbliss MPO</h1>'
    +'<p class="cm-period">'+E(M.period.label)+'</p>'
    +'<p class="cm-meta">'+status()+'<span>Launch <b>'+E(fmt(M.launch))+'</b></span><span>'+E(M.channel)+'</span></p></header>'
    +'<div class="cm-top'+(one ? '' : ' one')+'">'+houseCard()+(one ? repCard(one, s, !!LOCK) : '')+'</div>'
    +toolsHtml(rowsForChips)
    +'<div id="cmList">'+listHtml()+'</div>'
    +howHtml();
  wire();
  if(window.kdhViewing) window.kdhViewing(MGR && state.rep ? state.rep : '', ()=>{ state.rep=''; writeHash(); renderPage(); window.scrollTo(0,0); });
}
function refreshList(){
  writeHash();
  document.getElementById('cmList').innerHTML = listHtml();
  Array.prototype.forEach.call(app.querySelectorAll('.cm-chip'), b=>b.setAttribute('aria-pressed', String(b.getAttribute('data-f')===state.f)));
}
function wire(){
  const q = document.getElementById('cmQ'), r = document.getElementById('cmRep');
  let t = null;
  q.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=>{ state.q = q.value; refreshList(); }, 120); });
  if(r) r.addEventListener('change', ()=>{ state.rep = r.value; writeHash(); renderPage(); });
}
// one delegated listener for the page's life (renderPage replaces the markup, not #cmApp)
app.addEventListener('click', e=>{
  if(!D) return;
  const chip = e.target.closest('.cm-chip');
  if(chip){ state.f = chip.getAttribute('data-f'); refreshList(); return; }
  const gh = e.target.closest('.cm-gh');
  if(gh){ const rep = gh.getAttribute('data-rep'); if(state.open.has(rep)) state.open.delete(rep); else state.open.add(rep); refreshList(); return; }
  if(e.target.closest('[data-acct]')) savePos();
});

/* ---- boot ---- */
fetch('data/program.json', {cache:'no-cache', credentials:'same-origin'})
  .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
  .then(d=>{
    D = d;
    const roster = D.reps.map(r=>r.rep);
    MGR = !isRep;
    if(isRep){
      LOCK = window.kdhMatchName ? window.kdhMatchName(U.name, roster) : (roster.includes(U.name) ? U.name : null);
      if(!LOCK){ if(window.kdhNoRoster) window.kdhNoRoster('Carbliss MPO'); else app.innerHTML = '<div class="kdh-state unavailable"><b>We couldn’t find your name here.</b></div>'; return; }
      SCOPE = [LOCK];
    } else {
      const T = (window.kdhTeam && window.KDH_DM_GROUPS) ? window.kdhTeam(window.KDH_DM_GROUPS) : null;
      SCOPE = T ? roster.filter(n=>T.reps.some(x=>window.kdhMatchName(n, [x]))) : roster.slice();
      if(!SCOPE.length) SCOPE = roster.slice();
    }
    loadOpen(); readHash(); renderPage(); restorePos();
    window.addEventListener('hashchange', ()=>{ readHash(); renderPage(); });
    window.addEventListener('pagehide', savePos);
    let st = null; window.addEventListener('scroll', ()=>{ clearTimeout(st); st = setTimeout(savePos, 200); }, {passive:true});
  })
  .catch(e=>{ app.innerHTML = '<div class="kdh-state error"><b>Carbliss results could not be loaded.</b><span>'+E(e.message||e)+'. Reload, or sign in again.</span></div>'; });
})();
