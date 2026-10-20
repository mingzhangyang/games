#!/usr/bin/env node
// verify-lumen-session.mjs — Lumen 对局状态（model/session.js）的行为校验（node 直跑，无需浏览器）
//
// session 是盘面 / 光迹 / 点击数的唯一写入方，runtime 只消费它返回的事件。锁定：
//   1) 25 关 + 一个每日：按最优解逐个单元点击，恰好第 par 下通关、之前都没通关、星级 = 3；
//   2) tap 事件：联动组整组翻转、gained / newShadows 与前后光迹的差一致、点非镜面返回 null 且不计数；
//   3) reset 回到初盘；session 不改写关卡对象本身（重开 / 换关依赖这一点）；
//   4) starsFor 阈值：≤ par 三星、≤ par + 2 两星、其余一星。
//
// 用法：node tests/verify-lumen-session.mjs

import { LUMEN_LEVELS, dailyLevel, traceGrid } from '../src/games/lumen/model/levels.js';
import { GRID_N } from '../src/games/lumen/model/beam.js';
import { unitsOf } from '../src/games/lumen/model/solver.js';
import { PlaySession, starsFor } from '../src/games/lumen/model/session.js';

let failed = 0;
let passed = 0;
const ok = (cond, label, extra) => {
    if (cond) { passed++; return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};

/** 最优解：初盘与解态不同的单元，各点一下（点单元首格） */
function solutionTaps(level) {
    return unitsOf(level)
        .filter(cells => cells.some(idx => level.grid[Math.floor(idx / GRID_N)][idx % GRID_N]
            !== level.sol[Math.floor(idx / GRID_N)][idx % GRID_N]))
        .map(cells => [Math.floor(cells[0] / GRID_N), cells[0] % GRID_N]);
}

console.log('▶ 按最优解回放');
const daily = dailyLevel('20261020');
for (const level of [...LUMEN_LEVELS, daily]) {
    const tag = level.id;
    const frozen = JSON.stringify(level.grid);
    const s = new PlaySession(level);
    const taps = solutionTaps(level);
    ok(taps.length === level.par, `${tag} 最优解单元数 = par`, `${taps.length} vs ${level.par}`);
    taps.forEach(([r, c], i) => {
        const ev = s.tap(r, c);
        const last = i === taps.length - 1;
        ok(ev && ev.solved === last && s.solved === last, `${tag} 第 ${i + 1}/${taps.length} 下${last ? '通关' : '尚未通关'}`);
    });
    ok(s.flips === level.par && starsFor(s.flips, s.par) === 3, `${tag} par 下通关 = 三星`);
    ok(JSON.stringify(s.grid) === JSON.stringify(level.sol), `${tag} 回放终局 = 解态`);
    s.reset();
    ok(s.flips === 0 && JSON.stringify(s.grid) === frozen && !s.solved, `${tag} reset 回到初盘`);
    ok(JSON.stringify(level.grid) === frozen, `${tag} session 不改写关卡对象`);
}

console.log('▶ tap 事件');
{
    const level = LUMEN_LEVELS.find(lv => lv.links.length);
    const s = new PlaySession(level);
    const [first] = level.links[0];
    const r = Math.floor(first / GRID_N), c = first % GRID_N;
    const before = s.grid;
    const ev = s.tap(r, c);
    ok(ev.cells.length === level.links[0].length && ev.cells.every(idx => level.links[0].includes(idx)),
        `${level.id} 点联动镜：整组 ${level.links[0].length} 面一起翻`);
    ok(ev.before === before && ev.cells.every(idx => s.grid[Math.floor(idx / GRID_N)][idx % GRID_N]
        !== before[Math.floor(idx / GRID_N)][idx % GRID_N]), `${level.id} 事件带点击前盘面，组内每格都换了朝向`);
    ok(s.flips === 1, `${level.id} 一次点击只计 1 次`);
}
{
    // 每关逐个单元试点一下：事件里的增量必须与前后两次 traceGrid 的差完全一致
    let checked = 0;
    for (const level of LUMEN_LEVELS) {
        for (const cells of unitsOf(level)) {
            const s = new PlaySession(level);
            const prev = traceGrid(s.grid, level.split);
            const ev = s.tap(Math.floor(cells[0] / GRID_N), cells[0] % GRID_N);
            const next = traceGrid(s.grid, level.split);
            const gained = next.crystalLit.filter(i => !prev.crystalLit.includes(i));
            const shadows = next.shadowLit.filter(i => !prev.shadowLit.includes(i));
            if (JSON.stringify(ev.gained) !== JSON.stringify(gained)
                || JSON.stringify(ev.newShadows) !== JSON.stringify(shadows)
                || JSON.stringify(s.trace.crystalLit) !== JSON.stringify(next.crystalLit)) {
                ok(false, `${level.id} 单元 ${cells} 的 tap 事件与光迹差不一致`);
            }
            checked++;
        }
    }
    ok(checked > 100, `逐单元 tap 事件 = 光迹差（${checked} 次）`);
}
{
    const level = LUMEN_LEVELS[0];
    const s = new PlaySession(level);
    let empty = null;
    for (let i = 0; i < GRID_N * GRID_N && !empty; i++) {
        if (level.grid[Math.floor(i / GRID_N)][i % GRID_N] === '.') empty = [Math.floor(i / GRID_N), i % GRID_N];
    }
    ok(s.tap(...empty) === null && s.flips === 0, '点非镜面：返回 null、不计数');
}
{
    // 场外：(r, 9) 按 idx 算会回绕到下一行的 (r+1, 0)——挑一关让那一格恰好是镜面
    const level = LUMEN_LEVELS.find(lv => lv.grid.some((row, r) => r > 0 && '/\\'.includes(row[0])));
    const r = level.grid.findIndex((row, i) => i > 0 && '/\\'.includes(row[0])) - 1;
    const s = new PlaySession(level);
    ok(s.tap(r, GRID_N) === null && s.tap(-1, 0) === null && s.tap(GRID_N, 0) === null && s.flips === 0,
        `${level.id} 点场外：返回 null、不计数（不回绕到 (${r + 1},0)）`);
}

console.log('▶ 星级阈值');
ok(starsFor(4, 4) === 3 && starsFor(3, 4) === 3, '≤ par 三星');
ok(starsFor(5, 4) === 2 && starsFor(6, 4) === 2, '≤ par + 2 两星');
ok(starsFor(7, 4) === 1 && starsFor(40, 4) === 1, '> par + 2 一星');

console.log(failed === 0
    ? `\nverify-lumen-session 全部通过 ✅（${passed} 项断言）`
    : `\n${failed} 个失败 ❌（通过 ${passed}）`);
process.exit(failed === 0 ? 0 : 1);
