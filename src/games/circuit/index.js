/** Circuit composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { getLang } from '../../platform/site-settings.js';
import { LANGUAGES } from './i18n.js';
import { CircuitGame, initCanvasPalette, W } from './runtime.js';

export { CircuitGame } from './runtime.js';

onReady(() => {
    initCanvasPalette(() => window.ccGame && window.ccGame.draw());
    window.ccGame = new CircuitGame();
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

    window.ccRuntime = mountGameRuntime({
        self: 'circuit.html',
        game: window.ccGame,
        frame: { logicalWidth: W },
        more: '#ccSideMore',
        drawer: {
            idPrefix: 'cc',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.ccGame && typeof window.ccGame.isRunning === 'function' && window.ccGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: { owns: ['more'], getText },
    });

    window.ccDrawer = window.ccRuntime.drawer;
});
