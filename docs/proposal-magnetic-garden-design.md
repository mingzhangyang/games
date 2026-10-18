# 磁极花园 · Magnetic Garden

> Implementation specification · 2026-10-18 · `magnetic-garden`
>
> Extends the discrete push/pull direction in `proposal-new-game-ideas.md` §3.2.
> This document is the rule and release contract for the first 24 gardens.

## Experience

Move magnets, flip their poles, and guide little seeds into flowerpots. Every
completed puzzle becomes a miniature flowering garden. The player reasons about
shared influence, stopping positions and the order in which seeds take root.

The game is untimed. There is no currency, energy, waiting, date unlock or random
physics. All four chapters and all 24 levels are available from the collection.
The suggested order teaches one relationship at a time; later gardens combine
multiple seeds, shielding, temporary blockers and competing magnets.

## Authoritative rules

- Boards have at most six columns and eight rows. Cell IDs are row-major integers.
- Seeds have a permanent N or S polarity. They do not exert magnetic force on one
  another. These are discrete game rules inspired by magnetic attraction and
  repulsion, not a simulation of real magnetic fields or magnetic monopoles.
- A movable magnet can be placed from the tray onto an empty socket, moved to
  another empty socket, or flipped. Each accepted action costs one move. Selecting,
  previewing, cancelling, and invalid actions cost nothing. A fixed magnet cannot
  move or flip. Moving a magnet is an atomic relocation; its transit path is irrelevant.
- A seed chooses the nearest magnet in its row or column with an unobstructed
  straight sightline. Stones and intervening magnets block that sightline; seeds
  and flowerpots do not. Two or more equally near magnets cause interference: the
  seed does not move this turn, even if their potential forces agree.
- Unlike poles attract; like poles repel. Direction is computed after the player's
  magnet action, once per seed, then frozen for the entire turn. A sliding seed
  cannot turn or switch to another magnet halfway through a turn.
- Sliding resolves in simultaneous one-cell microsteps. Board edges, stones,
  magnets and captured seeds stop motion. Empty sockets do not stop seeds.
- Occupancy is read at the start of each microstep. A seed cannot enter a cell
  occupied by another seed even if that seed intends to leave. Seeds cannot swap.
  If multiple seeds propose the same empty cell, all of them stop before entering.
  A stopped seed remains stopped for the rest of the turn.
- Entering any empty pot immediately captures a seed, regardless of polarity.
  It blooms, stops moving permanently, and becomes a physical blocker for others.
- The garden is complete exactly when all seeds have been captured.

Object-array order, animation duration and frame rate must not influence the
result. State changes are pure and immutable; rendering consumes the resulting
state and microstep frames.

## Interaction and accessibility

The primary input is tap-select then tap-destination. Flipping is an explicit
action, not a double-tap or a gesture players must discover. Show a candidate
action's exact path and final seed positions before confirmation. Preview and
execution call the same transition function.

Keep the board orthogonal, with clear N/S lettering and distinct marks beyond
colour. Use native controls, a semantic grid, keyboard movement/selection and a
live status announcement. Important controls and board hit targets must remain
at least 44 CSS pixels at the supported mobile sizes. On short landscape screens,
keep controls reachable through an intentional inner layout/scroll treatment
rather than shrinking the entire board into unusable targets.

Undo restores one full committed turn, including captured seeds and move count;
it remains available after completion. Cancelling or interrupting an animation
must never leave a half-settled logical board. Restart replaces the current run
while retaining earned garden records. Level selection and completion are not
active gameplay. A foreground unsolved puzzle includes thinking time as gameplay.

Hints first explain the relevant relationship, then propose one next action.
A search resource limit is not evidence of a dead end. Only a complete exhausted
search may report that a state cannot finish. Hints and previews must not block
normal input for an unbounded period.

## Content and scoring

| Chapter ID | 中文 | Purpose |
| --- | --- | --- |
| `greenhouse` | 初芽温室 | Attraction, repulsion, sockets, relocation and flipping |
| `twins` | 双生花圃 | A shared magnet controls more than one seed |
| `stonepath` | 石径庭院 | Shielding, temporary blockers and completion order |
| `aurora` | 极光苗圃 | Multiple magnets, interference and combined routes |

Each chapter has six individually authored/curated boards, bilingual names and
conceptual hints. They must not be mere mirrored copies used to inflate the count.
Level content carries a revision and a solution trace. An exhaustive breadth-first
search using the production transition proves the stored optimal move count.
Every solution is independently replayed in verification. Resource exhaustion
returns `unknown`, never `unsolvable` or an invented optimal score.

