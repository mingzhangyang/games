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

/* ────────────────────────── utilities ────────────────────────── */

function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // 存储不可用时静默降级
    }
}

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

const LANGUAGES = {
    en: {
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
        share: 'Share',
        copyResult: 'Copy Result',
        copied: 'Copied!',
        leaderboard: 'Global Top 10',
        loadingScores: 'Loading…',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline — showing local scores',
        usernameLabel: 'Username (Enter to save)',
        language: '中文',
        tapToStart: 'Swipe up to shoot'
    },
    zh: {
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
        share: '分享成绩',
        copyResult: '复制成绩',
        copied: '已复制！',
        leaderboard: '全球前 10',
        loadingScores: '加载中…',
        noScores: '暂无分数',
        lbOffline: '榜单离线——显示本地成绩',
        usernameLabel: '用户名（回车保存）',
        language: 'English',
        tapToStart: '向上滑动投篮'
    }
};

/* ────────────────────────── audio ────────────────────────── */

const Sfx = {
    ctx: null,
    muted: storageGet('hs_muted') === '1',

    ensure() {
        if (this.muted) return null;
        try {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                this.ctx = new AC();
            }
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return this.ctx;
        } catch (e) {
            return null;
        }
    },

    tone({ freq = 440, endFreq = null, type = 'sine', duration = 0.1, volume = 0.15, delay = 0 }) {
        const ctx = this.ensure();
        if (!ctx) return;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    },

    noise(duration = 0.25, volume = 0.15, delay = 0) {
        const ctx = this.ensure();
        if (!ctx) return;
        const now = ctx.currentTime + delay;
        const buffer = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.6);
        }
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.buffer = buffer;
        src.connect(gain).connect(ctx.destination);
        src.start(now);
    },

    flick() { this.noise(0.14, 0.12); },
    swish() {
        this.noise(0.2, 0.16);
        this.tone({ freq: 660, type: 'triangle', duration: 0.14, volume: 0.14, delay: 0.03 });
    },
    score() {
        this.tone({ freq: 520, type: 'triangle', duration: 0.1, volume: 0.16 });
        this.tone({ freq: 780, type: 'triangle', duration: 0.12, volume: 0.14, delay: 0.08 });
    },
    clank() {
        this.tone({ freq: 1150, endFreq: 700, type: 'square', duration: 0.12, volume: 0.1 });
    },
    fire() {
        this.noise(0.4, 0.2);
        this.tone({ freq: 300, endFreq: 900, type: 'sawtooth', duration: 0.35, volume: 0.14 });
    },
    gameOver() {
        this.tone({ freq: 420, endFreq: 90, type: 'sawtooth', duration: 0.6, volume: 0.18 });
        this.tone({ freq: 300, endFreq: 70, type: 'sine', duration: 0.7, volume: 0.13, delay: 0.1 });
    },
    newBest() {
        [523, 659, 784, 1046].forEach((f, i) => {
            this.tone({ freq: f, type: 'triangle', duration: 0.16, volume: 0.15, delay: i * 0.09 });
        });
    },
    click() { this.tone({ freq: 640, type: 'square', duration: 0.05, volume: 0.07 }); },
    toggleMuted() {
        this.muted = !this.muted;
        storageSet('hs_muted', this.muted ? '1' : '0');
        return this.muted;
    }
};

/* ────────────────────────── config ────────────────────────── */

const WORLD_W = 420;
const WORLD_H = 640;

const BALL_R = 19;
const BALL_X = WORLD_W / 2;
const BALL_Y = WORLD_H - 62;
const GRAVITY = 1750;
const FLICK_SCALE = 3.3;        // 甩动像素 → 速度倍率
const MAX_SPEED = 2050;
const MAX_VX = 950;
const MIN_FLICK_UP = 34;        // 最小向上甩动距离
const RIM_R = 5;                // 篮筐前沿碰撞半径
const RIM_LEN = 64;             // 篮筐宽度
const BB_W = 9;                 // 篮板厚度
const BB_H = 84;                // 篮板高度
const RESTITUTION_RIM = 0.55;
const REPOSITION_DELAY = 380;   // 进球后换篮筐延迟

