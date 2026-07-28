Wine & Spirits Execution Tracker

Most of this dashboard (Overview, By Account, By Brand, By Area, Par
Level) was hand-built from a one-time data pull and has no refresh
script yet.

The Lost Placements tab is the exception -- it's refreshable. A
placement counts as lost if a (customer, product) pair has an order
somewhere in the last 6 complete months but nothing in the trailing 60
days, mirroring the standard Encompass "PlacementData" Value1/Value2
comparison formula, computed here from raw transaction-level exports
instead of a canned Encompass comparison report (that report type
can't be repointed at a rolling window).

Files:
  ws_l6_months.csv          RDE "WS L6 Complete Months Placements/Cases"
                            export -- every (customer, product)
                            placement in the last 6 complete calendar
                            months.
  ws_l90_days.csv           RDE "WS L90 Days Placements/Cases" export --
                            every (customer, product) placement in the
                            trailing rolling 90 days. Same columns as
                            the file above; rows in the two files'
                            overlapping date range are identical and
                            get deduplicated before aggregating.
  build_lost_placements.py  Rebuilds the lostPlacements/lostOverview/
                            lostByRep/lostReps keys in the embedded
                            <script id="ws-data"> JSON inside
                            wine-spirits-tracker.html. Every other key
                            (overview, byAccount, byBrand, etc.) is
                            left untouched.
  wine-spirits-tracker.html The dashboard itself.

To refresh the Lost Placements tab:
  1. Re-export both RDE reports, keeping the same columns.
  2. Save them over ws_l6_months.csv / ws_l90_days.csv in this folder
     (same filenames).
  3. Run: python3 build_lost_placements.py
  4. Commit and push.
