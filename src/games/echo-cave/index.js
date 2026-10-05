import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
/** Echo Cave composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { EchoCaveGame, W } from './runtime.js';
import { LANGUAGES } from './i18n.js';

export { EchoCaveGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    window.ecGame = new EchoCaveGame();
    const getText = () => (window.ecGame ? window.ecGame.textTable() : LANGUAGES.en);

    window.ecRuntime = mountGameRuntime({
        self: 'echo-cave.html',
        game: window.ecGame,
        frame: { logicalWidth: W },
        more: '#ecSideMore',
        drawer: {
            idPrefix: 'ec',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.ecGame && window.ecGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['home'],
            getText,
        },
    });

    window.ecDrawer = window.ecRuntime.drawer;
});