const STREAK_FIRE = 3;          // 连中 3 球触发火球
const LEADERBOARD_URL = 'https://hoop-shot-scores.orangely.workers.dev';

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
        this.longestStreak = 0;
        this.onFire = false;

        this.ball = null;      // { x, y, vx, vy, rot, prevY }
        this.ballReady = true;
        this.launched = false;

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
        this.updateHud();
        this.showStartScreen();
        this.startLoop();
    }

    gatherElements() {
        const ids = [
            'hs-score', 'hs-best', 'hs-streak',
            'hs-start', 'hs-title', 'hs-subtitle', 'hs-howto', 'hs-btn-play',
            'hs-best-line', 'hs-start-mute', 'hs-start-lang',
            'hs-pause', 'hs-btn-resume', 'hs-btn-menu', 'hs-pause-title',
            'hs-over', 'hs-over-title', 'hs-over-score', 'hs-over-best', 'hs-over-newbest',
            'hs-over-streak', 'hs-btn-share', 'hs-btn-copy', 'hs-btn-again', 'hs-btn-home',
            'hs-lb-title', 'hs-lb-list', 'hs-lb-status',
            'hs-username', 'hs-username-label',
            'hs-pause-btn', 'hs-mute-btn', 'hs-fire-badge', 'hs-hint'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^hs-/, '')] = el;
        });
    }

    /* ── language ── */

    applyLanguage() {
        const saved = storageGet('hs_lang');
        this.lang = saved === 'zh' || saved === 'en' ? saved
            : (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
        this.TEXT = LANGUAGES[this.lang];
        document.documentElement.lang = this.lang;
        const t = this.TEXT;

        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['btn-play']) this.el['btn-play'].textContent = `🏀 ${t.play}`;
        if (this.el['pause-title']) this.el['pause-title'].textContent = t.paused;
        if (this.el['btn-resume']) this.el['btn-resume'].textContent = t.resume;
        if (this.el['btn-menu']) this.el['btn-menu'].textContent = t.home;
        if (this.el['over-title']) this.el['over-title'].textContent = t.gameOver;
        if (this.el['btn-share']) this.el['btn-share'].textContent = `📤 ${t.share}`;
        if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;
        if (this.el['btn-again']) this.el['btn-again'].textContent = `🔄 ${t.again}`;
        if (this.el['btn-home']) this.el['btn-home'].textContent = `🏠 ${t.home}`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['lb-status']) this.el['lb-status'].textContent = '';
        if (this.el['username-label']) this.el['username-label'].textContent = t.usernameLabel;
        if (this.el.username) this.el.username.placeholder = t.usernameLabel;
        if (this.el.hint) this.el.hint.textContent = t.tapToStart;
        if (this.el['start-lang']) this.el['start-lang'].textContent = t.language;
        this.updateMuteButtons();
        this.updateStartStats();
    }

    updateStartStats() {
        if (this.el['best-line']) {
            this.el['best-line'].textContent = `🏆 ${this.TEXT.best}: ${formatNumber(this.best)}`;
        }
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
        this.longestStreak = 0;
        this.onFire = false;
        this.ball = null;
        this.ballReady = true;
        this.launched = false;
        this.particles = [];
        this.popups = [];
        this.shake = 0;
        this.randomizeHoop(true);
        this.hideOverlays();
        this.updateHud();
        this.ensureLoop();
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

    goHome() {
        this.state = 'menu';
        this.ball = null;
        this.ballReady = true;
        this.ensureLoop();
        this.render();
        this.showStartScreen();
    }

    /* ── 篮筐 ── */

    randomizeHoop(initial = false) {
        const maxLipX = WORLD_W - 16 - RIM_LEN - BB_W;
        this.hoopBaseX = 40 + Math.random() * Math.max(40, maxLipX - 40);
        this.hoopX = this.hoopBaseX;
        if (!initial) {
            this.rimY = 150 + Math.random() * 110;
        }
    }

    // 高分后篮筐开始左右飘移，速度随分数增加
    updateHoopMotion(dt) {
        if (this.state !== 'playing' || this.score < 8) return;
        const t = this.time;
        const speed = 1.1 + Math.min(1.6, (this.score - 8) * 0.08);
        const amp = Math.min(70, 34 + (this.score - 8) * 2.2);
        const maxLipX = WORLD_W - 16 - RIM_LEN - BB_W;
        this.hoopX = clamp(this.hoopBaseX + Math.sin(t * speed + (this.hoopPhase || 0)) * amp, 24, maxLipX);
    }

    get bbX() {
        return this.hoopX + RIM_LEN;
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
        let vy = (dy / len) * speed;
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
        const bottom = this.rimY + 12;
        // 从左侧撞上篮板
        if (ball.x + BALL_R > bx && ball.x - BALL_R < bx + BB_W &&
            ball.y > top - BALL_R && ball.y < bottom + BALL_R) {
            if (ball.vx > 0) {
                ball.x = bx - BALL_R;
                ball.vx = -ball.vx * 0.6;
                this.spark(ball.x + BALL_R, ball.y, 5, '#dfe7ff');
                Sfx.clank();
                this.shake = Math.max(this.shake, 3);
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
            ball.x > this.hoopX + 6 && ball.x < this.bbX - 6) {
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
        this.randomizeHoop();
        // 短暂延时后发球
        setTimeout(() => {
            if (this.state === 'playing') {
                this.ball = null;
                this.ballReady = true;
                this.launched = false;
            }
        }, REPOSITION_DELAY);
    }

    onMiss() {
        if (this.state !== 'playing') return;
        this.state = 'gameover';
        this.streak = 0;
        this.onFire = false;
        Sfx.gameOver();

        const isNewBest = this.score > this.best;
        if (isNewBest) {
            this.best = this.score;
            storageSet('hs_best', String(this.best));
        }

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
            this.el.streak.textContent = this.streak > 0 ? (this.onFire ? `${flames} ON FIRE ×2` : flames || '') : '';
        }
        const fireBadge = this.el['fire-badge'];
        if (fireBadge) fireBadge.classList.toggle('visible', this.onFire);
    }

    updateMuteButtons() {
        const icon = Sfx.muted ? '🔇' : '🔊';
        if (this.el['mute-btn']) this.el['mute-btn'].textContent = icon;
        if (this.el['start-mute']) this.el['start-mute'].textContent = Sfx.muted ? '🔇' : '🔊';
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
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            await fetch(`${LEADERBOARD_URL}/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: this.getUsername(), score: this.score }),
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            await this.fetchLeaderboard();
        } catch (e) {
            // Worker 未部署：保留本地榜
        }
    }

    async fetchLeaderboard() {
        const list = this.el['lb-list'];
        const statusEl = this.el['lb-status'];
        if (!list) return;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`${LEADERBOARD_URL}/scores`, {
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
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
        on('hs-start-lang', () => {
            storageSet('hs_lang', this.lang === 'zh' ? 'en' : 'zh');
            this.applyLanguage();
        });
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
    }

    /* ── 渲染 ── */

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = this.canvas.clientWidth || 420;
        const cssHeight = cssWidth * (WORLD_H / WORLD_W);
        this.canvas.width = Math.round(cssWidth * dpr);
        this.canvas.height = Math.round(cssHeight * dpr);
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
        bg.addColorStop(0, '#0a0e24');
        bg.addColorStop(0.65, '#101538');
        bg.addColorStop(1, '#161040');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, c.width, c.height);
        const starCount = Math.round((c.width * c.height) / 5600);
        for (let i = 0; i < starCount; i++) {
            ctx.globalAlpha = 0.12 + Math.random() * 0.55;
            ctx.fillStyle = '#dfe7ff';
            ctx.beginPath();
            ctx.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 1.4 + 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 地板（球场木纹色调的暗色带）
        const floor = ctx.createLinearGradient(0, c.height - 46 * this.scale, 0, c.height);
        floor.addColorStop(0, 'rgba(216,150,84,0.16)');
        floor.addColorStop(1, 'rgba(216,150,84,0.32)');
        ctx.fillStyle = floor;
        ctx.fillRect(0, c.height - 46 * this.scale, c.width, 46 * this.scale);
        this.starfield = c;
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
            ctx.fillStyle = '#0a0e24';
            ctx.fillRect(0, 0, WORLD_W, WORLD_H);
        }

        this.drawHoop(ctx);
        this.drawAim(ctx);
        this.drawBall(ctx);

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
            ctx.fillStyle = p.big ? '#ffd34d' : '#e8ecff';
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    drawHoop(ctx) {
        const lipX = this.hoopX;
        const bbX = this.bbX;
        const rimY = this.rimY;

        // 篮板
        ctx.save();
        const bbGrad = ctx.createLinearGradient(bbX, rimY - BB_H, bbX + BB_W, rimY);
        bbGrad.addColorStop(0, 'rgba(226,232,255,0.85)');
        bbGrad.addColorStop(1, 'rgba(170,185,235,0.7)');
        ctx.fillStyle = bbGrad;
        ctx.fillRect(bbX, rimY - BB_H, BB_W, BB_H + 12);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bbX, rimY - BB_H, BB_W, BB_H + 12);
        // 篮板小方框标记
        ctx.strokeStyle = 'rgba(226,90,60,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(bbX + 1.5, rimY - 34, BB_W - 3, 26);
        ctx.restore();

        // 网（在球后面画一半）
        this.drawNet(ctx, false);

        // 篮筐（横杆）
        ctx.save();
        const rimColor = this.onFire ? '#ff8c3a' : '#ff5a3c';
        const rimGrad = ctx.createLinearGradient(lipX, rimY - 3, lipX, rimY + 3);
        rimGrad.addColorStop(0, '#ffb08a');
        rimGrad.addColorStop(0.5, rimColor);
        rimGrad.addColorStop(1, '#b83a20');
        ctx.fillStyle = rimGrad;
        ctx.fillRect(lipX - RIM_R, rimY - 3, RIM_LEN + RIM_R + 3, 6);
        // 前沿圆头
        ctx.beginPath();
        ctx.arc(lipX, rimY, RIM_R, 0, Math.PI * 2);
        ctx.fillStyle = rimColor;
        ctx.fill();
        // 连接篮板的支架
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bbX, rimY - 14);
        ctx.lineTo(bbX - 2, rimY);
        ctx.stroke();
        if (this.onFire) {
            // 火热状态篮筐发光
            ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.time * 8);
            ctx.strokeStyle = '#ffb03a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lipX - RIM_R, rimY);
            ctx.lineTo(bbX, rimY);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        ctx.restore();

        // 网（前半）
        this.drawNet(ctx, true);
    }

    drawNet(ctx, frontHalf) {
        const lipX = this.hoopX;
        const bbX = this.bbX;
        const rimY = this.rimY;
        const squash = 1 + this.netSquash * 0.55;
        const netH = 42 * squash;
        const topW = RIM_LEN;
        const botW = topW * 0.55;
        const cx = lipX + topW / 2;
        const bottomY = rimY + netH;
        const segs = 5;

        ctx.save();
        ctx.strokeStyle = `rgba(230,236,255,${frontHalf ? 0.75 : 0.38})`;
        ctx.lineWidth = 1.2;
        // 纵向线
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const x1 = lipX + topW * t;
            const x2 = cx - botW / 2 + botW * t;
            ctx.beginPath();
            ctx.moveTo(x1, rimY + 3);
            ctx.lineTo(x2, bottomY);
            ctx.stroke();
        }
        if (frontHalf) {
            // 横向菱形网格
            for (let j = 1; j <= 3; j++) {
                const t = j / 4;
                const w = topW + (botW - topW) * t;
                ctx.beginPath();
                ctx.moveTo(cx - w / 2, rimY + 3 + netH * t);
                ctx.lineTo(cx + w / 2, rimY + 3 + netH * t);
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
        ctx.strokeStyle = `rgba(255,211,77,${0.45 + power * 0.4})`;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(BALL_R + 4, 0);
        ctx.lineTo(BALL_R + 4 + arrowLen, 0);
        ctx.stroke();
        // 箭头
        ctx.fillStyle = `rgba(255,211,77,${0.55 + power * 0.4})`;
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
        ctx.fillStyle = 'rgba(232,236,255,0.75)';
        ctx.fillText(`${Math.round(power * 100)}%`, BALL_X, BALL_Y - BALL_R - 16);
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

window.addEventListener('DOMContentLoaded', () => {
    window.hoopShotGame = new HoopShotGame();
});
