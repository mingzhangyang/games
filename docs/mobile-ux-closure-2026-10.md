# PR #132 — Mobile Gameplay UX Closure

## Why now

Architecture v2 Phase 0–9 and CSS W1–W7 are complete. The next mobile
workstream must repair real interaction failures rather than reopen the global
CSS deduplication campaign. The registry currently owns 25 playable games.
The web app auto-deploys from main; the `game-scores` Worker is **manual**
and is not deployed by this PR.

## Reviewed user journeys

| Surface | Coverage / source of truth | This PR |
| --- | --- | --- |
| Standard topbar, footer, themes, mobile/desktop shells | Existing `verify-chrome`, `verify-theme`, `verify-css-live-activation` over registry-derived pages | No ungrounded restyle; retain 44px effective topbar targets |
| Standard start menu, 320/390px constraints | Existing `verify-start-menus`, `verify-css-p3*`, `verify-sidebar-family` | Retain menu scrolling and existing mobile-stage layout |
| Mobile statistics drawer | 16 games covered by `verify-stats-drawer`; Tetris by `verify-tetris-drawer` | Fix first-frame open/close and stale closing-animation races at the common owner |
| Native leaderboard dialog | Six games covered by `smoke-scoreboard-dialog` (Tank Battle landscape; others portrait) | Add a 320px active-modal regression and adaptive visual-viewport handling for the native nickname editor |
| Immersive / horizontal battlefield | `verify-immersive` and `smoke-tank-battle` / `smoke-tower-defense` | Retain their explicit landscape and safe-area exceptions; do not stretch logical canvases |
| Restart during live play | `verify-contextual-restart` over all 12 consumers | No new reset button or duplicated restart state |

## Confirmed cross-game defects and fixes

1. **Bottom drawer rAF race**: Opening the statistics drawer scheduled both
   the CSS transition and `body.drawer-locked` on the next frame. If the
   user immediately closed it, that stale callback could **re-lock the page**
   after close. Acquire the lock immediately, cancel the pending entry frame
   on close, and avoid an exit transition if the drawer never reached its first
   visible frame.
2. **Drawer close/reopen race**: A previous `transitionend` listener or 320ms
   fallback could finish a new close that happened shortly after reopening.
   Cancel the previous completion when reopening and accept only the backdrop
   opacity transition (not bubbling transitions from children).
3. **iOS keyboard/visual viewport**: Native modal default centering and CSS
   `dvh` can remain tied to the layout viewport while the virtual keyboard
   shrinks/pans the visual viewport. The shared scoreboard dialog now measures
   `visualViewport` on resize/scroll and focus changes, and constrains and
   centers itself **only while a dialog editor is focused and the visual
   viewport is reduced by keyboard-sized height**. When keyboard focus or
   dialog ends, every overridden inline property and event listener is
   restored. The page/body is not fixed or scrolled; no new CSS source,
   runtime poller, or game-owned UI controller is introduced.

## Acceptance and evidence boundary

- `npm run build`, `npm run gen -- --check`, `npm run verify -- --jobs=2`
  and the normal Architecture v2 / dist / Worker dry-run checks must pass
  on **this PR's latest head**.
- Regression tests: shared drawer rapid open/close on every registered drawer
  consumer; close/reopen while the old animation completes; leaderboard dialog
  visible on 320px; 16px native nickname/select input sizing; deterministic
  visualViewport keyboard, pan, duplicate-listener and restore tests.
- Existing gameplay, score compatibility, URL/DOM IDs, storage keys, frame
  geometry and stylesheet ownership remain unchanged.
- **Not claimed**: real iOS Safari/Android hardware keyboard, notch safe-area
  or manual visual screenshot signoff. Those require device testing after CI,
  especially portrait 320/390 widths and Tank/Tower landscape. If those expose
  other concrete defects, address them in a focused follow-up rather than
  inventing a “fully tested on devices” claim.
