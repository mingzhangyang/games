#!/usr/bin/env node
// verify-sudoku-mist-model.mjs — 雾隐九宫的规则模型（离线，无需浏览器）
//
//   ① 网格表：27 个单元各 9 格、每格 3 个单元 20 个同伴；串 ⇄ 盘面；popcount
//   ② 回溯求解器：唯一解 / 多解计数 / 随机终盘合法且由种子决定
//   ③ 技巧梯：每条技巧一个正例 + 一个反例（人工构造的候选状态）
//   ④ 闭包：随机题与雾中局面上推出的数字全都等于终盘、真值候选从未被排除（可靠性）；
//      各技巧在语料里都真的用到过；档位 = 能推出该格的最小 t（逐档重跑核对）
//   ⑤ 计分公式（设计 §5.2 / §5.3）
//   ⑥ 对局：填错退回扣分（不低于 0）、落子揭雾（box / cross 两种核）、穿雾 ×1.5、侥幸 0 分、点灯 0 分、通关统计
//   ⑦ 确定性：同一关卡 + 同一输入序列 = 同一结果（replay）
//   ⑧ 信息隔离：view() 里雾中格不带任何数字（设计 §9.3）
//
// 用法：node tests/verify-sudoku-mist-model.mjs
import {
    CELLS, UNITS, PEERS, CELL_UNITS, ALL, bit, popcount, digitsOf, parseGrid, formatGrid, isConsistent,
} from '../src/games/sudoku-mist/model/grid.js';
import { countSolutions, solve, randomSolution } from '../src/games/sudoku-mist/model/brute.js';
import {
    TECHNIQUES, MAX_TIER, analyze, createState, stateFromCandidates, applyTechnique,
} from '../src/games/sudoku-mist/model/techniques.js';
import { revealArea, parseWindow, formatWindow, knowledgeOf } from '../src/games/sudoku-mist/model/fog.js';
import {
    BASE_POINTS, FOG_MULTIPLIER, WRONG_PENALTY, streakMultiplier, placementPoints,
} from '../src/games/sudoku-mist/model/scoring.js';
import { createSession, prepareLevel, replay } from '../src/games/sudoku-mist/model/session.js';
import { LEVELS } from '../src/games/sudoku-mist/model/levels.js';
import { mulberry32 } from '../src/platform/daily.js';
import { deducer } from './lib/sudoku-mist-bot.mjs';

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};
const mask = (...ds) => ds.reduce((m, d) => m | bit(d), 0);
const blank = () => stateFromCandidates(new Int8Array(CELLS), new Uint16Array(CELLS).fill(ALL));
const drop = (s, cells, ...ds) => { for (const i of cells) s.cand[i] &= ~mask(...ds); };
const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
const lacks = (s, cells, d) => cells.every(i => !(s.cand[i] & bit(d)));
const has = (s, cells, d) => cells.every(i => !!(s.cand[i] & bit(d)));

// 一道公认唯一解的经典题（Wikipedia「Sudoku」条目示例）
const CLASSIC = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const CLASSIC_SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

/* ── ① 网格表 ── */
console.log('▶ ① 网格表');
ok(UNITS.length === 27 && UNITS.every(u => u.length === 9 && new Set(u).size === 9), '27 个单元，各 9 个不同格子');
ok(CELL_UNITS.every((us, i) => us.length === 3 && us.every(u => UNITS[u].includes(i))), '每格恰属 3 个单元');
ok(PEERS.every((p, i) => p.length === 20 && !p.includes(i)), '每格 20 个同伴、不含自身');
ok(formatGrid(parseGrid(CLASSIC)) === CLASSIC, '串 ⇄ 盘面往返一致');
ok(range(0, 512).every(m => popcount(m) === digitsOf(m).length), 'popcount 与逐位计数一致（0..511）');
ok(isConsistent(parseGrid(CLASSIC)) && !isConsistent(parseGrid('55' + '.'.repeat(79))), '冲突检测');

