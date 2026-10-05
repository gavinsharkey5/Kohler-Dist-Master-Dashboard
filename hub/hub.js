/* ====================================================================
   Incentives & MPO Hub -- one place for every incentive and MPO program.
   --------------------------------------------------------------------
   This file COMPUTES NOTHING NEW. Every number a rep sees here comes from
   the three trackers' own program libraries, loaded before this script:

     ../incentive-tracking/programs.js   summarize(), cardFor(), rankProgram(),
                                         PROGRAM_RULES, SUPPLIERS ... (+ the
                                         data blobs in data/program_data.js)
     ../MPOs/on-prem/programs.js         window.OnPremMPO
     ../MPOs/off-prem/programs.js        window.OffPremMPO

   The hub's job is to put those results into ONE shape (see makeProgram)
   and one design, then answer a rep's five questions in seconds: which
   programs apply to me, where do I stand, what do I still need, when does
   each one end, what can I earn.

   Status words are the hub's own four (Not Started / In Progress /
   Completed / Exceeded, plus Coming Soon for a program with no feed yet),
   mapped from each tracker's status without changing what "complete"
   means there: an incentive is Completed when the tracker says Earned, an
   MPO when the tracker says Goal Achieved. The tracker's finer ladder
   (Close / On Track / Needs Attention) survives as the bar colour and the
   "pace" note, so nothing a rep read on the original page is contradicted.
   ==================================================================== */
/* SALES SUPPORT ON THE HUB (2026-09-16, per Gavin). The hub's roster and DM
   groups come from incentive-tracking/programs.js. A sales-support person
   (Adam Badalamenti: no route, works the wines & spirits portfolio, scored on
   the on-prem Bardstown menu objective only) is NOT added there -- the
   incentive tracker has nothing for him -- but the hub shows him, under
   Ashley Furman under Paul Deady, exactly as MPOs/on-prem/programs.js
   defines him (SUPPORT_REPS + the DM_GROUPS entry with `under`). The two
   are joined here and passed in as the IIFE's ROSTER / DM_GROUPS. */
const HUB_SUPPORT = (window.OnPremMPO && window.OnPremMPO.SUPPORT_REPS) || {};
const HUB_ROSTER = ROSTER.concat(Object.keys(HUB_SUPPORT).filter(r=>!ROSTER.includes(r)));
const HUB_DM_GROUPS = DM_GROUPS.concat(((window.OnPremMPO && window.OnPremMPO.DM_GROUPS) || []).filter(g=>g.under && !DM_GROUPS.some(x=>x.dm===g.dm)));
// A DISTRICT MANAGER sees only their team (2026-09-29, per Gavin): the
// roster and the picker's groups are cut down before the page runs, so the
// picker, Program View and every deep link only know their reps. Anyone
// else who is a manager (a VP, Gavin) keeps everyone.
const HUB_TEAM = window.kdhTeam ? window.kdhTeam(HUB_DM_GROUPS) : null;
const HUB_ROSTER_SCOPED = HUB_TEAM ? HUB_ROSTER.filter(r=>HUB_TEAM.reps.includes(r)) : HUB_ROSTER;
const HUB_DM_GROUPS_SCOPED = HUB_TEAM ? HUB_DM_GROUPS.filter(g=>g.dm===HUB_TEAM.dm || g.under===HUB_TEAM.dm) : HUB_DM_GROUPS;
(function(ROSTER, DM_GROUPS){
'use strict';
// LIBRARY MODE (2026-09-30): the Accounts page loads this file for its
// adapters -- programs(), nextAccounts(), distFor(), progFacts() ... --
// with no #app on the page. Then nothing here renders, routes or covers
// the page; the API on window.KohlerHub is the whole contract.
const LIB = !document.getElementById('app');
// A support rep is in the hub for a named set of on-prem objectives only.
const isSupport = rep => Object.prototype.hasOwnProperty.call(HUB_SUPPORT, rep);
const supportAllows = (rep, p) => !isSupport(rep) || (p.type==='MPO' && p.source==='on' && HUB_SUPPORT[rep].objectives.includes(p.key));
// The on-premise team (Chris McCrohan's reps, plus anyone grouped under
// him) gets a link to the Tap Share dashboard on every rep screen.
const ON_PREM_DM = 'Chris McCrohan';
const TAP_SHARE_URL = '../isellbeer/tap-survey-tracking/';
const onPremTeam = rep => rep===ON_PREM_DM || HUB_DM_GROUPS.some(g=>(g.dm===ON_PREM_DM || g.under===ON_PREM_DM) && g.reps.includes(rep));
const tapShareLink = rep => onPremTeam(rep) ? `<a class="taplink" href="${TAP_SHARE_URL}" target="_blank" rel="noopener">🍺 Tap Share dashboard <span class="ar">↗</span></a>` : '';
const roleLine = rep => isSupport(rep) ? `<div class="rep-role">${E(HUB_SUPPORT[rep].label||'Sales Support')}${HUB_SUPPORT[rep].manager?` · reports to ${E(HUB_SUPPORT[rep].manager)}`:''} · no assigned route</div>` : '';

const $ = s => document.querySelector(s);
const E = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const ENDING_SOON_DAYS = 14;   // "Ending soon" flag + first sort group
const ALMOST_PCT = 75;         // "Almost there" flag -- the tracker's own "Close" bar
const LS_KEY = 'kohler-hub';
const INC_ASSETS = '../incentive-tracking/';
// Home offers two choices; the next screen splits each one. Incentives
// split by the tracker's own registry group (New / Ongoing / Retention --
// `group` on each PROGRAM_LIST entry in incentive-tracking/programs.js),
// MPOs by premise.
const MAINS = [
  {key:'inc', label:'Incentives', ic:'🏆', sub:'Supplier reward programs'},
  {key:'mpo', label:'MPOs',       ic:'🎯', sub:'Monthly performance objectives'},
];
// v12, 2026-09-11: MAINS are no longer a question on the home screen -- they
// are the two TABS at the top of a rep's results. Picking a name opens the
// dashboard directly. The tab a rep last used is remembered for the browser
// session only; a reload still starts over on the home screen.
// v13, 2026-09-11: the MPO tab splits in two, so a rep never sees the other
// premise's programs. Three tabs, and the tab key IS the category key.
const TABS = [
  // Non-breaking hyphens (U+2011): "On-Premise" must wrap as one word, or a
  // narrow phone breaks it into three lines.
  {key:'inc', label:'Incentives',        ic:'🏆'},
  {key:'on',  label:'On\u2011Premise MPOs',  ic:'🍺'},
  {key:'off', label:'Off\u2011Premise MPOs', ic:'🏪'},
];
const TAB_KEYS = TABS.map(t=>t.key);
// Which tab a category belongs to. Supplier keys and the old wide keys
// (inc / mpo / all) fold into one so a Manager Mode link still highlights.
function tabOf(cat){
  cat = String(cat||'');
  if(TAB_KEYS.includes(cat)) return cat;
  if(cat==='mpo' || cat==='all') return 'on';
  return 'inc';
}
const TAB_KEY = 'kohler-hub-tab';
function lastTab(){ try{ const v = sessionStorage.getItem(TAB_KEY); if(TAB_KEYS.includes(v)) return v; }catch(e){} return 'inc'; }
function rememberTab(cat){ const t = tabOf(cat); try{ sessionStorage.setItem(TAB_KEY, t); }catch(e){} }
// Incentives are split by SUPPLIER, exactly as the Incentive Tracker's own
// "choose a supplier" step does (SUPPLIERS / PROGRAM_SUPPLIER in
// incentive-tracking/programs.js); the category key is 'sup:<supplierKey>'.
const SUBS = {
  inc: Object.keys(SUPPLIERS).map(sk=>({key:'sup:'+sk, sk, label:SUPPLIERS[sk].name, ic:'', sub:''})),
  mpo:[{key:'on',  label:'On-Premise',  ic:'🍺', sub:'Bars & restaurants'},
       {key:'off', label:'Off-Premise', ic:'🏪', sub:'Liquor stores & retail'}],
};
// Every category key the rep page accepts (the sub-categories, plus the
// wider ones a Manager Mode link may still carry).
const CATEGORIES = [{key:'all', label:'All Programs'}, {key:'inc', label:'Incentives'}, {key:'mpo', label:'MPOs'}]
  .concat(SUBS.inc.map(x=>Object.assign({main:'inc'}, x, {label:x.label+' incentives'})),
          SUBS.mpo.map(x=>Object.assign({main:'mpo'}, x, {label:x.label+' MPOs'})));
const catMetaOf = cat => CATEGORIES.find(c=>c.key===cat) || CATEGORIES[0];
const mainOf = cat => catMetaOf(cat).main || (cat==='inc'||cat==='mpo' ? cat : null);
const UNAVAILABLE = 'Unavailable based on account base/territory';
const STATUS = {
  exceeded:   {label:'Exceeded',    ic:'★'},
  complete:   {label:'Completed',   ic:'✓'},
  progress:   {label:'In Progress', ic:'▲'},
  notstarted: {label:'Not Started', ic:'○'},
  soon:       {label:'Coming Soon', ic:'⋯'},
  unavailable:{label:UNAVAILABLE, ic:'⊘'},
};
const PACE = {earned:'Earned', close:'Almost there', ontrack:'On track', attention:'Needs attention', notstarted:'', soon:''};

/* ---------------- dates ---------------- */
const MONTH_IDX = {jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,
  aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11};
const monthEnd = (y,m)=>new Date(y, m+1, 0);
function parseISO(s){ const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; }
function parseUS(s){ const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[1]-1, +m[2]) : null; }
// "Aug–Sept", "Jul 20–Sep 30", "September", "Sept–Oct (retro Aug)" -> {start,end}
function parseTag(tag, year){
  const t = String(tag||'').replace(/\(.*?\)/g,'').trim();
  let m = t.match(/^([A-Za-z]+)\.?\s*(\d{1,2})?\s*[–—-]\s*([A-Za-z]+)\.?\s*(\d{1,2})?$/);
  if(m){
    const sm = MONTH_IDX[m[1].toLowerCase()], em = MONTH_IDX[m[3].toLowerCase()];
    if(sm==null || em==null) return null;
    const ey = em < sm ? year+1 : year;
    return {start:new Date(year, sm, m[2]?+m[2]:1), end: m[4] ? new Date(ey, em, +m[4]) : monthEnd(ey, em)};
  }
  m = t.match(/^([A-Za-z]+)$/);
  if(m && MONTH_IDX[m[1].toLowerCase()]!=null){ const mm=MONTH_IDX[m[1].toLowerCase()]; return {start:new Date(year,mm,1), end:monthEnd(year,mm)}; }
  return null;
}
const fmtDay = d => d ? d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
const fmtDayYear = d => d ? d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
const daysLeft = end => Math.round((end - TODAY)/86400000);
function periodLabel(p){
  if(!p.start||!p.end) return '';
  const sameYear = p.start.getFullYear()===p.end.getFullYear();
  return (sameYear ? fmtDay(p.start) : fmtDayYear(p.start)) + ' – ' + fmtDayYear(p.end);
}
function endsLabel(p){
  const n = daysLeft(p.end);
  if(n < 0) return 'Ended ' + fmtDay(p.end);
  if(n === 0) return 'Ends today';
  if(n === 1) return 'Ends tomorrow';
  return `Ends ${fmtDay(p.end)} · ${n} days left`;
}
function shortEnds(p){
  const n = daysLeft(p.end);
  if(n < 0) return 'Ended ' + fmtDay(p.end);
  if(n === 0) return 'Today';
  return `${fmtDay(p.end)} · ${n} day${n===1?'':'s'}`;
}
// Date AND time (2026-09-21, per Gavin): the boards refresh several times a
// day, so the stamp says which pull this is. Printed in the viewer's own
// zone from the ISO instant each generator writes.
function fmtSynced(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
    + ', ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
// The Incentive Tracker's stamp: the ISO instant when program_data.js
// carries one (2026-09-21 on), else the date string it always carried.
function incRefreshed(){
  return (typeof PROGRAM_DATA_REFRESHED_AT !== 'undefined' && fmtSynced(PROGRAM_DATA_REFRESHED_AT)) || PROGRAM_DATA_REFRESHED;
}
const fixAssets = html => String(html||'').replace(/src="assets\//g, 'src="'+INC_ASSETS+'assets/');
const assetPath = p => !p ? '' : (p.startsWith('assets/') ? INC_ASSETS+p : p);

/* ---------------- pace + status mapping ---------------- */
// The tracker's ladder, applied to a capped percentage: earned / close /
// on track / needs attention. Used only for the bar colour + pace note.
function paceFromPct(pct, done, started){
  if(done) return 'earned';
  if(!started) return 'notstarted';
  if(pct>=ALMOST_PCT) return 'close';
  if(pct>=40) return 'ontrack';
  return 'attention';
}

/* ====================================================================
   INCENTIVE PROGRAMS (incentive-tracking/programs.js + program_data.js)
   ==================================================================== */
// Channel per incentive, read off each program's deck rules. "both" is the
// default: most programs pay on packages and draft alike.
const INC_CHANNEL = {
  keystone_ice:'off', lytt:'off', tona:'off', sun_cruiser:'off', path_to_victory:'off', path_to_victory_sd:'off', mollys:'off',
  display_auction:'off', mabi_retention:'off', mabi_retention_fall:'off',
  sam_adams_conversion:'on', printed_menu:'on', new_belgium:'on',
  mabi_single_serve:'off', four_loko:'off', sam_adams_cold_snap:'on',
};
const CHANNEL_LABEL = {on:'On-Premise', off:'Off-Premise', both:'On & Off-Premise'};

function incBlob(key){ return (typeof PROGRAM_DATA_2026_10!=='undefined' && PROGRAM_DATA_2026_10[key]) || PROGRAM_DATA_2026_09[key] || PROGRAM_DATA[key] || {}; }
function incPeriod(entry, month){
  const P = incBlob(entry.dataKey||entry.key);
  const year = +month.key.slice(0,4);
  // a registry entry may carry its own window (2026-09-30: the October tab
  // extends Touchdowns & Tea and Lytt past the window their data was built for)
  let start = entry.period ? parseISO(entry.period.start) : parseISO(P.periodStart), end = entry.period ? parseISO(entry.period.end) : parseISO(P.periodEnd);
  if(!start && P.meta && P.meta.startDate) start = parseUS(P.meta.startDate);
  if(!end && P.meta && P.meta.endDate) end = parseUS(P.meta.endDate);
  if(!start || !end){
    const t = parseTag(entry.tag, year);
    if(t){ start = start || t.start; end = end || t.end; }
  }
  if(!start || !end){ const mm = +month.key.slice(5,7)-1; start = start || new Date(year,mm,1); end = end || monthEnd(year,mm); }
  return {start, end, label: periodLabel({start,end}), tag: entry.tag};
}
function withIncMonth(month, fn){
  const pm = PROGRAM_LIST, am = activeMonth;
  PROGRAM_LIST = month.programs; activeMonth = month;
  try { return fn(); } finally { PROGRAM_LIST = pm; activeMonth = am; }
}
// A rep's browser gets a per-rep copy of the program data (tools/rep_slices.py,
// 2026-10-01): other reps' rows are gone, so "anyone has data" is carried by
// the copy's __anyData mark on each program instead of a roster scan.
function incHasAnyData(entry, month){
  if(ROSTER.some(r=>!!entry.getRep(r))) return true;
  const k = entry.dataKey||entry.key;
  const B = month && month.key==='2026-10' && typeof PROGRAM_DATA_2026_10!=='undefined' ? PROGRAM_DATA_2026_10 : month && month.key==='2026-09' ? PROGRAM_DATA_2026_09 : PROGRAM_DATA;
  return !!((B && B[k] && B[k].__anyData) || incBlob(k).__anyData);
}

function makeIncentive(entry, month){
  const sup = supplierOf(entry.key);
  const anyData = incHasAnyData(entry, month);
  const period = incPeriod(entry, month);
  const chan = INC_CHANNEL[entry.key] || 'both';
  const P = incBlob(entry.dataKey||entry.key);
  const rules = PROGRAM_RULES[entry.key] || [];
  const p = {
    id: 'inc:'+entry.key, source:'inc', key: entry.key, monthKey: month.key, monthLabel: month.label,
    name: entry.title, shortName: (window.kdhTitle ? window.kdhTitle('inc:'+entry.key, entry.shortTitle || entry.title) : (entry.shortTitle || entry.title)), pitch: entry.pitch || '',
    type: 'Incentive', group: entry.group || 'new', supKey: PROGRAM_SUPPLIER[entry.key] || 'house', channel: chan, channelLabel: CHANNEL_LABEL[chan],
    supplier: sup.name, supplierLogo: assetPath(sup.logo), brandLogos: progLogos(entry.key).map(assetPath),
    period, refreshed: incRefreshed(), manual: !!entry.manual, awaitingNote: entry.awaitingNote || '',
    rules, reward: rules.find(r=>/\$|win|trip|ticket|bonus|commission/i.test(r)) || '',
    territory: CORE_MARKET_PROGRAM_KEYS.has(entry.key) ? 'Core Market counties' : 'All counties',
    entry, month,
  };
  p.forRep = function(rep){
    // A program with no data at all and no manual feed is a shape waiting on
    // its first export -- it stays off every rep's list until then (Gavin,
    // 2026-09-30: the awaiting rows were redundant). The tracker still shows it.
    if(!anyData && !entry.manual) return null;
    const d = entry.getRep(rep);
    if(!d && anyData) return null;                       // program has data, none for this rep: not in it
    if(d && d.programEligible===false) return null;
    if(d && d.territoryEligible===false) return {status:'unavailable', pace:'notstarted', pct:null, openEnded:false, now:'', goal:'', remain:null, next:'', unavailable:true,
      why:UNAVAILABLE, sub:'This program runs in the Core Market counties only.'};
    const s = summarize(entry, rep);
    if(s.soon) return {status:'soon', pace:'soon', pct:null, openEnded:false, now:'', goal:'', remain:null,
                       next: s.next, soon:true};
    const openEnded = !s.goal;
    const done = s.status==='earned';
    const started = s.now>0;
    let status;
    if(openEnded)      status = started ? 'progress' : 'notstarted';
    else if(done)      status = (s.target && s.now > s.target) ? 'exceeded' : 'complete';
    else if(!started)  status = 'notstarted';
    else               status = 'progress';
    const pct = openEnded ? null : Math.max(0, Math.min(100, s.pct||0));
    const goalText = openEnded ? 'Open-ended — every one pays'
      : (s.house ? s.label.replace(/^House /,'House goal: ') : (s.target!=null ? (s.unit==='%' ? fmtNum(s.target)+'% of your accounts' : fmtNum(s.target)+(s.unit?' '+s.unit:'')) : ''));
    return {
      status, pace: openEnded ? (started?'earned':'notstarted') : s.status, pct, openEnded,
      now: s.label || '', sub: s.sub || '', goal: goalText, remain: s.remain || null, next: s.next || '',
      segments: s.segments || null, house: !!s.house, valueNum: s.now, goalNum: s.target,
      legs: (s.legs && s.legs.length) ? s.legs : null,     // one card, two programs inside (Touchdowns & Tea)
    };
  };
  p.detailHtml = rep => withIncMonth(month, ()=>fixAssets(cardFor(entry.key, rep)));
  p.ranking = function(){
    return withIncMonth(month, ()=>rankProgram(entry)).map(r=>{
      const d = entry.getRep(r.rep);
      const board = (PROGRAM_BOARD[entry.key] && d) ? PROGRAM_BOARD[entry.key](d) : null;
      const rr = p.forRep(r.rep) || {};
      return {rep:r.rep, rank:r.rank, valueText: entry.fmt ? entry.fmt(r.val) : String(r.val), metricLabel: entry.metricLabel,
              pct: rr.pct, status: rr.status, pace: rr.pace, board};
    });
  };
  p.exposure = function(){
    let total = 0, any = false;
    ROSTER.forEach(rep=>{ const d = entry.getRep(rep); if(d && typeof d.payout==='number'){ any = true; total += d.payout; } });
    return any ? total : null;
  };
  p.timeline = rep => incTimeline(entry.getRep(rep), period);
  return p;
}
// Dated qualifying items a card already lists (offPremNew, draftNew, new24ozNew,
// packageNew, featuredNew, newPod, accountList ...) -> cumulative count by day.
function incTimeline(d, period){
  if(!d || typeof d!=='object') return null;
  const dates = [];
  const take = (arr)=>arr.forEach(it=>{
    if(!it || typeof it!=='object') return;
    const raw = it.date || it.firstDate || it.lastDate;
    const dt = raw ? (parseUS(raw) || parseISO(raw)) : null;
    if(dt) dates.push(dt);
    else if(Array.isArray(it.products)) it.products.forEach(pr=>{ const x = pr && (parseUS(pr.date)||parseISO(pr.date)); if(x) dates.push(x); });
  });
  Object.keys(d).forEach(k=>{
    if(!Array.isArray(d[k])) return;
    if(/New$|^accountList$|^newPod$|^rebuy$|^featuredRebuy$|^draftRebuy$/.test(k)) take(d[k]);
  });
  return buildTimeline(dates, period);
}
function buildTimeline(dates, period){
  const inWin = dates.filter(x=>x>=period.start && x<=period.end).sort((a,b)=>a-b);
  if(!inWin.length) return null;
  const pts = []; let n = 0;
  inWin.forEach(x=>{ n++; const last = pts[pts.length-1]; if(last && last.date.getTime()===x.getTime()) last.n = n; else pts.push({date:x, n}); });
  return pts;
}
const fmtNum = v => (typeof v==='number' ? (Math.round(v)===v ? v.toLocaleString('en-US') : v.toFixed(1)) : String(v==null?'':v));

/* ====================================================================
   MPO OBJECTIVES (MPOs/on-prem + off-prem programs.js)
   ==================================================================== */
const MPO_SCOPES = {
  on:  {mod: window.OnPremMPO,  dir:'../MPOs/on-prem/',  channel:'on',  label:'On-Premise',  page:'../MPOs/on-prem/index.html'},
  off: {mod: window.OffPremMPO, dir:'../MPOs/off-prem/', channel:'off', label:'Off-Premise', page:'../MPOs/off-prem/index.html'},
};
const SUPPLIER_ALIAS = {'BBC':'Boston Beer', 'HUSA':'Heineken USA', 'Spirits':'Carbliss', 'Lofted Spirits':'Bardstown Bourbon',
  'Sapporo Light':'Sapporo', 'Famosa 7oz':'Famosa', 'POS':'Kohler House Programs', 'Disruptors':'Kohler House Programs',
  'iSellBeer Execution':'Kohler House Programs', 'Wine':'Wine & Spirits'};
const SUPPLIER_LOGO_KEY = {'Molson Coors':'molson_coors','Boston Beer':'boston_beer','Constellation':'constellation',
  'New Belgium':'new_belgium','Bardstown Bourbon':'bardstown','Kohler House Programs':'house'};
const MPO_BRAND_LOGO = {sam_adams_conversion:'boston_beer.png', constellation_innovation:'constellation.png', keystone_ice:'keystone_ice.png', bbc_lytt:'lytt.png', disruptors:'lytt.png', constellation_gaintain:'constellation.png',
  corona_premier:'constellation.png', new_belgium:'new_belgium.png', bardstown_menu:'bardstown.png', molson_coors:'molson_coors.png',
  fever_tree:'molson_coors.png', angry_orchard:'boston_beer.png', ws_2xo:'two_xo.png', mollys:'mollys.png', yave:'yave.png', green_river:'bardstown.png', famosa:'famosa.png', carbliss:null};
const sam_adams_conversion_extra = k => k==='sam_adams_conversion' ? 'sam_adams.png' : '';
const TYPE_NOTE = {
  dual: 'Every brand target must be hit for the objective to count — it is not a combined pool.',
  pct_of_base: 'Your target is a share of your OWN account base, so every rep has a different number.',
  pct_of_goal: 'Your target is a share of your OWN placements from the same period last year.',
  new_belgium: 'Scored against your assigned distribution goal — 90% of it counts as achieved.',
  photos: 'Counted in distinct photos submitted in iSellBeer, not rows.',
  new_placements: '90-day non-buy: an account counts only if it did not buy the brand in the prior window.',
  new_accounts: 'New buyers only — an account that already carried the brand does not count.',
  placements: 'Counted in placements from the RDE export for the month.',
};

const mpoState = {}; // scope -> monthKey -> {DATA, syncedAt, missing, promise}
function mpoMonthActive(scope, month){
  const year = +month.key.slice(0,4), mm = +month.key.slice(5,7)-1;
  const ends = month.objectives.map(o=>o.periodEnd ? parseISO(o.periodEnd) : monthEnd(year,mm));
  return ends.some(e=>e>=TODAY);
}
function mpoMonthLoaded(scope, mk){ const s = mpoState[scope]||{}; return !!(s[mk] && s[mk].DATA); }
function ensureMpoMonth(scope, mk){
  mpoState[scope] = mpoState[scope] || {};
  const slot = mpoState[scope][mk] = mpoState[scope][mk] || {};
  if(slot.promise) return slot.promise;
  slot.promise = MPO_SCOPES[scope].mod.loadMonthData(mk, MPO_SCOPES[scope].dir).then(r=>{
    Object.assign(slot, r || {DATA:{}, missing:[], syncedAt:null});
    slot.DATA = slot.DATA || {};
    return slot;
  }).catch(e=>{ slot.DATA = {}; slot.missing = ['*']; slot.error = e; return slot; });
  return slot.promise;
}

function makeMpo(scope, month, o){
  const S = MPO_SCOPES[scope], M = S.mod;
  const year = +month.key.slice(0,4), mm = +month.key.slice(5,7)-1;
  const start = o.periodStart ? parseISO(o.periodStart) : new Date(year, mm, 1);
  const end = o.periodEnd ? parseISO(o.periodEnd) : monthEnd(year, mm);
  const period = {start, end, label: periodLabel({start,end}), tag: month.label};
  const rawSup = String(o.name).split(/\s+[–—-]\s+/)[0].trim();
  const supplier = SUPPLIER_ALIAS[rawSup] || rawSup;
  const supLogoKey = SUPPLIER_LOGO_KEY[supplier];
  const supLogo = supLogoKey && SUPPLIERS[supLogoKey] ? assetPath(SUPPLIERS[supLogoKey].logo) : '';
  const brand = MPO_BRAND_LOGO[o.key] ? INC_ASSETS+'assets/logos/'+MPO_BRAND_LOGO[o.key] : '';
  const weightPct = Math.round((o.weight||0)*100);
  const rules = [];
  if(o.goalLabel) rules.push(`Goal: ${o.goalLabel}`);
  rules.push(`Worth ${weightPct}% of the ${month.label} ${S.label} MPO — the MPO is 20% of total commission eligibility, weighted across the month's objectives`);
  if(o.typeNote || TYPE_NOTE[o.type]) rules.push(o.typeNote || TYPE_NOTE[o.type]);
  if(o.key==='new_belgium' && TYPE_NOTE.new_belgium && o.type!=='new_belgium') rules.push(TYPE_NOTE.new_belgium);
  if(!o.hasData) rules.push('Verified from iSellBeer photos — there is no data feed behind this objective, so no numbers show here.');
  if(o.periodEnd) rules.push(`Runs through ${fmtDayYear(end)}, so it keeps accruing after the rest of the month's objectives close.`);
  const data = () => (mpoState[scope] && mpoState[scope][month.key]) || {};
  const p = {
    id: `${scope}:${month.key}:${o.key}`, source: scope, key: o.key, monthKey: month.key, monthLabel: month.label,
    name: o.name, shortName: (window.kdhTitle ? window.kdhTitle(`${scope}:${month.key}:${o.key}`, o.shortName || o.name) : (o.shortName || o.name)), pitch: o.goalLabel ? `${o.goalLabel} — ${weightPct}% of the ${S.label} MPO.` : '',
    type:'MPO', channel: S.channel, channelLabel: CHANNEL_LABEL[S.channel],
    supplier, supplierLogo: supLogo, brandLogos: brand ? [brand] : [],
    period, refreshed: '', manual: !o.hasData && !o.awaiting, awaitingNote: o.awaitingNote || '',
    rules, reward: `${weightPct}% of the ${S.label} MPO (20% of commission eligibility)`,
    territory: '', objective: o, month, scope,
    get loaded(){ return !!data().DATA; },
  };
  Object.defineProperty(p, 'refreshed', {get(){ return fmtSynced(data().syncedAt); }});
  p.forRep = function(rep){
    if(!o.hasData) return {status:'soon', pace:'soon', pct:null, openEnded:false, now:'', goal: o.goalLabel||'', remain:null, soon:true,
      next:'This objective is verified from iSellBeer photos by hand, so there are no numbers to track here.'};
    const D = data().DATA; if(!D) return {status:'soon', pace:'soon', pct:null, loading:true, now:'', goal:'', remain:null, next:'Loading…', soon:true};
    const m = M.metricFor(o, rep, D);
    if(!m || m.notScored) return null;
    const done = m.status==='achieved', started = m.status!=='notstarted';
    const pct = Math.max(0, Math.min(100, m.pct||0));
    const status = done ? (m.value > m.goal ? 'exceeded' : 'complete') : (started ? 'progress' : 'notstarted');
    const endTxt = fmtDay(end);
    const next = done
      ? `You hit this objective — keep it there through <strong>${E(endTxt)}</strong>.`
      : started
        ? `You need <strong>${E(m.remainText||'')}</strong> more by ${E(endTxt)}.`
        : `Nothing counted yet — you need <strong>${E(m.needText||m.goalText||'')}</strong> by ${E(endTxt)}.`;
    return {
      status, pace: paceFromPct(pct, done, started), pct, openEnded:false,
      now: m.valueText, sub: '', goal: m.goalText, remain: m.remainText || null, next,
      // valueText/status ride along so an MPO card can draw the dashboards'
      // per-sub bars on a dual objective (August's Molson Coors and Wine &
      // Spirits); `line` stays for the detail screen's existing renderer.
      segments: m.subs ? m.subs.map(s=>({label:s.label, pct:s.pct, line:`${s.value} of ${s.goal}`,
                                         valueText:s.valueText || `${s.value} / ${s.goal}`, status:s.status})) : null,
      valueNum: m.value, goalNum: m.goal, needNum: m.needText ? m.remaining : undefined, weight: weightPct,
      explain: m.explain || null, underlying: m.underlying,
    };
  };
  p.detailHtml = function(rep){
    const D = data().DATA; if(!D || !o.hasData) return '';
    return `<div class="mpo-detail">${M.detailFor(o, rep, D, month.key)}</div>`;
  };
  p.ranking = function(){
    const D = data().DATA; if(!D || !o.hasData) return [];
    const rows = ROSTER.map(rep=>{ if(!supportAllows(rep, p)) return null; const r = p.forRep(rep); return (r && r.status!=='unavailable' && availability(p, rep).ok) ? {rep, r} : null; }).filter(Boolean);
    rows.sort((a,b)=> (b.r.pct-a.r.pct) || (b.r.valueNum-a.r.valueNum) || a.rep.localeCompare(b.rep));
    return rows.map((x,i)=>({rep:x.rep, rank:i+1, valueText:x.r.now, metricLabel:o.unit ? o.unit+'s' : 'progress',
                             pct:x.r.pct, status:x.r.status, pace:x.r.pace, board:null}));
  };
  p.exposure = () => null;
  p.atGoal = function(){ const D = data().DATA; return (D && o.hasData) ? M.atGoalFor(o, D) : null; };
  // Company-level % for the objective -- reps at goal over reps scored. The
  // MPO dashboards' own bar reads this, so Program View reads it too rather
  // than deriving a second number that could disagree with the board.
  p.objPct = function(){ const D = data().DATA; return (D && o.hasData) ? M.objPct(o, D) : 0; };
  p.timeline = function(rep){
    const D = data().DATA; if(!D || !o.hasData) return null;
    const d = D[o.key]; if(!d) return null;
    const lines = [];
    const grab = ds=>{ const r = ds && ds.reps && ds.reps.find(x=>x.rep===rep); if(r && Array.isArray(r.lines)) lines.push(...r.lines); };
    if(d.subs) d.subs.forEach(grab); else grab(d);
    const dates = [];
    lines.forEach(l=>{
      if(!l || !l.date) return;
      if('new_buyer' in l && l.new_buyer!=='1') return;
      if(l.period && l.period!=='current') return;
      const x = parseISO(l.date) || parseUS(l.date); if(x) dates.push(x);
    });
    if(o.type==='photos'){ const seen = new Set(); const uniq=[]; lines.forEach(l=>{ if(l.photo && !seen.has(l.photo)){ seen.add(l.photo); const x=parseUS(l.date)||parseISO(l.date); if(x) uniq.push(x);} }); return buildTimeline(uniq, period); }
    return buildTimeline(dates, period);
  };
  return p;
}

/* ====================================================================
   THE UNIFIED LIST
   ==================================================================== */
let PROGRAMS = [];
function buildPrograms(){
  const out = [];
  // Incentives: one entry per program key, the newest month's registry wins
  // (the six "ongoing" programs appear on both tabs pointing at one dataset).
  const seen = new Map();
  MONTHS.slice().reverse().forEach(month=>{
    month.programs.forEach(entry=>{ if(entry.hub===false) return; if(!seen.has(entry.key)) seen.set(entry.key, makeIncentive(entry, month)); });
  });
  out.push(...seen.values());
  Object.keys(MPO_SCOPES).forEach(scope=>{
    MPO_SCOPES[scope].mod.MONTHS.forEach(month=>{ month.objectives.forEach(o=>out.push(makeMpo(scope, month, o))); });
  });
  PROGRAMS = out;
}
const isActive = p => p.period.end >= TODAY;
function inCategory(p, cat){
  if(cat==='inc') return p.type==='Incentive';
  if(cat==='mpo') return p.type==='MPO';
  if(cat==='on')  return p.type==='MPO' && p.channel==='on';
  if(cat==='off') return p.type==='MPO' && p.channel==='off';
  if(cat==='new' || cat==='ongoing' || cat==='retention') return p.type==='Incentive' && p.group===cat;
  if(cat.startsWith('sup:')) return p.type==='Incentive' && p.supKey===cat.slice(4);
  return true;
}
// Programs whose data must be in memory for a given selection.
function neededMonths(programs){
  const need = [];
  programs.forEach(p=>{ if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) need.push([p.source, p.monthKey]); });
  return [...new Set(need.map(x=>x.join('|')))].map(s=>s.split('|'));
}
async function loadFor(programs){
  const need = neededMonths(programs);
  if(!need.length) return false;
  await Promise.all(need.map(([s,mk])=>ensureMpoMonth(s, mk)));
  return true;
}

// Sort per the brief: closest to ending, closest to completion, the rest,
// completed. Then anything with no feed yet, then programs already over.
// MPOs on the rep page are THIS MONTH's only (the calendar month of the
// viewing date); if the month's data has not been published yet, the newest
// month stands in so the page is never empty on the 1st.
function mpoRepMonth(scope){
  const months = MPO_SCOPES[scope].mod.MONTHS;
  const cur = TODAY.getFullYear()+'-'+String(TODAY.getMonth()+1).padStart(2,'0');
  const hit = months.find(m=>m.key===cur);
  return hit ? hit.key : months[months.length-1].key;
}
// The month a scope's tab is SHOWING. Reps can step back through published
// months (v13, 2026-09-11); state.month is the pick and falls back to this
// month whenever the scope has no such month.
function mpoViewMonth(scope){
  const months = MPO_SCOPES[scope].mod.MONTHS;
  if(state.month && months.some(m=>m.key===state.month)) return state.month;
  return mpoRepMonth(scope);
}
// A month the rep stepped BACK to: every program in it has closed, so the
// live groups ("Ending soon", "Ended") would misread it.
const viewingPast = scope => mpoViewMonth(scope) !== mpoRepMonth(scope);
// Can this rep sell this program anywhere on their route? Uses the customer
// base + brand territory (accounts.js): unavailable when every account in the
// rep's book is NOT IN TERRITORY / BLOCKED for the brand, or the book has no
// account of the program's premise at all. Provisional "yes" while an MPO
// month is still loading.
function availability(p, rep){
  if(isSupport(rep)) return {ok:true};          // no route: any account counts
  if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) return {ok:true};
  const A = accountsFor(p, rep);
  if(A.any) return {ok:true};
  const reach = A.eligible.length + A.buying.length;
  if(reach===0){
    const brands = A.families.length>2 ? `${A.families[0]} and ${A.families.length-1} more brands` : A.families.join(' and ');
    if(A.excluded.length + A.unknown.length > 0) return {ok:false, why:UNAVAILABLE, sub:`${brands} can’t be sold at any account on your route.`};
    if(A.universe===0) return {ok:false, why:UNAVAILABLE, sub:`No ${p.channel==='on'?'on-premise':p.channel==='off'?'off-premise':''} accounts on your route.`};
  }
  // BOOK TOO SMALL (2026-09-22, per Gavin -- Dave Ehlers' on-prem MPOs): an
  // objective that counts ACCOUNTS is out of reach when the accounts that
  // could ever count (sellable + already on the brand) add up to fewer than
  // the goal. Dave has one on-premise account and a 10-new-accounts goal.
  // Account-count objectives only -- a placements objective can credit
  // several products per account, so a small book does not cap it.
  if(p.type==='MPO' && p.objective && p.objective.type==='new_accounts'){
    const r = p.forRep(rep);
    if(r && !r.soon && r.status!=='complete' && r.status!=='exceeded' && isFinite(r.goalNum) && r.goalNum>0){
      const cap = A.eligible.length + Math.max(A.buying.length, Number(r.valueNum)||0);
      if(cap < r.goalNum){
        const chan = p.channel==='on' ? 'on-premise ' : p.channel==='off' ? 'off-premise ' : '';
        return {ok:false, why:UNAVAILABLE, tooSmall:true,
          sub:`Only ${cap} ${chan}account${cap===1?'' : 's'} on your route can count toward this — the goal is ${r.goalNum}.`};
      }
    }
  }
  return {ok:true};
}
function sortGroup(p, r, past){
  // A month the rep deliberately stepped back into is history, not a pile of
  // "Ended" -- group it by how it finished so the page is not empty.
  if(past){
    if(r && r.status==='unavailable') return 7;
    if(!r || r.status==='soon') return 6;
    if(r.status==='complete' || r.status==='exceeded') return 5;
    return r.status==='progress' ? 3 : 4;
  }
  if(!isActive(p)) return 8;
  if(r && r.status==='unavailable') return 7;
  if(!r || r.status==='soon') return 6;
  if(r.status==='complete' || r.status==='exceeded') return 5;
  if(daysLeft(p.period.end) <= ENDING_SOON_DAYS) return 1;
  if(r.pct!=null && r.pct >= ALMOST_PCT) return 2;
  if(r.status==='progress') return 3;
  return 4;
}
const GROUP_META = {
  1:{title:'Ending soon', sub:`Closes within ${ENDING_SOON_DAYS} days — do these first`, cls:'g-end', ic:'⏰'},
  2:{title:'Almost there', sub:`${ALMOST_PCT}%+ done — one push finishes these`, cls:'g-close', ic:'🔥'},
  3:{title:'In progress', sub:'Soonest to end first', cls:'', ic:'▲'},
  4:{title:'Not started', sub:'Nothing counted yet', cls:'', ic:'○'},
  5:{title:'Completed', sub:'Goal hit — keep it there', cls:'g-done', ic:'✓'},
  6:{title:'Coming soon', sub:'No data feed yet', cls:'g-soon', ic:'⋯'},
  7:{title:UNAVAILABLE, sub:'Shown for awareness — not counted in your goals', cls:'g-over', ic:'⊘'},
  8:{title:'Ended', sub:'Past programs', cls:'g-over', ic:'—'},
};
function sortedForRep(rep, cat){
  const rows = [];
  PROGRAMS.forEach(p=>{
    if(!inCategory(p, cat)) return;
    if(!supportAllows(rep, p)) return;            // support: named objectives only
    if(p.type==='MPO' && p.monthKey!==mpoViewMonth(p.source)) return;  // one month at a time
    let r = p.forRep(rep);
    if(!r) return;
    if(r.status!=='unavailable' && r.status!=='soon'){
      const av = availability(p, rep);
      if(!av.ok) r = Object.assign({}, r, {status:'unavailable', pace:'notstarted', pct:null, unavailable:true, why:av.why, sub:av.sub, next:'', remain:null});
    }
    const past = p.type==='MPO' && viewingPast(p.source);
    rows.push({p, r, g: sortGroup(p, r, past), days: daysLeft(p.period.end)});
  });
  rows.sort((a,b)=>{
    if(a.g!==b.g) return a.g-b.g;
    if(a.g===2) return (b.r.pct-a.r.pct) || (a.days-b.days);
    if(a.g===5 || a.g===8) return (b.p.period.end-a.p.period.end) || a.p.name.localeCompare(b.p.name);
    if(a.g===7) return a.p.name.localeCompare(b.p.name);
    return (a.days-b.days) || ((b.r.pct||0)-(a.r.pct||0)) || a.p.name.localeCompare(b.p.name);
  });
  return rows;
}

/* ====================================================================
   STATE + ROUTING
   ==================================================================== */
const openCards = new Set();   // program ids expanded in place on the rep page
const acctTabs = {};           // program id -> active account tab
const acctMore = {};           // program id|tab -> show every row
const state = {mode:'rep', view:'home', rep:null, main:null, cat:null, month:null, prog:null, from:null, peek:null, filters:{type:'all', chan:'all', sup:'all', month:'active'}, showEnded:false, only:null, sup:null, list:null, n:null, im:'2026-09'};
// PREVIOUS MONTHS on the Incentives screen (Gavin, 2026-09-30): a simple
// August / September toggle under the live list so reps can review an
// earlier month's incentives. Each month lists the programs that ENDED in it
// (endedIn); a program still running into the next month stays in the live
// list above. September went live 2026-10-05 (the `note` placeholder is gone).
// Adding October later = one more entry here once its programs have ended.
const INC_MONTHS = [
  {key:'2026-08', label:'August 2026'},
  {key:'2026-09', label:'September 2026'},
];
// REP-MODE FLOW (2026-09-30, Gavin's Encompass brief): Incentives (one row
// per supplier) -> a supplier's programs -> ONE program's summary -> an
// account list (potential / credited / follow-ups, searchable) -> one
// account (details, credited lines, the rep's own marks). Views: rep, sup,
// detail, accts, acct. Manager Mode (desktop) keeps its own screens.
const LISTS = {targets:'Potential Accounts', dist:'Credited Accounts', follow:'Follow-ups', done:'Done', skip:'Not Now', hold:'Accounts to Hold'};
const scrollMem = {};          // hash -> scrollY, so Back lands where the list was
const acctQ = {};              // account-list search text, per program|list
// only:'inc' (from the rep workspace's Incentive Hub tile, `only=inc` in the
// hash) shows the Incentives tab alone -- the MPO tabs are their own tiles.
// Signed-in identity (the `kdh_user` cookie /login/ sets on kohlerdisthub.com).
// A rep is LOCKED to their own name: no name picker, no peeking at another
// rep, no Manager Mode. Managers, and anyone whose name is not on the
// roster, get the hub exactly as before. Access itself is enforced by the
// Vercel middleware, not here -- this is only what the page shows.
const KDH_USER = (()=>{ try{ if(window.kdhUser) return window.kdhUser(); const m = document.cookie.match(/(?:^|;\s*)kdh_user=([^;]*)/); return m ? JSON.parse(decodeURIComponent(m[1])) : null; }catch(e){ return null; } })();
// A signed-in rep is locked to THEIR roster entry -- matched forgivingly
// on first name + surname (kdhMatchName), so "Michael Ast" on the allow
// list still lands on "Mike Ast" here. No match at all = fail closed: the
// page is covered with a notice instead of showing everyone (2026-09-28).
const LOCKED_REP = (()=>{
  if(!(KDH_USER && KDH_USER.role !== 'manager' && KDH_USER.name)) return null;
  const m = window.kdhMatchName ? window.kdhMatchName(KDH_USER.name, HUB_ROSTER) : (HUB_ROSTER.includes(KDH_USER.name) ? KDH_USER.name : null);
  if(!m && window.kdhNoRoster && !LIB){ document.addEventListener('DOMContentLoaded', ()=>window.kdhNoRoster('Incentive Hub')); if(document.readyState!=='loading') window.kdhNoRoster('Incentive Hub'); }
  return m;
})();

/* ---- Write-back: Done / Follow up / Not now on the visit list (2026-09-25)
   The first thing a rep TELLS the hub instead of only reading it. Each
   target row on a Rep Mode visit list carries three buttons plus a note;
   a press writes one row to Supabase's rep_actions table (PostgREST,
   straight from the browser with the rep's own token -- the `kdh_at`
   cookie /login/ sets -- and the publishable key the middleware serves as
   /shared/auth-config.js). Row-level security scopes it: a rep touches
   only their own rows, a manager reads everyone's, so a DM opening a rep's
   programs (or previewing as them) sees the same marks, read-only.
   Follow-ups float to the top of the list, Done and Not now fold away at
   the bottom and stop counting as "to visit". Off kohlerdisthub.com
   (github.io has no auth-config.js, no cookie) none of this renders. */
const RA = (()=>{
  const cfg = window.KDH_AUTH || null;
  // read at each request: the keep-alive (shared/kdh-user.js) renews the cookie while the page is open
  const tok = ()=>{ try{ const m = document.cookie.match(/(?:^|;\s*)kdh_at=([^;]*)/); return m ? decodeURIComponent(m[1]) : ''; }catch(e){ return ''; } };
  const on = !!(cfg && cfg.url && cfg.key && tok());
  const map = new Map();      // program_id|account_num -> {status, note, updated_at}
  let loadedFor = null, loading = false, err = '';
  const num = a => a && a.n!=null ? String(a.n) : 'name:'+HubAccounts.norm(a ? a.name : '');
  const key = (pid, a) => pid+'|'+num(a);
  const base = () => cfg.url.replace(/\/$/,'')+'/rest/v1/rep_actions';
  const hdr = extra => Object.assign({apikey:cfg.key, authorization:'Bearer '+tok(), accept:'application/json'}, extra||{});
  // Only the signed-in person edits their own list. A manager previewing
  // or viewing a rep sees the marks but cannot press (their token would
  // stamp the rows with the manager's own name).
  const canEdit = rep => on && KDH_USER && !KDH_USER.preview && !!rep && KDH_USER.name === rep;
  const canShow = rep => on && !!rep;
  // A manager previewing a rep sees the rep's own controls, disabled, with a
  // note -- never a live button that would stamp the manager's name (2026-09-30).
  const previewOf = rep => on && !!(KDH_USER && KDH_USER.preview && KDH_USER.role !== 'manager' && !!rep && KDH_USER.name === rep);
  async function load(rep){
    if(!on || !rep || loading || loadedFor===rep) return;
    loading = true; err = '';
    try{
      const q = base()+'?select=program_id,account_num,status,note,updated_at&rep_name=eq.'+encodeURIComponent(rep)+'&order=updated_at.desc&limit=2000';
      const res = await fetch(q, {headers: hdr()});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const rows = await res.json();
      map.clear();
      rows.forEach(r=>map.set(r.program_id+'|'+r.account_num, {status:r.status, note:r.note||'', updated_at:r.updated_at}));
      loadedFor = rep;
    }catch(e){ err = 'Couldn’t load your marks ('+(e.message||e)+').'; loadedFor = rep; }
    loading = false; render();
  }
  async function set(pid, a, status, note){
    if(!on) return;
    const cur = map.get(key(pid, a)) || {};
    const row = {rep_email: KDH_USER.email||'', program_id: pid, account_num: num(a), account_name: a.name||'', status: status || cur.status || 'follow', note: note==null ? (cur.note||'') : note};
    map.set(key(pid, a), {status: row.status, note: row.note, updated_at: new Date().toISOString(), saving:true}); err = ''; render();
    try{
      const res = await fetch(base()+'?on_conflict=rep_email,program_id,account_num', {method:'POST',
        headers: hdr({'content-type':'application/json', prefer:'resolution=merge-duplicates,return=representation'}), body: JSON.stringify(row)});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const back = await res.json(); const r = Array.isArray(back) ? back[0] : null;
      map.set(key(pid, a), {status: r ? r.status : row.status, note: r ? (r.note||'') : row.note, updated_at: r ? r.updated_at : new Date().toISOString()});
    }catch(e){ if(cur.status) map.set(key(pid, a), cur); else map.delete(key(pid, a)); err = 'Couldn’t save that ('+(e.message||e)+'). Check your connection and try again.'; }
    render();
  }
  async function clear(pid, a){
    if(!on) return;
    const cur = map.get(key(pid, a)); if(!cur) return;
    map.delete(key(pid, a)); err = ''; render();
    try{
      const res = await fetch(base()+'?program_id=eq.'+encodeURIComponent(pid)+'&account_num=eq.'+encodeURIComponent(num(a)), {method:'DELETE', headers: hdr()});
      if(!res.ok) throw new Error('HTTP '+res.status);
    }catch(e){ map.set(key(pid, a), cur); err = 'Couldn’t clear that ('+(e.message||e)+').'; }
    render();
  }
  return {on, canEdit, canShow, previewOf, load, set, clear, num,
    get: (pid, a) => map.get(key(pid, a)) || null,
    error: () => err, isLoading: () => loading, loadedFor: () => loadedFor};
})();
const RA_LABEL = {done:'Done', follow:'Follow up', skip:'Not now'};
const RA_MARK  = {done:'✓', follow:'⚑', skip:'–'};
let raEdit = null;   // "program|acct" whose note box is open
const raFoldOpen = new Set();   // "program|status" folds the rep opened (re-renders keep them open)
document.addEventListener('toggle', e=>{ const d = e.target; if(!(d instanceof HTMLDetailsElement) || !d.dataset.fold) return; if(d.open) raFoldOpen.add(d.dataset.fold); else raFoldOpen.delete(d.dataset.fold); }, true);
const raDay = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? fmtDay(d) : ''; };
// Rows split by the rep's marks: follow-ups first, untouched next (that is
// the live list), Not now and Done set aside.
function raSplit(p, rep, rows){
  rows = rows || [];
  const show = RA.canShow(rep);
  if(!show) return {on:false, edit:false, show:false, live:rows, follow:[], open:rows, later:[], done:[]};
  const st = a => RA.get(p.id, a);
  const follow = rows.filter(a=>{ const x = st(a); return x && x.status==='follow'; });
  const open = rows.filter(a=>!st(a));
  const later = rows.filter(a=>{ const x = st(a); return x && x.status==='skip'; });
  const done = rows.filter(a=>{ const x = st(a); return x && x.status==='done'; });
  return {on:true, edit:RA.canEdit(rep), show, live:follow.concat(open), follow, open, later, done};
}
// The control strip under one account: three buttons + note box for the
// signed-in rep, a read-only chip for a manager looking on.
function raStrip(p, a, edit, show){
  const st = show ? RA.get(p.id, a) : null;
  const k = p.id+'|'+RA.num(a);
  const note = st && st.note ? `<div class="ra-note">${E(st.note)}</div>` : '';
  if(edit){
    const b = (k2, l) => `<button type="button" class="ra-b ${k2}${st && st.status===k2 ? ' on' : ''}" data-act="ra-set" data-prog="${E(p.id)}" data-n="${E(RA.num(a))}" data-status="${k2}" aria-pressed="${st && st.status===k2 ? 'true' : 'false'}">${RA_MARK[k2]} ${l}</button>`;
    return note + (raEdit===k
      ? `<form class="ra-edit" data-prog="${E(p.id)}" data-n="${E(RA.num(a))}"><input type="text" maxlength="200" placeholder="Note (who you spoke to, what they said…)" value="${E(st ? st.note : '')}" autocomplete="off"><button type="submit" class="ra-b on">Save</button><button type="button" class="ra-b" data-act="ra-cancel">Cancel</button></form>`
      : `<div class="ra">${b('done','Done')}${b('follow','Follow up')}${b('skip','Not now')}<button type="button" class="ra-b note" data-act="ra-note" data-prog="${E(p.id)}" data-n="${E(RA.num(a))}">${st && st.note ? 'Edit note' : '+ Note'}</button>${st && st.saving ? '<span class="ra-saving">Saving…</span>' : ''}</div>`);
  }
  if(RA.previewOf(state.rep)){
    const b = (k2, l) => `<button type="button" class="ra-b ${k2}${st && st.status===k2 ? ' on' : ''}" disabled aria-disabled="true">${RA_MARK[k2]} ${l}</button>`;
    return note + `<div class="ra ra-off">${b('done','Done')}${b('follow','Follow up')}${b('skip','Not now')}</div><div class="ra-pv">Saving is off in preview — these are ${E(first(state.rep))}’s own marks.</div>`;
  }
  if(st) return note + `<div class="ra"><span class="ra-chip ${st.status}">${RA_MARK[st.status]} ${RA_LABEL[st.status]}${raDay(st.updated_at) ? ' · '+raDay(st.updated_at) : ''}</span></div>`;
  return '';
}
const raTag = (p, a, edit, show) => { const st = show ? RA.get(p.id, a) : null; return st && edit ? `<span class="ra-tag ${st.status}">${RA_MARK[st.status]} ${RA_LABEL[st.status]}</span>` : ''; };
const raRowCls = (p, a, show) => { const st = show ? RA.get(p.id, a) : null; return st ? ' ra-'+st.status : ''; };
const raNotes = (show, edit, rows, marks) => (show && RA.error() ? `<div class="ra-err">${E(RA.error())}</div>` : '')
  + (edit && rows.length && !marks ? `<div class="ra-hint">Tap <b>Done</b>, <b>Follow up</b> or <b>Not now</b> under an account to keep track — your manager sees your marks too.</div>` : '');
