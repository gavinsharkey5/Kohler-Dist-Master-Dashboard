/* ====================================================================
   Guided MPO UI -- shared by MPOs/on-prem/ and MPOs/off-prem/.
   --------------------------------------------------------------------
   Both MPO dashboards now offer the same two ways in:

     Rep View      Step 1 pick a rep (grouped by their DM, exactly the
                   incentive tracker's chooser) -> Step 2 that one rep's
                   objectives, in plain language.
     Program View  the manager read: company KPIs, then one expandable
                   card per objective with every rep's result inside.

   ONE NORMALIZED METRIC POWERS BOTH. The host page hands this module a
   metric(objective, rep) function returning a single flat shape (see
   HOST CONTRACT below) and every screen here reads that -- the rep
   cards, the program rows, the summary counts and the sorting. The two
   views cannot drift apart because there is only one number behind
   them, and the per-type maths stays in the host page where the
   builders already live.

   NOTHING HERE COMPUTES MPO BUSINESS LOGIC. Weights, targets, per-rep
   qualification and the company-level "reps at goal" percentage are all
   the host's, unchanged; this module only arranges them. The single
   number this file derives is the rep-level weighted total, which had no
   prior existence -- see weightedForRep().

   HOST CONTRACT -- MPOGuided.init({...}):
     scope        'On-Premise' | 'Off-Premise'   (shown in the rep header)
     roster       string[]      every eligible rep, the host's ROSTER
     dmGroups     [{dm, reps[]}]  sales-manager grouping for Step 1
     mount        the element to render into
     objectives() the active month's OBJECTIVES array
     monthLabel() e.g. "September 2026"
     metric(o,rep)  normalized per-rep metric, or null if the objective
                    has no data this month. Shape:
                      value        number   what the rep has now
                      goal         number   what they need
                      pct          0..100   progress, capped
                      remaining    number   how much more (0 if met)
                      valueText    "12 / 10", "42.9%" -- display form
                      goalText     "10 new placements"
                      remainText   "3 more placements" | ''
                      status       'achieved'|'inprogress'|'notstarted'
                      hasActivity  bool -- false renders as "No activity"
                      subs         optional [{label,value,goal,pct,...}]
     detailHtml(o,rep)  the existing drill-down markup, or '' if none
     programPct(o)      company-level % for an objective (host's objPct)
     atGoal(o)          {n, total} reps at goal, straight off the host;
                        may add {headline, sub, cls} to lead a summary card
                        with the objective's own KPI instead
     loadMonth(key)     switch months (used when Back crosses a month)
   ==================================================================== */
