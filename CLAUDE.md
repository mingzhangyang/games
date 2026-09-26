# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

This is a collection of single-page HTML5 games built with vanilla JavaScript, built with Vite and deployed to Cloudflare Workers (static assets via `wrangler.jsonc`). The games include:

- **Math Rain** (`math-rain.html`) - Mathematical expression game with modular architecture
- **Tetris** (`tetris.html`) - Modern Tetris implementation with themes, combo system, and global high scores
- **Tank Battle** (`tank-battle.html`) - Classic arcade-style tank combat game
- **Gomoku** (`gomoku.html`) - Five-in-a-row board game vs AI or another player
- **Planet Merge** (`planet-merge.html`) - Suika-style physics merge game (hand-rolled circle physics, daily challenge; daily + alltime leaderboards served by the shared `game-scores` Worker as `planet-merge` / `planet-merge-d<YYYYMMDD>`)
- **Word Daily** (`word-daily.html`) - Bilingual daily word puzzle (EN 5-letter words / ZH 成语 with definitions; modules in `js/word-daily*.js`; global aggregate stats Worker in `Workers/word-daily-stats.js`, KV binding `WORD_STATS`); DOM-only, no game loop
- **Hoop Shot** (`hoop-shot.html`) - Flick-basketball arcade (one miss ends the run, fire-mode streaks, hand-rolled projectile physics; leaderboard served by the shared `game-scores` Worker as `hoop-shot`)
- **Minesweeper** (`minesweeper.html`) - Classic logic puzzle (safe first click, iterative flood reveal, chording, long-press/right-click flags; fastest-clear leaderboard per difficulty)
- **Reversi** (`reversi.html`) - Othello strategy board game (negamax + alpha-beta AI with three levels and an endgame solver, pass-and-play mode, CSS 3D disc flips; global win-streak leaderboard)
- **Tower Defense** (`tower-defense.html`) - Neon grid tower defense (pulse/frost/cannon/tesla towers, 25 waves, upgrades & 70% sell-back, ×2 speed; fixed 480×640 logical coordinates scaled at render time; global score leaderboard)
- **Gravity Slingshot** (`gravity-slingshot.html`) - Original orbital physics puzzle: pull-back slingshot launch, softened inverse-square gravity, fixed 1/120s substep integration shared by the trajectory preview and real flight (fully deterministic); 20 handcrafted holes (bodies may carry `tone`/`ring` visual props) with star ratings + a **daily course** (5 holes seeded from the UTC+8 date, generated with a ballistic sampler that verifies solvability and honest par); daily score = total launches, posted to per-day leaderboard keys `gravity-d<YYYYMMDD>` (asc) handled by the shared game-scores Worker
- **Pinpoint Clash: Needle vs Awn 针尖对麦芒** (`needle-awn.html`) - Cyber-ink martial precision action duel: head-on tip-to-tip clash mechanics with hit-stop time dilation, dual stances (Silver Needle bullet-time thrust vs Golden Awn solar nova sweep), Awakened Lotus ultimate, 10 handcrafted trial stages with bosses, endless survival, seeded daily duel, and 1v1 arena duel (vs AI or 2P local); leaderboard served by the shared `game-scores` Worker as `needle-awn` and `needle-awn-d<YYYYMMDD>`
- **Sword Flight 御剑飞行** (`sword-flight.html`) - Oriental Xianxia kinetic soaring action: smooth flight physics with aerodynamic banking, multi-segment cloth & tassel simulation, 9 handcrafted celestial stages, endless flight, seeded daily realm, and zen meditation flight; thread celestial rings for pentatonic harmonies, perform invincible sword qi dashes to cleave crags and absorb tribulation thunder, ascend through cultivation realms (炼气 -> 筑基 -> 结丹 -> 元婴 -> 化神 -> 渡劫) to command companion sword formations and unleash the screen-clearing Thousand Swords ultimate; leaderboard served by the shared `game-scores` Worker as `sword-flight` and `sword-flight-d<YYYYMMDD>`
- **index.html** - Game collection landing page (links out to external games too); its Daily Hub shows 3 tasks: Word Daily (`wd_daily_*`), Planet Merge (`pm_daily_*`), Gravity Slingshot (`gs_daily_<YYYYMMDD>`, written when the daily course is finished)

