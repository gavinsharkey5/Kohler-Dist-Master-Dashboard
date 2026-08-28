Rep View -- "What Can I Sell"
=============================

Rebuilt 2026-08-28 per Gavin, who split the two inventory audiences apart:
  Rep View       = "what can I sell?"          <- this folder
  Executive View = "what risk are we carrying?" <- ../inventory-overview/

One question drives every element here: what is available to sell right now.
There is deliberately NO cost, NO inventory value, NO write-off exposure and NO
aging analysis. Those exist, they are just the other page's job -- a rep
standing in an account does not need them, and every one of them added would
make this page slower to read and slower to load.

What replaced what
------------------
This folder previously held a three-tab rep page (Current Stock / Trends &
Forecast / Watch List) built 2026-08-18 on its own copies of InventoryStatus,
InventoryProjections and WatchList_P90_OOS under inventory/data/. That data
folder is GONE -- its exports are now the shared ones in ../inventory-data/, and
the watch list is superseded by real days-of-cover status, which covers every
product rather than a 41-row list.

Files:
  generate.py   Reads THREE of the five shared exports in ../inventory-data/
                (status, projections, received) and writes the embedded JSON into
                index.html's <script id="rep-data"> tag. Its docstring carries the
                per-file detail. Prints a summary worth eyeballing.
  index.html    The page. Standalone -- no fetches, no dependencies.

To refresh:
  1. Save the new exports into ../inventory-data/ (see that folder's README).
  2. Run: python3 generate.py
  3. Run ../inventory-overview/generate.py too -- same sources, both pages.
  4. Commit and push.

The page
--------
  KPI row      Units available · out of stock · running low · arrived last 14 days.
               Units, never dollars.
  Find a product   Search first and biggest, because a rep almost always arrives
               knowing the product they want. Then supplier / brand / pack
               dropdowns and status chips. One table: Available, Days of cover,
               Status, On the way, Last received.
  Just arrived Cards for what landed in the last 14 days, newest first.

Decisions worth not re-litigating
---------------------------------
  * `Available` IS the answer to "what can I sell", used exactly as Encompass
    reports it. Do not recompute it. No arithmetic on the visible columns
    reproduces it -- Inventory - Allocated - Pre-Sales - Unsellable matches only
    3,292 of 4,240 rows, while Available equals On-Floor on 4,057. Encompass is
    reporting something closer to physical floor stock than a ledger
    subtraction, and the number a rep sees here has to match the number they see
    in Encompass or the page is worse than useless.

  * STALE PURCHASE ORDERS ARE NOT SHOWN AS INBOUND. 211 of the 490 products with
    a Next Receive Date on the 8/28 pull are dated in the PAST, some back to
    2021, holding 139,772 of the 239,497 units the export calls "Ordered". They
    are open POs nobody closed out. Only future-dated arrivals count as "on the
    way"; the rest are counted, reported by generate.py and stated in the page's
    own notes, but never promised to a rep. Suppressing them also drops 26
    products from the page that had nothing but a stale order behind them --
    which is why the out-of-stock count moved 181 -> 155 when this went in.
    If Encompass ever cleans those POs up, this guard simply stops firing.

  * Status is real days of cover, not a proxy: out (nothing available), low
    (<=14 days), ok (15-89), heavy (90+, plenty to push), and unknown where the
    projections export has no rate for that product. The old build inferred
    movement from receipt patterns, which called a product slow purely for being
    absent from the receiving window.

  * Brand and pack are DERIVED from the product name (first word; the trailing
    pack config, which parses on ~85% of stocked products). No export carries
    either as a real field. Supplier is the dependable grouping and the page says
    so. Pulling the Products table would make both real -- worth doing if the
    filters get heavy use.

  * No warehouse filter: every row in every export is Hawthorne. A control with
    one option is a dead control; add it when a second location shows up.

  * The page lists ~1,900 of the 4,240 catalogue rows -- everything with stock,
    availability or something genuinely inbound. The rest hold nothing and would
    only pad the payload, which for a page opened on a phone in a parking lot is
    the wrong trade.

Colour: the four status colours are ../inventory-overview/'s already-validated
severity tiers, reused rather than re-picked, and re-checked with the dataviz
skill's validator against the dark surface -- lightness band, chroma floor, CVD
separation, normal-vision floor and contrast all PASS. Every status also carries
its label as text, so nothing depends on colour alone.
