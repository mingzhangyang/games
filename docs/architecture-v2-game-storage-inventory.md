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
- current `createGameStorage` users: Tetris, Word Daily, Carrot Pull, Hoop Shot, Bond Forge, Shadow Loom, Silk Dew, Echo Cave, Maxwell Demon, Crystal Bloom, Flame Verse, Ripple Duet, Circuit, Lumen, Gravity Slingshot, Needle Awn, Sword Flight, and Planet Merge.

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
| Reversi | site settings / player profile | remote leaderboard API | mode, AI difficulty, streak records, private local scores | Phase 5 batch I |
| Minesweeper | site settings / player profile | remote leaderboard API | difficulty, per-difficulty best times, private local scores | Phase 5 batch I |
| Firefly Signal | site settings | none | per-level best intervention/harmony records | Phase 5 batch I |
| Math Rain | site settings | none identified | SFX/music volumes, persistent coins/items | Later, custom multi-module state |
| Tetris | `player_name`, `tetris_username` compatibility | leaderboard API keys | `tetris_scores`, `tetris_rainbow` | Already migrated |
| Word Daily | site settings | `wd_daily_*` | `wd_lang_mode`, `wd_word_len_en`, `wd_hist_*`, `wd_stats_*`; `wd_seen_help` already migrated | Later, mixed daily state |
| Circuit | site settings | `cc_daily_*`, `cc_local_*` | `cc_stars` | Phase 5 batch D |
| Lumen | site settings | `lm_daily_*`, local/daily board keys | `lm_stars` | Phase 5 batch D |
| Gravity Slingshot | site settings | `gd_daily_*`, `gs_daily_*`, local boards, `gd_course_*` | `gd_stars` | Phase 5 batch H |
| Needle Awn | site settings | `zj_daily_*` | unlocks, stars, endless best, clash max | Phase 5 batch E |
| Sword Flight | site settings | `sf_daily_*` | stage unlocks/stars, endless best, realm, combo | Phase 5 batch E |
| Tower Defense | site settings | leaderboard integration | clear flags, per-level/global best, private local scores | Later, split across runtime/UI |
| Planet Merge | `pm_muted` global mute mirror | `pm_daily_*` daily-best compatibility | skin, best, private local scores | Phase 5 batch F |
| Bond Forge | site settings | `bf_daily_<date>`, daily leaderboard contract | `bf_progress` | Phase 5 batch A |
| Hoop Shot | site settings/player profile | remote leaderboard contract | `hs_best`, `hs_longest_streak`, `hs_local_scores` | Phase 5 batch A |
| Carrot Pull | site settings | none | `cp_best_score` | Phase 5 batch A |
| Shadow Loom | site settings | none identified | `sl_seen_chapters`, `sl_progress` | Phase 5 batch B |
| Silk Dew | site settings | `sd_lb_*` | `sd_progress`, version marker | Phase 5 batch G |
| Echo Cave | site settings | `ec_lb_*` | `ec_progress` | Phase 5 batch B |
| Maxwell Demon | site settings | `md_lb_*` | `md_progress` | Phase 5 batch B |
| Crystal Bloom | site settings | `cb_lb_*` | `cb_progress` | Phase 5 batch C |
| Flame Verse | site settings | `fv_lb_*` | `fv_progress` | Phase 5 batch C |
| Ripple Duet | site settings | `rd_lb_*` | `rd_progress` | Phase 5 batch C |

The original Phase 4 scan did not see direct storage calls for Math Rain,
Tank Battle, Gomoku, Minesweeper, Reversi, or Firefly Signal because those
games had not yet completed the Phase 9 package move into `src/games`. A
post-Phase 9 re-scan exposed private persistence in Reversi, Minesweeper,
Firefly Signal, Math Rain, plus the already-deferred Tower Defense and Word
Daily state. Batch I therefore migrates the three low-risk games first; the
mixed/custom state games remain separate follow-ups.

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


## Batch D migration map

Branch: `refactor/game-storage-migration-d`

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `circuit / stars` | `cc_stars` | `game:circuit:v1:stars` | Keep `cc_daily_*` and `cc_local_*` on the compatibility facade |
| `lumen / stars` | `lm_stars` | `game:lumen:v1:stars` | Keep `lm_daily_*` and `lm_local_*` on the compatibility facade |

Batch D is the first mixed-state migration: the runtime still legitimately uses
the platform storage facade for Daily and local leaderboard/cache contracts, while
private stars move to GameStorage. The usage guard therefore rejects only direct
legacy stars access and separately asserts that the protocol key families remain
present. The migration fixture verifies legacy import, canonical precedence,
legacy-key retention, and non-interference with Daily/local data.


## Batch E migration map

