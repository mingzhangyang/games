# Games Analytics V2 — Phase 2: shared client and game lifecycle

Phase 2 follows merged PR #141 (Gomoku first-valid-stone fix) and PR #142 (D1-only Worker). **games.config.json is the single executable source of game IDs**. The generator derives Worker IDs, cross-origin allowlist and the browser validator. The table below is an audit of gameplay meanings, *not* a second registry.

## Data flow and metric semantics

Each main-site registered HTML game loads /analytics.js exactly once. Its small deferred IIFE creates one anonymous per-document UUIDv4 session ID and per-event UUIDv4 IDs. No cookies, local storage, long-lived user identifier or fingerprint are created. Each actual new document creates one open; reload creates another, page-internal restart and back/forward cache restore do not.

The game facade src/platform/analytics.js retains track(gameId, 'play'|'finish'). src/platform/runtime/game-runtime.js adds a read-only lifecycle observer through bindAnalyticsPlaying. The observer reads the existing game isRunning()/isPlaying/state and pause flags, without modifying game states or creating per-game timers. Exceptional games use an optional analyticsPlaying predicate or register a read-only callback explicitly. Game behavior and leaderboard keys do not change.

- **open**: one real loaded registered game document, not a menu link click.
- **play**: one real new attempt, never each board move, frame, or button press.
- **finish**: a terminal completed/failed round, not page close, pause or abandoned run.
- **activeSeconds**: foreground visible, focused, recently interacted page time; idle after 60 seconds, browser-background time, frozen 2.5s+ timer gaps, and device sleep do not count.
- **playingSeconds**: activeSeconds only while the game's own lifecycle reports actually playing, excluding idle, pause, result and menus. Sandbox may report this with no invented finish.

Activity is sampled about once per second with monotonic performance.now and emitted at approximately 30-second cumulative checkpoints or on background/pagehide. Each event is at most 60 whole seconds. There is one shared timer per document, no per-frame networking or pointermove/touchmove uploads. UTC+8 date transitions flush the previous-day bucket. A Phase 2 occurredAt timestamp bounded to plus/minus 24h allows Worker day attribution across retries. At most one sampled second near exact midnight may be imprecisely attributed.

Events use a bounded **in-memory** queue (16 pending records max, up to three attempts each; 8-second abort bound, backoff). A retried event preserves its payload and event ID and relies on D1 unique indexes. On unload, sendBeacon or fetch keepalive is used best-effort. A tab close or prolonged outage may lose unsent metrics; no persistent backlog is kept. The game never waits for analytics and never fails because telemetry does.

The client probes V2 support on approved published origins and sends the additive duration/time fields only if the Worker advertises playingSeconds in its response; old V2 workers continue to receive their supported schema, and older Workers accept legacy play/finish. On localhost, analytics is silent unless a test deliberately enables an isolated loopback mock. Tests never post to the production Worker.

## Lifecycle audit of all registered main-site games

| Game ID | Actual start: play | Actual end: finish | Notable edge case |
| --- | --- | --- | --- |
| math-rain | Arithmetic run starts | Run/game session ends | Observe GameStateManager, exclude pause |
| tetris | Start/restart run | Game over | Running animation and pause-aware predicate |
| tank-battle | Automatic initial run or restart | Terminal defeat/final victory | Next wave is not next play |
| gomoku | First legal stone in a new board | Win or draw | PR #141: no repeated play for each move |
| planet-merge | Start daily/endless run | Game over | Menu and pause excluded |
| word-daily | First valid committed guess, daily or practice | Puzzle solved or attempts exhausted | Loading/restoring unsolved daily puzzle is not play |
| hoop-shot | Start run | Final round result | Pause and menu excluded |
| minesweeper | First valid reveal | Mine or victory | Opening menu/flags before reveal not play |
| reversi | Start or real play-again | Game over | No play just for viewing initial menu |
| tower-defense | Start/restart run | Terminal result | Waves and tower actions are not new plays |
| gravity-slingshot | Enter campaign/daily run | Whole run complete | Completed holes not new plays |
| needle-awn | Start level/endless/daily/duel | Game over | Restart counts new run |
| sword-flight | Flying begins | Victory or game over | State source is isPlaying/isPaused |
| lumen | Begin a level/daily puzzle | Puzzle solved | Reset board in same attempt not new play |
| circuit | Begin level/daily puzzle | Puzzle solved | Reset board not new play |
| silk-dew | Begin/retry stage | Stage cleared or failed | Former custom names not valid Worker events |
| bond-forge | Begin each stage attempt or free sandbox | Stage cleared, including daily stages | Daily/campaign summaries do not add finishes; sandbox has none |
| echo-cave | Begin/retry stage | Stage cleared or failed | Former custom names normalized |
| maxwell-demon | Begin/retry stage | Stage cleared or failed | Former custom names normalized |
| crystal-bloom | Begin/retry stage | Stage cleared or failed | Former custom names normalized |
| flame-verse | Begin/retry stage | Successful assay/level completion | Wrong assay is neither play nor finish |
| ripple-duet | Begin level or daily course, explicit retry | Level completed or final daily wave | Intermediate daily waves stay within one daily run |
| carrot-pull | Begin/restart round | Terminal result | Pause ownership respected |
| firefly-signal | Begin real round | Completed result | Idle animations not gameplay |
| shadow-loom | Begin level/solve attempt | Correct completed shadow | Result overlay and pause excluded |
| loop-jail | Start/restart run | Run ended | No per-tick play events |

