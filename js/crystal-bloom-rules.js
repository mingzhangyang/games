/**
 * Crystal Bloom 晶绽 — 溶液结晶内核（纯模块，页面与校验器共用）
 * ==================================================================
 * 机制即教学：一锅热饱和溶液，你要的不是「点得准」，而是**画一条降温曲线**。
 *
 *   溶解度随温度下降 ⇒ 过饱和度 S = C / Csat(T) − 1 上升 ⇒ 晶体往外长。
 *   S 高（急冷）→ 尖端抢着长 ⇒ 枝晶 / 针状；
 *   S 中（缓冷）→ 只长晶面不长角 ⇒ 八面体（菱形）；
 *   S 低（极缓 / 搅拌）→ 连凹角一起填 ⇒ 致密块晶。
 *
 * 于是「曲线的形状」就是策略：先陡后缓 = 先搭骨架再填实。
 * 搅拌是第二枚旋钮：把生长压回致密档（抹平浓差梯度），代价是 1 点成本。
 *
 * 判定：确定性元胞自动机（完全无随机数 —— 决胜按「扇区轮询」对称化），
 *       逻辑与渲染分离；同一关卡 + 同一曲线 ⇒ 同一颗晶体，永远。
 *
 * ⚠️ 决胜的铁律（M1 探针标定，别改回 idx 升序）：
 *    候选若直接按格索引升序取，行优先序会让晶体一路向上长成细条
 *    （实测 aspect 9.33、搅拌完全失效）。必须按「8 扇区 × 同秩轮询」取，
 *    八个方向才等速延伸，sym/aspect 才有意义。
 *
 * 计分：成本 = 锚点数 + 搅拌次数（asc，越小越聪明）。
 */

import { hashStringFNV, mulberry32 } from './daily.js';

export const STAGE = { w: 560, h: 640 };

/** 结晶皿（网格）与温度曲线画布的几何 */
export const DISH = { x: 20, y: 16, w: 520, h: 400 };
export const CHART = { x: 52, y: 448, w: 480, h: 176 };

export const GRID = { cols: 104, rows: 80, cell: 5 };
/** 皿壁留白（格）：晶体不许贴到网格边缘 —— 贴边会被裁掉，sym/aspect 全都失真 */
export const EDGE = 2;

export const RULES = {
    stepsPerSecond: 12,     // 动画节奏：每秒推进多少逻辑步
    maxPerStep: 20,         // 单步最多长几格（防止 S 爆表时一步糊成一团）
    growK: 20,              // 单步生长格数 = growK × S（再被 maxPerStep 截断）
    // 每长一格消耗的相对浓度 ⇒ 溶质耗尽后自然停止。
    // ⚠️ 0.13 是标定值：0.18 时溶质 25 步就见底，高 S 段短到一次搅拌就能压完，
    //    「搅几次」这个成本维度直接塌掉；0.13 把高 S 段拉到 ~35 步，够 3 次搅拌的量。
    massPerCell: 0.13,
    sDend: 0.50,            // S ≥ 0.50：枝晶档（只长尖端/细枝侧）
    sOcta: 0.22,            // 0.22 ≤ S < 0.50：八面体档（只长晶面，不长角）
    //  S < 0.22：块状档（连凹角一起填）
    dendMaxN8: 3,           // 枝晶档候选上限：n8 ≤ 它才长（尖端与细枝侧）
    octaMinN8: 3,           // 八面体档候选下限：n8 ≥ 它才长（晶面；凹角不长）
    blockMinN8: 2,          // 块状档候选下限：连凹角一起填
    // 搅拌生效时长（逻辑步）：抹平浓差是暂时的，不是永久开关。
    // ⚠️ 14 是标定值：20 步时一次搅拌就能压住整段高 S，所有「急冷 + 致密」关卡
    //    都是 par=2，成本维度直接塌掉；14 步让「搅几次」变成要算的真成本。
    stirSpan: 14,
    tRange: [10, 90],       // 温度轴（℃）：曲线只许在这个区间内单调下降
};

/** 溶解度曲线：Csat(T) = satA + satB × T（近似线性的真实感） */
export const SAT = { a: 20, b: 1.4 };
export function satAt(T) { return SAT.a + SAT.b * T; }

