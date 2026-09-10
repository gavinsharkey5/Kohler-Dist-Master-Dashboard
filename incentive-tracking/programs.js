/* ====================================================================
   Incentive Tracker -- PROGRAM LIBRARY (shared with the Incentives & MPO Hub)
   --------------------------------------------------------------------
   Everything that gives the incentive data its MEANING lives here, moved
   verbatim out of index.html on 2026-09-10 so that hub/index.html can read
   the exact same registries, summaries and cards instead of re-deriving
   them:

     ROSTER / DM_GROUPS            who the reps are, grouped by manager
     PROGRAM_LOGOS, terrTag()      brand marks and the territory pill
     PROGRAM_LIST_2026_08 / _09    the per-month program registries
     MONTHS / DEFAULT_MONTH_KEY    month tabs and their rep-card order
     card*() / cardFor()           the full detailed card per program
     rankProgram()                 the leaderboard ranking
     SUPPLIERS / PROGRAM_SUPPLIER  supplier grouping
     PROGRAM_SUMMARY / summarize() the one-line answer + status ladder
     PROGRAM_RULES / PROGRAM_BOARD rules bullets and leaderboard tiles

   This is a classic script, not a module: its top-level const/let/function
   declarations are shared globals, exactly as they were when this code sat
   inline in index.html. It expects PROGRAM_DATA, CORE_MARKET_PROGRAM_KEYS
   and PROGRAM_DATA_2026_09 to be defined BEFORE it loads (index.html embeds
   them inline; the hub loads data/program_data.js, which generate.py writes
   from the same blobs), and it must load BEFORE the rendering script that
   calls into it.

   Rendering (the guided screens, the program leaderboard page, the event
   handlers) stays in index.html. Edit program rules, summaries, cards and
   registries HERE -- both pages pick the change up.
   ==================================================================== */

const ROSTER = ["Alex Rodriguez","Alisa Acciardi","Allison Scott","Andrew Lundy","Anthony Palmisano","Brian Sengebush","Chris Payton","Dan Lagala","Dave Ehlers","Derrick Laws","Dylan Rubino","Hakan Sadik","Jaime Colonna","Javier Melo","Jayson Romine","Jim Heaney","John O'Donoghue","Klejdi Lamo","Matt Powierski","Michael Harboy","Mike Ast","Nick Melissari","Pablo Lopez","Paul Mclaughlin","Phil Ernst","Robin Feldman","Shane Barreca"];

// Rep pills grouped by District Manager (per Gavin, 2026-08-18 -- labels
// only, not clickable, so reps can find their name faster). Mapping from
// mid-year-review/district_manager_trend.csv (District Manager + Sales Rep
// Assigned columns), cross-checked against the tap-survey and display-photo
// sources. Any roster rep missing from this list falls into an "Other"
// group rather than disappearing.
const DM_GROUPS = [
  {dm:'Chris McCrohan', reps:['Allison Scott','Anthony Palmisano','Brian Sengebush','Nick Melissari','Paul Mclaughlin','Robin Feldman']},
  {dm:'Denise Montes', reps:['Derrick Laws','Javier Melo','Jim Heaney','Matt Powierski','Pablo Lopez']},
  {dm:'Mike Engel', reps:['Chris Payton','Dan Lagala','Dave Ehlers','Phil Ernst']},
  {dm:'Mike Kennedy', reps:['Alex Rodriguez','Alisa Acciardi','Andrew Lundy','Dylan Rubino','Hakan Sadik','Jaime Colonna',"John O'Donoghue",'Michael Harboy']},
  {dm:'Paul Deady', reps:['Jayson Romine','Klejdi Lamo','Mike Ast','Shane Barreca']},
];

// Territory pill shown next to each program's date tag: which counties the
// brand can actually be sold in (per kohler_brands_whitelist_blacklist.xlsx
// -- same Core Market set used for the eligibility greying).
// CORE_MARKET_PROGRAM_KEYS is generated into the PROGRAM_DATA block above
// from generate.py's CORE_MARKET_PROGRAMS -- the same set that drives
// eligibility -- so the pill and the blocking can never drift apart.
// Add a program there, not here.
// Programs whose territory scope has never been confirmed with Kohler.
// "All Counties" is a real claim a rep will act on, so these show NO
// territory pill rather than a guess. Delete a key from here the moment
// its scope is confirmed: if it's Core Market it belongs in generate.py's
// CORE_MARKET_PROGRAMS (or _PENDING), and if it's genuinely all counties,
// removing it here is all that's needed.
//
// Confirmed 2026-09-04 against kohler_brands_whitelist_blacklist.xlsx's
// "Brand Family Territory (Enc)" / "Master Matrix View" sheets (the raw
// US-vs-THEM-by-county matrix, not just the summary label) and removed
// from here: keystone_ice + touchdowns_tea (Keystone/Twisted Tea/Sun
// Cruiser are all US in exactly Bergen/Passaic/Passaic-FF/Sussex/Morris 1/
// Morris 3, THEM everywhere else -- Core Market's own definition) and
// printed_menu + bardstown_display (Bardstown Bourbon and Bardstown Green
// River, same pattern -- Core Market); evil_genius, montauk and two_xo
// (all three are US in every county -- All Counties, nothing to add,
// terrTag() shows that pill for any key in neither set by default).
//
// other_half resolved 2026-09-04 the same way Lytt was -- straight from
// Gavin ("other half is all counties of distribution"), since the brand is
// too new to be in the whitelist workbook at all. Removed from this set, so
// it now shows the "All Counties" pill. Note that is the BRAND's sellable
// territory, a different axis from the Southern District payout RATE inside
// build_other_half(), which is still an unconfirmed reading of the deck.
//
// STILL unconfirmed, and not a guess away from being resolved:
//   heineken_husa  The workbook's five Heineken SKUs disagree with each
//                  other's footprint AND with Core Market (Heineken proper
//                  keeps Morris 3 but drops Sussex/Morris 1, which Core
//                  Market has; Dos Equis is narrower still -- Bergen &
//                  Passaic only). HUSA SDD covers multiple brands with
//                  genuinely different territories, so neither pill would
//                  be accurate for the program as a whole.
const TERRITORY_UNCONFIRMED = new Set(['heineken_husa']);

function terrTag(key){
  if(TERRITORY_UNCONFIRMED.has(key)) return '';
  return CORE_MARKET_PROGRAM_KEYS.has(key)
    ? '<span class="prog-tag terr-core" title="Bergen, Passaic, Passaic-FF, Sussex, Morris 1 & 3 only">Core Market</span>'
    : '<span class="prog-tag terr-all">All Counties</span>';
}

const PROGRAM_LOGOS = {
  '1911': 'assets/logos/1911.png',
  'woodchuck': 'assets/logos/woodchuck.png',
  'tona': 'assets/logos/tona.png',
  'path_to_victory': 'assets/logos/victory.png',
  'sam_adams': 'assets/logos/sam_adams.png',
  'sam_adams_conversion': ['assets/logos/boston_beer.png', 'assets/logos/sam_adams.png'],
  'boston_beer': 'assets/logos/boston_beer.png',
  'new_belgium': 'assets/logos/new_belgium.png',
  'lytt': 'assets/logos/lytt.png',
  'fall_seasonal': '../assets/kohler-logo-badge.png',
  'sun_cruiser': 'assets/logos/sun_cruiser.png',
  'yave': 'assets/logos/yave.png',
  'mollys': 'assets/logos/mollys.png',
  'garage_beer_summer_sequel': 'assets/logos/garage_beer.png',
  'garage_beer_president': 'assets/logos/garage_beer.png',
  'new_belgium_distribution': 'assets/logos/new_belgium.png',
  'mc_retention': 'assets/logos/molson_coors.png',
  'mabi_retention': 'assets/logos/mark_anthony.png',
  'constellation_retention': 'assets/logos/constellation.png',
  'yuengling_retention': 'assets/logos/yuengling.png',

  // September 2026. Pulled out of the September Rewards Deck with pdfimages
  // (2026-08-31), trimmed to content and sized to the chip's 196x58 cap.
  // Two needed more than a straight extract: Keystone Ice only appears as a
  // vertical can shot, so it's rotated 90deg for the wordmark to read at chip
  // size, and 2XO is cropped to its wordmark because the full slide art loses
  // it entirely when scaled down.
  'keystone_ice': 'assets/logos/keystone_ice.png',
  'evil_genius': 'assets/logos/evil_genius.png',
  'other_half': 'assets/logos/other_half.png',
  'montauk': 'assets/logos/montauk.png',
  'two_xo': 'assets/logos/two_xo.png',
  // Both Bardstown programs are "Bardstown/Green River" -- one chip can only
  // carry one mark, so both use Bardstown, the lead name in each title (the
  // same way August points two Garage Beer programs at one logo).
  'printed_menu': 'assets/logos/bardstown.png',
  'bardstown_display': 'assets/logos/bardstown.png',
  // Touchdowns & Tea is a Sun Cruiser AND Twisted Tea program, so it carries
  // both marks (2026-09-04). The deck has no Twisted Tea artwork -- its only
  // Touchdowns art is two Sun Cruiser football banners -- so twisted_tea.png
  // is whatever Kohler supplies; drop the file in and it renders. If it is
  // missing the <img> simply fails to paint and the Sun Cruiser mark still
  // shows, so a missing asset degrades rather than breaks.
  'touchdowns_tea': ['assets/logos/sun_cruiser.png', 'assets/logos/twisted_tea.png'],
  // September retention programs are the same suppliers as their August
  // counterparts, so they reuse those marks.
  'constellation_fall': 'assets/logos/constellation.png',
  'mabi_retention_fall': 'assets/logos/mark_anthony.png',
  'yuengling_retention_fall': 'assets/logos/yuengling.png',
  'new_belgium_distribution_retain': 'assets/logos/new_belgium.png',
  // heineken_husa has NO logo on purpose: the September deck's HUSA slide is a
  // goals table with no Heineken artwork anywhere in the file, and progLogo()
  // renders no chip for an unmapped key. Drop a Heineken mark in here if one
  // ever arrives; nothing else needs changing.
};
// A program may carry SEVERAL marks -- Touchdowns & Tea is a Sun Cruiser AND
// Twisted Tea program, and a rep recognises the brand faster than the program
// name. PROGRAM_LOGOS values may be a single path or an array of them;
// progLogos() always returns an array so callers do not branch.
function progLogos(key){
  const v = PROGRAM_LOGOS[key];
  return !v ? [] : (Array.isArray(v) ? v : [v]);
}
function progLogo(key){
  return progLogos(key).map(src =>
    `<span class="prog-logo-chip"><img src="${esc(src)}" alt="" loading="lazy"` +
    ` onerror="this.parentNode.remove()"></span>`).join('');
}
const LYTT_TIER_DEFS = [{pct:0.25,label:"Gettin' Lytt",rate:0.50},{pct:0.50,label:'Lytty City',rate:1.00},{pct:0.75,label:'Lytt-Faced',rate:2.00}];

const PROGRAM_LIST_2026_08 = [
  {key:'1911', group:'new', title:'Beak & Skiff 1911 Rewards', shortTitle:'1911', tag:'Aug–Sept',
   pitch:`Every 1911 SKU you get into an account that didn’t buy that SKU in May–July counts.`,
   getRep:rep=>(PROGRAM_DATA['1911']||{}).byRep?.[rep],
   metric:d=>d.totalNewPlacements, metricLabel:'new placements (packages + draft)', fmt:v=>v.toFixed(0)},
  {key:'woodchuck', group:'new', title:'Woodchuck Cider Rewards', shortTitle:'Woodchuck', tag:'Aug–Sept',
   pitch:`Every Woodchuck SKU you get into an account that didn’t buy that SKU in May–July counts.`,
   getRep:rep=>(PROGRAM_DATA['woodchuck']||{}).byRep?.[rep],
   metric:d=>d.totalNewPlacements, metricLabel:'new placements (packages + draft)', fmt:v=>v.toFixed(0)},
  {key:'tona', group:'new', title:'Tona Distribution & Volume', shortTitle:'Tona', tag:'Aug–Sept',
   pitch:`Get Tona 24oz cans into new accounts and sell 20 cases to unlock every payout.`,
   getRep:rep=>(PROGRAM_DATA['tona']||{}).byRep?.[rep],
   metric:d=>d.caseVolume24oz, metricLabel:'24oz cases', fmt:v=>v.toFixed(0)},
  {key:'path_to_victory', group:'new', title:'The Path to Victory', shortTitle:'Path to Victory', tag:'August',
   pitch:`Track your accounts buying Victory Monkey Family 6pk and 19.2oz cans this month.`,
   getRep:rep=>(PROGRAM_DATA['path_to_victory']||{}).byRep?.[rep],
   metric:d=>d.sixPackAccountCount+d.nineteenTwoAccountCount, metricLabel:'accounts active', fmt:v=>v.toFixed(0)},
  {key:'sam_adams', group:'new', title:'Sam Adams Octoberfest Fast Start', shortTitle:'Sam Adams', tag:'August',
   pitch:`Beat your own Sam Adams numbers from last August.`,
   getRep:rep=>(PROGRAM_DATA['sam_adams']||{}).byRep?.[rep],
   metric:d=>d.octoberfestGrowth, metricLabel:'case growth', fmt:v=>(v>0?'+':'')+v.toFixed(0)},
  {key:'boston_beer', group:'new', title:'Boston Beer August Draft Blitz', shortTitle:'Boston Beer', tag:'August',
   pitch:`New Angry Orchard / Dogfish Head taps pay $100 — and rebuys on existing taps pay $50.`,
   getRep:rep=>(PROGRAM_DATA['boston_beer']||{}).byRep?.[rep],
   metric:d=>d.points, metricLabel:'trip bonus points', fmt:v=>v.toFixed(0)},
  {key:'new_belgium', group:'new', title:'New Belgium Draft (Summer Draft Focus)', shortTitle:'New Belgium Draft', tag:'August',
   pitch:`New Juicy Haze / Two Hearted taps pay up to $100 — rebuys pay too.`,
   getRep:rep=>(PROGRAM_DATA['new_belgium']||{}).byRep?.[rep],
   metric:d=>d.featuredNewCount+d.featuredRebuyCount, metricLabel:'featured PODs', fmt:v=>v.toFixed(0)},
  {key:'lytt', group:'new', title:'Lytt Launch', shortTitle:'Lytt', tag:'Aug–Sept',
   pitch:`The more of your accounts that carry Lytt, the higher your per-case rate.`,
   getRep:rep=>(PROGRAM_DATA['lytt']||{}).byRep?.[rep],
   metric:d=>d.penetrationPct, metricLabel:'penetration', fmt:v=>v.toFixed(1)+'%'},
  {key:'fall_seasonal', group:'new', title:'Fall Seasonal Fast Start', shortTitle:'Fall Seasonal', tag:'August',
   pitch:`Be first to market with the Fall Seasonals — every case and keg pays.`,
   getRep:rep=>{ const po=(PROGRAM_DATA['fall_seasonal']||{}).package_only?.byRep?.[rep]; const pd=(PROGRAM_DATA['fall_seasonal']||{}).packages_and_draft?.byRep?.[rep]; return (po||pd) ? {po,pd} : null; },
   metric:d=>(d.po?.packageCaseEquivalents||0)+(d.pd?.packageCaseEquivalents||0), metricLabel:'package CE', fmt:v=>v.toFixed(1)},
  {key:'le_grand_noir', group:'new', title:'Le Grand Noir Volume Incentive', shortTitle:'Le Grand Noir', tag:'Aug–Oct',
   pitch:`Sell Le Grand Noir — once the house hits 70 cases, every case pays $10.`,
   getRep:rep=>(PROGRAM_DATA['le_grand_noir']||{}).byRep?.[rep],
   metric:d=>d.cases, metricLabel:'cases (Aug–Oct)', fmt:v=>v.toFixed(0)},
  {key:'sun_cruiser', group:'ongoing', title:'Sun Cruiser Volume', shortTitle:'Sun Cruiser', tag:'May–Aug',
   pitch:`Sell more Sun Cruiser than you did last year and get paid on every extra case.`,
   getRep:rep=>(PROGRAM_DATA['sun_cruiser']||{}).byRep?.[rep],
   metric:d=>d.rate1CaseGrowth+d.rate3CaseGrowth, metricLabel:'case growth', fmt:v=>v.toFixed(0)},
  {key:'yave', group:'ongoing', title:'Yave Tequila Launch', shortTitle:'Yave', tag:'Jul–Aug',
   pitch:`Get paid for every new bar or store that starts carrying Yave Tequila.`,
   getRep:rep=>(PROGRAM_DATA['yave']||{}).byRep?.[rep],
   metric:d=>d.onPremAccountCount+d.offPremAccountCount, metricLabel:'qualifying accounts', fmt:v=>v.toFixed(0)},
  {key:'mollys', group:'ongoing', title:"Molly's 1.75L", shortTitle:"Molly's", tag:'Jul–Aug',
   pitch:`New Molly's placements pay $50 — and every rebuy case pays $10.`,
   getRep:rep=>(PROGRAM_DATA['mollys']||{}).byRep?.[rep],
   metric:d=>d.newPodCount+d.rebuyCount, metricLabel:'PODs + rebuys', fmt:v=>v.toFixed(0)},
  {key:'garage_beer_summer_sequel', group:'ongoing', title:'Garage Beer Summer Sequel', shortTitle:'GB Summer Sequel', tag:'Jun–Aug',
   pitch:`Beat your own personal Garage Beer volume goal and your per-case rate climbs through 3 tiers.`,
   getRep:rep=>{ const d=(PROGRAM_DATA['garage_beer_summer_sequel']||{}).byRep?.[rep]; return (d && d.tieredGoal!=null) ? d : null; },
   metric:d=>d.caseEquiv, metricLabel:'CE', fmt:v=>v.toFixed(0)},
  {key:'garage_beer_president', group:'ongoing', title:"Garage Beer President's Incentive", shortTitle:"GB President's", tag:'Jun–Sep',
   pitch:`Once the whole company crosses 9,305 cases of Garage Beer, you get paid on every case you grew over last year.`,
   getRep:rep=>(PROGRAM_DATA['garage_beer_president']||{}).byRep?.[rep],
   metric:d=>d.caseGrowthOverLastYear, metricLabel:'CE growth', fmt:v=>(v>0?'+':'')+v.toFixed(0)},
  {key:'new_belgium_distribution', group:'ongoing', title:'New Belgium Distribution — Push Volume', shortTitle:'NB Distribution', tag:'Jul–Aug',
   pitch:`Track how much Bell's, Kirin, and Voodoo Family volume you're pushing this August.`,
   getRep:rep=>(PROGRAM_DATA['new_belgium_distribution']||{}).byRep?.[rep],
   metric:d=>d.pushVolumeCE, metricLabel:'Aug CE', fmt:v=>v.toFixed(0)},
  {key:'display_auction', group:'ongoing', title:'iSellBeer Summer Display Auction', shortTitle:'Display Auction', tag:'Jul–Aug',
   pitch:`Build big displays, photograph them in iSellBeer, and bank points to spend at the auction.`,
   getRep:rep=>(PROGRAM_DATA['display_auction']||{}).byRep?.[rep],
   metric:d=>d.points, metricLabel:'auction points', fmt:v=>v.toLocaleString('en-US')},
  {key:'mc_retention', group:'retention', title:'MolsonCoors Distro Rewards — Retention', shortTitle:'MolsonCoors', tag:'Aug–Oct',
   pitch:`Hold the MolsonCoors distribution you built — every brand goal you keep through October pays.`,
   getRep:rep=>(PROGRAM_DATA['mc_retention']||{}).byRep?.[rep],
   metric:d=>d.overallPct, metricLabel:'overall % of goal', fmt:v=>v.toFixed(0)+'%'},
  {key:'mabi_retention', group:'retention', title:'Mark Anthony MADE Distro Rewards — Retention', shortTitle:'Mark Anthony', tag:'Jun–Aug',
   pitch:`Hold your MADE placements at 90% of goal through August and the payout stays yours.`,
   getRep:rep=>(PROGRAM_DATA['mabi_retention']||{}).byRep?.[rep],
   metric:d=>d.pct, metricLabel:'% of MADE goal', fmt:v=>v.toFixed(0)+'%'},
  {key:'constellation_retention', group:'retention', title:'Constellation Distro Rewards — Retention', shortTitle:'Constellation', tag:'Jun–Aug',
   pitch:`Hold your Corona, Modelo, Impact and Innovation distribution at 90% of goal through August.`,
   getRep:rep=>(PROGRAM_DATA['constellation_retention']||{}).byRep?.[rep],
   metric:d=>d.offPct, metricLabel:'% of overall goal', fmt:v=>v.toFixed(0)+'%'},
  {key:'yuengling_retention', group:'retention', title:'Yuengling Distro Rewards — Retention', shortTitle:'Yuengling', tag:'Jun–Aug',
   pitch:`Hold your Yuengling brand goals and every account on your retention list through August.`,
   getRep:rep=>(PROGRAM_DATA['yuengling_retention']||{}).byRep?.[rep],
   metric:d=>d.overallPct, metricLabel:'% of overall goal', fmt:v=>v.toFixed(0)+'%'},
];

// ---------------------------------------------------------------------------
// SEPTEMBER 2026 (structure only, added 2026-08-31 from the September Rewards
// Deck). No September RDE export exists yet, so every program that is new to
// September reads from PROGRAM_DATA_2026_09 -- deliberately an empty object
// until a September generator fills it. getRep therefore returns undefined,
// rankProgram yields no rows, and each program renders its rules + goals with
// an "awaiting data" card. That is the intended zero state, not a bug.
//
// The SIX programs that span August AND September (1911, Woodchuck, Tona,
// Lytt, Le Grand Noir, Garage Beer President's) are the exception: their RDE
// windows already cover September, so they point at the SAME PROGRAM_DATA and
// the SAME card functions August uses, and show live numbers on both tabs.
// Per Gavin, 2026-08-31: "If they appear in August AND September, these can be
// the Ongoing portion of the incentives for September."
// ---------------------------------------------------------------------------

const sept = key => rep => (PROGRAM_DATA_2026_09[key]||{}).byRep?.[rep];

const PROGRAM_LIST_2026_09 = [
  // --- New September programs -------------------------------------------
  // Ranked on percentage of the rep's OWN account base, not raw accounts: that
  // is the measure the $300/$150 top-performer award is decided on, and it
  // keeps a 6-account book competing with a 43-account one.
  {key:'keystone_ice', group:'new', title:'Keystone Ice 24oz Cans Are Back', shortTitle:'Keystone Ice', tag:'September',
   pitch:`Get Keystone Ice 24oz cans on the shelf next to Busch and Bud Ice.`,
   getRep:sept('keystone_ice'),
   metric:d=>d.pct, metricLabel:'% of your account base', fmt:v=>v.toFixed(0)+'%'},
  {key:'touchdowns_tea', group:'new', title:'Touchdowns & Tea', shortTitle:'Touchdowns & Tea', tag:'September',
   pitch:`Own football season for Sun Cruiser and Twisted Tea — floor displays and bucket features both pay.`,
   getRep:sept('touchdowns_tea'),
   metric:d=>d.payout, metricLabel:'tracked $', fmt:v=>'$'+v.toLocaleString('en-US')},
  {key:'evil_genius', group:'new', title:'Evil Genius Core Growth', shortTitle:'Evil Genius', tag:'September',
   pitch:`Three placements unlocks the program — then every new Evil Genius placement pays.`,
   getRep:sept('evil_genius'),
   metric:d=>d.totalNewPlacements, metricLabel:'new placements', fmt:v=>v.toFixed(0)},
  {key:'other_half', group:'new', title:'Other Half Target Account Launch', shortTitle:'Other Half', tag:'Sept–Dec',
   pitch:`Open a non-buy target account on Other Half core draft and keep it buying — the back half pays more than the front.`,
   getRep:sept('other_half'),
   metric:d=>d.offPremNewCount, metricLabel:'accounts opened', fmt:v=>v.toFixed(0)},
  {key:'montauk', group:'new', title:'Montauk Wave Chaser New Placements', shortTitle:'Montauk', tag:'September',
   pitch:`Every new Wave Chaser package placement pays, and a new draught line pays $100.`,
   getRep:sept('montauk'),
   metric:d=>d.totalNewPlacements, metricLabel:'new placements', fmt:v=>v.toFixed(0)},
  // Sam Adams Summer Ale -> Octoberfest draft conversion (Boston Beer, on
  // premise). SCORED FROM BOSTON BEER'S OWN SCOREBOARD WORKBOOK (per Gavin,
  // 2026-09-09) and ranked on its "Converted %", so a 4-line book competes
  // with a 79-line one. A rep with no row on that scoreboard has no score and
  // stays off the leaderboard; the card explains why and still shows their
  // Encompass keg activity.
  {key:'sam_adams_conversion', group:'new', title:'Sam Adams Summer Ale → Octoberfest Draft Conversion', shortTitle:'Sam Adams Octoberfest', tag:'Jul 20–Sep 30',
   pitch:`Every handle that poured Summer Ale this spring is a handle to switch to Octoberfest before September ends.`,
   getRep:sept('sam_adams_conversion'),
   metric:d=>d.hasBase ? d.convertedPct : null, metricLabel:'% of Summer Ale lines converted (Boston Beer scoreboard)', fmt:v=>v.toFixed(0)+'%'},
  {key:'printed_menu', group:'new', title:'Bardstown / Green River Printed Menu Program', shortTitle:'Printed Menu', tag:'Sept–Dec',
   pitch:`Get Bardstown or Green River onto a new printed menu — every mention pays $50.`,
   getRep:sept('printed_menu'),
   metric:d=>d.mentions, metricLabel:'menu mentions', fmt:v=>v.toFixed(0),
   manual:true, awaitingNote:`Photo-verified program — menu mentions are submitted and verified manually, so there is no RDE feed behind this card. The rules above are the whole program.`},
  {key:'bardstown_display', group:'new', title:'Bardstown / Green River Display & Activation', shortTitle:'Bardstown Display', tag:'Sept–Oct',
   pitch:`Build a 3-case stack off-premise or a branded activation on-premise — both pay per account.`,
   getRep:sept('bardstown_display'),
   metric:d=>d.displays, metricLabel:'displays / activations', fmt:v=>v.toFixed(0),
   manual:true, awaitingNote:`Photo- and documentation-verified program — displays and activations are submitted manually, so there is no RDE feed behind this card. The rules above are the whole program.`},
  {key:'two_xo', group:'new', title:'2XO Bourbon', shortTitle:'2XO Bourbon', tag:'Sept–Oct (retro Aug)',
   pitch:`60-day non-buy accounts: pair American Oak with French Oak off-premise, or land a 2-bottle POD on-premise.`,
   getRep:sept('two_xo'),
   metric:d=>d.offPremNewCount + d.onPremNewCount, metricLabel:'PODs / case pairs', fmt:v=>v.toFixed(0)},

  // --- Ongoing: live on both tabs, same data as August ------------------
  {key:'1911', group:'ongoing', title:'Beak & Skiff 1911 Rewards', shortTitle:'1911', tag:'Aug–Sept',
   pitch:`Every 1911 SKU you get into an account that didn’t buy that SKU in May–July counts.`,
   getRep:rep=>(PROGRAM_DATA['1911']||{}).byRep?.[rep],
   metric:d=>d.totalNewPlacements, metricLabel:'new placements (packages + draft)', fmt:v=>v.toFixed(0)},
  {key:'woodchuck', group:'ongoing', title:'Woodchuck Cider Rewards', shortTitle:'Woodchuck', tag:'Aug–Sept',
   pitch:`Every Woodchuck SKU you get into an account that didn’t buy that SKU in May–July counts.`,
   getRep:rep=>(PROGRAM_DATA['woodchuck']||{}).byRep?.[rep],
   metric:d=>d.totalNewPlacements, metricLabel:'new placements (packages + draft)', fmt:v=>v.toFixed(0)},
  {key:'tona', group:'ongoing', title:'Tona Distribution & Volume', shortTitle:'Tona', tag:'Aug–Sept',
   pitch:`Get Tona 24oz cans into new accounts and sell 20 cases to unlock every payout.`,
   getRep:rep=>(PROGRAM_DATA['tona']||{}).byRep?.[rep],
   metric:d=>d.caseVolume24oz, metricLabel:'24oz cases', fmt:v=>v.toFixed(0)},
  {key:'lytt', group:'ongoing', title:'Lytt Launch', shortTitle:'Lytt', tag:'Aug–Sept',
   pitch:`The more of your accounts that carry Lytt, the higher your per-case rate.`,
   getRep:rep=>(PROGRAM_DATA['lytt']||{}).byRep?.[rep],
   metric:d=>d.penetrationPct, metricLabel:'penetration', fmt:v=>v.toFixed(1)+'%'},
  {key:'le_grand_noir', group:'ongoing', title:'Le Grand Noir Volume Incentive', shortTitle:'Le Grand Noir', tag:'Aug–Oct',
   pitch:`Sell Le Grand Noir — once the house hits 70 cases, every case pays $10.`,
   getRep:rep=>(PROGRAM_DATA['le_grand_noir']||{}).byRep?.[rep],
   metric:d=>d.cases, metricLabel:'cases (Aug–Oct)', fmt:v=>v.toFixed(0)},
  {key:'garage_beer_president', group:'ongoing', title:"Garage Beer President's Incentive", shortTitle:"GB President's", tag:'Jun–Sep',
   pitch:`Once the house sells 9,305 CE, every case you grew over last year pays $1.`,
   getRep:rep=>(PROGRAM_DATA['garage_beer_president']||{}).byRep?.[rep],
   metric:d=>d.caseGrowthOverLastYear, metricLabel:'CE growth over LY', fmt:v=>(v>0?'+':'')+v.toFixed(0)},

  // --- Retention --------------------------------------------------------
  // MolsonCoors leads this group deliberately: it is the only retention
  // program here with live numbers (the Sept-Nov ones below are awaiting
  // their first pull), so a rep opening the section sees the one they can
  // act on first. Kept first in BOTH this list and the month's repCards
  // order, or the jump nav and the cards disagree about the order.
  {key:'mc_retention', group:'retention', title:'MolsonCoors Distro Rewards — Retention', shortTitle:'MolsonCoors', tag:'Aug–Oct',
   pitch:`Hold the MolsonCoors distribution you built — every brand goal you keep through October pays.`,
   getRep:rep=>(PROGRAM_DATA['mc_retention']||{}).byRep?.[rep],
   metric:d=>d.overallPct, metricLabel:'overall % of goal', fmt:v=>v.toFixed(0)+'%'},

  // The new Sept–Nov period, new goals:
  {key:'constellation_fall', group:'retention', title:'Constellation Fall Distribution Rewards', shortTitle:'Constellation', tag:'Sept–Nov',
   pitch:`A fresh set of Corona, Modelo, Impact and Innovation goals for the fall period — off-premise, plus every on-premise package and draft brand family you poured this spring.`,
   getRep:sept('constellation_fall'),
   metric:d=>d.overallPct, metricLabel:'% of overall goal (off + on premise)', fmt:v=>v.toFixed(0)+'%'},
  {key:'mabi_retention_fall', group:'retention', title:'Mark Anthony MADE Distro Rewards — Retention', shortTitle:'Mark Anthony', tag:'Sept–Nov',
   pitch:`Hold your MADE placements at 90% of goal through November.`,
   getRep:sept('mabi_retention_fall'),
   metric:d=>d.pct, metricLabel:'% of MADE goal', fmt:v=>v.toFixed(0)+'%'},
  {key:'yuengling_retention_fall', group:'retention', title:'Yuengling Distro Rewards — Retention', shortTitle:'Yuengling', tag:'Sept–Nov',
   pitch:`Hold 95% of last fall's buyers for every Yuengling brand family — off-premise and on-premise — through November. Each goal held pays.`,
   getRep:sept('yuengling_retention_fall'),
   metric:d=>d.overallPct, metricLabel:'% of overall goal', fmt:v=>v.toFixed(0)+'%'},
  // MolsonCoors retention is the ONE retention program here that is not a
  // new Sept-Nov period -- it is the SAME August program running through
  // October (per Gavin, 2026-09-04), so it reads PROGRAM_DATA and reuses
  // cardMcRetention() exactly the way the ongoing block above does. One
  // dataset, one card, shown on both tabs; nothing is duplicated. Its entry
  // is at the TOP of this retention block.
  //
  // heineken_husa and new_belgium_distribution_retain were here until
  // 2026-09-04 and come back on the October tab -- per Gavin, both START in
  // October, so a September card for either would be showing reps a program
  // they cannot earn on yet. Their PROGRAM_RULES, logos, TERRITORY_UNCONFIRMED
  // and CORE_MARKET_PROGRAMS_PENDING entries are all left in place, so
  // re-adding them to October's list is just these few lines again.
];

