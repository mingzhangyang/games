/**
 * Lumen 折光 — 解空间分析（纯模块；每日出题、校验器与关卡生成器共用）
 * ================================================================
 * 一个「单元」= 一次点击会翻转的镜面集合（联动组整组，或单面镜）。
 * 盘面状态 = 相对解态的单元翻转位掩码（mask 0 = 解态），点击 = 异或一位，
 * 所以从 A 到 B 的最少点击数就是 popcount(A ^ B)，与点击顺序无关。
 *
 * 2^u 全枚举（u ≤ 14）后，所有指标都是查表：
 *   par        初盘到最近可解态的距离（真·最少点击数）
 *   nearest    距离 = par 的可解态个数（=1 才是「最优解唯一」）
 *   foresight  沿最优解的所有点击顺序里，至少有几步看不到进度（亮水晶 − 亮暗晶 不增）
 *              ——0 表示「哪面镜让亮的变多就点哪面」一路点到底，即旧版每一关的样子
 *   greedy     贪心机器人（每步点进度最高的单元，平局随机，不立刻撤销）
 *              par 步内通关的比例 atPar、par+2 步内的比例 within2
 */

import { GRID_N, isMirror, flipCells, progressOf, traceGrid } from './beam.js';

const MAX_UNITS = 14;

/** 单元列表：行序遍历镜面，联动组整组成一个单元（按组内最小 idx 定序） */
export function unitsOf(level) {
    const units = [];
    const taken = new Set();
    for (let idx = 0; idx < GRID_N * GRID_N; idx++) {
        const r = Math.floor(idx / GRID_N), c = idx % GRID_N;
        if (taken.has(idx) || !isMirror(level.sol[r][c])) continue;
        const group = (level.links || []).find(g => g.includes(idx));
        const cells = group ? group.slice().sort((a, b) => a - b) : [idx];
        cells.forEach(i => taken.add(i));
        units.push(cells);
    }
    return units;
}

/** 盘面 → 相对解态的单元掩码（单元首格与解态不同即视为已翻转） */
export function maskOfGrid(units, sol, grid) {
    let mask = 0;
    units.forEach((cells, i) => {
        const idx = cells[0];
        const r = Math.floor(idx / GRID_N), c = idx % GRID_N;
        if (grid[r][c] !== sol[r][c]) mask |= 1 << i;
    });
    return mask;
}

export function gridOfMask(units, sol, mask) {
    const cells = [];
    units.forEach((u, i) => { if (mask & (1 << i)) cells.push(...u); });
    return cells.length ? flipCells(sol, cells) : sol;
}

export function popcount(m) {
    let n = 0;
    while (m) { m &= m - 1; n++; }
    return n;
}

/**
 * 全枚举解空间。返回 { units, size, solved: Uint8Array, progress: Int8Array, hits: Uint16Array }
 *   hits[mask] —— 该状态下被光击中的单元位掩码（判断诱饵镜是否「有戏份」）
 */
export function solveSpace(level) {
    const units = unitsOf(level);
    if (units.length > MAX_UNITS) throw new Error(`lumen: 单元数 ${units.length} 超过 ${MAX_UNITS}`);
    const size = 1 << units.length;
    const split = new Set(level.split || []);
    const unitOfCell = new Map();
    units.forEach((cells, i) => cells.forEach(idx => unitOfCell.set(idx, i)));
    const solved = new Uint8Array(size);
    const progress = new Int8Array(size);
    const hits = new Uint16Array(size);
    for (let mask = 0; mask < size; mask++) {
        const t = traceGrid(gridOfMask(units, level.sol, mask), split);
        solved[mask] = t.solved ? 1 : 0;
        progress[mask] = progressOf(t);
        let h = 0;
        for (const idx of t.mirrorHits) h |= 1 << unitOfCell.get(idx);
        hits[mask] = h;
    }
    return { units, size, solved, progress, hits };
}

/** 从 mask 出发最近的可解态：{ dist, masks } */
export function nearestSolutions(space, from) {
    let dist = Infinity;
    let masks = [];
    for (let m = 0; m < space.size; m++) {
        if (!space.solved[m]) continue;
        const d = popcount(m ^ from);
        if (d < dist) { dist = d; masks = [m]; } else if (d === dist) masks.push(m);
    }
    return { dist, masks };
}

/**
 * 预见步数：把 from → to 的差异位逐个点掉，所有顺序里「点完这一步进度不涨」的最少次数。
 * 子集 DP：数值递增序保证 sub 先于 sub|bit 计算。
 */
