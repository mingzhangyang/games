/**
 * Circuit 电路谜题 — 中学物理电路解谜
 * =====================================
 * 玩法：点击开关接通/切断电流，(SPDT) 切换选路，让全部目标灯泡点亮。
 * 小心短路——电池两极被纯导线直连时全灯熄灭（红闪警告）。
 *
 * 关卡数据 / 电路求解在 js/circuit-levels.js（纯模块，校验器共用）：
 *   - 20 手工关卡（拓扑合法、初盘未解由 verify-circuit-levels.mjs 锁定）
 *   - 求解器：节点电压法（导线等电位节点 + 单位电阻灯泡边 + 电池定压）
 *   - 每日谜题：FNV-1a('circuit-'+UTC+8 日期) 选关 × mulberry32 重掷开关初态
 *
 * 共享层契约：game-frame / game-drawer / game-chrome / leaderboard / daily /
 * i18n / safe-storage / analytics / game-sfx / boot。
 */

import {
    GRID_COLS,
    GRID_ROWS,
    LEVELS,
    dailyLevel,
    solveCircuit,
    isCircuitSolved,
    operableIndexes,
    endpointsOf,
    jk,
    buildConductionUF,
} from './circuit-levels.js';
import { ensurePlayerName, setPlayerName } from './player.js';
import { getLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { updateMoreGames, renderMoreGames } from './more-games.js';
import { createStatsDrawer } from './game-drawer.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { storageGet, storageSet } from './safe-storage.js';
import { track } from './analytics.js';
import { todayKey, todayKeyDisplay } from './daily.js';
import { submitScore, fetchBoard } from './leaderboard.js';
import { makeText } from './i18n.js';
import { onReady } from './boot.js';
import { createSfxEngine } from './game-sfx.js';

/* ────────────────────────── 常量与几何 ────────────────────────── */

const W = 560, H = 420;
const CW = W / GRID_COLS;   // 40
const CH = H / GRID_ROWS;   // 42
const HIT_R = 26;           // 开关命中半径（≥44px 触控目标：直径 52）

const AMBER = '#ffc94d';
const AMBER_SOFT = '#ffe9b0';
const DIM_WIRE = '#3a4a78';
const RED = '#e24b4a';

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function vibrate(pattern) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* 不支持则忽略 */ }
}

/** 元件端点像素坐标（e/w=水平中线，n/s=垂直中线） */
function endPx(el, side) {
    const cx = (el.c + 0.5) * CW;
    const cy = (el.r + 0.5) * CH;
    if (side === 'e') return { x: cx + CW / 2, y: cy };
    if (side === 'w') return { x: cx - CW / 2, y: cy };
    if (side === 's') return { x: cx, y: cy + CH / 2 };
    return { x: cx, y: cy - CH / 2 };
}

function cellCenter(r, c) {
    return { x: (c + 0.5) * CW, y: (r + 0.5) * CH };
}

function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = makeText({
    en: {
        stats: 'Stats',
        title: 'Circuit',
        subtitle: 'Switch · Wire · Light',
        howto: 'Tap a switch to open or close it and route the current from the battery. Light every target bulb — but never link both battery terminals with plain wire, or everything goes dark!',
        playLevels: '🧩 Levels',
        playDaily: '📅 Daily',
        level: 'Level',
        daily: 'Daily',
        levelSelect: 'Select level',
        moves: 'Moves',
        movesWord: 'moves',
        par: 'Par',
        dailyStartToast: '📅 Daily puzzle — light every target bulb in as few moves as possible',
        shortToast: '⚡ Short circuit — every bulb goes dark!',
        retry: 'Retry',
        next: 'Next',
        menu: 'Home',
        again: 'Again',
        levelCleared: 'All lit!',
        levelDone: 'All levels cleared!',
        dailyDone: 'Daily complete!',
        bestToday: 'Your best today',
        stars: 'Stars',
        leaderboard: 'Global · Today\'s Puzzle',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        resetTitle: 'Reset',
        home: 'Home',
        hint: 'Tap switches to route the current · light every target bulb',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
    },
    zh: {
        stats: '数据统计',
        title: '电路谜题',
        subtitle: '开关 · 电流 · 点亮',
        howto: '点击开关接通或切断电流，让电池的电流流过每一条支路。点亮所有目标灯泡——但别用纯导线直接连住电池两极，短路会让全场熄灭！',
        playLevels: '🧩 关卡模式',
        playDaily: '📅 每日挑战',
        level: '关卡',
        daily: '每日',
        levelSelect: '选择关卡',
        moves: '步数',
        movesWord: '步',
        par: '目标',
        dailyStartToast: '📅 每日挑战——用尽可能少的操作点亮全部目标灯泡',
        shortToast: '⚡ 短路啦——所有灯泡都熄灭了！',
        retry: '重试',
        next: '下一关',
        menu: '返回主页',
        again: '再来一次',
        levelCleared: '全部点亮！',
        levelDone: '全部关卡通关！',
        dailyDone: '每日挑战完成！',
        bestToday: '今日最好成绩',
        stars: '星星',
        leaderboard: '全球榜 · 今日谜题',
        noScores: '暂无成绩',
        lbOffline: '榜单离线',
        copyResult: '复制',
        resetTitle: '重开本关',
        home: '主页',
        hint: '点击开关调度电流 · 点亮全部目标灯泡',
        sideHowTo: '玩法说明',
        sideRecords: '战绩',
    }
});
/* ────────────────────────── audio ────────────────────────── */

