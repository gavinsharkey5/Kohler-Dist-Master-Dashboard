Asset Inventory dashboard
=========================

Point-of-sale asset inventory (glassware, signage, coolers, umbrellas,
dealer loaders) built from the iSellBeer "Assets" export.

  data/Assets.csv       <- the export, overwrite this to refresh
  generate.py           <- rebuilds the embedded JSON in index.html
  index.html            <- the dashboard (self-contained, no fetch calls)
  data/sync_meta.json   <- written by generate.py; feeds the "Data refreshed" pill


REFRESH STEPS
-------------
1. Pull a fresh Assets export from iSellBeer.
2. Overwrite data/Assets.csv with it (keep the filename).
3. Run:  python3 generate.py
4. Commit index.html, data/Assets.csv and data/sync_meta.json.

generate.py REBUILDS the whole dataset from whatever CSV it is handed --
it does not merge onto what is already published. This export is a full
snapshot of every asset on the books, not a weekly window, so a plain
rerun is correct here. If that ever changes and you start pulling
partial exports, this needs a --merge mode first (see the note in
CLAUDE.md about weekly partial exports).


WHAT THE EXPORT ACTUALLY CONTAINS
---------------------------------
Important: the export is much thinner than its 17 column headers suggest.
As of the 2026-08-28 pull (2,524 rows):

  * 9 of 17 columns are COMPLETELY EMPTY:
      Purchase, Asset Num, Serial Num, Placed in Service Date,
      Customer, Time Confirmed, Purchased Date, Sold Date, Asset Owner
    So there is no way to show who holds an asset, when it was placed,
    how old it is, or whether it has been sold. Don't promise those.

  * 4 more columns are single-valued across every row:
      Status = "Good", Location = "Hawthorne",
      Cost = $0.00, Remaining Value = $0.00
    These are shown once in the "at a glance" strip rather than charted,
    because a chart of one value is noise. In particular there is NO
    dollar value on this inventory -- only counts.

  * Bin is 6461 on 2,519 rows, 25 on two, blank on three. Those five
    exceptions are listed at the bottom of the dashboard.

  * Asset ID is unique on every row, so each row is one physical unit
    and the unit counts are exact.

That leaves Asset Type / Asset Description as effectively the only
column carrying information. Everything the dashboard breaks down by is
DERIVED from that name text (see below).


DERIVED FIELDS (all from the asset name)
----------------------------------------
generate.py parses each asset name into:

  Type      About 55% of units end in an explicit category, e.g.
            "... - GLASSES", "... - PLASTIC CUPS", "... - DEALER LOADER".
            That suffix wins, EXCEPT "- MISCELLANEOUS", which carries no
            information and falls through to the keyword rules. The
            remaining names are classified by keyword (KEYWORD_RULES,
            first match wins, so specific terms sit above generic ones).
            Currently 15 types; only 8 units end up in Miscellaneous.

  Brand     Matched against BRAND_ALIASES, longest alias first so
            "Coors Light" beats "Coors" and "Miller Lite" beats "Miller".
            The alias lists also fold the source's real misspellings
            ("Garag Beer", "Yeungling", "Heinken", "HofBrau") onto one
            canonical name so brand counts aren't split across typos.
            Generic fixtures with no brand (glide racks) show as
            "Unassigned" -- 2 items / 39 units currently.

  Size      "16oz", "0.5 Liter", "20oz" etc. Only shown for Glassware and
            Plastic Cups, since a 54qt cooler in the same list as 16oz
            shakers is just noise.

  Name tag  The bracketed code some names start with -- (TG), *SH*, (CM),
            *CP* and so on, on 912 units across 12 distinct codes.
            THE EXPORT DOES NOT DEFINE THESE. They track closely with
            brand families (CM -> Coors/Miller, SH -> Modelo/Corona/
            Pacifico, TG -> Hofbrau/DAB/Pabst), but several (ME, FP, DM,
            PD) span multiple suppliers, so they could equally be rep or
            merchandiser initials. The dashboard therefore surfaces them
            neutrally as "Name tags" and does NOT label them as a rep or
            a supplier. If Gavin confirms what they mean, relabel the
            "Name tags" panel in index.html and this section.

When a new export introduces brands or product types the rules don't
know, they land in "Unassigned" / "Miscellaneous". Both buckets are
small on purpose -- if either grows after a refresh, add the missing
aliases to BRAND_ALIASES or terms to KEYWORD_RULES in generate.py.


DASHBOARD LAYOUT
----------------
  1. At a glance    4 KPI tiles (units, distinct items, types, brands)
                    plus the uniform-profile strip.
  2. Breakdown      Bar lists by type, brand, drinkware size and name tag.
                    Clicking any bar filters the asset list below.
  3. Asset list     Search + filter chips + sort. Rolls the 2,524 units
                    up into 239 distinct items; expanding a row shows
                    every individual Asset ID for that item (bin
                    exceptions highlighted amber). Renders 50 rows at a
                    time behind a "Show more" button so the page stays
                    short. The search box also matches a pasted Asset ID.
  4. About this data  The caveats above, stated on the page itself so
                    nobody reads a number the export can't support.
