"""Python replica of the tap-audit workbook's "iSellBeer Import Template"
formulas, columns P..Y (see the tap-audit skill). Every input is a static
value sheet in the same workbook -- Brand Family Territory (Enc), Brand
Crosswalk, Brands (Enc), Customers Table (Enc), Master - US vs THEM -- so
this re-evaluates Kohler's own engine rather than re-deriving its rules.

Verified 2026-08-21 against the previous mediator, whose P..Y Excel had
actually computed: S/T/U/V/W/X/Y match on all 5,342 rows. Column R differs
harmlessly -- Excel's INDEX over a blank crosswalk cell yields 0 where this
yields "" -- and only ever on rows whose Q is "No Encompass Match", where R
feeds nothing (S reads R only when Q is "Mapped").

Needed because LibreOffice cannot open this workbook in this environment
and openpyxl cannot hold a formula and its cached value at once, so a
workbook openpyxl has written carries no values for Excel-only formulas.
"""

def s(v):
    return "" if v is None else str(v).strip()

def build(wb):
    terr = {s(r[0]).upper() for r in wb["Brand Family Territory (Enc)"].iter_rows(min_row=2, values_only=True) if s(r[0])}
    cw = {}
    for r in wb["Brand Crosswalk"].iter_rows(min_row=2, values_only=True):
        k = s(r[0]).upper()
        if k and k not in cw:                      # Excel MATCH takes the FIRST hit
            cw[k] = (s(r[5]), s(r[2]))             # (Status, Mapped Encompass Brand Family)
    brands = {}
    for r in wb["Brands (Enc)"].iter_rows(min_row=2, values_only=True):
        k = s(r[2]).upper()                        # C = Brand
        if k and k not in brands:
            brands[k] = s(r[3])                    # D = Brand Family
    cust = {}
    for r in wb["Customers Table (Enc)"].iter_rows(min_row=2, values_only=True):
        try: k = float(r[0])
        except (TypeError, ValueError): continue
        if k not in cust:
            cust[k] = s(r[8])                      # I = County
    master = {}
    for r in wb["Master - US vs THEM"].iter_rows(min_row=2, values_only=True):
        k = s(r[6]).upper()                        # G = Lookup Key
        if k and k not in master:
            master[k] = s(r[5])                    # F = Final Determination
    return terr, cw, brands, cust, master

def audit(row, refs):
    """row: dict with keys B (Account #), D (Distribution Area), K (Brand),
    L (Brand Family), O (Distributor). Returns P..Y."""
    terr, cw, brands, cust, master = refs
    B, D, K, L, O = (s(row[c]) for c in "BDKLO")
    if not B:
        return [""] * 10
    P = L if L.upper() in terr else ""
    lookup = (L if L else K).upper()
    Q, R = cw.get(lookup, ("Not in Crosswalk", ""))
    if P:
        S = P
    elif Q == "Mapped":
        S = R
    elif Q == "No Encompass Match":
        S = "No Encompass Match"
    else:
        S = brands.get(lookup, "Not Mapped")
    try: T = cust.get(float(B), "Not Found")
    except ValueError: T = "Not Found"
    if not T: T = "Not Found"
    if D.upper() != "SALES":
        U = D
    elif T in ("Default", "Not Found", "Morris"):
        U = "SALES"
    else:
        U = T.upper()
    V = f"{S}|{U}"
    if "(IN-HOUSE)" in K.upper():
        W = "US"
    elif S == "No Encompass Match":
        W = "THEM"
    elif S == "Not Mapped":
        W = "Unable to Determine"
    elif U.upper() == "SALES":
        W = "Unable to Determine"
    else:
        W = master.get(V.upper(), "No Territory Data")
    X = "Review" if W in ("Unable to Determine", "No Territory Data") else ("MISMATCH" if W != O else "OK")
    Y = W if W in ("US", "THEM") else O
    return [P, Q, R, S, T, U, V, W, X, Y]
