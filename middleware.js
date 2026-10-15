// Vercel Edge Middleware: the login gate for kohlerdisthub.com.
//
// Every request except the sign-in page (and the few public assets it
// needs) must carry a `kdh_at` cookie holding a Supabase access token
// for a user who is on the allow list (public.allowed_users). The cookie
// is set by /login/ after a magic-link sign-in.
//
// Validation is one call to Supabase's REST API with the user's token:
// row-level security means the query returns the caller's own row if
// they are on the list, nothing if they are not, and 401 if the token is
// bad or expired. Results are cached in memory per token for a few
// minutes so repeat page loads don't hit Supabase.
//
// Env (Vercel -> Settings -> Environment Variables):
//   SUPABASE_URL              https://<ref>.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  sb_publishable_...  (safe in the browser)

import { resolveSession, accessCookies, clearedCookies, tokenExpiry, rpc, forgetSid } from './api/session.js';

export const config = {
  // Everything except the sign-in page, the shared logo assets, and
  // favicons. (/shared/auth-config.js is NOT excluded: it has no file
  // behind it, the middleware itself answers it below.)
  // /api/session is excluded too: it is the sign-in hand-off itself and
  // checks the session on its own (api/session.js).
  matcher: ['/((?!login|assets/|favicon|manifest\\.webmanifest|api/session).*)'],
};

const COOKIE = 'kdh_at';
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // token -> { ok, email, role, until }

// What a REP may open (managers may open everything). Each entry is a
// path prefix; anything else sends a rep back to their landing page.
// Keep this in step with what those pages load (see supabase/README.txt).
const REP_PATHS = [
  '/kohler-korner/read/',                // read-only published newsletters (RLS; no drafts)
  '/kohler-korner/magazine-layout.js',      // read-only newsletter pagination
  '/kohler-korner/magazine-layout.css',
  '/kohler-korner/model.js',              // shared safe rendering only
  '/kohler-korner/newsletter.js',         // reader client (editor RPCs enforce permissions)
  '/kohler-korner/newsletter.css',
  '/rep/',                              // the rep landing page
  '/accounts/',                         // Accounts tab + Account page (data slices checked below)
  '/hub/',                              // Incentives & MPO Hub
  '/isellbeer/tap-survey-tracking/',    // Tap Tracker
  '/MPOs/off-prem/',                    // Off-Premise MPOs
  '/MPOs/on-prem/',                     // On-Premise MPOs
  '/MPOs/shared/',                      // guided.js / guided.css the MPO pages and hub load
  '/redbull/',                          // Red Bull Distribution Tracker
  '/carbliss-onprem-targets/',          // Carbliss On-Premise Targets
  '/carbliss-mpo/',                     // Carbliss MPO tracker (data served per rep below)
  '/incentive-tracking/assets/',       // supplier / brand logos the hub shows (reps saw initials before 2026-10-01)
  '/incentive-tracking/programs.js',    // the hub's program library ...
  '/incentive-tracking/data/program_data.js', // ... and its data
  '/shared/',                           // auth-config.js
  '/api/chat',                          // the account assistant (api/chat.js re-checks the token itself)
  '/api/geocode',                       // account map coordinates (api/geocode.js authorizes the route itself)
  '/inventory/',                        // What Can I Sell (units only -- no cost, value or margin; 2026-10-02)
  '/nonbuy/',                           // Non-Buy Reports (2026-10-08; a rep's history + book are the per-rep slices below)
  '/tasks/',                            // Field Tasks: a rep assigns work to a sales associate (2026-10-14; RLS decides the rows)
];
const REP_HOME = '/rep/';

// A SALES ASSOCIATE (allowed_users.role = 'associate', 2026-10-14) does field
// work reps hand them: displays, tap handles, POS. They may open only the
// Field Tasks page and what it loads; everything else sends them there
// (403 for a data fetch). Which tasks they see is row-level security.
const ASSOCIATE_PATHS = ['/tasks/', '/shared/'];
const ASSOCIATE_HOME = '/tasks/';
function associateMayOpen(pathname) {
  const p = pathname.split('?')[0];
  return ASSOCIATE_PATHS.some((pre) => p.startsWith(pre) || p + '/' === pre || p === pre.replace(/\/$/, '') + '/index.html');
}

