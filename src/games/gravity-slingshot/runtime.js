/**
 * Gravity Slingshot 引力弹弓
 * 原创轨道物理游戏：拖拽向后拉弹弓发射探测器，
 * 借助行星引力转弯、甩尾，把探测器送进虫洞。
 * 杆数计分（越少越好）：20 个手工关卡 + 每日赛程（5 洞，全场同一套，
 * 由 UTC+8 日期种子生成，并用弹道采样器验证可解性与标准杆）。
 *
 * 物理：固定 1/120s 子步半隐式欧拉积分（累积器驱动，任意刷新率下
 * 实际飞行都与弹道预测逐帧一致），softened 逆平方引力。
 * 瞄准阶段天体冻结在 t=0 位形——预测、所见与飞行三者一致。
 *
 * Vanilla JS. No runtime dependencies.
 */

import { ensurePlayerName, setPlayerName } from '../../platform/player.js';
import { getLang, getMuted, setMuted } from '../../platform/site-settings.js';
import { storageGet, storageSet } from '../../platform/safe-storage.js';
import { track } from '../../platform/analytics.js';
import { todayKey as todayCompact } from '../../platform/daily.js';
import { submitScore, fetchBoard } from '../../platform/leaderboard.js';
import { ICONS } from '../../platform/icons.js';
import { updateMoreGames } from '../../platform/more-games.js';
import { createSfxEngine } from '../../platform/game-sfx.js';
import { LANGUAGES } from './i18n.js';
import {
    BOUNDS,
    CAPTURE_R,
    DT,
    FLIGHT_TIMEOUT,
    H,
    MAX_STEPS_PER_FRAME,
    SPEED_CAP,
    W,
    WARP_1,
    WARP_2,
} from './config.js';
import { buildDailyCourse, LEVELS } from './model/course.js';
import { loadDailyCourse } from './storage.js';
import { accelAt, bodyScratch, bodiesAt, collisionAt, simulate } from './model/physics.js';
import { bgCanvas, buildStarLayer, planetSprite, PLANET_TONES, renderBackground, starLayer } from './render/scene.js';
import { aimVector, bindGravityInput, toLogical } from './input/pointer.js';

/* ────────────────────────── utilities ────────────────────────── */

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function vibrate(pattern) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {
        // 不支持则忽略
    }
}

export { LANGUAGES } from './i18n.js';

/* ────────────────────────── audio ────────────────────────── */

const sfxEngine = createSfxEngine();

const Sfx = {
    get muted() { return getMuted(); },

    launch(power) {
        sfxEngine.tone({ freq: 180 + power * 160, slideTo: 420 + power * 220, type: 'triangle', dur: 0.22, vol: 0.16 });
    },
    crash() {
        sfxEngine.tone({ freq: 200, slideTo: 45, type: 'sawtooth', dur: 0.4, vol: 0.2 });
    },
    capture() {
        [523, 659, 784, 1046].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'triangle', dur: 0.15, vol: 0.13, delay: i * 0.08 });
        });
    },
    star3() {
        [784, 988, 1175].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.3 + i * 0.1 });
        });
    },
    lost() { sfxEngine.tone({ freq: 320, slideTo: 110, type: 'sine', dur: 0.4, vol: 0.12 }); },
    click() { sfxEngine.tone({ freq: 640, type: 'square', dur: 0.05, vol: 0.06 }); },
    toggleMuted() {
        const muted = !getMuted();
        setMuted(muted);
        return muted;
    }
};

/* ────────────────────────── game ────────────────────────── */

