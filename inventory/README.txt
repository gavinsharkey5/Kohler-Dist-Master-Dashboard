Inventory Tracker folder

Three tabs, each built from a separate warehouse export:
  - Current Stock   <- data/InventoryStatus.csv       (on-hand / available per SKU)
  - Trends & Forecast <- data/InventoryProjections.csv (days of inventory, backorders, trend)
  - Watch List      <- data/WatchList_P90_OOS.csv      (curated at-risk/OOS list with images)

index.html embeds a processed JSON snapshot of these CSVs (see the
<script id="inv-data"> tag) so the page works standalone with no fetch calls.
To refresh with a new data pull: replace the three files in data/, then
regenerate the embedded JSON and re-save index.html.
