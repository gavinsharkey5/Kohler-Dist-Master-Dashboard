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
                      tracker; pick a rep to see their progress, split
                      into two sections per Gavin, 2026-08-1x: "New
                      Incentives" (the original 9 deck programs, slides
                      2-12) and "Ongoing Incentives" (the continuing
                      programs, slides 13-25) -- matches the deck's own
                      "CONTINUING PROGRAMS..." divider slide, so the
                      section labels track the deck's own framing
                      rather than an arbitrary split.
  data/               Raw source RDE exports, one CSV per program
                      (kept for traceability, like MPOs/). Re-run
                      generate.py after dropping in a refreshed file.

BRAND MARKS AT THE INCENTIVE LEVEL (2026-09-04)
===============================================
The guided flow shows the SUPPLIER logo on step 2 and now the BRAND marks
on step 3 (the incentive chooser) and on the step 4 progress hero, per
Gavin. A rep recognises the Sun Cruiser sun or the Lytt wordmark faster
than they read a program title, so the marks sit at the TOP of the card,
not as trailing decoration.

PROGRAM_LOGOS VALUES MAY NOW BE AN ARRAY. A program can carry more than one
brand -- Touchdowns & Tea is a Sun Cruiser AND Twisted Tea program -- so
progLogos() normalises a string or a list to a list and progLogo() /
v3Brands() render one tile each. Every existing single-string entry is
untouched and still works.

MISSING ASSET: assets/logos/twisted_tea.png. Touchdowns & Tea is mapped to
BOTH sun_cruiser.png and twisted_tea.png, but the Twisted Tea file does not
exist yet -- the September deck has no Twisted Tea artwork anywhere (its
only Touchdowns art is two Sun Cruiser football banners, checked by
extracting the slide's images), and there is no Twisted Tea mark elsewhere
in the repo. Drop the file at that path and it renders with NO code change.
Until then the <img> removes its own tile via onerror, so the card shows
Sun Cruiser alone rather than a broken-image icon -- verified in a browser
with the file genuinely absent.

STILL UNMAPPED: le_grand_noir has no brand mark (it had none in August
either) and there is no Le Grand Noir asset in the repo. Its card renders
with no brand tile, which is the correct degradation -- v3Brands() returns
an empty string for an unmapped key. Same one-line fix if a mark arrives.

PLACEMENT vs BUYER: THE GRAIN RULE (2026-09-04) -- REVERSES 2026-08-17
=====================================================================
Per Gavin, reading the September Rewards Deck: "any time the incentive says
'New PLACEMENT' this is at the SKU level. any time it says 'New BUYER' this
is at the brand family/brand level." The deck's own wording is now the test
for how a program is scored, and it decides the classification key:

    "New PLACEMENT"  ->  key (rep, customer, Product Num)
    "New BUYER"      ->  key (rep, customer)

THIS REVERSES THE 2026-08-17 RULING, which said the exact opposite -- that
an account already carrying one 1911 SKU that adds a second is a reorder,
not a new placement. That call predated the deck wording being used as the
test. Anyone reading the old note in git history should know it is dead.

IT MOVES REAL MONEY. On the 2026-09-04 data:
    1911 off-premise placements     29  ->  250   ($290 -> $2,500 at $10)
    1911 total (incl. draft)        34  ->  256
    Woodchuck off-premise            8  ->   31   ($80 -> $310)
    Touchdowns & Tea 12pk           4  ->   45   ($60 -> $675 placement leg,
                                                  total tracked $474 -> $1,089)
Reorder counts rise correspondingly (they are now per SKU too), which is
why the reorder figures on those cards jumped as well.

THREE PROGRAMS DID NOT MOVE, and it is worth recording why so nobody
"fixes" them later:
    tona         switched to per SKU, but Tona 24oz is a single SKU (7275),
                 so the SKU and account grains are identical here.
    evil_genius  switched to per SKU. Nine off-premise accounts carry more
                 than one of the three qualifying SKUs, but none of them was
                 a newly-placed account on this data, so the count held at 2.
    montauk      was already finer than account level (per PACK TIER) and is
                 now per SKU. No account had two SKUs in the same tier on
                 this data, so the count held at 8 -- but it would move the
                 moment one does.

NOT CHANGED, deliberately:
    other_half   the deck says "$40 per non-buy ACCOUNT OPENED purchasing
                 minimum 3 CORE SKUs", plus "$10 per SKU sold over 3". That
                 is an account-grain qualifier with a per-SKU kicker, and is
                 already built that way.
    two_xo       off-premise was already per SKU (the deck prices an
                 American Oak + French Oak PAIR); the on-premise leg is a
                 "2 bottle POD" per account.
    keystone_ice scored on distinct buying ACCOUNTS, and Keystone Ice 24oz
                 is one SKU (622) anyway.

STILL OPEN -- THE AUGUST-ONLY PROGRAMS. boston_beer classifies both its
draft and package legs at account level and its August deck says "POD" and
"placement", so the same rule probably applies. It is NOT changed here for
two reasons: the August deck is not in hand to check the wording, and
August is a closed month whose tab is a published snapshot -- restating it
would change scores reps were already measured on. Raise it with Gavin
before touching it. path_to_victory, sam_adams, new_belgium and mollys
either already key per Product Num or are not placement-scored, so they
need nothing.

WHERE THE CODE LIVES: classify_groups() in generate.py (renamed from
classify_by_customer, which survives as an alias for the genuinely
account-scoped legs). The grain is chosen by the KEY each builder assembles
before calling it -- grep for "Product Num"] in the key tuples.

GUIDED FOUR-STEP FLOW (2026-09-04, second pass -- supersedes v2 below)
======================================================================
The supplier-first pass below was the right structure but still put every
program's progress on one screen, so a rep still had to scan to work out
what was tappable. Gavin's standard for this page: "someone who has never
used a phone, computer, or dashboard before should still be able to figure
it out." So the path is now four SCREENS, one decision each, and only one
is ever on the page:

    Step 1  Choose your name
    Step 2  <First>, choose a supplier
    Step 3  <Supplier>  -- choose an incentive
    (—)     Your progress

STATE IS THREE VARIABLES -- vRep, vSup, vProg. Which screen renders is just
how many are set (renderGuided()), so Back is "clear the last one" and
there is no second history model to keep in sync. Every navigation, forward
and back, is ONE delegated handler on .js-go reading data-rep/-sup/-prog;
a Back button is the same element with fewer fields filled. Forward and
back therefore cannot disagree about where they land.

WHAT EACH SCREEN MAY CONTAIN
  Steps 1-3  a title saying what the rep is doing, and nothing but full
             width choice buttons. Every button carries an explicit verb
             ("SEE THESE INCENTIVES", "SEE MY PROGRESS") -- a rep is never
             asked to work out that a title, a chevron or a card is
             tappable. 64px minimum tap height, single column on a phone.
  Step 4     ONE number owns the screen: percent complete for a program
             with a threshold, or what they have landed/earned for an
             open-ended one. Then "What to do next" in a sentence. Then
             "See full details", collapsed, which opens the ORIGINAL card.

THE HERO NUMBER IS NOT ALWAYS A PERCENT, on purpose. heroFor() shows a
percent only for goal:true programs. An open-ended program (every
placement pays from the first) has no denominator, so it leads with the
real figure -- "$15 earned" -- rather than a percentage invented from
nothing. A made-up 100% on a rep's first placement would be worse than no
percentage at all.

MOBILE IS THE PRIMARY LAYOUT HERE. The phone rules are the base
stylesheet; the only desktop rule is a media query that lets the choice
buttons sit two or three across. Type scale, tap targets and the flow are
the phone's everywhere. Verified with no horizontal overflow at 390 / 834
/ 1280 px.

WHAT WAS REMOVED FROM THE DEFAULT VIEW, and where it went:
  the rep bar above <main>      -> is now Step 1 inside the flow
  the v2 supplier accordions    -> Steps 2 and 3
  the "Where to focus next" row -> dropped: it competed with the one
                                   decision each screen is asking for
  every program's stat tiles    -> behind "See full details" on step 4
  "Start Over"                  -> hidden on Step 1 (body.v3-deep), where
                                   it was a button that did nothing visible
  the month tabs                -> kept, but labelled "Which month?"; two
                                   unlabelled chips read as noise

v2's SUPPLIERS / PROGRAM_SUPPLIER / PROGRAM_SUMMARY / summarize() are
UNCHANGED and still the single source for grouping, numbers and status --
v3 only replaced the screens that draw them. renderRepV2()/renderBrowseV2()
and the v2- CSS are still in the file but no longer routed to; renderMain()
calls renderGuided(). Deleting them is safe, they are kept only so the v2
view is one line away if this proves too many taps for daily use.

generate.py is unaffected -- it only rewrites the PROGRAM_DATA blob and the
refresh date. Verified by running it after the rebuild and diffing
everything else: no change.

SUPPLIER-FIRST REDESIGN (2026-09-04)
====================================
Reps' feedback was that the page had "too much going on". The old default
view stacked ~20 full program cards, each with its stat tiles already open,
so answering "where do I stand" meant scanning every one. The page is now
built around the four questions a rep actually opens it with, and hides
everything else behind a tap.

WHAT A REP SEES NOW
  1. "Select your name", labelled step 1, is the only control above the fold.
  2. Picking a name renders "<First>'s Incentives" with four counts --
     Earned / On Track / Needs Attention / Not Started.
  3. "Where to focus next": the three unearned programs closest to paying,
     ranked by status then by percent complete, so the top card is the one
     they can finish soonest rather than the one furthest behind.
  4. Supplier sections, each a compact header ([logo] Molson Coors ·
     2 incentives · tally chips) over ONE ROW per program carrying exactly
     six things: program name, progress, goal, status, what's left, and the
     next step in a sentence.
  5. Tapping a row expands the ORIGINAL detailed card, unchanged.

Nothing was deleted. renderRepV2() replaced renderRep()'s body; the old
repSection()/renderPillNav() helpers and every card function are still
there and still used -- a row IS the old card, one tap deeper. Reinstating
the old stacked view is a one-line change in renderRep().

SUPPLIER IS THE TOP LEVEL because reps already navigate Encompass that way
(Gavin, 2026-09-04: "incentives are housed underneath their respective
supplier"). The groupings are NOT guessed: every one is the "Supplier"
value Kohler's own RDE exports carry for that program's brand family,
read straight out of the repo's CSVs -- Keystone -> "MolsonCoors Beverage
Company", Lytt AND Twisted Tea -> "Boston Beer Company", 2XO AND Le Grand
Noir -> "Prestige Beverage Group", Woodchuck -> "Vermont Hard Cider",
Tona -> "Artisanal Imports". Display names are trimmed to what a rep says
out loud; the RDE spelling is kept in SUPPLIERS[x].rde so the mapping can
be re-checked against a fresh export. Two programs span several suppliers
(fall_seasonal, display_auction) and sit under "Kohler House Programs"
rather than being filed under whichever brand happens to lead them.
PROGRAM_SUPPLIER is the ONLY place a supplier is decided -- nothing infers
one from a logo or a title.

PROGRAM_SUMMARY is the new per-program layer and the one to edit when a
number looks wrong. Each entry turns a rep's data into {now, target,
label, remain, next}. Two shapes:
  goal:true   a threshold switches money on -- the bar fills toward it and
              "X to go" is real (Keystone, Evil Genius, Tona, Woodchuck,
              the retention programs, and the two HOUSE-goal programs).
  goal:false  open-ended, every placement pays from the first one. There is
              no bar to fill, so the row carries what they have landed or
              earned and the status is simply whether they are on the board.
It reads the SAME fields the detailed cards read, so a row and the card it
opens cannot disagree. A program with no data returns null and renders
"Coming Soon" rather than an empty card -- that covers the manual
(photo-verified) programs and any September program still awaiting its
first export.

THE STATUS LADDER is five words, each with an icon, so meaning never rides
on colour alone: Earned / Close / On Track / Needs Attention / Not Started,
plus Coming Soon for a program with no feed. summarize() is the single
place that decides one, so the row chip, the header counts and the Focus
ranking can never disagree.

ONE SUBTLETY WORTH KEEPING: Lytt's bar tracks progress to the NEXT RATE,
not raw penetration. A rep at 19% is 76% of the way to the 25% tier;
filling the bar to 19% made that read "Needs Attention" when they are an
account or two from a raise. Any future tiered program needs the same
treatment (see pctOverride).

generate.py IS UNAFFECTED -- it only rewrites the PROGRAM_DATA blob and the
refresh date, both outside this markup. Verified by running it after the
redesign and diffing everything except the data blob: no change. Verified
in a browser at 1280 / 834 / 390 px across both month tabs and three reps:
no JS errors, no horizontal overflow, rows and cards present throughout.

MONTH TABS (added 2026-08-31)
=============================
This page used to be August-only. It now carries a month tab bar in the
header, driven by the MONTHS array in index.html. Each entry is
{key, label, newLabel, programs, repCards}:

  programs   the month's PROGRAM_LIST_<key> array (tiles, pill nav,
             leaderboards, ranking)
  repCards   {new, ongoing, retention} -- the ORDER cards appear in on
             the rep view, per group. August's arrays reproduce exactly
             the order that used to be hardcoded in renderRep(), which
             is why switching renderRep to be data-driven changed no
             rendered output on the August tab (verified by rendering
             both versions headless and diffing the .prog-grid markup:
             identical once inter-tag whitespace is normalized).

IMPORTANT -- this differs from MPOs/on-prem/index.html on purpose.
That dashboard defaults to the LAST entry in its MONTHS array, so
appending a month silently changes the landing tab. Here the default is
the explicit DEFAULT_MONTH_KEY constant, currently '2026-08', per
Gavin, 2026-08-31: "keep august 2026 the landing page for now."
Appending a month does NOT change what loads first -- change
DEFAULT_MONTH_KEY when you want September (or October) to be the
landing tab.