## Architecture

### Build & Deploy
```bash
npm run dev         # Vite dev server
npm run build       # Vite production build -> dist/ (multi-entry, legacy plugin, terser)
npm run deploy      # vite build && wrangler deploy
npm run preview     # wrangler dev (serves dist/ + src/index.js worker)
npm run gen         # 由 games.config.json 重新生成全部登记点（见 registry 契约）
npm run verify      # 全量校验体系（21 项，见 Testing）
npm run verify:quick  # 日常档（15 项：gen-check + lint + 8 个离线校验器 + 5 个关键在线项）
```

### Contract docs（docs/contracts/）
- `layout.md` — 页面骨架契约：shell/topbar/main/stage/sidebar/overlay/toast/footer 几何 + 语义标签 + 桌面舞台纵向预算
- `chrome.md` — Header 三槽位 / Footer / `bindChrome` 职责边界
- `registry.md` — `games.config.json` 单一登记源、gen 工具链、caps 语义
- `style.md` — 设计令牌表、hex 收敛规则、eslint/stylelint 配置要点
- `theme.md` — 浅色 / 深色模式：`site_theme` 偏好、`theme-boot.js` 首屏、`theme-light` cap、画布调色板、游戏分类与分期

### 其他长青文档
- `docs/traps.md` — 踩坑日志（事故复盘 + 各自的回归脚本），按领域分组
- `docs/backlog.md` — 已确认、已定位、待独立改动的缺口；校验器里每处 knownGaps 降级都必须在此有条目
- `docs/archive/` — 已被契约文档取代的历史底稿与评审记录

