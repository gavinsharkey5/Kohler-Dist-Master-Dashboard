/api -- Vercel Edge Functions behind kohlerdisthub.com
====================================================

chat.js   The ACCOUNT ASSISTANT behind My Accounts -> Ask (2026-09-30, v2).
          POST /api/chat  {v:2, mode:'ask'|'pitch'|'feedback', account:<customer #>,
                           rep:'<rep name>', page:{programs, warehouse, warehouseAsOf},
                           messages:[{role, content}, ...], model?}
          -> text/event-stream:
               data: {"meta":{ref, refLabel, months, salesLoaded, productsOnRecord,
                              productsInline, source, model}}        first
               data: {"tool":"product_history","input":{...}}       per server lookup
               data: {"t":"..."}                                     text as it streams
               data: {"done":true,"stop":"end_turn","usage":{input, cacheWrite,
                      cacheRead, output, rounds, ms, model, fellBack},"tools":[...]}
             or an HTTP error {error} / a data: {"error":"..."} event mid-stream.

WHO MAY ASK ABOUT WHAT (server-side; the browser is never trusted)
  1. kdh_at cookie -> the caller's allowed_users row (email, name, role),
     the same call middleware.js makes. Expired / unlisted -> 401.
  2. REP: the account must be on /accounts/data/reps/<own key>.json --
     their assigned route, key derived from allowed_users.name with the
     middleware's nameKey rule. Another rep's name or customer number ->
     403 "not on this route" / "own accounts".
  3. MANAGER: names the rep. A district manager (shared/dm-groups.js) may
     ask only about reps on their team (+ groups filed under them); any
     other manager (VP, Gavin, sales support) may ask about any rep -- the
     same kdhTeam() rule every page applies. The account must be on that
     rep's route. Preview mode only changes the label in the prompt; a
     manager is authorized as a manager, as the middleware sees them.
  4. The route and sales files are fetched from the deployment's own
     origin WITH the caller's cookies, so the middleware's per-rep 403s
     hold underneath this function's own checks (chat_api_test.mjs runs
     those reads through the real middleware.js).
  5. Pilot gate: KDH_CHAT_USERS (comma-separated emails) -- when set, only
     those people may use the assistant.
  Checked by scratchpad chat_api_test.mjs: altered customer numbers,
  cross-rep numbers, a rep naming another rep, expired tokens, a DM
  outside their team, an unknown rep, the wrong rep for an account, model
  choice by a rep, the pilot list.

WHAT THE MODEL SEES
  ACCOUNT RECORD (trusted, server-built from accounts/data/reps/<key>.json,
  accounts/data/sales/<key>/<n>.json and rep_actions read with the caller's
  token): identity, a COVERAGE statement (what the record is: every product,
  cases per calendar month, Jan 2025 -> the reference month, net of returns;
  how many products are inline vs behind the tools; reference month; the
  date the sales master was loaded; the list of what is NOT in the data),
  12 monthly totals, the 30 largest products of the last 12 months plus
  every product on alert (each with its last 12 months), the alerts with
  their evidence, the patterns, the rep's notes, the tap survey.
  TOOLS (run on the server against the COMPLETE record; sums are code, not
  model arithmetic):
    product_history {query}        every buying month + yearly totals for up
                                   to 8 matching products (name / family /
                                   supplier / number); "no match" is the only
                                   way the model may say something was never bought
    period_totals {from,to,family?} cases per month + total + products bought +
                                   top 10 for any month range, with the same-
                                   length prior period and the same months a
                                   year earlier
    list_products {sort,filter,family?,offset}  40 per page over every product;
                                   filters stopped / new / alert / family
    Up to 4 rounds per question (MAX_ROUNDS). Thinking blocks are replayed
    verbatim between rounds as the API requires.
  PAGE CONTEXT (browser-supplied, capped at 24 KB, labelled "what the app
  page shows; computed by the app, not part of the sales record"): the
  page's program status list (from the trackers' registries) and warehouse
  availability per product (from ../inventory/). The prompt tells the model
  to quote these as "the tracker shows" / "the warehouse report shows (as of
  <date>)". They stay browser-supplied because the program registries and
  the inventory report are browser-side libraries; moving them server-side
  is the next step if either is ever disputed.
  The prompt (STABLE) sets the trust order, requires the period on every
  number, separates OBSERVED from INFERRED, treats alerts as possibilities,
  forbids dollars, and tells the model to say when history is too short or
  the question needs data we do not have. The UI prints the period, the
  load date, the lookups run and links to the page blocks under every
  factual answer, so the answer text itself does not repeat them.

MODES
  ask       questions about this account. Rules above.
  pitch     MOCK PITCH: the model plays the buyer. What the buyer says about
            the account's buying / taps / notes must come from the record;
            mood, time pressure, shelf space, a competitor's visit are
            SIMULATED objections; it never invents prices, margins, deals,
            inventory numbers, competitor facts, supplier promises or
            customer quotes; approved product information = the record +
            PAGE CONTEXT (names, packages, families, program asks, warehouse
            availability, sell-sheet links).
  feedback  ends a pitch: what worked, up to five improvements, one
            rewritten opening line built from the record; marks the
            objections it invented as simulated.

