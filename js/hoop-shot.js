/**
 * Hoop Shot 街机投篮
 * Flick-basketball arcade — one finger, one miss, endless chase.
 * Messenger-basketball style loop: flick to shoot, arc the ball through
 * the moving hoop, 3 straight makes = ON FIRE (double points), one miss
 * ends the run.
 *
 * Vanilla JS + hand-rolled physics. No runtime dependencies.
 */

import { ensurePlayerName, setPlayerName } from './player.js';
import { submitScore, fetchBoard } from './leaderboard.js';
import { getLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { createStatsDrawer } from './game-drawer.js';
import { updateMoreGames, renderMoreGames } from './more-games.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { storageGet, storageSet } from './safe-storage.js';
import { track } from './analytics.js';
import { bindPalette } from './theme.js';

/* 画布调色板：颜色只在 css/hoop-shot.css 里定义一次（深色 = 原值，浅色覆盖），见 docs/contracts/theme.md §2.4。
   P 由 onReady 里的 bindPalette() 填充，主题切换时就地刷新（背景离屏缓存随之重建）。
   篮球与篮筐是「实物」：两套主题一致，不进调色板；只有场馆背景、球场线、篮板、球网、瞄准与飘字随主题。
   *-rgb 变量是「r, g, b」三元组，供需要逐帧改 alpha 的地方拼 rgba()。 */
const CANVAS_VARS = {
    bgTop: '--hs-cv-bg-top',
    bgMid: '--hs-cv-bg-mid',
    bgBottom: '--hs-cv-bg-bottom',
    star: '--hs-cv-star',
    floorTop: '--hs-cv-floor-top',
    floorBottom: '--hs-cv-floor-bottom',
    courtLine: '--hs-cv-court-line',
    courtKey: '--hs-cv-court-key',
    boardTop: '--hs-cv-board-top',
    boardBottom: '--hs-cv-board-bottom',
    boardEdge: '--hs-cv-board-edge',
    netRgb: '--hs-cv-net-rgb',
    aimRgb: '--hs-cv-aim-rgb',
    aimText: '--hs-cv-aim-text',
    popup: '--hs-cv-popup',
    popupBig: '--hs-cv-popup-big',
    spark: '--hs-cv-spark',
};
let P = null;
import { makeText } from './i18n.js';
import { onReady } from './boot.js';
import { createSfxEngine } from './game-sfx.js';

/* ────────────────────────── utilities ────────────────────────── */

function storageParse(key, fallback) {
    try {
        const parsed = JSON.parse(storageGet(key));
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
        return fallback;
    }
}

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function formatNumber(n) {
    return Number(n).toLocaleString('en-US');
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = makeText({
    en: {
        stats: 'Stats',
        title: 'Hoop Shot',
        subtitle: 'Flick · Arc · Score',
        howto: 'Swipe up to flick the ball into the hoop. One miss ends the run. 3 straight makes = ON FIRE, double points!',
        play: 'Play',
        best: 'Best',
        paused: 'Paused',
        resume: 'Resume',
        home: 'Home',
        again: 'Play Again',
        gameOver: 'Game Over',
        newBest: 'NEW BEST!',
        longestStreak: 'Longest streak',
        swish: 'SWISH',
        onFire: 'ON FIRE!',
        onFireHud: 'ON FIRE ×2',
        score: 'Score',
        share: 'Share',
        copyResult: 'Copy Result',
        leaderboard: 'Global Top 10',
        loadingScores: 'Loading…',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline — showing local scores',
        submitFail: 'Score upload failed — saved locally',
        tapToStart: 'Swipe up to shoot',
        hint: 'Swipe up to shoot · P pause · M mute',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
    },
    zh: {
        stats: '数据统计',
        title: '街机投篮',
        subtitle: '甩投 · 抛物线 · 得分',
        howto: '向上滑动把球投进篮筐。投失一球就结束。连中 3 球点燃火球模式，分数翻倍！',
        play: '开始游戏',
        best: '最佳',
        paused: '已暂停',
        resume: '继续游戏',
        home: '返回主页',
        again: '再来一局',
        gameOver: '游戏结束',
        newBest: '新纪录！',
        longestStreak: '最长连击',
        swish: '空心入网',
        onFire: '火热状态！',
        onFireHud: '火热 ×2',
        score: '得分',
        share: '分享成绩',
        copyResult: '复制成绩',
        leaderboard: '全球前 10',
        loadingScores: '加载中…',
        noScores: '暂无分数',
        lbOffline: '榜单离线——显示本地成绩',
        submitFail: '成绩上传失败——已保存到本地',
        tapToStart: '向上滑动投篮',
        hint: '向上滑动投篮 · P 暂停 · M 静音',
        sideHowTo: '玩法说明',
        sideRecords: '战绩',
    }
});

/* ────────────────────────── audio ────────────────────────── */

const sfxEngine = createSfxEngine();

const Sfx = {
    get muted() { return getMuted(); },

    noise(duration, volume, delay = 0) {
        sfxEngine.noise({ dur: duration, vol: volume, delay, filterFreq: 0 });
    },

    flick() { this.noise(0.14, 0.12); },
    swish() {
        this.noise(0.2, 0.16);
        sfxEngine.tone({ freq: 660, type: 'triangle', dur: 0.14, vol: 0.14, delay: 0.03 });
    },
    score() {
        sfxEngine.tone({ freq: 520, type: 'triangle', dur: 0.1, vol: 0.16 });
        sfxEngine.tone({ freq: 780, type: 'triangle', dur: 0.12, vol: 0.14, delay: 0.08 });
    },
    clank() {
        sfxEngine.tone({ freq: 1150, slideTo: 700, type: 'square', dur: 0.12, vol: 0.1 });
    },
    fire() {
        this.noise(0.4, 0.2);
        sfxEngine.tone({ freq: 300, slideTo: 900, type: 'sawtooth', dur: 0.35, vol: 0.14 });
    },
    gameOver() {
        sfxEngine.tone({ freq: 420, slideTo: 90, type: 'sawtooth', dur: 0.6, vol: 0.18 });
        sfxEngine.tone({ freq: 300, slideTo: 70, type: 'sine', dur: 0.7, vol: 0.13, delay: 0.1 });
    },
    newBest() {
        [523, 659, 784, 1046].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.15, delay: i * 0.09 });
        });
    },
    click() { sfxEngine.tone({ freq: 640, type: 'square', dur: 0.05, vol: 0.07 }); },
    toggleMuted() {
        const muted = !getMuted();
        setMuted(muted);
        return muted;
    }
};

/* ────────────────────────── config ────────────────────────── */

