Tier 1 Display Recap
====================

Photo recap dashboard for Ashley Furman's Tier 1 Display Account
Program (May-September 2026), built 2026-08-19 per Gavin. Purpose (from
Ashley's 7/28/2026 email "Tier 1 Display Account Program"): show
management the program's success by pulling every iSellBeer display
photo for the 20 participating accounts into one browsable page.

Files:
  report.xlsx    Raw iSellBeer display-photo export (Report_42), already
                 filtered to the 20 Tier 1 accounts, 05/01-08/19/2026
                 (see its Filters sheet). One row per SKU on a display
                 photo; the photo itself is a hyperlink in the Photo
                 column (ep.cpgdata.com view-photo URLs -- rendered as
                 "View Photo" links that open in a new tab, same
                 approach as display-auction-tracker).
  generate.py    Dedupes SKU rows into distinct photos (836 rows -> 414
                 photos on the first pull), groups them by account and
                 month, and writes the JSON into index.html. Requires
                 openpyxl. Run: python3 generate.py
  index.html     The dashboard: summary tiles (accounts / photos / date
                 range), jump-to-account pills, then one card per
                 account -- sorted by photo count desc -- with the
                 account's contact (from Ashley's email), photo/brand-
                 family counts, and collapsible month sections of photo
                 tiles (date, photo taker, brand families, cases on
                 display when the export has quantities).

View modes (added 2026-08-24 per Gavin, who wanted the actual pictures on
the page rather than a link per photo):
  Details  The original view, unchanged -- months collapsed, one text
           tile per photo with a "View Photo" link.
  Photos   Same accounts and month grouping, but every month is expanded
           and each tile renders the picture itself (<img> straight off
           the ep.cpgdata.com URL, lazy-loaded, 3:4 frame, object-fit
           contain so nothing is cropped out of a display shot), with the
           date/taker/brands/cases underneath. Tapping a picture opens it
           full size, same URL as before.

Both modes are built from the SAME DATA -- photoTile() vs photoCard() in
index.html, picked by the MODE global; acctCard() just chooses the tile
builder, so a data refresh feeds both with no extra work.

Whether the pictures actually embed depends on iSellBeer: the
ep.cpgdata.com view-photo URLs may only serve an image to a signed-in
session, and that could NOT be verified from the build environment
(ep.cpgdata.com is blocked by the sandbox's network policy). So Photos
mode degrades on its own -- an <img> that errors, or decodes to zero
width, is swapped for an "Open Photo" link tile (markBroken()), and a
banner at the top of the view says how many did that. If EVERY photo
falls back on the live site, the URLs aren't publicly fetchable and the
feature needs a different source (direct image URLs from iSellBeer, or
committing the images into the repo) -- Details mode is unaffected
either way.

The account list + program names + store contacts are hard-coded in
generate.py's TIER1_ACCOUNTS, transcribed from Ashley's email ("Linclon
Park" typo corrected to Lincoln Park). The program runs through
September: to refresh, export the same report from iSellBeer with the
end date pushed out, save it over report.xlsx, and re-run generate.py.

Linked from the iSellBeer hub page (isellbeer/index.html) next to the
Display Auction Tracker pill.
