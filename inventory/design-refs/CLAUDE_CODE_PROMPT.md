Rework the rep Inventory page (`inventory/`) for iPhone/iPad use by sales reps on route.
Read `inventory/README.txt` and the COPY + LAYOUT STANDARD in CLAUDE.md first. Leave
`inventory-overview/` (the executive view) untouched.

## Design references (look at these first)
Three screenshots are in `inventory/design-refs/`. Open each image and use it as the visual basis:

- `shopify-inventory-list.png` — PRIMARY reference. Match this layout: title row, a search bar
  with Sort and Filter icon buttons on the same row, horizontal filter chips beneath it, then a
  plain list where each row is a bold item name with a muted second line and the quantity in a
  rounded pill on the right. No table columns.
- `resy-grouped-list.png` — sticky section headers in a long list: header text on its own line,
  rows with the name left and a number right-aligned, thin dividers.
- `copilot-filter-chip.png` — an active filter shown as a dismissible chip (label + ×) inside or
  under the search bar.

Take structure and spacing from these; keep the site's kdh tokens, Inter, Title Case, and the
960px centered column. Don't add a UI library.

## Data source change
The page currently embeds three exports from `../inventory-data/` via `generate.py`. That is
being replaced by ONE simpler report with exactly these columns:
"Product Num Name", "Supplier", "Brand Family", "On Floor Inventory", "Pre Sales", "Allocated",
"Available". ~3,200 rows, ~124 suppliers, ~326 brand families. "Product Num Name" is a product
number followed by a description, e.g. "2409 Corona Extra 1/24/12 oz Loose Btl". Sample:
`inventory/design-refs/Inventory_Report_1.csv`. "Available" comes straight from the report — do
not re-derive it.

Before changing anything, read `inventory/generate.py` and `inventory/index.html` and tell me:
which of the old exports and fields the page references, what the KPI row / status logic
currently computes, and which of those cannot be computed from the new report (days of cover,
arrivals, projections). Then propose what the new page keeps vs. drops.

## Build
1. `generate.py` reads the new report (path argument, default `../inventory-data/Inventory_Report.csv`),
   strips header whitespace, coerces the four numeric columns to numbers (blanks = 0), splits
   "Product Num Name" into product number + description, records the file's modified time as the
   snapshot date, and embeds the JSON into `<script id="rep-data">` exactly as today. Keep the
   ">7 days old" stale tag and the "Inventory as of <date>" wording. Update README.txt.
2. Header: "Inventory", snapshot line, KPI tiles reduced to what the report supports: Products
   Available, Out of Stock (Available <= 0), Running Low (Available 1–24). Units, never dollars.
3. Search bar filtering on the full "Product Num Name" string (product number OR a word like
   "Modelo"); debounced, case-insensitive, substring.
4. Same row: Sort (Available high→low default, A–Z, Pre Sales high→low) and Filter, which opens a
   bottom sheet with Supplier and Brand Family multi-select. Chips row: All / In Stock / Low / Out;
   active supplier/brand filters appear as dismissible chips with ×.
5. Rows: description bold on line one; product number + Brand Family muted on line two; Available
   as a pill on the right (green > 24, amber 1–24, red <= 0, on the kdh tokens). Min row height
   56px, full-row tap target.
6. Tapping a row expands it inline (one open at a time) showing On Floor, Pre Sales, Allocated,
   Available as a 2×2 label/value grid; thousands separators, no decimals. On iPad (>= 768px) show
   the detail inline instead of as an accordion.
7. Group under sticky Supplier headers when no search/filter is active; flat list when searching.
8. Virtualize or window the list (~3,200 rows) so first paint is fast on a 2–3 year old iPhone.
9. Persist sort + filters in localStorage. Empty state ("No Products Match") and a loading skeleton.
10. Keep the page standalone (no fetches) and keep its `<meta name="kdh-page">`, the kdh-skin link
    and the early theme snippet. Verify at 390 / 820 / 1366, light and dark, no sideways scroll.

Show me the plan and the files you'll touch before writing code, then implement, run
`python3 inventory/generate.py inventory/design-refs/Inventory_Report_1.csv`, and screenshot the
result at 390px wide.
