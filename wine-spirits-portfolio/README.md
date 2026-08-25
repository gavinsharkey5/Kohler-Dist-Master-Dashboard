Wine & Spirits Portfolio — MOVED (2026-08-25)
=============================================

The dashboard that used to live here is gone. It was merged with the W&S
Execution Tracker into a single Wine & Spirits dashboard:

    ../wine-spirits/          <- the dashboard
    ../wine-spirits/README.md <- refresh steps, definitions, caveats

index.html in this folder is now a redirect stub, and build_dashboard.py has
been deleted (build_ws_dashboard.py in ../wine-spirits/ does the whole job).
Don't add a generator here again — anything writing to this index.html would
break the redirect.

The CSVs stay in this folder and are still live inputs, read by
../wine-spirits/build_ws_dashboard.py:

  ws_account_level_by_month.csv  RDE "WS Account Level by Month" export. One
                                 row per (On/Off Premise, Product, Customer)
                                 with Buyer Count + Units for every month from
                                 2025/1 through the latest complete month.
                                 This is the case-volume, distribution and
                                 account-status engine for the whole
                                 dashboard. (It is also the premise lookup for
                                 the Bardstown / Green River dashboard.)
  ws_invoice_trans.csv           Encompass invoice transaction export, one row
                                 per invoice line with cost, price and
                                 discount detail. Drives the Margins panel
                                 (reported per case) and supplies the
                                 units-per-case ratio for every product.
  ws_brand_by_item.csv           No longer used. Its only content was a
                                 full-calendar-2025 buyer count against a
                                 partial-2026 YTD buyer count — the
                                 mismatched comparison the rebuild removed.
                                 Kept for reference; matched YTD buyer counts
                                 now come from the monthly file.

Re-export the first two over the same filenames, then run
../wine-spirits/build_ws_dashboard.py.

Why volume changed
------------------
Everything is now reported in CASES. The old page showed "Units Sold" from
these exports, but the export's unit is the selling unit and differs by item
(a bottle for some, a full case for others), so units were never comparable
across the portfolio. The unified builder converts units to cases per product
using the Cases/Num Units ratio in ws_invoice_trans.csv before aggregating
anything.
