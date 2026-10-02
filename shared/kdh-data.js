/* KDH DATA SOURCES (2026-10-03)
 *
 * The one place a page asks for a dataset. Components render what these
 * loaders return and calculations run on it; neither knows where it came
 * from. Today every source is a static export on this site or a Supabase
 * table read with the signed-in person's own token. A future Snowflake /
 * Postgres feed replaces a loader here and nothing else.
 *
 * ACCESS IS NOT DECIDED HERE. The middleware serves a rep only their own
 * slice of every file below (and 403s anyone else's), and Supabase row-level
 * security decides which rows a token can read. These loaders just ask; a
 * 403 / 404 comes back as null so a page can say "not available".
 *
 * DATASETS (what each is, where it comes from, how fresh it is):
 *   repIndex   accounts/data/index.json -- the reps with an account book and
 *              the export dates: bookAsOf (customer base), salesThrough /
 *              salesLoaded (Fusion monthly sales), tapsAsOf (iSellBeer).
 *              Written by accounts/generate.py.
 *   repBook    accounts/data/reps/<key>.json -- one rep's assigned accounts
 *              with buying alerts, tap survey status (last pass), sales
 *              summaries. Same generator, same dates as the index.
 *   catalog    accounts/data/catalog.json -- products + warehouse units at the
 *              inventory report's own date (inventory.asOf). A snapshot,
 *              never live availability.
 *   actions    Supabase rep_actions -- notes, follow-ups (follow_on = due
 *              date) and program marks. Live: read at page load.
 *   photos     Supabase account_photos -- photo records (labels, capture and
 *              upload times). Live.
 *   merch      Supabase merch_records / merch_lines / merch_record_photos --
 *              merchandising evidence (Hub captures + iSellBeer imports).
 *              Live; imported rows carry their export's period in the batch.
 *   team       Supabase rpc kdh_team() -- names, roles, titles, reports_to,
 *              managers only. Live.
 *   programs   the trackers' registries + incentive-tracking/data/
 *              program_data.js, read through hub.js (window.KohlerHub);
 *              refreshed when each tracker's generate.py runs.
 */
