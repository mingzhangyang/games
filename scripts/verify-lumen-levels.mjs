#!/usr/bin/env node
// verify-lumen-levels.mjs — Lumen 关卡数据校验器（node 直跑，无需浏览器）
//
// 锁定四件事：
//   1) 20 手工关卡：解态可解（全水晶点亮）、初盘不可解、par = 翻转数 ∈ [1,6]；
//   2) 16 每日池布局：解态可解、镜面数 ≥3（打乱才有意义）；
//   3) dailyLevel 全日期扫描（2026-01-01 → 2027-12-31）：确定性、par ≥2、
//      初盘 ≠ 解态、解态可解、初盘不可解，且 16 布局全覆盖；
//   4) 反射表黄金断言（'/' 与 '\' 的四向反射、墙/发射器挡光、环路防死循环）
//      与 buildGrid 的越界/重叠/非法翻转抛错。
//
// 用法：node scripts/verify-lumen-levels.mjs

import {
    GRID_N, buildGrid, traceGrid,
    LUMEN_LEVELS, DAILY_POOL, dailyLevel,
} from '../js/lumen-levels.js';

let failed = 0;
let passed = 0;
const ok = (cond, label, extra) => {
    if (cond) { passed++; console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};

/* ── 1) 手工关卡 ── */

console.log('▶ 20 手工关卡');
ok(LUMEN_LEVELS.length === 20, `关卡数 = 20（实际 ${LUMEN_LEVELS.length}）`);

for (const lv of LUMEN_LEVELS) {
    const tag = `L${lv.index + 1}`;
    const solT = traceGrid(lv.sol);
    const iniT = traceGrid(lv.grid);
    ok(solT.crystalCount >= 1 && solT.crystalCount <= 6, `${tag} 水晶数 1..6`, String(solT.crystalCount));
    ok(solT.solved, `${tag} 解态点亮全部水晶`);
    ok(!iniT.solved, `${tag} 初盘不可解`);
    ok(lv.par >= 1 && lv.par <= 6, `${tag} par ∈ [1,6]`, String(lv.par));
    ok(JSON.stringify(lv.grid) !== JSON.stringify(lv.sol), `${tag} 初盘 ≠ 解态`);
    // 初盘与解态的差异格数 = par（buildGrid 在导入期已校验 flip 都是镜面，这里复核）
    let diff = 0;
    for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
            if (lv.grid[r][c] !== lv.sol[r][c]) diff++;
        }
    }
    ok(diff === lv.par, `${tag} 初盘与解态差异格数 = par`, `${diff} vs ${lv.par}`);
    let emitters = 0;
    for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
            if ('><v^'.includes(lv.sol[r][c])) emitters++;
        }
    }
    ok(emitters >= 1 && emitters <= 2, `${tag} 发射器 1..2`, String(emitters));
}

/* ── 2) 每日池 ── */

console.log('\n▶ 16 每日池布局');
ok(DAILY_POOL.length === 16, `布局数 = 16（实际 ${DAILY_POOL.length}）`);
DAILY_POOL.forEach((def, i) => {
    const t = traceGrid(def.sol);
    ok(t.solved, `D${i + 1} 解态点亮全部水晶`);
    ok(def.mirrors.length >= 3, `D${i + 1} 镜面数 ≥3`, String(def.mirrors.length));
});

/* ── 3) dailyLevel 全日期扫描 ── */

console.log('\n▶ dailyLevel 全日期扫描（2026-01-01 → 2027-12-31）');
const usedLayouts = new Set();
let sweep = 0;
let detFail = 0;
const start = Date.UTC(2026, 0, 1);
const end = Date.UTC(2027, 11, 31);
for (let ts = start; ts <= end; ts += 86400000) {
    const d = new Date(ts);
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const lv = dailyLevel(key);
    const again = dailyLevel(key);
    sweep++;
    usedLayouts.add(lv.layout);
    if (JSON.stringify(lv) !== JSON.stringify(again)) detFail++;
    if (lv.par < 2) { failed++; console.error(`✗ daily ${key} par ≥2 —— ${lv.par}`); }
    if (JSON.stringify(lv.grid) === JSON.stringify(lv.sol)) { failed++; console.error(`✗ daily ${key} 初盘 ≠ 解态`); }
    if (!traceGrid(lv.sol).solved) { failed++; console.error(`✗ daily ${key} 解态可解`); }
    if (traceGrid(lv.grid).solved) { failed++; console.error(`✗ daily ${key} 初盘不可解`); }
    if (lv.dateKey !== key) { failed++; console.error(`✗ daily ${key} dateKey 回传不一致`); }
}
ok(detFail === 0, 'dailyLevel 确定性（731 天两次生成全一致）', `${detFail} 天漂移`);
ok(sweep === 730, `扫描天数 = 730（实际 ${sweep}）`);
ok(usedLayouts.size === 16, '16 布局全覆盖', `实际 ${usedLayouts.size}`);
console.log(`  （扫描 ${sweep} 天，命中布局：${[...usedLayouts].sort((a, b) => a - b).join(',')}）`);

