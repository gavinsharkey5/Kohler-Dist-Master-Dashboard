/* Manage Programs v3 (2026-10-08). Managers build incentives / MPOs in an
   eight-step builder (Basics, Participants & Accounts, Products, Objectives,
   Dates & Rules, Goals, Financial Terms, Review & Submit), save drafts and
   submit for approval; the program approver (program_admin) approves or
   returns; shared/custom-programs.js evaluates + renders the approved
   definition through the existing Programs experience. All permissions are
   enforced by the database functions (kdh_program_*); this file only asks.
   State: hash #view=list|edit|review&id=<uuid>&step=1..8&tab=<list tab>&ret=review.
   v3: Objectives is its own step (name / what is measured / unit / qualification
   / who it counts for; o.metric stays the stored authority and is DERIVED from
   those three choices); Dates & Rules shows only the settings an objective uses
   (per-objective Non-Buy Lookback anchored before the program start, comparison
   or baseline periods, activity dates) -- hidden values are cleared, never
   silently applied; the product picker is limited to the suppliers chosen in
   Basics (removing a supplier explains what it takes with it); Review & Submit
   is a summary strip + stacked sections with Edit actions that return to the
   right step and a "Return to Review" footer, configuration kept apart from
   calculated results ("Not Yet Available" when data is missing, 0 only when the
   calculation ran). v2 kept: in-place participant picker, SKU dialog,
   recoverable delete. */
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
const plural = (n, one, many) => n===1 ? one : (many || one+'s');
const monthLbl = k => k && /^\d{4}-\d{2}$/.test(String(k)) && KP && KP.monthLabel ? KP.monthLabel(k) : (k||'—');
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
const STEPS = ['Basics','Participants & Accounts','Products','Objectives','Dates & Rules','Goals','Financial Terms','Review & Submit'];
const LAST = STEPS.length;   // 8
// the three choices a manager makes per objective; o.metric (the stored authority the evaluator reads) is derived from them
const MEASURES = [
  ['buyers','Buyers','Accounts that buy qualifying products.'],
  ['placements','Placements','Each account and product pair that sells (counted once).'],
  ['volume','Sales Volume','Net cases of qualifying products. Returns reduce credit.'],
  ['merch','Merchandising Activity','Records and photos captured in the Hub. Counted as recorded, never as verified.']];
const UNITS = { buyers:[['accounts','Accounts']], placements:[['placements','Account-Product Placements']], volume:[['cases','Cases'],['units','Bottles / Units']], merch:[['records','Merchandising Records'],['photos','Merchandising Photos']] };
const QUALS = {
  buyers:[['any','Any Qualifying Purchase','An account counts once it buys in the program period.'],['new','New Buyer','Only accounts with no qualifying purchase in a lookback before the program.'],['retention','Retention','Accounts that bought in a baseline period and buy again in the program period.']],
  placements:[['any','Any Qualifying Purchase','Every account and product pair with net cases counts.'],['new','New Placement','Only products the account did not buy in a lookback before the program.']],
  volume:[['any','Total Cases','Net cases in the program period.'],['growth','Growth vs a Comparison Period','More net cases than in a comparison period.']],
  merch:[['any','Recorded Activity','Records dated inside the activity dates.']] };
const MEASURE_LABEL = {buyers:'Buyers', placements:'Placements', volume:'Sales Volume', merch:'Merchandising Activity'};
const UNIT_WORD = {accounts:'accounts', placements:'placements', cases:'cases', units:'units', records:'records', photos:'photos'};
function metricFrom(measure, qual, unit){
  if(measure==='buyers') return qual==='new' ? 'new_buyers' : qual==='retention' ? 'retention' : 'buying_accounts';
  if(measure==='placements') return qual==='new' ? 'new_placements' : 'placements';
  if(measure==='volume') return qual==='growth' ? 'growth' : 'units';
  return unit==='photos' ? 'photos' : 'merch';
}
function kindOf(o){
  const m = o.metric;
  if(m==='new_buyers') return {measure:'buyers', qual:'new', unit:'accounts'};
  if(m==='retention') return {measure:'buyers', qual:'retention', unit:'accounts'};
  if(m==='placements') return {measure:'placements', qual:'any', unit:'placements'};
  if(m==='new_placements') return {measure:'placements', qual:'new', unit:'placements'};
  if(m==='units') return {measure:'volume', qual:'any', unit:o.volumeUnit==='units'?'units':'cases'};
  if(m==='growth') return {measure:'volume', qual:'growth', unit:o.volumeUnit==='units'?'units':'cases'};
  if(m==='merch') return {measure:'merch', qual:'any', unit:'records'};
  if(m==='photos') return {measure:'merch', qual:'any', unit:'photos'};
  return {measure:'buyers', qual:'any', unit:'accounts'};
}
const unitWord = o => UNIT_WORD[kindOf(o).unit] || 'units';
const objName = o => o.label || (KP.MEASURE_TEXT && KP.MEASURE_TEXT[o.metric]) || metricRow(o.metric)[1];
const usesLookback = o => o.metric==='new_buyers' || o.metric==='new_placements';
const usesComparison = o => o.metric==='growth' || o.metric==='retention';
const isMerch = o => o.metric==='merch' || o.metric==='photos';
const isSalesMetric = o => !isMerch(o);
const SEL_LABEL = {sku:'Product', family:'Brand Family', brand:'Brand', supplier:'Supplier', package:'Package', draft:'Category'};

// ---- guards (the middleware already keeps reps out; the page refuses a rep cookie or rep preview)
if(!U || U.role!=='manager' || (U.preview && U.role!=='manager')){
  app.innerHTML = U && U.preview ? `<div class="kdh-state unavailable"><b>Manage Programs Is for Managers</b><span>You are previewing a rep. <button class="btn sm" onclick="kdhExitPreview()">Exit Preview</button></span></div>`
    : `<div class="kdh-state unavailable"><b>Manage Programs Is for Managers</b><span>Managers only. <a href="../rep/">Back to Rep Home</a></span></div>`;
  return;
}
if(!D || !D.signedIn()){ app.innerHTML = `<div class="kdh-state unavailable"><b>Sign In Required</b><span>Manage Programs needs your Hub sign-in (no auth config on this copy of the site).</span></div>`; return; }

