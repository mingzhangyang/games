#!/usr/bin/env node
// verify-lumen-levels.mjs — Lumen 关卡数据校验器（node 直跑，无需浏览器）
//
// 锁定：
//   1) 25 章节关（5 章 × 5 关）：解态可解、初盘不可解、par = tap 数 = 独立 BFS 最少点击数、
//      最优解唯一、没有闲置镜面（每个单元在初盘 / 解态 / 一步之遥时会被光碰到）；
//   2) 难度下限（2026-10 重做的初衷：旧版 25 关贪心机器人全部 par 步通关）：
//      - 教学关（1-1、1-2）之外，每关至少 1 步「看不到进度也要点」（预见 ≥ 1），贪心 3★ 率 ≤ 50%
//      - 每章第 2 关起（第 1 章第 4 关起）预见 ≥ 2、贪心 3★ 率 ≤ 15%；每章末关预见 ≥ 3
//      - 全部非教学关的贪心 3★ 平均率 ≤ 12%
//   3) 机制：第 2、4 章每关都有暗晶，任何暗晶都要「有戏份」；第 3 章每关的最优解要点联动组；
//      第 4 章每关的分光镜决定能否点亮全部水晶；第 5 章每关同时有暗晶 + 联动 + (分光或双光束)；
//   4) 每日：24 布局全部双光束、可解；dailyLevel 全日期扫描（2026-01-01 → 2027-12-31）确定性、
//      par ∈ [4,6]、最优解唯一、预见 ≥ 2、初盘不可解，且 24 布局全覆盖；
//   5) 光束黄金断言（反射表、墙 / 发射器挡光、暗晶判负、分光镜分束、联动整组翻转、环路终止）
//      与 buildLevel 的数据防御。
//
// 用法：node tests/verify-lumen-levels.mjs

import {
    CHAPTERS, LEVELS_PER_CHAPTER, LUMEN_LEVELS, DAILY_POOL, DAILY_RULES, dailyLevel,
} from '../src/games/lumen/model/levels.js';
import {
    GRID_N, buildLevel, traceGrid, tapGrid, unitCells, isMirror,
} from '../src/games/lumen/model/beam.js';
import {
    analyzeLevel, solveSpace, maskOfGrid, gridOfMask, nearestSolutions, foresight,
} from '../src/games/lumen/model/solver.js';

