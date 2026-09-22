#!/usr/bin/env node
// scripts/echo-cave-build-maps.mjs — 回声洞窟关卡生成器
//
// 为什么这么绕：
//  · 24 列 × 32 行 × 17 张图，手敲 ASCII 必然数错字符；
//  · par 必须等于求解器算出来的值（手填会被 scripts/verify-echo-cave-levels.mjs 判错）；
//  · 声晶必须摆在「par 脉冲链的安全圈内」三星才可达 —— 手挑几乎必错。
// 于是这里：1) 用坐标画结构；2) 本地跑同一套 hop-BFS 求 par 与脉冲链；
// 3) 声晶只从「链上节点 ball(safeR) 内、且离主路径 ≥3 格」的候选里挑 → 三星可达性天然成立；
// 4) 荆棘自动剔除埋墙 / 贴P·E·晶的坑；5) 按 par 升序定 E4..E20，难度曲线自动单调。
//
// 用法：node scratch/ec-build-maps.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../js/daily.js';
import { GRID, RULES, computeField } from '../js/echo-cave-caves.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// ⚠️ 默认只报告不改文件：万一有人手调了 LEVELS，跑一遍生成器会静默覆盖。
// 确认要写盘必须显式加 --write（写完记得跑 scripts/verify-echo-cave-levels.mjs）。
const WRITE = process.argv.includes('--write');

const { cols: COLS, rows: ROWS } = GRID;
const SAFE = RULES.safeR;
const IX0 = 1, IX1 = COLS - 2;
const IY0 = 1, IY1 = ROWS - 2;

// ⚠️ 'T' 在**求解栅格**里视作墙（par 路线必须绕开荆棘），但物理上它是地板
const OPEN_CH = new Set(['.', 'P', 'C', 'E']);
const isOpenCh = ch => OPEN_CH.has(ch);

class Cave {
    constructor() { this.g = Array.from({ length: ROWS }, () => Array(COLS).fill('#')); }
    fill(x1, y1, x2, y2, ch = '.') {
        const ax = Math.max(IX0, Math.min(x1, x2));
        const bx = Math.min(IX1, Math.max(x1, x2));
        const ay = Math.max(IY0, Math.min(y1, y2));
        const by = Math.min(IY1, Math.max(y1, y2));
        for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) this.g[y][x] = ch;
        return this;
    }
    /** 环形：矩形边框（厚度 t）挖通 */
    ring(x0, y0, x1, y1, t = 2) {
        this.fill(x0, y0, x1, y0 + t - 1);
        this.fill(x1 - t + 1, y0, x1, y1);
        this.fill(x0, y1 - t + 1, x1, y1);
        this.fill(x0, y0, x0 + t - 1, y1);
        return this;
    }
    rock(x1, y1, x2, y2) { return this.fill(x1, y1, x2, y2, '#'); }
    moss(x1, y1, x2, y2) { return this.fill(x1, y1, x2, y2, 'M'); }
    put(x, y, ch) { this.g[y][x] = ch; return this; }
    dots(list) { for (const [x, y, ch] of list) this.put(x, y, ch); return this; }
    lines() { return this.g.map(r => r.join('')); }
    at(x, y) { return this.g[y][x]; }
    find(ch) {
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.g[y][x] === ch) return { x, y };
        return null;
    }
}

/* ─────────────── 绳索 builder ─────────────── */

function mazeFill(cave, seed, w = 11, h = 15, ox = 1, oy = 1) {
    const rng = mulberry32(seed);
    const visited = Array.from({ length: h }, () => Array(w).fill(false));
    const cx = i => ox + 2 * i;
    const cy = j => oy + 2 * j;
    visited[0][0] = true;
    cave.put(cx(0), cy(0), '.');
    const stack = [[0, 0]];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    while (stack.length) {
        const [ci, cj] = stack[stack.length - 1];
        const cand = [];
        for (const [dx, dy] of dirs) {
            const ni = ci + dx, nj = cj + dy;
            if (ni < 0 || ni >= w || nj < 0 || nj >= h || visited[nj][ni]) continue;
            cand.push([ni, nj, dx, dy]);
        }
        if (!cand.length) { stack.pop(); continue; }
        const [ni, nj, dx, dy] = cand[Math.floor(rng() * cand.length)];
        visited[nj][ni] = true;
        cave.put(cx(ci) + dx, cy(cj) + dy, '.');
        cave.put(cx(ni), cy(nj), '.');
        stack.push([ni, nj]);
    }
    return cave;
}

