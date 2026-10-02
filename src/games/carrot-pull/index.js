/** Carrot Pull composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { getLang } from '../../platform/site-settings.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { createGame } from './runtime.js';
import { LANGUAGES } from './i18n.js';

export { createGame } from './runtime.js';

onReady(() => {
    const i18nBinder = createI18nBinder({ getLang, tables: LANGUAGES });
    const game = createGame({ i18nBinder });
    window.cpGame = game;
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

    window.cpRuntime = mountGameRuntime({
        self: 'carrot-pull.html',
        game,
        frame: { logicalWidth: 560 },
        more: '#cpSideMore',
        drawer: {
            idPrefix: 'cp',
            getGame: () => game.state,
            isBusy: () => game.isRunning(),
            onPause: () => game.pauseQuiet(),
            onResume: () => game.resumeQuiet(),
            ICONS,
            getText,
        },
        chrome: { getText, owns: ['more', 'home', 'sound'] },
    });

    window.cpDrawer = window.cpRuntime.drawer;
    game.init();
});
