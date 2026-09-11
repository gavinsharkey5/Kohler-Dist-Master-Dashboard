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
      // valueText/status ride along so an MPO card can draw the dashboards'
      // per-sub bars on a dual objective (August's Molson Coors and Wine &
      // Spirits); `line` stays for the detail screen's existing renderer.
      segments: m.subs ? m.subs.map(s=>({label:s.label, pct:s.pct, line:`${s.value} of ${s.goal}`,
                                         valueText:s.valueText || `${s.value} / ${s.goal}`, status:s.status})) : null,
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
  if(p.type==='MPO' && !mpoMonthLoaded(p.source, p.monthKey)) return {ok:true};
  const A = accountsFor(p, rep);
  if(A.any) return {ok:true};
  if(A.eligible.length + A.buying.length > 0) return {ok:true};
  const brands = A.families.length>2 ? `${A.families[0]} and ${A.families.length-1} more brands` : A.families.join(' and ');
  if(A.excluded.length + A.unknown.length > 0) return {ok:false, why:UNAVAILABLE, sub:`${brands} can’t be sold at any account on your route.`};
  if(A.universe===0) return {ok:false, why:UNAVAILABLE, sub:`No ${p.channel==='on'?'on-premise':p.channel==='off'?'off-premise':''} accounts on your route.`};
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
const state = {mode:'rep', view:'home', rep:null, main:null, cat:null, month:null, prog:null, from:null, peek:null, filters:{type:'all', chan:'all', sup:'all', month:'active'}, showEnded:false};
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
  if(state.cat && (state.view==='rep' || state.view==='detail')) p.push('cat='+state.cat);
  if(state.month && state.view==='rep') p.push('month='+state.month);
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
  if(h.cat && CATEGORIES.some(c=>c.key===h.cat)){ state.cat = h.cat; state.main = tabOf(h.cat); }
  state.month = h.month && Object.keys(MPO_SCOPES).some(sc=>MPO_SCOPES[sc].mod.MONTHS.some(m=>m.key===h.month)) ? h.month : null;
  state.prog = h.prog && PROGRAMS.some(p=>p.id===h.prog) ? h.prog : null;
  state.from = h.from || null;
  state.peek = (h.who && ROSTER.includes(h.who) && h.who!==state.rep) ? h.who : null;
  if(h.mode==='manager') state.mode = isMobile() ? 'rep' : 'manager'; else if(h.mode==='rep') state.mode = 'rep';
  const v = h.view;
  // view=pick was the old "what are you looking for?" / supplier step -- an
  // old link now lands straight on the rep's dashboard with that tab open.
  if(v==='programs' || v==='program' || v==='rep' || v==='detail' || v==='home') state.view = v;
  else if(v==='pick'){ state.view = 'rep'; state.cat = (h.main ? tabOf(h.main) : null) || state.cat || lastTab(); }
  else state.view = 'home';
  if((state.view==='rep' || state.view==='detail') && !state.rep) state.view = 'home';
  if(state.view==='rep' && !state.cat){ state.cat = lastTab(); }
  state.main = tabOf(state.cat);
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
        <button class="nbtn home" data-act="home">🏠 Home</button>
        ${rep ? `<button class="nbtn" data-act="change-rep">Change rep</button>` : ''}
        ${rep && state.view!=='rep' ? `<button class="nbtn" data-act="my-programs">My programs</button>` : ''}
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
// One question, one tap: choosing a name opens that rep's dashboard. The
// screen is the Incentive Tracker's own "Choose your name" step (its v3
// screenName()) rebuilt on the hub's tokens, so both pages open the same
// way: a left-aligned title, one label per District Manager, and a grid of
// names. No card wrapper and no search box -- every name is on screen.
function screenHome(){
  return `<div class="homeview">
    <div class="home-head">
      <h1>Choose your name</h1>
      <p class="home-sub">Tap your name to see your incentives and MPOs.</p>
    </div>
    <div id="repList" class="replist">${repListHtml()}</div>
    ${refreshedLine()}
    <button class="reset" data-act="reset-all">↺ Start over</button>
    <div class="home-foot">${isMobile() ? '' : isMgr() ? `Manager Mode is on · <a href="#" data-act="programs">Browse by program</a> · <a href="#" data-act="set-mode" data-mode="rep">Back to Rep Mode</a>` : `Manager? <a href="#" data-act="set-mode" data-mode="manager">Switch to Manager Mode (desktop)</a>`}</div>
  </div>`;
}
// Reps under their District Manager, in DM_GROUPS order; anyone on the
// roster without a DM lands in "Other" so nobody is unreachable.
function repListHtml(){
  const grouped = new Set(DM_GROUPS.flatMap(g=>g.reps));
  const other = ROSTER.filter(r=>!grouped.has(r));
  const groups = DM_GROUPS.map(g=>({dm:g.dm, reps:g.reps.filter(r=>ROSTER.includes(r))}))
    .concat(other.length ? [{dm:'Other', reps:other}] : [])
    .filter(g=>g.reps.length);
  return groups.map(g=>`<div class="dmlabel">${E(g.dm)}</div>
    <div class="namegrid">${g.reps.map(r=>
      `<button class="name" data-act="pick-rep" data-rep="${E(r)}">${E(r)}<span class="ar">&#8594;</span></button>`
    ).join('')}</div>`).join('');
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
// Within a supplier: gap programs first, soonest to end, then the biggest
// share still needed; then on-track, then met, then the rest.
function incSortKey(x){
  const N = incNums(x.r);
  const days = daysLeft(x.p.period.end);
  const shortPct = N ? (N.need / N.goal) : 0;
  return [x.b.band, x.b.band<=1 ? days : 0, x.b.band<=1 ? -shortPct : 0, x.p.name];
}
function cmpKey(a, b){
  for(let i=0;i<a.length;i++){ if(a[i]<b[i]) return -1; if(a[i]>b[i]) return 1; }
  return 0;
}
function incRowHtml(p, r, b, rep){
  const open = openCards.has(p.id);
  const N = incNums(r);
  const pct = N ? Math.max(0, Math.min(100, (N.cur/N.goal)*100)) : (r.pct||0);
  const targets = (r.status==='unavailable' || r.soon) ? [] : nextAccounts(p, rep).rows.filter(a=>!a.foreign);
  const meta = [p.channelLabel, endsLabel(p.period)].filter(Boolean).join(' · ');

  const figures = N
    ? `<div class="ifig">
        <span class="if"><span class="if-k">Current</span><span class="if-v">${fmtN(N.cur)}</span></span>
        <span class="if"><span class="if-k">Goal</span><span class="if-v">${fmtN(N.goal)}</span></span>
        <span class="if need${N.need<=0?' met':r.house?' house':''}"><span class="if-k">Still Needed</span><span class="if-v">${N.need<=0?'0':fmtN(N.need)}</span>
          ${r.house?`<span class="if-tag">house goal</span>`:''}</span>
      </div>`
    : `<div class="ifig open"><span class="if"><span class="if-k">${r.soon?'Status':'So far'}</span><span class="if-v">${E(r.now || (r.soon ? 'Awaiting data' : '—'))}</span></span>
        ${r.openEnded?`<span class="if-note">Open-ended — every one pays, no goal to count down</span>`:''}</div>`;

  const bar = N ? `<div class="ibar ${b.cls}"><div class="ibar-fill" style="width:${pct}%"></div></div>` : '';
  const hasBG = !(r.status==='unavailable' || r.soon) && brandGoals(p, rep).length>0;
  const more = (r.status==='unavailable') ? ''
    : hasBG ? `${open?'Hide':'View'} your brand goals`
    : targets.length ? `${open?'Hide':'View'} ${targets.length} potential account${targets.length===1?'':'s'}`
    : (open ? 'Hide details' : 'View details');

  return `<div class="irow b${b.band}${open?' open':''}" id="card-${E(p.id)}">
    <button class="irow-head" data-act="toggle-card" data-prog="${E(p.id)}" aria-expanded="${open?'true':'false'}">
      <span class="irow-top"><span class="irow-name">${E(p.shortName||p.name)}</span><span class="ist ${b.cls}">${E(b.label)}</span></span>
      <span class="irow-meta">${E(meta)}</span>
      ${figures}
      ${bar}
      <span class="irow-foot">${N?`<span class="ipct">${Math.round(pct)}% of goal</span>`:'<span class="ipct"></span>'}<span class="imore">${E(more)}</span></span>
    </button>
    ${open ? `<div class="irow-body">${incRowDetail(p, r, rep, targets)}</div>` : ''}
  </div>`;
}
// Opened: the accounts table first (it is why a rep clicked), then the
// supporting detail. Per-account brand-level distribution is NOT in the
// customer base -- it carries total 2026 cases only -- so the missing
// product is named at PROGRAM level and each row carries the volume and
// the reason instead. See hub/README.txt.
function incRowDetail(p, r, rep, targets){
  const fams = HubAccounts.PROGRAM_BRANDS[HubAccounts.brandKey(p)];
  const ask = sellAsk(p);
  // A retention program's detail is its BRAND GOALS, not a prospect list --
  // including the per-SKU current/goal rows added in v9.6. Dropping these
  // would lose the Constellation product-level work, so they come first.
  const BG = brandGoals(p, rep);
  const rows = targets.slice(0, 25);
  const table = !targets.length
    ? `<div class="it-note">No potential accounts currently identified.</div>`
    : `<div class="it-wrap"><table class="it">
        <thead><tr><th>Account</th><th>Acct #</th><th>Town · Territory</th><th class="num">2026 cases</th><th>Why it is an opportunity</th></tr></thead>
        <tbody>${rows.map(a=>`<tr>
          <td class="it-n">${E(a.name)}</td>
          <td class="it-num">${E(a.n!=null?String(a.n):'—')}</td>
          <td>${E([a.city, a.area || a.rawArea].filter(Boolean).join(' · ') || '—')}</td>
          <td class="num">${E(a.cases!=null?fmtCases(a.cases):'—')}</td>
          <td class="it-why">${E(a.why||'')}</td></tr>`).join('')}</tbody>
      </table>${targets.length>rows.length?`<div class="it-note">Showing the top 25 of ${targets.length} by 2026 volume.</div>`:''}</div>`;
  const sec = (t, body) => body ? `<div class="isec"><div class="isec-h">${E(t)}</div>${body}</div>` : '';
  if(BG.length){
    return sec('Your brand goals', brandGoalsHtml(BG, {noTitle:true, oneGoal: p.key==='mabi_retention_fall' ? (r.goal||'goal') : ''}))
      + sec(`Accounts to hold${targets.length?' · '+targets.length:''}`, table)
      + sec('How it is scored', (p.rules&&p.rules.length)?`<ul class="ibul">${p.rules.map(x=>`<li>${E(x)}</li>`).join('')}</ul>`:'')
      + `<div class="isec"><button class="ilink" data-act="open" data-prog="${E(p.id)}">Full program details and rankings</button></div>`;
  }
  return sec(`Potential accounts${targets.length?' · '+targets.length:''}`, table)
    + sec('What to sell', `<div class="itext">${E(ask)}${(fams && fams.length)?` <span class="iquiet">Pays on: ${E(fams.join(' · '))}.</span>`:''}</div>`)
    + sec('How it is scored', (p.rules&&p.rules.length)?`<ul class="ibul">${p.rules.map(x=>`<li>${E(x)}</li>`).join('')}</ul>`:'')
    + (r.next ? sec('Next step', `<div class="itext">${r.next}</div>`) : '')
    + `<div class="isec"><button class="ilink" data-act="open" data-prog="${E(p.id)}">Full program details and rankings</button></div>`;
}
// One entry per incentive the rep is actually in -- the incentive page's
// own list, shared with the tab counter.
function incRows(rep){
  const rows = [];
  PROGRAMS.forEach(p=>{
    if(p.type!=='Incentive' || !isActive(p)) return;
    const r = p.forRep(rep); if(!r) return;
    if(!availability(p, rep).ok && r.status!=='unavailable') return;
    const b = incBand(p, r); if(!b) return;
    rows.push({p, r, b});
  });
  return rows;
}
function screenRepIncentives(rep){
  const rows = incRows(rep);
  const sups = new Map();
  rows.forEach(x=>{ const k = x.p.supplier;
    if(!sups.has(k)) sups.set(k, []); sups.get(k).push(x); });
  sups.forEach(list=>list.sort((a,b)=>cmpKey(incSortKey(a), incSortKey(b))));
  // Suppliers with something to act on come first.
  const groups = [...sups.entries()].map(([name, list])=>({name, list,
    best: Math.min(...list.map(x=>x.b.band)),
    soonest: Math.min(...list.filter(x=>x.b.band<=1).map(x=>daysLeft(x.p.period.end)).concat([9e9]))}));
  groups.sort((a,b)=> a.best-b.best || a.soonest-b.soonest || a.name.localeCompare(b.name));

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
  const stillNeeded = counted.reduce((t,x)=>t + counts(x).need, 0);

  const summary = `<div class="isum">
      <span class="isum-i met"><b>${met}</b> Goals Met</span>
      <span class="isum-i ontrack"><b>${onTrack}</b> On Track</span>
      <span class="isum-i attn"><b>${attn}</b> Need Attention</span>
      <span class="isum-i"><b>${fmtN(stillNeeded)}</b> Still Needed<span class="isum-s">across ${plw(counted.length,'goal')} of your own</span></span>
    </div>`;

  const body = groups.map(g=>{
    const key = 'sup:'+g.name;
    const logo = (g.list[0] && g.list[0].p.supplierLogo) || '';
    const expanded = openSups.has(key);          // default CLOSED, per Gavin 2026-09-11
    const a = g.list.filter(x=>x.b.band===0).length;
    const note = [plw(g.list.length,'program'), a?`${a} need${a===1?'s':''} attention`:''].filter(Boolean).join(' · ');
    return `<section class="isup${expanded?'':' collapsed'}">
      <button class="isup-h" data-act="toggle-sup" data-sup="${E(key)}" aria-expanded="${expanded?'true':'false'}">
        ${supLogoHtml(g.name, logo)}<span class="isup-n">${E(g.name)}</span><span class="isup-s">${E(note)}</span><span class="isup-ar">${expanded?'–':'+'}</span>
      </button>
      ${expanded ? `<div class="isup-b">${g.list.map(x=>incRowHtml(x.p, x.r, x.b, rep)).join('')}</div>` : ''}
    </section>`;
  }).join('');

  return `<div class="repview iview">
    <div class="rep-head">
      <div class="rep-title"><h1>${E(possessive(rep))} Incentives</h1>
        <div class="rep-sub">${plw(rows.length,'program')} across ${plw(groups.length,'supplier')} — everything on one page.</div>
        ${refreshedLine()}</div>
      ${tabbar(rep, 'inc')}
      ${summary}
    </div>
    ${rows.length ? body : `<div class="empty">No incentives apply to you right now.</div>`}
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
  return `<div class="tabbar" role="tablist">${TABS.map(m=>{
    const on = m.key===cur, n = tabCount(rep, m.key);
    return `<button class="tab${on?' active':''}" data-act="set-cat" data-cat="${m.key}" role="tab" aria-selected="${on?'true':'false'}">
      <span class="tab-ic">${m.ic}</span><span class="tab-l">${E(m.label)}</span>${n===null?'':`<span class="tab-n">${n}</span>`}</button>`;
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
    `<button class="mpill${m.key===cur?' active':''}" data-act="set-month" data-month="${E(m.key)}" role="tab" aria-selected="${m.key===cur?'true':'false'}">${E(m.label)}${m.key===live?'<span class="mpill-now">Now</span>':''}</button>`
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
  return `<div class="repview${bySup?' single':''}">${html}</div>`;
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
    <ol class="log-list">${shown.map(r=>`<li class="log-row"><div class="log-main"><div class="log-cust">${E(r.customer)}</div>${r.product?`<div class="log-prod">${E(r.product)}</div>`:''}${r.note?`<div class="log-note">${E(r.note)}</div>`:''}</div><div class="log-right"><div class="log-date">${E(r.date||'—')}</div>${r.photo?`<a class="log-photo" href="${E(r.photo)}" target="_blank" rel="noopener">View photo <span class="ar">›</span></a>`:''}</div></li>`).join('')}</ol>
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
      // Kohler's workbook sets ONE MADE goal per rep, not one per family, so
      // the families show their placements toward that single goal.
      push('MADE brand families', 'placements', (d.brands||[]).map(b=>row(b.brand, b.placements, null, 'placements')));
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
  return `<div class="g-tags mpo-tags">
      <span class="g-tag weight">${weight}% of MPO</span>
      ${r.goal?`<span class="g-tag">Goal: ${E(r.goal)}</span>`:''}
      <span class="g-pill ${st}">${G_STATUS_MARK[st]} ${G_STATUS_TEXT[st]}</span>
    </div>
    <div class="g-facts">
      <div><div class="g-fact-l">My Goal</div><div class="g-fact-v">${E(r.goal||'\u2014')}</div></div>
      <div><div class="g-fact-l">Where I Am</div><div class="g-fact-v${done?' good':''}">${E(r.now||'\u2014')}</div></div>
      <div><div class="g-fact-l">Still Needed</div><div class="g-fact-v${r.remain?'':' good'}">${E(r.remain || 'Goal met')}</div></div>
      <div><div class="g-fact-l">Credit Earned</div><div class="g-fact-v${done?' good':' mute'}">${done?'Yes':'Not yet'}</div></div>
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
  return {cur, goal, need: Math.max(goal-cur, 0)};
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
    `${meta?`<div class="mt-meta">${E(meta)}</div>`:''}` +
    `${a.why?`<div class="mt-gap">${E(a.why)}</div>`:''}</li>`;
}
const MT_PREVIEW = 3;
function mpoRepCard(p, r, rep){
  const soon = r.status==='soon';
  const open = openCards.has(p.id);
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

  const N = mpoNums(r);
  const met = N ? N.need===0 : (r.status==='complete' || r.status==='exceeded');
  const unit = o.unit ? (o.unit + ((N ? N.need : 0)===1 ? '' : 's')) : '';
  const pct = Math.max(0, Math.min(100, r.pct||0));
  const targets = mpoTargetRows(p, rep);
  const nT = targets ? targets.length : null;

  const figures = `<div class="mfig">
      <div class="mf"><div class="mf-l">Current</div><div class="mf-v">${N?fmtN(N.cur):E(r.now||'—')}</div></div>
      <div class="mf"><div class="mf-l">Goal</div><div class="mf-v">${N?fmtN(N.goal):E(r.goal||'—')}</div></div>
      <div class="mf need${met?' met':''}"><div class="mf-l">${met?'Status':'Still Needed'}</div>
        <div class="mf-v">${met?'Goal met':(N?fmtN(N.need):E(r.remain||'—'))}</div>
        ${!met && unit ? `<div class="mf-u">${E(unit)}</div>` : ''}</div>
    </div>`;
  const bar = `<div class="mbar"><div class="mbar-fill" style="width:${pct}%"></div></div>
    <div class="mbar-cap"><span>${Math.round(pct)}% of goal</span>${o.goalLabel?`<span class="mbar-goal">${E(o.goalLabel)}</span>`:''}</div>`;

  // Collapsed: the first few accounts. Expanded: all of them, then the
  // supporting detail. Both come from the same list.
  // A card already at goal does not need three account rows shouting at a
  // rep who has nothing left to close -- it keeps the count and the expander
  // (you can still keep building) and gives back the vertical space.
  const preview = targets===null
    ? `<div class="mt-note">Loading accounts…</div>`
    : !targets.length
      ? `<div class="mt-note">No potential accounts currently identified.</div>`
      : (met && !open)
        ? `<div class="mt-note">Goal met — ${plw(nT,'account')} still open if you want to keep building.</div>`
        : `<ul class="mt-list">${targets.slice(0, open ? targets.length : MT_PREVIEW).map(mpoTargetRowHtml).join('')}</ul>`;

  const hint = !targets || !targets.length
    ? (open ? 'Hide details' : 'View details')
    : open ? 'Hide accounts' : `View potential accounts (${nT})`;
  // The expander sits ON the accounts heading, where a rep is already
  // looking, instead of down in the footer (per Gavin, 2026-09-11).
  const headRow = `<div class="mt-head"><span class="mt-head-t">${targets&&targets.length?`Potential accounts · ${nT}`:'Program details'}</span>
      <span class="mcard-more">${E(hint)}<span class="mcard-ar">${open?'▴':'▾'}</span></span></div>`;

  return `<article class="mcard${open?' open':''}${met?' met':''}" id="card-${E(p.id)}">
    <button class="mcard-head" data-act="toggle-card" data-prog="${E(p.id)}" aria-expanded="${open?'true':'false'}">
      <div class="mcard-name">${E(o.name)}</div>
      <div class="mcard-sup">${sup}</div>
      ${figures}
      ${bar}
      ${headRow}
      ${preview}
      <div class="mcard-foot"><span class="mcard-ends">${ends}</span></div>
    </button>
    ${open ? `<div class="mcard-body">${mpoRepCardDetail(p, r, rep)}</div>` : ''}
  </article>`;
}
// Everything that is not one of the four questions lives here.
function mpoRepCardDetail(p, r, rep){
  const o = p.objective;
  const A = mpoMonthLoaded(p.source, p.monthKey) ? accountsFor(p, rep) : null;
  const closed = closedFor(p, rep);
  const sec = (title, body) => body ? `<div class="msec"><div class="msec-h">${E(title)}</div>${body}</div>` : '';
  const counts = A ? `<ul class="mkv">
      <li><span>In your book, this premise</span><span>${A.universe}</span></li>
      <li><span>Eligible, not buying yet</span><span>${A.eligible.length}</span></li>
      <li><span>Already buying</span><span>${A.buying.length}</span></li>
      ${(A.excluded.length+A.unknown.length)?`<li><span>Brand not sellable there</span><span>${A.excluded.length+A.unknown.length}</span></li>`:''}
    </ul>` : '';
  const brands = (A && !A.any && A.families.length)
    ? `<div class="mtext">${E(A.families.join(' · '))}</div>`
    : (A && A.any ? `<div class="mtext">Any brand counts toward this objective.</div>` : '');
  const rules = (p.rules && p.rules.length) ? `<ul class="mbul">${p.rules.map(x=>`<li>${E(x)}</li>`).join('')}</ul>` : '';
  const done = closed.length
    ? `<ul class="mdone">${closed.slice(0,15).map(x=>`<li><span class="md-c">${E(x.customer)}</span><span class="md-p">${E(x.product||'')}</span><span class="md-d">${E(x.date||'')}</span></li>`).join('')}${closed.length>15?`<li class="md-more">+ ${closed.length-15} more</li>`:''}</ul>`
    : `<div class="mtext quiet">Nothing credited to you on this objective yet.</div>`;
  return sec('Qualifying brands', brands)
    + sec('Your account base', counts)
    + sec('How it is scored', rules)
    + sec(`Already credited${closed.length?' · '+closed.length:''}`, done)
    + `<div class="msec"><a class="mlink" href="${E(MPO_SCOPES[p.source].page)}#rep=${encodeURIComponent(rep)}&month=${E(p.monthKey)}">Open on the ${E(p.channelLabel)} MPO tracker</a></div>`;
}