export const DAILY_COUNT = 5;

/* ────────────────────────── 曲线 ────────────────────────── */

/**
 * 曲线 = 起点 (0, T0) + 玩家锚点，段间线性，最后一段水平延伸到 tMax。
 * 只许降温（T 单调不增）：回温会溶解晶体，那不是这一作要教的东西。
 */
export function sampleCurve(spec, anchors, t) {
    const pts = [{ t: 0, T: spec.t0 }];
    for (const a of anchors) pts.push({ t: a.t, T: a.T });
    if (pts.length === 1) return spec.t0;
    if (t <= pts[0].t) return pts[0].T;
    for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        if (t <= q.t) {
            const span = Math.max(1e-6, q.t - p.t);
            const u = (t - p.t) / span;
            return p.T + (q.T - p.T) * u;
        }
    }
    return pts[pts.length - 1].T;
}

/** 锚点放置合法性：时间递增、温度不高于上一个点、落在区间内 */
export function canPlaceAnchor(spec, anchors, t, T) {
    const [tLo, tHi] = [1, spec.tMax];
    const [TLo, THi] = RULES.tRange;
    if (t < tLo || t > tHi) return false;
    if (T < TLo || T > THi) return false;
    const prev = anchors.length ? anchors[anchors.length - 1] : { t: 0, T: spec.t0 };
    if (t <= prev.t) return false;
    if (T > prev.T + 1e-9) return false;
    return true;
}

/* ────────────────────────── 晶形分类 ────────────────────────── */

/**
 * 四个晶形档。阈值由 M1 探针标定（见 scratch/cb-probe.mjs），不许拍脑袋改：
 * 改任何一条都要重跑 scripts/verify-crystal-bloom-levels.mjs。
 */
export const HABITS = {
    needle: { id: 'needle', zh: '针状', en: 'Needle' },
    dendrite: { id: 'dendrite', zh: '枝晶', en: 'Dendrite' },
    octa: { id: 'octa', zh: '八面体', en: 'Octahedron' },
    blocky: { id: 'blocky', zh: '块状', en: 'Blocky' },
};

export const HABIT_ORDER = ['needle', 'dendrite', 'octa', 'blocky'];

/**
 * 判定顺序有讲究：**先针状，再枝晶，再八面体，最后块状**。
 * 一根针是实心的（fill 高），只有 aspect + minor 能把它挑出来；
 * 枝晶的特征是「尖端多 + 稀疏」；八面体与块状靠 fill 与对称度分家。
 */
export function classify(m) {
    if (m.aspect >= 2.0 && m.minor <= 3) return 'needle';
    if (m.tips >= 8 && m.fill <= 0.45) return 'dendrite';
    // ⚠️ 这两档的 aspect 上限必须一致（1.60），否则搅拌把枝晶压到「半致密」时
    //    会卡在两档之间的缝里判 null（实测 stir@1 → fill 0.60 / asp 1.54）。
    // octa 的 sym 门槛必须 ≤ 0.55：S≈0.88 那档长出来的菱形实测 sym 只有 0.57，
    //    卡在 0.70 会判 null（整档消失）。枝晶靠 fill ≤ 0.45 在前面就被拦下了，不冲突。
    if (m.fill >= 0.30 && m.fill <= 0.62 && m.sym >= 0.55 && m.aspect <= 1.60) return 'octa';
    // blocky 不再要求 sym：致密就是致密，对称度只在第三星里加分，不用来卡档。
    if (m.fill >= 0.60 && m.aspect <= 1.60) return 'blocky';
    return null;
}