export function foresight(space, from, to) {
    const diff = from ^ to;
    if (diff === 0) return 0;
    const best = new Map([[0, 0]]);
    const bits = [];
    for (let i = 0; i < space.units.length; i++) if (diff & (1 << i)) bits.push(1 << i);
    // (sub - diff) & diff 按数值升序走遍 diff 的全部子集
    for (let sub = 0; ; sub = (sub - diff) & diff) {
        const cur = best.get(sub);   // 升序遍历：sub 的所有前驱都已算过
        const here = space.progress[from ^ sub];
        for (const b of bits) {
            if (sub & b) continue;
            const next = sub | b;
            const cost = cur + (space.progress[from ^ next] > here ? 0 : 1);
            const prev = best.get(next);
            if (prev === undefined || cost < prev) best.set(next, cost);
        }
        if (sub === diff) break;
    }
    return best.get(diff);
}

/** 确定性 PRNG（只给机器人用；每日种子另用 platform/daily.js 的 mulberry32） */
function lcg(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** 贪心机器人通关率：每步点进度最高的单元（平局随机、不立刻撤销上一步） */
export function greedyRates(space, from, par, { runs = 64, seed = 7 } = {}) {
    const rand = lcg(seed);
    const u = space.units.length;
    let atPar = 0;
    let within2 = 0;
    for (let run = 0; run < runs; run++) {
        let m = from;
        let last = -1;
        for (let step = 1; step <= par + 2; step++) {
            let best = -Infinity;
            const picks = [];
            for (let i = 0; i < u; i++) {
                if (i === last) continue;
                const p = space.progress[m ^ (1 << i)];
                if (p > best) { best = p; picks.length = 0; picks.push(i); } else if (p === best) picks.push(i);
            }
            const i = picks[Math.floor(rand() * picks.length)];
            m ^= 1 << i;
            last = i;
            if (space.solved[m]) {
                if (step <= par) atPar++;
                within2++;
                break;
            }
        }
    }
    return { atPar: atPar / runs, within2: within2 / runs };
}

/** 已枚举的解空间里，从 from 出发的体检（generator 复用同一个 space 反复试初盘） */
export function analyzeMasks(space, from, opts) {
    const near = nearestSolutions(space, from);
    let solutions = 0;
    for (let m = 0; m < space.size; m++) solutions += space.solved[m];
    const target = near.masks.length === 1 ? near.masks[0] : null;
    const goal = target === null ? (near.masks[0] ?? 0) : target;
    let idle = 0;
    for (let i = 0; i < space.units.length; i++) {
        // 诱饵是否有戏份：在初盘、解态或任一「一步之遥」的状态里被光碰到
        const bit = 1 << i;
        let touched = (space.hits[from] & bit) || (space.hits[goal] & bit);
        for (let j = 0; !touched && j < space.units.length; j++) {
            touched = (space.hits[from ^ (1 << j)] & bit) || (space.hits[goal ^ (1 << j)] & bit);
        }
        if (!touched) idle++;
    }
    return {
        units: space.units.length,
        startSolved: !!space.solved[from],
        par: near.dist,
        nearest: near.masks.length,
        solutions,
        foresight: target === null ? 0 : foresight(space, from, target),
        greedy: greedyRates(space, from, near.dist, opts),
        idle,
        from,
        target,
    };
}

/** 一关的完整体检（校验器与生成器用） */
export function analyzeLevel(level, opts) {
    const space = solveSpace(level);
    const from = maskOfGrid(space.units, level.sol, level.grid);
    return {
        ...analyzeMasks(space, from, opts),
        mirrors: space.units.reduce((a, cells) => a + cells.length, 0),
        space,
    };
}

/**
 * 每日打乱：用 rng 在解态周围抽初盘，要求 par ∈ [parMin, parMax]、最优解唯一、
 * 初盘不可解、预见步数 ≥ minForesight。达标即返回；attempts 次内都不达标则返回
 * 最好的一个（校验器全日期扫描锁定「总能达标」）。
 */
export function scramble(space, rng, { parMin = 4, parMax = 6, minForesight = 1, attempts = 400 } = {}) {
    const u = space.units.length;
    let fallback = null;
    for (let a = 0; a < attempts; a++) {
        let mask = 0;
        for (let i = 0; i < u; i++) if (rng() < 0.5) mask |= 1 << i;
        if (space.solved[mask]) continue;
        const near = nearestSolutions(space, mask);
        if (near.masks.length !== 1 || near.dist < 2) continue;
        const fs = foresight(space, mask, near.masks[0]);
        const cand = { mask, target: near.masks[0], par: near.dist, foresight: fs };
        if (near.dist >= parMin && near.dist <= parMax && fs >= minForesight) return { ...cand, ok: true };
        if (!fallback || cand.foresight > fallback.foresight
            || (cand.foresight === fallback.foresight && cand.par > fallback.par)) fallback = cand;
    }
    if (!fallback) throw new Error('lumen: scramble 找不到任何不可解的初盘');
    return { ...fallback, ok: false };
}
