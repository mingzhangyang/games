# Games Analytics V2 — Phase 3: Weekly email operations

## Scope and the checked-in contracts

- **Storage:** existing D1 `games`; reporting reads `analytics_daily(day, game, opens, plays, finishes, active_seconds, playing_seconds)` only. It does not scan `analytics_events`, alter the existing public `/event` or `/stats` protocol, or create another analytics pipeline.
- **Coverage:** `games.config.json` is the canonical list of 26 hosted game IDs/names and 3 independently deployed game IDs (`minecraft`, `dots`, `stack`). `npm run gen -- --check` protects the generated Worker game labels. The external games have allowed origins but their updated activity clients have **not** been installed by Phase 2. Their displayed counts are not necessarily complete.
- **Time:** stored `day` keys are UTC+8 calendar dates. Week is Monday 00:00:00 to next Monday 00:00:00, left inclusive/right exclusive. SQL reads 14 days in one parameterized query, `[previousMonday, followingMonday)`. The existing GET `/stats?v=2&from=...&to=...` is inclusive and unchanged.
- **Precision:** integer seconds and counts are summed without conversion; only email display rounds down into hours/minutes. Ratios are count aggregates, not person-level conversions. A zero denominator yields `N/A`; `plays/opens` can exceed 100%.
- **Coverage warning:** set `REPORT_COMPLETE_SINCE` to the Monday of the **first entirely covered UTC+8 week** after confirming that the manually deployed Worker and site collect all required telemetry. No historical times are backfilled. A week preceding this date is never auto-emailed, and missing previous-week baselines show as unavailable, not as growth. Even with this flag, individual client requests can be blocked/lost.
- **No real sends are performed by CI.** Browser collection, stats Worker deployment and website auto-publishing are different workflows; this PR does not change the website deployment model.

## One-time schema change — operator action after merge only

The production `games` database already contains migrations 0001, 0002 and 0003, applied in the Cloudflare Console on 2026-10-14 (not via Wrangler migration tracking). **Do not rerun those migration files.** Phase 3 introduces only:

`Workers/migrations/analytics/0004_weekly_delivery.sql`

Read the file in the reviewed main branch, then run its SQL **once** in the Cloudflare D1 console or, deliberately, using:

```sh
npx wrangler d1 execute games -c Workers/wrangler-games-analytics.jsonc \
  --remote --file Workers/migrations/analytics/0004_weekly_delivery.sql
```

Check before applying:

```sql
SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'analytics_weekly_delivery';
```

No row before migration; one row after. Confirm:

```sql
PRAGMA table_info(analytics_weekly_delivery);
SELECT COUNT(*) FROM analytics_weekly_delivery;
```

No existing event or daily-aggregate rows are deleted by the migration. The new table is **only** the report sending ledger.

## Email Service activation and Worker settings

Cloudflare Email Service's structured Workers Sending API supports both `html` and `text` and returns `messageId`. This is preferred; there is no MIME dependency. Email Sending to arbitrary recipients is available on eligible Workers Paid accounts. Sending to verified destination addresses is supported without an outbound paid plan; confirm the current Cloudflare account's capabilities before rollout.

1. Onboard and verify the sender's Orangely domain under Cloudflare Email Service. Configure any requested DNS/domain authentication. Use an address at the verified domain, such as `reports@orangely.xyz`; the address is an example only.
2. Verify the fixed admin recipient in Email Routing → Destination Addresses if your sending plan requires it. There is **no arbitrary recipient parameter** in any report endpoint. The Wrangler config has a `send_email` binding named `EMAIL`.
3. Set the following **Worker secrets or protected runtime configuration**, not committed values:

| Name | Required | Meaning |
| --- | --- | --- |
| `REPORT_FROM` | yes | Verified sender address on a domain you control |
| `REPORT_TO` | yes | Fixed admin recipient; a single mailbox |
| `REPORT_ADMIN_TOKEN` | yes for management API | Random ≥32-character bearer token, preferably generated with a secure random generator |
| `REPORT_COMPLETE_SINCE` | yes before live sending | First fully covered UTC+8 Monday, `YYYYMMDD` |
| `REPORT_ENABLED` | yes before live sending | String `true` enables formal reports; missing/other values keep scheduled mail disabled |
| `RESEND_API_KEY` | optional fallback | Only if the native Email binding is unavailable; configured as a Worker secret |

Use `npx wrangler secret put REPORT_FROM -c Workers/wrangler-games-analytics.jsonc` (repeat for each secret). The dashboard's Worker **Settings → Variables and Secrets** is also acceptable. Never enter private values into Wrangler config, issue comments, PR descriptions or Actions logs.

If Cloudflare Email Sending is unavailable, use Resend with a verified sender domain, remove the optional `send_email` binding from a reviewed config change and set `RESEND_API_KEY`. The email module has one small provider fallback; report rendering and D1 state remain provider-independent. The sender and recipient are still fixed by Worker configuration. Never configure a production API key in CI.

