Kohler Dist Hub -- sign-in (Supabase Auth + Vercel Edge Middleware)
====================================================================

What it does
------------
Every page on kohlerdisthub.com is behind a login. The FIRST time, a
person types their work email on /login/, gets a code (and a link) by
email, types the code, and creates a password. Every time after that
it is email + password -- no email to wait for. "Forgot password" sends
a code again and asks for a new password. Only emails in the allow
list (public.allowed_users in Supabase) can request a code, set a
password or get through. (Passwords since 2026-09-28; before that it
was the code every time.)

Pieces
------
  middleware.js (repo root)   Vercel Edge Middleware. Runs before every
                              request. Reads the `kdh_at` cookie, asks
                              Supabase whether that token belongs to a
                              listed user, lets the request through or
                              redirects to /login/. Also serves
                              /shared/auth-config.js so the sign-in page
                              learns the Supabase URL + publishable key
                              from Vercel's environment variables.
  login/index.html            The sign-in page. Sets the cookie after a
                              magic-link sign-in, sends people back to
                              the page they wanted (?next=...).
                              /login/?signout=1 signs out.
  migrations/*.sql            The allowed_users table, its row-level
                              security, and the is_allowed() check
                              (20260924...); the rep_actions table the
                              hub's Done / Follow up / Not now buttons
                              write to (20260925...); kdh_team() for the
                              Team Activity page (20260928120000);
                              kdh_signin_mode() for passwords
                              (20260928180000).
  import_allowed_users.py     Encompass users export -> SQL upsert for
                              the table. Output goes to data/ (ignored).

One-time setup (done 2026-09-24 unless noted)
---------------------------------------------
  Vercel -> Settings -> Environment Variables (all environments):
    SUPABASE_URL              https://<ref>.supabase.co
    SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
  Supabase -> Authentication -> URL Configuration:
    Site URL       https://kohlerdisthub.com
    Redirect URLs  https://kohlerdisthub.com/**  and  https://*.vercel.app/**
  Supabase -> SQL Editor: migrations/20260924150000_allowed_users.sql (run 2026-09-25)
    then the roster SQL from import_allowed_users.py (49 people, 2026-09-25)
  Supabase -> Authentication -> Emails -> SMTP Settings: Resend, sender
    signin@kohlerdisthub.com, host smtp.resend.com:465, user resend,
    password = Resend API key (2026-09-25). Rate limit raised to 100/hour.

Adding / removing people
------------------------
  Supabase -> Table Editor -> allowed_users. One row per person: email
  (any case, it is lower-cased on save), name, phone, role (rep or
  manager). Delete the row to revoke access; their next page load
  bounces to the sign-in page within five minutes (middleware cache).
  Bulk: python3 supabase/import_allowed_users.py <encompass export>
  then paste supabase/data/allowed_users.sql into the SQL Editor.

Things to know
--------------
  * Mail goes through Resend (free tier: 3,000/month, 100/day) from
    signin@kohlerdisthub.com. The domain's DKIM/SPF records live in
    Vercel's DNS for kohlerdisthub.com. Kohler's MxGuardDog quarantine
    let this through where Supabase's built-in sender was held.
  * Sessions last an hour by default, then the middleware bounces the
    person through /login/ which silently refreshes and sends them back.
    To make that rarer, raise "JWT expiry" under Authentication ->
    Sessions (max 1 week).
  * role decides what a person can open. manager: everything. rep: only
    the paths in REP_PATHS in middleware.js (the /rep/ landing page and
    the six rep dashboards plus the files they load); anything else
    bounces to /rep/. The hub locks a rep to their own name via the
    kdh_user cookie /login/ sets. To give reps another page: add its
    prefix (and whatever it fetches) to REP_PATHS and a tile to
    rep/index.html.
  * GitHub Pages was unpublished on 2026-09-28: kohlerdisthub.com is
    the only copy.

Sign-in CODE (needed for the home-screen app, 2026-09-25)
---------------------------------------------------------
  An iPad opens the emailed link in Safari, never inside a web app that
  was added to the home screen -- so the installed app would stay on the
  sign-in page forever. /login/ therefore also accepts the code (8 digits on this
  project) Supabase puts in the same email: the person types it into the app.
  For the code to APPEAR in the email, the template must print it:
    Supabase -> Authentication -> Emails -> Magic Link (and Confirm sign
    up, which Supabase uses for a first-ever sign-in). Subject "Sign in
    to Kohler Dist Hub". Body keeps the {{ .ConfirmationURL }} link and
    prints {{ .Token }}. The designed version (navy header, Sign in
    button, big code) is supabase/email/magic-link.html -- paste it whole
    into the template's Source view, both templates. (Done with a one-line
    version on 2026-09-28; swap in the designed one any time.)
  Codes expire with "Email OTP Expiration" (Authentication -> Sign In /
  Providers -> Email). The field is in SECONDS: leave it at 3600 (one
  hour). Email OTP Length is 6 on this project (2026-09-28).
  A new request REPLACES the previous code, and a new email can take
  10-30 s to arrive, so the newest email in the inbox is not always the
  newest code sent -- the sign-in page shows the time it sent the email
  for exactly this reason. Nothing else changes:
  the link keeps working for people signing in through Safari.

Passwords (2026-09-28)
----------------------
  Run migrations/20260928180000_password.sql in the SQL Editor once. It
  adds kdh_signin_mode(email), which tells the sign-in page one of three
  things about the address just typed: not listed / listed but no
  password yet / has a password. (Supabase keeps "has a password" in
  auth.users, which the page cannot read itself.) Until the migration
  is run the page behaves exactly as before: code every time.
  How it flows:
    first sign-in   email -> code (or link) -> "Create your password"
                    -> in. Everyone who signed in before 2026-09-28 is
                    asked for a password on their next sign-in, once.
    every time after  email -> password -> in. No email is sent.
    forgot password   the "Forgot password? Email me a code" link on the
                    password step -> code -> "Choose a new password".
  The password is saved with the person's own signed-in session
  (auth.updateUser), so nothing here needs the secret key and nothing
  new is stored in our tables. Settings that matter, all under
  Supabase -> Authentication -> Sign In / Providers -> Email:
    Enable Email provider   on (it is; passwords use the same provider)
    Minimum password length  the page insists on 8; set the project to 8
                            too so nothing shorter can be set elsewhere.
    Secure password change   leave OFF -- with it on, Supabase wants a
                            fresh sign-in before a password can be set,
                            which the code step already is, but a
                            reloaded home-screen app may not count.
  Optional, Pro plan: "Leaked password protection" refuses passwords
  found in known breaches; the page shows Supabase's reason if it does.
  To reset someone's password by hand: Authentication -> Users -> the
  person -> "Send password recovery" is NOT wired to our page; instead
  tell them to use "Forgot password" on /login/, which is.

Rep write-back: rep_actions (2026-09-25)
----------------------------------------
  Run migrations/20260925180000_rep_actions.sql in the SQL Editor once.
  One row per rep x program x account: status done / follow / skip and
  an optional note. The hub writes it straight from the browser with the
  rep's own token (PostgREST at <SUPABASE_URL>/rest/v1/rep_actions); the
  table's row-level security lets a rep touch only their own rows and
  lets managers read everyone's. rep_email / rep_name are stamped from
  the token and allowed_users by a trigger, never trusted from the page.
  Table Editor -> rep_actions shows the whole log; filter rep_name to
  see one rep, or updated_at to see today's.
