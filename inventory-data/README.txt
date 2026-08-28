Inventory source exports (shared)
================================

The five Encompass/RDE exports both inventory dashboards read. One folder so the
same export is never pulled twice, added 2026-08-28 when the rep and executive
views were split apart.

  ../inventory/            REP VIEW -- "what can I sell right now?"
                           Reads THREE of these: status, projections, received.
                           No cost, no value, no write-off exposure by design.
  ../inventory-overview/   EXECUTIVE VIEW -- "what inventory risk are we
                           carrying?" Reads ALL FIVE; purchase_transactions is
                           what makes valuation and PO-level exposure possible.

Files, and which view needs them:

  inventory_status.csv          BOTH.  Encompass "Inventory Status". The spine --
                                one row per product, grouped by supplier.
                                `Available` is the sellable figure and is used as
                                delivered; see ../inventory/generate.py for why it
                                must not be recomputed.
  inventory_projections.csv     BOTH.  Encompass "Inventory Projections". Real
                                days of inventory catalog-wide, plus Ordered and
                                Next Receive Date. MONTH COLUMNS SHIFT EVERY PULL
                                -- match by pattern, never by name.
  inventory_received.csv        BOTH.  RDE "Inventory Received". Recent receipt
                                lots, a rolling ~3-month window.
  inventory_at_risk.csv         EXEC.  Encompass "Inventory at Risk (0-60 Days to
                                Expire)". Write-off dollars and expiry exposure.
  purchase_transactions.csv     EXEC.  Encompass "Purchase Transactions". Laid-in
                                cost (valuation) and future-dated lots.

Pulling them
------------
Four are straightforward: export, save over the filename, done.

purchase_transactions.csv is the one to be careful with. Pull it as ONE file
dated 5/1/2026 - 12/31/2026, i.e. about four months back and an end date in the
FUTURE:
  * The start date drives cost coverage. Measured on the 8/28 data: 1 month back
    costs 87% of on-hand units, 2 months 95%, 3 months 96.7%, 4 months 97.3%,
    after which it plateaus. Two months is NOT enough -- the units that drop out
    are the slow movers, which are exactly what the exec view exists to flag.
  * The end date must be in the future or the inbound pipeline goes blank. This
    already happened: the 09:13 pull on 8/28 was complete but ended 8/31 and so
    showed 66 future lots instead of 521.
  * Row cap: ~4,300 rows a month, and the hard refusal is at 100,000 (an invoice
    export hit it). A 4-month pull is ~17k. EXACTLY 5,000 rows means it was
    truncated -- split the range and pull twice.
  * Untested: whether going back further than 4 months lifts cost coverage past
    97.3%. Worth trying 1/1-12/31 once (~35k rows, still well under the cap).

Not needed: an invoice/sales export. Encompass refuses it above 100,000 records
and projections already carries the depletion history and DOI.

After pulling, run BOTH generators -- they read the same files:
  python3 ../inventory/generate.py
  python3 ../inventory-overview/generate.py
