/**
 * 人类技巧梯 T1–T4 与推导闭包（设计：docs/proposal-sudoku-mist-design.md §5.1 / §7.1）
 * ===========================================================================
 * 状态 = { values, cand }：values 是已知数字（0 = 未知），cand 是未知格的候选掩码。
 * 「同行 / 同列 / 同宫不能重复」这一层基础排除永远隐式生效（createState / place 时完成），
 * 不算任何档位。
 *
 * 每条技巧是一次「扫描」：在当前状态里找出所有实例并依次应用（应用前重新确认仍成立），
 * 返回本次扫描的改动数（落子 + 排除）。
 *
 * analyze(known, { cap }) 的闭包规则（档位判定的唯一口径）：
 *   反复从最低档开始尝试技巧；任何一条有改动，就回到第一条重新开始；
 *   全部 ≤ cap 的技巧都没有改动时停止。
 * 因为高一档只在低档全部无事可做时才会被尝试，所以「落子那一刻已经用到的最高档位」
 * 恰好等于「能推出这一格的最小 t」（只用 ≤ t 的技巧跑闭包就能推出它）——
 * 一次 cap = 4 的闭包就同时给出全部格子的档位。verify-sudoku-mist-model ④ 用逐档重跑核对这一点。
 */
import { CELLS, UNITS, UNIT_CELLS, PEER_CELLS, CELL_ROW, CELL_COL, CELL_BOX, ALL, bit, popcount, digitOf } from './grid.js';

export const MAX_TIER = 4;

export function createState(known) {
    const values = Int8Array.from(known);
    const cand = new Uint16Array(CELLS);
    const have = new Uint16Array(27);
    for (let i = 0; i < CELLS; i++) {
        const v = values[i];
        if (!v) continue;
        const b = 1 << (v - 1);
        have[CELL_ROW[i]] |= b;
        have[9 + CELL_COL[i]] |= b;
        have[18 + CELL_BOX[i]] |= b;
    }
    let broken = false;
    for (let i = 0; i < CELLS; i++) {
        if (values[i]) continue;
        cand[i] = ALL & ~(have[CELL_ROW[i]] | have[9 + CELL_COL[i]] | have[18 + CELL_BOX[i]]);
        if (!cand[i]) broken = true;
    }
    return { values, cand, broken };
}

/** 测试夹具用：直接给定 values + 候选掩码（不做基础排除） */
export function stateFromCandidates(values, cand) {
    return { values: Int8Array.from(values), cand: Uint16Array.from(cand), broken: false };
}

function place(s, i, d) {
    const b = bit(d);
    s.values[i] = d;
    s.cand[i] = 0;
    for (let k = i * 20, end = k + 20; k < end; k++) {
        const p = PEER_CELLS[k];
        if (s.values[p] || !(s.cand[p] & b)) continue;
        s.cand[p] &= ~b;
        if (!s.cand[p]) s.broken = true;
    }
}

/** 把 mask 从未知格 i 的候选里去掉；返回是否有改动 */
function eliminate(s, i, mask) {
    if (s.values[i] || !(s.cand[i] & mask)) return false;
    s.cand[i] &= ~mask;
    if (!s.cand[i]) s.broken = true;
    return true;
}

function tryPlace(s, i, d, onPlace, tech, unit) {
    if (s.values[i] || !(s.cand[i] & bit(d))) return 0;
    place(s, i, d);
    onPlace(i, d, tech, unit);
    return 1;
}

const noop = () => {};

/*
 * 每次扫描开始时算一次的单元掩码（同一次扫描内即使已过时也只会是「超集」，
 * 据此做的落子 / 排除仍然成立，所以不必每改一处就重算）：
 *   present[u]           单元 u 里已出现的数字
 *   pos[u × 9 + d − 1]   单元 u 里数字 d 的候选位置（第 j 位 = UNITS[u][j]）
 */
const present = new Uint16Array(27);
const pos = new Uint16Array(27 * 9);

