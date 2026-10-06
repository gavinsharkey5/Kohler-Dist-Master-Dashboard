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
| Sales history | Rolling Distribution master: **Fusion product x account x month** cases, net of returns, Jan 2025 -> Sep 2026 | Sales & reorders, buying patterns, reorder / lapsed / less-often alerts, Previously purchased, the monthly purchase record under Invoices & Balances |
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

## 8. What the account assistant needs -- one consolidated list (2026-09-30)

The Ask tab answers today from the monthly sales master, patterns.py, the
rep's notes and the tap survey, with program status and warehouse
availability quoted from the page. Everything below would let it answer
questions it now has to decline, in priority order. Items marked (E)/(O)
are the same exports as sections 2-3; nothing new is invented here.

1. **Invoice history with line items and dates** (E3) -- days between
   orders, order counts, "when did they last order X" by date rather than
   by month, and the fresher grain the pitch mode needs to react to a
   recent order. Quarterly slices under the export cap; same per-rep
   slicing as the sales files.
2. **Accounts receivable** (E4) -- "what do they owe / is anything past
   due" is the question the assistant refuses most often. Money is shown
   only to the roles Gavin names; the assistant would keep the same rule.
3. **Sellable inventory with a timestamp** (the /inventory/ RDE, daily or
   better) -- so "can I sell 25 cases of X" is answered from the warehouse
   report's date, and so starred products / alerts (product direction)
   become possible. Confirm the field and the refresh delay first (§4).
4. **Customer master: contacts, hours, delivery instructions, next
   delivery date** (E1) -- private folder or Supabase, never the repo.
5. **Route schedule** (E2) -- "when am I there next", stop sequence.
6. **Approved product information for pitch practice**: the Encompass
   Brands export with sell-sheet URLs for EVERY supplier (today only
   Carbliss has them), plus a product master with description / ABV /
   pack / status (O1). Without it the buyer role can only name products
   and packages.
7. **Backorders, pre-orders, allocations** (E5) -- so the assistant can
   say "on backorder since <date>" instead of "not in the data".