Bond Forge treats a stage attempt as one play: a started or retried level reports `play` and a successful clear reports one `finish`. Neither a campaign/daily summary nor abandoning a stage produces a second finish. Sandbox reports play but has no terminal finish. Word Daily gameplay time begins after the first valid committed guess, not during unsubmitted typing, matching its first `play` event.

Every listed local HTML page automatically gets open and active sampling. Games with shared mount also get playingSeconds with a read-only observer. Non-mount composition roots math-rain, tank-battle and gomoku register an explicit lightweight observer.

## Standalone repositories: separate PRs are required

| Registry ID | External repository | Existing implementation on main | Next integration |
| --- | --- | --- | --- |
| minecraft | mingzhangyang/2d-minecraft | src/utils/analytics.ts, legacy play/finish | Register sandbox playing predicate, no invented finish |
| dots | mingzhangyang/dots-and-boxes | src/client/analytics.ts, legacy play/finish | Bind real match lifecycle including online/local modes |
| stack | mingzhangyang/the-stack | src/utils/analytics.ts, legacy play/finish | Bind game run-start, game-over and pause |

These three are registered and have legacy play/finish reporting but **do not yet have actual page opens or durations at their separately deployed pages**. Changes to those other repositories are deliberately not included in this PR. The bridges and four-colors repositories also exist, but neither is currently registered as an external game in games.config.json; do not infer IDs or count main-site outgoing clicks as opens.

### Reusable standalone integration recipe

In the separately hosted game's real HTML entry (once):

    <script src="https://games.orangely.xyz/analytics.js" defer
      data-analytics-game="dots" data-analytics-external="true"></script>

Then, after its own runtime has been constructed, provide a read-only state predicate and replace any direct Worker legacy reporting (otherwise both old and new clients would double count):

    window.hubAnalytics?.bindPlaying('dots', () => game.isRunning() && !game.isPaused);
    // In genuine start/new-match path only:
    window.hubTrack?.('dots', 'play');
    // In true end-of-match path only:
    window.hubTrack?.('dots', 'finish');

The example assumes `isRunning()` is a method and `isPaused` a boolean property: adapt both to the actual standalone game API. Do not accidentally test a method reference (`game.isRunning`) as a truthy value; check menu, paused and result states explicitly.

If the runtime initializes before the deferred analytics script, register the callback through window.__gamesAnalyticsPlaying = new Map([['dots', ...]]) before it loads, or bind again on DOM readiness. Every string shown above is an example: use the **registered** ID, never a scoring/daily leaderboard key. Check CSP allows loading the shared script. No need for a new analytics database, Cookie, GA SDK, or dependency.

For new external games: add the canonical origin and ID to games.config.json, run npm run gen, and deploy the updated Worker with that generated CORS allowlist before the independent site integration. A game must emit open from its own HTML, never from the main site's link.

## Validation and manual acceptance

- tests/verify-analytics-v2.mjs: Node 22 real SQLite applies migrations 0001 and 0002, exercises D1 trigger/rollups, old API shape, strict V2 validation, duplicate ID, session open uniqueness, concurrency, daily boundaries and external-origin CORS.
- tests/verify-analytics-browser.mjs: Chromium loads real DOM pages and a local fixture; checks refresh, duplicate script loading, play/finish, pause/resume, visibility restoration, long idle/sleep, bounded retries with immutable IDs, Worker outage and registered external ID. Network interception rejects production analytics requests.
- tests/verify-analytics-compat.mjs: isolated browser-script tests verify KV legacy, unavailable Worker, Phase 1 D1 V2 and Phase 2 D1 V2 event payloads without production requests.
- tests/verify-analytics-game-lifecycles.mjs: Chromium checks representative actual game runtimes for stage/daily attempts, first actions, pause, retry and completion.
- tests/verify-gomoku.mjs: Chromium performs actual legal/illegal board moves on desktop and mobile using a localhost V2 mock, preserving PR #141.
- Generator, lint, build and all other playable/regression checks remain required: npm run gen -- --check; npm run lint; npm run build; npm run verify -- --jobs=2.

Manual smoke: iOS Safari, Android Chrome, desktop Chromium/Firefox. Open each tested game (one open), reload (another open), restart within page (no extra open). Start one real run, pause for a minute, hide or lock the screen for a minute, then resume and check activeSeconds/playingSeconds do not include hidden time. Leave an idle tab for more than 60 seconds, finish a run, start a new run, and verify counts. Test a disconnected Worker and Safari without sendBeacon, confirming the game still plays. Explicitly check daily Word Daily restore/guess, pre-first-click Minesweeper flags, Gomoku invalid/valid stones, free Bond Forge sandbox, and multiwave Ripple Daily.

## Boundaries and next step

The totals are anonymous document/attempt counts, not unique people. An abandoned attempt has no finish, a sandbox has no finish, and a terminated tab may lose its last unconfirmed checkpoint. Conservatively discarding long throttled samples can undercount heavily loaded browsers. Existing historical active duration remains recorded but has **0 historical playing duration** rather than fabricated values.

**Phase 3 weekly report entry:** query GET /stats?v=2&from=YYYYMMDD&to=YYYYMMDD for seven inclusive UTC+8 days, then derive per-registered-game opens, plays, finishes, active and playing seconds. Scheduling, email provider, recipients, send-once key, missing-data behavior and template are a separate PR. No reporting email is provisioned by Phase 2.
