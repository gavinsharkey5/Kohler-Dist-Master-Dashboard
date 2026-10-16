/* Stay signed in: the server keeps the session, not the browser.

   2026-10-02: reps were annoyed at typing their email and password again and
   again, because the only long-lived part of a sign-in (Supabase's refresh
   token) lived in the sign-in page's localStorage. /login/ then handed the
   session to this function, which kept the refresh token in an HttpOnly
   cookie (kdh_rt) and middleware.js renewed the access token from it.

   2026-10-13 (reps: "it makes me log in every time, even with Remember me"):
   that still broke, because Supabase ROTATES the refresh token on every
   renewal (about hourly) and the browser had to receive and store the new
   kdh_rt cookie each time -- usually on an ordinary page or data request
   passing through the middleware. Any renewal whose reply was lost on
   cellular, or whose Set-Cookie the browser never applied, left the phone
   sending the OLD token; Supabase treats a used token sent again more than
   10 s later as theft and revokes the whole session, and the rep was back at
   the password box an hour after every sign-in.

   NOW the browser holds one random secret that NEVER changes:
     kdh_sid   "k1.<secret>" (remember on this device: 400-day cookie) or
               "k0.<secret>" (this browser session only); HttpOnly
   and the table public.kdh_sessions (migration 20261013090000) holds the
   Supabase refresh token and the latest access token for sha256(secret).
   Renewal happens server-side: the rotated refresh token is written back to
   the row, never sent to the phone, so a lost reply costs nothing -- the
   next request simply renews again from the row. The pages still get
     kdh_at    the access token the pages and the middleware read
     kdh_user  {name, role, email, title, dm, ws, upc} for the pages (ws = 'finance' for the finance workspace; upc = 1 may open the UPC audit)
   on every renewal, and the keep-alive in shared/kdh-user.js re-asks GET
   /api/session when the page's own copy runs out. When kdh_at is expired or
   missing on a page load, middleware.js sends the browser through
   GET /api/session?next=<page> first, so the cookies come from a function
   response (reliable) rather than a pass-through one.

   UNTIL THE MIGRATION HAS RUN the functions answer 404 and everything falls
   back to the 2026-10-02 cookie-held refresh token (kdh_rt). A device still
   on kdh_rt is moved to a server-held session on its next renewal.

   POST   {refresh_token, remember}  -> verifies the token by redeeming it
          (Supabase rotates it), checks the allow list, stores the session,
          sets the cookies. Same-origin only (no login CSRF).
   GET    -> renews kdh_at if it has under 10 minutes left (or is gone) and
          answers {ok, role, name}; 401 when there is nothing to renew. With
          ?next=<path> it redirects there (or to /login/) instead.
   DELETE -> ends the session (row deleted, revoked at Supabase) and clears
          every cookie (Sign out, Switch account).

   Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (same as middleware.js). */
export const config = { runtime: 'edge' };

