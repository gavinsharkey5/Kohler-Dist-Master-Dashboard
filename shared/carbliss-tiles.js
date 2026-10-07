/* Carbliss MPO tiles (2026-10-07): ONE card for the October on-premise Carbliss MPO, the same four tiles as
   /carbliss-onprem-targets/ -- L90 Buyers, Aug 1 - Oct 31 Buyers (both against the team goal), YTD Buyers,
   Fell Off L90 -- plus the customers that fell off. Data = carbliss-mpo/data/program.json (meta.counts is the
   company, byrep the per-rep counts, fell the win-back list; a rep's copy carries only their own names).
   KdhCarbTiles.html(D, opt): opt.rep = a rep name (their own counts, company beneath) or empty for the company;
   opt.list = how many fell-off customers to show (default all); opt.link = leaderboard href (default none). */
(function(){
  var esc = function(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var day = function(iso){ var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||''); return m ? MON[+m[2]-1]+' '+(+m[3]) : ''; };
  var fmt = function(n){ return Number(n).toLocaleString('en-US'); };
  function pick(D, rep){
    var names = (D.byrep||[]).map(function(b){ return b.rep; });
    var me = rep ? (window.kdhMatchName ? window.kdhMatchName(rep, names) : (names.indexOf(rep)>=0 ? rep : null)) : null;
    var row = me ? D.byrep.filter(function(b){ return b.rep===me; })[0] : null;
    return {me: me, row: row};
  }
  window.KdhCarbTiles = {
    html: function(D, opt){
      opt = opt || {};
      var C = (D.meta && D.meta.counts) || {}, goal = (D.meta && D.meta.goal) || 331;
      var P = pick(D, opt.rep), mine = !!opt.rep;
      var N = mine ? (P.row || {prog:0,l90:0,ytd:0,fell:0}) : C;
      var fell = (D.fell||[]).filter(function(f){ return !mine || (P.me && f.rep===P.me) || !P.me; });
      if(mine && !P.me) fell = [];
      var tile = function(label, n, co, goalTile){
        var sub = !goalTile ? 'Since launch' : (mine ? 'Company '+fmt(co)+' / '+fmt(goal) : fmt(Math.max(0, goal-n))+' to go');
        return '<div class="cbx-t"><div class="cbx-l">'+label+'</div><div class="cbx-v">'+fmt(n)+(goalTile && !mine ? '<span class="cbx-of"> / '+fmt(goal)+'</span>' : '')+'</div><div class="cbx-s">'+sub+'</div></div>';
      };
      var rows = fell.slice(0, opt.list || fell.length).map(function(f){
        return '<div class="cbx-row"><span class="cbx-n">'+esc(f.name)+'</span>'+(mine?'':'<span class="cbx-r">'+esc(f.rep)+'</span>')+'<span class="cbx-d">Last '+esc(day(f.last))+'</span></div>';
      }).join('');
      return '<div class="cbx">'+
        (opt.noTitle ? '' : '<div class="cbx-h">'+(mine ? (opt.rep+'’s') : 'Company')+' Carbliss Buyers</div>')+'<div class="cbx-g">'+(mine ? esc(opt.rep)+' · ' : '')+'Team Goal: '+fmt(goal)+' Buyers</div>'+
        '<div class="cbx-tiles">'+tile('L90 Buyers', N.l90, C.l90, true)+tile('Aug 1 – Oct 31 Buyers', N.prog, C.prog, true)+tile('YTD Buyers', N.ytd, C.ytd, false)+
          '<div class="cbx-t cbx-alert"><div class="cbx-l">Fell Off L90</div><div class="cbx-v">'+fmt(N.fell)+'</div><div class="cbx-s">YTD, not in L90</div></div></div>'+
        (opt.compact ? '' : '<div class="cbx-fh">Customers That Fell Off L90 <span>'+fmt(N.fell)+'</span></div>'+
        (rows ? '<div class="cbx-list">'+rows+'</div>' : '<div class="cbx-none">No customers fell off.</div>')) +
        (opt.link ? '<a class="cbx-link" href="'+esc(opt.link)+'">Open Carbliss Leaderboard</a>' : '')+
        (opt.compact ? '' : '<div class="cbx-foot">Sales through '+esc(day(D.meta && D.meta.sales_through))+'</div>')+'</div>';
    }
  };
})();
