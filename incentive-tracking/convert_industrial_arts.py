"""Combine the split Industrial Arts exports into data/industrial_arts.csv.

Since 2026-10-21 the Industrial Arts Target Account Launch export arrives as TWO
files -- "...LAUNCH_OFF_OCTOBER_2026" (Placement Count + Cases) and
"...LAUNCH_ON_OCTOBER_2026" (Buyer Count + Cases) -- with no Package, Premise or
Date column. build_industrial_arts() in generate.py reads one file in the older
combined layout, so this rewrites the two into that layout:

  * premise comes from which file the row is in;
  * the ON file's Buyer Count fills the Placement Count column (one keg buyer =
    one draft line), Buyer Count is kept as-is on both;
  * Package is left blank -- generate.py reads keg size and 16 / 19.2 / 12 oz from
    the product name when Package is empty;
  * Date: the new exports carry none, and on-premise draft pays only for an
    OCTOBER keg (Nov + Dec for the hold bonus). A row that was already in the
    previous industrial_arts.csv keeps its date from there; a new row gets the
    --as-of date (default today), i.e. the day the export was pulled. That is
    right while every pull is in the month of the purchase. ASK GAVIN to add the
    Date / Load Sheet Date column back to both exports before November so a late-
    October keg pulled in November is not read as November.

Usage: python3 incentive-tracking/convert_industrial_arts.py OFF.csv ON.csv [--as-of M/D/YYYY]
"""
import csv, datetime, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "industrial_arts.csv")
WIN = "10/1/2026 - 12/31/2026"
HEADER = ["Sales Rep Assigned", "Product Num & Name", "Brand Family", "Package", "Customer Num & Company", "On-Off Premise", "Date",
          f"Buyer Count   {WIN}", "Buyer Count Unit Difference", f"Placement Count   {WIN}", "Placement Count Unit Difference",
          f"Cases   {WIN}", "Cases Unit Difference"]


def col(fields, prefix):
    hits = [f for f in fields if f.startswith(prefix)]
    if len(hits) != 1:
        sys.exit(f"expected one '{prefix}' column, found {hits}")
    if WIN not in hits[0]:
        sys.exit(f"'{hits[0]}' is not the {WIN} window -- check the export")
    return hits[0]


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    as_of = datetime.date.today()
    if "--as-of" in argv:
        m, d, y = argv[argv.index("--as-of") + 1].split("/"); as_of = datetime.date(int(y), int(m), int(d))
        args = [a for a in args if a != argv[argv.index("--as-of") + 1]]
    if len(args) != 2:
        sys.exit(__doc__)
    off_path, on_path = args
    old_dates = {}
    if os.path.exists(OUT):
        for r in csv.DictReader(open(OUT, newline="", encoding="utf-8-sig")):
            k = (r["Sales Rep Assigned"].strip(), r["Product Num & Name"].strip(), r["Customer Num & Company"].strip())
            if r.get("Date"):
                old_dates[k] = r["Date"].strip()
    out, kept, stamped = [], 0, 0
    for path, premise, count_prefix in ((off_path, "Off Premise", "Placement Count"), (on_path, "On Premise", "Buyer Count")):
        rows = list(csv.DictReader(open(path, newline="", encoding="utf-8-sig")))
        if not rows:
            continue
        cnt, cases = col(rows[0].keys(), count_prefix), col(rows[0].keys(), "Cases")
        for r in rows:
            rep = r["Sales Rep Assigned"].strip()
            if not rep:
                continue
            k = (rep, r["Product Num & Name"].strip(), r["Customer Num & Company"].strip())
            date = old_dates.get(k)
            if date: kept += 1
            else: date = f"{as_of.month}/{as_of.day}/{as_of.year}"; stamped += 1
            out.append({HEADER[0]: rep, HEADER[1]: k[1], HEADER[2]: r.get("Brand Family", "").strip(), HEADER[3]: "",
                        HEADER[4]: k[2], HEADER[5]: premise, HEADER[6]: date,
                        HEADER[7]: r[cnt], HEADER[8]: "", HEADER[9]: r[cnt], HEADER[10]: "", HEADER[11]: r[cases], HEADER[12]: ""})
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER); w.writeheader(); w.writerows(out)
    print(f"industrial_arts.csv: {len(out)} rows ({sum(r[HEADER[5]] == 'Off Premise' for r in out)} off, "
          f"{sum(r[HEADER[5]] == 'On Premise' for r in out)} on); dates kept from the previous file on {kept}, "
          f"{stamped} new row(s) dated {as_of.isoformat()} (the export has no Date column)")


if __name__ == "__main__":
    main(sys.argv[1:])
