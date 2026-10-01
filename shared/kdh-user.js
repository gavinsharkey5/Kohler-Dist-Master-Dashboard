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
  // The account assistant keeps its transcripts in sessionStorage under
  // kdh_ask:<viewer>:<account>; a change of who we are looking as drops them
  // all so the next person (or the manager back in their own shoes) starts clean.
  function forgetAsk() { try { Object.keys(sessionStorage).filter(function (k) { return k.indexOf('kdh_ask:') === 0; }).forEach(function (k) { sessionStorage.removeItem(k); }); } catch (e) {} }
  function setPreview(v) {
    forgetAsk();
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
  function setThemeAttr(t) { document.documentElement.setAttribute('data-theme', t); document.dispatchEvent(new CustomEvent('kdh:theme', { detail: t })); }
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
  // THE TOP BAR (2026-09-30): badge, the page name, the Viewing / Previewing
  // chip, a Back button that names where it goes, and ONE account button
  // (avatar) that opens the account menu -- View as rep, Manager home,
  // Team activity, Rep home, light/dark, Sign out. Theme and sign-out left
  // the bar itself so a phone shows the badge, Back and the avatar and
  // nothing fights for the width. A landing page marks itself
  // <meta name="kdh-home"> and gets no Back button.
  var CARET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function isHomePage() { return !!document.querySelector('meta[name="kdh-home"]'); }
  // PRIMARY NAVIGATION (2026-10-01, after Todoist's labelled sidebar and
  // Shopify's tab bar): the three or four places people go all day, always
  // labelled, the current one marked. Tablets and desktop get them in the
  // top bar; phones get a bottom tab bar (#kdhTabs). Reps: Home, Accounts,
  // Incentives. Managers: Home, Accounts, Incentives, Team. Everything else
  // (trackers, MPOs) opens from Home, so those pages mark Home as current.
  var NAV_ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
    accounts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 4.5 4h15L21 9.5"/><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/><path d="M10 21v-5h4v5"/></svg>',
    incentives: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/></svg>'
  };
  function navItems(u) {
    if (!u) return [];
    var isMgr = u.role === 'manager';
    var hub = ROOT + 'hub/' + (isMgr ? '' : '#view=rep&rep=' + encodeURIComponent(u.name) + '&cat=inc&only=inc');
    var items = [
      { key: 'home', label: 'Home', href: isMgr ? ROOT : REP_HOME },
      { key: 'accounts', label: 'Accounts', href: ROOT + 'accounts/' },
      { key: 'incentives', label: 'Incentives', href: hub }
    ];
    if (isMgr) items.push({ key: 'team', label: 'Team', href: ROOT + 'team/' });
    return items;
  }
  function navCurrent(u) {
    var p = location.pathname, isMgr = u && u.role === 'manager';
    var rel = ROOT ? location.href.replace(new URL(ROOT, location.href).href, '') : p.replace(/^\//, '');
    rel = rel.split(/[?#]/)[0];
    if (/^accounts\//.test(rel)) return 'accounts';
    if (/^hub\//.test(rel)) return 'incentives';
    if (/^team\//.test(rel)) return 'team';
    if (/^rep\//.test(rel)) return isMgr ? '' : 'home';
    if (rel === '' || rel === 'index.html') return isMgr ? 'home' : '';
    return 'home';   // a tracker or MPO page: it is opened from Home
  }
  function navHtml(u, cls) {
    var cur = navCurrent(u);
    return navItems(u).map(function (it) {
      var on = it.key === cur;
      return '<a class="' + cls + (on ? ' on' : '') + '" href="' + esc(it.href) + '" data-nav="' + it.key + '"' + (on ? ' aria-current="page"' : '') + '>' + NAV_ICON[it.key] + '<span>' + esc(it.label) + '</span></a>';
    }).join('');
  }
  // the bottom tab bar on phones (CSS shows it under 760px); a page with its
  // own bottom navigation opts out with <meta name="kdh-tabs" content="off">
  function tabBar(u) {
    if (!u || document.getElementById('kdhTabs')) return;
    var off = document.querySelector('meta[name="kdh-tabs"]'); if (off && off.content === 'off') return;
    var t = document.createElement('nav');
    t.id = 'kdhTabs'; t.className = 'kdh-tabs'; t.setAttribute('aria-label', 'Main');
    t.innerHTML = '<div class="kdh-tabs-in">' + navHtml(u, 'kdh-tab') + '</div>';
    document.body.appendChild(t);
    document.documentElement.classList.add('kdh-has-tabs');
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
    // BACK (2026-10-01): concise and only when it adds a destination the
    // navigation does not already show -- the Incentive Hub a tracker was
    // opened from, Team activity, the rep workspace. Going back to your own
    // home is the Home item, so no second button says the same thing.
    if (!isHomePage()) {
      var back = returnTarget();
      var dup = u && (back.href === home || back.href === (isMgr ? ROOT : REP_HOME) || /Back to (Rep|Manager) Home/.test(back.label) && back.href === home);
      if (!u || !dup) acts += '<a class="kdh-b kdh-outline kdh-back" href="' + esc(back.href) + '">' + BACK + '<span>' + esc(back.label.replace(/^Back to /, '')) + '</span></a>';
    }
    // The Viewing / Previewing chip is a direct child of the bar (beside the
    // actions, not inside them) so a phone can give it a full row of its own.
    var chips = '<span id="kdhViewing"></span>';
    if (u && u.preview) chips += '<span class="kdh-chip kdh-preview" id="kdhPreviewChip">' + previewChipHtml(u) + '</span>';
    // the account button is always the SIGNED-IN person, never the one being previewed
    var who = u ? (u.preview ? u.manager : u.name) : '';
    // the theme switch: icon + the current mode's name, role=switch (on = dark)
    acts += '<button type="button" class="kdh-b kdh-outline kdh-theme" id="kdhThemeBtn" role="switch" aria-checked="false" aria-label="Dark mode" title="Switch between light and dark">' + SUN + MOON + '<span id="kdhThemeText">Light</span></button>';
    if (who) acts += '<button type="button" class="kdh-b kdh-user" id="kdhMenuBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu, signed in as ' + esc(who) + '"><span class="kdh-av">' + esc(initials(who)) + '</span><span class="kdh-name">' + esc(who) + '</span>' + CARET + '</button>';
    b.innerHTML = '<div class="kdh-bar-in">' +
      '<a class="kdh-logo" href="' + home + '"><img src="' + ROOT + 'assets/kohler-logo-badge.png" alt=""><span class="kdh-word">Kohler Dist Hub</span><small>' + esc(pageName()) + '</small></a>' +
      (u ? '<nav class="kdh-nav" aria-label="Main">' + navHtml(u, 'kdh-nav-i') + '</nav>' : '') +
      chips +
      '<div class="kdh-acts">' + acts + '</div></div>' +
      (who ? menuHtml(u, isMgr) : '');
    document.body.insertBefore(b, document.body.firstChild);
    // the small page name is dropped only where the marked nav item IS this page
    var cur = navCurrent(u); if (cur && (cur !== 'home' || isHomePage())) b.classList.add('kdh-has-cur');
    tabBar(u);
    var t = document.getElementById('kdhTheme'); if (t) t.addEventListener('click', function () { toggleTheme(); });
    var tb = document.getElementById('kdhThemeBtn'); if (tb) tb.addEventListener('click', toggleTheme);
    var td = document.getElementById('kdhThemeDevice'); if (td) td.addEventListener('click', function () { chooseTheme(''); openMenu(false); });
    themeLabel();
    wireExit();
    wireMenu();
  }
  // ---- the account menu ----
  function menuHtml(u, isMgr) {
    var who = u.preview ? u.manager : u.name;
    var role = isMgr ? 'Manager' : 'Sales rep';
    var items = '';
    if (isMgr) {
      items += '<button type="button" class="kdh-menu-i" id="kdhViewAsRep">' + (u.preview && u.role !== 'manager' ? 'Change rep' : 'View as rep') + '<small>See the site as one rep does</small></button>';
      if (u.preview) items += '<button type="button" class="kdh-menu-i" id="kdhExitPreview2">Exit preview<small>Back to your own pages</small></button>';
      // Home, Accounts, Incentives and Team are in the navigation; the menu
      // keeps only what is not: the rep workspace, preview, theme, sign out
      items += '<a class="kdh-menu-i" href="' + REP_HOME + '">Rep workspace<small>A rep\'s home page, by rep</small></a>';
    }
    items += '<button type="button" class="kdh-menu-i" id="kdhTheme">' + SUN + MOON + '<span id="kdhThemeLabel">Dark mode</span></button>';
    items += '<button type="button" class="kdh-menu-i" id="kdhThemeDevice" hidden>Use device theme<small>Follow this device\'s light / dark setting</small></button>';
    items += '<a class="kdh-menu-i" href="' + ROOT + 'login/?signout=1">Sign out</a>';
    return '<div class="kdh-menu" id="kdhMenu" hidden role="menu"><div class="kdh-menu-h"><b>' + esc(who) + '</b><span>' + role + (u.email ? ' · ' + esc(u.email) : '') + '</span></div>' + items + '</div>';
  }
  function themeLabel() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var l = document.getElementById('kdhThemeLabel'); if (l) l.textContent = dark ? 'Light mode' : 'Dark mode';
    var b = document.getElementById('kdhThemeBtn'); if (b) { b.setAttribute('aria-checked', dark ? 'true' : 'false'); b.title = dark ? 'Dark mode is on. Switch to light' : 'Light mode is on. Switch to dark'; }
    var x = document.getElementById('kdhThemeText'); if (x) x.textContent = dark ? 'Dark' : 'Light';
    var d = document.getElementById('kdhThemeDevice'); if (d) d.hidden = !savedTheme();
  }
  function openMenu(on) {
    var m = document.getElementById('kdhMenu'), btn = document.getElementById('kdhMenuBtn'); if (!m || !btn) return;
    m.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) themeLabel();
  }
  function wireMenu() {
    var btn = document.getElementById('kdhMenuBtn'); if (!btn || btn.__kdh) return; btn.__kdh = 1;
    btn.addEventListener('click', function (e) { e.stopPropagation(); var m = document.getElementById('kdhMenu'); openMenu(!!(m && m.hidden)); });
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
        '<div class="kdh-sheet-h"><b id="kdhPickerTitle">View as rep</b><button type="button" class="kdh-sheet-x" aria-label="Close">Close</button></div>' +
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
