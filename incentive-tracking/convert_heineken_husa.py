"""Rewrite the four Heineken Fall 2026 retention WORKBOOKS into the CSVs generate.py reads.

Since 2026-10-21 Gavin sends the Heineken USA "with Goals" reports as .xlsx: one combined
label column ("Sales Rep Assigned / Brand Family / Product Num & Name" ...) where a row's
level is implied only by position (no outline levels, no bold). generate.py's _husa_parse()
reads the flat CSV export, where every row repeats its parents' labels and a group's subtotal
row is the first row of that group. This rewrites each workbook into that flat layout, using
the existing CSV's header line, and _husa_parse() then reconciles every subtotal against its
rows exactly as before -- so a misread level fails the build instead of publishing.

Level rules (content, not formatting):
  * a label starting with digits + space is a leaf (product, or customer on Draft);
  * the "Total" row is skipped; on the two reports with a top group (Off National = supplier,
    Dos Equis = brand) that group row is the report total, as in the CSV;
  * Packages (rep / brand / product): a named row directly followed by a leaf is a BRAND,
    any other named row is a REP;
  * Draft (rep / brand+product / customer): a row with the Product column filled is the keg
    group, a named row with it empty is a REP.

Usage: python3 incentive-tracking/convert_heineken_husa.py <off.xlsx> <packages_on.xlsx> <draft_on.xlsx> <dos_equis_on.xlsx>
(files are recognised by their first header, so any order works)
"""
import csv, os, re, sys
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
LEAF = re.compile(r"^\d+ ")
KINDS = {"Supplier / Sales Rep Assigned / Product Num & Name": "off_national",
         "Sales Rep Assigned / Brand Family / Product Num & Name": "on_packages",
         "Sales Rep Assigned / Brand Family / Customer Num Name": "on_draft",
         "Brand Family / Sales Rep Assigned / Product Num & Name": "on_dos_equis"}


def num(v):
    return "" if v is None or v == "" else (f"{v:.2f}" if isinstance(v, (int, float)) else str(v))


def rows_of(path):
    ws = openpyxl.load_workbook(path, data_only=True, read_only=True).worksheets[0]
    rows = [tuple(r) for r in ws.iter_rows(values_only=True)]
    head = str(rows[0][0]).strip()
    if head not in KINDS:
        sys.exit(f"{os.path.basename(path)}: unknown report header {head!r}")
    body = [r for r in rows[1:] if r and r[0] not in (None, "") and str(r[0]).strip() != "Total"]
    return KINDS[head], rows[0], body


def convert(path):
    kind, head, body = rows_of(path)
    out_path = os.path.join(DATA, f"heineken_husa_{kind}.csv")
    header = next(csv.reader(open(out_path, newline="", encoding="utf-8-sig")))
    lab = lambda r: str(r[0]).strip()
    out = []
    if kind in ("off_national", "on_dos_equis"):
        # top group (supplier / brand) = report total, then rep + product rows
        # value columns: cur, goal, pct, base
        top, rep = lab(body[0]), None
        first_leaf = next(lab(r) for r in body if LEAF.match(lab(r)))
        for i, r in enumerate(body):
            L = lab(r)
            if i == 0:
                vals, rep_name, prod = r[1:5], "", first_leaf
            elif LEAF.match(L):
                vals, rep_name, prod = r[1:5], rep, L
            else:
                rep = L
                nxt = next((lab(x) for x in body[i + 1:] if LEAF.match(lab(x))), "")
                vals, rep_name, prod = r[1:5], rep, nxt
            row = {"Sales Rep Assigned": rep_name, "Product Num & Name": prod}
            row["Supplier" if kind == "off_national" else "Brand Family"] = top
            out.append((row, vals))
    elif kind == "on_packages":
        rep = brand = None
        for i, r in enumerate(body):
            L = lab(r)
            nxt = lab(body[i + 1]) if i + 1 < len(body) else ""
            if LEAF.match(L):
                out.append(({"Sales Rep Assigned": rep, "Brand Family": brand, "Product Num & Name": L}, r[1:5]))
            elif LEAF.match(nxt):
                brand = L
                out.append(({"Sales Rep Assigned": rep, "Brand Family": brand, "Product Num & Name": nxt}, r[1:5]))
            else:
                rep = L
                b = next((lab(x) for x in body[i + 1:] if not LEAF.match(lab(x))), "")
                p = next((lab(x) for x in body[i + 1:] if LEAF.match(lab(x))), "")
                out.append(({"Sales Rep Assigned": rep, "Brand Family": b, "Product Num & Name": p}, r[1:5]))
    else:  # on_draft: label / product / cur / goal / pct / base
        rep = brand = prod = None
        for i, r in enumerate(body):
            L, P = lab(r), (str(r[1]).strip() if r[1] not in (None, "") else "")
            if P:
                brand, prod = L, P
                out.append(({"Sales Rep Assigned": rep, "Brand Family": brand, "Product Num & Name": prod, "Customer Num Name": ""}, r[2:6]))
            elif LEAF.match(L):
                out.append(({"Sales Rep Assigned": rep, "Brand Family": brand, "Product Num & Name": prod, "Customer Num Name": L}, r[2:6]))
            else:
                rep = L
                g = next((x for x in body[i + 1:] if x[1] not in (None, "")), None)
                out.append(({"Sales Rep Assigned": rep, "Brand Family": lab(g) if g else "", "Product Num & Name": str(g[1]).strip() if g else "",
                             "Customer Num Name": ""}, r[2:6]))
    cur_c, goal_c, pct_c, base_c = header[-4], header[-3], header[-2], header[-1]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        for row, (cur, goal, pct, base) in out:
            row.update({cur_c: num(cur), goal_c: num(goal), pct_c: pct or "", base_c: num(base)})
            w.writerow({k: row.get(k, "") for k in header})
    print(f"{os.path.basename(out_path)}: {len(out)} rows from {os.path.basename(path)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        convert(p)
