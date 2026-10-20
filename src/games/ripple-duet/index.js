import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
/** Ripple Duet composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindDrawerPauseOwnership } from '../../platform/runtime/pause-ownership.js';
import { LANGUAGES } from './i18n.js';
import { initCanvasPalette, RippleDuetGame, W } from './runtime.js';

export { RippleDuetGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    initCanvasPalette(() => window.rdGame && window.rdGame.render());
    window.rdGame = new RippleDuetGame();
    const getText = () => (window.rdGame ? window.rdGame.textTable() : LANGUAGES.en);

    const game = window.rdGame;
    const interruptions = bindDrawerPauseOwnership(game, {
        canResume: g => g.state === 'playing' && g.isPaused,
        autoResumeOnForeground: true,
        releaseInputs: g => { if (g.dragIdx >= 0 && g.dragFrom) { Object.assign(g.place[g.dragIdx], g.dragFrom); g.rebuildField(); } g.dragIdx = -1; g.dragFrom = null; },
    });

    window.rdRuntime = mountGameRuntime({
        self: 'ripple-duet.html',
        game: window.rdGame,
        frame: { logicalWidth: W, extraChrome: () => document.getElementById('rd-console').getBoundingClientRect().height },
        more: '#rdSideMore',
        drawer: {
            idPrefix: 'rd',
            onAcquire: interruptions.onAcquire,
            onRelease: interruptions.onRelease,
            isBusy: () => !!(window.rdGame && window.rdGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['home'],
            getText,
        },
    });

    new ResizeObserver(() => window.rdRuntime.frame?.refresh()).observe(document.getElementById('rd-console'));
    window.rdDrawer = window.rdRuntime.drawer;
});
