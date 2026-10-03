import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
/** Crystal Bloom composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { initCanvasPalette, CrystalBloomGame, W } from './runtime.js';
import { LANGUAGES } from './i18n.js';

export { CrystalBloomGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    initCanvasPalette(() => window.cbGame && window.cbGame.draw());
    window.cbGame = new CrystalBloomGame();
    const getText = () => (window.cbGame ? window.cbGame.textTable() : LANGUAGES.en);

    window.cbRuntime = mountGameRuntime({
        self: 'crystal-bloom.html',
        game: window.cbGame,
        frame: { logicalWidth: W },
        more: '#cbSideMore',
        drawer: {
            idPrefix: 'cb',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.cbGame && window.cbGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['more', 'home'],
            getText,
        },
    });

    window.cbDrawer = window.cbRuntime.drawer;
});