8. **Documented customer preferences / notes from Encompass** ("Customer
   Information", tasks, survey answers -- O6): the assistant should quote a
   preference the company recorded, not infer one.
9. **Pricing, deals, promotions** (O2) -- ONLY if the dollars policy
   allows; until then the assistant keeps money off the page.

Definitions the assistant depends on (all in §4): Next Available Date,
invoice statuses, Close Dated / Stagnant / Distribution void / Quantity
Reduced, account suffixes, AR signs, shared accounts.


## 9. Map, photos, notes and Incentive Performance -- additions (2026-10-02)

The 2026-10-02 build added an account map, account photos, notes with
follow-up dates and a manager-only Incentive Performance page. Each needs
data the repo does not have. Every item below lists essential vs optional,
the fields, the history, the refresh, and what it turns on. Items that
already exist above are referred to, not restated.

| # | Source | Essential? | Fields | History | Refresh | Turns on |
|---|---|---|---|---|---|---|
| G1 | **Validated account coordinates** -- `accounts/geo.csv` | Optional (the map geocodes addresses through the US Census geocoder meanwhile) | `customer_num,lat,lng,source` (source = where the point came from, e.g. `encompass`, `gps`, `survey`); WGS84 decimal degrees; one row per CustomerID | current | when accounts open / move | exact pins instead of address matches; accounts the geocoder cannot place (no street, PO box, ambiguous) appear on the map instead of only in "Not on the map". `accounts/generate.py` refuses points outside northern NJ. |
| G2 | **Route schedule with stop sequence** (= E2) | Essential for "Today's Stops" | Route ID, rep user ID, service date, stop sequence, CustomerID, planned window | current + next week | daily | the map's and list's Today's Stops scope, numbered in the scheduled order. Until it exists the map shows only "All Assigned Accounts" and there is no Today's Stops view -- no stop or order is inferred. |
| G3 | **Contacts, hours, servicing instructions** (= E1) | Essential for the Contact & Servicing group | see E1 | current | weekly | phone / email / hours / delivery notes in Account Details. People's contact details: Supabase or git-ignored, never the repo. |
| P1 | **Invoice-level sales with revenue and cost** (= E3 plus money) | Essential for Incentive Performance | invoice number, invoice date, CustomerID, ProductID, quantity + unit, net revenue, laid-in cost, discounts / allowances, returns and credits as their own lines | every program period (Jul 2026 on), ideally 24 months for baselines | weekly, or when a program closes | qualifying sales, cases, COGS, gross profit and margin per program. Fusion's monthly money file (only Jan-Mar 2025 loaded) cannot separate qualifying sales from the rest of a month. |
| P2 | **Program payout records** | Essential for Incentive Costs | program, rep, amount, earned / approved / paid dates | each program | when payouts are approved | incentive cost per program, shown on its own line. |
| P3 | **Supplier funding / reimbursements** | Essential for Supplier Reimbursements | program, supplier, amount, basis (per case / per placement / flat), date received | each program | monthly | supplier funding per program, shown on its own line. |
| P4 | **Each program's qualifying rule in data form** | Essential for "qualifying" sales | program id, eligible ProductIDs / packages, account conditions (e.g. 90-day non-buy), start / end dates | each program | when a program is loaded | matching invoice lines to a program by rule rather than by hand. |
| P5 | **Line-level adjustments** (returns, breakage, out of code by account) | Optional | as P1, with the reason code | as P1 | as P1 | returns netted against the sale they reverse. The Comparison export already gives out-of-code and breakage by product and month (Gavin is sending September). |
| C1 | **Product unit conversions** (= O1) | Essential for any mixed-unit total | ProductID, units per case, case equivalents (2.25 gal / 24-12 oz), keg size | current | when products change | "Cases" on Incentive Performance and the exports summed in one unit with the conversion shown. |
| I1 | **Reliable sellable inventory** (see 8.3) | Essential before any stock alert | ProductID, sellable units, as-of timestamp, holds / allocations | current | daily or better | the Inventory tab and Products' "Stock at last update" stay labelled with the report date; nothing claims live stock. |
| D1 | **iSellBeer photo integration docs** | Optional | a supported API or upload path for photos per account, with its auth | -- | -- | sending account photos on to iSellBeer. Until then photos are stored only in this site's shared storage and the page says nothing about iSellBeer. |
| D2 | **Encompass notes integration docs** | Optional | a supported way to read or write customer notes / tasks | -- | -- | showing Encompass's own notes beside ours. Today notes live only in Supabase `rep_actions`. |

**Financial definitions to confirm** before any number appears on the
Incentive Performance page are listed on that page under "Definitions to
Confirm" (revenue, cost, Fusion's Gross, returns and credits, discounts,
supplier funding, payout timing, participation, qualifying rules, baseline,
overlap between programs, internal accounts). Qualifying-sales gross profit
is never presented as profit caused by an incentive.

## 10. Activity, opportunities, photos and exceptions -- the one list to send (2026-10-03)

The 2026-10-03 build added the Account Activity timeline, "Programs This
Account Could Help Complete" with selling resources, saved drafts, photo
labels and the manager Exceptions page. This is the ONE consolidated request
for that work. Items already above are referred to, not restated.

### 10.1 One step for Gavin (no data, just SQL)

| # | What | Why |
|---|---|---|
| S1 | DONE 2026-10-02. Run `supabase/migrations/20261003090000_photo_labels.sql` in the Supabase SQL Editor (after the 2026-10-02 file, which is already run). | Lets a photo be Uncategorized, adds the optional brand / program labels and lets the author fix a label later. Until it runs, photos save without brand / program, relabelling is hidden and the page says so once. Verified on a local Postgres 16 (idempotent, author-only relabel, account / file / author / times locked). |

### 10.2 ESSENTIAL (a feature is blocked or shown as unavailable without it)

