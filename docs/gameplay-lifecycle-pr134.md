# PR #134 — Cross-game gameplay lifecycle consistency

## Scope
After PR #133, the last **13 shared statistics-drawer games** use the same
temporary pause lease controller. There are 16 shared-drawer consumers in total
(three were already leased by #133); Tetris has its own drawer and retains its
existing implementation. The reusable binding is located in
`src/platform/runtime/pause-ownership.js`. It requires each game to declare
`canResume` and `autoResumeOnForeground`, and installs one visibility owner
instead of competing listeners. Gameplay state/physics remain with each game.

## Per-game behavior
| Games | Foreground after hidden | Preserved policy |
| --- | --- | --- |
| Planet Merge, Hoop Shot | Manual | Show the existing paused overlay; release any held aiming/flick |
| Sword Flight | Manual | Show the existing paused overlay and clear held keyboard controls |
| Gravity Slingshot | Automatic if uncontested | Abort a flight on page hide, then resume the same hole's aiming state |
| Lumen, Circuit, Silk Dew, Bond Forge, Echo Cave, Maxwell Demon, Crystal Bloom, Flame Verse, Ripple Duet | Automatic if uncontested | Quietly freeze ongoing simulation and clear held controls where necessary |

Gravity Slingshot defers timed daily auto-advance until all interruption leases clear; a hole epoch ignores stale timers after restart or replay. The final-release notification does not transfer an old run's resume entitlement. Bond Forge pointer cancellation belongs to its input module, keeping the runtime within the frozen 76 KiB budget.

Silk Dew cancels interrupted pointer capture and releases the physics world's held drag. Bond Forge restores interrupted atom moves, returning borrowed tray atoms or restoring the original position and bonds instead of silently consuming atoms. These are cancellation paths, not completed moves.

A manual user pause never grants auto-resume permission. A new run, a level
transition or return to the menu invalidates resume rights held by older
drawers or hidden-page owners. Active UI leases remain held, so replacing a
run cannot start gameplay behind an open statistics drawer. The app does not
mirror gameplay state in a second pause flag.

## Verification and deployment
- `verify-drawer-interruptions` closes all 17 registry drawer entries and
  checks lease algebra, foreground policy, duplicate listeners and run invalidation.
- `verify-stats-drawer` exercises actual game starts, drawer open/close,
  hidden/foreground ordering, manual resume visibility and run replacement.
- `verify-gravity-slingshot-daily-interruptions` exercises live daily
  auto-advance with drawer, background overlap, and stale restart timers.
- Retain the six #133 scoreboard/visibility tests, source and dist browser
  checks, full `npm run verify -- --jobs=2`, generation, build and Worker dry-run.
- PR #135 remains a distinct **physical-device** iOS Safari/Android signoff;
  Chromium automation does not certify hardware/soft keyboard behavior.

No game rules, scores Worker, D1, score protocol, URLs, DOM IDs, storage keys,
CSS baseline or deployment topology are changed. Cloudflare automatically
publishes the web app from main; the scores Worker deploy is manual and not
part of this PR.
