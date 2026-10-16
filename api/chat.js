// /api/chat -- the account assistant behind My Accounts -> Ask (2026-09-30, v2).
//
// A Vercel Edge Function. The Account page sends ONLY the customer number,
// the rep whose book it is, the page's own reading of program status and
// warehouse availability, and the conversation. Everything the model is
// allowed to treat as fact is built HERE, after authorization, from the
// same per-rep exports the middleware already serves (accounts/data/...),
// plus the rep's notes read from Supabase with the caller's own token.
//
// AUTHORIZATION (a valid sign-in is not enough):
//   1. kdh_at cookie -> allowed_users row (email, name, role), same call as
//      middleware.js. Expired / unlisted -> 401.
//   2. A REP may ask only about accounts in /accounts/data/reps/<own key>.json
//      (their assigned route; the key is derived from allowed_users.name with
//      the middleware's nameKey rule, never from the browser). Any other
//      customer number or rep -> 403.
//   3. A MANAGER names the rep. If the manager is a district manager in
//      shared/dm-groups.js, the rep must be on their team; any other
//      manager (VP, Gavin, sales support) may ask about any rep -- the same
//      rule kdhTeam() applies on every page. The account must be on that
//      rep's route file. Preview mode changes only the label; a manager is
//      authorized as a manager, exactly as the middleware sees them.
//   4. The route and sales files are fetched from this deployment's own
//      origin WITH the caller's cookies, so the middleware's per-rep rules
//      (403 on another rep's slice) apply to this function's reads as well.
//   5. Optional pilot gate: KDH_CHAT_USERS (comma-separated emails). When
//      set, only those people may use the assistant even though everyone
//      signed in can open the page.
//
// WHAT THE MODEL SEES
//   TRUSTED RECORD (server-built): identity from the route file, the
//   account's full monthly sales record through the reference month (top
//   products inline; the rest behind three tools that compute on the
//   server), buying alerts and patterns from patterns.py, the rep's notes,
//   the tap survey, and an explicit coverage statement.
//   PAGE CONTEXT (browser-supplied, labelled unverified): the page's
//   program status list and warehouse availability, because those are
//   computed by the trackers' registries and the inventory report in the
//   browser and are not part of the sales record. Capped and quoted as
//   "the app shows", never as a verified fact.
//
// TOOLS: product_history, period_totals, list_products run here on the
// full record, so sums and comparisons are application arithmetic, not
// model arithmetic. Up to MAX_ROUNDS tool rounds per question.
//
// MODEL: KDH_CHAT_MODEL (default claude-opus-5-5), effort KDH_CHAT_EFFORT
// (default low), streaming, fallbacks "default" under the beta header
// server-side-fallback-2026-07-01 (a classifier refusal is retried
// server-side on the model Anthropic recommends for that category; the
// stream's message_start names the model that served it). A manager may
// pass body.model from the MODELS allowlist to compare models.
//
// COST CONTROL: every answer is written to public.assistant_usage (tokens,
// rounds, latency, estimated USD from the MODELS price table) with the
// caller's token; kdh_assistant_quota() is read before each call and the
// function refuses when the caller passed KDH_CHAT_USER_DAILY requests
// today or everyone together passed KDH_CHAT_DAILY_USD. Migration:
// supabase/migrations/20260930210000_assistant_usage.sql. Without it the
// function answers 503 unless KDH_CHAT_NO_LEDGER=1 (dev previews only).
//
// Raw fetch, not @anthropic-ai/sdk: the site deploys with no build and no
// install step (vercel.json: framework null, installCommand null).

export const config = { runtime: 'edge' };

const API = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const BETA = 'server-side-fallback-2026-07-01';
const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_EFFORT = 'low';
// Allowed models and list prices (USD per million tokens), platform.claude.com
// -> Models overview / Pricing, read 2026-09-30. Cache write = 1.25x input
// (5-minute cache); cache read = 5% of input on Opus 5.5, 10% on Sonnet 5.5.
const MODELS = {
  'claude-opus-5-5':   { in: 4, out: 20, cacheWrite: 5,    cacheRead: 0.20, effort: true },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheWrite: 2.50, cacheRead: 0.20, effort: true },
};
const MAX_OUTPUT_TOKENS = 1500;       // short, phone-sized answers by design
const MAX_ROUNDS = 4;                 // tool rounds per question
const MAX_TURNS = 30;
const MAX_TURN_CHARS = 4000;
const MAX_PAGE_BYTES = 24 * 1024;     // the browser's program / warehouse context
const RATE = { windowMs: 10 * 60 * 1000, max: 40 };   // burst limit per user, per isolate
const rate = new Map();
const FILE_TTL_MS = 5 * 60 * 1000;    // route / sales files cached per isolate
const files = new Map();

