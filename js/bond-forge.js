/**
 * Bond Forge 键合工坊 — 分子搭建化学解谜
 * =========================================
 * 玩法：从底部**原子盘**拖出原子，拖到另一个原子的「价键热区」附近自动成键；
 * 拖拽成键前会校验价键容量（`usedBonds < maxBonds`）与几何角（VSEPR）；
 * 合法 → 键线由虚线变为实线 + 电子云脉冲 + 谐和音程；
 * 非法 → 弹回原位 + 红色抖动 + 给出**规则本身**（「O 只能接 2 根键」），绝不扣分。
 * 全部原子的价键都填满且无悬挂价键 → 通关。
 *
 * 化学内核（元素表 / 分子白名单 / 规范化判定 / 最优解）在
 * js/bond-forge-molecules.js，关卡数据在 js/bond-forge-levels.js
 * —— 两者都是**纯模块**，校验器 scripts/verify-bond-forge-levels.mjs 共用。
 *
 * 教育底线（docs/proposal-bond-forge.md §2.6 反馈诚实原则）：
 *   合法但不是本题目标 → 先肯定它的正确性、说出它的名字、再说「不是本题要的」；
 *   超价 → 给规则，不嘲讽；角度差 → 并排画出理想角（如 104.5°）；
 *   无解 → 绝不说「不可能」，只说「换个位置试试」。
 *   绝不做：扣分、倒计时压迫、严厉失败音、讽刺文案。
 *
 * 共享层（2026-09 契约）：game-frame / game-drawer / game-chrome /
 * leaderboard / daily / i18n / safe-storage / analytics / game-sfx / boot。
 */

import { ensurePlayerName, setPlayerName } from './player.js';
import { getLang, setLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { renderMoreGames } from './more-games.js';
import { createStatsDrawer } from './game-drawer.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { storageGet, storageSet } from './safe-storage.js';
import { track } from './analytics.js';
import { todayKey, todayKeyDisplay, dailyKey, hashStringFNV, mulberry32 } from './daily.js';
import { submitScore, fetchBoard } from './leaderboard.js';
import { makeText } from './i18n.js';
import { onReady } from './boot.js';
import { createSfxEngine } from './game-sfx.js';
import {
    LEVELS, LEVEL_COUNT, DAILY_POOL, SANDBOX_MOLECULES, levelById,
    dailyPicks, DAILY_SEED_PREFIX,
} from './bond-forge-levels.js';
import {
    MOLECULES, ELEMENTS, STAGE as MOL_STAGE, TRAY, BOND,
    canonicalize, bondSignature, identify, findByComposition,
    solveBest, validateLevelSpec, isTarget,
    allowsBonds, usedBonds, bondCount, bondAngle, idealAngleFor,
    maxBondsOf, lonePairsOf, isIonic, bondLength,
} from './bond-forge-molecules.js';

/* ────────────────────────── 常量 ────────────────────────── */

/** 逻辑画幅。M1 起改为从 js/bond-forge-molecules.js 的 STAGE 导入，
 *  这里先内联同值，保证 M0 骨架可独立运行、bindFrame 的 logicalWidth 正确。 */
const STAGE = { w: 520, h: 680 };
const W = STAGE.w;
const H = STAGE.h;

const PROGRESS_KEY = 'bf_progress';
const DAILY_KEY_PREFIX = 'bf_daily_';

// 关卡表（20 关）来自 js/bond-forge-levels.js —— 与 tower-levels / circuit-levels
// 同构：数据在独立模块，本文件只管渲染与交互。
//
// ⚠️ 这里**不要**再留一个字面量数组兜底。M0 阶段曾是 `const LEVELS = []`，
//    结果 verify-stats-drawer 的 startLevel() 静默空转、抽屉的
//    「开局后游戏在跑」基线断言直接红 —— 而红色信息是 "via=startLevel"，
//    看不出真正原因是"关卡表是空的"。数据只能有一个来源。
const DAILY_COUNT = 5;

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function vibrate(pattern) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* 不支持则忽略 */ }
}

/* ────────────────────────── 音效 ──────────────────────────
 * 化学语义化的谐和音程（提案 §4）：
 *   单键 = 纯五度（3:2）、双键 = 大三度（5:4）、三键 = 小三度（6:5）。
 * 非法键 = 短促的**木质闷响**（noise + 低通），绝不刺耳。
 * 成功 = 水晶铃（freqs 上行 + delay 琶音）。
 * ⚠️ 音高表是页面自有内容，不进 i18n（与各页一致）。 */
