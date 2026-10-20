#!/usr/bin/env node
/**
 * 折光 Lumen：关卡候选生成器（设计工具，不参与运行时）。
 *
 * 旧版 25 关的通病：盘面上每面镜都是答案的一部分、水晶沿着答案光路摆放，
 * 「哪面镜让亮的水晶变多就点哪面」的贪心机器人能以 par 步通关全部 25 关。
 * 这个工具按 profile 随机「长」出光路，再加诱饵镜 / 暗晶 / 联动 / 分光镜，
 * 用 model/solver.js 全枚举解空间，只留下：
 *   - 最优解唯一（nearest = 1）
 *   - 每个单元都有戏份（idle = 0：初盘、解态或一步之遥时会被光碰到）
 *   - 至少一步必须「看不到进度也要点」（foresight ≥ 1）
 *   - 贪心机器人 par 步内通关率低
 * 打印成 levels.js 的 spec 字面量，人工挑选、写注释后放进 LEVEL_SPECS / DAILY_SPECS。
 * 发布后的关卡与本工具解耦：改生成器不会悄悄改掉已发布的关卡，
 * 关卡性质由 tests/verify-lumen-levels.mjs 锁定。
 *
 * 用法：node tools/generators/lumen-levels.mjs <profile> [count=6] [seedBase=1] [tries=4000] [--gentle]
 *   profile ∈ intro | mirror | shadow | link | split | all | daily
 *   --gentle  只看 foresight = 1 的候选，按分数升序（章节首关 / 教学关用）
 *   --json=<file>  另存全部候选（spec + 指标）供挑选脚本使用
 */
import fs from 'node:fs';
import { mulberry32 } from '../../src/platform/daily.js';
import { GRID_N, buildLevel, traceGrid } from '../../src/games/lumen/model/beam.js';
import {
    analyzeMasks, solveSpace, unitsOf, gridOfMask, popcount,
} from '../../src/games/lumen/model/solver.js';

const PROFILES = {
    intro: { minForesight: 0, emitters: [1, 1], path: [2, 3], decoys: [1, 2], split: [0, 0], links: [0, 0], shadows: [0, 0], crystals: [2, 3], walls: [0, 1], par: [1, 2] },
    mirror: { emitters: [1, 1], path: [3, 4], decoys: [3, 5], split: [0, 0], links: [0, 0], shadows: [0, 0], crystals: [3, 5], walls: [0, 3], par: [3, 4] },
    shadow: { shadowFirst: true, emitters: [1, 1], path: [3, 5], decoys: [3, 5], split: [0, 0], links: [0, 0], shadows: [2, 3], crystals: [2, 4], walls: [0, 2], par: [3, 5] },
    link: { emitters: [1, 1], path: [3, 5], decoys: [2, 4], split: [0, 0], links: [2, 2], shadows: [0, 2], crystals: [3, 5], walls: [0, 2], par: [3, 5] },
    split: { shadowFirst: true, emitters: [1, 1], path: [3, 4], decoys: [2, 4], split: [1, 2], links: [0, 0], shadows: [1, 3], crystals: [3, 6], walls: [0, 2], par: [3, 5] },
    all: { shadowFirst: true, emitters: [1, 2], path: [3, 4], decoys: [2, 4], split: [0, 2], links: [1, 2], shadows: [1, 3], crystals: [3, 6], walls: [0, 2], par: [4, 6] },
    daily: { shadowFirst: true, emitters: [1, 2], path: [3, 4], decoys: [3, 4], split: [0, 1], links: [1, 2], shadows: [1, 3], crystals: [3, 6], walls: [0, 2], par: [4, 6] },
};

const DIRS = '><v^';
const DR = [0, 0, 1, -1];
const DC = [1, -1, 0, 0];
const REFLECT = { '/': [3, 2, 1, 0], '\\': [2, 3, 0, 1] };
const inside = (r, c) => r >= 0 && r < GRID_N && c >= 0 && c < GRID_N;

