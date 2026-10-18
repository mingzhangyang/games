#!/usr/bin/env node
// verify-sudoku-mist-levels.mjs — 雾隐九宫的关卡可玩性（离线，无需浏览器）
//
//   ① 数据：id 唯一、章节存在、双语名字、cap / reveal 合法、题面与视野串格式正确
//   ② 题面无冲突且唯一解
//   ③ 出题器的逐格路径在关卡 cap 内能走完（最高档位 ≤ cap）
//   ④ 永不卡死（设计 §7.3）：随机落子及交错手动揭雾，任何未完成状态都有合法推进动作
//   ⑤ 雾真的在起作用：「穿雾」章每一遍都会遇到只能穿雾的局面，且比「初雾」章多
//   ⑥ 计分在奖励推理：贪分玩家 ≥ 随机推理玩家的均分，远高于瞎猜玩家
//   ⑦ 星级：levels.js 的阈值 = starThresholds() 复算值；贪分玩家拿得到 ★3，瞎猜玩家拿不到 ★2
//
// 改了关卡（tools/generators/sudoku-mist-levels.mjs --write）或技巧梯 / 揭雾 / 计分之后重跑。
// 用法：node tests/verify-sudoku-mist-levels.mjs
import { CHAPTERS, LEVELS } from '../src/games/sudoku-mist/model/levels.js';
import { prepareLevel } from '../src/games/sudoku-mist/model/session.js';
import { generate, simulatePath } from '../src/games/sudoku-mist/model/generator.js';
import { REVEAL_KERNELS } from '../src/games/sudoku-mist/model/fog.js';
import { MAX_TIER } from '../src/games/sudoku-mist/model/techniques.js';
import { countSolutions } from '../src/games/sudoku-mist/model/brute.js';
import { isConsistent } from '../src/games/sudoku-mist/model/grid.js';
import { mulberry32 } from '../src/platform/daily.js';
import { starsFor } from '../src/games/sudoku-mist/model/scoring.js';
import { deducer, greedy, guesser, starThresholds } from './lib/sudoku-mist-bot.mjs';

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};
const RUNS = 120;
const GUESS_RUNS = 12;
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

/* ── ① 数据 ── */
console.log('▶ ① 数据');
const chapterIds = new Set(CHAPTERS.map(c => c.id));
ok(CHAPTERS.length >= 2 && CHAPTERS.every(c => c.name.en && c.name.zh), `${CHAPTERS.length} 章，名字双语`);
ok(new Set(LEVELS.map(l => l.id)).size === LEVELS.length, `${LEVELS.length} 关 id 唯一`);
for (const ch of CHAPTERS) ok(LEVELS.filter(l => l.chapter === ch.id).length === 4, `「${ch.name.zh}」章 4 关`);
for (const l of LEVELS) {
    ok(chapterIds.has(l.chapter) && l.name.en && l.name.zh && l.cap >= 1 && l.cap <= MAX_TIER && REVEAL_KERNELS.includes(l.reveal)
        && /^[1-9.]{81}$/.test(l.givens) && /^[01]{81}$/.test(l.window)
        && Array.isArray(l.stars) && l.stars.length === 2 && l.stars.every(Number.isInteger) && l.stars[0] > 0 && l.stars[0] < l.stars[1],
    `${l.id}：字段合法（cap ${l.cap}、${l.reveal} 核）`);
}