/* ── ② 回溯求解器 ── */
console.log('▶ ② 回溯求解器');
ok(countSolutions(parseGrid(CLASSIC)) === 1, '经典题唯一解');
ok(formatGrid(solve(parseGrid(CLASSIC))) === CLASSIC_SOLUTION, '经典题解正确');
ok(countSolutions(new Int8Array(CELLS)) === 2, '空盘计数到上限 2 即停');
{
    const invalid = parseGrid('55' + CLASSIC_SOLUTION.slice(2));
    ok(!isConsistent(invalid) && countSolutions(invalid) === 0 && solve(invalid) === null,
        '即使是完整终盘，同行重复的 5 也绝不视为解');
    let rejected = false;
    try { prepareLevel({ id: 'invalid', givens: invalid, window: '1'.repeat(CELLS) }); }
    catch { rejected = true; }
    ok(rejected, 'prepareLevel 拒绝冲突终盘');
}
{
    const a = randomSolution(mulberry32(42)), b = randomSolution(mulberry32(42)), c = randomSolution(mulberry32(43));
    ok(a.every(d => d >= 1 && d <= 9) && isConsistent(a), '随机终盘填满且合法');
    ok(formatGrid(a) === formatGrid(b) && formatGrid(a) !== formatGrid(c), '随机终盘由种子决定');
}

