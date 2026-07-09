Display Auction Tracker folder

Points leaderboard for the iSellBeer display incentive, built from
DisplayPhotoReport.csv (an export of the iSellBeer "Report" tab —
Photo Taker, Role, Account, Brand, Quantity, Date/Time per display photo).

How points are calculated:
  - One "display" = one photo submission (same rep, account, and
    timestamp). If a photo logs multiple SKUs, their case counts (the
    Quantity column) are summed before the tier is applied.
  - Each display's brand is matched against the Priority Brands / All
    Other Brands lists to pick the right tier table, then scored by
    total cases: 10-19 / 20-39 / 40-69 / 70+.
  - Sales Reps and Sales Associates earn on the same point scale.

index.html embeds a processed JSON snapshot of the CSV (see the
<script id="da-data"> tag), so the page works standalone with no fetch
calls. To refresh with a new report export: replace
DisplayPhotoReport.csv, then regenerate the embedded JSON and re-save
index.html.
