Kohler Dist Hub -- shared design system (2026-09-28)
=====================================================

One look for every page on kohlerdisthub.com. Three files do it:

  kdh.css        THE DESIGN SYSTEM. Tokens (--kdh-bg, --kdh-surface,
                 --kdh-text, --kdh-brand, --kdh-ok/warn/bad/gold, radii,
                 shadows, fonts) in light AND dark, the site top bar
                 (.kdh-bar), and generic components (.kdh-pill, .kdh-card,
                 .kdh-table, .kdh-field, .kdh-details, .kdh-tag ...).
                 Imports fonts.css (Oswald + Source Sans 3, self-hosted
                 in assets/fonts/). Change light and dark together.

  kdh-skin.css   THE DASHBOARD SKIN. Loaded LAST in every dashboard's
                 <head>. Re-points the page's own variables (--canvas,
                 --card, --ink, --accent, --good ...) at the kdh tokens,
                 aliases the fonts the pages were written with (Space
                 Grotesk, Inter, Archivo, Calibri, Georgia ...) to ours
                 through @font-face, hides the pages' old back links,
                 and holds the page-specific fixes at the bottom. No
                 dashboard logic or markup is touched.

  kdh-user.js    IDENTITY + CHROME. kdhUser() (who is signed in, preview
                 mode), the injected site top bar (logo -> landing page,
                 page name from <meta name="kdh-page">, the Viewing /
                 Previewing chip, a Back button that names where it
                 goes, and the ACCOUNT BUTTON -- avatar + caret -- whose
                 menu holds View as rep, Manager home, Team activity,
                 Rep home, Dark / Light mode, Use device theme and Sign
                 out), the THEME SWITCH in the bar (#kdhThemeBtn: icon +
                 "Light" / "Dark", role=switch), the "View as rep" picker
                 sheet (kdhViewAsRep). Applies the theme as soon as it
                 runs: the saved choice (localStorage kdh_theme), else
                 the DEVICE setting, followed live (window.kdhTheme).

