Keystone Ice 24 oz Rewards — September 2026

Tracks each rep against their off-premise Keystone Ice 24 oz
distribution goal for the September 2026 Molson Coors program.
Everything is scored on BUYER COUNT (distinct off-premise accounts
carrying the 24 oz can), never cases -- the qualifier, the bonus and
both top-performer awards all read buyer count, so the cases column in
the source export is carried into the JSON unused. Per Gavin
(2026-08-31): "should be based off buyer count. disregard the cases
portion for now."

Both goal tiers come from Kohler's workbook as issued, not recomputed
here: Qualifier is 40% of a rep's 2026 off-premise buyer base and Bonus
Goal is 50%. If Kohler reissues the goals with different percentages,
the new file carries the new numbers and no code changes.

ONE DELIBERATE DEPARTURE FROM THE WORKBOOK (2026-09-04, per Gavin):
SHANE BARRECA'S BASE IS 27 IN goals.csv AND 29 IN goals.xlsx. Two of his
accounts -- Whole Foods #10381 (Closter, 201097) and Whole Foods #8407
(Woodcliff Lake, 201098) -- were taken out of his Keystone account base
on Gavin's instruction, so his row was recomputed at the SAME 40%/50%
the workbook uses: 27 / 10.8 / 13.5, which ceil to a qualifier of 11 and
a bonus of 14 (was 12 and 15). No other rep's row was touched.

THIS IS THE ONE THING A GOALS RE-EXTRACT WILL SILENTLY UNDO. Step 1 of
"To refresh" below says to re-extract goals.csv from a reissued
workbook -- doing that verbatim hands Shane 29 back and quietly raises
his bar by one account in each tier. If Kohler reissues the goals,
re-apply this exclusion afterwards (or check whether the reissue already
drops the two accounts, in which case it is settled at source and this
note can go). The same two accounts are excluded on the MPO off-premise
board's Keystone objective, where the exclusion lives in code -- see
KEYSTONE_BASE_EXCLUDED in MPOs/off-prem/generate_2026-09.py, which is
the better-protected half of the same decision. Keep the two in step.

Scoped to Keystone. Both accounts remain in Shane's book everywhere
else, including his Fever Tree Target Accounts list on the off-prem
board -- the ask named Keystone and nothing else.

