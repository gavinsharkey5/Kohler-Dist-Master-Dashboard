/* Non-Buy Reports -- the calculation engine (2026-10-08).
   PURE: no fetch, no DOM, no cookies. Everything it needs comes in through
   run(input); a Snowflake / Postgres source later supplies the same shapes
   (nonbuy/source-static.js is the only place today's static exports are read).
   Rules (nonbuy/README.txt has the long form):
   - PURCHASE = net cases > 0 in a sales month (the record is monthly net cases per
     product per account; a return inside the same month reduces that month, a
     fully returned purchase nets to 0 and does NOT count -- the occurrence itself is
     not in the record; see README "Returns" for the open question).
   - ELIGIBILITY is decided per account AND product: the product's brand family must
     be CAN SELL in the account's Encompass area (Brand Permissions); a family or area
     not on file is UNKNOWN and is never treated as permission; account-level rules
     (Whole Foods: non-alcoholic only) apply on top. An account appears only when it
     has at least one eligible selected product; only eligible missing products are
     opportunities. Historical purchases stay factual whatever today's permission.
   - DATES are whole sales months: a requested range maps to the months it touches,
     cut to the months loaded; nothing past the last COMPLETE month is counted and a
     range with no complete month cannot run.
   - IDs: CustomerID (n) and ProductID (id) only. */