/* ── ③ 技巧梯：正例 + 反例 ── */
console.log('▶ ③ 技巧梯');
{
    ok(TECHNIQUES.map(t => t.tier).every((t, k, arr) => k === 0 || arr[k - 1] <= t) && MAX_TIER === 4, '技巧按档位升序排列，最高 T4');

    const row8 = new Int8Array(CELLS);
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((d, j) => { row8[j] = d; });
    const s1 = createState(row8);
    const placed = [];
    ok(applyTechnique('fullHouse', s1, (i, d, via, u) => placed.push([i, d, via, u])) === 1 && s1.values[8] === 9,
        'fullHouse：行内只剩一格 → 填缺的数字', JSON.stringify(placed));
    const row7 = Int8Array.from(row8); row7[7] = 0;
    ok(applyTechnique('fullHouse', createState(row7)) === 0, 'fullHouse 反例：剩两格不动');

    const s2 = blank(); drop(s2, UNITS[18].filter(i => i !== 10), 5);
    ok(applyTechnique('hiddenSingleBox', s2) === 1 && s2.values[10] === 5, 'hiddenSingleBox：宫内 5 只剩一个位置');
    const s2n = blank(); drop(s2n, UNITS[18].filter(i => i !== 10 && i !== 20), 5);
    ok(applyTechnique('hiddenSingleBox', s2n) === 0, 'hiddenSingleBox 反例：两个位置不动');

    const s3 = blank(); drop(s3, UNITS[3].filter(i => i !== 31), 7);
    ok(applyTechnique('hiddenSingleBox', s3) === 0, 'hiddenSingleLine 的局面里宫内唯一推不出（档位分得开）');
    const s3u = [];
    ok(applyTechnique('hiddenSingleLine', s3, (i, d, via, u) => s3u.push(u)) === 1 && s3.values[31] === 7 && s3u[0] === 3,
        'hiddenSingleLine：第 4 行里 7 只剩一个位置');

    const s4 = blank(); s4.cand[40] = mask(6);
    ok(applyTechnique('hiddenSingleLine', s4) === 0 && applyTechnique('nakedSingle', s4) === 1 && s4.values[40] === 6,
        'nakedSingle：只剩一个候选（隐性唯一推不出）');

    const s5 = blank(); drop(s5, UNITS[18].filter(i => i !== 0 && i !== 1), 4);
    ok(applyTechnique('pointing', s5) > 0 && lacks(s5, range(3, 9), 4) && has(s5, [27, 36], 4),
        'pointing（行）：宫内 4 全在第 1 行 → 该行宫外排除 4');
    const s5c = blank(); drop(s5c, UNITS[18].filter(i => i !== 0 && i !== 9), 4);
    ok(applyTechnique('pointing', s5c) > 0 && lacks(s5c, [27, 36, 45, 54, 63, 72], 4) && has(s5c, range(3, 9), 4),
        'pointing（列）：宫内 4 全在第 1 列 → 该列宫外排除 4');
    const s5n = blank(); drop(s5n, UNITS[18].filter(i => i !== 0 && i !== 10), 4);
    ok(applyTechnique('pointing', s5n) === 0, 'pointing 反例：不同行不同列不动');

    const s6 = blank(); drop(s6, UNITS[0].filter(i => i !== 0 && i !== 2), 4);
    ok(applyTechnique('claiming', s6) > 0 && lacks(s6, [9, 10, 11, 18, 19, 20], 4) && has(s6, [27], 4),
        'claiming：第 1 行的 4 全在第 1 宫 → 该宫其余两行排除 4');
    const s6n = blank(); drop(s6n, UNITS[0].filter(i => i !== 0 && i !== 3), 4);
    ok(applyTechnique('claiming', s6n) === 0, 'claiming 反例：跨宫不动');

    const s7 = blank(); s7.cand[0] = s7.cand[1] = mask(1, 2);
    applyTechnique('nakedPair', s7);
    ok(lacks(s7, [...range(2, 9), 9, 10, 11, 18, 19, 20], 1) && lacks(s7, range(2, 9), 2) && has(s7, [27], 1),
        'nakedPair：{1,2}{1,2} → 同行同宫排除 1、2');
    const s7n = blank(); s7n.cand[0] = mask(1, 2); s7n.cand[1] = mask(1, 3);
    ok(applyTechnique('nakedPair', s7n) === 0, 'nakedPair 反例：{1,2}{1,3} 不动');

    const s8 = blank(); drop(s8, range(2, 9), 1, 2);
    ok(applyTechnique('hiddenPair', s8) > 0 && s8.cand[0] === mask(1, 2) && s8.cand[1] === mask(1, 2),
        'hiddenPair：1、2 只能在两格 → 两格只留 1、2');
    const s8n = blank(); drop(s8n, range(2, 9).filter(i => i !== 5), 1); drop(s8n, range(2, 9), 2);
    ok(applyTechnique('hiddenPair', s8n) === 0, 'hiddenPair 反例：1 有三个位置不动');

    const s9 = blank(); s9.cand[0] = mask(1, 2); s9.cand[3] = mask(2, 3); s9.cand[6] = mask(1, 3);
    ok(applyTechnique('nakedPair', s9) === 0, 'nakedTriple 的局面里数对推不出（档位分得开）');
    applyTechnique('nakedTriple', s9);
    ok([1, 2, 3].every(d => lacks(s9, [1, 2, 4, 5, 7, 8], d)) && has(s9, [27], 1), 'nakedTriple：{1,2}{2,3}{1,3} → 同行排除 1、2、3');
    const s9n = blank(); s9n.cand[0] = mask(1, 2); s9n.cand[3] = mask(2, 3); s9n.cand[6] = mask(1, 4);
    ok(applyTechnique('nakedTriple', s9n) === 0, 'nakedTriple 反例：并集 4 个数字不动');

    const s10 = blank(); drop(s10, [1, 2, 3, 5, 6, 7], 1, 2, 3);
    ok(applyTechnique('hiddenPair', s10) === 0 && applyTechnique('hiddenTriple', s10) > 0
        && [0, 4, 8].every(i => s10.cand[i] === mask(1, 2, 3)), 'hiddenTriple：1、2、3 只能在三格 → 三格只留 1、2、3');
    const s10n = blank(); drop(s10n, [1, 2, 3, 5, 7], 1, 2, 3); drop(s10n, [6], 2, 3);
    ok(applyTechnique('hiddenTriple', s10n) === 0, 'hiddenTriple 反例：位置并集 4 格不动');

    const xw = [11, 16, 20, 25, 29, 34, 47, 52, 56, 61, 65, 70, 74, 79];
    const s11 = blank(); drop(s11, [...UNITS[0], ...UNITS[4]].filter(i => ![2, 7, 38, 43].includes(i)), 1);
    ok(applyTechnique('pointing', s11) === 0 && applyTechnique('claiming', s11) === 0, 'X-Wing 的局面里区块排除推不出（档位分得开）');
    ok(applyTechnique('xWing', s11) === xw.length && lacks(s11, xw, 1) && has(s11, [2, 7, 38, 43], 1),
        'X-Wing：1 在第 1、5 行都只剩第 3、8 列 → 这两列其余格排除 1');
    const s11n = blank(); drop(s11n, [...UNITS[0], ...UNITS[4]].filter(i => ![2, 7, 38, 43, 44].includes(i)), 1);
    ok(applyTechnique('xWing', s11n) === 0, 'X-Wing 反例：第 5 行有三个位置不动');
}