| # | Source | Fields | History | Refresh | Turns on |
|---|---|---|---|---|---|
| A1 | **Approved customer pitches per program** | program id, the approved one- or two-line pitch, who approved it, date, optional supplier source (deck / sell sheet name) | current programs | when a program is loaded | "Approved Quick Pitch" under Selling Resources. Today every card says no approved pitch is on file: the program sheets in the repo are rep-incentive summaries (with payouts), not customer copy, and nothing is generated in their place. A plain CSV `incentive-tracking/data/pitches.csv` (program_id,pitch,approved_by,approved_on) is enough. |
| A2 | **Sell sheets for every brand** (beyond Carbliss) | brand family or ProductID, sell-sheet URL or PDF, valid-from / to | current | when a supplier sends a new one | "Sell Sheet" links on every opportunity card. Only Carbliss has them (the Encompass Brands export, `brands_sell_sheets.xlsx`); the same export for all brands is the simplest source. |
| A3 | **Visit records** (= part of E2) | rep user ID, CustomerID, check-in / check-out time, source (Encompass, iSellBeer, GPS) | 12 months | daily | a real "Visit" event in Account Activity. Until then nothing on the page is called a visit: tap surveys, photos and notes are labelled as what they are, and Exceptions never infers a missed visit. |
| A4 | **Account issue log** (complaints, service problems, equipment, out-of-stock reports) | issue id, CustomerID, type, opened / closed dates, owner, status, short text | open issues + 6 months closed | daily | "Unresolved Issues" on the Exceptions page and an Issue event in Account Activity. Exceptions says plainly that no issue source exists. |

### 10.3 OPTIONAL (improves what is already on the page)

| # | Source | Fields | Refresh | Turns on |
|---|---|---|---|---|
| B1 | **iSellBeer survey passes with the surveyor's name** | Account #, Date/Time, user | with each tap export | the author on tap-survey events (today: "iSellBeer" without a name). The workbook keeps passes (the Tap Tracker's history payload) but not who took them. |
| B2 | **Display / photo records from iSellBeer** (= D1) | account, date, type, brand, image URL | daily | iSellBeer photos beside ours in Account Activity and Photos. |
| B3 | **Program-to-package eligibility in data form** (= P4) | program id, eligible ProductIDs / packages | when a program is loaded | "Eligible" on each opportunity card read from the rule instead of from the brand family + an "N oz" size in the program name. |
| B4 | **Reliable sellable inventory** (= I1 / 8.3) | ProductID, sellable units, timestamp | daily or better | the stock lines under Selling Resources stop carrying a "Snapshot is N days old" tag. They are always labelled as a snapshot at Kohler's warehouse, never live. |
| B5 | **Rep ↔ manager by user ID** (= O5) | rep user ID, manager user ID | when teams change | Exceptions' "All My Reps" read from data instead of the trackers' DM groups + kdh_team names. |

### 10.4 Definitions to confirm

1. Tap survey "due": the Tap Tracker's 60-day resurvey rule on the latest pass. Should any on-premise account type be exempt (seasonal, closed, no draft)? 461 surveys are past 60 days in the 2026-09-23 export.
2. Exceptions windows: program ending within 14 days; follow-up due soon within 7 days; an undated follow-up becomes an exception after 14 days. Change any of these?
3. Who may relabel a photo: today only its author. Should a DM be able to fix labels on their team's photos?

### 10.5 What is NOT needed from anyone

Drafts and upload recovery use the device's own storage (localStorage for a
note, IndexedDB for a photo) scoped to the signed-in person; nothing new in
Supabase. Opportunities use the trackers' existing lists and rules.
Exceptions reads only data the site already has.

## 11. Merchandising records, iSellBeer imports, eligibility and the assistant -- the one list to send (2026-10-04)

The 2026-10-04 build added merchandising RECORDS (photos + product / brand
lines + optional program), the iSellBeer import with a reconciliation and a
review queue, the manager Merchandising recap (CSV + PDF), one shared
program-product eligibility rule, the assistant's availability check, and
the Exceptions grouping. This is the ONE consolidated request for that work.
Items already above are referred to, not restated.

