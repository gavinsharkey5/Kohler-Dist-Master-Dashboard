#!/usr/bin/env python3
"""ONE eligibility calculation per program (2026-10-05, Gavin's eligibility brief).

Answers the two questions a rep asks -- "what should I do at this account?" and
"which account helps me finish this program?" -- from the SAME numbers the
tracker scores, joined on CustomerID and ProductID only (never on names).

Four separate concepts, never mixed:
  QUALIFYING PRODUCT     a ProductID the program counts (with package + size)
  ELIGIBLE ACCOUNT       a CustomerID in the rep's universe for the program
                         (premise, account base, territory, exclusions)
  CREDITED RESULT        what the tracker already counts (account x product)
  REMAINING OPPORTUNITY  an eligible account x qualifying product (or, for an
                         account-count program, an eligible account) that is
                         not credited yet, with a reason the data supports

Writes
  shared/data/program-rules.json      rules + qualifying products, NO customer
                                      data (every page may read it); each rule
                                      carries status verified / assumed /
                                      unverified and the evidence
  accounts/data/elig/<rep key>.json   one file per rep: eligible accounts,
                                      credited results, opportunities. The
                                      middleware serves a rep ONLY their own
                                      file (ACCOUNT_DATA in middleware.js).

Programs so far (start with these two, then extend PROGRAMS below):
  off:2026-10:constellation_innovation   Constellation -- 75% Corona Innovation Distro
  off:2026-10:bbc_lytt                   BBC -- 50% Buying Accounts Lytt

Run after either MPO generator, a rolling-distribution month, or accounts/generate.py:
  python3 tools/program_eligibility.py          (--check: exit 1 if outputs are stale)
"""
import csv, json, math, sys, hashlib
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import program_skus   # the official SKU list per program, when Gavin has sent one (2026-10-06)

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "rolling-distribution" / "data" / "master"
OFF = ROOT / "MPOs" / "off-prem"
OUT_RULES = ROOT / "shared" / "data" / "program-rules.json"
OUT_DIR = ROOT / "accounts" / "data" / "elig"
CORE_AREAS = ["Bergen", "Passaic", "Passaic-FF", "Sussex", "Morris 1", "Morris 3"]

NICK = None
def name_key(n):
    """middleware.js nameKey(), nickname map READ from middleware.js (one source)."""
    global NICK
    if NICK is None:
        import re
        src = (ROOT / "middleware.js").read_text()
        m = re.search(r"const NICK = (\{.*?\});", src)
        NICK = json.loads(re.sub(r"(\w+):", r'"\1":', m.group(1)).replace("'", '"'))
    import re
    parts = re.sub(r"\s+", " ", re.sub(r"[^a-z\s]", " ", str(n or "").lower())).strip().split(" ")
    if not parts or not parts[0]:
        return ""
    first = NICK.get(parts[0], parts[0])
    last = "".join(parts[1:])
    return first + ("-" + last if last else "")


def num(v):
    try:
        return float(str(v).replace(",", "") or 0)
    except ValueError:
        return 0.0


# ---------------------------------------------------------------- shared inputs
def load_master():
    """products.csv, customers.csv and every month file: {(cust, prod): {month: cases}}."""
    products = {r["product_num"]: r for r in csv.DictReader(open(MASTER / "products.csv"))}
    customers = {r["customer_num"]: r for r in csv.DictReader(open(MASTER / "customers.csv"))}
    sources = json.load(open(MASTER / "sources.json"))
    months = sorted(sources)
    return products, customers, sources, months


def history_for(prod_ids, families, products, months):
    """Per account: {pid: last month bought (net > 0)} for the qualifying products,
    and {family: last month} for the brand families -- from the rolling master."""
    fam_of = {pid: products[pid]["family"] for pid in products}
    by_prod = defaultdict(dict)    # cust -> pid -> last month
    by_fam = defaultdict(dict)     # cust -> family -> last month
    monthly = defaultdict(lambda: defaultdict(set))   # month -> cust -> {pid}
    fams = set(families)
    for m in months:
        for r in csv.DictReader(open(MASTER / "months" / f"{m}.csv")):
            pid = r["product_num"]
            if num(r["cases"]) <= 0:
                continue
            f = fam_of.get(pid, "")
            c = r["customer_num"]
            if f in fams:
                by_fam[c][f] = m
            if pid in prod_ids:
                by_prod[c][pid] = m
                monthly[m][c].add(pid)
    return by_prod, by_fam, monthly


