# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

This is a collection of single-page HTML5 games built with vanilla JavaScript, built with Vite and deployed to Cloudflare Workers (static assets via `wrangler.jsonc`). The games include:

- **Math Rain** (`math-rain.html`) - Mathematical expression game with modular architecture
- **Tetris** (`tetris.html`) - Modern Tetris implementation with themes, combo system, and global high scores
- **Tank Battle** (`tank-battle.html`) - Classic arcade-style tank combat game
- **Gomoku** (`gomoku.html`) - Five-in-a-row board game vs AI or another player
- **index.html** - Game collection landing page (links out to external games too)

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
- `Workers/tetris-highest-scores.js` is the leaderboard Worker (deployed separately to `tetris-highest-scores.orangely.workers.dev`, KV binding `TETRIS_SCORES`, CORS restricted to the games domains). Its deploy configuration is not in this repo.

### Key Components

**Utility Modules**:
- `js/performance-monitor.js` - FPS tracking and performance metrics (used by Math Rain)
- `js/config-manager.js` - Config management (used by Math Rain; defaults only — no `config/game-config.json` exists)
- `js/save-manager.js`, `js/resource-manager.js`, `js/debug-panel.js` - Legacy utilities, currently NOT imported by any game (kept for reference; do not assume they are wired up)

**Game-specific JavaScript**:
- `js/math-rain/main.js` - Math Rain orchestrator; game logic is event-driven across `js/math-rain/` (systems/, core/, i18n/)
- `js/tetris.js` - Tetris game engine and logic
- `js/tank-battle.js` - Tank Battle game implementation
- `js/gomoku.js` - Gomoku board, win detection, and AI

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
- Pause the game on `visibilitychange` (tab hidden) and stop rAF loops on game over
- Guard all `localStorage` access with try/catch (private mode throws)
- Escape any remotely-supplied strings before `innerHTML` (leaderboard names!)
- Canvas drawing uses CSS-pixel coordinates; scale the backing store by `devicePixelRatio`

## Development Notes
- Games use canvas-based rendering; be careful to keep hit-testing and rendering in the same coordinate space
- Tetris global high scores require the leaderboard Worker to be deployed and reachable
- All games support both keyboard and touch input (Tank Battle is keyboard-only on desktop; its canvas scales down via CSS on small screens)