(function(global){
'use strict';

function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>(
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function pl(n,word){return n+' '+word+(n===1?'':'s');}

var H = null;                 // host contract
var mount = null;
var uid = 0;

/* ---- View state ----------------------------------------------------
   Three values decide every screen: which view, which rep, which
   program is open. Back is simply "clear the last one", so there is no
   separate history model to keep in sync -- the same trick the incentive
   tracker's v3 flow uses. */
var view = 'rep';             // 'rep' | 'program'
var activeRep = null;
// AS-REP (2026-09-29, per Gavin): a manager who opens the tracker FOR one
// rep (the workspace's tiles, the hub) sees exactly that rep's page -- no
// View by Rep / View by Program bar, no Back to Reps, no Start Over, no
// other reps. The "Viewing <rep> · Change" chip in the top bar is the one
// way out; Change (or the picker) turns the manager tools back on.
var asRep = false;
function decorateAsRep(){
  var root = document.documentElement;
  root.classList.toggle('g-asrep', !!asRep);
  if(document.getElementById('g-asrep-style')) return;
  var st = document.createElement('style'); st.id = 'g-asrep-style';
  st.textContent = '.g-asrep .g-viewbar,.g-asrep .js-back,.g-asrep .js-startover{display:none!important}';
  document.head.appendChild(st);
}
var openProgram = null;
var sortMode = 'progress';    // 'progress' | 'name' | 'remaining'

var LS_KEY = 'kohler-mpo-guided';

/* ---- Signed-in rep lock (kohlerdisthub.com, 2026-09-25) ---------------
   /login/ leaves a readable `kdh_user` cookie ({name, role}). A rep is
   pinned to their own name: no picker, no View by Program, no other
   rep's page via the URL. Managers, and anyone whose name is not on this
   scope's roster, get the page exactly as before. Access itself is
   enforced by the Vercel middleware; this only decides what is shown. */
var KDH_USER = (function(){
  try{
    if(global.kdhUser) return global.kdhUser();
    var m = document.cookie.match(/(?:^|;\s*)kdh_user=([^;]*)/);
    return m ? JSON.parse(decodeURIComponent(m[1])) : null;
  }catch(e){ return null; }
})();
function lockedRep(){
  if(!(KDH_USER && KDH_USER.role !== 'manager' && KDH_USER.name && H && H.roster)) return null;
  // Forgiving match (first name + surname) so an allow-list spelling still
  // lands on this tracker's spelling; no match = fail closed with a notice.
  var m = window.kdhMatchName ? window.kdhMatchName(KDH_USER.name, H.roster) : (H.roster.indexOf(KDH_USER.name) >= 0 ? KDH_USER.name : null);
  if(!m && window.kdhNoRoster) window.kdhNoRoster(document.title.split(/\s+[|\u2014\u00b7-]\s+/)[0] || 'MPO tracker');
  return m;
}
function applyLock(){
  var L = lockedRep();
  if(!L) return false;
  view = 'rep'; activeRep = L; openProgram = null;
  return true;
}
function decorateLock(){
  if(!lockedRep()) return;
  var root = document.documentElement;
  if(root.classList.contains('g-locked')) return;
  root.classList.add('g-locked');
  var st = document.createElement('style');
  st.textContent = '.g-locked .g-viewbar,.g-locked .js-back,.g-locked .js-startover{display:none!important}';
  document.head.appendChild(st);
  // The breadcrumb's "MPO Tracker" index is a managers' page; send a rep
  // back to their own dashboards instead.
  var crumbs = document.querySelectorAll('.crumb a');
  for(var i=0;i<crumbs.length;i++){ crumbs[i].setAttribute('href','../../rep/'); crumbs[i].textContent = 'Dashboards'; }
}

/* Remembering the rep is a convenience, not a claim: a rep who has left
   the roster (or a month that never had them) must not wedge the page on
   an empty screen, so every restore is validated against the live
   roster before it is trusted. */
function persist(){
  try{
    localStorage.setItem(LS_KEY+':'+H.scope, JSON.stringify({
      view: view, rep: activeRep, month: H.monthKey()
    }));
  }catch(e){}
}
function restore(){
  try{
    var raw = localStorage.getItem(LS_KEY+':'+H.scope);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}

/* ---- URL <-> state, so the browser Back button works ---------------
   The hash carries the whole drill-down position. pushState is used for
   forward moves and popstate reads the hash back, so Back walks the
   drill-down (rep -> picker -> program view) rather than leaving the
   page on the first press. */
function stateToHash(){
  var p = [];
  if(view==='program') p.push('view=program');
  if(view==='rep' && activeRep) p.push('rep='+encodeURIComponent(activeRep));
  if(view==='program' && openProgram) p.push('program='+encodeURIComponent(openProgram));
  if(H.monthKey) p.push('month='+encodeURIComponent(H.monthKey()));
  return p.length ? '#'+p.join('&') : '#';
}
function hashToState(){
  var h = (location.hash||'').replace(/^#/,'');
  var out = {};
  h.split('&').forEach(function(kv){
    if(!kv) return;
    var i = kv.indexOf('=');
    if(i<0) return;
    out[kv.slice(0,i)] = decodeURIComponent(kv.slice(i+1));
  });
  return out;
}
function pushState(){
  var h = stateToHash();
  if(location.hash !== h && !(h==='#' && location.hash==='')){
    history.pushState(null,'',h);
  }
  persist();
}

function go(next, opts){
  if('view' in next) view = next.view;
  if('rep' in next){ activeRep = next.rep; if(!next.rep){ asRep = false; decorateAsRep(); } }
  if('program' in next) openProgram = next.program;
  applyLock();
  if(!opts || !opts.silent) pushState();
  render();
  if(!opts || opts.scroll !== false) scrollToTop();
}

function scrollToTop(){
  var anchor = document.getElementById('g-anchor') || mount;
  if(!anchor) return;
  var y = anchor.getBoundingClientRect().top + window.pageYOffset - 12;
  window.scrollTo({top: Math.max(0,y), behavior:'smooth'});
}

/* ==================================================================
   Weighted MPO for ONE rep.
   ------------------------------------------------------------------
   The company-level figure the dashboards have always shown is
     sum over objectives of weight x (% of reps at goal),
   which for a population of one rep is simply "did this rep hit it" --
   so the headline number here is the weight a rep has actually EARNED,
   and it is what determines credit. That is the honest reading of the
   existing formula narrowed to one person; nothing about the weights or
   the qualification rules changes.

   Partial progress is reported alongside it rather than inside it,
   because a rep at 9 of 10 placements has earned nothing yet on that
   objective and a headline that implied otherwise would be wrong on
   payday. Both numbers are labelled on the card.
   ================================================================== */
function weightedForRep(rep){
  var objs = H.objectives();
  var earned = 0, partial = 0, counted = 0;
  var achieved = 0, inprogress = 0, notstarted = 0, nodata = 0, notscored = 0;
  objs.forEach(function(o){
    var m = H.metric(o, rep);
    if(!m){ nodata++; return; }              // objective not tracked at all
    if(m.notScored){ notscored++; return; }  // tracked, but this rep has no goal
    counted += o.weight;
    if(m.status==='achieved'){ earned += o.weight; achieved++; }
    else if(m.status==='inprogress'){ inprogress++; }
    else { notstarted++; }
    partial += o.weight * Math.min(m.pct||0,100);
  });
  // Divided by the weight the rep can actually earn, not by the month's
  // full weight. Four off-premise objectives have no goal for an
  // on-premise-only rep (no account base to measure against), and scoring
  // them as a zero would read as underperformance where there is simply
  // nothing to do. The card names how many were left out.
  return {
    earnedPct: counted ? (earned/counted)*100 : 0,
    partialPct: counted ? partial/counted : 0,
    achieved: achieved, inprogress: inprogress, notstarted: notstarted,
    nodata: nodata, notscored: notscored, counted: counted,
    scoredCount: achieved + inprogress + notstarted
  };
}

/* ---- Small shared bits -------------------------------------------- */
var STATUS_TEXT = {achieved:'Goal Achieved', inprogress:'In Progress',
  notstarted:'Not Started', nodata:'Not Tracked Yet'};
var STATUS_MARK = {achieved:'✓', inprogress:'●', notstarted:'○', nodata:'—'};

// The status pill also says whether the credit is earned, so the card
// needs no separate "Credit earned" column.
var CREDIT_TEXT = {achieved:'Goal Achieved', inprogress:'In Progress', notstarted:'Not Started', nodata:'Not Tracked Yet'};
function creditPill(status){
  return '<span class="g-pill '+status+'">'+STATUS_MARK[status]+' '+(CREDIT_TEXT[status]||STATUS_TEXT[status])+'</span>';
}
function pillHtml(status){
  return '<span class="g-pill '+status+'">'+STATUS_MARK[status]+' '+STATUS_TEXT[status]+'</span>';
}
function barHtml(pct, status){
  return '<div class="g-bar"><div class="g-bar-fill '+status+'" style="width:'+
    Math.max(0,Math.min(100,pct||0))+'%"></div></div>';
}
function repHead(title, lines){
  return '<div class="g-step-head g-rephead">'+
    '<div class="g-title">'+title+'</div>'+
    '<div class="g-sub g-stack">'+lines.filter(Boolean).map(function(l){ return '<div>'+l+'</div>'; }).join('')+'</div>'+
  '</div>';
}
function stepHead(step, title, sub){
  return '<div class="g-step-head">'+
    (step?'<span class="g-eyebrow">Step '+step+'</span>':'')+
    '<div class="g-title">'+title+'</div>'+
    (sub?'<div class="g-sub">'+sub+'</div>':'')+
  '</div>';
}
// The reps an objective is scored over: the roster minus anyone whose metric
// marks the objective hidden (a support rep off it, 2026-09-16).
function eligibleRoster(o){
  return H.roster.filter(function(rep){ var m = H.metric(o, rep); return !(m && m.hidden); });
}
function dmOf(rep){
  var g = (H.dmGroups||[]).find(function(x){return x.reps.indexOf(rep)>=0;});
  return g ? g.dm : '';
}
// A role line for reps who are not route reps (sales support), supplied by
// the host's supportReps map; '' for everyone else.
function roleOf(rep){
  var m = H.supportReps || {};
  return (m[rep] && m[rep].label) || '';
}

/* ==================================================================
   REP VIEW -- Step 1: choose a rep
   ================================================================== */
function screenRepPicker(){
  var roster = H.roster.slice();
  var grouped = {}, order = [], under = {};
  (H.dmGroups||[]).forEach(function(g){
    var mine = g.reps.filter(function(r){return roster.indexOf(r)>=0;});
    if(!mine.length) return;
    grouped[g.dm] = mine.slice().sort();
    // A group `under` another manager (sales support under a DM, 2026-09-16)
    // renders directly after that manager's grid, styled like any other DM
    // header, instead of taking a top-level slot of its own.
    if(g.under){ (under[g.under] = under[g.under] || []).push(g.dm); } else { order.push(g.dm); }
  });
  Object.keys(under).forEach(function(k){ if(order.indexOf(k)<0) order = order.concat(under[k]); });
  var seen = Object.keys(grouped).reduce(function(a,k){return a.concat(grouped[k]);},[]);
  var leftovers = roster.filter(function(r){return seen.indexOf(r)<0;}).sort();
  if(leftovers.length){ grouped['Other'] = leftovers; order.push('Other'); }

  var grid = function(names){
    return '<div class="g-grid">'+names.map(function(r){
      return '<button class="g-name js-rep" data-rep="'+esc(r)+'">'+esc(r)+
        '<span class="ar">&#8594;</span></button>';
    }).join('')+'</div>';
  };
  var body = order.map(function(dm){
    return '<div class="g-dm">'+esc(dm)+'</div>'+grid(grouped[dm])+
      (under[dm]||[]).map(function(sub){
        return '<div class="g-dm g-dm-sub">'+esc(sub)+'</div>'+grid(grouped[sub]);
      }).join('');
  }).join('');

  return '<div class="g g-fade">'+
    stepHead(1,'Choose a Rep',
      esc(H.monthLabel())+' · '+esc(H.scope))+
    body+
  '</div>';
}

/* ==================================================================
   REP VIEW -- Step 2: one rep's objectives
   ================================================================== */
function screenRepDetail(){
  var rep = activeRep;
  var first = rep.split(' ')[0];
  var w = weightedForRep(rep);
  var objs = H.objectives();

  var excluded = [];
  if(w.notscored) excluded.push(pl(w.notscored,'objective')+(roleOf(rep)?' outside this role':' with no goal for this rep'));
  if(w.nodata) excluded.push(pl(w.nodata,'objective')+' not tracked yet');

  var sums = [
    {l:'Weighted MPO Complete', n:Math.round(w.earnedPct)+'%',
     cls: w.earnedPct>=90?'good':(w.earnedPct>0?'accent':'mute'),
     s:'Credit earned · '+Math.round(w.partialPct)+'% counting partial progress'+
       (excluded.length?'<br>Excludes '+excluded.join(' and '):'')},
    {l:'Objectives Achieved', n:String(w.achieved), cls:'good',
     s:'of '+w.scoredCount+' scored this month'},
    {l:'Objectives In Progress', n:String(w.inprogress), cls:'accent',
     s:'started, not yet at goal'},
    {l:'Objectives Not Started', n:String(w.notstarted), cls:'mute',
     s:'no activity recorded yet'}
  ];

  // An objective the metric marks hidden (a support rep's non-objective)
  // is left off the card entirely -- "all he needs to see is that one".
  var cards = objs.filter(function(o){ var m = H.metric(o, rep); return !(m && m.hidden); })
    .map(function(o){ return repObjectiveCard(o, rep); }).join('');

  return '<div class="g g-fade">'+
    '<div class="g-actions">'+
      '<button class="g-back js-back"><span class="ar">&#8592;</span>Back to Reps</button>'+
      '<button class="g-back js-startover"><span class="ar">&#8635;</span>Start Over</button>'+
    '</div>'+
    // One stacked header, no step badge (2026-09-28, Gavin): the name, then
    // the scope, the manager and the role each on its own line, then the
    // data stamp. The month is the selected pill just above, not repeated.
    repHead((lockedRep() || asRep ? 'Your' : esc(first)+'’s')+' MPO Progress', [
      [esc(H.scope),
        dmOf(rep) ? 'Sales Manager '+esc(dmOf(rep)) : '',
        roleOf(rep) ? esc(roleOf(rep)) : '',
        (function(){ var u = document.getElementById('updated-line'); var t = u ? u.textContent.trim().replace(/^Data refreshed\s*/i,'Data ').replace(/,\s*\d{1,2}:\d{2}\s*[AP]M.*$/i,'') : ''; return t ? esc(t) : ''; })()
      ].filter(Boolean).join(' · ')
    ])+
    cards+
  '</div>';
}

// display title (shared/program-titles.js): concise label only; o.name stays the source name
function titleOf(o){
  var scope = /on-prem/.test(location.pathname) ? 'on' : 'off';
  var mk = H.monthKey ? H.monthKey() : '';
  return window.kdhTitle ? window.kdhTitle(scope+':'+mk+':'+o.key, o.shortName||o.name) : (o.shortName||o.name);
}

// Plural / unit helpers shared by the v3 cards (2026-10-05 brief).

// Supplier marks cut from the rewards decks (incentive-tracking/assets/logos).
// A general objective (Wine, Spirits, POS, iSellBeer photos) has none and shows no mark.
var LOGO_BASE = '../../incentive-tracking/assets/logos/';
var MPO_LOGO = {
  constellation_innovation:['constellation.png'], constellation_gaintain:['constellation.png'], corona_premier:['constellation.png'],
  bbc_lytt:['lytt.png'], disruptors:['lytt.png'], mollys:['mollys.png'],
  sam_adams_conversion:['boston_beer.png','sam_adams.png'], angry_orchard:['boston_beer.png'],
  keystone_ice:['keystone_ice.png'], molson_coors:['molson_coors.png'], fever_tree:['molson_coors.png'],
  new_belgium:['new_belgium.png'], yave:['yave.png'], ws_2xo:['two_xo.png'], bardstown_menu:['bardstown.png'], green_river:['bardstown.png'], famosa:['famosa.png']
};
function logoHtml(o){
  var l = MPO_LOGO[o.key]; if(!l) return '';
  return '<div class="g-logos">'+l.map(function(f){
    return '<img class="g-logo" src="'+LOGO_BASE+f+'" alt="" loading="lazy" onerror="this.remove()">';
  }).join('')+'</div>';
}
function uPlural(n, u){ u = String(u||'').trim(); if(!u) return ''; if(Number(n)===1) return u; return /s$/.test(u) ? u : u+'s'; }
function titleCase(t){ return String(t||'').replace(/\b([a-z])/g, function(c){ return c.toUpperCase(); }); }
function fmtNum(v){ var n = Number(v); if(!isFinite(n)) return '\u2014'; return (Math.round(n*10)/10).toLocaleString('en-US'); }
function periodOf(o){ return o.periodText || (H.monthLabel ? H.monthLabel() : ''); }
function supPeriod(o){ return [o.supplier, periodOf(o)].filter(Boolean).map(esc).join(' · '); }
// "How This Goal Is Calculated": the metric's own explanation lines, else its goal text.
function explainFold(o, m){
  var lines = (m.explain && m.explain.length) ? m.explain : (m.goalText ? ['Goal: '+m.goalText] : []);
  if(!lines.length) return '';
  var id = 'gx'+(uid++);
  return '<button class="g-more js-more" data-target="'+id+'" aria-expanded="false">How This Goal Is Calculated<span class="ar">&#9656;</span></button>'+
    '<div class="g-more-body" id="'+id+'"><ul class="g-rules">'+lines.map(function(l){ return '<li>'+esc(l)+'</li>'; }).join('')+'</ul></div>';
}
// The goal's own explanation, from the metric's numbers: "75% of your 92-placement
// program goal" / "50% of your 29-account base (14.5, rounded up)". Empty when the
// goal is a plain count (2 new placements) -- the Goal line already says it all.
function goalWhy(o, m){
  if(m.underlying==null || !isFinite(Number(m.underlying))){
    // older objectives carry the rule only as text: "30% of last fall (33 of 110)"
    var g = String(m.goalText||'');
    return /%/.test(g) ? g.replace(/^my /i,'your ').replace(/ my /g,' your ').replace(/^./, function(c){ return c.toUpperCase(); }) : '';
  }
  var u = Number(m.underlying), req = Number(m.goal);
  var pct = req && u ? Math.round(req/u*100) : 0;
  var ex = (m.explain||[]).join(' ');
  var p = /(\d+(?:\.\d+)?)%/.exec(ex); if(p) pct = Number(p[1]);
  if(m.pctRule) pct = Math.round(Number(m.pctRule)*100);
  var exact = Math.round(u*pct)/100;
  var rnd = exact !== req ? ' ('+fmtNum(exact)+', rounded '+(req > exact ? 'up' : 'down')+')' : '';
  if(o.type==='pct_of_goal') return pct+'% of your '+fmtNum(u)+'-'+(o.unit||'placement')+' program goal'+rnd;
  if(o.type==='pct_of_base' || o.shareOfBase || o.type==='followup') return pct+'% of your '+fmtNum(u)+' eligible accounts'+rnd;
  return '';
}
// "Ends Nov 30 · 55 days left" from the objective's own end (or the month's last day).
/* CARBLISS BUYING ACCOUNTS (2026-10-06, Gavin): the October on-premise Carbliss card shows two
   counts against the rep's own account base -- accounts that bought in the fixed program period
   (Aug 1 - Oct 31) and accounts that bought since launch (Jun 2) -- and links to the Carbliss
   leaderboard page instead of Details / View Eligible Accounts. The numbers come from
   carbliss-mpo/data/program.json (carbliss-mpo/generate.py; a rep is served their own copy). */
function isCarblissLaunch(o){
  return o && o.key==='carbliss' && /on-prem/.test(location.pathname) && H.monthKey && H.monthKey()==='2026-10';
}
function carblissCard(o, rep, st){
  var dl = deadlineOf(o);
  return '<div class="g-obj g-obj-v3 g-obj-v4 g-cb-card '+st+'">'+
    '<div class="g-obj-head"><div class="g-obj-name">'+esc(titleOf(o))+'</div>'+
      '<div class="g-obj-sub">'+esc([o.supplier, (H.monthLabel ? H.monthLabel()+' MPO' : '')].filter(Boolean).join(' \u00b7 '))+'</div>'+
      creditPill(st)+'</div>'+
    '<div class="g-cb" data-rep="'+esc(rep)+'"><div class="g-cb-wait">Loading Carbliss buying accounts\u2026</div></div>'+
    (dl ? '<div class="g-deadline">'+dl+'</div>' : '')+
    '<a class="g-elig g-cb-lb cbx-link" href="../../carbliss-onprem-targets/">Open Carbliss Leaderboard</a>'+
    '<div class="g-meta g-weight">MPO Weight '+Math.round(o.weight*100)+'%</div>'+
  '</div>';
}
var CB_DATA = null;
function cbLoad(){
  if(!CB_DATA) CB_DATA = fetch('../../carbliss-mpo/data/program.json', {cache:'no-cache', credentials:'same-origin'})
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  return CB_DATA;
}
function cbDay(iso, withYear){
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso||''); if(!m) return '';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return MON[Number(m[2])-1]+' '+Number(m[3])+(withYear ? ', '+m[1] : '');
}
function hydrateCarbliss(){
  var co = document.querySelectorAll('.g-cb[data-co]');
  if(co.length) cbLoad().then(function(D){
    for(var i=0;i<co.length;i++) co[i].innerHTML = window.KdhCarbTiles.html(D, {compact:true, noTitle:true});
  }).catch(function(){
    for(var i=0;i<co.length;i++) co[i].innerHTML = '<div class="g-cb-wait">Carbliss buying figures are unavailable right now. Reload to try again.</div>';
  });
  var boxes = document.querySelectorAll('.g-cb[data-rep]'); if(!boxes.length) return;
  cbLoad().then(function(D){
    var names = D.reps.map(function(r){ return r.rep; });
    for(var i=0;i<boxes.length;i++){
      var box = boxes[i], rep = box.getAttribute('data-rep');
      var me = (window.kdhMatchName ? window.kdhMatchName(rep, names) : (names.indexOf(rep)>=0 ? rep : null));
      var mine = me ? D.accounts.filter(function(a){ return a.rep===me; }) : [];
      var base = mine.length;
      if(!base){ box.innerHTML = '<div class="g-cb-wait">No Carbliss account base on file for '+esc(rep)+'.</div>'; continue; }
      box.innerHTML = window.KdhCarbTiles.html(D, {rep: me, noTitle:true});
    }
  }).catch(function(){
    for(var i=0;i<boxes.length;i++) boxes[i].innerHTML = '<div class="g-cb-wait">Carbliss buying figures are unavailable right now. Reload to try again.</div>';
  });
}

function deadlineOf(o){
  var end = o.periodEnd ? new Date(o.periodEnd+'T12:00:00') : null;
  if(!end && H.monthKey){ var mk = String(H.monthKey()).split('-'); if(mk.length===2) end = new Date(Number(mk[0]), Number(mk[1]), 0, 12); }
  if(!end || isNaN(end)) return '';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var today = new Date(); today.setHours(12,0,0,0);
  var days = Math.round((end - today)/86400000);
  var day = MON[end.getMonth()]+' '+end.getDate();
  if(days < 0) return 'Ended '+day+', '+end.getFullYear();
  return 'Ends <b>'+day+'</b> · '+(days===0 ? 'last day' : days+(days===1?' day':' days')+' left');
}
// The hub's list of eligible accounts for this objective and rep: the program
// workspace when a verified rule exists (it decides on load), else the target list.
function eligibleHref(o, rep){
  if(o.type==='photos') return '';
  var scope = /on-prem/.test(location.pathname) ? 'on' : 'off';
  var mk = H.monthKey ? H.monthKey() : ''; if(!mk) return '';
  var id = scope+':'+mk+':'+o.key;
  // ret = this exact screen (rep, month, view), so the hub's Back comes here.
  return '../../hub/#view=detail&rep='+encodeURIComponent(rep)+'&cat='+scope+'&prog='+encodeURIComponent(id)+
    '&ret='+encodeURIComponent(location.pathname+stateToHash());
}
// RETURN TRIP (2026-10-06): remember the scroll position when a rep leaves for
// the hub's Eligible Accounts, and put it back when they come back to this
// exact screen (same path + hash).
var MPO_POS = 'kdh_mpopos:';
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('a.g-elig'); if(!a) return;
  try{ sessionStorage.setItem(MPO_POS+location.pathname+stateToHash(), String(window.scrollY)); }catch(err){}
}, true);
(function(){
  var y = null, key = MPO_POS+location.pathname+(location.hash||'#');
  try{ y = sessionStorage.getItem(key); if(y!=null) sessionStorage.removeItem(key); }catch(e){}
  if(y==null) return;
  var tries = 0, t = setInterval(function(){
    if(document.querySelector('.g-obj') || ++tries>80){ clearInterval(t); window.scrollTo(0, Number(y)||0); }
  }, 75);
})();
function repObjectiveCard(o, rep){
  var m = H.metric(o, rep);
  var weightTag = '<span class="g-tag weight">MPO Weight '+Math.round(o.weight*100)+'%</span>';

  if(!m || m.notScored){
    var note = m && m.notScored
      ? 'Not scored for '+esc(rep.split(' ')[0])+' this month. No goal to measure.'+
        (m.valueText ? ' Recorded so far: <strong>'+esc(m.valueText)+'</strong>.' : '')
      : 'No data yet. The goal and weight still count toward the month.';
    return '<div class="g-obj notstarted">'+
      (o.supplier?'<div class="g-obj-sup">'+esc(o.supplier)+'</div>':'')+
      '<div class="g-obj-name">'+esc(o.name)+'</div>'+
      '<div class="g-tags">'+weightTag+
        '<span class="g-pill nodata">'+(m&&m.notScored?'— Not scored':'— Not tracked yet')+'</span>'+
      '</div>'+
      '<div class="g-note">'+note+'</div>'+
    '</div>';
  }

  var st = m.status;
  if(isCarblissLaunch(o)) return carblissCard(o, rep, st);
  // ONE SHORT SUMMARY (2026-09-30, Gavin's Encompass brief): the objective's
  // short name, "3 of 13 buying accounts", "10 more buying accounts needed",
  // one bar, and the goal rule as a quiet supporting line. The weight and
  // the full objective name sit in the Details fold with the tracker's own
  // drill-down; nothing about the calculation changed -- m.value / m.goal /
  // m.remaining are the metric's own numbers.
  var unit = o.unit || '';
  var uPl = function(n, u){ u = String(u||'').trim(); if(!u) return ''; if(n===1) return /s$/.test(u) && !/ss$/.test(u) ? u.replace(/s$/,'') : u; return /s$/.test(u) ? u : u+'s'; };
  var fmtN = function(v){ var n = Number(v); if(!isFinite(n)) return '\u2014'; return (Math.round(n*10)/10).toLocaleString('en-US'); };
  var hasNums = isFinite(Number(m.value)) && isFinite(Number(m.goal)) && Number(m.goal) > 0;
  var main = hasNums
    ? (unit ? fmtN(m.value)+' of '+fmtN(m.goal)+' '+uPl(Number(m.goal), unit) : esc(m.valueText)+' of '+esc(m.goalText))
    : esc(m.valueText);
  var need = m.remaining<=0 ? 'Goal met'
    : (hasNums && unit ? fmtN(m.remaining)+' more '+uPl(Number(m.remaining), unit)+' needed' : esc(m.remainText||String(m.remaining))+' more needed');
  // the rule line only when the goal text says more than the count itself
  var plainGoal = new RegExp('^[\\d,.]+\\s*'+(unit?unit.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'s?':'')+'$','i').test(String(m.goalText||'').trim());
  var rule = (m.goalText && !plainGoal) ? 'Goal is '+esc(String(m.goalText).replace(/^my /,'your ').replace(/ my /,' your ')) : '';

  var subsHtml = '';
  if(m.subs && m.subs.length){
    subsHtml = '<div class="g-subs">'+m.subs.map(function(s){
      return '<div class="g-subrow"><span>'+esc(s.label)+'</span><strong>'+esc(s.valueText)+'</strong></div>';
    }).join('')+'</div>';
  }

  var detail = H.detailHtml(o, rep) || '';
  var mid = 'gm'+(uid++);
  // Details holds only what the card does not already say (2026-10-06): the
  // full program name when the title is shortened, and the tracker's own table.
  var full = titleOf(o) !== o.name ? '<p class="g-full"><span>Full program name</span>'+esc(o.name)+'</p>' : '';
  var moreHtml = (full || detail) ?
      '<button class="g-more js-more" data-target="'+mid+'" aria-expanded="false">'+
        'Details<span class="ar">&#9656;</span></button>'+
      '<div class="g-more-body" id="'+mid+'">'+full+detail+'</div>' : '';

  if(hasNums){
    // READABILITY v4 (2026-10-06, Gavin): Goal (with its unit and, for a
    // percentage rule, the underlying goal) -> Current -> Still Needed ->
    // one bar -> deadline -> View Eligible Accounts. Weight and the full rule
    // stay secondary. Every number is the metric's own (m.goal is the
    // requirement, m.underlying the program goal or account base).
    var met = m.remaining<=0;
    var unitGoal = titleCase(uPlural(Number(m.goal), unit));
    var why = goalWhy(o, m);
    var dl = deadlineOf(o);
    var href = /^Ended/.test(dl) ? '' : eligibleHref(o, rep);   // an ended month has nothing left to sell into
    return '<div class="g-obj g-obj-v3 g-obj-v4 '+st+'">'+
      logoHtml(o)+
      '<div class="g-obj-head"><div class="g-obj-name">'+esc(titleOf(o))+'</div>'+
        '<div class="g-obj-sub">'+esc([o.supplier, (H.monthLabel ? H.monthLabel()+' MPO' : '')].filter(Boolean).join(' · '))+'</div>'+
        creditPill(st)+'</div>'+
      '<div class="g-goal"><div class="g-goal-l">Goal</div><div class="g-goal-v">'+fmtNum(m.goal)+' '+esc(unitGoal)+'</div>'+
        (why ? '<div class="g-goal-why">'+esc(why)+'</div>' : '')+'</div>'+
      '<div class="g-stats">'+
        '<div class="g-stat"><span class="g-stat-l">Current</span><span class="g-stat-v">'+fmtNum(m.value)+'<span class="g-stat-of"> of '+fmtNum(m.goal)+'</span></span></div>'+
        '<div class="g-stat'+(met?' good':'')+'"><span class="g-stat-l">Still Needed</span><span class="g-stat-v">'+(met ? 'Met' : fmtNum(m.remaining))+'</span>'+
          '<span class="g-stat-u">'+(met ? 'Requirement complete' : esc(titleCase(uPlural(Number(m.remaining), unit))))+'</span></div>'+
      '</div>'+
      barHtml(m.pct, st)+
      (dl ? '<div class="g-deadline">'+dl+'</div>' : '')+
      (href && !met ? '<a class="g-elig" href="'+esc(href)+'">View Eligible Accounts</a>' : '')+
      subsHtml+
      '<div class="g-meta g-weight">MPO Weight '+Math.round(o.weight*100)+'%</div>'+
      moreHtml+
    '</div>';
  }
  return '<div class="g-obj g-obj-v2 '+st+'">'+
    (o.supplier?'<div class="g-obj-sup">'+esc(o.supplier)+'</div>':'')+
    '<div class="g-obj-name">'+esc(titleOf(o))+'</div>'+
    '<div class="g-tags">'+creditPill(st)+'</div>'+
    '<div class="g-main"><b>'+main+'</b><span class="g-need'+(m.remaining<=0?' good':'')+'">· '+need+'</span></div>'+
    barHtml(m.pct, st)+
    (rule?'<div class="g-rule">'+rule+'</div>':'')+
    subsHtml+
    moreHtml+
  '</div>';
}

/* ==================================================================
   PROGRAM VIEW -- manager read
   ================================================================== */
function screenProgram(){
  var objs = H.objectives();
  return '<div class="g g-fade">'+
    stepHead(null,'Program results',
      esc(H.scope)+' · '+esc(H.monthLabel())+
      ' · open a program to review each rep.')+
    objs.map(programCard).join('')+
  '</div>';
}

function programCard(o){
  var g = H.atGoal(o);
  if(isCarblissLaunch(o)) return carblissProgramCard(o, g);
  var open = openProgram === o.key;
  var has = !!(g && g.total);
  var share = has ? (g.n/g.total)*100 : 0;

  var head =
    '<button class="g-prog-head js-prog'+(open?' open':'')+'" data-key="'+esc(o.key)+'" '+
      'aria-expanded="'+(open?'true':'false')+'">'+
      logoHtml(o)+
      '<div class="g-prog-top">'+
        '<span class="g-prog-name">'+esc(titleOf(o))+
          '<span class="g-reprow-dm">'+supPeriod(o)+'</span>'+
        '</span>'+
        '<span class="g-chev">&#9656;</span>'+
      '</div>'+
      (has
        ? '<div class="g-fig"><span class="g-fig-n">'+g.n+'</span><span class="g-fig-of"> of '+g.total+'</span><span class="g-fig-u">Reps at Goal</span></div>'+
          barHtml(share, g.n===g.total ? 'achieved' : (g.n>0?'inprogress':'notstarted'))+
          '<div class="g-bar-cap">Team progress: '+Math.round(share)+'% of eligible reps at goal</div>'
        : '<div class="g-need">No data yet \u2014 not counted</div>')+
      '<div class="g-meta">MPO Weight '+Math.round(o.weight*100)+'%<span class="g-review">'+(open?'Hide Reps':'Review Reps')+'</span></div>'+
    '</button>';

  var body = open ? '<div class="g-prog-body open">'+programBody(o)+'</div>' : '';
  return '<div class="g-prog">'+head+body+'</div>';
}

// Carbliss (2026-10-07, Gavin): the program card shows the Carbliss Leaderboard's company tiles and the
// whole card opens the leaderboard (managers and reps alike) instead of expanding the rep list.
function carblissProgramCard(o, g){
  var has = !!(g && g.total);
  // No title line (Gavin, 2026-10-07: redundant) -- the link's aria-label names the program for screen readers.
  var label = titleOf(o)+', '+String(supPeriod(o)).replace(/<[^>]+>/g,'')+'. Open the Carbliss Leaderboard';
  return '<div class="g-prog g-prog-cb"><a class="g-prog-head g-prog-link" href="../../carbliss-onprem-targets/" aria-label="'+esc(label)+'">'+
      logoHtml(o)+
      '<div class="g-cb g-cb-co" data-co="1"><div class="g-cb-wait">Loading Carbliss buyers\u2026</div></div>'+
      '<div class="g-meta">MPO Weight '+Math.round(o.weight*100)+'%'+(has ? ' \u00b7 '+g.n+' of '+g.total+' Reps at Goal' : '')+
        '<span class="g-review">Open Carbliss Leaderboard</span></div>'+
    '</a></div>';
}

function programBody(o){
  var rows = H.roster.map(function(rep){
    var m = H.metric(o, rep);
    return {rep: rep, dm: dmOf(rep), m: m};
  }).filter(function(r){ return !(r.m && (r.m.hidden || r.m.notScored)); });   // reps this objective does not cover are not listed
  if(!rows.some(function(r){return r.m && !r.m.notScored;})){
    return '<div class="g-note">This objective isn’t being tracked with data yet. '+
      'Its goal and weight still count toward the month.</div>';
  }

  // Sorting is presentational only -- it never changes a number. Default
  // is progress descending, which puts reps at goal first and, just below
  // them, the ones closest to it: the "who is nearly there" read a manager
  // is usually after.
  var sorted = rows.slice();
  if(sortMode==='name'){
    sorted.sort(function(a,b){return a.rep.localeCompare(b.rep);});
  } else if(sortMode==='remaining'){
    // Smallest remaining first, among reps not yet at goal -- the shortest
    // distance to another rep reaching the bar.
    sorted.sort(function(a,b){
      var av = a.m && !a.m.notScored, bv = b.m && !b.m.notScored;
      if(av !== bv) return av ? -1 : 1;
      var ao = av && a.m.status!=='achieved', bo = bv && b.m.status!=='achieved';
      if(ao !== bo) return ao ? -1 : 1;
      if(!av || !bv) return 0;
      return (a.m.remaining||0) - (b.m.remaining||0) || a.rep.localeCompare(b.rep);
    });
  } else {
    sorted.sort(function(a,b){
      var ap = (a.m && !a.m.notScored)?a.m.pct:-1, bp = (b.m && !b.m.notScored)?b.m.pct:-1;
      return bp - ap || a.rep.localeCompare(b.rep);
    });
  }

  var bar =
    '<div class="g-sortbar"><span class="g-sortlabel">Sort by</span>'+
      ['progress','remaining','name'].map(function(k){
        var label = k==='progress'?'Progress':(k==='remaining'?'Closest to goal':'Name');
        return '<button class="g-sortbtn js-sort'+(sortMode===k?' active':'')+
          '" data-sort="'+k+'">'+label+'</button>';
      }).join('')+
    '</div>';

  var grid = sorted.map(function(row){
    var m = row.m;
    if(!m || m.notScored){
      return '<div class="g-reprow nodata">'+
        '<span class="g-reprow-name">'+esc(row.rep)+
          '<span class="g-reprow-dm">'+esc(row.dm)+'</span></span>'+
        '<span class="g-reprow-val mute">'+esc((m&&m.valueText)||'—')+'</span>'+
        '<span class="g-reprow-meta"><span class="g-reprow-remain">'+
          (m&&m.notScored?'No goal this month':'Not tracked')+'</span></span>'+
        pillHtml('nodata')+
      '</div>';
    }
    var st = m.status;
    var did = 'gd'+(uid++);
    var nums = isFinite(Number(m.value)) && isFinite(Number(m.goal)) && Number(m.goal)>0;
    var uLbl = o.unit ? uPlural(Number(m.goal), o.unit) : '';
    return '<div class="g-reprow g-reprow-v3 '+st+'">'+
      '<div class="g-rr-id"><span class="g-reprow-name">'+esc(row.rep)+'</span>'+
        (row.dm?'<span class="g-reprow-dm">Manager: '+esc(row.dm)+'</span>':'')+'</div>'+
      '<div class="g-rr-fig"><span class="g-rr-l">Current / Required</span>'+
        '<b>'+(nums ? fmtNum(m.value)+' / '+fmtNum(m.goal) : esc(m.valueText))+'</b>'+
        (nums && uLbl ? '<span class="g-rr-u">'+esc(uLbl)+'</span>' : '')+'</div>'+
      '<div class="g-rr-need"><span class="g-rr-l">Still Needed</span>'+
        '<b>'+(m.remaining>0 ? (nums ? fmtNum(m.remaining) : esc(m.remainText||String(m.remaining))) : 'None')+'</b>'+
        (m.remaining>0 && nums && uLbl ? '<span class="g-rr-u">'+esc(uPlural(m.remaining,o.unit))+'</span>' : '')+'</div>'+
      '<div class="g-rr-bar"><span class="g-reprow-bar"><span class="g-reprow-fill '+st+'" style="width:'+
        Math.max(0,Math.min(100,m.pct))+'%"></span></span><span class="g-rr-pct">'+Math.round(m.pct)+'% of requirement</span></div>'+
      '<div class="g-rr-act">'+pillHtml(st)+
      '<button class="g-reprow-more js-repdetail" data-target="'+did+'" data-key="'+esc(o.key)+
        '" data-rep="'+esc(row.rep)+'" aria-expanded="false">View Account Details<span class="ar">&#9656;</span></button></div>'+
      '<div class="g-reprow-detail" id="'+did+'"></div>'+
    '</div>';
  }).join('');

  return bar + '<div class="g-repgrid">'+grid+'</div>';
}

/* ==================================================================
   Render + events
   ================================================================== */
function render(){
  if(!mount) return;
  try{ if(window.kdhViewing) window.kdhViewing(view==='rep' && activeRep && !lockedRep() ? activeRep : '', function(){ asRep = false; decorateAsRep(); go({view:'rep', rep:null, program:null}); }); }catch(e){}
  applyLock(); decorateLock();
  var html;
  if(view==='program') html = screenProgram();
  else if(activeRep && H.roster.indexOf(activeRep)>=0) html = screenRepDetail();
  else { activeRep = null; html = screenRepPicker(); }
  mount.innerHTML = html;
  if(window.KdhFit) window.KdhFit.tables(mount);
  hydrateCarbliss();
  var segs = document.querySelectorAll('.g-seg-btn');
  for(var i=0;i<segs.length;i++){
    segs[i].classList.toggle('active', segs[i].dataset.view===view);
  }
  if(H.afterRender) H.afterRender();
}

function wire(){
  // One delegated listener for everything this module renders, so a
  // re-render never leaves a dead control behind. The host pages' own
  // delegated handlers (target-account and existing-account toggles
  // inside the drill-downs) keep working untouched.
  mount.addEventListener('click', function(e){
    var repBtn = e.target.closest('.js-rep');
    if(repBtn){ go({rep: repBtn.dataset.rep}); return; }

    if(e.target.closest('.js-back')){ go({rep:null}); return; }
    if(e.target.closest('.js-startover')){ go({view:'rep', rep:null, program:null}); return; }

    var prog = e.target.closest('.js-prog');
    if(prog){
      var k = prog.dataset.key;
      go({program: openProgram===k ? null : k}, {scroll:false});
      return;
    }

    var sortBtn = e.target.closest('.js-sort');
    if(sortBtn){ sortMode = sortBtn.dataset.sort; render(); return; }

    var rd = e.target.closest('.js-repdetail');
    if(rd){
      var rbody = document.getElementById(rd.dataset.target);
      var ropen = rd.classList.toggle('open');
      rd.setAttribute('aria-expanded', ropen?'true':'false');
      if(rbody){
        if(ropen && !rbody.dataset.filled){
          var obj = H.objectives().filter(function(x){return x.key===rd.dataset.key;})[0];
          rbody.innerHTML = (obj && H.detailHtml(obj, rd.dataset.rep)) ||
            '<div class="g-note">No line-level detail for this rep this month.</div>';
          rbody.dataset.filled = '1';
          if(window.KdhFit) window.KdhFit.tables(rbody);
        }
        rbody.classList.toggle('open', ropen);
      }
      return;
    }

    var more = e.target.closest('.js-more');
    if(more){
      var body = document.getElementById(more.dataset.target);
      var nowOpen = more.classList.toggle('open');
      more.setAttribute('aria-expanded', nowOpen?'true':'false');
      if(body) body.classList.toggle('open', nowOpen);
      return;
    }
  });

  document.addEventListener('click', function(e){
    var seg = e.target.closest('.g-seg-btn');
    if(!seg) return;
    if(seg.dataset.view===view) return;
    go({view: seg.dataset.view});
  });

  window.addEventListener('popstate', function(){
    var s = hashToState();
    view = s.view==='program' ? 'program' : 'rep';
    activeRep = (s.rep && H.roster.indexOf(s.rep)>=0) ? s.rep : null;
    openProgram = s.program || null;
    applyLock();
    if(s.month && H.monthKey && s.month !== H.monthKey() && H.loadMonth){
      H.loadMonth(s.month);   // re-renders through refresh() when it lands
      return;
    }
    render();
  });
}

var API = {
  init: function(host){
    H = host;
    // A district manager sees only their team (2026-09-29): the roster and
    // the picker's groups are cut down here, so Step 1, Program View and
    // a rep in the URL only know their reps.
    var T = window.kdhTeam ? window.kdhTeam(host.dmGroups || []) : null;
    if(T){
      H = Object.assign({}, host, {
        roster: (host.roster || []).filter(function(r){ return T.reps.indexOf(r) >= 0; }),
        dmGroups: (host.dmGroups || []).filter(function(g){ return g.dm === T.dm || g.under === T.dm; })
      });
    }
    mount = host.mount;

    // The URL wins over the remembered state -- a shared link should land
    // where it says, not where this browser was last.
    var s = hashToState();
    if(s.view || s.rep || s.program){
      view = s.view==='program' ? 'program' : 'rep';
      activeRep = s.rep || null;
      openProgram = s.program || null;
    } else {
      // Every manager (DMs included) opens on View by Program (Gavin, 2026-10-07; replaces the
      // 2026-09-29 "a DM starts by rep" rule and the remembered view). A link that names a rep or a
      // program still wins, and a signed-in rep is pinned to their own page by applyLock().
      view = 'program'; activeRep = null;
    }
    // A manager sent here for ONE rep sees that rep's page and nothing else.
    if(!lockedRep() && KDH_USER && KDH_USER.role === 'manager' && s.rep){ asRep = true; view = 'rep'; openProgram = null; }
    decorateAsRep();
    applyLock();
    wire();
    return API;
  },
  // Called by the host after a month finishes loading. The rep is kept
  // across months when they are still on the roster, so switching months
  // answers "how did this same rep do in August" rather than dumping the
  // user back to the picker.
  refresh: function(){
    if(activeRep && H.roster.indexOf(activeRep)<0) activeRep = null;
    if(openProgram && !H.objectives().some(function(o){return o.key===openProgram;})){
      openProgram = null;
    }
    render();
    // replaceState, not pushState: a month switch should not become a
    // Back step, but the URL must still describe what is on screen.
    try{ history.replaceState(null,'',stateToHash()); }catch(e){}
    persist();
  },
  wantedMonth: function(){
    var s = hashToState();
    return s.month || (restore()||{}).month || null;
  },
  syncHash: function(){ persist(); },
  get view(){ return view; },
  get rep(){ return activeRep; }
};

global.MPOGuided = API;
})(window);
