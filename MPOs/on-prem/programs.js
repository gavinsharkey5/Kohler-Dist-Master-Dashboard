/* ====================================================================
   On-Prem MPO Tracker -- PROGRAM LIBRARY (shared with the Incentives & MPO Hub)
   --------------------------------------------------------------------
   Everything that COMPUTES this dashboard, moved verbatim out of
   index.html on 2026-09-10 so hub/index.html can run the exact same code
   against the exact same data/<month>/mpo_*.json files:

     ROSTER / DM_GROUPS       who the reps are, grouped by manager
     OBJECTIVES_* / MONTHS    the per-month objective registry and file map
     build*Dataset()          Snowflake/RDE JSON rows -> per-rep datasets
     loadMonthData()          fetch + build one month (no DOM)
     metricFor()              the ONE normalized per-rep metric both views read
     detailFor()              the per-rep drill-down markup
     objPct() / atGoalFor()   company-level reps-at-goal

   Weights, targets, qualification rules and percentages are unchanged --
   only the plumbing moved: DATA is passed in as an argument instead of
   read from a page global, so two pages (this tracker and the hub) can
   hold different months in memory at once. index.html keeps the month
   tabs, header and MPOGuided host contract and calls into
   window.OnPremMPO. The sibling off-prem tracker has the same split.
   ==================================================================== */
