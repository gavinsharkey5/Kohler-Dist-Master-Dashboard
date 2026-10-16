/* HUB TAP SURVEYS ON THE TAP TRACKER (2026-10-05).
 *
 * Reps now photograph tap walls in the Kohler Hub (Account -> Add Photos -> Tap
 * Handles), each tap line labelled Ours / Theirs from Kohler's territory list
 * (shared/data/tap-rules.json -- the same workbook and steps as this tracker's
 * audit). This file reads those surveys from Supabase WITH THE VIEWER'S OWN
 * SIGN-IN (row-level security: a rep gets only their own accounts) and merges
 * them into the tracker's data before the first render:
 *
 *   * every survey of an account -- iSellBeer pass or Hub pass -- is one PASS;
 *     the NEWEST pass is the account's current lineup (the tracker's rule since
 *     2026-09-04); every older pass goes to Survey history, which feeds no total;
 *   * a Hub pass = one tap_handle record with at least one tap line; a record
 *     with photos only is not a survey and is left out;
 *   * a line's status is its saved label (ownership_source); a line saved with
 *     no label counts as THEM -- the tracker's own default for an unmatched brand;
 *   * segment / supplier come from the same brand elsewhere in the tracker, else
 *     "Unclassified" / blank; photo = a 1-day signed link to the record's photo.
 *
 * Nothing here writes anything, and the generator (which replaces only the data
 * <script>) is unaffected. Without a sign-in, or if Supabase does not answer
 * within 6 s, the page renders the iSellBeer data alone and its footer says so.
 */
