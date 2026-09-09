MetLife Beer Audit folder

Mobile data-capture form + management dashboard for auditing beer
distribution (cooler facings and draft taps) at MetLife Stadium. Built
from Chris Politano's 2026-09-08 "Need some AI help" email. Single-file
app, no build step, no generator script.

Files:
  index.html            The whole app: Audit form, Log, Dashboard + map.
  sw.js                 Service worker (network-first) so the form opens
                        with no signal inside the stadium.
  manifest.webmanifest  Lets it be "Added to Home Screen" as an app.
  data/audit.json       OPTIONAL published dataset (see data/README.txt).
                        Not present until someone exports and commits it.

How the audit works (phone):
  1. Open the page, Audit tab. Enter auditor, event/game, starting
     section (e.g. 125). Start audit.
  2. The banner shows the next location ID, e.g. 125-A. Pick a Location
     description (Corona Bar, Miller Lite Bar, Modelo Cantina, Nacho
     Stand, Burger Stand, Concession Stand, Portable Bar, Beer Cart, or
     Other -> required write-in). Pick Cooler / Taps / Both.
  3. Brands come from four fixed pickers: Cooler Ours, Cooler Theirs,
     Tap Ours, Tap Theirs (lists are the BRANDS constant at the top of
     the script in index.html). "Other" on a Theirs picker opens a
     required write-in (with an Ours/Theirs toggle). Each brand row has
     a +/- stepper for facings or taps. Take photos, Save & next.
  4. The letter advances to 125-B automatically (A..Z, then AA, AB...).
     "Change section" prompts for a new section and restarts at A, or
     continues from the highest existing letter if you come back.
     "Edit #" overrides the ID for one save (e.g. 125-E); an ID that
     already exists in the audit is refused, never overwritten.
  5. Saved locations in the current section show as chips under the
     banner ("125-A · Corona Bar"); tap one to reopen and edit it,
     including changing its letter with "Edit #".
  6. Everything is saved in the browser's IndexedDB on that phone
     (photos compressed to 1280px JPEG). Nothing leaves the device
     until you export.

Getting data off the phone / combining auditors:
  Log tab -> Export (with photos) -> Share sheet (AirDrop, email, Files).
  Import merges another phone's export into this one; the newest edit of
  each location wins, so two auditors can each export and one device (or
  the dashboard viewer's laptop) can import both.

Publishing for management:
  Save an export as metlife-audit/data/audit.json, commit and push. The
  dashboard loads it on every visit (merged with anything on the viewing
  device). CSV export is also available for the spreadsheet crowd.

Dashboard:
  KPIs, brand metrics with a metric selector, share by stadium level,
  share by section, brand table, and the schematic stadium map. Hover a
  section for a summary; tap/click it to list every audited location in
  it with description, brands, facings, taps and photos. Map color modes: locations
  audited, leading brand, a chosen brand's share, Kohler portfolio share.
  Named areas that are not numbered sections (clubs etc.) appear as
  buttons under the map.

Metric definitions (also under "How each number is calculated" on the
dashboard):
  Brand share      brand facings + taps / all facings + taps
  Facings share    brand facings / all cooler facings
  Draft share      brand taps / all taps
  Cooler share     % of cooler locations with >= 1 facing of the brand
  Distribution     % of all audited locations carrying the brand
  Our brands       any brand added from an "Ours" picker (or written in
                   as ours). Each brand row stores an `ours` flag; rows
                   without one fall back to the Ours lists.

Map geometry is SCHEMATIC: three rings, 101-149 lower, 201-250
mezzanine, 301-350 upper, section 01 at the top center, numbers
increasing counter-clockwise. Section letters (e.g. 227A) map onto the
numeric section. It is not a seat-accurate plan.

Preview with fake data: index.html?demo=1 (in memory only, never saved).

Data record (JSON export, one per location):
  key, id (125-A), event, section, level, seq (1 = A), type
  (cooler|taps|both), desc, cooler:[{brand, n, ours}], taps:[{brand,
  n, ours}], notes, photoIds / photos, auditor, createdAt, updatedAt.
  The first version numbered locations 125-01 and had a "stand" field;
  the app upgrades those records in place on load (01 -> A, stand ->
  desc). CSV export has one row per brand line with Description and
  Ours/Theirs columns.
