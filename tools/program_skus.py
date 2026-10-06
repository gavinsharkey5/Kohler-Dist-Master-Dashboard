#!/usr/bin/env python3
"""OFFICIAL SKU LISTS PER PROGRAM (2026-10-06).

Gavin sends one export per program listing the products it counts (RDE
"... SKUs" reports). This script keeps them as plain product lists -- Product
Num + Product Name only; any cases / placements columns in the export are
ignored on purpose (they are there so the report runs, not data we publish)
-- and builds the one file the pages read.

  python3 tools/program_skus.py add <program id> <export.csv> [--source TEXT]
      program id = <on|off>:<YYYY-MM>:<objective key>   (MPO)
                 | inc:<program key>                     (incentive)
      writes MPOs/<on|off>-prem/skus/<YYYY-MM>_<key>.csv
          or incentive-tracking/data/skus/<key>.csv
      and records the source + date in that folder's sources.json
  python3 tools/program_skus.py            build shared/data/program-skus.js
  python3 tools/program_skus.py --check    exit 1 if program-skus.js is stale

Readers: hub/accounts.js eligibleProducts() (Products list, Program
Opportunities, the assistant's context, the hub's Qualifying Products) and
tools/program_eligibility.py (Corona Innovation / Lytt: the official list
replaces the products inferred from the report). The export's column for the
product may be "Product Num", "Product ID" or "Product Num & Name"
("200291 Molly's Irish Cream 6/1.75 L Btl").
"""
import csv, json, re, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "shared" / "data" / "program-skus.js"
FOLDERS = [ROOT / "MPOs" / "off-prem" / "skus", ROOT / "MPOs" / "on-prem" / "skus", ROOT / "incentive-tracking" / "data" / "skus"]


def folder_for(pid):
    m = re.fullmatch(r"(on|off):(\d{4}-\d{2}):([a-z0-9_]+)", pid)
    if m:
        return ROOT / "MPOs" / f"{m.group(1)}-prem" / "skus", f"{m.group(2)}_{m.group(3)}.csv"
    m = re.fullmatch(r"inc:([a-z0-9_]+)", pid)
    if m:
        return ROOT / "incentive-tracking" / "data" / "skus", f"{m.group(1)}.csv"
    raise SystemExit(f"program id must be on|off:YYYY-MM:key or inc:key, got {pid!r}")


def pid_for(folder, fname):
    stem = fname[:-4]
    if folder.name == "skus" and folder.parent.name in ("off-prem", "on-prem"):
        month, key = stem.split("_", 1)
        return f"{folder.parent.name.split('-')[0]}:{month}:{key}"
    return f"inc:{stem}"


def read_export(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    if not rows:
        raise SystemExit(f"{path}: no rows")
    cols = list(rows[0].keys())
    num = next((c for c in cols if c.strip().lower() in ("product num", "product id", "product number", "productid")), None)
    name = next((c for c in cols if c.strip().lower() in ("product name", "product")), None)
    both = next((c for c in cols if c.strip().lower() in ("product num & name", "product num and name")), None)
    out = {}
    for r in rows:
        if num:
            n, nm = r[num].strip(), (r[name].strip() if name else "")
        elif both:
            m = re.match(r"\s*(\d+)\s+(.*\S)\s*$", r[both] or "")
            if not m:
                continue
            n, nm = m.group(1), m.group(2)
        else:
            raise SystemExit(f"{path}: no Product Num / Product ID / Product Num & Name column in {cols}")
        n = re.sub(r"\.0+$", "", n)
        if n and n.isdigit():
            out[n] = nm
    if not out:
        raise SystemExit(f"{path}: no product numbers found")
    return out


def add(pid, path, source):
    folder, fname = folder_for(pid)
    folder.mkdir(parents=True, exist_ok=True)
    prods = read_export(path)
    with open(folder / fname, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["product_num", "product_name"])
        for n, nm in sorted(prods.items(), key=lambda x: (x[1].lower(), x[0])):
            w.writerow([n, nm])
    srcf = folder / "sources.json"
    src = json.load(open(srcf)) if srcf.exists() else {}
    src[fname] = {"program": pid, "source": source or Path(path).name, "received": date.today().isoformat(), "products": len(prods)}
    json.dump(src, open(srcf, "w"), indent=1, sort_keys=True)
    print(f"{pid}: {len(prods)} products -> {(folder / fname).relative_to(ROOT)}")


def load_all():
    data = {}
    for folder in FOLDERS:
        if not folder.exists():
            continue
        src = json.load(open(folder / "sources.json")) if (folder / "sources.json").exists() else {}
        for f in sorted(folder.glob("*.csv")):
            pid = pid_for(folder, f.name)
            prods = [{"id": r["product_num"], "name": r["product_name"]} for r in csv.DictReader(open(f))]
            meta = src.get(f.name, {})
            data[pid] = {"source": meta.get("source", ""), "received": meta.get("received", ""), "products": prods}
    return data


def official(pid):
    """{product_num: name} for a program, or None when no list is on file."""
    folder, fname = folder_for(pid)
    f = folder / fname
    if not f.exists():
        return None
    return {r["product_num"]: r["product_name"] for r in csv.DictReader(open(f))}


def render():
    data = load_all()
    return ("/* GENERATED by tools/program_skus.py -- the official SKU list per program (no customer data).\n"
            "   Edit the CSVs in MPOs/<on|off>-prem/skus/ or incentive-tracking/data/skus/, then rerun. */\n"
            "window.KDH_PROGRAM_SKUS = " + json.dumps(data, indent=1, ensure_ascii=False) + ";\n")


def main(argv):
    if argv[:1] == ["add"]:
        if len(argv) < 3:
            raise SystemExit(__doc__)
        source = argv[argv.index("--source") + 1] if "--source" in argv else ""
        add(argv[1], argv[2], source)
        argv = []
    text = render()
    if "--check" in argv:
        if not OUT.exists() or OUT.read_text() != text:
            print("shared/data/program-skus.js is stale -- run python3 tools/program_skus.py")
            sys.exit(1)
        print("program-skus.js is current")
        return
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(load_all())} programs)")


if __name__ == "__main__":
    main(sys.argv[1:])
