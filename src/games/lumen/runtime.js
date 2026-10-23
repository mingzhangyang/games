/**
 * Lumen 折光 — 状态机与编排
 * =========================
 * 玩法：点击镜面在 '/' 与 '\' 两态间翻转，折转发射器的光束，
 * 点亮全部水晶、不碰暗晶。点击次数 ≤ Par 拿满三星，≤ Par + 2 两星。
 *
 * 分层（低层不得 import 高层，由 tests/verify-lumen-modules.mjs 锁定）：
 *   i18n / storage / audio    文案、GameStorage 适配、音效
 *   model/                    纯模块：beam 光束 / solver 解空间 / levels 关卡与每日 / session 一局状态
 *   systems/records           星级与每日协议键的持久化（本页唯一碰存储处）
 *   render/                   geometry 坐标 / pieces 元件画法 / effects 瞬态特效 / board 每帧合成
 *   input/pointer             画布点击 → 格
 *   ui/                       view（DOM 文案、HUD、结算面板、共享排行榜结果展示）
 *   runtime（本文件）          状态机 menu | playing | won-level | won-daily + isPaused，把上面各层接起来
 *   index                     组合根：共享运行时（frame / drawer / chrome / 暂停归属）
 *
 * 对外字段（抽屉 / 校验器 / 冒烟读取）：state、isPaused、mode、levelIdx、stars，
 * 以及只读的 level / grid / trace / flips / par（委托给当前 PlaySession）。
 */

import { bindContextualRestart } from '../../platform/contextual-restart.js';
import { track } from '../../platform/analytics.js';
import { todayKey, todayKeyDisplay } from '../../platform/daily.js';
import { updateMoreGames } from '../../platform/more-games.js';
import { ensurePlayerName, setPlayerName } from '../../platform/player.js';
import { getLang, getMuted, setMuted } from '../../platform/site-settings.js';
import { LANGUAGES } from './i18n.js';
import { Sfx } from './audio.js';
import { LUMEN_LEVELS, dailyLevel } from './model/levels.js';
import { PlaySession, starsFor } from './model/session.js';
import { loadStars, recordDailyScore, saveStars, todayBest, pushLocalScore } from './systems/records.js';
import { createScoreboardResultSession, retryScoreResults } from '../../platform/scoreboard-submission.js';
import { BoardRenderer } from './render/board.js';
import { bindBoardPointer } from './input/pointer.js';
import { LumenView, copyToClipboard } from './ui/view.js';

/** 通关后让光束动画走一小段再弹结算，点亮感更完整 */
const SOLVE_DELAY_MS = 650;

function vibrate(pattern) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* 不支持则忽略 */ }
}

export class LumenGame {
    constructor() {
        this.view = new LumenView(document);
        this.board = new BoardRenderer(this.view.canvas);
        this.scoreRunId = 0;
        this.resultSession = createScoreboardResultSession({
            onChange: result => this.view.renderScoreResult(result),
        });
        this.view.el['lb-status']?.setAttribute('role', 'status');

        this.lang = getLang();
        this.stars = loadStars();

        // 对局状态：menu | playing | won-level | won-daily
        // ⚠️ 字段名与 verify-stats-drawer.mjs 的 AUGMENT runningExpr 严格对应
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.mode = 'levels';
        this.levelIdx = 0;
        this.session = null;    // 当前对局（PlaySession），盘面 / 光迹 / 点击数的唯一写入方
        this.daily = null;      // 每日谜题 { grid, sol, par, split, links, dateKey }
        this.solveTimer = 0;
        this.animationId = null;
        this.lastFrame = 0;
        this.frameDt = 0;

        this.loadLevel(0);   // 菜单背景展示第 1 关的光路
        this.bindControls();
        this.applyLanguage();
        this.view.renderMute(getMuted());
        this.board.resize();
        window.addEventListener('resize', () => this.board.resize());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（src/platform/game-frame.js）
        window.addEventListener('game-frame:changed', () => this.board.resize());
        // 全站语言/静音设置变化（site-settings.js 派发）→ 本页重刷
        window.addEventListener('site-settings:changed', () => this.applyLanguage());
        window.addEventListener('online', () => {
            if (this.resultSession.getState()) void this.resultSession.refresh();
            else void retryScoreResults();
        });
        this.startLoop();
        void retryScoreResults();
    }

    get TEXT() { return LANGUAGES[this.lang]; }

