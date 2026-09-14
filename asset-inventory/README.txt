Asset Inventory -- the upstairs stockroom
=========================================

Built 2026-09-14 for the POS materials, signage, glassware, displays and
equipment held upstairs at Hawthorne. A CURRENT-STATE operational page: what
we have, how many, what came in, what went out, what has been requested, where
placed assets went, and what is low or out. Deliberately not a historical
analytics page -- no trend charts, no valuation, no aging curves.

Files:
  generate.py   Reads the four exports in data/ and writes the embedded JSON
                into index.html's <script id="asset-data"> tag. All data logic
                lives here; the page only renders. Its docstring carries the
                per-file detail. Prints a summary worth eyeballing.
  index.html    The page. Standalone -- no fetches, no build step.
  data/         The four raw Encompass exports, unmodified apart from being
                renamed to stable filenames.

To refresh:
  1. Pull the same four reports out of Encompass.
  2. Save them into data/ under these exact names, overwriting:
       assets.csv                      <- Assets export
       asset_requests.csv              <- Asset Requests export
       placed_assets_by_customer.csv   <- Placed Assets by Customer
       asset_placement_by_date.csv     <- Asset Placement Report by Date
  3. Run: python3 generate.py
  4. Read what it prints. It HARD-FAILS rather than publishing a wrong number
     (see "What fails the build" below).
  5. Commit and push.

These exports REBUILD the page rather than merging onto it, which is correct
here and different from the display auction tracker: every one of them is a
full current-state snapshot, not a weekly slice. If a partial export is ever
fed in, the page will simply show less stock -- there is no --merge mode and
none should be added unless the exports change shape.


Source summary
--------------

| Source                         | Used?          | Purpose                                    | Fields used                                                                                      | Reason excluded |
|--------------------------------|----------------|--------------------------------------------|--------------------------------------------------------------------------------------------------|-----------------|
| Assets export                  | Yes            | Asset master + current on-hand quantity     | Asset ID, Asset Type, Asset Description, Bin, Location, Time Created                              | --              |
| Asset Requests export          | Yes            | Open requests, outgoing activity, supplier/brand | Asset Request ID, Asset Type, Asset, Supplier, BrandFamily/Brand, Delivery Date, Time Created, Time Updated, Created By, Updated By | -- |
| Asset Placement Report by Date | Yes, partially | 2026 share of each placement ONLY           | Customer Name, Asset Type, Num Of Placed Assets                                                  | Its Purchased Date and Sold Date columns are 100% empty on every row, so despite the report's name it supplies no dates. Everything else in it is a strict subset of the by-customer report. |
| Placed Assets by Customer      | Yes            | Customer-level placements + last placed date | Customer, Asset Type, Number of Assets, Time Placed                                              | -- |
| Assets table-map screenshot    | Reference only | Relationships and future exports            | N/A                                                                                              | Not a data source |

Nothing was excluded outright. The by-date report came closest: it holds no
unique rows and no dates, but its quantity column means something the
by-customer file cannot express (see "Deduplication" below), so it is kept for
that one field and nothing else.


How the files connect
---------------------
ASSET TYPE is the only key shared by all four exports, and it matches exactly
across them -- no fuzzy matching anywhere. Asset ID joins the Assets export to
the Asset column of Asset Requests. Customer name joins the two placement
files. There is no key at all between requests and placements.

  Assets ──Asset ID──> Asset Requests.Asset
     │                      │
     └──── Asset Type ──────┴──── Asset Type ────> both placement files
                                                        │
                                    Customer name joins them to each other


Which source controls current inventory
---------------------------------------
THE ASSETS EXPORT, ALONE. ONE ROW IS ONE PHYSICAL UNIT -- there is no quantity
column and none is needed, because quantity on hand is a row count per asset
type. On the 9/14 pull every row is Status=Good, Location=Hawthorne, with
Customer and Sold Date blank: the export is already filtered to unplaced stock.

That row count is trustworthy because allocation REMOVES a unit from the
export. Of the 1,502 asset requests carrying an allocated Asset ID, ZERO appear
in the Assets file. On-hand is therefore already net of everything that has
gone out, and nothing needs subtracting for it.


