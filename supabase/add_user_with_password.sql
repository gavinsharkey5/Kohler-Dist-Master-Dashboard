-- Kohler Dist Hub: add ONE person to the allow list AND give them a
-- password in the same step, so they can sign in right away without
-- the "Create your password" step.
--
-- This is a TEMPLATE. Copy it, fill in the four values below, paste the
-- result into Supabase -> SQL Editor and run it. Keep the filled copy in
-- supabase/data/ (git-ignored): the repo is public, never commit an email.
--
-- Fill in:
--   EMAIL      the work address, any case (stored lower-case)
--   NAME       as it appears in Encompass (reps are matched to their
--              accounts by this name -- see kdhMatchName in
--              shared/kdh-user.js)
--   ROLE       'rep' or 'manager'. A rep whose name is on no roster
--              is locked out of every page ("We couldn't find your name
--              here"), so a person without assigned accounts is a manager.
--   PASSWORD   what they sign in with. The sign-in page / Forgot password
--              flow insists on 8+ characters; a shorter one set here still
--              works for sign-in, but a later "Forgot password" reset will
--              ask for 8.
--
-- What it does, in order (the order matters: the kdh_only_allowed_signups
-- trigger on auth.users refuses an email that is not yet listed):
--   1. upsert the allowed_users row (name / role updated if it exists);
--   2. create the auth.users account with the bcrypt hash of PASSWORD and
--      the email already confirmed -- skipped if the account exists;
--   3. add the matching auth.identities row (Supabase needs one per
--      provider) -- skipped if it exists.
-- Safe to run more than once. To CHANGE an existing account's password
-- instead, run only the final `update auth.users` at the foot of this file.
--
-- Afterwards kdh_signin_mode(EMAIL) answers 'password' and /login/ goes
-- email -> password -> in.

begin;

insert into public.allowed_users (email, name, role)
values ('EMAIL', 'NAME', 'ROLE')
on conflict (email) do update
  set name = excluded.name,
      role = excluded.role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated',
  lower(trim('EMAIL')),
  extensions.crypt('PASSWORD', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  now(), now(),
  '', '', '', '', '', '', '', ''
where not exists (
  select 1 from auth.users where lower(email) = lower(trim('EMAIL'))
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where lower(u.email) = lower(trim('EMAIL'))
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

commit;

-- Check: should print 'password'.
select public.kdh_signin_mode('EMAIL');

-- Only to RESET the password of an account that already exists:
-- update auth.users
--   set encrypted_password = extensions.crypt('PASSWORD', extensions.gen_salt('bf')),
--       updated_at = now()
-- where lower(email) = lower(trim('EMAIL'));
