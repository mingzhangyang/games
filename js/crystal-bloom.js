/**
 * Crystal Bloom 晶绽 — 降温曲线结晶解谜
 * ==================================================================
 * 玩法：一锅热饱和溶液。你要在温度-时间图上**画一条降温曲线**——曲线就是命令：
 *   降得快 ⇒ 过饱和度 S 冲高 ⇒ 尖端抢着长 ⇒ 枝晶 / 针状；
 *   降得慢 ⇒ S 只够长晶面 ⇒ 八面体（菱形）；
 *   搅一搅 ⇒ 浓差被抹平，档位往致密压一档 ⇒ 块晶。
 * 长出来的晶形要和这一皿要的对上，尺寸还得够。
 *
 * 机制即教学：溶解度随温度下降，过饱和度决定晶体往哪个方向长——
 * 所以「怎么冷」比「冷到多少」更重要，曲线形状就是策略本身。
 *
 * 成本 = 锚点数 + 搅拌次数（asc，越小越聪明）。par 由求解器现算，绝不手填。
 *
 * 关卡数据 / 结晶内核在 js/crystal-bloom-rules.js（纯模块，校验器共用）。
 * par 由 scripts/verify-crystal-bloom-levels.mjs 现算。
 *
 * 共享层（2026-09 契约）：game-frame / game-drawer / game-chrome /
 * leaderboard / daily / i18n / safe-storage / analytics / game-sfx / boot。
 */

import {
    STAGE,
    DISH,
    CHART,
    GRID,
    RULES,
    LEVELS,
    HABITS,
    satAt,
    sampleCurve,
    canPlaceAnchor,
    createWorld,
    stepWorld,
    evaluate,
    costOf,
    starsForLevel,
    dailyCourse,
} from './crystal-bloom-rules.js';
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
const CELL = GRID.cell;

const SEED_COLOR = '#ffd34d';
const GOLD = '#ffd34d';
const COOL = '#6fd8ff';
const WARM = '#ff8a5c';
const GOOD = '#7ee0a5';

/** 档位 → 色调（晶体按「长出来时处在哪个档」着色，一眼看出这颗晶体的履历） */
const REGIME_COLOR = { dendrite: '#8fb4ff', octa: '#6fd8ff', blocky: '#7ee0a5' };

// 落锚是「叮」的一声水珠，搅拌是抹平浓差的沙沙声，
// 长成是结晶的和弦，没长成是塌下去的闷响。
// ⚠️ createSfxEngine 是**裸引擎**（只有 tone/noise），没有 click/win 这些语义方法，
//    语义音效要在上面自己包一层 —— 直接拿引擎当 Sfx 用会 Sfx.click is not a function。
const sfxEngine = createSfxEngine();

