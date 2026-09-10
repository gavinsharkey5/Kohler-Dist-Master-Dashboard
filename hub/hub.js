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
const CATEGORIES = [
  {key:'all', label:'All Programs',      sub:'Every incentive and MPO you are in'},
  {key:'inc', label:'Incentives',        sub:'Supplier reward programs'},
  {key:'mpo', label:'MPOs',              sub:'Monthly performance objectives, on and off premise'},
  {key:'on',  label:'On-Premise MPOs',   sub:'Bars and restaurants'},
  {key:'off', label:'Off-Premise MPOs',  sub:'Liquor stores and retail'},
];
const STATUS = {
  exceeded:   {label:'Exceeded',    ic:'★'},
  complete:   {label:'Completed',   ic:'✓'},
  progress:   {label:'In Progress', ic:'▲'},
  notstarted: {label:'Not Started', ic:'○'},
  soon:       {label:'Coming Soon', ic:'⋯'},
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
    type: 'Incentive', channel: chan, channelLabel: CHANNEL_LABEL[chan],
    supplier: sup.name, supplierLogo: assetPath(sup.logo), brandLogos: progLogos(entry.key).map(assetPath),
    period, refreshed: PROGRAM_DATA_REFRESHED, manual: !!entry.manual, awaitingNote: entry.awaitingNote || '',
    rules, reward: rules.find(r=>/\$|win|trip|ticket|bonus|commission/i.test(r)) || '',
    territory: CORE_MARKET_PROGRAM_KEYS.has(entry.key) ? 'Core Market counties' : 'All counties',
    entry, month,
  };
  p.forRep = function(rep){
    const d = entry.getRep(rep);
    if(!d && anyData) return null;                       // program has data, none for this rep: not in it
    if(d && (d.territoryEligible===false || d.programEligible===false)) return null;
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
      : (s.house ? s.label.replace(/^House /,'House goal: ') : (s.target!=null ? fmtNum(s.target)+(s.unit?' '+s.unit:'') : ''));
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
    const rows = ROSTER.map(rep=>{ const r = p.forRep(rep); return r ? {rep, r} : null; }).filter(Boolean);
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
function sortGroup(p, r){
  if(!isActive(p)) return 7;
  if(!r || r.status==='soon') return 6;
  if(r.status==='complete' || r.status==='exceeded') return 5;
  if(daysLeft(p.period.end) <= ENDING_SOON_DAYS) return 1;
  if(r.pct!=null && r.pct >= ALMOST_PCT) return 2;
  if(r.status==='progress') return 3;
  return 4;
}
const GROUP_META = {
  1:{title:'Ending soon', sub:`Closing in the next ${ENDING_SOON_DAYS} days — act on these first`, cls:'g-end'},
  2:{title:'Almost there', sub:`${ALMOST_PCT}% or more of the way — a push finishes these`, cls:'g-close'},
  3:{title:'In progress', sub:'Active programs you have started, soonest to end first', cls:''},
  4:{title:'Not started yet', sub:'Active programs with nothing counted for you yet', cls:''},
  5:{title:'Completed', sub:'Goals you have already hit — keep them there through the period', cls:'g-done'},
  6:{title:'Coming soon', sub:'Programs you are in that have no data feed yet', cls:'g-soon'},
  7:{title:'Ended', sub:'Past programs, kept for reference', cls:'g-over'},
};
function sortedForRep(rep, cat){
  const rows = [];
  PROGRAMS.forEach(p=>{
    if(!inCategory(p, cat)) return;
    const r = p.forRep(rep);
    if(!r) return;
    rows.push({p, r, g: sortGroup(p, r), days: daysLeft(p.period.end)});
  });
  rows.sort((a,b)=>{
    if(a.g!==b.g) return a.g-b.g;
    if(a.g===2) return (b.r.pct-a.r.pct) || (a.days-b.days);
    if(a.g===5 || a.g===7) return (b.p.period.end-a.p.period.end) || a.p.name.localeCompare(b.p.name);
    return (a.days-b.days) || ((b.r.pct||0)-(a.r.pct||0)) || a.p.name.localeCompare(b.p.name);
  });
  return rows;
}

/* ====================================================================
   STATE + ROUTING
   ==================================================================== */
const state = {view:'home', rep:null, cat:'all', prog:null, from:null, peek:null, filters:{type:'all', chan:'all', sup:'all', month:'active'}, showEnded:false};
function persist(){ try{ localStorage.setItem(LS_KEY, JSON.stringify({rep:state.rep, cat:state.cat})); }catch(e){} }
function restore(){ try{ const s = JSON.parse(localStorage.getItem(LS_KEY)||'{}'); if(s.rep && ROSTER.includes(s.rep)) state.rep = s.rep; if(CATEGORIES.some(c=>c.key===s.cat)) state.cat = s.cat; }catch(e){} }
function hashOf(){
  const p = [];
  if(state.view!=='home') p.push('view='+state.view);
  if(state.rep && state.view!=='programs' && state.view!=='program') p.push('rep='+encodeURIComponent(state.rep));
  if(state.cat!=='all' && (state.view==='rep' || state.view==='detail')) p.push('cat='+state.cat);
  if(state.prog && (state.view==='detail' || state.view==='program')) p.push('prog='+encodeURIComponent(state.prog));
  if(state.from && state.view==='detail') p.push('from='+state.from);
  if(state.peek && state.view==='detail') p.push('who='+encodeURIComponent(state.peek));
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
  if(h.cat && CATEGORIES.some(c=>c.key===h.cat)) state.cat = h.cat;
  state.prog = h.prog && PROGRAMS.some(p=>p.id===h.prog) ? h.prog : null;
  state.from = h.from || null;
  state.peek = (h.who && ROSTER.includes(h.who) && h.who!==state.rep) ? h.who : null;
  const v = h.view;
  if(v==='programs' || v==='program' || v==='rep' || v==='detail' || v==='home') state.view = v;
  else state.view = state.rep ? 'rep' : 'home';
  if((state.view==='rep' || state.view==='detail') && !state.rep) state.view = 'home';
  if((state.view==='detail' || state.view==='program') && !state.prog) state.view = state.rep ? 'rep' : 'programs';
}
function go(next, replace){
  Object.assign(state, next);
  persist();
  const h = hashOf();
  if(replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
  render();
  window.scrollTo({top:0, behavior:'instant' in window ? 'instant' : 'auto'});
}
window.addEventListener('popstate', ()=>{ applyHash(); render(); });

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
    <div class="crumb"><a href="../index.html">Kohler Dashboard</a> &nbsp;/&nbsp; <a href="#" data-act="home">Incentives &amp; MPO Hub</a></div>
    <div class="hero-banner nj-hero"><div class="nj-hero-inner">
      <div class="nj-hero-kicker">Distributing the Best Beverages to</div>
      <div class="nj-hero-row"><img class="hero-logo-badge" src="../assets/kohler-logo-badge.png" alt="Kohler Distributing Company"><span class="nj-hero-script">Northern NJ</span></div>
    </div></div>
    ${state.view!=='home' ? `<div class="navrow">
      <div class="navl">${rep && onRep ? `<span class="nav-rep">👤 ${E(state.peek && state.view==='detail' ? state.peek : rep)}</span>` : ''}</div>
      <div class="navr">
        ${rep ? `<button class="nbtn" data-act="change-rep">Change rep</button>` : ''}
        ${onRep ? `<button class="nbtn" data-act="change-view">Change view</button>` : (rep ? `<button class="nbtn" data-act="my-programs">My programs</button>` : '')}
        ${state.view==='programs' || state.view==='program' ? '' : `<button class="nbtn quiet" data-act="programs">Program view</button>`}
      </div>
    </div>` : ''}
  </div>`;
}
function refreshedLine(){
  const inc = PROGRAM_DATA_REFRESHED;
  const mp = [];
  Object.keys(MPO_SCOPES).forEach(s=>{ const st = mpoState[s]||{}; Object.keys(st).forEach(mk=>{ if(st[mk].syncedAt) mp.push(fmtSynced(st[mk].syncedAt)); }); });
  const mpoTxt = mp.length ? [...new Set(mp)].join(' / ') : '';
  return `<p class="updated"><span class="livedot"></span> Incentives refreshed ${E(inc)}${mpoTxt?` · MPOs refreshed ${E(mpoTxt)}`:''}</p>`;
}

/* ---- landing ---- */
let pick = {rep:null, cat:'all', q:''};
function screenHome(){
  pick.rep = pick.rep || state.rep; pick.cat = pick.cat || state.cat || 'all';
  return `<div class="home">
    <div class="home-head">
      <h1>Incentives &amp; MPO Hub</h1>
      <p class="home-sub">Select your name to view your programs and track your progress.</p>
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
      <div class="cats">${CATEGORIES.map(c=>`<button class="cat${pick.cat===c.key?' active':''}" data-act="pick-cat" data-cat="${c.key}"><span class="cat-l">${E(c.label)}</span><span class="cat-s">${E(c.sub)}</span></button>`).join('')}</div>
    </div>
    <button class="cta${pick.rep?'':' disabled'}" data-act="view-programs" ${pick.rep?'':'disabled'}>View My Programs <span class="ar">›</span></button>
    <div class="home-foot">Manager? <a href="#" data-act="programs">Browse by program instead</a></div>
  </div>`;
}
function repListHtml(q){
  q = String(q||'').trim().toLowerCase();
  const match = r => !q || r.toLowerCase().includes(q) || r.toLowerCase().split(' ').some(w=>w.startsWith(q));
  const grouped = new Set(DM_GROUPS.flatMap(g=>g.reps));
  const groups = DM_GROUPS.map(g=>({dm:g.dm, reps:g.reps.filter(r=>ROSTER.includes(r) && match(r))}));
  const other = ROSTER.filter(r=>!grouped.has(r) && match(r));
  if(other.length) groups.push({dm:'Other', reps:other});
  const html = groups.filter(g=>g.reps.length).map(g=>`<div class="dm">${E(g.dm)}</div>${g.reps.map(r=>`<button class="name${pick.rep===r?' active':''}" data-act="pick-rep" data-rep="${E(r)}">${E(r)}<span class="ar">›</span></button>`).join('')}`).join('');
  return html || `<div class="noname">No name matches “${E(q)}”. Try just your first or last name.</div>`;
}

/* ---- rep program list ---- */
function screenRep(){
  const rep = state.rep, cat = state.cat;
  const rows = sortedForRep(rep, cat);
  const catMeta = CATEGORIES.find(c=>c.key===cat) || CATEGORIES[0];
  const active = rows.filter(x=>x.g<7);
  const counts = {complete:0, progress:0, notstarted:0, ending:0, soon:0};
  active.forEach(x=>{ if(x.r.status==='complete'||x.r.status==='exceeded') counts.complete++; else if(x.r.status==='progress') counts.progress++; else if(x.r.status==='notstarted') counts.notstarted++; else counts.soon++; if(x.g===1) counts.ending++; });
  const pending = neededMonths(active.map(x=>x.p));
  let html = `<div class="rep-head">
    <div class="rep-title"><h1>${E(possessive(rep))} Incentives &amp; MPOs</h1>
      <div class="rep-sub">${E(catMeta.label)} · ${plw(active.length,'active program')}${counts.ending?` · <strong>${counts.ending} ending soon</strong>`:''}</div>
      ${refreshedLine()}</div>
    <div class="counts">
      <div class="count good"><div class="count-n">${counts.complete}</div><div class="count-l">Completed</div></div>
      <div class="count accent"><div class="count-n">${counts.progress}</div><div class="count-l">In progress</div></div>
      <div class="count"><div class="count-n">${counts.notstarted}</div><div class="count-l">Not started</div></div>
      <div class="count amber"><div class="count-n">${counts.ending}</div><div class="count-l">Ending soon</div></div>
    </div>
    <div class="catbar" role="tablist">${CATEGORIES.map(c=>`<button class="catpill${cat===c.key?' active':''}" data-act="set-cat" data-cat="${c.key}" role="tab">${E(c.label)}</button>`).join('')}</div>
  </div>`;
  if(pending.length) html += `<div class="loading">Loading MPO data…</div>`;
  if(!rows.length) html += `<div class="empty">No ${E(catMeta.label.toLowerCase())} apply to you right now.</div>`;
  let lastG = null, open = false;
  rows.forEach(x=>{
    if(x.g!==lastG){
      lastG = x.g;
      if(open){ html += '</div>'; open = false; }
      const gm = GROUP_META[x.g];
      if(x.g===7){
        const n = rows.filter(y=>y.g===7).length;
        html += `<button class="ghead toggle ${gm.cls}${state.showEnded?' open':''}" data-act="toggle-ended"><span class="ghead-t">${E(gm.title)} <span class="ghead-n">${n}</span></span><span class="ghead-s">${E(gm.sub)}</span><span class="ghead-ar">${state.showEnded?'▾':'▸'}</span></button>`;
      } else {
        html += `<div class="ghead ${gm.cls}"><span class="ghead-t">${E(gm.title)}</span><span class="ghead-s">${E(gm.sub)}</span></div>`;
      }
    }
    if(x.g===7 && !state.showEnded) return;
    if(!open){ html += '<div class="cards">'; open = true; }
    html += programCard(x.p, x.r, rep);
  });
  if(open) html += '</div>';
  return `<div class="repview">${html}</div>`;
}
function programCard(p, r, rep){
  const soon = r.status==='soon';
  const facts = soon ? '' : `
    <div class="facts">
      <div class="fact"><span class="fact-l">Where you are</span><span class="fact-v">${E(r.now)}</span>${r.sub?`<span class="fact-s">${E(r.sub)}</span>`:''}</div>
      <div class="fact"><span class="fact-l">Goal</span><span class="fact-v">${E(r.goal||'—')}</span></div>
      <div class="fact"><span class="fact-l">Still needed</span><span class="fact-v ${r.remain?'':'ok'}">${E(r.remain || (r.status==='complete'||r.status==='exceeded' ? 'Done ✓' : (r.openEnded ? 'No cap' : '—')))}</span></div>
      <div class="fact"><span class="fact-l">Complete</span><span class="fact-v">${r.openEnded ? (r.status==='notstarted'?'0':'Paying') : Math.round(r.pct)+'%'}</span>${PACE[r.pace]?`<span class="fact-s pace ${r.pace}">${E(PACE[r.pace])}</span>`:''}</div>
    </div>
    ${barHtml(r)}`;
  return `<article class="pcard st-${r.status}" data-act="open" data-prog="${E(p.id)}" tabindex="0" role="button">
    <div class="pcard-top">
      ${logoStrip(p)}
      <div class="pcard-title">
        <div class="pcard-name">${E(p.name)}</div>
        <div class="pcard-meta">${typeChips(p)}<span class="chip sup">${E(p.supplier)}</span></div>
      </div>
      <div class="pcard-status">${statusChip(r)}${flags(p, r)}</div>
    </div>
    ${facts}
    ${soon ? `<div class="soon-note">${E(r.loading ? 'Loading this month’s data…' : p.manual ? 'Submitted and verified by hand — nothing to track here yet.' : 'Waiting on the first export for this program.')}</div>` : ''}
    ${r.next && !soon ? `<div class="next"><span class="next-l">Next</span><span class="next-t">${r.next}</span></div>` : ''}
    <div class="pcard-foot">
      <span class="period ${daysLeft(p.period.end)<=ENDING_SOON_DAYS && isActive(p) ? 'urgent':''}">📅 ${E(p.period.label)} · ${E(endsLabel(p.period))}</span>
      <span class="refreshed">Data ${E(p.refreshed ? 'refreshed '+p.refreshed : 'loading…')}</span>
      <span class="viewbtn">View full details <span class="ar">›</span></span>
    </div>
  </article>`;
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
    ${soon ? '' : `<section class="dsec"><h2 class="dsec-h">${p.type==='MPO' ? 'Your accounts, placements and targets' : 'Your accounts, products and opportunities'}</h2>
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
    const r = p.forRep(rep); if(!r || r.status==='soon') return;
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
  const root = app();
  let body;
  if(state.view==='home') body = screenHome();
  else if(state.view==='rep') body = screenRep();
  else if(state.view==='detail') body = screenDetail();
  else if(state.view==='programs') body = screenPrograms();
  else if(state.view==='program') body = screenProgram();
  document.body.classList.toggle('is-home', state.view==='home');
  root.innerHTML = topbar() + `<main class="wrap">${body}</main>`;
  document.title = state.view==='rep' && state.rep ? `${possessive(state.rep)} Incentives & MPOs | Kohler` : 'Incentives & MPO Hub | Kohler Distributing';
  // Kick off any MPO month this screen needs, then re-render once it lands.
  let needed = [];
  if(state.view==='rep') needed = PROGRAMS.filter(p=>inCategory(p, state.cat) && (isActive(p) || state.showEnded));
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
    case 'home': go({view:'home'}); break;
    case 'pick-rep': pick.rep = t.dataset.rep; pick.q=''; rerenderHomeList(); break;
    case 'clear-rep': pick.rep = null; pick.q=''; rerenderHomeList(); { const i=$('#repSearch'); if(i){ i.value=''; i.focus(); } } break;
    case 'pick-cat': pick.cat = t.dataset.cat; document.querySelectorAll('.cat').forEach(b=>b.classList.toggle('active', b.dataset.cat===pick.cat)); break;
    case 'view-programs': if(pick.rep){ go({view:'rep', rep:pick.rep, cat:pick.cat||'all', prog:null}); } break;
    case 'change-rep': pick = {rep:state.rep, cat:state.cat, q:''}; go({view:'home'}); break;
    case 'change-view': pick = {rep:state.rep, cat:state.cat, q:''}; go({view:'home'}); setTimeout(()=>{ const el = document.querySelectorAll('.step')[1]; if(el) el.scrollIntoView({behavior:'smooth', block:'start'}); }, 30); break;
    case 'my-programs': if(state.rep) go({view:'rep', prog:null, from:null, peek:null}); else go({view:'home'}); break;
    case 'set-cat': go({cat:t.dataset.cat, view:'rep'}, true); break;
    case 'toggle-ended': state.showEnded = !state.showEnded; render(); break;
    case 'open': go({view:'detail', prog:t.dataset.prog, from:null, peek:null}); break;
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
  const cta = $('.cta'); if(cta){ cta.classList.toggle('disabled', !pick.rep); cta.disabled = !pick.rep; }
});
document.addEventListener('keydown', e=>{
  if(e.target.id!=='repSearch' || e.key!=='Enter') return;
  const firstBtn = document.querySelector('#repList .name'); if(firstBtn){ firstBtn.click(); }
});
document.addEventListener('change', e=>{
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
  const cta = $('.cta'); if(cta){ cta.classList.toggle('disabled', !pick.rep); cta.disabled = !pick.rep; }
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
  restore();
  applyHash();
  if(location.hash.length<=1 && state.rep) state.view = 'rep';   // a returning rep lands on their programs
  pick = {rep:state.rep, cat:state.cat, q:''};
  history.replaceState(null, '', hashOf());
  render();
  // Warm the active MPO months in the background so the first tap is instant.
  Object.keys(MPO_SCOPES).forEach(scope=>{
    MPO_SCOPES[scope].mod.MONTHS.forEach(m=>{ if(mpoMonthActive(scope, m)) ensureMpoMonth(scope, m.key).then(()=>{ if(state.view!=='home') render(); }); });
  });
}
window.KohlerHub = {state, programs:()=>PROGRAMS, sortedForRep, programStats, render};
boot();
})();
