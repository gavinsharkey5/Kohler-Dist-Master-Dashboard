Kohler Dist Hub -- sign-in (Supabase Auth + Vercel Edge Middleware)
====================================================================

What it does
------------
Every page on kohlerdisthub.com is behind a login. The FIRST time, a
person types their work email on /login/ and creates a password -- no
code, no email to wait for (Gavin's call, 2026-09-29). Every time after
that it is email + password. "Forgot password" emails a code and then
asks for a new password. Only emails in the allow list
(public.allowed_users in Supabase) can create an account, set a
password or get through -- the page checks, and a database trigger on
auth.users refuses everyone else. (Code-every-time until 2026-09-28,
code-then-password for a day, passwords from the start since 2026-09-29.)

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
                              kdh_signin_mode() + the allow-list
                              trigger on auth.users for passwords
                              (20260929090000; 20260928180000 was the
                              first version, superseded).
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

Passwords (2026-09-29)
----------------------
  Run migrations/20260929090000_password_signup.sql and then
  migrations/20260929120000_password_fix.sql in the SQL Editor once each
  (they replace the 2026-09-28 version). They give the page
  kdh_signin_mode(email) -- one of four answers about the address just
  typed: no (not listed) / new (listed, no account yet) / code (an
  account from before passwords, no real password yet) / password -- and
  a BEFORE INSERT trigger on auth.users so only allow-listed emails can
  become accounts, whatever calls the sign-up API (this also applies to
  Authentication -> Users -> Add user: list the person first).
  "Real password": an account made by emailed code carries a bcrypt hash
  of the EMPTY password in auth.users.encrypted_password, which is why
  the first version showed Gavin "Welcome back" -- kdh_real_password()
  (pgcrypto crypt('') against the stored salt) tells the two apart.
  Verified on 2026-09-29 against a local Postgres 16: stranger -> no,
  never signed in -> new, empty-password hash -> code, real bcrypt ->
  password, non-bcrypt hash -> password, stranger insert refused by the
  trigger, anon may call kdh_signin_mode but not the helper.
  How it flows:
    first sign-in   email -> "Create your password" -> in (auth.signUp;
                    the reply carries the session, no email is sent).
    every time after  email -> password -> in.
    forgot password   the "Forgot password? Email me a code" link on the
                    password step -> code -> "Choose a new password".
                    This is also how the real owner takes an address
                    back if someone else registered it first: the code
                    only reaches the Kohler inbox.
    old accounts    someone who signed in by code before 2026-09-29 has
                    an account without a password: the page sends the
                    code ONE more time, then "Create your password".
                    To skip that for a person, delete them under
                    Authentication -> Users and they sign up fresh.
  Nothing here needs the secret key and nothing new is stored in our
  tables. Settings that matter, all under Supabase -> Authentication ->
  Sign In / Providers -> Email:
    Enable Email provider    on (it is)
    Confirm email            OFF (required). With it on, sign-up mails a
                             confirmation link instead of signing the
                             person in; the page detects this and says
                             so, but that is the wait this removes.
    Minimum password length  8 (the page insists on 8 too).
    Secure password change   OFF -- with it on, Supabase wants a fresh
                             sign-in before a password can be set.
  Authentication -> Sign In / Providers, top: "Allow new users to sign
  up" must stay ON (the trigger, not this switch, is what keeps
  strangers out).
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

