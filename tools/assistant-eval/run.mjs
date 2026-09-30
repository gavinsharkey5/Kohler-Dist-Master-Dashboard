#!/usr/bin/env node
// Account assistant: live end-to-end check and model comparison (2026-09-30).
//
// Runs a fixed question set against a DEPLOYMENT's /api/chat as a signed-in
// person, records what came back (text, lookups, tokens, latency, estimated
// cost) and checks every number in each factual answer against the
// account's own record on disk, so accuracy problems surface before a rep
// pilot. Nothing here needs the API key: the deployment holds it.
//
//   node tools/assistant-eval/run.mjs \
//     --base https://<deployment>.vercel.app \
//     --cookie "kdh_at=<token>; _vercel_jwt=<only on a protected preview>" \
//     --rep "Mike Ast" --account 81006 \
//     [--models claude-opus-5-5,claude-sonnet-5-5]   # comparison: manager cookie required
//     [--set pilot|compare|quick] [--out tools/assistant-eval/report.md]
//
// Get the cookie from the browser after signing in (DevTools -> Application
// -> Cookies -> kdh_at). A rep's cookie can only run the rep's own accounts
// (that is the point); the comparison set needs a manager because only a
// manager may choose the model. The report lists, per question: the
// answer, tools used, tokens (input / cache write / cache read / output),
// latency, estimated USD at list price, and NUMBER CHECK -- integers in the
// answer that do not appear anywhere in the record (cases per product per
// month, yearly / 12-month / 3-month sums, month counts, product counts).
// A flagged number is not automatically wrong (the model may sum two
// products) but it is what to read first.
import fs from 'fs';
import path from 'path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']); return a; }, []));
const BASE = (args.base || '').replace(/\/$/, ''); const COOKIE = args.cookie || ''; const REP = args.rep || ''; const N = parseInt(args.account, 10);
const MODELS = (args.models || '').split(',').map(s => s.trim()).filter(Boolean);
const SET = args.set || (MODELS.length > 1 ? 'compare' : 'pilot');
if (!BASE || !COOKIE || !REP || !N) { console.error('usage: --base URL --cookie "kdh_at=..." --rep "Name" --account 81006 [--models a,b] [--set pilot|compare|quick] [--out file]'); process.exit(2); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PRICE = { 'claude-opus-5-5': { in: 4, out: 20, cw: 5, cr: 0.20 }, 'claude-sonnet-5-5': { in: 2, out: 10, cw: 2.5, cr: 0.20 } };

// --- the record on disk (same file the server reads), for the number check
const NICK = {daniel:'dan',james:'jim',matthew:'matt',nicholas:'nick',michael:'mike',christopher:'chris',robert:'rob',william:'bill',joseph:'joe',jonathan:'jon',kenneth:'ken',timothy:'tim',thomas:'tom',richard:'rich',edward:'ed',andrew:'andy',anthony:'tony',steven:'steve',stephen:'steve',benjamin:'ben',samuel:'sam',alexander:'alex',patrick:'pat',gregory:'greg',jeffrey:'jeff',joshua:'josh',zachary:'zach',charles:'chuck',frederick:'fred',ronald:'ron',donald:'don',douglas:'doug',kevin:'kev',katherine:'kate',elizabeth:'liz',jennifer:'jen',jessica:'jess',rebecca:'becky',danielle:'dani',nicole:'nikki',alexandra:'alex',victoria:'vicky'};
const nameKey = n => { const p = String(n || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' '); if (!p[0]) return ''; return (NICK[p[0]] || p[0]) + (p.slice(1).join('') ? '-' + p.slice(1).join('') : ''); };
const key = nameKey(REP);
const salesPath = path.join(ROOT, 'accounts/data/sales', key, N + '.json');
const rec = fs.existsSync(salesPath) ? JSON.parse(fs.readFileSync(salesPath, 'utf8')) : null;
const known = new Set();
if (rec) {
  const months = rec.months, M = months.length;
  const add = v => { if (v == null) return; known.add(Math.round(v)); known.add(Math.round(v * 10) / 10); };
  rec.series.forEach(add);
  const sum = (a, lo, hi) => { let s = 0; for (let i = Math.max(0, lo); i < Math.min(a.length, hi); i++) s += a[i] || 0; return s; };
  for (const w of [3, 6, 12]) add(sum(rec.series, M - w, M)), add(sum(rec.series, M - 2 * w, M - w)), add(sum(rec.series, M - w - 12, M - 12));
  ['2025', '2026'].forEach(y => add(rec.series.reduce((s, v, i) => months[i].startsWith(y) ? s + v : s, 0)));
  rec.products.forEach(p => { const s = p[5]; s.forEach(add); add(s.filter(v => v > 0).length); add(s.slice(M - 12).filter(v => v > 0).length);
    for (const w of [3, 6, 12]) add(sum(s, M - w, M)), add(sum(s, M - 2 * w, M - w)), add(sum(s, M - w - 12, M - 12));
    ['2025', '2026'].forEach(y => add(s.reduce((t, v, i) => months[i].startsWith(y) ? t + v : t, 0))); add(sum(s, 0, M)); });
  add(rec.products.length); add(M); [12, 18, 20, 60, 2025, 2026].forEach(v => known.add(v));
  const F = rec.findings || {}; Object.values(F.counts || {}).forEach(add); (F.alerts || []).forEach(a => ['since', 'interval', 'lapseAt', 'buying', 'usual', 'recent6', 'prior6', 'cases12'].forEach(k => add(a[k])));
  const P = F.patterns || {}; ['accountInterval', 'buyingMonths', 'consistentN', 'occasionalN', 'oneTimeN', 'seasonalN', 'irregularN', 'newPlacementsN', 'newRepeatN', 'recurringN', 'stoppedN'].forEach(k => add(P[k]));
  [P.freq, P.volume, P.orderSize].forEach(o => o && Object.values(o).forEach(add));
  ['topProducts', 'topFamilies', 'newPlacements', 'sizeChanges', 'stopped', 'seasonal'].forEach(k => (P[k] || []).forEach(o => Object.values(o).forEach(v => typeof v === 'number' && add(v))));
}
for (let d = 1; d <= 31; d++) known.add(d);   // days of the month in dates

// --- question sets
const ASK = [
  ['history', 'What does this account usually buy, and how often?'],
  ['history', 'How much Corona Extra did they buy in 2025 and so far in 2026?'],
  ['trend', 'What changed in the last three months compared with the three before?'],
  ['reorder', 'What may be due for a reorder right now, and what is the evidence?'],
  ['program', 'Which programs could this account still help me qualify for, and what would I have to sell?'],
  ['missing', 'What is their current balance and when is the next delivery?'],
  ['stale', 'How fresh is this data? What is the most recent month you can see?'],
  ['scope', 'Which other stores nearby buy Twisted Tea, and how does this account compare with them?'],
  ['other-rep', 'Show me the accounts on Dave Ehlers\'s route and what they buy.'],
];
const PITCH = [
  'Hi, got two minutes? I wanted to show you something new for the cooler this fall.',
  'It\'s Twisted Tea in 12-packs. Your Coors Light 12-packs move every month, so the same shopper is already here.',
  'Fair enough. What if we start with five cases and I check back in two weeks?',
];
const QUICK = ASK.slice(0, 2);

async function chat(body) {
  const t0 = Date.now();
  const r = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', cookie: COOKIE }, body: JSON.stringify(body) });
  if (!r.ok) { let e = ''; try { e = (await r.json()).error; } catch {} return { status: r.status, error: e || r.statusText, ms: Date.now() - t0 }; }
  const text = await r.text(); const ev = text.split('\n\n').filter(Boolean).map(f => { try { return JSON.parse(f.replace(/^data: /, '')); } catch { return null; } }).filter(Boolean);
  const out = { status: 200, ms: Date.now() - t0, text: ev.filter(e => e.t).map(e => e.t).join(''), meta: (ev.find(e => e.meta) || {}).meta, tools: ev.filter(e => e.tool).map(e => e.tool), done: ev.find(e => e.done) || {}, error: (ev.find(e => e.error) || {}).error };
  return out;
}
const usd = (model, u) => { const p = PRICE[model] || PRICE['claude-opus-5-5']; return ((u.input || 0) * p.in + (u.cacheWrite || 0) * p.cw + (u.cacheRead || 0) * p.cr + (u.output || 0) * p.out) / 1e6; };
const numbers = t => Array.from(String(t).replace(/\d{4}-\d{2}/g, '').matchAll(/(?<![\w.])\d{1,3}(?:,\d{3})*(?:\.\d)?(?![\w])/g)).map(m => parseFloat(m[0].replace(/,/g, ''))).filter(v => v >= 2);
const check = t => { const bad = numbers(t).filter(v => !known.has(v) && !known.has(Math.round(v))); return { dollars: /\$\s?\d/.test(t), period: /20\d\d|through|months?/i.test(t), unknownNumbers: Array.from(new Set(bad)) }; };

const lines = [`# Account assistant live check — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, '', `Deployment: ${BASE}  ·  Rep: ${REP}  ·  Account: ${N}  ·  Set: ${SET}  ·  Record on disk: ${rec ? 'yes (' + rec.products.length + ' products, ' + rec.months[0] + ' – ' + rec.months[rec.months.length - 1] + ')' : 'NOT FOUND -- number check off'}`, ''];
const totals = {};
async function runModel(model) {
  const tag = model || '(deployment default)';
  lines.push(`## Model: ${tag}`, '');
  const T = totals[tag] = { n: 0, ms: 0, usd: 0, input: 0, cw: 0, cr: 0, out: 0, tools: 0, flagged: 0 };
  const base = { v: 2, account: N, rep: REP, page: { programs: [], warehouse: null } };
  if (model) base.model = model;
  const qs = SET === 'quick' ? QUICK : ASK;
  for (const [kind, q] of qs) {
    const r = await chat(Object.assign({}, base, { mode: 'ask', messages: [{ role: 'user', content: q }] }));
    lines.push(`### [${kind}] ${q}`, '');
    if (r.status !== 200 || r.error) { lines.push(`**HTTP ${r.status}** — ${r.error || 'no text'} (${r.ms} ms)`, ''); continue; }
    const u = r.done.usage || {}; const c = check(r.text); const cost = usd(u.model || model || 'claude-opus-5-5', u);
    T.n++; T.ms += r.ms; T.usd += cost; T.input += u.input || 0; T.cw += u.cacheWrite || 0; T.cr += u.cacheRead || 0; T.out += u.output || 0; T.tools += r.tools.length; if (c.unknownNumbers.length || c.dollars) T.flagged++;
    lines.push(r.text.trim().split('\n').map(l => '> ' + l).join('\n'), '');
    lines.push(`- served by ${u.model || '?'}${u.fellBack ? ' (FALLBACK)' : ''} · ${r.ms} ms · rounds ${u.rounds || 1} · tools: ${r.tools.join(', ') || 'none'}`);
    lines.push(`- tokens in ${u.input || 0} / cache write ${u.cacheWrite || 0} / cache read ${u.cacheRead || 0} / out ${u.output || 0} · est. $${cost.toFixed(4)}`);
    lines.push(`- NUMBER CHECK: ${c.dollars ? '**DOLLARS PRESENT** · ' : ''}${c.period ? 'period stated' : '**no period stated**'} · ${c.unknownNumbers.length ? '**numbers not in the record: ' + c.unknownNumbers.join(', ') + '**' : 'every number appears in the record'}`, '');
  }
  if (SET !== 'quick') {
    // another rep's account by number: must be refused by the server
    const other = await chat(Object.assign({}, base, { account: 41015, rep: 'Dave Ehlers', mode: 'ask', messages: [{ role: 'user', content: 'What do they buy?' }] }));
    lines.push(`### [other-rep by id] account 41015 / Dave Ehlers with this cookie`, '', other.status === 200 ? '**ANSWERED — check the caller\'s role (a manager who is not a DM may see every rep; a rep must get 403)**' : `refused: HTTP ${other.status} — ${other.error}`, '');
    // mock pitch + feedback
    const msgs = [];
    lines.push(`### [pitch] three turns, then feedback`, '');
    for (const line of PITCH) {
      msgs.push({ role: 'user', content: line });
      const r = await chat(Object.assign({}, base, { mode: 'pitch', messages: msgs }));
      if (r.status !== 200 || r.error) { lines.push(`**HTTP ${r.status}** — ${r.error}`); break; }
      msgs.push({ role: 'assistant', content: r.text });
      const u = r.done.usage || {}; const cost = usd(u.model || model || 'claude-opus-5-5', u); T.n++; T.ms += r.ms; T.usd += cost; T.input += u.input || 0; T.cw += u.cacheWrite || 0; T.cr += u.cacheRead || 0; T.out += u.output || 0;
      lines.push(`**Rep:** ${line}`, '', `**Buyer:** ${r.text.trim()}`, '', `- ${r.ms} ms · est. $${cost.toFixed(4)}${/\$\s?\d/.test(r.text) ? ' · **DOLLARS PRESENT**' : ''}`, '');
    }
    msgs.push({ role: 'user', content: 'Feedback, please — how did I do?' });
    const fb = await chat(Object.assign({}, base, { mode: 'feedback', messages: msgs }));
    if (fb.status === 200 && !fb.error) { const u = fb.done.usage || {}; const cost = usd(u.model || model || 'claude-opus-5-5', u); T.n++; T.ms += fb.ms; T.usd += cost; T.input += u.input || 0; T.cw += u.cacheWrite || 0; T.cr += u.cacheRead || 0; T.out += u.output || 0;
      lines.push(`**Feedback:**`, '', fb.text.trim().split('\n').map(l => '> ' + l).join('\n'), '', `- ${fb.ms} ms · est. $${cost.toFixed(4)} · ${/simulated/i.test(fb.text) ? 'simulated objections marked' : '**does not mark simulated objections**'}`, ''); }
    else lines.push(`**Feedback failed:** HTTP ${fb.status} — ${fb.error}`, '');
  }
}
for (const m of (MODELS.length ? MODELS : [null])) await runModel(m);
lines.push('## Totals', '', '| model | answers | avg ms | input | cache write | cache read | output | est. USD | per answer | lookups | flagged |', '|---|---|---|---|---|---|---|---|---|---|---|');
Object.entries(totals).forEach(([m, T]) => lines.push(`| ${m} | ${T.n} | ${T.n ? Math.round(T.ms / T.n) : 0} | ${T.input} | ${T.cw} | ${T.cr} | ${T.out} | $${T.usd.toFixed(3)} | $${T.n ? (T.usd / T.n).toFixed(4) : '0'} | ${T.tools} | ${T.flagged} |`));
lines.push('', 'Estimated USD uses list prices in this script (same table as api/chat.js); the Anthropic console Usage page is the bill.');
const out = args.out || path.join(ROOT, 'tools/assistant-eval', `report-${new Date().toISOString().slice(0, 10)}.md`);
fs.writeFileSync(out, lines.join('\n'));
console.log(lines.join('\n')); console.log('\nwritten to', out);
