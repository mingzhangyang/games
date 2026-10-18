# Architecture v2

Architecture v2 legacy migration and CSS P0–P6 were accepted on 2026-10-07 and the follow-up CSS
dedupe (W1–W7) closed in October 2026. The migration plans, ledgers and hand-off evidence are kept
for history in [`docs/archive/`](archive/); the migration-era bookkeeping checks (P0 snapshots,
append-only CSS ledgers, debt ratchets, package-wave contracts) were retired on 2026-10-18 once
every category had reached zero.

The repository is now split into explicit domains:

- `src/platform/`: shared runtime capabilities (settings, chrome, frame, drawer, audio, storage, i18n).
- `src/games/`: game-specific modules extracted from large entrypoints and the home for all new games.
- `src/generated/`: generated runtime caches; never edit by hand.
- `worker/`: Cloudflare Worker entrypoint, separate from browser source.
- `tests/`: auto-discovered contract and end-to-end tests.
- `tools/`: scaffolding, generators, checks and asset tooling.
- `js/`: only the homepage entry (`index-page.js`) and its gen-derived zh table.

Every game page boots `src/games/<id>/...` directly; the former `js/<id>.js` re-export shims are
gone. New code imports from `src/platform` or stays inside its `src/games/<id>` package.
`tests/verify-architecture.mjs` enforces the boundaries: games never import another game,
platform/home never import a game, Workers never import browser modules, games reach storage only
through GameStorage / safe-storage, and every registry page boots its own package.

## New games

1. Add the game to `games.config.json`. New entries should point `entry` to
   `src/games/<id>/index.js`.
2. Run `npm run new:game -- <id>`.
3. Implement rules/rendering inside that game package.
4. Run `npm run gen` and `npm run verify:changed`.

The scaffold uses the standard shell, GameRuntime, versioned platform services, and declarative
i18n bindings. It deliberately keeps game rules out of platform code.


## CI resource policy

CI minutes are treated as a constrained project resource.

- During normal development, prefer `npm run verify:changed` and targeted smoke tests.
- Full `npm run verify` is reserved for pull-request candidates or an explicit manual run.
- The Architecture v2 workflow runs on pull requests or `workflow_dispatch`, not on every push.
  It splits into parallel jobs — static checks + build, sharded browser suites
  (`--browser --shard=k/n`), and the built-output gate set (`--dist`) — so wall time is the
  slowest shard, not the sum.
- Workflow concurrency cancels stale runs for the same ref.
- Browser tests have per-step timeouts so one hung smoke test cannot consume the whole job budget.
- Add new checks to the auto-discovered test suite instead of creating extra always-on workflows.

This keeps feedback fast while preserving one authoritative full validation before merge.

## CSS cascade

P6 retired Vite's former `shared-css-first` stylesheet-link reordering plugin; production uses the
normal Vite stylesheet graph. Cascade correctness is now guarded by behaviour, not bookkeeping:
stylelint, the shared-layout browser checks (`verify-chrome`, `verify-theme`, `verify-desktop-frame`,
`verify-stats-drawer`, `verify-immersive`, `verify-start-menus`, `verify-sidebar-family`,
`verify-leaderboard-layout`, `verify-css-hidden-contract`, …) and the same set re-run against the
real production build (`node tests/verify-all.mjs --dist`). The remaining unlayered CSS is ordinary
page CSS; move rules into `@layer` only when a change needs it.

History: [`docs/archive/architecture-v2-css-layer-migration-plan-2026-09.md`](archive/architecture-v2-css-layer-migration-plan-2026-09.md).
