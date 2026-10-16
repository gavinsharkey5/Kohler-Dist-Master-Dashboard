/* Account map coordinates (2026-10-02): POST /api/geocode
   {rep, accounts:[customer #...]} -> {results: {n: {lat, lng, match} | {none: reason}}}

   The map in My Accounts shows a rep's assigned accounts. When the account
   data carries a VALIDATED coordinate (accounts/geo.csv -> row.geo, e.g.
   Encompass's own customer coordinates) the page uses it and never calls
   this. For the rest, the page asks here in batches; this function:
     1. checks the kdh_at token against allowed_users (same as api/chat.js),
     2. AUTHORIZES THE ROUTE -- a rep only their own (name key), a district
        manager only their team's reps, any other manager any rep -- and
        reads the route file from this deployment WITH the caller's cookies,
        so the middleware's per-rep slices hold underneath,
     3. geocodes ONLY customer numbers on that route, using the street and
        town from that file (never an address sent by the browser), through
        the US Census Geocoder's batch endpoint (public, no key),
     4. says plainly which accounts could not be placed: "incomplete" (no
        street or town in the customer base), "not found" (No_Match), or
        "ambiguous" (Tie) -- the page keeps those in the list.
   Nothing is stored server-side beyond a per-isolate cache; the page keeps
   results in localStorage keyed by customer # + address, so a changed
   address is looked up again.
   NOT VERIFIED from the build environment (its network refuses the Census
   host): one live call after deploy. If the Census service is down the
   page says so and the list keeps working. */
import { json, readCookie, whoIs, nameKey, StaticExportSource, teamFor } from './chat.js';

export const config = { runtime: 'edge' };

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';
const MAX_BATCH = 250;
const RATE = { windowMs: 10 * 60 * 1000, max: 30 };
const rate = new Map();
const cache = new Map();                 // `${n}|${address}` -> result, per isolate

function overRate(key) {
  const now = Date.now();
  const r = rate.get(key) || { from: now, n: 0 };
  if (now - r.from > RATE.windowMs) { r.from = now; r.n = 0; }
  r.n += 1; rate.set(key, r);
  return r.n > RATE.max;
}
const csvField = s => '"' + String(s == null ? '' : s).replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
export function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
// Census batch response, one line per input:
// "id","input address","Match|No_Match|Tie","Exact|Non_Exact","matched address","lon,lat","tigerline id","side"
export function parseCensus(text) {
  const out = {};
  String(text || '').split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const f = parseCsvLine(line);
    const id = (f[0] || '').trim(); if (!id) return;
    const status = (f[2] || '').trim();
    if (status === 'Match') {
      const [lon, lat] = String(f[5] || '').split(',').map(Number);
      if (isFinite(lat) && isFinite(lon) && lat > 38 && lat < 43 && lon > -77 && lon < -72) out[id] = { lat: +lat.toFixed(6), lng: +lon.toFixed(6), match: (f[3] || '').trim() || 'Match', matched: (f[4] || '').trim() };
      else out[id] = { none: 'not found' };
    } else out[id] = { none: status === 'Tie' ? 'ambiguous' : 'not found' };
  });
  return out;
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  const env = { supabaseUrl: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY };
  if (!env.supabaseUrl || !env.publishableKey) return json(503, { error: 'Sign-in is not configured.' });
  const token = readCookie(request.headers.get('cookie'), 'kdh_at');
  const who = await whoIs(token, env.supabaseUrl, env.publishableKey);
  if (!who) return json(401, { error: 'Sign in again to see the map.' });
  if (overRate(String(who.email || 'anon').toLowerCase())) return json(429, { error: 'Too many map lookups in a short time. Give it a few minutes.' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Bad request body.' }); }
  const repName = typeof body.rep === 'string' ? body.rep.trim().slice(0, 80) : '';
  const wanted = Array.isArray(body.accounts) ? body.accounts.slice(0, MAX_BATCH).map(x => parseInt(x, 10)).filter(x => Number.isInteger(x) && x > 0) : [];
  if (!wanted.length) return json(400, { error: 'No accounts named.' });

  const src = StaticExportSource(request, env, token);
  let repKey;
  if (who.role === 'manager') {
    if (!repName) return json(400, { error: 'A manager must name the rep whose accounts these are.' });
    repKey = nameKey(repName);
    const team = teamFor(who.name, await src.dmGroups());
    if (team && !team.has(repKey)) return json(403, { error: 'That rep is not on your team.' });
  } else {
    repKey = nameKey(who.name);
    if (!repKey) return json(403, { error: 'We could not match your name to a route.' });
    if (repName && nameKey(repName) !== repKey) return json(403, { error: 'You can only map your own accounts.' });
  }
  const route = await src.route(repKey);
  if (!route || !Array.isArray(route.accounts)) return json(403, { error: 'We could not find that route in the account data.' });
  const byN = new Map(route.accounts.map(a => [Number(a.n), a]));

  const results = {}, todo = [];
  for (const n of wanted) {
    const a = byN.get(n);
    if (!a) { results[n] = { none: 'not on this route' }; continue; }        // never geocoded, never echoed
    const street = String(a.address || '').trim(), town = String(a.city || '').trim();
    if (!street || !town) { results[n] = { none: 'incomplete' }; continue; }
    const key = `${n}|${street}|${town}`;
    if (cache.has(key)) { results[n] = cache.get(key); continue; }
    todo.push({ n, street, town, key });
  }
  if (todo.length) {
    const csv = todo.map(t => [t.n, csvField(t.street), csvField(t.town), 'NJ', ''].join(',')).join('\n');
    const form = new FormData();
    form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'accounts.csv');
    form.append('benchmark', 'Public_AR_Current');
    let text = '';
    try {
      const res = await fetch(CENSUS, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
      if (!res.ok) return json(502, { error: 'The address lookup service did not answer. The list still works; try the map again later.', results });
      text = await res.text();
    } catch {
      return json(502, { error: 'The address lookup service did not answer. The list still works; try the map again later.', results });
    }
    const got = parseCensus(text);
    for (const t of todo) {
      const r = got[String(t.n)] || { none: 'not found' };
      results[t.n] = r;
      if (cache.size > 5000) cache.clear();
      cache.set(t.key, r);
    }
  }
  return json(200, { results, source: 'US Census Geocoder (Public_AR_Current)', at: new Date().toISOString() });
}