// Month tabs. September is the landing page as of 2026-09-04 (per Gavin:
// "make september 2026 the default tab reps see"), so DEFAULT_MONTH_KEY is
// explicit rather than positional -- unlike MPOs/on-prem/index.html, which
// defaults to the LAST entry in its MONTHS array. Appending a month here
// therefore does NOT change what loads first; change DEFAULT_MONTH_KEY when
// you want it to. (August was the landing page from 2026-08-31 until this
// switch -- see git history for that reasoning if it's ever relevant again.)
//
// repCards is the per-group card order for the rep view. August's order is
// preserved exactly as it was hardcoded before month tabs existed (note it
// differs slightly from PROGRAM_LIST order: lytt and fall_seasonal come before
// new_belgium), so switching to a data-driven renderRep changed no pixels on
// the August tab.
const MONTHS = [
  {key:'2026-08', label:'August 2026', newLabel:'August 2026 programs',
   programs:PROGRAM_LIST_2026_08,
   repCards:{
     new:['1911','woodchuck','tona','path_to_victory','sam_adams','boston_beer','lytt','fall_seasonal','new_belgium','le_grand_noir'],
     ongoing:['sun_cruiser','yave','mollys','garage_beer_summer_sequel','garage_beer_president','new_belgium_distribution','display_auction'],
     retention:['mc_retention','mabi_retention','constellation_retention','yuengling_retention'],
   }},
  {key:'2026-09', label:'September 2026', newLabel:'September 2026 programs',
   programs:PROGRAM_LIST_2026_09,
   repCards:{
     new:['keystone_ice','touchdowns_tea','evil_genius','other_half','montauk','sam_adams_conversion','printed_menu','bardstown_display','two_xo'],
     ongoing:['1911','woodchuck','tona','lytt','le_grand_noir','garage_beer_president'],
     retention:['mc_retention','constellation_fall','mabi_retention_fall','yuengling_retention_fall'],
   }},
];
const DEFAULT_MONTH_KEY = '2026-09';

let activeMonth = MONTHS.find(m=>m.key===DEFAULT_MONTH_KEY) || MONTHS[0];
// Every renderer reads PROGRAM_LIST; reassigning it on a tab switch is what
// makes the whole page month-aware without threading a month argument through
// renderOverview / renderRep / renderProgramDetail / renderPillNav.
let PROGRAM_LIST = activeMonth.programs;