// ---------------------------------------------------------------- prompts
// v3 (2026-10-13): a SALES ASSISTANT, not a data analyst. The analysis stays
// behind the scenes; the rep gets the answer, what to do and what to say.
// The grounding rules of v2 (record > tools > page context, no invented
// facts, no dollars, alerts are possibilities) are unchanged.
const STABLE = `You are the account assistant inside Kohler Dist Hub, the internal sales app of Kohler Distributing, a beer, wine and spirits distributor in northern New Jersey. You are a SALES ASSISTANT for one sales rep at ONE customer account: you do the analysis behind the scenes and give the rep the conclusion. Reps read you on a phone, standing in the store, and may repeat what you say to the buyer, so every answer must be short, specific and safe to repeat.

SOURCES, in order of trust
1. ACCOUNT RECORD (JSON below), built by the server from Kohler's own exports for this account: identity, the buyer's name when on file, the reference month, monthly case totals, the largest products with their last 12 months, the last 3 months' purchases (recent3), every buying alert with its evidence, the buying patterns, the rep's notes and the tap survey. Its "coverage" object says exactly what the record does and does not contain.
2. TOOLS: only the largest products are inline. For ANY other product, brand family, period total or comparison call product_history, period_totals or list_products; they compute on the complete record (every product, every month) on the server. Never estimate a number a tool can give you; never say a product was never bought unless product_history returned no match. Run product_history before answering a yes/no "do they buy X" question.
3. PAGE CONTEXT (JSON below, when present): what the app page shows right now. "opportunities" = the ranked program opportunities for THIS account (what to sell, what is still needed here, the deadline, the products that count, Kohler warehouse stock with its date); "nextActions" = the page's Next Actions; "programs" = this account's standing on every active program; warehouse availability per product. Computed by the app from the trackers, not part of the sales record: say "the tracker shows" / "the warehouse report shows (as of <date>)", never present it as an order, an invoice or a confirmed fact.

HOW TO ANSWER
- ANSWER FIRST. The first line answers the exact question. No preamble, no restating the question, no description of how you worked it out unless the rep asks. Then only the evidence that matters, as short bullets. The rep must get it in five seconds and know what to do next.
- MATCH THE QUESTION. A simple question gets a one-line answer ("Last bought Red Bull in Aug 2026 -- 3 cases."). Use the shapes below only when the question calls for them; never force a template on a simple answer.
- ONE TO THREE, RANKED. When several products or opportunities fit, give the best 1-3, best first, and end with one short line offering more ("Want the next three?"). Never list everything you know.
- SPECIFIC. Name the product as the record spells it, the month, the cases. No vague advice ("consider promoting", "analyze their patterns", "explore opportunities").
- PLAIN WORDS. Talk like an experienced beverage rep, not an analyst or a brochure: no jargon, no corporate phrasing, no headings, no tables, no emojis. Short sentences. Bold labels (**Why:**) only where they help scanning on a phone.
- FOLLOW-UPS. The conversation is about this account; "and last year?", "show more", "the second one", "what about the kegs?" refer to your previous answer. Continue it; do not repeat what you already said.

SHAPES (pick the one that fits; drop any line you cannot support from the data)
- Fact question ("when did they last buy X", "do they buy X", "what did they buy in July"): one line with the answer, the month and the cases. A second line only when an alert or a switch within the brand family changes the picture.
- What to sell / what to pitch / what to focus on: up to three items, best first, each as
  **1. <product or action>**
  **Why:** one sentence from the record or the tracker (bought it before and stopped / buys the family but not this one / the tracker lists it as a lead / past its usual reorder gap).
  **Do:** the concrete ask ("ask for one case", "put it next to the Twisted Tea 12-packs").
  **Say:** one natural sentence the rep can say to the buyer, in quotes, using only facts from the record.
- Reorder / overdue / what haven't they ordered lately: the products past their usual gap, most overdue first: product, last month bought, usual rhythm and usual order. Then one **Do:** line.
- Program / incentive / MPO ("how do I close this", "what qualifies here"): what THIS account still needs per the tracker, the counting products it does not buy yet (best fit to its history first), the deadline, and one next step. Keep this account's standing apart from the rep's overall progress.
- What should I tell the buyer / give me a pitch: 2-4 spoken sentences in quotes, built only from the record and the tracker, then one line on exactly what to ask for.
- Bigger questions (what do they usually buy, how has it changed, how is the account doing): 3-5 bullets, most important first, then one next step if there is one.

GROUNDING (what keeps an answer safe to repeat to a customer)
- Every number comes from the record or a tool result, with its month or period ("Jun-Aug 2026", "12 months through Sep 2026"). Sales are cases per product per calendar MONTH, net of returns, through the reference month: there are no invoice dates, so say "in September", never a day, an order count or "last week". Asked about last week, yesterday or a date, say in one line that the record is monthly through the reference month and answer with the latest month.
- Keep FACT apart from SUGGESTION. A fact is what the account bought. A buying alert is a POSSIBILITY to check, never a confirmed need: "may be due", "worth asking about", never "needs", "lost" or "stopped buying for good". Mark what you infer in plain words: "Suggestion:", "worth trying", "likely". The record marks likely switches within a brand family; mention them.
- Recommend only what the data supports: a product the account bought before, a product in a brand family it buys, a product the tracker lists for a program here, or a reorder the alerts show; say which. Never invent purchases, quantities, dates, prices, deals, stock, promotions, or what the buyer said or wants; a buyer's interest exists only when the rep's notes record it.
- Never say a product is in stock now. Warehouse figures are Kohler's warehouse at the report date; give the date, and past 7 days say it may have changed. Never promise an incentive will be completed or credited; say what the tracker shows is still needed.
- Program facts (credited, lead, eligible, deadline, what counts) come only from PAGE CONTEXT. The products that COUNT are opportunities[].products / programs[].productsThatCount; never suggest a product for a program outside that rule (e.g. a variety pack for a program that counts named styles). The rep's overall progress is the tracker's number; do not recompute it. Never imply one account finishes a program unless PAGE CONTEXT says so.
- Short history (one or two buying months, an account new in the record): say so instead of reading a pattern into it. Seasonal: only the record's seasonal products with their months; under two years of history the season cannot be confirmed.
- Not in the data (coverage.notInData): say so in one short line and move on; when it matters, say where it lives (Encompass, the page's Contact section, the Photos page). Never guess contacts, hours, prices, deals, invoices, balances, shelf stock, delivery dates, the reason an account stopped, other accounts, area trends or comparable stores. You cannot see photos. No dollar figures anywhere; Kohler keeps money off rep pages.
- What the account bought from Kohler is not sell-through and not what is on the shelf today; never claim either.
- Do not repeat the period and the load date at the end; the app prints them under every answer.
- Pitch requests: build from what the account actually buys and what the tracker lists as a lead; label inferred lines as suggestions.`;

