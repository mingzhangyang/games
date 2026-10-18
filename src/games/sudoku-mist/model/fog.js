/**
 * 迷雾：可见性与揭雾核（设计 §4.1 / §4.3）。
 * 视野用 81 字符串存储：'1' = 开局可见，'0' = 雾中。
 * 规则：只有玩家落子会触发揭雾，被揭开的题面数字不连锁。揭雾核两种：
 *   'box'   以落子格为中心的 3×3（周围 8 格）——第一章，雾散得快、好上手
 *   'cross' 落子格 + 上下左右 4 格 ——之后的章节与每日题；雾留得更久、更常需要穿雾
 */
import { CELLS, rowOf, colOf } from './grid.js';

export const REVEAL_KERNELS = Object.freeze(['box', 'cross']);
export const DEFAULT_REVEAL = 'cross';

export function parseWindow(str) {
    if (typeof str !== 'string' || str.length !== CELLS || /[^01]/.test(str)) {
        throw new Error('window must be an 81-char string of 0/1');
    }
    const v = new Uint8Array(CELLS);
    for (let i = 0; i < CELLS; i++) v[i] = str[i] === '1' ? 1 : 0;
    return v;
}

export function formatWindow(v) {
    let s = '';
    for (let i = 0; i < CELLS; i++) s += v[i] ? '1' : '0';
    return s;
}

const AREAS = Object.freeze(Object.fromEntries(REVEAL_KERNELS.map(kernel => [kernel,
    Object.freeze(Array.from({ length: CELLS }, (_, i) => {
        const r0 = rowOf(i), c0 = colOf(i), out = [];
        for (let r = Math.max(0, r0 - 1); r <= Math.min(8, r0 + 1); r++) {
            for (let c = Math.max(0, c0 - 1); c <= Math.min(8, c0 + 1); c++) {
                if (kernel === 'box' || r === r0 || c === c0) out.push(r * 9 + c);
            }
        }
        return Object.freeze(out);
    }))])));

/** 以 i 为中心的揭雾范围（含 i 本身，按格号升序） */
export function revealArea(i, kernel = DEFAULT_REVEAL) {
    const areas = AREAS[kernel];
    if (!areas) throw new Error(`unknown reveal kernel ${kernel}`);
    return areas[i];
}

/** 揭开 i 周围的雾；返回本次新变为可见的格子 */
export function revealAround(visible, i, kernel = DEFAULT_REVEAL) {
    const opened = [];
    for (const j of revealArea(i, kernel)) {
        if (!visible[j]) { visible[j] = 1; opened.push(j); }
    }
    return opened;
}

/** 玩家此刻的知识：可见的题面数字 + 已落子数字；雾中格一律为 0 */
export function knowledgeOf(givens, visible, placed) {
    const k = new Int8Array(CELLS);
    for (let i = 0; i < CELLS; i++) {
        if (placed[i]) k[i] = placed[i];
        else if (visible[i] && givens[i]) k[i] = givens[i];
    }
    return k;
}