function programCard(p, r, rep){
  // Rep Mode MPO cards are the streamlined worklist card above. Manager Mode
  // keeps the dashboards' objective card, and incentives are untouched.
  if(p.type==='MPO' && !isMgr()) return mpoRepCard(p, r, rep);
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
      ${r.sub && !soon ? `<div class="psub">${E(r.sub)}</div>` : ''}
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
      : `<section class="dsec"><h2 class="dsec-h">Targets</h2>${repPlan(p, r, rep, {limit:15})}</section>
    <section class="dsec"><h2 class="dsec-h closed">Completed</h2>${closedLog(p, rep, {limit:25})}</section>`; })()}
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
  return `<div class="g-prog"><button class="g-prog-head" data-act="open-program" data-prog="${E(p.id)}">
      <div class="g-prog-top">
        <span class="g-prog-name">${E(o.name)}${o.supplier?`<span class="g-reprow-dm">${E(o.supplier)}</span>`:''}</span>
        <span class="g-prog-right">
          <span><span class="g-prog-atgoal${all?' good':''}">${g ? g.n+' / '+g.total : '—'}</span>
            <span class="g-prog-atgoal-l">reps at goal</span></span>
          <span class="g-chev">&#9656;</span>
        </span>
      </div>
      <div class="g-tags" style="margin:12px 0 0">
        <span class="g-tag weight">${Math.round((o.weight||0)*100)}% of MPO</span>
        ${o.goalLabel?`<span class="g-tag">Goal: ${E(o.goalLabel)}</span>`:''}
        <span class="g-tag">${plw(M.ROSTER.length,'eligible rep')}</span>
        ${g?`<span class="g-tag">${Math.round(g.total?(g.n/g.total)*100:0)}% at goal</span>`
           :`<span class="g-tag">${loaded?'Not tracked with data':'Loading…'}</span>`}
      </div>
      <div class="g-bar"><div class="g-bar-fill ${all?'achieved':pct>0?'inprogress':'notstarted'}" style="width:${Math.max(0,Math.min(100,pct))}%"></div></div>
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
  const weighted = objs.reduce((t,o)=> t + (o.weight||0)*objPct(o), 0);
  const sums = [{l:'Overall Weighted MPO', n:D?Math.round(weighted)+'%':'—',
    cls: !D ? 'mute' : weighted>=90 ? 'good' : weighted>=50 ? 'accent' : '',
    s:`across all ${objs.length} objective${objs.length===1?'':'s'}`}];
  objs.forEach(o=>{
    const g = atGoal(o);
    if(!g){ sums.push({l:E(o.shortName||o.name), n:'—', cls:'mute', s:D?'not tracked yet':'loading…'}); return; }
    sums.push({l:E(o.shortName||o.name)+(g.headline?'':' – Reps at Goal'),
      n: g.headline || (g.n+' / '+g.total),
      cls: g.cls || (g.total && g.n===g.total ? 'good' : (g.n ? 'accent' : 'mute')),
      s: g.sub || o.goalLabel || ''});
  });
  const hidden = objs.length - progs.length;
  return `<section class="g pv-mpo">
    <div class="g-step-head">
      <div class="g-title">${E(S.label)} MPO</div>
      <div class="g-sub">${E(month?month.label:mk)} · tap a program to see every rep&rsquo;s result.${hidden>0?` <span class="pv-mpo-filtered">${hidden} more objective${hidden===1?'':'s'} hidden by your filters — the summary still covers all ${objs.length}.</span>`:''}</div>
    </div>
    <div class="g-sum-grid">${sums.map(k=>`<div class="g-sum"><div class="g-sum-l">${k.l}</div>
      <div class="g-sum-n ${k.cls}">${k.n}</div><div class="g-sum-s">${E(k.s)}</div></div>`).join('')}</div>
    ${progs.map(mpoProgramCardHtml).join('')}
  </section>`;
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
  else if(state.view==='rep') body = screenRep();
  else if(state.view==='detail') body = screenDetail();
  else if(state.view==='programs') body = screenPrograms();
  else if(state.view==='program') body = screenProgram();
  document.body.classList.toggle('is-home', state.view==='home');
  root.innerHTML = topbar() + `<main class="wrap">${body}</main>`;
  document.title = state.view==='rep' && state.rep ? `${possessive(state.rep)} Incentives & MPOs | Kohler` : 'Incentives & MPO Hub | Kohler Distributing';
  // Kick off any MPO month this screen needs, then re-render once it lands.
  let needed = [];
  if(state.view==='rep') needed = PROGRAMS.filter(p=>inCategory(p, state.cat||'all')
    && (p.type==='MPO' ? p.monthKey===mpoViewMonth(p.source) : (isActive(p) || state.showEnded)));
  else if(state.view==='detail' || state.view==='program'){ const p = PROGRAMS.find(x=>x.id===state.prog); if(p) needed=[p]; }
  else if(state.view==='programs'){ const f=state.filters; needed = PROGRAMS.filter(p=>p.type==='MPO' && (f.month==='all' ? true : f.month==='active' ? isActive(p) : p.monthKey===f.month)); }
  if(needed.length){ const token = ++renderToken; loadFor(needed).then(did=>{ if(did && token===renderToken) render(); }); }
}
let renderToken = 0;

/* ---- events ---- */
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]'); if(!t) return;
  const act = t.dataset.act;
  if(t.tagName==='A') e.preventDefault();
  switch(act){
    case 'home': openCards.clear(); state.showEnded = false; go({view:'home', rep:null, main:null, cat:null, prog:null, peek:null, from:null}); break;
    // Picking a name IS the whole landing step: open that rep's dashboard.
    case 'pick-rep': { const who = t.dataset.rep, tab = lastTab();
      openCards.clear(); state.showEnded = false;
      go({view:'rep', rep:who, cat:tab, main:tabOf(tab), month:null, prog:null, peek:null, from:null}); break; }
    case 'change-rep': go({view:'home'}); break;
    case 'back-home': go({view:'home', prog:null, peek:null, from:null}); break;
    case 'my-programs': if(state.rep) go({view:'rep', cat: state.cat || lastTab(), main: tabOf(state.cat || lastTab()), prog:null, from:null, peek:null}); else go({view:'home'}); break;
    case 'set-cat': openCards.clear(); rememberTab(t.dataset.cat); go({cat:t.dataset.cat, main:tabOf(t.dataset.cat), view:'rep'}, true); break;
    case 'set-month': openCards.clear(); state.showEnded = false; go({month:t.dataset.month, view:'rep'}, true); break;
    case 'toggle-sup': { const k = t.dataset.sup; if(openSups.has(k)) openSups.delete(k); else openSups.add(k); render(); break; }
    case 'toggle-ended': state.showEnded = !state.showEnded; render(); break;
    case 'toggle-card': { const id = t.dataset.prog; if(openCards.has(id)) openCards.delete(id); else openCards.add(id); render();
      const el = document.getElementById('card-'+id); if(el && openCards.has(id)){ const y = el.getBoundingClientRect().top + window.pageYOffset - 8; if(y < window.pageYOffset) window.scrollTo({top:y}); } break; }
    case 'acct-tab': acctTabs[t.dataset.prog] = t.dataset.tab; render(); break;
    case 'acct-more': acctMore[t.dataset.key] = !acctMore[t.dataset.key]; render(); break;
    case 'plan-more': planMore[t.dataset.key] = !planMore[t.dataset.key]; render(); break;
    case 'card-tab': cardTab[t.dataset.prog] = t.dataset.tab; render(); break;
    case 'log-more': logMore[t.dataset.key] = !logMore[t.dataset.key]; render(); break;
    case 'set-mode': state.mode = (t.dataset.mode==='manager' && !isMobile()) ? 'manager' : 'rep'; persist(); history.replaceState(null, '', hashOf()); render(); break;
    case 'reset-all': try{ localStorage.removeItem(LS_KEY); sessionStorage.removeItem(TAB_KEY); }catch(e){} openCards.clear(); state.showEnded = false; state.peek = null; state.prog = null; state.rep = null; state.cat = null; state.main = null;
      go({view:'home'}, true); break;
    case 'open': go({view:'detail', prog:t.dataset.prog, from:null, peek:null}); break;
    case 'change-rep-home': go({view:'home'}); break;
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
document.addEventListener('change', e=>{
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
  restore();                       // only the Rep / Manager mode survives a reload
  // A reload ALWAYS starts over on the home screen with an empty picker (per
  // Gavin, 2026-09-10) -- whatever the URL hash or the last visit said. The
  // hash is still written during a visit so the Back button works.
  state.view = 'home'; state.rep = null; state.main = null; state.cat = null; state.month = null; state.prog = null; state.peek = null; state.from = null;
 
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