def book_for(key):
    """The rep's book exactly as My Accounts opens it (accounts/data/reps/<key>.json)."""
    p = ROOT / "accounts" / "data" / "reps" / f"{key}.json"
    if not p.exists():
        return {}
    return {str(a["n"]): a for a in json.load(open(p))["accounts"]}


def month_label(m):
    y, mo = m.split("-")
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][int(mo) - 1] + " " + y


def pkg_size(name, package):
    """'Corona Sunbrew 4/6/12 oz Btl' -> ('4/6/12 oz Btl', '12 oz', 'Bottle')"""
    import re
    m = re.search(r"(\d+/\d+/[\d.]+ ?oz(?: Loose)? ?(Btl|Can)?|[\d.]+ Gal Keg)", name, re.I)
    pk = m.group(0) if m else package
    s = re.search(r"([\d.]+) ?oz", pk or "", re.I)
    kind = "Can" if re.search(r"can", pk or "", re.I) else "Bottle" if re.search(r"btl|nr", pk or "", re.I) else "Keg" if "Keg" in (pk or "") else ""
    return pk, (s.group(1) + " oz") if s else "", kind


# ---------------------------------------------------------- Corona Innovation
def constellation(products, customers, sources, months, reps):
    """Constellation -- 75% Corona Innovation Distro (October off-prem MPO, 30%).

    Tracker (MPOs/off-prem/generate_2026-10.py): RDE "Constellation Innovation
    Fall 2026 OFF w Goals", placements by REP x PRODUCT NAME, 9/1-11/30, plus the
    rep's goal. The export has NO customer and NO product number, so:
      * qualifying products = the products that export counts, each resolved to
        its ProductID by an EXACT, unique catalogue name (checked below; the
        export should carry Product Num -- REPORTING_REQUEST 12);
      * credited results at account level = the rolling master (product x
        account x month, ProductID + CustomerID) for the window months loaded --
        verified to never exceed the export's per-rep, per-product count;
        the rest of the tracker's total (loads after the master's last month)
        is reported as "credited by the tracker, account not in the data yet".
    """
    rows = json.load(open(OFF / "data" / "2026-10" / "mpo_constellation_innovation.json"))
    goals = {g["SALES_REP_ASSIGNED"]: g["GOAL"] for g in json.load(open(OFF / "data" / "2026-10" / "mpo_constellation_innovation_goals.json"))}
    by_name = defaultdict(list)
    for pid, p in products.items():
        by_name[p["name"].strip().lower()].append(pid)
    names = sorted({r["PRODUCT_NAME"] for r in rows})
    prods, unresolved = [], []
    for nm in names:
        hits = by_name.get(nm.strip().lower(), [])
        if len(hits) == 1:
            prods.append(hits[0])
        else:
            unresolved.append(nm)
    if unresolved:
        raise SystemExit(f"Corona Innovation: product names not resolved to ONE ProductID: {unresolved}")
    off_list = program_skus.official("off:2026-10:constellation_innovation")
    if off_list is not None:
        if set(off_list) - set(prods) - set(products):
            raise SystemExit(f"Corona Innovation: official SKUs not in the catalogue: {sorted(set(off_list) - set(products))}")
        extra = set(prods) - set(off_list)
        if extra:
            raise SystemExit(f"Corona Innovation: the report counts products missing from the official SKU list: {sorted(extra)}")
        prods = prods + sorted(x for x in off_list if x not in prods)   # an official SKU nobody has placed yet still qualifies (order kept)
    pset = set(prods)
    fams = sorted({products[p]["family"] for p in prods})
    window = [m for m in months if "2026-09" <= m <= "2026-11"]
    detail_through = window[-1] if window else None
    # verified exclusions: same families, placed off-premise in a loaded window
    # month, but absent from the export -> the report does not count them
    by_prod, by_fam, monthly = history_for(pset | {pid for pid, p in products.items() if p["family"] in fams}, fams, products, months)
    sold_in_window = set()
    for m in window:
        for c, ps in monthly[m].items():
            if customers.get(c, {}).get("premise") == "Off":
                sold_in_window |= ps
    excluded = sorted(pid for pid in sold_in_window - pset if products[pid]["family"] in fams)
    # credited (account x product) in the loaded window months
    credited = defaultdict(set)   # cust -> {pid}
    for m in window:
        for c, ps in monthly[m].items():
            q = ps & pset
            if q and customers.get(c, {}).get("premise") == "Off":
                credited[c] |= q
    # check: per rep x product, master <= export (the export also has later loads)
    rde = defaultdict(float)
    for r in rows:
        rde[(r["SALES_REP_ASSIGNED"], r["PRODUCT_NAME"].strip().lower())] += r["CURRENT_PLACEMENTS"]
    over = []
    mrep = defaultdict(int)
    for c, ps in credited.items():
        rep = customers.get(c, {}).get("rep", "")
        for pid in ps:
            mrep[(rep, products[pid]["name"].strip().lower())] += 1
    for k, v in mrep.items():
        if k[0] in goals and v > rde.get(k, 0):
            over.append((k, v, rde.get(k, 0)))
    if over:
        raise SystemExit(f"Corona Innovation: master credits exceed the export for {over[:5]} -- the rule no longer matches")
    # tracker names (RDE spelling, "Anthony Palmisano") -> the index's rep (by name key)
    tracker = defaultdict(float)
    for r in rows:
        tracker[name_key(r["SALES_REP_ASSIGNED"])] += r["CURRENT_PLACEMENTS"]
    goals_k = {name_key(rep): g for rep, g in goals.items()}
    req = {k: max(1, math.ceil(g * 0.75 - 1e-9)) for k, g in goals_k.items() if g > 0}

    rule = {
        "id": "off:2026-10:constellation_innovation", "source": "off", "month": "2026-10", "key": "constellation_innovation",
        "title": "Corona Innovation", "official": "Constellation – 75% Corona Innovation Distro", "supplier": "Constellation Brands",
        "kind": "placements", "unit": "placement",
        "period": {"start": "2026-09-01", "end": "2026-11-30", "label": "Sep 1 – Nov 30, 2026"},
        "measure": "One placement = one qualifying product bought (net cases above zero) by one off-premise account during Sep 1 – Nov 30, 2026. An account can earn one placement per qualifying product.",
        "requirement": {"kind": "pct_of_assigned_goal", "pct": 0.75, "rounding": "up",
                        "text": "75% of your assigned Corona Innovation goal, rounded up"},
        "products": [prod_row(products[p]) for p in sorted(prods, key=lambda x: products[x]["name"])],
        "productsExhaustive": off_list is not None,
        "productsNote": "The official SKU list for this MPO (RDE, received Oct 6, 2026)." if off_list is not None else "These are the products the RDE report counts so far. A product nobody has placed yet would not appear in the report, so the list may be incomplete until the report's own SKU list is confirmed.",
        "excludedProducts": [dict(prod_row(products[p]), why="Sold off-premise in September but not on the program's SKU list" if off_list is not None else "Sold off-premise in September but not counted by the report") for p in excluded],
        "families": fams,
        "universe": {"premise": "Off", "territory": "Core Market", "areas": CORE_AREAS, "base": "Your assigned off-premise accounts"},
        "rules": [
            r_("Qualifying products", f"The {len(prods)} products the RDE “Innovation SKUs Placements” report counts (listed under Qualifying Products).", "verified",
               "Every product in the export; ProductIDs matched by exact catalogue name. The export carries names only."),
            r_("Non-qualifying products of the same brands", "Other Corona, Modelo, Pacifico and Victoria packages do not count (e.g. Modelo Negra 4/6/12 oz bottles, Vicky Chamoy, Corona NA 2/12 cans).", "verified",
               f"{len(excluded)} same-family products sold off-premise in September are absent from the export."),
            (r_("Official SKU list", f"The program's own SKU list (RDE, Oct 6, 2026) names the same {len(prods)} products.", "verified",
                "MPOs/off-prem/skus/2026-10_constellation_innovation.csv matches the report's products exactly.") if off_list is not None else
             r_("Products not yet placed by anyone", "Whether any other innovation product counts is unknown until the report's SKU list is confirmed.", "unverified", "A product with zero placements cannot appear in the export.")),
            r_("Eligible accounts", "Your off-premise accounts in the Core Market (Bergen, Passaic, Passaic-FF, Sussex, Morris 1, Morris 3).", "verified",
               "No innovation placements outside those areas; adding on-premise accounts would exceed the export for 3 reps. Brand Permissions file: Core Market for every family."),
            r_("Credit measure", "Placements: one account × one qualifying product, net cases above zero in the window.", "verified",
               "September placements from the sales master never exceed the export, per rep and per product."),
            r_("Repeat and prior purchases", "An account that already bought the product before September still counts when it buys again in the window.", "verified",
               "The export counts 699 placements; only 118 of September's 620 were new since June."),
            r_("Returns", "Net of returns (a month with net cases at or below zero is not a placement).", "assumed",
               "Fusion's placement flag is net-based (Rolling Distribution); not separately confirmed for this report."),
            r_("Original goal", "Your assigned goal from the report's Goals column (Sep 1 – Nov 30).", "verified", "mpo_constellation_innovation_goals.json"),
            r_("MPO requirement", "75% of the goal (October 2026 MPO).", "verified", "October_2026_MPO.docx"),
            r_("Rounding", "A fractional requirement is rounded UP (e.g. 75% × 10 = 7.5 → 8).", "assumed", "Not stated in the MPO document; affects reps whose goal is not a multiple of 4."),
            r_("Weight", "30% of the October Off-Premise MPO; credit is all-or-nothing.", "verified", "October_2026_MPO.docx"),
            r_("Reps without a goal", "Not scored for this objective.", "verified", "No Goals value on the report."),
            r_("Whole Foods", "Only the non-alcoholic products (Corona Non-Alcoholic) are offered as opportunities there.", "verified", "Whole Foods cannot sell alcohol (Gavin, 2026-10-05)."),
            r_("Evidence", "Sales data only. Photos and notes are not credit.", "verified", "MPO rule"),
        ],
        "detail": {"through": detail_through, "throughLabel": month_label(detail_through) if detail_through else "",
                   "trackerThrough": "export of Oct 5, 2026 (Sep 1 onward)",
                   "note": "Account-level results come from the monthly sales record, loaded through " + (month_label(detail_through) if detail_through else "—") +
                           ". The tracker's total also includes later loads that are not in the account detail yet."},
        "order": "Accounts that already buy a brand but not one of its qualifying products come first (the easiest adds; most such products first), then accounts that bought a qualifying product before but not in this window, then accounts new to the brands. Ties go to the account's 2026 case volume. With a product picked, the order is the same, for that product.",
        "openQuestions": ["C1", "C2", "C3"],
    }

    out = {}
    for rep, key in reps.items():
        book = book_for(key)
        accts, n_open = [], 0
        for n, a in book.items():
            if a.get("prem") != "Off":
                continue
            area = a.get("area") or ""
            who = {"name": a.get("name", ""), "city": a.get("city", ""), "area": area, "cases": a.get("cases2026")}
            if area not in CORE_AREAS:
                accts.append(dict(who, n=int(n), st="excluded", why=f"Corona Innovation is not sold in {area or 'this area'} (Core Market only)"))
                continue
            cr = sorted(credited.get(n, set()))
            ops = []
            no_alcohol = "whole foods" in (a.get("name") or "").lower()   # Gavin, 2026-10-05: they cannot sell alcohol
            for pid in prods:
                if pid in cr:
                    continue
                if no_alcohol and "non-alc" not in products[pid]["name"].lower():
                    continue
                f = products[pid]["family"]
                if by_prod.get(n, {}).get(pid):
                    rs = ["lapsed", f"Bought it before ({month_label(by_prod[n][pid])}), not in this window"]
                elif by_fam.get(n, {}).get(f):
                    rs = ["sku", f"Buys {f} ({month_label(by_fam[n][f])}), never this product"]
                else:
                    rs = ["brand", f"No {f} purchases since Jan 2025"]
                ops.append([pid] + rs)
            n_open += len(ops)
            rank = 0 if any(o[1] == "sku" for o in ops) else 1 if any(o[1] == "lapsed" for o in ops) else 2
            accts.append(dict(who, n=int(n), st="open" if ops else "done", cr=cr, op=ops, rank=rank))
        trk = tracker.get(key, 0)
        det = sum(len(x.get("cr", [])) for x in accts)
        prog = {"tracker": {"value": trk, "goal": goals_k.get(key), "requirement": req.get(key), "scored": key in req},
                "detailCredited": det, "afterDetail": max(0, trk - det), "accounts": accts, "openCount": n_open}
        out[rep] = prog
    return rule, out