// One visit-list row. `edit` = the signed-in rep on their own list.
function planRowHtml(p, a, edit, show){
  const meta = E([a.city, a.area].filter(Boolean).join(' · ')) + (a.cases>0 ? ` · ${E(fmtCases(a.cases))}/yr` : '');
  const strip = raStrip(p, a, edit, show);
  return `<li class="plan-row${a.warm?' warm':''}${raRowCls(p, a, show)}"><div class="plan-name">${E(a.name)}${raTag(p, a, edit, show)}</div><div class="plan-meta">${meta}</div>${strip ? `<div class="plan-act">${strip}</div>` : ''}</li>`;
}
// Folded group at the foot of the list for what the rep set aside.
function planFold(p, rows, status, edit, show){
  if(!rows.length) return '';
  const fk = p.id+'|'+status;
  return `<details class="plan-fold ${status}" data-fold="${E(fk)}"${raFoldOpen.has(fk)?' open':''}><summary>${RA_MARK[status]} ${E(RA_LABEL[status])} · ${rows.length}</summary><ol class="plan-list">${rows.map(a=>planRowHtml(p, a, edit, show)).join('')}</ol></details>`;
}
function lockState(){
  if(!LOCKED_REP) return;
  state.rep = LOCKED_REP; state.mode = 'rep'; state.peek = null;
  if(state.view==='home' || state.view==='programs' || state.view==='program'){
    state.view = 'rep'; state.prog = null; state.from = null;
    if(!state.cat) state.cat = isSupport(LOCKED_REP) ? 'on' : lastTab();
    state.main = tabOf(state.cat);
  }
  applyOnly();
}
function applyOnly(){
  if(state.only && tabOf(state.cat)!==state.only){ state.cat = state.only; state.main = tabOf(state.cat); }
}
function persist(){ try{ localStorage.setItem(LS_KEY, JSON.stringify({rep:state.rep, cat:state.cat, mode:state.mode})); }catch(e){} }
// Manager Mode is desktop-only: a phone or tablet (touch pointer, or a
// narrow window) always gets Rep Mode, and a mode=manager link opened there
// is rewritten to Rep Mode.
const isMobile = () => window.innerWidth < 760 || (window.matchMedia('(pointer:coarse)').matches && window.innerWidth < 1100) || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isMgr = () => state.mode==='manager' && !isMobile();
window.addEventListener('resize', ()=>{ if(!LIB && state.mode==='manager') render(); });
// A signed-in manager on a computer starts in Manager Mode (2026-10-04, Gavin:
// no repeated mode screens); a manager who switched to Rep Mode keeps it.
const SIGNED_MGR = !!(KDH_USER && KDH_USER.role === 'manager' && !KDH_USER.preview);
function restore(){ try{ const s = JSON.parse(localStorage.getItem(LS_KEY)||'{}');
  if(!isMobile() && (s.mode==='manager' || (SIGNED_MGR && s.mode!=='rep'))) state.mode = 'manager'; }catch(e){ if(SIGNED_MGR && !isMobile()) state.mode = 'manager'; } }
