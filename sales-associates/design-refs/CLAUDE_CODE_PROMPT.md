I want to add a "Sales Associates" section to the kohlerdisthub site.

## Context
Kohler Distributing has 27 sales reps and a smaller team of sales associates. Associates support reps in the field by doing tasks like:
- Building or putting up a display
- Dropping off a tap handle
- Delivering POS materials
- Other one-off account support

Right now these handoffs happen through texts and calls, so nobody has a clear record of what was asked for, who's handling it, or when it got done.

## Goal
Give reps and associates one shared place to assign, track, and close out field tasks, with a message thread attached to each task.

## Users and permissions
- **Reps:** create tasks, assign them to an associate, see the status of everything they've assigned, and comment on their tasks.
- **Associates:** see tasks assigned to them, update status, comment, and attach a completion photo.
- **Managers (optional):** read-only view of all tasks, filterable by rep, associate, and status.

Each person signs in and sees only what applies to them.

## Task fields
- Account (name and customer ID; a searchable account list if possible)
- Task type: Display, Tap Handle, POS Delivery, Other
- Description / instructions
- Assigned rep (creator) and assigned associate
- Due date
- Priority: Normal or Urgent
- Status: Assigned → In Progress → Done (also Blocked, with a required reason)
- Completion photo (required for Display and Tap Handle, optional otherwise)
- Created, updated, and completed timestamps

## Communication
- Each task has its own comment thread, so the conversation stays tied to the work.
- Marking a task Done should notify the rep (in-app at minimum; push or email is a nice-to-have).
- New assignments should notify the associate.
- No general chat. All messages are attached to a task.

## Constraints
- Must work well on iPhone and iPad, since people use it on route. Use large tap targets, as few screens as possible, and camera upload for photos.
- The data has to persist and sync between users, so this needs a real backend with authentication. Propose an approach that fits the current site's hosting. I'm open to Supabase (auth, Postgres, storage, realtime).
- Keep credentials out of the public repo.
- Match the existing site's look and navigation. Use the references below for layout and interaction patterns only, not their branding.

## UI references (from Mobbin)
The Mobbin links require a login, so the screenshots in `sales-associates/design-refs/` are the
references. OPEN EACH IMAGE before planning. The description under each one is the spec to follow.

| File | Screen | Mobbin |
|---|---|---|
| `01-attio-my-tasks.png` | Attio "My tasks" (ref 1) | screens/c45cd1e7-9589-42fd-8408-b8a6fe179a4b |
| `02-jira-created-list.png` | Jira "Created" list (ref 2) | screens/9629d831-6d43-47b1-b34b-1301ec53b962 |
| `03-asana-task-detail.png` | Asana task detail (ref 3) | screens/2d189b6c-20b0-4eb3-a9d7-2b953e83ca39 |
| `03b-jira-status-dropdown.png` | Jira issue detail, status dropdown (ref 3) | screens/7c1e95a2-013d-457d-bb27-26daed88c591 |
| `04-jobber-new-task.png` | Jobber "New task" (ref 4; a sibling screen of the same form, not the exact id) | screens/854ee5fb-2d51-4c9b-9bd2-c561b29bb401 |
| `04b-clickup-quick-create.png` | ClickUp quick create sheet (ref 4, optional) | screens/68d9e4f5-2c4b-4d7f-b3e2-2f8ec4720f3c |
| `05-bolt-check-photo.png` | Bolt "Check your photo" (ref 5) | screens/c1644532-7dde-43ff-bd48-d18070da05fe |
| `06-airtable-overview.png` | Airtable overview with filter chips + status pills (ref 6; a sibling screen, not the exact id) | screens/56681290-7954-4b16-b6f6-daf753c2c0fc |

### 1. Associate queue ("My Queue") — model on Attio "My tasks"
https://mobbin.com/screens/c45cd1e7-9589-42fd-8408-b8a6fe179a4b
- Large page title at the top.
- Collapsible sections with counts. Use Overdue / Today / Upcoming / Done (collapsed by default).
- Each row has a circle checkbox on the left, the task title, and a second line of small chips for due date and account name. Assigning rep's initials go in an avatar on the right.
- Overdue due dates appear as a red-tinted chip.
- Floating round "+" button in the bottom right (reps only).
- Urgent tasks sort to the top within each section and get a small red "Urgent" tag.