/* ─────────────── 求解器（与 verify-echo-cave-levels.mjs 同口径） ─────────────── */

function solidGrid(cave) {
    const g = new Uint8Array(COLS * ROWS);
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) g[y * COLS + x] = isOpenCh(cave.at(x, y)) ? 0 : 1;
    }
    return g;
}

const idxOf = (x, y) => y * COLS + x;
const fieldCache = new Map();
function fieldFrom(g, idx) {
    let f = fieldCache.get(idx);
    if (f) return f;
    const cx = idx % COLS;
    const cy = (idx - cx) / COLS;
    f = computeField(g, COLS, ROWS, cx, cy);
    fieldCache.set(idx, f);
    return f;
}


/** 与 verify-echo-cave-levels.mjs 的 buildNav 同口径：荆棘本身 + 曼哈顿半径 1 的一圈都算墙 */
function navGrid(cave) {
    const g = solidGrid(cave);
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (cave.at(x, y) !== 'T') continue;
            const i = y * COLS + x;
            g[i] = 1;
            if (x > 0) g[i - 1] = 1;
            if (x < COLS - 1) g[i + 1] = 1;
            if (y > 0) g[i - COLS] = 1;
            if (y < ROWS - 1) g[i + COLS] = 1;
        }
    }
    return g;
}

/** par + 脉冲链（节点 = 上次脉冲格，一跳 = ball(safeR)） */
function solveChain(g, startIdx, exitIdx) {
    fieldCache.clear();
    const prev = new Map([[startIdx, null]]);
    let frontier = [startIdx];
    let hops = 0;
    const seen = new Set([startIdx]);
    while (frontier.length) {
        for (const s of frontier) {
            const d = fieldFrom(g, s)[exitIdx];
            if (d >= 0 && d <= SAFE) {
                const chain = [];
                let cur = s;
                while (cur !== null && cur !== undefined) { chain.push(cur); cur = prev.get(cur); }
                return { par: hops + 1, chain: chain.reverse() };
            }
        }
        const next = [];
        for (const s of frontier) {
            const f = fieldFrom(g, s);
            for (let i = 0; i < f.length; i++) {
                if (f[i] < 0 || f[i] > SAFE || seen.has(i)) continue;
                seen.add(i); prev.set(i, s); next.push(i);
            }
        }
        frontier = next;
        hops++;
    }
    return null;
}

/** P→E 的最短路（走廊最短路，用于判定“离主路径多远”） */
function shortestPath(g, startIdx, exitIdx) {
    const f = fieldFrom(g, startIdx);
    if (f[exitIdx] < 0) return null;
    const path = [];
    let cur = exitIdx;
    while (cur !== startIdx) {
        path.push(cur);
        const cx = cur % COLS;
        const want = f[cur] - 1;
        let nextIdx = -1;
        const cands = [];
        if (cx > 0) cands.push(cur - 1);
        if (cx < COLS - 1) cands.push(cur + 1);
        if (cur >= COLS) cands.push(cur - COLS);
        if (cur < COLS * (ROWS - 1)) cands.push(cur + COLS);
        for (const n of cands) if (f[n] === want) { nextIdx = n; break; }
        if (nextIdx < 0) return null;
        cur = nextIdx;
    }
    path.push(startIdx);
    return path;
}

/* ─────────────── 布点 ─────────────── */

const manh = (a, b) => {
    const ax = a % COLS, ay = (a - ax) / COLS;
    const bx = b % COLS, by = (b - bx) / COLS;
    return Math.abs(ax - bx) + Math.abs(ay - by);
};

