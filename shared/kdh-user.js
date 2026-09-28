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

  // Theme: applied as early as this script runs so a dark-mode page does not
  // flash light (the landing pages also do this inline in <head>).
  function applyTheme() { try { var t = localStorage.getItem('kdh_theme'); if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); } catch (e) {} }
  function toggleTheme() {
    var root = document.documentElement;
    var current = root.getAttribute('data-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('kdh_theme', next); } catch (e) {}
  }
  applyTheme();

  // THE SITE CHROME (2026-09-28): one top bar on every dashboard, the same
  // one the rep workspace, manager page and team page carry in their own
  // markup (shared/kdh.css, .kdh-bar). Logo -> the person's landing page,
  // the page's name, a "Dashboards" link back, the light/dark toggle, who
  // is signed in, Sign out. Skipped on pages that already have a .kdh-bar.
  // Without a sign-in (github.io) it still shows the logo, name and toggle.
  function pageName() {
    var m = document.querySelector('meta[name="kdh-page"]'); if (m && m.content) return m.content;
    var h = document.querySelector('h1'); if (h && h.textContent.trim()) return h.textContent.replace(/\s+/g, ' ').trim();
    return (document.title || '').split(/\s+[|\u2014\u00b7-]\s+/)[0].trim();
  }
  function initials(n) { return String(n || '').trim().split(/\s+/).map(function (w) { return w[0] || ''; }).slice(0, 2).join('').toUpperCase(); }
  var SUN = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  function chrome() {
    if (document.querySelector('.kdh-bar') || document.getElementById('kdhBar')) return;
    var u = user();
    var isMgr = !!(u && u.role === 'manager');
    var home = u ? (isMgr ? ROOT : REP_HOME) : ROOT;
    var b = document.createElement('div');
    b.id = 'kdhBar'; b.className = 'kdh-bar';
    var acts = '';
    acts += '<a class="kdh-b kdh-back" href="' + home + '">' + BACK + '<span>' + (isMgr ? 'Dashboards' : (u ? 'My dashboards' : 'Dashboards')) + '</span></a>';
    if (isMgr) acts += '<a class="kdh-b kdh-hide-sm" href="' + ROOT + 'team/">Team</a>';
    acts += '<button type="button" class="kdh-b kdh-icon" id="kdhTheme" aria-label="Switch between light and dark mode" title="Light / dark mode">' + SUN + MOON + '</button>';
    if (u && u.name) acts += '<span class="kdh-b kdh-user"><span class="kdh-av">' + esc(initials(u.name)) + '</span><span class="kdh-name">' + esc(u.name) + '</span></span>';
    if (u) acts += '<a class="kdh-b kdh-outline kdh-hide-sm" href="' + ROOT + 'login/?signout=1">Sign out</a>';
    b.innerHTML = '<div class="kdh-bar-in">' +
      '<a class="kdh-logo" href="' + home + '"><img src="' + ROOT + 'assets/kohler-logo-badge.png" alt="">Kohler Dist Hub<small>' + esc(pageName()) + '</small></a>' +
      '<div class="kdh-acts">' + acts + '</div></div>';
    document.body.insertBefore(b, document.body.firstChild);
    var t = document.getElementById('kdhTheme'); if (t) t.addEventListener('click', toggleTheme);
  }
  // Kept for the pages that call it by the old name.
  function backBar() { chrome(); }
  global.kdhUser = user;
  global.kdhSetPreview = setPreview;
  global.kdhPreviewBar = bar;
  global.kdhBackBar = backBar;
  global.kdhChrome = chrome;
  global.kdhToggleTheme = toggleTheme;
  function boot() { chrome(); bar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