// Keystone Ice 24 oz (September 2026). Reads PROGRAM_DATA_2026_09, not
// PROGRAM_DATA -- it is a September-only program. Numbers come from the
// Keystone dashboard's own JSON via generate.py's build_keystone_ice(); the
// scoring (distinct accounts, whole-number goals) lives there, not here.
function cardKeystoneIce(rep){
  const P = PROGRAM_DATA_2026_09['keystone_ice']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  const meta = P.meta||{}, R = meta.rewards||{};
  const perAcct = R.perPlacement||5, perAcctBonus = R.perPlacementBonus||10;
  const top = R.topPerformer||[300,150];

  const board = statBoard([
    {num:`${d.accounts} / ${d.qualifier}`, label:'Accounts To Qualify',
     status:d.qualified?'good':null,
     sub:d.qualified?'Qualified — your placements are paying':`${d.toQualifier} more account${d.toQualifier===1?'':'s'} to turn on the payout`},
    {num:`${d.pct}%`, label:'Of Your Account Base', sub:`${d.accounts} of your ${d.base} off-premise accounts`},
    {num:`#${d.rank}`, label:'Rank Among Reps', sub:`of ${meta.repCount} reps with a goal · top two earn $${top[0]} / $${top[1]}`},
    {num:d.bonusHit?'Hit':`${d.toBonus} to go`, label:'Bonus Goal',
     status:d.bonusHit?'good':null,
     sub:d.bonusHit?`Every account pays $${perAcctBonus}`:`${d.bonus} accounts doubles your rate to $${perAcctBonus}`},
  ]);

  const rate = d.bonusHit ? perAcctBonus : perAcct;
  const block = earnBlock({
    icon:'🧊', title:'Keystone Ice 24oz Placements',
    rate:d.qualified?`$${rate} AN ACCOUNT`:`$${perAcct} AN ACCOUNT ONCE QUALIFIED`,
    rateNote:`Qualifier ${d.qualifier} accounts · bonus ${d.bonus} accounts doubles it to $${perAcctBonus} · placements made in August count`,
    whatToDo:d.qualified
      ? `You're qualified, so every Keystone Ice 24oz account you hold is paying $${rate}. ${d.bonusHit?'You have also cleared the bonus, so the rate is already doubled — every account from here is worth $'+perAcctBonus+'.':'Get to '+d.bonus+' accounts and the rate doubles to $'+perAcctBonus+' on every one of them, not just the new ones.'}`
      : `Sell Keystone Ice 24oz into ${d.toQualifier} more off-premise account${d.toQualifier===1?'':'s'} and the payout switches on for all ${d.qualifier}+ of them at $${perAcct} each. Nothing pays until you clear the qualifier, so the fastest money on this program is the gap you're standing in.`,
    stats:[
      {num:String(d.accounts), label:'Accounts Sold'},
      {num:`${d.pct}%`, label:'Of Your Base'},
      {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'Earned So Far', dim:!d.payout},
    ],
    progress:{pct:Math.min(100, d.qualifier?d.accounts/d.qualifier*100:0),
      caption:d.qualified?`Qualifier cleared — ${d.bonusHit?'bonus cleared too':d.toBonus+' account'+(d.toBonus===1?'':'s')+' to the bonus'}`
                         :`${d.accounts} of ${d.qualifier} accounts to qualify`},
    detail:{
      label:'Your Keystone Ice Accounts',
      items:(d.accountList||[]).map(a=>({name:a.name||'—', sub:a.num?`#${a.num}`:'', stat:a.date||'', statCls:'pos'})),
      emptyMsg:'No Keystone Ice 24oz accounts yet — every one you open counts toward the qualifier.',
    },
  });

  const photo = earnBlock({
    icon:'📸', title:'iSellBeer Cooler Door Photos',
    rate:`$${R.isellPerPhoto||5} A PHOTO`,
    rateNote:'Not tracked on this page yet',
    whatToDo:'Photograph the cooler door in iSellBeer. The cans must be next to Busch or Bud Ice, priced at or below them, with the cooler door sticker up. There is no Keystone photo export yet, so these are not counted in your earnings above — keep submitting them, they still pay.',
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('keystone_ice')}<span class="prog-name">Keystone Ice 24oz Cans Are Back</span><span class="prog-tag">September</span>${terrTag('keystone_ice')}</div>
      ${progPitch('keystone_ice')}
    </div>
    <div class="prog-body">
      ${board}
      ${block}
      ${photo}
      <div class="prog-foot-note">Your goal is ${d.qualifier} accounts &mdash; 40% of your ${d.base}-account off-premise base, rounded up to a whole account. Accounts are counted once no matter how often they reorder. Full detail, including every rep's standing, is on the <a href="../keystone-ice/index.html">Keystone Ice dashboard</a>.</div>
    </div>
  </div>`;
}

// Touchdowns & Tea. Two of the four payout legs are photo/POS verified and
// have no export, so they are shown as descriptive blocks (the Keystone
// cooler-door pattern) and left out of the earnings figure rather than
// silently implied to be counted.
function cardTouchdownsTea(rep){
  const P = PROGRAM_DATA_2026_09['touchdowns_tea']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  const R = (P.meta||{}).rates||{};

  const board = statBoard([
    {num:d.offPremNewCount, label:'New 12pk Placements', status:cntStatus(d.offPremNewCount), sub:`$${R.placement||15} each, off-premise`},
    {num:d.onPremCases.toFixed(0), label:'On-Prem Cases', status:cntStatus(d.onPremCases), sub:`$${R.onPremCase||1} a case`},
    {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'Tracked Earnings', sub:'Floor displays and features pay on top — not counted here'},
  ]);

  const pkgBlock = earnBlock({
    icon:'🏈', title:'New Off-Premise 12pk Placements',
    rate:`EARN $${R.placement||15}`,
    rateNote:'per new 12pk SKU placement on Sun Cruiser or Twisted Tea. "New" = the account didn’t buy that 12pk SKU June–August, then bought it in September. A second 12pk SKU at the same account counts again.',
    whatToDo:'Get Sun Cruiser or Twisted Tea 12pks into stores that did not buy them over the summer. The export only carries 12pks, so every placement here is a qualifying one.',
    stats:[
      {num:d.offPremNewCount, label:'New Accounts'},
      {num:d.byBrand?.['Sun Cruiser']||0, label:'Sun Cruiser'},
      {num:d.byBrand?.['Twisted Tea']||0, label:'Twisted Tea'},
    ],
    detail:{
      label:'Your New 12pk Accounts',
      items:(d.offPremNew||[]).map(a=>({name:a.customer, sub:(a.brands||[]).join(', '), stat:a.date||''})),
      emptyMsg:'No new 12pk placements yet this month.',
    },
    opportunity:{
      label:'New Accounts To Target',
      count:d.offPremTargetCount,
      note:'Stores on your list with no Sun Cruiser or Twisted Tea 12pk purchases since June — each one you land pays $15.',
      items:(d.offPremTargets||[]).map(a=>({name:a.customer, stat:casesStat(a.cases2026)})),
      moreCount:Math.max(0, (d.offPremTargetCount||0) - (d.offPremTargets||[]).length),
      emptyMsg:'No stores left to target on your list right now.',
    },
  });

  const onBlock = earnBlock({
    icon:'🍻', title:'On-Premise Cases Sold',
    rate:`EARN $${R.onPremCase||1} A CASE`,
    rateNote:'every case sold on-premise in September. The goal is Sun Cruiser as the lead football hard tea.',
    whatToDo:'Every case you sell into a bar or restaurant this month pays a dollar. There is no minimum and no qualifier on this leg — it starts paying from case one.',
    stats:[
      {num:d.onPremCases.toFixed(0), label:'Cases Sold'},
      {num:d.onPremAccountCount, label:'Accounts Buying'},
      {num:`$${d.onPremCasePayout.toLocaleString('en-US')}`, label:'Earned', cls:d.onPremCasePayout?'':'dim'},
    ],
    detail:{
      label:'Your On-Premise Accounts',
      items:(d.onPremAccounts||[]).map(a=>({name:a.customer, stat:a.cases.toFixed(0)+' cs'})),
      emptyMsg:'No on-premise cases yet this month.',
    },
  });

  const manual = earnBlock({
    icon:'📸', title:'Floor Displays & Football Features',
    rate:`$${R.floorCase||1} A CASE · $${R.feature||25} A FEATURE`,
    rateNote:'Photo verified — not tracked on this page',
    whatToDo:`A floor display with football POS pays $${R.floorCase||1} a case on a ${R.floorMinCases||25}-case minimum and cannot be co-branded, and any account running a football feature pays $${R.feature||25}. Both need an iSellBeer picture — the display needs a photo of the floor, the feature needs the menu or bucket, and a bucket special has to be under $35 for 5 cans. No export carries POS or photo status, so these are not in the earnings above. Keep submitting them; they still pay.`,
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('touchdowns_tea')}<span class="prog-name">Touchdowns &amp; Tea</span><span class="prog-tag">September</span>${terrTag('touchdowns_tea')}</div>
      ${progPitch('touchdowns_tea')}
    </div>
    <div class="prog-body">
      ${board}
      ${pkgBlock}
      ${onBlock}
      ${manual}
    </div>
  </div>`;
}

// Evil Genius. Hard 3-placement qualifier gates ALL payout, so the card leads
// with it. The $1/CE bonus is deliberately shown unscored -- see the builder.
function cardEvilGenius(rep){
  const P = PROGRAM_DATA_2026_09['evil_genius']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  const meta = P.meta||{}, R = meta.rates||{}, Q = meta.qualifier||3;

  const board = statBoard([
    {num:`${d.totalNewPlacements} / ${Q}`, label:'Placements To Qualify',
     status:d.qualified?'good':null,
     sub:d.qualified?'Qualified — your placements are paying':`${d.toQualifier} more placement${d.toQualifier===1?'':'s'} before anything pays`},
    {num:d.offPremNewCount, label:'New Off-Prem Accounts', sub:`$${R.offPrem||10} each`},
    {num:d.draftChannelOk===false?'N/A':d.draftQualifiedCount, label:'New Stacy’s Mom Draft',
     sub:d.draftChannelOk===false?'No keg accounts on your route':`$${R.draft||100} each`},
    {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'Earned So Far',
     sub:d.qualified?'Placements + volume bonus':'Nothing pays until the qualifier clears'},
  ]);

  const pkgBlock = earnBlock({
    icon:'📦', title:'New Off-Premise Placements',
    rate:`EARN $${R.offPrem||10}`,
    rateNote:'per new SKU placement of Stacy’s Mom, Adulting or 867-5309. "New" = the account didn’t buy that SKU June–August, then bought it in September. A second SKU at the same account counts again.',
    whatToDo:d.qualified
      ? 'You are past the qualifier, so every new account from here pays $10 on top of what you have already earned.'
      : `Nothing on this program pays until you have ${Q} placements, counting package and qualifying draft together. You need ${d.toQualifier} more — that gap is the fastest money here.`,
    stats:[
      {num:d.offPremNewCount, label:'New Accounts'},
      {num:d.offPremReorderCount, label:'Reordering'},
    ],
    detail:{
      label:'Your New Accounts',
      items:(d.offPremNew||[]).map(a=>({name:a.customer, sub:(a.products||[]).join(', '), stat:a.date||''})),
      emptyMsg:'No new package placements yet this month.',
    },
    opportunity:{
      label:'New Accounts To Target',
      count:d.offPremTargetCount,
      note:'Stores on your list with no Evil Genius purchases since June — each one counts toward the qualifier and then pays $10.',
      items:(d.offPremTargets||[]).map(a=>({name:a.customer, stat:casesStat(a.cases2026)})),
      moreCount:Math.max(0, (d.offPremTargetCount||0) - (d.offPremTargets||[]).length),
      emptyMsg:'No stores left to target on your list right now.',
    },
  });

  const draftBlock = d.draftChannelOk===false
    ? naBlock('Draft — Not Applicable To Your Route',
        'None of your on-premise accounts pour kegs, so the $100 Stacy’s Mom draft placement doesn’t apply to you. The package side above is your full opportunity on this program.')
    : earnBlock({
    icon:'🍺', title:'New Stacy’s Mom Draft Placements',
    rate:`EARN $${R.draft||100}`,
    rateNote:`per new draft account, minimum one 1/2 bbl or two 1/6 bbls (${meta.draftMinBbl||0.333} bbl).`,
    steps:[
      {text:'Place Stacy’s Mom draft in an account that didn’t pour it June–August', done:d.draftNewCount>0},
      {text:'Order has to be a 1/2 bbl or two 1/6 bbls — then the $100 pays', done:d.draftQualifiedCount>0},
    ],
    stats:[
      {num:d.draftNewCount, label:'New Draft Accounts'},
      {num:d.draftQualifiedCount, label:'At The Keg Minimum'},
    ],
    detail:{
      label:'Your Draft Accounts',
      items:(d.draftAccounts||[]).map(a=>({name:a.customer, stat:a.bbl.toFixed(2)+' bbl', status:a.qualifies?'qualified':'progress'})),
      emptyMsg:'No Stacy’s Mom draft accounts yet this month.',
    },
  });

  const ahead = d.caseVolume - d.casesBaseline;
  const bonus = earnBlock({
    icon:'📈', title:'Volume Bonus',
    rate:`$${R.bonusPerCe||1} A CASE OVER LAST SEPTEMBER`,
    rateNote:`every CE above what you sold in ${meta.baselineWindow||'September 2025'}`,
    whatToDo:ahead>0
      ? `You are ${ahead.toFixed(0)} CE ahead of last September, which is $${d.bonusPayout.toLocaleString('en-US')} on top of your placement money${d.qualified?'':' — once you clear the 3-placement qualifier, which gates this too'}. Every case from here adds a dollar.`
      : ahead===0
        ? `You are level with last September. The next case you sell is the first bonus dollar.`
        : `You are ${Math.abs(ahead).toFixed(0)} CE behind last September. Being down costs you nothing, but the bonus does not start until you pass ${d.casesBaseline.toFixed(0)} CE.`,
    stats:[
      {num:d.caseVolume.toFixed(0), label:'CE This Month'},
      {num:d.casesBaseline.toFixed(0), label:'Last September'},
      {num:d.bonusPayout?`$${d.bonusPayout.toLocaleString('en-US')}`:'$0', label:'Bonus Earned', cls:d.bonusPayout?'':'dim'},
    ],
    progress:{pct:d.casesBaseline>0?Math.min(100, d.caseVolume/d.casesBaseline*100):(d.caseVolume>0?100:0),
      over:ahead>0,
      caption:ahead>0?`${ahead.toFixed(0)} CE past last September`
                     :`${d.caseVolume.toFixed(0)} of ${d.casesBaseline.toFixed(0)} CE to beat last September`},
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('evil_genius')}<span class="prog-name">Evil Genius Core Growth</span><span class="prog-tag">September</span>${terrTag('evil_genius')}</div>
      ${progPitch('evil_genius')}
    </div>
    <div class="prog-body">
      ${board}
      ${pkgBlock}
      ${draftBlock}
      ${bonus}
    </div>
  </div>`;
}

// Montauk. Package placements pay by pack size, so they are counted per
// account+pack-tier rather than per account -- see the builder's docstring.
function cardMontauk(rep){
  const P = PROGRAM_DATA_2026_09['montauk']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  const meta = P.meta||{}, R = meta.rates||{};
  const t = d.byTier||{};

  const board = statBoard([
    {num:d.totalNewPlacements, label:'New Placements', status:cntStatus(d.totalNewPlacements), sub:'$10 6pk · $15 12pk / 19.2oz · $100 draft'},
    {num:d.offPremNewCount, label:'Package Placements', sub:`${t.sixpack||0} 6pk · ${t.twelvepack||0} 12pk · ${t.nineteen2||0} 19.2oz`},
    {num:d.draftChannelOk===false?'N/A':d.draftQualifiedCount, label:'New Draught Lines',
     sub:d.draftChannelOk===false?'No keg accounts on your route':`$${R.draft||100} each`},
    {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'Earned So Far', sub:'Sept 1–30'},
  ]);

  const pkgBlock = earnBlock({
    icon:'🌊', title:'New Wave Chaser Package Placements',
    rate:`$${R.sixpack||10} 6PK · $${R.twelvepack||15} 12PK / 19.2OZ`,
    rateNote:'per new placement. "New" = that pack size wasn’t bought at the account June–August, then was in September.',
    whatToDo:'Get Wave Chaser into accounts that did not carry it over the summer. The 12pk and 19.2oz pay half again what a 6pk does, so lead with those where the account will take them.',
    stats:[
      {num:t.sixpack||0, label:'6pk @ $10'},
      {num:t.twelvepack||0, label:'12pk @ $15'},
      {num:t.nineteen2||0, label:'19.2oz @ $15'},
    ],
    detail:{
      label:'Your New Placements',
      items:(d.offPremNew||[]).map(a=>({name:a.customer, sub:a.tier, stat:'$'+a.rate})),
      emptyMsg:'No new package placements yet this month.',
    },
    opportunity:{
      label:'New Accounts To Target',
      count:d.offPremTargetCount,
      note:'Stores on your list with no Wave Chaser purchases since June — a 12pk or 19.2oz placement here is worth $15.',
      items:(d.offPremTargets||[]).map(a=>({name:a.customer, stat:casesStat(a.cases2026)})),
      moreCount:Math.max(0, (d.offPremTargetCount||0) - (d.offPremTargets||[]).length),
      emptyMsg:'No stores left to target on your list right now.',
    },
  });

  const draftBlock = d.draftChannelOk===false
    ? naBlock('Draught — Not Applicable To Your Route',
        'None of your on-premise accounts pour kegs, so the $100 draught line doesn’t apply to you. The package side above is your full opportunity on this program.')
    : earnBlock({
    icon:'🍺', title:'New Wave Chaser Draught Lines',
    rate:`EARN $${R.draft||100}`,
    rateNote:`per new draught line, Wave Chaser only, minimum one 1/2 bbl or two 1/6 bbls (${meta.draftMinBbl||0.333} bbl).`,
    steps:[
      {text:'Place a Wave Chaser line in an account that didn’t pour it June–August', done:d.draftNewCount>0},
      {text:'Order has to be a 1/2 bbl or two 1/6 bbls — then the $100 pays', done:d.draftQualifiedCount>0},
    ],
    stats:[
      {num:d.draftNewCount, label:'New Draught Accounts'},
      {num:d.draftQualifiedCount, label:'At The Keg Minimum'},
    ],
    detail:{
      label:'Your Draught Accounts',
      items:(d.draftAccounts||[]).map(a=>({name:a.customer, stat:a.bbl.toFixed(2)+' bbl', status:a.qualifies?'qualified':'progress'})),
      emptyMsg:'No Wave Chaser draught accounts yet this month.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('montauk')}<span class="prog-name">Montauk Wave Chaser New Placements</span><span class="prog-tag">September</span>${terrTag('montauk')}</div>
      ${progPitch('montauk')}
    </div>
    <div class="prog-body">
      ${board}
      ${pkgBlock}
      ${draftBlock}
      <div class="prog-foot-note">Pack sizes are counted separately because they pay different amounts &mdash; an account taking 6pks and 12pks is two placements. Counted by account instead, the way 1911 and Woodchuck are, you would have ${d.newAccounts} new placement${d.newAccounts===1?'':'s'} rather than ${d.offPremNewCount}. Being confirmed with Kohler.</div>
    </div>
  </div>`;
}


// Sam Adams Summer Ale -> Octoberfest draft conversion (Boston Beer, on
// premise, Jul 20 - Sep 30). EVERY SCORED NUMBER HERE IS BOSTON BEER'S: the
// rep's row on their "Seasonal Conversion Fall" scoreboard (lines converted /
// not converted / gained / Converted %) and their unconverted-account list,
// both dated by the workbook's as-of date. The Encompass keg export is the
// daily supplement underneath: which accounts took their first Octoberfest
// keg SINCE that date (conversions Boston Beer has not counted yet), kegs
// loaded since, and the full Encompass lists for checking a name. No payout
// rates are on file yet (2026-09-09). See build_sam_adams_conversion().
function cardSamAdamsConversion(rep){
  const P = PROGRAM_DATA_2026_09['sam_adams_conversion']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  const M = P.meta||{}, E = d.encompass||{};
  const fmtD = s => s ? new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
  const kegs = n => `${Number(n||0).toLocaleString('en-US')} keg${Number(n)===1?'':'s'}`;
  const ces = n => `${Number(n||0).toFixed(1)} CE`;
  const pct = d.hasBase ? (d.convertedPct||0) : null;
  const asOf = fmtD(d.asOf||M.officialAsOf), thru = fmtD(E.exportThrough||M.exportThrough);
  const sinceN = (E.convertedSinceReport||[]).length;
  const sinceConv = (E.convertedSinceReport||[]).filter(a=>a.wasSummerAle).length;

  const board = statBoard([
    {num:d.hasOfficial?`${d.converted} of ${d.prevSeason}`:'—', label:'Lines Converted', status:d.converted>0?'good':null,
     sub:d.hasOfficial?`${pct!=null?pct.toFixed(0)+'% · ':''}Boston Beer scoreboard, ${asOf}`:'Not on Boston Beer’s scoreboard'},
    {num:d.hasOfficial?d.notConverted:'—', label:'Still On Summer Ale', sub:d.hasOfficial?`${d.gained} gained lines not from conversion`:''},
    {num:sinceN, label:`First Octoberfest Kegs Since ${asOf}`, status:sinceN>0?'good':null, sub:`Encompass loads through ${thru}${sinceConv?` · ${sinceConv} of them Summer Ale accounts`:''}`},
    {num:E.octKegs?Number(E.octKegs).toLocaleString('en-US'):'0', label:'Octoberfest Kegs', sub:`${Number(E.octBbl||0).toFixed(1)} bbl since Jul 20 (Encompass)`},
  ]);

  const mainBlock = !d.hasOfficial
    ? naBlock('Not On Boston Beer’s Scoreboard',
        `Boston Beer’s conversion scoreboard (as of ${asOf}) has no row for you, so there is no scored number here. Encompass shows ${E.converted||0} of ${E.prev||0} of your Summer Ale keg accounts on Octoberfest and ${E.gained||0} new Octoberfest line${E.gained===1?'':'s'}; if you should be on the program, that is what Boston Beer will see.`)
    : earnBlock({
    icon:'🍂', title:'Switch Your Summer Ale Handles To Octoberfest',
    rate:`${pct!=null?pct.toFixed(0):0}% CONVERTED`,
    rateNote:`Boston Beer’s count as of ${asOf}: ${d.converted} of the ${d.prevSeason} accounts on route ${esc(d.route)} that poured Summer Ale Apr 1 – Jul 17 have taken an Octoberfest keg since Jul 20. Payout rates for this program are not on file yet — the conversion percentage is what is being tracked.`,
    steps:[
      {text:`Get an Octoberfest keg into every account on Boston Beer’s unconverted list — ${d.notConverted} still to go`, done:d.notConverted===0},
      {text:`Land Octoberfest in accounts that never poured Summer Ale — they count as gained fall distribution (${d.gained} so far)`, done:d.gained>0},
      {text:`Hold your current-season lines at last year’s ${d.currentLY} — you are at ${d.currentSeason}`, done:d.currentSeason>=d.currentLY && d.currentLY>0},
    ],
    stats:[
      {num:d.converted, label:'Converted'},
      {num:d.notConverted, label:'Not Yet', dim:d.notConverted===0},
      {num:d.gained, label:'Gained'},
      {num:`${d.currentSeason} / ${d.currentLY}`, label:'Current vs LY'},
    ],
    progress:{pct:pct||0, caption:`${d.converted} of ${d.prevSeason} Summer Ale lines converted on Boston Beer’s scoreboard · ${P.periodDays-P.daysElapsed} days left to Sept 30`},
    opportunity:{
      label:`Boston Beer’s Unconverted List (${asOf})`,
      count:d.notConverted,
      note:`Boston Beer’s own list of your accounts that poured Summer Ale and have not taken Octoberfest, biggest Summer Ale pourers first. One that shows up under “First Octoberfest kegs since ${asOf}” below has already switched — expect it to drop off their next scoreboard.`,
      items:(d.unconvertedAccounts||[]).map(a=>({name:`${a.account}${a.city?` · ${a.city}`:''}`, stat:`${ces(a.prevCEs)} Summer Ale Apr–Jul${a.currentLYCEs?` · ${ces(a.currentLYCEs)} Octoberfest LY`:''}`})),
      emptyMsg:'Boston Beer has every one of your Summer Ale lines on Octoberfest.',
    },
    extra:[
      detailList({
        label:`First Octoberfest Kegs Since ${asOf} (Encompass)`,
        items:(E.convertedSinceReport||[]).map(a=>({name:a.customer, sub:`First Octoberfest keg ${fmtD(a.firstOct)} · ${a.wasSummerAle?'poured Summer Ale Apr–Jul — a conversion':'no Summer Ale on file — a gained line'}`, stat:kegs(a.octKegs), status:a.wasSummerAle?'qualified':'progress'})),
        emptyMsg:`No account of yours has taken its first Octoberfest keg since Boston Beer’s ${asOf} report.`,
      }),
      detailList({
        label:`All Octoberfest Accounts On File (Encompass, through ${thru})`,
        items:(E.convertedAccounts||[]).map(a=>({name:a.customer, sub:`First Octoberfest keg ${fmtD(a.firstOct)} · ${a.summerKegsBase} Summer Ale kegs Apr–Jul`, stat:kegs(a.octKegs), status:'qualified'}))
          .concat((E.gainedAccounts||[]).map(a=>({name:a.customer, sub:`First Octoberfest keg ${fmtD(a.firstOct)} · no Summer Ale on file (gained)`, stat:kegs(a.octKegs)}))),
        emptyMsg:'No Octoberfest kegs on file for your accounts yet.',
      }),
    ].join(''),
  });

  const footNote = d.hasOfficial
    ? `Scored from Boston Beer’s conversion scoreboard as of ${asOf} (route ${esc(d.route)}), which is the program’s source of truth. Encompass keg loads through ${thru} read ${E.converted} of ${E.prev} Summer Ale accounts on Octoberfest (${E.pct!=null?E.pct.toFixed(0)+'%':'—'}) with ${E.gained} gained; it is scored by account rather than by route, so it can run a line or two apart from Boston Beer’s figure and is here to show movement between their reports, never to replace them.`
    : `Encompass keg loads through ${thru}. Boston Beer’s scoreboard (${asOf}) is the program’s source of truth and has no row for you.`;

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('sam_adams_conversion')}<span class="prog-name">Sam Adams Summer Ale &rarr; Octoberfest Draft Conversion</span><span class="prog-tag">Jul 20&ndash;Sep 30</span>${terrTag('sam_adams_conversion')}</div>
      ${progPitch('sam_adams_conversion')}
    </div>
    <div class="prog-body">
      ${board}
      ${mainBlock}
      <div class="prog-foot-note">${footNote}</div>
    </div>
  </div>`;
}

// 2XO Bourbon. Off-premise pays for the American+French Oak PAIR, not either
// oak alone, so this is the one program where opening a single SKU shows as
// "not yet a placement" rather than a smaller placement -- see build_two_xo().
// On-premise cases are shown but not scored: what counts as a qualifying
// "2-bottle POD" hasn't been confirmed with Kohler.
function cardTwoXo(rep){
  const P = PROGRAM_DATA_2026_09['two_xo']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  const R = (P.meta||{}).rates||{};

  const board = statBoard([
    {num:d.offPremNewCount, label:'New Oak Pairs', status:cntStatus(d.offPremNewCount), sub:`$${R.pair||40} each, off-premise`},
    {num:d.onPremNewCount, label:'New On-Prem PODs', status:cntStatus(d.onPremNewCount), sub:`$${R.pod||25} each, 2+ units`},
    {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'Tracked Earnings', sub:'POD cocktail menus pay on top — not counted here'},
  ]);

  const pairBlock = earnBlock({
    icon:'🥃', title:'New Off-Premise Oak Pairs',
    rate:`EARN $${R.pair||40}`,
    rateNote:`per new off-premise account carrying BOTH American Oak and French Oak. Neither oak alone pays — the deck prices the pair.${(d.offPremNew||[]).some(a=>a.payout>(R.pair||40))?` +$${R.rye||35} more if White Oak Rye is in the same order.`:''}`,
    whatToDo:'Target accounts that haven’t bought 2XO in the last 60 days (August activity counts) and open them with both oaks together.',
    stats:[
      {num:d.offPremNewCount, label:'New Pairs'},
      {num:d.offPremReorderCount, label:'Reorders'},
    ],
    detail:{
      label:'Your New Oak Pairs',
      items:(d.offPremNew||[]).map(a=>({name:a.customer, sub:a.products.join(' + '), stat:'$'+a.payout})),
      emptyMsg:'No new oak pairs yet this month.',
    },
  });

  const singlesBlock = (d.offPremSingles||[]).length ? earnBlock({
    icon:'⚠️', title:'Single-Oak Opens — Not Paid Yet',
    rate:'ADD THE OTHER OAK TO EARN $'+(R.pair||40),
    rateNote:'These accounts opened with only one of the two oaks this window. Get the other one in and the pair pays.',
    detail:{
      label:'Accounts Missing Their Pair',
      items:d.offPremSingles.map(a=>({name:a.customer, sub:'Has: '+a.products.join(', '), stat:a.date||''})),
      emptyMsg:'',
    },
  }) : '';

  const onBlock = earnBlock({
    icon:'🍸', title:'New On-Premise PODs',
    rate:`EARN $${R.pod||25}`,
    rateNote:'per new on-premise account with 2+ 2XO bottles in one order — any product, any mix. Reorders and single-bottle opens don’t pay yet.',
    whatToDo:`Get a new on-premise account to take 2 bottles of anything 2XO in one order. A POD cocktail menu placement earns $${R.podMenu||15} on top (photo verified, not tracked here).`,
    stats:[
      {num:d.onPremNewCount, label:'New PODs'},
      {num:d.onPremReorderCount, label:'Reorders'},
    ],
    detail:{
      label:'Your New On-Premise PODs',
      items:(d.onPremNew||[]).map(a=>({name:a.customer, stat:'$'+a.payout+' · '+a.units+' units'})),
      emptyMsg:'No new on-premise PODs yet this month.',
    },
  });

  const buildingBlock = (d.onPremBuilding||[]).length ? earnBlock({
    icon:'📈', title:'New Accounts Under 2 Units — Not Paid Yet',
    rate:'ADD ONE MORE BOTTLE TO EARN $'+(R.pod||25),
    rateNote:'These are new on-premise accounts, but their first order was under 2 bottles.',
    detail:{
      label:'Accounts Building Toward The POD',
      items:d.onPremBuilding.map(a=>({name:a.customer, stat:a.units+' unit'+(a.units===1?'':'s')})),
      emptyMsg:'',
    },
  }) : '';

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('two_xo')}<span class="prog-name">2XO Bourbon</span><span class="prog-tag">Sept&ndash;Oct (retro Aug)</span>${terrTag('two_xo')}</div>
      ${progPitch('two_xo')}
    </div>
    <div class="prog-body">
      ${board}
      ${pairBlock}
      ${singlesBlock}
      ${onBlock}
      ${buildingBlock}
    </div>
  </div>`;
}

// Other Half Target Account Launch. Off-premise is scored -- every account
// is non-buy by definition (brand new to Kohler, no base period exists) --
// but the Southern District $50 flat rate is a READING of the deck, not a
// confirmation, so the card says so wherever that rate applies. On-premise
// is shown but never priced: the $150 needs the same account to buy in BOTH
// September and October, and only September exists. See build_other_half().
function cardOtherHalf(rep){
  const P = PROGRAM_DATA_2026_09['other_half']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  const R = (P.meta||{}).rates||{};

  const board = statBoard([
    {num:d.offPremNewCount, label:'New Off-Premise Accounts', status:cntStatus(d.offPremNewCount), sub:`$${R.offPrem||40}+ each — every account here is new to Other Half`},
    {num:(d.onPremSeptember||[]).length, label:'On-Premise Accounts, September', sub:'Needs October too before the $150 pays'},
    {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'Tracked Earnings', sub:'Off-premise only — on-premise isn’t priced yet'},
  ]);

  const offBlock = earnBlock({
    icon:'🍺', title:'New Off-Premise Accounts',
    rate:`EARN $${R.offPrem||40}+`,
    rateNote:`$${R.offPrem||40} for opening an account with 3+ core Other Half SKUs, +$${R.offPremExtraSku||10} for every SKU beyond the first 3. Since Other Half is brand new to Kohler, every account that bought it in this export counts as a fresh open.`,
    whatToDo:'Get 3 or more core Other Half SKUs into a new off-premise account — the more SKUs in the same order, the more it pays.',
    stats:[
      {num:d.offPremNewCount, label:'New Accounts'},
      {num:`$${d.offPremPayout.toLocaleString('en-US')}`, label:'Earned'},
    ],
    detail:{
      label:'Your New Off-Premise Accounts',
      items:(d.offPremNew||[]).map(a=>({
        name:a.customer,
        sub:a.southern ? 'Southern District rate' : (a.skuCount+' SKU'+(a.skuCount===1?'':'s')),
        stat:'$'+a.payout,
      })),
      emptyMsg:'No new off-premise accounts yet this month.',
    },
  });

  const southNote = (d.offPremNew||[]).some(a=>a.southern) ? `<div class="prog-foot-note">Accounts marked "Southern District rate" are priced at a flat $${R.southernDistrict||50} instead of the SKU-count formula — that is how this page reads the deck's separate Southern District bullet, not a number Kohler has confirmed. Ask before this pays out for real.</div>` : '';

  const onBlock = earnBlock({
    icon:'🍻', title:'On-Premise Activity — Not Priced Yet',
    rate:`$${R.onPrem1stHalf||150} NEEDS TWO MONTHS`,
    rateNote:`The same account has to buy Other Half core draft in BOTH September and October (1/2 bbl, or two 1/6 bbls, each month) before the $${R.onPrem1stHalf||150} pays. Only September exists right now, so nothing here is priced — these are accounts on track, not confirmed earnings.`,
    whatToDo:'Get a new on-premise account pouring Other Half core draft at 1/2 bbl (or two 1/6 bbls) or more this month, then keep it buying in October to lock the payout.',
    stats:[
      {num:(d.onPremSeptember||[]).length, label:'Accounts Active'},
      {num:d.onPremQualifyingCount, label:'At The Volume Floor'},
    ],
    detail:{
      label:'Your September Other Half Accounts',
      items:(d.onPremSeptember||[]).map(a=>({name:a.customer, stat:a.bbl.toFixed(2)+' bbl', status:a.qualifies?'qualified':'progress'})),
      emptyMsg:'No on-premise Other Half activity yet this month.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('other_half')}<span class="prog-name">Other Half Target Account Launch</span><span class="prog-tag">Sept&ndash;Dec</span>${terrTag('other_half')}</div>
      ${progPitch('other_half')}
    </div>
    <div class="prog-body">
      ${board}
      ${offBlock}
      ${southNote}
      ${onBlock}
    </div>
  </div>`;
}

const PROGRAM_CARD_FN = {
  '1911': card1911, 'woodchuck': cardWoodchuck, 'tona': cardTona,
  'path_to_victory': cardPathToVictory, 'sam_adams': cardSamAdams, 'boston_beer': cardBostonBeer,
  'new_belgium': cardNewBelgium, 'lytt': cardLytt, 'fall_seasonal': cardFallSeasonal,
  'le_grand_noir': cardLeGrandNoir,
  'sun_cruiser': cardSunCruiser, 'yave': cardYave, 'mollys': cardMollys,
  'garage_beer_summer_sequel': cardGarageBeerSummerSequel, 'garage_beer_president': cardGarageBeerPresident,
  'new_belgium_distribution': cardNewBelgiumDistribution, 'display_auction': cardDisplayAuction,
  'mc_retention': cardMcRetention,
  'mabi_retention': cardMabiRetention, 'constellation_retention': cardConstellationRetention,
  'yuengling_retention': cardYuenglingRetention,
  'keystone_ice': cardKeystoneIce, 'touchdowns_tea': cardTouchdownsTea,
  'evil_genius': cardEvilGenius, 'montauk': cardMontauk, 'two_xo': cardTwoXo,
  'other_half': cardOtherHalf,
  'mabi_retention_fall': cardMabiRetentionFall,
  'constellation_fall': cardConstellationFall,
  'yuengling_retention_fall': cardYuenglingRetentionFall,
  'sam_adams_conversion': cardSamAdamsConversion,
};

// Zero-state card for a program whose rules and goals are known but whose data
// source hasn't arrived yet (every September program except the six ongoing
// ones). Deliberately renders the SAME head as a real card -- logo, title,
// tag, pitch, rules -- so a rep opening the September tab gets the whole
// program, just without their own numbers. Programs flagged manual:true say so
// outright rather than implying numbers are coming.
function cardAwaitingData(key){
  const entry = (PROGRAM_LIST||[]).find(e=>e.key===key) || {};
  const rules = PROGRAM_RULES[key]||[];
  const note = entry.awaitingNote
    || `Awaiting the first September export — the rules and goals above are live, and your numbers will fill in here once the data lands.`;
  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo(key)}<span class="prog-name">${esc(entry.title||key)}</span><span class="prog-tag">${esc(entry.tag||'')}</span>${terrTag(key)}${entry.manual?'<span class="prog-tag">Manually verified</span>':''}</div>
      ${progPitch(key)}
      <div class="tile-rules">${rules.map(r=>`<div class="rule-item tile-rule"><span>${ruleHl(r)}</span></div>`).join('')}</div>
    </div>
    <div class="prog-body"><div class="empty-state">${esc(note)}</div></div>
  </div>`;
}

// A program renders with its real card when one exists, otherwise the
// zero-state card above.
function cardFor(key, rep){
  const fn = PROGRAM_CARD_FN[key];
  return fn ? fn(rep) : cardAwaitingData(key);
}

function rankProgram(entry){
  const rows = ROSTER.map(rep=>{
    const d = entry.getRep(rep);
    if(!d) return null;
    if(d.territoryEligible===false) return null;
    if(d.programEligible===false) return null;
    const val = entry.metric(d);
    if(val==null || Number.isNaN(val)) return null;
    return {rep, val};
  }).filter(Boolean);
  rows.sort((a,b)=>b.val-a.val);
  rows.forEach((r,i)=>{ r.rank = i+1; });
  return rows;
}

let activeRep = null;
let activeProgram = null;
let uid = 0;

function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function progPitch(key){
  const entry = PROGRAM_LIST.find(e=>e.key===key);
  return (entry && entry.pitch) ? `<div class="prog-pitch">${esc(entry.pitch)}</div>` : '';
}

// Some opportunity source lists have one row per (customer, product) --
// an account carrying several SKUs would otherwise show up multiple
// times. Dedupe to one row per account, keeping whichever entry sorted
// first (lists are pre-sorted by recency/size).
function dedupeByCustomer(list){
  const seen = new Set();
  const out = [];
  for(const item of list){
    if(seen.has(item.customer)) continue;
    seen.add(item.customer);
    out.push(item);
  }
  return out;
}

// A locked/unlocked gate banner for programs where a single qualifier
// switches on every payout at once (e.g. Tona's 20-case minimum).
function qualifierBanner(opts){
  const pct = Math.min(opts.current/opts.goal, 1)*100;
  const color = opts.met ? 'var(--good)' : 'var(--amber)';
  const soft = opts.met ? 'var(--good-soft)' : 'var(--amber-soft)';
  return `<div class="rank-hero" style="background:linear-gradient(135deg,${soft},transparent);border-color:${color}">
    <span class="rank-hero-trophy">${opts.met?'🔓':'🔒'}</span>
    <div style="flex:1;min-width:160px">
      <div class="rank-hero-main">${opts.met?(opts.metTitle||'Payouts Unlocked'):(opts.lockedTitle||'Payouts Locked')}</div>
      <div class="rank-hero-sub">${esc(opts.label)}</div>
      <div class="earn-progress-track" style="margin-top:8px;max-width:280px"><div class="earn-progress-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>
    <div class="rank-hero-pct"><div class="rank-hero-pct-num" style="color:${color}">${opts.current.toFixed(0)} / ${opts.goal}</div><div class="rank-hero-pct-label">${esc(opts.unit)}</div></div>
  </div>`;
}

function rateStrip(rates){
  if(!rates || !rates.length) return '';
  return `<div class="rate-strip">${rates.map(r=>`<span class="rate-chip">${esc(r)}</span>`).join('')}</div>`;
}

// One collapsible "Where To Win Next" list. Which list a program gets is
// deliberately program-specific (per Gavin, 2026-08-18): new-placement
// programs get true eligible-non-buyer target lists, rebuy/retention
// programs get accounts-to-rebuy lists, volume programs get where-the-
// cases-came-from. Never fabricated: every list this feeds comes from an
// actual generate.py-computed field, never an invented account.
// opts: {label, count, items:[{name,stat,barPct}], note, moreCount, emptyMsg}
function oppSection(opts){
  opts = opts || {};
  if(!opts.items || !opts.items.length){
    return `<div class="detail-list-wrap">
      <div class="earn-section-label">${esc(opts.label||'Where To Win Next')}</div>
      <div class="empty-note">${esc(opts.emptyMsg||'Nothing to flag here right now.')}</div>
    </div>`;
  }
  const did = 'opp'+(uid++);
  const rows = opts.items.map((it,i)=>{
    const bar = it.barPct!=null
      ? `<div class="opp-item-bar"><div class="earn-progress-track" style="height:7px"><div class="earn-progress-fill" style="width:${Math.min(it.barPct,100)}%"></div></div></div>`
      : '';
    return `<div class="opp-item"><span class="opp-rank">${i+1}</span><span class="opp-name">${esc(it.name)}</span>${bar}<span class="opp-stat">${esc(it.stat||'')}</span></div>`;
  }).join('');
  const more = opts.moreCount ? `<div class="opp-more">+${opts.moreCount} more not shown</div>` : '';
  const count = opts.count!=null ? opts.count : opts.items.length + (opts.moreCount||0);
  return `<div class="detail-list-wrap">
    <button class="big-toggle opp js-toggle" data-target="${did}"><span class="big-chev">▶</span><span class="big-toggle-text">${esc(opts.label||'Where To Win Next')}</span><span class="big-toggle-count">${count}</span></button>
    <div class="big-toggle-body" id="${did}">
      ${opts.note?`<div class="opp-note">${esc(opts.note)}</div>`:''}
      <div class="opp-list">${rows}</div>
      ${more}
    </div>
  </div>`;
}

// The core building block -- one earn-block per distinct way a program
// pays a rep, structured around Gavin's four questions in order (2026-08-18):
// What You Need To Do, Your Progress, Your Activity, Where To Win Next.
// No dollar total is computed or shown here -- that's deliberate.
// opts: {icon, title, whatToDo, steps:[{text,done}], rate, rateNote,
// stats:[{num,label,dim,cls}], progress:{pct,over,caption},
// detail:{label,items,emptyMsg}, extra:rawHtml,
// opportunity:{...} or opportunities:[{...}]}
function earnBlock(opts){
  const doHtml = (opts.steps && opts.steps.length)
    ? `<div class="earn-steps">
        <div class="earn-section-label">What You Need To Do</div>
        ${opts.steps.map((s,i)=>`<div class="earn-step${s.done?' done':''}"><span class="earn-step-num">${s.done?'':i+1}</span>${esc(s.text)}</div>`).join('')}
      </div>`
    : (opts.whatToDo ? `<div><div class="earn-section-label">What You Need To Do</div><div class="earn-whattodo-text">${esc(opts.whatToDo)}</div></div>` : '');
  const stats = (opts.stats||[]).map(s=>
    `<div class="earn-stat"><div class="earn-stat-num${s.dim?' dim':''}${s.cls?' '+s.cls:''}">${esc(s.num)}</div><div class="earn-stat-label">${esc(s.label)}</div></div>`
  ).join('');
  const progress = opts.progress ? `<div><div class="earn-progress-track"><div class="earn-progress-fill${opts.progress.over?' over':''}" style="width:${Math.min(opts.progress.pct,100)}%"></div></div>${opts.progress.caption?`<div class="earn-progress-caption">${esc(opts.progress.caption)}</div>`:''}</div>` : '';
  const progressBlock = (stats || progress) ? `<div>
      ${stats?`<div class="earn-section-label">Your Progress</div><div class="earn-stats">${stats}</div>`:''}
      ${progress}
    </div>` : '';
  const detailHtml = opts.detail ? detailList(opts.detail) : '';
  const extraHtml = opts.extra || '';
  const opps = opts.opportunities || (opts.opportunity ? [opts.opportunity] : []);
  const oppHtml = opps.map(o=>oppSection(o)).join('');
  return `<div class="earn-block">
    <div class="earn-head">
      <div class="earn-head-main"><span class="earn-icon">${opts.icon||''}</span><span class="earn-title">${esc(opts.title)}</span></div>
      <div class="earn-rate"><div class="earn-rate-badge">${esc(opts.rate)}</div>${opts.rateNote?`<div class="earn-rate-note">${esc(opts.rateNote)}</div>`:''}</div>
    </div>
    ${doHtml}
    ${progressBlock}
    ${detailHtml}
    ${extraHtml}
    ${oppHtml}
  </div>`;
}

// A "receipt" list: every number shown above must be traceable to the
// real accounts/products/lines that make it up. Collapsed by default
// behind one big tappable button ("Your 6 Accounts" style, per Gavin
// 2026-08-18) so cards stay short on a phone.
// opts: {label, count, items:[{name,sub,stat,statCls,status,barPct}], emptyMsg}
// status (optional, per item): 'qualified' | 'progress'
const DSTATUS_LABEL = {qualified:'✓ Qualified', retained:'✓ Retained', progress:'In Progress'};
function detailRow(it){
  const statusBadge = it.status ? `<span class="dstatus dstatus-${esc(it.status)}">${esc(DSTATUS_LABEL[it.status]||it.status)}</span>` : '';
  const bar = it.barPct!=null ? `<div class="earn-progress-track" style="height:7px;margin-top:6px;max-width:180px"><div class="earn-progress-fill" style="width:${Math.min(it.barPct,100)}%"></div></div>` : '';
  return `<div class="detail-row">
    <div class="detail-row-main">
      <div class="detail-row-name">${esc(it.name)}</div>
      ${it.sub?`<div class="detail-row-sub">${esc(it.sub)}</div>`:''}
      ${bar}
    </div>
    <div class="detail-row-right">
      ${statusBadge}
      ${it.stat?`<div class="detail-row-stat${it.statCls?' '+it.statCls:''}">${esc(it.stat)}</div>`:''}
      ${it.link?`<a class="detail-row-link" href="${esc(it.link.href)}" target="_blank" rel="noopener">${esc(it.link.label||'View')}</a>`:''}
    </div>
  </div>`;
}
function detailList(opts){
  opts = opts || {};
  const items = opts.items || [];
  const label = opts.label || 'Your Activity';
  if(!items.length){
    return `<div class="detail-list-wrap"><div class="earn-section-label">${esc(label)}</div><div class="empty-note">${esc(opts.emptyMsg||'Nothing here yet.')}</div></div>`;
  }
  const did = 'dl'+(uid++);
  const count = opts.count!=null ? opts.count : items.length;
  return `<div class="detail-list-wrap">
    <button class="big-toggle js-toggle" data-target="${did}"><span class="big-chev">▶</span><span class="big-toggle-text">${esc(label)}</span><span class="big-toggle-count">${count}</span></button>
    <div class="big-toggle-body" id="${did}"><div class="detail-list">${items.map(detailRow).join('')}</div></div>
  </div>`;
}

// Expandable per-product rows (per Gavin 2026-08-18, requests 7-8): a
// program organized by product, where tapping a product reveals the
// accounts driving that product's number. Used by Sam Adams Octoberfest
// (YoY per product) and Fall Seasonal (large SKU list).
// opts: {label, note, groups:[{name,sub,stat,statCls,accounts:[{name,sub,stat,statCls}]}], emptyMsg}
function productAccordion(opts){
  opts = opts || {};
  const groups = opts.groups || [];
  if(!groups.length){
    return `<div class="detail-list-wrap"><div class="earn-section-label">${esc(opts.label||'Products')}</div><div class="empty-note">${esc(opts.emptyMsg||'Nothing here yet.')}</div></div>`;
  }
  const rows = groups.map(g=>{
    const did = 'pa'+(uid++);
    const acctRows = (g.accounts||[]).map(detailRow).join('');
    return `<div class="prod-row">
      <button class="prod-toggle js-toggle" data-target="${did}">
        <span class="big-chev">▶</span>
        <span class="prod-main"><span class="prod-name">${esc(g.name)}</span>${g.sub?`<span class="prod-sub">${esc(g.sub)}</span>`:''}</span>
        <span class="prod-stat${g.statCls?' '+g.statCls:''}">${esc(g.stat||'')}</span>
      </button>
      <div class="prod-body" id="${did}">${acctRows||'<div class="empty-note">No account detail available.</div>'}</div>
    </div>`;
  }).join('');
  return `<div class="detail-list-wrap">
    <div class="earn-section-label">${esc(opts.label||'Products')}</div>
    ${opts.note?`<div class="opp-note">${esc(opts.note)}</div>`:''}
    <div class="prod-list">${rows}</div>
  </div>`;
}

// Signed number formatting for YoY figures ("+6" / "-3" / "0").
function signedFmt(v, decimals){
  const n = v.toFixed(decimals||0);
  return v>0 ? '+'+n : n;
}
function deltaCls(v){ return v>0 ? 'pos' : (v<0 ? 'neg' : ''); }

// Escape a rule string, then bold-highlight the numbers that matter most
// ($ amounts, percentages, and N+ minimums) so they pop without reading.
function ruleHl(text){
  return esc(text)
    .replace(/\$\d[\d,]*(?:\.\d+)?(?:\/(?:case|CE|keg))?/g, m=>`<b class="rule-hl">${m}</b>`)
    .replace(/\d+(?:\.\d+)?%/g, m=>`<b class="rule-hl">${m}</b>`)
    .replace(/\b(\d[\d,]*)\+/g, (m,n)=>`<b class="rule-hl">${n}+</b>`);
}

// Compact volume stat for target/whitespace lists: the account's 2026
// all-product case volume, formatted with thousands separators.
function casesStat(v){ return v>0 ? Math.round(v).toLocaleString('en-US')+' cases' : 'low volume on file'; }

// "Where You Stand" scoreboard: the rep's key numbers for one program,
// rendered as large color-coded tiles at the very top of the card so
// status registers in a glance before any account-level detail
// (per Gavin, 2026-08-18). Status: 'good' = achieved/qualified (green),
// 'warn' = in progress / short of a goal (amber), 'bad' = behind (red),
// omitted = neutral count with no goal attached (deliberately NOT red
// at zero, so a quiet program doesn't read as an alarm wall).
// tiles: [{num, label, sub, status}]
function statBoard(tiles){
  tiles = (tiles||[]).filter(Boolean);
  if(!tiles.length) return '';
  return `<div class="stat-board-wrap">
    <div class="earn-section-label">Where You Stand</div>
    <div class="stat-board">${tiles.map(t=>`<div class="stat-tile${t.status?' '+t.status:''}">
      <div class="stat-tile-num">${esc(t.num)}</div>
      <div class="stat-tile-label">${esc(t.label)}</div>
      ${t.sub?`<div class="stat-tile-sub">${esc(t.sub)}</div>`:''}
    </div>`).join('')}</div>
  </div>`;
}
// Green when the count is on the board, neutral at zero.
function cntStatus(n){ return n>0 ? 'good' : null; }

// Small greyed notice used in place of an earn-block when one SECTION of a
// program doesn't apply to this rep's route (e.g. the draft side for a rep
// with no keg-capable accounts) -- the rest of the card stays live.
function naBlock(title, text){
  return `<div class="territory-block">
    <div class="territory-block-title">${esc(title)}</div>
    <div class="territory-block-text">${esc(text)}</div>
  </div>`;
}

// Whole-card grey-out, same shape as the territory block, for a program
// this rep structurally can't participate in at all.
function notApplicableCard(logoKey, title, tag, naTitle, naText){
  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo(logoKey)}<span class="prog-name">${esc(title)}</span><span class="prog-tag">${esc(tag)}</span>${terrTag(logoKey)}</div>
      ${progPitch(logoKey)}
    </div>
    <div class="prog-body">
      ${naBlock(naTitle, naText)}
    </div>
  </div>`;
}

function territoryBlockedCard(logoKey, title, tag, brandLabel){
  return notApplicableCard(logoKey, title, tag,
    'Not Eligible — Outside Your Territory',
    `${brandLabel} is a Core Market brand, authorized for sale only in Bergen, Passaic, Passaic-FF, Sussex, Morris 1, and Morris 3. Your route has no accounts in those counties, so this program isn't applicable to you.`);
}

function card1911(rep){
  const d = (PROGRAM_DATA['1911']||{}).byRep?.[rep];
  if(!d) return '';

  const board = statBoard([
    {num:d.totalNewPlacements, label:'New Placements', status:cntStatus(d.totalNewPlacements), sub:d.draftChannelOk===false?'$10 per package placement':'$10 pkg · $100 draft'},
    {num:d.caseVolume.toFixed(0), label:'Cases Sold'},
    d.draftChannelOk===false
      ? {num:'N/A', label:'Draft', sub:'No keg-capable accounts on your route'}
      : {num:d.draftAccountsQualified, label:'Draft At 2-BBL Goal', status:cntStatus(d.draftAccountsQualified),
         sub:d.draftNew.length>d.draftAccountsQualified?`${d.draftNew.length-d.draftAccountsQualified} still building`:null},
  ]);

  const pkgBlock = earnBlock({
    icon:'📦', title:'New Package Placements',
    rate:'EARN $10', rateNote:'per new SKU placement. "New" = the account didn’t buy that 1911 SKU in May, June or July, then bought it this period. A second SKU at the same account counts again.',
    whatToDo:'Get 1911 Cider into stores that did not buy it during May–July.',
    stats:[{num:d.offPremNewCount, label:'New Accounts'}],
    detail:{
      label:'Your New Accounts',
      items:d.offPremNew.map(a=>({name:a.customer, sub:a.products.map(p=>p.product).join(', '), stat:a.date||''})),
      emptyMsg:'No new package placements yet this period.',
    },
    opportunity:{
      label:'New Accounts To Target',
      count:d.offPremTargetCount,
      note:'Stores on your list with no 1911 purchases since May 1 — each one you land pays $10. Ranked by how much volume they already move on other products.',
      items:d.offPremTargets.map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
      moreCount:Math.max(0, d.offPremTargetCount - d.offPremTargets.length),
      emptyMsg:'No stores left to target on your list right now.',
    },
  });

  const draftBlock = d.draftChannelOk===false
    ? naBlock('Draft — Not Applicable To Your Route',
        'None of your on-premise accounts can purchase kegs (per the customer base\'s Draft/Package flag), so the $100 draft placement piece doesn\'t apply to you. The package side above is your full opportunity on this program.')
    : earnBlock({
    icon:'🍺', title:'New Draft Placements',
    rate:'EARN $100', rateNote:'per new draft account, paid once that account buys 2 total barrels. "New" = no 1911 draft in May–July.',
    steps:[
      {text:'Place 1911 draft in an account that didn\'t pour it May–July', done:d.draftNewCount>0},
      {text:'Get that account to 2 total barrels — then the $100 pays', done:d.draftAccountsQualified>0},
    ],
    stats:[
      {num:d.draftNewCount, label:'New Draft Accounts'},
      {num:d.draftAccountsQualified, label:'At The 2-Barrel Goal'},
    ],
    detail:{
      label:'Your Draft Accounts',
      items:d.draftAccounts.map(a=>({name:a.customer, stat:a.cumulativeBbl.toFixed(2)+' / 2 bbl', barPct:Math.min(a.cumulativeBbl/2,1)*100, status:a.qualifies?'qualified':'progress'})),
      emptyMsg:'No draft accounts yet — place 1911 draft in a new account to get started.',
    },
    opportunity:{
      label:'New Draft Accounts To Target',
      count:d.draftTargetCount,
      note:'Bars on your list with no 1911 draft since May 1 — a new tap here starts the clock on a $100 payout.',
      items:d.draftTargets.map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
      moreCount:Math.max(0, d.draftTargetCount - d.draftTargets.length),
      emptyMsg:'No bars left to target on your list right now.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('1911')}<span class="prog-name">Beak &amp; Skiff 1911 Rewards</span><span class="prog-tag">Aug&ndash;Sept</span>${terrTag('1911')}</div>
      ${progPitch('1911')}
    </div>
    <div class="prog-body">
      ${board}
      ${pkgBlock}
      ${draftBlock}
    </div>
  </div>`;
}

function cardWoodchuck(rep){
  const d = (PROGRAM_DATA['woodchuck']||{}).byRep?.[rep];
  if(!d) return '';

  const qualMet = d.totalNewPlacements>=3;
  const board = statBoard([
    {num:`${d.totalNewPlacements} / 3`, label:'New Placements — Qualifier', status:qualMet?'good':'warn',
     sub:qualMet?'Payouts unlocked':`${3-d.totalNewPlacements} more to unlock every payout`},
    {num:d.caseVolume.toFixed(0), label:'Cases Sold', sub:'$1 each once unlocked'},
    d.draftChannelOk===false
      ? {num:'N/A', label:'Draft', sub:'No keg-capable accounts on your route'}
      : {num:d.draftAccountsQualified, label:'Draft At 3-BBL Goal', status:cntStatus(d.draftAccountsQualified)},
  ]);

  const pkgBlock = earnBlock({
    icon:'📦', title:'New Package Placements',
    rate:'EARN $10', rateNote:'per new SKU placement. "New" = the account didn’t buy that Woodchuck SKU in May, June or July, then bought it this period. A second SKU at the same account counts again.',
    whatToDo:'Get Woodchuck into stores that did not buy it during May–July.',
    stats:[{num:d.offPremNewCount, label:'New Accounts'}],
    detail:{
      label:'Your New Accounts',
      items:d.offPremNew.map(a=>({name:a.customer, sub:a.products.map(p=>p.product).join(', '), stat:a.date||''})),
      emptyMsg:'No new package placements yet this period.',
    },
    opportunity:{
      label:'New Accounts To Target',
      count:d.offPremTargetCount,
      note:'Stores on your list with no Woodchuck purchases since May 1 — each one you land pays $10 and counts toward your 3-placement qualifier. Ranked by how much volume they already move.',
      items:d.offPremTargets.map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
      moreCount:Math.max(0, d.offPremTargetCount - d.offPremTargets.length),
      emptyMsg:'No stores left to target on your list right now.',
    },
  });

  const draftBlock = d.draftChannelOk===false
    ? naBlock('Draft — Not Applicable To Your Route',
        'None of your on-premise accounts can purchase kegs (per the customer base\'s Draft/Package flag), so the $100 draft placement piece doesn\'t apply to you. The package side above is your full opportunity on this program.')
    : earnBlock({
    icon:'🍺', title:'New Draft Placements',
    rate:'EARN $100', rateNote:'per new draft account, paid once that account buys 3 total barrels. "New" = no Woodchuck draft in May–July.',
    steps:[
      {text:'Place Woodchuck draft in an account that didn\'t pour it May–July', done:d.draftNewCount>0},
      {text:'Get that account to 3 total barrels — then the $100 pays', done:d.draftAccountsQualified>0},
    ],
    stats:[
      {num:d.draftNewCount, label:'New Draft Accounts'},
      {num:d.draftAccountsQualified, label:'At The 3-Barrel Goal'},
    ],
    detail:{
      label:'Your Draft Accounts',
      items:d.draftAccounts.map(a=>({name:a.customer, stat:a.cumulativeBbl.toFixed(2)+' / 3 bbl', barPct:Math.min(a.cumulativeBbl/3,1)*100, status:a.qualifies?'qualified':'progress'})),
      emptyMsg:'No draft accounts yet — place Woodchuck draft in a new account to get started.',
    },
    opportunity:{
      label:'New Draft Accounts To Target',
      count:d.draftTargetCount,
      note:'Bars on your list with no Woodchuck draft since May 1 — a new tap here starts the clock on a $100 payout.',
      items:d.draftTargets.map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
      moreCount:Math.max(0, d.draftTargetCount - d.draftTargets.length),
      emptyMsg:'No bars left to target on your list right now.',
    },
  });

  const caseBlock = earnBlock({
    icon:'📈', title:'Case Volume Bonus',
    rate:'EARN $1', rateNote:'per case of Woodchuck sold during the period (once the 3-placement qualifier above is unlocked)',
    stats:[{num:d.caseVolume.toFixed(0), label:'Cases Sold This Period'}],
    detail:{
      label:'Where Your Cases Came From',
      items:d.caseVolumeByAccount.map(a=>({name:a.customer, stat:a.cases.toFixed(0)+' cases'})),
      emptyMsg:'No case volume yet this period.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('woodchuck')}<span class="prog-name">Woodchuck Cider Rewards</span><span class="prog-tag">Aug&ndash;Sept</span>${terrTag('woodchuck')}</div>
      ${progPitch('woodchuck')}
    </div>
    <div class="prog-body">
      ${board}
      ${pkgBlock}
      ${draftBlock}
      ${caseBlock}
    </div>
  </div>`;
}

function cardTona(rep){
  const d = (PROGRAM_DATA['tona']||{}).byRep?.[rep];
  if(!d) return '';

  const board = statBoard([
    {num:`${d.caseVolume24oz.toFixed(0)} / 20`, label:'24oz Cases — Qualifier', status:d.qualifies?'good':'warn',
     sub:d.qualifies?'Payouts unlocked':`${Math.ceil(20-d.caseVolume24oz)} more to unlock every payout`},
    {num:d.new24ozCount, label:'New 24oz Placements', status:cntStatus(d.new24ozCount), sub:'$10 each'},
    {num:d.caseVolumeOther.toFixed(0), label:'Other Tona Cases', sub:'$0.50 each once unlocked'},
  ]);
  const gateDetail = detailList({
    label:'Where Your 24oz Cases Came From',
    items:d.caseVolume24ozByAccount.map(a=>({name:a.customer, stat:a.cases.toFixed(0)+' cases'})),
    emptyMsg:'No 24oz case volume yet this period.',
  });

  const canBlock = earnBlock({
    icon:'🥫', title:'New 24oz Can Placements',
    rate:'EARN $10', rateNote:'per new SKU placement. "New" = the account didn’t buy that Tona 24oz SKU in May, June or July, then bought it this period. (Tona 24oz is a single SKU, so this is one per account.)',
    whatToDo:'Get Tona 24oz cans into stores that did not buy them during May–July.',
    stats:[{num:d.new24ozCount, label:'New Accounts'}],
    detail:{
      label:'Your New Accounts',
      items:d.new24ozNew.map(a=>({name:a.customer, sub:a.product, stat:a.date||''})),
      emptyMsg:'No new 24oz placements yet this period.',
    },
    opportunity:{
      label:'New Accounts To Target',
      count:d.targets24ozCount,
      note:'Stores on your list with no Tona 24oz cans since May 1 — each one you land pays $10. Ranked by how much volume they already move on other products.',
      items:d.targets24oz.map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
      moreCount:Math.max(0, d.targets24ozCount - d.targets24oz.length),
      emptyMsg:'No stores left to target on your list right now.',
    },
  });

  const otherBlock = earnBlock({
    icon:'📈', title:'Other Tona Case Volume',
    rate:'EARN $0.50', rateNote:'per case on all other Tona packages (once the 20-case qualifier above is unlocked)',
    stats:[{num:d.caseVolumeOther.toFixed(0), label:'Cases Sold This Period'}],
    detail:{
      label:'Where Your Cases Came From',
      items:d.caseVolumeOtherByAccount.map(a=>({name:a.customer, stat:a.cases.toFixed(0)+' cases'})),
      emptyMsg:'No other-package case volume yet this period.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('tona')}<span class="prog-name">Tona Distribution &amp; Volume</span><span class="prog-tag">Aug&ndash;Sept</span>${terrTag('tona')}</div>
      ${progPitch('tona')}
    </div>
    <div class="prog-body">
      ${board}
      ${gateDetail}
      ${canBlock}
      ${otherBlock}
    </div>
  </div>`;
}

function cardPathToVictory(rep){
  const d = (PROGRAM_DATA['path_to_victory']||{}).byRep?.[rep];
  if(!d) return '';

  const board = statBoard([
    {num:d.sixPackAccountCount, label:'6pk Accounts', status:cntStatus(d.sixPackAccountCount)},
    {num:d.sixPackUnits.toFixed(0), label:'6pk Units'},
    {num:d.nineteenTwoAccountCount, label:'19.2oz Accounts', status:cntStatus(d.nineteenTwoAccountCount)},
    {num:d.nineteenTwoUnits.toFixed(0), label:'19.2oz Units'},
  ]);

  const sixBlock = earnBlock({
    icon:'🥫', title:'Five For Fighting 6pk Cans',
    rate:'PAID VIA ISELLBEER', rateNote:'$10 per new POD, $25 per account buying 5+ 6pk cans — submit through iSellBeer to get paid',
    whatToDo:'Get Five For Fighting 6pk cans moving in new and existing accounts.',
    stats:[
      {num:d.sixPackAccountCount, label:'Accounts Buying'},
      {num:d.sixPackUnits.toFixed(0), label:'Units Sold This Period'},
    ],
    detail:{
      label:'Your Accounts Buying 6pk Cans',
      items:d.sixPackAccounts.map(a=>({name:a.customer, stat:a.date||''})),
      emptyMsg:'No 6pk can activity yet this period — get a first account buying to start the list.',
    },
  });

  const nineteenBlock = earnBlock({
    icon:'🥤', title:'19.2oz Can Bonus',
    rate:'PAID VIA ISELLBEER', rateNote:'$10 per new POD, $5 per current POD — submit through iSellBeer to get paid',
    whatToDo:'Get Victory Monkey Family 19.2oz cans moving in new and existing accounts.',
    stats:[
      {num:d.nineteenTwoAccountCount, label:'Accounts Buying'},
      {num:d.nineteenTwoUnits.toFixed(0), label:'Units Sold This Period'},
    ],
    detail:{
      label:'Your Accounts Buying 19.2oz Cans',
      items:d.nineteenTwoAccounts.map(a=>({name:a.customer, stat:a.date||''})),
      emptyMsg:'No 19.2oz can activity yet this period — get a first account buying to start the list.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('path_to_victory')}<span class="prog-name">The Path to Victory</span><span class="prog-tag">August</span>${terrTag('path_to_victory')}</div>
      ${progPitch('path_to_victory')}
    </div>
    <div class="prog-body">
      ${board}
      ${sixBlock}
      ${nineteenBlock}
    </div>
  </div>`;
}

function cardSamAdams(rep){
  const d = (PROGRAM_DATA['sam_adams']||{}).byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('sam_adams','Sam Adams Octoberfest Fast Start','August','Samuel Adams');

  const allDiff = d.allSkuUnitsThisYear - d.allSkuUnitsLastYear;
  const board = statBoard([
    {num:signedFmt(allDiff), label:'All Sam Adams vs Last Aug', status:d.isPositive?'good':'bad',
     sub:d.isPositive?'Commission doubled':'Go positive to double commission'},
    {num:signedFmt(d.octoberfestGrowth), label:'Octoberfest vs Last Aug', status:d.octoberfestGrowth>0?'good':(d.octoberfestGrowth<0?'bad':null),
     sub:'$1 per case over last Aug'},
  ]);

  const products = productAccordion({
    label:'Products — Tap To See Accounts',
    groups:(d.octoberfestByProduct||[]).map(p=>({
      name:p.product,
      sub:`2025: ${p.unitsLastYear.toFixed(0)} · 2026: ${p.unitsThisYear.toFixed(0)}`,
      stat:signedFmt(p.growth), statCls:deltaCls(p.growth),
      accounts:p.accounts.map(a=>({
        name:a.customer,
        sub:`2025: ${a.unitsLastYear.toFixed(0)} · 2026: ${a.unitsThisYear.toFixed(0)}`,
        stat:signedFmt(a.growth), statCls:deltaCls(a.growth),
      })),
    })),
    emptyMsg:'No Octoberfest activity in the data yet.',
  });

  const gapAccounts = (d.octoberfestByAccount||[])
    .filter(a=>a.growth<0 && a.unitsLastYear>0)
    .sort((a,b)=>a.growth-b.growth);

  const octoberfestBlock = earnBlock({
    icon:'🍁', title:'Octoberfest vs Last August',
    rate:'EARN $1', rateNote:'per case of Octoberfest over what you sold last August. Data compares month-to-date against ALL of last August, so the gap usually closes late in the month.',
    whatToDo:'Beat your own Octoberfest number from last August. Every case over pays $1.',
    stats:[
      {num:d.octoberfestUnitsLastYear.toFixed(0), label:'Aug 2025 Cases', dim:true},
      {num:d.octoberfestUnitsThisYear.toFixed(0), label:'Aug 2026 Cases'},
      {num:signedFmt(d.octoberfestGrowth), label:'Difference', cls:deltaCls(d.octoberfestGrowth)},
    ],
    extra:products,
    opportunity:{
      label:'Where You Can Close The Gap',
      note:'Accounts that bought Octoberfest last August but are behind that pace so far this year — the fastest way to close your number.',
      items:gapAccounts.slice(0,10).map(a=>({name:a.customer, stat:signedFmt(a.growth)+' vs last Aug'})),
      moreCount:Math.max(0, gapAccounts.length-10),
      emptyMsg:'No gap accounts — every account that bought last August is at or ahead of pace.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('sam_adams')}<span class="prog-name">Sam Adams Octoberfest Fast Start</span><span class="prog-tag">August</span>${terrTag('sam_adams')}</div>
      ${progPitch('sam_adams')}
    </div>
    <div class="prog-body">
      ${board}
      <div class="empty-note">Early-month note: this compares month-to-date against ALL of last August, so red here usually flips late in the month.</div>
      ${octoberfestBlock}
    </div>
  </div>`;
}

function cardBostonBeer(rep){
  const d = (PROGRAM_DATA['boston_beer']||{}).byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('boston_beer','Boston Beer August Draft Blitz','August','Angry Orchard / Dogfish Head');

  const board = statBoard([
    ...(d.draftChannelOk===false
      ? [{num:'N/A', label:'Draft', sub:'No keg-capable Core Market accounts'}]
      : [{num:d.draftNewCount, label:'New Draft PODs', status:cntStatus(d.draftNewCount), sub:'$100 each'},
         {num:d.draftRebuyCount, label:'Draft Rebuys', status:cntStatus(d.draftRebuyCount), sub:'$50 each'}]),
    d.packageChannelOk===false
      ? {num:'N/A', label:'Package', sub:'No Core Market off-premise accounts'}
      : {num:d.packageNewCount, label:'New Pkg Placements', status:cntStatus(d.packageNewCount), sub:'$10 each'},
    {num:d.points, label:'Trip Points', status:cntStatus(d.points)},
  ]);

  const draftLapsed = dedupeByCustomer(d.draftLapsed);
  const draftItems = [
    ...d.draftNew.map(a=>({name:a.customer, sub:a.products.map(p=>p.product).join(', '), stat:'new POD · '+(a.date||''), status:'qualified'})),
    ...d.draftRebuy.map(a=>({name:a.customer, sub:a.products.map(p=>p.product).join(', '), stat:'rebuy · '+(a.date||''), status:'qualified'})),
  ];
  const draftWhitespace = d.draftWhitespace||[];
  const draftBlock = d.draftChannelOk===false
    ? naBlock('Draft — Not Applicable To Your Route',
        'None of your Core Market on-premise accounts can purchase kegs (per the customer base\'s Draft/Package flag), so the $100/$50 draft piece doesn\'t apply to you. The package side below is your opportunity on this program.')
    : earnBlock({
    icon:'🍺', title:'Draft — New PODs & Rebuys',
    rate:'$100 / $50', rateNote:'$100 per new POD (no Angry Orchard / Dogfish Head draft in May–July, then a keg this period) · $50 per rebuy at an account that already pours it',
    whatToDo:'Two ways to earn: open a new tap handle, or get an existing draft account to buy another keg.',
    stats:[
      {num:d.draftNewCount, label:'New PODs ($100 each)'},
      {num:d.draftRebuyCount, label:'Rebuys ($50 each)'},
    ],
    detail:{
      label:'Your Draft Activity',
      items:draftItems,
      emptyMsg:'No draft keg activity yet this period.',
    },
    opportunities:[
      {
        label:'Accounts To Rebuy — $50 Each',
        note:'These accounts poured Boston Beer draft during May–July but haven\'t bought a keg yet this period. One more keg order = $50.',
        items:draftLapsed.map(a=>({name:a.customer, stat:'last keg '+(a.lastDate||'—')})),
        emptyMsg:'No rebuy opportunities right now — every base-period draft account has already re-ordered.',
      },
      {
        label:'New Accounts To Target — $100 Each',
        note:'On-premise accounts in your territory with no Boston Beer draft history at all — true candidates for a new POD.',
        items:draftWhitespace.map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
        emptyMsg:'Every on-premise account on your list already carries Boston Beer draft.',
      },
    ],
  });

  const packageWhitespace = d.packageWhitespace||[];
  const packageBlock = d.packageChannelOk===false
    ? naBlock('Package — Not Applicable To Your Route',
        'You have no Core Market off-premise accounts on your route, so the $10 single-serve placement piece doesn\'t apply to you. The draft side is your opportunity on this program.')
    : earnBlock({
    icon:'🥫', title:'Package — Single-Serve Cans',
    rate:'EARN $10', rateNote:'per new single-serve placement (Angry Orchard 19.2oz, Dogfish 60/90 Minute, Grateful Dead 19.2oz) — no purchases in May–July, then a purchase this period',
    whatToDo:'Get the single-serve cans into stores that did not buy them during May–July.',
    stats:[{num:d.packageNewCount, label:'New Placements'}],
    detail:{
      label:'Your New Placements',
      items:d.packageNew.map(a=>({name:a.customer, sub:a.products.map(p=>p.product).join(', '), stat:a.date||''})),
      emptyMsg:'No new package placements yet this period.',
    },
    opportunity:{
      label:'New Accounts To Target — $10 Each',
      note:'Off-premise accounts in your territory with no Boston Beer single-serve history at all — true candidates for a new placement.',
      items:packageWhitespace.map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
      emptyMsg:'Every off-premise account on your list already carries Boston Beer package.',
    },
  });

  const tripBlock = earnBlock({
    icon:'✈️', title:'Cidery Trip Bonus',
    rate:d.points+' PTS', rateNote:'Draft POD or rebuy = 2 pts, package placement = 1 pt. One on-premise and one off-premise rep with the most points win the trip.',
    stats:[
      {num:d.draftNewCount+d.draftRebuyCount, label:'Draft Actions (2 pts each)'},
      {num:d.packageNewCount, label:'Package Actions (1 pt each)'},
    ],
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('boston_beer')}<span class="prog-name">Boston Beer August Draft Blitz</span><span class="prog-tag">August</span>${terrTag('boston_beer')}</div>
      ${progPitch('boston_beer')}
    </div>
    <div class="prog-body">
      ${board}
      ${draftBlock}
      ${packageBlock}
      ${tripBlock}
    </div>
  </div>`;
}

function cardNewBelgium(rep){
  const d = (PROGRAM_DATA['new_belgium']||{}).byRep?.[rep];
  const prog = PROGRAM_DATA['new_belgium']||{};
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('new_belgium','New Belgium Draft (Summer Draft Focus)','August',"Bell's / Voodoo Ranger / Fat Tire");
  if(d.draftEligible===false) return notApplicableCard('new_belgium','New Belgium Draft (Summer Draft Focus)','August',
    'Not Applicable — No Draft Accounts On Your Route',
    'This program pays only on kegs. None of your Core Market on-premise accounts can purchase kegs (per the customer base\'s Draft/Package flag), so there\'s nothing for you to earn here.');

  const board = statBoard([
    {num:d.featuredNewCount, label:'New Featured PODs', status:cntStatus(d.featuredNewCount), sub:'up to $100 each'},
    {num:d.featuredRebuyCount, label:'Featured Rebuys', status:cntStatus(d.featuredRebuyCount), sub:'up to $50 each'},
    {num:d.otherNamedKegCount, label:'Voodoo / Fat Tire Kegs', status:cntStatus(d.otherNamedKegCount), sub:'$25 each'},
  ]);

  const houseBanner = qualifierBanner({
    label:'Company-wide goal, informational only — your own $ payouts below aren\'t gated by this',
    current:prog.housePodsTotal||0, goal:prog.houseGoal||70, unit:'house PODs', met:(prog.housePodsTotal||0)>=(prog.houseGoal||70),
    metTitle:'Company Goal Hit', lockedTitle:'Company Progress',
  });

  const featuredLapsed = dedupeByCustomer(d.featuredLapsed);
  const featuredWhitespace = d.featuredWhitespace||[];
  const featuredItems = [
    ...d.featuredNew.map(a=>({name:a.customer, sub:a.product, stat:(a.isHalfBbl?'$100':'$50')+' · new · '+(a.date||''), status:'qualified'})),
    ...d.featuredRebuy.map(a=>({name:a.customer, sub:a.product, stat:(a.isHalfBbl?'$50':'$25')+' · rebuy · '+(a.date||''), status:'qualified'})),
  ];
  const featuredBlock = earnBlock({
    icon:'🍺', title:'Featured Draft — Juicy Haze / Two Hearted',
    rate:'$100 / $50', rateNote:'New POD: $100 per half-barrel, $50 per smaller keg (no purchases of that draft SKU in May–July). Rebuys pay half: $50 / $25.',
    whatToDo:'Two ways to earn: open a new Juicy Haze or Two Hearted tap, or get an existing one re-ordered.',
    stats:[
      {num:d.featuredNewCount, label:'New PODs'},
      {num:d.featuredRebuyCount, label:'Rebuys'},
    ],
    detail:{
      label:'Your Featured Draft Activity',
      items:featuredItems,
      emptyMsg:'No featured-tier draft activity yet this period.',
    },
    opportunities:[
      {
        label:'Kegs To Rebuy — $50 / $25 Each',
        note:'These accounts poured Juicy Haze / Two Hearted during May–July but haven\'t bought that keg again this period. One more keg = a rebuy payout.',
        items:featuredLapsed.map(a=>({name:a.customer, stat:'last keg '+(a.lastDate||'—')})),
        emptyMsg:'No rebuy opportunities right now — every base-period tap has already re-ordered.',
      },
      {
        label:'New Accounts To Target',
        note:'On-premise accounts in your territory with no Juicy Haze / Two Hearted history at all — true candidates for a new POD.',
        items:featuredWhitespace.map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
        emptyMsg:'Every on-premise account on your list already carries a featured-tier SKU.',
      },
    ],
  });

  const otherBlock = earnBlock({
    icon:'🛻', title:'Voodoo Ranger & Fat Tire',
    rate:'EARN $25', rateNote:'per keg, any size — new or rebuy, every keg counts the same',
    stats:[
      {num:d.otherNamedKegCount, label:'Kegs This Period'},
      {num:d.otherNamedKegVolumeBbl.toFixed(2)+' bbl', label:'Volume This Period'},
    ],
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('new_belgium')}<span class="prog-name">New Belgium Draft (Summer Draft Focus)</span><span class="prog-tag">August</span>${terrTag('new_belgium')}</div>
      ${progPitch('new_belgium')}
    </div>
    <div class="prog-body">
      ${board}
      ${houseBanner}
      ${featuredBlock}
      ${otherBlock}
    </div>
  </div>`;
}

function cardLytt(rep){
  const d = (PROGRAM_DATA['lytt']||{}).byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('lytt','Lytt Launch','Aug–Sept','Lytt');
  if(d.programEligible===false) return notApplicableCard('lytt','Lytt Launch','Aug–Sept',
    'Not Applicable — No Off-Premise Accounts On Your Route',
    'Lytt penetration is measured across your off-premise account book, and you have no eligible off-premise accounts on your route, so this program isn\'t applicable to you.');

  const nextTier = LYTT_TIER_DEFS.find(t=>d.penetrationPct < t.pct*100);
  const tierChips = LYTT_TIER_DEFS.map(t=>{
    const reached = d.penetrationPct >= t.pct*100;
    const isNext = !reached && nextTier && t.pct===nextTier.pct;
    const cls = reached ? ' done' : (isNext ? ' next' : '');
    const icon = reached ? '✅' : (isNext ? '🎯' : '🔒');
    return `<div class="tier-chip${cls}"><span class="tier-chip-icon">${icon}</span><span><b>${(t.pct*100).toFixed(0)}% penetration</b> — $${t.rate.toFixed(2)}/case${reached?' · reached':''}</span></div>`;
  }).join('');

  let nextGoalHtml;
  if(nextTier){
    const needed = Math.max(1, Math.ceil(nextTier.pct*d.eligibleAccountCount - 1e-9) - d.buyingAccountCount);
    nextGoalHtml = `<div class="next-goal">
      <div class="next-goal-label">Next Goal</div>
      <div class="next-goal-main">${(nextTier.pct*100).toFixed(0)}% penetration — $${nextTier.rate.toFixed(2)}/case</div>
      <div class="next-goal-sub">Need ${needed} more account${needed===1?'':'s'} at ${d.minSkus||1}+ Lytt SKUs</div>
    </div>`;
  } else {
    nextGoalHtml = `<div class="next-goal" style="border-color:var(--good)">
      <div class="next-goal-label" style="color:var(--good)">Top Tier Reached</div>
      <div class="next-goal-main">$2.00/case locked in through Dec 31</div>
    </div>`;
  }

  const rateLine = d.tier
    ? `${d.caseVolume.toFixed(0)} cases sold this period — earning $${d.rate.toFixed(2)}/case, locked in through Dec 31`
    : `${d.caseVolume.toFixed(0)} cases sold this period — hit your first tier to turn on the per-case payout`;

  const minSkus = d.minSkus||1;
  const buying = detailList({
    label:`Accounts Counting (${minSkus}+ SKUs)`,
    items:d.buyingAccounts.map(a=>({name:a.customer, stat:(a.skus?`${a.skus} SKUs`:'')+(a.date?` · ${a.date}`:'')})),
    emptyMsg:`No accounts counting yet — an account needs ${minSkus} Lytt SKUs before it moves your percentage.`,
  });
  // Carrying Lytt but under the SKU bar: not counted, and not whitespace
  // either, so without this section they'd disappear from the card entirely --
  // even though they're the cheapest accounts on the list to convert.
  const partial = (d.partialAccounts||[]).length ? oppSection({
    label:'Carrying Lytt — Not Counting Yet',
    note:`These accounts buy Lytt but stock fewer than ${minSkus} SKUs, so they don't count toward your percentage yet. Adding a SKU or two here is the fastest way to move it.`,
    items:d.partialAccounts.map(a=>({name:a.customer, stat:`${a.skus} of ${minSkus} SKUs · needs ${a.need}`})),
    emptyMsg:'',
  }) : '';
  const available = oppSection({
    label:'Accounts Still Available',
    note:'Off-premise accounts on your list that don\'t carry Lytt yet — every one you land moves you toward the next tier. Ranked by how much volume they already move.',
    items:(d.whitespaceAccounts||[]).map(a=>({name:a.customer, stat: casesStat(a.cases2026)})),
    emptyMsg:'You\'re already selling Lytt into every eligible account in your book — great work.',
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('lytt')}<span class="prog-name">Lytt Launch</span><span class="prog-tag">Aug&ndash;Sept</span>${terrTag('lytt')}</div>
      ${progPitch('lytt')}
    </div>
    <div class="prog-body">
      <div class="tier-hero">
        <div class="tier-hero-label">You Are Here</div>
        <div class="tier-hero-pct" style="color:${d.tier?'var(--good)':(d.penetrationPct>0?'var(--amber)':'var(--text)')}">${d.penetrationPct.toFixed(1)}%</div>
        <div class="tier-hero-sub">${d.buyingAccountCount} of ${d.eligibleAccountCount} accounts at ${d.minSkus||1}+ SKUs${d.tier?` · ✅ ${esc(d.tier)}`:''}</div>
      </div>
      <div class="tier-list">${tierChips}</div>
      ${nextGoalHtml}
      <div class="empty-note">${esc(rateLine)}</div>
      ${buying}
      ${partial}
      ${available}
    </div>
  </div>`;
}

function cardFallSeasonal(rep){
  const po = (PROGRAM_DATA['fall_seasonal']||{}).package_only?.byRep?.[rep];
  const pd = (PROGRAM_DATA['fall_seasonal']||{}).packages_and_draft?.byRep?.[rep];
  if(!po && !pd) return '';

  // Group the per-(account, product) placement rows by product so each
  // product is one expandable row showing the accounts behind it
  // (per Gavin 2026-08-18, request 8 -- don't dump every product and
  // account on screen at once).
  const pkgRows = [...(po?po.packagePlacements:[]), ...(pd?pd.packagePlacements:[])];
  const pkgByProduct = {};
  for(const r of pkgRows){
    const g = pkgByProduct[r.product] || (pkgByProduct[r.product] = {ce:0, accounts:[]});
    g.ce += r.caseEquivalents;
    g.accounts.push({name:r.customer, stat:r.caseEquivalents.toFixed(1)+' CE'});
  }
  const pkgGroups = Object.entries(pkgByProduct)
    .map(([product,g])=>({
      name:product,
      stat:g.ce.toFixed(1)+' CE',
      accounts:g.accounts.sort((a,b)=>parseFloat(b.stat)-parseFloat(a.stat)),
    }))
    .sort((a,b)=>parseFloat(b.stat)-parseFloat(a.stat));

  const totalCE = (po?po.packageCaseEquivalents:0) + (pd?pd.packageCaseEquivalents:0);
  const board = statBoard([
    {num:totalCE.toFixed(1), label:'Package CE', status:cntStatus(totalCE), sub:'$0.50 each'},
    {num:pd?pd.sixtelCount:0, label:'Sixtels', status:cntStatus(pd?pd.sixtelCount:0), sub:'$5 each'},
    {num:pd?pd.halfKegCount:0, label:'Half-Kegs', status:cntStatus(pd?pd.halfKegCount:0), sub:'$10 each'},
  ]);
  const ceBlock = earnBlock({
    icon:'🎃', title:'Package',
    rate:'EARN $0.50', rateNote:'per case-equivalent on every qualifying Fall Seasonal package — pumpkin, Oktoberfest, and more',
    whatToDo:'Be first to market: get Fall Seasonal packages selling everywhere you can.',
    stats:[{num:totalCE.toFixed(1), label:'Case Equivalents This Period'}],
    extra:productAccordion({
      label:'Products — Tap To See Accounts',
      groups:pkgGroups,
      emptyMsg:'No Fall Seasonal package activity yet this period — get your first placement on the board.',
    }),
  });

  const kegRows = [
    ...(pd?pd.sixtelKegs:[]).map(k=>({product:k.product, customer:k.customer, volumeBbl:k.volumeBbl, tier:'sixtel · $5 each'})),
    ...(pd?pd.halfKegKegs:[]).map(k=>({product:k.product, customer:k.customer, volumeBbl:k.volumeBbl, tier:'half-keg · $10 each'})),
    ...(pd?pd.otherKegs:[]).map(k=>({product:k.product, customer:k.customer, volumeBbl:k.volumeBbl, tier:'other size'})),
  ];
  const kegByProduct = {};
  for(const r of kegRows){
    const g = kegByProduct[r.product] || (kegByProduct[r.product] = {bbl:0, count:0, tier:r.tier, accounts:[]});
    g.bbl += r.volumeBbl;
    g.count += 1;
    g.accounts.push({name:r.customer, sub:r.tier, stat:r.volumeBbl.toFixed(2)+' bbl'});
  }
  const kegGroups = Object.entries(kegByProduct)
    .map(([product,g])=>({
      name:product,
      sub:g.tier,
      stat:g.bbl.toFixed(2)+' bbl',
      accounts:g.accounts,
    }))
    .sort((a,b)=>parseFloat(b.stat)-parseFloat(a.stat));

  const kegBlock = earnBlock({
    icon:'🛢️', title:'Draft',
    rate:'$5 / $10', rateNote:`$5.00 per sixtel, $10.00 per half-keg${pd&&pd.otherKegCount?`. ${pd.otherKegCount} keg(s) this period were other sizes (1/4bbl, 50L) with no rate stated in the deck.`:''}`,
    stats:[
      {num:pd?pd.sixtelCount:0, label:'Sixtels'},
      {num:pd?pd.halfKegCount:0, label:'Half-Kegs'},
    ],
    extra:productAccordion({
      label:'Draft Products — Tap To See Accounts',
      groups:kegGroups,
      emptyMsg:'No Fall Seasonal draft activity yet this period.',
    }),
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('fall_seasonal')}<span class="prog-name">Fall Seasonal Fast Start</span><span class="prog-tag">August</span>${terrTag('fall_seasonal')}</div>
      ${progPitch('fall_seasonal')}
    </div>
    <div class="prog-body">
      ${board}
      ${ceBlock}
      ${kegBlock}
    </div>
  </div>`;
}

function cardSunCruiser(rep){
  const d = (PROGRAM_DATA['sun_cruiser']||{}).byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('sun_cruiser','Sun Cruiser Volume','May–Aug','Sun Cruiser');

  const totalDiff = d.totalCasesThisYear - d.totalCasesLastYear;
  const board = statBoard([
    {num:signedFmt(totalDiff), label:'Total vs Last Year', status:totalDiff>0?'good':(totalDiff<0?'bad':null),
     sub:totalDiff>0?'Payout unlocked':'Payout starts once you beat last year'},
    {num:'+'+d.rate1CaseGrowth.toFixed(0), label:'$1-Tier Case Growth', status:cntStatus(d.rate1CaseGrowth)},
    {num:'+'+d.rate3CaseGrowth.toFixed(0), label:'$3-Tier Case Growth', status:cntStatus(d.rate3CaseGrowth)},
  ]);

  const rate1Block = earnBlock({
    icon:'🥤', title:'$1/Case Packages',
    rate:'EARN $1', rateNote:'per case sold over last year — 12pk, 8pk, 18pk, and 24pk formats',
    whatToDo:'Sell more of these packages than you did May–Aug last year. Every extra case pays $1.',
    stats:[
      {num:d.rate1CaseGrowth.toFixed(0), label:'Cases Over Last Year'},
      {num:d.totalCasesThisYear.toFixed(0)+' / '+d.totalCasesLastYear.toFixed(0), label:'This Year / Last Year (all packages)', dim:true},
    ],
    detail:{
      label:'Where Your Growth Came From',
      items:d.rate1Lines.map(l=>({name:l.product, sub:l.packages, stat:'+'+l.caseGrowth.toFixed(0)+' cases', statCls:'pos'})),
      emptyMsg:'No $1-tier growth yet — sell more 12pk/8pk/18pk or 24pk than last year to get on the board.',
    },
  });

  const rate3Block = earnBlock({
    icon:'🧃', title:'$3/Case Packages',
    rate:'EARN $3', rateNote:'per case sold over last year — 4pk and single-serve (19.2oz/24oz) formats',
    whatToDo:'Sell more 4pks and single-serves than last year. Every extra case pays $3.',
    stats:[{num:d.rate3CaseGrowth.toFixed(0), label:'Cases Over Last Year'}],
    detail:{
      label:'Where Your Growth Came From',
      items:d.rate3Lines.map(l=>({name:l.product, sub:l.packages, stat:'+'+l.caseGrowth.toFixed(0)+' cases', statCls:'pos'})),
      emptyMsg:'No $3-tier growth yet — sell more 4pk or single-serve cans than last year to get on the board.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('sun_cruiser')}<span class="prog-name">Sun Cruiser Volume</span><span class="prog-tag">May&ndash;Aug</span>${terrTag('sun_cruiser')}</div>
      ${progPitch('sun_cruiser')}
    </div>
    <div class="prog-body">
      ${board}
      ${rate1Block}
      ${rate3Block}
    </div>
  </div>`;
}

function cardYave(rep){
  const d = (PROGRAM_DATA['yave']||{}).byRep?.[rep];
  if(!d) return '';

  const onStatus = d.onPremAccountCount>=2 ? 'good' : (d.onPremAccountCount>=1 ? 'warn' : null);
  const offStatus = d.offPremAccountCount>=5 ? 'good' : (d.offPremAccountCount>=1 ? 'warn' : null);
  const board = statBoard([
    d.hasOnPremAccounts===false
      ? {num:'N/A', label:'On-Premise', sub:'No on-premise accounts on your route'}
      : {num:`${d.onPremAccountCount} / 2`, label:'On-Prem Accounts', status:onStatus,
         sub:d.onPremAccountCount>=2?'$25 milestone hit':(d.onPremAccountCount>=1?'1 more for $25':'First account pays $10')},
    d.hasOffPremAccounts===false
      ? {num:'N/A', label:'Off-Premise', sub:'No off-premise accounts on your route'}
      : {num:`${d.offPremAccountCount} / 5`, label:'Off-Prem Accounts', status:offStatus,
         sub:d.offPremAccountCount>=5?'$125 milestone hit':(d.offPremAccountCount>=3?`${5-d.offPremAccountCount} more for $125`:(d.offPremAccountCount>=1?`${3-d.offPremAccountCount} more for $50`:'First account pays $15'))},
  ]);

  const onMilestone = d.onPremAccountCount>=2 ? 25 : (d.onPremAccountCount>=1 ? 10 : 0);
  const onNextGoal = d.onPremAccountCount<1 ? 1 : 2;
  const onBlock = d.hasOnPremAccounts===false
    ? naBlock('On-Premise — Not Applicable To Your Route',
        'You have no on-premise accounts on your route, so the bar/restaurant side of this launch doesn\'t apply to you. The off-premise side below is your opportunity.')
    : earnBlock({
    icon:'🍸', title:'On-Premise (Bottles)',
    rate: onMilestone ? '$'+onMilestone : 'EARN $10+', rateNote:'1 qualifying account = $10, 2 qualifying accounts = $25. An account qualifies at 2+ bottles.',
    whatToDo:'Get bars pouring Yave — 2 bottles at an account makes it count.',
    stats:[{num:d.onPremAccountCount, label:'Qualifying Accounts (2+ bottles)'}],
    progress:{pct:Math.min(d.onPremAccountCount/2,1)*100, caption: d.onPremAccountCount>=2 ? 'Top milestone reached' : `${onNextGoal-d.onPremAccountCount} more account${onNextGoal-d.onPremAccountCount===1?'':'s'} to $${d.onPremAccountCount<1?10:25}`},
    detail:{
      label:'Your Qualifying Accounts',
      items:d.onPremAccounts.map(a=>({name:a.customer, stat:a.bottles+' bottles'})),
      emptyMsg:'No on-premise accounts at 2+ bottles yet — that\'s the bar to start earning.',
    },
  });

  const offMilestone = d.offPremAccountCount>=5?125:(d.offPremAccountCount>=3?50:(d.offPremAccountCount>=1?15:0));
  const offNextGoal = d.offPremAccountCount<1?1:(d.offPremAccountCount<3?3:5);
  const offBlock = d.hasOffPremAccounts===false
    ? naBlock('Off-Premise — Not Applicable To Your Route',
        'You have no off-premise accounts on your route, so the store side of this launch doesn\'t apply to you. The on-premise side above is your opportunity.')
    : earnBlock({
    icon:'🛍️', title:'Off-Premise (Cases)',
    rate: offMilestone ? '$'+offMilestone : 'EARN $15+', rateNote:'1 account = $15, 3 accounts = $50, 5 accounts = $125. An account qualifies at 1+ case (6pk).',
    whatToDo:'Get stores stocking Yave — 1 case at an account makes it count.',
    stats:[{num:d.offPremAccountCount, label:'Qualifying Accounts (1+ case)'}],
    progress:{pct:Math.min(d.offPremAccountCount/5,1)*100, caption: d.offPremAccountCount>=5 ? 'Top milestone reached' : `${offNextGoal-d.offPremAccountCount} more account${offNextGoal-d.offPremAccountCount===1?'':'s'} to the next milestone`},
    detail:{
      label:'Your Qualifying Accounts',
      items:d.offPremAccounts.map(a=>({name:a.customer, stat:a.cases+' cases'})),
      emptyMsg:'No off-premise accounts at 1+ case yet — that\'s the bar to start earning.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('yave')}<span class="prog-name">Yave Tequila Launch</span><span class="prog-tag">Jul&ndash;Aug</span>${terrTag('yave')}</div>
      ${progPitch('yave')}
    </div>
    <div class="prog-body">
      ${board}
      ${onBlock}
      ${offBlock}
    </div>
  </div>`;
}

// iSellBeer Summer Display Auction. Points, not dollars -- reps spend
// them at the auction -- so the card leads with the point total and the
// rep-board rank rather than an earn rate. Wired in 2026-08-25 at Gavin's
// request; the numbers come straight from the auction tracker's own
// scored data (see build_display_auction() in generate.py), so this tile
// is only as current as that tracker's last refresh.
function cardDisplayAuction(rep){
  const P = PROGRAM_DATA['display_auction']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  const meta = P.meta||{};
  const window = (meta.startDate && meta.endDate) ? `${meta.startDate} – ${meta.endDate}` : 'this period';
  const notCounted = Math.max(0, (d.submitted||0) - (d.qualifying||0));

  const onBoard = d.points > 0;
  const board = statBoard([
    {num:d.points.toLocaleString('en-US'), label:'Auction Points', status:onBoard?'good':null,
     sub:onBoard?`Earned ${window}`:'Nothing on the board yet'},
    onBoard
      ? {num:`#${d.rank}`, label:'Rank Among Reps', sub:`of ${P.repCount} reps scoring`}
      : {num:'—', label:'Rank Among Reps', sub:`${P.repCount} reps are on the board`},
    {num:d.qualifying.toLocaleString('en-US'), label:'Qualifying Displays',
     sub:notCounted?`${notCounted.toLocaleString('en-US')} submitted under 10 cases — no points`
        :(onBoard?'Every display you submitted scored':'Submit one in iSellBeer to get started')},
    {num:d.priorityQualifying.toLocaleString('en-US'), label:'Priority-Brand Displays',
     sub:`${d.otherQualifying.toLocaleString('en-US')} all-other · priority pays double`},
  ]);

  // Scoring displays only -- a submission under 10 cases is on the
  // tracker but earns nothing, and the stat tile above already counts
  // those. Collapsed by default like every other long list on this page:
  // a strong month here runs past 50 rows.
  const scoring = (d.displays||[]).filter(x=>(x.points||0) > 0);
  const items = scoring.map(x=>({
    name:x.customer || '—',
    sub:[x.city, x.date, (x.brands||[]).join(', ')].filter(Boolean).join(' · '),
    stat:`${(x.points||0).toLocaleString('en-US')} pts · ${(x.cases||0).toLocaleString('en-US')} cases`,
    statCls:'pos',
    link:x.photo?{href:x.photo, label:'View Photo'}:null,
  }));

  const block = earnBlock({
    icon:'📸', title:'Display Auction Points',
    rate:'EARN POINTS', rateNote:'10+ cases to score · priority brands 200/300/500/1000 pts by size, all other brands 100/200/300/600',
    whatToDo:'Build big displays and photograph them in iSellBeer. A display needs 10+ cases to score at all, and the point tiers jump at 20, 40 and 70 cases — so one large display is worth far more than several small ones. Priority brands pay roughly double an all-other brand at the same size.',
    stats:[
      {num:d.points.toLocaleString('en-US'), label:'Your Points'},
      {num:d.qualifying.toLocaleString('en-US'), label:'Scoring Displays'},
      {num:onBoard?`#${d.rank}`:'—', label:'Rep Rank'},
    ],
    detail:{
      label:'Your Scoring Displays',
      items,
      emptyMsg:'No scoring displays on the board yet this period.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('display_auction')}<span class="prog-name">iSellBeer Summer Display Auction</span><span class="prog-tag">Jul&ndash;Aug</span>${terrTag('display_auction')}</div>
      ${progPitch('display_auction')}
    </div>
    <div class="prog-body">
      ${board}
      ${block}
      <div class="prog-foot-note">Rank is among the ${P.repCount} sales reps on this page. Sales Associates compete in the same auction on the same point scale and are not shown here &mdash; the full board, associates included, is on the <a href="../isellbeer/display-auction-tracker/index.html">Display Auction Tracker</a>.</div>
    </div>
  </div>`;
}

function cardMollys(rep){
  const d = (PROGRAM_DATA['mollys']||{}).byRep?.[rep];
  if(!d) return '';

  const board = statBoard([
    {num:d.newPodCount, label:'New PODs', status:cntStatus(d.newPodCount), sub:'$50 each'},
    {num:d.rebuyCount, label:'Accounts Rebuying', status:cntStatus(d.rebuyCount)},
    {num:d.rebuyCaseVolume.toFixed(0), label:'Rebuy Cases', sub:'$10 each'},
  ]);

  const podBlock = earnBlock({
    icon:'🍾', title:'New Placements',
    rate:'EARN $50', rateNote:'per new Molly\'s 1.75L placement — the account must have gone 90 days without buying it',
    whatToDo:'Get Molly\'s 1.75L into accounts that haven\'t bought it in 90 days.',
    stats:[{num:d.newPodCount, label:'New Placements'}],
    detail:{
      label:'Your New Placements',
      items:d.newPod.map(a=>({name:a.customer, stat:a.date||''})),
      emptyMsg:'No new placements yet this period.',
    },
  });

  const lapsed = dedupeByCustomer(d.lapsed);
  const rebuyBlock = earnBlock({
    icon:'🔁', title:'Retention Bonus — Rebuys',
    rate:'EARN $10', rateNote:'per case, every time an account that already carries Molly\'s buys again during the period',
    whatToDo:'Get your existing Molly\'s accounts to re-order during the period.',
    stats:[
      {num:d.rebuyCount, label:'Accounts Rebuying'},
      {num:d.rebuyCaseVolume.toFixed(0), label:'Rebuy Cases'},
    ],
    detail:{
      label:'Your Rebuy Accounts',
      items:d.rebuy.map(a=>({name:a.customer, stat:(a.cases||0).toFixed(0)+' cases'})),
      emptyMsg:'No rebuys yet this period.',
    },
    opportunity:{
      label:'Accounts To Rebuy — $10/Case',
      note:'These accounts bought Molly\'s in the spring window but haven\'t re-ordered this period. Every case they buy now pays $10.',
      items:lapsed.map(a=>({name:a.customer, stat:'last bought '+(a.lastDate||'—')})),
      emptyMsg:'No rebuy opportunities right now — every prior account has already re-ordered.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('mollys')}<span class="prog-name">Molly's 1.75L</span><span class="prog-tag">Jul&ndash;Aug</span>${terrTag('mollys')}</div>
      ${progPitch('mollys')}
    </div>
    <div class="prog-body">
      ${board}
      ${podBlock}
      ${rebuyBlock}
    </div>
  </div>`;
}

function cardGarageBeerSummerSequel(rep){
  const d = (PROGRAM_DATA['garage_beer_summer_sequel']||{}).byRep?.[rep];
  if(!d || d.tieredGoal==null) return '';

  let nextGoalNote;
  if(d.caseEquiv >= d.superBonusGoal) nextGoalNote = 'Top tier reached — Super Bonus rate is active.';
  else if(d.caseEquiv >= d.bonusGoal) nextGoalNote = `${(d.superBonusGoal-d.caseEquiv).toFixed(0)} more CE to Super Bonus ($2.00/CE).`;
  else if(d.caseEquiv >= d.tieredGoal) nextGoalNote = `${(d.bonusGoal-d.caseEquiv).toFixed(0)} more CE to Bonus ($1.50/CE).`;
  else nextGoalNote = `${(d.tieredGoal-d.caseEquiv).toFixed(0)} more CE to Tiered ($1.00/CE).`;

  const atTop = d.caseEquiv >= d.superBonusGoal;
  const board = statBoard([
    {num:d.caseEquiv.toFixed(0), label:'Your CE', status:d.tier?'good':'warn',
     sub:d.tier?`${d.tier} tier active`:`${(d.tieredGoal-d.caseEquiv).toFixed(0)} CE to first tier`},
    atTop
      ? {num:'✓', label:'Super Bonus', status:'good', sub:'$2.00/CE — top tier reached'}
      : {num:(d.caseEquiv >= d.bonusGoal ? (d.superBonusGoal-d.caseEquiv) : (d.caseEquiv >= d.tieredGoal ? (d.bonusGoal-d.caseEquiv) : (d.tieredGoal-d.caseEquiv))).toFixed(0),
         label:'CE To Next Tier', status:'warn'},
  ]);

  const block = earnBlock({
    icon:'📊', title:'Volume Push Tiers',
    rate: d.tier || 'BUILDING',
    rateNote:'Your own goals, three tiers: Tiered = $1.00/CE over 2025, Bonus = $1.50/CE, Super Bonus = $2.00/CE',
    whatToDo:'Beat your personal Garage Beer volume goals — each goal you clear raises your per-case rate.',
    stats:[
      {num:d.caseEquiv.toFixed(0), label:'Case Equivalents This Period'},
      {num:d.tieredGoal.toFixed(0)+' / '+d.bonusGoal.toFixed(0)+' / '+d.superBonusGoal.toFixed(0), label:'Your Tiered / Bonus / Super Bonus Goals', dim:true},
    ],
    progress:{pct:Math.min(d.caseEquiv/d.superBonusGoal,1)*100, caption:nextGoalNote},
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('garage_beer_summer_sequel')}<span class="prog-name">Garage Beer Summer Sequel</span><span class="prog-tag">Jun&ndash;Aug</span>${terrTag('garage_beer_summer_sequel')}</div>
      ${progPitch('garage_beer_summer_sequel')}
    </div>
    <div class="prog-body">
      ${board}
      ${block}
      <div class="empty-note">Draft bonus ($50 new / $100 rebuy after 3 kegs) and the $5 iSellBeer feature bonus aren't tracked here — no account-level data in this file.</div>
    </div>
  </div>`;
}

function cardGarageBeerPresident(rep){
  const d = (PROGRAM_DATA['garage_beer_president']||{}).byRep?.[rep];
  const prog = PROGRAM_DATA['garage_beer_president']||{};
  if(!d) return '';

  const houseMet = (prog.companyTotalThisYear||0) >= (prog.houseGoal||9305);
  const houseBanner = qualifierBanner({
    label:'Company-wide goal — once the whole company crosses 9,305 CE, everyone starts earning',
    current:prog.companyTotalThisYear||0, goal:prog.houseGoal||9305, unit:'house CE', met:houseMet,
  });

  const board = statBoard([
    {num:signedFmt(d.caseGrowthOverLastYear), label:'Your CE vs Last Year',
     status:d.caseGrowthOverLastYear>0?'good':(d.caseGrowthOverLastYear<0?'bad':null),
     sub:'$1 each once the company goal is hit'},
  ]);

  const block = earnBlock({
    icon:'📈', title:'Your CE Growth',
    rate:'EARN $1', rateNote:'per case-equivalent over last year, once the company goal above is hit',
    whatToDo: houseMet ? 'Grow your Garage Beer CE over last year — every case over pays $1.' : 'Keep selling Garage Beer — your growth counts the moment the company goal is hit.',
    stats:[{num:signedFmt(d.caseGrowthOverLastYear), label:'CE Over Last Year', cls:deltaCls(d.caseGrowthOverLastYear)}],
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('garage_beer_president')}<span class="prog-name">Garage Beer President's Incentive</span><span class="prog-tag">Jun&ndash;Sep</span>${terrTag('garage_beer_president')}</div>
      ${progPitch('garage_beer_president')}
    </div>
    <div class="prog-body">
      ${board}
      ${houseBanner}
      ${block}
    </div>
  </div>`;
}

// Le Grand Noir Volume (program 11, live 2026-08-20 once the first RDE
// file arrived): $10/case behind a 70-case COMPANY-WIDE gate -- same
// house-gate shape as Garage Beer President's, but tracked in raw
// Aug-Oct cases with a per-line sales drill.
function cardLeGrandNoir(rep){
  const d = (PROGRAM_DATA['le_grand_noir']||{}).byRep?.[rep];
  const prog = PROGRAM_DATA['le_grand_noir']||{};
  if(!d) return '';

  const houseMet = (prog.companyCases||0) >= (prog.houseGoal||70);
  const houseBanner = qualifierBanner({
    label:'Company-wide goal — once the whole house crosses 70 cases, every case pays',
    current:prog.companyCases||0, goal:prog.houseGoal||70, unit:'house cases', met:houseMet,
  });

  const board = statBoard([
    {num:d.cases.toFixed(0), label:'Your Cases (Aug–Oct)', status:cntStatus(d.cases),
     sub:'$10 each once the house goal is hit'},
  ]);

  const block = earnBlock({
    icon:'🍷', title:'Le Grand Noir Cases',
    rate:'EARN $10', rateNote:'per case of Le Grand Noir, once the 70-case house goal above is hit',
    whatToDo: houseMet ? 'The house goal is met — every Le Grand Noir case you sell pays $10.'
      : 'Sell Le Grand Noir — your cases count toward the 70-case house goal and pay the moment it\'s hit.',
    stats:[{num:d.cases.toFixed(0), label:'Your Cases'}],
    detail:{
      label:'Your Le Grand Noir Sales',
      items:(d.lines||[]).map(l=>({name:l.customer, sub:l.product+' · '+l.date, stat:l.cases.toFixed(0)+' case'+(l.cases===1?'':'s')})),
      emptyMsg:'No Le Grand Noir sales yet this window.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('le_grand_noir')}<span class="prog-name">Le Grand Noir Volume Incentive</span><span class="prog-tag">Aug&ndash;Oct</span></div>
      ${progPitch('le_grand_noir')}
    </div>
    <div class="prog-body">
      ${board}
      ${houseBanner}
      ${block}
    </div>
  </div>`;
}

function cardNewBelgiumDistribution(rep){
  const d = (PROGRAM_DATA['new_belgium_distribution']||{}).byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('new_belgium_distribution','New Belgium Distribution — Push Volume','Jul–Aug',"Bell's / Kirin / Voodoo Family");

  const missingBrands = (d.brands||[]).filter(b=>b.pushVolumeCE===0);
  const activeBrands = (d.brands||[]).length - missingBrands.length;
  const board = statBoard([
    {num:d.pushVolumeCE.toFixed(0), label:'August Push CE', status:cntStatus(d.pushVolumeCE)},
    {num:`${activeBrands} / ${(d.brands||[]).length}`, label:'Brands Active',
     status:activeBrands===(d.brands||[]).length?'good':(activeBrands>0?'warn':null),
     sub:missingBrands.length?`${missingBrands.length} brand${missingBrands.length===1?'':'s'} with no volume yet`:'Every core brand selling'},
  ]);
  const block = earnBlock({
    icon:'🌊', title:'Push Volume — Case Equivalents',
    rate:'CE TRACKED', rateNote:'No $ rate stated for this phase — volume tracked across Bell\'s, Bell\'s Hearted Family, Kirin Ichiban, Kirin Light, and Voodoo Family',
    whatToDo:'Push volume on the five core brand families during the August window.',
    stats:[
      {num:d.pushVolumeCE.toFixed(0), label:'August Push CE'},
      {num:d.baseMonthlyAvgCE.toFixed(0), label:'May–Jul Monthly Avg (reference)', dim:true},
    ],
    detail:{
      label:'Where Your CE Came From',
      items:(d.lines||[]).map(l=>({name:l.customer, sub:l.product+' ('+l.brand+')', stat:l.caseEquivalents.toFixed(1)+' CE'})),
      emptyMsg:'No August push-volume activity yet.',
    },
    opportunity:{
      label:'Brands You Haven\'t Sold This Push',
      note:'Zero August volume so far on these core brand families — worth a look.',
      items:missingBrands.map(b=>({name:b.label, stat:'0 CE this push'})),
      emptyMsg:'You\'ve sold something in every core brand family this push — nice spread.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('new_belgium_distribution')}<span class="prog-name">New Belgium Distribution &mdash; Push Volume</span><span class="prog-tag">Jul&ndash;Aug</span>${terrTag('new_belgium_distribution')}</div>
      ${progPitch('new_belgium_distribution')}
    </div>
    <div class="prog-body">
      ${board}
      ${block}
    </div>
  </div>`;
}

// --- Retention Programs (April deck, retention phase) --------------------
// One row per brand goal: current distribution vs the rep's own goal for
// the retention window, progress bar, "Retained" badge once it's held.
function retentionBrandRows(brands, unit){
  return (brands||[]).map(b=>{
    if(b.goal==null){
      return detailRow({name:b.label, sub:'No goal set for this brand', stat:`${b.actual} ${unit}`});
    }
    const retained = b.pct>=100;
    const need = Math.max(0, b.goal-b.actual);
    return detailRow({
      name:b.label,
      sub: retained ? `Goal: ${b.goal} ${unit} — you're holding it` : `Goal: ${b.goal} ${unit} · ${need} more to retain`,
      stat:`${b.actual} / ${b.goal}`,
      statCls: retained ? 'pos' : (b.pct<50 ? 'neg' : ''),
      status: retained ? 'retained' : undefined,
      barPct: b.pct,
    });
  }).join('');
}
function retentionBrandBlock(brands, unit){
  const rows = retentionBrandRows(brands, unit);
  return rows ? `<div class="detail-list-wrap"><div class="earn-section-label">Your Brand Goals</div><div class="detail-list">${rows}</div></div>` : '';
}

function cardMcRetention(rep){
  const d = (PROGRAM_DATA['mc_retention']||{}).byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('mc_retention','MolsonCoors Distro Rewards — Retention','Aug–Oct','MolsonCoors');

  const gt = d.goalsTotal, gr = d.goalsRetained;
  const board = statBoard([
    gt>0
      ? {num:`${gr} / ${gt}`, label:'Brand Goals Retained', status:gr===gt?'good':'warn',
         sub:gr===gt?'All goals held — keep them there':`${gt-gr} more to retain`}
      : {num:'0', label:'Brand Goals Retained', sub:'No goals on file'},
    d.offGoal>0
      ? {num:d.offPct.toFixed(0)+'%', label:'Off-Prem vs Goal', status:d.offPct>=100?'good':'warn',
         sub:`${d.offActual} / ${d.offGoal} placements`}
      : {num:'N/A', label:'Off-Premise', sub:'No off-prem goals on file'},
    d.onGoal>0
      ? {num:d.onPct.toFixed(0)+'%', label:'On-Prem Draft vs Goal', status:d.onPct>=100?'good':'warn',
         sub:`${d.onActual} / ${d.onGoal} draft buyers`}
      : {num:'N/A', label:'On-Prem Draft', sub:'No draft goals on file'},
  ]);

  const offBlock = d.offBrands.length
    ? earnBlock({
        icon:'📦', title:'Off-Premise — Hold Your Placements',
        rate:'RETAIN', rateNote:'Up to $500 per brand goal retained · Jul 27 – Oct 31',
        whatToDo:'Keep every off-premise MolsonCoors brand at or above its placement goal through Oct 31. A brand that slips below goal costs you that payout.',
        extra:retentionBrandBlock(d.offBrands, 'placements'),
      })
    : naBlock('Off-Premise — No Goals On File',
        'The MolsonCoors retention report has no off-premise goals for you, so this side of the program doesn\'t apply to your route.');

  const onBlock = d.onBrands.length
    ? earnBlock({
        icon:'🍺', title:'On-Premise Draft — Hold Your Taps',
        rate:'RETAIN', rateNote:'Up to $500 per brand goal retained · Jul 27 – Oct 31',
        whatToDo:'Keep every draft brand at or above its buying-account goal through Oct 31 — hold the taps you placed.',
        extra:retentionBrandBlock(d.onBrands, 'buyers'),
      })
    : naBlock('On-Premise Draft — No Goals On File',
        'The MolsonCoors retention report has no on-premise draft goals for you, so this side of the program doesn\'t apply to your route.');

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('mc_retention')}<span class="prog-name">MolsonCoors Distro Rewards &mdash; Retention</span><span class="prog-tag">Aug&ndash;Oct</span>${terrTag('mc_retention')}</div>
      ${progPitch('mc_retention')}
    </div>
    <div class="prog-body">
      ${board}
      ${offBlock}
      ${onBlock}
    </div>
  </div>`;
}

// Yuengling Fall (Sept-Nov): brand-family goals only, no overall goal and no
// house goal (Gavin, 2026-09-10). Each goal is 95% of the rep's OWN fall-2025
// buyer count for that family, rounded down; held when this fall's buyers
// reach it. One block per side (off-premise, on-premise packages, on-premise
// draft once its export lands) with the same brand rows MolsonCoors uses.
const YUENGLING_FALL_SIDES = [
  {key:'off',      icon:'📦', title:'Off-Premise — Hold Your Buyers',          board:'Off-Prem vs Goal'},
  {key:'packages', icon:'🍺', title:'On-Premise Packages — Hold Your Buyers',  board:'On-Prem Packages vs Goal'},
  {key:'draft',    icon:'🍻', title:'On-Premise Draft — Hold Your Taps',       board:'On-Prem Draft vs Goal'},
];
function cardYuenglingRetentionFall(rep){
  const P = PROGRAM_DATA_2026_09['yuengling_retention_fall']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('yuengling_retention_fall','Yuengling Distro Rewards — Retention','Sept–Nov','Yuengling');
  const thr = P.retainThresholdPct||95;
  const loaded = new Set((P.sides||[]).filter(x=>x.loaded).map(x=>x.key));
  const gt = d.goalsTotal, gr = d.goalsRetained;
  const tiles = [gt>0
      ? {num:`${gr} / ${gt}`, label:'Brand Goals Held', status:gr===gt?'good':'warn',
         sub:gr===gt?'Every goal held — keep them there':`${gt-gr} more to hold · day ${P.daysElapsed} of ${P.periodDays}`}
      : {num:'0', label:'Brand Goals Held', sub:'No goals on file'}];
  YUENGLING_FALL_SIDES.forEach(S=>{
    if(!loaded.has(S.key)) return;
    const goal = d[S.key+'Goal']||0, pct = d[S.key+'Pct'];
    tiles.push(goal>0
      ? {num:pct.toFixed(0)+'%', label:S.board, status:pct>=100?'good':'warn', sub:`${d[S.key+'Actual']} / ${goal} buyers · ${d[S.key+'GoalsRetained']} of ${d[S.key+'GoalsTotal']} goals held`}
      : {num:'N/A', label:S.board, sub:'No goals on this side'});
  });
  const blocks = YUENGLING_FALL_SIDES.map(S=>{
    if(!loaded.has(S.key)) return naBlock(`${S.title.split(' — ')[0]} — Report Not In Yet`, 'The RDE export for this side has not arrived; its brand goals will appear here once it does.');
    const brands = d[S.key+'Brands']||[];
    if(!brands.length) return naBlock(`${S.title.split(' — ')[0]} — No Goals On File`, 'This report has no Yuengling buyers on your route last fall, so this side does not apply to you.');
    return earnBlock({
      icon:S.icon, title:S.title, rate:'RETAIN',
      rateNote:`Up to $500 per brand goal held · goal = ${thr}% of your Sept–Nov 2025 buyers, rounded down · Sept 1 – Nov 30`,
      whatToDo:`Keep each Yuengling brand family at or above its goal — ${thr}% of the accounts that bought it from you last fall. A family that ends November below goal costs you that payout.`,
      extra:retentionBrandBlock(brands, 'buyers'),
    });
  });
  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('yuengling_retention_fall')}<span class="prog-name">Yuengling Distro Rewards &mdash; Retention</span><span class="prog-tag">Sept&ndash;Nov</span>${terrTag('yuengling_retention_fall')}</div>
      ${progPitch('yuengling_retention_fall')}
    </div>
    <div class="prog-body">
      ${statBoard(tiles)}
      ${blocks.join('')}
    </div>
  </div>`;
}

// MABI MADE retention: one overall placement goal per rep (not per brand
// like MolsonCoors), retained at 90% rather than 100%, gated by a
// company-wide 8,440-POD house goal.
function cardMabiRetention(rep){
  const P = PROGRAM_DATA['mabi_retention']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('mabi_retention','Mark Anthony MADE Distro Rewards — Retention','Jun–Aug','Mark Anthony (White Claw, Mike’s, Cayman Jack)');

  const thr = P.retainThresholdPct||90;
  const needToRetain = d.goal ? Math.ceil(d.goal*thr/100) : null;
  const shortBy = needToRetain ? Math.max(0, needToRetain-d.placements) : 0;

  const houseBanner = qualifierBanner({
    current:P.houseTotal||0, goal:P.houseGoal||0, met:!!P.houseMet,
    label:'Company-wide MADE placements — the house must clear this goal for full payouts (50% if missed).',
    unit:'MADE placements',
    metTitle:'House Goal Achieved', lockedTitle:'House Goal Not Yet Met',
  });

  const board = statBoard([
    {num:d.placements.toLocaleString('en-US'), label:'MADE Placements',
     status:d.goal?(d.retained?'good':'warn'):null,
     sub:d.goal?`Goal: ${d.goal.toLocaleString('en-US')} · ${needToRetain.toLocaleString('en-US')} retains it`:'No goal set for you in this report'},
    d.goal
      ? {num:d.pct.toFixed(0)+'%', label:'Of Your Goal', status:d.retained?'good':'warn',
         sub:d.retained?(d.hitFullGoal?'Full goal held':`Above the ${thr}% retention line`):`${shortBy.toLocaleString('en-US')} more to reach ${thr}%`}
      : {num:'N/A', label:'Of Your Goal', sub:'No goal on file'},
    {num:d.rebuys.toLocaleString('en-US'), label:'Re-Buys', sub:'Accounts that bought again this window'},
    {num:`${d.skusWithPlacements} / ${d.totalSkus}`, label:'MADE SKUs Placed',
     sub:d.gapSkuCount?`${d.gapSkuCount} SKUs with none`:'Every qualifying SKU placed'},
  ]);

  const whatToDo = d.goal
    ? (d.retained
        ? `You're holding your MADE goal. Stay at or above ${needToRetain.toLocaleString('en-US')} placements (${thr}% of your ${d.goal.toLocaleString('en-US')} goal) through Aug 31 to keep the payout.`
        : `Get back to ${needToRetain.toLocaleString('en-US')} placements (${thr}% of your ${d.goal.toLocaleString('en-US')} goal) by Aug 31 — you need ${shortBy.toLocaleString('en-US')} more.`)
    : 'This report has no MADE goal set for you, so there is nothing to retain — your placements and re-buys are tracked below for reference.';

  const block = earnBlock({
    icon:'📦', title:'MADE Placements — Hold Your Distribution',
    rate:'RETAIN', rateNote:`Up to $500 for the MADE goal · ${thr}% of goal retains it · Jun 1 – Aug 31`,
    whatToDo,
    progress: d.goal ? {pct:d.pct,
      caption:`${d.placements.toLocaleString('en-US')} of ${d.goal.toLocaleString('en-US')} placements · ${thr}% (${needToRetain.toLocaleString('en-US')}) retains the goal`} : null,
    detail:{
      label:'Your MADE Products',
      items:d.products.map(p=>({name:p.product, sub:`${p.rebuys.toLocaleString('en-US')} re-buys`,
                                stat:`${p.placements.toLocaleString('en-US')} placements`})),
      emptyMsg:'No MADE placements on file for you this window.',
    },
    opportunity:{
      label:'MADE SKUs With No Placements',
      count:d.gapSkuCount,
      note:'Qualifying MADE SKUs you have zero placements on this window — ranked by how much volume each moves company-wide.',
      items:d.gapSkus.map(g=>({name:g.product, stat:casesStat(g.cases2026)})),
      moreCount:Math.max(0, d.gapSkuCount - d.gapSkus.length),
      emptyMsg:'You have placements on every qualifying MADE SKU — nothing left on the list.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('mabi_retention')}<span class="prog-name">Mark Anthony MADE Distro Rewards &mdash; Retention</span><span class="prog-tag">Jun&ndash;Aug</span>${terrTag('mabi_retention')}</div>
      ${progPitch('mabi_retention')}
    </div>
    <div class="prog-body">
      ${houseBanner}
      ${board}
      ${block}
    </div>
  </div>`;
}



// Constellation Fall (Sept-Nov), off-premise. Sibling of
// cardConstellationRetention above with two deliberate differences, both
// confirmed with Gavin on 2026-09-08:
//   * the bar is 100% of the goal, not the 90% every other retention program
//     here uses -- so nothing in this card mentions a 90% line;
//   * each category's goal is the rep's OWN prior placements, and the base
//     window differs by category (fall 2025 for three, spring 2026 for
//     Innovation, which did not exist a year ago), so each row names its own.
// Like the MABI fall card it leads with where the window is: on day 8 of 91 a
// rep at 40% is not behind, and the card should not imply otherwise.
function cardConstellationFall(rep){
  const P = PROGRAM_DATA_2026_09['constellation_fall']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';

  const cats = d.offCategories||[];
  const goaled = cats.filter(c=>c.goal);
  const shortCats = goaled.filter(c=>!c.retained);
  const dayLine = `Day ${P.daysElapsed} of ${P.periodDays} — ${P.pacePct}% of the window has run`;
  const n = v => Number(v||0).toLocaleString('en-US');
  // One percentage per section, from the same rounded integers the hero
  // uses -- otherwise the hero and the stat board disagree by a point
  // purely on where the rounding happened.
  const heldPlacements = goaled.reduce((t,c)=>t+c.placements,0);
  const offPct = d.offGoal ? (heldPlacements/d.offGoal)*100 : 0;
  const PK = d.on_packages||{families:[],goalsTotal:0,goalsRetained:0,held:0,goal:0,toGo:0,buyers:0,emptyPickups:0};
  const DR = d.on_draft||{families:[],goalsTotal:0,goalsRetained:0,held:0,goal:0,toGo:0,buyers:0,emptyPickups:0};
  const overallPct = d.overallGoal ? (d.overallHeld/d.overallGoal)*100 : 0;

  const house = houseGoalBlock((P.house||[]).map(h=>({
      label:h.label, total:h.total, goal:h.goal, met:h.met, short:h.short})), {
    note:`Company-wide off-premise placements against the fall goals. Each goal is the sum of the reps' own prior placements. ${dayLine}.`,
  });
  const houseOn = (P.houseOn||{});
  const houseOnHtml = ['packages','draft'].map(ch=>{
    const rows = houseOn[ch]||[];
    if(!rows.length) return '';
    return houseGoalBlock(rows.map(h=>({label:`${ch==='draft'?'Draft':'Packages'} · ${h.label}`, total:h.total, goal:h.goal, met:h.met, short:h.short})), {
      note:`Company-wide on-premise ${ch} buyers by brand family against the fall goals — each goal is the sum of the reps' own spring (Mar 1 – May 31) buyers.`,
    });
  }).join('');

  if(!d.hasAnyGoal){
    return `<div class="prog-card">
      <div class="prog-head">
        <div class="prog-name-row">${progLogo('constellation_fall')}<span class="prog-name">Constellation Fall Distribution Rewards</span><span class="prog-tag">Sept&ndash;Nov</span>${terrTag('constellation_fall')}</div>
        ${progPitch('constellation_fall')}
      </div>
      <div class="prog-body">${house}${houseOnHtml}
        <div class="empty-state">These reports carry no Constellation goal for you this period — off-premise, on-premise packages or draft — so there is nothing to hold. ${esc(dayLine)}.</div>
      </div>
    </div>`;
  }

  const board = statBoard([
    {num:`${d.goalsRetained} / ${d.goalsTotal}`, label:'Goals Held',
     status:d.goalsRetained===d.goalsTotal?'good':null,
     sub:d.goalsRetained===d.goalsTotal ? 'Every goal at or above its bar' : `${d.offGoalsRetained}/${d.offGoalsTotal} off-prem · ${PK.goalsRetained}/${PK.goalsTotal} packages · ${DR.goalsRetained}/${DR.goalsTotal} draft`},
    {num:Math.round(overallPct)+'%', label:'Of All Your Goals', status:overallPct>=100?'good':null,
     sub:`${n(d.overallHeld)} of ${n(d.overallGoal)} across off + on premise`},
    d.offGoalsTotal ? {num:Math.round(offPct)+'%', label:'Off-Premise', status:offPct>=100?'good':null,
     sub:`${n(heldPlacements)} of ${n(d.offGoal)} placements`} : {num:'—', label:'Off-Premise', sub:'No off-premise goal'},
    (PK.goalsTotal||DR.goalsTotal) ? {num:Math.round(((PK.held+DR.held)/((PK.goal+DR.goal)||1))*100)+'%', label:'On-Premise', status:(PK.held+DR.held)>=(PK.goal+DR.goal)?'good':null,
     sub:`${n(PK.held+DR.held)} of ${n(PK.goal+DR.goal)} buyers · packages + draft`} : {num:'—', label:'On-Premise', sub:'No on-premise goal'},
  ]);

  // ---- off-premise section (unchanged in substance) ----
  const whatToDo = shortCats.length
    ? `Match your prior placements in every category by Nov 30. ${shortCats.map(c=>`${c.label} needs ${n(c.toGo)} more`).join(' · ')}. ${dayLine}.`
    : `You're at or above your prior placements in all ${d.offGoalsTotal} categories. Keep them there through Nov 30.`;

  const catRows = cats.filter(c=>c.inReport||c.goal).map(c=>{
    if(!c.goal){
      return detailRow({name:c.label, sub:'No goal set for this category', stat:`${n(c.placements)} placements`});
    }
    return detailRow({
      name:c.label,
      sub:c.retained
        ? `Goal: ${n(c.goal)} (your ${esc(c.baseWindow)}) · holding at ${c.pct.toFixed(0)}%`
        : `Goal: ${n(c.goal)} (your ${esc(c.baseWindow)}) · ${n(c.toGo)} more to match it`,
      stat:`${n(c.placements)} / ${n(c.goal)}`, statCls:c.retained?'pos':'', status:c.retained?'retained':undefined, barPct:c.pct,
    });
  }).join('');
  const skuGroups = cats.filter(c=>c.products && c.products.length).map(c=>({
    name:c.label, sub:`${c.products.length} SKU${c.products.length===1?'':'s'} placed`,
    stat:`${n(c.placements)} placements`, statCls:c.retained?'pos':'',
    accounts:c.products.map(p=>({name:p.product, stat:`${n(p.placements)} of ${n(p.base)}`})),
  }));
  const offBlock = !d.offGoalsTotal
    ? naBlock('Off-Premise — No Goal For You', 'These reports carry no Constellation off-premise goal for you this period. Your on-premise goals are below.')
    : earnBlock({
    icon:'📦', title:'Off-Premise Distribution — Match Your Prior Placements',
    rate:'RETAIN', rateNote:'Up to $500 for the period · goal is 100% of your prior placements · Sept 1 – Nov 30',
    whatToDo,
    progress:{pct:offPct, caption:`${n(heldPlacements)} of ${n(d.offGoal)} placements · ${dayLine}`},
    extra:(catRows ? `<div class="detail-list-wrap"><div class="earn-section-label">Your Category Goals</div><div class="detail-list">${catRows}</div></div>` : '')
      + productAccordion({label:'Your Placements By Category', note:'Tap a category to see the SKUs behind its number, each against its own prior placements.', groups:skuGroups, emptyMsg:'No Constellation off-premise placements on file for you yet this period.'}),
  });

  // ---- on-premise sections: packages and draft, each brand family its own goal ----
  const onBlock = (S, ch) => {
    const fams = S.families||[];
    const goaledF = fams.filter(f=>f.goal);
    const shortF = goaledF.filter(f=>!f.retained);
    const extraF = fams.filter(f=>!f.goal && f.buyers>0);
    if(!goaledF.length && !extraF.length) return naBlock(`On-Premise ${ch==='draft'?'Draft':'Packages'} — No Goal For You`, `You had no on-premise ${ch} buyers of a Constellation brand family in spring 2026 (Mar 1 – May 31), so there is no ${ch} goal to hold.`);
    const pct = S.goal ? (S.held/S.goal)*100 : 0;
    const famRows = fams.filter(f=>f.goal||f.buyers>0).map(f=>{
      if(!f.goal) return detailRow({name:f.label, sub:`No spring buyers, so no goal — ${n(f.buyers)} buyer${f.buyers===1?'':'s'} this period is new distribution`, stat:`${n(f.buyers)} buyers`});
      return detailRow({
        name:f.label,
        sub:f.retained
          ? `Goal: ${n(f.goal)} buyers (your ${esc(f.baseWindow)}) · holding at ${f.pct.toFixed(0)}%`
          : `Goal: ${n(f.goal)} buyers (your ${esc(f.baseWindow)}) · ${n(f.toGo)} more account${f.toGo===1?'':'s'} to match it`
            + (ch==='draft' && f.emptyPickups ? ` · ${f.emptyPickups} empty-keg pickup${f.emptyPickups===1?'':'s'} not counted` : ''),
        stat:`${n(f.buyers)} / ${n(f.goal)}`, statCls:f.retained?'pos':'', status:f.retained?'retained':undefined, barPct:f.pct,
      });
    }).join('');
    const groups = fams.filter(f=>f.accounts && f.accounts.length).map(f=>({
      name:f.label, sub:`${n(f.accounts.length)} buying account${f.accounts.length===1?'':'s'} this period${f.goal?` · goal ${n(f.goal)}`:''}`,
      stat:f.goal?`${n(f.buyers)} / ${n(f.goal)}`:`${n(f.buyers)}`, statCls:f.retained?'pos':'',
      accounts:f.accounts.map(a=>({name:a.customer, sub:a.products.join(' · '), stat:ch==='draft'?`${n(a.units)} keg${Number(a.units)===1?'':'s'}`:''})),
    }));
    const whatToDoOn = shortF.length
      ? `Get every brand family back to its spring buyer count by Nov 30. ${shortF.map(f=>`${f.label} needs ${n(f.toGo)} more`).join(' · ')}.${ch==='draft'?' A keg only counts once it is actually in the account — an empty picked up is not distribution.':''}`
      : `You're at or above your spring buyers in all ${goaledF.length} ${ch} brand famil${goaledF.length===1?'y':'ies'}. Keep them there through Nov 30.`;
    return earnBlock({
      icon:ch==='draft'?'🍺':'🍾', title:`On-Premise ${ch==='draft'?'Draft':'Packages'} — Hold Your Spring Buyers By Brand Family`,
      rate:'RETAIN', rateNote:`Goal per brand family is 100% of your Mar 1 – May 31 on-premise ${ch} buyers · Sept 1 – Nov 30${ch==='draft'?' · buyers counted on real kegs, not empties':''}`,
      whatToDo:whatToDoOn,
      progress:S.goal?{pct, caption:`${n(S.held)} of ${n(S.goal)} buyers across your ${goaledF.length} goaled famil${goaledF.length===1?'y':'ies'} · ${dayLine}`}:null,
      extra:(famRows ? `<div class="detail-list-wrap"><div class="earn-section-label">Your Brand Family Goals</div><div class="detail-list">${famRows}</div></div>` : '')
        + productAccordion({label:`Your ${ch==='draft'?'Draft':'Package'} Buyers By Brand Family`, note:'Tap a brand family to see the accounts buying it this period and what they took.', groups, emptyMsg:`No on-premise ${ch} buyers on file for you yet this period.`}),
    });
  };

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('constellation_fall')}<span class="prog-name">Constellation Fall Distribution Rewards</span><span class="prog-tag">Sept&ndash;Nov</span>${terrTag('constellation_fall')}</div>
      ${progPitch('constellation_fall')}
    </div>
    <div class="prog-body">
      ${house}
      ${houseOnHtml}
      ${board}
      ${offBlock}
      ${onBlock(PK,'packages')}
      ${onBlock(DR,'draft')}
    </div>
  </div>`;
}


// MABI Fall retention (Sept-Nov). Sibling of cardMabiRetention above, with
// one deliberate difference: this is a THREE-MONTH goal being read mid-flight,
// so the card leads with where the window is. On 2026-09-08 every rep sits at
// 5-54% of a goal that is not due until Nov 30, and a bare percentage would
// read as failure when a rep at 35% on day 8 is comfortably ahead of pace.
// The pace line is context only -- retention is settled on the last day, not
// on a straight line, so nothing here scores a rep against it.
function cardMabiRetentionFall(rep){
  const P = PROGRAM_DATA_2026_09['mabi_retention_fall']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';

  const dayLine = `Day ${P.daysElapsed} of ${P.periodDays} — ${P.pacePct}% of the window has run`;

  // Kohler set no fall goal for a rep with no Core Market accounts, so the
  // territory restriction is already settled at source; say so plainly rather
  // than showing an empty goal.
  if(!d.hasGoal){
    return `<div class="prog-card">
      <div class="prog-head">
        <div class="prog-name-row">${progLogo('mabi_retention_fall')}<span class="prog-name">Mark Anthony MADE Distro Rewards &mdash; Retention</span><span class="prog-tag">Sept&ndash;Nov</span>${terrTag('mabi_retention_fall')}</div>
        ${progPitch('mabi_retention_fall')}
      </div>
      <div class="prog-body"><div class="empty-state">Kohler&rsquo;s fall goals workbook has no MADE goal for you this period, so there is nothing to retain. ${esc(dayLine)}.</div></div>
    </div>`;
  }

  const houseBanner = qualifierBanner({
    current:P.houseTotal||0, goal:P.houseGoal||0, met:(P.houseTotal||0) >= (P.houseGoal||0),
    label:`Company-wide MADE placements held so far against the fall goal. ${dayLine}.`,
    unit:'MADE placements',
    metTitle:'House Goal Held', lockedTitle:'House Goal — In Progress',
  });


  const board = statBoard([
    {num:d.placements.toLocaleString('en-US'), label:'MADE Placements Held',
     status:d.retained?'good':null,
     sub:`Goal: ${d.goal.toLocaleString('en-US')} by Nov 30`},
    {num:d.pct.toFixed(0)+'%', label:'Of Your Goal', status:d.retained?'good':null,
     sub:d.retained?'Goal held':`${d.toGo.toLocaleString('en-US')} more to hold it`},
    {num:d.base!=null?d.base.toLocaleString('en-US'):'—', label:'Summer Base',
     sub:'Your Jun–Aug placements — the goal is 90% of this'},
    {num:`${P.daysElapsed} / ${P.periodDays}`, label:'Days Into the Period',
     sub:'Sept 1 – Nov 30 · goal is judged on the last day'},
  ]);

  const whatToDo = d.retained
    ? `You're already holding your fall goal at ${d.placements.toLocaleString('en-US')} of ${d.goal.toLocaleString('en-US')}. Keep it there through Nov 30 — retention is judged on the last day, not today.`
    : `You need ${d.toGo.toLocaleString('en-US')} more MADE placements to reach ${d.goal.toLocaleString('en-US')} by Nov 30. ${dayLine}.`;

  const block = earnBlock({
    icon:'📦', title:'MADE Placements — Hold 90% Through November',
    rate:'RETAIN', rateNote:'Up to $500 for the MADE / Innovation goal · goal is 90% of your Jun–Aug base · Sept 1 – Nov 30',
    whatToDo,
    progress:{pct:d.pct, caption:`${d.placements.toLocaleString('en-US')} of ${d.goal.toLocaleString('en-US')} placements · ${dayLine}`},
    detail:{
      label:'Your MADE Products This Period',
      items:d.products.map(p=>({name:p.product, sub:p.brand,
                                stat:`${p.placements.toLocaleString('en-US')} placements`})),
      emptyMsg:'No MADE placements recorded for you yet this period.',
    },
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('mabi_retention_fall')}<span class="prog-name">Mark Anthony MADE Distro Rewards &mdash; Retention</span><span class="prog-tag">Sept&ndash;Nov</span>${terrTag('mabi_retention_fall')}</div>
      ${progPitch('mabi_retention_fall')}
    </div>
    <div class="prog-body">
      ${houseBanner}
      ${board}
      ${block}
    </div>
  </div>`;
}


// Company-wide house goals for a program that has several of them at once
// (Constellation's four off-prem categories) -- one compact row each with
// its own bar, rather than four separate full-width banners.
function houseGoalBlock(rows, opts){
  opts = opts || {};
  const met = rows.filter(h=>h.met).length;
  const allMet = met===rows.length;
  const color = allMet ? 'var(--good)' : 'var(--amber)';
  const soft = allMet ? 'var(--good-soft)' : 'var(--amber-soft)';
  const list = rows.map(h=>detailRow({
    name:h.label,
    sub:h.met?'House goal achieved':`${h.short.toLocaleString('en-US')} more needed company-wide`,
    stat:`${h.total.toLocaleString('en-US')} / ${h.goal.toLocaleString('en-US')}`,
    statCls:h.met?'pos':'',
    status:h.met?'retained':undefined,
    barPct:h.goal?h.total/h.goal*100:0,
  })).join('');
  return `<div class="rank-hero" style="background:linear-gradient(135deg,${soft},transparent);border-color:${color};display:block">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span class="rank-hero-trophy">${allMet?'🔓':'🔒'}</span>
        <div style="flex:1;min-width:160px">
          <div class="rank-hero-main">House Goals: ${met} of ${rows.length} Met</div>
          <div class="rank-hero-sub">${esc(opts.note||'The house must clear these company-wide goals for full payouts (50% if missed).')}</div>
        </div>
      </div>
      <div class="detail-list" style="margin-top:12px">${list}</div>
    </div>`;
}

function kegLabel(pkg){
  if(/15\.5/.test(pkg)) return 'half-barrel keg';
  if(/1\/4/.test(pkg)) return 'quarter-barrel keg';
  if(/1\/6/.test(pkg)) return 'sixtel';
  return pkg;
}
// One new draft line as a detailRow item: which account, which brand/keg,
// the barrels it has moved and the bonus tier that unlocks.
function draftLineItem(l){
  const tierTxt = l.tier
    ? `${l.tier}+ barrel bonus — $${l.bonus}${l.halfKeg?' (half rate on a small keg)':''}`
    : `${Math.max(0, 4-l.barrels).toFixed(1)} more barrels to the $${l.targeted?200:150} bonus`;
  return {
    name:l.customer,
    sub:`${l.brand} · ${kegLabel(l.package)} · ${tierTxt}`,
    stat:`${l.barrels.toFixed(1)} bbl`,
    statCls:l.tier?'pos':'',
    status:l.tier?'retained':undefined,
    barPct:Math.min(l.barrels/8*100, 100),
  };
}

function constellationOnPremBlocks(d, P){
  const targeted = P.targetedDraftBrand||'Modelo Especial';

  const pkgBlock = !d.onPkgInReport
    ? naBlock('On-Premise Packages — Not In This Report',
        'You have no rows in the Constellation on-premise package report, so this side of the program does not apply to you.')
    : earnBlock({
        icon:'🍾', title:'On-Premise Packages — Your Buyers',
        rate:'RETAIN', rateNote:'Jun – Aug · this report carries no per-rep goals',
        whatToDo:'Hold your on-premise package distribution across the Constellation brands through August. This report shows buyer counts only — no individual goals came with it.',
        stats:[{num:d.onPkgTotal.toLocaleString('en-US'), label:'Package Buyers'}],
        extra:d.onPkgBrands.length
          ? `<div class="detail-list-wrap"><div class="earn-section-label">Your Buyers By Brand</div><div class="detail-list">${
              d.onPkgBrands.map(b=>detailRow({name:b.label, stat:`${b.buyers.toLocaleString('en-US')} buyers`})).join('')
            }</div></div>`
          : '<div class="detail-list-wrap"><div class="empty-note">No on-premise package buyers on file for you this window.</div></div>',
      });

  const nearTier = d.draftNewLines.filter(l=>!l.tier).slice().sort((a,b)=>b.barrels-a.barrels).slice(0,10);
  const draftBlock = !d.draftInReport
    ? naBlock('New Draft — Not In This Report',
        'You have no rows in the Constellation new draft report, so the new-buyer and barrel-bonus pieces do not apply to you.')
    : earnBlock({
        icon:'🍺', title:'New Draft Buyers & Barrel Bonus',
        rate:'EARN $100', rateNote:`per new ${targeted} draft line · $50 per new line on every other brand · barrel bonuses on top`,
        whatToDo:`Place new draft lines — ${targeted} pays $100, every other brand $50 — then drive barrels through them: a line at 4+ barrels adds $200 (${targeted}) or $150, and 8+ barrels adds $400 or $250. Quarter and sixth barrels pay half the barrel bonus.`,
        stats:[
          {num:d.draftNewAccountCount, label:'New Draft Buyers', cls:d.draftNewAccountCount>0?'good':null},
          {num:d.draftNewLineCount, label:'New Lines'},
          {num:d.draftBarrels.toFixed(0), label:'Barrels Sold'},
        ],
        detail:{
          label:'Your New Draft Lines',
          items:d.draftNewLines.map(draftLineItem),
          emptyMsg:'No new draft lines yet this window.',
        },
        opportunity:{
          label:'New Lines Closest To A Barrel Bonus',
          count:nearTier.length,
          note:'These new lines have not reached the 4-barrel bonus yet — closest first.',
          items:nearTier.map(l=>({name:l.customer,
            stat:`${l.barrels.toFixed(1)} of 4 bbl · ${l.brand}`,
            barPct:Math.min(l.barrels/4*100,100)})),
          emptyMsg:d.draftNewLineCount?'Every one of your new draft lines has already cleared the 4-barrel bonus.':'No new draft lines yet this window.',
        },
      });

  // Regular (total) draft buyers by brand, from the Draft ON report. NOT the
  // new ones -- those are draftBlock above. Corrected 2026-08-25 per Gavin:
  // "1st [New Draft Distro] is new ... 2nd [Draft ON] is regular buyers. no
  // goals at rep level, just brand level for regular." Goal-free by design:
  // every Goals cell in that file is blank and the draft side carries a
  // standing no-goals rule, so this counts buyers and nothing else.
  const regBuyersBlock = !d.regBuyersInReport
    ? naBlock('Draft Buyers By Brand — Not In This Report',
        'You have no rows in the Constellation Draft ON report, so this section does not apply to you.')
    : earnBlock({
        icon:'🚰', title:'Draft Buyers By Brand',
        rate:'TRACKING', rateNote:'Jun – Aug · your standing draft book · no rep-level goals on this one',
        whatToDo:'This is your total Constellation draft book by brand — everyone currently buying, not just the new ones. There is no rep-level goal against it; hold these and add to them, and the new ones show up in the section above.',
        stats:[{num:d.regBuyersTotal.toLocaleString('en-US'), label:'Draft Buyers',
                status:cntStatus(d.regBuyersTotal)}],
        extra:d.regBuyersBrands.length
          ? `<div class="detail-list-wrap"><div class="earn-section-label">Your Draft Buyers By Brand</div><div class="detail-list">${
              d.regBuyersBrands.map(b=>detailRow({name:b.label, stat:`${b.buyers.toLocaleString('en-US')} buyers`})).join('')
            }</div></div>`
          : '<div class="detail-list-wrap"><div class="empty-note">No draft buyers on file for you this window.</div></div>',
      });

  return {pkgBlock, draftBlock, regBuyersBlock};
}

function cardConstellationRetention(rep){
  const P = PROGRAM_DATA['constellation_retention']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('constellation_retention','Constellation Distro Rewards — Retention','Jun–Aug','Constellation (Corona, Modelo, Victoria, Pacifico)');

  const thr = P.retainThresholdPct||90;
  const cats = d.offCategories||[];
  const goaled = cats.filter(c=>c.goal);
  const shortCats = goaled.filter(c=>!c.retained);

  const house = houseGoalBlock(P.houseOff||[], {
    note:'Company-wide off-premise placements. The house must clear all four for full payouts (50% if missed).',
  });
  const on = constellationOnPremBlocks(d, P);

  // Spans both channels: a rep may work only one side (Allison Scott is
  // on-premise only, so her off-premise tiles would otherwise be hollow
  // zeros), and each tile says why it is N/A rather than showing a 0.
  const board = statBoard([
    d.offGoalsTotal>0
      ? {num:`${d.offGoalsRetained} / ${d.offGoalsTotal}`, label:'Off-Prem Goals Retained',
         status:d.offGoalsRetained===d.offGoalsTotal?'good':'warn',
         sub:d.offGoalsRetained===d.offGoalsTotal?'All goals held':`${shortCats.map(c=>c.label).join(', ')} below ${thr}%`}
      : {num:'N/A', label:'Off-Prem Goals Retained',
         sub:d.inReport?'No goals set for you in these reports':'No off-premise rows in these reports'},
    d.offGoal>0
      ? {num:d.offPct.toFixed(0)+'%', label:'Of Your Off-Prem Goal', status:d.offPct>=thr?'good':'warn',
         sub:`${goaled.reduce((t,c)=>t+c.placements,0).toLocaleString('en-US')} placements vs ${d.offGoal.toLocaleString('en-US')} goal · ${d.offPlacements.toLocaleString('en-US')} total`}
      : {num:'N/A', label:'Of Your Off-Prem Goal', sub:'No goal on file'},
    d.onPkgInReport
      ? {num:d.onPkgTotal.toLocaleString('en-US'), label:'On-Prem Package Buyers', sub:'This report carries no goals'}
      : {num:'N/A', label:'On-Prem Package Buyers', sub:'Not in the package report'},
    d.draftInReport
      ? {num:d.draftNewAccountCount, label:'New Draft Buyers', status:cntStatus(d.draftNewAccountCount),
         sub:`${d.draftNewLineCount} new line${d.draftNewLineCount===1?'':'s'} · ${d.draftBarrels.toFixed(0)} bbl sold`}
      : {num:'N/A', label:'New Draft Buyers', sub:'Not in the new draft report'},
    d.regBuyersInReport
      ? {num:d.regBuyersTotal.toLocaleString('en-US'), label:'Draft Buyers (All)', status:cntStatus(d.regBuyersTotal),
         sub:d.regBuyersBrands.length
           ? `Across ${d.regBuyersBrands.length} brand${d.regBuyersBrands.length===1?'':'s'} · no rep-level goal`
           : 'No rep-level goal'}
      : {num:'N/A', label:'Draft Buyers (All)', sub:'Not in the Draft ON report'},
  ]);

  const whatToDo = d.offGoalsTotal===0
    ? 'These reports have no Constellation off-premise goals set for you, so there is nothing to retain — any placements you do have are listed below for reference.'
    : (shortCats.length
        ? `Hold every category at ${thr}% of its goal through Aug 31. ${shortCats.map(c=>`${c.label} needs ${Math.max(1,Math.ceil(c.goal*thr/100)-c.placements)} more`).join(' · ')}.`
        : `You're holding all ${d.offGoalsTotal} of your category goals. Stay at ${thr}% or better through Aug 31 to keep the payout.`);

  const catRows = cats.filter(c=>c.inReport||c.goal).map(c=>{
    if(!c.goal){
      return detailRow({name:c.label, sub:'No goal set for this category',
                        stat:`${c.placements.toLocaleString('en-US')} placements`});
    }
    const need = Math.max(0, Math.ceil(c.goal*thr/100)-c.placements);
    return detailRow({
      name:c.label,
      sub:c.retained
        ? `Goal: ${c.goal.toLocaleString('en-US')} · holding at ${c.pct.toFixed(0)}%`
        : `Goal: ${c.goal.toLocaleString('en-US')} · ${need.toLocaleString('en-US')} more to reach ${thr}%`,
      stat:`${c.placements.toLocaleString('en-US')} / ${c.goal.toLocaleString('en-US')}`,
      statCls:c.retained?'pos':'neg',
      status:c.retained?'retained':undefined,
      barPct:c.pct,
    });
  }).join('');

  const skuGroups = cats.filter(c=>c.products && c.products.length).map(c=>({
    name:c.label,
    sub:`${c.products.length} SKU${c.products.length===1?'':'s'} placed`,
    stat:`${c.placements.toLocaleString('en-US')} placements`,
    statCls:c.retained?'pos':'',
    accounts:c.products.map(p=>({name:p.product, stat:`${p.placements.toLocaleString('en-US')} placements`})),
  }));

  const offBlock = !d.inReport
    ? naBlock('Off-Premise — Not In These Reports',
        'You have no rows in the four Constellation off-premise reports, so the off-premise goals do not apply to you. Your on-premise sides are below.')
    : earnBlock({
    icon:'📦', title:'Off-Premise Distribution — Hold Your Goals',
    rate:'RETAIN', rateNote:`Up to $500 for the period · ${thr}% of goal retains it · Jun 1 – Aug 31`,
    whatToDo,
    extra:(catRows
      ? `<div class="detail-list-wrap"><div class="earn-section-label">Your Category Goals</div><div class="detail-list">${catRows}</div></div>`
      : '') + productAccordion({
        label:'Your Placements By Category',
        note:'Tap a category to see the SKUs behind its number.',
        groups:skuGroups,
        emptyMsg:'No Constellation off-premise placements on file for you this window.',
      }),
  });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('constellation_retention')}<span class="prog-name">Constellation Distro Rewards &mdash; Retention</span><span class="prog-tag">Jun&ndash;Aug</span>${terrTag('constellation_retention')}</div>
      ${progPitch('constellation_retention')}
    </div>
    <div class="prog-body">
      ${house}
      ${board}
      ${offBlock}
      ${on.pkgBlock}
      ${on.draftBlock}
      ${on.regBuyersBlock}
    </div>
  </div>`;
}

// Shared goal-row renderer for the retention programs whose files carry a
// per-rep goal per brand/category: current vs goal, bar, Retained badge,
// and the exact number still needed to reach the retention threshold.
function retentionGoalRows(items, opts){
  opts = opts || {};
  const unit = opts.unit || 'placements';
  const thr = opts.thr || 90;
  const noun = opts.noun || 'brand';
  return (items||[]).map(b=>{
    if(!b.goal){
      return detailRow({name:b.label, sub:`No goal set for this ${noun}`,
                        stat:`${b.placements.toLocaleString('en-US')} ${unit}`});
    }
    const need = Math.max(0, Math.ceil(b.goal*thr/100)-b.placements);
    return detailRow({
      name:b.label,
      sub:b.retained
        ? `Goal: ${b.goal.toLocaleString('en-US')} · holding at ${b.pct.toFixed(0)}%`
        : `Goal: ${b.goal.toLocaleString('en-US')} · ${need.toLocaleString('en-US')} more to reach ${thr}%`,
      stat:`${b.placements.toLocaleString('en-US')} / ${b.goal.toLocaleString('en-US')}`,
      statCls:b.retained?'pos':'neg',
      status:b.retained?'retained':undefined,
      barPct:b.pct,
    });
  }).join('');
}

// One channel of the Yuengling card (off-premise, or on-premise packages).
function yuenglingSideBlock(side, opts){
  if(!side.inReport && !side.listedCount)
    return naBlock(`${opts.title} — Not In This Report`,
      `You have no rows in the Yuengling ${opts.lower} retention report, so this side of the program does not apply to you.`);
  const rows = retentionGoalRows(side.brands, {unit:'placements', thr:opts.thr, noun:'brand'});
  const notOnList = side.notOnList && side.notOnList.length
    ? `<div class="opp-note">${side.notOnList.length} account${side.notOnList.length===1?'':'s'} with placements ${side.notOnList.length===1?'is':'are'} not on your retention list: ${esc(side.notOnList.join(', '))}</div>`
    : '';
  return earnBlock({
    icon:opts.icon, title:opts.title,
    rate:'RETAIN', rateNote:`Up to $500 per brand goal retained · ${opts.thr}% of goal retains it · Jun 1 – Aug 31`,
    whatToDo:side.goalsTotal
      ? (side.goalsRetained===side.goalsTotal
          ? `You're holding all ${side.goalsTotal} of your ${opts.lower} brand goals. Stay at ${opts.thr}% or better through Aug 31.`
          : `Get every ${opts.lower} brand back to ${opts.thr}% of its goal by Aug 31. ${side.brands.filter(b=>b.goal&&!b.retained).map(b=>`${b.label} needs ${Math.max(1,Math.ceil(b.goal*opts.thr/100)-b.placements)} more`).join(' · ')}.`)
      : `This report has no ${opts.lower} goals set for you — your placements and retention accounts are listed below for reference.`,
    stats:[
      {num:`${side.heldCount} / ${side.listedCount}`, label:'Retention Accounts Held',
       cls:side.listedCount&&side.heldCount===side.listedCount?'good':(side.atRisk.length?'warn':null)},
      {num:side.placements.toLocaleString('en-US'), label:'Placements'},
    ],
    extra:(rows?`<div class="detail-list-wrap"><div class="earn-section-label">Your Brand Goals</div><div class="detail-list">${rows}</div></div>`:'')+notOnList,
    detail:{
      label:'Your Retention Accounts With Placements',
      items:side.accounts.filter(a=>a.total>0).map(a=>({
        name:a.customer,
        sub:a.brands.map(b=>`${b.label}: ${b.placements}`).join(' · '),
        stat:`${a.total} placement${a.total===1?'':'s'}`,
      })),
      emptyMsg:'No placements on your retention accounts yet this window.',
    },
    opportunity:{
      label:'Retention Accounts With Nothing Yet',
      count:side.atRisk.length,
      note:`These are on your Yuengling ${opts.lower} retention list but have no placements this window — each one is part of the goal you are being measured on.`,
      items:side.atRisk.map(c=>({name:c, stat:'no placements yet'})),
      emptyMsg:'Every account on your retention list has placements — nothing at risk.',
    },
  });
}

function cardYuenglingRetention(rep){
  const P = PROGRAM_DATA['yuengling_retention']||{};
  const d = P.byRep?.[rep];
  if(!d) return '';
  if(d.territoryEligible===false) return territoryBlockedCard('yuengling_retention','Yuengling Distro Rewards — Retention','Jun–Aug','Yuengling');
  const thr = P.retainThresholdPct||90;

  const board = statBoard([
    d.goalsTotal
      ? {num:`${d.goalsRetained} / ${d.goalsTotal}`, label:'Brand Goals Retained',
         status:d.goalsRetained===d.goalsTotal?'good':'warn',
         sub:d.goalsRetained===d.goalsTotal?'All goals held':`${d.goalsTotal-d.goalsRetained} below ${thr}%`}
      : {num:'N/A', label:'Brand Goals Retained', sub:'No goals set for you in these reports'},
    d.overallPct!=null
      ? {num:d.overallPct.toFixed(0)+'%', label:'Of Your Overall Goal',
         status:d.overallPct>=thr?'good':'warn', sub:`Across every brand with a goal`}
      : {num:'N/A', label:'Of Your Overall Goal', sub:'No goal on file'},
    d.listedCount
      ? {num:`${d.heldCount} / ${d.listedCount}`, label:'Retention Accounts Held',
         status:d.heldCount===d.listedCount?'good':'warn',
         sub:d.heldCount===d.listedCount?'Every listed account has placements':`${d.listedCount-d.heldCount} with nothing yet`}
      : {num:'N/A', label:'Retention Accounts Held', sub:'No retention list for you'},
    d.draftInReport
      ? {num:d.draft.units.toLocaleString('en-US'), label:'Draft Units Sold',
         sub:`${d.draft.accountCount} account${d.draft.accountCount===1?'':'s'} · no goal on the draft side`}
      : {num:'N/A', label:'Draft Units Sold', sub:'Not in the draft report'},
  ]);

  const offBlock = yuenglingSideBlock(d.off, {title:'Off-Premise Packages', lower:'off-premise', icon:'📦', thr});
  const onBlock = yuenglingSideBlock(d.onPkg, {title:'On-Premise Packages', lower:'on-premise', icon:'🍾', thr});

  const draftBlock = !d.draftInReport
    ? naBlock('On-Premise Draft — Not In This Report',
        'You have no rows in the Yuengling draft report, so the draft side does not apply to you.')
    : earnBlock({
        icon:'🍺', title:'On-Premise Draft — Keep The Taps Pouring',
        rate:'RETAIN', rateNote:'Jun 1 – Aug 31 · this report carries no goals',
        whatToDo:'Keep Lager and Flight moving through your draft accounts. This report tracks units sold off the load sheets — no draft goals came with it.',
        stats:[
          {num:d.draft.lagerUnits.toLocaleString('en-US'), label:'Lager Units'},
          {num:d.draft.flightUnits.toLocaleString('en-US'), label:'Flight Units'},
        ],
        detail:{
          label:'Your Draft Accounts',
          items:d.draft.accounts.map(a=>({
            name:a.customer,
            sub:`${a.lager} Lager · ${a.flight} Flight · ${a.loads} load sheet${a.loads===1?'':'s'}${a.lastDate?` · last ${a.lastDate}`:''}`,
            stat:`${a.units} unit${a.units===1?'':'s'}`,
            statCls:a.units>0?'pos':'',
          })),
          emptyMsg:'No draft accounts on file for you this window.',
        },
        opportunity:{
          label:'Draft Accounts With No Units This Window',
          count:d.draft.accounts.filter(a=>a.units<=0).length,
          note:'These accounts appear on your draft load sheets but have moved nothing this window.',
          items:d.draft.accounts.filter(a=>a.units<=0).map(a=>({name:a.customer,
            stat:`${a.loads} load sheet${a.loads===1?'':'s'}${a.lastDate?` · last ${a.lastDate}`:''}`})),
          emptyMsg:'Every draft account on file has moved units this window.',
        },
      });

  return `<div class="prog-card">
    <div class="prog-head">
      <div class="prog-name-row">${progLogo('yuengling_retention')}<span class="prog-name">Yuengling Distro Rewards &mdash; Retention</span><span class="prog-tag">Jun&ndash;Aug</span>${terrTag('yuengling_retention')}</div>
      ${progPitch('yuengling_retention')}
    </div>
    <div class="prog-body">
      ${board}
      ${offBlock}
      ${onBlock}
      ${draftBlock}
    </div>
  </div>`;
}

/* ====================================================================
   SUPPLIER-FIRST VIEW (2026-09-04)
   --------------------------------------------------------------------
   Reps' feedback was that the page had "too much going on": every program
   rendered as a full card with its stat tiles already open, so answering
   "where do I stand" meant reading ~20 cards. This layer answers the four
   questions a rep actually opens the page with --

     1. Which programs am I in?      -> supplier sections, one row each
     2. Where do I stand?            -> one number pair + one bar per row
     3. What do I still have to do?  -> the next-step line on every row
     4. What should I do next?       -> the Focus section, ranked

   -- and hides everything else behind a tap. The detailed cards below are
   untouched: a row expands into exactly the card that used to be the
   default view, so nothing a rep relied on is gone, it is one tap deeper.

   SUPPLIER IS THE TOP LEVEL because reps already navigate Encompass that
   way (Gavin, 2026-09-04). The names and groupings here are NOT invented:
   every one is the "Supplier" value Kohler's own RDE exports carry for
   that program's brand family (checked across the repo's CSVs -- e.g.
   Keystone -> "MolsonCoors Beverage Company", Lytt and Twisted Tea ->
   "Boston Beer Company", 2XO and Le Grand Noir -> "Prestige Beverage
   Group"). Display names are trimmed to what a rep says out loud
   ("Molson Coors", not "MolsonCoors Beverage Company"); the RDE spelling
   is kept in `rde` so the mapping can be re-checked against a fresh
   export. If a program's supplier is ever wrong, fix it HERE -- it is the
   single source for grouping, and nothing else infers a supplier.
   ==================================================================== */
const SUPPLIERS = {
  molson_coors:  {name:'Molson Coors',      rde:'MolsonCoors Beverage Company', logo:'assets/logos/molson_coors.png'},
  boston_beer:   {name:'Boston Beer',       rde:'Boston Beer Company',          logo:'assets/logos/boston_beer.png'},
  constellation: {name:'Constellation',     rde:'Constellation Brands',         logo:'assets/logos/constellation.png'},
  mark_anthony:  {name:'Mark Anthony',      rde:'Mark Anthony',                 logo:'assets/logos/mark_anthony.png'},
  yuengling:     {name:'Yuengling',         rde:'DG Yuengling Inc',             logo:'assets/logos/yuengling.png'},
  bardstown:     {name:'Bardstown Bourbon', rde:'Bardstown Bourbon Co',         logo:'assets/logos/bardstown.png'},
  new_belgium:   {name:'New Belgium',       rde:'New Belgium Brewing Company',  logo:'assets/logos/new_belgium.png'},
  beak_skiff:    {name:'Beak & Skiff',      rde:'Beak & Skiff',                 logo:'assets/logos/1911.png'},
  vermont_cider: {name:'Woodchuck',         rde:'Vermont Hard Cider',           logo:'assets/logos/woodchuck.png'},
  artisanal:     {name:'Tona',              rde:'Artisanal Imports',            logo:'assets/logos/tona.png'},
  prestige:      {name:'Prestige Beverage', rde:'Prestige Beverage Group',      logo:'assets/logos/two_xo.png'},
  garage_beer:   {name:'Garage Beer',       rde:'Garage Beer',                  logo:'assets/logos/garage_beer.png'},
  evil_genius:   {name:'Evil Genius',       rde:'Evil Genius',                  logo:'assets/logos/evil_genius.png'},
  other_half:    {name:'Other Half',        rde:'Other Half Brewing Co',        logo:'assets/logos/other_half.png'},
  montauk:       {name:'Montauk',           rde:'Montauk Brewing Co',           logo:'assets/logos/montauk.png'},
  victory:       {name:'Victory Brewing',   rde:'Victory Brewing Company',      logo:'assets/logos/victory.png'},
  cruz:          {name:'YaVe Tequila',      rde:'Cruz Beverage',                logo:'assets/logos/yave.png'},
  mollys:        {name:"Molly's",           rde:"Molly's",                      logo:'assets/logos/mollys.png'},
  house:         {name:'Kohler House Programs', rde:'(multiple suppliers)',     logo:'../assets/kohler-logo-badge.png'},
};
// Program -> supplier key. Programs spanning several suppliers (the fall
// seasonal push, the display auction) sit under "Kohler House Programs"
// rather than being filed under whichever brand happens to lead them.
const PROGRAM_SUPPLIER = {
  keystone_ice:'molson_coors', mc_retention:'molson_coors',
  touchdowns_tea:'boston_beer', lytt:'boston_beer', sam_adams:'boston_beer', boston_beer:'boston_beer', sun_cruiser:'boston_beer', sam_adams_conversion:'boston_beer',
  constellation_fall:'constellation', constellation_retention:'constellation',
  mabi_retention:'mark_anthony', mabi_retention_fall:'mark_anthony',
  yuengling_retention:'yuengling', yuengling_retention_fall:'yuengling',
  printed_menu:'bardstown', bardstown_display:'bardstown',
  new_belgium:'new_belgium', new_belgium_distribution:'new_belgium', new_belgium_distribution_retain:'new_belgium',
  '1911':'beak_skiff', woodchuck:'vermont_cider', tona:'artisanal',
  two_xo:'prestige', le_grand_noir:'prestige',
  garage_beer_president:'garage_beer', garage_beer_summer_sequel:'garage_beer',
  evil_genius:'evil_genius', other_half:'other_half', montauk:'montauk',
  path_to_victory:'victory', yave:'cruz', mollys:'mollys',
  fall_seasonal:'house', display_auction:'house',
};
function supplierOf(key){ return SUPPLIERS[PROGRAM_SUPPLIER[key]] || SUPPLIERS.house; }

/* --------------------------------------------------------------------
   PROGRAM SUMMARY -- the one-line answer per program.
   Each entry turns a rep's data into: how far along they are, out of what,
   and the single sentence telling them what to do next. Two shapes:

     goal:true   the program has a threshold that switches money on. `now`
                 and `goal` drive the bar, and "X to go" is real.
     goal:false  open-ended -- every placement pays from the first one.
                 There is no bar to fill, so `now` carries what they have
                 earned or landed and the status is simply whether they
                 are on the board.

   Anything returning null renders as "Coming Soon" (no export yet). The
   numbers here are read from the SAME fields the detailed cards use, so a
   row and the card it opens can never disagree.
   -------------------------------------------------------------------- */
const pl = (n,w) => `${n} ${w}${n===1?'':'s'}`;
const money = v => '$'+Math.round(v||0).toLocaleString('en-US');

const PROGRAM_SUMMARY = {
  keystone_ice:(d)=>({goal:true, now:d.accounts, target:d.qualifier, unit:'accounts',
    label:`${d.accounts} of ${d.qualifier} accounts`,
    remain:d.qualified?null:`${pl(d.toQualifier,'account')} to go`,
    next:d.qualified
      ? (d.bonusHit ? `You are at the top rate — every account pays $10.`
                    : `You are earning $5 an account. <strong>${pl(d.toBonus,'more account')}</strong> doubles it to $10 on every one.`)
      : `Sell Keystone Ice 24oz into <strong>${pl(d.toQualifier,'more account')}</strong> to switch your payout on.`}),

  touchdowns_tea:(d)=>({goal:false, now:d.payout, unit:'$',
    label:money(d.payout)+' earned', sub:`${pl(d.offPremNewCount,'new 12pk placement')} · ${Math.round(d.onPremCases)} on-prem cases`,
    next:`Every new 12pk placement pays <strong>$15</strong> and every on-premise case pays <strong>$1</strong>.`}),

  evil_genius:(d,m)=>({goal:true, now:d.totalNewPlacements, target:(m&&m.qualifier)||3, unit:'placements',
    label:`${d.totalNewPlacements} of ${(m&&m.qualifier)||3} placements`,
    remain:d.qualified?null:`${pl(d.toQualifier,'placement')} to go`,
    next:d.qualified
      ? `You are past the qualifier — every new placement is paying.`
      : `Land <strong>${pl(d.toQualifier,'more placement')}</strong>. Nothing pays until you reach ${(m&&m.qualifier)||3}.`}),

  montauk:(d)=>({goal:false, now:d.payout, unit:'$',
    label:money(d.payout)+' earned', sub:`${pl(d.totalNewPlacements,'new placement')}`,
    next:`Every new Wave Chaser placement pays <strong>$10–$15</strong>, and a new draught line pays <strong>$100</strong>.`}),

  two_xo:(d)=>({goal:false, now:d.offPremNewCount+d.onPremNewCount, unit:'PODs',
    label:`${d.offPremNewCount+d.onPremNewCount} landed`,
    next:`Pair American Oak with French Oak in an off-premise account, or land a <strong>2-bottle on-premise POD</strong>.`}),

  other_half:(d)=>({goal:false, now:d.offPremNewCount, unit:'accounts',
    label:`${pl(d.offPremNewCount,'account')} opened`, sub:money(d.offPremPayout)+' earned',
    next:`Open another target account on Other Half core draft — each one pays <strong>$40+</strong>.`}),

  '1911':(d)=>({goal:false, now:d.totalNewPlacements, unit:'placements',
    label:`${pl(d.totalNewPlacements,'new placement')}`, sub:`${Math.round(d.caseVolume)} cases`,
    next:`Every 1911 SKU placed in an account that didn’t buy it in May–July pays <strong>$10</strong>; a new draft line pays <strong>$100</strong> once that account hits 2 barrels.`}),

  woodchuck:(d)=>({goal:true, now:d.totalNewPlacements, target:3, unit:'placements',
    label:`${d.totalNewPlacements} of 3 placements`,
    remain:d.totalNewPlacements>=3?null:`${pl(3-d.totalNewPlacements,'placement')} to go`,
    next:d.totalNewPlacements>=3
      ? `You are qualified — every placement and every case is paying.`
      : `Get <strong>${pl(3-d.totalNewPlacements,'more placement')}</strong> to qualify. Nothing pays until you reach 3.`}),

  tona:(d,m,P)=>{const g=(P&&P.qualifierGoal)||20, need=Math.max(0,g-d.caseVolume24oz);
    return {goal:true, now:d.caseVolume24oz, target:g, unit:'cases',
      label:`${Math.round(d.caseVolume24oz)} of ${g} cases`,
      remain:need>0?`${Math.round(need)} cases to go`:null,
      next:need>0
        ? `Sell <strong>${Math.round(need)} more cases</strong> of Tona 24oz to unlock every payout on this program.`
        : `You cleared 20 cases — your placements and case money are both paying.`};},

  lytt:(d)=>{const p=d.penetrationPct, tier=p>=75?null:(p>=50?75:(p>=25?50:25));
    // The bar tracks progress to the NEXT RATE, not raw penetration: a rep at
    // 19% is 76% of the way to the 25% tier, and showing 19% filled made that
    // read "Needs Attention" when they are one account or two from a raise.
    return {goal:true, now:p, target:tier||100, unit:'%',
      pctOverride:tier?Math.min(100,p/tier*100):100,
      label:`${p.toFixed(0)}% of your accounts`, sub:d.tier?`${d.tier} · $${d.rate.toFixed(2)}/case`:'No tier yet',
      remain:tier?`${(tier-p).toFixed(0)}% more to reach the ${tier}% rate`:null,
      next:tier
        ? `Get Lytt into more accounts — reach <strong>${tier}%</strong> and your rate goes up.`
        : `You are at the top tier — every case pays <strong>$2.00</strong>.`};},

  le_grand_noir:(d,m,P)=>{const g=(P&&P.houseGoal)||70, house=(P&&P.companyCases)||0, need=Math.max(0,g-house);
    return {goal:true, now:house, target:g, unit:'cases', house:true,
      label:`House ${Math.round(house)} of ${g} cases`, sub:`You: ${Math.round(d.cases)} cases`,
      remain:need>0?`${Math.round(need)} cases to unlock`:null,
      next:need>0
        ? `The house needs <strong>${Math.round(need)} more cases</strong> before anyone gets paid — every case you sell counts.`
        : `The house goal is cleared — every case you sell pays <strong>$10</strong>.`};},

  garage_beer_president:(d,m,P)=>{const g=(P&&P.houseGoal)||9305, house=(P&&P.companyTotalThisYear)||0, need=Math.max(0,g-house);
    return {goal:true, now:house, target:g, unit:'CE', house:true,
      label:`House ${Math.round(house).toLocaleString('en-US')} of ${g.toLocaleString('en-US')} CE`,
      sub:`You: ${d.caseGrowthOverLastYear>0?'+':''}${Math.round(d.caseGrowthOverLastYear)} vs last year`,
      remain:need>0?`${Math.round(need).toLocaleString('en-US')} CE to unlock`:null,
      next:need>0
        ? `The house needs <strong>${Math.round(need).toLocaleString('en-US')} more CE</strong> to unlock this. Then every case you grew over last year pays $1.`
        : `House goal cleared — every case you grew over last year pays <strong>$1</strong>.`};},

  mc_retention:(d)=>({goal:true, now:d.goalsRetained, target:d.goalsTotal, unit:'goals',
    label:`${d.goalsRetained} of ${d.goalsTotal} goals held`, sub:`${(d.overallPct||0).toFixed(0)}% of goal`,
    remain:d.goalsRetained>=d.goalsTotal?null:`${pl(d.goalsTotal-d.goalsRetained,'goal')} at risk`,
    next:d.goalsTotal===0 ? `No MolsonCoors goals on file for you.`
      : d.goalsRetained>=d.goalsTotal
        ? `Every goal is held — keep them there through October.`
        : `<strong>${pl(d.goalsTotal-d.goalsRetained,'goal')}</strong> ${d.goalsTotal-d.goalsRetained===1?'is':'are'} below target. Rebuild those before October ends.`}),

  /* ---- August-tab programs ---- */
  path_to_victory:(d)=>({goal:false, now:d.sixPackAccountCount+d.nineteenTwoAccountCount, unit:'accounts',
    label:`${pl(d.sixPackAccountCount+d.nineteenTwoAccountCount,'account')}`,
    next:`$25 per account buying 5+ Victory Monkey 6pks, plus <strong>$10</strong> a new POD. Submit through iSellBeer to get paid.`}),
  sam_adams:(d)=>({goal:true, now:d.allSkuUnitsThisYear, target:d.allSkuUnitsLastYear, unit:'cases',
    label:`${Math.round(d.allSkuUnitsThisYear)} vs ${Math.round(d.allSkuUnitsLastYear)} last year`,
    remain:d.isPositive?null:`${Math.round(d.allSkuUnitsLastYear-d.allSkuUnitsThisYear)} cases behind`,
    next:d.isPositive ? `You are ahead of last August — your commission doubles.`
      : `Sell <strong>${Math.round(d.allSkuUnitsLastYear-d.allSkuUnitsThisYear)} more cases</strong> to beat last August and double your commission.`}),
  boston_beer:(d)=>({goal:false, now:d.points, unit:'points',
    label:`${d.points} trip points`, sub:`${pl(d.draftNewCount,'new draft POD')}`,
    next:`Draft PODs are worth <strong>2 points</strong> and $100 each; package placements are 1 point and $10.`}),
  new_belgium:(d,m,P)=>{const g=(P&&P.houseGoal)||70, house=(P&&P.housePodsTotal)||0;
    return {goal:true, now:house, target:g, unit:'PODs', house:true,
      label:`House ${house} of ${g} PODs`, sub:`You: ${pl(d.housePods,'POD')}`,
      remain:house>=g?null:`${g-house} to go`,
      next:house>=g ? `House goal cleared.` : `The house needs <strong>${pl(g-house,'more POD')}</strong> by month end.`};},
  sun_cruiser:(d)=>({goal:false, now:d.rate1CaseGrowth, unit:'cases',
    label:`${Math.round(d.rate1CaseGrowth)} cases grown`,
    next:`Every case you grow over last year pays — the higher-rate SKUs pay <strong>$3</strong>.`}),
  yave:(d)=>({goal:false, now:d.onPremAccountCount+d.offPremAccountCount, unit:'accounts',
    label:`${pl(d.onPremAccountCount+d.offPremAccountCount,'account')}`,
    next:`Every new YaVe account counts — on-premise bottles and off-premise cases both pay.`}),
  mollys:(d)=>({goal:false, now:d.newPodCount, unit:'PODs',
    label:`${pl(d.newPodCount,'new POD')}`, sub:`${pl(d.rebuyCount,'rebuy')}`,
    next:`Every new Molly's POD pays, and rebuys pay again.`}),
  garage_beer_summer_sequel:(d)=>({goal:true, now:d.caseEquiv, target:d.tieredGoal, unit:'CE',
    label:`${Math.round(d.caseEquiv)} of ${Math.round(d.tieredGoal)} CE`, sub:d.tier?`Tier: ${d.tier}`:'No tier yet',
    remain:d.caseEquiv>=d.tieredGoal?null:`${Math.round(d.tieredGoal-d.caseEquiv)} CE to go`,
    next:d.caseEquiv>=d.tieredGoal ? `You cleared your tier goal.`
      : `Sell <strong>${Math.round(d.tieredGoal-d.caseEquiv)} more CE</strong> to hit your tier.`}),
  new_belgium_distribution:(d)=>({goal:false, now:d.pushVolumeCE, unit:'CE',
    label:`${Math.round(d.pushVolumeCE)} CE pushed`,
    next:`Push volume above your monthly average — every case over the base counts.`}),
  display_auction:(d)=>({goal:false, now:d.points, unit:'points',
    label:`${(d.points||0).toLocaleString('en-US')} points`, sub:`${pl(d.qualifying,'qualifying display')}`,
    next:`Every qualifying display you photograph in iSellBeer adds points to the auction.`}),
  // Sept-Nov retention read mid-flight. The DISPLAYED number is always the
  // raw percentage of goal -- nothing here inflates what a rep sees. Only the
  // STATUS CHIP uses pctOverride, and it measures progress against how much of
  // the window has actually run, because the chip answers "am I on course",
  // and on day 8 of 91 a raw 44% would otherwise print "Needs Attention" for a
  // goal that is not due until Nov 30. Both numbers are in the payload.
  // Fall Constellation: bar is 100% of the rep's own prior placements (not the
  // 90% the other retention programs use). Same early-window status treatment
  // as mabi_retention_fall -- the displayed number is the raw percentage, only
  // the chip is period-aware. See that entry for the reasoning.
  constellation_fall:(d,meta,P)=>{
    if(!d.hasAnyGoal) return {goal:false, now:(d.offPlacements||0)+((d.on_packages||{}).buyers||0)+((d.on_draft||{}).buyers||0),
      label:'No Constellation goal set for you',
      next:`These reports carry no off-premise or on-premise goal for you this period.`};
    const early = (P&&P.pacePct!=null) ? P.pacePct < 25 : false;
    const statusOverride = !early ? null
      : (d.goalsRetained===d.goalsTotal ? 'earned'
         : (d.overallHeld > 0 ? 'ontrack' : 'notstarted'));
    // The hero counts PLACEMENTS + BUYERS held against every goal the rep
    // has -- off-premise categories, on-premise package families and
    // on-premise draft families -- not goals-fully-held. Mid-window "0 of 12
    // goals" is true of nearly everyone and tells a rep nothing about the
    // ground they have covered. Goals held stay on the stat board.
    const PK = d.on_packages||{}, DR = d.on_draft||{};
    const offHeld = (d.offCategories||[]).filter(c=>c.goal).reduce((t,c)=>t+c.placements,0);
    const seg = (label, held, goal, kept, total, unit) => goal
      ? {label, pct:(held/goal)*100, line:`${held.toLocaleString('en-US')} of ${goal.toLocaleString('en-US')} ${unit} · ${kept} of ${total} goal${total===1?'':'s'} held`}
      : {label, pct:null, line:'No goal for you'};
    const segments = [
      seg('Off-Premise', offHeld, d.offGoal||0, d.offGoalsRetained||0, d.offGoalsTotal||0, 'placements'),
      seg('On-Prem Packages', PK.held||0, PK.goal||0, PK.goalsRetained||0, PK.goalsTotal||0, 'buyers'),
      seg('On-Prem Draft', DR.held||0, DR.goal||0, DR.goalsRetained||0, DR.goalsTotal||0, 'buyers'),
    ];
    return {goal:true, now:d.overallHeld, target:d.overallGoal, unit:'', segments,
      statusOverride,
      label:`${d.overallHeld} of ${d.overallGoal} · ${d.goalsRetained} of ${d.goalsTotal} goals held`,
      sub:`${(d.overallPct||0).toFixed(0)}% of goal · off-prem ${d.offGoalsRetained}/${d.offGoalsTotal} · packages ${PK.goalsRetained||0}/${PK.goalsTotal||0} · draft ${DR.goalsRetained||0}/${DR.goalsTotal||0} · day ${P.daysElapsed} of ${P.periodDays}`,
      remain:d.goalsRetained>=d.goalsTotal?null:`${d.overallToGo} to go`,
      next:d.goalsRetained>=d.goalsTotal
        ? `You are holding every goal, off and on premise. Keep them there through <strong>Nov 30</strong>.`
        : `Match your prior numbers in all ${d.goalsTotal} goals by Nov 30 — <strong>${d.overallToGo}</strong> to go across off-premise placements and on-premise buyers, with ${P.periodDays-P.daysElapsed} days left.`};
  },
  sam_adams_conversion:(d,meta,P)=>{
    const E = d.encompass||{}, since = (E.convertedSinceReport||[]).length;
    const asOf = d.asOf ? new Date(d.asOf+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
    if(!d.hasOfficial) return {goal:false, now:0, label:'Not on Boston Beer’s scoreboard',
      next:`Boston Beer’s conversion scoreboard (${asOf}) has no row for you. Encompass shows ${E.converted||0} of ${E.prev||0} of your Summer Ale keg accounts on Octoberfest.`};
    if(!d.hasBase) return {goal:false, now:d.gained, unit:'lines', label:`${pl(d.gained,'new Octoberfest line')}`,
      next:`Boston Beer has no Summer Ale lines on your route to convert &mdash; new Octoberfest lines still count as gained distribution.`};
    return {goal:true, now:d.converted, target:d.prevSeason, unit:'lines',
      label:`${d.converted} of ${d.prevSeason} lines converted`,
      sub:`Boston Beer scoreboard ${asOf} · ${(d.convertedPct||0).toFixed(0)}% · ${d.gained} gained${since?` · ${since} first Octoberfest keg${since===1?'':'s'} since`:''}`,
      remain:d.notConverted?`${pl(d.notConverted,'line')} still on Summer Ale`:null,
      next:d.notConverted===0
        ? `Boston Beer has every Summer Ale handle on your route switched to Octoberfest. Keep them pouring it through <strong>Sept 30</strong>.`
        : `Get an Octoberfest keg into the <strong>${pl(d.notConverted,'account')}</strong> on Boston Beer’s unconverted list by Sept 30${since?` — Encompass already shows ${since} first Octoberfest keg${since===1?'':'s'} since their ${asOf} report`:''}.`};
  },
  // Yuengling Fall: brand-family goals, 95% of the rep's own fall-2025 buyers
  // (rounded down), no overall goal. Hero = buyers counted toward every goal
  // (capped per goal) vs the goals' sum, like constellation_fall; chip is
  // period-aware early in the window for the same reason.
  yuengling_retention_fall:(d,meta,P)=>{
    if(!d.hasAnyGoal) return {goal:false, now:(d.offActual||0)+(d.packagesActual||0)+(d.draftActual||0),
      label:'No Yuengling goal set for you',
      next:`These reports show no Yuengling buyers on your route last fall, so there is nothing to retain.`};
    const early = (P&&P.pacePct!=null) ? P.pacePct < 25 : false;
    const statusOverride = !early ? null
      : (d.goalsRetained===d.goalsTotal ? 'earned' : (d.overallHeld > 0 ? 'ontrack' : 'notstarted'));
    const seg = (label, key) => (d[key+'Goal']||0)
      ? {label, pct:(d[key+'Actual']/d[key+'Goal'])*100, line:`${d[key+'Actual']} of ${d[key+'Goal']} buyers · ${d[key+'GoalsRetained']} of ${d[key+'GoalsTotal']} goal${d[key+'GoalsTotal']===1?'':'s'} held`}
      : {label, pct:null, line:(d[key+'Brands']||[]).length ? 'No goal on this side' : 'Report not in yet'};
    const segments = [seg('Off-Premise','off'), seg('On-Prem Packages','packages')];
    if(d.draftBrands) segments.push(seg('On-Prem Draft','draft'));
    return {goal:true, now:d.overallHeld, target:d.overallGoal, unit:'buyers', segments, statusOverride,
      label:`${d.overallHeld} of ${d.overallGoal} buyers · ${d.goalsRetained} of ${d.goalsTotal} goals held`,
      sub:`${(d.overallPct||0).toFixed(0)}% of goal · off-prem ${d.offGoalsRetained||0}/${d.offGoalsTotal||0} · packages ${d.packagesGoalsRetained||0}/${d.packagesGoalsTotal||0}${d.draftBrands?` · draft ${d.draftGoalsRetained||0}/${d.draftGoalsTotal||0}`:''} · day ${P.daysElapsed} of ${P.periodDays}`,
      remain:d.goalsRetained>=d.goalsTotal?null:`${pl(d.overallToGo,'buyer')} to go`,
      next:d.goalsRetained>=d.goalsTotal
        ? `You are holding every Yuengling brand goal. Keep them there through <strong>Nov 30</strong>.`
        : `Hold ${(P.retainThresholdPct||95)}% of last fall's buyers on all ${d.goalsTotal} brand goals by Nov 30 — <strong>${pl(d.overallToGo,'buyer')}</strong> to go, with ${P.periodDays-P.daysElapsed} days left.`};
  },
  mabi_retention_fall:(d,meta,P)=>{
    if(!d.hasGoal) return {goal:false, now:0, label:'No fall goal set for you',
      next:`Kohler&rsquo;s fall goals workbook has no MADE goal for you this period.`};
    // EARLY IN A 3-MONTH WINDOW, NOBODY CAN BE JUDGED YET. Through the first
    // quarter of the period a rep who is accumulating at all reads "On Track"
    // and only a rep with nothing at all reads "Not Started"; after that the
    // normal bands take over on the raw percentage. The number on the card is
    // ALWAYS the raw % of goal -- this only decides which word sits beside it,
    // so nothing a rep reads is inflated.
    const early = (P&&P.pacePct!=null) ? P.pacePct < 25 : false;
    const statusOverride = !early ? null
      : (d.retained ? 'earned' : (d.placements > 0 ? 'ontrack' : 'notstarted'));
    return {goal:true, now:d.placements, target:d.goal, unit:'placements',
      statusOverride,
      label:`${d.placements} of ${d.goal} placements`,
      sub:`${(d.pct||0).toFixed(0)}% of goal \u00b7 day ${P.daysElapsed} of ${P.periodDays}`,
      remain:d.retained?null:`${pl(d.toGo,'placement')} to go by Nov 30`,
      next:d.retained
        ? `You are holding your fall goal. Keep it there through <strong>Nov 30</strong>.`
        : `Hold <strong>${d.goal} MADE placements</strong> by Nov 30 \u2014 ${d.toGo} more to go, with ${P.periodDays-P.daysElapsed} days left.`};
  },
  mabi_retention:(d)=>({goal:true, now:d.placements, target:d.goal, unit:'placements',
    label:`${d.placements} of ${d.goal} placements`, sub:`${(d.pct||0).toFixed(0)}% of goal`,
    remain:d.pct>=90?null:`${(90-(d.pct||0)).toFixed(0)}% to the 90% bar`,
    next:d.pct>=90 ? `You are holding above 90% — keep it there.`
      : `Rebuild to <strong>90% of your MADE goal</strong> to keep this paying.`}),
  constellation_retention:(d)=>({goal:true, now:d.offGoalsRetained, target:d.offGoalsTotal, unit:'goals',
    label:`${d.offGoalsRetained} of ${d.offGoalsTotal} goals held`, sub:`${(d.offPct||0).toFixed(0)}% of goal`,
    remain:d.offGoalsRetained>=d.offGoalsTotal?null:`${pl(d.offGoalsTotal-d.offGoalsRetained,'goal')} at risk`,
    next:d.offGoalsTotal===0 ? `No Constellation goals on file for you.`
      : d.offGoalsRetained>=d.offGoalsTotal ? `Every goal is held — keep them there.`
      : `<strong>${pl(d.offGoalsTotal-d.offGoalsRetained,'goal')}</strong> below target. Rebuild those placements.`}),
  yuengling_retention:(d)=>({goal:true, now:d.goalsRetained, target:d.goalsTotal, unit:'goals',
    label:`${d.goalsRetained} of ${d.goalsTotal} goals held`, sub:`${pl(d.heldCount,'account')} held of ${d.listedCount}`,
    remain:d.goalsRetained>=d.goalsTotal?null:`${pl(d.goalsTotal-d.goalsRetained,'goal')} at risk`,
    next:d.goalsTotal===0 ? `No Yuengling goals on file for you.`
      : d.goalsRetained>=d.goalsTotal ? `Every goal is held — keep them there.`
      : `<strong>${pl(d.goalsTotal-d.goalsRetained,'goal')}</strong> below target. Rebuild those before the period ends.`}),
};

// Status ladder. Deliberately five words a rep reads the same way every
// time, each paired with an icon so the meaning never rides on colour
// alone (a colour-blind rep, or a printed page, still reads correctly).
const STATUS_META = {
  earned:     {label:'Earned',         ic:'✓'},
  close:      {label:'Close',          ic:'◗'},
  ontrack:    {label:'On Track',       ic:'▲'},
  attention:  {label:'Needs Attention',ic:'!'},
  notstarted: {label:'Not Started',    ic:'○'},
  soon:       {label:'Coming Soon',    ic:'⋯'},
};
function statusChip(st, small){
  const m = STATUS_META[st] || STATUS_META.notstarted;
  return `<span class="v2-chip ${st}${small?' sm':''}"><span class="ic">${m.ic}</span>${esc(m.label)}</span>`;
}

// One place decides a program's status, so the chip, the counts in the
// header and the Focus ranking can never disagree with each other.
function summarize(entry, rep){
  const d = entry.getRep(rep);
  const fn = PROGRAM_SUMMARY[entry.key];
  if(!d || !fn) return {status:'soon', soon:true,
    next:entry.manual ? 'Submitted and verified by hand — nothing to track here yet.'
                      : 'Waiting on the first export for this program.'};
  const P = (PROGRAM_DATA_2026_09[entry.key] || PROGRAM_DATA[entry.key] || {});
  const s = fn(d, P.meta, P) || {};
  let pct;
  if(s.pctOverride!=null) pct = s.pctOverride;
  else if(s.goal && s.target) pct = Math.min(100, (s.now/s.target)*100);
  else pct = s.now>0 ? 100 : 0;
  let status;
  if(s.statusOverride)        status = s.statusOverride;
  else if(!s.goal)            status = s.now>0 ? 'earned' : 'notstarted';
  else if(s.target && s.now>=s.target) status = 'earned';
  else if(s.now<=0)           status = 'notstarted';
  else if(pct>=75)            status = 'close';
  else if(pct>=40)            status = 'ontrack';
  else                        status = 'attention';
  return Object.assign({}, s, {status, pct});
}

// Program rules as short bullets, shown big at the top of each program's
// leaderboard page (per Gavin, 2026-08-18: no paragraphs -- a rep should
// get the program in a few seconds). Adapted per incentive from the deck.
const PROGRAM_RULES = {
  '1911': [
    '$10 per new off-premise placement',
    '$100 per new draft placement — pays once that account hits 2 barrels',
    'Top 3 reps (distribution + volume) win a trip to the 1911 Cidery',
    'New = that SKU wasn’t bought by the account during May–July (counted per SKU)',
  ],
  'woodchuck': [
    'Get 3+ new placements to qualify for any payout',
    '$10 per new off-premise placement',
    '$100 per new draft placement once the account reaches 3 barrels',
    '$1 per case sold',
    'New = that SKU wasn’t bought by the account during May–July (counted per SKU)',
  ],
  'tona': [
    'Sell 20+ cases of Tona 24oz cans to unlock every payout',
    '$10 per new 24oz-can placement',
    '$1 per 24oz case · $0.50 per case of other Tona',
    'New = no 24oz cans purchased during May–July',
  ],
  'path_to_victory': [
    '$25 per account buying 5+ Victory Monkey 6pk cans',
    '$10 per new 6pk can POD',
    '$10 per new 19.2oz POD · $5 per current 19.2oz POD',
    'Submit through iSellBeer to get paid',
  ],
  'sam_adams': [
    'Beat last August on all Sam Adams — your commission doubles',
    '$1 per case of Octoberfest over last August',
    'Compares month-to-date vs. ALL of last August — the gap closes late in the month',
    'Core Market counties only',
  ],
  'boston_beer': [
    '$100 per new draft POD (Angry Orchard / Dogfish Head 15.5)',
    '$50 per draft rebuy',
    '$10 per new single-serve package placement',
    'Trip bonus: draft = 2 pts, package = 1 pt',
    'New = no purchases during May–July · Core Market only',
  ],
  'new_belgium': [
    '$100 per new Juicy Haze / Two Hearted half-barrel POD · $50 rebuy',
    '$50 per new smaller keg POD · $25 rebuy',
    '$25 per Voodoo Ranger / Fat Tire keg',
    'House goal: 70 PODs by Aug 31',
    'Core Market counties only',
  ],
  'lytt': [
    'Get Lytt into more of your off-premise accounts',
    '25% of accounts buying = $0.50/case · 50% = $1.00 · 75% = $2.00',
    'Once you hit a tier, that rate locks in through Dec 31',
    'Highest penetration wins 2 Giants or Jets tickets',
    'Core Market counties only',
  ],
  'fall_seasonal': [
    'Be first to market with the Fall Seasonal lineup',
    '$0.50 per case-equivalent on qualifying packages',
    '$5 per sixtel · $10 per half-keg',
  ],
  'sun_cruiser': [
    "Beat last year's May–Aug volume — payout starts once you're positive",
    '$1 per extra case: 12pk / 8pk / 18pk / 24pk',
    '$3 per extra case: 4pk / 19.2oz / 24oz',
    'Core Market counties only',
  ],
  'yave': [
    'On-premise: 1 account = $10 · 2 accounts = $25 (2+ bottles each)',
    'Off-premise: 1 account = $15 · 3 accounts = $50 · 5 accounts = $125 (1+ case each)',
  ],
  'mollys': [
    '$50 per new placement — account must be 90 days unsold',
    '$10 per case on rebuys during the period',
  ],
  'garage_beer_summer_sequel': [
    'Beat your own personal volume goals — 3 tiers',
    'Tiered = $1.00/CE over 2025 · Bonus = $1.50/CE · Super Bonus = $2.00/CE',
    'Draft bonus and iSellBeer features are paid separately',
  ],
  'garage_beer_president': [
    'Company goal: 9,305 CE (Jun–Sep) unlocks the payout for everyone',
    'Then $1 per CE you grow over last year',
  ],
  'new_belgium_distribution': [
    'Push Volume phase (Jul–Aug) of the New Belgium distribution program',
    "Volume across Bell's, Hearted Family, Kirin, and Voodoo Family",
    'Core Market counties only',
  ],
  'mc_retention': [
    'Keep every MolsonCoors brand at or above its distribution goal — Jul 27 through Oct 31',
    'Up to $500 per brand goal retained',
    'Off-premise: hold your placements · On-premise: hold your draft buyers',
    'House goals must be achieved for full payout — if missed, qualifying reps get 50%',
    'Core Market counties only',
  ],
  'mabi_retention': [
    'Hold your MADE placements through Aug 31 — retaining 90% of your goal keeps the payout',
    'Up to $500 for the MADE goal',
    'House goal: 8,440 MADE placements company-wide for full payout — 50% if missed',
    'Qualifying SKUs are the MABI MADE product list (White Claw, Mike\u2019s, Cayman Jack, MXD, Ole)',
    'Core Market counties only',
  ],
  'constellation_retention': [
    'Hold your off-premise distribution through Aug 31 — retaining 90% of each goal keeps the payout',
    'Four goal categories: Corona Gaintain, Modelo Gaintain, Impact, Innovation',
    'Up to $500 for the period · another $500 for reps who hit all three periods',
    'House goals: Corona 1,575 · Modelo 2,400 · Impact 3,220 · Innovation 1,200 — 50% payouts if missed',
    'On-premise draft: $100 per new Modelo line · $50 per new line on other brands',
    'Draft barrel bonus: 4+ barrels adds $200/$150 · 8+ adds $400/$250 · half rate on 1/4 and 1/6 kegs',
    'Hitting your Spring goals also enters you in the MLB All-Star Game trip raffle',
    'Core Market counties only',
  ],
  'yuengling_retention': [
    'Hold your Yuengling distribution through Aug 31 — retaining 90% of each brand goal keeps the payout',
    'Up to $500 for every brand goal retained',
    'Off-premise brands: Lager 16oz 12pk cans · Flight packages · Light Lager packages',
    'On-premise: Lager and Flight packages, plus Lager and Flight draft',
    'Work your retention account list — a listed account with nothing on it is a goal slipping away',
    'Core Market counties only',
  ],

  // --- September 2026, from the September Rewards Deck -------------------
  'keystone_ice': [
    'Qualifier: hit your off-premise distribution goal — placements made in August count toward it',
    '$5 for every Keystone Ice 24oz can off-premise placement',
    'Hit the bonus goal and every placement pays $10 instead',
    '$5 per cooler door photo submitted in iSellBeer',
    'Photo must show the cans next to Busch or Bud Ice, priced at or below them, with the cooler door sticker',
    'Top performer by off-premise distribution % earns $300 — second place earns $150',
  ],
  'touchdowns_tea': [
    'Off-premise: $15 for every new placement of Sun Cruiser or Twisted Tea 12pks',
    'Off-premise: $1 per case on the floor with football POS — 25 case minimum, cannot be co-branded',
    'Floor display needs an iSellBeer picture',
    'On-premise: $1 per case sold — the goal is Sun Cruiser as the lead football hard tea',
    'On-premise: $25 for any account running a football feature',
    'Feature needs an iSellBeer menu or bucket picture, and the bucket special must be under $35 for 5 cans',
  ],
  'evil_genius': [
    'Qualifier: 3 placements minimum before anything pays',
    "$10 for every new off-premise placement of Stacy's Mom, Adulting, or 867-5309",
    "$100 for every new placement of Stacy's Mom draft — 1 ½ bbl or 2 1/6 bbl minimum",
    'Bonus: $1 for every CE sold over your 2025 sales',
  ],
  'other_half': [
    'On-premise 1st half (Sept–Oct): a non-buy target account that buys OH core draft in BOTH months pays $150',
    'On-premise 2nd half (Nov–Dec): the same account buying both months again pays $250',
    'The account must purchase 1 ½ bbl or 2 1/6 bbl each month',
    'Off-premise: $40 per non-buy account opened buying a minimum of 3 core SKUs',
    'Off-premise: $10 for every SKU sold beyond the first 3',
    'Southern District: $50 per account opened with Other Half',
  ],
  'montauk': [
    'Runs Sept 1–30',
    '$10 for a new placement of Wave Chaser 6pk cans',
    '$15 for a new placement of Wave Chaser 12pk cans or 19.2oz cans',
    '$100 per new draught line — Wave Chaser only, 1 ½ bbl or 2 1/6 bbl minimum',
  ],
  'sam_adams_conversion': [
    'Runs July 20 – September 30 — Boston Beer on-premise draft',
    'Every account that poured Sam Adams Summer Ale kegs April 1 – July 17 is a line to convert',
    'A line converts when that account takes an Octoberfest keg between July 20 and September 30',
    'Octoberfest in an account that never poured Summer Ale counts as gained distribution, not a conversion',
    'Scored from Boston Beer’s own conversion scoreboard and unconverted-account list, by route — Encompass keg loads show what has moved since their last report',
    'Payout structure not yet on file — the conversion percentage is what is being tracked',
  ],
  'printed_menu': [
    '$50 for every printed menu mention',
    'Multiple mentions on one menu means multiple payouts',
    'Must be a new 2026 menu, printed after 9/1',
    'A SKU added to an existing menu counts as a payout',
    'Adding Fever Tree to a Bardstown or Green River cocktail menu earns an extra $25',
    'Photo verified — quick menu transitions considered case by case',
  ],
  'bardstown_display': [
    'Off-premise: $30 per account for a minimum 3-case stack display',
    'Display must meet merchandising standards — high visibility (wing, end cap, by the register) with case card pricing',
    'On-premise after 9/1: $50 for 3 bottles ordered for a branded activation or feature drink',
    'Activation needs documentation — posters, table tents, dated drink specials',
  ],
  'two_xo': [
    'Targets 60-day non-buy accounts — August activity counts retroactively',
    'Off-premise: 1 case American Oak + 1 case French Oak pays $40',
    'Off-premise: add 1 case White Oak Rye for another $35',
    'On-premise: a 2-bottle POD qualifier pays $25, and every 2-bottle POD pays out',
    'On-premise: $15 for every POD cocktail menu placement — photo verified',
  ],
  'constellation_fall': [
    'Retain 90% of your fall distribution goals from September through November',
    'Up to $500 for hitting all distribution goals',
    'Reps who achieve all three periods (Spring, Summer, Fall) earn an additional $500',
    'Off-premise house goals: Corona Gaintain 1,610 · Modelo Gaintain 2,418 · Impact 3,433 · Innovation 1,336 (8,797 total)',
    'On-premise packages and draft are scored separately, each brand family on its own: hold 100% of the accounts that bought it from you Mar 1 – May 31',
    'Draft buyers count only on a real keg in the account — an empty picked up does not count',
    'Deck house goals for reference — on-premise packages: Gaintain 1,339 · Impact 631 · Innovation 149 · draft: Modelo Especial 238 · Pacifico 57 · Corona Light 47 · Negra 19 · Premier 13',
    'House goals must be achieved for full payout — if the house goal is missed, qualifying reps are paid 50%',
  ],
  'mabi_retention_fall': [
    'Retain 90% of your MADE distribution goals from September through November',
    'Up to $500 for the MADE / Innovation goal retained',
    'House goal: 8,440 MADE PODs · on-premise goal 410',
    '$25 for every new Black Cherry on-premise non-buy',
    '$10 for every new additional White Claw flavor',
    'Reps who achieve all three periods earn an additional $500',
    'House goals must be achieved for full payout and bonus — otherwise qualifying reps are paid 50%',
  ],
  'yuengling_retention_fall': [
    'Hold 95% of the accounts that bought each Yuengling brand family from you last fall (Sept–Nov 2025), through Nov 30',
    'Goals are per brand family, per side — off-premise, on-premise packages, on-premise draft — with no overall goal',
    'Your goal for each family = 95% of your 2025 buyer count, rounded down (25 buyers last fall → hold 23)',
    'Up to $500 for every brand goal retained',
    'Off-premise families: Lager · Flight · Light Lager · On-premise packages: Lager · Flight',
  ],
  'heineken_husa': [
    'Retain your Heineken distribution goals from September through November',
    'Up to $500 for hitting all distribution goals',
    'Off-premise National goal 840 — Heineken Original, Heineken 0.0, Dos Equis Lager',
    'Off-premise Local goal 455 — Heineken loose bottle, 24oz, 16oz 4pk can, 7oz loose, suitcase can',
    'Off-premise Innovation: Ultimate 6pk bottle & 12pk cans 75 · Heineken 0.0 12pk bottle 25',
    'On-premise National goal 1,035 — Heineken Original, Heineken 0.0, Dos Equis Lager draft',
    'On-premise Local goal 55 — Heineken draft, Dos Equis Lager package',
    '90-day non-buy bonus: off-premise 1–5 case buy or new account plus rebuy pays $15',
    '90-day non-buy bonus: on-premise package 1 case pays $15, draft 1 barrel pays $100',
    'Reps who achieve all three periods earn an additional $500',
    'House goals must be achieved for full payout — otherwise qualifying reps are paid 50%',
  ],
  'new_belgium_distribution_retain': [
    'Retain your New Belgium core brand distribution goals through October–November',
    'Earn a tiered payout for every brand goal retained',
    'Core brands: Voodoo 12pk · Voodoo 19.2oz · Hearted Family · Kirin',
    'Core bonus: retain both periods AND post positive New Belgium growth May–October for an additional tiered bonus',
  ],
};

// Per-program leaderboard row spec: the FEW numbers that explain a rep's
// rank on THIS incentive, plus a color-coded status ("Qualified", "1
// placement to go", "No activity yet"). cls on a metric or status:
// good (green) / warn (amber) / bad (red) / gray-dim (neutral).
const PROGRAM_BOARD = {
  'yuengling_retention_fall': d=>({
    metrics:[
      {num:d.hasAnyGoal?`${d.goalsRetained} / ${d.goalsTotal}`:'—', label:'goals held', cls:d.hasAnyGoal&&d.goalsRetained===d.goalsTotal?'good':(d.goalsRetained>0?'warn':'dim')},
      {num:d.overallPct!=null?`${d.overallPct.toFixed(0)}%`:'—', label:'of all goals'},
      {num:d.offPct!=null?`${d.offPct.toFixed(0)}%`:'—', label:'off-prem'},
      {num:d.packagesPct!=null?`${d.packagesPct.toFixed(0)}%`:'—', label:'on-prem pkgs'},
    ],
    status: !d.hasAnyGoal ? {cls:'gray', label:'No goal set'}
      : d.goalsRetained===d.goalsTotal ? {cls:'good', label:'✅ Holding every goal'}
      : d.overallHeld>0 ? {cls:'warn', label:`${d.goalsTotal-d.goalsRetained} goal${d.goalsTotal-d.goalsRetained===1?'':'s'} still building`}
      : {cls:'gray', label:'Nothing on file yet'},
  }),
  'constellation_fall': d=>({
    metrics:[
      {num:d.hasAnyGoal?`${d.goalsRetained} / ${d.goalsTotal}`:'—', label:'goals held', cls:d.hasAnyGoal&&d.goalsRetained===d.goalsTotal?'good':(d.goalsRetained>0?'warn':'dim')},
      {num:d.overallPct!=null?`${d.overallPct.toFixed(0)}%`:'—', label:'of all goals'},
      {num:d.offPct!=null?`${d.offPct.toFixed(0)}%`:'—', label:'off-prem'},
      {num:(d.on_packages&&d.on_packages.goal)||(d.on_draft&&d.on_draft.goal)?`${Math.round(((d.on_packages.held+d.on_draft.held)/((d.on_packages.goal+d.on_draft.goal)||1))*100)}%`:'—', label:'on-prem'},
    ],
    status: !d.hasAnyGoal ? {cls:'gray', label:'No goal set'}
      : d.goalsRetained===d.goalsTotal ? {cls:'good', label:'✅ Holding every goal'}
      : d.overallHeld>0 ? {cls:'warn', label:`${d.goalsTotal-d.goalsRetained} goal${d.goalsTotal-d.goalsRetained===1?'':'s'} still building`}
      : {cls:'gray', label:'Nothing on file yet'},
  }),
  'keystone_ice': d=>({
    metrics:[
      {num:`${d.accounts} / ${d.qualifier}`, label:'accounts', cls:d.qualified?'good':(d.accounts>0?'warn':'dim')},
      {num:`${d.pct}%`, label:'of base'},
      {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'earned', cls:d.payout?'good':'dim'},
    ],
    status: d.bonusHit ? {cls:'good', label:'✅ Bonus — double pay'}
      : d.qualified ? {cls:'good', label:'✅ Qualified'}
      : d.accounts>0 ? {cls:'warn', label:`${d.toQualifier} account${d.toQualifier===1?'':'s'} to go`}
      : {cls:'gray', label:'No accounts yet'},
  }),
  'sam_adams_conversion': d=>({
    metrics:[
      {num:d.hasOfficial?`${d.converted} / ${d.prevSeason}`:'—', label:'lines converted', cls:d.hasBase&&d.notConverted===0?'good':(d.converted>0?'warn':'dim')},
      {num:d.hasBase?`${(d.convertedPct||0).toFixed(0)}%`:'—', label:'Boston Beer converted'},
      {num:d.hasOfficial?d.gained:'—', label:'gained', cls:d.gained?'good':'dim'},
      {num:(d.encompass&&d.encompass.convertedSinceReport||[]).length, label:'first kegs since report', cls:(d.encompass&&d.encompass.convertedSinceReport||[]).length?'good':'dim'},
    ],
    status: !d.hasOfficial ? {cls:'gray', label:'Not on Boston Beer’s scoreboard'}
      : !d.hasBase ? {cls:'gray', label:'No Summer Ale lines'}
      : d.notConverted===0 ? {cls:'good', label:'✅ Every line converted'}
      : d.converted>0 ? {cls:'warn', label:`${d.notConverted} line${d.notConverted===1?'':'s'} still on Summer Ale`}
      : {cls:'gray', label:'Nothing converted yet'},
  }),
  'touchdowns_tea': d=>({
    metrics:[
      {num:d.offPremNewCount, label:'12pk placements', cls:d.offPremNewCount>0?'good':'dim'},
      {num:d.onPremCases.toFixed(0), label:'on-prem cases', cls:d.onPremCases>0?'good':'dim'},
      {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'tracked', cls:d.payout?'good':'dim'},
    ],
    status: d.payout>0 ? {cls:'good', label:`✅ $${d.payout.toLocaleString('en-US')} tracked`}
      : {cls:'gray', label:'Nothing yet this month'},
  }),
  'evil_genius': d=>({
    metrics:[
      {num:`${d.totalNewPlacements} / 3`, label:'to qualify', cls:d.qualified?'good':(d.totalNewPlacements>0?'warn':'dim')},
      {num:d.offPremNewCount, label:'new accounts'},
      {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'earned', cls:d.payout?'good':'dim'},
    ],
    status: d.qualified ? {cls:'good', label:'✅ Qualified'}
      : d.totalNewPlacements>0 ? {cls:'warn', label:`${d.toQualifier} placement${d.toQualifier===1?'':'s'} to qualify`}
      : {cls:'gray', label:'No placements yet'},
  }),
  'montauk': d=>({
    metrics:[
      {num:d.totalNewPlacements, label:'placements', cls:d.totalNewPlacements>0?'good':'dim'},
      d.draftChannelOk===false ? {num:'N/A', label:'draught', cls:'dim'}
        : {num:d.draftQualifiedCount, label:'draught lines', cls:d.draftQualifiedCount>0?'good':null},
      {num:d.payout?`$${d.payout.toLocaleString('en-US')}`:'$0', label:'earned', cls:d.payout?'good':'dim'},
    ],
    status: d.payout>0 ? {cls:'good', label:`✅ $${d.payout.toLocaleString('en-US')} earned`}
      : {cls:'gray', label:'No placements yet'},
  }),
  '1911': d=>({
    metrics:[
      {num:d.totalNewPlacements, label:'placements', cls:d.totalNewPlacements>0?'good':'dim'},
      {num:d.caseVolume.toFixed(0), label:'cases'},
      d.draftChannelOk===false ? {num:'N/A', label:'draft', cls:'dim'} : {num:d.draftAccountsQualified, label:'draft @ 2 bbl', cls:d.draftAccountsQualified>0?'good':null},
    ],
    status: d.totalNewPlacements>0 ? {cls:'good', label:'✓ On the board'} : {cls:'gray', label:'No placements yet'},
  }),
  'woodchuck': d=>{
    const n = d.totalNewPlacements;
    return {
      metrics:[
        {num:`${n} / 3`, label:'placements', cls:n>=3?'good':(n>0?'warn':'dim')},
        {num:d.caseVolume.toFixed(0), label:'cases'},
      ],
      status: n>=3 ? {cls:'good', label:'✅ Qualified'}
        : n>0 ? {cls:'warn', label:`${3-n} placement${3-n===1?'':'s'} to go`}
        : {cls:'gray', label:'No placements yet'},
    };
  },
  'tona': d=>{
    const c = d.caseVolume24oz;
    return {
      metrics:[
        {num:`${c.toFixed(0)} / 20`, label:'24oz cases', cls:d.qualifies?'good':(c>0?'warn':'dim')},
        {num:d.new24ozCount, label:'new placements'},
        {num:d.caseVolumeOther.toFixed(0), label:'other cases'},
      ],
      status: d.qualifies ? {cls:'good', label:'✅ Qualified'}
        : c>0 ? {cls:'warn', label:`${Math.ceil(20-c)} cases to go`}
        : {cls:'gray', label:'No cases yet'},
    };
  },
  'path_to_victory': d=>{
    const active = d.sixPackAccountCount + d.nineteenTwoAccountCount;
    return {
      metrics:[
        {num:d.sixPackAccountCount, label:'6pk accounts'},
        {num:d.nineteenTwoAccountCount, label:'19.2oz accounts'},
        {num:(d.sixPackUnits+d.nineteenTwoUnits).toFixed(0), label:'units'},
      ],
      status: active>0 ? {cls:'good', label:'✓ Active'} : {cls:'gray', label:'No activity yet'},
    };
  },
  'sam_adams': d=>{
    const all = d.allSkuUnitsThisYear - d.allSkuUnitsLastYear;
    return {
      metrics:[
        {num:signedFmt(d.octoberfestGrowth), label:'Octoberfest vs last Aug', cls:deltaCls(d.octoberfestGrowth)||'dim'},
        {num:signedFmt(all), label:'all Sam Adams vs last Aug', cls:deltaCls(all)||'dim'},
      ],
      status: d.isPositive ? {cls:'good', label:'✅ Commission doubled'}
        : {cls:'warn', label:`${Math.max(1, Math.ceil(-all))} cases to positive`},
    };
  },
  'boston_beer': d=>({
    metrics:[
      d.draftChannelOk===false ? {num:'N/A', label:'draft', cls:'dim'} : {num:d.draftNewCount+d.draftRebuyCount, label:'draft actions', cls:(d.draftNewCount+d.draftRebuyCount)>0?'good':null},
      d.packageChannelOk===false ? {num:'N/A', label:'package', cls:'dim'} : {num:d.packageNewCount, label:'new package'},
      {num:d.points, label:'points', cls:d.points>0?'good':'dim'},
    ],
    status: d.points>0 ? {cls:'good', label:`${d.points} points`} : {cls:'gray', label:'No points yet'},
  }),
  'new_belgium': d=>{
    const total = d.featuredNewCount + d.featuredRebuyCount + d.otherNamedKegCount;
    return {
      metrics:[
        {num:d.featuredNewCount, label:'new PODs', cls:d.featuredNewCount>0?'good':null},
        {num:d.featuredRebuyCount, label:'rebuys'},
        {num:d.otherNamedKegCount, label:'$25 kegs'},
      ],
      status: total>0 ? {cls:'good', label:'✓ Earning'} : {cls:'gray', label:'No kegs yet'},
    };
  },
  'lytt': d=>{
    const nextTier = LYTT_TIER_DEFS.find(t=>d.penetrationPct < t.pct*100);
    let status;
    if(d.tier) status = {cls:'good', label:`✅ ${d.tier}`};
    else if(d.buyingAccountCount>0 && nextTier){
      const need = Math.max(1, Math.ceil(nextTier.pct*d.eligibleAccountCount - 1e-9) - d.buyingAccountCount);
      status = {cls:'warn', label:`${need} account${need===1?'':'s'} to ${(nextTier.pct*100).toFixed(0)}%`};
    } else status = {cls:'gray', label:'No accounts yet'};
    return {
      metrics:[
        {num:d.penetrationPct.toFixed(1)+'%', label:'penetration', cls:d.tier?'good':(d.penetrationPct>0?'warn':'dim')},
        {num:`${d.buyingAccountCount} / ${d.eligibleAccountCount}`, label:'accounts buying'},
        {num:d.caseVolume.toFixed(0), label:'cases'},
      ],
      status,
    };
  },
  'fall_seasonal': d=>{
    const ce = (d.po?.packageCaseEquivalents||0) + (d.pd?.packageCaseEquivalents||0);
    const kegs = (d.pd?.sixtelCount||0) + (d.pd?.halfKegCount||0);
    return {
      metrics:[
        {num:ce.toFixed(1), label:'package CE', cls:ce>0?'good':'dim'},
        {num:kegs, label:'kegs'},
      ],
      status: (ce>0||kegs>0) ? {cls:'good', label:'✓ On the board'} : {cls:'gray', label:'No activity yet'},
    };
  },
  'sun_cruiser': d=>{
    const diff = d.totalCasesThisYear - d.totalCasesLastYear;
    return {
      metrics:[
        {num:signedFmt(diff), label:'total vs last year', cls:deltaCls(diff)||'dim'},
        {num:'+'+d.rate1CaseGrowth.toFixed(0), label:'$1-tier growth'},
        {num:'+'+d.rate3CaseGrowth.toFixed(0), label:'$3-tier growth'},
      ],
      status: diff>0 ? {cls:'good', label:'✅ Earning on growth'}
        : {cls:'warn', label:`${Math.max(1, Math.ceil(-diff))} cases to positive`},
    };
  },
  'yave': d=>{
    const qualifying = d.onPremAccountCount + d.offPremAccountCount;
    return {
      metrics:[
        d.hasOnPremAccounts===false ? {num:'N/A', label:'on-prem', cls:'dim'} : {num:`${d.onPremAccountCount} / 2`, label:'on-prem accounts', cls:d.onPremAccountCount>=2?'good':(d.onPremAccountCount>0?'warn':'dim')},
        d.hasOffPremAccounts===false ? {num:'N/A', label:'off-prem', cls:'dim'} : {num:`${d.offPremAccountCount} / 5`, label:'off-prem accounts', cls:d.offPremAccountCount>=5?'good':(d.offPremAccountCount>0?'warn':'dim')},
      ],
      status: qualifying>0 ? {cls:'good', label:'✓ Earning'} : {cls:'gray', label:'No qualifying accounts yet'},
    };
  },
  'mollys': d=>({
    metrics:[
      {num:d.newPodCount, label:'new PODs', cls:d.newPodCount>0?'good':'dim'},
      {num:d.rebuyCount, label:'rebuys'},
      {num:d.rebuyCaseVolume.toFixed(0), label:'rebuy cases'},
    ],
    status: (d.newPodCount+d.rebuyCount)>0 ? {cls:'good', label:'✓ Earning'} : {cls:'gray', label:'No activity yet'},
  }),
  'garage_beer_summer_sequel': d=>{
    let status;
    if(d.tier==='Super Bonus') status = {cls:'good', label:'✅ Super Bonus'};
    else if(d.tier) status = {cls:'good', label:`✅ ${d.tier} tier`};
    else if(d.caseEquiv>0) status = {cls:'warn', label:`${(d.tieredGoal-d.caseEquiv).toFixed(0)} CE to Tiered`};
    else status = {cls:'gray', label:'No volume yet'};
    return {
      metrics:[
        {num:d.caseEquiv.toFixed(0), label:'CE', cls:d.tier?'good':(d.caseEquiv>0?'warn':'dim')},
        {num:d.tieredGoal.toFixed(0), label:'first goal'},
      ],
      status,
    };
  },
  'garage_beer_president': d=>{
    const g = d.caseGrowthOverLastYear;
    return {
      metrics:[{num:signedFmt(g), label:'CE vs last year', cls:deltaCls(g)||'dim'}],
      status: g>0 ? {cls:'good', label:'✅ Growing'}
        : g<0 ? {cls:'warn', label:`${Math.ceil(-g)} CE to positive`}
        : {cls:'gray', label:'Flat vs last year'},
    };
  },
  'new_belgium_distribution': d=>{
    const total = (d.brands||[]).length;
    const active = (d.brands||[]).filter(b=>b.pushVolumeCE>0).length;
    return {
      metrics:[
        {num:d.pushVolumeCE.toFixed(0), label:'Aug CE', cls:d.pushVolumeCE>0?'good':'dim'},
        {num:`${active} / ${total}`, label:'brands active', cls:active===total?'good':(active>0?'warn':'dim')},
      ],
      status: d.pushVolumeCE>0 ? {cls:'good', label:'✓ Active'} : {cls:'gray', label:'No volume yet'},
    };
  },
  'mc_retention': d=>{
    const gt = d.goalsTotal, gr = d.goalsRetained;
    return {
      metrics:[
        {num:`${gr} / ${gt}`, label:'goals retained', cls:gt>0&&gr===gt?'good':(gr>0?'warn':'dim')},
        d.offGoal>0 ? {num:d.offPct.toFixed(0)+'%', label:'off-prem', cls:d.offPct>=100?'good':(d.offPct>=75?'warn':null)} : {num:'N/A', label:'off-prem', cls:'dim'},
        d.onGoal>0 ? {num:d.onPct.toFixed(0)+'%', label:'on-prem draft', cls:d.onPct>=100?'good':(d.onPct>=75?'warn':null)} : {num:'N/A', label:'on-prem draft', cls:'dim'},
      ],
      status: gt===0 ? {cls:'gray', label:'No goals on file'}
        : gr===gt ? {cls:'good', label:'✅ All goals retained'}
        : {cls:'warn', label:`${gt-gr} goal${gt-gr===1?'':'s'} to retain`},
    };
  },
  'mabi_retention': d=>{
    const thr = (PROGRAM_DATA['mabi_retention']||{}).retainThresholdPct||90;
    const need = d.goal ? Math.max(0, Math.ceil(d.goal*thr/100)-d.placements) : 0;
    return {
      metrics:[
        d.goal ? {num:d.pct.toFixed(0)+'%', label:'of goal', cls:d.retained?'good':'warn'} : {num:'N/A', label:'of goal', cls:'dim'},
        {num:`${d.placements.toLocaleString('en-US')}${d.goal?' / '+d.goal.toLocaleString('en-US'):''}`, label:'placements'},
        {num:d.rebuys.toLocaleString('en-US'), label:'re-buys'},
      ],
      status: !d.goal ? {cls:'gray', label:'No goal set'}
        : d.retained ? {cls:'good', label:d.hitFullGoal?'✅ Full goal held':'✅ Retained'}
        : {cls:'warn', label:`${need.toLocaleString('en-US')} to ${thr}%`},
    };
  },
  'constellation_retention': d=>{
    const gt = d.offGoalsTotal, gr = d.offGoalsRetained;
    return {
      metrics:[
        {num:`${gr} / ${gt}`, label:'goals retained', cls:gt>0&&gr===gt?'good':(gr>0?'warn':'dim')},
        d.offGoal>0 ? {num:d.offPct.toFixed(0)+'%', label:'of overall goal', cls:d.offPct>=100?'good':'warn'} : {num:'N/A', label:'of overall goal', cls:'dim'},
        {num:d.offPlacements.toLocaleString('en-US'), label:'placements'},
        {num:d.draftNewLineCount, label:'new draft lines', cls:d.draftNewLineCount>0?'good':'dim'},
      ],
      status: gt===0 ? {cls:'gray', label:'No goals on file'}
        : gr===gt ? {cls:'good', label:'✅ All goals retained'}
        : {cls:'warn', label:`${gt-gr} goal${gt-gr===1?'':'s'} below 90%`},
    };
  },
  'yuengling_retention': d=>{
    const thr = (PROGRAM_DATA['yuengling_retention']||{}).retainThresholdPct||90;
    const gt = d.goalsTotal, gr = d.goalsRetained;
    const atRisk = d.listedCount - d.heldCount;
    return {
      metrics:[
        {num:`${gr} / ${gt}`, label:'goals retained', cls:gt>0&&gr===gt?'good':(gr>0?'warn':'dim')},
        d.overallPct!=null ? {num:d.overallPct.toFixed(0)+'%', label:'of goal', cls:d.overallPct>=thr?'good':'warn'} : {num:'N/A', label:'of goal', cls:'dim'},
        {num:`${d.heldCount} / ${d.listedCount}`, label:'accounts held', cls:d.listedCount&&!atRisk?'good':(atRisk?'warn':'dim')},
      ],
      status: gt===0 ? {cls:'gray', label:'No goals on file'}
        : gr===gt ? {cls:'good', label:'✅ All goals retained'}
        : {cls:'warn', label:`${gt-gr} goal${gt-gr===1?'':'s'} below ${thr}%`},
    };
  },
};

function medal(rank){
  if(rank===1) return '🥇';
  if(rank===2) return '🥈';
  if(rank===3) return '🥉';
  return '#'+rank;
}

