/**
 * Lumen 折光 — 光束折射解谜
 * =========================
 * 玩法：点击镜面在 '/' 与 '\' 两态间翻转，折转发射器的光束，
 * 点亮全部水晶、不碰暗晶。点击次数 ≤ Par 拿满三星，≤ Par + 2 两星。
 * 元件：诱饵镜 / 暗晶（不能被照到）/ 联动镜（同色一起翻）/ 分光镜（一束变两束）。
 *
 * 关卡数据 / 光束追踪 / 解空间在 model/（纯模块，校验器共用）：
 *   - beam.js   网格、光束追踪、点击翻转
 *   - solver.js 全枚举解空间：真 par、最优解唯一、预见步数、贪心机器人
 *   - levels.js 5 章 × 5 关（性质由 verify-lumen-levels.mjs 锁定）+ 每日谜题
 *     （24 双光束布局 × FNV-1a('lumen-'+UTC+8 日期) 选关 × solver.scramble 打乱）
 *
 * 共享层（2026-09 契约）：game-frame（桌面纵向预算）/ game-drawer（移动端统计
 * 抽屉）/ game-chrome（Home·Sound·Lang·More）/ leaderboard / daily / i18n /
 * safe-storage / analytics / game-sfx / boot。
 */

import { bindContextualRestart } from '../../platform/contextual-restart.js';
import {
    CHAPTERS,
    GRID_N,
    LEVELS_PER_CHAPTER,
    LUMEN_LEVELS,
    dailyLevel,
    tapGrid,
    traceGrid,
} from './model/levels.js';
import { ensurePlayerName, setPlayerName } from '../../platform/player.js';
import { getLang, getMuted, setMuted } from '../../platform/site-settings.js';
import { ICONS } from '../../platform/icons.js';
import { updateMoreGames } from '../../platform/more-games.js';
import { storageGet, storageSet } from '../../platform/safe-storage.js';
import { LUMEN_STORAGE, LUMEN_STORAGE_SLOTS } from './storage.js';
import { track } from '../../platform/analytics.js';
import { todayKey, todayKeyDisplay } from '../../platform/daily.js';
import { submitScore, fetchBoard } from '../../platform/leaderboard.js';
import { LANGUAGES } from './i18n.js';
import { createSfxEngine } from '../../platform/game-sfx.js';

/* ────────────────────────── 常量 ────────────────────────── */

export const W = 560, H = 560;
const CELL = W / GRID_N;
const STEP = { '>': [0, 1], 'v': [1, 0], '<': [0, -1], '^': [-1, 0] };
// 联动组配色（按组序号取；同组 = 同色光环 + 虚线系绳）
const LINK_COLORS = ['#ffb547', '#ff7eb6', '#b18cff', '#7ee0ff'];
const FLIP_DUR = 0.16;
const RIPPLE_DUR = 0.42;
const mirrorAngle = ch => (ch === '/' ? -Math.PI / 4 : Math.PI / 4);

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function vibrate(pattern) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* 不支持则忽略 */ }
}

/* ────────────────────────── i18n ────────────────────────── */

/* ────────────────────────── audio ────────────────────────── */

const sfxEngine = createSfxEngine();

const Sfx = {
    click() { sfxEngine.tone({ freq: 640, type: 'square', dur: 0.05, vol: 0.06 }); },
    /** 镜面翻转：干净的机械「嗒」 */
    flip() {
        sfxEngine.tone({ freq: 520, slideTo: 760, type: 'triangle', dur: 0.07, vol: 0.12 });
    },
    /** 暗晶被照到：低沉的嗡鸣 */
    shadow() {
        sfxEngine.tone({ freq: 196, slideTo: 140, type: 'sawtooth', dur: 0.22, vol: 0.07 });
    },
    /** 新水晶点亮：上扬双音 */
    crystal() {
        sfxEngine.tone({ freq: 880, type: 'sine', dur: 0.12, vol: 0.12 });
        sfxEngine.tone({ freq: 1320, type: 'sine', dur: 0.16, vol: 0.1, delay: 0.07 });
    },
    win() {
        [523, 659, 784, 1046].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'triangle', dur: 0.15, vol: 0.13, delay: i * 0.08 });
        });
    },
    star3() {
        [784, 988, 1175].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.3 + i * 0.1 });
        });
    },
};

/* ────────────────────────── 渲染辅助 ────────────────────────── */

function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function cellCenter(r, c) {
    return { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL };
}

/** 折线总长与按弧长取点（光束流动动画用） */
function polylineGeom(pts) {
    const px = pts.map(([r, c]) => cellCenter(r, c));
    const segs = [];
    let total = 0;
    for (let i = 1; i < px.length; i++) {
        const dx = px[i].x - px[i - 1].x;
        const dy = px[i].y - px[i - 1].y;
        const len = Math.hypot(dx, dy);
        segs.push({ a: px[i - 1], b: px[i], len, acc: total });
        total += len;
    }
    return { px, segs, total };
}

function pointAtDist(geom, dist) {
    const d = ((dist % geom.total) + geom.total) % geom.total;
    for (const s of geom.segs) {
        if (d <= s.acc + s.len) {
            const k = (d - s.acc) / s.len;
            return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k };
        }
    }
    return geom.px[geom.px.length - 1];
}

