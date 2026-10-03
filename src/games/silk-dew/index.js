import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
/** Silkfall composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindPalette } from '../../platform/theme.js';
import { LANGUAGES } from './i18n.js';
import {
    CANVAS_VARS,
    SilkfallGame,
    W,
    setCanvasPalette,
} from './runtime.js';

export { SilkfallGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    setCanvasPalette(bindPalette(CANVAS_VARS, { onChange: () => window.sdGame && window.sdGame.draw() }));
    window.sdGame = new SilkfallGame();
    const getText = () => (window.sdGame ? window.sdGame.textTable() : LANGUAGES.en);

    window.sdRuntime = mountGameRuntime({
        self: 'silk-dew.html',
        game: window.sdGame,
        frame: { logicalWidth: W },
        more: '#sdSideMore',
        drawer: {
            idPrefix: 'sd',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.sdGame && window.sdGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['more', 'home'],
            getText,
        },
    });

    window.sdDrawer = window.sdRuntime.drawer;
});
