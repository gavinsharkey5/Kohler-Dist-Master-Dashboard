Tap Tracker — What's Actually on Tap, by Rep

Turns the iSellBeer tap survey audit workbook into a rep -> account -> brand
drill-down: each rep's book of accounts is scored Ours vs. Competitor by
tap handle (a pie chart, not just a count of rows), expand a rep to see
their accounts sorted by tap count, expand an account to see its brands,
county, most recent visit date, and most recent photo. A District Manager
filter narrows the whole page to one district's reps at once.

A second tab, "By Brand," regroups the same tap-level records by brand
family instead of rep: a ranked leaderboard by total taps, expand a brand
to see its distribution by County/Area, Rep, and City (each with the same
Ours-vs-Competitor mix). There's no separate brand dropdown -- the
existing search box already matches brand/brand family text, so typing a
name there is how you jump to one instead of scrolling a ~300-entry list.
All the other filters (rep, county, status, DM) apply to this tab too,
computed client-side from the same RECORDS array as the rep tab (see
groupByBrand() in the inline script) -- no new data or generate.py changes
needed for this view.

Segment column + filter (added 2026-08-07, per Kohler): every brand row in
an expanded account's table now shows a "Segment" next to Supplier, plus a
Segment dropdown in the toolbar (applies across both tabs, same as the
other filters). Resolved in generate.py by build_segment_resolver(), from
two sheets Kohler added to this same workbook specifically for this:
  - "Brand Segments (iSell)": one row per surveyed tap (same row count as
    the raw survey sheet, though its own "#" doesn't line up 1:1 with the
    raw sheet's -- joined here by Brand/Brand Family text instead) giving
    that brand's Segment. Covers ~100% of taps by volume, but its Segment
    column mixes two different ideas row to row -- sometimes a beer style
    ("Wheat Beer", "Pilsner And Pale Lager"), sometimes a price tier
    ("Craft", "Import", "Domestic") -- because that's genuinely what's in
    the source column, not something normalized here.
  - "Product Segments (Enc)": Encompass's own product catalog (Sub-
    Segments: "Beer - Craft", "Beer - Import", "Beer - Premium", "Beer -
    Economy", "Cider", ...), joined by stripping each SKU's keg-size
    suffix ("Coors Light 15.5 Gal Keg" -> "Coors Light") and matching that
    against the tap's Brand / Brand Family -- directly, or via "Brand
    Crosswalk" (the same reference sheet the executive-overview
    dashboard's velocity section uses) when the names don't line up as-is.
    Encompass only ever carries what WE sell, so this only ever resolves a
    minority of competitor-brand rows, by design.
  Per Kohler, 2026-08-07: Encompass is the stated final source of truth
  when the two disagree, so the final value is Encompass's Sub-Segment
  when resolvable, else iSell's Segment, else "Unclassified" -- never a
  guess. Re-running generate.py prints a one-line coverage summary (rows
  resolved from each source vs. unclassified) so a refresh's match rate is
  visible without opening the workbook.

60-day resurvey warning (added 2026-07-23, per Kohler): reps are expected
to resurvey every account within 60 days. Shown three ways, all computed
live in the browser against today's date (refreshStatus() in the inline
script) rather than baked into generate.py's output -- so the warning
stays correct between data refreshes even if the underlying export
doesn't change for a while:
  - A badge on each account row (and a one-line note in its expanded
    detail): amber "Due in Nd" starting 7 days before the 60-day mark,
    red "Overdue Nd" once past it.
  - A count on each rep's card in the header line (overdue takes priority
    over "due soon" if a rep has both, to keep the line short).
  - A "60-Day Resurvey" tile in the top summary row, totaled across all
    accounts regardless of any active filter (matching how the other
    summary tiles behave).
The 7-day lead time and 60-day window are both edit-in-one-place
constants (REFRESH_DAYS, REFRESH_WARN_LEAD) near the top of the inline
script if Kohler's cadence ever changes.

Files:
  iSellBeer_TAPS_US_THEM_Mediator.xlsx
                 The tap-audit engine's own working file (see the tap-audit
                 skill) -- a multi-sheet workbook, not a flat export.
                 generate.py only reads two of its sheets:
                   - The raw survey sheet: one row per surveyed tap, raw
                     fields (Account #, DBA, Distribution Area/county,
                     Address, City, Date/Time, Photos, Route / Sales Rep,
                     District Manager, Brand, Brand Family, Supplier, # of
                     Taps) plus the real photo link behind each "Photos"
                     cell's hyperlink. This sheet's own tab name has
                     changed between exports as Kohler edits the workbook
                     (it was "Sheet6", then "Sheet9") -- generate.py finds
                     it by its header row (must have "Account #", "Route /
                     Sales Rep" and "Photos", but not "Corrected
                     Distributor") rather than a hardcoded sheet name, so
                     the next rename won't break the refresh.
                   - "iSellBeer Import Template": the same rows plus the
                     audit engine's output columns -- "Distributor" (the
                     ORIGINAL iSellBeer app flag, pre-audit) and "Corrected
                     Distributor" (the engine's final US/THEM ruling after
                     checking the product catalog + Brand Family Territory
                     rules). Corrected Distributor is what this dashboard
                     shows; where it disagrees with the original flag, the
                     tap gets a "corrected" badge with a tooltip explaining
                     why.
                 The two sheets are joined on "#" (row number).
                 generate.py additionally reads "Brand Segments (iSell)",
                 "Product Segments (Enc)", and "Brand Crosswalk" for the
                 Segment column/filter (see "Segment column + filter"
                 below). The rest of the workbook (Master - US vs THEM,
                 Brand Family Territory(ies), Whitelist (Blackout Reverse),
                 Brands (Enc), Customers Table (Enc), Master Matrix View)
                 are the audit engine's reference tables -- kept here for
                 provenance, not parsed by generate.py yet.
                 A from-scratch reimplementation of that engine in Python
                 (so a bare raw survey export could be self-audited every
                 month without the manual Excel process) is a natural next
                 step if useful -- ask for it.
  on_premise_draft_package.csv
                 Account-level RDE "On Premise Draft Package" export
                 (Customer Num, Customer Name, Draft Package, address
                 fields, Buyer Count, Units). Drives the draft-only
                 account filter (added 2026-08-17, per Gavin: "only the
                 accounts ... are the ones that have a 2 or a 1 ...
                 exclude accounts that have 3 and are package only"):
                 generate.py drops every surveyed account whose Draft
                 Package classification is "3) Package Only" -- they
                 can't take a keg, same ruling as the on-prem MPO
                 tracker's Angry Orchard Target Accounts (Kohler,
                 2026-08-11). Only an explicit "3)" excludes: a surveyed
                 account missing from this export entirely is kept
                 (absence is unknown, not package-only -- the 8.17
                 export was missing ~45 surveyed accounts including a
                 24-handle draft account). The 8.17 filter dropped 29
                 accounts / 54 taps. generate.py prints both counts on
                 every refresh; overwrite this CSV alongside the
                 mediator workbook when refreshing.
  generate.py    Rebuilds the embedded data in index.html from the
                 workbook above. Requires openpyxl (pip install openpyxl).
  index.html     The dashboard itself (data is embedded in the
                 <script id="tap-data"> tag).

