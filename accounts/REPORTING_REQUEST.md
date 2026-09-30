# My Accounts: the consolidated reporting request

Rewritten 2026-09-30 after Gavin's Encompass brief (thirteen screenshots of
the route list, the customer page and its tool menu, Invoice Edit, the
Products catalogue, Accounts Receivable and the Shopping Cart). It replaces
the 2026-09-30 morning version. Nothing below asks for information the repo
already holds. The repo is public: exports that get committed must carry no
names, emails or phone numbers of people -- account contacts included -- so
anything with a contact goes into a git-ignored folder or Supabase, not the
repo (see "Where each file goes").

## 1. What we already have (nothing to request)

| Capability on the Account page | Source in the repo | Used for |
|---|---|---|
| Customer + rep assignment | `hub/data/accounts.js` from the Encompass **Sales Reps' Customer Base** report (CustomerID, name, town, county, area, premise, 2026 cases, assigned rep); `rolling-distribution/data/master/customers.csv` adds the street address; `incentive-tracking/data/customer_base_full.csv` adds Draft / Package service type. Book as of 2026-09-10. | Overview identity, Directions (a Google Maps web URL built from the address), the middleware's per-rep slices |
| Account size + activity | `deciles/universe.csv` from the Supplier_Deciles workbook: class, decile by 2026 gross, `stops_2026`, `dist_pts` | Overview "Size" and "2026 so far" (definition of stops / points to confirm, see 4) |
| Manager -> reps | `allowed_users.reports_to` (Supabase) and the trackers' DM groups | "All my reps" scoped to a district manager's team |
| Sales history | Rolling Distribution master: **Fusion product x account x month** cases, net of returns, Jan 2025 -> Aug 2026 | Sales & reorders, buying patterns, reorder / lapsed / less-often alerts, Previously purchased, the monthly purchase record under Invoices & Balances |
| Product master | `products.csv` (ProductID, name, supplier, brand family, brand, package) | product names, families and packages; the catalogue's rows |
| Brand territory | `hub/data/accounts.js` HUB_BRANDS from the Brand_Sellable_Unsellable workbook (CAN SELL / NOT IN TERRITORY / BLOCKED per family and area) | which products "All eligible products" may show for an account's area |
| Warehouse availability | `inventory-data/inventory_status.csv` + `inventory_projections.csv`, as computed by `inventory/generate.py` (sellable units, days of cover, next arrival, as-of date) -- copied into `accounts/data/catalog.json` | "N units available" per product with the report's date and a stale tag past 7 days |
| Sell sheets (Carbliss only) | `carbliss-onprem-targets/brands_sell_sheets.xlsx` (Encompass Brands export: Brand -> Sell Sheet URL) | the Sell sheet (PDF) link on those 11 products |
| Programs | the trackers' libraries and data (`incentive-tracking/programs.js`, both MPO `programs.js`) | credited / lead / could-qualify per account, what to sell, deadlines, the Lead tag on products |
| Taps + visits | the Tap Tracker's survey (last visit, handles, brands, earlier passes) | Taps & visits, overdue surveys |
| Notes + follow-ups | Supabase `rep_actions` | Focus item 1, Notes & follow-ups |

## 2. Missing sources -- ESSENTIAL

Each item: what it is, the exact fields, identifiers, history, what it
turns on, and whether an export is enough.

