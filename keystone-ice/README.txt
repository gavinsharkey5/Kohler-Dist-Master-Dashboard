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
               row per rep, 18 reps as issued 08/18/2026.
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