/** 第三星：晶形「有多标准」—— 各项指标离窗口中点越近越高分 */
export function qualityOf(m, habit) {
    const near = (v, lo, hi) => {
        if (v < lo) return Math.max(0, 1 - (lo - v) / Math.max(1e-6, (hi - lo) * 0.6));
        if (v > hi) return Math.max(0, 1 - (v - hi) / Math.max(1e-6, (hi - lo) * 0.6));
        const mid = (lo + hi) / 2;
        return 1 - Math.abs(v - mid) / Math.max(1e-6, (hi - lo) / 2) * 0.35;
    };
    // 针的最小厚度就是 3（晶种棒就是 3 格高），别把 minor≤2 当满分标准
    if (habit === 'needle') return Math.min(1, near(m.aspect, 2.0, 12.0) * 0.7 + (m.minor <= 3 ? 1 : 0.6) * 0.3);
    if (habit === 'dendrite') return Math.min(1, near(m.fill, 0.12, 0.45) * 0.6 + Math.min(1, m.tips / 24) * 0.4);
    if (habit === 'octa') return Math.min(1, near(m.fill, 0.30, 0.62) * 0.5 + near(m.sym, 0.72, 1.0) * 0.5);
    if (habit === 'blocky') return Math.min(1, near(m.fill, 0.66, 1.0) * 0.7 + near(m.sym, 0.70, 1.0) * 0.3);
    return 0;
}

/* ────────────────────────── 世界 ────────────────────────── */

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** 扇区：以种子中心为原点的 8 个方向，用于对称轮询（中心 = 4，不会出现） */
function sectorOf(cx, cy, x, y) {
    const sx = Math.sign(x - cx), sy = Math.sign(y - cy);
    return (sy + 1) * 3 + (sx + 1);
}

export function createWorld(spec, seedKey) {
    const cols = GRID.cols, rows = GRID.rows;
    const grid = new Uint8Array(cols * rows);
    const age = new Int16Array(cols * rows).fill(-1);
    // 八邻域已结晶数：增量维护（长一格给 8 个邻居 +1）。
    // 求解器要跑几十万次 simulate，每步现算 8 邻域会把搜索拖到不可用的量级。
    const n8 = new Uint8Array(cols * rows);
    const cx = (cols / 2) | 0, cy = (rows / 2) | 0;
    const seedCells = [];
    if (spec.seed === 'lineX') {
        // 一根 7×3 的晶种棒（不是单行：单会长成 1 格厚的线，minior=1 看着像划痕）
        for (let dy = -1; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) seedCells.push({ x: cx + dx, y: cy + dy });
    } else {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) seedCells.push({ x: cx + dx, y: cy + dy });
    }
    const boundary = new Set();
    for (const c of seedCells) {
        const i = c.y * cols + c.x;
        grid[i] = 1;
        age[i] = 0;
    }
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (!grid[y * cols + x]) continue;
            for (const [dx, dy] of N8) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                n8[ny * cols + nx]++;
            }
        }
    }
    const addBoundary = (x, y) => {
        for (const [dx, dy] of N8) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const ni = ny * cols + nx;
            if (grid[ni] === 0) boundary.add(ni);
        }
    };
    for (const c of seedCells) addBoundary(c.x, c.y);

    return {
        spec,
        seedKey: seedKey || spec.id,
        cols, rows, cx, cy,
        grid, age, n8, boundary,
        bb: { minX: cx - 1, maxX: cx + 1, minY: cy - 1, maxY: cy + 1 },
        t: 0,
        conc: satAt(spec.t0),      // 当前浓度 C（初始 = T0 下的饱和浓度）
        temp: spec.t0,
        s: 0,
        regime: 'blocky',
        cells: seedCells.length,
        stirred: false,
        stirAt: null,
        anchors: [],               // 玩家锚点（页面持有；模拟只用来采样）
        stirs: [],                 // 已安排的搅拌时刻
        cost: 0,
        state: 'ready',            // ready | running | done
        history: [],               // 每步 { t, T, S, cells, regime }
        m: null,
        habit: null,
        quality: 0,
    };
}

function hasAxisNeighbor(world, idx, axis) {
    const cols = world.cols;
    const x = idx % cols, y = (idx - x) / cols;
    const dirs = axis === 'x' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= world.rows) continue;
        if (world.grid[ny * cols + nx]) return true;
    }
    return false;
}