/**
 * 声晶自动布点：候选 = 「链上某节点 ball(safeR) 内」∩「离主路径 ≥3 格」∩「离荆棘 / P / E ≥2 格」。
 * 这样拾取不会多花一次脉冲（同一次脉冲的信息圈里顺路绕过去），三星可达性由构造保证。
 */
function placeCrystals(cave, g, chain, pathSet, want, thornSet, specials, minFar = 3, minSep = 6) {
    const reach = new Map();   // cell → 离主路径的曼哈顿距离
    const cands = [];
    for (const node of chain) {
        const f = fieldFrom(g, node);
        for (let i = 0; i < f.length; i++) {
            const d = f[i];
            if (d < 0 || d > SAFE) continue;
            const x = i % COLS, y = (i - x) / COLS;
            if (x < IX0 || x > IX1 || y < IY0 || y > IY1) continue;
            if (cave.at(x, y) !== '.') continue;
            let far = 99;
            for (const p of pathSet) far = Math.min(far, manh(i, p));
            if (far < minFar) continue;
            let near = 99;
            for (const t of thornSet) near = Math.min(near, manh(i, t));
            for (const s of specials) near = Math.min(near, manh(i, s));
            if (near < 2) continue;
            if (reach.has(i)) continue;
            reach.set(i, far);
            cands.push({ i, far, near });
        }
    }
    // 优先挑「离主路径最远」的（= 值得探索的凹角），并保证彼此分散
    cands.sort((a, b) => b.far - a.far || a.i - b.i);
    const picked = [];
    for (const c of cands) {
        if (picked.length >= want) break;
        if (picked.some(p => manh(p.i, c.i) < minSep)) continue;
        picked.push(c);
    }
    for (const c of picked) {
        const x = c.i % COLS, y = (c.i - x) / COLS;
        cave.put(x, y, 'C');
    }
    return picked.length;
}

/**
 * 荆棘自动布点：候选 = 「离主路径 2..5 格」∩「离 P/E ≥2 格」。
 * 每放一根都用「荆棘 + 1 格避让余量」的导航栅格复检 P→E 连通性（否则一票否决），
 * 这样保证 par 路线始终存在一条擦不到血的走法（见 verify 里的 buildNav 注释）。
 */
function placeThorns(cave, g, pathSet, want, protectedIdx) {
    const P = cave.find('P');
    const E = cave.find('E');
    const cands = [];
    for (let i = 0; i < COLS * ROWS; i++) {
        if (g[i] !== 0) continue;
        const x = i % COLS, y = (i - x) / COLS;
        if (x < IX0 || x > IX1 || y < IY0 || y > IY1) continue;
        if (cave.at(x, y) !== '.') continue;
        let near = 99;
        for (const p of pathSet) near = Math.min(near, manh(i, p));
        if (near < 2 || near > 5) continue;
        if (protectedIdx.some(s => manh(i, s) < 2)) continue;
        cands.push({ i, near });
    }
    cands.sort((a, b) => a.near - b.near || a.i - b.i);
    const picked = [];
    for (const c of cands) {
        if (picked.length >= want) break;
        if (picked.some(p => manh(p.i, c.i) < 6)) continue;
        const x = c.i % COLS, y = (c.i - x) / COLS;
        cave.put(x, y, 'T');
        if (!navReachable(cave, P, E)) { cave.put(x, y, '.'); continue; }
        picked.push(c);
    }
    return picked.length;
}

