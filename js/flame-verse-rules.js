/**
 * 焰语（Flame Verse）内核：元素谱线库 · 配方判定 · 关卡 · 每日赛程。
 *
 * 玩法：黑幕上是一条未知样品的发射光谱「条码」。玩家从盐架往火焰里投盐，
 * 每种盐的量分四档（0 没投 / 1 痕 / 2 次 / 3 主），投多少火焰就亮多少、
 * 谱线就多强。对照目标条码把每种盐的量都调对，再送检。
 *
 * 成本铁律（这是「只能加不能减」的全部理由）：
 *   盐只能**往里加**，不能单独撤回 —— 想减只能「倒掉重撒」（罚金 2）。
 *   成本 = 投盐把数 + 倒掉罚金。于是「读数」才是技能：读错元素 = 白投 + 倒掉，
 *   读错档位投多了也一样。读少了反而无所谓（补投即可，不罚）。
 *
 * 数据真实性铁律：
 *   · 谱线波长是真实数据（可见段 400–700nm，取主线；Na 双线 589.0/589.6、
 *     Cu 三线 510/515/522、K 可见段主线 404.4 等），不许为了游戏性乱编。
 *   · 焰色是近似真实焰色反应（Na 金黄 / Sr 红 / Cu 绿 / K 浅紫…）。
 *   · 判定是**集合 + 档位**比对：谱线位置（= 元素）与强度（= 含量）都是指纹。
 *
 * par 铁律：par = Σ 各元素档位 = costOf(recipe)，是「投盐把数」的数学下界
 * —— 任何吻合的配方每元素至少要投档位那么多次，且每次投盐最多 +1。
 * scripts/verify-flame-verse-levels.mjs 会复核这个下界（par 绝不许手填谎报）。
 */

import { hashStringFNV, mulberry32 } from './daily.js';

/* ────────────────────────── 几何 ────────────────────────── */

export const STAGE = { w: 560, h: 640 };

/**
 * 焰窗（火焰粒子）/ 目标条码 / 自己条码 / 盐架 / 状态带。
 * ⚠️ y 512 以下一律留空：两个浮动动作钮（css 里 bottom:12–16px、58–64px 见方）
 *    在窄屏上换算进逻辑坐标会盖住 y≈531–621 —— 盐架绝不能伸进这条带，
 *    否则最左/最右的盐罐被钮压住点不到（移动端实测必现）。空带正好放状态文字。
 */
export const FLAME = { x: 20, y: 10, w: 520, h: 190 };
export const TARGET = { x: 20, y: 208, w: 520, h: 100 };
export const MINE = { x: 20, y: 316, w: 520, h: 100 };
export const RACK = { x: 20, y: 424, w: 520, h: 88 };
export const STATUS = { x: 20, y: 528, w: 520, h: 34 };

/** 可见光波段（nm）：条码横轴 */
export const WL = [400, 700];

/* ────────────────────────── 规则 ────────────────────────── */

export const RULES = {
    maxDose: 3,          // 每种盐最多投 3 把：1 痕 / 2 次 / 3 主
    refillCost: 2,       // 倒掉重撒的罚金（防止无脑试错）
    flamePerDose: 26,    // 火焰粒子基数 × 总档位
    slack: 3,            // 二星带宽：一次误投(1) + 一次倒掉(2) 正好落进来
};

/** 档位名（0 是「没投」，不出现在文案里） */
export const DOSE_NAMES = {
    en: { 1: 'trace', 2: 'medium', 3: 'strong' },
    zh: { 1: '痕', 2: '次', 3: '主' },
};

export function doseName(lang, d) {
    const table = DOSE_NAMES[lang] || DOSE_NAMES.en;
    return table[d] || (lang === 'zh' ? '无' : 'none');
}

export const DAILY_COUNT = 5;

/* ────────────────────────── 元素库 ────────────────────────── */

/**
 * 真实谱线（可见段主线，nm）与近似焰色。w 是同元素内相对强度（画线用）。
 * K 的主线 766.5nm 在近红外，可见段取 404.4 双线 —— 图例里要讲清楚。
 */
