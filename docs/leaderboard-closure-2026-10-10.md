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

**Validation and deployment:** First merge source/tests; then deploy the main site and `npm run deploy:scores` (new Worker allowlist) together. Do not deploy the site without the Worker whitelist. The backend accepts client-supplied scores; these boards are casual community rankings, not server-authoritative competition. For anti-cheat requirements, the score-proof protocol and persistence backend would need separate work.

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
coordinated main-site and scores-Worker deployment. After first live migration,
**do not roll back only the scores Worker to KV-writing code**: it would show stale
snapshots and lose all scores written to Durable Objects. A deployed Worker roundtrip
is a separate release check, not performed by source-only verification.
