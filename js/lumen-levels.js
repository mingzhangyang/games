/**
 * Lumen 折光 — 关卡数据与光束追踪
 * ================================
 * 纯模块：无 DOM、无 window，浏览器与 scripts/verify-lumen-levels.mjs 共用。
 *
 * 网格 9×9，字符语义：
 *   '.'  空地（可被光穿过并点亮轨迹）
 *   '#'  墙（挡光，光在此终止）
 *   '*'  水晶（光穿过即点亮，不改变方向）——点亮全部水晶即过关
 *   '/' '\' 镜面（可点击的两态元件：点击在两态间翻转）
 *   '>' 'v' '<' '^'  发射器（固定不动的光源，同时挡光）
 *
 * 反射表（屏幕坐标，行向下增长；与 docs/contracts 与校验器黄金断言一致，勿单方面改）：
 *   '/' ： > → ^    ^ → >    v → <    < → v
 *   '\' ： > → v    v → >    ^ → <    < → ^
 *
 * 关卡数据形态：spec = { e: [[r,c,ch]] 发射器, m: [[r,c,ch]] 镜面（解态朝向）,
 *                        k: [[r,c]] 水晶, w: [[r,c]] 墙, flip: [[r,c]] 初盘翻转 }
 *   sol  = buildGrid(spec)          解态
 *   grid = buildGrid(spec, flip)    初盘（par = flip.length）
 * 坐标全部集中管理、由 buildGrid 程序化渲染，避免手抄 9 字符串的转录错误；
 * 解态可解性 / 初盘不可解性由 scripts/verify-lumen-levels.mjs 锁定。
 *
 * 每日谜题：16 布局池 × FNV-1a('lumen-' + UTC+8 日期) 选关 × mulberry32 打乱初盘。
 * 全球同题、确定性可复现；⚠️ hashStringFNV 来自 js/daily.js（兼容铁律，勿改算法）。
 */

import { hashStringFNV, mulberry32 } from './daily.js';

export const GRID_N = 9;

const REFLECT = {
    '/': { '>': '^', '^': '>', 'v': '<', '<': 'v' },
    '\\': { '>': 'v', 'v': '>', '^': '<', '<': '^' },
};
const STEP = { '>': [0, 1], 'v': [1, 0], '<': [0, -1], '^': [-1, 0] };
const MIRROR_SWAP = { '/': '\\', '\\': '/' };

/* ────────────────────────── 网格构建 ────────────────────────── */

function emptyGrid() {
    return Array.from({ length: GRID_N }, () => Array(GRID_N).fill('.'));
}

/**
 * spec → 9×9 字符网格（字符串数组）。flipCoords 中的镜面做两态翻转。
 * 坐标越界 / 重叠 / 翻转目标不是镜面 → throw（数据缺陷在导入期即暴露）。
 */
export function buildGrid(spec, flipCoords) {
    const flips = flipCoords === undefined ? (spec.flip || null) : flipCoords;
    const g = emptyGrid();
    const put = (r, c, ch, what) => {
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= GRID_N || c < 0 || c >= GRID_N) {
            throw new Error(`lumen-levels: ${what} 越界 (${r},${c})`);
        }
        if (g[r][c] !== '.') throw new Error(`lumen-levels: ${what} (${r},${c}) 与 '${g[r][c]}' 重叠`);
        g[r][c] = ch;
    };
    (spec.w || []).forEach(([r, c]) => put(r, c, '#', 'wall'));
    (spec.k || []).forEach(([r, c]) => put(r, c, '*', 'crystal'));
    (spec.m || []).forEach(([r, c, ch]) => put(r, c, ch, 'mirror'));
    (spec.e || []).forEach(([r, c, ch]) => put(r, c, ch, 'emitter'));
    if (flips) {
        for (const [r, c] of flips) {
            if (!MIRROR_SWAP[g[r][c]]) throw new Error(`lumen-levels: flip (${r},${c}) 不是镜面`);
            g[r][c] = MIRROR_SWAP[g[r][c]];
        }
    }
    return g.map(row => row.join(''));
}