// The FINANCE workspace (allowed_users.workspace = 'finance', 2026-10-15): a
// manager who handles billbacks and supplier recaps -- Alexis. They may open
// the Incentive Hub, the Incentive Tracker, both MPO trackers, Supplier
// Budgets and Incentive Performance, plus what those pages load (the Incentive
// Tracker page itself is NOT theirs -- Gavin, 2026-10-15); anything
// else sends them to the hub (403 for a data fetch). Row-level security is
// untouched: they are a manager everywhere the database is asked.
const FINANCE_PATHS = [
  '/hub/', '/MPOs/', '/supplier-budget/', '/performance/',
  '/incentive-tracking/programs.js', '/incentive-tracking/data/', '/incentive-tracking/assets/',   // what the hub loads; NOT the Incentive Tracker page (Gavin, 2026-10-15)
  '/shared/', '/carbliss-mpo/data/', '/api/',
  '/accounts/data/elig/', '/accounts/data/hist/', '/accounts/data/catalog.json', '/accounts/data/index.json', '/accounts/data/products.json',   // what the hub loads; never a rep's route or sales files
  '/rolling-distribution/data/',   // Incentive Performance probes the money / adjust months
];
const FINANCE_HOME = '/';   // the manager home, which hides every card outside the workspace for them
function financeMayOpen(pathname) {
  const p = pathname.split('?')[0];
  if (p === '/' || p === '/index.html') return true;
  return FINANCE_PATHS.some((pre) => p.startsWith(pre) || p + '/' === pre || p === pre.replace(/\/$/, '') + '/index.html');
}