function makeCandidate(profile, seed) {
    const rng = mulberry32(seed);
    const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const pick = arr => arr[Math.floor(rng() * arr.length)];
    const g = Array.from({ length: GRID_N }, () => Array(GRID_N).fill('.'));
    const path = new Set();       // 解态光路经过的格子（不许再放镜面，否则会改写已长好的光路）
    const emitters = [];
    const mirrors = [];           // { r, c, ch, din, decoy }

    const nE = ri(...profile.emitters);
    for (let e = 0; e < nE; e++) {
        for (let t = 0; t < 30; t++) {
            const side = ri(0, 3);
            const p = ri(1, GRID_N - 2);
            const [r, c, d] = side === 0 ? [0, p, 2] : side === 1 ? [GRID_N - 1, p, 3] : side === 2 ? [p, 0, 0] : [p, GRID_N - 1, 1];
            if (g[r][c] !== '.' || path.has(r * GRID_N + c)) continue;
            g[r][c] = DIRS[d];
            emitters.push({ r, c, d });
            break;
        }
    }
    if (emitters.length !== nE) return null;

    const totalPath = ri(...profile.path) + (nE - 1) * 2;
    let budget = totalPath;
    for (let ei = 0; ei < emitters.length; ei++) {
        const em = emitters[ei];
        const L = ei === emitters.length - 1 ? budget : Math.max(2, Math.floor(budget / 2));
        budget -= L;
        let { r, c, d } = em;
        for (let k = 0; k <= L; k++) {
            const runCells = [];
            let rr = r, cc = c;
            for (;;) {
                rr += DR[d]; cc += DC[d];
                if (!inside(rr, cc) || g[rr][cc] !== '.') break;
                runCells.push([rr, cc]);
            }
            if (k === L) {
                runCells.forEach(([a, b]) => path.add(a * GRID_N + b));
                break;
            }
            const usable = runCells.filter(([a, b], i) => i >= 1 && !path.has(a * GRID_N + b));
            if (!usable.length) return null;
            const [pr, pc] = pick(usable.slice(0, 5));
            const choices = ['/', '\\'].filter(ch => {
                const nd = REFLECT[ch][d];
                const a = pr + DR[nd] * 2, b = pc + DC[nd] * 2;
                return inside(a, b) && g[pr + DR[nd]][pc + DC[nd]] === '.';
            });
            if (!choices.length) return null;
            const ch = pick(choices);
            for (const [a, b] of runCells) {
                if (a === pr && b === pc) break;
                path.add(a * GRID_N + b);
            }
            path.add(pr * GRID_N + pc);
            g[pr][pc] = ch;
            mirrors.push({ r: pr, c: pc, ch, din: d, decoy: false });
            r = pr; c = pc; d = REFLECT[ch][d];
        }
    }

    // 诱饵镜：放在某面路径镜「翻错时」的去向上，让错误路线看起来也走得通
    const nDecoy = ri(...profile.decoys);
    for (let k = 0, guard = 0; k < nDecoy && guard < 60; guard++) {
        const host = pick(mirrors);
        const alt = REFLECT[host.ch === '/' ? '\\' : '/'][host.din];
        const cells = [];
        let rr = host.r, cc = host.c;
        for (;;) {
            rr += DR[alt]; cc += DC[alt];
            if (!inside(rr, cc) || g[rr][cc] !== '.') break;
            cells.push([rr, cc]);
        }
        const ok = cells.filter(([a, b]) => !path.has(a * GRID_N + b));
        if (!ok.length) continue;
        const [dr, dc] = pick(ok.slice(0, 5));
        const ch = rng() < 0.5 ? '/' : '\\';
        g[dr][dc] = ch;
        mirrors.push({ r: dr, c: dc, ch, din: alt, decoy: true });
        k++;
    }

    const empties = () => {
        const out = [];
        for (let a = 0; a < GRID_N; a++) for (let b = 0; b < GRID_N; b++) if (g[a][b] === '.') out.push([a, b]);
        return out;
    };
    const nWall = ri(...profile.walls);
    for (let k = 0; k < nWall; k++) {
        const cand = empties().filter(([a, b]) => !path.has(a * GRID_N + b));
        if (!cand.length) break;
        const [a, b] = pick(cand);
        g[a][b] = '#';
    }

    const pathMirrors = mirrors.filter(m => !m.decoy);
    const nSplit = Math.min(ri(...profile.split), pathMirrors.length - 1);
    const splitters = [];
    for (let k = 0; k < nSplit; k++) {
        const cand = pathMirrors.filter(m => !splitters.includes(m));
        splitters.push(pick(cand));
    }

    const nLinks = ri(...profile.links);
    const links = [];
    const free = mirrors.slice();
    for (let k = 0; k < nLinks && free.length >= 2; k++) {
        const size = free.length >= 4 && rng() < 0.3 ? 3 : 2;
        const group = [];
        for (let j = 0; j < size && free.length; j++) group.push(free.splice(Math.floor(rng() * free.length), 1)[0]);
        if (group.length >= 2) links.push(group);
    }

    const toSpec = (extra = {}) => ({
        e: emitters.map(e => [e.r, e.c, DIRS[e.d]]),
        m: mirrors.filter(m => !splitters.includes(m)).map(m => [m.r, m.c, m.ch]),
        s: splitters.map(m => [m.r, m.c, m.ch]),
        w: [],
        g: links.map(group => group.map(m => [m.r, m.c])),
        k: [], x: [],
        ...extra,
    });
    const walls = [];
    for (let a = 0; a < GRID_N; a++) for (let b = 0; b < GRID_N; b++) if (g[a][b] === '#') walls.push([a, b]);

    // 全枚举各状态的点亮格，用来挑「最能排除其他状态」的水晶与暗晶
    const bare = buildLevel(toSpec({ w: walls }));
    const units = unitsOf(bare);
    if (units.length > 12) return null;
    const size = 1 << units.length;
    const split = new Set(bare.split);
    const litOf = [];
    for (let m = 0; m < size; m++) litOf.push(traceGrid(gridOfMask(units, bare.sol, m), split).lit);
    const solHits = traceGrid(bare.sol, split).mirrorHits;
    if (pathMirrors.some(m => !solHits.includes(m.r * GRID_N + m.c))) return null;

    let remaining = [...Array(size).keys()];
    const crystals = [];
    const shadows = [];
    const placeCrystals = () => {
        const nK = ri(...profile.crystals);
        for (let k = 0; k < nK; k++) {
            const cand = empties().filter(([a, b]) => litOf[0][a * GRID_N + b]
                && crystals.every(([x, y]) => Math.max(Math.abs(x - a), Math.abs(y - b)) >= 2));
            if (!cand.length) break;
            let best = Infinity, bestCells = [];
            for (const [a, b] of cand) {
                const n = remaining.filter(m => litOf[m][a * GRID_N + b]).length;
                if (n < best) { best = n; bestCells = [[a, b]]; } else if (n === best) bestCells.push([a, b]);
            }
            const [a, b] = pick(bestCells);
            crystals.push([a, b]);
            g[a][b] = '*';
            remaining = remaining.filter(m => litOf[m][a * GRID_N + b]);
        }
    };
    const placeShadows = () => {
        const nX = ri(...profile.shadows);
        for (let k = 0; k < nX; k++) {
            const cand = empties().filter(([a, b]) => !litOf[0][a * GRID_N + b]
                && shadows.every(([x, y]) => Math.max(Math.abs(x - a), Math.abs(y - b)) >= 2));
            let best = 0, bestCells = [];
            for (const [a, b] of cand) {
                const n = remaining.filter(m => litOf[m][a * GRID_N + b]).length;
                if (n > best) { best = n; bestCells = [[a, b]]; } else if (n === best && n > 0) bestCells.push([a, b]);
            }
            if (!bestCells.length) break;
            const [a, b] = pick(bestCells);
            shadows.push([a, b]);
            g[a][b] = 'x';
            remaining = remaining.filter(m => !litOf[m][a * GRID_N + b]);
        }
    };
    if (profile.shadowFirst) { placeShadows(); placeCrystals(); } else { placeCrystals(); placeShadows(); }
    if (crystals.length < profile.crystals[0] || shadows.length < profile.shadows[0]) return null;

    const level = buildLevel(toSpec({ w: walls, k: crystals, x: shadows }));
    const space = solveSpace(level);
    const solved = [];
    for (let m = 0; m < space.size; m++) if (space.solved[m]) solved.push(m);

    // 挑初盘：par 合规 + 最优解唯一里，按难度打分取最好
    let best = null;
    for (let t = 0; t < 160; t++) {
        let from = 0;
        for (let i = 0; i < space.units.length; i++) if (rng() < 0.5) from |= 1 << i;
        if (space.solved[from]) continue;
        let dist = Infinity, nearest = [];
        for (const s of solved) {
            const d = popcount(s ^ from);
            if (d < dist) { dist = d; nearest = [s]; } else if (d === dist) nearest.push(s);
        }
        if (nearest.length !== 1 || dist < profile.par[0] || dist > profile.par[1]) continue;
        const target = nearest[0];
        const a = analyzeMasks(space, from, { runs: 48 });
        if (a.nearest !== 1 || a.idle > 0 || a.foresight < (profile.minForesight ?? 1)) continue;
        const linkUsed = level.links.length === 0
            || space.units.some((cells, i) => cells.length > 1 && ((from ^ target) & (1 << i)));
        if (!linkUsed) continue;
        const score = a.foresight * 3 + (1 - a.greedy.atPar) * 4 + (1 - a.greedy.within2) * 2 + a.par * 0.4;
        if (!best || score > best.score) best = { score, a, level, target, from };
    }
    if (!best) return null;
    const rebased = rebase(best.level, space.units, best.target, best.from);
    return { score: best.score, a: best.a, spec: specOf(rebased, toSpec, walls, crystals, shadows, space.units, best.target, best.from) };
}

