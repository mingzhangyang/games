# Games Analytics V2 — D1-only cutover and manual deployment

> **Decision:** Start all analytics counts at zero when the new Worker goes live. The old `GAMES_ANALYTICS` KV namespace is abandoned. No KV import, migration, dual-write, baseline merge, fallback reads, or storage compatibility adapter. **Do not run any production command as part of CI or this PR.**
>
> This applies **only** to the `games-analytics` Worker. The separate `game-scores` and `word-daily-stats` Workers and their KV/Durable Object bindings are not changed.

## Data model

- `Workers/migrations/analytics/0001_analytics_v2.sql` is the initial D1 schema; Phase 2 adds `0002_playing_seconds.sql` and `0003_event_occurred_at.sql`. Existing migrations remain immutable. Apply all pending migrations on a fresh database, or only pending migrations on an existing D1.
- `analytics_events` is an append-only ledger. Legacy writes have `version=1` and no event ID; V2 writes have UUIDv4 `event_id` and `session_id`. The unique event ID index rejects retries during the documented 45-day window. A partial unique index prevents more than one `open` per V2 session.
- `analytics_daily` is the day/game materialized aggregate (`plays`, `finishes`, `opens`, `active_seconds`, `playing_seconds`). A SQLite `AFTER INSERT` trigger maintains it **in the event INSERT transaction**, including when simultaneous Workers ingest the same event. Duplicate events do not fire the trigger. The hourly cleanup deletes only old ledger rows, not `analytics_daily`.
- Event deduplication is **guaranteed only within a 45-day retry window** (older retries can be accepted again). An hourly UTC Cron Trigger at minute 17 deletes up to 5,000 event-ledger rows whose UTC+8 day is more than 45 days old; it never deletes daily summaries. The ledger is a bounded-retry record, **not an indefinitely retained historical baseline**. The deletion query uses an index on `(day,id)`. If traffic grows substantially, monitor the number of expired rows and adjust the maintenance batch, rather than deleting the aggregate history.
- The `ANALYTICS_RATE_LIMITER` Worker rate-limit binding is configured at 180 POSTs per 60 seconds per Cloudflare connecting IP per Cloudflare location. It runs before D1 ingestion; 429 drops excess traffic. Cloudflare's native counters are approximate, not a global strict rate limit, and IPs shared by multiple visitors can cause false positives. The IP is used only as an ephemeral limiter key; it is never stored in D1. This is abuse resistance, not authentication.
- UTC+8 determines daily attribution. Legacy and old V2 events use server-receipt date; Phase 2 V2 events may supply integer UTC-millisecond `occurredAt` within plus/minus 24 hours of Worker time. These use occurrence day, including short midnight retries. A duplicate event ID never double-rolls up; its original nullable `occurred_at` is persisted and compared exactly, including same-day timestamp changes, alongside the rollup day. Omitted timestamps remain distinguishable from explicitly supplied ones. Client 1-second sampling introduces up to one sample of boundary uncertainty; incorrect device clocks may have timestamps rejected.
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

Events: `open`, `play`, `finish`, `active`. `active` requires `"seconds":15` (integer 1..60) and may optionally add `"playingSeconds":9` (integer 0..seconds). Any V2 event may include optional `"occurredAt":1791892800000` (integer Unix milliseconds within plus/minus 24h of Worker time). Other kinds must not include durations. New fields are additive: valid Phase 1 V2 requests still pass, and the new browser client feature-detects `playingSeconds` in the GET response before sending them. All requests still require UUIDv4 event/session IDs and strict allowed keys. Unknown fields, IDs and malformed bodies are rejected with HTTP 400. New distinct events return 201 `{ "ok":true, "duplicate":false }`. Replayed identical event IDs (or a repeated `open` for the same session) **within 45 days** return 200 `{ "ok":true, "duplicate":true }`; reusing an ID with different details returns HTTP 409 and does not mutate counters.

```http
GET /stats?v=2&day=20261013
GET /stats?v=2&scope=total
GET /stats?v=2&from=20261007&to=20261013
```

V2 returns `{scope, day|from+to, games:{ "tetris": {p,f,opens,activeSeconds,playingSeconds} }, total:{p,f,opens,activeSeconds,playingSeconds} }`. `from`/`to` are inclusive UTC+8 dates; max range is 31 days. Invalid calendar days, unknown V2 scopes, missing range bounds and overly long ranges return 400. For a weekly report query seven days using `from` and `to`. The weekly **email scheduler is not included in this data-cutover PR**.

**Metrics definition:** `opens` counts loaded game documents, never homepage links; refresh counts again, restart does not. `activeSeconds` counts focused visible time with recent interaction (60-second inactivity cutoff), sampled using monotonic time about once per second with a 2.5-second throttled-gap cap. `playingSeconds` is the subset of active time when the registered game-owned playing predicate is true. Idle, pause and result screens are not gameplay. Checkpoints run at ~30 seconds, with a best-effort beacon/keepalive on hide or page close. The in-memory queue is bounded to 16 records and 3 attempts per record; immutable event IDs prevent double counting. Historical active time cannot be retroactively classified as playing (initial value 0). Standalone old clients only report legacy play/finish until separately integrated. See [Phase 2 client and lifecycle contract](./analytics-v2-client.md).

