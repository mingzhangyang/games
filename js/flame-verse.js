/**
 * 焰语 Flame Verse — 焰色光谱解谜
 * ==================================================================
 * 玩法：气体焰本是淡蓝。往里投一撮盐，火焰就开始说话——每种元素都用自己
 * 那几条固定的谱线作答。上方是未知样品的光之条码，下方是你这一炉的条码：
 * 谱线落在哪个波长 = 哪种元素，线有多亮 = 投了多少把。
 *
 * 成本铁律：盐**只能往里加**。想减只能「倒掉重撒」（罚金 2）。
 *   成本 = 投盐把数 + 倒掉罚金（asc）。于是「读数」才是技能：
 *   看错元素 = 白投一把还得倒掉；档位投多了也一样。
 *
 * 机制即教学：
 *   · 谱线位置是元素的指纹（由原子能级决定，永不改变）；
 *   · 条码故意画得有点糊（sigma 3.5nm）——Li 671 与 Sr 674 只差 3nm 会糊成
 *     一条，逼玩家去看各自的次级线（Li 610 / Sr 631+606）才能分辨。
 *     真实的定谱分析就是这么读的：靠**谱线组**定罪，不靠单条线。
 *   · 火焰会把所有颜色混在一起（同色异谱），所以要看条码，别看火焰。
 *
 * 关卡数据 / 谱线库在 js/flame-verse-rules.js（纯模块，校验器共用）。
 * par 由 scripts/verify-flame-verse-levels.mjs 复核，绝不手填。
 *
 * 共享层（2026-09 契约）：game-frame / game-drawer / game-chrome /
 * leaderboard / daily / i18n / safe-storage / analytics / game-sfx / boot。
 */

import {
    STAGE,
    FLAME,
    TARGET,
    MINE,
    RACK,
    STATUS,
    WL,
    RULES,
    ELEMENTS,
    EL_ORDER,
    LEVELS,
    wlX,
    LINE_SIGMA,
    costOf,
    matchRecipe,
    diffList,
    blendColor,
    starsForLevel,
    dailyCourse,
    doseName,
} from './flame-verse-rules.js';
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

const GOLD = '#ffd34d';
const DIM = 'rgba(200,214,255,0.62)';

// 投盐是「沙」的一声撒进去，倒掉是气流抽走的一记闷响，
// 吻合是三条谱线依次点亮的和弦，没对上是塌下去的噪声。
// ⚠️ createSfxEngine 是**裸引擎**（只有 tone/noise），语义音效要自己包一层。
const sfxEngine = createSfxEngine();

const Sfx = {
    click() {
        sfxEngine.tone({ freq: 880, type: 'sine', dur: 0.08, vol: 0.07 });
        sfxEngine.tone({ freq: 1320, type: 'sine', dur: 0.05, vol: 0.03, delay: 0.02 });
    },
    salt() {
        sfxEngine.noise({ dur: 0.16, vol: 0.06, filterFreq: 2600, filterSlideTo: 900 });
        sfxEngine.tone({ freq: 520, slideTo: 720, type: 'triangle', dur: 0.1, vol: 0.05 });
    },
    dump() {
        sfxEngine.noise({ dur: 0.34, vol: 0.07, filterFreq: 1100, filterSlideTo: 240 });
        sfxEngine.tone({ freq: 240, slideTo: 120, type: 'triangle', dur: 0.2, vol: 0.06 });
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
        sfxEngine.tone({ freq: 300, slideTo: 110, type: 'sawtooth', dur: 0.3, vol: 0.08 });
        sfxEngine.noise({ dur: 0.2, vol: 0.05, filterFreq: 480 });
    },
};

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function vibrate(pattern) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* 不支持则忽略 */ }
}

/**
 * 波长 → 近似可见光颜色（条码线的真实颜色）。
 * 这是一条谱线**看上去**的颜色：670.8nm 就是深红。Li 与 Sr 的主线都是红，
 * 颜色分不开 —— 这正是要玩家去看位置和次级线的理由。
 */
