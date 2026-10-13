# Games Analytics V2 — D1-only cutover and manual deployment

> **Decision:** Start all analytics counts at zero when the new Worker goes live. The old `GAMES_ANALYTICS` KV namespace is abandoned. No KV import, migration, dual-write, baseline merge, fallback reads, or storage compatibility adapter. **Do not run any production command as part of CI or this PR.**
>
> This applies **only** to the `games-analytics` Worker. The separate `game-scores` and `word-daily-stats` Workers and their KV/Durable Object bindings are not changed.

## Data model

- `Workers/migrations/analytics/0001_analytics_v2.sql` is the initial D1 schema **and** the only migration for this fresh database.
- `analytics_events` is an append-only ledger. Legacy writes have `version=1` and no event ID; V2 writes have UUIDv4 `event_id` and `session_id`. The unique event ID index rejects retries during the documented 45-day window. A partial unique index prevents more than one `open` per V2 session.
- `analytics_daily` is the day/game materialized aggregate (`plays`, `finishes`, `opens`, `active_seconds`). A SQLite `AFTER INSERT` trigger maintains it **in the event INSERT transaction**, including when simultaneous Workers ingest the same event. Duplicate events do not fire the trigger. The hourly cleanup deletes only old ledger rows, not `analytics_daily`.
- Event deduplication is **guaranteed only within a 45-day retry window** (older retries can be accepted again). An hourly UTC Cron Trigger at minute 17 deletes up to 5,000 event-ledger rows whose UTC+8 day is more than 45 days old; it never deletes daily summaries. The ledger is a bounded-retry record, **not an indefinitely retained historical baseline**. The deletion query uses an index on `(day,id)`. If traffic grows substantially, monitor the number of expired rows and adjust the maintenance batch, rather than deleting the aggregate history.
- The `ANALYTICS_RATE_LIMITER` Worker rate-limit binding is configured at 180 POSTs per 60 seconds per Cloudflare connecting IP per Cloudflare location. It runs before D1 ingestion; 429 drops excess traffic. Cloudflare's native counters are approximate, not a global strict rate limit, and IPs shared by multiple visitors can cause false positives. The IP is used only as an ephemeral limiter key; it is never stored in D1. This is abuse resistance, not authentication.
- UTC+8 is the server-receipt date for both legacy and V2 events. Retries of the same V2 `eventId` after midnight do **not** move an event to the next day.
- PII is not stored. The UUIDs are random, scoped to the page load/event, and are not shared with other services. No usernames, IP addresses, cookies, player IDs, or user agents are collected.

## HTTP contract

The URL remains `https://games-analytics.orangely.workers.dev`.

### Legacy (unchanged)

```http
POST /event
Content-Type: text/plain

{"game":"tetris","event":"play"}
```

Accepted `event`: `play` / `finish`. Valid game IDs are derived from `games.config.json` into `Workers/games-analytics.js` by `npm run gen`. Success: HTTP 200, plain text `OK`. Request `Origin` is not required because legacy `sendBeacon` callers may omit it.

```http
GET /stats?day=20261013
GET /stats?scope=total
```

Legacy JSON format remains `{ "tetris": { "p": 3, "f": 2 }, "total": { "p": 3, "f": 2 } }`. A day with no play/finish data returns `{}`. Missing/invalid-format `day` falls back to the current UTC+8 day; an eight-digit but impossible day returns empty data as before. `scope=total` sums all D1 days (no 90-day KV expiry). **Existing no-ID callers cannot be retry-idempotent:** retransmitting the same legacy event counts again. This is an intentional HTTP compatibility limitation, not a hidden retry mechanism.

### V2 (strict)

```http
POST /event
Content-Type: text/plain

{"v":2,"game":"tetris","event":"open","eventId":"f1cb914e-5c44-4a0d-9a55-e3994395b8b4","sessionId":"ff99744d-2acd-41e7-bcac-e811f1709b7b"}
```

Events: `open`, `play`, `finish`, `active`. `active` must additionally have `"seconds":15` (integer 1..60). All other kinds **must not** include `seconds`. V2 requires exactly `v`, `game`, `event`, `eventId`, `sessionId` (plus `seconds` for `active`) and lowercase RFC 4122 UUIDv4 IDs. Unknown fields, games, kinds, invalid IDs, malformed JSON and overly large request bodies are rejected with HTTP 400. New distinct events return 201 `{ "ok":true, "duplicate":false }`. Replayed identical event IDs (or a repeated `open` for the same session) **within 45 days** return 200 `{ "ok":true, "duplicate":true }`; reusing an ID with different details returns HTTP 409 and does not mutate counters.

```http
GET /stats?v=2&day=20261013
GET /stats?v=2&scope=total
GET /stats?v=2&from=20261007&to=20261013
```

V2 returns `{scope, day|from+to, games:{ "tetris": {p,f,opens,activeSeconds} }, total:{p,f,opens,activeSeconds} }`. `from`/`to` are inclusive UTC+8 dates; max range is 31 days. Invalid calendar days, unknown V2 scopes, missing range bounds and overly long ranges return 400. For a weekly report query seven days using `from` and `to`. The weekly **email scheduler is not included in this data-cutover PR**.

