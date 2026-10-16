Kohler Korner newsletter creator

The Manager route remains /kohler-korner/. Digital, preview and print views
use model.js and newsletter.css. No runtime package dependencies were added.

Access
  Existing allowlisted users can read immutable published versions at
  /kohler-korner/read/#version=<version UUID>. The reader without a version
  lists previous editions. The existing login gate still protects it.
  Drafts and sample materials are restricted by Postgres RLS and RPC checks.
  Editing requires BOTH allowed_users.role = manager and newsletter_editor.
  Initial grants: Gavin Sharkey's existing program-admin account, Frank
  Politano, Chris Politano, Tom Gibbons. Talha Sadik is pending an account.
  Section assignments coordinate work; all granted editors can edit sections.
  Grant/revoke newsletter_editor through the existing Supabase Table Editor
  after identifying the exact authorized account. No new role system.

Drafts and versions
  Save Draft persists the complete edition in newsletter_editions.
  Saved changes survive refresh, sign-out and device changes. Unsaved edits
  are guarded when leaving; the interface clearly reports unsaved changes.
  The revision check rejects stale saves instead of overwriting other work.
  Copy unsaved text before reloading a conflicting draft.
  Creation can reuse the most recent non-sample edition's section structure
  (titles, types, order, hidden state and assignment), never its content.
  Publication requires every populated visible section to be reviewed and
  Complete, plus a separate confirmation. Editing invalidates that section's
  reviewed state. Empty or hidden sections are omitted.
  newsletter_versions are immutable snapshots. Publishing again creates a
  new version/link. Old versions and their photographs remain unchanged.
  No delete/update table permissions are granted to client roles.

Images
  Private newsletter-images bucket. Upload uses the user's own JWT, matching
  shared/kdh-data.js patterns. Originals are resized to at most 2400px and
  encoded as JPEG (90%) or PNG; max optimized size 8 MB. Canvas strips EXIF.
  No inline image data in database records: only immutable storage paths.
  Readers can retrieve only paths referenced by a published snapshot.
  Images are loaded with authenticated requests into in-memory blob URLs.
  Removing/replacing a draft image removes its reference; retained objects
  protect older published versions. A retention cleanup workflow is deferred.

Historical sample
  December 2015 - Sample is seeded as a private draft in the existing DB.
  Nine sections contain original excerpts and manually checked recognition
  data from issue 17. Fifteen original images were rendered/cropped from the
  supplied PDF. Before import, clearly labeled placeholders occupy their
  positions. Click Import Original Photographs in the sample editor once to
  decrypt and upload those images to private storage and save the placement.
  sample.enc is AES-256-GCM ciphertext; its key exists only in the editor-only
  newsletter_sample_material table. No plaintext employee source material,
  original PDF or decryption key is committed to this public repository.
  Keep the DB seed and key in normal private database backups.
  Historical sample publication is blocked at the database, not just the UI.
  Original source discrepancies are preserved for review: James Rosendale
  appears under both 20- and 25-year anniversaries. The supplier launch is
  described as March 2016 without inventing a particular day.

PDF
  Download PDF opens the browser's native print dialog. Select Save as PDF,
  Letter paper, default margins and background graphics for branded output.
  Print CSS renders text, columns, images, captions and automatic page breaks
  from exactly the same content model; it never screenshots a page.
  Browser-generated files are downloaded to the user's chosen destination,
  not stored on the server. Published snapshots can be downloaded again.

Validation
  node --test kohler-korner/tests/model.test.cjs
  PLAYWRIGHT_MODULE=<installed Playwright module> node kohler-korner/tests/browser-check.cjs
  Browser tests use a mock service and a local HTTP server, never real auth.
  Optional NEWSLETTER_SAMPLE_FIXTURE is a private local fixture containing
  historical content/key; do not commit it. PDF/screenshots go outside repo.
  Real Postgres transaction tests cover editor/reader RLS, stale revisions,
  publication review, sample prohibition and immutable snapshots; rolled back.
  No real test edition was published.