## Scheduled jobs

`Workers/wrangler-games-analytics.jsonc` declares both triggers:

```json
"triggers": { "crons": ["17 19 * * *", "0 1 * * MON"] }
```

- `17 19 * * *` — every day 19:17 UTC, which is **next day 03:17 UTC+8**: at most ten batches of 5,000 old deduplication events are deleted (maximum 50,000 rows/day); daily rollups are untouched. A remaining-backlog warning is written to Worker logs. In the same run, retry **only** previous definitively failed weekly emails after a six-hour cooldown, up to three automatic attempts.
- `0 1 * * MON` — every Monday 01:00 UTC = Monday 09:00 UTC+8: report the **previous completed natural week**, recover eligible previous failures, send once per period.
- All job dispatches use `controller.cron`; never derive a cron from the Worker local time. Adjust the Cron expression in the reviewed Wrangler configuration to change sending time, and keep `scheduled()` cron dispatch in sync.
- Trigger updates may take up to 15 minutes to propagate, so verify the effective triggers in the Cloudflare dashboard after manual deployment.

**Retention capacity:** Old hourly cleanup could delete up to 120,000 rows/day (24 × 5,000). The daily job can delete up to 50,000 rows/day. If daily expired-event volume regularly exceeds this, monitor the backlog warning and increase batches or resume a more frequent schedule. The 45-day event-ID retry window and indefinite daily aggregates do not change.

**Safety of failures:** Report generation uses one D1 range query, with no send if the current week lacks aggregates or has an unconfirmed coverage baseline. A failed D1 query creates a visible `failed` ledger record. Failed-preparation jobs can retry after the cooldown. If provider acceptance is uncertain, a lease in `sending` turns into `uncertain` during the next daily check and cannot be automatically resent.

## Manual deployment sequence (not part of this PR)

1. Merge reviewed PR and confirm all checks, then inspect the latest production Analytics Worker/config, especially that the live Worker includes Phase 2 and points at D1 `games`.
2. Apply **only migration 0004** to the production database and verify schema.
3. Enable and configure Cloudflare Email Service + fixed verified sender/recipient and Worker secrets. Keep `REPORT_ENABLED` absent/`false` initially.
4. Run the deployment guard and dry-run locally:
   ```sh
   node tools/deploy/check-analytics-binding.mjs
   npx wrangler deploy -c Workers/wrangler-games-analytics.jsonc --dry-run
   ```
5. Manually deploy the Analytics Worker using `npm run deploy:analytics` or the repository's **Deploy Workers** workflow targeting `analytics` on `main`. This is separate from Cloudflare's auto-deployed site and does **not** run as a consequence of merging this PR.
6. Verify live `GET /stats?v=2` and the existing legacy `/stats` API. Confirm both Cron triggers and native Email binding. Check Cloudflare logs for binding/migration errors.
7. Preview a **completed** natural week and send a single test mail with the secured admin API (examples below). Test mail is prefixed `[TEST / NOT LIVE]`; it does not create the `weekly:<start>` production idempotency record.
8. Set `REPORT_COMPLETE_SINCE` to the **first truly fully covered UTC+8 Monday**, then set `REPORT_ENABLED=true` after examining capture history, sender verification and the test message. If the current week is partially instrumented, do not backdate this setting.
9. After the next Monday 09:00 UTC+8, inspect `/admin/weekly/status`, Cloudflare email logs, actual inbox receipt and D1 message ID. The binding confirms provider acceptance, **not final inbox delivery**.

## Strictly authenticated management

The production Worker endpoint is `https://games-analytics.orangely.workers.dev`. Calls must include `Authorization: Bearer <REPORT_ADMIN_TOKEN>`; keep the token out of query parameters, screenshots, logs, git files and shell history. All management endpoints are unexposed to browsers via CORS. All use no-store headers. A missing or too-short configured token disables the management API.

