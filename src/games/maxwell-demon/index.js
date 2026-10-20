import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
/** Maxwell's Demon composition root. */
import { onReady } from '../../platform/boot.js';
import { ICONS } from '../../platform/icons.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindDrawerPauseOwnership } from '../../platform/runtime/pause-ownership.js';
import { initCanvasPalette, MaxwellDemonGame, W } from './runtime.js';
import { LANGUAGES } from './i18n.js';

export { MaxwellDemonGame } from './runtime.js';

onReady(() => {
    const phase6I18n = createI18nBinder({ getLang, tables: LANGUAGES });
    phase6I18n.apply();
    window.addEventListener('site-settings:changed', () => phase6I18n.apply());
    initCanvasPalette(() => window.mdGame && window.mdGame.draw());
    window.mdGame = new MaxwellDemonGame();
    const getText = () => (window.mdGame ? window.mdGame.textTable() : LANGUAGES.en);

    const game = window.mdGame;
    const interruptions = bindDrawerPauseOwnership(game, {
        canResume: g => g.state === 'playing' && g.isPaused,
        autoResumeOnForeground: true,
        releaseInputs: g => { g.wantGate = false; g.wantScan = false; },
    });

    window.mdRuntime = mountGameRuntime({
        self: 'maxwell-demon.html',
        game: window.mdGame,
        // 动作钮在画布下方占一行：计入桌面纵向预算（与 flame-verse 的实验台同模式）
        frame: { logicalWidth: W, extraChrome: () => document.getElementById('md-action-row').getBoundingClientRect().height },
        more: '#mdSideMore',
        drawer: {
            idPrefix: 'md',
            onAcquire: interruptions.onAcquire,
            onRelease: interruptions.onRelease,
            isBusy: () => !!(window.mdGame && window.mdGame.isRunning()),
            ICONS,
            getText,
        },
        chrome: {
            owns: ['home'],
            getText,
        },
    });

    new ResizeObserver(() => window.mdRuntime.frame?.refresh()).observe(document.getElementById('md-action-row'));
    window.mdDrawer = window.mdRuntime.drawer;
});
