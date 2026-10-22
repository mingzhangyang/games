/**
 * 画牢 Loop Jail — 页面入口（composition root）
 * ============================================
 * 模块划分：
 *   simulation.js  纯模拟：几何判定 / 墨水 / 小怪 / 波次 / 道具 / 计分（无 DOM，Node 可测）
 *   renderer.js    Canvas 霓虹渲染与视觉效果（只读模拟状态）
 *   audio.js       WebAudio 音效（共享引擎，跟随 site_muted）
 *   runtime.js     状态机 / 输入 / 主循环 / HUD / 浮层
 *   index.js       本文件：文案绑定、排行榜弹窗、共享 chrome 与 Immersive Stage 的接线
 */
import { onReady } from '../../platform/boot.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { getLang } from '../../platform/site-settings.js';
import { track } from '../../platform/analytics.js';
import { mountScoreboardDialog } from '../../platform/scoreboard-dialog.js';
import { LANGUAGES } from './i18n.js';
import { LoopJailGame } from './runtime.js';

const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;

onReady(() => {
    const i18n = createI18nBinder({ getLang, tables: LANGUAGES });
    i18n.apply();
    window.addEventListener('site-settings:changed', () => i18n.apply());

    const game = new LoopJailGame({
        track,
        // 每局结束（得分 > 0）上传；中途重开 / 回菜单的局不参赛。
        // scoreboard 在下方创建，结算时早已初始化
        onFinish: ({ score }) => {
            if (score > 0) void scoreboard.submit({ boardId: 'all', score });
        },
    });
    // 测试钩子（smoke-loop-jail / verify-contextual-restart / smoke-gameplay-interruptions）
    window.ljGame = game;

    window.ljRuntime = mountGameRuntime({
        self: 'loop-jail.html',
        game,
        frame: { layout: 'immersive' },
        more: '#ljStartMore',
        chrome: {
            getText,
            owns: ['home', 'sound'],
            labels: { pause: () => (game.isPaused ? getText().resumeLabel : getText().pause) },
        },
    });

    const scoreboard = mountScoreboardDialog({
        boards: [{
            id: 'all',
            key: 'loop-jail',
            label: { en: 'All-time high scores', zh: '历史最高分' },
            description: {
                en: 'Every finished run with points. Highest score wins.',
                zh: '每局结束且得分大于 0 即可参赛，分数越高越好。',
            },
        }],
        triggers: [{ selector: '#lj-leaderboard-btn', icon: true }, { before: '#lj-btn-menu' }],
        onOpen: () => game.pauseOwnership.acquire('ranking'),
        onClose: () => game.pauseOwnership.release('ranking'),
    });

    game.init();
});