// A hint from the rep's wording, appended to the prompt per question (not
// cached). The model still reads the question itself; the hint only makes
// the shape consistent for the common asks.
const INTENTS = [
  ['more',      /^(show|see|give|list)?\s*(me\s+)?(more|the next|another|next three|next 3|others|rest)\b|\bwhat else\b/i],
  ['talk',      /\b(tell|say|pitch|talking points?|open(ing|er)|how (do|should|would) i (present|frame|position)|script|words)\b/i],
  ['program',   /\b(incentive|mpo|program|qualif|close\b(?! (the sale|the deal|him|her|them))|credit|count(s)? toward|deadline|eligible)/i],
  ['reorder',   /\b(reorder|re-order|overdue|due|haven['’]?t (they |we )?(ordered|bought|taken)|not ordered|stopped|lapsed|slipp|fallen off|missing)\b/i],
  ['priority',  /\b(focus|priorit|today|this visit|first|game ?plan|where (do|should) i start)\b/i],
  ['sell',      /\b(what (should|can|could|do) i sell|sell (here|them|this account)|what to sell|recommend|suggest|opportunit|new (sku|product|item|placement)|bring in|add|expand|grow)\b/i],
  ['recent',    /\b(recent|lately|last (week|month|time|order|visit)|latest|this month|last few)\b/i],
  ['fact',      /\b(when|how (much|many|often)|do(es)? (they|this account|it) (buy|carry|take|order)|did they|have they|ever)\b/i],
  ['summary',   /\b(usually|typically|overview|summary|about this account|how (is|are) (they|this account) doing|changed|trend)\b/i],
];
const INTENT_TEXT = {
  more:     'The rep asked for MORE of your previous answer: continue the same list from where it stopped (the next 1-3 items), same shape, nothing repeated.',
  talk:     'The rep wants WORDS FOR THE BUYER: 2-4 spoken sentences in quotes built only from the record and the tracker, then one line on exactly what to ask for.',
  program:  'This is a PROGRAM question: what THIS account still needs per the tracker, the counting products it does not buy yet (best fit first), the deadline, one next step; the rep\'s overall progress stays separate.',
  reorder:  'This is a REORDER / OVERDUE question: the products past their usual gap, most overdue first (product, last month bought, usual rhythm and order), then one Do: line. Use list_products filter "alert" or "stopped" if the inline alerts are not enough.',
  priority: 'This is a PRIORITIES question: the top 2-3 things to do at this account, best first, each with Why / Do / Say, drawn from nextActions, opportunities, the alerts and the notes.',
  sell:     'This is a WHAT-TO-SELL question: 1-3 specific products, best first, each with Why / Do / Say, supported by the record or the tracker; end with one line offering more.',
  recent:   'This is a RECENT PURCHASES question: the latest month on record and what was bought in the last 1-3 months (recent3, or period_totals), products and cases, nothing else.',
  fact:     'This is a FACT question: one line with the answer, month and cases (run product_history first when a product is named). Add a second line only if an alert or a switch changes the picture.',
  summary:  'This is a SUMMARY question: 3-5 bullets, most important first, then one next step if there is one.',
};
export function intentOf(text) {
  const t = String(text || '').trim();
  for (const [k, re] of INTENTS) if (re.test(t)) return k;
  return '';
}

const PITCH = `You are now in MOCK PITCH mode: you play the buyer at this account (the owner, manager or beverage buyer of the ACCOUNT RECORD's account) while the rep practises a pitch on you. Stay in character as the buyer until the rep asks for feedback or to stop.
Grounding rules
- Everything you say about what this account buys, dropped, buys less of, has on tap, its size, premise and service type, and the rep's own notes must come from the record (use the tools when the rep names a product not in it). Say it as the buyer would ("we tried that and it sat", "we're already full on hard tea").
- Everything else about the buyer's situation -- mood, time pressure, a competitor's visit, shelf space, a slow week -- is a SIMULATED objection. Keep it plausible for this kind of account and do not present it as something the real customer said or did.
- NEVER invent prices, margins, deals, inventory numbers, competitor facts, supplier promises or customer quotes. Object to price only in words ("that's more than I want to pay"), never with a figure. If the rep states a price, deal or stock level, you may accept or doubt it, but do not confirm it as true.
- Approved product information is what the record and PAGE CONTEXT carry (product names, packages, brand families, program asks, warehouse availability as of its date, sell-sheet links). Do not add product claims of your own.
- Raise realistic objections one or two at a time; concede when the rep answers well; push back when they are vague. Keep each reply to 1-3 sentences, spoken, no bullet points, no coaching, no narration.
- If the rep says something wrong about the account's own history, react as the buyer would ("no, we stopped ordering that in the spring") -- the record is the truth.
- If the rep writes "feedback", "stop", "how did I do" or similar, drop the character and give the feedback described under FEEDBACK.`;

const FEEDBACK = `FEEDBACK: the practice pitch is over. Step out of character and coach the rep in under 200 words, in this order: (1) what worked; (2) up to five specific improvements -- clarity, the questions they asked, how they handled each objection, whether they used the account's real history from the record, how they closed; (3) one rewritten opening line they could use at this account, built only from the record and PAGE CONTEXT. Mark any objection you invented during the pitch as simulated ("the 'cooler is full' objection was simulated") so the rep does not carry it into the store as a fact. Plain words, short bullets, no scores out of ten, no dollars.`;

const TOOLS = [
  { name: 'product_history',
    description: 'Look up products this account has bought from Kohler by name, brand family or Kohler product number (case-insensitive substring). Returns up to 8 matches with every buying month and cases, yearly totals, first and last month, and the alert on it if any. Use it whenever the rep names a product or brand, or asks whether something was ever bought.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Part of a product name, brand family or product number, e.g. "Corona Extra", "Twisted Tea", "2412".' } }, required: ['query'] } },
  { name: 'period_totals',
    description: 'Total cases this account bought in a range of months (inclusive, YYYY-MM), optionally for one brand family or supplier only: cases per month, products bought, top products in the range, and the same-length period just before and the same months a year earlier, all computed on the complete record.',
    input_schema: { type: 'object', properties: { from: { type: 'string', description: 'First month, YYYY-MM.' }, to: { type: 'string', description: 'Last month, YYYY-MM.' }, family: { type: 'string', description: 'Optional brand family or supplier name to restrict to (substring).' } }, required: ['from', 'to'] } },
  { name: 'list_products',
    description: 'Page through every product on this account\'s record: sort by 12-month cases, most recent purchase or name; filter to products that stopped (were regular, not bought well past their gap), new placements (first bought in the last 6 months), products on alert, or a brand family. 40 per page.',
    input_schema: { type: 'object', properties: { sort: { type: 'string', enum: ['cases12', 'recent', 'name'] }, filter: { type: 'string', enum: ['all', 'stopped', 'new', 'alert'] }, family: { type: 'string', description: 'Optional brand family or supplier (substring).' }, offset: { type: 'integer', minimum: 0 } } } },
];

// ---------------------------------------------------------------- helpers
export function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
export function readCookie(header, name) {
  const m = String(header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; }
}
function tokenExpiry(token) {
  try {
    const part = String(token).split('.')[1];
    const pad = part.replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(atob(pad)).exp;
    return exp ? exp * 1000 : null;
  } catch { return null; }
}
// Same check as middleware.js: the caller's own allowed_users row, or nothing.
export async function whoIs(token, supabaseUrl, publishableKey) {
  if (!token) return null;
  const exp = tokenExpiry(token);
  if (!exp || exp <= Date.now()) return null;
  let res;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/allowed_users?select=email,name,role&limit=1`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${token}`, accept: 'application/json' },
    });
  } catch { return null; }
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
function overRate(key) {
  const now = Date.now();
  const r = rate.get(key) || { from: now, n: 0 };
  if (now - r.from > RATE.windowMs) { r.from = now; r.n = 0; }
  r.n += 1; rate.set(key, r);
  return r.n > RATE.max;
}
// Only what the prompt needs from the request, with hard caps.
function cleanMessages(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const m of list.slice(-MAX_TURNS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    const text = m.content.trim().slice(0, MAX_TURN_CHARS);
    if (!text) continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n' + text;   // the API wants alternating roles
    else out.push({ role: m.role, content: text });
  }
  if (!out.length || out[0].role !== 'user') return null;
  if (out[out.length - 1].role !== 'user') return null;
  return out;
}