const Sfx = createSfxEngine({ masterGain: 0.5 });

function sfxTone(freq, dur, type, vol) {
    Sfx.tone({ freq, type: type || 'sine', dur: dur || 0.16, vol: vol || 0.16 });
}

/* ────────────────────────── i18n ──────────────────────────
 * ⚠️ 不要在此表里重复全站公共键（sound / language / moreGames / close /
 *    copied / usernameLabel）—— 它们由 makeText 经 COMMON_TEXT 原型链兜底，
 *    重复写出会被 scripts/verify-i18n.mjs 判为「字面量重复」硬失败。 */

const LANGUAGES = makeText({
    en: {
        stats: 'Stats',
        title: 'Bond Forge',
        subtitle: 'Drag · Snap · Forge',
        howto: 'Drag atoms out of the tray and bring them close — when two valence shells line up, a bond snaps into place. Fill every valence and forge the target formula. Stuck on a wrong molecule? It is still real chemistry; just build the one on the card.',
        playLevels: 'Levels',
        playDaily: 'Daily',
        playSandbox: 'Sandbox',
        level: 'Level',
        daily: 'Daily',
        sandbox: 'Sandbox',
        levelSelect: 'Select level',
        drags: 'Drags',
        dragsWord: 'drags',
        par: 'Par',
        dailyStartToast: 'Daily challenge — 5 molecules · fewest drags wins',
        retry: 'Retry',
        next: 'Next',
        menu: 'Home',
        again: 'Again',
        levelCleared: 'Molecule forged!',
        levelDone: 'All molecules forged!',
        dailyDone: 'Daily complete!',
        bestToday: 'Your best today',
        stars: 'Stars',
        leaderboard: 'Global · Today\'s Challenge',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        resetTitle: 'Restart level',
        home: 'Home',
        hint: 'Drag atoms from the tray · snap them into bonds · fill every valence',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
        sideCheat: 'Element cheat sheet',
        cheatSymbol: 'Sym',
        cheatName: 'Element',
        cheatValence: 'Bonds',
        clearNote: 'Fewer drags, more stars.',
        wrongMolecule: 'Real chemistry — just not this level\'s target',
        toastOverValence: '{sym} can only take {n} bond(s)',
        toastAngle: 'Try to spread the bonds out — {deg}° is the ideal angle',
        toastNoSolution: 'That will not close up — try another position',
        toastBonded: 'Bond formed',
        toastWrongTarget: 'True molecule, wrong target',
        toastLevelDone: 'Every valence is satisfied',
    },
    zh: {
        stats: '数据统计',
        title: '键合工坊',
        subtitle: '拖动 · 吸附 · 成键',
        howto: '从底部原子盘拖出原子，靠近另一个原子——当两个价键壳层对齐时，键会自动吸附成键。把所有价键填满、拼出卡片上的目标分子即可通关。拼错了也别慌：那仍是真实存在的分子，只要拼出卡片要的那个就好。',
        playLevels: '关卡模式',
        playDaily: '每日挑战',
        playSandbox: '自由搭建',
        level: '关卡',
        daily: '每日',
        sandbox: '自由搭建',
        levelSelect: '选择关卡',
        drags: '拖拽',
        dragsWord: '次拖拽',
        par: '目标',
        dailyStartToast: '每日挑战——5 个分子 · 拖拽次数越少越好',
        retry: '重试',
        next: '下一关',
        menu: '返回主页',
        again: '再来一次',
        levelCleared: '分子成型！',
        levelDone: '全部分子都已成型！',
        dailyDone: '每日挑战完成！',
        bestToday: '今日最好成绩',
        stars: '星星',
        leaderboard: '全球榜 · 今日挑战',
        noScores: '暂无成绩',
        lbOffline: '榜单离线',
        copyResult: '复制',
        resetTitle: '重开本关',
        home: '主页',
        hint: '从原子盘拖出原子 · 靠近即成键 · 填满所有价键',
        sideHowTo: '玩法说明',
        sideRecords: '战绩',
        sideCheat: '元素小抄',
        cheatSymbol: '符号',
        cheatName: '元素',
        cheatValence: '键数',
        clearNote: '拖拽次数越少，星星越多。',
        wrongMolecule: '这也是真实分子——只是不是本题要的',
        toastOverValence: '{sym} 只能接 {n} 根键',
        toastAngle: '试着把键角打开一些——理想角约 {deg}°',
        toastNoSolution: '这样接不太合适——换个位置试试',
        toastBonded: '成键',
        toastWrongTarget: '真实分子，但不是本题目标',
        toastLevelDone: '所有价键都填满了',
    },
});

