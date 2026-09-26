/**
 * Echo Cave 回声洞窟 — 声呐洞窟解谜
 * =====================================
 * 玩法：洞穴全黑，岩壁不可见。发射声波脉冲，波前扫过岩壁的瞬间把它「照亮」，
 * 随后衰减为记忆残光。收集会鸣响的声晶、循着嗡鸣找到洞口；荆棘会刺破护心。
 *
 * 机制即教学：每一圈回波都是一次测距（2d = v·t），吸音苔藓回波弱且不留残光，
 * 声音是黑暗里唯一的信息载体——玩家在玩的过程中自然内化波的传播/反射/吸收。
 *
 * 关卡数据 / 声波核心在 js/echo-cave-caves.js（纯模块，校验器共用）。
 * par 由 scripts/verify-echo-cave-levels.mjs 的 Dijkstra 求解器现算，绝不手填。
 *
 * 共享层（2026-09 契约）：game-frame / game-drawer / game-chrome /
 * leaderboard / daily / i18n / safe-storage / analytics / game-sfx / boot。
 */

import {
    STAGE,
    GRID,
    RULES,
    LEVELS,
    createWorld,
    stepWorld,
    dailyCourse,
} from './echo-cave-caves.js';
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
        title: 'Echo Cave',
        subtitle: 'Ping · Listen · Find',
        howto: 'The cave is pitch black — walls only exist where your echoes say they do. Tap (or Space) to sing a pulse and watch the wavefront paint the rock. Gather the singing crystals, follow the low hum to the moonlit exit, and mind the thorns. Fewer pulses, more stars!',
        playLevels: 'Levels',
        playDaily: 'Daily',
        level: 'Cave',
        daily: 'Daily',
        levelSelect: 'Select cave',
        pulses: 'Pulses',
        pulsesWord: 'pulses',
        par: 'Par',
        dailyStartToast: 'Daily run — 5 caves · fewest pulses wins',
        retry: 'Retry',
        next: 'Next',
        menu: 'Home',
        again: 'Again',
        levelCleared: 'Out of the dark!',
        dailyDone: 'Daily complete!',
        bestToday: 'Your best today',
        stars: 'Stars',
        leaderboard: 'Global · Today\'s Run',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        resetTitle: 'Restart cave',
        home: 'Home',
        hint: 'Sing into the dark · every echo is a measurement (2d = v·t)',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
        legendTitle: 'Acoustic legend',
        legendWall: 'Rock wall — bright echo, keeps a memory glow',
        legendMoss: 'Echo moss — absorbs sound, no memory',
        legendCrystal: 'Sound crystal — sings by itself, gather it',
        legendExit: 'Cave exit — a low hum, your way out',
        legendThorn: 'Thorn — a sharp hiss, breaks a heart',
        legendLaw: 'Echo ranging: distance = speed × time ÷ 2',
        failThorns: 'The thorns broke your last heart',
        tipFirst: 'Tap or press Space to sing — the returning wave paints the walls',
        tipMove: 'Move through the gap — walls fade to a faint memory glow',
        tipThorn: 'Thorns hiss now and then — give them room',
        tipMoss: 'Echo moss swallows sound — no echo, no memory',
        tipSlit: 'Thread the slit — a pulse close to the wall sees more',
        tipRoute: 'Plan the route — one pulse can light a whole chamber',
        tipPlan: 'Many crystals — plan one route that sweeps them all',
        tipDark: 'The deep dark — trust the hum, not your eyes',
        tipFinal: 'The last cave — every pulse counts',
        stage: 'Cave',
        stageOf: '{a} / {b}',
    },
    zh: {
        stats: '数据统计',
        title: '回声洞窟',
        subtitle: '鸣响 · 听壁 · 寻光',
        howto: '洞窟一片漆黑——岩壁只存在于你的回声里。点击（或空格）发出脉冲，看波前把岩壁一格格描亮。收集自鸣的声晶，循着低频嗡鸣找到月光洞口，小心荆棘。脉冲越少，星星越多！',
        playLevels: '关卡模式',
        playDaily: '每日挑战',
        level: '洞穴',
        daily: '每日',
        levelSelect: '选择洞窟',
        pulses: '脉冲',
        pulsesWord: '次脉冲',
        par: '目标',
        dailyStartToast: '每日行程——5 个洞窟 · 脉冲次数越少越好',
        retry: '重试',
        next: '下一洞',
        menu: '返回主页',
        again: '再来一次',
        levelCleared: '重见天光！',
        dailyDone: '每日挑战完成！',
        bestToday: '今日最好成绩',
        stars: '星星',
        leaderboard: '全球榜 · 今日行程',
        noScores: '暂无成绩',
        lbOffline: '榜单离线',
        copyResult: '复制',
        resetTitle: '重开本洞',
        home: '主页',
        hint: '向黑暗歌唱 · 每一圈回波都是一次测距（2d = v·t）',
        sideHowTo: '玩法说明',
        sideRecords: '战绩',
        legendTitle: '声学图例',
        legendWall: '岩壁——回波亮，留记忆残光',
        legendMoss: '吸音苔藓——吞掉声音，不留残光',
        legendCrystal: '声晶——自鸣定位，收集它',
        legendExit: '洞口——低频嗡鸣，出去的路',
        legendThorn: '荆棘——间歇尖鸣，刺破护心',
        legendLaw: '回声测距：距离 = 声速 × 时间 ÷ 2',
        failThorns: '荆棘刺破了最后一颗护心',
        tipFirst: '点击或按空格鸣响——回波会把岩壁描亮',
        tipMove: '穿过缝隙前进——岩壁会淡成记忆残光',
        tipThorn: '荆棘会间歇尖鸣——离它远一点',
        tipMoss: '吸音苔藓吞声音——无回波、无记忆',
        tipSlit: '穿过窄缝——贴近岩壁的脉冲看得更多',
        tipRoute: '规划路线——一次脉冲能照亮整个洞厅',
        tipPlan: '多颗声晶——绕一条路线把它们一次扫完',
        tipDark: '深处黑暗——相信嗡鸣，别相信眼睛',
        tipFinal: '最后一个洞窟——每一次脉冲都要值得',
        stage: '洞窟',
        stageOf: '{a} / {b}',
    }
});