(function (global) {
  'use strict';
  var out = { status: 'off', recs: [], urls: {}, accounts: null };
  function cookie(n) { var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function loadScript(src) {
    return new Promise(function (res) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = res; document.head.appendChild(s); });
  }
  var base = (document.currentScript && document.currentScript.src || '').replace(/hub-taps\.js.*$/, '');
  var site = base.replace(/isellbeer\/tap-survey-tracking\/$/, '');

  function fetchAll() {
    return loadScript(site + 'shared/auth-config.js').then(function () {
      var c = global.KDH_AUTH || {}, tok = cookie('kdh_at');
      if (!c.url || !c.key || !tok) return 'off';
      var url = c.url.replace(/\/$/, ''), h = { apikey: c.key, authorization: 'Bearer ' + tok, accept: 'application/json' };
      var get = function (p) { return fetch(url + '/rest/v1/' + p, { headers: h }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); };
      return get('merch_records?select=id,customer_num,observed_at,created_at,author_name,merch_lines(line_no,brand,brand_family,quantity,ownership_source,ownership_rule),merch_record_photos(ord,photo_id)'
        + '&category=eq.tap_handle&source=eq.hub&order=observed_at.desc.nullslast&limit=5000').then(function (rows) {
        out.recs = (rows || []).filter(function (r) { return (r.merch_lines || []).some(function (l) { return l.brand || l.brand_family; }); });
        if (!out.recs.length) return 'ok';
        var ids = [];
        out.recs.forEach(function (r) { var p = (r.merch_record_photos || []).slice().sort(function (a, b) { return a.ord - b.ord; }); r._photoIds = p.map(function (x) { return x.photo_id; }); ids = ids.concat(r._photoIds); });
        var chunks = []; for (var i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        var paths = {};
        return Promise.all(chunks.map(function (ch) { return get('account_photos?select=id,storage_path,source_url&id=in.(' + ch.join(',') + ')').then(function (ps) { ps.forEach(function (p) { paths[p.id] = p; }); }); }))
          .then(function () {
            out.recs.forEach(function (r) { r._photo = r._photoIds.map(function (id) { return paths[id]; }).filter(Boolean).sort(function (a, b) { return (b.storage_path ? 1 : 0) - (a.storage_path ? 1 : 0); })[0] || null; });
            var sp = out.recs.map(function (r) { return r._photo && r._photo.storage_path; }).filter(Boolean);
            if (!sp.length) return;
            return fetch(url + '/storage/v1/object/sign/account-photos', { method: 'POST', headers: { apikey: c.key, authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
              body: JSON.stringify({ expiresIn: 86400, paths: sp }) }).then(function (r) { return r.ok ? r.json() : []; }, function () { return []; })
              .then(function (rows) { (rows || []).forEach(function (x) { if (x && x.signedURL && !x.error) out.urls[x.path] = url + '/storage/v1' + (x.signedURL.charAt(0) === '/' ? '' : '/') + x.signedURL; }); });
          })
          // account names / areas / reps for an account this tracker has never seen in iSellBeer
          .then(function () { return Promise.all([loadScript(site + 'hub/data/accounts.js'), loadScript(site + 'shared/dm-groups.js')]); })
          .then(function () { return 'ok'; });
      });
    });
  }

  var ready = new Promise(function (res) {
    var done = false, finish = function (s) { if (!done) { done = true; out.status = s; res(s); } };
    setTimeout(function () { finish('timeout'); }, 6000);
    fetchAll().then(finish, function () { finish('error'); });
  });

  /* ---------------- merge (synchronous, on the parsed DATA, before the first render) ---------------- */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localIso(t) {   // the tracker keeps naive local times: "2026-04-12T16:46:00"
    var d = new Date(t); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
  }
  function disp(iso) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10); return MON[m - 1] + ' ' + d + ', ' + y; }
  function dispFull(iso) { var h = +iso.slice(11, 13), mi = iso.slice(14, 16); return disp(iso) + ' at ' + ((h % 12) || 12) + ':' + mi + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function entry(visited, brands, extra) {   // generate.py survey_entry()
    var agg = {}, order = [];
    brands.forEach(function (b) { var k = [b.brand, b.brandFamily, b.supplier, b.status].join('|'); if (!agg[k]) { agg[k] = Object.assign({}, b, { taps: 0 }); order.push(k); } agg[k].taps += b.taps; });
    var list = order.map(function (k) { return agg[k]; }).sort(function (a, b) { return b.taps - a.taps; });
    var side = function (s) { return list.filter(function (b) { return b.status === s; }).reduce(function (a, b) { return a + b.taps; }, 0); };
    var total = list.reduce(function (a, b) { return a + b.taps; }, 0);
    return Object.assign({ visited: visited, display: disp(visited), displayFull: dispFull(visited), taps: total, us: side('US'), them: side('THEM'), unv: total - side('US') - side('THEM'), brands: list }, extra || {});
  }

  function apply(D) {
    D.hub = { status: out.status, surveys: 0, current: 0, accounts: 0 };
    if (out.status !== 'ok' || !out.recs.length) return D;
    var rows = D.records || [], hist = D.history || (D.history = {});
    var byAcct = {}; rows.forEach(function (r) { (byAcct[r.account] = byAcct[r.account] || []).push(r); });
    // brand facts already in the tracker (segment, supplier, family), by brand and by family
    var facts = {}, famFacts = {};
    var learn = function (b) { if (!b || !b.brand) return; var k = String(b.brand).toUpperCase(); if (!facts[k]) facts[k] = b; var f = String(b.brandFamily || '').toUpperCase(); if (f && !famFacts[f]) famFacts[f] = b; };
    rows.forEach(learn); Object.keys(hist).forEach(function (a) { hist[a].forEach(function (p) { p.brands.forEach(learn); }); });
    // rep / DM spellings the tracker uses
    var repDm = {}; rows.forEach(function (r) { if (r.districtManager && !repDm[r.rep]) repDm[r.rep] = r.districtManager; });
    var match = function (n, list) { return n ? (global.kdhMatchName ? global.kdhMatchName(n, list || []) : null) : null; };
    var acctInfo = {};
    // hub/data/accounts.js declares `const HUB_ACCOUNTS` (a global binding, not a window property)
    var HA = typeof HUB_ACCOUNTS !== 'undefined' ? HUB_ACCOUNTS : global.HUB_ACCOUNTS;   // eslint-disable-line no-undef
    try { Object.keys(HA.reps).forEach(function (rep) { HA.reps[rep].forEach(function (a) { acctInfo[String(a.n)] = { a: a, rep: rep }; }); }); } catch (e) {}
    var dmOf = function (rep) {
      if (repDm[rep]) return repDm[rep];
      var g = (global.KDH_DM_GROUPS || []).filter(function (x) { return match(rep, x.reps); })[0];
      return g ? (match(g.dm, D.districtManagers) || g.dm) : '';
    };
    var hubByAcct = {};
    out.recs.forEach(function (r) { (hubByAcct[String(r.customer_num)] = hubByAcct[String(r.customer_num)] || []).push(r); });

    Object.keys(hubByAcct).forEach(function (acct) {
      var cur = byAcct[acct] || [];
      var meta = cur[0];
      if (!meta) {   // never surveyed in iSellBeer: name, area and rep from the customer base
        var inf = acctInfo[acct]; if (!inf) return;   // not on this viewer's book -> leave it out
        var trep = match(inf.rep, D.reps) || inf.rep;
        meta = { account: acct, dba: inf.a.name, county: String(inf.a.area || inf.a.rawArea || '').toUpperCase(), address: '', city: inf.a.city || '', rep: trep, districtManager: dmOf(trep) };
        if (D.reps && D.reps.indexOf(trep) < 0) D.reps.push(trep);
        if (D.counties && meta.county && D.counties.indexOf(meta.county) < 0) D.counties.push(meta.county);
      }
      // the passes: iSellBeer's (history when re-surveyed, else the current rows) + the Hub's
      var passes = hist[acct] ? hist[acct].slice() : (cur.length ? [entry(cur[0].visited, cur.map(function (r) {
        return { brand: r.brand, brandFamily: r.brandFamily, supplier: r.supplier, segment: r.segment, status: r.status, flipped: r.flipped, rawStatus: r.rawStatus, reason: r.reason, taps: r.taps }; }), { _rows: cur })] : []);
      if (hist[acct] && cur.length) passes.forEach(function (p) { if (p.visited === cur[0].visited) p._rows = cur; });
      hubByAcct[acct].forEach(function (r) {
        var v = localIso(r.observed_at || r.created_at); if (!v) return;
        var ph = r._photo, photo = ph ? (ph.storage_path ? out.urls[ph.storage_path] || '' : ph.source_url || '') : '';
        var brands = (r.merch_lines || []).filter(function (l) { return l.brand || l.brand_family; }).map(function (l) {
          var name = l.brand || l.brand_family, k = String(name).toUpperCase(), f = facts[k] || famFacts[String(l.brand_family || '').toUpperCase()] || {};
          var st = l.ownership_source === 'US' || l.ownership_source === 'THEM' ? l.ownership_source : 'THEM';
          return { brand: name, brandFamily: f.brandFamily || l.brand_family || name, supplier: f.supplier || '', segment: f.segment || 'Unclassified', status: st, flipped: false, rawStatus: st,
            reason: l.ownership_rule === 'territory' ? 'Kohler Hub survey · from Kohler’s territory list' : l.ownership_rule === 'rep' ? 'Kohler Hub survey · the rep’s call (brand not in the territory list)' : 'Kohler Hub survey · no label saved, counted as THEM (the tracker’s default)',
            taps: l.quantity == null ? 1 : Math.max(0, Math.round(Number(l.quantity) || 0)) };
        });
        passes.push(entry(v, brands, { displayFull: dispFull(v) + ' · Kohler Hub survey' + (r.author_name ? ' by ' + r.author_name : ''), _hub: true, _photo: photo }));
        D.hub.surveys++;
      });
      passes.sort(function (a, b) { return a.visited < b.visited ? 1 : a.visited > b.visited ? -1 : (b._hub ? 1 : 0) - (a._hub ? 1 : 0); });
      var top = passes[0]; if (!top) return;
      D.hub.accounts++;
      if (top._hub) {   // the Hub pass is the current lineup: its lines replace the account's rows
        D.hub.current++;
        var keep = cur[0] ? cur[0].photo : '';
        var nrows = top.brands.map(function (b) {
          return { account: acct, dba: meta.dba, county: meta.county, address: meta.address || '', city: meta.city || '', visited: top.visited, visitedDisplay: top.display + ' · Kohler Hub',
            rep: meta.rep, districtManager: meta.districtManager || '', brand: b.brand, brandFamily: b.brandFamily, supplier: b.supplier, segment: b.segment, taps: b.taps,
            status: b.status, flipped: false, rawStatus: b.rawStatus, reason: b.reason, photo: top._photo || keep, src: 'hub' };
        });
        for (var i = rows.length - 1; i >= 0; i--) if (rows[i].account === acct) rows.splice(i, 1);
        Array.prototype.push.apply(rows, nrows);
      }
      passes.forEach(function (p) { delete p._rows; });
      if (passes.length > 1) hist[acct] = passes; else delete hist[acct];
    });
    // the header numbers the generator precomputed, restated for the merged lineup
    var s = D.summary || (D.summary = {}), us = 0, them = 0, taps = 0;
    rows.forEach(function (r) { taps += r.taps; if (r.status === 'US') us += r.taps; else if (r.status === 'THEM') them += r.taps; });
    s.taps = taps; s.us = us; s.them = them; s.unv = taps - us - them;
    s.usPct = taps ? Math.round(us / taps * 1000) / 10 : 0; s.themPct = taps ? Math.round(them / taps * 1000) / 10 : 0;
    s.accountCount = Object.keys(rows.reduce(function (a, r) { a[r.account] = 1; return a; }, {})).length;
    s.resurveyedAccounts = Object.keys(hist).length;
    // D.company (a rep copy's company-wide playbook totals) is left as built: a rep's phone cannot restate other reps' taps
    return D;
  }

  global.KdhTapHub = { ready: ready, apply: apply, state: out };
})(window);
