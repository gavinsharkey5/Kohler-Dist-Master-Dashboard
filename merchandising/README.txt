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
Display, PODs, Cooler Door, Window, Signage, Tap Handles, Menu Placement,
Other Activation (PODs + Signage added 2026-10-05: migration
20261005120000_merch_pod_signage.sql). Off-premise accounts see Display / PODs
/ Cooler Door / Window / Signage / Other first; on-premise accounts see Tap
Handles / Menu Placement / Signage / Other first; every type is one tap away
(More Types). Displays and PODs ask for product lines with a unit.
Tap Handles ask for tap lines (brand + handles), each labelled Ours / Theirs
from shared/data/tap-rules.json for the account's distribution area (built by
isellbeer/tap-survey-tracking/build_tap_rules.py from the Tap Tracker's US vs
THEM workbook; see that README). A brand the rulebook does not cover gets Ours
/ Theirs buttons; saved as ownership_source + ownership_rule ('territory' or
'rep') -- migration 20261005140000_tap_us_them.sql. Subtypes: Menu, Cocktail List, Spirit
List, Table Tent (menu); Cooler Door Wrap; Tasting / Event and Other with a
description (other activation). iSellBeer's own Promotion Type, Theme and
Elements are kept on the imported record as they were -- never rewritten
into these categories, and an unfamiliar value (e.g. "MBO") is NOT mapped to
a Hub program.

Capture (Account page -> Add Photos, or Add Evidence on a program card) -- REDESIGNED 2026-10-05
-------------------------------------------------------------------------------------------
The selected type decides the form; nothing is asked twice and no field shows
that does not apply. Flow: type -> photo -> that type's items -> Save. The sheet
is "Add <type>" with the account underneath, a scrolling body, and a footer
(Cancel / Save) that follows window.visualViewport so it stays above the phone
keyboard. There is NO generic Caption / Brands / Program / Location / Products
block: record brand tags are derived from the items, a note is the optional
"+ Add Note", a program is set only by Add Evidence on a program card (shown as
"For <program> · Remove").
ITEMS (shared/merch-types.js ITEMS; one merch_lines row each; codes in
merch_lines.attrs, price in merch_lines.consumer_price -- migration
20261005160000_capture_items.sql):
  PODs / Display    SKU (search) -> POD Type (Door / Shelf / Special; Display
                    defaults to Special) -> Location (Top / Eye Level / Well) ->
                    Facings (stepper) -> Price to Consumer (optional, $ keypad)
  Cooler Stickers   Brand -> Sticker Type -> Cooler -> Placement
  Windows           Brand -> Material -> Window -> Theme (optional, Custom = text)
  Signage           Brand -> Signage kind -> Theme (optional)
  Menu Placements   Brand or SKU -> Placement -> Menu -> Price (optional) ->
                    Promotion (optional)
  Tap Handles       Location once (Main Bar / Back Bar / Service Bar / Patio /
                    Other) -> + Add Brand -> handles stepper; Ours / Theirs from
                    the territory list (asked only for a brand it does not cover);
                    totals "N taps · N Kohler · N competitor" calculated
  Other Activation  What is it? (required) + optional brands