Release
  Newsletter schema migrations and private sample seed have been provisioned
  in Kohler Dist Hub. The website implementation is on its own Codex branch
  for review; production deployment requires authorization for this release.

Editorial design (2026-10-14)
  Figma source: k14V3nwnvjcWwN19LFVpsH, editorial proof node 4:62.
  Native HTML/CSS patterns: masthead, article columns, supplier/portrait
  features, product grids, adjacent recognition columns and headshot cards.
  Narrow preview containers stack layouts independently of screen width.
  Event photos use their actual aspect ratio to choose portrait or wide layout.
  Quote formatting uses > followed by an author-supplied exact quotation.
  Print rows use three products/photos or four headshots; content is never
  shortened to fit the four-page design proof. Full editions paginate naturally.
  Static masthead SVG and OFL fonts are under /assets/kohler-korner/, alongside
  existing public branding assets. Uploaded photos remain in private storage.
  No navigation, database, authentication or authorization changes in this update.

Product catalog and selection
  Source: Products_GSHARKEY_20261014_0808208423354.csv (4,320 unique SKUs).
  catalog.json contains the complete normalized export, source filename and SHA-256.
  Product IDs remain strings; Brand and Brand Family are source labels, not invented IDs.
  shared/product-catalog.js supplies load, search, facets and newsletter snapshots.
  A future service can return the same normalized records through this adapter;
  the reusable shared/product-selector.js interface does not depend on CSV parsing.
  No Snowflake connection, new dependency or database migration is included.
  The existing manager route protection covers catalog.json. Readers receive only
  products included in their authorized published edition, not the full catalog.
  Seasonal Beers and New Beers & Brands use their existing product entries.
  On the Horizon keeps its article and adds optional product entries. A persistent
  productsEnabled flag retains the capability after renaming and template reuse.
  Selections are identified by Product ID within each section. Reopening the picker
  preserves descriptions, photographs and ordering for retained products.
  Unknown/manual products remain editable; catalog copies never modify the source.
  The existing 200-entry limit per section also applies to bulk catalog selection.
  Save Draft persists product metadata through the existing newsletter save flow.

Catalog validation
  node --test kohler-korner/tests/catalog.test.cjs kohler-korner/tests/model.test.cjs
  Browser checks cover exact SKU search, Brand Family bulk selection, removal,
  duplicate prevention, custom descriptions, save/reload and On the Horizon.

Recognition uploads (2026-10-14)
  Upload and Review Content appears on the edition list and editor toolbar.
  Supported: XLSX/CSV employee tables, Outlook MSG new-hire announcements,
  JPG/PNG/WebP anniversary table images, and pasted tab-delimited tables.
  SheetJS 0.20.3, MsgReader 1.29.0 and Tesseract.js 7.0.0 are vendored,
  pinned, and loaded only for their respective formats. OCR cores and English
  language data are self-hosted; uploaded documents never go to a third party.
  No new server endpoint, database table, or editing permission is introduced.
  Files are read in browser memory. Full birth dates are immediately reduced
  to month/day. Birth years, source workbooks and email files are not persisted.
  Birthday candidates are filtered to the chosen edition month before saving.
  Managers edit reviewed fields, choose photos, and explicitly confirm review.
  Unknown hiring details stay blank. Email timestamps are not hire dates.
  OCR compares column positions and requires readable anniversary headings.
  Image-derived names and service milestones must be checked against the source.
  Add and Save Draft uses the existing RPC and optimistic revision checks;
  selected images use the existing private image storage and optimization.
  Duplicate names within a section are skipped by default; updating matching
  names requires choosing that option. Existing draft content is retained.
  Affected sections remain incomplete until the final publication review.
  Merely uploading or cancelling does not create an edition or store photos.
  No supplied employee data is embedded in the site or public repository.

  node --test kohler-korner/tests/import.test.cjs
  PLAYWRIGHT_MODULE=<module> node kohler-korner/tests/import-browser-check.cjs
  Optional NEWSLETTER_IMPORT_FIXTURE points to a private external fixture
  containing source paths and expected month/day-only records. Never commit it.
