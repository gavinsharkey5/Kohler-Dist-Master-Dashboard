Incentive Tracking folder
==========================

Single dashboard housing all August 2026 Kohler supplier incentive
programs, so each rep can see where they stand on every program in one
place instead of hunting across 11 separate one-pagers. Source deck:
"2026 August Rewards Deck" (slides 2-12; slide 1 is the cover
checklist, slides 13-25 are out of scope per Gavin, 2026-08-05).

Per Gavin, 2026-08-05: this dashboard tracks PROGRESS toward each
program's tiers/qualifiers/goals -- NOT estimated dollar payouts. No
$ leaderboard, no per-rep $ totals. Progress bars / tier status /
qualifier-met flags only, same visual language as the MPO tracker.

Files:
  generate.py        Rebuilds the embedded JSON in index.html from the
                      raw data files in data/. Run: python3 generate.py
  index.html          The dashboard itself. Rep-chip nav like the MPO
                      tracker; pick a rep to see all 4 built programs.
  data/               Raw source RDE exports, one CSV per program
                      (kept for traceability, like MPOs/). Re-run
                      generate.py after dropping in a refreshed file.

STATUS (2026-08-05): 9 of 11 original-deck programs built and live --
everything except Le Grand Noir (program 11, no data yet -- held until
a file exists). All three planned batches delivered.

CONTINUING PROGRAMS (slides 13-25, added 2026-08-1x): Gavin asked to
add 8 more programs from the deck's "continuing programs" section,
originally deferred on 2026-08-05. 3 of 8 built so far -- Sun Cruiser
Volume, Yave Tequila Launch, Molly's 1.75L. See "CONTINUING PROGRAMS"
section below for all 8, including the 5 not yet built (Sammy's Beach
Bar Rum -- no data yet; New Belgium Distribution/Volume, Garage Beer
President's Incentive, Garage Beer Summer Sequel, Summer of Success
THC Volume -- not yet sent, several need goal-threshold numbers not on
the slides). The iSellBeer Summer Display Auction (slides 14-15) is
NOT part of this dashboard -- it's covered by the separate
isellbeer/display-auction-tracker/, and the Chelada/Corona Premier
Summer of Success program (slides 24-25) was not requested.

Roster note (2026-08-1x): Sun Cruiser's file surfaced 3 names with
real sales that aren't on the roster -- Chris Politano, John Neukum,
Office Tell Sell. Per Gavin: "do not include christopher politano,
john neukum or office tell sell on the incentive dashboard. they are
not reps" -- their rows are dropped like any other out-of-scope entry
(same treatment as "Default", an unassigned-account bucket in the
customer base files). ROSTER stays at the original 27 names.

Batch-1 schema notes (apply to any future refreshed pull of these same
4 files): 1911/Woodchuck/Tona share the same dual-period RDE shape as
on-prem's August pipeline -- Sales Rep Assigned, Customer Num, Customer
Name, Product Num, Product Name, Package, Brand Family, Date, then
paired Buyer Count/Placement Count/Cases columns split into base period
(5/1-7/31) and current period (8/1-9/30). "New placement" = populated
in the current-period column, never populated in the base-period column
for that (rep, customer, product) combo -- same classify_dual_period
logic as MPOs/on-prem/generate_2026-08.py. The 1911 and Woodchuck files
also carry a Premise column ("On Premise" / "Off Premise") added in the
second data pull -- this is used directly to split Off-Premise placements
from Draft (On Premise + a keg package string), no inference needed.
Path to Victory is single-period only (8/1-9/30, no base-period column)
and adds a Product Type column (Case Beer / Keg Beer).

The 11 programs (Aug 2026 unless noted), as read from the deck:

1. BEAK & SKIFF 1911 REWARDS -- Aug-Sept [BUILT]
   - $10 per new Off-Premise placement of 1911 Cider
   - $100 per new placement of 1911 Draft, paid after 2 barrels
   - Bonus: top 3 performers (by distribution + volume) win a trip to
     the 1911 Cidery in Upstate NY
   Per Gavin, 2026-08-05 (correcting an earlier "per rep" answer): the
   barrel threshold is PER ACCOUNT -- each account's own cumulative
   current-period draft volume (summed across all its keg SKUs,
   converted from keg size to barrels: 5.2 Gal / "1/6 BBL Keg" = 1/6
   bbl, 15.5 Gal = 1/2 bbl) must cross 2 barrels before that account's
   draft placements qualify, not the rep's total across all accounts.
   Built: off-prem new-placement count + list, a per-account draft
   volume table (each account's cumulative bbl vs. the 2-bbl goal and
   qualified/building status), new draft placements tagged with their
   account's bbl progress, company-wide leaderboard (new placements
   desc, then case volume desc) with a top-3 badge for the trip bonus.