### 2. Rep's assigned-tasks view ("Tasks I Assigned") — model on Jira "Created" list
https://mobbin.com/screens/9629d831-6d43-47b1-b34b-1301ec53b962
- Card-style list in which each row shows the title, then a second line with a colored status pill and the due date.
- Status pill colors: Assigned = gray, In Progress = blue, Done = green, Blocked = red.
- Done tasks show a completed checkbox and remain visible until the rep archives them or 7 days pass.
- Show the associate's name or initials on each row so the rep can see who has it.

### 3. Task detail with message thread — model on Asana task detail
https://mobbin.com/screens/2d189b6c-20b0-4eb3-a9d7-2b953e83ca39
- Top bar has a back arrow and a prominent "Mark complete" button. Associates see "Mark complete"; reps see the current status.
- Task title in large text.
- Two-column row for "Assigned to" (avatar and name) and "Due date".
- Field rows for Account, Task Type, Priority (colored pill), and Status.
- Description block, then an attachments area showing the completion photo thumbnail.
- Comment thread below that, oldest first, with avatar, name, timestamp, and message on each comment.
- Comment input pinned to the bottom of the screen with a camera/photo button.

Also borrow from Jira's issue detail (https://mobbin.com/screens/7c1e95a2-013d-457d-bb27-26daed88c591): make status a large tappable colored dropdown near the top, so changing it takes one tap plus one selection.

### 4. Create / assign task — model on Jobber "New task"
https://mobbin.com/screens/ccc080fe-4001-497f-bdc3-53185ca9f85f
- Full-screen form with an X to close and a "New task" title.
- Outlined input boxes with floating labels for Title and Description.
- Tappable rows with icons and right arrows for Associate (person icon) and Account (store icon). Each opens a searchable picker.
- Task Type as segmented buttons: Display / Tap Handle / POS / Other.
- "Schedule" section with a Due date field.
- Priority toggle for Normal / Urgent.
- Full-width primary Save button fixed at the bottom.

Optional quick-create alternative, modeled on ClickUp (https://mobbin.com/screens/68d9e4f5-2c4b-4d7f-b3e2-2f8ec4720f3c): a bottom sheet with title, assignee, and due date, plus a "Create" button. Build this only if it's simple to add on top of the full form.

### 5. Completion photo — model on Bolt "Check your photo"
https://mobbin.com/screens/c1644532-7dde-43ff-bd48-d18070da05fe
- Flow: associate taps "Mark complete" → camera or photo library opens → confirmation screen.
- Confirmation screen has a back arrow, a "Check your photo" title, and a large photo preview.
- Optional note field below the photo.
- Two stacked full-width buttons: primary "Submit & Complete" and secondary "Retake photo".
- On submit, set status to Done, record the completed timestamp, post the photo into the comment thread, and notify the rep.
- For Display and Tap Handle tasks, block completion until a photo is attached.

### 6. Manager overview (desktop / iPad) — model on Airtable task overview
https://mobbin.com/screens/1ccf6613-4abd-420f-9d18-ac7b40a04848
- Filter chips across the top for Status, Rep, Associate, Task Type, and Due Date.
- Table columns: Status (colored pill), Task, Account, Rep, Associate, Due Date, Priority (colored pill), Completed At.
- Sortable columns.
- Summary strip above the table: open tasks per associate, overdue count, and average time to complete.
- On phone width, collapse the table into the card list from reference #2.

## What I want from you first
Before writing code:
1. Review the current site structure and tell me how this section fits into it, including navigation and where each view lives.
2. Propose the data model (tables and fields) and the backend/auth approach.
3. Recommend an MVP scope: what's in v1 and what waits for v2.
4. List any questions you need answered.

Then build the MVP once I confirm. Build it mobile-first and check every view at iPhone width before calling it done.