const Sfx = {
    click() {
        sfxEngine.tone({ freq: 880, type: 'sine', dur: 0.08, vol: 0.07 });
        sfxEngine.tone({ freq: 1320, type: 'sine', dur: 0.05, vol: 0.03, delay: 0.02 });
    },
    gate() {
        sfxEngine.noise({ dur: 0.32, vol: 0.07, filterFreq: 900, filterSlideTo: 260 });
        sfxEngine.tone({ freq: 260, slideTo: 190, type: 'triangle', dur: 0.16, vol: 0.06 });
    },
    win() {
        sfxEngine.tone({ freq: 659, type: 'sine', dur: 0.45, vol: 0.1 });
        sfxEngine.tone({ freq: 988, type: 'sine', dur: 0.4, vol: 0.06, delay: 0.06 });
        sfxEngine.tone({ freq: 1319, type: 'sine', dur: 0.35, vol: 0.05, delay: 0.12 });
    },
    star3() {
        [659, 880, 1175].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.3 + i * 0.1 });
        });
    },
    fail() {
        sfxEngine.tone({ freq: 320, slideTo: 90, type: 'sawtooth', dur: 0.34, vol: 0.09 });
        sfxEngine.noise({ dur: 0.22, vol: 0.05, filterFreq: 520 });
    },
};

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
        title: 'Crystal Bloom',
        subtitle: 'Draw the chill · Grow the habit',
        howto: 'A hot saturated bath cools as you draw its curve on the chart. Every anchor you place is a command: drop the temperature fast and the supersaturation spikes, so tips race ahead and you grow dendrites; ease it down and only the facets advance, giving a clean octahedron; stir the bath and the gradient is wiped flat, packing the crystal into solid blocks. Match the habit this vessel asks for, grow it big enough, land the final temperature inside the band — and pay as little as you can. An anchor costs one; a stir costs one.',
        playLevels: 'Levels',
        playDaily: 'Daily',
        vessel: 'Vessel',
        daily: 'Daily',
        dailyStartToast: 'Five vessels today — the same course for everyone',
        levelSelect: 'Select vessel',
        cost: 'Cost',
        par: 'Par',
        target: 'Habit',
        size: 'Size',
        endTemp: 'End temp',
        chillBy: 'Chill by',
        grow: 'Grow',
        stir: 'Stir',
        running: 'Growing…',
        retry: 'Retry',
        next: 'Next',
        menu: 'Home',
        again: 'Again',
        levelCleared: 'It bloomed!',
        dailyDone: 'Daily complete!',
        notYet: 'Not this time',
        bestToday: 'Your best today',
        stars: 'Stars',
        paid: 'Paid',
        leaderboard: 'Global · Today\'s Run',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        resetTitle: 'Restart vessel',
        home: 'Home',
        playerName: 'Name',
        hint: 'The shape of the curve is the crystal\'s temper — cool fast for ferns, slow for facets',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
        legendTitle: 'Crystal legend',
        legendDendrite: 'Dendrite — ferns and spikes, grown at high supersaturation (fast chill)',
        legendOcta: 'Octahedron — clean facets, grown at middling supersaturation',
        legendBlocky: 'Blocky — dense and solid, grown slowly or with the bath stirred',
        legendNeedle: 'Needle — one direction runs away with it',
        legendStir: 'Stir — wipes the gradient flat and pushes growth one step denser',
        failHabit: 'Wrong habit — that curve grew the wrong kind of crystal',
        failSize: 'Too small — let it grow longer before the solute runs out',
        failEnd: 'Final temperature outside the band',
        failChill: 'Too slow off the mark — it had to be cold by the marker',
        tipSlow: 'Ease it down: a gentle slope keeps supersaturation low and the crystal packs solid',
        tipMid: 'Aim for the middle: facets only advance while supersaturation sits in between',
        tipFast: 'Drop it hard and early — high supersaturation makes the tips race into ferns',
        tipSpike: 'This seed grows along one axis only; let it run, and it becomes a needle',
        tipStir: 'This bath is too cold to grow blocks on its own — stir to wipe the gradient flat',
        tipCrown: 'Fast off the mark, then stir at the peak: skeleton first, facets after',
        stage: 'Vessel',
        stageOf: '{a} / {b}',
        regDendrite: 'Dendrite',
        regOcta: 'Octahedron',
        regBlocky: 'Blocky',
    },
    zh: {
        stats: '数据统计',
        title: '晶绽',
        subtitle: '画好降温 · 长成晶形',
        howto: '一锅热饱和溶液，会照着你在图上画出的曲线降温。你落下的每一个锚点都是一道命令：降得越猛，过饱和度冲得越高，尖端抢着往外窜，长出枝晶；降得平缓，只有晶面在推进，得到干净的八面体；搅一搅，浓差被抹平，晶体就被压成致密的块晶。要让长出来的晶形对上这一皿的要求，尺寸还得够，终温还得落进目标带——而且代价要尽量小。一个锚点算一点，一次搅拌也算一点。',
        playLevels: '关卡模式',
        playDaily: '每日挑战',
        vessel: '皿',
        daily: '每日',
        dailyStartToast: '每日五皿 · 全世界今天同一份赛程',
        levelSelect: '选择皿',
        cost: '代价',
        par: '目标',
        target: '晶形',
        size: '尺寸',
        endTemp: '终温',
        chillBy: '急冷时限',
        grow: '生长',
        stir: '搅拌',
        running: '生长中…',
        retry: '重试',
        next: '下一皿',
        menu: '返回',
        again: '再来一次',
        levelCleared: '绽开了！',
        dailyDone: '每日完成！',
        notYet: '还差一点',
        bestToday: '今日最佳',
        stars: '星数',
        paid: '已付',
        leaderboard: '全球 · 今日赛程',
        noScores: '还没有成绩',
        lbOffline: '排行榜离线',
        copyResult: '复制',
        resetTitle: '重开本皿',
        home: '首页',
        playerName: '昵称',
        hint: '曲线的形状就是晶体的脾气——急冷出霜蕨，缓冷出晶面',
        sideHowTo: '玩法',
        sideRecords: '记录',
        legendTitle: '晶形图鉴',
        legendDendrite: '枝晶——高过饱和度（急冷）下尖端疯长的霜蕨',
        legendOcta: '八面体——中等过饱和度下只推进晶面的干净菱形',
        legendBlocky: '块状——缓冷或搅拌后长成的致密块晶',
        legendNeedle: '针状——只有一个方向在疯长',
        legendStir: '搅拌——抹平浓差，把生长往致密压一档',
        failHabit: '晶形不对——这条曲线长出的是另一种晶体',
        failSize: '太小了——在溶质耗尽之前让它多长一会儿',
        failEnd: '终温没落进目标带',
        failChill: '起步太慢——它必须在标记处之前就冷下来',
        tipSlow: '缓一点：平缓的斜率让过饱和度一直很低，晶体就长得致密',
        tipMid: '取中间：只有过饱和度卡在中段时，晶面才会推进',
        tipFast: '早一点狠降：过饱和度一冲高，尖端就窜成霜蕨',
        tipSpike: '这颗晶种只沿一个方向长；放它跑，就成针',
        tipStir: '这么冷的一锅，光靠曲线长不出块晶——搅拌把浓差抹平',
        tipCrown: '先急冷抢骨架，再在峰值搅拌：先搭枝，后填面',
        stage: '皿',
        stageOf: '{a} / {b}',
        regDendrite: '枝晶档',
        regOcta: '八面体档',
        regBlocky: '块状档',
    },
});