const sfxEngine = createSfxEngine();

const Sfx = {
    click() { sfxEngine.tone({ freq: 640, type: 'square', dur: 0.05, vol: 0.06 }); },
    /** 开关咔哒：短促机械双态音 */
    flip() {
        sfxEngine.tone({ freq: 300, slideTo: 520, type: 'square', dur: 0.05, vol: 0.11 });
    },
    /** 短路：低频下滑锯齿 + 电火花感 */
    spark() {
        sfxEngine.tone({ freq: 220, slideTo: 65, type: 'sawtooth', dur: 0.32, vol: 0.16 });
        sfxEngine.tone({ freq: 1400, slideTo: 300, type: 'square', dur: 0.1, vol: 0.07, delay: 0.02 });
    },
    /** 新灯泡点亮：上扬双音 */
    bulb() {
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

/* ────────────────────────── 存储 ────────────────────────── */

function storageParseStars() {
    try {
        const arr = JSON.parse(storageGet('cc_stars'));
        const out = Array.isArray(arr) ? arr.slice() : [];
        while (out.length < LEVELS.length) out.push(0);
        return out;
    } catch (e) {
        return new Array(LEVELS.length).fill(0);
    }
}

/* ────────────────────────── 游戏主体 ────────────────────────── */

class CircuitGame {
    constructor() {
        this.canvas = document.getElementById('cc-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        ['cc-btn-home', 'cc-hud-level', 'cc-moves', 'cc-par', 'cc-reset-btn', 'cc-mute-btn', 'cc-toast',
            'cc-start', 'cc-title', 'cc-subtitle', 'cc-howto', 'cc-btn-levels', 'cc-btn-daily',
            'cc-level-label', 'cc-level-grid', 'cc-daily-best', 'cc-start-mute',
            'cc-side-howto-title', 'cc-side-howto', 'cc-side-records-title', 'cc-side-records',
            'cc-clear', 'cc-clear-stars', 'cc-clear-line', 'cc-btn-next', 'cc-btn-replay', 'cc-btn-menu1',
            'cc-over', 'cc-over-title', 'cc-over-score', 'cc-over-sub',
            'cc-btn-again', 'cc-btn-copy', 'cc-btn-menu2',
            'cc-lb-title', 'cc-lb-list', 'cc-lb-status', 'cc-username', 'cc-username-label',
            'cc-hint'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^cc-/, '')] = el;
        });

        this.lang = getLang();
        this.stars = storageParseStars();

        // 对局状态：menu | playing | won-level | won-daily
        // ⚠️ 字段名与 verify-stats-drawer.mjs 的 AUGMENT runningExpr 严格对应
        this.state = 'menu';
        this.isPaused = false;
        this.mode = 'levels';
        this.levelIdx = 0;
        this.par = 1;
        this.moves = 0;
        this.baseSpec = null;   // 本关初盘（Reset 用）
        this.spec = null;       // 当前盘面（元素数组）
        this.states = [];       // 可操作元件态（与 operableIndexes 对齐）
        this.baseStates = [];   // 初态（Reset 用）
        this.sol = null;        // solveCircuit 结果 { short, lit }
        this.daily = null;      // 每日谜题 { id, par, elements }

        // 视觉
        this.time = 0;
        this.frameDt = 0;
        this.particles = [];
        this.shortAt = -99;     // 进入短路的时刻（红闪强度随时间衰减）
        this.flipFx = null;     // { idx, start } 杠杆弹摆

        this.animationId = null;
        this.lastFrame = 0;

        this.applyLanguage();
        this.renderLevelGrid();
        this.bindInput();
        this.bindUI();
        this.updateMuteButtons();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        // 桌面舞台尺寸随 --frame-chrome 实测值变化（js/game-frame.js）
        window.addEventListener('game-frame:changed', () => this.resize());

        this.loadLevel(0);   // 菜单背景展示第 1 关的电路
        this.startLoop();
    }

    get TEXT() { return LANGUAGES[this.lang]; }
    /* ── 语言 ── */

    applyLanguage() {
        const t = this.TEXT;
        this.lang = getLang();
        document.documentElement.lang = this.lang;
        document.title = this.lang === 'zh'
            ? '电路谜题 Circuit — Light It Up'
            : 'Circuit — Light It Up';
        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['btn-levels']) this.el['btn-levels'].textContent = t.playLevels;
        if (this.el['btn-daily']) this.el['btn-daily'].textContent = t.playDaily;
        if (this.el['level-label']) this.el['level-label'].textContent = t.levelSelect;
        if (this.el['btn-next']) this.el['btn-next'].innerHTML = `${ICONS.arrowRight}<span>${t.next}</span>`;
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
            this.el['reset-btn'].title = t.resetTitle;
            this.el['reset-btn'].setAttribute('aria-label', t.resetTitle);
        }
        if (this.el['btn-home']) {
            this.el['btn-home'].title = t.home;
            this.el['btn-home'].setAttribute('aria-label', t.home);
        }
        // 桌面侧栏
        if (this.el['side-howto-title']) this.el['side-howto-title'].textContent = `📖 ${t.sideHowTo}`;
        if (this.el['side-howto']) this.el['side-howto'].textContent = t.howto;
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
        for (let i = 0; i < LEVELS.length; i++) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'cc-level-chip';
            const num = document.createElement('span');
            num.className = 'cc-chip-num';
            num.textContent = String(i + 1);
            const starLine = document.createElement('span');
            starLine.className = 'cc-chip-stars';
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

    updateDailyBest() {
        if (!this.el['daily-best']) return;
        const best = Number(storageGet('cc_daily_' + todayKey())) || 0;
        this.el['daily-best'].textContent = best
            ? `📅 ${this.TEXT.bestToday}: ${best} ${this.TEXT.movesWord}`
            : '';
    }

    updateSideRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        const t = this.TEXT;
        const best = Number(storageGet('cc_daily_' + todayKey())) || 0;
        const totalStars = this.stars.reduce((a, b) => a + (b || 0), 0);
        const rows = [
            [`📅 ${t.bestToday}`, best ? `${best} ${t.movesWord}` : '—'],
            [`⭐ ${t.stars}`, `${totalStars}/${LEVELS.length * 3}`],
        ];
        box.textContent = '';
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'cc-side-row game-side-row';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            const valueEl = document.createElement('b');
            valueEl.textContent = value;
            row.append(labelEl, valueEl);
            box.appendChild(row);
        });
    }
    /* ── 关卡装载与模式 ── */

    loadLevel(idx) {
        const i = clamp(idx, 0, LEVELS.length - 1);
        const lv = LEVELS[i];
        this.levelIdx = i;   // LEVELS 元素无 index 字段，星级/进度一律用数组下标
        this.mode = 'levels';
        this.baseSpec = lv;
        this.spec = { id: lv.id, diff: lv.diff, par: lv.par, elements: lv.elements.slice() };
        this.baseStates = initStatesLocal(lv);
        this.states = this.baseStates.slice();
        this.par = lv.par;
        this.moves = 0;
        this.sol = solveCircuit(this.spec, this.states);
        this.particles.length = 0;
        this.flipFx = null;
    }

    /** 关卡模式启动点（AUGMENT 启动参数 [0]） */
    startLevel(idx) {
        clearTimeout(this.solveTimer);
        this.loadLevel(idx);
        this.state = 'playing';
        this.isPaused = false;
        this.hideOverlays();
        this.updateHud();
        track('circuit', 'play');
    }

    startDaily() {
        clearTimeout(this.solveTimer);
        const d = dailyLevel(todayKey());
        this.mode = 'daily';
        this.daily = d;
        this.levelIdx = 0;
        this.spec = { id: d.id, diff: d.diff, par: d.par, elements: d.elements.slice() };
        this.baseStates = initStatesLocal(this.spec);
        this.states = this.baseStates.slice();
        this.par = d.par;
        this.moves = 0;
        this.sol = solveCircuit(this.spec, this.states);
        this.particles.length = 0;
        this.flipFx = null;
        this.state = 'playing';
        this.isPaused = false;
        this.hideOverlays();
        this.updateHud();
        this.showToast(this.TEXT.dailyStartToast, 1800);
        track('circuit', 'play');
    }

    resetLevel() {
        if (this.state !== 'playing') return;
        clearTimeout(this.solveTimer);
        this.states = this.baseStates.slice();
        this.moves = 0;
        this.sol = solveCircuit(this.spec, this.states);
        this.particles.length = 0;
        this.flipFx = null;
        this.updateHud();
        Sfx.click();
    }

    showMenu() {
        clearTimeout(this.solveTimer);
        this.state = 'menu';
        this.isPaused = false;
        this.loadLevel(this.levelIdx);   // 菜单背景继续展示当前关的电路
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
                : `${t.level} ${this.levelIdx + 1}/${LEVELS.length}`;
        }
        if (this.el.moves) this.el.moves.textContent = String(this.moves);
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
    /* ── 电路状态计算 ── */

    /** 导通并查集（引擎渲染「通电」用）：返回 { uf, pos, neg } */
    conduction() {
        const ops = operableIndexes(this.spec);
        const st = new Map();
        ops.forEach((idx, k) => st.set(idx, this.states[k] ? 1 : 0));
        return buildConductionUF(this.spec, st);
    }

    /** 导通类元件是否带电（任一端点与电池正/负极同分量） */
    isEnergized(el, cond) {
        if (!cond || !cond.pos || !cond.neg) return false;
        const pRoot = cond.uf.find(cond.pos);
        const nRoot = cond.uf.find(cond.neg);
        const eps = endpointsOf(el);
        return eps.some((s) => {
            const root = cond.uf.find(jk(el.r, el.c, s));
            return root === pRoot || root === nRoot;
        });
    }

    /* ── 核心交互：拨动开关 ── */

    flipSwitch(stateIdx) {
        this.states[stateIdx] = this.states[stateIdx] ? 0 : 1;
        this.moves += 1;
        this.flipFx = { idx: stateIdx, start: this.time };

        const prevLit = this.sol.lit;
        this.sol = solveCircuit(this.spec, this.states);
        Sfx.flip();
        vibrate(12);

        // 新灯点亮 → 金色粒子
        let gained = 0;
        this.sol.lit.forEach((v, i) => { if (v && prevLit[i] === false) gained += 1; });
        if (gained > 0) {
            Sfx.bulb();
            this.spec.elements.forEach((el, i) => {
                if (el.t === 'bulb' && this.sol.lit[i] && prevLit[i] === false) {
                    const { x, y } = cellCenter(el.r, el.c);
                    this.burst(x, y, AMBER_SOFT, 16);
                }
            });
        }

        // 短路：红闪 + 警告
        if (this.sol.short) {
            this.shortAt = this.time;
            Sfx.spark();
            vibrate([18, 60, 18]);
            this.showToast(this.TEXT.shortToast, 1800, true);
        }

        this.updateHud();

        if (isCircuitSolved(this.spec, this.states)) {
            Sfx.win();
            vibrate([18, 60, 18]);
            this.solveTimer = setTimeout(() => this.finishSolved(), 650);
        }
    }

    finishSolved() {
        if (this.state !== 'playing' || !this.sol) return;
        if (this.mode === 'daily') this.finishDaily();
        else this.finishLevel();
    }

    /* ── 结算：关卡 ── */

    finishLevel() {
        const t = this.TEXT;
        const stars = this.moves <= this.par ? 3 : this.moves <= this.par + 2 ? 2 : 1;
        if (stars > (this.stars[this.levelIdx] || 0)) {
            this.stars[this.levelIdx] = stars;
            storageSet('cc_stars', JSON.stringify(this.stars));
        }
        this.state = 'won-level';
        if (stars >= 3) Sfx.star3();
        if (this.el['clear-stars']) {
            this.el['clear-stars'].textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
        }
        if (this.el['clear-line']) {
            this.el['clear-line'].textContent = `${t.moves} ${this.moves} · ${t.par} ${this.par}`;
        }
        if (this.el.clear) this.el.clear.classList.remove('hidden');
        this.updateSideRecords();
        track('circuit', 'finish');
    }

    nextLevel() {
        if (this.levelIdx + 1 >= LEVELS.length) {
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
        const score = Math.min(this.moves, 99);
        this.state = 'won-daily';
        const prev = Number(storageGet('cc_daily_' + date)) || 0;
        const isBest = !prev || score < prev;
        if (isBest) storageSet('cc_daily_' + date, String(score));

        if (this.el['over-title']) this.el['over-title'].textContent = `📅 ${t.dailyDone}`;
        if (this.el['over-score']) this.el['over-score'].textContent = `${score} ${t.movesWord}`;
        if (this.el['over-sub']) {
            this.el['over-sub'].textContent = isBest
                ? `🌟 ${t.bestToday}`
                : `${t.bestToday}: ${Math.min(prev, score)}`;
        }
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';
        if (this.el.over) this.el.over.classList.remove('hidden');
        this.updateDailyBest();
        this.updateSideRecords();
        track('circuit', 'finish');

        const game = `circuit-d${date}`;
        // 网络层收敛到 js/leaderboard.js（false=未进全球榜，走本地兜底）
        submitScore({ game, name: ensurePlayerName() || 'Anonymous', score }).then(ok => {
            if (ok) return this.fetchDailyBoard(game);
            this.pushLocalScore(date, score);
            this.renderLocalBoard();
            if (this.el['lb-status']) this.el['lb-status'].textContent = t.lbOffline;
        });
    }

    localBoardKey() {
        return `cc_local_${todayKey()}`;
    }

    pushLocalScore(date, score) {
        let local = [];
        try {
            local = JSON.parse(storageGet(`cc_local_${date}`)) || [];
        } catch (e) { local = []; }
        local.push({ name: ensurePlayerName() || 'Anonymous', score });
        local.sort((a, b) => a.score - b.score);
        storageSet(`cc_local_${date}`, JSON.stringify(local.slice(0, 10)));
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
            empty.className = 'cc-lb-empty';
            empty.textContent = this.TEXT.noScores;
            list.appendChild(empty);
            return;
        }
        local.slice(0, 10).forEach((s, i) => list.appendChild(this.buildLbRow(i, s)));
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'cc-lb-row' + (rank < 3 ? ` cc-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'cc-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'cc-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'cc-lb-score';
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
        const text = `电路谜题 Circuit · ${todayKeyDisplay()} · ${this.moves} ${t.movesWord}`;
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

    /** 静默暂停/恢复：本页无暂停遮罩，冻结靠主循环 isPaused 判断 */
    pauseQuiet() {
        if (this.state === 'menu') return;
        this.isPaused = true;
    }

    resumeQuiet() {
        if (!this.isPaused) return;
        this.isPaused = false;
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
            const ops = operableIndexes(this.spec);
            // 命中测试：取距离最近的可操作元件（直径 ~52px ≥ 44px 触控标准）
            let best = -1, bestD = HIT_R;
            ops.forEach((elIdx, k) => {
                const el = this.spec.elements[elIdx];
                const { x, y } = cellCenter(el.r, el.c);
                const d = Math.hypot(p.x - x, p.y - y);
                if (d <= bestD) { bestD = d; best = k; }
            });
            if (best >= 0) this.flipSwitch(best);
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
            this.el['reset-btn'].addEventListener('click', () => this.resetLevel());
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

    /* ── 粒子 ── */

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
            if (this.isPaused) {
                this.frameDt = 0;
                return;
            }
            this.frameDt = dt;
            this.time += dt;

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

        // 蓝图底
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0a1230');
        bg.addColorStop(0.55, '#0b1436');
        bg.addColorStop(1, '#0d1a40');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // 蓝图网格
        ctx.strokeStyle = 'rgba(80, 110, 200, 0.13)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < GRID_COLS; i++) {
            ctx.moveTo(i * CW, 0);
            ctx.lineTo(i * CW, H);
        }
        for (let i = 1; i < GRID_ROWS; i++) {
            ctx.moveTo(0, i * CH);
            ctx.lineTo(W, i * CH);
        }
        ctx.stroke();

        if (!this.spec) return;

        const cond = this.conduction();

        this.drawWires(ctx, cond);
        // 元件层序：电池 → 灯泡 → tee 结点 → 开关
        for (const el of this.spec.elements) {
            if (el.t === 'bat') this.drawBattery(ctx, el);
        }
        for (let i = 0; i < this.spec.elements.length; i++) {
            const el = this.spec.elements[i];
            if (el.t === 'bulb') this.drawBulb(ctx, el, i, this.sol.lit);
        }
        for (const el of this.spec.elements) {
            if (el.t === 'tee') this.drawTee(ctx, el, cond);
        }
        for (const el of this.spec.elements) {
            if (el.t === 'sw' || el.t === 'spdt') this.drawSwitch(ctx, el, cond);
        }

        this.drawShortFlash(ctx);
        this.drawParticles(ctx);
    }

    /** 导线/tee：通电琥珀辉光、断电暗蓝、短路红 */
    drawWires(ctx, cond) {
        const shorted = this.sol && this.sol.short;
        const lineFor = (el) => {
            const eps = endpointsOf(el);
            const a = endPx(el, eps[0]), b = endPx(el, eps[1]);
            return { a, b };
        };
        ctx.lineCap = 'round';
        for (const el of this.spec.elements) {
            if (el.t !== 'wire') continue;
            const on = this.isEnergized(el, cond);
            const { a, b } = lineFor(el);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            if (shorted && on) {
                ctx.shadowColor = 'rgba(226, 75, 74, 0.9)';
                ctx.shadowBlur = 10;
                ctx.strokeStyle = RED;
            } else if (on) {
                ctx.shadowColor = 'rgba(255, 201, 77, 0.75)';
                ctx.shadowBlur = 9;
                ctx.strokeStyle = AMBER;
            } else {
                ctx.shadowBlur = 0;
                ctx.strokeStyle = DIM_WIRE;
            }
            ctx.lineWidth = on ? 4 : 3;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        // 通电流动光点（能量体感）
        if (!shorted) {
            for (const el of this.spec.elements) {
                if (el.t !== 'wire' || !this.isEnergized(el, cond)) continue;
                const { a, b } = lineFor(el);
                const phase = (this.time * 0.9 + el.r * 31 + el.c * 17) % 1;
                const px = a.x + (b.x - a.x) * phase;
                const py = a.y + (b.y - a.y) * phase;
                ctx.fillStyle = AMBER_SOFT;
                ctx.shadowColor = AMBER;
                ctx.shadowBlur = 7;
                ctx.beginPath();
                ctx.arc(px, py, 2.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }
    }
    /** 电池：长板=正极、短厚板=负极，pol 'a' 表示 eps[0] 侧为正 */
    drawBattery(ctx, el) {
        const eps = endpointsOf(el);
        const a = endPx(el, eps[0]), b = endPx(el, eps[1]);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const horiz = el.o === 'h';
        const longX = cx + (el.pol === 'a' ? -3 : 3) * (horiz ? 1 : 0);
        const longY = cy + (el.pol === 'a' ? -3 : 3) * (horiz ? 0 : 1);
        const shortX = cx + (el.pol === 'a' ? 3 : -3) * (horiz ? 1 : 0);
        const shortY = cy + (el.pol === 'a' ? 3 : -3) * (horiz ? 0 : 1);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255, 201, 77, 0.55)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = AMBER_SOFT;
        // 引线
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (horiz) {
            ctx.moveTo(a.x, cy); ctx.lineTo(longX, cy);
            ctx.moveTo(shortX, cy); ctx.lineTo(b.x, cy);
        } else {
            ctx.moveTo(cx, a.y); ctx.lineTo(cx, longY);
            ctx.moveTo(cx, shortY); ctx.lineTo(cx, b.y);
        }
        ctx.stroke();
        // 长板（正极）
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (horiz) { ctx.moveTo(longX, cy - 11); ctx.lineTo(longX, cy + 11); }
        else { ctx.moveTo(cx - 11, longY); ctx.lineTo(cx + 11, longY); }
        ctx.stroke();
        // 短板（负极）
        ctx.lineWidth = 7;
        ctx.beginPath();
        if (horiz) { ctx.moveTo(shortX, cy - 5); ctx.lineTo(shortX, cy + 5); }
        else { ctx.moveTo(cx - 5, shortY); ctx.lineTo(cx + 5, shortY); }
        ctx.stroke();
        // 正极标记
        ctx.shadowBlur = 0;
        ctx.fillStyle = AMBER_SOFT;
        ctx.font = 'bold 11px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (horiz) ctx.fillText('+', longX - 9, cy - 13);
        else ctx.fillText('+', cx - 12, longY - 9);
        ctx.restore();
    }

    /** 灯泡：目标灯带虚线识别环；点亮暖黄脉冲辉光（lit 按元件下标对齐） */
    drawBulb(ctx, el, idx, lit) {
        const { x, y } = cellCenter(el.r, el.c);
        const isTarget = !!el.target;
        const on = lit[idx] === true;
        ctx.save();
        if (isTarget && !on) {
            ctx.strokeStyle = 'rgba(255, 201, 77, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(x, y, 16.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        if (on) {
            const pulse = 0.85 + 0.15 * Math.sin(this.time * 3 + (el.r + el.c));
            const g = ctx.createRadialGradient(x, y, 2, x, y, 26);
            g.addColorStop(0, 'rgba(255, 217, 138, 0.5)');
            g.addColorStop(1, 'rgba(255, 217, 138, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowColor = 'rgba(255, 217, 138, 0.95)';
            ctx.shadowBlur = 14 * pulse;
            ctx.fillStyle = '#ffd98a';
            ctx.strokeStyle = AMBER;
        } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.strokeStyle = isTarget ? '#8b96c4' : '#55628f';
        }
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // 灯丝
        ctx.shadowBlur = 0;
        ctx.strokeStyle = on ? '#c98f1d' : 'rgba(139, 150, 196, 0.6)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - 4.5, y + 3.5);
        ctx.lineTo(x - 2, y - 3);
        ctx.lineTo(x + 2, y + 3);
        ctx.lineTo(x + 4.5, y - 3.5);
        ctx.stroke();
        ctx.restore();
    }

    /** tee 三臂结点：配色同导线，中心实心结点 */
    drawTee(ctx, el, cond) {
        const on = this.isEnergized(el, cond);
        const shorted = this.sol && this.sol.short;
        const { x, y } = cellCenter(el.r, el.c);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = shorted && on ? RED : on ? AMBER : DIM_WIRE;
        ctx.lineWidth = on ? 4 : 3;
        if (on) {
            ctx.shadowColor = shorted ? 'rgba(226, 75, 74, 0.9)' : 'rgba(255, 201, 77, 0.75)';
            ctx.shadowBlur = 9;
        }
        for (const arm of el.arms.split('')) {
            const p = endPx(el, arm);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    /** 开关（sw/spdt）：底座 + 触点 + 杠杆；翻动时弹摆衰减 */
    drawSwitch(ctx, el, cond) {
        const ops = operableIndexes(this.spec);
        const elIdx = this.spec.elements.indexOf(el);
        const k = ops.indexOf(elIdx);
        if (k < 0) return;
        const closed = !!this.states[k];
        const { x, y } = cellCenter(el.r, el.c);

        // 弹摆（翻动后 0.5s 内衰减振荡）
        let swing = 0;
        if (this.flipFx && this.flipFx.idx === k) {
            const dt = this.time - this.flipFx.start;
            if (dt >= 0 && dt < 0.5) swing = Math.sin(dt * 22) * Math.exp(-dt * 7) * 0.38;
        }

        ctx.save();
        // 底座（可点击暗示：琥珀脉动描边）
        const pulse = 0.3 + 0.14 * Math.sin(this.time * 3 + el.c);
        ctx.strokeStyle = `rgba(255, 201, 77, ${pulse.toFixed(3)})`;
        ctx.fillStyle = 'rgba(16, 24, 56, 0.92)';
        ctx.lineWidth = 1.6;
        if (el.t === 'sw') {
            roundRectPath(ctx, x - 14, y - 10, 28, 20, 6);
        } else {
            ctx.beginPath();
            ctx.arc(x, y, 14.5, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();

        const pad = (p, d = 4) => {
            const dx = x - p.x, dy = y - p.y;
            const len = Math.hypot(dx, dy) || 1;
            return { x: p.x + dx / len * d, y: p.y + dy / len * d };
        };
        ctx.lineCap = 'round';
        if (el.t === 'sw') {
            const horiz = el.o === 'h';
            const a = pad(horiz ? endPx(el, 'w') : endPx(el, 'n'), 5);
            const b = horiz ? endPx(el, 'e') : endPx(el, 's');
            const bi = pad(b, 5);
            // 触点
            ctx.fillStyle = AMBER_SOFT;
            [[a.x, a.y], [bi.x, bi.y]].forEach(([px, py]) => {
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
            });
            // 杠杆：闭合 = 平放连接；断开 = 从 a 铰接上翘
            const baseAng = Math.atan2(bi.y - a.y, bi.x - a.x);
            const ang = baseAng + (closed ? 0 : -0.56) + swing;
            const len = Math.hypot(bi.x - a.x, bi.y - a.y);
            ctx.strokeStyle = closed ? AMBER : '#8b96c4';
            if (closed) {
                ctx.shadowColor = 'rgba(255, 201, 77, 0.85)';
                ctx.shadowBlur = 8;
            }
            ctx.lineWidth = 3.4;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(a.x + Math.cos(ang) * len, a.y + Math.sin(ang) * len);
            ctx.stroke();
        } else {
            // spdt：a 公共点 → 当前触点
            const a = pad(endPx(el, el.a));
            const o1 = pad(endPx(el, el.o1));
            const o2 = pad(endPx(el, el.o2));
            ctx.fillStyle = AMBER_SOFT;
            ctx.beginPath();
            ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#8b96c4';
            [[o1.x, o1.y], [o2.x, o2.y]].forEach(([px, py]) => {
                ctx.beginPath();
                ctx.arc(px, py, 2.6, 0, Math.PI * 2);
                ctx.fill();
            });
            const cur = this.states[k] === 0 ? o1 : o2;
            const baseAng = Math.atan2(cur.y - a.y, cur.x - a.x);
            const ang = baseAng + swing;
            const len = Math.hypot(cur.x - a.x, cur.y - a.y);
            ctx.strokeStyle = AMBER;
            ctx.shadowColor = 'rgba(255, 201, 77, 0.85)';
            ctx.shadowBlur = 8;
            ctx.lineWidth = 3.4;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(a.x + Math.cos(ang) * len, a.y + Math.sin(ang) * len);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** 短路红闪：进入瞬间强闪衰减 + 持续期低频红晕 */
    drawShortFlash(ctx) {
        if (!this.sol || !this.sol.short) return;
        const sT = this.time - this.shortAt;
        if (sT >= 0 && sT < 1.2) {
            const a = 0.34 * (1 - sT / 1.2) * (0.6 + 0.4 * Math.sin(this.time * 22));
            ctx.fillStyle = `rgba(226, 75, 74, ${a.toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
        }
        const slow = 0.05 + 0.04 * Math.sin(this.time * 2.5);
        ctx.fillStyle = `rgba(226, 75, 74, ${slow.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
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

/** 可操作元件初态数组（与 operableIndexes 对齐） */
function initStatesLocal(spec) {
    return operableIndexes(spec).map((i) => spec.elements[i].init);
}
/* ────────────────────────── boot ────────────────────────── */

onReady(() => {
    const game = new CircuitGame();
    window.ccGame = game; // 调试/测试句柄（AUGMENT startLevel 启动点）

    // 桌面端舞台纵向预算：实测 --frame-chrome 写入 shell，变化后驱动 resize()
    bindFrame({ logicalWidth: W });

    // 桌面侧栏「更多游戏」卡（语言切换由 more-games.js 的全局 updateMoreGames 自动同步）
    const ccSideMore = document.getElementById('ccSideMore');
    if (ccSideMore) renderMoreGames(ccSideMore, { exclude: 'circuit.html' });

    // 移动端底部统计抽屉
    window.ccDrawer = createStatsDrawer({
        idPrefix: 'cc',
        getGame: () => window.ccGame,
        onPause: (g) => g && g.pauseQuiet(),
        onResume: (g) => g && g.resumeQuiet(),
        isBusy: () => {
            const g = window.ccGame;
            return !!g && typeof g.isRunning === 'function' && g.isRunning();
        },
        ICONS,
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
    });
    if (window.ccDrawer) window.ccDrawer.init();
});

/* ── 顶栏 / 页脚通用控件：Home · Sound · More ──
   owns 默认只含 more：静音钮在本页有自己的 handler，Home 是页面自己绑的 button。 */
onReady(() => {
    bindChrome({
        self: 'circuit.html',
        owns: ['more'],
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
    });
});
