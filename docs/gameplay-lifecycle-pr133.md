# PR #133 — Gameplay interruption ownership

## Scope
Follow-up to #130–#132. The six new shared leaderboard-dialog games now use
`src/platform/runtime/pause-ownership.js` for *temporary interruption leases*.
A lease is keyed by an owner (`ranking`, `drawer`, `hidden`), not by a
second copy of the game's state. The game's existing pause/resume implementation
continues to own simulation, clocks, input and visual overlays.

## The invariant
- First interruption snapshots whether the current run was really active.
- Repeated events for the same owner are idempotent.
- Every owner must release; early UI close must not resume while the page is
  hidden or another surface is still open.
- A pre-existing manual pause never becomes an automatic resume entitlement.
- An interruption configured for manual foreground resume permanently revokes
  automatic resume for that ownership cycle.
- A new run / menu / result transition invalidates any older resume permission.
  It does not remove active UI leases, so a new run cannot run behind a modal.
- `releaseInputs` runs on acquisition even when the game is already paused:
  an isolated dialog keyup cannot leave movement, fire or drag asserted.
- A released lease never restarts a completed or replaced run.
- Native `dialog.close()` events are queued. A stale close dispatched after
  a synchronous re-open cannot release the new opening's lease or viewport
  observers; the browser gate covers this close/reopen race.

## Explicit policies
| Game | Background return | Rank/dialog pause | Other input protection |
| --- | --- | --- | --- |
| Carrot Pull | Auto if uncontested | `ranking` | Pressed button released; Escape blocked while held |
| Firefly Signal | Auto if uncontested | `ranking` | Menu and result-afterglow rAF pause while hidden, preserving prior visibility behavior |
| Shadow Loom | Auto if uncontested | `ranking`, `drawer` | Active drag ends on interruption |
| Tank Battle | **Manual resume** | `ranking` | Keyboard/D-pad/fire released on blur/rotate/interruption |
| Needle vs Awn | **Manual resume** | `ranking`, `drawer` | Keyboard, joystick and aiming touch released |
| Math Rain | **Manual resume** | `ranking` | Settings close routes through guarded resume event; session deadline compensated once |

Carrot Pull also uses the shared `drawer` lease. For the other 13 statistics
drawers the old onPause/onResume adapter stays supported and unchanged; this
PR does not silently migrate other games or redefine their lifecycle.

`bindPageVisibility` is the only visibility listener for each of these six.
Firefly no longer enables a second independent visibility listener in
`GameRuntime`. These policy choices are intentional: an auto-resume game may
resume only after every temporary owner is gone; a manually-resumed game
requires deliberate user action after switching away.

## Tests and release boundary
- `tests/verify-gameplay-interruptions.mjs` tests lease ordering, duplicate
  events, manual pauses, run invalidation, and the declared six-game ownership
  mappings. Browser coverage tests the actual modal and visibility transitions.
- Existing `verify-stats-drawer`, `smoke-scoreboard-dialog`,
  `verify-contextual-restart`, `smoke-math-rain`, and all game smoke tests
  remain required, including source and dist checks.
- No gameplay rules, timer duration, ranking keys/eligibility, scores Worker,
  storage keys, URL/DOM IDs, frozen CSS audits or deployment topology changes.
- Build/verify/Worker dry-run on the latest PR head. iOS/Android device testing
  remains an explicit manual follow-up, not something Chromium CI can certify.

The web app is automatically published when `main` changes; the scores Worker
was independently deployed and verified after #130. PR #133 does not deploy it.