/**
 * 单步生长。
 *
 * 档位（regime）由过饱和度 S 决定，搅拌把它往致密档**压一档**：
 *   枝晶 → 八面体 → 块状。这是「抹平浓差梯度」的游戏化表述。
 *
 * 每档只挑**一部分**候选（n8 = 八邻域已结晶格数）：
 *   枝晶档 n8 ≤ dendMaxN8 —— 平铺的晶面不长，只有尖端与细枝侧长 ⇒ 分叉；
 *   八面体档 n8 ≥ octaMinN8 —— 凹角不长，只长晶面 ⇒ 菱形（二维里的八面体）；
 *   块状档 n8 ≥ blockMinN8 —— 连凹角一起填 ⇒ 致密的方块。
 *
 * 决胜：同 n8 层内按「8 扇区 × 同秩轮询」取 —— 八个方向等速延伸。
 *       （见文件头铁律：直接按 idx 升序会长成朝上的细条。）
 */
export function stepWorld(world, anchors, stirs) {
    const { cols, rows, grid, age, cx, cy } = world;
    const spec = world.spec;
    world.t += 1;
    const T = sampleCurve(spec, anchors || world.anchors, world.t);
    world.temp = T;
    const csat = satAt(T);
    const S = world.conc / csat - 1;
    world.s = S;

    // 搅拌：窗口内（[st, st+stirSpan)）压一档；窗口过档位自然恢复。
    // 「永久生效」会把搅拌变成开局按一下就结束的一次性开关，没有时机可言。
    const stirList = stirs || world.stirs;
    let stirred = false;
    for (const st of stirList) {
        if (world.t >= st && world.t < st + RULES.stirSpan) { stirred = true; break; }
    }
    world.stirred = stirred;
    if (stirred && world.stirAt === null) world.stirAt = world.t;

    let regime;
    if (S >= RULES.sDend) regime = 'dendrite';
    else if (S >= RULES.sOcta) regime = 'octa';
    else regime = 'blocky';
    if (world.stirred) regime = regime === 'dendrite' ? 'octa' : 'blocky';
    world.regime = regime;

    // 各向异性封顶：针长到 maxAspect 之后只许长侧向（增厚），否则会拉成一条无限细线
    const bb = world.bb;
    const bw = bb.maxX - bb.minX + 1, bh = bb.maxY - bb.minY + 1;
    const lateralOnly = !!(spec.aniso && spec.maxAspect &&
        Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)) >= spec.maxAspect);

    const want = Math.min(RULES.maxPerStep, Math.max(0, Math.round(RULES.growK * Math.max(0, S))));
    if (want > 0) {
        // 候选按 n8 分层；层内按扇区分桶，桶内按（切比雪夫距离, idx）升序
        const layers = new Map();
        for (const idx of world.boundary) {
            if (grid[idx]) continue;
            const x = idx % cols, y = (idx - x) / cols;
            const n = world.n8[idx];
            let keep;
            if (regime === 'dendrite') keep = n <= RULES.dendMaxN8;
            else if (regime === 'octa') keep = n >= RULES.octaMinN8;
            else keep = n >= RULES.blockMinN8;
            if (!keep) continue;
            if (x < EDGE || y < EDGE || x >= cols - EDGE || y >= rows - EDGE) continue;
            if (spec.aniso && !hasAxisNeighbor(world, idx, spec.aniso)) continue;
            if (lateralOnly) {
                // 只保留能把短轴撑开的格
                if (spec.aniso === 'x' && y >= bb.minY && y <= bb.maxY) continue;
                if (spec.aniso === 'y' && x >= bb.minX && x <= bb.maxX) continue;
            }
            let L = layers.get(n);
            if (!L) { L = []; layers.set(n, L); }
            const s = sectorOf(cx, cy, x, y);
            let bucket = L[s];
            if (!bucket) { bucket = []; L[s] = bucket; }
            bucket.push({ idx, d: Math.max(Math.abs(x - cx), Math.abs(y - cy)) });
        }

        const keys = [...layers.keys()].sort((a, b) => (regime === 'dendrite' ? a - b : b - a));
        const order = [];
        for (const k of keys) {
            const buckets = layers.get(k);
            const active = [];
            for (let s = 0; s < 9; s++) {
                const b = buckets[s];
                if (!b || !b.length) continue;
                b.sort((p, q) => (p.d - q.d) || (p.idx - q.idx));
                active.push({ list: b, i: 0, left: b.length });
            }
            let remaining = active.reduce((n, a) => n + a.left, 0);
            while (remaining > 0) {
                for (const a of active) {
                    if (a.i >= a.list.length) continue;
                    order.push(a.list[a.i].idx);
                    a.i++; remaining--;
                }
            }
        }

        const cap = Math.max(0, Math.floor(world.conc / RULES.massPerCell));
        const take = Math.min(want, order.length, cap);
        for (let k = 0; k < take; k++) {
            const idx = order[k];
            grid[idx] = 1;
            age[idx] = world.t;
            world.boundary.delete(idx);
            world.conc -= RULES.massPerCell;
            world.cells++;
            const x = idx % cols, y = (idx - x) / cols;
            for (const [dx, dy] of N8) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                world.n8[ny * cols + nx]++;
            }
            if (x < bb.minX) bb.minX = x;
            if (x > bb.maxX) bb.maxX = x;
            if (y < bb.minY) bb.minY = y;
            if (y > bb.maxY) bb.maxY = y;
            for (const [dx, dy] of N8) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                const ni = ny * cols + nx;
                if (grid[ni] === 0) world.boundary.add(ni);
            }
        }
    }
    world.history.push({ t: world.t, T, S, cells: world.cells, regime });
    if (world.t >= spec.tMax) {
        world.state = 'done';
        world.m = metricsOf(world);
        world.habit = classify(world.m);
        world.quality = world.habit ? qualityOf(world.m, world.habit) : 0;
    }
    return world;
}

