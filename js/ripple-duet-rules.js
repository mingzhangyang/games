/**
 * 涟漪双生 Ripple Duet — 内核
 *
 * 物理：同频（每关一个波长）柱面波线性叠加。每个源在 P 点留下复振幅
 *      A_s(P) = a_s · sqrt(r0 / r) · e^{i(φ_s − k·r)}      r = |P − 源|
 * 场就是各源复振幅之和；瞬时水面 u(P,t) = Re[A(P)·e^{iωt}] = re·cos(ωt) − im·sin(ωt)。
 * 判定只看**包络 |A|**（不随时间变），所以「平静」与「点亮」都是确定的。
 *
 * 玩法：可控源能改位置（格点）与相位（8 档）；风暴源固定不可控，只能对冲；
 * 防波堤用镜像源精确求解（无限长直线的一次镜像）。
 *   相消：两源到该点的波程差 = 半波长 且 相位反相 → |A| ≈ 0
 *   相长：波程差 = 整波长 且 相位同相 → |A| 最大
 *
 * 计分（asc）：cost = Σ 每个可控源（移动落位 1 次 + 相位档位步数）。
 * par 由 solvePar() 按「成本从小到大」分层穷举现算 —— 不手填。
 */

// 每日种子哈希与 PRNG 一律走 js/daily.js（verify-daily.mjs 强制收敛：
// js/ 下除 daily.js 外不许再出现哈希常数）。
import { hashStringFNV, mulberry32 } from './daily.js';

export const STAGE = { w: 560, h: 640 };

/* 几何：全部画在 canvas 里（没有浮动 DOM 动作钮 —— 舞台是 flex-row，
   正常流里塞不进控制台，absolute 又会盖住海面），所以 y 到 630 都能用。 */
export const SEA = { x: 20, y: 10, w: 520, h: 400 };
export const READOUT = { x: 20, y: 418, w: 520, h: 112 };
export const CONSOLE = { x: 20, y: 538, w: 520, h: 92 };

export const GRID = { cols: 9, rows: 7 };
export const PHASES = 8;
export const PHASE_STEP = (Math.PI * 2) / PHASES;
export const DAILY_COUNT = 5;

/* 阈值由 scratch/rd-probe2.mjs 实测标定（目标点上 504 种摆位的包络分布）：
   单源单独存在时某点最小包络 0.184 —— **一个源永远消不掉自己**，所以 calm 目标
   必须有风暴或第二个源；双源可精确到 0.0000。
   tol=0.05 → 约 2% 摆位达标；need=0.75 → 约 3%。看得见干涉图样就不算盲搜。 */
export const RULES = {
    r0: 14,          // 近场软化半径：源脚下不发散（真实柱面波衰减 1/√r）
    amp: 1,          // 源振幅单位
    calmTol: 0.05,   // 消波判定：包络 ≤ 它算平静
    blazeNeed: 0.75, // 点亮判定：包络 ≥ 它算点亮
    slack: 2,        // 2 星宽容：cost ≤ par + slack
};

export function K(lambda) {
    return (Math.PI * 2) / lambda;
}

export function gridX(i) {
    return SEA.x + ((i + 0.5) * SEA.w) / GRID.cols;
}

export function gridY(j) {
    return SEA.y + ((j + 0.5) * SEA.h) / GRID.rows;
}

/** 相位档位最小环形步数（8 档一圈） */
export function phaseSteps(from, to) {
    const d = Math.abs((((to - from) % PHASES) + PHASES) % PHASES);
    return Math.min(d, PHASES - d);
}

/** 点关于直线（两点式，按无限长直线处理 —— 镜像解精确，绘制时裁到海面）的镜像 */
export function mirrorPoint(x, y, w) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return { x, y };
    const t = ((x - w.x1) * dx + (y - w.y1) * dy) / len2;
    const px = w.x1 + t * dx;
    const py = w.y1 + t * dy;
    return { x: 2 * px - x, y: 2 * py - y };
}

/** 关卡 + 摆位 → 真实源列表（可控源 + 风暴源 + 各墙的一次镜像） */
export function emitters(level, place, k) {
    const out = [];
    const kk = k ?? K(level.lambda);
    (level.ctrl || []).forEach((src, idx) => {
        const p = (place && place[idx]) || src;
        out.push({
            x: gridX(p.i),
            y: gridY(p.j),
            ph: p.ph * PHASE_STEP,
            amp: RULES.amp * (src.amp ?? 1),
        });
    });
    (level.storms || []).forEach((s) => {
        out.push({ x: s.x, y: s.y, ph: (s.ph || 0) * PHASE_STEP, amp: RULES.amp * (s.amp ?? 1) });
    });
    const walls = level.walls || [];
    if (walls.length) {
        const base = out.slice();
        walls.forEach((w) => {
            base.forEach((s) => {
                const m = mirrorPoint(s.x, s.y, w);
                out.push({
                    x: m.x,
                    y: m.y,
                    ph: s.ph + (w.r < 0 ? Math.PI : 0),
                    amp: s.amp * Math.abs(w.r),
                });
            });
        });
    }
    out.k = kk;
    return out;
}

