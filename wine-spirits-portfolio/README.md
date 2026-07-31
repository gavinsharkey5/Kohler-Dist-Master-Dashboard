Wine & Spirits Portfolio: Distribution, Sales & Margins
========================================================

Built for Tim's onboarding, per the 3-tab "Kohler Report Requests" sample
workbook (Brand By Item Report, Account Level By Month, Pricing). That
workbook's sample data (Bardstown, Molly's) was only a layout reference --
this dashboard covers the full real W&S portfolio from Encompass exports.

Tabs:
  Overview          Headline KPIs, top brand families by $Vol, and a
                     margin watch list.
  Distribution      "Brand by Item" -- Accounts Purchasing (AP) at four
                     trailing windows, plus a FY25 vs FY26 YTD reference.
  Account Detail    "Account Level by Month" -- rolling 12-month unit
                     detail per account/item.
  Margins           "Pricing" tab's real-world equivalent -- realized $ and
                     % margin per item, from actual invoice transactions.

Files:
  ws_account_level_by_month.csv   RDE "WS Account Level by Month" export.
                                  One row per (On/Off Premise, Product,
                                  Customer) with Buyer Count + Units for
                                  every month from 2025/1 through the
                                  latest complete month.
  ws_brand_by_item.csv            RDE "WS Brand by Item" export. One row
                                  per (On/Off Premise, Product) with
                                  full-year 2025 vs. YTD 2026 Buyer
                                  Count/Units.
  ws_invoice_trans.csv            Encompass invoice transaction export,
                                  one row per invoice line, with cost,
                                  price, and discount detail.
  build_dashboard.py              Rebuilds the entire embedded
                                  <script id="ws-data"> JSON in index.html
                                  from the three CSVs above.
  index.html                      The dashboard itself.

Methodology / key assumptions (see also the in-page notice banner and
glossary tooltips on each tab):

  AP (Accounts Purchasing) = distinct buying accounts ("Buyers" in
    Encompass terms) with at least one unit sold in a window.
      Total AP = lifetime distinct buyers across every month in the data
                 (2025/1 through the latest month). This is NOT a
                 %-of-market figure -- there's no per-brand "addressable
                 market size" data available, so this is just the
                 broadest buyer-count window we have, consistent with how
                 Tim's sample workbook uses "AP" as a synonym for Buyers.
      1YR AP   = distinct buyers in the trailing 12 complete months.
      6M AP    = distinct buyers in the trailing 6 complete months.
      90D AP   = distinct buyers in the trailing 3 calendar months, used
                 to approximate a rolling 90-day window since the source
                 data is monthly, not daily.
      Trend    = compares the current 90D AP window to the 3 months
                 immediately before it (a real "prior period" comparison,
                 not FY-over-FY).

  $Vol = SUM(invoicetrans.extprice) -- i.e. the sum of the Ext Price column
    in ws_invoice_trans.csv (Unit Price x Num Units, already net of any
    discount), across every revenue-bearing line for that item/brand.

  Realized Margin = Unit Price - Laid-in Cost, weighted by units actually
    sold, computed from ws_invoice_trans.csv. The "Pricing" sample tab in
    Tim's request workbook has full FOB/Tax/Distrib-Allowance/Suggested-
    Retail cost detail for exactly one sample item (Bardstown Origin) --
    we don't have that cost breakdown for the rest of the portfolio, so
    this dashboard reports REALIZED margin from actual sales instead of
    reconstructing the theoretical case-pricing-tier template.

  Excluded "zero-price" invoice rows: ~285 of the ~5,000 invoice rows have
    both $0 Unit Price and $0 Ext Price, in large same-day batches (e.g.
    50-60 units on one date for one item) that don't look like paid sales
    -- more likely load-sheet/inventory movements bundled into the same
    export. Including them (cost with zero matching revenue) produced
    nonsensical margin percentages (into the thousands, negative), so
    they're excluded from the Margins tab's units/revenue/cost entirely.
    If these turn out to be legitimate sample/promotional giveaways worth
    tracking, that's a separate report -- flag it and we can add it back
    as its own line item rather than blending it into realized margin %.

  Negative quantities: both ws_invoice_trans.csv fields (Cases, Num Units)
    use "(3)"-style parentheses for return/reversal rows. build_dashboard.py
    parses these as negative numbers (matching how it already parses
    parenthesized negative dollar amounts).

To refresh:
  1. Re-export all three RDE/Encompass reports, keeping the same columns,
     and overwrite the CSVs in this folder (same filenames).
  2. Run: python3 build_dashboard.py
  3. Commit and push.

Open questions for Tim / Gavin (not blocking, but worth confirming once
Tim sees this):
  - Whether the ~285 zero-price invoice rows are meaningful (real sample
    pours, comp'd cases) that deserve their own tracked metric.
  - Whether "90D AP" should eventually be computed from a true rolling
    90-day placement export (like the Lost Placements tab in the
    wine-spirits/ tracker) instead of a 3-calendar-month approximation.