/* ── ④ 闭包：可靠性 / 覆盖 / 档位最小性 ── */
console.log('▶ ④ 闭包');
{
    const rng = mulberry32(2026);
    const corpus = [];
    for (let n = 0; n < 80; n++) {
        const solution = randomSolution(rng);
        const g = Int8Array.from(solution);
        const order = range(0, CELLS);
        for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
        // 挖到 cap 4 闭包解不动为止：题面足够少，T3 / T4 才会真的出场
        for (const i of order) { const d = g[i]; g[i] = 0; if (!analyze(g, { cap: 4 }).solved) g[i] = d; }
        corpus.push({ known: g, solution });
    }
    // 雾中局面：关卡开局 + 推理玩家走到一半
    for (const level of LEVELS) {
        const lv = prepareLevel(level);
        corpus.push({ known: createSession(lv).knowledge(), solution: lv.solution });
        const half = deducer(lv, mulberry32(7)).session;
        const inputs = half.inputs.slice(0, 20);
        corpus.push({ known: replay(lv, inputs).knowledge(), solution: lv.solution });
    }
    const used = {};
    let unsound = 0, minimalityChecked = 0, notMinimal = 0;
    for (const { known, solution } of corpus) {
        const a = analyze(known, { cap: 4 });
        for (const id in a.used) used[id] = (used[id] || 0) + a.used[id];
        for (let i = 0; i < CELLS; i++) {
            if (a.values[i] && a.values[i] !== solution[i]) unsound++;
            if (!a.values[i] && !(a.cand[i] & bit(solution[i]))) unsound++;
        }
        if (minimalityChecked < 40) {
            minimalityChecked++;
            const byCap = [null, 1, 2, 3, 4].map(cap => cap && analyze(known, { cap }));
            for (let i = 0; i < CELLS; i++) {
                const t = a.tierOf[i];
                if (!t) continue;
                if (!byCap[t].values[i] || (t > 1 && byCap[t - 1].values[i] !== 0 && !known[i])) notMinimal++;
            }
        }
        if (a.broken) unsound++;
    }
    ok(unsound === 0, `${corpus.length} 个局面：推出的数字全等于终盘，真值候选从未被排除`, `${unsound} 处不可靠`);
    // T4 在随机题里本来就少见：T1–T3 每条都要出场，T4 至少出场一条（三条各自由 ③ 的正例 / 反例锁住）
    const missing = TECHNIQUES.filter(t => t.tier < 4).map(t => t.id).filter(id => !used[id]);
    const t4 = TECHNIQUES.filter(t => t.tier === 4).some(t => used[t.id]);
    ok(missing.length === 0 && t4, `语料里 T1–T3 每条技巧、T4 至少一条产生过改动（${TECHNIQUES.map(t => `${t.id}×${used[t.id] || 0}`).join(' ')}）`,
        `未出场：${missing.join(', ') || 'T4'}`);
    ok(notMinimal === 0, `${minimalityChecked} 个局面：tierOf = 只用 ≤ t 档就能推出的最小 t`, `${notMinimal} 处不符`);
}

