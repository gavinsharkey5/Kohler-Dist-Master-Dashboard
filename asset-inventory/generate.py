#!/usr/bin/env python3
"""
Asset Inventory dashboard generator.

Reads data/Assets.csv (the iSellBeer "Assets" export) and writes the
embedded JSON snapshot into index.html between the
<script id="asset-data"> markers.

The export is thin: only Asset ID, Asset Type, Asset Description, Status,
Location, Bin, Cost and Remaining Value carry any values at all, and of
those Status/Location/Cost/Remaining Value are single-valued across every
row. So every analytical dimension on the dashboard (category, brand,
size, tag code) is DERIVED from the asset name text. See README.txt.

Usage:  python3 generate.py
"""

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / "data" / "Assets.csv"
HTML_PATH = HERE / "index.html"
META_PATH = HERE / "data" / "sync_meta.json"

# Columns that were entirely empty in the source export. Tracked so the
# dashboard can say so out loud rather than silently dropping them.
EXPECTED_COLUMNS = [
    "Asset ID", "Purchase", "Asset Type", "Asset Description", "Asset Num",
    "Serial Num", "Status", "Location", "Bin", "Cost", "Remaining Value",
    "Placed in Service Date", "Customer", "Time Confirmed", "Purchased Date",
    "Sold Date", "Asset Owner",
]

# ---------------------------------------------------------------------------
# Derivation rules
# ---------------------------------------------------------------------------

# Leading code found on ~35% of names, e.g. "(TG)Hofbrau ...", "*SH* Modelo ...".
# It correlates with brand families but its meaning is NOT documented in the
# export, so the dashboard surfaces it neutrally as a "Tag" and never claims
# it identifies a rep or a supplier.
CODE_RE = re.compile(r"^\s*[\(\*]{1,2}\s*([A-Za-z0-9]{1,6})\s*[\)\*]{1,2}\s*")

SIZE_RE = re.compile(
    r"(?<![\d.])(\d+(?:\.\d+)?)\s*-?\s*(oz\b|ounce\b|liter\b|litre\b|l\b|qt\b|quart\b)",
    re.I,
)

# Explicit trailing "- SUFFIX" category, normalized to a display label.
SUFFIX_MAP = {
    "GLASSES": "Glassware",
    "GLASS": "Glassware",
    "SHAKER": "Glassware",
    "PLASTIC CUPS": "Plastic Cups",
    "PATIO UMBRELLA": "Patio Umbrellas",
    "DEALER LOADER": "Dealer Loaders",
    "LED": "LED Signs",
    "NEON": "Neon Signs",
    "RACKS": "Racks & Displays",
    "6-PACK RACK": "Racks & Displays",
    "A-FRAME": "A-Frames",
    "MIRROR": "Mirrors & Wall Decor",
}

# Keyword fallback for the ~44% of rows with no explicit suffix. Order
# matters: the first rule that matches wins, so specific terms sit above
# generic ones.
KEYWORD_RULES = [
    ("Plastic Cups", ["plastic cup", "plastic cups"]),
    ("Glassware", [
        "shaker", "pilsner", "glassware", "glasses", " glass", "mug", "stein",
        "pint", "goblet", "chalice", "mason jar", "wine glass", "coupe",
        "snifter", "tulip",
    ]),
    ("Neon Signs", ["neon"]),
    ("LED Signs", ["led", "l.e.d"]),
    ("Patio Umbrellas", ["umbrella"]),
    ("Coolers & Drinkware", [
        "cooler", "kanga", "koozie", "coozie", "can holder", "tumbler",
        "growler", "thermos", "ice bucket", "bucket",
    ]),
    ("Racks & Displays", [
        "rack", "glide", "display", "case stacker", "shelf", "shelving",
        "end cap", "endcap", "bin",
    ]),
    ("A-Frames", ["a-frame", "aframe", "a frame"]),
    ("Signage & Menu Boards", [
        "menu board", "chalkboard", "chalk board", "sign", "banner", "flag",
        "poster", "picture frame", "print", "decal", "tacker", "tin tacker",
        "marquee", "light box", "lightbox", "sticker", "stancion", "stanchion",
    ]),
    ("Clocks", ["clock"]),
    ("Mirrors & Wall Decor", ["mirror", "wall decor"]),
    ("Furniture", [
        "chair", "table", "stool", "bench", "recliner", "couch", "sofa",
        "fooseball", "foosball", "cornhole", "corn hole", "pub table",
    ]),
    ("Outdoor & Recreation", [
        "golf bag", "paddleboard", "paddle board", "surfboard", "inflate",
        "inflatable", "beach", "wagon", "tent", "canopy", "kayak", "cooler bag",
        "backpack", "bag", "nautical ring", "ring", "grill", "yard game",
        "corntoss", "bike", "blower", "trimmer", "mat", "rug", "towel",
        "firepit", "fire pit", "speaker", "plinko", "game", "jug", "water jug",
    ]),
    ("Dealer Loaders", ["dealer loader", "loader"]),
]