WHOLE NUMBERS EVERYWHERE (per Gavin, 2026-08-31: "make the rep goals and
all other decimals whole numbers... easier on the eyes for a rep on
their iPad"). Kohler's goals arrive fractional -- 40% of a 43-account
base is 17.2 -- so both thresholds are rounded UP with ceil, and the
ceiling is what the page BOTH DISPLAYS AND SCORES AGAINST. That is not
a display convenience: for a whole number of accounts, buyers >= 17.2
and buyers >= 18 are the same test, so the number a rep reads is
exactly the number they must hit. Rounding down or to nearest would
break it -- a rep on 17 would read "17 of 17" and still not be
qualified. The raw fractional values stay in the JSON as qualifierRaw /
bonusRaw so provenance is never lost. Keep it this way; don't "fix" the
rounding to nearest.

Note a side effect on the smallest books: a 4-account base gives
qualifier 1.6 and bonus 2.0, both of which ceil to 2, so those reps hit
both tiers at once. That is what the math says and it is rendered
honestly (the card shows "qualify 2 / bonus 2").

NO HOUSE GOAL. This program has no house-level target -- it is scored
per rep, and the top-performer award is a race between reps, not a
total to reach (confirmed with Gavin 2026-08-31). An earlier version of
this page summed every rep's goal into a "house qualifier" bar; that
number was invented here, meant nothing to anyone, and has been
removed. The house figures that remain (accounts sold, reps qualified,
projected payout) are plain counts of what happened, not targets.

Files:
  goals.csv    Extracted from Kohler's "2026 Key Ice Goals" workbook
               (goals.xlsx, kept alongside as the original): Sales Rep
               Assigned, Buyer Count 2026, Qualifier, Bonus Goal. One
               row per rep, 18 reps as issued 08/18/2026 -- with Shane
               Barreca's row since edited away from the workbook on
               purpose (27, not 29; see the departure note above before
               re-extracting this file).
  goals.xlsx   The workbook Kohler sent, untouched. generate.py does
               NOT read it -- it reads goals.csv -- but it is the
               provenance for those numbers, so keep them in step if
               the goals are reissued.
  actuals.csv  RDE "KEYSTONE ICE 24 OZ CANS ARE BACK SEPT 2026"
               export: Sales Rep Name, Product, Brand, Customer Num
               Name, Date, Buyer Count and Cases, windowed
               8/1/2026 - 9/30/2026. Keep the rep AND customer columns
               on every re-pull -- see below for why.
  generate.py  Rebuilds data/keystone_ice.json + data/sync_meta.json.
  index.html   The page itself.

2026-09-08 REFRESH
101 distinct accounts house-wide (was 84), 3 reps qualified (was 2), $190
projected (was $125). Javier Melo qualified at 12 of 12; Derrick Laws went
13 -> 14 and passed Pablo Lopez for rank #1. Actuals grew 96 -> 115 rows with
none removed. Goals were NOT reissued, so the Shane Barreca exclusion above
still stands untouched.

THIS REFRESH ALSO REPAIRED A DRIFT. actuals.csv here was still on the 96-row
pull while MPOs/off-prem/keystone_ice_24oz.csv already carried a 108-row one
-- the same divergence the 2026-09-04 note in incentive-tracking/README.txt
describes. Both files now hold this refresh's identical 115-row export, and
the two boards were cross-checked per rep afterwards (101 accounts each, zero
differences). Whenever this file changes, change that one to match in the same
commit.

2026-09-21 REFRESH: actuals.csv onto the 214-row export (6 new rows, none
  removed -- diffed before the run). 168 -> 173 distinct accounts house-wide;
  still 7 qualified, 3 at bonus, $855 projected. Only Jayson Romine moved:
  5 -> 10 of 33 (29%), five 9/21 load sheets (Super Saver, Liquor Factory
  III Sparta, Liquor Factory IV Hopatcong, Wine Country Newton, Wantage
  Plaza Liquor Outlet); 4 more to qualify, 8 to bonus. Javier Melo / C & S
  Lucky Liquors II is a repeat. Phil Ernst's 9/30 USA Wine Traders row (flagged
  9/18) is still in the export. Same file onto MPOs/off-prem/keystone_ice_24oz.csv
  (sync rule); off-prem MPO and incentive-tracking rebuilt after this board.

2026-09-18 REFRESH: actuals.csv onto the 208-row export (5 new rows, none
  removed -- diffed before the run). 166 -> 168 distinct accounts house-wide;
  still 7 qualified, 3 at bonus, $850 -> $855 projected. Dave Ehlers 8 -> 9
  (Essex St Liquor and Wine, 9/18), Phil Ernst 12 -> 13 of 27 (48%, USA Wine
  Traders Paramus). THAT ROW IS DATED 9/30 -- twelve days ahead of the pull,
  not the usual one -- and the same account carries 31 more 9/30 rows on the
  off-prem board's Fever Tree and Wine & Spirits exports; kept as the export
  is the record, flagged to Gavin in MPOs/off-prem/README.txt. Derrick Laws /
  Ant's, Klejdi Lamo / Boonton Liquor Locker and Matt Powierski / Metro Elmwood
  Park are repeats. Same file onto MPOs/off-prem/keystone_ice_24oz.csv (sync
  rule).

2026-09-17 SECOND REFRESH: actuals.csv onto the 203-row export (3 new rows,
  none removed, all dated 9/18 -- scheduled loads a day ahead of the pull).
  164 -> 166 distinct accounts house-wide; 7 qualified, 3 at bonus, $840 ->
  $850 projected. Pablo Lopez 18 -> 19 of 12 (68%, Altiero Liquors); Michael
  Harboy 0 -> 1 (Wayne Liquor Locker). Derrick Laws / Hiciano is a repeat.
  Same file onto MPOs/off-prem/keystone_ice_24oz.csv (sync rule).

2026-09-17 REFRESH: actuals.csv onto the 200-row export (11 new rows, none
  removed -- diffed before the run). 159 -> 164 distinct accounts house-wide;
  7 qualified (was 5), 3 at bonus, $840 projected. CHRIS PAYTON 15 -> 17 of
  39 (42%) and PHIL ERNST 9 -> 12 of 27 (44%) both cross the 40% qualifier
  on 9/17 rows. Three rows are dated 9/18, a day ahead of the pull
  (scheduled loads) -- the export is the record, as before. The same file
  went onto MPOs/off-prem/keystone_ice_24oz.csv (sync rule).