/** 「荆棘 + 1 格避让余量」的导航栅格下，P→E 是否还通 */
function navReachable(cave, P, E) {
    const g = new Uint8Array(COLS * ROWS).fill(1);
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const ch = cave.at(x, y);
            if (ch === '#' || ch === 'M' || ch === ' ') continue;
            if (ch === 'T') g[y * COLS + x] = 1;
            else g[y * COLS + x] = 0;
        }
    }
    const thornCoords = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (cave.at(x, y) === 'T') thornCoords.push([x, y]);
    for (const [tx, ty] of thornCoords) {
        const mark = (nx, ny) => {
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
            const idx = ny * COLS + nx;
            if (g[idx] === 0 && !(nx === P.x && ny === P.y) && !(nx === E.x && ny === E.y)) g[idx] = 1;
        };
        mark(tx, ty); mark(tx - 1, ty); mark(tx + 1, ty); mark(tx, ty - 1); mark(tx, ty + 1);
    }
    // P/E 自身即使落在避让区也要能作为端点
    g[P.y * COLS + P.x] = 0;
    g[E.y * COLS + E.x] = 0;
    const f = computeField(g, COLS, ROWS, P.x, P.y);
    return f[E.y * COLS + E.x] >= 0;
}

/** 荆棘自检：非地板 / 埋进墙 / 离特殊点太近 → 剔除 */
function sanitizeThorns(cave) {
    const thorns = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (cave.at(x, y) === 'T') thorns.push({ x, y });
    const specials = [];
    for (const ch of ['P', 'E', 'C']) {
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (cave.at(x, y) === ch) specials.push({ x, y, ch });
    }
    let dropped = 0;
    for (const t of thorns) {
        const nbWalkable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const nx = t.x + dx, ny = t.y + dy;
            return nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && isOpenCh(cave.at(nx, ny)) && cave.at(nx, ny) !== 'T';
        });
        const tooClose = specials.some(s => Math.abs(s.x - t.x) + Math.abs(s.y - t.y) < 2);
        if (!nbWalkable || tooClose) {
            cave.put(t.x, t.y, '.');
            dropped++;
        }
    }
    return { dropped, kept: thorns.length - dropped };
}

/* ─────────────── 设计稿（只画结构 + P/E/刺，声晶由求解器来摆） ─────────────── */

const DESIGNS = [];
const def = (key, tipKey, want, build) => DESIGNS.push({ key, tipKey, want, build });

// A. 双厅 + 苔墩
def('comb2', 'tipMove', 3, () => {
    const c = new Cave();
    c.fill(1, 1, 22, 13);
    c.fill(1, 15, 22, 30);
    c.fill(19, 14, 21, 14);
    c.moss(8, 5, 10, 7);
    c.rock(14, 19, 16, 21);
    c.fill(4, 24, 6, 25);
    c.fill(17, 9, 19, 10);
    c.dots([[3, 4, 'P'], [20, 27, 'E'], [13, 11, 'T'], [6, 17, 'T'], [12, 23, 'T']]);
    return c;
});

// B. 环廊 + 内厅
def('ringCore', 'tipMove', 3, () => {
    const c = new Cave();
    c.fill(2, 2, 21, 28);
    c.rock(5, 7, 18, 24);
    c.moss(5, 7, 18, 7);
    c.moss(5, 24, 18, 24);
    c.fill(9, 12, 15, 20);
    c.fill(15, 16, 19, 16);
    c.dots([[3, 3, 'P'], [11, 16, 'E'], [20, 20, 'T'], [3, 15, 'T']]);
    return c;
});

// C. 柱厅
def('pillarHall', 'tipMove', 4, () => {
    const c = new Cave();
    c.fill(1, 1, 22, 30);
    let flip = 0;
    for (let y = 4; y <= 25; y += 6) {
        for (let x = 4; x <= 19; x += 7) {
            flip++;
            c.fill(x, y, x + 1, y + 1, flip % 3 === 0 ? 'M' : '#');
        }
    }
    c.dots([[2, 2, 'P'], [21, 29, 'E'], [7, 8, 'T'], [16, 21, 'T'], [13, 14, 'T']]);
    return c;
});