/* ────────────────────────── 音效 ────────────────────────── */
// 听声辨位：脉冲是「ping」，回波是暗一档的回响；声晶五声音阶递进。

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.00];
const sfxEngine = createSfxEngine();

const Sfx = {
    click() { sfxEngine.tone({ freq: 620, type: 'square', dur: 0.05, vol: 0.06 }); },
    /** 发射脉冲：短促上滑的 ping */
    ping() {
        sfxEngine.tone({ freq: 720, slideTo: 980, type: 'sine', dur: 0.09, vol: 0.12 });
        sfxEngine.tone({ freq: 1440, type: 'sine', dur: 0.05, vol: 0.03, delay: 0.02 });
    },
    /** 回波：暗一档的回响（延迟 = 首面墙的距离感） */
    echo() { sfxEngine.tone({ freq: 460, slideTo: 380, type: 'sine', dur: 0.12, vol: 0.05, delay: 0.16 }); },
    /** 声晶：五声音阶递进 */
    crystal(n) {
        const f = PENTA[(n - 1) % PENTA.length];
        sfxEngine.tone({ freq: f, type: 'sine', dur: 0.18, vol: 0.13 });
        sfxEngine.tone({ freq: f * 2, type: 'sine', dur: 0.1, vol: 0.04, delay: 0.03 });
    },
    /** 声晶远歌（极轻） */
    sing() { sfxEngine.tone({ freq: 1318, type: 'sine', dur: 0.1, vol: 0.025 }); },
    /** 洞口嗡鸣（低频） */
    hum() { sfxEngine.tone({ freq: 196, type: 'sine', dur: 0.3, vol: 0.04 }); },
    /** 荆棘：闷响（不刺耳） */
    thorn() {
        sfxEngine.tone({ freq: 220, slideTo: 110, type: 'triangle', dur: 0.16, vol: 0.12 });
        sfxEngine.noise({ dur: 0.12, vol: 0.05, filterFreq: 700 });
    },
    /** 出洞：和弦收束 */
    win() {
        sfxEngine.tone({ freq: 1046, type: 'sine', dur: 0.5, vol: 0.11 });
        sfxEngine.tone({ freq: 1318, type: 'sine', dur: 0.4, vol: 0.06, delay: 0.05 });
        sfxEngine.tone({ freq: 1568, type: 'sine', dur: 0.35, vol: 0.05, delay: 0.1 });
    },
    star3() {
        [784, 988, 1175].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.3 + i * 0.1 });
        });
    },
    fail() {
        sfxEngine.tone({ freq: 300, slideTo: 110, type: 'sawtooth', dur: 0.32, vol: 0.1 });
        sfxEngine.noise({ dur: 0.22, vol: 0.06, filterFreq: 500 });
    },
};

/* ────────────────────────── 存储 ────────────────────────── */

function storageParseProgress() {
    try {
        const obj = JSON.parse(storageGet('ec_progress'));
        const out = {};
        if (obj && typeof obj === 'object') {
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (v && typeof v === 'object') {
                    out[k] = { stars: clamp(v.stars | 0, 0, 3), bestPulses: v.bestPulses | 0 };
                }
            }
        }
        return out;
    } catch (e) {
        return {};
    }
}

/* ────────────────────────── 游戏主体 ────────────────────────── */

