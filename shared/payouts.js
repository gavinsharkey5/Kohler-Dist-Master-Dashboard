/* Kohler Distribution Hub -- THE payout calculation (2026-10-19).
   window.KdhPayouts: pure functions, no DOM, no fetches. Two callers:
     - manage-programs/manage.js  step 7 / review preview (payoutPreview)
     - hub/hub.js                 Export Recap (supplier billing, rep + DM payouts)
   so the site has ONE payout calculation. Inputs are a program's
   program_finance.terms (manager-only, RLS) and the evaluator's results
   (shared/custom-programs.js evaluate()) -- progress is never recalculated here.

   terms = {items:[{objectiveId, kind per_unit|flat|tiered|package, rate, qualifier,
                    houseEffect half|none|rate, rateBoth, billback (notes), tiersText, packagesText}],
            notes,
            manager:{kind none|flat_team|per_qualified|pct_team, amount, pct, when program_team|all_qualified},
            billback:{kind not_stated|none|rep|rep_mgr|pct|per_unit, pct, pctBasis rep|rep_mgr, rate, objectiveId, cap}}
   Old terms with no manager / billback rule read as None / Not stated. NEVER a
   default that bills the supplier.

   NEVER GUESS: an amount is null (with a reason) whenever the rule or the data
   does not determine it, and anything null marks its total incomplete. */