// D. 三室塔
def('rooms3', 'tipThorn', 3, () => {
    const c = new Cave();
    c.fill(1, 2, 22, 10);
    c.fill(1, 12, 22, 20);
    c.fill(1, 22, 22, 29);
    c.moss(1, 11, 22, 11); c.fill(19, 11, 21, 11);
    c.moss(1, 21, 22, 21); c.fill(2, 21, 4, 21);
    c.moss(9, 5, 12, 6);
    c.rock(15, 24, 17, 26);
    c.dots([[3, 4, 'P'], [3, 27, 'E'], [8, 15, 'T'], [13, 25, 'T']]);
    return c;
});

// E. 双层蛇廊（含假支线）
def('serpent2', 'tipThorn', 3, () => {
    const c = new Cave();
    c.fill(1, 4, 21, 6);
    c.fill(1, 17, 21, 19);
    c.fill(19, 7, 21, 16);
    c.fill(4, 7, 5, 15);
    c.fill(8, 20, 10, 22);
    c.dots([[2, 5, 'P'], [2, 18, 'E'], [16, 10, 'T'], [6, 13, 'T']]);
    return c;
});

// F. 苔藓挡板阵
def('mossField', 'tipMove', 4, () => {
    const c = new Cave();
    c.fill(1, 1, 22, 30);
    let idx = 0;
    for (let y = 3; y <= 28; y += 5) {
        if (idx % 2 === 0) c.moss(3, y, 14, y);
        else c.moss(9, y, 20, y);
        idx++;
    }
    c.moss(6, 16, 8, 20);
    c.dots([[2, 1, 'P'], [21, 29, 'E'], [11, 10, 'T'], [18, 26, 'T']]);
    return c;
});

// G. 画廊 S 形（凹室接入主廊）
def('gallery', 'tipThorn', 4, () => {
    const c = new Cave();
    c.fill(2, 3, 9, 6);
    c.fill(2, 6, 9, 16);
    c.fill(2, 13, 17, 16);
    c.fill(14, 16, 17, 27);
    c.fill(8, 24, 17, 27);
    c.fill(1, 8, 2, 12);        // 左凹室（接竖臂）
    c.fill(17, 20, 19, 22);     // 右凹室（接右臂）
    c.dots([[3, 4, 'P'], [10, 26, 'E'], [12, 20, 'T'], [5, 22, 'T']]);
    return c;
});

// H. 双环：外环 → 内环 → 中枢
def('doubleRing', 'tipMove', 4, () => {
    const c = new Cave();
    c.ring(1, 1, 22, 30, 2);        // 外环
    c.ring(5, 5, 18, 26, 2);        // 内环
    c.ring(9, 9, 14, 22, 2);        // 中枢环
    c.fill(3, 15, 5, 16);           // 外→内 门
    c.fill(7, 13, 9, 14);           // 内→中枢 门
    c.dots([[2, 2, 'P'], [12, 16, 'E'], [20, 9, 'T'], [6, 22, 'T']]);
    return c;
});

// I. 三层蛇廊
def('serpent3', 'tipThorn', 4, () => {
    const c = new Cave();
    c.fill(1, 3, 21, 5);
    c.fill(1, 12, 21, 14);
    c.fill(1, 21, 21, 23);
    c.fill(19, 6, 21, 11);
    c.fill(1, 15, 3, 20);
    c.fill(6, 23, 9, 27);
    c.dots([[2, 4, 'P'], [20, 22, 'E'], [15, 8, 'T'], [8, 18, 'T']]);
    return c;
});

// J. 竖向梳
def('vertComb', 'tipMove', 4, () => {
    const c = new Cave();
    c.fill(2, 1, 5, 29);
    c.fill(9, 1, 12, 29);
    c.fill(16, 1, 19, 29);
    c.fill(2, 3, 19, 4);
    c.fill(2, 26, 19, 27);
    c.fill(12, 12, 15, 15);        // 中渠侧室
    c.dots([[3, 2, 'P'], [18, 28, 'E'], [10, 8, 'T'], [12, 22, 'T']]);
    return c;
});