let failed = 0;
let passed = 0;
const ok = (cond, label, extra) => {
    if (cond) { passed++; return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};

/** 独立 BFS：只用 tapGrid 在字符网格上走，不经过 solver 的掩码表示（交叉验证 solver） */
function bfs(level) {
    const taps = [];
    const seenUnit = new Set();
    for (let idx = 0; idx < GRID_N * GRID_N; idx++) {
        const cells = unitCells(level, idx);
        if (!cells) continue;
        const key = Math.min(...cells);
        if (seenUnit.has(key)) continue;
        seenUnit.add(key);
        taps.push([Math.floor(idx / GRID_N), idx % GRID_N]);
    }
    const key = g => g.join('|');
    let frontier = [level.grid];
    const seen = new Set([key(level.grid)]);
    for (let d = 0; d <= taps.length; d++) {
        const solved = frontier.filter(g => traceGrid(g, level.split).solved);
        if (solved.length) return { dist: d, count: new Set(solved.map(key)).size };
        const next = [];
        for (const g of frontier) {
            for (const [r, c] of taps) {
                const ng = tapGrid(level, g, r, c).grid;
                const k = key(ng);
                if (seen.has(k)) continue;
                seen.add(k);
                next.push(ng);
            }
        }
        frontier = next;
    }
    return { dist: -1, count: 0 };
}

/** 最优路径上的中间态 + 初盘一步之遥的状态里，被照到过的暗晶 */
function touchedShadows(level) {
    const space = solveSpace(level);
    const from = maskOfGrid(space.units, level.sol, level.grid);
    const states = new Set();
    for (let sub = 0; ; sub = (sub - from) & from) { states.add(from ^ sub); if (sub === from) break; }
    for (let j = 0; j < space.units.length; j++) states.add(from ^ (1 << j));
    const touched = new Set();
    for (const m of states) {
        for (const idx of traceGrid(gridOfMask(space.units, level.sol, m), level.split).shadowLit) touched.add(idx);
    }
    return touched;
}

const count = (grid, chars) => grid.join('').split('').filter(ch => chars.includes(ch)).length;

/* ── 1–3) 章节关 ── */

console.log('▶ 25 章节关');
ok(CHAPTERS.length === 5 && LEVELS_PER_CHAPTER === 5, '5 章 × 5 关');
ok(LUMEN_LEVELS.length === CHAPTERS.length * LEVELS_PER_CHAPTER, `关卡数 = 25（实际 ${LUMEN_LEVELS.length}）`);
ok(new Set(LUMEN_LEVELS.map(lv => lv.id)).size === LUMEN_LEVELS.length, '关卡 id 唯一（星级按 id 存）');

const greedyRates = [];
console.log('  关卡       par 单元 预见 贪心3★ 贪心2★');
for (const lv of LUMEN_LEVELS) {
    const tag = lv.id;
    const n = lv.index % LEVELS_PER_CHAPTER;
    const tutorial = lv.chapter === 0 && n < 2;
    const a = analyzeLevel(lv, { runs: 64 });
    console.log(`  ${tag.padEnd(10)} ${String(lv.par).padStart(3)} ${String(a.units).padStart(4)} ${String(a.foresight).padStart(4)}`
        + ` ${(a.greedy.atPar * 100).toFixed(0).padStart(5)}% ${(a.greedy.within2 * 100).toFixed(0).padStart(5)}%`);

    ok(lv.chapter === Math.floor(lv.index / LEVELS_PER_CHAPTER), `${tag} 章节归属`);
    ok(lv.intro === (n === 0 ? CHAPTERS[lv.chapter].intro : null), `${tag} 章节首关才有机制介绍`);
    const solT = traceGrid(lv.sol, lv.split);
    const iniT = traceGrid(lv.grid, lv.split);
    ok(solT.crystalCount >= 2 && solT.crystalCount <= 6, `${tag} 水晶数 2..6`, String(solT.crystalCount));
    ok(solT.solved, `${tag} 解态点亮全部水晶且不碰暗晶`);
    ok(!iniT.solved, `${tag} 初盘不可解`);
    ok(lv.par >= 1 && lv.par <= 6, `${tag} par ∈ [1,6]`, String(lv.par));
    const emitters = count(lv.sol, '><v^');
    ok(emitters >= 1 && emitters <= 2, `${tag} 发射器 1..2`, String(emitters));
    ok(a.units <= 12, `${tag} 单元数 ≤ 12（运行时全枚举的预算）`, String(a.units));

    const b = bfs(lv);
    ok(b.dist === lv.par, `${tag} 独立 BFS 最少点击数 = par`, `${b.dist} vs ${lv.par}`);
    ok(b.count === 1, `${tag} 最优解唯一（BFS）`, String(b.count));
    ok(a.par === lv.par && a.nearest === 1, `${tag} solver 与 BFS 一致`, `${a.par}/${a.nearest}`);
    ok(a.idle === 0, `${tag} 没有闲置镜面`, String(a.idle));

    if (!tutorial) {
        greedyRates.push(a.greedy.atPar);
        ok(a.foresight >= 1, `${tag} 预见 ≥ 1（贪心点不出来）`, String(a.foresight));
        ok(a.greedy.atPar <= 0.5, `${tag} 贪心 3★ 率 ≤ 50%`, a.greedy.atPar.toFixed(2));
        const ramped = lv.chapter === 0 ? n >= 3 : n >= 1;
        if (ramped) {
            ok(a.foresight >= 2, `${tag} 章内加码：预见 ≥ 2`, String(a.foresight));
            ok(a.greedy.atPar <= 0.15, `${tag} 章内加码：贪心 3★ 率 ≤ 15%`, a.greedy.atPar.toFixed(2));
        }
        if (n === LEVELS_PER_CHAPTER - 1) ok(a.foresight >= 3, `${tag} 章末关预见 ≥ 3`, String(a.foresight));
    }

    const shadows = count(lv.sol, 'x');
    if (lv.chapter === 0) ok(shadows === 0, `${tag} 第 1 章没有暗晶`);
    if (lv.chapter === 1 || lv.chapter === 3) ok(shadows >= 1, `${tag} 暗晶章 / 分光章每关都有暗晶`);
    if (shadows) ok(touchedShadows(lv).size === shadows, `${tag} 每颗暗晶都有戏份`);
    if (lv.chapter === 2 || lv.chapter === 4) {
        const space = a.space;
        const diff = a.from ^ a.target;
        ok(lv.links.length >= 1 && space.units.some((cells, i) => cells.length > 1 && (diff & (1 << i))),
            `${tag} 最优解要点联动组`);
    }
    if (lv.chapter === 3) {
        ok(lv.split.length >= 1, `${tag} 有分光镜`);
        ok(solT.crystalLit.length > traceGrid(lv.sol, []).crystalLit.length, `${tag} 分光支路点亮了水晶`);
    }
    if (lv.chapter === 4) {
        ok(shadows >= 1 && lv.links.length >= 1 && (lv.split.length >= 1 || emitters === 2),
            `${tag} 终章：暗晶 + 联动 + (分光或双光束)`);
    }
    if (lv.chapter < 2) ok(lv.links.length === 0, `${tag} 联动镜第 3 章才登场`);
    if (lv.chapter < 3) ok(lv.split.length === 0, `${tag} 分光镜第 4 章才登场`);
}
const meanGreedy = greedyRates.reduce((x, y) => x + y, 0) / greedyRates.length;
ok(meanGreedy <= 0.12, '非教学关贪心 3★ 平均率 ≤ 12%（旧版 25 关为 100%）', meanGreedy.toFixed(3));
console.log(`  非教学关贪心 3★ 平均率 ${(meanGreedy * 100).toFixed(1)}%`);

/* ── 4) 每日 ── */

console.log('\n▶ 每日池与全日期扫描');
ok(DAILY_POOL.length === 24, `布局数 = 24（实际 ${DAILY_POOL.length}）`);
DAILY_POOL.forEach((def, i) => {
    ok(traceGrid(def.sol, def.split).solved, `D${i + 1} 解态可解`);
    ok(count(def.sol, '><v^') === 2, `D${i + 1} 双光束`);
    ok(solveSpace(def).units.length <= 12, `D${i + 1} 单元数 ≤ 12`);
});
const usedLayouts = new Set();
let sweep = 0;
let detFail = 0;
const crossChecked = new Set();
for (let ts = Date.UTC(2026, 0, 1); ts <= Date.UTC(2027, 11, 31); ts += 86400000) {
    const d = new Date(ts);
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const lv = dailyLevel(key);
    sweep++;
    usedLayouts.add(lv.layout);
    if (JSON.stringify(lv) !== JSON.stringify(dailyLevel(key))) detFail++;
    const tag = `daily ${key}`;
    if (lv.dateKey !== key) ok(false, `${tag} dateKey 回传`);
    if (lv.par < DAILY_RULES.parMin || lv.par > DAILY_RULES.parMax) ok(false, `${tag} par ∈ [4,6]`, String(lv.par));
    if (lv.foresight < DAILY_RULES.minForesight) ok(false, `${tag} 预见 ≥ 2`, String(lv.foresight));
    if (!traceGrid(lv.sol, lv.split).solved) ok(false, `${tag} 解态可解`);
    if (traceGrid(lv.grid, lv.split).solved) ok(false, `${tag} 初盘不可解`);
    const space = solveSpace(lv);
    const near = nearestSolutions(space, maskOfGrid(space.units, lv.sol, lv.grid));
    if (near.dist !== lv.par || near.masks.length !== 1 || near.masks[0] !== 0) {
        ok(false, `${tag} par 为真最少点击且最优解唯一（= 回传的解态）`, `${near.dist}/${near.masks.length}`);
    }
    if (foresight(space, maskOfGrid(space.units, lv.sol, lv.grid), 0) !== lv.foresight) ok(false, `${tag} 预见步数回传一致`);
    if (!crossChecked.has(lv.layout)) {
        crossChecked.add(lv.layout);
        const b = bfs(lv);
        ok(b.dist === lv.par && b.count === 1, `${tag} 独立 BFS 复核（每布局一次）`, `${b.dist}/${b.count}`);
    }
    passed++;
}
ok(detFail === 0, 'dailyLevel 确定性（两次生成全一致）', `${detFail} 天漂移`);
ok(sweep === 730, `扫描天数 = 730（实际 ${sweep}）`);
ok(usedLayouts.size === DAILY_POOL.length, `${DAILY_POOL.length} 布局全覆盖`, `实际 ${usedLayouts.size}`);

/* ── 5) 黄金断言 ── */

console.log('\n▶ 光束黄金断言');
function withCells(cells) {
    const g = Array.from({ length: GRID_N }, () => Array(GRID_N).fill('.'));
    for (const [r, c, ch] of cells) g[r][c] = ch;
    return g.map(row => row.join(''));
}
{
    const t = traceGrid(withCells([[4, 0, '>'], [4, 2, '/'], [0, 2, '*']]));
    ok(t.solved, "黄金：'>' + '/' 向上折，点亮 (0,2)");
    ok(t.rays[0].pts.some(([r, c]) => r === 3 && c === 2), '黄金：光路上行经过 (3,2)');
    ok(traceGrid(withCells([[4, 0, '>'], [4, 2, '\\'], [8, 2, '*']])).solved, "黄金：'>' + '\\' 向下折");
    ok(traceGrid(withCells([[0, 4, 'v'], [4, 4, '/'], [4, 1, '*']])).solved, "黄金：'v' + '/' 向左折");
    ok(traceGrid(withCells([[8, 4, '^'], [5, 4, '\\'], [5, 1, '*']])).solved, "黄金：'^' + '\\' 向左折");
    ok(!traceGrid(withCells([[4, 0, '>'], [4, 2, '#'], [4, 5, '*']])).solved, '黄金：墙挡光');
    ok(!traceGrid(withCells([[4, 0, '>'], [4, 3, '^'], [4, 6, '*']])).solved, '黄金：发射器挡光');
}
{
    const g = withCells([[4, 0, '>'], [4, 3, 'x'], [4, 6, '*']]);
    const t = traceGrid(g);
    ok(t.crystalLit.length === 1 && t.shadowLit.length === 1, '黄金：光穿过暗晶，暗晶被记为照到');
    ok(!t.solved, '黄金：暗晶被照到 → 不算过关');
    ok(traceGrid(withCells([[4, 0, '>'], [3, 3, 'x'], [4, 6, '*']])).solved, '黄金：暗晶不在光路上 → 过关');
}
{
    // 分光镜：'>' 打到 (4,4) 的 '/'，反射支路上行点亮 (0,4)，透射支路继续右行点亮 (4,8)
    const g = withCells([[4, 0, '>'], [4, 4, '/'], [0, 4, '*'], [4, 8, '*']]);
    const asMirror = traceGrid(g);
    const asSplit = traceGrid(g, [4 * GRID_N + 4]);
    ok(asMirror.crystalLit.length === 1, '黄金：普通镜只走反射支路');
    ok(asSplit.solved && asSplit.rays.length === 2, '黄金：分光镜一束变两束，两颗水晶都亮');
}
{
    // 分光镜回环：必须终止
    const g = withCells([[2, 0, '>'], [2, 6, '\\'], [6, 6, '/'], [6, 2, '\\'], [2, 2, '/'], [4, 4, '*']]);
    const t0 = Date.now();
    const t = traceGrid(g, [2 * GRID_N + 6, 6 * GRID_N + 2, 2 * GRID_N + 2]);
    ok(Date.now() - t0 < 1000 && t.rays.length < 40, '黄金：分光回环终止');
    const t2 = traceGrid(withCells([[2, 0, '>'], [2, 6, '\\'], [6, 6, '/'], [6, 2, '\\'], [2, 2, '/']]));
    ok(t2.crystalCount === 0 && !t2.solved, '黄金：无水晶 → 永不解（仅终止性）');
}
{
    ok(traceGrid(withCells([[0, 0, '>'], [8, 8, '^'], [0, 4, '\\'], [4, 8, '/'], [2, 4, '*']])).solved,
        '黄金：双束交叉，水晶点亮');
}
{
    const lv = buildLevel({ e: [[4, 0, '>']], m: [[4, 2, '/'], [1, 2, '\\'], [7, 7, '/']], k: [[0, 2]], g: [[[4, 2], [7, 7]]], tap: [[7, 7]] });
    ok(lv.par === 1 && lv.grid[4][2] === '\\' && lv.grid[7][7] === '\\', '黄金：初盘点联动组 → 整组翻转');
    const t = tapGrid(lv, lv.grid, 4, 2);
    ok(t.cells.length === 2 && t.grid[7][7] === '/' && t.grid[4][2] === '/', '黄金：点组内任一面，整组一起翻回');
    ok(tapGrid(lv, lv.grid, 1, 2).cells.length === 1, '黄金：未联动的镜面单独翻转');
    ok(tapGrid(lv, lv.grid, 0, 2) === null, '黄金：点非镜面无效');
    ok(isMirror(lv.grid[1][2]), 'isMirror');
}

/* ── 6) buildLevel 防御 ── */

console.log('\n▶ buildLevel 防御');
function throws(fn, label) {
    try { fn(); ok(false, label, '未抛错'); } catch (e) { ok(true, label); }
}
throws(() => buildLevel({ e: [[9, 0, '>']] }), '越界抛错');
throws(() => buildLevel({ e: [[2, 2, '>']], k: [[2, 2]] }), '重叠抛错');
throws(() => buildLevel({ e: [[2, 2, '>']], m: [[3, 3, '/']], tap: [[0, 0]] }), '点非镜面抛错');
throws(() => buildLevel({ m: [[3, 3, '/'], [4, 4, '/']], g: [[[3, 3], [5, 5]]] }), '联动非镜面抛错');
throws(() => buildLevel({ m: [[3, 3, '/'], [4, 4, '/'], [5, 5, '/']], g: [[[3, 3], [4, 4]], [[4, 4], [5, 5]]] }), '一镜两组抛错');
throws(() => buildLevel({ m: [[3, 3, '/'], [4, 4, '/']], g: [[[3, 3], [4, 4]]], tap: [[3, 3], [4, 4]] }), '同组重复点击抛错');

console.log(failed === 0
    ? `\nverify-lumen-levels 全部通过 ✅（${passed} 项断言）`
    : `\n${failed} 个失败 ❌（通过 ${passed}）`);
process.exit(failed === 0 ? 0 : 1);
