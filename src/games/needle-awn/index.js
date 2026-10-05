import { createI18nBinder } from '../../platform/i18n/bindings.js';
/** Needle Awn composition root. */
import { getLang } from '../../platform/site-settings.js';
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { I18N } from './i18n.js';
import { GameEngine, ARENA_WIDTH } from './runtime.js';

export { GameEngine } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: I18N });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    window.gameEngine = new GameEngine();
    const getText = () => I18N[getLang()] || I18N.zh;
    const getPauseLabel = () => {
        const text = getText();
        return window.gameEngine && window.gameEngine.state === 'paused'
            ? text.resume
            : text.pauseTitle;
    };

    window.naRuntime = mountGameRuntime({
        self: 'needle-awn.html',
        game: window.gameEngine,
        frame: { logicalWidth: ARENA_WIDTH },
        drawer: {
            idPrefix: 'na',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.gameEngine && window.gameEngine.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['home'],
            getText,
            labels: { pause: getPauseLabel },
        },
    });

    window.naDrawer = window.naRuntime.drawer;
});
