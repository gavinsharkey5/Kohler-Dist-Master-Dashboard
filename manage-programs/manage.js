/* Manage Programs (2026-10-08). Managers build incentives / MPOs in a seven-step
   wizard, save drafts, submit for approval; the program approver (program_admin)
   approves or returns; shared/custom-programs.js evaluates + renders the approved
   definition through the existing Programs experience. All permissions are
   enforced by the database functions (kdh_program_*); this file only asks.
   State: hash #view=list|edit|review&id=<uuid>&step=1..7&tab=<list tab>. */
(function(){
'use strict';
const app = document.getElementById('mpApp');
const U = window.kdhUser ? window.kdhUser() : null;
const D = window.KdhData; const KP = window.KdhPrograms;
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => (Math.round(Number(n)*10)/10).toLocaleString('en-US');
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const iso = d => d instanceof Date ? d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') : '';
const fmtDate = s => { if(!s) return '—'; const d = new Date(String(s).slice(0,10)+'T00:00:00'); return isNaN(d) ? String(s) : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); };
const fmtWhen = s => { if(!s) return ''; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); };
const CORE = ['Bergen','Passaic','Passaic-FF','Morris 1','Morris 3','Sussex'], SOUTH = ['Essex','Hudson','Union'];
const MERCH_CATS = [['any','Any category'],['display','Display'],['pod','POD'],['window','Window'],['cooler_door','Cooler Door'],['tap_handle','Tap Handles'],['menu','Menu Placement'],['signage','Signage'],['other','Other Activation']];
const METRICS = [
  ['buying_accounts','Buying Accounts','accounts','Accounts that buy qualifying products in the period (optionally N different SKUs).'],
  ['new_buyers','New Buyers','accounts','Buying accounts with no qualifying purchase in the non-buy window before the period.'],
  ['placements','Placements','placements','Account × qualifying product with net cases in the period (every pair counts once).'],
  ['new_placements','New Placements','placements','Placements with no net purchase of that product in the non-buy window before the period.'],
  ['retention','Retention','accounts','Accounts that bought in the comparison period and again in this one.'],
  ['units','Cases','cases','Net cases of qualifying products in the period (returns reduce credit).'],
  ['growth','Growth','cases','Net cases in the period versus a comparison period.'],
  ['merch','Merchandising Records','records','Hub merchandising records at eligible accounts (counted as recorded, never as verified).'],
  ['photos','Required Photos','photos','Photos on Hub merchandising records (evidence only; a photo does not prove the requirement).'],
];
const STEPS = ['Basics','Participants & Accounts','Products','Dates & Rules','Goals','Financial Terms','Preview & Submit'];

// ---- guards (the middleware already keeps reps out; the page refuses a rep cookie or rep preview)
if(!U || U.role!=='manager' || (U.preview && U.role!=='manager')){
  app.innerHTML = U && U.preview ? `<div class="kdh-state unavailable"><b>Manage Programs Is for Managers</b><span>You are previewing a rep. <button class="btn sm" onclick="kdhExitPreview()">Exit Preview</button></span></div>`
    : `<div class="kdh-state unavailable"><b>Manage Programs Is for Managers</b><span>Managers only. <a href="../rep/">Back to Rep Home</a></span></div>`;
  return;
}
if(!D || !D.signedIn()){ app.innerHTML = `<div class="kdh-state unavailable"><b>Sign In Required</b><span>Manage Programs needs your Hub sign-in (no auth config on this copy of the site).</span></div>`; return; }