export const ELEMENTS = {
    li: { key: 'li', sym: 'Li', salt: { en: 'LiCl', zh: '氯化锂' }, name: { en: 'Lithium', zh: '锂' }, color: '#ff5a6e', flame: '#ff4d5e', lines: [{ nm: 670.8, w: 1 }, { nm: 610.4, w: 0.45 }] },
    sr: { key: 'sr', sym: 'Sr', salt: { en: 'SrCl2', zh: '氯化锶' }, name: { en: 'Strontium', zh: '锶' }, color: '#ff3b47', flame: '#ff2f3f', lines: [{ nm: 674.0, w: 1 }, { nm: 631.3, w: 0.65 }, { nm: 606.0, w: 0.45 }] },
    ca: { key: 'ca', sym: 'Ca', salt: { en: 'CaCl2', zh: '氯化钙' }, name: { en: 'Calcium', zh: '钙' }, color: '#ff8a5c', flame: '#ff7a45', lines: [{ nm: 616.2, w: 1 }, { nm: 422.7, w: 0.85 }] },
    na: { key: 'na', sym: 'Na', salt: { en: 'NaCl', zh: '氯化钠' }, name: { en: 'Sodium', zh: '钠' }, color: '#ffd34d', flame: '#ffc825', lines: [{ nm: 589.0, w: 1 }, { nm: 589.6, w: 0.82 }] },
    ba: { key: 'ba', sym: 'Ba', salt: { en: 'BaCl2', zh: '氯化钡' }, name: { en: 'Barium', zh: '钡' }, color: '#b8e86a', flame: '#a8e05a', lines: [{ nm: 553.5, w: 1 }, { nm: 524.0, w: 0.75 }, { nm: 614.2, w: 0.45 }] },
    cu: { key: 'cu', sym: 'Cu', salt: { en: 'CuSO4', zh: '硫酸铜' }, name: { en: 'Copper', zh: '铜' }, color: '#4de08a', flame: '#3dd47e', lines: [{ nm: 515.3, w: 1 }, { nm: 521.8, w: 0.8 }, { nm: 510.5, w: 0.65 }] },
    k: { key: 'k', sym: 'K', salt: { en: 'KCl', zh: '氯化钾' }, name: { en: 'Potassium', zh: '钾' }, color: '#b8a6ff', flame: '#a892ff', lines: [{ nm: 404.4, w: 1 }, { nm: 404.7, w: 0.6 }] },
    cs: { key: 'cs', sym: 'Cs', salt: { en: 'CsCl', zh: '氯化铯' }, name: { en: 'Caesium', zh: '铯' }, color: '#7a6cff', flame: '#6e5cff', lines: [{ nm: 455.5, w: 1 }, { nm: 459.3, w: 0.7 }] },
};

/** 盐架顺序：按焰色从红到紫排（教学：光谱就是彩虹的顺序） */
export const EL_ORDER = ['li', 'sr', 'ca', 'na', 'ba', 'cu', 'k', 'cs'];

/**
 * 焰色相近的干扰对（同色系但谱线位置不同）：关卡的难度来源。
 * · 红：Li 671 vs Sr 674 —— 只差 3nm，条码上几乎贴着，焰色也近
 * · 暖：Ca 616/423 vs Na 589 —— 都是暖色但 Na 的 589 双线极亮
 * · 紫：K 404 vs Cs 455 —— 都偏紫但一段蓝一端深紫
 */
export const CONFUSION = [
    ['li', 'sr'],
    ['ca', 'na'],
    ['k', 'cs'],
    ['ba', 'cu'],
];

/* ────────────────────────── 配方 ────────────────────────── */

/** 配方 = { li:2, na:1, ... }（缺省 0）。合法性：档位 0–3 */
export function normalizeRecipe(recipe) {
    const out = {};
    for (const k of EL_ORDER) out[k] = clampDose(recipe && recipe[k]);
    return out;
}

function clampDose(v) {
    v = v | 0;
    return v < 0 ? 0 : v > RULES.maxDose ? RULES.maxDose : v;
}

export function costOf(recipe) {
    let n = 0;
    for (const k of EL_ORDER) n += recipe[k] | 0;
    return n;
}

/** 档位全对才算吻合：谱线位置（元素）与强度（含量）都是指纹 */
export function matchRecipe(spec, recipe) {
    for (const k of EL_ORDER) {
        if ((recipe[k] | 0) !== (spec.recipe[k] | 0)) return false;
    }
    return true;
}

/** 送检差异（教学反馈）：返回 [{ el, want, got }] */
export function diffList(spec, recipe) {
    const out = [];
    for (const k of EL_ORDER) {
        const want = spec.recipe[k] | 0, got = recipe[k] | 0;
        if (want !== got) out.push({ el: k, want, got });
    }
    return out;
}

/** 当前配方的焰色（档位加权混色；没投任何盐 = 近炭暗色） */
export function blendColor(recipe) {
    let r = 0, g = 0, b = 0, w = 0;
    for (const k of EL_ORDER) {
        const d = recipe[k] | 0;
        if (!d) continue;
        const col = ELEMENTS[k].flame;
        const wk = d * d;                      // 高档位在混合焰里更抢眼
        r += wk * parseInt(col.slice(1, 3), 16);
        g += wk * parseInt(col.slice(3, 5), 16);
        b += wk * parseInt(col.slice(5, 7), 16);
        w += wk;
    }
    if (!w) return '#1a1420';
    return `rgb(${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)})`;
}

