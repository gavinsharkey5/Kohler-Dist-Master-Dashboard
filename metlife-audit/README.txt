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
  2. The banner shows the next location number, e.g. 125-01. Pick
     Cooler / Taps / Both, add brands (chips or type-ahead) with a +/-
     stepper for facings or taps, take photos, Save & next.
  3. The number advances to 125-02 automatically. "Change section"
     prompts for a new section and restarts at NNN-01 (or continues
     from the highest existing number if you come back to a section).
     "Edit #" overrides the number for one save.
  4. Everything is saved in the browser's IndexedDB on that phone
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
  it with brands, facings, taps and photos. Map color modes: locations
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
  Kohler portfolio editable list under Log -> Settings (defaults are a
                   best guess from this repo's supplier folders; fix the
                   list on the device before presenting).

Map geometry is SCHEMATIC: three rings, 101-149 lower, 201-250
mezzanine, 301-350 upper, section 01 at the top center, numbers
increasing counter-clockwise. Section letters (e.g. 227A) map onto the
numeric section. It is not a seat-accurate plan.

Preview with fake data: index.html?demo=1 (in memory only, never saved).
