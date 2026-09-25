/**
 * Maxwell's Demon 麦克斯韦妖 — 热与熵分拣解谜
 * ==========================================
 * 玩法：密封容器被隔板分成左右两腔，隔板中央只有一扇小门。分子默认是看不见的灰点——
 * 你不花钱就不知道它是快是慢。花预算「观测」看清门附近分子的真实速度（红=快，蓝=慢），
 * 再花预算「开门」放一个 0.5 秒的放行窗口：快分子进左腔、慢分子进右腔，
 * 温差就这么凭空出现了。预算耗尽而温差仍未稳住 = 妖破产。
 *
 * 机制即教学：温度是分子平均动能；分拣让一侧变热一侧变冷看似无中生有，
 * 而代价就摆在 HUD 上——你每获得一个比特都要付账（兰道尔原理的游戏化表述）。
 *
 * 关卡数据 / 分子内核在 js/maxwell-demon-rules.js（纯模块，校验器共用）。
 * par 由 scripts/verify-maxwell-demon-levels.mjs 的贪心模拟现算，绝不手填。
 *
 * 共享层（2026-09 契约）：game-frame / game-drawer / game-chrome /
 * leaderboard / daily / i18n / safe-storage / analytics / game-sfx / boot。
 */

import {
    STAGE,
    VESSEL,
    RULES,
    LEVELS,
    createWorld,
    stepWorld,
    isFast,
    budgetLeft,
    starsForLevel,
    dailyCourse,
} from './maxwell-demon-rules.js';
import { ensurePlayerName, setPlayerName } from './player.js';
import { getLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { renderMoreGames } from './more-games.js';
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

/* ────────────────────────── 常量 ────────────────────────── */

const W = STAGE.w;
const H = STAGE.h;
const DOOR_X = VESSEL.wallX;
const DOOR_Y = VESSEL.doorY;
const VESSEL_PAD = VESSEL.pad;

const HOT = '#ff8a5c';
const COLD = '#6fd8ff';
const BLIND = '#7d86ad';
const GOLD = '#ffd34d';

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function mixHex(a, b, k) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * k));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function vibrate(pattern) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* 不支持则忽略 */ }
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = makeText({
    en: {
        stats: 'Stats',
        title: 'Maxwell\'s Demon',
        subtitle: 'Watch · Sort · Pay',
        howto: 'Two chambers, one tiny door, and a gas you cannot read. Pay to scan and see which molecules are fast; pay to arm the door, and the first molecule that reaches the gap slips through — then the door shuts again. Slip fast ones into the left chamber, shove slow ones to the right, and a temperature gap appears out of nowhere. Arm it a second time to call it off (the money is already spent). Run out of budget before the gap holds and the demon goes bankrupt.',
        playLevels: 'Levels',
        playDaily: 'Daily',
        vessel: 'Vessel',
        daily: 'Daily',
        levelSelect: 'Select vessel',
        budget: 'Budget',
        spent: 'Spent',
        par: 'Par',
        gapLabel: 'Gap',
        target: 'Target',
        openGate: 'Arm the door',
        scan: 'Scan',
        dailyStartToast: 'Daily run — least budget spent wins',
        retry: 'Retry',
        next: 'Next',
        menu: 'Home',
        again: 'Again',
        levelCleared: 'The gap holds!',
        dailyDone: 'Daily complete!',
        bestToday: 'Your best today',
        stars: 'Stars',
        leaderboard: 'Global · Today\'s Run',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        resetTitle: 'Restart vessel',
        home: 'Home',
        hint: 'Information is not free — every bit you learn is paid for',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
        legendTitle: 'Thermodynamics legend',
        legendFast: 'Fast molecule — hot. Let it into the left chamber',
        legendSlow: 'Slow molecule — cold. Shove it to the right',
        legendBlind: 'Unobserved — you cannot tell fast from slow until you scan',
        legendGate: 'The door — arming it lets exactly one molecule through, and it costs',
        legendBand: 'Temperature gap ΔT — mean kinetic energy, left minus right',
        failBroke: 'Out of budget — the demon cannot pay for another bit',
        brokeToast: 'Not enough budget',
        gateExpired: 'Nobody came — that arming was wasted',
        tipFirst: 'Scan first: pay to see which molecule is fast, then arm the door only for that one',
        tipNarrow: 'The door is narrower now — wait until a molecule lines up with the gap before you arm it',
        tipCrowd: 'A crowded vessel: the gap must be bigger, and every glance costs more than you think',
        tipScan: 'A scan only lights up the molecules near the door — watch that circle, and remember what you saw',
        tipHold: 'Reaching the gap is not enough: it has to hold still for a moment before it counts',
        tipSave: 'Budget is thin here — arm the door only when you already know who is coming',
        stage: 'Vessel',
        stageOf: '{a} / {b}',
    },
    zh: {
        stats: '数据统计',
        title: '麦克斯韦妖',
        subtitle: '看清 · 分拣 · 付账',
        howto: '两个腔室，一扇小门，一团读不懂的气体。花预算观测，看清哪些分子是快的；再花预算把门「武装」起来——第一个撞上门洞的分子会被放过去，门随即合上。把快分子放进左腔，把慢分子赶到右腔，温差就这么凭空出现了。再按一次可以撤回（钱已经花了）。预算花光而温差还没稳住，妖就破产了。',
        playLevels: '关卡模式',
        playDaily: '每日挑战',
        vessel: '容器',
        daily: '每日',
        levelSelect: '选择容器',
        budget: '预算',
        spent: '已花',
        par: '目标',
        gapLabel: '温差',
        target: '需达',
        openGate: '武装开门',
        scan: '观测',
        dailyStartToast: '每日行程——花费预算越少越好',
        retry: '重试',
        next: '下一容器',
        menu: '返回主页',
        again: '再来一次',
        levelCleared: '温差稳住了！',
        dailyDone: '每日挑战完成！',
        bestToday: '今日最好成绩',
        stars: '星星',
        leaderboard: '全球榜 · 今日行程',
        noScores: '暂无成绩',
        lbOffline: '榜单离线',
        copyResult: '复制',
        resetTitle: '重开本容器',
        home: '主页',
        hint: '信息不是免费的——你每获得一个比特都要付账',
        sideHowTo: '玩法说明',
        sideRecords: '战绩',
        legendTitle: '热力学图例',
        legendFast: '快分子——热。放进左腔',
        legendSlow: '慢分子——冷。赶到右腔',
        legendBlind: '未观测——不花钱就分不出快慢',
        legendGate: '小门——武装一次只放一个分子过去，而且收费',
        legendBand: '温差 ΔT——平均动能，左腔减右腔',
        failBroke: '预算耗尽——妖付不起下一个比特了',
        brokeToast: '预算不足',
        gateExpired: '没人来——这次武装白花了',
        tipFirst: '先观测：花钱看清哪个分子是快的，只为它武装开门',
        tipNarrow: '门变窄了——等一个分子对准门洞，再武装开门',
        tipCrowd: '分子更多了：温差要拉得更大，而每一次观测都比你想的贵',
        tipScan: '观测只照亮门附近的分子——盯住那个圈，并记住你看到的东西',
        tipHold: '温差拉到不算数：得稳住一会儿才算过关',
        tipSave: '这里的预算很薄——只在已经看清来者时再武装开门',
        stage: '容器',
        stageOf: '{a} / {b}',
    }
});

