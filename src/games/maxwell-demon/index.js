/** Maxwell's Demon composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { initCanvasPalette, MaxwellDemonGame, W } from './runtime.js';
import { LANGUAGES } from './i18n.js';

export { MaxwellDemonGame } from './runtime.js';

onReady(() => {
    initCanvasPalette(() => window.mdGame && window.mdGame.draw());
    window.mdGame = new MaxwellDemonGame();
    const getText = () => (window.mdGame ? window.mdGame.textTable() : LANGUAGES.en);

    window.mdRuntime = mountGameRuntime({
        self: 'maxwell-demon.html',
        game: window.mdGame,
        frame: { logicalWidth: W },
        more: '#mdSideMore',
        drawer: {
            idPrefix: 'md',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.mdGame && window.mdGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['more', 'home'],
            getText,
        },
    });

    window.mdDrawer = window.mdRuntime.drawer;
});