2. WOODCHUCK CIDER REWARDS -- Aug-Sept [BUILT]
   - $10 per new Off-Premise placement of Woodchuck Cider
   - $100 per new Woodchuck Draft placement, paid after 3 barrels
   - $1.00 per case sold during the period
   - Qualifier: 3 placements minimum for ANY payout
   Same per-account barrel-threshold mechanic as 1911 above, at 3 bbl.
   3-placement qualifier assumed to be off-prem + draft new placements
   combined per rep (not corrected by Gavin, keeping this assumption).
   Built: qualifier progress bar (0-3), off-prem + draft new-placement
   lists, per-account draft volume table, total case volume.

3. TONA DISTRIBUTION AND VOLUME REWARDS -- Aug-Sept [BUILT]
   - $10 per new Off-Premise placement of TONA 24oz Cans
   - $1.00 per case of TONA 24oz Cans sold
   - $0.50 per case of all other TONA cases sold
   - Qualifier: minimum 20 cases of TONA 24oz cans sold to earn
     anything above
   Built: 20-case qualifier progress bar, new 24oz-placement count +
   list, other-Tona case volume. No Premise column in this file (all
   Tona accounts in the data are off-premise liquor stores) and no
   draft component, matching the deck.

4. BOSTON BEER AUGUST DRAFT BLITZ [BUILT]
   - Draft (Angry Orchard 15.5 / Dogfish Head 15.5): $100/new POD,
     $50/rebuy
   - Package: $10/placement on all Single Serve Packages
   - Bonus: trip to the AO Cidery (one on-prem rep, one off-prem rep),
     scored by points -- draft placement = 2pts, package placement = 1pt
   First batch-2 file (2026-08-05) had draft/keg rows only; Gavin sent
   an updated file same day adding single-serve Case Beer/Case Cider
   rows (Angry Orchard 19.2oz cans, Dogfish 60/90 Minute IPA and
   Grateful Dead 19.2oz cans) -- Product Type ("Keg Beer"/"Keg Cider"
   vs "Case Beer"/"Case Cider") cleanly separates draft from package,
   no premise inference needed. Built: draft new-POD/rebuy counts +
   lists ($100/$50), package new-placement count + list ($10), and a
   points total per rep (draft placements x2, package placements x1).
   Per Gavin, 2026-08-05: skipped the company-wide leaderboard for the
   "one on-prem rep, one off-prem rep" trip bonus -- no rep-to-channel
   mapping is available in this data to split it; each rep just sees
   their own points total.

