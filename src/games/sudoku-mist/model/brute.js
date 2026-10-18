/**
 * 位运算回溯求解器：唯一解校验、解数计数、随机终盘。
 * 只做「真值」用途（出题时保证唯一解、运行时求终盘），不参与推理评分 ——
 * 评分只看 techniques.js 的人类技巧梯。
 */
import { CELLS, PEERS, ALL, bit, popcount } from './grid.js';

function candidatesOf(g, i) {
    let used = 0;
    for (const p of PEERS[i]) if (g[p]) used |= bit(g[p]);
    return ALL & ~used;
}

/**
 * 回溯搜索。每次选候选最少的空格（MRV）；order(mask) 决定尝试数字的顺序。
 * onSolution(grid) 返回 true 时停止。
 */
function search(g, order, onSolution) {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < CELLS; i++) {
        if (g[i]) continue;
        const m = candidatesOf(g, i);
        const n = popcount(m);
        if (n === 0) return false;
        if (n < bestCount) {
            best = i; bestMask = m; bestCount = n;
            if (n === 1) break;
        }
    }
    if (best < 0) return onSolution(g);
    for (const d of order(bestMask)) {
        g[best] = d;
        if (search(g, order, onSolution)) return true;
    }
    g[best] = 0;
    return false;
}

const ascending = m => {
    const out = [];
    for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d);
    return out;
};

/** 解的个数，数到 limit 就停（默认 2：只关心「唯一」与否） */
export function countSolutions(grid, limit = 2) {
    const g = Int8Array.from(grid);
    let count = 0;
    search(g, ascending, () => ++count >= limit);
    return count;
}

/** 任意一个解（按升序搜索的第一个）；无解返回 null */
export function solve(grid) {
    const g = Int8Array.from(grid);
    let out = null;
    search(g, ascending, sol => { out = Int8Array.from(sol); return true; });
    return out;
}

/** 由 rng（mulberry32）生成一个完整终盘 */
export function randomSolution(rng) {
    const shuffled = m => {
        const ds = ascending(m);
        for (let k = ds.length - 1; k > 0; k--) {
            const j = Math.floor(rng() * (k + 1));
            [ds[k], ds[j]] = [ds[j], ds[k]];
        }
        return ds;
    };
    const g = new Int8Array(CELLS);
    let out = null;
    search(g, shuffled, sol => { out = Int8Array.from(sol); return true; });
    return out;
}
