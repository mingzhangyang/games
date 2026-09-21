/**
 * Silkfall 垂丝引露 — 绳索牵拉物理解谜
 * =====================================
 * 玩法：**拖拽锚结**（丝线的悬点）牵引丝线，把系在丝尾的露珠引过夜庭，
 * 避开荆棘、收集星芒、借气泡浮力与气旋推力，最终坠入玉壶。
 *
 * 机制说明（M1 修订）：
 *   原方案「剪断摆绳靠摆动甩出」经实测摆幅仅 53px、落点散布 47px（< 壶口 88px），
 *   产不出有效谜题。改为**拖拽牵引**后露珠横向可达 431px，谜题空间成立。
 *   绳索仍是 verlet 链：拖拽时自然下垂、甩动、绷紧。
 *
 * 关卡数据 / 物理核心在 js/silk-dew-levels.js（纯模块，校验器共用）。
 *
 * 共享层（2026-09 契约）：game-frame / game-drawer / game-chrome /
 * leaderboard / daily / i18n / safe-storage / analytics / game-sfx / boot。
 */

import {
    STAGE,
    PHYS,
    LEVELS,
    createWorld,
    stepWorld,
    beginDrag,
    moveDrag,
    endDrag,
    popBubble,
    bubbleAt,
    dailyCourse,
} from './silk-dew-levels.js';
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

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
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
        title: 'Silkfall',
        subtitle: 'Drag · Guide · Gather',
        howto: 'Drag the golden anchor knots to swing the silk. Your dew pearl follows the thread — steer it past the thorns, pop bubbles to ride them upward, and let the breezes carry you into the jade vessel. Fewer drags, more stars!',
        playLevels: '🧵 Levels',
        playDaily: '📅 Daily',
        level: 'Level',
        daily: 'Daily',
        levelSelect: 'Select level',
        drags: 'Drags',
        dragsWord: 'drags',
        par: 'Par',
        dailyStartToast: '📅 Daily course — 5 stages · fewest drags wins',
        retry: 'Retry',
        next: 'Next',
        menu: 'Home',
        again: 'Again',
        levelCleared: 'Into the vessel!',
        levelDone: 'All levels cleared!',
        dailyDone: 'Daily complete!',
        bestToday: 'Your best today',
        stars: 'Stars',
        leaderboard: 'Global · Today\'s Course',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        resetTitle: 'Restart level',
        home: 'Home',
        hint: 'Drag the anchor to swing the silk · guide the dew into the jade vessel',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
        tipCut: 'Drag the anchor knot to swing the thread',
        tipSwing: 'Longer drags give a wider reach',
        tipTwoRopes: 'You can drag any anchor — pick the right thread',
        tipThorn: 'Thorns shatter the pearl — keep clear',
        tipThread: 'Thread the gap carefully',
        tipBreeze: 'Breezes push the pearl — use them',
        tipBubble: 'Pop a bubble to ride it up, or let it carry you',
        tipTiming: 'Reach matters — plan the swing',
        tipAll: 'Everything at once — take your time',
        tipFinal: 'The last drop of dew',
        stage: 'Stage',
        stageOf: '{a} / {b}',
        failThorn: 'The thorns shattered your pearl',
        failOut: 'Your pearl fell out of the garden',
        noteDrag: 'Hold and drag the golden anchor',
        notePearl: 'Or drag the pearl itself (the thread limits its reach)',
        noteBubble: 'Tap a bubble to pop it',
    },
    zh: {
        stats: '数据统计',
        title: '垂丝引露',
        subtitle: '牵丝 · 引露 · 拾星',
        howto: '拖动金色的锚结牵引丝线，丝尾的露珠会随之摆动。引它绕过荆棘、点破气泡借浮力上浮、顺气旋横渡夜庭，最终坠入玉壶。拖拽次数越少，星星越多！',
        playLevels: '🧵 关卡模式',
        playDaily: '📅 每日挑战',
        level: '关卡',
        daily: '每日',
        levelSelect: '选择关卡',
        drags: '拖拽',
        dragsWord: '次拖拽',
        par: '目标',
        dailyStartToast: '📅 每日课程——5 个关卡 · 拖拽次数越少越好',
        retry: '重试',
        next: '下一关',
        menu: '返回主页',
        again: '再来一次',
        levelCleared: '露珠入壶！',
        levelDone: '全部关卡通关！',
        dailyDone: '每日挑战完成！',
        bestToday: '今日最好成绩',
        stars: '星星',
        leaderboard: '全球榜 · 今日课程',
        noScores: '暂无成绩',
        lbOffline: '榜单离线',
        copyResult: '复制',
        resetTitle: '重开本关',
        home: '主页',
        hint: '拖动锚结牵引丝线 · 引露珠入玉壶',
        sideHowTo: '玩法说明',
        sideRecords: '战绩',
        tipCut: '拖动金色锚结，丝线随之摆荡',
        tipSwing: '拖得越远，露珠可达范围越大',
        tipTwoRopes: '多根丝都可拖——选对那一根',
        tipThorn: '荆棘会击碎露珠，务必绕开',
        tipThread: '小心穿过缝隙',
        tipBreeze: '气旋会推动露珠，善加利用',
        tipBubble: '点破气泡上浮，或让它载你一程',
        tipTiming: '够不够得着，全看这一荡',
        tipAll: '元素齐全——慢慢来',
        tipFinal: '最后一滴露水',
        stage: '关卡',
        stageOf: '{a} / {b}',
        failThorn: '露珠撞上了荆棘',
        failOut: '露珠掉出了夜庭',
        noteDrag: '按住并拖动金色锚结',
        notePearl: '也可直接拖露珠（受丝长限制）',
        noteBubble: '点击气泡可以点破它',
    }
});