// ---- state
const S = { view:'list', tab:'drafts', id:null, step:1, programs:[], scope:null, people:null, products:null, def:null, fin:null, prog:null, dirty:false, saving:false, msg:null, lastSaved:null, visited:{}, pm:null, pickUI:{} };
function readHash(){ const h = {}; location.hash.replace(/^#/,'').split('&').forEach(kv=>{ const [k,v] = kv.split('='); if(k) h[k] = decodeURIComponent(v||''); }); return h; }
function go(h){ location.hash = Object.keys(h).filter(k=>h[k]!=null && h[k]!=='').map(k=>k+'='+encodeURIComponent(h[k])).join('&'); }

// ---- data
async function loadLists(){
  const r = await D.rest('programs?select=id,kind,is_test,title,audience,supplier,start_date,end_date,status,approved_version,owner_email,owner_name,updated_at,deleted_at,deleted_from,program_versions(version,status,definition,reviewed_at,submitted_at,created_by)&order=updated_at.desc');
  S.programs = r.ok ? (r.data||[]) : [];
  if(!r.ok && r.status===404) S.msg = {cls:'err', t:'The Manage Programs tables are not in the database yet: run supabase/migrations/20261008120000_manage_programs.sql in the Supabase SQL Editor.'};
  const t = await D.rest('program_templates?select=id,name,definition,owner_name,created_at&order=created_at.desc'); S.templates = t.ok ? (t.data||[]) : [];
}
async function loadScope(){ if(S.scope) return S.scope; try{ S.scope = await D.rpc('kdh_program_scope'); }catch(e){ S.scope = {manager:true, admin:false, team:[], brands:[], error:e.message}; } return S.scope; }
async function loadPeople(){ if(S.people) return S.people; try{ S.people = await D.rpc('kdh_program_people'); }catch(e){ S.people = []; } return S.people; }
async function loadProducts(){ if(S.products) return S.products; S.products = await KP.products(); return S.products; }
function phase(p){
  if(p.status==='deleted') return 'deleted';
  if(p.status==='closed') return 'closed'; if(p.status==='archived') return 'archived';
  if(p.status==='submitted') return 'submitted'; if(p.status==='returned') return 'returned';
  if(p.status==='draft' || p.approved_version==null) return 'draft';
  const s = p.start_date ? new Date(p.start_date+'T00:00:00') : null, e = p.end_date ? new Date(p.end_date+'T00:00:00') : null;
  if(e && e < TODAY) return 'ended'; if(s && s > TODAY) return 'scheduled'; return 'active';
}
const PHASE_LABEL = {draft:'Draft', submitted:'Awaiting Approval', returned:'Returned for Changes', scheduled:'Scheduled', active:'Active', ended:'Ended — Awaiting Closeout', closed:'Closed', archived:'Archived', deleted:'Deleted'};
const PHASE_CLS = {draft:'', submitted:'brand', returned:'warn', scheduled:'brand', active:'ok', ended:'warn', closed:'', archived:'', deleted:'bad'};
function latestVersion(p){ return (p.program_versions||[]).slice().sort((a,b)=>b.version-a.version)[0] || null; }
function approvedVersion(p){ return p && p.approved_version!=null ? (p.program_versions||[]).find(v=>v.version===p.approved_version) || null : null; }
function pendingRevision(p){ const v = latestVersion(p); return v && p.approved_version!=null && v.version>p.approved_version ? v : null; }
// restored from Deleted while it had a live version: not shown to participants until the approver publishes it again
function unpublished(p){ return p.approved_version!=null && ['draft','returned'].includes(p.status); }
const myEmail = () => String(U.email||'').toLowerCase();
// mirrors kdh_program_delete: the admin always; a manager who may edit it (owner or scope) only while it is a draft or a test program
function mayDelete(p, canEdit){ if(!p || p.status==='deleted') return false; const sc = S.scope||{}; if(sc.admin) return true; const mine = canEdit!=null ? canEdit : (p.owner_email||'').toLowerCase()===myEmail(); const published = p.approved_version!=null || ['approved','closed'].includes(p.status); return !!mine && (!published || p.is_test); }
function mayRestore(p){ return !!p && p.status==='deleted' && (S.scope.admin || ((p.owner_email||'').toLowerCase()===myEmail() && (p.approved_version==null || p.is_test))); }

// ---- list
const TABS = [['create','Create Program'],['drafts','Drafts'],['awaiting','Awaiting Approval'],['active','Scheduled / Active'],['ended','Ended / Awaiting Closeout'],['closed','Closed'],['test','Test Programs'],['templates','Templates'],['deleted','Deleted Programs']];
function inTab(p, tab){
  const ph = phase(p); const rev = pendingRevision(p);
  if(tab==='deleted') return ph==='deleted';
  if(ph==='deleted') return false;
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
  const acts = ph==='deleted'
    ? `<a class="btn sm outline" href="#view=review&id=${p.id}">Open</a>${mayRestore(p)?`<button class="btn sm" data-act="restore" data-id="${p.id}">Restore Program</button>`:''}`
    : `<a class="btn sm" href="#view=review&id=${p.id}">Open</a>${['draft','returned'].includes(ph)||rev&&rev.status!=='submitted'?`<a class="btn sm outline" href="#view=edit&id=${p.id}&step=1">Edit</a>`:''}<button class="btn sm outline" data-act="dup" data-id="${p.id}">Duplicate</button>`;
  return `<li class="mpr">
    <div><div class="t">${E(p.title)} ${p.is_test?'<span class="tag test">TEST</span>':''}<span class="tag">${p.kind==='mpo'?'MPO':'Incentive'}</span><span class="tag ${PHASE_CLS[ph]||''}">${PHASE_LABEL[ph]||ph}</span>${unpublished(p)&&ph!=='deleted'?`<span class="tag warn">Not Published</span>`:''}${rev&&ph!=='deleted'?`<span class="tag warn">Revision v${rev.version} ${rev.status==='submitted'?'awaiting approval':rev.status}</span>`:''}</div>
      <div class="m"><span>Audience <b>${E(aud)}</b></span><span>Dates <b>${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}</b></span><span>Owner <b>${E(p.owner_name||p.owner_email)}</b></span>${p.supplier?`<span>Supplier <b>${E(p.supplier)}</b></span>`:''}${ph==='deleted'?`<span>Deleted <b>${E(fmtWhen(p.deleted_at))}</b> (was ${E(PHASE_LABEL[p.deleted_from]||p.deleted_from||'—')})</span>`:''}</div></div>
    <div class="a">${acts}</div></li>`;
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
    : `${tab==='deleted'?'<p class="tabnote">Deleted programs keep their definition, approval history and records. Restore puts a program back as a draft; a program that was live is not shown to participants again until the approver publishes it.</p>':''}<ul class="mpl">${S.programs.filter(p=>inTab(p,tab)).map(rowHtml).join('') || `<li class="mpempty">${tab==='awaiting'?'Nothing is awaiting approval.':tab==='test'?'No test programs. Create one with "Test Program" ticked to try the whole workflow safely.':tab==='deleted'?'No deleted programs.':'Nothing here yet.'}</li>`}</ul>`}`;
  S.msg = null;
}

// ---- definition helpers
function blank(){
  return { v:1, title:'', fullName:'', kind:'incentive', audience:['rep'], supplier:'', suppliers:[], description:'', docUrl:'', docName:'', isTest:true,
    participants:{ mode:'individual', reps:[], associates:[], teams:[], resolved:{reps:[], associates:[]}, accountFilter:{premise:'any', territory:'any', accounts:[]}, baseMode:'fixed', accountBase:{} },
    products:{ include:[], exclude:[], dynamic:false, resolved:[] },
    period:{ type:'fixed', start:'', end:'', rollingDays:90, baseline:{mode:'none', start:'', end:''}, nonBuyDays:90, creditEvent:'sales_month' },
    objectives:[], logic:'all' };
}
function uid(){ return 'o'+Math.random().toString(36).slice(2,8); }
function newObjective(){ return { id:uid(), label:'', metric:'buying_accounts', minSkus:1, minCases:0, premise:'any', scope:'individual', logic:'required', requires:'', followOn:{start:'',end:''}, comparison:{start:'',end:''}, merch:{category:'any', needBeforeAfter:false}, goal:{type:'fixed', value:'', pct:'', rounding:'', perRep:{}} }; }
// a draft saved by an earlier version: give every objective its own date rules
// (copied from the old program-wide fields, never invented) and a suppliers list
function upgradeDef(def){
  if(!Array.isArray(def.suppliers) || (!def.suppliers.length && def.supplier)) def.suppliers = def.supplier ? [def.supplier] : [];
  def.supplier = def.suppliers[0] || '';
  const pe = def.period || {};
  (def.objectives||[]).forEach(o=>{
    o.followOn = o.followOn || {start:'',end:''}; o.comparison = o.comparison || {start:'',end:''}; o.merch = o.merch || {category:'any', needBeforeAfter:false}; o.goal = o.goal || {type:'fixed', value:'', pct:'', rounding:'', perRep:{}};
    if(usesLookback(o)){ if(!o.nonBuyDays) o.nonBuyDays = Number(pe.nonBuyDays)||90; o.nonBuyAnchor = 'program_start'; }
    if(usesComparison(o) && !(o.comparison.start && o.comparison.end) && pe.baseline && pe.baseline.start && pe.baseline.mode && pe.baseline.mode!=='none') o.comparison = {start:pe.baseline.start, end:pe.baseline.end};
    if(isMerch(o) && !o.actDates) o.actDates = o.followOn.start ? 'custom' : 'program';
    normalizeObjective(o);
  });
  return def;
}
// hidden settings never affect a calculation: clear what the objective's measure does not use
function normalizeObjective(o){
  if(usesLookback(o)){ o.nonBuyDays = Math.min(730, Math.max(30, Number(o.nonBuyDays)||90)); o.nonBuyAnchor = 'program_start'; } else { delete o.nonBuyDays; delete o.nonBuyAnchor; }
  if(!usesComparison(o)) o.comparison = {start:'',end:''};
  if(isMerch(o)){ if(o.actDates!=='custom'){ o.actDates = 'program'; o.followOn = {start:'',end:''}; } } else { delete o.actDates; o.merch = {category:'any', needBeforeAfter:false}; }
  if(o.metric!=='units' && o.metric!=='growth') delete o.volumeUnit;
  if(!['buying_accounts','new_buyers','retention'].includes(o.metric)) o.minSkus = 1;
  if(!['buying_accounts','new_buyers','retention','units'].includes(o.metric)) o.minCases = 0;
  if(o.goal && o.goal.type==='pct_of_base' && !['buying_accounts','new_buyers','retention','merch','photos'].includes(o.metric)) o.goal.type = 'fixed';
  return o;
}
// products chosen before a supplier was taken off, or chosen outside the suppliers list
function outOfScope(def){ const sups = (def.suppliers||[]).map(x=>x.toLowerCase()); if(!sups.length) return []; return (def.products.resolved||[]).filter(p=>!sups.includes(String(p.supplier||'').toLowerCase())); }
// what removing a supplier takes with it (explained before anything is removed)
function supplierImpact(def, sup){
  const low = sup.toLowerCase(); const all = S.products && S.products.list || []; const famOf = {}; all.forEach(p=>{ if(p.family && p.supplier) famOf[p.family.toLowerCase()] = (p.supplier||'').toLowerCase(); });
  const skus = (def.products.resolved||[]).filter(p=>String(p.supplier||'').toLowerCase()===low);
  const groups = (def.products.include||[]).map(x=>Array.isArray(x)?x[0]:x).filter(g=>g.type==='supplier' ? String(g.value).toLowerCase()===low : g.type==='family' ? famOf[String(g.value).toLowerCase()]===low : g.type==='brand' ? all.some(p=>(p.brand||'').toLowerCase()===String(g.value).toLowerCase() && (p.supplier||'').toLowerCase()===low) : false);
  const packages = (def.products.include||[]).map(x=>Array.isArray(x)?x[0]:x).filter(g=>g.type==='package' || g.type==='draft');
  const excl = (def.products.exclude||[]).map(x=>Array.isArray(x)?x[0]:x).filter(x=>x.type==='sku' && String(((S.products.map||{})[String(x.value)]||{}).supplier||'').toLowerCase()===low);
  return {skus, groups, packages, excl, any: skus.length || groups.length || excl.length};
}
function removeSupplier(def, sup){
  const low = sup.toLowerCase(); const imp = supplierImpact(def, sup); const pr = def.products;
  const skuIds = new Set(imp.skus.map(p=>String(p.id)));
  pr.include = (pr.include||[]).filter(x=>{ const g = Array.isArray(x)?x[0]:x; if(g.type==='sku') return !skuIds.has(String(g.value)); return !imp.groups.includes(g); });
  pr.exclude = (pr.exclude||[]).filter(x=>!imp.excl.includes(Array.isArray(x)?x[0]:x));
  def.suppliers = (def.suppliers||[]).filter(x=>x.toLowerCase()!==low); def.supplier = def.suppliers[0]||'';
  resolveProductsDef(def); if(!hasGroupSelection(def)) pr.dynamic = false; S.dirty = true;
}
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
// WHICH ACCOUNTS COUNT. "Keep the Starting Account List" (fixed): the list is
// re-read from the account books on every draft save and LOCKED by approval;
// a revision of a live program keeps the approved list for every rep whose
// filter did not change (route changes never move credit by themselves).
// "Update With Route Changes" (dynamic): the Programs page re-reads the books
// at every view (custom-programs.js baseFor), so this stores a snapshot only.
function resolveParticipants(def){
  const P = def.participants; const reps = allowedPeople('rep'); const assoc = allowedPeople('associate');
  let r = [];
  if(P.mode==='all') r = reps.filter(p=>p.ok).map(p=>p.name);
  else if(P.mode==='team') r = reps.filter(p=>p.ok && P.teams.some(t=>(p.reports_to||'').toLowerCase()===t.toLowerCase() || (window.kdhMatchName && window.kdhMatchName(t, [p.reports_to||'']))) ).map(p=>p.name);
  else r = P.reps.slice();
  const a = def.audience.includes('associate') ? (P.mode==='all' ? assoc.filter(p=>p.ok).map(p=>p.name) : P.associates.slice()) : [];
  P.resolved = { reps: def.audience.includes('rep') ? r : [], associates: a };
  const live = approvedVersion(S.prog); const liveP = live && live.definition && live.definition.participants || null;
  const sameFilter = liveP && JSON.stringify(liveP.accountFilter||{}) === JSON.stringify(Object.assign({}, P.accountFilter, {unmatched:undefined}));
  P.accountBase = {};
  P.resolved.reps.forEach(name=>{
    if(P.baseMode!=='dynamic' && sameFilter && liveP.baseMode!=='dynamic' && liveP.accountBase && liveP.accountBase[name]) { P.accountBase[name] = liveP.accountBase[name].slice(); return; }
    P.accountBase[name] = filterAccounts(repBook(name), P.accountFilter).map(a=>a.n);
  });
  return P.resolved;
}
function resolveProductsDef(def){ if(!S.products) return []; def.products.resolved = KP.resolveProducts(def.products, S.products); return def.products.resolved; }
function hasGroupSelection(def){ return (def.products.include||[]).some(s=>(Array.isArray(s)?s[0]:s).type!=='sku'); }
function objSummary(o){ const k = kindOf(o); const q = (QUALS[k.measure]||[]).find(x=>x[0]===k.qual); const u = (UNITS[k.measure]||[]).find(x=>x[0]===k.unit); return 'Measure: '+(KP.MEASURE_TEXT[o.metric]||metricRow(o.metric)[1])+' · Unit: '+(u?u[1]:k.unit)+(q?' · '+q[1]:'')+(o.scope==='house'?' · Team Total':' · Each Participant'); }
function validate(def){
  const errs = {}; const add = (k,m,f)=>{ (errs[k]=errs[k]||[]).push(f?{m,f}:m); };
  if(!def.title.trim()) add(1,'A program title is required.','f_title');
  if(!def.audience.length) add(1,'Pick at least one audience.','aud_rep');
  if(!def.participants.resolved.reps.length && !def.participants.resolved.associates.length) add(2,'No participants are selected.','pickReps');
  if(def.audience.includes('associate') && def.participants.resolved.associates.length) add(2,'Sales associates have no account assignments on this site, so their objectives cannot be scored per account yet (the draft stays saved).');
  const needProducts = def.objectives.some(o=>!['units','growth','merch','photos'].includes(o.metric));
  if(needProducts && !(def.suppliers||[]).length) add(3,'Select a supplier in Basics to choose products.','supQ');
  else if(needProducts && !def.products.resolved.length) add(3,'This program\'s objectives need qualifying products; none are selected.','addProducts');
  const oos = outOfScope(def); if(oos.length) add(3, oos.length+' selected '+plural(oos.length,'product')+' '+(oos.length===1?'is':'are')+' outside the selected suppliers ('+[...new Set(oos.map(p=>p.supplier||'unknown'))].join(', ')+'). Remove them or add the supplier in Basics.','outScope');
  if(!def.objectives.length) add(4,'Add at least one objective.','addObj');
  def.objectives.forEach((o,i)=>{ const n = 'Objective '+(i+1)+(o.label?' ('+o.label+')':'');
    if((o.metric==='units'||o.metric==='growth') && o.volumeUnit==='units') add(4, n+': bottles / units are not in the sales record (cases only), so it cannot be scored yet.', 'u_'+o.id);
    if(o.requires && !def.objectives.some(x=>x.id===o.requires)) add(4, n+': the objective it is unlocked by no longer exists.', 'rq_'+o.id); });
  if(!def.period.start || !def.period.end) add(5,'Start and end dates are required.','pe_start'); else if(def.period.end < def.period.start) add(5,'The end date is before the start date.','pe_end');
  def.objectives.forEach((o,i)=>{ const n = 'Objective '+(i+1)+(o.label?' ('+o.label+')':'');
    if(usesComparison(o) && !(o.comparison.start && o.comparison.end)) add(5, n+' needs its '+(o.metric==='growth'?'comparison':'baseline')+' period.', 'cs_'+o.id);
    else if(usesComparison(o) && o.comparison.end < o.comparison.start) add(5, n+': the '+(o.metric==='growth'?'comparison':'baseline')+' period ends before it starts.', 'cs_'+o.id);
    if(usesLookback(o) && !(Number(o.nonBuyDays)>=30 && Number(o.nonBuyDays)<=730)) add(5, n+': the Non-Buy Lookback must be 30 to 730 days.', 'nb_'+o.id);
    if(isMerch(o) && o.actDates==='custom' && !(o.followOn.start && o.followOn.end)) add(5, n+': set both activity dates or use the program period.', 'fs_'+o.id);
    const g = o.goal||{};
    if(g.type==='fixed' && (g.value==='' || g.value==null) && o.metric!=='growth') add(6, n+': set a goal.', 'g_'+o.id);
    if(g.type==='pct_of_base' && (!g.pct || !g.rounding)) add(6, n+': a percentage goal needs the percentage AND a rounding rule (whole accounts).', 'g_'+o.id);
    if(g.type==='individual' && def.participants.resolved.reps.some(n2=>g.perRep[n2]==null || g.perRep[n2]==='')) add(6, n+': every participant needs an individual goal.', 'g_'+o.id);
    if(g.type==='house' && !g.value) add(6, n+': set the team goal.', 'g_'+o.id);
  });
  return errs;
}
const errText = x => typeof x==='string' ? x : x.m;
const errList = (errs, n) => (errs[n]||[]).map(errText);

// ---- wizard
async function openEdit(id, step){
  await Promise.all([loadScope(), loadPeople(), loadProducts()]);
  S.step = Math.min(LAST, Math.max(1, Number(step)||1)); S.ret = readHash().ret==='review' ? 'review' : null;
  if(id && (!S.prog || S.prog.id!==id || !S.def)){   // !S.def: arriving from the review page (it drops the draft)
    let p = S.programs.find(x=>x.id===id); if(!p){ await loadLists(); p = S.programs.find(x=>x.id===id); } if(!p){ S.msg = {cls:'err', t:'Program not found.'}; go({view:'list'}); return; }
    if(p.status==='deleted'){ S.msg = {cls:'err', t:'This program is deleted. Restore it from Deleted Programs to edit it.'}; go({view:'review', id}); return; }
    S.prog = p; const v = latestVersion(p); S.def = Object.assign(blank(), JSON.parse(JSON.stringify(v.definition)));
    S.def.participants = Object.assign(blank().participants, S.def.participants||{}); S.def.products = Object.assign(blank().products, S.def.products||{}); S.def.period = Object.assign(blank().period, S.def.period||{}); upgradeDef(S.def);
    const f = await D.rest('program_finance?select=terms&version_id=eq.'+encodeURIComponent((await versionId(p, v.version))||'')); S.fin = f.ok && f.data && f.data[0] ? f.data[0].terms : {items:[], notes:''};
    S.versionStatus = v.status; S.visited = {};
  } else if(!id && !S.prog){ S.def = S.def || blank(); upgradeDef(S.def); S.fin = S.fin || {items:[], notes:''}; S.versionStatus = 'draft'; S.visited = S.visited || {}; }
  S.visited[S.step] = true;
  S.dirty = false; renderWizard();
}
async function versionId(p, version){ const r = await D.rest('program_versions?select=id&program_id=eq.'+p.id+'&version=eq.'+version); return r.ok && r.data && r.data[0] ? r.data[0].id : null; }
async function save(silent){
  if(S.saving) return; S.saving = true; savedLine();
  resolveParticipants(S.def); resolveProductsDef(S.def);
  try{
    const res = await D.rpc('kdh_program_save', {p:{ id:S.prog ? S.prog.id : null, definition:S.def, finance:S.fin }});
    S.lastSaved = new Date(); S.dirty = false;
    await loadLists(); S.prog = S.programs.find(x=>x.id===res.id) || S.prog; S.versionStatus = 'draft';
    // feedback stays in the fixed-width .saved span (no banner: a banner shifts the page)
    return res;
  }catch(e){ S.msg = {cls:'err', t:'Could not save: '+e.message}; return null; }
  finally{ S.saving = false; savedLine(); }
}
// the compact save indicator (fixed width: it never shifts the buttons)
function savedText(){ return S.saving ? 'Saving…' : S.lastSaved ? 'Saved '+S.lastSaved.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : S.dirty ? 'Unsaved changes' : ''; }
function savedLine(){ document.querySelectorAll('.saved').forEach(el=>{ el.textContent = savedText(); }); }
function field(label, inner, hint, err, cls){ return `<div class="f${err?' bad':''}${cls?' '+cls:''}"><label>${label}</label>${inner}${hint?`<div class="hint">${hint}</div>`:''}${err?`<div class="err">${E(err)}</div>`:''}</div>`; }
function help(title, body){ return `<details class="help"><summary>${E(title)}</summary><div class="help-b">${body}</div></details>`; }
function optionCards(name, cur, opts){ return `<div class="ocards">${opts.map(o=>`<label class="ocard${cur===o.v?' on':''}"><input type="radio" name="${name}" value="${o.v}" ${cur===o.v?'checked':''} ${o.disabled?'disabled':''}><span class="oc-t">${E(o.t)}${o.rec?' <em>Recommended</em>':''}</span><span class="oc-d">${E(o.d)}</span></label>`).join('')}</div>`; }

function stepHtml(n, errs){
  const d = S.def; const P = d.participants; const err = k=>errList(errs, n);
  const errBlock = (list)=>list.length?`<div class="errs">${list.map(x=>`<div class="err">${E(x)}</div>`).join('')}</div>`:'';
  if(n===1) return `<h2>Basics</h2><p class="lead">Name the program and say who it is for.</p>
    ${field('Program Title', `<input type="text" id="f_title" value="${E(d.title)}" maxlength="80" placeholder="e.g. Lytt 3-SKU Push">`, 'Shown on the program card. A test program is labelled TEST automatically.', err()[0] && /title/.test(err()[0]) ? err()[0] : '')}
    ${field('Full Official Name', `<input type="text" id="f_full" value="${E(d.fullName)}" maxlength="160" placeholder="As it appears on the supplier document">`)}
    <div class="row2">${field('Program Type', `<div class="radios"><label><input type="radio" name="kind" value="incentive" ${d.kind==='incentive'?'checked':''}>Incentive</label><label><input type="radio" name="kind" value="mpo" ${d.kind==='mpo'?'checked':''}>MPO</label></div>`, 'Incentives list on the Programs page. MPOs appear on the Off- / On-Premise MPO trackers.')}
    ${field('Audience', `<div class="radios"><label><input type="checkbox" id="aud_rep" ${d.audience.includes('rep')?'checked':''}>Sales Reps</label><label><input type="checkbox" id="aud_assoc" ${d.audience.includes('associate')?'checked':''}>Sales Associates</label></div>`, 'A program may include both.', err().find(x=>/audience/.test(x)))}</div>
    ${supplierField(d)}
    ${field('Description', `<textarea id="f_desc" maxlength="1000" placeholder="One or two sentences a rep would read on the card.">${E(d.description)}</textarea>`)}
    <div class="row2">${field('Program Document (Link)', `<input type="url" id="f_doc" value="${E(d.docUrl)}" placeholder="https://…">`, 'A link to the supplier deck or sheet.')}${field('Document Name', `<input type="text" id="f_docn" value="${E(d.docName)}" placeholder="October 2026 Rewards Deck">`)}</div>
    <div class="f"><label class="chk big"><input type="checkbox" id="f_test" ${d.isTest?'checked':''}> <span><b>Test Program</b><small>Labelled "TEST — Not an Active Incentive" everywhere. Visible only in manager preview; never in payouts, recaps or participant notices.</small></span></label></div>`;
  if(n===2){
    const reps = allowedPeople('rep'), assoc = allowedPeople('associate');
    const groups = {}; reps.forEach(p=>{ const k = p.reports_to||'No manager on file'; (groups[k]=groups[k]||[]).push(p); });
    const teams = Object.keys(groups).filter(k=>k!=='No manager on file').sort();
    const base = resolveParticipants(d); const nAcc = Object.values(P.accountBase).reduce((t,a)=>t+a.length,0);
    const HB2 = window.HUB_ACCOUNTS || (typeof HUB_ACCOUNTS!=='undefined' ? HUB_ACCOUNTS : null); const areas = (HB2 && HB2.areas) || CORE.concat(SOUTH);
    const noScope = S.scope.team!==null && !S.scope.admin && !(S.scope.team||[]).length;
    return `<h2>Participants & Accounts</h2><p class="lead">Who is in the program and which of their accounts count.${noScope ? ' You have no team or brand assignment on file, so nobody can be added yet (ask Gavin).' : ''}</p>
      ${field('Choose Participants By', `<div class="radios"><label><input type="radio" name="pmode" value="individual" ${P.mode==='individual'?'checked':''}>Individuals</label><label><input type="radio" name="pmode" value="team" ${P.mode==='team'?'checked':''}>Team</label><label><input type="radio" name="pmode" value="all" ${P.mode==='all'?'checked':''}>Everyone I Manage</label></div>`)}
      ${P.mode==='team' ? field('Teams', `<div class="radios">${teams.map(t=>`<label><input type="checkbox" data-team="${E(t)}" ${P.teams.includes(t)?'checked':''}>${E(t)}</label>`).join('')||'<span class="muted">No teams on file</span>'}</div>`) : ''}
      ${P.mode==='individual' && d.audience.includes('rep') ? pickerHtml('pickReps', 'Sales Reps', reps, P.reps, groups, teams) : ''}
      ${d.audience.includes('associate') ? (assoc.length ? (P.mode==='individual' ? pickerHtml('pickAssoc', 'Sales Associates', assoc, P.associates, null, [], 'Associates have no account assignments on this site: their objectives can be saved but not scored per account yet.') : '') : `<div class="f"><div class="lbl">Sales Associates</div><div class="hint">No sales-associate accounts are on the allow list, and the site has no associate → account mapping. The draft can be saved; the mapping is a missing piece, not something to invent.</div></div>`) : ''}
      <div class="sumline" id="partSum"><span>Participants: <b>${base.reps.length} ${plural(base.reps.length,'rep')}${base.associates.length?' + '+base.associates.length+' '+plural(base.associates.length,'associate'):''}</b></span><span>Eligible accounts: <b>${nAcc}</b></span></div>
      <h3 class="sec">Eligible Accounts</h3>
      <div class="row3">${field('Premise', `<select id="af_prem"><option value="any" ${P.accountFilter.premise==='any'?'selected':''}>Any</option><option value="off" ${P.accountFilter.premise==='off'?'selected':''}>Off-Premise</option><option value="on" ${P.accountFilter.premise==='on'?'selected':''}>On-Premise</option></select>`, d.kind==='mpo' ? 'An MPO shows on the tracker of this premise (both when Any).' : '')}
      ${field('Territory', `<select id="af_terr"><option value="any" ${P.accountFilter.territory==='any'?'selected':''}>Any</option><option value="core" ${P.accountFilter.territory==='core'?'selected':''}>Core Market</option><option value="southern" ${P.accountFilter.territory==='southern'?'selected':''}>Southern District</option><option value="areas" ${Array.isArray(P.accountFilter.territory)?'selected':''}>Pick Areas…</option></select>`, 'Core Market = Bergen, Passaic, Passaic-FF, Morris 1, Morris 3, Sussex. Southern District = Essex, Hudson, Union.')}
      ${field('Account Type', `<select id="af_type"><option value="any">Any</option></select>`, 'Draft / package service type is not on the account books yet.')}</div>
      ${Array.isArray(P.accountFilter.territory) ? field('Areas', `<div class="radios">${areas.map(a=>`<label><input type="checkbox" data-area="${E(a)}" ${P.accountFilter.territory.includes(a)?'checked':''}>${E(a)}</label>`).join('')}</div>`) : ''}
      ${field('Specific Accounts (Optional)', `<textarea id="af_accts" placeholder="Customer numbers, one per line or comma-separated">${E((P.accountFilter.accounts||[]).join('\n'))}</textarea>`, 'Checked against the participants\' account books when you continue. Unmatched numbers are listed, never added.' + (P.accountFilter.unmatched && P.accountFilter.unmatched.length ? ' Unmatched: '+P.accountFilter.unmatched.join(', ') : ''))}
      <h3 class="sec">Which Accounts Count?</h3>
      ${optionCards('bmode', P.baseMode==='dynamic'?'dynamic':'fixed', [
        {v:'fixed', t:'Keep the Starting Account List', rec:true, d:'Save the eligible accounts when the program starts. Later route changes will not automatically change this list.'},
        {v:'dynamic', t:'Update With Route Changes', d:'Update eligible accounts as route assignments change. This may affect eligibility and percentage-based goals.'}])}
      ${help('How the account list is saved', '<p>A draft re-reads the account books each time it is saved, so the numbers you see are current. Submitting sends that list to the approver and approval locks it. A later revision of an approved program keeps the approved list for every participant whose filters did not change.</p>')}
      <div id="stepErrs">${err().map(x=>`<div class="err">${E(x)}</div>`).join('')}</div>`;
  }
  if(n===3){
    const pr = d.products; const list = resolveProductsDef(d); const sups = d.suppliers||[];
    if(!sups.length) return `<h2>Products</h2><p class="lead">Which products earn credit.</p>
      <div class="mpempty big" id="noSup"><b>Select a supplier in Basics to choose products.</b><span>The product list is limited to the suppliers you choose there.</span><button class="btn" data-act="go-step" data-step="1">Edit Basics</button></div>
      ${list.length?`<div class="msg err" id="outScope">${list.length} ${plural(list.length,'product')} ${list.length===1?'was':'were'} selected before the supplier was taken off: ${E(list.slice(0,5).map(p=>p.name).join('; '))}${list.length>5?' …':''}. Add the supplier back in Basics, or <button type="button" class="lnk" data-act="rm-outscope">remove ${list.length===1?'it':'them'}</button>.</div>`:''}`;
    const groups = (pr.include||[]).filter(s=>(Array.isArray(s)?s[0]:s).type!=='sku');
    const excluded = (pr.exclude||[]).map(s=>Array.isArray(s)?s[0]:s).filter(s=>s.type==='sku').map(s=>{ const p = (S.products.map||{})[String(s.value)]; return {id:String(s.value), name:p?p.name:'Product #'+s.value}; });
    const q = (S.pq||'').toLowerCase();
    const shown = list.filter(p=>!q || (p.name+' '+p.id).toLowerCase().includes(q));
    const canDyn = hasGroupSelection(d); const oos = outOfScope(d);
    return `<h2>Products</h2><p class="lead">Which products earn credit. Choose exact products, or add a whole brand family or package on purpose.</p>
      <div class="f"><div class="lbl">Choose Products</div><div class="btnrow" id="addProducts"><button class="btn" data-act="add-products">Add Products</button><button class="btn outline" data-act="exclude-products" ${list.length?'':'disabled'}>Exclude Products</button></div>
        <div class="hint">Limited to ${sups.length===1?'the supplier':'the suppliers'} chosen in Basics: <b>${E(sups.join(', '))}</b>. <button type="button" class="lnk" data-act="go-step" data-step="1">Edit Basics</button></div>
        ${groups.length?`<div class="groups">${groups.map((s,i)=>{ const g = Array.isArray(s)?s[0]:s; return `<span class="gchip">${E(SEL_LABEL[g.type]||g.type)}: <b>${E(g.type==='draft'?(g.value==='draft'?'Draft only':'Package only'):g.value)}</b> <button type="button" class="gx" data-act="rm-group" data-i="${pr.include.indexOf(s)}" aria-label="Remove ${E(g.value)}">×</button></span>`; }).join('')}</div>`:''}
        ${S.scope && S.scope.brands!==null && !S.scope.admin ? `<div class="hint">Your brand scope: ${E((S.scope.brands||[]).join(', ')||'none on file')}. A program with products outside it cannot be submitted.</div>` : ''}</div>
      ${oos.length?`<div class="msg err" id="outScope"><b>${oos.length} ${plural(oos.length,'product')} outside the selected suppliers</b> (${E([...new Set(oos.map(p=>p.supplier||'unknown'))].join(', '))}): ${E(oos.slice(0,5).map(p=>p.name).join('; '))}${oos.length>5?' …':''}. Add that supplier in Basics or <button type="button" class="lnk" data-act="rm-outscope">remove ${oos.length===1?'it':'them'}</button>. The program cannot be submitted until this is resolved.</div>`:''}
      <div class="f"><div class="lbl">Selected Products <span class="cnt" id="selCount">${list.length}</span></div>
        ${list.length ? `<input type="search" id="pq" class="search" value="${E(S.pq||'')}" placeholder="Search selected products" aria-label="Search selected products"><ul class="plist" id="selProducts">${selRows(shown)}</ul>` : '<div class="mpempty">No products selected yet. Use Add Products.</div>'}</div>
      ${excluded.length ? `<div class="f"><div class="lbl">Excluded Products <span class="cnt">${excluded.length}</span></div><ul class="plist excl">${excluded.map(p=>`<li><span class="pn">${E(p.name)}</span><span class="pm">#${E(p.id)}</span><button type="button" class="btn sm outline" data-act="restore-product" data-id="${E(p.id)}">Restore</button></li>`).join('')}</ul><div class="hint">Removed from a brand family, supplier or package you added. They stay excluded even if the group grows.</div></div>` : ''}
      <details class="adv" id="advProducts" ${pr.dynamic?'open':''}><summary>Advanced Product Settings</summary>
        ${optionCards('pdyn', pr.dynamic && canDyn ? 'dynamic' : 'fixed', [
          {v:'fixed', t:'Keep the Approved Product List', rec:true, d:'Only the products saved with the approved program can qualify.'},
          {v:'dynamic', t:'Automatically Include New Matching Products', d: canDyn ? 'Future products matching the selected brand, supplier or package rules may also qualify. Excluded products stay excluded.' : 'Not available: every product here was chosen individually, so there is no brand, supplier or package rule to follow.', disabled:!canDyn}])}
      </details>
      ${errBlock(err().filter(x=>!/outside the selected suppliers/.test(x)))}`;
  }
  if(n===4){
    const objs = d.objectives.map((o,i)=>{
      const k = kindOf(o); const others = d.objectives.filter(x=>x.id!==o.id);
      const q = (QUALS[k.measure]||[]).find(x=>x[0]===k.qual) || QUALS[k.measure][0];
      return `<div class="obj" data-obj="${o.id}"><div class="obj-h"><b>Objective ${i+1}</b><button class="btn sm outline" data-act="del-obj" data-id="${o.id}">Remove</button></div>
        ${field('Objective Name', `<input type="text" data-o="${o.id}" data-k="label" value="${E(o.label)}" placeholder="${E(KP.MEASURE_TEXT[o.metric]||'')}" maxlength="80">`, 'Shown on the card. Leave blank to use the measure.')}
        ${field('What Are You Measuring?', optionCards('ms_'+o.id, k.measure, MEASURES.map(m=>({v:m[0], t:m[1], d:m[2]}))))}
        <div class="row2">${field('Unit of Measure', `<select data-o="${o.id}" data-k="unit" id="u_${o.id}">${UNITS[k.measure].map(u=>`<option value="${u[0]}" ${k.unit===u[0]?'selected':''}>${u[1]}</option>`).join('')}</select>`, k.unit==='units' ? 'Bottles / units are not in the sales record (cases only): saved, not scored yet.' : '')}
        ${field('Qualification Type', `<select data-o="${o.id}" data-k="qual">${QUALS[k.measure].map(x=>`<option value="${x[0]}" ${k.qual===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select>`, q[2])}</div>
        <div class="row2">${field('Who It Counts For', `<select data-o="${o.id}" data-k="scope"><option value="individual" ${o.scope!=='house'?'selected':''}>Each Participant</option><option value="house" ${o.scope==='house'?'selected':''}>Team Total (all participants together)</option></select>`)}
        ${field('Accounts Counted', `<select data-o="${o.id}" data-k="premise"><option value="any" ${o.premise==='any'?'selected':''}>Any eligible account</option><option value="off" ${o.premise==='off'?'selected':''}>Off-premise only</option><option value="on" ${o.premise==='on'?'selected':''}>On-premise only</option></select>`)}</div>
        ${k.measure==='buyers' ? `<div class="row2">${field('Different Products Required per Account', `<input type="number" min="1" max="20" data-o="${o.id}" data-k="minSkus" value="${E(o.minSkus||1)}">`, '1 = any one qualifying product.')}${field('Minimum Cases per Account', `<input type="number" min="0" step="0.5" data-o="${o.id}" data-k="minCases" value="${E(o.minCases||0)}">`, '0 = any net purchase.')}</div>` : ''}
        ${k.measure==='volume' && o.metric==='units' ? field('Minimum Cases per Account', `<input type="number" min="0" step="0.5" data-o="${o.id}" data-k="minCases" value="${E(o.minCases||0)}">`, '0 = every case counts.') : ''}
        ${k.measure==='merch' ? `<div class="row2">${field('Record Type', `<select data-o="${o.id}" data-k="merch.category">${MERCH_CATS.map(c=>`<option value="${c[0]}" ${(o.merch||{}).category===c[0]?'selected':''}>${c[1]}</option>`).join('')}</select>`)}<div class="f"><label class="chk"><input type="checkbox" data-o="${o.id}" data-k="merch.needBeforeAfter" ${(o.merch||{}).needBeforeAfter?'checked':''}> Before-and-after photos required</label><div class="hint">Records and photos are counted as recorded. No verification process exists yet.</div></div></div>` : ''}
        ${others.length ? `<details class="adv" ${o.logic!=='required'||o.requires?'open':''}><summary>Advanced Combination Settings</summary><div class="row2">
          ${field('Logic', `<select data-o="${o.id}" data-k="logic"><option value="required" ${o.logic==='required'?'selected':''}>Required (all required objectives must be met)</option><option value="alternative" ${o.logic==='alternative'?'selected':''}>Alternative (any one alternative qualifies)</option><option value="prerequisite" ${o.logic==='prerequisite'?'selected':''}>Prerequisite (unlocks other objectives)</option></select>`)}
          ${field('Unlocked By', `<select data-o="${o.id}" data-k="requires" id="rq_${o.id}"><option value="">— Nothing —</option>${others.map(x=>`<option value="${x.id}" ${o.requires===x.id?'selected':''}>${E(objName(x))}</option>`).join('')}</select>`, 'A qualifier that must be met first (e.g. 5 new placements before cases pay).')}</div></details>` : ''}
        <p class="obj-sum">${E(objSummary(o))}</p></div>`;
    }).join('');
    return `<h2>Objectives</h2><p class="lead">What the program measures. Each objective gets its own date rules in the next step and its goal after that.</p>
      ${objs || '<div class="mpempty">No objectives yet.</div>'}
      <div class="btnrow" id="addObj"><button class="btn" data-act="add-obj">Add Objective</button></div>
      ${errBlock(err())}`;
  }
  if(n===5){
    const pe = d.period;
    const objs = d.objectives.map((o,i)=>`<div class="obj" data-obj="${o.id}"><div class="obj-h"><b>${E(objName(o))}</b><span class="tag">${E(KP.MEASURE_TEXT[o.metric]||'')}</span></div>${objectiveDatesHtml(o, pe)}</div>`).join('');
    return `<h2>Dates & Rules</h2><p class="lead">When credit can be earned. Each objective shows only the date settings it uses.</p>
      ${help('How windows are measured', '<p>The sales record is monthly (net cases by product, account and month), so every window is measured in whole months; the data says so on each card. Invoice dates are not on the site.</p>')}
      <div class="row3">${field('Period Type', `<select id="pe_type"><option value="fixed" ${pe.type==='fixed'?'selected':''}>Fixed start / end dates</option><option value="calendar" ${pe.type==='calendar'?'selected':''}>Calendar month(s)</option><option value="rolling" ${pe.type==='rolling'?'selected':''}>Rolling window (continuous)</option></select>`, pe.type==='rolling' ? 'A rolling window re-measures the last N days at every data load; it is not a fixed promotion.' : '')}
      ${field('Program Start', `<input type="date" id="pe_start" value="${E(pe.start)}">`)}${field('Program End', `<input type="date" id="pe_end" value="${E(pe.end)}">`)}</div>
      ${pe.type==='rolling' ? field('Rolling Window (Days)', `<input type="number" id="pe_roll" min="30" max="365" value="${E(pe.rollingDays||90)}">`, 'Saved; computed as whole months ending at the last loaded sales month.') : ''}
      ${field('Credit Event', `<select id="pe_credit"><option value="sales_month">Sales month (monthly sales record)</option></select>`, 'Credit is dated by the sales month of the purchase.')}
      <h3 class="sec">Rules by Objective</h3>
      ${objs || '<div class="mpempty">Add objectives in step 4 first.</div>'}
      ${errBlock(err())}`;
  }
  if(n===6){
    const reps = d.participants.resolved.reps;
    const objs = d.objectives.map((o,i)=>{ const g = o.goal; const u = unitWord(o); const U = u.charAt(0).toUpperCase()+u.slice(1);
      return `<div class="obj" id="g_${o.id}"><div class="obj-h"><b>${E(objName(o))}</b><span class="tag">${E(KP.MEASURE_TEXT[o.metric]||'')}</span></div>
        ${field('Goal Type', `<div class="radios"><label><input type="radio" name="gt_${o.id}" value="fixed" ${g.type==='fixed'?'checked':''}>Same goal for everyone</label><label><input type="radio" name="gt_${o.id}" value="individual" ${g.type==='individual'?'checked':''}>Individual goals</label>${['buying_accounts','new_buyers','retention','merch','photos'].includes(o.metric)?`<label><input type="radio" name="gt_${o.id}" value="pct_of_base" ${g.type==='pct_of_base'?'checked':''}>% of eligible accounts</label>`:''}<label><input type="radio" name="gt_${o.id}" value="house" ${g.type==='house'?'checked':''}>Team goal</label></div>`)}
        ${g.type==='fixed' ? field('Goal ('+U+')', `<input type="number" min="0" step="any" data-g="${o.id}" data-k="value" value="${E(g.value)}" placeholder="${o.metric==='growth'?'blank = positive growth':''}">`, o.metric==='growth' ? 'Leave blank for "positive growth" (any net increase over the comparison period).' : 'Per participant.') : ''}
        ${g.type==='house' ? field('Team Goal ('+U+', all participants together)', `<input type="number" min="0" step="any" data-g="${o.id}" data-k="value" value="${E(g.value)}">`, 'The team total shows on the manager view; each participant sees their own share.') : ''}
        ${g.type==='pct_of_base' ? `<div class="row2">${field('Percent of Eligible Accounts', `<input type="number" min="1" max="100" data-g="${o.id}" data-k="pctPercent" value="${E(g.pct?Math.round(g.pct*100):'')}">`)}${field('Rounding of a Fractional Target', `<select data-g="${o.id}" data-k="rounding"><option value="">— Choose —</option><option value="up" ${g.rounding==='up'?'selected':''}>Round up</option><option value="nearest" ${g.rounding==='nearest'?'selected':''}>Nearest (halves up)</option><option value="down" ${g.rounding==='down'?'selected':''}>Round down</option></select>`, 'Required: the page never rounds for you.')}</div>
          ${reps.slice(0,8).map(r=>{ const b = (d.participants.accountBase[r]||[]).length; const raw = (g.pct||0)*b; return `<div class="hint">${E(r)}: ${b} eligible accounts → ${raw.toFixed(1)}${g.rounding?' → '+(g.rounding==='up'?Math.ceil(raw):g.rounding==='down'?Math.floor(raw):Math.round(raw)):''}</div>`; }).join('')}${reps.length>8?`<div class="hint">… and ${reps.length-8} more</div>`:''}` : ''}
        ${g.type==='individual' ? `<table class="tbl"><thead><tr><th>Participant</th><th>Eligible Accounts</th><th class="num">Goal (${E(U)})</th></tr></thead><tbody>${reps.concat(d.participants.resolved.associates).map(r=>`<tr><td>${E(r)}</td><td>${(d.participants.accountBase[r]||[]).length||'—'}</td><td class="num"><input type="number" min="0" step="any" data-g="${o.id}" data-k="perRep" data-rep="${E(r)}" value="${E(g.perRep[r]==null?'':g.perRep[r])}" class="numin"></td></tr>`).join('')}</tbody></table>` : ''}
        <p class="obj-sum">Goal: ${E(KP.goalSummary(o))}</p></div>`; }).join('');
    return `<h2>Goals</h2><p class="lead">What each participant has to reach. A fractional account goal is never rounded silently.</p>${objs||'<div class="mpempty">Add objectives in step 4 first.</div>'}${errBlock(err())}`;
  }
  if(n===7){
    const F = S.fin || {items:[], notes:''}; F.items = F.items||[];
    const rows = F.items.map((it,i)=>{ return `<div class="obj"><div class="obj-h"><b>Payout ${i+1}</b><button class="btn sm outline" data-act="del-fin" data-i="${i}">Remove</button></div>
      <div class="row3">${field('Applies To', `<select data-f="${i}" data-k="objectiveId"><option value="">— Whole program —</option>${d.objectives.map(x=>`<option value="${x.id}" ${it.objectiveId===x.id?'selected':''}>${E(objName(x))}</option>`).join('')}</select>`)}
      ${field('Payout Kind', `<select data-f="${i}" data-k="kind"><option value="per_unit" ${it.kind==='per_unit'?'selected':''}>Per unit (case / placement / account)</option><option value="flat" ${it.kind==='flat'?'selected':''}>Flat amount when the goal is met</option><option value="tiered" ${it.kind==='tiered'?'selected':''}>Tiered thresholds</option><option value="package" ${it.kind==='package'?'selected':''}>Package-specific per-unit rates</option></select>`)}
      ${it.kind==='per_unit'||it.kind==='flat' ? field(it.kind==='flat'?'Amount ($)':'Rate ($ per Unit)', `<input type="number" min="0" step="0.01" data-f="${i}" data-k="rate" value="${E(it.rate==null?'':it.rate)}">`) : ''}</div>
      ${it.kind==='tiered' ? field('Tiers', `<textarea data-f="${i}" data-k="tiersText" placeholder='One per line: "10 → 300" or "90% → 300"'>${E(it.tiersText||'')}</textarea>`, 'Saved as written; a tier is applied only when its threshold is a plain number or a percent of the objective goal.') : ''}
      ${it.kind==='package' ? field('Package Rates', `<textarea data-f="${i}" data-k="packagesText" placeholder='One per line: "6pk → 2.00"'>${E(it.packagesText||'')}</textarea>`, 'Matched against the product package text.') : ''}
      <div class="row3">${field('Paid Only When This Objective Is Met', `<select data-f="${i}" data-k="qualifier"><option value="">— None —</option>${d.objectives.map(x=>`<option value="${x.id}" ${it.qualifier===x.id?'selected':''}>${E(objName(x))}</option>`).join('')}</select>`)}
      ${field('Team Condition', `<select data-f="${i}" data-k="houseEffect"><option value="" ${!it.houseEffect?'selected':''}>— None —</option><option value="half" ${it.houseEffect==='half'?'selected':''}>50% payout if the team goal is missed</option><option value="none" ${it.houseEffect==='none'?'selected':''}>No payout if the team goal is missed</option><option value="rate" ${it.houseEffect==='rate'?'selected':''}>Higher rate when team + individual are met</option></select>`)}
      ${it.houseEffect==='rate' ? field('Rate When Both Are Met ($)', `<input type="number" min="0" step="0.01" data-f="${i}" data-k="rateBoth" value="${E(it.rateBoth==null?'':it.rateBoth)}">`) : ''}</div>
      ${field('Supplier Billback Terms', `<input type="text" data-f="${i}" data-k="billback" value="${E(it.billback||'')}" placeholder="Leave blank unless the supplier stated them">`)}</div>`; }).join('');
    return `<h2>Financial Terms</h2><div class="money"><h3>Manager-Only</h3><p class="lock">Participants never receive these fields. They are stored in a separate table the rep sign-in cannot read, and every participant-facing query, export and notice is built without them.</p></div>
      ${rows||'<div class="mpempty" style="margin-top:12px">No payout terms yet. A program can be approved without them (an MPO usually has none).</div>'}
      <div class="btnrow"><button class="btn sm" data-act="add-fin">Add Payout Term</button></div>
      ${field('Notes for the Approver', `<textarea id="fin_notes">${E(F.notes||'')}</textarea>`, 'Unclear supplier wording goes here (e.g. "Four Loko $1.00 rate: all cases or only after positive growth?") so it is decided, not guessed.')}`;
  }
  if(n===8) return reviewHtml(errs);
  return '';
}
// the date settings ONE objective uses (and nothing else)
function objectiveDatesHtml(o, pe){
  const per = KP.periodText(pe);
  if(usesLookback(o)){ const days = Number(o.nonBuyDays)||90; const start = pe.start ? fmtDate(pe.start) : 'the program start';
    return `<div class="row2">${field('Non-Buy Lookback (Days)', `<input type="number" id="nb_${o.id}" min="30" max="730" data-o="${o.id}" data-k="nonBuyDays" value="${E(days)}">`, `No qualifying purchases during the preceding <b class="js-nbdays">${days}</b> days.`)}
      ${field('Lookback Anchor', `<select data-o="${o.id}" data-k="nonBuyAnchor"><option value="program_start" selected>Fixed: the days before the program start (${E(start)})</option><option value="rolling" disabled>Rolling: before each account's first purchase (not available yet)</option></select>`, 'Measured in whole months from the sales record. The anchor is never switched automatically.')}</div>
      <p class="rule-line"><b>What Defines New:</b> ${o.metric==='new_buyers' ? 'no purchase of <b>any qualifying product</b> in this program during the lookback.' : 'no purchase of <b>that specific product</b> at the account during the lookback. Other products the account buys do not matter.'}</p>
      ${followOnFold(o)}`; }
  if(usesComparison(o)){ const g = o.metric==='growth'; const lbl = g ? 'Comparison Period' : 'Baseline Period';
    return `<div class="row2">${field(lbl+' Start', `<input type="date" id="cs_${o.id}" data-o="${o.id}" data-k="comparison.start" value="${E(o.comparison.start)}">`)}${field(lbl+' End', `<input type="date" data-o="${o.id}" data-k="comparison.end" value="${E(o.comparison.end)}">`)}</div>
      <div class="btnrow"><button type="button" class="btn sm outline" data-act="same-last-year" data-id="${o.id}" ${pe.start&&pe.end?'':'disabled'}>Use the Same Period Last Year</button><span class="hint">${pe.start&&pe.end ? E(fmtDate(shiftYear(pe.start))+' – '+fmtDate(shiftYear(pe.end))) : 'Set the program dates first.'}</span></div>
      <p class="rule-line">${g ? 'Net cases in the program period are compared with this period. No lookback applies.' : 'Accounts that bought a qualifying product in the baseline are the ones to retain. No lookback applies.'}</p>`; }
  if(isMerch(o)){
    return `${field('Activity Dates', `<select data-o="${o.id}" data-k="actDates"><option value="program" ${o.actDates!=='custom'?'selected':''}>Same as the program period (${E(per)})</option><option value="custom" ${o.actDates==='custom'?'selected':''}>Different dates</option></select>`)}
      ${o.actDates==='custom' ? `<div class="row2">${field('Activity Start', `<input type="date" id="fs_${o.id}" data-o="${o.id}" data-k="followOn.start" value="${E(o.followOn.start)}">`)}${field('Activity End', `<input type="date" data-o="${o.id}" data-k="followOn.end" value="${E(o.followOn.end)}">`)}</div>` : ''}
      <p class="rule-line">Records dated inside the activity dates count. No purchase window applies.</p>`; }
  return `<p class="rule-line">Counts qualifying purchases dated <b>${E(per)}</b>. No lookback or comparison period applies.</p>${followOnFold(o)}`;
}
function followOnFold(o){ return `<details class="adv" ${o.followOn.start?'open':''}><summary>Follow-On Period (Optional)</summary><div class="row2">${field('Follow-On Start', `<input type="date" data-o="${o.id}" data-k="followOn.start" value="${E(o.followOn.start)}">`)}${field('Follow-On End', `<input type="date" data-o="${o.id}" data-k="followOn.end" value="${E(o.followOn.end)}">`, 'A later window for this objective only (a rebuy bonus). Leave blank to use the program period.')}</div></details>`; }
function shiftYear(s){ const d = new Date(s+'T00:00:00'); if(isNaN(d)) return s; d.setFullYear(d.getFullYear()-1); return iso(d); }
// Basics: suppliers (one or more); products in step 3 are limited to them
function supplierField(d){
  const all = {}; (S.products && S.products.list||[]).forEach(p=>{ if(p.supplier) all[p.supplier]=1; });
  const names = Object.keys(all).sort(); const chosen = d.suppliers||[];
  const scoped = S.scope && S.scope.brands!==null && !S.scope.admin ? (S.scope.brands||[]).map(x=>x.toLowerCase()) : null;
  const ok = n => !scoped || scoped.includes(n.toLowerCase());
  const q = (S.supQ||'').toLowerCase();
  const rows = names.map(n=>`<label class="chk${ok(n)?'':' dis'}" data-name="${E(n.toLowerCase())}" ${q && !n.toLowerCase().includes(q) ? 'hidden' : ''}><input type="checkbox" data-sup="${E(n)}" ${chosen.includes(n)?'checked':''} ${ok(n)||chosen.includes(n)?'':'disabled'}><span class="pn">${E(n)}</span>${ok(n)?'':'<small>outside your brand scope</small>'}</label>`).join('');
  return `<div class="f"><div class="lbl">Supplier${chosen.length>1?'s':''} <span class="cnt" id="supCount">${chosen.length} selected</span></div>
    <div class="supsel" id="supSel">${chosen.map(n=>`<span class="gchip"><b>${E(n)}</b> <button type="button" class="gx" data-act="sup-off" data-sup="${E(n)}" aria-label="Remove ${E(n)}">×</button></span>`).join('')||'<span class="muted">None selected yet.</span>'}</div>
    <div class="pick supbox"><div class="ps one"><input type="search" id="supQ" class="search" placeholder="Search suppliers" aria-label="Search suppliers" value="${E(S.supQ||'')}"></div><div class="pl" id="supList">${rows}</div></div>
    <div class="hint">Products in step 3 are limited to the suppliers chosen here. The first one names the program's group on the Programs page.${scoped?' Your brand scope: '+E((S.scope.brands||[]).join(', ')||'none on file')+'.':''}</div></div>`;
}
function selRows(list){ return list.slice(0,300).map(p=>`<li data-id="${E(p.id)}"><span class="pn">${E(p.name)}</span><span class="pm">${E(p.package||'')}${p.package?' · ':''}#${E(p.id)} · ${E(p.supplier)}</span><button type="button" class="btn sm outline" data-act="rm-product" data-id="${E(p.id)}" aria-label="Remove ${E(p.name)}">Remove</button></li>`).join('') + (list.length>300?`<li><span class="muted">… ${list.length-300} more — search to find them</span></li>`:''); }

// ---- participant picker (patched in place: no re-render on a tick)
function pickerHtml(idp, label, list, chosen, groups, teams, hint){
  const ui = S.pickUI[idp] || (S.pickUI[idp] = {q:'', team:'', selOnly:false});
  const row = p => `<label class="chk${p.ok?'':' dis'}" data-name="${E(p.name.toLowerCase())}" data-team="${E((p.reports_to||'').toLowerCase())}"><input type="checkbox" data-pick-item="${idp}" value="${E(p.name)}" ${chosen.includes(p.name)?'checked':''} ${p.ok?'':'disabled'}><span class="pn">${E(p.name)}</span><small>${E(p.title||'')}${p.ok?'':' · outside your scope'}</small></label>`;
  const body = groups ? Object.keys(groups).sort().map(g=>`<div class="pg" data-group="${E(g.toLowerCase())}">${E(g)}</div>`+groups[g].map(row).join('')).join('') : list.map(row).join('');
  const nOk = list.filter(p=>p.ok).length;
  return `<div class="f"><div class="lbl">${E(label)} <span class="cnt" id="${idp}Count">${chosen.length} selected</span></div>
    <div class="pick" id="${idp}"><div class="ps"><input type="search" class="search" placeholder="Search by name" aria-label="Search ${E(label)}" data-pick="${idp}" value="${E(ui.q)}">
      ${teams && teams.length ? `<select class="teamsel" data-pick-team="${idp}" aria-label="Team"><option value="">All teams</option>${teams.map(t=>`<option value="${E(t.toLowerCase())}" ${ui.team===t.toLowerCase()?'selected':''}>${E(t)}</option>`).join('')}</select>` : ''}
      <button type="button" class="btn sm outline tog" data-act="pick-selonly" data-pick-id="${idp}" aria-pressed="${ui.selOnly?'true':'false'}">Selected Only</button></div>
      <div class="pb"><button type="button" class="btn sm outline" data-act="pick-all" data-pick-id="${idp}">Select All ${nOk} Filtered</button><button type="button" class="btn sm outline" data-act="pick-none" data-pick-id="${idp}">Clear Filtered</button></div>
      <div class="pl">${body}</div></div>${hint?`<div class="hint">${E(hint)}</div>`:''}</div>`;
}
function applyPickFilter(idp){
  const host = document.getElementById(idp); if(!host) return;
  const ui = S.pickUI[idp]; const q = ui.q.toLowerCase().trim();
  let vis = 0;
  host.querySelectorAll('.chk').forEach(r=>{ const cb = r.querySelector('input'); const show = (!q || r.dataset.name.includes(q)) && (!ui.team || r.dataset.team===ui.team) && (!ui.selOnly || cb.checked); r.hidden = !show; if(show && !cb.disabled) vis++; });
  host.querySelectorAll('.pg').forEach(g=>{ let n = g.nextElementSibling, any = false; while(n && !n.classList.contains('pg')){ if(!n.hidden) any = true; n = n.nextElementSibling; } g.hidden = !any; });
  const all = host.querySelector('[data-act=pick-all]'); if(all) all.textContent = 'Select All '+vis+' Filtered';
  const tog = host.querySelector('[data-act=pick-selonly]'); if(tog) tog.setAttribute('aria-pressed', ui.selOnly?'true':'false');
  let empty = host.querySelector('.pl .none'); if(!vis && !host.querySelector('.pl .chk:not([hidden])')){ if(!empty){ empty = document.createElement('div'); empty.className='none'; empty.textContent='Nobody matches.'; host.querySelector('.pl').appendChild(empty); } } else if(empty) empty.remove();
}
function pickChanged(idp){
  const P = S.def.participants; const names = [...document.querySelectorAll(`[data-pick-item=${idp}]:checked`)].map(x=>x.value);
  if(idp==='pickReps') P.reps = names; else P.associates = names;
  resolveParticipants(S.def); S.dirty = true; savedLine();
  const c = document.getElementById(idp+'Count'); if(c) c.textContent = names.length+' selected';
  const nAcc = Object.values(P.accountBase).reduce((t,a)=>t+a.length,0); const base = P.resolved;
  const sum = document.getElementById('partSum'); if(sum) sum.innerHTML = `<span>Participants: <b>${base.reps.length} ${plural(base.reps.length,'rep')}${base.associates.length?' + '+base.associates.length+' '+plural(base.associates.length,'associate'):''}</b></span><span>Eligible accounts: <b>${nAcc}</b></span>`;
  const ee = document.getElementById('stepErrs'); if(ee) ee.innerHTML = (validate(S.def)[2]||[]).map(x=>`<div class="err">${E(x)}</div>`).join('');
  if(S.pickUI[idp] && S.pickUI[idp].selOnly) applyPickFilter(idp);
}

// ---- product selector (Add Products / Exclude Products dialog)
function openProductModal(mode){
  const d = S.def; const pm = S.pm = {mode, q:'', sup:'', fam:'', pkg:'', cat:'', checked:new Set()};
  const have = new Set(d.products.resolved.map(p=>String(p.id)));
  pm.have = have;
  const host = document.createElement('div'); host.className = 'modal'; host.id = 'prodModal'; host.setAttribute('role','dialog'); host.setAttribute('aria-modal','true'); host.setAttribute('aria-labelledby','pmTitle');
  host.innerHTML = `<div class="mbox"><div class="mh"><div><h2 id="pmTitle">${mode==='exclude'?'Exclude Products':'Add Products'}</h2><div class="msub">${(d.suppliers||[]).length?'Limited to '+E((d.suppliers||[]).join(', ')):''}</div></div><button type="button" class="btn sm outline" data-act="pm-cancel" aria-label="Close">×</button></div>
    <div class="mt"><input type="search" id="pmQ" class="search" placeholder="Search by product name or ProductID" aria-label="Search products" autocomplete="off">
      <div class="mf${(d.suppliers||[]).length===1?' one-sup':''}"><select id="pmSup" aria-label="Supplier"><option value="">All suppliers</option></select><select id="pmFam" aria-label="Brand family"><option value="">All brand families</option></select><select id="pmPkg" aria-label="Package"><option value="">All packages</option></select><select id="pmCat" aria-label="Category"><option value="">Draft and package</option><option value="draft">Draft only</option><option value="package">Package only</option></select></div>
      <div class="mg" id="pmGroup"></div></div>
    <div class="ml" id="pmList"></div>
    <div class="mfoot"><span id="pmCount">0 selected</span><span class="r"><button type="button" class="btn outline" data-act="pm-cancel">Cancel</button><button type="button" class="btn primary" data-act="pm-add" disabled>${mode==='exclude'?'Exclude Selected Products':'Add Selected Products'}</button></span></div></div>`;
  document.body.appendChild(host); document.body.classList.add('modal-open');
  fillModalFilters(); renderModalList();
  { const q = document.getElementById('pmQ'); if(q) q.focus(); }   // synchronous: the box is already in the DOM
}
function modalPool(){ const pm = S.pm; const sups = (S.def.suppliers||[]).map(x=>x.toLowerCase()); const all = (S.products.list||[]).filter(p=>!sups.length || sups.includes(String(p.supplier||'').toLowerCase())); return pm.mode==='exclude' ? all.filter(p=>pm.have.has(String(p.id))) : all; }
function fillModalFilters(){
  const pm = S.pm; const pool = modalPool();
  const sel = (id, vals, cur) => { const el = document.getElementById(id); const first = el.options[0].outerHTML; el.innerHTML = first + vals.map(v=>`<option value="${E(v)}" ${v===cur?'selected':''}>${E(v)}</option>`).join(''); };
  const inSup = p => !pm.sup || p.supplier===pm.sup, inFam = p => !pm.fam || p.family===pm.fam, inCat = p => !pm.cat || (pm.cat==='draft' ? p.draft : !p.draft);
  sel('pmSup', [...new Set(pool.filter(p=>inFam(p)&&inCat(p)).map(p=>p.supplier).filter(Boolean))].sort(), pm.sup);
  sel('pmFam', [...new Set(pool.filter(p=>inSup(p)&&inCat(p)).map(p=>p.family).filter(Boolean))].sort(), pm.fam);
  sel('pmPkg', [...new Set(pool.filter(p=>inSup(p)&&inFam(p)&&inCat(p)).map(p=>p.package).filter(Boolean))].sort(), pm.pkg);
}
function modalMatches(){
  const pm = S.pm; const q = pm.q.toLowerCase().trim();
  return modalPool().filter(p=>(!pm.sup||p.supplier===pm.sup)&&(!pm.fam||p.family===pm.fam)&&(!pm.pkg||p.package===pm.pkg)&&(!pm.cat||(pm.cat==='draft'?p.draft:!p.draft))&&(!q||(p.name+' '+p.id).toLowerCase().includes(q)));
}
function renderModalList(){
  const pm = S.pm; const list = modalMatches(); const host = document.getElementById('pmList'); if(!host) return;
  const rows = list.slice(0,200).map(p=>{ const had = pm.mode!=='exclude' && pm.have.has(String(p.id)); return `<label class="chk prow${had?' had':''}"><input type="checkbox" data-pm="${E(p.id)}" ${pm.checked.has(String(p.id))?'checked':''} ${had?'disabled':''}><span class="pn">${E(p.name)}</span><small>${E(p.package||'')}${p.package?' · ':''}#${E(p.id)} · ${E(p.supplier)}${had?' · already selected':''}</small></label>`; }).join('');
  host.innerHTML = rows || '<div class="none">No products match.</div>';
  const more = list.length>200 ? `<div class="none">Showing 200 of ${list.length} — search or filter to narrow.</div>` : '';
  host.insertAdjacentHTML('beforeend', more);
  // a deliberate group add: label exactly what will be added
  const g = document.getElementById('pmGroup'); const grp = pm.mode!=='exclude' && !pm.q.trim() && (pm.fam || (pm.sup && !pm.fam) || (pm.pkg && !pm.fam && !pm.sup)) ? (pm.fam ? {type:'family', value:pm.fam, label:'Brand Family'} : pm.sup ? {type:'supplier', value:pm.sup, label:'Supplier'} : {type:'package', value:pm.pkg, label:'Package'}) : null;
  if(g) g.innerHTML = grp ? `<button type="button" class="btn sm outline" data-act="pm-group" data-type="${grp.type}" data-value="${E(grp.value)}">Add Entire ${grp.label}: ${E(grp.value)} (${list.length} products)</button><span class="hint">Adds the whole group as one rule. Filtering alone selects nothing.</span>` : '';
  modalCount();
}
function modalCount(){ const pm = S.pm; const n = pm.checked.size; const c = document.getElementById('pmCount'); if(c) c.textContent = n+' selected'; const b = document.querySelector('[data-act=pm-add]'); if(b) b.disabled = !n; }
function closeModal(){ const m = document.getElementById('prodModal') || document.getElementById('delModal') || document.getElementById('supModal'); if(m) m.remove(); document.body.classList.remove('modal-open'); S.pm = null; }
function addProducts(ids, mode){
  const d = S.def; const pr = d.products; pr.include = pr.include||[]; pr.exclude = pr.exclude||[];
  const isSku = (s,id) => { const x = Array.isArray(s)?s[0]:s; return x.type==='sku' && String(x.value)===String(id); };
  ids.forEach(id=>{
    if(mode==='exclude'){ pr.include = pr.include.filter(s=>!isSku(s,id)); resolveProductsDef(d); if(pr.resolved.some(p=>String(p.id)===String(id)) && !pr.exclude.some(s=>isSku(s,id))) pr.exclude.push({type:'sku', value:String(id)}); }
    else { pr.exclude = pr.exclude.filter(s=>!isSku(s,id)); if(!pr.include.some(s=>isSku(s,id))) pr.include.push({type:'sku', value:String(id)}); }
  });
  resolveProductsDef(d); S.dirty = true;
}
function removeProduct(id){
  const d = S.def; const pr = d.products; const isSku = (s) => { const x = Array.isArray(s)?s[0]:s; return x.type==='sku' && String(x.value)===String(id); };
  const direct = pr.include.some(isSku);
  pr.include = pr.include.filter(s=>!isSku(s)); resolveProductsDef(d);
  if(pr.resolved.some(p=>String(p.id)===String(id))){ if(!pr.exclude.some(isSku)) pr.exclude.push({type:'sku', value:String(id)}); resolveProductsDef(d); }
  S.dirty = true; return direct;
}

// a supplier is being taken off in Basics: say what goes with it before anything is removed
function supplierOff(sup){
  const d = S.def; const imp = supplierImpact(d, sup);
  if(!imp.any){ d.suppliers = (d.suppliers||[]).filter(x=>x!==sup); d.supplier = d.suppliers[0]||''; S.dirty = true; renderWizard({keep:true}); return; }
  const cb = document.querySelector(`input[data-sup="${CSS.escape(sup)}"]`); if(cb) cb.checked = true;   // nothing changes until confirmed
  const lines = [];
  if(imp.skus.length) lines.push(`<li><b>${imp.skus.length} selected ${plural(imp.skus.length,'product')}</b>: ${E(imp.skus.slice(0,6).map(p=>p.name).join('; '))}${imp.skus.length>6?' …':''}</li>`);
  if(imp.groups.length) lines.push(`<li><b>${imp.groups.length} group ${plural(imp.groups.length,'rule')}</b>: ${E(imp.groups.map(g=>(SEL_LABEL[g.type]||g.type)+' '+g.value).join('; '))}</li>`);
  if(imp.excl.length) lines.push(`<li><b>${imp.excl.length} ${plural(imp.excl.length,'exclusion')}</b> of its products</li>`);
  if(imp.packages.length) lines.push(`<li>${imp.packages.length} package ${plural(imp.packages.length,'rule')} stay${imp.packages.length===1?'s':''}; ${E(sup)} products stop matching ${imp.packages.length===1?'it':'them'}.</li>`);
  const host = document.createElement('div'); host.className = 'modal'; host.id = 'supModal'; host.setAttribute('role','dialog'); host.setAttribute('aria-modal','true');
  host.innerHTML = `<div class="mbox narrow"><div class="mh"><h2>Remove ${E(sup)}?</h2></div><div class="mbody"><p>Products are limited to the suppliers chosen in Basics. Removing ${E(sup)} also removes:</p><ul>${lines.join('')}</ul><p style="margin-top:10px">Keep the supplier to keep these selections.</p></div>
    <div class="mfoot"><span></span><span class="r"><button type="button" class="btn outline" data-act="pm-cancel">Keep Supplier</button><button type="button" class="btn danger" data-act="sup-remove-go" data-sup="${E(sup)}">Remove Supplier and Selections</button></span></div></div>`;
  document.body.appendChild(host); document.body.classList.add('modal-open');
  setTimeout(()=>{ const b = host.querySelector('[data-act=pm-cancel]'); if(b) b.focus(); }, 30);
}

// ---- rendering
function renderWizard(opts){
  const keep = opts && opts.keep; const y = keep ? window.scrollY : 0; const focusId = keep && document.activeElement ? (document.activeElement.id || (document.activeElement.name ? 'name:'+document.activeElement.name : '')) : '';
  const d = S.def; resolveParticipants(d); if(S.products) resolveProductsDef(d);
  const errs = validate(d);
  const n = S.step; S.visited[n] = true;
  const navCls = i => { const vis = S.visited[i]; if(i===n) return ''; if(!vis) return ''; return errs[i] ? 'bad' : 'done'; };
  const nBlock = Object.keys(errs).reduce((t,k)=>t+errs[k].length,0);
  const ph = window.innerWidth <= 760;   // phone footer: one row (‹ · Save · primary)
  app.innerHTML = `<header class="mph"><div><h1>${S.prog?'Edit Program':'Create Program'}</h1><p>${E(d.title||'Untitled')}${d.isTest?' · <span class="tag test">TEST</span>':''}${S.prog?' · version '+(latestVersion(S.prog)||{}).version+(S.prog.approved_version!=null?' (revision of approved v'+S.prog.approved_version+')':''):''}</p></div>
    <div class="acts"><a class="btn sm outline" href="#view=list">All Programs</a>${S.prog && mayDelete(S.prog, true)?`<button class="btn sm outline danger" data-act="delete" data-id="${S.prog.id}">Delete Program</button>`:''}</div></header>
    ${S.msg?`<div class="msg ${S.msg.cls}">${E(S.msg.t)}</div>`:''}
    <div class="wz"><nav class="wzs" aria-label="Steps">${STEPS.map((s,i)=>`<button data-step="${i+1}" ${i+1===n?'aria-current="step"':''} class="${navCls(i+1)}" title="${navCls(i+1)==='bad'?'Needs attention':''}"><i>${navCls(i+1)==='done'?'✓':navCls(i+1)==='bad'?'!':i+1}</i><span>${s}</span></button>`).join('')}</nav>
    <section class="wzp" id="wzp">${stepHtml(n, errs)}
      ${n===LAST?`<p class="submit-note">${S.prog && S.prog.approved_version!=null ? 'Sends this revision to the program approver. The approved version stays live until the revision is approved.' : 'Sends this program to the program approver. Participants see nothing until it is approved'+(d.isTest?' — and a test program is then visible only in manager preview':'')+'.'}${nBlock?' <b>'+nBlock+' '+plural(nBlock,'item')+' to fix first.</b>':''}</p>`:''}
      <div class="wzn stick"><div>${n>1?`<button class="btn outline" data-act="prev" aria-label="Back">${ph?'‹':'Back'}</button>`:''}</div><div class="r"><span class="saved">${savedText()}</span><button class="btn outline" data-act="save" aria-label="Save Draft">${ph?'Save':'Save Draft'}</button>${S.ret==='review' && n<LAST?`<button class="btn primary" data-act="to-review">Return to Review</button>`:''}${n<LAST?`<button class="btn ${S.ret==='review'?'outline':'primary'}" data-act="next">Next</button>`:`<button class="btn primary" data-act="submit" ${nBlock?'disabled':''}>Submit for Approval</button>`}</div></div></section></div>`;
  S.msg = null;
  Object.keys(S.pickUI).forEach(applyPickFilter);
  if(n===LAST) fillReview();
  if(S.focusNext){ const f = document.getElementById(S.focusNext); S.focusNext = null; if(f){ setTimeout(()=>{ f.scrollIntoView({block:'center'}); if(f.focus) f.focus({preventScroll:true}); }, 60); } }
  if(keep){ window.scrollTo(0, y); if(focusId){ const el = focusId.startsWith('name:') ? document.querySelector(`[name="${focusId.slice(5)}"]:checked`) || document.querySelector(`[name="${focusId.slice(5)}"]`) : document.getElementById(focusId); if(el && el.focus) el.focus({preventScroll:true}); } const re = ()=>window.scrollTo(0, y); requestAnimationFrame(()=>requestAnimationFrame(re)); setTimeout(re, 80); }   // the new content lays out over a few frames on phones
}
// read every field of the current step back into the definition
function collect(){
  const d = S.def; const $ = id => document.getElementById(id);
  if(S.step===1 && $('f_title')){ d.title = $('f_title').value.trim(); d.fullName = $('f_full').value.trim(); d.kind = document.querySelector('input[name=kind]:checked').value;
    d.audience = [$('aud_rep').checked?'rep':null, $('aud_assoc').checked?'associate':null].filter(Boolean); d.suppliers = [...document.querySelectorAll("input[data-sup]:checked")].map(x=>x.dataset.sup); d.supplier = d.suppliers[0]||''; d.description = $('f_desc').value.trim(); d.docUrl = $('f_doc').value.trim(); d.docName = $('f_docn').value.trim(); d.isTest = $('f_test').checked; }
  if(S.step===2 && $('af_prem')){ const P = d.participants; P.mode = (document.querySelector('input[name=pmode]:checked')||{}).value||'individual';
    P.teams = [...document.querySelectorAll('[data-team]:checked')].map(x=>x.dataset.team);
    if(document.getElementById('pickReps')) P.reps = [...document.querySelectorAll('[data-pick-item=pickReps]:checked')].map(x=>x.value);
    if(document.getElementById('pickAssoc')) P.associates = [...document.querySelectorAll('[data-pick-item=pickAssoc]:checked')].map(x=>x.value);
    P.accountFilter.premise = $('af_prem').value; const t = $('af_terr').value; P.accountFilter.territory = t==='areas' ? ([...document.querySelectorAll('[data-area]:checked')].map(x=>x.dataset.area)) : t;
    const raw = $('af_accts').value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);
    P.accountFilter.accounts = raw; P.baseMode = (document.querySelector('input[name=bmode]:checked')||{}).value||'fixed';
    resolveParticipants(d);
    if(raw.length){ const known = new Set(); P.resolved.reps.forEach(r=>repBook(r).forEach(a=>known.add(String(a.n)))); P.accountFilter.unmatched = raw.filter(x=>!known.has(String(x))); P.accountFilter.accounts = raw.filter(x=>known.has(String(x))); } else P.accountFilter.unmatched = [];
    resolveParticipants(d); }
  if(S.step===3 && $('advProducts')){ const r = document.querySelector('input[name=pdyn]:checked'); d.products.dynamic = !!(r && r.value==='dynamic' && !r.disabled && hasGroupSelection(d)); }
  if(S.step===4){ d.objectives.forEach(o=>{ const host = document.querySelector(`.obj[data-obj="${o.id}"]`); if(!host) return;
      const k = kindOf(o); const wasMerch = isMerch(o); const ms = (host.querySelector(`input[name=ms_${o.id}]:checked`)||{}).value || k.measure;
      let unit = (host.querySelector(`[data-o="${o.id}"][data-k="unit"]`)||{}).value || k.unit, qual = (host.querySelector(`[data-o="${o.id}"][data-k="qual"]`)||{}).value || k.qual;
      if(ms!==k.measure){ unit = UNITS[ms][0][0]; qual = QUALS[ms][0][0]; }   // the measure changed: its own first unit / qualification, never a stale one
      o.metric = metricFrom(ms, qual, unit); if(ms==='volume') o.volumeUnit = unit==='units' ? 'units' : 'cases';
      if(wasMerch && ms!=='merch') o.followOn = {start:'',end:''};   // custom activity dates were stored there; they are not a follow-on period
      host.querySelectorAll(`[data-o="${o.id}"]`).forEach(el=>{ const kk = el.dataset.k; if(kk==='unit'||kk==='qual') return; const v = el.type==='checkbox' ? el.checked : el.value; if(kk.includes('.')){ const [a,b] = kk.split('.'); o[a] = o[a]||{}; o[a][b] = v; } else o[kk] = (kk==='minSkus'||kk==='minCases') ? Number(v) : v; });
      normalizeObjective(o); }); }
  if(S.step===5 && $('pe_type')){ const pe = d.period; pe.type = $('pe_type').value; pe.start = $('pe_start').value; pe.end = $('pe_end').value; if($('pe_roll')) pe.rollingDays = Number($('pe_roll').value)||90;
    d.objectives.forEach(o=>{ document.querySelectorAll(`.obj[data-obj="${o.id}"] [data-o="${o.id}"]`).forEach(el=>{ const k = el.dataset.k; const v = el.type==='checkbox' ? el.checked : el.value; if(k.includes('.')){ const [a,b] = k.split('.'); o[a] = o[a]||{}; o[a][b] = v; } else o[k] = k==='nonBuyDays' ? Number(v) : v; }); normalizeObjective(o); }); }
  if(S.step===6){ d.objectives.forEach(o=>{ const g = o.goal; const r = document.querySelector(`input[name=gt_${o.id}]:checked`); if(r) g.type = r.value;
    document.querySelectorAll(`[data-g="${o.id}"]`).forEach(el=>{ const k = el.dataset.k; if(k==='perRep'){ g.perRep = g.perRep||{}; g.perRep[el.dataset.rep] = el.value===''?'':Number(el.value); } else if(k==='pctPercent'){ g.pct = el.value===''?'':Number(el.value)/100; } else g[k] = el.value===''?'':(k==='rounding'?el.value:Number(el.value)); }); }); }
  if(S.step===7 && $('fin_notes')){ const F = S.fin; F.items = F.items||[]; document.querySelectorAll('[data-f]').forEach(el=>{ const it = F.items[Number(el.dataset.f)]; if(!it) return; const k = el.dataset.k; it[k] = (k==='rate'||k==='rateBoth') ? (el.value===''?null:Number(el.value)) : el.value; }); F.notes = (document.getElementById('fin_notes')||{}).value||''; }
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
// ---- Review & Submit (step 8) and the approver's review page share reviewSections()
function reviewHtml(errs){
  return `<h2>Review & Submit</h2><p class="lead">Check the configuration, then send it to the program approver.</p>
    <div class="pv" id="pvBody"><div class="kdh-state loading">Computing from the sales record…</div></div>
    <div id="pvWarn"></div>`;
}
async function fillReview(){
  const d = S.def; const host = document.getElementById('pvBody'); if(!host) return;
  const errs = validate(d);
  const reps = d.participants.resolved.reps.slice(0,3);
  const R = await evaluateFor(d, reps);
  const first = reps[0] ? R[reps[0]] : null;
  const scopeWhy = await (async()=>{ try{ return await D.rpc('kdh_program_scope_problem', {def:d}); }catch(e){ return null; } })();
  let warn = [];
  if(d.isTest) warn.push('TEST program: visible only to managers previewing a participant; never in payouts, recaps or participant notices.');
  (d.objectives||[]).forEach(o=>{ const r = first && first.objectives.find(x=>x.id===o.id); if(r && r.support!=='supported' && r.support!=='awaiting_data') warn.push(objName(o)+': '+KP.SUPPORT_LABEL[r.support]+(r.notes[0]?' — '+r.notes[0]:'')+(d.isTest?'':' · a real program cannot be published until this is resolved.')); });
  if(scopeWhy) warn.push('Scope: '+scopeWhy);
  if(document.getElementById('pvBody')!==host) return;
  host.innerHTML = reviewSections(d, S.fin, R, reps, first, {edit:true, errs, prog:S.prog});
  const w = document.getElementById('pvWarn');
  if(w) w.innerHTML = warn.length ? `<div class="warnings" style="margin-top:14px"><h3>Check Before Submitting</h3><ul>${warn.map(x=>`<li>${E(x)}</li>`).join('')}</ul></div>` : '';
  const hardBlock = scopeWhy || (!d.isTest && (d.objectives||[]).some(o=>{ const r = first && first.objectives.find(x=>x.id===o.id); return r && !['supported','awaiting_data'].includes(r.support); }));
  const b = document.querySelector('[data-act=submit]'); if(b && hardBlock) b.disabled = true;
}
const SEC_STEP = {objectives:4, participants:2, products:3, dates:5, finance:7};
// stacked sections (Zillow review pattern): label / value rows, an Edit action per editable section, one place per fact
function reviewSections(d, F, R, reps, first, opt){
  opt = opt||{}; const edit = !!opt.edit; const errs = opt.errs||{};
  const HB = window.HUB_ACCOUNTS || (typeof HUB_ACCOUNTS!=='undefined' ? HUB_ACCOUNTS : {});
  const P = d.participants||{}; const res = P.resolved||{reps:[],associates:[]}; const accN = Object.values(P.accountBase||{}).reduce((t,a)=>t+a.length,0);
  const prodN = (d.products.resolved||[]).length; const sups = (d.suppliers||[]).length ? d.suppliers : (d.supplier ? [d.supplier] : []);
  const secErrs = (steps)=>[].concat(...steps.map(n=>(errs[n]||[]).map(x=>({step:n, m:errText(x), f:x.f}))));
  const errHtml = (list)=>list.length?`<ul class="rs-err">${list.map(b=>`<li>${E(b.m)}${edit?` <button type="button" class="lnk" data-act="edit-step" data-step="${b.step}"${b.f?` data-focus="${E(b.f)}"`:''}>Fix</button>`:''}</li>`).join('')}</ul>`:'';
  const kv = rows => `<dl class="kvrows">${rows.filter(r=>r && r[1]!=null && r[1]!=='').map(r=>`<div><dt>${E(r[0])}</dt><dd>${r[2]?r[1]:E(r[1])}</dd></div>`).join('')}</dl>`;
  const sec = (id, title, status, body, open, list) => `<details class="rsec${list&&list.length?' bad':''}" id="rs_${id}" ${open||(list&&list.length)?'open':''}><summary><span class="rs-t">${E(title)}</span><span class="rs-s">${list&&list.length ? `<span class="tag bad">${list.length} to fix</span>` : E(status||'')}</span>${edit && SEC_STEP[id] ? `<button type="button" class="btn sm outline rs-e" data-act="edit-step" data-step="${SEC_STEP[id]}">Edit</button>` : ''}<i class="rs-c" aria-hidden="true"></i></summary><div class="rs-b">${errHtml(list||[])}${body}</div></details>`;
  // summary strip
  const aud = (d.audience||[]).map(a=>a==='rep'?'Sales Reps':'Sales Associates').join(' + ');
  const strip = `<div class="rv-sum"><div class="rv-t">${E(d.title||'Untitled')} ${d.isTest?'<span class="tag test">TEST</span>':''}<span class="tag">${d.kind==='mpo'?'MPO':'Incentive'}</span></div>
    <div class="rv-m"><span>Supplier${sups.length>1?'s':''} <b>${E(sups.join(', ')||'—')}</b></span><span>Dates <b>${E(KP.periodText(d.period||{}))}</b></span><span>Audience <b>${E(aud||'—')}</b></span><span>Participants <b>${res.reps.length} ${plural(res.reps.length,'rep')}${res.associates.length?' + '+res.associates.length+' '+plural(res.associates.length,'associate'):''}</b></span><span>Eligible Accounts <b>${accN}</b></span>${opt.prog&&opt.prog.owner_name?`<span>Owner <b>${E(opt.prog.owner_name)}</b></span>`:''}</div></div>`;
  // 1 objectives & goals
  const objRows = (d.objectives||[]).map((o,i)=>{ const k = kindOf(o); const q = (QUALS[k.measure]||[]).find(x=>x[0]===k.qual); const u = (UNITS[k.measure]||[]).find(x=>x[0]===k.unit);
    const rules = []; if(Number(o.minSkus)>1) rules.push(o.minSkus+'+ different products per account'); if(Number(o.minCases)>0) rules.push(o.minCases+'+ cases per account'); if(o.premise && o.premise!=='any') rules.push((o.premise==='off'?'Off':'On')+'-premise accounts only'); if(isMerch(o) && o.merch && o.merch.category && o.merch.category!=='any') rules.push((MERCH_CATS.find(c=>c[0]===o.merch.category)||[])[1]); if(o.merch && o.merch.needBeforeAfter) rules.push('Before-and-after photos');
    const combo = []; if(o.logic==='alternative') combo.push('Alternative: any one alternative qualifies'); if(o.logic==='prerequisite') combo.push('Prerequisite: unlocks other objectives'); if(o.requires){ const x = d.objectives.find(y=>y.id===o.requires); if(x) combo.push('Unlocked by '+objName(x)); }
    return `<div class="rs-obj"><h4>${E(objName(o))}</h4>${kv([['Measure', KP.MEASURE_TEXT[o.metric]||metricRow(o.metric)[1]], ['Unit', u?u[1]:k.unit], ['Qualification', q?q[1]:''], ['Who It Counts For', o.scope==='house'?'Team Total':'Each Participant'], ['Goal', KP.goalSummary(o)], rules.length?['Counting Rules', rules.join(' · ')]:null, combo.length?['Combination', combo.join(' · ')]:null])}</div>`; }).join('') || '<p class="muted">No objectives yet.</p>';
  const s1 = sec('objectives', 'Objectives & Goals', (d.objectives||[]).length+' '+plural((d.objectives||[]).length,'objective'), objRows, true, secErrs([4,6]));
  // 2 participants & accounts
  const af = P.accountFilter||{}; const filt = [af.premise&&af.premise!=='any'?(af.premise==='off'?'Off-Premise':'On-Premise'):'Any premise', af.territory==='core'?'Core Market':af.territory==='southern'?'Southern District':Array.isArray(af.territory)?'Areas: '+af.territory.join(', '):'Any territory', af.accounts&&af.accounts.length?af.accounts.length+' specific accounts':null].filter(Boolean).join(' · ');
  const s2 = sec('participants', 'Participants & Accounts', res.reps.length+' '+plural(res.reps.length,'rep')+' · '+accN+' accounts', kv([['Participants', res.reps.concat(res.associates).join(', ')||'None selected'], ['Chosen By', P.mode==='all'?'Everyone I manage':P.mode==='team'?'Team: '+(P.teams||[]).join(', '):'Individuals'], ['Eligible Accounts', accN+' · '+filt], ['Account List', P.baseMode==='dynamic'?'Updates With Route Changes':'Fixed at Program Start']]), false, secErrs([2]));
  // 3 products
  const pr = d.products||{}; const groups = (pr.include||[]).map(x=>Array.isArray(x)?x[0]:x).filter(g=>g.type!=='sku'); const excl = (pr.exclude||[]).map(x=>Array.isArray(x)?x[0]:x).filter(g=>g.type==='sku');
  const needProducts = (d.objectives||[]).some(o=>!['units','growth','merch','photos'].includes(o.metric));
  const s3 = sec('products', 'Qualifying Products', prodN ? prodN+' Selected' : (needProducts ? 'None selected' : 'Not needed'), prodN ? kv([['Products', prodN+' Selected'], ['Selection', (pr.resolved||[]).slice(0,8).map(p=>p.name).join('; ')+(prodN>8?' · +'+(prodN-8)+' more':'')], groups.length?['Group Rules', groups.map(g=>(SEL_LABEL[g.type]||g.type)+': '+(g.type==='draft'?(g.value==='draft'?'Draft only':'Package only'):g.value)).join(' · ')]:null, excl.length?['Excluded', excl.length+' '+plural(excl.length,'product')]:null, ['Product List', pr.dynamic?'New matching products join automatically':'Kept as approved']]) : `<p class="muted">${needProducts?'No products selected yet.':'This program measures cases or merchandising activity only, so no product list is required.'}</p>`, false, secErrs([3]));
  // 4 dates & rules (period + each objective's own rule lines; nothing repeated from section 1)
  const pe = d.period||{}; const dateRows = [['Program Period', KP.periodText(pe)+(pe.type==='rolling'?' · rolling '+(pe.rollingDays||90)+' days':'')], ['Credit Event', 'Sales month (monthly sales record)']];
  const objDates = (d.objectives||[]).map(o=>{ const r = KP.objectiveRule(o, pe).filter(x=>!/different qualifying products|cases per account|premise accounts only|alternatives|unlocks/.test(x)); const base = isMerch(o) ? 'Records dated '+(o.actDates==='custom'&&o.followOn.start?KP.periodText(o.followOn):'in the program period')+' count; no purchase window' : usesLookback(o) ? '' : usesComparison(o) ? '' : 'Purchases in the program period; no lookback or comparison period'; return `<div><dt>${E(objName(o))}</dt><dd>${E([base].concat(r.map(x=>x.charAt(0).toUpperCase()+x.slice(1))).filter(Boolean).join(' · '))}</dd></div>`; }).join('');
  const s4 = sec('dates', 'Dates & Rules', KP.periodText(pe), kv(dateRows)+(objDates?`<dl class="kvrows">${objDates}</dl>`:''), false, secErrs([5]));
  // 5 finance (manager-only)
  const finBody = `<p class="lock">Manager-only. Participants never receive these fields.</p>${F&&F.items&&F.items.length ? `<ul class="rs-list">${F.items.map((it,i)=>{ const o = it.objectiveId ? (d.objectives||[]).find(x=>x.id===it.objectiveId) : null; return `<li><b>Payout ${i+1}</b> · ${E(o?objName(o):'Whole program')} · ${E(it.kind==='flat'?'Flat $'+(it.rate==null?'—':it.rate)+' when met':it.kind==='per_unit'?'$'+(it.rate==null?'—':it.rate)+' per unit':it.kind==='tiered'?'Tiered':'Package rates')}${it.qualifier?' · paid only when '+E(objName((d.objectives||[]).find(x=>x.id===it.qualifier)||{label:'?'}))+' is met':''}${it.houseEffect?' · team condition: '+E(it.houseEffect):''}</li>`; }).join('')}</ul>` : '<p class="muted">No payout terms. A program can be approved without them.</p>'}${F&&F.notes?`<p><b>Notes for the approver:</b> ${E(F.notes)}</p>`:''}`;
  const s5 = `<details class="rsec money" id="rs_finance"><summary><span class="rs-t">Financial Terms</span><span class="rs-s">${F&&F.items&&F.items.length ? F.items.length+' payout '+plural(F.items.length,'term') : 'None'} · manager-only</span>${edit?`<button type="button" class="btn sm outline rs-e" data-act="edit-step" data-step="7">Edit</button>`:''}<i class="rs-c" aria-hidden="true"></i></summary><div class="rs-b">${finBody}</div></details>`;
  // 6 data readiness (not configuration: what the site can compute today)
  const objR = first ? first.objectives : []; const sup = objR.map(r=>r.support);
  const ready = !first ? 'unavailable' : sup.every(x=>x==='supported') ? 'ready' : sup.some(x=>x==='supported') || sup.some(x=>x==='awaiting_data') ? 'limited' : 'unavailable';
  const readyLabel = {ready:'Ready', limited:'Limited', unavailable:'Not Available'}[ready];
  const missing = objR.filter(r=>r.support!=='supported').map(r=>r.label+': '+KP.SUPPORT_LABEL[r.support]+(r.notes[0]?' — '+r.notes[0]:''));
  const s6 = sec('readiness', 'Data Readiness', readyLabel, kv([['Status', readyLabel], ['Sales Data', first ? (first.through ? 'Through '+monthLbl(first.through)+(first.loaded?' · loaded '+E(String(first.loaded).slice(0,10)):'') : 'No sales history for the first participant') : 'No participant to compute for'], ['Account Books', HB.asOf ? 'As of '+HB.asOf : '—'], ['Merchandising', (d.objectives||[]).some(isMerch) ? 'Hub records, counted as recorded (not verified)' : null], missing.length?['Missing Inputs', missing.join(' · ')]:null]), ready!=='ready', []);
  // 7 progress so far (calculated results, kept apart from the configuration)
  const notReady = objR.filter(r=>r.notReady); const anyCalc = objR.some(r=>r.support==='supported' || r.support==='awaiting_evidence');
  const resRows = reps.map(r=>{ const x = R[r]; if(!x || x.error) return `<tr><td>${E(r)}</td><td colspan="3" class="muted">${E(x&&x.error||'—')}</td></tr>`; return x.objectives.map((o,i)=>`<tr>${i===0?`<td rowspan="${x.objectives.length}">${E(r)}</td>`:''}<td>${E(o.label)}</td><td>${E(o.goalText||'—')}</td><td>${o.notReady ? '<span class="tag">Not Yet Available</span>' : o.support==='supported'||o.support==='awaiting_evidence' ? E(o.valueText) : '<span class="tag warn">'+E(KP.SUPPORT_LABEL[o.support])+'</span>'}</td></tr>`).join(''); }).join('');
  const s7 = `<div class="pvcard rs-res"><h3>Progress So Far</h3>${notReady.length ? `<p class="notice">Progress is not available yet. Sales data covers through ${E(monthLbl(first&&first.through))}.</p>` : anyCalc ? `<p class="muted">Computed from the sales record through ${E(monthLbl(first&&first.through))}. A 0 here means the calculation ran and found nothing yet.</p>` : ''}
    <table class="tbl"><thead><tr><th>Participant</th><th>Objective</th><th>Goal</th><th>Current</th></tr></thead><tbody>${resRows||'<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table>
    ${first?`<details class="adv"><summary>View Calculation Details</summary>${KP.objectivesTable(first,true)}${first.primary?exampleRows(first.primary):''}</details>`:''}</div>`;
  // 8 participant preview (the same saved configuration; no financial information)
  const s8 = `<div class="pvcard"><h3>Participant Preview</h3><div class="card-prev">${first?cardPreview(d, first):'<p class="muted">No participant to preview.</p>'}</div><p class="muted" style="margin-top:8px">Drawn from the saved configuration with the rules the Programs page uses; financial terms are never part of it.</p></div>`;
  return strip + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8;
}
function exampleRows(o){
  const c = o.credited.slice(0,3).map(a=>`<tr><td>${E(a.name)}</td><td><span class="tag ok">Counts</span></td><td>${E(a.lines?a.lines.map(l=>l.name).join(', '):(a.bought&&a.bought.length?a.skus+' qualifying SKU'+(a.skus===1?'':'s')+(a.cases?', '+fmt(a.cases)+' cases':''):(a.note||'')))}</td></tr>`);
  const s = o.open.slice(0,3).map(a=>`<tr><td>${E(a.name)}</td><td><span class="tag warn">Still needs…</span></td><td>${E(a.what||'')}</td></tr>`);
  const n = o.support==='supported' ? '' : `<tr><td colspan="3" class="muted">${E(KP.SUPPORT_LABEL[o.support])}: ${E(o.notes[0]||'')}</td></tr>`;
  return `<h4 class="rs-h4">Example Accounts</h4><table class="tbl"><thead><tr><th>Account</th><th>Status</th><th>Why</th></tr></thead><tbody>${c.join('')}${s.join('')}${n}${!c.length&&!s.length&&!n?'<tr><td colspan="3" class="muted">No eligible accounts for the first participant.</td></tr>':''}</tbody></table>`;
}
function cardPreview(d, R){
  const o = R.primary; if(!o) return '<div class="hrow-prev"><div class="t">'+E(d.title)+'</div><div class="s">No objective</div></div>';
  const title = (d.isTest?'TEST — ':'')+d.title;
  return `<div class="hrow-prev"><div class="t">${E(title)}</div><div class="s">${E(d.supplier||'Kohler Programs')} · ${E(KP.periodText(d.period))}</div>
    ${o.goal?`<div class="p">Goal <b>${fmt(o.goal)} ${E(o.unit)}</b></div>`:''}<div class="p">${o.notReady ? '<b>Not Yet Available</b> · '+E(o.goalText||'') : o.goal ? `<b>${fmt(o.value)}</b> of ${fmt(o.goal)} · ${E(o.remainText||'')}` : `<b>${E(o.valueText)}</b> · ${E(o.goalText)}`}</div>
    <div class="bar"><i style="width:${o.notReady?0:(o.pct||0)}%"></i></div><div class="s">${o.notReady ? 'Sales data through '+E(monthLbl(R.through))+' · progress not available yet' : o.support!=='supported' ? E(KP.SUPPORT_LABEL[o.support]) : (R.through?'Sales data through '+E(monthLbl(R.through)):'')}</div></div>`;
}

// ---- review page
async function openReview(id){
  await Promise.all([loadScope(), loadPeople(), loadProducts()]);
  await loadLists(); const p = S.programs.find(x=>x.id===id); if(!p){ S.msg = {cls:'err', t:'Program not found.'}; go({view:'list'}); return; }
  S.prog = p; S.def = null;
  const [ev, fin, co] = await Promise.all([D.rest('program_events?select=version,actor_name,actor_email,action,detail,at&program_id=eq.'+id+'&order=at.desc&limit=50'), D.rest('program_finance?select=version_id,terms,program_versions!inner(program_id,version)&program_versions.program_id=eq.'+id), D.rest('program_closeouts?select=*&program_id=eq.'+id)]);
  const vers = (p.program_versions||[]).slice().sort((a,b)=>b.version-a.version); const latest = vers[0]; const approved = vers.find(v=>v.version===p.approved_version);
  const ph = phase(p); const rev = pendingRevision(p); const deleted = ph==='deleted';
  const canEdit = deleted ? false : await (async()=>{ try{ return await D.rpc('kdh_program_can_edit', {p_program:id}); }catch(e){ return false; } })();
  const finOf = v => { const f = fin.ok && (fin.data||[]).find(x=>x.program_versions && x.program_versions.version===v.version); return f ? f.terms : null; };
  const show = (S.rvVersion && vers.find(v=>v.version===S.rvVersion)) || latest;
  const def = show.definition;
  const reps = (def.participants&&def.participants.resolved&&def.participants.resolved.reps||[]).slice(0, S.rvAll ? 60 : 5);
  app.innerHTML = `<header class="rv-h"><div><h1>${E(def.title)} ${p.is_test?'<span class="tag test">TEST — Not an Active '+(p.kind==='mpo'?'MPO':'Incentive')+'</span>':''}<span class="tag">${p.kind==='mpo'?'MPO':'Incentive'}</span><span class="tag ${PHASE_CLS[ph]||''}">${PHASE_LABEL[ph]}</span>${unpublished(p)&&!deleted?'<span class="tag warn">Not Published</span>':''}</h1>
      <p class="m">${E(def.fullName||'')}${def.fullName?' · ':''}Owner ${E(p.owner_name||p.owner_email)} · ${fmtDate(p.start_date)} – ${fmtDate(p.end_date)} · showing version ${show.version} (${E(show.status)})${vers.length>1?` · <select id="rvVer" class="btn sm outline">${vers.map(v=>`<option value="${v.version}" ${v.version===show.version?'selected':''}>v${v.version} · ${v.status}</option>`).join('')}</select>`:''}</p></div>
      <div class="rv-acts"><a class="btn sm outline" href="#view=list${deleted?'&tab=deleted':''}">All Programs</a>
        ${deleted ? (mayRestore(p) ? `<button class="btn sm primary" data-act="restore" data-id="${id}">Restore Program</button>` : '') : `
        ${canEdit && !['closed','archived'].includes(ph) && show.status!=='submitted' ? `<a class="btn sm" href="#view=edit&id=${id}&step=1">${p.approved_version!=null && !rev ? 'Propose Changes' : 'Edit'}</a>` : ''}
        ${canEdit && ['draft','returned'].includes(show.status) ? `<button class="btn sm primary" data-act="submit-id" data-id="${id}">Submit for Approval</button>` : ''}
        ${canEdit && show.status==='submitted' ? `<button class="btn sm outline" data-act="withdraw" data-id="${id}">Withdraw</button>` : ''}
        ${S.scope.admin && show.status==='submitted' ? `<button class="btn sm primary" data-act="approve" data-id="${id}">Approve</button><button class="btn sm outline" data-act="return" data-id="${id}">Return for Changes</button>` : ''}
        ${S.scope.admin && unpublished(p) && !rev ? `<button class="btn sm primary" data-act="republish" data-id="${id}">Publish Approved v${p.approved_version}</button>` : ''}
        ${S.scope.admin && ph==='ended' ? `<button class="btn sm primary" data-act="closeout" data-id="${id}">Close Out</button>` : ''}
        ${canEdit && ph==='ended' && !rev ? `<a class="btn sm outline" href="#view=edit&id=${id}&step=5">Request Extension</a>` : ''}
        <button class="btn sm outline" data-act="dup" data-id="${id}">Duplicate</button><button class="btn sm outline" data-act="save-tpl" data-id="${id}">Save as Template</button>
        ${canEdit && !['closed','archived'].includes(ph) && (p.approved_version==null || S.scope.admin) ? `<button class="btn sm outline" data-act="archive" data-id="${id}">Archive</button>` : ''}
        ${mayDelete(p, canEdit) ? `<button class="btn sm outline danger" data-act="delete" data-id="${id}">Delete Program</button>` : ''}`}</div></header>
    ${S.msg?`<div class="msg ${S.msg.cls}">${E(S.msg.t)}</div>`:''}
    ${deleted ? `<div class="msg err">Deleted ${E(fmtWhen(p.deleted_at))} by ${E(p.deleted_by||'')} (it was ${E((PHASE_LABEL[p.deleted_from]||p.deleted_from||'').toLowerCase())}). Participants no longer see it. Its definition, approval history and records are kept. Restore brings it back as a draft${p.approved_version!=null?'; the approver must publish it again before participants see it':''}.</div>` : ''}
    ${unpublished(p) && !deleted ? `<div class="msg err">Restored from Deleted Programs. Approved v${p.approved_version} exists but is NOT shown to participants until the approver publishes it again.</div>` : ''}
    ${show.status==='submitted' && !S.scope.admin && !deleted ? `<div class="msg ok">Awaiting approval by the program approver. Only the program approver can approve; you cannot approve your own program.</div>`:''}
    ${show.status==='returned' ? `<div class="msg err">Returned for changes${show.review_note?': '+E(show.review_note):''}.</div>`:''}
    ${rev && show.version===rev.version && approved && !deleted ? `<div class="msg ok">Revision v${rev.version}: the approved v${approved.version} stays live until this is approved.${rev.change_note?' Change note: '+E(rev.change_note):''}</div>`:''}
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
  body.innerHTML = reviewSections(def, F, R, reps, first, {edit:false, prog:p}) + (allReps.length>reps.length?`<p><button class="btn sm outline" data-act="rv-all">Compute all ${allReps.length} participants</button></p>`:'') +
    (approved && p.is_test && !deleted ? `<div class="pvcard"><h3>Participant Preview</h3><p>${allReps.slice(0,12).map(r=>`<button class="btn sm outline" data-act="preview-as" data-rep="${E(r)}">Open Programs as ${E(r)}</button>`).join(' ')}</p><p class="muted">Sets the preview cookie and opens the Programs page as that rep: the test program renders through the real card code.</p></div>` : '');
}

// ---- delete confirmation
function confirmDelete(p){
  const ph = phase(p); const published = p.approved_version!=null && !['draft','returned'].includes(p.status) || ['approved','closed'].includes(p.status);
  const effects = [
    'It moves to Deleted Programs. Nothing is destroyed: its definition, approval history, financial terms and closeout records are kept.',
    ph==='submitted' ? 'It leaves the approval queue.' : null,
    published ? 'It is removed from every participant\'s Programs page and MPO tracker now.' : null,
    'Sales records, account records, photos and other shared data are not touched.',
    'Restore brings it back as a draft' + (p.approved_version!=null ? '; the approver must publish it again before participants see it.' : '.'),
  ].filter(Boolean);
  const host = document.createElement('div'); host.className = 'modal'; host.id = 'delModal'; host.setAttribute('role','dialog'); host.setAttribute('aria-modal','true');
  host.innerHTML = `<div class="mbox narrow"><div class="mh"><h2>Delete "${E(p.title)}"?</h2></div><div class="mbody"><p>${p.is_test?'<span class="tag test">TEST</span> ':''}<span class="tag">${p.kind==='mpo'?'MPO':'Incentive'}</span> <span class="tag ${PHASE_CLS[ph]||''}">${PHASE_LABEL[ph]}</span></p><ul>${effects.map(x=>`<li>${E(x)}</li>`).join('')}</ul></div>
    <div class="mfoot"><span></span><span class="r"><button type="button" class="btn outline" data-act="pm-cancel">Cancel</button><button type="button" class="btn danger" data-act="delete-go" data-id="${p.id}">Delete Program</button></span></div></div>`;
  document.body.appendChild(host); document.body.classList.add('modal-open');
  setTimeout(()=>{ const b = host.querySelector('[data-act=pm-cancel]'); if(b) b.focus(); }, 30);
}

// ---- actions
async function act(a, el){
  const id = el.dataset.id;
  if(a==='new'){ S.prog = null; S.def = blank(); S.fin = {items:[], notes:''}; S.step = 1; S.visited = {}; S.pickUI = {}; go({view:'edit', step:1}); return; }
  if(a==='from-tpl'){ const t = (S.templates||[]).find(x=>x.id===id); if(!t) return; S.prog = null; S.def = upgradeDef(Object.assign(blank(), JSON.parse(JSON.stringify(t.definition)), {isTest:true})); S.def.title = (S.def.title||t.name)+' (from template)'; S.fin = {items:[], notes:''}; S.visited = {}; S.pickUI = {}; go({view:'edit', step:1}); return; }
  if(a==='del-tpl'){ if(!confirm('Remove this template?')) return; await D.rest('program_templates?id=eq.'+id, {method:'DELETE'}); await loadLists(); renderList(); return; }
  if(a==='dup'){ const t = prompt('Title for the copy (it is created as a TEST program):'); if(t===null) return; try{ const r = await D.rpc('kdh_program_duplicate', {p_program:id, p_title:t}); await loadLists(); S.msg = {cls:'ok', t:'Copied as a test program.'}; go({view:'review', id:r.id}); }catch(e){ S.msg = {cls:'err', t:e.message}; route(); } return; }
  if(a==='save-tpl'){ const p = S.programs.find(x=>x.id===id); const v = latestVersion(p); const name = prompt('Template name:', v.definition.title); if(!name) return; const def = JSON.parse(JSON.stringify(v.definition)); def.participants.resolved = {reps:[], associates:[]}; def.participants.accountBase = {}; def.participants.reps = []; def.participants.teams = []; const r = await D.rest('program_templates', {method:'POST', body:{name, definition:def, owner_email:(U.email||'').toLowerCase(), owner_name:U.manager||U.name}}); S.msg = r.ok ? {cls:'ok', t:'Template saved (participants and money left out).'} : {cls:'err', t:'Could not save the template: '+(r.data&&r.data.message||r.status)}; await loadLists(); route(); return; }
  if(a==='archive'){ if(!confirm('Archive this program? It leaves every list.')) return; try{ await D.rpc('kdh_program_archive', {p_program:id}); await loadLists(); S.msg={cls:'ok',t:'Archived.'}; go({view:'list'}); }catch(e){ S.msg={cls:'err',t:e.message}; route(); } return; }
  if(a==='delete'){ const p = S.programs.find(x=>x.id===id) || S.prog; if(!p) return; if(S.view==='edit') collect(); confirmDelete(p); return; }
  if(a==='delete-go'){ closeModal(); try{ await D.rpc('kdh_program_delete', {p_program:id, p_note:null}); await loadLists(); S.msg={cls:'ok', t:'Moved to Deleted Programs. Restore it from there if needed.'}; S.prog = null; S.def = null; S.dirty = false; go({view:'list', tab:'deleted'}); if(S.view==='list') route(); }catch(e){ S.msg={cls:'err', t:'Not deleted: '+e.message}; route(); } return; }
  if(a==='restore'){ try{ const st = await D.rpc('kdh_program_restore', {p_program:id}); await loadLists(); const p = S.programs.find(x=>x.id===id); S.msg={cls:'ok', t:'Restored as a '+(PHASE_LABEL[st]||st).toLowerCase()+'.'+(p && p.approved_version!=null ? ' It is not published: the approver can publish the approved version again from its page.' : '')}; go({view:'review', id}); if(location.hash.includes('view=review')) route(); }catch(e){ S.msg={cls:'err', t:'Not restored: '+e.message}; route(); } return; }
  if(a==='republish'){ if(!confirm('Publish the approved version again? Participants will see it on their Programs page.')) return; try{ const st = await D.rpc('kdh_program_republish', {p_program:id}); await loadLists(); S.msg={cls:'ok', t:'Published again ('+st+'). Participants get a notice.'}; }catch(e){ S.msg={cls:'err', t:e.message}; } route(); return; }
  if(a==='save'){ collect(); await save(false); renderWizard({keep:true}); return; }
  if(a==='prev'){ collect(); S.step = Math.max(1, S.step-1); await save(true); go({view:'edit', id:S.prog?S.prog.id:null, step:S.step, ret:S.ret}); return; }
  if(a==='next'){ collect(); S.step = Math.min(LAST, S.step+1); await save(true); go({view:'edit', id:S.prog?S.prog.id:null, step:S.step, ret:S.ret}); return; }
  // Review -> Edit: open the step, keep everything, come back with "Return to Review" (the focus target is remembered for the next render)
  if(a==='edit-step'){ if(S.view==='edit') collect(); const n = Number(el.dataset.step)||1; S.focusNext = el.dataset.focus||null; S.step = n; S.ret = 'review'; save(true).then(()=>{}); go({view:'edit', id:S.prog?S.prog.id:null, step:n, ret:'review'}); return; }
  if(a==='go-step'){ collect(); const n = Number(el.dataset.step)||1; S.step = n; save(true).then(()=>{}); go({view:'edit', id:S.prog?S.prog.id:null, step:n, ret:S.ret}); return; }   // a plain jump (keeps a review return only if one is already set)
  if(a==='to-review'){ collect(); S.step = LAST; await save(true); S.ret = null; go({view:'edit', id:S.prog?S.prog.id:null, step:LAST}); return; }
  if(a==='same-last-year'){ collect(); const o = S.def.objectives.find(x=>x.id===id); const pe = S.def.period; if(o && pe.start && pe.end){ o.comparison = {start:shiftYear(pe.start), end:shiftYear(pe.end)}; S.dirty = true; } renderWizard({keep:true}); return; }
  if(a==='rm-outscope'){ collect(); const d = S.def; const oos = outOfScope(d); const sups = (d.suppliers||[]).length ? null : (d.products.resolved||[]); (sups||oos).forEach(p=>removeProduct(p.id)); d.products.exclude = (d.products.exclude||[]).filter(x=>{ const g = Array.isArray(x)?x[0]:x; return !(g.type==='sku' && (sups||oos).some(p=>String(p.id)===String(g.value))); }); if(!(d.suppliers||[]).length){ d.products.include = []; d.products.exclude = []; } resolveProductsDef(d); if(!hasGroupSelection(d)) d.products.dynamic = false; S.dirty = true; renderWizard({keep:true}); return; }
  if(a==='sup-off'){ collect(); supplierOff(el.dataset.sup); return; }
  if(a==='sup-remove-go'){ closeModal(); removeSupplier(S.def, el.dataset.sup); S.msg = {cls:'ok', t:'Removed '+el.dataset.sup+' and its selections.'}; renderWizard({keep:true}); return; }
  if(a==='submit'){ collect(); const r = await save(true); if(!r) { renderWizard({keep:true}); return; } return submitId(r.id); }
  if(a==='submit-id') return submitId(id);
  if(a==='withdraw'){ try{ await D.rpc('kdh_program_withdraw', {p_program:id}); S.msg={cls:'ok',t:'Withdrawn; it is a draft again.'}; }catch(e){ S.msg={cls:'err',t:e.message}; } await loadLists(); route(); return; }
  if(a==='approve' || a==='return'){ const p = S.programs.find(x=>x.id===id); const isRev = p.approved_version!=null; const host = document.getElementById('rvAction');
    host.innerHTML = `<div class="pvcard note-box"><h3>${a==='approve'?'Approve This Version':'Return for Changes'}</h3>${isRev && a==='approve' ? `<div class="f"><label>This changes a published program. Earlier credit:</label><div class="radios"><label><input type="radio" name="recalc" value="future" checked>Apply from now on (keep earlier credit)</label><label><input type="radio" name="recalc" value="retroactive">Recalculate from the start</label></div><div class="hint">Historical credit is never changed silently.</div></div>`:''}<textarea id="rvNote" placeholder="${a==='approve'?'Note (optional)':'What needs to change'}"></textarea><div class="r" style="display:flex;gap:8px"><button class="btn primary" data-act="${a}-go" data-id="${id}">${a==='approve'?'Approve':'Return'}</button><button class="btn outline" data-act="cancel-act">Cancel</button></div></div>`; host.scrollIntoView({block:'center'}); return; }
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
  // participants
  if(a==='pick-selonly'){ const idp = el.dataset.pickId; S.pickUI[idp].selOnly = !S.pickUI[idp].selOnly; applyPickFilter(idp); return; }
  if(a==='pick-all' || a==='pick-none'){ const idp = el.dataset.pickId; document.querySelectorAll(`#${idp} .chk:not([hidden]) input:not(:disabled)`).forEach(cb=>{ cb.checked = a==='pick-all'; }); pickChanged(idp); return; }
  // products
  if(a==='add-products'){ collect(); openProductModal('add'); return; }
  if(a==='exclude-products'){ collect(); openProductModal('exclude'); return; }
  if(a==='pm-cancel'){ closeModal(); return; }
  if(a==='pm-add'){ const pm = S.pm; if(!pm) return; const ids = [...pm.checked]; addProducts(ids, pm.mode); closeModal(); S.msg = {cls:'ok', t:(pm.mode==='exclude'?'Excluded ':'Added ')+ids.length+' '+plural(ids.length,'product')+'.'}; renderWizard({keep:true}); return; }
  if(a==='pm-group'){ const pm = S.pm; if(!pm) return; const sel = {type:el.dataset.type, value:el.dataset.value}; const pr = S.def.products; if(!pr.include.some(s=>{ const x = Array.isArray(s)?s[0]:s; return x.type===sel.type && String(x.value).toLowerCase()===sel.value.toLowerCase(); })) pr.include.push(sel); resolveProductsDef(S.def); S.dirty = true; closeModal(); S.msg = {cls:'ok', t:'Added the whole '+SEL_LABEL[sel.type].toLowerCase()+' '+sel.value+' ('+pr.resolved.length+' products selected now).'}; renderWizard({keep:true}); return; }
  if(a==='rm-product'){ collect(); removeProduct(el.dataset.id); renderWizard({keep:true}); return; }
  if(a==='restore-product'){ collect(); const pr = S.def.products; pr.exclude = pr.exclude.filter(s=>{ const x = Array.isArray(s)?s[0]:s; return !(x.type==='sku' && String(x.value)===String(el.dataset.id)); }); resolveProductsDef(S.def); S.dirty = true; renderWizard({keep:true}); return; }
  if(a==='rm-group'){ collect(); S.def.products.include.splice(Number(el.dataset.i),1); resolveProductsDef(S.def); S.dirty = true; renderWizard({keep:true}); return; }
  if(a==='add-obj'){ collect(); S.def.objectives.push(newObjective()); renderWizard({keep:true}); return; }
  if(a==='del-obj'){ collect(); S.def.objectives = S.def.objectives.filter(o=>o.id!==id); renderWizard({keep:true}); return; }
  if(a==='add-fin'){ collect(); S.fin.items = S.fin.items||[]; S.fin.items.push({objectiveId:'', kind:'per_unit', rate:null, qualifier:'', houseEffect:'', billback:''}); renderWizard({keep:true}); return; }
  if(a==='del-fin'){ collect(); S.fin.items.splice(Number(el.dataset.i),1); renderWizard({keep:true}); return; }
}
async function submitId(id){
  try{ const r = await D.rpc('kdh_program_submit', {p_program:id}); S.msg = {cls:'ok', t:'Submitted for approval (version '+r.version+').'}; await loadLists(); go({view:'review', id}); if(location.hash.includes('view=review')) route(); }
  catch(e){ S.msg = {cls:'err', t:'Not submitted: '+e.message}; await loadLists(); route(); }
}

// ---- events
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-act]'); if(b){ e.preventDefault(); act(b.dataset.act, b); return; }
  if(e.target.classList && e.target.classList.contains('modal')){ closeModal(); return; }
  if(!app.contains(e.target)) return;
  const t = e.target.closest('[data-tab]'); if(t){ S.tab = t.dataset.tab; go({view:'list', tab:S.tab}); return; }
  const s = e.target.closest('.wzs [data-step]'); if(s){ collect(); S.step = Number(s.dataset.step); save(true).then(()=>{}); go({view:'edit', id:S.prog?S.prog.id:null, step:S.step, ret:S.ret}); return; }
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && (document.getElementById('prodModal')||document.getElementById('delModal')||document.getElementById('supModal'))){ closeModal(); } });
document.addEventListener('change', e=>{
  const el = e.target;
  if(el.dataset.pm!=null){ const pm = S.pm; if(!pm) return; if(el.checked) pm.checked.add(String(el.dataset.pm)); else pm.checked.delete(String(el.dataset.pm)); modalCount(); return; }
  if(['pmSup','pmFam','pmPkg','pmCat'].includes(el.id)){ const pm = S.pm; if(!pm) return; pm.sup = document.getElementById('pmSup').value; pm.fam = document.getElementById('pmFam').value; pm.pkg = document.getElementById('pmPkg').value; pm.cat = document.getElementById('pmCat').value; fillModalFilters(); renderModalList(); return; }
  if(!app.contains(el)) return;
  if(el.id==='tplSel' && el.value){ act('from-tpl', {dataset:{id:el.value}}); return; }
  if(el.id==='rvVer'){ S.rvVersion = Number(el.value); route(); return; }
  if(S.view!=='edit') return;
  if(el.dataset.pickItem){ pickChanged(el.dataset.pickItem); return; }
  if(el.dataset.pickTeam){ S.pickUI[el.dataset.pickTeam].team = el.value; applyPickFilter(el.dataset.pickTeam); return; }
  if(el.name==='bmode' || el.name==='pdyn'){ collect(); document.querySelectorAll(`input[name=${el.name}]`).forEach(r=>r.closest('.ocard').classList.toggle('on', r.checked)); S.dirty = true; savedLine(); return; }
  if(el.name==='pmode' || el.id==='af_terr' || el.dataset.team!=null || el.dataset.area!=null || el.id==='aud_rep' || el.id==='aud_assoc' || el.name==='kind'){ collect(); renderWizard({keep:true}); return; }
  if(el.dataset.sup!=null){ collect(); if(!el.checked){ supplierOff(el.dataset.sup); return; } S.dirty = true; renderWizard({keep:true}); return; }
  if(el.name && /^ms_/.test(el.name)){ collect(); renderWizard({keep:true}); return; }
  if(el.dataset.o && ['unit','qual','logic','actDates'].includes(el.dataset.k)){ collect(); renderWizard({keep:true}); return; }
  if(el.name && /^gt_/.test(el.name)){ collect(); renderWizard({keep:true}); return; }
  if(el.dataset.g && (el.dataset.k==='pctPercent' || el.dataset.k==='rounding')){ collect(); renderWizard({keep:true}); return; }
  if(el.id==='pe_type' || el.id==='pe_start' || el.id==='pe_end'){ collect(); renderWizard({keep:true}); return; }
  if(el.dataset.f && (el.dataset.k==='kind' || el.dataset.k==='houseEffect')){ collect(); renderWizard({keep:true}); return; }
  S.dirty = true; savedLine();
});
document.addEventListener('input', e=>{
  const el = e.target;
  if(el.id==='pmQ'){ if(S.pm){ S.pm.q = el.value; renderModalList(); } return; }
  if(!app.contains(el)) return;
  if(el.dataset.pick){ S.pickUI[el.dataset.pick].q = el.value; applyPickFilter(el.dataset.pick); return; }
  if(el.id==='pq'){ S.pq = el.value; const q = el.value.toLowerCase(); const list = S.def.products.resolved.filter(p=>!q||(p.name+' '+p.id).toLowerCase().includes(q)); const ul = document.getElementById('selProducts'); if(ul) ul.innerHTML = selRows(list) || '<li><span class="muted">No selected product matches.</span></li>'; return; }
  if(el.id==='supQ'){ S.supQ = el.value; const q = el.value.toLowerCase(); document.querySelectorAll('#supList .chk').forEach(r=>{ r.hidden = !!q && !r.dataset.name.includes(q); }); return; }
  if(el.dataset.o && el.dataset.k==='label'){ const o = S.def.objectives.find(x=>x.id===el.dataset.o); if(o){ o.label = el.value; } }
  if(el.dataset.o && el.dataset.k==='nonBuyDays'){ const b = el.closest('.f').querySelector('.js-nbdays'); if(b) b.textContent = el.value||'…'; }
  S.dirty = true; savedLine();
});
window.addEventListener('beforeunload', e=>{ if(S.dirty && S.view==='edit'){ e.preventDefault(); e.returnValue = ''; } });

// ---- routing
async function route(){
  const h = readHash(); S.view = h.view || 'list'; closeModal();
  if(S.view==='edit'){ await openEdit(h.id||null, h.step); return; }
  if(S.view==='review'){ await openReview(h.id); return; }
  S.tab = h.tab || S.tab || 'drafts'; await renderList();
}
window.addEventListener('hashchange', route);
(async function boot(){ await loadLists(); await loadScope(); await route(); })();
})();