/* ────────────────────────── 元素小抄数据 ──────────────────────────
 * M1 起由 js/bond-forge-molecules.js 的 ELEMENTS 驱动；
 * M0 先留空表，保证 renderCheatSheet() 走空态而不是崩溃。 */
const CHEAT_ROWS = [];

/* ────────────────────────── 游戏主体 ────────────────────────── */

class BondForgeGame {
    constructor() {
        this.el = {};
        this.lang = getLang();
        this.canvas = document.getElementById('bf-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

        /** 状态机：'menu' | 'playing' | 'paused' | 'clear' | 'over' */
        this.state = 'menu';
        this.isPaused = false;

        this.mode = 'levels';           // 'levels' | 'daily' | 'sandbox'
        this.levelIndex = 0;
        this.drags = 0;
        this.par = 0;
        this.level = null;

        this.cheatOpen = true;

        this.progress = this.loadProgress();
        this.dailyCourse = [];
        this.dailyIndex = 0;

        this.time = 0;
        this.lastFrame = 0;
        this.rafId = 0;

        this.bindElements();
        this.initUI();
        this.applyLanguage();

        // 全站语言 / 静音设置变化（js/site-settings.js 的 setLang/setMuted 派发）→ 本页重刷。
        // ⚠️ 缺这一行 = 点顶栏语言钮只写 localStorage、界面纹丝不动
        // （verify-chrome §④ 断「切语言后页脚提示与 document.title 都变了」）。
        // 注意要从 getLang() 重新取值，不要沿用 this.lang —— setLang 才是真源。
        window.addEventListener('site-settings:changed', () => {
            this.lang = getLang();
            this.applyLanguage();
        });

        this.resize();
        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);
    }

    /* ---------------------- 文案访问 ---------------------- */

    t(key) {
        const table = LANGUAGES[this.lang] || LANGUAGES.en;
        return table[key] != null ? table[key] : (LANGUAGES.en[key] != null ? LANGUAGES.en[key] : key);
    }

    /** 模板插值：`{sym}` / `{n}` / `{deg}` → params */
    tf(key, params) {
        let s = this.t(key);
        Object.keys(params || {}).forEach(k => {
            s = s.split('{' + k + '}').join(String(params[k]));
        });
        return s;
    }

    /**
     * 给共享层（bindChrome / createStatsDrawer）用的**整表**取用器。
     *
     * ⚠️ 共享层的 `getText` 契约是 `() => object`（返回当前语言的文案对象），
     * 不是 `(key) => string`。传成 `(k) => this.t(k)` 时共享层内部的 `getText()`
     * 会拿到 `t(undefined)` = `undefined`，`|| {}` 之后整表为空，
     * 所有共享文案（抽屉的 stats / close、顶栏的 sound / moreGames / language）
     * 一律静默退回内置英文兜底 —— 不报任何错，几何断言全绿。
     *
     * 这里返回表本体（LANGUAGES 已由 makeText 挂上 COMMON_TEXT 原型链，
     * close / moreGames / sound / language 这些公共键会自动兜底）。
     */
    textTable() {
        return LANGUAGES[this.lang] || LANGUAGES.en;
    }

    /* ---------------------- DOM 绑定 ---------------------- */

    bindElements() {
        const ids = [
            'title', 'subtitle', 'howto', 'level-label', 'level-grid', 'daily-best',
            'hud-level', 'drags', 'par', 'toast', 'hint',
            'start', 'clear', 'over',
            'clear-stars', 'clear-line', 'clear-note',
            'over-title', 'over-score', 'over-sub',
            'lb-title', 'lb-list', 'lb-status', 'username', 'username-label',
            'side-howto-title', 'side-howto', 'side-records-title', 'side-records',
            'cheat-title', 'cheat-body', 'cheat-toggle',
            'btn-levels', 'btn-daily', 'btn-sandbox',
            'btn-next', 'btn-replay', 'btn-menu1', 'btn-copy', 'btn-menu2', 'btn-again',
            'reset-btn', 'mute-btn', 'start-mute', 'start-lang',
        ];
        ids.forEach(id => {
            this.el[id] = document.getElementById('bf-' + id);
        });
    }

    /* ---------------------- UI 初始化 ---------------------- */

