import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
/** Shadow Loom composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { LANGUAGES } from './i18n.js';
import { ShadowLoomGame, W } from './runtime.js';

export { ShadowLoomGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    const game = new ShadowLoomGame();
    window.slGame = game;
    const getText = () => game.textTable() || LANGUAGES.en;

    window.slRuntime = mountGameRuntime({
        self: 'shadow-loom.html',
        game,
        frame: { logicalWidth: W },
        more: '#slSideMore',
        drawer: {
            idPrefix: 'sl',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => game.isRunning(),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['more', 'home', 'sound'],
            getText,
        },
    });

    window.slDrawer = window.slRuntime.drawer;
});
