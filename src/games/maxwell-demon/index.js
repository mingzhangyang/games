import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
/** Maxwell's Demon composition root (Immersive Stage, docs/contracts/layout.md §7). */
import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { createPauseOwnership, bindPageVisibility } from '../../platform/runtime/pause-ownership.js';
import { initCanvasPalette, MaxwellDemonGame } from './runtime.js';
import { LANGUAGES } from './i18n.js';

export { MaxwellDemonGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    initCanvasPalette(() => window.mdGame && window.mdGame.draw());
    window.mdGame = new MaxwellDemonGame();
    const getText = () => (window.mdGame ? window.mdGame.textTable() : LANGUAGES.en);

    // 沉浸布局没有统计抽屉；切后台的暂停租约仍走共享 pauseOwnership（回前台自动续上原局）
    const game = window.mdGame;
    game.pauseOwnership = createPauseOwnership({
        isRunning: () => game.isRunning(),
        canResume: () => game.state === 'playing' && game.isPaused,
        pause: () => game.pauseQuiet(),
        resume: () => game.resumeQuiet(),
        releaseInputs: () => { game.wantGate = false; game.wantScan = false; },
    });
    bindPageVisibility(game.pauseOwnership, { autoResume: true });

    window.mdRuntime = mountGameRuntime({
        self: 'maxwell-demon.html',
        game,
        frame: { layout: 'immersive' },
        more: '#mdStartMore',
        chrome: {
            owns: ['home'],
            getText,
        },
    });
});
