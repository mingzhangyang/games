#!/usr/bin/env node
// verify-sudoku-mist-daily.mjs — 雾隐九宫的每日题（离线，无需浏览器）
//
// 每日题在浏览器里由日期运行时生成（设计 §7.4），所以生成器的输出就是「已发布的内容」：
//   ① 黄金值：固定日期的种子与题面哈希、以及前 30 天的摘要哈希（在 ③ 里核对）冻结。改了出题逻辑、技巧梯或揭雾规则导致这里变红时，
//      必须升 GENERATOR_VERSION 并有意识地更新下面的 GOLDEN（否则已发布的每日题会全部变样）
//   ② 确定性：同一天生成两次逐字相同；相邻两天不同；日期键格式错误直接抛错
//   ③ 连续 DAYS 天：都能出题、不走兜底、唯一解、逐格路径在 T3 内走完、满足 daily 门槛
//   ④ 抽样对局：推理玩家（T3）按随机顺序从未卡死
//   ⑤ 耗时预算：Node 下 p95 ≤ BUDGET_P95_MS（实测约 130ms；预算留足并发校验时的余量）
//
// 用法：node tests/verify-sudoku-mist-daily.mjs
import { generateDaily, dailySeed, GENERATOR_VERSION, PROFILES, simulatePath } from '../src/games/sudoku-mist/model/generator.js';
import { prepareLevel } from '../src/games/sudoku-mist/model/session.js';
import { countSolutions } from '../src/games/sudoku-mist/model/brute.js';
import { parseGrid } from '../src/games/sudoku-mist/model/grid.js';
import { parseWindow } from '../src/games/sudoku-mist/model/fog.js';
import { hashStringFNV, mulberry32, todayKey } from '../src/platform/daily.js';
import { deducer } from './lib/sudoku-mist-bot.mjs';

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};

const DAYS = 60;
const PLAY_DAYS = 30;
const PLAY_RUNS = 5;
const BUDGET_P95_MS = 600;

// [日期, 种子, hashStringFNV(givens + window)] —— GENERATOR_VERSION 1
const GOLDEN = [
    ['20261101', 3924833818, 81817535],
    ['20261225', 2097405113, 1112371399],
    ['20270101', 1652220137, 2202647235],
    ['20270615', 143355372, 1781531454],
    ['20280229', 2181880302, 963705081],
];
// 2026-11-01 起连续 30 天的 givens + window 拼接后的 hashStringFNV：任何一天变了都会抓到
const DIGEST_30 = 2395691479;

const keyOf = ms => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};

/* ── ① 黄金值 ── */
console.log('▶ ① 黄金值');
ok(GENERATOR_VERSION === 1, 'GENERATOR_VERSION = 1（升版本时同步更新 GOLDEN）');
for (const [key, seed, hash] of GOLDEN) {
    const p = generateDaily(key);
    const got = [dailySeed(key), hashStringFNV(p.givens + p.window)];
    ok(got[0] === seed && got[1] === hash, `${key}：种子与题面哈希未变`, `got seed ${got[0]} hash ${got[1]}`);
}

/* ── ② 确定性 ── */
console.log('▶ ② 确定性');
{
    const a = generateDaily('20261101'), b = generateDaily('20261101'), c = generateDaily('20261102');
    ok(JSON.stringify(a) === JSON.stringify(b), '同一天生成两次逐字相同');
    ok(a.givens !== c.givens && a.id === 'daily-20261101', '相邻两天题目不同，id 带日期');
    let threw = 0;
    for (const bad of ['2026-11-01', '202611', '', undefined]) { try { generateDaily(bad); } catch { threw++; } }
    ok(threw === 4, '日期键必须是 YYYYMMDD');
    ok(/^\d{8}$/.test(todayKey(Date.UTC(2026, 10, 1, 20))) && todayKey(Date.UTC(2026, 10, 1, 20)) === '20261102',
        '运行时用 todayKey()（UTC+8）取日期：UTC 11-01 20:00 是 UTC+8 的 11-02');
}

/* ── ③ 连续 DAYS 天 ── */
console.log(`▶ ③ 连续 ${DAYS} 天`);
const times = [];
const puzzles = [];
let relaxed = 0, notUnique = 0, unsolved = 0, belowGate = 0;
const gate = PROFILES.daily.accept;
for (let n = 0; n < DAYS; n++) {
    const key = keyOf(Date.UTC(2026, 10, 1) + n * 86400000);
    const t0 = performance.now();
    const p = generateDaily(key);
    times.push(performance.now() - t0);
    puzzles.push(p);
    if (p.relaxed) relaxed++;
    const givens = parseGrid(p.givens);
    if (countSolutions(givens) !== 1) notUnique++;
    const path = simulatePath({ givens, solution: parseGrid(p.solution), visible0: parseWindow(p.window), cap: p.cap, reveal: p.reveal });
    if (!path.solved || path.stats.maxTier > p.cap) unsolved++;
    if (path.stats.bottlenecks < gate.minBottlenecks || path.stats.fogOnly < gate.minFogOnly) belowGate++;
}
ok(relaxed === 0, `${DAYS} 天都在门槛内出题，没有走兜底`, `${relaxed} 天兜底`);
ok(notUnique === 0 && unsolved === 0, `${DAYS} 天都唯一解、逐格路径在 T${PROFILES.daily.cap} 内走完`, `非唯一 ${notUnique}，走不完 ${unsolved}`);
ok(belowGate === 0, `${DAYS} 天都满足卡点 ≥ ${gate.minBottlenecks}、只能穿雾 ≥ ${gate.minFogOnly}`, `${belowGate} 天不达标`);
ok(new Set(puzzles.map(p => p.givens)).size === DAYS, `${DAYS} 天题目两两不同`);
{
    const digest = hashStringFNV(puzzles.slice(0, 30).map(p => p.givens + p.window).join(''));
    ok(digest === DIGEST_30, '前 30 天题面的摘要哈希未变（黄金值）', `got ${digest}`);
}

/* ── ④ 抽样对局 ── */
console.log('▶ ④ 抽样对局');
{
    let stuck = 0, runs = 0;
    for (const p of puzzles.slice(0, PLAY_DAYS)) {
        const lv = prepareLevel({ ...p, id: p.id });
        for (const interleave of [false, true]) {
            for (let k = 0; k < PLAY_RUNS; k++, runs++) {
                if (deducer(lv, mulberry32(k + 1), { cap: p.cap, interleave }).stuck) stuck++;
            }
        }
    }
    ok(stuck === 0, `${PLAY_DAYS} 天 × ${PLAY_RUNS} 遍 × 两种揭雾策略，推理玩家（T${PROFILES.daily.cap}）从未卡死`, `${stuck}/${runs} 遍卡死`);
}

/* ── ⑤ 耗时 ── */
console.log('▶ ⑤ 耗时');
{
    const sorted = times.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(DAYS / 2)], p95 = sorted[Math.floor(DAYS * 0.95)], max = sorted[DAYS - 1];
    ok(p95 <= BUDGET_P95_MS, `生成耗时 p50 ${p50.toFixed(0)}ms · p95 ${p95.toFixed(0)}ms · max ${max.toFixed(0)}ms（预算 p95 ≤ ${BUDGET_P95_MS}ms）`);
}

console.log(failed === 0 ? '\nverify-sudoku-mist-daily 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