- Source HTML/CSS/JS live at the repo root, `css/`, and `js/`; `public/` holds static assets copied verbatim into `dist/` (including `404.html` for Cloudflare's `not_found_handling`).
- `src/index.js` is the Worker entry: it redirects `/dots-and-boxes*` to the external game and falls through to static assets.
- `Workers/game-scores.js` is the **single leaderboard Worker for the whole site** (deployed to `game-scores.orangely.workers.dev`, one KV namespace `GAME_SCORES`, per-game keys `top:<game>`; all-time keys plus daily keys like `planet-merge-d<YYYYMMDD>` / `gravity-d<YYYYMMDD>` matched by regex; per-game `order: asc|desc`). The former per-game workers (tetris-highest-scores, planet-merge-scores, hoop-shot-scores) were consolidated into it — their sources were removed from this repo and their deployed instances can be deleted with `npx wrangler delete --name <name>`. Historical scores were replayed into `GAME_SCORES` via `scripts/migrate-legacy-scores.mjs`. ⚠️ **Its `GAMES` map and `DAILY_PATTERNS` are gen-derived — never hand-edit them.** They live inside `// registry:begin games-scores` sentinels and are rewritten from `games.config.json` by `npm run gen`; a hand edit is silently reverted on the next run and `npm run gen -- --check` goes red. To add a game: add its entry (with a `scores` block) to `games.config.json`, then `npm run gen`. The authoritative per-game list is that file, not this bullet. See `docs/contracts/registry.md`. Deploy config: `Workers/wrangler-game-scores.jsonc`.

### Key Components

**Utility Modules**:
- `js/performance-monitor.js` - FPS tracking and performance metrics (used by Math Rain)
- `js/config-manager.js` - Config management (used by Math Rain; defaults only — no `config/game-config.json` exists)
- `js/player.js` — global player identity shared by all leaderboards (see below)

**Game-specific JavaScript**:
- `js/math-rain/main.js` - Math Rain orchestrator; game logic is event-driven across `js/math-rain/` (systems/, core/, i18n/)
- `js/tetris.js` - Tetris game engine and logic
- `js/tank-battle.js` - Tank Battle game implementation
- `js/gomoku.js` - Gomoku board, win detection, and AI

### Shared infrastructure
- `js/player.js` — global player identity: all games read/write `localStorage.player_name` (auto-migrates legacy `tetris_username`/`pm_username`/`hs_username`); landing page edits it too
- `js/site-settings.js` — **site-wide settings, the single entry point for language & sound**: canonical keys `site_lang` (`'en'|'zh'`, also written by the landing page) and `site_muted` (`'1'|'0'`); first read migrates legacy per-game keys (`pm/hs/wd/ms/rv/td/gd_lang`, `*_muted`, `tankBattleLanguage`); writes dispatch a `site-settings:changed` event, cross-tab sync is the native `storage` event. Every game reads language through `getLang()` and sound through `getMuted()/setMuted()` — never write per-game `_lang`/`_muted` keys in new code
- `js/icons.js` — inline SVG icon set (`ICONS.home/soundOn/soundOff/pause/play/retry/close/flag/copy/check/mine/help/stats/calendar/dice/share/arrowRight/trophy`, 24×24 stroke=currentColor) for **icon-only control buttons and text-labeled action buttons**; JS stateful toggles (mute) and i18n text rewrites set `innerHTML` from it (`${ICONS.x}<span>${text}</span>`). Text-labeled buttons that carry an icon must also take `game-btn` (see the layout contract bullet) — it makes the label+icon an `inline-flex` row and sizes the icon to 15px, otherwise the inline SVG sits on the text baseline and looks raised. Emoji policy (icons.js note + 2026-09-18 audit): text-labeled **result/action** buttons (Play/Again/Retry/Copy/Close/Home/Share/Stats/Next) use themed inline SVG on every page; emoji remain only for (a) game-content glyphs (Minesweeper cells/faces, Planet Merge chains), (b) decorative hero art, (c) the more-games strips, (d) start-menu mode/ability tiles carrying descriptive text (`♾️ Endless`, `🔄转锋`, `❄️ Freeze`), and (e) section titles / toast & announcement copy (`🏆 Global Top 10`, `🎉 You win!`). ⚠️ A button emoji can hide in **three** layers — the static HTML, the JS `applyLanguage` rewrite, **and the i18n string itself** (`needle-awn`/`sword-flight` had `home: '返回菜单 🏠'`). Replacing only the markup gets silently overwritten; audit with `python scripts/emoji-button-audit.py` and migrate with `python scripts/apply-button-icons.py --dry`
- Navigation convention: every game's top-bar 🏠 jumps to `index.html`; "Home" buttons inside start/game-over overlays return to the game's own start menu
- Desktop layout convention (≥1024px media queries; mobile ≤480px layouts must stay untouched): DOM board games enlarge boards/shells on desktop (minesweeper cells via `layoutCells()` max, reversi 640px board, gomoku 700px canvas, word-daily 720px shell). The four portrait-canvas games (hoop-shot, planet-merge, tower-defense, gravity-slingshot) keep their fixed logical fields but gain a ~300px info sidebar (`.xx-sidebar` inside a `.xx-main` flex wrapper; cards filled from i18n in `applyLanguage` + `updateSideRecords()` after record changes) — don't stretch the canvas fields themselves. Since 2026-09-18 the `stage + sidebar` row, the shell width and the top bar come from `css/layout.css` (`game-main`/`game-stage`/`game-sidebar`/`game-topbar`) instead of per-page rules — see the layout contract bullet above
- Theme keys are game-local: Tetris uses `tetris_rainbow`; Math Rain's half-baked light theme was removed in the P1 batch (2026-09-17) — canvas background is semi-transparent dark, no theme toggle. Math Rain volume persists as `mr_sfx_volume`/`mr_music_volume`. Site-wide light mode is being rolled out per `docs/contracts/theme.md` (default stays dark; P1 + P2 landed: index + word-daily/minesweeper/reversi/gomoku + bond-forge/circuit/silk-dew + crystal-bloom/maxwell-demon/ripple-duet support light (canvas colours via `bindPalette`); migrate a page with `node scripts/theme-varize.mjs css/<page>.css <prefix> --dry` then tune from screenshots)
- `css/more-games.css` — cross-game "More Games" nav strip embedded in each game's start screen / stats modal (self links excluded)
- `css/tokens.css` + `css/layout.css` — **the shared page skeleton contract** (added 2026-09-18). Every shell-family page loads them in this order: `tokens.css → layout.css → <game>.css → more-games.css`. `layout.css` owns page container / top bar / stage / sidebar / overlay / toast / footer hint / icon button geometry, and exposes `--frame-max`, `--frame-max-wide`, `--frame-stage`, `--frame-side`, `--frame-side-gap`, `--frame-radius`. Pages add the generic classes next to their own (`<div class="gd-shell game-shell">`, `game-topbar`, `game-main`, `game-stage`, `game-canvas`, `game-sidebar`, `game-icon-btn`, `game-overlay`, `game-toast`, `game-footer-hint`, `game-side-card`, `game-side-title/-row/-text/-panel`, `game-side-kbd-row/-kbd`, `game-title-pill`, `game-hud-box`, `game-btn`) and tune **only** `--frame-*`; do not reintroduce per-page width/padding/radius. Text-bearing icon buttons use `game-icon-btn--wide`; text buttons with a leading icon use `game-btn`. ⚠️ `layout.css` must not declare properties the pages were deliberately using differently — `.game-toast` once carried `white-space: nowrap`, which silently flattened `pm`/`wd` toasts that relied on `max-width` to wrap. Check with `node scripts/probe.mjs <page> 390 844 .<xx>-toast` (it prints `whiteSpace`/`borderRadius`). ⚠️ Vite emits the page CSS chunk *before* shared CSS, which would invert the cascade — the `shared-css-first` plugin in `vite.config.js` re-sorts the `<link>`s in the built HTML, so never remove it. Details and per-page params: `docs/contracts/layout.md`
- Landing page daily hub reads game storage keys directly: Word Daily done = `wd_daily_<YYYY-MM-DD>_<en|zh>` exists; Planet Merge done = `pm_daily_<YYYYMMDD>` exists; Gravity Slingshot done = `gs_daily_<YYYYMMDD>` exists (all UTC+8)
- `public/sitemap.xml` + `public/robots.txt` — keep game list in sync when adding pages (both are gen-derived; see `docs/contracts/registry.md` — **edit `games.config.json` + `npm run gen`, never hand-edit derived files**)

### Runtime shared modules (P2 governance, 2026-09-19)
One implementation each; every module has a `verify-*` checker wired into `npm run verify`:
- `js/safe-storage.js` — `storageGet/Set/Remove`, the only localStorage accessor (try/catch, private-mode safe)
- `js/analytics.js` — `track(gameId, event)` → `window.hubTrack` with a guard; the only analytics call site
- `js/daily.js` — the **only** UTC+8 date/seed source: `todayKey/todayKeyDisplay/dailyKey` + `hashString/hashStringFNV/mulberry32`. ⚠️ **Hash compatibility is frozen**: FNV-1a (16777619) and the custom `hashString` (3432918353) must stay byte-identical — changing either re-shuffles every published daily sequence. Golden values locked in `scripts/verify-daily.mjs` (3-timezone matrix × frozen Dates, with a TZ-reality self-check)
- `js/leaderboard.js` — `SCORES_URL/submitScore` (never throws) / `fetchBoard` (throws; pages render their own fallback board) / `escapeHTML` (always escape remote names)
- `js/i18n.js` — `COMMON_TEXT` (6 keys: sound/language/moreGames/close/copied/usernameLabel) + `makeText(own)` prototype chain (own keys shadow, missing keys fall through to COMMON — one fix fixes all pages). Pages do `const LANGUAGES = makeText({...})`. ⚠️ High-frequency keys (title/hint/gameOver…) stay per-page — the copy genuinely differs
- `js/game-sfx.js` — `createSfxEngine({ masterGain })` (WebAudio graph, respects `site_muted`) and `createSfx(tones)` (table-driven tones; tetris/gomoku/tank-battle)
- `js/boot.js` — `onReady(fn)`, the single page-boot wrapper. **New pages must use it; never hand-write `addEventListener('DOMContentLoaded', …)`** (`verify-boot.mjs` scans `js/*.js` top-level and fails on it)
- `js/game-chrome.js` — `bindChrome({ self, owns, getText, labels })` — header/footer chrome wiring (see `docs/contracts/chrome.md`)
- `js/game-drawer.js` — `createStatsDrawer({ idPrefix, getGame, onPause, onResume, isBusy, ICONS, getText })` — mobile stats bottom sheet (see the drawer bullet below)
- `js/game-frame.js` — `bindFrame({ logicalWidth, extraChrome })` — desktop stage budget (see the frame bullet below)
- `js/theme.js` + `public/theme-boot.js` — light/dark theme (`docs/contracts/theme.md`). Preference `site_theme` (`'dark'|'light'|'system'`, default dark) is written **only** by the landing page switch via `setThemePref()`; games read it. The sync boot script (gen-injected into every `<head>`, before any stylesheet) sets `<html data-theme>`; pages opt in with the `theme-light` cap + `themeColorLight`, otherwise they stay dark. Theme CSS goes under `:root[data-theme="light"]` — never `@media (prefers-color-scheme)`. Canvas colours come from CSS variables via `readPalette()`, refreshed on `onThemeChange()`. Checked by `scripts/verify-theme.mjs`

### PWA & analytics
- PWA: `public/manifest.json` + `public/sw.js` (navigations network-first, static assets cache-first with background refresh) + `public/sw-register.js` (classic script, one tag per page). Icons generated by `scripts/generate-icons.py` (Pillow; regenerates all 4 PNGs, maskable safe-zone included) into `public/icons/` — rerun it rather than hand-editing PNGs. ⚠️ `scripts/generate-icons.js` (pure-Node PNG writer) produced the broken all-transparent icons (2026-09-17 root cause); keep it only as reference, use the Python one
- Analytics: `public/analytics.js` exposes `window.hubTrack(game, 'play'|'finish')` via sendBeacon to `Workers/games-analytics.js` (KV binding `GAMES_ANALYTICS`, daily keys expire in 90 days). Every game calls hubTrack at game start / game over; the landing hub shows today's total plays when the worker is reachable and stays hidden otherwise.

## Development Workflow

### Running Games
```bash
npm run dev
# or serve dist/ after a build with any static server
```

### Testing — `npm run verify`（verify-all.mjs，21 项）
Puppeteer-core 驱动的真浏览器校验体系；**提交前必须全绿**。编排器自动起静态服务器 → 顺序跑 → 汇总 → kill。

- **离线项**（无需浏览器）：`gen-check`（gen 漂移）、`lint`（eslint+stylelint）、`boot`（禁 DOMContentLoaded 复活）、`daily`（时区/哈希黄金值）、`leaderboard`、`i18n`、`sfx`、`registry`（caps ⟺ 代码事实）
- **在线项**（需服务器 + Chrome）：`fg-audit`、`placeholder-leak`、`chrome`、`desktop-frame`、`stats-drawer`、`gomoku`、`button-icons`、`tetris-topbar-mobile`、`tetris-touch`、`tetris-drawer`、`smoke-index`、`smoke-tank-battle`、`smoke-math-rain`
- 日常用 `npm run verify:quick`（15 项档）；复验 dist 产物：`node scripts/verify-all.mjs http://127.0.0.1:8901`（先 `npm run build && cd dist` 起服务）
- 新校验器加进 `scripts/verify-all.mjs` 的 `SUITE`（在线项 `needsServer: true`）；快速档记入 `QUICK_NAMES`
- 几何检查测不出可玩性：真实验证 = canvas 位图像素 + `elementFromPoint` + 真实点击；结算态与 i18n 文案必须专门断言 + 反向验证（旧版本跑同一断言必须失败）

## Code Patterns

### Game Structure
Each game follows this pattern:
```javascript
// Game state and configuration
let gameState = {...};

// Game loop with requestAnimationFrame (render-only games like Gomoku redraw on demand)
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// Input handling with both keyboard and touch
document.addEventListener('keydown', handleInput);
canvas.addEventListener('touchstart', handleTouch, { passive: false });
```

### Conventions worth preserving
- Page layout: never restore a page-owned shell/topbar/stage/sidebar geometry rule — add the `game-*` class from `css/layout.css` and tune `--frame-*` only. After layout work run the checkers: `node scripts/layout-metrics.mjs` (geometry table for all 13 pages, expects icon `hit` ≥44px and one shell padding pair per breakpoint), `node scripts/shots.mjs` (screenshots + console-error sweep) and `node scripts/fg-audit.mjs` (flags pure-black foreground / serif font fallback = broken inheritance). `python scripts/apply-layout-unification.py` is idempotent and re-applies class injection + duplicate-rule pruning for the 9 templated games — run it in `--dry` first and check its diff, since it writes files when run without `--dry`
- ⚠️ `scripts/serve-static.mjs` only lives for the shell call that starts it, so chain `serve → measure → kill` in **one** command. If a checker prints an all-`-` geometry table, the server is dead (`upstream connect failed`), not the selectors
- Icon-button work has its own pair: `python scripts/emoji-button-audit.py` (lists every `<button>` still carrying a non-allowlisted emoji) and `node scripts/verify-button-icons.mjs` (opens each result panel, asserts `inline-flex` + exactly one `<svg>` + computed icon width 15px + icon/label vertical offset ≤1px + no overflow). Assert on **computed style / untransformed widths**, not `getBoundingClientRect()` — result overlays animate in with `transform: scale()`, which fakes both undersized icons and false "overflow"
- Pause the game on `visibilitychange` (tab hidden) and stop rAF loops on game over
- **Header / Footer slot contract** (added 2026-09-19) — all 11 shell-family pages use the same three-slot topbar and the same persistent footer. Contract in `css/layout.css` (`.game-topbar-center`, `.game-footer`, `-actions`, `-nav`), behaviour in `js/game-chrome.js` (`bindChrome`), details in `docs/contracts/chrome.md`. Topbar = `game-topbar-group` (left, Home first) + `game-topbar-center` (title/HUD, free-form) + `game-topbar-group` (right, fixed order: page-specific → `data-chrome="stats"` → `pause` → `sound` → `lang`). **Sound and Lang are always the rightmost two**, so the two site-wide switches sit in the same screen position on every game. Footer is in flow (never `sticky`/`fixed` — it would fight tetris's `.mobile-controls` at z-index 1000 and the stats drawer at 1200, and eat portrait-canvas height) and holds only stateless navigation (`data-chrome="home"` + `data-chrome="more"`) plus the hint line; **stateful switches stay in the header so each has one writer**. Migrate with `python scripts/apply-header-footer.py` + `python scripts/add-chrome-i18n.py` (both idempotent, `--dry` first), verify with `node scripts/verify-chrome.mjs`
- **Bottom stats drawer** (added 2026-09-19) — on phones the info sidebar is replaced by a **Stats icon button in the topbar + a bottom sheet**, so the canvas gets the full width. The page list is **gen-derived** — it is `registry.withCap('drawer')` in `games.config.json`, not a list kept here (tetris is migrated separately; its drawer is checked by `verify-tetris-drawer.mjs`). Everything lives in the shared layer: markup contract in `css/layout.css` (`.game-drawer`, `-panel`, `-handle`, `-head`, `-title`, `-body`, `-close`, `.game-stats-btn`, `--drawer-max: 90dvh`, hidden at `≥1024px`), behaviour in `js/game-drawer.js` (`createStatsDrawer({ idPrefix, getGame, onPause, onResume, isBusy, ICONS, getText })`). Adding a page = run the two idempotent migrators in `--dry` first (they write when run without it), then paste the `createStatsDrawer` block: `python scripts/apply-stats-drawer.py` (wraps every `.xx-side-card` in `<div id="xxStatsPanels">`, inserts the topbar `#xxStatsToggle`, appends the drawer skeleton **after** `.game-shell` — it must stay outside it because the drawer is `position: fixed`) and `python scripts/add-drawer-i18n.py` (adds the `stats` key; `close` now falls through to `COMMON_TEXT`). Both read their page list from the registry, so a new game needs no edit to either script. Verify with `node scripts/verify-stats-drawer.mjs` — its `AUGMENT` table of per-page test data is guarded by `registry.assertCovered`, so a drawer page missing from it fails loudly instead of being skipped. ⚠️ 手工表的覆盖率守卫规则（校验器硬失败 / 迁移器提示）见 `docs/contracts/registry.md` §1.2
  - **Never relocate the panels by duplicating the DOM.** One `<div id="xxStatsPanels">` node is *moved* between the sidebar (desktop) and the drawer body (mobile) by a `matchMedia('(min-width: 1024px)')` listener — a second copy would fork the record/HUD refresh targets
  - **Pause must go through an adapter, because the six games disagree.** pm/hs/na/td pause via a `this.state = 'playing'|'paused'` string; sword-flight uses a `this.isPaused` boolean; gravity-slingshot had **no pause at all** (a new `isPaused` flag was added, gated at the top of `tick()` with `this.lastFrame = now` assigned *before* the check so the resume frame doesn't get a huge `dt`). Also note na/td/gd rAF loops are self-sustaining and gate all updates on state, so setting the flag *is* the halt — only pm/hs need `stopLoop()`/`ensureLoop()`. Give each page a `pauseQuiet()`/`resumeQuiet()`/`isRunning()` triple and pass closures into `createStatsDrawer`; never have the drawer poke page internals directly
  - Use the **quiet** variants, not the page's normal pause: the ordinary one shows the "Paused" overlay, which would flash behind the open drawer. `openDrawer()` only pauses when `isBusy()` is true and records `pausedByDrawer`; `close()` resumes **only** a drawer-induced pause, so a user who paused first stays paused
  - Esc is bound in the **capture** phase with `stopPropagation`, otherwise the page's own `keydown` handler keeps driving the board behind the open drawer; the drawer also owns a Tab focus trap, a scrim-click close, and closes itself when `matchMedia` flips to desktop
- i18n strings may contain `{n}` / `{g}` / `{who}` / `{lives}` placeholders. Expand them at a **single** helper per game (e.g. `WordDailyGame.guessPlaceholderText()`), never at several call sites — a duplicated assignment without `.replace()` silently overwrites the expanded value with the literal token. Audit with `node scripts/placeholder-leak-check.mjs` and `node scripts/wd-placeholder-check.mjs`
- **Desktop stage budget contract** (added 2026-09-19) — on ≥1024px viewports the canvas games carrying the `frame-budget` cap (gd/hs/pm/td/na/sf + tetris) derive stage width from available height × aspect ratio (`--stage-w = min(--frame-stage-h, 100dvh - --frame-chrome) × --frame-ratio`), replacing the fixed `--frame-max-wide` cap; the page always fits one screen. Opt-in: pages override `--frame-shell-max`/`--frame-stage-cap` on their shell (see `css/layout.css` desktop media comment) — pages without the cap keep `--frame-max-wide`/`--frame-stage` untouched. `js/game-frame.js`'s `bindFrame({ logicalWidth, extraChrome })` measures `--frame-chrome` (topbar + footer + shell padding + optional per-page extras like td's skill bar) into the shell and dispatches `game-frame:changed`; pages re-run their canvas `resize()` on it. Verify with `node scripts/verify-desktop-frame.mjs` (pages from `registry.withCap('frame-budget')` × 5 viewports × zh/en: no page scroll, aspect ratio, no blur, stage grows with viewport, sidebar on-screen, chrome convergence, no pageerror). Its three traps (cumulative `ctx.scale`, the `--frame-chrome` feedback loop, the hs/pm inline-width self-lock) are in `docs/traps.md`.
- Guard all `localStorage` access with try/catch (private mode throws)
- Escape any remotely-supplied strings before `innerHTML` (leaderboard names!)
- Canvas drawing uses CSS-pixel coordinates; scale the backing store by `devicePixelRatio`

- ⚠️ **踩过的坑不在这里** —— 事故复盘（含各自的回归脚本）全部集中在 `docs/traps.md`，按「布局与层叠 / 共享层迁移与剪枝 / JS 生命周期与时序 / 桌面舞台预算与画布缩放 / 抽屉与顶栏行为 / 结算渲染 / 按钮图标 / 校验基础设施 / codegen」分组。改动上述任一领域**前**先扫一遍那份文件；新踩的坑写进那里，不要再追加到本文件。

## Development Notes
- Games use canvas-based rendering; be careful to keep hit-testing and rendering in the same coordinate space
- Tetris global high scores require the leaderboard Worker to be deployed and reachable
- All games support both keyboard and touch input (Tank Battle is keyboard-only on desktop; its canvas scales down via CSS on small screens)