(function (global) {
  'use strict';
  var SUPPORT_LABEL = { supported: 'Tracked from sales data', awaiting_data: 'Awaiting sales data', awaiting_calc: 'Awaiting calculation support', awaiting_evidence: 'Recorded, not verified', awaiting_decision: 'Needs a decision', partial: 'Partly tracked' };
  function num(v) { return v === '' || v == null || isNaN(Number(v)) ? null : Number(v); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function money(n) { return n == null ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

  function normalize(terms) {
    var t = terms && typeof terms === 'object' ? terms : {};
    return {
      items: Array.isArray(t.items) ? t.items : [],
      notes: t.notes || '',
      manager: Object.assign({ kind: 'none', amount: null, pct: null, when: 'program_team' }, t.manager || {}),
      billback: Object.assign({ kind: 'not_stated', pct: null, pctBasis: 'rep', rate: null, objectiveId: '', cap: null }, t.billback || {})
    };
  }

  // "10 → 300" / "90% -> 300" / "6pk = 2.00": [{label, value, pct}] or null when any line is unreadable
  function parseLines(text, numericLabel) {
    var out = [], bad = false;
    String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (line) {
      var m = line.match(/^(.+?)\s*(?:→|->|=>|=|:)\s*\$?\s*([\d,]*\.?\d+)\s*$/);
      if (!m) { bad = true; return; }
      var label = m[1].trim(), amount = Number(m[2].replace(/,/g, ''));
      if (numericLabel) {
        var p = label.match(/^([\d,]*\.?\d+)\s*%$/), n = label.match(/^([\d,]*\.?\d+)$/);
        if (p) out.push({ label: label, pct: Number(p[1].replace(/,/g, '')), value: amount });
        else if (n) out.push({ label: label, threshold: Number(n[1].replace(/,/g, '')), value: amount });
        else bad = true;
      } else out.push({ label: label, value: amount });
    });
    return bad || !out.length ? null : out;
  }

  // per-product units behind an objective's result (package rates need them)
  function unitsByProduct(o) {
    var by = {};
    (o.credited || []).forEach(function (a) {
      if (o.metric === 'placements' || o.metric === 'new_placements') (a.lines || []).forEach(function (l) { by[l.id] = (by[l.id] || 0) + 1; });
      else if (o.metric === 'units') (a.bought || []).forEach(function (b) { by[b.id] = (by[b.id] || 0) + (Number(b.cases) || 0); });
    });
    return by;
  }

  // the team (house) goal of a program: {computed, met, value, goal, reason}
  // results = {rep: evaluate() result} for EVERY participant (not only the viewer's scope)
  function teamResult(def, results) {
    var ho = ((def && def.objectives) || []).filter(function (o) { return o.goal && o.goal.type === 'house'; })[0];
    if (!ho) return { computed: false, reason: 'No team goal in this program' };
    var goal = num(ho.goal.value); if (!goal) return { computed: false, reason: 'Team goal not set' };
    var reps = Object.keys(results || {}); if (!reps.length) return { computed: false, reason: 'No participant results' };
    var total = 0;
    for (var i = 0; i < reps.length; i++) {
      var R = results[reps[i]]; var r = R && (R.objectives || []).filter(function (x) { return x.id === ho.id; })[0];
      if (!r || !r.house) return { computed: false, reason: 'Team result not computed (' + (r ? (SUPPORT_LABEL[r.support] || r.support) : 'no result') + ' for ' + reps[i] + ')' };
      total += Number(r.value) || 0;
    }
    return { computed: true, met: total >= goal, value: round2(total), goal: goal, objectiveId: ho.id, label: ho.label || 'Team goal' };
  }

  // one payout term against one rep's result -> {objectiveId, amount|null, text, flags[], incomplete}
  function termPayout(item, R, ctx) {
    ctx = ctx || {}; var objs = (R && R.objectives) || [];
    var o = item.objectiveId ? objs.filter(function (x) { return x.id === item.objectiveId; })[0] : (R && (R.primary || objs[0]));
    var res = { objectiveId: o ? o.id : (item.objectiveId || ''), amount: null, text: '', flags: [], incomplete: false, how: '' };
    if (!o) { res.text = 'No objective to apply this term to'; res.incomplete = true; return res; }
    if (o.support !== 'supported') { res.text = SUPPORT_LABEL[o.support] || o.support; res.incomplete = true; return res; }
    var rate = num(item.rate), amt = null;
    if (item.kind === 'per_unit') {
      if (rate == null) { res.text = 'Rate not set'; res.incomplete = true; return res; }
      amt = rate * (Number(o.value) || 0); res.how = money(rate) + ' × ' + (Number(o.value) || 0) + ' ' + (o.unit || 'units');
    } else if (item.kind === 'flat') {
      if (rate == null) { res.text = 'Amount not set'; res.incomplete = true; return res; }
      amt = o.status === 'achieved' ? rate : 0; res.how = 'Flat ' + money(rate) + ' when met';
    } else if (item.kind === 'tiered') {
      var tiers = parseLines(item.tiersText, true);
      if (!tiers || (tiers.some(function (t) { return t.pct != null; }) && !(o.goal > 0))) { res.text = 'Tier not determinable: ' + String(item.tiersText || '(no tiers)').replace(/\s*\r?\n\s*/g, '; '); res.incomplete = true; return res; }
      var v = Number(o.value) || 0, best = null;
      tiers.forEach(function (t) { var need = t.pct != null ? o.goal * t.pct / 100 : t.threshold; if (v >= need && (!best || need >= best.need)) best = { need: need, value: t.value, label: t.label }; });
      amt = best ? best.value : 0; res.how = best ? 'Tier ' + best.label + ' → ' + money(best.value) : 'No tier reached';
    } else if (item.kind === 'package') {
      var lines = parseLines(item.packagesText, false);
      if (!lines) { res.text = 'Package rates not determinable: ' + String(item.packagesText || '(none)').replace(/\s*\r?\n\s*/g, '; '); res.incomplete = true; return res; }
      if (['units', 'placements', 'new_placements'].indexOf(o.metric) < 0) { res.text = 'Package rates apply to cases or placements only'; res.incomplete = true; return res; }
      var by = unitsByProduct(o), P = ctx.products || {}, unmatched = {}; amt = 0;
      Object.keys(by).forEach(function (pid) {
        var pk = String((P[pid] && P[pid].package) || '').trim().toLowerCase();
        var hit = lines.filter(function (l) { return l.label.trim().toLowerCase() === pk; })[0];
        if (hit) amt += hit.value * by[pid]; else unmatched[(P[pid] && P[pid].package) || 'package not on file'] = 1;
      });
      res.how = 'Package rates';
      var um = Object.keys(unmatched); if (um.length) res.flags.push('Unpaid (no matching package line): ' + um.join(', '));
    } else { res.text = 'Payout kind not set'; res.incomplete = true; return res; }

    // team condition: only when the team result is actually computed
    if (item.houseEffect) {
      var T = ctx.team || { computed: false };
      if (!T.computed) res.flags.push('Team condition not applied');
      else if (item.houseEffect === 'half' && !T.met) { amt = amt * 0.5; res.flags.push('Team goal missed: 50%'); }
      else if (item.houseEffect === 'none' && !T.met) { amt = 0; res.flags.push('Team goal missed: no payout'); }
      else if (item.houseEffect === 'rate' && T.met && o.status === 'achieved') {
        var rb = num(item.rateBoth);
        if (rb == null) res.flags.push('Rate when both are met not set; base rate used');
        else if (item.kind === 'per_unit') { amt = rb * (Number(o.value) || 0); res.flags.push('Team + individual met: ' + money(rb) + ' rate'); }
        else if (item.kind === 'flat') { amt = rb; res.flags.push('Team + individual met: ' + money(rb)); }
        else res.flags.push('Higher rate applies to per-unit and flat terms only; not applied');
      }
    }
    // prerequisite / qualifier gates
    if (o.locked) { amt = 0; res.flags.push('Locked until ' + o.lockedBy + ' is met'); }
    if (item.qualifier) {
      var q = objs.filter(function (x) { return x.id === item.qualifier; })[0];
      if (!q || q.support !== 'supported') { res.amount = null; res.text = 'Qualifier not computable (' + (q ? SUPPORT_LABEL[q.support] : 'missing') + ')'; res.incomplete = true; return res; }
      if (q.status !== 'achieved') { amt = 0; res.flags.push('Qualifier "' + (q.label || 'objective') + '" not met'); }
    }
    res.amount = round2(amt);
    return res;
  }

  // every term for one rep: {byObjective:{id:{amount|null, texts[], flags[], incomplete}}, total, incomplete, noTerms}
  function repPayout(terms, R, ctx) {
    var T = normalize(terms); var out = { byObjective: {}, total: 0, incomplete: false, noTerms: !T.items.length, terms: [] };
    T.items.forEach(function (it) {
      var p = termPayout(it, R, ctx); out.terms.push(p);
      var b = out.byObjective[p.objectiveId] || (out.byObjective[p.objectiveId] = { amount: 0, texts: [], flags: [], incomplete: false });
      if (p.amount == null) { b.incomplete = true; b.texts.push(p.text); }
      else b.amount = round2(b.amount + p.amount);
      p.flags.forEach(function (f) { if (b.flags.indexOf(f) < 0) b.flags.push(f); });
      if (p.incomplete) { b.incomplete = true; out.incomplete = true; }
      if (p.amount != null) out.total = round2(out.total + p.amount);
    });
    Object.keys(out.byObjective).forEach(function (k) { var b = out.byObjective[k]; if (b.incomplete && b.amount === 0 && b.texts.length) b.amount = null; });
    return out;
  }

  // a DM's payout. team = {reps:[{qualified true|false|null, payout number|null, incomplete}], teamGoal:{computed, met}}
  function managerPayout(rule, team) {
    var M = normalize({ manager: rule }).manager; var reps = (team && team.reps) || [];
    var res = { amount: null, text: '', incomplete: false, none: false };
    if (!M.kind || M.kind === 'none') { res.none = true; res.text = 'None'; return res; }
    if (M.kind === 'flat_team') {
      var a = num(M.amount); if (a == null) { res.text = 'Amount not set'; res.incomplete = true; return res; }
      if (M.when === 'all_qualified') {
        if (!reps.length) { res.amount = 0; res.text = 'No reps on this team'; return res; }
        if (reps.some(function (r) { return r.qualified == null; })) { res.text = 'Not computed: a rep’s result is not available'; res.incomplete = true; return res; }
        res.amount = reps.every(function (r) { return r.qualified; }) ? a : 0; return res;
      }
      var tg = (team && team.teamGoal) || { computed: false };
      if (!tg.computed) { res.text = 'Team goal not computed'; res.incomplete = true; return res; }
      res.amount = tg.met ? a : 0; return res;
    }
    if (M.kind === 'per_qualified') {
      var b = num(M.amount); if (b == null) { res.text = 'Amount not set'; res.incomplete = true; return res; }
      var n = reps.filter(function (r) { return r.qualified === true; }).length;
      if (reps.some(function (r) { return r.qualified == null; })) { res.incomplete = true; res.text = 'Some reps not computed'; }
      res.amount = round2(n * b); return res;
    }
    if (M.kind === 'pct_team') {
      var p = num(M.pct); if (p == null) { res.text = 'Percent not set'; res.incomplete = true; return res; }
      var sum = 0; reps.forEach(function (r) { if (r.payout != null) sum += r.payout; if (r.incomplete) res.incomplete = true; });
      if (res.incomplete) res.text = 'Some rep payouts not computed';
      res.amount = round2(sum * p / 100); return res;
    }
    res.text = 'Rule not recognised'; res.incomplete = true; return res;
  }

  // what the supplier is billed. s = {rep, mgr, units (number|null), incomplete}
  function billback(rule, s) {
    var B = normalize({ billback: rule }).billback; s = s || {};
    var res = { amount: null, basis: basisText(B), notStated: false, incomplete: !!s.incomplete, capped: false };
    if (!B.kind || B.kind === 'not_stated') { res.notStated = true; return res; }
    var amt;
    if (B.kind === 'none') amt = 0;
    else if (B.kind === 'rep') amt = Number(s.rep) || 0;
    else if (B.kind === 'rep_mgr') amt = (Number(s.rep) || 0) + (Number(s.mgr) || 0);
    else if (B.kind === 'pct') {
      var p = num(B.pct); if (p == null) { res.basis += ' (percent not set)'; res.incomplete = true; return res; }
      amt = (B.pctBasis === 'rep_mgr' ? (Number(s.rep) || 0) + (Number(s.mgr) || 0) : (Number(s.rep) || 0)) * p / 100;
    } else if (B.kind === 'per_unit') {
      var r = num(B.rate); if (r == null || s.units == null) { res.incomplete = true; if (r == null) res.basis += ' (rate not set)'; return res; }
      amt = r * s.units;
    } else { res.notStated = true; return res; }
    var cap = num(B.cap);
    if (cap != null && amt > cap) { amt = cap; res.capped = true; }
    res.amount = round2(amt); return res;
  }
  function basisText(B) {
    B = normalize({ billback: B }).billback;
    var cap = num(B.cap) != null ? ', cap ' + money(num(B.cap)) : '';
    switch (B.kind) {
      case 'none': return 'None (supplier does not fund this program)';
      case 'rep': return '100% of rep payouts' + cap;
      case 'rep_mgr': return '100% of rep + manager payouts' + cap;
      case 'pct': return (num(B.pct) == null ? '?' : num(B.pct)) + '% of ' + (B.pctBasis === 'rep_mgr' ? 'rep + manager' : 'rep') + ' payouts' + cap;
      case 'per_unit': return (num(B.rate) == null ? '$?' : money(num(B.rate))) + ' per unit of ' + (B.objectiveLabel || 'the chosen objective') + cap;
      default: return 'Not stated';
    }
  }
  function managerRuleText(M) {
    M = normalize({ manager: M }).manager;
    switch (M.kind) {
      case 'flat_team': return money(num(M.amount)) + ' per DM when ' + (M.when === 'all_qualified' ? 'every rep on their team qualifies' : 'the program’s team goal is met');
      case 'per_qualified': return money(num(M.amount)) + ' per qualified rep on their team';
      case 'pct_team': return (num(M.pct) == null ? '?' : num(M.pct)) + '% of their team’s rep payouts';
      default: return 'None';
    }
  }
  function termText(it, objName) {
    var k = it.kind === 'flat' ? 'Flat ' + money(num(it.rate)) + ' when met' : it.kind === 'per_unit' ? money(num(it.rate)) + ' per unit' : it.kind === 'tiered' ? 'Tiers: ' + String(it.tiersText || '').replace(/\s*\r?\n\s*/g, '; ') : it.kind === 'package' ? 'Package rates: ' + String(it.packagesText || '').replace(/\s*\r?\n\s*/g, '; ') : 'Kind not set';
    var s = (objName ? objName(it.objectiveId) : (it.objectiveId || 'Whole program')) + ' — ' + k;
    if (it.qualifier) s += ' · paid only when ' + (objName ? objName(it.qualifier) : it.qualifier) + ' is met';
    if (it.houseEffect === 'half') s += ' · 50% if the team goal is missed';
    if (it.houseEffect === 'none') s += ' · nothing if the team goal is missed';
    if (it.houseEffect === 'rate') s += ' · ' + money(num(it.rateBoth)) + ' when team + individual are met';
    if (it.billback) s += ' · billback notes: ' + it.billback;
    return s;
  }

  global.KdhPayouts = { normalize: normalize, parseLines: parseLines, teamResult: teamResult, termPayout: termPayout, repPayout: repPayout,
    managerPayout: managerPayout, billback: billback, basisText: basisText, managerRuleText: managerRuleText, termText: termText, money: money, SUPPORT_LABEL: SUPPORT_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