# Canonical brand list. Aliases fold the source's real misspellings
# ("Garag Beer", "Yeungling", "Heinken", "HofBrau") onto one name so the
# brand counts are not split across typos. Longest alias is matched first.
BRAND_ALIASES = {
    "Corona": ["corona"],
    "Coors Light": ["coors light", "coors lt", "coorslight"],
    "Coors": ["coors"],
    "Modelo": ["modelo"],
    "Miller Lite": ["miller lite", "miller lt", "millerlite", "miller  lite"],
    "Miller": ["miller"],
    "Hofbrau": ["hofbrau", "hof brau", "hb "],
    "Montauk": ["montauk"],
    "Yuengling": ["yuengling", "yeungling", "yuengling flight"],
    "Pacifico": ["pacifico"],
    "Victory": ["victory"],
    "Forged Irish Stout": ["forged irish stout", "forged"],
    "Sam Adams": ["sam adams", "sam summer", "sam octoberfest", "samuel adams", "sam "],
    "SunCruiser": ["suncruiser", "sun cruiser"],
    "Sapporo": ["sapporo"],
    "Garage Beer": ["garage beer", "garag beer", "garage"],
    "Twisted Tea": ["twisted tea", "twisted"],
    "Carbliss": ["carbliss"],
    "Fever Tree": ["fever tree", "fever-tree", "fevertree"],
    "Angry Orchard": ["angry orchard", "angry"],
    "Truly": ["truly"],
    "Heineken": ["heineken", "heinken", "heinekin"],
    "DAB": ["dab"],
    "Peroni": ["peroni"],
    "Lagunitas": ["lagunitas"],
    "Pabst": ["pabst", "pbr"],
    "Paulaner": ["paulaner"],
    "Victoria": ["victoria"],
    "Dos Equis": ["dos equis", "dos xx", "dos"],
    "Red Bull": ["red bull", "redbull"],
    "Stone": ["stone"],
    "Weihenstephan": ["weihenstephan", "weihenstephaner"],
    "Flying Fish": ["flying fish", "flying"],
    "Cape May": ["cape may"],
    "Sullivans": ["sullivans", "sullivan's"],
    "Radeberger": ["radeberger"],
    "Estrella": ["estrella"],
    "Newburgh": ["newburgh"],
    "White Claw": ["white claw"],
    "Magners": ["magners"],
    "Sixpoint": ["sixpoint", "six point"],
    "Shiner": ["shiner"],
    "Blue Moon": ["blue moon"],
    "OVO": ["ovo"],
    "Tsingtao": ["tsingtao"],
    "Southern Tier": ["southern tier", "southern"],
    "Evil Genius": ["evil genius", "evil"],
    "1911": ["1911"],
    "Great Lakes": ["great lakes", "great"],
    "Schofferhofer": ["schofferhofer", "schoff"],
    "Athletic Brewing": ["athletic brewing", "athletic"],
    "Mike's": ["mike's", "mikes"],
    "Hacker-Pschorr": ["hacker-pschorr", "hacker pschorr", "hacker"],
    "Famosa": ["famosa"],
    "PopSicle": ["popsicle"],
    "Moosehead": ["moosehead"],
    "Mackeson": ["mackeson"],
    "Amstel": ["amstel"],
    "Vizzy": ["vizzy"],
    "Corona Premier": ["corona premier"],
    "Corona Light": ["corona light"],
    "Nutrl": ["nutrl"],
    "Guinness": ["guinness"],
    "Bud Light": ["bud light"],
    "Budweiser": ["budweiser"],
    "Michelob": ["michelob"],
    "Stella Artois": ["stella artois", "stella"],
    "Kona": ["kona"],
    "Founders": ["founders"],
    "Sierra Nevada": ["sierra nevada", "sierra"],
    "Bell's": ["bell's", "bells"],
    "Hamms": ["hamms", "hamm's"],
    "Jack Daniel's": ["jack daniels", "jack daniel's"],
    "New Belgium": ["new belgium"],
    "Sinless": ["sinless"],
    "Stiegl": ["stiegl"],
    "Delta THC": ["delta thc", "delta"],
    "Mamita": ["mamita"],
    "Clausthaler": ["clausthauler", "clausthaler"],
    "Crescent 9": ["crescent 9", "crescent"],
    "Dogfish Head": ["dogfish head", "dogfish"],
    "Leinenkugel": ["leinenkugel", "leinie"],
    "Newcastle": ["newcastle"],
    "Right Coast": ["right coast"],
    "Sunny D": ["sunny d", "sunnyd"],
    "Bud Light Seltzer": ["bud light seltzer"],
    "Modelo Chelada": ["modelo chelada"],
    "Corona NA": ["corona na"],
}

