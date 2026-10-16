UPC REGISTRATION AUDIT  (/upc-audit/, 2026-10-15)
=================================================

What it is
  The /upc-crossref-audit skill moved onto the site so Vlad (IT) can run it
  himself. He adds two files, the page matches them on UPC, and lists every
  Kohler product that is not registered with the state under the number
  FileMaker has, with what to do about it. Both files are read IN THE
  BROWSER (engine.js + shared/xlsx-read.js); nothing is uploaded or stored.

Who may open it (Gavin, 2026-10-15)
  Gavin, Vlad and every brand manager. Nobody else.
  - Vlad: allowed_users.role = 'it'. middleware.js IT_PATHS = /upc-audit/,
    /shared/, /rep/rep.css; anything else redirects to /upc-audit/ (403 for a
    data fetch). The 'it' role gets no other row-level grant anywhere (it is
    not a manager), so his sign-in cannot read rep, account or budget data.
    Chrome (shared/kdh-user.js isIT): one navigation item "UPC Audit", no
    tools, no not-real-time banner, no Back, the foot says IT.
  - Managers: allowed_users.upc_audit = true. The migration sets it for every
    program_admin (Gavin) and for the brand managers of
    shared/data/brand-managers.json by name key; tools/program_seed.py writes
    supabase/seed/upc_audit_access.sql to add a new brand manager later (or
    tick the box in Table Editor). The middleware sends a manager without the
    flag home; the kdh_user cookie carries upc:1 so the manager home shows the
    card (Manager Tools) and the sidebar the tool.
  - Previews: a rep / associate preview is refused; a manager preview (Gavin's
    View As) is read-only -- notes not writable, the run not saved.

The files
  FileMaker export  Vlad's 12 columns: KohlerProductCode, ABC_UPC,
                    ABC_UPC_Text, ABC_Registrant, ABCRegNo, ProductName,
                    ProductType, PackageSize, Unit, Units, Vintage, Proof.
                    Columns are found by name (a missing optional one is a
                    warning). The UPC is ABC_UPC_Text (ABC_UPC is a number and
                    has lost its leading zeros; used only if the text is blank).
                    A repeated product code keeps its first row.
  ABC search        the Excel download of ABC's product registration search:
                    sheet Data (row 1 headings, row 2 "Records Found: N", then
                    one row per registration x UPC with State Current / Pending
                    / Historical and Expiration Date), sheet Distributor (not
                    read), sheet Criteria (the search). The file's XML is
                    namespace-prefixed (<x:row>); shared/xlsx-read.js handles it.
  A file is REFUSED (with the reason on screen) when:
    - the Criteria sheet is missing, or the search was not run for Kohler's
      license 3403-23-652-002 (Gavin confirmed -002, 2026-10-15);
    - it was filtered to an expiration year before the current year.
    - it is the other kind of file (says which slot it belongs in).
  Several ABC files merge (rows deduplicated by objectid): add the current
  year's search and, once renewals start, next year's.

The rules (engine.js)
  - A registration COUNTS when ABC shows it Current AND it expires in the
    current year or later (Gavin: "current year and any years beyond";
    Historical and prior years are not valid). Pending = filed, not approved.
  - UPC match: digits only; exact first, then with leading zeros removed on
    both sides (UPC-A / EAN-13 / GTIN-14). Any ABC row for the UPC carrying
    FileMaker's registration number counts -- never only the first hit (the
    XLOOKUP false-mismatch the skill found).
  - Result, first that applies:
      notreg    Not Registered            nothing found -> register it
      notonreg  UPC Not on Registration   UPC on no current registration, but
                                          FileMaker's number is current ->
                                          add the UPC to that registration
      expired   Expired or Historical     found only Historical / past year
      pending   Pending at ABC            found only Pending
      wrongreg  Wrong Registration #      UPC registered under another number
                                          -> fix FileMaker
      noupc     No UPC in FileMaker
      match     Matched                   nothing to do
    "Still to Register" = notreg + notonreg + expired.
  - A not-registered UPC that differs from a current ABC UPC only by a check
    digit gets a "Possible check-digit difference" hint -- never a match.
  First real run (2026-10-15, 3rd_match.xlsx vs the Oct 15 ABC search, 2,171
  products, 6,501 registrations): 2,057 matched, 56 not registered, 44 UPC not
  on registration, 3 expired/historical, 11 wrong reg #, 0 pending, 0 no UPC.
  (3 products whose UPC sits on a Historical registration while FileMaker's
  number is current are "UPC Not on Registration": add the UPC to the current
  registration; the note names the historical one.)

Notes and run history (Supabase, migration
supabase/migrations/20261015190000_upc_audit.sql)
  upc_notes  a dated log per PRODUCT CODE (never per row): status (Open /
             Submitted to ABC / Waiting on Supplier / Fixed in FileMaker /
             Registered / Not Needed) and/or text, the result at the time,
             author + time stamped from the token. APPEND-ONLY: no update or
             delete; a correction is a new note. The row shows the latest; the
             detail sheet shows the whole log; the Excel carries the latest.
  upc_runs   one row per run (not in preview): file names, counts, and the
             [code, result] of every product not matched. The next run reads
             the latest one and says New / Still Open / Resolved ("Show
             Resolved" lists them). Previous Runs lists the last 20.
  RLS: read + insert for kdh_upc_can() (role 'it' or upc_audit); nothing for
  anyone else. Without the migration the audit still runs and says so.

Excel download
  Summary (files, counts, rules, since-last-run), Need Attention, All Products:
  result, what to do, FileMaker fields, the ABC registration found (number,
  state, expiry, registrant, name, UPC), match detail, since last run, latest
  note + who/when, notes on file.

Not done / later
  - The Distributor sheet is not read. On 2026-10-15, 3 ABC rows had no
    license -002 line in it; if a "Kohler not listed as distributor" check is
    wanted, it would be its own result.
  - No ABC website automation: Vlad downloads the search himself.

Tests (scratchpad, not in the repo -- the files carry no secrets but the test
fixtures are Vlad's exports): upc2/upc_test.mjs (46: IT / brand manager / plain
manager / previews / no migration, 390 / 820 / 1366, light / dark, Excel opened
in openpyxl), upc2/sql_upc_test.sh (32, local Postgres 16), mw_test.mjs (IT and
upc_audit routing, every asset of the page passes).