/** 某点的复振幅（re/im/mag）。list 由 emitters() 产出 */
export function fieldAt(list, x, y, k) {
    let re = 0;
    let im = 0;
    const kk = k ?? list.k;
    for (const s of list) {
        const dx = x - s.x;
        const dy = y - s.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        const a = s.amp * Math.sqrt(RULES.r0 / Math.max(r, RULES.r0));
        const ph = s.ph - kk * r;
        re += a * Math.cos(ph);
        im += a * Math.sin(ph);
    }
    return { re, im, mag: Math.sqrt(re * re + im * im) };
}

/** 目标采样点：点目标 1 个，航道按 n 段取中点 */
export function targetPoints(t) {
    if (t.kind === 'lane') {
        const n = t.n || 6;
        const pts = [];
        for (let s = 0; s < n; s++) {
            const u = (s + 0.5) / n;
            pts.push({ x: t.x1 + (t.x2 - t.x1) * u, y: t.y1 + (t.y2 - t.y1) * u });
        }
        return pts;
    }
    return [{ x: t.x, y: t.y }];
}

/**
 * 单个目标的读数。
 *  calm / lane：取采样点里**最大**包络（最不平的那点说了算），≤ tol 才算达标
 *  blaze：取采样点里**最小**包络（最暗的那点说了算），≥ need 才算达标
 */
export function measure(level, place, tIdx, k) {
    const t = level.targets[tIdx];
    const list = emitters(level, place, k);
    const kk = k ?? K(level.lambda);
    const pts = targetPoints(t);
    let worst = t.kind === 'blaze' ? Infinity : 0;
    let at = pts[0];
    for (const p of pts) {
        const m = fieldAt(list, p.x, p.y, kk).mag;
        if (t.kind === 'blaze') {
            if (m < worst) { worst = m; at = p; }
        } else if (m > worst) {
            worst = m;
            at = p;
        }
    }
    const need = t.kind === 'blaze' ? (t.need ?? RULES.blazeNeed) : (t.tol ?? RULES.calmTol);
    const ok = t.kind === 'blaze' ? worst >= need : worst <= need;
    return { kind: t.kind, value: worst, need, ok, at };
}

export function readouts(level, place, k) {
    return level.targets.map((_, i) => measure(level, place, i, k));
}

export function satisfied(level, place, k) {
    const kk = k ?? K(level.lambda);
    for (let i = 0; i < level.targets.length; i++) {
        if (!measure(level, place, i, kk).ok) return false;
    }
    return true;
}

/** 摆位代价（asc）：每个源「移动落位 1 次 + 相位环形步数」 */
export function costOf(level, place) {
    let c = 0;
    (level.ctrl || []).forEach((src, idx) => {
        const p = place[idx] || src;
        if (p.i !== src.i || p.j !== src.j) c += 1;
        c += phaseSteps(src.ph, p.ph);
    });
    return c;
}

/**
 * par：按成本从 0 开始分层穷举，第一个满足全部目标的摆位其 cost 即 par。
 * 分层让 par 小的关卡（绝大多数）几乎瞬间返回；无解返回 Infinity。
 */
export function solvePar(level) {
    const k = K(level.lambda);
    const srcs = level.ctrl || [];
    const n = srcs.length;
    if (n === 0) return { par: satisfied(level, [], k) ? 0 : Infinity, place: [] };

    // 每个源按 delta 分组：delta = 移动(0/1) + 相位步数
    const groups = srcs.map((src) => {
        const g = new Map();
        for (let i = 0; i < GRID.cols; i++) {
            for (let j = 0; j < GRID.rows; j++) {
                for (let ph = 0; ph < PHASES; ph++) {
                    const d = (i === src.i && j === src.j ? 0 : 1) + phaseSteps(src.ph, ph);
                    if (!g.has(d)) g.set(d, []);
                    g.get(d).push({ i, j, ph });
                }
            }
        }
        return g;
    });
    const maxD = Math.max(...groups.map((g) => Math.max(...g.keys())));

    const place = new Array(n);
    const ways = [];
    const splitWays = (idx, left, acc) => {
        if (idx === n) {
            if (left === 0) ways.push(acc.slice());
            return;
        }
        for (let d = 0; d <= Math.min(left, maxD); d++) {
            if (!groups[idx].has(d)) continue;
            acc.push(d);
            splitWays(idx + 1, left - d, acc);
            acc.pop();
        }
    };

    for (let cost = 0; cost <= maxD * n; cost++) {
        ways.length = 0;
        splitWays(0, cost, []);
        for (const w of ways) {
            const lists = w.map((d, idx) => groups[idx].get(d));
            const walk = (idx) => {
                if (idx === n) {
                    return satisfied(level, place, k) ? place.map((p) => ({ ...p })) : null;
                }
                for (const cand of lists[idx]) {
                    place[idx] = cand;
                    const hit = walk(idx + 1);
                    if (hit) return hit;
                }
                return null;
            };
            const found = walk(0);
            if (found) return { par: cost, place: found };
        }
    }
    return { par: Infinity, place: null };
}

