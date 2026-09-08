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
var openProgram = null;
var sortMode = 'progress';    // 'progress' | 'name' | 'remaining'

var LS_KEY = 'kohler-mpo-guided';

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
  if('rep' in next) activeRep = next.rep;
  if('program' in next) openProgram = next.program;
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
  notstarted:'Not Started', nodata:'Not tracked yet'};
var STATUS_MARK = {achieved:'✓', inprogress:'●', notstarted:'○', nodata:'—'};

function pillHtml(status){
  return '<span class="g-pill '+status+'">'+STATUS_MARK[status]+' '+STATUS_TEXT[status]+'</span>';
}
function barHtml(pct, status){
  return '<div class="g-bar"><div class="g-bar-fill '+status+'" style="width:'+
    Math.max(0,Math.min(100,pct||0))+'%"></div></div>';
}
function stepHead(step, title, sub){
  return '<div class="g-step-head">'+
    (step?'<span class="g-eyebrow">Step '+step+'</span>':'')+
    '<div class="g-title">'+title+'</div>'+
    (sub?'<div class="g-sub">'+sub+'</div>':'')+
  '</div>';
}
function dmOf(rep){
  var g = (H.dmGroups||[]).find(function(x){return x.reps.indexOf(rep)>=0;});
  return g ? g.dm : '';
}

/* ==================================================================
   REP VIEW -- Step 1: choose a rep
   ================================================================== */
function screenRepPicker(){
  var roster = H.roster.slice();
  var grouped = {};
  (H.dmGroups||[]).forEach(function(g){
    var mine = g.reps.filter(function(r){return roster.indexOf(r)>=0;});
    if(mine.length) grouped[g.dm] = mine.slice().sort();
  });
  var seen = Object.keys(grouped).reduce(function(a,k){return a.concat(grouped[k]);},[]);
  var leftovers = roster.filter(function(r){return seen.indexOf(r)<0;}).sort();
  if(leftovers.length) grouped['Other'] = leftovers;

  var body = Object.keys(grouped).map(function(dm){
    return '<div class="g-dm">'+esc(dm)+'</div>'+
      '<div class="g-grid">'+grouped[dm].map(function(r){
        return '<button class="g-name js-rep" data-rep="'+esc(r)+'">'+esc(r)+
          '<span class="ar">&#8594;</span></button>';
      }).join('')+'</div>';
  }).join('');

  return '<div class="g g-fade">'+
    stepHead(1,'Choose a rep',
      'Tap a name to see that rep’s '+esc(H.monthLabel())+' '+esc(H.scope)+
      ' MPO progress.')+
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
  if(w.notscored) excluded.push(pl(w.notscored,'objective')+' with no goal for this rep');
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

  var cards = objs.map(function(o){ return repObjectiveCard(o, rep); }).join('');

  return '<div class="g g-fade">'+
    '<div class="g-actions">'+
      '<button class="g-back js-back"><span class="ar">&#8592;</span>Back to Reps</button>'+
      '<button class="g-back js-startover"><span class="ar">&#8635;</span>Start Over</button>'+
    '</div>'+
    stepHead(2, esc(first)+'’s MPO Progress',
      esc(H.scope)+' · '+esc(H.monthLabel())+
      (dmOf(rep)?' · Sales manager: '+esc(dmOf(rep)):''))+
    '<div class="g-sum-grid">'+sums.map(function(k){
      return '<div class="g-sum"><div class="g-sum-l">'+k.l+'</div>'+
        '<div class="g-sum-n '+k.cls+'">'+k.n+'</div>'+
        '<div class="g-sum-s">'+k.s+'</div></div>';
    }).join('')+'</div>'+
    cards+
  '</div>';
}