// K. 四层梳
def('comb4', 'tipThorn', 5, () => {
    const c = new Cave();
    c.fill(1, 2, 21, 5);
    c.fill(1, 9, 21, 12);
    c.fill(1, 16, 21, 19);
    c.fill(1, 23, 21, 26);
    c.fill(19, 6, 21, 8);
    c.fill(1, 13, 3, 15);
    c.fill(19, 20, 21, 22);
    c.fill(1, 27, 3, 29);
    c.dots([[2, 3, 'P'], [20, 25, 'E'], [15, 10, 'T'], [8, 21, 'T']]);
    return c;
});

// L. 螺旋式同心环（只有一个外→内的门，越往里越黑）
def('spiralRing', 'tipMove', 4, () => {
    const c = new Cave();
    c.ring(1, 1, 22, 30, 2);
    c.ring(5, 5, 18, 26, 2);
    c.ring(9, 9, 14, 22, 2);
    c.fill(3, 3, 5, 4);            // 外→内 门（左上角）
    c.fill(9, 21, 10, 25);         // 内→中枢 门（另一端）
    c.moss(11, 9, 14, 9);
    c.dots([[1, 1, 'P'], [14, 16, 'E']]);
    return c;
});

// M. 种子迷宫 1（中等：占 x1..15 / y1..21）
def('maze1', 'tipThorn', 3, () => {
    const c = new Cave();
    mazeFill(c, 424242, 8, 11, 1, 1);
    c.dots([[1, 1, 'P'], [15, 21, 'E']]);
    return c;
});

// N. 种子迷宫 2（全图）
def('maze2', 'tipThorn', 4, () => {
    const c = new Cave();
    mazeFill(c, 777001, 11, 15, 1, 1);
    c.dots([[1, 1, 'P'], [21, 29, 'E']]);
    return c;
});

// O. 珊瑚：主廊 + 一串挂着的凹室（全部接通）
def('coral', 'tipThorn', 5, () => {
    const c = new Cave();
    c.ring(2, 2, 21, 28, 2);
    c.fill(4, 4, 6, 6);   c.fill(4, 4, 4, 6);      // 左上室 + 接入环
    c.fill(17, 4, 19, 6); c.fill(19, 4, 19, 6);    // 右上室
    c.fill(4, 24, 6, 26); c.fill(4, 24, 4, 26);    // 左下室
    c.fill(17, 24, 19, 26); c.fill(19, 24, 19, 26);// 右下室
    c.fill(9, 12, 14, 14); c.fill(11, 12, 11, 11); // 中央室 + 接入上边环? 下面再补
    c.fill(11, 7, 11, 12);
    c.dots([[3, 3, 'P'], [19, 27, 'E'], [9, 20, 'T'], [15, 9, 'T']]);
    return c;
});

// P. 毕业考：四竖渠蛇形（顶接 → 下行 → 底接 → 上行 → 顶接 → 下行），一条路走到底
def('graduation', 'tipThorn', 5, () => {
    const c = new Cave();
    c.fill(1, 1, 4, 29);        // 渠 1
    c.fill(7, 1, 10, 29);       // 渠 2
    c.fill(13, 1, 16, 29);      // 渠 3
    c.fill(19, 1, 22, 29);      // 渠 4
    c.fill(1, 1, 10, 2);        // 顶接：渠1↔渠2
    c.fill(13, 1, 22, 2);       // 顶接：渠3↔渠4
    c.fill(7, 28, 16, 29);      // 底接：渠2↔渠3
    c.moss(7, 14, 8, 14);       // 渠2 半截苔藓（必须留至少一格通路，否则整条渠被封死）
    c.moss(15, 21, 16, 21);
    c.fill(5, 16, 6, 18);       // 假口袋
    c.dots([[2, 3, 'P'], [21, 27, 'E']]);
    return c;
});

// Q. 苔藓墓碑：密排短墙（强走出油碰到 Mem-none 的体验）
def('stelae', 'tipMove', 4, () => {
    const c = new Cave();
    c.fill(1, 1, 22, 30);
    for (let y = 4; y <= 27; y += 4) {
        for (let x = 3; x <= 20; x += 6) c.moss(x, y, x + 2, y);
    }
    c.dots([[2, 2, 'P'], [21, 29, 'E'], [12, 13, 'T'], [18, 25, 'T']]);
    return c;
});