/* ── ⑤ 计分 ── */
console.log('▶ ⑤ 计分');
ok(BASE_POINTS[1] === 10 && BASE_POINTS[2] === 20 && BASE_POINTS[3] === 40 && BASE_POINTS[4] === 80, '基础分 10 / 20 / 40 / 80');
ok(streakMultiplier(1) === 1 && Math.abs(streakMultiplier(6) - 1.5) < 1e-12 && streakMultiplier(11) === 2 && streakMultiplier(30) === 2,
    '连推乘数 1 + 0.1 × min(n − 1, 10)');
ok(placementPoints({ tier: 2, intoFog: true, streak: 3 }) === Math.round(20 * FOG_MULTIPLIER * 1.2), '单步分 = round(基础 × 穿雾 × 连推)');
ok(placementPoints({ tier: 0, intoFog: true, streak: 5 }) === 0 && placementPoints({ tier: 4, intoFog: true, streak: 9, hinted: true }) === 0,
    '侥幸与点灯都是 0 分');

/* ── ⑥ 对局 ── */
console.log('▶ ⑥ 对局');
{
    ok(revealArea(40, 'box').length === 9 && revealArea(40, 'cross').length === 5 && revealArea(0, 'cross').join() === '0,1,9',
        '揭雾核：box = 3×3，cross = 十字（边角截断）');
    ok(formatWindow(parseWindow(LEVELS[0].window)) === LEVELS[0].window, '视野串往返一致');

    for (const level of LEVELS.filter((l, k, arr) => arr.findIndex(m => m.reveal === l.reveal) === k)) {
        const lv = prepareLevel(level);
        const s = createSession(lv);
        const a = s.analysis();
        // 开局视野里只有题面数字（没有可见空格），第一步一定落在雾里
        const first = a.order.find(i => !s.isKnown(i));
        ok(first !== undefined && !s.isVisible(first), `${level.id}：开局第一处可推格在雾里`);
        const wrongDigit = lv.solution[first] % 9 + 1;
        const w = s.place(first, wrongDigit);
        ok(w.ok && !w.correct && s.score === 0 && w.penalty === 0 && !s.isKnown(first) && !s.isVisible(first) && s.summary().mistakes === 1,
            `${level.id}：填错退回（雾不散）、扣分不低于 0、记一次失误`);
        ok(!s.place(-1, 3).ok && !s.place(first, 10).ok && s.summary().mistakes === 1, `${level.id}：非法输入被拒、不记失误`);

        const fogBefore = revealArea(first, level.reveal).filter(j => !s.isVisible(j));
        const r = s.place(first, lv.solution[first]);
        const expected = placementPoints({ tier: a.tierOf[first], intoFog: true, streak: 1 });
        ok(r.correct && r.intoFog && r.points === expected && r.tier === a.tierOf[first] && s.isKnown(first),
            `${level.id}：穿雾推理落子按档位 ×${FOG_MULTIPLIER} 计分（T${r.tier} = ${r.points}）`);
        ok(fogBefore.length > 0 && r.revealed.join() === fogBefore.join() && revealArea(first, level.reveal).every(j => s.isVisible(j)),
            `${level.id}：落子揭开 ${level.reveal} 核里的雾（${r.revealed.length} 格）`);
        ok(!s.place(first, lv.solution[first]).ok, `${level.id}：已确定的格子不能再落子`);

        // 一路推理下去，直到出现可推的可见空格：它的落子不乘穿雾
        let checkedOpen = false;
        for (let n = 0; n < 40 && !checkedOpen && !s.done; n++) {
            const a2 = s.analysis();
            const open = a2.order.find(i => !s.isKnown(i) && s.isVisible(i));
            const cell = open ?? a2.order.find(i => !s.isKnown(i));
            const expect = placementPoints({ tier: a2.tierOf[cell], intoFog: open === undefined, streak: s.streak + 1 });
            const r2 = s.place(cell, lv.solution[cell]);
            if (open !== undefined) {
                checkedOpen = true;
                ok(!r2.intoFog && r2.points === expect && r2.streak >= 2, `${level.id}：揭开后的可见空格落子不乘穿雾、连推累加（×${(1 + 0.1 * (r2.streak - 1)).toFixed(1)}）`);
            } else if (r2.points !== expect) {
                ok(false, `${level.id}：穿雾落子分数`, `${r2.points} ≠ ${expect}`);
            }
        }
        ok(checkedOpen, `${level.id}：揭雾后会出现可推的可见空格`);
    }

    // 侥幸：开局推不出的格子，猜对也是 0 分并清零连推
    {
        const lv = prepareLevel(LEVELS[0]);
        const s = createSession(lv);
        const a = s.analysis();
        const first = a.order.find(i => !s.isKnown(i));
        s.place(first, lv.solution[first]);
        const a2 = s.analysis();
        const lucky = range(0, CELLS).find(i => !s.isKnown(i) && !a2.tierOf[i]);
        const before = s.score;
        const r = s.place(lucky, lv.solution[lucky]);
        ok(r.correct && r.luck && r.points === 0 && s.streak === 0 && s.score === before, '侥幸落子 0 分、连推清零');
        const target = range(0, CELLS).find(i => !s.isKnown(i));
        ok(!s.place(target, 0).ok, '数字 0 是非法输入');
        const scored = s.score;
        const w = s.place(target, lv.solution[target] % 9 + 1);
        ok(scored > 0 && !w.correct && w.penalty === Math.min(WRONG_PENALTY, scored) && s.score === scored - w.penalty,
            `有分时填错扣 ${WRONG_PENALTY}（${scored} → ${s.score}）`);
    }

    // 点灯：给出档位最低的一格；照着落子 0 分
    {
        const lv = prepareLevel(LEVELS[4]);
        const s = createSession(lv);
        const h = s.hint();
        const a = s.analysis();
        ok(h && h.cell === a.order.find(i => !s.isKnown(i)) && h.digit === lv.solution[h.cell] && h.tier === Math.min(...a.order.filter(i => !s.isKnown(i)).map(i => a.tierOf[i])),
            '点灯指向闭包里最先推出的格（档位最低）');
        const r = s.place(h.cell, h.digit);
        ok(r.hinted && r.points === 0 && s.summary().hintsUsed === 1 && s.summary().hintPlaced === 1, '照着点灯落子 0 分，计入点灯次数');
    }

    // 通关统计
    {
        const run = deducer(LEVELS[1], mulberry32(5));
        const sm = run.summary;
        const lv = prepareLevel(LEVELS[1]);
        const placedCells = new Set(run.session.log.filter(e => e.correct).map(e => e.cell));
        const visibleGivenPlaced = range(0, CELLS).some(i => lv.visible0[i] && lv.givens[i] && placedCells.has(i));
        ok(!run.stuck && sm.done && placedCells.size === sm.placements && !visibleGivenPlaced
            && range(0, CELLS).every(i => placedCells.has(i) || lv.givens[i]),
        `通关：每个空格都由玩家落子，开局可见的题面数字从不需要落子（${sm.placements} 次落子）`);
        ok(sm.byTier[1] + sm.byTier[2] + sm.byTier[3] + sm.byTier[4] + sm.luck + sm.hintPlaced === sm.placements && sm.luck === 0 && sm.score > 0,
            '通关统计：各档 + 侥幸 + 点灯 = 落子数；推理玩家没有侥幸');
    }
}

