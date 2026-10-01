/** Needle Awn composition root. */
import { getLang } from '../../platform/site-settings.js';
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { I18N } from './i18n.js';
import { GameEngine, ARENA_WIDTH } from './runtime.js';

export { GameEngine } from './runtime.js';

onReady(() => {
    window.gameEngine = new GameEngine();
    const getText = () => I18N[getLang()] || I18N.zh;

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
            owns: ['more', 'home'],
            getText,
            labels: { pause: () => (I18N[getLang()] || {}).pause },
        },
    });

    window.naDrawer = window.naRuntime.drawer;
});
