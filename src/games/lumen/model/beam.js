/**
 * Lumen 折光 — 光束引擎（网格构建 / 光束追踪 / 点击翻转）
 * =====================================================
 * 纯模块：无 DOM、无 window，浏览器、solver.js 与校验器共用。
 *
 * 网格 9×9，字符语义：
 *   '.'  空地（可被光穿过并点亮轨迹）
 *   '#'  墙（挡光，光在此终止）
 *   '*'  水晶（光穿过即点亮，不改变方向）——点亮全部水晶即过关
 *   'x'  暗晶（光可以穿过，但被照到就不算过关——必须保持黑暗）
 *   '/' '\' 镜面（可点击的两态元件：点击在两态间翻转）
 *   '>' 'v' '<' '^'  发射器（固定不动的光源，同时挡光）
 *
 * 镜面的两种附加属性不进字符网格，而是挂在关卡对象上（字符只表达朝向）：
 *   split  分光镜格 idx 列表：光到此既按镜面反射、又直行穿过（一束变两束）
 *   links  联动组 [[idx, …], …]：同组镜面点任意一面，整组一起翻转
 *
 * 反射表（屏幕坐标，行向下增长；与校验器黄金断言一致，勿单方面改）：
 *   '/' ： > → ^    ^ → >    v → <    < → v
 *   '\' ： > → v    v → >    ^ → <    < → ^
 */

export const GRID_N = 9;

const DIRS = '><v^';
const DR = [0, 0, 1, -1];
const DC = [1, -1, 0, 0];
// 按方向下标（> < v ^）查反射后的方向下标
const REFLECT_SLASH = [3, 2, 1, 0];
const REFLECT_BACK = [2, 3, 0, 1];
const MIRROR_SWAP = { '/': '\\', '\\': '/' };
const EMPTY = new Set();

export const isMirror = ch => ch === '/' || ch === '\\';
export const isEmitter = ch => DIRS.includes(ch) && ch.length === 1;

/* ────────────────────────── 网格构建 ────────────────────────── */

function emptyGrid() {
    return Array.from({ length: GRID_N }, () => Array(GRID_N).fill('.'));
}

const idxOf = (r, c) => r * GRID_N + c;

/**
 * spec → 关卡对象。spec 字段（坐标全部 [r, c]，镜面朝向写「解态」）：
 *   e 发射器 [r,c,dir]   m 镜面 [r,c,'/'|'\\']   s 分光镜 [r,c,'/'|'\\']
 *   k 水晶   x 暗晶   w 墙   g 联动组 [[[r,c],…],…]
 *   tap 初盘：从解态出发点过的格子（每个按整组翻转），par = tap.length
 * 坐标越界 / 重叠 / 联动或点击目标不是镜面 / 同组重复点击 → throw（数据缺陷在导入期即暴露）。
 */
export function buildLevel(spec) {
    const g = emptyGrid();
    const put = (r, c, ch, what) => {
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= GRID_N || c < 0 || c >= GRID_N) {
            throw new Error(`lumen: ${what} 越界 (${r},${c})`);
        }
        if (g[r][c] !== '.') throw new Error(`lumen: ${what} (${r},${c}) 与 '${g[r][c]}' 重叠`);
        g[r][c] = ch;
    };
    (spec.w || []).forEach(([r, c]) => put(r, c, '#', 'wall'));
    (spec.k || []).forEach(([r, c]) => put(r, c, '*', 'crystal'));
    (spec.x || []).forEach(([r, c]) => put(r, c, 'x', 'shadow'));
    (spec.m || []).forEach(([r, c, ch]) => put(r, c, ch, 'mirror'));
    (spec.s || []).forEach(([r, c, ch]) => put(r, c, ch, 'splitter'));
    (spec.e || []).forEach(([r, c, ch]) => put(r, c, ch, 'emitter'));
    for (const row of g) {
        for (const ch of row) {
            if (!'.#*x/\\><v^'.includes(ch)) throw new Error(`lumen: 非法字符 '${ch}'`);
        }
    }
    const sol = g.map(row => row.join(''));

    const split = (spec.s || []).map(([r, c]) => idxOf(r, c));
    const grouped = new Set();
    const links = (spec.g || []).map(group => {
        if (!Array.isArray(group) || group.length < 2) throw new Error('lumen: 联动组至少 2 面镜');
        return group.map(([r, c]) => {
            const idx = idxOf(r, c);
            if (!isMirror(sol[r]?.[c])) throw new Error(`lumen: 联动 (${r},${c}) 不是镜面`);
            if (grouped.has(idx)) throw new Error(`lumen: (${r},${c}) 同时属于两个联动组`);
            grouped.add(idx);
            return idx;
        });
    });

    const level = { sol, split, links, grid: sol, par: 0 };
    let grid = sol;
    const tappedUnits = new Set();
    for (const [r, c] of spec.tap || []) {
        const cells = unitCells(level, idxOf(r, c));
        if (!cells || !isMirror(sol[r][c])) throw new Error(`lumen: tap (${r},${c}) 不是镜面`);
        const unitKey = Math.min(...cells);
        if (tappedUnits.has(unitKey)) throw new Error(`lumen: tap (${r},${c}) 与同组重复`);
        tappedUnits.add(unitKey);
        grid = flipCells(grid, cells);
    }
    level.grid = grid;
    level.par = tappedUnits.size;
    return level;
}

