#!/usr/bin/env python3
"""Per-rep copies of every dataset a signed-in REP's pages load (2026-10-01).

Gavin's rule: a rep sees only their own data. The pages already DISPLAY only
the signed-in rep's rows, but the files they load carried every rep's rows,
so anyone opening the browser's developer tools could read the whole team's.
This script writes one copy per rep holding only that rep's rows, and
middleware.js hands a rep their own copy in place of the full file
(an internal rewrite: the URL the page asked for does not change). Managers
keep the full files. Run it after ANY refresh of these datasets -- every
generator below calls it at the end of its run:

  incentive-tracking/data/program_data.js   -> incentive-tracking/data/rep/<key>.js
      each program's byRep keeps only the rep's entry; leaderboards dropped;
      program-level fields (house goals, pace, meta) kept; `__anyData` marks
      a program that had data for someone (hub.js incHasAnyData reads it).
  MPOs/<off|on>-prem/data/<YYYY-MM>/*.json  -> .../<YYYY-MM>/rep/<key>/<same name>
      rows whose SALES_REP_ASSIGNED / SALES_REP_NAME / REP is the rep (one
      blanked row when the rep has none, so the builders still run).
  redbull/data.csv                          -> redbull/rep/<key>/data.csv
      the rep's rows as they are; every other rep's rows with the CUSTOMER
      NAME replaced by an opaque label, so the leaderboard and team-goal
      cards (counts only) compute exactly as before and no other rep's
      account name reaches the browser.
  carbliss-mpo/data/program.json            -> carbliss-mpo/rep/<key>/program.json
      the rep's own summary row and account rows; the HOUSE total travels as
      a count only (meta + house), never another rep's accounts or numbers.
  carbliss-onprem-targets/index.html        -> .../rep/<key>/index.html
      the embedded tg-data keeps the rep's accounts and buyers; meta.board
      carries the leaderboard counts per rep (renderBoard reads it).
  isellbeer/tap-survey-tracking/index.html  -> .../rep/<key>/index.html
      the embedded tap-data keeps the rep's records + survey history;
      `company.usBrandTotals` carries the company tap totals per brand
      family that the Peer Playbook compares against; michelob-data keeps
      the rep's accounts.
  accounts/data/reps/<key>.json             -> account SIZE (sizeClass,
      decile) moved out into accounts/data/size.json, which only managers
      may fetch (accounts.js / api/chat.js merge it for a manager).

<key> is middleware.js nameKey() of the rep's name ("Michael Ast" ->
mike-ast); the nickname map is READ from middleware.js so the two cannot
drift. Every key gets a copy of every dataset (empty when the rep has no
rows), plus `_none` for a signed-in rep whose name matches no key; the key
list is written into middleware.js between the SLICE_KEYS markers.

  python3 tools/rep_slices.py           # rebuild everything
  python3 tools/rep_slices.py --check   # exit 1 when a copy is stale
"""
import csv, hashlib, io, json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MW = ROOT / 'middleware.js'
NONE = '_none'


def load_nick():
    m = re.search(r'const NICK = (\{.*?\});', MW.read_text())
    return json.loads(re.sub(r'(\w+):', r'"\1":', m.group(1)).replace("'", '"'))


NICK = load_nick()


def name_key(n):
    parts = re.sub(r'\s+', ' ', re.sub(r'[^a-z\s]', ' ', str(n or '').lower())).strip().split(' ')
    if not parts or not parts[0]:
        return ''
    first = NICK.get(parts[0], parts[0])
    last = ''.join(parts[1:])
    return first + ('-' + last if last else '')


def dumps(o):
    return json.dumps(o, separators=(',', ':'))


class Out:
    """Collects every file this run would write, so --check can compare."""
    def __init__(self, check):
        self.check, self.stale, self.files = check, [], {}

    def put(self, path, text):
        self.files[path] = text

    def reset_dir(self, d):
        self.files.setdefault(('__dir__', d), None)

    def flush(self):
        dirs = [k[1] for k in self.files if isinstance(k, tuple)]
        if self.check:
            for d in dirs:
                if d.exists():
                    for f in d.rglob('*'):
                        if f.is_file() and f not in self.files:
                            self.stale.append(str(f.relative_to(ROOT)) + ' (left over)')
            for p, t in self.files.items():
                if isinstance(p, tuple):
                    continue
                if not p.exists() or p.read_text(encoding='utf-8') != t:
                    self.stale.append(str(p.relative_to(ROOT)))
            return
        for d in dirs:
            if d.exists():
                shutil.rmtree(d)
        for p, t in self.files.items():
            if isinstance(p, tuple):
                continue
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(t, encoding='utf-8')


