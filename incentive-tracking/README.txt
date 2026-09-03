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
  retention   The new Sept-Nov period with NEW goals:
              constellation_fall, mabi_retention_fall,
              yuengling_retention_fall, heineken_husa,
              new_belgium_distribution_retain. August keeps showing the
              Jun-Aug period it already tracks -- the two tabs track
              different periods of the same programs, deliberately.

heineken_husa (HUSA SDD) has never been on this dashboard before and is
new in every sense -- no data, no prior period, no card function.

new_belgium_distribution_retain carries a note explaining that its
retain phase does not start until October (the deck runs Achieve
May-Jun, Push Volume Jul-Aug, Retain Oct-Nov), so September is a gap
month for it. It is on the tab because the cover checklist lists NBB
Distro; it will simply have nothing to show until October.

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
   Coors / Coors Light / Lite / Peroni). On-prem "Coors" is displayed
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