(function (global) {
  'use strict';
  var RULE_VERSION = 'nb-2026-10-08a';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function ym(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function iso(d) { return ym(d) + '-' + String(d.getDate()).padStart(2, '0'); }
  function parse(s) { if (!s) return null; var m = String(s).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/); if (!m) return null; return new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1); }
  function monthLabel(k) { if (!k) return '—'; var m = String(k).split('-'); return MON[+m[1] - 1] + ' ' + m[0]; }
  function dayLabel(s) { var d = parse(s); if (!d) return '—'; return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  function lastDay(k) { var m = String(k).split('-'); return new Date(+m[0], +m[1], 0); }
  function firstDay(k) { return parse(k + '-01'); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // ---- date presets -> a requested range {start,end} (ISO days). `today` is injected.
  var PRESETS = [
    ['l30', 'Last 30 Days'], ['l60', 'Last 60 Days'], ['l90', 'Last 90 Days'],
    ['mtd', 'Month to Date'], ['prev', 'Previous Month'], ['custom', 'Custom Dates']];
  function presetRange(key, today, custom) {
    var t = parse(today) || new Date();
    if (key === 'l30' || key === 'l60' || key === 'l90') { var n = { l30: 30, l60: 60, l90: 90 }[key]; return { start: iso(addDays(t, -(n - 1))), end: iso(t), label: 'Last ' + n + ' Days' }; }
    if (key === 'mtd') return { start: iso(new Date(t.getFullYear(), t.getMonth(), 1)), end: iso(t), label: 'Month to Date' };
    if (key === 'prev') { var p = new Date(t.getFullYear(), t.getMonth() - 1, 1); return { start: iso(p), end: iso(new Date(t.getFullYear(), t.getMonth(), 0)), label: 'Previous Month' }; }
    return { start: custom && custom.start || '', end: custom && custom.end || '', label: 'Custom Dates' };
  }
  // ---- a requested range against the loaded months: effective months + what is missing
  // months: the loaded month keys (ascending); refMonth: the last COMPLETE month
  function resolvePeriod(req, months, refMonth) {
    var s = parse(req && req.start), e = parse(req && req.end);
    if (!s || !e || e < s) return { ok: false, reason: 'Set a start and an end date.', months: [] };
    var ks = ym(s), ke = ym(e);
    var wanted = []; var d = new Date(s.getFullYear(), s.getMonth(), 1);
    while (ym(d) <= ke) { wanted.push(ym(d)); d.setMonth(d.getMonth() + 1); }
    var loaded = months.filter(function (k) { return wanted.indexOf(k) >= 0 && (!refMonth || k <= refMonth); });
    var beyond = wanted.filter(function (k) { return loaded.indexOf(k) < 0; });
    var out = { ok: loaded.length > 0, requested: { start: iso(s), end: iso(e) }, wantedMonths: wanted, months: loaded, missingMonths: beyond,
      effStart: loaded.length ? firstDay(loaded[0]) : null, effEnd: loaded.length ? lastDay(loaded[loaded.length - 1]) : null, complete: beyond.length === 0 };
    out.effective = loaded.length ? { start: iso(out.effStart), end: iso(out.effEnd) } : null;
    if (!loaded.length) out.reason = 'No complete sales month covers ' + dayLabel(iso(s)) + ' – ' + dayLabel(iso(e)) + ' (data through ' + monthLabel(refMonth || months[months.length - 1]) + ').';
    else if (beyond.length) out.note = 'Sales data covers through ' + monthLabel(refMonth || months[months.length - 1]) + '; ' + beyond.map(monthLabel).join(', ') + (beyond.length === 1 ? ' is' : ' are') + ' not loaded yet, so the effective period is ' + dayLabel(out.effective.start) + ' – ' + dayLabel(out.effective.end) + '.';
    else if (ks !== loaded[0] || ke !== loaded[loaded.length - 1] || s.getDate() !== 1 || e.getDate() !== lastDay(ke).getDate()) out.note = 'The sales record is monthly, so the effective period is the whole months ' + dayLabel(out.effective.start) + ' – ' + dayLabel(out.effective.end) + '.';
    return out;
  }
  function periodText(p) { return p && p.start ? dayLabel(p.start) + ' – ' + dayLabel(p.end) : 'not set'; }

  // ---- eligibility per account x product. brands = HUB_BRANDS ({areas, families{name:{areas{area:status}}}}).
  // Returns {v:'ok'|'no'|'unknown', why}
  function nonAlcoholic(p) { return /non.?alcoholic|\bN\/?A\b|alcohol.?free|0\.0%|0\.5%/i.test(String(p.name || '')); }
  function isWholeFoods(a) { return /whole foods/i.test(String(a.name || '')); }
  function eligibility(acc, prod, brands) {
    if (!acc.area) return { v: 'unknown', why: 'account area not on file' };
    var fam = brands && brands.families && brands.families[prod.family];
    if (!fam || !fam.areas) return { v: 'unknown', why: 'brand family "' + (prod.family || '?') + '" not in the Brand Permissions file' };
    var s = fam.areas[acc.area];
    if (s === undefined) return { v: 'unknown', why: 'no permission entry for ' + acc.area };
    if (s !== 'CAN SELL') return { v: 'no', why: (s === 'BLOCKED' ? 'blocked' : 'not in territory') + ' in ' + acc.area };
    if (isWholeFoods(acc) && !nonAlcoholic(prod)) return { v: 'no', why: 'Whole Foods cannot sell alcohol' };
    return { v: 'ok', why: '' };
  }

  // ---- purchases in a month window. series = [cases per month index] aligned with `months`
  function boughtIn(series, idx) { if (!series) return false; for (var i = 0; i < idx.length; i++) { if (Number(series[idx[i]]) > 0) return true; } return false; }
  function lastBought(series, upto) { if (!series) return -1; for (var i = Math.min(upto, series.length - 1); i >= 0; i--) { if (Number(series[i]) > 0) return i; } return -1; }
  function lastAny(hist, upto) { var best = -1; for (var pid in hist) { var i = lastBought(hist[pid], upto); if (i > best) best = i; } return best; }
  function anyIn(hist, idx) { for (var pid in hist) { if (boughtIn(hist[pid], idx)) return true; } return false; }

  function levelKey(p, level) { return level === 'supplier' ? (p.supplier || '—') : level === 'brand' ? (p.brand || p.family || '—') : level === 'family' ? (p.family || '—') : String(p.id); }

  /* run(input):
     type        'nonbuyers' | 'missing' | 'lapsed'
     level       'account' (by account) | 'product' | 'brand' | 'family' | 'supplier' (by reporting level)
     products    [{id,name,supplier,family,brand,package,draft}]  (already resolved + deduplicated, exclusions applied)
     accounts    [{n,name,rep,repKey,area,city,county,prem,chain,type}]  (already authorized + filtered)
     hist        { repKey: { n: { pid: [cases per month] } } }   (every product the account bought)
     months      [month keys] aligned with every series
     period      {months:[keys]}  baseline {months:[keys]} (lapsed only)
     brands      HUB_BRANDS
     opts        {boughtAnything:true}
  */
  function run(input) {
    var months = input.months || []; var mi = {}; months.forEach(function (k, i) { mi[k] = i; });
    var per = (input.period && input.period.months || []).map(function (k) { return mi[k]; }).filter(function (i) { return i != null; });
    var base = (input.baseline && input.baseline.months || []).map(function (k) { return mi[k]; }).filter(function (i) { return i != null; });
    var type = input.type || 'nonbuyers', level = input.level || 'account', opts = input.opts || {};
    var upto = per.length ? Math.max.apply(null, per) : months.length - 1;
    var P = input.products || []; var byPid = {}; P.forEach(function (p) { byPid[String(p.id)] = p; });
    var out = { ruleVersion: RULE_VERSION, type: type, level: level, rows: [], byRep: {}, groups: [],
      counts: { accounts: 0, opportunities: 0, reps: 0, considered: 0 },
      excluded: { noEligible: 0, unknownOnly: 0, noActivity: 0, buyers: 0, notLapsed: 0 }, unknownPairs: 0, unknownWhy: {} };
    (input.accounts || []).forEach(function (a) {
      out.counts.considered++;
      var H = (input.hist[a.repKey] || {})[String(a.n)] || {};
      var elig = [], unknown = [];
      P.forEach(function (p) { var e = eligibility(a, p, input.brands); if (e.v === 'ok') elig.push(p); else if (e.v === 'unknown') { unknown.push(p); out.unknownWhy[e.why] = (out.unknownWhy[e.why] || 0) + 1; } });
      out.unknownPairs += unknown.length;
      if (!elig.length) { if (unknown.length) out.excluded.unknownOnly++; else out.excluded.noEligible++; return; }
      if (opts.boughtAnything && !anyIn(H, per)) { out.excluded.noActivity++; return; }
      var bought = elig.filter(function (p) { return boughtIn(H[String(p.id)], per); });
      var missing = elig.filter(function (p) { return !boughtIn(H[String(p.id)], per); });
      var row = { n: a.n, name: a.name, rep: a.rep, repKey: a.repKey, city: a.city, area: a.area, county: a.county, prem: a.prem, chain: a.chain || '', type: a.type || '',
        eligible: elig.map(function (p) { return String(p.id); }), bought: bought.map(function (p) { return String(p.id); }), missing: missing.map(function (p) { return String(p.id); }),
        unknown: unknown.map(function (p) { return String(p.id); }), lastScope: null, lastAny: null, finding: '' };
      var ls = -1; elig.forEach(function (p) { var i = lastBought(H[String(p.id)], months.length - 1); if (i > ls) ls = i; });
      row.lastScope = ls >= 0 ? months[ls] : null; var la = lastAny(H, months.length - 1); row.lastAny = la >= 0 ? months[la] : null;
      if (type === 'nonbuyers') { if (bought.length) { out.excluded.buyers++; return; } row.finding = 'none'; }
      else if (type === 'missing') { if (!missing.length) { out.excluded.buyers++; return; } row.finding = bought.length ? 'some' : 'none'; }
      else if (type === 'lapsed') {
        var baseBought = elig.filter(function (p) { return boughtIn(H[String(p.id)], base); });
        if (!baseBought.length) { out.excluded.notLapsed++; return; }
        if (bought.length) { out.excluded.buyers++; return; }
        row.finding = 'lapsed'; row.baseline = baseBought.map(function (p) { return String(p.id); });
      }
      out.rows.push(row);
    });
    out.rows.sort(function (x, y) { return x.rep === y.rep ? String(x.name).localeCompare(String(y.name)) : String(x.rep).localeCompare(String(y.rep)); });
    out.rows.forEach(function (r) { (out.byRep[r.rep] = out.byRep[r.rep] || []).push(r); out.counts.opportunities += (type === 'lapsed' ? (r.baseline || []).length : r.missing.length); });
    out.counts.accounts = out.rows.length; out.counts.reps = Object.keys(out.byRep).length;
    // reporting level: each group judged on its own products (an account is a non-buyer OF THE GROUP when it bought none of the group's eligible products)
    if (level !== 'account') {
      var G = {}; P.forEach(function (p) { var k = levelKey(p, level); (G[k] = G[k] || { key: k, label: k, products: [], accounts: [] }).products.push(String(p.id)); });
      out.rows.forEach(function (r) {
        Object.keys(G).forEach(function (k) {
          var g = G[k]; var eligG = r.eligible.filter(function (pid) { return g.products.indexOf(pid) >= 0; }); if (!eligG.length) return;
          var boughtG = r.bought.filter(function (pid) { return g.products.indexOf(pid) >= 0; });
          if (type === 'missing') { var missG = r.missing.filter(function (pid) { return g.products.indexOf(pid) >= 0; }); if (missG.length) g.accounts.push({ n: r.n, rep: r.rep, missing: missG, finding: boughtG.length ? 'some' : 'none' }); }
          else if (type === 'lapsed') { var baseG = (r.baseline || []).filter(function (pid) { return g.products.indexOf(pid) >= 0; }); if (baseG.length && !boughtG.length) g.accounts.push({ n: r.n, rep: r.rep, baseline: baseG, finding: 'lapsed' }); }
          else if (!boughtG.length) g.accounts.push({ n: r.n, rep: r.rep, missing: eligG, finding: 'none' });
        });
      });
      out.groups = Object.keys(G).map(function (k) { return G[k]; }).sort(function (a, b) { return b.accounts.length - a.accounts.length || a.label.localeCompare(b.label); });
    }
    return out;
  }
  // the finding sentence for one row (never "never bought" unless lifetime coverage is on file)
  function findingText(row, type, per, base, firstMonth) {
    var p = periodText(per);
    if (type === 'lapsed') return 'Purchased during the baseline (' + periodText(base) + '); no purchases during ' + p + '.';
    if (row.finding === 'some') return 'Missing ' + row.missing.length + ' of ' + row.eligible.length + ' selected products during ' + p + '.';
    if (!row.lastScope) return 'No purchases in available history: ' + monthLabel(firstMonth) + ' – ' + (per && per.end ? dayLabel(per.end) : '') + '.';
    return 'No purchases during ' + p + '. Last bought ' + monthLabel(row.lastScope) + '.';
  }
  global.KdhNonBuyEngine = { RULE_VERSION: RULE_VERSION, PRESETS: PRESETS, presetRange: presetRange, resolvePeriod: resolvePeriod, periodText: periodText,
    eligibility: eligibility, run: run, findingText: findingText, monthLabel: monthLabel, dayLabel: dayLabel, levelKey: levelKey, ym: ym, iso: iso, parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