const WORLD_W = 420;
const WORLD_H = 640;
const FLOOR_H = 100; // 球场木纹地板高度（世界像素）

const BALL_R = 19;
const BALL_X = WORLD_W / 2;
const BALL_Y = WORLD_H - 62;
const GRAVITY = 1750;
const FLICK_SCALE = 6.5;        // 甩动像素 → 速度倍率（170~230px 的自然甩动可覆盖全部筐高）
const MAX_SPEED = 2050;
const MAX_VX = 950;
const MIN_FLICK_UP = 34;        // 最小向上甩动距离
const RIM_R = 5;                // 篮筐前沿碰撞半径
const RIM_LEN = 64;             // 篮筐宽度
const RIM_RY = 8;               // 篮筐椭圆环纵向半径（透视压扁）
const BB_W = 9;                 // 篮板厚度
const BB_H = 84;                // 篮板高度
const RESTITUTION_RIM = 0.55;
const RESTITUTION_BB = 0.62;
const REPOSITION_DELAY = 420;   // 进球后换篮筐延迟（等球穿网落地）
const PREVIEW_DT = 1 / 60;
const PREVIEW_STEPS = 28;       // 瞄准弹道预览步数（约 0.47s，只提示弧线不含碰撞）

const STREAK_FIRE = 3;          // 连中 3 球触发火球
const LB_GAME = 'hoop-shot';

/* ────────────────────────── game ────────────────────────── */

