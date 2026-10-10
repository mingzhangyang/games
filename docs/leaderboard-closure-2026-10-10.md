# Leaderboard completion — October 10, 2026

## Source of truth

The existing shared Worker remains the sole remote scoreboard: `Workers/game-scores.js`, generated from `games.config.json` by `npm run gen`. All new client implementations use `src/platform/leaderboard.js` through `src/platform/scoreboard-dialog.js`. Every score capability must lead to a visible ranking entry and a real end-of-run submission.

The new `scores.ui: "dialog"` entry declares shared visible UI ownership. `tests/verify-scoreboard-contract.mjs` checks registry, runtime graph, Worker keys and submission wiring; `tests/smoke-scoreboard-dialog.mjs` opens each UI in mobile and landscape browser viewports. Legacy custom leaderboard pages retain their existing layout contract.

| Game | Scoreboard key(s) | Sort | Eligible score |
| --- | --- | --- | --- |
| Carrot Pull | `carrot-pull` | High first | Final points on win or timeout; no mid-run submissions |
| Tank Battle | `tank-battle` | High first | Final points on defeat or completion |
| Needle vs Awn | `needle-awn-endless`, `needle-awn-dYYYYMMDD` | High first | Only Endless / Daily; trials and duels excluded |
| Firefly Signal | `firefly-signal-{first-light,two-meadows,midsummer}` | Low first | Successful run, encoded as `interventions * 1001 + (1000 - round(harmony * 1000))`; fewer signals then better harmony |
| Shadow Loom | `shadow-loom-{levelId}` | Low first | One completed run, encoded as `ceil(timeMs) * 1_000_000 + moves`; millisecond precision is primary, fewer moves break same-millisecond ties |
| Math Rain | `math-rain-{1..6}` | High first | Completed standard 180-second session at unchanged starting difficulty, no bombs/freeze/shield; premature loss and abandoned runs excluded |

**Scoring note:** Composite rank values are stored as integers in the existing leaderboard Worker, with human-readable formatting in the dialog. Do not build a leaderboard entry from Shadow Loom's independent *best time* and *fewest moves* local records; they may be from different attempts.

**Backward compatibility:** The historical `needle-awn` scoreboard key remains allowlisted to avoid deleting past results, but the UI deliberately does not show it: it historically mixed modes and is not suitable for fair comparisons. New endless submissions use `needle-awn-endless`; Daily retains its date-specific key.

**Scope exclusions:** Gomoku remains unranked until a difficulty-specific versus-AI win-streak system is designed, and Word Daily continues using its existing global participation/win-rate statistics instead of a saturated 1–6-guess leaderboard. External games are outside this repository.

**Validation and deployment:** Cloudflare Git automatically deploys the web app. The score Worker is deployed **manually**, separately, using `npm run deploy:scores` or GitHub Actions → Deploy Workers → scores; `npm run verify:scores:live` is an optional post-deploy check. The website does not publish the score Worker. Existing gameplay remains functional when a new board key is not yet supported; client-side feedback and a bounded local submission retry queue bridge the independent rollout. The backend accepts client-supplied scores; these boards are casual community rankings, not server-authoritative competition.

**CSS activation contract:** The six pages register the new `css/scoreboard-dialog.css` stylesheet through `tests/lib/css/feature-additions.mjs`. The additive component is layered under `components`, has a fixed consumer list, and is validated separately. The immutable CSS P0/P5 source/link/activation snapshots are compared after subtracting only this explicitly reviewed addition; unregistered CSS links and pre-existing CSS changes remain errors. Needle Awn's result row uses the existing shared `game-action-row` rather than a new page-specific rule.


## Concurrency-safe leaderboard storage (PR #130 review closure)

The public endpoint remains `Workers/game-scores.js`. Each distinct full game key now maps
to one `GameScoreBoard` SQLite-backed Durable Object through the `SCORE_BOARDS` binding.
Its synchronous SQLite KV snapshot mutations are atomic per board: concurrent submissions
cannot read the same stale list and overwrite each other. The existing best-per-nickname,
ascending/descending order, Top 50 cutoff, valid zero scores and write-refreshed Daily TTL
remain intact.

**Legacy migration:** `GAME_SCORES` KV remains bound only for *one-time read-only*
imports of historical `top:<game>` values when each board is first accessed. Migrated
snapshots persist in the Durable Object, including the historical mixed `needle-awn`
board under its own key. There are no subsequent KV writes and no fake empty board on
a failed initial KV read: the endpoint responds with a visible HTTP 503 so clients
can retry after recovery.

