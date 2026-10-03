import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
/** Bond Forge composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindPalette } from '../../platform/theme.js';
import { LANGUAGES } from './i18n.js';
import { BondForgeGame, CANVAS_VARS, setCanvasPalette, W } from './runtime.js';

export { BondForgeGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    setCanvasPalette(bindPalette(CANVAS_VARS, { onChange: () => window.bfGame && window.bfGame.draw() }));
    window.bfGame = new BondForgeGame();
    const getText = () => (window.bfGame ? window.bfGame.textTable() : LANGUAGES.en);

    window.bfRuntime = mountGameRuntime({
        self: 'bond-forge.html',
        game: window.bfGame,
        frame: { logicalWidth: W },
        more: '#bfSideMore',
        drawer: {
            idPrefix: 'bf',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.bfGame && window.bfGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: { owns: ['more', 'home'], getText },
        resize: g => g && g.resize(),
    });

    window.bfDrawer = window.bfRuntime.drawer;
});