// 回归：顺序改变导致雾中题面被提前揭开，不能因此丢失它本可触发的揭雾。
{
    const visible0 = new Uint8Array(CELLS).fill(1);
    for (const i of [3, 4, 5, 6, 30, 31]) visible0[i] = 0;
    const givens = parseGrid(CLASSIC_SOLUTION);
    const lv = { id: 'order-regression', givens, solution: Int8Array.from(givens), visible0, cap: 2, reveal: 'cross' };
    const s = createSession(lv);
    ok(!s.isCharged(0) && !s.activate(0).ok, '开局可见的题面不可二次揭雾');
    const first = s.place(6, 9);
    const options = analyze(s.knowledge(), { cap: 2 }).order.filter(i => !s.isKnown(i));
    ok(first.correct && first.revealed.includes(5) && s.isCharged(5) && s.cell(5).revealReady
        && options.length === 0 && !s.done, 'Copilot 顺序复现：先填 6 号格后没有可推格，但保留了 5 号题面的揭雾机会');
    const hint = s.hint();
    ok(hint?.action === 'activate' && hint.cell === 5, '无可推格时点灯指向可激活的题面');
    const activated = s.activate(5);
    ok(activated.ok && activated.revealed.includes(4) && !s.isCharged(5) && !s.activate(5).ok,
        '题面只可主动揭雾一次，并传播新的待激活题面');
    let steps = 0;
    while (!s.done && steps++ < CELLS * 2) {
        const a = analyze(s.knowledge(), { cap: 2 });
        const next = a.order.find(i => !s.isKnown(i));
        if (next !== undefined) s.place(next, a.values[next]);
        else {
            const ready = Array.from({ length: CELLS }, (_, i) => i).find(i => s.isCharged(i));
            if (ready === undefined) break;
            s.activate(ready);
        }
    }
    const played = replay(lv, s.inputs);
    ok(s.done && played.done && JSON.stringify(played.summary()) === JSON.stringify(s.summary())
        && JSON.stringify(played.view()) === JSON.stringify(s.view()),
    '先填 6 号格的合法顺序可以通关，主动揭雾连同点灯可被确定性回放');
}