# Flattened (alias, canonical) pairs sorted longest-first so "Coors Light"
# beats "Coors" and "Miller Lite" beats "Miller".
ALIAS_PAIRS = sorted(
    ((a.strip(), canon) for canon, aliases in BRAND_ALIASES.items() for a in aliases),
    key=lambda p: -len(p[0]),
)


def strip_code(name):
    """Return (code_or_None, name_without_code)."""
    m = CODE_RE.match(name)
    if not m:
        return None, name.strip()
    return m.group(1).upper(), name[m.end():].strip()


def split_suffix(name):
    """Return (name_without_suffix, raw_suffix_or_None)."""
    if " - " in name:
        base, suf = name.rsplit(" - ", 1)
        return base.strip(), suf.strip()
    # A few rows use "- SUFFIX" with no leading space, e.g. "...Inflate- Dealer Loader".
    m = re.search(r"-\s*(Dealer Loader|Glasses|Plastic Cups|A-Frame|LED|Neon|Racks)\s*$", name, re.I)
    if m:
        return name[: m.start()].strip(), m.group(1).strip()
    return name.strip(), None


def categorize(base, suffix):
    # An explicit trailing suffix is authoritative -- except "MISCELLANEOUS",
    # which carries no information, so those fall through to the keyword rules
    # and only land back in Miscellaneous if nothing else matches.
    if suffix:
        key = suffix.upper().strip()
        if key in SUFFIX_MAP:
            return SUFFIX_MAP[key], True
    hay = f" {base.lower()} "
    for label, kws in KEYWORD_RULES:
        for kw in kws:
            if kw in hay:
                return label, False
    return "Miscellaneous", False


def find_brand(base):
    hay = base.lower()
    for alias, canon in ALIAS_PAIRS:
        # word-boundary-ish match to avoid "stone" inside "Stonewall"
        if re.search(r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])", hay):
            return canon
    return None


def find_size(base):
    m = SIZE_RE.search(base)
    if not m:
        return None
    num, unit = m.group(1), m.group(2).lower().rstrip(".")
    unit = {
        "ounce": "oz", "litre": "L", "liter": "L", "l": "L",
        "quart": "qt", "qt": "qt", "oz": "oz",
    }.get(unit, unit)
    try:
        f = float(num)
        num = str(int(f)) if f == int(f) else str(f)
    except ValueError:
        pass
    return f"{num} {unit}"


