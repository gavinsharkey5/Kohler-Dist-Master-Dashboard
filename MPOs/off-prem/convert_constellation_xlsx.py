#!/usr/bin/env python3
"""RDE "Constellation Innovation Fall 2026 (OFF) w Goals" .xlsx (one rep row, then that
rep's product rows, plus a Total row) -> constellation_innovation_fall.csv in the layout
generate_2026-10.py reads (rep repeated per row; first row of each block = the subtotal
carrying the 100% goal). Usage: python3 convert_constellation_xlsx.py <export.xlsx>"""
import openpyxl, csv, sys
from pathlib import Path
OUT = Path(__file__).parent / "constellation_innovation_fall.csv"
wb=openpyxl.load_workbook(sys.argv[1],data_only=True); ws=wb.worksheets[0]
blocks=[]; 
for r in ws.iter_rows(min_row=2,values_only=True):
    a=str(r[0] or '').strip()
    if not a or a=='Total': continue
    if '/' not in a: blocks.append([a,r,[]])
    else: blocks[-1][2].append(r)
hdr=['Sales Rep Assigned','Product Name','Innovation SKUs Placements   9/1/2026 - 11/30/2026','( Innovation SKUs Placements   9/1/2026 - 11/30/2026 ) Goals','( Innovation SKUs Placements   9/1/2026 - 11/30/2026 ) % of Goals']
f=lambda v:'' if v is None else f'{float(v):.2f}'
with open(OUT,'w',newline='') as fh:
    w=csv.writer(fh); w.writerow(hdr)
    for rep,h,prods in blocks:
        assert abs((h[1] or 0)-sum(p[1] or 0 for p in prods))<.01, rep
        w.writerow([rep,prods[0][0],f(h[1]),f(h[2]),h[3]])
        for p in prods: w.writerow([rep,p[0],f(p[1]),'',p[3]])
print(len(blocks),'reps')
