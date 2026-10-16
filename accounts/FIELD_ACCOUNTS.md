# Associate Accounts

Associates have a personal Home dashboard, Accounts, and Field Tasks in the shared navigation.
Accounts opens `field.html`: a searchable directory of all customer accounts,
their identity/location, account photos and merchandising, and tasks visible to
the signed-in employee. Task links open the existing completion/thread workflow;
Open Account returns to the account's photo page. View As is disabled site-wide.

`api/field-accounts.js` reads the existing customer source inside the function
bundle, checks the caller's current role against Supabase, and returns only
identity/location fields with private no-store caching. No generated customer
export is committed. Middleware permits only the directory's required assets for
associates and denies their route/sales files and manager/finance tools. Reps keep
their own Accounts view and cannot fetch the all-customer field directory.

Migration `20261016180155_associate_accounts_task_scope.sql` allows associates to
read/add account photos for known customer numbers, reps and managers to delegate to any sales
associate, and managers to read tasks created by their reporting reps or assigned
to their reporting reps (plus their own tasks). Merely supervising a shared
associate does not expose another rep's work. Task comments, photos and read
receipts inherit the same task membership. Existing author-only photo edits and
deletes, task evidence requirements and rep route boundaries remain in force.

Validation: `node tools/work-sql-test.cjs` and
`node tools/associate-access-static-test.cjs`; local Chrome fixture checks cover
directory search, photo save, rep assignment, associate queue/completion, and the
return link to account photos. No production test tasks or photos are created.
