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