5. SAM ADAMS OCTOBERFEST FAST START -- August [BUILT]
   - Double commission on all Sam Adams if positive
   - $1.00 per case on Octoberfest over last year (Aug 2025 vs Aug 2026)
   Per Gavin, 2026-08-05: skip the dollar math on the "double
   commission" piece entirely -- no standard per-case commission rate
   is available to calculate from. Track it as a status flag only
   (rep's Sam Adams volume positive vs. negative year-over-year).
   Built: this file compares the SAME August window year-over-year
   (Units 8/1-8/31/2025 vs 8/1-8/31/2026, not a 90-day-non-buy base
   period like the other programs) across the full Sam Adams
   portfolio (48 SKUs). Per-rep total volume this-year vs last-year
   drives the positive/negative flag; Octoberfest-named SKUs only
   drive the case-growth figure for the $1/case piece. Note: since
   data was pulled 5 days into August, this-year totals are compared
   against ALL of last August and will read low/negative for most
   reps until later in the month -- flagged in the card copy so it
   doesn't read as reps being behind.

6. LYTT LAUNCH -- Aug/Sept [BUILT]
   - Tier 1 "Gettin' Lytt": 25% account penetration -> $0.50/case
   - Tier 2 "Lytty City": 50% penetration -> $1.00/case
   - Tier 3 "Lytt-Faced": 75% penetration -> $2.00/case
   - Once a tier is hit, that payout rate continues through Dec 31
   - Bonus: highest penetration after Aug 1 wins 2 tickets to a
     Giants or Jets home game
   The Lytt RDE file only lists accounts that already bought Lytt --
   no eligible-account universe, so the denominator had to come from
   elsewhere. Gavin provided two "Sales Reps' Customer Base" files
   (Core Off-Prem, Core On-Prem, same shape as on-prem's customer-base
   source: Sales Rep Assigned, Customer Num, Distribution Area, County,
   Premise). Cross-checked empirically: 54 of the 55 Lytt-buying
   accounts across the roster are in the Off-Prem file (only 1 in
   On-Prem), so Off-Prem is the eligible-account universe. Built:
   per-rep penetration % = distinct off-prem accounts buying Lytt /
   rep's total off-prem account count, tier reached + rate, buying
   -account list, case volume, and a penetration leaderboard for the
   tickets bonus.

   Note: the on-prem/off-prem customer base files this program's
   penetration math depends on live in incentive-tracking/data/ as
   customer_base_off_prem.csv / customer_base_on_prem.csv -- re-pull
   these periodically since the eligible-account universe (and
   therefore every rep's penetration %) shifts as the customer base
   changes, independent of new Lytt RDE pulls.

7. NEW BELGIUM DRAFT (Summer Draft Focus) -- August [BUILT]
   - Juicy Haze / Two Hearted Draft: $100 new 1/2bbl POD / $50 rebuy;
     $50 new 1/6bbl POD (must sell 2) / $25 rebuy
   - Team bonus: $200/rep if 4 new lines [not built -- no line-count
     signal beyond individual PODs in this file]
   - House goal: 70 PODs by Aug 31 (period May-Aug); was at 42 as of
     July 15
   - All other Voodoo & Fat Tire: $25/keg
   File has Units 5/1-7/31 and Units 8/1-8/31 only (no separate
   Buyer/Placement Count columns) -- "new POD" and volume both derive
   from Units. First batch-2 file only had 3 generic "New Belgium
   Brewing Company" SKUs (Ha Chi Keg, House Golden Pilsner, House
   Hazy IPA); Gavin sent an updated file adding the actually-named
   SKUs -- Bell's Two Hearted (both keg sizes), New Belgium Voodoo
   Juicy Haze (both sizes), New Belgium Voodoo Ranger IPA (both
   sizes), New Belgium Fat Tire (both sizes). keg_bbl() extended for
   the new "1/4 BBL Keg (7.75 Gal)" size seen on Two Hearted. Per
   Gavin, 2026-08-05: only the named tiers count toward anything --
   "Juicy Haze"/"Two Hearted" = featured tier ($100 half-bbl new POD/
   $50 rebuy, $50 sixtel-or-quarter-bbl new POD/$25 rebuy), "Voodoo
   Ranger"/"Fat Tire" = other-named tier ($25/keg flat, tracked as
   count + bbl volume, no new-vs-rebuy split since the rate doesn't
   depend on it). The 3 generic SKUs are matched to neither tier and
   are silently excluded (Gavin: "I will remove those generic names
   from the next rde file upload"). The 70-POD house goal is a
   COMPANY-WIDE count of distinct featured-tier (customer, product)
   pairs with ANY volume across the full May-Aug window (not an
   August-only new-vs-base comparison, since the goal explicitly spans
   "Period May-Aug") -- separate from the August-only new/rebuy $
   classification used for the per-rep POD lists.

8. THE PATH TO VICTORY (Victory Monkey Family) -- August [BUILT, partial]
   - Five For Fighting 6pk Can Distribution: $25 for any account
     buying 5 6pk cans (submitted through iSellBeer app); $10 for any
     new POD of the 6pk can
   - Five For Fighting 19.2oz Bonus: $10 for any new POD of 19.2oz
     cans; $5 for all current POD of 19.2oz cans
   Per Gavin, 2026-08-05: ignore everything iSellBeer-related for this
   program -- that's handled in a separate system. The RDE file for
   this program is single-period only (8/1-9/30, no base-period
   column), so there's no way to distinguish "new POD" from "current
   POD" from this file alone -- both $ tiers depend on that split.
   Built (interim, until a base-period file or other new/current
   signal is available): per-rep account count + unit volume for 6pk
   cans (Package "4/6/12oz Can") and 19.2oz cans (Package "1/15/19.2oz
   Can") this period, undifferentiated by new-vs-current. Keg rows in
   this file (Product Type "Keg Beer") are out of scope -- the deck's
   Path to Victory rewards only cover the two can formats.

9. FALL SEASONAL FAST START [BUILT]
   - $0.50/CE on all qualifying packages
   - $5.00 per sixtel
   - $10.00 per half-keg
   - $5.00 per case on qualifying Spirits
   - Objective: be first to market with all Fall Seasonal products
   Two RDE files cover this program -- "Packages Only" and "Packages
   and Draft" -- matching the deck's two-column SKU split (see slide
   11 screenshot, Gavin 2026-08-05): "Package Only" (1911 Cider Donut/
   Haunted Hayride, Athletic Dark & Gourdy/Oktoberfest, Flying Dog The
   Fear, Great Lakes Biergarten, Leinenkugel, Long Trail Harvest, New
   Belgium Atomic Pumpkin, Sam Adams Jack-O Pumpkin, Saranac x2, Shiner
   Oktoberfest, Shipyard Smashed Pumpkin, Sierra Nevada West Ghost,
   Southern Tier Nitro Warlock/Pumqueen, Woodchuck Spiced Apple, Whole
   Hog Pumpkin Ale) vs. "Draft & Package" (Cape May x2, Doc's Pumpkin
   Cider, Dogfish Head Punkin, Evil Genius, Flying Fish Oktoberfish,
   Great Lakes Oktoberfest, Hofbrau Oktoberfest, Montauk Pumpkin,
   Paulaner x2, Shipyard Pumpkinhead, Sierra Nevada Oktoberfest,
   Sixpoint, Southern Tier Harvest/Pumking/Maple Warlock, Victory
   Festbier, Whole Hog Pumpkin Ale, Weihenstephan, Yuengling
   Oktoberfest). "Whole Hog Pumpkin Ale" legitimately appears in both
   lists per the deck (package form in one tier, draft form in the
   other), which explains why early pulls of the two files had
   overlapping rows for that product -- resolved once Gavin confirmed
   (2026-08-05) to keep the two files/tiers fully separate rather than
   merge/dedupe, matching the screenshot.
   Both files are single-period (August 2026 only, no 90-day-non-buy
   base period), so there's no new-vs-rebuy split -- every row is just
   this month's activity against the $0.50/CE (package) rate, or for
   "Packages and Draft" only, keg rows classified by size into sixtel
   ($5, 1/6bbl e.g. Dogfish Head Punkin Ale) or half-keg ($10, 1/2bbl
   e.g. Southern Tier Maple Warlock/Pumking). Two keg sizes present in
   the data aren't named in the deck's two draft tiers -- 1/4bbl/7.75
   Gal (Point Whole Hog Pumpkin Ale) and 50L/13.2 Gal (Hofbrau/Paulaner
   Oktoberfest Bier, a European keg format) -- tracked as an "other keg
   sizes" bucket (count + bbl volume) with no assumed $ rate rather
   than guessing which named tier they'd fall into. No Spirits
   (Southern Tier Pumking Whiskey) rows in either file yet, so that
   line item isn't built -- add it if/when spirits activity appears.
   Team bonus ("first to market") isn't built -- no ranking signal for
   it beyond the per-rep CE/keg counts already shown.

10. OKTOBERFEST & PUMPKIN SKU LIST (slide 11, appendix to #9)
    Not a standalone incentive -- this is the qualifying product list
    for Fall Seasonal Fast Start:
      Draft & Package: Cape May Pick Of The Batch Pumpkin Ale, Cape
        May Oktoberfest, Doc's Pumpkin Cider, Dogfish Head Punkin Ale,
        Evil Genius Trick Or Treat Chocolate Pumpkin Porter, Flying
        Fish Oktoberfish, Great Lakes Oktoberfest, Hofbrau Oktoberfest,
        Montauk Pumpkin Ale, Paulaner & Hacker Pschorr Oktoberfest
        Marzen, Paulaner Oktoberfest Bier, Shipyard Pumpkinhead, Sierra
        Nevada Oktoberfest, Sixpoint Oktoberfest, Southern Tier
        Harvest, Southern Tier Pumking Imperial Ale, Southern Tier
        Maple Warlock Imperial Pumpkin Ale, Victory Festbier, Whole
        Hog Pumpkin Ale, Weihenstephan Fest Beer, Yuengling Oktoberfest
      Spirits: Southern Tier Pumking Whiskey
      Package Only: 1911 Cider Donut, 1911 Haunted Hayride, Athletic
        Dark & Gourdy, Athletic Oktoberfest, Flying Dog The Fear
        Imperial Pumpkin, Great Lakes Biergarten Variety Pack,
        Leinenkugel Oktoberfest, Long Trail Harvest Ale, New Belgium
        Atomic Pumpkin, Sam Adams Jack-O Pumpkin, Saranac Pumpkin Ale,
        Saranac 12 Beers of Oktoberfest, Shiner Oktoberfest 6pk
        bottles, Shipyard Smashed Pumpkin, Sierra Nevada West Ghost
        IPA, Southern Tier Nitro Warlock, Southern Tier Pumqueen
        Cider, Woodchuck Spiced Apple, Whole Hog Pumpkin Ale

11. LE GRAND NOIR VOLUME INCENTIVE -- Aug, Sept, Oct [HELD -- no data yet]
    - Qualifier: 70 cases House Goal
    - Payout: $10 per case of Le Grand Noir
    Per Gavin, 2026-08-05: the 70-case goal is a COMPANY-WIDE gate,
    not a per-rep goal. Per Gavin, 2026-08-1x (batch 2): "there is no
    data for le grand noir volume so we will hold off on that until
    there is data in the rde file" -- not part of batch 2, no file
    exists yet. Still open once a file arrives: does the $10/case rate
    apply retroactively to every case sold this period once the house
    hits 70, or only to cases sold after the threshold is crossed?
    Tracking: running company-wide case total vs. the 70-case gate,
    per-rep case volume once trackable/payable.

Build plan:
  Data arrives in 3 batches (4 files, 4 files, 3 files) mapped to the
  11 programs above -- Gavin will say which file is which program.
  For each file: inspect its actual columns before writing that
  program's calc logic (don't assume a schema from the slide alone),
  confirm rep attribution works the same way as MPOs/isellbeer (a
  consistent rep name/ID column), and flag anything that contradicts
  the deck or these notes before building against it.
  generate.py and the dashboard structure will follow the same pattern
  as MPOs/on-prem: one generate.py building embedded JSON per program,
  index.html rendering per-rep progress cards, ROSTER-driven like the
  MPO tracker.

CONTINUING PROGRAMS (deck slides 13-25)
========================================
Requested by Gavin, 2026-08-1x, after the original 11 were done. Same
build approach: inspect each file's real columns before writing calc
logic, flag anything that contradicts the deck.

1. SUN CRUISER VOLUME -- May-Aug [BUILT]
   - Earn payout for each case over last year's May-Aug volume, once
     this year's total exceeds last year's for the whole period
   - $1/case: 12pk+8pk+18pk, 24pk    $3/case: 4pk, 24oz+19.2oz
   File arrives pre-aggregated -- one row per (rep, package group,
   product) with a precomputed this-year vs last-year case difference
   for the full May-Aug window already baked in, no per-transaction
   rows or dual-period classification needed. Built: per-rep case
   growth (positive differences only) split into the $1 and $3 rate
   buckets, with the underlying product-line breakdown. Package group
   strings map cleanly to the deck's two tiers (SUN_CRUISER_RATE1_
   GROUPS / SUN_CRUISER_RATE3_GROUPS in generate.py).
   Roster note: this file surfaced Chris Politano, John Neukum, Office
   Tell Sell, and a "Default" bucket -- per Gavin, the first three
   "are not reps" and are dropped along with Default; ROSTER unchanged.

