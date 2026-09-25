# Kohler Dist Hub -- build tracker

One list of what the website / app (kohlerdisthub.com) still needs, what is
in flight, and what is done. Gavin's checklist. Updated whenever work lands
(Claude: keep this current -- move items, date them, add the follow-ups you
create). No names, emails or phone numbers in here: the repo is public.

Legend: `[ ]` open, `[~]` built, waiting on a step outside the repo,
`[x]` done. "(Gavin)" = a step only Gavin can do (a dashboard setting, a
device, a decision).

## Now -- needs Gavin (built in the repo, not live until these are done)

- [~] **Run the write-back migration** (Gavin): Supabase -> SQL Editor ->
  paste `supabase/migrations/20260925180000_rep_actions.sql` -> Run.
  Until then the hub's Done / Follow up / Not now buttons show but every
  press reports "Couldn't save that". (2026-09-25)
- [~] **Put the 6-digit code in the sign-in email** (Gavin): Supabase ->
  Authentication -> Emails -> "Magic Link" AND "Confirm sign up": subject
  "Sign in to Kohler Dist Hub", keep the link, add
  `<p>Or type this code on the sign-in page: <b>{{ .Token }}</b></p>`.
  Without it the home-screen app cannot sign in (the emailed link opens
  Safari, not the app). Details: `supabase/README.txt`. (2026-09-25)
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
- [ ] **Retire GitHub Pages** (Gavin) once reps are on kohlerdisthub.com:
  repo Settings -> Pages -> Source: None. Until then github.io serves the
  same pages with no login.
- [ ] **Vercel plan** (Gavin): Hobby is for non-commercial use; move the
  project to Pro when it is clearly in company use.

## Next -- to build (in order)

- [ ] **DM team view**: a manager's landing shows their own reps (from
  `reports_to`) with each rep's open follow-ups, Done counts this week, and
  the last time they marked anything -- the "are they using it" read.
  Needs nothing new in Supabase: managers already read all of rep_actions.
- [ ] **Weekly rep email** (Monday, Resend): where you stand in every
  program you are in, what ends this month, your open follow-ups. Sent
  from a scheduled job (Vercel cron or Supabase edge function); the copy
  comes from the same summaries the hub renders.
- [ ] **Manager page in the light workspace design**: port the root index
  to the /rep/ look (top bar, sections, one card component, light/dark).
- [ ] **Follow-ups on the rep workspace**: a small "Your follow-ups" strip
  on /rep/ (count + the next three) so the marks are visible before a
  rep opens the hub.
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