export const KEEP_SECONDS = 400 * 24 * 3600;   // the longest a browser keeps a cookie
export const RENEW_BEFORE_MS = 10 * 60 * 1000;
const CLAIM_WAIT_MS = 1200;                     // another renewal is in flight: wait, then read again
const CACHE_MS = 5 * 60 * 1000;

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) { try { return decodeURIComponent(rest.join('=')); } catch { return rest.join('='); } }
  }
  return '';
}
export function tokenExpiry(token) {
  try {
    const json = atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch { return 0; }
}
export function tokenFresh(token, now) { return !!token && tokenExpiry(token) - (now || Date.now()) > RENEW_BEFORE_MS; }
// "k1.<value>" -> {keep:true, value}; a bare value is treated as remembered.
function parseKept(v) {
  const m = /^k([01])\.(.+)$/.exec(String(v || ''));
  return m ? { keep: m[1] === '1', token: m[2] } : (v ? { keep: true, token: String(v) } : null);
}
export const parseRt = parseKept;    // legacy kdh_rt (the refresh token itself)
export const parseSid = parseKept;   // kdh_sid (the device secret)

function cookie(name, value, { keep, httpOnly } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Secure; SameSite=Lax` + (keep ? `; Max-Age=${KEEP_SECONDS}` : '') + (httpOnly ? '; HttpOnly' : '');
}
function clear(name, httpOnly) {
  return `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax` + (httpOnly ? '; HttpOnly' : '');
}
// The cookies the pages read, for a (re)issued access token.
export function accessCookies(accessToken, me, keep) {
  return [
    cookie('kdh_at', accessToken, { keep }),
    cookie('kdh_user', JSON.stringify({ name: me.name || '', role: me.role || 'rep', email: me.email || '', title: me.title || '', dm: me.reports_to || '', ws: me.workspace || '', ...(me.upc === true || me.upc_audit === true || me.role === 'it' ? { upc: 1 } : {}) }), { keep }),
  ];
}
// A server-held session: the device secret (never rotates) + the access cookies.
export function sidCookies(secret, accessToken, me, keep) {
  return [cookie('kdh_sid', `k${keep ? 1 : 0}.${secret}`, { keep, httpOnly: true }), clear('kdh_rt', true), ...accessCookies(accessToken, me, keep)];
}
// Legacy (store not available): the rotated refresh token itself travels in kdh_rt.
export function sessionCookies(sess, me, keep) {
  return [cookie('kdh_rt', `k${keep ? 1 : 0}.${sess.refresh_token}`, { keep, httpOnly: true }), ...accessCookies(sess.access_token, me, keep)];
}
export function clearedCookies() {
  return [clear('kdh_sid', true), clear('kdh_rt', true), clear('kdh_at'), clear('kdh_user'), clear('kdh_preview')];
}

// Redeem a refresh token. Several requests of one page load can arrive at
// once with the same token; within an isolate they share one call (and
// Supabase's reuse interval covers parallel isolates).
const inflight = new Map();   // token -> {p, until}
export function refreshSession(rt, supabaseUrl, key) {
  const now = Date.now();
  for (const [k, v] of inflight) if (v.until < now) inflight.delete(k);
  const hit = inflight.get(rt);
  if (hit) return hit.p;
  // Only a definite "that token is dead" (a 4xx other than 429) may end a
  // sign-in. A rate limit, a 5xx, a dropped connection or a slow cellular
  // network is "unavailable": the caller keeps the cookie and tries again
  // (2026-10-05: a 429 used to be read as invalid and wiped the rep's
  // long-lived cookie, so they had to type everything again).
  const p = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res = null;
      try {
        res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: key, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        });
      } catch { res = null; }
      if (res && res.status !== 429 && res.status < 500) {
        let body = null; try { body = await res.json(); } catch {}
        if (res.ok && body && body.access_token && body.refresh_token) return { ok: true, session: body };
        return { ok: false, reason: res.status >= 400 ? 'invalid' : 'unavailable' };
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
    }
    return { ok: false, reason: 'unavailable' };
  })();
  // A failure that may pass is not remembered: the next request tries again.
  p.then((r) => { if (!r.ok && r.reason === 'unavailable') inflight.delete(rt); });
  inflight.set(rt, { p, until: now + 60 * 1000 });
  return p;
}
// The caller's allow-list row (row-level security returns only their own).
export async function allowRow(token, supabaseUrl, key) {
  let res;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/allowed_users?select=*&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${token}`, accept: 'application/json' },
    });
  } catch { return { ok: false, reason: 'unavailable' }; }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'invalid' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  const rows = await res.json().catch(() => null);
  const row = Array.isArray(rows) && rows[0];
  return row ? { ok: true, me: row } : { ok: false, reason: 'notlisted' };
}

/* ---- THE SESSION STORE (public.kdh_sessions through its RPCs) ---------- */

export async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function newSecret() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  let s = ''; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// A PostgREST RPC call with the publishable key (role anon, like the sign-in
// page's is_allowed). {ok, data} | {missing:true} (migration not run) |
// {unavailable:true}.
let storeMissingUntil = 0;
export async function rpc(name, args, supabaseUrl, key) {
  if (storeMissingUntil > Date.now()) return { missing: true };
  let res;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(args || {}),
    });
  } catch { return { unavailable: true }; }
  if (res.status === 404) {   // PGRST202: no such function -- the migration has not run
    storeMissingUntil = Date.now() + 60 * 1000;
    return { missing: true };
  }
  if (!res.ok) {
    // A 4xx here is a programming error (bad argument); treat it like an
    // outage so a sign-in is never ended by it.
    return { unavailable: true, status: res.status };
  }
  const text = await res.text().catch(() => '');
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  return { ok: true, data };
}
export function storeKnownMissing() { return storeMissingUntil > Date.now(); }
export function forgetStoreState() { storeMissingUntil = 0; }

// Per-isolate memory of a device's current access token, so a browser that
// keeps sending a stale kdh_at (its copy of the cookie never updated) costs
// one store read per 5 minutes, not one per request.
const sidCache = new Map();    // hash -> {token, keep, email, until}
const sidInflight = new Map(); // hash -> promise
function rememberSid(hash, token, keep, email) {
  if (sidCache.size > 5000) sidCache.clear();
  const until = Math.min(tokenExpiry(token) - RENEW_BEFORE_MS, Date.now() + CACHE_MS);
  const entry = { token, keep, email, until };
  sidCache.set(hash, entry);
  return entry;
}
export function forgetSid(hash) { sidCache.delete(hash); }

