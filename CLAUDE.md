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
npm run dev       # Vite dev server (vite.config.dev.js)
npm run build     # Vite production build -> dist/ (multi-entry, legacy plugin, terser)
npm run deploy    # vite build && wrangler deploy
npm run preview   # wrangler dev (serves dist/ + src/index.js worker)
```

- Source HTML/CSS/JS live at the repo root, `css/`, and `js/`; `public/` holds static assets copied verbatim into `dist/` (including `404.html` for Cloudflare's `not_found_handling`).
- `src/index.js` is the Worker entry: it redirects `/dots-and-boxes*` to the external game and falls through to static assets.
- `Workers/game-scores.js` is the **single leaderboard Worker for the whole site** (deployed to `game-scores.orangely.workers.dev`, one KV namespace `GAME_SCORES`, per-game keys `top:<game>`; games: `tetris`, `hoop-shot`, `planet-merge` (+ daily `planet-merge-d<YYYYMMDD>` with a 14-day TTL), `reversi`, `tower-defense`, `minesweeper-easy|medium|hard`, and daily `gravity-d<YYYYMMDD>` matched by regex; per-game `order: asc|desc`). The former per-game workers (tetris-highest-scores, planet-merge-scores, hoop-shot-scores) were consolidated into it — their sources were removed from this repo and their deployed instances can be deleted with `npx wrangler delete --name <name>`. Historical scores were replayed into `GAME_SCORES` via `scripts/migrate-legacy-scores.mjs`. Add new games to its `GAMES` map (or the daily-key patterns) rather than creating another worker. Deploy config: `Workers/wrangler-game-scores.jsonc`.

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
- Theme keys are game-local: Tetris uses `tetris_rainbow`; Math Rain's half-baked light theme was removed in the P1 batch (2026-09-17) — canvas background is semi-transparent dark, no theme toggle. Math Rain volume persists as `mr_sfx_volume`/`mr_music_volume`. There is no site-wide light/dark theme (dark neon is the design language)
- `css/more-games.css` — cross-game "More Games" nav strip embedded in each game's start screen / stats modal (self links excluded)
- `css/tokens.css` + `css/layout.css` — **the shared page skeleton contract** (added 2026-09-18). Every shell-family page loads them in this order: `tokens.css → layout.css → <game>.css → more-games.css`. `layout.css` owns page container / top bar / stage / sidebar / overlay / toast / footer hint / icon button geometry, and exposes `--frame-max`, `--frame-max-wide`, `--frame-stage`, `--frame-side`, `--frame-side-gap`, `--frame-radius`. Pages add the generic classes next to their own (`<div class="gd-shell game-shell">`, `game-topbar`, `game-main`, `game-stage`, `game-canvas`, `game-sidebar`, `game-icon-btn`, `game-overlay`, `game-toast`, `game-footer-hint`, `game-side-card`, `game-side-title/-row/-text/-panel`, `game-side-kbd-row/-kbd`, `game-title-pill`, `game-hud-box`, `game-btn`) and tune **only** `--frame-*`; do not reintroduce per-page width/padding/radius. Text-bearing icon buttons use `game-icon-btn--wide`; text buttons with a leading icon use `game-btn`. ⚠️ `layout.css` must not declare properties the pages were deliberately using differently — `.game-toast` once carried `white-space: nowrap`, which silently flattened `pm`/`wd` toasts that relied on `max-width` to wrap. Check with `node scripts/probe.mjs <page> 390 844 .<xx>-toast` (it prints `whiteSpace`/`borderRadius`). ⚠️ Vite emits the page CSS chunk *before* shared CSS, which would invert the cascade — the `shared-css-first` plugin in `vite.config.js` re-sorts the `<link>`s in the built HTML, so never remove it. Details and per-page params: `docs/layout-contract-2026-09-18.md`
- Landing page daily hub reads game storage keys directly: Word Daily done = `wd_daily_<YYYY-MM-DD>_<en|zh>` exists; Planet Merge done = `pm_daily_<YYYYMMDD>` exists; Gravity Slingshot done = `gs_daily_<YYYYMMDD>` exists (all UTC+8)
- `public/sitemap.xml` + `public/robots.txt` — keep game list in sync when adding pages

### PWA & analytics
- PWA: `public/manifest.json` + `public/sw.js` (navigations network-first, static assets cache-first with background refresh) + `public/sw-register.js` (classic script, one tag per page). Icons generated by `scripts/generate-icons.py` (Pillow; regenerates all 4 PNGs, maskable safe-zone included) into `public/icons/` — rerun it rather than hand-editing PNGs. ⚠️ `scripts/generate-icons.js` (pure-Node PNG writer) produced the broken all-transparent icons (2026-09-17 root cause); keep it only as reference, use the Python one
- Analytics: `public/analytics.js` exposes `window.hubTrack(game, 'play'|'finish')` via sendBeacon to `Workers/games-analytics.js` (KV binding `GAMES_ANALYTICS`, daily keys expire in 90 days). Every game calls hubTrack at game start / game over; the landing hub shows today's total plays when the worker is reachable and stays hidden otherwise.

## Development Workflow

### Running Games
```bash
npm run dev
# or serve dist/ after a build with any static server
```

### Testing
- No automated test framework
- Test by opening the pages in different browsers, including mobile viewports
- `npm run build` catches syntax/import errors before deploying

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
- Pruning shared-layer duplicates must never drop `color` / `font-family` / `backdrop-filter`: they are the page's own palette, font and material, and `css/layout.css` provides no replacement. Removing them once turned every topbar icon pure black and dropped the pages onto the browser's default serif font. The migration script's `BODY_STRIP` / `ROLE_SPECS` lists now exclude them, and `scripts/fg-audit.mjs` guards the regression
- ⚠️ Never move a stage's decorative background onto an absolutely-positioned `::before`/`::after` without giving it `z-index: -1` inside an isolated stacking context (`isolation: isolate` on the host). An abspos pseudo-element paints **above** a non-positioned `<canvas>` child — it hides everything the canvas draws *and* swallows every pointer event, so the game becomes unplayable while all geometry checkers still pass. This is how gomoku broke in `566dd8f` (wood board moved from `.board-container`'s background to `::before`). Geometry-only audits cannot catch it: assert on the canvas bitmap pixel + `document.elementFromPoint()` + a real click-driven move — `node scripts/verify-gomoku.mjs`. The migration script's `ROLE_SPECS["stage"]` therefore no longer strips `position` (a redundant `position: relative` is harmless; losing it is not)
- Pause the game on `visibilitychange` (tab hidden) and stop rAF loops on game over
- i18n strings may contain `{n}` / `{g}` / `{who}` / `{lives}` placeholders. Expand them at a **single** helper per game (e.g. `WordDailyGame.guessPlaceholderText()`), never at several call sites — a duplicated assignment without `.replace()` silently overwrites the expanded value with the literal token. Audit with `node scripts/placeholder-leak-check.mjs` and `node scripts/wd-placeholder-check.mjs`
- Guard all `localStorage` access with try/catch (private mode throws)
- Escape any remotely-supplied strings before `innerHTML` (leaderboard names!)
- Canvas drawing uses CSS-pixel coordinates; scale the backing store by `devicePixelRatio`

## Development Notes
- Games use canvas-based rendering; be careful to keep hit-testing and rendering in the same coordinate space
- Tetris global high scores require the leaderboard Worker to be deployed and reachable
- All games support both keyboard and touch input (Tank Battle is keyboard-only on desktop; its canvas scales down via CSS on small screens)