For local CLI, supply the token via a secure environment variable (don't paste a real secret in command history):

```sh
export ANALYTICS_URL='https://games-analytics.orangely.workers.dev'
# Export REPORT_ADMIN_TOKEN via a trusted secret manager (not shown here).

# Preview last fully completed Monday-to-Sunday period, in a browser-friendly HTML response.
curl -fsS -H "Authorization: Bearer $REPORT_ADMIN_TOKEN" \
  "$ANALYTICS_URL/admin/weekly/preview?week=20261005&format=html" \
  -o weekly-preview.html

# Plain text, JSON preview and recent send states.
curl -fsS -H "Authorization: Bearer $REPORT_ADMIN_TOKEN" \
  "$ANALYTICS_URL/admin/weekly/preview?week=20261005&format=text"
curl -fsS -H "Authorization: Bearer $REPORT_ADMIN_TOKEN" \
  "$ANALYTICS_URL/admin/weekly/status"

# One safe test send to the configured fixed recipient (never to an arbitrary target).
curl -fsS -X POST -H "Authorization: Bearer $REPORT_ADMIN_TOKEN" \
  "$ANALYTICS_URL/admin/weekly/test?week=20261005"

# One manual retry for a definite failure (not for sent/ambiguous mail).
curl -fsS -X POST -H "Authorization: Bearer $REPORT_ADMIN_TOKEN" \
  "$ANALYTICS_URL/admin/weekly/retry?week=20261005"
```

The `week` parameter is **always the Monday `YYYYMMDD`**, not a seven-day end date. The examples refer to a sample prior week; select an actual completed week. The admin token must be present for every operation, including preview. A test send is idempotent once per week (`test:YYYYMMDD`), preventing repeated accidental test mail; choose another completed sample week if another test is required.

### Recovery when delivery is ambiguous

The ledger transitions atomically using a D1 `report_key` primary key and a unique lease token:

`preparing` → `sending` → `sent` (or `uncertain` if provider acceptance cannot be established). `preparing` errors become `failed` and can be retried. `sent` and `uncertain` cannot be retried normally. Expired `sending` jobs are reconciled to `uncertain` on the next daily job, not resent.

Database state and external sending are **not one transaction**; strict exactly-once inbox delivery is impossible here. If email was accepted and the `sent` state write fails, the record remains `sending` and becomes `uncertain`. If a provider call throws after acceptance, it is also `uncertain`.

For `uncertain`, inspect the provider message log, any message ID, sending timestamps and the actual inbox first. **Only if the operator has confirmed the outcome**:

```sh
# If the provider accepted the original delivery, mark it sent (never resend).
curl -fsS -X POST -H "Authorization: Bearer $REPORT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"delivered","confirmed":true,"messageId":"provider-log-id"}' \
  "$ANALYTICS_URL/admin/weekly/reconcile?week=20261005"

# Only when provider logs confirm the original message was NOT accepted:
curl -fsS -X POST -H "Authorization: Bearer $REPORT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"not_delivered","confirmed":true}' \
  "$ANALYTICS_URL/admin/weekly/reconcile?week=20261005"
# Then call /admin/weekly/retry for that week.
```

The API never accepts a recipient address or unauthenticated manual send. Do not reconcile a still-active send lease. For delivery logs unavailable or inconclusive, leave status `uncertain` and investigate rather than risk duplicate mail.

## Common operational checks

- **No email on Monday:** check `REPORT_ENABLED`, `REPORT_COMPLETE_SINCE`, UTC Cron timing, scheduled invocation logs and `/admin/weekly/status`. If the coverage baseline is incomplete, the system refuses to report.
- **`failed`:** check D1 migration 0004 and table structure, secret names, whether all required daily columns exist and the Email domain/recipient verification; check Worker logs for detailed errors. Only the scrubbed failure summary goes into D1. Failed jobs have at most 3 automatic attempts; authenticated manual retry can override the cap after repair.
- **`uncertain`:** reconcile with provider logs; never blindly retry, including after a Worker crash.
- **`preparing` expired:** safe to re-acquire, because there has not yet been a provider call.
- **Retention backlog:** follow "Analytics dedupe cleanup backlog remains", verify `(day,id)` index, adjust `CLEANUP_BATCHES` only when supported by measured volume.
- **Independent games:** until their own repositories load the shared Analytics V2 client, treat their zero opens/durations as **missing telemetry**, not true zero engagement.
- **Statistics precision:** recording can be delayed or lost by offline clients/browsers; the configured baseline means instrumentation readiness, not a transactional completeness proof.

## Pause and rollback without deleting history

To pause formal weekly email, set `REPORT_ENABLED=false` or remove that secret via the dashboard. Daily retention still runs; the weekly Cron is harmless. For a stronger pause, manually remove the weekly Cron from the reviewed Worker config and redeploy after reviewing the impact; do not disable unrelated ingestion or site publishing.

If the Phase 3 code must be reverted, deploy the preceding Phase 2 Worker **manually**, restoring its prior hourly Cron (or explicitly reviewing the alternative cleanup cadence). Keep D1 `analytics_daily`, `analytics_events` and migration 0004's delivery ledger intact: do not drop or roll back tables. Any report in `sending`/`uncertain` must be reconciled before resuming delivery; rolling back code does not cancel an email already accepted by Cloudflare.

## Verification before PR merge

```sh
npm ci
npm run gen -- --check
npm run verify:analytics
node tests/verify-analytics-weekly.mjs
npm run lint
npm run build
npm run verify -- --jobs=2
npx wrangler deploy -c Workers/wrangler-games-analytics.jsonc --dry-run
```

Tests use Node's in-memory SQLite, migrations 0001–0004, fake Worker bindings and a simulated sender. Tests must never contain a real recipient or provider secret; CI needs no Cloudflare account.
