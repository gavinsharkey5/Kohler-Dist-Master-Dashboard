Red Bull Distribution Tracker

Per-rep tracking of unique buying accounts (any qualifying Red Bull
order) against the team goal.

WHAT AN ACCOUNT BUYS (per Kohler, updated 2026-09-11). These three are
the only values in data.csv:
  Regular  Red Bull 1/24/8.4 oz Can
  Free     Red Bull Sugar Free
  Flavor   Orange Edition, Sea Blue-Juneberry, Blue Edition, Coconut,
           Yellow Edition, White Peach Edition, Red Edition

Kohler does NOT carry Red Bull Sugar Free Watermelon -- it was listed
briefly and removed. Don't add it back without confirming that changed.

THE TIERS an account climbs. Both are DERIVED in index.html (the TIERS
list) and never written to data.csv, because each needs a COMBINATION
rather than one purchase -- a tier requires EVERY category it lists:
  Core   = Regular AND Free                 goal 155, currently 91
  Core+  = Regular AND Free AND Flavor      goal  84, currently 53
           ("all 3" -- the finish line)

Core+ accounts are a SUBSET of Core accounts, so the two tiers do not add
up, and neither is a tier the sum of its category counts: Core (88) is
not Regular (184) + Free (96), because a tier counts each account once
and only when it has both.

CORE+ IS THE NUMBER THAT COUNTS -- it is the "all 3" account, and the
page is built around it: reps are ranked by Core+ accounts, a rep's page
leads with a "My Core+ accounts" card, and their account list splits into
"Still to finish" (closest first, missing categories shown as "+ Free" /
"+ Flavor" tags) and "Core+ accounts". Two of the three is not Core+. The page is built around that rule: a "Complete
(all 3)" stat tile, a green "what counts as complete" band, the rep
leaderboard ranked by complete accounts (total accounts only breaks
ties), and each rep's account list split into "Still to finish"
(closest-to-complete first, with the missing categories shown as "+ Free"
/ "+ Core+" tags) and "Complete accounts". Completeness is derived in
index.html (isComplete()) from the category rows -- data.csv carries no
complete flag, so nothing to regenerate when the rule is explained
differently.

Files:
  data.csv        Customer Name, Category (Regular/Free/Flavor), Sales Rep,
                  Bought -- one row per (customer, category, rep) with a
                  qualifying order. Tab-separated. Read directly by
                  index.html via fetch() at page load -- no build step,
                  no embedded JSON.
  goals.csv       Category, Goal. Only the TIERS carry goals (Core 155,
                  Core+ 84) plus Overall 239, the buying-account goal
                  quoted in the headline. A goal of 0 or a missing row
                  means "no goal set": that card shows the team count
                  with no goal bar. Also read
                  directly by index.html. Not touched by generate.py --
                  the RDE export carries no goal information. A goal of
                  0 means "no goal set yet": that category's card shows
                  the team count with no goal bar, and it's left out of
                  the headline/footer goal line. Free is 0 until Kohler
                  sets one -- fill it in here and the page picks it up,
                  and bump Overall if the split changes it.
  generate.py     Rebuilds data.csv from a raw RDE "Red Bull Tracker"
                  export (one row per account x SKU x order date, NOT
                  the pre-aggregated shape data.csv needs). Takes the
                  export as .csv or .xlsx.
  index.html      The page itself.

2026-09-17 REFRESH -- RDE_Red_Bull_Tracker_Apr_1_Start_5.csv (1,827 rows,
4/1 through 9/17, nothing dated ahead of the pull this time). Buying accounts
hold at 197 -- no account joined or dropped -- but four existing accounts
finished a tier: Free 96 -> 99, Flavor 62 -> 65, Core 88 -> 91, Core+ 49 -> 53.
The 9/15-9/16 scheduled loads from the last pull all landed.

The four that moved (all straight to Core+ except one already Core):
  Anthony Palmisano  Bally Owen Golf Club   Regular only -> all 3
  Anthony Palmisano  Black Bear Golf (A)    Regular only -> all 3
  Paul Mclaughlin    Club Flamingo (A)      Regular+Flavor -> all 3 (+ Free)
  Paul Mclaughlin    Tommy Fox's Pub Hse(P) Core -> all 3 (+ Flavor)

Core+ leaderboard: Paul Mclaughlin takes the lead at 12, Nick Melissari and
Allison Scott 11 each, Brian Sengebush 8, Robin Feldman 5, Anthony Palmisano 3.

