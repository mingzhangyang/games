# PR #136 — Runtime Performance Audit & Reproducible Baseline

## Purpose and evidence boundary

Following PR #135 (`main@123a7c0`), Architecture v2 and CSS W1–W7 are closed.
This PR adds **opt-in, test-only** performance instrumentation. No game state,
scoring/leaderboard key, storage format, canvas geometry, stylesheet ownership,
Worker, or automatic site deployment is changed.

**Important distinction:** a reproducible *harness* is not a completed empirical
*benchmark*. Measurements must be produced by running the commands below on
an actual checkout with `npm ci`, a runnable Chrome binary and a current
`dist/` build. Do not fabricate FPS, claim 25 games measured because the
scenario table contains 25 entries, or attribute a simulated Chromium viewport
to physical iOS/Android hardware.

## Inventory and source-of-truth

- Game membership and hrefs are obtained dynamically from `games.config.json`
  through `tools/lib/registry.mjs`, currently **25 games**.
- `tools/lib/runtime-profile/scenarios.mjs` owns test-only, reviewed transition
  recipes, not registry capabilities or production lifecycle control.
- Each adapter declares explicit initialization and active-run evidence. The
  16 shared-drawer start semantics were checked against
  `tests/verify-stats-drawer.mjs`; scoreboard-dialog consumers and the two
  immersive games were checked against their existing smoke tests.
- Standard selectors are clicked via the real browser. Existing public
  debug/test-hook methods are used only where current smoke tests use them;
  the exported report identifies every such start as `test-hook`, not a UI action.
- Tank Battle starts its game loop during construction, so its baseline is
  an **already active** run and it is not needlessly restarted. The initial
  sample is never mislabelled as a menu sample. Tetris already constructs a
  piece in its menu, so a piece alone is not proof of start; its active
  predicate also requires a live animation handle and non-paused state.
- Gomoku has no separate menu: the measurement reports an **idle board**
  instead of falsely calling it menu time, and uses a real canvas click.
  Word Daily is already playing at boot: it also records an idle baseline.
  Minesweeper requires a real first reveal after opening its board.
