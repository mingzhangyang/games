import { createI18nBinder } from '../../platform/i18n/bindings.js';
/** Sword Flight composition root. */
import { getLang } from '../../platform/site-settings.js';
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindDrawerPauseOwnership } from '../../platform/runtime/pause-ownership.js';
import { I18N } from './i18n.js';
import { SwordFlightGame } from './runtime.js';
import { setSwordFlightChrome } from './render/hud.js';

export { SwordFlightGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: I18N });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    window.game = new SwordFlightGame();
    const getText = () => I18N[getLang()] || I18N.zh;

    const game = window.game;
    const interruptions = bindDrawerPauseOwnership(game, {
        canResume: g => g.isPlaying && g.isPaused,
        autoResumeOnForeground: false,
        onHidden: g => { if (g.isPlaying && g.isPaused) g.pauseGame(); },
        releaseInputs: g => { g.keys = {}; },
    });

    window.sfRuntime = mountGameRuntime({
        self: 'sword-flight.html',
        game: window.game,
        frame: { logicalWidth: 480 },
        drawer: {
            idPrefix: 'sf',
            onAcquire: interruptions.onAcquire,
            onRelease: interruptions.onRelease,
            isBusy: () => !!(window.game && window.game.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            getText,
            labels: {
                pause: () => {
                    const t = I18N[getLang()] || I18N.zh;
                    return window.game?.isPaused ? t.resume : t.pause;
                },
            },
        },
    });

    window.sfDrawer = window.sfRuntime.drawer;
    setSwordFlightChrome(window.sfRuntime.chrome);
});