class GravityGame {
    constructor() {
        this.canvas = document.getElementById('gd-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        ['gd-btn-home', 'gd-hole-label', 'gd-launches', 'gd-par', 'gd-total-box', 'gd-total',
            'gd-reset-btn', 'gd-mute-btn', 'gd-toast',
            'gd-start', 'gd-title', 'gd-subtitle', 'gd-howto', 'gd-btn-levels', 'gd-btn-daily',
            'gd-level-label', 'gd-level-grid', 'gd-daily-best', 'gd-start-mute',
            'gd-side-howto-title', 'gd-side-howto', 'gd-side-records-title', 'gd-side-records',
            'gd-hole', 'gd-hole-stars', 'gd-hole-line', 'gd-btn-next', 'gd-btn-replay', 'gd-btn-menu1',
            'gd-over', 'gd-over-title', 'gd-over-score', 'gd-over-sub',
            'gd-btn-again', 'gd-btn-copy', 'gd-btn-menu2',
            'gd-lb-title', 'gd-lb-list', 'gd-lb-status', 'gd-username', 'gd-username-label',
            'gd-hint'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^gd-/, '')] = el;
        });

        this.lang = this.readLang();
        this.stars = storageParseStars();

        this.mode = 'levels';
        this.course = LEVELS;     // 当前洞口序列
        this.holeIdx = 0;
        this.launches = 0;
        this.totalLaunches = 0;
        this.dailyBest = Number(storageGet('gd_daily_' + todayCompact())) || 0;
        this.dailyStartedAt = 0;
        this.dailyDateKey = '';

        // 飞行状态
        this.phase = 'menu';      // menu | aiming | flying | resolved | holed
        this.probe = null;
        this.trail = [];
        this.flightT = 0;
        this.acc = 0;             // 固定步长累积器
        this.particles = [];
        this.rings = [];
        this.meteors = [];        // 背景流星（纯视觉）
        this.meteorTimer = 4;
        this.thrusterAcc = 0;     // 探测器喷焰发射累积器
        this.time = 0;
        this.shake = 0;

        // 拖拽
        this.drag = null;         // {sx, sy, cx, cy}
        this.preview = null;      // {pts, outcome}

        this.animationId = null;
        this.lastFrame = 0;
        this.renderScale = 1;
        /**
         * 暂停标记（2026-09-19 为底部统计抽屉新增）。
         * ⚠️ 本页原先**没有任何暂停能力**：tick 每帧无条件推进 time / 物理 / 粒子。
         * 抽屉要求"打开时强制暂停"，所以必须补一个真正能冻结模拟的开关：
         * `stepFlight()`（飞行弹道）、粒子推进、以及所有以真实时间为基础的动画
         * （背景星层视差等）都读这个标记。判据放主循环里统一处理，避免散落各处。
         */
        this.isPaused = false;

        this.applyLanguage();
        this.renderLevelGrid();
        this.bindInput();
        this.bindUI();
        this.updateMuteButtons();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（见 js/game-frame.js）：
        // 后端缓冲区必须在 CSS 尺寸变化之后重算
        window.addEventListener('game-frame:changed', () => this.resize());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.phase !== 'menu') {
                // 飞行中切走：直接判负重置，避免追赶
                if (this.phase === 'flying') this.abortFlight();
            }
        });

        this.loadLevelIntoView(LEVELS[0]);
        this.startLoop();
    }

    readLang() {
        return getLang();
    }

    get TEXT() { return LANGUAGES[this.lang]; }

    /* ── 语言 ── */

    applyLanguage() {
        const t = this.TEXT;
        document.documentElement.lang = this.lang;
        document.title = this.lang === 'zh'
            ? '引力弹弓 — 轨道物理益智游戏'
            : 'Gravity Slingshot — Orbital Physics Puzzle';
        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['btn-levels']) this.el['btn-levels'].textContent = t.playLevels;
        if (this.el['btn-daily']) this.el['btn-daily'].textContent = t.playDaily;
        if (this.el['level-label']) this.el['level-label'].textContent = t.levelSelect;
        if (this.el['btn-next']) this.el['btn-next'].textContent = t.next;
        if (this.el['btn-replay']) this.el['btn-replay'].innerHTML = `${ICONS.retry}<span>${t.retry}</span>`;
        if (this.el['btn-menu1']) this.el['btn-menu1'].innerHTML = `${ICONS.home}<span>${t.menu}</span>`;
        if (this.el['btn-menu2']) this.el['btn-menu2'].innerHTML = `${ICONS.home}<span>${t.menu}</span>`;
        if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;
        if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['username-label']) this.el['username-label'].textContent = t.usernameLabel;
        if (this.el.username) this.el.username.placeholder = t.usernameLabel;
        if (this.el.hint) this.el.hint.textContent = t.hint;
        if (this.el['reset-btn']) {
            this.el['reset-btn'].title = t.retryTitle;
            this.el['reset-btn'].setAttribute('aria-label', t.retryTitle);
        }
        if (this.el['btn-home']) {
            this.el['btn-home'].title = t.home;
            this.el['btn-home'].setAttribute('aria-label', t.home);
        }
        if (this.el['mute-btn']) {
            this.el['mute-btn'].title = t.sound;
            this.el['mute-btn'].setAttribute('aria-label', t.sound);
        }
        // 桌面侧栏（≥1024px 可见）
        if (this.el['side-howto-title']) this.el['side-howto-title'].textContent = `📖 ${t.sideHowTo}`;
        if (this.el['side-howto']) this.el['side-howto'].textContent = t.howto;
        if (this.el['side-records-title']) this.el['side-records-title'].textContent = `🏅 ${t.sideRecords}`;
        this.updateSideRecords();
        this.renderLevelGrid();
        this.updateDailyBest();
        updateMoreGames(this.lang);
    }

    /** 桌面侧栏战绩（≥1024px 可见）：今日赛程最好杆数 + 关卡总星数 */
    updateSideRecords(date = todayCompact()) {
        const box = this.el['side-records'];
        if (!box) return;
        const t = this.TEXT;
        const todayBest = Number(storageGet('gd_daily_' + date)) || 0;
        const totalStars = this.stars.reduce((a, b) => a + (b || 0), 0);
        const rows = [
            [`📅 ${t.bestToday}`, todayBest ? `${todayBest} ${t.launchesWord}` : '—'],
            [`⭐ ${t.stars}`, `${totalStars}/${LEVELS.length * 3}`]
        ];
        box.textContent = '';
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'gd-side-row game-side-row';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            const valueEl = document.createElement('b');
            valueEl.textContent = value;
            row.append(labelEl, valueEl);
            box.appendChild(row);
        });
    }

    updateDailyBest(date = todayCompact()) {
        if (!this.el['daily-best']) return;
        const best = Number(storageGet('gd_daily_' + date)) || 0;
        this.el['daily-best'].textContent = best
            ? `📅 ${this.TEXT.bestToday}: ${best} ${this.TEXT.launchesWord}`
            : '';
    }

    renderLevelGrid() {
        const grid = this.el['level-grid'];
        if (!grid) return;
        grid.textContent = '';
        for (let i = 0; i < LEVELS.length; i++) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'gd-level-chip';
            const num = document.createElement('span');
            num.className = 'gd-chip-num';
            num.textContent = String(i + 1);
            const starLine = document.createElement('span');
            starLine.className = 'gd-chip-stars';
            const n = this.stars[i] || 0;
            starLine.textContent = n > 0 ? '⭐'.repeat(n) : '☆☆☆';
            chip.append(num, starLine);
            chip.addEventListener('click', () => {
                Sfx.click();
                this.startLevelMode(i);
            });
            grid.appendChild(chip);
        }
    }

    /* ── 模式与洞口 ── */

    startLevelMode(idx) {
        this.mode = 'levels';
        this.course = LEVELS;
        this.holeIdx = clamp(idx, 0, LEVELS.length - 1);
        this.totalLaunches = 0;
        this.enterMenu(false);
        this.loadHole();
        track('gravity-slingshot', 'play');
    }

    startDailyMode() {
        this.mode = 'daily';
        this.dailyStartedAt = Date.now();
        this.dailyDateKey = todayCompact(this.dailyStartedAt);
        this.course = loadDailyCourse(this.dailyStartedAt);
        this.holeIdx = 0;
        this.totalLaunches = 0;
        this.enterMenu(false);
        this.loadHole();
        this.showToast(this.TEXT.dailyStartToast, 1800);
        track('gravity-slingshot', 'play');
    }

    loadHole() {
        this.launches = 0;
        this.loadLevelIntoView(this.course[this.holeIdx]);
        this.phase = 'aiming';
        this.updateHud();
        this.hideOverlays();
        if (this.el.hint) this.el.hint.textContent = this.TEXT.tapToAim;
    }

    loadLevelIntoView(level) {
        this.level = level;
        this.probe = { x: level.pad.x, y: level.pad.y };
        this.trail = [];
        this.preview = null;
        this.drag = null;
        this.flightT = 0;         // 天体时钟归零：瞄准所见 = 模拟所算
        this.particles.length = 0;
        this.rings.length = 0;
        this.thrusterAcc = 0;
    }

    enterMenu(show = true) {
        this.phase = 'menu';
        if (show) {
            this.loadLevelIntoView(LEVELS[0]);
        }
        if (this.el.start) this.el.start.classList.toggle('hidden', !show);
        if (this.el.hole) this.el.hole.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
        this.updateDailyBest();
        this.renderLevelGrid();
        this.updateHud();
    }

    hideOverlays() {
        if (this.el.start) this.el.start.classList.add('hidden');
        if (this.el.hole) this.el.hole.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
    }

    /* ── HUD ── */

    updateHud() {
        const t = this.TEXT;
        if (this.el['hole-label']) {
            const label = this.mode === 'daily' ? `${t.daily} · ${this.holeIdx + 1}/5` : `${t.level} ${this.holeIdx + 1}/${LEVELS.length}`;
            this.el['hole-label'].textContent = label;
        }
        if (this.el.launches) this.el.launches.textContent = String(this.launches);
        if (this.el.par) this.el.par.textContent = `· ${t.par} ${this.level ? this.level.par : 1}`;
        if (this.el.total) {
            this.el.total.textContent = this.mode === 'daily'
                ? `Σ ${this.totalLaunches}`
                : `⭐ ${this.stars.reduce((a, b) => a + (b || 0), 0)}`;
        }
    }

    showToast(text, duration = 1500, warn = false) {
        const toast = this.el.toast;
        if (!toast) return;
        toast.textContent = text;
        toast.classList.remove('hidden');
        toast.classList.toggle('warn', warn);
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
    }

    /* ── 发射与飞行 ── */

    fire(vx, vy) {
        this.launches++;
        this.phase = 'flying';
        this.probe = { x: this.level.pad.x, y: this.level.pad.y, vx, vy };
        this.trail = [];
        this.flightT = 0;
        this.acc = 0;
        Sfx.launch(clamp(Math.hypot(vx, vy) / SPEED_CAP, 0, 1));
        vibrate(12);
        this.updateHud();
    }

    stepFlight() {
        // 时间加速只影响墙钟进度（每帧多积分几个固定步），不改变积分器与结果
        const warp = this.flightT > WARP_2 ? 3 : this.flightT > WARP_1 ? 2 : 1;
        // 固定步长累积器：任何刷新率/帧抖动下实际飞行都与弹道预测逐帧一致
        this.acc += this.frameDt * warp;
        let steps = Math.floor(this.acc / DT);
        if (steps > MAX_STEPS_PER_FRAME) { steps = MAX_STEPS_PER_FRAME; this.acc = 0; }
        else this.acc -= steps * DT;

        for (let s = 0; s < steps; s++) {
            const n = bodiesAt(this.level, this.flightT);
            const a = accelAt(this.probe.x, this.probe.y, n);
            this.probe.vx += a.ax * DT;
            this.probe.vy += a.ay * DT;
            const sp = Math.hypot(this.probe.vx, this.probe.vy);
            if (sp > SPEED_CAP) {
                this.probe.vx *= SPEED_CAP / sp;
                this.probe.vy *= SPEED_CAP / sp;
            }
            this.probe.x += this.probe.vx * DT;
            this.probe.y += this.probe.vy * DT;
            this.flightT += DT;

            if (collisionAt(this.probe.x, this.probe.y, n)) {
                this.resolveFlight('crash');
                return;
            }
            const dx = this.probe.x - this.level.target.x;
            const dy = this.probe.y - this.level.target.y;
            if (dx * dx + dy * dy < CAPTURE_R * CAPTURE_R) {
                this.resolveFlight('capture');
                return;
            }
            if (this.probe.x < -BOUNDS || this.probe.x > W + BOUNDS ||
                this.probe.y < -BOUNDS || this.probe.y > H + BOUNDS) {
                this.resolveFlight('lost');
                return;
            }
            if (this.flightT > FLIGHT_TIMEOUT) {
                this.resolveFlight('lost');
                return;
            }
            if ((s & 1) === 0) {
                this.trail.push({ x: this.probe.x, y: this.probe.y });
                if (this.trail.length > 90) this.trail.shift();
            }
        }
    }

    resolveFlight(outcome) {
        this.phase = 'resolved';
        if (outcome === 'crash') {
            Sfx.crash();
            vibrate(60);
            this.shake = 0.35;
            this.burst(this.probe.x, this.probe.y, '#ff8a5c', 18);
            this.showToast(this.TEXT.crashed + ' ' + this.TEXT.crashHint, 900, true);
        } else if (outcome === 'lost') {
            Sfx.lost();
            vibrate(35);
            this.showToast(this.TEXT.lost + ' ' + this.TEXT.crashHint, 900, true);
        } else if (outcome === 'capture') {
            this.onCapture();
            return;
        }
        setTimeout(() => {
            if (this.phase === 'resolved') {
                this.phase = 'aiming';
                this.loadLevelIntoView(this.level);
                this.updateHud();
            }
        }, 650);
    }

    abortFlight() {
        this.phase = 'aiming';
        this.loadLevelIntoView(this.level);
        this.updateHud();
    }

    onCapture() {
        this.phase = 'holed';
        Sfx.capture();
        vibrate([25, 40, 70]);
        this.burstSwirl(this.probe.x, this.probe.y, '#7dfad0', 26);
        this.rings.push({ x: this.probe.x, y: this.probe.y, r: 6, maxR: 96, age: 0, life: 0.62, color: '#7dfad0' });
        this.rings.push({ x: this.probe.x, y: this.probe.y, r: 3, maxR: 52, age: 0, life: 0.42, color: '#eafff6' });

        const par = this.level.par;
        const starCount = this.launches <= par ? 3 : this.launches <= par + 1 ? 2 : 1;
        if (starCount === 3) Sfx.star3();

        if (this.mode === 'daily') {
            this.totalLaunches += this.launches;
            this.updateHud();
            if (this.holeIdx >= this.course.length - 1) {
                this.finishDaily();
            } else {
                this.showToast(`✅ ${this.TEXT.holeCleared} ${this.launches} ${this.TEXT.launchesWord}`, 1100);
                setTimeout(() => {
                    if (this.phase !== 'holed') return;
                    this.holeIdx++;
                    this.loadHole();
                }, 1150);
            }
            return;
        }

        // 关卡模式：记录星星
        const prev = this.stars[this.holeIdx] || 0;
        if (starCount > prev) {
            this.stars[this.holeIdx] = starCount;
            storageSet('gd_stars', JSON.stringify(this.stars));
        }
        this.updateSideRecords();
        if (this.el['hole-stars']) this.el['hole-stars'].textContent = '⭐'.repeat(starCount) + '☆'.repeat(3 - starCount);
        if (this.el['hole-line']) {
            this.el['hole-line'].textContent = `${this.TEXT.launches} ${this.launches} · ${this.TEXT.par} ${par}`;
        }
        if (this.el['btn-next']) {
            this.el['btn-next'].textContent = this.holeIdx >= LEVELS.length - 1 ? `🏁 ${this.TEXT.levelDone}` : this.TEXT.next;
        }
        this.updateHud();
        setTimeout(() => {
            if (this.phase === 'holed' && this.el.hole) this.el.hole.classList.remove('hidden');
        }, 620);
    }

    nextHole() {
        if (this.mode === 'levels' && this.holeIdx >= LEVELS.length - 1) {
            track('gravity-slingshot', 'finish');
            this.enterMenu(true);
            return;
        }
        this.holeIdx++;
        this.loadHole();
    }

    /* ── 每日赛程结算 ── */

    finishDaily() {
        const date = this.dailyDateKey || todayCompact(this.dailyStartedAt || Date.now());
        const prev = Number(storageGet('gd_daily_' + date)) || 0;
        const isBest = !prev || this.totalLaunches < prev;
        if (isBest) storageSet('gd_daily_' + date, String(this.totalLaunches));
        // The landing Daily Hub tracks completion separately from this game's best score.
        storageSet('gs_daily_' + date, '1');
        this.updateDailyBest(date);
        this.updateSideRecords(date);

        if (this.el['over-title']) this.el['over-title'].textContent = `📅 ${this.TEXT.dailyDone}`;
        if (this.el['over-score']) this.el['over-score'].textContent = `${this.totalLaunches} ${this.TEXT.launchesWord}`;
        if (this.el['over-sub']) {
            this.el['over-sub'].textContent = isBest ? `🌟 ${this.TEXT.bestToday}` : `${this.TEXT.bestToday}: ${Math.min(prev, this.totalLaunches)}`;
        }
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';
        if (this.el.over) this.el.over.classList.remove('hidden');
        track('gravity-slingshot', 'finish');

        const game = `gravity-d${date}`;
        // 网络层收敛到 js/leaderboard.js（false=未进全球榜，走本地兜底）
        submitScore({ game, name: ensurePlayerName() || 'Anonymous', score: this.totalLaunches }).then(ok => {
            if (ok) return this.fetchDailyBoard(game, date);
            this.renderLocalBoard(date);
            if (this.el['lb-status']) this.el['lb-status'].textContent = this.TEXT.lbOffline;
        });
    }

    localBoardKey(date = this.dailyDateKey || todayCompact()) { return `gd_local_${date}`; }

    renderLocalBoard(date = this.dailyDateKey || todayCompact()) {
        const list = this.el['lb-list'];
        if (!list) return;
        list.textContent = '';
        let local = [];
        try {
            local = JSON.parse(storageGet(this.localBoardKey(date))) || [];
        } catch (e) { local = []; }
        if (!Array.isArray(local) || local.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'gd-lb-empty';
            empty.textContent = this.TEXT.noScores;
            list.appendChild(empty);
            return;
        }
        local.slice(0, 10).forEach((s, i) => list.appendChild(this.buildLbRow(i, s)));
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'gd-lb-row' + (rank < 3 ? ` gd-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'gd-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'gd-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'gd-lb-score';
        scoreEl.textContent = `${entry.score}`;
        row.append(rankEl, nameEl, scoreEl);
        return row;
    }

    async fetchDailyBoard(game, date = this.dailyDateKey || todayCompact()) {
        const list = this.el['lb-list'];
        const statusEl = this.el['lb-status'];
        if (!list) return;
        try {
            const data = await fetchBoard(game);
            if (this.phase !== 'holed' || !this.el.over || this.el.over.classList.contains('hidden')) return;
            list.textContent = '';
            if (!Array.isArray(data) || data.length === 0) {
                this.renderLocalBoard(date);
                return;
            }
            data.slice(0, 10).forEach((entry, i) => list.appendChild(this.buildLbRow(i, entry)));
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            this.renderLocalBoard(date);
            if (statusEl) statusEl.textContent = this.TEXT.lbOffline;
        }
    }

    /* ── 粒子 ── */

    burst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= 130) this.particles.shift();
            const ang = Math.random() * Math.PI * 2;
            const spd = 30 + Math.random() * 150;
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 0.45 + Math.random() * 0.4,
                age: 0,
                size: 1.4 + Math.random() * 2.4,
                color
            });
        }
    }

    /** 漩涡爆发：粒子带切向速度，呈螺旋散开（捕获特效） */
    burstSwirl(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= 130) this.particles.shift();
            const ang = Math.random() * Math.PI * 2;
            const spd = 40 + Math.random() * 130;
            this.particles.push({
                x: x + Math.cos(ang) * 6,
                y: y + Math.sin(ang) * 6,
                vx: Math.cos(ang) * spd * 0.45 - Math.sin(ang) * spd,
                vy: Math.sin(ang) * spd * 0.45 + Math.cos(ang) * spd,
                life: 0.5 + Math.random() * 0.45,
                age: 0,
                size: 1.4 + Math.random() * 2.4,
                color
            });
        }
    }

    /* ── 输入 ── */

    toLogical(e) {
        return toLogical(this, e);
    }

    aimVector() {
        return aimVector(this);
    }

    bindInput() {
        return bindGravityInput(this);
    }

    /* ── UI 事件 ── */

    resetHole() {
        if (this.phase === 'flying' || this.phase === 'resolved' || this.phase === 'aiming') {
            this.phase = 'aiming';
            this.loadLevelIntoView(this.level);
            this.updateHud();
        }
    }

    bindUI() {
        if (this.el['btn-levels']) this.el['btn-levels'].addEventListener('click', () => {
            Sfx.click();
            this.startLevelMode(0);
        });
        if (this.el['btn-daily']) this.el['btn-daily'].addEventListener('click', () => {
            Sfx.click();
            this.startDailyMode();
        });
        if (this.el['btn-menu1']) this.el['btn-menu1'].addEventListener('click', () => { Sfx.click(); this.enterMenu(true); });
        if (this.el['btn-menu2']) this.el['btn-menu2'].addEventListener('click', () => { Sfx.click(); this.enterMenu(true); });
        if (this.el['btn-next']) this.el['btn-next'].addEventListener('click', () => { Sfx.click(); this.nextHole(); });
        if (this.el['btn-replay']) this.el['btn-replay'].addEventListener('click', () => { Sfx.click(); this.loadHole(); });
        if (this.el['btn-again']) this.el['btn-again'].addEventListener('click', () => { Sfx.click(); this.startDailyMode(); });
        if (this.el['reset-btn']) this.el['reset-btn'].addEventListener('click', () => {
            Sfx.click();
            this.resetHole();
        });
        if (this.el['btn-copy']) this.el['btn-copy'].addEventListener('click', () => this.copyResult());

        // 键盘快捷键：R 重试/中止飞行，M 静音
        window.addEventListener('keydown', (e) => {
            if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
            const k = e.key.toLowerCase();
            if (k === 'r') {
                Sfx.click();
                this.resetHole();
            } else if (k === 'm') {
                this.toggleMute();
            }
        });

        if (this.el['mute-btn']) this.el['mute-btn'].addEventListener('click', () => this.toggleMute());
        if (this.el['start-mute']) this.el['start-mute'].addEventListener('click', () => this.toggleMute());
        if (this.el.username) {
            this.el.username.addEventListener('change', () => {
                setPlayerName(this.el.username.value);
                this.el.username.value = ensurePlayerName();
            });
            this.el.username.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.el.username.blur();
            });
        }

        window.addEventListener('site-settings:changed', () => {
            this.lang = this.readLang();
            this.applyLanguage();
            this.updateHud();
        });
    }

    toggleMute() {
        const muted = Sfx.toggleMuted();
        this.updateMuteButtons();
        if (!muted) Sfx.click();
    }

    updateMuteButtons() {
        const icon = Sfx.muted ? ICONS.soundOff : ICONS.soundOn;
        if (this.el['mute-btn']) this.el['mute-btn'].innerHTML = icon;
        if (this.el['start-mute']) this.el['start-mute'].innerHTML = icon;
    }

    async copyResult() {
        const t = this.TEXT;
        const text = `🚀 ${t.title}\n${t.daily}: ${this.totalLaunches} ${t.launchesWord}\nhttps://games.orangely.xyz/gravity-slingshot.html`;
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
            const original = `📋 ${t.copyResult}`;
            this.el['btn-copy'].textContent = ok ? `✅ ${t.copied}` : original;
            setTimeout(() => {
                if (this.el['btn-copy']) this.el['btn-copy'].textContent = original;
            }, 1600);
        }
    }

    /* ── 尺寸 ── */

    resize() {
        const cssW = this.canvas.clientWidth || 300;
        const scale = cssW / W;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderScale = scale * dpr;
        const pw = Math.round(W * this.renderScale);
        if (this.canvas.width !== pw) {
            this.canvas.width = pw;
            this.canvas.height = Math.round(H * this.renderScale);
        }
        renderBackground(this.renderScale);
        buildStarLayer(this.renderScale);
    }

    /* ── 暂停（供底部统计抽屉调用） ── */

    /**
     * 静默暂停 / 恢复。
     * 本页没有暂停界面（也没有按钮），所以没有"遮罩闪烁"问题——
     * 冻结完全靠主循环里的 `isPaused` 判断。
     */
    pauseQuiet() {
        // menu 态本来就没有模拟在跑，标记它没意义（恢复时反而容易误判）
        if (this.phase === 'menu') return;
        this.isPaused = true;
    }

    resumeQuiet() {
        if (!this.isPaused) return;
        this.isPaused = false;
        this.lastFrame = performance.now();   // 丢掉暂停期间的时间跳跃
    }

    /** 抽屉判据：只有瞄准/飞行/结算这些"活"的阶段才值得暂停 */
    isRunning() {
        return !this.isPaused && this.phase !== 'menu';
    }

    /* ── 主循环 ── */

    startLoop() {
        this.lastFrame = performance.now();
        const tick = (now) => {
            this.animationId = requestAnimationFrame(tick);
            let dt = (now - this.lastFrame) / 1000;
            this.lastFrame = now;
            if (dt > 0.05) dt = 0.05;
            // ⚠️ 暂停时：只重排下一帧、不推进任何时间。
            // 关键是 `this.lastFrame = now` 必须在暂停判断**之前**已赋值
            // （上面就赋了），否则恢复那一帧会拿到整个暂停时长的 dt → 弹道瞬移。
            // 同时把 frameDt 归零，让依赖它的视觉动画也静止。
            if (this.isPaused) {
                this.frameDt = 0;
                return;
            }
            this.frameDt = dt;
            this.time += dt;
            if (this.phase === 'flying') this.stepFlight();

            // 粒子
            let w = 0;
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                p.age += dt;
                if (p.age >= p.life) continue;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vx *= 0.93;
                p.vy *= 0.93;
                this.particles[w++] = p;
            }
            this.particles.length = w;

            // 波纹
            w = 0;
            for (let i = 0; i < this.rings.length; i++) {
                const r = this.rings[i];
                r.age += dt;
                if (r.age >= r.life) continue;
                r.r = r.maxR * (r.age / r.life);
                this.rings[w++] = r;
            }
            this.rings.length = w;

            if (this.shake > 0) this.shake -= dt;

            // 背景流星：随机生成，斜掠而过
            this.meteorTimer -= dt;
            if (this.meteorTimer <= 0) {
                this.meteorTimer = 4 + Math.random() * 7;
                const dir = Math.random() < 0.5 ? 1 : -1;
                this.meteors.push({
                    x: 40 + Math.random() * (W - 80),
                    y: -20,
                    vx: dir * (110 + Math.random() * 150),
                    vy: 240 + Math.random() * 190,
                    life: 1
                });
            }
            for (let i = this.meteors.length - 1; i >= 0; i--) {
                const m = this.meteors[i];
                m.x += m.vx * dt;
                m.y += m.vy * dt;
                m.life -= dt * 0.55;
                if (m.life <= 0 || m.y > H + 40) this.meteors.splice(i, 1);
            }

            // 探测器喷焰（飞行中）
            if (this.phase === 'flying' && this.probe && this.particles.length < 120) {
                this.thrusterAcc += dt * 80;
                const sp = Math.hypot(this.probe.vx, this.probe.vy) || 1;
                const ux = this.probe.vx / sp, uy = this.probe.vy / sp;
                while (this.thrusterAcc >= 1) {
                    this.thrusterAcc -= 1;
                    this.particles.push({
                        x: this.probe.x - ux * 7 + (Math.random() - 0.5) * 3,
                        y: this.probe.y - uy * 7 + (Math.random() - 0.5) * 3,
                        vx: -ux * (35 + Math.random() * 30) + (Math.random() - 0.5) * 18,
                        vy: -uy * (35 + Math.random() * 30) + (Math.random() - 0.5) * 18 + 25,
                        life: 0.22 + Math.random() * 0.18,
                        age: 0,
                        size: 1.3 + Math.random() * 1.8,
                        color: Math.random() < 0.55 ? '#ffb03a' : '#ff8a5c'
                    });
                }
            } else {
                this.thrusterAcc = 0;
            }

            this.draw();
        };
        this.animationId = requestAnimationFrame(tick);
    }

    /* ── 渲染 ── */

    draw() {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(bgCanvas, 0, 0);

        // 视差星层：远慢近快，模拟航向纵深
        {
            const lw = starLayer.width, lh = starLayer.height;
            const farY = Math.round(((this.time * 4) % H) * this.renderScale);
            ctx.globalAlpha = 0.55;
            ctx.drawImage(starLayer, 0, farY - lh, lw, lh);
            ctx.drawImage(starLayer, 0, farY, lw, lh);
            const nearY = Math.round(((this.time * 11) % H) * this.renderScale);
            const nearX = Math.round(((this.time * 3) % W) * this.renderScale);
            ctx.globalAlpha = 0.9;
            ctx.drawImage(starLayer, nearX - lw, nearY - lh, lw, lh);
            ctx.drawImage(starLayer, nearX, nearY - lh, lw, lh);
            ctx.drawImage(starLayer, nearX - lw, nearY, lw, lh);
            ctx.drawImage(starLayer, nearX, nearY, lw, lh);
            ctx.globalAlpha = 1;
        }

        if (this.shake > 0) {
            const s = this.shake * 7;
            ctx.setTransform(this.renderScale, 0, 0, this.renderScale, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        } else {
            ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
        }

        // 闪烁星
        ctx.fillStyle = '#dfe7ff';
        for (let i = 0; i < 20; i++) {
            const tw = 0.25 + 0.3 * Math.sin(this.time * (1.1 + (i % 5) * 0.35) + i * 1.7);
            ctx.globalAlpha = Math.max(0.05, tw);
            ctx.beginPath();
            ctx.arc((i * 97 + 31) % W, (i * 197 + 83) % H, 1.1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 流星
        for (const m of this.meteors) {
            const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 0.13, m.y - m.vy * 0.13);
            grad.addColorStop(0, `rgba(223,231,255,${0.85 * m.life})`);
            grad.addColorStop(1, 'rgba(223,231,255,0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(m.x - m.vx * 0.13, m.y - m.vy * 0.13);
            ctx.stroke();
        }

        const level = this.level;
        if (!level) return;
        // 天体时钟：菜单空闲漂移；其余阶段与物理模拟同步（瞄准=t0 冻结，
        // 飞行/结算=flightT），保证预测、所见与飞行三者一致
        const bodyT = this.phase === 'menu' ? this.time * 0.2 : this.flightT;
        const n = bodiesAt(level, bodyT);

        // 卫星轨道环
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        for (const b of level.bodies) {
            if (!b.moon) continue;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.moon.dist, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 行星 + 卫星（按 y 排序，纯绘制，不影响物理）
        const drawOrder = [];
        for (let i = 0; i < n; i++) drawOrder.push(i);
        drawOrder.sort((a, b) => bodyScratch[a].y - bodyScratch[b].y);
        for (const i of drawOrder) {
            const b = bodyScratch[i];
            const tone = b.tone === undefined ? (b.r | 0) % PLANET_TONES.length : b.tone % PLANET_TONES.length;
            const sprite = planetSprite(b.r, tone, b.ring);
            ctx.drawImage(sprite, b.x - sprite.width / 2, b.y - sprite.height / 2);
        }

        // 虫洞（目标）
        const tw = level.target;
        const pulse = 0.75 + 0.25 * Math.sin(this.time * 3.4);
        const glow = ctx.createRadialGradient(tw.x, tw.y, 2, tw.x, tw.y, 34);
        glow.addColorStop(0, `rgba(125,250,208,${0.5 * pulse})`);
        glow.addColorStop(1, 'rgba(125,250,208,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(tw.x, tw.y, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(tw.x, tw.y);
        ctx.rotate(this.time * 1.6);
        ctx.strokeStyle = '#7dfad0';
        ctx.lineWidth = 2.4;
        for (let k = 0; k < 2; k++) {
            ctx.beginPath();
            ctx.arc(0, 0, CAPTURE_R - 2 + k * 4, k * Math.PI, k * Math.PI + Math.PI * 1.25);
            ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#eafff6';
        ctx.beginPath();
        ctx.arc(tw.x, tw.y, 3.4 * pulse + 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 虫洞螺旋吸入粒子：绕行并收缩的星屑
        for (let k = 0; k < 10; k++) {
            const prog = (this.time * 0.38 + k / 10) % 1;
            const rad = 32 * (1 - prog) + 6;
            const ang = this.time * 2.4 + k * 0.63 + prog * 4.2;
            ctx.globalAlpha = 0.1 + 0.55 * prog * pulse;
            ctx.fillStyle = k % 2 ? '#9ffbe4' : '#eafff6';
            ctx.beginPath();
            ctx.arc(tw.x + Math.cos(ang) * rad, tw.y + Math.sin(ang) * rad, 1.1 + prog * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 发射台底座（始终绘制；瞄准圈仅待发时）
        {
            const px = level.pad.x, py = level.pad.y;
            ctx.fillStyle = 'rgba(16,24,54,0.92)';
            ctx.strokeStyle = 'rgba(125,250,208,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px - 18, py + 6);
            ctx.lineTo(px + 18, py + 6);
            ctx.lineTo(px + 13, py + 14);
            ctx.lineTo(px - 13, py + 14);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(125,250,208,0.28)';
            ctx.beginPath();
            ctx.arc(px, py + 8.5, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        if (this.phase === 'aiming' || this.phase === 'menu') {
            ctx.strokeStyle = 'rgba(125,250,208,0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.arc(level.pad.x, level.pad.y, 15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 拖拽弹弓带
        if (this.drag && this.phase === 'aiming') {
            const aim = this.aimVector();
            const pull = {
                x: this.level.pad.x + (this.drag.cx - this.drag.sx),
                y: this.level.pad.y + (this.drag.cy - this.drag.sy)
            };
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.level.pad.x, this.level.pad.y);
            ctx.lineTo(pull.x, pull.y);
            ctx.stroke();
            if (aim) {
                // 力量弧
                const frac = clamp(Math.hypot(aim.vx, aim.vy) / SPEED_CAP, 0, 1);
                ctx.strokeStyle = frac > 0.85 ? '#ff8a5c' : '#7dfad0';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.level.pad.x, this.level.pad.y, 21, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
                ctx.stroke();
            }
        }

        // 弹道预测
        if (this.preview && this.preview.pts.length) {
            const pts = this.preview.pts;
            ctx.fillStyle = 'rgba(223,231,255,0.7)';
            for (let i = 2; i < pts.length; i += 3) {
                const p = pts[i];
                ctx.globalAlpha = 0.65 * (1 - i / pts.length);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            // 端点预告：撞毁 ✕ / 捕获环
            const last = pts[pts.length - 1];
            if (this.preview.outcome === 'crash' && last) {
                ctx.strokeStyle = '#ff8a5c';
                ctx.globalAlpha = 0.9;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(last.x - 4.5, last.y - 4.5);
                ctx.lineTo(last.x + 4.5, last.y + 4.5);
                ctx.moveTo(last.x + 4.5, last.y - 4.5);
                ctx.lineTo(last.x - 4.5, last.y + 4.5);
                ctx.stroke();
                ctx.globalAlpha = 1;
            } else if (this.preview.outcome === 'capture' && last) {
                ctx.strokeStyle = '#7dfad0';
                ctx.globalAlpha = 0.85;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(last.x, last.y, 8 + Math.sin(this.time * 6) * 1.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        // 飞行尾迹（发光渐变）
        if (this.trail.length > 1) {
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 1; i < this.trail.length; i++) {
                const a = i / this.trail.length;
                const p0 = this.trail[i - 1], p1 = this.trail[i];
                const sp = clamp(Math.hypot(this.probe.vx, this.probe.vy) / SPEED_CAP, 0, 1);
                ctx.strokeStyle = sp > 0.72
                    ? `rgba(255,138,92,${a * 0.5})`
                    : `rgba(96,165,250,${a * 0.5})`;
                ctx.lineWidth = 1 + a * 2.4;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        // 探测器（小火箭：飞行中朝向速度方向，待发时直立轻微浮动）
        const probeDraw = this.phase === 'flying' ? this.probe : this.level.pad;
        const bob = this.phase === 'aiming' ? Math.sin(this.time * 3) * 1.5 : 0;
        const flyingFast = this.phase === 'flying' && (Math.abs(this.probe.vx) + Math.abs(this.probe.vy)) > 1;
        const noseAng = flyingFast ? Math.atan2(this.probe.vy, this.probe.vx) : -Math.PI / 2;
        const pglow = ctx.createRadialGradient(probeDraw.x, probeDraw.y + bob, 1, probeDraw.x, probeDraw.y + bob, 12);
        pglow.addColorStop(0, 'rgba(223,231,255,0.8)');
        pglow.addColorStop(1, 'rgba(223,231,255,0)');
        ctx.fillStyle = pglow;
        ctx.beginPath();
        ctx.arc(probeDraw.x, probeDraw.y + bob, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(probeDraw.x, probeDraw.y + bob);
        ctx.rotate(noseAng + Math.PI / 2);   // 火箭造型以"朝上"为基准绘制
        // 飞行喷焰（粒子之外的本体火焰，纯视觉）
        if (this.phase === 'flying') {
            const flicker = 0.65 + 0.35 * Math.sin(this.time * 42);
            ctx.fillStyle = '#ff8a5c';
            ctx.beginPath();
            ctx.moveTo(-2.4, 4);
            ctx.lineTo(0, 4 + 8.5 * flicker);
            ctx.lineTo(2.4, 4);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffe08a';
            ctx.beginPath();
            ctx.moveTo(-1.2, 4);
            ctx.lineTo(0, 4 + 5 * flicker);
            ctx.lineTo(1.2, 4);
            ctx.closePath();
            ctx.fill();
        }
        // 尾翼
        ctx.fillStyle = '#7dfad0';
        ctx.beginPath();
        ctx.moveTo(-4, 2); ctx.lineTo(-7.5, 7); ctx.lineTo(-2.6, 5.2); ctx.closePath();
        ctx.moveTo(4, 2); ctx.lineTo(7.5, 7); ctx.lineTo(2.6, 5.2); ctx.closePath();
        ctx.fill();
        // 箭身
        ctx.fillStyle = '#f4f7ff';
        ctx.beginPath();
        ctx.moveTo(0, -8.5);
        ctx.quadraticCurveTo(4.6, -2.5, 4.2, 4);
        ctx.lineTo(-4.2, 4);
        ctx.quadraticCurveTo(-4.6, -2.5, 0, -8.5);
        ctx.closePath();
        ctx.fill();
        // 舷窗
        ctx.fillStyle = '#7dfad0';
        ctx.beginPath();
        ctx.arc(0, -1.6, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 波纹
        for (const r of this.rings) {
            ctx.strokeStyle = r.color;
            ctx.globalAlpha = 1 - r.age / r.life;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // 粒子
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // 时间加速指示（物理结果不变，只是观看提速）
        if (this.phase === 'flying' && this.flightT > WARP_1) {
            ctx.fillStyle = 'rgba(223,231,255,0.4)';
            ctx.font = 'bold 13px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(this.flightT > WARP_2 ? '▶▶▶' : '▶▶', W - 10, 24);
            ctx.textAlign = 'left';
        }
    }
}

function storageParseStars() {
    try {
        const arr = JSON.parse(storageGet('gd_stars'));
        const out = Array.isArray(arr) ? arr.slice() : [];
        while (out.length < LEVELS.length) out.push(0);
        return out;
    } catch (e) {
        return new Array(LEVELS.length).fill(0);
    }
}

/* ────────────────────────── boot ────────────────────────── */

export { GravityGame, LEVELS, simulate, buildDailyCourse, DT, SPEED_CAP, W };
export { solvePar } from './model/course.js';