    get level() { return this.session?.level ?? null; }
    get grid() { return this.session?.grid ?? null; }
    get trace() { return this.session?.trace ?? null; }
    get flips() { return this.session?.flips ?? 0; }
    get par() { return this.session?.par ?? 0; }

    /* ── 语言与侧栏 ── */

    applyLanguage() {
        this.lang = getLang();
        this.view.setLanguage(this.lang, this.TEXT);
        this.view.renderLevelGrid(this.stars);
        this.refreshRecords();
        this.updateHud();
        this.view.renderScoreResult(this.resultSession.getState());
        updateMoreGames(this.lang);
    }

    refreshRecords() {
        const best = todayBest();
        this.view.renderDailyBest(best);
        this.view.renderRecords(this.stars, best);
    }

    updateHud() {
        this.view.renderHud({ daily: this.mode === 'daily', levelIdx: this.levelIdx, flips: this.flips, par: this.par });
    }

    showToast(text, duration, warn) {
        this.view.toast(text, duration, warn);
    }

    /* ── 关卡装载与模式 ── */

    /** 装入一个关卡对象（章节关或每日共用） */
    useLevel(level) {
        this.session = new PlaySession(level);
        this.board.setLevel(level);
    }

    loadLevel(idx) {
        const lv = LUMEN_LEVELS[Math.max(0, Math.min(LUMEN_LEVELS.length - 1, idx))];
        this.levelIdx = lv.index;
        this.mode = 'levels';
        this.useLevel(lv);
    }

    /** 关卡模式启动点（AUGMENT 启动参数 [0]） */
    startLevel(idx) {
        this.view.resetScoreResult(this.resultSession);
        this.scoreRunId++;
        clearTimeout(this.solveTimer);
        this.loadLevel(idx);
        this.state = 'playing'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.pauseOwnership?.invalidate();
        this.view.hideOverlays();
        this.updateHud();
        const intro = LUMEN_LEVELS[this.levelIdx].intro;
        if (intro) this.showToast(this.TEXT[`intro_${intro}`], 3600);
        track('lumen', 'play');
    }

    startDaily() {
        this.view.resetScoreResult(this.resultSession);
        this.scoreRunId++;
        clearTimeout(this.solveTimer);
        this.daily = dailyLevel(todayKey());
        this.mode = 'daily';
        this.useLevel(this.daily);
        this.state = 'playing'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.pauseOwnership?.invalidate();
        this.view.hideOverlays();
        this.updateHud();
        this.showToast(this.TEXT.dailyStartToast, 1800);
        track('lumen', 'play');
    }

    resetLevel() {
        if (this.state !== 'playing') return;
        clearTimeout(this.solveTimer);
        this.session.reset();
        this.board.clearEffects();
        this.updateHud();
        Sfx.click();
    }

    showMenu() {
        this.view.resetScoreResult(this.resultSession);
        this.pauseOwnership?.invalidate();
        clearTimeout(this.solveTimer);
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.loadLevel(this.levelIdx);   // 菜单背景继续展示当前关的光路
        this.view.showStart();
        this.view.renderLevelGrid(this.stars);
        this.refreshRecords();
        this.updateHud();
    }

    nextLevel() {
        if (this.levelIdx + 1 >= LUMEN_LEVELS.length) {
            this.showMenu();
            this.showToast(this.TEXT.levelDone, 2200);
        } else {
            this.startLevel(this.levelIdx + 1);
        }
    }

    /* ── 核心交互：点击镜面（联动组整组翻转） ── */

    flipMirror(r, c) {
        const event = this.session.tap(r, c);
        if (!event) return;
        this.board.animateTap(event, this.session.grid);
        Sfx.flip();
        if (event.gained.length) {
            Sfx.crystal();
            this.board.burst(event.gained, 'crystal');
        }
        if (event.newShadows.length) {
            Sfx.shadow();
            vibrate(30);
            this.board.burst(event.newShadows, 'shadow');
            this.showToast(this.TEXT.shadowWarn, 1600, true);
        }
        this.updateHud();

        if (event.solved) {
            Sfx.win();
            vibrate([18, 60, 18]);
            this.solveTimer = setTimeout(() => this.finishSolved(), SOLVE_DELAY_MS);
        }
    }

    finishSolved() {
        if (this.state !== 'playing' || !this.session.solved) return;
        if (this.mode === 'daily') this.finishDaily();
        else this.finishLevel();
    }

    /* ── 结算 ── */