### 11.1 Steps for Gavin (no data needed)

| # | What | Why |
|---|---|---|
| S1 | Run `supabase/migrations/20261004090000_merchandising.sql` in the Supabase SQL Editor (paste the whole file, Run). Idempotent; verified on a local Postgres 16 (26 checks). | Creates merch_records / merch_lines / merch_record_photos / merch_import_batches / merch_review and the save / import / resolve functions. Until it runs, photos still save one per record and the pages say the update is needed. |
| S2 | Merchandising -> Import From iSellBeer: add the Display, Raw Reports (tap survey) and Promos exports and any photo PDFs; check the reconciliation; match report pages by hand (or leave them for the Review Queue); Import. | Loads the history. Re-importing the same file restates, never duplicates. |
| S3 | The assistant: if My Accounts -> Ask says "not set up", follow the "How to Set It Up" step it shows a manager -- Vercel -> Settings -> Environment Variables -> `ANTHROPIC_API_KEY` (from console.anthropic.com -> API Keys), Production, Save, then Redeploy the latest Production deployment. Never paste the key into chat, email or the code. | The function answered "ANTHROPIC_API_KEY is missing from this deployment"; the page now checks before taking a question and shows the step. |

### 11.2 ESSENTIAL

| # | Ask | Detail | Turns on |
|---|---|---|---|
| M1 | **Original iSellBeer images** | The workbooks link to `ep.cpgdata.com` (displays / promos) and S3 (tap surveys). From the build environment the S3 tap photo loaded; the ep.cpgdata.com links were blocked, so it is unknown whether they need an iSellBeer login. Ask iSellBeer: (a) do those links work for a signed-out browser, and for how long; (b) a bulk image export with Account #, Date/Time and the photo id in each file name. | Imported photos that show instead of "Photo Unavailable", and copies stored in our private bucket so they never expire. |
| M2 | **Field definitions in the iSellBeer exports** | Promos: what Promo # identifies (it repeats across accounts, so it is NOT used as an ID), Promotion Type vs Theme vs Elements, and what "MBO" means (kept as text; never mapped to a Hub program). Display report: what the quantity counts (cases, units, facings?) -- imported as "unit not stated" until confirmed. Raw Reports: how US / THEM is decided at survey time. | Units shown instead of "unit not stated"; a documented Promotion Type -> category map. |
| M3 | **PDF photo reports with a key per page** | The 7-page Promos PDF has no machine-readable link from a page to a row; pages were matched by reading them (none automatically -- position is never used). Ask for the PDF (or image ZIP) with Account # + Date/Time, or the photo id, on each page / file name. | Automatic page matching; today every page is matched by hand or waits in the Review Queue. |
| M4 | **Qualifying products per program** (supersedes 10.3 B3) | program id, ProductIDs that count, and for which part of the program (off-premise POD, draft bonus...). Lagunitas Sprint is done from its own export (13 products) -- see 11.4 Q1. | The same rule on the opportunity cards, the Products list Lead tags, the assistant and (later) the trackers' target lists. |
| M5 | **Evidence verification rules** | Does any supplier program require photo evidence? Who reviews it, against what (display size, days up, brands)? Nothing is invented: a saved photo is "evidence, not credit" and never completes a program. | A review status on records -- only once the rule is written down. |

### 11.3 OPTIONAL

| # | Ask | Turns on |
|---|---|---|
| O1 | Surveyor / photo-taker names in every iSellBeer export (= 10.3 B1) | "Photo taker" on imported tap surveys (the Display and Promos exports carry it; Raw Reports does not). |
| O2 | A scheduled iSellBeer export (or API) of displays / promos / surveys (= 10.3 B2) | Imports without a manager uploading files; the parser already accepts the format. |
| O3 | Sell sheets for every brand (= 10.2 A2) | Sell Sheet links in the opportunity Details fold for brands other than Carbliss. |

