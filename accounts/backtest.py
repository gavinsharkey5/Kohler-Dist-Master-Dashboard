#!/usr/bin/env python3
"""
Backtest for accounts/patterns.py (2026-09-30).

Runs the SAME rule engine with the reference month moved back, then looks
at what the account actually did in the months that followed:

  possible reorder  -> was the product bought again within the next 3 months?
  lapsed buyer      -> was it bought again within the next 3 months?
  buying less often -> was it bought at all in the next 3 months?
  baseline          -> regular products bought in the reference month itself
                       (since = 0): how often they were bought again within 3

A reorder flag that is followed by a purchase as often as the baseline is
a useful nudge; a lapsed flag that is followed by a purchase much less
often than the baseline is a real loss signal. Print both so the thresholds
in patterns.py can be judged on evidence, not taste.

  python3 accounts/backtest.py            # every rep, ref = last complete month - 3 and - 6
  python3 accounts/backtest.py --ref 2026-02 --ref 2025-11
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate as G
import patterns as P

def run(ref_month, months, sales, products, book, horizon=3):
    ref = months.index(ref_month)
    if ref + horizon >= len(months):
        sys.exit(f"{ref_month} + {horizon} months is past the data ({months[-1]})")
    hit = {'reorder': [0, 0, 0], 'lapsed': [0, 0, 0], 'slower': [0, 0, 0], 'baseline': [0, 0, 0], 'stopped': [0, 0, 0]}   # flagged, bought again, buying months after
    accts = {'flagged': 0, 'total': 0, 'flagged_bought': 0}
    for rep, alist in book['reps'].items():
        if rep.strip().lower() in G.NOT_REPS: continue
        for a in alist:
            n = str(a['n']); prods = sales.get(n)
            if not prods: continue
            plist = []
            for pn, arr in prods.items():
                if not any(arr[:ref + 1]): continue
                pr = products.get(pn, {})
                plist.append([pn, pr.get('name', pn), pr.get('family', ''), pr.get('supplier', ''), pr.get('package', ''), arr])
            res = P.analyze(plist, months, ref)
            after = lambda pn: any(prods[pn][i] > 0 for i in range(ref + 1, ref + 1 + horizon))
            nafter = lambda pn: sum(1 for i in range(ref + 1, ref + 1 + horizon) if prods[pn][i] > 0)
            accts['total'] += 1
            if res['alerts']:
                accts['flagged'] += 1
                if any(after(x['pn']) for x in res['alerts'] if x['type'] in ('reorder', 'lapsed')): accts['flagged_bought'] += 1
            for x in res['alerts']:
                hit[x['type']][0] += 1; hit[x['type']][1] += after(x['pn']); hit[x['type']][2] += nafter(x['pn'])
            # baseline: regular products bought in the reference month
            for p in plist:
                c = P.classify(p[5], ref, months)
                if c['kind'] == 'regular' and c['since'] == 0:
                    hit['baseline'][0] += 1; hit['baseline'][1] += after(p[0]); hit['baseline'][2] += nafter(p[0])
                if c['kind'] == 'stopped':
                    hit['stopped'][0] += 1; hit['stopped'][1] += after(p[0]); hit['stopped'][2] += nafter(p[0])
    print(f"\nreference {ref_month}, next {horizon} months ({months[ref+1]}..{months[ref+horizon]}); accounts with sales {accts['total']}, flagged {accts['flagged']} ({100*accts['flagged']/max(1,accts['total']):.0f}%), of which bought a flagged product again {accts['flagged_bought']}")
    for k, (n, h, m) in hit.items():
        print(f"  {k:9s} {n:6d} flagged   bought again within {horizon}: {h:6d}  ({100*h/max(1,n):5.1f}%)   buying months of the next {horizon}: {m/max(1,n):.2f}")
    return hit

if __name__ == '__main__':
    args = sys.argv[1:]
    refs = [args[i + 1] for i, a in enumerate(args) if a == '--ref']
    book, _ = G.load_book()
    months, sales, products, customers, deciles, sources = G.load_master()
    last = len(months) - 1
    while last > 0 and (sources.get(months[last]) or {}).get('partial'): last -= 1
    if not refs: refs = [months[last - 3], months[last - 6]]
    for r in refs: run(r, months, sales, products, book)