Branch: `refactor/game-storage-migration-e`

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `needle-awn / unlockedLevel` | `na_unlocked_level` | `game:needle-awn:v1:unlockedLevel` | Keep `zj_daily_*` outside GameStorage |
| `needle-awn / levelStars` | `na_level_stars` | `game:needle-awn:v1:levelStars` | Preserve object shape and legacy key |
| `needle-awn / endlessBest` | `na_endless_best` | `game:needle-awn:v1:endlessBest` | Preserve numeric semantics |
| `needle-awn / clashMax` | `na_clash_max` | `game:needle-awn:v1:clashMax` | Preserve numeric semantics |
| `sword-flight / unlockedStage` | `sf_unlocked_stage` | `game:sword-flight:v1:unlockedStage` | Keep `sf_daily_*` outside GameStorage |
| `sword-flight / stageStars` | `sf_stage_stars` | `game:sword-flight:v1:stageStars` | Preserve object shape and legacy key |
| `sword-flight / endlessBest` | `sf_endless_best` | `game:sword-flight:v1:endlessBest` | Preserve numeric semantics |
| `sword-flight / maxRealm` | `sf_max_realm` | `game:sword-flight:v1:maxRealm` | Legacy localized strings import unchanged |
| `sword-flight / maxCombo` | `sf_max_combo` | `game:sword-flight:v1:maxCombo` | Preserve numeric semantics |

Batch E migrates the remaining private progression records for Needle Awn and
Sword Flight. Needle Awn continues to use the platform storage facade only for
its `zj_daily_*` completion/score contract. Sword Flight keeps all
`sf_daily_*` reads and writes in `model/daily.js`; private record modules no
longer import the platform storage facade. Legacy private keys remain available
for one-time import and rollback compatibility.


## Batch F migration map

Branch: `refactor/game-storage-migration-f`

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `planet-merge / skin` | `pm_skin` | `game:planet-merge:v1:skin` | Read legacy once; preserve the selected skin and legacy key |
| `planet-merge / best` | `pm_best` | `game:planet-merge:v1:best` | Preserve numeric best-score semantics |
| `planet-merge / localScores` | `pm_local_scores` | `game:planet-merge:v1:localScores` | Preserve the private local score table and legacy key |

Batch F is intentionally Planet Merge only. The runtime still uses the platform
storage facade for two compatibility contracts: `pm_muted` remains a legacy
mirror of the site-wide mute setting written alongside `site_muted`, and
`pm_daily_*` remains the Daily best-score family. Neither key family is exposed
as a Planet Merge GameStorage slot. The migration fixture verifies one-time
legacy import, canonical-slot precedence, legacy-key retention, and
non-interference with both compatibility contracts.


## Batch G migration map

Branch: `refactor/game-storage-migration-g`

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `silk-dew / progress` | `sd_progress` | `game:silk-dew:v1:progress` | Complete the historical v1→v2 downgrade transaction before canonical import; retain the legacy payload |

Batch G is intentionally Silk Dew only because `sd_progress_version=2` is not a
normal storage namespace version. It records a historical gameplay/scoring migration:
completed legacy levels are reduced to one star and their incomparable `bestDrags`
values are cleared. The adapter preserves the original read-back transaction boundary:
if rewriting `sd_progress` fails, it does not advance the version marker and it does
not create the canonical slot, so the next load can retry safely.

After the historical transaction succeeds, `game:silk-dew:v1:progress` becomes
authoritative and later progress writes use GameStorage only. The retained
`sd_progress` / `sd_progress_version` pair remains available for rollback
compatibility, while `sd_lb_*` leaderboard cache keys stay on the platform storage
facade and are never exposed as GameStorage slots.


## Batch H migration map

Branch: `refactor/game-storage-migration-h`

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `gravity-slingshot / stars` | `gd_stars` | `game:gravity-slingshot:v1:stars` | Import the legacy star array once and retain the old key |

Batch H is intentionally Gravity Slingshot only. The private handcrafted-level
star array moves to GameStorage, while all Daily and service-facing state keeps
its existing compatibility contract: `gd_daily_*` stores the per-day best,
`gs_daily_*` marks Daily Hub completion, `gd_local_*` remains the local
leaderboard fallback, and `gd_course_*` remains the deterministic Daily course
cache managed through the platform safe-storage facade.

The migration fixture verifies legacy import, canonical-slot precedence, legacy
key retention, level-count padding, and non-interference with all four protocol
and cache families.


## Batch I migration map

| GameStorage slot | Legacy key | New key | Compatibility rule |
| --- | --- | --- | --- |
| `reversi / mode` | `rv_mode` | `game:reversi:v1:mode` | Import once; retain legacy key |
| `reversi / difficulty` | `rv_diff` | `game:reversi:v1:difficulty` | Import once; retain legacy key |
| `reversi / bestStreak` | `rv_best_streak` | `game:reversi:v1:bestStreak` | Import once; retain legacy key |
| `reversi / streak` | `rv_streak` | `game:reversi:v1:streak` | Preserve existing read semantics; retain legacy key |
| `reversi / localScores` | `rv_local_scores` | `game:reversi:v1:localScores` | Local fallback only; remote leaderboard contract unchanged |
| `minesweeper / difficulty` | `ms_diff` | `game:minesweeper:v1:difficulty` | Import once; retain legacy key |
| `minesweeper / best:<difficulty>` | `ms_best_<difficulty>` | `game:minesweeper:v1:best:<difficulty>` | Three existing difficulties mapped explicitly |
| `minesweeper / localScores:<difficulty>` | `ms_local_<difficulty>` | `game:minesweeper:v1:localScores:<difficulty>` | Local fallback only; remote leaderboard contract unchanged |
| `firefly-signal / best:<level>` | `fs_best_<level>` | `game:firefly-signal:v1:best:<level>` | Existing three level ids mapped explicitly |

Batch I is deliberately limited to private local state. It does not change
remote leaderboard submissions, player identity, global language/mute settings,
or gameplay behavior. Legacy keys remain in place after import.