### 11.4 Definitions / decisions to confirm

1. **Lagunitas Sprint, the Little Sumpin' keg.** The program export lists 13 products, including Little Sumpin' IPA 15.5 gal keg (#12920); the tracker's draft-bonus text names only IPA 15.5 / 7.75 gal kegs. The shared list follows the export (13). Should #12920 count?
2. **Lagunitas territory.** The Brand Permissions workbook says Lagunitas is NOT IN TERRITORY in Union, Essex, Hudson, Sussex and Morris 2 (BLOCKED in Morris 1); the sales master agrees (none of Alex Rodriguez's 61 Union / Essex accounts bought Lagunitas in Jan 2025 - Aug 2026). The Incentive Tracker's own "Stores To Target" list for Lagunitas Sprint still includes those accounts (its generator does not apply the workbook). The Hub, the Account page and the assistant now follow the workbook. Confirm the workbook is right, and the tracker's list will be fixed to match.
3. "Feature Activation" promos with no elements are imported as Other Activation (not assumed to be a display). OK?
4. Who may edit an imported record's labels: today nobody (read-only); a Hub record: only its author. Should a DM fix labels for their team?
5. The printed recap holds 150 records (the CSV holds all). Raise or lower?

### 11.5 Live integration (not built, on purpose)

- **Writing back to iSellBeer**: not possible today and never claimed -- every
  page says saving in the Hub does not change iSellBeer. It would need
  iSellBeer's API documentation and credentials.
- **Snowflake**: not implemented. The importer's parser (merchandising/isb-import.js)
  is separate from the writer (kdh_merch_import), so a Snowflake feed can
  produce the same payload later without changing the tables.

### 11.6 What is NOT needed from anyone

Record drafts use the device's own storage (IndexedDB, scoped to the
signed-in person). The recap, the CSV and the counts read only what the
records hold. The assistant's availability check reads the existing usage
ledger and needs nothing new.

## 12. Program eligibility -- the one list to send (2026-10-05)

The hub's program workspace (Eligible Accounts / Qualifying Products /
Credited Results) and the Account page's Program Opportunities now read ONE
calculation, `tools/program_eligibility.py`, joined on CustomerID and
ProductID only. Every rule it uses is listed on the program's Details fold
as Verified, Assumed or Unverified. Built so far: Corona Innovation, Lytt
Buying Accounts, Carbliss 40% Buying Accounts (all October MPOs).

### What was verified, and how

| Program | Rule | Evidence |
|---|---|---|
| Corona Innovation | 11 qualifying products (Corona Sunbrew x4, Corona NA 4/6 btl + 2/12 btl, Modelo Chelada Suprema Mangonada + Tropical, Modelo Negra 2/12/12 oz can, Pacifico 1/24/7 oz, Vicky Mango) | Every product on the RDE export; ProductIDs matched by exact, unique catalogue name |
| Corona Innovation | Other packages of the same brands do NOT count (29 products, e.g. Modelo Negra 4/6 btl, Vicky Chamoy, Corona NA 2/12 can) | Sold off-premise in September, absent from the export |
| Corona Innovation | Off-premise, Core Market only | No innovation placement outside the six core areas; adding on-premise would exceed the export for 3 reps |
| Corona Innovation | Placement = account x product, repeat buyers count | September sales never exceed the export per rep and product; the export counts 699 vs 118 new since June |
| Corona Innovation | Phil Ernst: 54 of 69 (75% x 92) | Goals column 92; 54 = the sum of his 10 product rows (the first row is a subtotal) |
| Lytt | 6 products, 3+ different in October, core base minus Whole Foods, buyers outside the base not counted | RDE export (IDs), MPO generator, Gavin 2026-10-05 |
| Carbliss 40% | Core on-premise base, any Carbliss purchase Sep 1 - Oct 31 | RDE exports (IDs), MPO generator |

