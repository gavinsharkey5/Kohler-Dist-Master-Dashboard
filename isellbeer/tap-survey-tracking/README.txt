Tap Tracker — What's Actually on Tap, by Rep

Turns the iSellBeer tap survey export into a rep -> account -> brand
drill-down: each rep's book of accounts is scored Ours vs. Competitor by
tap handle (a pie chart, not just a count of rows), expand a rep to see
their accounts sorted by tap count, expand an account to see its brands,
county, most recent visit date, and most recent photo.

Files:
  iSellBeer_Corrected_Brand_County_Taps.csv
                 The survey export: #, Account #, DBA, Distribution Area
                 (county), Address, City, Date/Time, Photos, Route / Sales
                 Rep, Brand, Brand Family, Supplier, # of Taps,
                 Distributor (US/THEM). This file is trusted as already
                 corrected against Encompass territory rules -- see the
                 tap-audit skill, which is what produces a "Corrected"
                 export in the first place. generate.py does not re-derive
                 US/THEM itself; it just uses the Distributor column as-is.
  iSellBeer_Corrected_Brand_County_Taps.xlsx (optional)
                 Same report, exported as Excel instead of CSV. A CSV
                 export flattens the "Photos" column's hyperlink down to
                 plain display text ("Photos"), so there is no URL left to
                 read -- the .xlsx keeps the real link. If this file is
                 present, generate.py uses it INSTEAD of the .csv (same
                 columns, plus real photo URLs); without it, accounts show
                 a "no photo on file" placeholder instead of a picture.
  generate.py    Rebuilds the embedded data in index.html from whichever
                 of the two files above is present (xlsx preferred).
  index.html     The dashboard itself (data is embedded in the
                 <script id="tap-data"> tag).

To refresh with a new export:
  1. Re-export the iSellBeer tap survey, keeping the same columns.
  2. Save it over iSellBeer_Corrected_Brand_County_Taps.csv (or .xlsx, if
     you want photos) in this folder, same filename.
  3. Run: python3 generate.py -- reading an .xlsx requires the openpyxl
     package (pip install openpyxl) if it isn't already installed.
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
  - A prior build of this dashboard (before this rewrite) had a "corrected
    vs. raw export" flip comparison per row. That required both a raw and
    a corrected Distributor value to diff against; this export only
    carries the corrected value, so that comparison isn't reproducible
    here and was dropped.
