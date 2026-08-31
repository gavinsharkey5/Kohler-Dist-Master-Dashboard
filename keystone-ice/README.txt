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

Files:
  goals.csv    Extracted from Kohler's "2026 Key Ice Goals" workbook
               (goals.xlsx, kept alongside as the original): Sales Rep
               Assigned, Buyer Count 2026, Qualifier, Bonus Goal. One
               row per rep, 18 reps as issued 08/18/2026.
  goals.xlsx   The workbook Kohler sent, untouched. generate.py does
               NOT read it -- it reads goals.csv -- but it is the
               provenance for those numbers, so keep them in step if
               the goals are reissued.
  actuals.csv  RDE "Comparison" export of Keystone Ice 24 oz
               off-premise buyers, windowed 8/1/2026 - 9/30/2026.
  generate.py  Rebuilds data/keystone_ice.json + data/sync_meta.json.
  index.html   The page itself.

To refresh:
  1. Save the new Comparison export over actuals.csv (and a reissued
     goals workbook over goals.xlsx, re-extracting goals.csv from it).
  2. Run: python3 generate.py -- it prints the house buyer count and
     says whether the export carried a rep column.
  3. Commit and push.

TWO THINGS ABOUT THE COMPARISON EXPORT (both found 2026-08-31):

1. Buyer counts are DISTINCT ACCOUNTS and do NOT add up across rows.
   The 8/31 pull listed 62 buyer-count units across its 20 daily rows
   but carried a "Total" row of 54. 54 is the real distinct-buyer
   figure; 62 is the same accounts counted on more than one day.
   read_actuals() takes the Total row as the house number and treats
   the daily rows as activity only. Never sum the daily rows, and
   don't render a cumulative line off them -- the page's daily bar
   chart says so in its own subtitle for exactly this reason.

2. The 8/31 pull has NO rep column, so per-rep progress cannot be
   computed from it -- every rep renders "awaiting data" and the page
   carries a banner saying why. This is the one thing blocking the
   dashboard from being complete.

   THE FIX: re-pull the same Comparison report with "Sales Rep
   Assigned" AND a "Customer" column added as dimensions. generate.py
   already looks for both (find_col matches on substrings, so the exact
   header text can shift) and switches itself on: with a rep column and
   a customer column it counts each rep's DISTINCT customers, sets
   meta.repLevel true, and index.html fills in the Buyers / % of Base /
   Status / Projected $ columns with no code change.

   The customer column matters as much as the rep one. Buyer count is
   distinct accounts, so per-rep totals have to be deduped on customer
   -- summing a rep's daily buyer-count rows would overstate any rep
   whose account bought on more than one day, exactly the 62-vs-54 trap
   above. If a re-pull arrives with a rep column but no customer
   column, generate.py deliberately leaves by_rep empty and the page
   stays in "awaiting data" rather than publishing an inflated number.

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