/** 跑完一整条曲线（求解器 / 校验器用；页面用逐帧版） */
export function simulate(spec, anchors, stirs, seedKey) {
    const w = createWorld(spec, seedKey);
    w.anchors = anchors || [];
    w.stirs = stirs || [];
    while (w.state !== 'done' && w.t < spec.tMax) stepWorld(w, w.anchors, w.stirs);
    return w;
}

/* ────────────────────────── 度量 ────────────────────────── */

export function metricsOf(world) {
    const { cols, rows, grid } = world;
    let cells = 0, minX = cols, maxX = -1, minY = rows, maxY = -1;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (!grid[y * cols + x]) continue;
            cells++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (!cells) return { cells: 0, w: 0, h: 0, minor: 0, fill: 0, aspect: 1, sym: 0, tips: 0, thickness: 0 };
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const minor = Math.min(w, h);
    const fill = cells / (w * h);
    const aspect = Math.max(w, h) / Math.max(1, minor);
    const thickness = cells / Math.max(w, h);

    // tips：只有一个晶体邻居的空格（枝晶的芽）
    let tips = 0;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (grid[y * cols + x]) continue;
            let n = 0;
            for (const [dx, dy] of N8) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                if (grid[ny * cols + nx]) n++;
            }
            if (n === 1) tips++;
        }
    }

    // 4 折对称度：关于 bbox 的竖直 / 水平中轴做镜像，取 Jaccard 交集率
    const inB = (x, y) => (x >= 0 && y >= 0 && x < cols && y < rows && !!grid[y * cols + x]);
    let inter = 0, union = 0;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const a = inB(x, y);
            const mx = minX + maxX - x, my = minY + maxY - y;
            const bv = inB(mx, y), bv2 = inB(x, my);
            if (a || bv) { union++; if (a && bv) inter++; }
            if (a || bv2) { union++; if (a && bv2) inter++; }
        }
    }
    const sym = union ? inter / union : 0;
    return { cells, w, h, minor, fill, aspect, sym, tips, thickness };
}

/* ────────────────────────── 通关判定 ────────────────────────── */

/**
 * 玩家方案的成本：锚点数 + 搅拌次数（asc，越小越聪明）。
 * 求解器现算 par 时用的也是这个 —— 两边必须同一把尺子。
 */
export function costOf(anchors, stirs) {
    return (anchors ? anchors.length : 0) + (stirs ? stirs.length : 0);
}

/**
 * 通关 = 冷却到位（tChill 前降到 tEndMax 以下）+ 晶形对 + 尺寸够。
 * 晶形「够不够标准」（quality）不是通关门槛，是第三星 —— 否则关卡会因为
 * 一个刁钻的质量阈值直接变成死局（needle 档实测最高只有 0.85 左右）。
 */
