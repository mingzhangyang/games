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
    LEVELS, DAILY_POOL, levelById,
    dailyPicks, DAILY_SEED_PREFIX,
} from './bond-forge-levels.js';
// 只导入**真正用到**的判定原语。M0/M1 早期把 molecules.js 的导出整块搬了进来，
// 其中 12 个（canonicalize/bondSignature/findByComposition/solveBest/
// validateLevelSpec/bondCount/bondAngle/idealAngleFor/lonePairsOf/MOL_STAGE 等）
// 一处都没用到 —— 它们是**关卡数据层与校验器**的职责，不是渲染层的。
// 留着有两个实际代价：eslint 12 条 warning 淹没真警告，以及读代码的人以为
// 「渲染层也参与判定」而去错误的文件里找逻辑。
import {
    MOLECULES, ELEMENTS, TRAY, BOND,
    identify, isTarget,
    allowsBonds, usedBonds,
    maxBondsOf, isIonic, isIonicSelf, bondLength,
} from './bond-forge-molecules.js';

/* ────────────────────────── 常量 ────────────────────────── */

/**
 * 逻辑画幅。与 `bond-forge-molecules.js` 的 `STAGE` **必须同值**
 * （520×680）—— 那边是关卡数据的坐标契约，这边是画布/命中换算的基准。
 *
 * ⚠️ 这里刻意**不**从 molecules.js 导入 STAGE。曾经导入成 `MOL_STAGE` 别名却
 *    一处没用（eslint 挂着 warning），而真正被引用的是本文件这个 `STAGE`。
 *    与其维护两套名字，不如只留一份并写清约束；真值漂移由
 *    `scripts/verify-bond-forge-levels.mjs` 的 §① 形状断言兜住。
 */
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

/**
 * 沙盒自由盘的元素清单（每种给 2 个）。
 *
 * 取元素表的**全部**元素并现算 —— 手写一份迟早和 molecules.js 脱节，
 * 沙盒就会缺某种元素、某些分子根本拼不出来。
 *
 * ⚠️ `ELEMENTS` 是**按符号索引的对象**（`{ H: {...}, C: {...} }`），不是数组，
 *    元素对象上的字段叫 `symbol` 不叫 `sym`；顺带固定成元素表的**书写次序**，
 *    托盘排列才稳定（对象键序对字符串键是插入序，但显式排序更不容易被后续改动破坏）。
 */
const SANDBOX_TRAY = Object.values(ELEMENTS).map(e => e.symbol);

/**
 * 命中测试的外扩量（逻辑像素）。
 *
 * 原子球半径只有 14–26px，最大直径 52px、最小的氢只有 28px —— 手指按不准。
 * 项目规约要求可点目标 ≥44px，所以热区在视觉半径上再加 12px：
 * 氢 14+12=26 → 直径 52px；比 44px 更宽裕，且相邻原子仍有间隙不至于误触。
 */
const HIT_SLOP = 12;

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
        sandboxHint: 'Open bench — build anything you like, no goal',
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
        sandboxHint: '自由盘——随便拼，没有目标分子',
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

/* ────────────────────────── 元素小抄 ──────────────────────────
 * 由 js/bond-forge-molecules.js 的 ELEMENTS 驱动，**不手写元素名** ——
 * 手抄一份元素表就等于给自己埋一个"改了 ELEMENTS 忘了改小抄"的坑。
 *
 * 排序：按常见键数降序（碳 4 键在最前，氢 1 键在后），同键数按原子序数感排列。
 * 中学生第一次玩最需要的是「谁能接几根键」，而不是元素周期表顺序。
 */
