import { onReady } from '../boot.js';
import { bindChrome } from '../game-chrome.js';
import { bindFrame } from '../game-frame.js';
import { createStatsDrawer } from '../game-drawer.js';
import { renderMoreGames } from '../more-games.js';

/**
 * Mount the common platform shell around a game instance.
 * Game-specific rules/rendering stay outside this module; this only wires platform capabilities.
 */
export function mountGameRuntime(options = {}) {
    const {
        self = '',
        game = null,
        getGame = null,
        frame = null,
        chrome = null,
        drawer = null,
        more = null,
        resize = null,
        visibility = null,
        expose = null,
    } = options;

    const resolveGame = typeof getGame === 'function' ? getGame : () => game;
    const runtime = { frame: null, chrome: null, drawer: null, game: resolveGame() };

    if (expose && typeof window !== 'undefined') window[expose] = runtime.game;

    if (frame !== false) {
        const frameOptions = frame && typeof frame === 'object' ? frame : {};
        runtime.frame = bindFrame(frameOptions);
    }

    if (more) {
        const node = typeof more === 'string' ? document.querySelector(more) : more;
        if (node) renderMoreGames(node, { exclude: self, ...(options.moreOptions || {}) });
    }

    if (drawer) {
        const drawerOptions = typeof drawer === 'object' ? drawer : {};
        runtime.drawer = createStatsDrawer({
            getGame: resolveGame,
            ...drawerOptions,
        });
        if (runtime.drawer && drawerOptions.autoInit !== false) runtime.drawer.init();
    }

    if (chrome !== false) {
        const chromeOptions = chrome && typeof chrome === 'object' ? chrome : {};
        runtime.chrome = bindChrome(chromeOptions);
    }

    if (typeof resize === 'function') {
        const runResize = () => resize(resolveGame(), runtime);
        window.addEventListener('game-frame:changed', runResize);
        window.addEventListener('resize', runResize);
    }

    if (visibility) {
        let pausedByHidden = false;
        document.addEventListener('visibilitychange', () => {
            const g = resolveGame();
            if (!g) return;
            if (document.hidden) {
                const busy = typeof visibility.isBusy === 'function'
                    ? visibility.isBusy(g)
                    : (typeof g.isRunning === 'function' ? g.isRunning() : true);
                if (busy) {
                    visibility.pause?.(g);
                    pausedByHidden = true;
                }
            } else if (pausedByHidden) {
                pausedByHidden = false;
                visibility.resume?.(g);
            }
        });
    }

    return runtime;
}

/**
 * DOM-ready wrapper for games that can describe their platform wiring declaratively.
 */
export function onGameReady(factory) {
    onReady(() => {
        const options = typeof factory === 'function' ? factory() : factory;
        mountGameRuntime(options || {});
    });
}
