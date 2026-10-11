/** Circuit composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindDrawerPauseOwnership } from '../../platform/runtime/pause-ownership.js';
import { getLang } from '../../platform/site-settings.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { LANGUAGES } from './i18n.js';
import { CircuitGame, initCanvasPalette, W } from './runtime.js';

export { CircuitGame } from './runtime.js';

onReady(() => {
    const i18nBinder = createI18nBinder({ getLang, tables: LANGUAGES });
    i18nBinder.apply();
    initCanvasPalette(() => window.ccGame && window.ccGame.draw());
    window.ccGame = new CircuitGame({ i18nBinder });
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

    const game = window.ccGame;
    const interruptions = bindDrawerPauseOwnership(game, {
        canResume: g => g.state === 'playing' && g.isPaused,
        autoResumeOnForeground: true,
    });

    window.ccRuntime = mountGameRuntime({
        self: 'circuit.html',
        game: window.ccGame,
        frame: { logicalWidth: W },
        more: '#ccSideMore',
        drawer: {
            idPrefix: 'cc',
            onAcquire: interruptions.onAcquire,
            onRelease: interruptions.onRelease,
            isBusy: () => !!(window.ccGame && typeof window.ccGame.isRunning === 'function' && window.ccGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: { getText },
    });

    window.ccDrawer = window.ccRuntime.drawer;
});
