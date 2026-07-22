Tap Tracker — What's Actually on Tap, by Rep

Turns the iSellBeer tap survey audit workbook into a rep -> account -> brand
drill-down: each rep's book of accounts is scored Ours vs. Competitor by
tap handle (a pie chart, not just a count of rows), expand a rep to see
their accounts sorted by tap count, expand an account to see its brands,
county, most recent visit date, and most recent photo.

Files:
  iSellBeer_TAPS_US_THEM_Mediator.xlsx
                 The tap-audit engine's own working file (see the tap-audit
                 skill) -- a multi-sheet workbook, not a flat export.
                 generate.py only reads two of its sheets:
                   - "Sheet6": one row per surveyed tap, raw fields (Account
                     #, DBA, Distribution Area/county, Address, City,
                     Date/Time, Photos, Route / Sales Rep, Brand, Brand
                     Family, Supplier, # of Taps) plus the real photo link
                     behind each "Photos" cell's hyperlink.
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
                 The rest of the workbook (Master - US vs THEM, Brand
                 Family Territory(ies), Whitelist (Blackout Reverse), Brand
                 Crosswalk, Brands (Enc), Customers Table (Enc), Master
                 Matrix View) are the audit engine's reference tables --
                 kept here for provenance, not parsed by generate.py yet.
                 A from-scratch reimplementation of that engine in Python
                 (so a bare raw survey export could be self-audited every
                 month without the manual Excel process) is a natural next
                 step if useful -- ask for it.
  generate.py    Rebuilds the embedded data in index.html from the
                 workbook above. Requires openpyxl (pip install openpyxl).
  index.html     The dashboard itself (data is embedded in the
                 <script id="tap-data"> tag).

To refresh with a new export:
  1. Re-run the tap-audit process on the new raw survey export (see the
     tap-audit skill) to produce an updated mediator workbook.
  2. Save it over iSellBeer_TAPS_US_THEM_Mediator.xlsx in this folder,
     same filename.
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
  - As of this build's source file, Sheet6's own Distributor column lagged
    the Import Template's Corrected Distributor for 18 of 2,527 rows (an
    incomplete write-back, not a judgment call -- mostly one account,
    Yard House 8390). generate.py always uses Import Template's Corrected
    Distributor as the authoritative status, not Sheet6's, to avoid that
    gap.
