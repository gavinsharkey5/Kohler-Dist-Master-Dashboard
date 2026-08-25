#!/usr/bin/env python3
"""Builds the Sales Rep Dashboard data from the two YTD exports + customer base.

Run: python3 generate.py

Reads (all in this folder):
  brand_ytd.csv        Supplier / Brand Family / Sales Rep -- MTD & YTD, CY vs PY
  account_ytd.csv      Customer / Sales Rep / Brand Family -- MTD & YTD, CY vs PY
  customer_base.csv    the rep's full book: address, area, county, premise, draft/pkg
  commission_rates.csv $/case model (see the header comments in that file)

Writes:
  data/index.json          roster + every rep's headline KPIs (small, loads first)
  data/reps/<slug>.json    one file per rep: brands, accounts, opportunities
  data/sync_meta.json      synced_at, for the "Data refreshed" pill

This dashboard is deliberately incentive-free: it is the rep's core book of
business (commission-generating sales), not MPO/program tracking.
"""
import csv
import datetime
import io
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"
REPS_DIR = DATA / "reps"

# Per Gavin (see incentive-tracking/generate.py, same rule): these names carry
# rows in the exports but are not sales reps -- "Default" is the unassigned
# bucket, the others are house/tell-sell/chain buckets. They are excluded so a
# rep dashboard only ever shows real reps' books.
NON_REPS = {"Default", "Office Tell Sell", "John Neukum", "Chris Politano", ""}

DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")

# Current year, read off the export's own column headers in build().
CY = None
# brand_ytd.csv rows, kept for the reconciliation figure main() prints.
brand_rows_all = []


# ---------------------------------------------------------------- helpers
def to_num(s):
    """'1,234' -> 1234.0 ; ' (1,234)' -> -1234.0 ; '' -> 0.0"""
    s = (s or "").strip().replace(",", "").replace("$", "")
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    if s in ("", "-"):
        return 0.0
    try:
        v = float(s)
    except ValueError:
        return 0.0
    return -v if neg else v


def slug(name):
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")


def period_cols(fieldnames, prefix):
    """The two dated columns for 'MTD' / 'YTD', returned (prior_year, current_year)
    along with the (start, end) dates of the current-year window."""
    dated = []
    for c in fieldnames:
        if not c.startswith(prefix):
            continue
        ms = DATE_RE.findall(c)
        if len(ms) == 2:
            start = datetime.date(int(ms[0][2]), int(ms[0][0]), int(ms[0][1]))
            end = datetime.date(int(ms[1][2]), int(ms[1][0]), int(ms[1][1]))
            dated.append((start, end, c))
    dated.sort()
    if len(dated) != 2:
        raise ValueError("expected 2 dated %r columns, found %r" % (prefix, dated))
    return dated[0][2], dated[1][2], dated[0], dated[1]


def pct(cur, prior):
    """YoY %. None when there is no prior-year base to compare against."""
    if not prior:
        return None
    return (cur - prior) / prior * 100.0


def r2(x):
    return round(x + 0.0, 2)


# ---------------------------------------------------------------- rates
def load_rates():
    default = 1.00
    by_sup, by_brand = {}, {}
    with io.open(HERE / "commission_rates.csv", encoding="utf-8-sig") as fh:
        lines = [l for l in fh if not l.lstrip().startswith("#")]
    for row in csv.DictReader(lines):
        scope = (row.get("scope") or "").strip().upper()
        key = (row.get("key") or "").strip()
        try:
            rate = float((row.get("rate_per_case") or "").strip())
        except ValueError:
            continue
        if scope == "DEFAULT":
            default = rate
        elif scope == "SUPPLIER":
            by_sup[key] = rate
        elif scope == "BRAND":
            by_brand[key] = rate
    return default, by_sup, by_brand


DEFAULT_RATE, RATE_SUP, RATE_BRAND = load_rates()


def rate_for(brand, supplier):
    if brand in RATE_BRAND:
        return RATE_BRAND[brand]
    if supplier in RATE_SUP:
        return RATE_SUP[supplier]
    return DEFAULT_RATE


# ---------------------------------------------------------------- load
def load_brand_rows():
    with io.open(HERE / "brand_ytd.csv", encoding="utf-8-sig") as fh:
        rd = csv.DictReader(fh)
        m_py, m_cy, m_pw, m_cw = period_cols(rd.fieldnames, "MTD")
        y_py, y_cy, y_pw, y_cw = period_cols(rd.fieldnames, "YTD")
        rows = []
        for r in rd:
            if r["Supplier"] == "Total" or r["Sales Rep Assigned"] in NON_REPS:
                continue
            rows.append({
                "rep": r["Sales Rep Assigned"],
                "supplier": r["Supplier"],
                "brand": r["Brand Family"],
                "m_py": to_num(r[m_py]), "m_cy": to_num(r[m_cy]),
                "y_py": to_num(r[y_py]), "y_cy": to_num(r[y_cy]),
            })
    return rows, {"mtd": (m_pw, m_cw), "ytd": (y_pw, y_cw)}