// A valid access token for the device secret, renewing through the store
// when needed. {ok:true, token, keep, email, renewed} | {ok:false, reason:
// 'revoked'|'unavailable'|'missing'}. 'missing' = the migration has not run.
export function sessionFromStore(hash, keepHint, supabaseUrl, key) {
  const now = Date.now();
  const hit = sidCache.get(hash);
  if (hit && hit.until > now) return Promise.resolve({ ok: true, token: hit.token, keep: hit.keep, email: hit.email, renewed: false });
  const going = sidInflight.get(hash);
  if (going) return going;
  const p = (async () => {
    try {
      let r = await rpc('kdh_session_get', { p_sid_hash: hash }, supabaseUrl, key);
      if (r.missing) return { ok: false, reason: 'missing' };
      if (r.unavailable) return { ok: false, reason: 'unavailable' };
      if (!r.data) return { ok: false, reason: 'revoked' };   // signed out, or never ours
      let row = r.data;
      const keep = typeof row.keep === 'boolean' ? row.keep : keepHint !== false;
      if (tokenFresh(row.access_token)) {
        rememberSid(hash, row.access_token, keep, row.email);
        return { ok: true, token: row.access_token, keep, email: row.email, renewed: false };
      }
      // Renew: claim the row (one renewal at a time), redeem, write back.
      for (let attempt = 0; attempt < 3; attempt++) {
        r = await rpc('kdh_session_get', { p_sid_hash: hash, p_claim: true }, supabaseUrl, key);
        if (r.missing) return { ok: false, reason: 'missing' };
        if (r.unavailable) return { ok: false, reason: 'unavailable' };
        if (!r.data) return { ok: false, reason: 'revoked' };
        row = r.data;
        if (tokenFresh(row.access_token)) {   // another request renewed meanwhile
          if (!row.busy) await rpc('kdh_session_release', { p_sid_hash: hash }, supabaseUrl, key);
          rememberSid(hash, row.access_token, keep, row.email);
          return { ok: true, token: row.access_token, keep, email: row.email, renewed: true };
        }
        if (row.busy || !row.refresh_token) { await new Promise((ok) => setTimeout(ok, CLAIM_WAIT_MS)); continue; }
        const f = await refreshSession(row.refresh_token, supabaseUrl, key);
        if (!f.ok) {
          if (f.reason === 'invalid') {
            // Supabase says that refresh token is dead (revoked, or the
            // session was ended elsewhere): this device has to sign in again.
            await rpc('kdh_session_delete', { p_sid_hash: hash }, supabaseUrl, key);
            return { ok: false, reason: 'revoked' };
          }
          await rpc('kdh_session_release', { p_sid_hash: hash }, supabaseUrl, key);
          return { ok: false, reason: 'unavailable' };
        }
        const s = f.session;
        const put = await rpc('kdh_session_put', { p_sid_hash: hash, p_refresh_token: s.refresh_token, p_access_token: s.access_token, p_access_exp: new Date(tokenExpiry(s.access_token) || Date.now() + 3600 * 1000).toISOString() }, supabaseUrl, key);
        if (put.ok && put.data === false) return { ok: false, reason: 'revoked' };   // signed out while renewing
        // A failed write-back is not fatal for this request: the token is
        // good now, and the next renewal reads the row again (within
        // Supabase's reuse window the same new token comes back).
        rememberSid(hash, s.access_token, keep, row.email);
        return { ok: true, token: s.access_token, keep, email: row.email, renewed: true };
      }
      return { ok: false, reason: 'unavailable' };
    } finally { sidInflight.delete(hash); }
  })();
  sidInflight.set(hash, p);
  return p;
}
// Store a freshly redeemed session for a new device secret. {secret} or
// {missing:true} / {unavailable:true}.
export async function createStored(sess, email, keep, supabaseUrl, key) {
  const secret = newSecret();
  const hash = await sha256hex(secret);
  const r = await rpc('kdh_session_create', { p_sid_hash: hash, p_email: email, p_refresh_token: sess.refresh_token, p_access_token: sess.access_token, p_access_exp: new Date(tokenExpiry(sess.access_token) || Date.now() + 3600 * 1000).toISOString(), p_keep: !!keep }, supabaseUrl, key);
  if (r.ok) { rememberSid(hash, sess.access_token, keep, email); return { secret, hash }; }
  return r;
}

