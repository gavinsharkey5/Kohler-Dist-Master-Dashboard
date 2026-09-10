/* ====================================================================
   Off-Prem MPO Tracker -- PROGRAM LIBRARY (shared with the Incentives & MPO Hub)
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
   window.OffPremMPO. The sibling on-prem tracker has the same split.
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
  {key:'new_belgium', name:'New Belgium – Achieve 90% of Assigned Distribution Goal', shortName:'New Belgium', weight:0.30, type:'new_belgium', hasData:true, goalLabel:'90% of dist. goal'},
  {key:'ws_2xo', name:'Wine & Spirits – 2XO (2), Le Grand Pinot Noir (1), Yave (1) Placements', shortName:'W&S 2XO/Le Grand/Yave', unit:'placement', weight:0.30, type:'placements', hasData:true, goalLabel:'4 placements each'},
  {key:'sapporo_light', name:'Sapporo Light – (5) Placements per Rep', shortName:'Sapporo Light', unit:'placement', weight:0.10, type:'placements', hasData:true, goalLabel:'5 placements each'},
  {key:'famosa', name:'Famosa 7oz Urban Market – (5) Placements per Rep', shortName:'Famosa 7oz', unit:'placement', weight:0.10, type:'placements', hasData:true, goalLabel:'5 placements each'},
  {key:'disruptors', name:'Disruptors – (3) Bin Stackers/Racks in iSellBeer', shortName:'Disruptors', weight:0.20, type:'photos', hasData:false},
];

// August's objectives are entirely different brands/rules from July's (per
// Kohler, 2026-08-04) -- see generate_2026-08.py for the "90-Day Non-Buy"
// new-placement classification (Molson Coors Peroni/Banquet, and each Wine
// & Spirits brand family, all independently). Molson Coors and Wine &
// Spirits are both "dual" objectives -- N brand-family sub-targets that
// must ALL be hit for the objective to count as achieved (confirmed with
// Gavin 2026-08-04: Molson Coors both required, Wine & Spirits all three
// required), not a combined pool. BBC Lytt is a "pct_of_base" objective --
// each rep's target is 25% of their OWN account-base size (not a fixed
// number), computed client-side from the Sales Reps' Customer Base export.
const OBJECTIVES_2026_08 = [
  {key:'corona_premier', name:'Constellation – (5) Corona Premier Suitcase Placements', shortName:'Corona Premier', unit:'placement', weight:0.30, type:'placements', hasData:true, goalLabel:'5 placements each'},
  {key:'bbc_lytt', name:'BBC – Achieve Distro Lytt 25% of Account Base', shortName:'BBC Lytt', unit:'Lytt account', weight:0.30, type:'pct_of_base', hasData:true, goalLabel:'25% of account base (3+ SKUs each)', accountsLabel:'Lytt Accounts', brandLabel:'Lytt'},
  {key:'molson_coors', name:'Molson Coors – (4) New Peroni Placements, (4) New Banquet Placements (90-Day Non-Buy)', shortName:'Molson Coors', weight:0.15, type:'dual', hasData:true, goalLabel:'4 Peroni + 4 Banquet each',
    subs:[{key:'peroni', label:'Peroni', match:'peroni', target:4, flagLabel:'New Placement'}, {key:'banquet', label:'Banquet', match:'coors', target:4, flagLabel:'New Placement'}]},
  {key:'wine_spirits', name:'Wine & Spirits – (5) New Placements: (2) Le Grand Wines, (2) Leyenda, (1) Green River 50 mLs (90-Day Non-Buy)', shortName:'Wine & Spirits', weight:0.15, type:'dual', hasData:true, goalLabel:'2 Le Grand + 2 Leyenda + 1 Green River',
    subs:[{key:'le_grand', label:'Le Grand Noir', match:'grand', target:2, flagLabel:'New Placement'}, {key:'leyenda', label:'Leyenda 1925', match:'leyenda', target:2, flagLabel:'New Placement'}, {key:'green_river', label:'Green River', match:'green river', target:1, flagLabel:'New Placement'}]},
  // Photos objective went live 2026-08-19 (per Gavin): counted in DISTINCT
  // photos, not photo-bearing rows -- several SKU rows sharing one photo
  // link are ONE pic toward the 8. Sales Reps only; every line must carry
  // a clickable photo (generate_lytt_pos.py enforces both).
  {key:'disruptors', name:'Disruptors – (8) Lytt POS Items Pics in iSellBeer', shortName:'Disruptors', unit:'POS pic', weight:0.10, type:'photos', hasData:true, goalLabel:'8 POS item pics each'},
];

// September's five objectives (September_2026_MPO.docx) -- again entirely
// different brands and rules from August's; see generate_2026-09.py for how
// each dataset is built.
//
// Constellation is a NEW objective type, 'pct_of_goal': every rep's target
// is 30% of their OWN Corona Gaintain placements last fall (9/1/2025 -
// 11/30/2025), not a fixed number (per Gavin, 2026-09-02: "their goals is
// the distribution (placements) made from 9/1/2025 - 11/30/2025. the 1st
// column"). It is also the one objective here that runs a full THREE months
// (9/1 - 11/30/2026), so it keeps accruing after September's other four
// close out.
//
// Keystone Ice reuses August's 'pct_of_base' machinery at 40% with no
// minimum-SKU bar (it is a single SKU, product 622), scored on the same
// off-premise core-territory account base BBC Lytt used.
//
// Fever Tree and Wine & Spirits are both 'new_placements' -- the 90-day
// non-buy rule read straight off RDE's two windowed columns rather than
// from a transaction log, and counted in PLACEMENTS rather than rows (Fever
// Tree's export is account-level, so one newly-opened account can be
// several placements). See buildNewPlacementsDataset().
const OBJECTIVES_2026_09 = [
  // periodStart/periodEnd are read only by hub/index.html (the Incentives &
  // MPO Hub) to say when an objective ends and which month it belongs to;
  // this tracker ignores them. Constellation runs the full fall (9/1-11/30),
  // Keystone's RDE window opened 8/1 -- see the notes above.
  {key:'constellation_gaintain', name:'Constellation – 30% Corona Gaintain Distro', shortName:'Corona Gaintain', unit:'placement', weight:0.30, type:'pct_of_goal', hasData:true, goalLabel:'30% of last fall\u2019s distro', periodEnd:'2026-11-30'},
  {key:'keystone_ice', name:'Molson Coors – Keystone Ice 40% Buying Account', shortName:'Keystone Ice', unit:'buying account', weight:0.30, type:'pct_of_base', hasData:true, goalLabel:'40% of account base', accountsLabel:'Buying Accounts', brandLabel:'Keystone Ice', periodStart:'2026-08-01'},
  {key:'fever_tree', name:'Molson Coors – Fever Tree (10) New Placements (90-Day Non-Buy)', shortName:'Fever Tree', unit:'new placement', weight:0.15, type:'new_placements', hasData:true, goalLabel:'10 new placements each'},
  {key:'wine_spirits_any', name:'Wine & Spirits – (5) New Placements, Any Brand (90-Day Non-Buy)', shortName:'W&S Any Brand', unit:'new placement', weight:0.15, type:'new_placements', hasData:true, goalLabel:'5 new placements each'},
  // Live since 2026-09-04, from an iSellBeer Promos_Report (not RDE). Scored on
  // DISTINCT PHOTOS, which buildPhotosDataset() already counts: one promo puts
  // out a row per brand on the sticker and those rows share a photo URL, so a
  // cooler door wrap listing Corona and Modelo is one sticker, not two.
  {key:'pos_stickers', name:'POS – (5) Cooler Door Stickers, Any Brand in iSellBeer', shortName:'Cooler Door Stickers', unit:'cooler door sticker', weight:0.10, type:'photos', hasData:true, goalLabel:'5 cooler door stickers each',
   photoUnit:'stickers', photoColLabel:'Stickers', photoItemsLabel:'Brands on the sticker', photoEmptyLabel:'cooler door stickers'},
];

// Each entry is a permanent monthly snapshot -- add a new one here (and a
// matching generate_<key>.py, and its own objectives list above) once a new
// month's RDE exports are ready. Earlier months stay viewable forever.
// MONTHS[MONTHS.length-1] is the default/active tab on page load, so the
// most-recently-added month should stay last in this array.
const MONTHS = [
  {key:'2026-07', label:'July 2026', dir:'data/2026-07/', objectives: OBJECTIVES_2026_07, tables: [
    {objKey:'new_belgium', special:'new_belgium', actualsFile:'mpo_new_belgium_actuals.json', goalsFile:'mpo_new_belgium_90goals.json'},
    {objKey:'ws_2xo', file:'mpo_wine_spirits_2xo.json', target:4, builder:'placements'},
    {objKey:'sapporo_light', file:'mpo_sapporo_light.json', target:5, builder:'placements'},
    {objKey:'famosa', file:'mpo_famosa.json', target:5, builder:'placements'},
  ]},
  {key:'2026-08', label:'August 2026', dir:'data/2026-08/', objectives: OBJECTIVES_2026_08, tables: [
    {objKey:'corona_premier', file:'mpo_corona_premier.json', target:5, builder:'placements',
      targetsFile:'mpo_targets_corona_premier.json'},
    {objKey:'bbc_lytt', special:'pct_of_base', baseFile:'mpo_sales_reps_customer_base_core.json', numFile:'mpo_bbc_lytt_numerator.json', pct:0.25,
      minSkus:3, targetsFile:'mpo_targets_bbc_lytt.json'},
    {objKey:'molson_coors', file:'mpo_molson_coors.json', dual:true, brandField:'BRAND_FAMILY',
      subs: OBJECTIVES_2026_08.find(o=>o.key==='molson_coors').subs, builder:'new_accounts',
      targetsFile:'mpo_targets_molson_coors.json', targetsBrandField:'BRAND_FAMILY'},
    {objKey:'wine_spirits', file:'mpo_wine_spirits.json', dual:true, brandField:'BRAND_FAMILY',
      subs: OBJECTIVES_2026_08.find(o=>o.key==='wine_spirits').subs, builder:'new_accounts'},
    {objKey:'disruptors', file:'mpo_lytt_photos.json', target:8, builder:'photos'},
  ]},
  {key:'2026-09', label:'September 2026', dir:'data/2026-09/', objectives: OBJECTIVES_2026_09, tables: [
    {objKey:'constellation_gaintain', special:'pct_of_goal', file:'mpo_constellation_gaintain.json', pct:0.30},
    {objKey:'keystone_ice', special:'pct_of_base', baseFile:'mpo_sales_reps_customer_base_core.json', numFile:'mpo_keystone_ice_numerator.json', pct:0.40,
      targetsFile:'mpo_targets_keystone_ice.json'},
    {objKey:'fever_tree', file:'mpo_fever_tree.json', target:10, builder:'new_placements',
      targetsFile:'mpo_targets_fever_tree.json'},
    {objKey:'wine_spirits_any', file:'mpo_wine_spirits_any_brand.json', target:5, builder:'new_placements'},
    {objKey:'pos_stickers', file:'mpo_pos_cooler_doors.json', target:5, builder:'photos'},
  ]},
];

// ---- Snowflake JSON -> DATA builder ----
// Column names in the synced tables aren't guaranteed, so match by
// tokenized header words instead of position/exact-name (same approach
// used for the on-prem MPO tracker).
function tokens(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);}
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
// Pulls a SKU-like numeric code (3+ digits) out of either a dedicated
// product-number column or a combined "12345 Product Name ..." string.
// Package sizes ("2/12/12 oz Can") never contain a 3+ digit run, so this
// doesn't false-match on those.
function extractProductNum(s){const m=String(s||"").match(/\d{3,}/);return m?m[0]:null;}

const REP_COLS=[["rep","name"],["rep"]];
const CUSTOMER_COLS=[["customer","name"],["account","name"],["customer"],["account"],["location"]];
const CUSTOMER_NUM_COLS=[["customer","num"],["customer","id"],["account","num"]];
const DATE_COLS=[["date"]];
const NEWBUYER_COLS=[["new","buyer"],["is","new"],["new","placement"]];
const PERIOD_COLS=[["period"]];
const BRAND_COLS=[["brand","family"],["brand"]];
const PRODUCT_COLS=[["product","name"],["product","desc"],["product"],["brand"],["item"]];
const COUNT_COLS=[["count"],["qty"],["quantity"],["cases"],["units"]];
const PACKAGE_COLS=[["package","group"],["package"],["pack"]];
const PLACEMENTS_COLS=[["placement"]];
const GOAL_COLS=[["goal"]];

// Header-name matching breaks down for columns like "Product #" — the "#"
// is stripped by tokens(), leaving just "product", indistinguishable from
// a product-NAME column by name alone. Classify by sampled VALUES instead:
// a "product"/"item"/"sku"-tokened column whose values are mostly numeric
// is the number column; a same-topic column with mostly non-numeric values
// is the name column. Sidesteps header-spelling guesswork entirely.
function isNumericValue(v){if(v==null) return false; const s=String(v).trim(); return s!==""&&/^-?\d+(\.\d+)?$/.test(s);}
function findProductNumNameCols(rows){
  const keys=Object.keys(rows[0]);
  const candidates=keys.filter(k=>{const t=tokens(k);return t.some(tok=>wordMatches(tok,"product")||wordMatches(tok,"item")||wordMatches(tok,"sku"));});
  const sample=rows.slice(0,Math.min(25,rows.length));
  let numCol=null, nameCol=null;
  candidates.forEach(k=>{
    const vals=sample.map(r=>r[k]).filter(v=>v!=null&&String(v).trim()!=="");
    const numericCount=vals.filter(isNumericValue).length;
    const mostlyNumeric=vals.length>0&&numericCount>=Math.ceil(vals.length*0.8);
    if(mostlyNumeric){ if(!numCol) numCol=k; } else { if(!nameCol) nameCol=k; }
  });
  return {numCol, nameCol};
}

function buildPlacementsDataset(rows, target){
  if(!Array.isArray(rows)||!rows.length) return null;
  const repCol=findCol(rows[0],REP_COLS), prodCol=findCol(rows[0],PRODUCT_COLS),
        custCol=findCol(rows[0],CUSTOMER_COLS), dateCol=findCol(rows[0],DATE_COLS),
        countCol=findCol(rows[0],COUNT_COLS), brandCol=findCol(rows[0],BRAND_COLS);
  if(!repCol||!prodCol||!custCol||!dateCol||!countCol) return null;
  const byRep=new Map();
  rows.forEach(r=>{
    const rep=String(r[repCol]||"").trim(); if(!rep) return;
    if(!byRep.has(rep)) byRep.set(rep,[]);
    const n=parseFloat(r[countCol]);
    const line={product:String(r[prodCol]||"").trim(), customer:String(r[custCol]||"").trim(), date:String(r[dateCol]||"").trim(), count:isNaN(n)?1:n};
    if(brandCol) line.brand=String(r[brandCol]||"").trim();
    byRep.get(rep).push(line);
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

function buildNewAccountsDataset(rows, target){
  if(!Array.isArray(rows)||!rows.length) return null;
  const repCol=findCol(rows[0],REP_COLS), custCol=findCol(rows[0],CUSTOMER_COLS),
        dateCol=findCol(rows[0],DATE_COLS), flagCol=findCol(rows[0],NEWBUYER_COLS),
        periodCol=findCol(rows[0],PERIOD_COLS), prodCol=findCol(rows[0],PRODUCT_COLS);
  if(!repCol||!custCol||!dateCol||!flagCol) return null;
  const byRep=new Map();
  rows.forEach(r=>{
    const rep=String(r[repCol]||"").trim(); if(!rep) return;
    if(!byRep.has(rep)) byRep.set(rep,[]);
    byRep.get(rep).push({customer:String(r[custCol]||"").trim(), date:String(r[dateCol]||"").trim(), new_buyer: truthyFlag(r[flagCol])?"1":"0", period: periodCol?String(r[periodCol]||"").trim().toLowerCase():"", product: prodCol?String(r[prodCol]||"").trim():""});
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

// Per-rep VARIABLE target: each rep's target is ceil(pct * their own
// distinct account-base size), not a fixed number across reps (BBC Lytt --
// 25% of account base). baseRows is the denominator source (one row per
// rep/account, possibly duplicated per shipping address -- deduped here by
// customer number); numRows is the numerator source (one row per rep/
// account/product carrying the tracked brand). A rep with no base-file
// rows is skipped entirely (rather than assumed to have a target of 0).
// minSkus (added 2026-08-26, per Gavin: "only count the account if they have
// AT LEAST 3 Lytt skus. anything under this does not qualify"): an account in
// the numerator only counts toward penetration once it carries that many
// DISTINCT products. Accounts below the bar stay in `lines` -- they are the
// closest thing a rep has to a sure win, needing one or two more SKUs rather
// than a cold sell -- and lineTableLytt() shows them with what they still
// need. They are simply not in `qualifying`/`accounts`. Omit minSkus and the
// objective counts any carrying account, as before.
function buildPctOfBaseDataset(baseRows, numRows, pct, minSkus){
  if(!Array.isArray(baseRows)||!baseRows.length) return null;
  const bRepCol=findCol(baseRows[0],REP_COLS), bNumCol=findCol(baseRows[0],CUSTOMER_NUM_COLS);
  if(!bRepCol||!bNumCol) return null;
  const baseByRep=new Map();
  baseRows.forEach(r=>{
    const rep=String(r[bRepCol]||"").trim(); if(!rep) return;
    if(!baseByRep.has(rep)) baseByRep.set(rep,new Set());
    baseByRep.get(rep).add(String(r[bNumCol]||"").trim());
  });
  const numByRep=new Map();
  if(Array.isArray(numRows)&&numRows.length){
    const nRepCol=findCol(numRows[0],REP_COLS), nNumCol=findCol(numRows[0],CUSTOMER_NUM_COLS),
          nNameCol=findCol(numRows[0],CUSTOMER_COLS), nProdCol=findCol(numRows[0],PRODUCT_COLS);
    numRows.forEach(r=>{
      const rep=String(r[nRepCol]||"").trim(); if(!rep) return;
      if(!numByRep.has(rep)) numByRep.set(rep,[]);
      numByRep.get(rep).push({
        customer_num: nNumCol?String(r[nNumCol]||"").trim():"",
        customer: nNameCol?String(r[nNameCol]||"").trim():"",
        product: nProdCol?String(r[nProdCol]||"").trim():"",
      });
    });
  }
  const reps=[];
  baseByRep.forEach((accountSet,rep)=>{
    const base=accountSet.size;
    const target=Math.max(1,Math.ceil(base*pct));
    const lines=numByRep.get(rep)||[];
    const skusByAccount=new Map();
    lines.forEach(l=>{
      if(!skusByAccount.has(l.customer_num)) skusByAccount.set(l.customer_num,new Set());
      skusByAccount.get(l.customer_num).add(l.product);
    });
    const min=minSkus||1;
    const qualifyingSet=new Set([...skusByAccount.entries()]
      .filter(([,skus])=>skus.size>=min).map(([num])=>num));
    reps.push({rep, base, target, qualifying:qualifyingSet.size, accounts:[...qualifyingSet],
               lines, minSkus:min});
  });
  const reps_at_goal=ROSTER.filter(name=>{const r=reps.find(x=>x.rep===name);return r?r.qualifying>=r.target:false;}).length;
  return {pct, reps, reps_at_goal, reps_total:ROSTER.length};
}

// A pct_of_base rep's headline number is PENETRATION -- what share of their
// own account base carries the brand -- not a raw count against a derived
// target (changed 2026-08-25 per Gavin: "change the lytt accounts from 14/10
// to % penetration"). At-goal is unchanged by this: target is
// ceil(pct * base), and for an integer count qualifying >= ceil(pct * base)
// is exactly qualifying/base >= pct, so the same reps qualify as before --
// only the way it reads changed. r.target is still what the bar and the
// at-goal flag are scored on, so the two can never disagree.
function penetration(r){ return r.base ? (r.qualifying/r.base)*100 : 0; }
// Whole numbers stay whole (25%, not 25.0%); anything else gets one decimal.
function fmtPen(p){ return fmtPts(p)+'%'; }
// The gap between two percentages is percentage POINTS, not percent -- the
// over-badge says "+10 pts over", never "+10% over", which would read as a
// relative 10% and overstate it.
function fmtPts(p){ return Math.round(p*10)%10===0 ? p.toFixed(0) : p.toFixed(1); }

// Lytt POS photos (Disruptors): rows come from generate_lytt_pos.py with
// fixed keys (REP/SOURCE/CUSTOMER_NAME/CITY/BRAND/DETAIL/QUANTITY/DATE/
// PHOTO_URL), one row per photographed POS item, every row guaranteed to
// carry a photo link. A rep's progress toward the 8 is DISTINCT photo
// links (per Gavin 2026-08-19), not rows -- one photo showing five items
// is one pic.
function buildPhotosDataset(rows, target){
  if(!Array.isArray(rows)||!rows.length) return null;
  const byRep=new Map();
  rows.forEach(r=>{
    const rep=String(r.REP||"").trim();
    if(!rep||!r.PHOTO_URL) return;
    if(!byRep.has(rep)) byRep.set(rep,[]);
    byRep.get(rep).push({source:String(r.SOURCE||""), customer:String(r.CUSTOMER_NAME||""), city:String(r.CITY||""),
      brand:String(r.BRAND||""), detail:String(r.DETAIL||""), qty:r.QUANTITY==null?"":String(r.QUANTITY),
      date:String(r.DATE||""), photo:String(r.PHOTO_URL)});
  });
  const reps=[];
  byRep.forEach((lines,rep)=>{
    lines.sort((a,b)=>parseDateMs(b.date)-parseDateMs(a.date));
    const count=new Set(lines.map(l=>l.photo)).size;
    reps.push({rep, count, lines});
  });
  const reps_at_goal=ROSTER.filter(name=>{const r=reps.find(x=>x.rep===name);return r?r.count>=target:false;}).length;
  return {target_per_rep:target, reps, reps_at_goal, reps_total:ROSTER.length};
}

// September's Fever Tree / Wine & Spirits exports carry NO per-row Date:
// RDE hands over one row per rep/account (Fever Tree) or rep/account/product
// (Wine & Spirits) with two windowed placement columns -- a 6/1-8/31 base
// (the 90-day non-buy window) and a 9/1-9/30 current -- instead of the
// transaction log August's classify_dual_period() walked. So the same
// "no purchase in the prior ~90 days, a purchase this month" rule is just a
// column read, done in generate_2026-09.py, which sets NEW_PLACEMENT per row.
//
// Progress counts PLACEMENTS, not qualifying ROWS -- the difference that
// makes this its own builder rather than a reuse of buildNewAccountsDataset().
// Fever Tree's export is account-level, so a single newly-opened account
// carrying 6 Fever Tree SKUs is 6 placements toward the 10. (Wine & Spirits
// is product-level with every current value 1.00, so there the two counts
// coincide.)
function buildNewPlacementsDataset(rows, target){
  if(!Array.isArray(rows)||!rows.length) return null;
  const byRep=new Map();
  rows.forEach(r=>{
    const rep=String(r.SALES_REP_ASSIGNED||"").trim(); if(!rep) return;
    if(!byRep.has(rep)) byRep.set(rep,[]);
    byRep.get(rep).push({
      product:String(r.PRODUCT_NAME||"").trim(),
      customer:String(r.CUSTOMER_NAME||"").trim(),
      base:Number(r.BASE_PLACEMENTS)||0,
      current:Number(r.CURRENT_PLACEMENTS)||0,
      isNew:String(r.NEW_PLACEMENT)==="1",
    });
  });
  const reps=[];
  byRep.forEach((lines,rep)=>{
    const qualifying=lines.filter(l=>l.isNew).reduce((s,l)=>s+l.current,0);
    reps.push({rep, qualifying, lines});
  });
  const reps_at_goal=ROSTER.filter(name=>{const r=reps.find(x=>x.rep===name);return r?r.qualifying>=target:false;}).length;
  return {target_per_rep:target, reps, reps_at_goal, reps_total:ROSTER.length};
}

// Per-rep VARIABLE target measured against the rep's OWN PRIOR-YEAR result
// rather than their account base -- Constellation's "30% Corona Gaintain
// Distro" (per Gavin, 2026-09-02: the goal is 30% of the placements a rep
// made 9/1/2025 - 11/30/2025, the export's first column). Sibling of
// buildPctOfBaseDataset(): same "every rep gets a different number" idea,
// different denominator. One file carries both columns per rep/product, so
// there is nothing to join.
//
// A rep in the export with no prior-fall placements at all still gets a
// target of 1 (Math.max, same floor as pct_of_base) rather than a target of
// 0 that anyone would clear by doing nothing.
function buildPctOfGoalDataset(rows, pct){
  if(!Array.isArray(rows)||!rows.length) return null;
  const byRep=new Map();
  rows.forEach(r=>{
    const rep=String(r.SALES_REP_ASSIGNED||"").trim(); if(!rep) return;
    if(!byRep.has(rep)) byRep.set(rep,[]);
    byRep.get(rep).push({product:String(r.PRODUCT_NAME||"").trim(),
                         base:Number(r.BASE_PLACEMENTS)||0, current:Number(r.CURRENT_PLACEMENTS)||0});
  });
  const reps=[];
  byRep.forEach((lines,rep)=>{
    const baseline=lines.reduce((s,l)=>s+l.base,0);
    const placements=lines.reduce((s,l)=>s+l.current,0);
    const target=Math.max(1,Math.ceil(baseline*pct));
    lines.forEach(l=>{ l.goal=Math.ceil(l.base*pct); l.pct=l.goal>0?(l.current/l.goal)*100:0; });
    // Products still short of their own 30% share first, worst first --
    // same "surface the outstanding work" ordering as sortNBLines().
    lines.sort((a,b)=>{
      const ah=a.current>=a.goal?1:0, bh=b.current>=b.goal?1:0;
      return ah!==bh ? ah-bh : (a.pct-b.pct || b.goal-a.goal);
    });
    lines.forEach(l=>{ l.share = l.base>0 ? (l.current/l.base)*100 : 0; });
    reps.push({rep, baseline, target, placements, pct: (placements/target)*100,
               // share is THIS FALL AS A PERCENTAGE OF LAST FALL -- the number
               // the objective is actually named for ("30% Corona Gaintain
               // Distro"), and what the status reads. pct above is progress
               // toward that 30%, which is what the bar fills on; the two are
               // different and both are wanted.
               share: baseline>0 ? (placements/baseline)*100 : 0,
               hit: placements>=target, lines});
  });
  const reps_at_goal=ROSTER.filter(name=>{const r=reps.find(x=>x.rep===name);return r?r.hit:false;}).length;
  return {pct, reps, reps_at_goal, reps_total:ROSTER.length};
}

const BUILDERS = {new_accounts: buildNewAccountsDataset, placements: buildPlacementsDataset, photos: buildPhotosDataset, new_placements: buildNewPlacementsDataset};

const AREA_COLS=[["area"]];

// Target-account rows (prospects who don't carry the brand -- or, for
// Molson Coors, a specific product -- yet, in the off-premise core
// territory -- see generate_2026-08.py's build_targets()/
// build_targets_by_product()) grouped by rep, keyed by rep name for
// direct lookup at render time. Molson Coors' rows carry a Product Num/
// Name (Corona Premier's don't), which targetsBlockHtml() uses to decide
// whether to group by product or by county.
function groupTargetsByRep(rows){
  if(!Array.isArray(rows)||!rows.length) return {};
  const repCol=findCol(rows[0],REP_COLS), custCol=findCol(rows[0],CUSTOMER_COLS),
        areaCol=findCol(rows[0],AREA_COLS), prodCol=findCol(rows[0],PRODUCT_COLS);
  if(!repCol||!custCol) return {};
  const by={};
  rows.forEach(r=>{
    const rep=String(r[repCol]||"").trim(); if(!rep) return;
    if(!by[rep]) by[rep]=[];
    by[rep].push({customer:String(r[custCol]||"").trim(), area:areaCol?String(r[areaCol]||"").trim():"", product:prodCol?String(r[prodCol]||"").trim():""});
  });
  return by;
}

// Fixed display order for the core-market counties (matches how Gavin
// always lists them); anything else sorts after, alphabetically. Same
// list as on-prem's ALLOWED_TARGET_COUNTIES/COUNTY_ORDER -- off-prem's
// core territory (sales_reps_customer_base_core.csv) covers this same
// set of counties.
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

// Molson Coors' Target Accounts groups by PRODUCT instead of county --
// per Kohler's manager (2026-08-05), the 90-day-non-buy incentive is
// scored per SKU, so a rep needs to know exactly which product to sell
// in at an account, not just that the account is "missing Peroni".
// Alphabetical by product name; each group lists the accounts (with
// their county, since that's still useful context, just not the grouping
// key here) that haven't carried that exact SKU.
function groupTargetsByProduct(targets){
  const groups = new Map();
  targets.forEach(t=>{
    const key = t.product || 'Other';
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  return [...groups.entries()]
    .map(([name, items])=>({name, items: items.slice().sort((a,b)=>a.customer.localeCompare(b.customer))}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}

// Collapsed-by-default, both at the "N Target Accounts" level and per
// group within it -- a rep's full prospect list can run to 100+ rows, so
// grouping (and keeping every group closed until tapped) is what keeps
// this scannable on an iPad instead of one long undifferentiated list --
// mirrors on-prem's Target Accounts treatment. Reuses the same
// .tgt-county* classes for both grouping modes since the visual pattern
// is identical, just the grouping key (product vs. county) differs.
function targetsBlockHtml(targets, brandLabel){
  if(!targets || !targets.length) return '';
  const tid = 'tgt'+(uid++);
  const byProduct = targets.some(t=>t.product);
  const groups = byProduct ? groupTargetsByProduct(targets) : groupTargetsByCounty(targets);
  const groupsHtml = groups.map(g=>{
    const gid = 'tgtc'+(uid++);
    const rows = g.items.map(t=>`<tr><td>${t.customer}</td>${byProduct?`<td>${t.area}</td>`:''}</tr>`).join('');
    return `<div class="tgt-county">
      <div class="tgt-county-toggle" data-target="${gid}"><span class="tgt-county-chev">▶</span>${g.name}<span class="tgt-county-count">${g.items.length}</span></div>
      <div class="tgt-county-table" id="${gid}"><div class="rep-sub-inner" style="padding-left:2px"><table>${byProduct?'<thead><tr><th>Customer</th><th>Area</th></tr></thead>':''}<tbody>${rows}</tbody></table></div></div>
    </div>`;
  }).join('');
  // Product mode: the header count is DISTINCT accounts missing at least
  // one SKU, not the (much larger) account+product row count -- a rep
  // cares "how many of my accounts have a gap", not how many rows exist.
  const count = byProduct ? new Set(targets.map(t=>t.customer)).size : targets.length;
  const hint = byProduct
    ? `— missing at least one ${brandLabel} product; expand a product below to see who`
    : `— don't carry ${brandLabel} yet, in your core territory`;
  return `<div class="targets-block">
    <div class="targets-toggle" data-target="${tid}"><span class="targets-chev">▶</span>${count} Target Account${count===1?'':'s'}<span class="targets-hint">${hint}</span></div>
    <div class="targets-table" id="${tid}">${groupsHtml}</div>
  </div>`;
}
document.addEventListener('click', e=>{
  const header = e.target.closest('.targets-toggle, .tgt-county-toggle');
  if(!header) return;
  header.classList.toggle('open');
  document.getElementById(header.dataset.target)?.classList.toggle('open');
});

// Joins the flat actuals export (rep/package/product/placements) against
// the long-format goals export (rep/product#/product name/package/GOAL90)
// by rep + product number (falling back to rep + normalized product name
// if either side lacks a parseable product number), NOT by row position.
// The actuals export only contains rows for products with placement
// activity, so a rep/product with zero placements this period has no
// actuals row at all -- those goal rows are backfilled below (as
// zero-placement lines) so group/rep goal totals reflect the full
// assigned goal, not just the goal for products with recorded activity.
function buildNewBelgiumDataset(actualRows, goalRows){
  if(!Array.isArray(actualRows)||!actualRows.length||!Array.isArray(goalRows)||!goalRows.length) return null;
  const aRepCol=findCol(actualRows[0],REP_COLS), aPkgCol=findCol(actualRows[0],PACKAGE_COLS),
        aProdCol=findCol(actualRows[0],PRODUCT_COLS), aPlaceCol=findCol(actualRows[0],PLACEMENTS_COLS);
  const {numCol:gNumCol, nameCol:gNameCol}=findProductNumNameCols(goalRows);
  const gRepCol=findCol(goalRows[0],REP_COLS), gPkgCol=findCol(goalRows[0],PACKAGE_COLS),
        gGoalCol=findCol(goalRows[0],GOAL_COLS);
  if(!aRepCol||!aProdCol||!aPlaceCol||!gRepCol||!gGoalCol||(!gNumCol&&!gNameCol)) return null;

  // The goals export has no package-group field (it has a Package Type
  // string like "1/15/19.2 oz Can" instead) -- build a global product ->
  // package-group lookup from the actuals export (whichever rep/rows have
  // it) so zero-placement goal rows can still be bucketed into the right
  // group.
  const groupByNum=new Map(), groupByName=new Map();
  actualRows.forEach(r=>{
    const productRaw=String(r[aProdCol]||"").trim();
    const pkg=aPkgCol?String(r[aPkgCol]||"").trim():"";
    if(!pkg) return;
    const num=extractProductNum(productRaw);
    if(num && !groupByNum.has(num)) groupByNum.set(num,pkg);
    const nameKey=tokens(productRaw).join(" ");
    if(nameKey && !groupByName.has(nameKey)) groupByName.set(nameKey,pkg);
  });

  const goalList=[];
  goalRows.forEach(r=>{
    const rep=String(r[gRepCol]||"").trim(); if(!rep) return;
    const goal=parseFloat(r[gGoalCol]); if(isNaN(goal)) return;
    const num=gNumCol?extractProductNum(r[gNumCol]):null;
    const rawName=gNameCol?String(r[gNameCol]||"").trim():"";
    const nameKey=rawName?tokens(rawName).join(" "):null;
    const pkgType=gPkgCol?String(r[gPkgCol]||"").trim():"";
    const displayProduct=[num,rawName,pkgType].filter(Boolean).join(" ");
    const package_group=(num&&groupByNum.get(num))||(nameKey&&groupByName.get(nameKey))||"";
    goalList.push({rep, num, nameKey, goal90:goal, package_group, displayProduct});
  });
  const goalMap=new Map();
  goalList.forEach(g=>{
    if(g.num) goalMap.set(g.rep+"|n:"+g.num, g);
    if(g.nameKey && !goalMap.has(g.rep+"|t:"+g.nameKey)) goalMap.set(g.rep+"|t:"+g.nameKey, g);
  });

  const byRep=new Map();
  function repLineMap(rep){ if(!byRep.has(rep)) byRep.set(rep,new Map()); return byRep.get(rep); }

  let unmatched=0;
  actualRows.forEach(r=>{
    const rep=String(r[aRepCol]||"").trim(); if(!rep) return;
    const productRaw=String(r[aProdCol]||"").trim();
    const placementsRaw=parseFloat(r[aPlaceCol]);
    const placements=isNaN(placementsRaw)?0:placementsRaw;
    const pkg=aPkgCol?String(r[aPkgCol]||"").trim():"";
    const num=extractProductNum(productRaw);
    const nameKey=tokens(productRaw).join(" ");
    const g=(num&&goalMap.get(rep+"|n:"+num))||goalMap.get(rep+"|t:"+nameKey);
    if(!g) unmatched++;
    const goal90=g?g.goal90:0;
    const pct=goal90>0?Math.round((placements/goal90*100)*10)/10:0;
    const matchKey=g?(g.num?"n:"+g.num:"t:"+g.nameKey):"raw:"+nameKey;
    repLineMap(rep).set(matchKey, {package_group:pkg||(g&&g.package_group)||"", product:productRaw, placements, goal90, pct});
  });
  if(unmatched) console.warn('New Belgium: '+unmatched+' actual rows had no matching goal row (rep+product could not be joined)');

  // Backfill any goal row with no actuals this period as a zero-placement line.
  goalList.forEach(g=>{
    const matchKey=g.num?"n:"+g.num:"t:"+g.nameKey;
    const lines=repLineMap(g.rep);
    if(!lines.has(matchKey)){
      lines.set(matchKey, {package_group:g.package_group, product:g.displayProduct, placements:0, goal90:g.goal90, pct:0});
    }
  });

  const reps=[];
  let total_placements=0, total_goal90=0, reps_hit90=0;
  byRep.forEach((lineMap,rep)=>{
    const repLines=[...lineMap.values()];
    const placements=repLines.reduce((s,l)=>s+l.placements,0);
    const goal90=repLines.reduce((s,l)=>s+l.goal90,0);
    const pct=goal90>0?Math.round((placements/goal90*100)*10)/10:0;
    const hit90=goal90>0&&(placements/goal90)>=0.9;
    total_placements+=placements; total_goal90+=goal90;
    if(hit90) reps_hit90++;
    reps.push({rep, placements, goal90, pct, hit90, lines:repLines});
  });
  const company_pct=total_goal90>0?Math.round((total_placements/total_goal90*100)*10)/10:0;
  return {company_pct, total_placements, total_goal90, reps_hit90, reps_total:ROSTER.length, reps};
}

// Fetch + build one month's DATA. Pure data: no DOM, no month tabs, no
// error banner -- the host page (index.html) or the hub does those. baseDir
// prefixes the month's data/ folder so a page in another folder can read the
// same files ('' from index.html, '../MPOs/off-prem/' from the hub).
// Returns {month, DATA, missing, syncedAt}; missing lists the hasData
// objectives whose file failed to load or build.
async function loadMonthData(monthKey, baseDir){
  const month = MONTHS.find(m=>m.key===monthKey);
  if(!month) return null;
  baseDir = baseDir || '';
  const DATA = {};
  const cb="?_="+Date.now();
  async function loadJSON(file){
    try{
      const res=await fetch(baseDir+month.dir+file+cb,{cache:"no-store"});
      if(!res.ok) return null;
      return await res.json();
    }catch(e){ return null; }
  }

  for(const t of month.tables){
    try{
      if(t.special==='new_belgium'){
        const [actuals, goals] = await Promise.all([loadJSON(t.actualsFile), loadJSON(t.goalsFile)]);
        if(actuals && goals){
          const built=buildNewBelgiumDataset(actuals, goals);
          if(built) DATA[t.objKey]=built;
        }
        continue;
      }
      if(t.special==='pct_of_goal'){
        const rows=await loadJSON(t.file);
        if(rows){
          const built=buildPctOfGoalDataset(rows, t.pct);
          if(built) DATA[t.objKey]=built;
        }
        continue;
      }
      if(t.special==='pct_of_base'){
        const [baseRows, numRows] = await Promise.all([loadJSON(t.baseFile), loadJSON(t.numFile)]);
        if(baseRows){
          const built=buildPctOfBaseDataset(baseRows, numRows||[], t.pct, t.minSkus);
          if(built){
            DATA[t.objKey]=built;
            if(t.targetsFile){
              const trows=await loadJSON(t.targetsFile);
              if(trows) built.targetsByRep=groupTargetsByRep(trows);
            }
          }
        }
        continue;
      }
      const rows=await loadJSON(t.file);
      if(!rows) continue;
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
        const trows=await loadJSON(t.targetsFile);
        if(trows){
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
  if(o.key==='new_belgium') return Math.min(DATA.new_belgium.company_pct,100);
  const d = DATA[o.key];
  return d.reps_total ? (d.reps_at_goal/d.reps_total)*100 : 0;
}

// Sort New Belgium product lines so incomplete (not yet at goal) show first, worst first
function sortNBLines(lines){
  return lines.slice().sort((a,b)=>{
    const ah = a.pct>=90?1:0, bh = b.pct>=90?1:0;
    if(ah!==bh) return ah-bh;
    return a.pct-b.pct;
  });
}
function nbPctCell(pct){
  return pct>=90 ? '<span class="complete-tag">At Goal</span>' : pct.toFixed(1)+'%';
}
// Groups a rep's product lines by package type, sorting each group's
// products incomplete-first/worst-first (same rule as sortNBLines), and
// puts groups with anything still below goal ahead of fully-at-goal
// groups so the rep's outstanding work still surfaces first overall.
function groupNBLines(lines){
  const groups = new Map();
  lines.forEach(l=>{
    const key = l.package_group || 'Other';
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  });
  return [...groups.entries()]
    .map(([name, items])=>{
      const sorted = sortNBLines(items);
      const totalPlacements = sorted.reduce((s,l)=>s+l.placements,0);
      const totalGoal90 = sorted.reduce((s,l)=>s+l.goal90,0);
      return {name, items: sorted, hasIncomplete: sorted.some(l=>l.pct<90), totalPlacements, totalGoal90};
    })
    .sort((a,b)=> a.hasIncomplete===b.hasIncomplete ? a.name.localeCompare(b.name) : (a.hasIncomplete?-1:1));
}
function nbLineTable(lines){
  const body = groupNBLines(lines).map(g=>{
    const gid = 'nbg'+(uid++);
    const header = `<tr class="pkg-group-row" data-group="${gid}"><td><span class="pkg-chev">▼</span>${g.name}</td><td class="num">${g.totalPlacements}</td><td class="num">${g.totalGoal90}</td><td class="num"></td></tr>`;
    const rows = g.items.map(l=>`<tr class="pkg-item-row ${gid} ${l.pct<90?'focus-row':''}"><td>${l.product}</td><td class="num">${l.placements}</td><td class="num">${l.goal90}</td><td class="num">${nbPctCell(l.pct)}</td></tr>`).join('');
    return header+rows;
  }).join('');
  return `<table><thead><tr><th>Product</th><th class="num">Placements</th><th class="num">100% Goal</th><th class="num">% to Goal</th></tr></thead><tbody>${body}</tbody></table>`;
}
// Delegated once for the whole page -- covers package-group headers however
// many times nbLineTable() re-renders (rep view, or every expanded row in
// the objective view's New Belgium table).
document.addEventListener('click', e=>{
  const header = e.target.closest('.pkg-group-row');
  if(!header) return;
  const gid = header.dataset.group;
  const collapsed = header.classList.toggle('collapsed');
  document.querySelectorAll('.pkg-item-row.'+gid).forEach(row=>row.classList.toggle('hidden', collapsed));
});

// Module-local counters/state that used to be page globals.
let uid = 0;
let activeMonth = null;

function lineTablePlacements(lines){
  if(!lines || lines.length===0) return '<div class="no-lines">No activity recorded this month.</div>';
  const rows = lines.map(l=>`<tr><td>${l.product}</td><td>${l.customer}</td><td>${l.date}</td><td class="num">${l.count}</td></tr>`).join('');
  return `<div class="rep-sub-inner" style="padding-left:2px"><table><thead><tr><th>Product</th><th>Customer</th><th>Date</th><th class="num">Count</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
// Raw lines carry one row per historical transaction (going back to May so
// the 90-day-non-buy classifier has purchase history to check), but a rep
// doesn't need every prior date -- just when an account/product last
// bought in the base (90-day non-buy) period vs. the current month, and
// what that means. Molson Coors/Wine & Spirits both carry a PERIOD field
// (base/current) per line -- mirrors on-prem's identical treatment:
//   New Buyer            -- bought this month, never in the base period.
//                            Eligible for this incentive.
//   Repeat Buyer          -- bought in BOTH the base period and this
//                            month. Not new, but actively reordering.
//   Bought in Base Period -- bought in the base period only, no
//                            this-month purchase yet. Already carries the
//                            brand, not an incentive-eligible target.
// Only New Buyers are shown directly -- Repeat Buyers and Bought-in-Base-
// Period accounts already carry the brand, so they're tucked behind the
// same collapsed-dropdown pattern as Target Accounts instead of cluttering
// the default view (same cleanup as on-prem's).
//
// Rows are deduped by (customer, product) rather than customer alone when
// product info is present -- Molson Coors' new-placement classification is
// now per PRODUCT (see generate_2026-08.py), so a single account can carry
// several independent new-vs-existing statuses (one per SKU) in the same
// Peroni/Banquet sub-table; collapsing by customer alone would silently
// merge separate new placements into one row.
function isActiveMonthDate(dateStr){
  return typeof dateStr==='string' && dateStr.startsWith(activeMonth);
}
function lineTableNewAccounts(lines, flagLabel, targetsHtml){
  flagLabel = flagLabel || 'New Buyer';
  targetsHtml = targetsHtml || '';
  if(!lines || lines.length===0) return `<div class="no-lines">No activity recorded this month.</div>${targetsHtml}`;
  const hasPeriods = lines.some(l=>l.period==='base'||l.period==='current');
  const hasProduct = lines.some(l=>l.product);
  const keyOf = l => hasProduct ? (l.customer+''+l.product) : l.customer;

  if(!hasPeriods){
    const byKey = new Map();
    lines.forEach(l=>{
      const k=keyOf(l);
      if(!byKey.has(k)) byKey.set(k, {customer:l.customer, product:l.product, isNew:false, activeDate:null});
      const c = byKey.get(k);
      if(l.new_buyer==='1') c.isNew = true;
      if(isActiveMonthDate(l.date) && (!c.activeDate || l.date>c.activeDate)) c.activeDate = l.date;
    });
    const rows = [...byKey.values()]
      .sort((a,b)=> (b.isNew-a.isNew) || (b.activeDate||'').localeCompare(a.activeDate||'') || a.customer.localeCompare(b.customer))
      .map(c=>{
        const status = c.isNew ? `<span class="flag-hit">✓ ${flagLabel}</span>` : (c.activeDate ? '<span class="flag-miss">Regular Buyer</span>' : '<span class="flag-miss">—</span>');
        return `<tr>${hasProduct?`<td>${c.product}</td>`:''}<td>${c.customer}</td><td>${c.activeDate||''}</td><td>${status}</td></tr>`;
      }).join('');
    return `<div class="rep-sub-inner" style="padding-left:2px"><table><thead><tr>${hasProduct?'<th>Product</th>':''}<th>Customer</th><th>Date</th><th>Qualifies</th></tr></thead><tbody>${rows}</tbody></table>${targetsHtml}</div>`;
  }

  const byKey = new Map();
  lines.forEach(l=>{
    const k=keyOf(l);
    if(!byKey.has(k)) byKey.set(k, {customer:l.customer, product:l.product, isNew:false, baseDate:null, currentDate:null});
    const c = byKey.get(k);
    if(l.new_buyer==='1') c.isNew = true;
    if(l.period==='current' && (!c.currentDate || l.date>c.currentDate)) c.currentDate = l.date;
    if(l.period==='base' && (!c.baseDate || l.date>c.baseDate)) c.baseDate = l.date;
  });
  const all = [...byKey.values()];

  const newOnes = all.filter(c=>c.isNew)
    .sort((a,b)=> (b.currentDate||'').localeCompare(a.currentDate||'') || a.customer.localeCompare(b.customer));
  const existing = all.filter(c=>!c.isNew)
    .sort((a,b)=>{
      const rank = c => (c.baseDate && c.currentDate) ? 0 : 1; // Repeat Buyer before Bought in Base Period
      return rank(a)-rank(b) || (b.currentDate||b.baseDate||'').localeCompare(a.currentDate||a.baseDate||'') || a.customer.localeCompare(b.customer);
    });

  const newRowsHtml = newOnes.length
    ? `<table><thead><tr>${hasProduct?'<th>Product</th>':''}<th>Customer</th><th>Base Period</th><th>This Month</th><th>Status</th></tr></thead><tbody>${
        newOnes.map(c=>`<tr>${hasProduct?`<td>${c.product}</td>`:''}<td>${c.customer}</td><td>${c.baseDate||''}</td><td>${c.currentDate||''}</td><td><span class="flag-hit">✓ ${flagLabel}</span></td></tr>`).join('')
      }</tbody></table>`
    : `<div class="no-lines" style="padding:0">No new placements yet this month.</div>`;

  return `<div class="rep-sub-inner" style="padding-left:2px">${newRowsHtml}${targetsHtml}${existingAccountsBlockHtml(existing, hasProduct)}</div>`;
}
// Same collapsed-dropdown treatment as Target Accounts, for accounts that
// already carry the brand (Repeat Buyer or Bought in Base Period) -- kept
// available for full traceability, just not part of what a rep sees by
// default when they open the program.
function existingAccountsBlockHtml(existing, hasProduct){
  if(!existing.length) return '';
  const eid = 'exist'+(uid++);
  const rows = existing.map(c=>{
    // baseDate-only -> genuinely only bought in the base period. currentDate-only
    // (not new) can only happen for a customer+product/key that already had an
    // earlier current-period row claim the new-placement flag (e.g. two separate
    // transactions of the same product/key in the same month) -- that's a repeat
    // within this month, NOT "Bought in Base Period", which was the bug that hid
    // genuinely-new per-product placements (see generate_2026-08.py's docstring).
    const status = (c.baseDate && c.currentDate) ? 'Repeat Buyer'
      : c.baseDate ? 'Bought in Base Period'
      : 'Repeat This Month';
    return `<tr>${hasProduct?`<td>${c.product}</td>`:''}<td>${c.customer}</td><td>${c.baseDate||''}</td><td>${c.currentDate||''}</td><td><span class="flag-miss">${status}</span></td></tr>`;
  }).join('');
  return `<div class="targets-block">
    <div class="targets-toggle" data-target="${eid}"><span class="targets-chev">▶</span>${existing.length} Existing Account${existing.length===1?'':'s'}<span class="targets-hint">— already carry it, not eligible for new-placement credit</span></div>
    <div class="targets-table" id="${eid}"><table><thead><tr>${hasProduct?'<th>Product</th>':''}<th>Customer</th><th>Base Period</th><th>This Month</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}
// BBC Lytt's numerator file has no per-row Date (it's a distro snapshot,
// not a transaction log), so each line is just a Customer/Product pair.
// Grouped by Customer (collapsed by default, same .tgt-county* toggle
// pattern as Target Accounts) rather than one flat row per customer+product
// -- a rep can carry Lytt in several flavors at the same account, which
// made the old flat table run long and repeat the customer name on every
// row. Clicking a customer reveals just their products.
// Counts DISTINCT products per account, since that is what the minSkus bar is
// scored on -- an account with the same SKU on three lines carries one SKU.
// Accounts short of the bar are listed under their own heading with how many
// more SKUs they need: they don't count yet, but they're the cheapest accounts
// on a rep's list to convert, so burying them would waste the change.
function lineTableLytt(lines, minSkus, brandLabel){
  brandLabel = brandLabel || 'Lytt';
  if(!lines || lines.length===0) return `<div class="no-lines">No ${brandLabel}-carrying accounts recorded this month.</div>`;
  const min = minSkus||1;
  const byCustomer = new Map();
  lines.forEach(l=>{
    if(!byCustomer.has(l.customer)) byCustomer.set(l.customer, new Set());
    byCustomer.get(l.customer).add(l.product);
  });
  const customers = [...byCustomer.entries()]
    .map(([customer, skus])=>[customer, [...skus]])
    .sort((a,b)=>a[0].localeCompare(b[0]));
  const block = ([customer, products], short)=>{
    const gid = 'tgtc'+(uid++);
    const prodRows = products.slice().sort().map(p=>`<tr><td>${p}</td></tr>`).join('');
    const need = min - products.length;
    const tag = short ? `<span class="lytt-short">${need} more SKU${need===1?'':'s'} to qualify</span>` : '';
    return `<div class="tgt-county">
      <div class="tgt-county-toggle" data-target="${gid}"><span class="tgt-county-chev">▶</span>${customer}${tag}<span class="tgt-county-count">${products.length}</span></div>
      <div class="tgt-county-table" id="${gid}"><div class="rep-sub-inner" style="padding-left:2px"><table><thead><tr><th>Product</th></tr></thead><tbody>${prodRows}</tbody></table></div></div>
    </div>`;
  };
  const qualifying = customers.filter(([,p])=>p.length>=min);
  const short = customers.filter(([,p])=>p.length<min);
  let html = qualifying.map(c=>block(c,false)).join('');
  if(short.length){
    html += `<div class="lytt-short-head">${short.length} account${short.length===1?'':'s'} carrying ${brandLabel} but under ${min} SKUs — not counted yet</div>`
          + short.map(c=>block(c,true)).join('');
  }
  return `<div class="rep-sub-inner" style="padding-left:2px">${html}</div>`;
}

// One table row per DISTINCT PHOTO (matching how the 8-pic target is
// counted), with every Lytt item pictured in it listed on that row --
// mirrors the display-auction tracker's photo-first, rep-grouped layout.
// The photos drill-down is shared by August's Lytt POS pics and September's
// cooler door stickers, so its wording comes off the objective rather than
// being hardcoded. Defaults reproduce the Lytt wording exactly, which is what
// every caller that passes no objective still gets.
function lineTablePhotos(lines, o){
  o = o || {};
  const emptyLabel = o.photoEmptyLabel || 'Lytt POS photos';
  const itemsLabel = o.photoItemsLabel || 'Lytt items pictured';
  if(!lines || lines.length===0) return `<div class="no-lines">No ${emptyLabel} submitted yet this month.</div>`;
  const byPhoto=new Map();
  lines.forEach(l=>{
    if(!byPhoto.has(l.photo)) byPhoto.set(l.photo,[]);
    byPhoto.get(l.photo).push(l);
  });
  const rows=[...byPhoto.values()].map(items=>{
    const f=items[0];
    const itemsHtml=items.map(l=>l.brand+(l.detail?` <span class="photo-sub">${l.detail}</span>`:'')+(l.qty&&l.qty!=='1'?` ×${l.qty}`:'')).join(', ');
    return `<tr><td><a class="photo-btn" href="${f.photo}" target="_blank" rel="noopener">📷 View Photo</a></td>`+
      `<td>${f.customer}${f.city?` <span class="photo-sub">· ${f.city}</span>`:''}</td>`+
      `<td>${itemsHtml}</td><td>${f.source}</td><td style="white-space:nowrap">${f.date||'—'}</td></tr>`;
  }).join('');
  return `<div class="rep-sub-inner" style="padding-left:2px"><table><thead><tr><th>Photo</th><th>Account</th><th>${itemsLabel}</th><th>Source</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// September's new-placement drill-down. Same shape as lineTableNewAccounts()
// -- qualifying rows up top, everything that already carries the brand
// tucked behind a collapsed "N Existing Accounts" dropdown -- but the two
// middle columns are PLACEMENT COUNTS, not dates: these exports have no
// per-row date to show (see buildNewPlacementsDataset()), and the counts are
// what the objective is actually scored on.
function lineTableNewPlacements(lines, flagLabel, targetsHtml){
  flagLabel = flagLabel || 'New Placement';
  targetsHtml = targetsHtml || '';
  if(!lines || lines.length===0) return `<div class="no-lines">No activity recorded this month.</div>${targetsHtml}`;
  const hasProduct = lines.some(l=>l.product);
  const cols = `${hasProduct?'<th>Product</th>':''}<th>Customer</th><th class="num">Base Period</th><th class="num">This Month</th><th>Status</th>`;
  const row = (l,status)=>`<tr>${hasProduct?`<td>${l.product}</td>`:''}<td>${l.customer}</td><td class="num">${l.base||'—'}</td><td class="num">${l.current||'—'}</td><td>${status}</td></tr>`;
  const bySize = (a,b)=> b.current-a.current || a.customer.localeCompare(b.customer);
  const newOnes = lines.filter(l=>l.isNew).sort(bySize);
  const existing = lines.filter(l=>!l.isNew).sort(bySize);

  const newRowsHtml = newOnes.length
    ? `<table><thead><tr>${cols}</tr></thead><tbody>${newOnes.map(l=>row(l,`<span class="flag-hit">✓ ${flagLabel}</span>`)).join('')}</tbody></table>`
    : `<div class="no-lines" style="padding:0">No new placements yet this month.</div>`;

  let existingHtml = '';
  if(existing.length){
    const eid = 'exist'+(uid++);
    const rows = existing.map(l=>row(l, `<span class="flag-miss">${l.current?'Repeat Buyer':'Bought in Base Period'}</span>`)).join('');
    existingHtml = `<div class="targets-block">
      <div class="targets-toggle" data-target="${eid}"><span class="targets-chev">▶</span>${existing.length} Existing Account${existing.length===1?'':'s'}<span class="targets-hint">— bought in the base period, not eligible for new-placement credit</span></div>
      <div class="targets-table" id="${eid}"><table><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }
  return `<div class="rep-sub-inner" style="padding-left:2px">${newRowsHtml}${targetsHtml}${existingHtml}</div>`;
}

// Constellation's drill-down: one row per product, with that product's own
// share of the 30% goal alongside last fall's and this fall's placements.
function lineTableGoal(lines){
  if(!lines || lines.length===0) return '<div class="no-lines">No distribution recorded for this rep.</div>';
  const rows = lines.map(l=>{
    const cell = l.goal>0 ? (l.current>=l.goal ? '<span class="complete-tag">At Goal</span>' : fmtPts(l.pct)+'%') : '—';
    return `<tr class="${l.goal>0&&l.current<l.goal?'focus-row':''}"><td>${l.product}</td><td class="num">${l.base}</td><td class="num">${l.goal}</td><td class="num">${l.current}</td><td class="num">${cell}</td></tr>`;
  }).join('');
  return `<div class="rep-sub-inner" style="padding-left:2px"><table><thead><tr><th>Product</th><th class="num">Last Fall</th><th class="num">30% Goal</th><th class="num">This Fall</th><th class="num">% to Goal</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ====================================================================
   ONE NORMALIZED METRIC FEEDS BOTH VIEWS.
   --------------------------------------------------------------------
   Rep View's cards, Program View's rep rows, the summary counts and the
   sorting all read metricFor(). Each branch below is the same arithmetic
   the old renderRepView()/renderObjectiveView() used for that objective
   type -- same targets, same qualification test, same percentage -- said
   once instead of twice, which is what keeps the two views from drifting.
   No weight, target or classification changes.

   Off-prem carries more shapes than on-prem: a plain count (placements,
   photos, new_placements, new_accounts), a percentage of a rep's own
   account base (pct_of_base), a percentage of their own prior-year
   distro (pct_of_goal), the New Belgium goal join, and the two-brand
   dual objectives. They normalize to the same flat shape, so the UI
   never branches on type.
   ==================================================================== */

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
    // Every sub-target must be hit for the objective to count -- unchanged.
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

  if(o.type === 'pct_of_base'){
    const r = d.reps.find(x=>x.rep===rep);
    if(!r) return {notScored:true};
    const pen = penetration(r), goalPen = d.pct*100;
    const remaining = Math.max(r.target - r.qualifying, 0);
    return {
      value: r.qualifying, goal: r.target,
      pct: goalPen ? Math.min(pen/goalPen,1)*100 : 0,
      remaining,
      valueText: fmtPen(pen),
      goalText: fmtPen(goalPen)+' of my account base ('+r.target+' of '+r.base+')',
      remainText: remaining>0 ? unitFor(o, remaining) : '',
      status: r.qualifying>=r.target ? 'achieved' : (r.qualifying>0 ? 'inprogress' : 'notstarted'),
      hasActivity: r.qualifying>0
    };
  }

  if(o.type === 'pct_of_goal'){
    const r = d.reps.find(x=>x.rep===rep);
    if(!r) return {notScored:true};
    const goalPen = d.pct*100;
    const remaining = Math.max(r.target - r.placements, 0);
    return {
      value: r.placements, goal: r.target,
      pct: Math.min(r.pct, 100),
      remaining,
      valueText: fmtPen(r.share),
      goalText: fmtPen(goalPen)+' of last fall ('+r.target+' of '+r.baseline+')',
      remainText: remaining>0 ? unitFor(o, remaining) : '',
      status: r.hit ? 'achieved' : (r.placements>0 ? 'inprogress' : 'notstarted'),
      hasActivity: r.placements>0
    };
  }

  if(o.key === 'new_belgium'){
    const r = d.reps.find(x=>x.rep===rep);
    // A rep with no assigned distribution goal has nothing to achieve --
    // the builder's own hit90 guards on goal90>0 for the same reason.
    // No assigned goal: nothing to achieve, but the placements are real
    // and still worth showing rather than blanking to a dash.
    if(!r) return {notScored:true};
    if(!(r.goal90>0)) return {notScored:true, valueText: r.placements.toFixed(0)+' placements'};
    // The objective is 90% of the ASSIGNED goal, not 100% of it, so the
    // bar a rep must clear is 0.9 x goal90 and "at goal" is the builder's
    // hit90 -- the same test reps_hit90 and the company % already use.
    const bar = r.goal90 * 0.9;
    const remaining = Math.max(bar - r.placements, 0);
    return {
      value: r.placements, goal: r.goal90,
      pct: Math.min(r.pct, 100),
      remaining,
      valueText: r.placements.toFixed(0)+' / '+r.goal90.toFixed(0),
      goalText: '90% of '+r.goal90.toFixed(0)+' placements ('+Math.ceil(bar)+')',
      remainText: remaining>0 ? Math.ceil(remaining)+' placements' : '',
      status: r.hit90 ? 'achieved' : (r.placements>0 ? 'inprogress' : 'notstarted'),
      hasActivity: r.placements>0
    };
  }

  // Plain per-rep counts: placements, photos, new_placements, new_accounts.
  const target = d.target_per_rep;
  const r = d.reps.find(x=>x.rep===rep);
  const val = r ? (('qualifying' in r) ? r.qualifying : r.count) : 0;
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
  const none = '<div class="no-lines" style="padding-left:2px">No activity recorded this month.</div>';

  if(o.type === 'dual'){
    return d.subs.map(s=>{
      const r = s.reps.find(x=>x.rep===rep);
      const tgtHtml = targetsBlockHtml((s.targetsByRep||{})[rep], s.label);
      return `<div style="margin-bottom:18px">
        <div class="brand-group-head"><span class="brand-pill" style="font-size:13.5px">${s.label}</span></div>
        ${r ? lineTableNewAccounts(r.lines, s.flagLabel, tgtHtml) : none+tgtHtml}
      </div>`;
    }).join('');
  }

  const r = d.reps.find(x=>x.rep===rep);
  const tgt = ()=>targetsBlockHtml((d.targetsByRep||{})[rep], o.shortName||o.name);

  if(o.type === 'pct_of_base'){
    if(!r) return '';
    return lineTableLytt(r.lines, r.minSkus, o.brandLabel||o.shortName||o.name) + tgt();
  }
  if(o.type === 'pct_of_goal') return r ? lineTableGoal(r.lines) : none;
  if(o.key === 'new_belgium') return r ? nbLineTable(r.lines) : none;
  if(o.type === 'photos') return lineTablePhotos(r ? r.lines : [], o);
  if(o.type === 'new_placements') return lineTableNewPlacements(r ? r.lines : [], 'New Placement', tgt());
  if(o.type === 'new_accounts'){
    return r ? lineTableNewAccounts(r.lines, o.flagLabel, tgt()) : none + tgt();
  }
  return (r ? lineTablePlacements(r.lines) : none) + (d.targetsByRep ? tgt() : '');
}

function atGoalFor(o, DATA){
  if(!o.hasData || !DATA[o.key]) return null;
  const d = DATA[o.key];
  // New Belgium's builder counts reps at the 90% bar as reps_hit90 rather
  // than reps_at_goal -- same number the old header printed beside the
  // company distribution percentage.
  if(o.key==='new_belgium'){
    return {n: d.reps_hit90, total: d.reps_total,
            headline: d.company_pct.toFixed(1)+'%',
            cls: d.company_pct>=100 ? 'good' : '',
            sub: d.reps_hit90+' / '+d.reps_total+' reps at goal'};
  }
  return {n: d.reps_at_goal, total: d.reps_total};
}

global.OffPremMPO = {ROSTER, DM_GROUPS, MONTHS, loadMonthData, objPct, metricFor, detailFor, atGoalFor, unitFor};
})(window);
