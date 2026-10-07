/* Kohler Distribution Hub -- who is signed in, for the pages.
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
  // The account assistant keeps its transcripts in sessionStorage under
  // kdh_ask:<viewer>:<account>; a change of who we are looking as drops them
  // all so the next person (or the manager back in their own shoes) starts clean.
  function forgetAsk() { try { Object.keys(sessionStorage).filter(function (k) { return k.indexOf('kdh_ask:') === 0; }).forEach(function (k) { sessionStorage.removeItem(k); }); } catch (e) {} }
  function setPreview(v) {
    forgetAsk();
    forgetNav();
    var val = v && typeof v === 'object' ? JSON.stringify(v) : (v || '');
    document.cookie = 'kdh_preview=' + encodeURIComponent(val) + '; Path=/; Max-Age=' + (val ? 86400 : 0) + '; Secure; SameSite=Lax';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // THE PREVIEW INDICATOR (2026-09-30): one small chip in the top bar --
  // "Previewing Mike Ast · Exit" -- on every page, phone and desktop. The
  // old fixed bar along the bottom of the screen is gone (it doubled the
  // chip and covered the page). bar() only makes sure a page that carries
  // its own .kdh-bar-in markup gets the chip too.
  function bar() {
    var u = user();
    if (!u || !u.preview) return;
    if (document.getElementById('kdhPreviewChip')) return;
    var host = document.querySelector('.kdh-bar-in'); if (!host) return;
    var s = document.createElement('span'); s.id = 'kdhPreviewChip'; s.className = 'kdh-chip kdh-preview';
    s.innerHTML = previewChipHtml(u);
    var acts = host.querySelector('.kdh-acts');
    host.insertBefore(s, acts || null);
    wireExit();
  }
  function previewChipHtml(u) {
    return '<span>Previewing <b>' + esc(u.name) + '</b>' + (u.role === 'manager' ? ' (manager)' : '') + '</span><button type="button" id="kdhExitPreview">Exit</button>';
  }
  // Leaving preview puts the manager back on their own home page: their
  // identity and permissions never changed, only what the pages showed.
  function exitPreview() { setPreview(''); location.href = ROOT || '/'; }
  function wireExit() { var x = document.getElementById('kdhExitPreview'); if (x && !x.__kdh) { x.__kdh = 1; x.addEventListener('click', exitPreview); } }
  // Site root, worked out from where this script was loaded (../shared/ or
  // ../../shared/), so the same file works on kohlerdisthub.com and github.io.
  var ROOT = (function () {
    try { var src = (document.currentScript && document.currentScript.src) || ''; var i = src.indexOf('shared/kdh-user.js'); return i > 0 ? src.slice(0, i) : ''; } catch (e) { return ''; }
  })();
  var REP_HOME = ROOT + 'rep/';

  // THEME (2026-09-30): the saved choice (localStorage kdh_theme = 'dark' |
  // 'light') wins; with no choice the DEVICE setting applies and the page
  // follows it live. data-theme is ALWAYS set explicitly on <html>, so every
  // stylesheet keys on [data-theme="dark"] alone (no prefers-color-scheme
  // rules needed). Each page also runs the same logic inline in <head>
  // before first paint (see shared/README.txt), so nothing flashes.
  var MQ = (function () { try { return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { return null; } })();
  function savedTheme() { try { var t = localStorage.getItem('kdh_theme'); return (t === 'dark' || t === 'light') ? t : ''; } catch (e) { return ''; } }
  function deviceTheme() { return MQ && MQ.matches ? 'dark' : 'light'; }
  // the browser / phone status-bar tint follows the theme: the top bar's own surface (2026-10-07)
  function themeColor(t) {
    try { var m = document.querySelector('meta[name="theme-color"]');
      if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
      m.setAttribute('content', t === 'dark' ? '#111C36' : '#FFFFFF'); } catch (e) {}
  }
  function setThemeAttr(t) { document.documentElement.setAttribute('data-theme', t); themeColor(t); document.dispatchEvent(new CustomEvent('kdh:theme', { detail: t })); }
  function applyTheme() { setThemeAttr(savedTheme() || deviceTheme()); }
  // chooseTheme('dark'|'light') saves a choice; chooseTheme('') goes back to the device setting
  function chooseTheme(t) {
    try { if (t === 'dark' || t === 'light') localStorage.setItem('kdh_theme', t); else localStorage.removeItem('kdh_theme'); } catch (e) {}
    applyTheme(); themeLabel();
  }
  function toggleTheme() { chooseTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
  applyTheme();
  if (MQ) { var onMq = function () { if (!savedTheme()) { applyTheme(); themeLabel(); } }; if (MQ.addEventListener) MQ.addEventListener('change', onMq); else if (MQ.addListener) MQ.addListener(onMq); }
  window.kdhTheme = { choose: chooseTheme, toggle: toggleTheme, saved: savedTheme, current: function () { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; } };

  // THE SITE CHROME (2026-09-28): one top bar on every dashboard, the same
  // one the rep workspace, manager page and team page carry in their own
  // markup (shared/kdh.css, .kdh-bar). Logo -> the person's landing page,
  // the page's name, a "Dashboards" link back, the light/dark toggle, who
  // is signed in, Sign out. Skipped on pages that already have a .kdh-bar.
  // Without a sign-in (github.io) it still shows the logo, name and toggle.
  function pageName(u) {
    var m = document.querySelector('meta[name="kdh-page"]');
    // a page can name itself differently for a manager ("My Accounts" / "Accounts")
    if (m && u && u.role === 'manager' && m.getAttribute('data-manager')) return m.getAttribute('data-manager');
    if (m && m.content) return m.content;
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
  // THE TOP BAR (2026-09-30): badge, the page name, the Viewing / Previewing
  // chip, a Back button that names where it goes, and ONE account button
  // (avatar) that opens the account menu -- View as rep, Manager home,
  // Team activity, Rep home, light/dark, Sign out. Theme and sign-out left
  // the bar itself so a phone shows the badge, Back and the avatar and
  // nothing fights for the width. A landing page marks itself
  // <meta name="kdh-home"> and gets no Back button.
  var CARET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function isHomePage() { return !!document.querySelector('meta[name="kdh-home"]'); }
  // ==== THE APP SHELL (2026-10-02, after Shopify iOS's tab bar and Todoist
  // web's labelled sidebar) ====
  // One set of destinations, two forms. Under 1024px a bottom tab bar with
  // icon + label: reps Home / My Accounts / Programs / More, managers
  // Home / Accounts / Programs / Team / More. From 1024px a fixed labelled
  // sidebar with the same places spelled out (Programs' three experiences,
  // the trackers, the manager's tools) and the account button at its foot.
  // "More" opens the one account menu as a sheet: preview controls, the
  // trackers, theme, sign out -- there is no second menu. Back stays in
  // the top bar and only ever names a contextual destination.
  // Every icon is the same 24px stroke family.
  var I = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var NAV_ICON = {
    home: I('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
    accounts: I('<path d="M3 9.5 4.5 4h15L21 9.5"/><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/><path d="M10 21v-5h4v5"/>'),
    programs: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    team: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>'),
    inventory: I('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'),
    exc: I('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
    perf: I('<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-6"/><path d="M21 20H3"/>'),
    merch: I('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    more: I('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
    tap: I('<path d="M12 2.7 6.5 9a6.5 6.5 0 1 0 11 0z"/>'),
    rb: I('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
    cb: I('<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
    off: I('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>'),
    on: I('<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M5 8h12v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M9 12v5M13 12v5"/>'),
    inc: I('<path d="M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/><path d="M8.2 13.9 7 22l5-3 5 3-1.2-8.1"/>'),
    ws: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>'),
    eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    out: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>')
  };
  NAV_ICON.invm = NAV_ICON.inventory;
  // ---- remembered places, scoped to who is looking ----
  // A list's search / filters / rep, the Programs tab and screen, are kept
  // per tab in sessionStorage under kdh_nav:<scope>:<key>, where <scope> is
  // the signed-in person plus the preview (if any). Coming back through the
  // navigation lands where you left; another person, or another preview,
  // never inherits it (setPreview drops them all).
  function scopeId(u) { u = u || user(); if (!u) return ''; var me = u.preview ? (u.manager || '') + '/' + (u.email || '') : (u.email || u.name || ''); return me + '|' + (u.preview ? u.role + ':' + u.name : ''); }
  function remember(key, href) { try { var sc = scopeId(); if (sc) sessionStorage.setItem('kdh_nav:' + sc + ':' + key, href); } catch (e) {} }
  function recall(key) { try { var sc = scopeId(); return sc ? sessionStorage.getItem('kdh_nav:' + sc + ':' + key) : null; } catch (e) { return null; } }
  function forgetNav() { try { Object.keys(sessionStorage).filter(function (k) { return k.indexOf('kdh_nav:') === 0 || k.indexOf('kdh_acct') === 0 || k.indexOf('kdh_from:') === 0; }).forEach(function (k) { sessionStorage.removeItem(k); }); } catch (e) {} }
  function progDefault(u) { return ROOT + 'hub/' + (u.role === 'manager' ? '' : '#view=rep&rep=' + encodeURIComponent(u.name) + '&cat=inc'); }
  function navItems(u) {
    if (!u) return [];
    var isMgr = u.role === 'manager';
    var items = [
      { key: 'home', label: 'Home', href: isMgr ? ROOT : REP_HOME },
      { key: 'accounts', label: isMgr ? 'Accounts' : 'My Accounts', href: ROOT + 'accounts/' },
      { key: 'programs', label: 'Programs', href: progDefault(u) },
      // What Can I Sell (2026-10-02): units only, no cost / value / margin -- safe for reps
      { key: 'inventory', label: 'Inventory', href: ROOT + 'inventory/' }
    ];
    if (isMgr) items.push({ key: 'team', label: 'Team', href: ROOT + 'team/' });
    return items;
  }
  // the authorized tools that sit behind More (phones) / in the sidebar (desktop)
  function toolItems(u) {
    var isMgr = u.role === 'manager';
    var t = [
      { key: 'off', group: 'Programs', label: 'Off-Premise MPOs', href: ROOT + 'MPOs/off-prem/index.html' },
      { key: 'on', group: 'Programs', label: 'On-Premise MPOs', href: ROOT + 'MPOs/on-prem/index.html' },
      { key: 'tap', group: 'Trackers', label: 'Tap Tracker', href: ROOT + 'isellbeer/tap-survey-tracking/' },
      { key: 'rb', group: 'Trackers', label: 'Red Bull Tracker', href: ROOT + 'redbull/' },
      { key: 'cb', group: 'Trackers', label: 'Carbliss Leaderboard', href: ROOT + 'carbliss-onprem-targets/' }
    ];
    if (isMgr) t.push({ key: 'invm', group: 'Manager', label: 'Inventory', href: ROOT + 'inventory/', menuOnly: true });
    if (isMgr) t.push({ key: 'exc', group: 'Manager', label: 'Exceptions', href: ROOT + 'exceptions/' });
    if (isMgr) t.push({ key: 'merch', group: 'Manager', label: 'Merchandising', href: ROOT + 'merchandising/' });
    if (isMgr) t.push({ key: 'perf', group: 'Manager', label: 'Incentive Performance', href: ROOT + 'performance/' });
    if (isMgr) t.push({ key: 'ws', group: 'Manager', label: 'Rep Workspace', href: REP_HOME });
    return t;
  }
  // where this page sits: {nav: primary key, tool: tool key or ''}
  function where(u) {
    var isMgr = u && u.role === 'manager';
    var rel = ROOT ? location.href.replace(new URL(ROOT, location.href).href, '') : location.pathname.replace(/^\//, '');
    rel = rel.split(/[?#]/)[0];
    if (/^accounts\//.test(rel)) return { nav: 'accounts', tool: '' };
    if (/^hub\//.test(rel)) {   // the hub's MPO tabs mark their MPO item (2026-10-06)
      var cat = (location.hash.match(/[#&]cat=([^&]+)/) || [])[1];
      return { nav: 'programs', tool: cat === 'off' ? 'off' : cat === 'on' ? 'on' : 'inc' };
    }
    if (/^MPOs\/off-prem\//.test(rel)) return { nav: 'programs', tool: 'off' };
    if (/^MPOs\/on-prem\//.test(rel)) return { nav: 'programs', tool: 'on' };
    if (/^team\//.test(rel)) return { nav: 'team', tool: '' };
    if (/^performance\//.test(rel)) return { nav: 'more', tool: 'perf' };
    if (/^exceptions\//.test(rel)) return { nav: 'more', tool: 'exc' };
    if (/^merchandising\//.test(rel)) return { nav: 'more', tool: 'merch' };
    if (/^inventory\//.test(rel)) return { nav: 'inventory', tool: isMgr ? 'invm' : '' };
    if (/^isellbeer\/tap-survey-tracking\//.test(rel)) return { nav: 'more', tool: 'tap' };
    if (/^redbull\//.test(rel)) return { nav: 'more', tool: 'rb' };
    if (/^carbliss-onprem-targets\//.test(rel)) return { nav: 'more', tool: 'cb' };
    if (/^rep\//.test(rel)) return isMgr ? { nav: 'more', tool: 'ws' } : { nav: 'home', tool: '' };
    if (rel === '' || rel === 'index.html') return { nav: isMgr ? 'home' : '', tool: '' };
    return { nav: 'home', tool: '' };   // a manager dashboard: it opens from Manager Home
  }
  function navCurrent(u) { return where(u).nav; }
  function link(cls, it, on, extra) {
    return '<a class="' + cls + (on ? ' on' : '') + '" href="' + esc(it.href) + '" data-nav="' + it.key + '"' + (on ? ' aria-current="page"' : '') + (extra || '') + '>' + (NAV_ICON[it.key] || '') + '<span>' + esc(it.label) + '</span></a>';
  }
  function navHtml(u, cls) { var w = where(u); return navItems(u).map(function (it) { return link(cls, it, it.key === w.nav); }).join(''); }
  // the bottom tab bar (CSS shows it under 1024px); a page with its own
  // bottom navigation opts out with <meta name="kdh-tabs" content="off">
  function shellOff() { var off = document.querySelector('meta[name="kdh-tabs"]'); return !!(off && off.content === 'off'); }
  function tabBar(u) {
    if (!u || document.getElementById('kdhTabs') || shellOff()) return;
    var w = where(u);
    var t = document.createElement('nav');
    t.id = 'kdhTabs'; t.className = 'kdh-tabs'; t.setAttribute('aria-label', 'Main');
    var isMgr = u.role === 'manager';
    var tabs = navItems(u).filter(function (it) { return !(isMgr && it.key === 'inventory'); });
    // the bottom bar says "Accounts" (2026-10-08): "My Accounts" truncated to "My Acco..." on a 390px phone;
    // the sidebar and the page title keep "My Accounts" and the link's aria-label carries the full name
    t.innerHTML = '<div class="kdh-tabs-in">' + tabs.map(function (it) { return it.key === 'accounts' && it.label === 'My Accounts' ? link('kdh-tab', {key: it.key, href: it.href, label: 'Accounts'}, it.key === w.nav, ' aria-label="My Accounts"') : link('kdh-tab', it, it.key === w.nav); }).join('') +
      '<button type="button" class="kdh-tab' + (w.nav === 'more' ? ' on' : '') + '" id="kdhMoreBtn" aria-haspopup="true" aria-expanded="false"' + (w.nav === 'more' ? ' aria-current="page"' : '') + '>' + NAV_ICON.more + '<span>More</span></button></div>';
    document.body.appendChild(t);
    document.documentElement.classList.add('kdh-has-tabs');
  }
  // the desktop sidebar (CSS shows it from 1024px)
  // A page that changes its own URL (the hub, by pushState) calls kdhSyncNav()
  // after each render so the sidebar marks where the person is now.
  var SIDE_U = null;
  function syncSide() {
    var s = document.getElementById('kdhSide'); if (!s || !SIDE_U) return;
    var w = where(SIDE_U), main = {};
    navItems(SIDE_U).forEach(function (it) { main[it.key] = 1; });
    Array.prototype.forEach.call(s.querySelectorAll('a[data-nav]'), function (a) {
      var k = a.getAttribute('data-nav');
      var on = (a.classList.contains('sub') || !main[k]) ? w.tool === k : (k === w.nav && (!w.tool || k !== 'programs' || w.tool === 'inc'));
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  window.kdhSyncNav = syncSide;
  function sideBar(u, who) {
    if (!u || document.getElementById('kdhSide') || shellOff()) return;
    SIDE_U = u;
    var w = where(u), isMgr = u.role === 'manager';
    var home = isMgr ? ROOT : REP_HOME;
    var groups = {}; toolItems(u).forEach(function (t) { (groups[t.group] = groups[t.group] || []).push(t); });
    var html = '<a class="kdh-side-logo" href="' + home + '" aria-label="Kohler Distribution Hub home"><img src="' + ROOT + 'assets/kohler-logo-badge.png" alt="" width="40" height="48"><span class="kdh-lock"><b>Kohler</b><small>Distribution Hub</small></span></a><nav class="kdh-side-nav" aria-label="Main">';
    navItems(u).forEach(function (it) {
      html += link('kdh-side-i', it, it.key === w.nav && (!w.tool || it.key !== 'programs' || w.tool === 'inc'));
      if (it.key === 'programs') {
        html += '<div class="kdh-side-sub">' + link('kdh-side-i sub', { key: 'inc', label: 'Incentives', href: progDefault(u) }, w.tool === 'inc', ' data-navto="programs"') +
          (groups.Programs || []).map(function (t) { return link('kdh-side-i sub', t, w.tool === t.key); }).join('') + '</div>';
      }
    });
    ['Trackers', 'Manager'].forEach(function (g) {
      if (!groups[g]) return;
      var list = groups[g].filter(function (t) { return !t.menuOnly; });
      if (!list.length) return;
      html += '<div class="kdh-side-h">' + g + '</div>' + list.map(function (t) { return link('kdh-side-i', t, w.tool === t.key); }).join('');
    });
    html += '</nav>';
    if (who) html += '<div class="kdh-side-foot"><button type="button" class="kdh-side-user" id="kdhMenuBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu, signed in as ' + esc(who) + '"><span class="kdh-av">' + esc(initials(who)) + '</span><span class="kdh-side-who"><b>' + esc(who) + '</b><small>' + (isMgr || u.preview ? 'Manager' : 'Sales Rep') + '</small></span>' + CARET + '</button></div>';
    var a = document.createElement('aside');
    a.id = 'kdhSide'; a.className = 'kdh-side'; a.innerHTML = html;
    document.body.insertBefore(a, document.body.firstChild);
    document.documentElement.classList.add('kdh-has-side');
  }
  // a click on a destination resolves the remembered place at click time
  // (an Account page's "My Accounts" goes back to the list as it was left)
  function wireNav() {
    if (document.__kdhNav) return; document.__kdhNav = 1;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-nav]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      var key = a.getAttribute('data-navto') || a.getAttribute('data-nav');
      if (key !== 'accounts' && key !== 'programs') return;
      var r = recall(key); if (!r) return;
      e.preventDefault();
      // on the same page a hash change is enough; the page listens for it
      var dest = new URL(r, location.href);
      if (dest.pathname === location.pathname && dest.hash === location.hash && key === 'accounts') { location.hash = '#'; location.hash = dest.hash || '#'; return; }
      location.href = dest.href;
    });
  }
  // NOT-REAL-TIME NOTICE (2026-10-05, Gavin): reps are told on every page, in
  // plain words, that this site is not live and where the live numbers are.
  // Shown to reps (and a manager previewing one), never dismissible, right
  // under the top bar. Remove it by deleting this function and its call.
  var LIVE_URL = 'https://kohlerdist.encompass8.com/Home?DashboardID=184193';
  function liveNotice(u, isMgr, bar) {
    if (!u || isMgr || document.getElementById('kdhLive')) return;
    if (!document.getElementById('kdhLiveCss')) {
      var st = document.createElement('style'); st.id = 'kdhLiveCss';
      st.textContent = '#kdhLive{box-sizing:border-box;margin:0;padding:10px 16px;background:#FFE08A;color:#2B1B00;border-top:1px solid #B45309;border-bottom:4px solid #B45309;font:15px/1.4 var(--kdh-body,system-ui,sans-serif);display:flex;gap:12px;align-items:center;justify-content:center}' +
        '#kdhLive .lv-i{flex:none;width:24px;height:24px;border-radius:50%;background:#B45309;color:#fff;font-weight:800;font-size:15px;line-height:24px;text-align:center}' +
        '#kdhLive .lv-t{max-width:880px}#kdhLive .lv-t a{display:inline-block;padding:10px 2px;margin:-10px 0}#kdhLive b{font-weight:700;font-size:15px;letter-spacing:0}' +
        '#kdhLive a{color:#6B2A00;font-weight:700;text-decoration:underline;word-break:break-all}' +
        ':root[data-theme="dark"] #kdhLive{background:#4A3300;color:#FFF1C7;border-color:#F0A93B}' +
        ':root[data-theme="dark"] #kdhLive .lv-i{background:#F0A93B;color:#2B1B00}' +
        ':root[data-theme="dark"] #kdhLive a{color:#FFD27A}' +
        '@media print{#kdhLive{display:none}}';
      document.head.appendChild(st);
    }
    var n = document.createElement('div');
    n.id = 'kdhLive'; n.setAttribute('role', 'alert');
    n.innerHTML = '<span class="lv-i" aria-hidden="true">!</span><div class="lv-t"><b>Not Real Time.</b> For live incentive and MPO data, ' +
      '<a href="' + LIVE_URL + '" target="_blank" rel="noopener">Open Encompass</a>.</div>';
    bar.parentNode.insertBefore(n, bar.nextSibling);
  }
  function chrome() {
    markViewer();
    if (document.querySelector('.kdh-bar') || document.getElementById('kdhBar')) return;
    var u = user();
    var isMgr = !!(u && u.role === 'manager');
    var home = u ? (isMgr ? ROOT : REP_HOME) : ROOT;
    var b = document.createElement('div');
    b.id = 'kdhBar'; b.className = 'kdh-bar';
    var acts = '';
    // BACK: concise, contextual, and only when it adds a destination the
    // navigation does not already show (the Incentive Hub a tracker was
    // opened from, Team Activity, the rep workspace).
    if (!isHomePage()) {
      var back = returnTarget();
      var dup = u && (back.href === home || back.href === (isMgr ? ROOT : REP_HOME) || /Back to (Rep|Manager) Home/.test(back.label) && back.href === home);
      if (!u || !dup) acts += '<a class="kdh-b kdh-outline kdh-back" href="' + esc(back.href) + '">' + BACK + '<span>' + esc(back.label.replace(/^Back to /, '')) + '</span></a>';
    }
    var chips = '<span id="kdhViewing"></span>';
    if (u && u.preview) chips += '<span class="kdh-chip kdh-preview" id="kdhPreviewChip">' + previewChipHtml(u) + '</span>';
    // the account button is always the SIGNED-IN person, never the one being previewed
    var who = u ? (u.preview ? u.manager : u.name) : '';
    acts += '<button type="button" class="kdh-b kdh-outline kdh-theme" id="kdhThemeBtn" role="switch" aria-checked="false" aria-label="Dark mode" title="Switch between light and dark">' + SUN + MOON + '<span id="kdhThemeText">Light</span></button>';
    // without a sign-in there is no shell, so the menu button stays in the bar
    if (who && shellOff()) acts += '<button type="button" class="kdh-b kdh-user" id="kdhMenuBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu, signed in as ' + esc(who) + '"><span class="kdh-av">' + esc(initials(who)) + '</span><span class="kdh-name">' + esc(who) + '</span>' + CARET + '</button>';
    b.innerHTML = '<div class="kdh-bar-in">' +
      '<a class="kdh-logo" href="' + home + '"><img src="' + ROOT + 'assets/kohler-logo-badge.png" alt="Kohler Distributing" width="32" height="32"><span class="kdh-word">Kohler Distribution Hub</span><small>' + esc(pageName(u)) + '</small></a>' +
      chips +
      '<div class="kdh-acts">' + acts + '</div></div>' +
      (who ? menuHtml(u, isMgr) : '');
    document.body.insertBefore(b, document.body.firstChild);
    liveNotice(u, isMgr, b);
    // the menu lives on <body>: the bar's backdrop blur would trap a fixed sheet inside it
    var mn = document.getElementById('kdhMenu'); if (mn) document.body.appendChild(mn);
    sideBar(u, who);
    tabBar(u);
    var t = document.getElementById('kdhTheme'); if (t) t.addEventListener('click', function () { toggleTheme(); });
    var tb = document.getElementById('kdhThemeBtn'); if (tb) tb.addEventListener('click', toggleTheme);
    var td = document.getElementById('kdhThemeDevice'); if (td) td.addEventListener('click', function () { chooseTheme(''); openMenu(false); });
    themeLabel();
    wireExit();
    wireMenu();
    wireNav();
  }
  // ---- the ONE account menu: More on phones / iPads, the sidebar's account button on desktop ----
  function menuHtml(u, isMgr) {
    var who = u.preview ? u.manager : u.name;
    var role = isMgr || u.preview ? 'Manager' : 'Sales Rep';
    var w = where(u);
    var items = '';
    if (isMgr || u.preview) {
      items += '<button type="button" class="kdh-menu-i" id="kdhViewAsRep">' + NAV_ICON.eye + '<span>' + (u.preview && u.role !== 'manager' ? 'Change Rep' : 'View as Rep') + '</span><small>See the site as one rep does</small></button>';
      if (u.preview) items += '<button type="button" class="kdh-menu-i" id="kdhExitPreview2">' + BACK + '<span>Exit Preview</span><small>Back to your own pages</small></button>';
    }
    // the tools: listed here for phones and iPads; the desktop sidebar shows them itself
    var tools = toolItems(u), groups = [];
    tools.forEach(function (t) { if (groups.indexOf(t.group) < 0) groups.push(t.group); });
    items += '<div class="kdh-menu-tools">' + groups.map(function (g) {
      return '<div class="kdh-menu-g">' + g + '</div>' + tools.filter(function (t) { return t.group === g; }).map(function (t) {
        return '<a class="kdh-menu-i' + (w.tool === t.key ? ' on' : '') + '" href="' + esc(t.href) + '"' + (w.tool === t.key ? ' aria-current="page"' : '') + '>' + (NAV_ICON[t.key] || '') + '<span>' + esc(t.label) + '</span></a>';
      }).join('');
    }).join('') + '<div class="kdh-menu-g">Settings</div></div>';
    items += '<button type="button" class="kdh-menu-i" id="kdhTheme">' + SUN + MOON + '<span id="kdhThemeLabel">Dark Mode</span></button>';
    items += '<button type="button" class="kdh-menu-i" id="kdhThemeDevice" hidden><span>Use Device Theme</span><small>Follow this device\'s light / dark setting</small></button>';
    items += '<a class="kdh-menu-i" href="' + ROOT + 'login/?signout=1">' + NAV_ICON.out + '<span>Sign Out</span></a>';
    return '<div class="kdh-menu" id="kdhMenu" hidden role="menu" aria-label="More"><div class="kdh-menu-h"><b>' + esc(who) + '</b><span>' + role + (u.email ? ' · ' + esc(u.email) : '') + '</span><button type="button" class="kdh-menu-x" id="kdhMenuClose">Close</button></div><div class="kdh-menu-body">' + items + '</div></div>';
  }
  function themeLabel() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var l = document.getElementById('kdhThemeLabel'); if (l) l.textContent = dark ? 'Light Mode' : 'Dark Mode';
    var b = document.getElementById('kdhThemeBtn'); if (b) { b.setAttribute('aria-checked', dark ? 'true' : 'false'); b.title = dark ? 'Dark mode is on. Switch to light' : 'Light mode is on. Switch to dark'; }
    var x = document.getElementById('kdhThemeText'); if (x) x.textContent = dark ? 'Dark' : 'Light';
    var d = document.getElementById('kdhThemeDevice'); if (d) d.hidden = !savedTheme();
  }
  function openMenu(on) {
    var m = document.getElementById('kdhMenu'); if (!m) return;
    m.hidden = !on;
    ['kdhMenuBtn', 'kdhMoreBtn'].forEach(function (id) { var x = document.getElementById(id); if (x) x.setAttribute('aria-expanded', on ? 'true' : 'false'); });
    document.documentElement.classList.toggle('kdh-menu-open', !!on);
    if (on) themeLabel();
  }
  function wireMenu() {
    var btns = ['kdhMenuBtn', 'kdhMoreBtn'].map(function (id) { return document.getElementById(id); }).filter(function (x) { return x && !x.__kdh; });
    if (!btns.length) return;
    btns.forEach(function (btn) { btn.__kdh = 1; btn.addEventListener('click', function (e) { e.stopPropagation(); var m = document.getElementById('kdhMenu'); openMenu(!!(m && m.hidden)); }); });
    var mc = document.getElementById('kdhMenuClose'); if (mc) mc.addEventListener('click', function (e) { e.stopPropagation(); openMenu(false); });
    if (document.__kdhMenuDoc) return; document.__kdhMenuDoc = 1;
    document.addEventListener('click', function (e) { var m = document.getElementById('kdhMenu'); if (m && !m.hidden && !m.contains(e.target)) openMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { openMenu(false); closePicker(); } });
    var v = document.getElementById('kdhViewAsRep'); if (v) v.addEventListener('click', function () { openMenu(false); viewAsRep(); });
    var x2 = document.getElementById('kdhExitPreview2'); if (x2) x2.addEventListener('click', exitPreview);
    themeLabel();
  }
  // ---- "View as rep": a searchable rep picker (2026-09-30) ----
  // A manager picks a rep and the whole site shows what that rep sees
  // (the kdh_preview cookie), starting on the rep's home page. The roster
  // is the DM groups file (shared/dm-groups.js, loaded on demand); a
  // district manager only sees their own team. Reads on the page are the
  // rep's own -- writes (Done / Follow up / Not now) stay off in preview.
  function loadGroups(cb) {
    if (global.KDH_DM_GROUPS) return cb(global.KDH_DM_GROUPS);
    var s = document.createElement('script'); s.src = ROOT + 'shared/dm-groups.js';
    s.onload = function () { cb(global.KDH_DM_GROUPS || []); }; s.onerror = function () { cb([]); };
    document.head.appendChild(s);
  }
  function closePicker() { var p = document.getElementById('kdhPicker'); if (p) p.hidden = true; }
  function viewAsRep() {
    var u = user(); if (!u || u.role !== 'manager') return;
    var p = document.getElementById('kdhPicker');
    if (!p) {
      p = document.createElement('div'); p.id = 'kdhPicker'; p.className = 'kdh-sheet-wrap';
      p.innerHTML = '<div class="kdh-sheet-back"></div><div class="kdh-sheet" role="dialog" aria-modal="true" aria-labelledby="kdhPickerTitle">' +
        '<div class="kdh-sheet-h"><b id="kdhPickerTitle">View as Rep</b><button type="button" class="kdh-sheet-x" aria-label="Close">Close</button></div>' +
        '<p class="kdh-sheet-p">Every page will show exactly what this rep sees. Their notes and follow-ups stay read-only while you preview.</p>' +
        '<input type="search" id="kdhPickerSearch" class="kdh-field" placeholder="Search reps" autocomplete="off" aria-label="Search reps">' +
        '<div id="kdhPickerList" class="kdh-sheet-list"><div class="kdh-sheet-empty">Loading reps…</div></div></div>';
      document.body.appendChild(p);
      p.querySelector('.kdh-sheet-back').addEventListener('click', closePicker);
      p.querySelector('.kdh-sheet-x').addEventListener('click', closePicker);
      p.addEventListener('click', function (e) { var b = e.target.closest('[data-rep]'); if (!b) return; setPreview(b.getAttribute('data-rep')); location.href = REP_HOME; });
      document.getElementById('kdhPickerSearch').addEventListener('input', function () { renderPicker(this.value); });
    }
    p.hidden = false;
    var inp = document.getElementById('kdhPickerSearch'); inp.value = '';
    loadGroups(function (groups) {
      var T = team(groups);
      pickerGroups = (T ? groups.filter(function (g) { return g.dm === T.dm || g.under === T.dm; }) : groups)
        .map(function (g) { return { dm: g.dm, reps: (g.reps || []).filter(isRep).slice().sort() }; }).filter(function (g) { return g.reps.length; });
      renderPicker('');
      if (window.innerWidth >= 700) setTimeout(function () { inp.focus(); }, 50);
    });
  }
  var pickerGroups = [];
  function renderPicker(q) {
    var list = document.getElementById('kdhPickerList'); if (!list) return;
    var cur = user(); var now = cur && cur.preview && cur.role !== 'manager' ? cur.name : '';
    q = String(q || '').trim().toLowerCase();
    var html = '';
    pickerGroups.forEach(function (g) {
      var reps = g.reps.filter(function (r) { return !q || r.toLowerCase().indexOf(q) >= 0 || g.dm.toLowerCase().indexOf(q) >= 0; });
      if (!reps.length) return;
      html += '<div class="kdh-sheet-dm">' + esc(g.dm) + '</div>' + reps.map(function (r) {
        return '<button type="button" class="kdh-sheet-i' + (r === now ? ' on' : '') + '" data-rep="' + esc(r) + '"><span class="kdh-av">' + esc(initials(r)) + '</span><span>' + esc(r) + '</span>' + (r === now ? '<small>Previewing now</small>' : '') + '</button>';
      }).join('');
    });
    list.innerHTML = html || '<div class="kdh-sheet-empty">No rep matches “' + esc(q) + '”.</div>';
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
    slot.innerHTML = '<span class="kdh-chip"><span>Viewing <b>' + esc(name) + '</b></span>' + ctl + '</span>';
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
  global.kdhViewAsRep = viewAsRep;
  global.kdhExitPreview = exitPreview;
  global.kdhReturnTarget = returnTarget;
  global.kdhChrome = chrome;
  global.kdhRemember = remember;
  global.kdhRecall = recall;
  global.kdhScope = function () { return scopeId(); };
  global.kdhToggleTheme = toggleTheme;
  // READABLE ON A PHONE (2026-09-29): nothing on any page renders below
  // 12.5px. The dashboards were written for desktops with 10-11px captions;
  // rather than chase every class, lift any visible text that computes
  // smaller, and keep doing so as pages re-render.
  var MIN_PX = 13;
  function liftSmallType(root) {
    try {
      var els = (root || document.body).querySelectorAll('body *:not(script):not(style):not(svg):not(svg *)');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.__kdhLifted) continue;
        var hasText = false;
        for (var c = el.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3 && c.nodeValue.trim().length > 1) { hasText = true; break; } }
        if (!hasText) continue;
        var cs = getComputedStyle(el), fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10) || 400;
        if (fs && fs < MIN_PX) { el.style.setProperty('font-size', MIN_PX + 'px', 'important'); fs = MIN_PX; }
        // WEIGHT (2026-10-01): one restrained scale on every page. Titles,
        // labels and values top out at 600; only a headline number drawn at
        // 30px or more keeps 700. Pages wrote 700-800 almost everywhere.
        // Small labels (under 14.5px: tags, captions, column heads) top out at
        // 500 so the page does not read as bold everywhere.
        if (fw >= 600 && fs < 14.5) el.style.setProperty('font-weight', '500', 'important');
        else if (fw > 600 && fs < 30) el.style.setProperty('font-weight', '600', 'important');
        else if (fw > 700) el.style.setProperty('font-weight', '700', 'important');
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
  // STAY SIGNED IN (2026-10-02): pages call Supabase straight from the
  // browser with the kdh_at token (notes, photos, the hub's marks). A page
  // left open -- an iPhone app resumed hours later -- would hold an expired
  // token, so renew it through /api/session (which uses the HttpOnly
  // refresh cookie) when it has under 10 minutes left: on load, whenever
  // the page comes back into view, and every 5 minutes while it is shown.
  // window.kdhFreshToken() renews if needed and returns the current token.
  var renewing = null, lastRenew = 0;
  function atCookie() { try { var m = document.cookie.match(/(?:^|;\s*)kdh_at=([^;]*)/); return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; } }
  function atLeft(t) { try { var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.exp * 1000 - Date.now(); } catch (e) { return -1; } }
  function renew(force) {
    if (!/^https?:/.test(location.protocol)) return Promise.resolve(atCookie());
    var t = atCookie();
    if (!force && t && atLeft(t) > 10 * 60 * 1000) return Promise.resolve(t);
    if (renewing) return renewing;
    if (!force && Date.now() - lastRenew < 60 * 1000) return Promise.resolve(t);
    lastRenew = Date.now();
    renewing = fetch((ROOT || '/') + 'api/session', { credentials: 'same-origin', cache: 'no-store' })
      .catch(function () {}).then(function () { renewing = null; return atCookie(); });
    return renewing;
  }
  window.kdhFreshToken = function () { return renew(true); };
  function keepAlive() {
    if (!user()) return;   // not signed in: nothing to keep
    renew(false);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') renew(false); });
    setInterval(function () { if (document.visibilityState === 'visible') renew(false); }, 5 * 60 * 1000);
  }
  function boot() { chrome(); bar(); watchType(); keepAlive(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