// MIRROR of middleware.js nameKey() (and shared/kdh-user.js): canonical first
// name + surname. scratchpad chat_api_test.mjs fails if the two drift apart.
const NICK = {daniel:'dan',james:'jim',matthew:'matt',nicholas:'nick',michael:'mike',christopher:'chris',robert:'rob',william:'bill',joseph:'joe',jonathan:'jon',kenneth:'ken',timothy:'tim',thomas:'tom',richard:'rich',edward:'ed',andrew:'andy',anthony:'tony',steven:'steve',stephen:'steve',benjamin:'ben',samuel:'sam',alexander:'alex',patrick:'pat',gregory:'greg',jeffrey:'jeff',joshua:'josh',zachary:'zach',charles:'chuck',frederick:'fred',ronald:'ron',donald:'don',douglas:'doug',kevin:'kev',katherine:'kate',elizabeth:'liz',jennifer:'jen',jessica:'jess',rebecca:'becky',danielle:'dani',nicole:'nikki',alexandra:'alex',victoria:'vicky'};
export function nameKey(n) {
  const parts = String(n || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (!parts.length || !parts[0]) return '';
  const first = NICK[parts[0]] || parts[0];
  const last = parts.slice(1).join('');
  return first + (last ? '-' + last : '');
}

// ================================================================ DATA SOURCE
// The one place the assistant reads account data. Today it is the static
// per-rep exports this deployment already serves (StaticExportSource). A
// Snowflake- or database-backed source implements the same five methods
// and nothing else in this file changes:
//   dmGroups()                    -> [{dm, reps:[names], under?}]
//   repIndex()                    -> [{rep, key}]
//   route(repKey)                 -> {rep, key, book, sales, taps, accounts:[row]} or null
//   account(repKey, n)            -> the account's sales record or null
//   notes(n, repName)             -> rep_actions rows for this account (caller's token)
// Every read carries the caller's cookies / token so the middleware and
// Supabase RLS keep enforcing their own rules underneath this one.
export function StaticExportSource(request, env, token) {
  const origin = new URL(request.url).origin;
  const cookie = request.headers.get('cookie') || '';
  async function file(path, kind) {
    const url = origin + path;
    const key = (kind === 'shared' ? '' : cookie.slice(0, 64) + '|') + url;   // per-caller cache for per-rep slices
    const hit = files.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    let res;
    try { res = await fetch(url, { headers: { cookie, accept: 'application/json, text/javascript' }, redirect: 'manual' }); } catch { return null; }
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    let value;
    try { value = kind === 'js' ? await res.text() : (ct.includes('json') || path.endsWith('.json')) ? await res.json() : await res.text(); } catch { return null; }
    if (files.size > 200) files.clear();
    files.set(key, { value, until: Date.now() + FILE_TTL_MS });
    return value;
  }
  return {
    name: 'static-exports',
    async dmGroups() {
      const text = await file('/shared/dm-groups.js', 'js');
      if (!text) return null;
      const i = text.indexOf('window.KDH_DM_GROUPS');
      if (i < 0) return null;
      const src = text.slice(text.indexOf('=', i) + 1).replace(/;\s*$/, '').trim();
      try {
        // object-literal -> JSON: quote bare keys, turn 'single' strings into
        // JSON strings while leaving "double" ones (John O'Donoghue) alone,
        // drop trailing commas
        const jsonish = src.replace(/"(?:[^"\\]|\\.)*"|'((?:[^'\\]|\\.)*)'|(\{|,)\s*([A-Za-z_]\w*)\s*:/g, (m, sq, pre, key) => key !== undefined ? `${pre}"${key}":` : sq !== undefined ? JSON.stringify(sq) : m).replace(/,\s*([\]}])/g, '$1');
        const g = JSON.parse(jsonish);
        return Array.isArray(g) ? g : null;
      } catch { return null; }
    },
    async repIndex() { const idx = await file('/accounts/data/index.json', 'shared'); return idx && Array.isArray(idx.reps) ? idx : null; },
    async route(repKey) { return /^[a-z0-9-]+$/.test(repKey) ? file(`/accounts/data/reps/${repKey}.json`) : null; },
    // account size (class + decile): a managers-only file since 2026-10-01; the middleware refuses it to a rep
    async size() { return file('/accounts/data/size.json'); },
    async account(repKey, n) { return /^[a-z0-9-]+$/.test(repKey) && /^\d+$/.test(String(n)) ? file(`/accounts/data/sales/${repKey}/${n}.json`) : null; },
    async notes(n, repName) {
      try {
        const q = `${env.supabaseUrl}/rest/v1/rep_actions?select=program_id,status,note,updated_at,rep_name&account_num=eq.${encodeURIComponent(String(n))}&rep_name=eq.${encodeURIComponent(repName)}&order=updated_at.desc&limit=50`;
        const res = await fetch(q, { headers: { apikey: env.publishableKey, authorization: `Bearer ${token}`, accept: 'application/json' } });
        if (!res.ok) return [];
        const rows = await res.json();
        return Array.isArray(rows) ? rows : [];
      } catch { return []; }
    },
    // the buyer's name from account_contacts (RLS: the caller's own token, the
    // same read the page's Contact section makes); name only -- phone and
    // email stay on the page
    async contact(n) {
      try {
        const q = `${env.supabaseUrl}/rest/v1/account_contacts?select=contact_name&customer_num=eq.${encodeURIComponent(String(n))}&limit=1`;
        const res = await fetch(q, { headers: { apikey: env.publishableKey, authorization: `Bearer ${token}`, accept: 'application/json' } });
        if (!res.ok) return null;
        const rows = await res.json();
        const name = Array.isArray(rows) && rows[0] && String(rows[0].contact_name || '').trim();
        return name ? name.slice(0, 80) : null;
      } catch { return null; }
    },
  };
}

// A district manager sees their own team (and groups filed under them);
// every other manager sees everyone (null). Same rule as kdhTeam().
export function teamFor(managerName, groups) {
  if (!Array.isArray(groups)) return null;
  const me = nameKey(managerName);
  const mine = groups.find(g => nameKey(g.dm) === me);
  if (!mine) return null;
  const set = new Set((mine.reps || []).map(nameKey));
  groups.filter(g => g.under && nameKey(g.under) === me).forEach(g => (g.reps || []).forEach(r => set.add(nameKey(r))));
  return set;
}

// ================================================================ THE RECORD
const r1 = v => Math.round((v || 0) * 10) / 10;
function monLabel(k) { const [y, m] = String(k || '').split('-'); const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return m ? `${M[+m - 1]} ${y}` : String(k || ''); }
const sum = (arr, a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) s += arr[i] || 0; return s; };

// Everything the tools and the packet compute from: one account's sales file
// ([num, name, family, supplier, pkg, series]) + the route row.
function makeRecord(row, sales, route) {
  const months = (sales && sales.months) || (route.sales && route.sales.months) || [];
  const N = months.length;
  const F = (sales && sales.findings) || {};
  const alerts = Array.isArray(F.alerts) ? F.alerts : [];
  const alertBy = new Map(alerts.map(a => [String(a.pn), a]));
  const products = ((sales && sales.products) || []).map(p => {
    const s = p[5] || []; let li = -1, fi = -1;
    for (let i = N - 1; i >= 0; i--) if (s[i] > 0) { li = i; break; }
    for (let i = 0; i < N; i++) if (s[i] > 0) { fi = i; break; }
    return { num: String(p[0]), name: p[1], family: p[2], supplier: p[3], pkg: p[4], series: s,
      cases12: r1(sum(s, N - 12, N)), months12: s.slice(Math.max(0, N - 12)).filter(v => v > 0).length, buying: s.filter(v => v > 0).length,
      last: li >= 0 ? months[li] : null, first: fi >= 0 ? months[fi] : null, alert: alertBy.get(String(p[0])) || null };
  });
  return { row, months, N, F, alerts, products, series: (sales && sales.series) || [], taps: (sales && sales.taps) || [], ref: F.ref || (route.sales && route.sales.ref) || months[N - 1] || null, route };
}