Account assistant usage ledger (2026-09-30)
--------------------------------------------
  Run migrations/20260930210000_assistant_usage.sql once in the SQL
  Editor before turning the assistant on. It creates public.assistant_usage
  (one row per answer: tokens, rounds, latency, model, estimated USD --
  no question text, no answers, no account names; who asked is stamped
  from the token) and kdh_assistant_quota(), which api/chat.js reads before
  every call to enforce KDH_CHAT_USER_DAILY (requests per person per UTC
  day) and KDH_CHAT_DAILY_USD (everyone's estimated spend per UTC day).
  A person reads their own rows, a manager everyone's; nothing is updated
  or deleted. Without the migration the assistant answers 503 on purpose.
  Verified on 2026-09-30 against a local Postgres 16: the trigger overrode
  a forged user_email, the other rep saw 0 rows and a 0 quota, the manager
  saw all rows, update / delete / anon were refused, and the migration
  applied twice cleanly. The spend query is at the foot of the file.


NOTES + PHOTOS (2026-10-02)
Run migrations/20261002120000_account_notes_photos.sql, then
seed/account_assignments.sql, in the SQL Editor. The migration adds
account_assignments (customer # -> rep key), kdh_name_key() (a mirror of
middleware.js nameKey, nickname map included), kdh_can_access_account(),
general notes + follow_on dates on rep_actions, the account_photos table,
and the private account-photos bucket with policies (a rep reads / adds
photos only on accounts assigned to them, removes only their own; managers
read all). The seed is written by accounts/generate.py on every run --
re-run it after any reassignment, or a rep's photo and note access will
follow the old assignment. Both are idempotent. Verified on local Postgres
16 (scratchpad sql_notes_test).

PHOTO LABELS (2026-10-03)
Run migrations/20261003090000_photo_labels.sql after the notes + photos file.
Idempotent. category may be empty (Uncategorized), adds brand / program_id
(<= 120 chars), and lets ONLY the author update category, caption, brand,
program_id; a trigger keeps the account, file, author, premise, size and
times as they were. Verified on a local Postgres 16 (scratchpad
sql_notes_test.sh, 43 checks).

MERCHANDISING RECORDS (2026-10-04)
Run migrations/20261004090000_merchandising.sql after the photo labels file.
Idempotent. account_photos: storage_path may be empty (an iSellBeer link with
no stored copy), adds source / source_url (unique) / photo_kind (original or
report_page) / photo_status (stored, link, unavailable), category also allows
menu and other. New tables: merch_records (one observation at one account,
source_key unique), merch_lines (product / brand lines; quantity NULL = not
recorded, never 0; quantity_unit required with a quantity; US/THEM source and
audited correction kept apart), merch_record_photos, merch_import_batches,
merch_review (unmatched report pages). Functions: kdh_merch_save (Hub capture,
retry-safe), kdh_merch_import (managers only; restates by source_key, dedupes
photos by link / path), kdh_merch_resolve (attach a review item; the file must
sit under that account). RLS through kdh_can_access_account; only the author
edits or removes a Hub record. Verified on a local Postgres 16 (scratchpad
sql_merch_test.sh, 26 checks). merchandising/README.txt has the rules.

PHOTO ADMIN (2026-10-05)
Run migrations/20261005090000_photo_admin.sql after the merchandising file.
Idempotent. Adds allowed_users.photo_admin (default false) and
kdh_is_photo_admin(); a photo admin may remove ANY account photo row, ANY
merchandising record (Hub or imported; lines and photo links cascade) and ANY
stored image file in account-photos. Authors keep removing their own. Reading
is unchanged. Nobody can set the flag on themselves (signed-in people only
READ their own allow-list row). The repo names no admin -- turn it on in the
SQL Editor:  update public.allowed_users set photo_admin = true where email = '<email>';
or tick photo_admin on that row in Table Editor -> allowed_users. Verified on
local Postgres 16 (scratchpad sql_admin_test.sh, 19 checks).

iSELLBEER PHOTO PDFs (2026-10-05)
Run migrations/20261005100000_isb_pdf_photos.sql after the merchandising file
(idempotent). Adds kdh_merch_attach_photos(p) (managers only): for each
{source_url, storage_path} it fills the stored copy of a photo an earlier
import created as a link -- only when it has none, only under that photo's own
account folder -- and labels it a report page. It never creates a photo. The
relabel trigger is redefined with that one exception (a NULL storage_path may
be filled under the same account; a stored path still never changes).
Verified on local Postgres 16 (scratchpad sql_pdf_test.sh, 13 checks).

STAY SIGNED IN (2026-10-02)
Reps stay signed in on a device until they sign out: the server keeps the
refresh token in an HttpOnly cookie and middleware.js renews the access token
from it (api/session.js). No SQL. Settings that would end sessions early:
Authentication -> Sessions "Time-box user sessions" and "Inactivity timeout"
-- leave both off. JWT expiry (access token) can stay at the default hour;
renewal is automatic. Refresh token rotation and its reuse interval (default
10 s) stay as they are -- the middleware relies on the reuse interval when a
page fires several requests at once.