Fields appear one decision at a time (the next chip group shows once the previous
required one is answered); "Done" folds an item into one line ("Shelf · Eye Level
· 4 facings · $19.99", Edit / ×); "+ Add Another SKU / Sticker / Placement / Brand"
adds more items under the same photo. Search (a full-height panel) lists this
account's own products first ("Bought here", from its sales file), then Kohler's
catalogue (accounts/data/catalog.json), then other brands from the territory list
(competitors), with "Use “…”" for anything else. Photos: Take Photo (native
camera, image-only input) / Choose From Photos; thumbnails carry Retake and Remove;
+ Photo / Library tiles add more. Save shows progress in the button, refuses a
second tap, and on failure keeps everything (draft) with the reason in the footer
and Save -> Retry. SAVE FOR LATER (footer: Cancel · Save for Later · Save) keeps
exactly what is there on this phone -- no required-field checks, no upload -- and
closes; it waits under "Not Yet Saved" ("Saved for Later") on that account and in
a "Saved for Later" strip at the top of My Accounts (every account, this signed-in
person only, not in preview), and Continue reopens it. Nothing reaches the
account until Save. Device-only: another phone or a cleared browser does not
have it. Required: a photo; for every type but Other at least one item;
each item's required groups; tap location and every tap's Ours / Theirs.
Account Activity shows a Hub capture as its items ("POD · 2 SKUs", "Tap Handles ·
Main Bar", one line each, 3 shown + "N more", tap totals); the viewer lists every
item; the recap's Excel has Price to Consumer + one column per detail (POD Type,
Shelf Location, Sticker Type, Cooler, Placement, Material, Window, Theme, Menu,
Promotion), the CSV a consumer_price and a details column.

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
Download Excel (2026-10-05, merchandising/xlsx-write.js, no library) is the
iSellBeer-style export of the same view: sheet Records = one row per line
(Date, Account #, Account, Town, Premise, Rep, Category, Subtype, Supplier,
Brand Family, Brand, Package, Product #, Quantity, Unit, iSellBeer US/THEM,
Tap Tracker Audit, Record Brands, Caption, Location, Program, Taken By,
Source, Photos, Photo .. Photo 6, Open in Hub, Record ID); sheet About = the
filters, separate counts and link expiry. Hub photos get 7-day signed links
(KdhData.signUrls, made with the manager's own token, so only photos they can
read); imported photos keep iSellBeer's link; Open in Hub always works for a
signed-in manager.

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


PHOTO WORKSPACE (2026-10-07, managers: /merchandising/)
-------------------------------------------------------
Same records, photos, filters, permissions and exports; new presentation. recap.js render():
  * Wide gallery (main.wrap.gal, up to 1680px): one CARD per record -- lead photo (contained, never cropped, 4:3 frame,
    "N Photos" badge), account, type chip, town + date ("Observed on" for iSellBeer), rep and a short brand line.
    Full product lists, tap lines, captions and source live in the viewer. Thumbnails load as they scroll into view.
  * Summary line "N Accounts . N Records . N Photos" (+ product / brand lines, secondary). Filters: Account, Photo Type,
    From / To, Rep always; More Filters = Town, Premise, Brand or Product, Program, Source. Active filters are removable
    chips + Clear Filters. All in the hash (also town, prem); newest first.
  * Viewer (openViewer): large photo, Close, Previous / Next, "Photo 1 of 3", zoom (buttons, wheel, pinch, drag to pan),
    Escape / arrow keys, focus trapped and returned to the thumbnail, loading + "Try Again" failed state. Details beside the
    photo from 900px, in a "Record Details" fold under it on phones: Account (+ Open Account), Observation (type, Observed /
    Taken on, Photographer, Assigned Rep), Products / Brands, Notes, Source, Program (evidence, not credit). The hash carries
    rec= / ph= so a reload reopens it. Open Account passes from= (the gallery hash) and the scroll + "Show More" depth go
    in sessionStorage kdh_merch_pos, so Back lands on the same filtered gallery at the same place.
  * Export scope: checkboxes (separate from opening a photo) choose records; with none selected every MATCHING record is
    exported (Excel, CSV, Photo PDF all read exportRows()). The line under the buttons says which. "Export Photo PDF" is a
    PRINT VIEW (Print -> Save as PDF), labelled so; it holds up to 300 records (RECAP_MAX) and says how many photos could
    not be loaded. Excel and CSV always hold every record in scope.
  * Access is unchanged: RLS decides what loads; a district manager is narrowed to their team (kdhTeam). A manager who is
    not a DM still sees everyone -- there is no per-manager "company-wide" flag to check yet.
Test: scratchpad mg.mjs (stubbed Supabase, 130 records incl. no-photo, 3-photo, a failing photo).

PHOTO ADMIN DELETE ON THE GALLERY (2026-10-07)
----------------------------------------------
The viewer's details panel shows "Photo Admin": Delete This Photo and Delete Record (and All Photos) ONLY when
rpc kdh_is_photo_admin() is true for the signed-in account (allowed_users.photo_admin, migration
20261005090000_photo_admin.sql, set by hand in Supabase for ONE account -- no email in the repo) and never in preview.
Row-level security still decides each DELETE, so another sign-in gets nothing even from the console; every DELETE asks for the
removed rows back and a 0-row answer says "Not deleted" instead of success. The stored file is removed after its row; a
file that could not be removed is reported. A photo-only entry (no record) offers Delete This Photo only. Test: scratchpad mgdel.mjs.
