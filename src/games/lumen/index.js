/** Lumen composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { getLang } from '../../platform/site-settings.js';
import { LANGUAGES } from './i18n.js';
import { LumenGame, W } from './runtime.js';

export { LumenGame } from './runtime.js';

onReady(() => {
    window.lmGame = new LumenGame();

    window.lmRuntime = mountGameRuntime({
        self: 'lumen.html',
        game: window.lmGame,
        frame: { logicalWidth: W },
        more: '#lmSideMore',
        drawer: {
            idPrefix: 'lm',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.lmGame && typeof window.lmGame.isRunning === 'function' && window.lmGame.isRunning()),
            ICONS,
            getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
        },
        chrome: { owns: ['more'], getText: () => LANGUAGES[getLang()] || LANGUAGES.en },
    });

    window.lmDrawer = window.lmRuntime.drawer;
});
