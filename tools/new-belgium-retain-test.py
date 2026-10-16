"""Source reconciliation and scoring-boundary tests for New Belgium retention."""
import copy
import importlib.util
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
def module(name, file):
    spec=importlib.util.spec_from_file_location(name, ROOT/file)
    result=importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result
converter=module('nb_convert','incentive-tracking/convert_new_belgium_retain.py')
generator=module('nb_generate','incentive-tracking/generate.py')
report=converter.convert(ROOT/'incentive-tracking/data/new_belgium_distribution_retain.xlsx')
data=generator.build_new_belgium_distribution_retain()
assert len(data['byRep'])==13
assert data['house']=={'placements':1092,'goal':1826}
assert sum(d['placements'] for d in data['byRep'].values())==1092
assert sum(d['overallGoal'] for d in data['byRep'].values())==1826
assert 'Alex Rodriguez' not in data['byRep']
assert (data['periodStart'],data['periodEnd'])==('2026-09-01','2026-12-31')
anthony=data['byRep']['Anthony Palmisano']
assert (anthony['placements'],anthony['overallGoal'],anthony['overallToGo'])==(92,160,68)
assert [g['goal'] for g in anthony['groups']]==[60,85,15]
assert anthony['groups'][0]['visibleSkuGoal']==52
assert anthony['groups'][2]['visibleSkuGoal']==12
assert anthony['groups'][2]['goal']==15  # Never discard goals hidden in the SKU listing.
assert 'combined report goal' in anthony['groups'][2]['label']
assert all('payout' not in d for d in data['byRep'].values())
assert data['meta']['payoutAvailable'] is False
assert data['meta']['customerDetailAvailable'] is False
assert 'Unverified' in data['meta']['bonusStatus']
with tempfile.TemporaryDirectory(dir=ROOT/'tools', prefix='nb-test-') as temp:
    temp=Path(temp).resolve()
    assert temp.parent == (ROOT/'tools').resolve()
    changed=copy.deepcopy(report)
    rep=changed['reps'][0]
    # Excess in Voodoo 12pk cannot complete another package group.
    rep['groups'][0]['placements']=10000
    file=temp/'new_belgium_distribution_retain.json'
    file.write_text(json.dumps(changed))
    with patch.object(generator,'DATA_DIR',temp):
        row=generator.build_new_belgium_distribution_retain()['byRep'][rep['rep']]
    assert row['overallHeld']==60+54+4
    assert row['overallToGo']==31+11
    assert row['goalsRetained']==1 and row['overallPct']<100
    for group in rep['groups']: group['placements']=group['goal']
    file.write_text(json.dumps(changed))
    with patch.object(generator,'DATA_DIR',temp):
        row=generator.build_new_belgium_distribution_retain()['byRep'][rep['rep']]
    assert row['overallPct']==100 and row['overallToGo']==0 and row['goalsRetained']==3
    changed['meta']['periodEnd']='2026-11-30'
    file.write_text(json.dumps(changed))
    try:
        with patch.object(generator,'DATA_DIR',temp): generator.build_new_belgium_distribution_retain()
    except ValueError: pass
    else: raise AssertionError('Changed reporting window was silently accepted')
for invalid in [None,'',-1,1.5,True]:
    try: converter.count(invalid,'test')
    except ValueError: pass
    else: raise AssertionError('Invalid count accepted: '+repr(invalid))
assert converter.count(0,'test')==0
print('PASS: source hierarchy and 1,092/1,826 reconciliation; 13-rep scope; period; combined group; nonadditive SKU goals; no inferred payout/bonus/accounts; capped scoring; exact goal boundary; malformed counts rejected.')