### E1. Customer master with contacts, hours and servicing instructions
Encompass **Customers** table export (the customer page's header block).
Fields: CustomerID, Name, Status (active / inactive + date), Premise,
Shipping Address (street, town, state, zip), Contact Name, Phone, Email,
Delivery / Service Instructions (the "After 9 am", "Deliver to back door"
note), Business Hours by weekday (open / close), Assigned Sales Rep and the
rep's Encompass **user ID**, Route / Delivery Day code, Chain / parent
account ID where one exists, License number and type if the table carries
them. One row per CustomerID, all accounts, current snapshot; weekly.
Enables: Overview contact card (tap-to-call, email, hours today with the
week expandable, instructions), inactive accounts hidden from Focus and
reorder checks, a stable rep ID for the middleware instead of a name match.
Export is enough. **Contains people's contact details: git-ignored folder or
Supabase, never the public repo.**

### E2. Route schedule: service days, stop sequence, time windows
The report behind the route list (09/30 Wed, "17 Wed", Stops 143, Service
Time, Map Mile). Fields: Route ID, Rep user ID, Service Date, Weekday,
Stop Sequence, CustomerID, Planned Service Window (start / end), Planned
Service Time, the "17 Wed" code with its meaning (see 4), Next Available
Delivery Date per account if it is a stored field. Current week + next
week, refreshed daily (or a live query, see 3).
Enables: the list's Today / This week filter, "scheduled stops" apart from
the full assigned book, stop order preserved, "Scheduled Wed 9:00-5:00" on
the Overview, the stop / mileage / service-time totals only when this data
says so.
Export is enough for a daily schedule; **live** if it must reflect same-day
reroutes.

### E3. Invoice history with line items
Encompass **Invoices** (Historical Invoices) with lines. Fields: Invoice
Number, CustomerID, Invoice Date, Delivery Date, Type (sales invoice,
credit memo, return, unscheduled), Status (draft / assigned / picked /
delivered / posted / voided -- the exact status list, see 4), Rep user ID,
Total Cases, Total Units, Total Amount, PDF / document reference or URL;
per line: ProductID, Quantity, Unit of Measure, Case Equivalent, Unit
Price, Extended Amount, Deposit, Discount / Promotion applied, Return flag.
Jan 2025 -> today, then weekly. Row cap: Encompass refused an invoice export
above 100,000 records on 2026-08-28 -- pull it in quarterly slices.
Enables: Invoices & Balances (list, search, date filter, expandable lines),
"last ordered on <date>" and cadence in days instead of months for the
buying alerts, September and the current month on the page, returns shown
separately, invoice PDF access (see E6). This one export can REPLACE the
monthly Fusion pulls (the monthly master is derivable from it).
Export is enough.

### E4. Accounts receivable
Encompass **Accounts Receivable** (the screenshot's Amount Due / Credit /
Total Balance and aging buckets). Fields: CustomerID (and the ledger
account when a store has more than one -- the "(HH)" variant, see 4),
Invoice Number, Invoice Date, Due Date, Original Amount, Open Amount,
Credits Applied, Payments Applied, Aging Bucket, Terms, plus the account
totals as Encompass states them: Amount Due, Credit, Total Balance, with
their sign convention. Open items only, refreshed daily.
Enables: the Receivables block (authoritative totals, per-invoice due dates
and aging, credits), the "verified overdue invoice" Focus item for people
who may see money.
Export is enough for a daily figure; **live** for a same-day balance. NOTE:
Gavin's standing rule is no dollars on rep pages (and the Rolling page's
money hold). Receivables need his explicit call on who sees them before any
balance is shown to a rep.

### E5. Backorders, pre-orders and customer allocations
Encompass **Customer Backorder Management**, **Pre-Orders** and the
allocation table behind "Product was Allocated to Customer". Fields:
CustomerID, ProductID, Order / Pre-Order Number, Order Date, Quantity
Ordered, Quantity Outstanding, Expected Availability Date (only if stored),
Status; for allocations: Allocation ID, CustomerID, ProductID, Allocated
Quantity, Remaining, Status, Start / End dates. Open items, daily.
Enables: Invoices & Balances "Backorders and pre-orders", the allocation line
on a product, kept apart from proposed quantities and warehouse stock.
Export is enough.

### E6. Invoice PDFs / documents
Whatever Encompass exposes: a documented URL per invoice, or a nightly
folder of PDFs named by Invoice Number, plus the account-level **Documents**
folder listing (Document ID, CustomerID, Title, Type, Date, URL).
Enables: "Open invoice PDF" and the Documents row under Tasks & Resources.
Needs either the URL format or a file drop; a **live** call if PDFs are
generated on demand.

## 3. Missing sources -- OPTIONAL (improve, do not block)

### O1. Product master with status, supersession, images and conversions
Encompass **Products** export: ProductID, Name, Supplier, Brand Family,
Brand, Package, Units per Case, Case Equivalent factor, Active /
Discontinued flag + date, Replacement ProductID, Seasonal flag, Image URL
(the thumbnails on Invoice Edit), Sell Sheet URL for every brand (the
Brands export we have covers Carbliss only). Enables: no lapsed alert on a
discontinued SKU, pack changes read as one product, thumbnails, sell sheets
on every product, units shown in the same measure Encompass uses.

### O2. Pricing, deals and promotions
Encompass **Pricing / Promotions Calendar** for the account's price level:
ProductID, Price Level or CustomerID, Unit Price, Case Price, Deal /
Promotion ID, Promotion Description, Start / End, Minimum Quantity, the
approved pitch text if one is stored. Enables: "Approved pricing, deals,
promotions" on the product row. Dollars: same rule as E4 -- Gavin decides
who sees prices.

### O3. Retailer stock observations, build-to and retail pricing
The fields behind Invoice Edit's Inventory / Purchase / Backorder columns,
Retailer out of stock / low inventory tabs, "Build To", Take Inventory and
Capture Retail Pricing: CustomerID, ProductID, Observation Date, Observed
Quantity, Build-To Quantity, Retail Price captured, who captured it.
Enables: the retailer-side view next to the warehouse view, dated
separately. Writing new observations from our page is a **live
integration** (see 5).

### O4. Lot / expiration and product-condition flags
The definitions and data behind **Close Dated**, **Stagnant SKU**,
**Distribution void**, **Quantity Reduced**: per ProductID (and per
CustomerID where the flag is account-specific), the flag, its rule and its
date; lot expiration dates for close-dated stock (the inventory_at_risk
export has this for the warehouse already). Enables: the same flags on our
product rows, reusing Encompass's status rather than inferring one.