class EchoCaveGame {
    constructor() {
        this.canvas = document.getElementById('ec-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        [
            'ec-hud-level', 'ec-pulses', 'ec-par', 'ec-reset-btn', 'ec-mute-btn', 'ec-toast',
            'ec-start', 'ec-title', 'ec-subtitle', 'ec-howto', 'ec-btn-levels', 'ec-btn-daily',
            'ec-level-label', 'ec-level-grid', 'ec-daily-best', 'ec-start-mute',
            'ec-side-howto-title', 'ec-side-howto', 'ec-side-records-title', 'ec-side-records',
            'ec-side-legend-title', 'ec-side-legend',
            'ec-clear', 'ec-clear-stars', 'ec-clear-line', 'ec-btn-next', 'ec-btn-replay', 'ec-btn-menu1',
            'ec-over', 'ec-over-title', 'ec-over-score', 'ec-over-sub',
            'ec-btn-again', 'ec-btn-copy', 'ec-btn-menu2',
            'ec-lb-title', 'ec-lb-list', 'ec-lb-status', 'ec-username', 'ec-username-label',
            'ec-hint', 'ec-pulse-btn', 'ec-action-row',
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^ec-/, '')] = el;
        });

        this.lang = getLang();
        this.progress = storageParseProgress();

        // 对局状态：menu | playing | won-level | won-daily | failed
        // ⚠️ 字段名与 verify-stats-drawer.mjs 的 AUGMENT runningExpr 严格对应
        this.state = 'menu';
        this.isPaused = false;
        this.mode = 'levels';
        this.levelIdx = 0;
        this.pulseUsed = 0;
        this.par = 1;
        this.world = null;
        this.spec = null;
        this.daily = null;         // { key, display, course:[idx], cursor, totalPulses }
        this.failReason = null;
        this.failTimer = 0;

        // 输入
        this.keys = new Set();
        this.wantPulse = false;
        this.joy = null;           // { id, ox, oy, x, y, t0, moved }

        // 视觉
        this.time = 0;
        this.toastTimer = 0;
        this.particles = [];
        this.dust = this.buildDust();
        this.memCanvas = document.createElement('canvas');
        this.memDirty = true;

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

    buildDust() {
        const rng = (() => { let s = 20260921; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
        const out = [];
        for (let i = 0; i < 64; i++) {
            out.push({ x: rng() * W, y: rng() * H, r: 0.4 + rng() * 1.0, a: 0.04 + rng() * 0.1, ph: rng() * 6.28, sp: 3 + rng() * 8 });
        }
        return out;
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
        if (el['pulse-btn']) {
            el['pulse-btn'].addEventListener('pointerdown', (e) => {
                e.preventDefault();
                if (this.state === 'playing' && !this.isPaused) this.wantPulse = true;
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
            ? '回声洞窟 — 声呐洞窟解谜'
            : 'Echo Cave — Sonar Cave Puzzle';
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
        if (el['pulse-btn']) el['pulse-btn'].title = this.t('pulses');

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
        if (el['pulses']) el['pulses'].title = this.t('pulses');

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
            const p = this.progress[spec.id] || { stars: 0, bestPulses: 0 };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ec-chip' + (p.stars > 0 ? ' is-done' : '');
            btn.dataset.level = String(i);
            const num = document.createElement('span');
            num.className = 'ec-chip-num';
            num.textContent = String(i + 1);
            const stars = document.createElement('span');
            stars.className = 'ec-chip-stars';
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
                if (p.bestPulses > 0) { bestSum += p.bestPulses; bestCount++; }
            }
        }
        const rows = [
            [this.t('level'), `${cleared} / ${LEVELS.length}`],
            [this.t('stars'), `${stars} / ${LEVELS.length * 3}`],
            [this.t('pulses'), bestCount ? String(bestSum) : '—'],
        ];
        box.innerHTML = '';
        for (const [k, v] of rows) {
            const row = document.createElement('div');
            row.className = 'ec-side-row';
            const kk = document.createElement('span');
            kk.className = 'ec-side-k';
            kk.textContent = k;
            const vv = document.createElement('span');
            vv.className = 'ec-side-v';
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
            ['wall', this.t('legendWall')],
            ['moss', this.t('legendMoss')],
            ['crystal', this.t('legendCrystal')],
            ['exit', this.t('legendExit')],
            ['thorn', this.t('legendThorn')],
            ['law', this.t('legendLaw')],
        ];
        box.innerHTML = '';
        for (const [kind, text] of rows) {
            const row = document.createElement('div');
            row.className = 'ec-legend-row';
            const dot = document.createElement('span');
            dot.className = `ec-legend-dot ec-legend-${kind}`;
            const tx = document.createElement('span');
            tx.className = 'ec-legend-text';
            tx.textContent = text;
            row.appendChild(dot);
            row.appendChild(tx);
            box.appendChild(row);
        }
    }

    /* ---------------------- 模式与关卡流程 ---------------------- */

    startLevels() {
        track('echo-cave', 'start_levels');
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
        this.daily = { key, display: todayKeyDisplay(), course, cursor: 0, totalPulses: 0, stars: 0 };
        track('echo-cave', 'start_daily');
        this.startLevel(course[0]);
        this.showToast(this.t('dailyStartToast'));
    }

    startLevel(ref) {
        const spec = (ref && typeof ref === 'object') ? ref : LEVELS[clamp(ref, 0, LEVELS.length - 1)];
        const idx = LEVELS.indexOf(spec);
        this.levelIdx = idx >= 0 ? idx : 0;
        this.spec = spec;
        this.par = this.spec.par || 1;
        this.pulseUsed = 0;
        this.failReason = null;
        this.failTimer = 0;
        this.particles = [];
        this.keys.clear();
        this.wantPulse = false;
        this.joy = null;
        this.world = createWorld(this.spec);
        this.memDirty = true;
        this.state = 'playing';
        this.syncActionVisibility();
        this.isPaused = false;
        this.lastFrame = 0;
        this.hide(this.el['start']);
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
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
        this.syncActionVisibility();
        this.world = null;
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.show(this.el['start']);
        this.renderLevelGrid();
        this.renderSideRecords();
    }

    /* ---------------------- 结算 ---------------------- */

    starsForLevel(pulses, par, gotAll) {
        let stars = 1;
        if (gotAll) stars++;
        if (pulses <= par) stars++;
        return stars;
    }

    onLevelWon() {
        Sfx.win();
        vibrate(30);
        const gotAll = this.world && this.world.got === this.world.total && this.world.total > 0;
        const stars = this.starsForLevel(this.pulseUsed, this.par, gotAll);
        const p = this.progress[this.spec.id] || { stars: 0, bestPulses: 0 };
        if (stars > p.stars) p.stars = stars;
        if (p.bestPulses === 0 || this.pulseUsed < p.bestPulses) p.bestPulses = this.pulseUsed;
        this.progress[this.spec.id] = p;
        this.saveProgress();
        this.renderLevelGrid();
        this.renderSideRecords();

        if (this.mode === 'daily' && this.daily) {
            this.daily.totalPulses += this.pulseUsed;
            this.daily.stars += stars;
        } else {
            this.maybeSubmitCampaign();
        }
        this.showClearPanel(stars);
        if (stars === 3) Sfx.star3();
        track('echo-cave', 'level_win', stars);
    }

    /** 战役全通 → 提交 20 关最少脉冲总和（asc 榜） */
    maybeSubmitCampaign() {
        let sum = 0, complete = true;
        for (const spec of LEVELS) {
            const p = this.progress[spec.id];
            if (!p || p.stars === 0) { complete = false; break; }
            sum += p.bestPulses;
        }
        if (complete && sum > 0) this.submit('echo-cave', sum);
    }

    showClearPanel(stars) {
        const el = this.el;
        this.state = 'won-level';
        this.syncActionVisibility();
        if (el['clear-stars']) el['clear-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        if (el['clear-line']) {
            const rest = 3 - stars;
            el['clear-line'].textContent = rest > 0
                ? `${this.t('pulses')} ${this.pulseUsed} · ${this.t('par')} ${this.par}`
                : `${this.t('pulses')} ${this.pulseUsed}`;
        }
        const isLast = this.mode === 'levels' && this.levelIdx + 1 >= LEVELS.length;
        if (el['btn-next']) {
            el['btn-next'].style.display = (this.mode === 'daily') ? '' : (isLast ? 'none' : '');
        }
        this.show(el['clear']);
    }

    onLevelFailed() {
        if (this.state !== 'playing') return;
        this.state = 'failed';
        this.syncActionVisibility();
        this.failReason = 'thorns';
        this.failTimer = 0;
        Sfx.fail();
        vibrate([25, 40, 25]);
        track('echo-cave', 'level_fail', 0);
    }

    finishDaily() {
        this.state = 'won-daily';
        this.syncActionVisibility();
        const el = this.el;
        this.hide(el['clear']);
        if (el['over-title']) el['over-title'].textContent = this.t('dailyDone');
        if (el['over-score']) el['over-score'].textContent = `${this.t('pulses')} ${this.daily.totalPulses} · ★ ${this.daily.stars}`;
        if (el['over-sub']) el['over-sub'].textContent = `${this.t('bestToday')}: ${this.daily.display}`;
        this.show(el['over']);
        // 提交每日成绩（asc：越少越好）
        const game = `echo-cave-d${this.daily.key.replace(/-/g, '')}`;
        this.submit(game, this.daily.totalPulses);
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
            const raw = storageGet('ec_lb_' + game);
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
            li.className = 'ec-lb-row';
            const rank = document.createElement('span');
            rank.className = 'ec-lb-rank';
            rank.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'ec-lb-name';
            nm.textContent = row.name || '—';
            const sc = document.createElement('span');
            sc.className = 'ec-lb-score';
            sc.textContent = String(row.score);
            li.appendChild(rank);
            li.appendChild(nm);
            li.appendChild(sc);
            list.appendChild(li);
        });
    }

    copyResult() {
        const text = this.mode === 'daily' && this.daily
            ? `${this.t('title')} · ${this.daily.display} · ${this.t('pulses')} ${this.daily.totalPulses} · ★${this.daily.stars}`
            : `${this.t('title')} · ${this.t('level')} ${this.levelIdx + 1} · ${this.t('pulses')} ${this.pulseUsed} · ` + '★'.repeat(this.starsForLevel(this.pulseUsed, this.par, this.world && this.world.got === this.world.total && this.world.total > 0));
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
            storageSet('ec_progress', JSON.stringify(this.progress));
        } catch (e) { /* 忽略 */ }
    }

    /* ---------------------- HUD / Toast ---------------------- */

    updateHud() {
        const el = this.el;
        if (el['pulses']) el['pulses'].textContent = String(this.pulseUsed);
        if (el['par']) el['par'].textContent = `${this.t('par')} ${this.par}`;
        if (el['hud-level']) {
            if (this.mode === 'daily' && this.daily) {
                el['hud-level'].textContent = `${this.t('daily')} ${this.daily.cursor + 1}/${this.daily.course.length}`;
            } else {
                // ⚠️ 不能加 `&& this.spec` 门槛：菜单态 HUD 会停在静态英文文案不跟随语言。
                el['hud-level'].textContent = `${this.t('level')} ${this.levelIdx + 1}/${LEVELS.length}`;
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

    // ⚠️ 类名必须是 `hidden`（css/echo-cave.css 与所有 HTML 初始态都用它）。
    show(el) { if (el) el.classList.remove('hidden'); }
    hide(el) { if (el) el.classList.add('hidden'); }

    syncActionVisibility() {
        if (this.el['action-row']) this.el['action-row'].classList.toggle('is-hidden', this.state !== 'playing');
    }

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

        // 键盘：WASD / 方向键移动，空格脉冲，R 重开，Esc 菜单
        const MOVE_KEYS = {
            'ArrowUp': 'u', 'w': 'u', 'W': 'u',
            'ArrowDown': 'd', 's': 'd', 'S': 'd',
            'ArrowLeft': 'l', 'a': 'l', 'A': 'l',
            'ArrowRight': 'r', 'd': 'r', 'D': 'r',
        };
        document.addEventListener('keydown', (e) => {
            if (e.target instanceof Element && e.target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"]')) return;
            if (MOVE_KEYS[e.key]) {
                this.keys.add(MOVE_KEYS[e.key]);
                if (this.state === 'playing') e.preventDefault();
            } else if (e.key === ' ' || e.key === 'Enter') {
                if (this.state === 'playing' && !this.isPaused) {
                    if (!e.repeat) this.wantPulse = true;
                    e.preventDefault();
                }
            } else if (e.key === 'r' || e.key === 'R') {
                if (this.state === 'playing' && !this.isPaused) this.restartLevel();
            } else if (e.key === 'Escape') {
                if (this.state === 'playing' && !this.isPaused) this.toMenu();
            }
        });
        document.addEventListener('keyup', (e) => {
            if (MOVE_KEYS[e.key]) this.keys.delete(MOVE_KEYS[e.key]);
        });

        // 指针：虚拟摇杆。轻点（位移小 + 时间短）= 脉冲。
        c.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing' || this.isPaused || this.joy) return;
            const p = this.toLogical(e);
            this.joy = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, t0: this.time, moved: false };
            if (typeof c.setPointerCapture === 'function') {
                try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
            }
            if (e.cancelable) e.preventDefault();
        });
        c.addEventListener('pointermove', (e) => {
            if (!this.joy || e.pointerId !== this.joy.id) return;
            const p = this.toLogical(e);
            this.joy.x = p.x;
            this.joy.y = p.y;
            if (Math.hypot(p.x - this.joy.ox, p.y - this.joy.oy) > 10) this.joy.moved = true;
            if (e.cancelable) e.preventDefault();
        });
        const endJoy = (e) => {
            if (!this.joy || e.pointerId !== this.joy.id) return;
            const quickTap = !this.joy.moved && (this.time - this.joy.t0) < 0.3;
            this.joy = null;
            if (quickTap && this.state === 'playing' && !this.isPaused) this.wantPulse = true;
        };
        c.addEventListener('pointerup', endJoy);
        c.addEventListener('pointercancel', (e) => {
            if (this.joy && e.pointerId === this.joy.id) this.joy = null;
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
        this.memCanvas.width = pw;
        this.memCanvas.height = Math.round(H * renderScale);
        this.memDirty = true;
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
            if (this.state === 'playing' && this.world) {
                const input = this.readInput();
                this.pulseUsed = this.world.pulseCount;
                stepWorld(this.world, dt, input);
                this.wantPulse = false;
                this.pulseUsed = this.world.pulseCount;
                this.consumeEvents();
                if (this.world.state === 'won') this.onLevelWon();
                else if (this.world.state === 'dead') this.onLevelFailed();
                this.updateHud();
            } else if (this.state === 'failed' && this.world) {
                this.failTimer += dt;
                if (this.failTimer > 1.2) {
                    this.showToast(this.t('failThorns'));
                    this.restartLevel();
                }
            }
            this.draw();
        };
        this.animationId = requestAnimationFrame(loop);
    }

    readInput() {
        let mx = 0, my = 0;
        if (this.joy) {
            const dx = this.joy.x - this.joy.ox;
            const dy = this.joy.y - this.joy.oy;
            const d = Math.hypot(dx, dy);
            if (d > 6) {
                const k = Math.min(1, d / 44) / d;
                mx = dx * k;
                my = dy * k;
            }
        }
        if (!mx && !my && this.keys.size) {
            if (this.keys.has('l')) mx -= 1;
            if (this.keys.has('r')) mx += 1;
            if (this.keys.has('u')) my -= 1;
            if (this.keys.has('d')) my += 1;
            const d = Math.hypot(mx, my);
            if (d > 1) { mx /= d; my /= d; }
        }
        const pulse = this.wantPulse;
        return { mx, my, pulse };
    }

    consumeEvents() {
        const w = this.world;
        if (!w || !w.events.length) return;
        const evs = w.events.splice(0, w.events.length);
        for (const e of evs) {
            if (e.type === 'pulse') {
                Sfx.ping();
                Sfx.echo();
            } else if (e.type === 'crystal') {
                Sfx.crystal(e.n);
                this.burst(e.x, e.y, '#ffd34d', 14);
            } else if (e.type === 'sing') {
                Sfx.sing();
            } else if (e.type === 'hum') {
                Sfx.hum();
            } else if (e.type === 'hit') {
                Sfx.thorn();
                vibrate(35);
                this.burst(e.x, e.y, '#ff6b7a', 12);
            } else if (e.type === 'won') {
                this.burst(e.x, e.y, '#a78bfa', 26);
            }
        }
    }

    burst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
            const sp = 50 + Math.random() * 130;
            this.particles.push({
                x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 0.5 + Math.random() * 0.4, t: 0, color, r: 1.3 + Math.random() * 1.6,
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
            p.vy = p.vy * 0.95 + 60 * dt;
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
            this.drawMemory(ctx);
            this.drawRipples(ctx);
            this.drawWalls(ctx);
            this.drawExit(ctx);
            this.drawCrystals(ctx);
            this.drawThorns(ctx);
            this.drawPulseRings(ctx);
            this.drawPlayer(ctx);
            this.drawHearts(ctx);
            this.drawJoystick(ctx);
        } else {
            this.drawMenuAmbience(ctx);
        }
        this.drawParticles(ctx);
    }

    drawBackdrop(ctx) {
        ctx.fillStyle = '#0a151e';
        ctx.fillRect(0, 0, W, H);
        // Geological strata: a quiet backdrop that gives the pulse something
        // to reveal without turning the whole cave into a neon gradient.
        ctx.save();
        ctx.strokeStyle = 'rgba(121,154,157,0.09)';
        ctx.lineWidth = 1;
        for (let y = 58; y < H; y += 48) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(120, y - 10, 250, y + 12, W, y - 5);
            ctx.stroke();
        }
        ctx.restore();
        // 萤光尘埃：黑暗里的空气感
        for (const d of this.dust) {
            const tw = 0.5 + 0.5 * Math.sin(this.time * d.sp * 0.4 + d.ph);
            const yy = (d.y + this.time * d.sp) % H;
            ctx.beginPath();
            ctx.arc(d.x, yy, d.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(168,205,204,${(d.a * tw * 0.58).toFixed(3)})`;
            ctx.fill();
        }
    }

    /** 记忆残光层：单调增长，脏了才重建离屏画布 */
    drawMemory(ctx) {
        if (this.memDirty) this.rebuildMemory();
        if (this.memCanvas.width > 0) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(this.memCanvas, 0, 0);
            ctx.restore();
        }
    }

    rebuildMemory() {
        const mctx = this.memCanvas.getContext('2d');
        const s = this.renderScale || 1;
        mctx.setTransform(s, 0, 0, s, 0, 0);
        mctx.clearRect(0, 0, W, H);
        const { cols } = GRID;
        const grid = this.world ? this.world.grid : null;
        if (!grid) return;
        for (let idx = 0; idx < this.world.memory.length; idx++) {
            const m = this.world.memory[idx];
            if (m <= 0.005) continue;
            this.strokeCellEdges(mctx, this.world, idx, m, grid[idx] === 2 ? '#7fa08c' : '#8fb8e8');
        }
        void cols;
        this.memDirty = false;
    }

    /** 画一格岩壁朝向地板的边线（外圈一层软光） */
    strokeCellEdges(ctx, world, idx, alpha, color) {
        const { cols, rows, cell } = GRID;
        const cx = idx % cols;
        const cy = (idx - cx) / cols;
        const x0 = cx * cell, y0 = cy * cell;
        const floor = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && world.grid[y * cols + x] === 0;
        ctx.lineCap = 'round';
        // 软光层
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * 0.22;
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        if (floor(cx - 1, cy)) { ctx.moveTo(x0 + 0.5, y0); ctx.lineTo(x0 + 0.5, y0 + cell); }
        if (floor(cx + 1, cy)) { ctx.moveTo(x0 + cell - 0.5, y0); ctx.lineTo(x0 + cell - 0.5, y0 + cell); }
        if (floor(cx, cy - 1)) { ctx.moveTo(x0, y0 + 0.5); ctx.lineTo(x0 + cell, y0 + 0.5); }
        if (floor(cx, cy + 1)) { ctx.moveTo(x0, y0 + cell - 0.5); ctx.lineTo(x0 + cell, y0 + cell - 0.5); }
        ctx.stroke();
        // 实线层
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        if (floor(cx - 1, cy)) { ctx.moveTo(x0 + 0.5, y0); ctx.lineTo(x0 + 0.5, y0 + cell); }
        if (floor(cx + 1, cy)) { ctx.moveTo(x0 + cell - 0.5, y0); ctx.lineTo(x0 + cell - 0.5, y0 + cell); }
        if (floor(cx, cy - 1)) { ctx.moveTo(x0, y0 + 0.5); ctx.lineTo(x0 + cell, y0 + 0.5); }
        if (floor(cx, cy + 1)) { ctx.moveTo(x0, y0 + cell - 0.5); ctx.lineTo(x0 + cell, y0 + cell - 0.5); }
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    /** 亮层：glow > 0 的岩壁（当前脉冲扫过的余辉） */
    drawWalls(ctx) {
        const world = this.world;
        const grid = world.grid;
        const { cols, cell } = GRID;
        for (const idx of world.wallCells) {
            const g = world.glow[idx];
            const m = world.memory[idx];
            const a = Math.min(1, g + m);
            if (a <= 0.015 || g <= 0.01) continue;
            const cx = idx % cols;
            const cy = (idx - cx) / cols;
            const x = cx * cell;
            const y = cy * cell;
            const rock = grid[idx] === 2;
            ctx.fillStyle = rock
                ? `rgba(83,116,103,${(0.20 * a).toFixed(3)})`
                : `rgba(96,127,139,${(0.24 * a).toFixed(3)})`;
            ctx.fillRect(x, y, cell, cell);
            this.strokeCellEdges(ctx, world, idx, a, rock ? '#9fc4ae' : '#b8d7d2');
        }
    }

    drawRipples(ctx) {
        for (const r of this.world.ripples) {
            const k = r.t / r.dur;
            const rad = 6 + (r.maxR - 6) * (1 - Math.pow(1 - k, 2));
            ctx.beginPath();
            ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r.color},${(0.42 * (1 - k)).toFixed(3)})`;
            ctx.lineWidth = r.lw;
            ctx.stroke();
        }
    }

    drawPulseRings(ctx) {
        for (const pu of this.world.pulses) {
            const k = Math.max(0, 1 - pu.age / RULES.ringLife);
            const rad = Math.min(pu.age * RULES.pulseSpeed, RULES.pulseMaxR);
            if (rad <= 2) continue;
            ctx.beginPath();
            ctx.arc(pu.x, pu.y, rad, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(111,216,255,${(0.4 * k).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            if (rad > 14) {
                ctx.beginPath();
                ctx.arc(pu.x, pu.y, rad * 0.82, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(111,216,255,${(0.14 * k).toFixed(3)})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
        }
    }

    drawExit(ctx) {
        const e = this.world.exit;
        const flash = e.flash;
        const base = 0.3;
        const a = Math.min(1, base + flash * 0.7);
        // 门洞：两柱 + 拱
        ctx.strokeStyle = `rgba(167,139,250,${a.toFixed(3)})`;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(e.x - 11, e.y + 12);
        ctx.lineTo(e.x - 11, e.y - 2);
        ctx.arc(e.x, e.y - 2, 11, Math.PI, 0);
        ctx.lineTo(e.x + 11, e.y + 12);
        ctx.stroke();
        // 月光
        const g = ctx.createRadialGradient(e.x, e.y - 2, 1, e.x, e.y - 2, 26);
        g.addColorStop(0, `rgba(196,181,253,${(0.3 + flash * 0.4).toFixed(3)})`);
        g.addColorStop(1, 'rgba(196,181,253,0)');
        ctx.beginPath();
        ctx.arc(e.x, e.y - 2, 26, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(e.x, e.y - 2, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(233,226,255,${Math.min(1, 0.6 + flash).toFixed(3)})`;
        ctx.fill();
    }

    drawCrystals(ctx) {
        for (const c of this.world.crystals) {
            if (c.taken) continue;
            const bob = Math.sin(this.time * 2.1 + c.i) * 1.8;
            const cy = c.y + bob;
            const singGlow = Math.max(0, 1 - c.singT / 0.6) * 0.5;
            // A crystal is drawn as two faces; the amber pulse is reserved for
            // the instant it sings instead of being a permanent halo.
            ctx.beginPath();
            ctx.moveTo(c.x, cy - 7);
            ctx.lineTo(c.x + 4.6, cy);
            ctx.lineTo(c.x, cy + 7);
            ctx.lineTo(c.x - 4.6, cy);
            ctx.closePath();
            ctx.fillStyle = '#c29355';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(c.x, cy - 7);
            ctx.lineTo(c.x, cy + 7);
            ctx.lineTo(c.x + 4.6, cy);
            ctx.closePath();
            ctx.fillStyle = '#e7c17e';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(c.x, cy - 7);
            ctx.lineTo(c.x - 4.6, cy);
            ctx.lineTo(c.x, cy + 7);
            ctx.closePath();
            ctx.fillStyle = '#8a6842';
            ctx.fill();
            ctx.strokeStyle = singGlow > 0.01 ? '#f3d59a' : 'rgba(231,193,126,0.72)';
            ctx.lineWidth = 1;
            ctx.stroke();
            if (singGlow > 0.01) {
                ctx.strokeStyle = `rgba(226,199,139,${singGlow.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(c.x, cy, 10 + singGlow * 8, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    drawThorns(ctx) {
        for (const t of this.world.thorns) {
            const a = Math.min(1, 0.28 + t.flash * 0.72);
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.globalAlpha = a;
            ctx.fillStyle = '#4b2c30';
            ctx.strokeStyle = '#bc7770';
            ctx.lineWidth = 1.4;
            ctx.lineJoin = 'round';
            for (let i = 0; i < 5; i++) {
                const ang = (i / 5) * Math.PI * 2 + 0.25;
                const len = 8 + (i % 2) * 3;
                ctx.beginPath();
                ctx.moveTo(Math.cos(ang) * 2, Math.sin(ang) * 2);
                ctx.lineTo(Math.cos(ang - 0.28) * len, Math.sin(ang - 0.28) * len);
                ctx.lineTo(Math.cos(ang + 0.28) * len, Math.sin(ang + 0.28) * len);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
            ctx.fillStyle = '#d89a77';
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    drawPlayer(ctx) {
        const p = this.world.player;
        const blink = this.world.invulnT > 0 && Math.floor(this.time * 12) % 2 === 0;
        const a = blink ? 0.35 : 1;
        // 微光圈（萤的体光，不揭示岩壁）
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, RULES.glowR);
        g.addColorStop(0, `rgba(255,233,168,${(0.3 * a).toFixed(3)})`);
        g.addColorStop(0.5, `rgba(255,233,168,${(0.08 * a).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,233,168,0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, RULES.glowR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        // 翅膀脉冲
        const wing = 0.6 + 0.4 * Math.sin(this.time * 9);
        ctx.strokeStyle = `rgba(255,233,168,${(0.5 * wing * a).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + wing * 2, 0, Math.PI * 2);
        ctx.stroke();
        // 身体
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,244,204,${a})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x - 1.4, p.y - 1.4, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
        ctx.fill();
    }

    drawHearts(ctx) {
        const hearts = this.world.hearts;
        for (let i = 0; i < RULES.hearts; i++) {
            const x = 18 + i * 20;
            const y = 18;
            const on = i < hearts;
            ctx.beginPath();
            ctx.moveTo(x, y + 5.4);
            ctx.bezierCurveTo(x - 7, y - 1.2, x - 4.4, y - 6.6, x, y - 2.4);
            ctx.bezierCurveTo(x + 4.4, y - 6.6, x + 7, y - 1.2, x, y + 5.4);
            ctx.closePath();
            if (on) {
                ctx.fillStyle = 'rgba(255,107,122,0.92)';
                ctx.fill();
            } else {
                ctx.strokeStyle = 'rgba(255,107,122,0.35)';
                ctx.lineWidth = 1.3;
                ctx.stroke();
            }
        }
    }

    drawJoystick(ctx) {
        if (!this.joy) return;
        const j = this.joy;
        ctx.beginPath();
        ctx.arc(j.ox, j.oy, 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,233,168,0.16)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        const dx = j.x - j.ox, dy = j.y - j.oy;
        const d = Math.hypot(dx, dy);
        const k = d > 0 ? Math.min(1, 26 / d) : 0;
        ctx.beginPath();
        ctx.arc(j.ox + dx * k, j.oy + dy * k, 11, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,233,168,0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,233,168,0.3)';
        ctx.stroke();
    }

    /** 菜单态：缓慢的装饰涟漪（远处未知之声） */
    drawMenuAmbience(ctx) {
        // 底色、岩层与萤光尘埃已由 drawBackdrop() 画好，这里只叠装饰涟漪
        const t = this.time;
        const rings = [
            { x: 132, y: 458, per: 4.2, maxR: 96, color: '99,199,200' },
            { x: 356, y: 210, per: 3.6, maxR: 76, color: '194,147,85' },
            { x: 250, y: 330, per: 5.4, maxR: 120, color: '137,191,188' },
        ];
        for (const r of rings) {
            const k = (t % r.per) / r.per;
            const rad = 6 + (r.maxR - 6) * k;
            ctx.beginPath();
            ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r.color},${(0.16 * (1 - k)).toFixed(3)})`;
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }
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
    window.ecGame = new EchoCaveGame();
    bindFrame({ logicalWidth: W });
    const more = document.getElementById('ecSideMore');
    if (more) renderMoreGames(more, { exclude: 'echo-cave.html' });
    window.ecDrawer = createStatsDrawer({
        idPrefix: 'ec',
        getGame: () => window.ecGame,
        onPause: () => window.ecGame && window.ecGame.pauseQuiet(),
        onResume: () => window.ecGame && window.ecGame.resumeQuiet(),
        isBusy: () => !!(window.ecGame && window.ecGame.isRunning()),
        ICONS,
        // ⚠️ 契约是 () => object（整表），不是 (key) => string。
        getText: () => (window.ecGame ? window.ecGame.textTable() : LANGUAGES.en),
    });
    window.ecDrawer.init();
});

onReady(() => {
    bindChrome({
        self: 'echo-cave.html',
        // ⚠️ 必须含 'more'：页脚「更多游戏」的展开行为归 chrome。
        // ⚠️ 必须含 'home'：顶栏首页钮是无 href 的 <button>，跳转完全靠 chrome 接管
        //（owns 默认只含 more，漏掉 'home' = 死按钮，verify-chrome §⑧ 会抓）。
        owns: ['more', 'home'],
        // ⚠️ 共享层要的是整表。
        getText: () => (window.ecGame ? window.ecGame.textTable() : LANGUAGES.en),
    });
});