- One star: complete the garden.
- Two stars: meet the garden's authored excellent-move threshold.
- Three stars: match its proven optimal move count.
- Undo discards the undone branch's move cost; these rankings measure solutions,
  not how many experiments a player needed.
- Each chapter's leaderboard score is the sum of saved personal-best move counts
  for all six gardens in that chapter. Incomplete chapters cannot be submitted.
  Lower is better. Equal scores tie; elapsed time is not a tiebreaker.
- Keys: `magnetic-garden-greenhouse`, `magnetic-garden-twins`,
  `magnetic-garden-stonepath`, `magnetic-garden-aurora`.
- A content or rule change that changes comparable scores requires an explicit
  record/leaderboard versioning decision. Never silently reuse an old competition
  for different puzzles.

## Visual direction

An intimate ceramic nursery: cream tray, mint foliage, coral N magnets and lake-blue
S magnets. Use material thickness, small shadows and restrained highlights instead
of glow-heavy panels. The dark theme is a quiet evening greenhouse; the light theme
is daylight on cream ceramic. Maintain readable text in both.

The board must remain unambiguous throughout flowering. Leaves and petals cannot
hide neighbouring cells, pole markings or the path preview. Completed gardens in
the collection express progression. Motion is short and purposeful; reduced-motion
mode retains the information and removes unnecessary movement.

## Architecture and integration

The implementation lives in `src/games/magnetic-garden/`; the page is
`magnetic-garden.html`. This is a standard member of the existing games repository,
not a separate deployment or new backend.

- `model/`: immutable rules, content, deterministic bounded solver.
- Session/runtime: selection, action confirmation, undo, progress and interruption
  ownership. No collision or magnetic rules duplicated here.
- Renderer/UI: DOM/SVG garden pieces, exact preview, accessible input and animation.
- Composition root: `mountGameRuntime`, shared chrome, locale binding, chapter
  scoreboard and Analytics V2 observers.
- `GameStorage`: canonical versioned progress, current level and recoverable action
  history. Validate stored data against current content and replay legal actions
  instead of trusting arbitrary serialized board state. Storage denial must leave
  the game playable, and corrupted records must not produce eligible scores.
- `games.config.json`: sole registry source. Run `npm run gen` for homepage metadata,
  build entries, sitemap, related games and Worker allowlists.
- Page CSS: fully scoped `@layer pages`, admitted through the existing post-freeze
  page contract without changing immutable CSS snapshots or shared geometry.

No daily capability is declared. Analytics records opens, foreground active time
and active-puzzle time through the existing client. Menus, completion, pause and
modal interruption must not count as active-puzzle time. Track a genuine run start
and first completion once; preview/undo/render do not create extra events.

The generated score and analytics Worker allowlists must be published through the
repository's normal Worker release process before the new game's server features
work in production. This addition does not need a D1 schema migration.

## Acceptance gates

1. All 24 levels finish through replay and have verified shortest solutions.
2. Reordering seed/magnet arrays leaves semantic results unchanged; tied magnets,
   same-cell conflicts, vacating-cell blocks, captures and invalid actions have
   explicit regression cases.
3. Real pointer and keyboard operations can preview, complete and undo a garden;
   the preview result equals the committed result.
4. Refresh restores the current board and undo history; completion records survive
   restart and moving to another garden. Invalid/future-version data is safe.
5. All chapters are reachable regardless of calendar date; chapter scores require
   six valid completed levels and use that chapter's own key.
6. Verify mobile 320px/390px, landscape and desktop; no horizontal page overflow,
   no inaccessible controls, readable English/Chinese, both themes, reduced motion.
7. Pause, visibility changes and scoreboard dialogs preserve logical state and
   correctly gate gameplay analytics; late hint/animation work cannot mutate a
   different level after navigation.
8. Run lint, registry generation check, full verification, production build and
   the relevant built-output gates. Report environment/pre-existing failures
   separately from failures introduced by this game.

## Original artwork

The menu uses an original greenhouse illustration with coral and blue ceramic
magnets among flowering pots. A second, quiet top-down workbench illustration
frames play. Both were created specifically for this game; exact prompts and
source hashes are retained in `assets/magnetic-garden/manifest.json`. The
repository includes the high-quality WebP artwork and its display derivatives.

The two runtime WebP images total 466,510 bytes. The menu retains its vector
fallback until the hero loads, and theme-specific opacity keeps the workbench
behind the board. Rule-bearing cells, polarity letters, seed pieces, flowers,
preview paths and controls remain crisp SVG/DOM. The homepage and social preview
use separately cropped WebP/JPEG derivatives.