function applyFlips(grid, flips) {
    const g = grid.map(row => row.split(''));
    for (const [r, c] of flips) {
        if (!MIRROR_SWAP[g[r][c]]) throw new Error(`lumen-levels: flip (${r},${c}) 不是镜面`);
        g[r][c] = MIRROR_SWAP[g[r][c]];
    }
    return g.map(row => row.join(''));
}

/** 行序镜面坐标列表（[[r,c], …]，供每日打乱与渲染高亮） */
export function mirrorCoords(grid) {
    const out = [];
    for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
            const ch = grid[r][c];
            if (ch === '/' || ch === '\\') out.push([r, c]);
        }
    }
    return out;
}

/* ────────────────────────── 光束追踪 ────────────────────────── */

/**
 * 追踪所有光束。返回：
 *   lit          Uint8Array(81) —— 光经过的格子
 *   litCount     点亮格子数
 *   crystalCount 水晶总数
 *   crystalLit   已点亮水晶 idx 列表（升序去重）
 *   mirrorHits   被光击中的镜面 idx 列表（渲染发光用）
 *   solved       全部水晶点亮（且至少有一颗水晶）
 *   rays         [{ pts: [[r,c], …] }] 每束光的折线顶点（渲染用）
 * 防环：以 (格, 进入方向) 为状态去重，状态重复即终止该束光。
 */
export function traceGrid(grid) {
    const lit = new Uint8Array(GRID_N * GRID_N);
    const crystalSet = new Set();
    const mirrorSet = new Set();
    let crystalCount = 0;
    for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
            if (grid[r][c] === '*') crystalCount++;
        }
    }

    const rays = [];
    for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
            const start = grid[r][c];
            if (!(start in STEP)) continue;
            const pts = [[r, c]];
            const seen = new Set();
            let d = start, rr = r, cc = c;
            for (;;) {
                const dr = STEP[d][0], dc = STEP[d][1];
                const nr = rr + dr, nc = cc + dc;
                if (nr < 0 || nr >= GRID_N || nc < 0 || nc >= GRID_N) break;
                const k = (nr * GRID_N + nc) * 4 + '><v^'.indexOf(d);
                if (seen.has(k)) break;            // 环路：终止该束
                seen.add(k);
                const cell = grid[nr][nc];
                const idx = nr * GRID_N + nc;
                if (cell === '#' || (cell in STEP)) break;  // 墙 / 发射器挡光
                lit[idx] = 1;
                pts.push([nr, nc]);
                if (cell === '*') crystalSet.add(idx);
                else if (cell === '/' || cell === '\\') {
                    mirrorSet.add(idx);
                    d = REFLECT[cell][d];
                }
                rr = nr; cc = nc;
            }
            rays.push({ pts });
        }
    }

    const crystalLit = [...crystalSet].sort((a, b) => a - b);
    return {
        lit,
        litCount: lit.reduce((a, b) => a + b, 0),
        crystalCount,
        crystalLit,
        mirrorHits: [...mirrorSet].sort((a, b) => a - b),
        solved: crystalCount > 0 && crystalSet.size === crystalCount,
        rays,
    };
}

/* ────────────────────────── 20 手工关卡 ────────────────────────── */
/* 难度曲线：L1-2 单镜入门 → L3-9 双镜 + 墙 → L10-13 三/四镜 → L14 起双发射器 → L19-20 收官。 */