2026-09-16 REFRESH: actuals.csv onto the 189-row export (7 new rows, one
dropped -- Anthony Palmisano / 8009 Appio's Liquors 9/15, a scheduled delivery
that fell off). 154 -> 159 distinct buying accounts house-wide. Same export
onto MPOs/off-prem/keystone_ice_24oz.csv in the same commit; off-prem and
incentive-tracking rebuilt afterwards.

2026-09-15 SECOND REFRESH: actuals.csv onto the 183-row export (8 new rows,
none removed), 146 -> 154 distinct accounts, still 5 qualified and 2 at
bonus, $530 -> $550 projected: PABLO LOPEZ 14 -> 16 of 12 (57% of 28) and
takes the top line from Derrick Laws (16 of 13, 50%) on percentage. Matt
Powierski 12 -> 14 (two from his 16), Chris Payton 14 -> 15 (one from 16),
Dave Ehlers 6 -> 8, Jim Heaney 11 -> 12. Everyone else holds exactly.
  ALL EIGHT NEW ROWS ARE FUTURE-DATED: six 9/16 (Monroe Wine & Liq and
  Bombolon for Pablo, Capri Deli for Matt, Teaneck Liquors and Bottle & Cork
  for Dave, Krauszers Food for Jim, Hollywd Liq & Deli for Chris) and two
  9/17 (Garfield Discount Liquors for Matt). Same call as Klejdi's Sandy's
  row this morning: the export is the record, the next pull settles it.
Same export applied to MPOs/off-prem/keystone_ice_24oz.csv in the same commit;
both boards read 154. incentive-tracking rebuilt afterwards.

2026-09-15 REFRESH: actuals.csv onto the 175-row export (26 new rows, none
removed), 123 -> 146 distinct accounts, 4 -> 5 qualified, $470 -> $530
projected: KLEJDI LAMO qualifies, 8 -> 12 of 11 (44% of 27), two from bonus.
The top four hold exactly (Derrick Laws 16, Pablo Lopez 14, Dan Lagala 21,
Javier Melo 13). Below the line Phil Ernst 2 -> 8, Matt Powierski 8 -> 12
(four short), Shane Barreca 2 -> 5, Anthony Palmisano 5 -> 7, Jim Heaney
9 -> 11, Chris Payton 13 -> 14, Jayson Romine 4 -> 5.
  KLEJDI'S QUALIFICATION RIDES A FUTURE-DATED LOAD SHEET: Sandy's Wine &
  Spirit (P) Budd Lake #191814 is dated 9/16, a day ahead of this pull, and
  it is the account that takes him from 11 to 12. Same call as Pablo's
  Sunny's row on 9/14: the export is the record, and the next pull settles it.
Same export applied to MPOs/off-prem/keystone_ice_24oz.csv in the same commit;
both boards read 146. incentive-tracking rebuilt afterwards.

