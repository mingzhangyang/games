/** Gravity Slingshot composition root. */
import { getLang } from '../../platform/site-settings.js';
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import {
    LANGUAGES,
    GravityGame,
    LEVELS,
    simulate,
    solvePar,
    buildDailyCourse,
    DT,
    SPEED_CAP,
} from './runtime.js';

export { GravityGame } from './runtime.js';

onReady(() => {
    const game = new GravityGame();
    window.gdGame = game;
    window.__gravityDebug = { LEVELS, simulate, solvePar, buildDailyCourse, DT, SPEED_CAP };
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

    window.gdRuntime = mountGameRuntime({
        self: 'gravity-slingshot.html',
        game,
        frame: { logicalWidth: 480 },
        more: '#gdSideMore',
        drawer: {
            idPrefix: 'gd',
            onPause: g => g && g.pauseQuiet(),
            onResume: g => g && g.resumeQuiet(),
            isBusy: () => !!(window.gdGame && window.gdGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['more'],
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });

    window.gdDrawer = window.gdRuntime.drawer;
});
