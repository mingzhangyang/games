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
 * 关卡数据 / 谱线库在本包的 model/rules.js（纯模块，校验器共用）。
 * par 由 tests/verify-flame-verse-levels.mjs 复核，绝不手填。
 *
 * 共享层（2026-09 契约）：game-frame / game-drawer / game-chrome /
 * leaderboard / daily / i18n / safe-storage / analytics / game-sfx / boot。
 */

import { renderSideRecords } from '../../platform/side-records.js';
import { bindContextualRestart } from '../../platform/contextual-restart.js';
import { shouldHandleGameShortcut } from '../../platform/runtime/game-shortcut-target.js';
import { LANGUAGES } from './i18n.js';
import { createLabConsole } from './ui/lab-console.js';

import {
    STAGE,
    FLAME,
    TARGET,
    MINE,
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
} from './model/rules.js';
import { ensurePlayerName, setPlayerName } from '../../platform/player.js';
import { getLang, getMuted, setMuted } from '../../platform/site-settings.js';
import { ICONS } from '../../platform/icons.js';
import { storageGet } from '../../platform/safe-storage.js';
import { FLAME_VERSE_STORAGE, FLAME_VERSE_STORAGE_SLOTS } from './storage.js';
import { track } from '../../platform/analytics.js';
import { todayKey, todayKeyDisplay } from '../../platform/daily.js';
import { createScoreboardResultSession, retryScoreResults } from '../../platform/scoreboard-submission.js';
import { renderEmbeddedScoreResult, resetEmbeddedScoreResult } from '../../platform/scoreboard-result-view.js';
import { createSfxEngine } from '../../platform/game-sfx.js';

/* ────────────────────────── 常量 ────────────────────────── */

export const W = STAGE.w;
const H = STAGE.h;

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

/* Language table lives in ./i18n.js. */

function emptyRecipe() {
    const out = {};
    for (const k of EL_ORDER) out[k] = 0;
    return out;
}

