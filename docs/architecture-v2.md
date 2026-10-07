# Architecture v2

Architecture v2 legacy migration and CSS P0–P6 are accepted as of 2026-10-07.
See the [final evidence and maintenance handoff](architecture-v2-final-handoff.md) for the accepted
commit, CI/deployment evidence, retained compatibility debt, and future change requirements.

The repository is now split into explicit domains:

- `src/platform/`: shared runtime capabilities (settings, chrome, frame, drawer, audio, storage, i18n).
- `src/games/`: game-specific modules extracted from large entrypoints and the home for all new games.
- `src/generated/`: generated runtime caches; never edit by hand.
- `worker/`: Cloudflare Worker entrypoint, separate from browser source.
- `tests/`: auto-discovered contract and end-to-end tests.
- `tools/`: scaffolding, asset tooling, and archived one-off migrations.

The former `js/*.js` shared-module paths have been removed. New code imports from
`src/platform` or stays inside its `src/games/<id>` package.

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
- Workflow concurrency cancels stale runs for the same ref.
- Browser tests have per-step timeouts so one hung smoke test cannot consume the whole job budget.
- Add new checks to the auto-discovered test suite instead of creating extra always-on workflows.

This keeps feedback fast while preserving one authoritative full validation before merge.

## CSS cascade migration

P6 retired Vite's former `shared-css-first` stylesheet-link reordering plugin after P4 proved
plugin-on/plugin-off behavioral equivalence and P5 froze the remaining compatibility tier. Production
now uses the normal Vite stylesheet graph with no CSS-specific post-build link reordering and no
`CSS_LAYER_CANARY` switch. The immutable P0 baseline, append-only rule-migration ledger, frozen P5
compatibility counts, and P3/P4 browser contracts remain authoritative; the remaining unlayered CSS is
an explicit compatibility allowlist, not a claim that every rule has already moved into `@layer`.

The rationale, target layer taxonomy, completed canary evidence, and rollback history are recorded in
[`docs/architecture-v2-css-layer-migration-plan-2026-09.md`](architecture-v2-css-layer-migration-plan-2026-09.md).
