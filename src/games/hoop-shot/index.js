import { createI18nBinder } from '../../platform/i18n/bindings.js';
/** Hoop Shot composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { getLang } from '../../platform/site-settings.js';
import { LANGUAGES } from './i18n.js';
import { HoopShotGame, initCanvasPalette, WORLD_W } from './runtime.js';

export { HoopShotGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    initCanvasPalette(() => {
        const game = window.hoopShotGame;
        if (!game) return;
        game.buildStarfield();
        game.render();
    });
    window.hoopShotGame = new HoopShotGame();
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

    window.hsRuntime = mountGameRuntime({
        self: 'hoop-shot.html',
        game: window.hoopShotGame,
        frame: {
            logicalWidth: WORLD_W,
            extraChrome: () => {
                const bar = document.querySelector('.hs-streak-bar');
                return bar ? bar.getBoundingClientRect().height : 0;
            },
        },
        more: '#hsSideMore',
        drawer: {
            idPrefix: 'hs',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.hoopShotGame && window.hoopShotGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['more'],
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });

    window.hsDrawer = window.hsRuntime.drawer;
});