const CHEAT_ROWS = Object.values(ELEMENTS)
    .slice()
    .sort((a, b) => (b.maxBonds - a.maxBonds) || a.symbol.localeCompare(b.symbol))
    .map(e => ({
        sym: e.symbol,
        nameEn: e.nameEn,
        nameZh: e.nameZh,
        bonds: e.maxBonds,
        color: e.color,
        label: e.label,
    }));

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

        /* ---------------------- 台面状态 ----------------------
         * 三个数组就是这台仪器的全部状态，渲染与判定都从这里读：
         *   atoms  [{ id, sym, x, y }]       画布上的原子（含开局 placed 的）
         *   bonds  [{ a, b, order }]         已成的键（a/b 是原子 id）
         *   tray   [{ sym, used }]           底部原子盘；used=true 表示已被拖走
         *
         * ⚠️ id 一旦分配**永不回收**。用数组下标当 id 会在「拖回托盘」时
         *    把别人的键指到错的原子上 —— 成键判定走的是 id，不是位置。
         */
        this.atoms = [];
        this.bonds = [];
        this.tray = [];
        this.nextId = 1;

        /** 拖拽会话：{ id, sym, fromTray, x, y, hoverId } */
        this.dragging = null;
        /** 非法成键的抖动动画：{ id, until, baseX, baseY } */
        this.shake = null;
        /**
         * 去重提示：同一句 toast 在短时间内不要连发。
         * key → 上次触发的时间戳（this.time 口径）。
         * 拖拽时每帧都会走 checkProgress()，没有它会把 toast 刷成走马灯。
         */
        this.noteAt = new Map();
        /** 键长松弛迭代用（成键后几何归位） */
        this.relaxUntil = 0;

        // 命中测试用的指针 → 逻辑坐标换算（由 resize() 写入）
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

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
        this.bindPointer();
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

    /**
     * 关卡表只读视图。冒烟脚本靠它把关卡 id / 顺序当作**运行期事实**来定位，
     * 而不是在测试里硬编码下标 —— 关序变了测试仍然对着正确的关卡。
     */
    allLevels() {
        return LEVELS;
    }

    /**
     * 托盘槽位的**运行期几何**（与 drawTray / hitTray 用同一份算法）。
     *
     * 冒烟脚本要按逻辑坐标去点托盘，硬编码 slot/y 会在任何布局调整后静默失准
     * （点空处 → 拖不出原子 → 测试报"没成键"，而真因是坐标算错了）。
     * 让页面自己报出几何，是唯一不会漂移的做法。
     */
    trayGeometry() {
        const n = this.tray.length;

        // 托盘几何：**必须换行**，不能无限收缩间距。
        //
        // ⚠️ 早期版本是单行 + `slot = Math.min(TRAY.slot, (W - 40) / n)`。
        //    这个式子有个致命缺陷：它只保证「n 个槽位的**中心**跨度」装得下，
        //    完全没管槽位/原子本身的宽度。18 个原子时 slot ≈ 26.7px，而最大的
        //    碳半径 22（直径 44）+ 槽位圈半径 24（直径 48）⇒ 相邻原子直接叠在
        //    一起，整行还从台面右侧溢出去（沙盒里 Na 被裁掉一半）。
        //    沙盒固定 18 个原子（9 种元素 × 2），必然踩中。
        //
        // 正确做法：先定行数（最多 2 行 —— 托盘背板就这么高），再把元素**均分**到
        // 各行；若均分后仍然放不下，就压缩槽距，而不是继续加行。
        const slotR = TRAY.slotR;                      // 24 → 槽位圈直径 48
        const usable = W - 32;                         // 左右各留 16 边框余量
        const slot = TRAY.slot;                        // 58：设计槽距，也是不许更挤的下限

        // 一行最多几个：末尾要给槽位自身留半径，否则最右那个圈的边缘会压到台面边框。
        const perRowSafe = Math.max(1, Math.floor((usable - slotR) / slot));

        const MAX_ROWS = 2;
        let rows = 1;
        while (rows < MAX_ROWS && Math.ceil(n / rows) > perRowSafe) rows++;
        const perRowBalanced = Math.ceil(n / rows);

        // 真正画出来的槽距：默认 58；行数 >1 且 58 装不下时压到刚好够用。
        // 下界 slotR*2+2 = 50 > 槽位圈直径 48 ⇒ 永远不会重叠。
        let pitch = slot;
        if (rows > 1 && perRowBalanced > 1) {
            const maxPitch = (usable - slotR * 2) / (perRowBalanced - 1);
            pitch = Math.min(slot, Math.max(slotR * 2 + 2, maxPitch));
        }
        const rowY = (r) => TRAY.y - (rows - 1) * 30 + r * 60;

        const slots = this.tray.map((t, i) => {
            const r = Math.min(rows - 1, Math.floor(i / perRowBalanced));
            const inRow = Math.min(perRowBalanced, n - r * perRowBalanced);
            const idx = i - r * perRowBalanced;
            const x0 = W / 2 - (pitch * (inRow - 1)) / 2;
            return { sym: t.sym, used: t.used, x: x0 + idx * pitch, y: rowY(r) };
        });
        return { slot: pitch, x0: W / 2 - (pitch * (perRowBalanced - 1)) / 2, y: TRAY.y, rows, perRow: perRowBalanced, slots };
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
    /**
     * 元素小抄：一行一个元素（符号 / 名称 / 常见键数）。
     *
     * ⚠️ 语言判据用 `this.lang`，元素名从 ELEMENTS 的 nameZh / nameEn 取。
     *    字段名**必须**与 pages 顶部 CHEAT_ROWS 的构建保持一致（nameZh/nameEn），
     *    写成 row.zh/row.en 会静默渲染出 undefined —— 而"元素名"是这张小抄
     *    存在的唯一理由，空着等于小抄废掉。
     */
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
            // 用元素自己的球体色做一个小圆点，把"小抄"和"台面上的球"对应起来
            sym.style.setProperty('--bf-elem-color', row.color);
            sym.style.setProperty('--bf-elem-label', row.label);

            const name = document.createElement('span');
            name.className = 'bf-cheat-name';
            name.textContent = this.lang === 'zh' ? row.nameZh : row.nameEn;

            const val = document.createElement('span');
            val.className = 'bf-cheat-val';
            val.textContent = String(row.bonds);

            div.appendChild(sym);
            div.appendChild(name);
            div.appendChild(val);
            body.appendChild(div);
        });

        if (this.el['cheat-title']) this.el['cheat-title'].textContent = this.t('sideCheat');
        if (this.el['cheat-toggle']) {
            this.el['cheat-toggle'].setAttribute('aria-expanded', this.cheatOpen ? 'true' : 'false');
        }
        if (body) body.classList.toggle('hidden', !this.cheatOpen);
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
            if (this.mode === 'sandbox') {
                // 沙盒没有关卡号。不特判会显示 "Level 0/20"（levelIndex = -1），
                // 看起来像"关卡加载失败"。
                el['hud-level'].textContent = this.t('sandbox');
            } else {
                el['hud-level'].textContent = LEVELS.length
                    ? `${this.t('level')} ${Math.min(this.levelIndex + 1, LEVELS.length)}/${LEVELS.length}`
                    : `${this.t('level')} 0/0`;
            }
        }
        if (el['drags']) el['drags'].textContent = String(this.drags);
        // 沙盒不记分、没有 par 目标 → 隐藏 par 读数，否则显示 "· Par 0" 很困惑
        if (el['par']) {
            el['par'].textContent = this.mode === 'sandbox' ? '' : `· ${this.t('par')} ${this.par}`;
        }
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

    /**
     * 自由搭建沙盒（提案 §8 Q4：做，作为第三个入口）。
     *
     * ⚠️ 这里**必须**自己重置棋盘。`setupBoard()` 只被 `startLevel()` 调用，
     *    而沙盒没有关卡对象 —— 早期版本只写了 `this.level = null` 就返回，
     *    直接从某一关点「自由搭建」会把上一关的原子和半成品键留在画布上，
     *    玩家以为沙盒是空的却在拖一堆残留物。用 `setupBoard(null)` 清盘
     *    （placed/tray 都取 `|| []`，等价于全空），再铺一张自由元素盘。
     *
     * 不判定通关：`this.level = null` ⇒ `checkProgress()` 开头的
     *    `if (!this.level ...) return` 直接短路。`onLevelCleared()` 里还
     *    有一道显式 `mode === 'sandbox'` 兜底 —— 两道都有意保留，因为它们
     *    守的是不同的路径（前者守正常成键，后者守任何其他入口的误调用）。
     */
    startSandbox() {
        this.mode = 'sandbox';
        this.level = null;
        this.levelIndex = -1;
        this.drags = 0;
        this.par = 0;
        this.setupBoard(null);
        // 自由盘：每种元素给两个，够拼出绝大多数常见小分子
        for (const sym of SANDBOX_TRAY) {
            this.tray.push({ sym, used: false });
            this.tray.push({ sym, used: false });
        }
        this.hideOverlays();
        this.state = 'playing';
        this.isPaused = false;
        this.updateHud();
        this.toast(this.t('sandboxHint'));
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
        this.setupBoard(this.level);
        this.hideOverlays();
        this.state = 'playing';
        this.isPaused = false;
        this.updateHud();
        this.renderSideRecords();
        track('bond-forge', this.mode === 'daily' ? 'daily_start' : 'level_start');
    }

    /**
     * 按关卡布置台面：把 `placed` 摆到画布上、`tray` 放进底部原子盘。
     *
     * 两个数组**不相交**（见 js/bond-forge-levels.js 顶部的口径说明）：
     *   placed 是开局已经站在画布上的原子（教学先导），tray 是可拖的。
     *   所以「拖拽数 = 目标原子数 − placed 数」，也就是 par。
     *
     * placed 的摆法：单原子引导关（水/甲烷…）把中心原子放在台面中央偏上；
     * 多原子引导的情况目前用不到（SPECS 里 placed 最多 1 个），但要写成
     * 通用的环形分布，免得以后加关时踩空。
     */
    setupBoard(level) {
        this.atoms = [];
        this.bonds = [];
        this.tray = [];
        this.dragging = null;
        this.shake = null;
        this.nextId = 1;

        const placed = (level && level.placed) || [];
        const cx = W / 2;
        const cy = H * 0.40;
        placed.forEach((sym, i) => {
            let x = cx, y = cy;
            if (placed.length > 1) {
                const ang = (Math.PI * 2 * i) / placed.length - Math.PI / 2;
                x = cx + Math.cos(ang) * 92;
                y = cy + Math.sin(ang) * 92;
            }
            this.atoms.push({ id: this.nextId++, sym, x, y });
        });

        // 托盘：按元素把同名原子聚到一起，数一数每种有几个
        (level && level.tray ? level.tray : []).forEach(sym => {
            this.tray.push({ sym, used: false });
        });
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

    /**
     * 星级判据：**拖拽次数 vs par**（提案 §2.6，M2 定稿）。
     *
     *   drags <= par        → 3 星（最优解）
     *   drags <= par + 1    → 2 星
     *   再多                → 1 星
     *
     * ⚠️ M0 时期这里是 `checkStars(stats)`，按「没用撤销 / 没用催化剂」给星
     *    （`stats.usedUndo` / `stats.usedCatalyst`）。那两个字段现在没有任何
     *    地方会写 true，而且 `noUndo`（不许撤销）不是本作想教的东西 ——
     *    撤销是正当操作，惩罚它等于鼓励玩家不敢试错，与提案 §2.6「不做扣分、
     *    不嘲讽」直接冲突。旧签名还有个实际后果：调用点 `this.checkStars()`
     *    不传参 → 读 `undefined.usedUndo` 直接抛错，**每次通关都崩**。
     *    所以这里只保留 par 口径，并且不再接受参数。
     *
     * 下限 1 星：通关就该有星，不做「0 星通关」这种挫败设计。
     */
    checkStars() {
        const par = this.par || 0;
        if (this.drags <= par) return 3;
        if (this.drags <= par + 1) return 2;
        return 1;
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
        this.updateShake();
        this.drawBonds(ctx);
        this.drawTray(ctx);
        this.drawAtoms(ctx);
        this.drawDragPreview(ctx);
    }

    /* ---------------------- 台面渲染 ---------------------- */

    /** 元素表查不到就退回一个中性灰球，绝不抛异常打断整帧 */
    elemOf(sym) {
        return ELEMENTS[sym] || { symbol: sym, radius: 18, color: '#7c89bf', label: '#0b1020' };
    }

    /** 某个原子已经用掉的总键级（双键算 2） */
    usedOf(atom) {
        return usedBonds(atom, this.bonds);
    }

    /**
     * 画一根键。单键一条线、双键两条平行线、三键三条。
     * 离子对不画共价线，改画虚线接触 + ± 电荷徽记（NaCl 那关的观感全靠它）。
     */
    drawBonds(ctx) {
        const byId = {};
        this.atoms.forEach(a => { byId[a.id] = a; });

        for (const b of this.bonds) {
            const A = byId[b.a];
            const B = byId[b.b];
            if (!A || !B) continue;
            const order = b.order || 1;
            const ionic = isIonic(A.sym, B.sym);

            if (ionic) {
                ctx.save();
                ctx.strokeStyle = 'rgba(167,139,250,0.55)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(A.x, A.y);
                ctx.lineTo(B.x, B.y);
                ctx.stroke();
                ctx.setLineDash([]);
                this.drawCharge(ctx, A, B, +1);
                this.drawCharge(ctx, B, A, -1);
                ctx.restore();
                continue;
            }

            const dx = B.x - A.x, dy = B.y - A.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len, ny = dx / len;   // 法线，用来把多重键错开
            const spread = 4.4;

            ctx.save();
            ctx.strokeStyle = 'rgba(200,215,255,0.85)';
            ctx.lineWidth = order === 1 ? 5 : 3.4;
            ctx.lineCap = 'round';
            // 端点内缩：让键从球体边缘出发，而不是从圆心穿过球面
            const inA = this.elemOf(A.sym).radius * 0.72;
            const inB = this.elemOf(B.sym).radius * 0.72;
            const ux = dx / len, uy = dy / len;
            const x1 = A.x + ux * inA, y1 = A.y + uy * inA;
            const x2 = B.x - ux * inB, y2 = B.y - uy * inB;

            const offsets = order === 1 ? [0] : order === 2 ? [-spread / 2, spread / 2] : [-spread, 0, spread];
            for (const off of offsets) {
                ctx.beginPath();
                ctx.moveTo(x1 + nx * off, y1 + ny * off);
                ctx.lineTo(x2 + nx * off, y2 + ny * off);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    /** 离子键的电荷徽记：画在原子背离伙伴的那一侧 */
    drawCharge(ctx, atom, other, sign) {
        const dx = atom.x - other.x, dy = atom.y - other.y;
        const len = Math.hypot(dx, dy) || 1;
        const r = this.elemOf(atom.sym).radius;
        const x = atom.x + (dx / len) * (r * 0.78);
        const y = atom.y + (dy / len) * (r * 0.78);

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = sign > 0 ? 'rgba(255,159,67,0.95)' : 'rgba(96,165,250,0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(10,12,28,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#10142a';
        ctx.font = 'bold 13px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sign > 0 ? '+' : '−', x, y + 0.5);
        ctx.restore();
    }

    /**
     * 画一个原子（球体 + 元素符号）。
     *
     * ⚠️ 顺序与半径：先 stroke 后 fill。strokeStyle 会以路径为中心向
     *    **内外各半**扩展，若先 fill 再 stroke，5px 描边会把圆吃掉 2.5px 半径，
     *    整排原子看起来忽大忽小（不同元素半径不同，吃掉的比例也不同）。
     *    这里先描边（用深色勾边把球从网格上"抠"出来）再填充，视觉半径就是 radius。
     */
    drawAtom(ctx, atom, opts) {
        const o = opts || {};
        const e = this.elemOf(atom.sym);
        const r = e.radius * (o.scale || 1);

        ctx.save();
        ctx.globalAlpha = o.alpha != null ? o.alpha : 1;

        // 外描边：把球从台面网格上分出来
        ctx.beginPath();
        ctx.arc(atom.x, atom.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(8,10,24,0.9)';
        ctx.lineWidth = 5;
        ctx.stroke();

        // 球体：径向渐变造一点体积感（左上受光）
        const g = ctx.createRadialGradient(
            atom.x - r * 0.32, atom.y - r * 0.34, r * 0.15,
            atom.x, atom.y, r,
        );
        g.addColorStop(0, this.lighten(e.color, 0.30));
        g.addColorStop(1, e.color);
        ctx.beginPath();
        ctx.arc(atom.x, atom.y, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // 元素符号
        ctx.fillStyle = e.label;
        ctx.font = `bold ${Math.round(r * (atom.sym.length > 1 ? 0.78 : 0.95))}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(atom.sym, atom.x, atom.y + r * 0.04);

        // 价键余量：还能接几根键 —— 这是本作最重要的可读性线索
        const left = maxBondsOf(atom.sym) - this.usedOf(atom);
        if (o.showValence !== false && this.state === 'playing' && left > 0) {
            ctx.beginPath();
            ctx.arc(atom.x, atom.y, r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(64,216,255,0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    /** 把 #rrggbb 按比例往白里提亮（用于球体高光） */
    lighten(hex, amt) {
        const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        const n = parseInt(m[1], 16);
        const r = Math.min(255, ((n >> 16) & 255) + 255 * amt);
        const g = Math.min(255, ((n >> 8) & 255) + 255 * amt);
        const b = Math.min(255, (n & 255) + 255 * amt);
        return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    }

    drawAtoms(ctx) {
        for (const a of this.atoms) {
            // 正在拖的那个原子由 drawDragPreview 单独画（跟着指针走）
            if (this.dragging && this.dragging.id === a.id) continue;
            this.drawAtom(ctx, a);
        }
    }

    /**
     * 底部原子托盘：还没被拖出去的原子。
     * 每个槽位画一圈"这里有个坑"的虚线；原子画在槽位上。
     */
    drawTray(ctx) {
        if (!this.tray.length) return;

        // 槽位几何与 hitTray() 共用 trayGeometry()，两处算法不许各写一份。
        // ⚠️ 每个槽位的 y 取自 geo.slots[i].y（可能两行），**不是**恒定的 TRAY.y ——
        //    背板高度也要按 rows 撑开，否则第二行画在背板外面。
        const geo = this.trayGeometry();
        const half = geo.rows === 1 ? 34 : 34 + (geo.rows - 1) * 30;

        ctx.save();
        // 托盘背板
        ctx.fillStyle = 'rgba(12,16,38,0.72)';
        ctx.fillRect(0, TRAY.y - half, W, half * 2);
        ctx.strokeStyle = 'rgba(120,150,240,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, TRAY.y - half - 0.5);
        ctx.lineTo(W, TRAY.y - half - 0.5);
        ctx.stroke();

        this.tray.forEach((t, i) => {
            const x = geo.slots[i].x;
            const y = geo.slots[i].y;

            if (t.used) {
                // 空槽：只留一个很淡的坑
                ctx.beginPath();
                ctx.arc(x, y, TRAY.slotR, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(120,150,240,0.16)';
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
                return;
            }

            ctx.beginPath();
            ctx.arc(x, y, TRAY.slotR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(120,150,240,0.10)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(120,150,240,0.38)';
            ctx.lineWidth = 2;
            ctx.stroke();

            this.drawAtom(ctx, { id: -1, sym: t.sym, x, y }, { showValence: false });
        });
        ctx.restore();
    }

    /** 拖拽中的预览：原子跟着指针 + 候选目标上的吸附提示环 */
    drawDragPreview(ctx) {
        const d = this.dragging;
        if (!d) return;

        // 候选目标提示环
        if (d.hoverId != null) {
            const t = this.atoms.find(a => a.id === d.hoverId);
            if (t) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(t.x, t.y, BOND.previewR, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(52,211,153,0.8)';
                ctx.lineWidth = 3;
                ctx.setLineDash([6, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        this.drawAtom(ctx, { id: -1, sym: d.sym, x: d.x, y: d.y },
            { scale: 1.06, alpha: 0.94, showValence: false });
    }

    /** 非法成键的抖动：3 次 ±4px，纯视觉，不改原子真坐标 */
    updateShake() {
        if (!this.shake) return;
        if (this.time >= this.shake.until) { this.shake = null; return; }
        const atom = this.atoms.find(a => a.id === this.shake.id);
        if (!atom) { this.shake = null; return; }
        const left = this.shake.until - this.time;
        const phase = (BOND.rejectMs - left) / BOND.rejectMs;   // 0 → 1
        const dir = Math.sin(phase * Math.PI * BOND.shakeCount * 2);
        atom.x = this.shake.baseX + dir * BOND.shakePx * (1 - phase);
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
        this.unbindPointer();
    }

    /* ---------------------- 输入 ---------------------- */

    /**
     * 指针事件绑定。
     *
     * ⚠️ 监听在 **canvas** 上而不是 window：window 上会在顶栏/侧栏/抽屉上
     *    也触发拖拽，玩家点「重开」时就把原子拽走了。
     * ⚠️ 用 pointer 事件而不是 mouse/touch 双份：pointer 天然统一鼠标/触屏/笔，
     *    且要 setPointerCapture 才能在指针移出 canvas 时继续收到 move。
     *    没有 capture 的话，拖到画布外松手 = 原子永久卡在拖拽态。
     */
    bindPointer() {
        const c = this.canvas;
        if (!c || this._pointerBound) return;
        this._pointerBound = true;

        this._onDown = (ev) => this.onDown(ev);
        this._onMove = (ev) => this.onMove(ev);
        this._onUp = (ev) => this.onUp(ev);

        c.addEventListener('pointerdown', this._onDown);
        c.addEventListener('pointermove', this._onMove);
        c.addEventListener('pointerup', this._onUp);
        c.addEventListener('pointercancel', this._onUp);
        // 触屏拖动时阻止页面滚动/长按选择，否则拖原子会连带滚屏
        c.style.touchAction = 'none';
    }

    unbindPointer() {
        const c = this.canvas;
        if (!c || !this._pointerBound) return;
        this._pointerBound = false;
        c.removeEventListener('pointerdown', this._onDown);
        c.removeEventListener('pointermove', this._onMove);
        c.removeEventListener('pointerup', this._onUp);
        c.removeEventListener('pointercancel', this._onUp);
    }

    /** 屏幕坐标 → 逻辑画布坐标 */
    toLogical(ev) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: ((ev.clientX - rect.left) / (rect.width || 1)) * W,
            y: ((ev.clientY - rect.top) / (rect.height || 1)) * H,
        };
    }

    /**
     * 命中测试：返回画布上最靠近 (x,y) 的原子，超出半径 + 外扩就不算命中。
     *
     * 外扩（HIT_SLOP）是触控可用性的关键：原子球体本身只有 14–26px 半径，
     * 手指按不准。触控热区要比视觉直径大一圈 —— 项目规约要求可点目标 ≥44px。
     */
    hitAtom(x, y) {
        let best = null, bestD = Infinity;
        for (const a of this.atoms) {
            const r = this.elemOf(a.sym).radius + HIT_SLOP;
            const d = Math.hypot(a.x - x, a.y - y);
            if (d <= r && d < bestD) { best = a; bestD = d; }
        }
        return best;
    }

    /** 命中托盘里某个**未被使用**的槽位 */
    hitTray(x, y) {
        const g = this.trayGeometry();
        for (let i = 0; i < g.slots.length; i++) {
            const s = g.slots[i];
            if (s.used) continue;
            const r = Math.max(TRAY.slotR, HIT_SLOP);
            if (Math.hypot(s.x - x, s.y - y) <= r) return { tray: this.tray[i], index: i, x: s.x, y: s.y };
        }
        return null;
    }

    onDown(ev) {
        if (this.state !== 'playing' || this.isPaused) return;
        const p = this.toLogical(ev);
        const atom = this.hitAtom(p.x, p.y);
        if (atom) {
            // 从画布上拿起一个原子：它脱离原有键（成键不是永久契约，允许改接线）
            this.detachAtom(atom.id);
            this.dragging = { id: atom.id, sym: atom.sym, fromTray: false, x: p.x, y: p.y, hoverId: null, ox: atom.x - p.x, oy: atom.y - p.y };
        } else {
            const slot = this.hitTray(p.x, p.y);
            if (!slot) return;
            // 从托盘拖出一个新原子
            slot.tray.used = true;
            const id = this.nextId++;
            this.atoms.push({ id, sym: slot.tray.sym, x: slot.x, y: slot.y });
            this.dragging = { id, sym: slot.tray.sym, fromTray: true, x: p.x, y: p.y, hoverId: null, ox: 0, oy: 0 };
        }
        try { this.canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 某些环境不支持则忽略 */ }
        ev.preventDefault();
    }

    onMove(ev) {
        const d = this.dragging;
        if (!d) return;
        const p = this.toLogical(ev);
        const a = this.atoms.find(x => x.id === d.id);
        if (a) { a.x = d.ox ? p.x + d.ox : p.x; a.y = d.oy ? p.y + d.oy : p.y; }
        d.x = p.x;
        d.y = p.y;
        // 找最近的候选目标（画提示环用）
        const cand = this.nearestCandidate(d);
        d.hoverId = cand ? cand.id : null;
        ev.preventDefault();
    }

    /** 当前拖拽中，吸附半径内的候选原子（排除自己） */
    nearestCandidate(d) {
        const self = this.atoms.find(a => a.id === d.id);
        if (!self) return null;
        let best = null, bestD = Infinity;
        for (const a of this.atoms) {
            if (a.id === d.id) continue;
            const dist = Math.hypot(a.x - self.x, a.y - self.y);
            if (dist <= BOND.snapR + this.elemOf(a.sym).radius && dist < bestD) { best = a; bestD = dist; }
        }
        return best;
    }

    onUp(ev) {
        const d = this.dragging;
        if (!d) return;
        this.dragging = null;
        try { this.canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }

        const self = this.atoms.find(a => a.id === d.id);
        if (!self) return;
        const cand = this.nearestCandidate({ id: d.id });

        if (!cand) {
            // 没碰上任何人：若来自托盘且落在托盘上方，就当"放回去"（不消耗原子）
            if (d.fromTray && self.y > TRAY.y - 46) {
                this.atoms = this.atoms.filter(a => a.id !== d.id);
                this.tray.forEach(t => { if (t.sym === d.sym && t.used) { /* 还原第一个已用的同名槽 */ } });
                this.restoreTraySlot(d.sym);
            } else if (!d.fromTray) {
                // 从画布拿起又没接上：留在原地，但**不**计拖拽数（没成键不算操作）
                this.relaxToFree(self);
            }
            this.updateHud();
            return;
        }

        this.tryBond(self, cand);
    }

    /** 把「已被拖走」的同名槽位还原一个（放回托盘用） */
    restoreTraySlot(sym) {
        for (const t of this.tray) {
            if (t.sym === sym && t.used) { t.used = false; return; }
        }
    }

    /**
     * 尝试在 self 与 cand 之间成键。
     *
     * 判定全走 js/bond-forge-molecules.js（运行时与校验器同一份实现）：
     *   · allowsBonds(elem, 需要的总键级)  —— 价键够不够
     *   · isIonic(a, b)                    —— 离子对走 1 根"接触键"
     *   · bondLength(a, b)                 —— 静止键长（离子对更长）
     *
     * ⚠️ 键级一律取 1（单键）。多重键（O=O、N≡N、CO₂）不是"拉两根"，而是
     *    **同一对原子之间键级累加**：反复把同一个原子拖到同一个伙伴上，
     *    每成功一次 order+1，直到价键用尽。这样"双键"是玩家一步步拧出来的，
     *    而不是二选一的下拉框 —— 数学上等价，体感上更像在拧螺丝。
     */
    tryBond(self, cand) {
        const existing = this.bonds.find(b =>
            (b.a === self.id && b.b === cand.id) || (b.a === cand.id && b.b === self.id));

        const curOrder = existing ? (existing.order || 1) : 0;
        const wantOrder = curOrder + 1;

        // 价键检查：两侧各自"已用 + 本次增量"都不能超
        const selfUsed = this.usedOf(self);
        const candUsed = this.usedOf(cand);
        const selfRoom = maxBondsOf(self.sym);
        const candRoom = maxBondsOf(cand.sym);

        // 离子对：只允许 1 根，且永不加键级
        if (isIonic(self.sym, cand.sym)) {
            if (existing) { this.rejectBond(self, 'toastOverValence', { sym: self.sym, n: 1 }); return; }
            this.formBond(self, cand, 1, existing, true);
            return;
        }

        // 共价：只看元素允许的**总键级**上限
        //（P/S 这类多价态元素用 bondOrders 集合判定，见 molecules 模块注释）
        const selfOk = allowsBonds(self.sym, selfUsed + 1) && (selfUsed + 1) <= selfRoom;
        const candOk = allowsBonds(cand.sym, candUsed + 1) && (candUsed + 1) <= candRoom;

        // 已经有一根键了，想再加一根 = 升键级，两边都要能吃得下
        if (existing && (!this.canAddOrder(self, wantOrder) || !this.canAddOrder(cand, wantOrder))) {
            this.rejectBond(self, 'toastOverValence', {
                sym: this.usedOf(self) >= maxBondsOf(self.sym) ? self.sym : cand.sym,
                n: Math.min(selfRoom, candRoom),
            });
            return;
        }

        if (!existing && (!selfOk || !candOk)) {
            const bad = !selfOk ? self : cand;
            this.rejectBond(self, 'toastOverValence', { sym: bad.sym, n: maxBondsOf(bad.sym) });
            return;
        }

        this.formBond(self, cand, wantOrder, existing, false);
    }

    /**
     * 某原子能否把「与伙伴之间的那根键」提到 order 级。
     *
     * 口径：把 order 代进去后，该原子的**总键级**不能超上限。
     * 例：O 上限 2。O 与 C 之间已有 1 根（order=1），想升到 2 ——
     *     总键级从 1 变 2，≤2 可以（这就是 CO₂ 的双键）。
     * 例：O 已经接了 2 根单键（H₂O），想再加 —— 总键级 2→3 > 2，拒绝。
     */
    canAddOrder(atom, order) {
        const curOnThisBond = order - 1;              // 加一级前的键级
        const total = this.usedOf(atom);              // 当前总键级（含这根）
        const next = total - curOnThisBond + order;   // 替换后的总键级
        if (order > 3) return false;                  // 最高三键
        if (isIonicSelf(atom.sym)) return next <= 1;
        return next <= maxBondsOf(atom.sym);
    }

    /** 成键成功：写状态、松弛几何、音效、计分、检查通关 */
    formBond(self, cand, order, existing, ionic) {
        if (existing) {
            existing.order = order;
        } else {
            this.bonds.push({ a: self.id, b: cand.id, order });
        }

        this.relaxPair(self, cand, ionic);
        // 单键 = 纯五度、双键 = 大三度、三键 = 小三度（提案 §4 的化学语义音程）
        const bases = [0, 392, 494, 587];
        sfxTone(bases[Math.min(order, 3)] || 392, 0.16, 'sine', 0.15);
        if (order >= 2) sfxTone((bases[Math.min(order, 3)] || 392) * 1.5, 0.12, 'triangle', 0.09);

        this.drags += 1;
        this.updateHud();
        this.checkProgress();
    }

    /** 成键失败：toast + 抖动 + 不计拖拽数（不给玩家记账上的惩罚） */
    rejectBond(atom, key, params) {
        this.toast(this.tf(key, params));
        this.shake = { id: atom.id, until: this.time + BOND.rejectMs, baseX: atom.x, baseY: atom.y };
        // 木质闷响：noise + 低通，绝不刺耳
        Sfx.noise({ dur: 0.09, vol: 0.10, type: 'lowpass', freq: 320 });
        vibrate(18);
        this.overValenceHits += 1;
    }

    /** 把新成键的两个原子拉到静止键长（互相靠近/推开的几何归位） */
    relaxPair(a, b, ionic) {
        const target = ionic ? BOND.ionicR : bondLength(a.sym, b.sym);
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d <= target) return;
        const push = (d - target) / 2;
        const ux = dx / d, uy = dy / d;
        a.x += ux * push;
        a.y += uy * push;
        b.x -= ux * push;
        b.y -= uy * push;
        this.keepInStage(a);
        this.keepInStage(b);
    }

    /** 未成键就松手：把原子轻推离其它原子，避免视觉上叠在一起 */
    relaxToFree(atom) {
        for (const other of this.atoms) {
            if (other.id === atom.id) continue;
            const dx = atom.x - other.x, dy = atom.y - other.y;
            const d = Math.hypot(dx, dy) || 1;
            const minD = this.elemOf(atom.sym).radius + this.elemOf(other.sym).radius + 8;
            if (d < minD) {
                atom.x = other.x + (dx / d) * minD;
                atom.y = other.y + (dy / d) * minD;
            }
        }
        this.keepInStage(atom);
    }

    /** 原子不许跑出台面（否则拖出去就再也点不到了） */
    keepInStage(a) {
        const r = this.elemOf(a.sym).radius;
        const top = 10 + r;
        // 下界要给**两行**托盘留位置：rows=2 时顶行在 TRAY.y-30，
        // 再减去槽位半径 24 就是舞台可用底边。写死 TRAY.y-40 会让原子
        // 压在托盘第一行上（沙盒里必现）。
        const rows = this.tray.length ? this.trayGeometry().rows : 1;
        const trayTop = TRAY.y - (rows - 1) * 30 - TRAY.slotR;
        const bottom = trayTop - 8 - r;
        a.x = Math.max(r + 8, Math.min(W - r - 8, a.x));
        a.y = Math.max(top, Math.min(bottom, a.y));
    }

    /** 断开某原子的全部键（重新接线用）。返回断掉的根数。 */
    detachAtom(id) {
        const before = this.bonds.length;
        this.bonds = this.bonds.filter(b => b.a !== id && b.b !== id);
        return before - this.bonds.length;
    }

    /**
     * 每步之后检查：是不是拼出目标分子了？
     *
     * ⚠️ 判定必须走 isTarget()（canon + sign），**不是**比较原子计数。
     *    乙醇和二甲醚都是 C₂H₆O —— 只数元素会在 L17 把错答案判成通关。
     */
    checkProgress() {
        if (!this.level || this.state !== 'playing') return;
        const target = MOLECULES[this.level.target];
        if (!target) return;

        const res = isTarget(this.atoms, this.bonds, target);
        if (res.match) {
            this.onLevelCleared();
            return;
        }

        // 没通关，但可能拼出了**别的**真实分子 —— 给正向反馈而不是"错了"
        //（提案 §2.6：不做扣分、不嘲讽。拼出异构体是教学点，不是失误。）
        if (this.atoms.length >= target.atoms.length) {
            const found = identify(this.atoms, this.bonds);
            if (found && found.id !== target.id) {
                this.noteOnce('wrong', 'toastWrongTarget', {}, 4);
            }
        }
    }

    /**
     * 去重的 toast：同一 key 在 cooldown 秒内只提示一次。
     * 拖拽是逐帧判定的，没有节流会把提示刷成走马灯。
     */
    noteOnce(key, textKey, params, cooldown) {
        const last = this.noteAt.get(key);
        if (last != null && this.time - last < (cooldown || 3)) return;
        this.noteAt.set(key, this.time);
        this.toast(this.tf(textKey, params || {}));
    }

    /**
     * 通关：算星级、存档、弹结算。
     *
     * 星级口径（提案 §2.6）：拖拽数 = par 给 3 星，多 1 次给 2 星，再多给 1 星。
     * 下限 1 星 —— 通关就该有星，不做"0 星通关"这种挫败设计。
     */
    onLevelCleared() {
        if (this.state !== 'playing') return;
        this.state = 'clear';

        if (this.mode === 'sandbox') {
            // 沙盒是自由搭建，不判定通关、不记分
            this.toast(this.t('toastLevelDone'));
            this.state = 'playing';
            return;
        }

        const stars = this.checkStars();
        sfxTone(523, 0.16, 'sine', 0.16);
        sfxTone(659, 0.16, 'sine', 0.14);
        sfxTone(784, 0.26, 'sine', 0.13);
        vibrate([12, 40, 18]);

        const id = this.level ? this.level.id : null;
        if (id) {
            const prev = this.progress[id] || { stars: 0, bestDrags: 0 };
            const best = prev.bestDrags > 0 ? Math.min(prev.bestDrags, this.drags) : this.drags;
            this.progress[id] = {
                stars: Math.max(prev.stars || 0, stars),
                bestDrags: best,
            };
            this.saveProgress();
        }

        this.renderLevelGrid();
        this.renderSideRecords();
        this.updateHud();

        if (this.el['clear-stars']) {
            this.el['clear-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        }
        if (this.el['clear-line']) {
            this.el['clear-line'].textContent =
                `${this.t('drags')} ${this.drags} / ${this.t('par')} ${this.par}`;
        }
        if (this.el['clear-note']) {
            this.el['clear-note'].textContent = this.t('clearNote');
        }

        // 阶段标题：单关 vs 全部通关
        if (this.el['title'] && this.mode === 'levels') {
            const all = LEVELS.every(l => (this.progress[l.id] || {}).stars > 0);
            if (all && this.el['clear-line']) {
                this.el['clear-line'].textContent = this.t('levelDone');
            }
            void all;
        }

        if (this.el['clear']) this.el['clear'].classList.remove('hidden');
        track('bond-forge', 'level_clear', { stars });
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
        // ⚠️ 必须含 'home'：本页顶栏首页钮是无 href 的 <button>，点击跳转完全靠
        // chrome 接管 —— 而 owns 默认只含 lang/more，漏掉 'home' = 按钮是死的
        // （页脚 home 是原生 <a> 天然可用，所以症状只出现在顶栏）。
        // sound 不在 owns 里：顶栏静音钮已有自己的 handler（还要同步刷图标）。
        owns: ['lang', 'more', 'home'],
        // ⚠️ 同抽屉：共享层要的是整表。返回 (key)=>string 会让顶栏的
        // sound / moreGames / language 永远停在英文兜底。
        getText: () => (window.bfGame ? window.bfGame.textTable() : LANGUAGES.en),
    });
});
