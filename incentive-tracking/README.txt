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

Files (once the raw data starts arriving, 4/4/3 cadence):
  generate.py        Rebuilds the embedded JSON in index.html from the
                      11 raw data files.
  index.html          The dashboard itself.
  data/               Raw source files as they're dropped in, one per
                      program (kept for traceability, like MPOs/).

The 11 programs (Aug 2026 unless noted), as read from the deck:

1. BEAK & SKIFF 1911 REWARDS -- Aug-Sept
   - $10 per new Off-Premise placement of 1911 Cider
   - $100 per new placement of 1911 Draft, paid after 2 barrels
   - Bonus: top 3 performers (by distribution + volume) win a trip to
     the 1911 Cidery in Upstate NY
   Tracking: new off-prem placement count, new draft placement count +
   barrel volume gate, rep ranking for the bonus.

2. WOODCHUCK CIDER REWARDS -- Aug-Sept
   - $10 per new Off-Premise placement of Woodchuck Cider
   - $100 per new Woodchuck Draft placement, paid after 3 barrels
   - $1.00 per case sold during the period
   - Qualifier: 3 placements minimum for ANY payout
   OPEN QUESTION (resolve when the data file arrives): is the
   3-placement minimum off-prem + draft combined, per rep? Assuming
   yes (combined new-placement count per rep) unless the file's
   structure says otherwise.
   Tracking: new placement count (off-prem + draft), case volume,
   3-placement qualifier gate.

3. TONA DISTRIBUTION AND VOLUME REWARDS -- Aug-Sept
   - $10 per new Off-Premise placement of TONA 24oz Cans
   - $1.00 per case of TONA 24oz Cans sold
   - $0.50 per case of all other TONA cases sold
   - Qualifier: minimum 20 cases of TONA 24oz cans sold to earn
     anything above
   Tracking: new 24oz-can placement count, 24oz case volume, other-SKU
   case volume, 20-case qualifier gate.

4. BOSTON BEER AUGUST DRAFT BLITZ
   - Draft (Angry Orchard 15.5 / Dogfish Head 15.5): $100/new POD,
     $50/rebuy
   - Package: $10/placement on all Single Serve Packages
   - Bonus: trip to the AO Cidery (one on-prem rep, one off-prem rep),
     scored by points -- draft placement = 2pts, package placement = 1pt
   OPEN QUESTION: "all Single Serve Packages" -- assuming this means
   Boston Beer portfolio single-serve SKUs (Angry Orchard / Dogfish
   Head), not literally every brand in the warehouse. Will confirm
   against the actual file's SKU list when it arrives.
   Tracking: new POD / rebuy counts by brand, package placement count,
   points leaderboard for the trip bonus.

5. SAM ADAMS OCTOBERFEST FAST START -- August
   - Double commission on all Sam Adams if positive
   - $1.00 per case on Octoberfest over last year (Aug 2025 vs Aug 2026)
   Per Gavin, 2026-08-05: skip the dollar math on the "double
   commission" piece entirely -- no standard per-case commission rate
   is available to calculate from. Track it as a status flag only
   (rep's Sam Adams volume positive vs. negative year-over-year).
   The $1/case Octoberfest year-over-year growth piece IS trackable
   from volume data (this-Aug cases minus last-Aug cases) and will
   show as a progress/case-count figure, not a $ figure, per the
   "progress only" scope decision above.

6. LYTT LAUNCH -- Aug/Sept
   - Tier 1 "Gettin' Lytt": 25% account penetration -> $0.50/case
   - Tier 2 "Lytty City": 50% penetration -> $1.00/case
   - Tier 3 "Lytt-Faced": 75% penetration -> $2.00/case
   - Once a tier is hit, that payout rate continues through Dec 31
   - Bonus: highest penetration after Aug 1 wins 2 tickets to a
     Giants or Jets home game
   OPEN QUESTION: penetration = accounts carrying Lytt / total eligible
   account universe. Need the denominator (a target/eligible-account
   list per rep, similar to on-prem's Target Accounts) -- will ask
   when this file arrives if it isn't self-evident from the data.
   Tracking: per-rep penetration %, tier reached, ranking for the
   bonus.

7. NEW BELGIUM DRAFT (Summer Draft Focus) -- August
   - Juicy Haze / Two Hearted Draft: $100 new 1/2bbl POD / $50 rebuy;
     $50 new 1/6bbl POD (must sell 2) / $25 rebuy
   - Team bonus: $200/rep if 4 new lines
   - House goal: 70 PODs by Aug 31 (period May-Aug); was at 42 as of
     July 15
   - All other Voodoo & Fat Tire: $25/keg
   Per Gavin, 2026-08-05: the raw data file will include the full
   May-Aug history, so the running POD count toward the 70-POD house
   goal is computed directly from the file -- no manual baseline
   needed.
   Tracking: new POD / rebuy counts by keg size, running May-Aug POD
   total vs. the 70-POD house goal, 4-new-lines team bonus flag per
   rep, other-brand keg volume.

8. THE PATH TO VICTORY (Victory Monkey Family) -- August
   - Five For Fighting 6pk Can Distribution: $25 for any account
     buying 5 6pk cans (submitted through iSellBeer app); $10 for any
     new POD of the 6pk can
   - Five For Fighting 19.2oz Bonus: $10 for any new POD of 19.2oz
     cans; $5 for all current POD of 19.2oz cans
   Tracking: qualifying-account count (5+ 6pk cans, iSellBeer-sourced),
   new POD counts by pack size, current-POD count for 19.2oz.

9. FALL SEASONAL FAST START
   - $0.50/CE on all qualifying packages
   - $5.00 per sixtel
   - $10.00 per half-keg
   - $5.00 per case on qualifying Spirits
   - Objective: be first to market with all Fall Seasonal products
   Scope: the qualifying SKU list is the Oktoberfest & Pumpkin list
   below (slide 11) -- Draft & Package / Spirits / Package Only.
   Tracking: new-placement counts against the SKU list, by package
   type (case/CE, sixtel, half-keg, spirits case).

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

11. LE GRAND NOIR VOLUME INCENTIVE -- Aug, Sept, Oct
    - Qualifier: 70 cases House Goal
    - Payout: $10 per case of Le Grand Noir
    Per Gavin, 2026-08-05: the 70-case goal is a COMPANY-WIDE gate,
    not a per-rep goal. OPEN QUESTION (resolve when the file arrives):
    once the house hits 70 total cases, does the $10/case rate apply
    retroactively to every case sold this period, or only to cases
    sold after the threshold is crossed? Will ask when building this
    program's module -- flagging here so it isn't missed.
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