function storageParseProgress() {
    try {
        const obj = JSON.parse(storageGet('cb_progress') || '{}');
        const out = {};
        if (obj && typeof obj === 'object') {
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (v && typeof v === 'object') {
                    out[k] = { stars: clamp(v.stars | 0, 0, 3), bestCost: v.bestCost | 0 };
                }
            }
        }
        return out;
    } catch (e) {
        return {};
    }
}

/* ────────────────────────── 游戏主体 ────────────────────────── */

class CrystalBloomGame {
    constructor() {
        this.canvas = document.getElementById('cb-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        [
            'cb-hud-level', 'cb-budget', 'cb-par', 'cb-reset-btn', 'cb-mute-btn', 'cb-toast',
            'cb-start', 'cb-title', 'cb-subtitle', 'cb-howto', 'cb-btn-levels', 'cb-btn-daily',
            'cb-level-label', 'cb-level-grid', 'cb-daily-best', 'cb-start-mute',
            'cb-side-howto-title', 'cb-side-howto', 'cb-side-records-title', 'cb-side-records',
            'cb-side-legend-title', 'cb-side-legend',
            'cb-clear', 'cb-clear-stars', 'cb-clear-line', 'cb-btn-next', 'cb-btn-replay', 'cb-btn-menu1',
            'cb-over', 'cb-over-title', 'cb-over-score', 'cb-over-sub',
            'cb-btn-again', 'cb-btn-copy', 'cb-btn-menu2',
            'cb-lb-title', 'cb-lb-list', 'cb-lb-status', 'cb-username', 'cb-username-label',
            'cb-hint', 'cb-stir-btn', 'cb-run-btn', 'cb-action-row',
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^cb-/, '')] = el;
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
        this.daily = null;         // { key, display, course:[spec], cursor, totalCost, stars }
        // phase：draw（画曲线，晶体不动） → grow（晶体在长） → done（已判定）
        this.phase = 'draw';
        this.anchors = [];
        this.stirs = [];
        this.stepAcc = 0;
        this.stirFlash = 0;

        this.time = 0;
        this.toastTimer = 0;

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
     * 不是 `(key) => string` —— 传错形态会让共享文案全部静默退回英文。
     */
    textTable() {
        return LANGUAGES[this.lang] || LANGUAGES.en;
    }

    /** 当前晶形名（取内核的 HABITS，页面不另存一份文案） */
    habitName(id) {
        const h = HABITS[id];
        if (!h) return '—';
        return this.lang === 'zh' ? h.zh : h.en;
    }

    regimeName(id) {
        if (id === 'dendrite') return this.t('regDendrite');
        if (id === 'octa') return this.t('regOcta');
        return this.t('regBlocky');
    }