/* ────────────────────────── 音效 ────────────────────────── */
// 冷侧用低音、暖侧用亮音；观测是「叮」，开门是「咔」，破产是下滑闷响。

const sfxEngine = createSfxEngine();

const Sfx = {
    click() { sfxEngine.tone({ freq: 620, type: 'square', dur: 0.05, vol: 0.06 }); },
    scan() {
        sfxEngine.tone({ freq: 1180, type: 'sine', dur: 0.1, vol: 0.08 });
        sfxEngine.tone({ freq: 1760, type: 'sine', dur: 0.06, vol: 0.03, delay: 0.03 });
    },
    gate() { sfxEngine.tone({ freq: 320, slideTo: 240, type: 'triangle', dur: 0.09, vol: 0.1 }); },
    gateClose() { sfxEngine.tone({ freq: 200, slideTo: 150, type: 'triangle', dur: 0.07, vol: 0.06 }); },
    pass(hot) {
        sfxEngine.tone({ freq: hot ? 880 : 392, type: 'sine', dur: 0.12, vol: 0.07 });
    },
    broke() { sfxEngine.tone({ freq: 300, type: 'square', dur: 0.08, vol: 0.05 }); },
    win() {
        sfxEngine.tone({ freq: 784, type: 'sine', dur: 0.5, vol: 0.11 });
        sfxEngine.tone({ freq: 1046, type: 'sine', dur: 0.4, vol: 0.06, delay: 0.05 });
        sfxEngine.tone({ freq: 1318, type: 'sine', dur: 0.35, vol: 0.05, delay: 0.1 });
    },
    star3() {
        [784, 988, 1175].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.3 + i * 0.1 });
        });
    },
    fail() {
        sfxEngine.tone({ freq: 300, slideTo: 90, type: 'sawtooth', dur: 0.34, vol: 0.1 });
        sfxEngine.noise({ dur: 0.22, vol: 0.06, filterFreq: 500 });
    },
};

/* ────────────────────────── 存储 ────────────────────────── */

function storageParseProgress() {
    try {
        const obj = JSON.parse(storageGet('md_progress'));
        const out = {};
        if (obj && typeof obj === 'object') {
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (v && typeof v === 'object') {
                    out[k] = { stars: clamp(v.stars | 0, 0, 3), bestSpent: v.bestSpent | 0 };
                }
            }
        }
        return out;
    } catch (e) {
        return {};
    }
}

/* ────────────────────────── 游戏主体 ────────────────────────── */