2026-09-14 REFRESH -- RDE_Red_Bull_Tracker_Apr_1_Start_4.csv (1,764 rows,
4/1 through 9/16). One account joined and nothing was lost: 196 -> 197 buying
accounts, Regular 184 -> 185, Free and Flavor unchanged at 96 and 62. Core
88 of 155, Core+ 49 of 84 held -- a Regular-only account is two categories
short of Core+, so a new buyer moves the account count without moving either
tier. Nine rows were dated ahead of that pull (scheduled load sheets); all
of them landed by the 9/17 export.

To refresh with a new export:
  1. Re-export the RDE Red Bull Tracker report.
  2. Run: python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start.csv
     (an .xlsx also works; that path needs openpyxl)
  3. If it errors on an unrecognized product, confirm with the user
     whether it's Regular, Free or Flavor, then add it to
     REGULAR_PRODUCTS / FREE_PRODUCTS / FLAVOR_PRODUCTS at the top of
     generate.py.
  4. Commit and push.

BUYING PERIOD: JULY 1 - SEPTEMBER 30, 2026 (Gavin, 2026-09-17)
The tracker counted every order from the export's first day (the RDE
report is pulled "Apr 1 Start"), so an account that bought once in April
and never again still read as buying. The window is now PERIOD_START /
PERIOD_END in generate.py (2026-07-01 to 2026-09-30, inclusive): rows
dated outside it are dropped on the build and the counts printed
("kept N, dropped N before the window and N after it"). The export can
start earlier -- the script does the cutting -- and it must carry its date
column (the first header containing "date"); the build refuses to run
without one rather than quietly count April again.
generate.py also writes period.json (start, end, label, how many export
rows fell inside) and index.html shows it as a "Buying period" pill under
the title plus a line in the lede and footer. No period.json = no pill,
so the page never claims a window the data was not built with.
    python3 generate.py EXPORT.csv                      Jul 1 - Sep 30
    python3 generate.py EXPORT.csv --start 2026-10-01 --end 2026-12-31
                                                        next period
JUNE WAS BRIEFLY IN: the 9/17 export ran from June 1 with the note "just
june july sept", so one build (commit 6ea9fa0) counted June and read 177
accounts / Core 71 / Core+ 38. Gavin the same day: "make this start in
july ignore june my apologies" -- July 1 it is, and June rows are dropped
on every build from here.

2026-09-25 REFRESH -- RDE_Red_Bull_Tracker_June_1_Start_2.csv (926 rows,
7/1 through 9/25 -- starts July 1, nothing dropped; July 345 and August 293
rows match every build since 9/17, September 261 -> 288). One account joined,
none left: buying accounts 167 -> 168, Regular 158 -> 161, Free 75 -> 78,
Flavor 49 -> 52. Core 67 -> 72 of 155, CORE+ 40 -> 43 of 84.
  Newly Core+ (all 3):
    Paul Mclaughlin    International Bar/Rest  new, straight to all 3
    Paul Mclaughlin    Hearth & Tap Co.        Regular only -> all 3
    Paul Mclaughlin    The Cornerstone (P)     Free only -> all 3
    Anthony Palmisano  Doc's Place (P)         Core -> all 3 (+ Flavor)
  ONE ACCOUNT LOST A CATEGORY: Anthony Palmisano / The Lamp Post Inn read
  all 3 on 9/23 on a 9/24-dated Flavor load sheet; that row is not in this
  export (its 9/24 Sugar Free row still is), so it is back to Core. The
  export is the record -- a scheduled line that did not ship. It is the
  same day's rows that left several other RDE pulls today (see
  incentive-tracking/README.txt, 2026-09-25 SECOND refresh); if the load
  is real it will come back on the next pull.
  Other moves: Allison Scott / Bardis (P) Free -> Core (+ Regular), Paul
  Mclaughlin / QB's Bar and Grill Regular -> Core (+ Free).
Rows dated 9/25 are the day of the pull; all inside the window. Core+
leaderboard: Paul Mclaughlin 11 -> 14, Allison Scott 8, Nick Melissari 6,
Brian Sengebush 6, Robin Feldman 4, Anthony Palmisano 4 (one in, one out),
Dan Lagala 1.

2026-09-23 REFRESH -- RDE_Red_Bull_Tracker_June_1_Start_1.csv (899 rows,
7/1 through 9/24 -- starts July 1 again, nothing dropped). Four accounts
joined, none left, and no account lost a category: buying accounts
163 -> 167, Regular 154 -> 158, Free 72 -> 75, Flavor 44 -> 49. Core 64 -> 67
of 155, CORE+ 34 -> 40 of 84.
  Newly Core+ (all 3):
    Anthony Palmisano  Airport Pub & Pkg          new, straight to all 3
    Anthony Palmisano  The Lamp Post Inn          Core -> all 3 (+ Flavor)
    Brian Sengebush    Mckenna's Pub (P)          Core -> all 3 (+ Flavor)
    Brian Sengebush    Pat's Bar (P)              Core -> all 3 (+ Flavor)
    Brian Sengebush    Millers Ale House Rockawa  Reg+Flavor -> all 3 (+ Free)
    Paul Mclaughlin    Bowler City Bowling        Core -> all 3 (+ Flavor)
  Other moves: Paul Mclaughlin / Midland Brewhouse (A) Regular -> Core
  (+ Free); new Regular-only buyers Allison Scott / Yesterdays (P), Pablo
  Lopez / Azul Restaurant, Paul Mclaughlin / Jack E Pooh's.