const LEVEL_SPECS = [
    // L1 一面镜子把光折向水晶
    { e: [[4, 0, '>']], m: [[4, 6, '/']], k: [[1, 6]], w: [], flip: [[4, 6]] },
    // L2 两面镜子的 L 形光路
    { e: [[0, 2, 'v']], m: [[5, 2, '\\'], [5, 6, '/']], k: [[2, 6]], w: [], flip: [[5, 2]] },
    // L3 折两道弯串起三颗水晶
    { e: [[0, 0, 'v']], m: [[6, 0, '\\'], [6, 7, '/']], k: [[3, 0], [6, 4], [1, 7]], w: [], flip: [[6, 0], [6, 7]] },
    // L4 上折 + 左折的 Z 形
    { e: [[8, 4, '^']], m: [[4, 4, '\\'], [4, 1, '/']], k: [[6, 4], [4, 3], [7, 1]], w: [], flip: [[4, 4], [4, 1]] },
    // L5 墙截断光路，被迫双折
    { e: [[0, 8, 'v']], m: [[6, 8, '/'], [6, 3, '\\']], k: [[4, 8], [6, 5], [4, 3], [2, 3]], w: [[1, 3]], flip: [[6, 8]] },
    // L6 双镜直角回折
    { e: [[4, 0, '>']], m: [[4, 7, '/'], [1, 7, '/']], k: [[4, 3], [2, 7]], w: [], flip: [[4, 7], [1, 7]] },
    // L7 沿墙走廊两连折
    { e: [[8, 0, '^']], m: [[2, 0, '/'], [2, 3, '/']], k: [[6, 0], [2, 2], [1, 3]], w: [[2, 5]], flip: [[2, 0], [2, 3]] },
    // L8 三镜蛇形
    { e: [[0, 4, 'v']], m: [[3, 4, '/'], [3, 1, '\\'], [1, 1, '/']], k: [[2, 4], [3, 2], [1, 3], [1, 5]], w: [], flip: [[3, 4], [3, 1], [1, 1]] },
    // L9 墙角收束
    { e: [[6, 8, '<']], m: [[6, 5, '\\'], [3, 5, '/']], k: [[6, 6], [4, 5], [3, 6]], w: [[3, 7]], flip: [[6, 5], [3, 5]] },
    // L10 三镜长蛇
    { e: [[8, 8, '^']], m: [[5, 8, '\\'], [5, 2, '/'], [7, 2, '/']], k: [[6, 8], [5, 5], [6, 2], [7, 1]], w: [], flip: [[5, 8], [5, 2], [7, 2]] },
    // L11 四镜框形（初盘已有一面就位）
    { e: [[0, 0, '>']], m: [[0, 6, '\\'], [4, 6, '/'], [4, 2, '\\'], [2, 2, '/']], k: [[1, 6], [2, 6], [4, 3], [2, 5]], w: [], flip: [[4, 6], [4, 2], [2, 2]] },
    // L12 墙间穿针（初盘撞墙）
    { e: [[4, 8, '<']], m: [[4, 6, '\\'], [1, 6, '\\'], [1, 4, '/']], k: [[4, 7], [3, 6], [3, 4]], w: [[4, 4], [6, 6]], flip: [[4, 6], [1, 6], [1, 4]] },
    // L13 四镜之字长廊
    { e: [[0, 8, 'v']], m: [[3, 8, '/'], [3, 4, '\\'], [1, 4, '/'], [1, 6, '\\']], k: [[2, 8], [3, 6], [2, 4], [6, 6], [7, 6]], w: [], flip: [[3, 8], [3, 4], [1, 4], [1, 6]] },
    // L14 双发射器登场（左束直射 + 右束两折）
    { e: [[4, 0, '>'], [0, 7, 'v']], m: [[3, 7, '/'], [3, 2, '\\']], k: [[4, 4], [2, 7], [3, 5], [1, 2]], w: [], flip: [[3, 7], [3, 2]] },
    // L15 双束共享水晶
    { e: [[0, 3, 'v'], [8, 5, '^']], m: [[6, 3, '/'], [4, 5, '\\'], [4, 1, '/']], k: [[2, 3], [6, 1], [5, 5]], w: [], flip: [[6, 3], [4, 5], [4, 1]] },
    // L16 四镜围墙绕行
    { e: [[8, 0, '^']], m: [[5, 0, '/'], [5, 4, '\\'], [7, 4, '/'], [7, 3, '\\']], k: [[6, 0], [5, 2], [6, 4], [3, 3]], w: [[5, 6], [7, 2]], flip: [[5, 0], [5, 4], [7, 4], [7, 3]] },
    // L17 五镜长蛇（初盘一面就位）
    { e: [[2, 0, '>']], m: [[2, 7, '\\'], [7, 7, '/'], [7, 1, '\\'], [1, 1, '/']], k: [[2, 4], [5, 7], [7, 4], [3, 1], [1, 3]], w: [], flip: [[7, 7], [7, 1], [1, 1]] },
    // L18 中心对称四镜
    { e: [[8, 4, '^']], m: [[4, 4, '/'], [4, 6, '\\'], [6, 6, '/'], [6, 2, '\\']], k: [[6, 4], [4, 5], [5, 6], [3, 2]], w: [[2, 4]], flip: [[4, 4], [6, 6], [6, 2]] },
    // L19 五镜回环之字（初盘一面就位）
    { e: [[0, 0, 'v']], m: [[7, 0, '\\'], [7, 5, '/'], [3, 5, '\\'], [3, 2, '/'], [5, 2, '\\']], k: [[4, 0], [7, 3], [6, 5], [3, 4], [5, 6]], w: [], flip: [[7, 5], [3, 5], [3, 2], [5, 2]] },
    // L20 收官：双发射器 + 五镜 + 五水晶
    { e: [[0, 0, '>'], [8, 8, '^']], m: [[0, 7, '\\'], [6, 7, '/'], [6, 1, '/'], [2, 8, '\\'], [2, 4, '\\']], k: [[3, 7], [6, 5], [7, 1], [6, 8], [1, 4]], w: [[1, 6], [4, 4]], flip: [[6, 7], [6, 1], [2, 8], [2, 4]] },
];

