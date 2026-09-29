# Kohler Dist Hub -- build tracker

One list of what the website / app (kohlerdisthub.com) still needs, what is
in flight, and what is done. Gavin's checklist. Updated whenever work lands
(Claude: keep this current -- move items, date them, add the follow-ups you
create). No names, emails or phone numbers in here: the repo is public.

Legend: `[ ]` open, `[~]` built, waiting on a step outside the repo,
`[x]` done. "(Gavin)" = a step only Gavin can do (a dashboard setting, a
device, a decision).

## Now -- needs Gavin (built in the repo, not live until these are done)

- [ ] **Try "View as rep" from your phone** (Gavin): manager home -> View
  as rep -> pick a rep -> walk Incentives -> a supplier -> a program ->
  Potential accounts -> an account -> Back all the way -> Exit. Anything
  that still feels cramped: a screenshot points straight at it.
  (2026-09-30)
- [ ] **Check "Confirm email" is OFF** (Gavin): Supabase -> Authentication ->
  Sign In / Providers -> Email. With it on, a new person's first sign-in
  mails a link instead of signing them in. (2026-09-29)
- [ ] **Designed sign-in email** (Gavin, optional): paste
  `supabase/email/magic-link.html` whole into Supabase -> Authentication
  -> Emails -> Magic Link (Source view) and again into Confirm sign up,
  replacing the one-line version. Navy header, Sign in button, the code
  in big type. (2026-09-28)
- [~] **Try "Add to Home Screen" on one iPad** (Gavin): open
  kohlerdisthub.com/rep/ in Safari -> Share -> Add to Home Screen -> open
  the "Dist Hub" icon -> sign in with the emailed code. Confirm it opens
  full-screen at the workspace and the Back bar gets you around. If IT
  prefers to push it, a "web clip" for https://kohlerdisthub.com/rep/ in
  their MDM does the same thing on every iPad at once. (2026-09-25)
- [ ] **Session length** (Gavin): Supabase -> Authentication -> Sessions ->
  JWT expiry 604800 (one week) so reps are not asked to sign in daily.
- [ ] **Roll out to reps** (Gavin): send the kohlerdisthub.com link (or the
  home-screen steps) to the reps; DMs get the same link and see everything.
- [ ] **Vercel plan** (Gavin): Hobby is for non-commercial use; move the
  project to Pro when it is clearly in company use.

## Next -- to build (in order)

- [ ] **Weekly rep email** (Monday, Resend): where you stand in every
  program you are in, what ends this month, your open follow-ups. Sent
  from a scheduled job (Vercel cron or Supabase edge function); the copy
  comes from the same summaries the hub renders.
- [ ] **Write-back on the other rep pages** where it fits: Carbliss
  on-prem targets and Red Bull buying accounts could carry the same
  Done / Follow up / Not now strip, reading the same table.

## Later -- ideas kept handy

- Home-screen icon badge / push notifications (needs a service worker
  and, on iOS, the installed app; only worth it once reps live in the app).
- Per-rep "usual order day" from daily-grain invoice history, so a rep's
  visit list is sorted by who orders today (waiting on the data below).
- Sell sheets from the Brands table on each program card.
- Sales-assistant chat (the prompt Gavin drafted) once live data is in
  Supabase -- estimate: Sonnet-class model, well under $50/month at 27 reps.

## Tabled -- waiting on data or a signature

- Encompass -> Snowflake -> Supabase pipeline (Snowflake agreement not
  signed yet). Unblocks: live sales numbers, the display auction tracker
  moving off weekly CSV pulls, order-day derivation, the assistant.
- "Today's route": Encompass Stops is delivery routes, not sales visits;
  reps set their own days. Needs daily-grain 2026 invoice history (Google
  Drive), a Stops export without the invoice join, and a Brands sample.

## Done

- [x] 2026-09-30 Mobile rep experience rebuilt on the Encompass pattern:
  rep home is a short identity line, a "Follow-ups (N)" row that opens
  in place, and compact tool rows; the hub runs Incentives -> supplier ->
  program -> account list -> account as separate screens (one program
  only skips the supplier step), each program a short summary (name,
  deadline, what qualifies, "6 of 8 accounts", "2 more accounts needed",
  one bar, the goal rule in small type, scoring and history folded);
  account lists are searchable rows (name, town, one opportunity line)
  and Back restores the list, its search and scroll position. Percent
  goals read as account counts from the tracker's own eligible base.
  MPO tracker cards use the same summary. "View as rep" (account menu
  and a button on the manager home) opens a searchable rep picker; one
  small "Previewing <rep> · Exit" chip on every page; a preview shows the
  rep's own marks with saving switched off; Exit returns to the manager
  home. Theme and Sign out moved into the account menu. Verified at 375,
  390, 430 and iPad against a real rep sign-in, screen for screen.
- [x] 2026-09-28 Rep pages simplified: one "Back to My Dashboards" button
  on every page, hero photos / crumbs / long intros gone for reps, MPO
  header stacked (name, premise, manager) with no Step badge, objective
  cards down to one status pill + three facts, hub without a lone tab.
- [x] 2026-09-28 GitHub Pages unpublished; kohlerdisthub.com is the only
  copy. Rep lock hardened: names matched forgivingly (Michael/Mike,
  Daniel/Dan ...) and a rep whose name matches no roster sees a notice
  instead of everyone's data; Team Activity flags such names.
- [x] 2026-09-28 Site-wide design system: one token set (light + dark),
  one top bar on every page (logo, page name, back to dashboards, Team,
  theme, who is signed in, Sign out), Oswald + Source Sans 3 everywhere,
  the 18 dashboards re-skinned through `shared/kdh-skin.css` with their
  data and logic untouched. Notes in `shared/README.txt`.
