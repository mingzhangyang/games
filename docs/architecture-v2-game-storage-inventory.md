# Architecture v2 — GameStorage inventory

Phase 5 starts from the Phase 4 `main` baseline (`4dd07b3`, PR #57).
This inventory is the storage boundary for the migration batches; it is not a
request to rename or delete every existing key in one PR.

## Baseline scan

The scan covers `src/games/**/*.js` and the platform storage facade:

- direct `localStorage.*`: 0 (already protected by the architecture guard);
- files containing `storageSet(`: 23;
- files containing `storageGet(`: 22;
- files containing `storageRemove(`: 1;
- current `createGameStorage` users: Tetris, Word Daily, Carrot Pull, Hoop Shot, Bond Forge, Shadow Loom, Echo Cave, Maxwell Demon, Crystal Bloom, Flame Verse, and Ripple Duet.

The migration facade writes versioned slots as
`game:<game-id>:v<version>:<slot>`. It reads the new slot first, imports a
legacy key only when that slot is absent, and deliberately leaves the legacy
key in place during Phase 5.

## Classification rules

### A — platform-owned settings

These remain behind platform modules and do not move into a game namespace:

- `site_lang`, `site_theme`, `site_muted`;
- `player_name` and its compatibility aliases;
- any future site-wide profile or accessibility setting.

`pm_muted` is a legacy Planet Merge mirror of the global mute setting. It is
kept compatible for now and should be removed only with the global-settings
cleanup, not by a GameStorage migration.

### B — protocol and daily compatibility keys

Do not silently rename these keys. They are read by leaderboard/daily UI or
are part of a cross-page contract:

- server leaderboard identifiers passed to `submitScore`/`fetchBoard`;
- local leaderboard/daily cache families such as `*_lb_*`, `*_daily_*`,
  `*_local_<date>`, `gs_daily_*`, and `wd_daily_*`;
- daily course/cache families such as `gd_course_*`;
- Bond Forge's `bf_daily_<date>` completion marker.

These can be migrated later only with an explicit compatibility design and
fixtures for the consuming page or service. A local score table that is only
private UI state is not automatically a protocol key; the first batch treats
Hoop Shot's `hs_local_scores` as private state.

### C — game-private state

These are candidates for `createGameStorage`:

- best scores and streak records;
- level stars, unlocks, and progression;
- tutorial/help flags and game-only preferences;
- private local score tables that are not a daily/server contract.

## Current inventory

| Game | Keep as A | Keep compatible as B | Move to GameStorage (C) | Batch/status |
| --- | --- | --- | --- | --- |
| Tetris | `player_name`, `tetris_username` compatibility | leaderboard API keys | `tetris_scores`, `tetris_rainbow` | Already migrated |
| Word Daily | site settings | `wd_daily_*` | `wd_lang_mode`, `wd_word_len_en`, `wd_hist_*`, `wd_stats_*`; `wd_seen_help` already migrated | Later, mixed daily state |
| Circuit | site settings | `cc_daily_*`, `cc_local_*` | `cc_stars` | Later, mixed daily/local state |
| Lumen | site settings | `lm_daily_*`, local/daily board keys | `lm_stars` | Later, mixed daily/local state |
| Gravity Slingshot | site settings | `gd_daily_*`, `gs_daily_*`, local boards, `gd_course_*` | `gd_stars` | Later, daily cache needs care |
| Needle Awn | site settings | `zj_daily_*` | unlocks, stars, endless best, clash max | Later |
| Sword Flight | site settings | `sf_daily_*` | stage unlocks/stars, endless best, realm, combo | Later |
| Tower Defense | site settings | leaderboard integration | clear flags, per-level/global best, private local scores | Later, split across runtime/UI |
| Planet Merge | global mute compatibility | local score compatibility as needed | skin, best, private local scores | Later |
| Bond Forge | site settings | `bf_daily_<date>`, daily leaderboard contract | `bf_progress` | Phase 5 batch A |
| Hoop Shot | site settings/player profile | remote leaderboard contract | `hs_best`, `hs_longest_streak`, `hs_local_scores` | Phase 5 batch A |
| Carrot Pull | site settings | none | `cp_best_score` | Phase 5 batch A |
| Shadow Loom | site settings | none identified | `sl_seen_chapters`, `sl_progress` | Phase 5 batch B |
| Silk Dew | site settings | `sd_lb_*` | `sd_progress`, version marker | Later, existing custom migration |
| Echo Cave | site settings | `ec_lb_*` | `ec_progress` | Phase 5 batch B |
| Maxwell Demon | site settings | `md_lb_*` | `md_progress` | Phase 5 batch B |
| Crystal Bloom | site settings | `cb_lb_*` | `cb_progress` | Phase 5 batch C |
| Flame Verse | site settings | `fv_lb_*` | `fv_progress` | Phase 5 batch C |
| Ripple Duet | site settings | `rd_lb_*` | `rd_progress` | Phase 5 batch C |

The scan found no `storageGet/storageSet/storageRemove` call in Math Rain,
Tank Battle, Gomoku, Minesweeper, Reversi, or Firefly Signal. Their other
state contracts remain outside this inventory's scope.

## Batch A migration map

Branch: `refactor/game-storage-migration-a`

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `carrot-pull / best` | `cp_best_score` | `game:carrot-pull:v1:best` | Read legacy once; never delete it |
| `hoop-shot / best` | `hs_best` | `game:hoop-shot:v1:best` | New slot wins after migration |
| `hoop-shot / longestStreak` | `hs_longest_streak` | `game:hoop-shot:v1:longestStreak` | New slot wins after migration |
| `hoop-shot / localScores` | `hs_local_scores` | `game:hoop-shot:v1:localScores` | Preserve array and legacy key |
| `bond-forge / progress` | `bf_progress` | `game:bond-forge:v1:progress` | `bf_daily_<date>` stays legacy/protocol |

Each adapter is version 1 because this is a namespace migration, not a schema
rewrite. The existing GameStorage v1→v2 unit fixture remains in place; Batch A
adds per-game legacy fixtures that assert:

1. old values are read without loss;
2. the new slot is written in the expected JSON form;
3. the old key is still present;
4. a second read uses the new slot and does not re-import changed legacy data;
5. writing new state does not delete or overwrite the legacy key.


## Batch B migration map

Branch: `refactor/game-storage-migration-b`

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `shadow-loom / progress` | `sl_progress` | `game:shadow-loom:v1:progress` | Read legacy once; never delete it |
| `shadow-loom / seenChapters` | `sl_seen_chapters` | `game:shadow-loom:v1:seenChapters` | Keep chapter-intro history and the legacy key |
| `echo-cave / progress` | `ec_progress` | `game:echo-cave:v1:progress` | Keep `ec_lb_*` outside GameStorage |
| `maxwell-demon / progress` | `md_progress` | `game:maxwell-demon:v1:progress` | Keep `md_lb_*` outside GameStorage |

Batch B deliberately leaves the local leaderboard cache families on the platform
storage facade because they are protocol/compatibility state rather than private
game progress. Its regression fixture verifies the new versioned slots, idempotent
re-import behavior, preservation of the old keys, and non-interference with the
leaderboard cache keys.


## Batch C migration map

Branch: `refactor/game-storage-migration-c`

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `crystal-bloom / progress` | `cb_progress` | `game:crystal-bloom:v1:progress` | Keep `cb_lb_*` outside GameStorage |
| `flame-verse / progress` | `fv_progress` | `game:flame-verse:v1:progress` | Keep `fv_lb_*` outside GameStorage |
| `ripple-duet / progress` | `rd_progress` | `game:ripple-duet:v1:progress` | Keep `rd_lb_*` outside GameStorage |

Batch C extends the progress-only migration pattern from Batch B. Each runtime
keeps only its leaderboard cache reader on the platform storage facade while
private progress reads/writes go through a versioned GameStorage adapter. The
legacy progress key is imported once and retained, and the migration fixture
asserts canonical-slot precedence plus leaderboard-cache non-interference.