# ---------- who gets a copy ----------
def all_keys(extra_names):
    keys = set()
    ix = ROOT / 'accounts/data/index.json'
    if ix.exists():
        keys |= {r['key'] for r in json.loads(ix.read_text()).get('reps', [])}
    keys |= {name_key(n) for n in extra_names}
    keys.discard('')
    return sorted(keys)


# ---------- incentives ----------
PD = ROOT / 'incentive-tracking/data/program_data.js'


def parse_program_data():
    text = PD.read_text(encoding='utf-8')
    head = text[:text.index('const ')]
    blocks = []
    for m in re.finditer(r'^const (\w+) = ', text, re.M):
        blocks.append((m.group(1), m.end()))
    out = []
    for i, (name, start) in enumerate(blocks):
        end = (text.rindex(';', start, blocks[i + 1][1]) if i + 1 < len(blocks)
               else text.rindex(';'))
        out.append((name, text[start:end]))
    return head, out


def rep_names_in(o, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'byRep' and isinstance(v, dict):
                acc.update(v.keys())
            else:
                rep_names_in(v, acc)
    elif isinstance(o, list):
        for v in o:
            rep_names_in(v, acc)


def slice_byrep(o, key):
    """Copy of o with every byRep cut to `key`'s entry and leaderboards dropped."""
    if isinstance(o, dict):
        r = {}
        for k, v in o.items():
            if k == 'byRep' and isinstance(v, dict):
                r[k] = {n: d for n, d in v.items() if name_key(n) == key}
            elif k == 'leaderboard':
                continue
            else:
                r[k] = slice_byrep(v, key)
        return r
    if isinstance(o, list):
        return [slice_byrep(v, key) for v in o]
    return o


def incentives(out, keys_holder):
    if not PD.exists():
        return set()
    head, blocks = parse_program_data()
    blobs, names = {}, set()
    for name, raw in blocks:
        if name.startswith('PROGRAM_DATA_') and 'REFRESHED' in name:
            continue
        if name == 'PROGRAM_DATA' or re.fullmatch(r'PROGRAM_DATA_\d{4}_\d{2}', name):
            blobs[name] = json.loads(raw)
            rep_names_in(blobs[name], names)

    def write(keys):
        for key in keys + [NONE]:
            parts = [head.rstrip('\n') + '\n// PER-REP COPY for ' + key + ' (tools/rep_slices.py) -- only this rep\'s rows.\n']
            for name, raw in blocks:
                if name in blobs:
                    sl = {}
                    for pk, prog in blobs[name].items():
                        p = slice_byrep(prog, key)
                        if isinstance(p, dict):
                            had = set(); rep_names_in(prog, had)
                            if had:
                                p['__anyData'] = True
                        sl[pk] = p
                    parts.append(f'const {name} = {dumps(sl)};\n')
                else:
                    parts.append(f'const {name} = {raw};\n')
            out.put(ROOT / f'incentive-tracking/data/rep/{key}.js', ''.join(parts))
    out.reset_dir(ROOT / 'incentive-tracking/data/rep')
    keys_holder.append(write)
    return names


# ---------- MPOs ----------
REP_FIELDS = ('SALES_REP_ASSIGNED', 'SALES_REP_NAME', 'REP')


def mpo_rep(row):
    for f in REP_FIELDS:
        if f in row:
            return row[f]
    return None


def mpos(out, keys_holder):
    files, names = [], set()
    for ch in ('off', 'on'):
        for mdir in sorted((ROOT / f'MPOs/{ch}-prem/data').glob('20[0-9][0-9]-[0-9][0-9]')):
            out.reset_dir(mdir / 'rep')
            for f in sorted(mdir.glob('*.json')):
                if f.name == 'sync_meta.json':
                    continue
                rows = json.loads(f.read_text(encoding='utf-8'))
                if not isinstance(rows, list):
                    raise SystemExit(f'{f}: expected a list of rows')
                if rows and all(mpo_rep(r) is None for r in rows):
                    raise SystemExit(f'{f}: no rep field ({", ".join(REP_FIELDS)}) -- add it to REP_FIELDS')
                names |= {mpo_rep(r) for r in rows if mpo_rep(r)}
                files.append((mdir, f.name, rows))

    def write(keys):
        for mdir, fname, rows in files:
            by = {}
            for r in rows:
                by.setdefault(name_key(mpo_rep(r)), []).append(r)
            # a rep with no rows in a file gets ONE blanked row (no rep, no
            # account, zeros) instead of [] -- the MPO builders read the
            # column names from the first row and give up on an empty file
            blank = None
            if rows:
                blank = {k: ('' if isinstance(v, str) else 0 if isinstance(v, (int, float)) and not isinstance(v, bool) else None if v is not None and not isinstance(v, bool) else v)
                         for k, v in rows[0].items()}
            for key in keys + [NONE]:
                mine = by.get(key) or ([blank] if blank else [])
                out.put(mdir / 'rep' / key / fname, dumps(mine))
    keys_holder.append(write)
    return names


# ---------- Red Bull ----------
RB = ROOT / 'redbull/data.csv'


def redbull(out, keys_holder):
    if not RB.exists():
        return set()
    text = RB.read_text(encoding='utf-8')
    first = text.split('\n', 1)[0]
    delim = '\t' if first.count('\t') > first.count(',') else ','
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    header, body = rows[0], [r for r in rows[1:] if any(c.strip() for c in r)]
    low = [h.lower().strip() for h in header]
    ci = next(i for i, h in enumerate(low) if 'customer' in h)
    ri = next(i for i, h in enumerate(low) if 'rep' in h)
    names = {r[ri] for r in body if len(r) > ri}
    out.reset_dir(ROOT / 'redbull/rep')

    def write(keys):
        for key in keys + [NONE]:
            alias, buf = {}, io.StringIO()
            w = csv.writer(buf, delimiter=delim, lineterminator='\n')
            w.writerow(header)
            for r in body:
                r = list(r)
                if name_key(r[ri]) != key:
                    a = (r[ri], r[ci])
                    if a not in alias:
                        alias[a] = f'Account {len(alias) + 1}'
                    r[ci] = alias[a]
                w.writerow(r)
            out.put(ROOT / f'redbull/rep/{key}/data.csv', buf.getvalue())
    keys_holder.append(write)
    return names


# ---------- Carbliss MPO tracker (2026-10-06) ----------
CM = ROOT / 'carbliss-mpo/data/program.json'


def carbliss_mpo(out, keys_holder):
    if not CM.exists():
        return set()
    data = json.loads(CM.read_text(encoding='utf-8'))
    names = {r['rep'] for r in data['reps']}
    out.reset_dir(ROOT / 'carbliss-mpo/rep')

    def write(keys):
        for key in keys + [NONE]:
            mine = {
                'meta': data['meta'],
                'house': {'buyers': data['house']['buyers']},
                'board': data.get('board', []),
                'byrep': data.get('byrep', []),
                'fell': [f for f in data.get('fell', []) if name_key(f['rep']) == key],
                'reps': [r for r in data['reps'] if name_key(r['rep']) == key],
                'accounts': [a for a in data['accounts'] if name_key(a['rep']) == key],
            }
            out.put(ROOT / f'carbliss-mpo/rep/{key}/program.json', dumps(mine))
    keys_holder.append(write)
    return names


# ---------- embedded-data pages ----------
def tag_re(tag_id):
    return re.compile(r'(<script id="' + tag_id + r'" type="application/json">)(.*?)(</script>)', re.S)


def page_with(html, replacements):
    for tag_id, payload in replacements.items():
        html, n = tag_re(tag_id).subn(lambda m: m.group(1) + payload + m.group(3), html, count=1)
        assert n == 1, f'{tag_id} script tag not found'
    return html


CB = ROOT / 'carbliss-onprem-targets/index.html'


def carbliss(out, keys_holder):
    if not CB.exists():
        return set()
    html = CB.read_text(encoding='utf-8')
    data = json.loads(tag_re('tg-data').search(html).group(2))
    names = {a['rep'] for a in data['accounts']} | {b['rep'] for b in data.get('buyers', [])} | {b['rep'] for b in data.get('loads', [])}
    board = []
    for r in data['meta'].get('reps', []):
        mine = [a for a in data['accounts'] if a['rep'] == r]
        board.append({'rep': r, 'count': sum(1 for a in mine if a.get('existingCarbliss')), 'total': len(mine)})
    out.reset_dir(ROOT / 'carbliss-onprem-targets/rep')

    def write(keys):
        for key in keys + [NONE]:
            d = {'meta': dict(data['meta'], board=board),
                 'accounts': [a for a in data['accounts'] if name_key(a['rep']) == key],
                 'buyers': [b for b in data.get('buyers', []) if name_key(b['rep']) == key],
                 'loads': [b for b in data.get('loads', []) if name_key(b['rep']) == key]}
            out.put(ROOT / f'carbliss-onprem-targets/rep/{key}/index.html', page_with(html, {'tg-data': dumps(d)}))
    keys_holder.append(write)
    return names


TAP = ROOT / 'isellbeer/tap-survey-tracking/index.html'


def tap(out, keys_holder):
    if not TAP.exists():
        return set()
    html = TAP.read_text(encoding='utf-8')
    data = json.loads(tag_re('tap-data').search(html).group(2))
    mich_m = tag_re('michelob-data').search(html)
    mich = json.loads(mich_m.group(2)) if mich_m and mich_m.group(2).strip() else None
    names = {r['rep'] for r in data['records'] if r.get('rep')}
    # company tap totals per brand family -- computeCC()'s usBrandTotals over
    # every record: family = brandFamily, else brand, else (Unspecified)
    totals = {}
    for r in data['records']:
        if r.get('status') != 'US':
            continue
        bf = (r.get('brandFamily') or '').strip() or (r.get('brand') or '').strip() or '(Unspecified)'
        totals[bf] = totals.get(bf, 0) + r.get('taps', 0)
    out.reset_dir(ROOT / 'isellbeer/tap-survey-tracking/rep')

    def write(keys):
        for key in keys + [NONE]:
            recs = [r for r in data['records'] if name_key(r.get('rep')) == key]
            accts = {str(r['account']) for r in recs}
            d = dict(data, records=recs,
                     history={a: h for a, h in (data.get('history') or {}).items() if str(a) in accts},
                     company={'usBrandTotals': totals})
            rep_ = {'tap-data': dumps(d)}
            if mich is not None:
                m = dict(mich)
                if isinstance(m.get('accounts'), list):
                    m['accounts'] = [a for a in m['accounts'] if name_key(a.get('rep')) == key]
                rep_['michelob-data'] = dumps(m)
            out.put(ROOT / f'isellbeer/tap-survey-tracking/rep/{key}/index.html', page_with(html, rep_))
    keys_holder.append(write)
    return names


# ---------- account size: managers only ----------
def account_size(out):
    reps_dir = ROOT / 'accounts/data/reps'
    size_f = ROOT / 'accounts/data/size.json'
    size = json.loads(size_f.read_text()) if size_f.exists() else {}
    changed = False
    for f in sorted(reps_dir.glob('*.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        moved = False
        for a in d.get('accounts', []):
            if 'sizeClass' in a or 'decile' in a:
                size[str(a['n'])] = {'sizeClass': a.pop('sizeClass', None) or None, 'decile': a.pop('decile', None)}
                moved = True
        if moved:
            changed = True
            out.put(f, json.dumps(d, separators=(',', ':')))
    if changed or not size_f.exists():
        out.put(size_f, dumps(dict(sorted(size.items()))))


# ---------- middleware key list ----------
def middleware_keys(out, keys):
    text = MW.read_text()
    block = 'const SLICE_KEYS = new Set(' + json.dumps(keys) + ');'
    new = re.sub(r'(/\* SLICE_KEYS_START \*/\n).*?(\n/\* SLICE_KEYS_END \*/)',
                 lambda m: m.group(1) + block + m.group(2), text, count=1, flags=re.S)
    assert '/* SLICE_KEYS_START */' in new, 'SLICE_KEYS markers missing from middleware.js'
    if new != text or out.check:
        out.put(MW, new)


def main():
    check = '--check' in sys.argv
    out, writers, names = Out(check), [], set()
    names |= incentives(out, writers)
    names |= mpos(out, writers)
    names |= redbull(out, writers)
    names |= carbliss_mpo(out, writers)
    names |= carbliss(out, writers)
    names |= tap(out, writers)
    keys = all_keys(names)
    for w in writers:
        w(keys)
    account_size(out)
    middleware_keys(out, keys)
    out.flush()
    if check:
        if out.stale:
            print('Per-rep copies are STALE -- run python3 tools/rep_slices.py:')
            for s in out.stale[:20]:
                print('  ' + s)
            sys.exit(1)
        print(f'Per-rep copies are current ({len(keys)} reps).')
    else:
        n = sum(1 for k in out.files if not isinstance(k, tuple))
        print(f'rep_slices: wrote {n} files for {len(keys)} rep keys + {NONE}.')


if __name__ == '__main__':
    main()