**Metrics definition:** `opens` counts game HTML page loads, not `play` clicks. Once the browser has verified that the **new D1 Worker** responds to `GET /stats?v=2`, the shared browser script emits each `open` once, then sends visible foreground time in incremental integer-second `active` events every ~15 s and when hiding/unloading. It excludes known hidden-tab time, but cannot prove human interaction or that a game is unpaused. `activeSeconds` should be presented as *foreground game-page duration*, not verified gameplay duration. Browsers can drop final `sendBeacon` requests, so this is a best-effort metric. Existing external/older clients send only `play/finish` and therefore do not contribute to `opens/activeSeconds` until upgraded.

**Automatic site/Worker rollout safety:** The games website auto-deploys separately from this manually deployed Worker. The new `/analytics.js` probes `GET /stats?v=2` **only on the allowed published origins** (`games.orangely.xyz` / `game.orangely.xyz`), and enables V2 only if it receives the new `{scope:'day', games, total}` response. Local previews, CI browser runs and third-party origins keep the legacy payload and do not issue a live V2 capability probe, avoiding cross-origin console failures. Until then, `hubTrack(play/finish)` uses the old two-field payload, so the auto-deployed site remains compatible with the current KV Worker. After manual D1 cutover, new page loads begin reporting V2 without another website release. Events emitted before the V2 probe settles can still use the legacy payload. No dual-write or KV reading exists in the *new* Worker.

This is an **anonymous, public telemetry endpoint**. UUID idempotency (for 45 days) and native request throttling prevent common accidental duplicate counting and limit single-source floods, not deliberate distributed event forgery. Do not infer unique people from `sessionId` or `opens`.

## Pre-production validation (no Cloudflare changes)

From repo root:

```bash
npm ci
npm run verify:analytics
npm run gen -- --check
npm run build
npm run verify -- --jobs=2
npx wrangler deploy -c Workers/wrangler-games-analytics.jsonc --dry-run
```

`verify:analytics` executes the real SQL migration and event HTTP handler with Node 22's embedded SQLite, and checks legacy shapes, UTC+8 boundaries, concurrent/replayed writes, triggers, constraints, request validation, CORS, and the browser beacon client. Full repo CI exercises this checker along with existing game tests. The `--dry-run` command bundles the analytics Worker without deploying it.

A local D1 development run (writes to a **local** database only):

```bash
npx wrangler d1 migrations apply games-analytics-v2 -c Workers/wrangler-games-analytics.jsonc --local
npx wrangler dev -c Workers/wrangler-games-analytics.jsonc
# In another shell, against the LOCAL wrangler port:
curl -s 'http://127.0.0.1:8787/stats?scope=total'
curl -s 'http://127.0.0.1:8787/stats?v=2'
```

## Manual production cutover — operator only

1. **Create a new, empty D1 database** in the intended Cloudflare account (never reuse the old KV namespace):

   ```bash
   npx wrangler d1 create games-analytics-v2
   ```

   Copy the returned D1 UUID into `Workers/wrangler-games-analytics.jsonc`, replacing `00000000-0000-0000-0000-000000000000`. Do not publish with the placeholder. No KV binding remains in this config. Review and commit this config change before deploying, if needed.

2. **Apply the fresh schema to the new database**. This is a deliberate production D1 write, not run automatically by CI:

   ```bash
   npx wrangler d1 migrations apply games-analytics-v2 -c Workers/wrangler-games-analytics.jsonc --remote
   npx wrangler d1 execute games-analytics-v2 -c Workers/wrangler-games-analytics.jsonc --remote --command 'SELECT COUNT(*) AS events FROM analytics_events'
   ```

   The initial count should be `0`. Inspect `analytics_daily` likewise. If this fails, fix the new database/config and **do not publish**.

3. **Publish the standalone statistics Worker manually**, only after migration succeeds:

   ```bash
   npm run deploy:analytics
   ```

   Alternatively, on the reviewed `main` branch, run GitHub Actions **Deploy Workers → analytics** manually. Do not deploy the score Worker; no other Worker is part of this cutover. The web app deploys separately through Cloudflare Git integration.

4. **Read-only smoke checks after publish** (these do not create artificial production events):

   ```bash
   curl -s 'https://games-analytics.orangely.workers.dev/stats?scope=total'
   curl -s 'https://games-analytics.orangely.workers.dev/stats?v=2&scope=total'
   ```

   On initial cutover, legacy result `{}` and V2 zero totals are **correct and expected**. Organic client events begin a fresh history. Do not import or merge old KV counts and do not repair apparent zeroing by adding a fallback.

5. **Remove the obsolete KV binding from Cloudflare dashboard** if it is still separately bound to the Worker. The checked-in Wrangler config already removes it. The new Wrangler config also installs the hourly retention cron and native write-rate limiter when you manually publish. Deleting the original KV namespace/data is an optional later manual cleanup; do not touch the unrelated score/word-stats KV namespaces.

If the new D1 binding is missing or the schema was not applied, requests fail clearly (HTTP 503 or 500), **never silently write to KV or return fabricated zero successes**. The existing `workers.dev` URL and old client HTTP contract do not change. The cutover is intentionally one-way; there is no historical-data rollback/migration framework.