function hashOf(){
  const p = [];
  if(state.view!=='home') p.push('view='+state.view);
  if(state.rep && state.view!=='programs' && state.view!=='program') p.push('rep='+encodeURIComponent(state.rep));
  if(state.cat && (state.view==='rep' || state.view==='detail' || state.view==='sup' || state.view==='accts' || state.view==='acct')) p.push('cat='+state.cat);
  if(state.sup && state.view==='sup') p.push('sup='+encodeURIComponent(state.sup));
  if(state.list && (state.view==='accts' || state.view==='acct')) p.push('list='+state.list);
  if(state.n!=null && state.view==='acct') p.push('n='+encodeURIComponent(state.n));
  if(state.month && state.view==='rep') p.push('month='+state.month);
  if(state.prog && (state.view==='detail' || state.view==='program' || state.view==='accts' || state.view==='acct')) p.push('prog='+encodeURIComponent(state.prog));
  if(state.from && state.view==='detail') p.push('from='+state.from);
  if(state.peek && state.view==='detail') p.push('who='+encodeURIComponent(state.peek));
  if(isMgr()) p.push('mode=manager');
  if(state.only) p.push('only='+state.only);
  if(state.im && state.im!==INC_MONTHS[INC_MONTHS.length-1].key && (state.view==='rep' || state.view==='sup')) p.push('im='+state.im);
  return p.length ? '#'+p.join('&') : '#';
}
function readHash(){
  const h = (location.hash||'').replace(/^#/,''); const o = {};
  h.split('&').filter(Boolean).forEach(kv=>{ const i = kv.indexOf('='); if(i<0) return; o[kv.slice(0,i)] = decodeURIComponent(kv.slice(i+1)); });
  return o;
}
function applyHash(){
  const h = readHash();
  if(h.rep && ROSTER.includes(h.rep)) state.rep = h.rep;
  if(h.main==='inc' || h.main==='mpo') state.main = h.main;
  if(h.cat && CATEGORIES.some(c=>c.key===h.cat)){ state.cat = h.cat; state.main = tabOf(h.cat); }
  state.month = h.month && Object.keys(MPO_SCOPES).some(sc=>MPO_SCOPES[sc].mod.MONTHS.some(m=>m.key===h.month)) ? h.month : null;
  state.prog = h.prog && PROGRAMS.some(p=>p.id===h.prog) ? h.prog : null;
  state.from = h.from || null;
  state.peek = (h.who && ROSTER.includes(h.who) && h.who!==state.rep) ? h.who : null;
  if(h.mode==='manager') state.mode = isMobile() ? 'rep' : 'manager'; else if(h.mode==='rep') state.mode = 'rep';
  const v = h.view;
  // view=pick was the old "what are you looking for?" / supplier step -- an
  // old link now lands straight on the rep's dashboard with that tab open.
  state.sup = h.sup && PROGRAMS.some(p=>p.supplier===h.sup) ? h.sup : null;
  state.list = LISTS[h.list] ? h.list : null;
  state.n = h.n!=null && h.n!=='' ? String(h.n) : null;
  if(v==='programs' || v==='program' || v==='rep' || v==='detail' || v==='home' || v==='sup' || v==='accts' || v==='acct') state.view = v;
  else if(v==='pick'){ state.view = 'rep'; state.cat = (h.main ? tabOf(h.main) : null) || state.cat || lastTab(); }
  else state.view = 'home';
  if((state.view==='rep' || state.view==='detail' || state.view==='sup' || state.view==='accts' || state.view==='acct') && !state.rep) state.view = 'home';
  if(state.view==='sup' && !state.sup) state.view = 'rep';
  if((state.view==='accts' || state.view==='acct') && !state.prog) state.view = 'rep';
  if(state.view==='accts' && !state.list) state.list = 'targets';
  if(state.view==='acct' && state.n==null) state.view = 'accts';
  if(state.view==='rep' && !state.cat){ state.cat = lastTab(); }
  state.main = tabOf(state.cat);
  if((state.view==='detail' || state.view==='program') && !state.prog) state.view = state.rep ? 'rep' : 'programs';
  if(isMobile() && (state.view==='programs' || state.view==='program')) state.view = state.rep ? 'rep' : 'home';
  state.only = TAB_KEYS.includes(h.only) ? h.only : null;
  state.im = INC_MONTHS.some(m=>m.key===h.im) ? h.im : INC_MONTHS[INC_MONTHS.length-1].key;
  applyOnly();
  lockState();
}
function go(next, replace){
  try{ scrollMem[location.hash||'#'] = window.scrollY; }catch(e){}
  Object.assign(state, next);
  applyOnly();
  lockState();
  persist();
  const h = hashOf();
  if(replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
  render();
  if(next.view!==undefined) window.scrollTo({top:0, behavior:'instant' in window ? 'instant' : 'auto'});
}
window.addEventListener('popstate', ()=>{ if(LIB) return; applyHash(); const h = hashOf(); if(h!==(location.hash||'#')) history.replaceState(null, '', h); render();
  // Back restores where the list was scrolled to (2026-09-30).
  const y = scrollMem[location.hash||'#']; if(typeof y==='number') requestAnimationFrame(()=>window.scrollTo(0, y)); });

/* ====================================================================
   RENDERING
   ==================================================================== */
const app = () => $('#app');
const first = rep => String(rep||'').split(' ')[0];
const possessive = rep => { const f = first(rep); return f + (f.endsWith('s') ? '’' : '’s'); };

function chip(cls, text, ic){ return `<span class="chip ${cls}">${ic?`<span class="ic">${ic}</span>`:''}${E(text)}</span>`; }
function statusChip(r, small){
  const s = STATUS[r.status] || STATUS.notstarted;
  return `<span class="chip st-${r.status}${small?' sm':''}"><span class="ic">${s.ic}</span>${E(r.loading ? 'Loading…' : (r.manual ? 'Manually verified' : s.label))}</span>`;
}
function typeChips(p){
  return `<span class="chip type-${p.type==='MPO'?'mpo':'inc'}">${E(p.type)}</span>` +
         `<span class="chip chan-${p.channel}">${E(p.channelLabel)}</span>`;
}
function barHtml(r, big){
  if(r.openEnded) return `<div class="bar${big?' big':''} open"><div class="bar-fill ${r.pace}" style="width:${r.status==='notstarted'?0:100}%"></div></div>`;
  const pct = r.pct==null ? 0 : r.pct;
  return `<div class="bar${big?' big':''}"><div class="bar-fill ${r.pace}" style="width:${Math.max(pct, pct>0?2:0)}%"></div></div>`;
}
function logoStrip(p, cls){
  const marks = p.brandLogos.length ? p.brandLogos : (p.supplierLogo ? [p.supplierLogo] : []);
  if(!marks.length) return '';
  return `<span class="marks ${cls||''}">${marks.map(src=>`<span class="mark"><img src="${E(src)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>`).join('')}</span>`;
}
function flags(p, r){
  const out = [];
  const n = daysLeft(p.period.end);
  if(isActive(p) && n <= ENDING_SOON_DAYS && r.status!=='complete' && r.status!=='exceeded' && r.status!=='soon') out.push(`<span class="flag end">⏰ ${n<=0?'Ends today':pl(n,'day')+' left'}</span>`);
  if(r.pct!=null && r.pct>=ALMOST_PCT && r.status==='progress') out.push(`<span class="flag close">🔥 Almost there</span>`);
  if(r.status==='exceeded') out.push(`<span class="flag done">★ Over goal</span>`);
  return out.join('');
}
const plw = (n,w)=>`${n} ${w}${n===1?'':'s'}`;
const pl = plw;

/* ---- topbar ---- */
function topbar(){
  const rep = state.rep;
  const onRep = state.view==='rep' || state.view==='detail';
  return `<div class="topbar">
    <div class="crumb"><a href="#" data-act="home">Incentives &amp; MPO Hub</a></div>
    <div class="hero-banner nj-hero"><div class="nj-hero-inner">
      <div class="nj-hero-kicker">Distributing the Best Beverages to</div>
      <div class="nj-hero-row"><img class="hero-logo-badge" src="../assets/kohler-logo-badge.png" alt="Kohler Distributing Company"><span class="nj-hero-script">Northern NJ</span></div>
    </div></div>
    ${state.view!=='home' ? `<div class="navrow">
      <div class="navl">${rep && onRep ? `<span class="nav-rep">👤 ${E(state.peek && state.view==='detail' ? state.peek : rep)}</span>` : ''}</div>
      <div class="navr">
        ${rep && state.view!=='rep' && isMgr() ? `<button class="nbtn" data-act="my-programs">All of ${E(rep.split(' ')[0])}’s programs</button>` : ''}
        ${!LOCKED_REP && !state.asRep && state.view!=='home' ? `<button class="nbtn quiet" data-act="home">Choose Another Rep</button>` : ''}
        ${isMgr() && !state.asRep && !(state.view==='programs' || state.view==='program') ? `<button class="nbtn quiet" data-act="programs">By program</button>` : ''}
        ${isMobile() || LOCKED_REP || state.asRep ? '' : `<span class="modeseg" role="group" aria-label="How much detail"><button class="mseg${isMgr()?'':' active'}" data-act="set-mode" data-mode="rep">Rep view</button><button class="mseg${isMgr()?' active':''}" data-act="set-mode" data-mode="manager">Manager view</button></span>`}
      </div>
    </div>` : ''}
  </div>`;
}
// One line per feed (2026-09-22, per Gavin): Incentives, then Off-Premise
// and On-Premise MPOs, each with its own stamp. The MPO stamp is the month
// a rep's page is showing (mpoRepMonth), falling back to the newest loaded
// month; a scope with nothing loaded yet says so instead of vanishing.
// hub.css lays the three out inline on desktop and stacked on phones.
function refreshedLine(){
  // Only the feeds this screen shows: incentives-only mode (the workspace's
  // Incentive Hub tile) says nothing about the MPO boards (2026-09-28).
  // and on a rep's tab only that tab's feed (2026-10-02): one quiet line, not three
  const tabNow = (state.view==='rep' || state.view==='sup' || state.view==='detail') && ['inc','off','on'].includes(tabOf(state.cat)) ? tabOf(state.cat) : '';
  const lines = tabNow && tabNow!=='inc' ? [] : [['Incentives', incRefreshed()]];
  (state.only==='inc' || tabNow==='inc' ? [] : ['off','on'].filter(x=>!tabNow || x===tabNow)).forEach(s=>{
    const st = mpoState[s]||{}; const mk = mpoRepMonth(s);
    const iso = (st[mk] && st[mk].syncedAt) || Object.keys(st).map(k=>st[k].syncedAt).filter(Boolean).sort().pop();
    lines.push([MPO_SCOPES[s].label, iso ? fmtSynced(iso) : 'loading…']);
  });
  return `<p class="updated"><span class="livedot"></span><span class="upd-lines">${lines.map(([k,v])=>
    `<span class="upd"><span class="upd-k">${E(k)} refreshed</span> <span class="upd-v">${E(v||'—')}</span></span>`).join('')}</span></p>`;
}

/* ---- landing ---- */
// One question, one tap: choosing a name opens that rep's dashboard. The
// screen is the Incentive Tracker's own "Choose your name" step (its v3
// screenName()) rebuilt on the hub's tokens, so both pages open the same
// way: a left-aligned title, one label per District Manager, and a grid of
// names. No card wrapper and no search box -- every name is on screen.
function screenHome(){
  // A manager is choosing someone else's page; a rep is finding their own (2026-09-29).
  const mgrPicker = !LOCKED_REP && !!(KDH_USER && KDH_USER.role === 'manager');
  return `<div class="homeview">
    <div class="home-head">
      <h1>${mgrPicker ? 'Choose a Rep' : 'Choose Your Name'}</h1>
      <p class="home-sub">${mgrPicker ? 'Tap a name to see that rep’s incentives and MPOs.' : 'Tap your name to see your incentives and MPOs.'}</p>
      ${refreshedLine()}
    </div>
    <div id="repList" class="replist">${repListHtml()}</div>
    <div class="home-foot">${isMobile() ? '' : isMgr() ? `Manager Mode is on · <a href="#" data-act="programs">Browse by program</a> · <a href="#" data-act="set-mode" data-mode="rep">Back to Rep Mode</a>` : `Manager? <a href="#" data-act="set-mode" data-mode="manager">Switch to Manager Mode (desktop)</a>`}</div>
  </div>`;
}
// Reps under their District Manager, in DM_GROUPS order; anyone on the
// roster without a DM lands in "Other" so nobody is unreachable.
function repListHtml(){
  const grouped = new Set(DM_GROUPS.flatMap(g=>g.reps));
  const other = ROSTER.filter(r=>!grouped.has(r));
  const groups = DM_GROUPS.map(g=>({dm:g.dm, under:g.under, reps:g.reps.filter(r=>ROSTER.includes(r))}))
    .concat(other.length ? [{dm:'Other', reps:other}] : [])
    .filter(g=>g.reps.length);
  const grid = reps => `<div class="namegrid">${reps.map(r=>
      `<button class="name" data-act="pick-rep" data-rep="${E(r)}">${E(r)}<span class="ar">&#8594;</span></button>`
    ).join('')}</div>`;
  // A group `under` another manager (sales support under a DM) is placed
  // directly after that DM's names, and looks exactly like every other DM
  // group -- same orange label, same grid (per Gavin, 2026-09-16: "match the
  // format of the others"). `under` only fixes its position.
  const tops = groups.filter(g=>!g.under || !groups.some(x=>x.dm===g.under));
  return tops.map(g=>`<div class="dmlabel">${E(g.dm)}</div>${grid(g.reps)}` +
    groups.filter(x=>x.under===g.dm).map(x=>`<div class="dmlabel">${E(x.dm)}</div>${grid(x.reps)}`).join('')).join('');
}

/* ====================================================================
   THE INCENTIVE ACTION LIST -- one page, no drill-down (v11, 2026-09-11)
   --------------------------------------------------------------------
   Rep testing in Gavin's office: too much clicking. A rep picked a name,
   then a supplier, then a program, then a detail page, to learn one
   number. So Incentives is now ONE scrollable page: pick your name and
   every supplier you are in is already open, every program under it
   already shows Current / Goal / Still Needed / status / bar, and a click
   is only ever spent on potential accounts or program rules.

   NOTHING ABOUT THE UNDERLYING LOGIC MOVED. Every figure still comes from
   the tracker's own summarize() through p.forRep(), the account lists
   still come from nextAccounts(), and eligibility, territory and the
   On/Off-Premise split are untouched. This is layout and ordering only.

   WHAT THE DATA CANNOT DO, verified across five reps (see hub/README.txt):
   about 40% of a rep's incentives HAVE NO REP GOAL -- roughly 13 of 33 are
   open-ended ("every placement pays"), 3 carry a house goal rather than a
   per-rep one, and 3 are awaiting a first export or are verified by hand.
   Current / Goal / Still Needed cannot be invented for those, so they get
   an honest fourth status ("No set goal") and sort below the goal-bearing
   programs instead of faking a countdown.
   ==================================================================== */
const openSups = new Set();    // supplier keys EXPANDED on the incentive page (default: all closed)
// Supplier marks are one fixed box everywhere. A supplier with no logo file --
// or whose image 404s -- falls back to its INITIALS, not a placeholder icon.
const abbr = name => String(name||'').split(/[\s&]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function supLogoHtml(name, logo, cls){
  const mono = `<i class="suplogo-abbr">${E(abbr(name))}</i>`;
  return logo
    ? `<span class="suplogo ${cls||''}"><img src="${E(logo)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('blank');this.remove()">${mono}</span>`
    : `<span class="suplogo blank ${cls||''}">${mono}</span>`;
}
function incNums(r){
  const cur = Number(r.valueNum), goal = Number(r.goalNum);
  if(r.openEnded || !isFinite(cur) || !isFinite(goal) || goal<=0) return null;
  return {cur, goal, need: Math.max(goal-cur, 0)};   // MAX(Goal - Current, 0)
}
// Bands drive BOTH the status word and the sort. 0 is what a rep should do
// something about today; 5 is what does not apply to them at all.
function incBand(p, r){
  if(!r) return null;
  if(r.status==='unavailable') return {band:5, label:'Not in your territory', cls:'na'};
  if(r.soon) return {band:4, label:'Awaiting data', cls:'na'};
  const N = incNums(r);
  if(!N) return {band:3, label:'No set goal', cls:'open'};
  if(N.need<=0) return {band:2, label:'Goal Met', cls:'met'};
  if(r.pace==='close' || r.pace==='ontrack') return {band:1, label:'On Track', cls:'ontrack'};
  return {band:0, label:'Needs Attention', cls:'attn'};
}
// Closest to complete first (2026-09-22, per Gavin): a rep's own share of
// each goal, highest first, so met goals lead and the furthest-off program
// sits last. Ties break on the sooner end date. Programs without a number
// to measure follow: no set goal, awaiting data, not in territory.
function incPctDone(x){
  const N = incNums(x.r);
  if(!N) return null;
  return N.goal > 0 ? N.cur / N.goal : (N.need<=0 ? 1 : 0);
}
function incSortKey(x){
  const pct = incPctDone(x);
  const days = daysLeft(x.p.period.end);
  return [pct==null ? x.b.band : 0, pct==null ? 0 : -pct, days, x.p.name];
}
// Green / blue / amber dots for a supplier card: one per status its programs
// hold (a supplier with one met and one lagging program shows both).
function incDotsHtml(list){
  const seen = [];
  list.forEach(x=>{ if(x.b.band<=2 && !seen.includes(x.b.cls)) seen.push(x.b.cls); });
  const order = ['met','ontrack','attn'], title = {met:'Goal met', ontrack:'On track', attn:'Needs attention'};
  return seen.length ? `<span class="idots">${order.filter(c=>seen.includes(c)).map(c=>`<i class="idot ${c}" title="${title[c]}"></i>`).join('')}</span>` : '';
}
function cmpKey(a, b){
  for(let i=0;i<a.length;i++){ if(a[i]<b[i]) return -1; if(a[i]>b[i]) return 1; }
  return 0;
}
// THE UNIT (2026-09-29): a number on its own ("22 still needed") is not
// an instruction. The tracker's own strings carry the unit ("16 cases to
// go", "2 accounts to go", "20 placements"); read it back out so every
// progress line and every total says cases, accounts, placements, buyers.
function unitOf(r){
  // "16 cases to go", "9,305 CE to unlock", "3 placements", "40% of base" -> cases / CE / placements / ''
  const grab = t => { const m = String(t||'').replace(/,/g,'').match(/^\s*[\d.]+\s*([A-Za-z][A-Za-z' -]*?)(?:\s+(?:to go|to unlock|to earn|more|needed|remaining|left))?\s*$/); if(!m) return ''; const u = m[1].trim(); return /^(of|more|to)\b/i.test(u) ? '' : u; };
  // The goal text first (2026-09-30): "281 cases behind" and "2 lines still
  // on Summer Ale" are the remaining text, not the unit.
  return grab(r.goal) || grab(r.now) || grab(r.remain) || '';
}
const plural = (n, u) => u ? (n===1 && /s$/.test(u) ? u.replace(/s$/,'') : u) : '';
// "4 of 20 cases sold · 16 cases remaining · Ends Sep 30"
function incProgLine(p, r, N){
  const u = unitOf(r);
  const ends = endsLabel(p.period);
  if(!u) return `<p class="iprog"><b>${E(r.now||fmtN(N.cur))}</b> of <b>${E(r.goal||fmtN(N.goal))}</b> · ${N.need<=0 ? '<span class="ok">Goal met</span>' : E(r.remain||fmtN(N.need)+' still needed')} · ${E(ends)}</p>`;
  return `<p class="iprog"><b>${fmtN(N.cur)} of ${fmtN(N.goal)} ${E(u)}</b>${r.house?' <span class="iquiet">(house goal)</span>':''} · ${N.need<=0 ? '<span class="ok">Goal met</span>' : `${fmtN(N.need)} ${E(plural(N.need,u))} remaining`} · ${E(ends)}</p>`;
}
function incRowHtml(p, r, b, rep){
  const sec = cardSec[p.id] || null;
  const N = incNums(r);
  const pct = N ? Math.max(0, Math.min(100, (N.cur/N.goal)*100)) : (r.pct||0);
  const targets = (r.status==='unavailable' || r.soon) ? [] : nextAccounts(p, rep).rows.filter(a=>!a.foreign);
  const meta = [p.channelLabel, endsLabel(p.period)].filter(Boolean).join(' · ');

  const figures = N
    ? incProgLine(p, r, N)
    : `<div class="ifig open"><span class="if"><span class="if-k">${r.soon?'Status':'So far'}</span><span class="if-v">${E(r.now || (r.soon ? 'Awaiting data' : '—'))}</span></span>
        ${r.openEnded?`<span class="if-note">Open-ended — every one pays, no goal to count down${p.period && p.period.end ? ' · '+E(endsLabel(p.period)) : ''}</span>`:''}</div>`;

  const bar = N ? `<div class="ibar ${b.cls}"><div class="ibar-fill" style="width:${pct}%"></div></div>` : '';
  const off = r.status==='unavailable' || r.soon;
  // What qualifies (one sentence) and the next useful action live on the
  // summary itself (2026-09-29) -- nobody should have to open the account
  // list to learn what to sell.
  const qual = off ? '' : `<div class="iline qual"><span class="iline-l">Qualifies</span><span class="iline-t">${E(sellAsk(p))}</span></div>`;
  const next = (off || !r.next) ? '' : `<div class="iline next"><span class="iline-l">Next</span><span class="iline-t">${nextNoMoney(r.next)}</span></div>`;
  const dist = off ? [] : distFor(p, rep);
  const counts = {dist: dist.length || null, targets: off ? null : raLive(p, rep, targets).length};

  return `<div class="irow b${b.band}${sec?' open':''}" id="card-${E(p.id)}">
    <div class="irow-head">
      <span class="irow-top"><span class="irow-name">${E(p.shortName||p.name)}</span><span class="ist ${b.cls}">${b.band<=2?`<i class="idot ${b.cls}"></i>`:''}${E(b.label)}</span></span>
      <span class="irow-meta">${E(meta)}</span>
      ${qual}
      ${figures}
      ${bar}
      ${next}
      ${secLinks(p, sec, counts)}
    </div>
    ${sec ? `<div class="irow-body">${incRowDetail(p, r, rep, targets, dist, sec)}</div>` : ''}
  </div>`;
}
// Opened: the accounts table first (it is why a rep clicked), then the
// supporting detail. Per-account brand-level distribution is NOT in the
// customer base -- it carries total 2026 cases only -- so the missing
// product is named at PROGRAM level and each row carries the volume and
// the reason instead. See hub/README.txt.
function incRowDetail(p, r, rep, targets, dist, which){
  const fams = HubAccounts.PROGRAM_BRANDS[HubAccounts.brandKey(p)];
  const ask = sellAsk(p);
  // A retention program's detail is its BRAND GOALS, not a prospect list --
  // including the per-SKU current/goal rows added in v9.6. Dropping these
  // would lose the Constellation product-level work, so they come first.
  const BG = brandGoals(p, rep);
  const sec = (t, body, right) => body ? `<div class="isec"><div class="isec-h${right?' lhead':''}"><span>${E(t)}</span>${right||''}</div>${body}</div>` : '';
  const key = p.id+'|'+which;
  const full = `<div class="isec"><button class="ilink" data-act="open" data-prog="${E(p.id)}">Full program details and rankings</button></div>`;
  // CURRENT-PERIOD DISTRIBUTION -- where the credited activity came from,
  // inside this program's own dates, straight from the tracker's own lines.
  if(which==='dist'){
    const rc = reconLine(p, r, dist);
    return sec(`Credited in ${E(periodLabel(p.period))}`,
      `<div class="recon${rc.ok?' ok':''}">${rc.t}</div>` + acctList(key, ACCT_COLS.dist, dist), listMore(key, dist)) + full;
  }
  const table = !targets.length
    ? `<div class="it-note">No potential accounts currently identified.</div>`
    : acctList(key, ACCT_COLS.targets, targets, {prog:p, rep});
  if(BG.length){
    return sec('Your brand goals', brandGoalsHtml(BG, {noTitle:true, oneGoal: p.key==='mabi_retention_fall' ? (r.goal||'goal') : ''}))
      + sec(`Accounts to hold${targets.length?' · '+raLive(p, rep, targets).length:''}`, table, listMore(key, raLive(p, rep, targets)))
      + sec('How it is scored', repRulesHtml(p, 'ibul'))
      + full;
  }
  const marksNote = (RA.canShow && targets.length) ? `<div class="it-note quiet">Done, Follow up and Not now are your own notes for planning visits. Credit for this program comes only from sales data — see "${E(SEC_LABEL.dist)}".</div>` : '';
  return sec(`Potential accounts${targets.length?' · '+raLive(p, rep, targets).length:''}`, table + marksNote, listMore(key, raLive(p, rep, targets)))
    + ((fams && fams.length) ? sec('Pays on', `<div class="itext">${E(fams.join(' · '))}</div>`) : '')
    + sec('How it is scored', repRulesHtml(p, 'ibul'))
    + full;
}
// One entry per incentive the rep is actually in -- the incentive page's
// own list, shared with the tab counter.
function incRows(rep){
  const rows = [];
  PROGRAMS.forEach(p=>{
    if(p.type!=='Incentive' || !isActive(p)) return;
    if(!supportAllows(rep, p)) return;
    const r = p.forRep(rep); if(!r) return;
    if(isDollarProgram(r)) return;             // money is not a field metric
    if(!availability(p, rep).ok && r.status!=='unavailable') return;
    const b = incBand(p, r); if(!b) return;
    rows.push({p, r, b});
  });
  return rows;
}
function screenRepIncentives(rep){
  if(!isMgr()) return screenSuppliers(rep);
  const rows = incRows(rep);
  const sups = new Map();
  rows.forEach(x=>{ const k = x.p.supplier;
    if(!sups.has(k)) sups.set(k, []); sups.get(k).push(x); });
  sups.forEach(list=>list.sort((a,b)=>cmpKey(incSortKey(a), incSortKey(b))));
  // Suppliers in the same order: the one holding the rep's most-complete
  // program first, the one with only unmeasured programs last.
  const groups = [...sups.entries()].map(([name, list])=>({name, list,
    top: Math.max(...list.map(x=>{ const v = incPctDone(x); return v==null ? -1 : v; })),
    band: Math.min(...list.map(x=>x.b.band))}));
  groups.sort((a,b)=> b.top-a.top || a.band-b.band || a.name.localeCompare(b.name));

  const scored = rows.filter(x=>x.b.band<=2);
  const met = rows.filter(x=>x.b.band===2).length;
  const onTrack = rows.filter(x=>x.b.band===1).length;
  const attn = rows.filter(x=>x.b.band===0).length;
  // "Total Still Needed", with two exclusions that keep it from lying:
  //   - HOUSE goals (Garage Beer President's is 1,663 CE short COMPANY-WIDE,
  //     not Dave's gap -- including it put 2,285 on a rep's screen and 1,663
  //     of that was not his).
  //   - PERCENTAGE goals (Lytt's "50% of your accounts"): a percentage point
  //     is not a thing a rep can go place.
  // What is left still mixes units across programs (placements, accounts,
  // cases, buyers), so it is a workload signal rather than a quantity --
  // the sub-label says how many goals it covers for exactly that reason.
  const counts = x => { const N = incNums(x.r);
    return (N && !x.r.house && !/%/.test(String(x.r.goal||''))) ? N : null; };
  const counted = rows.filter(x=>counts(x));
  // Still needed, BY UNIT (2026-09-29): cases, accounts and placements are
  // never added into one number. Programs whose unit cannot be read from
  // the tracker's own text are counted as goals, not summed.
  const byUnit = new Map(); let unitless = 0;
  counted.forEach(x=>{ const u = unitOf(x.r); const N = counts(x); if(N.need<=0) return; if(!u){ unitless++; return; } byUnit.set(u, (byUnit.get(u)||0) + N.need); });
  const unitBits = [...byUnit.entries()].sort((a,b)=>b[1]-a[1]).map(([u,n])=>`<b>${fmtN(n)}</b> ${E(plural(n,u))}`);
  if(unitless) unitBits.push(`<b>${unitless}</b> ${unitless===1?'goal':'goals'} measured another way`);
  const summary = `<div class="isum">
      <span class="isum-i met"><b>${met}</b> ${met===1?'goal':'goals'} met</span>
      <span class="isum-i ontrack"><b>${onTrack}</b> on track</span>
      <span class="isum-i attn"><b>${attn}</b> need${attn===1?'s':''} attention</span>
      ${unitBits.length ? `<span class="isum-i units"><span class="isum-k">Still needed</span> ${unitBits.join('<span class="isum-sep">·</span>')}</span>` : ''}
    </div>`;

  const body = groups.map(g=>{
    const key = 'sup:'+g.name;
    const logo = (g.list[0] && g.list[0].p.supplierLogo) || '';
    const expanded = openSups.has(key);          // default CLOSED, per Gavin 2026-09-11
    const a = g.list.filter(x=>x.b.band===0).length;
    const note = [plw(g.list.length,'program'), a?`${a} need${a===1?'s':''} attention`:''].filter(Boolean).join(' · ');
    // Closed: every program still shows its name, status and progress on one
    // line, with a direct way to its accounts (2026-09-29) -- nobody expands
    // fourteen suppliers to find out what needs attention.
    const mini = expanded ? '' : `<div class="imini-list">${g.list.map(x=>{
      const N = incNums(x.r); const u = N ? unitOf(x.r) : '';
      const prog = !N ? E(x.r.now || (x.r.soon ? 'Awaiting data' : x.r.openEnded ? 'Every one pays' : '')) : (u ? `${fmtN(N.cur)} of ${fmtN(N.goal)} ${E(u)}` : `${E(x.r.now||fmtN(N.cur))} of ${E(x.r.goal||fmtN(N.goal))}`);
      return `<button class="imini" data-act="open-prog" data-sup="${E(key)}" data-prog="${E(x.p.id)}">
        <span class="imini-n">${E(x.p.shortName||x.p.name)}</span>
        <span class="imini-s ${x.b.cls}">${x.b.band<=2?`<i class="idot ${x.b.cls}"></i>`:''}${E(x.b.label)}</span>
        <span class="imini-p">${prog}</span>
        <span class="imini-go">${x.b.band<=2 ? 'Accounts ›' : 'Open ›'}</span>
      </button>`; }).join('')}</div>`;
    return `<section class="isup${expanded?'':' collapsed'}">
      <button class="isup-h" data-act="toggle-sup" data-sup="${E(key)}" aria-expanded="${expanded?'true':'false'}">
        ${supLogoHtml(g.name, logo)}<span class="isup-n">${E(g.name)}</span>${incDotsHtml(g.list)}<span class="isup-s">${E(note)}</span><span class="isup-ar">${expanded?'–':'+'}</span>
      </button>
      ${mini}
      ${expanded ? `<div class="isup-b">${g.list.map(x=>incRowHtml(x.p, x.r, x.b, rep)).join('')}</div>` : ''}
    </section>`;
  }).join('');

  const endedHtml = prevMonthsHtml(rep);

  return `<div class="repview iview">
    <div class="rep-head">
      <div class="rep-title"><h1>${E(possessive(rep))} Incentives</h1>
        ${roleLine(rep)}${tapShareLink(rep)}
        <div class="rep-sub">${plw(rows.length,'program')} across ${plw(groups.length,'supplier')} — everything on one page.</div>
        ${refreshedLine()}</div>
      ${tabbar(rep, 'inc')}
      ${summary}
    </div>
    ${rows.length ? body : `<div class="empty">No incentives apply to you right now.</div>`}
    ${endedHtml}
  </div>`;
}

/* ---- rep program list ---- */
/* ---- sub-category screen: New / Ongoing / Retention, or On / Off ---- */
function subStat(rep, sub){
  const rows = sortedForRep(rep, sub.key);
  const act = rows.filter(x=>x.g<7);
  if(neededMonths(act.map(x=>x.p)).length) return {n:null, text:'Loading…'};
  if(!act.length) return {n:0, text:'Nothing for you right now'};
  const done = act.filter(x=>x.r.status==='complete'||x.r.status==='exceeded').length;
  const ending = act.filter(x=>x.g===1).length;
  return {n:act.length, text:[plw(act.length,'active program'), done ? done+' done' : '', ending ? ending+' ending soon' : ''].filter(Boolean).join(' · ')};
}
// The two tabs at the top of a rep's results. They only re-group what is
// already on the page -- no extra screen, no menu, no confirm.
function tabbar(rep, cat){
  const cur = tabOf(cat);
  const tabs = TABS.filter(m=>!state.only || m.key===state.only);
  if(tabs.length < 2) return '';     // one tab is not a choice (incentives-only mode, 2026-09-28)
  return `<div class="tabbar" role="tablist">${tabs.map(m=>{
    const on = m.key===cur, n = tabCount(rep, m.key);
    return `<button class="tab${on?' active':''}" data-act="set-cat" data-cat="${m.key}" role="tab" aria-selected="${on?'true':'false'}">
      <span class="tab-l"><span class="tl-long">${E(m.label)}</span><span class="tl-short">${E(m.label.replace(/ MPOs$/,''))}</span></span>${n===null?'':`<span class="tab-n">${n}</span>`}</button>`;
  }).join('')}</div>`;
}
// Programs behind a tab. Incentives counts what the incentive page itself
// lists (incRows); an MPO tab counts the month it is showing.
function tabCount(rep, key){
  if(key==='inc') return incRows(rep).length;
  const rows = sortedForRep(rep, key).filter(x=>x.g<7);
  return neededMonths(rows.map(x=>x.p)).length ? null : rows.length;
}
// Published months for one scope, newest first -- a rep can step back into
// any of them to see how a past month finished.
function monthStrip(scope){
  const months = MPO_SCOPES[scope].mod.MONTHS.slice().reverse();
  if(months.length < 2) return '';
  const cur = mpoViewMonth(scope), live = mpoRepMonth(scope);
  return `<div class="mstrip" role="tablist" aria-label="Month">${months.map(m=>
    `<button class="mpill${m.key===cur?' active':''}" data-act="set-month" data-month="${E(m.key)}" role="tab" aria-selected="${m.key===cur?'true':'false'}"><span class="tl-long">${E(m.label)}</span><span class="tl-short">${E(m.label.replace(/^(\w{3})\w*/,'$1'))}</span>${m.key===live?'<span class="mpill-now">Now</span>':''}</button>`
  ).join('')}</div>`;
}
// Incentives, grouped by supplier for the picker: suppliers with live
// programs first, then alphabetical (the tracker's order). "Incentives" is
// every active program the rep is in (a Coming Soon one counts, an
// unavailable or ended one does not); "already earned" is Completed/Exceeded.
// "Earned" the way the tracker's supplier step counts it: the goal is met,
// or an open-ended program has already paid something.
const isEarned = r => r.status==='complete' || r.status==='exceeded' || (r.openEnded && r.pace==='earned');
function repSuppliers(rep){
  const rows = sortedForRep(rep, 'inc').filter(x=>x.g<7);
  const groups = new Map();
  rows.forEach(x=>{ const sk = x.p.supKey; if(!groups.has(sk)) groups.set(sk, []); groups.get(sk).push(x); });
  return [...groups.entries()].map(([sk, items])=>({sk, name:SUPPLIERS[sk].name, logo:assetPath(SUPPLIERS[sk].logo), items,
      live: items.filter(x=>x.r.status!=='soon').length, earned: items.filter(x=>isEarned(x.r)).length}))
    .sort((a,b)=>(b.live-a.live) || a.name.localeCompare(b.name));
}
/* ---- rep program list ---- */
function screenRep(){
  const rep = state.rep, cat = state.cat || 'all';
  // Incentives are one page now -- no supplier step, no program step (v11).
  if(cat==='inc') return screenRepIncentives(rep);
  const rows = sortedForRep(rep, cat);
  const catMeta = catMetaOf(cat);
  const main = tabOf(cat);
  const active = rows.filter(x=>x.g<7);
  const counts = {complete:0, progress:0, notstarted:0, ending:0, soon:0};
  active.forEach(x=>{ if(x.r.status==='complete'||x.r.status==='exceeded') counts.complete++; else if(x.r.status==='progress') counts.progress++; else if(x.r.status==='notstarted') counts.notstarted++; else counts.soon++; if(x.g===1) counts.ending++; });
  const pending = neededMonths(active.map(x=>x.p));
  const bySup = cat.startsWith('sup:');
  // An MPO page is a worklist: one line of context, no count tiles (v10).
  const isMpoCat = cat==='on' || cat==='off' || cat==='mpo';
  const scope = cat==='on' ? 'on' : 'off';
  const past = isMpoCat && viewingPast(scope);
  const subline = bySup
    ? `${plw(active.length,'incentive')}${active.filter(x=>isEarned(x.r)).length?` · <strong class="ok">${active.filter(x=>isEarned(x.r)).length} already earned</strong>`:''}${counts.ending?` · <strong>${counts.ending} ending soon</strong>`:''}`
    : isMpoCat
      ? `${plw(active.length,'program')} · ${counts.complete} at goal · ${active.length-counts.complete}${past?' missed':' still open'}`
      : `${plw(active.length,'active program')}${counts.ending?` · <strong>${counts.ending} ending soon</strong>`:''}`;
  let html = `<div class="rep-head">
    <div class="rep-title"><h1>${E(possessive(rep))} ${E(catMeta.label)}</h1>
      ${roleLine(rep)}${tapShareLink(rep)}
      <div class="rep-sub">${subline}</div>
      ${refreshedLine()}</div>
    ${tabbar(rep, cat)}
    ${isMpoCat ? monthStrip(scope) : ''}
    ${(bySup || isMpoCat) ? '' : `<div class="counts">
      <div class="count good"><div class="count-n">${counts.complete}</div><div class="count-l">Completed</div></div>
      <div class="count accent"><div class="count-n">${counts.progress}</div><div class="count-l">In progress</div></div>
      <div class="count"><div class="count-n">${counts.notstarted}</div><div class="count-l">Not started</div></div>
      <div class="count amber"><div class="count-n">${counts.ending}</div><div class="count-l">Ending soon</div></div>
    </div>`}
  </div>`;
  if(pending.length) html += `<div class="loading">Loading MPO data…</div>`;
  if(!rows.length) html += `<div class="empty">No ${E(catMeta.label.toLowerCase())} ${past?`in ${E(mpoMonthLabel(scope))}`:'apply to you right now'}.</div>`;
  const SECTIONS = {
    inc:['inc','Incentives','Supplier reward programs', x=>x.p.type==='Incentive'],
    off:['off','Off-Premise MPOs','Liquor stores & retail', x=>x.p.type==='MPO' && x.p.channel==='off'],
    on: ['on','On-Premise MPOs','Bars & restaurants', x=>x.p.type==='MPO' && x.p.channel==='on'],
  };
  const order = cat==='all' ? ['inc','off','on'] : cat==='mpo' ? ['on','off'] : null;
  if(order){
    order.forEach(k=>{
      const [cls, title, sub, test] = SECTIONS[k];
      const sub_rows = rows.filter(test);
      const monthNote = k!=='inc' ? ' · '+mpoMonthLabel(k) : '';
      html += `<div class="chanhead ${cls}"><span class="chanhead-t">${E(title)}</span><span class="chanhead-s">${E(sub)}${E(monthNote)} · ${plw(sub_rows.filter(x=>x.g<7).length,'active program')}</span></div>`;
      html += sub_rows.length ? renderGroups(sub_rows, rep) : `<div class="empty small">No ${E(title.toLowerCase())} for you right now.</div>`;
    });
    return `<div class="repview">${html}</div>`;
  }
  html += renderGroups(rows, rep, {quiet: bySup || isMpoCat});
  return `<div class="repview${bySup?' single':''}${isMgr()?'':' hview'}">${html}</div>`;
}
function mpoMonthLabel(scope){ const mk = mpoViewMonth(scope); const m = MPO_SCOPES[scope].mod.MONTHS.find(x=>x.key===mk); return m ? m.label : mk; }
function renderGroups(rows, rep, opts){
  opts = opts || {};
  let html = '';
  let lastG = null, open = false;
  rows.forEach(x=>{
    // Quiet mode (a supplier's page): one plain list in the usual order, with
    // headings only where the reader needs a warning -- unavailable or ended.
    const g = opts.quiet && x.g<7 ? 0 : x.g;
    if(g!==lastG){
      lastG = g;
      if(open){ html += '</div>'; open = false; }
      const gm = GROUP_META[x.g];
      if(g===0){ /* no heading */ }
      else if(x.g===8){
        const n = rows.filter(y=>y.g===8).length;
        html += `<button class="ghead toggle ${gm.cls}${state.showEnded?' open':''}" data-act="toggle-ended"><span class="ghead-t">${E(gm.title)} <span class="ghead-n">${n}</span></span><span class="ghead-s">${E(gm.sub)}</span><span class="ghead-ar">${state.showEnded?'▾':'▸'}</span></button>`;
      } else {
        html += `<div class="ghead ${gm.cls}"><span class="ghead-t"><span class="ghead-ic">${gm.ic}</span>${E(gm.title)}</span><span class="ghead-s">${E(gm.sub)}</span></div>`;
      }
    }
    if(x.g===8 && !state.showEnded) return;
    if(!open){ html += isMgr() ? '<div class="cards">' : '<div class="hlist">'; open = true; }
    html += programCard(x.p, x.r, rep);
  });
  if(open) html += '</div>';
  return html;
}
/* ====================================================================
   ACCOUNT DRILL-DOWN -- eligible / already buying / high potential /
   can't sell here. The universe and the territory rule live in
   accounts.js (HubAccounts); this side only gathers "already buying" from
   what the trackers already publish for the rep.
   ==================================================================== */
const BUY_KEY = /(New|Rebuy|Accounts|ByAccount|accountList|^lines$|buyingAccounts|partialAccounts|onPremSeptember|draftLines|newPod|^rebuy$|offPremSingles|onPremBuilding|convertedAccounts|gainedAccounts|convertedSinceReport)$/;
const NOT_BUY = /Targets?$|Whitespace|Lapsed|unconverted|notConverted|gapSkus|Count$|Total$/i;
function buyNote(key, it){
  if(/New$|newPod|convertedSinceReport|gainedAccounts/.test(key)) return 'new this period';
  if(/Rebuy|^rebuy$/.test(key)) return 'reorder';
  if(/converted/.test(key)) return 'converted';
  const d = it.date || it.lastDate || (it.products && it.products[0] && it.products[0].date);
  return d ? 'bought '+d : '';
}
function buyingFor(p, rep){
  const m = new Map();
  const add = (name, note)=>{ if(!name) return; const k = HubAccounts.norm(name); if(!k) return;
    if(!m.has(k) || (note && m.get(k)===true)) m.set(k, note||true); m.set('__label__'+k, String(name)); };
  if(p.source==='inc'){
    const d = p.entry.getRep(rep); if(!d) return m;
    const walk = (obj, depth)=>{
      if(!obj || typeof obj!=='object' || depth>4) return;
      Object.keys(obj).forEach(k=>{
        const v = obj[k];
        if(Array.isArray(v)){
          const take = BUY_KEY.test(k) && !NOT_BUY.test(k);
          v.forEach(it=>{
            if(!it || typeof it!=='object') return;
            const name = it.customer || it.name || it.account;
            if(take && name){ if(k==='octoberfestByAccount' && !(it.unitsThisYear>0)) return; add(name, buyNote(k, it)); }
            walk(it, depth+1);
          });
        } else if(v && typeof v==='object') walk(v, depth+1);
      });
    };
    walk(d, 0);
    return m;
  }
  const slot = mpoState[p.source] && mpoState[p.source][p.monthKey]; const D = slot && slot.DATA;
  if(!D || !D[p.key]) return m;
  const d = D[p.key]; const sets = d.subs ? d.subs : [d];
  sets.forEach(sd=>{
    const r = (sd.reps||[]).find(x=>x.rep===rep); if(!r || !Array.isArray(r.lines)) return;
    r.lines.forEach(l=>{
      const name = l.customer; if(!name) return;
      // FOLLOW-UP objectives (Oktoberfest conversion, Spirits follow-up, Carbliss
      // 40%): every base account is a line, but only a DONE one is "already
      // buying" -- the rest are the targets.
      if(p.objective.type==='followup' && !l.done) return;
      let note = '';
      if(p.objective.type==='followup') note = l.doneDetail || 'done';
      else if(p.objective.type==='photos') note = 'photo submitted';
      else if(l.new_buyer==='1' || l.isNew) note = 'new this month';
      else if(l.period==='base') note = 'bought in base period';
      else if(l.period==='current') note = 'repeat buyer';
      else if(l.date) note = 'bought '+l.date;
      add(name, note);
      // ...and by ACCOUNT NUMBER, which classify() also looks up. An account
      // the tracker shows buying must never be offered back as a target
      // ("only include target accounts if they are GOING TO BE A NEW BUYER" --
      // Gavin, 2026-09-11), and matching on the spelling alone would leak one
      // through the day RDE and the customer base disagree about a name.
      if(l.num) m.set(String(l.num), note || true);
    });
  });
  return m;
}
const acctCache = new Map();
function accountsFor(p, rep){
  const k = p.id+'|'+rep;
  if(!acctCache.has(k)) acctCache.set(k, HubAccounts.classify(p, rep, buyingFor(p, rep)));
  return acctCache.get(k);
}
const ACCT_TABS = [
  {k:'eligible', l:'Eligible', sub:'In your book, brand can be sold there, not buying it yet'},
  {k:'buying',   l:'Already buying', sub:'Accounts the tracker shows on the brand'},
  {k:'high',     l:'High potential', sub:'Your biggest eligible accounts by 2026 cases — the fastest wins'},
  {k:'excluded', l:'Can’t sell here', sub:'In your book, but the brand is not sellable in that area'},
  {k:'closed',   l:'Completed', sub:'Placements the tracker credits to this rep — customer, product, date'},
];
const fmtCases = v => v==null ? '' : (v>=1000 ? Math.round(v).toLocaleString('en-US') : (Math.round(v*10)/10).toLocaleString('en-US')) + ' cases';
function acctRow(a, kind){
  const meta = [a.city, a.area || (a.rawArea && a.rawArea!=='Sales' ? a.rawArea : ''), a.prem ? a.prem+'-premise' : ''].filter(Boolean).join(' · ');
  const right = kind==='excluded' ? `<span class="awhy">${E(a.why||'')}</span>`
              : kind==='buying' ? `<span class="anote">${E(a.note||'')}</span>${a.cases!=null?`<span class="acases">${E(fmtCases(a.cases))}</span>`:''}`
              : `<span class="acases">${E(fmtCases(a.cases))}</span>`;
  return `<div class="arow${a.foreign?' foreign':''}"><div class="amain"><div class="aname">${E(a.name)}</div>${meta?`<div class="ameta">${E(meta)}</div>`:''}</div><div class="aright">${right}</div></div>`;
}
function accountsPanel(p, rep){
  if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) return `<div class="soon-note">Loading this month’s accounts…</div>`;
  const A = accountsFor(p, rep);
  const chanWord = p.channel==='on' ? 'on-premise' : p.channel==='off' ? 'off-premise' : '';
  const tabs = A.any ? ACCT_TABS.filter(t=>t.k==='eligible'||t.k==='high') : ACCT_TABS;
  const closedRows = closedFor(p, rep);
  const counts = {eligible:A.eligible.length, buying:A.buying.length, high:A.high.length, excluded:A.excluded.length + A.unknown.length, closed:closedRows.length};
  let tab = acctTabs[p.id] || 'eligible';
  if(!tabs.some(t=>t.k===tab)) tab = 'eligible';
  const rows = tab==='excluded' ? A.excluded.concat(A.unknown) : tab==='closed' ? closedRows : A[tab];
  const key = p.id+'|'+tab; const all = !!acctMore[key]; const LIMIT = 15;
  const shown = all ? rows : rows.slice(0, LIMIT);
  const tabMeta = tabs.find(t=>t.k===tab);
  const empty = {eligible: A.any ? 'No '+chanWord+' accounts in your book.' : (A.universe ? 'Every sellable account in your book is already buying — nothing left to open here.' : 'No '+chanWord+' accounts in your assigned book.'),
                 buying:'None of your accounts show on this brand yet.', high:'No eligible accounts with 2026 volume on file.', excluded:'None — the brand can be sold at every account in your book.', closed:''}[tab];
  const brandLine = A.any ? 'Any brand counts here, so every account in your book is in play.'
                  : `Brand${A.families.length>1?'s':''}: ${A.families.join(', ')} · Territory: ${A.territory.map(t=>t.split(': ')[1]).filter((v,i,arr)=>arr.indexOf(v)===i).join(' / ')}`;
  return `<div class="acct" data-prog="${E(p.id)}">
    <div class="asum"><strong>${A.universe}</strong> ${chanWord} account${A.universe===1?'':'s'} in your assigned book${A.any?'':` · <strong>${counts.eligible}</strong> eligible · <strong>${counts.buying}</strong> buying · <strong>${counts.excluded}</strong> can’t sell`}</div>
    <div class="abrand">${E(brandLine)}</div>
    <div class="atabs" role="tablist">${tabs.map(t=>`<button class="atab${t.k===tab?' active':''}" role="tab" data-act="acct-tab" data-prog="${E(p.id)}" data-tab="${t.k}">${E(t.l)}<span class="an">${counts[t.k]}</span></button>`).join('')}</div>
    <div class="asub lhead"><span>${E(tabMeta.sub)}${tab==='high'?' · top 10':''}</span>${rows.length>LIMIT ? moreBtn('acct-more', key, all, rows.length) : ''}</div>
    ${tab==='closed' ? closedLog(p, rep, {limit:all?9999:LIMIT, noMore:true}) : rows.length ? `<div class="alist">${shown.map(a=>acctRow(a, tab)).join('')}</div>` : `<div class="aempty">${E(empty)}</div>`}
    ${A.notes.length ? `<div class="anotes">${A.notes.map(n=>`<div>⚠ ${E(n)}</div>`).join('')}</div>` : ''}
    <div class="afoot">Book as of ${E(HubAccounts.asOf)} · buying lists from the tracker's data refreshed ${E(p.refreshed||'—')}</div>
  </div>`;
}

/* ====================================================================
   REP MODE -- the plan. Plain words, one list, no tables.
   ==================================================================== */
// What to sell, per program, in the words a rep would use on the floor.
// Fallback (any program not listed): the mapped brand families + the unit.
const SELL_ASK = {
  'inc:keystone_ice':'Place Keystone Ice 24oz cans.', 'inc:touchdowns_tea':'Place Sun Cruiser or Twisted Tea 12-packs in stores; sell cases into bars.',
  'inc:mabi_single_serve':'Sell in White Claw 19.2oz and Mike\'s Harder / Cayman Jack single serves.', 'inc:four_loko':'Place Four Loko Sour Apple or USA and sell cases.',
  'inc:lagunitas_sprint':"Place Lagunitas IPA or Little Sumpin' packages, or an IPA keg.", 'inc:famosa_oct':'Sell Famosa — every package.',
  'inc:sam_adams_cold_snap':'Convert the seasonal draft handle.', 'inc:industrial_arts':'Place 3 Industrial Arts SKUs, or a Wrench draft line.',
  'inc:evil_genius':"Place Stacy's Mom, Adulting or 867-5309.", 'inc:other_half':'Place Other Half core draft, or 3+ SKUs in a store.',
  'inc:montauk':'Place Wave Chaser cans or a Wave Chaser tap.', 'inc:sam_adams_conversion':'Switch the Summer Ale handle to Octoberfest.',
  'inc:printed_menu':'Get Bardstown or Green River on a printed menu.', 'inc:bardstown_display':'Build a 3-case Bardstown or Green River stack.',
  'inc:two_xo':'Place 2XO American Oak + French Oak together.', 'inc:1911':'Place a new 1911 cider SKU.', 'inc:woodchuck':'Place a new Woodchuck SKU.',
  'inc:tona':'Sell Tona 24oz cans.', 'inc:lytt':'Place 3 or more Lytt SKUs.', 'inc:le_grand_noir':'Sell Le Grand Noir.',
  'inc:garage_beer_president':'Sell more Garage Beer than last year.', 'inc:garage_beer_summer_sequel':'Sell Garage Beer.',
  'inc:mc_retention':'Keep Coors, Peroni and Blue Moon placed.', 'inc:constellation_fall':'Keep Corona, Modelo and Pacifico placed.',
  'inc:constellation_retention':'Keep Corona, Modelo and Pacifico placed.', 'inc:mabi_retention_fall':"Keep White Claw, Mike's and Cayman Jack placed.",
  'inc:mabi_retention':"Keep White Claw, Mike's and Cayman Jack placed.", 'inc:yuengling_retention_fall':'Keep Yuengling Lager and Flight placed.',
  'inc:yuengling_retention':'Keep Yuengling Lager and Flight placed.', 'inc:sun_cruiser':'Sell more Sun Cruiser than last year.',
  'inc:yave':'Open a new YaVe account.', 'inc:mollys':"Place Molly's 1.75L.", 'inc:path_to_victory':'Sell Victory Monkey 6-packs.', 'inc:path_to_victory_sd':'Open a new Victory Monkey 6-pack POD.', 'inc:fall_seasonal_sd':'Sell Fall Seasonal packages and kegs.',
  'inc:boston_beer':'Place an Angry Orchard or Dogfish Head tap.', 'inc:new_belgium':'Place a Juicy Haze or Two Hearted tap.',
  'inc:sam_adams':'Sell more Sam Adams than last Aug–Sep — finish positive and your commission doubles.', 'inc:new_belgium_distribution':"Sell more Bell's, Kirin and Voodoo.",
  'on:sam_adams_conversion':'Swap Summer Ale kegs for Oktoberfest at every account.', 'on:spirits_followup':'Re-order spirits at every account you placed in Jul–Sep.',
  'on:carbliss':'Open a new Carbliss account.', 'on:fever_tree':'Place Fever Tree.', 'on:bardstown_menu':'Get Bardstown or Green River on the menu.',
  'on:husa_xx_draft':'Place a Dos Equis tap.', 'on:angry_orchard':'Place an Angry Orchard tap.', 'on:molson_coors':'Place Peroni and Coors Banquet.',
  'on:wine_spirits':'Place YaVe and Leyenda.', 'on:sapporo_na':'Place Sapporo NA.',
  'off:constellation_gaintain':'Place Corona.', 'off:keystone_ice':'Place Keystone Ice 24oz cans.', 'off:fever_tree':'Place Fever Tree.',
  'off:wine_spirits_any':'Place a new wine or spirits SKU.', 'off:pos_stickers':'Put up a cooler door sticker and photograph it.',
  'off:constellation_innovation':'Place the Corona and Modelo innovation items.', 'off:mollys':'Place Molly\u2019s Irish Cream.', 'off:wine_new':'Place a new wine SKU.',
  'off:corona_premier':'Place Corona Premier suitcases.', 'off:bbc_lytt':'Place 3 or more Lytt SKUs.', 'off:disruptors':'Photograph Lytt POS in iSellBeer.',
  'off:molson_coors':'Place Peroni and Coors Banquet.', 'off:wine_spirits':'Place Le Grand Noir, Leyenda and Green River.',
  'off:new_belgium':"Place Bell's, Voodoo and Kirin.", 'off:ws_2xo':'Place 2XO, Le Grand and YaVe.', 'off:sapporo_light':'Place Sapporo Light.', 'off:famosa':'Place Famosa 7oz.',
};
const RETENTION = /retention|_fall$|mc_retention/;
function sellAsk(p){
  const k = HubAccounts.brandKey(p);
  if(SELL_ASK[k]) return SELL_ASK[k];
  const fams = HubAccounts.PROGRAM_BRANDS[k];
  if(fams && fams.length) return `Place ${fams.slice(0,3).join(', ')}${fams.length>3?' and more':''}.`;
  return 'See the program rules.';
}
// An eligible account with no purchase of the brand in the tracker's data.
// Worded for what the data can show (2026-10-04): the history has a start
// date, so it is never "never bought it".
const NO_BUY = 'No purchases in the available history';
const noBuyText = (why, p) => why===NO_BUY && p && p.refreshed ? `${NO_BUY} (tracker data refreshed ${p.refreshed})` : why;
// The tracker's own opportunity lists for this rep -- warm leads that
// should top the visit list: an account one SKU short, one oak short, a
// handle still pouring Summer Ale, a big account that has never bought it.
function warmTargets(p, rep){
  const out = [];
  const push = (name, why, warm)=>{ if(name) out.push({k:HubAccounts.norm(name), why, warm:!!warm}); };
  if(p.source==='inc'){
    const d = p.entry.getRep(rep); if(!d) return out;
    (d.partialAccounts||[]).forEach(it=>push(it.customer, `${it.need} SKU${it.need===1?'':'s'} short`, true));
    (d.offPremSingles||[]).forEach(it=>push(it.customer, 'Add the other oak', true));
    (d.onPremBuilding||[]).forEach(it=>push(it.customer, 'Needs a 2nd bottle', true));
    (d.unconvertedAccounts||[]).forEach(it=>push(it.account, 'Still on Summer Ale', true));
    if(d.encompass) (d.encompass.notConvertedAccounts||[]).forEach(it=>push(it.customer, 'Still on Summer Ale', true));
    Object.keys(d).forEach(k=>{ if(/Targets$|Whitespace$/.test(k) && Array.isArray(d[k])) d[k].forEach(it=>push(it.customer, NO_BUY, false)); });
    return out;
  }
  const slot = mpoState[p.source] && mpoState[p.source][p.monthKey]; const D = slot && slot.DATA; const d = D && D[p.key]; if(!d) return out;
  const sets = d.subs ? d.subs : [d];
  sets.forEach(sd=>{ const t = sd.targetsByRep && sd.targetsByRep[rep]; if(t) t.forEach(it=>push(it.customer, it.product ? `Missing ${it.product}` : NO_BUY, false)); });
  return out;
}
// Prioritised visit list: warm leads first, then the biggest eligible
// accounts. Every row is in the rep's book and in territory (accounts.js
// already removed the rest); retention programs list the accounts to HOLD.
function nextAccounts(p, rep){
  const A = accountsFor(p, rep);
  if(RETENTION.test(p.key)) return {rows: A.buying.filter(a=>!a.foreign).map(a=>Object.assign({}, a, {why: 'Keep ordering'})), hold:true, A};
  const byKey = new Map(); A.eligible.forEach(a=>byKey.set(HubAccounts.norm(a.name), a)); A.buying.forEach(a=>byKey.set(HubAccounts.norm(a.name), a));
  const warm = warmTargets(p, rep); const seen = new Set(); const rows = [];
  warm.filter(w=>w.warm).forEach(w=>{ const a = byKey.get(w.k); if(a && !seen.has(w.k)){ seen.add(w.k); rows.push(Object.assign({}, a, {why:w.why, warm:true})); } });
  const cold = new Map(); warm.filter(w=>!w.warm).forEach(w=>{ if(!cold.has(w.k)) cold.set(w.k, w.why); });
  A.eligible.forEach(a=>{ const k = HubAccounts.norm(a.name); if(seen.has(k)) return; seen.add(k);
    rows.push(Object.assign({}, a, {why: cold.get(k) || (p.type==='MPO' ? `No qualifying purchase in ${(p.objective&&p.objective.periodText)||'this period'}` : NO_BUY)})); });
  // FOLLOW-UP objectives score against the rep's own BASE list (a Summer Ale
  // account, a Q3 spirits placement, a core on-premise account), so only those
  // base accounts still to do are targets -- not every account the brand could
  // be sold to.
  if(p.source!=='inc' && p.objective && p.objective.type==='followup'){
    const slot = mpoState[p.source] && mpoState[p.source][p.monthKey]; const D = slot && slot.DATA;
    const fr = D && D[p.key] && (D[p.key].reps||[]).find(x=>x.rep===rep);
    if(fr){
      // The rows ARE the base accounts still to do (named from the tracker's own
      // list), borrowing city / area / cases from the rep's book when it has the
      // account -- the brand-eligibility rules do not apply to a follow-up.
      const book = new Map(); (HUB_ACCOUNTS.reps[rep]||[]).forEach(a=>{ book.set(HubAccounts.norm(a.name), a); if(a.n!=null) book.set(String(a.n), a); });
      const keep = (fr.lines||[]).filter(l=>!l.done).map(l=>{
        const a = book.get(String(l.num)) || book.get(HubAccounts.norm(l.customer));
        return Object.assign({}, a || {name:l.customer, n:l.num, city:'', area:'', prem:'', cases:null}, {why: l.had || NO_BUY});
      });
      return {rows: keep, hold:false, A};
    }
  }
  return {rows, hold:false, A};
}
/* ---- Closed / Completed: the placements the tracker already credits ---- */
const CLOSED_KEY = /New$|newPod|^accountList$|convertedSinceReport|^convertedAccounts$|gainedAccounts|buyingAccounts|sixPackAccounts|nineteenTwoAccounts|onPremAccounts|^lines$|Rebuy$|^rebuy$|^draftNewLines$|^draftAccounts$/;
const parseAny = s => parseUS(s) || parseISO(s);
function closedFor(p, rep){
  const out = []; const seen = new Set();
  // A blank product means the tracker counts the account, not a SKU -- name
  // the brand the program pays on so the row still says what was placed.
  const fams = HubAccounts.PROGRAM_BRANDS[HubAccounts.brandKey(p)];
  const brand = (fams && fams.length) ? fams[0] : '';
  const add = (customer, product, date, note, photo)=>{
    if(!customer) return;
    product = String(product||'');
    if(!product) product = brand || (fams===null ? '' : p.shortName||'');
    else if(brand && /^[\d.,]+\s*(cases?|SKUs?|bbl|bottles?)\b/i.test(product)) product = brand+' · '+product;   // a quantity, not a SKU name
    const k = HubAccounts.norm(customer)+'|'+HubAccounts.norm(product)+'|'+(date||'');
    if(seen.has(k)) return; seen.add(k);
    const when = date ? parseAny(date) : null;
    out.push({customer:String(customer), product, date: when ? fmtDay(when) : (date||''), when, note:note||'', photo: photo ? String(photo) : ''});
  };
  if(p.source==='inc'){
    const d = p.entry.getRep(rep); if(!d) return out;
    const walk = (obj, depth)=>{
      if(!obj || typeof obj!=='object' || depth>4) return;
      Object.keys(obj).forEach(k=>{
        const v = obj[k];
        if(Array.isArray(v)){
          const take = CLOSED_KEY.test(k) && !NOT_BUY.test(k);
          v.forEach(it=>{
            if(!it || typeof it!=='object') return;
            if(take){
              const cust = it.customer || it.name || it.account;
              if(k==='draftAccounts' && it.status && it.status!=='new') return;
              const note = /Rebuy$|^rebuy$/.test(k) ? 'reorder' : (/^converted/.test(k) ? 'converted' : (k==='gainedAccounts' ? 'new line' : ''));
              if(Array.isArray(it.products) && it.products.length){
                it.products.forEach(pr=>{ if(typeof pr==='string') add(cust, pr, it.date, note); else if(pr) add(cust, pr.product, pr.date||it.date, note); });
              } else {
                const prod = it.product || (it.brands && it.brands.join(', ')) || (it.tier ? 'Wave Chaser '+it.tier : '') || (it.brand ? it.brand+(it.package?' · '+it.package:'') : '')
                  || (it.skus!=null ? it.skus+' SKU'+(it.skus===1?'':'s') : '') || (it.skuCount!=null ? it.skuCount+' SKUs' : '') || (it.bottles ? it.bottles+' bottles' : '')
                  || (it.bbl ? it.bbl+' bbl on tap' : '') || (it.cases ? Math.round(it.cases)+' cases' : '') || '';
                add(cust, prod, it.date || it.lastDate || '', note);
              }
            }
            walk(it, depth+1);
          });
        } else if(v && typeof v==='object') walk(v, depth+1);
      });
    };
    walk(d, 0);
  } else {
    const slot = mpoState[p.source] && mpoState[p.source][p.monthKey]; const D = slot && slot.DATA;
    if(!D || !D[p.key]) return out;
    const d = D[p.key]; const sets = d.subs ? d.subs.map(sd=>({sd, label:sd.label})) : [{sd:d, label:''}];
    const t = p.objective.type;
    const photoRows = new Map(), photoList = [];
    sets.forEach(({sd, label})=>{
      const r = (sd.reps||[]).find(x=>x.rep===rep); if(!r || !Array.isArray(r.lines)) return;
      r.lines.forEach(l=>{
        if(!l || !l.customer) return;
        // iSellBeer-verified objectives (cooler door stickers, the Bardstown
        // menu) carry the photo URL on the line; it rides along so the row can
        // open the picture, exactly as the MPO board's "View Photo" does.
        const photo = l.photo || (Array.isArray(l.photos) && l.photos[0]) || '';
        if(t==='photos'){
          // One photo = one sticker / one POS pic (the board counts DISTINCT
          // photos): several brand rows share a photo, so fold them into one
          // row naming every brand, and the log count matches the card.
          if(photo && photoRows.has(photo)){ const pr = photoRows.get(photo); if(l.brand && !pr.brands.includes(l.brand)) pr.brands.push(l.brand); return; }
          const pr = {customer:l.customer, brands: l.brand ? [l.brand] : [], detail:l.detail||'', date:l.date, photo};
          if(photo) photoRows.set(photo, pr); photoList.push(pr);
        }
        else if(t==='new_placements'){ if(l.isNew) add(l.customer, l.product, '', l.current ? l.current+' placement'+(l.current===1?'':'s') : '', photo); }
        else if(t==='pct_of_base') add(l.customer, l.product, '', 'on the shelf', photo);
        else if(t==='followup'){ if(l.done) add(l.customer, l.doneDetail, l.doneDate, '', ''); }
        else if(l.new_buyer==='1') add(l.customer, l.product || label, l.date, '', photo);
      });
    });
    photoList.forEach(pr=>add(pr.customer, [pr.brands.join(', '), pr.detail].filter(Boolean).join(' · '), pr.date, 'photo', pr.photo));
  }
  // The same placement can appear twice in a card's data, once dated and
  // once not (a draft line in draftNew and in draftAccounts): keep the dated one.
  const dated = new Set(out.filter(r=>r.when).map(r=>HubAccounts.norm(r.customer)+'|'+HubAccounts.norm(r.product)));
  const rows = out.filter(r=>r.when || !dated.has(HubAccounts.norm(r.customer)+'|'+HubAccounts.norm(r.product)));
  rows.sort((a,b)=>((b.when?b.when.getTime():0)-(a.when?a.when.getTime():0)) || a.customer.localeCompare(b.customer));
  return rows;
}
/* ====================================================================
   v14, 2026-09-11 -- dollars out, distribution in, one account list.
   ==================================================================== */
// A program whose result is MONEY is not something a rep can go place, and
// Gavin does not want dollars on the rep page. Read off the tracker's own
// summary text, so a new dollar program disappears without a code change --
// the trackers themselves and Manager Mode keep every figure.
// v16, 2026-09-17: judged on the METRIC (headline, goal, still-needed), not
// the one-line sub under it. Other Half's headline is "N accounts opened" --
// a field metric -- but its sub reads "$7,790 earned", and testing the sub
// took the whole program off every rep's page (Gavin: "the program fell
// off"). The sub is scrubbed for Rep Mode by subNoMoney() below instead.
const isDollarProgram = r => !!r && /\$/.test([r.now, r.goal, r.remain].filter(Boolean).join(' '));

/* ---- v15, 2026-09-14 -- NO DOLLAR FIGURES IN REP MODE ----------------
   Gavin: "remove any $ figures that have to do with the hub dashboard. i
   dont want to create discrepancies." A dollar amount on a rep card is a
   second copy of a number this page never computed -- it can only ever
   agree with the tracker by luck, and a rep who reads two amounts trusts
   neither. v14 already kept whole dollar PROGRAMS off Rep Mode
   (isDollarProgram above); what stayed behind was the RATE text their
   neighbours carry, in the rule bullets ("$15 for every new placement")
   and the next-move line ("every new 12pk placement pays $15").

   These take the money OUT of that prose and leave what a rep can act on
   -- the placement, the pack size, the minimum -- rather than deleting
   the bullet and losing the rule with it. A bullet that was only ever
   about money (a tier table, a prize split) returns null and is dropped.
   MANAGER MODE AND BOTH TRACKERS ARE UNTOUCHED: every figure still lives
   there, which is the point -- one place computes the money.
   Checked against all 73 dollar-carrying bullets in the tracker library
   on 2026-09-14: 69 rewritten, 4 dropped, none left carrying a "$".   */
const MONEY_PAT  = '\\$\\s?[\\d,]+(?:\\.\\d+)?(?:\\s*[\u2013\u2014-]\\s*\\$?\\s?[\\d,]+(?:\\.\\d+)?)?\\+?';
const MONEY_ONE  = new RegExp(MONEY_PAT);
const MONEY_RATE = new RegExp('^\\s*(?:up to\\s+|another\\s+|then\\s+|plus\\s+)?' + MONEY_PAT +
                              '(?:\\s*\\/\\s*[A-Za-z.]+)?\\s*(?:per|for every|for|on)?\\s+', 'i');
const MONEY_PAYS = new RegExp('\\b(pays|pay|paying|earns|earn|adds|add)\\s*(?:out\\s*)?' +
                              '(?:<strong>)?\\s*' + MONEY_PAT + '\\s*(?:<\\/strong>)?\\s*(?:each|instead|apiece)?', 'gi');
const MONEY_AND  = new RegExp('\\s+and\\s+(?:<strong>)?\\s*' + MONEY_PAT +
                              '\\s*(?:<\\/strong>)?\\s*(?:each|apiece)?', 'gi');
const MONEY_XTRA = new RegExp('\\s+(?:for|earns?|pays?|adds?)\\s+(?:an\\s+extra|another|an\\s+additional)\\s+' +
                              '(?:<strong>)?\\s*' + MONEY_PAT + '\\s*(?:<\\/strong>)?', 'gi');
const MONEY_LABEL = /^\s*([A-Za-z][A-Za-z0-9\-\/ ]{0,24}:)\s*/;
const CONNECTOR   = /^\s*(?:then|plus|and|also|another)\s+/i;
const hasMoney = s => !!s && MONEY_ONE.test(String(s));
// "pays $15" -> "counts", "pay $3" -> "count" (a plural subject must not end
// up reading "the SKUs counts"). A prize -- "earns $300" -- is not a per-unit
// count, so it stays a bonus.
const moneyVerb = v => /^(earn|add)/i.test(v) ? (/s$/i.test(v) ? 'earns a bonus' : 'earn a bonus')
                                              : (/s$/i.test(v) ? 'counts' : 'count');
const moneyTidy = t => t
  .replace(/\b(counts|bonus)(?=[A-Za-z\u201c"'(\u2014\u2013])/g, '$1 ')
  .replace(/\b(pays?|earns?)\s+out\s*(?=[.,;]|$)/gi, '')
  .replace(/\bcounts?\s+instead\b/gi, m => m.split(/\s+/)[0])
  .replace(/\s+and\s+[^.;\u00b7]*$/i, m => /\bcounts?\b/i.test(m) ? m : '')
  .replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim();
const moneyScrub = t => moneyTidy(String(t).replace(MONEY_XTRA, '').replace(MONEY_AND, '')
                                           .replace(MONEY_PAYS, (m, v) => moneyVerb(v)));
// One rule bullet without its money, or null when the bullet was only money.
function ruleNoMoney(s){
  if(!hasMoney(s)) return s;
  const lm = String(s).match(MONEY_LABEL);
  const label = lm ? lm[1] + ' ' : '';
  const body  = lm ? String(s).slice(lm[0].length) : String(s);
  const segs = body.split('\u00b7').map(part=>{
    let t = moneyScrub(part.trim().replace(CONNECTOR, ''));
    if(MONEY_RATE.test(t)) t = t.replace(MONEY_RATE, '').trim();
    if(hasMoney(t)) t = t.split(/\s+[\u2014\u2013]\s+|;\s+|,\s+and\s+/).filter(x=>x && !hasMoney(x)).join(' \u2014 ');
    t = moneyTidy(t);
    return t && !/^(and|or|per|for|the|a|an|counts?)$/i.test(t) ? t : null;
  }).filter(Boolean);
  if(!segs.length) return null;
  let out = segs.join(' \u00b7 ');
  if(!label) out = out.charAt(0).toUpperCase() + out.slice(1);
  return (label + out).trim();
}
// The one-line sub under a headline ("$7,790 earned", "12 cases · $180").
// Segment by segment: a money segment is dropped, and when nothing is left
// the card falls back to its own caption ("So far"). Rep Mode only -- see
// repSub(); Manager Mode shows the tracker's line as written.
function subNoMoney(s){
  if(!hasMoney(s)) return s || '';
  return String(s).split('\u00b7').map(x=>x.trim()).filter(x=>x && !hasMoney(x)).join(' \u00b7 ');
}
const repSub = r => isMgr() ? (r.sub || '') : subNoMoney(r.sub);
// The next-move line is a whole sentence (and carries <strong> markup), so it
// is scrubbed in place rather than reshaped into a fragment.
function nextNoMoney(s){
  if(!hasMoney(s)) return s;
  let t = moneyScrub(s);
  if(MONEY_RATE.test(t)){ t = t.replace(MONEY_RATE, ''); t = t.charAt(0).toUpperCase() + t.slice(1); }
  if(hasMoney(t)){
    const parts = t.split(/\s+[\u2014\u2013]\s+/).filter(x=>!hasMoney(x));
    t = parts.length ? parts.join(' \u2014 ') : t.replace(new RegExp(MONEY_PAT, 'g'), '');
  }
  return moneyTidy(t).replace(/[,;\u2014\u2013]\s*$/, '').replace(/(^|[^.])$/, '$1.');
}
// Rep Mode's rule list: the tracker's bullets with the money taken out.
const repRules = p => ((p && p.rules) || []).map(ruleNoMoney).filter(Boolean);
const repRulesHtml = (p, cls) => { const R = repRules(p);
  return R.length ? `<ul class="${cls}">${R.map(x=>`<li>${E(x)}</li>`).join('')}</ul>` : ''; };

// name / account number -> the rep's own customer-base row.
const bookCache = new Map();
function bookIndex(rep){
  if(bookCache.has(rep)) return bookCache.get(rep);
  const m = new Map();
  ((typeof HUB_ACCOUNTS!=='undefined' && HUB_ACCOUNTS.reps[rep]) || []).forEach(a=>{
    m.set(HubAccounts.norm(a.name), a);
    if(a.n!=null) m.set(String(a.n), a);
  });
  bookCache.set(rep, m);
  return m;
}
// CURRENT-PERIOD DISTRIBUTION: the credited lines the tracker publishes for
// this rep on this program (closedFor, which reads only that program's own
// period), with account number, town and territory filled in from the rep's
// book. Nothing is recomputed here.
function distFor(p, rep){
  const idx = bookIndex(rep);
  return closedFor(p, rep).map(x=>{
    const a = idx.get(HubAccounts.norm(x.customer));
    return {name:x.customer, n: a?a.n:null, city: a?a.city:'', area: a?(a.area||a.rawArea):'',
            what:x.product, date:x.date, note:x.note, photo:x.photo};
  });
}
// HOW FAR THIS LIST RECONCILES. The trackers publish a summary number AND,
// for some programs, the lines behind it -- but they are not the same feed.
// Measured 2026-09-11 for one rep: Sam Adams Conversion read 39 with 50
// published lines; 1911 read 3 with 8 lines across 3 accounts; several
// programs publish a number and no lines at all. So the label states the
// count, says so when it genuinely reconciles, and otherwise says plainly
// that it does not, rather than implying a tie-out that is not there.
function reconLine(p, r, rows){
  const lines = rows.length;
  const accts = new Set(rows.map(x=>HubAccounts.norm(x.name))).size;
  const base = `${plw(lines,'credited line')} across ${plw(accts,'account')}`;
  const cur = (r && typeof r.valueNum==='number') ? Math.round(r.valueNum) : null;
  if(cur!=null && (cur===lines || cur===accts)) return {t:`${base} — matches your current result of ${E(r.now||cur)}.`, ok:true};
  return {t:`${base}. Your current result (${E((r&&r.now)||'—')}) is calculated from the supplier’s own feed, so it will not always equal this count.`, ok:false};
}

// ONE ACCOUNT LIST, TWO LAYOUTS. A grid with a header row on a desktop,
// a stacked card per account on a phone (.alist / .ar in hub.css). No
// <table>, so nothing scrolls sideways and no two columns can run together.
const SHOW_FIRST = 10;
const secMore = {};   // "<program id>|<section>" -> showing every row
// THE SHOW ALL / SHOW FEWER TOGGLE lives in the list's HEADER, top right,
// never under the list (Gavin 2026-09-16: a rep with 90 accounts had to
// scroll the whole list to find "Show fewer"). Every long list on the hub
// -- potential accounts, credited distribution, the visit list, the
// completed log, the manager account tabs -- renders its toggle through
// this one builder, sitting beside the list's title in a .lhead row.
function moreBtn(act, key, all, n, word){
  return `<button class="amore top" data-act="${act}" data-key="${E(key)}" aria-expanded="${all?'true':'false'}">${all ? 'Show fewer' : 'Show all '+n+(word?' '+word:'')}</button>`;
}
// The toggle for an acctList() -- rendered by the CALLER, in its section
// header, so the list itself carries no button.
function listMore(key, rows){
  return rows.length > SHOW_FIRST ? moreBtn('sec-more', key, !!secMore[key], rows.length, rows.length===1?'account':'accounts') : '';
}
// opts {prog, rep}: a target list the signed-in rep may mark (write-back,
// 2026-09-25) -- follow-ups float up, Done / Not now fold away below, and
// every row carries the control strip as an extra full-width cell.
function acctList(key, cols, rows, opts){
  if(!rows.length) return '';
  const T = opts && opts.prog ? raSplit(opts.prog, opts.rep, rows) : null;
  const wb = !!(T && T.on);
  const live = wb ? T.live : rows;
  // A column every row leaves blank is noise -- "Date: —" on every card of a
  // program the tracker publishes no dates for. Drop it, on both layouts.
  cols = cols.filter((c,i)=>i===0 || rows.some(rw=>{ const v=c.get(rw); return v!=null && v!==''; }));
  const all = !!secMore[key];
  const shown = all ? live : live.slice(0, SHOW_FIRST);
  const head = `<li class="ar ar-h">${cols.map(c=>`<span class="ar-c${c.num?' num':''}">${E(c.label)}</span>`).join('')}</li>`;
  const row = rw => `<li class="ar${wb ? raRowCls(opts.prog, rw, T.show) : ''}">${cols.map((c,i)=>{
      const v = c.get(rw);
      const inner = (v==null||v==='') ? '—' : (c.raw ? v : E(v));
      return i===0
        ? `<span class="ar-c ar-name">${inner}${wb ? raTag(opts.prog, rw, T.edit, T.show) : ''}</span>`
        : `<span class="ar-c${c.num?' num':''}${c.cls?' '+c.cls:''}" data-l="${E(c.short==null?c.label:c.short)}">${inner}</span>`;
    }).join('')}${wb ? (()=>{ const st = raStrip(opts.prog, rw, T.edit, T.show); return st ? `<span class="ar-c ar-act" data-l="">${st}</span>` : ''; })() : ''}</li>`;
  // Track widths ride on the element so a 4-, 5- or 6-column list all line up.
  // The Show all / Show fewer toggle is listMore(), placed by the caller.
  const style = `--cols:${cols.map(c=>c.w||'minmax(120px,1fr)').join(' ')}`;
  const list = (rs, withHead) => rs.length ? `<ul class="alist" style="${style}">${withHead?head:''}${rs.map(row).join('')}</ul>` : '';
  if(!wb) return list(shown, true);
  const fold = (rs, status) => { if(!rs.length) return ''; const fk = opts.prog.id+'|'+key+'|'+status;
    return `<details class="plan-fold ${status}" data-fold="${E(fk)}"${raFoldOpen.has(fk)?' open':''}><summary>${RA_MARK[status]} ${E(RA_LABEL[status])} · ${rs.length}</summary>${list(rs, false)}</details>`; };
  const none = live.length ? '' : `<div class="aempty">${T.done.length===rows.length ? 'Every account here is marked done.' : 'Every account here is marked done or set aside — reopen one below if plans change.'}</div>`;
  return raNotes(T.show, T.edit, rows, T.follow.length+T.later.length+T.done.length) + list(shown, true) + none + fold(T.later, 'skip') + fold(T.done, 'done');
}
// How many of a target list are still open once the rep's marks are applied.
const raLive = (p, rep, rows) => rows ? raSplit(p, rep, rows).live : rows;
const ACCT_COLS = {
  targets: [
    {label:'Account',          w:'minmax(150px,1.7fr)', get:x=>x.name},
    {label:'Acct #',           w:'86px', short:'Account #', get:x=>x.n!=null?String(x.n):''},
    {label:'Town · Territory', w:'minmax(120px,1fr)', get:x=>[x.city, x.area || x.rawArea].filter(Boolean).join(' · ')},
    // "2026 cases" and "Why it is an opportunity" used to be the fourth and
    // fifth columns here. Both removed on every program per Gavin (2026-09-15:
    // redundant), along with the same gap line on the Rep Mode visit list and
    // the MPO card preview. The why/cases fields stay on the row data for sorting.
  ],
  dist: [
    {label:'Account',           w:'minmax(150px,1.6fr)', get:x=>x.name},
    {label:'Acct #',            w:'86px', short:'Account #', get:x=>x.n!=null?String(x.n):''},
    {label:'Town · Territory',  w:'minmax(120px,1fr)', get:x=>[x.city, x.area].filter(Boolean).join(' · ')},
    // "· photo" beside a View photo button is noise -- drop that one note.
    {label:'What was credited', w:'minmax(150px,1.6fr)', short:'Credited',
     get:x=>[x.what, (x.note==='photo' && x.photo) ? '' : x.note].filter(Boolean).join(' · ')},
    {label:'Date',              w:'96px', get:x=>x.date},
    // Photo-verified objectives (off-prem cooler doors, the on-prem Bardstown
    // menu, Lytt POS pics) carry the picture on the line. v14 dropped this
    // link when the credited log became the distribution list -- restored,
    // and it is the only reason a rep can check their own MPO photo.
    {label:'Photo', w:'104px', short:'', raw:true, cls:'ar-photo',
     get:x=>x.photo ? `<a href="${E(x.photo)}" target="_blank" rel="noopener">View photo ›</a>` : ''},
  ],
};
// The two expanders every rep-mode card carries, collapsed until asked.
const cardSec = {};   // program id -> 'dist' | 'targets' (one open at a time)
const SEC_LABEL = {dist:'Credited accounts', targets:'Potential accounts'};
function secLinks(p, sec, counts){
  const btn = (k, n)=>n==null ? '' :
    `<button class="seclink${sec===k?' on':''}" data-act="card-sec" data-prog="${E(p.id)}" data-sec="${k}" aria-expanded="${sec===k?'true':'false'}">${sec===k?'Hide':'View'} ${E(SEC_LABEL[k])}${n?` <span class="seclink-n">${n}</span>`:''}<span class="seclink-ar">${sec===k?'▴':'▾'}</span></button>`;
  const html = btn('dist', counts.dist) + btn('targets', counts.targets);
  return html ? `<div class="seclinks">${html}</div>` : '';
}
const logMore = {};
function closedLog(p, rep, opts){
  opts = opts || {};
  if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) return `<div class="soon-note">Loading…</div>`;
  const rows = closedFor(p, rep);
  const key = p.id+'|log'; const all = !!logMore[key]; const LIMIT = opts.limit || 12;
  const shown = all ? rows : rows.slice(0, LIMIT);
  if(!rows.length){
    const why = p.type==='MPO' && p.objective.type==='pct_of_goal' ? 'This report counts placements by product, not by account.'
      : (p.manual ? 'Checked by hand — nothing is logged here.' : 'Nothing placed yet for this program.');
    return `<div class="log"><div class="aempty">${E(why)}</div></div>`;
  }
  return `<div class="log">
    <div class="log-s lhead"><span>${plw(rows.length, 'placement')} the tracker credits to you${rows.some(r=>r.when)?', newest first':''}.</span>${rows.length>LIMIT && !opts.noMore ? moreBtn('log-more', key, all, rows.length) : ''}</div>
    <ol class="log-list">${shown.map(r=>`<li class="log-row"><div class="log-main"><div class="log-cust">${E(r.customer)}</div>${r.product?`<div class="log-prod">${E(r.product)}</div>`:''}${r.note?`<div class="log-note">${E(r.note)}</div>`:''}</div><div class="log-right"><div class="log-date">${E(r.date||'—')}</div>${r.photo?`<a class="log-photo" href="${E(r.photo)}" target="_blank" rel="noopener">View photo <span class="ar">›</span></a>`:''}</div></li>`).join('')}</ol>
  </div>`;
}
const cardTab = {};   // program id -> 'sell' | 'closed'
const planMore = {};
/* ---- Brand-family goals: the retention programs' breakdown ---- */
// One list per side (off-premise, on-premise packages, draft ...) of
// {label, now, goal, need, held, pct}. Read straight from each tracker's
// per-rep data; nothing recomputed except "need" and the bar. A family
// with no goal (MABI's one-goal program, a summer package list) still
// shows its number with a plain status line so nothing is hidden.
// The products inside one goal row. A SKU with its own goal gets the same
// current / goal / bar treatment the category gets; one without (either a
// brand-new SKU, or an export that only goals at the category level) shows
// its current distribution and says which.
function skuRows(products, unit){
  return (products||[]).map(p=>{
    const now = p.placements||0, goal = p.goal||null;
    return {label:p.product, now, goal, unit,
      need: goal ? Math.max(0, goal-now) : null,
      held: goal ? now>=goal : null,
      lost: !!(goal && now===0),
      pct: goal ? Math.min(100, now/goal*100) : null};
  });
}
function brandGoals(p, rep){
  if(p.source!=='inc') return [];
  const d = p.entry.getRep(rep); if(!d) return [];
  const row = (label, now, goal, unit) => { now = now||0; const has = goal!=null && goal>0;
    return {label, now, goal: has ? goal : null, unit, need: has ? Math.max(0, goal-now) : null, held: has ? now>=goal : null, pct: has ? Math.min(100, now/goal*100) : null}; };
  const G = [];
  const push = (title, unit, rows) => { if(rows && rows.length) G.push({title, unit, rows}); };
  switch(p.key){
    case 'mc_retention':
      push('Off-Premise', 'placements', (d.offBrands||[]).map(b=>row(b.label, b.actual, b.goal, 'placements')));
      push('On-Premise Draft', 'buyers', (d.onBrands||[]).map(b=>row(b.label, b.actual, b.goal, 'buyers')));
      break;
    case 'constellation_fall':
      // Product level, per Gavin 2026-09-11: a category is a bag of SKUs and
      // each SKU carries its own base, so Corona Gaintain opens to the
      // products inside it with their own current / goal. The zero rows stay
      // -- a SKU placed last fall and not reordered IS the shortfall.
      push('Off-Premise', 'placements', (d.offCategories||[]).filter(c=>c.goal||c.placements).map(c=>{
        const r = row(c.label, c.placements, c.goal, 'placements');
        r.products = skuRows(c.products, 'placements');
        return r; }));
      push('On-Premise Packages', 'buyers', ((d.on_packages||{}).families||[]).map(f=>row(f.label, f.buyers, f.goal, 'buyers')));
      push('On-Premise Draft', 'buyers', ((d.on_draft||{}).families||[]).map(f=>row(f.label, f.buyers, f.goal, 'buyers')));
      break;
    case 'yuengling_retention_fall':
      push('Off-Premise', 'buyers', (d.offBrands||[]).map(b=>row(b.label, b.actual, b.goal, 'buyers')));
      push('On-Premise Packages', 'buyers', (d.packagesBrands||[]).map(b=>row(b.label, b.actual, b.goal, 'buyers')));
      push('On-Premise Draft', 'on tap', (d.draftBrands||[]).map(b=>{ const r = row(b.label, b.actual, b.goal, 'on tap');
        // The draft account sheet says who is pouring, who is flagged with no
        // keg, and who poured last fall but is not back -- the win-back list.
        const A = b.accounts||[]; const lost = A.filter(a=>a.status==='lost'), empty = A.filter(a=>a.status==='empty');
        const bits = []; if(lost.length) bits.push(`${lost.length} from last fall not back yet`); if(empty.length) bits.push(`${empty.length} flagged with no keg`);
        r.extra = bits.join(' · '); r.winback = lost.map(a=>a.customer.replace(/^\d+\s+/, '')); return r; }));
      break;
    case 'mabi_retention_fall':
      // Per-brand goals since 2026-09-21 (Gavin: same format as Constellation
      // / Yuengling / Molson Coors): the workbook's own 90% goal for each MADE
      // family, so every row reads current / goal with a bar. A family the
      // workbook set no goal for (Mxd Cocktails) still counts toward the
      // rep's single MADE goal and says so.
      push('MADE brand families', 'placements', (d.brands||[]).map(b=>row(b.brand, b.placements, b.goal, 'placements')));
      break;
    case 'constellation_retention':
      // Same product breakdown, but this window's export carries no per-SKU
      // base -- the goal is the category total only -- so the products show
      // current distribution and say so rather than faking a bar.
      push('Off-Premise', 'placements', (d.offCategories||[]).map(c=>{
        const r = row(c.label, c.placements, c.goal, 'placements');
        r.products = skuRows(c.products, 'placements');
        r.productsNote = 'This period sets the goal by category, not by product.';
        return r; }));
      push('On-Premise Packages', 'buyers', (d.onPkgBrands||[]).map(b=>row(b.label, b.buyers, null, 'buyers')));
      break;
    case 'yuengling_retention':
      push('Off-Premise', 'placements', ((d.off||{}).brands||[]).map(b=>row(b.label, b.placements, b.goal, 'placements')));
      push('On-Premise Packages', 'placements', ((d.onPkg||{}).brands||[]).map(b=>row(b.label, b.placements, b.goal, 'placements')));
      break;
  }
  return G;
}
// The product breakdown that hangs off one goal row: closed by default so a
// rep still reads the card in one glance, and opens to every SKU inside the
// goal with its own current / goal. SKUs short of their goal are listed first
// by the generator, so the top of the list is the call list.
function skuHtml(r){
  const P = r.products || [];
  if(!P.length) return '';
  const goaled = P.filter(x=>x.goal!=null);
  const held = goaled.filter(x=>x.held).length;
  const lost = goaled.filter(x=>x.lost).length;
  const sum = goaled.length
    ? `${held} of ${goaled.length} product goal${goaled.length===1?'':'s'} held${lost?` · ${lost} not reordered yet`:''}`
    : `${P.length} product${P.length===1?'':'s'} in this goal`;
  return `<details class="bg-sku"><summary>${E(sum)}</summary>
    ${r.productsNote ? `<div class="bg-skunote">${E(r.productsNote)}</div>` : ''}
    <div class="bg-skulist">${P.map(x=>{
      const cls = x.goal==null ? 'nogoal' : x.held ? 'held' : x.lost ? 'zero' : (x.pct>=75 ? 'close' : 'building');
      const st = x.goal==null ? 'Currently placed' : x.held ? '\u2713 Held' : x.lost ? 'Not reordered yet' : `${x.need.toLocaleString('en-US')} more needed`;
      return `<div class="bg-sku-row ${cls}">
        <div class="bg-sku-top"><span class="bg-sku-name">${E(x.label)}</span><span class="bg-sku-nums">${x.now.toLocaleString('en-US')}${x.goal!=null?` <span class="bg-sep">/</span> ${x.goal.toLocaleString('en-US')}`:''}</span></div>
        ${x.goal!=null ? `<div class="bg-sku-bar"><div class="bg-sku-fill" style="width:${Math.max(x.pct, x.pct>0?3:0)}%"></div></div>` : ''}
        <div class="bg-sku-st">${E(st)}</div>
      </div>`; }).join('')}</div>
  </details>`;
}
function brandGoalsHtml(groups, opts){
  opts = opts || {};
  const many = groups.length > 1;
  const oneGoal = opts.oneGoal || '';
  return `<div class="bg">
    ${opts.noTitle ? '' : `<div class="bg-h">Your brand goals</div>`}
    ${groups.map(g=>{ const goaled = g.rows.filter(r=>r.goal!=null), held = goaled.filter(r=>r.held).length;
      const cls = /Off/.test(g.title) ? 'off' : /Draft/.test(g.title) ? 'draft' : /On/.test(g.title) ? 'on' : 'any';
      const ic = cls==='off' ? '🏪' : cls==='draft' ? '🍻' : cls==='on' ? '🍺' : '📦';
      const count = goaled.length ? `${held} of ${goaled.length} held` : `${g.rows.length===1?'1 family':g.rows.length+' families'}`;
      return `${many || cls!=='any' ? `<div class="bg-side ${cls}"><span class="bg-side-ic">${ic}</span><span class="bg-side-t">${E(g.title)}</span><span class="bg-side-n${goaled.length && held===goaled.length?' ok':''}">${count}</span></div>` : ''}
      <div class="bg-list">${g.rows.map(r=>{
        const st = r.goal==null ? (oneGoal ? `Counts toward your ${E(oneGoal)} goal` : 'No goal for this one')
                 : r.held ? '✓ Retained' : `${r.need.toLocaleString('en-US')} more needed`;
        const cls = r.goal==null ? 'nogoal' : r.held ? 'held' : (r.pct>=75 ? 'close' : r.pct>0 ? 'building' : 'zero');
        return `<div class="bg-row ${cls}">
          <div class="bg-top"><span class="bg-name">${E(r.label)}</span><span class="bg-nums">${r.now.toLocaleString('en-US')}${r.goal!=null?` <span class="bg-sep">/</span> ${r.goal.toLocaleString('en-US')}`:''} <span class="bg-unit">${E(r.goal==null && r.now===1 ? r.unit.replace(/s$/,'') : r.unit)}</span></span></div>
          ${r.goal!=null ? `<div class="bg-bar"><div class="bg-fill" style="width:${Math.max(r.pct, r.pct>0?3:0)}%"></div></div>` : ''}
          <div class="bg-st">${st}</div>
          ${r.extra ? `<div class="bg-extra">${E(r.extra)}</div>` : ''}
          ${skuHtml(r)}
          ${r.winback && r.winback.length ? `<details class="bg-win"><summary>Win back: ${r.winback.length} account${r.winback.length===1?'':'s'} that poured it last fall</summary><ol class="bg-winlist">${r.winback.map(n=>`<li>${E(n)}</li>`).join('')}</ol></details>` : ''}
        </div>`; }).join('')}</div>`; }).join('')}
  </div>`;
}

// The three short answers a card gives (what to sell / where to go / next
// step) plus the numbered visit list. How many to suggest: about twice
// what is still needed, between 5 and 10 (15 on the detail page), so "1
// draft line to go" does not read as a ten-stop route.
function planParts(p, r, rep, opts){
  opts = opts || {};
  const done = r.status==='complete' || r.status==='exceeded';
  if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) return {loading:true, sell:sellAsk(p), go:'Loading…', step:'', n:0, total:0, hold:false, list:''};
  let plan = nextAccounts(p, rep);
  const BG = brandGoals(p, rep);
  if(BG.length){
    // A brand-goal program: the "where to go" answer is the goal list itself.
    const rows = BG.flatMap(g=>g.rows); const goaled = rows.filter(x=>x.goal!=null); const open = goaled.filter(x=>!x.held);
    const go = !goaled.length ? `${rows.length===1 ? '1 brand family' : rows.length+' brand families'} on your route.`
      : !open.length ? `Every brand goal is held — keep them there.`
      : `${open.length===1 ? '1 brand goal still needs' : open.length+' brand goals still need'} attention.`;
    return {loading:false, sell:sellAsk(p), go, step:'Open your brand goals.', n:open.length, total:0, hold:true, list:'', goals:BG, goalsOpen:open.length};
  }
  const needN = parseInt(String(r.remain||'').replace(/,/g,''), 10);
  const LIMIT = opts.limit || (needN>0 ? Math.max(5, Math.min(10, needN*2)) : 10);
  const key = p.id+'|plan'; const all = !!planMore[key];
  // The rep's own marks reorder the list: follow-ups first, untouched
  // accounts next; Done and Not now fold away below and stop counting.
  const show = RA.canShow(rep), edit = RA.canEdit(rep);
  const stOf = a => show ? RA.get(p.id, a) : null;
  const allRows = plan.rows;
  const follow = allRows.filter(a=>{ const s = stOf(a); return s && s.status==='follow'; });
  const openRows = allRows.filter(a=>!stOf(a));
  const laterRows = allRows.filter(a=>{ const s = stOf(a); return s && s.status==='skip'; });
  const doneRows = allRows.filter(a=>{ const s = stOf(a); return s && s.status==='done'; });
  const live = follow.concat(openRows);
  plan = Object.assign({}, plan, {rows: live});
  const rows = all ? plan.rows : plan.rows.slice(0, LIMIT);
  const n = Math.min(plan.rows.length, LIMIT);
  let go, step;
  if(!allRows.length && isSupport(rep)){
    go = 'No assigned route — any account you place it in counts.';
    step = done ? 'Keep it up.' : 'Submit the menu photo in iSellBeer.';
  } else if(!plan.rows.length && allRows.length){
    go = doneRows.length===allRows.length ? 'Every account on this list is marked done.' : 'Every account on this list is marked done or set aside.';
    step = done ? 'Keep it up.' : 'Reopen one below if plans change.';
  } else if(!plan.rows.length){
    go = plan.hold ? 'No account list for this one.' : (plan.A.universe===0 ? 'No eligible accounts.' : 'Every eligible account already buys it.');
    step = plan.hold ? 'Hold every brand goal.' : (done ? 'Keep it up.' : 'Check with your manager.');
  } else if(plan.hold){
    go = `Keep these ${n} accounts ordering.`; step = 'Open the account list.';
  } else {
    go = `Start with these ${n} eligible account${n===1?'':'s'}.`; step = 'Open the account list.';
  }
  // More rows than the card shows: a header line above the list says so and
  // carries the Show all / Show fewer toggle, top right (never under the list).
  const head = plan.rows.length>LIMIT
    ? `<div class="plan-top lhead"><span>${all ? plw(plan.rows.length,'account') : `Top ${n} of ${plan.rows.length} accounts`}</span>${moreBtn('plan-more', key, all, plan.rows.length)}</div>` : '';
  const folds = planFold(p, laterRows, 'skip', edit, show) + planFold(p, doneRows, 'done', edit, show);
  const list = !allRows.length ? '' : `${raNotes(show, edit, allRows, follow.length+laterRows.length+doneRows.length)}${head}${plan.rows.length ? `<ol class="plan-list">${rows.map(a=>planRowHtml(p, a, edit, show)).join('')}</ol>` : ''}${folds}`;
  return {loading:false, sell:sellAsk(p), go, step, n, total:plan.rows.length, hold:plan.hold, list, marks:{follow:follow.length, later:laterRows.length, done:doneRows.length}};
}
// The two big tabs inside an opened card: the visit list, and the log of
// what the tracker already credits.
function planTabs(p, rep, P, tab){
  const closedN = P.loading ? null : closedFor(p, rep).length;
  return `<div class="ptabs">
      <button class="ptab sell${tab==='sell'?' active':''}" data-act="card-tab" data-prog="${E(p.id)}" data-tab="sell"><span class="ptab-l">Targets</span><span class="ptab-n">${P.loading ? '…' : P.total ? (P.hold ? plw(P.total,'account')+' to hold' : plw(P.total,'account')+' to visit') : 'nothing open'}</span></button>
      <button class="ptab closed${tab==='closed'?' active':''}" data-act="card-tab" data-prog="${E(p.id)}" data-tab="closed"><span class="ptab-l">Completed</span><span class="ptab-n">${closedN==null?'…':plw(closedN,'placement')}</span></button>
    </div>`;
}
// Expanded card, Rep Mode: the list behind the two tabs, then the link to
// the full page. (The what-to-sell / where-to-go lines already sit on the
// collapsed card, so they are not repeated here.)
function cardPlan(p, r, rep){
  const P = planParts(p, r, rep);
  if(P.goals) return `<div class="plan">${brandGoalsHtml(P.goals, {oneGoal: p.key==='mabi_retention_fall' ? (r.goal||'goal') : ''})}
    <div class="pcard-actions"><button class="fullbtn quiet" data-act="open" data-prog="${E(p.id)}">Full program details <span class="ar">›</span></button></div>
  </div>`;
  const tab = cardTab[p.id] || 'sell';
  const body = tab==='closed' ? closedLog(p, rep)
    : P.loading ? `<div class="soon-note">Loading…</div>`
    : P.list ? `<div class="plan-listwrap open">${P.list}</div>`
    : `<div class="aempty">${E(P.go)} ${E(P.step)}</div>`;
  return `<div class="plan">${planTabs(p, rep, P, tab)}${body}
    <div class="pcard-actions"><button class="fullbtn quiet" data-act="open" data-prog="${E(p.id)}">Full program details <span class="ar">›</span></button></div>
  </div>`;
}
// Detail page, Rep Mode: the three lines and the list, always open.
function repPlan(p, r, rep, opts){
  const P = planParts(p, r, rep, opts);
  if(P.loading) return `<div class="soon-note">Loading…</div>`;
  return `<div class="plan">
    <div class="plan-line sell"><span class="plan-l">Sell</span><span class="plan-t">${E(P.sell)}</span></div>
    <div class="plan-line go"><span class="plan-l">Where to go</span><span class="plan-t">${E(P.go)}</span></div>
    <div class="plan-line step"><span class="plan-l">Next step</span><span class="plan-t">${E(P.step)}</span></div>
    ${P.list ? `<div class="plan-listwrap open">${P.list}</div>` : ''}
  </div>`;
}

/* ---- MPO cards wear the MPO dashboards' objective card (v9.8, 2026-09-11)
   Per Gavin, twice: the hub's MPO cards should look like the solo On-Prem /
   Off-Prem dashboards, not like the hub's boxed Goal / Where you are / Still
   need tiles. So an MPO card's head is now guided.js's repObjectiveCard()
   verbatim -- the full objective name, the tag row (weight pill, Goal,
   status pill), the FLAT My Goal / Where I Am / Still Needed / Credit Earned
   strip, and the bar with its "N% of goal" caption -- using guided.css's own
   .g-* classes, which hub/index.html already loads. Incentive cards keep the
   hub's .q boxes; nothing about them changed.

   WHAT STAYS IS THE HUB'S OWN LAYER: the brand logo, the supplier line, the
   Sell / Go lines and the Targets / Completed account list underneath. Those
   are why the hub exists (CLAUDE.md: Rep Mode is the numbered visit list) and
   the dashboards have no equivalent, so "look like the dashboards" is about
   the card's read, not about deleting the plan below it. The hub's own status
   chip IS dropped on these cards -- the .g-pill states it now, and printing
   "Not Started" twice on one card is worse than either alone. */
const G_STATUS_TEXT = {achieved:'Goal Achieved', inprogress:'In Progress', notstarted:'Not Started'};
const G_STATUS_MARK = {achieved:'\u2713', inprogress:'\u25CF', notstarted:'\u25CB'};
const gStatusOf = r => (r.status==='complete'||r.status==='exceeded') ? 'achieved'
                     : r.status==='notstarted' ? 'notstarted' : 'inprogress';
function mpoQuickHtml(p, r){
  const st = gStatusOf(r), done = st==='achieved';
  const weight = r.weight!=null ? r.weight : Math.round((p.objective.weight||0)*100);
  // Same shape as guided.js's repObjectiveCard (2026-09-28): the pill says
  // whether credit is earned, three facts, no duplicate Goal tag.
  const CREDIT = {achieved:'Goal achieved · credit earned', inprogress:'In progress · credit not yet earned', notstarted:'Not started'};
  return `<div class="g-tags mpo-tags">
      <span class="g-tag weight">${weight}% of MPO</span>
      <span class="g-pill ${st}">${G_STATUS_MARK[st]} ${CREDIT[st]||G_STATUS_TEXT[st]}</span>
    </div>
    <div class="g-facts g-facts-3">
      <div><div class="g-fact-l">My Goal</div><div class="g-fact-v">${E(r.goal||'\u2014')}</div></div>
      <div><div class="g-fact-l">Where I Am</div><div class="g-fact-v${done?' good':''}">${E(r.now||'\u2014')}</div></div>
      <div><div class="g-fact-l">Still Needed</div><div class="g-fact-v${r.remain?'':' good'}">${E(r.remain || 'None')}</div></div>
    </div>
    <div class="g-bar"><div class="g-bar-fill ${st}" style="width:${Math.max(0,Math.min(100,r.pct||0))}%"></div></div>
    <div class="g-barcap"><span>${Math.round(r.pct||0)}% of goal</span></div>
    ${(r.segments && r.segments.length) ? `<div class="mpo-subs">${r.segments.map(g=>`<div class="mpo-sub">
        <div class="g-barcap"><span>${E(g.label)}</span><strong>${E(g.valueText)}</strong></div>
        <div class="g-bar"><div class="g-bar-fill ${E(g.status||'inprogress')}" style="width:${Math.max(0,Math.min(100,g.pct||0))}%"></div></div>
      </div>`).join('')}</div>` : ''}`;
}

/* ====================================================================
   MPO REP CARD -- a worklist row, not a dashboard tile (v10, 2026-09-11)
   --------------------------------------------------------------------
   Rep feedback, via Gavin: the MPO cards carried too many colours, icons,
   badges and competing elements. A rep opening this page has four
   questions and nothing else:

       What is my goal?  Where am I?  How many more?  Which accounts?

   So an MPO card in REP MODE is now: the program name, the supplier line,
   one CURRENT / GOAL / STILL NEEDED row, one plain bar, and the accounts
   that can close the gap. Everything else -- the weight, the rules, the
   qualifying brands, the eligible-account counts, the placements already
   credited -- moved behind the card's own expand.

   WHAT WAS REMOVED, deliberately: the brand logo, the 🎯/📍/⏳/🍺 icons,
   the status pill, the "N% of MPO" weight pill, the ⏰/🔥/★ flags, the
   Sell and Go lines (the program name already says what to sell; "Go" is
   now the accounts list itself), the "Credit Earned" fact, and the
   four count tiles above the list. One accent colour (--accent) carries
   progress and the Still Needed number; nothing else is coloured.

   MANAGER MODE IS UNCHANGED and still shows the MPO dashboards' own
   objective card (v9.8) -- "reps at goal" and the weight are a manager's
   information, and the brief says not to make them dominant for a rep.

   STILL NEEDED IS MAX(GOAL - CURRENT, 0) from the tracker's own numbers.
   valueNum/goalNum are plain COUNTS on every objective type, including the
   percentage ones -- Keystone Ice's "40% of my account base (14 of 33)"
   carries 6 and 14 buying accounts, not 18.2 and 40 -- so one subtraction
   is right across all of them, and the percentage wording stays as the
   quiet goal caption underneath.
   ==================================================================== */
const fmtN = v => { const n = Number(v); if(!isFinite(n)) return '—';
  return (Math.round(n*10)/10).toLocaleString('en-US'); };
function mpoNums(r){
  const cur = Number(r.valueNum), goal = Number(r.goalNum);
  if(!isFinite(cur) || !isFinite(goal) || goal<=0) return null;
  // needNum: an objective whose "Achieved" bar is below the goal shown (Corona
  // Innovation: goal 100%, Achieved at 75%) says what is still needed for THAT bar.
  const need = isFinite(Number(r.needNum)) && r.needNum!==undefined && r.needNum!==null ? Number(r.needNum) : Math.max(goal-cur, 0);
  return {cur, goal, need};
}
// The accounts that can close the gap. Same nextAccounts() the rest of the
// hub uses, so territory and account-base rules are unchanged -- this only
// decides what a row shows: name, account number, territory, and the gap.
function mpoTargetRows(p, rep){
  if(!mpoMonthLoaded(p.source, p.monthKey)) return null;
  return nextAccounts(p, rep).rows.filter(a=>!a.foreign);
}
function mpoTargetRowHtml(a){
  const meta = [a.n ? '#'+a.n : '', a.area || a.rawArea || ''].filter(Boolean).join(' · ');
  return `<li class="mt-row"><div class="mt-name">${E(a.name)}</div>` +
    `${meta?`<div class="mt-meta">${E(meta)}</div>`:''}</li>`;
}
const MT_PREVIEW = 3;
function mpoRepCard(p, r, rep){
  const soon = r.status==='soon';
  const sec = cardSec[p.id] || null;
  const o = p.objective;
  const sup = `${E(p.supplier)} · ${E(p.channelLabel)}`;
  const ends = E(endsLabel(p.period));   // already reads "Ends Sep 30 · 19 days left" 

  if(r.status==='unavailable'){
    return `<article class="mcard off" id="card-${E(p.id)}">
      <div class="mcard-head static"><div class="mcard-name">${E(o.name)}</div><div class="mcard-sup">${sup}</div>
      <div class="mcard-note">${E(r.why||UNAVAILABLE)} Not counted in your goals.</div></div></article>`;
  }
  if(soon){
    return `<article class="mcard" id="card-${E(p.id)}">
      <div class="mcard-head static"><div class="mcard-name">${E(o.name)}</div><div class="mcard-sup">${sup}</div>
      <div class="mcard-note">${E(r.loading ? 'Loading this month’s data…' : p.manual ? 'Verified by hand from iSellBeer photos — no numbers to track here.' : 'Waiting on the first export.')}</div>
      <div class="mcard-ends">${ends}</div></div></article>`;
  }

  if(isDollarProgram(r)) return '';            // money is not a field metric
  const N = mpoNums(r);
  const met = N ? N.need===0 : (r.status==='complete' || r.status==='exceeded');
  const unit = o.unit ? (o.unit + ((N ? N.need : 0)===1 ? '' : 's')) : '';
  const pct = Math.max(0, Math.min(100, r.pct||0));
  const targets = mpoTargetRows(p, rep);
  const nT = targets ? targets.length : null;

  const figures = `<div class="mfig">
      <div class="mf"><div class="mf-l">Current</div><div class="mf-v">${N?fmtN(N.cur):E(r.now||'—')}</div></div>
      <div class="mf"><div class="mf-l">Required</div><div class="mf-v">${N?fmtN(N.goal):E(r.goal||'—')}</div></div>
      <div class="mf need${met?' met':''}"><div class="mf-l">${met?'Status':'Still Needed'}</div>
        <div class="mf-v">${met?'Goal met':(N?fmtN(N.need):E(r.remain||'—'))}</div>
        ${!met && unit ? `<div class="mf-u">${E(unit)}</div>` : ''}</div>
    </div>`;
  const bar = `<div class="mbar"><div class="mbar-fill" style="width:${pct}%"></div></div>
    <div class="mbar-cap"><span>${Math.round(pct)}% of this MPO requirement</span><span class="mbar-goal">MPO Weight: ${Math.round((o.weight||0)*100)}%</span></div>`;

  // Collapsed: the first few accounts. Expanded: all of them, then the
  // supporting detail. Both come from the same list.
  // A card already at goal does not need three account rows shouting at a
  // rep who has nothing left to close -- it keeps the count and the expander
  // (you can still keep building) and gives back the vertical space.
  // Same shape as an incentive row: the numbers, the bar, then two
  // collapsed sections. No inline preview -- it made the card tall and
  // duplicated the section a tap away (per Gavin, 2026-09-11).
  const dist = distFor(p, rep);
  const counts = {dist: dist.length || null, targets: targets===null ? null : raLive(p, rep, targets).length};
  const loading = targets===null ? `<div class="mt-note">Loading accounts…</div>` : '';

  return `<article class="mcard${sec?' open':''}${met?' met':''}" id="card-${E(p.id)}">
    <div class="mcard-head">
      <div class="mcard-name">${E(p.shortName||o.name)}</div>
      <div class="mcard-sup">${E(p.supplier)} · ${E(o.periodText||periodLabel(p.period))}</div>
      ${figures}
      ${bar}
      ${loading}
      ${secLinks(p, sec, counts)}
      <div class="mcard-foot"><span class="mcard-ends">${ends}</span></div>
    </div>
    ${sec ? `<div class="mcard-body">${mpoRepCardDetail(p, r, rep, targets, dist, sec)}</div>` : ''}
  </article>`;
}
// Everything that is not one of the four questions lives here.
function mpoRepCardDetail(p, r, rep, targets, dist, which){
  const o = p.objective;
  const A = mpoMonthLoaded(p.source, p.monthKey) ? accountsFor(p, rep) : null;
  const sec = (title, body, right) => body ? `<div class="msec"><div class="msec-h${right?' lhead':''}"><span>${E(title)}</span>${right||''}</div>${body}</div>` : '';
  const key = p.id+'|'+which;
  const tail = `<div class="msec"><a class="mlink" href="${E(MPO_SCOPES[p.source].page)}#rep=${encodeURIComponent(rep)}&month=${E(p.monthKey)}">Open on the ${E(p.channelLabel)} MPO tracker</a></div>`;
  if(which==='dist'){
    const rc = reconLine(p, r, dist);
    return sec(`Credited in ${E(periodLabel(p.period))}`,
      `<div class="recon${rc.ok?' ok':''}">${rc.t}</div>` + acctList(key, ACCT_COLS.dist, dist), listMore(key, dist)) + tail;
  }
  if(which==='targets'){
    return sec(`Potential accounts${(targets&&targets.length)?' · '+raLive(p, rep, targets).length:''}`,
      (targets && targets.length) ? acctList(key, ACCT_COLS.targets, targets, {prog:p, rep})
        : `<div class="mt-note">No potential accounts currently identified.</div>`,
      listMore(key, raLive(p, rep, targets||[]))) + tail;
  }
  const counts = A ? `<ul class="mkv">
      <li><span>In your book, this premise</span><span>${A.universe}</span></li>
      <li><span>Eligible, not buying yet</span><span>${A.eligible.length}</span></li>
      <li><span>Already buying</span><span>${A.buying.length}</span></li>
      ${(A.excluded.length+A.unknown.length)?`<li><span>Brand not sellable there</span><span>${A.excluded.length+A.unknown.length}</span></li>`:''}
    </ul>` : '';
  const brands = (A && !A.any && A.families.length)
    ? `<div class="mtext">${E(A.families.join(' · '))}</div>`
    : (A && A.any ? `<div class="mtext">Any brand counts toward this objective.</div>` : '');
  const rules = repRulesHtml(p, 'mbul');
  return sec('Qualifying brands', brands) + sec('Your account base', counts) + sec('How it is scored', rules) + tail;
}

function programCard(p, r, rep){
  // Rep Mode: every program is one tappable row that opens its own screen
  // (2026-09-30). Manager Mode keeps the dashboards' objective card.
  if(!isMgr()) return progRowHtml(p, r, rep);
  const bySup = String(state.cat||'').startsWith('sup:');
  const kind = p.type==='MPO' ? E(p.channelLabel)+' MPO' : ({new:'New', ongoing:'Ongoing', retention:'Retention'}[p.group]||'')+' incentive';
  const sup = bySup ? kind : `${E(p.supplier)} · ${kind}`;
  if(r.status==='unavailable'){
    return `<article class="pcard st-unavailable" id="card-${E(p.id)}">
      <div class="pcard-head static">
        <div class="pcard-top">
          ${logoStrip(p)}
          <div class="pcard-title"><div class="pcard-name">${E(p.shortName||p.name)}</div><div class="pcard-sup">${sup}</div></div>
        </div>
        <div class="unavail"><span class="unavail-t">⊘ ${E(r.why||UNAVAILABLE)}</span><span class="unavail-s">${E(r.sub||'')} Not counted in your goals.</span></div>
      </div>
    </article>`;
  }
  const soon = r.status==='soon';
  const open = openCards.has(p.id);
  const done = r.status==='complete' || r.status==='exceeded';
  const urgent = daysLeft(p.period.end)<=ENDING_SOON_DAYS && isActive(p);
  const dead = `<div class="dead${urgent?' urgent':''}">${urgent?'⏰ ':'📅 '}${E(shortEnds(p.period))}</div>`;
  // Goal -> where you are -> still need, then the bar, then (Rep Mode) what
  // to sell and where to go. Everything else waits behind the button.
  let quick;
  if(soon){
    quick = `<div class="quick two"><div class="q wide"><span class="ql">Status</span><span class="qv dim">${E(r.loading ? 'Loading this month’s data…' : p.manual ? 'Verified by hand — nothing to track yet' : 'Waiting on the first export')}</span></div></div>${dead}`;
  } else if(p.type==='MPO'){
    quick = mpoQuickHtml(p, r) + dead;
  } else {
    const pctTxt = r.openEnded ? '' : Math.round(r.pct)+'%';
    quick = `<div class="quick">
        <div class="q goal"><span class="ql"><span class="qi">🎯</span>Goal</span><span class="qv">${E(r.openEnded ? 'No cap' : (r.goal||'—'))}</span></div>
        <div class="q prog"><span class="ql"><span class="qi">📍</span>Where you are</span><span class="qv">${E(r.now||'—')}</span></div>
        <div class="q need"><span class="ql"><span class="qi">⏳</span>Still need</span><span class="qv${r.remain?'':' ok'}">${E(r.remain || (done ? 'Done ✓' : (r.openEnded ? 'Every one pays' : '—')))}</span></div>
      </div>
      <div class="barrow">${barHtml(r)}<span class="barrow-pct ${r.pace}">${E(pctTxt || (r.status==='notstarted' ? '0' : '✓'))}</span></div>
      ${dead}`;
  }
  let lines = '', hasList = true;
  if(!soon && !isMgr()){
    const P = planParts(p, r, rep); hasList = P.loading || P.total>0 || !!P.goals;
    const closedN = (P.loading || P.goals) ? 0 : closedFor(p, rep).length;
    lines = `<div class="lines">
      <div class="line sell"><span class="line-ic">${RETENTION.test(p.key)?'🛡️':'🍺'}</span><span class="line-l">Sell</span><span class="line-t">${E(P.sell)}</span></div>
      <div class="line go"><span class="line-ic">📍</span><span class="line-l">Go</span><span class="line-t">${E(P.go)}</span></div>
      ${closedN ? `<div class="line done"><span class="line-ic">✓</span><span class="line-l">Closed</span><span class="line-t">${plw(closedN,'placement')} credited so far.</span></div>` : ''}
    </div>`;
  }
  const hasGoals = !soon && !isMgr() && brandGoals(p, rep).length > 0;
  const hint = open ? 'Close ▴' : isMgr() ? 'Details & accounts ▾' : hasGoals ? 'Open your brand goals ▾' : (soon || !hasList) ? 'Details ▾' : 'Open the account list ▾';
  const body = !open ? '' : !isMgr() ? `<div class="pcard-body">${cardPlan(p, r, rep)}</div>` : `<div class="pcard-body">
      <div class="pcard-meta">${typeChips(p)}<span class="chip sup">${E(p.supplier)}</span><span class="chip">📅 ${E(p.period.label)}</span><span class="chip">Data ${E(p.refreshed ? 'refreshed '+p.refreshed : 'loading…')}</span></div>
      ${r.next && !soon ? `<div class="next"><span class="next-l">Next</span><span class="next-t">${r.next}</span></div>` : ''}
      ${repSub(r) && !soon ? `<div class="psub">${E(repSub(r))}</div>` : ''}
      ${accountsPanel(p, rep)}
      <div class="pcard-actions"><button class="fullbtn" data-act="open" data-prog="${E(p.id)}">Full program details <span class="ar">›</span></button></div>
    </div>`;
  return `<article class="pcard st-${r.status}${open?' open':''}" id="card-${E(p.id)}">
    <button class="pcard-head" data-act="toggle-card" data-prog="${E(p.id)}" aria-expanded="${open?'true':'false'}">
      <div class="pcard-top">
        ${logoStrip(p)}
        <div class="pcard-title"><div class="pcard-name">${E(p.type==='MPO' ? p.name : (p.shortName||p.name))}</div><div class="pcard-sup">${sup}</div></div>
        <div class="pcard-status">${(p.type==='MPO' && !soon) ? '' : statusChip(r)}${flags(p, r)}</div>
      </div>
      ${quick}
      ${lines}
      <div class="pcard-hint">${hint}</div>
    </button>
    ${body}
  </article>`;
}

/* ---- program detail, Rep Mode: the plan, nothing else ---- */
function screenDetailRep(p, r, rep, back){
  const soon = r.status==='soon';
  const big = soon ? '—' : (r.openEnded ? r.now : Math.round(r.pct)+'%');
  const cap = soon ? (r.loading ? 'Loading…' : 'Nothing to count yet') : (r.openEnded ? (repSub(r) || 'So far') : 'of your goal');
  const tl = soon ? null : p.timeline(rep);
  return `<div class="detail">
    ${back}
    <div class="dhero st-${r.status}">
      <div class="dhero-top">${logoStrip(p,'lg')}</div>
      <div class="dhero-sup">${E(p.supplier)} · ${E(p.type)} · ${E(p.channelLabel)}</div>
      <h1 class="dhero-name">${E(p.name)}</h1>
      <div class="dhero-big ${r.pace}${r.openEnded && !soon ? ' sofar' : ''}">${E(big)}</div>
      <div class="dhero-cap">${E(cap)}</div>
      ${soon ? '' : barHtml(r, true)}
      <div class="dhero-line">${statusChip(r)}${flags(p, r)}</div>
    </div>
    <div class="dfacts three">
      <div class="dfact"><span class="dfact-l">Your goal</span><span class="dfact-v">${E(r.goal||'—')}</span></div>
      <div class="dfact"><span class="dfact-l">Where you stand</span><span class="dfact-v">${E(r.now||'—')}</span>${repSub(r)?`<span class="dfact-s">${E(repSub(r))}</span>`:''}</div>
      <div class="dfact"><span class="dfact-l">Still needed</span><span class="dfact-v">${E(r.remain || (r.openEnded ? 'No cap — every one pays' : (soon ? '—' : 'Done ✓')))}</span><span class="dfact-s ${daysLeft(p.period.end)<=ENDING_SOON_DAYS && isActive(p)?'urgent':''}">${E(endsLabel(p.period))}</span></div>
    </div>
    ${r.next ? `<div class="nextbox"><div class="nextbox-l">Your next move</div><div class="nextbox-t">${nextNoMoney(r.next)}</div></div>` : ''}
    ${(()=>{ const BG = brandGoals(p, rep); return BG.length
      ? `<section class="dsec"><h2 class="dsec-h">Your brand goals</h2>${brandGoalsHtml(BG, {noTitle:true, oneGoal: p.key==='mabi_retention_fall' ? (r.goal||'goal') : ''})}</section>`
      : `<section class="dsec"><h2 class="dsec-h">Targets</h2>${repPlan(p, r, rep, {limit:15})}</section>
    <section class="dsec"><h2 class="dsec-h closed">Completed</h2>${closedLog(p, rep, {limit:25})}</section>`; })()}
    <section class="dsec"><h2 class="dsec-h">How it is scored</h2>
      ${repRulesHtml(p, 'rules')}
      <p class="note">Runs ${E(p.period.label)} · numbers as of ${E(p.refreshed||'—')}</p></section>
    ${tl && tl.length ? `<section class="dsec"><h2 class="dsec-h">Your progress so far</h2>${chartHtml(tl, p, r)}</section>` : ''}
  </div>`;
}

/* ---- program detail for one rep ---- */
function screenDetail(){
  const p = PROGRAMS.find(x=>x.id===state.prog); const rep = state.peek || state.rep;
  if(!p) return `<div class="empty">That program is not on the board.</div>`;
  const r = p.forRep(rep);
  const peekNote = state.peek ? `<div class="peek">Viewing <strong>${E(rep)}</strong>’s progress${state.rep?` — you are still signed in as ${E(state.rep)}`:''}.</div>` : '';
  const back = state.from==='program'
    ? `<button class="back" data-act="open-program" data-prog="${E(p.id)}"><span class="ar">‹</span> Back to ${E(p.shortName)} leaderboard</button>`
    : `<button class="back" data-act="my-programs"><span class="ar">‹</span> Back to My Programs</button>`;
  if(!r) return `<div class="detail">${back}<div class="empty">${E(rep)} is not in ${E(p.name)}${p.type==='Incentive' && p.territory==='Core Market counties' ? ' — it runs in the Core Market counties only.' : '.'}</div></div>`;
  const rank = p.ranking(); const mine = rank.find(x=>x.rep===rep);
  const soon = r.status==='soon';
  const av = (r.status==='unavailable' || r.status==='soon') ? {ok: r.status!=='unavailable'} : availability(p, rep);
  if(!av.ok || r.status==='unavailable') return `<div class="detail">${back}<div class="dhero st-unavailable"><div class="dhero-top">${logoStrip(p,'lg')}</div><div class="dhero-sup">${E(p.supplier)}</div><h1 class="dhero-name">${E(p.name)}</h1>
    <div class="dhero-line">${statusChip({status:'unavailable'})}</div><p class="dhero-pitch">${E(r.sub || av.sub || 'The brand can’t be sold at any account on your route.')} Shown for awareness only — not counted in your goals.</p></div>
    <section class="dsec"><h2 class="dsec-h">How it pays</h2><ul class="rules">${p.rules.map(x=>`<li>${p.type==='Incentive' ? ruleHl(x) : E(x)}</li>`).join('')}</ul></section></div>`;
  if(!isMgr()) return screenProgramRep(p, r, rep);
  const big = soon ? '—' : (r.openEnded ? r.now : Math.round(r.pct)+'%');
  const cap = soon ? (r.loading ? 'Loading…' : 'Not being tracked yet') : (r.openEnded ? (r.sub || 'So far this period') : 'Complete');
  const tl = soon ? null : p.timeline(rep);
  const exp = p.exposure();
  return `<div class="detail">
    ${back}${peekNote}
    <div class="dhero st-${r.status}">
      <div class="dhero-top">${logoStrip(p,'lg')}<div class="dhero-meta">${typeChips(p)}<span class="chip sup">${E(p.supplier)}</span>${p.territory?`<span class="chip terr">${E(p.territory)}</span>`:''}</div></div>
      <div class="dhero-sup">${E(p.supplier)} · ${E(p.monthLabel)}</div>
      <h1 class="dhero-name">${E(p.name)}</h1>
      ${p.pitch ? `<p class="dhero-pitch">${E(p.pitch)}</p>` : ''}
      <div class="dhero-big ${r.pace}">${E(big)}</div>
      <div class="dhero-cap">${E(cap)}</div>
      ${soon ? '' : barHtml(r, true)}
      <div class="dhero-line">${statusChip(r)}${flags(p, r)}${!soon && !r.openEnded ? `<span class="dhero-under">${E(r.now)}${r.remain?` · ${E(r.remain)}`:''}</span>` : ''}</div>
      ${r.segments && r.segments.length ? `<div class="segs">${r.segments.map(g=>{
        const has = g.pct!=null; const cls = !has ? 'dim' : (g.pct>=100 ? 'earned' : '');
        return `<div class="seg"><div class="seg-l">${E(g.label)}</div><div class="seg-big ${cls}">${has?Math.round(g.pct)+'%':'—'}</div>${has?`<div class="bar sm"><div class="bar-fill ${cls||'ontrack'}" style="width:${Math.min(100,Math.max(g.pct,2))}%"></div></div>`:''}<div class="seg-line">${E(g.line||'')}</div></div>`;}).join('')}</div>` : ''}
    </div>
    ${r.next ? `<div class="nextbox"><div class="nextbox-l">What to do next</div><div class="nextbox-t">${r.next}</div></div>` : ''}
    <div class="dfacts">
      <div class="dfact"><span class="dfact-l">Current result</span><span class="dfact-v">${E(r.now||'—')}</span></div>
      <div class="dfact"><span class="dfact-l">Goal</span><span class="dfact-v">${E(r.goal||'—')}</span></div>
      <div class="dfact"><span class="dfact-l">Remaining opportunity</span><span class="dfact-v">${E(r.remain || (r.openEnded ? 'No cap — every one pays' : (soon ? '—' : 'Done ✓')))}</span></div>
      <div class="dfact"><span class="dfact-l">Program period</span><span class="dfact-v">${E(p.period.label)}</span><span class="dfact-s ${daysLeft(p.period.end)<=ENDING_SOON_DAYS && isActive(p)?'urgent':''}">${E(endsLabel(p.period))}</span></div>
      <div class="dfact"><span class="dfact-l">Payout / reward</span><span class="dfact-v small">${E(p.reward || 'See the rules below')}</span></div>
      <div class="dfact"><span class="dfact-l">Last data refresh</span><span class="dfact-v">${E(p.refreshed||'—')}</span>${mine?`<span class="dfact-s">You rank #${mine.rank} of ${rank.length} by ${E(mine.metricLabel)}</span>`:''}</div>
    </div>
    <section class="dsec">
      <h2 class="dsec-h">Program description &amp; requirements</h2>
      ${p.pitch ? `<p class="dsec-p">${E(p.pitch)}</p>` : ''}
      <ul class="rules">${p.rules.map(x=>`<li>${p.type==='Incentive' ? ruleHl(x) : E(x)}</li>`).join('')}</ul>
      ${p.awaitingNote ? `<p class="note">${E(p.awaitingNote)}</p>` : ''}
      ${p.type==='MPO' ? `<p class="note">On the ${E(p.channelLabel)} MPO tracker this objective carries ${E(String(r.weight||Math.round(p.objective.weight*100)))}% of the month's weight. <a href="${E(MPO_SCOPES[p.source].page)}#rep=${encodeURIComponent(rep)}&month=${E(p.monthKey)}">Open it there ›</a></p>`
                        : `<p class="note"><a href="${INC_ASSETS}index.html">Open the Incentive Tracker ›</a></p>`}
    </section>
    ${tl && tl.length ? `<section class="dsec"><h2 class="dsec-h">Your progress over time</h2>${chartHtml(tl, p, r)}</section>` : ''}
    <section class="dsec"><h2 class="dsec-h">${state.peek ? E(first(rep))+'’s accounts for this program' : 'Your accounts for this program'}</h2>${accountsPanel(p, rep)}</section>
    ${soon ? '' : `<section class="dsec"><h2 class="dsec-h">${p.type==='MPO' ? 'Tracker detail: placements and targets' : 'Tracker detail: products and opportunities'}</h2>
      <div class="ddetail ${p.type==='MPO'?'mpo':'inc'}">${p.detailHtml(rep) || '<div class="empty small">No detail on file yet.</div>'}</div></section>`}
    ${rank.length ? `<section class="dsec"><h2 class="dsec-h">${state.peek ? 'Where '+E(first(rep))+' ranks' : 'Where you rank'}</h2>${leaderboard(p, rank, rep, 5)}</section>` : ''}
    ${exp!=null ? `<p class="note">Tracked payout across all reps so far: <strong>$${exp.toLocaleString('en-US')}</strong>.</p>` : ''}
  </div>`;
}
function chartHtml(pts, p, r){
  const W = 640, Hh = 150, padL = 36, padR = 14, padT = 12, padB = 26;
  const x0 = p.period.start.getTime(), x1 = Math.max(p.period.end.getTime(), pts[pts.length-1].date.getTime());
  const goal = (!r.openEnded && r.goalNum && r.goalNum > 0 && typeof r.valueNum==='number') ? r.goalNum : null;
  const yMax = Math.max(pts[pts.length-1].n, goal||0, 1);
  const X = t => padL + ((t - x0)/(x1 - x0||1))*(W-padL-padR);
  const Y = n => padT + (1 - n/yMax)*(Hh-padT-padB);
  let d = `M${X(x0).toFixed(1)},${Y(0).toFixed(1)}`; let prev = 0;
  pts.forEach(pt=>{ d += ` L${X(pt.date.getTime()).toFixed(1)},${Y(prev).toFixed(1)} L${X(pt.date.getTime()).toFixed(1)},${Y(pt.n).toFixed(1)}`; prev = pt.n; });
  const todayX = Math.min(Math.max(TODAY.getTime(), x0), x1);
  d += ` L${X(todayX).toFixed(1)},${Y(prev).toFixed(1)}`;
  const last = pts[pts.length-1];
  return `<div class="chart"><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="Cumulative progress by date">
    ${goal ? `<line x1="${padL}" x2="${W-padR}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" class="c-goal"/><text x="${W-padR}" y="${(Y(goal)-4).toFixed(1)}" class="c-lab" text-anchor="end">goal ${fmtNum(goal)}</text>` : ''}
    <line x1="${padL}" x2="${W-padR}" y1="${Y(0)}" y2="${Y(0)}" class="c-axis"/>
    <path d="${d}" class="c-line"/>
    ${pts.map(pt=>`<circle cx="${X(pt.date.getTime()).toFixed(1)}" cy="${Y(pt.n).toFixed(1)}" r="3.5" class="c-dot"/>`).join('')}
    <text x="${padL}" y="${Hh-8}" class="c-lab">${E(fmtDay(p.period.start))}</text>
    <text x="${W-padR}" y="${Hh-8}" class="c-lab" text-anchor="end">${E(fmtDay(new Date(x1)))}</text>
    <text x="${padL-6}" y="${padT+8}" class="c-lab" text-anchor="end">${yMax}</text>
    <text x="${padL-6}" y="${Y(0)}" class="c-lab" text-anchor="end">0</text>
  </svg><div class="chart-cap">${plw(last.n,'qualifying item')} counted through ${E(fmtDay(last.date))} — each step is a dated placement, account or photo already on your card.</div></div>`;
}
function leaderboard(p, rank, rep, limit){
  const shown = limit ? rank.slice(0, limit) : rank;
  const mine = rank.find(x=>x.rep===rep);
  const extra = (mine && limit && mine.rank > limit) ? [mine] : [];
  const row = x => `<button class="lrow${x.rep===rep?' me':''}" data-act="open-for-rep" data-prog="${E(p.id)}" data-rep="${E(x.rep)}">
      <span class="lrank">${x.rank<=3 ? ['🥇','🥈','🥉'][x.rank-1] : '#'+x.rank}</span>
      <span class="lname">${E(x.rep)}${x.rep===rep?` <span class="you">${x.rep===state.rep?'you':'viewing'}</span>`:''}</span>
      <span class="lval">${E(x.valueText)}</span>
      <span class="lbar"><span class="bar sm"><span class="bar-fill ${x.pace||'ontrack'}" style="width:${x.pct==null?(x.status==='notstarted'?0:100):Math.max(x.pct,2)}%"></span></span></span>
      ${x.status ? statusChip({status:x.status}, true) : ''}
    </button>`;
  return `<div class="lboard">${shown.map(row).join('')}${extra.length?`<div class="ldots">…</div>${extra.map(row).join('')}`:''}
    ${limit && rank.length>limit ? `<button class="lmore" data-act="open-program" data-prog="${E(p.id)}">See all ${rank.length} reps ›</button>` : ''}</div>`;
}

/* ---- manager: all programs ---- */
function programStats(p){
  const parts = [], pcts = [];
  let complete = 0, started = 0;
  ROSTER.forEach(rep=>{
    if(!supportAllows(rep, p)) return;
    const r = p.forRep(rep); if(!r || r.status==='soon' || r.status==='unavailable' || !availability(p, rep).ok) return;
    parts.push(rep);
    if(r.status==='complete'||r.status==='exceeded') complete++;
    if(r.status!=='notstarted') started++;
    if(r.pct!=null) pcts.push(r.pct);
  });
  const avg = pcts.length ? pcts.reduce((a,b)=>a+b,0)/pcts.length : null;
  return {participants:parts.length, complete, incomplete:parts.length-complete, started, avg, pctComplete: parts.length ? complete/parts.length*100 : 0};
}
/* ---- MPO sections in Program View (v9.7, 2026-09-11) ----------------
   Per Gavin: the MPO half of Program View should be the SAME card the
   On-Prem / Off-Prem dashboards already show, not a second design saying
   similar things differently. So this renders MPOs/shared/guided.js's
   screenProgram() shape -- the weighted summary strip, then one full-width
   objective card carrying "N / M reps at goal", the weight, the goal, the
   eligible-rep count and the company bar -- using guided.css's own .g-*
   classes (hub/index.html loads that stylesheet; every rule in it is .g-
   scoped and it only consumes variables the hub already defines, so the two
   pages cannot drift apart visually).

   AND THE NUMBERS NOW MATCH THE BOARD. The old .pvcard counted reps the
   hub's own way -- participants filtered by account base / territory,
   "completed" from each rep's status -- which disagreed with the dashboard
   a manager had open in the next tab (Fever Tree read "3 of 21 completed"
   here and "2 / 27 reps at goal" there). These cards read atGoalFor() and
   objPct() straight from the MPO module, so Program View and the trackers
   state one number. The hub's territory logic still governs the REP side,
   where it belongs. */
function mpoDataFor(scope, mk){ const s = mpoState[scope]||{}; return (s[mk] && s[mk].DATA) || null; }

// One objective card. Clicking it goes to the hub's own program detail (the
// rep rankings) rather than expanding in place -- the dashboards expand, the
// hub navigates, and that is the hub's existing pattern for every card here.
function mpoProgramCardHtml(p){
  const o = p.objective, M = MPO_SCOPES[p.source].mod;
  const loaded = mpoMonthLoaded(p.source, p.monthKey);
  const g = loaded ? p.atGoal() : null;
  const pct = loaded ? p.objPct() : 0;
  const all = !!(g && g.total && g.n === g.total);
  const has = !!(g && g.total);
  const share = has ? (g.n/g.total)*100 : 0;
  const mlogo = MPO_BRAND_LOGO[o.key] ? `<div class="g-logos">${[sam_adams_conversion_extra(o.key), MPO_BRAND_LOGO[o.key]].filter(Boolean).map(f=>`<img class="g-logo" src="${E(INC_ASSETS+'assets/logos/'+f)}" alt="" loading="lazy" onerror="this.remove()">`).join('')}</div>` : '';
  return `<div class="g-prog"><button class="g-prog-head" data-act="open-program" data-prog="${E(p.id)}">
      ${mlogo}
      <div class="g-prog-top">
        <span class="g-prog-name">${E(p.shortName||o.name)}<span class="g-reprow-dm">${E(o.supplier||p.supplier||'')}${(o.periodText||p.monthLabel)?' · '+E(o.periodText||p.monthLabel):''}</span></span>
        <span class="g-chev">&#9656;</span>
      </div>
      ${has ? `<div class="g-fig"><span class="g-fig-n">${g.n}</span><span class="g-fig-of"> of ${g.total}</span><span class="g-fig-u">Reps at Goal</span></div>
        <div class="g-bar"><div class="g-bar-fill ${all?'achieved':g.n>0?'inprogress':'notstarted'}" style="width:${Math.round(share)}%"></div></div>
        <div class="g-bar-cap">Team progress: ${Math.round(share)}% of eligible reps at goal</div>`
        : `<div class="g-need">${loaded?'No data yet \u2014 not counted':'Loading…'}</div>`}
      <div class="g-meta">MPO Weight: ${Math.round((o.weight||0)*100)}%<span class="g-review">Review Reps</span></div>
    </button></div>`;
}

// One scope+month block: header, weighted summary strip, then the cards.
// THE SUMMARY IS ALWAYS THE WHOLE MONTH, never the filtered subset -- the
// weights sum to 1 across a month's objectives, so a supplier filter would
// otherwise print a weighted percentage that means nothing. Its first tile
// says "across all N objectives" for exactly that reason, same as the board.
function mpoSectionHtml(scope, mk, progs){
  const S = MPO_SCOPES[scope], M = S.mod;
  const month = M.MONTHS.find(m=>m.key===mk);
  const objs = month ? month.objectives : [];
  const D = mpoDataFor(scope, mk);
  const objPct = o => (D && o.hasData) ? M.objPct(o, D) : 0;
  const atGoal = o => (D && o.hasData) ? M.atGoalFor(o, D) : null;
  const hidden = objs.length - progs.length;
  return `<section class="g pv-mpo">
    <div class="g-step-head">
      <div class="g-title">${E(S.label)} MPO</div>
      <div class="g-sub">${E(month?month.label:mk)} · tap a program to see every rep&rsquo;s result.${hidden>0?` <span class="pv-mpo-filtered">${hidden} more objective${hidden===1?'':'s'} hidden by your filters</span>`:''}</div>
    </div>
    ${progs.map(mpoProgramCardHtml).join('')}
  </section>`;
}

/* ====================================================================
   MANAGER EXPORTS (2026-10-02; Amplitude's export menu: data vs report)
   EXPORT DATA = the COMPLETE filtered result set as CSV -- every program
   the Program View filters keep, crossed with every rep on this manager's
   authorized roster (ROSTER is already cut to a district manager's team),
   not just what is drawn on screen. EXPORT RECAP = a print-ready report
   (Save as PDF from the print dialog) of the same set: team results per
   program, every rep's progress and what is left, deadlines, definitions
   and data freshness; account lines only when asked for. Both reuse the
   trackers' own numbers (p.forRep, progFacts, programStats, distFor) --
   nothing is recalculated, nothing is narrated, and a lead or eligible
   account is never shown as a result. Manager Mode only (reps never reach
   Program View); preview cannot export.
   ==================================================================== */
const EXPORT_DEFS = [
  ['Participating reps', 'Reps on this manager’s roster the program applies to and the tracker has data for (territory and support-rep rules applied).'],
  ['Qualified / at goal', 'The tracker’s own status: an incentive marked complete or exceeded, or an MPO objective marked achieved.'],
  ['Progress, goal, remaining', 'The tracker’s figures for that rep, in the program’s own unit; remaining = goal minus current, never below zero.'],
  ['Credited lines', 'Placements or purchases the tracker credits to the rep (customer, product, date). Some trackers publish a total without lines.'],
  ['Not included', 'Possible opportunities, eligible accounts and leads are not results and are not counted. No payout or dollar figures are in this export.'],
];
function exportFilterText(f){
  const sup = f.sup==='all' ? 'All suppliers' : f.sup;
  const mon = f.month==='active' ? 'Active now' : f.month==='all' ? 'All months' : f.month;
  return `Type: ${f.type==='all'?'All':f.type==='inc'?'Incentives':'MPOs'} · Premise: ${f.chan==='all'?'All':f.chan==='on'?'On-Premise':'Off-Premise'} · Supplier: ${sup} · Month: ${mon}`;
}
function exportScopeText(){ return HUB_TEAM ? `${HUB_TEAM.dm}’s team (${ROSTER.length} reps)` : `Every rep (${ROSTER.length})`; }
function programsForExport(onlyId){
  if(onlyId){ const p = PROGRAMS.find(x=>x.id===onlyId); return p ? [p] : []; }
  const f = state.filters;
  return PROGRAMS.filter(p=>
    (f.type==='all' || (f.type==='inc' ? p.type==='Incentive' : p.type==='MPO')) &&
    (f.chan==='all' || p.channel===f.chan || (p.channel==='both')) &&
    (f.sup==='all' || p.supplier===f.sup) &&
    (f.month==='all' ? true : f.month==='active' ? isActive(p) : p.monthKey===f.month))
    .sort((a,b)=> (isActive(b)-isActive(a)) || (a.period.end-b.period.end) || a.name.localeCompare(b.name));
}
const isoDay = d => d instanceof Date && !isNaN(d) ? new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10) : '';
function dataDateOf(p){ if(p.type!=='MPO') return p.refreshed || incRefreshed() || ''; const sl = (mpoState[p.source]||{})[p.monthKey]; return sl && sl.syncedAt ? fmtSynced(sl.syncedAt) : ''; }
function qualifiedOf(p, r){ if(!r) return ''; if(p.type==='MPO') return gStatusOf(r)==='achieved' ? 'yes' : 'no'; return (r.status==='complete' || r.status==='exceeded') ? 'yes' : 'no'; }
function exportRows(list, withLines){
  const repDm = rep => { const g = DM_GROUPS.find(x=>x.reps.includes(rep)); return g ? g.dm : ''; };
  const rows = [];
  list.forEach(p=>{
    const loaded = p.type!=='MPO' || mpoMonthLoaded(p.source, p.monthKey);
    ROSTER.forEach(rep=>{
      if(!supportAllows(rep, p)) return;
      const r = loaded ? p.forRep(rep) : null; if(!r) return;
      const f = progFacts(p, r, rep) || {};
      const N = p.type==='MPO' ? mpoNums(r) : incNums(r);
      const unit = p.type==='MPO' ? ((p.objective && p.objective.unit) || '') : (unitOf(r)||'');
      const strip = v => String(v||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
      const base = {record:'rep_progress', program_id:p.id, program_title:p.shortName||p.name, program_source_name:p.name, type:p.type, supplier:p.supplier, premise:p.channelLabel, month:p.monthKey,
        period_start:isoDay(p.period.start), period_end:isoDay(p.period.end), rep, district_manager:repDm(rep),
        status: f.label || '', qualified: qualifiedOf(p, r), current: N ? N.cur : '', goal: N ? N.goal : '', remaining: N ? N.need : '', unit,
        progress_text: strip(f.main), remaining_text: strip(f.need), pct: r.pct!=null ? Math.round(r.pct*10)/10 : '', data_as_of: dataDateOf(p),
        account_num:'', account_name:'', product:'', credit_date:''};
      rows.push(base);
      if(withLines && r.status!=='unavailable' && !r.soon){
        distFor(p, rep).forEach(x=>rows.push(Object.assign({}, base, {record:'credited_line', status:'', qualified:'', current:'', goal:'', remaining:'', progress_text:'', remaining_text:'', pct:'',
          account_num: x.n || '', account_name: x.name || '', product: x.what || '', credit_date: x.date || ''})));
      }
    });
  });
  return rows;
}
const csvCell = v => { const t = String(v==null?'':v); return /[",\n\r]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; };
function downloadText(name, text, type){
  const blob = new Blob([text], {type});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function exportStamp(){ const d = new Date(); return {iso: d.toISOString(), label: d.toLocaleString('en-US', {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'}), file: d.toISOString().slice(0,16).replace(/[:T]/g,'-')}; }
async function ensureLoadedFor(list){ const need = neededMonths(list); if(need.length) await Promise.all(need.map(x=>ensureMpoMonth(x[0], x[1]))); }
async function exportData(onlyId, withLines){
  const list = programsForExport(onlyId);
  await ensureLoadedFor(list);
  const rows = exportRows(list, withLines);
  const st = exportStamp();
  const cols = ['record','program_id','program_title','program_source_name','type','supplier','premise','month','period_start','period_end','rep','district_manager','status','qualified','current','goal','remaining','unit','progress_text','remaining_text','pct','data_as_of','account_num','account_name','product','credit_date'];
  const head = [
    ['# Kohler Dist Hub — Program Data Export'], ['# Generated', st.label], ['# Filters', onlyId ? 'One program: '+(list[0] ? list[0].shortName||list[0].name : onlyId) : exportFilterText(state.filters)],
    ['# Scope', exportScopeText()], ['# Programs', String(list.length)], ['# Rows', String(rows.length)+(withLines ? ' (rep progress + credited lines)' : ' (rep progress)')],
    ['# Note', 'Tracker figures as published; leads and eligible accounts are not results; no dollar figures.'], []];
  const text = head.map(r=>r.map(csvCell).join(',')).join('\r\n') + '\r\n' + cols.join(',') + '\r\n' + rows.map(r=>cols.map(c=>csvCell(r[c])).join(',')).join('\r\n') + '\r\n';
  downloadText(`kohler-programs-${st.file}.csv`, '﻿'+text, 'text/csv;charset=utf-8');
  return {rows: rows.length, programs: list.length};
}
async function exportRecap(onlyId, withAccounts){
  const list = programsForExport(onlyId);
  await ensureLoadedFor(list);
  const st = exportStamp();
  const esc = E;
  const sections = list.map(p=>{
    const loaded = p.type!=='MPO' || mpoMonthLoaded(p.source, p.monthKey);
    const stt = loaded ? programStats(p) : null;
    const reps = [];
    if(loaded) ROSTER.forEach(rep=>{ if(!supportAllows(rep, p)) return; const r = p.forRep(rep); if(!r || r.soon) return; reps.push({rep, r, f: progFacts(p, r, rep) || {}}); });
    reps.sort((a,b)=> (qualifiedOf(p,b.r)==='yes') - (qualifiedOf(p,a.r)==='yes') || ((b.r.pct||0)-(a.r.pct||0)) || a.rep.localeCompare(b.rep));
    const repRows = reps.map(({rep, r, f})=>`<tr><td>${esc(rep)}</td><td>${f.main||'—'}</td><td>${f.need && f.need!==f.label ? f.need : (qualifiedOf(p,r)==='yes' ? 'Goal met' : '—')}</td><td>${esc(f.label||'')}</td></tr>${withAccounts ? (()=>{ const L = r.status==='unavailable' ? [] : distFor(p, rep); return L.length ? `<tr class="lines"><td></td><td colspan="3">${L.map(x=>`${esc(x.name)}${x.n ? ' #'+esc(x.n) : ''} · ${esc(x.what||'')}${x.date ? ' · '+esc(x.date) : ''}`).join('<br>')}</td></tr>` : ''; })() : ''}`).join('');
    // the program's own requirement lines; payout terms ($) stay on the trackers, not in a performance recap
    const rules = (p.rules||[]).map(x=>String(x).replace(/<[^>]+>/g,'')).filter(x=>!/\$\s?\d/.test(x)).slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('');
    return `<section class="prog"><h2>${esc(p.shortName||p.name)}</h2>
      <p class="meta">${esc(p.supplier)} · ${esc(p.channelLabel)} · ${esc(p.type==='MPO' ? p.monthLabel+' MPO' : 'Incentive')} · ${esc(p.period.label)} · ${esc(endsLabel(p.period))}</p>
      ${p.shortName && p.shortName!==p.name ? `<p class="full">Full program name: ${esc(p.name)}</p>` : ''}
      ${rules ? `<ul class="rules">${rules}</ul>` : ''}
      ${!loaded ? '<p class="na">Data not loaded for this month.</p>' : p.manual ? '<p class="na">Verified by hand from iSellBeer photos — no data feed, so no completion numbers.</p>' : !stt.participants ? '<p class="na">No export for this program yet.</p>' : `
      <div class="kpis"><div><b>${stt.participants}</b><span>participating reps</span></div><div><b>${stt.complete}</b><span>at goal</span></div><div><b>${Math.round(stt.pctComplete)}%</b><span>of reps at goal</span></div>${stt.avg!=null ? `<div><b>${Math.round(stt.avg)}%</b><span>average progress</span></div>` : ''}</div>
      <table><thead><tr><th>Rep</th><th>Current</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${repRows}</tbody></table>`}
      <p class="fresh">Data as of ${esc(dataDateOf(p) || 'not stated')}</p></section>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Program Recap · ${esc(st.label)}</title>
<style>
@page{size:letter;margin:14mm}
body{font:14px/1.45 -apple-system,"Segoe UI",Inter,Arial,sans-serif;color:#1a1c1f;margin:24px;max-width:960px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:0 0 2px} .sub{color:#4a4f57;margin:0 0 2px}
.bar{display:flex;gap:8px;margin:12px 0 18px} .bar button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #2F5FC4;background:#2F5FC4;color:#fff;cursor:pointer}
.prog{border-top:1px solid #d5d8dd;padding:14px 0 10px;break-inside:avoid-page} .meta,.full,.fresh{color:#4a4f57;margin:2px 0} .fresh{font-size:12.5px}
.rules{margin:6px 0 8px;padding-left:18px;color:#33373d} .na{color:#4a4f57;font-style:italic}
.kpis{display:flex;flex-wrap:wrap;gap:8px 22px;margin:8px 0} .kpis b{display:block;font-size:18px} .kpis span{color:#4a4f57;font-size:12.5px}
table{width:100%;border-collapse:collapse;margin:6px 0} th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e3e5e8;vertical-align:top} th{font-size:12.5px;color:#4a4f57;font-weight:600}
tr.lines td{font-size:12.5px;color:#33373d;border-bottom:1px solid #e3e5e8}
dl{display:grid;grid-template-columns:200px 1fr;gap:4px 14px} dt{font-weight:600} dd{margin:0;color:#33373d}
@media print{.bar{display:none} body{margin:0}}
</style></head><body>
<h1>Program Recap</h1>
<p class="sub">Generated ${esc(st.label)} · ${esc(exportScopeText())}</p>
<p class="sub">${esc(onlyId ? 'One program' : exportFilterText(state.filters))} · ${list.length} ${list.length===1?'program':'programs'}${withAccounts ? ' · with credited account lines' : ''}</p>
<p class="sub">Incentive data refreshed ${esc(incRefreshed()||'—')}. MPO data dates are shown per program.</p>
<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
${sections || '<p class="na">No programs match these filters.</p>'}
<section class="prog"><h2>Definitions</h2><dl>${EXPORT_DEFS.map(([a,b])=>`<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></section>
</body></html>`;
  const w = window.open('', '_blank');
  if(w && w.document){ w.document.open(); w.document.write(html); w.document.close(); }
  else downloadText(`kohler-program-recap-${st.file}.html`, html, 'text/html;charset=utf-8');
  return {programs: list.length, html};
}
// EXPORTS (2026-10-04, Gavin: explicit buttons, not a hidden menu). Both read
// the COMPLETE filtered set for the authorized roster -- never just the page.
function exportMenuHtml(onlyId){
  if(!isMgr() || LOCKED_REP || state.asRep || (KDH_USER && KDH_USER.preview)) return '';
  const pid = onlyId ? ` data-prog="${E(onlyId)}"` : '';
  const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return `<div class="xbar" role="group" aria-label="Export">
    <button type="button" class="xbtn2" data-act="export-data"${pid}>${ico('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>')}<b>Download CSV</b></button>
    <button type="button" class="xbtn2" data-act="export-recap"${pid}>${ico('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>')}<b>Export Recap</b></button>
    <details class="xopts"><summary>Options</summary><div class="xpanel">
      <label class="xopt"><input type="checkbox" id="xLines"> CSV: include credited account lines</label>
      <label class="xopt"><input type="checkbox" id="xAccts"> Recap: include account detail</label>
      <p class="xnote">${E(exportScopeText())} · tracker figures as published · no dollar figures</p></div></details>
  </div>`;
}
function screenPrograms(){
  const f = state.filters;
  const sups = [...new Set(PROGRAMS.map(p=>p.supplier))].sort((a,b)=>a.localeCompare(b));
  const months = [...new Set(PROGRAMS.map(p=>p.monthKey))].sort().reverse();
  const monthLabel = mk => { const y=+mk.slice(0,4), m=+mk.slice(5,7)-1; return new Date(y,m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}); };
  let list = PROGRAMS.filter(p=>
    (f.type==='all' || (f.type==='inc' ? p.type==='Incentive' : p.type==='MPO')) &&
    (f.chan==='all' || p.channel===f.chan || (p.channel==='both')) &&
    (f.sup==='all' || p.supplier===f.sup) &&
    (f.month==='all' ? true : f.month==='active' ? isActive(p) : p.monthKey===f.month));
  const pending = neededMonths(list);
  list.sort((a,b)=> (isActive(b)-isActive(a)) || (a.period.end-b.period.end) || a.name.localeCompare(b.name));
  const sel = (name, opts, val) => `<select class="fsel" data-filter="${name}">${opts.map(o=>`<option value="${E(o.v)}"${o.v===val?' selected':''}>${E(o.l)}</option>`).join('')}</select>`;
  let html = `<div class="pv-head">
    <div class="pv-title"><h1>Program View</h1>${exportMenuHtml('')}</div>
    <p class="pv-sub">Every program on the board, by program instead of by rep — participation, completion and who is where.</p>
    ${refreshedLine()}
    <div class="filters">
      <div class="fgrp"><span class="fl">Type</span>${['all','inc','mpo'].map(v=>`<button class="fpill${f.type===v?' active':''}" data-filter="type" data-v="${v}">${v==='all'?'All':v==='inc'?'Incentives':'MPOs'}</button>`).join('')}</div>
      <div class="fgrp"><span class="fl">Channel</span>${['all','on','off'].map(v=>`<button class="fpill${f.chan===v?' active':''}" data-filter="chan" data-v="${v}">${v==='all'?'All':v==='on'?'On-Premise':'Off-Premise'}</button>`).join('')}</div>
      <div class="fgrp"><span class="fl">Supplier</span>${sel('sup', [{v:'all',l:'All suppliers'}].concat(sups.map(s=>({v:s,l:s}))), f.sup)}</div>
      <div class="fgrp"><span class="fl">Rep</span><select class="pv-rep" id="pvRep" aria-label="Open one rep’s programs"><option value="">All reps (${ROSTER.length})</option>${DM_GROUPS.map(g=>({dm:g.dm, reps:g.reps.filter(r=>ROSTER.includes(r))})).filter(g=>g.reps.length).map(g=>`<optgroup label="${E(g.dm)}">${g.reps.map(r=>`<option value="${E(r)}">${E(r)}</option>`).join('')}</optgroup>`).join('')}${(()=>{ const inG = new Set(DM_GROUPS.flatMap(g=>g.reps)); const o = ROSTER.filter(r=>!inG.has(r)); return o.length ? `<optgroup label="Other">${o.map(r=>`<option value="${E(r)}">${E(r)}</option>`).join('')}</optgroup>` : ''; })()}</select></div>
      <div class="fgrp"><span class="fl">Month</span>${sel('month', [{v:'active',l:'Active now'},{v:'all',l:'All months'}].concat(months.map(m=>({v:m,l:monthLabel(m)}))), f.month)}</div>
    </div>
  </div>`;
  if(pending.length) html += `<div class="loading">Loading MPO data for ${pending.map(x=>MPO_SCOPES[x[0]].label+' '+monthLabel(x[1])).join(', ')}…</div>`;
  if(!list.length) html += `<div class="empty">No programs match those filters.</div>`;

  // MPOs render as the dashboards' own objective cards, grouped by scope and
  // month (a month's weights sum to 1 within ONE scope, so on- and
  // off-premise can never share a summary strip). Incentives keep the
  // participation grid below them -- they have no weight, no house goal and
  // no reps-at-goal number for these cards to show.
  const mpos = list.filter(p=>p.type==='MPO');
  const incs = list.filter(p=>p.type!=='MPO');
  const groups = [];
  mpos.forEach(p=>{
    let g = groups.find(x=>x.scope===p.source && x.mk===p.monthKey);
    if(!g) groups.push(g = {scope:p.source, mk:p.monthKey, progs:[]});
    g.progs.push(p);
  });
  // Newest month first, then the scope order MPO_SCOPES declares (on, off).
  const scopeOrder = Object.keys(MPO_SCOPES);
  groups.sort((a,b)=> b.mk.localeCompare(a.mk) || (scopeOrder.indexOf(a.scope)-scopeOrder.indexOf(b.scope)));
  // Inside a section, keep the month's own objective order (heaviest first,
  // as the deck writes it) rather than this screen's active/end-date sort --
  // the board a manager is comparing against lists them that way.
  groups.forEach(g=>{
    const month = MPO_SCOPES[g.scope].mod.MONTHS.find(m=>m.key===g.mk);
    const order = month ? month.objectives.map(o=>o.key) : [];
    g.progs.sort((a,b)=> order.indexOf(a.key) - order.indexOf(b.key));
    html += mpoSectionHtml(g.scope, g.mk, g.progs);
  });
  if(groups.length && incs.length) html += `<div class="g-step-head pv-inc-head"><div class="g-title">Incentives</div>
    <div class="g-sub">Supplier programs — participation and completion across the roster.</div></div>`;
  if(incs.length) html += `<div class="pgrid">${incs.map(p=>{
    const loaded = p.type!=='MPO' || mpoMonthLoaded(p.source, p.monthKey);
    const st = loaded ? programStats(p) : null;
    const exp = loaded ? p.exposure() : null;
    const ag = (loaded && p.atGoal) ? p.atGoal() : null;
    return `<article class="pvcard${isActive(p)?'':' over'}" data-act="open-program" data-prog="${E(p.id)}" tabindex="0" role="button">
      <div class="pcard-top">${logoStrip(p)}<div class="pcard-title"><div class="pcard-name">${E(p.name)}</div>
        <div class="pcard-meta">${typeChips(p)}<span class="chip sup">${E(p.supplier)}</span>${isActive(p)?'':'<span class="chip over">Ended</span>'}</div></div></div>
      ${!loaded ? '<div class="soon-note">Loading…</div>' : p.manual ? '<div class="soon-note">Manually verified — no data feed, so no completion numbers.</div>' : st.participants===0 ? '<div class="soon-note">Waiting on the first export for this program.</div>' : `
      <div class="facts">
        <div class="fact"><span class="fact-l">Participating reps</span><span class="fact-v">${st.participants}</span></div>
        <div class="fact"><span class="fact-l">Completed</span><span class="fact-v ok">${st.complete}</span><span class="fact-s">${st.incomplete} not yet</span></div>
        <div class="fact"><span class="fact-l">Overall completion</span><span class="fact-v">${Math.round(st.pctComplete)}%</span><span class="fact-s">${st.avg!=null?`avg progress ${Math.round(st.avg)}%`:`${st.started} reps on the board`}</span></div>
        <div class="fact"><span class="fact-l">${exp!=null?'Payout exposure':'Reward'}</span><span class="fact-v${exp!=null?'':' small'}">${exp!=null?'$'+exp.toLocaleString('en-US'):E(p.reward||'—')}</span></div>
      </div>
      <div class="bar"><div class="bar-fill ${st.pctComplete>=100?'earned':st.pctComplete>=ALMOST_PCT?'close':st.pctComplete>0?'ontrack':'notstarted'}" style="width:${Math.max(st.pctComplete, st.pctComplete>0?2:0)}%"></div></div>`}
      <div class="pcard-foot"><span class="period">📅 ${E(p.period.label)} · ${E(endsLabel(p.period))}</span><span class="refreshed">Data ${E(p.refreshed?'refreshed '+p.refreshed:'loading…')}</span><span class="viewbtn">Rep rankings <span class="ar">›</span></span></div>
    </article>`;}).join('')}</div>`;
  return `<div class="pview">${html}</div>`;
}
function screenProgram(){
  const p = PROGRAMS.find(x=>x.id===state.prog);
  if(!p) return `<div class="empty">That program is not on the board.</div>`;
  const loaded = p.type!=='MPO' || mpoMonthLoaded(p.source, p.monthKey);
  const st = loaded ? programStats(p) : null;
  const rank = loaded ? p.ranking() : [];
  const exp = loaded ? p.exposure() : null;
  const ag = (loaded && p.atGoal) ? p.atGoal() : null;
  const notIn = loaded ? ROSTER.filter(rep=>supportAllows(rep, p) && !p.forRep(rep)) : [];
  return `<div class="detail pdetail">
    <div class="pv-title"><button class="back" data-act="programs"><span class="ar">‹</span> Back to Program View</button>${exportMenuHtml(p.id)}</div>
    <div class="dhero">
      <div class="dhero-top">${logoStrip(p,'lg')}<div class="dhero-meta">${typeChips(p)}<span class="chip sup">${E(p.supplier)}</span>${p.territory?`<span class="chip terr">${E(p.territory)}</span>`:''}${isActive(p)?'':'<span class="chip over">Ended</span>'}</div></div>
      <div class="dhero-sup">${E(p.supplier)} · ${E(p.monthLabel)}</div>
      <h1 class="dhero-name">${E(p.name)}</h1>
      ${p.pitch ? `<p class="dhero-pitch">${E(p.pitch)}</p>` : ''}
      ${st && st.participants ? `<div class="pstats">
        <div class="pstat"><div class="pstat-n">${st.participants}</div><div class="pstat-l">participating reps</div></div>
        <div class="pstat good"><div class="pstat-n">${st.complete}</div><div class="pstat-l">completed</div></div>
        <div class="pstat"><div class="pstat-n">${st.incomplete}</div><div class="pstat-l">not yet</div></div>
        <div class="pstat accent"><div class="pstat-n">${Math.round(st.pctComplete)}%</div><div class="pstat-l">overall completion${st.avg!=null?` · avg ${Math.round(st.avg)}%`:''}</div></div>
        ${exp!=null?`<div class="pstat amber"><div class="pstat-n">$${exp.toLocaleString('en-US')}</div><div class="pstat-l">payout exposure so far</div></div>`:''}
        ${ag && ag.headline ? `<div class="pstat"><div class="pstat-n">${E(ag.headline)}</div><div class="pstat-l">${E(ag.sub||'')}</div></div>`:''}
      </div>` : `<div class="soon-note">${loaded ? (p.manual ? 'Manually verified — no data feed, so no completion numbers.' : 'Waiting on the first export for this program.') : 'Loading…'}</div>`}
      <div class="dhero-line"><span class="period">📅 ${E(p.period.label)} · ${E(endsLabel(p.period))}</span><span class="refreshed">Data ${E(p.refreshed?'refreshed '+p.refreshed:'loading…')}</span></div>
    </div>
    <section class="dsec">
      <h2 class="dsec-h">Rules &amp; payout</h2>
      <ul class="rules">${p.rules.map(x=>`<li>${p.type==='Incentive' ? ruleHl(x) : E(x)}</li>`).join('')}</ul>
      ${p.type==='MPO' ? `<p class="note"><a href="${E(MPO_SCOPES[p.source].page)}#view=program&program=${encodeURIComponent(p.key)}&month=${E(p.monthKey)}">Open on the ${E(p.channelLabel)} MPO tracker ›</a></p>` : `<p class="note"><a href="${INC_ASSETS}index.html">Open the Incentive Tracker ›</a></p>`}
    </section>
    <section class="dsec">
      <h2 class="dsec-h">Rep rankings</h2>
      ${rank.length ? `<p class="dsec-p">${plw(rank.length,'rep')} ranked by ${E(rank[0].metricLabel)} · tap a rep for their full breakdown</p>${leaderboard(p, rank, state.rep, 0)}` : `<div class="empty small">${loaded ? 'No rep activity yet for this program.' : 'Loading…'}</div>`}
      ${notIn.length && rank.length ? `<p class="note">Not in this program: ${E(notIn.join(', '))}.</p>` : ''}
    </section>
  </div>`;
}


/* ====================================================================
   REP-MODE SCREENS (2026-09-30) -- Incentives > Supplier > Program >
   Accounts > Account. Built from the same p.forRep() / nextAccounts() /
   distFor() / RA the page already had; nothing is recomputed here.
   ==================================================================== */
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
const BACKI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const uPl = (n, u) => { u = String(u||'').trim(); if(!u) return ''; if(n===1) return /s$/.test(u) && !/ss$/.test(u) ? u.replace(/s$/,'') : u; return /s$/.test(u) ? u : u+'s'; };
const returnLink = (act, label, extra) => `<button class="hreturn" data-act="${act}"${extra||''}>${BACKI}<span>${E(label)}</span></button>`;
// ONE READ OF A PROGRAM'S PROGRESS, used by every row and the program
// screen: {main "6 of 8 accounts", need "2 more accounts needed" | "Goal met",
// pct, cls met|ontrack|attn|open|na, label, rule (the supporting goal text)}.
function progFacts(p, r, rep){
  if(!r) return null;
  if(r.status==='unavailable') return {main:'Not in your territory', need:'', pct:null, cls:'na', label:'Not in your territory', rule:r.sub||''};
  if(r.soon) return {main: r.loading ? 'Loading…' : (p.manual ? 'Verified by hand from iSellBeer photos' : 'Awaiting the first export'), need:'', pct:null, cls:'na', label: r.loading ? 'Loading' : 'Awaiting data', rule:''};
  if(p.type==='MPO'){
    const N = mpoNums(r); const unit = (p.objective && p.objective.unit) || '';
    const st = gStatusOf(r); const cls = st==='achieved' ? 'met' : st==='inprogress' ? 'ontrack' : 'open';
    const label = st==='achieved' ? 'Goal met' : st==='inprogress' ? 'In progress' : 'Not started';
    if(!N) return {main:E(r.now||'—'), need:E(r.remain||''), pct:r.pct, cls, label, rule:r.goal||''};
    const main = unit ? `${fmtN(N.cur)} of ${fmtN(N.goal)} required ${uPl(N.goal, unit)}` : `${E(r.now||fmtN(N.cur))} of ${E(r.goal||fmtN(N.goal))}`;
    const need = N.need<=0 ? 'Requirement met' : (unit ? `${fmtN(N.need)} more ${uPl(N.need, unit)} needed` : `${E(r.remain||fmtN(N.need)+' more needed')}`);
    // The tracker's own goal text carries the rule ("40% of my account base (13 of 31)").
    const rule = r.explain && r.explain.length ? r.explain[1] || r.explain[0] : (r.goal && !/^\d[\d,.]*\s/.test(String(r.goal)) ? 'Goal is '+String(r.goal).replace(/^my /,'your ').replace(/ my /,' your ') : '');
    return {main, need, pct:Math.max(0,Math.min(100,r.pct||0)), cls, label, rule, segments:r.segments||null, explain:r.explain||null, weight:r.weight};
  }
  const b = incBand(p, r) || {cls:'open', label:''};
  if(r.openEnded) return {main:E(r.now||'—'), need:'Every one pays — no goal to count down', pct:null, cls:'open', label:b.label, rule:''};
  const N = incNums(r);
  if(!N) return {main:E(r.now||'—'), need:E(r.remain||''), pct:r.pct, cls:b.cls, label:b.label, rule:''};
  // A percentage goal (Lytt: "25% of your accounts"): say it in accounts
  // when the tracker gives the counts, never inferred from a rounded %.
  if(/%/.test(String(r.goal||'')) && p.source==='inc'){
    const d = p.entry.getRep(rep) || {};
    const buying = Number(d.buyingAccountCount), elig = Number(d.eligibleAccountCount), tier = Number(N.goal);
    const cov = Number(N.cur);
    if(isFinite(buying) && isFinite(elig) && elig>0 && isFinite(tier)){
      const goalN = Math.ceil(tier/100*elig - 1e-9), needN = Math.max(0, goalN - buying);
      const rule = `Current account coverage ${fmtN(cov)}% · Target ${fmtN(tier)}% (${fmtN(goalN)} of your ${fmtN(elig)} eligible accounts)`;
      return {main:`${fmtN(buying)} of ${fmtN(goalN)} accounts`, need: needN<=0 ? (tier>=100 ? 'Top tier reached' : 'Goal met') : `${fmtN(needN)} more ${uPl(needN,'account')} needed`, pct:Math.max(0,Math.min(100,r.pct||0)), cls:b.cls, label:b.label, rule};
    }
    const pts = Math.max(0, N.goal - N.cur);
    return {main:`Current account coverage ${fmtN(N.cur)}%`, need: pts<=0 ? 'Goal met' : `Target ${fmtN(N.goal)}% · ${fmtN(pts)} percentage points remaining`, pct:Math.max(0,Math.min(100,r.pct||0)), cls:b.cls, label:b.label, rule:''};
  }
  const u = unitOf(r);
  const house = r.house ? ' (house goal)' : '';
  if(u){
    // The tracker's own headline stays as the supporting line when it says
    // more than the count ("894 vs 1175 Sam Adams cases last Aug–Sep").
    const plain = new RegExp('^[\\d,.]+ of [\\d,.]+ '+u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i').test(String(r.now||'').trim());
    const rule = [r.house ? subNoMoney(r.sub) : '', (!plain && r.now && !/\$/.test(r.now)) ? r.now : ''].filter(Boolean).join(' · ');
    return {main:`${fmtN(N.cur)} of ${fmtN(N.goal)} ${E(uPl(N.goal,u))}${house}`, need: N.need<=0 ? 'Goal met' : `${fmtN(N.need)} more ${E(uPl(N.need,u))} needed${r.house?' company-wide':''}`, pct:Math.max(0,Math.min(100,(N.cur/N.goal)*100)), cls:b.cls, label:b.label, rule};
  }
  return {main:E(r.now||`${fmtN(N.cur)} of ${fmtN(N.goal)}`), need: N.need<=0 ? 'Goal met' : E(r.remain||`${fmtN(N.need)} more needed`), pct:Math.max(0,Math.min(100,(N.cur/N.goal)*100)), cls:b.cls, label:b.label, rule:''};
}
const htag = f => f && f.label ? `<span class="htag ${f.cls}">${E(f.label)}</span>` : '';
const hbar = f => (f && f.pct!=null) ? `<div class="hbar ${f.cls}"><div class="hbar-fill" style="width:${Math.round(f.pct)}%"></div></div>` : '';
// One program as a row: name + status, supplier/channel and the deadline
// once, one progress line, a thin bar. Tap opens the program.
function progRowHtml(p, r, rep, noSup){
  const f = progFacts(p, r, rep) || {main:'', need:'', cls:'open', label:''};
  const meta = [state.view==='sup' || noSup ? p.channelLabel : `${p.supplier} · ${p.channelLabel}`, endsLabel(p.period)].filter(Boolean).join(' · ');
  const off = r.status==='unavailable' || r.soon;
  const rowLogo = (p.type==='MPO' && p.brandLogos && p.brandLogos[0]) ? `<img class="hrow-lg" src="${E(p.brandLogos[0])}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<button class="hrow prog${off?' off':''}" data-act="open" data-prog="${E(p.id)}" id="card-${E(p.id)}">
    ${rowLogo}<span class="hrow-main">
      <span class="hrow-t"><span>${E(p.type==='MPO' ? (p.shortName||p.name) : (p.shortName||p.name))}</span>${htag(f)}</span>
      <span class="hrow-s">${E(meta)}</span>
      ${f.main ? `<span class="hrow-p"><b>${f.main}</b>${f.need && f.need!==f.label ? ` · ${f.need}` : ''}</span>` : ''}
      ${off ? '' : hbar(f)}
    </span>${CHEV}</button>`;
}
// Incentives grouped by supplier, sorted the way the old page sorted them.
function supProgs(rep){
  const rows = incRows(rep);
  const sups = new Map();
  rows.forEach(x=>{ const k = x.p.supplier; if(!sups.has(k)) sups.set(k, []); sups.get(k).push(x); });
  sups.forEach(list=>list.sort((a,b)=>cmpKey(incSortKey(a), incSortKey(b))));
  return sups;
}
function supOrder(sups){
  const groups = [...sups.entries()].map(([name, list])=>({name, list,
    top: Math.max(...list.map(x=>{ const v = incPctDone(x); return v==null ? -1 : v; })),
    band: Math.min(...list.map(x=>x.b.band))}));
  groups.sort((a,b)=> b.top-a.top || a.band-b.band || a.name.localeCompare(b.name));
  return groups;
}
// Programs that ENDED in a given month (period end inside it), for the record.
function endedIn(rep, key){
  const out = [];
  PROGRAMS.forEach(p=>{
    if(p.type!=='Incentive' || isActive(p) || !supportAllows(rep, p)) return;
    const e = p.period.end; const k = e.getFullYear()+'-'+String(e.getMonth()+1).padStart(2,'0');
    if(k!==key) return;
    const r = p.forRep(rep); if(!r || r.status==='unavailable' || isDollarProgram(r)) return;
    out.push({p, r});
  });
  out.sort((a,b)=>b.p.period.end - a.p.period.end || a.p.supplier.localeCompare(b.p.supplier));
  return out;
}
// The "Previous months" block: August / September pills, then that month's
// ended programs (name · supplier, the finish, the end date) or the notice
// for a month whose recap is not in yet.
function prevMonthsHtml(rep){
  const cur = INC_MONTHS.find(m=>m.key===state.im) || INC_MONTHS[INC_MONTHS.length-1];
  const pills = INC_MONTHS.map(m=>`<button class="mpill${m.key===cur.key?' active':''}" data-act="set-inc-month" data-im="${E(m.key)}" role="tab" aria-selected="${m.key===cur.key?'true':'false'}">${E(m.label)}</button>`).join('');
  let body;
  if(cur.note){
    body = `<div class="kdh-state empty"><b>${E(cur.note)}</b>${cur.sub ? `<span>${E(cur.sub)}</span>` : ''}</div>`;
  } else {
    const ended = endedIn(rep, cur.key);
    body = ended.length ? `<div class="iended-list">${ended.map(x=>{ const f = progFacts(x.p, x.r, rep);
        const okd = x.r.status==='complete'||x.r.status==='exceeded';
        return `<div class="iended-row"><span class="iended-name">${E(x.p.shortName||x.p.name)}<span class="iended-sup">${E(x.p.supplier)}</span></span><span class="iended-fin${okd?' ok':''}">${okd?'Goal met · ':''}${f.main}</span><span class="iended-when">Ended ${E(fmtDay(x.p.period.end))}</span></div>`; }).join('')}</div>`
      : `<div class="kdh-state empty"><b>No ${E(cur.label)} incentives on record for ${E(first(rep))}.</b></div>`;
  }
  return `<section class="iprev" aria-label="Previous months">
      <div class="iprev-head"><span class="iprev-t">Previous Months</span><span class="iprev-s">Review an earlier month’s incentives</span></div>
      <div class="mstrip" role="tablist">${pills}</div>
      ${body}
    </section>`;
}
const endedHtml = rep => prevMonthsHtml(rep);
/* ---- Incentives: one row per supplier ---- */
function screenSuppliers(rep){
  const sups = supProgs(rep); const groups = supOrder(sups);
  const rows = [...sups.values()].flat();
  const met = rows.filter(x=>x.b.band===2).length, onTrack = rows.filter(x=>x.b.band===1).length, attn = rows.filter(x=>x.b.band===0).length;
  // PROGRESS BEFORE DRILLING IN (2026-10-02, Todoist's sections): each
  // supplier is a heading with its programs listed beneath it -- name,
  // status, progress, what is left, deadline -- so nothing needs another
  // tap just to see where a program stands. A row opens the program.
  const list = groups.map(g=>{
    const logo = (g.list[0] && g.list[0].p.supplierLogo) || '';
    return `<section class="hsupg" aria-label="${E(g.name)}">
      <div class="hsupg-h">${supLogoHtml(g.name, logo)}<span class="hsupg-n">${E(g.name)}</span><span class="hsupg-c">${plw(g.list.length,'program')}</span></div>
      <div class="hlist">${g.list.map(x=>progRowHtml(x.p, x.r, rep, true)).join('')}</div></section>`;
  }).join('');
  return `<div class="hview">
    <div class="rep-head">
      <div class="rep-title"><h1>${E(possessive(rep))} Incentives</h1>
        ${roleLine(rep)}${tapShareLink(rep)}
        <div class="rep-sub">${plw(rows.length,'program')} across ${plw(groups.length,'supplier')} · ${rows.length ? `<span class="hs met">${met} met</span> · <span class="hs ontrack">${onTrack} on track</span> · <span class="hs attn">${attn} need${attn===1?'s':''} attention</span>` : ''}</div>
        ${refreshedLine()}</div>
      ${tabbar(rep, 'inc')}
    </div>
    ${rows.length ? `<div class="hsups">${list}</div>` : `<div class="kdh-state empty"><b>No incentives apply to you right now.</b></div>`}
    ${endedHtml(rep)}
  </div>`;
}
/* ---- one supplier's programs ---- */
function screenSupplier(){
  const rep = state.rep, name = state.sup;
  const list = supProgs(rep).get(name) || [];
  const logo = (list[0] && list[0].p.supplierLogo) || '';
  return `<div class="hview">
    ${returnLink('back-list', 'Incentives')}
    <div class="hhead"><div class="hhead-row">${supLogoHtml(name, logo, 'lg')}<div><h1>${E(name)}</h1><p class="hsub">${plw(list.length,'program')} for ${E(first(rep))}</p></div></div></div>
    ${list.length ? `<div class="hlist">${list.map(x=>progRowHtml(x.p, x.r, rep)).join('')}</div>` : `<div class="kdh-state empty"><b>Nothing here right now.</b></div>`}
  </div>`;
}
/* ---- one program: the summary, then the account lists ---- */
function backForProgram(p){
  if(p.type==='MPO') return returnLink('back-list', `${p.channelLabel} MPOs`);
  const sups = supProgs(state.rep); const k = p.supplier;
  if(sups.has(k) && sups.get(k).length>1) return returnLink('back-sup', p.supplier);
  return returnLink('back-list', 'Incentives');
}
function listCounts(p, r, rep){
  const off = r.status==='unavailable' || r.soon;
  const loading = p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey);
  if(off || loading) return {loading, targets:null, dist:null, follow:null, hold:false};
  const plan = nextAccounts(p, rep);
  const T = raSplit(p, rep, plan.rows.filter(a=>!a.foreign));
  return {loading:false, hold:plan.hold, targets:T.live.length, done:T.done.length, skip:T.later.length, dist:distFor(p, rep).length, follow:T.on ? T.follow.length : null};
}
function screenProgramRep(p, r, rep){
  const f = progFacts(p, r, rep);
  const off = r.status==='unavailable' || r.soon;
  const C = listCounts(p, r, rep);
  const BG = off ? [] : brandGoals(p, rep);
  const fams = HubAccounts.PROGRAM_BRANDS[HubAccounts.brandKey(p)];
  const row = (list, label, n, sub) => n==null ? '' : `<button class="hrow" data-act="accts" data-prog="${E(p.id)}" data-list="${list}"><span class="hrow-main"><span class="hrow-t"><span>${E(label)}</span></span>${sub?`<span class="hrow-s">${E(sub)}</span>`:''}</span><span class="hcount">${n}</span>${CHEV}</button>`;
  const lists = C.loading ? `<div class="kdh-state loading">Loading this month’s accounts…</div>` : off ? '' : `<div class="hlist">
      ${BG.length ? '' : row('targets', C.hold ? LISTS.hold : LISTS.targets, C.targets, C.hold ? 'Keep these ordering' : (C.targets ? 'Where to go next' : 'Every eligible account already buys it'))}
      ${row('dist', LISTS.dist, C.dist, C.dist ? `Credited in ${periodLabel(p.period)}` : 'Nothing credited yet')}
      ${C.follow ? row('follow', LISTS.follow, C.follow, 'Accounts you flagged to get back to') : ''}
    </div>`;
  const weight = p.type==='MPO' ? `${p.shortName && p.shortName!==p.name ? `<li>${E(p.name)}</li>` : ''}<li>Worth ${E(String(r.weight||Math.round((p.objective.weight||0)*100)))}% of the ${E(p.monthLabel)} ${E(p.channelLabel)} MPO.</li>` : '';
  // A program with LEGS (Touchdowns & Tea, 2026-09-30): one card, and inside
  // it one block per leg -- Off-Premise / On-Premise -- each with its own
  // Qualifies line, big number, supporting line and what is still needed.
  // "How it is scored" groups the rules the same way. No dollars reach the
  // page: the leg's own lines carry none and its rules go through ruleNoMoney.
  const legs = (!off && r.legs && r.legs.length) ? r.legs : null;
  const legHtml = g => `<section class="px-leg" data-leg="${E(g.key||'')}">
        <div class="px-leg-head"><span class="px-leg-badge">${E(g.label)}</span>${g.where?`<span class="px-leg-where">${E(g.where)}</span>`:''}</div>
        ${g.ask?`<p class="px-qual"><span>Qualifies</span>${E(g.ask)}</p>`:''}
        <div class="px-main">${E(g.big)} ${E(g.cap)}</div>
        ${g.line?`<div class="px-rule">${E(g.line)}</div>`:''}
        ${g.need?`<div class="px-need open">${E(g.need)}</div>`:''}
      </section>`;
  const legRules = legs ? legs.map(g=>{ const R = (g.rules||[]).map(ruleNoMoney).filter(Boolean);
      return R.length ? `<div class="px-leg-badge sm">${E(g.label)}</div><ul class="ibul">${R.map(x=>`<li>${E(x)}</li>`).join('')}</ul>` : ''; }).join('') : '';
  const rules = legRules || repRulesHtml(p, 'ibul');
  const tl = off ? null : p.timeline(rep);
  return `<div class="hview">
    ${backForProgram(p)}
    <div class="px${legs?' has-legs':''}">
      <div class="px-sup">${E(p.supplier)} · ${E(p.channelLabel)}${p.type==='MPO' ? ' · '+E((p.objective&&p.objective.periodText)||p.monthLabel)+' · MPO' : ''}</div>
      <h1 class="px-name">${E(p.shortName||p.name)}</h1>
      ${p.shortName && p.shortName!==p.name ? `<p class="px-full"><span>Full program name</span>${E(p.name)}</p>` : ''}
      <div class="px-meta">${htag(f)}<span class="px-ends">${E(endsLabel(p.period))}</span></div>
      ${off ? `<div class="kdh-state ${r.status==='unavailable'?'unavailable':'empty'}"><b>${f.main}</b>${f.rule?`<span>${E(f.rule)}</span>`:''}</div>` : legs ? `
      <div class="px-legs">${legs.map(legHtml).join('')}</div>` : `
      <p class="px-qual"><span>Qualifies</span>${E(sellAsk(p))}</p>
      <div class="px-prog">
        <div class="px-main">${f.main}</div>
        <div class="px-need ${f.cls}">${f.need}</div>
        ${hbar(f)}
        ${p.type==='MPO' && f.pct!=null ? `<div class="px-cap">Progress: ${Math.round(f.pct)}% of this MPO requirement</div><div class="px-cap dim">MPO Weight: ${Math.round((f.weight||0))}%</div>` : ''}
        ${p.type==='MPO' ? '' : (f.rule ? `<div class="px-rule">${f.rule}</div>` : '')}
        ${f.segments && f.segments.length ? `<div class="px-segs">${f.segments.map(g=>`<div class="px-seg"><span>${E(g.label)}</span><b>${E(g.valueText)}</b></div>`).join('')}</div>` : ''}
      </div>`}
    </div>
    ${lists}
    ${BG.length ? `<section class="hsec"><h2>Your Brand Goals</h2>${brandGoalsHtml(BG, {noTitle:true, oneGoal: p.key==='mabi_retention_fall' ? (r.goal||'goal') : ''})}</section>` : ''}
    <details class="hdet"><summary>How It Is Scored</summary>
      ${legRules ? legRules : rules ? rules.replace('<ul class="ibul">', '<ul class="ibul">'+weight) : `<ul class="ibul">${weight}</ul>`}
      ${(fams && fams.length) ? `<p class="hnote">Pays on ${E(fams.join(' · '))}.</p>` : ''}
      <p class="hnote">Runs ${E(p.period.label)} · numbers as of ${E(p.refreshed||'—')}</p>
    </details>
    ${tl && tl.length ? `<details class="hdet"><summary>Progress So Far</summary>${chartHtml(tl, p, r)}</details>` : ''}
  </div>`;
}
/* ---- account lists ---- */
function acctRowsFor(p, rep, list){
  const plan = nextAccounts(p, rep); const rows = plan.rows.filter(a=>!a.foreign);
  const T = raSplit(p, rep, rows);
  if(list==='dist') return distFor(p, rep).map(x=>Object.assign({}, x, {line:[x.what, x.date].filter(Boolean).join(' · ')}));
  const withLine = a => Object.assign({}, a, {line: plan.hold ? 'Keep ordering' : (a.why||'')});
  if(list==='follow') return T.follow.map(withLine);
  if(list==='done') return T.done.map(withLine);
  if(list==='skip') return T.later.map(withLine);
  return (T.on ? T.live : rows).map(withLine);
}
function acctRowsHtml(key){
  const [pid, list] = key.split('|'); const p = PROGRAMS.find(x=>x.id===pid); const rep = state.rep;
  if(!p) return '';
  const q = String(acctQ[key]||'').trim().toLowerCase();
  const rows = acctRowsFor(p, rep, list).filter(a=>!q || String(a.name||'').toLowerCase().includes(q) || String(a.city||'').toLowerCase().includes(q));
  if(!rows.length) return `<div class="kdh-state empty"><b>${q ? 'No account matches “'+E(q)+'”.' : 'Nothing here yet.'}</b></div>`;
  const show = RA.canShow(rep), edit = RA.canEdit(rep);
  return rows.map(a=>{
    const st = show && list!=='dist' ? RA.get(p.id, a) : null;
    const town = [a.city, a.area || a.rawArea].filter(Boolean).join(' · ');
    return `<button class="hrow acct${st?' ra-'+st.status:''}" data-act="open-acct" data-n="${E(RA.num(a))}" data-list="${list}">
      <span class="hrow-main"><span class="hrow-t"><span>${E(a.name)}</span>${st && list!=='follow' ? `<span class="ra-tag ${st.status}">${RA_MARK[st.status]} ${RA_LABEL[st.status]}</span>` : ''}</span>
        ${town ? `<span class="hrow-s">${E(town)}</span>` : ''}
        ${a.line ? `<span class="hrow-p">${E(a.line)}${list==='follow' && st && st.note ? ` · <i>${E(st.note)}</i>` : ''}</span>` : ''}</span>${CHEV}</button>`;
  }).join('');
}
function screenAccounts(){
  const p = PROGRAMS.find(x=>x.id===state.prog); const rep = state.rep; const list = state.list || 'targets';
  if(!p) return `<div class="empty">That program is not on the board.</div>`;
  const r = p.forRep(rep);
  if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) return `<div class="hview">${returnLink('back-prog', p.shortName||p.name)}<div class="kdh-state loading">Loading this month’s accounts…</div></div>`;
  const plan = nextAccounts(p, rep);
  const key = p.id+'|'+list;
  const rows = acctRowsFor(p, rep, list);
  const T = raSplit(p, rep, plan.rows.filter(a=>!a.foreign));
  const title = list==='targets' && plan.hold ? LISTS.hold : LISTS[list];
  const sub = list==='dist' ? (r ? reconLine(p, r, rows).t : '') : list==='targets' ? (plan.hold ? 'Accounts already buying — keep them ordering.' : 'In your book, in territory, not buying it yet. Warm leads first.') : list==='follow' ? 'Accounts you flagged to get back to.' : '';
  const q = acctQ[key]||'';
  const folds = list==='targets' && T.on ? [['done', T.done.length], ['skip', T.later.length]].filter(x=>x[1]).map(([k,n])=>`<button class="hrow fold" data-act="accts" data-prog="${E(p.id)}" data-list="${k}"><span class="hrow-main"><span class="hrow-t"><span>${RA_MARK[k]} ${E(LISTS[k])}</span></span></span><span class="hcount">${n}</span>${CHEV}</button>`).join('') : '';
  const pv = RA.previewOf(rep) ? `<p class="hnote">Marks are ${E(first(rep))}’s own. Saving is off while you preview.</p>` : '';
  return `<div class="hview">
    ${returnLink('back-prog', p.shortName||p.name)}
    <div class="hhead"><h1>${E(title)}</h1><p class="hsub">${rows.length} ${rows.length===1?'account':'accounts'} · ${E(p.shortName||p.name)}${sub ? ' · '+E(sub) : ''}</p></div>
    ${rows.length>6 ? `<div class="hsearch"><input type="search" class="kdh-field" placeholder="Search accounts" value="${E(q)}" data-key="${E(key)}" autocomplete="off" aria-label="Search accounts"></div>` : ''}
    ${pv}
    <div class="hlist" id="acctRows">${acctRowsHtml(key)}</div>
    ${folds ? `<div class="hlist hfolds">${folds}</div>` : ''}
  </div>`;
}
/* ---- one account ---- */
function screenAccount(){
  const p = PROGRAMS.find(x=>x.id===state.prog); const rep = state.rep; const list = state.list || 'targets';
  if(!p) return `<div class="empty">That program is not on the board.</div>`;
  if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) return `<div class="hview">${returnLink('back-accts', LISTS[list]||'Accounts')}<div class="kdh-state loading">Loading…</div></div>`;
  const n = String(state.n);
  const plan = nextAccounts(p, rep);
  let a = plan.rows.find(x=>RA.num(x)===n) || null;
  const credited = distFor(p, rep).filter(x=>RA.num(x)===n || (a && HubAccounts.norm(x.name)===HubAccounts.norm(a.name)));
  if(!a){ const d = credited[0]; const book = bookIndex(rep).get(n); a = book ? Object.assign({}, book) : (d ? {name:d.name, n:d.n, city:d.city, area:d.area} : null); }
  if(!a) return `<div class="hview">${returnLink('back-accts', LISTS[list]||'Accounts')}<div class="kdh-state empty"><b>That account is not on this list.</b></div></div>`;
  const show = RA.canShow(rep), edit = RA.canEdit(rep);
  const st = show ? RA.get(p.id, a) : null;
  const kv = (k, v) => v ? `<div class="hkv"><span>${E(k)}</span><span>${v}</span></div>` : '';
  const meta = [a.n!=null ? 'Account #'+a.n : '', a.city, a.area || a.rawArea, a.prem ? a.prem+'-premise' : ''].filter(Boolean).join(' · ');
  const strip = show ? raStrip(p, a, edit, show) : '';
  const onList = plan.rows.some(x=>RA.num(x)===n);
  return `<div class="hview">
    ${returnLink('back-accts', LISTS[list]||'Accounts')}
    <div class="hhead"><h1>${E(a.name)}</h1><p class="hsub">${E(meta)}</p></div>
    <p class="hnote" style="margin-top:-4px"><a href="../accounts/#acct=${encodeURIComponent(a.n!=null ? a.n : '')}${(KDH_USER && KDH_USER.role==='manager') ? '&rep='+encodeURIComponent(rep) : ''}&from=${encodeURIComponent(location.pathname+location.hash)}&fl=${encodeURIComponent('Incentive Hub')}" style="color:var(--accent);font-weight:600;text-decoration:none">Full account page — purchases, programs, notes, taps ›</a></p>
    <div class="hcard">
      ${kv('Program', E(p.shortName||p.name) + ' · ' + E(p.supplier))}
      ${kv('What to sell', E(sellAsk(p)))}
      ${onList ? kv(plan.hold ? 'Status' : 'Opportunity', E(noBuyText(a.why || (plan.hold ? 'Keep ordering' : NO_BUY), p))) : ''}
      ${a.note ? kv('Last activity', E(a.note)) : ''}
      ${a.cases>0 ? kv('2026 volume', E(fmtCases(a.cases))+' a year, all brands') : ''}
    </div>
    <section class="hsec"><h2>Credited for This Program</h2>
      ${credited.length ? `<div class="hcard">${credited.map(x=>`<div class="hkv"><span>${E(x.date||'—')}</span><span>${E([x.what, x.note && x.note!=='photo' ? x.note : ''].filter(Boolean).join(' · ')||'Credited')}${x.photo ? ` · <a href="${E(x.photo)}" target="_blank" rel="noopener">View photo ›</a>` : ''}</span></div>`).join('')}</div>` : `<p class="hnote">Nothing credited to this account yet. Credit comes only from sales data.</p>`}
    </section>
    ${show ? `<section class="hsec"><h2>Your Notes</h2>
      <div class="hcard hra">${strip || `<div class="ra"><span class="ra-chip">No mark yet</span></div>`}${RA.error() ? `<div class="ra-err">${E(RA.error())}</div>` : ''}
      ${edit ? `<p class="hnote">Done, Follow up and Not now are your own planning notes. They don’t change credit.</p>` : ''}</div>
    </section>` : ''}
  </div>`;
}

/* ---- main render ---- */
function render(){
  if(LIB){ acctCache.clear(); return; }
  acctCache.clear();
  if(RA.on && state.rep && RA.loadedFor()!==state.rep) RA.load(state.rep);
  const root = app();
  let body;
  if(state.view==='home') body = screenHome();
  else if(state.view==='rep') body = screenRep();
  else if(state.view==='detail') body = screenDetail();
  else if(state.view==='sup') body = screenSupplier();
  else if(state.view==='accts') body = screenAccounts();
  else if(state.view==='acct') body = screenAccount();
  else if(state.view==='programs') body = screenPrograms();
  else if(state.view==='program') body = screenProgram();
  document.body.classList.toggle('is-home', state.view==='home');
  root.innerHTML = topbar() + `<main class="wrap">${body}</main>`;
  // The top bar says whose page this is (a manager on a rep's screen).
  try{ if(window.kdhViewing) window.kdhViewing((state.view==='rep'||state.view==='detail'||state.view==='sup'||state.view==='accts'||state.view==='acct') && !LOCKED_REP ? (state.peek && state.view==='detail' ? state.peek : state.rep) : '', function(){ openCards.clear(); state.showEnded = false; state.asRep = false; go({view:'home', rep:null, main:null, cat:null, prog:null, peek:null, from:null}); }); }catch(e){}
  document.title = state.view==='rep' && state.rep ? `${possessive(state.rep)} Incentives & MPOs | Kohler` : 'Incentives & MPO Hub | Kohler Distributing';
  // Kick off any MPO month this screen needs, then re-render once it lands.
  let needed = [];
  if(state.view==='rep') needed = PROGRAMS.filter(p=>inCategory(p, state.cat||'all')
    && (p.type==='MPO' ? p.monthKey===mpoViewMonth(p.source) : (isActive(p) || state.showEnded)));
  else if(state.view==='home') needed = PROGRAMS.filter(p=>p.type==='MPO' && p.monthKey===mpoRepMonth(p.source));   // for the refreshed stamps
  else if(state.view==='detail' || state.view==='program' || state.view==='accts' || state.view==='acct'){ const p = PROGRAMS.find(x=>x.id===state.prog); if(p) needed=[p]; }
  else if(state.view==='sup') needed = PROGRAMS.filter(p=>p.type==='MPO' && p.monthKey===mpoRepMonth(p.source));
  else if(state.view==='programs'){ const f=state.filters; needed = PROGRAMS.filter(p=>p.type==='MPO' && (f.month==='all' ? true : f.month==='active' ? isActive(p) : p.monthKey===f.month)); }
  if(needed.length){ const token = ++renderToken; loadFor(needed).then(did=>{ if(did && token===renderToken) render(); }); }
}
let renderToken = 0;

/* ---- events ---- */
function raAccount(pid, n){
  const p = PROGRAMS.find(x=>x.id===pid); if(!p || !state.rep) return null;
  const plan = nextAccounts(p, state.rep);
  return plan.rows.find(a=>RA.num(a)===n) || null;
}
document.addEventListener('submit', e=>{
  const f = e.target.closest('form.ra-edit'); if(!f) return;
  e.preventDefault();
  const a = raAccount(f.dataset.prog, f.dataset.n); raEdit = null;
  if(a) RA.set(f.dataset.prog, a, null, f.querySelector('input').value.trim()); else render();
});
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]'); if(!t) return;
  const act = t.dataset.act;
  if(t.tagName==='A') e.preventDefault();
  switch(act){
    case 'home': openCards.clear(); state.showEnded = false; state.asRep = false; go({view:'home', rep:null, main:null, cat:null, prog:null, peek:null, from:null}); break;
    // Picking a name IS the whole landing step: open that rep's dashboard.
    case 'pick-rep': { state.asRep = false; const who = LOCKED_REP || t.dataset.rep, tab = isSupport(who) ? 'on' : lastTab();   // support lands on the on-prem MPO
      openCards.clear(); state.showEnded = false;
      go({view:'rep', rep:who, cat:tab, main:tabOf(tab), month:null, prog:null, peek:null, from:null}); break; }
    case 'back-home': go({view:'home', prog:null, peek:null, from:null}); break;
    case 'my-programs': if(state.rep) go({view:'rep', cat: state.cat || lastTab(), main: tabOf(state.cat || lastTab()), prog:null, from:null, peek:null}); else go({view:'home'}); break;
    case 'set-cat': if(state.only && tabOf(t.dataset.cat)!==state.only) break; openCards.clear(); rememberTab(t.dataset.cat); go({cat:t.dataset.cat, main:tabOf(t.dataset.cat), view:'rep'}, true); break;
    case 'set-month': openCards.clear(); state.showEnded = false; go({month:t.dataset.month, view:'rep'}, true); break;
    case 'toggle-sup': { const k = t.dataset.sup; if(openSups.has(k)) openSups.delete(k); else openSups.add(k); render(); break; }
    case 'open-prog': { openSups.add(t.dataset.sup); const id = t.dataset.prog;
      if(!cardSec[id]) cardSec[id] = 'targets';
      render();
      const el = document.getElementById('card-'+id);
      if(el){ const y = el.getBoundingClientRect().top + window.pageYOffset - 64; window.scrollTo({top:y, behavior:'smooth'}); }
      break; }
    case 'toggle-ended': state.showEnded = !state.showEnded; render(); break;
    case 'set-inc-month': { const y = window.scrollY; state.im = INC_MONTHS.some(m=>m.key===t.dataset.im) ? t.dataset.im : INC_MONTHS[0].key; history.replaceState(null, '', hashOf()); render(); window.scrollTo(0, y); break; }
    case 'card-sec': { const id = t.dataset.prog, k = t.dataset.sec;
      // One section at a time per card, so a phone never stacks two long lists.
      if(cardSec[id]===k) delete cardSec[id]; else cardSec[id] = k;
      render();
      const el = document.getElementById('card-'+id);
      if(el && cardSec[id]){ const y = el.getBoundingClientRect().top + window.pageYOffset - 8; if(y < window.pageYOffset) window.scrollTo({top:y}); }
      break; }
    case 'sec-more': secMore[t.dataset.key] = !secMore[t.dataset.key]; render(); break;
    case 'toggle-card': { const id = t.dataset.prog; if(openCards.has(id)) openCards.delete(id); else openCards.add(id); render();
      const el = document.getElementById('card-'+id); if(el && openCards.has(id)){ const y = el.getBoundingClientRect().top + window.pageYOffset - 8; if(y < window.pageYOffset) window.scrollTo({top:y}); } break; }
    case 'acct-tab': acctTabs[t.dataset.prog] = t.dataset.tab; render(); break;
    case 'acct-more': acctMore[t.dataset.key] = !acctMore[t.dataset.key]; render(); break;
    case 'plan-more': planMore[t.dataset.key] = !planMore[t.dataset.key]; render(); break;
    case 'card-tab': cardTab[t.dataset.prog] = t.dataset.tab; render(); break;
    case 'ra-set': { const a = raAccount(t.dataset.prog, t.dataset.n); if(!a) break;
      const cur = RA.get(t.dataset.prog, a);
      if(cur && cur.status===t.dataset.status) RA.clear(t.dataset.prog, a); else RA.set(t.dataset.prog, a, t.dataset.status); break; }
    case 'ra-note': raEdit = t.dataset.prog+'|'+t.dataset.n; render();
      { const el = document.querySelector('.ra-edit input'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } break;
    case 'ra-cancel': raEdit = null; render(); break;
    case 'log-more': logMore[t.dataset.key] = !logMore[t.dataset.key]; render(); break;
    case 'set-mode': if(LOCKED_REP || state.asRep) break; state.mode = (t.dataset.mode==='manager' && !isMobile()) ? 'manager' : 'rep'; persist();
      // Program View is a Manager Mode screen: switching to Rep Mode there opens the rep picker
      if(state.mode==='rep' && (state.view==='programs' || state.view==='program')){ go({view:'home', prog:null, peek:null, from:null}); break; }
      history.replaceState(null, '', hashOf()); render(); break;
    case 'reset-all': try{ localStorage.removeItem(LS_KEY); sessionStorage.removeItem(TAB_KEY); }catch(e){} openCards.clear(); state.showEnded = false; state.peek = null; state.prog = null; state.rep = null; state.cat = null; state.main = null;
      go({view:'home'}, true); break;
    case 'open': go({view:'detail', prog:t.dataset.prog, from:null, peek:null}); break;
    case 'export-data': case 'export-recap': {
      if(!isMgr() || (KDH_USER && KDH_USER.preview)) break;
      const lines = !!(document.getElementById(t.dataset.act==='export-data' ? 'xLines' : 'xAccts')||{}).checked;
      const lbl = t.querySelector('b'); const was = lbl.textContent; lbl.textContent = 'Preparing…'; t.disabled = true;
      (t.dataset.act==='export-data' ? exportData(t.dataset.prog||'', lines) : exportRecap(t.dataset.prog||'', lines))
        .catch(e=>{ alert('Export failed: '+(e && e.message || e)); })
        .finally(()=>{ lbl.textContent = was; t.disabled = false; const d = t.closest('details'); if(d) d.open = false; });
      break; }
    case 'open-sup': { const name = t.dataset.sup; const one = supProgs(state.rep).get(name) || [];
      // One program only: skip the supplier screen (2026-09-30).
      if(one.length===1) go({view:'detail', prog:one[0].p.id, sup:name, from:null, peek:null}); else go({view:'sup', sup:name}); break; }
    case 'back-list': { openCards.clear(); go({view:'rep', cat: state.cat || lastTab(), main: tabOf(state.cat || lastTab()), prog:null, sup:null, list:null, n:null, from:null, peek:null}); break; }
    case 'back-sup': { if(state.sup && supProgs(state.rep).has(state.sup) && supProgs(state.rep).get(state.sup).length>1) go({view:'sup', prog:null, list:null, n:null}); else go({view:'rep', prog:null, sup:null, list:null, n:null}); break; }
    case 'accts': go({view:'accts', prog:t.dataset.prog || state.prog, list:t.dataset.list || 'targets', n:null}); break;
    case 'open-acct': go({view:'acct', n:t.dataset.n, list:t.dataset.list || state.list || 'targets'}); break;
    case 'back-prog': go({view:'detail', list:null, n:null}); break;
    case 'back-accts': go({view:'accts', n:null}); break;
    case 'open-for-rep': {
      const who = t.dataset.rep;
      // A manager (or a curious rep) opening someone else's row peeks at
      // them; the remembered rep stays whoever picked their name.
      if(!state.rep) go({view:'detail', prog:t.dataset.prog, rep:who, peek:null, from:'program'});
      else go({view:'detail', prog:t.dataset.prog, peek: who===state.rep ? null : who, from: state.view==='program' ? 'program' : null});
      break; }
    case 'programs': go({view:'programs', prog:null}); break;
    case 'open-program': go({view:'program', prog:t.dataset.prog}); break;
  }
});
document.addEventListener('keydown', e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const t = e.target.closest('article[data-act]'); if(!t) return;
  e.preventDefault(); t.click();
});
document.addEventListener('input', e=>{
  const t = e.target.closest('.hsearch input'); if(!t) return;
  acctQ[t.dataset.key] = t.value;
  const list = document.getElementById('acctRows'); if(list) list.innerHTML = acctRowsHtml(t.dataset.key);
});
document.addEventListener('change', e=>{
  if(e.target.id==='pvRep'){ const who = e.target.value; if(who && ROSTER.includes(who)){ state.asRep = false; const tab = isSupport(who) ? 'on' : lastTab(); openCards.clear(); go({view:'rep', rep:who, cat:tab, main:tabOf(tab), month:null, prog:null, peek:null, from:null}); } return; }
  const t = e.target.closest('.fsel'); if(!t) return;
  state.filters[t.dataset.filter] = t.value; render();
});
document.addEventListener('click', e=>{
  const t = e.target.closest('.fpill'); if(!t) return;
  state.filters[t.dataset.filter] = t.dataset.v; render();
});
// The drill-down markup the MPO libraries render carries its own toggles
// (.targets-toggle etc.); those listeners are registered by programs.js.
// The incentive cards' toggles (.js-toggle) are handled in the tracker's
// index.html, so the hub wires the same one here.
document.addEventListener('click', e=>{
  const t = e.target.closest('.js-toggle'); if(!t) return;
  const body = document.getElementById(t.dataset.target);
  t.classList.toggle('open'); if(body) body.classList.toggle('open');
});

/* ---- boot ---- */
function boot(){
  buildPrograms();
  if(LIB) return;                  // the Accounts page drives the rest itself
  restore();                       // only the Rep / Manager mode survives a reload
  // A reload ALWAYS starts over on the home screen with an empty picker (per
  // Gavin, 2026-09-10) -- whatever the URL hash or the last visit said. The
  // hash is still written during a visit so the Back button works.
  state.view = 'home'; state.rep = null; state.main = null; state.cat = null; state.month = null; state.prog = null; state.peek = null; state.from = null;
  // ...except an explicit deep link: the rep workspace's tiles send
  // `rep=<name>` (a manager previewing someone) and/or `only=inc` (the
  // Incentive Hub tile). Those land where they say.
  const deep = readHash();
  // A manager sent here for ONE rep (the workspace tiles) gets that rep's
  // page as the rep sees it: Rep view, no picker/program/mode controls
  // (2026-09-29, per Gavin). The "Viewing <rep> · Change" chip is the way out.
  state.asRep = !!(deep.rep && ROSTER.includes(deep.rep) && !LOCKED_REP && KDH_USER && KDH_USER.role === 'manager');
  if(state.asRep) state.mode = 'rep';
  if((deep.rep && ROSTER.includes(deep.rep)) || TAB_KEYS.includes(deep.only)){ applyHash(); if(state.rep && state.view==='home'){ state.view = 'rep'; state.cat = state.cat || lastTab(); state.main = tabOf(state.cat); applyOnly(); } }
  lockState();                     // a signed-in rep opens straight on their own page
  // A manager in Manager Mode lands on the team / program overview (Program
  // View, with its rep filter) instead of the name picker -- a deep link wins.
  if(state.view==='home' && !state.rep && !state.only && !state.asRep && !LOCKED_REP && isMgr()) state.view = 'programs';
  history.replaceState(null, '', (LOCKED_REP || state.rep || state.only || state.view==='programs') ? hashOf() : '#');
  render();
  // Warm the active MPO months in the background so the first tap is instant.
  Object.keys(MPO_SCOPES).forEach(scope=>{
    MPO_SCOPES[scope].mod.MONTHS.forEach(m=>{ if(mpoMonthActive(scope, m)) ensureMpoMonth(scope, m.key).then(()=>{ if(state.view!=='home') render(); }); });
  });
}
window.KohlerHub = {NO_BUY, state, programs:()=>PROGRAMS, sortedForRep, programStats, render, buyingFor, accountsFor, nextAccounts, closedFor,
  // library surface for the Accounts page (2026-09-30)
  lib:LIB, loadFor, distFor, progFacts, sellAsk, endsLabel, periodLabel, isActive, incBand, isDollarProgram, availability, supportAllows, isSupport,
  mpoRepMonth, mpoMonthLoaded, scopes:MPO_SCOPES, incRows, RA, lockedRep:LOCKED_REP, roster:ROSTER, dmGroups:DM_GROUPS};
boot();
})(HUB_ROSTER_SCOPED, HUB_DM_GROUPS_SCOPED);