function packetFor(R, viewer, notes, meta) {
  const { row, months, N, F, products, series } = R;
  const P = F.patterns || null;
  const lab12 = months.slice(Math.max(0, N - 12));
  const last12 = arr => arr.slice(Math.max(0, N - 12)).map(r1);
  const top = [...products].sort((a, b) => b.cases12 - a.cases12);
  const inline = top.filter((p, i) => i < 30 || p.alert).slice(0, 45);
  const trim = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : arr;
  // seasonal products carry the calendar months they were bought in, so "what
  // sells here in the fall" needs no tool round
  const byName = new Map(products.map(p => [p.name, p]));
  const monthsOfYear = name => { const p = byName.get(name); if (!p) return undefined; const s = new Set(); p.series.forEach((v, i) => { if (v > 0) s.add(+months[i].slice(5)); }); return [...s].sort((a, b) => a - b); };
  const seasonal = Array.isArray(P && P.seasonal) ? P.seasonal.slice(0, 10).map(x => Object.assign({}, x, { monthsOfYear: monthsOfYear(x.product) })) : P && P.seasonal;
  const patterns = P ? Object.assign({}, P, { topProducts: trim(P.topProducts, 15), topFamilies: trim(P.topFamilies, 10), newPlacements: trim(P.newPlacements, 10), sizeChanges: trim(P.sizeChanges, 10), stopped: trim(P.stopped, 15), seasonal, consistent: trim(P.consistent, 15), families: undefined }) : null;
  // the last 3 months, product by product: the answer to "what did they buy lately"
  const lab3 = months.slice(Math.max(0, N - 3));
  const recent3 = products.map(p => ({ name: p.name, pkg: p.pkg, cases3: r1(sum(p.series, N - 3, N)), byMonth: lab3.map((m, i) => [m, r1(p.series[N - 3 + i] || 0)]).filter(x => x[1] > 0) })).filter(p => p.cases3 > 0).sort((a, b) => b.cases3 - a.cases3).slice(0, 20);
  const t = row.taps;
  let taps = null;
  if (t && t.last) {
    const days = Math.round((Date.now() - new Date(t.last + 'T12:00:00Z').getTime()) / 86400000);
    taps = { lastSurvey: t.lastDisplay || t.last, daysSince: days, resurvey: days > 60 ? 'overdue (60-day rule)' : days >= 53 ? 'due soon' : 'ok', handlesOurs: t.ours, handlesTheirs: t.them, unverified: t.unv,
      brands: R.taps.slice(0, 25).map(b => ({ brand: b.b, side: b.s, handles: b.n })), earlierSurveys: t.passes > 1 ? t.passes - 1 : 0 };
  } else if (row.prem === 'On') taps = { note: 'on-premise account with no tap survey on file' };
  const premise = row.prem === 'On' ? 'On-premise' : row.prem === 'Off' ? 'Off-premise' : '';
  return {
    v: 2, source: 'server-built from Kohler exports', rep: R.route.rep, viewer,
    account: { n: row.n, name: row.name, city: row.city, county: row.county, area: row.area, premise, service: row.service || null, address: row.address || null, buyer: meta.contact || null, sizeClass: viewer.role === 'manager' ? row.sizeClass || null : null, decile: viewer.role === 'manager' ? row.decile || null : null, stops2026: row.stops2026, distributionPoints2026: row.distPts, cases2026: row.cases2026, inSalesRecord: !!(products.length) },
    coverage: {
      record: products.length ? `every product this account bought from Kohler, cases per calendar month, ${monLabel(months[0])} – ${monLabel(months[N - 1])} (${N} months), net of returns; ${products.length} products on record` : 'no sales rows for this account in the loaded months',
      inline: products.length ? `"products" below lists the ${inline.length} largest of the last 12 months (plus every product on alert); the other ${Math.max(0, products.length - inline.length)} are reachable only through the tools` : 'nothing inline',
      referenceMonth: R.ref, referenceMonthLabel: monLabel(R.ref), salesLoaded: (R.route.sales && R.route.sales.loaded || '').slice(0, 10), bookAsOf: R.route.book && R.route.book.asOf, tapsAsOf: (R.route.taps && R.route.taps.asOf || '').slice(0, 10),
      grain: 'cases per product per calendar month; no invoice dates, no order counts, no dollars',
      notInData: [
        (meta.contact ? 'phone and email (on the page\'s Contact section), ' : 'contact name, phone, email (the page\'s Contact section when on file), ') + 'business hours, delivery instructions, next delivery date (Encompass)',
        'invoices, invoice dates, dollar amounts, prices, deals, promotions, payouts',
        'accounts receivable, balances, credits, aging',
        'retailer shelf stock, backorders, pre-orders, customer allocations',
        'other accounts, area-wide or comparable-account trends',
        'days between orders, number of orders (sales are monthly totals)',
        'why an account stopped or slowed (the data shows the gap, not the reason)',
      ],
    },
    monthlyCases: lab12.map((m, i) => [m, last12(series)[i]]),
    recent3: { months: lab3, note: 'every product bought in the last 3 months of the record, cases by month, largest first (top 20)', products: recent3 },
    productsOnRecord: products.length,
    products: inline.map(p => ({ num: p.num, name: p.name, family: p.family, supplier: p.supplier, pkg: p.pkg, cases12: p.cases12, months12: p.months12, lastMonth: p.last, last12: last12(p.series), alert: p.alert ? p.alert.type : undefined, warehouse: meta.warehouse ? meta.warehouse[p.num] : undefined })),
    alerts: R.alerts.slice(0, 25),
    alertCounts: F.counts || null,
    patterns,
    notes: notes.map(r => ({ status: r.status, program: r.program_id, note: r.note || '', date: (r.updated_at || '').slice(0, 10) })),
    openFollowUps: notes.filter(r => r.status === 'follow').length,
    taps,
  };
}

// ---------------------------------------------------------------- tools
const CAP = 12 * 1024;
const capJson = obj => { let s = JSON.stringify(obj); if (s.length > CAP) s = s.slice(0, CAP - 30) + '"...(truncated)"]}'; return s; };
const monthsOf = (R, s) => { const o = {}; R.months.forEach((m, i) => { if (s[i]) o[m] = r1(s[i]); }); return o; };
function runTool(R, name, input) {
  input = input && typeof input === 'object' ? input : {};
  const { months, N, products } = R;
  const q = String(input.query || input.family || '').trim().toLowerCase();
  const match = (p, s) => !s || p.name.toLowerCase().includes(s) || String(p.family || '').toLowerCase().includes(s) || String(p.supplier || '').toLowerCase().includes(s) || p.num === s;
  if (!products.length) return { error: 'no sales record for this account in the loaded months' };
  if (name === 'product_history') {
    if (!q) return { error: 'query is required' };
    const hits = products.filter(p => match(p, q)).sort((a, b) => b.cases12 - a.cases12);
    const years = p => { const o = {}; months.forEach((m, i) => { const y = m.slice(0, 4); o[y] = r1((o[y] || 0) + (p.series[i] || 0)); }); return o; };
    return { query: input.query, matches: hits.length, showing: Math.min(8, hits.length), referenceMonth: R.ref, note: hits.length ? 'cases per calendar month, net of returns; months not listed had no purchase' : 'no product on this account\'s record matches -- it was not bought from Kohler in the loaded months (or is spelled differently)',
      products: hits.slice(0, 8).map(p => ({ num: p.num, name: p.name, family: p.family, supplier: p.supplier, pkg: p.pkg, first: p.first, last: p.last, buyingMonths: p.buying, cases12: p.cases12, months12: p.months12, byYear: years(p), byMonth: monthsOf(R, p.series), alert: p.alert || undefined })) };
  }
  if (name === 'period_totals') {
    const a = months.indexOf(String(input.from || '')), b = months.indexOf(String(input.to || ''));
    if (a < 0 || b < 0 || b < a) return { error: `from/to must be months in the record, ${months[0]} to ${months[N - 1]}, from <= to` };
    const fam = String(input.family || '').trim().toLowerCase();
    const pool = fam ? products.filter(p => match(p, fam)) : products;
    const range = (lo, hi) => { if (lo < 0 || hi > N) return null; const byMonth = {}; let total = 0; const bought = new Set(); const per = [];
      for (let i = lo; i < hi; i++) { let m = 0; pool.forEach(p => { const v = p.series[i] || 0; if (v > 0) bought.add(p.num); m += v; }); byMonth[months[i]] = r1(m); total += m; }
      pool.forEach(p => { const c = sum(p.series, lo, hi); if (c > 0) per.push({ name: p.name, cases: r1(c) }); });
      per.sort((x, y) => y.cases - x.cases);
      return { from: months[lo], to: months[hi - 1], totalCases: r1(total), productsBought: bought.size, byMonth, topProducts: per.slice(0, 10) }; };
    const len = b - a + 1;
    return { filter: fam || 'all products', period: range(a, b + 1), priorPeriod: range(a - len, a), sameMonthsLastYear: range(a - 12, b + 1 - 12), note: 'priorPeriod = the same number of months just before; sameMonthsLastYear = the same calendar months one year earlier; null when the record does not reach' };
  }
  if (name === 'list_products') {
    const fam = String(input.family || '').trim().toLowerCase();
    let pool = fam ? products.filter(p => match(p, fam)) : products.slice();
    const f = input.filter || 'all';
    const P = R.F.patterns || {};
    if (f === 'stopped') { const s = new Set((P.stopped || []).map(x => x.product)); pool = pool.filter(p => s.has(p.name)); }
    if (f === 'new') pool = pool.filter(p => p.first && months.indexOf(p.first) >= N - 6);
    if (f === 'alert') pool = pool.filter(p => p.alert);
    const sort = input.sort || 'cases12';
    pool.sort(sort === 'name' ? (x, y) => x.name.localeCompare(y.name) : sort === 'recent' ? (x, y) => String(y.last || '').localeCompare(String(x.last || '')) || y.cases12 - x.cases12 : (x, y) => y.cases12 - x.cases12);
    const off = Math.max(0, parseInt(input.offset, 10) || 0);
    return { filter: f, family: fam || undefined, sort, total: pool.length, offset: off, showing: Math.min(40, Math.max(0, pool.length - off)),
      products: pool.slice(off, off + 40).map(p => ({ num: p.num, name: p.name, family: p.family, cases12: p.cases12, months12: p.months12, first: p.first, last: p.last, alert: p.alert ? p.alert.type : undefined })) };
  }
  return { error: 'unknown tool' };
}

