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

export const config = {
  // Everything except the sign-in page, the shared logo assets, and
  // favicons. (/shared/auth-config.js is NOT excluded: it has no file
  // behind it, the middleware itself answers it below.)
  matcher: ['/((?!login|assets/|favicon).*)'],
};

const COOKIE = 'kdh_at';
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // token -> { ok, email, role, until }

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

  const token = readCookie(request.headers.get('cookie') || '', COOKIE);
  const verdict = token ? await check(token, supabaseUrl, publishableKey) : { ok: false };

  if (verdict.ok) return passThrough();

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
  return Response.redirect(login.toString(), 302);
}

// Continue to the static file. This is what @vercel/edge's next() does.
function passThrough() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

function readCookie(header, name) {
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function tokenExpiry(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function check(token, supabaseUrl, publishableKey) {
  const now = Date.now();
  const hit = cache.get(token);
  if (hit && hit.until > now) return hit;

  const exp = tokenExpiry(token);
  if (!exp || exp <= now) return remember(token, { ok: false, reason: 'expired' }, now + 60 * 1000);

  let res;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/allowed_users?select=email,name,role&limit=1`, {
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
  return remember(token, { ok: true, email: row.email, role: row.role || 'rep' }, until);
}

function remember(token, verdict, until) {
  if (cache.size > 5000) cache.clear();
  const entry = { ...verdict, until };
  cache.set(token, entry);
  return entry;
}
