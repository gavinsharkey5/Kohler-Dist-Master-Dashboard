MERCHANDISING: PHOTOS ATTACHED TO RECORDS (2026-10-04)
=======================================================

What it is
----------
A merchandising RECORD is one observation at one account: a display, a
window, a cooler door, a tap wall survey, a menu placement or another
activation. A record has
  * photos   (0..n, in order; a photo belongs to ONE record)
  * lines    (0..n product / brand lines: supplier, brand family, brand,
              package, product #, quantity + unit, and for tap surveys the
              source US/THEM and any audited correction)
  * an optional program (evidence for it -- never credit)
  * its source: "Captured in Kohler Hub" or "Imported From iSellBeer".
One display can list several products and one tap survey several brands;
those stay as lines of ONE record, so photos are never duplicated and counts
are never inflated. Accounts, records, photos and lines are always counted
separately and none of them is called a "placement".

Where it lives
--------------
  supabase/migrations/20261004090000_merchandising.sql   tables + functions
  shared/merch-types.js        categories, subtypes, units, labels (one list)
  accounts/activity.js         capture flow, gallery, viewer, Account Activity
  merchandising/isb-import.js  iSellBeer export parser (no network, no DOM)
  merchandising/import/        manager page: add exports, reconcile, import
  merchandising/ (index.html + recap.js)  manager recap: filters, CSV, PDF

Categories (Hub)
----------------
Display, Window, Cooler Door, Tap Handles, Menu Placement, Other Activation.
Off-premise accounts see Display / Window / Cooler Door / Other first;
on-premise accounts see Tap Handles / Menu Placement / Other first; every
type is one tap away (More Types). Subtypes: Menu, Cocktail List, Spirit
List, Table Tent (menu); Cooler Door Wrap; Tasting / Event and Other with a
description (other activation). iSellBeer's own Promotion Type, Theme and
Elements are kept on the imported record as they were -- never rewritten
into these categories, and an unfamiliar value (e.g. "MBO") is NOT mapped to
a Hub program.

