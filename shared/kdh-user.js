/* Kohler Dist Hub -- who is signed in, for the pages.
   /login/ leaves a readable `kdh_user` cookie ({name, role, email, title,
   dm}). A manager can also set `kdh_preview` (from the rep workspace's
   "Preview as this rep", or -- Gavin only -- the manager page's "Preview
   as this manager") and then every page behaves as if that person had
   signed in, with a fixed bar at the bottom to exit. The cookie is a bare
   rep name, or JSON {name, role:'manager', title, dm} for a manager.
   Access is decided by the Vercel middleware from the real login, never
   by these cookies. */
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
        if (p) {
          var o = null; try { o = p.charAt(0) === '{' ? JSON.parse(p) : null; } catch (e2) {}
          if (o && o.role === 'manager' && o.name) return { name: o.name, role: 'manager', preview: true, manager: u.name, email: u.email, title: o.title || '', dm: o.dm || '' };
          return { name: (o && o.name) || p, role: 'rep', preview: true, manager: u.name, email: u.email, title: '', dm: '' };
        }
      }
      return u;
    } catch (e) { return null; }
  }
  // setPreview('Mike Ast') for a rep; setPreview({name, role:'manager', title, dm}) for a manager; setPreview('') to exit.
  function setPreview(v) {
    var val = v && typeof v === 'object' ? JSON.stringify(v) : (v || '');
    document.cookie = 'kdh_preview=' + encodeURIComponent(val) + '; Path=/; Max-Age=' + (val ? 86400 : 0) + '; Secure; SameSite=Lax';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bar() {
    var u = user();
    if (!u || !u.preview || document.getElementById('kdhPreviewBar')) return;
    var b = document.createElement('div');
    b.id = 'kdhPreviewBar';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#12275F;color:#fff;font:600 13.5px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 -4px 16px rgba(0,0,0,.35)';
    b.innerHTML = '<span>Preview: you are seeing the site as <b>' + esc(u.name) + '</b>' + (u.role === 'manager' ? ' (manager)' : '') + '</span>' +
      '<button type="button" style="font:inherit;font-weight:600;background:#F2C14E;color:#141414;border:0;border-radius:8px;padding:7px 12px;cursor:pointer;min-height:36px">Exit preview</button>';
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
    var current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';   // light unless chosen (2026-09-29)
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
  // Who is looking: html.kdh-rep (a signed-in rep, or a manager previewing one)
  // or html.kdh-mgr, so the skin can strip manager-only chrome for reps.
  function markViewer() {
    var u = user(); var root = document.documentElement;
    root.classList.toggle('kdh-rep', !!(u && u.role !== 'manager'));
    root.classList.toggle('kdh-mgr', !!(u && u.role === 'manager'));
  }
  markViewer();
  // WHERE "BACK" GOES (2026-09-29): the place the person came from, named.
  // A manager who reached a dashboard from the rep workspace goes back to
  // the rep workspace, not to the manager home; from the hub, back to the
  // hub (its hash -- the rep and tab -- intact). Remembered per page in
  // sessionStorage so a reload or a direct link keeps the same way back;
  // with no history at all, the person's own home.
  function returnTarget() {
    var u = user();
    var isMgr = !!(u && u.role === 'manager');
    var own = { label: isMgr ? 'Back to Manager Home' : 'Back to Rep Home', href: isMgr ? ROOT : REP_HOME };
    var key = 'kdh_from:' + location.pathname;
    var saved = null; try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) {}
    var t = null;
    try {
      var r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.origin === location.origin && r.pathname !== location.pathname) {
        var rel = ROOT ? r.href.replace(new URL(ROOT, location.href).href, '') : r.pathname.replace(/^\//, '');
        var path = r.pathname;
        if (/\/rep\/?$/.test(path)) t = { label: 'Back to Rep Home', href: REP_HOME };
        else if (path === '/' || /\/index\.html$/.test(path) && path.split('/').length <= 2) t = { label: 'Back to Manager Home', href: ROOT };
        else if (/\/hub\/?/.test(path)) t = { label: 'Back to Incentive Hub', href: r.href };
        else if (/\/team\/?/.test(path)) t = { label: 'Back to Team Activity', href: r.href };
      }
    } catch (e) {}
    // A fresh arrival from one of our pages decides; a reload or a direct
    // link falls back to what this page remembered, then to the own home.
    if (!t && saved && saved.href && saved.label) t = saved;
    if (!t) t = own;
    try { sessionStorage.setItem(key, JSON.stringify(t)); } catch (e) {}
    return t;
  }
  function chrome() {
    markViewer();
    if (document.querySelector('.kdh-bar') || document.getElementById('kdhBar')) return;
    var u = user();
    var isMgr = !!(u && u.role === 'manager');
    var home = u ? (isMgr ? ROOT : REP_HOME) : ROOT;
    var back = returnTarget();
    var b = document.createElement('div');
    b.id = 'kdhBar'; b.className = 'kdh-bar';
    var acts = '';
    acts += '<a class="kdh-b kdh-outline kdh-back" href="' + esc(back.href) + '">' + BACK + '<span>' + esc(back.label) + '</span></a>';
    // The Viewing / Previewing chip is a direct child of the bar (beside the
    // actions, not inside them) so a phone can give it a full row of its own.
    var chips = '<span id="kdhViewing"></span>';
    if (u && u.preview) {
      chips += '<span class="kdh-chip kdh-preview" id="kdhPreviewChip">Previewing <b>' + esc(u.name) + '</b>' + (u.role === 'manager' ? ' (manager)' : '') + '<button type="button" id="kdhExitPreview">Exit preview</button></span>';
    }
    if (isMgr) acts += '<a class="kdh-b kdh-hide-sm" href="' + ROOT + 'team/">Team</a>';
    acts += '<button type="button" class="kdh-b kdh-icon" id="kdhTheme" aria-label="Switch between light and dark mode" title="Light / dark mode">' + SUN + MOON + '</button>';
    // the chip is always the SIGNED-IN person, never the one being previewed
    var who = u ? (u.preview ? u.manager : u.name) : '';
    if (who) acts += '<span class="kdh-b kdh-user" title="Signed in as ' + esc(who) + '"><span class="kdh-av">' + esc(initials(who)) + '</span><span class="kdh-name">' + esc(who) + '</span></span>';
    if (u) acts += '<a class="kdh-b kdh-outline kdh-hide-sm" href="' + ROOT + 'login/?signout=1">Sign out</a>';
    b.innerHTML = '<div class="kdh-bar-in">' +
      '<a class="kdh-logo" href="' + home + '"><img src="' + ROOT + 'assets/kohler-logo-badge.png" alt="">Kohler Dist Hub<small>' + esc(pageName()) + '</small></a>' +
      chips +
      '<div class="kdh-acts">' + acts + '</div></div>';
    document.body.insertBefore(b, document.body.firstChild);
    var t = document.getElementById('kdhTheme'); if (t) t.addEventListener('click', toggleTheme);
    var x = document.getElementById('kdhExitPreview'); if (x) x.addEventListener('click', function () { setPreview(''); location.reload(); });
  }
  // "Viewing <rep>" in the top bar: a manager looking at one rep's page
  // says so next to the way back. changeHref (optional) is where "Change"
  // goes -- the page's own picker. Pass '' to clear.
  function viewing(name, change) {
    var slot = document.getElementById('kdhViewing');
    if (!slot) return;
    var u = user();
    if (!name || !u || u.role !== 'manager' || u.preview) { slot.innerHTML = ''; return; }
    var ctl = typeof change === 'function' ? '<button type="button" id="kdhViewingChange">Change</button>' : (change ? '<a href="' + esc(change) + '">Change</a>' : '');
    slot.innerHTML = '<span class="kdh-chip">Viewing <b>' + esc(name) + '</b>' + ctl + '</span>';
    if (typeof change === 'function') { var b = document.getElementById('kdhViewingChange'); if (b) b.addEventListener('click', change); }
  }
  // Kept for the pages that call it by the old name.
  function backBar() { chrome(); }
  // NAME MATCHING (2026-09-28): the allow list spells a rep the way
  // Encompass does; a tracker may spell them the way iSellBeer or a
  // workbook does ("Daniel La Gala" / "Dan Lagala", "James Heaney" /
  // "Jim Heaney"). Match on canonical first name + surname so a rep is
  // still locked to their own data; return the ROSTER's spelling.
  var NICK = {daniel:'dan',james:'jim',matthew:'matt',nicholas:'nick',michael:'mike',christopher:'chris',robert:'rob',william:'bill',joseph:'joe',jonathan:'jon',kenneth:'ken',timothy:'tim',thomas:'tom',richard:'rich',edward:'ed',andrew:'andy',anthony:'tony',steven:'steve',stephen:'steve',benjamin:'ben',samuel:'sam',alexander:'alex',patrick:'pat',gregory:'greg',jeffrey:'jeff',joshua:'josh',zachary:'zach',charles:'chuck',frederick:'fred',ronald:'ron',donald:'don',douglas:'doug',kevin:'kev',katherine:'kate',elizabeth:'liz',jennifer:'jen',jessica:'jess',rebecca:'becky',danielle:'dani',nicole:'nikki',alexandra:'alex',victoria:'vicky'};
  function nameKey(n) {
    var parts = String(n || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
    if (!parts.length || !parts[0]) return '';
    var first = NICK[parts[0]] || parts[0];
    var last = parts.length > 1 ? parts.slice(1).join('') : '';
    return first + '|' + last;
  }
  function matchName(name, roster) {
    if (!name || !roster || !roster.length) return null;
    if (roster.indexOf(name) >= 0) return name;
    var k = nameKey(name); if (!k) return null;
    for (var i = 0; i < roster.length; i++) if (nameKey(roster[i]) === k) return roster[i];
    // last resort: surname + first initial (one candidate only)
    var fi = k.charAt(0), ln = k.split('|')[1], hits = [];
    if (ln) for (var j = 0; j < roster.length; j++) { var rk = nameKey(roster[j]); if (rk.split('|')[1] === ln && rk.charAt(0) === fi) hits.push(roster[j]); }
    return hits.length === 1 ? hits[0] : null;
  }
  // A rep whose name is on no roster of this page must NOT see everyone's
  // data. Cover the page with a plain notice and a way back.
  function noRoster(pageName) {
    if (document.getElementById('kdhNoRoster')) return;
    var u = user();
    var d = document.createElement('div');
    d.id = 'kdhNoRoster';
    d.style.cssText = 'position:fixed;inset:0;z-index:99990;background:var(--kdh-bg,#F3F5F8);color:var(--kdh-text,#0F172A);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--kdh-body,system-ui,sans-serif)';
    d.innerHTML = '<div style="max-width:460px;background:var(--kdh-surface,#fff);border:1px solid var(--kdh-border,#E2E8F0);border-radius:14px;padding:26px 24px;box-shadow:0 4px 12px rgba(15,23,42,.08)">' +
      '<p style="margin:0 0 6px;font-family:var(--kdh-head,system-ui);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--kdh-text-3,#64748B)">' + esc(pageName || 'This page') + '</p>' +
      '<h1 style="margin:0 0 10px;font-family:var(--kdh-head,system-ui);font-weight:600;font-size:24px;line-height:1.15">We couldn\u2019t find your name here</h1>' +
      '<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:var(--kdh-text-2,#475569)">You\u2019re signed in as <b>' + esc(u && u.name || '') + '</b>, but this page\u2019s list of reps doesn\u2019t include that name yet, so it can\u2019t show your accounts. Ask Gavin to check the spelling on the access list.</p>' +
      '<a href="' + REP_HOME + '" style="display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:8px;background:var(--kdh-brand,#2F5FC4);color:#fff;text-decoration:none;font-weight:600">My dashboards</a></div>';
    (document.body || document.documentElement).appendChild(d);
  }
  global.kdhUser = user;
  global.kdhMatchName = matchName;
  global.kdhNameKey = nameKey;
  global.kdhNoRoster = noRoster;
  // TEAM SCOPE (2026-09-29, Gavin): a district manager sees only their own
  // reps. Given a page's DM groups ([{dm, reps, under?}]), returns {dm, reps}
  // when the signed-in manager (or the manager being previewed) IS one of
  // those DMs -- their reps plus any group filed `under` them (sales
  // support) -- or null for everyone else (a rep, a VP, Gavin), who keep
  // the whole roster. Names match the forgiving way (Michael -> Mike).
  function team(dmGroups) {
    var u = user();
    if (!u || u.role !== 'manager' || !u.name || !dmGroups || !dmGroups.length) return null;
    var me = matchName(u.name, dmGroups.map(function (g) { return g.dm; }));
    if (!me) return null;
    var reps = [];
    dmGroups.forEach(function (g) { if (g.dm === me || g.under === me) reps = reps.concat(g.reps || []); });
    return { dm: me, reps: reps };
  }
  // The same question for a page that only has DM names (the tap tracker):
  // the matching DM name, or null.
  function dmName(dmNames) {
    var u = user();
    if (!u || u.role !== 'manager' || !u.name || !dmNames || !dmNames.length) return null;
    return matchName(u.name, dmNames);
  }
  // Encompass "reps" that are house accounts, not people (2026-09-29, per
  // Gavin): never offered in a rep list.
  var NOT_REPS = ['default', 'office tell sell'];
  function isRep(name) { return NOT_REPS.indexOf(String(name || '').trim().toLowerCase()) < 0; }
  global.kdhIsRep = isRep;
  global.kdhTeam = team;
  global.kdhDmName = dmName;
  global.kdhSetPreview = setPreview;
  global.kdhPreviewBar = bar;
  global.kdhBackBar = backBar;
  global.kdhViewing = viewing;
  global.kdhReturnTarget = returnTarget;
  global.kdhChrome = chrome;
  global.kdhToggleTheme = toggleTheme;
  // READABLE ON A PHONE (2026-09-29): nothing on any page renders below
  // 12.5px. The dashboards were written for desktops with 10-11px captions;
  // rather than chase every class, lift any visible text that computes
  // smaller, and keep doing so as pages re-render.
  var MIN_PX = 12.5;
  function liftSmallType(root) {
    try {
      var els = (root || document.body).querySelectorAll('body *:not(script):not(style):not(svg):not(svg *)');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.__kdhLifted) continue;
        var hasText = false;
        for (var c = el.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3 && c.nodeValue.trim().length > 1) { hasText = true; break; } }
        if (!hasText) continue;
        var fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs && fs < MIN_PX) { el.style.setProperty('font-size', MIN_PX + 'px', 'important'); }
        el.__kdhLifted = true;
      }
    } catch (e) {}
  }
  var liftTimer = null;
  function watchType() {
    liftSmallType();
    if (!window.MutationObserver) return;
    new MutationObserver(function () { clearTimeout(liftTimer); liftTimer = setTimeout(function () { liftSmallType(); }, 80); })
      .observe(document.body, { childList: true, subtree: true });
  }
  function boot() { chrome(); bar(); watchType(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