class HoopShotGame {
    constructor() {
        this.canvas = document.getElementById('hs-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        this.gatherElements();

        this.state = 'menu'; // menu | playing | paused | gameover | settling
        this.score = 0;
        this.best = storageParse('hs_best', 0);
        this.streak = 0;
        this.longestStreak = 0;      // 本局最长连击
        this.bestStreakAll = storageParse('hs_longest_streak', 0); // 全局最长连击
        this.onFire = false;

        this.ball = null;      // { x, y, vx, vy, rot, prevY }
        this.ballReady = true;
        this.launched = false;
        this.settling = false; // 进球后等球穿网的过渡期（篮筐暂不摆动/换位）

        // 篮筐位置
        this.hoopX = 120;      // 篮筐前沿 lip 的 x
        this.rimY = 210;

        // 甩投输入
        this.dragStart = null;
        this.dragCurrent = null;

        this.particles = [];
        this.popups = [];
        this.shake = 0;
        this.netSquash = 0;
        this.time = 0;

        this.animationId = null;
        this.lastFrameTime = 0;
        this.leaderboardTab = 'alltime';

        this.starfield = null;

        this.applyLanguage();
        this.randomizeHoop(true);
        this.bindInput();
        this.bindUI();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（见 js/game-frame.js）：
        // 后端缓冲区必须在 CSS 尺寸变化之后重算
        window.addEventListener('game-frame:changed', () => this.resize());
        this.updateHud();
        this.showStartScreen();
        this.startLoop();
    }

    gatherElements() {
        const ids = [
            'hs-score', 'hs-best', 'hs-streak',
            'hs-start', 'hs-title', 'hs-subtitle', 'hs-howto', 'hs-btn-play',
            'hs-best-line', 'hs-start-mute',
            'hs-pause', 'hs-btn-resume', 'hs-btn-menu', 'hs-pause-title',
            'hs-over', 'hs-over-title', 'hs-over-score', 'hs-over-best', 'hs-over-newbest',
            'hs-over-streak', 'hs-btn-share', 'hs-btn-copy', 'hs-btn-again', 'hs-btn-home',
            'hs-lb-title', 'hs-lb-list', 'hs-lb-status',
            'hs-username', 'hs-username-label',
            'hs-pause-btn', 'hs-mute-btn', 'hs-fire-badge', 'hs-hint',
            'hs-side-howto-title', 'hs-side-howto', 'hs-side-records-title', 'hs-side-records'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^hs-/, '')] = el;
        });
    }

    /* ── language ── */

    applyLanguage() {
        this.lang = getLang();
        this.TEXT = LANGUAGES[this.lang];
        document.documentElement.lang = this.lang;
        document.title = this.lang === 'zh'
            ? '街机投篮 — 投篮街机游戏'
            : 'Hoop Shot — Flick Basketball Arcade';
        const t = this.TEXT;

        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['btn-play']) this.el['btn-play'].textContent = `🏀 ${t.play}`;
        if (this.el['pause-title']) this.el['pause-title'].textContent = t.paused;
        if (this.el['btn-resume']) this.el['btn-resume'].textContent = t.resume;
        if (this.el['btn-menu']) this.el['btn-menu'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;
        if (this.el['over-title']) this.el['over-title'].textContent = t.gameOver;
        if (this.el['btn-share']) this.el['btn-share'].innerHTML = `${ICONS.share}<span>${t.share}</span>`;
        if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;
        if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;
        if (this.el['btn-home']) this.el['btn-home'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['lb-status']) this.el['lb-status'].textContent = '';
        if (this.el['username-label']) this.el['username-label'].textContent = t.usernameLabel;
        if (this.el.username) this.el.username.placeholder = t.usernameLabel;
        if (this.el.hint) this.el.hint.textContent = t.hint; // 保留键位说明，不再被 tapToStart 整体替换
        this.updateMuteButtons();
        this.updateStartStats();
        // 桌面侧栏（≥1024px 可见）
        if (this.el['side-howto-title']) this.el['side-howto-title'].textContent = `📖 ${t.sideHowTo}`;
        if (this.el['side-howto']) this.el['side-howto'].textContent = t.howto;
        if (this.el['side-records-title']) this.el['side-records-title'].textContent = `🏅 ${t.sideRecords}`;
        this.updateSideRecords();
        updateMoreGames(this.lang);
    }

    updateStartStats() {
        if (this.el['best-line']) {
            this.el['best-line'].textContent = `🏆 ${this.TEXT.best}: ${formatNumber(this.best)}`;
        }
    }

    /** 桌面侧栏战绩（≥1024px 可见） */
    updateSideRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        const t = this.TEXT;
        const rows = [
            [`🏆 ${t.best}`, formatNumber(this.best)],
            [`🔥 ${t.longestStreak}`, String(this.bestStreakAll)]
        ];
        box.textContent = '';
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'hs-side-row game-side-row';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            const valueEl = document.createElement('b');
            valueEl.textContent = value;
            row.append(labelEl, valueEl);
            box.appendChild(row);
        });
    }

    showStartScreen() {
        this.state = 'menu';
        this.showOverlay('hs-start');
        this.updateStartStats();
    }

    showOverlay(id) {
        ['hs-start', 'hs-pause', 'hs-over'].forEach(screenId => {
            const el = document.getElementById(screenId);
            if (el) el.classList.toggle('hidden', screenId !== id);
        });
    }

    hideOverlays() {
        ['hs-start', 'hs-pause', 'hs-over'].forEach(screenId => {
            const el = document.getElementById(screenId);
            if (el) el.classList.add('hidden');
        });
    }

    /* ── 流程 ── */

    startGame() {
        this.state = 'playing';
        this.score = 0;
        this.streak = 0;
        this.longestStreak = 0; // 本局最长连击（全局纪录另存 hs_longest_streak）
        this.bestStreakAll = storageParse('hs_longest_streak', 0);
        this.onFire = false;
        this.ball = null;
        this.ballReady = true;
        this.launched = false;
        this.settling = false;
        this.particles = [];
        this.popups = [];
        this.shake = 0;
        this.randomizeHoop(true);
        this.hideOverlays();
        this.updateHud();
        this.ensureLoop();
        track('hoop-shot', 'play');
    }

    togglePause() {
        if (this.state === 'playing') {
            this.state = 'paused';
            this.showOverlay('hs-pause');
            this.stopLoop();
        } else if (this.state === 'paused') {
            this.state = 'playing';
            this.showOverlay(null);
            this.hideOverlays();
            this.ensureLoop();
        }
    }

    /**
     * 静默暂停 / 恢复 —— 给底部统计抽屉用。
     * 与 togglePause 的状态迁移一致，但不显示「Paused」遮罩，
     * 免得玩家开抽屉时背后闪一层暂停界面。
     */
    pauseQuiet() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this.stopLoop();
    }

    resumeQuiet() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.ensureLoop();
    }

    /** 抽屉判据：只有真正在跑的对局才值得暂停 */
    isRunning() {
        return this.state === 'playing';
    }

    goHome() {
        this.state = 'menu';
        this.ball = null;
        this.ballReady = true;
        this.ensureLoop();
        this.render();
        this.showStartScreen();
    }

    /* ── 篮筐 ── */

    // 篮筐朝向始终面向投篮点：筐心在球左侧时镜像（板在左、筐口朝右），
    // 否则篮板会挡在球与筐口之间，远侧篮筐无可行轨迹
    randomizeHoop(initial = false) {
        const minC = 89, maxC = WORLD_W - 89; // 板+筐组装体完整在屏内
        const cx = minC + Math.random() * (maxC - minC);
        this.hoopFlip = cx < BALL_X;
        this.hoopBaseX = this.hoopFlip ? cx + RIM_LEN / 2 : cx - RIM_LEN / 2; // lip = 靠球一侧的筐沿
        this.hoopX = this.hoopBaseX;
        // 摆动相位归零：新筐从基位起摆，不继承旧相位
        this.hoopOsc = 0;
        if (initial) {
            this.rimY = 210;    // 每局第一筐固定高度，开局体验一致
        } else {
            this.rimY = 150 + Math.random() * 110;
        }
    }

    // 高分后篮筐开始左右飘移，速度随分数增加。
    // 相位自累计 + 振幅缓入：任何分数临界点、任何一帧都不发生位置跳变
    updateHoopMotion(dt) {
        if (this.state !== 'playing' || this.score < 8 || this.settling) {
            if (this.score < 8) {
                this.hoopOsc = 0;
                this.hoopMotionAge = 0;
            }
            return;
        }
        this.hoopMotionAge += dt;
        const speed = 1.1 + Math.min(1.6, (this.score - 8) * 0.08);
        const ampTarget = Math.min(70, 34 + (this.score - 8) * 2.2);
        const amp = ampTarget * Math.min(1, this.hoopMotionAge / 1.2);
        this.hoopOsc += speed * dt;
        const lo = this.hoopFlip ? 89 : 40;
        const hi = this.hoopFlip ? WORLD_W - 24 : WORLD_W - 16 - RIM_LEN - BB_W;
        this.hoopX = clamp(this.hoopBaseX + Math.sin(this.hoopOsc) * amp, lo, hi);
    }

    get bbX() {
        // 篮板左侧面 x（两种朝向统一：板总在 bbX..bbX+BB_W）
        return this.hoopFlip ? this.hoopX - BB_W - RIM_LEN : this.hoopX + RIM_LEN;
    }

    get rimLeft() {
        return this.hoopFlip ? this.hoopX - RIM_LEN : this.hoopX;
    }

    get rimRight() {
        return this.hoopFlip ? this.hoopX : this.hoopX + RIM_LEN;
    }

    /* ── 输入 ── */

    bindInput() {
        const canvas = this.canvas;
        const toWorld = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (clientX - rect.left) * (WORLD_W / rect.width),
                y: (clientY - rect.top) * (WORLD_H / rect.height)
            };
        };

        canvas.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing' || !this.ballReady) return;
            e.preventDefault();
            this.dragStart = toWorld(e.clientX, e.clientY);
            this.dragCurrent = this.dragStart;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }, { passive: false });

        canvas.addEventListener('pointermove', (e) => {
            if (!this.dragStart || this.state !== 'playing') return;
            e.preventDefault();
            this.dragCurrent = toWorld(e.clientX, e.clientY);
        }, { passive: false });

        canvas.addEventListener('pointerup', (e) => {
            e.preventDefault();
            if (this.dragStart && this.state === 'playing' && this.ballReady) {
                const end = toWorld(e.clientX, e.clientY);
                this.flick(end.x - this.dragStart.x, end.y - this.dragStart.y);
            }
            this.dragStart = null;
            this.dragCurrent = null;
        }, { passive: false });

        canvas.addEventListener('pointercancel', () => {
            this.dragStart = null;
            this.dragCurrent = null;
        });

        document.addEventListener('keydown', (e) => {
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            if (e.key === 'p' || e.key === 'P') {
                if (this.state === 'playing' || this.state === 'paused') this.togglePause();
            } else if (e.key === 'm' || e.key === 'M') {
                this.toggleMute();
            }
        });

        // 切换标签页自动暂停
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'playing') {
                this.togglePause();
            }
        });
    }

    flick(dx, dy) {
        if (dy > -MIN_FLICK_UP) return; // 必须向上甩
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const speed = Math.min(MAX_SPEED, len * FLICK_SCALE);
        let vx = (dx / len) * speed;
        const vy = (dy / len) * speed;
        vx = clamp(vx, -MAX_VX, MAX_VX);

        this.ball = {
            x: BALL_X,
            y: BALL_Y,
            vx,
            vy,
            rot: 0,
            prevY: BALL_Y,
            rimTouched: false,
            scored: false
        };
        this.ballReady = false;
        this.launched = true;
        Sfx.flick();
    }

    /* ── 物理 ── */

    physicsStep(dt) {
        const ball = this.ball;
        if (!ball) return;

        // 亚步进防隧穿（单步位移上限 6px）
        const speed = Math.hypot(ball.vx, ball.vy);
        const steps = Math.max(1, Math.min(12, Math.ceil((speed * dt) / 6)));
        const sub = dt / steps;

        for (let s = 0; s < steps; s++) {
            ball.prevY = ball.y;
            ball.vy += GRAVITY * sub;
            ball.x += ball.vx * sub;
            ball.y += ball.vy * sub;
            ball.rot += ball.vx * sub * 0.02;

            if (this.state !== 'playing') return;

            this.collideBackboard(ball);
            this.collideRimLip(ball);
            this.checkScore(ball);

            // 出界判定：掉出底部或侧边 = 失误（已得分的球不算失误，安静移除）
            if (ball.y - BALL_R > WORLD_H + 30 || ball.x < -60 || ball.x > WORLD_W + 60) {
                if (ball.scored) {
                    this.ball = null;
                } else {
                    this.onMiss();
                }
                return;
            }
        }
    }

    collideBackboard(ball) {
        const bx = this.bbX;
        const top = this.rimY - BB_H;
        const bottom = this.rimY - 4; // 板面碰撞到筐线上沿为止：筐口通道必须畅通
        const clank = (sx, sy) => {
            ball.rimTouched = true;
            Sfx.clank();
            this.shake = Math.max(this.shake, 3);
            this.spark(sx, sy, 5, P.spark);
        };

        // 按轴分解的挡板碰撞：板是墙，只响应各自轴向的入射。
        // 圆-矩形斜法线会把竖直速度投影成横向弹飞（板角截胡筐口通道），必须避免。
        if (ball.y > top - 4 && ball.y < bottom) {
            // 左面：水平向右入射才反弹；竖直掠过的球仅被推出重叠
            if (ball.x < bx && ball.x + BALL_R > bx) {
                ball.x = bx - BALL_R;
                if (ball.vx > 0) {
                    ball.vx = -ball.vx * RESTITUTION_BB;
                    clank(bx, ball.y);
                }
            } else if (ball.x > bx + BB_W && ball.x - BALL_R < bx + BB_W) {
                // 右面（镜像朝向时朝向投篮通道）
                ball.x = bx + BB_W + BALL_R;
                if (ball.vx < 0) {
                    ball.vx = -ball.vx * RESTITUTION_BB;
                    clank(bx + BB_W, ball.y);
                }
            }
        }
        // 顶面：只响应垂直下落
        if (ball.x > bx && ball.x < bx + BB_W && ball.vy > 0 &&
            ball.y + BALL_R > top && ball.y < top) {
            ball.y = top - BALL_R;
            ball.vy = -ball.vy * RESTITUTION_BB;
            clank(ball.x, top);
        }

        // 兜底：斜角切入导致球心陷入板内——沿最浅轴推出，仅该轴速度向内时反弹
        if (ball.x > bx && ball.x < bx + BB_W && ball.y > top && ball.y < bottom) {
            const dL = ball.x - bx, dR = bx + BB_W - ball.x;
            const dT = ball.y - top, dB = bottom - ball.y;
            const m = Math.min(dL, dR, dT, dB);
            if (m === dL) {
                ball.x = bx - BALL_R;
                if (ball.vx > 0) { ball.vx = -ball.vx * RESTITUTION_BB; clank(bx, ball.y); }
            } else if (m === dR) {
                ball.x = bx + BB_W + BALL_R;
                if (ball.vx < 0) { ball.vx = -ball.vx * RESTITUTION_BB; clank(bx + BB_W, ball.y); }
            } else if (m === dT) {
                ball.y = top - BALL_R;
                if (ball.vy > 0) { ball.vy = -ball.vy * RESTITUTION_BB; clank(ball.x, top); }
            } else {
                ball.y = bottom + BALL_R;
                if (ball.vy < 0) { ball.vy = -ball.vy * RESTITUTION_BB; clank(ball.x, bottom); }
            }
        }
    }

    collideRimLip(ball) {
        const lipX = this.hoopX;
        const dx = ball.x - lipX;
        const dy = ball.y - this.rimY;
        const minD = BALL_R + RIM_R;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) return;

        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        // 推出重叠
        ball.x = lipX + nx * minD;
        ball.y = this.rimY + ny * minD;
        // 沿法线反弹
        const velN = ball.vx * nx + ball.vy * ny;
        if (velN < 0) {
            ball.vx -= (1 + RESTITUTION_RIM) * velN * nx;
            ball.vy -= (1 + RESTITUTION_RIM) * velN * ny;
            ball.rimTouched = true;
            Sfx.clank();
            this.shake = Math.max(this.shake, 4);
            this.spark(lipX, this.rimY, 6, '#ff8c5a');
        }
    }

    checkScore(ball) {
        if (ball.scored || ball.vy <= 0) return;
        // 球心从篮筐线上方穿到下方，且水平位置在筐口内
        if (ball.prevY < this.rimY && ball.y >= this.rimY &&
            ball.x > this.rimLeft + 6 && ball.x < this.rimRight - 6) {
            ball.scored = true;
            this.onScore(ball);
        }
    }

    onScore(ball) {
        this.streak++;
        this.longestStreak = Math.max(this.longestStreak, this.streak);
        const wasFire = this.onFire;
        this.onFire = this.streak >= STREAK_FIRE;
        if (this.onFire && !wasFire) {
            Sfx.fire();
            this.popups.push({ x: WORLD_W / 2, y: this.rimY - 70, text: this.TEXT.onFire, big: true, life: 1 });
        }

        let points = this.onFire ? 2 : 1;
        const swish = !ball.rimTouched;
        let label = `+${points}`;
        if (swish) {
            points += 1;
            label = `${this.TEXT.swish} +${points}`;
            Sfx.swish();
            this.spark(ball.x, this.rimY, 16, '#ffe9a8');
        } else {
            Sfx.score();
        }
        this.score += points;

        this.netSquash = 1;
        this.spawnScoreParticles();
        this.popups.push({ x: ball.x, y: this.rimY - 26, text: label, big: swish, life: 1 });

        this.updateHud();
        // 换筐推迟到球穿网落地、新球就位时——避免球还挂在网里篮筐就瞬移
        this.settling = true;
        setTimeout(() => {
            // 暂停（含切后台）时照常重生，否则恢复后无球可投（软锁）
            if (this.state === 'gameover' || this.state === 'menu') return;
            this.settling = false;
            this.ball = null;
            this.ballReady = true;
            this.launched = false;
            this.randomizeHoop();
        }, REPOSITION_DELAY);
    }

    onMiss() {
        if (this.state !== 'playing') return;
        this.state = 'gameover';
        track('hoop-shot', 'finish');
        this.streak = 0;
        this.onFire = false;
        Sfx.gameOver();

        const isNewBest = this.score > this.best;
        if (isNewBest) {
            this.best = this.score;
            storageSet('hs_best', String(this.best));
        }

        // 最长连击跨局持久化
        if (this.longestStreak > this.bestStreakAll) {
            this.bestStreakAll = this.longestStreak;
            storageSet('hs_longest_streak', String(this.bestStreakAll));
        }
        this.updateSideRecords();

        const t = this.TEXT;
        if (this.el['over-score']) this.el['over-score'].textContent = formatNumber(this.score);
        if (this.el['over-best']) this.el['over-best'].textContent = `${t.best}: ${formatNumber(this.best)}`;
        if (this.el['over-newbest']) {
            this.el['over-newbest'].textContent = isNewBest ? `🌟 ${t.newBest}` : '';
            this.el['over-newbest'].classList.toggle('show', isNewBest);
            if (isNewBest) Sfx.newBest();
        }
        if (this.el['over-streak']) {
            this.el['over-streak'].textContent = `🔥 ${t.longestStreak}: ${this.longestStreak}`;
        }

        this.recordLocalScore();
        this.showOverlay('hs-over');
        this.renderLocalScores();
        this.submitScore();
        this.updateHud();
    }

    /* ── 特效 ── */

    spawnScoreParticles() {
        for (let i = 0; i < 18 && this.particles.length < 240; i++) {
            const angle = Math.PI + Math.random() * Math.PI;
            const v = (Math.random() * 0.6 + 0.4) * 260;
            this.particles.push({
                x: this.hoopX + RIM_LEN / 2,
                y: this.rimY,
                vx: Math.cos(angle) * v * 0.6,
                vy: Math.sin(angle) * v,
                life: 1,
                decay: 1.8 + Math.random() * 1.2,
                size: 2 + Math.random() * 3,
                color: ['#ffd34d', '#ff8c5a', '#ffe9a8'][Math.floor(Math.random() * 3)]
            });
        }
    }

    spark(x, y, count, color) {
        for (let i = 0; i < count && this.particles.length < 240; i++) {
            const angle = Math.random() * Math.PI * 2;
            const v = (Math.random() * 0.6 + 0.4) * 220;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * v,
                vy: Math.sin(angle) * v,
                life: 1,
                decay: 2.4 + Math.random() * 1.4,
                size: 1.5 + Math.random() * 2.5,
                color
            });
        }
    }

    updateEffects(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay * dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 700 * dt;
        }
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.life -= 1.15 * dt;
            p.y -= 42 * dt;
            if (p.life <= 0) this.popups.splice(i, 1);
        }
        if (this.netSquash > 0) {
            this.netSquash = Math.max(0, this.netSquash - 3.2 * dt);
        }
        // 火球拖尾
        if (this.onFire && this.ball && this.launched && this.particles.length < 200 && Math.random() < 0.8) {
            this.particles.push({
                x: this.ball.x + (Math.random() - 0.5) * 10,
                y: this.ball.y + (Math.random() - 0.5) * 10,
                vx: -this.ball.vx * 0.06,
                vy: -this.ball.vy * 0.06,
                life: 0.7,
                decay: 2.6,
                size: 4 + Math.random() * 5,
                color: Math.random() < 0.5 ? '#ff6b35' : '#ffd34d'
            });
        }
    }

    /* ── HUD / 存档 ── */

    updateHud() {
        if (this.el.score) this.el.score.textContent = formatNumber(this.score);
        if (this.el.best) this.el.best.textContent = `${this.TEXT.best} ${formatNumber(Math.max(this.best, this.score))}`;
        if (this.el.streak) {
            const flames = '🔥'.repeat(Math.min(this.streak, 5));
            this.el.streak.textContent = this.streak > 0 ? (this.onFire ? `${flames} ${this.TEXT.onFireHud}` : flames || '') : '';
        }
        const fireBadge = this.el['fire-badge'];
        if (fireBadge) fireBadge.classList.toggle('visible', this.onFire);
    }

    updateMuteButtons() {
        const icon = Sfx.muted ? ICONS.soundOff : ICONS.soundOn;
        if (this.el['mute-btn']) this.el['mute-btn'].innerHTML = icon;
        if (this.el['start-mute']) this.el['start-mute'].innerHTML = icon;
    }

    toggleMute() {
        Sfx.toggleMuted();
        this.updateMuteButtons();
        if (!Sfx.muted) Sfx.click();
    }

    getUsername() {
        // 统一玩家身份：全站共享昵称（player.js 自动迁移旧的 hs_username）
        return ensurePlayerName();
    }

    localScores() {
        const all = storageParse('hs_local_scores', []);
        return Array.isArray(all) ? all : [];
    }

    recordLocalScore() {
        if (this.score <= 0) return;
        const local = this.localScores();
        local.push({ name: this.getUsername(), score: this.score });
        local.sort((a, b) => b.score - a.score);
        storageSet('hs_local_scores', JSON.stringify(local.slice(0, 30)));
    }

    renderLocalScores() {
        const list = this.el['lb-list'];
        if (!list) return;
        list.textContent = '';
        const filtered = this.localScores().slice(0, 10);
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'hs-lb-empty';
            empty.textContent = this.TEXT.noScores;
            list.appendChild(empty);
            return;
        }
        filtered.forEach((s, i) => list.appendChild(this.buildLbRow(i, s)));
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'hs-lb-row' + (rank < 3 ? ` hs-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'hs-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'hs-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'hs-lb-score';
        scoreEl.textContent = formatNumber(entry.score);
        row.append(rankEl, nameEl, scoreEl);
        return row;
    }

    async submitScore() {
        if (this.score <= 0) return;
        // 网络层收敛到 js/leaderboard.js（超时/cors/ok 判定统一；false=未进全球榜）
        const ok = await submitScore({ game: LB_GAME, name: this.getUsername(), score: this.score });
        if (ok) {
            await this.fetchLeaderboard();
        } else {
            // Worker 未部署：保留本地榜，并在结算面板提示未进全球榜
            const statusEl = this.el['lb-status'];
            if (statusEl) statusEl.textContent = this.TEXT.submitFail;
        }
    }

    async fetchLeaderboard() {
        const list = this.el['lb-list'];
        const statusEl = this.el['lb-status'];
        if (!list) return;
        try {
            const data = await fetchBoard(LB_GAME);
            if (this.state !== 'gameover') return;
            list.textContent = '';
            if (!Array.isArray(data) || data.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'hs-lb-empty';
                empty.textContent = this.TEXT.noScores;
                list.appendChild(empty);
            } else {
                data.slice(0, 10).forEach((entry, i) => list.appendChild(this.buildLbRow(i, entry)));
            }
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            if (statusEl) statusEl.textContent = this.TEXT.lbOffline;
        }
    }

    /* ── 分享 ── */

    buildShareText() {
        const t = this.TEXT;
        return `🏀 ${t.title}\n${t.score || 'Score'}: ${formatNumber(this.score)}  🏆 ${t.best}: ${formatNumber(this.best)}\n🔥 ${t.longestStreak}: ${this.longestStreak}\nhttps://games.orangely.xyz/hoop-shot.html`;
    }

    async copyResult() {
        const text = this.buildShareText();
        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch (e) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0;left:-999px;top:-999px;';
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand('copy');
                ta.remove();
            } catch (e2) {
                ok = false;
            }
        }
        if (this.el['btn-copy']) {
            const original = `📋 ${this.TEXT.copyResult}`;
            this.el['btn-copy'].textContent = ok ? `✅ ${this.TEXT.copied}` : original;
            setTimeout(() => {
                if (this.el['btn-copy']) this.el['btn-copy'].textContent = original;
            }, 1600);
        }
    }

    async shareResult() {
        const text = this.buildShareText();
        try {
            if (navigator.share) {
                await navigator.share({ text });
                return;
            }
        } catch (e) {
            return; // 用户取消
        }
        await this.copyResult();
    }

    /* ── UI 绑定 ── */

    bindUI() {
        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', (e) => {
                e.preventDefault();
                Sfx.click();
                fn();
            });
        };

        on('hs-btn-play', () => this.startGame());
        on('hs-btn-resume', () => this.togglePause());
        on('hs-btn-menu', () => this.goHome());
        on('hs-btn-again', () => this.startGame());
        on('hs-btn-home', () => this.goHome());
        on('hs-pause-btn', () => this.togglePause());
        on('hs-mute-btn', () => this.toggleMute());
        on('hs-start-mute', () => this.toggleMute());
        on('hs-btn-copy', () => this.copyResult());
        on('hs-btn-share', () => this.shareResult());
        on('hs-btn-home-top', () => {
            window.location.href = 'index.html';
        });

        const username = document.getElementById('hs-username');
        if (username) {
            username.value = this.getUsername();
            username.addEventListener('change', () => {
                // 写入全局玩家身份，全站排行榜同步
                username.value = setPlayerName(username.value);
            });
            username.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') username.blur();
            });
        }

        window.addEventListener('site-settings:changed', () => {
            this.applyLanguage();
        });
    }

    /* ── 渲染 ── */

    resize() {
        const dpr = window.devicePixelRatio || 1;
        // 可用高度 = 视口高度 - shell 直接子节点里除 .game-main 之外的部分
        // （顶栏 + 页脚 + 抽屉）。旧实现取 canvas.parentElement.parentElement
        // 得到的是 .game-main，其非舞台子节点只有侧栏 —— usedH 实际等于侧栏
        // 高度，与"视口高度 - 顶栏页脚"的注释完全不是一回事（2026-09-19 修正）。
        const shell = this.canvas.closest('.game-shell');
        const main = this.canvas.closest('.game-main');
        const usedH = shell
            ? Array.from(shell.children)
                .filter(el => el !== main)
                .reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)
            : 120;
        const availH = Math.max(320, window.innerHeight - usedH - 20);
        // 量舞台不量画布：本方法会把 cssWidth 写进内联 style.width，内联胜过
        // width:100%，再用 clientWidth 当输入就自锁了 —— 舞台放宽画布也不会长
        const stage = this.canvas.parentElement;
        let cssWidth = (stage && stage.clientWidth) || WORLD_W;
        let cssHeight = cssWidth * (WORLD_H / WORLD_W);
        if (cssHeight > availH) {
            cssHeight = availH;
            cssWidth = cssHeight * (WORLD_W / WORLD_H);
        }
        this.canvas.width = Math.round(cssWidth * dpr);
        this.canvas.height = Math.round(cssHeight * dpr);
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;
        this.scale = (cssWidth / WORLD_W) * dpr;
        this.buildStarfield();
    }

    buildStarfield() {
        const c = document.createElement('canvas');
        c.width = Math.max(1, this.canvas.width);
        c.height = Math.max(1, this.canvas.height);
        const ctx = c.getContext('2d');
        const bg = ctx.createLinearGradient(0, 0, 0, c.height);
        bg.addColorStop(0, P.bgTop);
        bg.addColorStop(0.65, P.bgMid);
        bg.addColorStop(1, P.bgBottom);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, c.width, c.height);
        // 浅色场馆没有星空：--hs-cv-star 为 none 时跳过
        const starCount = P.star === 'none' ? 0 : Math.round((c.width * c.height) / 5600);
        for (let i = 0; i < starCount; i++) {
            ctx.globalAlpha = 0.12 + Math.random() * 0.55;
            ctx.fillStyle = P.star;
            ctx.beginPath();
            ctx.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 1.4 + 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 地板（加宽的球场木纹色调暗色带）
        const floorTop = c.height - FLOOR_H * this.scale;
        const floor = ctx.createLinearGradient(0, floorTop, 0, c.height);
        floor.addColorStop(0, P.floorTop);
        floor.addColorStop(1, P.floorBottom);
        ctx.fillStyle = floor;
        ctx.fillRect(0, floorTop, c.width, FLOOR_H * this.scale);
        this.starfield = c;
    }

    drawCourt(ctx) {
        // 地板球场线：罚球圈（半弧）+ 三分弧（大弧线），随篮筐位置取景
        const floorTop = WORLD_H - FLOOR_H;
        const hx = this.hoopX;
        const hy = this.rimY;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, floorTop, WORLD_W, FLOOR_H);
        ctx.clip();

        // 三分弧：以篮筐为中心、向下凸向玩家的大弧线
        ctx.strokeStyle = P.courtLine;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, (WORLD_H - hy) + 6, 0, Math.PI * 2);
        ctx.stroke();

        // 罚球圈：主题橙点缀的半圆弧
        ctx.strokeStyle = P.courtKey;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, floorTop + 36, 78, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

        let shakeX = 0;
        let shakeY = 0;
        if (this.shake > 0.1) {
            shakeX = (Math.random() - 0.5) * this.shake;
            shakeY = (Math.random() - 0.5) * this.shake;
            this.shake *= 0.86;
        } else {
            this.shake = 0;
        }
        ctx.save();
        ctx.translate(shakeX, shakeY);

        // 背景
        if (this.starfield) {
            ctx.drawImage(this.starfield, -shakeX * this.scale, -shakeY * this.scale, WORLD_W, WORLD_H);
        } else {
            ctx.fillStyle = P.bgTop;
            ctx.fillRect(0, 0, WORLD_W, WORLD_H);
        }

        this.drawCourt(ctx);

        this.drawHoopBack(ctx);
        this.drawAim(ctx);
        this.drawBall(ctx);
        this.drawHoopFront(ctx);

        // 粒子
        for (const p of this.particles) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 飘字
        for (const p of this.popups) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.textAlign = 'center';
            ctx.font = p.big
                ? '800 26px "Segoe UI", system-ui, sans-serif'
                : '800 19px "Segoe UI", system-ui, sans-serif';
            ctx.fillStyle = p.big ? P.popupBig : P.popup;
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    /** 篮筐后景：篮板 + 环的后半弧 + 网的后半（球从它们前面穿过） */
    drawHoopBack(ctx) {
        const bbX = this.bbX;
        const rimY = this.rimY;

        // 篮板
        ctx.save();
        const bbGrad = ctx.createLinearGradient(bbX, rimY - BB_H, bbX + BB_W, rimY);
        bbGrad.addColorStop(0, P.boardTop);
        bbGrad.addColorStop(1, P.boardBottom);
        ctx.fillStyle = bbGrad;
        ctx.fillRect(bbX, rimY - BB_H, BB_W, BB_H + 12);
        ctx.strokeStyle = P.boardEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bbX, rimY - BB_H, BB_W, BB_H + 12);
        // 篮板小方框标记
        ctx.strokeStyle = 'rgba(226,90,60,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(bbX + 1.5, rimY - 34, BB_W - 3, 26);
        ctx.restore();

        this.drawRimArc(ctx, false);
        this.drawNet(ctx, false);
    }

    /** 篮筐前景：网的前半 + 环的前半弧 + 前沿圆头 + 支架（画在球之上） */
    drawHoopFront(ctx) {
        const rimY = this.rimY;
        const bbX = this.bbX;
        this.drawNet(ctx, true);
        this.drawRimArc(ctx, true);

        // 连接篮板的支架（板所在的一侧）
        const rimColor = this.onFire ? '#ff8c3a' : '#ff5a3c';
        ctx.save();
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (this.hoopFlip) {
            ctx.moveTo(bbX + BB_W, rimY - 14);
            ctx.lineTo(bbX + BB_W + 2, rimY);
        } else {
            ctx.moveTo(bbX, rimY - 14);
            ctx.lineTo(bbX - 2, rimY);
        }
        ctx.stroke();
        ctx.restore();
    }

    /** 开放的椭圆环（透视压扁）。front=true 画下半圈（靠观察者），否则上半圈 */
    drawRimArc(ctx, front) {
        const cx = (this.rimLeft + this.rimRight) / 2;
        const rx = RIM_LEN / 2;
        const rimColor = this.onFire ? '#ff8c3a' : '#ff5a3c';
        ctx.save();
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (front) {
            ctx.strokeStyle = rimColor;
            ctx.lineWidth = 4;
            ctx.ellipse(cx, this.rimY, rx, RIM_RY, 0, 0, Math.PI);
        } else {
            ctx.strokeStyle = '#b8462e';
            ctx.lineWidth = 3;
            ctx.ellipse(cx, this.rimY, rx, RIM_RY, 0, Math.PI, Math.PI * 2);
        }
        ctx.stroke();
        if (front) {
            // 前沿圆头 = 碰撞体位置，醒目提示这是唯一会弹球的筐沿
            ctx.beginPath();
            ctx.arc(this.hoopX, this.rimY, RIM_R, 0, Math.PI * 2);
            ctx.fillStyle = rimColor;
            ctx.fill();
            if (this.onFire) {
                ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.time * 8);
                ctx.strokeStyle = '#ffb03a';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(cx, this.rimY, rx + 3, RIM_RY + 3, 0, 0, Math.PI);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
        ctx.restore();
    }

    drawNet(ctx, frontHalf) {
        const rimY = this.rimY;
        const rimL = this.rimLeft;
        const rimR = this.rimRight;
        const squash = 1 + this.netSquash * 0.55;
        const netH = 42 * squash;
        const topW = RIM_LEN;
        const botW = topW * 0.55;
        const cx = (rimL + rimR) / 2;
        // 前半网挂在环的前弧下方，后半网略高——椭圆环的纵深感
        const topY = rimY + (frontHalf ? RIM_RY - 3 : -3);
        const bottomY = rimY + netH;
        const segs = 5;

        ctx.save();
        ctx.strokeStyle = `rgba(${P.netRgb}, ${frontHalf ? 0.75 : 0.38})`;
        ctx.lineWidth = 1.2;
        // 纵向线
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const x1 = rimL + topW * t;
            const x2 = cx - botW / 2 + botW * t;
            ctx.beginPath();
            ctx.moveTo(x1, topY);
            ctx.lineTo(x2, bottomY);
            ctx.stroke();
        }
        if (frontHalf) {
            // 横向菱形网格
            for (let j = 1; j <= 3; j++) {
                const t = j / 4;
                const w = topW + (botW - topW) * t;
                ctx.beginPath();
                ctx.moveTo(cx - w / 2, topY + netH * t);
                ctx.lineTo(cx + w / 2, topY + netH * t);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    drawBall(ctx) {
        // 待发射球 + 飞行中的球
        const bx = this.ball ? this.ball.x : BALL_X;
        const by = this.ball ? this.ball.y : BALL_Y + Math.sin(this.time * 2.4) * 3;
        const rot = this.ball ? this.ball.rot : 0;
        const hidden = this.ball && (this.ball.y - BALL_R > WORLD_H + 20);
        if (hidden) return;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(rot);

        // 火球外焰
        if (this.onFire) {
            const glow = ctx.createRadialGradient(0, 0, BALL_R * 0.4, 0, 0, BALL_R * 1.9);
            glow.addColorStop(0, 'rgba(255,150,60,0.55)');
            glow.addColorStop(1, 'rgba(255,150,60,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(0, 0, BALL_R * 1.9, 0, Math.PI * 2);
            ctx.fill();
        }

        // 球体
        const grad = ctx.createRadialGradient(-BALL_R * 0.35, -BALL_R * 0.4, BALL_R * 0.15, 0, 0, BALL_R);
        grad.addColorStop(0, '#ffcf8a');
        grad.addColorStop(0.55, '#f08c3a');
        grad.addColorStop(1, '#b85a1e');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
        ctx.fill();

        // 球缝线
        ctx.strokeStyle = 'rgba(90,40,10,0.75)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-BALL_R, 0);
        ctx.lineTo(BALL_R, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -BALL_R);
        ctx.lineTo(0, BALL_R);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-BALL_R * 0.9, 0, BALL_R * 0.85, -0.9, 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(BALL_R * 0.9, 0, BALL_R * 0.85, Math.PI - 0.9, Math.PI + 0.9);
        ctx.stroke();

        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(-BALL_R * 0.3, -BALL_R * 0.42, BALL_R * 0.24, BALL_R * 0.13, -0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawAim(ctx) {
        // 拖动中显示甩投方向箭头
        if (!this.dragStart || !this.dragCurrent || !this.ballReady || this.state !== 'playing') return;
        const dx = this.dragCurrent.x - this.dragStart.x;
        const dy = this.dragCurrent.y - this.dragStart.y;
        if (dy > -MIN_FLICK_UP) return;
        const len = Math.hypot(dx, dy);
        if (len < 8) return;
        const power = Math.min(MAX_SPEED, len * FLICK_SCALE) / MAX_SPEED;
        const angle = Math.atan2(dy, dx);
        const arrowLen = 34 + power * 58;

        ctx.save();
        ctx.translate(BALL_X, BALL_Y);
        ctx.rotate(angle);
        ctx.strokeStyle = `rgba(${P.aimRgb}, ${0.45 + power * 0.4})`;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(BALL_R + 4, 0);
        ctx.lineTo(BALL_R + 4 + arrowLen, 0);
        ctx.stroke();
        // 箭头
        ctx.fillStyle = `rgba(${P.aimRgb}, ${0.55 + power * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(BALL_R + 10 + arrowLen, 0);
        ctx.lineTo(BALL_R + arrowLen, -8);
        ctx.lineTo(BALL_R + arrowLen, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 力度提示文字
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = P.aimText;
        ctx.fillText(`${Math.round(power * 100)}%`, BALL_X, BALL_Y - BALL_R - 16);
        ctx.restore();

        // 弹道预览：与 flick() 同一速度映射 + 同一重力的前半段弧线（不含碰撞）
        const flen = Math.hypot(dx, dy);
        const fspeed = Math.min(MAX_SPEED, flen * FLICK_SCALE);
        const pvx = clamp((dx / flen) * fspeed, -MAX_VX, MAX_VX);
        let pvy = (dy / flen) * fspeed;
        let px = BALL_X, py = BALL_Y;
        ctx.save();
        ctx.fillStyle = `rgb(${P.aimRgb})`;
        for (let i = 0; i < PREVIEW_STEPS; i++) {
            pvy += GRAVITY * PREVIEW_DT;
            px += pvx * PREVIEW_DT;
            py += pvy * PREVIEW_DT;
            if (i % 2 !== 0) continue;
            ctx.globalAlpha = 0.55 * (1 - i / PREVIEW_STEPS) + 0.1;
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /* ── 主循环 ── */

    ensureLoop() {
        if (this.animationId) return;
        this.lastFrameTime = performance.now();
        this.animationId = requestAnimationFrame(this.loopBound);
    }

    stopLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    startLoop() {
        this.loopBound = (now) => {
            const dtMs = Math.min(now - this.lastFrameTime, 40);
            this.lastFrameTime = now;
            const dt = dtMs / 1000;

            if (this.state === 'playing') {
                this.animationId = requestAnimationFrame(this.loopBound);
                this.time += dt;
                this.updateHoopMotion(dt);
                this.physicsStep(dt);
                this.updateEffects(dt);
            } else {
                this.time += dt;
                this.updateEffects(dt);
                const effectsActive = this.particles.length > 0 || this.popups.length > 0;
                if (effectsActive) {
                    this.animationId = requestAnimationFrame(this.loopBound);
                } else {
                    this.animationId = null;
                    this.render();
                    return;
                }
            }

            this.render();
        };
        this.lastFrameTime = performance.now();
        this.animationId = requestAnimationFrame(this.loopBound);
    }
}

onReady(() => {
    // 背景（场馆 + 星空 + 地板）画在离屏缓存里，主题切换必须重建；
    // 空闲时（开始菜单 / 暂停 / 结算）rAF 已停，不会有下一帧，所以重建后要主动重画一次
    P = bindPalette(CANVAS_VARS, {
        onChange: () => {
            const game = window.hoopShotGame;
            if (!game) return;
            game.buildStarfield();
            game.render();
        },
    });
    window.hoopShotGame = new HoopShotGame();

    // 桌面端舞台纵向预算：实测 --frame-chrome 写入 shell（首帧兜底 150px），
    // 变化后经 game-frame:changed 驱动上面的 resize()
    //
    // ⚠️ extraChrome 必须报上连胜条：它是 .game-shell 的直接子元素（22px 高），
    // 但既不是 .game-topbar 也不是 .game-footer，bindFrame 默认量不到。
    // 漏报时 --frame-chrome 少算 22px ⇒ 侧栏 max-height 比真实行高多出 22px
    // ⇒ 1280×800 下整页溢出可滚（新增第 22 款游戏后侧栏正好顶到上限才暴露）。
    bindFrame({
        logicalWidth: WORLD_W,
        extraChrome: () => {
            const bar = document.querySelector('.hs-streak-bar');
            return bar ? bar.getBoundingClientRect().height : 0;
        },
    });

    // 桌面侧栏「更多游戏」卡（P3）：语言切换由 more-games.js 的全局
    // updateMoreGames 监听自动同步（id 不以 MoreNav 结尾）
    const hsSideMore = document.getElementById('hsSideMore');
    if (hsSideMore) renderMoreGames(hsSideMore, { exclude: 'hoop-shot.html' });

    // 移动端底部统计抽屉
    window.hsDrawer = createStatsDrawer({
        idPrefix: 'hs',
        getGame: () => window.hoopShotGame,
        onPause: (g) => g && g.pauseQuiet(),
        onResume: (g) => g && g.resumeQuiet(),
        isBusy: () => {
            const g = window.hoopShotGame;
            return !!g && typeof g.isRunning === 'function' && g.isRunning();
        },
        ICONS,
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
    });
    if (window.hsDrawer) window.hsDrawer.init();
});

/* ── 顶栏 / 页脚通用控件：Home · Sound · More ──
   槽位结构见 css/layout.css 的契约，行为统一由 js/game-chrome.js 接管。
   owns 默认只含 more：静音钮在本页早就有自己的 handler（还要顺带做
   SFX 初始化之类的页面私事），chrome 再挂一个就会一次点击切换两次 = 净效果为零。 */
onReady(() => {
    bindChrome({
        self: 'hoop-shot.html',
        owns: ['more'],
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
        labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
    });
});