Switching tabs keeps the selected rep (a rep wants their own next
month's card, not the program grid) and clears any open program detail,
since program keys differ between months.

SEPTEMBER 2026 (structure only, from the September Rewards Deck)
================================================================
Built 2026-08-31 as STRUCTURE ONLY -- no September RDE export existed
yet. Every September-only program reads from PROGRAM_DATA_2026_09, an
empty object at the top of the September registry. getRep therefore
returns undefined, rankProgram yields no rows, and each program renders
its rules with a "Awaiting the first September export" card
(cardAwaitingData). That zero state is intended, not a bug.

WHEN SEPTEMBER DATA ARRIVES: build the September datasets into
PROGRAM_DATA_2026_09 (a generate_2026-09.py, or extra builders in
generate.py that emit a second JSON blob), then add real card functions
to PROGRAM_CARD_FN and board specs to PROGRAM_BOARD keyed by the
September program keys. cardFor() already falls back to the zero-state
card for any key without a real card fn, so programs can be switched on
one at a time without touching the renderers.

keystone_ice was the FIRST to switch on (2026-08-31) and is the worked
example for the rest. What it took, end to end:
  generate.py   build_keystone_ice() reads the Keystone dashboard's own
                published JSON (keystone-ice/data/keystone_ice.json),
                exactly the arrangement build_display_auction() uses --
                that dashboard owns the scoring and this reads finished
                numbers. main() assembles a SECOND dict, data_09, and
                writes it into its own marker pair.
  index.html    /* PROGRAM_DATA_09_START */ ... _END markers around the
                PROGRAM_DATA_2026_09 declaration (it used to be a bare
                `= {}`), a cardKeystoneIce() reading PROGRAM_DATA_2026_09
                rather than PROGRAM_DATA, an entry in PROGRAM_CARD_FN,
                and a board spec in PROGRAM_BOARD.
  registry      its metric changed from the placeholder d.placements to
                d.pct, so the leaderboard ranks on percentage of each
                rep's OWN account base. That is the measure the $300/$150
                top-performer award is decided on, and it keeps a
                6-account book competing with a 43-account one. Check the
                placeholder metric against the real payout rule when
                switching on any other September program -- the
                structure-only metrics were guesses.

THREE MORE SWITCHED ON 2026-09-02: touchdowns_tea, evil_genius, montauk.
Their exports live in data/ as touchdowns_tea_off.csv + touchdowns_tea_on.csv,
evil_genius.csv and montauk.csv. All four use the base/current two-column
period shape the MPO trackers use, but they name the premise column "On-Off
Premise" where every earlier file on this page says "Premise" -- normalised by
_premise() rather than special-cased per builder.

All three placeholder metrics in the registry were wrong and were repointed
(exactly what the paragraph above warns about): evil_genius and montauk read
d.newPlacements, which no builder emits -- the field is totalNewPlacements --
and touchdowns_tea read d.cases, which does not exist at all. Left alone the
leaderboards would have ranked every rep as undefined.

THIS IS NOW CHECKED AUTOMATICALLY -- check_registry_metrics() in generate.py,
added 2026-09-04 after the exact same bug shipped a second time (other_half
kept d.accountsOpened and two_xo kept d.pods after their builders landed
emitting different names; Gavin reported it as "i see no data for other half
and 2xo"). It is a nasty failure mode precisely because it looks like
nothing: rankProgram() drops any rep whose metric returns undefined, so there
is NO console error, the rep cards render perfectly, and only the program's
leaderboard is silently empty. A browser sweep that only watches for JS
errors will not catch it -- ask for the leaderboard view specifically. The
check runs on every build, prints one line when clean, and names the program
and field when not. Custom-getRep entries (fall_seasonal composes its own
{po,pd}) are skipped rather than guessed at, and zero-state programs are
skipped because an empty leaderboard is correct for those.

  touchdowns_tea  Two exports, four payout legs, only two of them scoreable.
                  $15 per new off-premise 12pk placement and $1 per on-premise
                  case sold are in the data. The $1/case FLOOR display (25-case
                  minimum, football POS, not co-branded) and the $25 football
                  feature both depend on a photo and on POS conditions no
                  export carries, so they render as a descriptive block the way
                  Keystone's cooler-door photos do and are EXCLUDED from the
                  payout figure. Ranked on trackable payout rather than either
                  channel alone, since $15 and $1 legs are not comparable.
                  The off-premise export arrives PRE-FILTERED to 12-packs
                  (every row is a 2/12/12oz pack), so no product filter is
                  applied. If a future export widens, add one or placements
                  will be over-counted.

  evil_genius     Hard 3-placement qualifier gates ALL payout, so payout is
                  computed as zero until totalNewPlacements >= 3 -- the volume
                  bonus included, per the deck's "minimum for any payout".
                  Off-premise placements are account-level (the 1911 rule)
                  because they pay one flat $10. Draft leg is Stacy's Mom only.
                  The bonus SCORES as of 2026-09-02 (see resolved question 4):
                  $1 per CE over the rep's own September 2025, floored at zero.

  montauk         The one program here that does NOT use the account-level
                  rule. Its pack sizes pay different amounts ($10 a 6pk, $15 a
                  12pk or 19.2oz), so placements are classified per (rep,
                  customer, pack tier); an account taking 6pks and 12pks is two
                  placements on the deck's wording. The account-level count is
                  emitted alongside as newAccounts, and the card shows both --
                  see open question 3.

A FOURTH SWITCHED ON 2026-09-04: two_xo. data/two_xo.csv, build_two_xo() in
generate.py, cardTwoXo() in index.html.

  two_xo          NEITHER the account-level rule NOR montauk's per-tier one --
                  a THIRD classification shape, and the ONLY program on this
                  page that classifies off-premise and on-premise
                  differently within itself. Off-premise pays for a
                  SPECIFIC PAIR (1 case American Oak + 1 case French Oak =
                  $40, neither alone), so classification runs per (rep,
                  customer, product) and the two SKUs' new/reorder status is
                  combined afterward: both newly placed together -> $40
                  (+$35 if White Oak Rye rides along, never seen in an
                  export yet so currently always $0). Only one oak newly
                  placed -> shown as a single-oak open on the card, not
                  paid, since the deck prices no single-SKU rate.
                  On-premise, resolved 2026-09-04 (open question 6), IS the
                  account-level rule: any 2+ units of ANY 2XO product at a
                  new account pays $25 flat. Base window here is 6/1-7/31
                  (60 days, not the 90-day window every other program
                  uses), matching the deck's "60-day non-buy, August counts
                  retroactively."

A FIFTH SWITCHED ON 2026-09-04: other_half. data/other_half_on.csv,
data/other_half_off.csv, build_other_half() in generate.py, cardOtherHalf()
in index.html.

  other_half      The only program with NO base period at all -- Other Half
                  is brand new to Kohler (open question 7), so every
                  account in the export is non-buy by definition and there
                  is nothing to classify_by_customer() against. Off-premise
                  pays per DISTINCT SKU COUNT ($40 at 3+ SKUs, +$10/extra),
                  with a territory-dependent flat-rate override: an account
                  matched against territory-accounts/southern_district_off_prem.csv
                  gets $50 flat instead of the SKU formula -- a reading of
                  the deck's stand-alone Southern District bullet, flagged
                  as unconfirmed on the card. On-premise renders September
                  activity (accounts active, volume vs. the 1/3 bbl floor)
                  but pays nothing: the $150 needs the same account to buy
                  in BOTH September and October, which can't be evaluated
                  until an October export exists.

DRAFT MINIMUMS ARE A DIFFERENT KIND OF THRESHOLD from 1911/Woodchuck's.
Those pay "after 2 barrels", a cumulative volume gate (bbl_threshold=2.0/3.0).
Evil Genius and Montauk instead say "1 1/2 bbl or 2 1/6 bbls minimum", which
describes the minimum KEG ORDER, so DRAFT_MIN_BBL is 1/3 (two sixtels, the
smaller of the two acceptable orders) and is checked against the account's
September keg volume, not a season total. Don't unify these two rules.

FIRST-DAYS CAVEAT: the 2026-09-02 exports cover 9/1-9/4 only, so every number
on these three is a handful of placements. That is the data, not a bug --
touchdowns_tea 2 placements + 265 on-prem cases, evil_genius 1 placement (0
reps past the qualifier), montauk 5 placements. Expect these to look empty for
most reps until mid-month.

2026-09-04 REFRESH, BATCH 3 -- Montauk, 2XO, Other Half (both legs)
All four exports grew or held with NO row removed (+8 Montauk, +30 Other Half
off, +3 Other Half draft, 2XO unchanged).
  other_half   THE ONE THAT MOVED: off-premise accounts opened 68 -> 76 and
               tracked earnings $3,410 -> $3,810. Seven reps gained accounts --
               John O'Donoghue +2 (6->8, $280->$400), Alisa Acciardi, Andrew
               Lundy, Dan Lagala, Dave Ehlers and Jim Heaney +1 each, and Phil
               Ernst opened his first (0->1, $40). On the draft leg, September
               active accounts 15 -> 18 with 10 now at the 1/3 bbl floor
               (Michael Harboy 0->1, Paul Mclaughlin 1->2). That leg is STILL
               unpaid and still needs October to confirm the two-month hold --
               the count moving is not the same as it paying.
  montauk      8 new placements and $95, both UNCHANGED, and that is the
               export: all 8 added rows are reorders at accounts already
               placed. Case volume moved for six reps (Shane Barreca 13->20,
               Dylan Rubino 9->12, John O'Donoghue 6->8, Andrew Lundy 4->6,
               Phil Ernst 12->13) and Klejdi Lamo logged his first Montauk
               activity (0->1 reorder). Same rule as the batch-1 programs: on
               a new-vs-repeat program, volume moves before placements do.
  two_xo       NO CHANGE. This pull is the same 70 rows as the last, only
               re-sorted. Still 0 new off-premise pairs, 1 unpaid single-oak
               open, 0 on-premise 2+-unit PODs. Unlike evil_genius in batch 2,
               its block in index.html did not even churn -- build_two_xo()
               sorts deterministically, so a re-sorted source produces a
               byte-identical blob.

A FUTURE-DATED ROW arrived on the Other Half draft export: Paul Mclaughlin /
50008 101 Pub (A), dated 9/7/2026 against a 9/4 pull. It is a scheduled load,
not an error, and other_half_off.csv has carried 9/7 rows since the previous
pull, so this is normal for this export rather than new. It does count toward
his September activity. Same class of thing as the Carbliss 9/10 load sheet
noted in MPOs/on-prem/README.txt -- worth a glance only if a future-dated row
ever lands on an account that would otherwise not qualify.

2026-09-04 REFRESH, BATCH 2 -- Garage Beer, Le Grand Noir, Touchdowns & Tea,
Evil Genius. Headlines:
  garage_beer_president  house CE 7,002.36 -> 7,028.36 of 9,305. Four reps
                         revised, three up (Jayson Romine +6, John O'Donoghue
                         +20, Phil Ernst +1) and Michael Harboy -1. No rows
                         added or removed -- this export restates values
                         rather than appending, so a same-row-count pull is
                         normal here and is not a stale file.
  le_grand_noir          house cases 32 -> 30 of the 70 gate. IT WENT DOWN,
                         legitimately: the single added row is a -2 case
                         RETURN by Derrick Laws at Shop Rite Wines/Spirits on
                         9/4, which exactly reverses his earlier +2, taking
                         him from 2 cases to 0. Everyone else is unchanged.
                         This is the one program here whose numbers can fall
                         on a clean refresh, because it scores raw Cases with
                         no new-vs-repeat gate, and RDE books returns as
                         negative case rows. Do not "fix" a drop like this;
                         check for a negative Cases row first.
  touchdowns_tea         3 -> 4 new off-prem 12pk placements and 373 -> 414
                         on-prem cases, trackable payout $418 -> $474. Jim
                         Heaney takes the new placement (his first, $15).
                         On-prem cases up for Allison Scott (97->107), Anthony
                         Palmisano (51->60), Paul Mclaughlin (62->84); off-prem
                         cases up for eight reps. Derrick Laws' off-prem cases
                         fell 23 -> 18 on a restated row (same key, Cases
                         10.00 -> 5.00, Placement Count untouched, so nothing
                         reclassified).
  evil_genius            NO CHANGE, and the export is why: this pull is the
                         SAME 320 rows as the last one, merely re-sorted
                         (verified set-identical). Still 2 placements and 0 of
                         27 reps past the 3-placement qualifier. The rebuild
                         does rewrite evil_genius' byRep in index.html, but
                         only the ORDER of its lists -- every scored value is
                         identical. A diff on that program alone is churn, not
                         a data change.

CONSTELLATION FALL DISTRIBUTION IS LIVE (2026-09-08)
constellation_fall was a zero-state placeholder; it now has data, off-premise
only. This is the Sept-Nov period -- each month has its own retention program,
and build_constellation_retention (Jun-Aug) is untouched on the August tab.

  first run  Corona Gaintain 671/1,620 · Modelo Gaintain 1,305/2,405 ·
             Impact 1,484/3,136 · Innovation 253/1,419
             0 of 22 reps holding every category, day 8 of 91

THREE THINGS WERE SETTLED WITH GAVIN ON 2026-09-08, and all three differ from
what you would guess from the summer program:

  1. THE GOAL IS THE BASE COLUMN AT 100%, not 90%. Every other retention
     program here (MABI, Yuengling, and Constellation's own summer window)
     scores at the deck's "Retain 90% Distribution Goals". This one is 100%
     of the rep's own prior placements -- confirmed explicitly. Do NOT "fix"
     it to match the others.
  2. THE HOUSE GOAL IS THE SUM OF THE REP GOALS, not the April deck's fixed
     numbers. They disagree, and on Impact it matters: the deck says 3,433
     while the reps' own fall-2025 placements add to 3,136, so the deck figure
     could not be reached even with every rep at 100%. Innovation runs the
     other way (1,419 vs 1,336). Summing the rep goals keeps the house bar and
     the rep bars measuring the same thing.
  3. BASE WINDOWS DIFFER BY CATEGORY. Corona Gaintain, Modelo Gaintain and
     Impact measure against fall 2025 (9/1-11/30/2025). Innovation measures
     against SPRING 2026 (3/1-5/31/2026) because it did not exist a year ago.
     Each category carries its own baseWindow and the card prints it on the
     row ("Goal: 105 (your 3/1/2026 - 5/31/2026)"), so nobody has to remember
     which is which.

CONSTELLATION FALL -- ON-PREMISE PACKAGES AND DRAFT (built 2026-09-09). The
card now has three sections -- off-premise categories, on-premise packages,
on-premise draft -- and the leaderboard ranks on overallPct across all of
them. Gavin's rules, settled the same day:

  1. THE GOAL IS 100% OF THE SPRING BUYERS. "Buyer Count 3/1/2026 -
     5/31/2026" is the goal; "Buyer Count 9/1/2026 - 11/30/2026" is current
     distribution. Same base-column-is-the-goal convention as off-premise,
     but the base window is spring 2026, not fall 2025.
  2. THE GOAL IS FROZEN from the first pull's brand-family exports
     (data/constellation_fall_packages_on_goals.csv and
     data/constellation_fall_draft_on_goals.csv). Gavin is removing the
     March-May columns from the RDE report, so the ongoing detail uploads
     will carry only the 9/1-11/30 columns; _build_constellation_fall_
     on_prem() reads goals ONLY from the _goals files and current ONLY from
     the detail files. While a detail file still carries the spring columns
     they are used for one thing: a drift warning in the build log when its
     distinct spring buyers disagree with the frozen goal (0 rows on 9/9).
     Do not "refresh" the _goals files from a later pull -- an account
     reassigned between reps would silently move a goal.
  3. EACH BRAND FAMILY IS ITS OWN GOAL, separately for on-premise packages
     and on-premise draft, exactly as each off-premise category is. A rep
     holding Corona Extra but short on Modelo Especial has one goal held and
     one building. Families a rep buys this period without a spring goal are
     listed as new distribution and never scored.
  4. DRAFT COUNTS A BUYER ONLY ON A REAL KEG: a customer is a draft buyer of
     a family when any of its rows has the 9/1-11/30 Buyer Count populated
     AND its net 9/1-11/30 Units across the family are > 0. "The units are
     there to show if there is an actual unit in the account and it wasn't
     an empty that was picked up." 57 empty pickups excluded on 9/9.
     Packages has no Units column; a populated Buyer Count is a buyer.
  5. ONE CARD, off and on kept separate inside it: house blocks (off-prem
     categories, on-prem packages by family, on-prem draft by family), a
     stat board (goals held across all three, overall %, off-prem %, on-prem
     %), then an earn block per section with its family rows and an accounts
     accordion. The summary/hero counts placements + buyers held against
     every goal the rep has; goals held sit on the stat board.

  data/constellation_fall_packages_on_goals.csv   Brand-family goals, FROZEN
  data/constellation_fall_draft_on_goals.csv      (rep, brand family, the two
                                                  Buyer Count columns; draft
                                                  also two Units columns).
  data/constellation_fall_packages_on.csv         Customer + product detail:
  data/constellation_fall_draft_on.csv            THE ONGOING UPLOADS. Save
                                                  the new RDE exports over
                                                  these two and run
                                                  generate.py. The spring
                                                  columns may be absent.

TO REFRESH ON-PREMISE: save the two detail exports over the two detail
files, run python3 generate.py, and read its three constellation_fall
lines -- "goal drift" should stay 0 while the spring columns exist and the
line should say "goals frozen" once they are gone; "empty-keg pickups
excluded" is expected to be non-zero on draft.

FIRST RUN (2026-09-09, day 9 of 91): on-premise packages 747 of 2,107
buyers across 8 brand families (0 families at goal house-wide; 3 of 20 reps
holding every family, all on one-buyer goals); on-premise draft 98 of 381
across 5 families (0 at goal; 0 of 12 reps holding every family). 0 of 24
reps holding every goal across off + on. Off roster on both files: Chris
Politano (MetLife, current buyers and no goal), Office Tell Sell.

THE EXPORTS CHANGED SHAPE from the summer files. Those carry an explicit
"( ... ) Goals" column with the goal on the rep-total row; these carry TWO
windowed placement columns and no goal column at all, so the summer builder
cannot read them -- hence build_constellation_fall(). Both generations share
the flattened-subtotal layout (first row of a rep block is that rep's total,
mislabelled with a product name), which _split_report_subtotals() already
handles. The fall builder RE-RECONCILES every rep's total against its own
product rows on BOTH columns and raises rather than publishing if they
disagree -- verified 24/25/22/19 reps across the four files.

MID-WINDOW PRESENTATION MATCHES THE MABI FALL CARD. The hero is the raw
percentage of the placement goal (Dave Ehlers 61%, Matt Powierski 39%), and
only the status chip is period-aware through the first quarter of the window.
The hero counts PLACEMENTS, not categories-fully-held: "0 of 4 categories" is
true of nearly every rep on day 8 and says nothing about ground covered --
Dave would have read 0% instead of 61%. Categories held stay on the stat
board, where they are the right summary at the END of the period.

Off-premise only, same as the summer program -- the on-premise package and
draft goals are a separate export that has not arrived.

MABI FALL RETENTION IS LIVE (2026-09-08)
mabi_retention_fall was a zero-state placeholder; it now has data. The Sept-Nov
period is a NEW program with NEW goals -- the summer mabi_retention (Jun-Aug)
is a different window and is untouched on the August tab.

  goal      Kohler's "90% of Placement Count GOAL" column, over the 6/1-8/31
            BASE window, held against 9/1-11/30 actuals (per Gavin,
            2026-09-08). Verified as round-half-up(0.9 x base) on all 949
            rows, so nothing is recomputed here -- the workbook's number is
            the bar, and a reissue that changes the percentage fails the check
            in convert_mabi_fall.py rather than silently moving everyone's bar.
  first run house 2,178 of 7,326 (29.7%), 0 of 24 reps at their goal, day 8 of
            91. Off-roster and not shown: Default, John Neukum.

BOTH SOURCE FILES ARE GROUPED TREES AND MUST BE CONVERTED FIRST. The actuals
CSV looks flat -- rep / brand / product in three real columns -- but the first
row of a rep block is that rep's TOTAL and the first row of each brand block is
that brand's SUBTOTAL, with nothing marking either. Read at face value it sums
to 6,543 against a true 2,181: EXACTLY 3x, because every product is counted
again at brand level and again at rep level. The goals workbook is the same
shape in a single column. So:

    python3 convert_mabi_fall.py <actuals.csv> <goals.xlsx>   # then generate.py

convert_mabi_fall.py writes data/mabi_retention_fall.csv (clean product rows)
and data/mabi_retention_fall_goals.csv (clean per-rep goals), reconciling every
brand subtotal against its products, every rep total against its brands, and
the goals base column against the workbook's own Total row. It REFUSES TO WRITE
on a mismatch, the same defence convert_mc_retention.py uses. The raw goals
workbook is kept alongside as data/mabi_retention_fall_goals.xlsx for
provenance; generate.py does not read it.

ONLY THE BASE COLUMN RECONCILES, AND THAT IS EXPECTED. Each level of the goals
tree rounds its own 90% independently, so brand goals do not sum to the rep
goal and the rep goals sum to 7,329 against a Total row of 7,326. That is
rounding, not an error -- which is why the REP-LEVEL goal row is what scores a
rep, and why only the base column is reconciled against the Total.

THE THREE TERRITORY-INELIGIBLE REPS NEED NO GATING HERE. Alex Rodriguez,
Andrew Lundy and Hakan Sadik are greyed out of the summer MABI by the Core
Market blackout, and Kohler's fall workbook simply gives them no goal at all --
the restriction is already settled at source. Their card says so plainly rather
than showing an empty goal. This is why mabi_retention_fall can stay in
CORE_MARKET_PROGRAMS_PENDING: the eligibility loop still cannot reach data_09,
but for this program there is nothing left for it to do. keystone_ice and
touchdowns_tea remain genuinely ungated.

REPS WITH A GOAL AND NO PLACEMENTS YET ARE KEPT AT ZERO (Dylan Rubino, John
O'Donoghue as of the first run). "You are holding none of your 14" is what a
retention program needs to say; dropping them would quietly shorten the board.

THE STATUS CHIP, NOT THE NUMBER, IS PACE-AWARE. Every figure a rep reads is the
raw percentage of goal -- Dave Ehlers reads 44%, Alisa Acciardi reads 5%.
But the five-word status ladder has no "too early to tell", and on day 8 of 91
a raw 44% would print "Needs Attention" for a goal not due until Nov 30. So
through the FIRST QUARTER of the window the summary sets statusOverride: a rep
with any placements reads "On Track", a rep with none reads "Not Started", and
a rep already at goal reads "Earned"; after 25% of the window the normal bands
resume on the raw percentage. summarize() gained a general statusOverride hook
for this (it previously had only pctOverride, which would have rewritten the
displayed number too -- the wrong fix, and it did briefly show Alisa 57%).
If Gavin would rather see the raw bands from day one, delete the override in
PROGRAM_SUMMARY.mabi_retention_fall and nothing else changes.

2026-09-08 THIRD REFRESH -- Montauk, 2XO, Other Half (off and on)
The day's last four exports. Headlines:

  Montauk       8 -> 9 new placements, $95 -> $195
  Other Half    76 -> 85 off-prem accounts opened, $3,810 -> $4,340;
                on-prem 18 -> 24 active (10 -> 13 at the 1/3 bbl floor)
  2XO           still 0 new off-premise pairs and $0; on-premise units
                2.0 -> 5.0, still 0 new 2+-unit PODs

NOT ONE METRIC WENT DOWN, the first refresh today that can say so. Montauk 26
scalars, Other Half 30, 2XO 1 -- every one of them upward, and ten Other Half
reps gained payout with none losing any.

MONTAUK'S WHOLE $100 IS ONE DRAFT ACCOUNT. Paul Mclaughlin opened Grant
Street Cafe (A) at 0.5 bbl on 9/9 -- the program's FIRST qualifying draft
placement (the draft leg had been 0 all month), and draft pays $100 against
the package legs' smaller rates, which is why 8 -> 9 placements moves $95 ->
$195. Nobody else's Montauk payout changed.

THE "REMOVED" ROWS THIS TIME WERE ALL DATE REVISIONS, unlike the three
refreshes before it. Other Half off lost 5 rows and on lost 1 to a
whole-line diff, but every one of them reappears in the new file with the
same rep, account, product and values and only the date moved 9/7 -> 9/8:
Chris Payton's five SKUs at 38008 Shop Rite Liq.(A)Lodi, and Paul
Mclaughlin's Forever Ever keg at 50008 101 Pub (A). Nothing was actually
withdrawn. This is the fourth distinct shape a "removed" row has taken this
week -- genuine drop, reorder drop, value revision, and now date revision --
so the rule stands: look up the key in the new file before calling anything
lost.

2026-09-08 SECOND REFRESH -- five more exports, same day
Le Grand Noir, Garage Beer President's comparison, Touchdowns & Tea (off and
on) and Evil Genius, on top of the five earlier the same day. Headlines:

  Garage Beer   7028.36 -> 7432.69 house CE (goal 9305)
  Touchdowns    45 -> 46 off-prem 12pk placements, on-prem cases 414 -> 545,
                trackable $1,089 -> $1,235
  Evil Genius   still 2 new placements and 0 of 27 past the 3-placement
                qualifier; CE 20 -> 33, reps ahead 4 -> 5, bonus CE 6 -> 7,
                still $0 because the qualifier gates it
  Le Grand Noir no change at all (export was set-identical)

LE GRAND NOIR DID NOT MOVE, and like Lytt earlier today that is the export.
The file is set-identical to the previous pull -- 30 rows, nothing added,
nothing removed, merely re-sorted -- so it shows as modified in git while not
one scalar moved. House stays 30.0 of 70 cases.

RDE REMOVED ROWS FOR THE THIRD EXPORT SET RUNNING, and this time it cost a
rep money. Touchdowns off-prem lost three rows against 70 added, and the three
are NOT the same kind of thing -- worth separating, because only one of them
changes a payout:

  1. Dave Ehlers / 56007 Portland Wine & Liquor / 8373 Twisted Tea Light
     Party Pack / 9/4 -- GENUINELY GONE, and it was the only row for that
     customer+product, so it had no base-period row and counted as a NEW
     PLACEMENT. Dave goes 17 -> 16 placements and $255 -> $240.
  2. Dave Ehlers / same account / 8333 Twisted Tea / 9/4 -- also gone, but
     that key HAS base-period rows (6/29, 7/20, 8/10), so it was a reorder.
     Costs 13 cases, no placement, no payout.
  3. Matt Powierski / 77007 Wine Land / 200668 Sun Cruiser Lemonade / 9/4 --
     NOT removed at all. Same key and date, Cases revised 2.00 -> 1.00, so it
     only looks dropped to a whole-line diff. A partial return.
Check which of the three shapes a "removed" row is before reporting it: only
the first kind moves a placement count.

JAYSON ROMINE'S TARGET COUNT FELL 6 -> 5 AND THAT IS GOOD NEWS, not a loss.
Liquor Factory I Landing left his offPremTargets list and appeared in
offPremNew dated 9/8 -- he converted a target account. A falling target count
on this program is the intended direction; read it alongside offPremNew before
treating it as a regression.

Everything else moved upward: Garage Beer 16 scalars, Evil Genius 12, all up,
none down. The only metrics that fell anywhere in this refresh are Dave
Ehlers' three (placements, payout, placementPayout) and Jayson's target count.

2026-09-09 NEW PROGRAM -- SAM ADAMS SUMMER ALE -> OCTOBERFEST DRAFT CONVERSION
(Boston Beer, on premise, Jul 20 - Sep 30). Key sam_adams_conversion, in the
September registry's "new" group, PROGRAM_DATA_2026_09, supplier boston_beer.
Gavin asked for it 2026-09-09: "the program is swapping summer ale kegs for
octoberfest kegs." Windows per Gavin the same day: BASE 4/1-7/17 (who poured
Summer Ale), DISTRIBUTION 7/20-9/30 (who has taken Octoberfest since).

BOSTON BEER'S WORKBOOKS ARE THE SOURCE OF TRUTH (Gavin, 2026-09-09, after the
first cut scored from Encompass: "this should be the main source for this
program"). Every scored number on a rep's card -- prior-season lines,
converted, not converted, gained, current season vs last year, Converted % --
is the rep's row on Boston Beer's scoreboard, and the "still to convert" list
is Boston Beer's unconverted-account list, assigned by Route. The leaderboard
ranks on their Converted %. The Encompass keg export is the DAILY SUPPLEMENT
and never changes a scored number.

  data/sam_adams_conversion_boston_beer.xlsx      Boston Beer's per-rep
  data/sam_adams_unconverted_boston_beer.xlsx     scoreboard and unconverted
                                       list, archived as received (the
                                       filename's leading MMDDYY is the as-of
                                       date). generate.py never reads them.
  data/sam_adams_conversion_official.csv
  data/sam_adams_unconverted_official.csv
                                       The two workbooks flattened by
                                       convert_sam_adams_official.py, as-of
                                       date on every row. THESE SCORE THE
                                       PROGRAM. The unconverted list has no
                                       rep column, only a Route; the converter
                                       maps each route to the rep who owns it
                                       on the scoreboard (4 Allison Scott, 5
                                       Mike Ast, 7 Paul Mclaughlin, 11 Brian
                                       Sengebush, 12 Klejdi Lamo, 13 Jayson
                                       Romine, 18 Matt Powierski, 19 Robin
                                       Feldman, 20 Dan Lagala, 23 Chris Payton,
                                       25 Jim Heaney, 26 Anthony Palmisano, 27
                                       Nick Melissari, 90 unassigned) and
                                       reconciles the per-route count against
                                       that rep's Not Converted -- refusing to
                                       write on a mismatch, which is the
                                       signature of two workbooks from
                                       different pulls. build_sam_adams_
                                       conversion() re-checks the same thing.
  data/sam_adams_keg_conversion.csv    RDE "Sam Adams Kegs: Summer Ale to
                                       Octoberfest" -- one row per rep /
                                       account / keg SKU / load-sheet date
                                       with Buyer Count and Units over the
                                       whole 4/1-9/30 span. THE DAILY UPLOAD.
                                       Keep its window covering 4/1 through at
                                       least 9/30. Scored on the program
                                       windows (membership on NET units, so a
                                       keg bought and returned is nothing) it
                                       shows, per rep: the accounts that took
                                       their FIRST Octoberfest keg after the
                                       workbook's as-of date -- conversions
                                       Boston Beer has not counted yet --
                                       Octoberfest kegs loaded since, and the
                                       full Encompass account lists.
  (not kept)                           RDE "Draft Lines Conversion" -- the
                                       same thing as the keg export with the
                                       dates and units stripped off. The keg
                                       export matches it account for account
                                       on the windows above (0 mismatches,
                                       2026-09-09), so it adds nothing.
  convert_sam_adams_official.py        Run it on BOTH workbooks from one pull:
                                         python3 convert_sam_adams_official.py <conversion.xlsx> <unconverted.xlsx>
                                       then python3 generate.py. Reconciles
                                       the scoreboard's Total row against the
                                       rep rows and the unconverted list
                                       against the scoreboard by route. Boston
                                       Beer leaves "Prev Season Dist" and
                                       "Current Season Dist" BLANK on some
                                       rows (Brian Sengebush, James Heaney on
                                       9/8) even though the Total counts them;
                                       a blank is derived as converted + not
                                       converted / converted + gained, not
                                       read as zero. Maps their spellings
                                       (Paul McLaughlin, Clay Lamo, Dan
                                       LaGala, James Heaney) onto the roster's.

TO REFRESH: workbooks every couple of weeks -> converter -> generate.py; keg
export daily -> save over data/sam_adams_keg_conversion.csv -> generate.py.
A keg-export refresh alone moves only the Encompass tiles and lists (the
"first Octoberfest kegs since <as-of>" list is the one reps should watch
between workbooks); the scored numbers move only when a new workbook lands.

WHY THE TWO SOURCES DIFFER, so nobody "fixes" it: Boston Beer counts by
ROUTE and excludes accounts Encompass keeps (package accounts that took a
keg -- Total Wine, Bottle King, liquor stores; Jayson Romine reads 12 prior
lines in Encompass vs 1 on his route), and the two are pulled on different
days. On 2026-09-09: Boston Beer 219 of 307 (71.3%, as of 9/8) vs Encompass
241 of 335 (71.9%, loads through 9/10). Same percentage, different scope.
Reps with no row on the scoreboard (Dave Ehlers, Phil Ernst, Shane Barreca,
Javier Melo, Derrick Laws, and the rest) have no score and are off the
leaderboard; their card says so and shows their Encompass keg activity.

FIRST RUN (scoreboard as of 9/8, day 52 of 73): house 219 of 307 Summer Ale
lines converted (71.3%), 88 not converted, 30 gained. Nick Melissari 63 of
79 (80%), Allison Scott 43 of 54 (80%), Brian Sengebush 39 of 54, Paul
Mclaughlin 28 of 46, Anthony Palmisano 17 of 25, Robin Feldman 16 of 28;
Jayson Romine and Matt Powierski 1 of 1. Encompass through 9/10 shows first
Octoberfest kegs after 9/8 at accounts Boston Beer has not counted yet.
Scoreboard row off roster: Route 90 (unassigned). Encompass reps off roster:
Chris Politano (MetLife), Default, Office Tell Sell.

NO PAYOUT RATES ARE ON FILE. The program sheet has not been shared; the card
tracks Converted % and lists the accounts, and says so in its rules.
meta.rates is None -- add the rates there and to the card's rate badge when
they arrive.

2026-09-09 SEVENTH REFRESH -- MABI Fall retention
Actuals converted through convert_mabi_fall.py against the goals workbook
already on file (data/mabi_retention_fall_goals.xlsx, Kohler's 9/8 issue --
no new goals were needed or supplied, and the base/goal reconciliation
passed unchanged: house base 8,140, goal 7,326). Every brand subtotal and
rep total reconciled; actuals house 2,415 on the export, 2,412 scored after
the off-roster rows.

  house      2,178 -> 2,412 of 7,326 MADE placements (29.7% -> 32.9%)
             still 0 of 24 reps at their 90% goal, day 9 of 91
             no 9/1-11/30 activity yet: Dylan Rubino, John O'Donoghue

Biggest moves: Anthony Palmisano 35.2% -> 41.1%, Derrick Laws 24.6% ->
29.8%, Javier Melo 26.3% -> 31.7%. Dave Ehlers still leads at 46.1%.

BRIAN SENGEBUSH IS THE ONE REP WHO WENT DOWN, 55 -> 53 placements and 21 ->
19 SKUs held (44.7% -> 43.1%): Cayman Jack Margarita Variety 2/12/12 oz Can 1 -> 0; Cayman Jack Sweet Heat Margarita Variety 2/12/12 oz Can 1 -> 0. Those rows are gone from RDE's
export rather than re-dated -- this file carries no dates to re-stamp -- so
it reads as a voided or returned order on RDE's side, the same shape as the
1911/Woodchuck drop for Dave Ehlers earlier today. Nobody else fell.

2026-09-09 SIXTH REFRESH -- Molson Coors retention (on + off prem)
Both grouped workbooks converted through convert_mc_retention.py; every
rep, DM and report total reconciled, 0 new and 0 gone rep/brand pairs, so
the structure is unchanged and only values moved.

  brand goals retained   26 -> 27 of 100 (Anthony Palmisano 2 -> 3: off-prem
                         Coors 85 -> 87 of 87, his off-prem 96.8% -> 99.4%)
  off-prem placements    2,499 -> 2,545 of 2,912
  on-prem buyers         695 -> 708 of 840

53 metrics moved and NOTHING went down this time (the 9/8 refresh had the
one Peroni placement lost). Robin Feldman's off-prem doubled 22.2% -> 44.4%
on a tiny base; Javier Melo 65.8% -> 69.7% and Klejdi Lamo 88.7% -> 91.4%
were the larger real moves. Dave Ehlers (109.4%), Allison Scott (103.7% on
draft) and Brian Sengebush (116.5% on draft) are past their goals.

2026-09-09 FIFTH REFRESH -- Constellation Fall, all four categories
Impact, Modelo Gaintain and Innovation from today's exports; Corona Gaintain
was NOT in this batch, but the same RDE export ("Constellation Corona
Gaintain FALL 2026 OFF w/ Goals") had already been re-pulled this morning
for MPOs/off-prem/constellation_corona_gaintain.csv, one pull newer than the
copy here, so that file was copied across rather than leaving one leg a day
behind the other three. Same header, same 122 rows, values only. Treat those
two files like the Keystone pair: when one moves, move the other.

  house        3,713 -> 4,002 of 8,580 placements
               Corona Gaintain 671 -> 719 · Modelo Gaintain 1305 -> 1398 ·
               Impact 1484 -> 1605 · Innovation 253 -> 280
               still 0 of 22 reps holding every category, day 9 of 91

Every rep's offPct rose; the largest moves were Jim Heaney 35.5 -> 41.2,
Dan Lagala 37.7 -> 43.5 and Javier Melo 55.2 -> 60.4, and Robin Feldman
opened at 20.0 from 0. Dave Ehlers still leads at 64.2. All four exports
kept their row counts and restated values only, which is how these
windowed-placement files behave -- a same-row-count pull is not a stale
file. The reconciliation check (rep total vs its own product rows, both
columns) passed on all four.

2026-09-09 FOURTH REFRESH -- Montauk, 2XO, Other Half (both legs); 2XO no-op.
Exports run through 9/10 (one Montauk row and one Other Half draft row dated
9/11). Every rep grew or held. Headlines:

  other_half   off-premise accounts opened 85 -> 94, tracked earnings
               $4,340 -> $4,810. Six reps gained: Anthony Palmisano +2
               (1->3, $60->$180: Highland Wine & Liquor and USA Wine Traders
               Wanaque, 9/10), Klejdi Lamo +2 (5->7), Michael Harboy +2
               (8->10, $490 -- new leader), Dan Lagala +1, John O'Donoghue +1
               (8->9, $460), Mike Ast +1. Draft leg: September active
               accounts 28, at the 1/3 bbl floor 13 -> 16 (Jaime Colonna
               1->3 on 8th Street Tavern and Hudson Hall, Alisa Acciardi 0->1
               on Fitzgerald 1928). Still unpaid pending October's hold.
  montauk      9 -> 10 new placements, $195 -> $205: Jim Heaney's second
               six-pack placement, Little Falls Liquor on 9/10. The other 24
               added rows are reorders; case volume up for 15 reps (Dan
               Lagala 2->9, Mike Ast 9->16, Shane Barreca 24->31).
  two_xo       NO CHANGE -- same 71 rows as the previous pull, re-sorted;
               byte-identical blob, as build_two_xo() sorts deterministically.

ROWS THAT LEFT, ALL BENIGN, and the same three shapes as every export
today: Montauk's three 9/9 rows (Village Wine Shop, Cedar Grove Liq, The
Wine Rack Summit) and Other Half off's eight (Providence Liquors x3, A&M
Liquor x5) came back dated 9/10; Other Half draft re-dated Paul Mclaughlin's
Andiamo keg 9/8 -> 9/11 and moved the Blackjack Mulligans (Hawthorne)
Broccoli keg from Nick Melissari to Allison Scott. Jim Heaney's Montauk
offPremTargetCount 37 -> 36 is his new placement leaving the prospect list.

2026-09-09 THIRD REFRESH -- Garage Beer, Touchdowns & Tea, Evil Genius (Le Grand
Noir no-op). Exports run through 9/10 (one Evil Genius row dated 9/11).
Headlines:

  garage_beer_president  house CE 7,432.69 -> 7,537.14 of 9,305. Every rep
                         restated (same 29 rows, values only, as this export
                         always does). TWO GROWTH FIGURES WENT DOWN: Derrick
                         Laws 10.67 -> 5.00 (this-year CE restated 34.00 ->
                         28.33, the shape of a return or credit) and Allison
                         Scott 44.75 -> 42.46 because her LAST-YEAR base rose
                         11.17 -> 13.46 while Nick Melissari's fell 28.54 ->
                         26.25 -- the Blackjack Mulligans (Hawthorne)
                         reassignment moved prior-year volume along with the
                         account. Nobody changed tier.
  touchdowns_tea         46 -> 54 new off-prem 12pk placements, 545 -> 664
                         on-prem cases, trackable payout $1,235 -> $1,474.
                         Anthony Palmisano 10 -> 14 placements ($229 -> $311),
                         Allison Scott on-prem 128 -> 174 cases. Dylan Rubino
                         opens with his first placement ($15); Dan Lagala his
                         first on-prem cases ($10). +55 off rows / +53 on
                         rows; the 8 that left are benign (below).
  evil_genius            2 -> 3 new placements and the FIRST QUALIFIER: Dave
                         Ehlers reaches 3 on Joes Beer Wine & Spirits (Stacy's
                         Mom, 9/9), $0 -> $30. CE 35 vs 98 last September.
                         Jaime Colonna's Cork Wines (Harrison) row is dated
                         9/11 -- future-dated, a scheduled load sheet -- and is
                         a reorder, so it moves only his caseVolume 1 -> 2.
  le_grand_noir          export set-identical (30 rows), 30 of 70 house
                         cases, untouched.

ROWS THAT LEFT, ALL BENIGN: Touchdowns off dropped Anthony Palmisano's
Uncorked Twisted Tea Light 9/8 row but carries it back RESTATED, 20 -> 16
cases (same key); Touchdowns on re-dated Robin Feldman's Davy's Dogs keg 9/9
-> 9/10, and its six Blackjack Mulligans (Hawthorne) rows plus Evil Genius's
four moved from Nick Melissari to Allison Scott -- the same reassignment
every export today has carried. Evil Genius's Blackjack rows are all base
period or zero-case, so they move no score. The only per-rep number that
went down outside Garage Beer is Dylan Rubino's Touchdowns offPremTargetCount
135 -> 134, which is his new placement leaving the prospect list.

YUENGLING FALL RETENTION IS LIVE (2026-09-10) -- off-premise + on-premise packages
yuengling_retention_fall was a zero-state placeholder; it now has data on two
of its three sides. Gavin's rules, 2026-09-10, in his words: "hit goals at
brand family level for each sheet. the goal is 95% of BUYER COUNT IN 2025 ...
this is only at brand family level for each, there is no overall goal."

  1. ONE GOAL PER (REP, BRAND FAMILY, SIDE). Off-premise families: Lager,
     Flight, Light Lager. On-premise packages: Lager, Flight. On-premise
     draft: Lager, Flight (added later on 2026-09-10 -- see 6 below).
  2. THE GOAL IS 95% OF THE REP'S OWN FALL-2025 BUYER COUNT FOR THAT
     FAMILY, ROUNDED UP. Gavin's first worked example said "23 for
     yuengling lager because he had 25 in 2025", which reads as round-down
     (0.95 x 25 = 23.75); asked, he corrected it the same day: "I meant
     round up" -- so Anthony's Lager goal is 24. That is
     _yuengling_fall_goal() (math.ceil); a base of 1 gives 1, so nobody
     holds a goal by doing nothing. The first build shipped round-down for
     about an hour; nothing else changed between the two.
  3. NO OVERALL GOAL, NO HOUSE GOAL, NO 90% LINE. The card and summary show
     goals held out of goals total; the hero is buyers counted toward every
     goal (capped per goal) vs the goals' sum, like constellation_fall, so a
     rep mid-window sees ground covered rather than "0 of 5". Status chip is
     period-aware for the first quarter of the window, same as the other
     fall programs; the displayed number is never inflated.
  4. THE EXPORTS ARE THE FLATTENED TREE: the first row of each rep block is
     the rep's total (a DISTINCT buyer count mislabelled with a brand name)
     -- visible in Gavin's screenshot of the report, where Anthony reads
     25/19 on his own line and 16/5, 25/19, 14/5 on Light Lager, Lager,
     Flight. _split_report_subtotals() peels it off; the builder then
     checks every rep total sits between its biggest brand row and the sum
     of them (both columns) and stops if not -- that is the shape-change
     signature. All 24 + 15 reps reconciled on the first run.
  6. ON-PREMISE DRAFT HAS TWO FILES (Gavin, 2026-09-10: "the rde sheet has
     buyers and units. that sheet is the source of truth for if a rep got a
     draft line at an account. 1 buyer and 1 unit means it is there").
       data/yuengling_retention_fall_draft_on.csv          brand-level summary,
                                                           same shape as the
                                                           other two: the 2025
                                                           Buyer Count is the
                                                           GOAL BASE (x 0.95,
                                                           rounded up).
       data/yuengling_retention_fall_draft_on_detail.csv   RDE account sheet:
                                                           rep / family /
                                                           account / load-sheet
                                                           date, Buyer Count +
                                                           Units in both
                                                           windows. CURRENT =
                                                           distinct accounts
                                                           with a 2026 buyer
                                                           flag AND net 2026
                                                           units > 0.
     A buyer row with 0 or negative units is an empty keg picked up, not a
     line -- the same rule Constellation Fall draft uses -- and 54 such
     accounts sat in the first pull (Allison Scott's Lager reads 31 on tap
     against the summary's 44 buyers). The summary's 2025 buyers matched
     the account sheet's distinct 2025 buyers on every rep+family (the
     build warns if they ever drift); its 2026 column is one off for Nick
     Melissari and Paul Mclaughlin, which is why the account sheet, not
     the summary, is the current count. Each draft brand row carries its
     accounts with a status -- on / new / empty / lost (poured it last fall,
     no keg yet) -- so the card and the hub list who is pouring and who to
     win back. Refresh: save both exports over both files, generate.py.
  5. A family with no 2025 buyers (Chris Politano's MetLife Lager, on-prem)
     has no goal and is never scored. Reps with no row on either file are
     not in the program. Off roster and dropped: Chris Politano, Default,
     John Neukum, Office Tell Sell.

  data/yuengling_retention_fall_off.csv           RDE "Yuengling Fall 2026:
  data/yuengling_retention_fall_packages_on.csv   Off Premise Retention" and
                                                  "... On Premise Retention
                                                  Packages". THE ONGOING
                                                  UPLOADS: save the new
                                                  exports over these and run
                                                  generate.py.

FIRST RUN (day 10 of 91, round-up goals): see the generate.py line for the
current house numbers; on 9/10 with all three sides in it was 8 of 87 brand
goals held across 24 reps, 1 rep (Jaime Colonna, a single one-buyer goal)
holding every goal; draft house Lager 157/316, Flight 3/8. House by
family: off Flight 58/144, Lager 220/349, Light Lager 50/124; packages Lager
114/265, Flight 0/5.

2026-09-10 SIXTH REFRESH -- MABI Fall retention
Actuals (MABI_Fall_2026_Retention_4.csv, 9/1-11/30 placements) converted
through convert_mabi_fall.py against the goals workbook already on file
(data/mabi_retention_fall_goals.xlsx -- not re-issued, not touched); every
brand subtotal, rep total and the goals base reconciled.

  house  2,412 -> 2,639 of 7,326 MADE placements (32.9% -> 36.0%), day 10 of
         91; still 0 of 24 reps at their 90% goal, as expected this early.

Every rep with activity moved up; nobody down. Biggest: Jim Heaney 174 -> 218
(28.2% -> 35.4%), Phil Ernst 167 -> 197 (43.9%), Matt Powierski 183 -> 215,
Brian Sengebush 53 -> 62 (50.4%, the high mark), Chris Payton 163 -> 182.
Dylan Rubino and John O'Donoghue still have a goal but no 9/1-11/30 activity.

2026-09-10 FIFTH REFRESH -- Molson Coors retention (on + off prem)
Both grouped workbooks (report time 9/10 15:46) converted through
convert_mc_retention.py; every rep, DM and report total reconciled, 0 new and
0 gone rep/brand pairs, so only values moved.

  brand goals retained   27 -> 30 of 100: Dan Lagala 1 -> 2 (off-prem Fever
                         Tree 30 -> 36 of 36), Derrick Laws 2 -> 3 (off-prem
                         Coors 53 -> 54 of 54), Phil Ernst 0 -> 1 (off-prem
                         Peroni 75 -> 78 of 78)
  off-prem placements    2,545 -> 2,588 of 2,912
  on-prem buyers         708 -> 718 of 840

Brian Sengebush crossed 100% overall (97.8% -> 101.4%, draft 116.5% ->
121.4%), joining Dave Ehlers (110.1%), Derrick Laws (103.0%) and Allison
Scott (104.9%). Matt Powierski's Fever Tree 36 -> 43 of 44 is one placement
from his third goal; Klejdi Lamo 91.4% -> 94.1%.

ONE THING WENT DOWN: Phil Ernst's off-prem Fever Tree 69 -> 68 of 85 (81.2%
-> 80.0%). It is the value on his own brand row in the workbook, not a
levelling error -- his rep total still reconciles -- so a placement dropped
out of the retain window on RDE's side. He gained a goal on Peroni the same
pull, so his overall still rose 90.0% -> 91.1%.

2026-09-10 FOURTH REFRESH -- Constellation Fall (5 of 6 files; Corona Gaintain not re-pulled)
Impact, Modelo Gaintain and Innovation (off-premise) plus the two on-premise
detail files, through 9/11. The Corona Gaintain export was not in this batch,
so that category stays on the 9/9 pull (719/1,620). The builder reconciled
every rep total against its product rows on every file, goal drift against
the frozen on-premise goals is 0, and the detail files still carry the spring
columns. Headlines:

  off-prem house  Modelo Gaintain 1,398 -> 1,528 / 2,405 · Impact 1,605 ->
                  1,747 / 3,136 · Innovation 280 -> 310 / 1,419
  on-prem house   packages 747 -> 812 / 2,107 buyers · draft 98 -> 108 / 381
                  (empty-keg pickups excluded 57 -> 54)
  house total     4,002 -> 4,304 placements + buyers held; still 0 of 24 reps
                  holding every goal, 3 of 20 holding every packages family

EVERY REP MOVED UP, NOBODY DOWN. Biggest: Paul Mclaughlin 30.4% -> 36.7%
overall (packages 85 -> 104 buyers held), Phil Ernst 42.3% -> 49.5%, Shane
Barreca 46.6% -> 52.5%, John O'Donoghue 60.0% -> 66.7%, Brian Sengebush 40.3%
-> 45.3%. Nick Melissari's off-premise went 0% -> 28.6% -- his first
off-premise rows this period. Dave Ehlers still leads at 66.8% overall.

Seven on-premise detail rows disappeared and all seven are re-dates, not
losses: Nick Melissari's two Lodi Lanes lines and Allison Scott's Meadows
Golf Club keg moved 9/10 -> 9/11, Robin Feldman's San Carlo line 9/9 -> 9/10,
and the Blackjack Mulligans / Andiamo lines still count on their earlier
loads (every affected rep's buyers-held went up).

2026-09-10 THIRD REFRESH -- Montauk, 2XO, Other Half (on + off), Sam Adams keg export
Exports run through 9/11. Headlines:

  Montauk     10 -> 12 new placements ($205 -> $235): Alisa Acciardi's first
             (a 19.2 oz + a draft handle) and Shane Barreca's third; six
             reps added reorder cases.
  Other Half  94 -> 104 off-premise accounts opened ($4,810 -> $5,330);
             Michael Harboy 10 -> 12, John O'Donoghue 9 -> 11, Andrew Lundy
             11 -> 12. On-premise 28 -> 30 accounts active (Brian Sengebush
             past the 1/3 bbl floor), still not paid until October confirms.
  Sam Adams   keg export only (no new Boston Beer workbook, so the scored
             numbers did not move): Encompass keg loads 244 -> 247 of 335
             (73.7%), 17 first Octoberfest kegs since the 9/8 report. Nick
             Melissari 64 -> 67 converted, Shane Barreca 3 -> 4 (100%),
             Allison Scott and Brian Sengebush +1 each.
  2XO         still 0 pairs anywhere. Paul Mclaughlin is the ONE rep who went
             down: his 9/9 Andiamo French Oak load (0.5 cs / 3 units) is gone
             from the export -- not re-dated, appears nowhere else -- so his
             on-premise units read 5.0 -> 2.0. A void, same shape as before.

Other removed rows are benign: Dan Lagala's six Linwood Wine (Other Half
off) rows came back dated 9/11 instead of 9/10, and John O'Donoghue's five
Vine Republik rows came back dated 9/11 instead of the future 9/18 RDE had
stamped them with -- both accounts still count once.

2026-09-10 SECOND REFRESH -- Touchdowns & Tea, Evil Genius, Garage Beer President (Le Grand Noir no-op)
Exports run through 9/11. The Le Grand Noir file is set-identical to the
published one (30 rows, 30.0 / 70 house cases), so nothing moved there.
Headlines:

  Touchdowns  54 -> 63 new off-prem 12-pack placements, 664 -> 789 on-prem
             cases, trackable $1,474 -> $1,734. Dave Ehlers 17 -> 21
             placements ($255 -> $315), Chris Payton 3 -> 5, Phil Ernst
             1 -> 3, Matt Powierski 1 -> 2 plus his first on-prem cases.
             On-prem: Brian Sengebush 122 -> 151 cs, Anthony Palmisano
             101 -> 122, Nick Melissari 54 -> 79, Allison Scott 174 -> 193.
  Evil Genius 3 -> 4 new placements (Dave Ehlers 3 -> 4, $30 -> $40, still
             the only rep past the 3-placement qualifier); CE 35 -> 40.
  Garage Beer house 7,537 -> 7,642 / 9,305 CE (82%). Eleven reps moved;
             Paul Mclaughlin is the one who went DOWN (189.97 -> 183.08
             growth), a return on the comparison side, nobody else fell.

Removed rows, all benign: Anthony Palmisano's Highland Wine 9/10 Half & Half
load, Klejdi Lamo's Island Of Spirits 9/9 Twisted Tea load and Mike Ast's
Wine & Spirit World 9/10 Sampler load each came back one case lighter (15 ->
14, 8 -> 7, 15 -> 14) -- same account, product and date, just requantified.
Nick Melissari's House of Que (East Rutherford) 9/9 rows are gone from BOTH
exports (Sun Cruiser Lemonade 4 cs on Touchdowns, a Stacy's Mom keg on Evil
Genius) and appear nowhere else in either file -- a voided order, the same
shape as the Tona 9/8 and Total Wine 9/9 removals. It costs him Evil Genius
CE 2 -> 0 (he was not near the qualifier); his Touchdowns on-prem cases
still rose on other accounts.

2026-09-10 REFRESH -- Keystone, 1911, Woodchuck, Tona, Lytt Launch
Five exports, all strict supersets of the published files (no rows removed,
nothing re-dated), so every change below is a gain. Keystone moved this time:
the 139-row export went onto keystone-ice/actuals.csv AND
MPOs/off-prem/keystone_ice_24oz.csv (sync rule), keystone-ice rebuilt first,
then the off-prem September board, then this page. Headlines:

  Keystone   109 -> 119 accounts, 3 -> 4 qualified, $195 -> $300 projected.
             DAN LAGALA QUALIFIED (17 -> 20 of 18, 47% of 43) and took rank
             #1 from Javier Melo; Derrick Laws 14 -> 15; Chris Payton 11 ->
             13 (3 to go); Anthony Palmisano 3 -> 5; Matt Powierski 7 -> 8;
             Shane Barreca 1 -> 2.
  1911       263 -> 269 new placements: Andrew Lundy 37 -> 39, Chris Payton
             9 -> 11, Paul Mclaughlin 0 -> 2 (his first, both draft).
  Woodchuck   31 -> 35 new placements: John O'Donoghue 6 -> 9, Phil Ernst
             0 -> 1. Dave Ehlers's Total Wine cases came back (32 -> 37).
  Tona        12 -> 12 new 24 oz placements; only Dylan Rubino's other-
             package volume moved (62 -> 65 cases).
  Lytt        Phil Ernst 9 -> 10 accounts, 36% -> 40% (now at the 40% rate);
             Pablo Lopez 5 -> 6, 19% -> 23%. No tier change for anyone else.
No rep went down on any program.

2026-09-09 SECOND REFRESH -- 1911, Woodchuck, Tona, Lytt Launch (Keystone no-op)
Exports now run through 9/10. The Keystone file Gavin sent with this batch is
byte-identical to the 124-row export both Keystone copies already hold, so
nothing moved there. Headlines:

  1911       262 -> 263 new placements   (+32 rows, 9 removed -- see below)
  Woodchuck   31 ->  31 new placements   (+9 rows, 1 removed -- see below)
  Tona        12 ->  12 new 24 oz plc    (+7 rows, 2 re-dated 9/9 -> 9/10)
  Lytt        Phil Ernst 8 -> 9 accounts, 32% -> 36% penetration (Stew
             Leonard's Clifton took all six SKUs on 9/10); no tier change
  Keystone    unchanged, 109 accounts, 3 qualified

DAVE EHLERS IS THE ONE REP WHO WENT DOWN, on two programs at once, and it is
RDE dropping a 9/9 Total Wine & More (Totowa) order, not a reclassification:

    1911      14007 Total Wine (Totowa) / 9142 Candy Corn 6/4/16 oz Can / 9/9
              14007 Total Wine (Totowa) / 9129 Maple Bourbon 6/4/16 oz Can / 9/9
    Woodchuck 14007 Total Wine (Totowa) / 8022 Amber 4/6/12 oz Btl / 9/9 / 5 cs

All three are genuinely absent from the new files -- not re-dated, not
reassigned, and that account+product appears nowhere else in either export
(checked before rebuilding). It costs him 1911 offPremNewCount 8 -> 6 (both
were qualifying new placements) and Woodchuck caseVolume 37 -> 32, and it
does NOT move his tier on either. Third time an export has removed a row
(Tona 9/8, off-prem W&S 9/8); same shape each time, a voided or returned
order on RDE's side.

The other six removed 1911 rows are benign: Andrew Lundy's four Wine
Anthology rows came back dated 9/10 instead of 9/9, and Nick Melissari's
three Blackjack Mulligans (Hawthorne) Honey Crisp keg rows moved to Allison
Scott -- the same rep reassignment both MPO boards carried today -- so his
draftNewCount 2 -> 1 and hers 1 -> 2. John O'Donoghue 27 -> 29 and Shane
Barreca 16 -> 17 are the real 1911 gains (Best Cellars Ledgewood and Ramsey
Wine & Liquor, both 9/10).

2026-09-09 REFRESH -- Keystone only, riding the off-prem MPO refresh
keystone-ice/actuals.csv and MPOs/off-prem/keystone_ice_24oz.csv moved
together onto the 124-row export (the sync rule below, followed this time
rather than repaired): 101 -> 109 accounts, still 3 qualified, $190 -> $195
projected. Nothing else on this page was re-pulled; the rebuild only
re-embedded the Keystone card from keystone-ice's JSON.

2026-09-08 REFRESH -- five exports, and the Keystone files were out of sync
Refreshed 1911, Woodchuck, Tona, Lytt Launch and Keystone. Headlines:

  1911       256 -> 262 new placements   (+22 rows, none removed)
  Woodchuck   31 ->  31 new placements   (+13 rows, none removed)
  Tona        12 ->  12 new 24 oz plc    (+6 rows, ONE REMOVED -- see below)
  Lytt        no change at all           (export was set-identical)
  Keystone    84 -> 101 accounts, 2 -> 3 qualified, $125 -> $190 projected

KEYSTONE IS AGAIN THE HEADLINE, AND THE SYNC RULE BELOW FIRED AGAIN. The two
copies of the same RDE export had drifted apart BEFORE this refresh --
keystone-ice/actuals.csv was still on the 96-row pull while
MPOs/off-prem/keystone_ice_24oz.csv carried a 108-row one. Both are now on
this refresh's 115-row export and are byte-identical again, and the two boards
were cross-checked per rep afterwards: 101 accounts house-wide on each, zero
per-rep differences. If they ever disagree, diff those two files first.

Javier Melo is the new qualifier (12 of 12, 41% of 29), joining Pablo Lopez
(12 of 12) and Derrick Laws, who went 13 -> 14 and took rank #1. Dan Lagala
made the biggest move without qualifying: 4 short of his 18, up from 16 short,
which lifts him from rank 13 to rank 4.

THE OTHER FOUR AGAIN MOVED WITHOUT MOVING THEIR HEADLINES, the same pattern
the 2026-09-04 note describes -- new placements only come from accounts with
no base-period row, so a mid-program pull moves case volume long before it
moves placements. The check that the data actually landed is the per-rep
scalars, and they moved: 1911 17 metrics, all upward; Woodchuck 10, all
upward. Nothing regressed on either.

LYTT DID NOT MOVE AT ALL, and that is the export, not the build. The file is
SET-IDENTICAL to the previous pull -- 698 rows, nothing added, nothing
removed, merely re-sorted (verified before the run). Not one scalar metric
changed. The rebuild still rewrites Lytt's byRep lists in index.html, but only
their ORDER; this is the same churn the 2026-09-03 note records for
evil_genius, and a diff confined to that program is not a data change. Check
whether the rows themselves differ before hunting for a bug.

ONE TONA ROW WAS REMOVED BY RDE, the second time an export has dropped a row
rather than only adding (off-prem's Wine & Spirits was the first, 2026-09-08):

    John O'Donoghue / 190012 Joe Canal's Disc Liq /
    7270 Tona 4/6/12 oz Btl / 9/4/2026 / 3 cases

It is genuinely absent from the new file -- not re-dated, not reassigned, and
that customer+product appears nowhere else in it (checked before rebuilding).
It reads as an RDE-side reversal, the shape of a voided or returned order, not
a reclassification. It costs O'Donoghue caseVolumeOther 10 -> 7 and one
account off that list, and it is the ONLY metric anywhere in this refresh that
went down. It does NOT touch the 24 oz leg, which is the one Tona scores its
qualifier on, so nobody's payout moves -- but it is recorded here because a
silent drop is exactly what nobody would notice.

2026-09-04 REFRESH -- five exports, and the Keystone dependency finally bit
Refreshed 1911, Woodchuck, Tona, Lytt Launch and Keystone. All five grew with
NO row removed (+11 / +5 / +8 / +18 / +11 rows); the one 1911 row that looked
dropped was the same key with its Cases revised (-3.00 -> -2.00, a return
partly reversed), with Buyer and Placement Count untouched, so nothing
reclassified.

KEYSTONE IS THE HEADLINE: 75 -> 84 accounts house-wide and 0 -> 2 reps
qualified, the first on this program -- Pablo Lopez 12 of 12 (43% of 28, rank
#1) and Derrick Laws 13 of 13 (41% of 32). Projected payout $0 -> $125.
This is exactly the failure the ordering rule below exists to prevent, so it
is worth recording that it actually happened: keystone-ice/actuals.csv had
been left on the older 85-row pull while MPOs/off-prem carried the newer
96-row one, so this page showed 0 qualified while the off-prem board already
showed 2. The two files are the SAME RDE export and are now byte-identical
again. If the Keystone card ever disagrees with the off-prem board, compare
those two files first -- that is the bug, every time.

THE OTHER FOUR MOVED WITHOUT MOVING THEIR HEADLINES, which is expected and
not a failed load. New-placement totals held at 1911 34, Woodchuck 8 and Tona
12 because every added row is a REORDER at an account that already bought in
the 5/1-7/31 base window -- new placements only ever come from accounts with
no base-period row, so mid-program refreshes move volume long before they move
placements. What did move, and is the proof the data landed:
  1911       case volume up for Andrew Lundy (62->66), Jayson Romine (61->62),
             John O'Donoghue (88->93) and Mike Ast (55->59); off-prem reorders
             up for O'Donoghue (11->12) and Ast (3->4).
  Woodchuck  case volume up for Andrew Lundy (20->24), Dylan Rubino (11->12),
             Hakan Sadik (16->17), John O'Donoghue (19->21), Phil Ernst (8->9);
             reorders up for Sadik, O'Donoghue and Ernst.
  Tona       other-Tona cases up for five reps; Dylan Rubino's 24 oz cases
             4 -> 6. Still nobody at the 20-case 24 oz qualifier -- Rubino
             leads at 6, so that leg is unpaid house-wide.
  Lytt       three reps each gained a buying account: Jayson Romine 11->12
             (33.3%->36.4%), Matt Powierski 10->11 (28.6%->31.4%), Phil Ernst
             7->8 (28.0%->32.0%). No tier changed -- all ten tiered reps are
             still "Gettin' Lytt" at $0.50, so no rate moved.
A refresh that leaves a placement count flat is therefore NOT evidence the file
failed to load. Check the per-rep case volumes, which move first.

Because build_keystone_ice() reads a sibling dashboard's output, THIS
PAGE IS ONLY AS CURRENT AS THAT DASHBOARD. Refresh keystone-ice first
(save the new RDE export over its actuals.csv, run its generate.py),
then run this one -- same ordering rule the display auction already has.
If the Keystone JSON is missing, or is present but has no rep-level data
yet, the builder prints SKIPPED and returns an empty byRep, which puts
the program back on the zero-state card rather than breaking the tab.

John Neukum is in Kohler's Keystone goals workbook but not in ROSTER, so
he is dropped here (the usual roster reason) and meta.offRoster names him
in the build output. Reps WITH a goal but no accounts yet are kept at
zero on purpose: "you have sold none of your 12" is exactly what a rep on
a distribution program needs to see, and dropping them would quietly
shorten the leaderboard.

Three groups, per Gavin, 2026-08-31:
  new         The 8 brand-new September programs: keystone_ice,
              touchdowns_tea, evil_genius, other_half, montauk,
              printed_menu, bardstown_display, two_xo.
  ongoing     The 6 programs that run across BOTH months: 1911,
              woodchuck, tona, lytt, le_grand_noir,
              garage_beer_president. Gavin: "If they appear in August
              AND September, these can be the Ongoing portion of the
              incentives for September." These are the ONE exception to
              the zero state -- their RDE windows already cover
              September, so they point at the SAME PROGRAM_DATA and the
              SAME card functions August uses and show live numbers on
              both tabs. Nothing is duplicated; both tabs read one
              source.
  retention   mc_retention first, then the new Sept-Nov period with NEW
              goals: constellation_fall, mabi_retention_fall,
              yuengling_retention_fall. August keeps showing the Jun-Aug
              period it already tracks -- the two tabs track different
              periods of the same programs, deliberately.

              MC RETENTION IS THE EXCEPTION IN THIS GROUP (added to
              September 2026-09-04, per Gavin: "molson coors retention
              program is the same one from august. it goes through
              october"). It is NOT a new Sept-Nov period -- it is the
              same August program still running, so it reads PROGRAM_DATA
              and reuses cardMcRetention() the way the `ongoing` group
              does, rather than reading PROGRAM_DATA_2026_09. One
              dataset, one card, both tabs. It leads the group because
              it is the only retention card here with live numbers; keep
              it first in BOTH PROGRAM_LIST_2026_09 and the month's
              repCards.retention or the jump nav and the cards disagree
              about the order.

              REMOVED FROM SEPTEMBER 2026-09-04: heineken_husa and
              new_belgium_distribution_retain, per Gavin -- both START in
              October, so a September card for either would show reps a
              program they cannot earn on yet. Only their two registry
              entries and their repCards slots came out; PROGRAM_RULES,
              logos, TERRITORY_UNCONFIRMED (heineken_husa) and
              CORE_MARKET_PROGRAMS_PENDING (new_belgium_distribution_retain)
              are all still in place, so putting them on an October tab
              is those few lines again, not a rebuild.

heineken_husa (HUSA SDD) has never been on this dashboard before and is
new in every sense -- no data, no prior period, no card function. Off
the September tab as of 2026-09-04; it starts in October.

new_belgium_distribution_retain's retain phase does not start until
October either (the deck runs Achieve May-Jun, Push Volume Jul-Aug,
Retain Oct-Nov), so September was a gap month for it. It used to sit on
the September tab anyway, carrying a note that its numbers begin in
October, because the cover checklist lists NBB Distro. Gavin removed it
2026-09-04 along with heineken_husa: a card a rep cannot earn on this
month is noise, and the note was doing the work an absent card does
better. Both come back on the October tab.

TERRITORY PILLS ON SEPTEMBER PROGRAMS
The "Core Market" / "All Counties" pill is a real claim a rep acts on,
so it is never guessed. generate.py has CORE_MARKET_PROGRAMS_PENDING
alongside CORE_MARKET_PROGRAMS for exactly this: keys confirmed Core
Market whose data can't run through the territoryEligible loop below
(that loop indexes `data[key]` and would KeyError), for either of two
reasons -- an August continuation with no builder yet, or a
September-blob program (data_09, never walked by that loop at all, so
these can never graduate to CORE_MARKET_PROGRAMS the way the August
ones can; see the comment on CORE_MARKET_PROGRAMS_PENDING itself).
Both sets are unioned into the emitted CORE_MARKET_PROGRAM_KEYS.

RESOLVED 2026-09-04, against kohler_brands_whitelist_blacklist.xlsx's
"Brand Family Territory (Enc)" and "Master Matrix View" sheets (the raw
per-county US/THEM matrix, not just the summary label -- checked both
so a brand whose footprint doesn't cleanly match Core Market's exact
six counties wouldn't get mislabeled):
  Core Market   keystone_ice, touchdowns_tea (Keystone, Twisted Tea and
                Sun Cruiser are all US in exactly Bergen/Passaic/
                Passaic-FF/Sussex/Morris 1/Morris 3 and THEM everywhere
                else -- Core Market's own definition), printed_menu,
                bardstown_display (Bardstown Bourbon and Bardstown
                Green River, identical pattern). The latter two are
                manual:true zero-state cards, which is why terrTag()
                had to be added to cardAwaitingData()'s header row too
                -- the individual cardXxx() functions already called it,
                the shared zero-state renderer didn't.
  All Counties  evil_genius, montauk, two_xo (all US in every county).
                Nothing to add for these -- terrTag() already renders
                "All Counties" for any key in neither set, so removing
                them from TERRITORY_UNCONFIRMED was the whole change.

STILL unconfirmed, in index.html's TERRITORY_UNCONFIRMED -- terrTag()
renders NO pill for these rather than guessing:
  heineken_husa  The workbook's five Heineken SKUs don't even agree with
                 each other. Heineken proper is US in Bergen/Passaic/
                 Passaic-FF/Morris 3 but THEM in Sussex/Morris 1 (which
                 Core Market has); Dos Equis is narrower still, US only
                 in Bergen & Passaic. HUSA SDD covers multiple brands
                 with genuinely different footprints, so neither pill
                 would be an accurate claim for the program as a whole
                 -- this isn't a case of "confirm it and move it," the
                 program itself straddles two territories.
  other_half     RESOLVED 2026-09-04 -- ALL COUNTIES, straight from Gavin
                 ("other half is all counties of distribution"), exactly
                 how Lytt was settled (2026-08-10), since the brand is too
                 new to be in the whitelist workbook at all. Removed from
                 TERRITORY_UNCONFIRMED, so it shows the All Counties pill.
                 Careful not to conflate this with the Southern District
                 payout RATE inside build_other_half() -- that's about how
                 much an account pays, not where the brand may be sold,
                 and it is still an unconfirmed reading (open question 7).

SEPTEMBER LOGOS (assets/logos/, added 2026-08-31)
Pulled straight out of the September deck with poppler's pdfimages
(`pdfimages -png -f <page> -l <page> deck.pdf out`), then trimmed to
content and scaled to the chip's 196x58 display cap. New files:
keystone_ice.png, evil_genius.png, other_half.png, montauk.png,
bardstown.png, two_xo.png.

Two needed more than a straight extract:
  keystone_ice  the deck only has a vertical can shot, so the extracted
                image (RGB + its separate soft mask, recombined for
                transparency) is rotated 90 degrees -- otherwise the
                wordmark is ~24px wide in the chip and unreadable.
  two_xo        cropped to the wordmark band; the full slide art is a
                wide gradient that loses the "2XO" entirely at chip size.

Reused rather than re-extracted:
  touchdowns_tea            -> sun_cruiser.png. The deck's only art for
                               this program is a football promo banner,
                               not a logo.
  printed_menu,             -> bardstown.png for both. Each program is
  bardstown_display            "Bardstown/Green River" and a chip holds
                               one mark, so both use the lead name (same
                               pattern as August's two Garage Beer
                               programs sharing one logo).
  constellation_fall, mabi_retention_fall, yuengling_retention_fall,
  new_belgium_distribution_retain -> their August counterparts' marks.

NO LOGO, deliberately: heineken_husa (the deck's HUSA slide is a goals
table, and there is no Heineken artwork anywhere in the file) and
le_grand_noir (also unmapped in August). progLogo() renders no chip for
an unmapped key, so both are fine as-is -- drop a file in and add the
mapping if art ever arrives.

OPEN QUESTIONS FOR GAVIN (September deck, not yet resolved)
  1. Constellation on-premise Impact goal: the "Fast Start" summary
     block says IMPACT pkg = 649, but the Fall Distribution slide's own
     per-brand numbers sum to 631 (Corona Light 288 + Corona Premier 90
     + Pacifico 123 + Corona NA 130). 631 is what reconciles with that
     slide's stated on-premise package total of 2119 (Gaintain 1339 +
     Impact 631 + Innovation 149), so the card currently uses 631 and
     649 looks like the typo. Worth confirming before payouts.
  2. RESOLVED 2026-09-04 for 6 of the 8 -- see "TERRITORY PILLS ON
     SEPTEMBER PROGRAMS" above. Still open: heineken_husa (the workbook's
     own Heineken/Dos Equis brands don't share one territory, so this
     isn't a lookup away from resolved) and other_half (not in the
     whitelist workbook at all yet -- ask Gavin directly, as with Lytt).
  3. Which September programs get an RDE export at all -- printed_menu
     and bardstown_display are photo/documentation verified and may
     never have one, in which case their cards stay descriptive
     permanently (they are flagged manual:true and say so on the card).
  4. RESOLVED 2026-09-02 -- EVIL GENIUS BONUS BASIS. Was: the export's
     only 2025 column was the FULL CALENDAR YEAR set against a single
     September, which nobody could ever beat (7 CE vs 1,230 house-wide),
     so the bonus was left unscored. Gavin re-pulled the export against
     9/1-9/30/2025, the like-for-like month, and it now SCORES: $1 per CE
     over that rep's own last-September figure, floored at zero and gated
     by the same 3-placement qualifier as everything else ("3 placements
     minimum for any payout" covers the bonus too).
     No code change was needed to find the moved column -- dated() locates
     the periods by their embedded dates, not by name, so the new layout
     (Sept 2025 / Jun-Aug 2026 / Sept 2026) sorted into place on its own.
     The per-rep field is casesBaseline, not cases2025, and the window
     label is carried through as meta.baselineWindow so the card names the
     actual comparison month rather than hardcoding one.
  5. MONTAUK PLACEMENT GRAIN -- per pack tier (current, 5 placements) or
     per account the way 1911 is (3)? The deck prices 6pk and 12pk/19.2oz
     differently, which is why per-tier is the default here, but Gavin's
     2026-08-17 ruling for 1911 was explicitly account-level. Both counts
     are in the data and the card footnote states the difference.
  6. RESOLVED 2026-09-04 -- 2XO BOURBON ON-PREMISE POD DEFINITION. Per
     Gavin: "it doesn't matter the specific product, it is just 2 pods
     for 2xo for the on premise." So on-premise is now scored too: sum
     UNITS (a column added to the export specifically to settle this)
     across every 2XO product a NEW account buys, any mix, and 2+ pays
     $25 flat -- Gavin's usual account-level rule, unlike off-premise's
     per-SKU pairing (see build_two_xo()'s docstring for why those two
     legs classify differently). Verified by hand: the one on-premise
     account with current-window activity (Andiamo, Paul Mclaughlin)
     already bought French Oak in the base window, so it reads as a
     reorder and pays $0 -- correct, not a bug, since it isn't a non-buy
     account. Both legs render live on cardTwoXo().
  7. RESOLVED 2026-09-04 for the non-buy question -- OTHER HALF. Per
     Gavin: "we just acquired this brand so there is no base period ...
     all the data we have is from that sheet attached. so i guess every
     account is a non buy." Off-premise is now fully built and scored
     (data/other_half_on.csv, data/other_half_off.csv, build_other_half()
     in generate.py, cardOtherHalf() in index.html) on that basis: every
     account in the export counts as a fresh open, off-premise pays $40
     for 3+ core SKUs (+$10/extra SKU beyond 3), verified by hand against
     the raw 83-account export before trusting the builder ($3,410 total,
     36 Core Market accounts under the SKU formula + 32 Southern District
     accounts under the flat rate below).
     STILL OPEN, and NOT a call this page made alone:
       - SOUTHERN DISTRICT'S $50/ACCOUNT IS A READING, NOT A CONFIRMATION.
         The deck's SKU-minimum language only appears on the two bullets
         that don't mention Southern District; the Southern District
         bullet stands alone with no SKU count. Read at face value, that
         means Southern District gets a flat $50 per account opened
         INSTEAD OF the $40+$10/extra formula -- not stacked on top of
         it. Territory comes from matching each account's Customer Num
         against territory-accounts/southern_district_off_prem.csv (see
         that folder's README); an account not found there scores under
         the standard formula. cardOtherHalf() labels every
         Southern-District-priced account and says this reading is
         unconfirmed -- ask before it pays out for real.
       - ON-PREMISE STILL ISN'T SCORED, and this one is a hard data gap,
         not a reading question: the $150 needs the SAME account to buy
         in BOTH September and October, and only September exists.
         September activity (accounts active, and which ones clear the
         1/2 bbl / two-1/6-bbl floor) renders on the card as progress
         with NO dollar figure attached, so nothing overstates a payout
         that isn't confirmed yet. Comes back once an October export
         lands -- the account-level tracking already built is what that
         will key off.

STATUS (2026-08-20): ALL 11 original-deck programs built and live --
Le Grand Noir (program 11) went live 2026-08-20 when its first RDE
file arrived (data/le_grand_noir.csv, single-period Cases 8/1-10/31;
build_le_grand_noir() in generate.py, cardLeGrandNoir() in index.html,
grouped under New Incentives). Tracked as a 70-case company-wide gate
plus per-rep case counts with a sales drill; whether the $10/case pays
retroactively or only post-threshold is STILL OPEN with Gavin -- it
doesn't matter for progress display, only if payout estimates are ever
added.

CONTINUING PROGRAMS (slides 13-25, added 2026-08-1x): Gavin asked to
add 8 more programs from the deck's "continuing programs" section,
originally deferred on 2026-08-05. 5 of 8 built so far -- Sun Cruiser
Volume, Yave Tequila Launch, Molly's 1.75L, Garage Beer Summer Sequel
(volume-push tiers only), Garage Beer President's Incentive. See
"CONTINUING PROGRAMS" section below for all 8, including the 3 not yet
built (Sammy's Beach Bar Rum -- no data yet; New Belgium Distribution/
Volume, Summer of Success THC Volume -- not yet sent, need goal-
threshold numbers not on
the slides). The Chelada/Corona Premier Summer of Success program
(slides 24-25) was not requested.

iSellBeer Summer Display Auction (slides 14-15) -- ADDED 2026-08-25,
reversing the earlier "not part of this dashboard" note. Gavin: "is
there a way you can wire the isellbeer auction display program into
this page? make it a tile just like the other programs. put it in
ongoing." It is now an Ongoing tile (key 'display_auction',
cardDisplayAuction()), and it is the ONLY program on this page whose
data does not come from data/:

  SOURCE: ../isellbeer/display-auction-tracker/index.html, the
  <script id="da-data"> block that tracker embeds -- already fully
  scored, per person, with photo links. build_display_auction() parses
  that JSON and re-shapes it; it does NOT rescore anything. Deliberate:
  the tracker's generate.py owns what counts as one display, the
  priority/all-other split, the 10/20/40/70-case tiers, the points per
  tier, and the weekly --merge that keeps older weeks on the board. All
  of that was reverse-engineered once and that folder's README says not
  to re-derive it, so duplicating it here would create two scorers that
  could silently disagree.

  CONSEQUENCE: this tile is only as fresh as the auction tracker's last
  refresh. Refresh the tracker FIRST (python3 generate.py Report_NN.xlsx
  --merge in that folder), then run this generate.py. Running this one
  alone will happily rebuild the page with last week's auction numbers.
  If the tracker file or its da-data block is missing, the builder prints
  a SKIPPED line and returns empty rather than failing the whole build.

  SALES REPS ONLY, which makes the rank on this card a REP rank, not the
  auction's overall standing. Associates are a real force in this auction
  -- as of 2026-08-25 they hold 5 of the top 8 spots and mickey obrien
  would sit 2nd overall -- so the card carries a footnote saying so and
  links to the tracker for the full board. iSellBeer name spellings are
  canonicalized to ROSTER (AUCTION_NAME_FIXES, plus a curly-apostrophe
  fix for John O'Donoghue); John Neukum is dropped per the standing
  roster rule. 19 of 27 reps are scoring; the other 8 get a zero-state
  card rather than no card, since every rep can enter.

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

   3+ SKU RULE (2026-08-26, per Gavin -- applied to the off-prem MPO
   tracker's Lytt objective the same day, then here on his follow-up
   "apply that same methodology to the lytt incentive"): an account
   only counts toward penetration once it carries LYTT_MIN_SKUS = 3
   DISTINCT Lytt products. Distinct Product Num, not rows -- the same
   SKU reordered three times is one SKU. On the 8/26 data this dropped
   11 of the 131 carrying accounts and took reps in a tier from 9 to 7:
   Shane Barreca 25.8% -> 22.6% and Javier Melo 31.0% -> 20.7% both
   fell out of "Gettin' Lytt" and off the $0.50/case rate.
   Accounts carrying Lytt but under the bar are NOT dropped and are NOT
   whitespace either (whitespace is accounts that never bought), so
   without somewhere to live they'd vanish from the card entirely --
   they go in partialAccounts and render as their own "Carrying Lytt --
   Not Counting Yet" section with what each still needs. They are the
   cheapest accounts on a rep's list to convert. programEligible counts
   them too, so a rep holding only 1-2 SKU accounts still gets the
   program card rather than the "Not Applicable" one.
   NOTE this rule does NOT touch caseVolume: the payout is still
   rate x every case sold, including cases from accounts under 3 SKUs.
   Only the penetration % (and therefore which rate applies) is gated.
   If Kohler means the rate to apply only to counting accounts' cases,
   that's a separate change -- ask before assuming it.
   The same rule and threshold live in MPOs/off-prem/index.html's
   buildPctOfBaseDataset (minSkus:3). The two pages still report
   DIFFERENT penetration numbers for the same rep because their
   denominators differ (this program's eligible universe is Core
   off-premise accounts from customer_base_full; the MPO page uses
   sales_reps_customer_base_core.csv) -- that predates this change and
   is expected, so don't "fix" one to match the other.

   Note: the customer base this program's penetration math depends on
   is customer_base_full.csv in incentive-tracking/data/ -- re-pull it
   periodically, since the eligible-account universe (and therefore
   every rep's penetration %) shifts as the customer base changes,
   independent of new Lytt RDE pulls. That is the "Sales Reps' Customer
   Base 4" export: the COMPLETE book, both premises, all counties.
   The older customer_base_off_prem.csv / customer_base_on_prem.csv are
   LEGACY as of 2026-08-18 -- the denominator switched to
   customer_base_full.csv then, and they now feed only
   load_premise_map(), where customer_base_full.csv overlays and wins
   over them anyway. Refreshing them changes nothing; refresh the full
   file instead.
   Checked 2026-09-04, when Gavin sent a "Sales Reps: Customer Base
   Core Off Prem" workbook for the MPO board: it was NOT a refresh path
   for this program on its own. It holds only Core Market off-premise
   accounts, where customer_base_full.csv holds the whole book (both
   premises, all counties) plus the Draft Package column several
   builders read. It went to MPOs/off-prem/sales_reps_customer_base_core.csv
   only -- see that folder's README for the full where-it-applies list.

   REFRESHED for real the same day via a different, house-wide export:
   Kohler's "Entire Core Market / Southern District, On/Off Prem"
   pulls (four files -- Core Market and Southern District, each split
   on/off premise), applied by the repo-root territory-accounts/
   folder's refresh_customer_bases.py. See territory-accounts/README.txt
   for the full mechanics; the two things worth knowing here:
     - It's a SCOPED merge, not a full replace: only rows whose
       Distribution Area falls in the nine areas those four exports
       cover (Core Market's six plus Southern District's three) get
       refreshed. Morris 2, Middlesex, and any "Sales"-placeholder row
       whose County doesn't resolve to one of those nine are left
       exactly as they were -- these exports don't claim to describe
       that territory, so an account missing from them there is not
       evidence of closure.
     - Draft Package is preserved by Customer Num across the merge
       (these four exports don't carry that column at all), so no
       builder's draft-channel eligibility lost data in the refresh. A
       brand-new account gets Draft Package = "" rather than a guessed
       value -- is_draft_capable() reads that as not-draft-capable, an
       honest default until a future export says otherwise.
   This is the fix for "i still see the accounts that are closed still
   populating" (Gavin, 2026-09-04) -- 113 closed accounts dropped from
   customer_base_full.csv in that first pass, Shane Barreca's Cambridge
   Wines (Woodcliff Lake) among them.

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

11. LE GRAND NOIR VOLUME INCENTIVE -- Aug, Sept, Oct [BUILT 2026-08-20]
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
   Push Volume Jul-Aug / Retain Sep-Oct [BUILT, Push Volume phase only]
   - Achieve: secure distribution goals across 4 core brands (New
     Belgium, 12pk Voodoo, 19.2 Voodoo, Hearted Family, Kirin) -- tiered
     payout per brand goal achieved [NOT STARTED -- needs brand-specific
     goal numbers not stated on the slide]
   - Push Volume (Jul-Aug): volume payout for cases sold over last
     year, as part of the Summer Volume Program [BUILT]
   - Retain (Sep-Oct): tiered payout per brand goal retained
     [NOT STARTED -- same goal-number gap as Achieve]
   - Core Bonus: additional tiered bonus if both achieve + retain goals
     hit AND positive NBB growth May-October [NOT STARTED -- depends on
     Achieve/Retain]
   Sourced from RDE_NEW_BELGIUM_DISTRIBUTION__PUSH_VOLUME_2026_1.csv
   (new_belgium_distribution_push_volume.csv) -- the filename and its
   brand list (Bell's, Bell's Hearted Family, Kirin Ichiban, Kirin
   Light, Voodoo Family) confirm this is the Push Volume phase data.
   The file's own two periods are May-Jul 2026 (base, 3 months) vs Aug
   2026 (current, 1 month) -- NOT a year-over-year comparison, and Aug
   was only ~5 days in when this file was pulled, so a straight
   current-vs-base diff would show a misleading decline across the
   board (e.g. Voodoo Family: ~2,201 CE/mo base rate vs 256 CE seen in
   the first few days of Aug). Built instead as a volume tracker: raw
   Case Equivalents sold during the Aug push window per core brand
   family, with the May-Jul monthly average shown only as a reference
   rate, not a growth/goal target. Achieve and Retain still need
   brand-specific distribution-goal numbers before they can be built.
   Roster note: file includes John Neukum rows, dropped per the
   standing not-a-rep exclusion.

3. GARAGE BEER PRESIDENT'S INCENTIVE -- Jun-Sep [BUILT]
   - Flat $1.00/CE over last year, once total Garage Beer CEs (company-
     wide) cross 9,305 for the period
   Sourced from a "Comparison_GSHARKEY_..." export -- a year-over-year
   Case Equivalent report (2025 vs 2026, Jun-Sep window) with "Total"
   and "Garage Beer" subtotal rows plus one row per rep. This wasn't
   an obvious match at first (no file was explicitly labeled "President's
   Incentive"), but the date window (Jun-Sep) matches the deck exactly,
   and its "Garage Beer" row gives the company-wide current CE needed
   for the 9,305 house gate directly. Built: house-wide CE progress bar
   (companyTotalThisYear / 9305) and each rep's own CE growth over last
   year (this-year minus last-year from the file's own two columns,
   not its precomputed +/- column, since that column is parenthesis-
   formatted for negatives and not needed once computed directly).
   Rows matching "Total", "Garage Beer", "John Neukum", or "Default"
   are skipped (not real per-rep rows / not reps).

4. GARAGE BEER SUMMER SEQUEL -- Jun-Aug [BUILT, volume-push tiers only]
   - Volume Push: 3 tiers over 2025 CEs -- Tiered ($1/CE), Bonus
     ($1.50/CE), Super Bonus ($2/CE)
   - Draft Bonus: $50 new draft placement / $100 re-purchase (after
     account purchases 3 kegs total), half payout on 1/6bbl
   - $5 per on-premise iSellBeer feature submitted
   The "GARAGE_BEER_SUMMER_SEQUEL..." file resolved the goal-threshold
   gap directly -- it gives each rep their OWN individual Tiered/Bonus/
   Super Bonus CE goals (not one company-wide number), plus their
   current-period Case Equiv. Built: per-rep tier status (their CE vs
   their own 3 goals) and a progress bar toward Super Bonus.
   DATA QUALITY ISSUE (2026-08-1x): the file is sorted by Case Equiv
   descending and its first data row -- nominally "Shane Barreca", CE
   5152.07 -- is a mislabeled grand-total row: that value is (within
   rounding) the sum of every other rep's CE in the file, and is
   wildly inconsistent with Shane Barreca's own real row further down
   (CE 226.92, matching goals of 168/203/227). build_garage_beer_
   summer_sequel() in generate.py handles this generically: when a rep
   name appears twice, the row with the LARGER Case Equiv is dropped
   as the total-row artifact. Watch for this same pattern in any
   future Comparison/pivot-style exports.
   No account/product-level data in this file, so the Draft Bonus and
   iSellBeer feature components aren't built -- would need a separate
   export (same shape as 1911/Woodchuck's per-account draft data) if
   Gavin wants those tracked.

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

RETENTION PROGRAMS (April deck, retention phase -- added 2026-08-19)
====================================================================
Logos (2026-08-19): molson_coors.png, mark_anthony.png,
constellation.png, yuengling.png are the REAL supplier artwork, sent by
Gavin in chat and processed with Pillow -- trimmed of their background
margins and scaled to 200px on the long edge, matching the existing
logo files. Mark Anthony's came as white type on a black marketing
banner with brand badges alongside, so it was cropped to the wordmark
and INVERTED to dark type, which is what makes it sit on the white
.prog-logo-chip like the rest.
Sizing (2026-08-19, per Gavin -- Mark Anthony and Yuengling read too
small at first): the logo chip is no longer a fixed height. It is
height:auto with the size limits on the IMG instead (max 196x58 in a rep
card, 150x42 on an overview tile, 230x68 on a program page), so a TALL
lockup grows the chip and stays legible while a WIDE wordmark is capped
by max-width and cannot run away with the header. Two source images were
also reflowed to suit that chip: Mark Anthony arrived as three stacked
lines and is recomposed as "MARK ANTHONY" over "BREWING" (5.2:1 instead
of 1.9:1), and Yuengling lost only its tiny "AMERICA'S OLDEST BREWERY"
tagline, which was illegible at chip size. Yuengling's eagle and script
are NOT separable -- the script's Y-swash rises into the eagle's rows,
so any rectangular split clips one of them; the lockup is kept whole.
(Interim SVG wordmarks drawn on the same day were replaced by these and
deleted. Worth knowing for next time: this environment cannot download
logos -- the agent proxy answers 403 to CONNECT for general web hosts,
including the dashboard's own github.io URL -- but images pasted into
chat ARE recoverable: they are stored base64 in the session transcript
at ~/.claude/projects/<project>/<session>.jsonl and can be decoded to
disk.)
Per Gavin, 2026-08-19: a third section, "Retention Programs", below
Ongoing Incentives -- rep cards, overview tiles, and a third "Jump to"
pill group. These track the RETENTION phase of the supplier
"Achieve and Retain" distro programs from the 2026 April Rewards Deck
(slides 14-16, 18, 20, 22-23, 28-29): MolsonCoors, Peroni/Banquet
draft, Constellation (package + draft), MABI, Yuengling. Ground rules
per Gavin, 2026-08-19:
  1. The report files carry each rep's individual goal numbers -- no
     goal numbers needed from the slides.
  2. Track ONLY the current retention window (each file's own date
     range) -- no achieve-phase history.
  3. ALL of these suppliers are Core Market -- every retention program
     goes in CORE_MARKET_PROGRAMS / CORE_MARKET_PROGRAM_KEYS (same
     3 reps blocked: Alex Rodriguez, Andrew Lundy, Hakan Sadik).
No $ totals are computed: the deck's "$500 max payout for every brand
goal retained" wording doesn't give a clean per-goal rate to multiply
(and the house-goal-missed rule halves payouts anyway) -- cards show
"Up to $500 per brand goal retained" and track goal progress only.

Report-export gotcha (applies to every file from this BI tool's
grouped "Saved Reports" view, watch for it on refreshes): the CSV
flattens the on-screen subtotal rows into ordinary data rows -- the
first row of each District Manager block is the DM total, and the
first row of each rep's contiguous run is that rep's total, both
carrying a borrowed brand label and an empty Goals cell. Verified
against Gavin's screenshot of the off-prem MC report (e.g. "Chris
McCrohan,Robin Feldman,Peroni,123" is the McCrohan DM TOTAL, not a
Robin Feldman row; Michael Harboy's run starts with TWO subtotal rows
-- DM 33 then rep 27 -- before his real brand rows).
_strip_report_subtotals() in generate.py removes both layers
positionally; any (rep, brand) duplicate surviving the strip prints a
WARNING (export shape changed) and is summed rather than dropped.
Goalless rows that are NOT subtotals (a real brand row with no goal
assigned, e.g. Robin Feldman's on-prem Coors Light, 13 buyers) are
kept and shown as "No goal set for this brand", excluded from the %
math.

1. MOLSONCOORS DISTRO REWARDS -- RETENTION (slides 14-15) [BUILT]
   - Retain window 7/27-10/31/2026 (base period 5/1-7/26 off /
     5/1-7/31 on, per the files' own column headers); the deck's
     "Retain Goals July 27 - Oct 25" period.
   - Up to $500 per brand goal retained; house goals must be achieved
     for full payout, 50% for qualifying reps if missed.
   Files: mc_retention_off_prem.csv (Placements by DM/rep/brand,
   brands Coors / Peroni / Fever Tree) and mc_retention_on_prem.csv
   (draft Buyers by rep/brand, all Keg Beer rows; brands Blue Moon /
   Coors / Coors Light / Lite / Peroni).

   EXPORT SHAPE CHANGED 2026-09-04 -- these two now come from the BI
   tool's GROUPED export (an .xlsx tree: one combined "DM / Rep / Brand"
   column, level implied by position) instead of the FLAT one. Run
   convert_mc_retention.py on the two workbooks to regenerate both CSVs;
   see that script's docstring for how levels are resolved and proven.
   Two things to know about the coupling it creates:
     - The converted CSVs contain ONLY real data rows. The flat export
       carried the on-screen subtotals flattened into ordinary rows, and
       _strip_report_subtotals() dropped them positionally -- run that
       over an already-clean file and it eats the first real brand row of
       every rep, so build_mc_retention() passes pre_stripped=True. The
       other three retention programs still get the flat export and keep
       the positional strip; nothing about them changed.
     - Dropping a FLAT export back over these CSVs without converting is
       the dangerous mistake: its subtotal rows would be read as data and
       roughly TRIPLE the totals (2,387 -> 6,809 placements, seen while
       building this). _parse_retention_goals() now hard-errors on a
       duplicate (rep, brand) when pre_stripped is set, which is exactly
       that file's signature, rather than silently summing.
   ON-PREM BRAND ROWS DO NOT SUM TO THE REP'S OWN TOTAL, and that is
   correct: Buyers is a DISTINCT ACCOUNT count, so an account pouring
   both Coors Light and Blue Moon is one buyer on the rep's line and a
   buyer on each brand's (Allison Scott: brands sum to 164, her rep line
   says 72). Off-prem Placements ARE additive. convert_mc_retention.py
   reconciles each side accordingly -- exact sums off-prem, and on-prem
   only the bound (a distinct count sits between its biggest single
   brand and the sum of all of them). Worth remembering before
   "fixing" any on-prem total that looks too big.
   On-prem "Coors" is displayed
   as "Coors Banquet" and "Lite" as "Miller Lite" -- the deck's draft
   brand list (Coors Lt, Banquet, Miller Lite, Blue Moon, Peroni)
   pins the mapping; off-prem "Coors" is left as-is. NOTE/open
   question for Gavin: the deck's OFF-prem brand list is Coors Lt,
   Miller Lite, Blue Moon, Peroni, Fever Tree, but the off-prem file
   only carries Coors / Peroni / Fever Tree -- built from the file as
   source of truth.
   Built: per-rep brand-goal rows (current vs goal, % bar, Retained
   badge), Where You Stand tiles (goals retained x/y, off-prem % of
   goal, on-prem draft % of goal), leaderboard ranked by overall % of
   goal (sum of actuals / sum of goals across both channels, goaled
   rows only; reps with no goals excluded). A channel with no rows for
   a rep renders a "No Goals On File" n/a block (e.g. Allison Scott
   off-prem, Dave Ehlers on-prem). No logo asset yet (network policy
   blocked fetching one) -- add assets/logos/molson_coors.png and a
   PROGRAM_LOGOS entry if Gavin supplies one.

2. MARK ANTHONY (MABI) MADE DISTRO REWARDS -- RETENTION
   (slides 22-23) [BUILT, MADE off-premise only]
   - Retain window 6/1-8/31/2026 (base period 2/1-5/31), the deck's
     "REWARDS RETAIN GOALS June-Aug" period.
   - Deck rule: RETAIN 90% of distribution goals (not 100% -- this is
     MABI-specific and differs from MolsonCoors), up to $500 max payout
     for the MADE/INNOV goal. House goal 8,440 MADE PODs must be
     achieved for full payout + bonus, 50% for qualifying reps if
     missed. Bonus: reps achieving all 3 periods earn an extra $500
     (not tracked -- needs the earlier periods' results).
   Files: mabi_retention_made.csv (the report) and
   mabi_made_product_list.csv (the 69-SKU qualifying MADE product list
   with each SKU's company-wide Case Equiv 2026).

   DIFFERENT REPORT SHAPE from MolsonCoors -- read this before
   refreshing: the goal is ONE overall MADE placement goal per rep, and
   it sits on that rep's flattened TOTAL row; the rows beneath it are
   that rep's per-SKU breakdown (which carry no goals at all). So this
   file needs the totals KEPT, not stripped. _split_report_subtotals()
   in generate.py does that (returns {rep: total_row}, [detail rows]);
   _strip_report_subtotals() -- used by MolsonCoors, where goals sit on
   the real brand rows -- is now a thin wrapper around it. Verified on
   the 2026-08-19 pull: all 27 rep-total rows equal the exact sum of
   their own product rows, and no rep appears in two separate blocks
   (a warning prints if either assumption breaks).
   Both subtotal layers borrow a label from their biggest child (the
   Paul Deady DM total row is labeled "Shane Barreca", rep totals are
   labeled with the rep's top SKU), same artifact as the MC files.

   Built: house-goal banner (company-wide placements vs 8,440 --
   ACHIEVED at 8,603 on the 2026-08-19 data), Where You Stand tiles
   (placements vs goal, % of goal with the 90% line called out, re-buys,
   SKUs placed of 69), a progress bar stating what 90% of THEIR goal is
   in placements, a collapsible per-SKU list (placements + re-buys), and
   an opportunity list of qualifying MADE SKUs the rep has ZERO
   placements on -- ranked by that SKU's company-wide 2026 case volume,
   the same "worth a pitch" proxy Lytt's whitespace list uses. This list
   is honest because the product list IS the qualifying universe:
   verified every SKU appearing in the report is on the product list
   (2 list SKUs -- 8431, 8504 -- appear for nobody).
   Leaderboard ranks by % of MADE goal; the 4 reps with activity but no
   goal (Robin Feldman, Allison Scott, Nick Melissari, Paul Mclaughlin
   on this pull) show a neutral "No goal set" card and are excluded from
   ranking, same treatment as MC's goalless brand rows. The 3
   territory-blocked reps aren't in the file at all, which independently
   corroborates the Core Market restriction.
   No $ total computed: "up to $500 max payout" isn't a per-placement
   rate. NOT built (no data): the INNOVATION goal (2,310 PODs -- its own
   product list/report hasn't been sent) and the deck's on-premise piece
   ($25 per new Black Cherry non-buy, $10 per new White Claw flavor,
   on-prem goal 410) -- this report is MADE off-premise placements only.

3. CONSTELLATION "FAST START" DISTRO REWARDS -- RETENTION
   (slides 18-19) [BUILT, OFF-PREMISE only -- on-prem files coming]
   - Retain window 6/1-8/31/2026, the deck's "REWARDS RETAIN GOALS
     June-Aug" period. Qualifying bar is 90% of goal (same as MABI).
   - Up to $500 for the period; reps who achieve all 3 periods earn an
     additional $500 (not tracked -- needs the earlier periods).
     Achieving Spring goals also enters the MLB All-Star trip raffle.
   - House goals must be achieved for full payout, 50% if missed.
   Four files, one per off-premise goal category, with the deck's own
   slide-18 house goals baked into generate.py's
   CONSTELLATION_OFF_CATEGORIES:
     constellation_corona_gaintain_off.csv   house goal 1,575
     constellation_modelo_gaintain_off.csv   house goal 2,400
     constellation_impact_off.csv            house goal 3,220
     constellation_innovation_off.csv        house goal 1,200
   Same report shape as MABI (rep-total row carries the goal, per-SKU
   rows beneath) but with NO District Manager column -- so
   _split_report_subtotals() is called without dm_col. Verified on the
   2026-08-19 pull: in all four files every rep total equals the exact
   sum of its own product rows and no rep appears in two blocks.

   Built: a multi-goal house block (houseGoalBlock() in index.html --
   one compact row per category with its own bar, rather than four
   full-width banners), Where You Stand tiles (category goals retained,
   overall % of goal, total placements), a Your Category Goals list
   (placements vs goal, bar, Retained badge, "N more to reach 90%"),
   and a per-category SKU accordion. Leaderboard ranks by overall % of
   goal = placements in GOALED categories / sum of those goals (a
   category with no goal is excluded from the % on both sides, so the
   figure compares like with like; its placements still show in the
   total-placements tile and the accordion).
   HOUSE STATUS on the 2026-08-19 data: Impact (3,449/3,220) and
   Innovation (1,252/1,200) are MET; Corona Gaintain (1,534/1,575) is
   41 short and Modelo Gaintain (2,350/2,400) is 50 short -- the card
   states the exact shortfall so reps can see what the house still
   needs. House totals are roster-only (non-reps excluded as always;
   John Neukum's rows are the only such rows in these files).
   Per-rep: 65 of 69 category goals are at 90%+; the four below are
   Dylan Rubino + Jaime Colonna (Impact) and Mike Ast + Michael Harboy
   (Innovation). 18 reps have goals; Allison Scott and Paul Mclaughlin
   have no rows in these off-premise files at all (Allison Scott has no
   off-premise accounts, which matches her Boston Beer package n/a) --
   worth re-checking once the on-premise files land.
   No $ total computed ("up to $500 max" is not a per-placement rate).

   ON-PREMISE (added 2026-08-19, two more files, two more shapes):

   constellation_packages_on.csv -- the simplest file in the dashboard:
   one row per rep, one COLUMN per brand (Corona Extra, Modelo Especial,
   Corona Light, Corona Premier, Pacifico, Corona NA, Sunbrew, Modelo
   Oro), values are June-August buyer counts. No subtotal rows and NO
   GOALS COLUMN. So the card shows buyer counts per brand and says so
   plainly ("this report carries no per-rep goals"). OPEN WITH GAVIN:
   (a) are per-rep on-premise package goals coming, and (b) how do these
   8 brand columns map to the deck's on-prem package goals (GAINTAIN pkg
   1,340 / IMPACT pkg 600 / INNOVATION 165)? A mapping was deliberately
   NOT guessed -- Pacifico in particular is ambiguous (off-prem
   Innovation only includes the 7oz Pacifico).

   constellation_new_draft_distro.csv -- RDE "Constellation: New Draft
   Distro (Summer 2026)", the NEW side of draft. (Renamed 2026-08-25 from
   constellation_draft_on.csv, which was a misleading name once the actual
   "Draft ON" report arrived as a separate file -- see point 5 below.)
   Account-level draft rows grouped
   rep -> (brand, package) -> customer, with TWO subtotal layers: first
   row of each rep run = rep total, first row of each (rep, brand,
   package) run = block subtotal, both borrowing their top customer's
   name. Verified 2026-08-19: all 119 block subtotals equal their leaf
   sums, and every rep's Current Units total equals its leaf sum.

   CRITICAL SEMANTIC (cost an hour to spot -- do not lose it): "New
   Buyers" is a DISTINCT-ACCOUNT count at every grouping level, NOT a
   summable measure. Summing it across blocks double-counts an account
   that went new on more than one brand or keg size -- Shane Barreca is
   7 new ACCOUNTS but 12 new LINES. Leaf rows are only ever 0 or 1, so
   new lines = leaf rows with New Buyers = 1 and new accounts = distinct
   customers among them; the report's own rep-total row equals the
   distinct-account count for all 21 reps, which is what proves the
   semantics. The deck pays per LINE ("$100 for Targeted Draft Line"),
   so both numbers are carried and labelled separately on the card.

   Built (deck slide 20), activity only -- no goals or house gates on
   this side per Gavin: new-line counts ($100 targeted / $50 other),
   each new line's barrels (Current Units x keg size via the existing
   keg_bbl(); the file has 15.5 Gal and 1/4 BBL kegs), the 4+/8+ barrel
   bonus tier each line has reached ($200/$400 targeted, $150/$250
   other, halved on 1/4 and 1/6 kegs per the deck), and a "New Lines
   Closest To A Barrel Bonus" list. 26 leaf rows carry NEGATIVE units
   (returns/credits) and are passed through as-is rather than clamped.

   ALL FOUR DRAFT-SIDE QUESTIONS RESOLVED BY GAVIN, 2026-08-19 (asked
   the same day they were built):
     1. TARGETED BRAND = Modelo Especial only ("keep as is"). Slide 20's
        "MODELO TARGETED NEW LINE REWARDS" plus slide 18 listing "Modelo
        Draft" and "Negra Draft" separately -- so Negra pays the $50
        non-target rate. CONSTELLATION_TARGETED_DRAFT_BRAND holds this.
     2. BARREL BONUS IS PER LINE, not per account ("per line") -- so it
        differs from 1911/Woodchuck, whose barrel thresholds are per
        ACCOUNT. Each new line's own barrels drive its 4+/8+ tier, and
        the deck's "1/4 & 1/6 half payout" halves it on small kegs.
        No $ total is summed.
     3. NO GOALS ON THE DRAFT SIDE ("dont include any goals"). An
        earlier build showed a house-goal block using slide 18's draft
        numbers (Modelo 240, Corona Lt 50, Pacifico 57, Negra 15,
        Premier 5) matched to distinct draft accounts; Gavin said not to
        carry goals here at all, so that block and
        CONSTELLATION_DRAFT_GOALS were removed outright. The draft
        section now tracks activity only -- new lines, barrels, bonus
        tiers. Do NOT reintroduce deck numbers as stand-in goals.
     4. WINDOW IS JUNE-AUGUST, same as the package file -- Gavin: "draft
        has date range as package i just didnt show it in report". The
        file genuinely has no date columns; slide 20's March-May text
        refers to the earlier phase, not this pull.
     5. TWO DRAFT FILES, AND THEY WERE BUILT BACKWARDS ONCE (corrected
        2026-08-25). Constellation now sends two separate draft reports and
        the names are easy to swap -- they were swapped on the first build,
        so read this before touching either:
          data/constellation_new_draft_distro.csv   RDE "Constellation: New
            Draft Distro (Summer 2026)" -- the NEW buyers. Account-level,
            drives the "New Draft Buyers & Barrel Bonus" block.
          data/constellation_draft_on_buyers.csv    RDE "Constellation:
            Draft ON (Summer 2026)" -- the REGULAR (total) draft book, a
            per-rep buyer count by brand. Drives the "Draft Buyers By
            Brand" block.
        Gavin, 2026-08-25: "1st i mentioned [New Draft Distro] is new and
        has no goals and 2nd i mentioned [Draft ON] is regular buyers. no
        goals at rep level, just brand level for regular. There are no
        goals are are just tracking new buyers of constellation draft."
        The first build had the Draft ON file labelled as the new buyers
        and the distro file headlined as "New Draft Lines" -- both wrong.
        Neither file has any usable goals: Draft ON ships Goals / % of
        Goals columns beside every brand with EVERY cell blank, and both
        builders ignore those columns outright rather than rendering a wall
        of 0% (consistent with point 3, which still stands).

        HEADLINE NUMBER ON THE NEW SIDE IS NEW BUYERS, i.e. distinct new
        accounts (draftNewAccountCount), NOT new lines. That is what the
        RDE report's own rep-level "New Buyers" figure is -- verified rep
        for rep against the report: all 18 roster reps match, house 90
        (86 on-roster; Default 2, Chris Politano 1, Office Tell Sell 1 are
        dropped as usual). The leaf sum and the leaf row count both come
        to 109 and overstate it, because an account going new on two
        brands appears twice -- see the CRITICAL SEMANTIC note above. New
        lines are still shown, as the secondary number, because the deck
        pays per LINE.

        The two files measure different things and do not reconcile:
        checked rep by rep, Draft ON's counts match neither the distro
        file's distinct-account count nor its summed New Buyers on 46 of
        60 rep/brand pairs. Do not try to derive one from the other.

   The rep scoreboard spans both channels (off-prem goals retained,
   off-prem % of goal, on-prem package buyers, new draft lines) because
   several reps work only one side -- Allison Scott has no off-premise
   rows at all and Nick Melissari / Robin Feldman / Paul Mclaughlin are
   likewise on-premise-heavy, which also explains their absence from the
   four off-premise files noted above. Each tile states why it is N/A
   instead of showing a hollow zero.

4. YUENGLING ON & OFF PREMISE DISTRO REWARDS -- RETENTION
   (slides 28-29) [BUILT -- off-prem, on-prem packages, on-prem draft]
   - Retain window 6/1-8/31/2026 (the draft file's load-sheet dates run
     6/1-8/20, which is what pins the window). 90% retention threshold
     per slide 28's Jun-Aug column. Up to $500 per brand goal retained;
     reps achieving all 3 periods earn an additional payout (not
     tracked -- needs the earlier periods).
   Five files:
     yuengling_retention_off.csv            3 brand goals off-premise
     yuengling_retention_customers_off.csv  off-prem retention list
     yuengling_retention_packages_on.csv    2 brand goals on-premise
     yuengling_retention_customers_on.csv   on-prem retention list
     yuengling_retention_draft_on.csv       load-sheet draft units
   Off-prem brands: Lager 16oz 12pk Can / Flight Packages / Light Lager
   Packages. On-prem package brands: Lager Package / Flight Packages.
   Both placement files use the familiar flattened shape (rep-total row
   carries that rep's goals, account rows beneath); verified 2026-08-19
   that every rep total equals the sum of its own account rows in both.
   The two customer-list files carry the same first-row artifact (it
   duplicates an entry from the alphabetical list below it), stripped
   the same way.

   FIRST SUPPLIER-PROVIDED TARGET LIST IN THE DASHBOARD: the customer
   lists are literally "Retention Account List", so a listed account
   with zero placements is a real at-risk account, not an inference --
   no fabrication caveat needed, unlike the customer-base-derived target
   lists used elsewhere. Each channel's card shows "Retention Accounts
   With Nothing Yet" from exactly that. On the 2026-08-19 pull: 196 of
   250 listed accounts held, 54 at risk (Robin Feldman alone has 14 of
   56 with nothing).
   On-premise, every account with placements is on the list. OFF-premise
   they diverge slightly -- 9 reps have accounts with real placements
   that are NOT on their retention list (e.g. Jayson Romine's Market
   Place Liquor). Those are surfaced in a note under the brand goals
   rather than silently dropped; worth asking Gavin whether the off-prem
   list needs a refresh.

   NO HOUSE GOALS SHOWN. Slide 28's numbers (off: Lager 48, Flight 100,
   Lt. Lager 35; on: Lager Draft 12, Flight Draft 10, Lager Package 40,
   Flight Package 20) do NOT reconcile with these files -- summing every
   rep's own goal gives 44 / 101 / 67 off-premise and 102 / 29 on-prem.
   Per Gavin's standing instruction from the Constellation draft ("dont
   include any goals"), deck numbers are not used as stand-ins.
   The DRAFT file likewise has no goals column, so that side tracks
   activity only: Lager/Flight units by account, load-sheet counts and
   last-load date, plus a "Draft Accounts With No Units This Window"
   list. Same treatment Gavin set for Constellation draft.

   Status on the 2026-08-19 pull: 27 of 49 brand goals at 90%+ across
   17 reps -- the first retention program where reps are materially
   behind (MolsonCoors aside), so the cards lead with what each brand
   still needs.

5. PERONI & BANQUET ON-PREMISE TARGET DRAFT REWARDS (slide 16)
   [NO SEPARATE FILE -- already covered by the MolsonCoors ON file]
   Per Gavin, 2026-08-19: "the peroni and banquet draft is in the
   'Molson Coors ON Retention Rewards w/ Goals (August-October 2026)'
   under the reps live 'Peroni' and 'Coors'. coors = coors banquet."
   So slide 16's two brands are the Peroni and Coors rows of
   mc_retention_on_prem.csv, which the MolsonCoors card already tracks
   as draft buyer goals (and which already relabel "Coors" to "Coors
   Banquet" -- a mapping inferred from the deck on 2026-08-19 and now
   confirmed by Gavin directly). No separate program was built: a second
   card over the same two brands would double-count them.
   What is NOT tracked from slide 16, because the MC ON file has no
   account/line/keg detail -- only buyer counts vs goals: the $100
   targeted / $50 non-target NEW LINE rewards and the barrels-sold
   retention bonus (4+ bbl $200/$150, 8+ bbl $400/$250, half on 1/4 &
   1/6). Those would need an account-level draft export like
   Constellation's (constellation_new_draft_distro.csv) -- ask Gavin if he wants
   that piece tracked.

NOT part of this dashboard:
  - iSellBeer Summer Display Auction (slides 14-15, Sales Rep + Sales
    Associate versions) -- already covered by the separate
    isellbeer/display-auction-tracker/, not duplicated here.
  - Chelada / Corona Premier Summer of Success Volume Rewards (slides
    24-25) -- not requested.

"Data refreshed" date (added 2026-08-10): generate.py now stamps
today's date into the header's "Data refreshed" pill on every run
(datetime.date.today(), written between the <!-- DATA_REFRESHED_START
--> / <!-- DATA_REFRESHED_END --> HTML comment markers, same
find-and-replace-between-markers pattern as PROGRAM_DATA). No more
manually editing that string by hand.

Territory blackout (added 2026-08-10, per Gavin): some brands are
"Core Market" authorized -- sellable ONLY in Bergen, Passaic,
Passaic-FF, Sussex, Morris 1, and Morris 3 -- while others are "All
Counties" (sellable everywhere). A rep whose entire route falls
outside Core Market territory (e.g. Alex Rodriguez: Union/Essex/
Middlesex only) can never earn anything on a Core Market program, and
showing them a "$0 / no activity" card read as underperformance
rather than the structural ineligibility it actually is. Confirmed
via kohler_brands_whitelist_blacklist.xlsx (kept in data/ for
reference/audit only, NOT parsed programmatically -- same treatment
as MPOs/on-prem's copy of this workbook): every brand family used by
Boston Beer Draft Blitz, Sam Adams Octoberfest, New Belgium Draft,
New Belgium Distribution, and Sun Cruiser Volume is tagged "Core
Market" in the workbook's "Brand Family Territory (Enc)" sheet, and
every Core Market brand is blacked out in the exact same six
counties (Essex, Hudson, Middlesex, Morris 2, Rockland, Union) per
the "Blackout Brand Fam Areas (Enc)" sheet -- i.e. authorized in
exactly the same six-county set already used elsewhere in this repo
(MPOs/on-prem's ALLOWED_TARGET_COUNTIES). Lytt Launch was added to
the same restriction 2026-08-10 per Gavin directly ("Lytt is core
market (Boston Beer Company brand)") -- Lytt isn't in the whitelist
workbook itself (too new), so that one entry rests on Gavin's word
rather than the workbook, unlike the other five. 1911, Woodchuck,
Molly's, and both Garage Beer programs are "All Counties" brands and
were never in scope for this; Tona and YaVe Tequila were confirmed
"All 7 counties" by Gavin the same day, so they're deliberately not
in scope either.

Retention programs (added 2026-08-19) are all Core Market per Gavin, so
every one of them goes in CORE_MARKET_PROGRAMS in generate.py. That is
now the ONLY place to add a program: generate.py emits
CORE_MARKET_PROGRAM_KEYS (which drives the amber "Core Market" pill)
into the PROGRAM_DATA block from the same set that drives eligibility.
Hand-maintaining the JS copy silently mislabelled the Mark Anthony and
Constellation pills as "All Counties" while their eligibility blocking
was correct, so the two were single-sourced on 2026-08-19.

Rather than parsing the workbook, generate.py's load_core_market_reps()
(see CORE_MARKET_PROGRAMS docstring in generate.py for the full
reasoning) exploits a shortcut: both customer_base_off_prem.csv and
customer_base_on_prem.csv are ALREADY pre-filtered to exactly that
six-county Core Market set (verified 2026-08-10 -- neither file has
ever contained a non-Core-Market county), so a rep's mere presence in
either file already proves they have a Core Market account. No
county-name matching or workbook parsing needed. A rep with accounts
in both Core Market and non-Core-Market counties is still fully
eligible (per Gavin, 2026-08-10: any Core Market account is enough,
no partial-eligibility treatment).

For an ineligible rep, each of the six affected programs' cards
(cardBostonBeer/cardSamAdams/cardNewBelgium/
cardNewBelgiumDistribution/cardSunCruiser/cardLytt in index.html)
render territoryBlockedCard() instead of their normal metrics -- a
plain "Not Eligible -- Outside Your Territory" notice naming the
brand and the six allowed counties, rather than a misleading all-zero
card. All six programs' overview-tile descriptions also got a
one-line note about the Core Market restriction so reps understand
upfront why a tile might not apply to them.

RESOLVED 2026-08-10: Tona, Lytt, and Yave's territory status (an open
gap when this feature first shipped, since none of the three appear
in kohler_brands_whitelist_blacklist.xlsx) was confirmed directly by
Gavin the same day -- Lytt is Core Market (now in
CORE_MARKET_PROGRAMS), Tona and YaVe Tequila are All 7 Counties (no
restriction, left out of CORE_MARKET_PROGRAMS same as 1911/Woodchuck/
Molly's/Garage Beer).

Ranking pages / leaderboards (added same day, 2026-08-10, per Gavin:
"alex rodriguez shouldn't be the leader for any boston beer company
incentives as he can not sell this brand on his route"): rankProgram()
in index.html now excludes any rep with territoryEligible===false
entirely -- not just from the "leader" preview on the overview tile,
but from the full ranked list on the program's detail page too, and
from the tile's "N reps tracked" count. An ineligible rep's metric is
always a default/zero value (they structurally can't generate real
activity), so leaving them in the ranking let them "win" against
genuinely-active-but-currently-behind eligible reps whenever the
latter's growth metric went negative (confirmed live: Sam Adams'
leader was Alex Rodriguez at a hollow "0 case growth" before this
fix, ahead of every real rep who was mid-negative -- since-fixed to
John O'Donoghue).

"Scoreboard" redesign (2026-08-17, per Gavin: reps found the layout
text-heavy and had to read multiple sections to find what they needed
to do): every program card was rebuilt around a shared set of
components in index.html -- earnBlock() (one card per distinct way a
program pays out: big "EARN $X" rate badge, big current-progress
numbers, a big green "Total Earned" $ figure computed from the real
rate x real count, optional numbered "What You Need To Do" steps for
gated programs, and an optional "Where To Win Next" opportunity list),
rankHero() (a trophy banner showing "You're #N of M reps" + top-X%
percentile, computed live via the existing rankProgram() so no
program-specific leaderboard field is needed), and qualifierBanner()
(a locked/unlocked gate banner for programs where one qualifier
switches on every payout at once, e.g. Tona's 20-case minimum). The
old metricRow()/detailBlock()/draftAccountsBlock()/pkgKegSectionLabels()/
nbRateCol() helpers and their CSS are gone -- fully replaced, not
running in parallel. "Reps tracked" was dropped from the overview
tiles' leader line per Gavin's request the same day.

Program-specific redesign (2026-08-18, per Gavin, from his full review
of the live dashboard against the deck): the dashboard no longer forces
one generic layout onto every incentive -- each card is shaped by that
program's actual mechanic, around four fixed questions in order: WHAT
YOU NEED TO DO / YOUR PROGRESS / YOUR ACTIVITY / WHERE TO WIN NEXT.
The specific rules he set:

  1. Standard definition of "new" (base period 5/1-7/31/2026,
     distribution period Aug 2026, unless a program's own rules say
     otherwise -- Molly's 90-day window and Sam Adams' YoY compare are
     the two exceptions): an account is a new buyer/placement/POD only
     if it had ZERO qualifying purchases during May-July. This was
     already how classify_by_customer/classify_dual computed "new";
     the card copy now states it consistently.

  2. NO win-back sections on new-placement-only programs (1911,
     Woodchuck, Tona): prior buyers can never re-qualify as "new", so
     the old lapsed/"Win Back" lists were dropped from generate.py
     output entirely. Their opportunity sections are now offPremTargets/
     draftTargets/targets24oz -- customer-base accounts with zero
     qualifying activity in EITHER period (true still-live new-placement
     candidates), capped at 20, ranked by the account's own 2026
     all-product case volume. CAVEAT (supersedes the "honesty note"
     below, per Gavin's explicit ask for "eligible non-buyer" lists on
     these programs): the customer-base files only cover the six Core
     Market counties, so for All-Counties brands these target lists
     cover the rep's Core Market accounts only, not their whole route.
     A full-route account export would make them complete.

  3. Win Back / Rebuy sections ONLY where the program actually pays for
     rebuys or retention -- and there they're reframed as money on the
     table, not "win back": Boston Beer draft ("Accounts To Rebuy --
     $50 Each", from draftLapsed), New Belgium featured draft ("Kegs To
     Rebuy -- $50/$25"), Molly's ("Accounts To Rebuy -- $10/Case").
     Boston Beer package (no rebuy $ in the deck) lost its win-back
     list and keeps only the whitespace target list.

  4. Product-organized cards (requests 7-8): Sam Adams Octoberfest now
     renders per-product expandable rows (2025 vs 2026 vs difference,
     expanding to the accounts driving each product -- new
     octoberfestByProduct field in generate.py) plus a "Where You Can
     Close The Gap" list (accounts behind last-August pace). Fall
     Seasonal groups its placements by product client-side, one
     expandable row per product/keg SKU.

  5. Lytt got the "YOU ARE HERE" treatment (request 9): big penetration
     %, x-of-y accounts, three tier chips (reached/next/locked), a NEXT
     GOAL box computing how many more accounts are needed, and
     collapsible Accounts Buying / Accounts Still Available lists
     (whitespaceAccounts is now the FULL list, not top-15).

  6. Woodchuck's 3-placement minimum is now a program-wide qualifier
     banner gating all payouts (deck: "3 placements minimum for any
     payout"), counting package + draft new placements combined --
     replacing the old case-bonus-only gate on package placements.

  8. "Where You Stand" scoreboard (added later on 2026-08-18, per
     Gavin's follow-up review): every card now opens with a statBoard()
     of large color-coded stat tiles -- the rep's key numbers for THAT
     program (placements, cases/CE, buyers, kegs, qualifier progress,
     YoY difference), chosen per incentive. Status colors: green =
     achieved/qualified/unlocked, amber = in progress or short of a
     goal (with a "N more to X" sub-line), red = behind (negative YoY
     only). Neutral (no color) = a zero count with no goal attached,
     deliberately, so a quiet program doesn't read as an alarm wall.
     Card flow is now: pitch (what to do) -> scoreboard (where you
     stand) -> earn blocks (details). The per-rep qualifier BANNERS
     (Woodchuck 3-placement, Tona 20-case, Sam Adams commission flag)
     were folded into their scoreboard tile to avoid double-rendering
     the same fact; company-wide gates (New Belgium 70-POD house goal,
     Garage Beer President's 9,305 CE house goal) stay as banners since
     they aren't the rep's own number. Lytt's tier hero IS its
     scoreboard (the big % is now tinted green once a tier is reached,
     amber while short of the first tier).

  7. Mobile-first pass: fonts inside cards bumped throughout (detail
     rows 16.5px, notes/labels 14-15px, stat numbers 42px), 44px+ tap
     targets, activity/opportunity lists collapsed by default behind
     one big count-labeled button ("Your New Accounts [6]"), and the
     earn-head stacks vertically under 820px so rate notes never clip.

  8. Navigation scroll (2026-08-20, per Gavin -- reported from phone/
     iPad): tapping a program tile used to run
     window.scrollTo({top:0}), which lands ABOVE the crumb, hero
     banner, page header, and the whole "Start Here" rep picker. On an
     iPhone <main> starts ~1800px down the page, so a rep had to
     scroll back down roughly two screens to reach the leaderboard
     they'd just asked for. Program tile clicks and the "< All
     programs" back button now call scrollToContent(), which scrolls to
     the top of <main> instead, so the program (or the program grid on
     the way back) starts at the top of the viewport. Verified in
     Chromium at 390x844 and 820x1180.

     Deliberately NOT changed: the Home/Reset button still goes to the
     true document top (that's what Home means), and the rep-name chips
     still do too -- the repbar sits directly above <main>, and nobody
     has complained about that one. If the same annoyance comes up for
     rep chips, point them at scrollToContent().

Month tabs (2026-08-18, per Gavin): the header's redundant eyebrow
line was removed and replaced by a month tab under the "Incentive
Tracker" title -- currently a single active "August 2026" tab. Gavin
plans to keep this page running month over month (September incentives
next), so when a new month's programs arrive, the expected shape is:
add the new month's data files + builders, keep each month's
PROGRAM_DATA separable, and turn the tab row into a real switcher
(the CSS -- .month-tabs/.month-tab(.active) -- is already built for
multiple tabs). Ask Gavin whether August should stay browsable or be
archived when September ships.

DM grouping + territory pills (2026-08-18, late, per Gavin): the rep
pills in the START HERE panel are grouped under each District Manager's
name (label only, not clickable) so reps find themselves faster.
Mapping source: mid-year-review/district_manager_trend.csv (District
Manager + Sales Rep Assigned), cross-checked against the tap-survey and
display-photo exports -- all 27 roster reps land in 5 DM groups (Chris
McCrohan, Denise Montes, Mike Engel, Mike Kennedy, Paul Deady); a
defensive "Other" group catches any future roster rep missing from
DM_GROUPS in index.html. Every program name row (tiles, program pages,
rep cards, blocked cards) also carries a territory pill next to the
date tag: amber "Core Market" (tooltip lists the six areas) for the
Core-Market-restricted programs, green "All Counties" for the rest --
driven by the same CORE_MARKET_PROGRAM_KEYS set used for eligibility.

Program-page scoreboard redesign (2026-08-18, evening, per Gavin: the
leaderboard felt like a dense data table): each program's detail page
is now (1) the hero pitch, (2) a big bulleted "WHAT YOU NEED TO DO"
rules block (PROGRAM_RULES in index.html -- short bullets adapted per
incentive from the deck, 18px, no paragraphs), and (3) a scoreboard-
style leaderboard: one row per eligible rep showing rank medal, name,
a color status badge (green = qualified/earning, amber = close with a
literal "N to go" -- "2 placements to go", "1 account to 25%", "6
cases to positive" -- gray = no activity yet), and the 2-3 metrics
that actually explain rank on THAT program (PROGRAM_BOARD in
index.html -- e.g. Woodchuck shows "1 / 3 placements · 20 cases",
Lytt shows "33.3% penetration · 11 / 33 accounts · 66 cases").
Metrics/qualifier fractions are color-coded by the same green/amber/
gray logic. Top 5 shown, rest behind "Show All N Reps". Tapping a row
expands that rep's full program card inline (same cards as the rep
view); "Full Rep Detailed View" still jumps to their rep page. The
old ranking UI -- metric tabs, rank-focus hero with gap chips,
best-opportunity panel, PROGRAM_RANKING_CONFIG/rankByConfig/
rankingHero/nearbyBoard -- was removed outright, not left in
parallel. rankProgram() (with its territory/programEligible
exclusions) still provides the ordering.

Full customer base + route-based eligibility (2026-08-18, later the
same day): Gavin sent "Sales Reps' Customer Base 4" (saved as
data/customer_base_full.csv) -- the COMPLETE account book for every
rep, all counties including the blackout ones, both premises, with two
new columns:
  - Area ("Bergen", "Morris 1", "Morris 2", "Sales", ...): finally
    disambiguates Morris 1/3 (Core Market) from Morris 2 (blackout).
    Rows with Area "Sales" (an internal grouping) fall back to County
    (Bergen/Passaic/Sussex = core).
  - Draft Package: per Gavin -- values starting "1)" or "2)" mean the
    account CAN buy kegs/draft; "3) Package Only" means it cannot.
This file supersedes the two legacy Core-Market-only customer_base_
{off,on}_prem.csv files as the eligibility/target/premise universe
(the legacy files are kept only as a premise-map fallback for account
numbers that have left the current base). Consequences:
  - The item-2 caveat below is RESOLVED: 1911/Woodchuck/Tona target
    lists now cover the rep's whole route, not just Core Market.
  - Draft target lists (1911/Woodchuck draft, Boston Beer draft, New
    Belgium featured) only include keg-CAPABLE accounts -- no more
    telling a rep to pitch a $100 POD at a package-only store.
  - load_core_market_reps() now tests Area membership instead of mere
    file presence (the old shortcut broke once the full file contained
    everyone). Same 3 reps blocked as before: Alex Rodriguez, Andrew
    Lundy, Hakan Sadik.
  - Lytt's penetration denominator moved to the full file filtered to
    core off-premise (same universe, fresher pull -- some penetration
    %s shifted slightly, 5 reps in a tier became 3 on 8/18 data).
  - NEW route-based greying (the "Dave Ehlers" ask -- programs a rep
    structurally can't work look greyed like Alex Rodriguez's):
      WHOLE CARD: New Belgium Draft is 100% kegs, so a Core-Market-
        eligible rep with zero keg-capable core on-prem accounts AND
        no draft activity in the data gets a "Not Applicable -- No
        Draft Accounts On Your Route" card and is excluded from that
        program's rankings (Dylan Rubino, Jayson Romine on 8/18 data).
      SECTION ONLY: 1911/Woodchuck draft blocks (Jayson Romine, Shane
        Barreca), Boston Beer draft (Dylan Rubino) / package (Allison
        Scott -- no off-prem accounts), Yave on-prem (Jayson Romine,
        Shane Barreca) / off-prem (Allison Scott) -- the other side of
        each card stays fully live, and the scoreboard shows a neutral
        "N/A" tile with the reason.
      An activity override applies everywhere: if the RDE data shows
        the rep actually selling in a channel, the channel stays live
        regardless of the base flags (e.g. Dave Ehlers keeps New
        Belgium Draft: his one on-prem account, Lulu Lounge, is
        draft-capable per the flag AND he sold a Voodoo keg -- data
        wins over assumptions).

Opportunity-section honesty note (PARTIALLY SUPERSEDED 2026-08-18 --
the full-file note above resolves the Core-Market-only caveat; see
item 2 for the no-win-back rule on 1911/Woodchuck/Tona): reps
asked for "accounts that don't carry this yet" prospecting lists on
every program. That's NOT
reliably derivable -- every product RDE file only contains rows for
accounts with SOME purchase history (verified empirically: zero rows
have both period columns blank), so an account that never bought a
product simply never appears in that file. The only full-account-book
files (customer_base_off_prem.csv / customer_base_on_prem.csv) are
themselves pre-filtered to the six-county Core Market set (see the
territory-blackout note above), so they're only a valid "eligible
universe" for Core-Market-restricted brands, not All-Counties ones --
using them for 1911/Woodchuck/Tona/Molly's/Garage Beer whitespace
would have silently mispresented a rep's real off-Core-Market book.
Rather than fabricate account names, each program's opportunity
section uses whichever real signal actually fits its data:
  - Dual-period programs (1911, Woodchuck, Tona, Boston Beer, New
    Belgium, Molly's) show "lapsed" accounts -- bought in the base
    period, nothing this period -- as a real win-back list
    (offPremLapsed/lapsed24oz/draftLapsed/packageLapsed/
    featuredLapsed/lapsed in generate.py's byRep output). 1911 and
    Woodchuck's off-premise side switched from the old new_rows_dual()
    helper (which only ever returned the "new" set) to classify_dual()
    so the base_only accounts are available too; Tona did the same.
    new_rows_dual() itself was deleted as dead code once nothing
    called it.
  - 1911/Woodchuck draft still uses draftAccounts' real per-account bbl
    progress for a "Closest To $100/$X00" list -- no data change
    needed there, just re-sorted/re-labeled client-side.
  - Lytt Launch is the one program where true whitespace IS honest,
    because it's Core Market and its eligible-account file (Core
    Off-Prem customer base) really is the correct universe: build_lytt_
    launch() in generate.py now also captures the eligible accounts'
    Customer Name and "Cases   2026" volume (not just Customer Num for
    counting), computes eligible-minus-buying per rep, and exposes it
    as whitespaceAccounts (top 15, sorted by that account's 2026 case
    volume on OTHER products, as a proxy for "worth a pitch").
  - Programs with no account-level data at all (Sam Adams, Garage Beer
    x2, Sun Cruiser aggregated file, New Belgium Distribution) show
    tier/rank-gap framing or (New Belgium Distribution) which of the 5
    core brand families have zero volume this push -- both real,
    neither fabricated.
  - Path to Victory and Yave show their real active/qualifying
    accounts framed as achievements ("Your Active Accounts", "Your
    Qualifying Accounts"), not prospecting, since neither program's
    file has a base period to compute lapsed/win-back from.

Real bug fix found during the rebuild: Tona's original new-placement
count silently ignored its own new_keys filter -- the loop iterated
`by_key.items()` (every 24oz-can account: new, rebuy, AND lapsed)
instead of only the new-classified keys, so every rep's "new 24oz
placements" count (and the $10/placement figure derived from it) was
overstated by counting rebuy and lapsed accounts as new. Company-wide
total on the 2026-08-17 data dropped from 14 to the correct 2 once
fixed via classify_dual(). Nothing else about the qualifier gate,
case-volume rates, or other programs' math changed.

Dollar-earned honesty note: "Total Earned" is only shown where the
deck states an unambiguous rate AND generate.py has the count to
multiply it by. It's deliberately NOT shown for: Path to Victory (no
new-vs-current split possible, and the $ is paid via iSellBeer, not
this tracker), the Sam Adams "double commission" piece (no per-case
commission rate exists to calculate from -- tracked as a locked/
unlocked status only), New Belgium Distribution Push Volume (the deck
excerpt has no stated $ rate for this phase, CE only), and Garage Beer
Summer Sequel (the $1.00/$1.50/$2.00 rate is "per CE over 2025" but
the file's caseEquiv field was never confirmed to BE that growth
figure vs. raw CE -- kept as progress-toward-goal only, same
conservative call the pre-redesign card already made).

Theme: Kohler navy (changed 2026-09-01)
Gavin asked for "black or dark blue... Kohler Distributing color scheme"
in place of the original barrel-wood browns. The whole palette lives in
index.html's :root, so this was a variable swap -- no rule outside that
block carried a brown, and every JS-injected color already resolved to
a var (var(--good)/var(--amber)/etc.).

The blue is anchored, not picked by eye. assets/kohler-logo-badge.png is
57% amber (#E0A050) and 24% blue (#3080F0), and the Sales Pulse template
(.claude/skills/kohler-pulse/assets/pulse-template.html) already carried
--kohler: #14468C. So the surfaces went near-black navy, --accent-deep
became that exact #14468C, and the amber headline + blue accents were
LEFT ALONE -- they are the logo's own two colors, and the navy is a
surface for them rather than a third competing hue.

--accent stayed #4E7CE8 deliberately. Brightening it to clear AA body
text as a link (4.45:1 -> 4.98:1) would have dropped white-on-accent for
the .repchip.active / button backgrounds it also fills (3.91:1 ->
3.49:1), which is the worse trade.

Contrast improved across the board vs. the brown; text-mute crossed from
4.30:1 (just under AA body) to 5.17:1. If you retune these, re-check
text/text-dim/text-mute against canvas, card and card-alt rather than
trusting that a darker background is automatically safer.

Carried to the sibling dashboards the same day, on Gavin's go-ahead:
MPOs/on-prem, MPOs/off-prem and isellbeer/tap-survey-tracking now run
this identical palette, so all four are back in sync -- keep them that
way. Two things those pages needed that this one did not: their
.hero-banner::after scrim hardcodes the canvas colour as
rgba(21,16,10,...) rather than reading the variable (now rgba(8,12,22)),
and the tap tracker has its own variable names plus a fourth surface
(--card3, given #182338 to match the old brown's luminance) and two
hardcoded photo-tile backgrounds. Grep for stray hex values, not just
:root, if this palette changes again. (summer26 and the display auction
tracker were never brown; they use a neutral #0C0D11.)