/* ---- ONE RESOLUTION for a request's cookies -----------------------------
   {token, keep, cookies, hash, reason}:
     token    a usable access token (may be the request's own kdh_at)
     cookies  Set-Cookie lines the response should carry (device secret for
              a legacy device moved to the store; a cleared dead cookie)
     reason   when there is no token: 'none' (nothing to renew), 'revoked',
              'unavailable'
   The kdh_at / kdh_user cookies are added by the caller once it knows the
   allow-list row (accessCookies). */
export async function resolveSession(cookieHeader, supabaseUrl, key) {
  const at = readCookie(cookieHeader, 'kdh_at');
  const sid = parseSid(readCookie(cookieHeader, 'kdh_sid'));
  const rt = parseRt(readCookie(cookieHeader, 'kdh_rt'));
  if (tokenFresh(at)) return { token: at, keep: sid ? sid.keep : rt ? rt.keep : true, cookies: [], hash: sid ? await sha256hex(sid.token) : null, renewed: false };
  if (sid) {
    const hash = await sha256hex(sid.token);
    const s = await sessionFromStore(hash, sid.keep, supabaseUrl, key);
    if (s.ok) return { token: s.token, keep: s.keep, cookies: [], hash, renewed: s.renewed, email: s.email };
    if (s.reason === 'revoked') {
      // Dead on the server. A legacy kdh_rt beside it (the move-over
      // window) still gets its chance below.
      if (!rt) return { token: '', keep: sid.keep, cookies: [clear('kdh_sid', true)], hash, reason: 'revoked' };
    } else if (s.reason === 'unavailable') return { token: '', keep: sid.keep, cookies: [], hash, reason: 'unavailable' };
    // 'missing': the migration has not run -- the legacy path below.
    if (s.reason === 'missing' && !rt) return { token: '', keep: sid.keep, cookies: [], hash, reason: 'none' };
  }
  if (rt) {
    const f = await refreshSession(rt.token, supabaseUrl, key);
    if (!f.ok) {
      if (f.reason === 'invalid') return { token: '', keep: rt.keep, cookies: [clear('kdh_rt', true)], reason: 'revoked' };
      return { token: '', keep: rt.keep, cookies: [], reason: 'unavailable' };
    }
    // Move this device to the server-held session so the rotated token
    // never has to reach the phone again. Email is needed for the row: the
    // token carries it.
    let email = '';
    try { email = JSON.parse(atob(f.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch {}
    const made = email ? await createStored(f.session, email, rt.keep, supabaseUrl, key) : { missing: true };
    if (made.secret) {
      return { token: f.session.access_token, keep: rt.keep, cookies: [cookie('kdh_sid', `k${rt.keep ? 1 : 0}.${made.secret}`, { keep: rt.keep, httpOnly: true }), clear('kdh_rt', true)], hash: made.hash, renewed: true, moved: true };
    }
    // Store not there (yet): rotate in the cookie, as before 2026-10-13.
    return { token: f.session.access_token, keep: rt.keep, cookies: [cookie('kdh_rt', `k${rt.keep ? 1 : 0}.${f.session.refresh_token}`, { keep: rt.keep, httpOnly: true })], renewed: true, legacy: true, session: f.session };
  }
  return { token: at || '', keep: true, cookies: [], reason: at ? 'expired' : 'none' };
}
// End the device's session everywhere: the store row, Supabase, the cookies.
export async function endSession(cookieHeader, supabaseUrl, key) {
  const sid = parseSid(readCookie(cookieHeader, 'kdh_sid'));
  const rt = parseRt(readCookie(cookieHeader, 'kdh_rt'));
  let at = readCookie(cookieHeader, 'kdh_at');
  if (sid) {
    const hash = await sha256hex(sid.token);
    forgetSid(hash);
    if (!at || tokenExpiry(at) <= Date.now()) {
      const r = await rpc('kdh_session_get', { p_sid_hash: hash }, supabaseUrl, key);
      if (r.ok && r.data && r.data.access_token) at = r.data.access_token;
    }
    await rpc('kdh_session_delete', { p_sid_hash: hash }, supabaseUrl, key);
  }
  if ((!at || tokenExpiry(at) <= Date.now()) && rt) {
    const r = await refreshSession(rt.token, supabaseUrl, key);
    at = r.ok ? r.session.access_token : '';
  }
  if (at) {
    // Revoke at Supabase too, so the refresh token is dead even if a copy
    // of it survived somewhere.
    try {
      await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: key, authorization: `Bearer ${at}` } });
    } catch {}
  }
}