    initUI() {
        const el = this.el;

        // 开始菜单：模式瓦片
        if (el['btn-levels']) {
            el['btn-levels'].innerHTML = `${ICONS.play}<span class="bf-btn-text">${this.t('playLevels')}</span>`;
            el['btn-levels'].addEventListener('click', () => { sfxTone(660, 0.09, 'triangle', 0.12); this.startLevels(); });
        }
        if (el['btn-daily']) {
            el['btn-daily'].innerHTML = `${ICONS.calendar}<span class="bf-btn-text">${this.t('playDaily')}</span>`;
            el['btn-daily'].addEventListener('click', () => { sfxTone(660, 0.09, 'triangle', 0.12); this.startDaily(); });
        }
        if (el['btn-sandbox']) {
            el['btn-sandbox'].innerHTML = `${ICONS.dice}<span class="bf-btn-text">${this.t('playSandbox')}</span>`;
            el['btn-sandbox'].addEventListener('click', () => { sfxTone(660, 0.09, 'triangle', 0.12); this.startSandbox(); });
        }

        // 结算面板
        if (el['btn-next']) {
            el['btn-next'].innerHTML = `${ICONS.arrowRight}<span class="bf-btn-text">${this.t('next')}</span>`;
            el['btn-next'].addEventListener('click', () => { sfxTone(660, 0.09, 'triangle', 0.12); this.nextLevel(); });
        }
        if (el['btn-replay']) {
            // ⚠️ 图标键名必须真实存在于 js/icons.js：`retry`（不是 refresh）。
            // 写错键名 → innerHTML 里塞进字面量 "undefined" → 按钮变「裸文本无图标」，
            // verify-button-icons 报 svg=0，而几何/点击断言全绿。
            el['btn-replay'].innerHTML = `${ICONS.retry}<span class="bf-btn-text">${this.t('retry')}</span>`;
            el['btn-replay'].addEventListener('click', () => { sfxTone(660, 0.09, 'triangle', 0.12); this.restartLevel(); });
        }
        if (el['btn-menu1']) {
            el['btn-menu1'].innerHTML = `${ICONS.home}<span class="bf-btn-text">${this.t('menu')}</span>`;
            el['btn-menu1'].addEventListener('click', () => { sfxTone(620, 0.09, 'triangle', 0.12); this.toMenu(); });
        }
        if (el['btn-again']) {
            el['btn-again'].innerHTML = `${ICONS.retry}<span class="bf-btn-text">${this.t('again')}</span>`;
            el['btn-again'].addEventListener('click', () => { sfxTone(660, 0.09, 'triangle', 0.12); this.restartLevel(); });
        }
        if (el['btn-copy']) {
            el['btn-copy'].innerHTML = `${ICONS.copy}<span class="bf-btn-text">${this.t('copyResult')}</span>`;
            el['btn-copy'].addEventListener('click', () => this.copyResult());
        }
        if (el['btn-menu2']) {
            el['btn-menu2'].innerHTML = `${ICONS.home}<span class="bf-btn-text">${this.t('menu')}</span>`;
            el['btn-menu2'].addEventListener('click', () => { sfxTone(620, 0.09, 'triangle', 0.12); this.toMenu(); });
        }
        if (el['reset-btn']) {
            el['reset-btn'].innerHTML = ICONS.retry;
            el['reset-btn'].addEventListener('click', () => { sfxTone(660, 0.09, 'triangle', 0.12); this.restartLevel(); });
        }

        // 静音钮：⚠️ 键名是 soundOn / soundOff（js/icons.js），不是 volumeOn/volumeOff
        if (el['mute-btn']) {
            el['mute-btn'].innerHTML = getMuted() ? ICONS.soundOff : ICONS.soundOn;
            el['mute-btn'].addEventListener('click', () => {
                const next = !getMuted();
                setMuted(next);
                el['mute-btn'].innerHTML = next ? ICONS.soundOff : ICONS.soundOn;
                if (!next) sfxTone(700, 0.1, 'triangle', 0.14);
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

        // ⚠️ 顶栏语言钮**不在这里挂 handler**：点击归 js/game-chrome.js（owns 含 'lang'）。
        // 页面再挂一个 = 一次点击切两次 = 净效果为零（site_lang 写回原值、文案看起来没变）。
        // 开始覆盖层里的语言钮**没有** data-chrome="lang"，点击必须由本页接管。
        if (el['start-lang']) {
            el['start-lang'].addEventListener('click', () => {
                this.setLang(this.lang === 'zh' ? 'en' : 'zh');
                sfxTone(700, 0.1, 'triangle', 0.12);
            });
        }

        // 元素小抄：折叠开关
        if (el['cheat-toggle'] && el['cheat-body']) {
            el['cheat-toggle'].addEventListener('click', () => {
                this.cheatOpen = !this.cheatOpen;
                el['cheat-toggle'].setAttribute('aria-expanded', this.cheatOpen ? 'true' : 'false');
                el['cheat-body'].hidden = !this.cheatOpen;
                sfxTone(560, 0.07, 'triangle', 0.1);
            });
            el['cheat-toggle'].setAttribute('aria-expanded', 'true');
            el['cheat-body'].hidden = false;
        }

        // 每日榜用户名
        if (el['username']) {
            el['username'].value = ensurePlayerName();
            el['username'].addEventListener('change', () => {
                setPlayerName(el['username'].value.trim() || ensurePlayerName());
            });
        }

        this.renderLevelGrid();
        this.renderCheatSheet();
        this.renderSideRecords();
        this.updateHud();
    }

    setLang(lang) {
        this.lang = lang;
        setLang(lang);
        this.applyLanguage();
    }

    applyLanguage() {
        const el = this.el;
        const setText = (key, text) => { if (el[key]) el[key].textContent = text; };

        // ⚠️ 页面标题必须在这里重写：chrome 校验器会切语言后断言 document.title 变化，
        // 只刷 DOM 文案不换标题 = 「界面没跟着刷新」硬失败（同 lumen/circuit 口径）。
        document.title = this.lang === 'zh'
            ? '键合工坊 — 分子搭建化学解谜'
            : 'Bond Forge — Molecule Building Puzzle';

        setText('title', this.t('title'));
        setText('subtitle', this.t('subtitle'));
        setText('howto', this.t('howto'));
        setText('level-label', this.t('levelSelect'));
        setText('side-howto-title', this.t('sideHowTo'));
        setText('side-howto', this.t('howto'));
        setText('side-records-title', this.t('sideRecords'));
        setText('cheat-title', this.t('sideCheat'));
        setText('hint', this.t('hint'));
        setText('lb-title', this.t('leaderboard'));
        setText('clear-note', this.t('clearNote'));
        setText('over-title', this.t('dailyDone'));
        if (el['username-label']) el['username-label'].textContent = this.t('usernameLabel');

        // 带图标按钮：span 内文字单独更新（不重建 SVG）
        const setBtnText = (key, text) => {
            if (!el[key]) return;
            const span = el[key].querySelector('.bf-btn-text');
            if (span) span.textContent = text;
            else el[key].textContent = text;
        };
        setBtnText('btn-levels', this.t('playLevels'));
        setBtnText('btn-daily', this.t('playDaily'));
        setBtnText('btn-sandbox', this.t('playSandbox'));
        setBtnText('btn-next', this.t('next'));
        setBtnText('btn-replay', this.t('retry'));
        setBtnText('btn-menu1', this.t('menu'));
        setBtnText('btn-again', this.t('again'));
        setBtnText('btn-copy', this.t('copyResult'));
        setBtnText('btn-menu2', this.t('menu'));

        if (el['reset-btn']) el['reset-btn'].title = this.t('resetTitle');
        if (el['drags']) el['drags'].title = this.t('drags');
        // 开始覆盖层的语言钮走文字（显示「切换目标语言的自称」）。
        // 顶栏那个 [data-chrome="lang"] 由 chrome 的 renderLang() 自己写，这里不要碰。
        if (el['start-lang']) el['start-lang'].textContent = this.t('language');

        this.renderLevelGrid();
        this.renderCheatSheet();
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
            // ⚠️ 类名必须与 css/bond-forge.css 的 .bf-chip / .is-done 完全一致；
            // 不一致 = 样式整块失效 → 文字继承深色 → fg-audit 报「纯黑 N 处」。
            btn.className = 'bf-chip' + (p.stars > 0 ? ' is-done' : '');
            btn.dataset.level = String(i);
            const num = document.createElement('span');
            num.className = 'bf-chip-num';
            num.textContent = String(i + 1);
            const stars = document.createElement('span');
            stars.className = 'bf-chip-stars';
            stars.textContent = p.stars > 0 ? '★'.repeat(p.stars) : '\u00a0';
            btn.appendChild(num);
            btn.appendChild(stars);
            btn.addEventListener('click', () => {
                sfxTone(660, 0.09, 'triangle', 0.12);
                this.startLevel(i);
            });
            grid.appendChild(btn);
        });
    }

    /** 元素小抄：桌面侧栏的参考卡（M1 起由 ELEMENTS 驱动） */
    renderCheatSheet() {
        const body = this.el['cheat-body'];
        if (!body) return;
        body.innerHTML = '';
        CHEAT_ROWS.forEach(row => {
            const div = document.createElement('div');
            div.className = 'bf-cheat-row';
            const sym = document.createElement('span');
            sym.className = 'bf-cheat-sym';
            sym.textContent = row.sym;
            const name = document.createElement('span');
            name.className = 'bf-cheat-name';
            name.textContent = this.lang === 'zh' ? row.zh : row.en;
            const val = document.createElement('span');
            val.className = 'bf-cheat-val';
            val.textContent = row.bonds;
            div.appendChild(sym);
            div.appendChild(name);
            div.appendChild(val);
            body.appendChild(div);
        });
    }

    /* ---------------------- 战绩侧栏 ---------------------- */

    renderSideRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        box.innerHTML = '';
        const rows = [
            [this.t('level'), LEVELS.length ? `${Math.min(this.levelIndex + 1, LEVELS.length)} / ${LEVELS.length}` : '—'],
            [this.t('drags'), String(this.drags)],
            [this.t('stars'), String(this.totalStars())],
        ];
        rows.forEach(([k, v]) => {
            const div = document.createElement('div');
            div.className = 'bf-side-row game-side-row';
            const label = document.createElement('span');
            label.textContent = k;
            const value = document.createElement('b');
            value.textContent = v;
            div.appendChild(label);
            div.appendChild(value);
            box.appendChild(div);
        });
    }

