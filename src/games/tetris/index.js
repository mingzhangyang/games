/** Tetris composition root. */
import { onReady } from '../../platform/boot.js';
import { getLang } from '../../platform/site-settings.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { bindTetrisControls, createTetrisGame, initTetrisPage } from './runtime.js';
import { LANGUAGES } from './i18n.js';

export { Tetris } from './runtime.js';

onReady(() => {
    const i18nBinder = createI18nBinder({ getLang, tables: LANGUAGES });
    i18nBinder.apply();
    const game = createTetrisGame();
    window.game = game;
    initTetrisPage({ i18nBinder });

    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;
    window.tetrisRuntime = mountGameRuntime({
        self: 'tetris.html',
        game,
        frame: { logicalWidth: 400 },
        chrome: {
            owns: ['sound'],
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });

    bindTetrisControls(game);
});