function computeMasks(s) {
    pos.fill(0);
    for (let u = 0; u < 27; u++) {
        let have = 0;
        for (let j = 0; j < 9; j++) {
            const i = UNIT_CELLS[u * 9 + j];
            const v = s.values[i];
            if (v) { have |= bit(v); continue; }
            let m = s.cand[i];
            while (m) {
                const low = m & -m;
                pos[u * 9 + 31 - Math.clz32(low)] |= 1 << j;
                m ^= low;
            }
        }
        present[u] = have;
    }
}

const lowIndex = m => 31 - Math.clz32(m & -m);

/* ── T1 ─────────────────────────────────────────────── */

/** 唯一空位：单元里只剩一个未知格 */
function fullHouse(s, onPlace = noop) {
    let n = 0;
    for (let u = 0; u < 27; u++) {
        let last = -1, unknown = 0, have = 0;
        for (let j = u * 9, end = j + 9; j < end; j++) {
            const i = UNIT_CELLS[j];
            if (s.values[i]) have |= bit(s.values[i]);
            else { unknown++; last = i; }
        }
        if (unknown !== 1) continue;
        const m = ALL & ~have;
        if (popcount(m) === 1) n += tryPlace(s, last, digitOf(m), onPlace, 'fullHouse', u);
    }
    return n;
}

/** 隐性唯一：单元里某个数字只剩一个位置 */
function hiddenSingleIn(s, from, to, id, onPlace) {
    computeMasks(s);
    let n = 0;
    for (let u = from; u < to; u++) {
        for (let d = 1; d <= 9; d++) {
            if (present[u] & bit(d)) continue;
            const m = pos[u * 9 + d - 1];
            if (!m) { s.broken = true; continue; }
            if (!(m & (m - 1))) n += tryPlace(s, UNIT_CELLS[u * 9 + lowIndex(m)], d, onPlace, id, u);
        }
    }
    return n;
}

const hiddenSingleBox = (s, onPlace = noop) => hiddenSingleIn(s, 18, 27, 'hiddenSingleBox', onPlace);

/* ── T2 ─────────────────────────────────────────────── */

const hiddenSingleLine = (s, onPlace = noop) => hiddenSingleIn(s, 0, 18, 'hiddenSingleLine', onPlace);

/** 唯余数：格子只剩一个候选 */
function nakedSingle(s, onPlace = noop) {
    let n = 0;
    for (let i = 0; i < CELLS; i++) {
        const m = s.cand[i];
        if (!s.values[i] && m && !(m & (m - 1))) n += tryPlace(s, i, digitOf(m), onPlace, 'nakedSingle', -1);
    }
    return n;
}

/* ── T3 ─────────────────────────────────────────────── */

// 宫内位置 j（0..8）：行段 = j / 3，列段 = j % 3
const BOX_ROW = [0b000000111, 0b000111000, 0b111000000];
const BOX_COL = [0b001001001, 0b010010010, 0b100100100];
// 行 / 列内位置 j：所在宫段 = j / 3
const LINE_SEG = [0b000000111, 0b000111000, 0b111000000];

/** 区块排除（宫 → 行列）：宫内某数字的候选全在同一行 / 列 → 该行 / 列宫外的格子排除它 */
function pointing(s) {
    computeMasks(s);
    let n = 0;
    for (let b = 0; b < 9; b++) {
        const u = 18 + b;
        for (let d = 1; d <= 9; d++) {
            const m = pos[u * 9 + d - 1];
            if (!(m & (m - 1))) continue;
            let line = -1;
            for (let k = 0; k < 3; k++) {
                if (!(m & ~BOX_ROW[k])) line = ((b / 3) | 0) * 3 + k;
                else if (!(m & ~BOX_COL[k])) line = 9 + (b % 3) * 3 + k;
            }
            if (line < 0) continue;
            for (const i of UNITS[line]) if (CELL_BOX[i] !== b && eliminate(s, i, bit(d))) n++;
        }
    }
    return n;
}

/** 区块排除（行列 → 宫）：行 / 列里某数字的候选全在同一宫 → 该宫行 / 列外的格子排除它 */
function claiming(s) {
    computeMasks(s);
    let n = 0;
    for (let u = 0; u < 18; u++) {
        for (let d = 1; d <= 9; d++) {
            const m = pos[u * 9 + d - 1];
            if (!(m & (m - 1))) continue;
            let seg = -1;
            for (let k = 0; k < 3; k++) if (!(m & ~LINE_SEG[k])) seg = k;
            if (seg < 0) continue;
            const b = CELL_BOX[UNIT_CELLS[u * 9 + seg * 3]];
            for (const i of UNITS[18 + b]) {
                const inLine = u < 9 ? CELL_ROW[i] === u : CELL_COL[i] === u - 9;
                if (!inLine && eliminate(s, i, bit(d))) n++;
            }
        }
    }
    return n;
}