- Sword Flight is profiled in **zen** mode (the menu's meditation flight):
  an unattended endless run loses all lives inside the 15 s baseline window,
  while zen takes no damage and stays active through active/pause/resume.
  Zen spawns fewer hazards than endless, so its numbers are a lighter workload
  and must not be read as endless-mode cost.
- Mobile shared-drawer pages measure a named pause lease and subsequent release,
  not a second synthetic pause variable. Games without this drawer report
  `not-supported` for those phases; desktop drawer buttons may be hidden,
  so no attempt is made to click an invisible mobile-only toggle.
- Deep memory restart cycles run only for explicitly supported in-page
  restart actions, never through fresh reloads masquerading as leak detection.

## Run it (outside CI, on a clean production build)

```sh
npm ci
npm run gen -- --check
npm run build
CHROME_BIN=/absolute/path/to/chrome npm run profile:runtime -- \
  --all --viewports=mobile,desktop --preset=baseline --repeat=3 \
  --out=.tmp-perf/pr136
```

One-game local diagnostic / quick adapter validation:

```sh
npm run profile:runtime -- \
  --games=tetris,word-daily --viewports=desktop --preset=quick --repeat=1 \
  --out=.tmp-perf/pr136-quick
```

Deep lifecycle exploration, not appropriate for CI:

```sh
npm run profile:runtime -- \
  --games=math-rain,tetris,shadow-loom --viewports=mobile \
  --preset=deep --repeat=3 --out=.tmp-perf/pr136-deep
```

The CLI serves **`dist/` by default** with `tests/lib/serve-static.mjs` and
closes the local server/browser in `finally`. Source-mode is explicitly
`--source=source`, but its data must not be conflated with production build
results. Every run uses a fresh isolated browser context, fixed language/mute,
service-worker bypass, deterministic local Worker HTTP stubs, blocked third-
party requests and a `domcontentloaded` navigation followed by a game-specific
ready predicate. There is **no** real score POST.

Runs are sequential, with checkpointed raw `.tmp-perf/.../runs.json` (survives
an interrupted run), final `results.json` and `summary.md`. These generated
files and heavyweight Chrome traces must remain outside Git. Failed,
incomplete, unexpected, missing and duplicate game/viewport/repetition rows
explicitly make `summary.complete=false` and cause a nonzero process exit.

## Profiles and supported viewport evidence

| Mode | CSS viewport | Interpretation |
| --- | --- | --- |
| mobile default | 390×664, DPR 3 / emulated Android UA | Browser emulation only; code using mobile UA takes its mobile branch |
| landscape mobile | 839×360, DPR 2.625 | Tank Battle and Tower Defense |
| desktop | 1280×900, DPR 1 | All registered games |
| small | 320×454, DPR 2 | Opt-in stress profile |

The shared browser flags still contain `--disable-gpu`; results are CPU/main-
thread diagnostics, not hardware-accelerated GPU throughput. Host CPU model,
logical cores, OS, exact Chrome version/flags, source commit SHA, viewport,
render mode, preset and start path are recorded in raw JSON.

`quick` is a short functional shakedown, not a benchmark. `baseline` uses 2 s
warmup, 5 s pre-run, 15 s active, 5 s pause and 10 s resume where supported.
`deep` adds repeated in-page resets plus 20 s active windows.

## Metric definitions: don't confuse unlike facts

- **rAF interval p50/p95/p99**, counts above 33.3/50/100 ms: computed from
  a small observer callback added during active sampling. This is **rAF probe
  cadence**, not actual game render FPS. Discrete games don't receive a probe.
  The menu/idle measurement never creates an artificial continuous rAF loop.
- **TaskDuration, ScriptDuration, LayoutDuration, RecalcStyleDuration:**
  Chrome CDP `Performance.getMetrics` *counter deltas*, converted from seconds
  to ms. These do not measure full-device CPU utilisation.
- **Long Tasks:** `PerformanceObserver` with `longtask` where supported;
  unsupported values are `null`, not zero. Duration/count are collected per
  sampling window.
- **JS Heap, DOM nodes:** before/after snapshots. A positive delta is not
  proof of a leak. Deep runs can add post-GC time-series of in-page restart
  cycles; attribution still requires targeted heap-retainer inspection.
- **DOMContentLoaded, FCP, ready-observed upper bound:** navigation and
  performance data. Browser-automation observation delay is labelled; it is
  not precise application init latency.
- **Start transition observed time:** includes Puppeteer automation round
  trips; must not be presented as genuine user input-to-paint latency.

A missing observer/counter, omitted phase or unsupported game interaction is
reported as N/A/`not-supported`, never a guessed zero or silently green check.

## Classification and follow-up process

A p95 rAF-probe interval above 33.3 ms is merely an **investigation candidate**.
A slow browser in CI is not grounds for a gameplay redesign. Require repeated
samples on the same host/version, reproducible real-user impacts and ideally
a targeted trace before proposing a PR #137 change. Suggested priorities:

| Priority | Evidence needed | Action |
| --- | --- | --- |
| P0 | Reproducible freeze, incorrect lifecycle or loss of user work | Independent urgent fix |
| P1 | Clear repeated user-visible slowdown with grounded module owner | PR #137 shortlist |
| P2 | Moderate repeatable slowdown and low-risk fix | Optional follow-up |
| P3 | Unconfirmed, expected or host-specific variance | Document only |

Static candidates worth **investigating, not declaring defects**:

1. Math Rain has its own adaptive `PerformanceOptimizer`; compare its internal
   FPS estimate to measured rAF scheduling, instead of assuming all games use
   the same render clock.
2. Tetris runs a continuous rAF draw loop while active and uses layered
   canvases. Check render work only if a measured main-thread hotspot exists.
3. More complex physics/particle scenes (Silk Dew, Maxwell Demon, Shadow Loom,
   Firefly Signal) may justify separate CDP traces if repeatable active-window
   outliers appear.

None of these hypotheses is a proven performance bug without run evidence.

## Tests / release gate

The **only** always-on addition is the lightweight, deterministic
`tests/verify-runtime-profile-contract.mjs`: registry closure and inverse
mutations, valid/invalid CLI selections, nested runtime predicates, counter
units, percentile math, unsupported metrics, and report completeness.

The full benchmark deliberately remains `tools/dev/runtime-profile.mjs` and
is not discovered by `tests/verify-all.mjs`. No new CI workflow and no
performance threshold added to existing CI. Final PR head must pass:

```sh
npm run gen -- --check
npm run build
npm run verify -- --jobs=2
node tests/lib/run-css-p4-dist-gates.mjs
npx wrangler deploy --dry-run --outdir .wrangler-dry-run
```

### Empirical results status

The first opt-in quick scenario audit on GitHub Actions run **38188564680**
produced **49/50 measured** scenes. One explicitly incomplete scene was
**Tetris / mobile**, caused by targeting the desktop-only Start button; the
scenarios now select the visible Start control. The run also revealed that
pull-request Actions checkout must use the head SHA (not GitHub synthetic merge
SHA) and hidden `.tmp-perf` artifacts must be explicitly included. Both
infrastructure defects are corrected. Quick-run observations, including
Sword Flight / Shadow Loom mobile rAF-probe p95 near 33 ms, are
**investigation hypotheses, not gameplay defect claims**, until repeated
full-baseline measurements validate them.

No full 25-game production-build **baseline** run is recorded in this document yet.
Do **not** merge as a "measured performance baseline" without attaching a
real run's `summary.md` and verifying completeness on the same commit. The
harness and contract tests are valuable independently, but the measured #137
priority order remains **unassigned** until real data exists.
