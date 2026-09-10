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
(function(){
'use strict';

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
function fmtSynced(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
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
  keystone_ice:'off', lytt:'off', tona:'off', sun_cruiser:'off', path_to_victory:'off', mollys:'off',
  display_auction:'off', mabi_retention:'off', mabi_retention_fall:'off',
  sam_adams_conversion:'on', printed_menu:'on', new_belgium:'on',
};
const CHANNEL_LABEL = {on:'On-Premise', off:'Off-Premise', both:'On & Off-Premise'};

function incBlob(key){ return PROGRAM_DATA_2026_09[key] || PROGRAM_DATA[key] || {}; }
function incPeriod(entry, month){
  const P = incBlob(entry.key);
  const year = +month.key.slice(0,4);
  let start = parseISO(P.periodStart), end = parseISO(P.periodEnd);
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
function incHasAnyData(entry){ return ROSTER.some(r=>!!entry.getRep(r)); }

function makeIncentive(entry, month){
  const sup = supplierOf(entry.key);
  const anyData = incHasAnyData(entry);
  const period = incPeriod(entry, month);
  const chan = INC_CHANNEL[entry.key] || 'both';
  const P = incBlob(entry.key);
  const rules = PROGRAM_RULES[entry.key] || [];
  const p = {
    id: 'inc:'+entry.key, source:'inc', key: entry.key, monthKey: month.key, monthLabel: month.label,
    name: entry.title, shortName: entry.shortTitle || entry.title, pitch: entry.pitch || '',
    type: 'Incentive', group: entry.group || 'new', supKey: PROGRAM_SUPPLIER[entry.key] || 'house', channel: chan, channelLabel: CHANNEL_LABEL[chan],
    supplier: sup.name, supplierLogo: assetPath(sup.logo), brandLogos: progLogos(entry.key).map(assetPath),
    period, refreshed: PROGRAM_DATA_REFRESHED, manual: !!entry.manual, awaitingNote: entry.awaitingNote || '',
    rules, reward: rules.find(r=>/\$|win|trip|ticket|bonus|commission/i.test(r)) || '',
    territory: CORE_MARKET_PROGRAM_KEYS.has(entry.key) ? 'Core Market counties' : 'All counties',
    entry, month,
  };
  p.forRep = function(rep){
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
  'iSellBeer Execution':'Kohler House Programs'};
const SUPPLIER_LOGO_KEY = {'Molson Coors':'molson_coors','Boston Beer':'boston_beer','Constellation':'constellation',
  'New Belgium':'new_belgium','Bardstown Bourbon':'bardstown','Kohler House Programs':'house'};
const MPO_BRAND_LOGO = {keystone_ice:'keystone_ice.png', bbc_lytt:'lytt.png', disruptors:'lytt.png', constellation_gaintain:'constellation.png',
  corona_premier:'constellation.png', new_belgium:'new_belgium.png', bardstown_menu:'bardstown.png', molson_coors:'molson_coors.png',
  fever_tree:'molson_coors.png', angry_orchard:'boston_beer.png', ws_2xo:'two_xo.png', carbliss:null};
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
  if(TYPE_NOTE[o.type]) rules.push(TYPE_NOTE[o.type]);
  if(o.key==='new_belgium' && TYPE_NOTE.new_belgium && o.type!=='new_belgium') rules.push(TYPE_NOTE.new_belgium);
  if(!o.hasData) rules.push('Verified from iSellBeer photos — there is no data feed behind this objective, so no numbers show here.');
  if(o.periodEnd) rules.push(`Runs through ${fmtDayYear(end)}, so it keeps accruing after the rest of the month's objectives close.`);
  const data = () => (mpoState[scope] && mpoState[scope][month.key]) || {};
  const p = {
    id: `${scope}:${month.key}:${o.key}`, source: scope, key: o.key, monthKey: month.key, monthLabel: month.label,
    name: o.name, shortName: o.shortName || o.name, pitch: o.goalLabel ? `${o.goalLabel} — ${weightPct}% of the ${S.label} MPO.` : '',
    type:'MPO', channel: S.channel, channelLabel: CHANNEL_LABEL[S.channel],
    supplier, supplierLogo: supLogo, brandLogos: brand ? [brand] : [],
    period, refreshed: '', manual: !o.hasData, awaitingNote: '',
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
        : `Nothing counted yet — you need <strong>${E(m.goalText||'')}</strong> by ${E(endTxt)}.`;
    return {
      status, pace: paceFromPct(pct, done, started), pct, openEnded:false,
      now: m.valueText, sub: '', goal: m.goalText, remain: m.remainText || null, next,
      segments: m.subs ? m.subs.map(s=>({label:s.label, pct:s.pct, line:`${s.value} of ${s.goal}`})) : null,
      valueNum: m.value, goalNum: m.goal, weight: weightPct,
    };
  };
  p.detailHtml = function(rep){
    const D = data().DATA; if(!D || !o.hasData) return '';
    return `<div class="mpo-detail">${M.detailFor(o, rep, D, month.key)}</div>`;
  };
  p.ranking = function(){
    const D = data().DATA; if(!D || !o.hasData) return [];
    const rows = ROSTER.map(rep=>{ const r = p.forRep(rep); return (r && r.status!=='unavailable' && availability(p, rep).ok) ? {rep, r} : null; }).filter(Boolean);
    rows.sort((a,b)=> (b.r.pct-a.r.pct) || (b.r.valueNum-a.r.valueNum) || a.rep.localeCompare(b.rep));
    return rows.map((x,i)=>({rep:x.rep, rank:i+1, valueText:x.r.now, metricLabel:o.unit ? o.unit+'s' : 'progress',
                             pct:x.r.pct, status:x.r.status, pace:x.r.pace, board:null}));
  };
  p.exposure = () => null;
  p.atGoal = function(){ const D = data().DATA; return (D && o.hasData) ? M.atGoalFor(o, D) : null; };
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
    month.programs.forEach(entry=>{ if(!seen.has(entry.key)) seen.set(entry.key, makeIncentive(entry, month)); });
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
// Can this rep sell this program anywhere on their route? Uses the customer
// base + brand territory (accounts.js): unavailable when every account in the
// rep's book is NOT IN TERRITORY / BLOCKED for the brand, or the book has no
// account of the program's premise at all. Provisional "yes" while an MPO
// month is still loading.
function availability(p, rep){
  if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) return {ok:true};
  const A = accountsFor(p, rep);
  if(A.any) return {ok:true};
  if(A.eligible.length + A.buying.length > 0) return {ok:true};
  const brands = A.families.length>2 ? `${A.families[0]} and ${A.families.length-1} more brands` : A.families.join(' and ');
  if(A.excluded.length + A.unknown.length > 0) return {ok:false, why:UNAVAILABLE, sub:`${brands} can’t be sold at any account on your route.`};
  if(A.universe===0) return {ok:false, why:UNAVAILABLE, sub:`No ${p.channel==='on'?'on-premise':p.channel==='off'?'off-premise':''} accounts on your route.`};
  return {ok:true};
}
function sortGroup(p, r){
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
    if(p.type==='MPO' && p.monthKey!==mpoRepMonth(p.source)) return;   // this month's MPOs only
    let r = p.forRep(rep);
    if(!r) return;
    if(r.status!=='unavailable' && r.status!=='soon'){
      const av = availability(p, rep);
      if(!av.ok) r = Object.assign({}, r, {status:'unavailable', pace:'notstarted', pct:null, unavailable:true, why:av.why, sub:av.sub, next:'', remain:null});
    }
    rows.push({p, r, g: sortGroup(p, r), days: daysLeft(p.period.end)});
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
const state = {mode:'rep', view:'home', rep:null, main:null, cat:null, prog:null, from:null, peek:null, filters:{type:'all', chan:'all', sup:'all', month:'active'}, showEnded:false};
function persist(){ try{ localStorage.setItem(LS_KEY, JSON.stringify({rep:state.rep, cat:state.cat, mode:state.mode})); }catch(e){} }
// Manager Mode is desktop-only: a phone or tablet (touch pointer, or a
// narrow window) always gets Rep Mode, and a mode=manager link opened there
// is rewritten to Rep Mode.
const isMobile = () => window.innerWidth < 760 || (window.matchMedia('(pointer:coarse)').matches && window.innerWidth < 1100) || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isMgr = () => state.mode==='manager' && !isMobile();
window.addEventListener('resize', ()=>{ if(state.mode==='manager') render(); });
function restore(){ try{ const s = JSON.parse(localStorage.getItem(LS_KEY)||'{}'); if(s.mode==='manager' && !isMobile()) state.mode = 'manager'; }catch(e){} }
function hashOf(){
  const p = [];
  if(state.view!=='home') p.push('view='+state.view);
  if(state.rep && state.view!=='programs' && state.view!=='program') p.push('rep='+encodeURIComponent(state.rep));
  if(state.main && state.view==='pick') p.push('main='+state.main);
  if(state.cat && (state.view==='rep' || state.view==='detail')) p.push('cat='+state.cat);
  if(state.prog && (state.view==='detail' || state.view==='program')) p.push('prog='+encodeURIComponent(state.prog));
  if(state.from && state.view==='detail') p.push('from='+state.from);
  if(state.peek && state.view==='detail') p.push('who='+encodeURIComponent(state.peek));
  if(isMgr()) p.push('mode=manager');
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
  if(h.cat && CATEGORIES.some(c=>c.key===h.cat)){ state.cat = h.cat; state.main = mainOf(h.cat) || state.main; }
  state.prog = h.prog && PROGRAMS.some(p=>p.id===h.prog) ? h.prog : null;
  state.from = h.from || null;
  state.peek = (h.who && ROSTER.includes(h.who) && h.who!==state.rep) ? h.who : null;
  if(h.mode==='manager') state.mode = isMobile() ? 'rep' : 'manager'; else if(h.mode==='rep') state.mode = 'rep';
  const v = h.view;
  if(v==='programs' || v==='program' || v==='rep' || v==='detail' || v==='pick' || v==='home') state.view = v;
  else state.view = 'home';
  if((state.view==='rep' || state.view==='detail' || state.view==='pick') && !state.rep) state.view = 'home';
  if(state.view==='rep' && !state.cat) state.view = state.main ? 'pick' : 'home';
  if(state.view==='pick' && !state.main) state.view = 'home';
  if((state.view==='detail' || state.view==='program') && !state.prog) state.view = state.rep ? 'rep' : 'programs';
  if(isMobile() && (state.view==='programs' || state.view==='program')) state.view = state.rep ? 'rep' : 'home';
}
function go(next, replace){
  Object.assign(state, next);
  persist();
  const h = hashOf();
  if(replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
  render();
  if(next.view!==undefined) window.scrollTo({top:0, behavior:'instant' in window ? 'instant' : 'auto'});
}
window.addEventListener('popstate', ()=>{ applyHash(); const h = hashOf(); if(h!==(location.hash||'#')) history.replaceState(null, '', h); render(); });

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
  const onRep = state.view==='rep' || state.view==='detail' || state.view==='pick';
  return `<div class="topbar">
    <div class="crumb"><a href="../index.html">Kohler Dashboard</a> &nbsp;/&nbsp; <a href="#" data-act="home">Incentives &amp; MPO Hub</a></div>
    <div class="hero-banner nj-hero"><div class="nj-hero-inner">
      <div class="nj-hero-kicker">Distributing the Best Beverages to</div>
      <div class="nj-hero-row"><img class="hero-logo-badge" src="../assets/kohler-logo-badge.png" alt="Kohler Distributing Company"><span class="nj-hero-script">Northern NJ</span></div>
    </div></div>
    ${state.view!=='home' ? `<div class="navrow">
      <div class="navl">${rep && onRep ? `<span class="nav-rep">👤 ${E(state.peek && state.view==='detail' ? state.peek : rep)}</span>` : ''}</div>
      <div class="navr">
        <button class="nbtn home" data-act="home">🏠 Home</button>
        ${rep ? `<button class="nbtn" data-act="change-rep">Change rep</button>` : ''}
        ${state.view==='detail' ? `<button class="nbtn" data-act="change-view">Change category</button>` : (rep && state.view!=='pick' && state.view!=='rep' ? `<button class="nbtn" data-act="my-programs">My programs</button>` : '')}
        ${isMgr() && !(state.view==='programs' || state.view==='program') ? `<button class="nbtn quiet" data-act="programs">Program view</button>` : ''}
        ${isMobile() ? '' : `<span class="modeseg" role="group" aria-label="View mode"><button class="mseg${isMgr()?'':' active'}" data-act="set-mode" data-mode="rep">Rep</button><button class="mseg${isMgr()?' active':''}" data-act="set-mode" data-mode="manager">Manager</button></span>`}
      </div>
    </div>` : ''}
  </div>`;
}
function refreshedLine(){
  const inc = PROGRAM_DATA_REFRESHED;
  const mp = [];
  Object.keys(MPO_SCOPES).forEach(s=>{ const st = mpoState[s]||{}; Object.keys(st).forEach(mk=>{ if(st[mk].syncedAt) mp.push(fmtSynced(st[mk].syncedAt)); }); });
  const mpoTxt = mp.length ? [...new Set(mp)].join(' / ') : '';
  return `<p class="updated"><span class="livedot"></span><span>Incentives refreshed ${E(inc)}${mpoTxt?` · MPOs refreshed ${E(mpoTxt)}`:''}</span></p>`;
}

/* ---- landing ---- */
let pick = {rep:null, main:null, q:''};
const pickReady = () => !!(pick.rep && pick.main);
function screenHome(){
  pick.rep = pick.rep || state.rep; pick.main = pick.main || state.main || null;
  return `<div class="home">
    <div class="home-head">
      <h1>Incentives &amp; MPO Hub</h1>
      <p class="home-sub">Pick your name, then choose Incentives or MPOs.</p>
      ${refreshedLine()}
    </div>
    <div class="step">
      <div class="step-h"><span class="step-n">1</span><span class="step-t">What is your name?</span></div>
      <div class="search-wrap">
        <input id="repSearch" class="search" type="text" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Type or pick your name…" value="${E(pick.rep||'')}" aria-label="Search your name">
        ${pick.rep ? `<button class="clear" data-act="clear-rep" aria-label="Clear name">×</button>` : ''}
      </div>
      <div id="repList" class="replist${pick.rep?' picked':''}">${repListHtml(pick.q)}</div>
    </div>
    <div class="step">
      <div class="step-h"><span class="step-n">2</span><span class="step-t">What are you looking for?</span></div>
      <div class="cats">${MAINS.map(c=>`<button class="cat ${c.key}${pick.main===c.key?' active':''}" data-act="pick-main" data-main="${c.key}" aria-pressed="${pick.main===c.key?'true':'false'}"><span class="cat-ic">${c.ic}</span><span class="cat-t"><span class="cat-l">${E(c.label)}</span><span class="cat-s">${E(c.sub)}</span></span><span class="cat-check">${pick.main===c.key?'✓':'›'}</span></button>`).join('')}</div>
    </div>
    <button class="cta${pickReady()?'':' disabled'}" data-act="view-programs" ${pickReady()?'':'disabled'}>View My Programs <span class="ar">›</span></button>
    <button class="reset" data-act="reset-all">↺ Reset selections</button>
    <div class="home-foot">${isMobile() ? '' : isMgr() ? `Manager Mode is on · <a href="#" data-act="programs">Browse by program</a> · <a href="#" data-act="set-mode" data-mode="rep">Back to Rep Mode</a>` : `Manager? <a href="#" data-act="set-mode" data-mode="manager">Switch to Manager Mode (desktop)</a>`}</div>
  </div>`;
}
function repListHtml(q){
  q = String(q||'').trim().toLowerCase();
  const match = r => !q || r.toLowerCase().includes(q) || r.toLowerCase().split(' ').some(w=>w.startsWith(q));
  const grouped = new Set(DM_GROUPS.flatMap(g=>g.reps));
  const groups = DM_GROUPS.map(g=>({dm:g.dm, reps:g.reps.filter(r=>ROSTER.includes(r) && match(r))}));
  const other = ROSTER.filter(r=>!grouped.has(r) && match(r));
  if(other.length) groups.push({dm:'Other', reps:other});
  const html = groups.filter(g=>g.reps.length).map(g=>`<div class="team"><div class="dm"><span class="dm-ic">👥</span><span class="dm-t"><span class="dm-k">District Manager</span><span class="dm-n">${E(g.dm)}</span></span><span class="dm-c">${g.reps.length}</span></div>${g.reps.map(r=>`<button class="name${pick.rep===r?' active':''}" data-act="pick-rep" data-rep="${E(r)}">${E(r)}<span class="ar">›</span></button>`).join('')}</div>`).join('');
  return html || `<div class="noname">No name matches “${E(q)}”. Try just your first or last name.</div>`;
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
// The kicker above the title is a dropdown: flip Incentives <-> MPOs
// without going back to the home screen.
function mainSelect(main){
  return `<label class="mainsel-wrap"><select class="mainsel" data-sel="main" aria-label="Incentives or MPOs">${MAINS.map(m=>`<option value="${m.key}"${m.key===main?' selected':''}>${m.ic} ${E(m.label)}</option>`).join('')}</select><span class="mainsel-ar">▾</span></label>`;
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
function screenSuppliers(){
  const rep = state.rep;
  const sups = repSuppliers(rep);
  const month = MONTHS[MONTHS.length-1];
  return `<div class="pickview wide">
    <button class="back" data-act="back-home"><span class="ar">‹</span> Back</button>
    <div class="pick-head left">${mainSelect('inc')}<h1>${E(first(rep))}, choose a supplier</h1><p class="pick-sub">Tap a supplier to see your ${E(month.label)} incentives for them.</p></div>
    ${sups.length ? `<div class="supgrid">${sups.map(g=>`<button class="suppick" data-act="pick-sub" data-cat="sup:${E(g.sk)}">
      <span class="suppick-top">
        <span class="suppick-logo"><img src="${E(g.logo)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('blank');this.remove()"></span>
        <span class="suppick-text"><span class="suppick-name">${E(g.name)}</span><span class="suppick-note">${plw(g.items.length,'incentive')}${g.earned?` · <strong>${g.earned} already earned</strong>`:''}</span></span>
      </span>
      <span class="supcta">See these incentives<span class="ar">→</span></span>
    </button>`).join('')}</div>` : `<div class="empty">No incentives apply to you right now.</div>`}
    ${refreshedLine()}
  </div>`;
}
function screenPick(){
  const rep = state.rep, main = state.main;
  if(main==='inc') return screenSuppliers();
  const M = MAINS.find(m=>m.key===main) || MAINS[0];
  const tiles = SUBS[M.key].map(s=>{
    const st = subStat(rep, s);
    const sub = M.key==='mpo' ? `${s.sub} · ${mpoMonthLabel(s.key)}` : s.sub;
    return `<button class="sub ${s.key}${st.n===0?' none':''}" data-act="pick-sub" data-cat="${s.key}">
      <span class="sub-ic">${s.ic}</span>
      <span class="sub-t"><span class="sub-l">${E(s.label)}</span><span class="sub-s">${E(sub)}</span><span class="sub-n${st.n===null?' dim':''}">${E(st.text)}</span></span>
      <span class="sub-ar">›</span></button>`;
  }).join('');
  return `<div class="pickview">
    <button class="back" data-act="back-home"><span class="ar">‹</span> Back</button>
    <div class="pick-head">${mainSelect(M.key)}<h1>${E(possessive(rep))} ${E(M.label)}</h1><p class="pick-sub">Which ones do you want to see?</p></div>
    <div class="subs">${tiles}</div>
    ${refreshedLine()}
  </div>`;
}

/* ---- rep program list ---- */
function screenRep(){
  const rep = state.rep, cat = state.cat || 'all';
  const rows = sortedForRep(rep, cat);
  const catMeta = catMetaOf(cat);
  const main = mainOf(cat);
  const subs = main ? SUBS[main] : [];
  const active = rows.filter(x=>x.g<7);
  const counts = {complete:0, progress:0, notstarted:0, ending:0, soon:0};
  active.forEach(x=>{ if(x.r.status==='complete'||x.r.status==='exceeded') counts.complete++; else if(x.r.status==='progress') counts.progress++; else if(x.r.status==='notstarted') counts.notstarted++; else counts.soon++; if(x.g===1) counts.ending++; });
  const pending = neededMonths(active.map(x=>x.p));
  const bySup = cat.startsWith('sup:');
  const kicker = main ? mainSelect(main) + (main==='mpo' ? `<span class="rep-month">${E(mpoMonthLabel(cat==='on'||cat==='off' ? cat : 'off'))}</span>` : '') : '<div class="rep-kicker">All programs</div>';
  const subline = bySup
    ? `${plw(active.length,'incentive')}${active.filter(x=>isEarned(x.r)).length?` · <strong class="ok">${active.filter(x=>isEarned(x.r)).length} already earned</strong>`:''}${counts.ending?` · <strong>${counts.ending} ending soon</strong>`:''}`
    : `${plw(active.length,'active program')}${counts.ending?` · <strong>${counts.ending} ending soon</strong>`:''}`;
  let html = `<div class="rep-head">
    ${main ? `<button class="back" data-act="back-pick"><span class="ar">‹</span> Back</button>` : ''}
    <div class="rep-title"><div class="rep-kick">${kicker}</div><h1>${E(possessive(rep))} ${E(catMeta.label)}</h1>
      <div class="rep-sub">${subline}</div>
      ${refreshedLine()}</div>
    ${bySup ? '' : `<div class="counts">
      <div class="count good"><div class="count-n">${counts.complete}</div><div class="count-l">Completed</div></div>
      <div class="count accent"><div class="count-n">${counts.progress}</div><div class="count-l">In progress</div></div>
      <div class="count"><div class="count-n">${counts.notstarted}</div><div class="count-l">Not started</div></div>
      <div class="count amber"><div class="count-n">${counts.ending}</div><div class="count-l">Ending soon</div></div>
    </div>`}
    ${subs.length && !bySup ? `<div class="catbar" role="tablist">${subs.map(c=>{ const st = cat===c.key ? {n:active.length} : subStat(rep, c);
      return `<button class="catpill${cat===c.key?' active':''}" data-act="set-cat" data-cat="${c.key}" role="tab" aria-selected="${cat===c.key?'true':'false'}"><span class="pi">${c.ic}</span>${E(c.label)}<span class="pn">${st.n===null?'…':st.n}</span></button>`; }).join('')}</div>` : ''}
  </div>`;
  if(pending.length) html += `<div class="loading">Loading MPO data…</div>`;
  if(!rows.length) html += `<div class="empty">No ${E(catMeta.label.toLowerCase())} apply to you right now.</div>`;
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
  html += renderGroups(rows, rep, {quiet: bySup});
  return `<div class="repview${bySup?' single':''}">${html}</div>`;
}
function mpoMonthLabel(scope){ const mk = mpoRepMonth(scope); const m = MPO_SCOPES[scope].mod.MONTHS.find(x=>x.key===mk); return m ? m.label : mk; }
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
    if(!open){ html += '<div class="cards">'; open = true; }
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
      let note = '';
      if(p.objective.type==='photos') note = 'photo submitted';
      else if(l.new_buyer==='1' || l.isNew) note = 'new this month';
      else if(l.period==='base') note = 'bought in base period';
      else if(l.period==='current') note = 'repeat buyer';
      else if(l.date) note = 'bought '+l.date;
      add(name, note);
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
  {k:'closed',   l:'Closed / Completed', sub:'Placements the tracker credits to this rep — customer, product, date'},
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
    <div class="asub">${E(tabMeta.sub)}${tab==='high'?' · top 10':''}</div>
    ${tab==='closed' ? closedLog(p, rep, {limit:all?9999:LIMIT}).replace(/<button class="amore"[^]*?<\/button>/,'') : rows.length ? `<div class="alist">${shown.map(a=>acctRow(a, tab)).join('')}</div>` : `<div class="aempty">${E(empty)}</div>`}
    ${rows.length>LIMIT ? `<button class="amore" data-act="acct-more" data-key="${E(key)}">${all?'Show fewer':'Show all '+rows.length}</button>` : ''}
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
  'inc:keystone_ice':'Place Keystone Ice 24oz cans.', 'inc:touchdowns_tea':'Place Sun Cruiser or Twisted Tea 12-packs.',
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
  'inc:yave':'Open a new YaVe account.', 'inc:mollys':"Place Molly's 1.75L.", 'inc:path_to_victory':'Sell Victory Monkey 6-packs.',
  'inc:boston_beer':'Place an Angry Orchard or Dogfish Head tap.', 'inc:new_belgium':'Place a Juicy Haze or Two Hearted tap.',
  'inc:sam_adams':'Sell more Sam Adams than last August.', 'inc:new_belgium_distribution':"Sell more Bell's, Kirin and Voodoo.",
  'on:carbliss':'Open a new Carbliss account.', 'on:fever_tree':'Place Fever Tree.', 'on:bardstown_menu':'Get Bardstown or Green River on the menu.',
  'on:husa_xx_draft':'Place a Dos Equis tap.', 'on:angry_orchard':'Place an Angry Orchard tap.', 'on:molson_coors':'Place Peroni and Coors Banquet.',
  'on:wine_spirits':'Place YaVe and Leyenda.', 'on:sapporo_na':'Place Sapporo NA.',
  'off:constellation_gaintain':'Place Corona.', 'off:keystone_ice':'Place Keystone Ice 24oz cans.', 'off:fever_tree':'Place Fever Tree.',
  'off:wine_spirits_any':'Place a new wine or spirits SKU.', 'off:pos_stickers':'Put up a cooler door sticker and photograph it.',
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
    Object.keys(d).forEach(k=>{ if(/Targets$|Whitespace$/.test(k) && Array.isArray(d[k])) d[k].forEach(it=>push(it.customer, 'Never bought it', false)); });
    return out;
  }
  const slot = mpoState[p.source] && mpoState[p.source][p.monthKey]; const D = slot && slot.DATA; const d = D && D[p.key]; if(!d) return out;
  const sets = d.subs ? d.subs : [d];
  sets.forEach(sd=>{ const t = sd.targetsByRep && sd.targetsByRep[rep]; if(t) t.forEach(it=>push(it.customer, it.product ? `Missing ${it.product}` : 'Never bought it', false)); });
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
    rows.push(Object.assign({}, a, {why: cold.get(k) || 'Never bought it'})); });
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
  const add = (customer, product, date, note)=>{
    if(!customer) return;
    product = String(product||'');
    if(!product) product = brand || (fams===null ? '' : p.shortName||'');
    else if(brand && /^[\d.,]+\s*(cases?|SKUs?|bbl|bottles?)\b/i.test(product)) product = brand+' · '+product;   // a quantity, not a SKU name
    const k = HubAccounts.norm(customer)+'|'+HubAccounts.norm(product)+'|'+(date||'');
    if(seen.has(k)) return; seen.add(k);
    const when = date ? parseAny(date) : null;
    out.push({customer:String(customer), product, date: when ? fmtDay(when) : (date||''), when, note:note||''});
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
    sets.forEach(({sd, label})=>{
      const r = (sd.reps||[]).find(x=>x.rep===rep); if(!r || !Array.isArray(r.lines)) return;
      r.lines.forEach(l=>{
        if(!l || !l.customer) return;
        if(t==='photos') add(l.customer, [l.brand, l.detail].filter(Boolean).join(' '), l.date, 'photo');
        else if(t==='new_placements'){ if(l.isNew) add(l.customer, l.product, '', l.current ? l.current+' placement'+(l.current===1?'':'s') : ''); }
        else if(t==='pct_of_base') add(l.customer, l.product, '', 'on the shelf');
        else if(l.new_buyer==='1') add(l.customer, l.product || label, l.date, '');
      });
    });
  }
  // The same placement can appear twice in a card's data, once dated and
  // once not (a draft line in draftNew and in draftAccounts): keep the dated one.
  const dated = new Set(out.filter(r=>r.when).map(r=>HubAccounts.norm(r.customer)+'|'+HubAccounts.norm(r.product)));
  const rows = out.filter(r=>r.when || !dated.has(HubAccounts.norm(r.customer)+'|'+HubAccounts.norm(r.product)));
  rows.sort((a,b)=>((b.when?b.when.getTime():0)-(a.when?a.when.getTime():0)) || a.customer.localeCompare(b.customer));
  return rows;
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
    <div class="log-s">${plw(rows.length, 'placement')} the tracker credits to you${rows.some(r=>r.when)?', newest first':''}.</div>
    <ol class="log-list">${shown.map(r=>`<li class="log-row"><div class="log-main"><div class="log-cust">${E(r.customer)}</div>${r.product?`<div class="log-prod">${E(r.product)}</div>`:''}${r.note?`<div class="log-note">${E(r.note)}</div>`:''}</div><div class="log-date">${E(r.date||'—')}</div></li>`).join('')}</ol>
    ${rows.length>LIMIT ? `<button class="amore" data-act="log-more" data-key="${E(key)}">${all?'Show fewer':'Show all '+rows.length}</button>` : ''}
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
      push('Off-Premise', 'placements', (d.offCategories||[]).filter(c=>c.goal||c.placements).map(c=>row(c.label, c.placements, c.goal, 'placements')));
      push('On-Premise Packages', 'buyers', ((d.on_packages||{}).families||[]).map(f=>row(f.label, f.buyers, f.goal, 'buyers')));
      push('On-Premise Draft', 'buyers', ((d.on_draft||{}).families||[]).map(f=>row(f.label, f.buyers, f.goal, 'buyers')));
      break;
    case 'yuengling_retention_fall':
      push('Off-Premise', 'buyers', (d.offBrands||[]).map(b=>row(b.label, b.actual, b.goal, 'buyers')));
      push('On-Premise Packages', 'buyers', (d.packagesBrands||[]).map(b=>row(b.label, b.actual, b.goal, 'buyers')));
      push('On-Premise Draft', 'buyers', (d.draftBrands||[]).map(b=>row(b.label, b.actual, b.goal, 'buyers')));
      break;
    case 'mabi_retention_fall':
      // Kohler's workbook sets ONE MADE goal per rep, not one per family, so
      // the families show their placements toward that single goal.
      push('MADE brand families', 'placements', (d.brands||[]).map(b=>row(b.brand, b.placements, null, 'placements')));
      break;
    case 'constellation_retention':
      push('Off-Premise', 'placements', (d.offCategories||[]).map(c=>row(c.label, c.placements, c.goal, 'placements')));
      push('On-Premise Packages', 'buyers', (d.onPkgBrands||[]).map(b=>row(b.label, b.buyers, null, 'buyers')));
      break;
    case 'yuengling_retention':
      push('Off-Premise', 'placements', ((d.off||{}).brands||[]).map(b=>row(b.label, b.placements, b.goal, 'placements')));
      push('On-Premise Packages', 'placements', ((d.onPkg||{}).brands||[]).map(b=>row(b.label, b.placements, b.goal, 'placements')));
      break;
  }
  return G;
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
  const plan = nextAccounts(p, rep);
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
  const rows = all ? plan.rows : plan.rows.slice(0, LIMIT);
  const n = Math.min(plan.rows.length, LIMIT);
  let go, step;
  if(!plan.rows.length){
    go = plan.hold ? 'No account list for this one.' : (plan.A.universe===0 ? 'No eligible accounts.' : 'Every eligible account already buys it.');
    step = plan.hold ? 'Hold every brand goal.' : (done ? 'Keep it up.' : 'Check with your manager.');
  } else if(plan.hold){
    go = `Keep these ${n} accounts ordering.`; step = 'Open the account list.';
  } else {
    go = `Start with these ${n} eligible account${n===1?'':'s'}.`; step = 'Open the account list.';
  }
  const list = !plan.rows.length ? '' : `<ol class="plan-list">${rows.map(a=>`<li class="plan-row${a.warm?' warm':''}"><div class="plan-name">${E(a.name)}</div><div class="plan-meta">${E([a.city, a.area].filter(Boolean).join(' · '))}${a.cases>0?` · ${E(fmtCases(a.cases))}/yr`:''}</div><div class="plan-why">${a.warm?'🔥 ':''}${E(a.why||'')}</div></li>`).join('')}</ol>
      ${plan.rows.length>LIMIT ? `<button class="amore" data-act="plan-more" data-key="${E(key)}">${all?'Show fewer':'Show all '+plan.rows.length}</button>` : ''}`;
  return {loading:false, sell:sellAsk(p), go, step, n, total:plan.rows.length, hold:plan.hold, list};
}
// The two big tabs inside an opened card: the visit list, and the log of
// what the tracker already credits.
function planTabs(p, rep, P, tab){
  const closedN = P.loading ? null : closedFor(p, rep).length;
  return `<div class="ptabs">
      <button class="ptab sell${tab==='sell'?' active':''}" data-act="card-tab" data-prog="${E(p.id)}" data-tab="sell"><span class="ptab-l">What to sell</span><span class="ptab-n">${P.loading ? '…' : P.total ? (P.hold ? plw(P.total,'account')+' to hold' : plw(P.total,'account')+' to visit') : 'nothing open'}</span></button>
      <button class="ptab closed${tab==='closed'?' active':''}" data-act="card-tab" data-prog="${E(p.id)}" data-tab="closed"><span class="ptab-l">Closed / Completed</span><span class="ptab-n">${closedN==null?'…':plw(closedN,'placement')}</span></button>
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
    <div class="plan-line sell"><span class="plan-l">What to sell</span><span class="plan-t">${E(P.sell)}</span></div>
    <div class="plan-line go"><span class="plan-l">Where to go</span><span class="plan-t">${E(P.go)}</span></div>
    <div class="plan-line step"><span class="plan-l">Next step</span><span class="plan-t">${E(P.step)}</span></div>
    ${P.list ? `<div class="plan-listwrap open">${P.list}</div>` : ''}
  </div>`;
}

function programCard(p, r, rep){
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
  } else {
    const pctTxt = r.openEnded ? '' : Math.round(r.pct)+'%';
    quick = `<div class="quick">
        <div class="q goal"><span class="ql">Goal</span><span class="qv">${E(r.openEnded ? 'No cap' : (r.goal||'—'))}</span></div>
        <div class="q prog"><span class="ql">Where you are</span><span class="qv">${E(r.now||'—')}</span></div>
        <div class="q need"><span class="ql">Still need</span><span class="qv${r.remain?'':' ok'}">${E(r.remain || (done ? 'Done ✓' : (r.openEnded ? 'Every one pays' : '—')))}</span></div>
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
      ${r.sub && !soon ? `<div class="psub">${E(r.sub)}</div>` : ''}
      ${accountsPanel(p, rep)}
      <div class="pcard-actions"><button class="fullbtn" data-act="open" data-prog="${E(p.id)}">Full program details <span class="ar">›</span></button></div>
    </div>`;
  return `<article class="pcard st-${r.status}${open?' open':''}" id="card-${E(p.id)}">
    <button class="pcard-head" data-act="toggle-card" data-prog="${E(p.id)}" aria-expanded="${open?'true':'false'}">
      <div class="pcard-top">
        ${logoStrip(p)}
        <div class="pcard-title"><div class="pcard-name">${E(p.shortName||p.name)}</div><div class="pcard-sup">${sup}</div></div>
        <div class="pcard-status">${statusChip(r)}${flags(p, r)}</div>
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
  const cap = soon ? (r.loading ? 'Loading…' : 'Nothing to count yet') : (r.openEnded ? (r.sub || 'So far') : 'of your goal');
  const tl = soon ? null : p.timeline(rep);
  return `<div class="detail">
    ${back}
    <div class="dhero st-${r.status}">
      <div class="dhero-top">${logoStrip(p,'lg')}</div>
      <div class="dhero-sup">${E(p.supplier)} · ${E(p.type)} · ${E(p.channelLabel)}</div>
      <h1 class="dhero-name">${E(p.name)}</h1>
      <div class="dhero-big ${r.pace}">${E(big)}</div>
      <div class="dhero-cap">${E(cap)}</div>
      ${soon ? '' : barHtml(r, true)}
      <div class="dhero-line">${statusChip(r)}${flags(p, r)}</div>
    </div>
    <div class="dfacts three">
      <div class="dfact"><span class="dfact-l">Your goal</span><span class="dfact-v">${E(r.goal||'—')}</span></div>
      <div class="dfact"><span class="dfact-l">Where you stand</span><span class="dfact-v">${E(r.now||'—')}</span>${r.sub?`<span class="dfact-s">${E(r.sub)}</span>`:''}</div>
      <div class="dfact"><span class="dfact-l">Still needed</span><span class="dfact-v">${E(r.remain || (r.openEnded ? 'No cap — every one pays' : (soon ? '—' : 'Done ✓')))}</span><span class="dfact-s ${daysLeft(p.period.end)<=ENDING_SOON_DAYS && isActive(p)?'urgent':''}">${E(endsLabel(p.period))}</span></div>
    </div>
    ${r.next ? `<div class="nextbox"><div class="nextbox-l">Your next move</div><div class="nextbox-t">${r.next}</div></div>` : ''}
    ${(()=>{ const BG = brandGoals(p, rep); return BG.length
      ? `<section class="dsec"><h2 class="dsec-h">Your brand goals</h2>${brandGoalsHtml(BG, {noTitle:true, oneGoal: p.key==='mabi_retention_fall' ? (r.goal||'goal') : ''})}</section>`
      : `<section class="dsec"><h2 class="dsec-h">What to sell</h2>${repPlan(p, r, rep, {limit:15})}</section>
    <section class="dsec"><h2 class="dsec-h closed">Closed / Completed</h2>${closedLog(p, rep, {limit:25})}</section>`; })()}
    <section class="dsec"><h2 class="dsec-h">How it pays</h2>
      <ul class="rules">${p.rules.map(x=>`<li>${p.type==='Incentive' ? ruleHl(x) : E(x)}</li>`).join('')}</ul>
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
  if(!isMgr()) return screenDetailRep(p, r, rep, back);
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
    const r = p.forRep(rep); if(!r || r.status==='soon' || r.status==='unavailable' || !availability(p, rep).ok) return;
    parts.push(rep);
    if(r.status==='complete'||r.status==='exceeded') complete++;
    if(r.status!=='notstarted') started++;
    if(r.pct!=null) pcts.push(r.pct);
  });
  const avg = pcts.length ? pcts.reduce((a,b)=>a+b,0)/pcts.length : null;
  return {participants:parts.length, complete, incomplete:parts.length-complete, started, avg, pctComplete: parts.length ? complete/parts.length*100 : 0};
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
    <h1>Program View</h1>
    <p class="pv-sub">Every program on the board, by program instead of by rep — participation, completion and who is where.</p>
    ${refreshedLine()}
    <div class="filters">
      <div class="fgrp"><span class="fl">Type</span>${['all','inc','mpo'].map(v=>`<button class="fpill${f.type===v?' active':''}" data-filter="type" data-v="${v}">${v==='all'?'All':v==='inc'?'Incentives':'MPOs'}</button>`).join('')}</div>
      <div class="fgrp"><span class="fl">Channel</span>${['all','on','off'].map(v=>`<button class="fpill${f.chan===v?' active':''}" data-filter="chan" data-v="${v}">${v==='all'?'All':v==='on'?'On-Premise':'Off-Premise'}</button>`).join('')}</div>
      <div class="fgrp"><span class="fl">Supplier</span>${sel('sup', [{v:'all',l:'All suppliers'}].concat(sups.map(s=>({v:s,l:s}))), f.sup)}</div>
      <div class="fgrp"><span class="fl">Month</span>${sel('month', [{v:'active',l:'Active now'},{v:'all',l:'All months'}].concat(months.map(m=>({v:m,l:monthLabel(m)}))), f.month)}</div>
    </div>
  </div>`;
  if(pending.length) html += `<div class="loading">Loading MPO data for ${pending.map(x=>MPO_SCOPES[x[0]].label+' '+monthLabel(x[1])).join(', ')}…</div>`;
  if(!list.length) html += `<div class="empty">No programs match those filters.</div>`;
  html += `<div class="pgrid">${list.map(p=>{
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
  const notIn = loaded ? ROSTER.filter(rep=>!p.forRep(rep)) : [];
  return `<div class="detail pdetail">
    <button class="back" data-act="programs"><span class="ar">‹</span> Back to Program View</button>
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

/* ---- main render ---- */
function render(){
  acctCache.clear();
  const root = app();
  let body;
  if(state.view==='home') body = screenHome();
  else if(state.view==='pick') body = screenPick();
  else if(state.view==='rep') body = screenRep();
  else if(state.view==='detail') body = screenDetail();
  else if(state.view==='programs') body = screenPrograms();
  else if(state.view==='program') body = screenProgram();
  document.body.classList.toggle('is-home', state.view==='home');
  root.innerHTML = topbar() + `<main class="wrap">${body}</main>`;
  document.title = (state.view==='rep' || state.view==='pick') && state.rep ? `${possessive(state.rep)} Incentives & MPOs | Kohler` : 'Incentives & MPO Hub | Kohler Distributing';
  // Kick off any MPO month this screen needs, then re-render once it lands.
  let needed = [];
  if(state.view==='rep') needed = PROGRAMS.filter(p=>inCategory(p, state.cat||'all') && (isActive(p) || state.showEnded));
  else if(state.view==='pick') needed = PROGRAMS.filter(p=>inCategory(p, state.main||'all') && isActive(p));
  else if(state.view==='detail' || state.view==='program'){ const p = PROGRAMS.find(x=>x.id===state.prog); if(p) needed=[p]; }
  else if(state.view==='programs'){ const f=state.filters; needed = PROGRAMS.filter(p=>p.type==='MPO' && (f.month==='all' ? true : f.month==='active' ? isActive(p) : p.monthKey===f.month)); }
  if(needed.length){ const token = ++renderToken; loadFor(needed).then(did=>{ if(did && token===renderToken) render(); }); }
  if(state.view==='home'){ const inp = $('#repSearch'); if(inp && !pick.rep && window.innerWidth>760) inp.focus(); }
}
let renderToken = 0;

/* ---- events ---- */
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]'); if(!t) return;
  const act = t.dataset.act;
  if(t.tagName==='A') e.preventDefault();
  switch(act){
    case 'home': openCards.clear(); state.showEnded = false; pick = {rep:null, main:null, q:''}; go({view:'home', rep:null, main:null, cat:null, prog:null, peek:null, from:null}); break;
    case 'pick-rep': pick.rep = t.dataset.rep; pick.q=''; rerenderHomeList(); break;
    case 'clear-rep': pick.rep = null; pick.q=''; rerenderHomeList(); { const i=$('#repSearch'); if(i){ i.value=''; i.focus(); } } break;
    case 'pick-main': pick.main = t.dataset.main; rerenderHomeCats(); break;
    case 'view-programs': if(pickReady()){ openCards.clear(); go({view:'pick', rep:pick.rep, main:pick.main, cat:null, prog:null, peek:null, from:null}); } break;
    case 'pick-sub': openCards.clear(); state.showEnded = false; go({view:'rep', cat:t.dataset.cat, main:mainOf(t.dataset.cat), prog:null, peek:null, from:null}); break;
    case 'change-rep': pick = {rep:state.rep, main:state.main, q:''}; go({view:'home'}); break;
    case 'back-home': pick = {rep:state.rep, main:state.main, q:''}; go({view:'home', prog:null, peek:null, from:null}); break;
    case 'back-pick': openCards.clear(); go({view:'pick', main: state.main || mainOf(state.cat) || 'inc', prog:null, peek:null, from:null}); break;
    case 'change-view': openCards.clear(); go({view:'pick', main: state.main || mainOf(state.cat) || 'inc', prog:null, peek:null, from:null}); break;
    case 'my-programs': if(state.rep && state.cat) go({view:'rep', prog:null, from:null, peek:null}); else if(state.rep && state.main) go({view:'pick', prog:null, from:null, peek:null}); else go({view:'home'}); break;
    case 'set-cat': openCards.clear(); go({cat:t.dataset.cat, main:mainOf(t.dataset.cat), view:'rep'}, true); break;
    case 'toggle-ended': state.showEnded = !state.showEnded; render(); break;
    case 'toggle-card': { const id = t.dataset.prog; if(openCards.has(id)) openCards.delete(id); else openCards.add(id); render();
      const el = document.getElementById('card-'+id); if(el && openCards.has(id)){ const y = el.getBoundingClientRect().top + window.pageYOffset - 8; if(y < window.pageYOffset) window.scrollTo({top:y}); } break; }
    case 'acct-tab': acctTabs[t.dataset.prog] = t.dataset.tab; render(); break;
    case 'acct-more': acctMore[t.dataset.key] = !acctMore[t.dataset.key]; render(); break;
    case 'plan-more': planMore[t.dataset.key] = !planMore[t.dataset.key]; render(); break;
    case 'card-tab': cardTab[t.dataset.prog] = t.dataset.tab; render(); break;
    case 'log-more': logMore[t.dataset.key] = !logMore[t.dataset.key]; render(); break;
    case 'set-mode': state.mode = (t.dataset.mode==='manager' && !isMobile()) ? 'manager' : 'rep'; persist(); history.replaceState(null, '', hashOf()); render(); break;
    case 'reset-all': try{ localStorage.removeItem(LS_KEY); }catch(e){} openCards.clear(); state.showEnded = false; state.peek = null; state.prog = null; state.rep = null; state.cat = null; state.main = null;
      pick = {rep:null, main:null, q:''}; go({view:'home'}, true); break;
    case 'open': go({view:'detail', prog:t.dataset.prog, from:null, peek:null}); break;
    case 'change-rep-home': pick = {rep:null, main:state.main, q:''}; go({view:'home'}); break;
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
  if(e.target.id!=='repSearch') return;
  pick.q = e.target.value;
  const exact = ROSTER.find(r=>r.toLowerCase()===pick.q.trim().toLowerCase());
  pick.rep = exact || null;
  const list = $('#repList'); if(list){ list.innerHTML = repListHtml(pick.q); list.classList.toggle('picked', !!pick.rep); }
  syncCta();
});
document.addEventListener('keydown', e=>{
  if(e.target.id!=='repSearch' || e.key!=='Enter') return;
  const firstBtn = document.querySelector('#repList .name'); if(firstBtn){ firstBtn.click(); }
});
document.addEventListener('change', e=>{
  const m = e.target.closest('.mainsel');
  if(m){ openCards.clear(); state.showEnded = false; go({view:'pick', main:m.value, cat:null, prog:null, peek:null, from:null}); return; }
  const t = e.target.closest('.fsel'); if(!t) return;
  state.filters[t.dataset.filter] = t.value; render();
});
document.addEventListener('click', e=>{
  const t = e.target.closest('.fpill'); if(!t) return;
  state.filters[t.dataset.filter] = t.dataset.v; render();
});
function rerenderHomeList(){
  const inp = $('#repSearch'); if(inp) inp.value = pick.rep || '';
  const wrap = $('.search-wrap'); if(wrap){ const c = wrap.querySelector('.clear'); if(pick.rep && !c) wrap.insertAdjacentHTML('beforeend','<button class="clear" data-act="clear-rep" aria-label="Clear name">×</button>'); if(!pick.rep && c) c.remove(); }
  const list = $('#repList'); if(list){ list.innerHTML = repListHtml(pick.q); list.classList.toggle('picked', !!pick.rep); }
  syncCta();
}
function syncCta(){ const cta = $('.cta'); if(cta){ cta.classList.toggle('disabled', !pickReady()); cta.disabled = !pickReady(); } }
function rerenderHomeCats(){
  document.querySelectorAll('.cat').forEach(b=>{ const on = b.dataset.main===pick.main; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on?'true':'false'); const c = b.querySelector('.cat-check'); if(c) c.textContent = on ? '✓' : '›'; });
  syncCta();
}
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
  restore();                       // only the Rep / Manager mode survives a reload
  // A reload ALWAYS starts over on the home screen with an empty picker (per
  // Gavin, 2026-09-10) -- whatever the URL hash or the last visit said. The
  // hash is still written during a visit so the Back button works.
  state.view = 'home'; state.rep = null; state.main = null; state.cat = null; state.prog = null; state.peek = null; state.from = null;
  pick = {rep:null, main:null, q:''};
  history.replaceState(null, '', '#');
  render();
  // Warm the active MPO months in the background so the first tap is instant.
  Object.keys(MPO_SCOPES).forEach(scope=>{
    MPO_SCOPES[scope].mod.MONTHS.forEach(m=>{ if(mpoMonthActive(scope, m)) ensureMpoMonth(scope, m.key).then(()=>{ if(state.view!=='home') render(); }); });
  });
}
window.KohlerHub = {state, programs:()=>PROGRAMS, sortedForRep, programStats, render, buyingFor, accountsFor, nextAccounts, closedFor};
boot();
})();
