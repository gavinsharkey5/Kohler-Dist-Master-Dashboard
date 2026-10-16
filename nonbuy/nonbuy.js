/* Non-Buy Reports -- the two experiences (2026-10-08).
   MANAGER: entry page (Create Report, Saved Reports, Templates, Target Lists),
   four setup steps (Choose Products / Choose Accounts / Choose Dates & Report
   Type / Review & Generate), results grouped by rep, Save Report / Save
   Template / Export (Excel, CSV, PDF, Save as Target List).
   REP: "Find Non-Buying Accounts" -> the same steps with My Route applied,
   Non-Buyers, Last 90 Days and "Bought Anything From Kohler" on by default;
   compact account rows; save / export their own results only.
   ONE engine (engine.js) and ONE data source (source-static.js) for both; this
   file only draws screens and keeps state. Permissions: the middleware serves a
   rep only their own book + history, kdh_program_scope decides a manager's
   reps and suppliers, RLS keeps saved rows private (README.txt). */
(function(){
'use strict';
const app = document.getElementById('nbApp');
const U = window.kdhUser ? window.kdhUser() : null;
const D = window.KdhData, KP = window.KdhPrograms, E = window.KdhNonBuyEngine, Src = window.KdhNonBuySource;
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n||0).toLocaleString('en-US');
const plural = (n, one, many) => n===1 ? one : (many || one+'s');
const TODAY = E.iso(new Date());
const IS_MGR = !!(U && U.role==='manager' && !(U.preview && U.role!=='manager'));   // a manager previewing a rep behaves as that rep
const PREVIEW = !!(U && U.preview);
const WHO = U ? (U.preview && U.role!=='manager' ? 'preview:'+U.name : (U.email||U.name||'')) : '';
const SS = { get(k){ try{ return JSON.parse(sessionStorage.getItem('kdh_nb:'+WHO+':'+k)); }catch(e){ return null; } }, set(k, v){ try{ if(v==null) sessionStorage.removeItem('kdh_nb:'+WHO+':'+k); else sessionStorage.setItem('kdh_nb:'+WHO+':'+k, JSON.stringify(v)); }catch(e){} } };
const TYPES = [['nonbuyers','Non-Buyers','No qualifying purchase of the selected products during the reporting period.'],['missing','Missing Products','Missing one or more selected products during the period, even if other selected products were purchased.'],['lapsed','Lapsed Buyers','Purchased the selected products during a baseline period but not during the current period.']];
const LEVELS = [['account','By Account'],['product','By Product'],['brand','By Brand'],['family','By Brand Family'],['supplier','By Supplier']];
const SEL_LABEL = {sku:'Product', family:'Brand Family', brand:'Brand', supplier:'Supplier', package:'Package', draft:'Category'};
if(!U){ app.innerHTML = `<div class="kdh-state unavailable"><b>Sign In Required</b><span>Non-Buy Reports needs your Hub sign-in.</span></div>`; return; }

// ---- state
const S = { view:'home', step:1, tab:'reports', ctx:null, crit:null, res:null, saved:null, shared:null, msg:null, busy:'', pm:null, ui:{q:'', rep:'', finding:'', prem:'', level:'', cols:false, open:{}}, errs:{} };
function blankCrit(){ return { v:1, name:'', products:{include:[], exclude:[]}, accounts:{reps:[], districts:[], territory:'any', towns:[], premise:'any', chains:[], types:[], specific:[], uploadName:''}, type:'nonbuyers', preset:'l90', custom:{start:'',end:''}, baseline:{preset:'before', custom:{start:'',end:''}}, level:'account', boughtAnything:true }; }
function readHash(){ const h = {}; location.hash.replace(/^#/,'').split('&').forEach(kv=>{ const [k,v] = kv.split('='); if(k) h[k] = decodeURIComponent(v||''); }); return h; }
function go(h){ location.hash = Object.keys(h).filter(k=>h[k]!=null && h[k]!=='').map(k=>k+'='+encodeURIComponent(h[k])).join('&'); }

// ---- scope helpers
const scopeReps = () => S.ctx.scope.reps;
function repsChosen(){ const A = S.crit.accounts; const all = scopeReps(); if(!IS_MGR) return all.slice(0,1); let reps = A.reps.length ? all.filter(r=>A.reps.includes(r.rep)) : all; if(A.districts.length){ const names = new Set(); S.ctx.districts.filter(d=>A.districts.includes(d.dm)).forEach(d=>d.reps.forEach(n=>names.add(n))); reps = reps.filter(r=>names.has(r.rep) || names.has(window.kdhMatchName ? window.kdhMatchName(r.rep, [...names]) : r.rep)); } return reps; }
function productPool(){ const br = S.ctx.scope.brands; const list = S.ctx.products.list||[]; if(br===null) return list; const set = new Set(br.map(x=>x.toLowerCase())); return list.filter(p=>set.has(String(p.supplier||'').toLowerCase())); }
function resolvedProducts(){ const pool = productPool(); const ids = new Set(pool.map(p=>String(p.id))); const map = S.ctx.products.map||{}; const list = KP.resolveProducts(S.crit.products, S.ctx.products).filter(p=>ids.has(String(p.id))).map(p=>map[String(p.id)]||p); const seen = new Set(); return list.filter(p=>{ if(seen.has(String(p.id))) return false; seen.add(String(p.id)); return true; }); }
function filteredAccounts(){
  const A = S.crit.accounts; const rows = Src.accounts(S.ctx, repsChosen());
  const spec = new Set((A.specific||[]).map(String));
  return rows.filter(a=>{
    if(A.territory==='core' && !Src.CORE.includes(a.area)) return false;
    if(A.territory==='southern' && !Src.SOUTH.includes(a.area)) return false;
    if(A.towns.length && !A.towns.includes(a.city)) return false;
    if(A.premise!=='any' && String(a.prem||'').toLowerCase().slice(0,2)!==A.premise.slice(0,2)) return false;
    if(A.chains.length && !A.chains.includes(a.chain||'')) return false;
    if(A.types.length && !A.types.includes(a.type||'')) return false;
    if(spec.size && !spec.has(String(a.n))) return false;
    return true;
  });
}
function periodNow(){ return E.resolvePeriod(E.presetRange(S.crit.preset, TODAY, S.crit.custom), S.ctx.months, S.ctx.refMonth); }
function baselineNow(per){
  if(S.crit.type!=='lapsed') return null;
  const b = S.crit.baseline||{};
  if(b.preset==='custom') return E.resolvePeriod(b.custom, S.ctx.months, S.ctx.refMonth);
  if(!per || !per.ok) return {ok:false, reason:'Set the current period first.', months:[]};
  const n = per.months.length; const i0 = S.ctx.months.indexOf(per.months[0]); const months = S.ctx.months.slice(Math.max(0, i0-n), i0);
  if(!months.length) return {ok:false, reason:'No loaded month before the current period.', months:[]};
  return {ok:true, months, effective:{start:months[0]+'-01', end:E.iso(new Date(+months[months.length-1].slice(0,4), +months[months.length-1].slice(5,7), 0))}, requested:null, complete: months.length===n, note: months.length<n ? 'Only '+months.length+' of '+n+' baseline months are loaded.' : ''};
}
function validate(){
  const errs = {}; const P = resolvedProducts();
  if(!P.length) errs[1] = (S.crit.products.include||[]).length ? 'None of the selected products are in your scope.' : 'Choose at least one product.';
  const acc = filteredAccounts(); if(!acc.length) errs[2] = IS_MGR ? (repsChosen().length ? 'No accounts match these filters.' : 'No reps are selected.') : 'No accounts on your route match these filters.';
  const per = periodNow(); if(!per.ok) errs[3] = per.reason;
  const bl = baselineNow(per); if(bl && !bl.ok) errs[3] = (errs[3] ? errs[3]+' ' : '') + 'Baseline: '+bl.reason;
  return errs;
}

// ---- boot
async function boot(){
  try{ S.ctx = await Src.context(U); }catch(e){ app.innerHTML = `<div class="kdh-state error"><b>Could Not Load</b><span>${esc(e.message||e)}</span></div>`; return; }
  const saved = SS.get('crit'); S.crit = saved && saved.v===1 ? Object.assign(blankCrit(), saved) : blankCrit();
  if(!IS_MGR){ S.crit.accounts.reps = []; S.crit.accounts.districts = []; }
  const res = SS.get('res'); if(res) S.res = res;
  const ui = SS.get('ui'); if(ui) S.ui = Object.assign(S.ui, ui);
  window.addEventListener('hashchange', route); route();
}
async function route(){
  const h = readHash(); S.view = h.view || 'home'; closeModal();
  if(S.view==='new'){ S.step = Math.min(4, Math.max(1, Number(h.step)||1)); renderSetup(); return; }
  if(S.view==='results'){ if(h.id){ await openSaved(h.id); return; } if(!S.res){ go({view:'new', step:4}); return; } renderResults(); return; }
  await renderHome();
}

// ---- entry page
async function renderHome(){
  const sc = S.ctx.scope; const rep = !IS_MGR;
  if(S.saved===null){ S.saved = D.signedIn() ? await Src.list() : []; }
  if(S.shared===null){ S.shared = D.signedIn() ? await Src.shared(rep ? null : (PREVIEW ? U.name : null)) : []; }
  const noTable = S.saved===null;
  const mine = (S.saved||[]); const reports = mine.filter(r=>r.kind==='report'), tpls = mine.filter(r=>r.kind==='template'), targets = mine.filter(r=>r.kind==='target');
  const tabs = rep ? [['reports','My Saved Reports',reports.length],['templates','My Templates',tpls.length],['shared','Shared With Me',(S.shared||[]).length]] : [['reports','Saved Reports',reports.length],['templates','Templates',tpls.length],['targets','Target Lists',targets.length]];
  if(!tabs.some(t=>t[0]===S.tab)) S.tab = 'reports';
  const row = r => `<li class="nbr"><div><div class="t">${esc(r.name)}<span class="tag">${r.kind==='template'?'Template':r.kind==='target'?'Target List':'Report'}</span>${r.counts?`<span class="tag">${fmt(r.counts.accounts)} ${plural(r.counts.accounts,'account')}</span>`:''}</div>
      <div class="m"><span>Scope <b>${esc(critScope(r.criteria))}</b></span><span>Period <b>${esc(r.period&&r.period.effective ? E.periodText(r.period.effective) : critPeriod(r.criteria))}</b></span>${!rep&&r.owner_name?`<span>By <b>${esc(r.owner_name)}</b></span>`:''}<span>${r.kind==='template'?'Saved':'Run'} <b>${esc(when(r.run_at||r.updated_at))}</b></span></div></div>
      <div class="a">${r.kind==='template' ? `<button class="btn sm" data-act="use-tpl" data-id="${r.id}">Use Template</button>` : `<a class="btn sm" href="#view=results&id=${r.id}">Open</a>`}<button class="btn sm outline" data-act="del-saved" data-id="${r.id}">Remove</button></div></li>`;
  const sharedRow = r => `<li class="nbr"><div><div class="t">${esc(r.name)}<span class="tag">Target List</span><span class="tag">${fmt((r.rows||[]).length)} ${plural((r.rows||[]).length,'account')}</span></div><div class="m"><span>From <b>${esc(r.owner_name||'')}</b></span><span>Period <b>${esc(r.period&&r.period.effective ? E.periodText(r.period.effective) : '—')}</b></span><span>Run <b>${esc(when(r.run_at))}</b></span></div></div><div class="a"><button class="btn sm" data-act="open-shared" data-id="${r.id}">Open</button></div></li>`;
  const list = S.tab==='shared' ? (S.shared||[]).map(sharedRow) : (S.tab==='templates' ? tpls : S.tab==='targets' ? targets : reports).map(row);
  app.innerHTML = `<header class="nb-h"><div><h1>Non-Buy Reports</h1><p>${rep ? 'Find accounts on your route that have not bought selected products, and open them.' : 'Find the distribution gaps across your authorized accounts and which reps can act on them.'}</p></div>
    <div class="acts"><a class="btn primary" href="#view=new&step=1">${rep?'Find Non-Buying Accounts':'Create Report'}</a></div></header>
    ${S.msg?`<div class="msg ${S.msg.cls}">${esc(S.msg.t)}</div>`:''}
    ${sc.reason?`<div class="msg err">${esc(sc.reason)}</div>`:''}
    ${noTable?`<div class="msg err">Saved reports are not available yet: the table is not in the database (run supabase/migrations/20261009090000_nonbuy_reports.sql). Reports can still be generated and exported.</div>`:''}
    <div class="nb-tabs" role="tablist">${tabs.map(t=>`<button role="tab" data-tab="${t[0]}" aria-pressed="${S.tab===t[0]}">${t[1]}<span>${t[2]}</span></button>`).join('')}</div>
    <ul class="nbl">${list.join('') || `<li class="nb-empty">${S.tab==='shared'?'No target lists have been shared with you.':S.tab==='templates'?'No templates yet. Save one from a report\'s Save menu.':S.tab==='targets'?'No target lists yet. Save one from a report\'s Export menu.':'No saved reports yet.'}</li>`}</ul>`;
  S.msg = null;
}
function when(s){ if(!s) return '—'; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}); }
function critScope(c){ if(!c) return '—'; const A = c.accounts||{}; if(c.mode==='rep') return 'My Route'; const parts = [A.reps&&A.reps.length ? A.reps.length+' '+plural(A.reps.length,'rep') : 'All My Reps']; if(A.districts&&A.districts.length) parts.push(A.districts.join(', ')); if(A.territory&&A.territory!=='any') parts.push(A.territory==='core'?'Core Market':'Southern District'); if(A.premise&&A.premise!=='any') parts.push(A.premise==='off'?'Off-Premise':'On-Premise'); return parts.join(' · '); }
function critPeriod(c){ if(!c) return '—'; const P = E.PRESETS.find(p=>p[0]===c.preset); return P ? (c.preset==='custom' ? E.periodText(c.custom) : P[1]) : '—'; }
function critProducts(c, n){ const inc = (c && c.products && c.products.include)||[]; const groups = inc.filter(s=>s.type!=='sku'); const skus = inc.filter(s=>s.type==='sku'); const exc = ((c && c.products && c.products.exclude)||[]).length; const parts = []; if(groups.length) parts.push(groups.map(g=>(SEL_LABEL[g.type]||g.type)+' '+g.value).join(', ')); if(skus.length && groups.length) parts.push('+ '+skus.length+' '+plural(skus.length,'product')); if(exc) parts.push('− '+exc+' excluded'); const head = n!=null ? n+' '+plural(n,'product') : (skus.length && !groups.length ? skus.length+' '+plural(skus.length,'product') : ''); return [head, parts.join(' ')].filter(Boolean).join(' · ') || 'none'; }

// ---- setup
function renderSetup(opts){
  const keep = opts && opts.keep; const y = keep ? window.scrollY : 0;
  const errs = validate(); S.errs = errs; const n = S.step; const names = ['Choose Products','Choose Accounts','Choose Dates & Report Type','Review & Generate'];
  const prog = `<div class="nb-prog" role="list">${names.map((s,i)=>`<button type="button" role="listitem" data-step="${i+1}" ${i+1===n?'aria-current="step"':''} class="${i+1<n && !errs[i+1] ? 'done' : ''}"><i>${i+1<n && !errs[i+1] ? '✓' : i+1}</i>${s}</button>`).join('')}
    <div class="nb-pm"><span class="nb-dots">${names.map((s,i)=>`<i class="${i+1===n?'on':i+1<n?'done':''}"></i>`).join('')}</span><span>Step ${n} of 4 · <b>${names[n-1]}</b></span></div></div>`;
  app.innerHTML = `<header class="nb-h"><div><h1>${IS_MGR?'Create Report':'Find Non-Buying Accounts'}</h1></div><div class="acts"><a class="btn sm outline" href="#view=home">All Reports</a></div></header>
    ${S.msg?`<div class="msg ${S.msg.cls}">${esc(S.msg.t)}</div>`:''}
    ${prog}<section class="nb-panel" id="nbp">${stepHtml(n, errs)}
    <div class="nb-foot"><div>${n>1?`<button class="btn outline" data-act="prev">Back</button>`:''}</div><div class="r">${n<4?`<button class="btn primary" data-act="next">Next</button>`:`<button class="btn primary" data-act="generate" ${Object.keys(errs).length?'disabled':''}>Generate Report</button>`}</div></div></section>`;
  S.msg = null;
  if(keep){ window.scrollTo(0, y); requestAnimationFrame(()=>window.scrollTo(0, y)); }
}
function field(label, inner, hint, err){ return `<div class="f${err?' bad':''}"><label>${label}</label>${inner}${hint?`<div class="hint">${hint}</div>`:''}${err?`<div class="err">${esc(err)}</div>`:''}</div>`; }
function optionCards(name, cur, opts){ return `<div class="ocards">${opts.map(o=>`<label class="ocard${cur===o.v?' on':''}"><input type="radio" name="${name}" value="${o.v}" ${cur===o.v?'checked':''}><span class="oc-t">${esc(o.t)}</span><span class="oc-d">${esc(o.d)}</span></label>`).join('')}</div>`; }
function selectedSummary(){
  const P = resolvedProducts(); const inc = S.crit.products.include||[]; const groups = inc.filter(s=>s.type!=='sku'); const exc = (S.crit.products.exclude||[]).filter(s=>s.type==='sku');
  const map = S.ctx.products.map||{};
  return `<details class="nb-sel" id="nbSel" ${S.ui.selOpen?'open':''}><summary><span>${P.length} ${plural(P.length,'Product')} Selected</span><span class="cnt">${groups.length?groups.length+' group '+plural(groups.length,'rule')+' · ':''}${exc.length?exc.length+' excluded · ':''}${P.length?'Show':''}</span></summary>
    <div class="body">${groups.length?`<div class="nb-chips">${groups.map(g=>`<span class="gchip">${esc(SEL_LABEL[g.type]||g.type)}: <b>${esc(g.type==='draft'?(g.value==='draft'?'Draft only':'Package only'):g.value)}</b> <button type="button" class="gx" data-act="rm-group" data-i="${inc.indexOf(g)}" aria-label="Remove ${esc(g.value)}">×</button></span>`).join('')}</div>`:''}
    ${P.length?`<ul class="plist">${P.slice(0,400).map(p=>`<li><span class="pn">${esc(p.name)}</span><span class="pm">${esc(p.package||'')}${p.package?' · ':''}#${esc(p.id)} · ${esc(p.supplier||'')}</span><button type="button" class="btn sm outline" data-act="rm-product" data-id="${esc(p.id)}">Remove</button></li>`).join('')}${P.length>400?`<li><span class="muted">… ${P.length-400} more</span></li>`:''}</ul>`:'<div class="mpempty">No products selected yet.</div>'}
    ${exc.length?`<div class="f" style="margin-top:12px"><div class="lbl">Excluded Products <span class="cnt">${exc.length}</span></div><ul class="plist excl">${exc.map(s=>{ const p = map[String(s.value)]; return `<li><span class="pn">${esc(p?p.name:'Product #'+s.value)}</span><span class="pm">#${esc(s.value)}</span><button type="button" class="btn sm outline" data-act="restore-product" data-id="${esc(s.value)}">Restore</button></li>`; }).join('')}</ul></div>`:''}</div></details>`;
}
function stepHtml(n, errs){
  const c = S.crit; const A = c.accounts; const err = errs[n];
  if(n===1){ const br = S.ctx.scope.brands;
    return `<h2>Choose Products</h2><p class="lead">Which products count. Add exact products, or a whole brand, brand family, supplier or package.</p>
      <div class="btnrow" style="margin-bottom:12px"><button class="btn primary" data-act="add-products">Add Products</button><button class="btn outline" data-act="manage-products" ${resolvedProducts().length?'':'disabled'}>Manage Selected</button></div>
      ${br!==null?`<div class="hint" style="margin-bottom:10px">Your brand scope: ${esc((br||[]).join(', ')||'none on file')}.</div>`:''}
      ${selectedSummary()}${err?`<div class="errs"><div class="err">${esc(err)}</div></div>`:''}`; }
  if(n===2){
    const reps = scopeReps(); const rows = Src.accounts(S.ctx, repsChosen());
    const towns = [...new Set(rows.map(a=>a.city).filter(Boolean))].sort(); const chains = [...new Set(rows.map(a=>a.chain).filter(Boolean))].sort(); const types = [...new Set(rows.map(a=>a.type).filter(Boolean))].sort();
    const dms = S.ctx.districts.filter(d=>d.reps.some(r=>reps.some(x=>x.rep===r || (window.kdhMatchName && window.kdhMatchName(x.rep, [r])))));
    const n2 = filteredAccounts().length;
    const multi = (id, label, vals, chosen, hint) => field(label, `<select id="${id}" multiple size="${Math.min(6, Math.max(3, vals.length))}">${vals.map(v=>`<option value="${esc(v)}" ${chosen.includes(v)?'selected':''}>${esc(v)}</option>`).join('')}</select>`, hint||'Hold Ctrl / Cmd to pick more than one. Nothing selected = all.');
    return `<h2>Choose Accounts</h2><p class="lead">${IS_MGR ? 'Which reps and accounts to analyze. Default: All My Reps (your authorized scope).' : 'Your route is applied automatically. Narrow it if you want.'}</p>
      ${IS_MGR ? `<h3 class="sec">Reps</h3>${field('Reps', `<div class="radios"><label><input type="radio" name="repmode" value="all" ${!(A.reps.length || S.ui.repPick)?'checked':''}>All My Reps (${reps.length})</label><label><input type="radio" name="repmode" value="some" ${(A.reps.length || S.ui.repPick)?'checked':''}>Selected Reps</label></div>`)}
        ${A.reps.length || S.ui.repPick ? `<div class="pick" id="repPick"><div class="ps one"><input type="search" class="search" id="repQ" placeholder="Search reps" aria-label="Search reps"></div><div class="pl">${reps.map(r=>`<label class="chk" data-name="${esc(r.rep.toLowerCase())}"><input type="checkbox" data-rep="${esc(r.rep)}" ${A.reps.includes(r.rep)?'checked':''}><span class="pn">${esc(r.rep)}</span></label>`).join('')}</div></div>` : ''}
        ${dms.length ? multi('f_dist', 'District', dms.map(d=>d.dm), A.districts, 'District managers\' teams. Nothing selected = every district in your scope.') : ''}` : ''}
      <h3 class="sec">Account Filters</h3>
      <div class="row3">${field('Territory', `<select id="f_terr"><option value="any" ${A.territory==='any'?'selected':''}>Any</option><option value="core" ${A.territory==='core'?'selected':''}>Core Market</option><option value="southern" ${A.territory==='southern'?'selected':''}>Southern District</option></select>`)}
      ${field('Premise', `<select id="f_prem"><option value="any" ${A.premise==='any'?'selected':''}>Any</option><option value="off" ${A.premise==='off'?'selected':''}>Off-Premise</option><option value="on" ${A.premise==='on'?'selected':''}>On-Premise</option></select>`)}
      ${multi('f_town', 'Town', towns, A.towns)}</div>
      <div class="row2">${chains.length ? multi('f_chain', 'Chain', chains, A.chains) : field('Chain', '<select disabled><option>Not on the account books</option></select>', 'The Chain field is not published for these accounts yet.')}${types.length ? multi('f_type', 'Account Type', types, A.types) : field('Account Type', '<select disabled><option>Not on the account books</option></select>')}</div>
      ${field('Specific Accounts (Optional)', `<textarea id="f_spec" placeholder="CustomerIDs, one per line or comma-separated">${esc((A.specific||[]).join('\n'))}</textarea><div class="upload-row"><input type="file" id="f_file" accept=".csv,.txt,text/csv,text/plain" aria-label="Upload an account list"><span class="hint">Upload a CSV with a CustomerID column (matched by CustomerID only; names are never matched).${A.uploadName?' Loaded: '+esc(A.uploadName)+'.':''}</span></div>`, 'Only accounts in your scope are kept; unknown numbers are listed, never added.' + (A.unmatched&&A.unmatched.length ? ' Unmatched: '+A.unmatched.slice(0,20).join(', ')+(A.unmatched.length>20?' …':'') : ''))}
      <h3 class="sec">Activity</h3>
      <div class="f"><label class="chk big"><input type="checkbox" id="f_any" ${c.boughtAnything?'checked':''}> <span><b>Bought Anything From Kohler During This Period</b><small>Keep only accounts with at least one Kohler purchase (any product) in the reporting period. Uses the full sales history, so a quiet account is not reported as a gap.</small></span></label></div>
      <div class="sumline">Accounts in scope: <b>${fmt(n2)}</b> across <b>${repsChosen().length}</b> ${plural(repsChosen().length,'rep')}. Inactive accounts are not on the books (the active Customers export), so they never appear.</div>
      ${err?`<div class="errs"><div class="err">${esc(err)}</div></div>`:''}`;
  }
  if(n===3){
    const per = periodNow(); const bl = baselineNow(per); const req = E.presetRange(c.preset, TODAY, c.custom);
    return `<h2>Choose Dates & Report Type</h2><p class="lead">What counts as a gap, and over which months.</p>
      ${field('Report Type', optionCards('rtype', c.type, TYPES.map(t=>({v:t[0], t:t[1], d:t[2]}))))}
      <div class="row2">${field('Reporting Period', `<select id="f_preset">${E.PRESETS.map(p=>`<option value="${p[0]}" ${c.preset===p[0]?'selected':''}>${p[1]}</option>`).join('')}</select>`)}
      ${field('Results', `<select id="f_level">${LEVELS.map(l=>`<option value="${l[0]}" ${c.level===l[0]?'selected':''}>${l[1]}</option>`).join('')}</select>`, c.level==='account' ? 'One row per account, with the missing products inside.' : 'Each product, brand or supplier is judged on its own.')}</div>
      ${c.preset==='custom' ? `<div class="row2">${field('Start', `<input type="date" id="f_cs" value="${esc(c.custom.start)}">`)}${field('End', `<input type="date" id="f_ce" value="${esc(c.custom.end)}">`)}</div>` : ''}
      ${coverageHtml(req, per, 'Requested')}
      ${c.type==='lapsed' ? `<h3 class="sec">Baseline Period</h3>${field('Baseline', `<select id="f_bpreset"><option value="before" ${c.baseline.preset!=='custom'?'selected':''}>The same length immediately before the current period</option><option value="custom" ${c.baseline.preset==='custom'?'selected':''}>Custom dates</option></select>`)}
        ${c.baseline.preset==='custom' ? `<div class="row2">${field('Baseline Start', `<input type="date" id="f_bs" value="${esc(c.baseline.custom.start)}">`)}${field('Baseline End', `<input type="date" id="f_be" value="${esc(c.baseline.custom.end)}">`)}</div>` : ''}
        ${bl ? `<div class="nb-cov ${bl.ok?(bl.complete?'':'warn'):'bad'}">${bl.ok ? `<b>Baseline:</b> ${esc(E.periodText(bl.effective))}${bl.note?' · '+esc(bl.note):''}` : esc(bl.reason)}</div>` : ''}` : ''}
      ${err?`<div class="errs"><div class="err">${esc(err)}</div></div>`:''}`;
  }
  const P = resolvedProducts(); const acc = filteredAccounts(); const per = periodNow(); const bl = baselineNow(per); const req = E.presetRange(c.preset, TODAY, c.custom);
  const sec = (id, title, status, body, open, e, step) => `<details class="rsec${e?' bad':''}" id="rs_${id}" ${open||e?'open':''}><summary><span class="rs-t">${esc(title)}</span><span class="rs-s">${e?'<span class="tag bad">Needs attention</span>':esc(status)}</span>${step?`<button type="button" class="btn sm outline rs-e" data-step="${step}">Edit</button>`:''}<i class="rs-c" aria-hidden="true"></i></summary><div class="rs-b">${e?`<ul class="rs-err"><li>${esc(e)}</li></ul>`:''}${body}</div></details>`;
  const kv = rows => `<dl class="kvrows">${rows.filter(r=>r&&r[1]).map(r=>`<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl>`;
  const filt = [A.territory!=='any'?(A.territory==='core'?'Core Market':'Southern District'):null, A.premise!=='any'?(A.premise==='off'?'Off-Premise':'On-Premise'):null, A.towns.length?A.towns.length+' '+plural(A.towns.length,'town'):null, A.chains.length?A.chains.join(', '):null, A.types.length?A.types.join(', '):null, (A.specific||[]).length?A.specific.length+' specific accounts':null].filter(Boolean).join(' · ') || 'No filters';
  const T = TYPES.find(t=>t[0]===c.type);
  return `<h2>Review & Generate</h2><p class="lead">Check the criteria, then generate.</p><div class="pv">
    ${sec('products', 'Products', P.length+' selected', `<p>${esc(critProducts(c, P.length))}</p><details class="adv"><summary>Show Products</summary><ul class="rs-list">${P.slice(0,300).map(p=>`<li>${esc(p.name)} <span class="muted">#${esc(p.id)} · ${esc(p.supplier||'')}</span></li>`).join('')}${P.length>300?`<li class="muted">… ${P.length-300} more</li>`:''}</ul></details>`, false, errs[1], 1)}
    ${sec('accounts', 'Accounts', fmt(acc.length)+' accounts · '+repsChosen().length+' '+plural(repsChosen().length,'rep'), kv([['Reps', IS_MGR ? (A.reps.length ? A.reps.join(', ') : 'All My Reps ('+repsChosen().length+')') : 'My Route'], IS_MGR&&A.districts.length?['Districts', A.districts.join(', ')]:null, ['Filters', filt], ['Activity', c.boughtAnything ? 'Bought anything from Kohler during the period' : 'Any account, active or quiet']]) + `<details class="adv"><summary>Show Accounts</summary><ul class="rs-list">${acc.slice(0,300).map(a=>`<li>${esc(a.name)} <span class="muted">#${esc(a.n)} · ${esc(a.city)}${IS_MGR?' · '+esc(a.rep):''}</span></li>`).join('')}${acc.length>300?`<li class="muted">… ${acc.length-300} more</li>`:''}</ul></details>`, false, errs[2], 2)}
    ${sec('dates', 'Report Type & Dates', (T?T[1]:'')+' · '+(per.ok?E.periodText(per.effective):'period not set'), kv([['Report Type', T?T[1]+' — '+T[2]:''], ['Results', (LEVELS.find(l=>l[0]===c.level)||[])[1]], ['Requested', req.label+(req.start?' ('+E.periodText(req)+')':'')], ['Effective Period', per.ok ? E.periodText(per.effective)+' (whole sales months)' : '—'], bl?['Baseline', bl.ok?E.periodText(bl.effective):'—']:null]), false, errs[3], 3)}
    ${sec('coverage', 'Data Coverage', 'Through '+E.monthLabel(S.ctx.refMonth)+((per.ok && !per.complete) ? ' · later months not loaded' : ''), kv([['Sales Data', 'Complete through '+E.monthLabel(S.ctx.refMonth)+(S.ctx.loaded?' · loaded '+String(S.ctx.loaded).slice(0,10):'')], ['Account Books', 'As of '+(S.ctx.bookAsOf||'—')], ['Brand Permissions', 'As of '+(S.ctx.brands.asOf||'—')], per.note?['Note', per.note]:null, ['Purchase Rule', 'Net cases above zero in a sales month. Fully returned purchases net to zero and do not count (see README: returns).']]), per.ok && !per.complete, '')}
  </div>`;
}
function coverageHtml(req, per, lbl){
  if(!per.ok) return `<div class="nb-cov bad">${esc(per.reason)}</div>`;
  return `<div class="nb-cov ${per.complete?'':'warn'}"><b>${esc(lbl)}:</b> ${esc(req.label)}${req.start?' · '+esc(E.periodText(req)):''}<br><b>Effective:</b> ${esc(E.periodText(per.effective))} (${per.months.length} whole ${plural(per.months.length,'sales month')})<br><b>Latest complete sales data:</b> ${esc(E.monthLabel(S.ctx.refMonth))}${S.ctx.loaded?', loaded '+esc(String(S.ctx.loaded).slice(0,10)):''}${per.note?'<br>'+esc(per.note):''}</div>`;
}
// read the current step back into the criteria
function collect(){
  const c = S.crit; const $ = id => document.getElementById(id); const A = c.accounts;
  if(S.step===2 && $('f_terr')){
    if(IS_MGR){ const mode = (document.querySelector('input[name=repmode]:checked')||{}).value; A.reps = mode==='some' ? [...document.querySelectorAll('[data-rep]:checked')].map(x=>x.dataset.rep) : []; S.ui.repPick = mode==='some'; if($('f_dist')) A.districts = [...$('f_dist').selectedOptions].map(o=>o.value); }
    A.territory = $('f_terr').value; A.premise = $('f_prem').value; A.towns = [...$('f_town').selectedOptions].map(o=>o.value);
    A.chains = $('f_chain') ? [...$('f_chain').selectedOptions].map(o=>o.value) : []; A.types = $('f_type') ? [...$('f_type').selectedOptions].map(o=>o.value) : [];
    const raw = $('f_spec').value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean); applySpecific(raw);
    c.boughtAnything = $('f_any').checked;
  }
  if(S.step===3 && $('f_preset')){ c.type = (document.querySelector('input[name=rtype]:checked')||{}).value||c.type; c.preset = $('f_preset').value; c.level = $('f_level').value; if($('f_cs')){ c.custom = {start:$('f_cs').value, end:$('f_ce').value}; } if($('f_bpreset')){ c.baseline.preset = $('f_bpreset').value; if($('f_bs')) c.baseline.custom = {start:$('f_bs').value, end:$('f_be').value}; } }
  SS.set('crit', c);
}
// patch the Choose Accounts step in place after a rep / district change: count line + the town / chain / type options
function patchAccountStep(){
  const rows = Src.accounts(S.ctx, repsChosen()); const A = S.crit.accounts;
  const fill = (id, vals, chosen) => { const el = document.getElementById(id); if(!el) return; el.innerHTML = vals.map(v=>`<option value="${esc(v)}" ${chosen.includes(v)?'selected':''}>${esc(v)}</option>`).join(''); };
  fill('f_town', [...new Set(rows.map(a=>a.city).filter(Boolean))].sort(), A.towns); fill('f_chain', [...new Set(rows.map(a=>a.chain).filter(Boolean))].sort(), A.chains); fill('f_type', [...new Set(rows.map(a=>a.type).filter(Boolean))].sort(), A.types);
  const n2 = filteredAccounts().length; const sum = document.querySelector('.sumline'); if(sum) sum.innerHTML = `Accounts in scope: <b>${fmt(n2)}</b> across <b>${repsChosen().length}</b> ${plural(repsChosen().length,'rep')}. Inactive accounts are not on the books (the active Customers export), so they never appear.`;
}
function applySpecific(raw){ const A = S.crit.accounts; const known = new Set(Src.accounts(S.ctx, scopeReps()).map(a=>String(a.n))); A.specific = raw.filter(x=>known.has(String(x))); A.unmatched = raw.filter(x=>!known.has(String(x))); }

// ---- product dialog (Shopify Select Products: search + filters above checkbox rows, selected count, Cancel / Add)
function openProd(mode){
  const pool = productPool(); const have = new Set(resolvedProducts().map(p=>String(p.id)));
  const pm = S.pm = {mode, q:'', sup:'', fam:'', brand:'', pkg:'', cat:'', selOnly:false, checked:new Set(mode==='manage' ? have : []), have, pool};
  const host = document.createElement('div'); host.className = 'modal'; host.id = 'prodModal'; host.setAttribute('role','dialog'); host.setAttribute('aria-modal','true'); host.setAttribute('aria-labelledby','pmTitle');
  host.innerHTML = `<div class="mbox"><div class="mh"><div><h2 id="pmTitle">${mode==='manage'?'Manage Products':'Add Products'}</h2><div class="msub">${S.ctx.scope.brands!==null?'Limited to your brand scope':'Every product on the catalogue'}</div></div><button type="button" class="btn sm outline" data-act="pm-cancel" aria-label="Close">×</button></div>
    <div class="mt"><input type="search" id="pmQ" class="search" placeholder="Search by product name or ProductID" aria-label="Search products" autocomplete="off">
      <div class="mf"><select id="pmSup" aria-label="Supplier"><option value="">All suppliers</option></select><select id="pmBrand" aria-label="Brand"><option value="">All brands</option></select><select id="pmFam" aria-label="Brand family"><option value="">All brand families</option></select><select id="pmPkg" aria-label="Package"><option value="">All packages</option></select><select id="pmCat" aria-label="Category"><option value="">Draft and package</option><option value="draft">Draft only</option><option value="package">Package only</option></select><button type="button" class="btn sm outline tog" data-act="pm-selonly" aria-pressed="false">Show Selected</button></div>
      <div class="mg" id="pmGroup"></div></div>
    <div class="ml" id="pmList"></div>
    <div class="mfoot"><span id="pmCount">0 selected</span><span class="r"><button type="button" class="btn outline" data-act="pm-cancel">Cancel</button><button type="button" class="btn primary" data-act="pm-add" ${mode==='manage'?'':'disabled'}>${mode==='manage'?'Done':'Add Products'}</button></span></div></div>`;
  document.body.appendChild(host); document.body.classList.add('modal-open');
  fillFilters(); renderList();
  const q = document.getElementById('pmQ'); if(q) q.focus();
}
function fillFilters(){
  const pm = S.pm; const pool = pm.pool;
  const sel = (id, vals, cur) => { const el = document.getElementById(id); const first = el.options[0].outerHTML; el.innerHTML = first + vals.map(v=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(v)}</option>`).join(''); };
  const inSup = p => !pm.sup || p.supplier===pm.sup, inFam = p => !pm.fam || p.family===pm.fam, inBrand = p => !pm.brand || p.brand===pm.brand, inCat = p => !pm.cat || (pm.cat==='draft' ? p.draft : !p.draft);
  sel('pmSup', [...new Set(pool.filter(p=>inFam(p)&&inCat(p)&&inBrand(p)).map(p=>p.supplier).filter(Boolean))].sort(), pm.sup);
  sel('pmBrand', [...new Set(pool.filter(p=>inSup(p)&&inFam(p)&&inCat(p)).map(p=>p.brand).filter(Boolean))].sort(), pm.brand);   // a supplier narrows the brands
  sel('pmFam', [...new Set(pool.filter(p=>inSup(p)&&inCat(p)&&inBrand(p)).map(p=>p.family).filter(Boolean))].sort(), pm.fam);
  sel('pmPkg', [...new Set(pool.filter(p=>inSup(p)&&inFam(p)&&inCat(p)&&inBrand(p)).map(p=>p.package).filter(Boolean))].sort(), pm.pkg);
}
function matches(){ const pm = S.pm; const q = pm.q.toLowerCase().trim(); return pm.pool.filter(p=>(!pm.sup||p.supplier===pm.sup)&&(!pm.fam||p.family===pm.fam)&&(!pm.brand||p.brand===pm.brand)&&(!pm.pkg||p.package===pm.pkg)&&(!pm.cat||(pm.cat==='draft'?p.draft:!p.draft))&&(!q||(p.name+' '+p.id).toLowerCase().includes(q))&&(!pm.selOnly||pm.checked.has(String(p.id)))); }
function renderList(){
  const pm = S.pm; const list = matches(); const host = document.getElementById('pmList'); if(!host) return;
  host.innerHTML = (list.slice(0,200).map(p=>{ const had = pm.mode!=='manage' && pm.have.has(String(p.id)); return `<label class="chk prow${had?' had':''}"><input type="checkbox" data-pm="${esc(p.id)}" ${pm.checked.has(String(p.id))?'checked':''} ${had?'disabled':''}><span class="pn">${esc(p.name)}</span><small>${esc(p.package||'')}${p.package?' · ':''}#${esc(p.id)} · ${esc(p.supplier||'')}${had?' · already selected':''}</small></label>`; }).join('') || '<div class="none">No products match.</div>') + (list.length>200 ? `<div class="none">Showing 200 of ${list.length} — search or filter to narrow.</div>` : '');
  const g = document.getElementById('pmGroup');
  const grp = pm.mode!=='manage' && !pm.q.trim() && !pm.selOnly ? (pm.brand ? {type:'brand', value:pm.brand, label:'Brand'} : pm.fam ? {type:'family', value:pm.fam, label:'Brand Family'} : pm.sup ? {type:'supplier', value:pm.sup, label:'Supplier'} : pm.pkg ? {type:'package', value:pm.pkg, label:'Package'} : null) : null;
  g.innerHTML = grp ? `<button type="button" class="btn sm outline" data-act="pm-group" data-type="${grp.type}" data-value="${esc(grp.value)}">Add Entire ${grp.label}: ${esc(grp.value)} (${list.length} products)</button><span class="hint">Adds the whole group as one rule. Filtering alone selects nothing.</span>` : '';
  countSel();
}
function countSel(){ const pm = S.pm; const c = document.getElementById('pmCount'); const b = document.querySelector('[data-act=pm-add]');
  if(pm.mode==='manage'){ let add = 0, rm = 0; pm.checked.forEach(id=>{ if(!pm.have.has(id)) add++; }); pm.have.forEach(id=>{ if(!pm.checked.has(id)) rm++; }); if(c) c.textContent = 'Adding '+add+', Removing '+rm; }
  else { if(c) c.textContent = pm.checked.size+' selected'; if(b) b.disabled = !pm.checked.size; } }
function closeModal(){ ['prodModal','tgtModal','nameModal'].forEach(id=>{ const m = document.getElementById(id); if(m) m.remove(); }); document.body.classList.remove('modal-open'); S.pm = null; }
const isSku = (s, id) => s.type==='sku' && String(s.value)===String(id);
function addSku(id){ const pr = S.crit.products; pr.exclude = (pr.exclude||[]).filter(s=>!isSku(s,id)); if(!(pr.include||[]).some(s=>isSku(s,id))) pr.include.push({type:'sku', value:String(id)}); }
function removeSku(id){ const pr = S.crit.products; pr.include = pr.include.filter(s=>!isSku(s,id)); if(KP.resolveProducts(pr, S.ctx.products).some(p=>String(p.id)===String(id)) && !pr.exclude.some(s=>isSku(s,id))) pr.exclude.push({type:'sku', value:String(id)}); }

// ---- generate
async function generate(){
  const errs = validate(); if(Object.keys(errs).length){ S.msg = {cls:'err', t:'Fix the items marked before generating.'}; renderSetup(); return; }
  const reps = repsChosen(); const keys = reps.map(r=>r.key); const P = resolvedProducts(); const acc = filteredAccounts(); const per = periodNow(); const bl = baselineNow(per);
  S.busy = 'Loading sales history…'; renderSetup(); const foot = document.querySelector('.nb-foot .r'); if(foot) foot.innerHTML = '<span class="saved" id="nbProg">Loading sales history…</span>';
  let hist; try{ hist = await Src.histFor(keys, (i,n)=>{ const el = document.getElementById('nbProg'); if(el) el.textContent = 'Loading sales history… '+i+' of '+n; }); }catch(e){ S.busy=''; S.msg = {cls:'err', t:'Could not load the sales history: '+(e.message||e)}; renderSetup(); return; }
  const out = E.run({ type:S.crit.type, level:S.crit.level, products:P, accounts:acc, hist, months:S.ctx.months, period:{months:per.months}, baseline: bl ? {months: bl.months} : null, brands:S.ctx.brands, opts:{boughtAnything:S.crit.boughtAnything} });
  S.res = { id:null, name:S.crit.name||defaultName(P, S.crit.type), type:S.crit.type, level:S.crit.level, criteria:JSON.parse(JSON.stringify(Object.assign({}, S.crit, {mode: IS_MGR?'manager':'rep'}))),
    products:P.map(p=>({id:String(p.id), name:p.name, supplier:p.supplier||'', family:p.family||'', brand:p.brand||'', package:p.package||''})),
    period:{requested:per.requested, effective:per.effective, months:per.months, note:per.note||'', complete:per.complete}, baseline: bl ? {effective:bl.effective, months:bl.months, note:bl.note||''} : null,
    coverage:{refMonth:S.ctx.refMonth, through:S.ctx.through, loaded:S.ctx.loaded, bookAsOf:S.ctx.bookAsOf, brandsAsOf:S.ctx.brands.asOf, firstMonth:S.ctx.months[0]},
    byRep:out.byRep, groups:out.groups, counts:out.counts, excluded:out.excluded, unknownPairs:out.unknownPairs, unknownWhy:out.unknownWhy, ruleVersion:out.ruleVersion, generatedAt:new Date().toISOString(), scopeMode:S.ctx.scope.mode, repsConsidered:reps.map(r=>r.rep), accountsConsidered:acc.length };
  S.busy = ''; S.ui.q=''; S.ui.rep=''; S.ui.finding=''; S.ui.prem=''; S.ui.open={}; SS.set('res', S.res); SS.set('ui', S.ui);
  go({view:'results'});
}
function defaultName(P, type){ const T = TYPES.find(t=>t[0]===type); const sups = [...new Set(P.map(p=>p.supplier).filter(Boolean))]; const fams = [...new Set(P.map(p=>p.family).filter(Boolean))]; const what = fams.length===1 ? fams[0] : sups.length===1 ? sups[0] : P.length+' products'; return (T?T[1]:'Report')+' · '+what; }

// ---- results
function allRows(){ const R = S.res; return [].concat(...Object.keys(R.byRep).sort().map(k=>R.byRep[k])); }
function visibleRows(){
  const q = S.ui.q.toLowerCase().trim();
  return allRows().filter(r=>(!S.ui.rep || r.rep===S.ui.rep) && (!S.ui.finding || r.finding===S.ui.finding) && (!S.ui.prem || String(r.prem||'').toLowerCase().slice(0,2)===S.ui.prem) && (!q || (r.name+' '+r.n+' '+(r.city||'')).toLowerCase().includes(q)));
}
function prodName(id){ const p = (S.res.products||[]).find(x=>String(x.id)===String(id)); return p ? p.name : '#'+id; }
function acctHref(r){ const from = location.pathname + '#view=results' + (S.res.id ? '&id='+S.res.id : ''); return '../accounts/#acct='+encodeURIComponent(r.n)+(IS_MGR?'&rep='+encodeURIComponent(r.rep):'')+'&from='+encodeURIComponent(from)+'&fl='+encodeURIComponent('Non-Buy Report'); }
function missingList(r){ const ids = S.res.type==='lapsed' ? (r.baseline||[]) : r.missing; return `<ul class="nb-miss">${ids.map(id=>`<li>${esc(prodName(id))}${S.res.type==='lapsed'?' <span class="muted">(bought in the baseline)</span>':''}</li>`).join('')}${r.unknown&&r.unknown.length?`<li class="muted">${r.unknown.length} selected ${plural(r.unknown.length,'product')} with unverified permission not shown</li>`:''}</ul>`; }
function findingOf(r){ return E.findingText(r, S.res.type, S.res.period.effective, S.res.baseline && S.res.baseline.effective, S.res.coverage.firstMonth); }
function renderResults(){
  const R = S.res; const rows = visibleRows(); const T = TYPES.find(t=>t[0]===R.type); const level = S.ui.level || R.level;
  const reps = Object.keys(R.byRep).sort(); const nOpp = rows.reduce((t,r)=>t+(R.type==='lapsed'?(r.baseline||[]).length:r.missing.length),0);
  const cov = `Sales data complete through ${E.monthLabel(R.coverage.refMonth)}${R.coverage.loaded?' · loaded '+String(R.coverage.loaded).slice(0,10):''} · account books as of ${R.coverage.bookAsOf||'—'}`;
  const crit = `<div class="nb-crit"><span><b>${esc(T?T[1]:R.type)}</b></span><span>Products <b>${esc(critProducts(R.criteria, R.products.length))}</b></span><span>Accounts <b>${esc(IS_MGR ? critScope(R.criteria) : 'My Route')}</b>${R.criteria.boughtAnything?' · bought anything from Kohler in the period':''}</span><span>Period <b>${esc(E.periodText(R.period.effective))}</b>${R.baseline?' · baseline <b>'+esc(E.periodText(R.baseline.effective))+'</b>':''}</span>${R.id?`<span>Snapshot <b>${esc(when(R.generatedAt))}</b></span>`:''}${!R.id && !R.shared ? `<a class="btn sm outline" href="#view=new&step=4">Edit Criteria</a>` : ''}</div>`;
  const head = `<header class="nb-res-h"><div><h1>${esc(R.name)}</h1></div><div class="nb-acts">${!R.shared ? `<button class="btn outline" data-act="save-menu" aria-haspopup="true" aria-expanded="${S.ui.menu==='save'}" ${PREVIEW?'disabled title="Saving is off in preview"':''}>Save</button>` : ''}<button class="btn outline" data-act="export-menu" aria-haspopup="true" aria-expanded="${S.ui.menu==='export'}">Export</button>${S.ui.menu==='save'?`<div class="nb-menu" id="nbMenu"><button type="button" data-act="save-report">Save Report<small>Dated snapshot</small></button><button type="button" data-act="save-tpl">Save Template<small>Reusable criteria</small></button></div>`:''}${S.ui.menu==='export'?`<div class="nb-menu" id="nbMenu"><button type="button" data-act="xlsx">Download Excel<small>Grouped by rep</small></button><button type="button" data-act="csv">Download CSV<small>One row per opportunity</small></button><button type="button" data-act="pdf">Export PDF<small>Print view</small></button>${IS_MGR && !R.shared ? `<button type="button" data-act="target" ${PREVIEW?'disabled':''}>Save as Target List<small>Share with reps</small></button>` : ''}</div>`:''}</div></header>`;
  const counts = `<div class="nb-counts"><span><b>${fmt(rows.length)}</b> distinct ${plural(rows.length,'account')}${rows.length!==R.counts.accounts?` <span class="muted">of ${fmt(R.counts.accounts)}</span>`:''}</span><span><b>${fmt(nOpp)}</b> account-product ${plural(nOpp,'opportunity','opportunities')}</span>${IS_MGR?`<span><b>${reps.length}</b> ${plural(reps.length,'rep')}</span>`:''}<span class="muted">${esc(cov)}</span></div>`;
  const notes = []; if(R.period.note) notes.push(R.period.note); if(R.unknownPairs) notes.push(R.unknownPairs+' account-product '+plural(R.unknownPairs,'combination')+' left out: permission could not be verified ('+Object.keys(R.unknownWhy||{}).slice(0,2).join('; ')+'). Ask for the missing Brand Permissions rows rather than assuming.'); if(R.excluded.unknownOnly) notes.push(R.excluded.unknownOnly+' '+plural(R.excluded.unknownOnly,'account')+' had no verifiable permission for any selected product and are not listed.'); if(R.excluded.noActivity) notes.push(R.excluded.noActivity+' '+plural(R.excluded.noActivity,'account')+' bought nothing from Kohler in the period and are not listed (turn the activity filter off to include them).');
  const tools = `<div class="nb-tools"><input type="search" id="rq" placeholder="Search by account, town or CustomerID" value="${esc(S.ui.q)}" aria-label="Search results">${IS_MGR?`<select id="rrep" aria-label="Rep"><option value="">All reps</option>${reps.map(r=>`<option value="${esc(r)}" ${S.ui.rep===r?'selected':''}>${esc(r)}</option>`).join('')}</select>`:`<select id="rprem" aria-label="Premise"><option value="">Any premise</option><option value="of" ${S.ui.prem==='of'?'selected':''}>Off-Premise</option><option value="on" ${S.ui.prem==='on'?'selected':''}>On-Premise</option></select>`}${R.type==='missing'?`<select id="rfind" aria-label="Finding"><option value="">All findings</option><option value="none" ${S.ui.finding==='none'?'selected':''}>Bought none</option><option value="some" ${S.ui.finding==='some'?'selected':''}>Missing some</option></select>`:(IS_MGR?`<select id="rprem" aria-label="Premise"><option value="">Any premise</option><option value="of" ${S.ui.prem==='of'?'selected':''}>Off-Premise</option><option value="on" ${S.ui.prem==='on'?'selected':''}>On-Premise</option></select>`:'')}<select id="rlevel" aria-label="View">${LEVELS.map(l=>`<option value="${l[0]}" ${level===l[0]?'selected':''}>${l[1]}</option>`).join('')}</select>${IS_MGR?`<button type="button" class="btn sm outline tog" data-act="cols" aria-pressed="${S.ui.cols}">More Columns</button>`:''}</div>`;
  let body;
  if(level!=='account'){ body = groupsHtml(level, rows); }
  else if(IS_MGR){ body = reps.filter(r=>!S.ui.rep || r===S.ui.rep).map(rep=>{ const rr = rows.filter(x=>x.rep===rep); if(!rr.length) return ''; return `<div class="nb-grp"><h3>${esc(rep)}</h3><span>${fmt(rr.length)} distinct ${plural(rr.length,'account')}</span></div>${tableHtml(rr)}`; }).join('') || `<div class="nb-empty">No accounts match.</div>`; }
  else { body = rows.length ? `<ul class="nb-rows">${rows.map(repRow).join('')}</ul>` : `<div class="nb-empty">No accounts match.</div>`; }
  app.innerHTML = `${S.msg?`<div class="msg ${S.msg.cls}">${esc(S.msg.t)}</div>`:''}<div style="margin:16px 0 6px"><a class="btn sm outline" href="#view=home">‹ Non-Buy Reports</a></div>${head}${crit}${counts}${notes.length?`<div class="nb-cov warn">${notes.map(esc).join('<br>')}</div>`:''}${tools}${body}
    <p class="nb-note">Purchase = net cases above zero in a sales month. Eligibility is checked per account and product against Brand Permissions (as of ${esc(R.coverage.brandsAsOf||'—')}); historical purchases are shown as recorded. Rules: nonbuy/README.txt.</p>`;
  S.msg = null; SS.set('ui', S.ui);
  const pos = SS.get('pos'); if(pos && pos.view==='results'){ SS.set('pos', null); requestAnimationFrame(()=>window.scrollTo(0, pos.y)); }
}
function lastTxt(k){ return k ? E.monthLabel(k) : 'None in history'; }
function tableHtml(rr){
  const R = S.res; const cols = S.ui.cols;
  return `<table class="nb-tbl${cols?'':' no-opt'}"><thead><tr><th>Account</th><th>Town</th><th>${R.type==='lapsed'?'Bought in Baseline':'Missing Products'}</th><th>Last Purchase</th><th class="opt">Area</th><th class="opt">Premise</th><th class="opt">Chain</th><th class="opt">Type</th><th class="opt">Last Kohler Purchase</th><th>Action</th></tr></thead><tbody>${rr.map(r=>{ const ids = R.type==='lapsed'?(r.baseline||[]):r.missing; const open = !!S.ui.open[r.n];
    return `<tr class="${open?'open':''}" data-n="${esc(r.n)}"><td data-l="Account"><span class="pn">${esc(r.name)}</span><br><span class="pm">#${esc(r.n)}</span></td><td data-l="Town">${esc(r.city||'')}</td><td data-l="${R.type==='lapsed'?'Bought in Baseline':'Missing'}">${ids.length} of ${r.eligible.length} ${R.type==='missing'&&r.finding==='some'?'<span class="pm">· bought '+r.bought.length+'</span>':''}<br><span class="pm">${esc(findingOf(r))}</span>${missingList(r)}</td><td data-l="Last Purchase" class="num">${esc(lastTxt(r.lastScope))}</td><td class="opt" data-l="Area">${esc(r.area||'')}</td><td class="opt" data-l="Premise">${esc(r.prem||'')}</td><td class="opt" data-l="Chain">${esc(r.chain||'')}</td><td class="opt" data-l="Type">${esc(r.type||'')}</td><td class="opt" data-l="Last Kohler Purchase">${esc(lastTxt(r.lastAny))}</td><td class="act"><button type="button" class="btn sm outline" data-act="toggle" data-n="${esc(r.n)}" aria-expanded="${open}">${open?'Hide':'View'} Products</button><a class="btn sm" href="${acctHref(r)}" data-act="open-acct">Open Account</a></td></tr>`; }).join('')}</tbody></table>`;
}
function repRow(r){ const R = S.res; const ids = R.type==='lapsed'?(r.baseline||[]):r.missing; const open = !!S.ui.open[r.n];
  return `<li class="nb-row${open?' open':''}" data-n="${esc(r.n)}"><div><div class="pn">${esc(r.name)}</div><div class="pm">${esc(r.city||'')} · #${esc(r.n)}</div></div><div class="pm">${esc(lastTxt(r.lastScope))}</div><div class="fd">${esc(findingOf(r))}</div>${missingList(r)}<div class="acts">${ids.length?`<button type="button" class="btn sm outline" data-act="toggle" data-n="${esc(r.n)}" aria-expanded="${open}">${open?'Hide':'View'} ${R.type==='lapsed'?'Products':'Missing Products'} (${ids.length})</button>`:''}<a class="btn sm" href="${acctHref(r)}" data-act="open-acct">Open Account</a></div></li>`; }
function groupsHtml(level, rows){
  const R = S.res; const vis = new Set(rows.map(r=>String(r.n)));
  const groups = (R.groups && R.level===level) ? R.groups : regroup(level);
  if(!groups.length) return `<div class="nb-empty">Nothing at this level.</div>`;
  return `<div class="nb-groups">${groups.map(g=>{ const acc = g.accounts.filter(a=>vis.has(String(a.n))); if(!acc.length) return ''; const byName = {}; rows.forEach(r=>{ byName[String(r.n)]=r; });
    return `<details class="nb-g"><summary><span>${esc(g.label)}</span><span class="cnt">${fmt(acc.length)} ${plural(acc.length,'account')} · ${g.products.length} ${plural(g.products.length,'product')}</span></summary><div class="body"><ul class="nb-rows">${acc.map(a=>{ const r = byName[String(a.n)]; return `<li class="nb-row"><div><div class="pn">${esc(r.name)}</div><div class="pm">${esc(r.city||'')} · #${esc(r.n)}${IS_MGR?' · '+esc(r.rep):''}</div></div><div class="pm">${esc(a.finding==='some'?'Missing '+a.missing.length+' of '+g.products.length:a.finding==='lapsed'?'Lapsed':'Bought none')}</div><div class="acts"><a class="btn sm" href="${acctHref(r)}" data-act="open-acct">Open Account</a></div></li>`; }).join('')}</ul></div></details>`; }).join('')}</div>`;
}
function regroup(level){ const R = S.res; const G = {}; R.products.forEach(p=>{ const k = E.levelKey(p, level); (G[k] = G[k] || {key:k, label:k, products:[], accounts:[]}).products.push(String(p.id)); });
  allRows().forEach(r=>{ Object.keys(G).forEach(k=>{ const g = G[k]; const eligG = r.eligible.filter(pid=>g.products.includes(pid)); if(!eligG.length) return; const boughtG = r.bought.filter(pid=>g.products.includes(pid)); if(R.type==='missing'){ const m = r.missing.filter(pid=>g.products.includes(pid)); if(m.length) g.accounts.push({n:r.n, rep:r.rep, missing:m, finding:boughtG.length?'some':'none'}); } else if(R.type==='lapsed'){ const b = (r.baseline||[]).filter(pid=>g.products.includes(pid)); if(b.length && !boughtG.length) g.accounts.push({n:r.n, rep:r.rep, baseline:b, finding:'lapsed'}); } else if(!boughtG.length) g.accounts.push({n:r.n, rep:r.rep, missing:eligG, finding:'none'}); }); });
  return Object.values(G).sort((a,b)=>b.accounts.length-a.accounts.length || a.label.localeCompare(b.label)); }

// ---- saved reports / templates / target lists
async function openSaved(id){
  const sh = (S.shared||[]).find(x=>x.id===id);
  if(sh){ S.res = sharedToRes(sh); renderResults(); return; }
  const row = D.signedIn() ? await Src.get(id) : null;
  if(!row){ const sh2 = (await Src.shared(!IS_MGR ? null : (PREVIEW ? U.name : null))).find(x=>x.id===id); if(sh2){ S.shared = S.shared||[]; S.res = sharedToRes(sh2); renderResults(); return; } S.msg = {cls:'err', t:'Report not found.'}; go({view:'home'}); return; }
  if(row.kind==='template'){ S.crit = Object.assign(blankCrit(), row.criteria||{}); delete S.crit.mode; if(!IS_MGR){ S.crit.accounts.reps=[]; S.crit.accounts.districts=[]; } SS.set('crit', S.crit); go({view:'new', step:4}); return; }
  const snap = row.snapshot||{};
  S.res = Object.assign({ byRep:{}, groups:[], counts:{accounts:0,opportunities:0,reps:0}, excluded:{}, products:[] }, snap, { id:row.id, name:row.name, criteria:row.criteria||{}, period:row.period||snap.period, baseline:snap.baseline||null, coverage:row.coverage||snap.coverage||{}, ruleVersion:row.rule_version, generatedAt:row.run_at||row.created_at, kind:row.kind, shared_reps:row.shared_reps||[] });
  renderResults();
}
function sharedToRes(sh){ const rows = sh.rows||[]; const byRep = {}; byRep[sh.rep] = rows; return { id:sh.id, shared:true, name:sh.name, type:sh.type||'nonbuyers', level:'account', criteria:sh.criteria||{}, products:sh.products||[], period:sh.period||{effective:null}, baseline:(sh.criteria&&sh.criteria.type==='lapsed'&&sh.period&&sh.period.baseline)?{effective:sh.period.baseline}:null, coverage:sh.coverage||{}, byRep, groups:[], counts:{accounts:rows.length, opportunities:rows.reduce((t,r)=>t+(r.missing||[]).length,0), reps:1}, excluded:{}, unknownPairs:0, ruleVersion:sh.rule_version, generatedAt:sh.run_at, ownerName:sh.owner_name }; }
function snapshotOf(){ const R = S.res; return { type:R.type, level:R.level, products:R.products, period:R.period, baseline:R.baseline, coverage:R.coverage, byRep:R.byRep, groups:R.groups, counts:R.counts, excluded:R.excluded, unknownPairs:R.unknownPairs, unknownWhy:R.unknownWhy, ruleVersion:R.ruleVersion, generatedAt:R.generatedAt, repsConsidered:R.repsConsidered, accountsConsidered:R.accountsConsidered }; }
function askName(title, dflt, extra, onOk){
  const host = document.createElement('div'); host.className = 'modal'; host.id = 'nameModal'; host.setAttribute('role','dialog'); host.setAttribute('aria-modal','true');
  host.innerHTML = `<div class="mbox narrow"><div class="mh"><h2>${esc(title)}</h2></div><div class="mbody"><div class="f"><label for="nmIn">Name</label><input type="text" id="nmIn" maxlength="120" value="${esc(dflt)}"></div>${extra||''}</div><div class="mfoot"><span></span><span class="r"><button type="button" class="btn outline" data-act="pm-cancel">Cancel</button><button type="button" class="btn primary" id="nmOk">${esc(title)}</button></span></div></div>`;
  document.body.appendChild(host); document.body.classList.add('modal-open');
  host.querySelector('#nmOk').addEventListener('click', ()=>{ const name = host.querySelector('#nmIn').value.trim(); if(!name) return; const picked = [...host.querySelectorAll('[data-tgt]:checked')].map(x=>x.dataset.tgt); closeModal(); onOk(name, picked); });
  setTimeout(()=>{ const i = host.querySelector('#nmIn'); if(i){ i.focus(); i.select(); } }, 30);
}
async function saveAs(kind, name, shared){
  if(PREVIEW){ S.msg = {cls:'err', t:'Saving is off in preview.'}; renderResults(); return; }
  const R = S.res; const row = { kind, name, criteria: kind==='template' ? S.crit : R.criteria, period: kind==='template' ? null : R.period, coverage: kind==='template' ? null : R.coverage, rule_version: R.ruleVersion, counts: kind==='template' ? null : R.counts, snapshot: kind==='template' ? null : snapshotOf(), shared_reps: shared||[], run_at: kind==='template' ? null : R.generatedAt };
  try{ const r = await Src.save(row); S.saved = null; S.msg = {cls:'ok', t: kind==='template' ? 'Template saved.' : kind==='target' ? 'Target list saved and shared with '+shared.length+' '+plural(shared.length,'rep')+'.' : 'Report saved.'}; if(kind!=='template' && !R.id){ R.id = r.id; R.name = name; SS.set('res', R); } }
  catch(e){ S.msg = {cls:'err', t:'Not saved: '+(e.message||e)}; }
  renderResults();
}

// ---- exports (grouped by rep, filtered + authorized rows only, no dollars)
function exportRows(){ const R = S.res; const rows = visibleRows(); const out = []; rows.forEach(r=>{ const ids = R.type==='lapsed'?(r.baseline||[]):r.missing; (ids.length?ids:['']).forEach(id=>{ const p = R.products.find(x=>String(x.id)===String(id)); out.push({ rep:r.rep, n:String(r.n), name:r.name, town:r.city||'', area:r.area||'', premise:r.prem||'', chain:r.chain||'', type:r.type||'', finding:findingOf(r), pid:id, product:p?p.name:'', supplier:p?p.supplier:'', pkg:p?p.package:'', lastScope:r.lastScope?E.monthLabel(r.lastScope):'', lastAny:r.lastAny?E.monthLabel(r.lastAny):'' }); }); }); return out; }
const COLS = [['rep','Rep'],['n','CustomerID'],['name','Account'],['town','Town'],['area','Area'],['premise','Premise'],['chain','Chain'],['type','Account Type'],['finding','Finding'],['pid','ProductID'],['product','Product'],['supplier','Supplier'],['pkg','Package'],['lastScope','Last Purchase (Selected Products)'],['lastAny','Last Kohler Purchase']];
function safeText(v){ let s = String(v==null?'':v); if(/^[=+\-@\t\r]/.test(s)) s = "'"+s; return s; }
function csvCell(v){ const s = safeText(v); return /[",\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }
function stamp(){ const d = new Date(); return {label: d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}), file: d.toISOString().slice(0,16).replace(/[:T]/g,'-')}; }
function headerRows(){ const R = S.res; const T = TYPES.find(t=>t[0]===R.type); return [['# Kohler Distribution Hub — Non-Buy Report'], ['# Report', R.name], ['# Type', T?T[1]+' — '+T[2]:R.type], ['# Products', critProducts(R.criteria, R.products.length)], ['# Accounts', IS_MGR?critScope(R.criteria):'My Route'], ['# Reporting period', E.periodText(R.period.effective)+(R.period.requested?' (requested '+E.periodText(R.period.requested)+')':'')].concat(R.baseline?[]:[]), R.baseline?['# Baseline', E.periodText(R.baseline.effective)]:null, ['# Data coverage', 'Sales data complete through '+E.monthLabel(R.coverage.refMonth)+(R.coverage.loaded?', loaded '+String(R.coverage.loaded).slice(0,10):'')+'; account books as of '+(R.coverage.bookAsOf||'—')+'; Brand Permissions as of '+(R.coverage.brandsAsOf||'—')], ['# Generated', when(R.generatedAt)+' · exported '+stamp().label+' · rule '+R.ruleVersion], ['# Rule', 'Purchase = net cases above zero in a sales month; opportunities only for products the account is permitted to buy; no financial amounts.']].filter(Boolean); }
function downloadBlob(name, blob){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function exportCsv(){ const rows = exportRows(); const text = headerRows().map(r=>r.map(csvCell).join(',')).join('\r\n') + '\r\n\r\n' + COLS.map(c=>c[1]).join(',') + '\r\n' + rows.map(r=>COLS.map(c=>csvCell(r[c[0]])).join(',')).join('\r\n') + '\r\n'; downloadBlob('non-buy-'+stamp().file+'.csv', new Blob(['﻿'+text], {type:'text/csv;charset=utf-8'})); }
function exportXlsx(){ if(!window.KdhXlsx){ S.msg={cls:'err',t:'The Excel writer did not load.'}; renderResults(); return; } const rows = exportRows(); const sheet = headerRows().map(r=>r.map(safeText)).concat([[]], [COLS.map(c=>c[1])]); let cur = null; rows.forEach(r=>{ if(r.rep!==cur){ cur = r.rep; const n = visibleRows().filter(x=>x.rep===cur).length; sheet.push([cur+' — '+n+' '+plural(n,'account')]); } sheet.push(COLS.map(c=>safeText(r[c[0]]))); }); const blob = KdhXlsx.book([{name:'Non-Buy Report', rows:sheet, widths:[18,12,32,16,12,10,16,18,48,10,40,22,16,18,18]}]); downloadBlob('non-buy-'+stamp().file+'.xlsx', blob); }
function exportPdf(){ const R = S.res; const rows = visibleRows(); let host = document.getElementById('nbPrint'); if(!host){ host = document.createElement('div'); host.id = 'nbPrint'; document.body.appendChild(host); } const reps = [...new Set(rows.map(r=>r.rep))].sort();
  host.innerHTML = `<h1>${esc(R.name)}</h1>${headerRows().slice(1).map(r=>`<p><b>${esc(r[0].replace(/^# /,''))}:</b> ${esc(r[1]||'')}</p>`).join('')}<p><b>Distinct accounts:</b> ${rows.length}</p>` + reps.map(rep=>{ const rr = rows.filter(r=>r.rep===rep); return `<h2>${esc(rep)} — ${rr.length} ${plural(rr.length,'account')}</h2><table><thead><tr><th>Account</th><th>CustomerID</th><th>Town</th><th>${R.type==='lapsed'?'Bought in Baseline':'Missing Products'}</th><th>Last Purchase</th></tr></thead><tbody>${rr.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.n)}</td><td>${esc(r.city||'')}</td><td>${(R.type==='lapsed'?(r.baseline||[]):r.missing).map(id=>esc(prodName(id))).join('; ')}</td><td>${esc(lastTxt(r.lastScope))}</td></tr>`).join('')}</tbody></table>`; }).join('');
  host.style.display = 'block'; setTimeout(()=>{ window.print(); setTimeout(()=>{ host.style.display = ''; }, 500); }, 50); }

// ---- events
document.addEventListener('click', async e=>{
  const b = e.target.closest('[data-act]');
  if(b){ const a = b.dataset.act; if(a==='open-acct'){ SS.set('pos', {view:'results', y:window.scrollY}); SS.set('ui', S.ui); return; } e.preventDefault(); await act(a, b); return; }
  if(e.target.classList && e.target.classList.contains('modal')){ closeModal(); return; }
  if(S.ui.menu && !e.target.closest('#nbMenu')){ S.ui.menu = ''; renderResults(); return; }
  const t = e.target.closest('[data-tab]'); if(t){ S.tab = t.dataset.tab; renderHome(); return; }
  const s = e.target.closest('.nb-prog [data-step], .rsec [data-step]'); if(s){ collect(); S.step = Number(s.dataset.step); go({view:'new', step:S.step}); return; }
});
async function act(a, el){
  const id = el.dataset.id;
  if(a==='prev'){ collect(); S.step = Math.max(1, S.step-1); go({view:'new', step:S.step}); return; }
  if(a==='next'){ collect(); S.step = Math.min(4, S.step+1); go({view:'new', step:S.step}); return; }
  if(a==='generate'){ collect(); await generate(); return; }
  if(a==='add-products'){ openProd('add'); return; }
  if(a==='manage-products'){ openProd('manage'); return; }
  if(a==='pm-cancel'){ closeModal(); return; }
  if(a==='pm-selonly'){ S.pm.selOnly = !S.pm.selOnly; el.setAttribute('aria-pressed', S.pm.selOnly); renderList(); return; }
  if(a==='pm-group'){ const pr = S.crit.products; const sel = {type:el.dataset.type, value:el.dataset.value}; if(!pr.include.some(s=>s.type===sel.type && String(s.value).toLowerCase()===sel.value.toLowerCase())) pr.include.push(sel); closeModal(); S.ui.selOpen = true; SS.set('crit', S.crit); S.msg={cls:'ok', t:'Added the whole '+(SEL_LABEL[sel.type]||sel.type).toLowerCase()+' '+sel.value+' ('+resolvedProducts().length+' products selected now).'}; renderSetup({keep:true}); return; }
  if(a==='pm-add'){ const pm = S.pm; if(!pm) return; if(pm.mode==='manage'){ pm.checked.forEach(x=>{ if(!pm.have.has(x)) addSku(x); }); pm.have.forEach(x=>{ if(!pm.checked.has(x)) removeSku(x); }); } else { pm.checked.forEach(addSku); } closeModal(); S.ui.selOpen = true; SS.set('crit', S.crit); renderSetup({keep:true}); return; }
  if(a==='rm-product'){ removeSku(el.dataset.id); SS.set('crit', S.crit); renderSetup({keep:true}); return; }
  if(a==='restore-product'){ S.crit.products.exclude = S.crit.products.exclude.filter(s=>!isSku(s, el.dataset.id)); SS.set('crit', S.crit); renderSetup({keep:true}); return; }
  if(a==='rm-group'){ S.crit.products.include.splice(Number(el.dataset.i),1); SS.set('crit', S.crit); renderSetup({keep:true}); return; }
  if(a==='toggle'){ const n = el.dataset.n; S.ui.open[n] = !S.ui.open[n]; const tr = el.closest('tr, li'); if(tr){ tr.classList.toggle('open', !!S.ui.open[n]); el.setAttribute('aria-expanded', !!S.ui.open[n]); el.textContent = el.textContent.replace(/^(View|Hide)/, S.ui.open[n]?'Hide':'View'); } SS.set('ui', S.ui); return; }
  if(a==='cols'){ S.ui.cols = !S.ui.cols; renderResults(); return; }
  if(a==='save-menu'){ S.ui.menu = S.ui.menu==='save' ? '' : 'save'; renderResults(); return; }
  if(a==='export-menu'){ S.ui.menu = S.ui.menu==='export' ? '' : 'export'; renderResults(); return; }
  if(a==='save-report'){ S.ui.menu=''; askName('Save Report', S.res.name, '', name=>saveAs('report', name)); return; }
  if(a==='save-tpl'){ S.ui.menu=''; askName('Save Template', S.res.name, '<p class="muted">Keeps the criteria (products, filters, relative dates). Rerunning resolves today\'s accounts and products and never changes a saved report.</p>', name=>saveAs('template', name)); return; }
  if(a==='target'){ S.ui.menu=''; const reps = Object.keys(S.res.byRep).sort(); askName('Save as Target List', S.res.name, `<div class="f"><div class="lbl">Share With</div><div class="pl">${reps.map(r=>`<label class="chk"><input type="checkbox" data-tgt="${esc(r)}" checked><span class="pn">${esc(r)}</span><small>${(S.res.byRep[r]||[]).length} accounts</small></label>`).join('')}</div><div class="hint">Each rep receives only their own accounts. Sharing is explicit: nobody else can see the list.</div></div>`, (name, picked)=>{ if(!picked.length){ S.msg={cls:'err',t:'Pick at least one rep to share with.'}; renderResults(); return; } saveAs('target', name, picked); }); return; }
  if(a==='csv'){ S.ui.menu=''; renderResults(); exportCsv(); return; }
  if(a==='xlsx'){ S.ui.menu=''; renderResults(); exportXlsx(); return; }
  if(a==='pdf'){ S.ui.menu=''; renderResults(); exportPdf(); return; }
  if(a==='use-tpl'){ await openSaved(id); return; }
  if(a==='open-shared'){ go({view:'results', id}); return; }
  if(a==='del-saved'){ if(!confirm('Remove this saved item?')) return; await Src.remove(id); S.saved = null; S.msg={cls:'ok', t:'Removed.'}; renderHome(); return; }
}
document.addEventListener('change', e=>{
  const el = e.target;
  if(el.dataset.pm!=null){ const pm = S.pm; if(!pm) return; if(el.checked) pm.checked.add(String(el.dataset.pm)); else pm.checked.delete(String(el.dataset.pm)); countSel(); return; }
  if(['pmSup','pmFam','pmBrand','pmPkg','pmCat'].includes(el.id)){ const pm = S.pm; if(!pm) return; pm.sup = document.getElementById('pmSup').value; pm.fam = document.getElementById('pmFam').value; pm.brand = document.getElementById('pmBrand').value; pm.pkg = document.getElementById('pmPkg').value; pm.cat = document.getElementById('pmCat').value; fillFilters(); renderList(); return; }
  if(!app.contains(el)) return;
  if(S.view==='new'){
    if(el.id==='f_file'){ const f = el.files && el.files[0]; if(!f) return; f.text().then(txt=>{ const lines = txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean); let col = 0; const head = lines[0] ? lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim().toLowerCase()) : []; const ci = head.findIndex(h=>/customer.?id|customer.?num|customerid|^id$/.test(h)); const ids = []; lines.slice(ci>=0?1:0).forEach(l=>{ const cells = l.split(','); const v = (cells[ci>=0?ci:0]||'').replace(/^"|"$/g,'').trim(); const m = v.match(/^\d+/); if(m) ids.push(m[0]); }); collect(); applySpecific(ids); S.crit.accounts.uploadName = f.name+' ('+ids.length+' ids)'; SS.set('crit', S.crit); renderSetup({keep:true}); }); return; }
    if(el.name==='repmode'){ collect(); S.ui.repPick = el.value==='some'; renderSetup({keep:true}); return; }
    if(el.dataset.rep!=null || el.id==='f_dist'){ collect(); patchAccountStep(); return; }   // a rep tick never re-renders the step (no jump): the counts and option lists are patched in place
    if(el.name==='rtype' || el.id==='f_preset' || el.id==='f_bpreset' || el.id==='f_cs' || el.id==='f_ce' || el.id==='f_bs' || el.id==='f_be' || el.id==='f_level'){ collect(); renderSetup({keep:true}); return; }
    collect(); return;
  }
  if(S.view==='results'){
    if(el.id==='rrep'){ S.ui.rep = el.value; renderResults(); } if(el.id==='rfind'){ S.ui.finding = el.value; renderResults(); } if(el.id==='rprem'){ S.ui.prem = el.value; renderResults(); } if(el.id==='rlevel'){ S.ui.level = el.value; renderResults(); }
  }
});
document.addEventListener('input', e=>{
  const el = e.target;
  if(el.id==='pmQ'){ if(S.pm){ S.pm.q = el.value; renderList(); } return; }
  if(el.id==='repQ'){ const q = el.value.toLowerCase(); document.querySelectorAll('#repPick .chk').forEach(r=>{ r.hidden = !!q && !r.dataset.name.includes(q); }); return; }
  if(el.id==='rq'){ S.ui.q = el.value; clearTimeout(S.qt); S.qt = setTimeout(()=>{ const y = window.scrollY; renderResults(); window.scrollTo(0, y); const i = document.getElementById('rq'); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); return; }
  if(app.contains(el) && S.view==='new' && (el.id==='f_spec')){ clearTimeout(S.st); S.st = setTimeout(collect, 400); }
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && document.querySelector('.modal')) closeModal(); });
boot();
})();