/* ── 4) 反射表黄金断言 ── */

console.log('\n▶ 反射表黄金断言');
function withCells(cells) {
    const g = Array.from({ length: GRID_N }, () => Array(GRID_N).fill('.'));
    for (const [r, c, ch] of cells) g[r][c] = ch;
    return g.map(row => row.join(''));
}

{
    const g = withCells([[4, 0, '>'], [4, 2, '/'], [0, 2, '*']]);
    const t = traceGrid(g);
    ok(t.solved, "黄金：'>' + '/' 向上折，点亮 (0,2)");
    ok(t.rays[0].pts.some(([r, c]) => r === 3 && c === 2), '黄金：光路上行经过 (3,2)');
}
{
    const g = withCells([[4, 0, '>'], [4, 2, '\\'], [8, 2, '*']]);
    ok(traceGrid(g).solved, "黄金：'>' + '\\' 向下折，点亮 (8,2)");
}
{
    const g = withCells([[0, 4, 'v'], [4, 4, '/'], [4, 1, '*']]);
    ok(traceGrid(g).solved, "黄金：'v' + '/' 向左折，点亮 (4,1)");
    const g2 = withCells([[8, 4, '^'], [5, 4, '\\'], [5, 1, '*']]);
    ok(traceGrid(g2).solved, "黄金：'^' + '\\' 向左折，点亮 (5,1)");
}
{
    const g = withCells([[4, 0, '>'], [4, 2, '#'], [4, 5, '*']]);
    ok(!traceGrid(g).solved, '黄金：墙挡光，水晶不亮');
    const g2 = withCells([[4, 0, '>'], [4, 3, '^'], [4, 6, '*']]);
    ok(!traceGrid(g2).solved, '黄金：发射器挡光，水晶不亮');
}
{
    // 四镜矩形回环：必须终止且不 hang（'>' 右行 → '\' 下行 → '/' 左行 → '\' 上行 → '/' 回环）
    const g = withCells([[2, 0, '>'], [2, 6, '\\'], [6, 6, '/'], [6, 2, '\\'], [2, 2, '/']]);
    const t0 = Date.now();
    const t = traceGrid(g);
    ok(Date.now() - t0 < 1000, '黄金：环路防死循环（traceGrid 终止）');
    ok(t.crystalCount === 0 && !t.solved, '黄金：无水晶 → 永不解（仅终止性）');
}
{
    // 双束交叉互不干扰：'>' 折向下点亮 (2,4)，'^' 折向左穿过同一列
    const g = withCells([[0, 0, '>'], [8, 8, '^'], [0, 4, '\\'], [4, 8, '/'], [2, 4, '*']]);
    ok(traceGrid(g).solved, '黄金：双束交叉，水晶点亮');
}

/* ── 5) buildGrid 防御 ── */

console.log('\n▶ buildGrid 防御');
function throws(fn, label) {
    try {
        fn();
        ok(false, label, '未抛错');
    } catch (e) {
        ok(true, label);
    }
}
throws(() => buildGrid({ e: [[9, 0, '>']] }), 'buildGrid 越界抛错');
throws(() => buildGrid({ e: [[2, 2, '>']], k: [[2, 2]] }), 'buildGrid 重叠抛错');
throws(() => buildGrid({ e: [[2, 2, '>']], m: [[3, 3, '/']], flip: [[0, 0]] }), 'buildGrid 非法翻转抛错');

console.log(failed === 0
    ? `\nverify-lumen-levels 全部通过 ✅（${passed} 项断言）`
    : `\n${failed} 个失败 ❌（通过 ${passed}）`);
process.exit(failed === 0 ? 0 : 1);
