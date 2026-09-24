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
  Supabase -> SQL Editor: paste and run migrations/20260924150000_allowed_users.sql
    (TODO: run this once -- it creates the table and seeds Gavin as manager)

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
  * Supabase's built-in email sender is for testing only: a few emails
    an hour, and they can land in spam. Before rolling out to reps, set
    up custom SMTP (Authentication -> Emails -> SMTP Settings). Resend's
    free tier is plenty and takes ten minutes.
  * Sessions last an hour by default, then the middleware bounces the
    person through /login/ which silently refreshes and sends them back.
    To make that rarer, raise "JWT expiry" under Authentication ->
    Sessions (max 1 week).
  * Everyone on the list sees everything for now. role is stored so the
    next step -- reps land on the hub and see only their own pages,
    managers see the index -- has what it needs.
  * GitHub Pages (github.io) still serves the same files with NO login.
    Retire it once reps are on kohlerdisthub.com.