function repObjectiveCard(o, rep){
  var m = H.metric(o, rep);
  var weightTag = '<span class="g-tag weight">'+Math.round(o.weight*100)+'% of MPO</span>';

  if(!m || m.notScored){
    var note = m && m.notScored
      ? 'This objective doesn’t apply to '+esc(rep.split(' ')[0])+' this month — there’s no '+
        'goal to measure against, so it isn’t counted for or against them.'+
        (m.valueText ? ' Recorded so far: <strong>'+esc(m.valueText)+'</strong>.' : '')
      : 'This objective isn’t being tracked with data yet, so there’s no progress to show. '+
        'The goal and its weight still count toward the month.';
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
  var facts =
    '<div class="g-facts">'+
      '<div><div class="g-fact-l">My Goal</div><div class="g-fact-v">'+esc(m.goalText)+'</div></div>'+
      '<div><div class="g-fact-l">Where I Am</div><div class="g-fact-v'+
        (st==='achieved'?' good':'')+'">'+esc(m.valueText)+'</div></div>'+
      '<div><div class="g-fact-l">Still Needed</div><div class="g-fact-v'+
        (m.remaining<=0?' good':'')+'">'+
        (m.remaining<=0?'Goal met':esc(m.remainText||String(m.remaining)))+'</div></div>'+
      '<div><div class="g-fact-l">Credit Earned</div><div class="g-fact-v'+
        (st==='achieved'?' good':' mute')+'">'+
        (st==='achieved'?'Yes':'Not yet')+'</div></div>'+
    '</div>';

  var subsHtml = '';
  if(m.subs && m.subs.length){
    subsHtml = '<div style="margin-bottom:14px">'+m.subs.map(function(s){
      return '<div style="margin-bottom:10px">'+
        '<div class="g-barcap"><span>'+esc(s.label)+'</span>'+
          '<strong>'+esc(s.valueText)+'</strong></div>'+
        barHtml(s.pct, s.status)+
      '</div>';
    }).join('')+'</div>';
  }

  var detail = H.detailHtml(o, rep) || '';
  var mid = 'gm'+(uid++);
  var moreHtml = detail
    ? '<button class="g-more js-more" data-target="'+mid+'" aria-expanded="false">'+
        'See My Progress<span class="ar">&#9656;</span></button>'+
      '<div class="g-more-body" id="'+mid+'">'+detail+'</div>'
    : '';

  return '<div class="g-obj '+st+'">'+
    (o.supplier?'<div class="g-obj-sup">'+esc(o.supplier)+'</div>':'')+
    '<div class="g-obj-name">'+esc(o.name)+'</div>'+
    '<div class="g-tags">'+weightTag+
      '<span class="g-tag">Goal: '+esc(m.goalText)+'</span>'+
      pillHtml(st)+
    '</div>'+
    facts+
    barHtml(m.pct, st)+
    // The four facts above already state where the rep is, so the bar
    // carries only the one thing they don't: how far along that is.
    '<div class="g-barcap"><span>'+Math.round(m.pct)+'% of goal</span></div>'+
    subsHtml+
    moreHtml+
  '</div>';
}

/* ==================================================================
   PROGRAM VIEW -- manager read
   ================================================================== */
function screenProgram(){
  var objs = H.objectives();
  var weighted = objs.reduce(function(s,o){return s + o.weight * H.programPct(o);},0);

  var sums = [{l:'Overall Weighted MPO', n:Math.round(weighted)+'%',
    cls: weighted>=90?'good':(weighted>=50?'accent':''),
    s:'across all '+objs.length+' objectives'}];
  objs.forEach(function(o){
    var g = H.atGoal(o);
    if(!g){
      sums.push({l:esc(o.shortName||o.name), n:'—', cls:'mute', s:'not tracked yet'});
      return;
    }
    // An objective may carry its own headline KPI (New Belgium leads with
    // the company distribution percentage, reps-at-goal underneath) -- the
    // same figures the old KPI strip printed.
    sums.push({l:esc(o.shortName||o.name)+(g.headline?'':' – Reps at Goal'),
      n: g.headline || (g.n+' / '+g.total),
      cls: g.cls || (g.total && g.n===g.total ? 'good' : (g.n?'accent':'mute')),
      s: g.sub || o.goalLabel || ''});
  });

  return '<div class="g g-fade">'+
    stepHead(null,'Program Results',
      esc(H.scope)+' · '+esc(H.monthLabel())+
      ' · tap a program to see every rep’s result.')+
    '<div class="g-sum-grid">'+sums.map(function(k){
      return '<div class="g-sum"><div class="g-sum-l">'+k.l+'</div>'+
        '<div class="g-sum-n '+k.cls+'">'+k.n+'</div>'+
        '<div class="g-sum-s">'+k.s+'</div></div>';
    }).join('')+'</div>'+
    objs.map(programCard).join('')+
  '</div>';
}

function programCard(o){
  var g = H.atGoal(o);
  var open = openProgram === o.key;
  var pct = H.programPct(o);
  var eligible = H.roster.length;

  var head =
    '<button class="g-prog-head js-prog'+(open?' open':'')+'" data-key="'+esc(o.key)+'" '+
      'aria-expanded="'+(open?'true':'false')+'">'+
      '<div class="g-prog-top">'+
        '<span class="g-prog-name">'+esc(o.name)+
          (o.supplier?'<span class="g-reprow-dm">'+esc(o.supplier)+'</span>':'')+
        '</span>'+
        '<span class="g-prog-right">'+
          '<span><span class="g-prog-atgoal'+(g&&g.total&&g.n===g.total?' good':'')+'">'+
            (g? g.n+' / '+g.total : '—')+'</span>'+
            '<span class="g-prog-atgoal-l">reps at goal</span></span>'+
          '<span class="g-chev">&#9656;</span>'+
        '</span>'+
      '</div>'+
      '<div class="g-tags" style="margin:12px 0 0">'+
        '<span class="g-tag weight">'+Math.round(o.weight*100)+'% of MPO</span>'+
        (o.goalLabel?'<span class="g-tag">Goal: '+esc(o.goalLabel)+'</span>':'')+
        '<span class="g-tag">'+pl(eligible,'eligible rep')+'</span>'+
        (g?'<span class="g-tag">'+Math.round(g.total?(g.n/g.total)*100:0)+'% at goal</span>':'')+
      '</div>'+
      barHtml(pct, g && g.total && g.n===g.total ? 'achieved' : 'inprogress')+
    '</button>';

  var body = open ? '<div class="g-prog-body open">'+programBody(o)+'</div>' : '';
  return '<div class="g-prog">'+head+body+'</div>';
}

function programBody(o){
  var rows = H.roster.map(function(rep){
    var m = H.metric(o, rep);
    return {rep: rep, dm: dmOf(rep), m: m};
  });
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
    return '<div class="g-reprow '+st+'">'+
      '<span class="g-reprow-name">'+esc(row.rep)+
        '<span class="g-reprow-dm">'+esc(row.dm)+'</span></span>'+
      '<span class="g-reprow-val'+(st==='notstarted'?' mute':'')+'">'+esc(m.valueText)+'</span>'+
      '<span class="g-reprow-meta">'+
        '<span class="g-reprow-bar"><span class="g-reprow-fill '+st+'" style="width:'+
          Math.max(0,Math.min(100,m.pct))+'%"></span></span>'+
        '<span class="g-reprow-remain">'+Math.round(m.pct)+'%'+
          (m.remaining>0 && m.remainText ? ' · '+esc(m.remainText)+' to go' : '')+
        '</span>'+
      '</span>'+
      pillHtml(st)+
    '</div>';
  }).join('');

  return bar + '<div class="g-repgrid">'+grid+'</div>';
}

/* ==================================================================
   Render + events
   ================================================================== */
function render(){
  if(!mount) return;
  var html;
  if(view==='program') html = screenProgram();
  else if(activeRep && H.roster.indexOf(activeRep)>=0) html = screenRepDetail();
  else { activeRep = null; html = screenRepPicker(); }
  mount.innerHTML = html;
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
    mount = host.mount;

    // The URL wins over the remembered state -- a shared link should land
    // where it says, not where this browser was last.
    var s = hashToState();
    if(s.view || s.rep || s.program){
      view = s.view==='program' ? 'program' : 'rep';
      activeRep = s.rep || null;
      openProgram = s.program || null;
    } else {
      var saved = restore();
      if(saved){
        view = saved.view==='program' ? 'program' : 'rep';
        activeRep = saved.rep || null;
      }
    }
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