    totalStars() {
        return Object.values(this.progress).reduce((sum, p) => sum + (p.stars || 0), 0);
    }

    updateHud() {
        const el = this.el;
        if (el['hud-level']) {
            el['hud-level'].textContent = LEVELS.length
                ? `${this.t('level')} ${Math.min(this.levelIndex + 1, LEVELS.length)}/${LEVELS.length}`
                : `${this.t('level')} 0/0`;
        }
        if (el['drags']) el['drags'].textContent = String(this.drags);
        if (el['par']) el['par'].textContent = `· ${this.t('par')} ${this.par}`;
    }

    /* ---------------------- 进度存储 ---------------------- */

    loadProgress() {
        try {
            const raw = storageGet(PROGRESS_KEY);
            const obj = raw ? JSON.parse(raw) : {};
            return obj && typeof obj === 'object' ? obj : {};
        } catch (e) {
            return {};
        }
    }

    saveProgress() {
        try {
            storageSet(PROGRESS_KEY, JSON.stringify(this.progress));
        } catch (e) {
            // 存储不可用时静默降级
        }
    }

    /* ---------------------- 模式入口 ---------------------- */

    startLevels() {
        this.mode = 'levels';
        this.startLevel(this.firstUncleared());
    }

    firstUncleared() {
        for (let i = 0; i < LEVELS.length; i++) {
            const p = this.progress[LEVELS[i].id];
            if (!p || !p.stars) return i;
        }
        return 0;
    }