/** 配方里非零元素列表（画条码 / 判定反馈用） */
export function activeElements(recipe) {
    return EL_ORDER.filter(k => (recipe[k] | 0) > 0);
}

/* ────────────────────────── 条码几何（页面与校验器共用） ────────────────────────── */

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** 波长（nm）→ 条码盒内的 x 坐标 */
export function wlX(nm, box) {
    const [lo, hi] = WL;
    return box.x + clamp01((nm - lo) / (hi - lo)) * box.w;
}

/**
 * 一条谱线的画法：软边竖带。半宽 sigma = 2.0nm —— 这是**故意的**粗糙度：
 * Li 670.8 与 Sr 674.0 只差 3.2nm，在这个 sigma 下糊成一团，逼玩家去看
 * 各自的次级线（Li 610.4 / Sr 631.3+606.0）才能分辨；而 Cu 的 510/515/522
 * 三重线（间隔 4.8/6.5nm）则刚好能拆开 —— 「这团绿是一组线」本身就是指纹。
 * 真实的定谱就是这样读的：靠**谱线组**定罪，不靠单条线。
 */
export const LINE_SIGMA = 2.0;

/* ────────────────────────── 星级 ────────────────────────── */

/**
 * 3 星 = 一把不浪费（cost === par）；
 * 2 星 = 最多浪费一次（误投 1 把 + 倒掉罚金 2 = +3，正好落在 slack 里）；
 * 1 星 = 吻合但代价更高。
 * cost = 投盐把数 + 倒掉罚金（refillCost × 次数），asc。
 */
export function starsForLevel(cost, par) {
    if (cost <= par) return 3;
    if (cost <= par + RULES.slack) return 2;
    return 1;
}

/* ────────────────────────── 关卡 ────────────────────────── */

/**
 * 关卡 = 一份未知样品的配方。难度来自：元素数 ↑ / 档位 ↑ / 焰色相近的干扰对。
 * par 由 costOf(recipe) 现算（数学下界），**绝不手填**。
 */
function makeSpec(id, name, recipe, tipKey) {
    const norm = normalizeRecipe(recipe);
    return { id, name, recipe: norm, par: costOf(norm), tipKey: tipKey || 'tipSalt' };
}

/* ────────────────────────── 每日赛程 ────────────────────────── */

/**
 * 每日 5 皿：确定性生成（与站内同构：FNV-1a 种子 + mulberry32）。
 * 难度曲线：1 易（1–2 元）→ 2–3 中（2–3 元）→ 4–5 难（3–4 元 + 干扰对）。
 * 同一天全世界同一份赛程；只依赖 dateKey，零随机数漂移。
 */