Inventory and deduction rules
-----------------------------
    Available = On Hand - Pending Out

  On Hand      Row count in the Assets export.
  Pending Out  Open requests for that asset type -- in the queue, no unit
               pulled yet, so physically still on the shelf but spoken for.
  Reserved     NOT SUPPORTED, and no column is shown for it. Encompass has no
               reserve state for assets: a request either has a unit allocated
               (and that unit has already left the export) or it has nothing.
               There is no third bucket, so rather than fill a Reserved column
               with a guess, the page omits it and says so in its own footer.

A request is NOT treated as outgoing merely for having been submitted. It
reduces on-hand only once a unit was actually allocated -- at which point
Encompass has already removed that unit, so the deduction is Encompass's, not
ours. Open requests reduce AVAILABLE only, never ON HAND.

Fulfilment status is derived, because the export has no status column:
  Asset ID present -> FULFILLED. The unit is gone from stock. 1,502 rows.
  Asset ID blank   -> OPEN. Nothing pulled. 98 rows.
The split corroborates itself: all 1,502 fulfilled rows carry a Delivery Date,
and 91 of the 98 open rows have no Delivery Date AND have never been touched
since creation (Time Updated == Time Created). The 7 that have a delivery date
but no allocated unit are counted as open and listed under Data issues.

Statuses: Out of Stock (available 0), Low Stock (available 1-2), Available
(3+). The 1-2 threshold is LOW_STOCK_AT at the top of generate.py -- a flat
number because no export carries a reorder point or a par level. Change it
there.

SHORTAGES ARE NOT DATA ERRORS. Ten items have more open requests than units on
hand. On hand is a row count and can never go negative; there is simply more
demand than stock. Those items read Out of Stock (the honest status), carry a
"Short N" marker, and are listed under Data issues as "Demand exceeds stock" so
they are reviewable -- but they are real operational shortages, not bad data.


Deduplication rules
-------------------
THE TWO PLACEMENT FILES ARE THE SAME PLACEMENTS OVER DIFFERENT WINDOWS, NOT
INDEPENDENT EVENTS. THEIR QUANTITIES MUST NEVER BE ADDED.

  placed_assets_by_customer.csv  lifetime, every year: 2024, 2025, 2026, plus
                                 967 undated rows. 6,594 rows, 12,891 units.
                                 Time Placed is the MOST RECENT placement.
  asset_placement_by_date.csv    the 2026 slice only. 2,444 rows, 5,072 units.

Every one of the by-date file's 2,444 (customer, asset type) keys is present in
the by-customer file, neither file has a duplicate key, and by-date quantity is
never larger. So they are joined on the EXACT (customer, asset type) pair and
each supplies only what it uniquely knows: lifetime units and last-placed date
from by-customer, the 2026 figure from by-date. 12,891 and 5,072 both reconcile
back to their own file after the join.

DO NOT "improve" that join by normalising case or punctuation. An earlier build
did, and it double-counted 15 units: "Thatcher Mc Ghees (A)" and "Thatcher
Mcghee's (A)" collapse to one key under normalisation and both then picked up
the same 2026 quantity. Exact matching covers 2,444 of 2,444 rows and needs no
help. The near-duplicate spellings are instead reported under Data issues as
"Possible duplicate placement" -- three accounts are affected, and the fix
belongs in Encompass, not in this join.

Requests are one row per unit, so a rep asking for 18 mugs files 18 identical
rows. Rows identical in item + requester + day collapse into one line whose
quantity is the row count (98 units across 51 lines). Every request ID is kept
on its line and the unit totals still reconcile.


What fails the build
--------------------
generate.py asserts rather than publishes a wrong number. It stops if:
  * unit totals do not equal the Assets export row count
  * open + fulfilled requests do not equal the request export row count
  * pending totals disagree with the grouped open request lines
  * any item's Available is not max(0, On Hand - Pending)
  * placement units do not reconcile to BOTH placement files after the join
  * the <script id="asset-data"> tag is missing from index.html
It also prints how many by-date placement rows matched (2,444/2,444 today). If
a future export drops that number, the customer naming changed -- fix the
export or the key, do not loosen the join.


