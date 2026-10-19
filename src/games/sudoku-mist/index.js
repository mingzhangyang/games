/**
 * 雾隐九宫 Sudoku in the Mist — 页面入口（composition root）
 * ===========================================================================
 * 模块划分：
 *   model/       纯规则：技巧梯、揭雾、计分、对局状态机、出题器、关卡（无 DOM，Node 可测）
 *   render/      DOM 棋盘与 Canvas 雾层（只读规则层给出的知识视图）
 *   audio.js     WebAudio 音效（共享引擎，跟随 site_muted）
 *   runtime.js   状态机 / 输入 / HUD / 浮层 / 回放
 *   index.js     本文件：文案绑定、共享 chrome 接线
 * 排行榜（设计 §8.2）：只有每日榜 sudoku-mist-d<YYYYMMDD>，每天第一次完成时提交；关卡 / 自由局成绩只存本地。
 */
import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
import { track } from '../../platform/analytics.js';
import { todayKey } from '../../platform/daily.js';
import { mountScoreboardDialog } from '../../platform/scoreboard-dialog.js';
import { submitScore } from '../../platform/leaderboard.js';
import { pendingScoreCount, retryPendingScores } from '../../platform/scoreboard-pending.js';
import { LANGUAGES } from './i18n.js';
import { SudokuMistGame } from './runtime.js';

const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

onReady(() => {
    const i18n = createI18nBinder({ getLang, tables: LANGUAGES });
    i18n.apply();
    window.addEventListener('site-settings:changed', () => i18n.apply());

    // scoreboard 在下方创建，每日局完成时早已初始化
    const game = new SudokuMistGame({
        track,
        // journal：先记进本地重试队列再 POST——请求没回来就关页，下次进来还能补交
        onDailyCleared: ({ dateKey, score }) => {
            void scoreboard.submit({ boardId: 'daily', key: `sudoku-mist-d${dateKey}`, score, journal: true });
        },
    });
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

    const scoreboard = mountScoreboardDialog({
        boards: [{
            id: 'daily',
            // 对局中看的是这一局所属那天的榜（跨过午夜也不串），菜单里看今天的
            key: () => `sudoku-mist-d${game.meta?.kind === 'daily' && game.state !== 'menu' ? game.meta.dateKey : todayKey()}`,
            label: { en: "Today's mist", zh: '今日一雾' },
            description: {
                en: 'Only the first clear of each day\'s puzzle counts. Highest reasoning score wins.',
                zh: '每天只计第一次完成的成绩，推理分越高越好。',
            },
        }],
        triggers: [{ before: '#sm-pause-btn', icon: true }, { before: '#sm-btn-menu' }],
        onOpen: () => game.pauseOwnership.acquire('ranking'),
        onClose: () => game.pauseOwnership.release('ranking'),
    });

    // 上次的每日成绩没等到确认就离开了：进页时补交（重复 POST 无害，榜上每人只留最好成绩）。
    // 查整个重试队列而不只是今天的键——跨过午夜的昨日成绩也要补；每条按它自己的榜单键提交
    const retryScores = () => { if (pendingScoreCount()) void retryPendingScores(submitScore); };
    window.addEventListener('online', retryScores);
    retryScores();

    game.init();
});
