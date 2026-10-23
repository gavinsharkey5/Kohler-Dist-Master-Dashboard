"""Read the site's DM membership without maintaining another rep-name list."""
import ast
import re
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'shared/dm-groups.js'


def load_dm_groups():
    text = SOURCE.read_text(encoding='utf-8')
    groups = [{'dm': dm, 'reps': ast.literal_eval(reps)} for dm, reps in re.findall(
        r"\{\s*dm:\s*'([^']+)',\s*reps:\s*(\[[^\]]*\])", text)]
    if not groups:
        raise ValueError('No DM groups found in shared/dm-groups.js')
    return groups


def reps_for_dm(dm):
    group = next((g for g in load_dm_groups() if g['dm'] == dm), None)
    if group is None:
        raise ValueError(f'DM missing from shared/dm-groups.js: {dm}')
    return group['reps']