To refresh with a new export:
  1. Re-run the tap-audit process on the new raw survey export (see the
     tap-audit skill) to produce an updated mediator workbook.
  2. Save it over iSellBeer_TAPS_US_THEM_Mediator.xlsx in this folder,
     same filename. If a new "On Premise Draft Package" export came too,
     save it over on_premise_draft_package.csv (same columns).
  3. Run: python3 generate.py
  4. Commit and push.

Notes:
  - "# of Taps" (not row count) is what's summed for every tally in this
    dashboard -- an account with 3 handles of the same brand counts as 3
    taps, not 1 row.
  - This export is one snapshot in time: each account appears with exactly
    one visit date. "Most recent visit" / "most recent photo" is just that
    snapshot's value. If a future export ever contains multiple dates for
    the same account (repeat survey passes), generate.py already takes the
    latest one per account, so no code change would be needed for that.
  - index.html does all the rep -> account -> brand grouping client-side
    from the flat row list generate.py emits, and re-groups the same way
    after search/county/status filtering -- so there's exactly one
    grouping implementation to keep correct, not a separate one for the
    default view vs. filtered views.
  - Past builds' source files have had the raw sheet's own Distributor
    column lag the Import Template's Corrected Distributor for a handful of
    rows (an incomplete write-back, not a judgment call). generate.py
    always uses Import Template's Corrected Distributor as the
    authoritative status, not the raw sheet's, to avoid that gap -- with one
    confirmed exception (below).
  - Supplier policy override (confirmed with the user 2026-08-12): the
    8.12.26 source file added an "Unverified Brands" sheet ruling that taps
    from suppliers marked "(In-House)", Other Half, Industrial Arts, and
    Pabst count as US -- reflected in Sheet9's own Distributor column
    (green-highlighted at the source) but not yet in the Import Template's
    Corrected Distributor formula, which still defaults them to THEM under
    the older "No Encompass Match" rule. generate.py special-cases exactly
    these four supplier keywords (SUPPLIER_STATUS_OVERRIDE_KEYWORDS,
    resolve_status()) to trust Sheet9's Distributor over Corrected
    Distributor. If a future export's Import Template formula catches up to
    this ruling, the override becomes a no-op automatically (raw and
    corrected will already agree); it only needs to be revisited if a
    future export disagrees with this policy for these suppliers.
  - Corrected Distributor fill-down gap (found 2026-08-12, still present as
    of the second 8.12.26 export): the newest ~116 rows in the Import
    Template never got the Corrected Distributor (column Y) formula dragged
    down to cover them -- the cells are blank, not miscalculated. Concentrated
    in Robin Feldman (55 rows), Allison Scott (37), Chris Payton (14), and
    Brian Sengebush (10), which is why those reps' accounts showed as
    "Unverified" on the dashboard. generate.py's fill_corrected() replicates
    the exact formula those blank cells would contain -- trusts Expected
    Distributor (column W) when it's a real US/THEM verdict, else falls back
    to the Import Template's own pre-audit Distributor column (same fallback
    the formula itself uses) -- so no dashboard row goes Unverified just
    because a formula wasn't copied down. This is arithmetic, not a judgment
    call: every input it reads is already present and calculated in the
    source file. Once a future export actually fills column Y down, this is
    a no-op (Corrected Distributor is trusted as-is whenever it's non-blank).
    The underlying spreadsheet gap should still get fixed at the source for
    the workbook's own health -- see the fix steps given to the user
    2026-08-12 (fill Y5001:Y5116 down from Y5000's formula, or the
    equivalent range in a future export).
  - District Manager is a clean 1-to-1 mapping onto Route / Sales Rep (each
    rep reports to exactly one DM) as of this build's source file --
    generate.py doesn't enforce that, so if a future export ever gives one
    rep two different DM values across rows, the dashboard would just show
    whichever value each individual tap row carries rather than error.
  - A row with a blank Route / Sales Rep is dropped entirely rather than
    shown as a blank-named rep card -- seen once so far, a stray 0-tap
    placeholder row with no brand either.
