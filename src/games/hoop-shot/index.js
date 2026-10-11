import { createI18nBinder } from '../../platform/i18n/bindings.js';
/** Hoop Shot composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindDrawerPauseOwnership } from '../../platform/runtime/pause-ownership.js';
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

    const game = window.hoopShotGame;
    const interruptions = bindDrawerPauseOwnership(game, {
        canResume: g => g.state === 'paused',
        autoResumeOnForeground: false,
        onHidden: g => { if (g.state === 'paused') g.showOverlay('hs-pause'); },
        releaseInputs: g => { g.dragStart = null; g.dragCurrent = null; },
    });

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
            onAcquire: interruptions.onAcquire,
            onRelease: interruptions.onRelease,
            isBusy: () => !!(window.hoopShotGame && window.hoopShotGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });

    window.hsDrawer = window.hsRuntime.drawer;
});