// ---------------------------------------------------------------- Claude
// One streaming request in two steps: open() resolves when the upstream
// headers arrive (so an upstream 429 / 5xx can still become an HTTP status
// on the very first round), read() forwards text deltas as they stream and
// returns the assembled content blocks (thinking blocks included, verbatim,
// so a tool round can replay them), stop reason, model and usage.
async function claudeOpen(env, body) {
  const upstream = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.apiKey, 'anthropic-version': API_VERSION, 'anthropic-beta': BETA },
    body: JSON.stringify(body),
  });
  if (!upstream.ok || !upstream.body) {
    let detail = '';
    try { detail = (await upstream.json()).error?.message || ''; } catch {}
    return { httpStatus: upstream.status, detail: detail.slice(0, 200) };
  }
  return { upstream };
}
async function claudeCall(env, body, onText, onError) {
  const o = await claudeOpen(env, body);
  return o.httpStatus ? o : claudeRead(o.upstream, onText, onError);
}
async function claudeRead(upstream, onText, onError) {
  const reader = upstream.body.getReader(), dec = new TextDecoder();
  const blocks = []; const partial = [];
  let buf = '', stop = null, stopDetails = null, model = null;
  const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = frame.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.type === 'message_start' && ev.message) {
        model = ev.message.model || null;
        const u = ev.message.usage || {};
        usage.input += u.input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0;
      } else if (ev.type === 'content_block_start') {
        blocks[ev.index] = Object.assign({}, ev.content_block); partial[ev.index] = '';
        if (blocks[ev.index].type === 'text') blocks[ev.index].text = blocks[ev.index].text || '';
        if (blocks[ev.index].type === 'thinking') blocks[ev.index].thinking = blocks[ev.index].thinking || '';
      } else if (ev.type === 'content_block_delta' && ev.delta) {
        const b = blocks[ev.index]; if (!b) continue;
        const d = ev.delta;
        if (d.type === 'text_delta' && d.text) { b.text = (b.text || '') + d.text; onText(d.text); }
        else if (d.type === 'input_json_delta') partial[ev.index] += d.partial_json || '';
        else if (d.type === 'thinking_delta') b.thinking = (b.thinking || '') + (d.thinking || '');
        else if (d.type === 'signature_delta') b.signature = d.signature;
      } else if (ev.type === 'content_block_stop') {
        const b = blocks[ev.index];
        if (b && b.type === 'tool_use') { try { b.input = partial[ev.index] ? JSON.parse(partial[ev.index]) : (b.input || {}); } catch { b.input = {}; b.badInput = true; } }
      } else if (ev.type === 'message_delta') {
        if (ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
        if (ev.delta && ev.delta.stop_details) stopDetails = ev.delta.stop_details;
        if (ev.usage && ev.usage.output_tokens != null) usage.output = ev.usage.output_tokens;   // cumulative for the message
      } else if (ev.type === 'error') onError((ev.error && ev.error.message) || 'The assistant hit an error.');
    }
  }
  return { blocks: blocks.filter(Boolean), stop, stopDetails, model, usage };
}

function estUsd(model, u) {
  const p = MODELS[model] || MODELS[DEFAULT_MODEL];
  return Math.round((u.input * p.in + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead + u.output * p.out) / 1e6 * 1e6) / 1e6;
}

// ---------------------------------------------------------------- ledger
async function quota(env, token) {
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/kdh_assistant_quota`, { method: 'POST', headers: { apikey: env.publishableKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }, body: '{}' });
    if (res.status === 404) return { missing: true };
    if (!res.ok) return { error: res.status };
    const q = await res.json();
    const row = Array.isArray(q) ? q[0] : q;
    return row || { error: 'empty' };
  } catch { return { error: 'unreachable' }; }
}
async function ledger(env, token, row) {
  try {
    await fetch(`${env.supabaseUrl}/rest/v1/assistant_usage`, { method: 'POST', headers: { apikey: env.publishableKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(row) });
  } catch {}
}

// ================================================================ HANDLER
// AVAILABILITY (2026-10-04): GET answers whether this caller can ask right
// now, BEFORE the page accepts a question -- {ok, code, msg} plus, for a
// manager only, `setup`: the exact step that fixes it. It never returns a
// secret or any part of one, and it spends nothing (no model call).
const SETUP = {
  no_key: 'In Vercel: open the kohlerdisthub project → Settings → Environment Variables → Add New. Key: ANTHROPIC_API_KEY. Value: an API key from console.anthropic.com → API Keys (paste it only into Vercel — never into chat, email or the code). Environments: Production (and Preview if you test there). Save, then Deployments → the latest Production deployment → ⋯ → Redeploy. Environment variables only reach a deployment built after they are saved.',
  no_auth: 'In Vercel → Settings → Environment Variables, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (the same ones the sign-in page uses), then Redeploy.',
  bad_model: 'In Vercel → Settings → Environment Variables, set KDH_CHAT_MODEL to claude-opus-5-5 or claude-sonnet-5-5 (or delete it to use the default), then Redeploy.',
  not_pilot: 'The assistant is limited to the emails in KDH_CHAT_USERS (Vercel → Settings → Environment Variables). Add this person’s email to that comma-separated list, or delete the variable to open it to everyone signed in, then Redeploy.',
  no_ledger: 'Run supabase/migrations/20260930210000_assistant_usage.sql in Supabase → SQL Editor (paste the file, Run). It creates the usage ledger the daily limits read.',
  ledger_down: 'The usage ledger (Supabase) did not answer. Check status.supabase.com; nothing to change in the app.',
};
async function availability(request, env) {
  const out = (code, msg, extra) => ({ ok: !code, code: code || 'ok', msg, ...(extra || {}) });
  // sign-in is checked FIRST, so a manager gets the setup step for a missing key
  if (!env.supabaseUrl || !env.publishableKey) return { r: out('no_auth', 'The assistant is not set up on this site yet.') };
  const token = readCookie(request.headers.get('cookie'), 'kdh_at');
  const who = await whoIs(token, env.supabaseUrl, env.publishableKey);
  if (!who) return { status: 401, r: out('signin', 'Sign in again to use the assistant.') };
  if (!env.apiKey) return { who, r: out('no_key', 'The assistant is not set up on this site yet.') };
  if (!MODELS[env.model]) return { who, r: out('bad_model', 'The assistant is not set up correctly on this site.') };
  const email = String(who.email || '').toLowerCase();
  if (env.users.length && !env.users.includes(email)) return { who, r: out('not_pilot', 'The assistant is in a pilot and your account is not in it yet.') };
  if (env.noLedger) return { who, r: out('', 'Available.', { limits: false }) };
  const q = await quota(env, token);
  if (q.missing) return { who, r: out('no_ledger', 'The assistant is not set up on this site yet.') };
  if (q.error) return { who, r: out('ledger_down', 'The assistant cannot check today’s usage right now. Try again in a minute.') };
  const left = Math.max(0, env.userDaily - (q.user_requests_today || 0));
  if (!left) return { who, r: out('limit', `You have reached today's limit of ${env.userDaily} questions.`, { left: 0 }) };
  if ((Number(q.all_usd_today) || 0) >= env.dailyUsd) return { who, r: out('spend', 'The assistant has reached today\'s limit for everyone. It resets at midnight UTC.') };
  return { who, r: out('', 'Available.', { left, perDay: env.userDaily }) };
}