function reply(status, body, cookies) {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  for (const c of cookies || []) h.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers: h });
}
function redirectTo(url, to, cookies) {
  const h = new Headers({ location: new URL(to, url).toString(), 'cache-control': 'no-store' });
  for (const c of cookies || []) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}
// Only a path on this site may be a redirect target (never another host,
// never the sign-in page itself).
export function safeNext(v) {
  const s = String(v || '');
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\') || s.startsWith('/login') || s.startsWith('/api/')) return '/';
  return s;
}
function sameOrigin(request, forGet) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  const site = request.headers.get('sec-fetch-site');
  // A navigation (the ?next= hop from the middleware) arrives as "none" or
  // "same-origin"; only a cross-site GET is refused.
  if (forGet) return site !== 'cross-site';
  return !site || site === 'same-origin';
}

export default async function handler(request) {
  const supabaseUrl = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !key) return reply(503, { error: 'sign-in is not configured' });
  const url = new URL(request.url);
  const next = url.searchParams.has('next') ? safeNext(url.searchParams.get('next')) : null;
  if (!sameOrigin(request, request.method === 'GET')) return reply(403, { error: 'cross-site request refused' });
  const cookies = request.headers.get('cookie') || '';

  if (request.method === 'POST') {
    let body = null; try { body = await request.json(); } catch {}
    const given = body && typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
    if (!given) return reply(400, { error: 'refresh_token required' });
    const keep = body.remember !== false;
    const r = await refreshSession(given, supabaseUrl, key);
    if (!r.ok) return reply(r.reason === 'unavailable' ? 503 : 401, { error: r.reason });
    const a = await allowRow(r.session.access_token, supabaseUrl, key);
    if (!a.ok) return reply(a.reason === 'unavailable' ? 503 : 403, { error: a.reason }, a.reason === 'unavailable' ? [] : clearedCookies());
    // A sign-in replaces whatever this device held before.
    const old = parseSid(readCookie(cookies, 'kdh_sid'));
    if (old) { const h = await sha256hex(old.token); forgetSid(h); await rpc('kdh_session_delete', { p_sid_hash: h }, supabaseUrl, key); }
    const made = await createStored(r.session, a.me.email, keep, supabaseUrl, key);
    if (made.secret) return reply(200, { ok: true, role: a.me.role || 'rep', name: a.me.name || '', keep, stored: true }, sidCookies(made.secret, r.session.access_token, a.me, keep));
    // The store is not available (migration not run, or Supabase REST
    // down): keep the sign-in anyway, the old way.
    return reply(200, { ok: true, role: a.me.role || 'rep', name: a.me.name || '', keep, stored: false }, sessionCookies(r.session, a.me, keep));
  }

  if (request.method === 'GET') {
    const s = await resolveSession(cookies, supabaseUrl, key);
    if (!s.token) {
      if (s.reason === 'unavailable') return next ? redirectTo(url, `/login/?why=unavailable&next=${encodeURIComponent(next)}`, s.cookies) : reply(503, { error: 'unavailable' }, s.cookies);
      const why = s.reason === 'revoked' ? 'revoked' : s.reason === 'expired' ? 'expired' : '';
      const cl = s.reason === 'revoked' ? [...s.cookies, ...clearedCookies()] : s.cookies;
      return next ? redirectTo(url, `/login/?${why ? `why=${why}&` : ''}next=${encodeURIComponent(next)}`, cl) : reply(401, { error: why || 'no session' }, cl);
    }
    const a = await allowRow(s.token, supabaseUrl, key);
    if (!a.ok) {
      if (a.reason === 'unavailable') return next ? redirectTo(url, `/login/?why=unavailable&next=${encodeURIComponent(next)}`, []) : reply(503, { error: 'unavailable' });
      if (s.hash) { forgetSid(s.hash); await rpc('kdh_session_delete', { p_sid_hash: s.hash }, supabaseUrl, key); }
      return next ? redirectTo(url, `/login/?why=${a.reason}&next=${encodeURIComponent(next)}`, clearedCookies()) : reply(403, { error: a.reason }, clearedCookies());
    }
    const set = [...s.cookies, ...accessCookies(s.token, a.me, s.keep)];
    if (next) return redirectTo(url, next, [...set, 'kdh_hop=1; Path=/; Max-Age=20; Secure; SameSite=Lax']);
    return reply(200, { ok: true, role: a.me.role || 'rep', name: a.me.name || '', renewed: !!s.renewed }, set);
  }

  if (request.method === 'DELETE') {
    await endSession(cookies, supabaseUrl, key);
    return reply(200, { ok: true }, clearedCookies());
  }

  return reply(405, { error: 'method not allowed' });
}