export function dailyCourse(dateKey) {
    const rng = mulberry32(hashStringFNV('flame-verse-' + dateKey));
    const pick = arr => arr[(rng() * arr.length) | 0];
    const course = [];
    const seen = new Set();
    const plan = [
        { els: 1, doses: [1, 2] },
        { els: 2, doses: [1, 2, 2] },
        { els: 2, doses: [2, 3, 3] },
        { els: 3, doses: [1, 2, 2, 3] },
        { els: 4, doses: [1, 1, 2, 2, 3, 3] },
    ];
    plan.forEach((p, pi) => {
        let cand = null;
        // 拒绝采样：不重复、元素数对、总把数在合理带宽内
        for (let tries = 0; tries < 200; tries++) {
            const recipe = {};
            const pool = EL_ORDER.slice();
            // 打乱：Fisher–Yates（rng 驱动，确定性）
            for (let i = pool.length - 1; i > 0; i--) {
                const j = (rng() * (i + 1)) | 0;
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            // 高难皿偏向干扰对：至少一组 CONFUSION 同时出现
            if (p.els >= 3) {
                const pair = pick(CONFUSION);
                recipe[pair[0]] = pick(p.doses);
                recipe[pair[1]] = pick(p.doses);
            }
            for (const k of pool) {
                if (Object.keys(recipe).length >= p.els) break;
                if (recipe[k]) continue;
                if (rng() < 0.75) recipe[k] = pick(p.doses);
            }
            while (Object.keys(recipe).length < p.els) {
                const k = pick(pool);
                if (!recipe[k]) recipe[k] = pick(p.doses);
            }
            const key = EL_ORDER.map(x => recipe[x] | 0).join('');
            const cost = costOf(recipe);
            if (seen.has(key) || cost < p.els || cost > p.els * 3 + 1) continue;
            cand = recipe;
            seen.add(key);
            break;
        }
        if (!cand) cand = { [EL_ORDER[0]]: 1 };   // 兜底（理论上到不了）
        course.push(makeSpec(`fvd${pi + 1}`, { en: 'Unknown ' + (pi + 1), zh: '未知样品 ' + (pi + 1) }, cand));
    });
    return course;
}

/* ────────────────────────── 20 关 ────────────────────────── */

/**
 * 20 关全表。难度来自：元素数 ↑ / 档位 ↑ / 焰色相近的干扰对。
 * 教学线：L1–3 单/双元素认线 → L4–6 干扰对登场 → L7–14 混色读谱 →
 *         L15–19 四五元高档位 → L20 八元素全谱收官。
 * par = costOf(recipe) 现算（数学下界），**绝不手填**；
 * scripts/verify-flame-verse-levels.mjs 穷举 4^8 配方空间复核。
 */
const RAW_LEVELS = [
    { id: 'fv1', name: { en: 'First Light', zh: '初焰' }, recipe: { na: 1 }, tipKey: 'tipSalt' },
    { id: 'fv2', name: { en: 'Green Tongue', zh: '绿舌' }, recipe: { cu: 2 }, tipKey: 'tipDose' },
    { id: 'fv3', name: { en: 'Twins', zh: '双生' }, recipe: { li: 1, na: 2 }, tipKey: 'tipPair' },
    { id: 'fv4', name: { en: 'Brick', zh: '砖红' }, recipe: { sr: 3 }, tipKey: 'tipDose' },
    { id: 'fv5', name: { en: 'Meadow', zh: '草甸' }, recipe: { ca: 1, ba: 2 }, tipKey: 'tipBlend' },
    { id: 'fv6', name: { en: 'Dusk', zh: '暮色' }, recipe: { cs: 2, k: 1 }, tipKey: 'tipPair' },
    { id: 'fv7', name: { en: 'Verdigris', zh: '铜绿' }, recipe: { cu: 3, ba: 1 }, tipKey: 'tipPair' },
    { id: 'fv8', name: { en: 'Flare', zh: '信号弹' }, recipe: { sr: 2, li: 1 }, tipKey: 'tipPair' },
    { id: 'fv9', name: { en: 'Brine', zh: '盐卤' }, recipe: { na: 3, k: 2 }, tipKey: 'tipBlend' },
    { id: 'fv10', name: { en: 'Firework', zh: '焰火' }, recipe: { sr: 2, cu: 2, na: 1 }, tipKey: 'tipBlend' },
    { id: 'fv11', name: { en: 'Violet Bolt', zh: '紫电' }, recipe: { k: 3, cs: 1, na: 2 }, tipKey: 'tipPair' },
    { id: 'fv12', name: { en: 'Coral', zh: '珊瑚' }, recipe: { ca: 3, sr: 1, li: 2 }, tipKey: 'tipPair' },
    { id: 'fv13', name: { en: 'Jade', zh: '翡翠' }, recipe: { ba: 3, cu: 1, na: 2 }, tipKey: 'tipPair' },
    { id: 'fv14', name: { en: 'Aurora', zh: '极光' }, recipe: { cs: 2, ba: 2, cu: 3 }, tipKey: 'tipBlend' },
    { id: 'fv15', name: { en: 'Molten Gold', zh: '熔金' }, recipe: { na: 3, ca: 2, li: 1, sr: 1 }, tipKey: 'tipBlend' },
    { id: 'fv16', name: { en: 'Abyss', zh: '深渊' }, recipe: { cu: 3, ba: 2, cs: 1, k: 1 }, tipKey: 'tipBlend' },
    { id: 'fv17', name: { en: 'Calico', zh: '玳瑁' }, recipe: { li: 2, sr: 2, ca: 1, na: 1 }, tipKey: 'tipPair' },
    { id: 'fv18', name: { en: 'Sacred Fire', zh: '圣火' }, recipe: { sr: 3, li: 2, cu: 2, ba: 1 }, tipKey: 'tipBlend' },
    { id: 'fv19', name: { en: 'Starfield', zh: '星野' }, recipe: { na: 2, k: 2, cs: 2, ca: 1, li: 1 }, tipKey: 'tipBlend' },
    { id: 'fv20', name: { en: 'Full Spectrum', zh: '全谱' }, recipe: { li: 1, sr: 1, ca: 1, na: 1, ba: 1, cu: 1, k: 1, cs: 1 }, tipKey: 'tipBlend' },
];

export const LEVELS = RAW_LEVELS.map(l => makeSpec(l.id, l.name, l.recipe, l.tipKey));