/** 兼容旧接口：spec → 字符网格（flipCoords 为逐格翻转，不看联动） */
export function buildGrid(spec, flipCoords) {
    const level = buildLevel({ ...spec, tap: [] });
    const flips = flipCoords === undefined ? (spec.flip || null) : flipCoords;
    return flips ? flipCells(level.sol, flips.map(([r, c]) => {
        if (!isMirror(level.sol[r][c])) throw new Error(`lumen: flip (${r},${c}) 不是镜面`);
        return idxOf(r, c);
    })) : level.sol;
}

/** 翻转一批镜面格（idx 列表），返回新网格 */
export function flipCells(grid, cells) {
    const g = grid.map(row => row.split(''));
    for (const idx of cells) {
        const r = Math.floor(idx / GRID_N), c = idx % GRID_N;
        const swapped = MIRROR_SWAP[g[r][c]];
        if (!swapped) throw new Error(`lumen: (${r},${c}) 不是镜面`);
        g[r][c] = swapped;
    }
    return g.map(row => row.join(''));
}

/** 点到 idx 时一起翻转的格子：所在联动组，或它自己；不是镜面返回 null */
export function unitCells(level, idx) {
    const r = Math.floor(idx / GRID_N), c = idx % GRID_N;
    if (!isMirror(level.sol[r]?.[c])) return null;
    for (const group of level.links || []) {
        if (group.includes(idx)) return group.slice();
    }
    return [idx];
}

/** 在当前盘面上点击 (r,c)：返回 { grid, cells }；不可点击返回 null */
export function tapGrid(level, grid, r, c) {
    if (!(r >= 0 && r < GRID_N && c >= 0 && c < GRID_N)) return null;   // 防 idx 越行回绕
    const cells = unitCells(level, idxOf(r, c));
    if (!cells) return null;
    return { grid: flipCells(grid, cells), cells };
}

/** 行序镜面坐标列表（[[r,c], …]） */
export function mirrorCoords(grid) {
    const out = [];
    for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
            if (isMirror(grid[r][c])) out.push([r, c]);
        }
    }
    return out;
}

/* ────────────────────────── 光束追踪 ────────────────────────── */

/**
 * 追踪所有光束（split = 分光镜 idx 列表 / Set，可省略）。返回：
 *   lit          Uint8Array(81) —— 光经过的格子
 *   litCount     点亮格子数
 *   crystalCount 水晶总数         crystalLit 已点亮水晶 idx（升序）
 *   shadowCount  暗晶总数         shadowLit  被照到的暗晶 idx（升序）
 *   mirrorHits   被光击中的镜面 idx（升序，渲染发光用）
 *   solved       全部水晶点亮、没有暗晶被照到（且至少有一颗水晶）
 *   rays         [{ pts: [[r,c], …] }] 每段光束的折线顶点（分光镜的反射支路单独成段）
 * 防环：所有光束共享 (格, 进入方向) 访问表，状态重复即终止该束——分光镜回环也必然终止。
 */
export function traceGrid(grid, split) {
    const splitSet = split instanceof Set ? split : (split && split.length ? new Set(split) : EMPTY);
    const lit = new Uint8Array(GRID_N * GRID_N);
    const seen = new Uint8Array(GRID_N * GRID_N * 4);
    const crystalSet = new Set();
    const shadowSet = new Set();
    const mirrorSet = new Set();
    let crystalCount = 0;
    let shadowCount = 0;
    const queue = [];
    for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
            const ch = grid[r][c];
            if (ch === '*') crystalCount++;
            else if (ch === 'x') shadowCount++;
            else if (isEmitter(ch)) queue.push({ r, c, d: DIRS.indexOf(ch), pts: [[r, c]] });
        }
    }

    const rays = [];
    for (let qi = 0; qi < queue.length; qi++) {
        const beam = queue[qi];
        let { r, c, d } = beam;
        const pts = beam.pts;
        for (;;) {
            const nr = r + DR[d], nc = c + DC[d];
            if (nr < 0 || nr >= GRID_N || nc < 0 || nc >= GRID_N) break;
            const idx = nr * GRID_N + nc;
            const key = idx * 4 + d;
            if (seen[key]) break;                       // 环路 / 重复光路：终止该束
            seen[key] = 1;
            const cell = grid[nr][nc];
            if (cell === '#' || isEmitter(cell)) break; // 墙 / 发射器挡光
            lit[idx] = 1;
            pts.push([nr, nc]);
            if (cell === '*') crystalSet.add(idx);
            else if (cell === 'x') shadowSet.add(idx);
            else if (cell === '/' || cell === '\\') {
                mirrorSet.add(idx);
                const nd = cell === '/' ? REFLECT_SLASH[d] : REFLECT_BACK[d];
                if (splitSet.has(idx)) queue.push({ r: nr, c: nc, d: nd, pts: [[nr, nc]] });
                else d = nd;
            }
            r = nr; c = nc;
        }
        rays.push({ pts });
    }

    const asc = set => [...set].sort((a, b) => a - b);
    let litCount = 0;
    for (let i = 0; i < lit.length; i++) litCount += lit[i];
    return {
        lit,
        litCount,
        crystalCount,
        crystalLit: asc(crystalSet),
        shadowCount,
        shadowLit: asc(shadowSet),
        mirrorHits: asc(mirrorSet),
        solved: crystalCount > 0 && crystalSet.size === crystalCount && shadowSet.size === 0,
        rays,
    };
}

/** 玩家肉眼可见的进度：亮着的水晶数 − 被照到的暗晶数（solver 的贪心机器人用它模拟「看着办」） */
export function progressOf(trace) {
    return trace.crystalLit.length - trace.shadowLit.length;
}