export default async function handler(request) {
  if (request.method !== 'POST' && request.method !== 'GET') return json(405, { error: 'GET or POST only' });
  try { return await handle(request); }
  catch (e) {
    // never a bare platform 500: the page shows this detail to managers
    return json(500, { error: 'The assistant could not answer right now.', detail: 'function error: ' + String(e && e.message || e).slice(0, 200) });
  }
}
async function handle(request) {
  const env = { apiKey: process.env.ANTHROPIC_API_KEY, supabaseUrl: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    model: process.env.KDH_CHAT_MODEL || DEFAULT_MODEL, effort: process.env.KDH_CHAT_EFFORT || DEFAULT_EFFORT,
    users: String(process.env.KDH_CHAT_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    userDaily: parseInt(process.env.KDH_CHAT_USER_DAILY, 10) || 60, dailyUsd: parseFloat(process.env.KDH_CHAT_DAILY_USD) || 20,
    noLedger: process.env.KDH_CHAT_NO_LEDGER === '1' };
  if (request.method === 'GET') {
    const a = await availability(request, env);
    const body = Object.assign({}, a.r);
    // the fix is shown to managers; with sign-in itself unconfigured nobody can be identified, and the step holds no secret
    if (!a.r.ok && SETUP[a.r.code] && ((a.who && a.who.role === 'manager') || a.r.code === 'no_auth')) body.setup = SETUP[a.r.code];
    return json(a.status || 200, body);
  }
  if (!env.apiKey) return json(503, { error: 'The assistant is not configured yet (ANTHROPIC_API_KEY is missing from this deployment).' });
  if (!env.supabaseUrl || !env.publishableKey) return json(503, { error: 'Sign-in is not configured.' });
  if (!MODELS[env.model]) return json(503, { error: `KDH_CHAT_MODEL "${env.model}" is not in this function's model list.` });

  // 1. who is asking
  const token = readCookie(request.headers.get('cookie'), 'kdh_at');
  const who = await whoIs(token, env.supabaseUrl, env.publishableKey);
  if (!who) return json(401, { error: 'Sign in again to use the assistant.' });
  const email = String(who.email || '').toLowerCase();
  if (env.users.length && !env.users.includes(email)) return json(403, { error: 'The assistant is in a pilot; your account is not in it yet.' });
  if (overRate(email || 'anon')) return json(429, { error: 'Too many questions in a short time. Give it a few minutes.' });

  // 2. the request
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Bad request body.' }); }
  if (body.v !== 2) return json(400, { error: 'Reload the page to get the current assistant.' });
  const mode = body.mode === 'pitch' || body.mode === 'feedback' ? body.mode : 'ask';
  const n = Number.isInteger(body.account) ? body.account : parseInt(body.account, 10);
  if (!Number.isInteger(n) || n <= 0) return json(400, { error: 'No account number.' });
  const repName = typeof body.rep === 'string' ? body.rep.trim().slice(0, 80) : '';
  const messages = cleanMessages(body.messages);
  if (!messages) return json(400, { error: 'The conversation must end with the rep\'s message.' });
  // the page's own reading: program standing, warehouse availability and (v3)
  // the ranked opportunities + Next Actions the Account page already shows
  let page = body.page && typeof body.page === 'object' ? { opportunities: Array.isArray(body.page.opportunities) ? body.page.opportunities.slice(0, 8) : [], nextActions: Array.isArray(body.page.nextActions) ? body.page.nextActions.slice(0, 4) : [], credited: Array.isArray(body.page.credited) ? body.page.credited.slice(0, 6) : [], programs: Array.isArray(body.page.programs) ? body.page.programs.slice(0, 40) : [], warehouse: body.page.warehouse && typeof body.page.warehouse === 'object' ? body.page.warehouse : null, warehouseAsOf: body.page.warehouseAsOf || null } : null;
  if (page && JSON.stringify(page).length > MAX_PAGE_BYTES) page = { opportunities: page.opportunities.slice(0, 5), nextActions: page.nextActions.slice(0, 3), credited: page.credited.slice(0, 3), programs: page.programs.slice(0, 12), warehouse: null, warehouseAsOf: null, truncated: true };
  let model = env.model;
  if (typeof body.model === 'string' && body.model !== model) {
    if (who.role !== 'manager' || !MODELS[body.model]) return json(403, { error: 'Only a manager may choose a model, and only from the allowed list.' });
    model = body.model;
  }

  // 3. authorization: the account must be on a route this caller may see
  const src = StaticExportSource(request, env, token);
  let repKey;
  if (who.role === 'manager') {
    if (!repName) return json(400, { error: 'A manager must name the rep whose account this is.' });
    repKey = nameKey(repName);
    const team = teamFor(who.name, await src.dmGroups());
    if (team && !team.has(repKey)) return json(403, { error: 'That rep is not on your team.' });
    const idx = await src.repIndex();
    if (!idx || !idx.reps.some(r => r.key === repKey)) return json(403, { error: 'No such rep in the account data.' });
  } else {
    repKey = nameKey(who.name);
    if (!repKey) return json(403, { error: 'We could not match your name to a route.' });
    if (repName && nameKey(repName) !== repKey) return json(403, { error: 'You can only ask about your own accounts.' });
  }
  const route = await src.route(repKey);
  if (!route || !Array.isArray(route.accounts)) return json(403, { error: 'We could not find that route in the account data.' });
  let row = route.accounts.find(a => Number(a.n) === n);
  if (!row) return json(403, { error: 'That account is not on this route.' });
  if (who.role === 'manager' && src.size) {
    const sizes = await src.size();
    const sz = sizes && sizes[String(n)];
    if (sz) row = Object.assign({}, row, sz);
  }
  const routeRep = route.rep || repName || who.name;

  // 4. the record and the caller's notes, from trusted sources
  const [sales, notes, contact] = await Promise.all([src.account(repKey, n), src.notes(n, routeRep), src.contact ? src.contact(n) : null]);
  const R = makeRecord(row, sales, route);
  const viewer = { name: who.name || 'a Kohler user', role: who.role || 'rep' };
  const packet = packetFor(R, viewer, notes, { warehouse: page && page.warehouse, contact });

  // 5. spend limits
  let q = null;
  if (!env.noLedger) {
    q = await quota(env, token);
    if (q.missing) return json(503, { error: 'The assistant\'s usage ledger is not set up (run supabase/migrations/20260930210000_assistant_usage.sql).' });
    if (q.error) return json(502, { error: 'The usage ledger is unreachable; try again in a minute.' });
    if ((q.user_requests_today || 0) >= env.userDaily) return json(429, { error: `You have reached today's limit of ${env.userDaily} questions.` });
    if ((Number(q.all_usd_today) || 0) >= env.dailyUsd) return json(429, { error: 'The assistant has reached today\'s spending limit for everyone. It resets at midnight UTC.' });
  }

  // 6. the prompt
  const system = [{ type: 'text', text: STABLE, cache_control: { type: 'ephemeral' } }];
  if (mode === 'pitch') system.push({ type: 'text', text: PITCH });
  if (mode === 'feedback') system.push({ type: 'text', text: PITCH + '\n\n' + FEEDBACK });
  let ctx = `Signed in: ${viewer.name} (${viewer.role}${viewer.preview ? ', ' + viewer.preview : ''}). Rep on this account: ${routeRep}.\n\nACCOUNT RECORD (trusted, server-built):\n${JSON.stringify(packet)}`;
  if (page && (page.programs.length || page.warehouse || page.opportunities.length || page.nextActions.length)) ctx += `\n\nPAGE CONTEXT (what the app page shows; computed by the app, not part of the sales record):\n${JSON.stringify({ opportunities: page.opportunities.length ? page.opportunities : undefined, opportunitiesNote: page.opportunities.length ? 'ranked as the page ranks them: tracker leads first, then the soonest deadline; products[] = the counting products sellable here, largest warehouse stock first, as [name, package, units at Kohler\'s warehouse, stock status]; open[] = counting products not yet credited here' : 'the page lists no program opportunity for this account right now', credited: page.credited.length ? page.credited : undefined, nextActions: page.nextActions.length ? page.nextActions : undefined, programs: page.programs, warehouseAsOf: page.warehouseAsOf, warehouseNote: page.warehouse ? 'warehouse availability per product is in products[].warehouse as [available units, status]' : 'no warehouse data on the page', truncated: page.truncated })}`;
  system.push({ type: 'text', text: ctx, cache_control: { type: 'ephemeral' } });
  // per-question shape hint (after the cached blocks, so it never breaks the cache)
  const intent = mode === 'ask' ? intentOf(messages[messages.length - 1].content) : '';
  if (intent && INTENT_TEXT[intent]) system.push({ type: 'text', text: `SHAPE HINT for the rep's latest message (from its wording; the message itself decides): ${INTENT_TEXT[intent]}` });
  const base = { model, max_tokens: MAX_OUTPUT_TOKENS, stream: true, fallbacks: 'default', system, tools: TOOLS };
  if (MODELS[model].effort) base.output_config = { effort: env.effort };

  // 7. open the first round before the response does, so an upstream 429 /
  // 5xx keeps an HTTP status; the body streams live once the response opens
  const enc = new TextEncoder();
  const t0 = Date.now();
  const meta = { ref: R.ref, refLabel: monLabel(R.ref), months: [R.months[0], R.months[R.N - 1]], salesLoaded: packet.coverage.salesLoaded, productsOnRecord: R.products.length, productsInline: packet.products.length, source: src.name, model };
  const turn = messages.slice();
  const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  const opened = await claudeOpen(env, Object.assign({}, base, { messages: turn }));
  if (opened.httpStatus) {
    const status = opened.httpStatus === 429 ? 429 : 502;
    return json(status, { error: opened.httpStatus === 429 ? 'The assistant is busy right now. Try again in a minute.' : 'The assistant could not answer right now.', detail: 'Claude API HTTP ' + opened.httpStatus + (opened.detail ? ': ' + opened.detail : '') });
  }

  const stream = new ReadableStream({
    async start(c) {
      const send = obj => { try { c.enqueue(enc.encode('data: ' + JSON.stringify(obj) + '\n\n')); } catch {} };
      const onText = t => send({ t }), onError = e => send({ error: e });
      send({ meta });
      let res = await claudeRead(opened.upstream, onText, onError), rounds = 1, sentText = false, stop = null, servedBy = null;
      const toolsUsed = [];
      try {
        while (true) {
          for (const k of Object.keys(usage)) usage[k] += res.usage[k] || 0;
          servedBy = res.model || servedBy;
          stop = res.stop;
          if (res.blocks.some(b => b.type === 'text' && b.text)) sentText = true;
          if (stop !== 'tool_use' || rounds >= MAX_ROUNDS) break;
          const calls = res.blocks.filter(b => b.type === 'tool_use');
          if (!calls.length) break;
          const results = calls.map(b => { const out = b.badInput ? { error: 'malformed tool input' } : runTool(R, b.name, b.input); toolsUsed.push({ tool: b.name, input: b.input }); send({ tool: b.name, input: b.input }); return { type: 'tool_result', tool_use_id: b.id, content: capJson(out) }; });
          turn.push({ role: 'assistant', content: res.blocks.filter(b => b.type !== 'fallback').map(b => { const o = Object.assign({}, b); delete o.badInput; return o; }) });
          turn.push({ role: 'user', content: results });
          rounds += 1;
          res = await claudeCall(env, Object.assign({}, base, { messages: turn }), onText, onError);
          if (res.httpStatus) { send({ error: res.httpStatus === 429 ? 'The assistant is busy right now. Try again in a minute.' : 'The assistant could not finish that answer.', detail: 'HTTP ' + res.httpStatus + (res.detail ? ': ' + res.detail : '') }); stop = 'error'; break; }
        }
        if (stop === 'tool_use') send({ t: '\n\n(I ran out of lookups for that one — ask a narrower question.)' });
        if (stop === 'refusal' && !sentText) send({ t: 'I can’t help with that one here. Ask about this account’s buying, programs or how to pitch it.' });
        if (stop === 'max_tokens') send({ t: '\n\n(That answer was cut short — ask a narrower question for the rest.)' });
        const ms = Date.now() - t0;
        send({ done: true, stop: stop || 'end_turn', usage: Object.assign({ rounds, ms, model: servedBy || model, fellBack: !!(servedBy && servedBy !== model) }, usage), tools: toolsUsed.map(t => t.tool) });
        if (!env.noLedger) await ledger(env, token, { account_num: String(n), rep_name: routeRep, mode, model: servedBy || model, requested_model: model, input_tokens: usage.input, cache_write_tokens: usage.cacheWrite, cache_read_tokens: usage.cacheRead, output_tokens: usage.output, rounds, ms, stop: stop || 'end_turn', est_usd: estUsd(servedBy && MODELS[servedBy] ? servedBy : model, usage), tools: toolsUsed.map(t => t.tool).join(',') || null });
      } catch (e) {
        send({ error: 'The connection to the assistant dropped.', detail: 'function error: ' + String(e && e.message || e).slice(0, 200) });
      } finally {
        try { c.close(); } catch {}
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