(function (global) {
  'use strict';
  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/shared\/kdh-data\.js.*$/, '') : '/';
  })();
  function cookie(name) { var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function cfg() { return global.KDH_AUTH || {}; }
  function token() { return cookie('kdh_at'); }
  function signedIn() { var c = cfg(); return !!(c.url && c.key && token()); }

  // a static file under the site root; 403 / 404 -> null
  function json(path) {
    return fetch(ROOT + path, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + path);
      return r.json();
    });
  }
  // Supabase PostgREST with the person's own token -> {ok, status, data}
  function rest(path, opt) {
    var c = cfg(); if (!signedIn()) return Promise.resolve({ ok: false, status: 0, data: null, off: true });
    opt = opt || {};
    var h = { apikey: c.key, authorization: 'Bearer ' + token(), accept: 'application/json' };
    if (opt.body) h['content-type'] = 'application/json';
    return fetch(c.url.replace(/\/$/, '') + '/rest/v1/' + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) { return r.text().then(function (t) { var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {} return { ok: r.ok, status: r.status, data: d }; }); },
            function (e) { return { ok: false, status: 0, data: null, error: e.message || String(e) }; });
  }

  var memo = {};
  function once(k, f) { if (!memo[k]) memo[k] = f().catch(function (e) { delete memo[k]; throw e; }); return memo[k]; }

  function repIndex() { return once('idx', function () { return json('accounts/data/index.json'); }); }
  // the file key for a rep name, through the index (kdhMatchName forgives spelling)
  function repKeyFor(name) {
    return repIndex().then(function (idx) {
      if (!idx || !idx.reps) return null;
      var names = idx.reps.map(function (r) { return r.rep; });
      var hit = global.kdhMatchName ? global.kdhMatchName(name, names) : (names.indexOf(name) >= 0 ? name : null);
      var row = hit && idx.reps.filter(function (r) { return r.rep === hit; })[0];
      return row ? row.key : null;
    });
  }
  function repBook(name) {
    return once('book:' + name, function () { return repKeyFor(name).then(function (k) { return k ? json('accounts/data/reps/' + k + '.json') : null; }); });
  }
  function catalog() { return once('cat', function () { return json('accounts/data/catalog.json'); }); }

  // rep_actions for a set of reps (or one account). follow_on arrives with the
  // notes migration; without it the select is retried without the column.
  var ACT_COLS = 'id,rep_name,program_id,account_num,account_name,status,note,follow_on,updated_at,created_at';
  function actions(o) {
    o = o || {};
    var q = [];
    if (o.reps && o.reps.length) q.push('rep_name=in.' + encodeURIComponent('(' + o.reps.map(function (n) { return '"' + String(n).replace(/"/g, '') + '"'; }).join(',') + ')'));
    if (o.account != null) q.push('account_num=eq.' + encodeURIComponent(o.account));
    if (o.status) q.push('status=eq.' + encodeURIComponent(o.status));
    var tail = q.concat(['order=updated_at.desc', 'limit=' + (o.limit || 5000)]).join('&');
    return rest('rep_actions?select=' + ACT_COLS + '&' + tail).then(function (r) {
      if (r.ok) return { rows: r.data || [], dated: true };
      if (r.status === 400) return rest('rep_actions?select=' + ACT_COLS.replace(',follow_on', '') + '&' + tail).then(function (r2) {
        if (!r2.ok) throw new Error('rep_actions HTTP ' + r2.status);
        return { rows: r2.data || [], dated: false };
      });
      if (r.off) return { rows: [], off: true };
      throw new Error('rep_actions HTTP ' + r.status);
    });
  }
  function team() { return rest('rpc/kdh_team', { method: 'POST', body: {} }).then(function (r) { return r.ok ? r.data : null; }); }

  // Supabase RPC (security-definer functions decide access) -> data, or throws with .code
  function rpc(name, body) {
    return rest('rpc/' + name, { method: 'POST', body: body || {} }).then(function (r) {
      if (r.ok) return r.data;
      var e = new Error((r.data && (r.data.message || r.data.hint)) || r.error || ('HTTP ' + r.status)); e.status = r.status; e.code = r.data && r.data.code; throw e;
    });
  }
  // private photo bucket: upload (x-upsert false; an existing file is "already there", not an error) and read back
  var BUCKET = 'account-photos';
  function objUrl(path) { return cfg().url.replace(/\/$/, '') + '/storage/v1/object/' + BUCKET + '/' + String(path).split('/').map(encodeURIComponent).join('/'); }
  function upload(path, blob, onProgress, type) {
    return new Promise(function (resolve, reject) {
      if (!signedIn()) { reject(new Error('Sign in again to upload.')); return; }
      var c = cfg(), x = new XMLHttpRequest();
      x.open('POST', objUrl(path));
      x.setRequestHeader('apikey', c.key); x.setRequestHeader('authorization', 'Bearer ' + token());
      x.setRequestHeader('content-type', type || 'image/jpeg'); x.setRequestHeader('x-upsert', 'false');
      if (x.upload && onProgress) x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) return resolve({ path: path, existed: false });
        var m = ''; try { var j = JSON.parse(x.responseText); m = j.message || j.error || ''; if (String(j.statusCode) === '409') return resolve({ path: path, existed: true }); } catch (e) {}
        if (/already exists|duplicate/i.test(m)) return resolve({ path: path, existed: true });
        var err = new Error(m || ('HTTP ' + x.status)); err.status = x.status; reject(err);
      };
      x.onerror = function () { reject(new Error('The connection dropped while uploading.')); };
      x.timeout = 120000; x.ontimeout = function () { reject(new Error('The upload took too long.')); };
      x.send(blob);
    });
  }
  function objectBlob(path) {
    if (!signedIn()) return Promise.resolve(null);
    var c = cfg();
    return fetch(cfg().url.replace(/\/$/, '') + '/storage/v1/object/authenticated/' + BUCKET + '/' + String(path).split('/').map(encodeURIComponent).join('/'),
      { headers: { apikey: c.key, authorization: 'Bearer ' + token() } }).then(function (r) { return r.ok ? r.blob() : null; }, function () { return null; });
  }
  async function sha256hex(blob) {
    var buf = await blob.arrayBuffer(); var h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  global.KdhData = { ROOT: ROOT, signedIn: signedIn, json: json, rest: rest, repIndex: repIndex, repKeyFor: repKeyFor, repBook: repBook, catalog: catalog, actions: actions, team: team, rpc: rpc, upload: upload, objectBlob: objectBlob, sha256hex: sha256hex };
})(window);