Known limitations
-----------------
  * AN OUTGOING UNIT CANNOT BE TIED TO BOTH A REP AND A CUSTOMER. Requests
    carry a rep (Created By / Updated By) but no customer; placements carry a
    customer but no rep. There is no shared key. So "Sent out" shows who pulled
    it and "Placed by customer" shows where it ended up, and the page does not
    pretend to connect them.
  * RECEIVING IS A PROXY, NOT A LOG. "Recently received" is units by the date
    their record was created in the Assets export, which only covers units
    STILL ON HAND -- anything received and already sent back out has left the
    export and cannot appear. Read it as "what arrived and is still upstairs".
    There is no receiving or purchase-transaction export here.
  * NO CANCELLED STATE EXISTS, so an abandoned request stays open forever. The
    page ages them instead: 75 of the 98 open units are over 30 days old, 39 of
    them filed on a single day (7/15/26). Treat the old ones as a cleanup list,
    not as live demand. OPEN_STALE_DAYS in generate.py sets the threshold.
  * STORAGE LOCATION DOES NOT YET SEPARATE ANYTHING. Every unit is at
    Hawthorne and 2,473 of 2,478 sit in bin 6461 (2 in bin 25, 3 blank). The
    column is shown because it is real, but it will not help anyone find an
    item until bins are actually used.
  * SUPPLIER AND BRAND COVER 145 OF 243 STOCKED ITEMS. Neither is in the Assets
    export; both come from Asset Requests, so an item nobody has requested has
    none. Where absent the page says "Supplier not in export" rather than
    guessing. Pulling the Asset Types table would fix this properly.
  * COST IS NOT AVAILABLE. Cost and Remaining Value are $0.00 on every row, and
    Serial Num, Asset Num, Purchase, Placed in Service Date and Asset Owner are
    empty on every row. No valuation is possible and none is shown.
  * CATEGORY IS DERIVED from the text after the last dash in the asset name
    (GLASSES, LED, DEALER LOADER, PLASTIC CUPS...). It parses on most items;
    the rest read "Uncategorised". No export carries a real category field.
  * WHETHER PLACED ASSETS COME BACK IS UNKNOWN. Nothing in these exports
    distinguishes a permanent giveaway from a loan, and there is no return or
    retrieval record, so the page treats every placement as a one-way movement.


Additional Encompass exports that would help
--------------------------------------------
In rough order of value:
  1. ASSET TYPES table -- real supplier, brand family and category per type.
     Would fix the 98 items with no supplier and replace the derived category.
     The table map shows Assets linking to Asset Types, Asset Categories,
     Suppliers, Supplier Families, Brands and Brand Families.
  2. A REQUEST STATUS FIELD, or an Asset Requests export that includes
     cancelled/closed rows. Would turn the 75 ageing open units into a real
     open/cancelled split instead of an age heuristic.
  3. CUSTOMER on the Asset Request (the table map shows Assets -> Customers).
     This is the single field that would let an outgoing unit be traced from
     rep to account, and it would make the placement files largely redundant.
  4. PURCHASE TRANSACTIONS for assets (Assets -> Purchase Transactions on the
     map) -- a real receiving log with dates, quantities, supplier and a
     reference number, replacing the record-creation proxy.
  5. SHELVES / STORE LOCATIONS (both on the map) once bins are actually in use.
  6. A par level or reorder point per asset type, to replace the flat
     low-stock threshold.


Decisions worth not re-litigating
---------------------------------
  * ON HAND IS A ROW COUNT. Do not go looking for a quantity column; there
    isn't one, and adding a "Quantity" field to the export would break this.
  * ALLOCATED UNITS ARE NOT SUBTRACTED AGAIN. They are already absent from the
    Assets export. Subtracting fulfilled requests from on-hand would
    double-count every outgoing unit.
  * THE 2026 AND LIFETIME PLACEMENT COLUMNS ARE NOT ADDITIVE and are not two
    different placements. See Deduplication above.
  * THE SHORTAGE COUNT BELONGS IN "OUT OF STOCK", not in its own KPI tile --
    every short item is by definition out of stock, and a separate tile said
    the same thing twice.
  * COLOUR: green available / amber low / red out, reusing
    ../inventory-overview/'s already-validated severity tiers rather than
    re-picking them. Every status also carries its label as text, so nothing
    depends on colour alone.