# ---------------------------------------------------------------------- Lytt
def lytt(products, customers, sources, months, reps):
    """BBC -- 50% Buying Accounts Lytt (October off-prem MPO, 30%).

    Tracker: lytt_october.csv (RDE, rep x CustomerID x ProductID x load sheet, Aug 1 - Oct 31;
    Gavin 2026-10-07: August and September distribution counts) over the rep's core base minus
    Whole Foods (mpo_sales_reps_customer_base_core.json). An account counts once it has 3+
    DISTINCT Lytt products in the window; a product whose cases net to 0 or less (bought, then
    fully returned) does not count -- the same rule as the tracker (generate_2026-10.py).
    """
    base = json.load(open(OFF / "data" / "2026-10" / "mpo_sales_reps_customer_base_core.json"))
    raw = list(csv.DictReader(open(OFF / "lytt_october.csv", encoding="utf-8-sig")))
    pcol = next(c for c in raw[0] if c.startswith("Product Num"))
    ccol = next(c for c in raw[0] if c.startswith("Cases"))
    netc = defaultdict(float)
    for r in raw:
        netc[(r["Sales Rep Assigned"].strip(), r["Customer Num"].strip(), r[pcol].strip())] += float((r[ccol] or "0").replace(",", "") or 0)
    lytt_ids = sorted(pid for pid, p in products.items() if p["family"] == "Lytt")
    lytt_off = program_skus.official("off:2026-10:bbc_lytt")
    if lytt_off is not None and set(lytt_off) != set(lytt_ids):
        raise SystemExit(f"Lytt: official SKU list {sorted(lytt_off)} differs from the Lytt family {lytt_ids}")
    in_export = sorted({r[pcol].strip() for r in raw})
    unknown = [p for p in in_export if p not in products or products[p]["family"] != "Lytt"]
    if unknown:
        raise SystemExit(f"Lytt export carries products outside the Lytt family: {unknown}")
    base_by_rep = defaultdict(dict)     # keyed by name key (the tracker spells some reps differently)
    for r in base:
        base_by_rep[name_key(r["SALES_REP_ASSIGNED"])][str(r["CUSTOMER_NUM"])] = r
    oct_skus = defaultdict(lambda: defaultdict(set))    # rep key -> cust -> {pid}
    for r in raw:
        if netc[(r["Sales Rep Assigned"].strip(), r["Customer Num"].strip(), r[pcol].strip())] <= 0:
            continue
        oct_skus[name_key(r["Sales Rep Assigned"])][r["Customer Num"].strip()].add(r[pcol].strip())
    by_prod, by_fam, monthly = history_for(set(lytt_ids), ["Lytt"], products, months)
    dates = sorted(datetime.strptime(r["Date"], "%m/%d/%Y") for r in raw if r.get("Date"))
    last = dates[-1].strftime("%b %-d, %Y") if dates else ""
    rule = {
        "id": "off:2026-10:bbc_lytt", "source": "off", "month": "2026-10", "key": "bbc_lytt",
        "title": "Lytt Buying Accounts", "official": "BBC – 50% Buying Accounts Lytt", "supplier": "Boston Beer Company",
        "kind": "accounts", "unit": "buying account", "minSkus": 3,
        "period": {"start": "2026-08-01", "end": "2026-10-31", "label": "Aug 1 – Oct 31, 2026"},
        "measure": "A buying account = an account in your core base with 3 or more different Lytt products bought Aug 1 – Oct 31, 2026. It counts once, however many products or cases.",
        "requirement": {"kind": "pct_of_base", "pct": 0.5, "rounding": "up", "text": "50% of your core account base (Whole Foods removed), rounded up"},
        "products": [prod_row(products[p]) for p in lytt_ids],
        "productsExhaustive": True,
        "productsNote": ("The official SKU list for this MPO (RDE, received Oct 6, 2026): all six Lytt flavors, 1/24/6.8 oz bottles." if lytt_off is not None
                         else "Every Lytt product in the catalogue (all 1/24/6.8 oz bottles). The report filters on the Lytt brand family."),
        "excludedProducts": [],
        "families": ["Lytt"],
        "universe": {"premise": "Off", "territory": "Core Market", "areas": CORE_AREAS, "base": "Your core off-premise account base, Whole Foods removed"},
        "rules": [
            r_("Qualifying products", "Any Lytt product (6 flavors, 1/24/6.8 oz bottles).", "verified", "The export's Brand Family = Lytt; every catalogue Lytt product."),
            r_("Minimum", "3 or more different Lytt products at the account, Aug 1 – Oct 31.", "verified", "Gavin, 2026-10-05 (supersedes 1+ SKU); window Gavin, 2026-10-07."),
            r_("Eligible accounts", "Your accounts in the core off-premise base (RDE “Entire Core Market Off Prem Accts”, refreshed Oct 5, 2026), minus every Whole Foods.", "verified", "Whole Foods cannot sell alcohol (Gavin, 2026-10-05)."),
            r_("Buyers outside your base", "Not counted.", "verified", "MPO generator rule; the build prints any."),
            r_("Credit measure", "Distinct accounts, not products or cases.", "verified", "October_2026_MPO.docx: 50% buying accounts"),
            r_("Prior purchases", "August and September distribution counts; buying before Aug 1 does not.", "verified", "Gavin, 2026-10-07; the export window is Aug 1 – Oct 31."),
            r_("Returns", "A product bought and then fully returned (cases net to 0 or less) does not count.", "assumed", "Same net rule as the keg conversion; to confirm with Gavin."),
            r_("MPO requirement", "50% of the base.", "verified", "October_2026_MPO.docx"),
            r_("Rounding", "Rounded UP (29 accounts × 50% = 14.5 → 15).", "assumed", "Not stated in the MPO document."),
            r_("Weight", "30% of the October Off-Premise MPO; credit is all-or-nothing.", "verified", "October_2026_MPO.docx"),
            r_("Evidence", "Sales data only. Photos and notes are not credit.", "verified", "MPO rule"),
        ],
        "detail": {"through": "export", "throughLabel": last, "trackerThrough": "export through " + last,
                   "note": "Account-level results come straight from the tracker's own export (loads through " + last + "), so they always match the tracker."},
        "order": "Accounts already carrying 1–2 Lytt products since Aug 1 come first (fewest products needed), then accounts that bought Lytt before October, then accounts new to Lytt. Ties go to the account's 2026 case volume.",
        "openQuestions": ["L1", "L2"],
    }
    out = {}
    for rep, key in reps.items():
        b = base_by_rep.get(key)
        if not b:
            continue
        accts, qual = [], 0
        for n, row in b.items():
            have = sorted(oct_skus[key].get(n, set()))
            if len(have) >= 3:
                qual += 1
                accts.append({"n": int(n), "st": "done", "cr": have})
                continue
            need = 3 - len(have)
            if have:
                rs = ["partial", f"Bought {len(have)} Lytt product{'s' if len(have) > 1 else ''} since Aug 1 — {need} more needed"]
                rank = 0
            elif by_fam.get(n, {}).get("Lytt"):
                rs = ["lapsed", f"Bought Lytt before ({month_label(by_fam[n]['Lytt'])}), none since Aug 1"]
                rank = 1
            else:
                rs = ["brand", "No Lytt purchases since Jan 2025"]
                rank = 2
            tried = sorted(by_prod.get(n, {}))
            accts.append({"n": int(n), "st": "open", "cr": have, "need": need, "why": rs, "rank": rank,
                          "before": tried, "name": row["CUSTOMER_NAME"], "city": row.get("CITY", ""), "area": row.get("AREA", ""),
                          "cases": row.get("CASES")})
        for a in accts:
            if a["st"] == "done":
                row = b[str(a["n"])]
                a.update(name=row["CUSTOMER_NAME"], city=row.get("CITY", ""), area=row.get("AREA", ""), cases=row.get("CASES"))
        reqd = max(1, math.ceil(len(b) * 0.5 - 1e-9))
        outside = sorted(set(oct_skus[key]) - set(b))
        out[rep] = {"tracker": {"value": qual, "requirement": reqd, "base": len(b), "scored": True},
                    "detailCredited": qual, "afterDetail": 0, "accounts": accts,
                    "openCount": sum(1 for a in accts if a["st"] == "open"), "outsideBase": [int(x) for x in outside]}
    return rule, out