/** 以唯一最优解为解态重写关卡，初盘 = 解态上点过 diff 的单元 */
function rebase(level, units, target, from) {
    const sol = gridOfMask(units, level.sol, target);
    const grid = gridOfMask(units, level.sol, from);
    return { ...level, sol, grid, par: popcount(target ^ from) };
}

function specOf(rebased, toSpec, walls, crystals, shadows, units, target, from) {
    const base = toSpec({ w: walls, k: crystals, x: shadows });
    const orient = ([r, c]) => rebased.sol[r][c];
    base.m = base.m.map(([r, c]) => [r, c, orient([r, c])]);
    base.s = base.s.map(([r, c]) => [r, c, orient([r, c])]);
    base.tap = [];
    units.forEach((cells, i) => {
        if ((target ^ from) & (1 << i)) base.tap.push([Math.floor(cells[0] / GRID_N), cells[0] % GRID_N]);
    });
    return base;
}

function lit(spec) {
    const parts = [];
    for (const key of ['e', 'm', 's', 'k', 'x', 'w', 'g', 'tap']) {
        const v = spec[key];
        if (!v || !v.length) continue;
        parts.push(`${key}: ${JSON.stringify(v).replace(/"/g, "'")}`);
    }
    return `{ ${parts.join(', ')} }`;
}