2. NEW BELGIUM DISTRIBUTION ("New Belgium Volume") -- Achieve May-Jun /
   Push Volume Jul-Aug / Retain Sep-Oct [NOT STARTED]
   - Achieve: secure distribution goals across 4 core brands (New
     Belgium, 12pk Voodoo, 19.2 Voodoo, Hearted Family, Kirin) -- tiered
     payout per brand goal achieved
   - Push Volume (Jul-Aug): volume payout for cases sold over last
     year, as part of the Summer Volume Program
   - Retain (Sep-Oct): tiered payout per brand goal retained
   - Core Bonus: additional tiered bonus if both achieve + retain goals
     hit AND positive NBB growth May-October
   Gavin asked for "new belgium volume" specifically -- likely just the
   Jul-Aug push-volume piece (same shape as Sun Cruiser), but the
   achieve/retain distribution-goal tracking needs brand-specific goal
   numbers not stated on the slide. Ask which scope when the file
   arrives, and ask for the goal numbers if achieve/retain is wanted.

3. GARAGE BEER PRESIDENT'S INCENTIVE -- Jun-Sep [NOT STARTED]
   - Flat $1.00/CE over last year, once total Garage Beer CEs (company-
     wide) cross 9,305 for the period
   Straightforward once the file arrives -- house-wide CE gate (same
   shape as Le Grand Noir's 70-case gate) plus per-rep CE-over-LY
   tracking.

4. GARAGE BEER SUMMER SEQUEL -- Jun-Aug [NOT STARTED]
   - Volume Push: 3 tiers over 2025 CEs -- Tiered ($1/CE), Bonus
     ($1.50/CE), Super Bonus ($2/CE) -- goal thresholds not on the slide
   - Draft Bonus: $50 new draft placement / $100 re-purchase (after
     account purchases 3 kegs total), half payout on 1/6bbl
   - $5 per on-premise iSellBeer feature submitted
   Need the 3 tier goal thresholds (CE counts) from Gavin before the
   volume-push piece can show tier status; draft bonus is buildable
   once the file arrives (same per-account cumulative-keg-threshold
   pattern as 1911/Woodchuck, at a 3-keg gate instead of barrels).
   iSellBeer feature count is out of scope (separate system, per the
   Path to Victory / Boston Beer precedent).

5. YAVE TEQUILA LAUNCH -- Jul-Aug [BUILT]
   - On-Premise (1 POD = 2 bottles): 1 POD = $10, 2 PODs = $25,
     cocktail feature = $50, cocktail permanent = $150, case rebuys
     during period = $25
   - Off-Premise (1 POD = 1 case/6pk): 1 POD = $15, 3 PODs = $50,
     5 PODs = $125, 3-case qualifies for consumer sampling
   File is single-period only (7/1-8/31, no base/comparison window)
   and has no Premise column. Built: premise resolved by cross-
   referencing Customer Num against the two Sales Reps' Customer Base
   files (load_premise_map() in generate.py) -- all 20 Yave accounts
   resolved cleanly (11 off-prem, 9 on-prem). Since there's no base
   period, new-vs-rebuy can't be split (same limitation as Path to
   Victory) -- tracks qualifying-account counts against the milestone
   tiers (on-prem: 2+ bottles this period; off-prem: 1+ case) rather
   than asserting new placements. Cocktail feature/permanent and
   rebuy tracking are out of scope -- no signal for them in this file.