**Automatic site/Worker rollout safety:** The games website auto-deploys separately from this manually deployed Worker. The new `/analytics.js` probes `GET /stats?v=2` **only on the allowed published origins** (`games.orangely.xyz` / `game.orangely.xyz`), and enables V2 only if it receives the new `{scope:'day', games, total}` response. Local previews and CI browser runs emit **no production telemetry**. Explicit browser test fixtures may route events to an isolated loopback mock via `__ANALYTICS_V2_TEST__`. Only approved public origins probe the real Worker and fall back to legacy play/finish if V2 is not available. Until then, `hubTrack(play/finish)` uses the old two-field payload, so the auto-deployed site remains compatible with the current KV Worker. After manual D1 cutover, new page loads begin reporting V2 without another website release. Phase 2 begins reporting the additional durations and event time only once the second migration and updated Worker are manually deployed. Events emitted before the V2 probe settles can still use the legacy payload. No dual-write or KV reading exists in the *new* Worker.

This is an **anonymous, public telemetry endpoint**. UUID idempotency (for 45 days) and native request throttling prevent common accidental duplicate counting and limit single-source floods, not deliberate distributed event forgery. Do not infer unique people from `sessionId` or `opens`.

## Pre-production validation (no Cloudflare changes)

From repo root:

```bash
npm ci
npm run verify:analytics
npm run gen -- --check
npm run lint
npm run build
npm run verify -- --jobs=2
npx wrangler deploy -c Workers/wrangler-games-analytics.jsonc --dry-run
```

`verify:analytics` executes the real SQL migration and event HTTP handler with Node 22's embedded SQLite, and checks legacy shapes, UTC+8 boundaries, concurrent/replayed writes, triggers, constraints, request validation, CORS, ; independent real Chromium lifecycle verification runs through the full `npm run verify` command. Full repo CI exercises this checker, rollout compatibility checks, representative real-game browser lifecycle checks and a separate Analytics Worker dry-run alongside the existing suite. These dry runs do not deploy to production.

A local D1 development run (writes to a **local** database only):

```bash
npx wrangler d1 migrations apply games -c Workers/wrangler-games-analytics.jsonc --local
npx wrangler dev -c Workers/wrangler-games-analytics.jsonc
# In another shell, against the LOCAL wrangler port:
curl -s 'http://127.0.0.1:8787/stats?scope=total'
curl -s 'http://127.0.0.1:8787/stats?v=2'
```

## Manual production cutover — operator only

> **Current production database:** `games` (D1 ID `f7ba2f62-92bc-42e4-8974-6811e026a6d1`) was created on 2026-10-14, and the SQL schema for migrations 0001, 0002 and 0003 was verified directly in D1. These changes were made through the Cloudflare Console, so Wrangler migration bookkeeping is not present. **Skip database creation and do not re-apply 0001/0002/0003 with Wrangler** to this database. The checked-in Wrangler configuration now refers to its real ID. Binding/deployment to the `games-analytics` Worker is still a separate, manual production action; verify the running Worker settings after that deployment.

1. **Create a new, empty D1 database** in the intended Cloudflare account (never reuse the old KV namespace):

   ```bash
   npx wrangler d1 create games
   ```

   Copy the returned D1 UUID into `Workers/wrangler-games-analytics.jsonc`, replacing `00000000-0000-0000-0000-000000000000`. Do not publish with the placeholder. No KV binding remains in this config. Review and commit this config change before deploying, if needed.

2. **Apply the fresh schema to the new database**. This is a deliberate production D1 write, not run automatically by CI:

   ```bash
   npx wrangler d1 migrations apply games -c Workers/wrangler-games-analytics.jsonc --remote
   npx wrangler d1 execute games -c Workers/wrangler-games-analytics.jsonc --remote --command 'SELECT COUNT(*) AS events FROM analytics_events'
   ```

   The initial count should be `0`. Inspect `analytics_daily` likewise. If this fails, fix the new database/config and **do not publish**.

   **If Phase 1 D1 is already running:** do not recreate or wipe it. Apply the same remote migration command to run pending migrations 0002 and 0003 as needed, verify the new `analytics_daily.playing_seconds` and `analytics_events.occurred_at` columns, then deploy the Phase 2 Worker. The migration must run before deployment. None of these remote steps run in CI.

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

## Phase 3 weekly email entry point

Once Phase 2 is collecting production data, query seven inclusive UTC+8 days via `GET /stats?v=2&from=YYYYMMDD&to=YYYYMMDD` and summarize opens, plays, finishes, active seconds and playing seconds per registry game ID. Weekly scheduling, email provider, recipient configuration and report rendering belong in a later PR. This change provisions none of them.
