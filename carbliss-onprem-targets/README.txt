Carbliss On-Premise Targets

Turns the "Carbliss Eval vs Sun Cruiser & White Claw" RDE exports into a
per-account sales-pitch generator: every on-premise account with real
Sun Cruiser or White Claw volume, sized by opportunity, with a
computed talking-point pitch (best-selling item, whether it's new or
established, how many SKUs move through the account).

Flavor recommendation logic (updated 2026-07-20 per Kohler): if a
flavor already sells well through the account via Sun Cruiser/White
Claw, the pitch does NOT recommend Carbliss in that same flavor —
that's competing head-on with an already-satisfied craving. Instead it
recommends a genuinely different flavor (gap_flavor) that's real white
space on their menu, preferring one from a different flavor family than
whatever's already dominant, so Carbliss adds breadth to the menu
instead of cannibalizing a proven seller.

UI (updated 2026-07-20 per Kohler): the account list is a sortable,
filterable table — the same format as the /carbliss/ "Placement Gap
Tracker" page, minus its Channel column (every account here is
already on-premise-only, so a Channel column would be redundant).
Columns: Account, Rep, Territory, Sun Cruiser (cs), White Claw (cs),
Combined Volume, Carbliss?, Gap Size, Pitch. Filters: search, Rep,
Territory, a Gap threshold (cases) number input, and a "Gap accounts
only" checkbox. A gap account = no Carbliss yet with combined SC+WC
volume at or above the threshold; Gap Size shows that combined volume
for gap accounts and an em dash otherwise. Clicking Pitch expands a
row with the account's brand-level case counts (2025→2026) and the
same pitch bullets/flavor tags the old card view showed, plus a copy
button. Any column header sorts the table; default sort is Combined
Volume, biggest first.

Files:
  accounts.csv   RDE "Carbliss Eval vs Sun Cruiser & White Claw" export
                 (Sales Rep Assigned, Customer ID, Customer Name, Shipping
                 Address, City, On Premise, Brand Family, Product Num Name,
                 Cases/Buyer Count 2025 vs 2026 — one row per customer/brand/
                 product, since Product Num Name was added 2026-07-21; cases
                 and buyer counts are summed across a brand's product rows
                 per account in generate.py, not just the last row read)
  generate.py    Rebuilds the embedded data in index.html from the CSVs/workbook above
  index.html     The page itself (data is embedded in the <script id="tg-data"> tag)

To refresh with new exports:
  1. Re-export the RDE Eval report (and the Buyers L90 report), same columns.
  2. Save them over accounts.csv and carbliss_buyers_l90.csv in this folder.
  3. Run: python3 generate.py
  4. Commit and push.

City comes straight from accounts.csv's own City column (added
2026-07-21) — 100% of accounts resolve directly from the source export
now. The old cross-reference lookup from other trackers in this repo
(molsoncoors/retention/data.csv, carbliss/data.csv, isellbeer's
DisplayPhotoReport.csv) is kept only as a fallback for the rare case a
future export drops the City column or leaves it blank for an account.

NO DOLLARS (Gavin, 2026-10-06): this page talks distribution only --
placements (accounts / buyers) and cases. price_vol.csv ($Vol, unit price)
is gone: generate.py no longer reads it, and the pitch has no "~$" on the
top mover and no Price bullet. Per-product cases now come from accounts.csv's
Product Num Name rows (they matched price_vol case for case). Don't re-add
a $Vol export or any money wording.

2026-10-06 REFRESH -- Eval _11 + Buyers L90 _3 exports: accounts.csv 3,115 ->
3,140 rows, 617 target accounts (611 before), 278 carrying Carbliss (265),
SC + WC 2026 cases 28,182. Buyers file runs to 10/7: 297 YTD buyers, 229
rolling-90 (window 7/7 - 10/7), 68 fell off. Sell sheets need openpyxl
(11 of 12 flavors have a URL; Pineapple none).

2026-10-06 REFRESH -- Eval _12 + Buyers L90 _4 exports: accounts.csv 3,140 -> 3,143 rows; buyers file runs to
10/16 (412 load sheets, +18, none removed). Also feeds carbliss-mpo/ (run its generate.py after saving the buyers file).

Flavor mapping and the "gap" ranking (most broadly-carried missing flavor,
preferring one from a different flavor family than the pitched SKU) are
both defined at the top of generate.py — edit FLAVOR_KEYWORDS or
FLAVOR_FAMILY there if Carbliss's flavor lineup changes.

No link back to the root index (2026-09-24, per Gavin): reps get this
page as a direct link and must not be able to browse to the main page
that lists every dashboard. Do not add a "back" / breadcrumb link to ../

Rep leaderboard (2026-09-30)
----------------------------
renderBoard() in index.html draws a card under the goal bar for every
signed-in person (rep, DM, manager alike): each rep ranked by the same
number their own goal bar shows -- on-premise Sun Cruiser / White Claw
target accounts that carry at least one Carbliss flavor in 2026 -- with
"N of M target accounts · share%" and a bar. Ties on the count are
broken by the share of that rep's own target list, then by name; reps
still level share a rank (shown "=" -- 1, 2, 2, 4). The top 10 are open
and the rest fold ("N more reps"; opened automatically when the signed-
in rep is below the top 10). Aggregate counts only: no account names,
so a rep sees nothing of another rep's customers (the rep filter and
table stay pinned to their own route; a DM's filter stays their team).
Target lists differ in size by route, which the note under the board
says plainly; the share is there for that reason. House "reps"
(Default, Office Tell Sell) are dropped with kdhIsRep.