// R. 刺廊：直廊两侧假门 + 真门
def('thornRun', 'tipThorn', 4, () => {
    const c = new Cave();
    c.fill(2, 2, 21, 6);
    c.fill(2, 25, 21, 29);
    c.fill(2, 6, 4, 25);
    c.fill(19, 6, 21, 25);
    c.fill(6, 9, 8, 22);
    c.fill(14, 9, 16, 22);
    c.fill(9, 13, 12, 15);       // 中央横接
    c.dots([[3, 3, 'P'], [20, 27, 'E'], [10, 10, 'T'], [10, 20, 'T']]);
    return c;
});

// S. 六层梳（最长准考证）
def('comb5', 'tipThorn', 5, () => {
    const c = new Cave();
    c.fill(1, 2, 21, 4);
    c.fill(1, 7, 21, 9);
    c.fill(1, 12, 21, 14);
    c.fill(1, 17, 21, 19);
    c.fill(1, 22, 21, 24);
    c.fill(1, 26, 21, 28);
    c.fill(19, 5, 21, 6);
    c.fill(1, 10, 3, 11);
    c.fill(19, 15, 21, 16);
    c.fill(1, 20, 3, 21);
    c.fill(19, 25, 21, 26);
    c.dots([[2, 3, 'P'], [20, 27, 'E']]);
    return c;
});

/* ─────────────── 主流程 ─────────────── */

// 冗余设计稿：先全量求解，再按 par 分布砍掉凑不够抖的衣服
const DROP = new Set(['maze2', 'gallery']);

// 每个设计稿要几根荆棘（由 placeThorns 自动落位）
// 每关的教学提示（键必须已在 js/echo-cave.js 的 zh/en 两表里定义）
const TIPS = {
    comb2: 'tipMove',        // 双厅 + 苔墩
    ringCore: 'tipRoute',    // 环廊 + 内厅
    pillarHall: 'tipPlan',   // 柱厅：四晶散布
    rooms3: 'tipThorn',      // 三室塔
    serpent2: 'tipSlit',     // 双层蛇廊
    mossField: 'tipMoss',    // 苔藓挡板阵
    doubleRing: 'tipRoute',  // 双环
    serpent3: 'tipSlit',     // 三层蛇廊
    vertComb: 'tipSlit',     // 竖向梳
    comb4: 'tipPlan',        // 四层梳：五晶
    spiralRing: 'tipRoute',  // 螺旋同心环
    maze1: 'tipDark',        // 迷宫
    coral: 'tipPlan',        // 珊瑚：五晶
    graduation: 'tipFinal',  // 毕业考
    stelae: 'tipMoss',       // 苔藓墓碑
    thornRun: 'tipThorn',    // 刺廊
    comb5: 'tipDark',        // 六层梳：最长
};

const THORN_WANT = {
    comb2: 3, ringCore: 3, pillarHall: 3, rooms3: 3, serpent2: 3, mossField: 3,
    gallery: 4, doubleRing: 3, serpent3: 4, vertComb: 3, comb4: 4, spiralRing: 4,
    maze1: 2, maze2: 4, coral: 4, graduation: 4, stelae: 3, thornRun: 5, comb5: 4,
};

// 「声晶离主路径至少多远才算值得探索」：1 格宽迷宫里找不到离主路 3 格的格，放宽到 1
const MINDIST = { maze1: { far: 1, sep: 3 }, maze2: { far: 1, sep: 3 }, spiralRing: { far: 2 }, doubleRing: { far: 2 } };