6. MOLLY'S 1.75L -- Jul-Aug [BUILT]
   - Qualifier: 90-day unsold
   - $50 new POD, $10/case on rebuys during the period
   Same dual-period shape as 1911/Woodchuck (base period 4/1-6/30 =
   the 90-day-unsold window, current period 7/1-8/31) -- reused
   classify_dual() directly. No on/off-premise split in the deck for
   this program, so none built. Simplest of the continuing programs.

7. SAMMY'S BEACH BAR RUM -- Jul-Aug [HELD -- no data yet]
   - On-Premise (1 POD = 1 bottle): 1 new POD = $20, cocktail feature
     $25/month (verified), rebuys 3 bottles = $15 / 1 case = $30
   - Off-Premise (1 POD = 1 case): 1 new POD = $10, 3 new PODs = $40,
     12-case display = $200
   Per Gavin, 2026-08-05: no data yet, held until a file exists. Likely
   the same shape as Yave (on/off tiers, probably single-period only
   given Yave's file had no base period) -- expect the same premise-
   cross-reference and no-new-vs-rebuy caveats when it arrives.

8. SUMMER OF SUCCESS THC VOLUME -- Jun-Aug [NOT STARTED]
   - Qualifier: reps must hit their individual supplier volume goal to
     earn ANY payout (goal numbers not on the slide)
   - Delta: Tier 1 $500 (min 50 cases)
   - Crescent Cana: Tier 1 $250 (min 20 cases), Tier 2 $150 (min 10 cases)
   - Amplify Bonus: reps who clear Tier 1 on a supplier earn $1/case on
     ALL that supplier's THC cases sold over last year (Jun-Aug 2025)
   Need each rep's individual volume goal number(s) from Gavin before
   the Tier 1 qualifier gate can be evaluated -- the case minimums
   shown ARE on the slide (50/20/10), but "individual supplier volume
   goal" sounds like a separate, possibly per-rep number. Ask when the
   file arrives if it isn't self-evident from the data.

NOT part of this dashboard:
  - iSellBeer Summer Display Auction (slides 14-15, Sales Rep + Sales
    Associate versions) -- already covered by the separate
    isellbeer/display-auction-tracker/, not duplicated here.
  - Chelada / Corona Premier Summer of Success Volume Rewards (slides
    24-25) -- not requested.
