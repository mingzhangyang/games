/**
 * 雾隐九宫 Sudoku in the Mist — 页面入口（composition root）
 * ===========================================================================
 * 模块划分：
 *   model/       纯规则：技巧梯、揭雾、计分、对局状态机、出题器、关卡（无 DOM，Node 可测）
 *   render/      DOM 棋盘与 Canvas 雾层（只读规则层给出的知识视图）
 *   audio.js     WebAudio 音效（共享引擎，跟随 site_muted）
 *   runtime.js   状态机 / 输入 / HUD / 浮层 / 回放
 *   index.js     本文件：文案绑定、共享 chrome 接线
 * 原型阶段（设计 §11 P1）：不接排行榜与每日题。
 */
import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
import { track } from '../../platform/analytics.js';
import { LANGUAGES } from './i18n.js';
import { SudokuMistGame } from './runtime.js';

const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

onReady(() => {
    const i18n = createI18nBinder({ getLang, tables: LANGUAGES });
    i18n.apply();
    window.addEventListener('site-settings:changed', () => i18n.apply());

    const game = new SudokuMistGame({ track });
    // 测试钩子（smoke-sudoku-mist / verify-contextual-restart 等）
    window.smGame = game;

    window.smRuntime = mountGameRuntime({
        self: 'sudoku-mist.html',
        game,
        more: '#smStartMore',
        chrome: {
            getText,
            owns: ['home', 'sound'],
            labels: { pause: () => (game.isPaused ? getText().resumeLabel : getText().pause) },
        },
    });

    game.init();
});
