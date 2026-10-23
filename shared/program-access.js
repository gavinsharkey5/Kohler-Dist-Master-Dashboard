/* DM program eligibility. Keep this JSON assignment parseable by tools/rep_slices.py.
   Rules narrow existing eligibility; they never add credit, extend dates or bypass territory.
   General programs keep their territory/premise eligibility. Only an explicit
   program restriction below limits participation to a DM's team. */
window.KDH_PROGRAM_ACCESS = {
  "programs": {
    "inc:path_to_victory_sd": {"dms": ["Mike Kennedy"]},
    "inc:fall_seasonal_sd": {"dms": ["Mike Kennedy"]}
  }
};
(function(global){
  'use strict';
  global.kdhProgramAllowed = function(source, key, rep){
    var groups = global.KDH_DM_GROUPS || [], config = global.KDH_PROGRAM_ACCESS;
    var match = global.kdhMatchName ? global.kdhMatchName(rep, groups.flatMap(function(g){return g.reps;})) : rep;
    var group = groups.find(function(g){return g.reps.includes(match);});
    var dm = group && group.dm;
    var rule = config.programs[source+':'+key];
    return !rule || !rule.dms || rule.dms.includes(dm);
  };
})(window);
