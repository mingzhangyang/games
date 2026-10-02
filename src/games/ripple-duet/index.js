/** Ripple Duet composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { LANGUAGES } from './i18n.js';
import { initCanvasPalette, RippleDuetGame, W } from './runtime.js';

export { RippleDuetGame } from './runtime.js';

onReady(() => {
    initCanvasPalette(() => window.rdGame && window.rdGame.render());
    window.rdGame = new RippleDuetGame();
    const getText = () => (window.rdGame ? window.rdGame.textTable() : LANGUAGES.en);

    window.rdRuntime = mountGameRuntime({
        self: 'ripple-duet.html',
        game: window.rdGame,
        frame: { logicalWidth: W },
        more: '#rdSideMore',
        drawer: {
            idPrefix: 'rd',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.rdGame && window.rdGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['more', 'home'],
            getText,
        },
    });

    window.rdDrawer = window.rdRuntime.drawer;
});