const subsetCells = new Int8Array(9);

/** 单元内 k 个未知格的候选并集恰为 k 个数字 → 单元其余格排除这些数字（k = 2 / 3） */
function nakedSubset(s, k) {
    let n = 0;
    for (let u = 0; u < 27; u++) {
        const cells = UNITS[u];
        let c = 0;
        for (let j = 0; j < 9; j++) {
            const i = cells[j];
            if (s.values[i]) continue;
            const p = popcount(s.cand[i]);
            if (p >= 2 && p <= k) subsetCells[c++] = j;
        }
        if (c < k) continue;
        for (let a = 0; a < c; a++) {
            for (let b = a + 1; b < c; b++) {
                const ab = s.cand[cells[subsetCells[a]]] | s.cand[cells[subsetCells[b]]];
                if (k === 2) {
                    if (popcount(ab) === 2) n += eliminateExcept(s, cells, (1 << subsetCells[a]) | (1 << subsetCells[b]), ab);
                    continue;
                }
                if (popcount(ab) > 3) continue;
                for (let e = b + 1; e < c; e++) {
                    const abe = ab | s.cand[cells[subsetCells[e]]];
                    if (popcount(abe) === 3) {
                        n += eliminateExcept(s, cells, (1 << subsetCells[a]) | (1 << subsetCells[b]) | (1 << subsetCells[e]), abe);
                    }
                }
            }
        }
    }
    return n;
}

/** 单元里 keep 位以外的未知格排除 digits */
function eliminateExcept(s, cells, keep, digits) {
    let n = 0;
    for (let j = 0; j < 9; j++) if (!(keep & (1 << j)) && eliminate(s, cells[j], digits)) n++;
    return n;
}

const subsetDigits = new Int8Array(9);

/** 单元内 k 个数字的位置并集恰为 k 格 → 这 k 格只保留这些数字（k = 2 / 3） */
function hiddenSubset(s, k) {
    computeMasks(s);
    let n = 0;
    for (let u = 0; u < 27; u++) {
        const cells = UNITS[u];
        let c = 0;
        for (let d = 1; d <= 9; d++) {
            if (present[u] & bit(d)) continue;
            const p = popcount(pos[u * 9 + d - 1]);
            if (p >= 2 && p <= k) subsetDigits[c++] = d;
        }
        if (c < k) continue;
        for (let a = 0; a < c; a++) {
            for (let b = a + 1; b < c; b++) {
                const da = subsetDigits[a], db = subsetDigits[b];
                const ab = pos[u * 9 + da - 1] | pos[u * 9 + db - 1];
                if (k === 2) {
                    if (popcount(ab) === 2) n += restrictTo(s, cells, ab, bit(da) | bit(db));
                    continue;
                }
                if (popcount(ab) > 3) continue;
                for (let e = b + 1; e < c; e++) {
                    const de = subsetDigits[e];
                    const abe = ab | pos[u * 9 + de - 1];
                    if (popcount(abe) === 3) n += restrictTo(s, cells, abe, bit(da) | bit(db) | bit(de));
                }
            }
        }
    }
    return n;
}

/** 单元里 where 位上的格子只保留 digits */
function restrictTo(s, cells, where, digits) {
    let n = 0;
    for (let j = 0; j < 9; j++) if ((where & (1 << j)) && eliminate(s, cells[j], ALL & ~digits)) n++;
    return n;
}

/* ── T4 ─────────────────────────────────────────────── */