2026-09-14 REFRESH: actuals.csv onto the 149-row export (10 new rows, none
removed), 119 -> 123 distinct accounts, still 4 qualified but TWO REACH BONUS
for the first time: Derrick Laws 15 -> 16 of 13 (50% of 32) and Pablo Lopez
12 -> 14 of 12 (50% of 28), so projected payout goes $300 -> $470. Dan Lagala
20 -> 21 of 18, one account from bonus. Nobody else moved.
  PABLO'S BONUS RIDES A FUTURE-DATED LOAD SHEET: Sunny's Liqs.(P) #27066 is
  dated 9/15/2026, a day ahead of this refresh. It is a scheduled load sheet
  and the export is the record, the same call the off-prem board has made all
  month -- but it is the account that takes him from 13 to 14, i.e. from
  qualified to bonus. If that delivery falls through, the next pull drops him
  back and the payout with it.
  actuals.csv here had drifted a pull behind again (139 rows vs the off-prem
  board's 144) since 2026-09-11, when only the MPO copy was refreshed. Both
  now hold the same 149-row export.
Same export applied to MPOs/off-prem/keystone_ice_24oz.csv in the same commit;
both boards read 123. incentive-tracking rebuilt afterwards.

2026-09-10 REFRESH: actuals.csv onto the 139-row export (15 new rows, none
removed), 109 -> 119 distinct accounts, 3 -> 4 qualified, $195 -> $300
projected. Dan Lagala qualified (17 -> 20 of 18, 47% of 43) and is rank #1;
Derrick Laws 14 -> 15 (1 from bonus), Chris Payton 11 -> 13. Same export
applied to MPOs/off-prem/keystone_ice_24oz.csv in the same commit; both
boards read 119. incentive-tracking rebuilt afterwards.

2026-09-09 REFRESH: actuals.csv onto the 124-row export (through 9/11 -- one
future-dated C Town load sheet for Derrick Laws), 101 -> 109 distinct
accounts, still 3 qualified (Javier Melo 13, Derrick Laws 14, Pablo Lopez
12), $190 -> $195 projected. Dan Lagala sits at 17 of 18. Same export applied
to MPOs/off-prem/keystone_ice_24oz.csv in the same commit; both boards read
109. incentive-tracking rebuilt afterwards.

To refresh:
  1. Save the new Comparison export over actuals.csv (and a reissued
     goals workbook over goals.xlsx, re-extracting goals.csv from it).
  2. Run: python3 generate.py -- it prints the house buyer count and
     says whether the export carried a rep column.
  3. Commit and push.

TWO THINGS ABOUT THE ACTUALS EXPORT:

1. Buyer counts are DISTINCT ACCOUNTS and do NOT add up across rows.
   The export carries one row per rep/account/date, so an account
   buying on two days appears twice -- the 8/31 pull holds 62 rows but
   only 54 distinct accounts. Every buyer figure on the page is a count
   of DISTINCT customers, never a sum of the Buyer Count column, which
   would overstate any rep whose account reordered. The same applies to
   the daily chart: each day counts the distinct accounts active that
   day, and the days deliberately do not add up to 54. The chart's own
   caption says so, because someone will try to add them.

2. ALWAYS re-pull with BOTH "Sales Rep Name" AND a customer column.
   generate.py needs both and refuses to guess: with a rep column but
   no customer column it cannot dedupe an account that bought twice, so
   it deliberately leaves per-rep empty and the page renders "awaiting
   data" rather than publishing an inflated number. find_col() matches
   on substrings, so the exact header text can shift between exports
   without breaking anything.

   (The first pull for this dashboard, an RDE "Comparison" export on
   2026-08-31, had neither column -- only Product/Brand/Date/Buyer
   Count/Cases -- which is why that fallback path exists at all.)

TOP PERFORMER RACE PANEL -- OFF, BUT KEPT (2026-08-31)
The page used to open with two cards, $300 and $150, naming whoever
currently sat #1 and #2 on percentage of their own base. Gavin: "take
out the top 2 performing reps for now as well... keep this saved because
we will probably add it back", clarified as "the card for it at the
beginning ($300 and $150)".

It is hidden by a single flag, not deleted: SHOW_TOP_PERFORMER_RACE at
the top of index.html's <script>. Everything that builds the panel --
the heading, the .race markup, the CSS, the render code -- is still
there. Flip the flag to true and it all comes back; no other edit is
needed. Do NOT "clean up" the dead code, it is deliberately parked.

What stays visible either way: the $300 / $150 rule on the rules card
(so a rep knows the award exists), and the #N rank pill on each rep
card. Only the by-name callout of the current top two is off -- the
race is a month from being decided and the panel read like it had
already been called.

Also unaffected: the same program's card on the incentive tracker, whose
"Rank Among Reps" tile still carries a "top two earn $300 / $150"
subline. That is a per-rep rank, not a leaderboard callout, so it was
left alone -- but if the intent is that nobody sees the race framed at
all, that subline is the other place to change.

Reward structure (from Kohler's September 2026 one-pager, no data
source -- edit REWARDS at the top of generate.py if it changes):
  Qualifier   rep must hit their own off-premise distribution goal;
              all placements made in August count.
  Reward      $5.00 per off-premise Keystone Ice 24 oz placement.
  Bonus       hit the bonus goal and it pays $10.00 per placement
              instead (not in addition -- the page's projected payout
              applies one rate or the other, never both).
  iSell Beer  $5 per cooler-door picture submitted, which must be next
              to Busch or Bud Ice, priced at or below them, with the
              cooler door sticker. NOT TRACKED HERE yet -- it needs an
              iSell Beer photo export like the one behind
              MPOs/off-prem's Lytt POS objective, and none has been
              pulled for Keystone Ice. The rules card shows the payout
              so reps know it exists; the projected-$ column does not
              include it.
  Top perf.   $300 for the highest off-premise distribution percentage,
              $150 for second. The rep table sorts on % of base by
              default so that race is the page's headline ordering --
              it can't be called until rep-level data lands.
