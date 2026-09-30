/api -- Vercel Edge Functions behind kohlerdisthub.com
====================================================

chat.js   The ACCOUNT ASSISTANT behind My Accounts -> Ask (2026-09-30).
          POST /api/chat  {mode:'ask'|'pitch'|'feedback', account:<packet>,
                           messages:[{role, content}, ...]}
          -> text/event-stream of  data: {"t":"..."}  chunks, then
             data: {"done":true,"stop":"end_turn"}   (or data: {"error":"..."})

HOW IT WORKS
  The Account page builds a CONTEXT PACKET from the data it already holds
  (accounts/accounts.js buildPacket: identity, reference month, monthly
  cases, top products with their last 12 months, every buying alert with
  its evidence, buying patterns, this account's status on the rep's active
  programs, the rep's notes, the tap survey, warehouse availability for
  the products it buys, and a list of what is NOT in the data). The
  function wraps that packet in the Kohler system prompt for the mode and
  calls the Claude Messages API (model claude-opus-5-5, streaming, effort
  low, fallbacks "default" so a safety decline re-runs on Anthropic's
  recommended model, prompt caching on the stable instructions and on the
  packet), then re-emits only the text as our own SSE stream.
  The function never reads account data itself: it can only talk about
  what the caller's browser could already load, and the middleware serves
  a rep only their own slices. It re-checks the kdh_at cookie against
  allowed_users (same call as middleware.js) before spending a token, caps
  the packet (80 KB), the turns (30) and each turn (4,000 chars), and
  rate-limits per user (40 requests / 10 min per isolate).
  Raw fetch, not @anthropic-ai/sdk: this site deploys with no build and no
  install step (vercel.json: framework null, installCommand null), so a
  package cannot be bundled.

MODES
  ask       questions about this account's buying, alerts, programs, taps,
            what to pitch. Rules in STABLE: only the packet, always the
            period, alerts are possibilities, no dollars, say what is not
            in the data, short and scannable.
  pitch     MOCK PITCH: Claude plays the buyer at this account, grounded in
            its real history; invented details are practice scenarios;
            1-3 spoken sentences, objections, no coaching.
  feedback  ends a pitch: coaching under 200 words + one rewritten opener.

ENV (Vercel -> Project -> Settings -> Environment Variables; Production +
Preview). GAVIN'S STEP -- the assistant answers 503 "not configured" until
this exists:
  ANTHROPIC_API_KEY          from console.anthropic.com -> API keys. Server-
                             only: it is read here and never sent to a page.
                             Never put it in the repo (public) or in a page.
  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   already set for the middleware.

COST (Claude Opus 5.5 list prices, 2026-09): a packet is ~20-40 KB, about
6-12k input tokens. First question on an account ~ $0.03-0.05; follow-ups
mostly hit the cache (cache reads are 5% of the input price). A short answer
is ~300 output tokens ($0.006). Budget roughly $0.05 a question; the Usage
page in the Anthropic console shows the real spend.

ACCESS
  middleware.js REP_PATHS carries '/api/chat' so a rep can reach it; the
  middleware's own gate runs first (matcher covers /api). Managers pass.

LOCAL / TESTS
  scratchpad chat_api_test.mjs imports the handler under Node with a
  stubbed Supabase and Anthropic API (auth fail-closed, caps, prompt shape,
  SSE passthrough across split frames, refusal, upstream 429/500, missing
  key -> 503). scratchpad assistant_test.mjs drives the UI with the route
  stubbed. The local python server has no /api, so the page's Ask section
  shows "needs kohlerdisthub.com" unless KDH_AUTH is stubbed.

LATER (not built): saving conversations, comparable-account questions
(needs other accounts' data server-side, with the same per-rep rules),
Snowflake-backed live data, tool calls into the sales master for questions
the packet cannot answer.