/* ── ⑦ 确定性 ── */
console.log('▶ ⑦ 确定性');
{
    const lv = prepareLevel(LEVELS[5]);
    const rng = mulberry32(99);
    const s = createSession(lv);
    // 混合输入：推理落子、填错、点灯、侥幸
    for (let n = 0; !s.done && n < 400; n++) {
        const roll = rng();
        const unknown = range(0, CELLS).filter(i => !s.isKnown(i));
        if (roll < 0.1) s.hint();
        else if (roll < 0.25) { const i = unknown[Math.floor(rng() * unknown.length)]; s.place(i, Math.floor(rng() * 9) + 1); }
        else {
            const a = s.analysis();
            const opts = a.order.filter(i => !s.isKnown(i));
            const i = opts.length ? opts[Math.floor(rng() * opts.length)] : unknown[0];
            s.place(i, lv.solution[i]);
        }
    }
    const again = replay(LEVELS[5], s.inputs);
    ok(s.done && JSON.stringify(again.summary()) === JSON.stringify(s.summary()) && JSON.stringify(again.log) === JSON.stringify(s.log),
        `同一输入序列（${s.inputs.length} 步，含填错 / 点灯 / 侥幸）回放结果逐项相同`);
    const partial = replay(LEVELS[5], s.inputs.slice(0, 30));
    ok(!partial.done && JSON.stringify(partial.view()) === JSON.stringify(replay(LEVELS[5], s.inputs.slice(0, 30)).view()), '中途回放（每日局续玩）结果相同');
}

/* ── ⑧ 信息隔离 ── */
console.log('▶ ⑧ 信息隔离');
{
    let leaks = 0, checked = 0;
    for (const level of LEVELS) {
        const lv = prepareLevel(level);
        const s = createSession(lv);
        const views = [s.view()];
        const run = deducer(lv, mulberry32(3)).session;
        const mid = replay(lv, run.inputs.slice(0, 15));
        views.push(mid.view());
        for (const v of views) {
            for (const c of v) {
                checked++;
                if (c.state === 'fog' && (Object.keys(c).length !== 1 || 'digit' in c)) leaks++;
            }
        }
        const k0 = s.knowledge();
        const visibleGivens = [...lv.visible0].filter((v, i) => v && lv.givens[i]).length;
        ok(views[0].filter(c => c.digit).length === visibleGivens && k0.filter(Boolean).length === visibleGivens
            && knowledgeOf(lv.givens, lv.visible0, new Int8Array(CELLS)).join() === k0.join(),
        `${level.id}：开局只暴露 ${visibleGivens} 个可见题面数字`);
    }
    ok(leaks === 0, `${checked} 个格子视图：雾中格只有 { state: 'fog' }`, `${leaks} 处泄露`);
}

console.log(failed === 0 ? '\nverify-sudoku-mist-model 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