/** X-Wing：某数字在两行里都只剩同样的两列（或两列都只剩同样的两行）→ 这两列（行）其余格排除它 */
function xWing(s) {
    computeMasks(s);
    let n = 0;
    for (let d = 1; d <= 9; d++) {
        for (const [base, cover] of [[0, 9], [9, 0]]) {
            for (let a = 0; a < 9; a++) {
                const ma = pos[(base + a) * 9 + d - 1];
                if (popcount(ma) !== 2) continue;
                for (let c = a + 1; c < 9; c++) {
                    if (pos[(base + c) * 9 + d - 1] !== ma) continue;
                    for (let j = 0; j < 9; j++) {
                        if (!(ma & (1 << j))) continue;
                        const line = UNITS[cover + j];
                        for (let k = 0; k < 9; k++) if (k !== a && k !== c && eliminate(s, line[k], bit(d))) n++;
                    }
                }
            }
        }
    }
    return n;
}

/** 技巧梯：顺序即闭包里的尝试顺序（同档内也固定，保证确定性） */
export const TECHNIQUES = Object.freeze([
    { id: 'fullHouse', tier: 1, apply: fullHouse },
    { id: 'hiddenSingleBox', tier: 1, apply: hiddenSingleBox },
    { id: 'hiddenSingleLine', tier: 2, apply: hiddenSingleLine },
    { id: 'nakedSingle', tier: 2, apply: nakedSingle },
    { id: 'pointing', tier: 3, apply: pointing },
    { id: 'claiming', tier: 3, apply: claiming },
    { id: 'nakedPair', tier: 3, apply: s => nakedSubset(s, 2) },
    { id: 'hiddenPair', tier: 3, apply: s => hiddenSubset(s, 2) },
    { id: 'nakedTriple', tier: 4, apply: s => nakedSubset(s, 3) },
    { id: 'hiddenTriple', tier: 4, apply: s => hiddenSubset(s, 3) },
    { id: 'xWing', tier: 4, apply: xWing },
].map(Object.freeze));

const LADDERS = Array.from({ length: MAX_TIER + 1 }, (_, cap) => TECHNIQUES.filter(t => t.tier <= cap));

export const TECHNIQUE_BY_ID = Object.freeze(Object.fromEntries(TECHNIQUES.map(t => [t.id, t])));

/**
 * 从已知数字出发跑闭包。返回：
 *   values  闭包后的盘面
 *   tierOf  每格被推出时的档位（0 = 原本已知或推不出）
 *   viaOf   落子的技巧 id；keyOf 本格档位对应的「关键技巧」（第一次用到该档的技巧）
 *   unitOf  落子依据的单元（唯余数为 −1）
 *   order   落子顺序（从易到难）
 *   used    每条技巧产生改动的扫描次数
 */
export function analyze(known, { cap = MAX_TIER } = {}) {
    const s = createState(known);
    const tierOf = new Int8Array(CELLS);
    const viaOf = new Array(CELLS).fill(null);
    const keyOf = new Array(CELLS).fill(null);
    const unitOf = new Int8Array(CELLS).fill(-1);
    const order = [];
    const used = {};
    let maxTier = 0, keyTech = null;
    let current = null;
    const onPlace = (i, d, via, unit) => {
        const tier = Math.max(maxTier, current.tier);
        tierOf[i] = tier;
        viaOf[i] = via;
        keyOf[i] = current.tier > maxTier ? current.id : keyTech;
        unitOf[i] = unit;
        order.push(i);
    };
    const techs = LADDERS[Math.min(Math.max(cap, 1), MAX_TIER)];
    while (!s.broken) {
        let progressed = false;
        for (const t of techs) {
            current = t;
            const changes = t.apply(s, onPlace);
            if (s.broken) break;
            if (changes > 0) {
                used[t.id] = (used[t.id] || 0) + 1;
                if (t.tier > maxTier) { maxTier = t.tier; keyTech = t.id; }
                progressed = true;
                break;
            }
        }
        if (!progressed) break;
    }
    let solved = !s.broken;
    for (let i = 0; i < CELLS && solved; i++) if (!s.values[i]) solved = false;
    return { values: s.values, cand: s.cand, tierOf, viaOf, keyOf, unitOf, order, used, maxTier, solved, broken: s.broken };
}

/** 只跑某一条技巧的一次扫描（单测用） */
export function applyTechnique(id, state, onPlace = noop) {
    const technique = TECHNIQUE_BY_ID[id];
    return technique.apply(state, onPlace);
}