export function evaluate(spec, world) {
    const anchors = world.anchors || [];
    const lastT = anchors.length ? anchors[anchors.length - 1].T : spec.t0;
    const tEndMin = spec.tEndMin === undefined ? RULES.tRange[0] : spec.tEndMin;
    const chilled = sampleCurve(spec, anchors, spec.tChill) <= spec.tEndMax + 1e-9;
    // ⚠️ 终温是**区间**不是上界。只给上界时求解器永远选最冷的那一档
    //    （20 关里十几关的解都是「3→10」），关卡之间毫无区分度。
    const endOk = lastT <= spec.tEndMax + 1e-9 && lastT >= tEndMin - 1e-9;
    const shapeOk = world.habit === spec.target;
    const sizeOk = world.cells >= spec.minCells;
    return {
        chilled, endOk, shapeOk, sizeOk, lastT,
        pass: chilled && endOk && shapeOk && sizeOk,
    };
}

/* ────────────────────────── 关卡 ────────────────────────── */

/**
 * 20 关。par 由 scratch/cb-levels-gen.mjs（求解器）现算写入，**绝不手填**；
 * scripts/verify-crystal-bloom-levels.mjs 会用同一把尺子复核每一关。
 *
 * 关卡 = 终温窗口 [tEndMin, tEndMax] × 急冷时限 tChill × 目标晶形 × 最小尺寸。
 * 终温必须给**区间**：只给上界时求解器一律选最冷的解，20 关里十几关的答案都会
 * 是「一步降到 10℃」，关卡之间毫无区分度。
 * 另外八面体只能长在终温 30–56 这一段（见 cb4 上方注释）。
 */
