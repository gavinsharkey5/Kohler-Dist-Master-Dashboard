Manage Programs -- manager-built incentives and MPOs (2026-10-08, v2 the same day)
===================================================================================

What it is
----------
/manage-programs/ lets a manager build an incentive or an MPO without code:
seven steps (Basics, Participants & Accounts, Products, Dates & Rules, Goals,
Financial Terms, Preview & Submit), saved as drafts, submitted to the program
approver, approved, and then drawn by the EXISTING Programs experience --
the hub's incentive rows / program screen and the On- / Off-Premise MPO
tracker cards (the Option 2 layout: Details + Potential Accounts). There is
no second program system: the definition is data, the renderers are the
pages reps already use.

First milestone (built): a clearly labelled TEST program can be created,
submitted, approved and seen in the Programs experience by its participants
(through a manager's Preview as this rep), with no effect on live incentives.

Version 2 (2026-10-08): the builder itself
------------------------------------------
Gavin's brief: spacious, plain language, precise selections, no lost
position. What holds (manage.js / manage.css tag 20261008b):
  LAYOUT     1120px page, 240px step navigator + the form; 16px inputs and
             body, 14px supporting text, 22px step headings, 46px inputs,
             44px rows. iPad: 200px navigator; phones: navigator as pills,
             one column, dialogs as bottom sheets.
  STEP NAV   current step highlighted; a VISITED step shows a green check
             when it validates and a red "!" when it does not; a step you
             have not opened yet is neutral (never shown as an error). The
             Preview step lists every blocker with a link to its step.
  SAVING     "Saved 3:33 PM / Saving… / Unsaved changes" in a fixed-width
             span beside Next, so nothing shifts. Save Draft, Back, Next
             and the step buttons all save; re-renders keep the scroll
             position and the focused control (renderWizard({keep:true})).
  COPY       Program Title, Choose Participants By (Individuals / Team /
             Everyone I Manage), Eligible Accounts, Which Accounts Count?,
             Choose Products / Add Products / Exclude Products, Selected
             Products, Excluded Products, Advanced Product Settings, Dates &
             Rules, Add Objective, Add Payout Term. Title Case for names
             and actions, sentence case for explanations; long explanations
             sit behind a "?" help fold.
  PEOPLE     the picker never re-renders on a tick: pickChanged() updates
             the definition, the "N selected" chip, the participants /
             eligible-accounts line and the step's error line in place, so
             the page keeps its scroll, the focus stays on the checkbox and
             the search text survives. Search by name, a team select (DM
             groups), Selected Only, and bulk actions scoped to what is
             shown and allowed: "Select All N Filtered" / "Clear Filtered"
             (people outside the creator's scope are disabled and never
             bulk-selected).
  PRODUCTS   Add Products opens a dialog (Shopify's pattern): search by name
             or ProductID, filters Supplier / Brand Family / Package /
             Category (draft vs package), a checkbox per SKU with the name
             first and package + ProductID + supplier under it, "N selected",
             Cancel / Add Selected Products. Ticks persist across searches
             and filters; filtering a brand selects nothing. With a family,
             supplier or package filter set (and no search text) a separate
             button adds the WHOLE group as one rule and says exactly what it
             adds ("Add Entire Brand Family: Corona Extra (14 products)").
             Already-selected SKUs are shown disabled ("already selected"),
             so the list is deduplicated by ProductID. Selected Products is
             a searchable list with Remove per row; a group shows as a chip
             with its own x. Removing a SKU that came from a group writes an
             explicit {type:'sku'} exclusion (Excluded Products, with
             Restore); removing a SKU that was added individually just drops
             it. Exclude Products opens the same dialog over the selected
             list. Definition fields are unchanged (products.include /
             exclude / dynamic / resolved), so the preview, the evaluator
             and the published program read the same list.
  ADVANCED   Advanced Product Settings: "Keep the Approved Product List"
             (Recommended; products.dynamic=false) or "Automatically Include
             New Matching Products" (dynamic=true), the second enabled ONLY
             when a family / supplier / package rule exists -- a SKU-only
             list can never expand. Exclusions hold either way
             (custom-programs.js resolveProducts applies exclude after
             include). collect() forces dynamic=false when no rule exists.
  ACCOUNTS   "Which Accounts Count?": "Keep the Starting Account List"
             (Recommended, baseMode fixed) / "Update With Route Changes"
             (dynamic). Behaviour, reconciled with v1: a draft re-reads the
             account books from the current route on every save (so a draft
             never freezes early); submitting sends that list and approval
             locks it (program_versions.definition.participants.accountBase
             of the approved version); a revision of a live program keeps
             the approved list for every rep whose account filter is
             unchanged (resolveParticipants, approvedVersion()), so a route
             change never moves credit by itself; dynamic programs are
             re-read from the books at every view (custom-programs baseFor).
  DELETE     "Delete Program" (red outline, apart from Save / Submit) on the
             review page and the builder header; a confirmation names the
             program, its status, and the effects (moves to Deleted
             Programs, leaves the approval queue, removed from participant
             views now when it was live, nothing destroyed, shared data
             untouched). kdh_program_delete (migration
             20261008180000_program_delete.sql): status 'deleted' +
             deleted_at / deleted_by / deleted_from; the owner or a manager
             whose scope covers it may delete a draft or a TEST program, the
             approver anything; a published real program is the approver's.
             Deleted Programs tab -> Restore (kdh_program_restore: a draft
             comes back as it was, a submitted one as a draft to resubmit, a
             program that was live comes back as an UNPUBLISHED draft that
             keeps its approved version, tagged "Not Published") -> the
             approver's "Publish Approved vN" (kdh_program_republish; closed
             stays closed; participants get a notice). While deleted:
             kdh_program_can_edit is false and a trigger refuses every other
             status change; kdh_my_programs / kdh_my_program_notices never
             return it. History records deleted / restored / republished.
Tests (scratchpad): mp2_test.mjs (77 checks: scroll / focus / search kept
while ticking, bulk scoped to the filter, Selected Only, team filter,
Back keeps the selection, option cards + default, Save keeps the scroll,
exact SKUs via search, filter selects nothing, group add, dedupe, remove
one SKU -> exclusion -> Restore, advanced option enabled only with a
rule, reopen keeps everything, untouched steps not errors, submit ->
approve -> delete (confirm names it) -> restore (not published) ->
publish again, DM permissions, dialog fits, Escape closes) at 1366 /
820 / 390, light / dark; sql_programs_test.sh (80, incl. delete /
restore / republish); mp_test.mjs (59) still passes.

Pieces
------
  manage-programs/index.html + manage.css + manage.js   the page (managers only)
  shared/custom-programs.js (window.KdhPrograms)       loads approved programs
       for the viewer, evaluates every objective in the browser, hands the
       results to hub/hub.js (window.KDH_CUSTOM_PROGRAMS) and the MPO pages
       (window.KDH_CUSTOM_MPOS); draws the participant notice (#kdhProgNotice)
  supabase/migrations/20261008120000_manage_programs.sql  tables, RLS, RPCs
  supabase/migrations/20261008180000_program_delete.sql   Delete / Restore / Publish Again
  supabase/seed/product_master.sql, program_brands.sql    generated by
       tools/program_seed.py (REVIEW program_brands.sql before running)
  tools/program_history.py   accounts/data/hist/<rep key>.json (net cases per
       product per month, Jan 2025 -> last loaded month, one file per rep,
       served per rep by the middleware) + accounts/data/products.json (no
       customer data). Runs at the end of accounts/generate.py.

Who may do what (decided in the database, mirrored in the UI)
-------------------------------------------------------------
  program approver   allowed_users.program_admin = true (Gavin). Identified by
                     the flag, never by name. Creates, edits any, approves,
                     returns, closes out, archives published programs.
  any manager        creates drafts, edits / submits / withdraws their own.
  brand manager      allowed_users.program_brands = the suppliers they own:
                     any participant, products of those suppliers only.
  district manager   reps whose reports_to chain reaches them: their team
                     only, any product.
  neither            saves drafts, cannot SUBMIT a program that names
                     participants or products ("no team or brand assignment
                     on file"). A missing assignment never widens access.
  nobody             approves their own program except the approver.
  reps / associates  read only approved, non-test programs they are listed
                     in, with no financial terms (kdh_my_programs strips the
                     finance table entirely -- it is never selected).
The page shows the same answer the server gives: kdh_program_scope() drives
which people / suppliers can be picked, kdh_program_scope_problem(def) is
shown on Preview & Submit and disables Submit; the RPCs re-check everything.

Lifecycle
---------
  draft -> submitted -> approved (v1 live) -> [revision: a new draft version,
  v1 stays live until the new one is approved; approval needs a RECALC choice:
  retroactive (re-score from the start) or future (from today)] -> ended
  (end date passed; "Ended -- Awaiting Closeout") -> closed (the approver
  locks the result with a data-through date; kdh_program_closeout) ->
  archived. "Return" sends a version back with a note. Withdraw takes a
  submitted version back to draft. Duplicate makes a TEST copy. Extension =
  a revision that moves the end date (notice kind "extended").
  Phase on the list = phase() in manage.js: closed / archived / submitted /
  returned / draft (no approved version) / ended (end < today) / scheduled
  (start > today) / active.

Test programs
-------------
  isTest (ticked by default on a new program). Shown as "TEST -- Not an
  Active Incentive" / "TEST -- Not an Active MPO" everywhere; listed on the
  Test Programs tab AND on its status tab tagged TEST. A real rep never
  receives a test program or its notices; a manager previewing a rep does
  (kdh_my_programs(p_rep) with a manager token). Excluded from payouts,
  recaps, exports (hub programsForExport skips isTest) and participant
  notices. A test program may be submitted with unsupported objectives; a
  real program cannot (hard block on Preview & Submit).

Definition (program_versions.definition, jsonb, v:1)
---------------------------------------------------
  title, fullName, kind 'incentive'|'mpo', audience ['rep'|'associate'],
  supplier, description, docUrl, docName, isTest
  participants { mode, reps[], associates[], teams[], resolved{reps[],
      associates[]}, accountFilter{premise any|off|on, territory any|core|
      south, accounts[], unmatched[]}, baseMode 'fixed'|'dynamic',
      accountBase{ "<rep>": [customer #, ...] } }
    fixed (default) = the eligible accounts are frozen at submission from the
    rep's book (hub/data/accounts.js); dynamic = re-read from the book on
    every view. Territory core = Bergen / Passaic / Passaic-FF / Morris 1 /
    Morris 3 / Sussex ("Sales" placed by county), south = Essex / Hudson /
    Union, as tools/customer_base.py.
  products { include[{type sku|family|brand|supplier|package|draft, value}],
      exclude[...], dynamic, resolved[{id, name, supplier, family, package,
      draft}] }
    resolved = the product IDs frozen at submission (a product added to a
    family later does NOT join unless dynamic is on).
  period { type 'fixed'|'rolling', start, end, rollingDays, baseline{mode
      none|fixed|prior_year|prior_period, start, end}, nonBuyDays,
      creditEvent 'sales_month' }
    Credit is by SALES MONTH of the monthly sales record (there are no
    invoice dates); the non-buy window is counted in whole months.
  objectives [{ id, label, metric, minSkus, minCases, premise any|off|on,
      scope individual|house, logic required|alternative|prerequisite,
      requires <objective id>, followOn{start,end}, comparison{start,end},
      merch{category, needBeforeAfter}, goal{type fixed|individual|
      pct_of_base|house, value, pct (a FRACTION: 0.5 = 50%), rounding ''|up|nearest|down,
      perRep{"<rep>": n}} }]
    metrics: buying_accounts, new_buyers, placements, new_placements,
    retention, units (cases), growth, merch, photos (METRICS in manage.js).
    logic: required = must be met; alternative = any one of the alternatives
    satisfies the group; prerequisite = another objective (requires) is locked
    until this one is met; a house objective is the team total.
  Finance is NOT in the definition: program_finance.terms {items[{objectiveId,
  kind per_unit|flat|tiered|package, rate, qualifier, houseEffect, rateBoth,
  billback, tiersText, packagesText}], notes}. kdh_program_save strips any
  finance / payout / rates / billback / dollars key that lands in the
  definition, so a dollar can never reach a participant query.

Support status per objective (never a fabricated number)
--------------------------------------------------------
  supported          computed from loaded sales months
  awaiting_data      the earning period has no loaded sales month yet (the
                     card says so; the value is not 0)
  awaiting_calc      saved, not computed here: house totals on a rep's page,
                     a rolling window, growth / retention without a
                     comparison period
  awaiting_evidence  merch / photos: Hub records counted as RECORDED, never
                     as satisfied
  awaiting_decision  a fractional account goal with no rounding rule, no
                     goal for the rep, no products, no period
  Rounding is never silent: pct_of_base with a fractional result and no
  rounding rule is "Needs a decision" until the builder picks up / nearest /
  down or a whole-account target. A real program with any objective beyond
  supported / awaiting_data cannot be submitted.

How it reaches the Programs pages
---------------------------------
  Incentive kind: KdhPrograms.hubEntry() -> window.KDH_CUSTOM_PROGRAMS ->
  hub.js buildPrograms() pushes an entry (id inc:cp_<8 chars>, type
  Incentive) whose getRep blob carries accountList / partialAccounts; the hub
  rows, program screen, Eligible Accounts and marks all work unchanged;
  `Test` tag on the row. MPO kind: KdhPrograms.mpoEntries() ->
  window.KDH_CUSTOM_MPOS [{scope off|on, month, objective, metricFor,
  detailHtml, potential}] -> each MPO index.html's customFor(monthKey)
  appends the objective to the month (weight null = "Manager-built objective
  -- no MPO weight", skipped by weightedForRep); guided.js draws the same
  v4 card with Details + Potential Accounts. Notices: kdh_my_program_notices
  -> #kdhProgNotice on the rep home / hub (dismiss = program_notice_reads).

Tests (scratchpad)
------------------
  sql_programs_test.sh   56 checks on a local Postgres 16 (scope, strip,
                         rep reads nothing, DM / brand limits, no
                         self-approval, test visibility, revision keeps v1
                         live, recalc required, closeout)
  mp_test.mjs            59 browser checks end to end against mp_stub.mjs
                         (create -> reopen -> submit -> approve -> hub row +
                         program screen -> MPO card -> revision + notice ->
                         ended + closeout -> brand manager / DM scope), at
                         1366 and 390, light and dark