(function(global){

// Sales-manager grouping for the Rep View chooser, copied from
// incentive-tracking/index.html's DM_GROUPS so a rep finds their name in
// the same place on both dashboards. It covers the full ROSTER; any rep
// added to ROSTER without a group here still appears, under "Other".
const DM_GROUPS = [
  {dm:'Chris McCrohan', reps:['Allison Scott','Anthony Palmisano','Brian Sengebush','Nick Melissari','Paul Mclaughlin','Robin Feldman']},
  {dm:'Denise Montes', reps:['Derrick Laws','Javier Melo','Jim Heaney','Matt Powierski','Pablo Lopez']},
  {dm:'Mike Engel', reps:['Chris Payton','Dan Lagala','Dave Ehlers','Phil Ernst']},
  {dm:'Mike Kennedy', reps:['Alex Rodriguez','Alisa Acciardi','Andrew Lundy','Dylan Rubino','Hakan Sadik','Jaime Colonna',"John O'Donoghue",'Michael Harboy']},
  {dm:'Paul Deady', reps:['Jayson Romine','Klejdi Lamo','Mike Ast','Shane Barreca']},
];

const ROSTER = ["Alex Rodriguez","Alisa Acciardi","Allison Scott","Andrew Lundy","Anthony Palmisano","Brian Sengebush","Chris Payton","Dan Lagala","Dave Ehlers","Derrick Laws","Dylan Rubino","Hakan Sadik","Jaime Colonna","Javier Melo","Jayson Romine","Jim Heaney","John O'Donoghue","Klejdi Lamo","Matt Powierski","Michael Harboy","Mike Ast","Nick Melissari","Pablo Lopez","Paul Mclaughlin","Phil Ernst","Robin Feldman","Shane Barreca"];

const OBJECTIVES_2026_07 = [
  {key:'carbliss', name:'Carbliss – (15) New Buying Accounts per Rep', shortName:'Carbliss', unit:'new account', weight:0.60, type:'new_accounts', hasData:true, goalLabel:'15 new accounts each'},
  {key:'sapporo_na', name:'Sapporo – (2) New Buying Accounts Sapporo NA per Rep', shortName:'Sapporo NA', unit:'new account', weight:0.20, type:'new_accounts', hasData:true, goalLabel:'2 new accounts each'},
  {key:'wine_spirits', name:'Wine & Spirits – (3) Placements per Rep', shortName:'W&S', unit:'placement', weight:0.10, type:'placements', hasData:true, goalLabel:'3 placements each'},
  {key:'isellbeer', name:'iSellBeer Execution – (4) Qualifying Photos per Rep', shortName:'iSellBeer', weight:0.10, type:'photos', hasData:false},
];

// August's objectives are entirely different brands/rules from July's (per
// Kohler, 2026-08-04) -- see generate_2026-08.py for the "90-Day Non-Buy"
// new-placement classification (Angry Orchard, and Peroni/Banquet
// independently within the Molson Coors objective). Wine & Spirits
// (Yave/Leyenda) is a plain distinct-buyer count in August, no new-vs-repeat
// distinction. Molson Coors and Wine & Spirits are both "dual" objectives --
// two brand-family sub-targets that must BOTH be hit for the objective to
// count as achieved (confirmed with Gavin 2026-08-04), not a combined pool.
const OBJECTIVES_2026_08 = [
  {key:'angry_orchard', name:'Boston Beer – (2) New Angry Orchard Draft Lines', shortName:'Angry Orchard', unit:'new draft line', weight:0.25, type:'new_accounts', hasData:true, goalLabel:'2 new lines each', flagLabel:'New Placement'},
  {key:'molson_coors', name:'Molson Coors – (4) New Peroni Placements, (4) New Banquet Placements', shortName:'Molson Coors', weight:0.25, type:'dual', hasData:true, goalLabel:'4 Peroni + 4 Banquet each',
    subs:[{key:'peroni', label:'Peroni', match:'peroni', target:4, flagLabel:'New Placement'}, {key:'banquet', label:'Banquet', match:'coors', target:4, flagLabel:'New Placement'}]},
  {key:'wine_spirits', name:'Wine & Spirits – (2) Yave Buying Accounts, (2) Leyenda Buying Accounts', shortName:'Wine & Spirits', weight:0.25, type:'dual', hasData:true, goalLabel:'2 Yave + 2 Leyenda each',
    subs:[{key:'yave', label:'Yave', match:'yave', target:2, flagLabel:'Qualifying Buyer', buyerCount:true}, {key:'leyenda', label:'Leyenda', match:'leyenda', target:2, flagLabel:'Qualifying Buyer', buyerCount:true}]},
  {key:'isellbeer', name:'iSellBeer Execution – Submit (4) Qualifying Photos in iSellBeer', shortName:'iSellBeer', weight:0.25, type:'photos', hasData:false},
];

const OBJECTIVES_2026_09 = [
  // Objective 1 is menu/photo verified and has no RDE export, so it rides the
  // tab as hasData:false -- rules and weight show, numbers do not. type:'manual'
  // rather than reusing 'photos': the hasData:false branch returns before type
  // is ever read, so the label may as well say what the objective actually is.
  {key:'bardstown_menu', name:'Lofted Spirits – (5) New Bardstown Menu Placements', shortName:'Bardstown Menu', unit:'menu placement', weight:0.25, type:'new_accounts', hasData:true, goalLabel:'5 new menu placements each', flagLabel:'Menu Placement'},
  {key:'fever_tree', name:'Molson Coors – Fever Tree (3) New Placements', shortName:'Fever Tree', unit:'new placement', weight:0.25, type:'new_accounts', hasData:true, goalLabel:'3 new placements each', flagLabel:'New Placement'},
  {key:'carbliss', name:'Spirits – Carbliss (10) New On Premise Buying Accounts', shortName:'Carbliss', unit:'new buying account', weight:0.25, type:'new_accounts', hasData:true, goalLabel:'10 new accounts each', flagLabel:'New Buyer'},
  {key:'husa_xx_draft', name:'HUSA – (1) New XX Draft Line', shortName:'HUSA XX Draft', unit:'new draft line', weight:0.25, type:'new_accounts', hasData:true, goalLabel:'1 new draft line each', flagLabel:'New Draft Line'},
];

// Each entry is a permanent monthly snapshot -- add a new one here (and a
// matching generate_<key>.py, and its own objectives list above) once a new
// month's RDE exports are ready. Earlier months stay viewable forever.
// MONTHS[MONTHS.length-1] is the default/active tab on page load, so the
// most-recently-added month should stay last in this array.
const MONTHS = [
  {key:'2026-07', label:'July 2026', dir:'data/2026-07/', objectives: OBJECTIVES_2026_07, tables: [
    {objKey:'carbliss', file:'mpo_carbliss_new_buyers.json', target:15, builder:'new_accounts'},
    {objKey:'sapporo_na', file:'mpo_sapporo_na_new_buyers.json', target:2, builder:'new_accounts'},
    {objKey:'wine_spirits', file:'mpo_wine_spirits_placements.json', target:3, builder:'placements'},
  ]},
  {key:'2026-08', label:'August 2026', dir:'data/2026-08/', objectives: OBJECTIVES_2026_08, tables: [
    {objKey:'angry_orchard', file:'mpo_angry_orchard.json', target:2, builder:'new_accounts',
      targetsFile:'mpo_targets_angry_orchard.json'},
    {objKey:'molson_coors', file:'mpo_molson_coors.json', dual:true, brandField:'BRAND_FAMILY',
      subs: OBJECTIVES_2026_08.find(o=>o.key==='molson_coors').subs, builder:'new_accounts',
      targetsFile:'mpo_targets_molson_coors.json', targetsBrandField:'BRAND_FAMILY'},
    {objKey:'wine_spirits', file:'mpo_wine_spirits_yave_leyenda.json', dual:true, brandField:'BRAND_FAMILY',
      subs: OBJECTIVES_2026_08.find(o=>o.key==='wine_spirits').subs, builder:'buyer_count'},
  ]},
  // All four September objectives are single-metric new-account counts, so none
  // needs the dual/sub machinery August's Molson Coors and Wine & Spirits use.
  // bardstown_menu comes from iSellBeer promo photos rather than RDE -- same
  // builder, different source; see generate_2026-09.py. No targetsFile on any of them: Fever Tree, Carbliss
  // and Dos Equis draft have no confirmed territory scope, and a prospect list
  // is a claim a rep acts on -- see generate_2026-09.py.
  {key:'2026-09', label:'September 2026', dir:'data/2026-09/', objectives: OBJECTIVES_2026_09, tables: [
    {objKey:'bardstown_menu', file:'mpo_bardstown_menu.json', target:5, builder:'new_accounts'},
    {objKey:'fever_tree', file:'mpo_fever_tree.json', target:3, builder:'new_accounts'},
    {objKey:'carbliss', file:'mpo_carbliss.json', target:10, builder:'new_accounts'},
    {objKey:'husa_xx_draft', file:'mpo_husa_xx_draft.json', target:1, builder:'new_accounts'},
  ]},
];

// ---- Snowflake JSON -> DATA builder ----
// Column names in the synced tables aren't guaranteed, so match by
// tokenized header words instead of position/exact-name.
function tokens(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);}
// Tolerates simple plural/singular drift (buyer/buyers, count/counts) via a
// prefix match, but only for words long enough that the prefix stays
// specific (short words like "rep"/"new" require an exact token match, so
// "rep" doesn't prefix-match an unrelated column like "REPORT_ID").
function wordMatches(tok,w){return tok===w||(w.length>=4&&tok.startsWith(w))||(tok.length>=4&&w.startsWith(tok));}
function findCol(row, candidateWordSets){
  const keys=Object.keys(row);
  for(const words of candidateWordSets){
    const hit=keys.find(k=>{const t=tokens(k);return words.every(w=>t.some(tok=>wordMatches(tok,w)));});
    if(hit) return hit;
  }
  return null;
}
function parseDateMs(s){const d=new Date(s);return isNaN(d)?0:d.getTime();}
function truthyFlag(v){const s=String(v==null?"":v).trim().toLowerCase();return s==="1"||s==="true"||s==="y"||s==="yes";}

// Multi-word candidates (e.g. ["customer","name"]) are tried before bare
// single-word ones, so a "*_NAME" column is preferred over a same-topic
// "*_ID"/"*_NUM" column that would otherwise match first.
const REP_COLS=[["rep","name"],["rep"]];
const CUSTOMER_COLS=[["customer","name"],["account","name"],["customer"],["account"],["location"]];
const DATE_COLS=[["date"]];
const NEWBUYER_COLS=[["new","buyer"],["is","new"],["new","placement"]];
const PERIOD_COLS=[["period"]];
const PRODUCT_COLS=[["product","name"],["product","desc"],["product"],["brand"],["item"]];
const COUNT_COLS=[["count"],["qty"],["quantity"],["cases"],["units"]];
// Only the Bardstown menu dataset carries a photo link (iSellBeer promos).
// Every other objective has no such column, so findCol simply returns null and
// the drill-down renders exactly as before -- the column is additive.
const PHOTO_COLS=[["photo","url"],["photo","link"],["photo"]];
// Deliberately narrower than PRODUCT_COLS, which falls back to ["brand"] and
// would match BRAND_FAMILY -- hanging a constant "Carbliss"/"Dos Equis" column
// off objectives that are scored per ACCOUNT. Only a dataset carrying a real
// per-placement column (September's Fever Tree SKUs, and the Bardstown menu's
// per-brand mentions) grows the Product column and gets its drill-down keyed
// per placement rather than per account. See generate_2026-09.py's
// classify(product_col=) and build_bardstown_menu().
const SKU_COLS=[["product","name"]];

function buildNewAccountsDataset(rows, target){
  if(!Array.isArray(rows)||!rows.length) return null;
  const repCol=findCol(rows[0],REP_COLS), custCol=findCol(rows[0],CUSTOMER_COLS),
        dateCol=findCol(rows[0],DATE_COLS), flagCol=findCol(rows[0],NEWBUYER_COLS),
        periodCol=findCol(rows[0],PERIOD_COLS), photoCol=findCol(rows[0],PHOTO_COLS),
        skuCol=findCol(rows[0],SKU_COLS);
  if(!repCol||!custCol||!dateCol||!flagCol) return null;
  const byRep=new Map();
  rows.forEach(r=>{
    const rep=String(r[repCol]||"").trim(); if(!rep) return;
    if(!byRep.has(rep)) byRep.set(rep,[]);
    byRep.get(rep).push({customer:String(r[custCol]||"").trim(), date:String(r[dateCol]||"").trim(), new_buyer: truthyFlag(r[flagCol])?"1":"0", period: periodCol?String(r[periodCol]||"").trim().toLowerCase():"", photo: photoCol?String(r[photoCol]||"").trim():"", product: skuCol?String(r[skuCol]||"").trim():""});
  });
  const reps=[];
  byRep.forEach((lines,rep)=>{
    lines.sort((a,b)=>parseDateMs(b.date)-parseDateMs(a.date));
    const qualLines=lines.filter(l=>l.new_buyer==="1");
    reps.push({rep, qualifying:qualLines.length, accounts:qualLines.map(l=>l.customer), lines});
  });
  const reps_at_goal=ROSTER.filter(name=>{const r=reps.find(x=>x.rep===name);return r?r.qualifying>=target:false;}).length;
  return {target_per_rep:target, reps, reps_at_goal, reps_total:ROSTER.length};
}

function buildPlacementsDataset(rows, target){
  if(!Array.isArray(rows)||!rows.length) return null;
  const repCol=findCol(rows[0],REP_COLS), prodCol=findCol(rows[0],PRODUCT_COLS),
        custCol=findCol(rows[0],CUSTOMER_COLS), dateCol=findCol(rows[0],DATE_COLS),
        countCol=findCol(rows[0],COUNT_COLS);
  if(!repCol||!prodCol||!custCol||!dateCol||!countCol) return null;
  const byRep=new Map();
  rows.forEach(r=>{
    const rep=String(r[repCol]||"").trim(); if(!rep) return;
    if(!byRep.has(rep)) byRep.set(rep,[]);
    const n=parseFloat(r[countCol]);
    byRep.get(rep).push({product:String(r[prodCol]||"").trim(), customer:String(r[custCol]||"").trim(), date:String(r[dateCol]||"").trim(), count:isNaN(n)?1:n});
  });
  const reps=[];
  byRep.forEach((lines,rep)=>{
    lines.sort((a,b)=>parseDateMs(b.date)-parseDateMs(a.date));
    const count=lines.reduce((s,l)=>s+l.count,0);
    reps.push({rep, count, lines});
  });
  const reps_at_goal=ROSTER.filter(name=>{const r=reps.find(x=>x.rep===name);return r?r.count>=target:false;}).length;
  return {target_per_rep:target, reps, reps_at_goal, reps_total:ROSTER.length};
}

// Plain distinct-buying-account count per rep, no new-vs-repeat
// classification (used by objectives like Wine & Spirits Yave/Leyenda,
// where the source window IS the current month -- every row already
// qualifies). Every line is marked new_buyer:"1" so it reuses
// lineTableNewAccounts()'s rendering, just with a different flagLabel.
function buildBuyerCountDataset(rows, target){
  if(!Array.isArray(rows)||!rows.length) return null;
  const repCol=findCol(rows[0],REP_COLS), custCol=findCol(rows[0],CUSTOMER_COLS), dateCol=findCol(rows[0],DATE_COLS);
  if(!repCol||!custCol) return null;
  const byRep=new Map();
  rows.forEach(r=>{
    const rep=String(r[repCol]||"").trim(); if(!rep) return;
    if(!byRep.has(rep)) byRep.set(rep,[]);
    byRep.get(rep).push({customer:String(r[custCol]||"").trim(), date:dateCol?String(r[dateCol]||"").trim():"", new_buyer:"1"});
  });
  const reps=[];
  byRep.forEach((lines,rep)=>{
    lines.sort((a,b)=>parseDateMs(b.date)-parseDateMs(a.date));
    const distinct=new Set(lines.map(l=>l.customer));
    reps.push({rep, qualifying:distinct.size, accounts:[...distinct], lines});
  });
  const reps_at_goal=ROSTER.filter(name=>{const r=reps.find(x=>x.rep===name);return r?r.qualifying>=target:false;}).length;
  return {target_per_rep:target, reps, reps_at_goal, reps_total:ROSTER.length};
}

const BUILDERS = {new_accounts: buildNewAccountsDataset, placements: buildPlacementsDataset, buyer_count: buildBuyerCountDataset};

const AREA_COLS=[["area"]];

// Target-account rows (prospects who don't carry the brand yet, on-premise,
// in an allowed county -- see generate_2026-08.py) grouped by rep, keyed
// by rep name for direct lookup at render time.
function groupTargetsByRep(rows){
  if(!Array.isArray(rows)||!rows.length) return {};
  const repCol=findCol(rows[0],REP_COLS), custCol=findCol(rows[0],CUSTOMER_COLS),
        areaCol=findCol(rows[0],AREA_COLS);
  if(!repCol||!custCol) return {};
  const by={};
  rows.forEach(r=>{
    const rep=String(r[repCol]||"").trim(); if(!rep) return;
    if(!by[rep]) by[rep]=[];
    by[rep].push({customer:String(r[custCol]||"").trim(), area:areaCol?String(r[areaCol]||"").trim():""});
  });
  return by;
}

// Fixed display order for the core-market counties (matches how Gavin
// always lists them); anything else sorts after, alphabetically.
const COUNTY_ORDER = ['Bergen','Passaic','Passaic-FF','Morris 1','Morris 3','Sussex'];
function groupTargetsByCounty(targets){
  const groups = new Map();
  targets.forEach(t=>{
    const key = t.area || 'Other';
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  return [...groups.entries()]
    .map(([name, items])=>({name, items: items.slice().sort((a,b)=>a.customer.localeCompare(b.customer))}))
    .sort((a,b)=>{
      const ai=COUNTY_ORDER.indexOf(a.name), bi=COUNTY_ORDER.indexOf(b.name);
      if(ai!==-1||bi!==-1) return (ai===-1?99:ai)-(bi===-1?99:bi);
      return a.name.localeCompare(b.name);
    });
}

// Collapsed-by-default, both at the "N Target Accounts" level and per
// county within it -- a rep's full prospect list can run to 100+ rows, so
// grouping by county (and keeping every group closed until tapped) is what
// keeps this scannable on an iPad instead of one long undifferentiated
// list (per Gavin, 2026-08-08).
function targetsBlockHtml(targets, brandLabel){
  if(!targets || !targets.length) return '';
  const tid = 'tgt'+(uid++);
  const groupsHtml = groupTargetsByCounty(targets).map(g=>{
    const gid = 'tgtc'+(uid++);
    const rows = g.items.map(t=>`<tr><td>${t.customer}</td></tr>`).join('');
    return `<div class="tgt-county">
      <div class="tgt-county-toggle" data-target="${gid}"><span class="tgt-county-chev">▶</span>${g.name}<span class="tgt-county-count">${g.items.length}</span></div>
      <div class="tgt-county-table" id="${gid}"><div class="rep-sub-inner" style="padding-left:2px"><table><tbody>${rows}</tbody></table></div></div>
    </div>`;
  }).join('');
  return `<div class="targets-block">
    <div class="targets-toggle" data-target="${tid}"><span class="targets-chev">▶</span>${targets.length} Target Account${targets.length===1?'':'s'}<span class="targets-hint">— don't carry ${brandLabel} yet, in your territory</span></div>
    <div class="targets-table" id="${tid}">${groupsHtml}</div>
  </div>`;
}
document.addEventListener('click', e=>{
  const header = e.target.closest('.targets-toggle, .tgt-county-toggle');
  if(!header) return;
  header.classList.toggle('open');
  document.getElementById(header.dataset.target)?.classList.toggle('open');
});

// Fetch + build one month's DATA. Pure data: no DOM, no month tabs, no
// error banner -- the host page (index.html) or the hub does those. baseDir
// prefixes the month's data/ folder so a page in another folder can read the
// same files ('' from index.html, '../MPOs/on-prem/' from the hub).
// Returns {month, DATA, missing, syncedAt}; missing lists the hasData
// objectives whose file failed to load or build.
async function loadMonthData(monthKey, baseDir){
  const month = MONTHS.find(m=>m.key===monthKey);
  if(!month) return null;
  baseDir = baseDir || '';
  const DATA = {};
  const cb="?_="+Date.now();
  for(const t of month.tables){
    try{
      const res=await fetch(baseDir+month.dir+t.file+cb,{cache:"no-store"});
      if(!res.ok) continue;
      const rows=await res.json();
      const builder=BUILDERS[t.builder];
      if(t.dual){
        const subs=t.subs.map(s=>{
          const subRows=rows.filter(r=>String(r[t.brandField]||"").toLowerCase().includes(s.match));
          const built=builder(subRows, s.target);
          return {...s, ...(built||{reps:[],reps_at_goal:0,reps_total:ROSTER.length,target_per_rep:s.target})};
        });
        const reps_at_goal=ROSTER.filter(name=>subs.every(s=>{
          const r=s.reps.find(x=>x.rep===name);
          return r?r.qualifying>=s.target:false;
        })).length;
        DATA[t.objKey]={subs, reps_at_goal, reps_total:ROSTER.length};
      } else {
        const built=builder(rows, t.target);
        if(built) DATA[t.objKey]=built;
      }
      if(t.targetsFile && DATA[t.objKey]){
        const tres=await fetch(baseDir+month.dir+t.targetsFile+cb,{cache:"no-store"});
        if(tres.ok){
          const trows=await tres.json();
          if(t.dual){
            DATA[t.objKey].subs.forEach(s=>{
              const subRows=trows.filter(r=>String(r[t.targetsBrandField]||"").toLowerCase().includes(s.match));
              s.targetsByRep=groupTargetsByRep(subRows);
            });
          } else {
            DATA[t.objKey].targetsByRep=groupTargetsByRep(trows);
          }
        }
      }
    }catch(e){}
  }
  const missing=month.objectives.filter(o=>o.hasData && !DATA[o.key]);
  let syncedAt=null;
  try{
    const rm=await fetch(baseDir+month.dir+'sync_meta.json'+cb,{cache:"no-store"});
    if(rm.ok){ const meta=await rm.json(); if(meta && meta.synced_at) syncedAt=meta.synced_at; }
  }catch(e){}
  return {month, DATA, missing, syncedAt};
}

function objPct(o, DATA){
  if(!o.hasData) return 0;
  const d = DATA[o.key];
  return d.reps_total ? (d.reps_at_goal/d.reps_total)*100 : 0;
}


// Module-local counters/state that used to be page globals.
let uid = 0;
let activeMonth = null;


// Raw lines carry one row per historical transaction (some sources go back
// months so the 90-day-non-buy classifier has purchase history to check),
// but a rep doesn't need every prior date -- just when an account last
// bought in the base (90-day non-buy) period vs. the current month, and
// what that means. Sources with a PERIOD field on their lines (August's
// Angry Orchard/Molson Coors) get the full two-date treatment (per Gavin,
// 2026-08-08):
//   New Buyer            -- bought this month, never in the base period.
//                            Eligible for this incentive.
//   Repeat Buyer          -- bought in BOTH the base period and this
//                            month. Not new, but actively reordering.
//   Bought in Base Period -- bought in the base period only, no
//                            this-month purchase yet. Already carries the
//                            brand, not an incentive-eligible target.
// Sources with no PERIOD field at all (July's Carbliss/Sapporo, and
// buyer_count sources like Wine & Spirits) have no base-period concept,
// so they keep the original single-date "New Buyer"/"Regular Buyer"
// table rather than showing a pointless always-empty base-period column.
function isActiveMonthDate(dateStr){
  return typeof dateStr==='string' && dateStr.startsWith(activeMonth);
}
function lineTableNewAccounts(lines, flagLabel, targetsHtml){
  flagLabel = flagLabel || 'New Buyer';
  targetsHtml = targetsHtml || '';
  if(!lines || lines.length===0) return `<div class="no-lines">No activity recorded this month.</div>${targetsHtml}`;
  const hasPeriods = lines.some(l=>l.period==='base'||l.period==='current');

  if(!hasPeriods){
    const byCustomer = new Map();
    lines.forEach(l=>{
      if(!byCustomer.has(l.customer)) byCustomer.set(l.customer, {customer:l.customer, isNew:false, activeDate:null});
      const c = byCustomer.get(l.customer);
      if(l.new_buyer==='1') c.isNew = true;
      if(isActiveMonthDate(l.date) && (!c.activeDate || l.date>c.activeDate)) c.activeDate = l.date;
    });
    const rows = [...byCustomer.values()]
      .sort((a,b)=> (b.isNew-a.isNew) || (b.activeDate||'').localeCompare(a.activeDate||'') || a.customer.localeCompare(b.customer))
      .map(c=>{
        const status = c.isNew ? `<span class="flag-hit">✓ ${flagLabel}</span>` : (c.activeDate ? '<span class="flag-miss">Regular Buyer</span>' : '<span class="flag-miss">—</span>');
        return `<tr><td>${c.customer}</td><td>${c.activeDate||''}</td><td>${status}</td></tr>`;
      }).join('');
    return `<div class="rep-sub-inner" style="padding-left:2px"><table><thead><tr><th>Customer</th><th>Date</th><th>Qualifies</th></tr></thead><tbody>${rows}</tbody></table>${targetsHtml}</div>`;
  }

  const byCustomer = new Map();
  lines.forEach(l=>{
    // Keyed per customer+SKU where the dataset carries a SKU (Fever Tree is
    // scored per placement, so one account taking two new SKUs is two rows;
    // the Bardstown menu is scored per brand mention, so two brands on one
    // table tent are two rows), and per customer everywhere else, where
    // product is "" and this is the original behaviour exactly.
    const ckey = l.customer+"\u0000"+(l.product||"");
    if(!byCustomer.has(ckey)) byCustomer.set(ckey, {customer:l.customer, product:l.product||"", isNew:false, baseDate:null, currentDate:null, photos:[]});
    const c = byCustomer.get(ckey);
    if(l.new_buyer==='1') c.isNew = true;
    if(l.period==='current' && (!c.currentDate || l.date>c.currentDate)) c.currentDate = l.date;
    if(l.period==='base' && (!c.baseDate || l.date>c.baseDate)) c.baseDate = l.date;
    // Dedupe the photo per row key -- one promo submission repeats the same
    // photo on every brand row, and an account with genuinely different photos
    // still gets "View Photo 1 / 2".
    if(l.photo && !c.photos.includes(l.photo)) c.photos.push(l.photo);
  });
  const all = [...byCustomer.values()];
  const anyPhotos = all.some(c=>c.photos && c.photos.length);
  const anyProduct = all.some(c=>c.product);

  // Only New Buyers are shown directly -- Repeat Buyers and Bought-in-
  // Base-Period accounts already carry the brand, so they're not
  // incentive-eligible and just add noise to what a rep needs to act on
  // this month. They're still fully available, just tucked behind the
  // same collapsed-dropdown pattern as Target Accounts (per Gavin,
  // 2026-08-08: "target accounts and new placement accounts should be
  // the focus of what the rep sees").
  const newOnes = all.filter(c=>c.isNew)
    .sort((a,b)=> (b.currentDate||'').localeCompare(a.currentDate||'') || a.customer.localeCompare(b.customer));
  const existing = all.filter(c=>!c.isNew)
    .sort((a,b)=>{
      const rank = c => (c.baseDate && c.currentDate) ? 0 : 1; // Repeat Buyer before Bought in Base Period
      return rank(a)-rank(b) || (b.currentDate||b.baseDate||'').localeCompare(a.currentDate||a.baseDate||'') || a.customer.localeCompare(b.customer);
    });

  const newRowsHtml = newOnes.length
    ? `<table><thead><tr><th>Customer</th>${anyProduct?'<th>Product</th>':''}<th>Base Period</th><th>This Month</th><th>Status</th>${anyPhotos?'<th>Photo</th>':''}</tr></thead><tbody>${
        newOnes.map(c=>`<tr><td>${c.customer}</td>${anyProduct?`<td>${c.product||''}</td>`:''}<td>${c.baseDate||''}</td><td>${c.currentDate||''}</td><td><span class="flag-hit">✓ ${flagLabel}</span></td>${anyPhotos?`<td>${photoCellHtml(c.photos)}</td>`:''}</tr>`).join('')
      }</tbody></table>`
    : `<div class="no-lines" style="padding:0">No new placements yet this month.</div>`;

  return `<div class="rep-sub-inner" style="padding-left:2px">${newRowsHtml}${targetsHtml}${existingAccountsBlockHtml(existing, anyPhotos, anyProduct)}</div>`;
}

// A photo-verified objective (currently only Bardstown menu placements) proves
// itself with the picture, so link it straight from the row. Multiple distinct
// photos at one account are numbered rather than collapsed to one link.
function photoCellHtml(photos){
  if(!photos || !photos.length) return '<span class="flag-miss">—</span>';
  return photos.map((u,i)=>`<a class="photo-link" href="${u}" target="_blank" rel="noopener">View Photo${photos.length>1?' '+(i+1):''}</a>`).join(' ');
}
// Same collapsed-dropdown treatment as Target Accounts, for accounts that
// already carry the brand (Repeat Buyer or Bought in Base Period) -- kept
// available for full traceability, just not part of what a rep sees by
// default when they open the program.
function existingAccountsBlockHtml(existing, anyPhotos, anyProduct){
  if(!existing.length) return '';
  const eid = 'exist'+(uid++);
  const rows = existing.map(c=>{
    const status = (c.baseDate && c.currentDate) ? 'Repeat Buyer' : 'Bought in Base Period';
    return `<tr><td>${c.customer}</td>${anyProduct?`<td>${c.product||''}</td>`:''}<td>${c.baseDate||''}</td><td>${c.currentDate||''}</td><td><span class="flag-miss">${status}</span></td>${anyPhotos?`<td>${photoCellHtml(c.photos)}</td>`:''}</tr>`;
  }).join('');
  return `<div class="targets-block">
    <div class="targets-toggle" data-target="${eid}"><span class="targets-chev">▶</span>${existing.length} Existing Account${existing.length===1?'':'s'}<span class="targets-hint">— already carry it, not eligible for new-placement credit</span></div>
    <div class="targets-table" id="${eid}"><table><thead><tr><th>Customer</th>${anyProduct?'<th>Product</th>':''}<th>Base Period</th><th>This Month</th><th>Status</th>${anyPhotos?'<th>Photo</th>':''}</tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}
function lineTablePlacements(lines){
  if(!lines || lines.length===0) return '<div class="no-lines">No activity recorded this month.</div>';
  const rows = lines.map(l=>`<tr><td>${l.product}</td><td>${l.customer}</td><td>${l.date}</td><td class="num">${l.count}</td></tr>`).join('');
  return `<div class="rep-sub-inner" style="padding-left:2px"><table><thead><tr><th>Product</th><th>Customer</th><th>Date</th><th class="num">Count</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ====================================================================
   ONE NORMALIZED METRIC FEEDS BOTH VIEWS.
   --------------------------------------------------------------------
   Rep View's cards, Program View's rep rows, the summary counts and the
   sorting all read metricFor(). The per-type maths below is lifted
   verbatim from the old renderRepView()/renderObjectiveView() bodies --
   same targets, same qualification, same "at goal" test -- it is only
   stated once now instead of once per view, which is what stops the two
   from drifting apart. No weight, target or classification changes.
   ==================================================================== */

// Plain-language unit for a goal, so a rep reads "3 more placements"
// rather than a bare number. Falls back to the objective's flagLabel and
// then to nothing, so an objective added without one still renders.
function unitFor(o, n){
  const word = o.unit || (o.flagLabel ? o.flagLabel.toLowerCase() : '');
  if(!word) return String(n);
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function metricFor(o, rep, DATA){
  if(!o.hasData || !DATA[o.key]) return null;
  const d = DATA[o.key];

  if(o.type === 'dual'){
    const subs = d.subs.map(s=>{
      const r = s.reps.find(x=>x.rep===rep);
      const val = r ? r.qualifying : 0;
      return {
        label: s.label, value: val, goal: s.target,
        pct: s.target ? Math.min(val/s.target,1)*100 : 0,
        remaining: Math.max(s.target - val, 0),
        valueText: val + ' / ' + s.target,
        status: val>=s.target ? 'achieved' : (val>0 ? 'inprogress' : 'notstarted')
      };
    });
    // Both sub-targets must be hit for the objective to count (confirmed
    // with Gavin 2026-08-04) -- unchanged, just read off the subs here.
    const allHit = subs.every(s=>s.value>=s.goal);
    const anyAct = subs.some(s=>s.value>0);
    const remaining = subs.reduce((a,s)=>a+s.remaining,0);
    return {
      value: subs.reduce((a,s)=>a+s.value,0),
      goal: subs.reduce((a,s)=>a+s.goal,0),
      pct: subs.reduce((a,s)=>a+s.pct,0)/subs.length,
      remaining,
      valueText: subs.map(s=>s.label+' '+s.value+'/'+s.goal).join(' · '),
      goalText: o.goalLabel || subs.map(s=>s.goal+' '+s.label).join(' + '),
      remainText: remaining>0
        ? subs.filter(s=>s.remaining>0).map(s=>s.remaining+' '+s.label).join(', ')
        : '',
      status: allHit ? 'achieved' : (anyAct ? 'inprogress' : 'notstarted'),
      hasActivity: anyAct,
      subs
    };
  }

  const target = d.target_per_rep;
  const r = d.reps.find(x=>x.rep===rep);
  const val = r ? (o.type==='new_accounts' ? r.qualifying : r.count) : 0;
  const remaining = Math.max(target - val, 0);
  return {
    value: val, goal: target,
    pct: target ? Math.min(val/target,1)*100 : 0,
    remaining,
    valueText: val + ' / ' + target,
    goalText: unitFor(o, target),
    remainText: remaining>0 ? unitFor(o, remaining) : '',
    status: val>=target ? 'achieved' : (val>0 ? 'inprogress' : 'notstarted'),
    hasActivity: !!r
  };
}

// The drill-down is the page's EXISTING markup, untouched -- the guided
// card just puts it behind "See My Progress" instead of always-open.
function detailFor(o, rep, DATA, monthKey){
  activeMonth = monthKey;   // read by isActiveMonthDate()
  if(!o.hasData || !DATA[o.key]) return '';
  const d = DATA[o.key];

  if(o.type === 'dual'){
    return d.subs.map((s,i)=>{
      const r = s.reps.find(x=>x.rep===rep);
      const tgtHtml = targetsBlockHtml((s.targetsByRep||{})[rep], s.label);
      return `<div style="margin-bottom:18px">
        <div class="sub-brand-title sb-${i%3}">${s.label}</div>
        ${r ? lineTableNewAccounts(r.lines, s.flagLabel, tgtHtml)
            : '<div class="no-lines" style="padding-left:2px">No activity recorded this month.</div>'+tgtHtml}
      </div>`;
    }).join('');
  }

  const r = d.reps.find(x=>x.rep===rep);
  const tgtHtml = (o.type==='new_accounts' && d.targetsByRep)
    ? targetsBlockHtml(d.targetsByRep[rep], o.shortName||o.name) : '';
  if(o.type === 'new_accounts'){
    return r ? lineTableNewAccounts(r.lines, o.flagLabel, tgtHtml)
             : '<div class="no-lines" style="padding-left:2px">No activity recorded this month.</div>'+tgtHtml;
  }
  return r ? lineTablePlacements(r.lines)
           : '<div class="no-lines" style="padding-left:2px">No activity recorded this month.</div>';
}

function atGoalFor(o, DATA){
  if(!o.hasData || !DATA[o.key]) return null;
  return {n: DATA[o.key].reps_at_goal, total: DATA[o.key].reps_total};
}

global.OnPremMPO = {ROSTER, DM_GROUPS, MONTHS, loadMonthData, objPct, metricFor, detailFor, atGoalFor, unitFor};
})(window);