def money(raw):
    if raw is None:
        return 0.0
    s = str(raw).replace("$", "").replace(",", "").strip()
    if not s:
        return 0.0
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        v = float(s)
    except ValueError:
        return 0.0
    return -v if neg else v


def main():
    if not CSV_PATH.exists():
        sys.exit(f"missing {CSV_PATH}")

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        source_cols = list(reader.fieldnames or [])
        rows = [r for r in reader if (r.get("Asset ID") or "").strip()]

    if not rows:
        sys.exit("no data rows found")

    # -- which columns actually carry data -----------------------------------
    fill = {}
    for c in source_cols:
        vals = [(r.get(c) or "").strip() for r in rows]
        nonblank = [v for v in vals if v]
        fill[c] = {
            "filled": len(nonblank),
            "distinct": len(set(nonblank)),
            "sample": Counter(nonblank).most_common(1)[0][0] if nonblank else None,
        }
    empty_cols = [c for c in source_cols if fill[c]["filled"] == 0]
    constant_cols = [
        c for c in source_cols
        if fill[c]["filled"] == len(rows) and fill[c]["distinct"] == 1
    ]

    assets = []
    name_variants = defaultdict(set)

    for r in rows:
        aid = (r.get("Asset ID") or "").strip()
        atype = (r.get("Asset Type") or "").strip()
        adesc = (r.get("Asset Description") or "").strip()
        # Description is the cleaner of the two (the code prefix is stripped on
        # 84 rows) -- prefer it, fall back to type.
        raw = adesc or atype

        code, no_code = strip_code(raw)
        if code is None:
            # description may be pre-stripped while type still carries the code
            code, _ = strip_code(atype)

        base, suffix = split_suffix(no_code)
        category, explicit = categorize(base, suffix)
        brand = find_brand(base)
        size = find_size(base)

        # Item key groups physical units into a single logical item/SKU.
        item_key = re.sub(r"\s+", " ", base.lower()).strip()
        name_variants[item_key].add(base)

        assets.append({
            "id": aid,
            "name": base,
            "item": item_key,
            "cat": category,
            "catExplicit": explicit,
            "brand": brand or "Unassigned",
            "size": size,
            "code": code,
            "status": (r.get("Status") or "").strip() or None,
            "loc": (r.get("Location") or "").strip() or None,
            "bin": (r.get("Bin") or "").strip() or None,
            "cost": money(r.get("Cost")),
            "value": money(r.get("Remaining Value")),
        })

    # -- roll up to items ----------------------------------------------------
    items = defaultdict(lambda: {"ids": [], "cat": None, "brand": None,
                                 "size": None, "codes": Counter(), "names": Counter()})
    for a in assets:
        it = items[a["item"]]
        it["ids"].append(a["id"])
        it["cat"] = it["cat"] or a["cat"]
        it["brand"] = it["brand"] or a["brand"]
        it["size"] = it["size"] or a["size"]
        it["names"][a["name"]] += 1
        if a["code"]:
            it["codes"][a["code"]] += 1

    item_rows = []
    for key, it in items.items():
        display = it["names"].most_common(1)[0][0]
        variants = sorted(n for n in it["names"] if n != display)
        item_rows.append({
            "key": key,
            "name": display,
            "variants": variants,
            "cat": it["cat"],
            "brand": it["brand"],
            "size": it["size"],
            "codes": [c for c, _ in it["codes"].most_common()],
            "units": len(it["ids"]),
            "ids": sorted(it["ids"], key=lambda x: (-len(x), x)),
        })
    item_rows.sort(key=lambda x: (-x["units"], x["name"].lower()))

    # -- aggregates ----------------------------------------------------------
    def tally(field, source=assets):
        c = Counter(a[field] for a in source if a.get(field))
        return [{"label": k, "units": v} for k, v in c.most_common()]

    by_cat = tally("cat")
    by_brand = tally("brand")
    # Sizes are only meaningful for drinkware -- a "54 qt" cooler in the same
    # list as "16 oz" shakers would be noise, and the panel says drinkware.
    DRINKWARE = {"Glassware", "Plastic Cups"}
    by_size = tally("size", [a for a in assets if a["cat"] in DRINKWARE])
    by_code = tally("code")

    # distinct items per category / brand, for the "N items" secondary stat
    items_per_cat = Counter(i["cat"] for i in item_rows)
    items_per_brand = Counter(i["brand"] for i in item_rows)
    for row in by_cat:
        row["items"] = items_per_cat.get(row["label"], 0)
    for row in by_brand:
        row["items"] = items_per_brand.get(row["label"], 0)

    # -- exceptions worth acting on -----------------------------------------
    bin_counts = Counter(a["bin"] or "(blank)" for a in assets)
    main_bin = bin_counts.most_common(1)[0][0]
    bin_exceptions = [
        {"id": a["id"], "name": a["name"], "bin": a["bin"] or "(blank)", "cat": a["cat"]}
        for a in assets if (a["bin"] or "(blank)") != main_bin
    ]
    bin_exceptions.sort(key=lambda x: (x["bin"], x["name"]))

    spelling = [
        {"name": i["name"], "variants": i["variants"], "units": i["units"]}
        for i in item_rows if i["variants"]
    ]

    unbranded = [i for i in item_rows if i["brand"] == "Unassigned"]

    meta = {
        "synced_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_file": CSV_PATH.name,
        "row_count": len(rows),
    }
    META_PATH.write_text(json.dumps(meta, indent=2) + "\n")

    payload = {
        "meta": meta,
        "totals": {
            "units": len(assets),
            "items": len(item_rows),
            "brands": len({i["brand"] for i in item_rows if i["brand"] != "Unassigned"}),
            "categories": len(by_cat),
            "cost": round(sum(a["cost"] for a in assets), 2),
            "value": round(sum(a["value"] for a in assets), 2),
            "codes": len(by_code),
            "explicitCat": sum(1 for a in assets if a["catExplicit"]),
        },
        "profile": {
            "status": sorted({a["status"] for a in assets if a["status"]}),
            "location": sorted({a["loc"] for a in assets if a["loc"]}),
            "mainBin": main_bin,
            "binCounts": [{"label": k, "units": v} for k, v in bin_counts.most_common()],
            "emptyColumns": empty_cols,
            "constantColumns": [
                {"name": c, "value": fill[c]["sample"]} for c in constant_cols
            ],
            "sourceColumns": source_cols,
        },
        "byCat": by_cat,
        "byBrand": by_brand,
        "bySize": by_size,
        "byCode": by_code,
        "items": item_rows,
        "exceptions": {
            "bins": bin_exceptions,
            "spelling": sorted(spelling, key=lambda x: -x["units"]),
            "unbranded": len(unbranded),
            "unbrandedUnits": sum(i["units"] for i in unbranded),
        },
    }

    blob = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    html = HTML_PATH.read_text(encoding="utf-8")
    start = html.find('<script id="asset-data" type="application/json">')
    if start == -1:
        sys.exit("index.html is missing the <script id=\"asset-data\"> block")
    open_end = html.index(">", start) + 1
    close = html.index("</script>", open_end)
    HTML_PATH.write_text(html[:open_end] + blob + html[close:], encoding="utf-8")

    print(f"units          : {payload['totals']['units']}")
    print(f"distinct items : {payload['totals']['items']}")
    print(f"categories     : {payload['totals']['categories']}")
    print(f"brands         : {payload['totals']['brands']}")
    print(f"empty columns  : {len(empty_cols)} -> {', '.join(empty_cols) or 'none'}")
    print(f"bin exceptions : {len(bin_exceptions)}")
    print(f"spelling folds : {len(spelling)}")
    print(f"embedded {len(blob):,} bytes into index.html")


if __name__ == "__main__":
    main()