export function starsForLevel(cost, par) {
    if (cost <= par) return 3;
    if (cost <= par + RULES.slack) return 2;
    return 1;
}

/* ── 每日赛程 ──────────────────────────────────────────────────────────
   每日只给 1 个可控源（单源谜题：移动 + 调相位去对冲风暴）——这样 par 能在
   客户端现场穷举 504 种摆位（<10ms），不必离线预算。多源留给 20 关。 */

function pick(rnd, arr) {
    return arr[Math.floor(rnd() * arr.length) % arr.length];
}

/** 在解摆位下扫描海面，找包络最小 / 最大的点（避开源附近） */
function scanExtreme(level, place, wantMax, k) {
    const list = emitters(level, place, k);
    let best = null;
    for (let y = SEA.y + 24; y < SEA.y + SEA.h - 24; y += 8) {
        for (let x = SEA.x + 24; x < SEA.x + SEA.w - 24; x += 8) {
            let near = false;
            for (const s of list) {
                if (Math.abs(s.x - x) < 46 && Math.abs(s.y - y) < 46) { near = true; break; }
            }
            if (near) continue;
            const m = fieldAt(list, x, y, k).mag;
            if (!best) best = { x, y, m };
            else if (wantMax ? m > best.m : m < best.m) best = { x, y, m };
        }
    }
    return best;
}

/**
 * 每日 5 皿：FNV-1a(dateKey) + mulberry32，确定性、全世界同一份。
 * 构造式出题：先抽一个「解摆位」，再按该摆位的场去安放目标（平静点取包络极
 * 小处、点亮处取包络极大处），因此必定有解；par 再用 solvePar 现算真值。
 */
export function dailyCourse(dateKey) {
    const rnd = mulberry32(hashStringFNV(`ripple-duet:${dateKey}`));
    const plan = [
        { storm: false, goals: 1 },
        { storm: true, goals: 1 },
        { storm: true, goals: 1 },
        { storm: true, goals: 2 },
        { storm: true, goals: 2 },
    ];
    const out = [];
    let guard = 0;
    while (out.length < DAILY_COUNT && guard++ < 400) {
        const step = plan[out.length];
        const lambda = pick(rnd, [64, 72, 80, 96]);
        const k = K(lambda);
        const src = { i: Math.floor(rnd() * GRID.cols), j: Math.floor(rnd() * GRID.rows), ph: Math.floor(rnd() * PHASES) };
        // 解摆位：一定与初始不同（否则 par=0，白送）
        const gi = Math.floor(rnd() * GRID.cols);
        const gj = Math.floor(rnd() * GRID.rows);
        let gph = Math.floor(rnd() * PHASES);
        if (gi === src.i && gj === src.j && gph === src.ph) gph = (gph + 3) % PHASES;
        const solvePlace = [{ i: gi, j: gj, ph: gph }];

        const storms = [];
        if (step.storm) {
            storms.push({
                x: SEA.x + 40 + rnd() * (SEA.w - 80),
                y: SEA.y + 40 + rnd() * (SEA.h - 80),
                ph: Math.floor(rnd() * PHASES),
                amp: 0.85 + rnd() * 0.3,
            });
        }

        // 无风暴时单源消不掉自己（最小包络 0.184），只出「点亮」；有风暴才出「抹平」
        const targets = [];
        if (!step.storm) {
            const blaze = scanExtreme({ lambda, ctrl: [src], storms, targets: [] }, solvePlace, true, k);
            if (!blaze) continue;
            targets.push({ kind: 'blaze', x: blaze.x, y: blaze.y, need: Math.max(0.6, blaze.m * 0.72) });
        } else {
            const calm = scanExtreme({ lambda, ctrl: [src], storms, targets: [] }, solvePlace, false, k);
            // 解摆位下必须真的接近零，否则 tol 会被放宽成白送
            if (!calm || calm.m > RULES.calmTol * 0.8) continue;
            targets.push({ kind: 'calm', x: calm.x, y: calm.y, tol: Math.max(RULES.calmTol, calm.m * 1.35) });
            if (step.goals >= 2 && rnd() < 0.6) {
                const blaze = scanExtreme({ lambda, ctrl: [src], storms, targets: [] }, solvePlace, true, k);
                if (!blaze) continue;
                targets.push({ kind: 'blaze', x: blaze.x, y: blaze.y, need: Math.max(0.6, blaze.m * 0.72) });
            }
        }

        const level = {
            id: `rd-d${out.length + 1}`,
            lambda,
            ctrl: [src],
            storms,
            targets,
            par: 0,
        };
        const solved = solvePar(level);
        if (!Number.isFinite(solved.par) || solved.par === 0) continue;   // 无解或白送 → 重抽
        level.par = solved.par;
        out.push(level);
    }
    return out;
}
