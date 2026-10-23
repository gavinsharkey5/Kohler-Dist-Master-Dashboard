"""Check generated incentive copies against HEAD; no live services or writes."""
import importlib.util
import ast
import json
import re
import subprocess
from pathlib import Path
import dm_groups

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rep_slices', ROOT / 'tools/rep_slices.py')
slices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(slices)


def datasets(text):
    return {name: json.loads(raw) for name, raw in re.findall(
        r'^const (PROGRAM_DATA(?:_\d{4}_\d{2})?) = (.*);$', text, re.M)}


checks = 0
# The generator consumes exactly the same team today, without a duplicated list.
before_generator = subprocess.check_output(['git', 'show', 'HEAD:incentive-tracking/generate.py'], cwd=ROOT).decode('utf-8')
team_assignment = next(node for node in ast.parse(before_generator).body
                       if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'MIKE_KENNEDY_TEAM' for t in node.targets))
if isinstance(team_assignment.value, ast.List):
    old_team = ast.literal_eval(team_assignment.value)
else:
    # After this change is committed HEAD also uses the shared lookup.
    scope = {'reps_for_dm': dm_groups.reps_for_dm}
    exec(compile(ast.Module(body=[team_assignment], type_ignores=[]), '<generator team>', 'exec'), scope)
    old_team = scope['MIKE_KENNEDY_TEAM']
assert dm_groups.reps_for_dm('Mike Kennedy') == old_team
checks += 1
# A membership edit changes the generator's lookup without editing any program.
original_loader = dm_groups.load_dm_groups
dm_groups.load_dm_groups = lambda: [{'dm': 'Mike Kennedy', 'reps': ['Temporary Test Rep']}]
assert dm_groups.reps_for_dm('Mike Kennedy') == ['Temporary Test Rep']
dm_groups.load_dm_groups = original_loader
checks += 1
for file in sorted((ROOT / 'incentive-tracking/data/rep').glob('*.js')):
    rel = file.relative_to(ROOT).as_posix()
    before = datasets(subprocess.check_output(['git', 'show', 'HEAD:' + rel], cwd=ROOT).decode('utf-8'))
    after = datasets(file.read_text(encoding='utf-8'))
    for month, programs in before.items():
        expected = {key: data for key, data in programs.items() if slices.program_allowed('inc', key, file.stem)}
        assert after[month] == expected, (rel, month)
        checks += len(programs)

# A roster change alone controls access, including a previously unknown rep.
slices.REP_DMS['temporary-testrep'] = 'Mike Kennedy'
assert slices.program_allowed('inc', 'four_loko', 'temporary-testrep')
assert slices.program_allowed('inc', 'two_xo', 'temporary-testrep')
assert slices.program_allowed('inc', 'constellation_fall', 'temporary-testrep')
assert slices.program_allowed('inc', 'fall_seasonal_sd', 'temporary-testrep')
assert not slices.program_allowed('inc', 'fall_seasonal_sd', 'chris-payton')
assert slices.program_allowed('off', 'unconfirmed_mpo', 'temporary-testrep')
assert not slices.program_allowed('inc', 'fall_seasonal_sd', '_none')
assert slices.program_allowed('inc', 'constellation_fall', 'chris-payton')
print(f'{checks + 8} checks: general programs retained, explicit DM restrictions enforced, retained data identical.')
