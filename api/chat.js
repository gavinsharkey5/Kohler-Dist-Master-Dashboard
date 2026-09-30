// /api/chat -- the account assistant behind My Accounts (2026-09-30).
//
// A Vercel Edge Function. The Account page builds a CONTEXT PACKET from the
// data it already holds for one account (identity, sales history through
// the reference month, buying alerts and patterns, this account's program
// status, the rep's notes, taps, warehouse availability) and posts it here
// with the conversation. This function checks the caller is signed in,
// caps the payload, wraps the packet in the Kohler system prompt for the
// requested mode and streams Claude's answer back as Server-Sent Events.
//
// Why raw fetch and not @anthropic-ai/sdk: this site deploys with no build
// and no install step (vercel.json: framework null, installCommand null),
// so a dependency cannot be bundled. The Messages API is one POST; the
// request shape below follows the current API reference (anthropic-version
// 2023-06-01, streaming events message_start / content_block_delta /
// message_delta / message_stop).
//
// Env (Vercel -> Settings -> Environment Variables):
//   ANTHROPIC_API_KEY         server-only; never in the repo, never sent to the browser
//   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   the same two the middleware uses
//
// Access: the middleware already gates every request (a rep must have
// '/api/chat' in REP_PATHS). This function re-checks the kdh_at cookie
// against allowed_users anyway, so a mis-set matcher never exposes the key.
// The packet is whatever the caller's browser could already load -- the
// middleware serves a rep only their own account slices -- and nothing
// here reads data on its own, so the function cannot widen access.

export const config = { runtime: 'edge' };

const MODEL = 'claude-opus-5-5';
const API = 'https://api.anthropic.com/v1/messages';
const MAX_PACKET_BYTES = 80 * 1024;   // the page keeps packets around 20-40 KB
const MAX_TURNS = 30;
const MAX_TURN_CHARS = 4000;
const MAX_OUTPUT_TOKENS = 1500;       // short, phone-sized answers by design
const RATE = { windowMs: 10 * 60 * 1000, max: 40 };   // per signed-in user, per isolate
const rate = new Map();

const STABLE = `You are the account assistant inside Kohler Dist Hub, the internal sales app of Kohler Distributing, a beer, wine and spirits distributor in northern New Jersey. You help one sales rep with ONE customer account at a time. The account's data is in the ACCOUNT PACKET (JSON) that follows these instructions.

How to answer
- Use only the packet. It is the complete set of facts you have: the reference month, monthly case history by product, buying alerts and patterns, this account's status on the rep's active programs, the rep's notes, tap survey, warehouse availability and the list of what is NOT in the data.
- Every number you state must come from the packet or be simple arithmetic on it, and say the period it covers ("in Jun-Aug 2026", "through Aug 2026"). Sales are cases per product per MONTH, net of returns, through the reference month; there are no invoice dates, so speak in months, never days.
- When something is not in the packet (contacts, hours, prices, invoices, balances, retailer shelf stock, why an account stopped, other accounts' data), say so in one short sentence and, if the packet's "notInData" list names where it lives, say that. Never guess or fill in.
- A buying alert is a POSSIBILITY to check, never a confirmed need: say "may be due" / "worth asking about", never "needs" or "lost". Distinguish a product gap from the brand family still selling (the packet marks likely switches).
- No dollar figures. Kohler keeps money off rep pages; if asked, say prices and payouts are not on this page.
- Program facts (credited, lead, eligible, deadline, what qualifies) come from the packet's programs list; the rep's overall progress is the tracker's number, do not recompute it.
- Comparable accounts, area trends and seasonality across the market are not in this packet; you can only speak to THIS account's history. Say so when asked.
- Be brief and scannable for a phone in a store: lead with the answer, then 2-5 short bullets of evidence, then one concrete next step if there is one. Plain words, no headings, no tables, no preamble. Use the product names as the packet spells them.
- If the rep asks for a pitch, build it from what the account actually buys and what is on its program lists, and label anything you infer as a suggestion.`;