/* ────────────────────────── 音效 ────────────────────────── */
// 五声音阶（宫商角徵羽）：星芒按收集顺序递进，与御剑飞行听觉血缘

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.00];
const sfxEngine = createSfxEngine();

const Sfx = {
    click() { sfxEngine.tone({ freq: 640, type: 'square', dur: 0.05, vol: 0.06 }); },
    /** 抓住锚结：低频「握」感 */
    grab() { sfxEngine.tone({ freq: 320, type: 'sine', dur: 0.06, vol: 0.09 }); },
    /** 松开 */
    release() { sfxEngine.tone({ freq: 300, slideTo: 190, type: 'sine', dur: 0.09, vol: 0.06 }); },
    /** 星芒：五声音阶递进 */
    star(n) {
        const f = PENTA[(n - 1) % PENTA.length];
        sfxEngine.tone({ freq: f, type: 'sine', dur: 0.16, vol: 0.13 });
        sfxEngine.tone({ freq: f * 2, type: 'sine', dur: 0.1, vol: 0.05, delay: 0.03 });
    },
    /** 破泡：短促「啵」 */
    pop() { sfxEngine.tone({ freq: 900, slideTo: 1500, type: 'sine', dur: 0.07, vol: 0.09 }); },
    /** 归壶：玉磬一记 */
    win() {
        sfxEngine.tone({ freq: 1046, type: 'sine', dur: 0.5, vol: 0.11 });
        sfxEngine.tone({ freq: 1568, type: 'sine', dur: 0.4, vol: 0.06, delay: 0.05 });
        sfxEngine.tone({ freq: 2093, type: 'sine', dur: 0.3, vol: 0.03, delay: 0.1 });
    },
    star3() {
        [784, 988, 1175].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.3 + i * 0.1 });
        });
    },
    fail() {
        sfxEngine.tone({ freq: 300, slideTo: 120, type: 'sawtooth', dur: 0.3, vol: 0.1 });
        sfxEngine.noise({ dur: 0.2, vol: 0.06, filterFreq: 500 });
    },
};

/* ────────────────────────── 存储 ────────────────────────── */

function storageParseProgress() {
    try {
        const obj = JSON.parse(storageGet('sd_progress'));
        const out = {};
        if (obj && typeof obj === 'object') {
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (v && typeof v === 'object') {
                    out[k] = { stars: clamp(v.stars | 0, 0, 3), bestDrags: v.bestDrags | 0 };
                }
            }
        }
        return out;
    } catch (e) {
        return {};
    }
}

/* ────────────────────────── 游戏主体 ────────────────────────── */