MODEL AND API SETTINGS (verified against platform.claude.com, 2026-09-30)
  Model ID       claude-opus-5-5 (Claude Opus 5.5; list $4 in / $20 out per
                 MTok; cache read 5% = $0.20; cache write 1.25x = $5).
                 Alternative in the allowlist: claude-sonnet-5-5 ($2 / $10;
                 cache read $0.20; write $2.50). KDH_CHAT_MODEL picks the
                 default; a MANAGER may send body.model to compare (a rep
                 gets 403). Anything else -> 503, never a guess.
  Thinking       omitted = adaptive; on Opus 5.5 thinking cannot be turned
                 off and effort is the only control.
  Effort         output_config.effort = KDH_CHAT_EFFORT, default "low" (the
                 docs' recommendation for chat / latency-sensitive work;
                 Opus 5.5's own default is medium). Top-level, no beta.
  Streaming      stream:true; SSE events message_start / content_block_start
                 / content_block_delta (text_delta, input_json_delta,
                 thinking_delta, signature_delta) / content_block_stop /
                 message_delta (stop_reason, usage.output_tokens) / message_stop.
  Fallbacks      fallbacks:"default" with header anthropic-beta:
                 server-side-fallback-2026-07-01. WHAT IT DOES: Opus 5.5 runs
                 safety classifiers (categories cyber, bio, frontier_llm,
                 reasoning_extraction, general_harms); a flagged request
                 returns HTTP 200 with stop_reason "refusal" and empty
                 content. With "default", the API re-runs a refused request
                 server-side on the model Anthropic recommends for that
                 category and returns that answer; for categories with no
                 recommended fallback the refusal stands. The stream's
                 message_start names the model that served it, so the
                 function reports usage.fellBack and stores the served model
                 in the ledger beside the requested one. A refusal that
                 still arrives gets the plain "I can't help with that one
                 here" line. Nothing else is meant by "safety fallbacks".
  Caching        cache_control ephemeral on the STABLE block and on the
                 record block, so a conversation's later turns and tool
                 rounds re-read the record at the cache-read price.
  Prompt caching, effort and fallbacks are the only API features used; no
  tool_choice (forced tool use is a 400 on Opus 5.5), no sampling params.

COST AND LIMITS (measured, not assumed: every answer writes a ledger row)
  Ledger         public.assistant_usage (migration
                 supabase/migrations/20260930210000_assistant_usage.sql):
                 tokens in / cache write / cache read / out, rounds, ms,
                 stop, tools, served + requested model, est_usd from the
                 price table above. The trigger stamps who asked from the
                 token; a person reads their own rows, a manager everyone's;
                 no updates or deletes. No question text, no answers, no
                 account names are stored.
  Per person     KDH_CHAT_USER_DAILY requests per UTC day (default 60) -> 429.
  Everyone       KDH_CHAT_DAILY_USD estimated spend per UTC day (default 20)
                 -> 429 "reached today's spending limit". Both read from
                 kdh_assistant_quota() before every call.
  Burst          40 requests / 10 min per person per isolate (in memory).
  Sizes          MAX_TURNS 30, MAX_TURN_CHARS 4000, page context 24 KB, tool
                 results 12 KB each, MAX_OUTPUT_TOKENS 1500.
  Missing ledger -> 503 (fail closed). KDH_CHAT_NO_LEDGER=1 skips the ledger
  and the daily limits for a dev preview ONLY -- never in production.
  ESTIMATE until measured: a first question on an account is ~10-14k input
  tokens (record ~9k + instructions + tools), ~200-400 output, so about
  $0.05-0.07 at Opus 5.5 list price; later turns re-read the record from
  cache (~$0.01 of input), a tool round adds a cached re-read plus the
  tool result. Sonnet 5.5 is about half. The ledger and
  tools/assistant-eval/run.mjs replace this estimate with real numbers.

ENV (Vercel -> Project -> Settings -> Environment Variables)
  ANTHROPIC_API_KEY        server-only; never in the repo, never sent to a page
  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   already set for the middleware
  KDH_CHAT_MODEL           default claude-opus-5-5
  KDH_CHAT_EFFORT          default low
  KDH_CHAT_USERS           pilot list of emails; empty = everyone signed in
  KDH_CHAT_USER_DAILY      default 60
  KDH_CHAT_DAILY_USD       default 20
  KDH_CHAT_NO_LEDGER       "1" only on a throwaway preview

CONTROLLED PILOT (Gavin's steps, in order)
  1. Supabase -> SQL Editor: run
     supabase/migrations/20260930210000_assistant_usage.sql once.
  2. console.anthropic.com -> API keys: create a key named "kdh-pilot" (a
     separate key from anything else, so it can be revoked alone) and set a
     monthly spend limit on the key / workspace there too.
  3. Vercel -> Settings -> Environment Variables -> Add: ANTHROPIC_API_KEY,
     Environment = PREVIEW only (untick Production); optionally scope it to
     one branch. Add KDH_CHAT_USERS = your email (Preview only as well).
     Production keeps answering 503 "not configured" -- nobody else can
     spend a cent.
  4. Push any commit to a branch (or Redeploy the latest preview) and open
     the preview URL (Vercel -> Deployments -> the branch). Sign in as
     yourself. My Accounts -> an account -> Ask.
  5. Run the fixed set and read the report:
       node tools/assistant-eval/run.mjs --base https://<preview>.vercel.app \
         --cookie "kdh_at=<from DevTools -> Application -> Cookies>; _vercel_jwt=<if the preview is protected>" \
         --rep "Mike Ast" --account 81006 --set pilot
     It covers purchase history, trends and reorder evidence, program
     qualification, missing / stale data, out-of-scope questions, another
     rep's account by name and by number, a three-turn mock pitch and the
     feedback, and prints per answer: tools used, tokens, latency, estimated
     USD, and a NUMBER CHECK that flags any integer in the answer that does
     not appear in the account's record on disk. Fix what it flags before
     step 7. The report lands in tools/assistant-eval/report-<date>.md
     (keep it out of git if it quotes account names you would not publish).
  6. Compare models on the same set (a manager cookie):
       node tools/assistant-eval/run.mjs ... --models claude-opus-5-5,claude-sonnet-5-5
     The Totals table gives avg latency, tokens and est. USD per answer for
     each; pick with KDH_CHAT_MODEL. Read the answers side by side -- the
     number check is the same for both.
  7. Small rep pilot: add ANTHROPIC_API_KEY to PRODUCTION, set
     KDH_CHAT_USERS to you + 2-3 reps, KDH_CHAT_DAILY_USD to a number you
     are comfortable losing in a day (10 is plenty for three reps), redeploy.
     Watch the ledger (query at the foot of the migration) for a week.
  8. Everyone: clear KDH_CHAT_USERS. Raise KDH_CHAT_DAILY_USD as the ledger
     shows real use.

WHAT IS NOT VERIFIED YET (needs a key; none is available to the build
environment): a live Claude call end to end, real token counts and latency,
the model comparison, and the Vercel-specific behaviours -- self-origin
fetch through the middleware on a live deployment, and POST /api/chat under
trailingSlash:true (a redirect to /api/chat/ would turn the POST into a
GET -> 405; if that happens, change ENDPOINT in accounts/assistant.js to
'/api/chat/' or add a rewrite in vercel.json).

DATA SOURCE INTERFACE (Snowflake later, without depending on it)
  StaticExportSource in chat.js is the only place the function reads data:
  dmGroups(), repIndex(), route(repKey), account(repKey, n), notes(n, rep).
  A Snowflake- or Postgres-backed source implements the same five methods
  (route = the rep's assigned accounts; account = product x month rows +
  patterns.py findings) and authorization, packet, tools and prompt stay as
  they are. What Snowflake would add is coverage and freshness -- daily
  instead of monthly grain, invoices, inventory -- and with it new tools;
  route-wide or comparable-account questions additionally need a
  permission rule for which accounts a question may span, which does not
  exist yet and is not a connector question.

CLOSED 2026-10-01: every other rep-page dataset (program_data.js, the MPO
month JSON, the Tap Tracker and Carbliss embedded data, redbull/data.csv) is
now served per rep too (tools/rep_slices.py + middleware.js), and account
SIZE (sizeClass, decile) lives in accounts/data/size.json, which only a
manager may fetch -- src.size() merges it into the record for a manager.

LOCAL / TESTS
  scratchpad chat_api_test.mjs (60 checks; the handler under Node with a
  stubbed Supabase and Anthropic API, self-origin reads through the real
  middleware.js), assistant_test.mjs (the UI with /api/chat stubbed),
  mw_test.mjs. The local python server has no /api, so the page's Ask
  section shows "needs kohlerdisthub.com" unless KDH_AUTH is stubbed.

GEOCODE (2026-10-02): POST /api/geocode
{rep, accounts:[customer #...]} -> {results:{n:{lat,lng,match}|{none:reason}}}.
Same auth as /api/chat (kdh_at -> allowed_users) and the same route
authorization (rep: own key; DM: their team; other managers: any rep). The
route file is fetched from this deployment with the caller's cookies, so
the middleware's per-rep slices hold. Only customer numbers on that route
are geocoded, with the street + town from the route file (never an address
from the browser), through the US Census batch geocoder (public, no key).
Reasons: incomplete (no street / town), not found, ambiguous, not on this
route. Accounts with validated coordinates (accounts/geo.csv) never reach
this. Not verified live from the build environment (the Census host is
blocked there): open My Accounts -> Map once after deploy.