function show(level) {
    const splitSet = new Set(level.split);
    const linkOf = new Map();
    level.links.forEach((g, i) => g.forEach(idx => linkOf.set(idx, 'ABCD'[i])));
    const fmt = grid => grid.map((row, r) => [...row].map((ch, c) => {
        const idx = r * GRID_N + c;
        if (splitSet.has(idx)) return ch === '/' ? '%' : '&';
        return ch;
    }).join(' '));
    const links = level.sol.map((row, r) => [...row].map((_, c) => linkOf.get(r * GRID_N + c) || '·').join(' '));
    const a = fmt(level.grid), b = fmt(level.sol);
    return a.map((row, i) => `   ${row}   │   ${b[i]}   │   ${links[i]}`).join('\n');
}

const GENTLE = process.argv.includes('--gentle');
const JSON_OUT = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
const [profileName = 'mirror', countArg = '6', seedArg = '1', triesArg = '4000'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const profile = PROFILES[profileName];
if (!profile) {
    console.error(`unknown profile ${profileName}; use one of ${Object.keys(PROFILES).join(', ')}`);
    process.exit(1);
}
const found = [];
for (let seed = Number(seedArg); seed < Number(seedArg) + Number(triesArg); seed++) {
    const cand = makeCandidate(profile, seed);
    if (cand) found.push({ seed, ...cand });
}
if (GENTLE) {
    const gentle = found.filter(f => f.a.foresight === 1 && f.a.greedy.atPar < 0.6);
    found.length = 0;
    found.push(...gentle.sort((x, y) => x.score - y.score));
} else {
    found.sort((x, y) => y.score - x.score);
}
console.log(`${profileName}: ${found.length} candidates from ${triesArg} seeds`);
if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify(found.map(f => ({
        seed: f.seed, score: f.score, spec: f.spec,
        par: f.a.par, units: f.a.units, foresight: f.a.foresight,
        atPar: f.a.greedy.atPar, within2: f.a.greedy.within2, solutions: f.a.solutions,
    }))));
}
for (const f of found.slice(0, Number(countArg))) {
    const a = f.a;
    const level = buildLevel(f.spec);
    console.log(`\n── seed ${f.seed} · score ${f.score.toFixed(2)} · par ${a.par} · units ${a.units} · foresight ${a.foresight}`
        + ` · greedy@par ${(a.greedy.atPar * 100).toFixed(0)}% · greedy@par+2 ${(a.greedy.within2 * 100).toFixed(0)}%`
        + ` · solutions ${a.solutions}`);
    console.log('   initial                  │   solution                 │   links');
    console.log(show(level));
    console.log('   ' + lit(f.spec));
}