const built = [];
for (const d of DESIGNS) {
    if (DROP.has(d.key)) continue;
    const cave = d.build();
    // 抹掉设计稿里手摆的荆棘：统一由 placeThorns 在「离主路径 2..5 格」的合法位自动落点
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (cave.at(x, y) === 'T') cave.put(x, y, '.');
    const P = cave.find('P');
    const E = cave.find('E');
    if (!P || !E) { console.error(`✗ ${d.key} 缺 P 或 E`); continue; }
    let g = navGrid(cave);
    let sol = solveChain(g, idxOf(P.x, P.y), idxOf(E.x, E.y));
    if (!sol) { console.error(`✗ ${d.key} 洞口不可达（结构有洞，检查 carving）`); continue; }
    const path = shortestPath(g, idxOf(P.x, P.y), idxOf(E.x, E.y));
    const pathSet = new Set(path);
    const thornWant = THORN_WANT[d.key] ?? 3;
    const thornsPlaced = placeThorns(cave, g, pathSet, thornWant, [idxOf(P.x, P.y), idxOf(E.x, E.y)]);
    // 放荆棘后重算：确保所有度量都用最终地图
    g = navGrid(cave);
    sol = solveChain(g, idxOf(P.x, P.y), idxOf(E.x, E.y));
    if (!sol) { console.error(`✗ ${d.key} 放荆棘后洞口不可达`); continue; }
    const path2 = new Set(shortestPath(g, idxOf(P.x, P.y), idxOf(E.x, E.y)));
    const thornSet = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (cave.at(x, y) === 'T') thornSet.push(idxOf(x, y));
    const specials = [idxOf(P.x, P.y), idxOf(E.x, E.y), ...thornSet];
    const opts = MINDIST[d.key] || {};
    const minFar = opts.far ?? 3;
    const placed = placeCrystals(cave, g, sol.chain, path2, d.want, thornSet, specials, minFar, opts.sep ?? 6);
    const th = sanitizeThorns(cave);
    g = navGrid(cave);
    sol = solveChain(g, idxOf(P.x, P.y), idxOf(E.x, E.y));
    if (!sol) { console.error(`✗ ${d.key} 清理荆棘后不可达`); continue; }
    built.push({ ...d, cave, par: sol.par, crystals: placed, thorns: th.kept, spun: thornsPlaced, dropped: th.dropped });
    console.log(`  ${d.key.padEnd(12)} par=${String(sol.par).padStart(2)}  晶=${placed}/${d.want}  刺=${th.kept}${th.dropped ? `(剔 ${th.dropped})` : ''}`);
}

built.sort((a, b) => a.par - b.par);

// 按最终顺序定教学提示；末两关固定「深处 / 最后一窟」，收尾语气正确
for (const d of built) d.tipKey = TIPS[d.key] || d.tipKey;
if (built.length >= 1) built[built.length - 1].tipKey = 'tipFinal';
if (built.length >= 2) built[built.length - 2].tipKey = 'tipDark';

const body = built.map((d, i) => {
    const id = `E${i + 4}`;
    const lines = d.cave.lines().map(s => `            '${s}',`).join('\n');
    return [
        '    {',
        `        id: '${id}', par: ${d.par}, tipKey: '${d.tipKey}',`,
        '        map: [',
        lines,
        '        ],',
        '    },',
    ].join('\n');
}).join('\n');

const target = path.resolve(ROOT, 'js/echo-cave-caves.js');
const src = fs.readFileSync(target, 'utf8');
const begin = '    /* gen-begin */\n';
const end = '    /* gen-end */\n';
const bi = src.indexOf(begin);
const ei = src.indexOf(end);
if (bi < 0 || ei < 0) { console.error('找不到 gen-begin / gen-end 标记'); process.exit(1); }
const next = src.slice(0, bi + begin.length) + body + '\n' + src.slice(ei);
if (next === src) console.log('（内容无变化）');
else if (!WRITE) console.log(`\n[dry] ${built.length} 关已生成，与现状不同 —— 写盘请加 --write`);
else { fs.writeFileSync(target, next, 'utf8'); console.log(`\n已写入 ${built.length} 关 → js/echo-cave-caves.js（par ${built[0].par} → ${built[built.length - 1].par}）`); }