class MaxwellDemonGame {
    constructor() {
        this.canvas = document.getElementById('md-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        [
            'md-hud-level', 'md-budget', 'md-par', 'md-reset-btn', 'md-mute-btn', 'md-toast',
            'md-start', 'md-title', 'md-subtitle', 'md-howto', 'md-btn-levels', 'md-btn-daily',
            'md-level-label', 'md-level-grid', 'md-daily-best', 'md-start-mute',
            'md-side-howto-title', 'md-side-howto', 'md-side-records-title', 'md-side-records',
            'md-side-legend-title', 'md-side-legend',
            'md-clear', 'md-clear-stars', 'md-clear-line', 'md-btn-next', 'md-btn-replay', 'md-btn-menu1',
            'md-over', 'md-over-title', 'md-over-score', 'md-over-sub',
            'md-btn-again', 'md-btn-copy', 'md-btn-menu2',
            'md-lb-title', 'md-lb-list', 'md-lb-status', 'md-username', 'md-username-label',
            'md-hint', 'md-scan-btn', 'md-gate-btn', 'md-action-row',
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^md-/, '')] = el;
        });

        this.lang = getLang();
        this.progress = storageParseProgress();

        // 对局状态：menu | playing | won-level | won-daily | failed
        // ⚠️ 字段名与 verify-stats-drawer.mjs 的 AUGMENT runningExpr 严格对应
        this.state = 'menu';
        this.isPaused = false;
        this.mode = 'levels';
        this.levelIdx = 0;
        this.spec = null;
        this.world = null;
        this.daily = null;         // { key, display, course:[spec], cursor, totalSpent, stars }
        this.failReason = null;
        this.failTimer = 0;

        // 输入：两个动作都是**边沿触发**的离散动作
        this.wantGate = false;
        this.wantScan = false;

        // 视觉
        this.time = 0;
        this.toastTimer = 0;
        this.particles = [];
        this.passFlash = 0;        // 刚刚有分子穿门的门洞高亮

        this.animationId = null;
        this.lastFrame = 0;

        this.initUI();
        this.applyLanguage();
        this.bindInput();
        this.bindUI();
        this.syncActionVisibility();
        this.resize();
        this.startLoop();
    }

    /* ---------------------- 基础 ---------------------- */

    t(key, vars) {
        const table = LANGUAGES[this.lang] || LANGUAGES.en;
        let s = table[key];
        if (s === undefined) s = (LANGUAGES.en[key] !== undefined ? LANGUAGES.en[key] : key);
        if (vars) {
            s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
        }
        return s;
    }

    /**
     * 给共享层（bindChrome / createStatsDrawer）用的**整表**取用器。
     * ⚠️ 共享层的 `getText` 契约是 `() => object`（返回当前语言的文案对象），
     * 不是 `(key) => string` —— 传错形态会让共享文案全部静默退回英文
     * （silk-dew 踩过的坑，verify-stats-drawer §②b 用死值断言防守）。
     */
    textTable() {
        return LANGUAGES[this.lang] || LANGUAGES.en;
    }

    /**
     * 动作钮只在 playing 态显示。z-index(15) 高于 overlay(10)，菜单态若不隐藏，
     * 会浮在关卡 chips 上把「1」整个挡住（移动端实测截图抓到）。
     */
    syncActionVisibility() {
        const on = this.state === 'playing';
        if (this.el['action-row']) this.el['action-row'].classList.toggle('is-hidden', !on);
        for (const key of ['scan-btn', 'gate-btn']) {
            if (this.el[key]) this.el[key].classList.toggle('is-dimmed', !on);
        }
    }

    /* ---------------------- UI 初始化 ---------------------- */

    initUI() {
        const el = this.el;
        if (el['btn-levels']) {
            el['btn-levels'].innerHTML = `${ICONS.play}<span class="btn-text">${this.t('playLevels')}</span>`;
            el['btn-levels'].addEventListener('click', () => { Sfx.click(); this.startLevels(); });
        }
        if (el['btn-daily']) {
            el['btn-daily'].innerHTML = `${ICONS.calendar}<span class="btn-text">${this.t('playDaily')}</span>`;
            el['btn-daily'].addEventListener('click', () => { Sfx.click(); this.startDaily(); });
        }
        if (el['btn-next']) {
            el['btn-next'].innerHTML = `${ICONS.arrowRight}<span class="btn-text">${this.t('next')}</span>`;
            el['btn-next'].addEventListener('click', () => { Sfx.click(); this.nextLevel(); });
        }
        if (el['btn-replay']) {
            el['btn-replay'].innerHTML = `${ICONS.retry}<span class="btn-text">${this.t('retry')}</span>`;
            el['btn-replay'].addEventListener('click', () => { Sfx.click(); this.restartLevel(); });
        }
        if (el['btn-menu1']) {
            el['btn-menu1'].innerHTML = `${ICONS.home}<span class="btn-text">${this.t('menu')}</span>`;
            el['btn-menu1'].addEventListener('click', () => { Sfx.click(); this.toMenu(); });
        }
        if (el['btn-again']) {
            el['btn-again'].innerHTML = `${ICONS.retry}<span class="btn-text">${this.t('again')}</span>`;
            el['btn-again'].addEventListener('click', () => { Sfx.click(); this.restartLevel(); });
        }
        if (el['btn-copy']) {
            el['btn-copy'].innerHTML = `${ICONS.copy}<span class="btn-text">${this.t('copyResult')}</span>`;
            el['btn-copy'].addEventListener('click', () => this.copyResult());
        }
        if (el['btn-menu2']) {
            el['btn-menu2'].innerHTML = `${ICONS.home}<span class="btn-text">${this.t('menu')}</span>`;
            el['btn-menu2'].addEventListener('click', () => { Sfx.click(); this.toMenu(); });
        }
        if (el['reset-btn']) {
            el['reset-btn'].innerHTML = ICONS.retry;
            el['reset-btn'].addEventListener('click', () => { Sfx.click(); this.restartLevel(); });
        }
        if (el['mute-btn']) {
            // ⚠️ 键名是 soundOn / soundOff（js/icons.js），写错会把字面量 "undefined"
            // 塞进 innerHTML —— 图标消失但无报错。
            el['mute-btn'].innerHTML = getMuted() ? ICONS.soundOff : ICONS.soundOn;
            el['mute-btn'].addEventListener('click', () => {
                const next = !getMuted();
                setMuted(next);
                el['mute-btn'].innerHTML = next ? ICONS.soundOff : ICONS.soundOn;
                if (!next) Sfx.click();
            });
        }
        if (el['start-mute']) {
            el['start-mute'].innerHTML = getMuted() ? ICONS.soundOff : ICONS.soundOn;
            el['start-mute'].addEventListener('click', () => {
                const next = !getMuted();
                setMuted(next);
                el['start-mute'].innerHTML = next ? ICONS.soundOff : ICONS.soundOn;
                if (el['mute-btn']) el['mute-btn'].innerHTML = next ? ICONS.soundOff : ICONS.soundOn;
            });
        }
        // 两个动作钮：pointerdown 直接触发（不等 click，移动端更跟手）
        if (el['gate-btn']) {
            el['gate-btn'].addEventListener('pointerdown', (e) => {
                e.preventDefault();
                if (this.state === 'playing' && !this.isPaused) this.wantGate = true;
            });
        }
        if (el['scan-btn']) {
            el['scan-btn'].addEventListener('pointerdown', (e) => {
                e.preventDefault();
                if (this.state === 'playing' && !this.isPaused) this.wantScan = true;
            });
        }
        // 每日榜用户名
        if (el['username']) {
            el['username'].value = ensurePlayerName();
            el['username'].addEventListener('change', () => {
                setPlayerName(el['username'].value.trim() || ensurePlayerName());
            });
        }
        this.renderLevelGrid();
        this.renderLegend();
    }

    applyLanguage() {
        const el = this.el;
        const setText = (key, text) => { if (el[key]) el[key].textContent = text; };
        // ⚠️ 页面标题必须在这里重写：chrome 校验器会切语言后断言 document.title 变化。
        document.title = this.lang === 'zh'
            ? '麦克斯韦妖 — 热与熵分拣解谜'
            : 'Maxwell\'s Demon — Heat & Entropy Puzzle';
        setText('title', this.t('title'));
        setText('subtitle', this.t('subtitle'));
        setText('howto', this.t('howto'));
        setText('level-label', this.t('levelSelect'));
        setText('side-howto-title', this.t('sideHowTo'));
        setText('side-howto', this.t('howto'));
        setText('side-records-title', this.t('sideRecords'));
        setText('side-legend-title', this.t('legendTitle'));
        setText('hint', this.t('hint'));
        setText('lb-title', this.t('leaderboard'));
        if (el['username-label']) el['username-label'].textContent = this.t('title');
        if (el['gate-btn']) el['gate-btn'].title = this.t('openGate');
        if (el['scan-btn']) el['scan-btn'].title = this.t('scan');

        const setBtnText = (key, text) => {
            if (!el[key]) return;
            const span = el[key].querySelector('.btn-text');
            if (span) span.textContent = text;
            else el[key].textContent = text;
        };
        setBtnText('btn-levels', this.t('playLevels'));
        setBtnText('btn-daily', this.t('playDaily'));
        setBtnText('btn-next', this.t('next'));
        setBtnText('btn-replay', this.t('retry'));
        setBtnText('btn-menu1', this.t('menu'));
        setBtnText('btn-again', this.t('again'));
        setBtnText('btn-copy', this.t('copyResult'));
        setBtnText('btn-menu2', this.t('menu'));

        if (el['reset-btn']) el['reset-btn'].title = this.t('resetTitle');
        if (el['budget']) el['budget'].title = this.t('budget');

        this.renderLevelGrid();
        this.renderLegend();
        this.renderSideRecords();
        this.updateHud();
        document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    }

    /* ---------------------- 关卡选择 / 侧栏 ---------------------- */

    renderLevelGrid() {
        const grid = this.el['level-grid'];
        if (!grid) return;
        grid.innerHTML = '';
        LEVELS.forEach((spec, i) => {
            const p = this.progress[spec.id] || { stars: 0, bestSpent: 0 };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'md-chip' + (p.stars > 0 ? ' is-done' : '');
            btn.dataset.level = String(i);
            const num = document.createElement('span');
            num.className = 'md-chip-num';
            num.textContent = String(i + 1);
            const stars = document.createElement('span');
            stars.className = 'md-chip-stars';
            stars.textContent = '★'.repeat(p.stars) + '☆'.repeat(3 - p.stars);
            btn.appendChild(num);
            btn.appendChild(stars);
            btn.addEventListener('click', () => { Sfx.click(); this.startLevel(i); });
            grid.appendChild(btn);
        });
    }

    renderSideRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        let cleared = 0, stars = 0, bestSum = 0, bestCount = 0;
        for (const spec of LEVELS) {
            const p = this.progress[spec.id];
            if (p && p.stars > 0) {
                cleared++;
                stars += p.stars;
                if (p.bestSpent > 0) { bestSum += p.bestSpent; bestCount++; }
            }
        }
        const rows = [
            [this.t('vessel'), `${cleared} / ${LEVELS.length}`],
            [this.t('stars'), `${stars} / ${LEVELS.length * 3}`],
            [this.t('spent'), bestCount ? String(bestSum) : '—'],
        ];
        box.innerHTML = '';
        for (const [k, v] of rows) {
            const row = document.createElement('div');
            row.className = 'md-side-row';
            const kk = document.createElement('span');
            kk.className = 'md-side-k';
            kk.textContent = k;
            const vv = document.createElement('span');
            vv.className = 'md-side-v';
            vv.textContent = v;
            row.appendChild(kk);
            row.appendChild(vv);
            box.appendChild(row);
        }
    }

    renderLegend() {
        const box = this.el['side-legend'];
        if (!box) return;
        const rows = [
            ['fast', this.t('legendFast')],
            ['slow', this.t('legendSlow')],
            ['blind', this.t('legendBlind')],
            ['gate', this.t('legendGate')],
            ['band', this.t('legendBand')],
        ];
        box.innerHTML = '';
        for (const [kind, text] of rows) {
            const row = document.createElement('div');
            row.className = 'md-legend-row';
            const dot = document.createElement('span');
            dot.className = `md-legend-dot md-legend-${kind}`;
            const tx = document.createElement('span');
            tx.className = 'md-legend-text';
            tx.textContent = text;
            row.appendChild(dot);
            row.appendChild(tx);
            box.appendChild(row);
        }
    }

    /* ---------------------- 模式与关卡流程 ---------------------- */

    startLevels() {
        track('maxwell-demon', 'start_levels');
        this.mode = 'levels';
        this.daily = null;
        let idx = 0;
        for (let i = 0; i < LEVELS.length; i++) {
            const p = this.progress[LEVELS[i].id];
            if (!p || p.stars === 0) { idx = i; break; }
            idx = Math.min(i + 1, LEVELS.length - 1);
        }
        this.startLevel(idx);
    }

    startDaily() {
        const key = todayKey();
        const course = dailyCourse(key);
        this.mode = 'daily';
        this.daily = { key, display: todayKeyDisplay(), course, cursor: 0, totalSpent: 0, stars: 0 };
        track('maxwell-demon', 'start_daily');
        this.startLevel(course[0]);
        this.showToast(this.t('dailyStartToast'));
    }

    startLevel(ref) {
        const spec = (ref && typeof ref === 'object') ? ref : LEVELS[clamp(ref, 0, LEVELS.length - 1)];
        const idx = LEVELS.indexOf(spec);
        this.levelIdx = idx >= 0 ? idx : 0;
        this.spec = spec;
        this.failReason = null;
        this.failTimer = 0;
        this.particles = [];
        this.wantGate = false;
        this.wantScan = false;
        this.passFlash = 0;
        // 每日模式用日期键播种，保证全世界同一天拿到同一团气体
        const seedKey = (this.mode === 'daily' && this.daily)
            ? `${spec.id}-${this.daily.key}`
            : spec.id;
        this.world = createWorld(spec, seedKey);
        this.state = 'playing';
        this.isPaused = false;
        this.lastFrame = 0;
        this.hide(this.el['start']);
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.syncActionVisibility();
        this.updateHud();
        this.showToast(this.t(this.spec.tipKey || 'tipFirst'));
    }

    restartLevel() {
        if (this.mode === 'daily' && this.daily) {
            this.startLevel(this.daily.course[this.daily.cursor]);
        } else {
            this.startLevel(this.levelIdx);
        }
    }

    nextLevel() {
        if (this.mode === 'daily' && this.daily) {
            this.daily.cursor++;
            if (this.daily.cursor < this.daily.course.length) {
                this.startLevel(this.daily.course[this.daily.cursor]);
            } else {
                this.finishDaily();
            }
            return;
        }
        if (this.levelIdx + 1 < LEVELS.length) this.startLevel(this.levelIdx + 1);
        else this.toMenu();
    }

    toMenu() {
        this.state = 'menu';
        this.world = null;
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.show(this.el['start']);
        this.syncActionVisibility();
        this.renderLevelGrid();
        this.renderSideRecords();
    }

    /* ---------------------- 结算 ---------------------- */

    onLevelWon() {
        Sfx.win();
        vibrate(30);
        const spent = this.world.spent;
        const gap = this.world.gap;
        const stars = starsForLevel(spent, this.spec.par, gap, this.spec.stretch);
        const p = this.progress[this.spec.id] || { stars: 0, bestSpent: 0 };
        if (stars > p.stars) p.stars = stars;
        if (p.bestSpent === 0 || spent < p.bestSpent) p.bestSpent = spent;
        this.progress[this.spec.id] = p;
        this.saveProgress();
        this.renderLevelGrid();
        this.renderSideRecords();

        if (this.mode === 'daily' && this.daily) {
            this.daily.totalSpent += spent;
            this.daily.stars += stars;
        } else {
            this.maybeSubmitCampaign();
        }
        this.showClearPanel(stars, spent, gap);
        if (stars === 3) Sfx.star3();
        track('maxwell-demon', 'level_win', stars);
    }

    /** 战役全通 → 提交各关最少花费总和（asc 榜） */
    maybeSubmitCampaign() {
        let sum = 0, complete = true;
        for (const spec of LEVELS) {
            const p = this.progress[spec.id];
            if (!p || p.stars === 0) { complete = false; break; }
            sum += p.bestSpent;
        }
        if (complete && sum > 0) this.submit('maxwell-demon', sum);
    }

    showClearPanel(stars, spent, gap) {
        const el = this.el;
        this.state = 'won-level';
        if (el['clear-stars']) el['clear-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        if (el['clear-line']) {
            el['clear-line'].textContent = `${this.t('spent')} ${spent} · ${this.t('par')} ${this.spec.par} · ΔT ${gap.toFixed(2)}`;
        }
        const isLast = this.mode === 'levels' && this.levelIdx + 1 >= LEVELS.length;
        if (el['btn-next']) {
            el['btn-next'].style.display = (this.mode === 'daily') ? '' : (isLast ? 'none' : '');
        }
        this.syncActionVisibility();
        this.show(el['clear']);
    }

    onLevelFailed() {
        if (this.state !== 'playing') return;
        this.state = 'failed';
        this.failReason = 'broke';
        this.failTimer = 0;
        this.syncActionVisibility();
        Sfx.fail();
        vibrate([25, 40, 25]);
        track('maxwell-demon', 'level_fail', 0);
    }

    finishDaily() {
        this.state = 'won-daily';
        const el = this.el;
        this.hide(el['clear']);
        if (el['over-title']) el['over-title'].textContent = this.t('dailyDone');
        if (el['over-score']) el['over-score'].textContent = `${this.t('spent')} ${this.daily.totalSpent} · ★ ${this.daily.stars}`;
        if (el['over-sub']) el['over-sub'].textContent = `${this.t('bestToday')}: ${this.daily.display}`;
        this.syncActionVisibility();
        this.show(el['over']);
        // 提交每日成绩（asc：花费越少越好）
        const game = `maxwell-demon-d${this.daily.key.replace(/-/g, '')}`;
        this.submit(game, this.daily.totalSpent);
    }

    /* ---------------------- 榜单 ---------------------- */

    submit(game, score) {
        const name = ensurePlayerName();
        const el = this.el;
        if (el['lb-status']) el['lb-status'].textContent = '…';
        submitScore({ game, name, score })
            .then(() => fetchBoard(game))
            .then((rows) => this.renderBoard(rows))
            .catch(() => {
                if (el['lb-status']) el['lb-status'].textContent = this.t('lbOffline');
                const local = this.readLocalBoard(game);
                if (local.length) this.renderBoard(local);
            });
    }

    readLocalBoard(game) {
        try {
            const raw = storageGet('md_lb_' + game);
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    renderBoard(rows) {
        const el = this.el;
        const list = el['lb-list'];
        if (!list) return;
        list.innerHTML = '';
        if (!rows || !rows.length) {
            if (el['lb-status']) el['lb-status'].textContent = this.t('noScores');
            return;
        }
        if (el['lb-status']) el['lb-status'].textContent = '';
        rows.slice(0, 10).forEach((row, i) => {
            const li = document.createElement('li');
            li.className = 'md-lb-row';
            if (i < 3) li.classList.add(`md-lb-top${i + 1}`);
            const rank = document.createElement('span');
            rank.className = 'md-lb-rank';
            rank.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'md-lb-name';
            nm.textContent = row.name || '—';
            const sc = document.createElement('span');
            sc.className = 'md-lb-score';
            sc.textContent = String(row.score);
            li.appendChild(rank);
            li.appendChild(nm);
            li.appendChild(sc);
            list.appendChild(li);
        });
    }

    copyResult() {
        const text = this.mode === 'daily' && this.daily
            ? `${this.t('title')} · ${this.daily.display} · ${this.t('spent')} ${this.daily.totalSpent} · ★${this.daily.stars}`
            : `${this.t('title')} · ${this.t('vessel')} ${this.levelIdx + 1} · ${this.t('spent')} ${this.world ? this.world.spent : 0}`;
        const done = () => this.showToast(this.t('copyResult') + ' ✓');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(done);
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (e) { /* 忽略 */ }
            done();
        }
    }

    saveProgress() {
        try {
            storageSet('md_progress', JSON.stringify(this.progress));
        } catch (e) { /* 忽略 */ }
    }

    /* ---------------------- HUD / Toast ---------------------- */

    updateHud() {
        const el = this.el;
        const w = this.world;
        if (el['budget']) el['budget'].textContent = String(w ? budgetLeft(w) : (this.spec ? this.spec.budget : 0));
        if (el['par']) el['par'].textContent = `${this.t('par')} ${this.spec ? this.spec.par : 0}`;
        if (el['hud-level']) {
            if (this.mode === 'daily' && this.daily) {
                el['hud-level'].textContent = `${this.t('daily')} ${this.daily.cursor + 1}/${this.daily.course.length}`;
            } else {
                // ⚠️ 不能加 `&& this.spec` 门槛：菜单态 HUD 会停在静态英文文案不跟随语言。
                el['hud-level'].textContent = `${this.t('vessel')} ${this.levelIdx + 1}/${LEVELS.length}`;
            }
        }
        // 预算不足：两个动作钮变灰（纯视觉，点击仍会走 broke 提示）
        const broke = w ? w.spent >= w.total : false;
        if (el['gate-btn']) el['gate-btn'].classList.toggle('is-broke', broke);
        if (el['scan-btn']) el['scan-btn'].classList.toggle('is-broke', broke);
    }

    showToast(text) {
        const el = this.el['toast'];
        if (!el) return;
        el.textContent = text;
        el.classList.add('is-on');
        this.toastTimer = 2.8;
    }

    hideToast() {
        const el = this.el['toast'];
        if (el) el.classList.remove('is-on');
    }

    // ⚠️ 类名必须是 `hidden`（css/maxwell-demon.css 与所有 HTML 初始态都用它）。
    show(el) { if (el) el.classList.remove('hidden'); }
    hide(el) { if (el) el.classList.add('hidden'); }

    /* ---------------------- 输入 ---------------------- */

    bindInput() {
        const c = this.canvas;
        c.style.touchAction = 'none';

        document.addEventListener('keydown', (e) => {
            if (e.target instanceof Element && e.target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"]')) return;
            if (e.key === ' ' || e.key === 'Enter') {
                if (this.state === 'playing' && !this.isPaused) {
                    if (!e.repeat) this.wantGate = true;
                    e.preventDefault();
                }
            } else if (e.key === 'f' || e.key === 'F') {
                if (this.state === 'playing' && !this.isPaused && !e.repeat) this.wantScan = true;
            } else if (e.key === 'r' || e.key === 'R') {
                if (this.state === 'playing' && !this.isPaused) this.restartLevel();
            } else if (e.key === 'Escape') {
                if (this.state === 'playing' && !this.isPaused) this.toMenu();
            }
        });

        // 画布轻点 = 开门（摇杆式操作在这个游戏里没有意义，分子不受玩家直接驱动）
        c.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing' || this.isPaused) return;
            if (e.cancelable) e.preventDefault();
            this.wantGate = true;
        });
        c.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    bindUI() {
        window.addEventListener('site-settings:changed', () => {
            this.lang = getLang();
            this.applyLanguage();
        });
        window.addEventListener('resize', () => this.resize());
        // 桌面端 --frame-chrome 写入会改变舞台宽度 → 必须在 CSS 尺寸定下后重算后端缓冲区
        window.addEventListener('game-frame:changed', () => this.resize());
    }

    /* ---------------------- 暂停适配（抽屉契约） ---------------------- */

    pauseQuiet() { this.isPaused = true; }
    resumeQuiet() { this.lastFrame = 0; this.isPaused = false; }
    isRunning() { return this.state === 'playing' && !this.isPaused; }

    /* ---------------------- 尺寸 ---------------------- */

    resize() {
        // ⚠️ 必须用 clientWidth（整数）而非 getBoundingClientRect().width（亚像素），
        // 否则后端缓冲区比 CSS 盒窄 1–3px，校验器报「画面糊」（silk-dew 实测坑）。
        const canvas = this.canvas;
        const cssW = canvas.clientWidth || 300;
        const scale = cssW / W;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = scale * dpr;
        const pw = Math.round(W * renderScale);
        if (canvas.width !== pw) {
            canvas.width = pw;
            canvas.height = Math.round(H * renderScale);
        }
        this.renderScale = renderScale;
        this.dpr = dpr;
    }

    /* ---------------------- 循环 ---------------------- */

    startLoop() {
        const loop = (ts) => {
            this.animationId = requestAnimationFrame(loop);
            if (!this.lastFrame) this.lastFrame = ts;
            let dt = (ts - this.lastFrame) / 1000;
            this.lastFrame = ts;
            if (this.isPaused) return;
            dt = Math.min(dt, 0.05);
            this.time += dt;
            if (this.toastTimer > 0) {
                this.toastTimer -= dt;
                if (this.toastTimer <= 0) this.hideToast();
            }
            this.updateParticles(dt);
            if (this.passFlash > 0) this.passFlash = Math.max(0, this.passFlash - dt * 2.2);
            if (this.state === 'playing' && this.world) {
                const input = { gate: this.wantGate, scan: this.wantScan };
                this.wantGate = false;
                this.wantScan = false;
                stepWorld(this.world, dt, input);
                this.consumeEvents();
                if (this.world.state === 'won') this.onLevelWon();
                else if (this.world.state === 'dead') this.onLevelFailed();
                this.updateHud();
            } else if (this.state === 'failed' && this.world) {
                this.failTimer += dt;
                if (this.failTimer > 1.2) {
                    this.showToast(this.t('failBroke'));
                    this.restartLevel();
                }
            }
            this.draw();
        };
        this.animationId = requestAnimationFrame(loop);
    }

    /**
     * 事件消费：穿门高亮/音效一律以**内核事件**为准，不再靠比对 side 数组反推。
     * （side 变化也可能来自「门超时关闭那一步把带内分子推到新侧」，那不是一次放行。）
     */
    consumeEvents() {
        const w = this.world;
        if (!w || !w.events.length) return;
        const evs = w.events.splice(0, w.events.length);
        for (const e of evs) {
            if (e.type === 'gate') {
                Sfx.gate();
            } else if (e.type === 'gateCancel') {
                Sfx.gateClose();
            } else if (e.type === 'gateExpire') {
                Sfx.gateClose();
                this.showToast(this.t('gateExpired'));
            } else if (e.type === 'pass') {
                this.passFlash = 1;
                this.burst(DOOR_X, e.y || DOOR_Y, e.hot ? HOT : COLD, 10);
                Sfx.pass(e.hot);
            } else if (e.type === 'scan') {
                Sfx.scan();
            } else if (e.type === 'broke') {
                Sfx.broke();
                this.showToast(this.t('brokeToast'));
            } else if (e.type === 'won') {
                this.burst(DOOR_X, DOOR_Y, GOLD, 26);
            }
        }
    }

    burst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
            const sp = 40 + Math.random() * 110;
            this.particles.push({
                x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 0.5 + Math.random() * 0.4, t: 0, color, r: 1.2 + Math.random() * 1.5,
            });
        }
    }

    updateParticles(dt) {
        const out = [];
        for (const p of this.particles) {
            p.t += dt;
            if (p.t >= p.life) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.95;
            p.vy = p.vy * 0.95 + 40 * dt;
            out.push(p);
        }
        this.particles = out;
    }

    /* ---------------------- 渲染 ---------------------- */

    draw() {
        const ctx = this.ctx;
        const s = this.renderScale || 1;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.clearRect(0, 0, W, H);

        this.drawBackdrop(ctx);
        if (this.world && this.state !== 'menu') {
            // 顺序：先 vessel/tint 再 bars —— T 读数要画进腔体内部，
            // 若 bars 在 vessel 之前，readout 会被 vessel 的不透明底色盖掉。
            this.drawVessel(ctx);
            this.drawChamberTint(ctx);
            this.drawBars(ctx);
            this.drawScanField(ctx);
            this.drawPartition(ctx);
            this.drawMolecules(ctx);
            this.drawHoldRing(ctx);
            this.drawParticles(ctx);
        } else {
            this.drawMenuAmbience(ctx);
        }
    }

    drawBackdrop(ctx) {
        ctx.fillStyle = '#0b1721';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(126,160,163,0.08)';
        ctx.lineWidth = 1;
        for (let y = 78; y < H; y += 44) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
    }

    /** 顶部：左右腔温度条 + 中央 ΔT；底部：预算条 */
    drawBars(ctx) {
        const w = this.world;
        ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
        ctx.textBaseline = 'middle';

        const barY = 16;
        const barH = 10;
        const drawTemp = (x0, x1, temp, side) => {
            const wdt = x1 - x0;
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            this.roundRect(ctx, x0, barY, wdt, barH, 5);
            ctx.fill();
            const k = clamp(temp / 2, 0, 1);
            ctx.fillStyle = mixHex('#3a5c8f', HOT, clamp((temp - 0.3) / 1.6, 0, 1));
            if (wdt * k > 2) {
                this.roundRect(ctx, x0, barY, Math.max(2, wdt * k), barH, 5);
                ctx.fill();
            }
            // 读数画在**各自腔体内**的顶角：放在 canvas 顶部条下面会压住 vessel
            // 边框（barY+barH+11 = 37 恰好骑在 vessel 顶边 34 上），视觉像被裁断。
            ctx.fillStyle = 'rgba(201,214,255,0.8)';
            ctx.textAlign = side === 'left' ? 'left' : 'right';
            ctx.fillText(`T ${temp.toFixed(2)}`, side === 'left' ? VESSEL_PAD + 12 : W - VESSEL_PAD - 12, VESSEL_PAD + 16);
        };
        drawTemp(40, 252, w.tempL, 'left');
        drawTemp(308, 520, w.tempR, 'right');

        // 中央 ΔT（极小值归零：-0.004.toFixed(2) 会显示 "-0.00"）
        ctx.textAlign = 'center';
        const shown = Math.abs(w.gap) < 0.005 ? 0 : w.gap;
        const hit = w.gap >= this.spec.target;
        ctx.fillStyle = hit ? GOLD : '#e8ecff';
        ctx.font = '800 15px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(`ΔT ${shown >= 0 ? '+' : ''}${shown.toFixed(2)} / ${this.spec.target.toFixed(2)}`, DOOR_X, barY + 5);

        // 底部预算条
        const by = H - 26;
        const bx0 = 40, bx1 = 520;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        this.roundRect(ctx, bx0, by, bx1 - bx0, 8, 4);
        ctx.fill();
        const left = budgetLeft(w);
        const k = clamp(left / w.total, 0, 1);
        if (k > 0.001) {
            ctx.fillStyle = k > 0.35 ? GOLD : '#ff6b7a';
            this.roundRect(ctx, bx0, by, Math.max(2, (bx1 - bx0) * k), 8, 4);
            ctx.fill();
        }
        ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#c9d6ff';
        // 标签放条**下方**：by-9 = 605 会压在 vessel 底边（606）上
        ctx.textAlign = 'left';
        ctx.fillText(`${this.t('budget')} ${left}`, bx0, by + 14);
        ctx.textAlign = 'right';
        ctx.fillText(`${this.t('spent')} ${w.spent} · ${this.t('par')} ${this.spec.par}`, bx1, by + 14);
        ctx.textAlign = 'start';
    }

    roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.arcTo(x + w, y, x + w, y + rr, rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
        ctx.lineTo(x + rr, y + h);
        ctx.arcTo(x, y + h, x, y + h - rr, rr);
        ctx.lineTo(x, y + rr);
        ctx.arcTo(x, y, x + rr, y, rr);
        ctx.closePath();
    }

    drawVessel(ctx) {
        const p = VESSEL.pad;
        this.roundRect(ctx, p, p, W - p * 2, H - p * 2, 18);
        ctx.fillStyle = '#13232d';
        ctx.fill();
        ctx.strokeStyle = 'rgba(183,217,213,0.48)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.save();
        ctx.strokeStyle = 'rgba(225,239,235,0.15)';
        ctx.lineWidth = 1;
        this.roundRect(ctx, p + 8, p + 8, W - p * 2 - 16, H - p * 2 - 16, 12);
        ctx.stroke();
        const bolt = (x, y) => {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#6e858c';
            ctx.fill();
            ctx.strokeStyle = '#b3c6c8';
            ctx.stroke();
        };
        bolt(p + 18, p + 18);
        bolt(W - p - 18, p + 18);
        bolt(p + 18, H - p - 18);
        bolt(W - p - 18, H - p - 18);
        ctx.restore();
    }

    /** 腔体温/冷染色：T 偏离 1 越多，腔体底色越偏向热/冷 */
    drawChamberTint(ctx) {
        const w = this.world;
        const p = VESSEL.pad;
        const wxL = VESSEL.wallX - VESSEL.wallHalf;
        const wxR = VESSEL.wallX + VESSEL.wallHalf;
        const tint = (x, wd, temp, hot) => {
            const k = clamp(Math.abs(temp - 1) / 1.1, 0, 1) * 0.16;
            if (k <= 0.004) return;
            ctx.fillStyle = hot ? `rgba(223,155,98,${(k * 0.72).toFixed(3)})` : `rgba(112,196,193,${(k * 0.72).toFixed(3)})`;
            ctx.fillRect(x, p, wd, H - p * 2);
        };
        // ⚠️ 热色/冷色必须跟随**当前温度**：写死「左=热 右=冷」的话，
        // 玩家把分拣做反了腔体颜色却还在给旧方向背书（实测截图抓到）。
        tint(p + 1, wxL - p - 2, w.tempL, w.tempL >= 1);
        tint(wxR + 1, W - p - wxR - 2, w.tempR, w.tempR >= 1);
        // Fine measurement ticks make the two chambers read as a calibrated
        // apparatus; colour only supplements the numeric temperature labels.
        ctx.save();
        ctx.strokeStyle = 'rgba(218,235,232,0.13)';
        ctx.lineWidth = 1;
        for (let y = p + 52; y < H - p - 18; y += 28) {
            ctx.beginPath();
            ctx.moveTo(p + 12, y); ctx.lineTo(p + 20, y);
            ctx.moveTo(W - p - 12, y); ctx.lineTo(W - p - 20, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** 观测场：以门为中心的虚线圈（花钱才看得见的那一圈） */
    drawScanField(ctx) {
        const w = this.world;
        if (w.revealT <= 0) return;
        const a = clamp(w.revealT / RULES.scanTime, 0, 1);
        ctx.save();
        ctx.strokeStyle = `rgba(111,216,255,${(0.3 * a).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([6, 7]);
        ctx.beginPath();
        ctx.arc(DOOR_X, DOOR_Y, RULES.scanR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        const g = ctx.createRadialGradient(DOOR_X, DOOR_Y, 8, DOOR_X, DOOR_Y, RULES.scanR);
        g.addColorStop(0, `rgba(111,216,255,${(0.09 * a).toFixed(3)})`);
        g.addColorStop(1, 'rgba(111,216,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(DOOR_X, DOOR_Y, RULES.scanR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawPartition(ctx) {
        const p = VESSEL.pad;
        const wxL = VESSEL.wallX - VESSEL.wallHalf;
        const wxR = VESSEL.wallX + VESSEL.wallHalf;
        const dh = this.world.doorHalf;
        const bottomY = H - p;

        ctx.fillStyle = '#2a414d';
        ctx.fillRect(wxL, p, wxR - wxL, (DOOR_Y - dh) - p);
        ctx.fillRect(wxL, DOOR_Y + dh, wxR - wxL, bottomY - (DOOR_Y + dh));
        ctx.strokeStyle = 'rgba(195,222,219,0.32)';
        ctx.lineWidth = 1;
        ctx.strokeRect(wxL + 0.5, p + 0.5, wxR - wxL - 1, (DOOR_Y - dh) - p - 1);
        ctx.strokeRect(wxL + 0.5, DOOR_Y + dh + 0.5, wxR - wxL - 1, bottomY - (DOOR_Y + dh) - 1);

        // 门洞：armed = 正在等第一个撞上门洞的分子
        const open = this.world.gateArmed || this.world.gateOpen;
        const glow = open ? 0.85 : Math.max(0, this.passFlash) * 0.5;
        ctx.fillStyle = open ? `rgba(223,155,98,${(0.48 + 0.32 * glow).toFixed(3)})` : 'rgba(42,65,77,0.98)';
        ctx.fillRect(wxL, DOOR_Y - dh, wxR - wxL, dh * 2);
        ctx.strokeStyle = open ? '#e3aa70' : 'rgba(195,222,219,0.38)';
        ctx.lineWidth = open ? 2 : 1.2;
        ctx.strokeRect(wxL + 0.5, DOOR_Y - dh + 0.5, wxR - wxL - 1, dh * 2 - 1);

        if (open || glow > 0.01) {
            ctx.strokeStyle = `rgba(223,155,98,${(0.55 * (open ? 1 : glow)).toFixed(3)})`;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.arc(DOOR_X, DOOR_Y, 34, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // 武装倒计时：门洞里一条随剩余时间收缩的横杠，让玩家知道「还能等多久」
        if (this.world.gateArmed) {
            const k = clamp(this.world.gateT / RULES.gateWindow, 0, 1);
            ctx.fillStyle = GOLD;
            ctx.fillRect(DOOR_X - 9, DOOR_Y + dh - 6, 18 * k, 3);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(DOOR_X - 9 + 18 * k, DOOR_Y + dh - 6, 18 * (1 - k), 3);
        }

        // 妖之眼
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(DOOR_X, DOOR_Y, 13, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0b1024';
        ctx.fill();
        ctx.strokeStyle = `rgba(227,170,112,${open ? 0.9 : 0.5})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(DOOR_X, DOOR_Y, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = open ? '#e3aa70' : `rgba(227,170,112,${(0.35 + 0.4 * Math.abs(Math.sin(this.time * 1.6))).toFixed(3)})`;
        ctx.fill();
        ctx.restore();
    }

    drawMolecules(ctx) {
        const w = this.world;
        const revealing = w.revealT > 0;
        const fade = clamp(w.revealT / RULES.scanTime, 0, 1);
        for (const m of w.molecules) {
            const d = Math.hypot(m.x - DOOR_X, m.y - DOOR_Y);
            const seen = revealing && d <= RULES.scanR;
            const fast = isFast(m);
            let color = BLIND;
            let alpha = 1;
            if (seen) {
                color = fast ? HOT : COLD;
                alpha = 0.55 + 0.45 * fade;
            } else {
                // 观测余晖：刚显过色的分子残留一点色相，避免闪烁
                alpha = 0.85;
            }
            ctx.save();
            ctx.globalAlpha = alpha;
            // 速度尾迹
            const sp = Math.hypot(m.vx, m.vy) || 1;
            const tl = 6 + clamp(sp / RULES.v0, 0, 2.4) * 7;
            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha * 0.42;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(m.x - m.vx / sp * tl, m.y - m.vy / sp * tl);
            ctx.stroke();
            ctx.globalAlpha = alpha;
            // Blind particles stay neutral and circular.  Once observed, the
            // shape carries the same state as the colour: diamond = fast/hot,
            // circle = slow/cold.
            ctx.beginPath();
            if (seen && fast) {
                ctx.moveTo(m.x, m.y - m.r - 1);
                ctx.lineTo(m.x + m.r + 1, m.y);
                ctx.lineTo(m.x, m.y + m.r + 1);
                ctx.lineTo(m.x - m.r - 1, m.y);
                ctx.closePath();
            } else {
                ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
            }
            ctx.fillStyle = color;
            ctx.fill();
            if (seen) {
                ctx.strokeStyle = fast ? 'rgba(244,196,143,0.85)' : 'rgba(173,229,224,0.85)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    /** 达标保持进度环：绕门一圈，走满即过关 */
    drawHoldRing(ctx) {
        const w = this.world;
        if (w.holding <= 0) return;
        const k = clamp(w.holding / RULES.holdTime, 0, 1);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(DOOR_X, DOOR_Y, 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(DOOR_X, DOOR_Y, 40, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    /** 菜单态：两个腔各飘一团灰分子，门轻轻呼吸 */
    drawMenuAmbience(ctx) {
        const p = VESSEL.pad;
        this.roundRect(ctx, p, p, W - p * 2, H - p * 2, 18);
        ctx.fillStyle = '#13232d';
        ctx.fill();
        ctx.strokeStyle = 'rgba(183,217,213,0.28)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        const wxL = VESSEL.wallX - VESSEL.wallHalf;
        ctx.fillStyle = 'rgba(42,65,77,0.95)';
        ctx.fillRect(wxL, p, VESSEL.wallHalf * 2, H - p * 2);
        ctx.strokeStyle = 'rgba(196,224,220,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(wxL + 0.5, p + 0.5, VESSEL.wallHalf * 2 - 1, H - p * 2 - 1);

        const rng = (() => { let s = 20260921; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
        const t = this.time;
        for (let i = 0; i < 26; i++) {
            const bx = rng() < 0.5 ? p + 20 + rng() * 210 : VESSEL.wallX + 20 + rng() * 210;
            const by = p + 20 + rng() * (H - p * 2 - 40);
            const ph = rng() * 6.28;
            const x = bx + Math.sin(t * 0.7 + ph) * 12;
            const y = by + Math.cos(t * 0.6 + ph * 1.3) * 14;
            const warm = bx < VESSEL.wallX;
            ctx.beginPath();
            if (warm) {
                ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath();
            } else {
                ctx.arc(x, y, 4.2, 0, Math.PI * 2);
            }
            ctx.fillStyle = warm ? 'rgba(223,155,98,0.38)' : 'rgba(112,196,193,0.34)';
            ctx.fill();
        }
        const pulse = 0.4 + 0.3 * Math.sin(t * 1.6);
        ctx.beginPath();
        ctx.arc(DOOR_X, DOOR_Y, 26 + pulse * 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,211,77,${(0.10 + 0.08 * pulse).toFixed(3)})`;
        ctx.fill();
    }

    drawParticles(ctx) {
        for (const p of this.particles) {
            const k = 1 - p.t / p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * k, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = k * 0.85;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}

/* ────────────────────────── 启动 ────────────────────────── */

onReady(() => {
    window.mdGame = new MaxwellDemonGame();
    bindFrame({ logicalWidth: W });
    const more = document.getElementById('mdSideMore');
    if (more) renderMoreGames(more, { exclude: 'maxwell-demon.html' });
    window.mdDrawer = createStatsDrawer({
        idPrefix: 'md',
        getGame: () => window.mdGame,
        onPause: () => window.mdGame && window.mdGame.pauseQuiet(),
        onResume: () => window.mdGame && window.mdGame.resumeQuiet(),
        isBusy: () => !!(window.mdGame && window.mdGame.isRunning()),
        ICONS,
        // ⚠️ 契约是 () => object（整表），不是 (key) => string。
        getText: () => (window.mdGame ? window.mdGame.textTable() : LANGUAGES.en),
    });
    window.mdDrawer.init();
});

onReady(() => {
    bindChrome({
        self: 'maxwell-demon.html',
        // ⚠️ 必须含 'more'：页脚「更多游戏」的展开行为归 chrome。
        // ⚠️ 必须含 'home'：顶栏首页钮是无 href 的 <button>，跳转完全靠 chrome 接管
        //（owns 默认只含 more，漏掉 'home' = 死按钮，verify-chrome §⑧ 会抓）。
        owns: ['more', 'home'],
        // ⚠️ 共享层要的是整表。
        getText: () => (window.mdGame ? window.mdGame.textTable() : LANGUAGES.en),
    });
});