Rows dated 9/24 are scheduled loads for the day after the pull; inside the
window, so they count. Core+ leaderboard: Paul Mclaughlin 10 -> 11, Allison
Scott 8, Brian Sengebush 3 -> 6, Nick Melissari 6, Anthony Palmisano 2 -> 4,
Robin Feldman 4, Dan Lagala 1.

2026-09-22 REFRESH -- RDE_Red_Bull_Tracker_June_1_Start.csv (875 rows,
7/1 through 9/23 -- despite the file name the export starts July 1, so
nothing was dropped; July 345 and August 293 rows match the 9/17 build
exactly, September 203 -> 237). Two accounts joined and none left:
buying accounts 161 -> 163, Regular 152 -> 154, Free 71 -> 72, Flavor
holds at 44. Core 63 -> 64, Core+ holds at 34.
  Paul Mclaughlin   Florentine Garden        new, Regular + Free -> Core
  Robin Feldman     Vfw 2906 Pompt. Lks.(Z)  new, Regular only
No existing account changed a category. Four rows are dated 9/23
(scheduled loads for the day after the pull); all inside the window, so
they count. Core+ leaderboard unchanged: Paul Mclaughlin 10, Allison
Scott 8, Nick Melissari 6, Robin Feldman 4, Brian Sengebush 3, Anthony
Palmisano 2, Dan Lagala 1.

2026-09-17 REBUILD FOR THE BUYING PERIOD -- RDE_Red_Bull_Tracker_Apr_1_Start_6.csv
  python3 generate.py RDE_Red_Bull_Tracker_Apr_1_Start_6.csv
1,158 rows, 6/1 through 9/17; 317 June rows dropped, 841 kept (345 July,
293 August, 203 September). Against the April-start board: buying accounts
197 -> 161, Core 91 -> 63, Core+ 53 -> 34. Thirty-six accounts left the
board (April-June-only buyers) and none joined -- the drop IS the change,
not a bad build. Core+ by rep: Paul Mclaughlin 12 -> 10, Allison Scott
11 -> 8, Nick Melissari 11 -> 6, Brian Sengebush 8 -> 3, Robin Feldman
5 -> 4, Anthony Palmisano 3 -> 2, Dan Lagala 1 holds; Javier Melo and
Pablo Lopez 1 -> 0 (their all-three account bought a category only before
July). Goals in goals.csv (Core 155, Core+ 84, Overall 239) are untouched
-- Kohler set them, and whether they move with the shorter window is
Kohler's call.

NOTE: the export must cover the whole buying period (Jul 1 on).
generate.py REBUILDS data.csv from whatever file it's handed -- it does
not merge -- so a partial/current-week export would silently drop every
account outside its window.

generate.py uses an explicit product list, not a keyword guess, and
raises on an unrecognized product rather than guessing -- add new
flavors there after confirming with the user, the same way the Display
Auction Tracker's PRIORITY_BRANDS/ALLOTHER_BRANDS work. Products are
matched on the name with the leading product number and all spaces
stripped, so a renumbered SKU or an "8.4oz" vs "8.4 oz" spelling still
matches. Three Flavor editions (Orange, Sea Blue-Juneberry, Blue) are
listed but have not appeared in an export yet.

Adding or renaming a category means editing CATEGORIES + the product
sets in generate.py AND the CATS registry near the top of index.html's
script (key / label / tag CSS class / blurb); the tiers live in the TIERS
list beside it (key / label / class / blurb / the categories it
requires), and the LAST tier is treated as the finish line everywhere.
Everything else on the page -- stat tiles, leaderboard lines, goal cards,
account tags, headline and footer -- is generated from those lists.
index.html also keeps a LEGACY map so an older data.csv (which called
Regular "Core" and Flavor "Core+") still reads correctly.

The stat tiles are deliberately just Buying Accounts / Core / Core+ --
the per-category and %-of-goal tiles were removed as noise. Per-category
totals still appear as goal-less cards further down each rep's page.

index.html's ingestData() only checks whether a (customer, category)
row EXISTS for a rep, not the Bought column's value -- so Bought is
always written as 1 by generate.py, matching the existing file.