Capture (Account page -> Add Photos, or Add Evidence on a program card)
--------------------------------------------------------------------
Type -> Photos -> Details -> Save Photos. The account, the author and the
time are attached automatically. Take Photo is the phone's own camera
(<input type=file accept=image/* capture=environment>): image only, no video
controls, no microphone, no in-page camera stream. Choose From Photos takes
several at once. Each photo can be retaken (the others, the caption and the
lines stay) or removed. Photos are re-encoded to JPEG with the orientation
applied and EXIF / GPS dropped; long edge 2560 px (3200 px for menus and
other activations, so small print stays readable). HEIC the browser cannot
decode gets a plain message. Quantities are asked only for displays and tap
handles, and a quantity is never saved without its unit. Cancel discards;
closing the sheet keeps a draft.
Add Evidence (on a Program Opportunities card) opens the same flow with the
program and a likely category preselected (keg / draft -> Tap Handles,
on-premise -> Menu Placement, otherwise Display). The card says plainly that
saved evidence is not credit: credit comes only from the tracker's sales
data, and no review / approval rule exists in the data to invent.

Drafts and retries
------------------
A record draft (photos + details) lives in IndexedDB (kdh-drafts, store
"records") under the REAL signed-in person (never a preview identity), so
another person on the same device never sees it. States: Draft -- Saved on
This Device / Pending Upload / Uploading / Saved / Upload Failed -- Retry.
Retry is a tap. Every photo has a stable path and the record a stable key
('hub:'+client uuid) so a retry after a lost reply cannot duplicate anything
(storage 409 = already there; kdh_merch_save restates the same record).
Preview is read-only: no Add Photos, no Add Evidence, no editing.

Importing from iSellBeer (managers: Merchandising -> Import From iSellBeer)
--------------------------------------------------------------------------
Accepted: the Display report, the Raw Reports tap survey report, the Promos
report (.xlsx), and photo PDFs. The files are EXAMPLES of the formats, not a
complete inventory -- import as many as you have; re-importing the same file
restates its records and adds nothing.
  * Matching is by CustomerID ONLY. A CustomerID not in the customer base is
    held out ("unknown account") until checked. Names are never matched.
  * Promo # is not a global ID. Record keys are built from stable fields:
      display  isb:display:<photo uuid>:<CustomerID>:<YYYYMMDDTHHMM>
      taps     isb:taps:<CustomerID>:<YYYYMMDDTHHMM>:<photo file hash>
      promo    isb:promo:<photo uuid>:<CustomerID>:<time>:<promotion type>
    Two records that share a photo link stay two records.
  * Every row becomes a line; two "24 PK" lines stay two lines. A quantity
    with no unit is saved as "unit not stated"; a blank stays blank (never 0),
    a 0 stays 0.
  * Tap surveys keep iSellBeer's US/THEM per line. The Tap Tracker's audited
    side (its embedded tap-data, matched on account + minute + brand) is kept
    BESIDE it as the correction; a photo never overwrites a tap survey.
  * Hyperlink targets are read from the workbook (not the cell text). A link
    that does not load shows "Photo Unavailable" -- nothing is guessed.
  * PDF pages are NEVER matched by position. iSellBeer prints a clickable
    link to the photo on every page ("view-photo/<type>/<photo id>"), the same
    link the export's Photo cell holds; isb-import.js reads it from the page
    tree (also inside the compressed object streams a split / re-saved PDF
    uses) and matchPage() pairs the page with the record holding that photo.
    The page's image is iSellBeer's printed frame (date, account, caption,
    author) around the photo, so it is stored as that photo's REPORT PAGE
    (photo_kind report_page) at <account>/isb-<photo id>.jpg and attached to
    the EXISTING photo row by kdh_merch_attach_photos (migration
    20261005100000_isb_pdf_photos.sql) -- never a second photo, never a
    replaced copy, never another account's folder.
  * The spreadsheet and the PDF may come in different sittings and the PDF in
    any number of parts: the page looks up each page's link among the photos
    already in the Hub. A page whose photo is not in the Hub yet is SKIPPED
    (import the spreadsheet, then add the PDF again) -- not stored, not queued.
  * A page with no readable link gets a "Match To Record" picker (default:
    Leave Unresolved); matched by hand it rides with its record as a report
    page; unmatched it goes to the Review Queue (storage _review/). Only these
    pages are drawn as cards (60 at most); link-matched pages are a list in a
    fold.
  * Records go to kdh_merch_import 150 per call; report pages upload four at a
    time with progress; every step is safe to repeat.
  * The reconciliation is shown BEFORE anything is written: source rows,
    grouped records, product / brand lines, unique photo references, report
    pages matched, duplicates collapsed, unresolved -- per file, with the
    export's own filters and period.
  * Imports never change iSellBeer, and nothing in the Hub claims to.

Recap (managers: Merchandising)
-------------------------------
Filters: account, rep (a district manager sees their team only), dates,
supplier / brand (matches lines and brand tags), category, program, source.
Counts: Accounts, Records, Photos (unique), Product / Brand Lines. Download
CSV = one row per line (a record with no lines = one row), header rows with
the filters, the generated time and the separate counts. Export Recap = a
print page (Save as PDF) with every photo loaded at full column width, the
filters, the definitions and the same counts; it holds the first 150 records
(the CSV holds all). Both use exactly the filtered set on screen.

Permissions
-----------
Row-level security decides everything (kdh_can_access_account): a rep reads
and adds records only on accounts assigned to them; a manager reads all; only
the author edits or removes a Hub record; imported records are read-only for
reps. kdh_merch_import and the review queue are managers only. Photos are in
the PRIVATE account-photos bucket and load with the viewer's own token. The
assistant does not look at photos and says so.

Account page with many imported records (2026-10-05)
----------------------------------------------------
One account can carry 80+ imported displays (Report 68: 58001). The Overview's
recent activity shows the team's own notes, follow-ups and photos and ONE
"Imported From iSellBeer · N records" row (link: the gallery filtered to
imports). Account Activity folds imports into one row per month that opens in
place; the Photos chip or a search lists them one by one. The gallery pages 24
at a time (Show More) with a Source filter (Captured in the Hub / Imported From
iSellBeer). The Overview tiles prefer records whose picture is stored, a
record's tile shows a stored photo before a link, and images load only as they
scroll into view. Counts and filters still include every record.

Not built (on purpose)
----------------------
Quick Visit Recap and Follow-Up From a Note (Gavin, not in this round).
A Snowflake feed: the importer's parser is separate from the writer, so a
feed can produce the same payload later without changing the tables.

Tests (scratchpad): sql_merch_test.sh (local Postgres 16), isb_test.mjs
(the attached exports), imp_test.mjs (import page), merch_capture_test.mjs
(capture, retake, drafts, retry, imported records, preview), recap_test.mjs,
notes_photos_test.mjs / drafts_test.mjs (before the SQL is run).

PHOTO ADMIN (2026-10-05)
A person with allowed_users.photo_admin = true (migration
20261005090000_photo_admin.sql; Gavin, who runs the iSellBeer operation) sees
"Remove (Photo Admin)" on every merchandising record -- someone else's Hub
record or an iSellBeer import -- and "Remove Photo (Photo Admin)" on every
older single photo, never in preview. Removing a record removes its lines,
photo links, photo rows and stored files. An imported record comes back if the
same iSellBeer file is imported again (the import restates by source_key).
Edit Details / Edit Labels stay with the author.