**Game lifecycle:** A Math Rain ranked run is disqualified whenever its selected base
difficulty *actually changes*, including while paused; switching back cannot restore
eligibility. Needle vs Awn Daily uses the frozen start-date key for both score upload
and the results dialog across UTC+8 midnight. Returning to the menu resets the date
context so a fresh dialog shows today's leaderboard.

**Release constraint:** `Workers/wrangler-game-scores.jsonc` now provisions the
`GameScoreBoard` class through a `new_sqlite_classes` migration. Run
`npm run verify`, `npm run build` and
`npx wrangler deploy --dry-run -c Workers/wrangler-game-scores.jsonc` before
manual score-Worker release (independent of automatic site publication). After first live migration,
**do not roll back only the scores Worker to KV-writing code**: it would show stale
snapshots and lose all scores written to Durable Objects. A deployed Worker roundtrip
is a separate release check, not performed by source-only verification.

## Modal keyboard isolation and independently published services

**Input ownership.** The shared native leaderboard dialog intercepts bubbling
`keydown`, `keyup` and `keypress` events at the dialog boundary. Modal
controls retain native text editing, focus navigation and Escape-to-close,
while background game handlers never receive these keys.

**Actual production topology.** The web app is published automatically by
Cloudflare's Git integration on `main`. Its release command is independent
of the manually operated score Worker. Do not configure its Cloudflare Deploy
command to deploy the score Worker. `npm run deploy` handles **only the web app**
as before. `npm run deploy:scores` explicitly deploys **only the score Worker**
and `npm run verify:scores:live` checks it after manual publication.
`deploy:all` is a separate, explicitly requested manual command that deploys
the score Worker first, verifies it, and then publishes the remaining services.

**Client/server compatibility.** When a newly published web UI queries a
scoreboard key unknown to the still-old manually deployed Worker, the API
returns HTTP 400. The dialog presents a localized "not yet available"
state (not a fabricated empty ranking). Failed submissions are saved in a
bounded browser-local queue and retried the next time a scoreboard is opened
or refreshed; a successful upload removes the matching pending entry.
Users can play normally while awaiting the manual Worker upgrade. If
browser storage is blocked/full, the dialog says the score could not be
saved; it never pretends the remote score was accepted. Opening a board
after the manual Worker upgrade requires no web app redeploy.
The queue is local to the browser profile and is not a cross-device sync.

**Manual release checklist:** (1) merge after CI; Cloudflare may auto-publish
the website immediately; (2) manually publish the score Worker whenever
the new leaderboard feature should become live, using `deploy:scores`;
(3) run `verify:scores:live`; (4) open a new leaderboard and verify the
pending upload notice clears. SQLite DO migrations happen during the
explicit score Worker publication. Never downgrade to a KV-writing Worker
after the migration; it would hide newer Durable Object scores.

## Board allocation and pause/input review closure

**Bounded Daily IDs:** The public score Worker accepts a calendar-valid UTC
`YYYYMMDD` suffix only in the last 30 UTC days, today, or the following UTC
day (necessary for UTC+8 date rollover). All 13 daily-key patterns share the
same check in `resolveGame()` before any Durable Object ID is created.
Malformed dates and out-of-range GET/POST requests return HTTP 400 without
touching storage. Static all-time boards remain unaffected. Old historical
days outside this bounded public window are no longer addressable through the
HTTP API; this intentionally limits persistent-object allocation.

**Modal lifecycle:** The shared modal still prevents global gameplay shortcuts
from receiving dialog key events. Tank Battle explicitly releases held
keyboard direction, D-pad pointer IDs and fire state when the dialog opens
and closes, using the same reset on blur and orientation change. Needle vs
Awn similarly releases held keys, active joystick and aim-touch identifiers
before pause/resume. Math Rain's logic rAF chain resets its running flag
when non-playing state ends a frame, allowing a later resume to restart
exactly one chain.

**Verification:** `verify-scoreboard-date` covers calendar and time-bound
validation plus both actual GET/POST Worker handlers with a Durable Object
allocation sentinel; `smoke-scoreboard-dialog` covers held inputs across modal
open/close; `smoke-math-rain` covers real loop termination and resumption.
The Web App and score Worker remain independently deployed.