/* ────────────────────────── 存储 ────────────────────────── */

/** 星级按关卡 id 存（storage v2）；运行时展开成按关卡下标的数组 */
function storageParseStars() {
    try {
        const byId = LUMEN_STORAGE.get(LUMEN_STORAGE_SLOTS.STARS, {});
        const map = byId && typeof byId === 'object' && !Array.isArray(byId) ? byId : {};
        return LUMEN_LEVELS.map(lv => clamp(Number(map[lv.id]) || 0, 0, 3));
    } catch (e) {
        return new Array(LUMEN_LEVELS.length).fill(0);
    }
}

function storageSaveStars(stars) {
    const byId = {};
    LUMEN_LEVELS.forEach((lv, i) => { if (stars[i]) byId[lv.id] = stars[i]; });
    LUMEN_STORAGE.set(LUMEN_STORAGE_SLOTS.STARS, byId);
}

/** 星级规则：≤ par 三星，≤ par + 2 两星，其余一星 */
function starsFor(flips, par) {
    return flips <= par ? 3 : flips <= par + 2 ? 2 : 1;
}

/* ────────────────────────── 游戏主体 ────────────────────────── */

export class LumenGame {
    constructor() {
        this.canvas = document.getElementById('lm-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        ['lm-btn-home', 'lm-hud-level', 'lm-flips', 'lm-par', 'lm-reset-btn', 'lm-mute-btn', 'lm-toast',
            'lm-start', 'lm-title', 'lm-subtitle', 'lm-howto', 'lm-btn-levels', 'lm-btn-daily',
            'lm-level-label', 'lm-level-grid', 'lm-daily-best', 'lm-start-mute',
            'lm-side-howto-title', 'lm-side-howto', 'lm-side-records-title', 'lm-side-records',
            'lm-clear', 'lm-clear-stars', 'lm-clear-line', 'lm-btn-next', 'lm-btn-replay', 'lm-btn-menu1',
            'lm-over', 'lm-over-title', 'lm-over-score', 'lm-over-sub',
            'lm-btn-again', 'lm-btn-copy', 'lm-btn-menu2',
            'lm-lb-title', 'lm-lb-list', 'lm-lb-status', 'lm-username', 'lm-username-label',
            'lm-hint'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^lm-/, '')] = el;
        });

        this.lang = getLang();
        this.stars = storageParseStars();

        // 对局状态：menu | playing | won-level | won-daily
        // ⚠️ 字段名与 verify-stats-drawer.mjs 的 AUGMENT runningExpr 严格对应
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.mode = 'levels';
        this.levelIdx = 0;
        this.par = 1;
        this.flips = 0;
        this.level = null;      // 当前关卡对象（章节关或每日）：{ sol, grid, par, split, links, … }
        this.baseGrid = null;   // 本关初盘（Reset 用）
        this.grid = null;       // 当前盘面（9 个字符串）
        this.trace = null;      // traceGrid(grid, level.split) 结果
        this.daily = null;      // 每日谜题 { grid, sol, par, split, links, dateKey }

        // 视觉
        this.time = 0;
        this.frameDt = 0;
        this.particles = [];
        this.flipAnims = new Map();   // idx → { from, to, age }：镜面转动补间（纯视觉，判定已即时生效）
        this.ripples = [];            // 点击涟漪 { x, y, color, age }
        this.starsBg = this.buildStarfield();

        this.animationId = null;
        this.lastFrame = 0;

        this.applyLanguage();
        this.renderLevelGrid();
        this.bindInput();
        this.bindUI();
        this.updateMuteButtons();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（src/platform/game-frame.js）
        window.addEventListener('game-frame:changed', () => this.resize());

        this.loadLevel(0);   // 菜单背景展示第 1 关的光路
        this.startLoop();
    }

    get TEXT() { return LANGUAGES[this.lang]; }

    /* ── 语言 ── */

    applyLanguage() {
        this.lang = getLang();
        const t = this.TEXT;
        document.documentElement.lang = this.lang;
        document.title = this.lang === 'zh'
            ? '折光 Lumen — 光束折射解谜'
            : 'Lumen — Beam Refraction Puzzle';
        if (this.el['btn-next']) this.el['btn-next'].innerHTML = `${ICONS.arrowRight}<span>${t.next}</span>`;
        if (this.el['btn-replay']) this.el['btn-replay'].innerHTML = `${ICONS.retry}<span>${t.retry}</span>`;
        if (this.el['btn-menu1']) this.el['btn-menu1'].innerHTML = `${ICONS.home}<span>${t.menu}</span>`;
        if (this.el['btn-menu2']) this.el['btn-menu2'].innerHTML = `${ICONS.home}<span>${t.menu}</span>`;
        if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;
        if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['btn-home']) {
        }
        // 桌面侧栏
        if (this.el['side-howto-title']) this.el['side-howto-title'].textContent = `📖 ${t.sideHowTo}`;
        if (this.el['side-records-title']) this.el['side-records-title'].textContent = `🏅 ${t.sideRecords}`;
        this.renderLevelGrid();
        this.updateDailyBest();
        this.updateSideRecords();
        this.updateHud();
        updateMoreGames(this.lang);
    }

    /* ── 菜单部件 ── */

    renderLevelGrid() {
        const grid = this.el['level-grid'];
        if (!grid) return;
        grid.textContent = '';
        for (let i = 0; i < LUMEN_LEVELS.length; i++) {
            const lv = LUMEN_LEVELS[i];
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'lm-level-chip game-start-level-chip';
            // 一章一行（5 列网格 × 5 关），章节色只调边框 / 编号颜色
            chip.dataset.chapter = String(lv.chapter);
            const label = this.levelLabel(i);
            chip.title = `${this.chapterName(lv.chapter)} · ${label}`;
            chip.setAttribute('aria-label', chip.title);
            const num = document.createElement('span');
            num.className = 'lm-chip-num game-start-chip-num';
            num.textContent = label;
            const starLine = document.createElement('span');
            starLine.className = 'lm-chip-stars game-start-chip-stars';
            const n = this.stars[i] || 0;
            starLine.textContent = n > 0 ? '⭐'.repeat(n) : '☆☆☆';
            chip.append(num, starLine);
            chip.addEventListener('click', () => {
                Sfx.click();
                this.startLevel(i);
            });
            grid.appendChild(chip);
        }
    }

    chapterName(ch) {
        const c = CHAPTERS[ch];
        return c ? c.name[this.lang] || c.name.en : '';
    }

    /** 关卡编号「章-关」，如 2-3 */
    levelLabel(i) {
        return `${Math.floor(i / LEVELS_PER_CHAPTER) + 1}-${(i % LEVELS_PER_CHAPTER) + 1}`;
    }

    updateDailyBest() {
        if (!this.el['daily-best']) return;
        const best = Number(storageGet('lm_daily_' + todayKey())) || 0;
        this.el['daily-best'].textContent = best
            ? `📅 ${this.TEXT.bestToday}: ${best} ${this.TEXT.flipsWord}`
            : '';
    }

    updateSideRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        const t = this.TEXT;
        const best = Number(storageGet('lm_daily_' + todayKey())) || 0;
        const totalStars = this.stars.reduce((a, b) => a + (b || 0), 0);
        const rows = [
            [`📅 ${t.bestToday}`, best ? `${best} ${t.flipsWord}` : '—'],
            [`⭐ ${t.stars}`, `${totalStars}/${LUMEN_LEVELS.length * 3}`],
        ];
        CHAPTERS.forEach((ch, ci) => {
            const slice = this.stars.slice(ci * LEVELS_PER_CHAPTER, (ci + 1) * LEVELS_PER_CHAPTER);
            const got = slice.reduce((a, b) => a + (b || 0), 0);
            rows.push([`${ci + 1} · ${this.chapterName(ci)}`, `${got}/${LEVELS_PER_CHAPTER * 3}`]);
        });
        box.textContent = '';
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'lm-side-row game-side-row';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            const valueEl = document.createElement('b');
            valueEl.textContent = value;
            row.append(labelEl, valueEl);
            box.appendChild(row);
        });
    }

    /* ── 关卡装载与模式 ── */

    /** 装入一个关卡对象（章节关或每日共用） */
    useLevel(lv) {
        this.level = lv;
        this.baseGrid = lv.grid;
        this.grid = lv.grid.slice();
        this.par = lv.par;
        this.flips = 0;
        this.trace = traceGrid(this.grid, lv.split);
        this.particles.length = 0;
        this.ripples.length = 0;
        this.flipAnims.clear();
        this.buildLinkGeometry();
    }

    loadLevel(idx) {
        const lv = LUMEN_LEVELS[clamp(idx, 0, LUMEN_LEVELS.length - 1)];
        this.levelIdx = lv.index;
        this.mode = 'levels';
        this.useLevel(lv);
    }

    /** 渲染查表：联动镜 idx → 组号、分光镜 idx 集合 */
    buildLinkGeometry() {
        this.linkOf = new Map();
        this.splitSet = new Set(this.level?.split || []);
        (this.level?.links || []).forEach((group, gi) => group.forEach(idx => this.linkOf.set(idx, gi)));
    }

    /** 关卡模式启动点（AUGMENT 启动参数 [0]） */
    startLevel(idx) {
        clearTimeout(this.solveTimer);
        this.loadLevel(idx);
        this.state = 'playing'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.pauseOwnership?.invalidate();
        this.hideOverlays();
        this.updateHud();
        const lv = LUMEN_LEVELS[this.levelIdx];
        if (lv.intro) this.showToast(this.TEXT[`intro_${lv.intro}`], 3600);
        track('lumen', 'play');
    }

    startDaily() {
        clearTimeout(this.solveTimer);
        const d = dailyLevel(todayKey());
        this.mode = 'daily';
        this.daily = d;
        this.useLevel(d);
        this.state = 'playing'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.pauseOwnership?.invalidate();
        this.hideOverlays();
        this.updateHud();
        this.showToast(this.TEXT.dailyStartToast, 1800);
        track('lumen', 'play');
    }

    resetLevel() {
        if (this.state !== 'playing') return;
        clearTimeout(this.solveTimer);
        this.grid = this.baseGrid.slice();
        this.trace = traceGrid(this.grid, this.level.split);
        this.flips = 0;
        this.particles.length = 0;
        this.flipAnims.clear();
        this.updateHud();
        Sfx.click();
    }

    showMenu() {
        this.pauseOwnership?.invalidate();
        clearTimeout(this.solveTimer);
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
        this.loadLevel(this.levelIdx);   // 菜单背景继续展示当前关的光路
        if (this.el.start) this.el.start.classList.remove('hidden');
        if (this.el.clear) this.el.clear.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
        this.updateDailyBest();
        this.renderLevelGrid();
        this.updateHud();
    }

    hideOverlays() {
        if (this.el.start) this.el.start.classList.add('hidden');
        if (this.el.clear) this.el.clear.classList.add('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
    }

    /* ── HUD 与提示 ── */

    updateHud() {
        const t = this.TEXT;
        if (this.el['hud-level']) {
            this.el['hud-level'].textContent = this.mode === 'daily'
                ? `📅 ${t.daily}`
                : `${t.level} ${this.levelLabel(this.levelIdx)}`;
        }
        if (this.el.flips) this.el.flips.textContent = String(this.flips);
        if (this.el.par) this.el.par.textContent = `· ${t.par} ${this.par}`;
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

    /* ── 核心交互：点击镜面（联动组整组翻转） ── */

    flipMirror(r, c) {
        const tap = tapGrid(this.level, this.grid, r, c);
        if (!tap) return;
        for (const idx of tap.cells) {
            const r2 = Math.floor(idx / GRID_N), c2 = idx % GRID_N;
            const prev = this.flipAnims.get(idx);
            const from = prev ? this.animAngle(prev) : mirrorAngle(this.grid[r2][c2]);
            this.flipAnims.set(idx, { from, to: mirrorAngle(tap.grid[r2][c2]), age: 0 });
            const gi = this.linkOf.get(idx);
            const { x, y } = cellCenter(r2, c2);
            this.ripples.push({ x, y, color: gi === undefined ? '#8fb7ff' : LINK_COLORS[gi % LINK_COLORS.length], age: 0 });
        }
        this.grid = tap.grid;
        this.flips += 1;

        const beforeLit = new Set(this.trace.crystalLit);
        const beforeShadow = new Set(this.trace.shadowLit);
        this.trace = traceGrid(this.grid, this.level.split);
        const gained = this.trace.crystalLit.filter(idx => !beforeLit.has(idx));
        const newShadows = this.trace.shadowLit.filter(idx => !beforeShadow.has(idx));
        Sfx.flip();
        if (gained.length) {
            Sfx.crystal();
            for (const idx of gained) {
                const p = cellCenter(Math.floor(idx / GRID_N), idx % GRID_N);
                this.burst(p.x, p.y, '#7dfad0', 14);
            }
        }
        if (newShadows.length) {
            Sfx.shadow();
            vibrate(30);
            for (const idx of newShadows) {
                const p = cellCenter(Math.floor(idx / GRID_N), idx % GRID_N);
                this.burst(p.x, p.y, '#ff4d6d', 16);
            }
            this.showToast(this.TEXT.shadowWarn, 1600, true);
        }
        this.updateHud();

        if (this.trace.solved) {
            Sfx.win();
            vibrate([18, 60, 18]);
            // 让光束动画走一小段再弹结算，点亮感更完整
            this.solveTimer = setTimeout(() => this.finishSolved(), 650);
        }
    }

    finishSolved() {
        if (this.state !== 'playing' || !this.trace || !this.trace.solved) return;
        if (this.mode === 'daily') this.finishDaily();
        else this.finishLevel();
    }

    /* ── 结算：关卡 ── */

    finishLevel() {
        const t = this.TEXT;
        const stars = starsFor(this.flips, this.par);
        if (stars > (this.stars[this.levelIdx] || 0)) {
            this.stars[this.levelIdx] = stars;
            storageSaveStars(this.stars);
        }
        this.state = 'won-level'; this.contextualRestart?.sync();
        if (stars >= 3) Sfx.star3();
        if (this.el['clear-stars']) {
            this.el['clear-stars'].textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
        }
        if (this.el['clear-line']) {
            this.el['clear-line'].textContent = `${t.flips} ${this.flips} · ${t.par} ${this.par}`;
        }
        if (this.el.clear) this.el.clear.classList.remove('hidden');
        this.updateSideRecords();
        track('lumen', 'finish');
    }

    nextLevel() {
        if (this.levelIdx + 1 >= LUMEN_LEVELS.length) {
            this.showMenu();
            this.showToast(this.TEXT.levelDone, 2200);
        } else {
            this.startLevel(this.levelIdx + 1);
        }
    }

    /* ── 结算：每日 ── */

    finishDaily() {
        const t = this.TEXT;
        const date = todayKey();
        const score = this.flips;
        this.state = 'won-daily'; this.contextualRestart?.sync();
        const prev = Number(storageGet('lm_daily_' + date)) || 0;
        const isBest = !prev || score < prev;
        if (isBest) storageSet('lm_daily_' + date, String(score));

        if (this.el['over-title']) this.el['over-title'].textContent = `📅 ${t.dailyDone}`;
        if (this.el['over-score']) this.el['over-score'].textContent = `${score} ${t.flipsWord}`;
        if (this.el['over-sub']) {
            this.el['over-sub'].textContent = isBest
                ? `🌟 ${t.bestToday}`
                : `${t.bestToday}: ${Math.min(prev, score)}`;
        }
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';
        if (this.el.over) this.el.over.classList.remove('hidden');
        this.updateDailyBest();
        this.updateSideRecords();
        track('lumen', 'finish');

        const game = `lumen-d${date}`;
        // 网络层收敛到 src/platform/leaderboard.js（false=未进全球榜，走本地兜底）
        submitScore({ game, name: ensurePlayerName() || 'Anonymous', score }).then(ok => {
            if (ok) return this.fetchDailyBoard(game);
            this.pushLocalScore(date, score);
            this.renderLocalBoard();
            if (this.el['lb-status']) this.el['lb-status'].textContent = t.lbOffline;
        });
    }

    localBoardKey() {
        return `lm_local_${todayKey()}`;
    }

    pushLocalScore(date, score) {
        let local = [];
        try {
            local = JSON.parse(storageGet(`lm_local_${date}`)) || [];
        } catch (e) { local = []; }
        local.push({ name: ensurePlayerName() || 'Anonymous', score });
        local.sort((a, b) => a.score - b.score);
        storageSet(`lm_local_${date}`, JSON.stringify(local.slice(0, 10)));
    }

    renderLocalBoard() {
        const list = this.el['lb-list'];
        if (!list) return;
        list.textContent = '';
        let local = [];
        try {
            local = JSON.parse(storageGet(this.localBoardKey())) || [];
        } catch (e) { local = []; }
        if (!Array.isArray(local) || local.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'lm-lb-empty game-lb-empty';
            empty.textContent = this.TEXT.noScores;
            list.appendChild(empty);
            return;
        }
        local.slice(0, 10).forEach((s, i) => list.appendChild(this.buildLbRow(i, s)));
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'lm-lb-row game-lb-row' + (rank < 3 ? ` lm-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'lm-lb-rank game-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'lm-lb-name game-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'lm-lb-score game-lb-score';
        scoreEl.textContent = `${entry.score}`;
        row.append(rankEl, nameEl, scoreEl);
        return row;
    }

    async fetchDailyBoard(game) {
        const list = this.el['lb-list'];
        const statusEl = this.el['lb-status'];
        if (!list) return;
        try {
            const data = await fetchBoard(game);
            if (this.state !== 'won-daily' || !this.el.over || this.el.over.classList.contains('hidden')) return;
            list.textContent = '';
            if (!Array.isArray(data) || data.length === 0) {
                this.renderLocalBoard();
                return;
            }
            data.slice(0, 10).forEach((entry, i) => list.appendChild(this.buildLbRow(i, entry)));
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            this.renderLocalBoard();
            if (statusEl) statusEl.textContent = this.TEXT.lbOffline;
        }
    }

    async copyResult() {
        const t = this.TEXT;
        let ok = false;
        const text = `折光 Lumen · ${todayKeyDisplay()} · ${this.flips} ${t.flipsWord} (${t.par} ${this.par})`;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch (e) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand('copy');
                ta.remove();
            } catch (e2) { /* 放弃 */ }
        }
        const btn = this.el['btn-copy'];
        if (btn) {
            const original = `${ICONS.copy}<span>${t.copyResult}</span>`;
            btn.textContent = ok ? `✅ ${t.copied}` : `📋 ${t.copyResult}`;
            setTimeout(() => { if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = original; }, 1200);
        }
    }

    /* ── 音量 ── */

    toggleMute() {
        setMuted(!getMuted());
        this.updateMuteButtons();
    }

    updateMuteButtons() {
        const muted = getMuted();
        const t = this.TEXT;
        ['mute-btn', 'start-mute'].forEach(k => {
            const btn = this.el[k];
            if (!btn) return;
            btn.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
            btn.title = t.sound;
            btn.setAttribute('aria-label', t.sound);
            btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        });
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

    /* ── 输入 ── */

    toLogical(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H,
        };
    }

    bindInput() {
        this.canvas.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing') return;
            e.preventDefault();
            const p = this.toLogical(e);
            const c = Math.floor(p.x / CELL);
            const r = Math.floor(p.y / CELL);
            if (r < 0 || r >= GRID_N || c < 0 || c >= GRID_N) return;
            const ch = this.grid[r][c];
            if (ch === '/' || ch === '\\') this.flipMirror(r, c);
        });
    }

    bindUI() {
        if (this.el['btn-home']) {
            this.el['btn-home'].addEventListener('click', () => { window.location.href = 'index.html'; });
        }
        if (this.el['btn-levels']) {
            this.el['btn-levels'].addEventListener('click', () => {
                Sfx.click();
                this.startLevel(0);
            });
        }
        if (this.el['btn-daily']) {
            this.el['btn-daily'].addEventListener('click', () => {
                Sfx.click();
                this.startDaily();
            });
        }
        if (this.el['reset-btn']) {
            this.contextualRestart = bindContextualRestart({
                button: this.el['reset-btn'],
                active: () => this.state === 'playing' && !this.isPaused,
                hasProgress: () => this.flips > 0,
                restart: () => { this.resetLevel(); },
            });
        }
        if (this.el['btn-next']) {
            this.el['btn-next'].addEventListener('click', () => {
                Sfx.click();
                this.nextLevel();
            });
        }
        if (this.el['btn-replay']) {
            this.el['btn-replay'].addEventListener('click', () => {
                Sfx.click();
                this.startLevel(this.levelIdx);
            });
        }
        if (this.el['btn-menu1']) {
            this.el['btn-menu1'].addEventListener('click', () => { Sfx.click(); this.showMenu(); });
        }
        if (this.el['btn-menu2']) {
            this.el['btn-menu2'].addEventListener('click', () => { Sfx.click(); this.showMenu(); });
        }
        if (this.el['btn-again']) {
            this.el['btn-again'].addEventListener('click', () => {
                Sfx.click();
                this.startDaily();
            });
        }
        if (this.el['btn-copy']) {
            this.el['btn-copy'].addEventListener('click', () => this.copyResult());
        }
        if (this.el['mute-btn']) {
            this.el['mute-btn'].addEventListener('click', () => this.toggleMute());
        }
        if (this.el['start-mute']) {
            this.el['start-mute'].addEventListener('click', () => this.toggleMute());
        }
        if (this.el.username) {
            this.el.username.addEventListener('change', () => {
                setPlayerName(this.el.username.value);
            });
        }

        // 全站语言/静音设置变化（site-settings.js 派发）→ 本页重刷
        window.addEventListener('site-settings:changed', () => this.applyLanguage());
    }

    /* ── 粒子与背景 ── */

    buildStarfield() {
        const out = [];
        for (let i = 0; i < 70; i++) {
            out.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: 0.5 + Math.random() * 1.1,
                a: 0.15 + Math.random() * 0.5,
            });
        }
        return out;
    }

    burst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= 130) this.particles.shift();
            const ang = Math.random() * Math.PI * 2;
            const spd = 30 + Math.random() * 130;
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 0.4 + Math.random() * 0.4,
                age: 0,
                size: 1.3 + Math.random() * 2.2,
                color,
            });
        }
    }

    /* ── 画布尺寸 ── */

    resize() {
        const cssW = this.canvas.clientWidth || 300;
        const scale = cssW / W;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = scale * dpr;
        const pw = Math.round(W * renderScale);
        if (this.canvas.width !== pw) {
            this.canvas.width = pw;
            this.canvas.height = Math.round(H * renderScale);
        }
        this.renderScale = renderScale;
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
            this.time += dt;

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
            for (const [idx, a] of this.flipAnims) {
                a.age += dt;
                if (a.age >= FLIP_DUR) this.flipAnims.delete(idx);
            }
            let rw = 0;
            for (const rp of this.ripples) {
                rp.age += dt;
                if (rp.age < RIPPLE_DUR) this.ripples[rw++] = rp;
            }
            this.ripples.length = rw;

            this.draw();
        };
        this.animationId = requestAnimationFrame(tick);
    }

    /* ── 渲染 ── */

    draw() {
        const ctx = this.ctx;
        const s = this.renderScale;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // 深空底
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0a0f2e');
        bg.addColorStop(0.55, '#0b1030');
        bg.addColorStop(1, '#0d1338');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // 星点
        for (const st of this.starsBg) {
            ctx.globalAlpha = st.a * (0.75 + 0.25 * Math.sin(this.time * 0.8 + st.x));
            ctx.fillStyle = '#cdd8ff';
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        if (!this.grid) return;

        // 网格线
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < GRID_N; i++) {
            ctx.moveTo(i * CELL, 0);
            ctx.lineTo(i * CELL, H);
            ctx.moveTo(0, i * CELL);
            ctx.lineTo(W, i * CELL);
        }
        ctx.stroke();

        this.drawLitFloor(ctx);
        this.drawLinkTethers(ctx);
        this.drawRays(ctx);

        // 元件（墙 → 水晶 / 暗晶 → 镜面 → 发射器）
        for (let r = 0; r < GRID_N; r++) {
            for (let c = 0; c < GRID_N; c++) {
                const ch = this.grid[r][c];
                if (ch === '#') this.drawWall(ctx, r, c);
            }
        }
        for (let r = 0; r < GRID_N; r++) {
            for (let c = 0; c < GRID_N; c++) {
                const ch = this.grid[r][c];
                if (ch === '*') {
                    this.drawCrystal(ctx, r, c, this.trace.crystalLit.includes(r * GRID_N + c));
                } else if (ch === 'x') {
                    this.drawShadow(ctx, r, c, this.trace.shadowLit.includes(r * GRID_N + c));
                }
            }
        }
        for (let r = 0; r < GRID_N; r++) {
            for (let c = 0; c < GRID_N; c++) {
                const ch = this.grid[r][c];
                if (ch === '/' || ch === '\\') {
                    const idx = r * GRID_N + c;
                    const hit = this.trace.mirrorHits.includes(idx);
                    if (this.splitSet.has(idx)) this.drawSplitter(ctx, r, c, ch, hit);
                    else this.drawMirror(ctx, r, c, ch, hit);
                } else if (ch in STEP) {
                    this.drawEmitter(ctx, r, c, ch);
                }
            }
        }

        this.drawRipples(ctx);
        this.drawParticles(ctx);
    }

    animAngle(a) {
        const k = clamp(a.age / FLIP_DUR, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        return a.from + (a.to - a.from) * e;
    }

    /** 当前绘制角度：转动补间中取插值，否则按字符朝向 */
    angleAt(r, c, ch) {
        const a = this.flipAnims.get(r * GRID_N + c);
        return a ? this.animAngle(a) : mirrorAngle(ch);
    }

    /** 联动组的虚线系绳：同组镜面按行序依次相连 */
    drawLinkTethers(ctx) {
        const links = this.level?.links;
        if (!links || !links.length) return;
        ctx.save();
        ctx.lineWidth = 1.6;
        ctx.setLineDash([3, 6]);
        ctx.lineDashOffset = -this.time * 12;
        links.forEach((group, gi) => {
            ctx.strokeStyle = LINK_COLORS[gi % LINK_COLORS.length];
            ctx.globalAlpha = 0.32;
            ctx.beginPath();
            group.forEach((idx, i) => {
                const p = cellCenter(Math.floor(idx / GRID_N), idx % GRID_N);
                if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
            });
            ctx.stroke();
        });
        ctx.restore();
    }

    /** 联动镜底座：组色光环 + 顶端小圆点 */
    drawLinkRing(ctx, r, c) {
        const gi = this.linkOf.get(r * GRID_N + c);
        if (gi === undefined) return;
        const color = LINK_COLORS[gi % LINK_COLORS.length];
        const { x, y } = cellCenter(r, c);
        const rad = CELL * 0.4;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        for (let k = 0; k <= gi; k++) {
            ctx.beginPath();
            ctx.arc(x - (gi * 3.5) + k * 7, y - rad, 2.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /** 暗晶：紫黑色晶体；被照到时转红、抖动、裂纹，提示「这里不该有光」 */
    drawShadow(ctx, r, c, lit) {
        const { x, y } = cellCenter(r, c);
        const s = CELL * 0.26;
        ctx.save();
        if (lit) {
            const jitter = Math.sin(this.time * 60 + r * 7 + c) * 0.9;
            ctx.translate(x + jitter, y);
        } else {
            ctx.translate(x, y);
        }
        ctx.rotate(Math.PI / 4);
        if (lit) {
            const pulse = 0.75 + 0.25 * Math.sin(this.time * 9);
            ctx.shadowColor = 'rgba(255, 77, 109, 0.95)';
            ctx.shadowBlur = 18 * pulse;
            ctx.fillStyle = 'rgba(120, 18, 40, 0.95)';
            ctx.strokeStyle = '#ff4d6d';
        } else {
            ctx.shadowColor = 'rgba(138, 92, 255, 0.45)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = 'rgba(16, 8, 30, 0.95)';
            ctx.strokeStyle = 'rgba(160, 120, 255, 0.75)';
        }
        ctx.lineWidth = 2;
        roundRectPath(ctx, -s, -s, s * 2, s * 2, 4);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 内核：暗时是一颗深色小核，亮时变成十字裂纹
        ctx.strokeStyle = lit ? 'rgba(255, 200, 210, 0.9)' : 'rgba(160, 120, 255, 0.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        if (lit) {
            ctx.moveTo(-s * 0.7, -s * 0.15); ctx.lineTo(s * 0.1, 0); ctx.lineTo(s * 0.6, s * 0.55);
            ctx.moveTo(s * 0.1, 0); ctx.lineTo(s * 0.2, -s * 0.7);
        } else {
            ctx.rect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
        }
        ctx.stroke();
        ctx.restore();
    }

    /** 分光镜：半透明的金色玻璃片（双线 + 半透明填充），区别于实心镜面 */
    drawSplitter(ctx, r, c, ch, hit) {
        const { x, y } = cellCenter(r, c);
        const half = CELL * 0.32;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angleAt(r, c, ch));
        ctx.shadowColor = hit ? 'rgba(255, 217, 138, 0.95)' : 'rgba(255, 196, 92, 0.45)';
        ctx.shadowBlur = hit ? 14 : 7;
        ctx.fillStyle = hit ? 'rgba(255, 226, 160, 0.4)' : 'rgba(255, 210, 120, 0.2)';
        roundRectPath(ctx, -half, -3.6, half * 2, 7.2, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = hit ? '#fff1c9' : '#ffd98a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-half, -3.6); ctx.lineTo(half, -3.6);
        ctx.moveTo(-half, 3.6); ctx.lineTo(half, 3.6);
        ctx.stroke();
        // 中线点阵：光一半穿过、一半反射
        ctx.fillStyle = 'rgba(255, 245, 220, 0.9)';
        for (let k = -2; k <= 2; k++) {
            ctx.beginPath();
            ctx.arc(k * half * 0.4, 0, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        this.drawLinkRing(ctx, r, c);
    }

    drawRipples(ctx) {
        ctx.save();
        for (const rp of this.ripples) {
            const k = rp.age / RIPPLE_DUR;
            ctx.globalAlpha = (1 - k) * 0.8;
            ctx.strokeStyle = rp.color;
            ctx.lineWidth = 2.2 * (1 - k) + 0.6;
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, CELL * (0.22 + 0.36 * k), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** 光路经过的空格铺一层淡光底（增强「光走过了这里」的体感） */
    drawLitFloor(ctx) {
        ctx.fillStyle = 'rgba(125, 250, 208, 0.055)';
        for (let r = 0; r < GRID_N; r++) {
            for (let c = 0; c < GRID_N; c++) {
                if (this.trace.lit[r * GRID_N + c]) {
                    ctx.fillRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
                }
            }
        }
    }

    drawRays(ctx) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const geoms = [];
        for (const ray of this.trace.rays) {
            if (ray.pts.length < 2) continue;
            const geom = polylineGeom(ray.pts);
            geoms.push(geom);
            ctx.beginPath();
            geom.px.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.shadowColor = 'rgba(125, 250, 208, 0.9)';
            ctx.shadowBlur = 14;
            ctx.strokeStyle = 'rgba(125, 250, 208, 0.5)';
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(240, 255, 250, 0.95)';
            ctx.lineWidth = 1.8;
            ctx.stroke();
        }
        // 流动光点：沿折线匀速推进（能量在光路里流动的体感）
        for (const geom of geoms) {
            const n = Math.max(1, Math.round(geom.total / 90));
            for (let k = 0; k < n; k++) {
                const p = pointAtDist(geom, this.time * 130 + k * (geom.total / n));
                ctx.fillStyle = 'rgba(220, 255, 245, 0.9)';
                ctx.shadowColor = 'rgba(125, 250, 208, 1)';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }
        ctx.restore();
    }

    drawWall(ctx, r, c) {
        const x = c * CELL, y = r * CELL;
        ctx.fillStyle = 'rgba(22, 28, 62, 0.95)';
        ctx.strokeStyle = 'rgba(154, 166, 216, 0.28)';
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 7);
        ctx.fill();
        ctx.stroke();
    }

    drawCrystal(ctx, r, c, lit) {
        const { x, y } = cellCenter(r, c);
        const s = CELL * 0.26;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        if (lit) {
            const pulse = 0.85 + 0.15 * Math.sin(this.time * 3 + (r + c));
            ctx.shadowColor = 'rgba(125, 250, 208, 0.95)';
            ctx.shadowBlur = 16 * pulse;
            ctx.fillStyle = '#eafff6';
            ctx.strokeStyle = '#7dfad0';
        } else {
            // 未点亮：淡青描边（「等着被照亮」），与紫黑色的暗晶区分开
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(125, 250, 208, 0.07)';
            ctx.strokeStyle = 'rgba(125, 250, 208, 0.42)';
        }
        ctx.lineWidth = 2;
        roundRectPath(ctx, -s, -s, s * 2, s * 2, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    drawMirror(ctx, r, c, ch, hit) {
        const { x, y } = cellCenter(r, c);
        const half = CELL * 0.3;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angleAt(r, c, ch));
        ctx.shadowColor = hit ? 'rgba(125, 250, 208, 0.9)' : 'rgba(90, 123, 255, 0.4)';
        ctx.shadowBlur = hit ? 14 : 7;
        ctx.strokeStyle = hit ? '#aefee0' : '#8fb7ff';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-half, 0);
        ctx.lineTo(half, 0);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-half, 0);
        ctx.lineTo(half, 0);
        ctx.stroke();
        ctx.restore();
        this.drawLinkRing(ctx, r, c);
    }

    drawEmitter(ctx, r, c, ch) {
        const { x, y } = cellCenter(r, c);
        const s = CELL * 0.3;
        ctx.save();
        ctx.translate(x, y);
        ctx.shadowColor = 'rgba(125, 250, 208, 0.8)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = 'rgba(18, 30, 46, 0.95)';
        ctx.strokeStyle = '#7dfad0';
        ctx.lineWidth = 2;
        roundRectPath(ctx, -s, -s, s * 2, s * 2, 8);
        ctx.fill();
        ctx.stroke();
        // 出光口：指向发射方向的小三角
        const [dr, dc] = STEP[ch];
        const ux = dc, uy = dr;
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#aefee0';
        ctx.beginPath();
        ctx.moveTo(ux * s * 0.75, uy * s * 0.75);
        ctx.lineTo(ux * s * 0.1 - uy * s * 0.34, uy * s * 0.1 + ux * s * 0.34);
        ctx.lineTo(ux * s * 0.1 + uy * s * 0.34, uy * s * 0.1 - ux * s * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawParticles(ctx) {
        for (const p of this.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

/* ────────────────────────── boot ────────────────────────── */
