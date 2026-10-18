/**
 * 雾隐九宫 Sudoku in the Mist — 网格基础（纯数据，无 DOM / Date / Math.random）
 * ===========================================================================
 * 81 格按行优先编号：i = r × 9 + c。数字 1..9 用 9 位掩码表示：digit d ↔ bit (d − 1)。
 * 单元（unit）共 27 个：0..8 行、9..17 列、18..26 宫。
 * 盘面统一用长度 81 的 Int8Array（0 = 未知）；字符串形式 '0' 或 '.' 表示空格。
 */

export const SIZE = 9;
export const CELLS = 81;
export const ALL = 0x1ff;

export const rowOf = i => (i / 9) | 0;
export const colOf = i => i % 9;
export const boxOf = i => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

export const UNIT_KIND = Object.freeze(['row', 'col', 'box']);
export const unitKind = u => UNIT_KIND[(u / 9) | 0];

/** UNITS[u] = 该单元的 9 个格子（升序） */
export const UNITS = Object.freeze(Array.from({ length: 27 }, (_, u) => {
    const k = u % 9;
    const cells = [];
    for (let j = 0; j < 9; j++) {
        if (u < 9) cells.push(k * 9 + j);
        else if (u < 18) cells.push(j * 9 + k);
        else cells.push((((k / 3) | 0) * 3 + ((j / 3) | 0)) * 9 + (k % 3) * 3 + (j % 3));
    }
    return Object.freeze(cells);
}));

/** CELL_UNITS[i] = [行单元, 列单元, 宫单元] */
export const CELL_UNITS = Object.freeze(Array.from({ length: CELLS }, (_, i) =>
    Object.freeze([rowOf(i), 9 + colOf(i), 18 + boxOf(i)])));

/** PEERS[i] = 与 i 同行 / 同列 / 同宫的其余 20 格 */
export const PEERS = Object.freeze(Array.from({ length: CELLS }, (_, i) => {
    const set = new Set();
    for (const u of CELL_UNITS[i]) for (const j of UNITS[u]) if (j !== i) set.add(j);
    return Object.freeze([...set].sort((a, b) => a - b));
}));

/** 热循环用的扁平表：UNIT_CELLS[u × 9 + j] = UNITS[u][j]；PEER_CELLS[i × 20 + k] = PEERS[i][k] */
export const UNIT_CELLS = Int8Array.from(UNITS.flat());
export const PEER_CELLS = Int8Array.from(PEERS.flat());
export const CELL_ROW = Int8Array.from({ length: CELLS }, (_, i) => rowOf(i));
export const CELL_COL = Int8Array.from({ length: CELLS }, (_, i) => colOf(i));
export const CELL_BOX = Int8Array.from({ length: CELLS }, (_, i) => boxOf(i));

export const bit = d => 1 << (d - 1);

export function popcount(m) {
    m -= (m >>> 1) & 0x5555;
    m = (m & 0x3333) + ((m >>> 2) & 0x3333);
    m = (m + (m >>> 4)) & 0x0f0f;
    return (m + (m >>> 8)) & 0x1f;
}

/** 单比特掩码 → 数字；多比特返回最低位对应的数字 */
export function digitOf(m) {
    return 32 - Math.clz32(m & -m);
}

export function digitsOf(m) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d);
    return out;
}

export function parseGrid(str) {
    if (typeof str !== 'string' || str.length !== CELLS) throw new Error('grid string must be 81 chars');
    const g = new Int8Array(CELLS);
    for (let i = 0; i < CELLS; i++) {
        const ch = str[i];
        if (ch === '.' || ch === '0') continue;
        const d = ch.charCodeAt(0) - 48;
        if (d < 1 || d > 9) throw new Error(`bad grid char ${ch} at ${i}`);
        g[i] = d;
    }
    return g;
}

export function formatGrid(g) {
    let s = '';
    for (let i = 0; i < CELLS; i++) s += g[i] ? String(g[i]) : '.';
    return s;
}

/** 已填数字之间是否存在冲突（不检查是否可解） */
export function isConsistent(g) {
    if (!g || g.length !== CELLS) return false;
    for (const cells of UNITS) {
        let seen = 0;
        for (const i of cells) {
            const d = g[i];
            if (!Number.isInteger(d) || d < 0 || d > 9) return false;
            if (!d) continue;
            if (seen & bit(d)) return false;
            seen |= bit(d);
        }
    }
    return true;
}

/** 两格的切比雪夫距离（揭雾核用） */
export function chebyshev(a, b) {
    return Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));
}