function wlColor(nm) {
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else { r = 1; }
    // 视见函数在两端衰减：400nm 和 700nm 本来就暗
    const f = 0.35 + 0.65 * Math.max(0, Math.min(1, 1 - Math.abs(nm - 555) / 210));
    const c = [r, g, b].map(v => Math.round(clamp(v, 0, 1) * 255 * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = makeText({
    en: {
        stats: 'Stats',
        title: 'Flame Verse',
        subtitle: 'Salt · Flame · Light',
        howto: 'A jet of gas burns pale blue and quiet. Throw a pinch of salt into it and the flame starts to talk: every element answers with its own fixed set of light lines, placed by its atoms and never moving. Above is the unknown sample\'s barcode of light — read it. Where a line falls tells you the element; how brightly it burns tells you how much. Eight salts sit on the rack below: a pinch is one throw, and three pinches is all one salt will take. Salt only goes in — to take it back out you must empty the burner and start over, and that costs two. Match every line, then send it for assay. You are judged on how few pinches it took.',
        playLevels: 'Levels',
        playDaily: 'Daily',
        sample: 'Sample',
        daily: 'Daily',
        levelSelect: 'Select sample',
        cost: 'Cost',
        par: 'Par',
        throws: 'Throws',
        refills: 'Emptied',
        targetBar: 'Unknown sample',
        mineBar: 'Your flame',
        rack: 'Salt rack',
        dump: 'Empty & re-sprinkle',
        assay: 'Assay',
        menu: 'Home',
        retry: 'Retry',
        next: 'Next',
        again: 'Again',
        levelCleared: 'Lines match!',
        dailyDone: 'Daily complete!',
        bestToday: 'Your best today',
        stars: 'Stars',
        paid: 'Best throws',
        leaderboard: 'Global · Today\'s Run',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        resetTitle: 'Restart sample',
        home: 'Home',
        playerName: 'Name',
        hint: 'A line\'s position is the element\'s fingerprint; its brightness is how much — read it right and you waste nothing',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
        legendTitle: 'Salt rack',
        legendNote: 'Potassium\'s strongest line is 766nm, out in the infrared — in the visible band you read its 404nm pair instead',
        dailyStartToast: 'Five unknown samples · same course for everyone today',
        jarFull: 'That salt has taken all three pinches',
        jarEmpty: 'The burner is already empty',
        throwFirst: 'Throw a pinch of salt before you assay',
        failDiff: 'Lines differ',
        diffMore: '{salt} +{n} too many',
        diffLess: '{salt} −{n} more',
        doseTrace: 'trace',
        doseMedium: 'medium',
        doseStrong: 'strong',
        tipSalt: 'Read position first, colour second: find where the lines fall, then look up who owns them',
        tipDose: 'Brightness is the dose — a faint line is one pinch, a blazing one is three',
        tipPair: 'Two salts burn almost the same colour and their main lines nearly overlap; tell them apart by the smaller lines beside them',
        tipBlend: 'The flame mixes every colour you throw in. Read the barcode, not the flame',
    },
    zh: {
        stats: '数据统计',
        title: '焰语',
        subtitle: '投盐 · 看焰 · 读谱',
        howto: '一束气体安静地烧着，火焰本是淡蓝。往里投一撮盐，它就开始说话：每种元素都用自己那几条固定的谱线作答，位置由原子能级决定，永不改变。上方是未知样品的光之条码——读懂它。谱线落在哪个波长，就是哪种元素；线有多亮，就是投了多少。下面盐架上有八种盐，一撮算一把，同一种盐最多投三把。盐只能往里加——想拿出来，只能倒掉重撒，罚金两点。把每一条线都对上，再送检。评判只看你一共投了几把。',
        playLevels: '关卡模式',
        playDaily: '每日挑战',
        sample: '样品',
        daily: '每日',
        levelSelect: '选择样品',
        cost: '代价',
        par: '目标',
        throws: '投盐',
        refills: '倒掉',
        targetBar: '未知样品',
        mineBar: '你的火焰',
        rack: '盐架',
        dump: '倒掉重撒',
        assay: '送检',
        menu: '返回',
        retry: '重试',
        next: '下一份',
        again: '再来一次',
        levelCleared: '谱线吻合！',
        dailyDone: '每日完成！',
        bestToday: '今日最佳',
        stars: '星数',
        paid: '最少投盐',
        leaderboard: '全球 · 今日赛程',
        noScores: '还没有成绩',
        lbOffline: '排行榜离线',
        copyResult: '复制',
        resetTitle: '重开本样品',
        home: '首页',
        playerName: '昵称',
        hint: '谱线位置是元素的指纹，亮度是它的含量——读数准，就一把不多',
        sideHowTo: '玩法',
        sideRecords: '记录',
        legendTitle: '盐架图谱',
        legendNote: '钾最强的谱线在 766nm，已落入红外——可见段里读的是它 404nm 的一对线',
        dailyStartToast: '五份未知样品 · 全世界今天同一份赛程',
        jarFull: '这种盐已经投满三把了',
        jarEmpty: '炉里本来就是空的',
        throwFirst: '先投一撮盐，再送检',
        failDiff: '谱线不符',
        diffMore: '{salt} 多了 {n} 把',
        diffLess: '{salt} 还少 {n} 把',
        doseTrace: '痕',
        doseMedium: '次',
        doseStrong: '主',
        tipSalt: '先看位置再看颜色：找到谱线落在哪个波长，再去盐架上找主人',
        tipDose: '亮度就是档位：线淡是一把，线灼是三把',
        tipPair: '两种盐烧出来几乎同色，主线也几乎重叠——要靠旁边那些次级线分辨',
        tipBlend: '火焰会把所有颜色混在一起。要读条码，别读火焰',
    },
});

function emptyRecipe() {
    const out = {};
    for (const k of EL_ORDER) out[k] = 0;
    return out;
}

function storageParseProgress() {
    try {
        const obj = JSON.parse(storageGet('fv_progress') || '{}');
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

class FlameVerseGame {
    constructor() {
        this.canvas = document.getElementById('fv-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        [
            'fv-hud-level', 'fv-budget', 'fv-par', 'fv-reset-btn', 'fv-mute-btn', 'fv-toast',
            'fv-start', 'fv-title', 'fv-subtitle', 'fv-howto', 'fv-btn-levels', 'fv-btn-daily',
            'fv-level-label', 'fv-level-grid', 'fv-daily-best', 'fv-start-mute',
            'fv-side-howto-title', 'fv-side-howto', 'fv-side-records-title', 'fv-side-records',
            'fv-side-legend-title', 'fv-side-legend',
            'fv-clear', 'fv-clear-stars', 'fv-clear-line', 'fv-btn-next', 'fv-btn-replay', 'fv-btn-menu1',
            'fv-over', 'fv-over-title', 'fv-over-score', 'fv-over-sub',
            'fv-btn-again', 'fv-btn-copy', 'fv-btn-menu2',
            'fv-lb-title', 'fv-lb-list', 'fv-lb-status', 'fv-username', 'fv-username-label',
            'fv-hint', 'fv-clear-btn', 'fv-run-btn',
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^fv-/, '')] = el;
        });

        this.lang = getLang();
        this.progress = storageParseProgress();

        // 对局状态：menu | playing | won-level | won-daily
        // （焰语没有 terminal 失败态：送检不吻合只是一次读数反馈，继续投盐即可）
        // ⚠️ 字段名与 verify-stats-drawer.mjs 的 AUGMENT runningExpr 严格对应
        this.state = 'menu';
        this.isPaused = false;
        this.mode = 'levels';
        this.levelIdx = 0;
        this.spec = null;
        this.recipe = emptyRecipe();
        this.throws = 0;
        this.refills = 0;
        this.diff = [];
        this.daily = null;         // { key, display, course:[spec], cursor, totalCost, stars }

        this.time = 0;
        this.toastTimer = 0;
        this.flamePulse = 0;

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
     * ⚠️ 共享层的 getText 契约是 () => object，不是 (key) => string。
     */
    textTable() {
        return LANGUAGES[this.lang] || LANGUAGES.en;
    }

    saltName(k) {
        const e = ELEMENTS[k];
        return this.lang === 'zh' ? e.salt.zh : e.salt.en;
    }

    elemName(k) {
        const e = ELEMENTS[k];
        return this.lang === 'zh' ? e.name.zh : e.name.en;
    }

    doseWord(d) {
        if (d === 1) return this.t('doseTrace');
        if (d === 2) return this.t('doseMedium');
        if (d === 3) return this.t('doseStrong');
        return doseName(this.lang === 'zh' ? 'zh' : 'en', d);
    }

    /** 当前代价：投盐把数 + 倒掉罚金 */
    cost() {
        return this.throws + this.refills * RULES.refillCost;
    }

    /** 动作钮只在 playing 态显示（z-index 高于 overlay，菜单态会挡住关卡 chips） */
    syncActionVisibility() {
        const on = this.state === 'playing';
        if (this.el['run-btn']) this.el['run-btn'].classList.toggle('is-dimmed', !on);
        if (this.el['clear-btn']) this.el['clear-btn'].classList.toggle('is-dimmed', !on);
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
            el['btn-again'].addEventListener('click', () => { Sfx.click(); this.restartDaily(); });
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
            // ⚠️ 键名是 soundOn / soundOff（js/icons.js）
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
        if (el['run-btn']) el['run-btn'].addEventListener('click', () => this.pressAssay());
        if (el['clear-btn']) el['clear-btn'].addEventListener('click', () => this.pressDump());
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
            ? '焰语 — 焰色光谱解谜'
            : 'Flame Verse — Flame Spectrum Puzzle';
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
        if (el['run-btn']) el['run-btn'].title = this.t('assay');
        if (el['clear-btn']) el['clear-btn'].title = this.t('dump');

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
            btn.className = 'fv-chip' + (p.stars > 0 ? ' is-done' : '');
            btn.dataset.level = String(i);
            const num = document.createElement('span');
            num.className = 'fv-chip-num';
            num.textContent = String(i + 1);
            const stars = document.createElement('span');
            stars.className = 'fv-chip-stars';
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
            [this.t('sample'), `${cleared} / ${LEVELS.length}`],
            [this.t('stars'), `${stars} / ${LEVELS.length * 3}`],
            [this.t('paid'), bestCount ? String(bestSum) : '—'],
        ];
        box.innerHTML = '';
        for (const [k, v] of rows) {
            const row = document.createElement('div');
            row.className = 'fv-side-row';
            const kk = document.createElement('span');
            kk.className = 'fv-side-k';
            kk.textContent = k;
            const vv = document.createElement('span');
            vv.className = 'fv-side-v';
            vv.textContent = v;
            row.appendChild(kk);
            row.appendChild(vv);
            box.appendChild(row);
        }
    }

    /**
     * 盐架图谱：符号 + 参考条码（linear-gradient 按真实波长打色标）。
     * 条码黑底 + 竖线的读法与 canvas 里完全一致：400nm 在左，700nm 在右。
     */
    renderLegend() {
        const box = this.el['side-legend'];
        if (!box) return;
        box.innerHTML = '';
        const [lo, hi] = WL;
        for (const k of EL_ORDER) {
            const e = ELEMENTS[k];
            const row = document.createElement('div');
            row.className = 'fv-legend-row';

            const sym = document.createElement('span');
            sym.className = 'fv-legend-sym';
            sym.style.color = e.color;
            sym.textContent = e.sym;

            const bar = document.createElement('span');
            bar.className = 'fv-legend-bar';
            const stops = [];
            for (const line of e.lines) {
                const u = ((line.nm - lo) / (hi - lo)) * 100;
                const half = (LINE_SIGMA / (hi - lo)) * 100;
                const a = 0.35 + 0.65 * line.w;
                stops.push(`rgba(0,0,0,0) ${(u - half * 2).toFixed(2)}%`);
                stops.push(`${wlColor(line.nm)} ${(u - half * 0.5).toFixed(2)}%`);
                stops.push(`rgba(255,255,255,${(a * 0.5).toFixed(2)}) ${u.toFixed(2)}%`);
                stops.push(`${wlColor(line.nm)} ${(u + half * 0.5).toFixed(2)}%`);
                stops.push(`rgba(0,0,0,0) ${(u + half * 2).toFixed(2)}%`);
            }
            bar.style.backgroundImage = `linear-gradient(90deg, ${stops.join(', ')})`;

            const tx = document.createElement('span');
            tx.className = 'fv-legend-text';
            const nms = e.lines.map(l => `${l.nm}`).join(' / ');
            tx.textContent = `${this.saltName(k)} · ${nms}nm`;

            row.appendChild(sym);
            row.appendChild(bar);
            row.appendChild(tx);
            box.appendChild(row);
        }
        const note = document.createElement('div');
        note.className = 'fv-legend-row';
        const nt = document.createElement('span');
        nt.className = 'fv-legend-text';
        nt.style.opacity = '0.72';
        nt.textContent = this.t('legendNote');
        note.appendChild(nt);
        box.appendChild(note);
    }

    /* ---------------------- 模式与关卡流程 ---------------------- */

    startLevels() {
        track('flame-verse', 'start_levels');
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
        track('flame-verse', 'start_daily');
        this.startLevel(course[0]);
        this.showToast(this.t('dailyStartToast'));
    }

    startLevel(ref) {
        const spec = (ref && typeof ref === 'object') ? ref : LEVELS[clamp(ref, 0, LEVELS.length - 1)];
        const idx = LEVELS.indexOf(spec);
        this.levelIdx = idx >= 0 ? idx : 0;
        this.spec = spec;
        this.recipe = emptyRecipe();
        this.throws = 0;
        this.refills = 0;
        this.diff = [];
        this.state = 'playing';
        this.isPaused = false;
        this.lastFrame = 0;
        this.hide(this.el['start']);
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.syncActionVisibility();
        this.updateHud();
        this.showToast(this.t(this.spec.tipKey || 'tipSalt'));
    }

    restartLevel() {
        if (this.mode === 'daily' && this.daily) {
            this.startLevel(this.daily.course[this.daily.cursor]);
        } else {
            this.startLevel(this.levelIdx);
        }
    }

    restartDaily() {
        if (this.mode === 'daily' && this.daily) {
            const key = this.daily.key;
            this.daily = { key, display: this.daily.display, course: dailyCourse(key), cursor: 0, totalCost: 0, stars: 0 };
            this.startLevel(this.daily.course[0]);
        } else {
            this.restartLevel();
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
        this.recipe = emptyRecipe();
        this.throws = 0;
        this.refills = 0;
        this.diff = [];
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.show(this.el['start']);
        this.syncActionVisibility();
        this.renderLevelGrid();
        this.renderSideRecords();
    }

    /* ---------------------- 动作 ---------------------- */

    /** 投一撮盐：档位 +1（上限 3），成本 +1 */
    throwSalt(k) {
        if (this.state !== 'playing' || this.isPaused) return false;
        if (this.recipe[k] >= RULES.maxDose) {
            this.showToast(this.t('jarFull'));
            return false;
        }
        this.recipe[k] += 1;
        this.throws += 1;
        this.diff = [];
        this.flamePulse = 1;
        Sfx.salt();
        vibrate(12);
        this.updateHud();
        track('flame-verse', 'throw', this.throws);
        return true;
    }

    /** 倒掉重撒：全部归零，罚金 +2（本来就是空的不罚） */
    pressDump() {
        if (this.state !== 'playing' || this.isPaused) return;
        if (costOf(this.recipe) === 0) {
            this.showToast(this.t('jarEmpty'));
            return;
        }
        this.recipe = emptyRecipe();
        this.refills += 1;
        this.diff = [];
        this.flamePulse = 1;
        Sfx.dump();
        vibrate([15, 30]);
        this.updateHud();
        track('flame-verse', 'dump', this.refills);
    }

    /** 送检：档位全对才算吻合 */
    pressAssay() {
        if (this.state !== 'playing' || this.isPaused) return;
        if (costOf(this.recipe) === 0) {
            this.showToast(this.t('throwFirst'));
            return;
        }
        if (!matchRecipe(this.spec, this.recipe)) {
            this.diff = diffList(this.spec, this.recipe);
            Sfx.fail();
            vibrate([20, 35, 20]);
            this.showToast(`${this.t('failDiff')} · ${this.diffText()}`);
            track('flame-verse', 'assay_miss', this.diff.length);
            return;
        }
        this.onLevelCleared();
    }

    diffText() {
        const parts = [];
        for (const d of this.diff.slice(0, 3)) {
            const n = Math.abs(d.want - d.got);
            parts.push(this.t(d.got > d.want ? 'diffMore' : 'diffLess', { salt: this.saltName(d.el), n }));
        }
        return parts.join(' · ');
    }

    /* ---------------------- 结算 ---------------------- */

    onLevelCleared() {
        const cost = this.cost();
        const par = this.spec.par;
        const stars = starsForLevel(cost, par);
        Sfx.win();
        vibrate(30);
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
        track('flame-verse', 'level_win', stars);
    }

    /** 战役全通 → 提交各关最小代价总和（asc 榜） */
    maybeSubmitCampaign() {
        let sum = 0, complete = true;
        for (const spec of LEVELS) {
            const p = this.progress[spec.id];
            if (!p || p.stars === 0) { complete = false; break; }
            sum += p.bestCost;
        }
        if (complete && sum > 0) this.submit('flame-verse', sum);
    }

    showClearPanel(stars, cost) {
        const el = this.el;
        this.state = 'won-level';
        if (el['clear-stars']) el['clear-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        if (el['clear-line']) {
            el['clear-line'].textContent = `${this.t('cost')} ${cost} · ${this.t('par')} ${this.spec.par} · ${this.t('throws')} ${this.throws} · ${this.t('refills')} ${this.refills}`;
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
        const game = `flame-verse-d${this.daily.key.replace(/-/g, '')}`;
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
            const raw = storageGet('fv_lb_' + game);
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
            li.className = 'fv-lb-row';
            if (i < 3) li.classList.add(`fv-lb-top${i + 1}`);
            const rank = document.createElement('span');
            rank.className = 'fv-lb-rank';
            rank.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'fv-lb-name';
            nm.textContent = row.name || '—';
            const sc = document.createElement('span');
            sc.className = 'fv-lb-score';
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
            : `${this.t('title')} · ${this.t('sample')} ${this.levelIdx + 1} · ${this.t('cost')} ${this.cost()}`;
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
            storageSet('fv_progress', JSON.stringify(this.progress));
        } catch (e) { /* 忽略 */ }
    }

    /* ---------------------- HUD / Toast ---------------------- */

    updateHud() {
        const el = this.el;
        if (el['budget']) el['budget'].textContent = String(this.cost());
        if (el['par']) el['par'].textContent = `${this.t('par')} ${this.spec ? this.spec.par : 0}`;
        if (el['hud-level']) {
            if (this.mode === 'daily' && this.daily) {
                el['hud-level'].textContent = `${this.t('daily')} ${this.daily.cursor + 1}/${this.daily.course.length}`;
            } else {
                // ⚠️ 不能加 `&& this.spec` 门槛：菜单态 HUD 会停在静态英文文案不跟随语言。
                el['hud-level'].textContent = `${this.t('sample')} ${this.levelIdx + 1}/${LEVELS.length}`;
            }
        }
    }

    showToast(text) {
        const el = this.el['toast'];
        if (!el) return;
        el.textContent = text;
        el.classList.add('is-on');
        this.toastTimer = 3.2;
    }

    hideToast() {
        const el = this.el['toast'];
        if (el) el.classList.remove('is-on');
    }

    // ⚠️ 类名必须是 `hidden`
    show(el) { if (el) el.classList.remove('hidden'); }
    hide(el) { if (el) el.classList.add('hidden'); }

    /* ---------------------- 输入 ---------------------- */

    bindInput() {
        const c = this.canvas;
        c.style.touchAction = 'none';

        document.addEventListener('keydown', (e) => {
            if (this.state === 'playing' && !this.isPaused && !e.repeat) {
                if (e.key >= '1' && e.key <= '8') {
                    this.throwSalt(EL_ORDER[Number(e.key) - 1]);
                    e.preventDefault();
                    return;
                }
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    this.pressDump();
                    e.preventDefault();
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    this.pressAssay();
                    e.preventDefault();
                    return;
                }
            }
            if (e.key === 'r' || e.key === 'R') {
                if (this.state === 'playing') this.restartLevel();
            } else if (e.key === 'Escape') {
                if (this.state === 'playing') this.toMenu();
            }
        });

        // 盐架：pointerdown 直接触发（不等 click，移动端更跟手）
        c.addEventListener('pointerdown', (e) => {
            if (this.state !== 'playing' || this.isPaused) return;
            if (e.cancelable) e.preventDefault();
            const p = this.stageFromEvent(e);
            const k = this.jarAt(p.x, p.y);
            if (k) this.throwSalt(k);
        });
        c.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /** 画布像素 → 舞台逻辑坐标（后端缓冲区按 renderScale 放大过） */
    stageFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H,
        };
    }

    /** 盐罐几何：8 个等宽罐（65 逻辑 px，>44px 触控下限） */
    jarRect(i) {
        return { x: RACK.x + i * 65, y: RACK.y, w: 61, h: RACK.h };
    }

    jarAt(x, y) {
        if (x < RACK.x || x > RACK.x + RACK.w) return null;
        if (y < RACK.y - 6 || y > RACK.y + RACK.h + 6) return null;
        const i = Math.floor((x - RACK.x) / 65);
        return EL_ORDER[clamp(i, 0, EL_ORDER.length - 1)];
    }

    bindUI() {
        window.addEventListener('site-settings:changed', () => {
            this.lang = getLang();
            this.applyLanguage();
        });
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('game-frame:changed', () => this.resize());
    }

    /* ---------------------- 暂停适配（抽屉契约） ---------------------- */

    pauseQuiet() { this.isPaused = true; }
    resumeQuiet() { this.lastFrame = 0; this.isPaused = false; }
    isRunning() { return this.state === 'playing' && !this.isPaused; }

    /* ---------------------- 尺寸 ---------------------- */

    resize() {
        // ⚠️ 必须用 clientWidth（整数）而非 getBoundingClientRect().width（亚像素）
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
            if (this.flamePulse > 0) this.flamePulse = Math.max(0, this.flamePulse - dt * 1.5);
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

        if (this.state === 'menu' || !this.spec) {
            const k = EL_ORDER[Math.floor(this.time / 2.4) % EL_ORDER.length];
            this.drawFlame(ctx, { [k]: 2 });
            this.drawBarcode(ctx, TARGET, { [k]: 2 }, this.t('targetBar'));
            this.drawBarcode(ctx, MINE, { [k]: 2 }, this.t('mineBar'));
            this.drawRack(ctx, { [k]: 2 });
            return;
        }
        this.drawFlame(ctx, this.recipe);
        this.drawBarcode(ctx, TARGET, this.spec.recipe, this.t('targetBar'));
        this.drawBarcode(ctx, MINE, this.recipe, this.t('mineBar'));
        this.drawRack(ctx, this.recipe);
        this.drawStatus(ctx);
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

    /* ---------------------- 火焰 ---------------------- */

    /**
     * 火焰：元素按档位分配粒子数 —— 混投的火焰里能看见各自颜色的火舌
     * （教学：焰色是混的，条码才是一一对应的）。没投盐时只剩本生灯的淡蓝焰。
     */
    drawFlame(ctx, recipe) {
        const box = FLAME;
        this.roundRect(ctx, box.x, box.y, box.w, box.h, 12);
        ctx.fillStyle = '#07050e';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,190,255,0.16)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const cx = box.x + box.w / 2;
        const baseY = box.y + box.h - 30;
        const total = costOf(recipe);
        const flameH = 46 + Math.min(total, 12) * 11 + this.flamePulse * 10;

        // 灯头
        ctx.fillStyle = '#2a2436';
        ctx.fillRect(cx - 26, baseY, 52, 14);
        ctx.fillStyle = '#4a4258';
        ctx.fillRect(cx - 18, baseY - 5, 36, 6);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // 本生灯底焰：永远是淡蓝（没投盐时也只有它）
        const blue = ctx.createRadialGradient(cx, baseY - 14, 2, cx, baseY - 14, 46);
        blue.addColorStop(0, 'rgba(150,200,255,0.55)');
        blue.addColorStop(0.5, 'rgba(70,120,255,0.22)');
        blue.addColorStop(1, 'rgba(40,60,180,0)');
        ctx.fillStyle = blue;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 16, 30, 42, 0, 0, Math.PI * 2);
        ctx.fill();

        // 元素火舌：确定性粒子（index → 相位/速度），零随机数
        let seed = 0;
        for (const k of EL_ORDER) {
            const d = recipe[k] | 0;
            if (!d) continue;
            const e = ELEMENTS[k];
            const n = Math.min(d * RULES.flamePerDose, 84);
            for (let j = 0; j < n; j++) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                const ph = (seed % 9973) / 9973;
                const sp = 0.5 + ((seed >> 7) % 40) / 100;
                const life = (this.time * sp + ph) % 1;
                const wob = Math.sin(life * 7 + ph * 6.283) * (5 + 24 * life);
                const x = cx + wob + (((seed >> 3) % 17) - 8) * (2 + 6 * life);
                const y = baseY - life * flameH * (0.62 + ((seed >> 5) % 30) / 80);
                const a = (1 - life) * 0.5;
                const r = 1.1 + 3.4 * (1 - life);
                ctx.fillStyle = e.flame;
                ctx.globalAlpha = a;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // 焰心：混合色的一团亮核（同色异谱就发生在这里 —— 别读它）
        const core = blendColor(recipe);
        const cg = ctx.createRadialGradient(cx, baseY - flameH * 0.34, 2, cx, baseY - flameH * 0.34, flameH * 0.5);
        cg.addColorStop(0, core);
        cg.addColorStop(0.45, core);
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalAlpha = total ? 0.34 : 0.12;
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - flameH * 0.34, flameH * 0.3, flameH * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 标题：这一炉总共投了几把
        ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = DIM;
        const label = this.state === 'menu'
            ? this.t('subtitle')
            : `${this.spec.name ? (this.lang === 'zh' ? this.spec.name.zh : this.spec.name.en) : ''} · ${this.t('throws')} ${this.throws}`;
        ctx.fillText(label, box.x + 10, box.y + 8);
    }

    /* ---------------------- 条码 ---------------------- */

    drawBarcode(ctx, box, recipe, title) {
        this.roundRect(ctx, box.x, box.y, box.w, box.h, 10);
        ctx.fillStyle = 'rgba(6,4,14,0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,190,255,0.2)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = DIM;
        ctx.fillText(title, box.x + 10, box.y + 7);

        const linesTop = box.y + 22;
        const linesH = box.h - 22 - 18;
        const axisY = box.y + box.h - 14;

        // 谱线：软边竖带（sigma 故意偏大 —— 邻近线会糊在一起，逼玩家看谱线组）
        const halfPx = (LINE_SIGMA / (WL[1] - WL[0])) * box.w;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const k of EL_ORDER) {
            const d = recipe[k] | 0;
            if (!d) continue;
            const e = ELEMENTS[k];
            for (const line of e.lines) {
                const x = wlX(line.nm, box);
                const peak = Math.min(1, 0.3 + 0.24 * d * line.w);
                const g = ctx.createLinearGradient(x - halfPx * 2, 0, x + halfPx * 2, 0);
                g.addColorStop(0, 'rgba(0,0,0,0)');
                g.addColorStop(0.35, wlColor(line.nm));
                g.addColorStop(0.5, `rgba(255,255,255,${(peak * 0.75).toFixed(3)})`);
                g.addColorStop(0.65, wlColor(line.nm));
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = peak;
                ctx.fillStyle = g;
                ctx.fillRect(x - halfPx * 2, linesTop, halfPx * 4, linesH);
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // 波长轴：真实可见光谱的彩虹条（400nm 左 → 700nm 右）
        const ag = ctx.createLinearGradient(box.x + 8, 0, box.x + box.w - 8, 0);
        for (let nm = WL[0]; nm <= WL[1]; nm += 15) {
            ag.addColorStop((nm - WL[0]) / (WL[1] - WL[0]), wlColor(nm));
        }
        ctx.fillStyle = ag;
        ctx.fillRect(box.x + 8, axisY, box.w - 16, 5);

        ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(200,214,255,0.45)';
        ctx.textAlign = 'left';
        ctx.fillText('400', box.x + 8, axisY - 1);
        ctx.textAlign = 'center';
        ctx.fillText('550', box.x + box.w / 2, axisY - 1);
        ctx.textAlign = 'right';
        ctx.fillText('700nm', box.x + box.w - 8, axisY - 1);
        ctx.textAlign = 'left';
    }

    /* ---------------------- 盐架 ---------------------- */

    drawRack(ctx, recipe) {
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        for (let i = 0; i < EL_ORDER.length; i++) {
            const k = EL_ORDER[i];
            const e = ELEMENTS[k];
            const r = this.jarRect(i);
            const d = recipe[k] | 0;
            const full = d >= RULES.maxDose;

            this.roundRect(ctx, r.x, r.y, r.w, r.h, 9);
            ctx.fillStyle = d ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)';
            ctx.fill();
            ctx.strokeStyle = d ? e.color : 'rgba(200,190,255,0.18)';
            ctx.lineWidth = d ? 1.8 : 1.1;
            ctx.stroke();

            // 元素符号
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.font = 'bold 17px ui-sans-serif, system-ui, sans-serif';
            ctx.fillStyle = e.color;
            ctx.fillText(e.sym, r.x + r.w / 2, r.y + 6);

            // 盐名（中文 3 字在 61px 里放得下）
            ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
            ctx.fillStyle = d ? 'rgba(235,240,255,0.9)' : 'rgba(200,214,255,0.55)';
            ctx.fillText(this.saltName(k), r.x + r.w / 2, r.y + 29);

            // 档位点：投了几把就亮几个
            const py = r.y + 50;
            for (let p = 0; p < RULES.maxDose; p++) {
                const px = r.x + r.w / 2 + (p - 1) * 15;
                ctx.beginPath();
                ctx.arc(px, py, 4.6, 0, Math.PI * 2);
                ctx.fillStyle = p < d ? e.color : 'rgba(255,255,255,0.14)';
                ctx.fill();
                if (p < d) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
            // 满档标记
            ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
            ctx.fillStyle = full ? GOLD : 'rgba(200,214,255,0.4)';
            ctx.fillText(full ? this.doseWord(d) : (d ? this.doseWord(d) : '0'),
                r.x + r.w / 2, r.y + 64);
        }
    }

    /* ---------------------- 状态带 ---------------------- */

    /**
     * 状态带（y 512 以下那条空带）：两个浮动动作钮在窄屏上会盖住左右两端，
     * 所以文字一律居中写，绝不铺满宽度。
     */
    drawStatus(ctx) {
        const cx = W / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(235,240,255,0.92)';
        const line1 = `${this.t('cost')} ${this.cost()} · ${this.t('par')} ${this.spec.par} · ${this.t('throws')} ${this.throws} · ${this.t('refills')} ${this.refills}`;
        ctx.fillText(line1, cx, STATUS.y + 10);

        ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
        if (this.diff.length) {
            ctx.fillStyle = '#ff8a5c';
            ctx.fillText(`${this.t('failDiff')} · ${this.diffText()}`, cx, STATUS.y + 28);
        } else {
            // ⚠️ 别画长 hint：两个浮动动作钮在窄屏会盖住左右两端，长文案必然被裁。
            // 页脚已有完整 hint，这里只放样品名。
            const nm = this.spec.name ? (this.lang === 'zh' ? this.spec.name.zh : this.spec.name.en) : '';
            ctx.fillStyle = 'rgba(200,214,255,0.62)';
            ctx.fillText(nm, cx, STATUS.y + 28);
        }
        ctx.textAlign = 'left';
    }
}

/* ────────────────────────── 启动 ────────────────────────── */

onReady(() => {
    window.fvGame = new FlameVerseGame();
    bindFrame({ logicalWidth: W });
    const more = document.getElementById('fvSideMore');
    if (more) renderMoreGames(more, { exclude: 'flame-verse.html' });
    window.fvDrawer = createStatsDrawer({
        idPrefix: 'fv',
        getGame: () => window.fvGame,
        onPause: () => window.fvGame && window.fvGame.pauseQuiet(),
        onResume: () => window.fvGame && window.fvGame.resumeQuiet(),
        isBusy: () => !!(window.fvGame && window.fvGame.isRunning()),
        ICONS,
        // ⚠️ 契约是 () => object（整表），不是 (key) => string。
        getText: () => (window.fvGame ? window.fvGame.textTable() : LANGUAGES.en),
    });
    window.fvDrawer.init();
});

onReady(() => {
    bindChrome({
        self: 'flame-verse.html',
        // ⚠️ 必须含 'more' 与 'home'：owns 默认只含 more，漏掉 'home' = 死按钮。
        owns: ['more', 'home'],
        getText: () => (window.fvGame ? window.fvGame.textTable() : LANGUAGES.en),
    });
});
