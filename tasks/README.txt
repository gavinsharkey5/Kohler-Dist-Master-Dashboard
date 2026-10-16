FIELD TASKS (/tasks/) -- 2026-10-14
===================================
A rep hands account work to a SALES ASSOCIATE (build a display, swap a tap
handle, drop POS, other); the associate works a queue, updates the status,
attaches the completion photo and talks to the rep in one thread; a manager
reads everything. sales-associates/PLAN.md is the plan Gavin asked for (fit,
data model, MVP vs v2, assumptions). This file is the operating reference.

FILES
  index.html, tasks.css, tasks.js      the page (one page, three views by role)
  supabase/migrations/20261014180000_field_tasks.sql
                                       field_tasks, field_task_comments,
                                       field_task_reads, kdh_people(role),
                                       kdh_task_member(id), bucket task-photos
  shared/kdh-user.js                   role 'associate': Home = /tasks/, no
                                       tools, no Not Real Time banner,
                                       sidebar "Sales Associate"; reps and
                                       managers get the "Field Tasks" tool
  middleware.js                        ASSOCIATE_PATHS (/tasks/, /shared/),
                                       home /tasks/; '/tasks/' in REP_PATHS

WHO SEES WHAT (row-level security; the page only draws)
  associate   tasks assigned to them; may change status / photo / note; comment
  rep         tasks they created; edit the definition, reassign, withdraw an
              unstarted task; comment
  manager     every task; comment; read-only screen (the database would let a
              manager edit too -- the page does not offer it)
  preview     a manager viewing as a rep (that rep's tasks), as an associate
              (that associate's queue; View As -> Associate) or as a manager:
              read-only, nothing is written (no New Task, no composer, no
              status control)

RULES (enforced in the database, see the migration's header)
  - creator = the token's email; the assignee must be role 'associate'
  - Display / Tap Handle cannot reach Done without a photo; Blocked needs a
    reason; Done stamps completed_at; reopening clears it
  - every status change is a 'status' line in the thread (trigger)
  - an unstarted (Assigned) task may be withdrawn by its rep; nothing else is
    deleted; archived_at exists for later (nothing sets it in v1)
  - a 2xx from PostgREST is never proof: PATCH / DELETE ask for the rows back
    and count them (tasks.js patchTask / withdraw)

STATUSES   assigned -> in_progress -> done, or blocked (with a reason) from
           either; the associate drives them; the rep may reopen by editing
           nothing -- Reopen is the associate's button

PHOTOS     task-photos/<task id>/<uuid>.jpg, private; resized to 2048px JPEG in
           the browser (EXIF / GPS dropped), XHR upload with progress, then the
           PATCH; the completion photo also posts a 'photo' line to the thread.
           Read through 1-hour signed URLs. Never claimed to sync to iSellBeer.

"NEW" + POLLING   field_task_reads (task_id, email, seen_at). A task is New when
           updated_at > your seen_at (with no row: always, except a task you
           created that nobody has touched). Opening a task marks it read. The
           page re-reads every 30 s while visible and when the tab comes back.

VIEWS      associate  "My Tasks": Overdue / Today / Upcoming / No Due Date /
                      Blocked / Done (last 7 days, closed); circle = Mark
                      Complete; rep initials on the right
           rep        "Field Tasks": Open (Needs a Look = overdue or New, then
                      the rest by due date) / Blocked / Done / All; FAB or
                      header "New Task"; associate initials on the right
           manager    tiles Open / Overdue / Done This Week / Avg Time to
                      Complete; open per associate chips; Status / Rep /
                      Associate / Task Type / Due filters (sessionStorage);
                      sortable table from 760px, cards below
           detail     #task=<id>; form #new / #edit=<id>; Check Your Photo and
                      Can't Do This are sheets

NEW TASK   title (required), details, associate (required; kdh_people), account
           (search the rep's own book: ../hub/data/accounts.js, which the
           middleware serves per rep; optional), type, due date (+ Today /
           Tomorrow / Next Week), priority

NOT SET UP YET   the page says "Field Tasks are not live yet" when the table
           is missing (404 PGRST205); a manager sees the migration file name.

TESTS (scratchpad)   sql_tasks_test.sh (32, local Postgres 16: stamping,
           role limits, photo rule, thread lines, RLS, storage policies),
           tasks_test.mjs (74: every role at 390 / 820 / 1366, light + dark,
           complete-with-photo, blocked, comments with photo, create / edit /
           withdraw, manager filters + sort, preview writes nothing, missing
           migration), mw_test.mjs (associate paths).