export const LEVELS = [
    {
        id: 'cb1',
        name: { en: 'First Frost', zh: '初霜' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'blocky', tEndMax: 70, tEndMin: 55, tChill: 90, minCells: 150, minQuality: 0.92,
        par: 1, tipKey: 'tipSlow',
    },
    {
        id: 'cb2',
        name: { en: 'Slow Draw', zh: '慢抽' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'blocky', tEndMax: 58, tEndMin: 42, tChill: 90, minCells: 250, minQuality: 0.92,
        par: 1, tipKey: null,
    },
    {
        id: 'cb3',
        name: { en: 'Deep Fill', zh: '厚积' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'blocky', tEndMax: 45, tEndMin: 32, tChill: 90, minCells: 350, minQuality: 0.92,
        par: 1, tipKey: null,
    },
    // ⚠️ 八面体在暖温区（终温 ≥ 50℃）物理上长不出来：C/Csat 够不到 1.22 的中档
    //    下界，一路 blocky 长到底。八面体关卡的终温窗口必须落在 30–56 这一段。
    {
        id: 'cb4',
        name: { en: 'The Facet', zh: '晶面' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'octa', tEndMax: 52, tEndMin: 40, tChill: 70, minCells: 280, minQuality: 0.78,
        par: 1, tipKey: 'tipMid',
    },
    {
        id: 'cb5',
        name: { en: 'Rhomb', zh: '菱影' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'octa', tEndMax: 46, tEndMin: 34, tChill: 55, minCells: 380, minQuality: 0.84,
        par: 1, tipKey: null,
    },
    {
        id: 'cb6',
        name: { en: 'Frost Fern', zh: '霜蕨' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'dendrite', tEndMax: 35, tEndMin: 26, tChill: 45, minCells: 400, minQuality: 0.92,
        par: 1, tipKey: 'tipFast',
    },
    {
        id: 'cb7',
        name: { en: 'Quench', zh: '淬火' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'dendrite', tEndMax: 28, tEndMin: 20, tChill: 25, minCells: 500, minQuality: 0.92,
        par: 1, tipKey: null,
    },
    {
        id: 'cb8',
        name: { en: 'Spike', zh: '针尖' },
        t0: 88, tMax: 90, seed: 'square', aniso: 'x', maxAspect: 9,
        target: 'needle', tEndMax: 32, tEndMin: 22, tChill: 40, minCells: 60, minQuality: 0.84,
        par: 1, tipKey: 'tipSpike',
    },
    {
        id: 'cb9',
        name: { en: 'Frost Bloom', zh: '霜花' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'dendrite', tEndMax: 22, tEndMin: 15, tChill: 18, minCells: 550, minQuality: 0.84,
        par: 1, tipKey: null,
    },
    {
        id: 'cb10',
        name: { en: 'Against the Chill', zh: '逆寒' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'blocky', tEndMax: 25, tEndMin: 16, tChill: 15, minCells: 400, minQuality: 0.90,
        par: 2, tipKey: 'tipStir',
    },
    {
        id: 'cb11',
        name: { en: 'Facet in Ice', zh: '冰晶面' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'octa', tEndMax: 25, tEndMin: 16, tChill: 15, minCells: 450, minQuality: 0.88,
        par: 2, tipKey: null,
    },
    {
        id: 'cb12',
        name: { en: 'Deep Freeze', zh: '深冷' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'dendrite', tEndMax: 16, tEndMin: 11, tChill: 10, minCells: 650, minQuality: 0.80,
        par: 1, tipKey: null,
    },
    {
        id: 'cb13',
        name: { en: 'Upright', zh: '竖针' },
        t0: 88, tMax: 90, seed: 'square', aniso: 'y', maxAspect: 8,
        target: 'needle', tEndMax: 25, tEndMin: 17, tChill: 22, minCells: 70, minQuality: 0.88,
        par: 1, tipKey: null,
    },
    {
        id: 'cb14',
        name: { en: 'Cold Forge', zh: '冷锻' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'blocky', tEndMax: 18, tEndMin: 12, tChill: 10, minCells: 450, minQuality: 0.82,
        par: 2, tipKey: null,
    },
    {
        id: 'cb15',
        name: { en: 'Facet Forge', zh: '锻面' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'octa', tEndMax: 18, tEndMin: 12, tChill: 10, minCells: 500, minQuality: 0.88,
        par: 2, tipKey: null,
    },
    {
        id: 'cb16',
        name: { en: 'Limit', zh: '极限' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'dendrite', tEndMax: 14, tEndMin: 10, tChill: 8, minCells: 750, minQuality: 0.80,
        par: 1, tipKey: null,
    },
    {
        id: 'cb17',
        name: { en: 'Twin Spike', zh: '双针' },
        t0: 88, tMax: 90, seed: 'square', aniso: 'x', maxAspect: 7,
        target: 'needle', tEndMax: 20, tEndMin: 13, tChill: 15, minCells: 58, minQuality: 0.92,
        par: 1, tipKey: null,
    },
    {
        id: 'cb18',
        name: { en: 'Sealed', zh: '冰封' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'blocky', tEndMax: 14, tEndMin: 10, tChill: 6, minCells: 500, minQuality: 0.88,
        par: 3, tipKey: null,
    },
    {
        id: 'cb19',
        name: { en: 'Hoar', zh: '霜晶' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'dendrite', tEndMax: 12, tEndMin: 10, tChill: 6, minCells: 800, minQuality: 0.80,
        par: 1, tipKey: null,
    },
    {
        id: 'cb20',
        name: { en: 'Bloom', zh: '晶绽' },
        t0: 88, tMax: 90, seed: 'square', aniso: null, maxAspect: 0,
        target: 'octa', tEndMax: 14, tEndMin: 10, tChill: 5, minCells: 520, minQuality: 0.88,
        par: 2, tipKey: 'tipCrown',
    },
];

export function starsForLevel(cost, par, matched, quality, q3) {
    if (!matched) return 0;
    let stars = 1;
    if (cost <= par) stars++;
    if (quality >= (q3 === undefined ? 0.72 : q3)) stars++;
    return stars;
}

export function dailyCourse(dateKey) {
    // 与 maxwell-demon 同构：先按日期洗牌取 5 关，再按 par 升序排（由易到难）
    const rng = mulberry32(hashStringFNV('crystal-bloom-' + dateKey));
    const idx = LEVELS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    const n = Math.min(DAILY_COUNT, idx.length);
    return idx.slice(0, n)
        .sort((a, b) => LEVELS[a].par - LEVELS[b].par)
        .map(i => LEVELS[i]);
}