const PITCH = `You are now in MOCK PITCH mode: you play the buyer at this account (the owner, manager or beverage buyer of the ACCOUNT PACKET's account) while the rep practises a pitch on you. Stay in character as the buyer until the rep asks for feedback or to stop.
- Ground your character in the packet: what the account buys and how often, products it dropped or buys less, what is on tap, its size and premise, the rep's own notes. Refer to those facts as the buyer would ("we tried that and it sat", "we're already full on hard tea").
- Raise realistic objections, one or two at a time: price and margin (in words, no figures), shelf or cooler space, slow movers, delivery timing, a competitor already in, "come back next month". Concede when the rep answers well; push back when they are vague.
- Keep each reply to 1-3 sentences, spoken, no bullet points, no coaching, no narration. This is practice: any detail you invent about the buyer's situation is a PRACTICE SCENARIO, and you may say so if asked.
- If the rep says something wrong about the account's own history, react as the buyer would ("no, we stopped ordering that in the spring") -- the packet is the truth.
- If the rep writes "feedback", "stop", "how did I do" or similar, drop the character and give the feedback described under FEEDBACK.`;

const FEEDBACK = `FEEDBACK: the practice pitch is over. Step out of character and coach the rep in under 200 words: what worked, then up to five specific improvements on clarity, the questions they asked, how they handled each objection, whether they used the account's real facts from the packet, and how they closed. Finish with one rewritten opening line they could use at this account. Plain words, short bullets, no scores out of ten, no dollars.`;

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function readCookie(header, name) {
  const m = String(header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
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
async function whoIs(token, supabaseUrl, publishableKey) {
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

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL, publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!apiKey) return json(503, { error: 'The assistant is not configured yet (ANTHROPIC_API_KEY is missing from this deployment).' });
  if (!supabaseUrl || !publishableKey) return json(503, { error: 'Sign-in is not configured.' });

  const who = await whoIs(readCookie(request.headers.get('cookie'), 'kdh_at'), supabaseUrl, publishableKey);
  if (!who) return json(401, { error: 'Sign in again to use the assistant.' });
  if (overRate(who.email || 'anon')) return json(429, { error: 'Too many questions in a short time. Give it a few minutes.' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Bad request body.' }); }
  const mode = body.mode === 'pitch' || body.mode === 'feedback' ? body.mode : 'ask';
  const packet = body.account;
  if (!packet || typeof packet !== 'object' || !packet.account || !packet.account.name) return json(400, { error: 'No account packet.' });
  const packetText = JSON.stringify(packet);
  if (packetText.length > MAX_PACKET_BYTES) return json(413, { error: 'Account packet too large.' });
  const messages = cleanMessages(body.messages);
  if (!messages) return json(400, { error: 'The conversation must end with the rep\'s message.' });

  // system: stable instructions (cached), the mode's extra rules, then the
  // account packet (cached per account across the conversation's turns).
  const system = [
    { type: 'text', text: STABLE, cache_control: { type: 'ephemeral' } },
  ];
  if (mode === 'pitch') system.push({ type: 'text', text: PITCH });
  if (mode === 'feedback') system.push({ type: 'text', text: PITCH + '\n\n' + FEEDBACK });
  system.push({ type: 'text', text: `Signed in: ${who.name || 'a Kohler user'} (${who.role || 'rep'}). Rep on this account: ${packet.rep || 'unknown'}.\n\nACCOUNT PACKET:\n${packetText}`, cache_control: { type: 'ephemeral' } });

  const upstream = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      fallbacks: 'default',                 // a safety decline re-runs on Anthropic's recommended model
      output_config: { effort: 'low' },     // chat: short answers, fast
      system,
      messages,
    }),
  });
  if (!upstream.ok || !upstream.body) {
    let detail = '';
    try { detail = (await upstream.json()).error?.message || ''; } catch {}
    const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 502;
    return json(status, { error: upstream.status === 429 ? 'The assistant is busy right now. Try again in a minute.' : 'The assistant could not answer right now.', detail: detail.slice(0, 200) });
  }

  // Re-emit only the text deltas and the end of the turn as our own SSE
  // stream: data: {"t":"..."} per chunk, then data: {"done":true,"stop":"end_turn"}.
  const enc = new TextEncoder(), dec = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buf = '', stop = null, sentText = false;
      const send = (obj) => controller.enqueue(enc.encode('data: ' + JSON.stringify(obj) + '\n\n'));
      try {
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
            if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta' && ev.delta.text) { sentText = true; send({ t: ev.delta.text }); }
            else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
            else if (ev.type === 'error') send({ error: (ev.error && ev.error.message) || 'The assistant hit an error.' });
          }
        }
        if (stop === 'refusal' && !sentText) send({ t: 'I can’t help with that one here. Ask about this account’s buying, programs or how to pitch it.' });
        if (stop === 'max_tokens') send({ t: '\n\n(That answer was cut short — ask a narrower question for the rest.)' });
        send({ done: true, stop: stop || 'end_turn' });
      } catch (e) {
        send({ error: 'The connection to the assistant dropped.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