The answer to "do Modelo Chelada, Modelo Negra and Pacifico count toward
Corona Innovation?": YES for the specific packages above (the report
counts them) and NO for their other packages.

### Please confirm or send

| # | Ask | Why |
|---|---|---|
| C1 | The full "Innovation SKUs" list behind the Constellation report (ProductIDs) | A product nobody has placed yet cannot appear in the export, so the list may be incomplete -- the page says so |
| C2 | The same Constellation export with Customer Num and Product Num, one row per account x product | Today account-level credit comes from the monthly sales record (through September), which lags the export: Phil shows 42 by account, 12 more credited after |
| C3 | Rounding: 75% of a goal of 10 = 8 or 7? | Assumed up; affects reps whose goal is not a multiple of 4 |
| L1 | Rounding: 50% of 29 = 15 or 14? | Assumed up |
| L2 | Does a returned case remove a product from the 3-product count? | Assumed net of returns |
| K1 | Carbliss: does every package count, and 40% of 26 = 11 or 10? | Assumed any package, rounded up |
| B1 | Refresh hub/data/Sales_Reps_Customer_Base.xlsx (account list as of Sep 10) | The 25 accounts added on Oct 5 (e.g. USA Wine Traders Paramus, Phil's only Lytt buying account) are in the tracker but cannot open in My Accounts yet; the workspace lists them without a link |
| M1 | A license / segment flag per account (beer-only vs wine & spirits) | Needed before Molly's (2) New Placements and Wine (1) New Placement get eligible-account lists; without it a beer-only store would be listed as a target |
| S1 | Boston Beer's seasonal-conversion lists with Customer Num | They match accounts by outlet NAME today; the eligibility layer joins on IDs only, so Oktoberfest conversion is not in it yet |
| P1 | For each October incentive (Lagunitas Sprint, Industrial Arts, MABI Single Serve, Famosa, Four Loko, Cold Snap, Touchdowns & Tea): the qualifying ProductIDs, eligible account types, baseline window and minimums as the supplier states them | So each can be added to the same calculation with every rule verified, not inferred from the tracker's wording |

Answers go into `tools/program_eligibility.py` (one function per program);
rerun it (the MPO and Accounts generators also run it) and the hub, the
Account page and the Products list all follow.

## 13. Exact SKU lists per program -- the one list to send (2026-10-06)

The Eligible Accounts pages now show a "Qualifying Products" list for every
program. Only four programs have an exact list today; every other program
shows its whole brand family (every product we carry for that brand), with a
note saying the exact SKU list is not on file, while the program's "What
Counts" line names the narrower rule (e.g. Evil Genius: "Place Stacy's Mom,
Adulting or 867-5309" while the family has 32 products).

HAVE an exact list:
- Lagunitas Sprint to the Finish (the 13 products in its export)
- Corona Innovation MPO (the 11 products the RDE report counts -- built from
  the report's credited rows, so a qualifying product nobody has placed yet
  would be missing; a SKU list would confirm it)
- Lytt Buying Accounts MPO (every Lytt product; the report filters on the
  family) and Carbliss 40% MPO (every Carbliss product; whether every package
  counts is not stated)

NEED an exact list (one CSV per program is fine; columns Product Num and/or
Product Name, one row per qualifying SKU; a "does not count" list helps too):
- October incentives: Mark Anthony Single Serve, Push Famosa, Sam Adams
  Seasonal Draft Conversion, Lytt Launch, Other Half Launch, Le Grand Noir
  Volume, 2XO Bourbon, Industrial Arts Launch, Four Loko
- October MPOs: Corona Innovation (to confirm), Carbliss 40% (packages),
  Molly's (2) New Placements, Wine (1) New Placement, Spirits Follow-Up
- Every new program from November on, with the program sheet

WHERE IT GOES: save each as incentive-tracking/data/skus/<program key>.csv
(or MPOs/<on|off>-prem/skus/<objective key>.csv). The page will then list
exactly those products, drop the "not on file" note, and the Products list,
Program Opportunities and the assistant will use the same list.
