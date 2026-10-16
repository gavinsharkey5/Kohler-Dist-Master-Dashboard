# Sales Associates: Field Tasks — the plan (2026-10-14)

The brief (design-refs/CLAUDE_CODE_PROMPT.md) asked for four things first, then the MVP.
Gavin was not in the session, so the MVP was built under the assumptions listed in section 4;
nothing is live until the migration in section 5 is run.

## 1. Where it sits in the site

- ONE page: `/tasks/` ("Field Tasks"). One page, three views by role:
  - **Sales associate** (new `allowed_users.role = 'associate'`, Gavin's migration of 2026-10-14):
    the page IS their site. `/tasks/` is their home, the bottom bar is Home + More, the sidebar
    says "Sales Associate", no "Not Real Time" banner (the page holds no sales data). The
    middleware lets an associate open only `/tasks/` and `/shared/`; anything else sends them
    to `/tasks/` (403 for a data fetch). They never see an account book, a program or a tracker.
  - **Rep**: "Tasks you assigned" — reached from Rep Home (a "Field Tasks" tool card), the More
    menu / sidebar ("Field" group), and `/tasks/` is in REP_PATHS.
  - **Manager**: read-only team overview — Manager Home card ("Field Tasks", Manager Tools), the
    sidebar, and the same URL.
- Deep links: `#task=<id>` (detail), `#new`, `#edit=<id>`. Preview (a manager "viewing as" a rep)
  shows that rep's tasks read-only: no New Task, no composer, no status changes, and the test
  proves nothing is written.

## 2. Data model and backend (supabase/migrations/20261014180000_field_tasks.sql)

| table | what | who writes |
|---|---|---|
| `field_tasks` | one task: title, description, task_type (display / tap_handle / pos / other), account_num + account_name (free text copied from the rep's book at creation — a task does not require an account), rep_email/rep_name (STAMPED from the token), associate_email/associate_name (checked to be an associate), due_date, priority (normal / urgent), status (assigned / in_progress / done / blocked), blocked_reason, photo_path, completion_note, created/updated/completed/archived_at | rep creates + edits the definition; associate changes status / photo / note only; manager may do either |
| `field_task_comments` | the thread: kind comment / status / photo, body, photo_path, author stamped | participants + managers; status lines are written by a trigger on every status change (the audit trail) |
| `field_task_reads` | task_id + email + seen_at — "New" badge = updated after you last opened it | own rows only |
| bucket `task-photos` | `<task id>/<uuid>.jpg`, private; read for participants + managers, add for participants | |

Rules the database enforces (not the page): a Display or Tap Handle task cannot reach Done
without a photo; Blocked needs a reason; Done stamps completed_at; the creator is the token's
email; an associate cannot edit title / account / due / priority / assignee; only an unstarted
task may be withdrawn (deleted) by its rep; nobody else sees a task (RLS: rep, associate or
manager). `kdh_people('associate')` gives any signed-in person the associate list (names +
emails) for the picker; `kdh_people('rep')` is managers-only (filter chips). Everything goes
through PostgREST with the signed-in token — no new API function, no service key. Verified on
local Postgres 16 (scratchpad sql_tasks_test.sh, 32 checks).

Photos: resized to 2048px JPEG in the browser (EXIF / GPS dropped), uploaded with progress, then
the row is updated — "Task completed" only after both. Nothing claims to sync to iSellBeer.

Notifications in v1 = in-app: a "New" chip on rows and a 30-second poll while the page is open
(also on returning to the tab). No email / push yet (section 3).

## 3. MVP (built) vs v2

v1, built: associate queue (Overdue / Today / Upcoming / No Due Date / Blocked / Done 7 days,
circle to complete, Attio pattern); rep list (Open / Blocked / Done / All, "Needs a Look" for
overdue or updated tasks, FAB / header New Task); task detail (big status select + Mark Complete /
Start Working / Can't Do This for the associate, Edit / Withdraw for the rep, Assigned To + Due
two-column, Account / Type / Priority / Assigned By / Created, description, completion photo,
thread, pinned composer with a camera button); New Task form (title, details, associate select,
account search over the rep's own book, type segmented, due date + Today / Tomorrow / Next Week,
Normal / Urgent, fixed Assign Task bar); Check Your Photo (preview, note, Submit & Complete /
Retake); manager overview (Open / Overdue / Done This Week / Avg Time to Complete, open per
associate chips, Status / Rep / Associate / Type / Due filters that survive a reload, sortable
table from 760px, cards on phones). Light + dark, 390 / 820 / 1366 checked (scratchpad
tasks_test.mjs, 74 checks; screenshots in the session).

v2, not built: push / email notifications (needs a sender; Resend is already set up for sign-in
mail), Supabase Realtime instead of polling, recurring tasks, task templates ("Display" presets per
supplier), multiple photos per completion, a rep's "my route today" grouping for associates (needs
route / stop data we do not have), archiving / auto-archive of old Done tasks (archived_at exists,
nothing sets it yet), a DM-scoped manager view (today every manager sees every task; the DM team
cut used elsewhere is easy to add once Gavin says managers should be scoped), exports.

## 4. Assumptions made (confirm or change)

1. An associate works for any rep — a rep may assign to ANY associate (no team restriction).
2. A task may have no account. The account is free text copied from the rep's book (name + #).
3. Photo required for Display and Tap Handle only; optional for POS and Other.
4. Only the rep who created a task may edit or withdraw it; a manager may also edit / reassign
   (database) but the page gives managers a read-only screen plus the thread.
5. Managers see every task (no DM scoping yet).
6. "Done" tasks stay on the associate's queue for 7 days, on the rep's Done filter for good.
7. Blocked is the associate's "I can't": the rep sees the reason under Needs a Look and decides
   (edit, reassign, or withdraw if unstarted).
8. Notifications are in-app only for now.

## 5. To make it live (Gavin)

1. Run `supabase/migrations/20261014180000_field_tasks.sql` in the SQL Editor (idempotent).
   Until then the page says "Field Tasks are not live yet" (managers see the file name).
2. The nine associates are already on the allow list as role `associate` (your migration).
   They sign in like everyone else and land on /tasks/.
3. Check it on an iPhone as an associate: take a photo through Mark Complete; the photo should
   appear on the task and in the thread.