Data date: generate.py now writes meta.generatedAt (the build date) and
the page's header says "Page built <date> from the RDE exports" -- it
used to print today's date on every load, which was not a data date.

2026-09-30 REFRESH -- Eval _10 + Price/Vol _10 exports
  python3 generate.py
accounts.csv 2,897 -> 3,115 rows, price_vol.csv 4,305 -> 4,656. Target
accounts 584 -> 611 (27 joined, none left), accounts carrying Carbliss
181 -> 265 (84 newly carrying, none dropped), SC + WC 2026 cases 22,182 ->
27,731 (2025 restated 24,024 -> 28,556 -- the export widened with the new
accounts). Biggest movers on the leaderboard: Robin Feldman 41 -> 54,
Allison Scott 28 -> 41, Nick Melissari 24 -> 35, Brian Sengebush 24 -> 33,
Paul Mclaughlin 18 -> 26, Anthony Palmisano 22 -> 28; Pablo Lopez 0 -> 6 and
Matt Powierski 0 -> 5 open their accounts. Gavin also sent an "RDE Carbliss
Buyers (ON) L90 vs Start" export (rolling-90 buyers) and a Brands workbook
with Carbliss flavor sell-sheet URLs for two new features (rolling-90 /
YTD buyer status with a fell-off alert, sell-sheet picker in the pitch);
the L90 file arrived EMPTY (header only), so those wait on a re-export --
see the 2026-09-30 conversation notes in CLAUDE.md.

YTD vs ROLLING-90 BUYERS + FELL-OFF ALERT, PITCH FIRST, SELL SHEETS (2026-09-30)
Gavin: "Carbliss is tracking a rolling 90 day customer tracker ... include
the ytd and rolling 90 buyers as well for reps to see, and provide an alert
that the account fell off rolling 90 if they have bought YTD ... move pitch
icon to the left most column and include the sell sheets. allow rep to
choose which sell sheet they can show a customer."
  carbliss_buyers_l90.csv   the RDE "Carbliss Buyers (ON) L90 vs Start" export:
                            one row per Carbliss load sheet (rep, Customer Num &
                            Company, Load Sheet Date, Buyers L90 2026, Buyers
                            2026, Difference). Save the new export over it on
                            every refresh, same as the two Eval files.
  brands_sell_sheets.xlsx   the Encompass Brands export (Brand ID, Brand, Brand
                            Family, Sell Sheet URL) -- one Carbliss flavor per
                            row; only brand names and URLs, nothing personal.
generate.py reads both (F3 / F4; either may be missing -- the page then just
omits that feature). RULES: an ACCOUNT is a YTD buyer when any of its load
sheets has Buyers 2026 = 1, a rolling-90 buyer when any has Buyers L90 = 1
(the RDE decides the window; the page reports it from the data -- earliest
L90 row to the latest load sheet, 7/2 - 9/30 on 2026-09-30), and FELL OFF
ROLLING 90 = YTD buyer with no L90 row. 2026-09-30: 377 load sheets, 288 YTD
buyers, 221 rolling-90, 67 fell off; 273 of the 288 are on the Sun Cruiser /
White Claw target list, the other 15 buy Carbliss without SC/WC and appear
only in the buyers card (marked "not on the SC/WC list below").
PAGE: a "Carbliss buyers · YTD vs rolling 90" card under the goal bar with
three tiles (Buyers YTD, Rolling-90 buyers with the % of YTD still buying,
Fell off rolling 90) and a fold listing the fell-off accounts, most recent
last buy first, with "last <date> · N days" (days counted to the export's
own last load-sheet date, never today). Scope = the rep's own accounts, a
DM's team, or -- for a manager -- everyone or the rep chosen in the Rep
filter (rows then name the rep). Table rows carry a red "Fell off rolling
90 · last <date>" badge or a green "Rolling 90" badge beside the account;
"Fell off rolling 90 only" is a checkbox in the toolbar. The PITCH button
is the LEFT-MOST column (sticky on phones, the account name sticky beside
it). The pitch panel ends with SELL SHEETS: one button per Carbliss flavor
from the workbook, the pitched flavors first and marked Recommended (in
the pitch's own order), flavors already on the menu marked On menu, a
flavor with no URL shown but not linkable ("No sheet yet" -- Pineapple on
2026-09-30); a tap opens the sheet in a new tab. The rep picks whichever
fits the customer -- nothing is auto-selected. The sheet links point at
cdn.e8.co; whether they open without a login was not checked from here
(Gavin: "do not worry about this for now").
Tests: scratchpad carbliss_test.mjs (rep / manager / DM scope of the card,
badges = data, filter, picker order + links, no leaks, 390 / 820 / 1366) +
lb_test.mjs + mobile_audit ONLY=carbliss (the two 24px checkboxes are the
known audit note).
