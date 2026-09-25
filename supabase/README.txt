Kohler Dist Hub -- sign-in (Supabase Auth + Vercel Edge Middleware)
====================================================================

What it does
------------
Every page on kohlerdisthub.com is behind a login. A person types their
email on /login/, gets a "magic link" by email, taps it, and is in.
There are no passwords. Only emails in the allow list
(public.allowed_users in Supabase) can request a link or get through.

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
                              security, and the is_allowed() check.
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
  * GitHub Pages (github.io) still serves the same files with NO login.
    Retire it once reps are on kohlerdisthub.com.
