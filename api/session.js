/* Stay signed in (2026-10-02): the server keeps the session, not the browser.

   Gavin: reps were annoyed at typing their email and password again and
   again. The cause: the only long-lived part of a sign-in (Supabase's
   refresh token) lived in the sign-in page's localStorage, so every time
   the hour-long access token ran out the rep was bounced to /login/, and
   anything that lost that storage -- Safari's 7-day limit on cookies and
   storage written by page scripts, an iPhone home-screen app's separate
   jar, a cleared browser -- meant typing it all again.

   Now /login/ hands the session to this function once, right after the
   password (or code) is accepted, and the server holds it in cookies it
   sets itself:
     kdh_rt    the refresh token, HttpOnly (page scripts cannot read it),
               prefixed "k1." (remember on this device: 400-day cookie) or
               "k0." (this browser session only: no Max-Age)
     kdh_at    the access token the pages and the middleware read
     kdh_user  {name, role, email, title, dm} for the pages
   middleware.js renews kdh_at from kdh_rt on any request whose access
   token is missing or has under 10 minutes left, so a rep stays signed in
   on that device until they sign out (Supabase refresh tokens do not
   expire unless the project sets a session time-box).

   POST   {refresh_token, remember}  -> verifies the token by redeeming it
          (Supabase rotates it), checks the allow list with the new access
          token, sets the three cookies. Same-origin only (no login CSRF).
   GET    -> renews kdh_at if it has under 10 minutes left (or is gone) and
          answers {ok, role, name}; 401 when there is nothing to renew. The
          pages' keep-alive (shared/kdh-user.js) and /login/ call it.
   DELETE -> revokes the session at Supabase and clears every cookie
          (Sign out, Switch account).

   Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (same as middleware.js). */
export const config = { runtime: 'edge' };

export const KEEP_SECONDS = 400 * 24 * 3600;   // the longest a browser keeps a cookie
export const RENEW_BEFORE_MS = 10 * 60 * 1000;

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
// "k1.<token>" -> {keep:true, token}; a bare token is treated as remembered.
export function parseRt(v) {
  const m = /^k([01])\.(.+)$/.exec(String(v || ''));
  return m ? { keep: m[1] === '1', token: m[2] } : (v ? { keep: true, token: String(v) } : null);
}
function cookie(name, value, { keep, httpOnly } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Secure; SameSite=Lax` + (keep ? `; Max-Age=${KEEP_SECONDS}` : '') + (httpOnly ? '; HttpOnly' : '');
}
function clear(name, httpOnly) {
  return `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax` + (httpOnly ? '; HttpOnly' : '');
}
// Every Set-Cookie a renewed session needs.
export function sessionCookies(sess, me, keep) {
  return [
    cookie('kdh_rt', `k${keep ? 1 : 0}.${sess.refresh_token}`, { keep, httpOnly: true }),
    cookie('kdh_at', sess.access_token, { keep }),
    cookie('kdh_user', JSON.stringify({ name: me.name || '', role: me.role || 'rep', email: me.email || '', title: me.title || '', dm: me.reports_to || '' }), { keep }),
  ];
}
export function clearedCookies() {
  return [clear('kdh_rt', true), clear('kdh_at'), clear('kdh_user'), clear('kdh_preview')];
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
    res = await fetch(`${supabaseUrl}/rest/v1/allowed_users?select=email,name,role,title,reports_to&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${token}`, accept: 'application/json' },
    });
  } catch { return { ok: false, reason: 'unavailable' }; }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'invalid' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  const rows = await res.json().catch(() => null);
  const row = Array.isArray(rows) && rows[0];
  return row ? { ok: true, me: row } : { ok: false, reason: 'notlisted' };
}

function reply(status, body, cookies) {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  for (const c of cookies || []) h.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers: h });
}
function sameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  const site = request.headers.get('sec-fetch-site');
  return !site || site === 'same-origin';
}

export default async function handler(request) {
  const supabaseUrl = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !key) return reply(503, { error: 'sign-in is not configured' });
  if (!sameOrigin(request)) return reply(403, { error: 'cross-site request refused' });
  const cookies = request.headers.get('cookie') || '';
  const rt = parseRt(readCookie(cookies, 'kdh_rt'));

  if (request.method === 'POST') {
    let body = null; try { body = await request.json(); } catch {}
    const given = body && typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
    if (!given) return reply(400, { error: 'refresh_token required' });
    const keep = body.remember !== false;
    const r = await refreshSession(given, supabaseUrl, key);
    if (!r.ok) return reply(r.reason === 'unavailable' ? 503 : 401, { error: r.reason });
    const a = await allowRow(r.session.access_token, supabaseUrl, key);
    if (!a.ok) return reply(a.reason === 'unavailable' ? 503 : 403, { error: a.reason }, a.reason === 'unavailable' ? [] : clearedCookies());
    return reply(200, { ok: true, role: a.me.role || 'rep', name: a.me.name || '', keep }, sessionCookies(r.session, a.me, keep));
  }

  if (request.method === 'GET') {
    const at = readCookie(cookies, 'kdh_at');
    if (at && tokenExpiry(at) - Date.now() > RENEW_BEFORE_MS) {
      const a = await allowRow(at, supabaseUrl, key);
      if (a.ok) return reply(200, { ok: true, role: a.me.role || 'rep', name: a.me.name || '', renewed: false });
      if (a.reason === 'unavailable') return reply(503, { error: 'unavailable' });
      if (!rt) return reply(401, { error: a.reason });
    }
    if (!rt) return reply(401, { error: 'no session' });
    const r = await refreshSession(rt.token, supabaseUrl, key);
    if (!r.ok) return reply(r.reason === 'unavailable' ? 503 : 401, { error: r.reason }, r.reason === 'unavailable' ? [] : [clear('kdh_rt', true)]);
    const a = await allowRow(r.session.access_token, supabaseUrl, key);
    if (!a.ok) return reply(a.reason === 'unavailable' ? 503 : 403, { error: a.reason }, a.reason === 'unavailable' ? [] : clearedCookies());
    return reply(200, { ok: true, role: a.me.role || 'rep', name: a.me.name || '', renewed: true }, sessionCookies(r.session, a.me, rt.keep));
  }

  if (request.method === 'DELETE') {
    // End the session at Supabase too, so the refresh token is dead even
    // if a copy of the cookie survived somewhere.
    let at = readCookie(cookies, 'kdh_at');
    if ((!at || tokenExpiry(at) <= Date.now()) && rt) {
      const r = await refreshSession(rt.token, supabaseUrl, key);
      at = r.ok ? r.session.access_token : '';
    }
    if (at) {
      try {
        await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: key, authorization: `Bearer ${at}` } });
      } catch {}
    }
    return reply(200, { ok: true }, clearedCookies());
  }

  return reply(405, { error: 'method not allowed' });
}
