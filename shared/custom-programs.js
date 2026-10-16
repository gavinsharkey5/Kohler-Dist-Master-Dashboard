/* Kohler Distribution Hub -- manager-built programs (2026-10-08).
   window.KdhPrograms: loads the APPROVED programs the viewer may see (Supabase
   RPC kdh_my_programs; a manager previewing a rep gets that rep's view, test
   programs included), evaluates every objective in the browser from the
   existing site data (accounts/data/hist/<rep>.json = net cases per product
   per month, Jan 2025 -> the last loaded month; accounts/data/products.json;
   the rep's account book; merchandising records through Supabase), and hands
   the results to the EXISTING renderers:
     - hub/hub.js: window.KDH_CUSTOM_PROGRAMS (incentives) -> buildPrograms()
     - the two MPO tracker pages: window.KDH_CUSTOM_MPOS (objectives) -> H.objectives()
   Nothing here renders a card of its own, and nothing here ever sees a dollar
   amount: the RPC strips manager-only terms before the definition leaves the
   database. The definition schema is manage-programs/README.txt.

   SUPPORT per objective (never a fabricated number):
     supported          computed from loaded sales months (monthly grain)
     awaiting_data      the earning period has no loaded sales month yet
     awaiting_calc      the rule is saved but not computed here (house totals on
                        a rep's page, a comparison period that is not set ...)
     awaiting_evidence  merchandising / photo requirements: records are counted
                        as RECORDED, never as satisfied
     awaiting_decision  a fractional account goal with no rounding rule
*/
(function (global) {
  'use strict';
  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/shared\/custom-programs\.js.*$/, '') : '/';
  })();
  var CORE = { 'Bergen': 1, 'Passaic': 1, 'Passaic-FF': 1, 'Morris 1': 1, 'Morris 3': 1, 'Sussex': 1 };
  var SOUTH = { 'Essex': 1, 'Hudson': 1, 'Union': 1 };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

  function cookie(name) { var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function user() { try { return global.kdhUser ? global.kdhUser() : null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return (Math.round(Number(n) * 10) / 10).toLocaleString('en-US'); }
  function plural(n, u) { n = Number(n); var s = String(u || ''); if (n === 1) return s.replace(/s$/, '').replace(/ies$/, 'y'); return s; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ym(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  function parseDate(s) { if (!s) return null; var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function fmtDay(d) { return d ? MON[d.getMonth()] + ' ' + d.getDate() : ''; }
  function fmtDayYear(d) { return d ? fmtDay(d) + ', ' + d.getFullYear() : ''; }
  function monthLabel(k) { var m = String(k).split('-'); return MON[+m[1] - 1] + ' ' + m[0]; }
  function addMonths(k, n) { var m = String(k).split('-'); var d = new Date(+m[0], +m[1] - 1 + n, 1); return ym(d); }
  function lastDay(k) { var m = String(k).split('-'); return new Date(+m[0], +m[1], 0); }

  // ------------------------------------------------------------ data
  var memo = {};
  function once(k, f) { if (!memo[k]) memo[k] = f().catch(function (e) { delete memo[k]; throw e; }); return memo[k]; }
  function getJson(path) {
    return fetch(ROOT + path, { cache: 'no-store' }).then(function (r) { if (r.status === 403 || r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function D() { return global.KdhData; }
  function products() {
    return once('products', function () {
      return getJson('accounts/data/products.json').then(function (j) {
        var map = {}; var list = [];
        if (j && j.products) j.products.forEach(function (r) { var p = { id: r[0], name: r[1], supplier: r[2], family: r[3], brand: r[4], package: r[5], draft: !!r[6] }; map[p.id] = p; list.push(p); });
        return { map: map, list: list };
      });
    });
  }
  function index() { return once('index', function () { return getJson('accounts/data/index.json'); }); }
  function keyFor(name) {
    return index().then(function (idx) {
      if (!idx || !idx.reps) return null;
      var names = idx.reps.map(function (r) { return r.rep; });
      var hit = global.kdhMatchName ? global.kdhMatchName(name, names) : (names.indexOf(name) >= 0 ? name : null);
      var row = hit && idx.reps.filter(function (r) { return r.rep === hit; })[0];
      return row ? row.key : null;
    });
  }
  function hist(rep) {
    return once('hist:' + rep, function () {
      return keyFor(rep).then(function (k) { return k ? getJson('accounts/data/hist/' + k + '.json') : null; });
    });
  }
  // the rep's account book: the page's HUB_ACCOUNTS (a rep is served their own)
  function book(rep) {
    var H = global.HUB_ACCOUNTS || (typeof HUB_ACCOUNTS !== 'undefined' ? HUB_ACCOUNTS : null);
    if (!H || !H.reps) return null;
    if (H.reps[rep]) return H.reps[rep];
    var names = Object.keys(H.reps);
    var hit = global.kdhMatchName ? global.kdhMatchName(rep, names) : null;
    return hit ? H.reps[hit] : null;
  }
  function merchRecords(accounts, cats, start, end) {
    var d = D(); if (!d || !d.signedIn()) return Promise.resolve(null);
    var path = 'merch_records?select=id,customer_num,category,program_id,observed_at,created_at,merch_record_photos(count)' +
      '&category=in.(' + cats.join(',') + ')&created_at=gte.' + start + 'T00:00:00&created_at=lte.' + end + 'T23:59:59&limit=5000';
    return d.rest(path).then(function (r) {
      if (!r.ok) return null;
      var set = {}; accounts.forEach(function (n) { set[String(n)] = 1; });
      return (r.data || []).filter(function (x) { return set[String(x.customer_num)]; }).map(function (x) {
        return { id: x.id, n: String(x.customer_num), category: x.category, program: x.program_id, when: x.observed_at || x.created_at,
                 photos: (x.merch_record_photos && x.merch_record_photos[0] && x.merch_record_photos[0].count) || 0 };
      });
    });
  }

  // ------------------------------------------------------------ resolution
  function areaOf(a) { var ar = a.area || a.rawArea || ''; if (ar === 'Sales' || !ar) ar = a.county || ''; return ar; }
  function inTerritory(a, t) {
    if (!t || t === 'any') return true;
    var ar = areaOf(a);
    if (t === 'core') return !!CORE[ar];
    if (t === 'southern') return !!SOUTH[ar];
    if (Array.isArray(t)) return t.indexOf(ar) >= 0;
    return true;
  }
  // the accounts an objective measures for one rep: the frozen base when the
  // program has one, else the book through the account filter
  function baseFor(def, rep, filterOverride) {
    var P = def.participants || {}; var f = filterOverride || P.accountFilter || {};
    var rows = book(rep) || [];
    var byN = {}; rows.forEach(function (a) { byN[String(a.n)] = a; });
    var fixed = P.accountBase && P.accountBase[rep];
    var out = [];
    if (fixed && P.baseMode !== 'dynamic') {
      fixed.forEach(function (n) { var a = byN[String(n)]; out.push(a ? a : { n: n, name: 'Account ' + n, city: '', prem: '', area: '' }); });
      return out;
    }
    rows.forEach(function (a) {
      if (f.premise && f.premise !== 'any' && String(a.prem || '').toLowerCase().slice(0, 2) !== f.premise.slice(0, 2)) return;
      if (!inTerritory(a, f.territory)) return;
      if (f.accounts && f.accounts.length && f.accounts.map(String).indexOf(String(a.n)) < 0) return;
      out.push(a);
    });
    return out;
  }
  function resolveProducts(spec, P) {
    spec = spec || {}; var inc = spec.include || [], exc = spec.exclude || [];
    if (!inc.length) return [];
    var hit = function (p, sel) {
      var v = String(sel.value || '').toLowerCase();
      if (sel.type === 'sku') return String(p.id) === String(sel.value);
      if (sel.type === 'family') return (p.family || '').toLowerCase() === v;
      if (sel.type === 'supplier') return (p.supplier || '').toLowerCase() === v;
      if (sel.type === 'brand') return (p.brand || '').toLowerCase() === v;
      if (sel.type === 'package') return (p.package || '').toLowerCase().indexOf(v) >= 0;
      if (sel.type === 'draft') return sel.value === 'draft' ? p.draft : !p.draft;
      return false;
    };
    return P.list.filter(function (p) {
      var ok = false;
      for (var i = 0; i < inc.length; i++) {   // a selection = ALL of its parts (family + package); the list = ANY selection
        var parts = Array.isArray(inc[i]) ? inc[i] : [inc[i]];
        if (parts.every(function (s) { return hit(p, s); })) { ok = true; break; }
      }
      if (!ok) return false;
      for (var j = 0; j < exc.length; j++) { var ep = Array.isArray(exc[j]) ? exc[j] : [exc[j]]; if (ep.every(function (s) { return hit(p, s); })) return false; }
      return true;
    }).map(function (p) { return { id: p.id, name: p.name, supplier: p.supplier, family: p.family, package: p.package, draft: p.draft }; });
  }
  function qualifying(def, P) {
    var pr = def.products || {};
    if (pr.resolved && pr.resolved.length && !pr.dynamic) return pr.resolved;
    return resolveProducts(pr, P);
  }

  // ------------------------------------------------------------ month math
  function monthRange(months, start, end) {
    var s = parseDate(start), e = parseDate(end); if (!s || !e) return null;
    var sk = ym(s), ek = ym(e); var i0 = -1, i1 = -1;
    months.forEach(function (m, i) { if (m >= sk && m <= ek) { if (i0 < 0) i0 = i; i1 = i; } });
    var wanted = []; for (var k = sk; k <= ek; k = addMonths(k, 1)) wanted.push(k);
    return { i0: i0, i1: i1, loaded: i0 >= 0, wanted: wanted, through: i1 >= 0 ? months[i1] : null, complete: i1 >= 0 && months[i1] === ek };
  }
  function sumRange(series, r) { var t = 0; if (!series || !r || !r.loaded) return 0; for (var i = r.i0; i <= r.i1; i++) t += series[i] || 0; return t; }
  // the N days before a date, as whole months (the data has no days)
  function windowBefore(months, startDate, days) {
    var s = parseDate(startDate); if (!s) return null;
    var endK = addMonths(ym(s), -1); var n = Math.max(1, Math.round(days / 30));
    var startK = addMonths(endK, -(n - 1));
    return monthRange(months, startK + '-01', endK + '-28');
  }

  // ------------------------------------------------------------ evaluation
  // returns {objectives:[...], met, pct, support, through, note}
  function evaluate(def, rep, ctx) {
    var H = ctx.hist, P = ctx.products; var months = H ? H.months : (ctx.months || []);
    var base = baseFor(def, rep);
    var Q = qualifying(def, P); var QID = {}; Q.forEach(function (p) { QID[String(p.id)] = p; });
    var per = (def.period || {});
    var out = { objectives: [], base: base.length, products: Q.length, through: H ? H.through : null, loaded: H ? H.loaded : null, rep: rep, fullName: def.fullName || '' };
    var results = {};
    (def.objectives || []).forEach(function (o) {
      var r = evalObjective(def, o, rep, base, Q, QID, H, months, P, ctx);
      results[o.id] = r; out.objectives.push(r);
    });
    // prerequisites: an objective that another one unlocks is "locked" until the other is met
    out.objectives.forEach(function (r) {
      var o = r.objective;
      if (o.requires && results[o.requires] && results[o.requires].status !== 'achieved') { r.locked = true; r.lockedBy = results[o.requires].label; }
    });
    var required = out.objectives.filter(function (r) { return (r.objective.logic || 'required') === 'required'; });
    var alts = out.objectives.filter(function (r) { return r.objective.logic === 'alternative'; });
    var scored = out.objectives.filter(function (r) { return r.support === 'supported'; });
    out.met = scored.length > 0 && required.every(function (r) { return r.support !== 'supported' || r.status === 'achieved'; }) &&
      (!alts.length || alts.some(function (r) { return r.status === 'achieved'; }));
    out.pct = scored.length ? Math.round(scored.reduce(function (t, r) { return t + Math.min(100, r.pct || 0); }, 0) / scored.length) : 0;
    out.support = out.objectives.every(function (r) { return r.support === 'supported'; }) ? 'supported'
      : out.objectives.some(function (r) { return r.support === 'supported'; }) ? 'partial' : (out.objectives[0] ? out.objectives[0].support : 'awaiting_calc');
    out.primary = required[0] || out.objectives[0] || null;
    return out;
  }

  function goalFor(o, rep, baseN, underlying) {
    var g = o.goal || {}; var t = g.type || 'fixed';
    if (t === 'fixed') return { goal: Number(g.value) || 0, text: '' };
    if (t === 'individual') { var v = g.perRep && g.perRep[rep]; return v == null ? { goal: null, text: 'no individual goal set' } : { goal: Number(v), text: 'your individual goal' }; }
    if (t === 'pct_of_base') {
      var raw = (Number(g.pct) || 0) * (underlying || 0);
      var rounded = g.rounding === 'up' ? Math.ceil(raw) : g.rounding === 'down' ? Math.floor(raw) : g.rounding === 'nearest' ? Math.round(raw) : (Number.isInteger(raw) ? raw : null);
      return { goal: rounded, raw: raw, text: Math.round((Number(g.pct) || 0) * 100) + '% of ' + underlying + ' ' + (o.metric === 'retention' ? 'baseline ' : '') + 'accounts' + (rounded != null && rounded !== raw ? ' (' + raw.toFixed(1) + ', rounded ' + g.rounding + ')' : ''), needsRounding: rounded == null };
    }
    if (t === 'house') return { goal: Number(g.value) || 0, text: 'house goal', house: true };
    return { goal: Number(g.value) || 0, text: '' };
  }

  function evalObjective(def, o, rep, base, Q, QID, H, months, P, ctx) {
    var r = { id: o.id, objective: o, label: o.label || metricLabel(o), metric: o.metric, unit: unitOf(o), value: 0, goal: null, pct: 0, remaining: null,
              status: 'notstarted', support: 'supported', notes: [], credited: [], open: [], valueText: '', goalText: '', remainText: '' };
    var per = o.followOn && o.followOn.start ? o.followOn : (def.period || {});
    var isSales = ['buying_accounts', 'new_buyers', 'placements', 'new_placements', 'retention', 'units', 'growth'].indexOf(o.metric) >= 0;
    var scopeBase = base.filter(function (a) { return !o.premise || o.premise === 'any' || String(a.prem || '').toLowerCase().slice(0, 2) === o.premise.slice(0, 2); });
    if (isSales) {
      if (!H) { r.support = 'awaiting_data'; r.notes.push('No sales history file for ' + rep + '.'); return finish(r, o, rep, scopeBase.length); }
      var R = monthRange(months, per.start, per.end);
      if (!R) { r.support = 'awaiting_decision'; r.notes.push('The earning period is not set.'); return finish(r, o, rep, scopeBase.length); }
      if (!R.loaded) { r.support = 'awaiting_data'; r.notes.push('No sales month of ' + periodText(per) + ' is loaded yet (data through ' + monthLabel(H.through) + ').'); return finish(r, o, rep, scopeBase.length); }
      if (!R.complete) r.notes.push('Sales data through ' + monthLabel(R.through) + '; later months of the period are not loaded yet.');
      if (!Q.length && o.metric !== 'units' && o.metric !== 'growth') { r.support = 'awaiting_decision'; r.notes.push('No qualifying products are selected.'); return finish(r, o, rep, scopeBase.length); }
      if ((o.metric === 'units' || o.metric === 'growth') && o.volumeUnit === 'units') { r.support = 'awaiting_calc'; r.notes.push('Bottles / units are not in the sales record (cases only); this objective is saved, not scored.'); return finish(r, o, rep, scopeBase.length); }
      var before = null;
      if (o.metric === 'new_buyers' || o.metric === 'new_placements') {
        var days = Number(o.nonBuyDays) || Number((def.period || {}).nonBuyDays) || 90;   // per objective (v3); the program-wide value is the legacy fallback
        before = windowBefore(months, per.start, days);
        r.notes.push('"New" = no net purchase of a qualifying product in the ' + days + ' days before ' + fmtDayYear(parseDate(per.start)) + ', measured as whole months (' + (before && before.loaded ? monthLabel(months[before.i0]) + ' – ' + monthLabel(months[before.i1]) : 'not loaded') + ').');
      }
      var cmp = null;
      if (o.metric === 'retention' || o.metric === 'growth') {
        var bl = (o.comparison && o.comparison.start) ? o.comparison : ((def.period || {}).baseline || {});
        if (!bl.start || !bl.end) { r.support = 'awaiting_decision'; r.notes.push((o.metric === 'growth' ? 'Growth' : 'Retention') + ' needs an explicit comparison period.'); return finish(r, o, rep, scopeBase.length); }
        cmp = monthRange(months, bl.start, bl.end);
        if (!cmp || !cmp.loaded) { r.support = 'awaiting_data'; r.notes.push('The comparison period ' + periodText(bl) + ' has no loaded sales month.'); return finish(r, o, rep, scopeBase.length); }
        r.notes.push('Compared with ' + periodText(bl) + '.');
      }
      var minSkus = Math.max(1, Number(o.minSkus) || 1); var minCases = Number(o.minCases) || 0;
      var credited = [], open = [], total = 0, cmpTotal = 0, baseCount = 0;
      scopeBase.forEach(function (a) {
        var acc = H.accounts[String(a.n)] || {};
        var bought = [], skus = 0, cases = 0, hadBefore = false, hadCmp = [];
        Object.keys(acc).forEach(function (pid) {
          if (!QID[pid] && (Q.length || o.metric === 'placements')) return;
          var s = acc[pid]; var c = sumRange(s, R); cases += c;
          if (c > 0) { skus++; bought.push({ id: pid, name: QID[pid] ? QID[pid].name : pid, cases: c, before: before ? sumRange(s, before) > 0 : false }); }
          if (before && sumRange(s, before) > 0) hadBefore = true;
          if (cmp && sumRange(s, cmp) > 0) hadCmp.push(pid);
          if (cmp) cmpTotal += sumRange(s, cmp);
        });
        var row = { n: a.n, name: a.name, city: a.city || '', cases: cases, skus: skus, bought: bought };
        if (o.metric === 'units') { total += cases; if (cases > 0) credited.push(row); else open.push(Object.assign(row, { what: 'No qualifying purchase in the period' })); }
        else if (o.metric === 'growth') { total += cases; if (cases > 0) credited.push(row); else open.push(Object.assign(row, { what: 'No purchase in the period' })); }
        else if (o.metric === 'placements' || o.metric === 'new_placements') {
          var lines = bought.filter(function (b) { return o.metric === 'placements' || !b.before; });
          total += lines.length; if (lines.length) credited.push(Object.assign(row, { lines: lines }));
          var openP = Q.filter(function (p) { return !bought.some(function (b) { return b.id === String(p.id); }) && !(o.metric === 'new_placements' && before && sumRange(acc[String(p.id)], before) > 0); });
          if (openP.length) open.push(Object.assign({}, row, { what: 'Any product below = 1 ' + (o.metric === 'new_placements' ? 'new ' : '') + 'placement', skus: openP }));
        }
        else if (o.metric === 'buying_accounts' || o.metric === 'new_buyers') {
          var ok = skus >= minSkus && cases >= minCases && !(o.metric === 'new_buyers' && hadBefore);
          if (ok) { total++; credited.push(row); }
          else if (!(o.metric === 'new_buyers' && hadBefore)) {
            var need = Math.max(0, minSkus - skus);
            open.push(Object.assign({}, row, { what: need > 0 ? 'Needs ' + need + ' more qualifying ' + plural(need, 'SKUs') + (skus ? ' (has ' + skus + ' of ' + minSkus + ')' : '') : 'Needs ' + minCases + ' cases (has ' + fmt(cases) + ')',
              skus: Q.filter(function (p) { return !bought.some(function (b) { return b.id === String(p.id); }); }) }));
          }
        }
        else if (o.metric === 'retention') {
          if (hadCmp.length) { baseCount++; if (skus > 0) { total++; credited.push(row); } else open.push(Object.assign({}, row, { what: 'Bought in the comparison period, not yet in this one', skus: hadCmp.map(function (pid) { return QID[pid] || { id: pid, name: pid }; }) })); }
        }
      });
      r.credited = credited; r.open = open;
      if (o.metric === 'growth') {
        var g = o.goal || {}; r.value = Math.round((total - cmpTotal) * 10) / 10; r.cmpTotal = cmpTotal; r.periodTotal = total;
        r.goal = g.type === 'fixed' && g.value ? Number(g.value) : 0;    // 0 = "positive growth"
        r.goalMode = r.goal ? 'fixed' : 'positive';
        r.unit = 'cases'; r.pct = r.goal ? pctOf(r.value, r.goal) : (cmpTotal > 0 ? Math.min(100, Math.max(0, Math.round(total / cmpTotal * 100))) : (total > 0 ? 100 : 0));
        r.status = (r.goal ? r.value >= r.goal : r.value > 0) ? 'achieved' : (total > 0 ? 'inprogress' : 'notstarted');
        r.remaining = Math.max(0, (r.goal || 0) - r.value); if (!r.goal) r.remaining = r.value > 0 ? 0 : Math.round((cmpTotal - total) * 10) / 10 + 0.1;
        r.valueText = (r.value > 0 ? '+' : '') + fmt(r.value) + ' cases vs ' + fmt(cmpTotal); r.goalText = r.goal ? '+' + fmt(r.goal) + ' cases' : 'Positive growth'; r.remainText = r.status === 'achieved' ? 'Met' : fmt(Math.abs(r.remaining)) + ' cases to go';
        if (!cmpTotal && !total) { r.support = 'supported'; r.notes.push('Nothing sold in either period.'); }
        return r;
      }
      var under = o.metric === 'retention' ? baseCount : scopeBase.length;
      var G = goalFor(o, rep, scopeBase.length, under);
      if (G.needsRounding) { r.support = 'awaiting_decision'; r.notes.push('The goal is ' + G.raw.toFixed(2) + ' accounts: choose a whole-account target or a rounding rule before this can be scored.'); }
      r.value = Math.round(total * 10) / 10; r.goal = G.goal; r.goalWhy = G.text; r.underlying = under; r.house = !!G.house;
      if (G.house) { r.support = 'awaiting_calc'; r.notes.push('House goal: the team total is computed on the manager view; this is ' + rep + "'s share."); }
      if (G.goal == null && !G.needsRounding) { r.support = 'awaiting_decision'; r.notes.push('No goal is set for ' + rep + '.'); }
      return finish(r, o, rep, scopeBase.length);
    }
    if (o.metric === 'merch' || o.metric === 'photos') {
      r.support = 'awaiting_evidence';
      var recs = ctx.merch && ctx.merch[o.id];
      var Gm = goalFor(o, rep, scopeBase.length, scopeBase.length);
      r.goal = Gm.goal; r.goalWhy = Gm.text; r.unit = o.metric === 'photos' ? 'photos' : 'records';
      if (recs == null) { r.notes.push('Merchandising records could not be read (sign in, or the merchandising tables are not loaded).'); return finish(r, o, rep, scopeBase.length, true); }
      var set = {}; scopeBase.forEach(function (a) { set[String(a.n)] = a; });
      var mine = recs.filter(function (x) { return set[x.n] && (!o.merch || !o.merch.category || o.merch.category === 'any' || x.category === o.merch.category); });
      if (o.metric === 'photos') { r.value = mine.reduce(function (t, x) { return t + (x.photos || 0); }, 0); }
      else r.value = mine.length;
      var byA = {}; mine.forEach(function (x) { byA[x.n] = (byA[x.n] || 0) + 1; });
      r.credited = Object.keys(byA).map(function (n) { return { n: n, name: set[n].name, city: set[n].city || '', records: byA[n], note: byA[n] + ' recorded' }; });
      r.notes.push('Counted as RECORDED in the Hub' + (o.merch && o.merch.category && o.merch.category !== 'any' ? ' (' + o.merch.category.replace('_', ' ') + ')' : '') + ' between ' + periodText(per) + '. A record or photo does not prove the requirement was met; verification is not defined yet.');
      if (o.merch && o.merch.needBeforeAfter) r.notes.push('Before-and-after evidence: not verifiable here (no before/after pairing exists in the records).');
      return finish(r, o, rep, scopeBase.length, true);
    }
    r.support = 'awaiting_calc'; r.notes.push('This metric (' + o.metric + ') is saved but not computed in this version.');
    return finish(r, o, rep, scopeBase.length, true);
  }
  function pctOf(v, g) { return g > 0 ? Math.min(100, Math.max(0, Math.round(v / g * 100))) : 0; }
  function finish(r, o, rep, baseN, keepSupport) {
    // the goal stays visible even when progress cannot be computed yet (missing data is never a zero, and never hides the goal)
    if (r.goal == null && r.support !== 'supported' && o.metric !== 'growth') { var G0 = goalFor(o, rep, baseN, baseN); if (G0 && G0.goal != null && !G0.needsRounding && G0.goal > 0) r.goal = G0.goal; }
    if (r.goal != null && r.goal > 0) {
      r.pct = pctOf(r.value, r.goal); r.remaining = Math.max(0, r.goal - r.value);
      r.status = r.remaining <= 0 ? 'achieved' : r.value > 0 ? 'inprogress' : 'notstarted';
      r.valueText = fmt(r.value) + ' of ' + fmt(r.goal) + ' ' + plural(r.goal, r.unit);
      r.goalText = fmt(r.goal) + ' ' + plural(r.goal, r.unit); r.remainText = r.remaining <= 0 ? 'Met' : fmt(r.remaining) + ' more ' + plural(r.remaining, r.unit);
    } else {
      r.pct = 0; r.status = r.value > 0 ? 'inprogress' : 'notstarted';
      r.valueText = fmt(r.value) + ' ' + plural(r.value, r.unit); r.goalText = r.goal === 0 ? 'Open-ended' : 'No goal set'; r.remainText = '';
    }
    if (r.support !== 'supported') r.status = r.support === 'awaiting_evidence' ? (r.value > 0 ? 'inprogress' : 'notstarted') : 'notstarted';
    if (r.support === 'awaiting_data' || r.support === 'awaiting_calc') { r.valueText = 'Not yet available'; r.remainText = ''; r.notReady = true; r.pct = 0; r.status = 'notstarted'; }   // a missing month is never a zero
    return r;
  }
  function unitOf(o) {
    if (o.unit) return o.unit;
    return { buying_accounts: 'accounts', new_buyers: 'accounts', placements: 'placements', new_placements: 'placements', retention: 'accounts', units: 'cases', growth: 'cases', merch: 'records', photos: 'photos' }[o.metric] || 'units';
  }
  function metricLabel(o) {
    return { buying_accounts: 'Buying Accounts', new_buyers: 'New Buyers', placements: 'Placements', new_placements: 'New Placements', retention: 'Retained Accounts', units: 'Cases', growth: 'Growth', merch: 'Merchandising Records', photos: 'Photos' }[o.metric] || o.metric;
  }
  function periodText(p) { var s = parseDate(p && p.start), e = parseDate(p && p.end); if (!s || !e) return 'period not set'; return (s.getFullYear() === e.getFullYear() ? fmtDay(s) : fmtDayYear(s)) + ' – ' + fmtDayYear(e); }
  var SUPPORT_LABEL = { supported: 'Tracked from sales data', awaiting_data: 'Awaiting sales data', awaiting_calc: 'Awaiting calculation support', awaiting_evidence: 'Recorded, not verified', awaiting_decision: 'Needs a decision', partial: 'Partly tracked' };

  // plain-language rules for a definition (no money): direct summaries, one fact per line
  var MEASURE_TEXT = { buying_accounts: 'Buying Accounts', new_buyers: 'New Buyers', placements: 'Product Placements', new_placements: 'New Product Placements', retention: 'Retained Buyers', units: 'Sales Volume (Cases)', growth: 'Case Growth vs a Comparison Period', merch: 'Merchandising Records', photos: 'Merchandising Photos' };
  function goalSummary(o) {
    var g = o.goal || {}; var u = unitOf(o); var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
    if (g.type === 'pct_of_base') return (g.pct ? Math.round(g.pct * 100) + '% of Eligible Accounts' + (g.rounding ? ' (Rounded ' + cap(g.rounding) + ')' : ' (Rounding Not Set)') : 'Percent Not Set');
    if (g.type === 'individual') { var vals = Object.keys(g.perRep || {}).map(function (k) { return g.perRep[k]; }).filter(function (v) { return v !== '' && v != null; }); var set = new Set(vals.map(Number)); return vals.length ? (set.size === 1 ? fmt(vals[0]) + ' ' + cap(plural(Number(vals[0]), u)) + ' per Rep' : 'Individual Goals (' + fmt(Math.min.apply(null, vals)) + '–' + fmt(Math.max.apply(null, vals)) + ' ' + u + ')') : 'Individual Goals Not Set'; }
    if (g.type === 'house') return g.value ? fmt(g.value) + ' ' + cap(plural(Number(g.value), u)) + ' (Team Total)' : 'Team Goal Not Set';
    if (g.value !== '' && g.value != null) return fmt(g.value) + ' ' + cap(plural(Number(g.value), u)) + (o.scope === 'house' ? ' (Team Total)' : ' per Rep');
    return o.metric === 'growth' ? 'Positive Growth' : 'Not Set';
  }
  function objectiveRule(o, per) {
    var s = []; per = per || {};
    if (o.minSkus > 1) s.push(o.minSkus + '+ different qualifying products per account');
    if (o.minCases) s.push(o.minCases + '+ cases per account');
    if (o.premise && o.premise !== 'any') s.push((o.premise === 'off' ? 'off' : 'on') + '-premise accounts only');
    if (o.metric === 'new_buyers' || o.metric === 'new_placements') { var d = Number(o.nonBuyDays) || Number(per.nonBuyDays) || 90; s.push('new = no qualifying purchase' + (o.metric === 'new_placements' ? ' of that product' : '') + ' in the ' + d + ' days before ' + (per.start ? fmtDayYear(parseDate(per.start)) : 'the start') + ' (whole months, fixed baseline)'); }
    if (o.metric === 'growth' || o.metric === 'retention') s.push(o.comparison && o.comparison.start ? 'compared with ' + periodText(o.comparison) : 'comparison period not set');
    if (o.metric === 'merch' || o.metric === 'photos') s.push('records dated inside the program period, counted as recorded (not verified)');
    if (o.logic === 'alternative') s.push('one of the alternatives is enough');
    if (o.logic === 'prerequisite') s.push('must be met before the objectives it unlocks count');
    if (o.followOn && o.followOn.start) s.push('follow-on period ' + periodText(o.followOn));
    return s;
  }
  function rulesText(def) {
    var out = []; var per = def.period || {};
    out.push('Period: ' + periodText(per) + ' (credit by sales month)');
    (def.objectives || []).forEach(function (o) {
      var line = (o.label || metricLabel(o)) + ' — Measure: ' + (MEASURE_TEXT[o.metric] || metricLabel(o)) + ' · Goal: ' + goalSummary(o);
      var rules = objectiveRule(o, per); if (rules.length) line += ' · ' + rules.join('; ');
      out.push(line);
    });
    var pr = def.products || {};
    if (pr.resolved && pr.resolved.length) out.push('Products: ' + pr.resolved.length + ' Selected' + (pr.dynamic ? ' (new products matching the brand, supplier or package rules join automatically)' : ''));
    var P = def.participants || {};
    out.push('Account List: ' + (P.baseMode === 'dynamic' ? 'Updates With Route Changes' : 'Fixed at Program Start') + (P.accountFilter && P.accountFilter.premise && P.accountFilter.premise !== 'any' ? ' · ' + (P.accountFilter.premise === 'off' ? 'Off' : 'On') + '-Premise' : '') + (P.accountFilter && P.accountFilter.territory && P.accountFilter.territory !== 'any' ? ' · ' + (P.accountFilter.territory === 'core' ? 'Core Market' : P.accountFilter.territory === 'southern' ? 'Southern District' : 'Selected Areas') : ''));
    return out;
  }

  // ------------------------------------------------------------ viewer state
  var ST = { programs: null, results: {}, pending: {}, viewer: null, rep: null, listeners: [] };
  function viewerRep() {
    var u = user(); if (!u) return null;
    if (u.role !== 'manager') return u.name;              // a rep (or a manager previewing a rep): that rep
    return null;
  }
  // which programs to load: a rep's own; a manager previewing a rep -> that rep's view (test programs included);
  // a manager otherwise -> every approved program (Program View / builder), test ones marked
  function load(opts) {
    opts = opts || {};
    return once('programs:' + JSON.stringify(opts), function () {
      var d = D(); if (!d || !d.signedIn()) return Promise.resolve([]);
      var u = user();
      var isMgr = u && u.role === 'manager';
      var rep = opts.rep || (u && u.preview && u.role !== 'manager' ? u.name : null) || (!isMgr && u ? u.name : null);
      var q;
      if (isMgr && !rep) {
        q = d.rest('programs?select=id,kind,is_test,title,status,approved_version,start_date,end_date,supplier,audience,program_versions(version,definition,status,reviewed_at,recalc)&status=in.(approved,closed)&order=end_date.asc')
          .then(function (r) {
            if (!r.ok) return [];
            return (r.data || []).map(function (p) {
              var v = (p.program_versions || []).filter(function (x) { return x.version === p.approved_version; })[0];
              return v ? { id: p.id, kind: p.kind, is_test: p.is_test, version: v.version, approved_at: v.reviewed_at, recalc: v.recalc, start_date: p.start_date, end_date: p.end_date, status: p.status, definition: v.definition } : null;
            }).filter(Boolean);
          });
      } else {
        q = d.rpc('kdh_my_programs', isMgr && rep && !(u && u.preview && u.role !== 'manager' && u.name === rep) ? { p_rep: rep } : (u && u.preview && u.role !== 'manager' ? { p_rep: rep } : {})).then(function (rows) { return rows || []; }, function () { return []; });
      }
      return q.then(function (list) { ST.programs = list; return list; });
    });
  }
  function ctxFor(rep, def) {
    return Promise.all([products(), hist(rep)]).then(function (x) {
      var ctx = { products: x[0], hist: x[1], merch: {} };
      var mo = (def.objectives || []).filter(function (o) { return o.metric === 'merch' || o.metric === 'photos'; });
      if (!mo.length) return ctx;
      var base = baseFor(def, rep); var per = def.period || {};
      var cats = []; mo.forEach(function (o) { var c = o.merch && o.merch.category; if (!c || c === 'any') cats = ['display', 'window', 'cooler_door', 'tap_handle', 'menu', 'other', 'pod', 'signage']; else if (cats.indexOf(c) < 0) cats.push(c); });
      return merchRecords(base.map(function (a) { return a.n; }), cats, per.start || '2025-01-01', per.end || '2030-12-31').then(function (recs) {
        mo.forEach(function (o) { ctx.merch[o.id] = recs; }); return ctx;
      });
    });
  }
  // evaluate one program for one rep (cached); resolves to the result
  function resultFor(prog, rep) {
    var k = prog.id + ':' + prog.version + ':' + rep;
    if (ST.results[k]) return Promise.resolve(ST.results[k]);
    if (!ST.pending[k]) ST.pending[k] = ctxFor(rep, prog.definition).then(function (ctx) {
      var r = evaluate(prog.definition, rep, ctx); ST.results[k] = r; delete ST.pending[k]; ST.listeners.forEach(function (f) { try { f(prog, rep, r); } catch (e) {} }); return r;
    });
    return ST.pending[k];
  }
  function cached(prog, rep) { return ST.results[prog.id + ':' + prog.version + ':' + rep] || null; }
  function participants(def) { var P = (def.participants || {}).resolved || {}; return (P.reps || []).concat(P.associates || []); }
  function isParticipant(def, rep) {
    var names = participants(def); if (!names.length) return false;
    if (names.indexOf(rep) >= 0) return true;
    return !!(global.kdhMatchName && global.kdhMatchName(rep, names));
  }

  // ------------------------------------------------------------ adapters
  function hubEntry(prog) {
    var def = prog.definition; var per = def.period || {};
    var start = parseDate(per.start) || new Date(prog.start_date + 'T00:00:00'), end = parseDate(per.end) || new Date(prog.end_date + 'T00:00:00');
    var chan = (def.participants && def.participants.accountFilter && def.participants.accountFilter.premise) || 'any';
    chan = chan === 'off' ? 'off' : chan === 'on' ? 'on' : 'both';
    var title = (prog.is_test ? 'TEST — ' : '') + (def.title || 'Program');
    var id = 'inc:cp_' + prog.id.slice(0, 8);
    var p = {
      id: id, source: 'inc', key: 'cp_' + prog.id.slice(0, 8), custom: true, program: prog, isTest: !!prog.is_test, kind: def.kind,
      monthKey: ym(end), monthLabel: monthLabel(ym(end)),
      name: title + (def.fullName && def.fullName !== def.title ? ' — ' + def.fullName : ''), shortName: title, pitch: def.description || '',
      type: 'Incentive', group: 'new', supKey: 'house', channel: chan, channelLabel: chan === 'off' ? 'Off-Premise' : chan === 'on' ? 'On-Premise' : 'On & Off-Premise',
      supplier: def.supplier || 'Kohler Programs', supplierLogo: '', brandLogos: [],
      period: { start: start, end: end, label: periodText({ start: per.start, end: per.end }), tag: '' },
      refreshed: '', manual: false, awaitingNote: prog.is_test ? 'TEST — Not an Active Incentive' : '',
      rules: rulesText(def), reward: '', territory: '', entry: { getRep: function (rep) { return blobFor(prog, rep); } }, month: null,
      sellAsk: (def.products && def.products.resolved && def.products.resolved.length) ? 'Sell ' + def.products.resolved.slice(0, 3).map(function (x) { return x.name; }).join(', ') + (def.products.resolved.length > 3 ? ' and ' + (def.products.resolved.length - 3) + ' more' : '') + '.' : 'See the program rules.'
    };
    p.forRep = function (rep) {
      if (!isParticipant(def, rep)) return null;
      var R = cached(prog, rep);
      if (!R) { resultFor(prog, rep); return { status: 'soon', pace: 'soon', pct: null, openEnded: false, now: '', goal: '', remain: null, next: 'Computing from the sales record…', soon: true, loading: true }; }
      var o = R.primary; if (!o) return null;
      var status = R.met ? 'complete' : (o.value > 0 ? 'progress' : 'notstarted');
      var pace = R.met ? 'earned' : (o.pct >= 75 ? 'close' : o.pct >= 40 ? 'ontrack' : o.value > 0 ? 'attention' : 'notstarted');
      var others = R.objectives.length > 1 ? R.objectives.length - 1 + ' more ' + (R.objectives.length === 2 ? 'objective' : 'objectives') + ' inside' : '';
      var supNote = o.support !== 'supported' ? SUPPORT_LABEL[o.support] : '';
      var blocked = o.support !== 'supported';
      return {
        status: blocked ? 'notstarted' : status, pace: blocked ? 'notstarted' : pace, pct: blocked ? 0 : o.pct, openEnded: o.goal == null || o.goal === 0,
        now: o.valueText, sub: [supNote, others, R.through ? 'Sales data through ' + monthLabel(R.through) : ''].filter(Boolean).join(' · '),
        goal: o.goal ? fmt(o.goal) + ' ' + plural(o.goal, o.unit) : (o.goalText || ''), remain: o.remainText || null,
        next: nextText(R), segments: null, house: !!o.house, valueNum: o.value, goalNum: o.goal || null, legs: null, custom: R
      };
    };
    p.detailHtml = function (rep) { var R = cached(prog, rep); return R ? objectivesTable(R, true) : '<p class="muted">Computing…</p>'; };
    p.ranking = function () { return []; };
    p.exposure = function () { return null; };
    p.timeline = function () { return null; };
    return p;
  }
  function nextText(R) {
    var o = R.primary; if (!o) return '';
    if (o.support !== 'supported') return esc(SUPPORT_LABEL[o.support] + (o.notes[0] ? ': ' + o.notes[0] : ''));
    if (o.status === 'achieved') return 'Goal met — keep the accounts ordering.';
    var first = o.open[0]; if (!first) return esc(o.remainText || '');
    return esc(o.remainText + ' · start with ' + first.name + (first.what ? ' (' + first.what.toLowerCase() + ')' : ''));
  }
  // tracker-shaped blob so the hub's own account walkers (buying / credited lists) work unchanged
  function blobFor(prog, rep) {
    var R = cached(prog, rep); if (!R) return isParticipant(prog.definition, rep) ? { loading: true } : null;
    var o = R.primary; var out = { accountList: [], partialAccounts: [], __custom: true };
    if (o) {
      o.credited.forEach(function (a) {
        if (a.lines && a.lines.length) a.lines.forEach(function (l) { out.accountList.push({ customer: a.name, product: l.name, date: R.through ? monthLabel(R.through) : '' }); });
        else out.accountList.push({ customer: a.name, product: a.bought && a.bought.length ? a.bought.map(function (b) { return b.name; }).join(', ') : (a.note || ''), date: R.through ? monthLabel(R.through) : '' });
      });
      o.open.forEach(function (a) { var m = (a.what || '').match(/Needs (\d+) more/); if (m) out.partialAccounts.push({ customer: a.name, need: Number(m[1]), skus: a.skus && a.skus.length != null ? (Number((a.what.match(/has (\d+) of/) || [])[1]) || 0) : undefined }); });
    }
    return out;
  }
  function objectivesTable(R, full) {
    var head = (R.fullName && full) ? '<p class="cp-foot"><b>Full program name:</b> ' + esc(R.fullName) + '</p>' : '';
    var rows = R.objectives.map(function (o) {
      var sup = o.support === 'supported' ? '' : ' <span class="cp-sup ' + o.support + '">' + esc(SUPPORT_LABEL[o.support]) + '</span>';
      return '<tr><td>' + esc(o.label) + (o.locked ? ' <span class="cp-sup">locked until ' + esc(o.lockedBy) + '</span>' : '') + sup + '</td><td>' + esc(o.goalText) + '</td><td>' + esc(o.support === 'supported' || o.support === 'awaiting_evidence' ? o.valueText : '—') + '</td><td>' + esc(o.support === 'supported' ? o.remainText : '') + '</td></tr>' +
        (o.notes.length ? '<tr class="cp-note"><td colspan="4">' + o.notes.map(esc).join(' ') + '</td></tr>' : '');
    }).join('');
    return '<div class="cp-detail">' + head + '<table class="cp-table"><thead><tr><th>Objective</th><th>Goal</th><th>Current</th><th>Remaining</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (full ? '<p class="cp-foot">' + (R.through ? 'Sales data through ' + esc(monthLabel(R.through)) + (R.loaded ? ', loaded ' + esc(String(R.loaded).slice(0, 10)) : '') + '. ' : '') + 'Eligible accounts: ' + R.base + ' · qualifying products: ' + R.products + '.</p>' : '') + '</div>';
  }

  // the Potential Accounts shape the MPO card draws (guided.js potBodyHtml)
  function potential(prog, rep) {
    var R = cached(prog, rep); if (!R || !R.primary) return null;
    var o = R.primary; if (o.support !== 'supported') return { note: SUPPORT_LABEL[o.support] + '. ' + (o.notes[0] || ''), flag: true, products: [], accounts: [] };
    var prods = (prog.definition.products && prog.definition.products.resolved || []).map(function (p) { return { name: p.name, id: p.id }; });
    var accounts = o.open.map(function (a) {
      return { n: a.n, name: a.name, city: a.city || '', req: a.what || '', sub: '', why: '', skus: Array.isArray(a.skus) ? a.skus.map(function (p) { return { name: p.name, id: p.id }; }) : [],
               has: a.bought && a.bought.length ? a.bought.map(function (b) { return b.name; }) : null, hasLabel: 'Already bought in the period' };
    });
    var n0 = o.notes[0] || ''; return { note: (R.through && !/^Sales data through/.test(n0) ? 'Sales data through ' + monthLabel(R.through) + '. ' : '') + n0, products: prods, accounts: accounts };
  }
  function mpoEntries(progs) {
    var out = [];
    progs.filter(function (p) { return p.definition && p.definition.kind === 'mpo'; }).forEach(function (prog) {
      var def = prog.definition; var per = def.period || {};
      var prem = (def.participants && def.participants.accountFilter && def.participants.accountFilter.premise) || 'any';
      var scopes = prem === 'off' ? ['off'] : prem === 'on' ? ['on'] : ['off', 'on'];
      var end = parseDate(per.end) || new Date(prog.end_date + 'T00:00:00');
      var key = 'cp_' + prog.id.slice(0, 8);
      scopes.forEach(function (scope) {
        var o = { key: key, name: (prog.is_test ? 'TEST — ' : '') + def.title, fullName: def.fullName || '', shortName: (prog.is_test ? 'TEST — ' : '') + def.title, weight: null, unit: unitOf((def.objectives || [])[0] || {}),
                  type: 'custom', hasData: true, supplier: def.supplier || '', periodText: periodText(per), periodEnd: per.end, periodStart: per.start, custom: true, isTest: !!prog.is_test, program: prog };
        out.push({
          scope: scope, month: ym(end), objective: o, program: prog,
          metricFor: function (rep) {
            if (!isParticipant(def, rep)) return { notScored: true, hidden: true };
            var R = cached(prog, rep);
            if (!R) { resultFor(prog, rep); return null; }
            var m = R.primary; if (!m) return null;
            if (m.support !== 'supported') return { value: m.value, goal: m.goal || 0, pct: 0, remaining: m.goal || 0, status: 'notstarted', valueText: SUPPORT_LABEL[m.support], goalText: m.goalText, remainText: m.notes[0] || '', unsupported: m.support, explain: m.notes };
            return { value: m.value, goal: m.goal, pct: m.pct, remaining: m.remaining, status: m.status, valueText: m.valueText, goalText: m.goalText, remainText: m.remainText,
                     underlying: m.underlying, explain: m.notes.concat(R.objectives.length > 1 ? [R.objectives.length + ' objectives; this card shows the first.'] : []) };
          },
          detailHtml: function (rep) { var R = cached(prog, rep); return R ? objectivesTable(R, true) : ''; },
          potential: function (rep) { return potential(prog, rep); }
        });
      });
    });
    return out;
  }

  // ------------------------------------------------------------ boot
  var booted = false;
  function boot() {
    if (booted) return; booted = true;
    var u = user(); if (!u) return;
    load().then(function (list) {
      if (!list.length) return;
      var rep = viewerRep();
      global.KDH_CUSTOM_PROGRAMS = list.filter(function (p) { return p.definition.kind === 'incentive' || true; }).map(hubEntry);
      global.KDH_CUSTOM_MPOS = mpoEntries(list);
      var push = function () {
        if (global.KohlerHub && global.KohlerHub.rebuild) global.KohlerHub.rebuild();
        if (global.kdhCustomMposChanged) global.kdhCustomMposChanged();
      };
      ST.listeners.push(push);
      if (rep) Promise.all(list.filter(function (p) { return isParticipant(p.definition, rep); }).map(function (p) { return resultFor(p, rep); })).then(push, push);
      else push();
    }).catch(function () {});
  }
  // notices: one persistent, dismissible line under the top bar
  function notices() {
    var d = D(); var u = user(); if (!d || !d.signedIn() || !u) return;
    if (u.role === 'manager' && !(u.preview && u.name)) return;        // managers get none unless previewing a rep
    var body = (u.preview && u.role !== 'manager') ? { p_rep: u.name } : {};
    d.rpc('kdh_my_program_notices', body).then(function (rows) {
      if (!rows || !rows.length) return;
      var bar = document.getElementById('kdhBar'); if (!bar) return;
      if (!document.getElementById('kdhProgCss')) {
        var st = document.createElement('style'); st.id = 'kdhProgCss';
        st.textContent = '#kdhProgNotice{box-sizing:border-box;padding:10px 16px;background:var(--kdh-brand-soft,#E8F0FF);color:var(--kdh-text,#0E1A33);border-bottom:1px solid var(--kdh-border,#CBD5E1);font:15px/1.4 var(--kdh-body,system-ui,sans-serif);display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}' +
          '#kdhProgNotice a{color:var(--kdh-brand,#2866C0);font-weight:600}#kdhProgNotice button{min-height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--kdh-border-2,#94A3B8);background:transparent;color:inherit;font:inherit;cursor:pointer}' +
          '#kdhProgNotice .pn-t{font-weight:600}#kdhProgNotice .pn-test{font-weight:700;color:var(--kdh-warn,#B54708)}';
        document.head.appendChild(st);
      }
      var n = document.createElement('div'); n.id = 'kdhProgNotice'; n.setAttribute('role', 'status');
      var first = rows[0];
      n.innerHTML = '<span class="pn-t">Program update' + (rows.length > 1 ? 's (' + rows.length + ')' : '') + ':</span> ' + (first.is_test ? '<span class="pn-test">TEST</span> ' : '') + esc(first.summary) +
        ' <a href="' + ROOT + 'hub/">Open Programs</a> <button type="button" id="kdhProgDismiss">Dismiss</button>';
      var live = document.getElementById('kdhLive');
      (live || bar).parentNode.insertBefore(n, (live || bar).nextSibling);
      document.getElementById('kdhProgDismiss').addEventListener('click', function () {
        n.remove();
        var email = (u.email || '').toLowerCase();
        rows.forEach(function (r) { d.rest('program_notice_reads', { method: 'POST', body: { notice_id: r.id, email: email } }); });
      });
    }).catch(function () {});
  }

  global.KdhPrograms = { load: load, evaluate: evaluate, resultFor: resultFor, cached: cached, hubEntry: hubEntry, mpoEntries: mpoEntries, potential: potential,
    rulesText: rulesText, monthLabel: monthLabel, goalSummary: goalSummary, objectiveRule: objectiveRule, MEASURE_TEXT: MEASURE_TEXT, resolveProducts: resolveProducts, products: products, hist: hist, baseFor: baseFor, book: book, participants: participants, isParticipant: isParticipant,
    objectivesTable: objectivesTable, SUPPORT_LABEL: SUPPORT_LABEL, periodText: periodText, metricLabel: metricLabel, unitOf: unitOf, boot: boot, notices: notices, state: ST,
    monthRange: monthRange, windowBefore: windowBefore, keyFor: keyFor };
  if (document.currentScript && document.currentScript.getAttribute('data-boot') !== 'off') {
    var start = function () { boot(); notices(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  }
})(window);