    finishLevel() {
        const stars = starsFor(this.flips, this.par);
        if (stars > (this.stars[this.levelIdx] || 0)) {
            this.stars[this.levelIdx] = stars;
            saveStars(this.stars);
        }
        this.state = 'won-level'; this.contextualRestart?.sync();
        if (stars >= 3) Sfx.star3();
        this.view.showClear({ stars, flips: this.flips, par: this.par });
        this.refreshRecords();
        track('lumen', 'finish');
    }

    finishDaily() {
        if (this.mode !== 'daily' || this.state !== 'playing') return;
        const date = this.daily.dateKey;
        const score = this.flips;
        this.state = 'won-daily'; this.contextualRestart?.sync();
        const record = recordDailyScore(date, score);
        this.view.showDailyResult({ score, ...record, playerName: ensurePlayerName() || '' });
        this.refreshRecords();
        track('lumen', 'finish');
        void this.resultSession.publish({
            runId: this.scoreRunId, game: `lumen-d${date}`, date,
            name: ensurePlayerName() || 'Anonymous', score,
        }).then(receipt => {
            if (receipt.status === 'sent') return;
            // lm_local_<date> remains a local display fallback, never a retry queue.
            pushLocalScore(receipt.entry.date, { name: receipt.entry.name, score: receipt.entry.score });
            if (this.resultSession.getState()?.entry.runId === receipt.entry.runId) {
                this.view.renderScoreResult(this.resultSession.getState());
            }
        });
    }

    async copyResult() {
        const t = this.TEXT;
        const ok = await copyToClipboard(`折光 Lumen · ${todayKeyDisplay()} · ${this.flips} ${t.flipsWord} (${t.par} ${this.par})`);
        this.view.copyFeedback(ok);
    }

    toggleMute() {
        setMuted(!getMuted());
        this.view.renderMute(getMuted());
    }

    /* ── 暂停（供底部统计抽屉调用） ── */

    /**
     * 静默暂停 / 恢复。本页没有暂停遮罩——冻结完全靠主循环的 isPaused 判断。
     * menu 态没有进行中的对局，标记它没意义（恢复时反而容易误判）。
     */
    pauseQuiet() {
        if (this.state === 'menu') return;
        this.isPaused = true; this.contextualRestart?.sync();
    }

    resumeQuiet() {
        if (this.pauseOwnership?.isHeld()) return;
        if (!this.isPaused) return;
        this.isPaused = false; this.contextualRestart?.sync();
        this.lastFrame = performance.now();   // 丢掉暂停期间的时间跳跃
    }

    /** 抽屉判据：只有进行中的对局才值得暂停 */
    isRunning() {
        return !this.isPaused && this.state === 'playing';
    }

    /* ── 输入接线 ── */

    bindControls() {
        const click = fn => () => { Sfx.click(); fn(); };
        this.view.bind({
            home: () => { window.location.href = 'index.html'; },
            levels: click(() => this.startLevel(0)),
            daily: click(() => this.startDaily()),
            pickLevel: i => { Sfx.click(); this.startLevel(i); },
            next: click(() => this.nextLevel()),
            replay: click(() => this.startLevel(this.levelIdx)),
            menu: click(() => this.showMenu()),
            again: click(() => this.startDaily()),
            copy: () => this.copyResult(),
            mute: () => this.toggleMute(),
            rename: name => setPlayerName(name),
        });
        if (this.view.el['reset-btn']) {
            this.contextualRestart = bindContextualRestart({
                button: this.view.el['reset-btn'],
                active: () => this.state === 'playing' && !this.isPaused,
                hasProgress: () => this.flips > 0,
                restart: () => { this.resetLevel(); },
            });
        }
        bindBoardPointer(this.view.canvas, {
            isActive: () => this.state === 'playing',
            onCell: (r, c) => this.flipMirror(r, c),
        });
    }

    /* ── 主循环 ── */

    startLoop() {
        this.lastFrame = performance.now();
        const tick = (now) => {
            this.animationId = requestAnimationFrame(tick);
            let dt = (now - this.lastFrame) / 1000;
            this.lastFrame = now;
            if (dt > 0.05) dt = 0.05;
            // 暂停时只重排下一帧、不推进任何时间（lastFrame 已在上面赋值，
            // 恢复那一帧不会拿到整个暂停时长的 dt）
            if (this.isPaused) {
                this.frameDt = 0;
                return;
            }
            this.frameDt = dt;
            this.board.update(dt);
            this.board.draw(this.session);
        };
        this.animationId = requestAnimationFrame(tick);
    }
}