### O5. Rep <-> manager assignment by ID
Each rep's Encompass user ID and their district manager's ID (the Users
export has titles; it needs the manager column). Enables: "All my reps" from
an authoritative list rather than the hand-kept DM groups.

### O6. Tasks, surveys, assets, execution objectives
Encompass **Tasks** (Task ID, CustomerID, Assigned To, Due, Status, Text),
**Surveys** (Survey ID, CustomerID, Date, Type, Result URL), **Assets**
(Asset ID, Type, Serial, CustomerID, Placed Date, Status -- if this is
placed equipment / coolers, see 4), **Execute Objectives** (Objective ID,
CustomerID, Program, Status). Enables: those rows under Tasks & Resources
with real content instead of the "stays in Encompass" line. Reads are
exports; marking them done from our page is a live integration.

## 4. Definitions to confirm before they appear on the page

1. **Next Available Date** (Invoice list header, "10/01"): the next
   scheduled delivery date for the account, the next date an order can be
   placed, or the next route day? Until confirmed it is not shown.
2. **Route codes**: what "17 Wed" on each stop means (route 17 + weekday? a
   delivery-day code?), and whether the Stops / Service Time / Map Mile
   totals come from a plan or from the day's actuals.
3. **Invoice statuses**: the full list and what each means -- the card on
   the customer page says "Sales Invoice · Assigned"; is that a draft for
   today's visit, a placed order, or a delivered invoice? Which statuses
   count as a purchase?
4. **Invoice Edit columns**: Inventory (retailer count entered by the rep?),
   Purchase (proposed order quantity?), Backorder; and the tabs Retailer out
   of stock / Retailer low inventory (rep-observed or derived?).
5. **Close Dated / Stagnant SKU / Distribution void / Quantity Reduced**: the
   rule and data behind each, and whether they are product-level or
   account-level.
6. **Build To** and **Autofill Inventory from Build To**: where the build-to
   quantities live and who maintains them.
7. **Account suffixes**: "(A)", "(Z)", "(P)" on account names, and the
   "(HH)" second ledger under Accounts Receivable for the same store -- are
   these separate CustomerIDs, and should they be shown as one account?
8. **Accounts Receivable figures**: the meaning and sign of Amount Due
   ($5,584.21 in parentheses), Credit and Total Balance ($275,915.56), and
   whether they can be reconciled from the open items.
9. **Shopping Cart / "Product was Allocated to Customer" / Knowledge**: is a
   cart entry an allocation, a pre-order or a draft? What does the Knowledge
   button open?
10. **Assets**: placed equipment (coolers, draft systems) or POS materials
    (the upstairs stockroom page)?
11. **Customer Users**: retailer logins to DSDLink / PayLink? Admin-only?
12. **CCC License Lookup**: what system it queries and whether it is
    admin-only.
13. **stops_2026 / dist_pts** in the deciles workbook: delivery stops in
    2026 and distribution points (product x account placements)? Shown on
    the Overview with a "(deciles workbook)" tag until confirmed.
14. **Shared accounts**: the customer base gives every account one rep; if
    Encompass can hold two, say how the page should treat it.

## 5. Live integration, not exports

These cannot be done from files and are not built until Gavin confirms the
workflow and provides the documentation:

- **Add to Invoice / Add Unscheduled Invoice / Shopping Cart / Pre-Orders**:
  writing an order or a draft into Encompass.
- **Take Inventory / Replenish / Build To / Capture Retail Pricing /
  Retailer Label**: writing observations back.
- **Refresh Inventory / Sync**: pulling live stock at the moment of the
  visit (our page shows the last export's date instead).
- **PayLink / DSDLink**: payment and retailer-portal links per account.
- **iSellBeer**: opening the app on an account (a documented URL scheme or
  a web link with CustomerID; none is documented to us -- do not guess).
- **Invoice email / sharing**: a supported send with authorised recipients.
- **Encompass deep links**: the inventory_at_risk export carries product
  links of the form
  `https://eagledistne.com/Home?DashboardID=100100&TableName=Products&Parameters=F:ProductID~V:<id>~O:E`.
  If a Customers equivalent exists, send its exact format; the page will not
  invent one.

## 6. Where each file goes

- Anything with **people's contact details** (E1, O6 assignees, Customer
  Users): git-ignored `accounts/private/` or a Supabase table with RLS,
  loaded by the middleware per rep -- never the public repo.
- Money (E3 amounts, E4, O2): Supabase or git-ignored, and shown only to the
  roles Gavin names.
- Everything else (E2 schedule, E3 quantities, E5, O1, O3, O4): the repo,
  as per-rep slices written by `accounts/generate.py` so the middleware can
  enforce them the way it does today.

## 7. History recommended

- Reorder analysis: at least **12 months of invoice-level history**, 18 to
  see seasonality once; the current alerts need 18 months of monthly data.
- Comparable periods: **24 months**, so any 3-month window has its
  same-period prior year.
- Receivables, backorders, allocations, schedule: open items / current week
  only, refreshed daily.
