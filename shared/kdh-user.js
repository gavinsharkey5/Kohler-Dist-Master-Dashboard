/* Kohler Dist Hub -- who is signed in, for the pages.
   /login/ leaves a readable `kdh_user` cookie ({name, role, email, title,
   dm}). A manager can also set `kdh_preview` (from the rep workspace's
   "Preview as this rep") and then every page behaves as if that rep had
   signed in, with a fixed bar at the bottom to exit. Access is decided by
   the Vercel middleware from the real login, never by these cookies. */
(function (global) {
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function user() {
    try {
      var u = JSON.parse(cookie('kdh_user') || 'null');
      if (!u) return null;
      if (u.role === 'manager') {
        var p = cookie('kdh_preview');
        if (p) return { name: p, role: 'rep', preview: true, manager: u.name, email: u.email, title: '', dm: '' };
      }
      return u;
    } catch (e) { return null; }
  }
  function setPreview(name) {
    document.cookie = 'kdh_preview=' + encodeURIComponent(name || '') + '; Path=/; Max-Age=' + (name ? 86400 : 0) + '; Secure; SameSite=Lax';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bar() {
    var u = user();
    if (!u || !u.preview || document.getElementById('kdhPreviewBar')) return;
    var b = document.createElement('div');
    b.id = 'kdhPreviewBar';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#12275F;color:#fff;font:600 13.5px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 -4px 16px rgba(0,0,0,.35)';
    b.innerHTML = '<span>Previewing as <b>' + esc(u.name) + '</b> — this is what they see</span>' +
      '<button type="button" style="font:inherit;background:#F2C14E;color:#141414;border:0;border-radius:8px;padding:7px 12px;cursor:pointer">Exit preview</button>';
    b.querySelector('button').addEventListener('click', function () { setPreview(''); location.reload(); });
    document.body.appendChild(b);
    document.body.style.paddingBottom = '64px';
  }
  // Site root, worked out from where this script was loaded (../shared/ or
  // ../../shared/), so the same file works on kohlerdisthub.com and github.io.
  var ROOT = (function () {
    try { var src = (document.currentScript && document.currentScript.src) || ''; var i = src.indexOf('shared/kdh-user.js'); return i > 0 ? src.slice(0, i) : ''; } catch (e) { return ''; }
  })();
  var REP_HOME = ROOT + 'rep/';
  // A clear way back for reps on every dashboard: Back returns to the page
  // they came from when that was one of ours (hub -> MPO page, say), and
  // to their dashboards page otherwise. Managers don't get it.
  function backBar() {
    var u = user();
    if (!u || u.role === 'manager' || document.getElementById('kdhBackBar')) return;
    if (location.pathname.replace(/index\.html$/, '').indexOf('/rep/') >= 0) return;
    var cameFromUs = document.referrer && document.referrer.indexOf(location.origin) === 0 && document.referrer.indexOf('/login/') < 0 && history.length > 1;
    var b = document.createElement('div');
    b.id = 'kdhBackBar';
    b.style.cssText = 'position:sticky;top:0;z-index:99998;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;height:44px;background:#12275F;color:#fff;font:600 14px/1 system-ui,-apple-system,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)';
    b.innerHTML = '<a href="' + REP_HOME + '" style="color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:8px;height:44px;padding-right:8px">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
      '<span>' + (cameFromUs ? 'Back' : 'My dashboards') + '</span></a>' +
      '<a href="' + REP_HOME + '" style="color:rgba(255,255,255,.8);text-decoration:none;font-weight:500;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(u.name) + ' · Dashboards</a>';
    var back = b.firstChild;
    back.addEventListener('click', function (e) { if (cameFromUs) { e.preventDefault(); history.back(); } });
    document.body.insertBefore(b, document.body.firstChild);
  }
  global.kdhUser = user;
  global.kdhSetPreview = setPreview;
  global.kdhPreviewBar = bar;
  global.kdhBackBar = backBar;
  function boot() { backBar(); bar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
