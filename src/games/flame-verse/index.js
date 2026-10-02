/** Flame Verse composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { FlameVerseGame, W } from './runtime.js';
import { LANGUAGES } from './i18n.js';

export { FlameVerseGame } from './runtime.js';

onReady(() => {
    window.fvGame = new FlameVerseGame();
    const getText = () => (window.fvGame ? window.fvGame.textTable() : LANGUAGES.en);

    window.fvRuntime = mountGameRuntime({
        self: 'flame-verse.html',
        game: window.fvGame,
        frame: { logicalWidth: W },
        more: '#fvSideMore',
        drawer: {
            idPrefix: 'fv',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.fvGame && window.fvGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['more', 'home'],
            getText,
        },
    });

    window.fvDrawer = window.fvRuntime.drawer;
});