# ------------------------------------------------------------- Carbliss On-Prem
def carbliss_on(products, customers, sources, months, reps):
    """Carbliss -- 40% Buying Accounts (October on-prem MPO, 25%).

    The SAME program as the Carbliss Leaderboard (2026-10-07): base = the rep's
    accounts in RDE "Entire Core Market On Prem Accts" (core_market_on_prem_accts.csv,
    house reps dropped); DONE = the account bought Carbliss on a load sheet Aug 1 -
    Oct 31 per carbliss-mpo/data/program.json (RDE "Carbliss Buyers (ON)" export,
    carbliss-onprem-targets/carbliss_buyers_l90.csv). Both by CustomerID; the
    tracker JSON (MPOs/on-prem/generate_2026-10.py) copies program.json per account.
    """
    rows = json.load(open(ROOT / "MPOs" / "on-prem" / "data" / "2026-10" / "mpo_carbliss.json"))
    raw = list(csv.DictReader(open(ROOT / "carbliss-onprem-targets" / "carbliss_buyers_l90.csv", encoding="utf-8-sig")))
    fam_ids = sorted(pid for pid, p in products.items() if p["family"] == "Carbliss")
    by_prod, by_fam, monthly = history_for(set(fam_ids), ["Carbliss"], products, months)
    dates = sorted(datetime.strptime(r["Load Sheet Date"], "%m/%d/%Y") for r in raw if r.get("Load Sheet Date"))
    last = dates[-1].strftime("%b %-d, %Y") if dates else ""
    # what each base account bought in the window, from the sales record (detail only)
    win = [m for m in months if "2026-08" <= m <= "2026-10"]
    rule = {
        "id": "on:2026-10:carbliss", "source": "on", "month": "2026-10", "key": "carbliss",
        "title": "Carbliss Buying Accounts", "official": "Carbliss – 40% Buying Accounts", "supplier": "Carbliss",
        "kind": "accounts", "unit": "buying account", "minSkus": 1,
        "period": {"start": "2026-08-01", "end": "2026-10-31", "label": "Aug 1 – Oct 31, 2026"},
        "measure": "A buying account = an account in your core on-premise base that bought any Carbliss product between Aug 1 and Oct 31, 2026 (the Carbliss Leaderboard's L90). It counts once.",
        "requirement": {"kind": "pct_of_base", "pct": 0.4, "rounding": "up", "text": "40% of your core on-premise account base, rounded up"},
        "products": [prod_row(products[p]) for p in fam_ids],
        "productsExhaustive": False,
        "productsNote": "Every Carbliss product in the sales record. The report counts a buyer of the Carbliss brand family; whether every package counts is not stated.",
        "excludedProducts": [],
        "families": ["Carbliss"],
        "universe": {"premise": "On", "territory": "Core on-premise base", "areas": [], "base": "Your accounts in the Core Market on-premise base"},
        "rules": [
            r_("Qualifying products", "Any Carbliss product (the report filters on the Carbliss brand family).", "assumed", "Brand Family = Carbliss on every export row; packages are not listed."),
            r_("Minimum", "One purchase of any Carbliss product.", "verified", "Buyers flag on the RDE export."),
            r_("Same as the leaderboard", "Counts the Carbliss Leaderboard's L90 buyers exactly.", "verified", "carbliss-mpo/data/program.json"),
            r_("Eligible accounts", "Your accounts in RDE “Entire Core Market On Prem Accts” (house accounts removed).", "verified", "MPOs/on-prem/core_market_on_prem_accts.csv"),
            r_("Buyers outside your base", "Not counted.", "verified", "MPO generator rule."),
            r_("Prior purchases", "August and September purchases count; buying before Aug 1 does not.", "verified", "Program period Aug 1 – Oct 31 (carbliss-mpo/generate.py)."),
            r_("MPO requirement", "40% of the base.", "verified", "OCTOBER_ON_PREM_2026_MPO.docx"),
            r_("Rounding", "Rounded UP.", "assumed", "Not stated in the MPO document."),
            r_("Weight", "25% of the October On-Premise MPO; credit is all-or-nothing.", "verified", "OCTOBER_ON_PREM_2026_MPO.docx"),
            r_("Evidence", "Sales data only. Photos and notes are not credit.", "verified", "MPO rule"),
        ],
        "detail": {"through": "export", "throughLabel": last, "trackerThrough": "export through " + last,
                   "note": "Account-level results come straight from the tracker's own export (loads through " + last + "), so they always match the tracker."},
        "order": "Accounts that bought Carbliss before August come first (they know the brand), then accounts new to Carbliss. Ties go to the account's 2026 case volume.",
        "openQuestions": ["K1"],
    }
    by_rep = defaultdict(list)
    for r in rows:
        by_rep[name_key(r["SALES_REP_ASSIGNED"])].append(r)
    out = {}
    for rep, key in reps.items():
        b = by_rep.get(key)
        if not b:
            continue
        book = book_for(key)
        accts = []
        for r in b:
            n = str(r["CUSTOMER_NUM"])
            bk = book.get(n, {})
            who = {"n": int(n) if n.isdigit() else n, "name": r["CUSTOMER_NAME"], "city": r.get("BASE_DETAIL") or bk.get("city", ""),
                   "area": bk.get("area", ""), "cases": bk.get("cases2026")}
            seen = sorted({pid for m in win for pid in monthly[m].get(n, set())})
            if r["DONE"]:
                accts.append(dict(who, st="done", cr=seen))
                continue
            if by_fam.get(n, {}).get("Carbliss"):
                why, rank = ["lapsed", f"Bought Carbliss before ({month_label(by_fam[n]['Carbliss'])}), not since Aug 1"], 0
            else:
                why, rank = ["brand", "No Carbliss purchases since Jan 2025"], 1
            accts.append(dict(who, st="open", cr=[], need=1, why=why, rank=rank, before=sorted(by_prod.get(n, {}))))
        qual = sum(1 for a in accts if a["st"] == "done")
        out[rep] = {"tracker": {"value": qual, "requirement": max(1, math.ceil(len(b) * 0.4 - 1e-9)), "base": len(b), "scored": True},
                    "detailCredited": qual, "afterDetail": 0, "accounts": accts, "openCount": len(accts) - qual}
    return rule, out