    startDaily() {
        this.mode = 'daily';
        this.dailyCourse = this.buildDailyCourse();
        this.dailyIndex = 0;
        if (!this.dailyCourse.length) {
            this.toast(this.t('dailyStartToast'));
            return;
        }
        this.startLevel(this.dailyCourse[0]);
    }

    /**
     * 今日赛程：从 DAILY_POOL 里确定性地抽 5 关。
     *
     * ⚠️ 种子口径必须与 scripts/verify-bond-forge-levels.mjs 的断言一致：
     *    `mulberry32(hashStringFNV('bond-forge:' + todayKey()))`
     *    —— 改前缀或换哈希会让「今天已发布的赛程」在玩家之间不一致。
     *    （用 todayKey() 而不是 Date.now()：同一天内反复进入必须拿到同一套题。）
     */
    buildDailyCourse() {
        const rng = mulberry32(hashStringFNV(DAILY_SEED_PREFIX + todayKey()));
        const ids = dailyPicks(rng, DAILY_POOL, DAILY_COUNT);
        return ids.map(levelById).filter(Boolean);
    }

    startSandbox() {
        this.mode = 'sandbox';
        this.level = null;
        this.drags = 0;
        this.par = 0;
        this.hideOverlays();
        this.state = 'playing';
        this.updateHud();
    }

