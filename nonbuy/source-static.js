/* Non-Buy Reports -- the STATIC EXPORT data source (2026-10-08).
   The only file that knows where today's data lives: the account books
   (hub/data/accounts.js -- a rep's browser receives their own slice from the
   middleware), the product catalogue (accounts/data/products.json through
   KdhPrograms.products), the per-rep monthly sales history
   (accounts/data/hist/<key>.json, net cases per product per month, served per rep
   by the middleware), Brand Permissions (HUB_BRANDS inside the books), the DM
   groups (shared/dm-groups.js) and the manager's authorized scope
   (RPC kdh_program_scope). A Snowflake source implements the same five methods
   (context, accounts, hist, scope, save) and nothing in engine.js or nonbuy.js
   changes. Access is still decided by the middleware (per-rep files) and RLS
   (saved reports); this file only asks. */
(function (global) {
  'use strict';
  var D = global.KdhData, KP = global.KdhPrograms;
  var CORE = ['Bergen', 'Passaic', 'Passaic-FF', 'Morris 1', 'Morris 3', 'Sussex'], SOUTH = ['Essex', 'Hudson', 'Union'];
  var cache = {};
  function once(k, f) { if (!cache[k]) cache[k] = f().catch(function (e) { delete cache[k]; throw e; }); return cache[k]; }
  function books() { var H = global.HUB_ACCOUNTS || (typeof HUB_ACCOUNTS !== 'undefined' ? HUB_ACCOUNTS : null); return H && H.reps ? H : { reps: {}, asOf: '' }; }
  function brands() { var B = global.HUB_BRANDS || (typeof HUB_BRANDS !== 'undefined' ? HUB_BRANDS : null); return B || { areas: [], families: {} }; }
  function isRep(n) { return global.kdhIsRep ? global.kdhIsRep(n) : !/^(default|office tell sell)$/i.test(String(n || '').trim()); }
  function match(name, names) { return global.kdhMatchName ? global.kdhMatchName(name, names) : (names.indexOf(name) >= 0 ? name : null); }

  // ---- who may see which reps (and which suppliers)
  // rep / rep preview: one rep. manager: the database's answer (kdh_program_scope):
  // admin -> every rep; a team -> those reps; brand manager -> every rep but only
  // their suppliers' products; neither on file -> nobody (never "everyone" by default).
  function scope(user, index) {
    var all = index.reps.filter(function (r) { return isRep(r.rep); });
    var names = all.map(function (r) { return r.rep; });
    var repOf = function (n) { var hit = match(n, names); return hit ? all.filter(function (r) { return r.rep === hit; })[0] : null; };
    if (!user || user.role !== 'manager' || (user.preview && user.role !== 'manager')) {
      var me = repOf(user && user.name); return Promise.resolve({ mode: 'rep', reps: me ? [me] : [], brands: null, reason: me ? '' : 'We could not find your name on the account books.' });
    }
    return D.rpc('kdh_program_scope').then(function (sc) {
      if (sc.admin) return { mode: 'admin', reps: all, brands: null, reason: '' };
      var reps = sc.team === null ? all : (sc.team || []).map(repOf).filter(Boolean);
      var seen = {}; reps = reps.filter(function (r) { if (seen[r.key]) return false; seen[r.key] = 1; return true; });
      var br = sc.brands === null ? null : (sc.brands || []);
      var reason = !reps.length ? (sc.team && sc.team.length ? 'None of the reps on your team are on the account books yet.' : 'You have no team or brand assignment on file, so no reps are in your scope. Ask Gavin to set it.') : (br && !br.length ? 'You have no brand assignment on file, so no products are in your scope.' : '');
      return { mode: sc.team === null ? 'brand' : 'team', reps: reps, brands: br, reason: reason };
    }, function (e) {
      return { mode: 'none', reps: [], brands: [], reason: /404|not found|does not exist/i.test(String(e && e.message)) ? 'The scope function (kdh_program_scope) is not in the database yet: run supabase/migrations/20261008120000_manage_programs.sql first.' : 'Could not read your scope: ' + (e && e.message || e) };
    });
  }
  function context(user) {
    return Promise.all([D.repIndex(), KP.products()]).then(function (r) {
      var idx = r[0], P = r[1];
      return scope(user, idx).then(function (sc) {
        var dm = (global.KDH_DM_GROUPS || []).map(function (g) { return { dm: g.dm, reps: g.reps || [] }; });
        return { index: idx, products: P, brands: brands(), books: books(), scope: sc, districts: dm, core: CORE, south: SOUTH,
          months: idx.months || [], refMonth: idx.salesRef || idx.salesThrough, through: idx.salesThrough, loaded: idx.salesLoaded, bookAsOf: idx.bookAsOf || books().asOf };
      });
    });
  }
  // the authorized accounts of the given reps (rows carry rep + repKey; CustomerID is `n`)
  function accounts(ctx, reps) {
    var B = books(); var out = [];
    reps.forEach(function (r) {
      var rows = B.reps[r.rep] || B.reps[match(r.rep, Object.keys(B.reps)) || ''] || [];
      rows.forEach(function (a) { out.push({ n: a.n, name: a.name, rep: r.rep, repKey: r.key, area: a.area || '', rawArea: a.rawArea || '', county: a.county || '', city: a.city || '', prem: a.prem || '', chain: a.chain || '', type: a.type || '', cases: a.cases || 0 }); });
    });
    return out;
  }
  function hist(key) { return once('hist:' + key, function () { return D.json('accounts/data/hist/' + key + '.json').then(function (h) { return h && h.accounts ? h : { accounts: {}, months: [] }; }); }); }
  function histFor(keys, onProgress) {
    var out = {}; var i = 0;
    return keys.reduce(function (p, k) { return p.then(function () { return hist(k).then(function (h) { out[k] = h.accounts || {}; i++; if (onProgress) onProgress(i, keys.length); }); }); }, Promise.resolve()).then(function () { return out; });
  }
  // ---- saved templates / reports / target lists (table nonbuy_reports, RLS in the migration)
  var COLS = 'id,kind,name,owner_email,owner_name,criteria,period,coverage,rule_version,counts,shared_reps,run_at,created_at,updated_at';
  function list() { return D.rest('nonbuy_reports?select=' + COLS + '&order=updated_at.desc').then(function (r) { return r.ok ? (r.data || []) : (r.status === 404 ? null : []); }); }
  function get(id) { return D.rest('nonbuy_reports?select=' + COLS + ',snapshot&id=eq.' + encodeURIComponent(id)).then(function (r) { return r.ok && r.data && r.data[0] || null; }); }
  function save(row) { return D.rpc('kdh_nonbuy_save', { p: row }); }
  function remove(id) { return D.rest('nonbuy_reports?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }); }
  function shared(rep) { return D.rpc('kdh_nonbuy_shared', { p_rep: rep || null }).then(function (x) { return x || []; }, function () { return []; }); }
  global.KdhNonBuySource = { context: context, accounts: accounts, hist: hist, histFor: histFor, scope: scope, list: list, get: get, save: save, remove: remove, shared: shared, CORE: CORE, SOUTH: SOUTH };
})(typeof window !== 'undefined' ? window : globalThis);