// ---- state
const S = { view:'list', tab:'drafts', id:null, step:1, programs:[], scope:null, people:null, products:null, def:null, fin:null, prog:null, versions:null, dirty:false, saving:false, msg:null, results:{}, lastSaved:null };
function readHash(){ const h = {}; location.hash.replace(/^#/,'').split('&').forEach(kv=>{ const [k,v] = kv.split('='); if(k) h[k] = decodeURIComponent(v||''); }); return h; }
function go(h){ location.hash = Object.keys(h).filter(k=>h[k]!=null && h[k]!=='').map(k=>k+'='+encodeURIComponent(h[k])).join('&'); }

// ---- data
async function loadLists(){
  const r = await D.rest('programs?select=id,kind,is_test,title,audience,supplier,start_date,end_date,status,approved_version,owner_email,owner_name,updated_at,program_versions(version,status,definition,reviewed_at,submitted_at,created_by)&order=updated_at.desc');
  S.programs = r.ok ? (r.data||[]) : [];
  if(!r.ok && r.status===404) S.msg = {cls:'err', t:'The Manage Programs tables are not in the database yet: run supabase/migrations/20261008120000_manage_programs.sql in the Supabase SQL Editor.'};
  const t = await D.rest('program_templates?select=id,name,definition,owner_name,created_at&order=created_at.desc'); S.templates = t.ok ? (t.data||[]) : [];
}
async function loadScope(){ if(S.scope) return S.scope; try{ S.scope = await D.rpc('kdh_program_scope'); }catch(e){ S.scope = {manager:true, admin:false, team:[], brands:[], error:e.message}; } return S.scope; }
async function loadPeople(){ if(S.people) return S.people; try{ S.people = await D.rpc('kdh_program_people'); }catch(e){ S.people = []; } return S.people; }
async function loadProducts(){ if(S.products) return S.products; S.products = await KP.products(); return S.products; }
function phase(p){
  if(p.status==='closed') return 'closed'; if(p.status==='archived') return 'archived';
  if(p.status==='submitted') return 'submitted'; if(p.status==='returned') return 'returned';
  if(p.status==='draft' || p.approved_version==null) return 'draft';
  const s = p.start_date ? new Date(p.start_date+'T00:00:00') : null, e = p.end_date ? new Date(p.end_date+'T00:00:00') : null;
  if(e && e < TODAY) return 'ended'; if(s && s > TODAY) return 'scheduled'; return 'active';
}
const PHASE_LABEL = {draft:'Draft', submitted:'Awaiting Approval', returned:'Returned for Changes', scheduled:'Scheduled', active:'Active', ended:'Ended — Awaiting Closeout', closed:'Closed', archived:'Archived'};
const PHASE_CLS = {draft:'', submitted:'brand', returned:'warn', scheduled:'brand', active:'ok', ended:'warn', closed:'', archived:''};
function latestVersion(p){ return (p.program_versions||[]).slice().sort((a,b)=>b.version-a.version)[0] || null; }
function pendingRevision(p){ const v = latestVersion(p); return v && p.approved_version!=null && v.version>p.approved_version ? v : null; }

// ---- list
const TABS = [['create','Create Program'],['drafts','Drafts'],['awaiting','Awaiting Approval'],['active','Scheduled / Active'],['ended','Ended / Awaiting Closeout'],['closed','Closed'],['test','Test Programs'],['templates','Templates']];
function inTab(p, tab){
  const ph = phase(p); const rev = pendingRevision(p);
  if(tab==='test') return p.is_test && ph!=='archived';      // every test program, whatever its status (they also sit on their status tab, tagged TEST)
  if(tab==='drafts') return ph==='draft' || ph==='returned' || (rev && ['draft','returned'].includes(rev.status));
  if(tab==='awaiting') return ph==='submitted' || (rev && rev.status==='submitted');
  if(tab==='active') return ph==='scheduled' || ph==='active';
  if(tab==='ended') return ph==='ended';
  if(tab==='closed') return ph==='closed' || ph==='archived';
  return false;
}
function rowHtml(p){
  const ph = phase(p); const rev = pendingRevision(p); const aud = (p.audience||[]).map(a=>a==='rep'?'Sales Reps':a==='associate'?'Sales Associates':a).join(' + ') || '—';
  return `<li class="mpr">
    <div><div class="t">${E(p.title)} ${p.is_test?'<span class="tag test">TEST</span>':''}<span class="tag">${p.kind==='mpo'?'MPO':'Incentive'}</span><span class="tag ${PHASE_CLS[ph]||''}">${PHASE_LABEL[ph]||ph}</span>${rev?`<span class="tag warn">Revision v${rev.version} ${rev.status==='submitted'?'awaiting approval':rev.status}</span>`:''}</div>
      <div class="m"><span>Audience <b>${E(aud)}</b></span><span>Dates <b>${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}</b></span><span>Owner <b>${E(p.owner_name||p.owner_email)}</b></span>${p.supplier?`<span>Supplier <b>${E(p.supplier)}</b></span>`:''}</div></div>
    <div class="a"><a class="btn sm" href="#view=review&id=${p.id}">Open</a>${['draft','returned'].includes(ph)||rev&&rev.status!=='submitted'?`<a class="btn sm outline" href="#view=edit&id=${p.id}&step=1">Edit</a>`:''}<button class="btn sm outline" data-act="dup" data-id="${p.id}">Duplicate</button></div></li>`;
}
async function renderList(){
  await loadScope();
  const sc = S.scope; const counts = {}; TABS.forEach(([k])=>counts[k]=S.programs.filter(p=>inTab(p,k)).length); counts.templates = (S.templates||[]).length;
  const tab = S.tab==='create' ? 'drafts' : S.tab;
  const who = sc.admin ? 'You are the program approver.' : (sc.team===null && sc.brands===null) ? '' : [sc.team===null ? 'Any participant' : (sc.team||[]).length ? 'Your team: '+sc.team.length+' people' : 'No team assignment on file', sc.brands===null ? 'any supplier' : (sc.brands||[]).length ? sc.brands.length+' suppliers' : 'no brand assignment on file'].join(' · ');
  app.innerHTML = `<header class="mph"><div><h1>Manage Programs</h1><p>${E(who)}${sc.error?' · '+E(sc.error):''}</p></div>
    <div class="acts"><button class="btn primary" data-act="new">Create Program</button>${(S.templates||[]).length?`<select id="tplSel" class="btn sm outline" aria-label="Create from a template"><option value="">From a template…</option>${S.templates.map(t=>`<option value="${t.id}">${E(t.name)}</option>`).join('')}</select>`:''}</div></header>
    ${S.msg?`<div class="msg ${S.msg.cls}">${E(S.msg.t)}</div>`:''}
    <div class="mptabs" role="tablist">${TABS.filter(([k])=>k!=='create').map(([k,l])=>`<button role="tab" data-tab="${k}" aria-pressed="${tab===k}">${l}<span>${counts[k]||0}</span></button>`).join('')}</div>
    ${tab==='templates' ? `<ul class="mpl">${(S.templates||[]).map(t=>`<li class="mpr"><div><div class="t">${E(t.name)}</div><div class="m"><span>Saved by <b>${E(t.owner_name||'')}</b></span><span>${E(fmtDate(t.created_at))}</span></div></div><div class="a"><button class="btn sm" data-act="from-tpl" data-id="${t.id}">Create From Template</button><button class="btn sm outline" data-act="del-tpl" data-id="${t.id}">Remove</button></div></li>`).join('') || '<li class="mpempty">No templates yet. Save one from a program\'s review page.</li>'}</ul>`
    : `<ul class="mpl">${S.programs.filter(p=>inTab(p,tab)).map(rowHtml).join('') || `<li class="mpempty">${tab==='awaiting'?'Nothing is awaiting approval.':tab==='test'?'No test programs. Create one with "Test Program" ticked to try the whole workflow safely.':'Nothing here yet.'}</li>`}</ul>`}`;
  S.msg = null;
}

// ---- definition helpers
function blank(){
  return { v:1, title:'', fullName:'', kind:'incentive', audience:['rep'], supplier:'', description:'', docUrl:'', docName:'', isTest:true,
    participants:{ mode:'individual', reps:[], associates:[], teams:[], resolved:{reps:[], associates:[]}, accountFilter:{premise:'any', territory:'any', accounts:[]}, baseMode:'fixed', accountBase:{} },
    products:{ include:[], exclude:[], dynamic:false, resolved:[] },
    period:{ type:'fixed', start:'', end:'', rollingDays:90, baseline:{mode:'none', start:'', end:''}, nonBuyDays:90, creditEvent:'sales_month' },
    objectives:[], logic:'all' };
}
function uid(){ return 'o'+Math.random().toString(36).slice(2,8); }
function newObjective(){ return { id:uid(), label:'', metric:'buying_accounts', minSkus:1, minCases:0, premise:'any', scope:'individual', logic:'required', requires:'', followOn:{start:'',end:''}, comparison:{start:'',end:''}, merch:{category:'any', needBeforeAfter:false}, goal:{type:'fixed', value:'', pct:'', rounding:'', perRep:{}} }; }
function metricRow(m){ return METRICS.find(x=>x[0]===m) || METRICS[0]; }
function books(){ const H = window.HUB_ACCOUNTS || (typeof HUB_ACCOUNTS!=='undefined' ? HUB_ACCOUNTS : null); return H && H.reps ? H.reps : {}; }
function repBook(name){ const B = books(); if(B[name]) return B[name]; const hit = window.kdhMatchName ? window.kdhMatchName(name, Object.keys(B)) : null; return hit ? B[hit] : []; }
function areaOf(a){ let ar = a.area||a.rawArea||''; if(ar==='Sales'||!ar) ar = a.county||''; return ar; }
function filterAccounts(rows, f){
  return rows.filter(a=>{
    if(f.premise && f.premise!=='any' && String(a.prem||'').toLowerCase().slice(0,2)!==f.premise.slice(0,2)) return false;
    const ar = areaOf(a);
    if(f.territory==='core' && !CORE.includes(ar)) return false;
    if(f.territory==='southern' && !SOUTH.includes(ar)) return false;
    if(Array.isArray(f.territory) && f.territory.length && !f.territory.includes(ar)) return false;
    if(f.accounts && f.accounts.length && !f.accounts.map(String).includes(String(a.n))) return false;
    return true;
  });
}
// people a manager may put in: the scope's team (null = everyone)
function allowedPeople(kind){
  const people = (S.people||[]).filter(p=>p.kind===kind);
  const team = S.scope && S.scope.team;
  if(team===null || S.scope.admin) return people.map(p=>Object.assign({ok:true}, p));
  const keys = (team||[]).map(n=>window.kdhNameKey ? window.kdhNameKey(n) : n.toLowerCase());
  return people.map(p=>Object.assign({ok: keys.includes(window.kdhNameKey ? window.kdhNameKey(p.name) : p.name.toLowerCase())}, p));
}
function resolveParticipants(def){
  const P = def.participants; const reps = allowedPeople('rep'); const assoc = allowedPeople('associate');
  let r = [];
  if(P.mode==='all') r = reps.filter(p=>p.ok).map(p=>p.name);
  else if(P.mode==='team') r = reps.filter(p=>p.ok && P.teams.some(t=>(p.reports_to||'').toLowerCase()===t.toLowerCase() || (window.kdhMatchName && window.kdhMatchName(t, [p.reports_to||'']))) ).map(p=>p.name);
  else r = P.reps.slice();
  const a = def.audience.includes('associate') ? (P.mode==='all' ? assoc.filter(p=>p.ok).map(p=>p.name) : P.associates.slice()) : [];
  P.resolved = { reps: def.audience.includes('rep') ? r : [], associates: a };
  // the fixed account base: resolved per rep now (frozen at submit; dynamic programs re-resolve on the page)
  P.accountBase = {};
  P.resolved.reps.forEach(name=>{ P.accountBase[name] = filterAccounts(repBook(name), P.accountFilter).map(a=>a.n); });
  return P.resolved;
}
function resolveProductsDef(def){ if(!S.products) return []; def.products.resolved = KP.resolveProducts(def.products, S.products); return def.products.resolved; }
function plainObjective(o){
  const m = metricRow(o.metric); const g = o.goal||{};
  let s = (o.label||m[1]) + ': ' + m[1].toLowerCase();
  if(['buying_accounts','new_buyers'].includes(o.metric) && Number(o.minSkus)>1) s += ' with '+o.minSkus+'+ different qualifying SKUs';
  if(Number(o.minCases)>0) s += ', '+o.minCases+'+ cases each';
  if(o.premise && o.premise!=='any') s += ' at '+(o.premise==='off'?'off':'on')+'-premise accounts';
  if(['retention','growth'].includes(o.metric)) s += o.comparison.start ? ', compared with '+fmtDate(o.comparison.start)+' – '+fmtDate(o.comparison.end) : ' — comparison period NOT SET';
  if(['merch','photos'].includes(o.metric)) s += ' ('+(MERCH_CATS.find(c=>c[0]===(o.merch||{}).category)||MERCH_CATS[0])[1].toLowerCase()+(o.merch&&o.merch.needBeforeAfter?', before-and-after photos':'')+')';
  s += '. Goal: ' + (g.type==='pct_of_base' ? (g.pct?Math.round(g.pct*100)+'% of eligible accounts'+(g.rounding?' (rounded '+g.rounding+')':' — ROUNDING NOT SET'):'percent not set') : g.type==='individual' ? Object.keys(g.perRep||{}).length+' individual goals' : g.type==='house' ? 'house goal '+(g.value||'not set') : (g.value!=='' && g.value!=null ? g.value+' '+m[2] : (o.metric==='growth' ? 'positive growth' : 'not set')));
  if(o.scope==='house') s += ' (house / team condition)';
  if(o.logic==='alternative') s += '. One of the alternatives is enough';
  if(o.logic==='prerequisite') s += '. Must be met before the objectives it unlocks count';
  if(o.requires) s += '. Unlocked by objective '+o.requires;
  if(o.followOn && o.followOn.start) s += '. Follow-on period '+fmtDate(o.followOn.start)+' – '+fmtDate(o.followOn.end);
  return s+'.';
}
function validate(def){
  const errs = {}; const add = (k,m)=>{ (errs[k]=errs[k]||[]).push(m); };
  if(!def.title.trim()) add(1,'A short display title is required.');
  if(!def.audience.length) add(1,'Pick at least one audience.');
  if(!def.participants.resolved.reps.length && !def.participants.resolved.associates.length) add(2,'No participants are selected.');
  if(def.audience.includes('associate') && def.participants.resolved.associates.length) add(2,'Sales associates have no account assignments on this site, so their objectives cannot be scored per account yet (the draft stays saved).');
  const needProducts = def.objectives.some(o=>!['units','growth','merch','photos'].includes(o.metric));
  if(needProducts && !def.products.resolved.length) add(3,'This program\'s objectives need qualifying products; none are selected.');
  if(!def.period.start || !def.period.end) add(4,'Start and end dates are required.'); else if(def.period.end < def.period.start) add(4,'The end date is before the start date.');
  if(!def.objectives.length) add(4,'Add at least one objective.');
  def.objectives.forEach((o,i)=>{
    if(['retention','growth'].includes(o.metric) && !(o.comparison.start && o.comparison.end)) add(4,'Objective '+(i+1)+' ('+metricRow(o.metric)[1]+') needs an explicit comparison period.');
    const g = o.goal||{};
    if(g.type==='fixed' && (g.value==='' || g.value==null) && o.metric!=='growth') add(5,'Objective '+(i+1)+': set a goal.');
    if(g.type==='pct_of_base' && (!g.pct || !g.rounding)) add(5,'Objective '+(i+1)+': a percentage goal needs the percentage AND a rounding rule (whole accounts).');
    if(g.type==='individual' && def.participants.resolved.reps.some(n=>g.perRep[n]==null || g.perRep[n]==='')) add(5,'Objective '+(i+1)+': every participant needs an individual goal.');
    if(g.type==='house' && !g.value) add(5,'Objective '+(i+1)+': set the house goal.');
  });
  return errs;
}

// ---- wizard
async function openEdit(id, step){
  await Promise.all([loadScope(), loadPeople(), loadProducts()]);
  S.step = Math.min(7, Math.max(1, Number(step)||1));
  if(id && (!S.prog || S.prog.id!==id)){
    let p = S.programs.find(x=>x.id===id); if(!p){ await loadLists(); p = S.programs.find(x=>x.id===id); } if(!p){ S.msg = {cls:'err', t:'Program not found.'}; go({view:'list'}); return; }
    S.prog = p; const v = latestVersion(p); S.def = Object.assign(blank(), JSON.parse(JSON.stringify(v.definition)));
    S.def.participants = Object.assign(blank().participants, S.def.participants||{}); S.def.products = Object.assign(blank().products, S.def.products||{}); S.def.period = Object.assign(blank().period, S.def.period||{});
    const f = await D.rest('program_finance?select=terms&version_id=eq.'+encodeURIComponent((await versionId(p, v.version))||'')); S.fin = f.ok && f.data && f.data[0] ? f.data[0].terms : {items:[], notes:''};
    S.versionStatus = v.status;
  } else if(!id && !S.prog){ S.def = S.def || blank(); S.fin = S.fin || {items:[], notes:''}; S.versionStatus = 'draft'; }
  S.dirty = false; renderWizard();
}
async function versionId(p, version){ const r = await D.rest('program_versions?select=id&program_id=eq.'+p.id+'&version=eq.'+version); return r.ok && r.data && r.data[0] ? r.data[0].id : null; }
async function save(silent){
  if(S.saving) return; S.saving = true;
  resolveParticipants(S.def); resolveProductsDef(S.def);
  try{
    const res = await D.rpc('kdh_program_save', {p:{ id:S.prog ? S.prog.id : null, definition:S.def, finance:S.fin }});
    S.lastSaved = new Date(); S.dirty = false;
    await loadLists(); S.prog = S.programs.find(x=>x.id===res.id) || S.prog; S.versionStatus = 'draft';
    if(!silent) S.msg = {cls:'ok', t:'Draft saved (version '+res.version+').'};
    return res;
  }catch(e){ S.msg = {cls:'err', t:'Could not save: '+e.message}; return null; }
  finally{ S.saving = false; }
}
function field(label, inner, hint, err){ return `<div class="f${err?' bad':''}"><label>${label}</label>${inner}${hint?`<div class="hint">${hint}</div>`:''}${err?`<div class="err">${E(err)}</div>`:''}</div>`; }
function stepHtml(n, errs){
  const d = S.def; const P = d.participants; const err = k=>(errs[n]||[]);
  if(n===1) return `<h2>Basics</h2><p class="lead">What the program is called and who it is for.</p>
    ${field('Short display title', `<input type="text" id="f_title" value="${E(d.title)}" maxlength="80" placeholder="e.g. Lytt 3-SKU Push">`, 'Shown on cards. A test program is labelled TEST automatically.', err()[0] && /title/.test(err()[0]) ? err()[0] : '')}
    ${field('Full official name', `<input type="text" id="f_full" value="${E(d.fullName)}" maxlength="160" placeholder="As it appears on the supplier document">`)}
    <div class="row2">${field('Program type', `<div class="radios"><label><input type="radio" name="kind" value="incentive" ${d.kind==='incentive'?'checked':''}>Incentive</label><label><input type="radio" name="kind" value="mpo" ${d.kind==='mpo'?'checked':''}>MPO</label></div>`, 'Incentives list on the Programs page; MPOs render on the Off- / On-Premise MPO trackers (by the account premise chosen in step 2).')}
    ${field('Audience', `<div class="radios"><label><input type="checkbox" id="aud_rep" ${d.audience.includes('rep')?'checked':''}>Sales Reps</label><label><input type="checkbox" id="aud_assoc" ${d.audience.includes('associate')?'checked':''}>Sales Associates</label></div>`, 'A program may include both.', err().find(x=>/audience/.test(x)))}</div>
    ${field('Supplier / brand association', `<select id="f_sup"><option value="">— None —</option>${supplierOptions(d.supplier)}</select>`, S.scope && S.scope.brands!==null && !S.scope.admin ? 'Your brand scope: '+(S.scope.brands||[]).join(', ') : '')}
    ${field('Description', `<textarea id="f_desc" maxlength="1000" placeholder="One or two sentences a rep would read on the card.">${E(d.description)}</textarea>`)}
    <div class="row2">${field('Supporting program document (link)', `<input type="url" id="f_doc" value="${E(d.docUrl)}" placeholder="https://…">`, 'A link to the supplier deck or sheet. File upload is not available in this version.')}${field('Document name', `<input type="text" id="f_docn" value="${E(d.docName)}" placeholder="October 2026 Rewards Deck">`)}</div>
    <div class="f"><label class="chk"><input type="checkbox" id="f_test" ${d.isTest?'checked':''}> Test Program — labelled "TEST — Not an Active Incentive" everywhere, visible only in manager preview, never in payouts, recaps or participant notices.</label></div>`;
  if(n===2){
    const reps = allowedPeople('rep'), assoc = allowedPeople('associate');
    const groups = {}; reps.forEach(p=>{ const k = p.reports_to||'No manager on file'; (groups[k]=groups[k]||[]).push(p); });
    const teams = Object.keys(groups).filter(k=>k!=='No manager on file').sort();
    const picker = (list, chosen, idp, grouped)=>`<div class="pick" id="${idp}"><div class="ps"><input type="search" placeholder="Search names" aria-label="Search" data-pick="${idp}"></div><div class="pl">${
      (grouped ? Object.keys(groups).sort().map(g=>`<div class="pg">${E(g)}</div>`+groups[g].map(p=>pickRow(p, chosen, idp)).join('')) : list.map(p=>pickRow(p, chosen, idp))).join('')}</div></div>`;
    const pickRow = (p, chosen, idp)=>`<label class="chk${p.ok?'':' dis'}" data-name="${E(p.name.toLowerCase())}"><input type="checkbox" data-pick-item="${idp}" value="${E(p.name)}" ${chosen.includes(p.name)?'checked':''} ${p.ok?'':'disabled'}> ${E(p.name)}${p.title?` <small>· ${E(p.title)}</small>`:''}${p.ok?'':' <small>(outside your scope)</small>'}</label>`;
    const base = resolveParticipants(d); const nAcc = Object.values(P.accountBase).reduce((t,a)=>t+a.length,0);
    const HB2 = window.HUB_ACCOUNTS || (typeof HUB_ACCOUNTS!=='undefined' ? HUB_ACCOUNTS : null); const areas = (HB2 && HB2.areas) || CORE.concat(SOUTH);
    return `<h2>Participants & Accounts</h2><p class="lead">Who is in the program and which of their accounts count. Only people inside your scope can be chosen${S.scope.team!==null && !S.scope.admin && !(S.scope.team||[]).length ? ' — you have no team or brand assignment on file, so nobody can be added yet (ask Gavin)' : ''}.</p>
      ${field('Select by', `<div class="radios"><label><input type="radio" name="pmode" value="individual" ${P.mode==='individual'?'checked':''}>Individuals</label><label><input type="radio" name="pmode" value="team" ${P.mode==='team'?'checked':''}>Team / district</label><label><input type="radio" name="pmode" value="all" ${P.mode==='all'?'checked':''}>All authorized participants</label></div>`)}
      ${P.mode==='team' ? field('Teams', `<div class="radios">${teams.map(t=>`<label><input type="checkbox" data-team="${E(t)}" ${P.teams.includes(t)?'checked':''}>${E(t)}</label>`).join('')||'<span class="muted">No teams on file</span>'}</div>`) : ''}
      ${P.mode==='individual' && d.audience.includes('rep') ? field('Sales reps', picker(reps, P.reps, 'pickReps', true)) : ''}
      ${d.audience.includes('associate') ? (assoc.length ? (P.mode==='individual' ? field('Sales associates', picker(assoc, P.associates, 'pickAssoc', false), 'Associates have NO account assignments on this site: their objectives can be saved but not scored per account yet.') : '') : `<div class="f"><div class="lbl">Sales associates</div><div class="hint">No sales-associate accounts are on the allow list, and the site has no associate → account mapping. The draft can be saved; the mapping is a missing piece, not something to invent.</div></div>`) : ''}
      <div class="sumline"><span>Participants: <b>${base.reps.length} reps${base.associates.length?' + '+base.associates.length+' associates':''}</b></span><span>Eligible accounts: <b>${nAcc}</b> (from the current account books)</span></div>
      <h2 style="margin-top:18px">Eligible accounts</h2>
      <div class="row3">${field('Premise', `<select id="af_prem"><option value="any" ${P.accountFilter.premise==='any'?'selected':''}>Any</option><option value="off" ${P.accountFilter.premise==='off'?'selected':''}>Off-premise</option><option value="on" ${P.accountFilter.premise==='on'?'selected':''}>On-premise</option></select>`, d.kind==='mpo' ? 'An MPO renders on the tracker of this premise (both when Any).' : '')}
      ${field('Territory', `<select id="af_terr"><option value="any" ${P.accountFilter.territory==='any'?'selected':''}>Any</option><option value="core" ${P.accountFilter.territory==='core'?'selected':''}>Core Market (Bergen, Passaic, Passaic-FF, Morris 1, Morris 3, Sussex)</option><option value="southern" ${P.accountFilter.territory==='southern'?'selected':''}>Southern District (Essex, Hudson, Union)</option><option value="areas" ${Array.isArray(P.accountFilter.territory)?'selected':''}>Pick areas…</option></select>`)}
      ${field('Account type', `<select id="af_type"><option value="any">Any (premise above)</option></select>`, 'The account books carry premise only; draft / package service type is not on them yet.')}</div>
      ${Array.isArray(P.accountFilter.territory) ? field('Areas', `<div class="radios">${areas.map(a=>`<label><input type="checkbox" data-area="${E(a)}" ${P.accountFilter.territory.includes(a)?'checked':''}>${E(a)}</label>`).join('')}</div>`) : ''}
      ${field('Specific accounts (optional)', `<textarea id="af_accts" placeholder="Customer numbers, one per line or comma-separated — or paste a CSV column">${E((P.accountFilter.accounts||[]).join('\n'))}</textarea>`, 'Validated against the selected participants\' books on Next. Unmatched numbers are listed, never added.' + (P.accountFilter.unmatched && P.accountFilter.unmatched.length ? ' Unmatched: '+P.accountFilter.unmatched.join(', ') : ''))}
      ${field('Account base', `<div class="radios"><label><input type="radio" name="bmode" value="fixed" ${P.baseMode!=='dynamic'?'checked':''}>Fixed at activation (default)</label><label><input type="radio" name="bmode" value="dynamic" ${P.baseMode==='dynamic'?'checked':''}>Follows the route as it changes</label></div>`, 'Fixed = the account list is frozen when the program is submitted and approved; later reassignments do not move credit.')}
      ${err().map(x=>`<div class="err">${E(x)}</div>`).join('')}`;
  }
  if(n===3){
    const pr = d.products; const list = resolveProductsDef(d);
    const famSet = {}, supSet = {}, pkgSet = {}, brandSet = {};
    (S.products.list||[]).forEach(p=>{ if(p.family) famSet[p.family]=1; if(p.supplier) supSet[p.supplier]=1; if(p.package) pkgSet[p.package]=1; if(p.brand) brandSet[p.brand]=1; });
    const selRow = (sel, i, kind)=>`<div class="sel-row" data-sel="${kind}" data-i="${i}"><select data-sel-type="${kind}" data-i="${i}"><option value="sku" ${sel.type==='sku'?'selected':''}>Individual SKU</option><option value="family" ${sel.type==='family'?'selected':''}>Brand family</option><option value="brand" ${sel.type==='brand'?'selected':''}>Brand</option><option value="supplier" ${sel.type==='supplier'?'selected':''}>Supplier</option><option value="package" ${sel.type==='package'?'selected':''}>Package type</option><option value="draft" ${sel.type==='draft'?'selected':''}>Draft / package</option></select>
      ${sel.type==='draft' ? `<select data-sel-val="${kind}" data-i="${i}"><option value="draft" ${sel.value==='draft'?'selected':''}>Draft only</option><option value="package" ${sel.value==='package'?'selected':''}>Package only</option></select>`
        : `<input type="text" list="dl_${sel.type}" data-sel-val="${kind}" data-i="${i}" value="${E(sel.value||'')}" placeholder="${sel.type==='sku'?'Product # or name':'Type to search'}">`}
      <button type="button" class="x" data-sel-del="${kind}" data-i="${i}" aria-label="Remove">×</button></div>`;
    const dls = `<datalist id="dl_family">${Object.keys(famSet).sort().map(x=>`<option value="${E(x)}">`).join('')}</datalist><datalist id="dl_supplier">${Object.keys(supSet).sort().map(x=>`<option value="${E(x)}">`).join('')}</datalist><datalist id="dl_package">${Object.keys(pkgSet).sort().map(x=>`<option value="${E(x)}">`).join('')}</datalist><datalist id="dl_brand">${Object.keys(brandSet).sort().map(x=>`<option value="${E(x)}">`).join('')}</datalist><datalist id="dl_sku">${(S.products.list||[]).slice(0,2000).map(p=>`<option value="${E(p.id)}">${E(p.name)}</option>`).join('')}</datalist>`;
    const q = (S.pq||'').toLowerCase();
    const shown = list.filter(p=>!q || (p.name+' '+p.id).toLowerCase().includes(q));
    return `<h2>Products</h2><p class="lead">Which products earn credit. Each include row is one selection; the list is every product that matches any of them, minus the exclusions.</p>${dls}
      <div class="f"><div class="lbl">Include</div><div class="sel-rows">${pr.include.map((s,i)=>selRow(s,i,'include')).join('')}</div><div style="margin-top:8px"><button class="btn sm outline" data-act="add-sel" data-kind="include">Add selection</button></div></div>
      <div class="f"><div class="lbl">Exclude</div><div class="sel-rows">${pr.exclude.map((s,i)=>selRow(s,i,'exclude')).join('')}</div><div style="margin-top:8px"><button class="btn sm outline" data-act="add-sel" data-kind="exclude">Add exclusion</button></div></div>
      ${S.scope && S.scope.brands!==null && !S.scope.admin ? `<div class="hint">Your brand scope: ${E((S.scope.brands||[]).join(', ')||'none on file')}. The server refuses a submission with products outside it.</div>` : ''}
      <div class="f" style="margin-top:14px"><label class="chk"><input type="checkbox" id="pr_dyn" ${pr.dynamic?'checked':''}> Dynamic list — follow later product-master changes (default off: the resolved list below is saved with the approved version).</label></div>
      <div class="sumline"><span>Resolved qualifying products: <b>${list.length}</b></span>${list.length?`<span>Suppliers: <b>${[...new Set(list.map(p=>p.supplier))].slice(0,4).join(', ')}${[...new Set(list.map(p=>p.supplier))].length>4?' …':''}</b></span>`:''}</div>
      ${list.length ? `<div class="f" style="margin-top:8px"><input type="search" id="pq" value="${E(S.pq||'')}" placeholder="Search the resolved list"></div><ul class="plist">${shown.slice(0,300).map(p=>`<li><span>${E(p.name)}</span><span>#${E(p.id)} · ${E(p.supplier)}</span></li>`).join('')}${shown.length>300?`<li><span class="muted">… ${shown.length-300} more</span></li>`:''}</ul>` : '<div class="mpempty">No products resolved yet.</div>'}
      ${err().map(x=>`<div class="err">${E(x)}</div>`).join('')}`;
  }
  if(n===4){
    const pe = d.period; const bl = pe.baseline||{};
    const objs = d.objectives.map((o,i)=>{
      const m = metricRow(o.metric);
      const others = d.objectives.filter(x=>x.id!==o.id);
      return `<div class="obj" data-obj="${o.id}"><div class="obj-h"><b>Objective ${i+1}</b><button class="btn sm outline" data-act="del-obj" data-id="${o.id}">Remove</button></div>
        <div class="row2">${field('Label', `<input type="text" data-o="${o.id}" data-k="label" value="${E(o.label)}" placeholder="${E(m[1])}">`)}
        ${field('Measure', `<select data-o="${o.id}" data-k="metric">${METRICS.map(x=>`<option value="${x[0]}" ${o.metric===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select>`, m[3])}</div>
        <div class="row3">
        ${['buying_accounts','new_buyers'].includes(o.metric) ? field('Distinct SKUs required', `<input type="number" min="1" max="20" data-o="${o.id}" data-k="minSkus" value="${E(o.minSkus||1)}">`) : ''}
        ${['buying_accounts','new_buyers','units'].includes(o.metric) ? field('Minimum cases per account', `<input type="number" min="0" step="0.5" data-o="${o.id}" data-k="minCases" value="${E(o.minCases||0)}">`, '0 = any net purchase') : ''}
        ${field('Premise', `<select data-o="${o.id}" data-k="premise"><option value="any" ${o.premise==='any'?'selected':''}>Any eligible account</option><option value="off" ${o.premise==='off'?'selected':''}>Off-premise only</option><option value="on" ${o.premise==='on'?'selected':''}>On-premise only</option></select>`)}
        ${field('Counts for', `<select data-o="${o.id}" data-k="scope"><option value="individual" ${o.scope==='individual'?'selected':''}>Each participant</option><option value="house" ${o.scope==='house'?'selected':''}>House / team total</option></select>`)}
        </div>
        ${['retention','growth'].includes(o.metric) ? `<div class="row2">${field('Comparison period start', `<input type="date" data-o="${o.id}" data-k="comparison.start" value="${E(o.comparison.start)}">`)}${field('Comparison period end', `<input type="date" data-o="${o.id}" data-k="comparison.end" value="${E(o.comparison.end)}">`, o.metric==='growth' ? '"Positive growth" means more net cases than this period. Say which months.' : 'The accounts that bought here are the ones to retain.')}</div>` : ''}
        ${['merch','photos'].includes(o.metric) ? `<div class="row2">${field('Record type', `<select data-o="${o.id}" data-k="merch.category">${MERCH_CATS.map(c=>`<option value="${c[0]}" ${(o.merch||{}).category===c[0]?'selected':''}>${c[1]}</option>`).join('')}</select>`)}<div class="f"><label class="chk"><input type="checkbox" data-o="${o.id}" data-k="merch.needBeforeAfter" ${(o.merch||{}).needBeforeAfter?'checked':''}> Before-and-after photos required</label><div class="hint">Records and photos are counted as recorded. No verification process exists yet, so this objective cannot be scored as satisfied.</div></div></div>` : ''}
        <details class="adv"><summary>How this objective combines with the others</summary><div class="row2">
          ${field('Logic', `<select data-o="${o.id}" data-k="logic"><option value="required" ${o.logic==='required'?'selected':''}>Required (all required objectives must be met)</option><option value="alternative" ${o.logic==='alternative'?'selected':''}>Alternative (any one alternative qualifies)</option><option value="prerequisite" ${o.logic==='prerequisite'?'selected':''}>Prerequisite (unlocks other objectives)</option></select>`)}
          ${field('Unlocked by', `<select data-o="${o.id}" data-k="requires"><option value="">— Nothing —</option>${others.map(x=>`<option value="${x.id}" ${o.requires===x.id?'selected':''}>${E(x.label||metricRow(x.metric)[1])}</option>`).join('')}</select>`, 'A qualifier that must be met first (e.g. 5 new placements before cases pay).')}</div>
          <div class="row2">${field('Follow-on period start (optional)', `<input type="date" data-o="${o.id}" data-k="followOn.start" value="${E(o.followOn.start)}">`)}${field('Follow-on period end', `<input type="date" data-o="${o.id}" data-k="followOn.end" value="${E(o.followOn.end)}">`, 'A later window for this objective only (a rebuy bonus).')}</div></details>
        <p class="plain">${E(plainObjective(o))}</p></div>`;
    }).join('');
    return `<h2>Dates & Qualification Rules</h2><p class="lead">When credit can be earned and what earns it. The sales record is monthly (net cases by product, account and month), so every window is measured in whole months; the data says so on each card.</p>
      <div class="row3">${field('Period type', `<select id="pe_type"><option value="fixed" ${pe.type==='fixed'?'selected':''}>Fixed start / end dates</option><option value="calendar" ${pe.type==='calendar'?'selected':''}>Calendar month(s)</option><option value="rolling" ${pe.type==='rolling'?'selected':''}>Rolling window (continuous)</option></select>`, pe.type==='rolling' ? 'A rolling window re-measures the last N days at every data load; it is NOT the same as a fixed 90-day promotion.' : '')}
      ${field('Start', `<input type="date" id="pe_start" value="${E(pe.start)}">`)}${field('End', `<input type="date" id="pe_end" value="${E(pe.end)}">`)}</div>
      ${pe.type==='rolling' ? field('Rolling window (days)', `<input type="number" id="pe_roll" min="30" max="365" value="${E(pe.rollingDays||90)}">`, 'Saved; computed as whole months ending at the last loaded sales month.') : ''}
      <div class="row3">${field('Non-buy window (days)', `<input type="number" id="pe_nonbuy" min="30" max="730" value="${E(pe.nonBuyDays||90)}">`, '"New" = nothing bought this many days before the period (whole months).')}
      ${field('Baseline period', `<select id="bl_mode"><option value="none" ${bl.mode==='none'||!bl.mode?'selected':''}>None</option><option value="prior_90" ${bl.mode==='prior_90'?'selected':''}>90 days before the start</option><option value="prior_3mo" ${bl.mode==='prior_3mo'?'selected':''}>The 3 months before</option><option value="last_year" ${bl.mode==='last_year'?'selected':''}>Same period last year</option><option value="custom" ${bl.mode==='custom'?'selected':''}>Custom dates</option></select>`, 'Used by retention / growth objectives that do not set their own comparison.')}
      ${field('Credit event', `<select id="pe_credit"><option value="sales_month">Sales month (monthly sales record)</option></select>`, 'The only event the data supports today: the month a net purchase is recorded. Invoice dates are not on the site.')}</div>
      ${bl.mode==='custom' ? `<div class="row2">${field('Baseline start', `<input type="date" id="bl_start" value="${E(bl.start)}">`)}${field('Baseline end', `<input type="date" id="bl_end" value="${E(bl.end)}">`)}</div>` : ''}
      <h2 style="margin-top:18px">Objectives</h2>
      ${objs || '<div class="mpempty">No objectives yet.</div>'}
      <div style="margin:8px 0 0"><button class="btn sm" data-act="add-obj">Add objective</button></div>
      ${err().map(x=>`<div class="err" style="margin-top:8px">${E(x)}</div>`).join('')}`;
  }
  if(n===5){
    const reps = d.participants.resolved.reps;
    const objs = d.objectives.map((o,i)=>{ const g = o.goal; const m = metricRow(o.metric);
      return `<div class="obj"><div class="obj-h"><b>${E(o.label||m[1])}</b><span class="tag">${E(m[2])}</span></div>
        ${field('Goal type', `<div class="radios"><label><input type="radio" name="gt_${o.id}" value="fixed" ${g.type==='fixed'?'checked':''}>Shared fixed goal</label><label><input type="radio" name="gt_${o.id}" value="individual" ${g.type==='individual'?'checked':''}>Individual goals</label>${['buying_accounts','new_buyers','retention','merch','photos'].includes(o.metric)?`<label><input type="radio" name="gt_${o.id}" value="pct_of_base" ${g.type==='pct_of_base'?'checked':''}>% of eligible accounts</label>`:''}<label><input type="radio" name="gt_${o.id}" value="house" ${g.type==='house'?'checked':''}>Team / house goal</label></div>`)}
        ${g.type==='fixed' ? field('Goal ('+m[2]+')', `<input type="number" min="0" step="any" data-g="${o.id}" data-k="value" value="${E(g.value)}" placeholder="${o.metric==='growth'?'blank = positive growth':''}">`, o.metric==='growth' ? 'Leave blank for "positive growth" (any net increase over the comparison period).' : '') : ''}
        ${g.type==='house' ? field('House goal ('+m[2]+', all participants together)', `<input type="number" min="0" step="any" data-g="${o.id}" data-k="value" value="${E(g.value)}">`, 'The team total shows on the manager view; each participant sees their own share.') : ''}
        ${g.type==='pct_of_base' ? `<div class="row2">${field('Percent of eligible accounts', `<input type="number" min="1" max="100" data-g="${o.id}" data-k="pctPercent" value="${E(g.pct?Math.round(g.pct*100):'')}">`)}${field('Rounding of a fractional target', `<select data-g="${o.id}" data-k="rounding"><option value="">— Choose —</option><option value="up" ${g.rounding==='up'?'selected':''}>Round up</option><option value="nearest" ${g.rounding==='nearest'?'selected':''}>Nearest (halves up)</option><option value="down" ${g.rounding==='down'?'selected':''}>Round down</option></select>`, 'Required: the page never rounds for you.')}</div>
          ${reps.slice(0,8).map(r=>{ const b = (d.participants.accountBase[r]||[]).length; const raw = (g.pct||0)*b; return `<div class="hint">${E(r)}: ${b} eligible accounts → ${raw.toFixed(1)}${g.rounding?' → '+(g.rounding==='up'?Math.ceil(raw):g.rounding==='down'?Math.floor(raw):Math.round(raw)):''}</div>`; }).join('')}${reps.length>8?`<div class="hint">… and ${reps.length-8} more</div>`:''}` : ''}
        ${g.type==='individual' ? `<table class="tbl"><thead><tr><th>Participant</th><th>Eligible accounts</th><th class="num">Goal (${E(m[2])})</th></tr></thead><tbody>${reps.concat(d.participants.resolved.associates).map(r=>`<tr><td>${E(r)}</td><td>${(d.participants.accountBase[r]||[]).length||'—'}</td><td class="num"><input type="number" min="0" step="any" data-g="${o.id}" data-k="perRep" data-rep="${E(r)}" value="${E(g.perRep[r]==null?'':g.perRep[r])}" style="width:110px;min-height:36px;border:1px solid var(--border-2);border-radius:8px;padding:0 8px;font:inherit;background:var(--surface);color:var(--text)"></td></tr>`).join('')}</tbody></table>` : ''}
        <p class="plain">${E(plainObjective(o))}</p></div>`; }).join('');
    return `<h2>Goals</h2><p class="lead">Default: a fixed individual goal over a fixed account base. A fractional account goal is never rounded silently.</p>${objs||'<div class="mpempty">Add objectives in step 4 first.</div>'}${err().map(x=>`<div class="err">${E(x)}</div>`).join('')}`;
  }
  if(n===6){
    const F = S.fin || {items:[], notes:''}; F.items = F.items||[];
    const rows = F.items.map((it,i)=>{ const o = d.objectives.find(x=>x.id===it.objectiveId); return `<div class="obj"><div class="obj-h"><b>Payout ${i+1}</b><button class="btn sm outline" data-act="del-fin" data-i="${i}">Remove</button></div>
      <div class="row3">${field('Applies to objective', `<select data-f="${i}" data-k="objectiveId"><option value="">— Whole program —</option>${d.objectives.map(x=>`<option value="${x.id}" ${it.objectiveId===x.id?'selected':''}>${E(x.label||metricRow(x.metric)[1])}</option>`).join('')}</select>`)}
      ${field('Payout kind', `<select data-f="${i}" data-k="kind"><option value="per_unit" ${it.kind==='per_unit'?'selected':''}>Per unit (case / placement / account)</option><option value="flat" ${it.kind==='flat'?'selected':''}>Flat amount when the goal is met</option><option value="tiered" ${it.kind==='tiered'?'selected':''}>Tiered thresholds</option><option value="package" ${it.kind==='package'?'selected':''}>Package-specific per-unit rates</option></select>`)}
      ${it.kind==='per_unit'||it.kind==='flat' ? field(it.kind==='flat'?'Amount ($)':'Rate ($ per unit)', `<input type="number" min="0" step="0.01" data-f="${i}" data-k="rate" value="${E(it.rate==null?'':it.rate)}">`) : ''}</div>
      ${it.kind==='tiered' ? field('Tiers (threshold → amount or rate, one per line: "10 → 300" or "90% → 300")', `<textarea data-f="${i}" data-k="tiersText">${E(it.tiersText||'')}</textarea>`, 'Saved as written; a tier is applied only when its threshold is a plain number or a percent of the objective goal.') : ''}
      ${it.kind==='package' ? field('Package rates (one per line: "6pk → 2.00")', `<textarea data-f="${i}" data-k="packagesText">${E(it.packagesText||'')}</textarea>`, 'Matched against the product package text.') : ''}
      <div class="row3">${field('Paid only when this objective is met (qualifier)', `<select data-f="${i}" data-k="qualifier"><option value="">— None —</option>${d.objectives.map(x=>`<option value="${x.id}" ${it.qualifier===x.id?'selected':''}>${E(x.label||metricRow(x.metric)[1])}</option>`).join('')}</select>`)}
      ${field('House condition', `<select data-f="${i}" data-k="houseEffect"><option value="" ${!it.houseEffect?'selected':''}>— None —</option><option value="half" ${it.houseEffect==='half'?'selected':''}>50% payout if the house goal is missed</option><option value="none" ${it.houseEffect==='none'?'selected':''}>No payout if the house goal is missed</option><option value="rate" ${it.houseEffect==='rate'?'selected':''}>Higher rate when house + individual are met</option></select>`)}
      ${it.houseEffect==='rate' ? field('Rate when both are met ($)', `<input type="number" min="0" step="0.01" data-f="${i}" data-k="rateBoth" value="${E(it.rateBoth==null?'':it.rateBoth)}">`) : ''}</div>
      ${field('Supplier billback terms (as provided)', `<input type="text" data-f="${i}" data-k="billback" value="${E(it.billback||'')}" placeholder="Leave blank unless the supplier stated them">`)}</div>`; }).join('');
    return `<h2>Financial Terms</h2><div class="money"><h3>Manager-only</h3><p class="lock">Participants never receive these fields: they are stored in a separate table the rep sign-in cannot read, and every participant-facing query, export and notice is built without them.</p></div>
      ${rows||'<div class="mpempty" style="margin-top:12px">No payout terms yet. A program can be approved without them (an MPO usually has none).</div>'}
      <div style="margin:8px 0 0"><button class="btn sm" data-act="add-fin">Add payout term</button></div>
      ${field('Notes for the approver', `<textarea id="fin_notes">${E(F.notes||'')}</textarea>`, 'Unclear supplier wording goes here (e.g. "Four Loko $1.00 rate: all cases or only after positive growth?") so it is decided, not guessed.')}`;
  }
  if(n===7) return previewHtml(errs);
  return '';
}
function supplierOptions(cur){ const sups = {}; (S.products && S.products.list||[]).forEach(p=>{ if(p.supplier) sups[p.supplier]=1; }); return Object.keys(sups).sort().map(s=>`<option value="${E(s)}" ${s===cur?'selected':''}>${E(s)}</option>`).join(''); }

function renderWizard(){
  const d = S.def; resolveParticipants(d); if(S.products) resolveProductsDef(d);
  const errs = validate(d);
  const n = S.step;
  app.innerHTML = `<header class="mph"><div><h1>${S.prog?'Edit Program':'Create Program'}</h1><p>${E(d.title||'Untitled')}${d.isTest?' · <span class="tag test">TEST</span>':''}${S.prog?' · version '+(latestVersion(S.prog)||{}).version+(S.prog.approved_version!=null?' (revision of approved v'+S.prog.approved_version+')':''):''}</p></div>
    <div class="acts"><a class="btn sm outline" href="#view=list">All Programs</a><button class="btn sm" data-act="save">Save Draft</button></div></header>
    ${S.msg?`<div class="msg ${S.msg.cls}">${E(S.msg.t)}</div>`:''}
    <div class="wz"><nav class="wzs" aria-label="Steps">${STEPS.map((s,i)=>`<button data-step="${i+1}" ${i+1===n?'aria-current="step"':''} class="${errs[i+1]?'bad':(i+1<n?'done':'')}"><i>${i+1}</i><span>${s}</span></button>`).join('')}</nav>
    <section class="wzp" id="wzp">${stepHtml(n, errs)}
      <div class="wzn"><div>${n>1?`<button class="btn outline" data-act="prev">Back</button>`:''}</div><div class="r"><span class="saved">${S.saving?'Saving…':S.lastSaved?'Saved '+S.lastSaved.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):S.dirty?'Unsaved changes':''}</span>${n<7?`<button class="btn primary" data-act="next">Next</button>`:''}</div></div></section></div>`;
  S.msg = null;
  if(n===7) fillPreview();
}
// read every field of the current step back into the definition
function collect(){
  const d = S.def; const $ = id => document.getElementById(id);
  if(S.step===1){ d.title = $('f_title').value.trim(); d.fullName = $('f_full').value.trim(); d.kind = document.querySelector('input[name=kind]:checked').value;
    d.audience = [$('aud_rep').checked?'rep':null, $('aud_assoc').checked?'associate':null].filter(Boolean); d.supplier = $('f_sup').value; d.description = $('f_desc').value.trim(); d.docUrl = $('f_doc').value.trim(); d.docName = $('f_docn').value.trim(); d.isTest = $('f_test').checked; }
  if(S.step===2){ const P = d.participants; P.mode = (document.querySelector('input[name=pmode]:checked')||{}).value||'individual';
    P.teams = [...document.querySelectorAll('[data-team]:checked')].map(x=>x.dataset.team);
    if(document.getElementById('pickReps')) P.reps = [...document.querySelectorAll('[data-pick-item=pickReps]:checked')].map(x=>x.value);
    if(document.getElementById('pickAssoc')) P.associates = [...document.querySelectorAll('[data-pick-item=pickAssoc]:checked')].map(x=>x.value);
    P.accountFilter.premise = $('af_prem').value; const t = $('af_terr').value; P.accountFilter.territory = t==='areas' ? ([...document.querySelectorAll('[data-area]:checked')].map(x=>x.dataset.area)) : t;
    const raw = $('af_accts').value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);
    P.accountFilter.accounts = raw; P.baseMode = (document.querySelector('input[name=bmode]:checked')||{}).value||'fixed';
    resolveParticipants(d);
    if(raw.length){ const known = new Set(); P.resolved.reps.forEach(r=>repBook(r).forEach(a=>known.add(String(a.n)))); P.accountFilter.unmatched = raw.filter(x=>!known.has(String(x))); P.accountFilter.accounts = raw.filter(x=>known.has(String(x))); } else P.accountFilter.unmatched = [];
    resolveParticipants(d); }
  if(S.step===3){ d.products.dynamic = !!(document.getElementById('pr_dyn')||{}).checked; }
  if(S.step===4){ const pe = d.period; pe.type = $('pe_type').value; pe.start = $('pe_start').value; pe.end = $('pe_end').value; if($('pe_roll')) pe.rollingDays = Number($('pe_roll').value)||90; pe.nonBuyDays = Number($('pe_nonbuy').value)||90;
    pe.baseline = pe.baseline||{}; pe.baseline.mode = $('bl_mode').value; if($('bl_start')){ pe.baseline.start = $('bl_start').value; pe.baseline.end = $('bl_end').value; }
    if(pe.baseline.mode!=='custom' && pe.baseline.mode!=='none' && pe.start){ const s = new Date(pe.start+'T00:00:00'); let bs, be; if(pe.baseline.mode==='prior_90'){ be = new Date(s); be.setDate(be.getDate()-1); bs = new Date(s); bs.setDate(bs.getDate()-90); } else if(pe.baseline.mode==='prior_3mo'){ be = new Date(s.getFullYear(), s.getMonth(), 0); bs = new Date(s.getFullYear(), s.getMonth()-3, 1); } else { const e = new Date(pe.end+'T00:00:00'); bs = new Date(s.getFullYear()-1, s.getMonth(), s.getDate()); be = new Date(e.getFullYear()-1, e.getMonth(), e.getDate()); } pe.baseline.start = iso(bs); pe.baseline.end = iso(be); }
    d.objectives.forEach(o=>{ document.querySelectorAll(`[data-o="${o.id}"]`).forEach(el=>{ const k = el.dataset.k; const v = el.type==='checkbox' ? el.checked : el.value; if(k.includes('.')){ const [a,b] = k.split('.'); o[a] = o[a]||{}; o[a][b] = v; } else o[k] = (k==='minSkus'||k==='minCases') ? Number(v) : v; });
      if(['retention','growth'].includes(o.metric) && !o.comparison.start && pe.baseline && pe.baseline.start) { o.comparison = {start:pe.baseline.start, end:pe.baseline.end}; } }); }
  if(S.step===5){ d.objectives.forEach(o=>{ const g = o.goal; const r = document.querySelector(`input[name=gt_${o.id}]:checked`); if(r) g.type = r.value;
    document.querySelectorAll(`[data-g="${o.id}"]`).forEach(el=>{ const k = el.dataset.k; if(k==='perRep'){ g.perRep = g.perRep||{}; g.perRep[el.dataset.rep] = el.value===''?'':Number(el.value); } else if(k==='pctPercent'){ g.pct = el.value===''?'':Number(el.value)/100; } else g[k] = el.value===''?'':(k==='rounding'?el.value:Number(el.value)); }); }); }
  if(S.step===6){ const F = S.fin; F.items = F.items||[]; document.querySelectorAll('[data-f]').forEach(el=>{ const it = F.items[Number(el.dataset.f)]; if(!it) return; const k = el.dataset.k; it[k] = (k==='rate'||k==='rateBoth') ? (el.value===''?null:Number(el.value)) : el.value; }); F.notes = (document.getElementById('fin_notes')||{}).value||''; }
  S.dirty = true;
}

// ---- preview (step 7) and the review page share these
async function evaluateFor(def, reps){
  await loadProducts(); const out = {};
  for(const rep of reps){ try{ const h = await KP.hist(rep); const ctx = {products:S.products, hist:h, merch:{}}; out[rep] = KP.evaluate(def, rep, ctx); }catch(e){ out[rep] = {error:e.message, objectives:[]}; } }
  return out;
}
function supTag(s){ return `<span class="sup ${s}">${E(KP.SUPPORT_LABEL[s]||s)}</span>`; }
function payoutPreview(def, F, R){
  // projected payouts where the formula and data exist; never a profit figure, never a billback inference
  if(!F || !F.items || !F.items.length) return '<p class="muted">No payout terms entered.</p>';
  const lines = F.items.map((it,i)=>{
    const o = it.objectiveId ? R.objectives.find(x=>x.id===it.objectiveId) : (R.primary||R.objectives[0]);
    if(!o) return `<li>Payout ${i+1}: no objective to apply it to.</li>`;
    const qual = it.qualifier ? R.objectives.find(x=>x.id===it.qualifier) : null;
    const gated = qual && qual.status!=='achieved';
    if(o.support!=='supported') return `<li>${E(o.label)}: cannot project — ${E(KP.SUPPORT_LABEL[o.support])}.</li>`;
    let accrued = null, atGoal = null, how = '';
    if(it.kind==='per_unit' && it.rate!=null){ accrued = o.value*it.rate; atGoal = o.goal ? o.goal*it.rate : null; how = '$'+it.rate+' × '+fmt(o.value)+' '+o.unit; }
    else if(it.kind==='flat' && it.rate!=null){ accrued = o.status==='achieved' ? it.rate : 0; atGoal = it.rate; how = 'flat $'+it.rate+' when met'; }
    else how = it.kind+' terms are saved; no projection formula is applied in this version.';
    if(gated && accrued!=null){ how += ' · qualifier "'+(qual.label)+'" not met → $0 accrued'; accrued = 0; }
    if(it.houseEffect==='half') how += ' · 50% if the house goal is missed (house result not computed here)';
    return `<li><b>${E(o.label)}</b> — ${E(how)}${accrued!=null?`. Accrued from results to date: <b>$${fmt(accrued)}</b>`:''}${atGoal!=null?` · at goal: $${fmt(atGoal)}`:''} · final approved payout: not until closeout.</li>`;
  });
  return `<ul>${lines.join('')}</ul><p class="muted">Incentive payouts are not gross profit and no supplier billback is inferred from them.</p>`;
}
function previewHtml(errs){
  const d = S.def; const blockers = [].concat(...Object.values(errs));
  return `<h2>Preview & Submit</h2><p class="lead">What the approver and the participants will see. Results below use the site's current data.</p>
    <div class="pv" id="pvBody"><div class="kdh-state loading">Computing from the sales record…</div></div>
    ${blockers.length?`<div class="blockers" style="margin-top:14px"><h3>Fix before submitting</h3><ul>${blockers.map(b=>`<li>${E(b)}</li>`).join('')}</ul></div>`:''}
    <div id="pvWarn"></div>
    <div class="wzn"><div></div><div class="r"><button class="btn primary" data-act="submit" ${blockers.length?'disabled':''}>Submit for Approval</button></div></div>`;
}
async function fillPreview(){
  const d = S.def; const host = document.getElementById('pvBody'); if(!host) return;
  const reps = d.participants.resolved.reps.slice(0,3);
  const R = await evaluateFor(d, reps);
  const first = reps[0] ? R[reps[0]] : null;
  const scopeWhy = await (async()=>{ try{ return await D.rpc('kdh_program_scope_problem', {def:d}); }catch(e){ return null; } })();
  let warn = [];
  if(d.isTest) warn.push('TEST program: visible only to managers previewing a participant; never in payouts, recaps or participant notices.');
  (d.objectives||[]).forEach(o=>{ const r = first && first.objectives.find(x=>x.id===o.id); if(r && r.support!=='supported' && r.support!=='awaiting_data') warn.push((o.label||KP.metricLabel(o))+': '+KP.SUPPORT_LABEL[r.support]+(r.notes[0]?' — '+r.notes[0]:'')+(d.isTest?'':' · a real program cannot be published until this is resolved.')); });
  if(scopeWhy) warn.push('Scope: '+scopeWhy);
  host.innerHTML = previewBody(d, S.fin, R, reps, first);
  const w = document.getElementById('pvWarn');
  if(w) w.innerHTML = warn.length ? `<div class="warnings" style="margin-top:14px"><h3>Check before submitting</h3><ul>${warn.map(x=>`<li>${E(x)}</li>`).join('')}</ul></div>` : '';
  const hardBlock = scopeWhy || (!d.isTest && (d.objectives||[]).some(o=>{ const r = first && first.objectives.find(x=>x.id===o.id); return r && !['supported','awaiting_data'].includes(r.support); }));
  const b = document.querySelector('[data-act=submit]'); if(b && hardBlock) b.disabled = true;
}
function previewBody(d, F, R, reps, first){
  const idx = (window.KdhPrograms.state && 0) || null;
  const prodN = d.products.resolved.length; const accN = Object.values(d.participants.accountBase||{}).reduce((t,a)=>t+a.length,0);
  const HB = window.HUB_ACCOUNTS || (typeof HUB_ACCOUNTS!=='undefined' ? HUB_ACCOUNTS : {});
  const cov = first ? `Sales data through ${first.through?E(first.through):'—'}${first.loaded?' (loaded '+E(String(first.loaded).slice(0,10))+')':''}; account books as of ${E(HB.asOf||'—')}.` : 'No participant to compute for.';
  const examples = first && first.primary ? exampleRows(first.primary) : '';
  const card = first ? cardPreview(d, first) : '';
  const perRep = reps.map(r=>{ const x = R[r]; const o = x && x.primary; return `<tr><td>${E(r)}</td><td>${x?x.base:'—'}</td><td>${o?E(o.valueText):(x&&x.error?E(x.error):'—')}</td><td>${o?supTag(o.support):''}</td></tr>`; }).join('');
  return `<div class="pvcard"><h3>Plain-language rules</h3><ul>${KP.rulesText(d).map(x=>`<li>${E(x)}</li>`).join('')}</ul></div>
    <div class="pvcard"><h3>Scope</h3><dl class="kv"><dt>Participants</dt><dd>${d.participants.resolved.reps.length} reps${d.participants.resolved.associates.length?' + '+d.participants.resolved.associates.length+' associates':''}: ${E(d.participants.resolved.reps.concat(d.participants.resolved.associates).join(', '))}</dd><dt>Eligible accounts</dt><dd>${accN} (${d.participants.baseMode==='dynamic'?'follow the route':'fixed at activation'})</dd><dt>Qualifying products</dt><dd>${prodN}${prodN?': '+E(d.products.resolved.slice(0,5).map(p=>p.name).join('; '))+(prodN>5?' …':''):''}</dd><dt>Goals</dt><dd>${d.objectives.map(o=>E(plainObjective(o))).join('<br>')||'—'}</dd><dt>Data sources</dt><dd>${E(cov)} Merchandising objectives read the Hub's records (recorded, not verified).</dd></dl></div>
    <div class="pvcard"><h3>Calculated results (first ${reps.length} participant${reps.length===1?'':'s'})</h3><table class="tbl"><thead><tr><th>Participant</th><th>Eligible accounts</th><th>Primary objective</th><th>Support</th></tr></thead><tbody>${perRep||'<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table>${first?KP.objectivesTable(first,true):''}</div>
    ${examples?`<div class="pvcard"><h3>Example accounts (${E(reps[0])})</h3>${examples}</div>`:''}
    <div class="pvcard"><h3>Participant view (no financial information)</h3><div class="card-prev">${card}</div><p class="muted" style="margin-top:8px">The real card is drawn by the Programs page from the same definition. To see it there: Preview as this rep after approval.</p></div>
    <div class="money"><h3>Manager financial preview</h3><p class="lock">Managers only — never shown to participants.</p>${first?payoutPreview(d, F, first):'<p class="muted">—</p>'}</div>`;
}
function exampleRows(o){
  const c = o.credited.slice(0,3).map(a=>`<tr><td>${E(a.name)}</td><td><span class="tag ok">Counts</span></td><td>${E(a.lines?a.lines.map(l=>l.name).join(', '):(a.bought&&a.bought.length?a.skus+' qualifying SKU'+(a.skus===1?'':'s')+(a.cases?', '+fmt(a.cases)+' cases':''):(a.note||'')))}</td></tr>`);
  const s = o.open.slice(0,3).map(a=>`<tr><td>${E(a.name)}</td><td><span class="tag warn">Still needs…</span></td><td>${E(a.what||'')}</td></tr>`);
  const n = o.support==='supported' ? '' : `<tr><td colspan="3" class="muted">${E(KP.SUPPORT_LABEL[o.support])}: ${E(o.notes[0]||'')}</td></tr>`;
  return `<table class="tbl"><thead><tr><th>Account</th><th>Status</th><th>Why</th></tr></thead><tbody>${c.join('')}${s.join('')}${n}${!c.length&&!s.length&&!n?'<tr><td colspan="3" class="muted">No eligible accounts for the first participant.</td></tr>':''}</tbody></table>`;
}
function cardPreview(d, R){
  const o = R.primary; if(!o) return '<div class="hrow-prev"><div class="t">'+E(d.title)+'</div><div class="s">No objective</div></div>';
  const title = (d.isTest?'TEST — ':'')+d.title;
  return `<div class="hrow-prev"><div class="t">${E(title)}</div><div class="s">${E(d.supplier||'Kohler Programs')} · ${E(KP.periodText(d.period))}</div>
    ${o.goal?`<div class="p">Goal <b>${fmt(o.goal)} ${E(o.unit)}</b></div><div class="p"><b>${fmt(o.value)}</b> of ${fmt(o.goal)} · ${E(o.remainText||'')}</div>`:`<div class="p"><b>${E(o.valueText)}</b> · ${E(o.goalText)}</div>`}
    <div class="bar"><i style="width:${o.pct||0}%"></i></div><div class="s">${o.support!=='supported'?E(KP.SUPPORT_LABEL[o.support]):(R.through?'Sales data through '+E(R.through):'')}</div></div>`;
}

// ---- review page
async function openReview(id){
  await Promise.all([loadScope(), loadPeople(), loadProducts()]);
  await loadLists(); const p = S.programs.find(x=>x.id===id); if(!p){ S.msg = {cls:'err', t:'Program not found.'}; go({view:'list'}); return; }
  S.prog = p; S.def = null;
  const [ev, fin, co] = await Promise.all([D.rest('program_events?select=version,actor_name,actor_email,action,detail,at&program_id=eq.'+id+'&order=at.desc&limit=50'), D.rest('program_finance?select=version_id,terms,program_versions!inner(program_id,version)&program_versions.program_id=eq.'+id), D.rest('program_closeouts?select=*&program_id=eq.'+id)]);
  const vers = (p.program_versions||[]).slice().sort((a,b)=>b.version-a.version); const latest = vers[0]; const approved = vers.find(v=>v.version===p.approved_version);
  const ph = phase(p); const rev = pendingRevision(p); const canEdit = await (async()=>{ try{ return await D.rpc('kdh_program_can_edit', {p_program:id}); }catch(e){ return false; } })();
  const finOf = v => { const f = fin.ok && (fin.data||[]).find(x=>x.program_versions && x.program_versions.version===v.version); return f ? f.terms : null; };
  const show = (S.rvVersion && vers.find(v=>v.version===S.rvVersion)) || latest;
  const def = show.definition;
  const reps = (def.participants&&def.participants.resolved&&def.participants.resolved.reps||[]).slice(0, S.rvAll ? 60 : 5);
  app.innerHTML = `<header class="rv-h"><div><h1>${E(def.title)} ${p.is_test?'<span class="tag test">TEST — Not an Active Incentive</span>':''}<span class="tag">${p.kind==='mpo'?'MPO':'Incentive'}</span><span class="tag ${PHASE_CLS[ph]||''}">${PHASE_LABEL[ph]}</span></h1>
      <p class="m">${E(def.fullName||'')}${def.fullName?' · ':''}Owner ${E(p.owner_name||p.owner_email)} · ${fmtDate(p.start_date)} – ${fmtDate(p.end_date)} · showing version ${show.version} (${E(show.status)})${vers.length>1?` · <select id="rvVer" class="btn sm outline">${vers.map(v=>`<option value="${v.version}" ${v.version===show.version?'selected':''}>v${v.version} · ${v.status}</option>`).join('')}</select>`:''}</p></div>
      <div class="rv-acts"><a class="btn sm outline" href="#view=list">All Programs</a>
        ${canEdit && !['closed','archived'].includes(ph) && show.status!=='submitted' ? `<a class="btn sm" href="#view=edit&id=${id}&step=1">${p.approved_version!=null && !rev ? 'Propose Changes' : 'Edit'}</a>` : ''}
        ${canEdit && ['draft','returned'].includes(show.status) ? `<button class="btn sm primary" data-act="submit-id" data-id="${id}">Submit for Approval</button>` : ''}
        ${canEdit && show.status==='submitted' ? `<button class="btn sm outline" data-act="withdraw" data-id="${id}">Withdraw</button>` : ''}
        ${S.scope.admin && show.status==='submitted' ? `<button class="btn sm primary" data-act="approve" data-id="${id}">Approve</button><button class="btn sm outline" data-act="return" data-id="${id}">Return for Changes</button>` : ''}
        ${S.scope.admin && ph==='ended' ? `<button class="btn sm primary" data-act="closeout" data-id="${id}">Close Out</button>` : ''}
        ${canEdit && ph==='ended' && !rev ? `<a class="btn sm outline" href="#view=edit&id=${id}&step=4">Request Extension</a>` : ''}
        <button class="btn sm outline" data-act="dup" data-id="${id}">Duplicate</button><button class="btn sm outline" data-act="save-tpl" data-id="${id}">Save as Template</button>
        ${canEdit && !['closed','archived'].includes(ph) && (p.approved_version==null || S.scope.admin) ? `<button class="btn sm outline" data-act="archive" data-id="${id}">Archive</button>` : ''}</div></header>
    ${S.msg?`<div class="msg ${S.msg.cls}">${E(S.msg.t)}</div>`:''}
    ${show.status==='submitted' && !S.scope.admin ? `<div class="msg ok">Awaiting approval by the program approver. ${S.scope.admin?'':'Only the program approver can approve; you cannot approve your own program.'}</div>`:''}
    ${show.status==='returned' ? `<div class="msg err">Returned for changes${show.review_note?': '+E(show.review_note):''}.</div>`:''}
    ${rev && show.version===rev.version && approved ? `<div class="msg ok">Revision v${rev.version}: the approved v${approved.version} stays live until this is approved.${rev.change_note?' Change note: '+E(rev.change_note):''}</div>`:''}
    ${show.recalc ? `<div class="msg ok">Approved with recalc: ${show.recalc==='retroactive'?'retroactive (recalculated from the start)':'future only (earlier credit untouched)'}.</div>`:''}
    ${co.ok && co.data && co.data[0] ? `<div class="msg ok">Closed out ${fmtWhen(co.data[0].locked_at)} by ${E(co.data[0].locked_by)} · data through ${fmtDate(co.data[0].data_through)}. The approved result is locked.</div>`:''}
    <div class="pv" id="rvBody"><div class="kdh-state loading">Computing from the sales record…</div></div>
    <div id="rvAction"></div>
    <div class="pvcard" style="margin-top:14px"><h3>History</h3><ul class="events">${ev.ok?(ev.data||[]).map(e=>`<li><span>${E(fmtWhen(e.at))}</span><span>${E(e.actor_name||e.actor_email)}</span><span><b>${E(e.action)}</b>${e.version?' v'+e.version:''}${e.detail&&(e.detail.note||e.detail.recalc)?' · '+E([e.detail.note,e.detail.recalc].filter(Boolean).join(' · ')):''}</span></li>`).join(''):'<li class="muted">—</li>'}</ul></div>`;
  S.msg = null;
  const R = await evaluateFor(def, reps); const first = reps[0] ? R[reps[0]] : null;
  const body = document.getElementById('rvBody'); if(!body) return;
  const F = finOf(show);
  const allReps = (def.participants&&def.participants.resolved&&def.participants.resolved.reps||[]);
  body.innerHTML = previewBody(def, F, R, reps, first) + (allReps.length>reps.length?`<p><button class="btn sm outline" data-act="rv-all">Compute all ${allReps.length} participants</button></p>`:'') +
    (approved && p.is_test ? `<div class="pvcard"><h3>Participant preview</h3><p>${allReps.slice(0,12).map(r=>`<button class="btn sm outline" data-act="preview-as" data-rep="${E(r)}">Open Programs as ${E(r)}</button>`).join(' ')}</p><p class="muted">Sets the preview cookie and opens the Programs page as that rep: the test program renders through the real card code.</p></div>` : '');
}

// ---- actions
async function act(a, el){
  const id = el.dataset.id;
  if(a==='new'){ S.prog = null; S.def = blank(); S.fin = {items:[], notes:''}; S.step = 1; go({view:'edit', step:1}); return; }
  if(a==='from-tpl'){ const t = (S.templates||[]).find(x=>x.id===id); if(!t) return; S.prog = null; S.def = Object.assign(blank(), JSON.parse(JSON.stringify(t.definition)), {isTest:true}); S.def.title = (S.def.title||t.name)+' (from template)'; S.fin = {items:[], notes:''}; go({view:'edit', step:1}); return; }
  if(a==='del-tpl'){ if(!confirm('Remove this template?')) return; await D.rest('program_templates?id=eq.'+id, {method:'DELETE'}); await loadLists(); renderList(); return; }
  if(a==='dup'){ const t = prompt('Title for the copy (it is created as a TEST program):'); if(t===null) return; try{ const r = await D.rpc('kdh_program_duplicate', {p_program:id, p_title:t}); await loadLists(); S.msg = {cls:'ok', t:'Copied as a test program.'}; go({view:'review', id:r.id}); }catch(e){ S.msg = {cls:'err', t:e.message}; route(); } return; }
  if(a==='save-tpl'){ const p = S.programs.find(x=>x.id===id); const v = latestVersion(p); const name = prompt('Template name:', v.definition.title); if(!name) return; const def = JSON.parse(JSON.stringify(v.definition)); def.participants.resolved = {reps:[], associates:[]}; def.participants.accountBase = {}; def.participants.reps = []; def.participants.teams = []; const r = await D.rest('program_templates', {method:'POST', body:{name, definition:def, owner_email:(U.email||'').toLowerCase(), owner_name:U.manager||U.name}}); S.msg = r.ok ? {cls:'ok', t:'Template saved (participants and money left out).'} : {cls:'err', t:'Could not save the template: '+(r.data&&r.data.message||r.status)}; await loadLists(); route(); return; }
  if(a==='archive'){ if(!confirm('Archive this program? It leaves every list.')) return; try{ await D.rpc('kdh_program_archive', {p_program:id}); await loadLists(); S.msg={cls:'ok',t:'Archived.'}; go({view:'list'}); }catch(e){ S.msg={cls:'err',t:e.message}; route(); } return; }
  if(a==='save'){ collect(); await save(false); renderWizard(); return; }
  if(a==='prev'){ collect(); S.step = Math.max(1, S.step-1); await save(true); go({view:'edit', id:S.prog?S.prog.id:null, step:S.step}); return; }
  if(a==='next'){ collect(); S.step = Math.min(7, S.step+1); await save(true); go({view:'edit', id:S.prog?S.prog.id:null, step:S.step}); return; }
  if(a==='submit'){ collect(); const r = await save(true); if(!r) { renderWizard(); return; } return submitId(r.id); }
  if(a==='submit-id') return submitId(id);
  if(a==='withdraw'){ try{ await D.rpc('kdh_program_withdraw', {p_program:id}); S.msg={cls:'ok',t:'Withdrawn; it is a draft again.'}; }catch(e){ S.msg={cls:'err',t:e.message}; } await loadLists(); route(); return; }
  if(a==='approve' || a==='return'){ const p = S.programs.find(x=>x.id===id); const isRev = p.approved_version!=null; const host = document.getElementById('rvAction');
    host.innerHTML = `<div class="pvcard note-box"><h3>${a==='approve'?'Approve this version':'Return for changes'}</h3>${isRev && a==='approve' ? `<div class="f"><label>This changes a published program. Earlier credit:</label><div class="radios"><label><input type="radio" name="recalc" value="future" checked>Apply from now on (keep earlier credit)</label><label><input type="radio" name="recalc" value="retroactive">Recalculate from the start</label></div><div class="hint">Historical credit is never changed silently.</div></div>`:''}<textarea id="rvNote" placeholder="${a==='approve'?'Note (optional)':'What needs to change'}"></textarea><div class="r" style="display:flex;gap:8px"><button class="btn primary" data-act="${a}-go" data-id="${id}">${a==='approve'?'Approve':'Return'}</button><button class="btn outline" data-act="cancel-act">Cancel</button></div></div>`; host.scrollIntoView({block:'center'}); return; }
  if(a==='cancel-act'){ document.getElementById('rvAction').innerHTML=''; return; }
  if(a==='approve-go' || a==='return-go'){ const note = (document.getElementById('rvNote')||{}).value||''; const recalc = (document.querySelector('input[name=recalc]:checked')||{}).value||null;
    try{ await D.rpc('kdh_program_review', {p:{id, decision:a==='approve-go'?'approve':'return', note, recalc}}); S.msg={cls:'ok', t:a==='approve-go'?'Approved. Participants will see it on their Programs page; a notice tells them.':'Returned for changes.'}; }catch(e){ S.msg={cls:'err', t:e.message}; }
    await loadLists(); route(); return; }
  if(a==='closeout'){ const p = S.programs.find(x=>x.id===id); const v = (p.program_versions||[]).find(x=>x.version===p.approved_version); const def = v.definition; const reps = def.participants.resolved.reps; const R = await evaluateFor(def, reps);
    const through = reps[0] && R[reps[0]] ? R[reps[0]].through : null; const result = {}; reps.forEach(r=>{ const x = R[r]; result[r] = x && x.primary ? {value:x.primary.value, goal:x.primary.goal, met:x.met, support:x.primary.support} : null; });
    const open = Object.values(result).filter(x=>x && x.support!=='supported').length;
    if(!confirm(`Close out "${def.title}"? The result for ${reps.length} participants (sales data through ${through||'—'}) is locked.${open?' '+open+' participant results are NOT fully calculable and will be locked as such.':''} Late-arriving corrections are not applied automatically after this.`)) return;
    try{ await D.rpc('kdh_program_closeout', {p:{id, dataThrough: through ? through+'-28' : null, result, note:'Locked from Manage Programs'}}); S.msg={cls:'ok', t:'Closed out and locked.'}; }catch(e){ S.msg={cls:'err', t:e.message}; }
    await loadLists(); route(); return; }
  if(a==='rv-all'){ S.rvAll = true; route(); return; }
  if(a==='preview-as'){ if(window.kdhSetPreview) window.kdhSetPreview(el.dataset.rep); location.href = '../hub/'; return; }
  if(a==='add-sel'){ collect(); S.def.products[el.dataset.kind].push({type:'family', value:''}); renderWizard(); return; }
  if(a==='add-obj'){ collect(); S.def.objectives.push(newObjective()); renderWizard(); return; }
  if(a==='del-obj'){ collect(); S.def.objectives = S.def.objectives.filter(o=>o.id!==id); renderWizard(); return; }
  if(a==='add-fin'){ collect(); S.fin.items = S.fin.items||[]; S.fin.items.push({objectiveId:'', kind:'per_unit', rate:null, qualifier:'', houseEffect:'', billback:''}); renderWizard(); return; }
  if(a==='del-fin'){ collect(); S.fin.items.splice(Number(el.dataset.i),1); renderWizard(); return; }
}
async function submitId(id){
  try{ const r = await D.rpc('kdh_program_submit', {p_program:id}); S.msg = {cls:'ok', t:'Submitted for approval (version '+r.version+').'}; await loadLists(); go({view:'review', id}); if(location.hash.includes('view=review')) route(); }
  catch(e){ S.msg = {cls:'err', t:'Not submitted: '+e.message}; await loadLists(); route(); }
}

// ---- events
app.addEventListener('click', e=>{
  const b = e.target.closest('[data-act]'); if(b){ e.preventDefault(); act(b.dataset.act, b); return; }
  const t = e.target.closest('[data-tab]'); if(t){ S.tab = t.dataset.tab; go({view:'list', tab:S.tab}); return; }
  const s = e.target.closest('[data-step]'); if(s){ collect(); S.step = Number(s.dataset.step); save(true).then(()=>{}); go({view:'edit', id:S.prog?S.prog.id:null, step:S.step}); return; }
  const x = e.target.closest('[data-sel-del]'); if(x){ collect(); S.def.products[x.dataset.selDel].splice(Number(x.dataset.i),1); renderWizard(); return; }
});
app.addEventListener('change', e=>{
  const el = e.target;
  if(el.id==='tplSel' && el.value){ act('from-tpl', {dataset:{id:el.value}}); return; }
  if(el.id==='rvVer'){ S.rvVersion = Number(el.value); route(); return; }
  if(S.view!=='edit') return;
  if(el.dataset.selType){ collect(); S.def.products[el.dataset.selType][Number(el.dataset.i)] = {type:el.value, value:''}; renderWizard(); return; }
  if(el.dataset.selVal){ collect(); S.def.products[el.dataset.selVal][Number(el.dataset.i)].value = el.value; renderWizard(); return; }
  if(el.name==='pmode' || el.name==='bmode' || el.id==='af_terr' || el.dataset.team!=null || el.dataset.area!=null || el.id==='aud_rep' || el.id==='aud_assoc' || el.name==='kind' || el.dataset.pickItem){ collect(); renderWizard(); return; }
  if(el.dataset.o && (el.dataset.k==='metric' || el.dataset.k==='logic')){ collect(); renderWizard(); return; }
  if(el.name && /^gt_/.test(el.name)){ collect(); renderWizard(); return; }
  if(el.dataset.g && (el.dataset.k==='pctPercent' || el.dataset.k==='rounding')){ collect(); renderWizard(); return; }
  if(el.id==='pe_type' || el.id==='bl_mode'){ collect(); renderWizard(); return; }
  if(el.dataset.f && (el.dataset.k==='kind' || el.dataset.k==='houseEffect')){ collect(); renderWizard(); return; }
  S.dirty = true;
});
app.addEventListener('input', e=>{
  const el = e.target;
  if(el.dataset.pick){ const q = el.value.toLowerCase(); document.querySelectorAll('#'+el.dataset.pick+' .chk').forEach(r=>{ r.style.display = !q || r.dataset.name.includes(q) ? '' : 'none'; }); return; }
  if(el.id==='pq'){ S.pq = el.value; const q = el.value.toLowerCase(); const list = S.def.products.resolved.filter(p=>!q||(p.name+' '+p.id).toLowerCase().includes(q)); const ul = document.querySelector('.plist'); if(ul) ul.innerHTML = list.slice(0,300).map(p=>`<li><span>${E(p.name)}</span><span>#${E(p.id)} · ${E(p.supplier)}</span></li>`).join(''); return; }
  if(el.dataset.o && el.dataset.k==='label'){ /* live plain-language line */ const o = S.def.objectives.find(x=>x.id===el.dataset.o); if(o){ o.label = el.value; const p = el.closest('.obj').querySelector('.plain'); if(p) p.textContent = plainObjective(o); } }
  S.dirty = true;
});
window.addEventListener('beforeunload', e=>{ if(S.dirty && S.view==='edit'){ e.preventDefault(); e.returnValue = ''; } });

// ---- routing
async function route(){
  const h = readHash(); S.view = h.view || 'list';
  if(S.view==='edit'){ await openEdit(h.id||null, h.step); return; }
  if(S.view==='review'){ await openReview(h.id); return; }
  S.tab = h.tab || S.tab || 'drafts'; await renderList();
}
window.addEventListener('hashchange', route);
(async function boot(){ await loadLists(); await loadScope(); await route(); })();
})();