function storageParseProgress() {
    try {
        const obj = FLAME_VERSE_STORAGE.get(FLAME_VERSE_STORAGE_SLOTS.PROGRESS, {});
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

export class FlameVerseGame {
    constructor() {
        this.canvas = document.getElementById('fv-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        [
            'fv-hud-level', 'fv-budget', 'fv-par', 'fv-reset-btn', 'fv-mute-btn', 'fv-toast',
            'fv-start', 'fv-title', 'fv-subtitle', 'fv-howto', 'fv-btn-levels', 'fv-btn-daily',
            'fv-level-label', 'fv-level-grid', 'fv-daily-best',
            'fv-side-howto-title', 'fv-side-howto', 'fv-side-records-title', 'fv-side-records',
            'fv-side-legend-title', 'fv-side-legend',
            'fv-clear', 'fv-clear-stars', 'fv-clear-line', 'fv-clear-status', 'fv-btn-next', 'fv-btn-replay', 'fv-btn-menu1',
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
        this.state = 'menu'; this.contextualRestart?.sync();
        this.isPaused = false; this.contextualRestart?.sync();
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

        this.scoreRunId = 0;
        this.resultSession = createScoreboardResultSession({
            onChange: result => this.renderScoreResult(result),
        });
        this.el['lb-status']?.setAttribute('role', 'status');

        this.labConsole = createLabConsole(this);
        this.initUI();
        this.applyLanguage();
        this.bindInput();
        this.bindUI();
        this.syncActionVisibility();
        this.resize();
        this.startLoop();
        // Restore journaled results even while the player stays at the menu.
        void retryScoreResults();
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
        this.labConsole?.sync();
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
            this.contextualRestart = bindContextualRestart({
                button: el['reset-btn'],
                active: () => this.state === 'playing' && !this.isPaused,
                hasProgress: () => this.throws > 0 || this.refills > 0,
                restart: () => { Sfx.click(); this.restartLevel(); },
            });
        }
        if (el['mute-btn']) {
            // ⚠️ 键名是 soundOn / soundOff（src/platform/icons.js）
            el['mute-btn'].innerHTML = getMuted() ? ICONS.soundOff : ICONS.soundOn;
            el['mute-btn'].addEventListener('click', () => {
                const next = !getMuted();
                setMuted(next);
                el['mute-btn'].innerHTML = next ? ICONS.soundOff : ICONS.soundOn;
                if (!next) Sfx.click();
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

        if (el['budget']) el['budget'].title = this.t('cost');

        this.renderLevelGrid();
        this.renderLegend();
        this.renderSideRecords();
        this.updateHud();
        this.renderScoreResult();
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
            btn.className = 'fv-chip game-start-level-chip' + (p.stars > 0 ? ' is-done' : '');
            btn.dataset.level = String(i);
            const num = document.createElement('span');
            num.className = 'fv-chip-num game-start-chip-num';
            num.textContent = String(i + 1);
            const stars = document.createElement('span');
            stars.className = 'fv-chip-stars game-start-chip-stars';
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
        renderSideRecords(box, rows.map(([label, value]) => ({ label, value })), {
            rowClass: 'fv-side-row', labelClass: 'fv-side-k', valueClass: 'fv-side-v',
        });
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
            row.className = 'fv-legend-row game-legend-row';

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
            tx.className = 'fv-legend-text game-legend-text';
            const nms = e.lines.map(l => `${l.nm}`).join(' / ');
            tx.textContent = `${this.saltName(k)} · ${nms}nm`;

            row.appendChild(sym);
            row.appendChild(bar);
            row.appendChild(tx);
            box.appendChild(row);
        }
        const note = document.createElement('div');
        note.className = 'fv-legend-row game-legend-row';
        const nt = document.createElement('span');
        nt.className = 'fv-legend-text game-legend-text';
        nt.style.opacity = '0.72';
        nt.textContent = this.t('legendNote');
        note.appendChild(nt);
        box.appendChild(note);
    }

    /* ---------------------- 模式与关卡流程 ---------------------- */

    startLevels() {
        // Analytics play is emitted by startLevel(), after a valid stage is loaded.
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
        // Analytics play is emitted by startLevel(), after a valid stage is loaded.
        this.startLevel(course[0]);
        this.showToast(this.t('dailyStartToast'));
    }

    startLevel(ref) {
        resetEmbeddedScoreResult(this.resultSession, this.el);
        this.scoreRunId++;
        const spec = (ref && typeof ref === 'object') ? ref : LEVELS[clamp(ref, 0, LEVELS.length - 1)];
        const idx = LEVELS.indexOf(spec);
        this.levelIdx = idx >= 0 ? idx : 0;
        this.spec = spec;
        this.recipe = emptyRecipe();
        this.throws = 0;
        this.refills = 0;
        this.diff = [];
        this.state = 'playing'; this.contextualRestart?.sync();
        track('flame-verse', 'play');
        this.isPaused = false; this.contextualRestart?.sync();
        this.pauseOwnership?.invalidate();
        this.lastFrame = 0;
        this.hide(this.el['start']);
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.syncActionVisibility();
        this.updateHud();
        this.showToast(this.t(this.spec.tipKey || 'tipSalt'), 4.5);
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
        resetEmbeddedScoreResult(this.resultSession, this.el);
        this.pauseOwnership?.invalidate();
        this.state = 'menu'; this.contextualRestart?.sync();
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
            this.labConsole.sync();
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
        if (this.state !== 'playing') return;
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
        track('flame-verse', 'finish');
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
        this.state = 'won-level'; this.contextualRestart?.sync();
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
        if (!this.daily || this.state === 'won-daily') return;
        this.state = 'won-daily'; this.contextualRestart?.sync();
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
        return this.resultSession.publish({
            runId: this.scoreRunId,
            date: this.mode === 'daily' ? this.daily?.key : null,
            game, name: ensurePlayerName(), score,
        });
    }

    renderScoreResult(result = this.resultSession.getState()) {
        renderEmbeddedScoreResult({
            result, el: this.el,
            text: key => this.t(key),
            renderBoard: rows => this.renderBoard(rows),
            readLocalBoard: game => this.readLocalBoard(game),
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
            const empty = document.createElement('div');
            empty.className = 'fv-lb-empty game-lb-empty';
            empty.textContent = this.t('noScores');
            list.appendChild(empty);
            return;
        }
        rows.slice(0, 10).forEach((row, i) => {
            const li = document.createElement('li');
            li.className = 'fv-lb-row game-lb-row';
            if (i < 3) li.classList.add(`fv-lb-top${i + 1}`);
            const rank = document.createElement('span');
            rank.className = 'fv-lb-rank game-lb-rank';
            rank.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'fv-lb-name game-lb-name';
            nm.textContent = row.name || '—';
            const sc = document.createElement('span');
            sc.className = 'fv-lb-score game-lb-score';
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
            FLAME_VERSE_STORAGE.set(FLAME_VERSE_STORAGE_SLOTS.PROGRESS, this.progress);
        } catch (e) { /* 忽略 */ }
    }

    /* ---------------------- HUD / Toast ---------------------- */

    updateHud() {
        this.labConsole?.sync();
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

    showToast(text, seconds = 3.2) {
        const el = this.el['toast'];
        if (!el) return;
        el.textContent = text;
        // 初始态带 `hidden`（game-hidden-contract 下是 display:none !important），
        // 只加 is-on 不摘它，提示永远不可见 —— 开局玩法提示曾因此整批失踪。
        el.classList.remove('hidden');
        el.classList.add('is-on');
        this.toastTimer = seconds;
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
            if (!shouldHandleGameShortcut(e, document.getElementById('fv-lab'))) return;
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
                if (this.state === 'playing' && !this.isPaused && !e.repeat) {
                    e.preventDefault();
                    this.contextualRestart?.requestRestart();
                }
            } else if (e.key === 'Escape') {
                if (this.state === 'playing' && !this.isPaused) this.toMenu();
            }
        });

    }

    bindUI() {
        window.addEventListener('online', () => {
            if (this.resultSession.getState()) void this.resultSession.refresh();
            else void retryScoreResults();
        });
        window.addEventListener('site-settings:changed', () => {
            this.lang = getLang();
            this.applyLanguage();
        });
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('game-frame:changed', () => this.resize());
    }

    /* ---------------------- 暂停适配（抽屉契约） ---------------------- */

    pauseQuiet() { this.isPaused = true; this.contextualRestart?.sync(); this.labConsole.sync(); }
    resumeQuiet() { if (this.pauseOwnership?.isHeld()) return; this.lastFrame = 0; this.isPaused = false; this.contextualRestart?.sync(); this.labConsole.sync(); }
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
            return;
        }
        this.drawFlame(ctx, this.recipe);
        this.drawBarcode(ctx, TARGET, this.spec.recipe, this.t('targetBar'));
        this.drawBarcode(ctx, MINE, this.recipe, this.t('mineBar'));
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
        ctx.fillStyle = '#141b1f';
        ctx.fill();
        ctx.strokeStyle = 'rgba(226,180,111,0.30)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        const cx = box.x + box.w / 2;
        const baseY = box.y + box.h - 30;
        const total = costOf(recipe);
        const flameH = 46 + Math.min(total, 12) * 11 + this.flamePulse * 10;

        // Metal burner: rim, mesh and a small calibration notch.
        ctx.fillStyle = '#3a4547';
        ctx.fillRect(cx - 30, baseY + 1, 60, 13);
        ctx.fillStyle = '#758080';
        ctx.fillRect(cx - 22, baseY - 5, 44, 7);
        ctx.fillStyle = '#1d292d';
        ctx.fillRect(cx - 17, baseY - 3, 34, 3);
        ctx.strokeStyle = 'rgba(229,239,233,0.42)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 30.5, baseY + 1.5, 61, 12);
        for (let x = cx - 13; x <= cx + 13; x += 6) {
            ctx.beginPath(); ctx.moveTo(x, baseY + 4); ctx.lineTo(x, baseY + 11); ctx.stroke();
        }

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';

        // 本生灯底焰：永远是淡蓝（没投盐时也只有它）
        const blue = ctx.createRadialGradient(cx, baseY - 14, 2, cx, baseY - 14, 42);
        blue.addColorStop(0, 'rgba(141,198,201,0.36)');
        blue.addColorStop(0.55, 'rgba(74,132,142,0.16)');
        blue.addColorStop(1, 'rgba(40,70,90,0)');
        ctx.fillStyle = blue;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 16, 30, 42, 0, 0, Math.PI * 2);
        ctx.fill();

        // A layered silhouette gives the flame a natural outline; the moving
        // particles are only the spectral material inside it.
        const sway = Math.sin(this.time * 2.1) * 5;
        const flamePath = (scale, fill) => {
            ctx.beginPath();
            ctx.moveTo(cx, baseY - 6);
            ctx.bezierCurveTo(cx - 23 * scale, baseY - 20 * scale, cx - 16 * scale + sway, baseY - flameH * 0.58, cx - 5 * scale + sway, baseY - flameH);
            ctx.bezierCurveTo(cx + 3 * scale, baseY - flameH * 0.78, cx + 22 * scale - sway, baseY - flameH * 0.58, cx + 7 * scale, baseY - 8);
            ctx.bezierCurveTo(cx + 5 * scale, baseY - 15, cx - 4 * scale, baseY - 17, cx, baseY - 6);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
        };
        // 轮廓跟随投进去的盐（与焰心同一个 blendColor）：铜焰是绿的、钾焰偏紫，
        // 不能一律画成钠黄 —— 焰色反应本身就是这个游戏的现象。内层向白提亮，像真实火焰的亮芯。
        const tint = total ? blendColor(recipe).match(/\d+/g).map(Number) : null;
        flamePath(1, tint ? `rgba(${tint.join(',')},0.62)` : 'rgba(94,157,173,0.52)');
        flamePath(0.58, tint
            ? `rgba(${tint.map((c) => Math.round(c + (255 - c) * 0.45)).join(',')},0.8)`
            : 'rgba(190,235,226,0.72)');

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
                ctx.globalAlpha = a * 0.72;
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
        ctx.globalAlpha = total ? 0.18 : 0.08;
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - flameH * 0.34, flameH * 0.3, flameH * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 标题：这一炉总共投了几把
        ctx.font = `${Math.max(12, 11 * W / (this.canvas.clientWidth || W))}px ui-sans-serif, system-ui, sans-serif`;
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
        ctx.fillStyle = '#111b20';
        ctx.fill();
        ctx.strokeStyle = 'rgba(226,180,111,0.26)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        const scale = Math.min(1, (this.canvas.clientWidth || W) / W);
        ctx.font = `${12 / scale}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = DIM;
        ctx.fillText(title, box.x + 10, box.y + 5 / scale);

        const linesTop = box.y + 23 / scale;
        const linesH = Math.max(4, box.h - 43 / scale);
        const axisY = box.y + box.h - 8 / scale;

        // 谱线：软边竖带（sigma 故意偏大 —— 邻近线会糊在一起，逼玩家看谱线组）。
        // ⚠️ 这是难度设计，不是画风：细锐线能把 Li 670.8 / Sr 674.0 的主线直接分开，
        //    「靠旁边的次级线分辨」这条玩法就失效了。发射谱线相互叠加，所以用 lighter。
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
                g.addColorStop(0.5, `rgba(255,246,223,${(peak * 0.6).toFixed(3)})`);
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
        const ag = ctx.createLinearGradient(box.x, 0, box.x + box.w, 0);
        for (let nm = WL[0]; nm <= WL[1]; nm += 15) {
            ag.addColorStop((nm - WL[0]) / (WL[1] - WL[0]), wlColor(nm));
        }
        ctx.fillStyle = ag;
        ctx.fillRect(box.x, axisY, box.w, 4 / scale);

        ctx.font = `${11 / scale}px ui-monospace, SFMono-Regular, Consolas, monospace`;
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(214,229,226,0.66)';
        for (const nm of [400, 450, 500, 550, 600, 650, 700]) {
            const x = wlX(nm, box);
            ctx.strokeStyle = 'rgba(214,229,226,0.38)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, axisY + 5); ctx.lineTo(x, axisY + 9); ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.fillText('400', box.x, axisY - 2 / scale);
        ctx.textAlign = 'center';
        ctx.fillText('550', box.x + box.w / 2, axisY - 2 / scale);
        ctx.textAlign = 'right';
        ctx.fillText('700nm', box.x + box.w, axisY - 2 / scale);
        ctx.textAlign = 'left';
    }

}
