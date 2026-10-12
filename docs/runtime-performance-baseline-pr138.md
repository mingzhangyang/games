# PR #138 - Runtime Performance Baseline Closure

Status: **implementation candidate; empirical sign-off requires a completed opt-in run**.

## Goal and scope

Complete the three unfinished #136 scenarios (Silk Dew on mobile and desktop,
Needle Awn on mobile), collect three comparable browser samples of 25 registered
games across mobile and desktop (150 measured rows), and classify repeat-confirmed
rAF-probe candidates. Do not change gameplay, fail rules, scoring, storage,
canvas geometry, CSS, production telemetry, Cloudflare deployment or Worker/D1.

The #136 baseline was **47/50 INCOMPLETE**, with one repetition per scene
in a GPU-disabled 4-core Linux Chrome container. These numbers are observations,
not a performance verdict. This PR adds no hard FPS thresholds to always-on CI.

## W1 - Legitimate, test-only input for time-limited games

In tools/lib/runtime-profile/scenarios.mjs (not the production registry):

- **Silk Dew:** enter real S1 via the existing test-hook start method; use
  Puppeteer's mouse pointer to grab its first rope anchor, including in the emulated mobile viewport and make small controlled
  motions while holding it. The game's unmodified rest/stall check deliberately
  distinguishes active dragging from abandonment. Sampling pauses release the
  pointer before opening the drawer; resume starts a fresh legitimate drag.
  This is an **S1 held-anchor workload**, not a complete puzzle solve. A newly
  won, failed, inert or released interaction invalidates that sample.
- **Needle Awn:** enter **Endless** with the real visible #na-btn-endless
  button. Puppeteer keyboard movement on desktop and in the mobile emulated viewport moves the player to the lower arena and sweeps horizontally, while
  the game's own enemy waves continue to spawn. The game still owns damage,
  deaths, difficulty and time. This is a **controlled survival-lane workload**,
  not representative combat/dueling or a claim about the old levels-mode run.
  Verify observable player displacement and a live endless mode.
- **Sword Flight:** retains its established lighter Zen-mode baseline; a
  representative Endless-mode stress test is deliberately outside this PR.
  Never compare the Zen number as if it represented Endless combat.

tools/lib/runtime-profile/interaction.mjs is an external browser driver:
no internal state writes, no game-clock overriding, no invulnerability or
synthetic gameplay event injections. Every start, pointer/keyboard input path,
input tick count and observable effect is attached to raw result JSON.
Inputs are released in a finally block on completed or failed measurements.
Unsuccessful controls turn the row **incomplete**, not quietly measured.
  The mobile viewport uses controlled mouse/keyboard events (not touch); this
  characterizes its rendering and simulation under a declared workload, **not**
  touch handling on a phone. PR #135 and existing per-game smoke tests own
  touchscreen interaction validation independently. Under the GPU-disabled
  headless performance runner, sustained touch emulation failed to deliver a
  stable game input, despite correctly hit-tested Canvas coordinates. Rather
  than tampering with gameplay or counting partial contact as measured, the
  baseline uses the verified browser pointer/keyboard paths and labels this
  limitation explicitly. Do not present these runs as device-touch QA.

## W2 - Comparable repetitions and evidence

- Every registered game has one mobile and one desktop recipe; 25 x 2 x 3
  produces **150 expected rows**. The runner's original strict accounting
  still rejects missing, duplicate, extra and incomplete rows.
- The Markdown report retains **all individual results**, and adds per
  game/viewport/**workload/input recipe** medians and observed ranges. Never
  aggregate unlike starting modes or mobile touch and desktop pointer APIs.
- A candidate requires at least **three comparable completed samples** with
  median-of-run rAF-probe p95 above 33.3 ms; no actual FPS is inferred.
  Incomplete or single-run data remain exploratory.
- runs.json is checkpointed after each attempt; results.json and
  summary.md are produced on completion. Generated files remain ignored
  under .tmp-perf and do not belong in a Git commit.
- Per-run source SHA, browser version, host information, Chrome flags, viewport,
  input recipe, start path, phases, CPU metric deltas and memory evidence stay
  in the report. They establish provenance, not hardware equivalence.

## Run and artifact collection

Manual local command (sequential; do not run while installing dependencies):

    npm ci
    npm run gen -- --check
    npm run build
    npm run profile:runtime -- --all --viewports=mobile,desktop \
      --preset=baseline --repeat=3 --out=.tmp-perf/pr138

For a lower-cost recipe smoke before a full measurement:

    npm run profile:runtime -- \
      --games=silk-dew,needle-awn --viewports=mobile,desktop \
      --preset=quick --repeat=1 --out=.tmp-perf/pr138-quick

Opt-in GitHub Action: **Opt-in runtime performance baseline**, via
workflow_dispatch (choose branch, games, preset and repeat), or label the PR
perf-profile-smoke for a two-game quick smoke, then perf-profile-baseline for
the full 150-run baseline on the exact candidate head SHA. Normal PR updates
do **not** trigger either heavyweight workflow.
Artifacts upload even if a run is incomplete, with hidden .tmp-perf paths
included. The normal Architecture v2 CI checks only deterministic contracts.

### Empirical sign-off (must be filled with measured evidence, never guesses)

- [ ] Local or Action quick browser validation of Silk Dew + Needle Awn
- [ ] Three repeats, 25 games x two viewports: **150/150 measured**
- [ ] Save a link to exact-head summary.md, results.json and job logs
- [ ] Reassess #136's Sword Flight, Firefly Signal, Shadow Loom and Ripple Duet
      from the three-run distribution, then select actual traces for #139
- [ ] Check source and built browser smoke, full verify, worker dry-run,
      latest-head CI and Copilot (including previously missed)

**No numerical claims are added by this code-only PR until this checklist has
real runner evidence.** An incomplete or failed performance run means the
empirical gate remains open, even when deterministic CI succeeds.

## Metric caveats and follow-up

The lightweight rAF observer measures scheduling cadence, not actual frames
rendered by any game's pipeline. CDP TaskDuration, ScriptDuration and heap
snapshots do not determine full-device CPU load or prove leaks. The runner
uses --disable-gpu; an unaccelerated Chromium emulation is not real iOS
Safari or Android Chrome hardware. A p95 above 33.3 ms is an **investigation
candidate**, not a gameplay defect. PR #139 may take targeted traces or
hardware measurements after confirmed repeatability. Avoid redesigning
render loops to optimize misleading container-only numbers.

Neither Cloudflare web automatic deployment nor the separately manually
deployed game-scores Worker is altered by this test-only batch.