- [x] 2026-09-28 Manager page rebuilt on the rep workspace design: same
  top bar (Team activity, Rep workspace, light/dark, name chip), building
  photo, five sections of the one card component with live MPO / Red Bull
  status; all 19 dashboards carried over. The old dark home.css retired.
- [x] 2026-09-28 "Your follow-ups" strip on the rep workspace: count,
  done-this-week, the three newest flagged accounts with program and
  note, each linking into the hub; a nudge line when nothing is flagged;
  follows the manager's "Viewing as" switcher.
- [x] 2026-09-28 Team Activity page (/team/, managers only): one row per
  rep with open follow-ups, Done this week, Not now and last activity;
  open a rep for the follow-ups with notes and their recent marks;
  "My team" (via kdh_team RPC + reports_to, rolling up through managers
  who report to you) or Everyone or one pill per DM; Open their hub /
  Preview as rep links. Linked from the manager page and the rep
  workspace top bar. Migration run and reports_to verified live.
- [x] 2026-09-29 Mobile-first pass: every page audited on iPhone and iPad
  (portrait and landscape) as manager, rep and preview; top bar fits with
  the Viewing / Previewing chip on its own row, no text under 12.5px
  anywhere, tap targets at least 36-44px, Carbliss pitch readable without
  sideways scrolling. Rep view can be simulated from a phone.
- [x] 2026-09-29 A manager opening a tracker or the hub for one rep sees
  exactly that rep's page (no view bar, no other reps); the "Viewing
  <rep> · Change" chip is the way out. Bigger, solid Back button.
- [x] 2026-09-29 UI + navigation overhaul: one readable font (no
  condensed type, no all-caps), light default, banners off every working
  screen, Back buttons that name where they go, a "Viewing <rep>" chip
  for managers, hub program rows that read qualifies / progress with
  units / next step, still-needed totals by unit, closed suppliers still
  scannable, ended programs in a history section, MPO Program View
  without repeated tiles, Rolling with results first and "More filters",
  Carbliss expanded rows in-theme with plain labels, inventory freshness
  stated honestly.
- [x] 2026-09-29 Password sign-in no longer stalls on "Signing in..."
  (the page now uses the session the sign-in call returns). Carbliss
  on-premise targets scoped to a district manager's team.
- [x] 2026-09-29 DMs open both MPO trackers by rep (their team's picker,
  then the rep's programs); "Default" and "Office Tell Sell" no longer
  appear in any rep list.
- [x] 2026-09-29 District managers see only their own team: the hub
  picker, both MPO trackers, the rep workspace switcher, Team Activity
  and the tap tracker are scoped to their reps; VPs and Gavin still see
  everyone, and Gavin can check any DM's view with "Preview as this
  manager".
- [x] 2026-09-29 Managers open to the manager page (the home-screen app
  starts at the site root now; reinstall the icon once to pick that up)
  and Gavin's account has a "Viewing as" manager switcher there: preview
  the whole site as any manager, Team Activity included.
- [x] 2026-09-29 Password migrations run in Supabase (both the sign-up
  version and the placeholder-hash fix); one manager's password set by
  hand at her request.
- [x] 2026-09-29 Passwords from the start: a new person creates their
  password on the first sign-in (no code), then uses it every time;
  "Forgot password" goes code -> new password; only allow-listed emails
  can register (database trigger). Migration
  `20260929090000_password_signup.sql` (see Now). Supersedes the
  2026-09-28 code-then-password version.
- [x] 2026-09-28 Sign-in page redesigned: white card, two clear steps
  (email, then link-or-code) with a big code box that submits itself,
  resend with a 30 s clock, "use a different email". Oswald + Source
  Sans 3 now served from the site (`shared/fonts.css`, `assets/fonts/`)
  on the sign-in, rep and manager pages, so type no longer depends on
  Google Fonts. Designed email template written.
- [x] 2026-09-28 Gavin ran the rep_actions migration, added the code to
  the sign-in email, and confirmed the buttons save and show for a DM.
- [x] 2026-09-25 Hub write-back: Done / Follow up / Not now + note on every
  target list (incentive rows, MPO cards, detail page), saved to Supabase
  `rep_actions`, follow-ups float up, Done / Not now fold away and stop
  counting; DMs (and Preview as this rep) see the marks read-only.
- [x] 2026-09-25 Home-screen install: `manifest.webmanifest`, Kohler icons
  (192 / 512 / Apple 180), iOS full-screen tags on every rep page, starts
  at /rep/; sign-in page accepts the emailed 6-digit code.
- [x] 2026-09-25 This tracker.
- [x] 2026-09-25 Incentive Hub tile opens the hub in incentives-only mode.
- [x] 2026-09-25 Back bar on every rep dashboard; manager "Preview as this
  rep" mode; every rep page (hub, both MPO trackers, tap tracker, Red Bull,
  Carbliss) locked to the signed-in rep.
- [x] 2026-09-25 Rep workspace /rep/ (light "sales app" design, Oswald +
  Source Sans 3, light/dark toggle, NJ banner); manager page redesign
  (card grid, sections, building photo) and pruning of unused dashboards.
- [x] 2026-09-25 Rep vs manager routing: reps see only their six pages.
- [x] 2026-09-25 Sign-in mail through Resend from signin@kohlerdisthub.com
  (Supabase's mailer was rate-limited and quarantined at Kohler).
- [x] 2026-09-24 Magic-link login gate (Supabase Auth + Vercel middleware),
  allow list loaded from the Encompass users export.
- [x] 2026-09-24 kohlerdisthub.com on Vercel beside GitHub Pages.