def load_account_rows():
    with io.open(HERE / "account_ytd.csv", encoding="utf-8-sig") as fh:
        rd = csv.DictReader(fh)
        m_py, m_cy, _, _ = period_cols(rd.fieldnames, "MTD")
        y_py, y_cy, _, _ = period_cols(rd.fieldnames, "YTD")
        rows = []
        for r in rd:
            if r["Customer Num"] == "Total" or r["Sales Rep Assigned"] in NON_REPS:
                continue
            rows.append({
                "rep": r["Sales Rep Assigned"],
                "num": r["Customer Num"].strip(),
                "name": r["Customer Name"].strip(),
                "brand": r["Brand Family"].strip(),
                "m_py": to_num(r[m_py]), "m_cy": to_num(r[m_cy]),
                "y_py": to_num(r[y_py]), "y_cy": to_num(r[y_cy]),
            })
    return rows


def load_customer_base():
    """Customer Num -> book-of-business attributes (territory, channel, address)."""
    base = {}
    with io.open(HERE / "customer_base.csv", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            if r["Sales Rep Assigned"] in NON_REPS:
                continue
            base[r["Customer Num"].strip()] = {
                "rep": r["Sales Rep Assigned"],
                "name": r["Customer Name"].strip(),
                "addr": (r.get("Shipping Address") or "").strip(),
                "area": (r.get("Distribution Area") or "").strip(),
                "county": (r.get("County") or "").strip(),
                "city": (r.get("City") or "").strip(),
                "premise": (r.get("Premise") or "").strip(),
                "draft": (r.get("Draft Package") or "").strip(),
            }
    return base


# ---------------------------------------------------------------- aggregate
def fmt_cases(v):
    return "{:,.0f}".format(v)


def fmt_money(v):
    return "${:,.0f}".format(v)


def build():
    global CY, brand_rows_all
    brand_rows, windows = load_brand_rows()
    acct_rows = load_account_rows()
    base = load_customer_base()

    (m_start, m_end, _), (y_start, y_end, _) = (
        (windows["mtd"][1][0], windows["mtd"][1][1], None),
        (windows["ytd"][1][0], windows["ytd"][1][1], None),
    )
    CY = y_end.year
    brand_rows_all = brand_rows
    mtd_days = (m_end - m_start).days + 1
    ytd_days = (y_end - y_start).days + 1
    prior_seg_days = max(ytd_days - mtd_days, 1)

    # Brand Family -> Supplier. The account export has no Supplier column, so
    # the mapping is taken from the brand export; a brand family that somehow
    # spans suppliers keeps whichever one carries more volume.
    sup_vol = defaultdict(lambda: defaultdict(float))
    for r in brand_rows:
        sup_vol[r["brand"]][r["supplier"]] += r["y_cy"] + r["y_py"]
    BRAND_SUP = {b: max(s.items(), key=lambda kv: kv[1])[0] for b, s in sup_vol.items()}

    # ---- company-wide brand penetration, computed SEPARATELY for on- and
    # off-premise. A brand's reach differs enormously between the two channels,
    # so one blended rate would flag phantom whitespace for a rep whose book
    # leans the other way. Expected placements for a rep are then the channel
    # rates weighted by that rep's own channel mix.
    chan_accounts = defaultdict(set)                        # channel -> accounts
    brand_buyers = defaultdict(lambda: defaultdict(set))    # brand -> channel -> buyers
    for r in acct_rows:
        c = base.get(r["num"], {}).get("premise", "") or "Unknown"
        chan_accounts[c].add(r["num"])
        if r["y_cy"] > 0:
            brand_buyers[r["brand"]][c].add(r["num"])
    co_penetration = {
        b: {c: len(v) / max(len(chan_accounts[c]), 1) for c, v in chans.items()}
        for b, chans in brand_buyers.items()}

    # What a TYPICAL door does with a brand -- the company-wide median CY volume
    # among accounts that buy it, per channel. Valuing a gap at the rep's own
    # mean would price every new placement like their biggest existing one, which
    # is how a whitespace number ends up larger than the rep's whole book. The
    # median of everyone's accounts is what a newly opened door actually looks
    # like.
    vols = defaultdict(lambda: defaultdict(list))
    acct_brand_cy = defaultdict(float)
    for r in acct_rows:
        if r["y_cy"] > 0:
            acct_brand_cy[(r["brand"], r["num"])] += r["y_cy"]
    for (bn, num), v in acct_brand_cy.items():
        vols[bn][base.get(num, {}).get("premise", "") or "Unknown"].append(v)

    def median(xs):
        xs = sorted(xs)
        n = len(xs)
        if not n:
            return 0.0
        return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2.0

    co_typical = {b: {c: median(v) for c, v in chans.items()} for b, chans in vols.items()}

    # Account SIZE is the other confound, and the bigger one. A rep whose doors
    # average 300 cases a year would show enormous "whitespace" against medians
    # drawn from a company whose average door does 1,700 -- the brand really is
    # missing, but a placement in one of THEIR accounts will not do what a
    # placement in an average account does. So every typical-door figure is
    # scaled by the rep's own account size relative to the company's, per
    # channel, clamped so a handful of outlier doors can't distort it.
    chan_total_cy = defaultdict(float)
    for r in acct_rows:
        chan_total_cy[base.get(r["num"], {}).get("premise", "") or "Unknown"] += r["y_cy"]
    co_avg_acct = {c: (chan_total_cy[c] / max(len(v), 1)) for c, v in chan_accounts.items()}

    # ---- roll up per rep
    reps = sorted({r["rep"] for r in brand_rows} | {r["rep"] for r in acct_rows})

    rep_brand = defaultdict(lambda: defaultdict(lambda: dict(
        m_py=0.0, m_cy=0.0, y_py=0.0, y_cy=0.0)))
    for r in brand_rows:
        d = rep_brand[r["rep"]][r["brand"]]
        for k in ("m_py", "m_cy", "y_py", "y_cy"):
            d[k] += r[k]

    rep_acct = defaultdict(lambda: defaultdict(lambda: dict(
        m_py=0.0, m_cy=0.0, y_py=0.0, y_cy=0.0, name="", brands={})))
    for r in acct_rows:
        a = rep_acct[r["rep"]][r["num"]]
        a["name"] = a["name"] or r["name"]
        for k in ("m_py", "m_cy", "y_py", "y_cy"):
            a[k] += r[k]
        b = a["brands"].setdefault(r["brand"], dict(m_py=0.0, m_cy=0.0, y_py=0.0, y_cy=0.0))
        for k in ("m_py", "m_cy", "y_py", "y_cy"):
            b[k] += r[k]

    # accounts on the rep's book that never appear in the sales export at all
    for num, meta in base.items():
        if meta["rep"] in NON_REPS:
            continue
        if num not in rep_acct[meta["rep"]]:
            rep_acct[meta["rep"]][num] = dict(
                m_py=0.0, m_cy=0.0, y_py=0.0, y_cy=0.0, name=meta["name"], brands={})

    index, rep_files = [], {}
    for rep in reps:
        payload, headline = build_rep(
            rep, rep_brand[rep], rep_acct[rep], base, BRAND_SUP,
            co_penetration, co_typical, co_avg_acct, mtd_days, prior_seg_days)
        rep_files[slug(rep)] = payload
        index.append(headline)

    index.sort(key=lambda x: -x["comm_ytd_cy"])
    for i, h in enumerate(index, 1):
        h["rank"] = i
    return index, rep_files, (m_start, m_end, y_start, y_end)


def build_rep(rep, brands_raw, accts_raw, base, BRAND_SUP, co_pen, co_typ,
              co_avg_acct, mtd_days, prior_seg_days):
    """brands_raw (from brand_ytd.csv) is carried only for the reconciliation
    figure; every number on the page is rolled up from accts_raw."""
    # the rep's own channel mix over accounts with CY volume -- the weights
    # behind every expected-placement figure below.
    chan_mix = defaultdict(int)
    for num, a in accts_raw.items():
        if a["y_cy"] > 0:
            chan_mix[base.get(num, {}).get("premise", "") or "Unknown"] += 1
    n_active = sum(chan_mix.values())

    # Size index: how big this rep's doors are next to the company's, per
    # channel. 1.0 = an average-sized book; 0.2 = doors a fifth the usual size.
    chan_cases = defaultdict(float)
    for num, a in accts_raw.items():
        if a["y_cy"] > 0:
            chan_cases[base.get(num, {}).get("premise", "") or "Unknown"] += a["y_cy"]
    size_ix = {}
    for c, n in chan_mix.items():
        co = co_avg_acct.get(c, 0)
        mine = chan_cases[c] / n if n else 0
        size_ix[c] = min(max(mine / co, 0.15), 3.0) if co else 1.0

    # ---------------- brand level
    # Aggregated from the account x brand rows -- the same grain the dashboard
    # renders from -- so a rep's headline KPI and their on-page totals can never
    # disagree. brand_ytd.csv is used only for the Brand Family -> Supplier
    # mapping and as the reconciliation check printed by main().
    from_accts = defaultdict(lambda: dict(m_py=0.0, m_cy=0.0, y_py=0.0, y_cy=0.0))
    for a in accts_raw.values():
        for bn, bd in a["brands"].items():
            t = from_accts[bn]
            for k in ("m_py", "m_cy", "y_py", "y_cy"):
                t[k] += bd[k]

    brands = []
    for name, d in from_accts.items():
        sup = BRAND_SUP.get(name, "")
        rate = rate_for(name, sup)
        accts_cy = sum(1 for a in accts_raw.values()
                       if a["brands"].get(name, {}).get("y_cy", 0) > 0)
        accts_py = sum(1 for a in accts_raw.values()
                       if a["brands"].get(name, {}).get("y_py", 0) > 0)
        brands.append({
            "brand": name, "supplier": sup, "rate": rate,
            "s_ytd": r2(d["y_cy"]), "s_ytd_py": r2(d["y_py"]),
            "s_mtd": r2(d["m_cy"]), "s_mtd_py": r2(d["m_py"]),
            "c_ytd": r2(d["y_cy"] * rate), "c_ytd_py": r2(d["y_py"] * rate),
            "c_mtd": r2(d["m_cy"] * rate), "c_mtd_py": r2(d["m_py"] * rate),
            "yoy_ytd": pct(d["y_cy"], d["y_py"]),
            "yoy_mtd": pct(d["m_cy"], d["m_py"]),
            "accts": accts_cy, "accts_py": accts_py,
        })

    tot_s_ytd = sum(b["s_ytd"] for b in brands)
    tot_s_ytd_py = sum(b["s_ytd_py"] for b in brands)
    tot_s_mtd = sum(b["s_mtd"] for b in brands)
    tot_s_mtd_py = sum(b["s_mtd_py"] for b in brands)
    tot_c_ytd = sum(b["c_ytd"] for b in brands)
    tot_c_ytd_py = sum(b["c_ytd_py"] for b in brands)
    tot_c_mtd = sum(b["c_mtd"] for b in brands)
    tot_c_mtd_py = sum(b["c_mtd_py"] for b in brands)

    brands.sort(key=lambda b: -b["c_ytd"])
    for i, b in enumerate(brands, 1):
        b["rank"] = i
        b["sh_comm"] = r2(b["c_ytd"] / tot_c_ytd * 100) if tot_c_ytd else 0
        b["sh_sales"] = r2(b["s_ytd"] / tot_s_ytd * 100) if tot_s_ytd else 0
        b["avg_acct"] = r2(b["s_ytd"] / b["accts"]) if b["accts"] else 0
        b["d_ytd"] = r2(b["s_ytd"] - b["s_ytd_py"])
        b["dc_ytd"] = r2(b["c_ytd"] - b["c_ytd_py"])
        # Expected placements = the company's penetration of this brand in each
        # channel, applied to how many active accounts THIS rep has in that
        # channel. The gap against b["accts"] is the whitespace.
        cp = co_pen.get(b["brand"], {})
        b["exp_accts"] = r2(sum(cp.get(c, 0) * n for c, n in chan_mix.items()))
        b["pen"] = r2(b["exp_accts"] / n_active * 100) if n_active else 0
        # What one more door of this brand is realistically worth in this book.
        ct = co_typ.get(b["brand"], {})
        b["typ_door"] = r2(sum(ct.get(c, 0) * size_ix.get(c, 1.0) * n
                               for c, n in chan_mix.items()) / n_active) if n_active else 0
        b["trend"] = ("up" if (b["yoy_ytd"] or 0) >= 3 else
                      "down" if (b["yoy_ytd"] or 0) <= -3 else "flat")

    # ---------------- account level
    accounts = []
    for num, a in accts_raw.items():
        meta = base.get(num, {})
        comm_ytd = comm_ytd_py = comm_mtd = 0.0
        ab = []
        for bn, bd in a["brands"].items():
            rate = rate_for(bn, BRAND_SUP.get(bn, ""))
            comm_ytd += bd["y_cy"] * rate
            comm_ytd_py += bd["y_py"] * rate
            comm_mtd += bd["m_cy"] * rate
            # All four period values ride along on every account-brand row: the
            # dashboard recomputes brand rollups from these whenever a channel,
            # territory or period filter is on, so filtered figures stay true
            # instead of being scaled off an unfiltered total.
            if bd["y_cy"] or bd["y_py"] or bd["m_cy"] or bd["m_py"]:
                ab.append({
                    "brand": bn, "rate": rate,
                    "s_ytd": r2(bd["y_cy"]), "s_ytd_py": r2(bd["y_py"]),
                    "s_mtd": r2(bd["m_cy"]), "s_mtd_py": r2(bd["m_py"]),
                    "c_ytd": r2(bd["y_cy"] * rate),
                    "yoy": pct(bd["y_cy"], bd["y_py"]),
                })
        ab.sort(key=lambda x: -x["c_ytd"])

        # Neither export carries an order DATE, so "last activity" is derived
        # from which windows the account has volume in -- see README.txt.
        if a["m_cy"] > 0:
            status = "mtd"           # ordered this month
        elif a["y_cy"] > 0:
            status = "ytd"           # ordered this year, nothing this month
        elif a["y_py"] > 0:
            status = "lapsed"        # bought last year, nothing at all this year
        else:
            status = "none"          # on the book, no volume either year

        accounts.append({
            "num": num, "name": a["name"] or meta.get("name", num),
            "premise": meta.get("premise", ""), "area": meta.get("area", ""),
            "county": meta.get("county", ""), "city": meta.get("city", ""),
            "addr": meta.get("addr", ""), "draft": meta.get("draft", ""),
            "on_book": num in base,
            "s_ytd": r2(a["y_cy"]), "s_ytd_py": r2(a["y_py"]),
            "s_mtd": r2(a["m_cy"]), "s_mtd_py": r2(a["m_py"]),
            "c_ytd": r2(comm_ytd), "c_ytd_py": r2(comm_ytd_py), "c_mtd": r2(comm_mtd),
            "yoy_ytd": pct(a["y_cy"], a["y_py"]),
            "yoy_mtd": pct(a["m_cy"], a["m_py"]),
            "d_ytd": r2(a["y_cy"] - a["y_py"]),
            "dc_ytd": r2(comm_ytd - comm_ytd_py),
            "nbrands": sum(1 for x in ab if x["s_ytd"] > 0),
            "status": status,
            "brands": ab,
        })

    accounts.sort(key=lambda x: -x["c_ytd"])
    for i, a in enumerate(accounts, 1):
        a["rank"] = i
        a["sh_comm"] = r2(a["c_ytd"] / tot_c_ytd * 100) if tot_c_ytd else 0

    active_accts = [a for a in accounts if a["s_ytd"] > 0]
    active_brands = [b for b in brands if b["s_ytd"] > 0]

    # month pace vs. the rest of the year -- the only honest "vs prior period"
    # read available, since the exports ship MTD and YTD windows only.
    daily_now = tot_s_mtd / mtd_days if mtd_days else 0
    daily_prior = (tot_s_ytd - tot_s_mtd) / prior_seg_days if prior_seg_days else 0
    pace = ((daily_now / daily_prior - 1) * 100) if daily_prior else None

    kpi = {
        "s_ytd": r2(tot_s_ytd), "s_ytd_py": r2(tot_s_ytd_py),
        "s_mtd": r2(tot_s_mtd), "s_mtd_py": r2(tot_s_mtd_py),
        "c_ytd": r2(tot_c_ytd), "c_ytd_py": r2(tot_c_ytd_py),
        "c_mtd": r2(tot_c_mtd), "c_mtd_py": r2(tot_c_mtd_py),
        "yoy_s_ytd": pct(tot_s_ytd, tot_s_ytd_py),
        "yoy_s_mtd": pct(tot_s_mtd, tot_s_mtd_py),
        "yoy_c_ytd": pct(tot_c_ytd, tot_c_ytd_py),
        "yoy_c_mtd": pct(tot_c_mtd, tot_c_mtd_py),
        "pace": pace,
        "n_brands": len(active_brands),
        "n_accts": len(active_accts),
        "n_book": sum(1 for a in accounts if a["on_book"]),
        "avg_s_acct": r2(tot_s_ytd / len(active_accts)) if active_accts else 0,
        "avg_c_acct": r2(tot_c_ytd / len(active_accts)) if active_accts else 0,
    }

    opps = find_opportunities(rep, brands, accounts, kpi, co_pen, len(active_accts))

    # Static per-brand context the UI cannot recompute from a filtered subset
    # (supplier, rate, and the company-wide penetration benchmark).
    brandmeta = {b["brand"]: {
        "sup": b["supplier"], "rate": b["rate"],
        "pen": b["pen"], "exp": b["exp_accts"], "rank": b["rank"],
        "typ": b["typ_door"],
    } for b in brands}

    payload = {
        "rep": rep, "slug": slug(rep), "kpi": kpi, "chan_mix": dict(chan_mix),
        "brands": brands, "brandmeta": brandmeta, "accounts": accounts, "opps": opps,
    }
    headline = {
        "rep": rep, "slug": slug(rep),
        "comm_ytd_cy": kpi["c_ytd"], "sales_ytd_cy": kpi["s_ytd"],
        "yoy": kpi["yoy_s_ytd"], "n_brands": kpi["n_brands"],
        "n_accts": kpi["n_accts"], "n_opps": len(opps),
        "n_urgent": sum(1 for o in opps if o["sev"] == 3),
    }
    return payload, headline


# ---------------------------------------------------------------- opportunities
# Every opportunity carries a written "why this matters" -- a red number on its
# own is not actionable, so each rule states the size of the prize in cases and
# modeled commission, and what recovering part of it would be worth.
def find_opportunities(rep, brands, accounts, kpi, co_pen, n_active_accts):
    out = []
    port_yoy = kpi["yoy_s_ytd"] or 0.0

    def add(kind, sev, title, body, **extra):
        # `rows` lets one card carry several like-for-like items instead of
        # repeating the same paragraph with the nouns swapped.
        o = {"kind": kind, "sev": sev, "title": title, "body": body}
        o.update(extra)
        out.append(o)

    # 1. Big commission brand going backwards -- the single most expensive thing
    #    on a rep's board.
    for b in brands:
        if b["sh_comm"] >= 4 and (b["yoy_ytd"] or 0) <= -8 and b["s_ytd_py"] >= 150:
            lost = abs(b["dc_ytd"])
            add("brand_decline", 3 if b["sh_comm"] >= 10 else 2,
                "%s — %.0f%% of your commission, down %.0f%% YoY" % (
                    b["brand"], b["sh_comm"], abs(b["yoy_ytd"])),
                "Sales are down %s cases (%.0f%%) vs last year, but %s is still "
                "%.1f%% of your total commission — your #%d brand. That decline has "
                "already cost about %s in modeled commission, and recovering half of "
                "it is worth roughly %s.%s %d accounts bought it last year; %d have "
                "this year%s." % (
                    fmt_cases(abs(b["d_ytd"])), abs(b["yoy_ytd"]), b["brand"],
                    b["sh_comm"], b["rank"], fmt_money(lost), fmt_money(lost / 2),
                    (" On a brand this size that is a bigger swing than anything you "
                     "could realistically open new this year." if b["sh_comm"] >= 10
                     else ""),
                    b["accts_py"], b["accts"],
                    (" — %d accounts stopped carrying it" % (b["accts_py"] - b["accts"])
                     if b["accts_py"] > b["accts"] else "")),
                brand=b["brand"], value=r2(lost))

    # 2. Brand outrunning the rep's own portfolio -- momentum worth feeding.
    for b in brands:
        if (b["yoy_ytd"] or 0) >= max(port_yoy + 12, 10) and b["s_ytd"] >= 200:
            add("brand_growth", 1,
                "%s — growing %.0f%% while your book is %s%.0f%%" % (
                    b["brand"], b["yoy_ytd"],
                    "+" if port_yoy >= 0 else "-", abs(port_yoy)),
                "%s is up %s cases (%.0f%%) YoY against a portfolio that is %s%.0f%%. "
                "It is running %.0f points ahead of your book and is currently in "
                "%d of your %d active accounts. This is where a placement lands "
                "easiest — the brand is already proving itself in your territory, "
                "and it has added about %s in modeled commission so far." % (
                    b["brand"], fmt_cases(b["d_ytd"]), b["yoy_ytd"],
                    "+" if port_yoy >= 0 else "-", abs(port_yoy),
                    (b["yoy_ytd"] or 0) - port_yoy, b["accts"], n_active_accts,
                    fmt_money(b["dc_ytd"])),
                brand=b["brand"], value=r2(b["dc_ytd"]))

    # 3. Whitespace, as ONE grouped item. Emitting a card per brand meant
    #    reading the same paragraph five times with the nouns swapped -- the
    #    method is explained once, then the brands are listed with their own
    #    numbers. "Comparable" matters: the expectation is built from on- and
    #    off-premise penetration weighted by the rep's own channel mix, so an
    #    on-premise book is never measured against a supermarket brand's reach.
    gaps = []
    for b in brands:
        if n_active_accts < 8 or b["s_ytd"] < 50 or b["accts"] < 2:
            continue
        rep_pen = b["accts"] / n_active_accts * 100
        could = int(round(b["exp_accts"] - b["accts"]))
        if b["pen"] - rep_pen < 12 or could < 2:
            continue
        # Value the gap at what a TYPICAL door does with this brand company-wide
        # (median, not mean), never at this rep's own average -- their existing
        # doors for a brand they barely carry are usually their two best.
        per = b["typ_door"] or 0
        if per <= 0:
            continue
        gaps.append({
            "brand": b["brand"], "have": b["accts"],
            "expect": int(round(b["exp_accts"])), "add": could,
            "per_acct": r2(per),
            "cases": r2(could * per),
            "value": r2(could * per * b["rate"]),
        })
    gaps.sort(key=lambda g: -g["value"])
    if gaps:
        top = gaps[:6]
        tot = sum(g["value"] for g in top)
        doors = sum(g["add"] for g in top)
        add("whitespace", 2 if tot >= 1000 else 1,
            "%d brands with real placement gaps — %d open doors" % (len(top), doors),
            "These brands land in far more accounts like yours than they do in your "
            "book. The comparison is not raw company share: it weights each brand's "
            "on- and off-premise placement rate by your own channel mix, so an "
            "on-premise book is never judged against a supermarket brand's reach. "
            "Each door below is valued at what a typical account doing business in "
            "that brand actually buys company-wide (the median, not an average), "
            "scaled down to the size of the doors you actually call on — so these "
            "are ordinary placements in YOUR kind of account, not best-case ones in "
            "someone else's. Closing every "
            "gap would be worth roughly %s — that is a ceiling, not a forecast, and "
            "it compares against %s of commission in your book today. Take the top "
            "one or two lines; the whole list is not a year's work." % (
                fmt_money(tot), fmt_money(kpi["c_ytd"])),
            rows=[{
                "label": g["brand"],
                "detail": "in %d of your accounts, comparable books carry it in %d "
                          "· typical door buys %s cases"
                          % (g["have"], g["expect"], fmt_cases(g["per_acct"])),
                "value": "+%d doors · %s" % (g["add"], fmt_money(g["value"])),
                "brand": g["brand"],
            } for g in top],
            value=r2(tot))

    # 4. Accounts that have gone quiet -- bought last year, nothing this year.
    #    Grouped for the same reason as the whitespace rule above.
    lapsed = sorted([a for a in accounts if a["status"] == "lapsed" and a["s_ytd_py"] >= 25],
                    key=lambda a: -a["s_ytd_py"])
    if lapsed:
        show = lapsed[:8]
        tot = sum(a["c_ytd_py"] for a in show)
        biggest = show[0]
        add("lapsed", 3 if biggest["s_ytd_py"] >= 150 else 2,
            "%d account%s stopped ordering — %s of commission gone quiet" % (
                len(show), "" if len(show) == 1 else "s", fmt_money(tot)),
            "Each of these bought from you last year and has ordered nothing at all "
            "in %d. A lost account is the most expensive kind of decline: there is no "
            "brand mix to fix and nothing replaces it automatically — the whole "
            "relationship has stopped. The largest, %s, was worth %s cases last year "
            "on its own. These are the calls with the shortest path back to "
            "commission, because the account already knows you." % (
                CY, biggest["name"], fmt_cases(biggest["s_ytd_py"])),
            rows=[{
                "label": a["name"],
                # 147 accounts appear in the sales export but not in the
                # customer base, so premise/city can both be blank -- joining
                # only the parts that exist avoids a stray "— —".
                "detail": " · ".join(
                    [x for x in (a["premise"], a["city"]) if x] +
                    ["%s cases in %d" % (fmt_cases(a["s_ytd_py"]), CY - 1)]),
                "value": fmt_money(a["c_ytd_py"]),
                "account": a["num"],
            } for a in show],
            value=r2(tot))

    # 5. Big accounts sliding -- still buying, but materially less.
    big = sorted([a for a in accounts if a["s_ytd"] > 0 and a["s_ytd_py"] >= 100
                  and (a["yoy_ytd"] or 0) <= -12
                  and (a["rank"] <= 40 or abs(a["d_ytd"]) >= 150)],
                 key=lambda a: a["d_ytd"])
    for a in big[:6]:
        worst = sorted([x for x in a["brands"] if x["s_ytd_py"] > 0],
                       key=lambda x: x["s_ytd"] - x["s_ytd_py"])[:2]
        drivers = ", ".join("%s (%s cases)" % (
            x["brand"], fmt_cases(x["s_ytd"] - x["s_ytd_py"])) for x in worst)
        # Rank only earns a mention when it is high enough to carry weight;
        # "your #144 account" reads as noise next to a real number.
        top = a["rank"] <= 25
        add("acct_decline", 3 if a["sh_comm"] >= 3 else 2,
            "%s — down %.0f%%%s" % (
                a["name"], abs(a["yoy_ytd"]),
                ", your #%d account" % a["rank"] if top else " YoY"),
            "Still ordering, but %s cases lighter than last year (%.0f%%). %s so the "
            "slide is worth about %s in modeled commission. The drop is concentrated "
            "in %s — a mix problem you can work on the next visit, not a lost "
            "account." % (
                fmt_cases(abs(a["d_ytd"])), abs(a["yoy_ytd"]),
                ("It is your #%d account and %.1f%% of your commission,"
                 % (a["rank"], a["sh_comm"])) if top else
                ("It still does %s cases a year for you,"
                 % fmt_cases(a["s_ytd"])),
                fmt_money(abs(a["dc_ytd"])), drivers or "no single brand"),
            account=a["num"], value=r2(abs(a["dc_ytd"])))

    # 6. Strong accounts that have stalled *this month* against their own year
    #    pace -- grouped, since the reasoning is identical for each one.
    soft = [a for a in accounts
            if a["s_ytd"] >= 150 and a["s_mtd_py"] >= 10
            and (a["yoy_mtd"] or 0) <= -30 and (a["yoy_ytd"] or 0) > -12]
    soft.sort(key=lambda a: a["s_mtd"] - a["s_mtd_py"])
    if soft:
        show = soft[:8]
        gap = sum(a["s_mtd_py"] - a["s_mtd"] for a in show)
        add("acct_soft_month", 2,
            "%d account%s holding all year but soft this month — %s cases behind" % (
                len(show), "" if len(show) == 1 else "s", fmt_cases(gap)),
            "Year to date each of these is fine, so the relationship is not the "
            "problem — but month to date they are all well behind where they were "
            "last August. That is the pattern that becomes a bad quarter if nobody "
            "catches it, and it is the cheapest kind to fix: the account is still "
            "buying, it just has not placed its usual order yet. Together they are "
            "%s cases and about %s of commission behind last August's pace, with "
            "days left in the month to close it." % (
                fmt_cases(gap), fmt_money(gap)),
            rows=[{
                "label": a["name"],
                "detail": "%s vs %s cases last August · %s%.0f%% YTD" % (
                    fmt_cases(a["s_mtd"]), fmt_cases(a["s_mtd_py"]),
                    "+" if (a["yoy_ytd"] or 0) >= 0 else "-", abs(a["yoy_ytd"] or 0)),
                "value": "-%s cs" % fmt_cases(a["s_mtd_py"] - a["s_mtd"]),
                "account": a["num"],
            } for a in show],
            value=r2(gap))

    # 7. Never-bought accounts sitting on the book.
    dormant = [a for a in accounts if a["status"] == "none" and a["on_book"]]
    if len(dormant) >= 3:
        add("dormant_book", 1,
            "%d accounts on your book with no volume in either year" % len(dormant),
            "These %d accounts are assigned to you but show no case volume in 2025 "
            "or 2026. Some will be closed or dead on the vine, but at your average "
            "of %s cases per active account, every one you actually open is worth "
            "about %s in modeled commission. Worth a pass through the list to "
            "separate the genuinely closed from the never-called." % (
                len(dormant), fmt_cases(kpi["avg_s_acct"]),
                fmt_money(kpi["avg_c_acct"])),
            value=r2(kpi["avg_c_acct"] * len(dormant)))

    # 8. Concentration risk -- where the commission actually lives.
    if brands:
        top = brands[0]
        top3 = sum(b["sh_comm"] for b in brands[:3])
        if top["sh_comm"] >= 20:
            add("concentration", 1,
                "%s alone is %.0f%% of your commission" % (top["brand"], top["sh_comm"]),
                "Your top brand carries %.0f%% of your commission and your top three "
                "carry %.0f%%. That concentration cuts both ways: a %s point move in "
                "%s is worth more to you than anything else on your board, so it "
                "deserves first call every week — and a supplier change or a lost "
                "placement there would hit harder than anywhere else in your book." % (
                    top["sh_comm"], top3, "single", top["brand"]),
                brand=top["brand"], value=r2(top["c_ytd"]))
    if accounts and accounts[0]["sh_comm"] >= 15:
        a = accounts[0]
        add("concentration", 1,
            "%s alone is %.0f%% of your commission" % (a["name"], a["sh_comm"]),
            "One account carries %.0f%% of your commission (%s across %d brands). "
            "Protecting this relationship is worth more than any new account you "
            "could open — and it is also your best test bed: a brand that works "
            "here is proven for the rest of the territory." % (
                a["sh_comm"], fmt_money(a["c_ytd"]), a["nbrands"]),
            account=a["num"], value=r2(a["c_ytd"]))

    out.sort(key=lambda o: (-o["sev"], -(o.get("value") or 0)))
    return out


# ---------------------------------------------------------------- write
def main():
    index, rep_files, (m_start, m_end, y_start, y_end) = build()
    DATA.mkdir(exist_ok=True)
    REPS_DIR.mkdir(exist_ok=True)
    for old in REPS_DIR.glob("*.json"):
        old.unlink()

    def d(x):
        return x.strftime("%-m/%-d/%Y")

    meta = {
        "periods": {
            "mtd_cy": "%s - %s" % (d(m_start), d(m_end)),
            "mtd_py": "%s - %s" % (d(m_start.replace(year=m_start.year - 1)),
                                   d(m_end.replace(year=m_end.year - 1))),
            "ytd_cy": "%s - %s" % (d(y_start), d(y_end)),
            "ytd_py": "%s - %s" % (d(y_start.replace(year=y_start.year - 1)),
                                   d(y_end.replace(year=y_end.year - 1))),
            "cy": y_end.year, "py": y_end.year - 1,
            "mtd_days": (m_end - m_start).days + 1,
            "prior_days": max(((y_end - y_start).days + 1)
                              - ((m_end - m_start).days + 1), 1),
        },
        "commission": {
            "default_rate": DEFAULT_RATE,
            "modeled": True,
            "note": "Neither export carries commission or dollar revenue -- they "
                    "report Case Equivalents. Commission here is modeled as cases x "
                    "rate from commission_rates.csv. Shares, ranks and YoY moves are "
                    "exact; the dollar scale follows whatever rates that file holds.",
        },
        "reps": index,
    }
    (DATA / "index.json").write_text(json.dumps(meta, separators=(",", ":")))
    for sl, payload in rep_files.items():
        (REPS_DIR / ("%s.json" % sl)).write_text(json.dumps(payload, separators=(",", ":")))
    (DATA / "sync_meta.json").write_text(json.dumps({
        "synced_at": datetime.datetime.now().replace(microsecond=0).isoformat(),
        "source": ["brand_ytd.csv", "account_ytd.csv", "customer_base.csv"],
    }, indent=1))

    tot_c = sum(h["comm_ytd_cy"] for h in index)
    tot_s = sum(h["sales_ytd_cy"] for h in index)
    print("reps:            %d" % len(index))
    print("YTD cases:       %s   (from account_ytd.csv)" % fmt_cases(tot_s))
    print("modeled comm:    %s  (default %.2f/case)" % (fmt_money(tot_c), DEFAULT_RATE))
    print("opportunities:   %d" % sum(h["n_opps"] for h in index))
    # The two exports round independently, so they never agree to the case.
    # A drift of a few hundred cases in ~4M is normal rounding; a large one
    # means the two files cover different windows or different rep scopes.
    brand_total = sum(r["y_cy"] for r in brand_rows_all)
    drift = tot_s - brand_total
    print("brand_ytd.csv:   %s   (drift %+.0f cases, %.3f%%)" % (
        fmt_cases(brand_total), drift,
        (drift / brand_total * 100) if brand_total else 0))
    if brand_total and abs(drift / brand_total) > 0.01:
        print("  !! over 1%% apart -- check the two exports cover the same "
              "windows and the same reps")
    print("wrote:           data/index.json + %d rep files" % len(rep_files))


if __name__ == "__main__":
    main()