export const LUMEN_LEVELS = LEVEL_SPECS.map((spec, i) => {
    const sol = buildGrid(spec, null);
    const grid = buildGrid(spec, spec.flip);
    return { index: i, sol, grid, par: spec.flip.length };
});

/* ────────────────────────── 16 每日池布局 ────────────────────────── */
/* 只存解态 spec；初盘由 dailyLevel() 用日期种子确定性打乱。 */

const DAILY_SPECS = [
    // D1 单束三方折
    { e: [[0, 0, '>']], m: [[0, 6, '\\'], [6, 6, '/'], [6, 1, '/']], k: [[0, 3], [3, 6], [6, 4], [7, 1]], w: [[2, 2], [4, 4]] },
    // D2 四镜爬升
    { e: [[8, 0, '^']], m: [[5, 0, '/'], [5, 7, '/'], [2, 7, '\\'], [2, 2, '\\']], k: [[7, 0], [5, 3], [4, 7], [2, 4], [1, 2]], w: [] },
    // D3 对峙双束
    { e: [[0, 4, 'v'], [8, 4, '^']], m: [[3, 4, '/'], [3, 1, '\\'], [5, 4, '/'], [5, 7, '\\']], k: [[1, 4], [6, 4], [3, 3], [7, 7]], w: [] },
    // D4 单束五水晶
    { e: [[4, 0, '>']], m: [[4, 2, '/'], [1, 2, '/'], [1, 6, '\\'], [6, 6, '/']], k: [[4, 1], [2, 2], [1, 4], [6, 4], [6, 3]], w: [] },
    // D5 墙前折返
    { e: [[2, 8, '<']], m: [[2, 6, '/'], [5, 6, '/'], [5, 1, '\\']], k: [[2, 7], [4, 6], [5, 4], [3, 1]], w: [[2, 5]] },
    // D6 墙角三连折
    { e: [[0, 8, 'v']], m: [[1, 8, '/'], [1, 4, '/'], [4, 4, '/'], [4, 1, '\\']], k: [[2, 4], [1, 6], [4, 2], [1, 1]], w: [[2, 8]] },
    // D7 双束对称分裂
    { e: [[8, 4, '^'], [0, 4, 'v']], m: [[6, 4, '\\'], [6, 1, '/'], [2, 4, '\\'], [2, 7, '/']], k: [[7, 4], [1, 4], [6, 3], [2, 5], [7, 1]], w: [] },
    // D8 深度回折
    { e: [[4, 8, '<']], m: [[4, 5, '\\'], [1, 5, '/'], [1, 6, '\\'], [7, 6, '/'], [7, 2, '\\']], k: [[4, 7], [3, 5], [6, 6], [7, 4], [4, 2]], w: [[0, 5]] },
    // D9 单束九宫游走
    { e: [[6, 0, '>']], m: [[6, 4, '/'], [2, 4, '\\'], [2, 1, '/']], k: [[6, 2], [4, 4], [3, 4], [2, 3], [5, 1]], w: [] },
    // D10 双列穿梭
    { e: [[0, 2, 'v']], m: [[6, 2, '/'], [6, 1, '\\'], [1, 1, '/'], [1, 5, '\\'], [7, 5, '/']], k: [[3, 2], [5, 1], [1, 3], [3, 5], [7, 3]], w: [] },
    // D11 对角双束
    { e: [[0, 0, 'v'], [8, 8, '^']], m: [[7, 0, '\\'], [7, 6, '/'], [1, 6, '/'], [6, 8, '\\'], [6, 4, '\\'], [2, 4, '/']], k: [[3, 0], [7, 3], [4, 6], [1, 7], [7, 8], [6, 6], [5, 4], [2, 7]], w: [] },
    // D12 短柱双折
    { e: [[8, 2, '^']], m: [[5, 2, '/'], [5, 5, '\\'], [7, 5, '/'], [7, 1, '/']], k: [[6, 2], [5, 4], [6, 5], [7, 4]], w: [] },
    // D13 中心发射辐射
    { e: [[4, 4, '>']], m: [[4, 7, '/'], [1, 7, '\\'], [1, 2, '/']], k: [[4, 5], [3, 7], [1, 4], [2, 2], [4, 2], [6, 2]], w: [] },
    // D14 双束十字
    { e: [[0, 7, 'v'], [8, 0, '^']], m: [[3, 7, '/'], [3, 3, '\\'], [5, 0, '/'], [5, 5, '/'], [2, 5, '\\'], [2, 2, '\\']], k: [[1, 7], [3, 4], [2, 3], [6, 0], [5, 2], [4, 5], [2, 4]], w: [] },
    // D15 轻量三镜
    { e: [[2, 0, '>']], m: [[2, 3, '\\'], [6, 3, '/'], [6, 1, '\\']], k: [[2, 2], [4, 3], [5, 3], [3, 1]], w: [] },
    // D16 收官双束六镜
    { e: [[0, 5, 'v'], [8, 7, '^']], m: [[4, 5, '/'], [4, 2, '\\'], [1, 2, '/'], [1, 6, '\\'], [7, 6, '/'], [5, 7, '/']], k: [[2, 5], [4, 3], [1, 4], [6, 6], [7, 5], [7, 3], [6, 7]], w: [[4, 7]] },
];

