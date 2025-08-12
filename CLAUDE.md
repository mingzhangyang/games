# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a collection of single-page HTML5 games built with vanilla JavaScript. Each game is self-contained in its own HTML file with embedded CSS and JavaScript. The games include:

- **Math Rain** (`math-rain.html`) - Mathematical expression game with modular architecture
- **Tetris** (`tetris.html`) - Modern Tetris implementation with themes, combo system, and global high scores
- **Tank Battle** (`tank-battle.html`) - Classic arcade-style tank combat game  


## Architecture

### Core Structure
- **Single-file games**: Each game is completely self-contained in one HTML file
- **No build process**: Games run directly in the browser without compilation
- **Vanilla JavaScript**: No external frameworks or libraries
- **Modular JavaScript**: Core functionality separated into reusable modules in `js/` directory

### Key Components

**Configuration System** (`js/config-manager.js`, `config/game-config.json`):
- Centralized JSON-based configuration for game parameters
- Local storage integration for saving user preferences
- Deep merge system for config validation and defaults
- Debug mode toggle and performance settings

**Utility Modules**:
- `js/performance-monitor.js` - FPS tracking and performance metrics
- `js/resource-manager.js` - Asset loading and caching
- `js/save-manager.js` - Save game state and high scores management
- `js/debug-panel.js` - Developer debugging tools
- `Workers/tetris-highest-scores.js` - Web Worker for high score processing

**Game-specific JavaScript**:
- `js/math-rain/main.js` - Math Rain game engine with modular architecture
- `js/tetris.js` - Tetris game engine and logic
- `js/tank-battle.js` - Tank Battle game implementation

**Math Rain Modular Architecture**:
- `js/math-rain/systems/` - Core systems (EventSystem, DependencyContainer)
- `js/math-rain/core/` - Game managers (GameStateManager, SessionManager, UIController, etc.)
- `js/math-rain/` - Game modules (expression-generator, sound-manager, particle-effects, etc.)


### Internationalization
- Built-in multi-language support (English/Chinese)
- Browser language auto-detection
- Consistent i18n pattern across all games

## Development Workflow

### Running Games
```bash
# Serve the directory with any HTTP server
python -m http.server 8000
# or
npx serve .
# or open HTML files directly in browser (some features may be limited)
```

### Testing
- No automated test framework
- Test by opening HTML files in different browsers
- Use browser dev tools for debugging
- Enable debug mode via config for additional logging

### Configuration
- Modify `config/game-config.json` for game parameters
- Use `js/config-manager.js` API for runtime config changes
- Settings persist in localStorage automatically

## Code Patterns

### Game Structure
Each game follows this pattern:
```javascript
// Language support
const LANGUAGES = { en: {...}, zh: {...} };

// Game state and configuration
let gameState = {...};

// Game loop with requestAnimationFrame
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// Input handling with both keyboard and touch
document.addEventListener('keydown', handleInput);
canvas.addEventListener('touchstart', handleTouch);
```

### Performance Optimization
- Viewport culling for off-screen objects
- Object pooling for bullets and particles  
- RequestAnimationFrame for smooth 60fps
- Canvas layer separation for static/dynamic content

### Mobile Support
- Touch controls with virtual joysticks
- Responsive canvas sizing
- Device orientation handling
- Performance scaling based on device capabilities

## File Organization
```
/
├── index.html              # Main game selection page
├── tetris.html            # Complete Tetris game
├── tank-battle.html       # Complete Tank Battle game  

├── config/
│   └── game-config.json   # Centralized game configuration
├── js/                    # Shared JavaScript modules
│   ├── config-manager.js  # Configuration management
│   ├── performance-monitor.js
│   ├── resource-manager.js
│   ├── save-manager.js
│   ├── debug-panel.js
│   └── [game].js          # Game-specific logic
├── css/                   # Game-specific stylesheets
├── Workers/               # Web Workers for background processing
└── docs/                  # Documentation and optimization notes
```

## Key Features

### Tetris-specific
- Modern UI with multiple color themes
- Combo system with multipliers
- Global high score tracking via Web Worker
- Mobile-optimized touch controls
- SRS (Super Rotation System) implementation

### Configuration Management
- Runtime config modification via `gameConfig.get()/set()`
- Debug mode: `gameConfig.toggleDebugMode()`
- Audio settings: `gameConfig.updateAudioSettings()`
- Difficulty scaling: `gameConfig.getDifficultyMultipliers(level)`

### Performance Monitoring
- FPS counter and performance metrics
- Object count tracking
- Memory usage monitoring in debug mode

## Development Notes
- Games use canvas-based rendering with pixel-perfect scaling
- Audio system supports volume control and muting
- Save system uses localStorage with fallback handling
- All games support both keyboard and touch input
- Debug panels can be toggled for development