    /**
     * 开始一关。ref 可以是关卡下标（number）或**关卡对象**本身
     * （每日赛程传的就是对象 —— 与 silk-dew 同口径）。
     */
    startLevel(ref) {
        if (!LEVELS.length) {
            this.toast(this.t('levelSelect'));
            return;
        }
        let index = 0;
        if (typeof ref === 'number') {
            index = clamp(ref, 0, LEVELS.length - 1);
            this.levelIndex = index;
        } else if (ref && typeof ref === 'object') {
            const found = LEVELS.findIndex(l => l.id === ref.id);
            index = found >= 0 ? found : 0;
            this.levelIndex = index;
        }
        this.level = LEVELS[index];
        this.drags = 0;
        this.par = this.level.par || 0;
        this.overValenceHits = 0;
        this.usedUndo = false;
        this.usedCatalyst = false;
        this.hideOverlays();
        this.state = 'playing';
        this.isPaused = false;
        this.updateHud();
        this.renderSideRecords();
        track('bond-forge', this.mode === 'daily' ? 'daily_start' : 'level_start');
    }

    restartLevel() {
        if (this.mode === 'daily' && this.dailyCourse.length) {
            this.startLevel(this.dailyCourse[this.dailyIndex]);
        } else {
            this.startLevel(this.levelIndex);
        }
    }

    nextLevel() {
        if (this.mode === 'daily') {
            this.dailyIndex += 1;
            if (this.dailyIndex >= this.dailyCourse.length) {
                this.finishDaily();
                return;
            }
            this.startLevel(this.dailyCourse[this.dailyIndex]);
            return;
        }
        if (this.levelIndex + 1 >= LEVELS.length) {
            this.toast(this.t('levelDone'));
            this.toMenu();
            return;
        }
        this.startLevel(this.levelIndex + 1);
    }

    toMenu() {
        this.state = 'menu';
        this.isPaused = false;
        this.level = null;
        this.hideOverlays();
        if (this.el['start']) this.el['start'].classList.remove('hidden');
        this.updateHud();
        this.renderSideRecords();
    }

    hideOverlays() {
        ['start', 'clear', 'over'].forEach(k => {
            if (this.el[k]) this.el[k].classList.add('hidden');
        });
    }

    finishDaily() {
        this.state = 'over';
        if (this.el['over']) this.el['over'].classList.remove('hidden');
        this.submitDailyScore();
    }

    /* ---------------------- 结算 ---------------------- */

    /** 按提案 §2.3：三颗星的判据是「没用撤销 / 没用催化剂 / 一次成型」，M2 补全 */
    checkStars(stats) {
        let stars = 1;
        if (!stats.usedUndo) stars += 1;
        if (!stats.usedCatalyst) stars += 1;
        return clamp(stars, 1, 3);
    }

    submitDailyScore() {
        if (this.mode !== 'daily') return;
        const total = this.dailyCourse.length ? this.drags : 0;
        submitScore({
            game: dailyKey(DAILY_KEY_PREFIX, Date.now()),
            name: ensurePlayerName(),
            score: total,
        }).then(ok => {
            if (ok) this.refreshLeaderboard();
            else this.setLbStatus(this.t('lbOffline'));
        }).catch(() => this.setLbStatus(this.t('lbOffline')));
    }

    refreshLeaderboard() {
        const list = this.el['lb-list'];
        if (!list) return;
        fetchBoard(dailyKey(DAILY_KEY_PREFIX, Date.now()))
            .then(rows => {
                list.innerHTML = '';
                if (!Array.isArray(rows) || !rows.length) {
                    this.setLbStatus(this.t('noScores'));
                    return;
                }
                this.setLbStatus('');
                rows.slice(0, 20).forEach((r, i) => {
                    const div = document.createElement('div');
                    div.className = 'bf-lb-row';
                    const rank = document.createElement('span');
                    rank.className = 'bf-lb-rank';
                    rank.textContent = String(i + 1);
                    const name = document.createElement('span');
                    name.className = 'bf-lb-name';
                    name.textContent = r.name;
                    const score = document.createElement('span');
                    score.className = 'bf-lb-score';
                    score.textContent = String(r.score);
                    div.appendChild(rank);
                    div.appendChild(name);
                    div.appendChild(score);
                    list.appendChild(div);
                });
            })
            .catch(() => this.setLbStatus(this.t('lbOffline')));
    }

    setLbStatus(text) {
        if (this.el['lb-status']) this.el['lb-status'].textContent = text;
    }