APP SHELL (2026-10-02) -- kdh-user.js + the "APP SHELL" block at the end of kdh.css
  Below 1024px: a fixed bottom bar #kdhTabs -- reps Home / My Accounts / Programs /
  More, managers Home / Accounts / Programs / Team / More -- with labels, 60px tall plus
  the safe-area inset; pages get bottom padding so nothing hides behind it. More opens
  the account menu as a sheet: the tools (Off/On-Premise MPOs, Tap Tracker, Red Bull,
  Carbliss, Rep Workspace for managers), View as Rep / Exit Preview, theme, Sign Out.
  From 1024px: a labelled left sidebar #kdhSide (240px) with the same destinations, a
  Programs sub-list, Trackers and Manager groups, and the signed-in person at the foot
  (#kdhMenuBtn) opening the same menu as a popover. The top bar keeps only the page
  name, the Viewing / Previewing chip, a contextual Back and the theme switch.
  `<meta name="kdh-tabs" content="off">` opts a page out (metlife-audit has its own).
  WHERE AM I: where(u) maps the path to a nav item (home / accounts / programs / team)
  or a tool; trackers mark More (phone) / their own sidebar row (desktop).
  STATE MEMORY: kdhRemember(key, href) / kdhRecall(key) keep the last URL of a section
  in sessionStorage under kdh_nav:<scope>:<key>, scope = signed-in email + preview
  identity. Nav links carrying data-nav="accounts" / "programs" go to the recalled URL,
  so My Accounts / Programs return to the list, filters, rep and section you left.
  Entering or leaving preview (kdhSetPreview / kdhExitPreview) and signing in or out
  clear kdh_nav:*, kdh_acct* and kdh_from:*.
  The menu element is moved to <body> on load: inside the bar (backdrop-filter) a
  position:fixed sheet is clipped to the bar.

Every page, the landing pages included (rep/, team/, index.html), gets
the bar from kdh-user.js; a landing page adds <meta name="kdh-home"> and
gets no Back button. Only the sign-in page draws its own header. The
landing pages link rep/rep.css, whose short token names (--bg,
--surface, --brand ...) are aliases of the kdh tokens.

Adding a dashboard
------------------
  1. In <head>, after the page's own <style>/<link>:
       <meta name="kdh-page" content="Short Page Name">
       <script>try{var t=localStorage.getItem('kdh_theme');if(t!=='dark'&&t!=='light')t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
     (the saved choice, else the device setting -- set BEFORE first paint
     so nothing flashes; data-theme is therefore always explicit and
     every stylesheet keys on [data-theme="dark"] alone)
       <link rel="stylesheet" href="../shared/kdh-skin.css?v=...">
     and, if the page does not already load it, ../shared/kdh-user.js.
  2. Remove any Google Fonts <link>s -- the skin aliases those families.
  3. If the page invents a variable name the map does not know, add it
     to the map in kdh-skin.css (canvas/surface/text/line/accent/
     semantic groups). If it has its own theme switch, make it read
     localStorage kdh_theme, WRITE it only on an explicit tap (never save
     the device default as a choice) and listen for the 'kdh:theme'
     event the bar's switch fires (see rolling-distribution, metlife).
  4. Screenshot light + dark at 1366 and 390 (scratchpad skin_sweep.mjs
     pattern) and add page fixes at the bottom of kdh-skin.css.

Rules
-----
  * Light is the default; dark follows the device or the toggle.
  * One accent (Kohler blue). Supplier brand colours live in logos and
    badges, not in the chrome. Green / amber / red mean good / watch /
    bad everywhere; gold is money and Kohler-track figures.
  * Oswald for headings, labels, pills and numbers that headline;
    Source Sans 3 for everything else. Body text 15px or larger.
  * Every page has the same top bar; nothing else navigates between
    dashboards. Filters are pills, tabs are pills, expanders are
    <details> with a caret.


2026-09-29 -- the application look
-----------------------------------
One font (Source Sans 3) for everything; NO text-transform:uppercase and
NO letter-spacing anywhere (the skin enforces it site-wide). Light is the
default; dark is a choice. No hero photos or banners on working screens:
the badge in the top bar is the branding. New shared pieces in kdh.css:
.kdh-chip (Viewing / Previewing), .kdh-state (loading, empty, error,
unavailable, stale), .kdh-progress + .kdh-prog-line (always name the
unit), .kdh-tag.stale, .kdh-page-head + .kdh-return. The top bar's Back
button names its destination (kdh-user.js returnTarget()); a page that
shows one rep to a manager calls kdhViewing(name, changeHref). Mark
maintenance text (filenames, refresh steps) class="kdh-maint" so reps
never see it.


2026-09-30 -- the account menu, the rep picker, one preview chip
-----------------------------------------------------------------
The bar is badge + page name, chip, Back, avatar. Everything else is in
the account menu (#kdhMenu, opened by #kdhMenuBtn): View as rep /
Change rep + Exit preview for managers, Manager home, Team activity, Rep
workspace (Rep home for a rep), Dark mode / Light mode (#kdhTheme),
"Use device theme" (#kdhThemeDevice, shown only while a choice is
saved; clears it), Sign out. The bar itself carries the labelled theme
switch (#kdhThemeBtn) beside the account button (2026-09-30). "View as rep" opens #kdhPicker -- a bottom sheet on
phones, a centred dialog on desktop -- with a search box and the reps by
DM from shared/dm-groups.js (loaded on demand; a DM sees their team
only); a pick sets the kdh_preview cookie and opens /rep/. The ONLY
preview indicator is the chip #kdhPreviewChip ("Previewing <rep> ·
Exit"), a full-width row under the bar on phones; the fixed bottom bar
is gone. Exit clears the cookie and goes to the manager home. New
pieces in kdh.css: .kdh-menu / .kdh-menu-i, .kdh-sheet-* .

NAV + TITLES (2026-10-02)
- Reps' bottom bar / sidebar: Home / My Accounts / Programs / Inventory /
  More. Inventory is /inventory/ (warehouse stock, no customer data; in
  REP_PATHS). Managers keep Home / Accounts / Programs / Team / More;
  Inventory is in their menu (`invm`, menuOnly) and Incentive Performance
  (`perf`) in their sidebar's Manager group.
- shared/program-titles.js: `kdhTitle(id, fallback)` = the concise display
  title for a program id. Labels only. Add a line for every new program.
- Contrast: text tokens are tuned for WCAG AA on bg / surface / surface-2
  in both themes; never dim text with opacity (it drops below 4.5:1) --
  use --kdh-text-3. Text on a filled accent uses --kdh-brand-ink.
  scratchpad contrast_audit.mjs is the measurement.

BUTTONS + DATA SOURCES (2026-10-03)
Buttons: rep/rep.css "BUTTONS" -- .btn is 44px tall (40px for .sm), 10px
radius, a visible border, icon + label in one control; variants .primary,
.outline, .ghost, .wide, .danger; states :hover, :active, :focus-visible,
[aria-pressed="true"] (selected), [aria-busy="true"] (loading spinner),
:disabled. Spacing steps --sp-1..4 = 8 / 12 / 16 / 24px. Use these on any
new control; never a bare <a> styled as a button with its own sizes.

shared/kdh-data.js (window.KdhData) is where a page asks for a dataset:
repIndex, repBook(name), catalog, actions({reps, account, status}), team,
plus json / rest helpers. The comment at its top lists every dataset, its
source and its freshness field. It decides nothing about access (the
middleware and Supabase RLS do). Exceptions uses it; the older pages still
carry their own loaders in a separate "data" block (accounts.js, team/,
rep/) -- move them over when they are next touched. A future Snowflake /
Postgres feed replaces a loader there and nothing else.