export const DAILY_POOL = DAILY_SPECS.map(spec => {
    const sol = buildGrid(spec);
    return { sol, mirrors: mirrorCoords(sol) };
});

/**
 * 当日谜题（确定性，全球同题）。
 * 种子 = FNV-1a('lumen-' + dateKey)；dateKey 为 js/daily.js 的 UTC+8 紧凑日期。
 * 打乱：每面镜面 50% 概率翻转（行序消费 rng）；保底 ≥2 处翻转且初盘不可解，
 * 不足时按行序补翻。par = 翻转数。
 */
export function dailyLevel(dateKey) {
    const seed = hashStringFNV('lumen-' + dateKey);
    const rng = mulberry32(seed);
    const def = DAILY_POOL[seed % DAILY_POOL.length];
    const flips = def.mirrors.filter(() => rng() < 0.5);
    let pi = 0;
    const nextUnflipped = () => {
        while (pi < def.mirrors.length) {
            const m = def.mirrors[pi++];
            if (!flips.some(f => f[0] === m[0] && f[1] === m[1])) return m;
        }
        return null;
    };
    while (flips.length < 2 || traceGrid(applyFlips(def.sol, flips)).solved) {
        const m = nextUnflipped();
        if (!m) throw new Error('lumen-levels: daily guard exhausted for ' + dateKey);
        flips.push(m);
    }
    return {
        grid: applyFlips(def.sol, flips),
        sol: def.sol,
        par: flips.length,
        dateKey,
        layout: seed % DAILY_POOL.length,
    };
}