    copyResult() {
        const text = `${this.t('title')} — ${this.t('drags')} ${this.drags} / ${this.t('par')} ${this.par}`
            + ` (${todayKeyDisplay()})`;
        const done = () => this.toast(this.t('copied'));
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(() => this.toast(text));
                return;
            }
        } catch (e) { /* 落回 toast */ }
        this.toast(text);
    }

    /* ---------------------- 提示条 ---------------------- */

    toast(message, ms) {
        const el = this.el['toast'];
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2200);
    }

    /* ---------------------- 暂停（抽屉适配器） ---------------------- */

    pauseQuiet() { this.isPaused = true; }

    resumeQuiet() { this.lastFrame = 0; this.isPaused = false; }

    isRunning() { return this.state === 'playing' && !this.isPaused; }

    /* ---------------------- 渲染 ---------------------- */

    resize() {
        const canvas = this.canvas;
        if (!canvas) return;
        // ⚠️ 用 clientWidth（整数），不要 getBoundingClientRect().width（亚像素）：
        // 后者会让 canvas.width 出现小数，被取整后可能**小于** CSS 盒宽 → 画面发虚。
        const cssW = canvas.clientWidth || W;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetW = Math.max(1, Math.round(cssW * dpr));
        const targetH = Math.max(1, Math.round(cssW * (H / W) * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }
        const scale = targetW / W;
        this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    loop(ts) {
        this.rafId = requestAnimationFrame(this.loop);
        if (!this.ctx) return;
        if (!this.lastFrame) this.lastFrame = ts;
        const dt = Math.min(ts - this.lastFrame, 100) / 1000;
        this.lastFrame = ts;
        if (!this.isPaused) this.time += dt;
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        if (!ctx) return;

        // 台面：深靛蓝底 + 冷顶光
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#141a38');
        bg.addColorStop(1, '#0a0c1c');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        this.drawBenchGrid(ctx);
        this.drawTopLight(ctx);
    }

    /** 实验台网格 */
    drawBenchGrid(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(120,150,240,0.10)';
        ctx.lineWidth = 1;
        const step = 26;
        ctx.beginPath();
        for (let x = step; x < W; x += step) {
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, H);
        }
        for (let y = step; y < H; y += step) {
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(W, y + 0.5);
        }
        ctx.stroke();
        ctx.restore();
    }

    /** 台面顶部的冷光晕 */
    drawTopLight(ctx) {
        ctx.save();
        const g = ctx.createRadialGradient(W / 2, -70, 20, W / 2, -70, W * 0.95);
        g.addColorStop(0, 'rgba(150,190,255,0.16)');
        g.addColorStop(1, 'rgba(150,190,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H * 0.5);
        ctx.restore();
    }

    destroy() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = 0;
    }
}

/* ────────────────────────── 启动 ────────────────────────── */

onReady(() => {
    window.bfGame = new BondForgeGame();
    bindFrame({ logicalWidth: W });
    const more = document.getElementById('bfSideMore');
    if (more) renderMoreGames(more, { exclude: 'bond-forge.html' });
    window.bfDrawer = createStatsDrawer({
        idPrefix: 'bf',
        getGame: () => window.bfGame,
        onPause: () => window.bfGame && window.bfGame.pauseQuiet(),
        onResume: () => window.bfGame && window.bfGame.resumeQuiet(),
        isBusy: () => !!(window.bfGame && window.bfGame.isRunning()),
        ICONS,
        // ⚠️ 契约是 () => object（整表），不是 (key) => string。见 textTable 的注释。
        getText: () => (window.bfGame ? window.bfGame.textTable() : LANGUAGES.en),
    });
    window.bfDrawer.init();

    // 画布后端缓冲区必须在 CSS 尺寸变化之后重算（bindFrame 每次写入都会派发此事件）
    window.addEventListener('game-frame:changed', () => {
        if (window.bfGame) window.bfGame.resize();
    });
    window.addEventListener('resize', () => {
        if (window.bfGame) window.bfGame.resize();
    });
});

onReady(() => {
    bindChrome({
        self: 'bond-forge.html',
        // ⚠️ 必须含 'more'：页脚「更多游戏」的展开行为归 chrome，owns 里漏掉
        // 就等于按钮是死的（chrome 校验器会报 aria-expanded 未置 true / 列表为空）。
        // sound 不在 owns 里：顶栏静音钮已有自己的 handler（还要同步刷图标）。
        owns: ['lang', 'more'],
        // ⚠️ 同抽屉：共享层要的是整表。返回 (key)=>string 会让顶栏的
        // sound / moreGames / language 永远停在英文兜底。
        getText: () => (window.bfGame ? window.bfGame.textTable() : LANGUAGES.en),
    });
});