const byChapter = {};
for (const level of LEVELS) {
    console.log(`▶ ${level.id}「${level.name.zh}」`);
    const lv = prepareLevel(level);

    /* ── ② 题面 ── */
    ok(isConsistent(lv.givens) && countSolutions(lv.givens) === 1, '题面无冲突、唯一解');

    /* ── ③ 出题路径 ── */
    const path = simulatePath({ givens: lv.givens, solution: lv.solution, visible0: lv.visible0, cap: level.cap, reveal: level.reveal });
    ok(path.solved && path.stats.maxTier <= level.cap, `逐格路径在 T${level.cap} 内走完（${path.stats.steps} 步，卡点 ${path.stats.bottlenecks}，只能穿雾 ${path.stats.fogOnly}）`);

    /* ── ④ 永不卡死 ── */
    let stuck = 0, fogHit = 0;
    const fogOnly = [], scores = [];
    for (let k = 0; k < RUNS; k++) {
        const r = deducer(lv, mulberry32(0x5d0c + k), { cap: level.cap });
        const mixed = deducer(lv, mulberry32(0x5d0c + k), { cap: level.cap, interleave: true });
        if (mixed.stuck) stuck++;
        if (r.stuck) { stuck++; continue; }
        if (r.fogOnly > 0) fogHit++;
        fogOnly.push(r.fogOnly);
        scores.push(r.summary.score);
    }
    ok(stuck === 0, `推理玩家（T${level.cap}）随机顺序 + 交错揭雾各 ${RUNS} 遍从未卡死`, `${stuck} 遍卡死`);
    (byChapter[level.chapter] ||= []).push({ fogHit: fogHit / RUNS, fogOnly: mean(fogOnly) });

    /* ── ⑥ 计分 ── */
    const g = greedy(lv);
    const guessScores = Array.from({ length: GUESS_RUNS }, (_, k) => guesser(lv, mulberry32(0x6e55 + k)).summary);
    const deducerMean = mean(scores), guessMean = mean(guessScores.map(s => s.score));
    ok(!g.stuck && g.summary.luck === 0 && g.summary.score >= deducerMean,
        `贪分玩家 ${g.summary.score} ≥ 随机推理玩家均分 ${deducerMean.toFixed(0)}`);
    ok(guessMean * 10 < deducerMean && guessScores.every(s => s.mistakes > 0),
        `瞎猜玩家均分 ${guessMean.toFixed(0)}（平均填错 ${mean(guessScores.map(s => s.mistakes)).toFixed(0)} 次）远低于推理玩家`);

    /* ── ⑦ 星级 ── */
    const stars = starThresholds(level);
    ok(stars[0] === level.stars[0] && stars[1] === level.stars[1],
        `星级阈值 [${level.stars}] = 复算值（改了计分或关卡就重跑 sudoku-mist-levels --write）`, `复算 [${stars}]`);
    ok(starsFor(g.summary.score, level.stars) === 3 && guessScores.every(s => starsFor(s.score, level.stars) === 1),
        `贪分玩家 ★3（${g.summary.score} ≥ ${level.stars[1]}），瞎猜玩家只有 ★1`);
}

ok(starsFor(null, [1, 2]) === 0 && starsFor(500, undefined) === 0 && starsFor(0, [10, 20]) === 1
    && starsFor(10, [10, 20]) === 2 && starsFor(20, [10, 20]) === 3, 'starsFor：未通关 / 无阈值 0 星，0 分通关 1 星，阈值含等号');

/* ── ⑤ 雾在起作用 ── */
console.log('▶ ⑤ 雾');
const thin = byChapter.thin || [], through = byChapter.through || [];
ok(thin.every(l => l.fogHit >= 0.8), `「初雾」每关 ≥ 80% 的对局遇到只能穿雾的局面（${thin.map(l => `${(l.fogHit * 100).toFixed(0)}%`).join(' / ')}）`);
ok(through.every(l => l.fogHit === 1 && l.fogOnly >= 5), `「穿雾」每关每一遍都要穿雾、平均 ≥ 5 次（${through.map(l => l.fogOnly.toFixed(1)).join(' / ')}）`);
ok(mean(through.map(l => l.fogOnly)) > mean(thin.map(l => l.fogOnly)), '「穿雾」章比「初雾」章更依赖穿雾');

// The shipped chapters stop at T2; also exercise generated free-play puzzles through T4.
for (const profile of ['first', 'through', 'deep']) {
    let stuck = 0, runs = 0;
    for (const seed of [1, 42, 20261018, 0xffffffff]) {
        const lv = prepareLevel(generate(seed, profile));
        for (const interleave of [false, true]) {
            for (let k = 0; k < 10; k++, runs++) {
                if (deducer(lv, mulberry32(seed + k), { cap: lv.cap, interleave }).stuck) stuck++;
            }
        }
    }
    ok(stuck === 0, `自由局 ${profile}：${runs} 条随机落子/交错揭雾路径无死局`, `${stuck} 条卡死`);
}

console.log(failed === 0 ? '\nverify-sudoku-mist-levels 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
