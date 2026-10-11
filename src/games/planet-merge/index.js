import { createI18nBinder } from '../../platform/i18n/bindings.js';
/** Planet Merge composition root. */
import { getLang } from '../../platform/site-settings.js';
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindDrawerPauseOwnership } from '../../platform/runtime/pause-ownership.js';
import { LANGUAGES } from './i18n.js';
import { PlanetMergeGame, WORLD_W } from './runtime.js';

export { PlanetMergeGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    window.planetMergeGame = new PlanetMergeGame();
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

    const game = window.planetMergeGame;
    const interruptions = bindDrawerPauseOwnership(game, {
        canResume: g => g.state === 'paused',
        autoResumeOnForeground: false,
        onHidden: g => { if (g.state === 'paused') g.showOverlay('pm-pause'); },
        releaseInputs: g => { g.aiming = false; },
    });

    window.pmRuntime = mountGameRuntime({
        self: 'planet-merge.html',
        game: window.planetMergeGame,
        frame: { logicalWidth: WORLD_W },
        more: '#pmSideMore',
        drawer: {
            idPrefix: 'pm',
            onAcquire: interruptions.onAcquire,
            onRelease: interruptions.onRelease,
            isBusy: () => !!(window.planetMergeGame && window.planetMergeGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });

    window.pmDrawer = window.pmRuntime.drawer;
    window.addEventListener('site-settings:changed', () => {
        if (window.planetMergeGame) window.planetMergeGame.applyLanguage();
    });
});