// ACCOUNT DATA IS SERVED PER REP (2026-09-30). accounts/generate.py writes one
// slice per rep under /accounts/data/{book,reps,sales}/<key>..., where <key>
// is the rep's name key (canonical first name + surname, the same rule
// shared/kdh-user.js uses). A rep asking for the whole customer base
// (/hub/data/accounts.js) is rewritten to their own slice, and a request
// for another rep's slice is refused here -- so a rep's browser never
// receives another rep's accounts, whatever the page asks for. Managers
// pass through (their team scope is applied on the page, as before).
const NICK = {daniel:'dan',james:'jim',matthew:'matt',nicholas:'nick',michael:'mike',christopher:'chris',robert:'rob',william:'bill',joseph:'joe',jonathan:'jon',kenneth:'ken',timothy:'tim',thomas:'tom',richard:'rich',edward:'ed',andrew:'andy',anthony:'tony',steven:'steve',stephen:'steve',benjamin:'ben',samuel:'sam',alexander:'alex',patrick:'pat',gregory:'greg',jeffrey:'jeff',joshua:'josh',zachary:'zach',charles:'chuck',frederick:'fred',ronald:'ron',donald:'don',douglas:'doug',kevin:'kev',katherine:'kate',elizabeth:'liz',jennifer:'jen',jessica:'jess',rebecca:'becky',danielle:'dani',nicole:'nikki',alexandra:'alex',victoria:'vicky'};
function nameKey(n) {
  const parts = String(n || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (!parts.length || !parts[0]) return '';
  const first = NICK[parts[0]] || parts[0];
  const last = parts.slice(1).join('');
  return first + (last ? '-' + last : '');
}
const ACCOUNT_DATA = /^\/accounts\/data\/(book|reps|sales|elig|hist)\/([a-z0-9-]+)(\.js|\.json|\/[0-9a-z_-]+\.json)$/;
function accountDataVerdict(pathname, name) {
  if (pathname === '/accounts/data/index.json') return 'ok';
  const m = pathname.match(ACCOUNT_DATA);
  if (!m) return 'ok';                                  // not a data slice
  return m[2] === nameKey(name) && nameKey(name) ? 'ok' : 'deny';
}

// EVERY REP DATASET IS SERVED PER REP (2026-10-01). tools/rep_slices.py
// writes one copy per rep (only that rep's rows; leaderboards as counts with
// no account names) of the incentive data, the MPO month files, Red Bull's
// data.csv and the Tap Tracker / Carbliss pages (their data is embedded).
// A rep asking for the shared file is rewritten to their own copy -- the
// page's URL does not change -- and any direct request for a copy, or for a
// raw CSV / workbook, is refused. A rep whose name matches no copy gets the
// empty `_none` copy, so the page shows its own "nothing for you" note.
// The key list below is WRITTEN BY tools/rep_slices.py -- do not edit it.
/* SLICE_KEYS_START */
const SLICE_KEYS = new Set(["adam-badalamenti", "alex-rodriguez", "alisa-acciardi", "allison-scott", "andy-lundy", "brian-sengebush", "chris-payton", "chris-politano", "dan-lagala", "dave-ehlers", "default", "derrick-laws", "dylan-rubino", "hakan-sadik", "jaime-colonna", "javier-melo", "jayson-romine", "jim-heaney", "john-neukum", "john-odonoghue", "klejdi-lamo", "matt-powierski", "mike-ast", "mike-harboy", "nick-melissari", "office-tellsell", "pablo-lopez", "pat-infante", "paul-mclaughlin", "phil-ernst", "robin-feldman", "shane-barreca", "tony-palmisano"]);
/* SLICE_KEYS_END */
const SLICE_DIRS = /^\/(incentive-tracking\/data\/rep\/|MPOs\/(off|on)-prem\/data\/\d{4}-\d{2}\/rep\/|redbull\/rep\/|carbliss-mpo\/rep\/|carbliss-onprem-targets\/rep\/|isellbeer\/tap-survey-tracking\/rep\/)/;
const MPO_FILE = /^\/MPOs\/(off|on)-prem\/data\/(\d{4}-\d{2})\/([A-Za-z0-9_.-]+\.json)$/;
const RAW_FILE = /\.(csv|tsv|xlsx|xls)$/i;
function sliceKey(name) { const k = nameKey(name); return SLICE_KEYS.has(k) ? k : '_none'; }
// The URL a rep's request is served from instead (null = unchanged).
function repSlicePath(pathname, name) {
  const k = sliceKey(name);
  if (pathname === '/incentive-tracking/data/program_data.js') return `/incentive-tracking/data/rep/${k}.js`;
  const m = pathname.match(MPO_FILE);
  if (m && m[3] !== 'sync_meta.json') return `/MPOs/${m[1]}-prem/data/${m[2]}/rep/${k}/${m[3]}`;
  if (pathname === '/redbull/data.csv') return `/redbull/rep/${k}/data.csv`;
  if (pathname === '/carbliss-mpo/data/program.json') return `/carbliss-mpo/rep/${k}/program.json`;
  if (pathname === '/carbliss-onprem-targets/' || pathname === '/carbliss-onprem-targets/index.html') return `/carbliss-onprem-targets/rep/${k}/index.html`;
  if (pathname === '/isellbeer/tap-survey-tracking/' || pathname === '/isellbeer/tap-survey-tracking/index.html') return `/isellbeer/tap-survey-tracking/rep/${k}/index.html`;
  return null;
}
// What a rep may never fetch directly: another copy, a raw export, account size.
function repDenied(pathname) {
  if (SLICE_DIRS.test(pathname)) return true;
  if (pathname === '/accounts/data/size.json') return true;
  if (pathname === '/carbliss-mpo/data/final.json') return true;   // the frozen program-period snapshot holds every rep's accounts
  if (RAW_FILE.test(pathname) && pathname !== '/redbull/goals.csv') return true;
  return false;
}

function repMayOpen(pathname) {
  const p = pathname.split('?')[0];
  return REP_PATHS.some((pre) => p.startsWith(pre) || p + '/' === pre || p === pre.replace(/\/$/, '') + '/index.html');
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  // The sign-in page asks for this to learn where Supabase lives. The
  // publishable key is public by design; it is only read here so the
  // values live in Vercel's settings rather than in the repo.
  if (url.pathname === '/shared/auth-config.js') {
    const body = `window.KDH_AUTH=${JSON.stringify({ url: supabaseUrl || '', key: publishableKey || '' })};`;
    return new Response(body, {
      headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (!supabaseUrl || !publishableKey) {
    return new Response(
      'Sign-in is not configured: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are missing from this deployment.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  // STAY SIGNED IN (2026-10-02; server-held since 2026-10-13, see
  // api/session.js): the device's sign-in is the HttpOnly kdh_sid cookie
  // (a secret that never changes; the refresh token it stands for is kept
  // and renewed in public.kdh_sessions) -- or, until that migration has
  // run, the legacy kdh_rt cookie holding the refresh token itself. When
  // the access token is missing or has under 10 minutes left, renew it
  // before the check and send the fresh cookies back with whatever this
  // request gets -- so a rep is only asked to sign in after signing out.
  const cookieHeader = request.headers.get('cookie') || '';
  const at = readCookie(cookieHeader, COOKIE);
  const signedIn = !!(readCookie(cookieHeader, 'kdh_sid') || readCookie(cookieHeader, 'kdh_rt'));
  const isDoc = wantsDocument(request);
  // A PAGE LOAD whose access token is gone or expired takes one hop through
  // the session function: its response is an ordinary function reply, so
  // the renewed cookies reliably reach the browser before the page's own
  // scripts run (a pass-through response is best effort). The function
  // sends the browser back here, or to /login/ when nothing can be renewed.
  // (kdh_hop, set by that reply for 20 s, means the hop was just taken: renew
  // inline instead, so two disagreeing clocks can never bounce a page load
  // back and forth.)
  if (isDoc && signedIn && (!at || tokenExpiry(at) <= Date.now()) && request.method === 'GET' && !readCookie(cookieHeader, 'kdh_hop')) {
    return redirect(new URL(`/api/session?next=${encodeURIComponent(url.pathname + url.search)}`, url).toString());
  }
  const s = await resolveSession(cookieHeader, supabaseUrl, publishableKey);
  let verdict = s.token ? await check(s.token, supabaseUrl, publishableKey) : { ok: false };
  // Say why a page load was sent to sign-in (the page words it for the rep).
  if (!verdict.ok && verdict.reason !== 'notlisted') {
    if (s.reason === 'revoked') verdict = { ok: false, reason: 'revoked' };
    else if (s.reason === 'unavailable') verdict = { ok: false, reason: 'unavailable' };
  }
  const res = route(request, url, verdict);
  if (verdict.ok && (s.token !== at || s.cookies.length)) {
    const sets = [...s.cookies, ...accessCookies(s.token, verdict, s.keep)];
    // An API function reads the cookie from the request, so it gets the
    // renewed token too (static files don't care).
    const replace = { [COOKIE]: s.token };
    if (s.legacy) replace.kdh_rt = `k${s.keep ? 1 : 0}.${s.session.refresh_token}`;
    const fwd = url.pathname.startsWith('/api/') ? requestWithCookies(request, cookieHeader, replace) : null;
    return withHeaders(res, sets, fwd);
  }
  if (!verdict.ok && verdict.reason === 'notlisted') {
    // Off the allow list: end the device's sign-in everywhere.
    if (s.hash) { forgetSid(s.hash); await rpc('kdh_session_delete', { p_sid_hash: s.hash }, supabaseUrl, publishableKey); }
    return withHeaders(res, clearedCookies());
  }
  if (s.cookies.length) return withHeaders(res, s.cookies);   // a dead cookie cleared
  return res;
}

function wantsDocument(request) {
  return request.headers.get('sec-fetch-dest') === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');
}

function route(request, url, verdict) {
  if (verdict.ok) {
    if (verdict.role === 'manager') {
      if (verdict.workspace !== 'finance' || financeMayOpen(url.pathname)) return passThrough();
      if (!wantsDocument(request)) {
        return new Response(JSON.stringify({ error: 'not part of the finance workspace' }), {
          status: 403,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
      return redirect(new URL(FINANCE_HOME, url).toString());
    }
    if (verdict.role === 'associate') {
      if (associateMayOpen(url.pathname)) return passThrough();
      if (!wantsDocument(request)) {
        return new Response(JSON.stringify({ error: 'not available to sales associates' }), {
          status: 403,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
      return redirect(new URL(ASSOCIATE_HOME, url).toString());
    }
    // A rep: their own account slice, never anyone else's.
    if (url.pathname === '/hub/data/accounts.js') {
      const key = nameKey(verdict.name);
      if (!key) return new Response('{}', { status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      return rewrite(new URL(`/accounts/data/book/${key}.js`, url));
    }
    const slice = repSlicePath(url.pathname, verdict.name);
    if (slice) return rewrite(new URL(slice, url));
    if (repDenied(url.pathname)) {
      return new Response(JSON.stringify({ error: 'not available to reps' }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    if (accountDataVerdict(url.pathname, verdict.name) === 'deny') {
      return new Response(JSON.stringify({ error: 'not your accounts' }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    // Only the rep pages. The root index is the managers' page, so
    // a rep asking for "/" lands on /rep/ instead.
    if (repMayOpen(url.pathname)) return passThrough();
    const isDoc =
      request.headers.get('sec-fetch-dest') === 'document' ||
      (request.headers.get('accept') || '').includes('text/html');
    if (!isDoc) {
      return new Response(JSON.stringify({ error: 'not available to reps' }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    return redirect(new URL(REP_HOME, url).toString());
  }

  // A page load goes to the sign-in screen and comes back afterwards. A
  // data fetch from a page whose token expired gets a plain 401 so the
  // page can't half-render with stale data.
  const wantsHtml =
    request.headers.get('sec-fetch-dest') === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');
  if (!wantsHtml) {
    return new Response(JSON.stringify({ error: 'sign in required' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  const next = url.pathname + url.search;
  const login = new URL('/login/', url);
  if (next !== '/' && next !== '') login.searchParams.set('next', next);
  if (verdict.reason) login.searchParams.set('why', verdict.reason);
  return redirect(login.toString());
}

function redirect(to) {
  return new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } });
}
// The same response plus Set-Cookie headers (and, for an API function, the
// request's cookies replaced -- what @vercel/edge's next({request}) does).
function withHeaders(res, setCookies, fwd) {
  const h = new Headers(res.headers);
  for (const c of setCookies || []) h.append('set-cookie', c);
  if (fwd && (h.get('x-middleware-next') || h.get('x-middleware-rewrite'))) {
    const names = [];
    for (const [k, v] of fwd) { h.set('x-middleware-request-' + k, v); names.push(k); }
    h.set('x-middleware-override-headers', names.join(','));
  }
  return new Response(res.body, { status: res.status, headers: h });
}
function requestWithCookies(request, cookieHeader, replace) {
  const parts = cookieHeader.split(';').map((p) => p.trim()).filter(Boolean).filter((p) => !(p.split('=')[0] in replace));
  for (const [k, v] of Object.entries(replace)) parts.push(`${k}=${encodeURIComponent(v)}`);
  const h = new Headers(request.headers);
  h.set('cookie', parts.join('; '));
  return h;
}

// Continue to the static file. This is what @vercel/edge's next() does.
function passThrough() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
// Serve a different static file for this request (what @vercel/edge's rewrite() does).
function rewrite(absUrl) {
  return new Response(null, { headers: { 'x-middleware-rewrite': absUrl.toString(), 'cache-control': 'no-store' } });
}

function readCookie(header, name) {
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

async function check(token, supabaseUrl, publishableKey) {
  const now = Date.now();
  const hit = cache.get(token);
  if (hit && hit.until > now) return hit;

  const exp = tokenExpiry(token);
  if (!exp || exp <= now) return remember(token, { ok: false, reason: 'expired' }, now + 60 * 1000);

  let res;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/allowed_users?select=*&limit=1`, {
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    });
  } catch {
    // Supabase unreachable: fail closed but don't cache the failure.
    return { ok: false, reason: 'unavailable' };
  }
  if (res.status === 401 || res.status === 403) {
    return remember(token, { ok: false, reason: 'invalid' }, now + 60 * 1000);
  }
  if (!res.ok) return { ok: false, reason: 'unavailable' };

  const rows = await res.json();
  const row = Array.isArray(rows) && rows[0];
  if (!row) return remember(token, { ok: false, reason: 'notlisted' }, now + 60 * 1000);

  const until = Math.min(exp, now + CACHE_TTL_MS);
  return remember(token, { ok: true, email: row.email, name: row.name || '', role: row.role || 'rep', title: row.title || '', reports_to: row.reports_to || '', workspace: row.workspace || '' }, until);
}

function remember(token, verdict, until) {
  if (cache.size > 5000) cache.clear();
  const entry = { ...verdict, until };
  cache.set(token, entry);
  return entry;
}