    /** 动作钮只在 playing 态显示（z-index 高于 overlay，菜单态会挡住关卡 chips） */
    syncActionVisibility() {
        const on = this.state === 'playing';
        if (this.el['action-row']) this.el['action-row'].classList.toggle('is-hidden', !on);
        if (this.el['run-btn']) this.el['run-btn'].classList.toggle('is-dimmed', !on);
        // 搅拌只在晶体真的在长时才有意义：draw 阶段按下去是白花一点代价
        if (this.el['stir-btn']) this.el['stir-btn'].classList.toggle('is-dimmed', !(on && this.phase === 'grow'));
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
            // ⚠️ 键名是 soundOn / soundOff（js/icons.js），写错会把字面量 "undefined" 塞进 innerHTML
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
        if (el['run-btn']) {
            el['run-btn'].addEventListener('click', () => this.pressGrow());
        }
        if (el['stir-btn']) {
            el['stir-btn'].addEventListener('click', () => this.pressStir());
        }
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
            ? '晶绽 — 降温曲线结晶解谜'
            : 'Crystal Bloom — Cooling Curve Crystal Puzzle';
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
        if (el['username-label']) el['username-label'].textContent = this.t('playerName');
        if (el['run-btn']) el['run-btn'].title = this.t('grow');
        if (el['stir-btn']) el['stir-btn'].title = this.t('stir');

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
        if (el['budget']) el['budget'].title = this.t('cost');

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
            const p = this.progress[spec.id] || { stars: 0, bestCost: 0 };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cb-chip' + (p.stars > 0 ? ' is-done' : '');
            btn.dataset.level = String(i);
            const num = document.createElement('span');
            num.className = 'cb-chip-num';
            num.textContent = String(i + 1);
            const stars = document.createElement('span');
            stars.className = 'cb-chip-stars';
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
                if (p.bestCost > 0) { bestSum += p.bestCost; bestCount++; }
            }
        }
        const rows = [
            [this.t('vessel'), `${cleared} / ${LEVELS.length}`],
            [this.t('stars'), `${stars} / ${LEVELS.length * 3}`],
            [this.t('paid'), bestCount ? String(bestSum) : '—'],
        ];
        box.innerHTML = '';
        for (const [k, v] of rows) {
            const row = document.createElement('div');
            row.className = 'cb-side-row';
            const kk = document.createElement('span');
            kk.className = 'cb-side-k';
            kk.textContent = k;
            const vv = document.createElement('span');
            vv.className = 'cb-side-v';
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
            ['dendrite', this.t('legendDendrite')],
            ['octa', this.t('legendOcta')],
            ['blocky', this.t('legendBlocky')],
            ['needle', this.t('legendNeedle')],
            ['stir', this.t('legendStir')],
        ];
        box.innerHTML = '';
        for (const [kind, text] of rows) {
            const row = document.createElement('div');
            row.className = 'cb-legend-row';
            const dot = document.createElement('span');
            dot.className = `cb-legend-dot cb-legend-${kind}`;
            const tx = document.createElement('span');
            tx.className = 'cb-legend-text';
            tx.textContent = text;
            row.appendChild(dot);
            row.appendChild(tx);
            box.appendChild(row);
        }
    }

    /* ---------------------- 模式与关卡流程 ---------------------- */

    startLevels() {
        track('crystal-bloom', 'start_levels');
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
        this.daily = { key, display: todayKeyDisplay(), course, cursor: 0, totalCost: 0, stars: 0 };
        track('crystal-bloom', 'start_daily');
        this.startLevel(course[0]);
        this.showToast(this.t('dailyStartToast'));
    }

    startLevel(ref) {
        const spec = (ref && typeof ref === 'object') ? ref : LEVELS[clamp(ref, 0, LEVELS.length - 1)];
        const idx = LEVELS.indexOf(spec);
        this.levelIdx = idx >= 0 ? idx : 0;
        this.spec = spec;
        this.anchors = [];
        this.stirs = [];
        this.phase = 'draw';
        this.stepAcc = 0;
        this.stirFlash = 0;
        // 每日模式用日期键播种，保证全世界同一天拿到同一颗晶体
        const seedKey = (this.mode === 'daily' && this.daily)
            ? `${spec.id}-${this.daily.key}`
            : spec.id;
        this.world = createWorld(spec, seedKey);
        this.world.anchors = this.anchors;
        this.world.stirs = this.stirs;
        this.state = 'playing';
        this.isPaused = false;
        this.lastFrame = 0;
        this.hide(this.el['start']);
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.syncActionVisibility();
        this.updateHud();
        this.showToast(this.t(this.spec.tipKey || 'tipSlow'));
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
        this.phase = 'draw';
        this.anchors = [];
        this.stirs = [];
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.show(this.el['start']);
        this.syncActionVisibility();
        this.renderLevelGrid();
        this.renderSideRecords();
    }

    /* ---------------------- 动作 ---------------------- */

    /** 按 Grow：draw → grow。已经判定过的关卡不会重入。 */
    pressGrow() {
        if (this.state !== 'playing' || this.isPaused) return;
        if (this.phase !== 'draw') return;
        this.phase = 'grow';
        this.stepAcc = 0;
        Sfx.click();
        this.syncActionVisibility();
        track('crystal-bloom', 'grow', this.anchors.length);
    }

    /** 按 Stir：在当前时刻记一次搅拌（窗口 [t, t+stirSpan)），成本 +1 */
    pressStir() {
        if (this.state !== 'playing' || this.isPaused) return;
        if (this.phase !== 'grow' || !this.world) return;
        this.stirs.push(this.world.t);
        this.stirFlash = 1;
        Sfx.gate();
        vibrate(18);
        this.updateHud();
        track('crystal-bloom', 'stir', this.stirs.length);
    }

    /** 图上落一个锚点 */
    placeAnchor(t, T) {
        if (this.state !== 'playing' || this.isPaused || !this.world) return false;
        if (this.phase === 'done') return false;
        // 生长中只能改**未来**：落一个已经过去时刻的锚点等于篡改历史
        if (this.phase === 'grow' && t <= this.world.t + 0.5) return false;
        if (!canPlaceAnchor(this.spec, this.anchors, t, T)) return false;
        this.anchors.push({ t, T });
        this.anchors.sort((a, b) => a.t - b.t);
        Sfx.click();
        this.updateHud();
        return true;
    }

    /* ---------------------- 结算 ---------------------- */

    onGrowDone() {
        const w = this.world;
        const ev = evaluate(this.spec, w);
        const cost = costOf(this.anchors, this.stirs);
        w.cost = cost;
        this.phase = 'done';
        this.syncActionVisibility();
        if (!ev.pass) {
            this.onLevelFailed(ev);
            return;
        }
        Sfx.win();
        vibrate(30);
        const stars = starsForLevel(cost, this.spec.par, true, w.quality, this.spec.minQuality);
        const p = this.progress[this.spec.id] || { stars: 0, bestCost: 0 };
        if (stars > p.stars) p.stars = stars;
        if (p.bestCost === 0 || cost < p.bestCost) p.bestCost = cost;
        this.progress[this.spec.id] = p;
        this.saveProgress();
        this.renderLevelGrid();
        this.renderSideRecords();

        if (this.mode === 'daily' && this.daily) {
            this.daily.totalCost += cost;
            this.daily.stars += stars;
        } else {
            this.maybeSubmitCampaign();
        }
        this.showClearPanel(stars, cost);
        if (stars === 3) Sfx.star3();
        track('crystal-bloom', 'level_win', stars);
    }

    /**
     * 失败：把**缺哪一项**直接写在面板上。
     * 只说「未达标」的话玩家不知道该改曲线哪一段——判定的四项本来就互相独立。
     */
    onLevelFailed(ev) {
        if (this.state !== 'playing') return;
        this.state = 'failed';
        this.syncActionVisibility();
        Sfx.fail();
        vibrate([25, 40, 25]);
        const why = !ev.chilled ? this.t('failChill')
            : !ev.endOk ? this.t('failEnd')
                : !ev.shapeOk ? this.t('failHabit')
                    : this.t('failSize');
        const el = this.el;
        if (el['clear-stars']) el['clear-stars'].textContent = this.t('notYet');
        if (el['clear-line']) {
            const w = this.world;
            el['clear-line'].textContent = `${why} · ${this.t('target')} ${this.habitName(this.spec.target)} → ${w.habit ? this.habitName(w.habit) : '—'} · ${this.t('size')} ${w.cells}/${this.spec.minCells}`;
        }
        if (el['btn-next']) el['btn-next'].style.display = 'none';
        this.show(el['clear']);
        track('crystal-bloom', 'level_fail', 0);
    }

    /** 战役全通 → 提交各关最小代价总和（asc 榜） */
    maybeSubmitCampaign() {
        let sum = 0, complete = true;
        for (const spec of LEVELS) {
            const p = this.progress[spec.id];
            if (!p || p.stars === 0) { complete = false; break; }
            sum += p.bestCost;
        }
        if (complete && sum > 0) this.submit('crystal-bloom', sum);
    }

    showClearPanel(stars, cost) {
        const el = this.el;
        this.state = 'won-level';
        if (el['clear-stars']) el['clear-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        if (el['clear-line']) {
            const w = this.world;
            el['clear-line'].textContent = `${this.t('cost')} ${cost} · ${this.t('par')} ${this.spec.par} · ${this.habitName(w.habit)} ${w.cells}`;
        }
        const isLast = this.mode === 'levels' && this.levelIdx + 1 >= LEVELS.length;
        if (el['btn-next']) {
            el['btn-next'].style.display = (this.mode === 'daily') ? '' : (isLast ? 'none' : '');
        }
        this.syncActionVisibility();
        this.show(el['clear']);
    }

    finishDaily() {
        this.state = 'won-daily';
        const el = this.el;
        this.hide(el['clear']);
        if (el['over-title']) el['over-title'].textContent = this.t('dailyDone');
        if (el['over-score']) el['over-score'].textContent = `${this.t('cost')} ${this.daily.totalCost} · ★ ${this.daily.stars}`;
        if (el['over-sub']) el['over-sub'].textContent = `${this.t('bestToday')}: ${this.daily.display}`;
        this.syncActionVisibility();
        this.show(el['over']);
        // 提交每日成绩（asc：代价越小越好）
        const game = `crystal-bloom-d${this.daily.key.replace(/-/g, '')}`;
        this.submit(game, this.daily.totalCost);
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
            const raw = storageGet('cb_lb_' + game);
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
            li.className = 'cb-lb-row';
            if (i < 3) li.classList.add(`cb-lb-top${i + 1}`);
            const rank = document.createElement('span');
            rank.className = 'cb-lb-rank';
            rank.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'cb-lb-name';
            nm.textContent = row.name || '—';
            const sc = document.createElement('span');
            sc.className = 'cb-lb-score';
            sc.textContent = String(row.score);
            li.appendChild(rank);
            li.appendChild(nm);
            li.appendChild(sc);
            list.appendChild(li);
        });
    }

    copyResult() {
        const text = this.mode === 'daily' && this.daily
            ? `${this.t('title')} · ${this.daily.display} · ${this.t('cost')} ${this.daily.totalCost} · ★${this.daily.stars}`
            : `${this.t('title')} · ${this.t('vessel')} ${this.levelIdx + 1} · ${this.t('cost')} ${costOf(this.anchors, this.stirs)}`;
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
            storageSet('cb_progress', JSON.stringify(this.progress));
        } catch (e) { /* 忽略 */ }
    }

    /* ---------------------- HUD / Toast ---------------------- */

    updateHud() {
        const el = this.el;
        if (el['budget']) el['budget'].textContent = String(costOf(this.anchors, this.stirs));
        if (el['par']) el['par'].textContent = `${this.t('par')} ${this.spec ? this.spec.par : 0}`;
        if (el['hud-level']) {
            if (this.mode === 'daily' && this.daily) {
                el['hud-level'].textContent = `${this.t('daily')} ${this.daily.cursor + 1}/${this.daily.course.length}`;
            } else {
                // ⚠️ 不能加 `&& this.spec` 门槛：菜单态 HUD 会停在静态英文文案不跟随语言。
                el['hud-level'].textContent = `${this.t('vessel')} ${this.levelIdx + 1}/${LEVELS.length}`;
            }
        }
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

    // ⚠️ 类名必须是 `hidden`（css/crystal-bloom.css 与所有 HTML 初始态都用它）。
    show(el) { if (el) el.classList.remove('hidden'); }
    hide(el) { if (el) el.classList.add('hidden'); }

    /* ---------------------- 输入 ---------------------- */

    bindInput() {
        const c = this.canvas;
        c.style.touchAction = 'none';

        document.addEventListener('keydown', (e) => {
            if (e.target instanceof Element && e.target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"]')) return;
            if (e.key === ' ' || e.key === 'Enter') {
                if (this.state === 'playing' && !this.isPaused && !e.repeat) {
                    this.pressGrow();
                    e.preventDefault();
                }
            } else if (e.key === 'f' || e.key === 'F') {
                if (this.state === 'playing' && !this.isPaused && !e.repeat) this.pressStir();
            } else if (e.key === 'r' || e.key === 'R') {
                if (this.state === 'playing' && !this.isPaused) this.restartLevel();
            } else if (e.key === 'Escape') {
                if (this.state === 'playing' && !this.isPaused) this.toMenu();
            }
        });

        // 图上落锚点：pointerdown 直接触发（不等 click，移动端更跟手）
        c.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing' || this.isPaused) return;
            if (e.cancelable) e.preventDefault();
            const p = this.chartFromEvent(e);
            if (!p) return;
            this.placeAnchor(p.t, p.T);
        });
        c.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /** 画布像素 → 舞台逻辑坐标（后端缓冲区按 renderScale 放大过） */
    stageFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) / rect.width * W;
        const sy = (e.clientY - rect.top) / rect.height * H;
        return { x: sx, y: sy };
    }

    /** 舞台坐标 → 图上的 (t, T)；不在图区内返回 null */
    chartFromEvent(e) {
        const p = this.stageFromEvent(e);
        if (p.x < CHART.x - 6 || p.x > CHART.x + CHART.w + 6) return null;
        if (p.y < CHART.y - 6 || p.y > CHART.y + CHART.h + 6) return null;
        const spec = this.spec;
        const u = clamp((p.x - CHART.x) / CHART.w, 0, 1);
        const t = clamp(Math.round(u * spec.tMax), 1, spec.tMax);
        const vy = clamp((p.y - CHART.y) / CHART.h, 0, 1);
        const [TLo, THi] = RULES.tRange;
        let T = THi - vy * (THi - TLo);
        T = clamp(Math.round(T * 2) / 2, TLo, THi);
        // 温度不许回升：贴着上一个锚点的温度往下压一点，保证一定合法
        const prev = this.anchors.length ? this.anchors[this.anchors.length - 1].T : spec.t0;
        if (T > prev) T = prev;
        return { t, T };
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
            if (this.stirFlash > 0) this.stirFlash = Math.max(0, this.stirFlash - dt * 1.6);
            if (this.state === 'playing' && this.phase === 'grow' && this.world) {
                this.stepAcc += dt * RULES.stepsPerSecond;
                let guard = 12;
                while (this.stepAcc >= 1 && guard-- > 0 && this.world.state !== 'done') {
                    this.stepAcc -= 1;
                    stepWorld(this.world, this.anchors, this.stirs);
                }
                this.updateHud();
                if (this.world.state === 'done') this.onGrowDone();
            }
            this.draw();
        };
        this.animationId = requestAnimationFrame(loop);
    }

    /* ---------------------- 绘制 ---------------------- */

    draw() {
        const ctx = this.ctx;
        if (!ctx) return;
        const rs = this.renderScale || 1;
        ctx.setTransform(rs, 0, 0, rs, 0, 0);
        ctx.clearRect(0, 0, W, H);

        if (this.state === 'menu' || !this.world || !this.spec) {
            this.drawMenuAmbience(ctx);
            return;
        }
        this.drawDish(ctx);
        this.drawCrystal(ctx);
        this.drawStir(ctx);
        this.drawChart(ctx);
        this.drawHudStrip(ctx);
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

    drawDish(ctx) {
        this.roundRect(ctx, DISH.x, DISH.y, DISH.w, DISH.h, 14);
        ctx.fillStyle = '#10202a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(183,229,226,0.42)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // Thick glass rim and a quiet meniscus make this read as a lab vessel,
        // not a generic rounded game panel.
        ctx.save();
        ctx.strokeStyle = 'rgba(221,241,238,0.16)';
        ctx.lineWidth = 1;
        this.roundRect(ctx, DISH.x + 7, DISH.y + 7, DISH.w - 14, DISH.h - 14, 10);
        ctx.stroke();
        const meniscusY = DISH.y + 34;
        ctx.strokeStyle = 'rgba(105,199,199,0.36)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(DISH.x + 16, meniscusY);
        ctx.quadraticCurveTo(DISH.x + DISH.w / 2, meniscusY + 3, DISH.x + DISH.w - 16, meniscusY);
        ctx.stroke();
        ctx.fillStyle = 'rgba(105,199,199,0.07)';
        ctx.fillRect(DISH.x + 2, meniscusY + 1, DISH.w - 4, DISH.h - 3);
        ctx.fillStyle = 'rgba(219,236,235,0.48)';
        ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('SATURATION VESSEL', DISH.x + 16, DISH.y + 14);
        for (let i = 0; i < 5; i++) {
            const x = DISH.x + 18 + i * 120;
            ctx.strokeStyle = 'rgba(219,236,235,0.16)';
            ctx.beginPath();
            ctx.moveTo(x, DISH.y + DISH.h - 18);
            ctx.lineTo(x, DISH.y + DISH.h - 11);
            ctx.stroke();
        }
        ctx.restore();
        // 饱和线：当前温度下的饱和浓度，画成皿底一条刻度（浓度降到它就是终点）
        const k = clamp(this.world.conc / satAt(this.spec.t0), 0, 1);
        ctx.fillStyle = 'rgba(105,199,199,0.18)';
        ctx.fillRect(DISH.x + 2, DISH.y + DISH.h - 8, (DISH.w - 4) * k, 5);
    }

    /**
     * 晶体：按**长出来时正处在哪个档**着色 —— 一颗晶体的履历一眼可读
     * （先急冷后缓冷的，中心是枝晶色、外圈是块晶色）。
     */
    drawCrystal(ctx) {
        const w = this.world;
        const { cols, rows, grid, age } = w;
        const t0 = 1, tN = this.spec.tMax;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                if (!grid[i]) continue;
                const px = DISH.x + x * CELL;
                const py = DISH.y + y * CELL;
                let color;
                if (age[i] === 0) {
                    color = SEED_COLOR;
                } else {
                    const h = w.history[Math.min(age[i], w.history.length - 1)];
                    const reg = h ? h.regime : 'blocky';
                    color = REGIME_COLOR[reg] || COOL;
                    // 越晚长出来的越亮
                    const k = clamp((age[i] - t0) / Math.max(1, tN), 0, 1);
                    color = mixHex('#2b3a63', color, 0.45 + 0.55 * (1 - k));
                }
                ctx.fillStyle = color;
                ctx.fillRect(px, py, CELL, CELL);
            }
        }

        // Hairline crystal facets: the small cells remain the deterministic
        // simulation, while these edges give the specimen a readable mineral
        // silhouette at phone scale.
        ctx.save();
        ctx.strokeStyle = 'rgba(226,244,239,0.26)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                if (!grid[i]) continue;
                const px = DISH.x + x * CELL;
                const py = DISH.y + y * CELL;
                if (x === 0 || !grid[i - 1]) { ctx.moveTo(px, py); ctx.lineTo(px, py + CELL); }
                if (x === cols - 1 || !grid[i + 1]) { ctx.moveTo(px + CELL, py); ctx.lineTo(px + CELL, py + CELL); }
                if (y === 0 || !grid[i - cols]) { ctx.moveTo(px, py); ctx.lineTo(px + CELL, py); }
                if (y === rows - 1 || !grid[i + cols]) { ctx.moveTo(px, py + CELL); ctx.lineTo(px + CELL, py + CELL); }
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    /** 搅拌：皿里一圈转起来的涟漪（窗口内才转，过档就停 —— 搅拌是限时的） */
    drawStir(ctx) {
        const w = this.world;
        if (!w.stirred && this.stirFlash <= 0) return;
        const cx = DISH.x + DISH.w / 2, cy = DISH.y + DISH.h / 2;
        const a = w.stirred ? 0.5 : this.stirFlash * 0.5;
        ctx.save();
        ctx.strokeStyle = `rgba(126,224,165,${a.toFixed(3)})`;
        ctx.lineWidth = 2;
        for (let r = 26; r <= 130; r += 26) {
            const ph = this.time * 2.2 + r * 0.05;
            ctx.beginPath();
            ctx.arc(cx, cy, r, ph, ph + Math.PI * 1.35);
            ctx.stroke();
        }
        ctx.restore();
    }

    /* ---------------------- 温度-时间图 ---------------------- */

    chartX(t) { return CHART.x + (t / this.spec.tMax) * CHART.w; }
    chartY(T) {
        const [TLo, THi] = RULES.tRange;
        return CHART.y + CHART.h - ((T - TLo) / (THi - TLo)) * CHART.h;
    }

    drawChart(ctx) {
        const spec = this.spec;
        const [TLo, THi] = RULES.tRange;
        // 底
        this.roundRect(ctx, CHART.x, CHART.y, CHART.w, CHART.h, 10);
        ctx.fillStyle = 'rgba(10,14,32,0.92)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(168,184,255,0.28)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // 终温目标带
        const yHi = this.chartY(spec.tEndMax);
        const yLo = this.chartY(spec.tEndMin);
        ctx.fillStyle = 'rgba(126,224,165,0.14)';
        ctx.fillRect(CHART.x + 1, yHi, CHART.w - 2, Math.max(3, yLo - yHi));
        ctx.strokeStyle = 'rgba(126,224,165,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(CHART.x + 1, yHi + 0.5); ctx.lineTo(CHART.x + CHART.w - 1, yHi + 0.5);
        ctx.moveTo(CHART.x + 1, yLo - 0.5); ctx.lineTo(CHART.x + CHART.w - 1, yLo - 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        // 刻度：温度 10/50/90
        ctx.fillStyle = 'rgba(168,184,255,0.55)';
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (const T of [TLo, 50, THi]) {
            const y = this.chartY(T);
            ctx.fillText(`${T}°`, CHART.x - 6, y);
            ctx.fillStyle = 'rgba(168,184,255,0.16)';
            ctx.fillRect(CHART.x + 1, y, CHART.w - 2, 1);
            ctx.fillStyle = 'rgba(168,184,255,0.55)';
        }

        // 急冷时限：必须在这条线之前降到目标带里
        const xc = this.chartX(spec.tChill);
        ctx.strokeStyle = 'rgba(255,211,77,0.75)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xc, CHART.y); ctx.lineTo(xc, CHART.y + CHART.h);
        ctx.stroke();
        ctx.setLineDash([]);

        // 曲线：逐像素采样（段间线性，画出来就是折线）
        ctx.strokeStyle = COOL;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let px = 0; px <= CHART.w; px++) {
            const t = (px / CHART.w) * spec.tMax;
            const T = sampleCurve(spec, this.anchors, t);
            const x = CHART.x + px, y = this.chartY(T);
            if (px === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 锚点
        for (const a of this.anchors) {
            const x = this.chartX(a.t), y = this.chartY(a.T);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = GOLD;
            ctx.fill();
            ctx.strokeStyle = 'rgba(8,12,28,0.9)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }

        // 游标：晶体现在走到哪一步
        if (this.phase !== 'draw') {
            const x = this.chartX(clamp(this.world.t, 0, spec.tMax));
            const y = this.chartY(this.world.temp);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x, CHART.y); ctx.lineTo(x, CHART.y + CHART.h);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
    }

    /** 皿与图之间那条信息带：目标晶形 / 当前档位 / 过饱和度 */
    drawHudStrip(ctx) {
        const spec = this.spec;
        const w = this.world;
        const y = DISH.y + DISH.h + 8;
        ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(168,184,255,0.75)';
        const sizeText = `${this.t('target')} ${this.habitName(spec.target)} · ${this.t('size')} ${w.cells}/${spec.minCells} · ${this.t('endTemp')} ${spec.tEndMin}–${spec.tEndMax}°`;
        ctx.fillText(sizeText, DISH.x + 2, y + 8);

        // 过饱和度条：S 越高越红，档位分界线画成刻度
        const bx = DISH.x + 2, bw = DISH.w - 4, by = y + 22;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx, by, bw, 6);
        const k = clamp(w.s / 1.5, 0, 1);
        ctx.fillStyle = mixHex(GOOD, WARM, k);
        ctx.fillRect(bx, by, bw * k, 6);
        for (const [s, col] of [[RULES.sOcta, COOL], [RULES.sDend, WARM]]) {
            const x = bx + bw * clamp(s / 1.5, 0, 1);
            ctx.fillStyle = col;
            ctx.fillRect(x - 0.5, by - 2, 1, 10);
        }
        ctx.fillStyle = 'rgba(168,184,255,0.6)';
        ctx.textAlign = 'left';
        ctx.fillText(`S ${w.s.toFixed(2)} · ${this.regimeName(w.regime)}`, bx, by + 18);
        ctx.textAlign = 'right';
        ctx.fillText(this.phase === 'grow' ? this.t('running') : this.t('grow'), bx + bw, by + 18);
        ctx.textAlign = 'left';
    }

    /** 菜单态：皿里飘几粒未成形的晶核，图上一条默认曲线 */
    drawMenuAmbience(ctx) {
        this.roundRect(ctx, DISH.x, DISH.y, DISH.w, DISH.h, 14);
        ctx.fillStyle = '#10202a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(183,229,226,0.28)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        const rng = (() => { let s = 20260922; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
        for (let i = 0; i < 22; i++) {
            const bx = DISH.x + 24 + rng() * (DISH.w - 48);
            const by = DISH.y + 24 + rng() * (DISH.h - 48);
            const ph = rng() * 6.28;
            const x = bx + Math.sin(this.time * 0.5 + ph) * 9;
            const y = by + Math.cos(this.time * 0.42 + ph * 1.2) * 11;
            ctx.beginPath();
            ctx.moveTo(x, y - 4 - rng() * 3);
            ctx.lineTo(x + 3 + rng() * 2, y);
            ctx.lineTo(x, y + 4 + rng() * 3);
            ctx.lineTo(x - 3 - rng() * 2, y);
            ctx.closePath();
            ctx.fillStyle = i % 3 === 0 ? 'rgba(183,144,85,0.32)' : 'rgba(105,199,199,0.26)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(226,244,239,0.18)';
            ctx.stroke();
        }

        this.roundRect(ctx, CHART.x, CHART.y, CHART.w, CHART.h, 10);
        ctx.fillStyle = 'rgba(10,14,32,0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(168,184,255,0.18)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }
}

/* ────────────────────────── 启动 ────────────────────────── */

onReady(() => {
    window.cbGame = new CrystalBloomGame();
    bindFrame({ logicalWidth: W });
    const more = document.getElementById('cbSideMore');
    if (more) renderMoreGames(more, { exclude: 'crystal-bloom.html' });
    window.cbDrawer = createStatsDrawer({
        idPrefix: 'cb',
        getGame: () => window.cbGame,
        onPause: () => window.cbGame && window.cbGame.pauseQuiet(),
        onResume: () => window.cbGame && window.cbGame.resumeQuiet(),
        isBusy: () => !!(window.cbGame && window.cbGame.isRunning()),
        ICONS,
        // ⚠️ 契约是 () => object（整表），不是 (key) => string。
        getText: () => (window.cbGame ? window.cbGame.textTable() : LANGUAGES.en),
    });
    window.cbDrawer.init();
});

onReady(() => {
    bindChrome({
        self: 'crystal-bloom.html',
        // ⚠️ 必须含 'more' 与 'home'：owns 默认只含 more，漏掉 'home' = 死按钮。
        owns: ['more', 'home'],
        // ⚠️ 共享层要的是整表。
        getText: () => (window.cbGame ? window.cbGame.textTable() : LANGUAGES.en),
    });
});