def prod_row(p):
    pk, size, kind = pkg_size(p["name"], p.get("package", ""))
    return {"id": p["product_num"], "name": p["name"], "family": p["family"], "package": pk, "size": size, "container": kind}


def r_(k, v, status, evidence):
    return {"k": k, "v": v, "status": status, "evidence": evidence}


QUESTIONS = {
    "C1": "Corona Innovation: please send the RDE report's full list of “Innovation SKUs” (ProductIDs). The export shows only products someone has placed, so a qualifying product nobody has sold yet cannot be listed.",
    "C2": "Corona Innovation: add Customer Num and Product Num to the “Constellation Innovation Fall 2026 OFF w Goals” export (one row per account × product). Today account-level credit comes from the monthly sales record, which lags the export.",
    "C3": "Corona Innovation: confirm rounding — is 75% of a goal of 10 (7.5) a requirement of 8 or 7?",
    "L1": "Lytt: confirm rounding — is 50% of a 29-account base (14.5) a requirement of 15 or 14?",
    "L2": "Lytt: confirm that a returned case removes a product from the 3-product count (net of returns).",
    "K1": "Carbliss 40%: confirm every Carbliss package counts as a buying-account purchase, and the rounding (40% of 26 = 10.4 → 11 or 10?).",
}


def main():
    check = "--check" in sys.argv
    products, customers, sources, months = load_master()
    idx = json.load(open(ROOT / "accounts" / "data" / "index.json"))
    reps = {r["rep"]: r["key"] for r in idx["reps"]}
    rules, per_rep = [], defaultdict(dict)
    for fn in (constellation, lytt, carbliss_on):
        rule, out = fn(products, customers, sources, months, reps)
        rules.append(rule)
        for rep, prog in out.items():
            per_rep[rep][rule["id"]] = prog
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rules_doc = {"note": "Program eligibility rules (tools/program_eligibility.py). No customer data. status: verified = checked against the data or the program document; assumed = our reading, awaiting confirmation; unverified = unknown.",
                 "salesThrough": months[-1], "programs": rules, "questions": QUESTIONS}
    files = {OUT_RULES: rules_doc}
    for rep, progs in per_rep.items():
        key = reps.get(rep) or name_key(rep)
        files[OUT_DIR / f"{key}.json"] = {"rep": rep, "key": key, "programs": progs}
    stale = []
    for path, doc in files.items():
        text = json.dumps(doc, separators=(",", ":"), sort_keys=True)
        if check:
            old = path.read_text() if path.exists() else ""
            body = old.split("\n", 1)[1] if old.startswith("//") else old
            if body.strip() != text:
                stale.append(str(path.relative_to(ROOT)))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    if check:
        if stale:
            print("stale:", *stale[:10], sep="\n  ")
            sys.exit(1)
        print("program eligibility files are current")
        return
    for f in OUT_DIR.glob("*.json"):
        if f not in files:
            f.unlink()
    for rule in rules:
        n = sum(1 for p in per_rep.values() if rule["id"] in p)
        print(f"{rule['title']}: {len(rule['products'])} qualifying products, {len(rule.get('excludedProducts', []))} verified exclusions, {n} reps")
    print(f"wrote {OUT_RULES.relative_to(ROOT)} and {len(per_rep)} files in {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
