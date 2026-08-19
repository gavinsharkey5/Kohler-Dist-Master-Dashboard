Tap Tracker — What's Actually on Tap, by Rep

Turns the iSellBeer tap survey audit workbook into a rep -> account -> brand
drill-down: each rep's book of accounts is scored Ours vs. Competitor by
tap handle (a pie chart, not just a count of rows), expand a rep to see
their accounts sorted by tap count, expand an account to see its brands,
county, most recent visit date, and most recent photo. A District Manager
filter narrows the whole page to one district's reps at once.

A second tab, "By Brand," regroups the same tap-level records by brand
family instead of rep: a ranked leaderboard by total taps, expand a brand
to see its distribution by County/Area, Rep, and City (each with the same
Ours-vs-Competitor mix). There's no separate brand dropdown -- the
existing search box already matches brand/brand family text, so typing a
name there is how you jump to one instead of scrolling a ~300-entry list.
All the other filters (rep, county, status, DM) apply to this tab too,
computed client-side from the same RECORDS array as the rep tab (see
groupByBrand() in the inline script) -- no new data or generate.py changes
needed for this view.

Three-level command center (redesigned 2026-08-18, per Gavin: "peel
back layers of your own business" -- Company -> District Manager -> Rep,
one unified renderer in index.html's renderSummary()):
  - Two pill rows: District Manager pills above Rep pills (rep row
    filters to the selected DM's team; rep->DM mapping derived from the
    survey records). Both stay in sync with the DM/Rep filter dropdowns.
    A "Reset" button in the header clears every filter, drill, and
    expanded card back to the company default.
  - The hero (big share bar + area chips) renders at EVERY level, scoped
    to it; tapping an area chip filters the whole page (tiles, facts,
    drills, account lists) at every level now, company included. Chips
    only show areas relevant to the scope, and are grouped per
    Kohler's market structure (per Gavin, 2026-08-18): CORE MARKET
    (Bergen, Passaic, Passaic-FF, Sussex, Morris 1, Morris 3) and
    SOUTHERN DISTRICT (Morris 2, Essex, Hudson, Union), each group
    header showing that group's own aggregate share and handle count
    (aggregated over ALL the group's areas, including any too small to
    earn a chip). A group with no areas in scope doesn't render at all,
    so a Core-Market-only rep never sees an empty Southern District box.
  - Fast facts render at every level with level-appropriate wording;
    company/DM add a top-rep-by-share fact (min 100 handles), and the DM
    level adds a coaching-gap fact (lowest-share rep vs highest).
  - Story tiles, ordered what-drives-it -> what-fights-it -> worst-
    spots -> data-trust -> housekeeping: #1 Kohler Brand (drill), #1
    Competitor (drill), Zero-Kohler Accounts (drill), The App Has It
    Wrong (drill), Needs Resurvey (drill), plus the rep-only Peer
    Playbook tile. Survey Health (Taps/Reps/Photos/Corrected) and
    Fragile Brands were REMOVED 2026-08-18 per Gavin, and Biggest Brand
    Gap plus the "Top rep by share" fast fact were REMOVED 2026-08-19
    per Gavin -- the fragile and gap drill code paths remain unrendered
    (bestGap still feeds the biggest-gap fast fact, and bestRep still
    feeds the DM coaching-gap fact).
  - Brand columns and Find My Opportunities remain rep-only.

MY TAP BUSINESS -- rep mode (added 2026-08-17; 2026-08-18: a rep-name
pill row now sits at the top of the command center in BOTH modes as the
visible front door -- reps didn't know the view existed behind the Rep
dropdown. Clicking a pill selects that rep (kept in sync with the Rep
filter both directions); "Everyone" exits to the company view. Same
day, per Gavin: the "Their Segment Edge" and "Authorized, Not Pouring"
company tiles were removed -- their drill code paths remain unrendered
in index.html if either is wanted back. Originally added 2026-08-17, per Gavin: "the rep should
be the center of the experience," opportunities "must respect what that
rep can actually sell"). Selecting a name in the Rep filter transforms
the whole top section into that rep's tap business:
  - Hero share bar (Kohler % vs competitor %) with county chips built
    from the rep's own route; tapping a chip scopes the ENTIRE rep
    dashboard to that county (tiles included -- rep mode deliberately
    differs from company mode here). "SALES" placeholder rows count in
    totals but never appear as a chip or win best/worst area.
  - Your Tap Fast Facts: plain-English, repeat-aloud bullets (share, #1
    Kohler brand, largest named competitor + account count, best/worst
    county, zero-Kohler account count, and the rep's biggest
    distribution gap among their own top sellers -- computed
    rights-aware, see below).
  - Stat row: taps/accounts, Kohler handles, zero-Kohler accounts
    (drill), missing photos (drill), needs-resurvey (drill).
  - Your Top Brands on Tap / What You're Competing Against: ranked,
    clickable -- clicking a brand drills to the accounts carrying it
    (with that brand's handle count per account).
  - Find My Opportunities: the account generator. Competitor-on-tap
    (datalist of the rep's actual competitor families), Kohler
    brand-to-place (datalist limited to brands sellable in the rep's
    counties), min competitor handles. Place-brand results EXCLUDE
    accounts that already carry the brand and accounts in counties
    where the brand is blocked -- the rights source is generate.py's
    brandRights payload, read from the workbook's "Master - US vs THEM"
    sheet (Brand Family x County Final Determination; US = can sell),
    with "Brand Crosswalk" reconciling survey-vs-Encompass brand names.
    A note under the results states the brand's allowed counties.
  Every account list row click drops that account into the search box
  and scrolls to the By Rep view below, so the flow is
  stats -> opportunity -> account -> taps + photo. There is no
  "since your last survey" change view: the export carries exactly one
  visit date per account (single snapshot), so a reliable comparison
  isn't possible until refreshes start archiving prior snapshots.

Command-center tiles (redesigned 2026-08-17, per Gavin: "a sales command
center, not just a collection of KPI cards" -- rep-focused, actionable,
interactive; superseded at the REP level by MY TAP BUSINESS above the
same day -- the tiles below now describe the no-rep/company view). The old static tile row (Taps Surveyed / Ours / Competitor /
Reps / Photos / Corrected / Resurvey) is now two bands:
  "Company-Wide Opportunity" / "<Rep> — Your Route"
    The actionable band. Scoped LIVE by the Rep + District Manager filters
    (deliberately NOT by search/county/status/segment, so tile meaning
    stays stable while those narrow the lists below); picking a rep
    retitles the band to that rep's route and recomputes every tile from
    just their accounts. Tiles:
      - Tap Share: %, us-of-counted, progress bar, and a goal-distance
        line ("N handle conversions to majority" / "Majority held — up N").
        A conversion = flipping one competitor handle to ours, which
        swings the gap by 2.
      - Competitor Opportunity (drill): total competitor handles, biggest
        competitor brand, top NAMED brand when the biggest is a generic
        label like Other Supplier, and the area with the most competitor
        handles.
      - Warm-Account Handles (drill): competitor handles at accounts where
        Kohler already pours at least one line.
      - Accounts to Target (drill): 3+ competitor handles and at most 1 of
        ours.
      - One Handle From Majority (drill): accounts where converting a
        single competitor handle makes the account majority-Kohler
        (them - us <= 1 while not already leading).
      - Strongest Area / Biggest Gap: best and worst Kohler-share areas
        (min 25 handles company-wide / 10 when rep-scoped, so a 3-tap
        area can't win either title); CLICKING one sets the County filter.
      - Needs Resurvey (drill): the same live 60-day computation as
        before, now scoped and drillable.
    Tiles marked (drill) toggle an account table under the tile row
    (account, mix, ours/theirs, top competitor brands, visit date +
    resurvey badge); clicking a row drops that account's name into the
    search box and scrolls to it, so the drill list works as a
    build-my-day worklist. There is deliberately NO "vs. last survey"
    trend anywhere -- the export is one snapshot in time, so trends would
    be fabricated; goal-distance framings are what the data supports.
  "Survey Health"
    The admin metrics, kept but demoted to a compact second band: taps
    surveyed, reps (hidden when a rep is selected), photos, corrected
    rows, plus an Unverified tile that only appears when unverified taps
    exist. All scoped along with the band above.

Mobile field-use pass + 🎯 Build a Target List (2026-08-18, per Gavin:
"preserve what works, make it mobile-friendly, add simple powerful
targeting" -- explicitly NOT a redesign; same information, structure,
and renderers throughout):
  - Mobile (<=760px) optimizations, CSS-only except where noted: 16px+
    inputs (kills iOS zoom-on-focus), 44px+ tap targets everywhere,
    DM/rep pill rows become one horizontally-scrollable line with the
    label on its own line (markup: pills now sit in a .rp-scroll div
    inside each pill row -- desktop layout unchanged), tab buttons
    stretch full-width, toolbar filters stack two-up, account rows wrap
    to two lines so the mix bar / tap count / visit date + resurvey
    badge stay VISIBLE on phones (previously .acct-visited was simply
    display:none under 640px), account detail loses its 60px desktop
    indent, and a fixed 🏠 Reset floating button (bottom-right, mobile
    only) mirrors the header Reset since that scrolls away. Expanded
    accounts now also show a tappable photo preview (.acct-photo-lg,
    lazy-loaded, all screen sizes) instead of only a text link.
  - 🎯 Build a Target List (renderTargetTool, all levels -- company/DM/
    rep, scoped like the KPI tiles by DM+rep+area; COLLAPSED by default
    since 2026-08-19 per Gavin -- a one-line header toggles it open, with
    a "filters set" hint when conditions are active but the tool is
    closed): chip-based, per
    Gavin's Targeting Reports concept but rebuilt mobile-first (no
    side-by-side scrolling lists). "Has on tap" offers every surveyed
    brand family in scope (searchable, ranked by taps); "But missing"
    offers ONLY Kohler catalog brands with sell rights somewhere in
    scope, and matches additionally exclude accounts whose county the
    brand is blocked in (same brandRights payload as Find My
    Opportunities). Quick conditions: min competitor handles,
    zero-Kohler only, needs resurvey. "Find targets" does NOT render
    its own results table -- it applies an account-level filter
    (state.acctFilter) to the EXISTING By Rep / By Brand lists, per
    Gavin ("use the existing account view").
  - Account-filter banner: whenever a target list or KPI drill filters
    the account list, a sticky "📋 Showing N accounts · <criteria> ·
    ✕ Clear" banner renders above the tabs so the rep always knows what
    they're looking at. state.acctFilter also counts as an active
    filter, so matched reps/accounts auto-expand like a search does.
  - "Tap an insight -> see the accounts": every account-based KPI drill
    panel now has a "📋 Show in list" button that hands its rows to the
    same account-filter mechanism (the drill tables themselves are
    unchanged). Find My Opportunities, the tiles, and both tabs
    otherwise behave exactly as before.

Theme (2026-08-18, per Gavin: match the other dashboards): restyled from
the original neutral dark-blue/magenta palette to the same warm
barrel-wood + amber-beer + Kohler-blue theme as the MPO trackers and the
Incentive Tracker, including their topbar breadcrumb and hero banner
(../../assets/hero-banner.jpg + kohler-logo-badge.png). Only the :root
variable VALUES changed (names kept), plus Ours=green / Competitor=red /
Unverified=amber now match those dashboards' good/red/amber colors.

Segment column + filter (added 2026-08-07, per Kohler): every brand row in
an expanded account's table now shows a "Segment" next to Supplier, plus a
Segment dropdown in the toolbar (applies across both tabs, same as the
other filters). Resolved in generate.py by build_segment_resolver(), from
two sheets Kohler added to this same workbook specifically for this:
  - "Brand Segments (iSell)": one row per surveyed tap (same row count as
    the raw survey sheet, though its own "#" doesn't line up 1:1 with the
    raw sheet's -- joined here by Brand/Brand Family text instead) giving
    that brand's Segment. Covers ~100% of taps by volume, but its Segment
    column mixes two different ideas row to row -- sometimes a beer style
    ("Wheat Beer", "Pilsner And Pale Lager"), sometimes a price tier
    ("Craft", "Import", "Domestic") -- because that's genuinely what's in
    the source column, not something normalized here.
  - "Product Segments (Enc)": Encompass's own product catalog (Sub-
    Segments: "Beer - Craft", "Beer - Import", "Beer - Premium", "Beer -
    Economy", "Cider", ...), joined by stripping each SKU's keg-size
    suffix ("Coors Light 15.5 Gal Keg" -> "Coors Light") and matching that
    against the tap's Brand / Brand Family -- directly, or via "Brand
    Crosswalk" (the same reference sheet the executive-overview
    dashboard's velocity section uses) when the names don't line up as-is.
    Encompass only ever carries what WE sell, so this only ever resolves a
    minority of competitor-brand rows, by design.
  Per Kohler, 2026-08-07: Encompass is the stated final source of truth
  when the two disagree, so the final value is Encompass's Sub-Segment
  when resolvable, else iSell's Segment, else "Unclassified" -- never a
  guess. Re-running generate.py prints a one-line coverage summary (rows
  resolved from each source vs. unclassified) so a refresh's match rate is
  visible without opening the workbook.

60-day resurvey warning (added 2026-07-23, per Kohler): reps are expected
to resurvey every account within 60 days. Shown three ways, all computed
live in the browser against today's date (refreshStatus() in the inline
script) rather than baked into generate.py's output -- so the warning
stays correct between data refreshes even if the underlying export
doesn't change for a while:
  - A badge on each account row (and a one-line note in its expanded
    detail): amber "Due in Nd" starting 7 days before the 60-day mark,
    red "Overdue Nd" once past it.
  - A count on each rep's card in the header line (overdue takes priority
    over "due soon" if a rep has both, to keep the line short).
  - A "60-Day Resurvey" tile in the top summary row, totaled across all
    accounts regardless of any active filter (matching how the other
    summary tiles behave).
The 7-day lead time and 60-day window are both edit-in-one-place
constants (REFRESH_DAYS, REFRESH_WARN_LEAD) near the top of the inline
script if Kohler's cadence ever changes.

Michelob Bounty Program tab (added 2026-08-19, per Gavin's manager):
its front door is a big amber banner-pill at the very top of the page
(above the command center -- per Gavin, same day: "move the michelob
bounty up... make the pill bigger and easy to find"; it briefly lived
as a small third tab next to By Rep / By Brand, now removed). Clicking
the banner opens the bounty view and scrolls to it; clicking again (or
By Rep / By Brand) returns to the survey. Hit lists of accounts
pouring Michelob Ultra on draft that are missing Coors Light, Miller
Lite, or both (Aug-Oct program; sell CL/ML in and hold it to collect).
Source is michelob_bounty_targets.xlsx (the "2026 Fall CL & Lite Draft
Targets" workbook -- three sheets: No CL or Lite / No CL / No Lite;
yellow DBA highlight = TOP TARGET, the only per-account tier marker).
generate_michelob.py merges the three sheets ONE ENTRY PER ACCOUNT
(confirmed with Gavin 2026-08-19: combined status chip, not the source
file's duplicated lists) and embeds the JSON in index.html's own
<script id="michelob-data"> block -- a separate pipeline from
generate.py, each script only rewrites its own tag, so the two refreshes
can run in either order. Payouts (from the workbook legends): $200/2mo +
$300/3mo for every target; top targets $400/$600 (missing both) or
$300/$500 (missing one); minimums 4 halves/8 quarters (2mo), 6 halves/
10 quarters (3mo). The tab respects the Rep/DM pills+filters and search
(county/status/segment don't apply to it); each account expands to its
in-house vs competitive draft lineup and a jump link into the By Rep
survey view. Bounty-file rep spellings are canonicalized to the survey's
(case-insensitive; unknown reps -- e.g. Vaughn Gallagher, who has no
surveyed taps -- keep the file's spelling and still render).
PURCHASE TRACKING IS NOT WIRED YET (chosen explicitly 2026-08-19): the
bounty pays on months of CL/ML PURCHASES, which no current data source
carries. Gavin will send a monthly RDE purchase export (CL/ML draft
purchases by account, Aug-Oct); when it lands, extend
generate_michelob.py to attach each account's {"purchases": {"months":
[...]}} and the renderer already shows it. Until then the tab banner
says purchase tracking hasn't started.
To refresh the hit lists: save the new workbook over
michelob_bounty_targets.xlsx, run python3 generate_michelob.py, commit
and push.

Files:
  iSellBeer_TAPS_US_THEM_Mediator.xlsx
                 The tap-audit engine's own working file (see the tap-audit
                 skill) -- a multi-sheet workbook, not a flat export.
                 generate.py only reads two of its sheets:
                   - The raw survey sheet: one row per surveyed tap, raw
                     fields (Account #, DBA, Distribution Area/county,
                     Address, City, Date/Time, Photos, Route / Sales Rep,
                     District Manager, Brand, Brand Family, Supplier, # of
                     Taps) plus the real photo link behind each "Photos"
                     cell's hyperlink. This sheet's own tab name has
                     changed between exports as Kohler edits the workbook
                     (it was "Sheet6", then "Sheet9") -- generate.py finds
                     it by its header row (must have "Account #", "Route /
                     Sales Rep" and "Photos", but not "Corrected
                     Distributor") rather than a hardcoded sheet name, so
                     the next rename won't break the refresh.
                   - "iSellBeer Import Template": the same rows plus the
                     audit engine's output columns -- "Distributor" (the
                     ORIGINAL iSellBeer app flag, pre-audit) and "Corrected
                     Distributor" (the engine's final US/THEM ruling after
                     checking the product catalog + Brand Family Territory
                     rules). Corrected Distributor is what this dashboard
                     shows; where it disagrees with the original flag, the
                     tap gets a "corrected" badge with a tooltip explaining
                     why.
                 The two sheets are joined on "#" (row number).
                 generate.py additionally reads "Brand Segments (iSell)",
                 "Product Segments (Enc)", and "Brand Crosswalk" for the
                 Segment column/filter (see "Segment column + filter"
                 below). The rest of the workbook (Master - US vs THEM,
                 Brand Family Territory(ies), Whitelist (Blackout Reverse),
                 Brands (Enc), Customers Table (Enc), Master Matrix View)
                 are the audit engine's reference tables -- kept here for
                 provenance, not parsed by generate.py yet.
                 A from-scratch reimplementation of that engine in Python
                 (so a bare raw survey export could be self-audited every
                 month without the manual Excel process) is a natural next
                 step if useful -- ask for it.
  on_premise_draft_package.csv
                 Account-level RDE "On Premise Draft Package" export
                 (Customer Num, Customer Name, Draft Package, address
                 fields, Buyer Count, Units). Drives the draft-only
                 account filter (added 2026-08-17, per Gavin: "only the
                 accounts ... are the ones that have a 2 or a 1 ...
                 exclude accounts that have 3 and are package only"):
                 generate.py drops every surveyed account whose Draft
                 Package classification is "3) Package Only" -- they
                 can't take a keg, same ruling as the on-prem MPO
                 tracker's Angry Orchard Target Accounts (Kohler,
                 2026-08-11). Only an explicit "3)" excludes: a surveyed
                 account missing from this export entirely is kept
                 (absence is unknown, not package-only -- the 8.17
                 export was missing ~45 surveyed accounts including a
                 24-handle draft account). The 8.17 filter dropped 29
                 accounts / 54 taps. generate.py prints both counts on
                 every refresh; overwrite this CSV alongside the
                 mediator workbook when refreshing.
  generate.py    Rebuilds the embedded data in index.html from the
                 workbook above. Requires openpyxl (pip install openpyxl).
  index.html     The dashboard itself (data is embedded in the
                 <script id="tap-data"> tag).

To refresh with a new export:
  1. Re-run the tap-audit process on the new raw survey export (see the
     tap-audit skill) to produce an updated mediator workbook.
  2. Save it over iSellBeer_TAPS_US_THEM_Mediator.xlsx in this folder,
     same filename. If a new "On Premise Draft Package" export came too,
     save it over on_premise_draft_package.csv (same columns).
  3. Run: python3 generate.py
  4. Commit and push.

Notes:
  - "# of Taps" (not row count) is what's summed for every tally in this
    dashboard -- an account with 3 handles of the same brand counts as 3
    taps, not 1 row.
  - This export is one snapshot in time: each account appears with exactly
    one visit date. "Most recent visit" / "most recent photo" is just that
    snapshot's value. If a future export ever contains multiple dates for
    the same account (repeat survey passes), generate.py already takes the
    latest one per account, so no code change would be needed for that.
  - index.html does all the rep -> account -> brand grouping client-side
    from the flat row list generate.py emits, and re-groups the same way
    after search/county/status filtering -- so there's exactly one
    grouping implementation to keep correct, not a separate one for the
    default view vs. filtered views.
  - Past builds' source files have had the raw sheet's own Distributor
    column lag the Import Template's Corrected Distributor for a handful of
    rows (an incomplete write-back, not a judgment call). generate.py
    always uses Import Template's Corrected Distributor as the
    authoritative status, not the raw sheet's, to avoid that gap -- with one
    confirmed exception (below).
  - Supplier policy override (confirmed with the user 2026-08-12): the
    8.12.26 source file added an "Unverified Brands" sheet ruling that taps
    from suppliers marked "(In-House)", Other Half, Industrial Arts, and
    Pabst count as US -- reflected in Sheet9's own Distributor column
    (green-highlighted at the source) but not yet in the Import Template's
    Corrected Distributor formula, which still defaults them to THEM under
    the older "No Encompass Match" rule. generate.py special-cases exactly
    these four supplier keywords (SUPPLIER_STATUS_OVERRIDE_KEYWORDS,
    resolve_status()) to trust Sheet9's Distributor over Corrected
    Distributor. If a future export's Import Template formula catches up to
    this ruling, the override becomes a no-op automatically (raw and
    corrected will already agree); it only needs to be revisited if a
    future export disagrees with this policy for these suppliers.
  - Corrected Distributor fill-down gap (found 2026-08-12, still present as
    of the second 8.12.26 export): the newest ~116 rows in the Import
    Template never got the Corrected Distributor (column Y) formula dragged
    down to cover them -- the cells are blank, not miscalculated. Concentrated
    in Robin Feldman (55 rows), Allison Scott (37), Chris Payton (14), and
    Brian Sengebush (10), which is why those reps' accounts showed as
    "Unverified" on the dashboard. generate.py's fill_corrected() replicates
    the exact formula those blank cells would contain -- trusts Expected
    Distributor (column W) when it's a real US/THEM verdict, else falls back
    to the Import Template's own pre-audit Distributor column (same fallback
    the formula itself uses) -- so no dashboard row goes Unverified just
    because a formula wasn't copied down. This is arithmetic, not a judgment
    call: every input it reads is already present and calculated in the
    source file. Once a future export actually fills column Y down, this is
    a no-op (Corrected Distributor is trusted as-is whenever it's non-blank).
    The underlying spreadsheet gap should still get fixed at the source for
    the workbook's own health -- see the fix steps given to the user
    2026-08-12 (fill Y5001:Y5116 down from Y5000's formula, or the
    equivalent range in a future export).
  - District Manager is a clean 1-to-1 mapping onto Route / Sales Rep (each
    rep reports to exactly one DM) as of this build's source file --
    generate.py doesn't enforce that, so if a future export ever gives one
    rep two different DM values across rows, the dashboard would just show
    whichever value each individual tap row carries rather than error.
  - A row with a blank Route / Sales Rep is dropped entirely rather than
    shown as a blank-named rep card -- seen once so far, a stray 0-tap
    placeholder row with no brand either.
