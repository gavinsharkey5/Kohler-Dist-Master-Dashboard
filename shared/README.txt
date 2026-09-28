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
                 page name from <meta name="kdh-page">, "Dashboards" /
                 "My dashboards" back link, Team for managers, the
                 light/dark toggle, name chip, Sign out), the preview
                 bar. Applies the saved theme as soon as it runs.

The rep workspace (rep/), team page (team/), manager page (index.html)
and sign-in page carry the .kdh-bar markup themselves and link
rep/rep.css, whose short token names (--bg, --surface, --brand ...) are
aliases of the kdh tokens.

Adding a dashboard
------------------
  1. In <head>, after the page's own <style>/<link>:
       <meta name="kdh-page" content="Short Page Name">
       <script>try{var t=localStorage.getItem('kdh_theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
       <link rel="stylesheet" href="../shared/kdh-skin.css?v=...">
     and, if the page does not already load it, ../shared/kdh-user.js.
  2. Remove any Google Fonts <link>s -- the skin aliases those families.
  3. If the page invents a variable name the map does not know, add it
     to the map in kdh-skin.css (canvas/surface/text/line/accent/
     semantic groups). If it has its own theme switch, make it read and
     write localStorage kdh_theme (see rolling-distribution, metlife).
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