class SilkfallGame {
    constructor() {
        this.canvas = document.getElementById('sd-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        [
            'sd-hud-level', 'sd-drags', 'sd-par', 'sd-reset-btn', 'sd-mute-btn', 'sd-toast',
            'sd-start', 'sd-title', 'sd-subtitle', 'sd-howto', 'sd-btn-levels', 'sd-btn-daily',
            'sd-level-label', 'sd-level-grid', 'sd-daily-best', 'sd-start-mute',
            'sd-side-howto-title', 'sd-side-howto', 'sd-side-records-title', 'sd-side-records',
            'sd-clear', 'sd-clear-stars', 'sd-clear-line', 'sd-btn-next', 'sd-btn-replay', 'sd-btn-menu1',
            'sd-over', 'sd-over-title', 'sd-over-score', 'sd-over-sub',
            'sd-btn-again', 'sd-btn-copy', 'sd-btn-menu2',
            'sd-lb-title', 'sd-lb-list', 'sd-lb-status', 'sd-username', 'sd-username-label',
            'sd-hint'
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^sd-/, '')] = el;
        });

        this.lang = getLang();
        this.progress = storageParseProgress();

        // 对局状态：menu | playing | won-level | won-daily | failed
        // ⚠️ 字段名与 verify-stats-drawer.mjs 的 AUGMENT runningExpr 严格对应
        this.state = 'menu';
        this.isPaused = false;
        this.mode = 'levels';
        this.levelIdx = 0;
        this.drags = 0;
        this.par = 1;
        this.world = null;
        this.spec = null;
        this.daily = null;         // { key, display, course:[idx], cursor, totalDrags }
        this.failReason = null;
        this.failTimer = 0;

        // 视觉
        this.time = 0;
        this.frameDt = 0;
        this.toastTimer = 0;
        this.particles = [];
        this.starfield = this.buildStarfield();
        this.pointerId = null;
        this.isDragging = false;
        this.dragMoved = false;

        this.animationId = null;
        this.lastFrame = 0;

        this.feedback = [];
        this.initUI();
        this.applyLanguage();
        this.bindInput();
        this.bindUI();
        this.resize();
        this.startLoop();
    }

    /* ---------------------- 视觉底料 ---------------------- */

    buildStarfield() {
        const rng = (() => { let s = 20260921; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
        const out = [];
        for (let i = 0; i < 70; i++) {
            out.push({ x: rng() * W, y: rng() * H, r: 0.4 + rng() * 1.1, a: 0.15 + rng() * 0.4, ph: rng() * 6.28 });
        }
        return out;
    }

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
     *
     * ⚠️ 共享层的 `getText` 契约是 `() => object`（返回当前语言的文案对象），
     * 不是 `(key) => string`。早先这里传的是 `(k) => this.t(k)`，于是共享层内部
     * 的 `getText()` 拿到的是 `t(undefined)` = `undefined`，`|| {}` 之后整表为空，
     * 所有共享文案（抽屉的 stats / close、顶栏的 sound / moreGames / language）
     * 一律退回内置英文兜底 —— 全站 8 个抽屉页里只有 silk-dew 是这样写的，
     * 于是只有它常驻英文，且不报任何错（verify-stats-drawer 的
     * `[zh] 文案已本地化` 是唯一抓得到它的断言）。
     *
     * 这里返回表本体（LANGUAGES 已由 makeText 挂上 COMMON_TEXT 原型链，
     * close / moreGames / sound / language 这些公共键会自动兜底）。
     */
    textTable() {
        return LANGUAGES[this.lang] || LANGUAGES.en;
    }

    /* ---------------------- UI 初始化 ---------------------- */

    initUI() {
        const el = this.el;
        // 开始菜单：模式瓦片
        if (el['btn-levels']) {
            el['btn-levels'].innerHTML = `${ICONS.play}<span class="btn-text">${this.t('playLevels')}</span>`;
            el['btn-levels'].addEventListener('click', () => { Sfx.click(); this.startLevels(); });
        }
        if (el['btn-daily']) {
            el['btn-daily'].innerHTML = `${ICONS.calendar}<span class="btn-text">${this.t('playDaily')}</span>`;
            el['btn-daily'].addEventListener('click', () => { Sfx.click(); this.startDaily(); });
        }
        // 结算面板
        if (el['btn-next']) {
            el['btn-next'].innerHTML = `${ICONS.arrowRight}<span class="btn-text">${this.t('next')}</span>`;
            el['btn-next'].addEventListener('click', () => { Sfx.click(); this.nextLevel(); });
        }
        if (el['btn-replay']) {
            // ⚠️ 图标键名必须是 ICONS 里真实存在的 `retry`（js/icons.js:28）。
            // 曾经写成 ICONS.refresh —— 该键不存在，求值得 undefined，
            // innerHTML 里塞进字面量 "undefined"，按钮变成「裸文本无图标」：
            // verify-button-icons 报 `svg=0`，而几何/点击断言全绿。
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
            // ⚠️ 键名是 soundOn / soundOff（js/icons.js:20,22），不是 volumeOn/volumeOff。
            // 写错键名会把字面量 "undefined" 塞进 innerHTML —— 图标消失但无报错。
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
        // 每日榜用户名
        if (el['username']) {
            el['username'].value = ensurePlayerName();
            el['username'].addEventListener('change', () => {
                setPlayerName(el['username'].value.trim() || ensurePlayerName());
            });
        }
        this.renderLevelGrid();
    }

    applyLanguage() {
        const el = this.el;
        const setText = (key, text) => { if (el[key]) el[key].textContent = text; };
        // ⚠️ 页面标题必须在这里重写：chrome 校验器会切语言后断言 document.title 变化，
        // 只刷 DOM 文案不换标题 = 「界面没跟着刷新」硬失败（同 lumen/circuit 口径）。
        document.title = this.lang === 'zh'
            ? '垂丝引露 — 绳索物理解谜'
            : 'Silkfall — Rope Physics Puzzle';
        setText('title', this.t('title'));
        setText('subtitle', this.t('subtitle'));
        setText('howto', this.t('howto'));
        setText('level-label', this.t('levelSelect'));
        setText('side-howto-title', this.t('sideHowTo'));
        setText('side-howto', this.t('howto'));
        setText('side-records-title', this.t('sideRecords'));
        setText('hint', this.t('hint'));
        setText('lb-title', this.t('leaderboard'));
        if (el['username-label']) el['username-label'].textContent = this.t('title');

        // 带图标按钮：span 内文字单独更新（不重建 SVG）
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
        if (el['drags']) el['drags'].title = this.t('drags');
        // 开始覆盖层的语言钮走文字（与 lumen/circuit 同口径：显示「切换目标语言的自称」）。

        this.renderLevelGrid();
        this.renderSideRecords();
        this.updateHud();
        document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    }

    /* ---------------------- 关卡选择 ---------------------- */

    renderLevelGrid() {
        const grid = this.el['level-grid'];
        if (!grid) return;
        grid.innerHTML = '';
        LEVELS.forEach((spec, i) => {
            const p = this.progress[spec.id] || { stars: 0, bestDrags: 0 };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sd-chip' + (p.stars > 0 ? ' is-done' : '');
            btn.dataset.level = String(i);
            const num = document.createElement('span');
            num.className = 'sd-chip-num';
            num.textContent = String(i + 1);
            const stars = document.createElement('span');
            stars.className = 'sd-chip-stars';
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
                if (p.bestDrags > 0) { bestSum += p.bestDrags; bestCount++; }
            }
        }
        const rows = [
            [this.t('level'), `${cleared} / ${LEVELS.length}`],
            [this.t('stars'), `${stars} / ${LEVELS.length * 3}`],
            [this.t('drags'), bestCount ? String(bestSum) : '—'],
        ];
        box.innerHTML = '';
        for (const [k, v] of rows) {
            const row = document.createElement('div');
            row.className = 'sd-side-row';
            const kk = document.createElement('span');
            kk.className = 'sd-side-k';
            kk.textContent = k;
            const vv = document.createElement('span');
            vv.className = 'sd-side-v';
            vv.textContent = v;
            row.appendChild(kk);
            row.appendChild(vv);
            box.appendChild(row);
        }
    }

    /* ---------------------- 模式与关卡流程 ---------------------- */

    startLevels() {
        track('silk-dew', 'start_levels');
        this.mode = 'levels';
        this.daily = null;
        this.lastDailyKey = todayKey();
        // 从第一个未通关的开始
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
        this.daily = { key, display: todayKeyDisplay(), course, cursor: 0, totalDrags: 0, stars: 0 };
        track('silk-dew', 'start_daily');
        this.startLevel(course[0]);
        this.showToast(this.t('dailyStartToast'));
    }

    /**
     * 开始一关。
     * @param {number|object} ref  关卡索引（战役模式）**或**关卡对象本身（每日模式，
     *   `dailyCourse()` 直接返回对象）。传对象时反查索引仅为让 HUD 能显示进度，
     *   反查不到（理论上不会发生）就退回 0，绝不因索引为 -1 而崩。
     */
    startLevel(ref) {
        const spec = (ref && typeof ref === 'object') ? ref : LEVELS[clamp(ref, 0, LEVELS.length - 1)];
        const idx = LEVELS.indexOf(spec);
        this.levelIdx = idx >= 0 ? idx : 0;
        this.spec = spec;
        this.par = this.spec.par || 1;
        this.drags = 0;
        this.failReason = null;
        this.failTimer = 0;
        this.particles = [];
        this.world = createWorld(this.spec);
        this.state = 'playing';
        this.isPaused = false;
        this.lastFrame = 0;
        this.hide(this.el['start']);
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.updateHud();
        this.showToast(this.t(this.spec.tipKey || 'tipCut'));
        if (this.mode === 'levels' && this.daily === null) this.lastDailyKey = null;
    }

    restartLevel() {
        if (this.mode === 'daily' && this.daily) {
            // daily.course 存的是关卡对象（dailyCourse 的返回），不是索引
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
        this.renderLevelGrid();
        this.renderSideRecords();
    }

    /* ---------------------- 结算 ---------------------- */

    onLevelWon() {
        Sfx.win();
        vibrate(30);
        const stars = this.starsForLevel(this.drags, this.par);
        const p = this.progress[this.spec.id] || { stars: 0, bestDrags: 0 };
        const improved = stars > p.stars || (p.bestDrags === 0 || this.drags < p.bestDrags);
        if (stars > p.stars) p.stars = stars;
        if (p.bestDrags === 0 || this.drags < p.bestDrags) p.bestDrags = this.drags;
        this.progress[this.spec.id] = p;
        this.saveProgress();
        this.renderLevelGrid();
        this.renderSideRecords();

        if (this.mode === 'daily' && this.daily) {
            this.daily.totalDrags += this.drags;
            this.daily.stars += stars;
            this.showClearPanel(stars, improved);
        } else {
            this.showClearPanel(stars, improved);
        }
        if (stars === 3) Sfx.star3();
        track('silk-dew', 'level_win', stars);
    }

    starsForLevel(drags, par) {
        if (drags <= par) return 3;
        if (drags <= par + 2) return 2;
        return 1;
    }

    showClearPanel(stars, improved) {
        const el = this.el;
        this.state = 'won-level';
        if (el['clear-stars']) el['clear-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        if (el['clear-line']) {
            const rest = 3 - stars;
            el['clear-line'].textContent = rest > 0
                ? `${this.t('drags')} ${this.drags} · ${this.t('par')} ${this.par}`
                : `${this.t('drags')} ${this.drags}`;
        }
        const isLast = this.mode === 'levels' && this.levelIdx + 1 >= LEVELS.length;
        if (el['btn-next']) {
            el['btn-next'].style.display = (this.mode === 'daily') ? '' : (isLast ? 'none' : '');
        }
        this.show(el['clear']);
    }

    onLevelFailed(reason) {
        if (this.state !== 'playing') return;
        this.state = 'failed';
        this.failReason = reason;
        this.failTimer = 0;
        Sfx.fail();
        vibrate([25, 40, 25]);
        track('silk-dew', 'level_fail', 0);
    }

    finishDaily() {
        this.state = 'won-daily';
        const el = this.el;
        this.showClearPanelSilent();
        if (el['over-title']) el['over-title'].textContent = this.t('dailyDone');
        if (el['over-score']) el['over-score'].textContent = `${this.t('drags')} ${this.daily.totalDrags} · ★ ${this.daily.stars}`;
        if (el['over-sub']) el['over-sub'].textContent = `${this.t('bestToday')}: ${this.daily.display}`;
        this.show(el['over']);
        this.computeStars = null;
        // 提交每日成绩（asc：越少越好）
        const game = `silk-dew-d${this.daily.key.replace(/-/g, '')}`;
        this.submit(game, this.daily.totalDrags);
    }

    showClearPanelSilent() {
        this.hide(this.el['clear']);
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
            const raw = storageGet('sd_lb_' + game);
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
            li.className = 'sd-lb-row';
            const rank = document.createElement('span');
            rank.className = 'sd-lb-rank';
            rank.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'sd-lb-name';
            nm.textContent = row.name || '—';
            const sc = document.createElement('span');
            sc.className = 'sd-lb-score';
            sc.textContent = String(row.score);
            li.appendChild(rank);
            li.appendChild(nm);
            li.appendChild(sc);
            list.appendChild(li);
        });
    }

    copyResult() {
        const text = this.mode === 'daily' && this.daily
            ? `${this.t('title')} · ${this.daily.display} · ${this.t('drags')} ${this.daily.totalDrags} · ★${this.daily.stars}`
            : `${this.t('title')} · ${this.t('level')} ${this.levelIdx + 1} · ${this.t('drags')} ${this.drags} · ` + '★'.repeat(this.starsForLevel(this.drags, this.par));
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
            storageSet('sd_progress', JSON.stringify(this.progress));
        } catch (e) { /* 忽略 */ }
    }

    /* ---------------------- HUD / Toast ---------------------- */

    updateHud() {
        const el = this.el;
        if (el['drags']) el['drags'].textContent = String(this.drags);
        if (el['par']) el['par'].textContent = String(this.par);
        if (el['hud-level']) {
            if (this.mode === 'daily' && this.daily) {
                el['hud-level'].textContent = `${this.t('daily')} ${this.daily.cursor + 1}/${this.daily.course.length}`;
            } else {
                // ⚠️ 不能加 `&& this.spec` 的门槛：菜单态（spec 为 null）时 HUD 会停在
                // HTML 里的英文静态文案「Level 1/20」，切中文后纹丝不动 ——
                // smoke 断言 `HUD 未走中文文案` 抓的就是这个。levelIdx 缺省 0 即可。
                el['hud-level'].textContent = `${this.t('level')} ${this.levelIdx + 1}/${LEVELS.length}`;
            }
        }
    }

    showToast(text) {
        const el = this.el['toast'];
        if (!el) return;
        el.textContent = text;
        el.classList.add('is-on');
        this.toastTimer = 2.6;
    }

    hideToast() {
        const el = this.el['toast'];
        if (el) el.classList.remove('is-on');
    }

    // ⚠️ 类名必须是 `hidden`（css/silk-dew.css:24 与所有 HTML 的初始态都用它）。
    // 曾经写成 `is-hidden` —— 该类在 CSS/HTML 里根本不存在，于是 show/hide
    // 全部静默失效：开始覆盖层永不消失，压在 canvas 上吃掉所有 pointer 事件，
    // 表现为「拖拽无效 / drags 恒为 0」。这类错位没有报错，只能靠 smoke 抓。
    show(el) { if (el) el.classList.remove('hidden'); }
    hide(el) { if (el) el.classList.add('hidden'); }

    /* ---------------------- 输入 ---------------------- */

    toLogical(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * W;
        const y = (e.clientY - rect.top) / rect.height * H;
        return { x, y };
    }

    bindInput() {
        const c = this.canvas;
        c.style.touchAction = 'none';
        c.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing' || this.isPaused) return;
            const p = this.toLogical(e);
            if (this.world && beginDrag(this.world, p.x, p.y)) {
                this.pointerId = e.pointerId;
                this.isDragging = true;
                this.dragMoved = false;
                c.setPointerCapture(e.pointerId);
                Sfx.grab();
                this.drags = this.world.drags;
                this.updateHud();
                e.preventDefault();
                return;
            }
            // 未抓住锚结：若点到气泡则点破（点破不计入拖拽次数）
            if (this.world && bubbleAt(this.world, p.x, p.y)) {
                popBubble(this.world, p.x, p.y);
                e.preventDefault();
            }
        });
        c.addEventListener('pointermove', (e) => {
            if (!this.isDragging || e.pointerId !== this.pointerId) return;
            const p = this.toLogical(e);
            if (this.world) moveDrag(this.world, p.x, p.y);
            this.dragMoved = true;
            e.preventDefault();
        });
        const up = (e) => {
            if (e.pointerId !== this.pointerId) return;
            if (this.world) endDrag(this.world);
            this.isDragging = false;
            this.pointerId = null;
            Sfx.release();
        };
        c.addEventListener('pointerup', up);
        c.addEventListener('pointercancel', up);
        c.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    bindUI() {
        window.addEventListener('site-settings:changed', () => {
            this.lang = getLang();
            this.applyLanguage();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.state === 'playing') this.toMenu();
            } else if (e.key === 'r' || e.key === 'R') {
                if (this.state === 'playing') this.restartLevel();
            }
        });
        window.addEventListener('resize', () => this.resize());
        // 桌面端 --frame-chrome 写入会改变舞台宽度 → 必须在 CSS 尺寸定下后重算后端缓冲区
        window.addEventListener('game-frame:changed', () => this.resize());
    }

    /* ---------------------- 暂停适配（抽屉契约） ---------------------- */
    // 抽屉调这三元组，页面内部状态不暴露

    pauseQuiet() { this.isPaused = true; }
    resumeQuiet() { this.lastFrame = 0; this.isPaused = false; }
    isRunning() { return this.state === 'playing' && !this.isPaused; }

    /* ---------------------- 尺寸 ---------------------- */

    resize() {
        // ⚠️ 必须用 clientWidth（整数取整）而非 getBoundingClientRect().width（亚像素小数）。
        // 后者会让后端缓冲区比 CSS 盒窄 1–3px（实测 488 < 491），校验器报「画面糊」，
        // 且浏览器拉伸时天然模糊。口径与 lumen.js 完全一致：按逻辑宽等比缩放。
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
            this.frameDt = dt;
            if (this.state === 'playing' && this.world) {
                stepWorld(this.world, dt);
                this.consumeEvents();
                if (this.world.state === 'won') this.onLevelWon();
                else if (this.world.state === 'failed') this.onLevelFailed(this.world.state);
            } else if (this.state === 'failed' && this.world) {
                // 失败后短暂展示再自动重开（拖拽机制下重开无成本）
                this.failTimer += dt;
                if (this.failTimer > 1.1) {
                    this.showToast(this.failReason === 'thorn' ? this.t('failThorn') : this.t('failOut'));
                    this.restartLevel();
                }
            }
            if (this.toastTimer > 0) {
                this.toastTimer -= dt;
                if (this.toastTimer <= 0) this.hideToast();
            }
            this.updateParticles(dt);
            this.draw();
        };
        this.animationId = requestAnimationFrame(loop);
    }

    consumeEvents() {
        const w = this.world;
        if (!w || !w.events.length) return;
        const evs = w.events.splice(0, w.events.length);
        for (const e of evs) {
            if (e.type === 'star') {
                Sfx.star(w.starsTaken);
                this.burst(e.x, e.y, '#ffd34d', 14);
            } else if (e.type === 'pop') {
                Sfx.pop();
                this.burst(e.x, e.y, '#9fe8ff', 18);
            } else if (e.type === 'win') {
                this.burst(e.x, e.y, '#58c9a0', 26);
            }
        }
    }

    burst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
            const sp = 60 + Math.random() * 150;
            this.particles.push({
                x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 0.5 + Math.random() * 0.4, t: 0, color, r: 1.4 + Math.random() * 1.8,
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
            p.vx *= 0.96;
            p.vy = p.vy * 0.96 + 200 * dt;
            out.push(p);
        }
        this.particles = out;
    }

    /* ---------------------- 渲染 ---------------------- */

    draw() {
        const ctx = this.ctx;
        const s = (this.renderScale || 1) * (this.dpr || 1);
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.clearRect(0, 0, W, H);

        this.drawBackdrop(ctx);
        if (this.world) {
            this.drawWinds(ctx);
            this.drawVessel(ctx);
            this.drawBubbles(ctx);
            this.drawThorns(ctx);
            this.drawStars(ctx);
            this.drawRopes(ctx);
            this.drawPearl(ctx);
        }
        this.drawParticles(ctx);
    }

    drawBackdrop(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0a1712');
        g.addColorStop(0.55, '#0c1a26');
        g.addColorStop(1, '#0d1338');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // 月晕
        const mg = ctx.createRadialGradient(378, 92, 4, 378, 92, 96);
        mg.addColorStop(0, 'rgba(220,245,235,0.16)');
        mg.addColorStop(1, 'rgba(220,245,235,0)');
        ctx.fillStyle = mg;
        ctx.fillRect(280, 0, 200, 200);
        ctx.beginPath();
        ctx.arc(378, 92, 26, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226,246,236,0.5)';
        ctx.fill();

        // 星点
        for (const st of this.starfield) {
            const tw = 0.6 + 0.4 * Math.sin(this.time * 1.6 + st.ph);
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200,232,220,${(st.a * tw).toFixed(3)})`;
            ctx.fill();
        }

        // 远山剪影
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, 470);
        ctx.quadraticCurveTo(90, 404, 190, 452);
        ctx.quadraticCurveTo(300, 500, 480, 428);
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = 'rgba(8,26,24,0.62)';
        ctx.fill();
    }

    drawWinds(ctx) {
        for (const w of this.world.winds) {
            ctx.save();
            ctx.strokeStyle = 'rgba(159,232,255,0.22)';
            ctx.lineWidth = 1.4;
            ctx.setLineDash([7, 7]);
            ctx.lineDashOffset = -(this.time * 34) % 14;
            ctx.strokeRect(w.x, w.y, w.w, w.h);
            ctx.setLineDash([]);
            // 流向箭头
            const ax = Math.sign(w.ax || 0);
            const ay = Math.sign(w.ay || 0);
            if (ax || ay) {
                const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
                ctx.translate(cx, cy);
                ctx.rotate(Math.atan2(ay, ax));
                ctx.strokeStyle = 'rgba(159,232,255,0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-11, 0); ctx.lineTo(11, 0);
                ctx.moveTo(5, -5); ctx.lineTo(11, 0); ctx.lineTo(5, 5);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    drawVessel(ctx) {
        const v = this.world.vessel;
        if (!v) return;
        const half = v.w / 2;
        const top = v.y;
        const bot = v.y + PHYS.vesselH;
        // 壶身
        ctx.beginPath();
        ctx.moveTo(v.x - half, top);
        ctx.lineTo(v.x - half + 6, bot);
        ctx.quadraticCurveTo(v.x, bot + 12, v.x + half - 6, bot);
        ctx.lineTo(v.x + half, top);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, top, 0, bot);
        g.addColorStop(0, 'rgba(88,201,160,0.30)');
        g.addColorStop(1, 'rgba(31,111,87,0.55)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(168,236,212,0.85)';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        // 壶口
        ctx.beginPath();
        ctx.moveTo(v.x - half - 5, top);
        ctx.lineTo(v.x + half + 5, top);
        ctx.strokeStyle = 'rgba(196,246,228,0.95)';
        ctx.lineWidth = 2.6;
        ctx.stroke();
        // 内壁微光
        ctx.beginPath();
        ctx.ellipse(v.x, top + 3, half - 3, 3.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(140,236,200,0.16)';
        ctx.fill();
    }

    drawBubbles(ctx) {
        for (const b of this.world.bubbles) {
            if (!b.alive) continue;
            const pulse = 1 + 0.03 * Math.sin(this.time * 2.4 + b.i);
            const r = b.r * pulse;
            const g = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.3, r * 0.1, b.x, b.y, r);
            g.addColorStop(0, 'rgba(223,252,255,0.30)');
            g.addColorStop(0.7, 'rgba(64,216,255,0.14)');
            g.addColorStop(1, 'rgba(64,216,255,0.03)');
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = 'rgba(159,232,255,0.6)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 高光
            ctx.beginPath();
            ctx.arc(b.x - r * 0.32, b.y - r * 0.34, r * 0.17, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(240,253,255,0.7)';
            ctx.fill();
        }
    }

    drawThorns(ctx) {
        for (const t of this.world.thorns) {
            ctx.save();
            ctx.translate(t.x, t.y);
            const g = ctx.createRadialGradient(0, 0, t.r * 0.2, 0, 0, t.r * 1.35);
            g.addColorStop(0, 'rgba(255,107,122,0.34)');
            g.addColorStop(1, 'rgba(255,107,122,0)');
            ctx.beginPath();
            ctx.arc(0, 0, t.r * 1.35, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            // 棘刺（8 向）
            ctx.strokeStyle = '#ff6b7a';
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + 0.2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * t.r * 0.55, Math.sin(a) * t.r * 0.55);
                ctx.lineTo(Math.cos(a) * t.r * 1.12, Math.sin(a) * t.r * 1.12);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, t.r * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(58,18,32,0.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,107,122,0.9)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();
        }
    }

    drawStars(ctx) {
        for (const s of this.world.stars) {
            if (s.taken) continue;
            const bob = Math.sin(this.time * 2.2 + s.i) * 2.4;
            const r = 9 + Math.sin(this.time * 3.1 + s.i) * 0.7;
            const cy = s.y + bob;
            const g = ctx.createRadialGradient(s.x, cy, 1, s.x, cy, r * 2.6);
            g.addColorStop(0, 'rgba(255,211,77,0.42)');
            g.addColorStop(1, 'rgba(255,211,77,0)');
            ctx.beginPath();
            ctx.arc(s.x, cy, r * 2.6, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            // 四芒星
            ctx.beginPath();
            ctx.moveTo(s.x, cy - r);
            ctx.quadraticCurveTo(s.x + r * 0.24, cy - r * 0.24, s.x + r, cy);
            ctx.quadraticCurveTo(s.x + r * 0.24, cy + r * 0.24, s.x, cy + r);
            ctx.quadraticCurveTo(s.x - r * 0.24, cy + r * 0.24, s.x - r, cy);
            ctx.quadraticCurveTo(s.x - r * 0.24, cy - r * 0.24, s.x, cy - r);
            ctx.closePath();
            ctx.fillStyle = '#ffd34d';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,247,214,0.9)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    drawRopes(ctx) {
        for (const rope of this.world.ropes) {
            if (!rope.alive) continue;
            const ps = rope.particles;
            if (ps.length < 2) continue;
            // 丝线：外层微光 + 内层实体
            ctx.beginPath();
            ctx.moveTo(ps[0].x, ps[0].y);
            for (let i = 1; i < ps.length; i++) {
                const p0 = ps[i - 1], p1 = ps[i];
                const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
                ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
            }
            ctx.lineTo(ps[ps.length - 1].x, ps[ps.length - 1].y);
            ctx.strokeStyle = 'rgba(233,228,208,0.20)';
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.strokeStyle = '#e9e4d0';
            ctx.lineWidth = 2.2;
            ctx.stroke();

            // 锚结（可拖拽）：金色小环 + 脉动提示
            const a = ps[0];
            const pulse = 1 + 0.10 * Math.sin(this.time * 3.4 + rope.i);
            const isHeld = this.world.dragging && this.world.dragging.kind === 'anchor' && this.world.dragging.rope === rope.i;
            const g = ctx.createRadialGradient(a.x, a.y, 1, a.x, a.y, PHYS.anchorR * 2.0 * pulse);
            g.addColorStop(0, isHeld ? 'rgba(255,232,150,0.52)' : 'rgba(255,211,120,0.34)');
            g.addColorStop(1, 'rgba(255,211,120,0)');
            ctx.beginPath();
            ctx.arc(a.x, a.y, PHYS.anchorR * 2.0 * pulse, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(a.x, a.y, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = isHeld ? '#ffe89a' : '#ffd34d';
            ctx.fill();
            ctx.strokeStyle = 'rgba(60,44,10,0.55)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(a.x, a.y, 3.1, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(30,40,30,0.65)';
            ctx.fill();
        }
    }

    drawPearl(ctx) {
        const p = this.world.pearl;
        // 拖尾（按速度）
        const vx = p.x - p.px, vy = p.y - p.py;
        const sp = Math.sqrt(vx * vx + vy * vy);
        if (sp > 0.6) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - vx * 5.5, p.y - vy * 5.5);
            ctx.strokeStyle = 'rgba(64,216,255,0.34)';
            ctx.lineWidth = PHYS.pearlR * 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
        // 外辉光
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, PHYS.pearlR * 3.4);
        g.addColorStop(0, 'rgba(64,216,255,0.45)');
        g.addColorStop(1, 'rgba(64,216,255,0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, PHYS.pearlR * 3.4, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        // 珠体
        const body = ctx.createRadialGradient(p.x - 3, p.y - 3.5, 1, p.x, p.y, PHYS.pearlR);
        body.addColorStop(0, '#dffcff');
        body.addColorStop(0.6, '#8ee6ff');
        body.addColorStop(1, '#40d8ff');
        ctx.beginPath();
        ctx.arc(p.x, p.y, PHYS.pearlR, 0, Math.PI * 2);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.strokeStyle = 'rgba(234,252,255,0.9)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // 高光点
        ctx.beginPath();
        ctx.arc(p.x - PHYS.pearlR * 0.33, p.y - PHYS.pearlR * 0.38, PHYS.pearlR * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
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
    window.sdGame = new SilkfallGame();
    bindFrame({ logicalWidth: W });
    const more = document.getElementById('sdSideMore');
    if (more) renderMoreGames(more, { exclude: 'silk-dew.html' });
    window.sdDrawer = createStatsDrawer({
        idPrefix: 'sd',
        getGame: () => window.sdGame,
        onPause: () => window.sdGame && window.sdGame.pauseQuiet(),
        onResume: () => window.sdGame && window.sdGame.resumeQuiet(),
        isBusy: () => !!(window.sdGame && window.sdGame.isRunning()),
        ICONS,
        // ⚠️ 契约是 () => object（整表），不是 (key) => string。见 SilkfallGame.textTable 的注释。
        getText: () => (window.sdGame ? window.sdGame.textTable() : LANGUAGES.en),
    });
    window.sdDrawer.init();
});

onReady(() => {
    bindChrome({
        self: 'silk-dew.html',
        // ⚠️ 必须含 'more'：页脚「更多游戏」的展开行为归 chrome，owns 里漏掉
        // 就等于按钮是死的（chrome 校验器会报 aria-expanded 未置 true / 列表为空）。
        // ⚠️ 必须含 'home'：本页顶栏首页钮是无 href 的 <button>，点击跳转完全靠
        // chrome 接管 —— 而 owns 默认只含 more，漏掉 'home' = 按钮是死的
        // （页脚 home 是原生 <a> 天然可用，所以症状只出现在顶栏）。
        owns: ['more', 'home'],
        // ⚠️ 同抽屉：共享层要的是整表。返回 (key)=>string 会让顶栏的
        // sound / moreGames / language 永远停在英文兜底。
        getText: () => (window.sdGame ? window.sdGame.textTable() : LANGUAGES.en),
    });
});
